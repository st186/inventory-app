// Expense categories as shown on the Money screens: the label without its emoji (the labels in
// utils/inventoryData.ts still carry one for older screens) and a fixed lucide icon per category.
import type { LucideIcon } from 'lucide-react';
import {
  Beef, Bike, Bolt, Briefcase, Brush, Building2, Car, Cookie, CupSoda, Droplets, Fuel, HandHeart, HardHat,
  Home, Landmark, Leaf, Megaphone, Milk, MonitorSmartphone, Package, PackageOpen, Paintbrush, PartyPopper, PenLine, Receipt,
  ScrollText, Shield, ShoppingCart, Soup, Sparkles, Stethoscope, Truck, User, Utensils, UtensilsCrossed, Wallet, Wheat, Wifi,
  Wrench, Zap, Armchair, Plug, Flame, AlertTriangle, Bot, Sandwich, Moon, Coffee,
} from 'lucide-react';
import { expenseCategoryLabel, canonicalCategory } from '../../utils/inventoryData';

const EMOJI = /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}\u{FE0F}\u{200D}\u{20E3}]/gu;

/** "💰 Salaries" -> "Salaries". Also tidies the double spaces an emoji leaves behind. */
export function stripEmoji(text: string | null | undefined): string {
  return String(text ?? '').replace(EMOJI, '').replace(/\s{2,}/g, ' ').trim();
}

/** The category's label for display, without emoji. */
export function categoryText(category: string): string {
  return stripEmoji(expenseCategoryLabel(category)) || category;
}

const ICONS: Record<string, LucideIcon> = {
  // Ingredients (inventory)
  meat: Beef,
  dairy: Milk,
  fresh_produce: Leaf,
  staples: Wheat,
  spices_seasonings: Soup,
  bread_buns: Sandwich,
  beverages: CupSoda,
  packaging: Package,
  packaging_bulk: PackageOpen,
  // Running costs (overheads)
  fuel: Fuel,
  ev_charging: Zap,
  travel: Car,
  transportation: Truck,
  marketing: Megaphone,
  service_charge: Bike,
  commission: Bike,
  repair: Wrench,
  renovation: Paintbrush,
  labour_charge: HardHat,
  puja_expense: Sparkles,
  office_supplies: PenLine,
  deep_cleaning: Brush,
  emergency_online: ShoppingCart,
  staff_emergency_services: Stethoscope,
  utensils: UtensilsCrossed,
  cleaning_supplies: Droplets,
  hygiene_ppe: Shield,
  license: ScrollText,
  professional_fees: Briefcase,
  ai_credits: Bot,
  water_jar: Droplets,
  vehicle_maintenance: Wrench,
  donations_community: HandHeart,
  staff_welfare: PartyPopper,
  losses_writeoffs: AlertTriangle,
  breakfast: Coffee,
  lunch: Utensils,
  dinner: Moon,
  evening_snacks: Cookie,
  personal_expense: User,
  asset_kitchen_equipment: Flame,
  asset_furniture: Armchair,
  asset_electrical: Plug,
  asset_vehicle: Bike,
  vehicle_emi: Landmark,
  miscellaneous: Receipt,
  party: PartyPopper,
  equipments: Wrench,
  // Fixed costs
  electricity: Bolt,
  rent: Home,
  internet_phone: Wifi,
  software_subscription: MonitorSmartphone,
  lpg_gas: Flame,
  // Money lines that show up next to expenses
  salaries: Wallet,
  loan_interest: Landmark,
  ads: Megaphone,
};

/** A fixed icon per category; falls back by type (ingredient / running cost / fixed). */
export function categoryIcon(category: string, source: 'inventory' | 'overhead' | 'fixedcost' = 'overhead'): LucideIcon {
  const key = canonicalCategory(category);
  return ICONS[key] ?? (source === 'inventory' ? Package : source === 'fixedcost' ? Building2 : Receipt);
}

/** How an expense was paid, as one word for a chip. */
export function paidByLabel(item: { paymentMethod?: string; paidFromProductionHouseId?: string | null }): 'cash' | 'paytm' | 'split' | 'owner' | 'productionCash' | null {
  if (!item.paymentMethod) return null;
  if (item.paidFromProductionHouseId) return 'productionCash';
  if (item.paymentMethod === 'both') return 'split';
  if (item.paymentMethod === 'owner') return 'owner';
  if (item.paymentMethod === 'cash') return 'cash';
  return 'paytm';
}
