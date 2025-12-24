export const INVENTORY_CATEGORIES = {
  vegetables_herbs: 'Vegetables & Herbs',
  grocery_spices: 'Grocery / Spices / Sauces',
  dairy: 'Dairy',
  meat: 'Meat',
  packaging: 'Packaging & Consumables',
  gas_utilities: 'Gas / Utilities',
  production: 'Production Ingredients',
  staff_misc: 'Staff / Miscellaneous'
} as const;

export const CATEGORY_ITEMS = {
  vegetables_herbs: [
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
  grocery_spices: [
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
  staff_misc: ['Labour', 'Cleaning', 'Water', 'Electricity']
} as const;

export const OVERHEAD_CATEGORIES = {
  fuel: 'Fuel Cost',
  travel: 'Travel Cost',
  transportation: 'Transportation Cost',
  marketing: 'Marketing Cost',
  service_charge: 'Service Charge (Food Aggregators)',
  repair: 'Repair Cost'
} as const;
