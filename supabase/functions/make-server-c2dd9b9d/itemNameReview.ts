// One item, one name (owner, 31 Oct 2026: "if someone types a new item ... it will create different
// names of same items" - and on who decides a new name: "only me"). Three steps for every purchase
// or running-cost entry:
//   1. At save (nameFor): a name the app knows under another spelling, capitals, or a Bengali word
//      (itemNames.ts matchName, or an alias decided before) is saved under the known name, the
//      typed one kept as typedAs; and a known running cost goes under its own category
//      (RUNNING_HOMES, like itemHome.ts does for ingredients).
//   2. After the response (reviewNewName): a name still unknown is read by Bunny against the list.
//      Sure it is the same as one there: the entry is filed under it and the alias remembered.
//      Otherwise the name waits for the owner.
//   3. The owner (only) decides each waiting name: a new item (spelling and category fixed, added
//      to the item list), the same as an item already there (its entries moved, the alias
//      remembered), or leave it as a one-off.
//
//   item-name:{nameKey}    a name waiting for the owner, with its entries   (status open / decided)
//   item-alias:{nameKey}   a typed name decided to mean a known item        { name, category, type }
//
// Only item-like entries are checked: every purchase, and running costs in ITEM_LIKE_RUNNING with
// a short name - "Fridge door repair by Raju" is a description, not an item.
import { matchName, nameKey, type KnownItem } from './itemNames.ts';

export type EntryType = 'inventory' | 'overhead';

// Running costs that name one thing, and where each known one goes. Toto and Rapido are left out:
// a ride can be goods transport or a person's travel.
export const ITEM_LIKE_RUNNING = new Set(['cleaning_supplies', 'utensils', 'office_supplies', 'hygiene_ppe', 'puja_expense', 'water_jar']);
export const RUNNING_HOMES: Record<string, string> = {
  Breakfast: 'breakfast', Lunch: 'lunch', Dinner: 'dinner', 'Evening Snacks': 'evening_snacks', Tea: 'evening_snacks',
  Petrol: 'fuel', 'Water Jar': 'water_jar', Dhup: 'puja_expense', Gloves: 'hygiene_ppe', Cap: 'hygiene_ppe', 'Hair Net': 'hygiene_ppe',
  Nirma: 'cleaning_supplies', Colin: 'cleaning_supplies', Phenyl: 'cleaning_supplies', 'Garbage Bag': 'cleaning_supplies', Duster: 'cleaning_supplies',
  'Gas Lighter': 'utensils', 'Labour Charge': 'labour_charge', Party: 'staff_welfare', 'KOT Rolls': 'office_supplies',
};

/** A name worth checking: a purchase, or a short running-cost name in an item-like category. */
export function itemLike(type: EntryType, category: string, name: string): boolean {
  const n = String(name || '').trim();
  if (!n || n.length > 40 || n.split(/\s+/).length > 5) return false;
  return type === 'inventory' || ITEM_LIKE_RUNNING.has(category);
}

/**
 * The name and category to save: a known item's name for a misspelt / differently written one
 * (same type first), and a known running cost's own category. typedAs is set when the name changed.
 */
export function settleName(typed: string, type: EntryType, category: string, known: KnownItem[], aliases: Map<string, KnownItem>):
  { name: string; category: string; typedAs?: string; how?: string } {
  const raw = String(typed || '').trim();
  const alias = aliases.get(nameKey(raw));
  const sameType = known.filter((k) => !k.type || k.type === type);
  const hit = alias ? { item: alias, how: 'alias' } : matchName(raw, sameType) || matchName(raw, known);
  const name = hit ? hit.item.name : raw;
  const home = type === 'overhead' ? RUNNING_HOMES[name] : undefined;
  const itemCat = hit && (hit.item.type || type) === type ? hit.item.category : null;
  // A running cost keeps a category from its own type only; purchases are settled by itemHome.ts.
  const cat = home || (type === 'overhead' && itemCat ? itemCat : category);
  return { name, category: cat, ...(name !== raw ? { typedAs: raw, how: hit!.how } : {}) };
}

type Kv = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<any>;
};
export type NameReviewDeps = {
  kv: Kv;
  rows: (prefix: string) => Promise<any[]>;                 // paginated prefix read
  known: () => Promise<KnownItem[]>;
  ownerIds: () => Promise<string[]>;                       // the owner's logins
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<unknown>;
  askBunny: (prompt: { typed: string; filedUnder: string; type: EntryType; items: string[] }) => Promise<{ sameAs: string; confident: boolean; cleanName: string }>;
  addToList: (item: { itemName: string; category: string; entryType: EntryType; entityType?: string }) => Promise<unknown>;
  categoryLabel: (category: string) => string;
};

export async function loadAliases(deps: Pick<NameReviewDeps, 'rows'>): Promise<Map<string, KnownItem>> {
  const rows = await deps.rows('item-alias:').catch(() => []);
  return new Map((rows || []).filter((r: any) => r?.key && r?.name).map((r: any) => [r.key, { name: r.name, category: r.category, type: r.type }]));
}

const nameField = (type: EntryType) => (type === 'inventory' ? 'itemName' : 'description');
const placeOf = (row: any) => row?.storeId || row?.productionHouseId || '';

// Renames saved entries to `name` (and category), keeping what was typed.
async function rename(deps: NameReviewDeps, keys: string[], name: string, category: string | null) {
  for (const key of keys) {
    const row = await deps.kv.get(key).catch(() => null);
    if (!row) continue;
    const type: EntryType = key.startsWith('inventory:') ? 'inventory' : 'overhead';
    const typed = String(row[nameField(type)] || '');
    if (typed === name && (!category || row.category === category)) continue;
    await deps.kv.set(key, {
      ...row, [nameField(type)]: name, ...(category ? { category } : {}),
      ...(typed !== name && !row.typedAs ? { typedAs: typed } : {}), nameCheckedAt: new Date().toISOString(),
    });
  }
}

