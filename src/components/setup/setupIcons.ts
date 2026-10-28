// Lucide icons for the categories that carry an emoji in their data (asset types in
// utils/assetRules.ts, purchase categories in utils/inventoryData.ts, custom categories from the
// server). The screens show these icons and the label without its emoji (warm ledger: no emoji
// anywhere in the UI, also not in data labels).
import type { LucideIcon } from 'lucide-react';
import {
  Archive,
  Armchair,
  Bike,
  Boxes,
  CookingPot,
  CupSoda,
  Drumstick,
  Flame,
  Lightbulb,
  Milk,
  Package,
  Refrigerator,
  Sandwich,
  Sprout,
  SprayCan,
  Tag,
  UtensilsCrossed,
  Wheat,
} from 'lucide-react';

/** Equipment register types (utils/assetRules.ts ASSET_CATEGORIES keys). */
const ASSET_CATEGORY_ICONS: Record<string, LucideIcon> = {
  cooking_equipment: CookingPot,
  refrigeration: Refrigerator,
  storage_bins: Archive,
  utensils_pans: UtensilsCrossed,
  furniture: Armchair,
  electrical_lighting: Lightbulb,
  cleaning: SprayCan,
  vehicle: Bike,
  other: Package,
};

/** Purchase categories (utils/inventoryData.ts INVENTORY_CATEGORIES keys). */
const PURCHASE_CATEGORY_ICONS: Record<string, LucideIcon> = {
  meat: Drumstick,
  dairy: Milk,
  fresh_produce: Sprout,
  staples: Wheat,
  spices_seasonings: Flame,
  bread_buns: Sandwich,
  beverages: CupSoda,
  packaging: Package,
  packaging_bulk: Boxes,
};

export const assetCategoryIcon = (key: string | null | undefined): LucideIcon => (key && ASSET_CATEGORY_ICONS[key]) || Package;

/** Built-in purchase categories get their own icon; categories the owner added get a tag. */
export const purchaseCategoryIcon = (key: string | null | undefined): LucideIcon => (key && PURCHASE_CATEGORY_ICONS[key]) || Tag;

// Pictographs, the variation selector that turns a symbol into an emoji, and the joiner between
// emoji parts.
const EMOJI_RE = /[\p{Extended_Pictographic}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** "<emoji> Meat" -> "Meat". Labels from data can carry a leading emoji; the UI never shows it. */
export function stripEmoji(label: string | null | undefined): string {
  return (label || '').replace(EMOJI_RE, '').replace(/\s{2,}/g, ' ').trim();
}
