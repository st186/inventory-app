// Inventory = only what goes into the food or out with the order (food cost). Everything
// else - cleaning, stationery, puja, PPE, tools, equipment - is logged as an overhead, and
// equipment is spread over its life (see SPREAD_MONTHS). Recategorized 23 Oct 2026: 20% of
// October's "inventory" had been tools, supplies and a WiFi recharge, inflating food cost.
export const INVENTORY_CATEGORIES = {
  meat: '🍖 Meat',
  dairy: '🧈 Dairy Products',
  fresh_produce: '🥬 Vegetables & Herbs',
  staples: '🌾 Flour, Oil & Staples',
  spices_seasonings: '🌶️ Sauces, Spices & Coatings',
  bread_buns: '🍔 Bread & Buns',
  beverages: '🥤 Beverages (for Sale)',
  packaging: '📦 Packaging Materials',
  // A bulk order of boxes/trays lasts months, so it's counted over SPREAD_DAYS instead of
  // all on the day it was bought.
  packaging_bulk: '📦 Bulk Packaging Stock (counted over 4 months)',
} as const;

export const SELECTABLE_INVENTORY_CATEGORIES: Record<string, string> = { ...INVENTORY_CATEGORIES };

export const CATEGORY_ITEMS = {
  meat: ['Chicken'],
  dairy: ['Butter', 'Cheese', 'Mozzarella Cheese', 'Liquid Cheese', 'Paneer', 'Milk', 'Fresh Cream'],
  fresh_produce: [
    'Tomato',
    'Capsicum',
    'Onion',
    'Cabbage',
    'Gandhoraj Lemon',
    'Lemon',
    'Pudina',
    'Coriander Leaves',
    'Garlic',
    'Green Chilli',
    'Ginger',
    'Red Chilli',
    'Carrot',
    'Potato',
    'Sweet Corn'
  ],
  staples: ['Maida', 'Oil', 'Corn Flour', 'Ararut', 'Sugar', 'Salt', 'Baking Powder'],
  spices_seasonings: [
    'Soya Sauce',
    'Chilli Sauce',
    'Tomato Sauce',
    'Mayonnaise',
    'Vinegar',
    'Ajinomoto',
    'Aromatic Powder',
    'Black Pepper',
    'White Pepper',
    'Peri Peri Masala',
    'Corn Flakes',
    // Dried, for the spice shelf ("Red Chilli" is the fresh one): one item, one category.
    'Dry Red Chilli'
  ],
  bread_buns: ['Burger'],
  beverages: ['Coca-Cola', 'Campa Cola', 'Water Bottle'],
  packaging: ['Momo Box', 'Momo Tray', 'Butter Paper', 'Carry Bag', 'Container', 'Tissue Paper', 'Foil', 'Spoon', 'Fork'],
  packaging_bulk: ['Momo Box', 'Momo Tray'],
} as const;

// Categories retired from inventory (not food or packaging) or merged into another, each
// mapped to where it lives now. Old records and old app versions still carry these keys,
// so every label/grouping lookup goes through canonicalCategory() first.
export const LEGACY_CATEGORY_CANONICAL: Record<string, string> = {
  cleaning_sanitation: 'cleaning_supplies',
  staff_essentials: 'cleaning_supplies',
  office_admin_supplies: 'office_supplies',
  puja_items: 'puja_expense',
  staff_welfare_ppe: 'hygiene_ppe',
  equipment_smallwares: 'asset_kitchen_equipment',
  equipments: 'asset_kitchen_equipment',
  party: 'staff_welfare',
  // Cluster-head custom categories that duplicated a built-in one
  experiment: 'marketing',
  license_paperwork_cost: 'license',
  maintainance: 'vehicle_maintenance',
  staff_advances_recoverables: 'losses_writeoffs',
};

export const canonicalCategory = (category: string): string => LEGACY_CATEGORY_CANONICAL[category] || category;

export type OverheadCategoryGroup = 'operating' | 'meals' | 'payroll_linked' | 'asset';

