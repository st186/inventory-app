// Equipment & assets register: what counts as equipment, how an expense becomes a register
// entry, and how the register is kept in step with the expenses. Owner, 27 Oct 2026: "list what
// we have in the production house and store, and from now on any purchase of equipment, bins,
// storage things, pans should be listed in assets from expense".
//
// Mirrored byte-for-byte at supabase/functions/make-server-c2dd9b9d/assetRules.ts so the server's
// reconcile and the app's "will be added to Equipment & assets" hint agree: keep both copies
// identical. No imports, so the file runs unchanged in the browser and in Deno.

export type AssetCategory =
  | 'cooking_equipment' | 'refrigeration' | 'storage_bins' | 'utensils_pans' | 'furniture'
  | 'electrical_lighting' | 'cleaning' | 'vehicle' | 'other';
export type AssetCondition = 'good' | 'needs_repair' | 'broken' | 'missing' | 'disposed';
export type AssetLocationKind = 'store' | 'production_house';
export type ExpensePrefix = 'inventory' | 'overhead';

// What the linked expense said when it no longer matches a confirmed entry.
export interface ExpenseSnapshot {
  name: string;
  quantity: number;
  totalCost: number;
  purchaseDate: string;
  locationKind: AssetLocationKind;
  locationId: string;
}

export interface Asset {
  id: string;
  name: string;
  category: AssetCategory;
  locationKind: AssetLocationKind;
  locationId: string; // '' only for an expense that named no store or production house
  quantity: number;
  unitCost: number | null;
  totalCost: number | null;
  purchaseDate: string | null;
  condition: AssetCondition;
  photo?: { path: string; uploadedAt: string } | null;
  notes: string;
  source: {
    kind: 'opening' | 'expense';
    expenseId?: string;
    expensePrefix?: ExpensePrefix;
    // The expense as last applied or confirmed - a different one means it was edited since.
    fingerprint?: string;
    // The category reconcile guessed, so a re-guess never overwrites someone's own choice.
    guessedCategory?: AssetCategory;
    // Kept on purpose after its expense was deleted or re-filed: no longer followed.
    unlinked?: boolean;
    // Added because Bunny read the name as equipment (the keywords didn't know it): why.
    aiWhy?: string;
  };
  needsReview: boolean;
  // Set on a confirmed entry whose expense was later edited or deleted: shown for someone to
  // decide, never applied on its own.
  expenseChanged?: { at: string; kind: 'changed' | 'deleted' | 'not_equipment'; fingerprint?: string; expense?: ExpenseSnapshot } | null;
  // "Not equipment" (or deleted by the owner): kept as a marker so reconcile doesn't add it again.
  dismissed?: boolean;
  dismissedAt?: string;
  dismissedBy?: string;
  disposedAt?: string | null;
  // Reported missing (owner, 30 Oct 2026: "suppose there is a equipment or asset lost how can we
  // report that"): until it is found or written off. A whole item is condition 'missing'; part of
  // a set ("2 of 12 trays") keeps its condition with missing.count set.
  missing?: AssetMissing | null;
  // Written off after going missing: what, when, by whom (the whole item is then disposed, or the
  // quantity goes down by the count).
  writtenOff?: { at: string; by: string; note: string; count: number } | null;
  // When it was last found in an equipment check (or a surprise auditor's spot check).
  lastCheckedAt?: string | null;
  confirmedAt?: string;
  confirmedBy?: string;
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy: string;
}

export interface AssetMissing {
  reportedAt: string;
  by: string;
  count: number;            // how many of `quantity` are missing
  lastSeen: string | null;  // YYYY-MM-DD
  where: string;            // where it was kept
  note: string;             // what happened
  policeRef: string;        // if stolen and reported
  source: 'report' | 'check' | 'audit';
  prevCondition: AssetCondition; // what it goes back to when found
}

// Register entries are made from expenses dated on or after the day the register started.
// Older purchases come in only through the owner's "Import past equipment purchases".
export const ASSETS_FROM_DATE = '2026-10-27';

