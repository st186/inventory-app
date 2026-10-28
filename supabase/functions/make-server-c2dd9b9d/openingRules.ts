// The store opening checklist's rules (openingChecklist.ts): the default list, what is due on a
// date, who does it, and the day's score. No Deno or network here, so plain node can test it
// (openingRules.test.ts).
import { istDate, parseHHMM } from './kpiCore.ts';

export type OpeningItem = { id: string; name: string; nameBn: string; days?: number[]; children?: { id: string; name: string; nameBn: string }[] };
export type OpeningTemplate = {
  storeId: string; assigneeId: string | null; coverId: string | null; backupId: string | null;
  notifyAt: string; dueBy: string; coverDueBy: string; items: OpeningItem[]; startedOn: string; updatedAt?: string; updatedBy?: string;
};
export type OpeningDay = {
  date: string; storeId: string; ticks: Record<string, { at: string; byId: string; byName: string }>;
  pickedId?: string; pickedBy?: string; sent?: { morning?: string; late?: string; pick?: string };
};

export const DEFAULT_OPENING_ITEMS: OpeningItem[] = [
  { id: 'oil', name: 'Oil refilled and clean', nameBn: 'তেল ভরা ও পরিষ্কার' },
  { id: 'butter', name: 'Butter stock checked', nameBn: 'মাখনের স্টক দেখা' },
  { id: 'soup', name: 'Soup ready', nameBn: 'স্যুপ তৈরি' },
  { id: 'sauces', name: 'Sauces ready and filled', nameBn: 'সস তৈরি ও ভরা' },
  { id: 'kot', name: 'KOT machine checked', nameBn: 'KOT মেশিন দেখা' },
  { id: 'pos', name: 'Laptop and POS machine set', nameBn: 'ল্যাপটপ ও POS মেশিন সেট' },
  { id: 'seating', name: 'Lights, fans, tables and chairs set up', nameBn: 'লাইট, পাখা, টেবিল-চেয়ার সাজানো' },
  { id: 'burger', name: 'Burger stock there or ordered', nameBn: 'বার্গারের স্টক আছে বা অর্ডার দেওয়া' },
  {
    id: 'equipment', name: 'Equipment working', nameBn: 'যন্ত্রপাতি চালু',
    children: [
      { id: 'induction-gravy', name: 'Induction 1 (gravy) working', nameBn: 'ইন্ডাকশন ১ (গ্রেভি) চালু' },
      { id: 'griller', name: 'Griller working', nameBn: 'গ্রিলার চালু' },
      { id: 'induction-steamer', name: 'Induction 2 (steamer) working', nameBn: 'ইন্ডাকশন ২ (স্টিমার) চালু' },
      { id: 'fryer', name: 'Fryer working', nameBn: 'ফ্রায়ার চালু' },
    ],
  },
  { id: 'porch', name: 'Front porch clean, drain clear', nameBn: 'সামনের জায়গা পরিষ্কার, নালা খোলা' },
  { id: 'dustbin', name: 'Dustbin set up', nameBn: 'ডাস্টবিন রাখা' },
  { id: 'pooja', name: 'Pooja done, dhoop shown', nameBn: 'পুজো, ধূপ দেখানো' },
  { id: 'drinks', name: 'Water and cold drinks stocked', nameBn: 'জল ও কোল্ড ড্রিংকসের স্টক' },
  { id: 'lemon-chilli', name: 'Lemon and chillies hung at the entrance', nameBn: 'দরজায় লেবু-লঙ্কা ঝোলানো', days: [6] },
];

export const istMinutesOf = (iso: string) => { const d = new Date(Date.parse(iso) + 330 * 60000); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const weekday = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();

// The boxes to tick on a date: every item that applies that weekday, a group as its parts.
export function openingTickables(t: Pick<OpeningTemplate, 'items'>, date: string) {
  const wd = weekday(date);
  const out: { id: string; name: string; nameBn: string; group?: string; groupBn?: string }[] = [];
  for (const it of t.items) {
    if (it.days?.length && !it.days.includes(wd)) continue;
    if (it.children?.length) it.children.forEach((c) => out.push({ ...c, group: it.name, groupBn: it.nameBn }));
    else out.push({ id: it.id, name: it.name, nameBn: it.nameBn });
  }
  return out;
}

// The day's score, 0-1: each box ticked by the due time counts 1, ticked later that day 0.5.
export function openingScore(t: Pick<OpeningTemplate, 'items'>, day: Pick<OpeningDay, 'ticks'> | null, date: string, dueBy: string) {
  const boxes = openingTickables(t, date);
  if (!boxes.length) return null;
  const due = parseHHMM(dueBy) ?? 16 * 60;
  let sum = 0;
  for (const b of boxes) {
    const tick = day?.ticks?.[b.id];
    if (!tick) continue;
    sum += istDate(Date.parse(tick.at)) === date && istMinutesOf(tick.at) <= due ? 1 : 0.5;
  }
  return sum / boxes.length;
}

// Who does it on a date and by when; null person when everyone set up is away and nobody is picked.
export function openingDoer(t: OpeningTemplate, day: OpeningDay | null, date: string, isAway: (id: string) => boolean) {
  if (!t.assigneeId) return { personId: null, as: null, dueBy: t.dueBy };
  if (!isAway(t.assigneeId)) return { personId: t.assigneeId, as: 'assignee' as const, dueBy: t.dueBy };
  if (t.coverId && !isAway(t.coverId)) return { personId: t.coverId, as: 'cover' as const, dueBy: t.coverDueBy };
  if (t.backupId && !isAway(t.backupId)) return { personId: t.backupId, as: 'backup' as const, dueBy: t.dueBy };
  if (day?.pickedId) return { personId: day.pickedId, as: 'picked' as const, dueBy: t.dueBy };
  return { personId: null, as: null, dueBy: t.dueBy };
}
