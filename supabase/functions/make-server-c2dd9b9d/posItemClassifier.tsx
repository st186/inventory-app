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

  if (nameLower.includes('burger')) {
    const momosPerBurger = 2;
    const burgersPerPlate = pcsMatch ? parseInt(pcsMatch[1]) : 1;
    return burgersPerPlate * momosPerBurger;
  }

  if (pcsMatch) {
    let count = parseInt(pcsMatch[1]);
    const packMatch = productName.match(/pack of\s*(\d+)/i);
    if (packMatch) count *= parseInt(packMatch[1]);
    return count;
  }

  return 6; // Default plate size, matching SalesData.tsx's fallback
}

// Given Ciferon's OrderReport/v2/SaleCount response's flattened product list
// (each with ProductName + Quantity), returns totals per category in the shape
// SalesDataRecord.data expects.
export function classifyAndSumProducts(
  products: Array<{ ProductName: string; Quantity: number }>
): Record<MomoCategory, number> {
  const result: Record<MomoCategory, number> = {
    'Chicken Momos': 0,
    'Chicken Cheese Momos': 0,
    'Veg Momos': 0,
    'Paneer Momos': 0,
    'Corn Cheese Momos': 0,
    'Chicken Kurkure Momos': 0,
    'Veg Kurkure Momos': 0,
  };

  for (const product of products) {
    const category = classifyProductName(product.ProductName || '');
    if (!category) continue;
    const piecesPerUnit = extractPiecesPerUnit(product.ProductName || '');
    result[category] += (product.Quantity || 0) * piecesPerUnit;
  }

  return result;
}
