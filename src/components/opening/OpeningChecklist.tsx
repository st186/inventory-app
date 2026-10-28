// Store opening checklist on Home (owner, 28 Oct 2026; server openingChecklist.ts).
//   OpeningChecklistCard - for whoever opens the store today (the incharge, or the cover person on
//     their leave days): progress, the due time, and the list to tick one by one.
//   OpeningOverview - for the owner and ops: each store's progress, picking who opens when everyone
//     set up is on leave, and who does it (with the last two weeks' scores).
import { useCallback, useEffect, useState } from 'react';
import { CheckCircle2, ClipboardCheck, Settings2, UserPlus } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { Checkbox } from '../ui/checkbox';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ResponsiveModal } from '../ui/responsive-modal';
import { NativeSelect } from '../ui/select';
import { StatusChip } from '../ui/status-chip';
import { cn } from '../ui/utils';
import { useT } from '../../utils/i18n';
import { fmt12, timeOfIso } from '../workplace/workplaceUtils';
import * as api from './openingApi';

export function useOpeningToday() {
  const [data, setData] = useState<Awaited<ReturnType<typeof api.getOpeningToday>> | null>(null);
  const reload = useCallback(() => { api.getOpeningToday().then(setData).catch(() => undefined); }, []);
  useEffect(() => { reload(); }, [reload]);
  return { data, setData, reload };
}

export const nowHHMM = () => new Date(Date.now() + 330 * 60000).toISOString().slice(11, 16);

function Progress({ done, total }: { done: number; total: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-surface-3" role="progressbar" aria-valuemin={0} aria-valuemax={total} aria-valuenow={done}>
      <div className={cn('h-full rounded-full', done >= total ? 'bg-success' : 'bg-primary')} style={{ width: `${total ? (done / total) * 100 : 0}%` }} />
    </div>
  );
}

export function OpeningChecklistCard() {
  const { t, lang } = useT();
  const { data, setData } = useOpeningToday();
  const [open, setOpen] = useState<string | null>(null);
  const mine = data?.mine || [];
  if (!mine.length) return null;
  const replace = (c: api.OpeningChecklist) => setData((d) => d && { ...d, mine: d.mine.map((x) => (x.storeId === c.storeId ? c : x)) });
  return (
    <>
      {mine.map((c) => {
        const allDone = c.done >= c.total;
        const late = !allDone && nowHHMM() > c.dueBy;
        return (
          <section key={c.storeId} className={cn('flex flex-col gap-3 rounded-lg border bg-surface p-4', late ? 'border-danger-border' : 'border-border')}>
            <div className="flex items-start justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2.5">
                <ClipboardCheck className="size-5 shrink-0 text-primary" aria-hidden="true" />
                <div className="flex min-w-0 flex-col">
                  <span className="text-body-md font-semibold text-text">{t('opening.title')}</span>
                  <span className="text-label text-text-3">{c.storeName}</span>
                </div>
              </div>
              {allDone ? <StatusChip tone="success" icon={CheckCircle2}>{t('opening.done')}</StatusChip> : late ? <StatusChip tone="danger">{t('opening.lateChip')}</StatusChip> : null}
            </div>
            <Progress done={c.done} total={c.total} />
            <p className="num text-body-sm text-text-2">{t('opening.progress', { done: c.done, total: c.total, time: fmt12(c.dueBy) })}</p>
            {(c.doerAs === 'cover' || c.doerAs === 'backup' || c.doerAs === 'picked') && <p className="text-label font-medium text-primary">{t('opening.covering', { name: c.assigneeName })}</p>}
            <Button variant={allDone ? 'secondary' : 'primary'} onClick={() => setOpen(c.storeId)}>{allDone ? t('opening.see') : t('opening.open')}</Button>
          </section>
        );
      })}
      {open && (() => {
        const c = mine.find((x) => x.storeId === open);
        return c ? <ChecklistSheet checklist={c} lang={lang} onClose={() => setOpen(null)} onChange={replace} /> : null;
      })()}
    </>
  );
}