export const ASSET_CATEGORIES: { key: AssetCategory; label: string; bn: string; emoji: string }[] = [
  { key: 'cooking_equipment', label: 'Cooking & kitchen machines', bn: 'রান্নার যন্ত্র', emoji: '🍳' },
  { key: 'refrigeration', label: 'Fridge & freezer', bn: 'ফ্রিজ', emoji: '🧊' },
  { key: 'storage_bins', label: 'Storage, bins & racks', bn: 'রাখার পাত্র ও বিন', emoji: '🗄️' },
  { key: 'utensils_pans', label: 'Utensils & pans', bn: 'বাসন ও কড়াই', emoji: '🥘' },
  { key: 'furniture', label: 'Furniture', bn: 'আসবাব', emoji: '🪑' },
  { key: 'electrical_lighting', label: 'Electrical & lights', bn: 'বৈদ্যুতিক ও আলো', emoji: '💡' },
  { key: 'cleaning', label: 'Cleaning', bn: 'পরিষ্কারের জিনিস', emoji: '🧹' },
  { key: 'vehicle', label: 'Vehicle', bn: 'গাড়ি', emoji: '🛵' },
  { key: 'other', label: 'Other', bn: 'অন্যান্য', emoji: '📦' },
];
export const ASSET_CATEGORY_KEYS = ASSET_CATEGORIES.map((c) => c.key);

export const ASSET_CONDITIONS: { key: AssetCondition; label: string; bn: string }[] = [
  { key: 'good', label: 'Good', bn: 'ভালো' },
  { key: 'needs_repair', label: 'Needs repair', bn: 'মেরামত দরকার' },
  { key: 'broken', label: 'Broken', bn: 'ভাঙা' },
  { key: 'missing', label: 'Missing', bn: 'হারিয়ে গেছে' },
  { key: 'disposed', label: 'Disposed', bn: 'ফেলে দেওয়া' },
];
export const ASSET_CONDITION_KEYS = ASSET_CONDITIONS.map((c) => c.key);

export const assetCategoryLabel = (key: string) => ASSET_CATEGORIES.find((c) => c.key === key)?.label || 'Other';
export const assetConditionLabel = (key: string) => ASSET_CONDITIONS.find((c) => c.key === key)?.label || 'Good';

// ---------------- Which expenses are equipment ----------------

// Always equipment, whatever the item is called.
const EQUIPMENT_PURCHASE_CATEGORIES = new Set(['equipment_smallwares']);
const EQUIPMENT_OVERHEAD_CATEGORIES = new Set(['asset_kitchen_equipment', 'asset_furniture', 'asset_electrical', 'asset_vehicle', 'equipments']);
// Food and packaging purchases are never equipment: "Momo Tray", "Container" and "Momo Box"
// there are disposables, so the item-name keywords are not checked for them.
const FOOD_AND_PACKAGING = new Set(['meat', 'dairy', 'fresh_produce', 'staples', 'spices_seasonings', 'bread_buns', 'beverages', 'packaging', 'packaging_bulk']);
// Overheads where a pan or a bin is sometimes bought. Repair, renovation, labour, meals and the
// rest are services or running costs - "fridge repair" there is not a new fridge.
const KEYWORD_OVERHEAD_CATEGORIES = new Set(['utensils', 'cleaning_supplies', 'office_supplies', 'emergency_online', 'miscellaneous']);

