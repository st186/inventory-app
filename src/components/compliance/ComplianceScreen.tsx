// More > Compliance calendar (owner, 29 Oct 2026): licences, safety checks and staff certificates
// with their due dates (server compliance.ts). Overdue first, then the next 30 days, then later; the
// usual ones for a food business can be added in one tap. Marking one done keeps it in its history
// (with a photo of the certificate or slip, if any) and moves a repeating one to its next date.
// The owner and operations managers are reminded 30, 7 and 1 days before, and weekly while overdue.
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Camera, CheckCircle2, Clock3, FileCheck2, Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { useShell } from '../shell/ShellContext';
import { compressPhoto } from '../assets/assetsApi';
import { billLink, uploadBill } from '../money/paperworkApi';
import { Button } from '../ui/button';
import { confirm } from '../ui/confirm';
import { EmptyState } from '../ui/empty-state';
import { ErrorState } from '../ui/error-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { ListGroup, ListRow } from '../ui/list-row';
import { ResponsiveModal } from '../ui/responsive-modal';
import { NativeSelect } from '../ui/select';
import { StatusChip } from '../ui/status-chip';
import { Textarea } from '../ui/textarea';
import * as api from './complianceApi';

const repeatLabel = (r: api.Repeat) => api.REPEATS.find((x) => x.value === r)?.label || 'Once';
const dateText = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

function DueChip({ item }: { item: api.Item }) {
  const d = item.daysLeft;
  if (d === null) return <StatusChip tone="success" icon={CheckCircle2} size="sm">Done</StatusChip>;
  if (d < 0) return <StatusChip tone="danger" icon={AlertTriangle} size="sm">{-d === 1 ? '1 day late' : `${-d} days late`}</StatusChip>;
  if (d === 0) return <StatusChip tone="warning" icon={Clock3} size="sm">Due today</StatusChip>;
  if (d <= 30) return <StatusChip tone="warning" icon={Clock3} size="sm">{d === 1 ? 'Tomorrow' : `In ${d} days`}</StatusChip>;
  return <StatusChip tone="neutral" size="sm">{dateText(item.dueDate!)}</StatusChip>;
}

