export const INVENTORY_CATEGORIES = {
  fresh_produce: '🥬 Fresh Vegetables',
  spices_seasonings: '🌶️ Grocery & Dry Goods',
  dairy: '🧈 Dairy Products',
  meat: '🍖 Meat',
  packaging: '📦 Packaging Materials',
  beverages: '🥤 Beverages',
  cleaning_sanitation: '🧼 Cleaning & Sanitation',
  equipment_smallwares: '🔧 Kitchen Equipment & Smallwares',
  staff_welfare_ppe: '🥽 Staff Welfare & Safety',
  office_admin_supplies: '🖊️ Office & Admin Supplies',
  puja_items: '🪔 Puja Items'
} as const;

// All categories are selectable - the old 'staff_essentials' catch-all (which mixed
// cleaning supplies, PPE, drinks, and office supplies) has been fully retired; every
// historical record that used it has been recategorized into the categories above.
export const SELECTABLE_INVENTORY_CATEGORIES: Record<string, string> = { ...INVENTORY_CATEGORIES };

export const CATEGORY_ITEMS = {
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
    'Potato'
  ],
  spices_seasonings: [
    'Soya Sauce',
    'Chilli Sauce',
    'Vinegar',
    'Oil',
    'Salt',
    'Sugar',
    'Ajinomoto',
    'Black Pepper',
    'White Pepper',
    'Peri Peri Masala',
    'Baking Powder',
    'Corn Flour',
    'Maida'
  ],
  dairy: ['Butter', 'Cheese'],
  meat: ['Chicken'],
  packaging: ['Butter Paper', 'Carry Bag', 'Container', 'Tissue Paper'],
  beverages: ['Coca-Cola', 'Campa Cola'],
  cleaning_sanitation: ['Broom', 'Garbage Bag', 'Dish Washing Liquid', 'Detergent', 'Scrub Pad', 'Duster'],
  equipment_smallwares: ['Butter Brush', 'Sauce Bottle'],
  staff_welfare_ppe: ['Gloves', 'Cap', 'Protective Gear'],
  office_admin_supplies: ['Marker', 'KOT Rolls'],
  // No built-ins yet - Dhup (incense) lives here as a custom item; add more here as
  // needed instead of leaving them miscategorized under Cleaning & Sanitation.
  puja_items: []
} as const;

export type OverheadCategoryGroup = 'operating' | 'meals' | 'payroll_linked';

