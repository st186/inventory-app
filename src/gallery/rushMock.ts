// Made-up orders for Insights > Rush hours in insights-preview.html: 12 weeks of evenings with a
// 7-9 PM rush (busier on Friday to Sunday), run through the server's own rushInsights.ts so the
// preview shows what the live page would.
import * as rush from '../../supabase/functions/make-server-c2dd9b9d/rushInsights';

const MENU: [string, number][] = [
  ['Steamed Chicken Momos', 30], ['Chicken Steamed Momos [6 Pieces] -O', 14], ['Chicken Kurkure Momos [6 Pieces] -O', 8], ['Chicken Fried Momos', 7],
  ['Steamed Veg Momos', 7], ['Chicken Pan Fried Momos', 5], ['Veg Steamed Momos [6 Pieces] -O', 4], ['Chicken Momos In Afghani Sauce', 3],
  ['Steamed Paneer Momos', 2], ['Steamed Corn Cheese Momos', 2], ['Chicken Cheese Steamed Momos [6 Pieces] -O', 2], ['Chicken Peri Peri Fried Momos', 3],
];
const DAY_SIZE = [52, 34, 32, 34, 38, 50, 62]; // Sunday..Saturday

function seeded(seed: number) {
  let s = seed % 2147483647;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

export function rushMock(today: string, planDate?: string) {
  const rnd = seeded(7);
  const pick = () => {
    const total = MENU.reduce((s, [, w]) => s + w, 0);
    let r = rnd() * total;
    for (const [name, w] of MENU) { r -= w; if (r <= 0) return name; }
    return MENU[0][0];
  };
  const days: rush.Day[] = [];
  for (let i = 84; i >= 1; i--) {
    const date = new Date(Date.parse(`${today}T00:00:00Z`) - i * 86400000).toISOString().slice(0, 10);
    const weekday = new Date(`${date}T00:00:00Z`).getUTCDay();
    const n = Math.round(DAY_SIZE[weekday] * (0.85 + rnd() * 0.3));
    const orders: any[] = [];
    for (let k = 0; k < n; k++) {
      // Half the orders in the 7-9 PM rush, a small bump at 5 PM, the rest spread out.
      const r = rnd();
      const min = r < 0.5 ? 19 * 60 + rnd() * 120 : r < 0.62 ? 17 * 60 + rnd() * 45 : 15 * 60 + rnd() * 450;
      const online = rnd() < 0.42;
      orders.push({
        orderId: `${date}-${k}`, entryMin: Math.floor(min), orderHourIST: Math.floor(min / 60),
        orderType: online ? 'HomeDelivery' : rnd() < 0.5 ? 'DineIn' : 'TakeAway', paymentMode: online ? (rnd() < 0.75 ? 'Zomato' : 'Swiggy') : 'Cash',
        rawItems: Array.from({ length: 1 + (rnd() < 0.3 ? 1 : 0) }, () => ({ productName: pick(), quantity: rnd() < 0.2 ? 2 : 1 })),
      });
    }
    days.push(rush.ordersOfDay({ date, orders }));
  }
  const profiles = rush.weekdayProfiles(days);
  const ahead = Array.from({ length: 7 }, (_, i) => new Date(Date.parse(`${today}T00:00:00Z`) + i * 86400000).toISOString().slice(0, 10));
  const forecast = rush.forecastDays(days, profiles, ahead);
  const date = planDate && ahead.includes(planDate) ? planDate : today;
  const day = forecast.find((f) => f.date === date)!;
  const plan = rush.steamerPlan(profiles[day.weekday], day.factor);
  const timeline: [number, number][] = [];
  const now = new Date(Date.now() + 5.5 * 3600_000);
  const nowMin = now.getUTCHours() * 60 + now.getUTCMinutes();
  for (let m = 15 * 60; m <= Math.min(nowMin, 23 * 60); m += 3) timeline.push([m, Math.max(0, Math.round((m >= 19 * 60 && m < 21 * 60 ? 5 : m >= 17 * 60 && m < 17 * 60 + 45 ? 3 : 1) + (rnd() - 0.5) * 3))]);
  return {
    storeId: 'STORE-1', storeName: 'Bunny Momos 1', today, weeks: 12, days: days.length, orders: days.reduce((s, d) => s + d.orders.length, 0), exactShare: 1,
    slots: Array.from({ length: rush.SLOTS }, (_, i) => rush.slotLabel(i)),
    profiles, mix: rush.rushMix(days, profiles), forecast,
    plan: { date, weekday: day.weekday, settings: plan.settings, runs: plan.runs, slots: plan.slots },
    live: { today: timeline, avgOpen: Array.from({ length: rush.SLOTS }, (_, i) => (i >= 16 && i < 24 ? 4.5 : i >= 8 && i < 11 ? 2.5 : 1)), daysWithLooks: 3 },
    steamerStyles: rush.STEAMER_STYLES,
  };
}
