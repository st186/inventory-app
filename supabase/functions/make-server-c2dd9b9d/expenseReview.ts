// Every new purchase or expense is checked right after it is saved (owner, 28 Oct 2026: "flag
// any bad entry ... we need to be sure what we are spending"). Plain rules against the last 90
// days of entries spot the problem; Bunny (askClaudeForJson, the same small model and monthly
// cap as Insights) only judges the category of an item never logged before. A flag says what
// looks wrong and, where it can, the fix; the place's incharge and the owner are told, and either
// can apply the fix or mark the entry correct.
//
//   expense-flag:{expenseId}:{kind}   one problem with one entry (open / fixed / dismissed)
//
// Kinds: weight (price per kg/L far from usual: a unit or quantity slip), bundle (pieces per pack
// unlike before), category (filed unlike before, or a word that belongs elsewhere), detail (a
// repair or labour entry that doesn't say what), repeat (a consumable bought again and again),
// unusual (far above what this kind of spend usually is here), duplicate (same amount, kind and
// place within two days, or the same purchase logged for another place within a day), place (an
// ingredient this place hasn't bought in 90 days that another place buys regularly - owner, 29 Oct
// 2026: tandoori masala logged for the store and the production house on the same day), amount (doesn't say how much: "Butter 8 pcs" with no pack size - owner,
// 29 Oct 2026; it closes itself when the entry is edited to a clear amount); for repairs, labour and equipment (expensePaperwork.ts) also bill (no
// photo of the bill above ₹500), approval (above ₹2,000: waits for the owner's OK) and replace
// (a machine repaired 3 times in 4 months, or repairs reaching 40% of its price).
//
// Why a big buy was right (owner, 29 Oct 2026: "if I tell him it's correct will it be able to
// understand why ... so next time it's able to see and understand the trend"): marking "Much
// bigger than usual" correct asks why (BIG_BUY_REASONS). The answer is kept on the entry
// (explained) and remembered for later checks:
//   expense-explained:{place}:{item}   the last few explained big buys of one item at one place
//   expense-season:{place}             a festival stock-up or buying ahead: the next 14 days
// A later big buy says what happened last time, the festival season it falls in, or a festival in
// the calendar (store-calendar:{date}) just ahead, and comes with that reason picked. Explained
// buys stay out of "usual", and an item with its own history is held to its own usual amount.
import { askClaudeForJson } from './insights.ts';
import { BIG_BUY_REASONS } from './bigBuyReasons.ts';
import { amountFix, amountIssue, itemKey, type ItemSpec } from './suppliesRules.ts';
import {
  APPROVAL_ABOVE, BILL_PHOTO_ABOVE, REPLACE_AFTER_REPAIRS, REPLACE_SHARE, REPLACE_WINDOW_DAYS, describeRepair, isBillPath, needsPaperwork,
} from './expensePaperwork.ts';

type Kv = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  mget?: (keys: string[]) => Promise<any[]>;
};
type Range = { from?: string; to?: string; field: string };
export type ExpenseReviewDeps = {
  kv: Kv;
  rows: (prefix: string, range?: Range | null) => Promise<any[]>;
  verifyUser: (authHeader: string | null) => Promise<any>;
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string,
    quickAction?: { recordType: 'expense_approval'; recordId: string }) => Promise<unknown>;
};
type Source = 'inventory' | 'overhead';
type Flag = {
  id: string; expenseId: string; expenseKey: string; source: Source; kind: string; date: string; place: string;
  title: string; message: string; suggestion?: Record<string, unknown>; suggestionText?: string;
  status: 'open' | 'fixed' | 'dismissed'; createdAt: string; loggedBy?: string;
  decidedBy?: string; decidedAt?: string; note?: string;
  /** Why it was right (BIG_BUY_REASONS), and the reason a later check suggests. */
  reason?: string; hint?: { reason: string; text: string };
};

const ASKS_WHY = ['unusual'];
const SEASON_DAYS = 14;
type Explained = { date: string; amount: number; reason: string; note?: string; by: string };
const explainedKey = (place: string, item: string) => `expense-explained:${place}:${norm(item).slice(0, 60)}`;
const seasonKey = (place: string) => `expense-season:${place}`;
// 28 Oct, or 28 Oct 2026 when it is not the year of `ref`.
const shortDate = (date: string, ref = date) =>
  new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(date.slice(0, 4) !== ref.slice(0, 4) ? { year: 'numeric' } : {}), timeZone: 'UTC' });
const why = (e: { reason: string; note?: string }) => `${BIG_BUY_REASONS[e.reason] || e.reason}${e.note ? ` (${e.note})` : ''}`;

