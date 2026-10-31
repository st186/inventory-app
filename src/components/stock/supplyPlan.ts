// Bunny's sauces, kitchen supplies and boxes for the store's request (owner, 30 Oct 2026: Bunny
// filled only the momos). Every item the store asks for regularly has its own rhythm: how much
// the store sells between two deliveries of it. Once sales since its last delivery reach 90% of
// that, it goes on the request at its usual amount. Busy days bring it forward and quiet days push
// it back. Anything the store staff flagged running low goes on as well.
// Tested with plain node:  node src/components/stock/supplyPlan.test.ts

export type SupplySection = 'sauce' | 'kitchen' | 'utility';
export interface SupplyCatalog { sauces: string[]; kitchen: { name: string; unit: string }[]; utilities: string[] }
export interface SupplyAlertLite { item: string; level: 'low' | 'out'; qty?: number | null; unit?: string | null; by?: string }
export type SupplyWhy =
  | { kind: 'due'; everyDays: number; last: string; times: number }
  | { kind: 'flag'; level: 'low' | 'out'; by?: string };
export interface SupplyPick { section: SupplySection; name: string; quantity: number; unit?: string; why: SupplyWhy }

export const SUPPLY_LOOKBACK_DAYS = 35;
export const MIN_TIMES = 3;  // asked for at least this often in the lookback to have a rhythm
const DUE_AT = 0.9;
const STOPPED_AFTER = 3;     // more than 3 of its usual gaps since the last time, and over a week: no longer asked for
const STOPPED_DAYS = 7;

const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};
const daysBetween = (a: string, b: string) => Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86400000);
const median = (xs: number[]) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const SKIP = ['rejected', 'cancelled'];

/** The amount a request asked for of one item (0 = not on it). */
function askedOn(r: Record<string, any>, section: SupplySection, name: string): number {
  if (section === 'sauce') return r.sauces?.[name] ? 1 : 0;
  return section === 'kitchen' ? Number(r.kitchenUtilities?.[name]?.quantity) || 0 : Number(r.utilities?.[name]) || 0;
}

/** The amount that reached the store (0 = not on it, or sent as none). */
function amountOn(r: Record<string, any>, section: SupplySection, name: string): number {
  const asked = askedOn(r, section, name);
  if (section === 'sauce') return asked;
  const shipped = r.shippedQuantities?.[`${section === 'kitchen' ? 'kitchenUtility' : 'utility'}_${name}`];
  return shipped !== undefined && shipped !== null && Number(shipped) <= 0 ? 0 : asked;
}

export function planSupplies(opts: {
  requestDate: string;
  requests: Record<string, any>[];
  revenue: Record<string, number>; // date -> sales (past days from the POS, coming days from the forecast)
  alerts?: SupplyAlertLite[];
  catalog: SupplyCatalog;
}): SupplyPick[] {
  const { requestDate, catalog } = opts;
  const from = addDays(requestDate, -SUPPLY_LOOKBACK_DAYS);
  const reqs = opts.requests.filter((r) => r.requestDate >= from && r.requestDate < requestDate && !SKIP.includes(r.status));
  const known = Object.values(opts.revenue).filter((v) => v > 0);
  const usualDay = median(known);
  const sales = (a: string, b: string) => { // sales on days a..b-1
    let t = 0;
    for (let d = a; d < b; d = addDays(d, 1)) t += opts.revenue[d] > 0 ? opts.revenue[d] : usualDay;
    return t;
  };

  const items: { section: SupplySection; name: string; unit?: string }[] = [
    ...catalog.sauces.map((name) => ({ section: 'sauce' as const, name })),
    ...catalog.kitchen.map((k) => ({ section: 'kitchen' as const, name: k.name, unit: k.unit })),
    ...catalog.utilities.map((name) => ({ section: 'utility' as const, name, unit: 'pcs' })),
  ];
  const picks = new Map<string, SupplyPick>();
  const usualQty = new Map<string, number>(); // also for flagged items asked for only once or twice
  for (const it of items) {
    const times = reqs
      .map((r) => ({ date: r.requestDate as string, n: amountOn(r, it.section, it.name) }))
      .filter((x) => x.n > 0)
      .sort((a, b) => a.date.localeCompare(b.date));
    const asked = reqs.map((r) => askedOn(r, it.section, it.name)).filter((n) => n > 0);
    if (asked.length) usualQty.set(`${it.section}:${it.name}`, median(asked));
    const dates = [...new Set(times.map((x) => x.date))];
    if (dates.length < MIN_TIMES) continue;
    const between = dates.slice(1).map((d, i) => sales(dates[i], d));
    const typical = median(between);
    const last = dates[dates.length - 1];
    const since = sales(last, requestDate);
    const stopped = since > typical * STOPPED_AFTER && daysBetween(last, requestDate) > STOPPED_DAYS;
    if (!typical || since < typical * DUE_AT || stopped) continue;
    const qty = median(times.map((x) => x.n));
    picks.set(`${it.section}:${it.name}`, {
      section: it.section, name: it.name, unit: it.unit,
      quantity: it.section === 'kitchen' ? Math.round(qty * 100) / 100 : Math.max(1, Math.round(qty)),
      why: { kind: 'due', everyDays: Math.max(1, Math.round(median(dates.slice(1).map((d, i) => daysBetween(dates[i], d))))), last, times: dates.length },
    });
  }

  // Running-low flags: match them to a request item by name ("table box" -> Table Box).
  for (const a of opts.alerts || []) {
    const n = norm(a.item);
    if (n.length < 3) continue;
    const it = items.find((x) => { const m = norm(x.name); return m === n || (Math.min(m.length, n.length) >= 4 && (m.includes(n) || n.includes(m))); });
    if (!it) continue;
    const key = `${it.section}:${it.name}`;
    const had = picks.get(key);
    const fromFlag = a.qty && a.qty > 0 && (!a.unit || !it.unit || norm(a.unit) === norm(it.unit)) ? a.qty : 0;
    const usual = had?.quantity || usualQty.get(key) || 1;
    picks.set(key, {
      section: it.section, name: it.name, unit: it.unit,
      quantity: it.section === 'sauce' ? 1 : fromFlag || usual,
      why: { kind: 'flag', level: a.level, by: a.by },
    });
  }
  return [...picks.values()];
}
