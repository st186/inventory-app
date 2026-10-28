// Customer complaints (owner and operations managers). Log a 1-star rating, a contaminated or
// rotten order, a review about dirt - with photos and what the customer said; Bunny reads the
// photos against the app's evidence for that day and week (hygiene photo scores, stuffing carried
// over, machine trouble) and says what went wrong and where it most likely happened. Confirm who
// must explain; when they have, decide: upheld (points off their monthly KPI total) or not our
// fault. Server: complaints.ts.
import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, MessageSquareWarning, Plus, RefreshCw, Sparkles, X } from 'lucide-react';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Checkbox } from '../ui/checkbox';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { NativeSelect } from '../ui/select';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { SkeletonListRows } from '../ui/skeleton';
import { StatusChip } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import { toast } from '../ui/sonner';
import { cn } from '../ui/utils';
import { compressPhoto } from '../assets/assetsApi';
import { useShell } from '../shell/ShellContext';
import * as api from './complaintsApi';

const SEVERITY_TONE: Record<api.Severity, 'neutral' | 'warning' | 'danger'> = { low: 'neutral', medium: 'warning', high: 'danger', critical: 'danger' };
const today = () => new Date(Date.now() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
const dayLabel = (d: string) => new Date(`${d}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function statusOf(c: api.Complaint): { label: string; tone: 'neutral' | 'warning' | 'danger' | 'success' | 'info' } {
  if (c.status === 'closed') return c.decision?.upheld ? { label: 'Upheld', tone: 'danger' } : { label: 'Not our fault', tone: 'success' };
  if (c.status === 'awaiting') {
    const left = c.asked.filter((p) => !c.explanations[p.id]).length;
    return left ? { label: `${left} to explain`, tone: 'warning' } : { label: 'Ready to decide', tone: 'info' };
  }
  return { label: 'To review', tone: 'info' };
}

// Bunny reads a new complaint in the background; one still "reading" after a few minutes was
// dropped on the way, so it shows as not read (with Try again).
const READING_GIVE_UP_MS = 3 * 60_000;
const isReading = (c: api.Complaint) => c.ai?.status === 'pending' && Date.now() - Date.parse(c.ai.at || '') < READING_GIVE_UP_MS;

export function ComplaintsScreen(_props: { onBack?: () => void }) {
  const [data, setData] = useState<{ complaints: api.Complaint[]; canManage: boolean } | null>(null);
  const [error, setError] = useState(false);
  const [tab, setTab] = useState<'open' | 'closed'>('open');
  const [newOpen, setNewOpen] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(false);
    api.listComplaints().then((r) => setData(r)).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);
  // While Bunny is still reading one (in the background), check back now and then.
  const reading = (data?.complaints || []).some(isReading);
  useEffect(() => {
    if (!reading) return;
    const id = setInterval(() => api.listComplaints().then((r) => setData(r)).catch(() => undefined), 8000);
    return () => clearInterval(id);
  }, [reading]);
  const list = (data?.complaints || []).filter((c) => (tab === 'open' ? c.status !== 'closed' : c.status === 'closed'));
  const current = data?.complaints.find((c) => c.id === openId) || null;
  const replace = (c: api.Complaint) => setData((d) => (d ? { ...d, complaints: [c, ...d.complaints.filter((x) => x.id !== c.id)] } : d));

  return (
    <div className="flex min-h-full flex-col">
      {/* The shell's top bar carries the title and the back arrow. */}
      <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-4 lg:px-8">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <p className="text-body-sm text-text-2">Bad ratings, contamination, hygiene. Bunny checks each one against that day's records.</p>
          {data?.canManage && <Button leadingIcon={<Plus />} onClick={() => setNewOpen(true)}>Log a complaint</Button>}
        </div>
        <SegmentedControl aria-label="Complaints" value={tab} onValueChange={(v) => setTab(v as 'open' | 'closed')} options={[{ value: 'open', label: 'Open' }, { value: 'closed', label: 'Decided' }]} />
        {error ? <ErrorState onRetry={load} /> : !data ? <SkeletonListRows count={4} /> : list.length === 0 ? (
          <EmptyState icon={MessageSquareWarning} title={tab === 'open' ? 'No open complaints' : 'Nothing decided yet'} body="Log a bad rating or review with its photos; Bunny checks it against that day's records." />
        ) : (
          <ListGroup>
            {list.map((c) => {
              const st = statusOf(c);
              return (
                <ListRow
                  key={c.id}
                  title={`${api.headline(c)} · ${dayLabel(c.orderDate)}`}
                  subtitle={[c.evidence.storeName, c.ai?.summary || c.customerText].filter(Boolean).join(' · ')}
                  trailing={<span className="flex flex-col items-end gap-1">
                    <StatusChip tone={st.tone}>{st.label}</StatusChip>
                    {c.ai?.severity && <span className="text-caption text-text-3">{c.ai.severity}</span>}
                  </span>}
                  onClick={() => setOpenId(c.id)}
                />
              );
            })}
          </ListGroup>
        )}
      </div>
      {newOpen && <NewComplaint onClose={() => setNewOpen(false)} onSaved={(c) => { replace(c); setNewOpen(false); setTab('open'); setOpenId(c.id); }} />}
      {current && <ComplaintSheet complaint={current} canManage={!!data?.canManage} onClose={() => setOpenId(null)} onChanged={replace} />}
    </div>
  );
}

function NewComplaint({ onClose, onSaved }: { onClose: () => void; onSaved: (c: api.Complaint) => void }) {
  const { stores } = useShell();
  const [open, setOpen] = useState(true);
  const [source, setSource] = useState<api.ComplaintSource>('zomato');
  const [rating, setRating] = useState<number | null>(1);
  const [orderDate, setOrderDate] = useState(today());
  const [storeId, setStoreId] = useState(stores[0]?.id || '');
  const [customerText, setCustomerText] = useState('');
  const [ownerNote, setOwnerNote] = useState('');
  const [photos, setPhotos] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const addPhotos = async (files: FileList | null) => {
    if (!files) return;
    const next = [...photos];
    for (const f of Array.from(files).slice(0, 6 - next.length)) {
      try { next.push(await compressPhoto(f)); } catch (e) { toast.error((e as Error).message); }
    }
    setPhotos(next);
  };
  const save = async () => {
    if (!storeId) { toast.error('Pick the store'); return; }
    if (!customerText.trim() && !photos.length) { toast.error('Add what the customer said or a photo'); return; }
    setSaving(true);
    try {
      const c = await api.createComplaint({ source, rating, orderDate, storeId, customerText, ownerNote, photos });
      toast.success('Logged. Bunny is reading it - you will get a notification when it is done.');
      onSaved(c);
    } catch (e) {
      toast.error((e as Error).message || 'Could not save it');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title="Log a complaint" description="Saved at once. Bunny then reads the photos, checks that day's records and sends you a notification."
      footer={<Button size="lg" className="flex-1" loading={saving} onClick={save}>{saving ? 'Saving…' : 'Save and check'}</Button>}>
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-text">Where it came from</span>
          <div className="flex flex-wrap gap-2">
            {(Object.keys(api.SOURCE_LABEL) as api.ComplaintSource[]).map((s) => (
              <button key={s} type="button" aria-pressed={source === s} onClick={() => setSource(s)}
                className={cn('hit-44 inline-flex min-h-9 items-center rounded-full border px-3 text-label font-medium', source === s ? 'border-primary bg-primary-soft font-semibold text-primary' : 'border-border-strong bg-surface text-text')}>
                {api.SOURCE_LABEL[s]}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-body-sm font-medium text-text">Rating</span>
          <div className="flex gap-2">
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" aria-pressed={rating === n} onClick={() => setRating(rating === n ? null : n)}
                className={cn('hit-44 inline-flex size-10 items-center justify-center rounded-full border text-body-sm font-semibold', rating === n ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong bg-surface text-text')}>
                {n}★
              </button>
            ))}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Order date"><Input type="date" value={orderDate} max={today()} onChange={(e) => setOrderDate(e.target.value)} className="num" /></Field>
          <Field label="Store">
            <NativeSelect value={storeId} onChange={(e) => setStoreId(e.target.value)}>
              {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field label="What the customer said">
          <Textarea value={customerText} onChange={(e) => setCustomerText(e.target.value)} maxLength={2000} rows={4} placeholder="Paste the review or write what they said" />
        </Field>
        <Field label="Your notes" optional>
          <Textarea value={ownerNote} onChange={(e) => setOwnerNote(e.target.value)} maxLength={1000} rows={2} placeholder="Order number, what you saw, anything else" />
        </Field>
        <div className="flex flex-col gap-2">
          <span className="text-body-sm font-medium text-text">Photos <span className="font-normal text-text-3">· up to 6</span></span>
          <div className="flex flex-wrap gap-2">
            {photos.map((p, i) => (
              <div key={i} className="relative">
                <img src={p} alt={`Complaint photo ${i + 1}`} className="size-20 rounded-md border border-border object-cover" />
                <button type="button" aria-label="Remove photo" onClick={() => setPhotos(photos.filter((_, j) => j !== i))} className="absolute -right-2 -top-2 flex size-7 items-center justify-center rounded-full bg-surface shadow"><X className="size-4" /></button>
              </div>
            ))}
            {photos.length < 6 && (
              <label className="flex size-20 cursor-pointer flex-col items-center justify-center gap-1 rounded-md border border-dashed border-border-strong bg-surface-2 text-label text-text-2">
                <Camera className="size-5" aria-hidden="true" /> Add
                <input type="file" accept="image/*" multiple className="sr-only" onChange={(e) => { void addPhotos(e.target.files); e.target.value = ''; }} />
              </label>
            )}
          </div>
        </div>
      </div>
    </ResponsiveModal>
  );
}

function Evidence({ c }: { c: api.Complaint }) {
  const h = (label: string, x: api.PlaceHygiene) => (
    <li>{label}: {x.photos ? `${x.avgScore ?? '—'}/10 average over ${x.photos} photos, ${x.needsCleaning} needing cleaning, ${x.severe} garbage/filth` : 'no photos that week'}{x.worst.length ? ` · lowest: ${x.worst.join(', ')}` : ''}</li>
  );
  const carried = c.evidence.ledgerDays.filter((d) => d.carriedOver.length);
  return (
    <ul className="flex list-disc flex-col gap-1 pl-4 text-body-sm text-text-2">
      {h(`${c.evidence.storeName} hygiene, week to ${dayLabel(c.orderDate)}`, c.evidence.storeHygiene)}
      {h('Production house hygiene, same week', c.evidence.productionHygiene)}
      {carried.length > 0 && <li>Stuffing carried over: {carried.map((d) => `${dayLabel(d.date)} ${d.carriedOver.join(', ')}`).join('; ')}</li>}
      {c.evidence.ledgerDays.some((d) => d.leftoverReasons.length) && <li>Day-close reasons: {c.evidence.ledgerDays.filter((d) => d.leftoverReasons.length).map((d) => `${dayLabel(d.date)} ${d.leftoverReasons.join(', ')}`).join('; ')}</li>}
      {c.evidence.machines.length > 0 && <li>Machines down: {c.evidence.machines.join(', ')}</li>}
      {c.evidence.productionChecks.length > 0 && <li>Production checks raised: {c.evidence.productionChecks.join('; ')}</li>}
      <li>On shift: store {c.evidence.storeOnShift.map((p) => p.name).join(', ') || 'nobody recorded'}; production {c.evidence.productionOnShift.map((p) => p.name).join(', ') || 'nobody recorded'}</li>
    </ul>
  );
}

function ComplaintSheet({ complaint: c, canManage, onClose, onChanged }: { complaint: api.Complaint; canManage: boolean; onClose: () => void; onChanged: (c: api.Complaint) => void }) {
  const [open, setOpen] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [picked, setPicked] = useState<string[]>(c.asked.length ? [] : c.proposed.map((p) => p.id));
  const sev = c.ai?.severity || 'medium';
  const people = [...new Map([...c.asked, ...c.proposed].map((p) => [p.id, p.name])).entries()];
  const [penalties, setPenalties] = useState<Record<string, string>>(Object.fromEntries((c.asked.length ? c.asked : c.proposed).map((p) => [p.id, String(api.PENALTY_BY_SEVERITY[sev])])));
  const [note, setNote] = useState('');
  const run = async (key: string, fn: () => Promise<api.Complaint>, ok: string) => {
    setBusy(key);
    try { onChanged(await fn()); toast.success(ok); } catch (e) { toast.error((e as Error).message || 'Could not save that'); } finally { setBusy(null); }
  };
  const ai = c.ai;
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} size="detail"
      title={`${api.headline(c)} · ${dayLabel(c.orderDate)}`} description={`${c.evidence.storeName} · logged by ${c.createdBy}`}>
      <div className="flex flex-col gap-4" data-ai-private>
        {c.photoUrls.some(Boolean) && (
          <div className="flex gap-2 overflow-x-auto pb-1">
            {c.photoUrls.filter(Boolean).map((u, i) => <a key={i} href={u!} target="_blank" rel="noreferrer"><img src={u!} alt={`Complaint photo ${i + 1}`} className="size-28 shrink-0 rounded-md border border-border object-cover" /></a>)}
          </div>
        )}
        {c.customerText && <Callout tone="neutral" title="What the customer said">{c.customerText}</Callout>}
        {c.ownerNote && <p className="text-body-sm text-text-2"><span className="font-medium text-text">Notes:</span> {c.ownerNote}</p>}

        {isReading(c) ? (
          <Callout tone="info" icon={Sparkles} title="Bunny is reading this complaint">It checks the photos against that day's records. You will get a notification when it is done.</Callout>
        ) : ai?.status === 'done' ? (
          <section className="flex flex-col gap-2 rounded-lg border border-border bg-surface p-3.5">
            <div className="flex flex-wrap items-center gap-2">
              <Sparkles className="size-4 text-primary" aria-hidden="true" />
              <span className="text-body-md font-semibold text-text">Bunny's reading</span>
              <StatusChip tone={SEVERITY_TONE[sev]}>{sev}</StatusChip>
              {ai.likelySource && <StatusChip tone="info">{api.SOURCE_PLACE[ai.likelySource]}{ai.confidence ? ` · ${ai.confidence} confidence` : ''}</StatusChip>}
            </div>
            {ai.summary && <p className="text-body-sm text-text">{ai.summary}</p>}
            {ai.issues?.length ? <div className="flex flex-wrap gap-1.5">{ai.issues.map((x, i) => <StatusChip key={i} tone="warning" icon={AlertTriangle}>{api.ISSUE_LABEL[x.kind] || x.kind}</StatusChip>)}</div> : null}
            {ai.reasoning && <p className="text-body-sm text-text-2">{ai.reasoning}</p>}
            {ai.recommendedActions?.length ? <ul className="flex list-disc flex-col gap-0.5 pl-4 text-body-sm text-text-2">{ai.recommendedActions.map((x) => <li key={x}>{x}</li>)}</ul> : null}
          </section>
        ) : (
          <Callout tone="warning" title="Bunny could not read this complaint" action={canManage ? <Button size="sm" variant="secondary" leadingIcon={<RefreshCw />} loading={busy === 'analyse'} onClick={() => run('analyse', () => api.analyseAgain(c.id), 'Bunny has read it')}>Try again</Button> : undefined}>
            {ai?.error || 'Try again in a minute.'}
          </Callout>
        )}

        <section className="flex flex-col gap-1.5">
          <h3 className="overline-label mx-1">What the records show</h3>
          <Evidence c={c} />
        </section>

        {c.asked.length > 0 && (
          <section className="flex flex-col gap-2">
            <h3 className="overline-label mx-1">Explanations</h3>
            {c.asked.map((p) => {
              const ex = c.explanations[p.id];
              return (
                <div key={p.id} className="rounded-md border border-border bg-surface p-3">
                  <p className="text-body-sm font-semibold text-text">{p.name} {ex ? '' : <span className="font-normal text-warning">· not answered yet</span>}</p>
                  {ex && <p className="text-body-sm text-text-2">{ex.text}</p>}
                </div>
              );
            })}
          </section>
        )}

        {canManage && c.status !== 'closed' && (
          <section className="flex flex-col gap-2">
            <h3 className="overline-label mx-1">{c.asked.length ? 'Ask someone else too' : 'Who must explain'}</h3>
            {c.proposed.filter((p) => !c.asked.some((a) => a.id === p.id)).map((p) => (
              <label key={p.id} className="flex min-h-11 cursor-pointer items-center gap-3">
                <Checkbox checked={picked.includes(p.id)} onCheckedChange={(v) => setPicked(v === true ? [...picked, p.id] : picked.filter((x) => x !== p.id))} />
                <span className="text-body-sm text-text">{p.name} <span className="text-text-3">· {p.why}</span></span>
              </label>
            ))}
            {picked.length > 0 && (
              <Button variant="secondary" loading={busy === 'ask'} onClick={() => run('ask', () => api.askToExplain(c.id, picked), 'Asked to explain')}>
                Ask {picked.length === 1 ? 'them' : `these ${picked.length}`} to explain
              </Button>
            )}
          </section>
        )}

        {canManage && c.status !== 'closed' && (
          <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface-2/50 p-3.5">
            <h3 className="text-body-md font-semibold text-text">Decide</h3>
            <p className="text-label text-text-3">Upheld: points come off each person's KPI total this month ({sev} severity suggests {api.PENALTY_BY_SEVERITY[sev]}). Set 0 to spare someone.</p>
            {people.map(([id, name]) => (
              <div key={id} className="flex items-center justify-between gap-3">
                <span className="text-body-sm text-text">{name}</span>
                <Input type="number" inputMode="numeric" min={0} max={50} value={penalties[id] ?? '0'} onChange={(e) => setPenalties({ ...penalties, [id]: e.target.value })} className="num h-11 w-20 text-right" aria-label={`Points off for ${name}`} />
              </div>
            ))}
            <Field label="Note" optional><Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={800} /></Field>
            <div className="flex flex-wrap gap-2">
              <Button variant="destructive" loading={busy === 'uphold'} onClick={() => run('uphold', () => api.decide(c.id, { upheld: true, note, penalties: Object.fromEntries(Object.entries(penalties).map(([k, v]) => [k, Number(v) || 0]).filter(([, v]) => (v as number) > 0)) }), 'Decided: upheld')}>Upheld, take points off</Button>
              <Button variant="secondary" leadingIcon={<CheckCircle2 />} loading={busy === 'clear'} onClick={() => run('clear', () => api.decide(c.id, { upheld: false, note, penalties: {} }), 'Closed: not our fault')}>Not our fault</Button>
            </div>
          </section>
        )}

        {c.decision && (
          <Callout tone={c.decision.upheld ? 'danger' : 'success'} title={c.decision.upheld ? 'Upheld' : 'Not our fault'}>
            {c.decision.upheld ? Object.entries(c.decision.penalties).map(([id, pts]) => `${people.find(([pid]) => pid === id)?.[1] || id} −${pts}`).join(' · ') : 'No penalty.'}
            {c.decision.note ? ` · ${c.decision.note}` : ''} · {c.decision.by}
          </Callout>
        )}
      </div>
    </ResponsiveModal>
  );
}