export const OVERHEAD_CATEGORY_META: Record<string, { label: string; group: OverheadCategoryGroup }> = {
  // Petrol is no longer a routine store cost (the store now runs an electric bike) - fuel
  // entry is cluster-head-only, see RESTRICTED_OVERHEAD_CATEGORIES below.
  fuel: { label: '⛽ Fuel Cost', group: 'operating' },
  ev_charging: { label: '⚡ Electric Bike Charging', group: 'operating' },
  travel: { label: '🚗 Travel by Employee', group: 'operating' },
  transportation: { label: '🚛 Goods Transportation Cost', group: 'operating' },
  marketing: { label: '📢 Marketing (Ads, Shoots, Sampling, Research)', group: 'operating' },
  service_charge: { label: '🍔 Service Charge (Food Aggregators)', group: 'operating' },
  repair: { label: '🔧 Repair (Fixing Something Broken)', group: 'operating' },
 // Distinct from Repair Cost on purpose - repair is fixing something broken; this is a
 // proactive refresh/beautification (wall painting, festive decor, store look-and-feel)
 // that isn't "broken" to begin with. Conflating the two was making Repair Cost an
 // unreliable signal of actual equipment/furniture failures.
 renovation: { label: '🎨 Renovation & Decoration', group: 'operating' },
  labour_charge: { label: '👷 Labour Charge (Installation & One-off Work)', group: 'operating' },
  puja_expense: { label: '🪔 Puja Expense (Garland, Dhup, Candle)', group: 'operating' },
  office_supplies: { label: '🖊️ Office Supplies & Stationery (KOT Rolls, Pens)', group: 'operating' },
  deep_cleaning: { label: '🧹 Deep Cleaning Service', group: 'operating' },
  emergency_online: { label: '🛒 Emergency Online Order (Blinkit)', group: 'operating' },
  staff_emergency_services: { label: '🏥 Staff Emergency Services (Hospital & Medical Bills)', group: 'operating' },
  utensils: { label: '🍴 Small Utensils & Tools (under ₹1,000)', group: 'operating' },
  cleaning_supplies: { label: '🧽 Cleaning Supplies (Nirma, Phenyl, Garbage Bags)', group: 'operating' },
  hygiene_ppe: { label: '🧤 Hygiene & Safety (Gloves, Caps)', group: 'operating' },
  license: { label: '📜 Licence & Paperwork', group: 'operating' },
  professional_fees: { label: '💼 Professional Fees (CA, GST, Legal)', group: 'operating' },
  // Claude credits for the app's AI (Bunny chat, voice entry, invoice scan, photo scoring).
  ai_credits: { label: '🤖 AI Credits (Claude / Anthropic)', group: 'operating' },
  water_jar: { label: '💧 Water Jar', group: 'operating' },
  vehicle_maintenance: { label: '🛞 Vehicle Maintenance (Tyres, Servicing)', group: 'operating' },
  donations_community: { label: '🙏 Donations & Community Contributions', group: 'operating' },
  staff_welfare: { label: '🎊 Staff Welfare (Uniforms, Festivals, Team Outings)', group: 'operating' },
  losses_writeoffs: { label: '⚠️ Losses & Write-offs', group: 'operating' },
  breakfast: { label: '🌅 Breakfast Cost', group: 'meals' },
  lunch: { label: '🍽️ Lunch Cost', group: 'meals' },
  dinner: { label: '🌙 Dinner Cost', group: 'meals' },
  evening_snacks: { label: '🍿 Evening Snacks', group: 'meals' },
  personal_expense: { label: '👤 Personal Expense By an Employee', group: 'payroll_linked' },
  // Equipment purchases (₹1,000+ and lasting over a year): counted in profit a little each
  // month over their life (SPREAD_MONTHS), not all in the month they were bought.
  asset_kitchen_equipment: { label: '🍳 Kitchen Equipment (spread over 3 years)', group: 'asset' },
  asset_furniture: { label: '🪑 Furniture & Fixtures (spread over 3 years)', group: 'asset' },
  asset_electrical: { label: '🔌 Electrical Installation (spread over 3 years)', group: 'asset' },
  asset_vehicle: { label: '🛵 Vehicle Purchase incl. loan EMIs (spread over 3 years)', group: 'asset' },
  // Paying back a loan, not a new cost: the EMIs are already part of the vehicle's cost
  // above (spread over its life), so this only moves cash - see costBucketFor ('financing').
  vehicle_emi: { label: '🏦 Vehicle Loan EMI (cash only - cost already spread)', group: 'asset' },
  // Legacy categories kept for historical data display only — not selectable in the form
  miscellaneous: { label: '📝 Miscellaneous Cost', group: 'operating' },
  party: { label: '🎉 Party Cost (now Staff Welfare)', group: 'operating' },
  equipments: { label: '🔨 Equipments (now Kitchen Equipment)', group: 'asset' },
};

