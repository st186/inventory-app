// Backup & Restore (owner only). A backup is a locked (encrypted) copy of every record in the app
// plus the list of logins, made by the server: every night to Google Drive, or on demand as a
// file. Restoring writes records back under their original IDs (the old page re-added them as new
// records, which made duplicates), always after a dry run, and saves a safety copy of anything it
// replaces. Server side: supabase/functions/make-server-c2dd9b9d/backup.ts.
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Cloud, Download, FileSearch, FolderOpen, Info, Lock, RotateCcw, ShieldCheck } from 'lucide-react';
import { InventoryContextType } from '../App';
import { formatDateTimeIST } from '../utils/timezone';
import { saveFile } from '../utils/saveFile';
import {
  applyRestore, downloadFullBackup, getBackupStatus, parseBackupFile, planRestore, runDriveBackupNow, verifyBackupFile,
  type ApplyResult, type BackupStatus, type ParsedBackup, type PlanResult, type VerifyResult,
} from '../utils/backupApi';
import { Button } from './ui/button';
import { Checkbox } from './ui/checkbox';
import { IconWell, ListGroup, ListRow } from './ui/list-row';
import { StatusChip } from './ui/status-chip';
import { SegmentedControl } from './ui/segmented-control';
import { Callout } from './ui/callout';
import { EmptyState } from './ui/empty-state';
import { ErrorState } from './ui/error-state';
import { Skeleton } from './ui/skeleton';
import { confirm } from './ui/confirm';
import { cn } from './ui/utils';
import { SetupPage } from './setup/SetupPage';

type Props = {
  context: InventoryContextType;
};

type Busy = null | 'download' | 'drive' | 'verify' | 'plan' | 'apply';
type Note = { where: 'drive' | 'download' | 'file' | 'restore'; kind: 'ok' | 'error'; text: string };

// Plain names for the record types (key prefixes) the owner chooses from when restoring.
const LABELS: Record<string, string> = {
  'sales:': 'Daily sales', 'sales_data_': 'Sales (old format)', 'online_sales:': 'Online sales', 'item-sales:': 'Item sales',
  'inventory:': 'Purchases', 'overhead:': 'Overhead expenses', 'fixedcost:': 'Fixed costs', 'inventory_item_': 'Item catalogue',
  'custom-item:': 'Custom items', 'custom-category:': 'Custom categories', 'stock-thresholds:': 'Stock alert levels',
  'unified-employee:': 'Employees', 'employee:': 'Employees (old format)', 'archived-employee:': 'Archived employees',
  'timesheet:': 'Timesheets', 'leave:': 'Leaves', 'payout:': 'Salary payouts', 'salary_advance:': 'Salary advances',
  'attendance-employee:': 'Attendance', 'attendance-manager:': 'Attendance (managers)',
  'store:': 'Stores', 'production_house_': 'Production houses', 'production:': 'Production logs',
  'production_request_': 'Production requests', 'stock_request_': 'Stock requests', 'production-cash:': 'Production cash',
  'production-ledger:': 'Production ledger', 'production-ledger-item:': 'Production ledger items', 'stock-out:': 'Out of stock log',
  'stock-wastage:': 'Wastage', 'cash-topup:': 'Cash top-ups', 'investor:': 'Investors', 'online-loan:': 'Online loans',
  'online-cash-recalibration:': 'Paytm recalibrations', 'aggregator-settlement:': 'Swiggy / Zomato settlements',
  'rider-trip:': 'Rider trips', 'rider-profile:': 'Rider profiles', 'rider-place:': 'Pinned places', 'delivery-photo:': 'Receipt photos',
  'notification:': 'Notifications', 'store-calendar:': 'Festival calendar', 'growth-idea:': 'Growth ideas',
  'push_subscription:': 'Notification sign-ups (web)', 'fcm_token:': 'Notification sign-ups (phone)', 'restore-log:': 'Restore history',
};
const labelOf = (prefix: string) => LABELS[prefix] || prefix.replace(/[:_-]+$/, '').replace(/[_-]/g, ' ');

const fmtBytes = (n?: number | null) => {
  if (!n && n !== 0) return '-';
  if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
};
const fmtNum = (n?: number | null) => (n ?? 0).toLocaleString('en-IN');
const errorText = (e: unknown) => (e instanceof Error ? e.message : String(e));

function NoteBox({ note }: { note: Note | null }) {
  if (!note) return null;
  const ok = note.kind === 'ok';
  return (
    <Callout tone={ok ? 'success' : 'danger'} live>
      <span className="whitespace-pre-line">{note.text}</span>
    </Callout>
  );
}

