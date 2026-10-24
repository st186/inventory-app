// The food in an order costs the same wherever it is sold, but Zomato and Swiggy menus charge
// more for the same dishes. This values each channel's orders at COUNTER prices (the dish's
// latest counter price from the same POS data), so food cost can be shared out by how much
// food each channel actually sold, and channels can be compared on the same food.
//
// Dish matching follows OnlineSalesTab's Channel Economics: online and counter menus name the
// same dish differently, so names are compared on their words; combo "Addon" sibling lines
// (rate 0 by design) and drinks/add-ons are skipped.

import type { OrderItemDetailRecord } from './api';

export type Channel = 'counter' | 'zomato' | 'swiggy';

const NON_FOOD_KEYWORDS = ['drink', 'cola', 'campa', 'water', 'beverage', 'soup', 'samosa', 'nugget', 'popcorn', 'fries', 'mojito', 'mocktail', 'cake'];
const isFoodItem = (name: string) => !NON_FOOD_KEYWORDS.some((k) => name.toLowerCase().includes(k));
const dishKey = (name: string) => name
  .toLowerCase()
  .replace(/\[[^\]]*\]|\(\s*\d+\s*pieces?[^)]*\)/gi, ' ')
  .replace(/[^a-z\s]/g, ' ')
  .split(/\s+/)
  .filter((w) => w && !['o', 'normal', 'regular', 'momo', 'momos', 'piece', 'pieces', 'pcs'].includes(w))
  .sort()
  .join(' ');

// Same split as the Orders per Day chart: no external id = counter, then by payment mode.
export const channelOf = (o: any): Channel => (!o.externalId ? 'counter' : o.paymentMode === 'Swiggy' ? 'swiggy' : 'zomato');

export type ChannelFoodValue = {
  menuValue: number; // food sold, at the channel's own menu prices
  counterValue: number; // the same food at counter prices
  pricedShare: number; // share of menuValue whose dish had a counter price to compare with
};

export function counterValueByChannel(records: OrderItemDetailRecord[]): Record<Channel, ChannelFoodValue> {
  // Latest counter price per dish, from real counter sales (not complimentary).
  const counterPrice = new Map<string, { price: number; date: string }>();
  for (const rec of records || []) {
    for (const o of (rec.orders || []) as any[]) {
      if (channelOf(o) !== 'counter' || o.paymentMode === 'Complimentary') continue;
      (o.items || []).forEach((it: any, idx: number) => {
        if (o.rawItems?.[idx]?.categoryName === 'Addon') return;
        const price = Number(it.rate), name = it.productName || '';
        if (!(price > 0) || !isFoodItem(name)) return;
        const key = dishKey(name);
        const cur = key ? counterPrice.get(key) : undefined;
        if (key && (!cur || rec.date >= cur.date)) counterPrice.set(key, { price, date: rec.date });
      });
    }
  }

  const acc: Record<Channel, { menu: number; counter: number; pricedMenu: number }> = {
    counter: { menu: 0, counter: 0, pricedMenu: 0 }, zomato: { menu: 0, counter: 0, pricedMenu: 0 }, swiggy: { menu: 0, counter: 0, pricedMenu: 0 },
  };
  for (const rec of records || []) {
    for (const o of (rec.orders || []) as any[]) {
      if (o.paymentMode === 'Complimentary') continue;
      const a = acc[channelOf(o)];
      (o.items || []).forEach((it: any, idx: number) => {
        if (o.rawItems?.[idx]?.categoryName === 'Addon') return;
        const name = it.productName || '';
        if (!isFoodItem(name)) return;
        const qty = Number(it.quantity) || 0;
        const line = Number(it.total) || Number(it.rate) * qty || 0;
        if (!(line > 0)) return;
        a.menu += line;
        const cp = counterPrice.get(dishKey(name));
        if (cp) { a.counter += cp.price * qty; a.pricedMenu += line; }
      });
    }
  }
  const out = {} as Record<Channel, ChannelFoodValue>;
  for (const ch of ['counter', 'zomato', 'swiggy'] as Channel[]) {
    const a = acc[ch];
    // Dishes with no counter price are assumed to carry the same mark-up as the priced ones.
    out[ch] = { menuValue: a.menu, counterValue: a.pricedMenu > 0 ? a.counter * (a.menu / a.pricedMenu) : 0, pricedShare: a.menu > 0 ? a.pricedMenu / a.menu : 0 };
  }
  return out;
}
