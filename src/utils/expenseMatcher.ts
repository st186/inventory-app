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
  SELECTABLE_OVERHEAD_CATEGORY_KEYS,
  INVENTORY_CATEGORIES,
  FIXED_COST_CATEGORIES,
  SELECTABLE_FIXED_COST_CATEGORIES,
  BUILT_IN_ITEM_BENGALI,
  canonicalCategory,
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
  { label: 'AI Credits', category: 'ai_credits', entity: 'both' },
  { label: 'Claude Credits', category: 'ai_credits', entity: 'both' },
  { label: 'Anthropic', category: 'ai_credits', entity: 'both' },
  { label: 'Toto', category: 'transportation', entity: 'both' },
  { label: 'Rapido', category: 'transportation', entity: 'both' },
  { label: 'Petrol', category: 'fuel', entity: 'both' },
  { label: 'EV charging', category: 'ev_charging', entity: 'both' },
  { label: 'Bike charging', category: 'ev_charging', entity: 'both' },
  { label: 'Scooter charging', category: 'ev_charging', entity: 'both' },
  { label: 'Tea', category: 'evening_snacks', entity: 'both' },
  { label: 'Meals', category: 'lunch', entity: 'both' },
  { label: 'Biryani', category: 'lunch', entity: 'both' },
  { label: 'Mala', category: 'puja_expense', entity: 'store' },
  { label: 'Labour cost', category: 'labour_charge', entity: 'both' },
  { label: 'Colin', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Deep cleaning', category: 'deep_cleaning', entity: 'production_house' },
  { label: 'Lamination', category: 'office_supplies', entity: 'both' },
  // Supplies and tools that used to be logged as inventory (moved to overheads 23 Oct 2026)
  { label: 'Garbage Bag', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Nirma', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Phenyl', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Dish Washing Liquid', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Dish Washing Bar', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Scotch Brite', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Duster', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Jharu', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Room Freshener', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Washing Powder', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Bleaching Powder', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Dustbin', category: 'cleaning_supplies', entity: 'both' },
  { label: 'Gloves', category: 'hygiene_ppe', entity: 'both' },
  { label: 'Cap', category: 'hygiene_ppe', entity: 'both' },
  { label: 'Hairnet', category: 'hygiene_ppe', entity: 'both' },
  { label: 'Apron', category: 'hygiene_ppe', entity: 'both' },
  { label: 'KOT Rolls', category: 'office_supplies', entity: 'both' },
  { label: 'Pen', category: 'office_supplies', entity: 'both' },
  { label: 'Marker', category: 'office_supplies', entity: 'both' },
  { label: 'Lock and Key', category: 'office_supplies', entity: 'both' },
  { label: 'Charger', category: 'office_supplies', entity: 'both' },
  { label: 'Dhup', category: 'puja_expense', entity: 'both' },
  { label: 'Lebu Lanka', category: 'puja_expense', entity: 'store' },
  { label: 'Spatula', category: 'utensils', entity: 'both' },
  { label: 'Sauce Bottle', category: 'utensils', entity: 'both' },
  { label: 'Sauce Container', category: 'utensils', entity: 'both' },
  { label: 'Lemon Squeezer', category: 'utensils', entity: 'both' },
  { label: 'Butter Brush', category: 'utensils', entity: 'both' },
  { label: 'Dabba', category: 'utensils', entity: 'both' },
  { label: 'Video Shoot', category: 'marketing', entity: 'both' },
  { label: 'Market Research', category: 'marketing', entity: 'both' },
  { label: 'CA Fee', category: 'professional_fees', entity: 'both' },
  { label: 'GST Filing', category: 'professional_fees', entity: 'both' },
  { label: 'Vehicle Paperwork', category: 'license', entity: 'both' },
  { label: 'FSSAI Licence', category: 'license', entity: 'both' },
  { label: 'Tyre', category: 'vehicle_maintenance', entity: 'both' },
  { label: 'Vehicle Servicing', category: 'vehicle_maintenance', entity: 'both' },
  { label: 'Team Lunch', category: 'staff_welfare', entity: 'both' },
  { label: 'Furniture', category: 'asset_furniture', entity: 'both' },
  { label: 'Chair', category: 'asset_furniture', entity: 'both' },
  { label: 'Steamer', category: 'asset_kitchen_equipment', entity: 'both' },
  { label: 'Induction', category: 'asset_kitchen_equipment', entity: 'both' },
  { label: 'Microwave', category: 'asset_kitchen_equipment', entity: 'both' },
  { label: 'RCCB', category: 'asset_electrical', entity: 'both' },
  { label: 'Scooter', category: 'asset_vehicle', entity: 'both' },
  { label: 'Scooter EMI', category: 'vehicle_emi', entity: 'both' },
  { label: 'EMI', category: 'vehicle_emi', entity: 'both' },
];

// Fixed-cost item names people actually type.
const FIXED_SYNONYMS: { label: string; category: string }[] = [
  { label: 'WiFi Recharge', category: 'internet_phone' },
  { label: 'Mobile Recharge', category: 'internet_phone' },
  { label: 'Ciferon', category: 'software_subscription' },
  { label: 'POS Subscription', category: 'software_subscription' },
];

// A custom item saved under a retired/merged category is suggested under its new home
// (e.g. "Nirma", once inventory > Cleaning & Sanitation, is now an overhead).
function entryTypeForCategory(category: string, fallback: ExpenseEntryType): ExpenseEntryType {
  if (category in INVENTORY_CATEGORIES) return 'inventory';
  if (category in FIXED_COST_CATEGORIES) return 'fixedcost';
  if (category in OVERHEAD_CATEGORY_META) return 'overhead';
  return fallback;
}

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
  for (const category of SELECTABLE_OVERHEAD_CATEGORY_KEYS) {
    const meta = OVERHEAD_CATEGORY_META[category];
    const entity: ExpenseEntity = STORE_OVERHEAD_CATEGORY_KEYS.includes(category) ? 'both' : 'production_house';
    candidates.push({ label: stripEmoji(meta.label), entryType: 'overhead', category, entity });
  }
  for (const synonym of OVERHEAD_SYNONYMS) {
    candidates.push({ label: synonym.label, entryType: 'overhead', category: synonym.category, entity: synonym.entity });
  }

  // Fixed costs, usable by either entity.
  for (const [category, label] of Object.entries(SELECTABLE_FIXED_COST_CATEGORIES)) {
    candidates.push({ label: stripEmoji(label), entryType: 'fixedcost', category, entity: 'both' });
  }
  for (const synonym of FIXED_SYNONYMS) {
    candidates.push({ label: synonym.label, entryType: 'fixedcost', category: synonym.category, entity: 'both' });
  }

  // Previously-classified custom items (from earlier quick-add uses or the legacy
  // "+ Add Custom Item" flow) - these take priority since they reflect real past choices.
  for (const item of customItems) {
    const category = canonicalCategory(item.category);
    candidates.push({
      label: item.itemName,
      entryType: entryTypeForCategory(category, item.entryType || 'inventory'),
      category,
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
