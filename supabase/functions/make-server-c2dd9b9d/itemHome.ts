// One category per item (owner, 30 Oct 2026: "keep only one category so not to confuse people").
// An ingredient the app knows - the built-in list or one added to the item list (custom-item:) -
// is always saved under its own category, whatever the form sent. 27 Oct a burger bun purchase
// went under spices, and the item list had "Oil" under both staples and spices, so the next oil
// followed it. Packaging and bulk packaging count as one home: a bulk order of boxes is the same
// item, counted over 4 months.
//
// BUILT_IN mirrors CATEGORY_ITEMS + STORE_CATEGORY_ITEMS in src/utils/inventoryData.ts
// (itemHome.test.ts checks the two agree).

export const BUILT_IN: Record<string, string[]> = {
  meat: ['Chicken'],
  dairy: ['Butter', 'Cheese', 'Mozzarella Cheese', 'Liquid Cheese', 'Paneer', 'Milk', 'Fresh Cream'],
  fresh_produce: ['Tomato', 'Capsicum', 'Onion', 'Cabbage', 'Gandhoraj Lemon', 'Lemon', 'Pudina', 'Coriander Leaves', 'Garlic', 'Green Chilli', 'Ginger', 'Red Chilli', 'Carrot', 'Potato', 'Sweet Corn'],
  staples: ['Maida', 'Oil', 'Corn Flour', 'Ararut', 'Sugar', 'Salt', 'Baking Powder'],
  spices_seasonings: ['Soya Sauce', 'Chilli Sauce', 'Tomato Sauce', 'Mayonnaise', 'Vinegar', 'Ajinomoto', 'Aromatic Powder', 'Black Pepper', 'White Pepper', 'Peri Peri Masala', 'Corn Flakes', 'Dry Red Chilli'],
  bread_buns: ['Burger'],
  beverages: ['Coca-Cola', 'Campa Cola', 'Water Bottle', 'Coke'],
  packaging: ['Momo Box', 'Momo Tray', 'Butter Paper', 'Carry Bag', 'Container', 'Tissue Paper', 'Foil', 'Spoon', 'Fork', 'Bag'],
  packaging_bulk: ['Momo Box', 'Momo Tray'],
};

// Categories that are one home between them.
const SAME_HOME: Record<string, string[]> = { packaging: ['packaging', 'packaging_bulk'], packaging_bulk: ['packaging', 'packaging_bulk'] };

export const itemKey = (name: unknown) => String(name ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

export type CatalogItem = { itemName?: string; category?: string; entryType?: string };

/** Each known item's home categories: the built-in list first; an item added to the list only
 * where the built-in list doesn't have that name (the stray "Oil" under spices is ignored). */
export function itemHomes(custom: CatalogItem[] = []): Map<string, string[]> {
  const homes = new Map<string, string[]>();
  const add = (m: Map<string, string[]>, name: unknown, category: string) => {
    const k = itemKey(name);
    if (!k || !category) return;
    const list = m.get(k) || [];
    if (!list.includes(category)) list.push(category);
    m.set(k, list);
  };
  for (const [category, names] of Object.entries(BUILT_IN)) for (const n of names) add(homes, n, category);
  const added = new Map<string, string[]>();
  for (const c of custom) {
    if ((c.entryType || 'inventory') !== 'inventory' || !c.category) continue;
    if (!homes.has(itemKey(c.itemName))) add(added, c.itemName, c.category);
  }
  // An added item listed under two categories that aren't one home is left alone: no one place to send it.
  for (const [k, cats] of added) {
    if (cats.every((c) => (SAME_HOME[cats[0]] || [cats[0]]).includes(c))) homes.set(k, cats);
  }
  return homes;
}

/** The category an ingredient purchase is saved under: its home when the item is known and the
 * entry says otherwise, else what it says. */
export function settleCategory(itemName: unknown, category: string | undefined, homes: Map<string, string[]>): { category: string | undefined; moved: boolean } {
  const home = homes.get(itemKey(itemName));
  if (!home || !home.length || (category && home.some((h) => (SAME_HOME[h] || [h]).includes(category)))) return { category, moved: false };
  return { category: home[0], moved: true };
}

/** Adding `itemName` under `category` to the item list: the category it already lives in, when
 * that's another one (null = fine). */
export function homeElsewhere(itemName: unknown, category: string, homes: Map<string, string[]>): string | null {
  const home = homes.get(itemKey(itemName));
  if (!home || !home.length || home.some((h) => (SAME_HOME[h] || [h]).includes(category))) return null;
  return home[0];
}

const LABELS: Record<string, string> = {
  meat: 'Meat', dairy: 'Dairy', fresh_produce: 'Vegetables', staples: 'Flour, oil and staples', spices_seasonings: 'Sauces, spices and coatings',
  bread_buns: 'Bread and buns', beverages: 'Drinks', packaging: 'Packaging', packaging_bulk: 'Bulk packaging',
};
export const homeLabel = (category: string) => LABELS[category] || category.replace(/_/g, ' ');
