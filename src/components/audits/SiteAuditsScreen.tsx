// Surprise audits (owner, 28 Oct 2026; server siteAudits.ts). The owner and ops set one up - a
// store or the production house, a window of days, who does it (themselves or an independent
// auditor) and the payout - and see each report Bunny writes. The person doing it goes through
// the checklist on site: OK, problem or not applicable for each item, a note and photos, anything
// else they saw, then submits. Independent auditors see only this screen.
import { useCallback, useEffect, useRef, useState } from 'react';
import { AlertTriangle, ArrowLeft, Camera, CheckCircle2, ClipboardCheck, MapPin, Plus, RefreshCw, Sparkles, UserPlus, Wallet, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { NativeSelect } from '../ui/select';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip, type StatusTone } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import { cn } from '../ui/utils';
import { getTodayIST } from '../../utils/timezone';
import { compressPhoto } from '../assets/assetsApi';
import { currentPosition } from '../kpi/ShiftClockCard';
import * as api from './auditsApi';

const day = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
const windowText = (a: { from: string; to: string }) => (a.from === a.to ? day(a.from) : `${day(a.from)} – ${day(a.to)}`);
const STATUS: Record<api.AuditStatus, { label: string; tone: StatusTone }> = {
  assigned: { label: 'To visit', tone: 'info' },
  in_progress: { label: 'In progress', tone: 'warning' },
  submitted: { label: 'Report coming', tone: 'info' },
  reported: { label: 'Report ready', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'neutral' },
};
const RATING_TONE: Record<string, StatusTone> = { good: 'success', fair: 'warning', poor: 'danger', critical: 'danger' };
const SEVERITY_TONE: Record<string, StatusTone> = { low: 'neutral', medium: 'warning', high: 'danger', critical: 'danger' };
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export function SiteAuditsScreen() {
  const [data, setData] = useState<api.AuditList | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'open' | 'done'>('open');
  const [openId, setOpenId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [auditorOpen, setAuditorOpen] = useState(false);
  const load = useCallback(() => { setError(false); api.listAudits().then(setData).catch(() => setError(true)); }, []);
  useEffect(() => { load(); }, [load]);

  if (runId) return <AuditRunner id={runId} onBack={() => { setRunId(null); load(); }} />;
  const audits = data?.audits || [];
  const isDone = (a: api.AuditSummary) => a.status === 'reported' || a.status === 'cancelled';

  return (
    <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-4 lg:px-8">
      {error ? <ErrorState onRetry={load} /> : !data ? <SkeletonListRows count={4} /> : data.canManage ? (
        <>
          <p className="text-body-sm text-text-2">Unannounced visits to a store or the production house, by you or an independent auditor. Nobody at the place is told. Bunny writes the report from the checklist and the photos.</p>
          <div className="flex flex-wrap gap-2">
            <Button leadingIcon={<Plus />} onClick={() => setNewOpen(true)}>New audit</Button>
            {data.isOwner && <Button variant="secondary" leadingIcon={<UserPlus />} onClick={() => setAuditorOpen(true)}>Add an auditor</Button>}
          </div>
          <SegmentedControl aria-label="Audits" value={tab} onValueChange={(v) => setTab(v as 'open' | 'done')} options={[{ value: 'open', label: 'Open' }, { value: 'done', label: 'Done' }]} />
          {(() => {
            const list = audits.filter((a) => (tab === 'done' ? isDone(a) : !isDone(a)));
            if (!list.length) return <EmptyState icon={ClipboardCheck} title={tab === 'open' ? 'No audits planned' : 'No reports yet'} body="Set up a surprise visit with New audit." />;
            return (
              <ListGroup>
                {list.map((a) => (
                  <ListRow key={a.id} title={`${a.placeName} · ${windowText(a)}`}
                    subtitle={[a.byOwner ? 'You' : a.auditorName, a.status === 'in_progress' ? `${a.checked}/${a.total} checked` : '', a.problems ? `${a.problems} problem${a.problems === 1 ? '' : 's'}` : '', !a.byOwner && a.payout ? `${inr(a.payout)}${a.paid ? ' paid' : ''}` : ''].filter(Boolean).join(' · ')}
                    trailing={a.score !== null ? <StatusChip tone={RATING_TONE[a.rating || 'fair']}>{a.score}/100</StatusChip> : <StatusChip tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusChip>}
                    onClick={() => setOpenId(a.id)} />
                ))}
              </ListGroup>
            );
          })()}
        </>
      ) : (
        <>
          <p className="text-body-sm text-text-2">Visit on any day in the window, without telling anyone. Go through every item, add photos, and submit.</p>
          {!audits.length ? <EmptyState icon={ClipboardCheck} title="No audits for you yet" body="You will get a notification when one is set up." /> : audits.map((a) => (
            <section key={a.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="flex flex-col">
                  <span className="text-body-md font-semibold text-text">{a.placeName}</span>
                  <span className="text-label text-text-3">{a.placeKind === 'production' ? 'Production house' : 'Store'} · {windowText(a)}</span>
                </div>
                <StatusChip tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusChip>
              </div>
              {a.payout > 0 && <p className="num text-body-sm text-text-2">Payout {inr(a.payout)}{a.paid ? ' · paid' : ''}</p>}
              {(a.status === 'assigned' || a.status === 'in_progress') && (
                <Button onClick={() => setRunId(a.id)}>{a.status === 'assigned' ? 'Start the audit' : `Continue · ${a.checked}/${a.total}`}</Button>
              )}
            </section>
          ))}
        </>
      )}
      {openId && <AuditDetail id={openId} isOwner={!!data?.isOwner} onClose={() => setOpenId(null)} onRun={(id) => { setOpenId(null); setRunId(id); }} onChanged={load} />}
      {newOpen && data && <NewAuditSheet list={data} onClose={() => setNewOpen(false)} onSaved={() => { setNewOpen(false); load(); }} />}
      {auditorOpen && <AddAuditorSheet onClose={() => setAuditorOpen(false)} onSaved={() => { setAuditorOpen(false); load(); }} />}
    </div>
  );
}

// ---------------- Owner: set up ----------------

function NewAuditSheet({ list, onClose, onSaved }: { list: api.AuditList; onClose: () => void; onSaved: () => void }) {
  const [open, setOpen] = useState(true);
  const today = getTodayIST();
  const [place, setPlace] = useState(list.places?.[0] ? `${list.places[0].kind}:${list.places[0].id}` : '');
  const [auditorId, setAuditorId] = useState('self');
  const [from, setFrom] = useState(today);
  const [to, setTo] = useState(today);
  const [payout, setPayout] = useState('');
  const [notes, setNotes] = useState('');
  const [extra, setExtra] = useState('');
  const [saving, setSaving] = useState(false);
  const save = async () => {
    const [placeKind, placeId] = place.split(':');
    if (!placeId) { toast.error('Pick the store or production house'); return; }
    if (auditorId !== 'self' && !(Number(payout) > 0)) { toast.error('Write the payout for the auditor'); return; }
    setSaving(true);
    try {
      await api.createAudit({ placeKind, placeId, auditorId, from, to: to < from ? from : to, payout: Number(payout) || 0, notes, extraItems: extra.split('\n').map((s) => s.trim()).filter(Boolean) });
      toast.success(auditorId === 'self' ? 'Audit set up' : 'Set up - the auditor has been told');
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || 'Could not save that');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title="New surprise audit" dirty={!!(notes || extra)}
      description="Only the person doing it is told - nobody at the place."
      footer={<Button size="lg" className="flex-1" loading={saving} onClick={save}>Set up the audit</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Where">
          <NativeSelect value={place} onChange={(e) => setPlace(e.target.value)}>
            {(list.places || []).map((p) => <option key={`${p.kind}:${p.id}`} value={`${p.kind}:${p.id}`}>{p.name}{p.kind === 'production' && !/production/i.test(p.name) ? ' (production house)' : ''}</option>)}
          </NativeSelect>
        </Field>
        <Field label="Who does it" helper={!list.auditors?.length ? 'Add an independent auditor first to send someone else.' : undefined}>
          <NativeSelect value={auditorId} onChange={(e) => setAuditorId(e.target.value)}>
            <option value="self">I will do it myself</option>
            {(list.auditors || []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
          </NativeSelect>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="From"><Input type="date" className="num" value={from} min={today} onChange={(e) => setFrom(e.target.value)} /></Field>
          <Field label="To"><Input type="date" className="num" value={to} min={from} onChange={(e) => setTo(e.target.value)} /></Field>
        </div>
        {auditorId !== 'self' && (
          <Field label="Payout (₹)" helper="Marking it paid logs a Professional fees expense for the place, paid with your own money.">
            <Input type="number" inputMode="numeric" className="num" value={payout} onChange={(e) => setPayout(e.target.value)} placeholder="e.g. 1500" />
          </Field>
        )}
        <Field label="What to look at" optional helper="Shown to whoever does the audit.">
          <Textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={600} placeholder="e.g. Check the cash drawer against the POS and the freezer" />
        </Field>
        <Field label="Extra checklist lines" optional helper="One per line, added to the standard checklist.">
          <Textarea rows={3} value={extra} onChange={(e) => setExtra(e.target.value)} placeholder={'e.g. Burger buns not expired\nPrice board matches the menu'} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}

function AddAuditorSheet({ onClose, onSaved }: { onClose: () => void; onSaved: () => void }) {
  const [open, setOpen] = useState(true);
  const [form, setForm] = useState({ name: '', phone: '', email: '', password: '' });
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      await api.addAuditor(form);
      toast.success('Auditor added. Share the email and first password with them.');
      setOpen(false);
      onSaved();
    } catch (e) {
      toast.error((e as Error).message || 'Could not add them');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title="Add an independent auditor" dirty={!!form.name}
      description="They sign in to the app and see only the audits you give them - nothing else of the business."
      footer={<Button size="lg" className="flex-1" loading={saving} onClick={save}>Add auditor</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="Name" required><Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} maxLength={60} /></Field>
        <Field label="Phone" optional><Input type="tel" inputMode="tel" className="num" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} maxLength={16} /></Field>
        <Field label="Email for sign-in" required><Input type="email" autoComplete="off" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} /></Field>
        <Field label="First password" required helper="At least 8 characters. They are asked to change it after signing in.">
          <Input type="text" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} />
        </Field>
      </div>
    </ResponsiveModal>
  );
}

// ---------------- Owner: an audit and its report ----------------

function AuditDetail({ id, isOwner, onClose, onRun, onChanged }: { id: string; isOwner: boolean; onClose: () => void; onRun: (id: string) => void; onChanged: () => void }) {
  const [open, setOpen] = useState(true);
  const [res, setRes] = useState<Awaited<ReturnType<typeof api.getAudit>> | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [amount, setAmount] = useState('');
  const load = useCallback(() => { api.getAudit(id).then((r) => { setRes(r); setAmount(String(r.audit.payout || '')); }).catch((e) => toast.error((e as Error).message)); }, [id]);
  useEffect(() => { load(); }, [load]);
  const a = res?.audit;
  // While Bunny writes the report, check back now and then.
  useEffect(() => {
    if (a?.report?.status !== 'pending') return;
    const t = setInterval(load, 8000);
    return () => clearInterval(t);
  }, [a?.report?.status, load]);
  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key);
    try { await fn(); toast.success(ok); load(); onChanged(); } catch (e) { toast.error((e as Error).message || 'Could not save that'); } finally { setBusy(null); }
  };
  const report = a?.report;
  const sections = a ? [...new Set(a.items.map((i) => i.section))] : [];
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail"
      title={a ? `${a.placeName} · ${windowText(a)}` : 'Audit'}
      description={a ? `${a.byOwner ? 'Your own visit' : a.auditorName}${a.startedAt ? ` · visited ${new Date(a.startedAt).toLocaleString('en-IN', { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })}` : ''}` : undefined}
      footer={a && res?.canRun && (a.status === 'assigned' || a.status === 'in_progress') ? <Button size="lg" className="flex-1" onClick={() => onRun(a.id)}>{a.status === 'assigned' ? 'Start the audit' : 'Continue the audit'}</Button> : undefined}>
      {!a ? <SkeletonListRows count={4} /> : (
        <div className="flex flex-col gap-4" data-ai-private>
          <div className="flex flex-wrap items-center gap-2">
            <StatusChip tone={STATUS[a.status].tone}>{STATUS[a.status].label}</StatusChip>
            {a.startGeo && (a.startGeo.atPlace === null ? <StatusChip tone="neutral" icon={MapPin}>No location</StatusChip>
              : a.startGeo.atPlace ? <StatusChip tone="success" icon={MapPin}>Started on site</StatusChip>
              : <StatusChip tone="danger" icon={MapPin}>Started {a.startGeo.distanceM} m away</StatusChip>)}
          </div>
          {a.notes && <Callout tone="neutral" title="What to look at">{a.notes}</Callout>}

          {report?.status === 'pending' && <Callout tone="info" icon={Sparkles} title="Bunny is writing the report">It reads the checklist and the photos. You get a notification when it is ready.</Callout>}
          {report?.status === 'failed' && (
            <Callout tone="warning" title="Bunny could not write the report" action={<Button size="sm" variant="secondary" leadingIcon={<RefreshCw />} loading={busy === 'report'} onClick={() => run('report', () => api.rewriteReport(a.id), 'Report written')}>Try again</Button>}>{report.error}</Callout>
          )}
          {report?.status === 'done' && (
            <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-1.5 text-body-md font-semibold text-text"><Sparkles className="size-4 text-primary" aria-hidden="true" /> Bunny's report</span>
                <span className="flex items-center gap-2">
                  <span className="num text-title font-semibold text-text">{report.score}/100</span>
                  <StatusChip tone={RATING_TONE[report.rating || 'fair']}>{report.rating}</StatusChip>
                </span>
              </div>
              {report.summary && <p className="text-body-sm text-text">{report.summary}</p>}
              {!!report.problems?.length && (
                <div className="flex flex-col gap-2">
                  <p className="overline-label">Problems</p>
                  {report.problems.map((p, i) => (
                    <div key={i} className="flex flex-col gap-0.5">
                      <span className="flex flex-wrap items-center gap-1.5"><StatusChip tone={SEVERITY_TONE[p.severity]} size="sm">{p.severity}</StatusChip><span className="text-body-sm font-medium text-text">{p.item}</span></span>
                      <span className="text-label text-text-2">{p.note}</span>
                    </div>
                  ))}
                </div>
              )}
              {!!report.actions?.length && (
                <div className="flex flex-col gap-1.5">
                  <p className="overline-label">What to do</p>
                  <ul className="flex list-disc flex-col gap-1 pl-5 text-body-sm text-text">
                    {report.actions.map((x, i) => <li key={i}>{x.action} <span className="text-text-3">· {x.who}, {x.byWhen}</span></li>)}
                  </ul>
                </div>
              )}
              {!!report.goodPoints?.length && <p className="text-label text-success">Good: {report.goodPoints.join(' · ')}</p>}
            </section>
          )}

          {sections.map((s) => (
            <section key={s} className="flex flex-col gap-2">
              <p className="overline-label mx-1">{s}</p>
              {a.items.filter((i) => i.section === s).map((i) => {
                const r = a.results[i.id] || {};
                return (
                  <div key={i.id} className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3">
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-body-sm text-text">{i.text}</span>
                      {r.verdict === 'ok' ? <StatusChip tone="success" size="sm">OK</StatusChip> : r.verdict === 'issue' ? <StatusChip tone="danger" size="sm">Problem</StatusChip> : r.verdict === 'na' ? <StatusChip tone="neutral" size="sm">N/A</StatusChip> : <StatusChip tone="neutral" size="sm">Not checked</StatusChip>}
                    </div>
                    {r.note && <span className="text-label text-text-2">{r.note}</span>}
                    <Photos photos={r.photos || []} links={a.photoLinks} />
                  </div>
                );
              })}
            </section>
          ))}
          {a.observations.length > 0 && (
            <section className="flex flex-col gap-2">
              <p className="overline-label mx-1">Also noted</p>
              {a.observations.map((o) => (
                <div key={o.id} className="flex flex-col gap-1.5 rounded-md border border-border bg-surface p-3">
                  <span className="text-body-sm text-text">{o.note}</span>
                  <Photos photos={o.photos} links={a.photoLinks} />
                </div>
              ))}
            </section>
          )}

          {!a.byOwner && (a.status === 'submitted' || a.status === 'reported') && (
            a.paid ? (
              <Callout tone="success" icon={Wallet} title={`Paid ${inr(a.paid.amount)}`}>{`${new Date(a.paid.at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} · logged as Professional fees, paid with your own money.`}</Callout>
            ) : isOwner ? (
              <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                <Field label="Payout to the auditor (₹)"><Input type="number" inputMode="numeric" className="num" value={amount} onChange={(e) => setAmount(e.target.value)} /></Field>
                <Button leadingIcon={<Wallet />} loading={busy === 'paid'} onClick={() => run('paid', () => api.markPaid(a.id, Number(amount) || 0), 'Marked paid')}>Mark paid</Button>
              </section>
            ) : null
          )}
          {(a.status === 'assigned' || a.status === 'in_progress') && (
            <Button variant="danger-ghost" leadingIcon={<XCircle />} loading={busy === 'cancel'} onClick={() => run('cancel', () => api.cancelAudit(a.id), 'Audit cancelled')}>Cancel this audit</Button>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}

function Photos({ photos, links }: { photos: api.AuditPhoto[]; links: Record<string, string> }) {
  if (!photos.length) return null;
  return (
    <div className="flex flex-wrap gap-2">
      {photos.map((p) => links[p.path] ? (
        <a key={p.path} href={links[p.path]} target="_blank" rel="noreferrer"><img src={links[p.path]} alt="Audit photo" className="size-20 rounded-md border border-border object-cover" /></a>
      ) : null)}
    </div>
  );
}

// ---------------- Doing the audit ----------------

function AuditRunner({ id, onBack }: { id: string; onBack: () => void }) {
  const [a, setA] = useState<api.Audit | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [newNote, setNewNote] = useState('');
  const load = useCallback(() => { api.getAudit(id).then((r) => setA(r.audit)).catch((e) => toast.error((e as Error).message)); }, [id]);
  useEffect(() => { load(); }, [load]);
  if (!a) return <div className="p-4"><SkeletonListRows count={5} /></div>;

  const checked = a.items.filter((i) => a.results[i.id]?.verdict).length;
  const sections = [...new Set(a.items.map((i) => i.section))];
  const patchResult = (itemId: string, patch: Partial<api.Audit['results'][string]>) =>
    setA((cur) => cur && { ...cur, results: { ...cur.results, [itemId]: { ...(cur.results[itemId] || {}), ...patch } } });

  const start = async () => {
    setBusy('start');
    try { setA(await api.startAudit(a.id, await currentPosition())); } catch (e) { toast.error((e as Error).message || 'Could not start'); } finally { setBusy(null); }
  };
  const setVerdict = async (itemId: string, verdict: api.Verdict) => {
    const before = a.results[itemId];
    patchResult(itemId, { verdict });
    try { await api.saveItem(a.id, itemId, { verdict }); } catch (e) { patchResult(itemId, { verdict: before?.verdict }); toast.error((e as Error).message || 'Not saved'); }
  };
  const saveNote = async (itemId: string, note: string) => {
    try { await api.saveItem(a.id, itemId, { note }); } catch (e) { toast.error((e as Error).message || 'Note not saved'); }
  };
  const photo = async (target: string, file: File) => {
    setBusy(`photo:${target}`);
    try {
      const r = await api.addPhoto(a.id, target, await compressPhoto(file));
      setA((cur) => {
        if (!cur) return cur;
        const links = r.url ? { ...cur.photoLinks, [r.photo.path]: r.url } : cur.photoLinks;
        if (cur.observations.some((o) => o.id === target)) return { ...cur, photoLinks: links, observations: cur.observations.map((o) => (o.id === target ? { ...o, photos: [...o.photos, r.photo] } : o)) };
        return { ...cur, photoLinks: links, results: { ...cur.results, [target]: { ...(cur.results[target] || {}), photos: [...(cur.results[target]?.photos || []), r.photo] } } };
      });
    } catch (e) {
      toast.error((e as Error).message || 'Photo not saved');
    } finally {
      setBusy(null);
    }
  };
  const addNote = async () => {
    if (!newNote.trim()) return;
    setBusy('note');
    try { const o = await api.addObservation(a.id, newNote.trim()); setA((cur) => cur && { ...cur, observations: [...cur.observations, o] }); setNewNote(''); } catch (e) { toast.error((e as Error).message || 'Not saved'); } finally { setBusy(null); }
  };
  const submit = async () => {
    setBusy('submit');
    try { await api.submitAudit(a.id); toast.success('Submitted. Bunny is writing the report.'); onBack(); } catch (e) { toast.error((e as Error).message || 'Could not submit'); } finally { setBusy(null); }
  };

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-4 px-4 pt-4">
      <div className="flex items-center gap-2">
        <IconButton variant="ghost" icon={<ArrowLeft />} label="Back to audits" onClick={onBack} />
        <div className="flex min-w-0 flex-col">
          <span className="text-title font-semibold text-text">{a.placeName}</span>
          <span className="num text-label text-text-3">{checked} of {a.items.length} checked</span>
        </div>
      </div>
      {a.notes && <Callout tone="neutral" title="What to look at">{a.notes}</Callout>}
      {a.status === 'assigned' ? (
        <Callout tone="info" icon={MapPin} title="Start when you are at the place" action={<Button size="sm" loading={busy === 'start'} onClick={start}>Start the audit</Button>}>
          Your location is noted once, to show the visit happened there.
        </Callout>
      ) : (
        <>
          {sections.map((s) => (
            <section key={s} className="flex flex-col gap-2">
              <p className="overline-label mx-1">{s}</p>
              {a.items.filter((i) => i.section === s).map((i) => {
                const r = a.results[i.id] || {};
                return (
                  <div key={i.id} className={cn('flex flex-col gap-2 rounded-lg border bg-surface p-3', r.verdict === 'issue' ? 'border-danger-border' : 'border-border')}>
                    <p className="text-body-md text-text">{i.text}</p>
                    <div className="grid grid-cols-3 gap-2">
                      {([['ok', 'OK', CheckCircle2], ['issue', 'Problem', AlertTriangle], ['na', 'N/A', null]] as const).map(([v, label, Icon]) => (
                        <Button key={v} size="sm" variant={r.verdict === v ? (v === 'issue' ? 'danger' : 'primary') : 'secondary'} leadingIcon={Icon ? <Icon /> : undefined} aria-pressed={r.verdict === v} onClick={() => setVerdict(i.id, v)}>{label}</Button>
                      ))}
                    </div>
                    <NoteField initial={r.note || ''} placeholder={r.verdict === 'issue' ? 'What is wrong?' : 'Note (optional)'} onSave={(note) => saveNote(i.id, note)} />
                    <PhotoRow photos={r.photos || []} links={a.photoLinks} busy={busy === `photo:${i.id}`} onPhoto={(f) => photo(i.id, f)} />
                  </div>
                );
              })}
            </section>
          ))}
          <section className="flex flex-col gap-2">
            <p className="overline-label mx-1">Anything else you saw</p>
            {a.observations.map((o) => (
              <div key={o.id} className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3">
                <p className="text-body-sm text-text">{o.note}</p>
                <PhotoRow photos={o.photos} links={a.photoLinks} busy={busy === `photo:${o.id}`} onPhoto={(f) => photo(o.id, f)} />
              </div>
            ))}
            <div className="flex gap-2">
              <Input value={newNote} onChange={(e) => setNewNote(e.target.value)} placeholder="e.g. Rat droppings behind the freezer" />
              <Button variant="secondary" leadingIcon={<Plus />} loading={busy === 'note'} onClick={addNote}>Add</Button>
            </div>
          </section>
          <div className="sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom))] z-(--z-sticky) -mx-4 border-t border-border bg-surface px-4 py-3 md:bottom-0">
            <Button size="lg" className="w-full" disabled={checked < a.items.length} loading={busy === 'submit'} onClick={submit}>
              {checked < a.items.length ? `${a.items.length - checked} left to check` : 'Submit the audit'}
            </Button>
          </div>
        </>
      )}
    </div>
  );
}

function NoteField({ initial, placeholder, onSave }: { initial: string; placeholder: string; onSave: (note: string) => void }) {
  const [v, setV] = useState(initial);
  const saved = useRef(initial);
  return <Input value={v} placeholder={placeholder} maxLength={600} onChange={(e) => setV(e.target.value)} onBlur={() => { if (v !== saved.current) { saved.current = v; onSave(v); } }} />;
}

function PhotoRow({ photos, links, busy, onPhoto }: { photos: api.AuditPhoto[]; links: Record<string, string>; busy: boolean; onPhoto: (f: File) => void }) {
  const input = useRef<HTMLInputElement>(null);
  return (
    <div className="flex flex-wrap items-center gap-2">
      {photos.map((p) => links[p.path] ? <img key={p.path} src={links[p.path]} alt="" className="size-16 rounded-md border border-border object-cover" /> : null)}
      {photos.length < 4 && (
        <Button size="sm" variant="ghost" leadingIcon={<Camera />} loading={busy} onClick={() => input.current?.click()}>Photo</Button>
      )}
      <input ref={input} type="file" accept="image/*" capture="environment" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) onPhoto(f); }} />
    </div>
  );
}
