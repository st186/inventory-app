// Classifies Ciferon POS product names (e.g. "Chicken Cheese Steamed Momos [6 Pieces] -O")
// into the 7 finished-product categories used by SalesDataRecord.data (src/utils/api.ts).
// Mirrors the keyword-matching + piece-count logic already used for manual sales-sheet
// uploads in src/components/SalesData.tsx's processItemData, so POS-driven and
// manually-uploaded sales roll up into the exact same categories every downstream
// consumer (ProductionRequests.tsx, ExportData.tsx, MonthlyStockRecalibration.tsx) expects.

export type MomoCategory =
  | 'Chicken Momos'
  | 'Chicken Cheese Momos'
  | 'Veg Momos'
  | 'Paneer Momos'
  | 'Corn Cheese Momos'
  | 'Chicken Kurkure Momos'
  | 'Veg Kurkure Momos';

const NON_FOOD_KEYWORDS = ['drink', 'cola', 'campa', 'water', 'beverage', 'soup'];

function classifyProductName(productName: string): MomoCategory | null {
  const nameLower = productName.toLowerCase();

  if (NON_FOOD_KEYWORDS.some((x) => nameLower.includes(x))) return null;

  if (nameLower.includes('kurkure')) {
    if (nameLower.includes('chicken')) return 'Chicken Kurkure Momos';
    if (nameLower.includes('veg')) return 'Veg Kurkure Momos';
    return null;
  }
  if (nameLower.includes('paneer')) return 'Paneer Momos';
  if (nameLower.includes('corn') && nameLower.includes('cheese')) return 'Corn Cheese Momos';
  if (nameLower.includes('chicken') && nameLower.includes('cheese')) return 'Chicken Cheese Momos';
  if (nameLower.includes('chicken')) return 'Chicken Momos';
  if (nameLower.includes('veg')) return 'Veg Momos';
  return null;
}

function extractPiecesPerUnit(productName: string): number {
  const nameLower = productName.toLowerCase();
  const pcsMatch = productName.match(/(\d+)\s*(?:pcs|pieces|piece)/i);

  // Mania Combo = 8 momos direct + 2 moburgers (each of which itself consumes 2 momos, so
  // 4 more) + a coke - 12 momos of the combo's momo type per unit sold. Checked before the
  // generic "burger" branch below, since a combo's product name may also mention burger.
  // Matched narrowly on "mania" + "combo" together (not just "combo") to avoid catching an
  // unrelated future item that happens to have "combo" in its name.
  if (nameLower.includes('mania') && nameLower.includes('combo')) {
    const momosDirect = 8;
    const moburgersPerCombo = 2;
    const momosPerMoburger = 2;
    const combosPerUnit = pcsMatch ? parseInt(pcsMatch[1]) : 1;
    return combosPerUnit * (momosDirect + moburgersPerCombo * momosPerMoburger);
  }

  // Moburger = 2 momos of that type + a coke.
  if (nameLower.includes('burger')) {
    const momosPerBurger = 2;
    const burgersPerPlate = pcsMatch ? parseInt(pcsMatch[1]) : 1;
    return burgersPerPlate * momosPerBurger;
  }

  // Platter (and any other plain "N pcs/pieces" item) = N momos of that type.
  if (pcsMatch) {
    let count = parseInt(pcsMatch[1]);
    const packMatch = productName.match(/pack of\s*(\d+)/i);
    if (packMatch) count *= parseInt(packMatch[1]);
    return count;
  }

  return 6; // Default plate size, matching SalesData.tsx's fallback
}

function emptyCategoryTotals(): Record<MomoCategory, number> {
  return {
    'Chicken Momos': 0,
    'Chicken Cheese Momos': 0,
    'Veg Momos': 0,
    'Paneer Momos': 0,
    'Corn Cheese Momos': 0,
    'Chicken Kurkure Momos': 0,
    'Veg Kurkure Momos': 0,
  };
}

export type ChannelBreakdown = Record<MomoCategory, Record<string, { pieces: number; revenue: number }>>;

// Same classification, but also splits pieces + revenue by sales channel (POS/Zomato/
// Swiggy/Contactless etc.) using each product's PlatformList - a per-product array whose
// indices line up with the response's top-level Columns array (e.g. Columns[1] = "Zomato"
// means PlatformList[1] is that product's Zomato quantity/revenue). Revenue (PlatformList's
// "Text" field) isn't scaled by piecesPerUnit - it's the real ₹ paid for that many *units*
// (plates/burgers/combos), not per individual momo piece.
export function classifyAndSumProductsByChannel(
  products: Array<{ ProductName: string; Quantity: number; PlatformList?: Array<{ Value: string | number; Text: string | number }> }>,
  channelNames: string[]
): { totals: Record<MomoCategory, number>; byChannel: ChannelBreakdown } {
  const totals = emptyCategoryTotals();
  const byChannel: ChannelBreakdown = {
    'Chicken Momos': {},
    'Chicken Cheese Momos': {},
    'Veg Momos': {},
    'Paneer Momos': {},
    'Corn Cheese Momos': {},
    'Chicken Kurkure Momos': {},
    'Veg Kurkure Momos': {},
  };
  channelNames.forEach((name) => {
    (Object.keys(byChannel) as MomoCategory[]).forEach((cat) => {
      byChannel[cat][name] = { pieces: 0, revenue: 0 };
    });
  });

  for (const product of products) {
    const category = classifyProductName(product.ProductName || '');
    if (!category) continue;
    const piecesPerUnit = extractPiecesPerUnit(product.ProductName || '');
    totals[category] += (product.Quantity || 0) * piecesPerUnit;

    (product.PlatformList || []).forEach((entry, i) => {
      const channelName = channelNames[i];
      if (!channelName) return;
      const units = parseFloat(String(entry.Value)) || 0;
      const revenue = parseFloat(String(entry.Text)) || 0;
      if (units === 0 && revenue === 0) return;
      if (!byChannel[category][channelName]) byChannel[category][channelName] = { pieces: 0, revenue: 0 };
      byChannel[category][channelName].pieces += units * piecesPerUnit;
      byChannel[category][channelName].revenue += revenue;
    });
  }

  return { totals, byChannel };
}
