// Proposed enrichment/cleanup for the live custom-items catalog: corrected spelling,
// correct category, emoji, and Bengali name. Keyed by normalized (trim+lowercase)
// current item name. These are suggestions only — reviewed and editable in the
// Item Catalog Cleanup panel before anything is applied.
//
// `mergeInto` marks a confirmed duplicate: the item should be deleted and any
// reference to it treated as the target name instead.
// `needsReview: true` means no confident automatic guess was made — ambiguous or
// a brand/regional term that needs the business owner's own judgment.

export type ItemSuggestion = {
  name?: string; // corrected English name, if different
  category?: string; // corrected category, if different
  bengali?: string;
  emoji?: string;
  mergeInto?: string; // normalized name of the item this should merge into
  needsReview?: boolean;
  note?: string;
};

export const ITEM_SUGGESTIONS: Record<string, ItemSuggestion> = {
  // dairy
  'burger': { needsReview: true, note: 'Not a dairy raw material — please confirm the right category.' },
  'cornflakes': { category: 'spices_seasonings', bengali: 'কর্নফ্লেক্স', emoji: '🌽', note: 'Also exists under Spices/Seasonings — merging into one category.' },
  'curd': { bengali: 'দই', emoji: '🥣' },
  'liquid cheese': { name: 'Liquid Cheese', bengali: 'তরল চিজ', emoji: '🧀' },
  'milk': { bengali: 'দুধ', emoji: '🥛' },
  'mozzarella cheese': { name: 'Mozzarella Cheese', bengali: 'মোজারেলা চিজ', emoji: '🧀' },
  'panner': { name: 'Paneer', bengali: 'পনির', emoji: '🧀', note: 'Spelling correction.' },
  'pinat': { name: 'Peanut', category: 'spices_seasonings', bengali: 'চিনাবাদাম', emoji: '🥜', note: 'Spelling correction + also filed under Spices/Seasonings — merging.' },
  'sweet corn': { category: 'spices_seasonings', bengali: 'সুইট কর্ন', emoji: '🌽', note: 'Not a dairy raw material — recategorized to Grocery & Dry Goods.' },

  // fresh_produce
  'garlic': { bengali: 'রসুন', emoji: '🧄' },
  'ginger': { bengali: 'আদা', emoji: '🫚' },
  'green colour': { category: 'spices_seasonings', bengali: 'সবুজ রং', emoji: '🎨', note: 'Food colouring, not fresh produce — also filed under Spices/Seasonings.' },
  'onion': { bengali: 'পেঁয়াজ', emoji: '🧅' },
  'onion leaves': { bengali: 'পেঁয়াজ পাতা', emoji: '🧅' },

  // orphaned category
  'packaging': { category: 'packaging', bengali: 'প্যাকেজিং', emoji: '📦', note: 'Was filed under an old/invalid category — recategorized.' },

  // packaging
  'bulk packaging': { bengali: 'বাল্ক প্যাকেজিং', emoji: '📦' },
  'foil': { bengali: 'ফয়েল', emoji: '🧻' },
  'fork': { bengali: 'কাঁটাচামচ', emoji: '🍴' },
  'soup glass': { bengali: 'স্যুপ গ্লাস', emoji: '🥤' },
  'spoon': { bengali: 'চামচ', emoji: '🥄' },
  'zip lock': { name: 'Zip Lock Bag', bengali: 'জিপ লক ব্যাগ', emoji: '🗜️' },

  // spices_seasonings
  'ararut': { name: 'Arrowroot', bengali: 'অ্যারারুট', emoji: '🌾', note: 'Spelling correction.' },
  'aromatic powder': { bengali: 'সুগন্ধি গুঁড়ো', emoji: '🌿' },
  'badam': { name: 'Almond (Badam)', bengali: 'বাদাম', emoji: '🌰' },
  'bimbar': { needsReview: true, note: 'Unrecognized term — please confirm what this is so it can be labelled correctly.' },
  'black salt': { bengali: 'বিট নুন', emoji: '🧂' },
  'campa cola': { name: 'Campa Cola', category: 'beverages', bengali: 'ক্যাম্পা কোলা', emoji: '🥤', note: 'Recategorized to Beverages.' },
  'chat masala': { bengali: 'চাট মশলা', emoji: '🌶️' },
  'chicken 65 masala': { bengali: 'চিকেন ৬৫ মশলা', emoji: '🌶️' },
  'chili chicken masala': { name: 'Chilli Chicken Masala', bengali: 'চিলি চিকেন মশলা', emoji: '🌶️', mergeInto: 'chilli chicken masala', note: 'Duplicate spelling of "Chilli Chicken Masala".' },
  'chilli chicken masala': { bengali: 'চিলি চিকেন মশলা', emoji: '🌶️' },
  'chilli flakes': { bengali: 'চিলি ফ্লেক্স', emoji: '🌶️' },
  'cumin': { bengali: 'জিরা', emoji: '🌿' },
  'delicious butter': { bengali: 'বাটার', emoji: '🧈' },
  'fresh cream': { bengali: 'ফ্রেশ ক্রিম', emoji: '🥛' },
  'green chilli sauce': { bengali: 'সবুজ কাঁচা লঙ্কার সস', emoji: '🌶️' },
  'haldi': { name: 'Turmeric Powder', bengali: 'হলুদ গুঁড়ো', emoji: '🟡', mergeInto: 'turmeric powder', note: 'Same as "Turmeric powder" (Hindi name for the same item) — automated similarity check couldn\'t catch this since the spellings are unrelated; found by manual review.' },
  'kashthori methi': { name: 'Kasuri Methi', bengali: 'কসুরী মেথি', emoji: '🌿', note: 'Spelling correction.' },
  'makhani gravy': { bengali: 'মাখানি গ্রেভি', emoji: '🍛' },
  'mayonnaise': { bengali: 'মেয়োনিজ', emoji: '🥫' },
  'mustard oil': { bengali: 'সরিষার তেল', emoji: '🫙' },
  'oil': { bengali: 'তেল', emoji: '🛢️' },
  'oregon': { name: 'Oregano', bengali: 'অরিগ্যানো', emoji: '🌿', note: 'Spelling correction.' },
  'red chilli': { bengali: 'লাল লঙ্কা', emoji: '🌶️' },
  'red chilli powder': { bengali: 'লাল লঙ্কার গুঁড়ো', emoji: '🌶️' },
  'red chilli sauce': { bengali: 'লাল লঙ্কার সস', emoji: '🌶️' },
  'red colour': { bengali: 'লাল রং', emoji: '🎨' },
  'sesame seeds': { bengali: 'তিল', emoji: '🌱' },
  'tandoori masala': { bengali: 'তন্দুরি মশলা', emoji: '🌶️' },
  'tomato sauce': { bengali: 'টমেটো সস', emoji: '🍅' },
  'tomato sauce sachet': { bengali: 'টমেটো সস স্যাশে', emoji: '🍅' },
  'turmeric powder': { bengali: 'হলুদ গুঁড়ো', emoji: '🟡' },

  // staff_essentials (legacy) — split across the 5 new categories
  'butter brush': { category: 'equipment_smallwares', bengali: 'বাটার ব্রাশ', emoji: '🖌️' },
  'cap': { category: 'staff_welfare_ppe', bengali: 'টুপি', emoji: '🧢' },
  'chocolates': { category: 'staff_welfare_ppe', bengali: 'চকোলেট', emoji: '🍫' },
  'coke': { name: 'Coca-Cola', category: 'beverages', bengali: 'কোকা কোলা', emoji: '🥤' },
  'cooling': { category: 'equipment_smallwares', needsReview: true, note: 'Unclear what this covers (AC service? cooling item?) — please clarify. Best-guess category filled in.' },
  'dastar': { category: 'staff_welfare_ppe', needsReview: true, note: 'Possibly the same as "Duster" (which would be Cleaning & Sanitation instead) — please confirm before merging.' },
  'dhup': { name: 'Incense Sticks (Dhup)', category: 'cleaning_sanitation', bengali: 'ধূপ', emoji: '🕯️' },
  'dish washer': { name: 'Dish Washing Liquid', category: 'cleaning_sanitation', bengali: 'বাসন মাজার লিকুইড', emoji: '🧽' },
  'duster': { category: 'cleaning_sanitation', bengali: 'ঝাড়ন', emoji: '🧹' },
  'equipment - microwave': { name: 'Microwave (Equipment)', category: 'equipment_smallwares', bengali: 'মাইক্রোওয়েভ', emoji: '📡' },
  'garbage bag': { category: 'cleaning_sanitation', bengali: 'আবর্জনার ব্যাগ', emoji: '🗑️' },
  'gloves': { category: 'staff_welfare_ppe', bengali: 'গ্লাভস', emoji: '🧤' },
  'jera drink': { name: 'Jeera Drink', category: 'beverages', bengali: 'জিরা পানীয়', emoji: '🥤', note: 'Spelling correction + recategorized to Beverages.' },
  'jharu': { name: 'Broom (Jharu)', category: 'cleaning_sanitation', bengali: 'ঝাড়ু', emoji: '🧹' },
  'kot rolls': { category: 'office_admin_supplies', bengali: 'কেওটি রোল', emoji: '🧾' },
  'marker': { category: 'office_admin_supplies', bengali: 'মার্কার', emoji: '🖊️' },
  'nirma': { name: 'Nirma (Detergent)', category: 'cleaning_sanitation', bengali: 'নির্মা', emoji: '🧼' },
  'protective gear': { category: 'staff_welfare_ppe', bengali: 'সুরক্ষা সরঞ্জাম', emoji: '🥽' },
  'sauce botol': { name: 'Sauce Bottle', category: 'equipment_smallwares', bengali: 'সস বোতল', emoji: '🍾', note: 'Spelling/translation correction + recategorized to Kitchen Equipment & Smallwares.' },
  'scotch brite': { name: 'Scotch-Brite (Scrub Pad)', category: 'cleaning_sanitation', bengali: 'স্কচ ব্রাইট', emoji: '🧽' },
};
