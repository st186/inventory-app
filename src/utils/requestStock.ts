// What a stock request (production request) moved out of the production house and into a
// store, for the stock screens. Request quantities are stored under the short finished-product
// keys (`chicken`, `chickenCheese`, ... - see utils/batches.ts); requests from before the
// dynamic item list used the long production keys (`chickenMomos`, ...).
import { MOMO_TYPES } from '../constants/momoTypes';
import { utcToIST } from './timezone';

const LONG_KEYS: Record<string, string> = Object.fromEntries(MOMO_TYPES.map((t) => [t.inventoryKey, t.key]));

// Momos have left the production house once a request is shipped - in transit and part
// shipments count as sent.
export const SENT_STATUSES = ['shipped', 'partially-shipped', 'delivered', 'partially-delivered'];
// ...and have reached the store once it is confirmed delivered (or counted in).
export const RECEIVED_STATUSES = ['delivered', 'partially-delivered'];

export function requestedPieces(req: any, key: string): number {
  return Number(req?.[key] ?? req?.[LONG_KEYS[key] || `${key}Momos`]) || 0;
}

// Pieces that actually went out: the shipped count once the request went through the ship
// step (a part shipment sends less than was asked for), else what was asked for.
export function shippedPieces(req: any, key: string): number {
  const shipped = req?.shippedQuantities?.[key];
  return shipped !== undefined && shipped !== null ? Number(shipped) || 0 : requestedPieces(req, key);
}

// A stored time as IST wall-clock "YYYY-MM-DDTHH:mm:ss...". Server timestamps are UTC ISO
// strings; a few old records hold "31/12/2025, 00:29:07" (already IST); plain dates pass through.
export function toISTTimestamp(ts?: string | null): string | null {
  if (!ts) return null;
  if (ts.includes('/')) {
    const [datePart, timePart] = ts.split(',');
    const [d, m, y] = datePart.trim().split('/');
    if (!d || !m || !y) return null;
    return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}T${(timePart || '').trim() || '00:00:00'}`;
  }
  if (/(z|[+-]\d{2}:?\d{2})$/i.test(ts) && !isNaN(new Date(ts).getTime())) return utcToIST(ts);
  return ts;
}

// When the momos left the production house / reached the store, in IST. Older requests without
// the step's own time fall back to the next best one.
export const shippedAtIST = (req: any) => toISTTimestamp(req?.shippedAt || req?.deliveredAt || req?.requestDate || req?.createdAt);
export const receivedAtIST = (req: any) => toISTTimestamp(req?.deliveredAt || req?.shippedAt || req?.requestDate || req?.createdAt);