// Kept for old records only - never offered when adding a new expense.
export const LEGACY_OVERHEAD_CATEGORIES: readonly string[] = ['miscellaneous', 'party', 'equipments', 'service_charge'];

// Back-compat flat label map (existing call sites read this as Record<string,string>)
export const OVERHEAD_CATEGORIES: Record<string, string> = Object.fromEntries(
  Object.entries(OVERHEAD_CATEGORY_META).map(([key, { label }]) => [key, label])
);

// Categories only the cluster head may log (UI hides them for everyone else and the server
// rejects them) - existing entries stay visible and keep counting in analytics.
export const RESTRICTED_OVERHEAD_CATEGORIES: readonly string[] = ['fuel', 'losses_writeoffs', 'ai_credits'];

export const MEAL_CATEGORIES: readonly string[] = ['breakfast', 'lunch', 'dinner', 'evening_snacks'];
// From 1 November 2026 everyone gets Rs 500 a month more in salary for food (owner, 28 Oct), so
// staff meals stop being expenses. The server refuses them too (POST/PUT /overheads).
export const MEALS_LAST_DAY = '2026-10-31';
export const mealsStopped = (category: string | null | undefined, date: string) => !!category && MEAL_CATEGORIES.includes(category) && date > MEALS_LAST_DAY;
export const MEALS_STOPPED_TEXT = "From 1 November staff food is paid in salary (₹500 a month), so meals aren't logged as expenses.";

// Overhead categories offered when adding a new expense (legacy ones and the salary-linked
// personal expense excluded).
export const SELECTABLE_OVERHEAD_CATEGORY_KEYS: readonly string[] = Object.keys(OVERHEAD_CATEGORY_META)
  .filter((key) => key !== 'personal_expense' && !LEGACY_OVERHEAD_CATEGORIES.includes(key));

// The store's day-to-day overhead categories are a small, curated subset of the full
// list above (which stays exactly as-is for the production house) - based on a real
// month of store expense logging, not every operating-cost category the business has
// ever needed applies to a single store's daily running costs.
export const STORE_OVERHEAD_CATEGORY_KEYS: readonly string[] = [
  'ai_credits',
  'transportation',
  'travel',
  'fuel',
  'ev_charging',
  'breakfast',
  'lunch',
  'dinner',
  'evening_snacks',
  'repair',
  'renovation',
  'labour_charge',
  'puja_expense',
  'office_supplies',
  'cleaning_supplies',
  'hygiene_ppe',
  'utensils',
  'water_jar',
  'marketing',
  'donations_community',
  'staff_welfare',
  'vehicle_maintenance',
  'staff_emergency_services',
  'losses_writeoffs',
  'asset_kitchen_equipment',
  'asset_furniture',
  'asset_electrical',
  'asset_vehicle',
  'vehicle_emi',
];

// The store's day-to-day inventory purchases are a small, curated subset of items -
// based on a real month of store purchase logging (unlike production house inventory,
// which needs the full fresh-produce/spices/meat lists to make momos). Categories not
// listed here have no store-relevant items and are omitted entirely for the store.
export const STORE_CATEGORY_ITEMS: Partial<Record<keyof typeof CATEGORY_ITEMS, string[]>> = {
  staples: ['Oil'],
  bread_buns: ['Burger'],
  dairy: ['Milk'],
  packaging: ['Bag', 'Foil', 'Fork'],
  packaging_bulk: ['Momo Box', 'Momo Tray'],
  beverages: ['Coke', 'Water Bottle'],
};

export const STORE_SELECTABLE_INVENTORY_CATEGORIES: Record<string, string> = Object.fromEntries(
  Object.entries(INVENTORY_CATEGORIES).filter(([key]) => key in STORE_CATEGORY_ITEMS)
);

