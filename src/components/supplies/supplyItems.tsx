// Item names for running low and shopping lists: the same catalogue as Quick Add (built-in items,
// supplies such as KOT rolls and washing powder, and items added before), and the usual buys from
// the expenses already logged - so a line on a list becomes an expense with the same name.
import { useEffect, useMemo, useState } from 'react';
import * as api from '../../utils/api';
import { idbGet, idbSet } from '../../utils/idbStore';
import { buildExpenseCandidates, searchExpenseCandidates, type ExpenseCandidate } from '../../utils/expenseMatcher';
import { INVENTORY_CATEGORIES, OVERHEAD_CATEGORY_META } from '../../utils/inventoryData';
import { normalizeItemName } from '../../utils/stringSimilarity';
import { Input } from '../ui/input';
import type { EntryKind, PlaceKind } from './suppliesApi';

const CUSTOM_ITEMS_KEY = 'shared:custom-items'; // the copy Quick Add keeps on the phone
// Running costs that are supplies someone fetches (not fuel, rent or repairs).
export const SUPPLY_OVERHEADS = ['cleaning_supplies', 'office_supplies', 'utensils', 'hygiene_ppe', 'water_jar', 'puja_expense'];
export const UNITS = ['g', 'kg', 'pcs', 'L', 'mL', 'packet', 'carton', 'box', 'roll', 'bundle'];
export const itemKey = (s: string) => normalizeItemName(s || '');

export interface ItemPick { item: string; itemBn?: string; entryType?: EntryKind; category?: string; entity?: ExpenseCandidate['entity'] }

// The catalogue, from the phone's copy first so it works without signal.
export function useSupplyCandidates() {
  const [custom, setCustom] = useState<api.CustomItem[]>([]);
  useEffect(() => {
    let fresh = false;
    idbGet<api.CustomItem[]>('cache', CUSTOM_ITEMS_KEY).then((saved) => { if (!fresh && Array.isArray(saved)) setCustom(saved); }).catch(() => undefined);
    api.getCustomItems().then((items) => { fresh = true; setCustom(items); idbSet('cache', CUSTOM_ITEMS_KEY, items); }).catch(() => undefined);
  }, []);
  return useMemo(() => buildExpenseCandidates(custom).filter((c) => c.entryType === 'inventory' || (c.entryType === 'overhead' && SUPPLY_OVERHEADS.includes(c.category))), [custom]);
}

const plain = (label: string) => label.replace(/^[^\p{L}\p{N}]+/u, '').trim();
export function categoryLabel(entryType: EntryKind | undefined, category: string | undefined): string {
  if (!category) return '';
  if (entryType === 'overhead') return plain(OVERHEAD_CATEGORY_META[category as keyof typeof OVERHEAD_CATEGORY_META]?.label || category);
  return plain((INVENTORY_CATEGORIES as Record<string, string>)[category] || category);
}
// For a new item the price-setter files: every stock category, then the supply running costs.
export const CATEGORY_OPTIONS: { value: string; entryType: EntryKind; label: string }[] = [
  ...Object.keys(INVENTORY_CATEGORIES).map((k) => ({ value: `inventory:${k}`, entryType: 'inventory' as const, label: categoryLabel('inventory', k) })),
  ...SUPPLY_OVERHEADS.map((k) => ({ value: `overhead:${k}`, entryType: 'overhead' as const, label: categoryLabel('overhead', k) })),
];

