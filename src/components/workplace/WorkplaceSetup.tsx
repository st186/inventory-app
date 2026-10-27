import { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp, Camera, Cloud, Factory, HardDrive, ListChecks, Plus, Sparkles, Store, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getTemplate, saveSettings, saveTemplate, type Person, type TemplateItem, type WorkplaceAccess, type WorkplaceSettings } from './workplaceApi';
import { DAY_LETTERS, DAY_NAMES } from './workplaceUtils';
import { Button } from '../ui/button';
import { IconButton } from '../ui/icon-button';
import { Input } from '../ui/input';
import { Field } from '../ui/field';
import { NativeSelect } from '../ui/select';
import { Switch } from '../ui/switch';
import { FilterChips } from '../ui/chip';
import { NumberStepper } from '../ui/number-stepper';
import { ListGroup, ListRow } from '../ui/list-row';
import { StatusChip } from '../ui/status-chip';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { ResponsiveModal } from '../ui/responsive-modal';
import { confirm } from '../ui/confirm';
import { cn } from '../ui/utils';
import { LoadingList } from '../setup/SetupPage';

type Props = { access: WorkplaceAccess; onSettings: (s: WorkplaceSettings) => void };

const locKey = (l: { kind: string; id: string }) => `${l.kind}:${l.id}`;
const newItem = (): TemplateItem => ({ id: '', name: '', nameBn: '', hint: '', assigneeId: null, start: '15:00', end: '16:00', days: [0, 1, 2, 3, 4, 5, 6] });

function daysText(days: number[]) {
  if (days.length === 7) return 'Every day';
  if (days.length === 0) return 'No days';
  return [...days].sort().map((d) => DAY_NAMES[d]).join(', ');
}

