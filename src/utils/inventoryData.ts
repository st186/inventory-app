export const INVENTORY_CATEGORIES = {
  fresh_produce: '🥬 Fresh Produce',
  spices_seasonings: '🌶️ Spices & Seasonings',
  dairy: '🧈 Dairy Products',
  meat: '🍖 Meat & Protein',
  packaging: '📦 Packaging Materials',
  gas_utilities: '⚡ Gas & Utilities',
  production: '🔨 Production Ingredients',
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
  gas_utilities: ['LPG Gas'],
  production: ['Dough', 'Batter', 'Stuffing'],
  staff_essentials: ['Labour', 'Cleaning', 'Water', 'Electricity']
} as const;

export const OVERHEAD_CATEGORIES = {
  fuel: '⛽ Fuel Cost',
  travel: '🚗 Travel Cost',
  transportation: '🚛 Transportation Cost',
  marketing: '📢 Marketing Cost',
  service_charge: '🍔 Service Charge (Food Aggregators)',
  repair: '🔧 Repair Cost',
  party: '🎉 Party Cost',
  lunch: '🍽️ Lunch Cost',
  miscellaneous: '📝 Miscellaneous Cost'
} as const;

export const FIXED_COST_CATEGORIES: Record<string, string> = {
  electricity: '⚡ Electricity',
  rent: '🏠 Rent'
};