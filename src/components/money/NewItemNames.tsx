// New item names waiting for the owner (owner, 31 Oct 2026: who decides a new name - "only me").
// Someone logged a purchase or running cost under a name the app didn't know and Bunny couldn't
// match to one on the list (server itemNameReview.ts). For each: add it as a new item (spelling and
// category fixed, so everyone gets it as a suggestion from then on), say it is the same as an item
// already there (its entries move, and the name is remembered), or leave it as a one-off.
import * as React from 'react';
import { Check, Merge, Sparkles, Tags } from 'lucide-react';
import * as api from '../../utils/api';
import { OVERHEAD_CATEGORIES, SELECTABLE_INVENTORY_CATEGORIES, SELECTABLE_OVERHEAD_CATEGORY_KEYS } from '../../utils/inventoryData';
import { Button } from '../ui/button';
import { Callout } from '../ui/callout';
import { EmptyState } from '../ui/empty-state';
import { Field } from '../ui/field';
import { Input } from '../ui/input';
import { PickerField } from '../ui/picker-sheet';
import { ResponsiveModal } from '../ui/responsive-modal';
import { SegmentedControl } from '../ui/segmented-control';
import { toast } from '../ui/sonner';
import { categoryText, stripEmoji } from './categoryDisplay';

type Known = { name: string; type: string; category: string | null };

export function useItemNames(enabled: boolean) {
  const [open, setOpen] = React.useState<api.WaitingItemName[]>([]);
  const [known, setKnown] = React.useState<Known[]>([]);
  const reload = React.useCallback(async () => {
    if (!enabled) return;
    try {
      const r = await api.getItemNames();
      setOpen(r.open);
      setKnown(r.known);
    } catch { /* shown again on the next load */ }
  }, [enabled]);
  React.useEffect(() => { void reload(); }, [reload]);
  return { names: open, known, reload };
}

const categoryItems = (type: string) => (type === 'overhead'
  ? Object.entries(OVERHEAD_CATEGORIES).filter(([k]) => SELECTABLE_OVERHEAD_CATEGORY_KEYS.includes(k))
  : Object.entries(SELECTABLE_INVENTORY_CATEGORIES)).map(([value, label]) => ({ value, label: stripEmoji(label) }));

function NameCard({ item, known, onDone }: { item: api.WaitingItemName; known: Known[]; onDone: () => void }) {
  const [mode, setMode] = React.useState<'new' | 'same'>(item.maybeSameAs ? 'same' : 'new');
  const [name, setName] = React.useState(item.cleanName || item.name);
  const [category, setCategory] = React.useState(item.category || '');
  const [same, setSame] = React.useState(item.maybeSameAs || '');
  const [busy, setBusy] = React.useState(false);
  const total = item.entries.reduce((s, e) => s + (e.amount || 0), 0);
  const last = item.entries[item.entries.length - 1];
  const sameItems = React.useMemo(() => known.filter((k) => k.type === item.type).map((k) => ({ value: k.name, label: k.name })), [known, item.type]);

  const decide = async (action: 'new' | 'same' | 'keep') => {
    setBusy(true);
    try {
      await api.decideItemName(item.key, action, action === 'new' ? name : action === 'same' ? same : undefined, action === 'new' ? category : undefined);
      toast.success(action === 'new' ? `${name} is on the list now` : action === 'same' ? `Filed under ${same}` : 'Left as it is');
      onDone();
    } catch (e: any) {
      toast.error(e?.message || "Couldn't save that. Try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-col gap-0.5">
        <span className="text-body-md font-semibold text-text">"{item.name}"</span>
        <span className="num text-label text-text-3">
          {item.type === 'overhead' ? 'Running cost' : 'Purchase'} · {categoryText(item.category)} · {item.entries.length === 1 ? '1 entry' : `${item.entries.length} entries`}, Rs {Math.round(total).toLocaleString('en-IN')}
          {last ? ` · ${last.by}${last.date ? `, ${last.date}` : ''}` : ''}
        </span>
      </div>
      {(item.cleanName || item.maybeSameAs) && (
        <p className="flex items-start gap-2 text-body-sm text-text-2">
          <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden="true" />
          {item.maybeSameAs ? `Bunny: maybe the same as ${item.maybeSameAs}.` : `Bunny: write it as ${item.cleanName}.`}
        </p>
      )}
      <SegmentedControl
        aria-label="What is it"
        value={mode}
        onValueChange={(v) => setMode(v as 'new' | 'same')}
        options={[{ value: 'new', label: 'A new item' }, { value: 'same', label: 'Same as one on the list' }]}
      />
      {mode === 'new' ? (
        <div className="flex flex-col gap-3">
          <Field label="Name on the list" helper="Spelt the way everyone should find it.">
            <Input value={name} maxLength={60} onChange={(e) => setName(e.target.value)} />
          </Field>
          <Field label="Category">
            <PickerField title="Category" items={categoryItems(item.type)} value={category || null} onValueChange={setCategory} placeholder="Choose a category" />
          </Field>
          <Button leadingIcon={<Tags />} loading={busy} disabled={!name.trim() || !category} onClick={() => decide('new')}>Add to the list</Button>
        </div>
      ) : (
        <div className="flex flex-col gap-3">
          <Field label="Same as">
            <PickerField title="Same as" items={sameItems} value={same || null} onValueChange={setSame} placeholder="Choose the item" />
          </Field>
          <Button leadingIcon={<Merge />} loading={busy} disabled={!same} onClick={() => decide('same')}>File under {same || 'it'}</Button>
        </div>
      )}
      <Button variant="ghost" size="sm" className="self-start" disabled={busy} onClick={() => decide('keep')}>Leave it as a one-off</Button>
    </div>
  );
}

export function NewItemNamesSheet({ open, onOpenChange, names, known, onChanged }: {
  open: boolean; onOpenChange: (open: boolean) => void; names: api.WaitingItemName[]; known: Known[]; onChanged: () => void;
}) {
  return (
    <ResponsiveModal open={open} onOpenChange={onOpenChange} title="New item names" description="Names someone typed that aren't on the list yet. Only you decide them." size="detail">
      {names.length === 0 ? (
        <EmptyState compact icon={Check} title="Nothing to check" body="New names come here when Bunny can't match them to the list." />
      ) : (
        <div className="flex flex-col gap-3">
          {names.map((n) => <NameCard key={n.key} item={n} known={known} onDone={onChanged} />)}
        </div>
      )}
    </ResponsiveModal>
  );
}

/** The owner's banner on Money > Expenses, and the sheet it opens. */
export function NewItemNamesBanner({ enabled }: { enabled: boolean }) {
  const { names, known, reload } = useItemNames(enabled);
  const [open, setOpen] = React.useState(false);
  if (!enabled || names.length === 0) return null;
  return (
    <>
      <Callout
        tone="info"
        icon={Tags}
        title={names.length === 1 ? '1 new item name to check' : `${names.length} new item names to check`}
        action={<Button size="sm" variant="secondary" onClick={() => setOpen(true)}>Review</Button>}
      >
        {names.slice(0, 3).map((n) => `"${n.name}"`).join(' · ')}{names.length > 3 ? ' · …' : ''}
      </Callout>
      <NewItemNamesSheet open={open} onOpenChange={setOpen} names={names} known={known} onChanged={reload} />
    </>
  );
}
