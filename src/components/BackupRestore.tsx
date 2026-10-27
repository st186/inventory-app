// Backup & Restore (owner only). A backup is a locked (encrypted) copy of every record in the app
// plus the list of logins, made by the server: every night to Google Drive, or on demand as a
// file. Restoring writes records back under their original IDs (the old page re-added them as new
// records, which made duplicates), always after a dry run, and saves a safety copy of anything it
// replaces. Server side: supabase/functions/make-server-c2dd9b9d/backup.ts.
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertCircle, CheckCircle, Cloud, Database, Download, FileSearch, Loader2, Lock, RotateCcw, ShieldCheck } from 'lucide-react';
import { InventoryContextType } from '../App';
import { formatDateTimeIST } from '../utils/timezone';
import { saveFile } from '../utils/saveFile';
import {
  applyRestore, downloadFullBackup, getBackupStatus, parseBackupFile, planRestore, runDriveBackupNow, verifyBackupFile,
  type ApplyResult, type BackupStatus, type ParsedBackup, type PlanResult, type VerifyResult,
} from '../utils/backupApi';

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

function Hint({ children }: { children: React.ReactNode }) {
  return <span className="block text-xs text-gray-500 mt-1" lang="bn">{children}</span>;
}

function NoteBox({ note }: { note: Note | null }) {
  if (!note) return null;
  const ok = note.kind === 'ok';
  return (
    <div className={`mt-4 p-3 rounded-lg flex items-start gap-2 text-sm ${ok ? 'bg-green-50 border border-green-200 text-green-800' : 'bg-red-50 border border-red-200 text-red-800'}`}>
      {ok ? <CheckCircle className="w-5 h-5 flex-shrink-0" /> : <AlertCircle className="w-5 h-5 flex-shrink-0" />}
      <p className="whitespace-pre-line">{note.text}</p>
    </div>
  );
}