// The usual buys since a date: one per item and place, most often bought first, with the last
// quantity, unit and price - the quick picks on a new list, and the price hint when setting prices.
export interface Usual {
  item: string; entryType: EntryKind; category: string; unit: string; qty: number; placeKind: PlaceKind; placeId: string;
  n: number; lastDate: string; costPerUnit: number | null; lastAmount: number;
}
export function usualBuys(inventory: any[], overheads: any[], since: string): Usual[] {
  const map = new Map<string, Usual>();
  const add = (u: Omit<Usual, 'n'>) => {
    if (!u.placeId || !u.item) return;
    const k = `${u.placeKind}:${u.placeId}:${itemKey(u.item)}`;
    const cur = map.get(k);
    if (!cur) map.set(k, { ...u, n: 1 });
    else map.set(k, u.lastDate >= cur.lastDate ? { ...u, n: cur.n + 1 } : { ...cur, n: cur.n + 1 });
  };
  for (const e of inventory || []) {
    if (!e?.itemName || !e.date || e.date < since) continue;
    const prod = e.entityType === 'production_house';
    add({
      item: String(e.itemName), entryType: 'inventory', category: String(e.category || ''), unit: String(e.unit || 'pcs'), qty: Number(e.quantity) || 1,
      placeKind: prod ? 'production' : 'store', placeId: String((prod ? e.productionHouseId : e.storeId) || ''),
      lastDate: e.date, costPerUnit: Number(e.costPerUnit) > 0 ? Number(e.costPerUnit) : null, lastAmount: Number(e.totalCost) || 0,
    });
  }
  for (const o of overheads || []) {
    if (!o?.description || !o.date || o.date < since || !SUPPLY_OVERHEADS.includes(o.category)) continue;
    const prod = o.entityType === 'production_house';
    add({
      item: String(o.description).replace(/\s*\(.*\)\s*$/, ''), entryType: 'overhead', category: String(o.category), unit: 'pcs', qty: 1,
      placeKind: prod ? 'production' : 'store', placeId: String((prod ? o.productionHouseId : o.storeId) || ''),
      lastDate: o.date, costPerUnit: null, lastAmount: Number(o.amount) || 0,
    });
  }
  return [...map.values()].sort((a, b) => b.n - a.n || b.lastDate.localeCompare(a.lastDate));
}

// Type an item; known names (with Bengali) show under the box. A name not in the list is kept as typed.
export function ItemPicker({ candidates, onPick, placeholder, clearOnPick, initial = '', id }: {
  candidates: ExpenseCandidate[]; onPick: (p: ItemPick) => void; placeholder?: string; clearOnPick?: boolean; initial?: string; id?: string;
}) {
  const [q, setQ] = useState(initial);
  const [chosen, setChosen] = useState(initial);
  const hits = useMemo(() => (q.trim() && q !== chosen ? searchExpenseCandidates(q, candidates, 6) : []), [q, chosen, candidates]);
  const pick = (c: ExpenseCandidate) => {
    onPick({ item: c.label, itemBn: c.bengali, entryType: c.entryType === 'overhead' ? 'overhead' : 'inventory', category: c.category, entity: c.entity });
    if (clearOnPick) { setQ(''); setChosen(''); } else { setQ(c.label); setChosen(c.label); }
  };
  return (
    <div className="flex flex-col gap-1.5">
      <Input id={id} value={q} placeholder={placeholder} maxLength={60} autoComplete="off"
        onChange={(e) => { setQ(e.target.value); if (!clearOnPick) onPick({ item: e.target.value.trim() }); }}
        onKeyDown={(e) => { if (e.key === 'Enter' && clearOnPick && q.trim()) { e.preventDefault(); if (hits[0]) pick(hits[0]); else { onPick({ item: q.trim() }); setQ(''); } } }} />
      {hits.length > 0 && (
        <div className="flex flex-col overflow-hidden rounded-md border border-border bg-surface" role="listbox">
          {hits.map((h) => (
            <button key={`${h.entryType}:${h.category}:${h.label}`} type="button" role="option" aria-selected={false}
              className="flex min-h-11 items-center justify-between gap-3 border-b border-border px-3 text-left text-body-sm text-text last:border-b-0 hover:bg-surface-2"
              onClick={() => pick(h)}>
              <span>{h.label}</span>
              {h.bengali && <span className="text-label text-text-3">{h.bengali}</span>}
            </button>
          ))}
          {clearOnPick && !hits.some((h) => itemKey(h.label) === itemKey(q)) && (
            <button type="button" className="flex min-h-11 items-center px-3 text-left text-body-sm font-medium text-primary hover:bg-surface-2"
              onClick={() => { onPick({ item: q.trim() }); setQ(''); }}>
              Add &ldquo;{q.trim()}&rdquo; as a new item
            </button>
          )}
        </div>
      )}
    </div>
  );
}
