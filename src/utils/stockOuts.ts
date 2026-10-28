// Out-of-stock log: whoever is billing at the store records each item that runs out, why, and
// from when to when. Online, the item is switched off in Ciferon (which turns it off on Zomato
// and Swiggy); at the counter there is no switch, so customers are told and offered something
// else. Store SOP ST-28.

import { MOMO_TYPES } from '../constants/momoTypes';

export type StockOutReason = 'sold_out' | 'short_delivery' | 'not_requested' | 'quality' | 'equipment' | 'ingredient' | 'other';

export const STOCK_OUT_REASONS: { id: StockOutReason; label: string; hint: string }[] = [
  { id: 'sold_out', label: 'Sold out', hint: 'More sold than we had' },
  { id: 'short_delivery', label: 'Delivery short or late', hint: 'Production sent less, or it has not arrived' },
  { id: 'not_requested', label: 'Not requested enough', hint: 'We asked for too little or forgot it' },
  { id: 'quality', label: 'Bad quality', hint: 'Soft, stuck, expired or failed a check' },
  { id: 'equipment', label: 'Equipment down', hint: 'Fryer, steamer, induction' },
  { id: 'ingredient', label: 'Ingredient finished', hint: 'Sauce, cheese, buns, oil...' },
  { id: 'other', label: 'Other', hint: 'Write why' },
];

export const stockOutReasonLabel = (id?: string) => STOCK_OUT_REASONS.find((r) => r.id === id)?.label || 'No reason';

export type StockOutCategory = 'momo' | 'sauce' | 'other';

export interface StockOutEntry {
  id: string;
  storeId: string;
  item: string;
  category: StockOutCategory;
  reason: StockOutReason;
  reasonNote?: string;
  startAt: string; // ISO
  endAt?: string | null; // ISO; empty while still out
  offOnline: boolean; // switched off in Ciferon for Zomato/Swiggy
  backOnline?: boolean; // switched back on in Ciferon when it ended
  createdBy: string;
  createdByName: string;
  endedByName?: string;
  createdAt: string;
  updatedAt: string;
}

// The items a store runs out of, grouped as they appear in the picker. Anything else (a single
// dish, a drink) is typed in as "Other item".
export const STOCK_OUT_ITEMS: { category: StockOutCategory; group: string; items: string[] }[] = [
  { category: 'momo', group: 'Momos', items: MOMO_TYPES.map((t) => `${t.label} momos`) },
  {
    category: 'sauce',
    group: 'Sauces, gravies and soup',
    items: ['Red Sauce', 'Green Sauce', 'Hot Garlic Sauce', 'Pan-Fried Sauce', 'Butter Makhani Sauce', 'Chilli Chicken Sauce', 'Korean Sauce', 'Tandoori Sauce', 'Jhol Momo Gravy', 'Soup Premix'],
  },
  {
    category: 'other',
    group: 'Other',
    items: ['Burger buns', 'Liquid Cheese', 'Fresh Cream', 'Butter', 'Peri-Peri Masala', 'Cold drinks', 'Water bottles', 'Parcel Box', 'Table Box'],
  },
];

export function categoryForItem(item: string): StockOutCategory {
  return STOCK_OUT_ITEMS.find((g) => g.items.includes(item))?.category || 'other';
}

// "2 h 15 min", "40 min".
export function stockOutDuration(startAt: string, endAt?: string | null, now = Date.now()): string {
  const ms = Math.max(0, (endAt ? Date.parse(endAt) : now) - Date.parse(startAt));
  const mins = Math.round(ms / 60000);
  if (mins < 60) return `${mins} min`;
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return m ? `${h} h ${m} min` : `${h} h`;
}

export const stockOutMinutes = (startAt: string, endAt?: string | null, now = Date.now()) =>
  Math.max(0, Math.round(((endAt ? Date.parse(endAt) : now) - Date.parse(startAt)) / 60000));

// IST wall-clock helpers for the time inputs: the phone may not be set to IST, but the shop is.
const IST_OFFSET_MIN = 330;
export function istDate(iso: string): string {
  return new Date(Date.parse(iso) + IST_OFFSET_MIN * 60000).toISOString().slice(0, 10);
}
export function istTime(iso: string): string {
  return new Date(Date.parse(iso) + IST_OFFSET_MIN * 60000).toISOString().slice(11, 16);
}
export function istToISO(date: string, time: string): string {
  return new Date(Date.parse(`${date}T${time}:00Z`) - IST_OFFSET_MIN * 60000).toISOString();
}
export function istClock(iso: string): string {
  const [h, m] = istTime(iso).split(':').map(Number);
  return `${((h + 11) % 12) + 1}:${String(m).padStart(2, '0')} ${h < 12 ? 'am' : 'pm'}`;
}