function ChecklistSheet({ checklist: c, lang, onClose, onChange }: { checklist: api.OpeningChecklist; lang: string; onClose: () => void; onChange: (c: api.OpeningChecklist) => void }) {
  const { t } = useT();
  const [open, setOpen] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const label = (b: { name: string; nameBn: string }) => (lang === 'bn' && b.nameBn ? b.nameBn : b.name);
  const toggle = async (b: api.OpeningBox) => {
    const done = !b.tick;
    setSaving(b.id);
    // Ticked straight away on screen; put back if the save fails.
    onChange({ ...c, items: c.items.map((x) => (x.id === b.id ? { ...x, tick: done ? { at: new Date().toISOString(), byId: '', byName: '' } : null } : x)), done: c.done + (done ? 1 : -1) });
    try {
      onChange(await api.tickOpening(c.storeId, b.id, done));
    } catch (e) {
      onChange(c);
      toast.error((e as Error).message || t('opening.failed'));
    } finally {
      setSaving(null);
    }
  };
  // Machines and their parts are shown under one heading.
  const rows: ({ kind: 'head'; title: string } | { kind: 'box'; box: api.OpeningBox })[] = [];
  let lastGroup = '';
  for (const b of c.items) {
    if (b.group && b.group !== lastGroup) rows.push({ kind: 'head', title: lang === 'bn' && b.groupBn ? b.groupBn : b.group });
    lastGroup = b.group || '';
    rows.push({ kind: 'box', box: b });
  }
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title={t('opening.title')}
      description={`${c.storeName} · ${t('opening.progress', { done: c.done, total: c.total, time: fmt12(c.dueBy) })}`}>
      <div className="flex flex-col gap-1">
        {rows.map((r, i) => r.kind === 'head' ? (
          <p key={`h${i}`} className="overline-label mt-3 mb-1 px-1">{r.title}</p>
        ) : (
          <label key={r.box.id} className={cn('flex min-h-12 cursor-pointer items-center gap-3 rounded-md px-2 py-2 hover:bg-surface-2', r.box.group && 'pl-4')}>
            <Checkbox checked={!!r.box.tick} disabled={saving === r.box.id} onCheckedChange={() => toggle(r.box)} />
            <span className="flex min-w-0 flex-1 flex-col">
              <span className={cn('text-body-md', r.box.tick ? 'text-text-2' : 'text-text')}>{label(r.box)}</span>
              {r.box.tick?.byName && <span className="num text-caption text-text-3">{t('opening.tickedAt', { time: timeOfIso(r.box.tick.at) })}</span>}
            </span>
          </label>
        ))}
        {c.done >= c.total && <Callout tone="success" icon={CheckCircle2} title={t('opening.allDone')} />}
      </div>
    </ResponsiveModal>
  );
}

// ---------------- Owner and ops ----------------

// For the owner and ops the checklist is not a Home card: Home lists it under "Needs your
// attention" only when a store's list is late or someone must be picked, and opens this sheet.
// Set up lives in More > Store opening checklist (owner, 28 Oct 2026).
export function OpeningOverviewSheet({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title="Store opening checklist">
      <OpeningOverview />
    </ResponsiveModal>
  );
}