function Page({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto flex w-full max-w-[860px] flex-col gap-4 px-4 py-4 lg:px-8">{children}</div>;
}

export function ComplianceScreen() {
  const { stores, context } = useShell();
  const [data, setData] = useState<api.Calendar | null>(null);
  const [error, setError] = useState(false);
  const [form, setForm] = useState<{ id?: string; draft: api.Draft; hint?: string } | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const load = useCallback(() => {
    setError(false);
    api.getCalendar().then(setData).catch(() => setError(true));
  }, []);
  useEffect(() => { load(); }, [load]);

  const places = useMemo(() => [
    { value: 'all', label: 'Every place' },
    ...(stores || []).map((s) => ({ value: `store:${s.id}`, label: s.name })),
    ...((context.productionHouses || []) as { id: string; name: string }[]).map((h) => ({ value: `production:${h.id}`, label: h.name })),
  ], [stores, context.productionHouses]);
  const placeName = (p: string) => places.find((x) => x.value === p)?.label || 'Every place';

  if (error) return <Page><ErrorState onRetry={load} /></Page>;
  if (!data) return <Page><p className="text-body-sm text-text-3">…</p></Page>;

  const overdue = data.items.filter((x) => x.daysLeft !== null && x.daysLeft < 0);
  const soon = data.items.filter((x) => x.daysLeft !== null && x.daysLeft >= 0 && x.daysLeft <= 30);
  const later = data.items.filter((x) => x.daysLeft !== null && x.daysLeft > 30);
  const done = data.items.filter((x) => x.daysLeft === null);
  const open = data.items.find((x) => x.id === openId) || null;
  const blank = (s?: api.Starter): api.Draft => ({ title: s?.title || '', kind: s?.kind || 'licence', place: 'all', dueDate: '', repeat: s?.repeat || 'yearly', starter: s?.key });
  const row = (x: api.Item) => (
    <ListRow
      key={x.id}
      title={x.title}
      subtitle={[placeName(x.place), repeatLabel(x.repeat), x.handledBy].filter(Boolean).join(' · ')}
      trailing={<DueChip item={x} />}
      onClick={() => setOpenId(x.id)}
    />
  );

  return (
    <Page>
      <p className="text-body-sm text-text-2">
        Licences, safety checks and staff certificates. You and operations are reminded 30, 7 and 1 days before each is due, and every week while it is overdue.
      </p>
      <Button leadingIcon={<Plus />} className="self-start" onClick={() => setForm({ draft: blank() })}>Add</Button>

      {data.items.length === 0 && (
        <EmptyState icon={ShieldCheck} title="Nothing in the calendar yet" body="Add the usual ones below, with the date each is due." />
      )}
      {overdue.length > 0 && <ListGroup overline="Overdue">{overdue.map(row)}</ListGroup>}
      {soon.length > 0 && <ListGroup overline="In the next 30 days">{soon.map(row)}</ListGroup>}
      {later.length > 0 && <ListGroup overline="Later">{later.map(row)}</ListGroup>}
      {done.length > 0 && <ListGroup overline="Done (once only)">{done.map(row)}</ListGroup>}

      {data.starters.length > 0 && (
        <section className="flex flex-col gap-2">
          <p className="overline-label mx-1">The usual ones, not added yet</p>
          <div className="flex flex-wrap gap-2">
            {data.starters.map((s) => (
              <button key={s.key} type="button" onClick={() => setForm({ draft: blank(s), hint: s.hint })}
                className="hit-44 inline-flex h-9 items-center gap-1.5 rounded-full border border-border bg-surface px-3 text-label font-medium text-text hover:bg-surface-2">
                <Plus className="size-3.5 text-text-3" aria-hidden="true" />{s.title}
              </button>
            ))}
          </div>
        </section>
      )}

      {form && <ItemForm id={form.id} draft={form.draft} hint={form.hint} places={places} onClose={() => setForm(null)} onSaved={() => { setForm(null); load(); }} />}
      {open && (
        <ItemSheet item={open} placeName={placeName(open.place)} onClose={() => setOpenId(null)} onChanged={load}
          onEdit={() => { setOpenId(null); setForm({ id: open.id, draft: { title: open.title, kind: open.kind, place: open.place, dueDate: open.dueDate || '', repeat: open.repeat, handledBy: open.handledBy, notes: open.notes } }); }} />
      )}
    </Page>
  );
}

function ItemForm({ id, draft, hint, places, onClose, onSaved }: {
  id?: string; draft: api.Draft; hint?: string; places: { value: string; label: string }[]; onClose: () => void; onSaved: () => void;
}) {
  const [v, setV] = useState(draft);
  const [saving, setSaving] = useState(false);
  const set = (patch: Partial<api.Draft>) => setV((x) => ({ ...x, ...patch }));
  const save = async () => {
    if (v.title.trim().length < 3) { toast.error('Write what it is'); return; }
    if (!v.dueDate) { toast.error('Pick the due date'); return; }
    setSaving(true);
    try {
      if (id) await api.updateItem(id, v); else await api.addItem(v);
      toast.success('Saved');
      onSaved();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setSaving(false);
    }
  };
  return (
    <ResponsiveModal open onOpenChange={(o) => !o && onClose()} title={id ? 'Edit' : 'Add to the calendar'} description={hint} dirty={v !== draft}
      footer={<Button size="lg" fullWidth loading={saving} onClick={save}>Save</Button>}>
      <div className="flex flex-col gap-4">
        <Field label="What it is" required><Input value={v.title} maxLength={80} placeholder="e.g. FSSAI licence renewal" onChange={(e) => set({ title: e.target.value })} /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Due on" required><Input type="date" value={v.dueDate} onChange={(e) => set({ dueDate: e.target.value })} /></Field>
          <Field label="How often">
            <NativeSelect value={v.repeat} onChange={(e) => set({ repeat: e.target.value as api.Repeat })}>
              {api.REPEATS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Kind">
            <NativeSelect value={v.kind} onChange={(e) => set({ kind: e.target.value as api.Kind })}>
              {api.KINDS.map((k) => <option key={k.value} value={k.value}>{k.label}</option>)}
            </NativeSelect>
          </Field>
          <Field label="Place">
            <NativeSelect value={v.place} onChange={(e) => set({ place: e.target.value })}>
              {places.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </NativeSelect>
          </Field>
        </div>
        <Field label="Who handles it" optional><Input value={v.handledBy || ''} maxLength={60} placeholder="e.g. Aniket, or the agent's name" onChange={(e) => set({ handledBy: e.target.value })} /></Field>
        <Field label="Notes" optional><Textarea value={v.notes || ''} maxLength={400} rows={3} placeholder="Licence number, office, fee, documents needed" onChange={(e) => set({ notes: e.target.value })} /></Field>
      </div>
    </ResponsiveModal>
  );
}

function ItemSheet({ item, placeName, onClose, onChanged, onEdit }: {
  item: api.Item; placeName: string; onClose: () => void; onChanged: () => void; onEdit: () => void;
}) {
  const [doing, setDoing] = useState(false);
  const [date, setDate] = useState(() => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [busy, setBusy] = useState<'save' | 'photo' | 'delete' | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const addPhoto = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setBusy('photo');
    try { setPhotoPath(await uploadBill(await compressPhoto(file))); toast.success('Photo added'); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not add the photo'); }
    finally { setBusy(null); }
  };
  const save = async () => {
    setBusy('save');
    try {
      const { item: next } = await api.markDone(item.id, { date, note: note.trim() || undefined, photoPath: photoPath || undefined });
      toast.success(next.dueDate ? `Done. Next due ${dateText(next.dueDate)}` : 'Done');
      onChanged();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Could not save');
    } finally {
      setBusy(null);
    }
  };
  const remove = async () => {
    if (!(await confirm({ title: `Remove "${item.title}"?`, body: 'Its history goes too.', confirmLabel: 'Remove', tone: 'danger' }))) return;
    setBusy('delete');
    try { await api.removeItem(item.id); onChanged(); onClose(); }
    catch (err) { toast.error(err instanceof Error ? err.message : 'Could not remove it'); setBusy(null); }
  };
  // The tab opens on the tap itself (Safari blocks one opened after the link comes back).
  const viewPhoto = async (path: string) => {
    const tab = window.open('', '_blank');
    try {
      const url = await billLink(path);
      if (tab) tab.location.href = url; else window.open(url, '_blank', 'noopener');
    } catch (err) {
      tab?.close();
      toast.error(err instanceof Error ? err.message : 'Could not open the photo');
    }
  };

  return (
    <ResponsiveModal
      open onOpenChange={(o) => !o && onClose()}
      title={doing ? 'Mark it done' : item.title}
      description={doing ? item.title : [placeName, repeatLabel(item.repeat), item.handledBy].filter(Boolean).join(' · ')}
      onBack={doing ? () => setDoing(false) : undefined}
      footer={doing
        ? <Button size="lg" fullWidth leadingIcon={<CheckCircle2 />} loading={busy === 'save'} disabled={!!busy} onClick={save}>Save as done</Button>
        : <Button size="lg" fullWidth leadingIcon={<CheckCircle2 />} onClick={() => setDoing(true)}>Mark done</Button>}
    >
      {doing ? (
        <div className="flex flex-col gap-4">
          <Field label="Done on" required><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Note" optional><Input value={note} maxLength={300} placeholder="e.g. Renewed till Nov 2027, fee ₹2,000" onChange={(e) => setNote(e.target.value)} /></Field>
          <div className="flex flex-col gap-1.5">
            <Button variant="secondary" leadingIcon={<Camera />} loading={busy === 'photo'} disabled={!!busy} className="self-start" onClick={() => fileRef.current?.click()}>
              {photoPath ? 'Photo added · change' : 'Photo of the certificate or slip'}
            </Button>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" onChange={addPhoto} />
            {item.repeat !== 'none' && <p className="text-label text-text-3">The next one will be due {repeatLabel(item.repeat).toLowerCase()} from this date.</p>}
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between gap-3">
            <span className="text-body-md text-text">{item.dueDate ? `Due ${dateText(item.dueDate)}` : 'Done, nothing more due'}</span>
            <DueChip item={item} />
          </div>
          {item.notes && <p className="whitespace-pre-line text-body-sm text-text-2">{item.notes}</p>}
          <ListGroup overline="Done before" empty={<p className="px-4 py-3 text-body-sm text-text-3">Not done yet in the app.</p>}>
            {item.history.map((h) => (
              <ListRow key={h.at} icon={FileCheck2} iconTone="success" title={dateText(h.date)} subtitle={[h.by, h.note].filter(Boolean).join(' · ')}
                trailing={h.photoPath ? <Button size="sm" variant="ghost" onClick={() => viewPhoto(h.photoPath!)}>Photo</Button> : undefined} />
            ))}
          </ListGroup>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" leadingIcon={<Pencil />} onClick={onEdit}>Edit</Button>
            <Button size="sm" variant="danger-ghost" leadingIcon={<Trash2 />} loading={busy === 'delete'} disabled={!!busy} onClick={remove}>Remove</Button>
          </div>
        </div>
      )}
    </ResponsiveModal>
  );
}