const KEYWORDS = [
  'bin', 'dustbin', 'container', 'crate', 'tray', 'pan', 'kadai', 'kadhai', 'karahi', 'tawa', 'steamer', 'fryer',
  'pot', 'bucket', 'drum', 'rack', 'shelf', 'shelves', 'table', 'chair', 'stool', 'fan', 'light', 'bulb', 'tube',
  'tubelight', 'tube light', 'freezer', 'deep freezer', 'fridge', 'refrigerator', 'induction', 'burner', 'stove',
  'oven', 'knife', 'knives', 'ladle', 'tong', 'strainer', 'sieve', 'box', 'dabba', 'jar', 'mixer', 'grinder',
  'scale', 'weighing', 'gas cylinder', 'almirah', 'cabinet', 'cupboard', 'chimney',
];
const KEYWORD_RE = new RegExp(`\\b(?:${KEYWORDS.map((k) => k.replace(/ /g, '\\s*')).join('|')})(?:s|es)?\\b`, 'i');
// Consumables and services that share a word with equipment ("bin bag", "fridge repair").
const NOT_EQUIPMENT_RE = /\b(?:foil|tissues?|gloves?|carry\s*bags?|garbage\s*bags?|bags?|liners?|poly(?:thene)?|napkins?|butter\s*paper|paper|cling|wrap|refill|recharge|repair(?:ing)?|servic(?:e|ing)|rent(?:al)?|disposable|sponge|scrubber|detergent|phenyl|soap|momo\s*(?:box|tray)|packing|packaging|water\s*jar)\b/i;
// Loan repayments logged against the vehicle are the same vehicle, not a new one.
const VEHICLE_EMI_RE = /\b(?:emi|instal?ments?|loan)\b/i;

export const expenseName = (row: any, prefix: ExpensePrefix): string =>
  String((prefix === 'inventory' ? row?.itemName : row?.description) || '').replace(/\s+/g, ' ').trim();

export function isEquipmentExpense(row: any, prefix: ExpensePrefix): boolean {
  const category = String(row?.category || '');
  const name = expenseName(row, prefix);
  const keywordMatch = KEYWORD_RE.test(name) && !NOT_EQUIPMENT_RE.test(name);
  if (prefix === 'inventory') {
    if (EQUIPMENT_PURCHASE_CATEGORIES.has(category)) return true;
    if (FOOD_AND_PACKAGING.has(category)) return false;
    return keywordMatch;
  }
  if (EQUIPMENT_OVERHEAD_CATEGORIES.has(category)) return !(category === 'asset_vehicle' && VEHICLE_EMI_RE.test(name));
  if (KEYWORD_OVERHEAD_CATEGORIES.has(category)) return keywordMatch;
  return false;
}

// ---------------- Bunny's word on names the keywords can't judge ----------------

// Owner, 31 Oct 2026: "have an AI to detect if a purchase can be added to the potential equipment
// and asset list". The keywords know English words; a ladle bought as "hata" or a cobweb stick as
// "jhul jhara lathi" passes them by. A name they can't judge - outside food and packaging, in the
// overheads where a pan or a bin is sometimes bought, and not an obvious consumable - is asked of
// Bunny once (server assetAi.ts) and the answer is kept for that name.
export type AiVerdict = { equipment: boolean; category?: AssetCategory | null; why?: string };
export const aiNameKey = (name: string) => String(name || '').toLowerCase().replace(/[^a-z0-9\u0980-\u09ff\u0900-\u097f]+/g, ' ').trim().slice(0, 80);

export function askableForAi(row: any, prefix: ExpensePrefix): boolean {
  const name = expenseName(row, prefix);
  if (!aiNameKey(name) || NOT_EQUIPMENT_RE.test(name) || isEquipmentExpense(row, prefix)) return false;
  const category = String(row?.category || '');
  return prefix === 'inventory' ? !FOOD_AND_PACKAGING.has(category) : KEYWORD_OVERHEAD_CATEGORIES.has(category);
}

const verdictFor = (row: any, prefix: ExpensePrefix, verdicts?: Map<string, AiVerdict>) =>
  verdicts && askableForAi(row, prefix) ? verdicts.get(aiNameKey(expenseName(row, prefix))) || null : null;

/** Equipment by the rules, or by Bunny's kept answer for a name the rules can't judge. */
export function isEquipment(row: any, prefix: ExpensePrefix, verdicts?: Map<string, AiVerdict>): boolean {
  return isEquipmentExpense(row, prefix) || !!verdictFor(row, prefix, verdicts)?.equipment;
}

