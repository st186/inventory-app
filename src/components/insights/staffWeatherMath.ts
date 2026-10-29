// Staffing against orders by hour, and the weather's effect on sales (owner, 30 Oct 2026). Tested
// with plain node:  node src/components/insights/staffWeatherMath.test.ts

// ---- Staffing: who was at the store each hour (shift check-ins, server /insights/staffing) ----

export type StaffDay = { date: string; staffHours: number; wages: number; byHour: number[] };
export type OrderDay = { date: string; orders: { orderHourIST?: number | null; grandTotal?: number | null }[] };

export const OPEN_HOUR = 15;
export const CLOSE_HOUR = 22;
export const BUSY_PER_STAFF = 6;  // orders an hour per person on shift: more is stretched thin
export const QUIET_PER_STAFF = 1; // fewer, with two or more on shift: more people than the orders need

export function staffing(staff: StaffDay[], orders: OrderDay[]) {
  const byDate = new Map(orders.map((o) => [o.date, o]));
  const counted = staff.filter((s) => s.staffHours > 0 && byDate.has(s.date));
  const days = counted.map((s) => {
    const sales = (byDate.get(s.date)!.orders || []).reduce((t, o) => t + (Number(o.grandTotal) || 0), 0);
    return {
      date: s.date, staffHours: s.staffHours, wages: s.wages, sales: Math.round(sales),
      labourPct: sales ? Math.round((s.wages / sales) * 1000) / 10 : null,
      salesPerStaffHour: s.staffHours ? Math.round(sales / s.staffHours) : null,
    };
  });
  const n = counted.length || 1;
  const hours = [];
  for (let h = OPEN_HOUR; h <= CLOSE_HOUR; h++) {
    const staffAvg = counted.reduce((t, s) => t + (s.byHour[h] || 0), 0) / n;
    const ordersAvg = counted.reduce((t, s) => t + (byDate.get(s.date)!.orders || []).filter((o) => o.orderHourIST === h).length, 0) / n;
    const perStaff = staffAvg > 0.05 ? ordersAvg / staffAvg : null;
    hours.push({
      hour: h, staff: Math.round(staffAvg * 10) / 10, orders: Math.round(ordersAvg * 10) / 10,
      perStaff: perStaff === null ? null : Math.round(perStaff * 10) / 10,
      flag: perStaff === null ? (ordersAvg >= 1 ? 'nobody' as const : null) : perStaff >= BUSY_PER_STAFF ? 'stretched' as const : perStaff <= QUIET_PER_STAFF && staffAvg >= 2 ? 'spare' as const : null,
    });
  }
  const wages = days.reduce((t, d) => t + d.wages, 0);
  const sales = days.reduce((t, d) => t + d.sales, 0);
  const staffHours = days.reduce((t, d) => t + d.staffHours, 0);
  return {
    days, hours, daysCounted: days.length,
    labourPct: sales ? Math.round((wages / sales) * 1000) / 10 : null,
    salesPerStaffHour: staffHours ? Math.round(sales / staffHours) : null,
  };
}

// ---- Weather: what rain does to the counter and the apps ----

export type WeatherDay = { date: string; rainMm: number; rainChance: number | null; maxC: number | null };
export type SalesDay = { date: string; counter: number; online: number };
export const RAINY_MM = 5; // a day with this much rain counts as rainy
const DRY_MM = 1;

const weekday = (d: string) => new Date(`${d}T00:00:00Z`).getUTCDay();

/**
 * How rainy days compare with dry days of the same weekday, for the counter and for the apps: the
 * average of each rainy day's sales over the mean of its weekday's dry days. Needs at least 3 rainy
 * days with a dry match.
 */
export function rainEffect(weather: WeatherDay[], sales: SalesDay[], today: string) {
  const s = new Map(sales.filter((x) => x.counter + x.online > 0).map((x) => [x.date, x]));
  const past = weather.filter((w) => w.date < today && s.has(w.date));
  const dry = past.filter((w) => w.rainMm < DRY_MM);
  const ratios = { counter: [] as number[], online: [] as number[] };
  let rainy = 0;
  for (const w of past.filter((x) => x.rainMm >= RAINY_MM)) {
    const same = dry.filter((x) => weekday(x.date) === weekday(w.date)).map((x) => s.get(x.date)!);
    if (!same.length) continue;
    const base = { counter: same.reduce((t, x) => t + x.counter, 0) / same.length, online: same.reduce((t, x) => t + x.online, 0) / same.length };
    const day = s.get(w.date)!;
    rainy++;
    if (base.counter > 0) ratios.counter.push(day.counter / base.counter);
    if (base.online > 0) ratios.online.push(day.online / base.online);
  }
  if (rainy < 3) return null;
  const change = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length - 1) * 100) : null);
  return { rainyDays: rainy, dryDays: dry.length, counter: change(ratios.counter), online: change(ratios.online) };
}

/** The next days from today with their rain, flagged rainy from 5 mm or a 60% chance. */
export const upcomingWeather = (weather: WeatherDay[], today: string) =>
  weather.filter((w) => w.date >= today).slice(0, 7).map((w) => ({ ...w, rainy: w.rainMm >= RAINY_MM || (w.rainChance ?? 0) >= 60 }));
