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
  // Legacy — no longer selectable for new entries, kept so old data still renders a sensible label
  staff_essentials: '👔 Staff Essentials (Legacy)'
} as const;

// Categories offered when creating/editing an item. 'staff_essentials' is excluded —
// it was a catch-all that mixed cleaning supplies, PPE, drinks, and office supplies;
// those now have their own categories above.
export const SELECTABLE_INVENTORY_CATEGORIES: Record<string, string> = Object.fromEntries(
  Object.entries(INVENTORY_CATEGORIES).filter(([value]) => value !== 'staff_essentials')
);

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
  staff_essentials: []
} as const;

export type OverheadCategoryGroup = 'operating' | 'meals' | 'payroll_linked';

export const OVERHEAD_CATEGORY_META: Record<string, { label: string; group: OverheadCategoryGroup }> = {
  fuel: { label: '⛽ Fuel Cost', group: 'operating' },
  travel: { label: '🚗 Travel by Employee', group: 'operating' },
  transportation: { label: '🚛 Goods Transportation Cost', group: 'operating' },
  marketing: { label: '📢 Marketing Cost', group: 'operating' },
  service_charge: { label: '🍔 Service Charge (Food Aggregators)', group: 'operating' },
  repair: { label: '🔧 Repair Cost', group: 'operating' },
  party: { label: '🎉 Party Cost', group: 'operating' },
  emergency_online: { label: '🛒 Emergency Online Order (Blinkit)', group: 'operating' },
  utensils: { label: '🍴 Utensils', group: 'operating' },
  equipments: { label: '🔨 Equipments', group: 'operating' },
  license: { label: '📜 License Cost', group: 'operating' },
  water_jar: { label: '💧 Water Jar', group: 'operating' },
  vehicle_maintenance: { label: '🛞 Vehicle Maintenance (Tyres, Servicing)', group: 'operating' },
  donations_community: { label: '🙏 Donations & Community Contributions', group: 'operating' },
  staff_welfare: { label: '🎊 Staff Welfare (Uniforms, Festival Costs)', group: 'operating' },
  breakfast: { label: '🌅 Breakfast Cost', group: 'meals' },
  lunch: { label: '🍽️ Lunch Cost', group: 'meals' },
  evening_snacks: { label: '🍿 Evening Snacks', group: 'meals' },
  personal_expense: { label: '👤 Personal Expense By an Employee', group: 'payroll_linked' },
  // Legacy categories kept for historical data display only — not selectable in the form
  miscellaneous: { label: '📝 Miscellaneous Cost', group: 'operating' },
};

// Back-compat flat label map (existing call sites read this as Record<string,string>)
export const OVERHEAD_CATEGORIES: Record<string, string> = Object.fromEntries(
  Object.entries(OVERHEAD_CATEGORY_META).map(([key, { label }]) => [key, label])
);

export const MEAL_CATEGORIES: readonly string[] = ['breakfast', 'lunch', 'evening_snacks'];

export const FIXED_COST_CATEGORIES: Record<string, string> = {
  electricity: '⚡ Electricity',
  rent: '🏠 Rent',
  lpg_gas: '🔥 LPG Gas Cost (Cylinders)'
};