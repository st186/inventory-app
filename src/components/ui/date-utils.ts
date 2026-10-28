// Calendar maths on "YYYY-MM-DD" strings (the app's IST business dates). Everything works in
// UTC internally, so a date never slides a day because of the phone's time zone.

import { translate, type Lang } from "../../utils/i18n";

export type ISODate = string;

/** Today's date in India (UTC+5:30), whatever the device's time zone. */
export function todayIST(): ISODate {
  return new Date(Date.now() + 5.5 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

export function parseISODate(date: ISODate): Date {
  return new Date(`${date}T00:00:00Z`);
}

export function toISODate(d: Date): ISODate {
  return d.toISOString().slice(0, 10);
}

export function addDaysISO(date: ISODate, days: number): ISODate {
  const d = parseISODate(date);
  d.setUTCDate(d.getUTCDate() + days);
  return toISODate(d);
}

export function addMonthsISO(date: ISODate, months: number): ISODate {
  const d = parseISODate(date);
  const day = d.getUTCDate();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() + months);
  const last = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).getUTCDate();
  d.setUTCDate(Math.min(day, last));
  return toISODate(d);
}

export function startOfMonthISO(date: ISODate): ISODate {
  return `${date.slice(0, 7)}-01`;
}

export function endOfMonthISO(date: ISODate): ISODate {
  const d = parseISODate(date);
  return toISODate(new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)));
}

/** Monday of the week containing `date`. */
export function startOfWeekISO(date: ISODate): ISODate {
  const d = parseISODate(date);
  const dow = (d.getUTCDay() + 6) % 7; // Monday = 0
  return addDaysISO(date, -dow);
}

export function dayOfWeek(date: ISODate): number {
  return parseISODate(date).getUTCDay();
}

export function diffDays(a: ISODate, b: ISODate): number {
  return Math.round((parseISODate(a).getTime() - parseISODate(b).getTime()) / 86400000);
}

export function clampISO(date: ISODate, min?: ISODate, max?: ISODate): ISODate {
  if (min && date < min) return min;
  if (max && date > max) return max;
  return date;
}

/** "Mon" in the chosen language. */
export function weekdayShort(date: ISODate, lang: Lang): string {
  return translate(lang, `date.wd.${dayOfWeek(date)}` as never);
}

/** "October 2026". */
export function monthYearLabel(date: ISODate, lang: Lang): string {
  const d = parseISODate(date);
  return `${translate(lang, `date.m.${d.getUTCMonth()}` as never)} ${d.getUTCFullYear()}`;
}

/** "27 Oct" (adds the year when it isn't this year). */
export function shortDateLabel(date: ISODate, lang: Lang, today: ISODate = todayIST()): string {
  const d = parseISODate(date);
  const base = `${d.getUTCDate()} ${translate(lang, `date.ms.${d.getUTCMonth()}` as never)}`;
  return date.slice(0, 4) === today.slice(0, 4) ? base : `${base} ${d.getUTCFullYear()}`;
}

/** "Today, 27 Oct" / "Yesterday, 26 Oct" / "Fri 24 Oct". */
export function friendlyDateLabel(date: ISODate, lang: Lang, today: ISODate = todayIST()): string {
  const diff = diffDays(date, today);
  const short = shortDateLabel(date, lang, today);
  if (diff === 0) return `${translate(lang, "date.today")}, ${short}`;
  if (diff === -1) return `${translate(lang, "date.yesterday")}, ${short}`;
  return `${weekdayShort(date, lang)} ${short}`;
}

export type RangePreset = "today" | "yesterday" | "thisWeek" | "thisMonth" | "lastMonth" | "last6Months" | "thisYear" | "custom";

export type DateRange = { preset: RangePreset; from: ISODate; to: ISODate };

export const RANGE_PRESETS: RangePreset[] = ["today", "yesterday", "thisWeek", "thisMonth", "lastMonth", "last6Months", "thisYear", "custom"];

/** The from/to dates a preset stands for, as of `today`. */
export function rangeForPreset(preset: RangePreset, today: ISODate = todayIST(), custom?: { from: ISODate; to: ISODate }): DateRange {
  switch (preset) {
    case "today":
      return { preset, from: today, to: today };
    case "yesterday": {
      const y = addDaysISO(today, -1);
      return { preset, from: y, to: y };
    }
    case "thisWeek":
      return { preset, from: startOfWeekISO(today), to: today };
    case "thisMonth":
      return { preset, from: startOfMonthISO(today), to: today };
    case "lastMonth": {
      const prev = addMonthsISO(startOfMonthISO(today), -1);
      return { preset, from: prev, to: endOfMonthISO(prev) };
    }
    case "last6Months":
      return { preset, from: addMonthsISO(startOfMonthISO(today), -5), to: today };
    case "thisYear":
      return { preset, from: `${today.slice(0, 4)}-01-01`, to: today };
    case "custom":
    default:
      return { preset: "custom", from: custom?.from ?? today, to: custom?.to ?? today };
  }
}

const presetKey: Record<RangePreset, string> = {
  today: "date.today",
  yesterday: "date.yesterday",
  thisWeek: "date.thisWeek",
  thisMonth: "date.thisMonth",
  lastMonth: "date.lastMonth",
  last6Months: "date.last6Months",
  thisYear: "date.thisYear",
  custom: "date.custom",
};

export function presetLabel(preset: RangePreset, lang: Lang): string {
  return translate(lang, presetKey[preset] as never);
}

/** Chip text: the preset name, or "1 Oct – 27 Oct" for a custom range. */
export function rangeLabel(range: DateRange, lang: Lang, today: ISODate = todayIST()): string {
  if (range.preset !== "custom") return presetLabel(range.preset, lang);
  if (range.from === range.to) return shortDateLabel(range.from, lang, today);
  return `${shortDateLabel(range.from, lang, today)} – ${shortDateLabel(range.to, lang, today)}`;
}