// For the expense forms' hint: the same test on what has been typed so far.
export function looksLikeEquipment(name: string, category: string, source: string): boolean {
  if (source !== 'inventory' && source !== 'overhead') return false;
  if (!String(name || '').trim() && !EQUIPMENT_PURCHASE_CATEGORIES.has(category) && !EQUIPMENT_OVERHEAD_CATEGORIES.has(category)) return false;
  const row = source === 'inventory' ? { itemName: name, category } : { description: name, category };
  return isEquipmentExpense(row, source);
}

// ---------------- Best-guess register category ----------------

const CATEGORY_RULES: [AssetCategory, RegExp][] = [
  ['refrigeration', /\b(?:fridge|freezer|refrigerator|chiller|visi\s*cooler|cooler)s?\b/i],
  ['vehicle', /\b(?:scooter|scooty|e-?bike|bike|cycle|vehicle|activa|moped)s?\b/i],
  ['cleaning', /\b(?:mop|broom|jhadu|wiper|vacuum|pressure\s*washer|dust\s*pan)s?\b/i],
  ['cooking_equipment', /\b(?:steamer|fryer|induction|burner|stove|oven|mixer|grinder|blender|chimney|gas\s*cylinder|cylinder|cooker|tandoor|griddle|scale|weighing|machine|sealer|microwave|kettle|heater)s?\b/i],
  ['utensils_pans', /\b(?:pan|kadai|kadhai|karahi|tawa|pot|ladle|tong|strainer|sieve|knife|knives|spatula|jhanjhri|jhara|chopping|handi|patila|degchi|bowl|plate|spoon|whisk|grater|peeler|utensil)(?:s|es)?\b/i],
  ['electrical_lighting', /\b(?:fan|light|bulb|tube|tubelight|led|wire|wiring|switch|socket|extension|inverter|battery|exhaust|stabili[sz]er|ups)(?:s|es)?\b/i],
  ['furniture', /\b(?:table|chair|stool|bench|almirah|cabinet|cupboard|desk|sofa|counter)s?\b/i],
  ['storage_bins', /\b(?:bin|dustbin|container|crate|tray|bucket|drum|rack|shelf|shelves|box|dabba|jar|basket|tub|tank)(?:s|es)?\b/i],
];
const CATEGORY_FALLBACK: Record<string, AssetCategory> = {
  asset_furniture: 'furniture',
  asset_electrical: 'electrical_lighting',
  asset_vehicle: 'vehicle',
  asset_kitchen_equipment: 'cooking_equipment',
  equipments: 'cooking_equipment',
  equipment_smallwares: 'cooking_equipment',
  utensils: 'utensils_pans',
  cleaning_supplies: 'cleaning',
  cleaning_sanitation: 'cleaning',
};

export function guessAssetCategory(name: string, expenseCategory?: string): AssetCategory {
  // The vehicle category is certain from the expense; the name only refines the others.
  if (expenseCategory === 'asset_vehicle') return 'vehicle';
  for (const [key, re] of CATEGORY_RULES) if (re.test(name || '')) return key;
  return CATEGORY_FALLBACK[expenseCategory || ''] || 'other';
}

// ---------------- Expense -> register fields ----------------

const COUNTABLE_UNITS = new Set(['', 'pc', 'pcs', 'piece', 'pieces', 'unit', 'units', 'no', 'nos', 'set', 'sets', 'pair', 'pairs', 'box', 'boxes', 'packet', 'packets']);
const round2 = (n: number) => Math.round(n * 100) / 100;
const num = (v: any) => (Number.isFinite(Number(v)) ? Number(v) : 0);

