// Canonical momo-type registry - single source of truth for the 7 momo types this app
// tracks through production. Before this file existed, the same 7-entry list (with
// slightly different shapes) was hand-duplicated in App.tsx's ProductionData type,
// api.ts's ProductionHouse.inventory, ProductionManagement.tsx's oldFieldMapping,
// ProductionHouseStockStatus.tsx's keyMapping, and THREE separate local arrays inside
// Analytics.tsx alone - drift between them was only a matter of time.
//
// `key` matches the field name on a `production:` record (e.g. `chickenMomos`).
// `inventoryKey` matches the field name on ProductionHouse.inventory (e.g. `chicken`).
// `globalPoolField`/`perTypePoolField` name which production-ledger pool this type draws
// from - dough/batter are shared pools across a group, stuffing/coating are per-type.
//
// Mirrored server-side at supabase/functions/make-server-c2dd9b9d/momoTypes.ts (edge
// functions can't import from src/) - this file is the source of truth; keep both in sync.
export type MomoTypeGroup = 'regular' | 'kurkure';

// Matches the 7 field names on App.tsx's ProductionData type exactly - kept as its own
// literal union (rather than `keyof ProductionData`) so this file stays dependency-free
// and importable from both frontend components and, via the server mirror, nowhere near
// App.tsx at all.
export type MomoTypeKey =
  | 'chickenMomos'
  | 'chickenCheeseMomos'
  | 'vegMomos'
  | 'cheeseCornMomos'
  | 'paneerMomos'
  | 'vegKurkureMomos'
  | 'chickenKurkureMomos';

// A discriminated union (on `group`), not one flat interface - so that narrowing on
// `t.group === 'regular'` also narrows `t.key` down to just the 5 regular-momo keys (and
// `t.globalPoolField`/`perTypePoolField` down to 'dough'/'stuffing'). A flat interface
// would leave `key` and `group` as independent, uncorrelated fields, and callers that
// index a ProductionData-shaped record with `p[t.key]` inside a `t.group === 'regular'`
// branch would lose the narrowing and see a union of both regular- and kurkure-shaped
// records instead of just one.
export type RegularMomoType = {
  key: 'chickenMomos' | 'chickenCheeseMomos' | 'vegMomos' | 'cheeseCornMomos' | 'paneerMomos';
  inventoryKey: string;
  label: string;
  group: 'regular';
  globalPoolField: 'dough';
  perTypePoolField: 'stuffing';
  color: string;
};

export type KurkureMomoType = {
  key: 'vegKurkureMomos' | 'chickenKurkureMomos';
  inventoryKey: string;
  label: string;
  group: 'kurkure';
  globalPoolField: 'batter';
  perTypePoolField: 'coating';
  color: string;
};

export type MomoType = RegularMomoType | KurkureMomoType;

export const MOMO_TYPES: readonly MomoType[] = [
  { key: 'chickenMomos', inventoryKey: 'chicken', label: 'Chicken', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing', color: '#f97316' },
  { key: 'chickenCheeseMomos', inventoryKey: 'chickenCheese', label: 'Chicken Cheese', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing', color: '#fb923c' },
  { key: 'vegMomos', inventoryKey: 'veg', label: 'Veg', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing', color: '#16a34a' },
  { key: 'cheeseCornMomos', inventoryKey: 'cheeseCorn', label: 'Cheese Corn', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing', color: '#facc15' },
  { key: 'paneerMomos', inventoryKey: 'paneer', label: 'Paneer', group: 'regular', globalPoolField: 'dough', perTypePoolField: 'stuffing', color: '#eab308' },
  { key: 'vegKurkureMomos', inventoryKey: 'vegKurkure', label: 'Veg Kurkure', group: 'kurkure', globalPoolField: 'batter', perTypePoolField: 'coating', color: '#0ea5e9' },
  { key: 'chickenKurkureMomos', inventoryKey: 'chickenKurkure', label: 'Chicken Kurkure', group: 'kurkure', globalPoolField: 'batter', perTypePoolField: 'coating', color: '#6366f1' },
] as const;

export const REGULAR_MOMO_TYPES = MOMO_TYPES.filter((t) => t.group === 'regular');
export const KURKURE_MOMO_TYPES = MOMO_TYPES.filter((t) => t.group === 'kurkure');

export function getMomoType(key: string): MomoType | undefined {
  return MOMO_TYPES.find((t) => t.key === key);
}

export function getMomoTypeByInventoryKey(inventoryKey: string): MomoType | undefined {
  return MOMO_TYPES.find((t) => t.inventoryKey === inventoryKey);
}

// Production-ledger pool ids: 'dough'/'batter' (global, shared across every momo type in
// that group) and 'stuffing:{inventoryKey}'/'coating:{inventoryKey}' (one per momo type).
// Matches the server's own ALL_POOL_IDS derivation exactly (momoTypes.ts, index.ts) - keep
// both in sync.
export const GLOBAL_POOLS = ['dough', 'batter'] as const;

export function getPerTypePoolId(momoType: Pick<MomoType, 'perTypePoolField' | 'inventoryKey'>): string {
  return `${momoType.perTypePoolField}:${momoType.inventoryKey}`;
}

// A momo type's own DEDICATED dough/batter pool - separate from the shared 'dough'/'batter'
// pool every type normally draws from. Only meaningful when a batch explicitly logs "Unique
// dough for this?" instead of relying on the shared pool (see PrepareLineItemForm) - almost
// always 0/unused, but tracked as its own pool id (e.g. 'dough:cheeseCorn') so carry-forward
// is never silently lost for the rare type that does need one.
export function getUniqueGlobalPoolId(momoType: Pick<MomoType, 'globalPoolField' | 'inventoryKey'>): string {
  return `${momoType.globalPoolField}:${momoType.inventoryKey}`;
}

export const ALL_POOL_IDS: string[] = [
  ...GLOBAL_POOLS,
  ...MOMO_TYPES.map((t) => getPerTypePoolId(t)),
  ...MOMO_TYPES.map((t) => getUniqueGlobalPoolId(t)),
];

export function getPoolLabel(poolId: string): string {
  if (poolId === 'dough') return 'Dough (shared)';
  if (poolId === 'batter') return 'Batter (shared)';
  const [field, inventoryKey] = poolId.split(':');
  const momoType = getMomoTypeByInventoryKey(inventoryKey);
  const fieldLabel = field === 'stuffing' ? 'Stuffing' : field === 'coating' ? 'Coating' : field === 'dough' ? 'Dough (unique)' : field === 'batter' ? 'Batter (unique)' : field;
  return momoType ? `${momoType.label} ${fieldLabel}` : poolId;
}
