// Powers the "smart quick-add" expense flow: given free text the user typed, suggests
// what it probably is - inventory item vs overhead cost vs fixed cost, which category,
// and which entity (store vs production house) it's normally logged against - so the
// person adding an expense doesn't have to already know the answer to any of that.
//
// Built from the same static catalogs already used by the Add Inventory/Overhead/Fixed
// Cost forms, plus a small hand-seeded list of common overhead descriptions (Toto,
// Petrol, Tea, Mala, ...) discovered this session when cleaning up real miscategorized
// data, plus whatever custom items have been classified before (see CustomItem.entryType
// /entityType in api.ts).

import {
  CATEGORY_ITEMS,
  STORE_CATEGORY_ITEMS,
  OVERHEAD_CATEGORY_META,
  STORE_OVERHEAD_CATEGORY_KEYS,
  FIXED_COST_CATEGORIES,
  BUILT_IN_ITEM_BENGALI,
} from './inventoryData';
import { normalizeItemName, stringSimilarity } from './stringSimilarity';
import type { CustomItem } from './api';

export type ExpenseEntryType = 'inventory' | 'overhead' | 'fixedcost';
export type ExpenseEntity = 'store' | 'production_house' | 'both';

export interface ExpenseCandidate {
  label: string;
  entryType: ExpenseEntryType;
  category: string;
  entity: ExpenseEntity;
  bengali?: string;
}

// Real descriptions seen in this store's own data that don't match their category's
// display name (a store incharge types "Toto", not "Goods Transportation Cost").
const OVERHEAD_SYNONYMS: { label: string; category: string; entity: ExpenseEntity }[] = [
  { label: 'Toto', category: 'transportation', entity: 'both' },
  { label: 'Rapido', category: 'transportation', entity: 'both' },
  { label: 'Petrol', category: 'fuel', entity: 'both' },
  { label: 'Tea', category: 'evening_snacks', entity: 'both' },
  { label: 'Meals', category: 'lunch', entity: 'both' },
  { label: 'Biryani', category: 'lunch', entity: 'both' },
  { label: 'Mala', category: 'puja_expense', entity: 'store' },
  { label: 'Labour cost', category: 'labour_charge', entity: 'both' },
  { label: 'Colin', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Deep cleaning', category: 'deep_cleaning', entity: 'production_house' },
  { label: 'Lamination', category: 'office_supplies', entity: 'both' },
];

const stripEmoji = (label: string) => label.replace(/^[^\w]+/u, '').trim();

export function buildExpenseCandidates(customItems: CustomItem[]): ExpenseCandidate[] {
  const candidates: ExpenseCandidate[] = [];

  // Inventory - one candidate per known item name, entity inferred from whether it's
  // in the store's curated subset (STORE_CATEGORY_ITEMS) for that category.
  const storeItemKeys = new Set<string>();
  for (const [category, items] of Object.entries(STORE_CATEGORY_ITEMS)) {
    for (const item of items as string[]) {
      storeItemKeys.add(`${category}::${normalizeItemName(item)}`);
    }
  }
  const seenInventoryKeys = new Set<string>();
  for (const [category, items] of Object.entries(CATEGORY_ITEMS)) {
    for (const item of items as readonly string[]) {
      const key = `${category}::${normalizeItemName(item)}`;
      const inStoreList = storeItemKeys.has(key);
      candidates.push({ label: item, entryType: 'inventory', category, entity: inStoreList ? 'store' : 'production_house', bengali: BUILT_IN_ITEM_BENGALI[item] });
      seenInventoryKeys.add(key);
    }
  }
  // STORE_CATEGORY_ITEMS is a curated subset of the store's real day-to-day purchases,
  // and several entries (Water Bottle, Milk, Bag, Foil, Fork, Room Freshener, Colin,
  // Washing Bar/Powder, Sauce Container, Charger, Lock and Key, Coke, Burger, ...)
  // aren't also present in the production-house master list (CATEGORY_ITEMS) above -
  // without this pass they were never added as a searchable candidate at all, so
  // typing e.g. "water bottle" never matched the known Beverages item and instead fell
  // through to an unrelated fuzzy match (like "Sauce Bottle") or the "new item" flow.
  for (const [category, items] of Object.entries(STORE_CATEGORY_ITEMS)) {
    for (const item of items as string[]) {
      const key = `${category}::${normalizeItemName(item)}`;
      if (seenInventoryKeys.has(key)) continue;
      candidates.push({ label: item, entryType: 'inventory', category, entity: 'store', bengali: BUILT_IN_ITEM_BENGALI[item] });
      seenInventoryKeys.add(key);
    }
  }

  // Overhead - the category's own label as a fallback candidate, plus the synonym list.
  for (const [category, meta] of Object.entries(OVERHEAD_CATEGORY_META)) {
    const entity: ExpenseEntity = STORE_OVERHEAD_CATEGORY_KEYS.includes(category) ? 'both' : 'production_house';
    candidates.push({ label: stripEmoji(meta.label), entryType: 'overhead', category, entity });
  }
  for (const synonym of OVERHEAD_SYNONYMS) {
    candidates.push({ label: synonym.label, entryType: 'overhead', category: synonym.category, entity: synonym.entity });
  }

  // Fixed costs - just the 3 categories, usable by either entity.
  for (const [category, label] of Object.entries(FIXED_COST_CATEGORIES)) {
    candidates.push({ label: stripEmoji(label), entryType: 'fixedcost', category, entity: 'both' });
  }

  // Previously-classified custom items (from earlier quick-add uses or the legacy
  // "+ Add Custom Item" flow) - these take priority since they reflect real past choices.
  for (const item of customItems) {
    candidates.push({
      label: item.itemName,
      entryType: item.entryType || 'inventory',
      category: item.category,
      entity: item.entityType || (storeItemKeys.has(`${item.category}::${normalizeItemName(item.itemName)}`) ? 'store' : 'production_house'),
      bengali: item.itemNameBengali || BUILT_IN_ITEM_BENGALI[item.itemName],
    });
  }

  return candidates;
}

export interface ExpenseSuggestion extends ExpenseCandidate {
  score: number;
  exact: boolean;
}

// Ranks candidates against free-typed text: exact/prefix/substring matches rank above
// fuzzy (typo-tolerant) matches, which rank above weak fuzzy noise.
export function searchExpenseCandidates(query: string, candidates: ExpenseCandidate[], limit = 6): ExpenseSuggestion[] {
  const q = normalizeItemName(query);
  if (!q) return [];

  const scored: ExpenseSuggestion[] = [];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const key = `${candidate.entryType}::${candidate.category}::${normalizeItemName(candidate.label)}`;
    if (seen.has(key)) continue;
    const name = normalizeItemName(candidate.label);
    let score: number;
    const exact = name === q;
    if (exact) score = 1;
    else if (name.startsWith(q)) score = 0.95;
    else if (name.includes(q)) score = 0.85;
    else {
      const fuzzy = stringSimilarity(query, candidate.label);
      if (fuzzy < 0.6) continue; // too weak to be useful as a suggestion
      score = fuzzy * 0.7;
    }
    seen.add(key);
    scored.push({ ...candidate, score, exact });
  }

  return scored.sort((a, b) => b.score - a.score).slice(0, limit);
}
