// The recipe sheets the production head fills in the app (owner, 27 Oct 2026): the 21 recipe
// sheets R-01..R-21 of the printed "How we do it today" workbook, with the ingredient lists
// from the SOP drafts (names only - no quantities: the quantities are what the three measured
// batches will tell us), Bengali and Hindi names, what to count and what to weigh per portion.
//
// Mirrored byte-for-byte at supabase/functions/make-server-c2dd9b9d/recipeCatalog.ts (the edge
// function can't import from src/): keep both copies identical. No imports.

export type Lang3 = { en: string; bn: string; hi: string };
export type Scale = 'S' | 'B'; // S = small digital scale, B = big 100 kg scale

export type IngredientDef = Lang3 & {
  id: string;
  scale: Scale; // the scale it is usually weighed on
  prepLoss?: boolean; // peeled / trimmed / squeezed: weigh it before too (gives the usable %)
  free?: boolean; // costs nothing (water)
  density?: number; // g per ml, for bills in litres (oil 0.92)
  component?: string; // the output of another sheet (chicken stuffing goes into chicken cheese)
  match?: { any: string[]; not?: string[] }; // purchase item names (regular expressions)
};

const I = (id: string, en: string, bn: string, hi: string, scale: Scale, rest: Partial<IngredientDef> = {}): IngredientDef =>
  ({ id, en, bn, hi, scale, ...rest });