// "3 pcs steel tray", "bucket x2", "qty 4" - an overhead has only a description and an amount.
// A bare leading number is not read as a count: "2 door fridge", "20L bucket", "4 burner stove".
export function quantityFromText(text: string): number {
  const t = String(text || '');
  const m = t.match(/\b(\d{1,3})\s*(?:pcs?|pieces?|nos?|units?|sets?|pairs?)\b/i)
    || t.match(/\bqty\.?\s*:?\s*(\d{1,3})\b/i)
    || t.match(/(?:^|\s)x\s*(\d{1,3})\b/i)
    || t.match(/\b(\d{1,3})\s*x(?:\s|$)/i);
  const n = m ? parseInt(m[1], 10) : 1;
  return n >= 1 && n <= 999 ? n : 1;
}

export function expenseLocation(row: any): { locationKind: AssetLocationKind; locationId: string } {
  if (row?.entityType === 'production_house') return { locationKind: 'production_house', locationId: String(row.productionHouseId || '') };
  return { locationKind: 'store', locationId: String(row?.storeId || '') };
}

export function assetFieldsFromExpense(row: any, prefix: ExpensePrefix): ExpenseSnapshot & { category: AssetCategory; unitCost: number } {
  const name = expenseName(row, prefix).slice(0, 80) || 'Equipment';
  const totalCost = round2(Math.max(0, num(prefix === 'inventory' ? row?.totalCost : row?.amount)));
  let quantity = 1;
  if (prefix === 'inventory') {
    const q = num(row?.quantity);
    const unit = String(row?.unit || '').trim().toLowerCase();
    if (q >= 1 && COUNTABLE_UNITS.has(unit)) quantity = Math.min(9999, Math.round(q));
  } else {
    quantity = quantityFromText(name);
  }
  return {
    name,
    quantity,
    totalCost,
    unitCost: round2(totalCost / quantity),
    purchaseDate: String(row?.date || '').slice(0, 10),
    ...expenseLocation(row),
    category: guessAssetCategory(name, String(row?.category || '')),
  };
}

export const expenseFingerprint = (f: ExpenseSnapshot & { category?: string }) =>
  [f.name, f.quantity, f.totalCost, f.purchaseDate, f.locationKind, f.locationId].join('|');

export const assetIdForExpense = (expenseId: string) => `exp-${expenseId}`;

// ---------------- Reconcile ----------------

export interface ReconcilePlan {
  create: Asset[];
  update: Asset[];
  remove: Asset[];
  // Set when so many linked expenses looked deleted at once that the expense list itself is
  // more likely to be incomplete (a failed read); nothing was removed or flagged as deleted.
  skippedMissing: boolean;
}