/** After an entry with a name the app didn't know is saved: Bunny, then the owner's list. */
export async function reviewNewName(deps: NameReviewDeps, o: { key: string; type: EntryType; row: any; by: string; byOwner: boolean }) {
  const typed = String(o.row?.[nameField(o.type)] || '').trim();
  const nk = nameKey(typed);
  if (!nk || !itemLike(o.type, String(o.row?.category || ''), typed) || o.byOwner) return;
  const known = await deps.known();
  if (known.some((k) => nameKey(k.name) === nk)) return;
  const waiting = await deps.kv.get(`item-name:${nk}`).catch(() => null);
  if (waiting?.status === 'kept') return; // the owner said this name is fine as it is
  const entry = { key: o.key, date: o.row.date || null, amount: Number(o.type === 'inventory' ? o.row.totalCost : o.row.amount) || 0, place: placeOf(o.row), by: o.by };
  if (waiting?.status === 'open') {
    if (!(waiting.entries || []).some((e: any) => e.key === o.key)) await deps.kv.set(`item-name:${nk}`, { ...waiting, entries: [...(waiting.entries || []), entry], lastAt: new Date().toISOString() });
    return;
  }
  // Bunny reads it against the names of this kind already on the list.
  let verdict: { sameAs: string; confident: boolean; cleanName: string } | null = null;
  const sameType = known.filter((k) => !k.type || k.type === o.type);
  try {
    verdict = await deps.askBunny({ typed, filedUnder: String(o.row.category || ''), type: o.type, items: [...new Set(sameType.map((k) => k.name))].slice(0, 400) });
  } catch (e: any) {
    console.error('[item names] Bunny could not read the name:', e?.message || e);
  }
  const same = verdict?.sameAs ? sameType.find((k) => k.name === verdict!.sameAs) : null;
  if (same && verdict!.confident) {
    const category = o.type === 'overhead' ? (RUNNING_HOMES[same.name] || same.category || null) : null;
    await rename(deps, [o.key], same.name, category);
    await deps.kv.set(`item-alias:${nk}`, { key: nk, name: same.name, category: same.category || null, type: o.type, by: 'Bunny', typed, at: new Date().toISOString() });
    return;
  }
  const now = new Date().toISOString();
  const record = {
    key: nk, name: typed, type: o.type, category: o.row.category || '', entityType: o.row.entityType || null,
    cleanName: String(verdict?.cleanName || '').slice(0, 60) || null, maybeSameAs: same?.name || null,
    entries: [entry], status: 'open', firstAt: now, lastAt: now,
  };
  await deps.kv.set(`item-name:${nk}`, record);
  for (const id of await deps.ownerIds()) {
    await deps.notifyUser(id, 'item_name_pending', 'New item name to check',
      `${o.by} logged "${typed}" (${deps.categoryLabel(record.category)}, Rs ${entry.amount}), a name not on the list.${record.maybeSameAs ? ` Maybe the same as ${record.maybeSameAs}?` : ''} Money > Expenses > New names.`,
      nk, record.entries[0].date || undefined).catch(() => undefined);
  }
}

/** The owner's decision on a waiting name. */
export async function decideName(deps: NameReviewDeps, nk: string, d: { action: 'new' | 'same' | 'keep'; name?: string; category?: string; by: string }):
  Promise<{ error?: string; record?: any }> {
  const rec = await deps.kv.get(`item-name:${nk}`);
  if (!rec || rec.status !== 'open') return { error: 'That name was already decided' };
  const keys = (rec.entries || []).map((e: any) => e.key);
  const now = new Date().toISOString();
  if (d.action === 'keep') {
    const done = { ...rec, status: 'kept', decidedBy: d.by, decidedAt: now };
    await deps.kv.set(`item-name:${nk}`, done);
    return { record: done };
  }
  const name = String(d.name || '').replace(/\s+/g, ' ').trim();
  if (!name || name.length > 60) return { error: 'Type the item name' };
  if (d.action === 'same') {
    const known = await deps.known();
    const target = known.find((k) => k.name === name && (!k.type || k.type === rec.type)) || known.find((k) => k.name === name);
    if (!target) return { error: `${name} isn't on the list` };
    const category = rec.type === 'overhead' ? (RUNNING_HOMES[target.name] || target.category || null) : (target.category || null);
    await rename(deps, keys, target.name, category);
    await deps.kv.set(`item-alias:${nk}`, { key: nk, name: target.name, category: target.category || null, type: rec.type, by: d.by, typed: rec.name, at: now });
    const done = { ...rec, status: 'merged', into: target.name, decidedBy: d.by, decidedAt: now };
    await deps.kv.set(`item-name:${nk}`, done);
    return { record: done };
  }
  // A new item: on the list from now on, with the spelling and category the owner gave.
  const category = String(d.category || rec.category || '').trim();
  if (!category) return { error: 'Pick a category' };
  await deps.addToList({ itemName: name, category, entryType: rec.type, entityType: rec.entityType || undefined });
  await rename(deps, keys, name, category);
  if (nameKey(name) !== nk) await deps.kv.set(`item-alias:${nk}`, { key: nk, name, category, type: rec.type, by: d.by, typed: rec.name, at: now });
  const done = { ...rec, status: 'added', into: name, category, decidedBy: d.by, decidedAt: now };
  await deps.kv.set(`item-name:${nk}`, done);
  return { record: done };
}