export const OVERHEAD_CATEGORY_META: Record<string, { label: string; group: OverheadCategoryGroup }> = {
  // Petrol is no longer a routine store cost (the store now runs an electric bike) - fuel
  // entry is cluster-head-only, see RESTRICTED_OVERHEAD_CATEGORIES below.
  fuel: { label: '⛽ Fuel Cost', group: 'operating' },
  ev_charging: { label: '⚡ Electric Bike Charging', group: 'operating' },
  travel: { label: '🚗 Travel by Employee', group: 'operating' },
  transportation: { label: '🚛 Goods Transportation Cost', group: 'operating' },
  marketing: { label: '📢 Marketing Cost', group: 'operating' },
  service_charge: { label: '🍔 Service Charge (Food Aggregators)', group: 'operating' },
  repair: { label: '🔧 Repair Cost', group: 'operating' },
 // Distinct from Repair Cost on purpose - repair is fixing something broken; this is a
 // proactive refresh/beautification (wall painting, festive decor, store look-and-feel)
 // that isn't "broken" to begin with. Conflating the two was making Repair Cost an
 // unreliable signal of actual equipment/furniture failures.
 renovation: { label: '🎨 Renovation & Decoration', group: 'operating' },
  labour_charge: { label: '👷 Labour Charge', group: 'operating' },
  puja_expense: { label: '🪔 Puja Expense (Garland, Candle, Scented Sticks)', group: 'operating' },
  office_supplies: { label: '🖊️ Office Supplies & Stationery', group: 'operating' },
  deep_cleaning: { label: '🧹 Deep Cleaning Service', group: 'operating' },
  party: { label: '🎉 Party Cost', group: 'operating' },
  emergency_online: { label: '🛒 Emergency Online Order (Blinkit)', group: 'operating' },
  staff_emergency_services: { label: '🏥 Staff Emergency Services (Hospital & Medical Bills)', group: 'operating' },
  utensils: { label: '🍴 Utensils', group: 'operating' },
  cleaning_supplies: { label: '🧽 Cleaning Supplies', group: 'operating' },
  equipments: { label: '🔨 Equipments', group: 'operating' },
  license: { label: '📜 License Cost', group: 'operating' },
  water_jar: { label: '💧 Water Jar', group: 'operating' },
  vehicle_maintenance: { label: '🛞 Vehicle Maintenance (Tyres, Servicing)', group: 'operating' },
  donations_community: { label: '🙏 Donations & Community Contributions', group: 'operating' },
  staff_welfare: { label: '🎊 Staff Welfare (Uniforms, Festival Costs)', group: 'operating' },
  breakfast: { label: '🌅 Breakfast Cost', group: 'meals' },
  lunch: { label: '🍽️ Lunch Cost', group: 'meals' },
  dinner: { label: '🌙 Dinner Cost', group: 'meals' },
  evening_snacks: { label: '🍿 Evening Snacks', group: 'meals' },
  personal_expense: { label: '👤 Personal Expense By an Employee', group: 'payroll_linked' },
  // Legacy categories kept for historical data display only — not selectable in the form
  miscellaneous: { label: '📝 Miscellaneous Cost', group: 'operating' },
};

// Back-compat flat label map (existing call sites read this as Record<string,string>)
export const OVERHEAD_CATEGORIES: Record<string, string> = Object.fromEntries(
  Object.entries(OVERHEAD_CATEGORY_META).map(([key, { label }]) => [key, label])
);

// Categories only the cluster head may log (UI hides them for everyone else and the server
// rejects them) - existing entries stay visible and keep counting in analytics.
export const RESTRICTED_OVERHEAD_CATEGORIES: readonly string[] = ['fuel'];

export const MEAL_CATEGORIES: readonly string[] = ['breakfast', 'lunch', 'dinner', 'evening_snacks'];

// The store's day-to-day overhead categories are a small, curated subset of the full
// list above (which stays exactly as-is for the production house) - based on a real
// month of store expense logging, not every operating-cost category the business has
// ever needed applies to a single store's daily running costs. 'miscellaneous' is
// re-included here specifically for the store list even though it's excluded from the
// general/production list above.
export const STORE_OVERHEAD_CATEGORY_KEYS: readonly string[] = [
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
  'utensils',
  'equipments',
  'vehicle_maintenance',
  'staff_emergency_services',
  'miscellaneous',
];

// The store's day-to-day inventory purchases are a small, curated subset of items -
// based on a real month of store purchase logging (unlike production house inventory,
// which needs the full fresh-produce/spices/meat lists to make momos). Categories not
// listed here have no store-relevant items and are omitted entirely for the store.
export const STORE_CATEGORY_ITEMS: Partial<Record<keyof typeof CATEGORY_ITEMS, string[]>> = {
  spices_seasonings: ['Oil', 'Burger'],
  dairy: ['Milk'],
  packaging: ['Bag', 'Foil', 'Fork'],
  beverages: ['Coke', 'Water Bottle'],
  cleaning_sanitation: ['Room Freshener', 'Garbage Bag', 'Colin', 'Duster', 'Washing Bar', 'Washing Powder'],
  equipment_smallwares: ['Sauce Container'],
  office_admin_supplies: ['Charger', 'Lock and Key'],
  puja_items: [],
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
  lpg_gas: '🔥 LPG Gas Cost (Cylinders)'
};