// Works out what to change; the caller writes it. Creation is limited to expenses dated on or
// after fromDate. Every linked entry is checked against its expense whatever its date, so an
// imported older one is still kept in step after the import.
export function planReconcile(input: {
  purchases: any[];
  overheads: any[];
  assets: Asset[];
  fromDate: string;
  now: string;
  by: string;
  // Bunny's kept answers per name (aiNameKey), for names the keywords can't judge.
  verdicts?: Map<string, AiVerdict>;
}): ReconcilePlan {
  const { fromDate, now, by, verdicts } = input;
  // The rules' category; Bunny's when it is the one that read the name as equipment (the rules took
  // "jhul jhara" - a cobweb brush - for a jhara, a strainer), or when the rules can only say "other".
  const fieldsOf = (row: any, prefix: ExpensePrefix) => {
    const f = assetFieldsFromExpense(row, prefix);
    const v = verdictFor(row, prefix, verdicts);
    const bunnys = !!v?.category && ASSET_CATEGORY_KEYS.includes(v.category) && (f.category === 'other' || !isEquipmentExpense(row, prefix));
    return { ...f, category: bunnys ? v!.category! : f.category };
  };
  const expenses = new Map<string, { row: any; prefix: ExpensePrefix }>();
  for (const row of input.purchases || []) if (row?.id && !expenses.has(String(row.id))) expenses.set(String(row.id), { row, prefix: 'inventory' });
  for (const row of input.overheads || []) if (row?.id && !expenses.has(String(row.id))) expenses.set(String(row.id), { row, prefix: 'overhead' });
  const linked = new Map<string, Asset>();
  for (const a of input.assets || []) if (a?.source?.kind === 'expense' && a.source.expenseId) linked.set(a.source.expenseId, a);

  const plan: ReconcilePlan = { create: [], update: [], remove: [], skippedMissing: false };

  for (const [expenseId, { row, prefix }] of expenses) {
    if (linked.has(expenseId)) continue;
    if (String(row.date || '') < fromDate || !isEquipment(row, prefix, verdicts)) continue;
    const f = fieldsOf(row, prefix);
    const why = isEquipmentExpense(row, prefix) ? '' : String(verdictFor(row, prefix, verdicts)?.why || '').slice(0, 200);
    plan.create.push({
      id: assetIdForExpense(expenseId),
      name: f.name,
      category: f.category,
      locationKind: f.locationKind,
      locationId: f.locationId,
      quantity: f.quantity,
      unitCost: f.unitCost,
      totalCost: f.totalCost,
      purchaseDate: f.purchaseDate || null,
      condition: 'good',
      photo: null,
      notes: '',
      source: { kind: 'expense', expenseId, expensePrefix: prefix, fingerprint: expenseFingerprint(f), guessedCategory: f.category, ...(why ? { aiWhy: why } : {}) },
      needsReview: true,
      expenseChanged: null,
      createdAt: now,
      createdBy: by,
      updatedAt: now,
      updatedBy: by,
    });
  }

  const missingUpdates: Asset[] = [];
  const missingRemoves: Asset[] = [];
  for (const [expenseId, a] of linked) {
    if (a.dismissed || a.source.unlinked) continue;
    const e = expenses.get(expenseId);
    const stillEquipment = e ? isEquipment(e.row, e.prefix, verdicts) : false;
    if (!e || !stillEquipment) {
      // Gone, or re-filed as something that isn't equipment (food, a repair).
      const kind = e ? 'not_equipment' : 'deleted';
      if (a.needsReview) (e ? plan.remove : missingRemoves).push(a);
      else if (a.expenseChanged?.kind !== kind) {
        (e ? plan.update : missingUpdates).push({ ...a, expenseChanged: { at: now, kind }, updatedAt: now, updatedBy: by });
      }
      continue;
    }
    const f = fieldsOf(e.row, e.prefix);
    const fp = expenseFingerprint(f);
    if (fp === a.source.fingerprint) {
      // Edited back to what was confirmed: nothing left to decide.
      if (a.expenseChanged) plan.update.push({ ...a, expenseChanged: null, updatedAt: now, updatedBy: by });
      continue;
    }
    if (a.needsReview) {
      // Nobody has confirmed it yet, so follow the expense. Keep a category someone picked.
      const keepCategory = a.source.guessedCategory && a.category !== a.source.guessedCategory;
      plan.update.push({
        ...a,
        name: f.name,
        quantity: f.quantity,
        unitCost: f.unitCost,
        totalCost: f.totalCost,
        purchaseDate: f.purchaseDate || null,
        locationKind: f.locationKind,
        locationId: f.locationId,
        category: keepCategory ? a.category : f.category,
        source: { ...a.source, fingerprint: fp, guessedCategory: f.category },
        expenseChanged: null,
        updatedAt: now,
        updatedBy: by,
      });
    } else if (a.expenseChanged?.fingerprint !== fp) {
      const { category, unitCost, ...snapshot } = f;
      plan.update.push({ ...a, expenseChanged: { at: now, kind: 'changed', fingerprint: fp, expense: snapshot }, updatedAt: now, updatedBy: by });
    }
  }

  // Guard against a partial expense read wiping the register: with no expenses at all, or more
  // than half of the linked entries (and over 10) missing in one go, leave them alone.
  const missing = missingUpdates.length + missingRemoves.length;
  const liveLinked = [...linked.values()].filter((a) => !a.dismissed && !a.source.unlinked).length;
  if (expenses.size === 0 || (missing > 10 && missing > liveLinked / 2)) {
    plan.skippedMissing = missing > 0;
  } else {
    plan.update.push(...missingUpdates);
    plan.remove.push(...missingRemoves);
  }
  return plan;
}