export function OpeningOverview() {
  const { data, setData, reload } = useOpeningToday();
  const [setupOpen, setSetupOpen] = useState(false);
  const [pickFor, setPickFor] = useState<api.OpeningChecklist | null>(null);
  if (!data?.overview) return null;
  const list = data.overview;
  return (
    <>
      <section className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2.5">
            <ClipboardCheck className="size-5 text-primary" aria-hidden="true" />
            <span className="text-body-md font-semibold text-text">Store opening checklist</span>
          </div>
          <Button size="sm" variant="ghost" leadingIcon={<Settings2 />} onClick={() => setSetupOpen(true)}>Set up</Button>
        </div>
        {!list.length && <p className="text-body-sm text-text-2">Not set up yet. Pick who ticks it before the store opens.</p>}
        {list.map((c) => {
          if (c.startsOn) {
            return (
              <div key={c.storeId} className="flex flex-col">
                <span className="text-body-sm font-medium text-text">{c.storeName}</span>
                <span className="text-label text-text-2">Starts {new Date(`${c.startsOn}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {c.assigneeName || 'nobody yet'} ticks it by {fmt12(c.dueBy)}</span>
              </div>
            );
          }
          const late = c.done < c.total && nowHHMM() > c.dueBy;
          return (
            <div key={c.storeId} className="flex flex-col gap-2">
              <div className="flex flex-col">
                <span className="text-body-sm font-medium text-text">{c.storeName}</span>
                <span className={cn('num text-label', late ? 'text-danger' : 'text-text-2')}>{c.done} of {c.total} ready · {c.doerName || 'nobody yet'} · due by {fmt12(c.dueBy)}</span>
              </div>
              <Progress done={c.done} total={c.total} />
              {c.needsPick && (
                <Callout tone="warning" title={`${c.assigneeName} and ${c.coverName || 'the cover'} are on leave`}
                  action={<Button size="sm" variant="secondary" leadingIcon={<UserPlus />} onClick={() => setPickFor(c)}>Pick who</Button>}>
                  Pick who ticks today's opening checklist.
                </Callout>
              )}
            </div>
          );
        })}
      </section>
      {pickFor && <PickSheet checklist={pickFor} onClose={() => setPickFor(null)} onPicked={(c) => setData((d) => d && { ...d, overview: d.overview?.map((x) => (x.storeId === c.storeId ? c : x)) })} />}
      {setupOpen && <SetupSheet onClose={() => { setSetupOpen(false); reload(); }} />}
    </>
  );
}

function PickSheet({ checklist: c, onClose, onPicked }: { checklist: api.OpeningChecklist; onClose: () => void; onPicked: (c: api.OpeningChecklist) => void }) {
  const [open, setOpen] = useState(true);
  const [people, setPeople] = useState<{ id: string; name: string }[]>([]);
  const [who, setWho] = useState('');
  const [saving, setSaving] = useState(false);
  useEffect(() => { api.getOpeningSetup().then((s) => setPeople(s.people)).catch(() => undefined); }, []);
  const save = async () => {
    setSaving(true);
    try { onPicked(await api.pickOpening(c.storeId, who)); toast.success('They have been told'); setOpen(false); } catch (e) { toast.error((e as Error).message || 'Could not save that'); } finally { setSaving(false); }
  };
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title="Who opens the store today?" description={c.storeName}
      footer={<Button size="lg" className="flex-1" loading={saving} disabled={!who} onClick={save}>Pick and tell them</Button>}>
      <Field label="Person">
        <NativeSelect value={who} onChange={(e) => setWho(e.target.value)}>
          <option value="">Pick one</option>
          {people.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </NativeSelect>
      </Field>
    </ResponsiveModal>
  );
}

function SetupSheet({ onClose }: { onClose: () => void }) {
  const [open, setOpen] = useState(true);
  const [setup, setSetup] = useState<api.OpeningSetup | null>(null);
  const [storeId, setStoreId] = useState('');
  const [form, setForm] = useState({ assigneeId: '', coverId: '', backupId: '', dueBy: '16:00', coverDueBy: '17:30' });
  const [saving, setSaving] = useState(false);
  useEffect(() => {
    api.getOpeningSetup().then((s) => {
      setSetup(s);
      const first = s.templates[0]?.storeId || s.stores[0]?.id || '';
      setStoreId(first);
    }).catch((e) => toast.error((e as Error).message || 'Could not load'));
  }, []);
  useEffect(() => {
    const t = setup?.templates.find((x) => x.storeId === storeId);
    setForm({ assigneeId: t?.assigneeId || '', coverId: t?.coverId || '', backupId: t?.backupId || '', dueBy: t?.dueBy || '16:00', coverDueBy: t?.coverDueBy || '17:30' });
  }, [setup, storeId]);
  const save = async () => {
    if (!form.assigneeId) { toast.error('Pick who does it'); return; }
    setSaving(true);
    try {
      await api.saveOpeningSetup({ storeId, assigneeId: form.assigneeId, coverId: form.coverId || null, backupId: form.backupId || null, dueBy: form.dueBy, coverDueBy: form.coverDueBy });
      toast.success('Saved');
      setOpen(false);
    } catch (e) {
      toast.error((e as Error).message || 'Could not save that');
    } finally {
      setSaving(false);
    }
  };
  const person = (key: 'assigneeId' | 'coverId' | 'backupId', label: string, helper?: string, optional = false) => (
    <Field label={label} helper={helper} optional={optional}>
      <NativeSelect value={form[key]} onChange={(e) => setForm({ ...form, [key]: e.target.value })}>
        <option value="">{optional ? 'Nobody' : 'Pick one'}</option>
        {(setup?.people || []).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
      </NativeSelect>
    </Field>
  );
  const history = setup?.history?.[storeId] || [];
  return (
    <ResponsiveModal open={open} onOpenChange={(o) => !o && setOpen(false)} onClosed={onClose} title="Store opening checklist" size="detail"
      description="Reminder at 9 AM; each item ticked by the due time counts in full, later that day half. The day's score is the 'Store ready on time' KPI."
      footer={<Button size="lg" className="flex-1" loading={saving} disabled={!setup || !storeId} onClick={save}>Save</Button>}>
      {!setup ? <p className="text-body-sm text-text-2">Loading…</p> : (
        <div className="flex flex-col gap-4">
          {setup.stores.length > 1 && (
            <Field label="Store">
              <NativeSelect value={storeId} onChange={(e) => setStoreId(e.target.value)}>
                {setup.stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </NativeSelect>
            </Field>
          )}
          {person('assigneeId', 'Who does it', 'Usually the store incharge.')}
          {person('coverId', 'If they are on leave', 'Due by the cover time below.', true)}
          {person('backupId', 'If both are on leave', 'Nobody: you are asked to pick on the day.', true)}
          <div className="grid grid-cols-2 gap-3">
            <Field label="Due by"><Input type="time" className="num" value={form.dueBy} onChange={(e) => setForm({ ...form, dueBy: e.target.value })} /></Field>
            <Field label="Due by (cover)"><Input type="time" className="num" value={form.coverDueBy} onChange={(e) => setForm({ ...form, coverDueBy: e.target.value })} /></Field>
          </div>
          {history.length > 0 && (
            <section className="flex flex-col gap-1">
              <p className="overline-label mx-1">Last two weeks</p>
              {history.map((h) => (
                <div key={h.date} className="flex items-center justify-between gap-2 border-b border-border py-1.5 text-body-sm last:border-b-0">
                  <span className="text-text-2">{new Date(`${h.date}T00:00:00`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })} · {h.doerName || 'nobody'}</span>
                  <span className={cn('num font-medium', (h.score ?? 0) >= 0.999 ? 'text-success' : (h.score ?? 0) >= 0.5 ? 'text-warning' : 'text-danger')}>{h.done}/{h.total} · {Math.round((h.score ?? 0) * 100)}%</span>
                </div>
              ))}
            </section>
          )}
        </div>
      )}
    </ResponsiveModal>
  );
}