export const INGREDIENTS: IngredientDef[] = [
  I('maida', 'Maida', 'ময়দা', 'मैदा', 'B', { match: { any: ['maida', 'refined flour', 'all purpose flour'] } }),
  I('water', 'Water', 'জল', 'पानी', 'S', { free: true }),
  I('salt', 'Salt', 'নুন', 'नमक', 'S', { match: { any: ['\\bsalt\\b', '\\bnun\\b', 'namak'], not: ['black salt', 'bit ?nun', 'beet ?nun', 'kala namak', 'rock', 'tasting'] } }),
  I('oil', 'Refined oil', 'সাদা তেল', 'रिफाइंड तेल', 'S', { density: 0.92, match: { any: ['\\boil\\b'], not: ['mustard', 'olive', 'sesame', 'chil+i oil', 'paper'] } }),
  I('cornflour', 'Corn flour', 'কর্ন ফ্লাওয়ার', 'कॉर्न फ्लोर', 'S', { match: { any: ['corn ?flour', 'corn ?starch'] } }),
  I('ararut', 'Ararut (arrowroot)', 'আরারুট', 'अरारोट', 'S', { match: { any: ['ararut', 'arrowroot', 'araroot'] } }),
  I('chillipowder', 'Red chilli powder', 'লঙ্কা গুঁড়ো', 'लाल मिर्च पाउडर', 'S', { match: { any: ['chil+i powder', 'mirch powder', 'lanka gu'] } }),
  I('c65', 'Chicken 65 masala', 'চিকেন ৬৫ মশলা', 'चिकन 65 मसाला', 'S', { match: { any: ['\\b65\\b'] } }),
  I('tandoori', 'Tandoori masala', 'তন্দুরি মশলা', 'तंदूरी मसाला', 'S', { match: { any: ['tandoori'] } }),
  I('pepper', 'Black pepper powder', 'গোলমরিচ গুঁড়ো', 'काली मिर्च पाउडर', 'S', { match: { any: ['black pepper', 'pepper powder', 'gol ?morich'], not: ['white'] } }),
  I('cornflakes', 'Cornflakes', 'কর্নফ্লেক্স', 'कॉर्नफ्लेक्स', 'S', { match: { any: ['corn ?flake'] } }),
  I('chilliflakes', 'Chilli flakes', 'চিলি ফ্লেক্স', 'चिली फ्लेक्स', 'S', { match: { any: ['chil+i flake'] } }),
  I('chicken', 'Chicken', 'চিকেন', 'चिकन', 'B', { match: { any: ['chicken'], not: ['masala', '\\b65\\b', 'sauce', 'stuffing', 'momo', 'powder', 'cube', 'seasoning'] } }),
  I('onion', 'Onion', 'পেঁয়াজ', 'प्याज़', 'B', { prepLoss: true, match: { any: ['onion', 'peyaj', 'piyaj'], not: ['powder', 'spring'] } }),
  I('butter', 'Butter', 'মাখন', 'मक्खन', 'S', { match: { any: ['butter'], not: ['paper', 'brush', 'milk', 'peanut'] } }),
  I('garlic', 'Garlic', 'রসুন', 'लहसुन', 'S', { prepLoss: true, match: { any: ['garlic', 'rosun', 'lahsun'], not: ['sauce', 'powder'] } }),
  I('ginger', 'Ginger', 'আদা', 'अदरक', 'S', { prepLoss: true, match: { any: ['ginger', '^ada\\b', 'adrak'], not: ['powder'] } }),
  I('gchilli', 'Green chilli', 'কাঁচা লঙ্কা', 'हरी मिर्च', 'S', { prepLoss: true, match: { any: ['green chil+i', 'kacha lanka', 'hari mirch'], not: ['sauce'] } }),
  I('coriander', 'Coriander leaves', 'ধনে পাতা', 'धनिया पत्ता', 'S', { prepLoss: true, match: { any: ['coriander', 'dhone', 'dhaniya', 'dhania'], not: ['powder', 'seed'] } }),
  I('aromatic', 'Aromatic powder', 'অ্যারোমেটিক পাউডার', 'एरोमैटिक पाउडर', 'S', { match: { any: ['aromatic'] } }),
  I('msg', 'Ajinomoto', 'আজিনোমোটো', 'अजीनोमोटो', 'S', { match: { any: ['ajinomoto', '\\bmsg\\b', 'tasting salt'] } }),
  I('sugar', 'Sugar', 'চিনি', 'चीनी', 'S', { match: { any: ['sugar', '^chini\\b'] } }),
  I('cheese', 'Cheese (block / mozzarella)', 'চিজ', 'चीज़', 'S', { match: { any: ['cheese', 'mozzarella'], not: ['liquid', 'sauce', 'spread', 'slice', 'dip'] } }),
  I('cabbage', 'Cabbage', 'বাঁধাকপি', 'पत्ता गोभी', 'B', { prepLoss: true, match: { any: ['cabbage', 'bandha ?kopi', 'bandhakopi'] } }),
  I('carrot', 'Carrot', 'গাজর', 'गाजर', 'S', { prepLoss: true, match: { any: ['carrot', 'gajar'] } }),
  I('capsicum', 'Capsicum', 'ক্যাপসিকাম', 'शिमला मिर्च', 'S', { prepLoss: true, match: { any: ['capsicum', 'bell pepper', 'shimla'] } }),
  I('corn', 'Sweet corn', 'সুইট কর্ন', 'स्वीट कॉर्न', 'S', { match: { any: ['sweet ?corn', 'corn kernel'], not: ['flake', 'flour', 'starch'] } }),
  I('liqcheese', 'Liquid cheese', 'লিকুইড চিজ', 'लिक्विड चीज़', 'S', { match: { any: ['liquid cheese', 'cheese sauce', 'cheese dip'] } }),
  I('mayo', 'Mayonnaise', 'মেয়োনিজ', 'मेयोनीज़', 'S', { match: { any: ['mayo'] } }),
  I('paneer', 'Paneer', 'পনির', 'पनीर', 'S', { match: { any: ['paneer', 'ponir'] } }),
  I('chaat', 'Chaat masala', 'চাট মশলা', 'चाट मसाला', 'S', { match: { any: ['chaat', 'chat masala'] } }),
  I('ketchup', 'Tomato ketchup', 'টমেটো সস', 'टोमैटो केचप', 'S', { match: { any: ['ketchup', 'tomato sauce'] } }),
  I('redchsauce', 'Red chilli sauce', 'রেড চিলি সস', 'रेड चिली सॉस', 'S', { match: { any: ['chil+i sauce'], not: ['green'] } }),
  I('drychilli', 'Dry red chilli', 'শুকনো লঙ্কা', 'सूखी लाल मिर्च', 'S', { match: { any: ['dry (red )?chil+i', '^red chil+i$', 'sh?ukno lanka'] } }),
  I('vinegar', 'Vinegar', 'ভিনেগার', 'सिरका', 'S', { match: { any: ['vinegar', 'sirka'] } }),
  I('greenchsauce', 'Green chilli sauce', 'গ্রিন চিলি সস', 'ग्रीन चिली सॉस', 'S', { match: { any: ['green chil+i sauce'] } }),
  I('pudina', 'Pudina (mint)', 'পুদিনা', 'पुदीना', 'S', { prepLoss: true, match: { any: ['pudina', '\\bmint\\b'] } }),
  I('lemonjuice', 'Lemon juice', 'লেবুর রস', 'नींबू का रस', 'S', { match: { any: ['lemon', 'lebu', 'nimbu'] } }),
  I('blacksalt', 'Black salt', 'বিট নুন', 'काला नमक', 'S', { match: { any: ['black salt', 'bit ?nun', 'beet ?nun', 'kala namak'] } }),
  I('soya', 'Soya sauce', 'সয়া সস', 'सोया सॉस', 'S', { match: { any: ['\\bsoy'] } }),
  I('sesame', 'Sesame seeds (til)', 'সাদা তিল', 'सफ़ेद तिल', 'S', { match: { any: ['sesame', '\\btil\\b'], not: ['oil'] } }),
  I('cream', 'Fresh cream', 'ফ্রেশ ক্রিম', 'फ्रेश क्रीम', 'S', { match: { any: ['cream'], not: ['ice ?cream', 'cheese', 'biscuit'] } }),
  I('makhni', 'Makhani gravy premix', 'মাখনি প্রিমিক্স', 'मखनी प्रीमिक्स', 'S', { match: { any: ['makhani', 'makhni'] } }),
  I('peripowder', 'Peri peri masala', 'পেরি পেরি মশলা', 'पेरी पेरी मसाला', 'S', { match: { any: ['peri'] } }),
  I('st_chicken', 'Chicken stuffing (from R-04)', 'চিকেনের পুর (R-04 থেকে)', 'चिकन भरावन (R-04 से)', 'B', { component: 'st_chicken' }),
  I('st_veg', 'Veg stuffing (from R-06)', 'ভেজের পুর (R-06 থেকে)', 'वेज भरावन (R-06 से)', 'B', { component: 'st_veg' }),
];

