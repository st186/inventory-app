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

const NON_FOOD_KEYWORDS = ['drink', 'cola', 'campa', 'water', 'beverage', 'soup', 'samosa', 'nugget', 'popcorn', 'fries', 'mojito', 'mocktail', 'cake'];

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
  // "Non Veg" holds "veg" (31 Oct 2026 stock check: "Steamed Momos Platter- Non Veg" was counted as veg).
  if (/non[\s-]*veg/.test(nameLower)) return 'Chicken Momos';
  if (nameLower.includes('veg')) return 'Veg Momos';
  return null;
}

// Platters (the owner's rule, the same as the manual sales-sheet upload, SalesData.tsx RULE 2): a
// non-veg (or chicken mix) platter is 6 chicken + 6 chicken cheese momos, a veg (or veg mix) platter
// 4 veg + 4 paneer + 4 cheese corn. The POS sync counted them as one plate of 6 of one type (31 Oct
// 2026 stock check). A platter of one named kind ("Peri Peri Momo Platter (Chicken)") isn't split:
// 12 of that kind (extractPiecesPerUnit). One with no kind in its name ("Peri Peri Momo Platter")
// stays uncounted until Ciferon names it (the stock check flags it).
export function platterSplit(productName: string): Partial<Record<MomoCategory, number>> | null {
  const n = productName.toLowerCase();
  if (!n.includes('platter') || NON_FOOD_KEYWORDS.some((x) => n.includes(x))) return null;
  if (/non[\s-]*veg|chicken mix/.test(n)) return { 'Chicken Momos': 6, 'Chicken Cheese Momos': 6 };
  if (/\bveg\b/.test(n) && !/chicken|paneer|corn|kurkure/.test(n)) return { 'Veg Momos': 4, 'Paneer Momos': 4, 'Corn Cheese Momos': 4 };
  return null;
}

/** Momos of each type in one unit of a product: a split platter, else its one type. */
function momosPerUnit(productName: string): [MomoCategory, number][] {
  const split = platterSplit(productName);
  if (split) return Object.entries(split) as [MomoCategory, number][];
  const category = classifyProductName(productName);
  return category ? [[category, extractPiecesPerUnit(productName)]] : [];
}

function extractPiecesPerUnit(productName: string): number {
  const nameLower = productName.toLowerCase();
  const pcsMatch = productName.match(/(\d+)\s*(?:pcs|pieces|piece|pc)\b/i);

  // Mania Combo = 8 momos direct + 2 moburgers (each of which itself consumes 2 momos, so
  // 4 more) + a coke - 12 momos of the combo's momo type per unit sold, whether the product
  // name is the plain "... Mania Combo" form or the bracketed "[N Pieces, Pack Of 2] Combo"
  // form - confirmed against real order data that both are the same 12-momo composition;
  // the leading number in the bracketed form is NOT a repeat-multiplier of the whole combo
  // (an earlier version of this function mistakenly read it as one, producing 4x overcounts
  // for these SKUs). Checked before the generic "burger" branch below, since a combo's
  // product name may also mention burger. Matched narrowly on "mania" + "combo" together
  // (not just "combo") to avoid catching an unrelated future item that happens to have
  // "combo" in its name.
  if (nameLower.includes('mania') && nameLower.includes('combo')) {
    return 8 + 2 * 2;
  }

  // Moburger = 2 momos of that type + a coke.
  if (nameLower.includes('burger')) {
    const momosPerBurger = 2;
    const burgersPerPlate = pcsMatch ? parseInt(pcsMatch[1]) : 1;
    return burgersPerPlate * momosPerBurger;
  }

  // A platter is 12 momos (owner, 31 Oct 2026: "Peri peri momo platter should have 12 momos").
  if (!pcsMatch && nameLower.includes('platter')) return 12;

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
    const parts = momosPerUnit(product.ProductName || '');
    const perUnit = parts.reduce((s, [, n]) => s + n, 0);
    for (const [category, piecesPerUnit] of parts) {
      totals[category] += (product.Quantity || 0) * piecesPerUnit;

      (product.PlatformList || []).forEach((entry, i) => {
        const channelName = channelNames[i];
        if (!channelName) return;
        const units = parseFloat(String(entry.Value)) || 0;
        const revenue = parseFloat(String(entry.Text)) || 0;
        if (units === 0 && revenue === 0) return;
        if (!byChannel[category][channelName]) byChannel[category][channelName] = { pieces: 0, revenue: 0 };
        byChannel[category][channelName].pieces += units * piecesPerUnit;
        // A split platter's price goes to each type by its share of the momos.
        byChannel[category][channelName].revenue += perUnit ? (revenue * piecesPerUnit) / perUnit : 0;
      });
    }
  }

  return { totals, byChannel };
}

