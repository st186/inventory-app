export const INVENTORY_CATEGORIES = {
  fresh_produce: '🥬 Fresh Vegetables',
  spices_seasonings: '🌶️ Grocery',
  dairy: '🧈 Dairy Products',
  meat: '🍖 Meat',
  packaging: '📦 Packaging Materials',
  staff_essentials: '👔 Staff Essentials'
} as const;

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
  staff_essentials: ['Labour', 'Cleaning', 'Water', 'Electricity']
} as const;

export const OVERHEAD_CATEGORIES = {
  fuel: '⛽ Fuel Cost',
  travel: '🚗 Travel by Employee',
  transportation: '🚛 Goods Transportation Cost',
  marketing: '📢 Marketing Cost',
  service_charge: '🍔 Service Charge (Food Aggregators)',
  repair: '🔧 Repair Cost',
  party: '🎉 Party Cost',
  lunch: '🍽️ Lunch Cost',
  emergency_online: '🛒 Emergency Online Order (Blinkit)',
  personal_expense: '👤 Personal Expense By an Employee',
  utensils: '🍴 Utensils',
  equipments: '🔨 Equipments',
  license: '📜 License Cost',
  water_jar: '💧 Water Jar',
  evening_snacks: '🍿 Evening Snacks',
  miscellaneous: '📝 Miscellaneous Cost'
} as const;

export const FIXED_COST_CATEGORIES: Record<string, string> = {
  electricity: '⚡ Electricity',
  rent: '🏠 Rent',
  lpg_gas: '🔥 LPG Gas Cost (Cylinders)'
};