export const INGREDIENT_BY_ID: Record<string, IngredientDef> = Object.fromEntries(INGREDIENTS.map((i) => [i.id, i]));

export type SheetGroup = 'dough' | 'stuffing' | 'dip' | 'sauce' | 'soup';
export type SheetKind = 'dough' | 'batter' | 'coating' | 'stuffing' | 'sauce' | 'premix' | 'seasoning';
// What one portion is and how it is weighed: 10 dough balls / 10 scoops one by one, or the same
// 10 momos before and after the batter (or coating) - the difference is the pick-up per momo.
export type PortionMode = 'samples' | 'pickup' | null;

export type SheetDef = Lang3 & {
  id: string;
  code: string;
  group: SheetGroup;
  kind: SheetKind;
  ingredients: string[];
  portion: PortionMode;
  momoTypes?: string[]; // fillings: the momo types this stuffing fills
};

const S = (id: string, code: string, group: SheetGroup, kind: SheetKind, en: string, bn: string, hi: string, ingredients: string[], extra: Partial<SheetDef> = {}): SheetDef => ({
  id, code, group, kind, en, bn, hi, ingredients,
  portion: kind === 'dough' || kind === 'stuffing' ? 'samples' : kind === 'batter' || kind === 'coating' ? 'pickup' : null,
  ...extra,
});