/** What a big buy probably is, from what people said before and the festival calendar. */
async function bigBuyHint(kv: Kv, place: string, name: string, date: string): Promise<{ reason: string; text: string } | null> {
  const past: Explained[] = (name ? await kv.get(explainedKey(place, name)).catch(() => null) : null) || [];
  const last = past.filter((e) => e.date < date).sort((a, b) => b.date.localeCompare(a.date))[0];
  const season = await kv.get(seasonKey(place)).catch(() => null);
  if (season && date >= addDays(season.from, -2) && date <= season.until) {
    return { reason: season.reason, text: `${season.by} noted a festival stock-up here from ${shortDate(season.from)}: ${why(season)}.` };
  }
  // A festival in the calendar within the next 14 days (or the last 2): stocking up starts early.
  const days = Array.from({ length: 17 }, (_, i) => addDays(date, i - 2));
  const marks = kv.mget ? await kv.mget(days.map((d) => `store-calendar:${d}`)).catch(() => []) : [];
  const festival = (marks || []).find((m: any) => m?.name && m?.date && m.effect !== 'closed');
  if (last) {
    const text = `Last time (${shortDate(last.date, date)}, ${last.by}): ${why(last)}.${festival ? ` ${festival.name} is on ${shortDate(festival.date)}.` : ''}`;
    return { reason: festival && last.reason !== 'price_up' ? 'festival' : last.reason, text };
  }
  if (festival) return { reason: 'festival', text: `${festival.name} is on ${shortDate(festival.date)}: a festival stock-up?` };
  return null;
}

const P = '/make-server-c2dd9b9d';
const rupees = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const norm = (text: any) => String(text || '').toLowerCase().replace(/[^a-zঀ-৿ऀ-ॿ ]/g, ' ').replace(/\s+/g, ' ').trim().replace(/(es|s)$/, '');
const placeOf = (r: any) => (r?.entityType === 'production_house' ? `production:${r.productionHouseId || ''}` : `store:${r?.storeId || ''}`);
const canonical = (qty: number, unit?: string) => {
  const u = String(unit || '').trim().toLowerCase();
  if (u === 'g') return { qty: qty / 1000, unit: 'kg' };
  if (u === 'ml') return { qty: qty / 1000, unit: 'L' };
  if (u === 'kg') return { qty, unit: 'kg' };
  if (u === 'l') return { qty, unit: 'L' };
  return { qty, unit: u || 'pcs' };
};
const median = (xs: number[]) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const amountOf = (r: any) => Number(r?.totalCost ?? r?.amount ?? 0) || 0;
const nameOf = (r: any) => String(r?.itemName || r?.description || '').trim();
const sameQty = (a: any, b: any) => {
  const x = canonical(Number(a?.quantity) || 0, a?.unit);
  const y = canonical(Number(b?.quantity) || 0, b?.unit);
  return x.qty > 0 && x.unit === y.unit && Math.abs(x.qty - y.qty) < 1e-6;
};
// "Bunny Momos 1", "Main Production House BWN".
async function placeName(deps: Pick<ExpenseReviewDeps, 'kv'>, place: string) {
  const [kind, id] = place.split(':');
  const rec = id ? await deps.kv.get(kind === 'production' ? `production_house_${id}` : `store:${id}`).catch(() => null) : null;
  return String(rec?.name || '').trim() || (kind === 'production' ? 'the production house' : 'the store');
}

// Consumables bought again and again (kitchen towels, gloves, dusters...).
const CONSUMABLE_CATEGORIES = ['cleaning_supplies', 'cleaning_sanitation', 'hygiene_ppe', 'utensils', 'office_supplies', 'deep_cleaning'];
const CONSUMABLE_WORDS = /towel|glove|duster|mop|sponge|scrub|apron|cap|lighter|liter|laitar|broom|jhadu|phenyl|tissue|napkin|wiper|brush|bucket|mug/i;
// Words that put an entry in another category.
const WORD_RULES: { test: RegExp; from: string[]; to: string; why: string }[] = [
  { test: /scoot|scooty|bike|tyre|tyer|tire|gari|vehicle|petrol tank|chain/i, from: ['repair', 'utensils', 'asset_vehicle'], to: 'vehicle_maintenance', why: 'it is for the scooter' },
  { test: /lebar|labou?r|mistri|helper/i, from: ['repair', 'renovation', 'miscellaneous'], to: 'labour_charge', why: 'it is labour' },
  { test: /paint|colou?r|whitewash|putty/i, from: ['repair'], to: 'renovation', why: 'it is painting' },
  { test: /lighter|liter|laitar|match ?box/i, from: ['repair'], to: 'utensils', why: 'it is a small kitchen tool' },
  { test: /\bmop|duster|phenyl|broom|jhadu/i, from: ['deep_cleaning', 'repair'], to: 'cleaning_supplies', why: 'it is a cleaning supply' },
];
const VAGUE = /^(repair(ing)?( cost| work)?|labou?r( charge| cost)?( \(.*\))?|lebar( cost| charge)?|electric( work)?|work|equipments?|misc(ellaneous)?|cost|expense)$/i;
const DETAIL_CATEGORIES = ['repair', 'labour_charge', 'renovation', 'vehicle_maintenance', 'asset_kitchen_equipment', 'asset_electrical', 'asset_furniture'];

