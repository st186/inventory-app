// How much of an item a shopping-list line asks for, written so nobody can misread it (owner,
// 28 Oct 2026): anything in packs says how many and the size of each ("Oil 2 packets × 1 L", never
// "Oil 2 pcs"); masala packets too; vegetables go by weight, and only leafy herbs (coriander,
// pudina) by the bundle. The list editor shows these rules on each line as it is written; Bunny
// (the AI check before sending, server supplies.ts) catches what the rules can't.
// No imports, so node can test it: npx esbuild src/components/supplies/quantityNorms.test.ts --bundle --platform=node --outfile=... && node ...

export type VendorKind = 'vegetables' | 'grocery' | 'dairy' | 'meat' | 'other';
export const VENDOR_KINDS: { value: VendorKind; label: string }[] = [
  { value: 'vegetables', label: 'Vegetables' }, { value: 'grocery', label: 'Grocery & masala' },
  { value: 'dairy', label: 'Dairy' }, { value: 'meat', label: 'Chicken & meat' }, { value: 'other', label: 'Other' },
];

// Units a line can be in. Packs need the size of each; weights, volumes and counts don't.
export const UNITS = ['g', 'kg', 'L', 'mL', 'pcs', 'packet', 'bottle', 'jar', 'bag', 'box', 'carton', 'tin', 'roll', 'bundle'];
export const PACK_UNITS = new Set(['packet', 'bottle', 'jar', 'bag', 'box', 'carton', 'tin']);
export const SIZE_UNITS = ['g', 'kg', 'mL', 'L', 'pcs'];
const MEASURES = new Set(['g', 'kg', 'L', 'mL']);

// Leafy herbs are bought by the bundle; a few vegetables are counted; packed goods come in packs.
const LEAFY = /\b(coriander|dhania|dhaniya|pudina|mint|curry leaves?|spring onions?|methi|palak|spinach|lettuce|lemon ?grass|celery)\b/i;
const COUNTED_VEG = /\b(lemons?|limes?|gandhoraj|eggs?|coconuts?|corn cobs?|bhutta)\b/i;
const LIQUID = /(oil|vinegar|soya|liquid)/i;
const PACKED = /\b(masala|powder|sauce|ketchup|mayo|mayonnaise|gravy|ajinomoto|sachet|cheese|oil|vinegar|soya|seasoning|oregano|flakes|paste|premix|butter)\b/i;

export type QtyLine = { item: string; qty: number; unit: string; packSize?: number | null; packUnit?: string | null };

const num = (n: number) => String(Math.round(n * 1000) / 1000);
const PLURAL: Record<string, string> = { box: 'boxes' };
export const unitWord = (unit: string, n: number) => (n === 1 || MEASURES.has(unit) || unit === 'pcs' ? unit : PLURAL[unit] || `${unit}s`);
const hasPack = (l: QtyLine) => PACK_UNITS.has(l.unit) && !!l.packSize && l.packSize > 0 && !!l.packUnit;

/** "2 packets × 1 L", "400 g", "2 bundles". */
export function qtyLabel(l: QtyLine): string {
  if (!l.qty) return '';
  const head = `${num(l.qty)} ${unitWord(l.unit, l.qty)}`;
  return hasPack(l) ? `${head} × ${num(l.packSize!)} ${l.packUnit}` : head;
}

/** What a line comes to in weight, volume or pieces (for the expense): 2 packets × 1 L = 2 L. */
export function baseQty(l: QtyLine, count = l.qty): { qty: number; unit: string } {
  if (!hasPack(l)) return { qty: count, unit: l.unit };
  let qty = count * l.packSize!;
  let unit = l.packUnit!;
  if (unit === 'g' && qty >= 1000) { qty /= 1000; unit = 'kg'; }
  if (unit === 'mL' && qty >= 1000) { qty /= 1000; unit = 'L'; }
  return { qty: Math.round(qty * 1000) / 1000, unit };
}

/** The first rule a line breaks, in one short sentence for the person writing it; null if none. */
export function normIssue(l: QtyLine, vendorKind?: VendorKind | null): string | null {
  const item = l.item.trim() || 'This item';
  if (!(l.qty > 0)) return `How much ${item}?`;
  if (PACK_UNITS.has(l.unit) && !hasPack(l)) return `Say the size of each ${l.unit}, e.g. 2 ${unitWord(l.unit, 2)} × 1 L or × 100 g.`;
  if (LEAFY.test(item)) return l.unit === 'bundle' ? null : `${item} goes by the bundle.`;
  if (l.unit === 'bundle') return `Only leafy herbs like coriander and pudina go by the bundle - write ${item} by weight.`;
  if (vendorKind === 'vegetables' || vendorKind === 'meat') {
    if (l.unit === 'pcs' && COUNTED_VEG.test(item)) return null;
    if (!MEASURES.has(l.unit)) return `${item} goes by weight (g or kg).`;
    return null;
  }
  if (PACKED.test(item)) {
    const eg = LIQUID.test(item) || l.unit === 'L' || l.unit === 'mL' ? '1 L' : /masala|powder/i.test(item) ? '100 g' : '1 kg';
    if (l.unit === 'pcs') return `${item} is not counted in pieces - write the packs and the size of each, e.g. 2 packets × ${eg}.`;
    if (MEASURES.has(l.unit)) return `Write how many packs and the size of each, e.g. 2 packets × ${eg}.`;
  }
  if (l.unit === 'pcs' && (vendorKind === 'grocery' || vendorKind === 'dairy')) return `Say what each piece is: packets, bottles or jars, and the size of each.`;
  return null;
}