// ---------------- Equipment check (owner, 30 Oct 2026) ----------------
// Every 3 months each store and production house goes through its list: seen, not found or
// broken, a count for sets, and a photo of anything over Rs 2,000 apiece. It runs with the
// month-end momo count of January, April, July and October and can be done from the 25th of that
// month to the 5th of the next. A surprise auditor also gets 5 of the place's items to find.

export const CHECK_MONTHS = [1, 4, 7, 10];
// The first check is January 2027 (owner, 30 Oct 2026: "start in jan" - not with October's count).
export const CHECKS_FROM = '2027-01';
export const CHECK_PHOTO_ABOVE = 2000;
export const CHECK_OPENS_DAY = 25;
export const CHECK_CLOSES_DAY = 5;

const ym = (y: number, m: number) => `${y}-${String(m).padStart(2, '0')}`;

/** The check ('YYYY-MM' of its month) a date can be done for, or null outside the window. */
export function checkPeriodOf(date: string): string | null {
  const y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7)), d = Number(date.slice(8, 10));
  const pm = m === 1 ? 12 : m - 1, py = m === 1 ? y - 1 : y;
  const p = CHECK_MONTHS.includes(m) && d >= CHECK_OPENS_DAY ? ym(y, m) : CHECK_MONTHS.includes(pm) && d <= CHECK_CLOSES_DAY ? ym(py, pm) : null;
  return p && p >= CHECKS_FROM ? p : null;
}

/** The check that is open on a date, or the next one ('YYYY-MM'). */
export function nextCheckPeriod(date: string): string {
  const open = checkPeriodOf(date);
  if (open) return open;
  if (date.slice(0, 7) < CHECKS_FROM) return CHECKS_FROM;
  let y = Number(date.slice(0, 4)), m = Number(date.slice(5, 7));
  for (let i = 0; i < 13; i++) {
    if (CHECK_MONTHS.includes(m) && (i > 0 || Number(date.slice(8, 10)) < CHECK_OPENS_DAY)) return ym(y, m);
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return ym(y, m);
}

/** What one piece cost (the total over the quantity when only that is known). */
export const pieceCost = (a: Pick<Asset, 'unitCost' | 'totalCost' | 'quantity'>): number | null =>
  a.unitCost ?? (a.totalCost != null && a.quantity ? a.totalCost / a.quantity : null);

/** A photo is part of the check for anything over Rs 2,000 apiece. */
export const checkNeedsPhoto = (a: Pick<Asset, 'unitCost' | 'totalCost' | 'quantity'>) => (pieceCost(a) ?? 0) > CHECK_PHOTO_ABOVE;

/** What a check covers: everything at the place that is still there, confirmed in the register. */
export const checkable = (a: Asset) => !a.dismissed && a.condition !== 'disposed' && !a.needsReview;

/**
 * The surprise auditor's items: n of the place's items, chosen from the audit id (the same audit
 * always gets the same ones), with up to two of the costly ones first when there are any.
 */
export function pickSpotCheck<T extends Asset>(assets: T[], seed: string, n = 5): T[] {
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619) >>> 0;
  const rand = () => {
    h = Math.imul(h ^ (h >>> 15), 2246822507) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 3266489909) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  };
  const pool = assets.filter((a) => checkable(a) && a.condition !== 'missing').sort((a, b) => a.id.localeCompare(b.id));
  const shuffled = pool.map((a) => ({ a, r: rand() })).sort((x, y) => x.r - y.r).map((x) => x.a);
  const costly = shuffled.filter(checkNeedsPhoto).slice(0, 2);
  return [...costly, ...shuffled.filter((a) => !costly.includes(a))].slice(0, n);
}