// Categories Bunny may choose from for an unfamiliar item (the app's own list, short labels).
export const CATEGORY_CHOICES: Record<Source, Record<string, string>> = {
  inventory: {
    meat: 'Meat', dairy: 'Dairy', fresh_produce: 'Vegetables', spices_seasonings: 'Grocery and spices', staples: 'Flour, oil and staples',
    bread_buns: 'Bread and buns', beverages: 'Drinks', packaging: 'Packaging (boxes, bags, foil)', cleaning_supplies: 'Cleaning supplies',
    hygiene_ppe: 'Gloves and caps', utensils: 'Small utensils and tools', office_supplies: 'Office supplies', water_jar: 'Water jar',
    asset_kitchen_equipment: 'Kitchen equipment (over 1,000)', asset_electrical: 'Electrical installation',
  },
  overhead: {
    fuel: 'Fuel', ev_charging: 'E-bike charging', travel: 'Staff travel', transportation: 'Goods transport', marketing: 'Marketing',
    repair: 'Repair of equipment or building', renovation: 'Renovation and painting', labour_charge: 'Labour for a job', puja_expense: 'Puja items',
    office_supplies: 'Office supplies', deep_cleaning: 'Deep cleaning service', utensils: 'Small utensils and tools', cleaning_supplies: 'Cleaning supplies',
    hygiene_ppe: 'Gloves and caps', license: 'Licence and paperwork', professional_fees: 'Professional fees', water_jar: 'Water jar',
    vehicle_maintenance: 'Vehicle service and tyres', donations_community: 'Donations', staff_welfare: 'Staff welfare', emergency_online: 'Emergency online order',
    asset_kitchen_equipment: 'Kitchen equipment (over 1,000)', asset_furniture: 'Furniture', asset_electrical: 'Electrical installation',
  },
};

export const catLabel = (key: any) => CATEGORY_CHOICES.overhead[key] || CATEGORY_CHOICES.inventory[key] || String(key || 'other').replace(/_/g, ' ');