function PersonOptions({ people }: { people: Person[] }) {
  const here = people.filter((p) => p.here);
  const others = people.filter((p) => !p.here);
  return (
    <>
      {here.length > 0 && <optgroup label="Works here">{here.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
      {others.length > 0 && <optgroup label="Other staff">{others.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</optgroup>}
    </>
  );
}

function DayToggles({ days, onToggle }: { days: number[]; onToggle: (d: number) => void }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Days">
      {DAY_LETTERS.map((d, k) => {
        const on = days.includes(k);
        return (
          <button
            key={k}
            type="button"
            onClick={() => onToggle(k)}
            title={DAY_NAMES[k]}
            aria-label={DAY_NAMES[k]}
            aria-pressed={on}
            className={cn(
              'size-11 rounded-full border text-label font-semibold outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring',
              on ? 'border-primary bg-primary-soft text-primary' : 'border-border-strong bg-surface text-text-2 hover:bg-surface-2',
            )}
          >
            {d}
          </button>
        );
      })}
    </div>
  );
}

// Checklist setup (owner and operations managers): for each store and production house, the areas
// to photograph, who does each, the daily time window (IST) and the days. A place without a saved
// list starts from the suggested one; nothing is due from anyone until people are picked and saved.
export function WorkplaceSetup({ access, onSettings }: Props) {
  const [loc, setLoc] = useState(access.locations[0] ? locKey(access.locations[0]) : '');
  const [items, setItems] = useState<TemplateItem[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [updated, setUpdated] = useState<{ at?: string; by?: string }>({});
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [bulk, setBulk] = useState({ assigneeId: '', start: '15:00', end: '16:00' });
  const [bulkOpen, setBulkOpen] = useState(false);
  const [threshold, setThreshold] = useState(access.settings.aiThreshold);
  const [thresholdOpen, setThresholdOpen] = useState(false);
  // The check being edited (its index, and a draft so Cancel leaves it as it was).
  const [editIndex, setEditIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<TemplateItem | null>(null);
  const [editOpen, setEditOpen] = useState(false);

  const place = access.locations.find((l) => locKey(l) === loc) || null;

  useEffect(() => {
    if (!place) return;
    let cancelled = false;
    setLoading(true);
    getTemplate(place.kind, place.id)
      .then((r) => {
        if (cancelled) return;
        setItems(r.template.items.map((i) => ({ ...i, hint: i.hint || '' })));
        setPeople(r.people || []);
        setIsDefault(r.isDefault);
        setUpdated({ at: r.template.updatedAt, by: r.template.updatedBy });
        setDirty(false);
      })
      .catch((e) => toast.error(e?.message || 'Could not load the checklist'))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loc]);

  const move = (i: number, by: number) => {
    setItems((list) => { const next = [...list]; const [x] = next.splice(i, 1); next.splice(Math.max(0, Math.min(next.length, i + by)), 0, x); return next; });
    setDirty(true);
    setEditIndex((cur) => (cur === null ? cur : Math.max(0, Math.min(items.length - 1, cur + by))));
  };
  const remove = (i: number) => { setItems((list) => list.filter((_, j) => j !== i)); setDirty(true); };
  const applyAll = () => {
    if (bulk.start >= bulk.end) return toast.error('The time must end after it starts');
    setItems((list) => list.map((x) => ({ ...x, start: bulk.start, end: bulk.end, ...(bulk.assigneeId ? { assigneeId: bulk.assigneeId } : {}) })));
    setDirty(true);
    setBulkOpen(false);
  };

  const switchPlace = async (v: string) => {
    if (v === loc) return;
    if (dirty) {
      const ok = await confirm({ title: 'Leave without saving?', body: 'The changes to this checklist will be lost.', confirmLabel: 'Leave without saving', tone: 'danger' });
      if (!ok) return;
    }
    setLoc(v);
  };

  const openItem = (i: number) => {
    setEditIndex(i);
    setDraft({ ...items[i] });
    setEditOpen(true);
  };

  const addCheck = () => {
    const next = newItem();
    setItems((l) => [...l, next]);
    setDirty(true);
    setEditIndex(items.length);
    setDraft({ ...next });
    setEditOpen(true);
  };

  const applyDraft = () => {
    if (editIndex === null || !draft) return;
    setItems((list) => list.map((x, j) => (j === editIndex ? draft : x)));
    setDirty(true);
    setEditOpen(false);
  };

  const save = async () => {
    if (!place) return;
    for (const it of items) {
      if (!it.name.trim()) return toast.error('Every check needs an English name');
      if (it.start >= it.end) return toast.error(`${it.name}: the time must end after it starts`);
      if (!it.days.length) return toast.error(`${it.name}: pick at least one day`);
    }
    setSaving(true);
    try {
      const r = await saveTemplate(place.kind, place.id, items.map((i) => ({ ...i, hint: i.hint?.trim() || undefined })));
      setItems(r.template.items.map((i) => ({ ...i, hint: i.hint || '' })));
      setIsDefault(false);
      setUpdated({ at: r.template.updatedAt, by: r.template.updatedBy });
      setDirty(false);
      const unassigned = r.template.items.filter((i) => !i.assigneeId).length;
      toast.success(unassigned ? `Saved - ${unassigned} check${unassigned === 1 ? '' : 's'} still without a person` : 'Saved');
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    } finally {
      setSaving(false);
    }
  };

  const saveAi = async (patch: Partial<WorkplaceSettings>) => {
    try {
      const r = await saveSettings(patch);
      onSettings(r.settings);
      setThreshold(r.settings.aiThreshold);
      toast.success('AI check settings saved');
      setThresholdOpen(false);
    } catch (e: any) {
      toast.error(e?.message || 'Could not save');
    }
  };

  const personName = (id: string | null) => (id ? people.find((p) => p.id === id)?.name || 'Someone no longer listed' : null);

  if (!access.locations.length) {
    return (
      <div className="rounded-lg border border-border bg-surface">
        <EmptyState icon={Camera} title="No stores or production houses yet" body="Add them in Setup > Stores and production houses first." />
      </div>
    );
  }

  const draftDirty = !!draft && editIndex !== null && JSON.stringify(draft) !== JSON.stringify(items[editIndex]);

  return (
    <div className="flex flex-col gap-5">
      <ListGroup
        title={<span className="inline-flex items-center gap-2"><Sparkles className="size-5 text-text-2" aria-hidden="true" />AI hygiene check</span>}
        footer={
          <span className="inline-flex items-start gap-1.5">
            {access.storage === 'drive'
              ? <><Cloud className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Photos are saved to your Google Drive (Workplace photos folder) and kept.</>
              : <><HardDrive className="mt-0.5 size-4 shrink-0" aria-hidden="true" /> Photos are kept in the app's storage for 60 days. Connect Google Drive to keep them.</>}
          </span>
        }
      >
        <label className="flex min-h-15 cursor-pointer items-center gap-3 px-4 py-2.5">
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="text-body-md font-medium text-text">Score every photo for cleanliness</span>
            <span className="text-label text-text-3">About ₹0.02 a photo, counted in the monthly AI limit</span>
          </span>
          <Switch checked={access.settings.aiEnabled} onCheckedChange={(v) => saveAi({ aiEnabled: v })} aria-label="Score every photo for cleanliness" />
        </label>
        <ListRow
          title="Needs cleaning below"
          subtitle="Marked and notified when the score is lower"
          trailing={<span className="num text-body-md font-semibold text-text">{access.settings.aiThreshold} / 10</span>}
          onClick={() => { setThreshold(access.settings.aiThreshold); setThresholdOpen(true); }}
        />
      </ListGroup>
      {access.aiConfigured === false && <Callout tone="warning" title="The AI key isn't set up yet">Photos are saved without a score until it is.</Callout>}

      <div className="flex flex-col gap-2">
        <span className="overline-label mx-1">Place</span>
        <FilterChips
          aria-label="Place"
          value={loc}
          onValueChange={switchPlace}
          options={access.locations.map((l) => ({
            value: locKey(l),
            label: <span className="inline-flex items-center gap-1.5">{l.kind === 'production' ? <Factory className="size-4" aria-hidden="true" /> : <Store className="size-4" aria-hidden="true" />}{l.name}</span>,
          }))}
        />
      </div>

      {loading ? (
        <LoadingList rows={5} />
      ) : (
        <>
          {isDefault ? (
            <Callout tone="warning" title="Suggested list for this place">Pick a person for each check and save. Nobody is asked for photos until then.</Callout>
          ) : updated.at ? (
            <p className="-mb-2 px-1 text-caption text-text-3">Last saved {new Date(updated.at).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}{updated.by ? ` by ${updated.by}` : ''}.</p>
          ) : null}

          <ListGroup
            title="Checks"
            meta={String(items.length)}
            action={<Button variant="secondary" size="sm" onClick={() => { setBulk({ assigneeId: '', start: '15:00', end: '16:00' }); setBulkOpen(true); }} disabled={!items.length}>Set for all</Button>}
            empty={<EmptyState compact icon={ListChecks} title="No checks yet" body="Add the areas to photograph every day." />}
          >
            {items.map((it, i) => {
              const who = personName(it.assigneeId);
              return (
                <ListRow
                  key={it.id || `new-${i}`}
                  title={it.name || 'New check'}
                  subtitle={<><span lang="bn">{it.nameBn}</span>{it.nameBn ? ' · ' : ''}<span className="num">{it.start}–{it.end}</span> · {daysText(it.days)}{who ? ` · ${who}` : ''}</>}
                  trailing={!it.assigneeId ? <StatusChip tone="warning">No person</StatusChip> : undefined}
                  onClick={() => openItem(i)}
                />
              );
            })}
          </ListGroup>

          <Button variant="secondary" leadingIcon={<Plus />} onClick={addCheck}>Add a check</Button>

          <div className="sticky bottom-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+12px)] z-(--z-sticky) md:bottom-4">
            <Button size="lg" fullWidth loading={saving} disabled={!dirty && !isDefault} onClick={save} className="shadow-e2">
              Save checklist
            </Button>
          </div>
        </>
      )}

      {/* One check */}
      <ResponsiveModal
        open={editOpen}
        onOpenChange={setEditOpen}
        onClosed={() => { setDraft(null); setEditIndex(null); }}
        title={draft?.name || 'New check'}
        dirty={draftDirty}
        footer={editIndex !== null ? (
          <>
            <IconButton variant="danger-ghost" label="Remove this check" icon={<Trash2 />} onClick={() => { remove(editIndex); setEditOpen(false); }} />
            <Button size="lg" className="flex-1" onClick={applyDraft}>Done</Button>
          </>
        ) : undefined}
      >
        {draft && editIndex !== null && (
          <div className="flex flex-col gap-4" data-ai-private>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Name (English)" required>
                <Input value={draft.name} onChange={(e) => setDraft({ ...draft, name: e.target.value })} maxLength={60} />
              </Field>
              <Field label="Name (Bengali)" optional>
                <Input value={draft.nameBn} onChange={(e) => setDraft({ ...draft, nameBn: e.target.value })} maxLength={60} lang="bn" />
              </Field>
            </div>
            <Field label="What to show or check" optional helper="The AI reads this too.">
              <Input value={draft.hint || ''} onChange={(e) => setDraft({ ...draft, hint: e.target.value })} maxLength={160} />
            </Field>
            <Field label="Who takes the photo">
              <NativeSelect value={draft.assigneeId || ''} onChange={(e) => setDraft({ ...draft, assigneeId: e.target.value || null })}>
                <option value="">Not assigned yet</option>
                <PersonOptions people={people} />
              </NativeSelect>
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="From">
                <Input type="time" value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} />
              </Field>
              <Field label="To">
                <Input type="time" value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} />
              </Field>
            </div>
            <div className="flex flex-col gap-1.5">
              <span className="text-body-sm font-medium text-text">Days</span>
              <DayToggles
                days={draft.days}
                onToggle={(d) => setDraft({ ...draft, days: draft.days.includes(d) ? draft.days.filter((x) => x !== d) : [...draft.days, d].sort() })}
              />
            </div>
            <div className="flex items-center gap-2 border-t border-border pt-4">
              <span className="mr-auto text-body-sm text-text-2">Order in the list</span>
              <IconButton variant="secondary" label="Move up" icon={<ArrowUp />} disabled={editIndex === 0} onClick={() => move(editIndex, -1)} />
              <IconButton variant="secondary" label="Move down" icon={<ArrowDown />} disabled={editIndex === items.length - 1} onClick={() => move(editIndex, 1)} />
            </div>
          </div>
        )}
      </ResponsiveModal>

      {/* Set for all checks */}
      <ResponsiveModal
        open={bulkOpen}
        onOpenChange={setBulkOpen}
        title="Set for all checks"
        description="Times always change; the person only when you pick one."
        footer={<Button size="lg" className="flex-1" onClick={applyAll}>Apply to all</Button>}
      >
        <div className="flex flex-col gap-4" data-ai-private>
          <Field label="Person">
            <NativeSelect value={bulk.assigneeId} onChange={(e) => setBulk({ ...bulk, assigneeId: e.target.value })}>
              <option value="">Keep each check's person</option>
              <PersonOptions people={people} />
            </NativeSelect>
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="From">
              <Input type="time" value={bulk.start} onChange={(e) => setBulk({ ...bulk, start: e.target.value })} />
            </Field>
            <Field label="To">
              <Input type="time" value={bulk.end} onChange={(e) => setBulk({ ...bulk, end: e.target.value })} />
            </Field>
          </div>
        </div>
      </ResponsiveModal>

      {/* AI threshold */}
      <ResponsiveModal
        open={thresholdOpen}
        onOpenChange={setThresholdOpen}
        title="Needs cleaning below"
        description="A photo scoring lower is marked needs cleaning and the place's incharge is told."
        dirty={threshold !== access.settings.aiThreshold}
        footer={<Button size="lg" className="flex-1" disabled={threshold === access.settings.aiThreshold} onClick={() => saveAi({ aiThreshold: threshold })}>Save</Button>}
      >
        <NumberStepper label="Score" value={threshold} onChange={setThreshold} min={1} max={10} editable unit="/ 10" />
      </ResponsiveModal>
    </div>
  );
}
