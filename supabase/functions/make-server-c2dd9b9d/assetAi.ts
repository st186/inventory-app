// Bunny reads purchase names the equipment keywords can't judge and says which are equipment for
// the place's list (owner, 31 Oct 2026: "have an AI to detect if a purchase can be added to the
// potential equipment and asset list of that store/production"). Names are Bengali or Hindi words
// typed in English letters as often as not: "hata" is a ladle, "jhul jhara lathi" a cobweb stick.
// The rule given: equipment is a durable thing used again and again for months; what is used up or
// worn out within weeks is not (a wire brush, a sponge, gloves).
//
//   asset-ai:{aiNameKey}   { name, equipment, category, why, at, model }   one answer per name, kept
//
// assets.ts asks before each reconcile, for names since the register started that have no answer
// yet (at most MAX_PER_RUN a run; a few when it runs as someone opens the list, so it stays quick),
// and passes every kept answer to planReconcile. Bunny failing
// never stops the reconcile: the names wait for the next run.
import { askClaudeForJson } from './insights.ts';
import { ASSET_CATEGORIES, ASSET_CATEGORY_KEYS, aiNameKey, askableForAi, expenseName, type AiVerdict, type ExpensePrefix } from './assetRules.ts';

type Kv = { set: (key: string, value: any) => Promise<any> };
const PREFIX = 'asset-ai:';
const MAX_PER_RUN = 40;

const SYSTEM = [
  'You sort purchases for a small momo shop and its production kitchen in West Bengal, India.',
  'Names are often Bengali or Hindi words typed in English letters, and often misspelled (hata = ladle, jhara = strainer, jhul jhara lathi = cobweb brush on a stick, balti = bucket, tar brush = wire brush).',
  'For each purchase, say whether it belongs on the place\'s equipment list: a durable thing used again and again for months, worth counting every 3 months - a pan, ladle, knife, bucket, bin, rack, scale, broom stick, cobweb brush, steamer, fan.',
  'Not equipment: things used up or worn out within weeks (cleaning liquids, powders, sponges, scrubbers, wire brushes, gloves, foil, bags, tissue), food, packaging, services, repairs and rent.',
  'The price for one is a hint: under Rs 50 is rarely equipment. When unsure, say false.',
  'category: the closest list category. why: a few plain words.',
].join(' ');

/** Every kept answer, by name key. */
export async function keptVerdicts(getAllByPrefix: (prefix: string) => Promise<any[]>): Promise<Map<string, AiVerdict>> {
  const rows = await getAllByPrefix(PREFIX);
  return new Map((rows || []).filter((r: any) => r?.key).map((r: any) => [r.key, { equipment: !!r.equipment, category: r.category || null, why: r.why || '' }]));
}

/** Asks Bunny about names since `fromDate` that have no answer yet; adds the answers to `known`. */
export async function askAboutNewNames(kv: Kv, rows: { row: any; prefix: ExpensePrefix }[], known: Map<string, AiVerdict>, fromDate: string, max = MAX_PER_RUN): Promise<number> {
  const fresh = new Map<string, { name: string; category: string; each: number }>();
  for (const { row, prefix } of rows) {
    if (String(row?.date || '') < fromDate || !askableForAi(row, prefix)) continue;
    const name = expenseName(row, prefix);
    const key = aiNameKey(name);
    if (known.has(key) || fresh.has(key)) continue;
    const amount = Number(prefix === 'inventory' ? row.totalCost : row.amount) || 0;
    const qty = prefix === 'inventory' ? Number(row.quantity) || 1 : 1;
    fresh.set(key, { name, category: String(row.category || ''), each: Math.round(amount / Math.max(1, qty)) });
    if (fresh.size >= max) break;
  }
  if (!fresh.size) return 0;
  const items = [...fresh.entries()].map(([key, f], i) => ({ i, name: f.name, filedUnder: f.category, rupeesEach: f.each, key }));
  const { data, model } = await askClaudeForJson(kv as any, {
    purpose: 'asset-ai',
    user: { id: 'asset-ai', isOwner: true },
    system: SYSTEM,
    prompt: JSON.stringify({ categories: Object.fromEntries(ASSET_CATEGORIES.map((c) => [c.key, c.label])), purchases: items.map(({ key: _k, ...rest }) => rest) }),
    schema: {
      type: 'object', additionalProperties: false, required: ['items'],
      properties: {
        items: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false, required: ['i', 'equipment', 'category', 'why'],
            properties: { i: { type: 'integer' }, equipment: { type: 'boolean' }, category: { type: 'string', enum: ASSET_CATEGORY_KEYS }, why: { type: 'string' } },
          },
        },
      },
    },
    maxTokens: 2500,
  });
  const at = new Date().toISOString();
  let saved = 0;
  for (const a of data?.items || []) {
    const item = items[Number(a?.i)];
    if (!item) continue;
    const verdict: AiVerdict = { equipment: !!a.equipment, category: ASSET_CATEGORY_KEYS.includes(a.category) ? a.category : null, why: String(a.why || '').slice(0, 200) };
    await kv.set(`${PREFIX}${item.key}`, { key: item.key, name: item.name, ...verdict, at, model });
    known.set(item.key, verdict);
    saved++;
  }
  return saved;
}
