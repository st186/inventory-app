// The "₹200 a kg · usual price" line under the amount in the Add expense sheet. Display only:
// the price check itself (a warning when a price is several times off) is utils/expenseChecks.ts.
import { formatPrice, priceItemKey, type PriceGuide } from '../../utils/expenseChecks';

type Measure = 'kg' | 'L' | 'pc' | 'bundle';
const UNIT_MEASURE: Record<string, { measure: Measure; perBase: number }> = {
  kg: { measure: 'kg', perBase: 1 },
  g: { measure: 'kg', perBase: 0.001 },
  L: { measure: 'L', perBase: 1 },
  mL: { measure: 'L', perBase: 0.001 },
  pcs: { measure: 'pc', perBase: 1 },
  units: { measure: 'pc', perBase: 1 },
  bundle: { measure: 'bundle', perBase: 1 },
};
const PER: Record<Measure, string> = { kg: 'a kg', L: 'a litre', pc: 'each', bundle: 'a bundle' };

/** Price per kg / litre / piece for what's typed, and whether it is about the usual price. */
export function pricePerUnitLine(guide: PriceGuide | undefined, itemName: string, quantity: number, unit: string, amount: number):
  { text: string; usual: boolean; usualText: string | null } | null {
  const u = UNIT_MEASURE[unit];
  if (!u || !(quantity > 0) || !(amount > 0)) return null;
  const value = amount / (quantity * u.perBase);
  const ref = guide?.refs.get(priceItemKey(itemName))?.[u.measure];
  const text = `${formatPrice(value)} ${PER[u.measure]}`;
  if (!ref) return { text, usual: false, usualText: null };
  const ratio = value / ref.typical;
  return { text, usual: ratio <= 1.25 && ratio >= 0.8, usualText: `${formatPrice(ref.typical)} ${PER[u.measure]}` };
}