export const SHEETS: SheetDef[] = [
  S('dough', 'R-01', 'dough', 'dough', 'Momo dough', 'মোমোর ডো (ময়দা মাখা)', 'मोमो का गूंधा आटा', ['maida', 'water', 'salt', 'oil']),
  S('batter', 'R-02', 'dough', 'batter', 'Kurkure batter', 'কুরকুরে ব্যাটার', 'कुरकुरे बैटर', ['maida', 'cornflour', 'ararut', 'salt', 'chillipowder', 'c65', 'tandoori', 'pepper', 'water']),
  S('coating', 'R-03', 'dough', 'coating', 'Kurkure coating (cornflakes)', 'কুরকুরে কোটিং (কর্নফ্লেক্স)', 'कुरकुरे कोटिंग (कॉर्नफ्लेक्स)', ['cornflakes', 'maida', 'chilliflakes', 'salt', 'pepper']),
  S('st_chicken', 'R-04', 'stuffing', 'stuffing', 'Chicken stuffing', 'চিকেনের পুর', 'चिकन भरावन', ['chicken', 'onion', 'butter', 'garlic', 'ginger', 'gchilli', 'coriander', 'salt', 'aromatic', 'msg', 'pepper', 'sugar'], { momoTypes: ['chicken'] }),
  S('st_chicken_cheese', 'R-05', 'stuffing', 'stuffing', 'Chicken cheese stuffing', 'চিকেন চিজের পুর', 'चिकन चीज़ भरावन', ['st_chicken', 'cheese'], { momoTypes: ['chickenCheese'] }),
  S('st_veg', 'R-06', 'stuffing', 'stuffing', 'Veg stuffing', 'ভেজের পুর', 'वेज भरावन', ['cabbage', 'carrot', 'onion', 'butter', 'garlic', 'ginger', 'gchilli', 'coriander', 'salt', 'aromatic', 'msg', 'pepper', 'sugar'], { momoTypes: ['veg'] }),
  S('st_cheese_corn', 'R-07', 'stuffing', 'stuffing', 'Cheese corn stuffing', 'চিজ কর্নের পুর', 'चीज़ कॉर्न भरावन', ['corn', 'cheese', 'liqcheese', 'onion', 'capsicum', 'mayo', 'butter', 'gchilli', 'coriander', 'salt', 'pepper', 'chilliflakes', 'sugar'], { momoTypes: ['cheeseCorn'] }),
  S('st_paneer', 'R-08', 'stuffing', 'stuffing', 'Paneer stuffing', 'পনিরের পুর', 'पनीर भरावन', ['paneer', 'onion', 'cabbage', 'capsicum', 'carrot', 'butter', 'gchilli', 'coriander', 'ginger', 'garlic', 'salt', 'msg', 'aromatic', 'pepper', 'chaat', 'sugar'], { momoTypes: ['paneer'] }),
  S('st_veg_kurkure', 'R-09', 'stuffing', 'stuffing', 'Veg kurkure stuffing', 'ভেজ কুরকুরের পুর', 'वेज कुरकुरे भरावन', ['st_veg', 'gchilli', 'chilliflakes'], { momoTypes: ['vegKurkure'] }),
  S('st_chicken_kurkure', 'R-10', 'stuffing', 'stuffing', 'Chicken kurkure stuffing', 'চিকেন কুরকুরের পুর', 'चिकन कुरकुरे भरावन', ['st_chicken', 'gchilli', 'c65'], { momoTypes: ['chickenKurkure'] }),
  S('red_chutney', 'R-11', 'dip', 'sauce', 'Spicy red chutney', 'ঝাল লাল চাটনি', 'तीखी लाल चटनी', ['ketchup', 'redchsauce', 'drychilli', 'chillipowder', 'garlic', 'ginger', 'sugar', 'salt', 'vinegar', 'oil', 'msg', 'water']),
  S('green_chutney', 'R-12', 'dip', 'sauce', 'Green mayo chutney', 'সবুজ মেয়ো চাটনি', 'हरी मेयो चटनी', ['mayo', 'coriander', 'pudina', 'gchilli', 'garlic', 'ginger', 'greenchsauce', 'lemonjuice', 'salt', 'blacksalt', 'sugar', 'chaat', 'water']),
  S('panfried_sauce', 'R-13', 'sauce', 'sauce', 'Pan-fried sauce', 'প্যান-ফ্রায়েড সস', 'पैन-फ्राइड सॉस', ['water', 'ketchup', 'redchsauce', 'soya', 'vinegar', 'garlic', 'ginger', 'gchilli', 'onion', 'sugar', 'salt', 'msg', 'aromatic', 'pepper', 'chillipowder', 'oil', 'ararut', 'cornflour']),
  S('hotgarlic_sauce', 'R-14', 'sauce', 'sauce', 'Hot garlic sauce', 'হট গার্লিক সস', 'हॉट गार्लिक सॉस', ['garlic', 'chillipowder', 'chilliflakes', 'redchsauce', 'ketchup', 'soya', 'vinegar', 'sugar', 'salt', 'msg', 'oil', 'water', 'ararut', 'onion']),
  S('korean_sauce', 'R-15', 'sauce', 'sauce', 'Spicy Korean sauce', 'স্পাইসি কোরিয়ান সস', 'स्पाइसी कोरियन सॉस', ['chillipowder', 'chilliflakes', 'redchsauce', 'ketchup', 'soya', 'sugar', 'garlic', 'ginger', 'vinegar', 'sesame', 'oil', 'water', 'ararut', 'salt', 'msg']),
  S('chilli_sauce', 'R-16', 'sauce', 'sauce', 'Chilli chicken sauce', 'চিলি চিকেন সস', 'चिली चिकन सॉस', ['greenchsauce', 'redchsauce', 'soya', 'ketchup', 'vinegar', 'garlic', 'ginger', 'gchilli', 'sugar', 'salt', 'msg', 'pepper', 'aromatic', 'oil', 'water', 'ararut']),
  S('afghani_sauce', 'R-17', 'sauce', 'sauce', 'Afghani / tandoori sauce', 'আফগানি / তন্দুরি সস', 'अफ़गानी / तंदूरी सॉस', ['mayo', 'liqcheese', 'cream', 'butter', 'water', 'garlic', 'gchilli', 'ginger', 'tandoori', 'pepper', 'salt', 'sugar', 'coriander', 'ararut']),
  S('makhani_sauce', 'R-18', 'sauce', 'sauce', 'Butter makhani sauce', 'বাটার মাখনি সস', 'बटर मखनी सॉस', ['makhni', 'water', 'butter', 'cream', 'ketchup', 'sugar', 'chillipowder', 'salt']),
  S('jhol_gravy', 'R-19', 'sauce', 'sauce', 'Jhol gravy', 'ঝোল গ্রেভি', 'झोल ग्रेवी', ['water', 'onion', 'garlic', 'ginger', 'drychilli', 'gchilli', 'sesame', 'ketchup', 'coriander', 'oil', 'salt', 'sugar', 'pepper', 'lemonjuice', 'msg']),
  S('soup_premix', 'R-20', 'soup', 'premix', 'Soup premix', 'স্যুপ প্রিমিক্স', 'सूप प्रीमिक्स', ['water', 'onion', 'cabbage', 'carrot', 'garlic', 'ginger', 'gchilli', 'coriander', 'salt', 'msg', 'aromatic', 'pepper', 'sugar', 'butter', 'oil']),
  S('peri_peri', 'R-21', 'soup', 'seasoning', 'Peri peri seasoning', 'পেরি পেরি মশলা', 'पेरी पेरी मसाला', ['peripowder']),
];