// Bengali names for the built-in item catalog (CATEGORY_ITEMS / STORE_CATEGORY_ITEMS),
// keyed by the exact English name used in those lists. Custom items (added by a user,
// not in this built-in catalog) carry their own itemNameBengali field instead - see
// CustomItem in utils/api.ts and the Item Catalog Cleanup panel.
export const BUILT_IN_ITEM_BENGALI: Record<string, string> = {
  // fresh_produce
  'Tomato': 'টমেটো',
  'Capsicum': 'ক্যাপসিকাম',
  'Onion': 'পেঁয়াজ',
  'Cabbage': 'বাঁধাকপি',
  'Gandhoraj Lemon': 'গন্ধরাজ লেবু',
  'Lemon': 'লেবু',
  'Pudina': 'পুদিনা',
  'Coriander Leaves': 'ধনে পাতা',
  'Garlic': 'রসুন',
  'Green Chilli': 'কাঁচা লঙ্কা',
  'Ginger': 'আদা',
  'Red Chilli': 'লাল লঙ্কা',
  'Carrot': 'গাজর',
  'Potato': 'আলু',
  // spices_seasonings
  'Soya Sauce': 'সয়া সস',
  'Chilli Sauce': 'লঙ্কার সস',
  'Vinegar': 'ভিনেগার',
  'Oil': 'তেল',
  'Salt': 'নুন',
  'Sugar': 'চিনি',
  'Ajinomoto': 'আজিনোমোটো',
  'Black Pepper': 'গোলমরিচ',
  'White Pepper': 'সাদা গোলমরিচ',
  'Peri Peri Masala': 'পেরি পেরি মশলা',
  'Baking Powder': 'বেকিং পাউডার',
  'Corn Flour': 'কর্ন ফ্লাওয়ার',
  'Maida': 'ময়দা',
  // dairy
  'Butter': 'মাখন',
  'Cheese': 'চিজ',
  // meat
  'Chicken': 'মুরগির মাংস',
  // packaging
  'Butter Paper': 'বাটার পেপার',
  'Carry Bag': 'ক্যারি ব্যাগ',
  'Container': 'কন্টেইনার',
  'Tissue Paper': 'টিস্যু পেপার',
  // beverages
  'Coca-Cola': 'কোকা কোলা',
  'Campa Cola': 'ক্যাম্পা কোলা',
  // cleaning_sanitation
  'Broom': 'ঝাড়ু',
  'Garbage Bag': 'আবর্জনার ব্যাগ',
  'Dish Washing Liquid': 'বাসন মাজার লিকুইড',
  'Detergent': 'ডিটারজেন্ট',
  'Scrub Pad': 'স্ক্রাব প্যাড',
  'Duster': 'ঝাড়ন',
  // equipment_smallwares
  'Butter Brush': 'বাটার ব্রাশ',
  'Sauce Bottle': 'সস বোতল',
  // staff_welfare_ppe
  'Gloves': 'গ্লাভস',
  'Cap': 'টুপি',
  'Protective Gear': 'সুরক্ষা সরঞ্জাম',
  // office_admin_supplies
  'Marker': 'মার্কার',
  'KOT Rolls': 'কেওটি রোল',
  // added with the 23 Oct 2026 recategorization
  'Mozzarella Cheese': 'মোজারেলা চিজ',
  'Liquid Cheese': 'লিকুইড চিজ',
  'Paneer': 'পনির',
  'Fresh Cream': 'ফ্রেশ ক্রিম',
  'Sweet Corn': 'সুইট কর্ন',
  'Ararut': 'আরারুট',
  'Tomato Sauce': 'টমেটো সস',
  'Mayonnaise': 'মেয়োনিজ',
  'Aromatic Powder': 'অ্যারোমেটিক পাউডার',
  'Corn Flakes': 'কর্নফ্লেক্স',
  'Dry Red Chilli': 'শুকনো লঙ্কা',
  'Momo Box': 'মোমো বক্স',
  'Momo Tray': 'মোমো ট্রে',
  'Spoon': 'চামচ',
  // store-only items (STORE_CATEGORY_ITEMS)
  'Burger': 'বার্গার',
  'Milk': 'দুধ',
  'Bag': 'ব্যাগ',
  'Foil': 'ফয়েল',
  'Fork': 'কাঁটাচামচ',
  'Coke': 'কোক',
  'Water Bottle': 'জলের বোতল',
  'Room Freshener': 'রুম ফ্রেশনার',
  'Colin': 'কোলিন',
  'Washing Bar': 'কাপড় কাচার সাবান',
  'Washing Powder': 'ওয়াশিং পাউডার',
  'Sauce Container': 'সস কন্টেইনার',
  'Charger': 'চার্জার',
  'Lock and Key': 'তালা চাবি',
};