function Progress({ text }: { text: string }) {
  if (!text) return null;
  return <p className="num text-body-sm text-text-2" aria-live="polite">{text}</p>;
}

function Card({ icon, title, chip, children }: { icon: Parameters<typeof IconWell>[0]['icon']; title: string; chip?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-lg border border-border bg-surface p-4 lg:p-5" aria-label={title}>
      <div className="flex items-center gap-3">
        <IconWell icon={icon} />
        <h2 className="min-w-0 flex-1 text-subtitle font-semibold text-text">{title}</h2>
        {chip}
      </div>
      {children}
    </section>
  );
}

export function BackupRestore({ context }: Props) {
  const isOwner = context.user?.role === 'cluster_head';
  const [status, setStatus] = useState<BackupStatus | null>(null);
  const [statusError, setStatusError] = useState('');
  const [busy, setBusy] = useState<Busy>(null);
  const [progress, setProgress] = useState('');
  const [note, setNote] = useState<Note | null>(null);
  const [file, setFile] = useState<{ name: string; parsed: ParsedBackup } | null>(null);
  const [verify, setVerify] = useState<VerifyResult | null>(null);
  const [plan, setPlan] = useState<PlanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [mode, setMode] = useState<'missing-only' | 'overwrite'>('missing-only');
  const [applied, setApplied] = useState<ApplyResult | null>(null);

  const loadStatus = useCallback(async () => {
    try {
      setStatus(await getBackupStatus());
      setStatusError('');
    } catch (e) {
      setStatusError(errorText(e));
    }
  }, []);
  useEffect(() => { if (isOwner) loadStatus(); }, [isOwner, loadStatus]);

  // Runs one action at a time and keeps its message under the right card.
  const run = async (what: Exclude<Busy, null>, where: Note['where'], work: () => Promise<string | void>) => {
    setBusy(what);
    setNote(null);
    setProgress('');
    try {
      const text = await work();
      if (text) setNote({ where, kind: 'ok', text });
    } catch (e) {
      setNote({ where, kind: 'error', text: errorText(e) });
    } finally {
      setBusy(null);
      setProgress('');
    }
  };

  const downloadNow = () => run('download', 'download', async () => {
    const { blob, fileName, rows } = await downloadFullBackup((r, b) => setProgress(`${fmtNum(r)} records read, ${fmtBytes(b)} so far…`));
    setProgress('Saving the file…');
    await saveFile(fileName, blob, 'application/octet-stream');
    loadStatus();
    return `Saved ${fileName} (${fmtNum(rows)} records, ${fmtBytes(blob.size)}). On the phone it is in Downloads › Bunny Momos.\nIt opens only with the backup passphrase, so it is safe to keep a copy in Drive or on a pen drive.`;
  });

  const driveNow = () => run('drive', 'drive', async () => {
    const result = await runDriveBackupNow((r, b) => setProgress(`${fmtNum(r)} records sent, ${fmtBytes(b)} so far…`));
    await loadStatus();
    return `Backed up to Google Drive: ${result?.fileName || ''} (${fmtNum(result?.rows)} records, ${fmtBytes(result?.bytes)}).`;
  });

  const pickFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const chosen = e.target.files?.[0];
    e.target.value = '';
    setVerify(null); setPlan(null); setApplied(null); setSelected(new Set()); setNote(null);
    if (!chosen) return;
    try {
      setFile({ name: chosen.name, parsed: parseBackupFile(await chosen.arrayBuffer()) });
    } catch (err) {
      setFile(null);
      setNote({ where: 'file', kind: 'error', text: errorText(err) });
    }
  };

  const checkFile = () => file && run('verify', 'file', async () => {
    const result = await verifyBackupFile(file.parsed, (d, t) => setProgress(`Checking part ${Math.min(d + 1, t)} of ${t}…`));
    setVerify(result);
    if (!result.ok) throw new Error(`This file has problems:\n• ${result.problems.join('\n• ')}`);
    return `The file is good: it opens, every part matches its checksum, and it holds ${fmtNum(result.manifest.totalRows)} records and ${result.manifest.authUsers} logins.`;
  });

  const makePlan = () => file && run('plan', 'restore', async () => {
    setApplied(null);
    const result = await planRestore(file.parsed, (d, t) => setProgress(`Comparing part ${Math.min(d + 1, t)} of ${t} with today's data…`));
    setPlan(result);
    setSelected(new Set());
  });

  const rows = useMemo(() => Object.entries(plan?.prefixes || {})
    .map(([prefix, n]) => ({ prefix, label: labelOf(prefix), ...n }))
    .sort((a, b) => (b.missing + b.changed) - (a.missing + a.changed) || a.label.localeCompare(b.label)), [plan]);
  const chosenRows = rows.filter((r) => selected.has(r.prefix));
  const willAdd = chosenRows.reduce((n, r) => n + r.missing, 0);
  const willReplace = mode === 'overwrite' ? chosenRows.reduce((n, r) => n + r.changed, 0) : 0;

  const toggle = (prefix: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(prefix)) next.delete(prefix); else next.add(prefix);
    return next;
  });

  const summary = selected.size === 0
    ? 'Tick the kinds of record to restore.'
    : `This will put back ${fmtNum(willAdd)} missing records${mode === 'overwrite' ? ` and replace ${fmtNum(willReplace)} changed records` : ''} in ${selected.size} kind${selected.size === 1 ? '' : 's'} of record.`;

  const applyNow = () => file && plan && run('apply', 'restore', async () => {
    const result = await applyRestore(file.parsed, plan, { prefixes: [...selected], mode, confirm: 'RESTORE' },
      (d, t) => setProgress(`Restoring part ${Math.min(d + 1, t)} of ${t}… keep this screen open`));
    setApplied(result);
    loadStatus();
    context.refreshData().catch(() => {});
    return `Restore finished: ${fmtNum(result.added)} records put back, ${fmtNum(result.overwritten)} replaced.` +
      (result.snapshots.length ? `\nThe records it replaced were saved first (safety copy ${result.snapshots[0].split(':').slice(0, 2).join(':')}).` : '') +
      `\nRestore log: restore-log:${result.run}. Screens refresh in a moment; balances worked out from other records update the next time those records are saved.`;
  });

  // Typed confirmation before anything is written.
  const confirmRestore = async () => {
    const ok = await confirm({
      title: 'Restore from this backup?',
      body: summary + (mode === 'overwrite' ? ' A safety copy of today\'s version is saved first.' : ' Nothing in today\'s data changes.'),
      confirmLabel: 'Restore now',
      tone: 'danger',
      requireText: 'RESTORE',
    });
    if (ok) applyNow();
  };

  if (!isOwner) {
    return (
      <SetupPage>
        <div className="rounded-lg border border-border bg-surface">
          <EmptyState icon={Lock} title="Only the owner can use Backup" body="Backups and restores are kept to the owner's login." />
        </div>
      </SetupPage>
    );
  }

  const last = status?.last;
  const working = busy !== null;
  const stale = !!last?.ok && Date.now() - Date.parse(last.at) > 36 * 3600_000;
  const driveChip = !status ? undefined
    : !status.driveConnected ? <StatusChip tone="warning">Not connected</StatusChip>
    : !last ? <StatusChip tone="neutral">Waiting for tonight</StatusChip>
    : !last.ok ? <StatusChip tone="danger">Last run failed</StatusChip>
    : stale ? <StatusChip tone="warning">Over a day old</StatusChip>
    : <StatusChip tone="success">Working</StatusChip>;

  return (
    <SetupPage>
      <p className="text-body-sm text-text-2">A locked copy of every record in the app and the list of logins. Only you can see this page.</p>

      {statusError && <ErrorState title="Couldn't load the backup status" body={statusError} onRetry={loadStatus} />}
      {status && !status.passphraseOk && (
        <Callout tone="danger" icon={Lock} title="Backups are off until the backup passphrase is set">
          Set the BACKUP_PASSPHRASE secret (at least 12 characters) as shown in docs/backup-google-drive-setup.md, step 1.
        </Callout>
      )}

      {/* Automatic backup */}
      <Card icon={Cloud} title="Automatic Google Drive backup" chip={driveChip}>
        <p className="text-body-sm text-text-2">{status?.schedule || 'Every night from 2:30 AM IST'}. Keeps the last 30 days and the first backup of each month for a year.</p>
        <div className="rounded-md bg-surface-2 px-3 py-2.5 text-body-sm">
          {!status ? (
            statusError ? <span className="text-text-2">Status not available.</span> : <Skeleton className="h-10 w-full" />
          ) : !status.driveConnected ? (
            <span className="text-text">Google Drive is not connected yet. Follow docs/backup-google-drive-setup.md (about 15 minutes, once).</span>
          ) : !last ? (
            <span className="text-text">No automatic backup yet. The first one runs tonight.</span>
          ) : last.ok ? (
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-text">Last backup {formatDateTimeIST(last.at)}</span>
              <span className="num break-all text-text-2">{fmtNum(last.rows)} records · {fmtBytes(last.bytes)} · {last.fileName}</span>
              {last.warning && <span className="text-warning">{last.warning}</span>}
            </span>
          ) : (
            <span className="flex flex-col gap-0.5">
              <span className="font-semibold text-danger">Last backup failed {formatDateTimeIST(last.at)}</span>
              <span className="text-text-2">{last.error}</span>
            </span>
          )}
          {status?.running && (
            <span className="mt-1.5 block text-info">A backup is in progress: {fmtNum(status.running.rows)} records so far{status.running.lastError ? ` (last try: ${status.running.lastError})` : ''}.</span>
          )}
          {stale && <span className="mt-1.5 block text-warning">No automatic backup for more than a day. Check the settings or back up now.</span>}
        </div>
        <Button size="lg" leadingIcon={<Cloud />} loading={busy === 'drive'} disabled={working || !status?.driveConnected || !status?.passphraseOk} onClick={driveNow} className="sm:self-start">
          Back up to Google Drive now
        </Button>
        {busy === 'drive' && <Progress text={progress} />}
        {note?.where === 'drive' && <NoteBox note={note} />}
      </Card>

      {/* Download */}
      <Card icon={Download} title="Download full backup">
        <p className="text-body-sm text-text-2">One locked file with every record and the list of logins, saved to this phone (Downloads › Bunny Momos) or computer. It opens only with the backup passphrase.</p>
        {status?.lastDownload && <p className="num text-caption text-text-3">Last downloaded {formatDateTimeIST(status.lastDownload.at)} ({fmtNum(status.lastDownload.rows)} records).</p>}
        <Button variant="secondary" size="lg" leadingIcon={<Download />} loading={busy === 'download'} disabled={working || !status?.passphraseOk} onClick={downloadNow} className="sm:self-start">
          Download full backup
        </Button>
        {busy === 'download' && <Progress text={progress} />}
        {note?.where === 'download' && <NoteBox note={note} />}
      </Card>

      {/* Check / restore */}
      <Card icon={RotateCcw} title="Restore from file">
        <p className="text-body-sm text-text-2">Pick a backup file (it ends in .bunnybak; download copies from Google Drive first). Check it, see what a restore would change, then restore. Restore never deletes records added after the backup.</p>
        <label className={cn('flex min-h-14 cursor-pointer items-center gap-3 rounded-md border border-border-strong bg-surface px-3 py-2 hover:bg-surface-2 focus-within:ring-2 focus-within:ring-ring', working && 'pointer-events-none opacity-50')}>
          <FolderOpen className="size-5 shrink-0 text-text-2" aria-hidden="true" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="truncate text-body-md font-medium text-text">{file ? file.name : 'Choose a backup file'}</span>
            {file && <span className="num truncate text-label text-text-3">Made {formatDateTimeIST(file.parsed.header.createdAt)} · app {file.parsed.header.appVersion || '?'} · {fmtBytes(file.parsed.size)}</span>}
          </span>
          <input type="file" onChange={pickFile} disabled={working} className="sr-only" />
        </label>

        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" leadingIcon={<ShieldCheck />} loading={busy === 'verify'} disabled={working || !file} onClick={checkFile}>Check this file</Button>
          <Button variant="secondary" leadingIcon={<FileSearch />} loading={busy === 'plan'} disabled={working || !file} onClick={makePlan}>See what a restore would change</Button>
        </div>
        {(busy === 'verify' || busy === 'plan') && <Progress text={progress} />}
        {note?.where === 'file' && <NoteBox note={note} />}

        {verify && (
          <ListGroup overline="In the file · in the app now">
            {[...new Set([...Object.keys(verify.manifest.prefixes), ...Object.keys(verify.live?.prefixes || {})])]
              .sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
              .map((p) => (
                <ListRow
                  key={p}
                  density="compact"
                  title={labelOf(p)}
                  subtitle={<span className="font-mono">{p}</span>}
                  trailing={<span className="num text-body-sm text-text">{fmtNum(verify.manifest.prefixes[p])} · {fmtNum(verify.live?.prefixes?.[p])}</span>}
                />
              ))}
            <ListRow density="compact" title={<span className="font-semibold">Total</span>} trailing={<span className="num text-body-sm font-semibold text-text">{fmtNum(verify.manifest.totalRows)} · {fmtNum(verify.live?.total)}</span>} />
          </ListGroup>
        )}
        {verify && verify.logins.length > 0 && (
          <ListGroup overline={`Logins in this file (${verify.logins.length})`} footer="Logins are not restored. If someone can no longer sign in, add them again in Employees.">
            {verify.logins.map((l, i) => (
              <ListRow key={i} density="compact" title={l.name || '-'} subtitle={`${l.email} · ${l.role || 'employee'}`} />
            ))}
          </ListGroup>
        )}

        {plan && (
          rows.every((r) => !r.missing && !r.changed) ? (
            <Callout tone="success" title="Nothing to restore">Today's data already has everything in this backup.</Callout>
          ) : (
            <div className="flex flex-col gap-4">
              <ListGroup
                title="What a restore would change"
                action={
                  <div className="flex gap-1">
                    <Button variant="ghost" size="sm" onClick={() => setSelected(new Set(rows.filter((r) => r.missing > 0).map((r) => r.prefix)))}>Tick all missing</Button>
                    <Button variant="ghost" size="sm" onClick={() => setSelected(new Set())}>Clear</Button>
                  </div>
                }
              >
                {rows.map((r) => {
                  const useful = r.missing + r.changed > 0;
                  return (
                    <label key={r.prefix} className={cn('flex min-h-15 items-center gap-3 px-4 py-2.5', useful ? 'cursor-pointer hover:bg-surface-2/60' : 'opacity-60')}>
                      <span className="flex min-w-0 flex-1 flex-col">
                        <span className="text-body-md font-medium text-text">{r.label}</span>
                        <span className="num text-label text-text-3">
                          {fmtNum(r.missing)} missing now · {fmtNum(r.changed)} changed since · {fmtNum(r.same)} same · {fmtNum(r.newSinceBackup)} new since (kept)
                        </span>
                      </span>
                      <Checkbox checked={selected.has(r.prefix)} disabled={!useful || working} onCheckedChange={() => toggle(r.prefix)} aria-label={`Restore ${r.label}`} />
                    </label>
                  );
                })}
              </ListGroup>

              <div className="flex flex-col gap-2">
                <span className="text-body-sm font-medium text-text">How to restore</span>
                <SegmentedControl
                  aria-label="How to restore"
                  value={mode}
                  onValueChange={setMode}
                  disabled={working}
                  options={[{ value: 'missing-only', label: 'Missing only' }, { value: 'overwrite', label: 'Also changed' }]}
                />
                <p className="text-caption text-text-3">
                  {mode === 'missing-only'
                    ? 'Safe: only records missing today come back; nothing in today\'s data changes.'
                    : 'Records that changed are also put back to the backup\'s version; a safety copy of today\'s version is saved first.'}
                </p>
              </div>

              <Callout tone="warning">{summary}</Callout>
              <Button
                variant="danger"
                size="lg"
                leadingIcon={<RotateCcw />}
                loading={busy === 'apply'}
                disabled={working || selected.size === 0 || (willAdd + willReplace === 0)}
                onClick={confirmRestore}
                className="sm:self-start"
              >
                Restore now
              </Button>
              {busy === 'apply' && <Progress text={progress} />}
            </div>
          )
        )}
        {note?.where === 'restore' && <NoteBox note={note} />}
        {applied && !working && (
          <p className="num text-caption text-text-3">Run {applied.run}: {fmtNum(applied.unchanged)} records were left as they were.</p>
        )}
      </Card>

      {/* What is and is not included */}
      <Callout tone="neutral" icon={Info} title="What a backup holds">
        <span className="flex flex-col gap-2">
          <span>Every record in the app (sales, stock, staff, payroll, production, riders, settlements, photos and so on) and the list of logins with their roles. Left out on purpose: live rider locations, cached travel times, one-time approve/reject links, "reminder already sent" flags and AI usage counters, which mean nothing a day later.</span>
          <span>Passwords are never in a backup. If a login itself is lost, add the person again in Employees.</span>
          <span className="font-medium text-danger">Keep the backup passphrase written down somewhere safe outside the app. Without it no backup can be opened, by anyone.</span>
        </span>
      </Callout>

      {(status?.restores?.length || 0) > 0 && (
        <ListGroup overline="Recent restores">
          {status!.restores.map((r) => (
            <ListRow
              key={r.run}
              density="compact"
              title={<span className="num">{formatDateTimeIST(r.startedAt)}</span>}
              subtitle={`${r.by || ''} · ${r.mode === 'overwrite' ? 'missing + changed' : 'missing only'} · ${fmtNum(r.added)} put back, ${fmtNum(r.overwritten)} replaced${r.finishedAt ? '' : ' (not finished)'}`}
            />
          ))}
        </ListGroup>
      )}
    </SetupPage>
  );
}
