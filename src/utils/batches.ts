// Bags, batch codes and waste reasons for the production -> store momo flow (SOP manual,
// "Momo journey": momos travel in zip bags, one type and one batch per bag). A bag is 50 of every
// type since 30 Oct 2026 (owner; it was 50 chicken and 20 of the others). Request and stock keys here are the camelCase finished-
// product keys (`chicken`, `chickenCheese`, ...) - MOMO_TYPES' `inventoryKey`.

export const CHICKEN_BAG_SIZE = 50;
export const OTHER_BAG_SIZE = 50;

export function bagSize(inventoryKey: string): number {
  return inventoryKey === 'chicken' ? CHICKEN_BAG_SIZE : OTHER_BAG_SIZE;
}

// Rounds a piece count UP to whole bags - store requests only go out in whole bags.
export function roundUpToBags(pieces: number, inventoryKey: string): number {
  const size = bagSize(inventoryKey);
  return pieces <= 0 ? 0 : Math.ceil(pieces / size) * size;
}

export function bagsLabel(pieces: number, inventoryKey: string): string {
  if (!pieces || pieces <= 0) return '0 bags';
  const size = bagSize(inventoryKey);
  const bags = Math.floor(pieces / size);
  const loose = pieces - bags * size;
  const bagText = `${bags} bag${bags === 1 ? '' : 's'}`;
  if (loose === 0) return bagText;
  return bags === 0 ? `${loose} loose` : `${bagText} + ${loose} loose`;
}

// One stuffing mix = one batch. Code = DDMM-TYPE-B#, e.g. 2510-CHK-B2 (25 Oct, chicken,
// second mix of the day). Momos folded on a later day from a mix's leftover stuffing keep
// that mix's code with "-L" added (2410-CHK-B2-L), so the code still leads back to the mix.
export const BATCH_TYPE_CODES: Record<string, string> = {
  chicken: 'CHK',
  chickenCheese: 'CCH',
  veg: 'VEG',
  cheeseCorn: 'CCN',
  paneer: 'PNR',
  vegKurkure: 'VKK',
  chickenKurkure: 'CKK',
};

// Phase 1 (batch codes, whole-bag requests, packing details, receive & count, waste reasons)
// starts on this date. Before it every screen works the old way, so the app can be installed
// and the crew trained ahead of the switch.
export const PHASE1_GO_LIVE = '2026-11-01';
export const isPhase1Live = (date: string) => date >= PHASE1_GO_LIVE;

// Production entries from this date on record pieces per batch instead of one total.
export const BATCH_TRACKING_FROM = PHASE1_GO_LIVE;

export interface ProductionBatch {
  code: string; // '' for pieces entered before batch codes existed
  pieces: number;
  leftoverOf?: string; // the earlier batch whose leftover stuffing these were folded from
}

export function batchCode(date: string, inventoryKey: string, n: number): string {
  const [, mm, dd] = date.split('-');
  return `${dd}${mm}-${BATCH_TYPE_CODES[inventoryKey] || inventoryKey.slice(0, 3).toUpperCase()}-B${n}`;
}

export function leftoverCode(originalCode: string): string {
  return originalCode.endsWith('-L') ? originalCode : `${originalCode}-L`;
}

// Next mix number for a day, from the codes already used that day (never renumbers, since a
// code may already be written on a tray card or bag).
export function nextBatchNumber(batches: ProductionBatch[], date: string, inventoryKey: string): number {
  const prefix = batchCode(date, inventoryKey, 0).replace(/0$/, '');
  const used = batches
    .filter((b) => !b.leftoverOf && b.code.startsWith(prefix))
    .map((b) => parseInt(b.code.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  return used.length ? Math.max(...used) + 1 : 1;
}

// Dispatch: pieces of one type taken from each batch, oldest first.
export interface BatchAllocation {
  code: string;
  pieces: number;
}

export interface DispatchInfo {
  bags?: Record<string, number>; // whole bags per type (inventoryKey)
  batches?: Record<string, BatchAllocation[]>;
  boxes?: number;
  containerNumbers?: string; // box and tub numbers as written on them, e.g. "Box 1-2, Tubs 1-6"
  packedBy?: string;
  checkedBy?: string;
  packedAt?: string;
}

export type ReceiptDamageReason = 'crushed' | 'stuck' | 'soft';

export const RECEIPT_DAMAGE_REASONS: { id: ReceiptDamageReason; label: string }[] = [
  { id: 'crushed', label: 'Crushed / broken' },
  { id: 'stuck', label: 'Stuck together' },
  { id: 'soft', label: 'Soft / thawed' },
];

export interface ReceiptLine {
  shipped: number;
  received: number; // pieces counted at the store (missing = shipped - received)
  damaged: number; // of the received pieces, not usable
  damageReason?: ReceiptDamageReason;
  damageBatch?: string;
}

export interface DeliveryReceipt {
  lines: Record<string, ReceiptLine>; // per inventoryKey
  saucesMissing?: string[];
  boxesReceived?: number;
  hardFrozen: boolean;
  notes?: string;
  photoIds?: string[];
  receivedBy: string;
  receivedByName: string;
  receivedAt: string;
}

// SOP manual 1.7 waste log reason codes, so the app and the paper log use the same letters.
// S (staff meal) is not waste, but it also takes momos out of stock, so the store logs it in
// the same place on its own line.
export const WASTE_REASONS: { code: string; label: string; where: 'both' | 'store' | 'production' }[] = [
  { code: 'T', label: 'Torn / burst', where: 'both' },
  { code: 'D', label: 'Dropped', where: 'both' },
  { code: 'B', label: 'Burnt / overcooked', where: 'store' },
  { code: 'R', label: 'Remake (wrong or rejected order)', where: 'store' },
  { code: 'X', label: 'Expired / past hold time', where: 'both' },
  { code: 'F', label: 'Freezer or chiller failure', where: 'both' },
  { code: 'Q', label: 'Rejected at receipt', where: 'store' },
  { code: 'P', label: 'Production reject', where: 'production' },
  { code: 'S', label: 'Staff meal', where: 'store' },
  { code: 'O', label: 'Other (write what)', where: 'both' },
];

export function wasteReasonLabel(code?: string): string {
  if (!code) return 'No reason recorded';
  return WASTE_REASONS.find((r) => r.code === code)?.label || code;
}