export const SHEET_BY_ID: Record<string, SheetDef> = Object.fromEntries(SHEETS.map((s) => [s.id, s]));

// The scale an ingredient starts on in a sheet: the big scale only for the sacks and crates of
// the big batches (dough, stuffings); 100 g of maida in the coating goes on the small one.
export const defaultScale = (sheet: SheetDef, ing: IngredientDef): Scale =>
  ing.scale === 'B' && (sheet.kind === 'dough' || sheet.kind === 'stuffing') ? 'B' : 'S';

export const GROUPS: (Lang3 & { id: SheetGroup })[] = [
  { id: 'dough', en: 'Dough and kurkure coat', bn: 'ডো ও কুরকুরে কোট', hi: 'आटा और कुरकुरे कोट' },
  { id: 'stuffing', en: 'Stuffings', bn: 'পুর', hi: 'भरावन' },
  { id: 'dip', en: 'Dips', bn: 'চাটনি', hi: 'चटनी' },
  { id: 'sauce', en: 'Toss sauces and gravies', bn: 'সস ও গ্রেভি', hi: 'सॉस और ग्रेवी' },
  { id: 'soup', en: 'Soup and seasoning', bn: 'স্যুপ ও মশলা', hi: 'सूप और मसाला' },
];

// The momo types the app counts (src/constants/momoTypes.ts inventory keys), with the stuffing
// each one is filled with. Kurkure momos are also battered and coated.
export type MomoTypeDef = Lang3 & { key: string; filling: string; kurkure: boolean };
export const MOMO_TYPES: MomoTypeDef[] = [
  { key: 'chicken', filling: 'st_chicken', kurkure: false, en: 'Chicken momo', bn: 'চিকেন মোমো', hi: 'चिकन मोमो' },
  { key: 'chickenCheese', filling: 'st_chicken_cheese', kurkure: false, en: 'Chicken cheese momo', bn: 'চিকেন চিজ মোমো', hi: 'चिकन चीज़ मोमो' },
  { key: 'veg', filling: 'st_veg', kurkure: false, en: 'Veg momo', bn: 'ভেজ মোমো', hi: 'वेज मोमो' },
  { key: 'cheeseCorn', filling: 'st_cheese_corn', kurkure: false, en: 'Cheese corn momo', bn: 'চিজ কর্ন মোমো', hi: 'चीज़ कॉर्न मोमो' },
  { key: 'paneer', filling: 'st_paneer', kurkure: false, en: 'Paneer momo', bn: 'পনির মোমো', hi: 'पनीर मोमो' },
  { key: 'vegKurkure', filling: 'st_veg_kurkure', kurkure: true, en: 'Veg kurkure momo', bn: 'ভেজ কুরকুরে মোমো', hi: 'वेज कुरकुरे मोमो' },
  { key: 'chickenKurkure', filling: 'st_chicken_kurkure', kurkure: true, en: 'Chicken kurkure momo', bn: 'চিকেন কুরকুরে মোমো', hi: 'चिकन कुरकुरे मोमो' },
];

