// Server copy: supabase/functions/make-server-c2dd9b9d/itemNames.ts (itemNames.test.ts checks they match).
// The same item under one name (owner, 31 Oct 2026: "if someone types a new item ... they might not
// put effort into remembering the right name ... it will create different names of same items").
// To 31 Oct, 5,689 expense entries had 52 extra names for 36 items: capitals (Toto / toto),
// misspellings (Panner, Ripido, Dastar, Makhni) and Bengali words (Cha for Tea). matchName finds
// the known item a typed name means: the app asks "Did you mean Paneer?" while typing, and the
// server files the entry under the known name when it is sure. Different things that share words
// (Tomato and Tomato Sauce, Butter and Butter brush, Carrot and Crate) are not matched.

export type KnownItem = { name: string; category?: string | null; type?: 'inventory' | 'overhead' | 'fixedcost' };
export type NameMatch = { item: KnownItem; how: 'same' | 'word' | 'spelling' };

// Bengali and Hindi words typed in English letters, as the whole word, to the English the list uses.
const WORDS: Record<string, string> = {
  cha: 'tea', chaa: 'tea', chai: 'tea',
  peyaj: 'onion', piyaj: 'onion', pyaj: 'onion', pyaaj: 'onion',
  alu: 'potato', aloo: 'potato',
  rosun: 'garlic', roshun: 'garlic', lahsun: 'garlic',
  ada: 'ginger', adrak: 'ginger',
  lebu: 'lemon', nimbu: 'lemon',
  dhone: 'coriander', dhania: 'coriander',
  bandhakopi: 'cabbage', badhakopi: 'cabbage', patta: 'cabbage',
  gajor: 'carrot', gajar: 'carrot',
  moyda: 'maida', maida: 'maida',
  chini: 'sugar', nun: 'salt', noon: 'salt', namak: 'salt',
  tel: 'oil', dudh: 'milk', doodh: 'milk', makhon: 'butter', makhan: 'butter',
  dim: 'egg', anda: 'egg', murgi: 'chicken', murga: 'chicken',
  balti: 'bucket', chaku: 'knife', chhuri: 'knife', jhadu: 'broom', jharu: 'broom',
  jol: 'water', jal: 'water', pani: 'water',
  jhul: 'cobweb',
};

// Counts and packing words that aren't part of the name: "2 pcs", "1 ta", "x2", "500 g".
const NOISE = /\b(?:\d+(?:\.\d+)?\s*(?:kg|kgs|g|gm|gms|grams?|l|ltr|litres?|liters?|ml|pcs?|pieces?|pics|pkts?|packets?|nos?|units?|ta|to|ti|ti)?|x\s*\d+|\d+\s*x|qty|ta|to|ti|cost)\b/g;

/** "  Paneer 2 kg (fresh) " -> "paneer"; "Breakfast Cost" -> "breakfast". */
export function nameKey(name: unknown): string {
  return String(name ?? '').toLowerCase()
    .replace(/\(.*?\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(NOISE, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** The key with Bengali / Hindi words in English: "cha" -> "tea", "dim" -> "egg". */
export const englishKey = (name: unknown) => nameKey(name).split(' ').map((w) => WORDS[w] || w).join(' ');

// The letters that carry a word's sound, for spelling slips: "panner" and "paneer" -> "pnr".
const skeleton = (k: string) => k.replace(/\s+/g, '').replace(/ph/g, 'f').replace(/ck/g, 'k').replace(/[aeiouy]/g, '').replace(/(.)\1+/g, '$1');

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}
const likeness = (a: string, b: string) => 1 - distance(a, b) / Math.max(a.length, b.length, 1);

/**
 * The known item a typed name means, or null. "same": only capitals, spacing or counts differ;
 * "word": a Bengali / Hindi word for it; "spelling": a slip (very alike, or the same sounds and
 * fairly alike). Names of 3 letters or fewer match only exactly.
 */
export function matchName(typed: unknown, known: KnownItem[]): NameMatch | null {
  const k = nameKey(typed);
  if (!k) return null;
  const e = englishKey(typed);
  let best: { item: KnownItem; how: NameMatch['how']; score: number } | null = null;
  for (const item of known) {
    const ik = nameKey(item.name);
    if (!ik) continue;
    if (ik === k) return { item, how: 'same' };
    if (englishKey(item.name) === e && e !== k) { best = best && best.score >= 2 ? best : { item, how: 'word', score: 2 }; continue; }
    if (k.length <= 3 || ik.length <= 3 || Math.abs(k.length - ik.length) > 3) continue;
    const like = likeness(k, ik);
    const sk = skeleton(k);
    const ok = like >= 0.8 || (like >= 0.6 && sk.length >= 3 && sk === skeleton(ik));
    if (ok && (!best || like > best.score)) best = { item, how: 'spelling', score: like };
  }
  return best ? { item: best.item, how: best.how } : null;
}
