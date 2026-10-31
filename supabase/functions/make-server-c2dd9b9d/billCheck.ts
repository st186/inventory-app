// Bill photos checked against the entry (owner, 1 Nov 2026: "lets validate the bills from now on for
// expenses"). Right after an expense with a bill photo is saved (or the photo is added later),
// Bunny reads the bill - total, date, seller, what was bought - and the entry is compared with it.
// Anything that doesn't agree becomes a flag like the others (expenseReview.ts): the bill says a
// different amount, it is an old bill, it is for something else, it isn't a bill at all, or the same
// bill is already on another entry.
//
//   bill-hash:{sha256}            the entry a bill photo was first used on
//   bill-seen:{seller}:{total}:{date}   the same, for the same bill photographed twice
import { askClaudeWithImages } from './insights.ts';

import { billProblems, type BillEntry, type BillProblem, type BillReading, type BillUse } from './billProblems.ts';
export type { BillEntry, BillProblem, BillReading, BillUse };

const BUCKET = 'expense-bills';

export const BILL_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['isBill', 'total', 'date', 'seller', 'items', 'matchesEntry', 'why'],
  properties: {
    isBill: { type: 'boolean' },
    total: { type: ['number', 'null'] },
    date: { type: ['string', 'null'] },
    seller: { type: ['string', 'null'] },
    items: { type: 'string' },
    matchesEntry: { type: 'boolean' },
    why: { type: 'string' },
  },
};

const SYSTEM = [
  'You read photos of bills, receipts and invoices from small shops and technicians in West Bengal, India: printed, handwritten, in English, Bengali or Hindi, often creased or at an angle.',
  'Give the grand total in rupees (the final amount to pay, after any discount), the bill date as YYYY-MM-DD (Indian bills write the day first: 01/11/26 is 1 Nov 2026), the seller or shop name, and a short list of what was bought.',
  'Use null for anything you cannot read with confidence; never guess a number.',
  'isBill is false only when the photo is not a bill or receipt at all (a person, a machine, a blank page, a screenshot of a chat).',
  'matchesEntry is false only when the bill is clearly for different things than the entry says (gas cylinder bill on a "tomato" entry); different words for the same thing, Bengali names and short forms all match.',
  'why: one short sentence on anything wrong, empty when all is fine.',
].join(' ');

const toBase64 = (bytes: Uint8Array) => {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
};

/** Reads the bill photo at `path` (the expense-bills bucket). The photo's fingerprint comes too, to
 *  spot the same photo on two entries. */
export async function readBill(kv: any, storage: any, path: string, entry: BillEntry): Promise<{ reading: BillReading; hash: string }> {
  const { data, error } = await storage.from(BUCKET).download(path);
  if (error || !data) throw new Error(`The bill photo could not be opened: ${error?.message || 'missing'}`);
  const bytes = new Uint8Array(await data.arrayBuffer());
  const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
  const ext = path.split('.').pop();
  const { data: reading } = await askClaudeWithImages(kv, {
    purpose: 'bill-check',
    user: { id: 'bill-check', isOwner: true },
    system: SYSTEM,
    text: `The entry this bill was attached to: ${JSON.stringify({ amount: entry.amount, date: entry.date, what: entry.what, category: entry.category })}`,
    images: [{ base64: toBase64(bytes), mediaType: ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg' }],
    schema: BILL_SCHEMA,
    maxTokens: 700,
  });
  return { reading: reading as BillReading, hash };
}

/** Reads the bill, notes where it was used, and says what doesn't agree. The reading is returned to
 *  be kept on the entry. Never throws: a bill that can't be read is just not checked. */
export async function checkBill(kv: any, storage: any, expenseId: string, path: string, entry: BillEntry): Promise<{ reading: BillReading | null; problems: BillProblem[] }> {
  try {
    const { reading, hash } = await readBill(kv, storage, path, entry);
    const use: BillUse = { expenseId, date: entry.date, what: entry.what, amount: entry.amount };
    const hashKey = `bill-hash:${hash}`;
    const seenKey = reading.seller && reading.total && reading.date
      ? `bill-seen:${reading.seller.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 30)}:${Math.round(reading.total)}:${reading.date}` : null;
    const before = ((await kv.get(hashKey)) as BillUse | null) || (seenKey ? ((await kv.get(seenKey)) as BillUse | null) : null);
    const usedBefore = before && before.expenseId !== expenseId ? before : null;
    if (!before) {
      await kv.set(hashKey, use);
      if (seenKey) await kv.set(seenKey, use);
    }
    return { reading, problems: billProblems(entry, reading, usedBefore) };
  } catch (error) {
    console.log('Bill check skipped:', error instanceof Error ? error.message : String(error));
    return { reading: null, problems: [] };
  }
}