/** Check one newly saved purchase or expense and save any flags. Never throws. */
// loggedByRole: the owner's own entries need nobody's OK.
export async function reviewExpense(deps: ExpenseReviewDeps, source: Source, key: string, item: any, loggedBy?: string, loggedByRole?: string): Promise<Flag[]> {
  try {
    if (!item?.id || !item?.date) return [];
    const since = addDays(item.date, -90);
    const pool = (await deps.rows(`${source}:`, { from: since, to: addDays(item.date, 2), field: 'date' })).filter((r: any) => r && r.id !== item.id);
    const place = placeOf(item);
    const name = nameOf(item);
    const key0 = norm(name);
    const sameItem = key0 ? pool.filter((r: any) => norm(nameOf(r)) === key0) : [];
    const samePlace = (r: any) => placeOf(r) === place;
    const amount = amountOf(item);
    const flags: Omit<Flag, 'id' | 'expenseId' | 'expenseKey' | 'source' | 'date' | 'place' | 'status' | 'createdAt'>[] = [];

    // Weight or unit slip: price per kg / L / piece far from what this item usually costs.
    if (source === 'inventory' && Number(item.quantity) > 0 && amount > 0) {
      const mine = canonical(Number(item.quantity), item.unit);
      const prices = sameItem
        .map((r: any) => ({ c: canonical(Number(r.quantity) || 0, r.unit), cost: amountOf(r) }))
        .filter((x) => x.c.unit === mine.unit && x.c.qty > 0 && x.cost > 0)
        .map((x) => x.cost / x.c.qty);
      if (prices.length >= 3) {
        const usual = median(prices);
        const price = amount / mine.qty;
        const ratio = price / usual;
        if (usual > 0 && (ratio >= 1.6 || ratio <= 0.6)) {
          const unitSlip = (ratio > 400 && ratio < 2500) || (ratio > 0.0004 && ratio < 0.0025);
          const qty = Math.round((amount / usual) * 100) / 100;
          const unit = mine.unit;
          flags.push({
            kind: 'weight',
            title: unitSlip ? 'Unit looks wrong' : 'Quantity or price looks wrong',
            message: `${name}: ${rupees(price)} a ${unit} here, but it usually costs ${rupees(usual)} a ${unit}${unitSlip ? ' — probably g and kg (or mL and L) mixed up' : ''}.`,
            suggestion: { quantity: qty, unit, costPerUnit: Math.round(usual * 100) / 100 },
            suggestionText: `${qty} ${unit} at the usual ${rupees(usual)} a ${unit}`,
          });
        }
      }
    }

    // Bundle slip: pieces per pack unlike every earlier purchase of the item.
    if (source === 'inventory' && Number(item.piecesPerCarton) > 0) {
      const counts = new Map<number, number>();
      sameItem.forEach((r: any) => { const n = Number(r.piecesPerCarton); if (n > 0) counts.set(n, (counts.get(n) || 0) + 1); });
      const [usualPack, seen] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0] || [0, 0];
      const mine = Number(item.piecesPerCarton);
      if (seen >= 2 && Math.abs(mine - usualPack) / usualPack > 0.3) {
        const packs = Number(item.cartonCount) || 1;
        flags.push({
          kind: 'bundle',
          title: 'Pieces per pack look wrong',
          message: `${name}: ${mine} pieces a pack this time; earlier purchases had ${usualPack} a pack.`,
          suggestion: { piecesPerCarton: usualPack, quantity: packs * usualPack, costPerUnit: Math.round((amount / (packs * usualPack)) * 100) / 100 },
          suggestionText: `${packs} × ${usualPack} pieces = ${packs * usualPack}`,
        });
      }
    }

    // An amount that doesn't say how much. The fix comes from how the item was last written on a
    // shopping list (2 packets × 1 L), when there is one.
    if (source === 'inventory') {
      const issue = amountIssue({ name, qty: Number(item.quantity) || 0, unit: item.unit, category: item.category, piecesPerCarton: item.piecesPerCarton, weightEachGrams: item.weightPerUnitGrams });
      if (issue) {
        const specs: Record<string, ItemSpec> | null = await deps.kv.get('supply-item-specs').catch(() => null);
        const fix = amountFix(Number(item.quantity) || 0, amount, specs?.[itemKey(name)]);
        flags.push({
          kind: 'amount', title: 'How much is that?', message: issue,
          ...(fix ? { suggestion: { quantity: fix.quantity, unit: fix.unit, costPerUnit: fix.costPerUnit }, suggestionText: fix.text } : {}),
        });
      }
    }

    // Category: filed unlike before, or a word that belongs in another category.
    let categoryChecked = false;
    const rule = WORD_RULES.find((r) => r.test.test(name) && r.from.includes(item.category) && r.to !== item.category);
    if (rule) {
      categoryChecked = true;
      flags.push({ kind: 'category', title: 'Wrong category?', message: `${name} is under ${catLabel(item.category)}, but ${rule.why}.`, suggestion: { category: rule.to }, suggestionText: `Move to ${catLabel(rule.to)}` });
    } else if (/salar(y|i)|wage|bonus/i.test(name) && item.category !== 'personal_expense') {
      categoryChecked = true;
      flags.push({ kind: 'category', title: 'Salary logged as an expense?', message: `${name} looks like pay. Salaries, bonuses and advances go through Team > Pay, so they aren't counted twice.` });
    } else if (sameItem.length >= 2) {
      categoryChecked = true;
      const byCat = new Map<string, number>();
      sameItem.forEach((r: any) => byCat.set(r.category, (byCat.get(r.category) || 0) + 1));
      const [usualCat, n] = [...byCat.entries()].sort((a, b) => b[1] - a[1])[0];
      if (usualCat && usualCat !== item.category && n / sameItem.length >= 0.7) {
        flags.push({ kind: 'category', title: 'Different category from before', message: `${name} was filed under ${catLabel(usualCat)} ${n} times before; now it is under ${catLabel(item.category)}.`, suggestion: { category: usualCat }, suggestionText: `Move to ${catLabel(usualCat)}` });
      }
    }
    if (!categoryChecked && name && sameItem.length === 0) {
      // A brand-new item: Bunny reads the name and the amount and picks the category it fits.
      try {
        const choices = CATEGORY_CHOICES[source];
        {
          const { data } = await askClaudeForJson(deps.kv as any, {
            purpose: 'expense-review',
            user: { id: 'expense-review', isOwner: true },
            system: 'You check expense entries for a small momo shop in West Bengal. Names may be Bengali or Hindi words typed in English letters, often misspelled. Pick the category that fits the item best. Say confident only when the current category is clearly wrong.',
            prompt: JSON.stringify({ item: name, amount, filedUnder: item.category, categories: choices }),
            schema: {
              type: 'object', additionalProperties: false, required: ['category', 'confident', 'reason'],
              properties: { category: { type: 'string', enum: Object.keys(choices) }, confident: { type: 'boolean' }, reason: { type: 'string' } },
            },
            maxTokens: 300,
          });
          if (data?.confident && data.category && data.category !== item.category && choices[data.category]) {
            flags.push({ kind: 'category', title: 'Wrong category?', message: `${name} is under ${catLabel(item.category)}. ${String(data.reason || '').slice(0, 160)}`, suggestion: { category: data.category }, suggestionText: `Move to ${choices[data.category]}` });
          }
        }
      } catch (error) {
        console.log('Expense review: Bunny could not check the category:', error instanceof Error ? error.message : String(error));
      }
    }

    // Repairs and labour that don't say what.
    if (source === 'overhead' && DETAIL_CATEGORIES.includes(item.category) && (VAGUE.test(name) || name.length < 6)) {
      flags.push({ kind: 'detail', title: 'What was it for?', message: `"${name || 'No description'}" doesn't say what was ${item.category === 'labour_charge' ? 'done' : 'repaired or bought'}. Add the machine or job, who did it, and keep the bill.` });
    }

    // A consumable bought again and again at the same place.
    const consumable = CONSUMABLE_CATEGORIES.includes(item.category) || CONSUMABLE_WORDS.test(name);
    if (consumable && key0) {
      const month = sameItem.filter((r: any) => samePlace(r) && r.date >= addDays(item.date, -30) && r.date <= item.date);
      if (month.length >= 2) {
        const spent = month.reduce((s: number, r: any) => s + amountOf(r), 0) + amount;
        flags.push({ kind: 'repeat', title: 'Bought again', message: `${name}: this is purchase number ${month.length + 1} in 30 days here (${rupees(spent)} in all). Check they are being used up, not lost or taken.` });
      }
    }

    // Far above what this item - or, without enough of its own history, this kind of spend - usually
    // is at this place. Big buys someone already explained are left out of "usual".
    const ownBuys = sameItem.filter((r: any) => samePlace(r) && !r.explained).map(amountOf).filter((x: number) => x > 0);
    const sameCat = pool.filter((r: any) => r.category === item.category && samePlace(r) && !r.explained);
    const byItem = ownBuys.length >= 3;
    if ((byItem || sameCat.length >= 5) && amount >= 500) {
      const usual = median(byItem ? ownBuys : sameCat.map(amountOf).filter((x: number) => x > 0));
      if (usual > 0 && amount >= usual * 3) {
        const base = byItem
          ? `${rupees(amount)} for ${name}; it is usually about ${rupees(usual)} here.`
          : `${rupees(amount)} for ${name || catLabel(item.category)}; a ${catLabel(item.category).toLowerCase()} entry here is usually about ${rupees(usual)}.`;
        const hint = await bigBuyHint(deps.kv, place, name, item.date);
        flags.push({ kind: 'unusual', title: 'Much bigger than usual', message: hint ? `${base} ${hint.text}` : base, ...(hint ? { hint } : {}) });
      }
    }

    // The same bill logged twice: same kind, place and amount on the same day, or within two days
    // when neither says what it was (a consumable bought again is the repeat check's job).
    const twin = pool.find((r: any) => r.category === item.category && samePlace(r) && Math.abs(amountOf(r) - amount) < 0.5 && (
      r.date === item.date && (norm(nameOf(r)) === key0 || VAGUE.test(nameOf(r)) || VAGUE.test(name))
      || Math.abs(Date.parse(r.date) - Date.parse(item.date)) <= 2 * 86400000 && VAGUE.test(nameOf(r)) && VAGUE.test(name)));
    if (twin) {
      flags.push({ kind: 'duplicate', title: 'Logged twice?', message: `${rupees(amount)} for ${nameOf(twin) || 'the same thing'} was also logged on ${twin.date}. Delete one if it is the same bill.` });
    }

    // The same purchase logged for another place too: same item, same amount or quantity, within a day.
    const otherTwin = !twin && key0 ? sameItem.find((r: any) => !samePlace(r) && Math.abs(Date.parse(r.date) - Date.parse(item.date)) <= 86400000
      && (Math.abs(amountOf(r) - amount) < 0.5 || sameQty(r, item))) : undefined;
    // An ingredient this place hasn't bought in 90 days that another place buys regularly.
    let usualElsewhere: { place: string; times: number } | null = null;
    if (source === 'inventory' && key0 && !sameItem.some(samePlace)) {
      const times = new Map<string, number>();
      sameItem.forEach((r: any) => times.set(placeOf(r), (times.get(placeOf(r)) || 0) + 1));
      const [top, n] = [...times].sort((a, b) => b[1] - a[1])[0] || ['', 0];
      if (n >= 3) usualElsewhere = { place: top, times: n };
    }
    if (usualElsewhere) {
      const [here, there] = await Promise.all([placeName(deps, place), placeName(deps, usualElsewhere.place)]);
      const both = otherTwin && placeOf(otherTwin) === usualElsewhere.place;
      flags.push({ kind: 'place', title: both ? 'Logged for the wrong place too?' : 'Not usually bought here', message: `${name} is bought for ${there} (${usualElsewhere.times} times in 90 days), never for ${here}. ${both ? `It was logged for ${there} on ${otherTwin.date} too, so this looks like the same purchase twice: delete this one.` : `If it was bought for ${there}, delete it here and log it there.`}` });
    } else if (otherTwin) {
      // The other entry is the one at the unusual place (already flagged "not usually bought
      // here"): say there it was logged twice, and leave this one - the right place - alone.
      const odd: Flag | null = await deps.kv.get(`expense-flag:${otherTwin.id}:place`);
      const here = await placeName(deps, place);
      if (odd?.status === 'open') {
        await deps.kv.set(`expense-flag:${odd.id}`, { ...odd, title: 'Logged for the wrong place too?', message: `${odd.message.replace(/ If it was bought for .*$/, '')} It was logged for ${here} on ${item.date} too, so this looks like the same purchase twice: delete this one.` });
      } else {
        const there = await placeName(deps, placeOf(otherTwin));
        flags.push({ kind: 'duplicate', title: 'Logged for two places?', message: `${name} · ${rupees(amount)} was also logged for ${there} on ${otherTwin.date}. If it is one purchase, delete the entry at the wrong place.` });
      }
    }

    // Repairs, labour and equipment: the bill, the owner's OK, and a machine that keeps breaking.
    if (needsPaperwork(source, item)) {
      const what = describeRepair(item) || catLabel(item.category);
      if (amount > BILL_PHOTO_ABOVE && !isBillPath(item.billPhotoPath)) {
        flags.push({ kind: 'bill', title: 'Bill photo missing', message: `${what}: ${rupees(amount)}. Repairs, labour and equipment above ${rupees(BILL_PHOTO_ABOVE)} need a photo of the bill.` });
      }
      if (amount > APPROVAL_ABOVE && loggedByRole !== 'cluster_head') {
        flags.push({ kind: 'approval', title: 'Needs your OK', message: `${what} · ${rupees(amount)}, above ${rupees(APPROVAL_ABOVE)}.` });
      }
    }
    const replace = await replaceCheck(deps, source, item);
    if (replace) flags.push(replace);

    if (flags.length === 0) return [];
    const now = new Date().toISOString();
    const saved: Flag[] = [];
    for (const f of flags) {
      const id = `${item.id}:${f.kind}`;
      const existing = await deps.kv.get(`expense-flag:${id}`);
      if (existing) continue;
      const flag: Flag = { ...f, id, expenseId: item.id, expenseKey: key, source, date: item.date, place, status: 'open', createdAt: now, loggedBy };
      await deps.kv.set(`expense-flag:${id}`, flag);
      saved.push(flag);
    }
    if (saved.length) await tellPeople(deps, item, place, saved);
    return saved;
  } catch (error) {
    console.log('Expense review failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

/** After an edit: an open "how much is that?" flag closes when the amount is now clear (it still
 *  counts as a mistake for the KPI - it was fixed, not marked correct). Never throws. */
export async function recheckAmount(deps: Pick<ExpenseReviewDeps, 'kv'>, item: any, by: string) {
  try {
    const id = `${item?.id}:amount`;
    const flag: Flag | null = await deps.kv.get(`expense-flag:${id}`);
    if (!flag || flag.status !== 'open') return;
    if (amountIssue({ name: nameOf(item), qty: Number(item.quantity) || 0, unit: item.unit, category: item.category, piecesPerCarton: item.piecesPerCarton, weightEachGrams: item.weightPerUnitGrams })) return;
    await deps.kv.set(`expense-flag:${id}`, { ...flag, status: 'fixed', decidedBy: by, decidedAt: new Date().toISOString(), note: 'The entry was edited' });
  } catch (error) {
    console.log('Expense recheck failed:', error instanceof Error ? error.message : String(error));
  }
}

/** An entry was deleted (a double entry, or one logged for the wrong place): its open checks are
 *  done. They still count for the KPI - it was fixed, not marked correct. Never throws. */
export async function closeFlagsOf(deps: Pick<ExpenseReviewDeps, 'kv' | 'rows'>, expenseId: string, by: string) {
  try {
    const open = (await deps.rows(`expense-flag:${expenseId}:`)).filter((f: Flag) => f?.status === 'open' && f.expenseId === expenseId);
    const now = new Date().toISOString();
    for (const f of open) await deps.kv.set(`expense-flag:${f.id}`, { ...f, status: 'fixed', decidedBy: by, decidedAt: now, note: 'The entry was deleted' });
  } catch (error) {
    console.log('Closing expense checks failed:', error instanceof Error ? error.message : String(error));
  }
}

// A repair to a machine in the equipment register: repaired REPLACE_AFTER_REPAIRS times within
// REPLACE_WINDOW_DAYS, or repairs adding up to REPLACE_SHARE of its price.
async function replaceCheck(deps: ExpenseReviewDeps, source: Source, item: any) {
  const assetId = item?.repair?.assetId;
  if (source !== 'overhead' || item?.category !== 'repair' || !assetId) return null;
  const asset = await deps.kv.get(`asset:${assetId}`);
  if (!asset?.name) return null;
  const repairs = (await deps.rows('overhead:', { from: addDays(item.date, -3 * 365), to: addDays(item.date, 2), field: 'date' }))
    .filter((r: any) => r && r.id !== item.id && r.category === 'repair' && r.repair?.assetId === assetId)
    .concat([item]);
  const recent = repairs.filter((r: any) => r.date >= addDays(item.date, -REPLACE_WINDOW_DAYS) && r.date <= item.date);
  const spent = repairs.reduce((sum: number, r: any) => sum + amountOf(r), 0);
  const price = Number(asset.totalCost) || (Number(asset.unitCost) || 0) * (Number(asset.quantity) || 1);
  const often = recent.length >= REPLACE_AFTER_REPAIRS;
  const costly = price > 0 && spent >= price * REPLACE_SHARE;
  if (!often && !costly) return null;
  return {
    kind: 'replace',
    title: `Time to replace the ${asset.name}?`,
    message: [
      often ? `${recent.length} repairs in the last 4 months` : '',
      costly ? `repairs have cost ${rupees(spent)}, ${Math.round((spent / price) * 100)}% of its price (${rupees(price)})` : `${rupees(spent)} spent on repairs so far`,
    ].filter(Boolean).join('; ') + '. A new one may cost less than repairing it again.',
  };
}

// The owner's OK (or not) on a repair, labour or equipment entry above APPROVAL_ABOVE, from the
// app (POST /expense-flags/:id/apply|dismiss) or the notification's buttons (POST /quick-action).
// Not OK tells whoever logged it.
export async function settleApproval(deps: Pick<ExpenseReviewDeps, 'kv' | 'notifyUser'>, flagId: string, approve: boolean, by: string, note?: string) {
  const flag: Flag | null = await deps.kv.get(`expense-flag:${flagId}`);
  if (!flag || flag.kind !== 'approval') return { error: 'That expense was not found', status: 404 };
  if (flag.status !== 'open') return { error: 'Someone has already decided this one', status: 409 };
  const at = new Date().toISOString();
  const entry = await deps.kv.get(flag.expenseKey);
  if (entry) await deps.kv.set(flag.expenseKey, { ...entry, approval: { status: approve ? 'approved' : 'rejected', by, at, ...(note ? { note } : {}) } });
  const next: Flag = { ...flag, status: approve ? 'fixed' : 'dismissed', decidedBy: by, decidedAt: at, ...(note ? { note } : {}) };
  await deps.kv.set(`expense-flag:${flagId}`, next);
  if (!approve && entry?.userId) {
    await deps.notifyUser(entry.userId, 'expense_rejected', 'The owner did not OK an expense',
      `${describeRepair(entry) || 'An entry'} · ${rupees(amountOf(entry))} · ${entry.date}${note ? `: ${note}` : ''}. Talk to the owner about it.`, entry.id, entry.date).catch(() => undefined);
  }
  return { flag: next, entry };
}

// The place's incharge and the owner (cluster heads) get one notification per entry.
async function tellPeople(deps: ExpenseReviewDeps, item: any, place: string, flags: Flag[]) {
  const people = await deps.rows('unified-employee:');
  const [kind, placeId] = place.split(':');
  const incharges = people.filter((p: any) => p?.status !== 'inactive' && p?.authUserId && (
    kind === 'store'
      ? p.designation === 'store_incharge' && (p.storeId === placeId || (p.assignedStoreIds || []).includes(placeId))
      : p.designation === 'production_incharge' && (p.storeId === placeId || (p.assignedProductionHouseIds || []).includes(placeId))
  ));
  const owners = people.filter((p: any) => p?.role === 'cluster_head' && p?.authUserId && p?.status !== 'inactive');
  // The owner's OK goes to the owner alone, with OK / Not OK on the notification itself.
  const approval = flags.find((f) => f.kind === 'approval');
  if (approval) {
    for (const o of owners) {
      await deps.notifyUser(o.authUserId, 'expense_approval', `OK this expense? ${rupees(amountOf(item))}`,
        `${describeRepair(item) || nameOf(item) || 'An entry'} · ${item.date}${approval.loggedBy ? ` · logged by ${approval.loggedBy}` : ''}.`,
        item.id, item.date, { recordType: 'expense_approval', recordId: approval.id }).catch(() => undefined);
    }
  }
  const rest = flags.filter((f) => f.kind !== 'approval');
  if (!rest.length) return;
  const to = new Map<string, any>();
  [...incharges, ...owners].forEach((p: any) => to.set(p.authUserId, p));
  const title = rest.length === 1 ? rest[0].title : 'Check an expense entry';
  const message = `${nameOf(item) || 'An entry'} · ${rupees(amountOf(item))} · ${item.date}: ${rest.map((f) => f.title.toLowerCase()).join(', ')}.`;
  for (const authUserId of to.keys()) {
    await deps.notifyUser(authUserId, 'expense_flag', title, message, item.id, item.date).catch(() => undefined);
  }
}

const SUGGESTION_FIELDS = ['quantity', 'unit', 'costPerUnit', 'piecesPerCarton', 'cartonCount', 'category'];

/** Keep why a big buy was right: on the entry, in the item's memory, and as a festival season. */
async function rememberBigBuy(kv: Kv, flag: Flag, reason: string, note: string | undefined, by: string, at: string) {
  const entry = await kv.get(flag.expenseKey).catch(() => null);
  if (!entry) return;
  await kv.set(flag.expenseKey, { ...entry, explained: { kind: flag.kind, reason, ...(note ? { note } : {}), by, at } });
  const name = nameOf(entry);
  if (name) {
    const key = explainedKey(flag.place, name);
    const past: Explained[] = (await kv.get(key).catch(() => null)) || [];
    const mine: Explained = { date: entry.date, amount: amountOf(entry), reason, ...(note ? { note } : {}), by };
    await kv.set(key, [mine, ...past.filter((e) => e.date !== entry.date)].slice(0, 6));
  }
  if (reason === 'festival' || reason === 'shop_closed') {
    await kv.set(seasonKey(flag.place), { reason, ...(note ? { note } : {}), by, from: entry.date, until: addDays(entry.date, SEASON_DAYS), at });
  }
}

export function registerExpenseReviewRoutes(app: any, deps: ExpenseReviewDeps) {
  // Who sees and decides flags: the owner and operations managers everywhere, an incharge for
  // their own store or production house.
  const viewerOf = async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const m = auth.user.user_metadata || {};
    const all = m.role === 'cluster_head' || (m.role === 'manager' && m.designation !== 'store_incharge' && m.designation !== 'production_incharge');
    const places = new Set<string>();
    if (m.designation === 'store_incharge') [m.storeId, ...(m.assignedStoreIds || [])].filter(Boolean).forEach((id: string) => places.add(`store:${id}`));
    if (m.designation === 'production_incharge') [m.storeId, ...(m.assignedProductionHouseIds || [])].filter(Boolean).forEach((id: string) => places.add(`production:${id}`));
    if (!all && places.size === 0) return { error: c.json({ error: 'Only the owner, operations managers and incharges check expenses' }, 403) };
    return { all, places, name: m.name || auth.user.email || 'Someone', isOwner: m.role === 'cluster_head' };
  };
  // An expense waiting for the owner's OK is the owner's to decide; everything else, anyone who sees it.
  const canDecide = (v: { isOwner: boolean }, flag: Flag) => flag.kind !== 'approval' || v.isOwner;
  const canSee = (v: { all: boolean; places: Set<string> }, flag: Flag) => v.all || v.places.has(flag.place);

  app.get(`${P}/expense-flags`, async (c: any) => {
    const v: any = await viewerOf(c);
    if (v.error) return v.error;
    try {
      const status = c.req.query('status') || 'open';
      const flags = (await deps.rows('expense-flag:')).filter((f: Flag) => f && (status === 'all' || f.status === status) && canSee(v, f));
      const keys = [...new Set(flags.map((f: Flag) => f.expenseKey))];
      const records = keys.length && deps.kv.mget ? await deps.kv.mget(keys) : [];
      const byId = new Map<string, any>();
      records.filter(Boolean).forEach((r: any) => byId.set(r.id, r));
      const rows = flags
        .map((f: Flag) => ({ ...f, entry: byId.get(f.expenseId) || null, canDecide: canDecide(v, f) }))
        .filter((f: any) => f.entry || f.status !== 'open')
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
      return c.json({ flags: rows });
    } catch (error) {
      console.log('Error listing expense flags:', error);
      return c.json({ error: 'Could not load the entries to check' }, 500);
    }
  });

  const decide = async (c: any, action: 'apply' | 'dismiss') => {
    const v: any = await viewerOf(c);
    if (v.error) return v.error;
    try {
      const id = decodeURIComponent(c.req.param('id'));
      const flag: Flag | null = await deps.kv.get(`expense-flag:${id}`);
      if (!flag) return c.json({ error: 'That check was not found' }, 404);
      if (!canSee(v, flag)) return c.json({ error: 'This entry belongs to another place' }, 403);
      if (flag.status !== 'open') return c.json({ error: 'Someone has already decided this one' }, 409);
      const body = await c.req.json().catch(() => ({}));
      if (flag.kind === 'approval') {
        if (!canDecide(v, flag)) return c.json({ error: 'Only the owner can OK this' }, 403);
        const r: any = await settleApproval(deps, id, action === 'apply', v.name, typeof body?.note === 'string' ? body.note.slice(0, 300) : undefined);
        if (r.error) return c.json({ error: r.error }, r.status);
        return c.json({ flag: r.flag });
      }
      if (action === 'apply') {
        if (!flag.suggestion) return c.json({ error: 'There is no fix to apply; edit the entry instead' }, 400);
        const entry = await deps.kv.get(flag.expenseKey);
        if (!entry) return c.json({ error: 'The entry was deleted' }, 404);
        const fix = Object.fromEntries(Object.entries(flag.suggestion).filter(([k]) => SUGGESTION_FIELDS.includes(k)));
        const before = Object.fromEntries(Object.keys(fix).map((k) => [k, entry[k] ?? null]));
        await deps.kv.set(flag.expenseKey, { ...entry, ...fix, reviewFixes: [...(entry.reviewFixes || []), { kind: flag.kind, before, after: fix, by: v.name, at: new Date().toISOString() }] });
      }
      const note = typeof body?.note === 'string' && body.note.trim() ? body.note.trim().slice(0, 300) : undefined;
      // Marking a big buy correct says why (older app versions don't send it).
      const reason = action === 'dismiss' && ASKS_WHY.includes(flag.kind) && BIG_BUY_REASONS[body?.reason] ? String(body.reason) : undefined;
      if (reason === 'other' && !note) return c.json({ error: 'Write why it was bigger' }, 400);
      const at = new Date().toISOString();
      if (reason) await rememberBigBuy(deps.kv, flag, reason, note, v.name, at);
      const next: Flag = { ...flag, status: action === 'apply' ? 'fixed' : 'dismissed', decidedBy: v.name, decidedAt: at, note, ...(reason ? { reason } : {}) };
      await deps.kv.set(`expense-flag:${id}`, next);
      return c.json({ flag: next });
    } catch (error) {
      console.log('Error deciding an expense flag:', error);
      return c.json({ error: 'Could not save that' }, 500);
    }
  };
  app.post(`${P}/expense-flags/:id/apply`, (c: any) => decide(c, 'apply'));
  app.post(`${P}/expense-flags/:id/dismiss`, (c: any) => decide(c, 'dismiss'));

  // The missing bill photo, added afterwards: the path from POST /expense-bills goes on the entry.
  app.post(`${P}/expense-flags/:id/bill`, async (c: any) => {
    const v: any = await viewerOf(c);
    if (v.error) return v.error;
    try {
      const id = decodeURIComponent(c.req.param('id'));
      const flag: Flag | null = await deps.kv.get(`expense-flag:${id}`);
      if (!flag || flag.kind !== 'bill') return c.json({ error: 'That check was not found' }, 404);
      if (!canSee(v, flag)) return c.json({ error: 'This entry belongs to another place' }, 403);
      if (flag.status !== 'open') return c.json({ error: 'Someone has already decided this one' }, 409);
      const body = await c.req.json().catch(() => ({}));
      if (!isBillPath(body?.path)) return c.json({ error: 'Take a photo of the bill first' }, 400);
      const entry = await deps.kv.get(flag.expenseKey);
      if (!entry) return c.json({ error: 'The entry was deleted' }, 404);
      await deps.kv.set(flag.expenseKey, { ...entry, billPhotoPath: body.path });
      const next: Flag = { ...flag, status: 'fixed', decidedBy: v.name, decidedAt: new Date().toISOString() };
      await deps.kv.set(`expense-flag:${id}`, next);
      return c.json({ flag: next });
    } catch (error) {
      console.log('Error adding a bill photo:', error);
      return c.json({ error: 'Could not save that' }, 500);
    }
  });
}