const card = 'bg-white rounded-2xl shadow-sm border border-gray-200 p-5 sm:p-6';
const primaryButton = 'w-full sm:w-auto px-5 py-3 rounded-lg font-semibold text-white flex items-center justify-center gap-2 transition-colors disabled:opacity-50 disabled:cursor-not-allowed';

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
  const [confirmText, setConfirmText] = useState('');
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
    setVerify(null); setPlan(null); setApplied(null); setSelected(new Set()); setConfirmText(''); setNote(null);
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
    setConfirmText('');
  });

  const rows = useMemo(() => Object.entries(plan?.prefixes || {})
    .map(([prefix, n]) => ({ prefix, label: labelOf(prefix), ...n }))
    .sort((a, b) => (b.missing + b.changed) - (a.missing + a.changed) || a.label.localeCompare(b.label)), [plan]);
  const chosenRows = rows.filter((r) => selected.has(r.prefix));
  const willAdd = chosenRows.reduce((n, r) => n + r.missing, 0);
  const willReplace = mode === 'overwrite' ? chosenRows.reduce((n, r) => n + r.changed, 0) : 0;
  const confirmed = confirmText.trim().toUpperCase() === 'RESTORE';

  const toggle = (prefix: string) => setSelected((prev) => {
    const next = new Set(prev);
    if (next.has(prefix)) next.delete(prefix); else next.add(prefix);
    return next;
  });

  const applyNow = () => file && plan && run('apply', 'restore', async () => {
    const result = await applyRestore(file.parsed, plan, { prefixes: [...selected], mode, confirm: 'RESTORE' },
      (d, t) => setProgress(`Restoring part ${Math.min(d + 1, t)} of ${t}… keep this screen open`));
    setApplied(result);
    setConfirmText('');
    loadStatus();
    context.refreshData().catch(() => {});
    return `Restore finished: ${fmtNum(result.added)} records put back, ${fmtNum(result.overwritten)} replaced.` +
      (result.snapshots.length ? `\nThe records it replaced were saved first (safety copy ${result.snapshots[0].split(':').slice(0, 2).join(':')}).` : '') +
      `\nRestore log: restore-log:${result.run}. Screens refresh in a moment; balances worked out from other records update the next time those records are saved.`;
  });

  if (!isOwner) {
    return (
      <div className="max-w-3xl mx-auto p-6">
        <div className={card}>
          <p className="text-gray-700">Only the owner can use Backup & Restore.</p>
          <Hint>শুধু মালিক ব্যাকআপ ও রিস্টোর ব্যবহার করতে পারেন।</Hint>
        </div>
      </div>
    );
  }

  const last = status?.last;
  const working = busy !== null;

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 space-y-5">
      <div className="relative overflow-hidden bg-gradient-to-r from-orange-600 via-rose-500 to-orange-600 rounded-2xl p-6 shadow-xl">
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 bg-white/20 rounded-2xl flex items-center justify-center border-2 border-white/30 flex-shrink-0">
            <Database className="w-7 h-7 text-white" />
          </div>
          <div>
            <h1 className="text-2xl sm:text-3xl text-white font-bold tracking-tight">Backup & Restore</h1>
            <p className="text-sm text-white/85 mt-1">A locked copy of every record in the app and the list of logins. Only you can see this page.</p>
            <p className="text-xs text-white/75 mt-1" lang="bn">অ্যাপের সব তথ্যের তালা-দেওয়া কপি। শুধু মালিক এই পাতা দেখতে পান।</p>
          </div>
        </div>
      </div>

      {statusError && <NoteBox note={{ where: 'drive', kind: 'error', text: `Could not load the backup status: ${statusError}` }} />}
      {status && !status.passphraseOk && (
        <div className="p-4 rounded-xl bg-red-50 border border-red-200 text-sm text-red-800 flex gap-2">
          <Lock className="w-5 h-5 flex-shrink-0" />
          <div>
            <p className="font-semibold">Backups are switched off until the backup passphrase is set.</p>
            <p>Set the BACKUP_PASSPHRASE secret (at least 12 characters) as shown in docs/backup-google-drive-setup.md, step 1.</p>
            <Hint>ব্যাকআপ চালু করতে আগে BACKUP_PASSPHRASE সেট করুন।</Hint>
          </div>
        </div>
      )}

      {/* Automatic backup */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <Cloud className="w-5 h-5 text-sky-600" />
          <h2 className="text-lg font-bold text-gray-900">Automatic backup to Google Drive</h2>
        </div>
        <p className="text-sm text-gray-600">{status?.schedule || 'Every night from 2:30 AM IST'}. Keeps the last 30 days and the first backup of each month for a year.</p>
        <Hint>প্রতি রাতে আড়াইটায় নিজে থেকেই Google Drive-এ ব্যাকআপ হয়।</Hint>

        <div className="mt-4 rounded-xl border border-gray-200 bg-gray-50 p-4 text-sm">
          {!status ? (
            <p className="text-gray-500">Loading…</p>
          ) : !status.driveConnected ? (
            <p className="text-amber-700">Google Drive is not connected yet. Follow docs/backup-google-drive-setup.md (about 15 minutes, once).</p>
          ) : !last ? (
            <p className="text-gray-600">No automatic backup yet. The first one runs tonight.</p>
          ) : last.ok ? (
            <div className="flex items-start gap-2 text-green-800">
              <CheckCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Last backup: {formatDateTimeIST(last.at)}</p>
                <p>{fmtNum(last.rows)} records · {fmtBytes(last.bytes)} · {last.fileName}</p>
                {last.warning && <p className="text-amber-700 mt-1">{last.warning}</p>}
              </div>
            </div>
          ) : (
            <div className="flex items-start gap-2 text-red-800">
              <AlertCircle className="w-5 h-5 flex-shrink-0" />
              <div>
                <p className="font-semibold">Last backup failed: {formatDateTimeIST(last.at)}</p>
                <p>{last.error}</p>
              </div>
            </div>
          )}
          {status?.running && (
            <p className="mt-2 text-sky-700">A backup is in progress: {fmtNum(status.running.rows)} records so far{status.running.lastError ? ` (last try: ${status.running.lastError})` : ''}.</p>
          )}
          {last?.ok && Date.now() - Date.parse(last.at) > 36 * 3600_000 && (
            <p className="mt-2 text-amber-700">No automatic backup for more than a day. Check the settings or press the button below.</p>
          )}
        </div>

        <button onClick={driveNow} disabled={working || !status?.driveConnected || !status?.passphraseOk} className={`${primaryButton} mt-4 bg-sky-600 hover:bg-sky-700`}>
          {busy === 'drive' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Cloud className="w-5 h-5" />}
          Back up to Google Drive now
        </button>
        {busy === 'drive' && progress && <p className="text-sm text-gray-600 mt-2">{progress}</p>}
        {note?.where === 'drive' && <NoteBox note={note} />}
      </div>

      {/* Download */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <Download className="w-5 h-5 text-green-600" />
          <h2 className="text-lg font-bold text-gray-900">Download full backup now</h2>
        </div>
        <p className="text-sm text-gray-600">One locked file with every record and the list of logins, saved to this phone (Downloads › Bunny Momos) or computer. It opens only with the backup passphrase.</p>
        <Hint>এখনই পুরো ব্যাকআপ ফাইল এই ফোনে বা কম্পিউটারে সেভ করুন।</Hint>
        {status?.lastDownload && <p className="text-xs text-gray-500 mt-2">Last downloaded {formatDateTimeIST(status.lastDownload.at)} ({fmtNum(status.lastDownload.rows)} records).</p>}
        <button onClick={downloadNow} disabled={working || !status?.passphraseOk} className={`${primaryButton} mt-4 bg-green-600 hover:bg-green-700`}>
          {busy === 'download' ? <Loader2 className="w-5 h-5 animate-spin" /> : <Download className="w-5 h-5" />}
          Download full backup now
        </button>
        {busy === 'download' && progress && <p className="text-sm text-gray-600 mt-2">{progress}</p>}
        {note?.where === 'download' && <NoteBox note={note} />}
      </div>

      {/* Check / restore */}
      <div className={card}>
        <div className="flex items-center gap-2 mb-1">
          <FileSearch className="w-5 h-5 text-violet-600" />
          <h2 className="text-lg font-bold text-gray-900">Check or restore a backup file</h2>
        </div>
        <p className="text-sm text-gray-600">Pick a backup file (it ends in .bunnybak; copies from Google Drive can be downloaded there first).</p>
        <Hint>ব্যাকআপ ফাইল বেছে নিন, তারপর দেখুন ফাইলটা ঠিক আছে কিনা।</Hint>
        <input
          type="file"
          onChange={pickFile}
          disabled={working}
          className="mt-3 w-full px-4 py-3 border-2 border-dashed border-gray-300 rounded-lg hover:border-violet-400 cursor-pointer disabled:opacity-50"
        />
        {file && (
          <div className="mt-3 bg-gray-50 rounded-lg p-3 text-sm text-gray-700">
            <p className="font-medium break-all">{file.name}</p>
            <p className="text-gray-500">Made {formatDateTimeIST(file.parsed.header.createdAt)} · app {file.parsed.header.appVersion || '?'} · {fmtBytes(file.parsed.size)}</p>
          </div>
        )}
        <button onClick={checkFile} disabled={working || !file} className={`${primaryButton} mt-4 bg-violet-600 hover:bg-violet-700`}>
          {busy === 'verify' ? <Loader2 className="w-5 h-5 animate-spin" /> : <ShieldCheck className="w-5 h-5" />}
          Check this file
        </button>
        {busy === 'verify' && progress && <p className="text-sm text-gray-600 mt-2">{progress}</p>}
        {note?.where === 'file' && <NoteBox note={note} />}

        {verify && (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-2 pr-2">Kind of record</th>
                  <th className="py-2 px-2 text-right">In file</th>
                  <th className="py-2 pl-2 text-right">In the app now</th>
                </tr>
              </thead>
              <tbody>
                {[...new Set([...Object.keys(verify.manifest.prefixes), ...Object.keys(verify.live?.prefixes || {})])]
                  .sort((a, b) => labelOf(a).localeCompare(labelOf(b)))
                  .map((p) => (
                    <tr key={p} className="border-b border-gray-100">
                      <td className="py-1.5 pr-2">{labelOf(p)} <span className="text-xs text-gray-400 font-mono">{p}</span></td>
                      <td className="py-1.5 px-2 text-right">{fmtNum(verify.manifest.prefixes[p])}</td>
                      <td className="py-1.5 pl-2 text-right">{fmtNum(verify.live?.prefixes?.[p])}</td>
                    </tr>
                  ))}
                <tr className="font-semibold">
                  <td className="py-2 pr-2">Total</td>
                  <td className="py-2 px-2 text-right">{fmtNum(verify.manifest.totalRows)}</td>
                  <td className="py-2 pl-2 text-right">{fmtNum(verify.live?.total)}</td>
                </tr>
              </tbody>
            </table>
            {verify.logins.length > 0 && (
              <div className="mt-4 text-sm">
                <p className="font-semibold text-gray-800">Logins in this file ({verify.logins.length})</p>
                <p className="text-gray-600">Logins are not restored. If someone here can no longer sign in, add them again in Employees.</p>
                <Hint>লগইন রিস্টোর হয় না; দরকার হলে Employees-এ আবার যোগ করুন।</Hint>
                <ul className="mt-2 grid sm:grid-cols-2 gap-1 text-gray-700">
                  {verify.logins.map((l, i) => <li key={i} className="truncate">{l.name || '-'} · {l.email} · {l.role || 'employee'}</li>)}
                </ul>
              </div>
            )}
          </div>
        )}

        {/* Restore */}
        <div className="mt-6 pt-5 border-t border-gray-200">
          <div className="flex items-center gap-2 mb-1">
            <RotateCcw className="w-5 h-5 text-orange-600" />
            <h3 className="text-base font-bold text-gray-900">Restore from this file</h3>
          </div>
          <p className="text-sm text-gray-600">First see what would change; nothing is written until you confirm. Restore never deletes records added after the backup.</p>
          <Hint>আগে দেখুন কী বদলাবে; নিশ্চিত না করা পর্যন্ত কিছু লেখা হয় না।</Hint>
          <button onClick={makePlan} disabled={working || !file} className={`${primaryButton} mt-3 bg-orange-500 hover:bg-orange-600`}>
            {busy === 'plan' ? <Loader2 className="w-5 h-5 animate-spin" /> : <FileSearch className="w-5 h-5" />}
            Step 1: See what a restore would change
          </button>
          {busy === 'plan' && progress && <p className="text-sm text-gray-600 mt-2">{progress}</p>}

          {plan && (
            <div className="mt-4">
              {rows.every((r) => !r.missing && !r.changed) ? (
                <p className="text-sm text-green-700">Today's data already has everything in this backup. Nothing to restore.</p>
              ) : (
                <>
                  <div className="flex gap-3 text-sm mb-2">
                    <button className="text-orange-700 underline" onClick={() => setSelected(new Set(rows.filter((r) => r.missing > 0).map((r) => r.prefix)))}>Select all with missing records</button>
                    <button className="text-gray-600 underline" onClick={() => setSelected(new Set())}>Clear</button>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-gray-500 border-b">
                          <th className="py-2 pr-2" />
                          <th className="py-2 pr-2">Kind of record</th>
                          <th className="py-2 px-2 text-right">Missing now<br /><span className="font-normal text-xs">will come back</span></th>
                          <th className="py-2 px-2 text-right">Changed since<br /><span className="font-normal text-xs">replaced only if you choose</span></th>
                          <th className="py-2 px-2 text-right">Same</th>
                          <th className="py-2 pl-2 text-right">New since backup<br /><span className="font-normal text-xs">always kept</span></th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((r) => {
                          const useful = r.missing + r.changed > 0;
                          return (
                            <tr key={r.prefix} className={`border-b border-gray-100 ${useful ? '' : 'text-gray-400'}`}>
                              <td className="py-1.5 pr-2">
                                <input type="checkbox" disabled={!useful || working} checked={selected.has(r.prefix)} onChange={() => toggle(r.prefix)} aria-label={`Restore ${r.label}`} />
                              </td>
                              <td className="py-1.5 pr-2">{r.label} <span className="text-xs text-gray-400 font-mono">{r.prefix}</span></td>
                              <td className="py-1.5 px-2 text-right">{fmtNum(r.missing)}</td>
                              <td className="py-1.5 px-2 text-right">{fmtNum(r.changed)}</td>
                              <td className="py-1.5 px-2 text-right">{fmtNum(r.same)}</td>
                              <td className="py-1.5 pl-2 text-right">{fmtNum(r.newSinceBackup)}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <fieldset className="mt-4 space-y-2 text-sm">
                    <legend className="font-semibold text-gray-800 mb-1">How to restore</legend>
                    <label className="flex items-start gap-2">
                      <input type="radio" name="restore-mode" checked={mode === 'missing-only'} onChange={() => setMode('missing-only')} disabled={working} />
                      <span><strong>Only put back missing records</strong> (safe: nothing in today's data changes)<Hint>শুধু হারানো রেকর্ড ফেরত আসবে।</Hint></span>
                    </label>
                    <label className="flex items-start gap-2">
                      <input type="radio" name="restore-mode" checked={mode === 'overwrite'} onChange={() => setMode('overwrite')} disabled={working} />
                      <span><strong>Also replace records that changed</strong> with the backup's version (a safety copy of today's version is saved first)<Hint>বদলে যাওয়া রেকর্ডও ব্যাকআপের মতো হয়ে যাবে।</Hint></span>
                    </label>
                  </fieldset>

                  <div className="mt-4 p-3 rounded-lg bg-amber-50 border border-amber-200 text-sm text-amber-900">
                    {selected.size === 0
                      ? 'Tick the kinds of record to restore.'
                      : `This will put back ${fmtNum(willAdd)} missing records${mode === 'overwrite' ? ` and replace ${fmtNum(willReplace)} changed records` : ''} in ${selected.size} kind${selected.size === 1 ? '' : 's'} of record.`}
                  </div>
                  <label className="block mt-3 text-sm text-gray-700">
                    Type <span className="font-mono font-semibold">RESTORE</span> to confirm
                    <Hint>নিশ্চিত করতে RESTORE লিখুন।</Hint>
                    <input
                      value={confirmText}
                      onChange={(e) => setConfirmText(e.target.value)}
                      disabled={working}
                      autoCapitalize="characters"
                      className="mt-1 w-full sm:w-64 px-3 py-2 border border-gray-300 rounded-lg font-mono"
                      placeholder="RESTORE"
                    />
                  </label>
                  <button
                    onClick={applyNow}
                    disabled={working || selected.size === 0 || !confirmed || (willAdd + willReplace === 0)}
                    className={`${primaryButton} mt-4 bg-red-600 hover:bg-red-700`}
                  >
                    {busy === 'apply' ? <Loader2 className="w-5 h-5 animate-spin" /> : <RotateCcw className="w-5 h-5" />}
                    Step 2: Restore now
                  </button>
                  {busy === 'apply' && progress && <p className="text-sm text-gray-600 mt-2">{progress}</p>}
                </>
              )}
            </div>
          )}
          {note?.where === 'restore' && <NoteBox note={note} />}
          {applied && !working && (
            <p className="text-xs text-gray-500 mt-2">Run {applied.run}: {fmtNum(applied.unchanged)} records were left as they were.</p>
          )}
        </div>
      </div>

      {/* What is and is not included */}
      <div className="bg-gradient-to-r from-blue-50 to-orange-50 rounded-2xl border border-orange-100 p-5 text-sm text-gray-700 space-y-2">
        <p className="font-semibold text-gray-900">What a backup holds</p>
        <p>Every record in the app (sales, stock, staff, payroll, production, riders, settlements, photos and so on) and the list of logins with their roles. Left out on purpose: live rider locations, cached travel times, one-time approve/reject links, "reminder already sent" flags and AI usage counters, which mean nothing a day later.</p>
        <p>Passwords are never in a backup. If a login itself is lost, add the person again in Employees.</p>
        <p className="text-red-700">Keep the backup passphrase written down somewhere safe outside the app. Without it no backup can be opened, by anyone.</p>
        <Hint>ব্যাকআপ পাসফ্রেজ অ্যাপের বাইরে কোথাও লিখে রাখুন; এটা ছাড়া কোনো ব্যাকআপ খোলা যাবে না।</Hint>
        {(status?.restores?.length || 0) > 0 && (
          <div className="pt-2">
            <p className="font-semibold text-gray-900">Recent restores</p>
            <ul className="mt-1 space-y-0.5">
              {status!.restores.map((r) => (
                <li key={r.run}>{formatDateTimeIST(r.startedAt)} · {r.by} · {r.mode === 'overwrite' ? 'missing + changed' : 'missing only'} · {fmtNum(r.added)} put back, {fmtNum(r.overwritten)} replaced{r.finishedAt ? '' : ' (not finished)'}</li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