// A short instruction per kind of sheet, read before starting (the production head reads Bengali).
export const HOW_TO: Record<SheetKind, Lang3> = {
  dough: {
    en: 'Make it the way you always do. Weigh the maida, water, salt and oil before they go in. At the end weigh the dough, count the balls, and weigh 10 balls one by one.',
    bn: 'যেভাবে রোজ বানান, সেভাবেই বানান। ময়দা, জল, নুন, তেল দেওয়ার আগে ওজন করুন। শেষে ডো-র ওজন করুন, কটা বল হলো গুনুন, আর ১০টা বল একটা একটা করে ওজন করুন।',
    hi: 'जैसे रोज़ बनाते हैं वैसे ही बनाइए। मैदा, पानी, नमक और तेल डालने से पहले तौलें। आख़िर में आटा तौलें, लोइयाँ गिनें, और 10 लोइयाँ एक-एक करके तौलें।',
  },
  batter: {
    en: 'Weigh every ingredient before it goes in, and the finished batter. Weigh 10 momos before the batter and the same 10 after.',
    bn: 'প্রতিটা উপকরণ দেওয়ার আগে ওজন করুন, তৈরি ব্যাটারও। ১০টা মোমো ব্যাটারের আগে আর সেই ১০টাই ব্যাটারের পরে ওজন করুন।',
    hi: 'हर सामग्री डालने से पहले तौलें, और तैयार बैटर भी। 10 मोमो बैटर से पहले और वही 10 बैटर के बाद तौलें।',
  },
  coating: {
    en: 'Weigh every ingredient and the finished coating. Weigh 10 battered momos before coating and the same 10 after.',
    bn: 'প্রতিটা উপকরণ আর তৈরি কোটিং ওজন করুন। ১০টা ব্যাটার-দেওয়া মোমো কোটিংয়ের আগে আর সেই ১০টাই কোটিংয়ের পরে ওজন করুন।',
    hi: 'हर सामग्री और तैयार कोटिंग तौलें। बैटर लगे 10 मोमो कोटिंग से पहले और वही 10 कोटिंग के बाद तौलें।',
  },
  stuffing: {
    en: 'Make it the way you always do. Weigh every ingredient before it goes in (vegetables before and after peeling). Weigh the finished stuffing. While folding, weigh 10 scoops one by one and count the momos it filled.',
    bn: 'যেভাবে রোজ বানান, সেভাবেই বানান। প্রতিটা উপকরণ দেওয়ার আগে ওজন করুন (সবজি খোসা ছাড়ানোর আগে ও পরে)। তৈরি পুরের ওজন করুন। ভাঁজের সময় ১০ চামচ পুর একটা একটা করে ওজন করুন, আর কটা মোমো হলো গুনুন।',
    hi: 'जैसे रोज़ बनाते हैं वैसे ही बनाइए। हर सामग्री डालने से पहले तौलें (सब्ज़ी छीलने से पहले और बाद में)। तैयार भरावन तौलें। मोड़ते समय 10 चम्मच एक-एक करके तौलें और गिनें कितने मोमो भरे।',
  },
  sauce: {
    en: 'Weigh the empty pot first. Weigh every ingredient before it goes in (water too: 1 litre = 1 kg). At the end weigh the full pot and count the tubs or packs.',
    bn: 'আগে খালি পাত্রের ওজন করুন। প্রতিটা উপকরণ দেওয়ার আগে ওজন করুন (জলও: ১ লিটার = ১ কেজি)। শেষে ভরা পাত্রের ওজন করুন, কটা টাব বা প্যাক হলো গুনুন।',
    hi: 'पहले ख़ाली बर्तन तौलें। हर सामग्री डालने से पहले तौलें (पानी भी: 1 लीटर = 1 किलो)। आख़िर में भरा बर्तन तौलें और टब या पैक गिनें।',
  },
  premix: {
    en: 'Weigh the empty pot first, then every ingredient (water too). At the end weigh the full pot, count the packs, and write how much water the store adds to one pack.',
    bn: 'আগে খালি পাত্র, তারপর প্রতিটা উপকরণ ওজন করুন (জলও)। শেষে ভরা পাত্রের ওজন করুন, কটা প্যাক হলো গুনুন, আর দোকানে এক প্যাকে কত জল দেয় লিখুন।',
    hi: 'पहले ख़ाली बर्तन, फिर हर सामग्री तौलें (पानी भी)। आख़िर में भरा बर्तन तौलें, पैक गिनें, और लिखें कि दुकान एक पैक में कितना पानी डालती है।',
  },
  seasoning: {
    en: 'Weigh the bought masala and anything mixed into it. Count the packs and weigh one pack.',
    bn: 'কেনা মশলা আর তাতে যা মেশান তা ওজন করুন। কটা প্যাক হলো গুনুন, আর একটা প্যাকের ওজন করুন।',
    hi: 'ख़रीदा मसाला और उसमें जो मिलाते हैं, तौलें। पैक गिनें और एक पैक तौलें।',
  },
};

// What to count at the end of a batch.
export const COUNT_LABEL: Record<SheetKind, Lang3> = {
  dough: { en: 'Dough balls made', bn: 'কটা ডো বল হলো', hi: 'कितनी लोइयाँ बनीं' },
  batter: { en: 'Momos it coated', bn: 'কটা মোমোতে লাগল', hi: 'कितने मोमो पर लगा' },
  coating: { en: 'Momos it coated', bn: 'কটা মোমোতে লাগল', hi: 'कितने मोमो पर लगा' },
  stuffing: { en: 'Momos this stuffing filled', bn: 'কতগুলো মোমো হলো', hi: 'कितने मोमो भरे' },
  sauce: { en: 'Tubs or packs made', bn: 'কটা টাব / প্যাক হলো', hi: 'कितने टब / पैक बने' },
  premix: { en: 'Packs made', bn: 'কটা প্যাক হলো', hi: 'कितने पैक बने' },
  seasoning: { en: 'Packs made', bn: 'কটা প্যাক হলো', hi: 'कितने पैक बने' },
};