// `split`: a platter's pieces per type (platterSplit); `category` is then its first type.
export type ProductBreakdownEntry = { productName: string; category: MomoCategory | null; quantity: number; pieces: number; split?: Partial<Record<MomoCategory, number>> };

// Per-menu-item breakdown (e.g. "Chicken Steamed Momos" vs "Chicken Afghani Momos" kept
// separate, not collapsed into "Chicken Momos") - lets Category Sales show real menu-item
// detail instead of only the 7 rolled-up momo categories.
// Ciferon lists an online-specific SKU for the same physical dish under its own product
// name, tagged with a "-O" suffix and sometimes a prep-style qualifier - e.g. "Chicken
// Steamed Momos [6 Pieces] -O Normal" and "Chicken Steamed Momos [6 Pieces] -O Butter
// Brushed" are both really just "Chicken Steamed Momos", the same dish the dine-in/POS SKU
// sells under the bare name. Without this, a per-item online-vs-dine-in price comparison
// would see the online SKU and the dine-in SKU as two unrelated items - one with online
// channel data and zero dine-in data, the other the reverse - and could never compare them
// against each other at all. Confirmed against real product names from this store's own
// Ciferon catalog (see productBreakdown dumps). Deliberately narrow (only strips the
// confirmed "-O"/bracket/prep-qualifier pattern) rather than any fuzzier matching, so it
// doesn't risk merging two genuinely different dishes.
//
// KNOWN_SYNONYMS below is the one exception - a short, hand-curated list of raw Ciferon
// product names CONFIRMED (by the business owner, not guessed) to be the exact same dish
// under two different catalog entries, most likely created as separate products in Ciferon
// at different times. Applied AFTER the bracket/-O stripping above. This is a stopgap on
// the app side only - the real fix is renaming the duplicate product in Ciferon's own menu
// management so future syncs never split under two names in the first place (see the note
// where KNOWN_SYNONYMS is used). Add a pair here only once a human has confirmed it, never
// as a fuzzy/automatic guess - that's exactly the risk this whole function was built to avoid.
const KNOWN_SYNONYMS: Record<string, string> = {
  'steamed chicken momos': 'Chicken Steamed Momos',
};
function normalizeItemName(name: string): string {
  const stripped = name
    .replace(/\[.*?\]/g, ' ')
    .replace(/-\s*O\b/gi, ' ')
    .replace(/\b(butter brushed|normal)\b/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const synonym = KNOWN_SYNONYMS[stripped.toLowerCase()];
  return synonym || stripped;
}

// Per-MENU-ITEM (not rolled up to category) channel split - the same PlatformList data
// classifyAndSumProductsByChannel already reads, just keyed by the real (normalized) product
// name instead of being immediately collapsed into one of the 7 broad categories. Ciferon's
// raw response already carries this per-item detail (each product has its own PlatformList);
// classifyAndSumProductsByChannel was the only consumer of it and it throws the per-item
// name away, so nothing downstream could previously tell "Chicken Steamed Momos" apart from
// "Chicken Butter Fried Momos" on any given channel even though the source data could.
// Still momo-only (classifyProductName filters non-food items) so this stays a manageable
// size - a handful of Chicken/Veg/Paneer/etc. variants, not the whole raw menu.
export function classifyAndSumProductsByItemAndChannel(
  products: Array<{ ProductName: string; Quantity: number; PlatformList?: Array<{ Value: string | number; Text: string | number }> }>,
  channelNames: string[]
): Record<string, { piecesPerUnit: number; channels: Record<string, { pieces: number; revenue: number }> }> {
  // piecesPerUnit is carried alongside each item's channel split (not just baked into
  // .pieces) so a per-PIECE price can be converted back to a per-PLATE one downstream (see
  // the Aggregator Payout page's "Are We Pricing This Right?" section) - momos are sold and
  // priced by the plate, and a per-piece figure like "-₹1.7/pc" reads as a rounding-error-
  // sized number even when the real per-plate loss is meaningful. normalizeItemName only
  // strips the "-O"/bracket/prep-qualifier pattern (never the "Mania Combo"/"Burger" pattern
  // extractPiecesPerUnit itself keys off), so every raw SKU folded into one normalized name
  // here is confirmed to share the same physical plate size - safe to record once per item
  // rather than per raw SKU occurrence.
  const byItem: Record<string, { piecesPerUnit: number; channels: Record<string, { pieces: number; revenue: number }> }> = {};

  for (const product of products) {
    const rawName = product.ProductName || '';
    const parts = momosPerUnit(rawName);
    if (!parts.length) continue; // non-momo item, same filter as the category rollup
    const piecesPerUnit = parts.reduce((s, [, n]) => s + n, 0);
    const name = normalizeItemName(rawName) || rawName;
    if (!byItem[name]) byItem[name] = { piecesPerUnit, channels: {} };

    (product.PlatformList || []).forEach((entry, i) => {
      const channelName = channelNames[i];
      if (!channelName) return;
      const units = parseFloat(String(entry.Value)) || 0;
      const revenue = parseFloat(String(entry.Text)) || 0;
      if (units === 0 && revenue === 0) return;
      if (!byItem[name].channels[channelName]) byItem[name].channels[channelName] = { pieces: 0, revenue: 0 };
      byItem[name].channels[channelName].pieces += units * piecesPerUnit;
      byItem[name].channels[channelName].revenue += revenue;
    });
  }

  return byItem;
}

export function classifyProductBreakdown(
  products: Array<{ ProductName: string; Quantity: number }>
): ProductBreakdownEntry[] {
  return products.map((p) => {
    const parts = momosPerUnit(p.ProductName || '');
    return {
      productName: p.ProductName || '',
      category: parts[0]?.[0] ?? null,
      quantity: p.Quantity || 0,
      pieces: (p.Quantity || 0) * (parts.length ? parts.reduce((s, [, n]) => s + n, 0) : extractPiecesPerUnit(p.ProductName || '')),
      ...(parts.length > 1 ? { split: Object.fromEntries(parts.map(([c, n]) => [c, n * (p.Quantity || 0)])) } : {}),
    };
  });
}

export type ClassifiedOrderItem = { productId: number | null; productName: string; category: MomoCategory | null; quantity: number; rate: number; total: number };

// Classifies a single order's line items (from OrderReport/Sale's OrderItemWrapperList) for
// storage alongside that order's ExternalId - the real per-order detail used to join against
// an aggregator settlement's own Order ID and allocate that order's actual net payout across
// its momo types, instead of assuming a uniform commission rate. ProductId is Ciferon's real
// menu item ID (matches the menu-item-price catalog's key), letting real per-item offline/
// online prices be looked up instead of guessed from the name.
export function classifyOrderItems(
  items: Array<{ ProductId?: number; ProductName: string; Quantity: number; Rate: number; Total: number }>
): ClassifiedOrderItem[] {
  return items.map((item) => ({
    productId: item.ProductId ?? null,
    productName: item.ProductName || '',
    category: classifyProductName(item.ProductName || ''),
    quantity: item.Quantity || 0,
    rate: item.Rate || 0,
    total: item.Total || 0,
  }));
}