export const FIXED_COST_CATEGORIES: Record<string, string> = {
  electricity: '⚡ Electricity',
  rent: '🏠 Rent',
  internet_phone: '📶 Internet & Phone',
  software_subscription: '💻 Software & POS Subscription (spread over 12 months)',
  // Legacy - no gas is bought any more (kitchen runs on electricity); old entries only.
  lpg_gas: '🔥 LPG Gas Cost (Cylinders)'
};

export const SELECTABLE_FIXED_COST_CATEGORIES: Record<string, string> = Object.fromEntries(
  Object.entries(FIXED_COST_CATEGORIES).filter(([key]) => key !== 'lpg_gas')
);

// ---- How each category counts in profit ----
// food: food & packaging (inventory / food cost). operating: running costs. fixed: rent,
// electricity, internet. spread: equipment and yearly subscriptions, counted a little each
// month over SPREAD_MONTHS instead of all in the month paid. payroll_linked: personal
// expenses deducted from salary. financing: loan repayments (EMIs) - real cash out, but
// never a profit cost (the thing bought with the loan is already spread).
export type CostBucket = 'food' | 'operating' | 'fixed' | 'spread' | 'payroll_linked' | 'financing';

const FINANCING_KEYS = new Set<string>(['vehicle_emi']);

export const SPREAD_MONTHS: Record<string, number> = {
  asset_kitchen_equipment: 36,
  asset_furniture: 36,
  asset_electrical: 36,
  // 3 years, not the scooter's longer working life: it's on a 36-month loan, and counting
  // its cost over the same months it's paid for keeps profit from looking better than cash.
  asset_vehicle: 36,
  software_subscription: 12,
};

// Stock bought in bulk is counted day by day from the purchase date, since it's used up
// steadily rather than wearing out: the 23 Mar and 18 Jul 2026 box/tray orders each lasted
// about 120 days at the store's order volume.
export const SPREAD_DAYS: Record<string, number> = {
  packaging_bulk: 120,
};

const FOOD_CATEGORY_KEYS = new Set<string>(Object.keys(INVENTORY_CATEGORIES));
const FIXED_BUCKET_KEYS = new Set<string>(['electricity', 'rent', 'internet_phone', 'lpg_gas']);

export const spreadMonthsFor = (category: string): number | null => SPREAD_MONTHS[canonicalCategory(category)] ?? null;
export const spreadDaysFor = (category: string): number | null => SPREAD_DAYS[canonicalCategory(category)] ?? null;
export const isSpreadCategory = (category: string): boolean => !!(spreadMonthsFor(category) || spreadDaysFor(category));

// `source` decides unknown keys: a cluster-head custom category on an inventory record is
// treated as food, on an overhead as a running cost, on a fixed cost as fixed.
export function costBucketFor(category: string, source: 'inventory' | 'overhead' | 'fixedcost'): CostBucket {
  const key = canonicalCategory(category);
  if (SPREAD_MONTHS[key] || SPREAD_DAYS[key]) return 'spread';
  if (FINANCING_KEYS.has(key)) return 'financing';
  if (FOOD_CATEGORY_KEYS.has(key)) return 'food';
  if (FIXED_BUCKET_KEYS.has(key)) return 'fixed';
  if (key === 'personal_expense') return 'payroll_linked';
  if (key in OVERHEAD_CATEGORY_META) return 'operating';
  return source === 'inventory' ? 'food' : source === 'fixedcost' ? 'fixed' : 'operating';
}

// Counted in profit on the day it was logged - i.e. not spread over months and not a loan
// repayment.
export const isDatedProfitCost = (category: string, source: 'inventory' | 'overhead' | 'fixedcost'): boolean => {
  const bucket = costBucketFor(category, source);
  return bucket !== 'spread' && bucket !== 'financing';
};

// One label lookup for every expense category, whichever form it was logged from.
export function expenseCategoryLabel(category: string): string {
  const key = canonicalCategory(category);
  return (INVENTORY_CATEGORIES as Record<string, string>)[key]
    || OVERHEAD_CATEGORY_META[key]?.label
    || FIXED_COST_CATEGORIES[key]
    || category;
}