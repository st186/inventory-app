// Insights: festival calendar, demand forecast and the Claude-written parts (daily brief,
// weekly growth ideas, calendar draft, "Ask Bunny" chat). Registered from index.ts.
//
// The forecast itself is plain statistics (forecast.ts, shared with the app); Claude only
// writes on top of it. Only sales totals, momo counts, events, wastage, stock-outs, requests,
// production counts and expense totals by category go to Claude - never salaries, Aadhaar,
// phone numbers or other personal details.
//
// Needs the ANTHROPIC_API_KEY secret. AI_MODEL (default claude-haiku-5-5, the cheapest) and
// AI_MONTHLY_CAP_INR (default 1000) are optional secrets.

import Anthropic from 'npm:@anthropic-ai/sdk';
import { addDaysISO as eventDay, STAFF_WINDOW_AFTER_DAYS, STAFF_WINDOW_BEFORE_DAYS } from './eventRules.ts';
import { BIG_BUY_REASONS } from './bigBuyReasons.ts';
import { buildOnlineCostIndex, onlineCostsForRange, type Aggregator } from './onlineCosts.ts';
import {
  FORECAST_TYPES, forecastDays, learnEffects, prepareHistory, addDaysISO, weekdayOf, WEEKDAY_SHORT,
  backtest, summarizeAccuracy, tuneSettings, roundUpToBag,
  type CalendarEvent, type DayEffect, type DayRecord, type MomoKey, type ForecastSettings,
} from './forecast.ts';

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  del: (key: string) => Promise<any>;
  getByPrefix: <T = any>(prefix: string) => Promise<T[]>;
  // Paginated prefix read (plain getByPrefix stops at 1000 rows; purchases are past 4,000).
  getAllByPrefix?: (prefix: string) => Promise<any[]>;
};
type Deps = {
  kv: Kv;
  verifyUser: (authHeader: string | null) => Promise<any>;
  getTodayIST: () => string;
  // Push + in-app notification to every cluster head; returns how many were sent.
  notifyClusterHeads?: (type: string, title: string, message: string, relatedDate?: string) => Promise<number>;
};

const allRows = (deps: Deps, prefix: string) => (deps.kv.getAllByPrefix ? deps.kv.getAllByPrefix(prefix) : deps.kv.getByPrefix<any>(prefix));

// Haiku by default (owner, 27 Oct 2026): about 40x cheaper than Opus. Set the AI_MODEL secret
// to claude-sonnet-5-5 or claude-opus-5-5 for better writing at higher cost.
const AI_MODEL = Deno.env.get('AI_MODEL') || 'claude-haiku-5-5';
// Monthly AI spend limit: ₹1,000 (owner, 27 Oct 2026). Spend is logged in dollars, so the
// limit is converted at about ₹88 to the dollar. The AI_MONTHLY_CAP_INR secret overrides it.
const USD_TO_INR = 88;
const AI_MONTHLY_CAP_INR = Number(Deno.env.get('AI_MONTHLY_CAP_INR') || '1000');
const AI_MONTHLY_CAP_USD = AI_MONTHLY_CAP_INR / USD_TO_INR;
// $ per million tokens: input, output, cache read. Cache writes cost 1.25x input.
const PRICES: Record<string, [number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
};
// Web searches are billed on top of tokens: $10 per 1,000.
const WEB_SEARCH_USD = 0.01;
// Server-side refusal fallback: Opus and Sonnet only (Haiku has none).
const SUPPORTS_FALLBACK = /opus|sonnet|fable/.test(AI_MODEL);
// The dynamic-filtering web search is documented for Opus and Sonnet; Haiku gets the basic one.
const WEB_SEARCH_TOOL = /haiku/.test(AI_MODEL) ? 'web_search_20250305' : 'web_search_20260209';
// Invoice scanning: on (owner, 27 Oct 2026). It was switched off at about ₹3 a bill on Opus;
// on Haiku the same scan is about ₹0.03. Set the AI_INVOICE_SCAN secret to "off" to stop it.
const INVOICE_SCAN_ON = Deno.env.get('AI_INVOICE_SCAN') !== 'off';

const EFFECTS: DayEffect[] = ['normal', 'closed', 'low_nonveg', 'busy', 'quiet'];

// How costs count in profit - mirrors src/utils/inventoryData.ts (SPREAD_MONTHS, SPREAD_DAYS,
// FINANCING_KEYS, INVENTORY_CATEGORIES). Keep the two in step.
const SPREAD_MONTHS: Record<string, number> = { asset_kitchen_equipment: 36, asset_furniture: 36, asset_electrical: 36, asset_vehicle: 36, software_subscription: 12 };
const SPREAD_DAYS: Record<string, number> = { packaging_bulk: 120 };
const FINANCING_CATEGORIES = new Set(['vehicle_emi']);
const CATEGORY_ALIASES: Record<string, string> = { equipment_smallwares: 'asset_kitchen_equipment', equipments: 'asset_kitchen_equipment' };
const FOOD_CATEGORIES = new Set(['fresh_produce', 'staples', 'spices_seasonings', 'bread_buns', 'dairy', 'meat', 'packaging', 'packaging_bulk', 'beverages']);

// The part of a purchase spread evenly over `spanDays` from its date that falls inside [from, to].
function spreadShare(amount: number, date: string, spanDays: number, from: string, to: string) {
  const day = 86400000;
  const start = Date.parse(`${date}T00:00:00Z`);
  const end = start + spanDays * day;
  const a = Math.max(start, Date.parse(`${from}T00:00:00Z`));
  const b = Math.min(end, Date.parse(`${to}T00:00:00Z`) + day);
  return b > a ? amount * ((b - a) / day) / spanDays : 0;
}
const PRODUCTION_KEYS: Record<string, MomoKey> = {
  chickenMomos: 'chicken', chickenCheeseMomos: 'chickenCheese', vegMomos: 'veg', cheeseCornMomos: 'cheeseCorn',
  paneerMomos: 'paneer', vegKurkureMomos: 'vegKurkure', chickenKurkureMomos: 'chickenKurkure',
};

const istDay = (iso: string) => new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10);
const inr = (n: number) => `Rs ${Math.round(n).toLocaleString('en-IN')}`;

async function actorOf(kv: Kv, authResult: any) {
  const meta = authResult.user.user_metadata || {};
  const employee = meta.employeeId ? await kv.get<any>(`unified-employee:${meta.employeeId}`) : null;
  const role = meta.role;
  const designation = employee?.designation || meta.designation || null;
  const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
  return {
    name: employee?.name || meta.name || authResult.user.email,
    id: meta.employeeId || authResult.user.email,
    userId: authResult.user.id as string,
    storeId: (meta.storeId as string) || null,
    role,
    designation,
    // Owner side: may run the AI features and edit the calendar.
    canManage: role === 'cluster_head' || isOperationsManager,
    canView: role === 'cluster_head' || role === 'manager' || role === 'audit',
  };
}

const aiUser = (actor: { userId: string; role: string }): AiUser => ({ id: actor.userId, isOwner: actor.role === 'cluster_head' });

// ---------------- Data ----------------

async function loadEvents(kv: Kv): Promise<CalendarEvent[]> {
  const rows = await kv.getByPrefix<any>('store-calendar:');
  return (rows || []).filter((e) => e?.date && EFFECTS.includes(e.effect)).sort((a, b) => a.date.localeCompare(b.date));
}

const stockOutType = (item: string): MomoKey | null => {
  const lower = String(item || '').toLowerCase();
  const match = [...FORECAST_TYPES].sort((a, b) => b.label.length - a.label.length).find((t) => lower.startsWith(`${t.label.toLowerCase()} momo`));
  return match ? match.key : null;
};

// Daily revenue (counter + POS online) and momos sold per type, for one store or all stores.
async function loadDays(kv: Kv, storeId: string | null, from: string, to: string): Promise<DayRecord[]> {
  const [sales, salesData, stockOuts] = await Promise.all([
    kv.getAllByPrefix ? kv.getAllByPrefix('sales:') : kv.getByPrefix<any>('sales:'),
    kv.getAllByPrefix ? kv.getAllByPrefix('sales_data_') : kv.getByPrefix<any>('sales_data_'),
    kv.getByPrefix<any>(storeId ? `stock-out:${storeId}:` : 'stock-out:'),
  ]);
  const inScope = (r: any) => r?.date && r.date >= from && r.date <= to && (!storeId || r.storeId === storeId);
  const days = new Map<string, DayRecord>();
  const day = (date: string) => {
    if (!days.has(date)) days.set(date, { date, revenue: null, pieces: null, stockedOut: [] });
    return days.get(date)!;
  };
  for (const s of (sales || []).filter(inScope)) {
    const d = day(s.date);
    d.revenue = (d.revenue || 0) + (Number(s.offlineSales) || 0) + (Number(s.posOnlineSales) || 0);
  }
  // One sales-data record per store and day: the POS sync's when there is one.
  const pick = new Map<string, any>();
  for (const r of (salesData || []).filter(inScope)) {
    const k = `${r.storeId}|${r.date}`;
    const prev = pick.get(k);
    if (!prev || (r.uploadedBy === 'pos-sync' && prev.uploadedBy !== 'pos-sync')) pick.set(k, r);
  }
  for (const r of pick.values()) {
    const d = day(r.date);
    const pieces = (d.pieces || {}) as Partial<Record<MomoKey, number>>;
    for (const t of FORECAST_TYPES) pieces[t.key] = (pieces[t.key] || 0) + (Number(r.data?.[t.salesKey]) || 0);
    d.pieces = pieces;
  }
  for (const so of stockOuts || []) {
    if (!so?.startAt) continue;
    const date = istDay(so.startAt);
    if (date < from || date > to) continue;
    const type = stockOutType(so.item);
    if (type && !day(date).stockedOut!.includes(type)) day(date).stockedOut!.push(type);
  }
  return [...days.values()].sort((a, b) => a.date.localeCompare(b.date));
}

// How well the forecast has done, and the settings it tuned itself to (forecast.ts backtest /
// tuneSettings). Worked out once a day per store - it replays about 1,000 forecasts - and again
// when the calendar changes, since marking a festival changes what the replay expects.
const HISTORY_DAYS = 200; // 8 weeks replayed + 8 weeks tuned + the 10 weeks each forecast looks back
const mondayOf = (date: string) => addDaysISO(date, -((weekdayOf(date) + 6) % 7));

async function forecastCheck(deps: Deps, storeId: string | null, days: DayRecord[], events: CalendarEvent[], today: string) {
  const sig = events.map((e) => `${e.date}:${e.effect}`).sort().join(',');
  const key = `forecast-check:${storeId || 'all'}:${today}`;
  const cached = await deps.kv.get<any>(key);
  if (cached?.sig === sig) return cached;
  const tune = tuneSettings(days, events, today);
  const rows = backtest(days, events, addDaysISO(today, -56), addDaysISO(today, -1), tune.settings);
  const last28 = rows.filter((r) => r.date >= addDaysISO(today, -28));
  const weeks = [...new Set(rows.map((r) => mondayOf(r.date)))].sort().map((week) => ({
    week, ...summarizeAccuracy(rows.filter((r) => mondayOf(r.date) === week)),
  }));
  const check = {
    sig,
    date: today,
    settings: tune.settings as ForecastSettings,
    tuned: tune.tuned,
    tuningGain: tune.tuned && tune.before !== null && tune.after !== null ? tune.before - tune.after : 0,
    last28: summarizeAccuracy(last28),
    weeks,
    // Biggest misses of the last 4 weeks - often a festival or rain day not in the calendar yet.
    misses: [...last28].filter((r) => Math.abs(r.error) >= 0.25).sort((a, b) => Math.abs(b.error) - Math.abs(a.error)).slice(0, 6),
  };
  await deps.kv.set(key, check);
  return check;
}

async function overview(deps: Deps, storeId: string | null) {
  const today = deps.getTodayIST();
  const [days, events] = await Promise.all([loadDays(deps.kv, storeId, addDaysISO(today, -HISTORY_DAYS), addDaysISO(today, -1)), loadEvents(deps.kv)]);
  const eventMap = new Map(events.map((e) => [e.date, e]));
  const accuracy = await forecastCheck(deps, storeId, days, events, today);
  const forecast = forecastDays(days, events, today, 7, today, accuracy.settings);
  const yesterday = addDaysISO(today, -1);
  const yActual = days.find((d) => d.date === yesterday);
  const yExpected = forecastDays(days, events, yesterday, 1, yesterday, accuracy.settings)[0];
  const learned = learnEffects(prepareHistory(days, eventMap), eventMap, today);
  return {
    today,
    storeId,
    history: days.filter((d) => d.date >= addDaysISO(today, -84)),
    events: events.filter((e) => e.date >= addDaysISO(today, -120) && e.date <= addDaysISO(today, 90)),
    forecast,
    yesterday: { date: yesterday, actual: yActual?.revenue ?? null, actualPieces: yActual?.pieces ?? null, expected: yExpected },
    learned,
    accuracy,
  };
}

// ---------------- Claude ----------------

function aiConfigured() {
  return !!Deno.env.get('ANTHROPIC_API_KEY');
}

const monthKey = () => `ai-usage:${new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7)}`;

async function spentThisMonth(kv: Kv) {
  return (await kv.get<any>(monthKey()))?.costUsd || 0;
}

async function recordUsage(kv: Kv, purpose: string, usage: any) {
  const [inP, outP, cacheP] = PRICES[AI_MODEL] || PRICES['claude-opus-5-5'];
  const input = usage?.input_tokens || 0;
  const output = usage?.output_tokens || 0;
  const cacheRead = usage?.cache_read_input_tokens || 0;
  const cacheWrite = usage?.cache_creation_input_tokens || 0;
  const searches = usage?.server_tool_use?.web_search_requests || 0;
  const cost = (input * inP + output * outP + cacheRead * cacheP + cacheWrite * inP * 1.25) / 1_000_000 + searches * WEB_SEARCH_USD;
  const key = monthKey();
  const cur = (await kv.get<any>(key)) || { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, byPurpose: {} };
  cur.calls += 1;
  cur.webSearches = (cur.webSearches || 0) + searches;
  cur.costUsd = Math.round((cur.costUsd + cost) * 10000) / 10000;
  cur.inputTokens += input + cacheRead + cacheWrite;
  cur.outputTokens += output;
  cur.byPurpose[purpose] = Math.round(((cur.byPurpose[purpose] || 0) + cost) * 10000) / 10000;
  cur.model = AI_MODEL;
  await kv.set(key, cur);
}

class AiError extends Error {
  constructor(message: string, public status: number, public extra: Record<string, any> = {}) { super(message); }
}

// ---------------- Per-person AI allowance ----------------
// Each person gets a share of AI tokens per hour and per day (owner, 27 Oct 2026), on top of the
// business's monthly ₹ limit, so one person asking a lot can't use it up for everyone. Tokens
// counted: everything sent and written (a question that looks up data uses 10-60k on Haiku,
// under ₹0.01 each). The cluster head gets 3x. AI_USER_HOURLY_TOKENS / AI_USER_DAILY_TOKENS
// secrets override the defaults.
const USER_HOURLY_TOKENS = Number(Deno.env.get('AI_USER_HOURLY_TOKENS') || '200000');
const USER_DAILY_TOKENS = Number(Deno.env.get('AI_USER_DAILY_TOKENS') || '500000');
type AiUser = { id: string; isOwner?: boolean };
const istNow = () => new Date(Date.now() + 330 * 60000);
const userDayKey = (uid: string) => `ai-user-usage:${uid}:${istNow().toISOString().slice(0, 10)}`;
const userHourKey = (uid: string) => `ai-user-usage:${uid}:${istNow().toISOString().slice(0, 13)}`;

async function checkUserAllowance(kv: Kv, user: AiUser) {
  const factor = user.isOwner ? 3 : 1;
  const [day, hour] = await Promise.all([kv.get<any>(userDayKey(user.id)), kv.get<any>(userHourKey(user.id))]);
  if ((day?.tokens || 0) >= USER_DAILY_TOKENS * factor) {
    throw new AiError("You've used today's share of Bunny. Try again tomorrow.", 429, { limit: 'day' });
  }
  if ((hour?.tokens || 0) >= USER_HOURLY_TOKENS * factor) {
    const minutes = Math.max(1, 60 - istNow().getUTCMinutes());
    throw new AiError(`You've asked Bunny a lot in this hour. Try again in ${minutes} minutes.`, 429, { limit: 'hour', retryAfterMinutes: minutes });
  }
}

async function recordUserUsage(kv: Kv, user: AiUser, usage: any) {
  const tokens = (usage?.input_tokens || 0) + (usage?.output_tokens || 0) + (usage?.cache_read_input_tokens || 0) + (usage?.cache_creation_input_tokens || 0);
  for (const key of [userDayKey(user.id), userHourKey(user.id)]) {
    const cur = (await kv.get<any>(key)) || { tokens: 0, calls: 0 };
    await kv.set(key, { tokens: cur.tokens + tokens, calls: cur.calls + 1 });
  }
}

const SYSTEM_PROMPT = `You are Bunny, the business analyst built into the Bunny Momos staff app.

About the business:
- Bunny Momos runs one store (Bunny Momos 1) in Birhata, Bardhaman, West Bengal, and a production house that makes momos fresh every day, steams and freezes them, and sends them to the store in bags of 50 (every type).
- Seven momo types: chicken, chicken cheese, chicken kurkure (non-veg); veg, cheese corn, paneer, veg kurkure (veg). Chicken is about 80% of momo revenue.
- The counter (dine-in and takeaway) is the main business. Zomato and Swiggy exist, but the owner deliberately keeps online small: never suggest growing online or spending more on the platforms.
- Bengali festivals move demand a lot. On days when many people avoid non-veg (for example Lakshmi Puja) sales roughly halve while veg holds up; festival crowds can lift sales well above normal. The store is sometimes closed on festival days.
- Revenue figures are counter plus POS-recorded online sales in rupees. Momo counts are pieces sold per type from the POS.

How to answer:
- Write for a busy owner: short, plain English, concrete numbers, and what to do. Rupees as "Rs 12,400" with Indian digit grouping.
- Use only the data you are given or fetch with your tools. If something is not in the data, say so instead of guessing.
- Name dates as "Sun 25 Oct". Today's date is given in each request.
- Never ask for or discuss individual salaries or personal details.
- Answer in the language each request asks for (English, Bengali or Hindi) with simple everyday words, numbers in digits. Answers may be read aloud, so avoid tables and heavy formatting.
- When the person is looking at a screen of the app, its visible text comes with the question: explain what the numbers mean, why they might be what they are, and what to do, using that screen first. If the screen doesn't show how a number is worked out, say so rather than guessing.
- End every answer with one last line exactly like "FOLLOW_UPS: question one | question two | question three" - three short follow-up questions the person might ask next, in the same language.

The app's main screens:
- Analytics: Overview (sales, costs, profit for the period), Revenue & Channels (counter vs Zomato/Swiggy), Item Performance (momos and items sold), Costs & Margins (spend by category), Unit Economics (cost and profit per plate), Cash & Reconciliation (counted cash vs expected, Paytm), Stock Requests (store requests to production and how they were met), Store-Production SLA (on-time deliveries), Trends & Growth (weekday pattern, item mix, festival effects, forecast accuracy, festival calendar, growth ideas).
- Sales: the store incharge's daily cash count. Expected cash in hand = yesterday's counted cash + cash collected + cash top-ups from Paytm - expenses paid in cash - contract payouts; the difference from the counted cash is the over/short. Online payouts arrive later (Zomato about 3 working days, Swiggy weekly).
- Expense: purchases, overheads and fixed costs for the store and the production house, paid from that side's cash, Paytm or the owner's own money.
- Production, Stock requests, Receive stock, Out of stock: making, shipping and receiving momos; the forecast suggests how much to ask for.`;

const LANGUAGES = { en: 'English', bn: 'Bengali (বাংলা)', hi: 'Hindi (हिन्दी)' };

// Belt and braces on top of the app leaving private parts out: no Aadhaar-like 12-digit numbers,
// phone numbers or email addresses go to the AI.
const scrubPrivate = (text: string) => text
  .replace(/\b\d{4}\s?\d{4}\s?\d{4}\b/g, '[number hidden]')
  .replace(/(\+91[\s-]?)?\b[6-9]\d{9}\b/g, '[phone hidden]')
  .replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email hidden]');

// The model ends each answer with "FOLLOW_UPS: a | b | c"; split that off for the suggestion chips.
function splitFollowUps(raw: string) {
  const m = raw.match(/\s*FOLLOW_UPS:\s*(.+?)\s*$/);
  if (!m || m.index === undefined) return { answer: raw.trim(), followUps: [] as string[] };
  return {
    answer: raw.slice(0, m.index).trim(),
    followUps: m[1].split('|').map((q) => q.trim()).filter(Boolean).slice(0, 3),
  };
}

// Reads one spoken sentence (speech-to-text from the phone, usually Bengali mixed with English
// words) into form fields. Only what was said - nothing worked out or guessed.
const VOICE_PROMPT = `You turn one spoken sentence from staff at Bunny Momos, a momo shop in Bardhaman, West Bengal, into form fields. The text comes from phone speech recognition: usually Bengali (Bengali script, or Bengali in English letters) mixed with English words, sometimes English only. Recognition mistakes are common - read for what was meant.

Numbers: Bengali digits ০১২৩৪৫৬৭৮৯ are 0-9. Number words: এক 1, দুই/দু 2, তিন 3, চার 4, পাঁচ 5, ছয় 6, সাত 7, আট 8, নয় 9, দশ 10, বিশ 20, পঞ্চাশ 50, একশো/শো 100, হাজার 1000 (তিন হাজার চারশো = 3400); দেড় 1.5, আড়াই 2.5, সাড়ে = plus a half (সাড়ে তিন = 3.5, সাড়ে তিনশো = 350); পোয়া = 250 g. টাকা / taka / rupees = rupees. কেজি/kilo = kg, গ্রাম = g, লিটার = L, পিস/টা = pieces, আঁটি/bundle = bundle, প্যাকেট = packet.

Packs: "5 burger packs each having 4 burgers at 200" means packs 5, perPack 4, unit pcs, quantity 20.

Size of each piece or pack: "each piece 500 g", "এক পিসের ওয়েট ৫০০ গ্রাম", "500 gram er packet", "1 kg er packet", "1 litre each" go in weightEachGrams (grams; 1 kg = 1000; for liquids 1 L = 1000). It is the size of ONE, not the total. A price said after the whole line ("at 200", "200 taka diye") is the TOTAL for the line; it is per pack only when they say each / per / প্রতি / করে / "packet 200 kore".

Only fill what was actually said; leave everything else null. Apart from quantity = packs x perPack, never calculate one value from another.`;

async function callClaude(deps: Deps, opts: {
  purpose: string;
  messages: any[];
  tools?: any[];
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  format?: any;
  system?: string; // in place of the analyst prompt, for small jobs like reading voice input
  noThinking?: boolean; // quick extraction: skip thinking (Haiku thinks by default)
  user?: AiUser; // the person asking - counted against their hourly/daily share
}) {
  if (!aiConfigured()) throw new AiError('AI is not set up yet: add the ANTHROPIC_API_KEY secret in Supabase.', 503);
  if (opts.user) await checkUserAllowance(deps.kv, opts.user);
  const spent = await spentThisMonth(deps.kv);
  if (spent >= AI_MONTHLY_CAP_USD) throw new AiError(`This month's AI budget (₹${AI_MONTHLY_CAP_INR.toLocaleString('en-IN')}) is used up. It resets on the 1st, or raise the AI_MONTHLY_CAP_INR secret to continue.`, 429);
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const body: any = {
    model: AI_MODEL,
    max_tokens: opts.maxTokens || 8000,
    system: opts.system || [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: opts.messages,
    output_config: { effort: opts.effort || 'medium', ...(opts.format ? { format: opts.format } : {}) },
  };
  if (opts.tools) body.tools = opts.tools;
  if (opts.noThinking) body.thinking = { type: 'disabled' };
  if (SUPPORTS_FALLBACK) {
    body.betas = ['server-side-fallback-2026-07-01'];
    body.fallbacks = 'default';
  }
  let res: any;
  try {
    res = await client.beta.messages.create(body);
  } catch (err: any) {
    if (err instanceof Anthropic.AuthenticationError) throw new AiError('The Anthropic key was rejected - check the ANTHROPIC_API_KEY secret.', 502);
    if (err instanceof Anthropic.RateLimitError) throw new AiError('Claude is busy right now - try again in a minute.', 503);
    if (err instanceof Anthropic.APIError) throw new AiError(`Claude request failed (${err.status}): ${err.message}`, 502);
    throw err;
  }
  await recordUsage(deps.kv, opts.purpose, res.usage);
  if (opts.user) await recordUserUsage(deps.kv, opts.user, res.usage);
  if (res.stop_reason === 'refusal') throw new AiError('Claude declined this request.', 422);
  return res;
}

const textOf = (res: any) => (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();

// For other server modules (kpi.ts): one structured-output request that goes through the same
// monthly ₹ cap, per-person allowance and usage log as everything here, so it isn't duplicated.
export { AiError };
export async function askClaudeForJson(kv: Kv, opts: {
  purpose: string; system: string; prompt: string; schema: any; user: AiUser;
  effort?: 'low' | 'medium' | 'high'; maxTokens?: number;
}): Promise<{ data: any; model: string }> {
  const res = await callClaude({ kv } as Deps, {
    purpose: opts.purpose, system: opts.system, user: opts.user, effort: opts.effort || 'low', maxTokens: opts.maxTokens || 3000,
    format: { type: 'json_schema', schema: opts.schema }, messages: [{ role: 'user', content: opts.prompt }],
  });
  let data: any = null;
  try { data = JSON.parse(textOf(res)); } catch { /* reported below */ }
  if (!data) throw new AiError('Claude did not return a usable answer - try again.', 502);
  return { data, model: res.model };
}

// The same, for a question about photos (customer complaint photos, complaints.ts): the images
// first, then the text. At most four images are sent.
export async function askClaudeWithImages(kv: Kv, opts: {
  purpose: string; system: string; text: string; images: { base64: string; mediaType: string }[]; schema: any; user: AiUser; maxTokens?: number;
  maxImages?: number; // 4 unless asked (a surprise audit's report reads up to 8)
}): Promise<{ data: any; model: string }> {
  const content = [
    ...opts.images.slice(0, opts.maxImages || 4).map((im) => ({ type: 'image', source: { type: 'base64', media_type: im.mediaType, data: im.base64 } })),
    { type: 'text', text: opts.text },
  ];
  const res = await callClaude({ kv } as Deps, {
    purpose: opts.purpose, system: opts.system, user: opts.user, effort: 'medium', maxTokens: opts.maxTokens || 4000,
    format: { type: 'json_schema', schema: opts.schema }, messages: [{ role: 'user', content }],
  });
  let data: any = null;
  try { data = JSON.parse(textOf(res)); } catch { /* reported below */ }
  if (!data) throw new AiError('Claude did not return a usable answer - try again.', 502);
  return { data, model: res.model };
}

function compactDay(d: DayRecord, events: Map<string, CalendarEvent>) {
  const p = d.pieces || {};
  const nonVeg = FORECAST_TYPES.filter((t) => !t.veg).reduce((s, t) => s + (p[t.key] || 0), 0);
  const veg = FORECAST_TYPES.filter((t) => t.veg).reduce((s, t) => s + (p[t.key] || 0), 0);
  return {
    date: d.date,
    day: WEEKDAY_SHORT[weekdayOf(d.date)],
    revenue: d.revenue === null ? null : Math.round(d.revenue),
    pieces: d.pieces ? Object.fromEntries(FORECAST_TYPES.map((t) => [t.key, p[t.key] || 0])) : null,
    nonVegPieces: d.pieces ? nonVeg : null,
    vegPieces: d.pieces ? veg : null,
    event: events.get(d.date) ? `${events.get(d.date)!.name} (${events.get(d.date)!.effect})` : undefined,
    ranOut: d.stockedOut?.length ? d.stockedOut : undefined,
  };
}

async function briefData(deps: Deps, storeId: string | null) {
  const ov = await overview(deps, storeId);
  const events = new Map(ov.events.map((e) => [e.date, e]));
  const last14 = ov.history.filter((d) => d.date >= addDaysISO(ov.today, -14)).map((d) => compactDay(d, events));
  const weekdayAvg: Record<string, number> = {};
  for (let wd = 0; wd < 7; wd++) {
    const vals = ov.history.filter((d) => weekdayOf(d.date) === wd && (d.revenue || 0) > 0 && !events.get(d.date)).map((d) => d.revenue!);
    if (vals.length) weekdayAvg[WEEKDAY_SHORT[wd]] = Math.round(vals.reduce((a, b) => a + b, 0) / vals.length);
  }
  const [wastage, stockOuts] = await Promise.all([
    deps.kv.getByPrefix<any>(storeId ? `stock-wastage:${storeId}:` : 'stock-wastage:'),
    deps.kv.getByPrefix<any>(storeId ? `stock-out:${storeId}:` : 'stock-out:'),
  ]);
  const since = addDaysISO(ov.today, -7);
  return {
    today: ov.today,
    todayWeekday: WEEKDAY_SHORT[weekdayOf(ov.today)],
    last14Days: last14,
    averageRevenueByWeekdayLast12Weeks: weekdayAvg,
    yesterday: {
      date: ov.yesterday.date,
      actualRevenue: ov.yesterday.actual === null ? null : Math.round(ov.yesterday.actual),
      expectedRevenue: ov.yesterday.expected?.revenue,
      expectedRange: ov.yesterday.expected ? [ov.yesterday.expected.revenueLow, ov.yesterday.expected.revenueHigh] : null,
    },
    next7DaysForecast: ov.forecast.map((f) => ({
      date: f.date, day: f.weekday, revenue: f.revenue, range: [f.revenueLow, f.revenueHigh],
      chicken: f.pieces.chicken, nonVegPieces: f.nonVegPieces, vegPieces: f.vegPieces,
      event: f.event ? `${f.event.name} (${f.event.effect}${f.event.confirmed === false ? ', not confirmed' : ''})` : undefined,
    })),
    // How far off the forecast has been (each past day re-forecast from earlier data only).
    forecastAccuracyLast4Weeks: {
      typicalMissPct: ov.accuracy.last28.typicalMiss === null ? null : Math.round(ov.accuracy.last28.typicalMiss * 100),
      tendsToRunPct: ov.accuracy.last28.bias === null ? null : Math.round(ov.accuracy.last28.bias * 100),
    },
    upcomingEvents: ov.events.filter((e) => e.date >= ov.today && e.date <= addDaysISO(ov.today, 30)),
    pastFestivalEffects: Object.values(ov.learned).filter((l) => l.samples.length > 0).map((l) => ({
      effect: l.effect,
      days: l.samples.map((s) => ({ date: s.date, name: s.name, revenueVsNormal: s.revenueRatio === null ? null : Math.round(s.revenueRatio * 100) + '%', nonVegVsNormal: s.nonVegRatio === null ? null : Math.round(s.nonVegRatio * 100) + '%', vegVsNormal: s.vegRatio === null ? null : Math.round(s.vegRatio * 100) + '%' })),
    })),
    storeWastageLast7Days: (wastage || []).filter((w) => w.date >= since).map((w) => ({ date: w.date, pieces: w.wastage, reasons: w.reasons })),
    stockOutsLast7Days: (stockOuts || []).filter((s) => s.startAt && istDay(s.startAt) >= since).map((s) => ({
      item: s.item, reason: s.reason, note: s.reasonNote, from: s.startAt, to: s.endAt,
    })),
  };
}

// ---------------- Ask Bunny tools (read only) ----------------

const dateRange = { type: 'object', properties: { from: { type: 'string', description: 'YYYY-MM-DD' }, to: { type: 'string', description: 'YYYY-MM-DD' } }, required: ['from', 'to'], additionalProperties: false };
const ASK_TOOLS = [
  { name: 'get_daily_sales', description: 'Daily revenue and momos sold per type (with veg / non-veg totals, festival or closed days, and types that ran out) for a date range of up to 120 days.', input_schema: dateRange },
  { name: 'get_forecast', description: 'Expected revenue and momos per type for the next 1-14 days from today, including festival adjustments.', input_schema: { type: 'object', properties: { days: { type: 'integer', minimum: 1, maximum: 14 } }, required: ['days'], additionalProperties: false } },
  { name: 'get_calendar', description: 'Festival, event and closed days in a date range, with their expected effect.', input_schema: dateRange },
  { name: 'get_festival_effects', description: 'How each kind of marked day (few eat non-veg, busier, quieter) actually did against a normal day, with examples.', input_schema: { type: 'object', properties: {}, additionalProperties: false } },
  { name: 'get_stock_outs', description: 'Items the store ran out of in a date range: item, reason, start and end time.', input_schema: dateRange },
  { name: 'get_wastage', description: 'Store momo wastage per day in a date range, with reason codes.', input_schema: dateRange },
  { name: 'get_store_requests', description: 'Stock requests from the store to the production house in a date range: status and pieces sent per type.', input_schema: dateRange },
  { name: 'get_production', description: 'Momos made per type per day at the production house in a date range.', input_schema: dateRange },
  { name: 'get_expenses', description: 'Costs by category in a date range, the way the profit figures count them (equipment and the scooter spread over 36 months, loan EMIs left out), plus cash actually spent, one-time purchases and loan repayments. No salaries. Also the big buys the team explained (a festival stock-up, buying ahead of a shop closing, a bulk buy, a price rise) with their reasons: use them to explain spikes in spending.', input_schema: dateRange },
  // Owner, 1 Nov 2026: "bunny was not able to answer total commission by Zomato & Swiggy".
  { name: 'get_online_costs', description: 'Zomato and Swiggy for a date range of up to 400 days: online sales, commission (without the 5% GST the platforms collect and pay for us), ads, commission as % of sales, per platform and in total - the same figures as the Analytics cards. Days the platforms have not settled yet are estimated at the last 60 days\' rate (estimatedDays). Also each settlement paid into the bank in the range: what customers paid, what the platform kept, ads and what reached the bank.', input_schema: dateRange },
];

async function runTool(deps: Deps, storeId: string | null, name: string, input: any) {
  const today = deps.getTodayIST();
  const maxDays = name === 'get_online_costs' ? 400 : 120;
  const clampFrom = (from: string, to: string) => (from < addDaysISO(to, -maxDays) ? addDaysISO(to, -maxDays) : from);
  const from = input?.from ? clampFrom(String(input.from), String(input.to || today)) : addDaysISO(today, -14);
  const to = input?.to ? String(input.to) : today;
  const events = await loadEvents(deps.kv);
  const eventMap = new Map(events.map((e) => [e.date, e]));
  switch (name) {
    case 'get_daily_sales':
      return (await loadDays(deps.kv, storeId, from, to)).map((d) => compactDay(d, eventMap));
    case 'get_forecast': {
      const days = await loadDays(deps.kv, storeId, addDaysISO(today, -HISTORY_DAYS), addDaysISO(today, -1));
      const { settings, last28 } = await forecastCheck(deps, storeId, days, events, today);
      return { accuracyLast4Weeks: last28, days: forecastDays(days, events, today, Math.min(14, Math.max(1, Number(input?.days) || 7)), today, settings) };
    }
    case 'get_calendar':
      return events.filter((e) => e.date >= from && e.date <= to);
    case 'get_festival_effects': {
      const days = await loadDays(deps.kv, storeId, addDaysISO(today, -365), addDaysISO(today, -1));
      return learnEffects(prepareHistory(days, eventMap), eventMap, today);
    }
    case 'get_stock_outs':
      return (await deps.kv.getByPrefix<any>(storeId ? `stock-out:${storeId}:` : 'stock-out:'))
        .filter((s) => s.startAt && istDay(s.startAt) >= from && istDay(s.startAt) <= to)
        .map((s) => ({ item: s.item, reason: s.reason, note: s.reasonNote, from: s.startAt, to: s.endAt, offOnline: s.offOnline }));
    case 'get_wastage':
      return (await deps.kv.getByPrefix<any>(storeId ? `stock-wastage:${storeId}:` : 'stock-wastage:'))
        .filter((w) => w.date >= from && w.date <= to)
        .map((w) => ({ date: w.date, pieces: w.wastage, reasons: w.reasons, notes: w.notes }));
    case 'get_store_requests':
      return (await deps.kv.getByPrefix<any>('production_request_'))
        .filter((r) => r.requestDate >= from && r.requestDate <= to && (!storeId || r.storeId === storeId))
        .map((r) => ({ date: r.requestDate, status: r.status, sent: Object.fromEntries(FORECAST_TYPES.map((t) => [t.key, r.shippedQuantities?.[t.key] || 0])) }));
    case 'get_production':
      return (await deps.kv.getByPrefix<any>('production:'))
        .filter((p) => p.date >= from && p.date <= to)
        .map((p) => ({ date: p.date, made: Object.fromEntries(Object.entries(PRODUCTION_KEYS).map(([k, t]) => [t, Number(p[k]?.final ?? p[k]) || 0])) }));
    case 'get_expenses': {
      const [inv, ovh, fix] = await Promise.all([allRows(deps, 'inventory:'), allRows(deps, 'overhead:'), allRows(deps, 'fixedcost:')]);
      const inScope = (x: any) => !storeId || !x.storeId || x.storeId === storeId || x.entityType === 'production_house';
      const rows = [
        ...inv.map((r: any) => ({ kind: 'purchase', category: r.category || 'other', date: r.date, amount: Number(r.totalCost) || 0, storeId: r.storeId, entityType: r.entityType })),
        ...ovh.filter((o: any) => o.category !== 'personal_expense').map((r: any) => ({ kind: 'overhead', category: r.category || 'other', date: r.date, amount: Number(r.amount) || 0, storeId: r.storeId, entityType: r.entityType })),
        ...fix.map((r: any) => ({ kind: 'fixed', category: r.category || 'other', date: r.date, amount: Number(r.amount) || 0, storeId: r.storeId, entityType: r.entityType })),
      ].filter((r) => typeof r.date === 'string' && inScope(r)).map((r) => ({ ...r, category: CATEGORY_ALIASES[r.category] || r.category }));
      const add = (out: Record<string, number>, k: string, v: number) => { out[k] = Math.round((out[k] || 0) + v); };
      const cashSpent: Record<string, number> = {};
      const profitCost: Record<string, number> = {};
      const oneTimePurchases: { date: string; category: string; amount: number; monthlyCostInProfit: number }[] = [];
      let loanRepayments = 0;
      for (const r of rows) {
        const inRange = r.date >= from && r.date <= to;
        if (FINANCING_CATEGORIES.has(r.category)) {
          if (inRange) loanRepayments += r.amount;
          continue;
        }
        if (inRange) add(cashSpent, r.category, r.amount);
        const months = SPREAD_MONTHS[r.category];
        const days = SPREAD_DAYS[r.category];
        if (months || days) {
          const share = spreadShare(r.amount, r.date, days || months! * 30.44, from, to);
          if (share > 0) add(profitCost, r.category, share);
          if (inRange && months) oneTimePurchases.push({ date: r.date, category: r.category, amount: Math.round(r.amount), monthlyCostInProfit: Math.round(r.amount / months) });
        } else if (inRange) {
          add(profitCost, r.category, r.amount);
        }
      }
      const foodAndPackaging = Object.entries(profitCost).filter(([k]) => FOOD_CATEGORIES.has(k)).reduce((t, [, v]) => t + v, 0);
      // Big buys the team said were right, and why (expenseReview.ts, owner 29 Oct 2026).
      const explainedBigBuys = [...inv, ...ovh]
        .filter((r: any) => r?.explained && typeof r.date === 'string' && r.date >= from && r.date <= to && inScope(r))
        .map((r: any) => ({
          date: r.date, item: String(r.itemName || r.description || r.category || ''), amount: Math.round(Number(r.totalCost ?? r.amount) || 0),
          place: r.entityType === 'production_house' ? 'production house' : 'store', reason: BIG_BUY_REASONS[r.explained.reason] || r.explained.reason, note: r.explained.note || undefined,
        }))
        .slice(0, 40);
      return {
        from, to,
        costsCountedInProfit: profitCost,
        foodAndPackagingCostInProfit: Math.round(foodAndPackaging),
        cashSpentByCategory: cashSpent,
        oneTimePurchasesInRange: oneTimePurchases,
        loanRepaymentsInRange: Math.round(loanRepayments),
        explainedBigBuys,
        notes: [
          'costsCountedInProfit is what Analytics and the profit figures use: equipment, furniture, electricals and the scooter are spread over 36 months, the software subscription over 12 months, bulk packaging over 120 days.',
          'cashSpentByCategory is money paid out in the range. One-time purchases (equipment, the scooter) are not a cost of the month they were paid - quote their monthlyCostInProfit instead.',
          'Loan repayments (vehicle EMI) are cash out but not a profit cost.',
          'Salaries are not included here.',
        ],
      };
    }
    case 'get_online_costs': {
      const [settlements, sales, payouts] = await Promise.all([allRows(deps, 'aggregator-settlement:'), allRows(deps, 'online_sales:'), allRows(deps, 'online_payout:')]);
      const mine = (x: any) => !storeId || x?.storeId === storeId;
      const costs = onlineCostsForRange(buildOnlineCostIndex(settlements, storeId), sales.filter(mine), payouts.filter(mine), from, to, today);
      const rs = (n: number) => Math.round(n || 0);
      const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
      const platform = (agg: Aggregator) => {
        const p = costs.byAggregator[agg];
        return { onlineSales: rs(p.sales), commission: rs(p.commission), commissionPctOfSales: pct(p.commission, p.sales), ads: rs(p.ads), commissionAndAds: rs(p.commission + p.ads) };
      };
      const sold = costs.byAggregator.zomato.sales + costs.byAggregator.swiggy.sales;
      const settlementsPaidInRange = settlements
        .filter((s: any) => mine(s) && typeof s.settlementDate === 'string' && s.settlementDate >= from && s.settlementDate <= to)
        .sort((a: any, b: any) => a.settlementDate.localeCompare(b.settlementDate))
        .map((s: any) => ({
          platform: s.aggregator, paidOn: s.settlementDate, ordersFrom: s.periodStart, ordersTo: s.periodEnd, orders: s.orderCount,
          customersPaid: rs(s.grossSales), platformKept: rs((s.grossSales || 0) - (s.netPayout || 0)), ads: s.adSpend == null ? undefined : rs(s.adSpend), paidToBank: rs(s.netPayout),
        }));
      return {
        from, to,
        zomato: platform('zomato'),
        swiggy: platform('swiggy'),
        total: { onlineSales: rs(sold), commission: rs(costs.commission), commissionPctOfSales: pct(costs.commission, sold), ads: rs(costs.ads), commissionAndAds: rs(costs.commission + costs.ads) },
        estimatedDays: costs.estimatedDays,
        estimatedCommission: rs(costs.estimatedCommission),
        gstPlatformsPaidForUs: rs(costs.gstExcluded),
        settlementsPaidInRange: settlementsPaidInRange.slice(-60),
        notes: [
          'commission leaves out the 5% GST the platforms collect from customers and pay to the government for us - it is not our cost. platformKept on a settlement is everything taken before the bank payment, GST included.',
          'Days with sales but no settlement yet are estimated at each platform\'s last 60 days\' rate: say so when estimatedDays is above 0.',
          'Online sales are POS figures without GST, the same as revenue in Analytics.',
        ],
      };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
}

// ---------------- Calendar suggestions ----------------
// Claude drafts festival days into a waiting list (calendar-suggestion:{date}). Nothing reaches
// the calendar - and so the forecast, production plan and stock requests - until the owner side
// adds it. Skipped days are remembered (calendar-dismissed:{date}) so they aren't offered again.
// Runs every Monday morning (cron) and whenever someone taps "Draft next 60 days".

type CalendarSuggestion = {
  date: string; name: string; effect: DayEffect; reason: string; confidence: 'high' | 'medium';
  createdAt: string; drafted: 'weekly' | 'manual';
};

const DRAFT_DAYS = 60;
const LAST_DRAFT_KEY = 'calendar-draft:last-run';

async function pendingSuggestions(kv: Kv, today: string): Promise<CalendarSuggestion[]> {
  const rows = await kv.getByPrefix<CalendarSuggestion>('calendar-suggestion:');
  return (rows || []).filter((s) => s?.date && s.date >= today).sort((a, b) => a.date.localeCompare(b.date));
}

async function draftCalendarDays(deps: Deps, from: string, to: string, drafted: 'weekly' | 'manual', user?: AiUser) {
  const [events, pending, dismissed] = await Promise.all([
    loadEvents(deps.kv),
    deps.kv.getByPrefix<any>('calendar-suggestion:'),
    deps.kv.getByPrefix<any>('calendar-dismissed:'),
  ]);
  // Days already in the calendar, waiting for an answer, or turned down.
  const known = new Set([...events, ...(pending || []), ...(dismissed || [])].map((e: any) => e?.date).filter((d) => d && d >= from && d <= to));
  const res = await callClaude(deps, {
    purpose: 'calendar',
    user,
    effort: 'low',
    maxTokens: 8000,
    tools: [{ type: WEB_SEARCH_TOOL, name: 'web_search', max_uses: 3, user_location: { type: 'approximate', country: 'IN', region: 'West Bengal', city: 'Bardhaman', timezone: 'Asia/Kolkata' } }],
    messages: [{
      role: 'user',
      content: `List the days between ${from} and ${to} that are likely to change sales at a momo shop in Bardhaman, West Bengal: Bengali and national festivals, puja days when many people avoid non-veg, big local fairs, public holidays. Check the exact ${from.slice(0, 4)} dates with web search - lunar festival dates move every year.

For each day give: date (YYYY-MM-DD), name, effect - one of "low_nonveg" (many avoid non-veg), "busy" (festival crowds, holidays out), "quiet" (people stay home or fast) - a one-line reason, and confidence ("high" if you confirmed the date, "medium" otherwise). Skip days with no real effect. Days already decided: ${JSON.stringify([...known].sort())} - skip those.

Answer with only a JSON array, no other text.`,
    }],
  });
  const text = textOf(res);
  let parsed: any[] = [];
  try { parsed = JSON.parse(text.slice(text.indexOf('['), text.lastIndexOf(']') + 1)); } catch { /* nothing usable */ }
  const createdAt = new Date().toISOString();
  const added: CalendarSuggestion[] = [];
  for (const s of Array.isArray(parsed) ? parsed : []) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s?.date) || s.date < from || s.date > to || known.has(s.date)) continue;
    if (!['low_nonveg', 'busy', 'quiet'].includes(s.effect) || !s.name) continue;
    known.add(s.date);
    const suggestion: CalendarSuggestion = {
      date: s.date, name: String(s.name).slice(0, 80), effect: s.effect, reason: String(s.reason || '').slice(0, 200),
      confidence: s.confidence === 'high' ? 'high' : 'medium', createdAt, drafted,
    };
    await deps.kv.set(`calendar-suggestion:${s.date}`, suggestion);
    added.push(suggestion);
  }
  await deps.kv.set(LAST_DRAFT_KEY, { at: createdAt, drafted, from, to, added: added.length });
  return added;
}

// ---------------- Routes ----------------

export function registerInsightsRoutes(app: any, deps: Deps) {
  const P = '/make-server-c2dd9b9d';
  const guard = async (c: any, need: 'view' | 'manage') => {
    const authResult = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in authResult) return { error: c.json({ error: authResult.error }, authResult.status) };
    const actor = await actorOf(deps.kv, authResult);
    if (need === 'manage' && !actor.canManage) return { error: c.json({ error: 'Only the cluster head or operations manager can do this' }, 403) };
    if (need === 'view' && !actor.canView) return { error: c.json({ error: 'Not allowed' }, 403) };
    return { actor };
  };
  const fail = (c: any, err: any) => {
    if (err instanceof AiError) return c.json({ error: err.message, ...err.extra }, err.status);
    console.error('[insights]', err);
    return c.json({ error: err?.message || 'Something went wrong' }, 500);
  };

  // Festival / event calendar - one shared calendar for the business.
  app.get(`${P}/store-calendar`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    const from = c.req.query('from') || '0000-00-00';
    const to = c.req.query('to') || '9999-12-31';
    return c.json({ events: (await loadEvents(deps.kv)).filter((e) => e.date >= from && e.date <= to) });
  });

  app.put(`${P}/store-calendar/:date`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    const date = c.req.param('date');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Date must be YYYY-MM-DD' }, 400);
    const body = await c.req.json();
    const name = String(body.name || '').trim().slice(0, 80);
    if (!name) return c.json({ error: 'Give the day a name' }, 400);
    if (!EFFECTS.includes(body.effect)) return c.json({ error: 'Pick what the day does to sales' }, 400);
    const event = {
      date, name, effect: body.effect, note: String(body.note || '').trim().slice(0, 300) || undefined,
      confirmed: body.confirmed !== false, source: body.source === 'ai' ? 'ai' : 'owner',
      updatedBy: g.actor!.name, updatedAt: new Date().toISOString(),
    };
    await deps.kv.set(`store-calendar:${date}`, event);
    return c.json({ event });
  });

  app.delete(`${P}/store-calendar/:date`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    await deps.kv.del(`store-calendar:${c.req.param('date')}`);
    return c.json({ success: true });
  });

  // History, 7-day forecast, yesterday vs expected and past festival effects.
  app.get(`${P}/insights/overview`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    try {
      return c.json(await overview(deps, c.req.query('storeId') || null));
    } catch (err) { return fail(c, err); }
  });

  app.get(`${P}/ai/status`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    return c.json({ configured: aiConfigured(), model: AI_MODEL, spentThisMonthUsd: await spentThisMonth(deps.kv), capUsd: AI_MONTHLY_CAP_USD, capInr: AI_MONTHLY_CAP_INR, canManage: g.actor!.canManage, invoiceScan: INVOICE_SCAN_ON });
  });

  // Daily brief: written once per store per day (owner side can ask for a fresh one).
  app.post(`${P}/ai/brief`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    try {
      const { storeId = null, refresh = false } = await c.req.json().catch(() => ({}));
      const today = deps.getTodayIST();
      const key = `ai-brief:${storeId || 'all'}:${today}`;
      const cached = await deps.kv.get<any>(key);
      if (cached && !(refresh && g.actor!.canManage)) return c.json({ brief: cached });
      if (!g.actor!.canManage) return c.json({ brief: null });
      if (cached?.refreshes >= 3) return c.json({ brief: cached, note: 'Already refreshed 3 times today' });
      const data = await briefData(deps, storeId);
      const res = await callClaude(deps, {
        purpose: 'brief',
        user: aiUser(g.actor!),
        effort: 'medium',
        maxTokens: 6000,
        messages: [{
          role: 'user',
          content: `Write today's brief for the owner from this data (JSON). Today is ${data.todayWeekday} ${data.today}.

Use exactly these four headings, each followed by short bullet lines:
Yesterday - how it went against the expected figure, and the likely reason.
This week - the days that stand out in the forecast, especially festival or event days, and what they mean for chicken vs veg.
Do today - 2 or 3 concrete actions (requests, production, menu push, staffing).
Watch - anything worrying in wastage, stock-outs or the trend.

Keep it under 170 words. No intro or sign-off.

${JSON.stringify(data)}`,
        }],
      });
      const brief = { text: textOf(res), generatedAt: new Date().toISOString(), model: res.model, storeId, date: today, refreshes: cached ? (cached.refreshes || 0) + 1 : 0 };
      await deps.kv.set(key, brief);
      return c.json({ brief });
    } catch (err) { return fail(c, err); }
  });

  // Weekly production goal, suggested. The base is the week's forecast per momo type (weekday
  // pattern, recent level, the calendar's festival days) plus a 10% margin, in whole bags. Bunny
  // reads the same figures with what the forecast can't see - festival days only suggested so
  // far, event stalls that week, recent stock-outs - and may move a type within limits, saying
  // why. Without AI (no key, budget used up) the base comes back on its own.
  app.post(`${P}/ai/weekly-goal`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    try {
      const body = await c.req.json().catch(() => ({}));
      const productionHouseId = String(body.productionHouseId || '');
      const today = deps.getTodayIST();
      const thisMonday = mondayOf(today);
      const weekStart = /^\d{4}-\d{2}-\d{2}$/.test(body.weekStart || '') ? mondayOf(body.weekStart) : thisMonday;
      if (weekStart < thisMonday) return c.json({ error: 'Pick this week or a later one' }, 400);
      const language = LANGUAGES[body.language as keyof typeof LANGUAGES] ? body.language as keyof typeof LANGUAGES : 'en';
      const weekEnd = addDaysISO(weekStart, 6);

      const stores = ((await deps.kv.getByPrefix<any>('store:')) || []).filter((s) => s?.id && (!productionHouseId || s.productionHouseId === productionHouseId));
      const storeId = stores.length === 1 ? stores[0].id : null;
      const [days, events, suggestions, stalls] = await Promise.all([
        loadDays(deps.kv, storeId, addDaysISO(today, -HISTORY_DAYS), addDaysISO(today, -1)),
        loadEvents(deps.kv),
        pendingSuggestions(deps.kv, today),
        deps.kv.getByPrefix<any>('event:'),
      ]);
      const accuracy = await forecastCheck(deps, storeId, days, events, today);
      const forecast = forecastDays(days, events, weekStart, 7, today, accuracy.settings);
      const base: Record<string, number> = {};
      const expected: Record<string, number> = {};
      for (const t of FORECAST_TYPES) {
        expected[t.key] = Math.round(forecast.reduce((s, d) => s + (d.pieces[t.key] || 0), 0));
        base[t.key] = roundUpToBag(expected[t.key] * 1.1, t.bag);
      }
      const weekStalls = (stalls || [])
        .filter((e) => e?.startDate && e?.endDate && e.startDate <= weekEnd && e.endDate >= weekStart && e.status !== 'cancelled' && !e.deletedAt)
        .map((e) => ({ name: e.name, from: e.startDate, to: e.endDate, location: e.location || e.venue || undefined, daysThisWeek: forecast.filter((d) => d.date >= e.startDate && d.date <= e.endDate).length }));
      const pastStalls = (stalls || []).filter((e) => e?.endDate && e.endDate < today && !e.deletedAt).length;
      const maybeFestivals = suggestions.filter((s) => s.date >= weekStart && s.date <= weekEnd).map((s) => ({ date: s.date, name: s.name, effect: s.effect, reason: s.reason }));
      const recentStockOuts = days.filter((d) => d.date >= addDaysISO(today, -14) && d.stockedOut?.length).map((d) => ({ date: d.date, types: d.stockedOut }));
      const dayLines = forecast.map((d) => ({ date: d.date, weekday: d.weekday, festival: d.event ? `${d.event.name} (${d.event.effect})` : undefined, revenue: Math.round(d.revenue), pieces: d.pieces }));

      const fallbackReasons = [
        `Forecast for ${dayLines[0].weekday} ${weekStart} to ${dayLines[6].weekday} ${weekEnd}: ${FORECAST_TYPES.map((t) => `${t.label} ${expected[t.key]}`).join(', ')} pieces, plus 10% and rounded up to whole bags.`,
        ...forecast.filter((d) => d.event).map((d) => `${d.weekday} ${d.date}: ${d.event!.name} is in the calendar and already counted.`),
        ...(weekStalls.length ? [`Event stall this week (${weekStalls.map((s) => s.name).join(', ')}): add the stall's momos - not in this goal.`] : []),
      ];
      const forecastOnly = (note: string) => c.json({ weekStart, goals: base, base, expected, reasons: fallbackReasons, ai: false, note });
      if (!aiConfigured()) return forecastOnly('Bunny is not set up, so this is the forecast alone.');

      const types = FORECAST_TYPES.map((t) => t.key);
      let data: any = null;
      try {
        const res = await callClaude(deps, {
          purpose: 'weekly-goal',
          user: aiUser(g.actor!),
          effort: 'low',
          maxTokens: 2500,
          format: {
            type: 'json_schema',
            schema: {
              type: 'object',
              additionalProperties: false,
              properties: {
                goals: { type: 'object', additionalProperties: false, properties: Object.fromEntries(types.map((k) => [k, { type: 'integer' }])), required: types },
                reasons: { type: 'array', items: { type: 'string' } },
              },
              required: ['goals', 'reasons'],
            },
          },
          messages: [{
            role: 'user',
            content: `Set the production house's momo goal for the week ${weekStart} (Mon) to ${weekEnd} (Sun). Today is ${WEEKDAY_SHORT[weekdayOf(today)]} ${today}.

"base" is the forecast's expected pieces for the week plus 10%, in whole bags (chicken bags of 50, every other type 20). The forecast already counts the weekday pattern, the recent sales level and the festival days marked in the calendar ("festival" on a day).

Start from base for each type. Change a type only for something the forecast can't see:
- an event stall this week ("stalls"): add that stall's momos. ${pastStalls ? `There have been ${pastStalls} stalls before.` : 'There is no stall history yet, so say plainly that the stall figure is your estimate.'}
- a festival day only suggested so far ("maybeFestivals"), not yet in the calendar;
- a type that ran out on several recent days ("recentStockOuts").
Otherwise keep base. Every goal must be a whole number of bags.

Reply with "goals" (pieces per type) and "reasons": at most 4 short lines in ${LANGUAGES[language]}, each with numbers, first the week's total against the forecast, then each change and why. Name days like "Sat 31 Oct".

${JSON.stringify({ base, expected, days: dayLines, stalls: weekStalls, maybeFestivals, recentStockOuts })}`,
          }],
        });
        try { data = JSON.parse(textOf(res)); } catch { data = null; }
      } catch (err) {
        if (!(err instanceof AiError)) throw err;
        return forecastOnly(err.message);
      }
      if (!data?.goals) return forecastOnly('Bunny did not answer, so this is the forecast alone.');

      // Bunny's numbers stay within reach of the forecast: no lower than 60% of base, and no
      // higher than 160% (three times with a stall that week), in whole bags.
      const goals: Record<string, number> = {};
      for (const t of FORECAST_TYPES) {
        const b = base[t.key];
        const asked = Math.max(0, Math.round(Number(data.goals[t.key]) || 0));
        const lo = Math.floor((b * 0.6) / t.bag) * t.bag;
        const hi = roundUpToBag(Math.max(b, t.bag) * (weekStalls.length ? 3 : 1.6), t.bag);
        goals[t.key] = Math.min(hi, Math.max(lo, roundUpToBag(asked, t.bag)));
      }
      const reasons = (Array.isArray(data.reasons) ? data.reasons : []).map((r: any) => String(r)).filter(Boolean).slice(0, 4);
      return c.json({ weekStart, goals, base, expected, reasons: reasons.length ? reasons : fallbackReasons, ai: true });
    } catch (err) { return fail(c, err); }
  });

  // Weekly growth ideas, saved so the owner can mark them "trying", "done" or "dropped".
  app.get(`${P}/growth-ideas`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    const storeId = c.req.query('storeId') || 'all';
    const ideas = (await deps.kv.getByPrefix<any>(`growth-idea:${storeId}:`)).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
    return c.json({ ideas });
  });

  app.put(`${P}/growth-ideas/:storeId/:id`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    const key = `growth-idea:${c.req.param('storeId')}:${c.req.param('id')}`;
    const idea = await deps.kv.get<any>(key);
    if (!idea) return c.json({ error: 'Idea not found' }, 404);
    const body = await c.req.json();
    if (!['new', 'trying', 'done', 'dropped'].includes(body.status)) return c.json({ error: 'Unknown status' }, 400);
    const next = { ...idea, status: body.status, note: body.note !== undefined ? String(body.note).slice(0, 300) : idea.note, updatedAt: new Date().toISOString(), updatedBy: g.actor!.name };
    await deps.kv.set(key, next);
    return c.json({ idea: next });
  });

  app.post(`${P}/ai/growth`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    try {
      const { storeId = null } = await c.req.json().catch(() => ({}));
      const sid = storeId || 'all';
      const today = deps.getTodayIST();
      const [data, history, previous] = await Promise.all([
        briefData(deps, storeId),
        loadDays(deps.kv, storeId, addDaysISO(today, -84), addDaysISO(today, -1)),
        deps.kv.getByPrefix<any>(`growth-idea:${sid}:`),
      ]);
      const weekly: Record<string, { revenue: number; pieces: Record<string, number>; days: number }> = {};
      for (const d of history) {
        const wk = addDaysISO(d.date, -((weekdayOf(d.date) + 6) % 7));
        const w = weekly[wk] || (weekly[wk] = { revenue: 0, pieces: {}, days: 0 });
        w.revenue += d.revenue || 0;
        w.days += 1;
        for (const t of FORECAST_TYPES) w.pieces[t.key] = (w.pieces[t.key] || 0) + (d.pieces?.[t.key] || 0);
      }
      const ideaSchema = {
        type: 'object',
        properties: {
          ideas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                title: { type: 'string' },
                why: { type: 'string', description: 'The evidence from the data, with numbers' },
                action: { type: 'string', description: 'What to do this week, concretely' },
                expectedImpact: { type: 'string' },
                effort: { type: 'string', enum: ['low', 'medium', 'high'] },
                category: { type: 'string', enum: ['menu', 'pricing', 'festival', 'operations', 'waste', 'marketing'] },
              },
              required: ['title', 'why', 'action', 'expectedImpact', 'effort', 'category'],
              additionalProperties: false,
            },
          },
        },
        required: ['ideas'],
        additionalProperties: false,
      };
      const res = await callClaude(deps, {
        purpose: 'growth',
        user: aiUser(g.actor!),
        effort: 'high',
        maxTokens: 12000,
        format: { type: 'json_schema', schema: ideaSchema },
        messages: [{
          role: 'user',
          content: `Suggest 3 to 5 growth ideas for the coming week from this data. Each must rest on something visible in the numbers (weekday pattern, item mix, veg vs non-veg, festival effects, wastage, stock-outs). Counter-first only - no ideas that grow Zomato or Swiggy. Avoid repeating ideas already listed under previousIdeas unless the data says to revisit one. Today is ${today}.

${JSON.stringify({
  ...data,
  weeklyTotalsLast12Weeks: Object.entries(weekly).map(([week, w]) => ({ weekStarting: week, revenue: Math.round(w.revenue), daysWithData: w.days, pieces: w.pieces })),
  previousIdeas: previous.slice(0, 15).map((p) => ({ title: p.title, status: p.status, createdAt: p.createdAt })),
})}`,
        }],
      });
      let parsed: any = null;
      try { parsed = JSON.parse(textOf(res)); } catch { /* handled below */ }
      if (!parsed?.ideas?.length) throw new AiError('Claude did not return usable ideas - try again.', 502);
      const now = new Date().toISOString();
      const saved = [];
      for (const idea of parsed.ideas.slice(0, 5)) {
        const id = crypto.randomUUID();
        const record = { id, storeId: sid, ...idea, status: 'new', createdAt: now, model: res.model };
        await deps.kv.set(`growth-idea:${sid}:${id}`, record);
        saved.push(record);
      }
      return c.json({ ideas: saved });
    } catch (err) { return fail(c, err); }
  });

  // Draft festival / event days now. New days join the waiting list; the reply is the whole list.
  app.post(`${P}/ai/calendar-draft`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    try {
      const today = deps.getTodayIST();
      const body = await c.req.json().catch(() => ({}));
      const from = body.from || today;
      const to = body.to || addDaysISO(from, DRAFT_DAYS);
      const added = await draftCalendarDays(deps, from, to, 'manual', aiUser(g.actor!));
      return c.json({ added: added.length, suggestions: await pendingSuggestions(deps.kv, today) });
    } catch (err) { return fail(c, err); }
  });

  // The waiting list of drafted days, and when the last draft ran.
  app.get(`${P}/calendar-suggestions`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    const [suggestions, lastRun] = await Promise.all([pendingSuggestions(deps.kv, deps.getTodayIST()), deps.kv.get<any>(LAST_DRAFT_KEY)]);
    return c.json({ suggestions, lastRun: lastRun || null });
  });

  app.post(`${P}/calendar-suggestions/:date/accept`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    const date = c.req.param('date');
    const s = await deps.kv.get<CalendarSuggestion>(`calendar-suggestion:${date}`);
    if (!s) return c.json({ error: 'That day is no longer waiting - it may already have been added or skipped' }, 404);
    const event = {
      date, name: s.name, effect: s.effect, note: s.reason || undefined, confirmed: true, source: 'ai',
      updatedBy: g.actor!.name, updatedAt: new Date().toISOString(),
    };
    await deps.kv.set(`store-calendar:${date}`, event);
    await deps.kv.del(`calendar-suggestion:${date}`);
    return c.json({ event });
  });

  app.post(`${P}/calendar-suggestions/:date/dismiss`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    const date = c.req.param('date');
    const s = await deps.kv.get<CalendarSuggestion>(`calendar-suggestion:${date}`);
    await deps.kv.set(`calendar-dismissed:${date}`, { date, name: s?.name || null, by: g.actor!.name, at: new Date().toISOString() });
    await deps.kv.del(`calendar-suggestion:${date}`);
    return c.json({ success: true });
  });

  // Weekly draft (pg_cron, Mondays 6 AM IST - see the weekly_calendar_draft_cron migration).
  // Skipped when someone drafted in the last 5 days; tells the cluster heads when there are new days.
  app.post(`${P}/cron/calendar-draft`, async (c: any) => {
    const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
    if (!expectedSecret || c.req.header('X-Cron-Secret') !== expectedSecret) return c.json({ error: 'Unauthorized' }, 401);
    if (!aiConfigured()) return c.json({ success: true, skipped: 'AI is not set up' });
    try {
      const today = deps.getTodayIST();
      // Tidy away days that have passed.
      for (const prefix of ['calendar-suggestion:', 'calendar-dismissed:']) {
        for (const row of (await deps.kv.getByPrefix<any>(prefix)) || []) {
          if (row?.date && row.date < today) await deps.kv.del(`${prefix}${row.date}`);
        }
      }
      const last = await deps.kv.get<any>(LAST_DRAFT_KEY);
      if (last?.at && Date.now() - Date.parse(last.at) < 5 * 86400000) return c.json({ success: true, skipped: `Drafted on ${istDay(last.at)}` });
      const added = await draftCalendarDays(deps, today, addDaysISO(today, DRAFT_DAYS), 'weekly');
      let notified = 0;
      if (added.length && deps.notifyClusterHeads) {
        const names = added.slice(0, 4).map((s) => `${WEEKDAY_SHORT[weekdayOf(s.date)]} ${Number(s.date.slice(8))} ${new Date(`${s.date}T00:00:00Z`).toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' })} ${s.name}`);
        const more = added.length > 4 ? ` and ${added.length - 4} more` : '';
        notified = await deps.notifyClusterHeads(
          'calendar_suggestions',
          added.length === 1 ? '1 festival day to check' : `${added.length} festival days to check`,
          `${names.join(', ')}${more}. Add or skip them in Analytics > Trends so the forecast and stock requests plan for them.`,
          today,
        );
      }
      return c.json({ success: true, added: added.length, notified });
    } catch (err) { return fail(c, err); }
  });

  // Shortens the older part of a long Bunny chat into a summary the chat carries forward, so a
  // long conversation keeps its context without resending every message.
  app.post(`${P}/ai/summarize-chat`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    try {
      const body = await c.req.json();
      const msgs = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string')
        .slice(-40)
        .map((m: any) => `${m.role === 'user' ? 'Person' : 'Bunny'}: ${m.content.slice(0, 2000)}`)
        .join('\n\n');
      if (!msgs) return c.json({ summary: String(body.summary || '') });
      const res = await callClaude(deps, {
        purpose: 'chat-summary',
        system: 'You summarise a conversation between a shop owner or manager and Bunny, the business assistant in their staff app, so the conversation can continue later. Keep every number, date, item, decision, request and open question. Plain English, under 200 words. No preamble.',
        effort: 'low',
        noThinking: /haiku/.test(AI_MODEL),
        maxTokens: 800,
        user: aiUser(g.actor!),
        messages: [{ role: 'user', content: `${body.summary ? `Earlier summary:\n${String(body.summary).slice(0, 3000)}\n\n` : ''}Conversation to add:\n${msgs}` }],
      });
      return c.json({ summary: textOf(res).slice(0, 3000) });
    } catch (err) { return fail(c, err); }
  });

  // Voice entry: one spoken sentence -> sales cash-count or expense fields. The app fills the form
  // with them and the person checks it before saving. About ₹0.01 a sentence on Haiku.
  app.post(`${P}/ai/voice-fill`, async (c: any) => {
    const authResult = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
    const role = authResult.user.user_metadata?.role;
    // Staff assigned to an event stall (events.ts) also enter its day close, during the event window.
    const onEventStall = async () => {
      const employeeId = authResult.user.user_metadata?.employeeId;
      if (!employeeId) return false;
      const today = new Date(Date.now() + 330 * 60_000).toISOString().slice(0, 10);
      const events = (await deps.kv.getByPrefix('event:')) || [];
      return events.some((e: any) => e?.id && !e.closedAt && e.status !== 'closed' && (e.inchargeId === employeeId || (e.staffIds || []).includes(employeeId))
        && today >= eventDay(e.startDate, -STAFF_WINDOW_BEFORE_DAYS) && today <= eventDay(e.endDate, STAFF_WINDOW_AFTER_DAYS));
    };
    if (role !== 'manager' && role !== 'cluster_head' && !(await onEventStall())) return c.json({ error: 'Only people who enter sales or expenses can use voice entry' }, 403);
    try {
      const { kind, text } = await c.req.json();
      const said = String(text || '').trim().slice(0, 600);
      if (!said) return c.json({ error: 'Nothing was heard' }, 400);
      const num = { anyOf: [{ type: 'number' }, { type: 'null' }] };
      const salesSchema = {
        type: 'object', additionalProperties: false,
        required: ['paytm', 'cash', 'cashInHand', 'unclear'],
        properties: {
          paytm: { ...num, description: 'Money received on Paytm / UPI / online today (paytm, online, UPI, GPay, PhonePe)' },
          cash: { ...num, description: 'Cash collected from sales today ("cash", "ক্যাশ" on its own)' },
          cashInHand: { ...num, description: 'Cash counted in the cash box now ("cash in hand", "হাতে আছে", "ক্যাশ বক্সে আছে")' },
          unclear: { type: 'string', description: 'Anything said that did not fit these fields, in English; empty if none' },
        },
      };
      const expenseSchema = {
        type: 'object', additionalProperties: false,
        required: ['items', 'paidWith', 'unclear'],
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object', additionalProperties: false,
              required: ['name', 'quantity', 'unit', 'packs', 'perPack', 'amount', 'pricePerPack', 'weightEachGrams'],
              properties: {
                name: { type: 'string', description: 'The item in plain English as a shop list would name it: Chicken, Onion, Coriander Leaves, Maida, Coke, Burger' },
                quantity: { ...num, description: 'Total quantity in `unit` (for packs: packs x pieces per pack)' },
                unit: { anyOf: [{ type: 'string', enum: ['kg', 'g', 'L', 'mL', 'pcs', 'bundle', 'packet'] }, { type: 'null' }] },
                packs: { ...num, description: 'Number of packs / packets / boxes / crates / cartons when bought that way ("5 burger packs" -> 5), else null' },
                perPack: { ...num, description: 'Pieces in each pack ("each having 4 burgers" -> 4), else null' },
                amount: { ...num, description: 'Total rupees paid for this line. If only a per-pack or per-piece price was said, null' },
                pricePerPack: { ...num, description: 'Price of ONE pack or piece, only when they said each / per / প্রতি / করে / ta ("200 each"), else null' },
                weightEachGrams: { ...num, description: 'Weight (or volume) of ONE piece or pack in grams, only when said ("each piece 500 g", "এক পিসের ওয়েট ৫০০ গ্রাম" -> 500, "1 kg er packet" -> 1000, "1 litre each" -> 1000), else null' },
              },
            },
          },
          paidWith: { type: 'string', enum: ['cash', 'online', 'unknown'], description: 'online = Paytm / UPI / GPay / PhonePe' },
          unclear: { type: 'string', description: 'Anything said that did not fit, in English; empty if none' },
        },
      };
      const res = await callClaude(deps, {
        purpose: 'voice',
        user: { id: authResult.user.id, isOwner: role === 'cluster_head' },
        system: VOICE_PROMPT,
        effort: 'low',
        noThinking: /haiku/.test(AI_MODEL),
        maxTokens: 1500,
        format: { type: 'json_schema', schema: kind === 'sales' ? salesSchema : expenseSchema },
        messages: [{ role: 'user', content: kind === 'sales'
          ? `The store's end-of-day cash count. They said: "${said}"`
          : `An expense (purchase) entry. They said: "${said}"` }],
      });
      let fields: any = null;
      try { fields = JSON.parse(textOf(res)); } catch { /* reported below */ }
      if (!fields) return c.json({ error: 'Could not read that - try saying it again' }, 422);
      return c.json({ fields, heard: said });
    } catch (err) { return fail(c, err); }
  });

  // Read a photographed invoice or bill (English or Bengali) into lines for the expense form.
  // Nothing is saved here - the app shows the lines for the user to check first.
  app.post(`${P}/ai/invoice-read`, async (c: any) => {
    const authResult = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
    const role = authResult.user.user_metadata?.role;
    if (role !== 'manager' && role !== 'cluster_head') return c.json({ error: 'Only people who add expenses can scan invoices' }, 403);
    if (!INVOICE_SCAN_ON) return c.json({ error: 'Invoice scanning is switched off for now. Add the bill with Add Expense instead.' }, 403);
    try {
      const { dataUrl } = await c.req.json();
      const m = typeof dataUrl === 'string' ? dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/) : null;
      if (!m) return c.json({ error: 'Send the photo as a JPEG, PNG or WebP image' }, 400);
      if (m[2].length > 5_000_000) return c.json({ error: 'The photo is too large - take it a little further away' }, 400);
      const invoiceSchema = {
        type: 'object',
        properties: {
          readable: { type: 'boolean', description: 'false if this is not a bill/invoice or cannot be read' },
          vendor: { type: 'string', description: 'Shop or supplier name, "" if not shown' },
          invoiceDate: { type: 'string', description: 'YYYY-MM-DD, "" if not shown' },
          invoiceNumber: { type: 'string', description: '"" if not shown' },
          language: { type: 'string', description: 'Language(s) the bill is written in' },
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                asWritten: { type: 'string', description: 'The line exactly as written on the bill' },
                englishName: { type: 'string', description: 'Plain English name of the item, e.g. "Onion", "Maida", "Chicken"' },
                quantity: { type: 'number', description: '0 if not shown' },
                unit: { type: 'string', description: 'kg, g, L, ml, pcs, pkt, dozen, bundle, or "" if not shown' },
                rate: { type: 'number', description: 'Price per unit, 0 if not shown' },
                amount: { type: 'number', description: 'Line total in rupees, 0 if unreadable' },
                unsure: { type: 'boolean', description: 'true if any part of this line was hard to read' },
              },
              required: ['asWritten', 'englishName', 'quantity', 'unit', 'rate', 'amount', 'unsure'],
              additionalProperties: false,
            },
          },
          billTotal: { type: 'number', description: 'Grand total printed or written on the bill, 0 if not shown' },
          note: { type: 'string', description: 'Anything the person checking should know, "" if nothing' },
        },
        required: ['readable', 'vendor', 'invoiceDate', 'invoiceNumber', 'language', 'items', 'billTotal', 'note'],
        additionalProperties: false,
      };
      const res = await callClaude(deps, {
        purpose: 'invoice',
        user: { id: authResult.user.id, isOwner: role === 'cluster_head' },
        effort: 'low',
        maxTokens: 8000,
        format: { type: 'json_schema', schema: invoiceSchema },
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
            { type: 'text', text: `This is a purchase bill or invoice for a momo shop in West Bengal. It may be printed or handwritten, in English, Bengali or both (Bengali digits ০১২৩৪৫৬৭৮৯ are 0-9). Read every purchased line. Give each item a plain English name. Rupee amounts as plain numbers. Do not invent lines or numbers - mark a line unsure if it is hard to read, and use 0 for anything you cannot see. Today is ${deps.getTodayIST()}.` },
          ],
        }],
      });
      let parsed: any = null;
      try { parsed = JSON.parse(textOf(res)); } catch { /* handled below */ }
      if (!parsed) throw new AiError('Could not read that photo - try again with the whole bill in the frame.', 502);
      return c.json({ invoice: parsed });
    } catch (err) { return fail(c, err); }
  });

  // ---- Growing the business (owner, 30 Oct 2026: menu engineering + combos, the apps' own
  // reports, weather) ----

  // POST /ai/menu-ideas {storeId, lang, facts} - Bunny's menu, price and combo ideas from the
  // menu numbers the Items tab works out (menuMath.ts). Same numbers, same ideas: kept for a day.
  app.post(`${P}/ai/menu-ideas`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    try {
      const body = await c.req.json().catch(() => ({}));
      const lang = ['bn', 'hi'].includes(body.lang) ? body.lang : 'en';
      const facts = JSON.stringify(body.facts || {}).slice(0, 6000);
      const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${lang}|${facts}`)))).slice(0, 10).map((b) => b.toString(16).padStart(2, '0')).join('');
      const key = `menu-ideas:${String(body.storeId || 'all').slice(0, 60)}:${hash}`;
      const cached = await deps.kv.get<any>(key);
      if (cached?.ideas) return c.json({ ideas: cached.ideas, cached: true });
      const schema = {
        type: 'object', additionalProperties: false, required: ['ideas'],
        properties: { ideas: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'title', 'why', 'action'], properties: {
          kind: { type: 'string', enum: ['combo', 'price', 'promote', 'drop', 'upsell', 'other'] },
          title: { type: 'string' }, why: { type: 'string' }, action: { type: 'string' },
        } } } },
      };
      const res = await callClaude(deps, {
        purpose: 'menu-ideas', user: aiUser(g.actor!), effort: 'low', noThinking: /haiku/.test(AI_MODEL), maxTokens: 1500,
        format: { type: 'json_schema', schema },
        system: `You advise the owner of Bunny Momos, a small momo shop in Burdwan, West Bengal (counter plus Zomato and Swiggy). You get the menu numbers for a period: dishes with plates sold, sales, share through the apps and change against the period before; preparation styles; the long tail of dishes that hardly sell; how often orders include a drink or soup; which kinds are bought together and how much more often than chance (lift). Give 3 to 5 ideas that would raise sales or profit, each tied to the numbers: combos to make (with a sensible price), dishes to push or to take off the menu (a shorter menu means less waste and faster cooking), upsells at the counter, price tests. Food cost per plate is not known yet, so never claim a margin. Quote the numbers you use. Plain, short sentences. Write in ${lang === 'bn' ? 'simple Bengali' : lang === 'hi' ? 'simple Hindi' : 'plain English'}; dish names may stay in English.`,
        messages: [{ role: 'user', content: `Menu numbers:\n${facts}` }],
      });
      let parsed: any = null;
      try { parsed = JSON.parse(textOf(res)); } catch { /* handled below */ }
      const ideas = (Array.isArray(parsed?.ideas) ? parsed.ideas : []).slice(0, 5).map((x: any) => ({
        kind: String(x?.kind || 'other').slice(0, 10), title: String(x?.title || '').slice(0, 120), why: String(x?.why || '').slice(0, 400), action: String(x?.action || '').slice(0, 300),
      })).filter((x: any) => x.title);
      if (!ideas.length) throw new AiError('Bunny had no menu ideas this time - try again.', 502);
      await deps.kv.set(key, { ideas, at: new Date().toISOString() });
      return c.json({ ideas });
    } catch (err) { return fail(c, err); }
  });

  // POST /ai/app-report {storeId, dataUrl} - Bunny reads a screenshot of the Zomato or Swiggy
  // partner app's report (rating, orders, menu-to-order conversion, kitchen prep time, rejected
  // and delayed orders, complaints) and keeps it per store, app and period; GET /app-reports lists
  // them for the Revenue tab. The apps share none of this any other way.
  app.post(`${P}/ai/app-report`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    try {
      const body = await c.req.json().catch(() => ({}));
      const m = typeof body.dataUrl === 'string' ? body.dataUrl.match(/^data:(image\/(?:jpeg|png|webp));base64,(.+)$/) : null;
      if (!m) return c.json({ error: 'Send the screenshot as a JPEG, PNG or WebP image' }, 400);
      if (m[2].length > 5_000_000) return c.json({ error: 'The screenshot is too large' }, 400);
      const num = { type: 'number', description: '-1 if not shown' };
      const schema = {
        type: 'object', additionalProperties: false,
        required: ['readable', 'platform', 'periodStart', 'periodEnd', 'rating', 'ratingCount', 'orders', 'sales', 'menuOpens', 'menuToOrderPct', 'impressions', 'prepMinutes', 'rejectedOrders', 'delayedOrdersPct', 'complaints', 'adSpend', 'note'],
        properties: {
          readable: { type: 'boolean', description: 'false if this is not a Zomato or Swiggy partner report' },
          platform: { type: 'string', enum: ['zomato', 'swiggy', 'unknown'] },
          periodStart: { type: 'string', description: 'YYYY-MM-DD, "" if not shown' }, periodEnd: { type: 'string', description: 'YYYY-MM-DD, "" if not shown' },
          rating: num, ratingCount: num, orders: num, sales: num, menuOpens: num,
          menuToOrderPct: { type: 'number', description: 'menu opens to orders, %; -1 if not shown' },
          impressions: num, prepMinutes: { type: 'number', description: 'average kitchen preparation time in minutes; -1 if not shown' },
          rejectedOrders: num, delayedOrdersPct: num, complaints: num, adSpend: num,
          note: { type: 'string', description: 'anything else on the screen worth the owner knowing, one sentence' },
        },
      };
      const res = await callClaude(deps, {
        purpose: 'app-report', user: aiUser(g.actor!), effort: 'low', maxTokens: 1200,
        format: { type: 'json_schema', schema },
        messages: [{ role: 'user', content: [
          { type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } },
          { type: 'text', text: `This is a screenshot from the Zomato or Swiggy restaurant partner app of a momo shop. Read the report numbers exactly as shown (rupees and counts as plain numbers, ratings to one decimal). Use -1 for anything not on the screen - never guess. Today is ${deps.getTodayIST()}.` },
        ] }],
      });
      let r: any = null;
      try { r = JSON.parse(textOf(res)); } catch { /* handled below */ }
      if (!r || !r.readable || r.platform === 'unknown') return c.json({ error: 'That does not look like a Zomato or Swiggy report - take a screenshot of the report screen' }, 400);
      const storeId = String(body.storeId || '').slice(0, 60) || 'all';
      const end = /^\d{4}-\d{2}-\d{2}$/.test(r.periodEnd) ? r.periodEnd : deps.getTodayIST();
      const report = { ...r, storeId, periodEnd: end, savedAt: new Date().toISOString(), savedBy: g.actor!.name };
      await deps.kv.set(`app-report:${storeId}:${r.platform}:${end}`, report);
      return c.json({ report });
    } catch (err) { return fail(c, err); }
  });
  app.get(`${P}/app-reports`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    try {
      const storeId = c.req.query('storeId') || '';
      const rows = (await allRows(deps, 'app-report:')).filter((r: any) => r?.platform && (!storeId || r.storeId === storeId || r.storeId === 'all'));
      rows.sort((a: any, b: any) => String(b.periodEnd).localeCompare(String(a.periodEnd)));
      return c.json({ reports: rows.slice(0, 40) });
    } catch (err) { return fail(c, err); }
  });

  // GET /insights/weather - daily rain and temperature for Burdwan: the last 92 days and the next
  // 7 (Open-Meteo, free, no key), kept 3 hours.
  app.get(`${P}/insights/weather`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    try {
      const cached = await deps.kv.get<any>('weather-cache');
      if (cached?.at && Date.now() - Date.parse(cached.at) < 3 * 3600000) return c.json({ days: cached.days, cached: true });
      const url = 'https://api.open-meteo.com/v1/forecast?latitude=23.2324&longitude=87.8615&daily=precipitation_sum,precipitation_probability_max,temperature_2m_max&past_days=92&forecast_days=8&timezone=Asia%2FKolkata';
      const res = await fetch(url);
      if (!res.ok) throw new Error(`weather ${res.status}`);
      const j: any = await res.json();
      const d = j?.daily || {};
      const days = (d.time || []).map((date: string, i: number) => ({
        date, rainMm: Number(d.precipitation_sum?.[i] ?? 0), rainChance: d.precipitation_probability_max?.[i] ?? null, maxC: d.temperature_2m_max?.[i] ?? null,
      }));
      await deps.kv.set('weather-cache', { at: new Date().toISOString(), days });
      return c.json({ days });
    } catch (err) { return fail(c, err); }
  });

  // "Ask Bunny": a question answered from the app's data. Claude can only read, never change.
  // Ask Bunny - the chat behind the floating Bunny button on every screen. Answers in the person's
  // chosen language, about the screen they're looking at (its visible text comes with the
  // question, private parts already left out by the app), and suggests follow-up questions.
  app.post(`${P}/ai/ask`, async (c: any) => {
    const g = await guard(c, 'view'); if (g.error) return g.error;
    try {
      const actor = g.actor!;
      const body = await c.req.json();
      // A store incharge asks about their own store only.
      const storeId = actor.designation === 'store_incharge' && actor.storeId ? actor.storeId : (body.storeId || null);
      const language = LANGUAGES[body.language as keyof typeof LANGUAGES] ? body.language as keyof typeof LANGUAGES : 'en';
      const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-12)
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));
      if (!history.length || history[history.length - 1].role !== 'user') return c.json({ error: 'Ask a question' }, 400);
      const today = deps.getTodayIST();
      // A long chat arrives as a summary of its older part plus the recent messages (the app
      // keeps the full history on the phone - see /ai/summarize-chat).
      const earlier = typeof body.summary === 'string' && body.summary.trim()
        ? `Summary of the earlier part of this conversation:\n${body.summary.trim().slice(0, 3000)}\n\n`
        : '';
      if (earlier) history[0] = { role: history[0].role, content: `${earlier}${history[0].content}` };
      const screen = body.screen && typeof body.screen === 'object' ? body.screen : null;
      const screenText = screen?.text ? scrubPrivate(String(screen.text)).slice(0, 6000) : '';
      const screenPart = screen
        ? `The person is on the "${String(screen.page || '').slice(0, 40)}${screen.tab ? ` > ${String(screen.tab).slice(0, 40)}` : ''}" screen of the app.${screenText ? ` What that screen shows right now:\n<screen>\n${screenText}\n</screen>` : ''}\n\n`
        : '';
      history[history.length - 1] = {
        role: 'user',
        content: `(Today is ${WEEKDAY_SHORT[weekdayOf(today)]} ${today}. Answer in ${LANGUAGES[language]}.)\n\n${screenPart}Question: ${history[history.length - 1].content}`,
      };
      const { raw, used } = await askLoop(deps, { messages: history, storeId, user: aiUser(actor) });
      if (raw === null) return c.json({ answer: TOO_MANY_LOOKUPS, followUps: [], toolsUsed: used });
      const { answer, followUps } = splitFollowUps(raw);
      return c.json({ answer: answer || 'No answer.', followUps, toolsUsed: used });
    } catch (err) { return fail(c, err); }
  });
}

const TOO_MANY_LOOKUPS = 'That needed more look-ups than allowed - try a narrower question.';
// Rupee figures, for answers that may not show them (Bunny in the team chat, below).
const MONEY_TOOLS = new Set(['get_expenses', 'get_online_costs']);
const MONEY_KEY = /revenue|amount|cost|price|profit|rupee|commission|payout|spend/i;
function withoutMoney(value: any): any {
  if (Array.isArray(value)) return value.map(withoutMoney);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([k]) => !MONEY_KEY.test(k)).map(([k, v]) => [k, withoutMoney(v)]));
  return value;
}

/** Ask Bunny's look-up loop: up to 6 turns of tools, then the answer (null when it ran out of turns).
 *  With noMoney the expense and Zomato/Swiggy tools are gone and rupee fields are cut from the rest. */
async function askLoop(deps: Deps, o: { messages: any[]; storeId: string | null; user: AiUser; noMoney?: boolean }): Promise<{ raw: string | null; used: string[] }> {
  const tools = o.noMoney ? ASK_TOOLS.filter((t) => !MONEY_TOOLS.has(t.name)) : ASK_TOOLS;
  const used: string[] = [];
  for (let turn = 0; turn < 6; turn++) {
    const res = await callClaude(deps, { purpose: 'ask', effort: 'medium', maxTokens: 6000, tools, messages: o.messages, user: o.user });
    if (res.stop_reason !== 'tool_use') return { raw: textOf(res), used };
    o.messages.push({ role: 'assistant', content: res.content });
    const results = [];
    for (const block of res.content.filter((b: any) => b.type === 'tool_use')) {
      used.push(block.name);
      let content: string;
      try {
        if (o.noMoney && MONEY_TOOLS.has(block.name)) throw new Error('Not available in this chat');
        const out = await runTool(deps, o.storeId, block.name, block.input);
        content = JSON.stringify(o.noMoney ? withoutMoney(out) : out).slice(0, 60000);
      } catch (toolErr: any) {
        results.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${toolErr?.message || toolErr}`, is_error: true });
        continue;
      }
      results.push({ type: 'tool_result', tool_use_id: block.id, content });
    }
    o.messages.push({ role: 'user', content: results });
  }
  return { raw: null, used };
}

// ---------------- Bunny in the team chat (chat.ts) ----------------
// Owner, 1 Nov 2026: "will bunny be available in chat" -> yes: everyone has a one-to-one chat with
// Bunny, and "@Bunny" in a group asks it there. Same tools and per-person allowance as Ask Bunny.
// Rupee figures only in a one-to-one with someone who already sees them in Ask Bunny (owner,
// operations, incharges): a group answer is read by the whole group, and the crew never get them.
const scriptLanguage = (text: string): keyof typeof LANGUAGES => (/[ঀ-৿]/.test(text) ? 'bn' : /[ऀ-ॿ]/.test(text) ? 'hi' : 'en');

export async function askBunnyInChat(deps: Deps, o: {
  userId: string; role: string; storeId: string | null; noMoney: boolean;
  where: string; // 'a one-to-one chat with Rohan' or 'the "Bunny Momos 1" group chat'
  messages: { role: 'user' | 'assistant'; content: string }[]; // oldest first, ending with the question
}): Promise<string> {
  const today = deps.getTodayIST();
  const messages: any[] = o.messages.map((m) => ({ ...m }));
  const last = messages[messages.length - 1];
  const language = scriptLanguage(last.content);
  last.content = `(Today is ${WEEKDAY_SHORT[weekdayOf(today)]} ${today}. Answer in ${LANGUAGES[language]}${language === 'en' ? ', or in Bengali or Hindi written in English letters if the question is written that way' : ''}.)\n\n`
    + `You are replying in ${o.where} in the Bunny Momos team chat: one chat message under 120 words, plain sentences, no headings, tables or lists.`
    + (o.noMoney ? ' Rupee figures (sales value, costs, profit, commission, prices, pay) are not for this chat: never give them. If asked, say the owner or an incharge can ask Bunny in their own one-to-one chat with Bunny.' : '')
    + `\n\nQuestion: ${last.content}`;
  const { raw } = await askLoop(deps, { messages, storeId: o.storeId, user: { id: o.userId, isOwner: o.role === 'cluster_head' }, noMoney: o.noMoney });
  return raw === null ? TOO_MANY_LOOKUPS : (splitFollowUps(raw).answer || 'No answer.').slice(0, 1900);
}

// ---------------- Workplace photo hygiene score (workplace.ts) ----------------
// Scores one workplace-check photo 0-10 for cleanliness with the vision model (Haiku by default,
// about ₹0.02 a photo). No person is passed to callClaude, so staff photo uploads don't use anyone's
// chat allowance; the cost still counts toward the monthly ₹ limit. Self-contained on purpose:
// other features append their own exports to this file too.

export type PhotoHygieneScore = {
  score: number;
  verdict: 'clean' | 'needs_cleaning' | 'unclear_photo';
  issues: string[];
  issuesBengali: string[];
  whatIsShown: string;
  severe: boolean; // garbage dump, overflowing waste, pests or filth: raised at once (workplace.ts)
};

// What "clean" means for each kind of area, matched on the check's English name. Order matters:
// "Post-steaming table" is a table, "Dining area fan" a fan, "Garbage/back area" the garbage area.
const HYGIENE_RUBRICS: [RegExp, string][] = [
  [/garbage|dustbin|\bbins?\b|waste|back area/i, 'Garbage / back area: bins covered with lids and not overflowing, no spilled or loose waste on the floor, no heap or dump of garbage anywhere in view, no flies or pests, floor swept.'],
  [/\bfans?\b/i, 'Fan: blades and motor cover free of dust, grease and cobwebs.'],
  [/light|bulb|tube/i, 'Lights: no dust, cobwebs or dead insects on or around the lights; fittings intact.'],
  [/table|surface|counter|slab/i, 'Table / work surface: dry, no food bits, dough or flour clumps, no stains, oil or spills, nothing unrelated left lying on it.'],
  [/fryer|kadai|karahi/i, 'Fryer: no burnt residue or black crust, no old oil spills or drips on the body, stand or floor, oil not dark and foamy, outside wiped.'],
  [/steam/i, 'Steamer: no stuck dough or momo bits on trays, lids or racks, no scale or slime, water area clean, outside wiped.'],
  [/crate|basket|tray/i, 'Crates / trays: washed, no dough, food bits or stains, dry and stacked neatly off the floor.'],
  [/freez|fridge|refrigerat|chiller/i, 'Freezer: door seal clean, no heavy ice build-up, no open or torn packs, no spills or pooled water or blood, items covered and stacked.'],
  [/front|entrance|shutter/i, 'Shop front: entrance and counter area swept and wiped, no litter or stains, things arranged neatly.'],
  [/wall/i, 'Walls: no stains, splashes, oil marks, cobwebs or mould.'],
  [/equipment|machine|utensil|mixer|grinder/i, 'Equipment: no food residue or grease build-up, stored clean and dry, nothing broken or unsafe.'],
  [/kitchen|floor|area|room/i, 'Kitchen area: floor swept and mopped, no water pooling, no food waste, corners clean, things stored off the floor.'],
];
const GENERAL_RUBRIC = 'General: clean, dry and in order - no dirt, food waste, stains, grease, dust, cobwebs or clutter.';

const HYGIENE_SYSTEM = `You check daily hygiene photos for Bunny Momos, a momo shop and production kitchen in West Bengal, India. Staff photograph each area every afternoon to prove it is clean and in order.
- Judge only what the photo shows. Do not assume dirt you cannot see, and do not excuse dirt you can see.
- Simple, low-cost premises are normal: judge cleanliness and order, not how new or fancy things are. Old but clean equipment is clean.
- Score 0-10: 9-10 spotless; 7-8 clean, at most a tiny issue; 5-6 needs a wipe or tidy now; 3-4 clearly dirty; 0-2 very dirty or unsafe for food.
- verdict "clean" if nothing needs doing before the next service, "needs_cleaning" if something should be cleaned now, "unclear_photo" if the photo is too dark, blurred, too close, or does not show the named area (then score 0 and say what is wrong with the photo).
- issues: up to 4 short, specific English phrases a worker can act on (e.g. "oil drips on fryer side"), empty if clean. issuesBengali: the same issues in simple everyday Bengali, same order.
- whatIsShown: one short English sentence describing what the photo shows.
- severe: true only for a serious problem the incharge must deal with now - a large heap or dump of garbage, waste piled or spilling well beyond the bin, garbage left lying around, rotting food, pests (rats, cockroaches, swarms of flies), or filth that makes the area unsafe for food. A small tidy-up or a wipe is not severe. Always false for unclear_photo.`;

const hygieneSchema = {
  type: 'object',
  properties: {
    score: { type: 'integer', description: 'Cleanliness 0-10' },
    verdict: { type: 'string', enum: ['clean', 'needs_cleaning', 'unclear_photo'] },
    issues: { type: 'array', items: { type: 'string' }, description: 'Short English phrases, at most 4' },
    issuesBengali: { type: 'array', items: { type: 'string' }, description: 'The same issues in simple Bengali' },
    whatIsShown: { type: 'string' },
    severe: { type: 'boolean', description: 'A garbage dump, overflowing waste, pests, rotting food or filth unsafe for food' },
  },
  required: ['score', 'verdict', 'issues', 'issuesBengali', 'whatIsShown', 'severe'],
  additionalProperties: false,
};

// A camera still (cctv.ts): who is in view and, for each person, whether the kitchen PPE is on.
// "unclear" whenever the item can't be seen (turned away, out of frame, too small) - only a clear
// "no" raises an alert.
// What each activity looks like, shared by both camera prompts (owner, 30 Oct 2026: two men peeling
// onions were read as folding and idle - folding only with momo wrappers or momos in view).
// Folding needs the stuffing and the sheets on the table (owner, 31 Oct 2026: "folding should also have
// the stuffing on table... it should also have those sheets"). Vijay folding on 30 Oct 14:01: seated at
// the wooden table, a big bowl of stuffing, a stack of round dough sheets and rows of folded momos in
// front of him. Not folding: the same table with stuffing but no sheets and a phone in his hand (30 Oct
// 11:40), carrying a crate of folded momos (30 Oct 16:19), standing at it with a pot (31 Oct 11:43).
const ACTIVITY_GUIDE = 'folding = shaping or pleating momos by hand - ALL of these on the table or tray right in front of them: a bowl of stuffing (the minced filling), a stack of the thin round white dough sheets (wrappers), and folded momos in rows; the hands busy wrapping. A table with stuffing but no sheets, or no folded momos, is not folding, nor is standing at the table with a pot, a knife or vegetables, or carrying a crate of momos; '
  + 'machine = at a dough or sheeting machine, rolling or cutting dough; '
  + 'prep = peeling, cutting or chopping vegetables (onion, cabbage, coriander, garlic) - whole vegetables, peels, a knife or a big bowl of vegetables in front of them, often sitting on a stool; '
  + 'filling = mixing the chopped filling in a big bowl or tray by hand; cooking = steaming, frying or at the stove; packing = putting momos in bags, boxes or crates; '
  + 'cleaning = washing, wiping, sweeping; phone = looking at or talking on a phone; '
  + 'idle = standing or sitting with empty hands, not working (someone holding vegetables, a bowl or a tray is working); other = anything else, or walking. '
  + 'When the hands are hidden, judge by what is in front of them: call it folding only when the stuffing, the dough sheets and folded momos can all be seen';
const COLOURS = ['red', 'orange', 'yellow', 'green', 'teal', 'blue', 'navy', 'purple', 'pink', 'white', 'grey', 'black', 'brown', 'beige', 'patterned', 'other'];
const TROUSERS = { type: 'string', enum: [...COLOURS, 'unseen'] };
const CAMERA_SYSTEM = 'You check still frames from a food-business CCTV camera (a momo kitchen in India). Count the people in the frame (staff in aprons, delivery riders, anyone - not people in posters, screens or reflections). For each person say whether they wear a head covering (cap, hairnet or bandana), gloves on both visible hands, and an apron. Answer "yes" or "no" only when it is clearly visible; otherwise "unclear". Infrared night images are grey: still count people. Also, for each person: the main colour of their top (shirt / t-shirt / kurta - not the apron or hairnet), the main colour of their trousers (pants, jeans or lungi; "unseen" if the legs are hidden), what they are doing right now (' + ACTIVITY_GUIDE + '), and whether a phone is in their hand or at their ear.';
const yesNo = { type: 'string', enum: ['yes', 'no', 'unclear'] };
const cameraSchema = {
  type: 'object',
  properties: {
    peopleCount: { type: 'integer', description: 'People in the frame' },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          where: { type: 'string', description: 'Where in the frame, a few words' }, cap: yesNo, gloves: yesNo, apron: yesNo,
          top: { type: 'string', enum: COLOURS },
          bottom: TROUSERS,
          activity: { type: 'string', enum: ['folding', 'machine', 'prep', 'filling', 'cooking', 'packing', 'cleaning', 'phone', 'idle', 'other'] },
          phone: { type: 'string', enum: ['in_hand', 'at_ear', 'none', 'unclear'] },
        },
        required: ['where', 'cap', 'gloves', 'apron', 'top', 'bottom', 'activity', 'phone'],
        additionalProperties: false,
      },
    },
    note: { type: 'string', description: 'One short sentence on what the frame shows' },
  },
  required: ['peopleCount', 'people', 'note'],
  additionalProperties: false,
};
export type CameraLook = {
  peopleCount: number;
  people: { where: string; cap: string; gloves: string; apron: string; top: string; bottom: string; activity: string; phone: string }[];
  note: string;
};

export async function aiLookAtCamera(kv: Kv, frame: { base64: string; mediaType: string; place: string; notes?: string }): Promise<CameraLook> {
  const deps = { kv, verifyUser: async () => ({ error: 'unused', status: 401 }), getTodayIST: () => istDay(new Date().toISOString()) } as Deps;
  const res = await callClaude(deps, {
    purpose: 'camera',
    system: CAMERA_SYSTEM,
    effort: 'low',
    noThinking: true,
    maxTokens: 1200,
    format: { type: 'json_schema', schema: cameraSchema },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: frame.mediaType, data: frame.base64 } },
        { type: 'text', text: `Camera: ${frame.place.slice(0, 80)}.${frame.notes ? ` About this kitchen: ${frame.notes.slice(0, 400)}` : ''}` },
      ],
    }],
  });
  let parsed: any = null;
  try { parsed = JSON.parse(textOf(res)); } catch { /* handled below */ }
  if (!parsed || typeof parsed.peopleCount !== 'number') throw new AiError('The camera check returned nothing.', 502);
  const one = (v: any) => (['yes', 'no', 'unclear'].includes(v) ? v : 'unclear');
  const people = (Array.isArray(parsed.people) ? parsed.people : []).slice(0, 12).map((p: any) => ({
    where: String(p?.where || '').slice(0, 60), cap: one(p?.cap), gloves: one(p?.gloves), apron: one(p?.apron),
    top: String(p?.top || 'other').slice(0, 20), bottom: String(p?.bottom || 'unseen').slice(0, 20), activity: String(p?.activity || 'other').slice(0, 20), phone: String(p?.phone || 'unclear').slice(0, 20),
  }));
  return { peopleCount: Math.max(people.length, Math.min(30, Math.round(parsed.peopleCount))), people, note: String(parsed.note || '').slice(0, 200) };
}

// Bunny's word for the production incharge (index.ts coach route, owner 29 Oct 2026: "revamp it
// for easy understanding with AI integration for proper handholding of the production incharge").
// The screen works the numbers out; this only puts them in plain words, in the reader's language.
const COACH_SYSTEM = `You are Bunny, the helper inside Bunny Momos' kitchen app. You talk to the production incharge of a small momo kitchen in West Bengal (or to the owner, for a summary). You get the day's kitchen stock as JSON: for each item (dough, batter, each stuffing) what was weighed in the morning, what was made, how many momos it is worth, today's plan, what should be left and what was counted at night.
- Use ONLY the numbers given. Never invent a number. Round to one decimal.
- Write 2 to 5 short lines, each a plain sentence a busy cook understands at a glance. No greetings, no lists of every item - only what matters today.
- morning: say what is already in the kitchen and covers today's plan (so it must not be made), and how much of each item to make. If an item was last weighed days ago, say to weigh it first. Frozen stuffing (frozenThawHours) takes that many hours to thaw: say to take it out now, make freshForMorningKg fresh for the folding until then and use the thawed stuffing after; if frozenLeftAgainTonightKg is set, say that much will be left again tonight and that tonight tomorrow's share should go in the fridge to thaw so it is ready in the morning.
- night: say which counts look wrong against what should be left, and what to check (weigh again, waste not logged, momos not entered). If everything matches, say so in one line.
- summary: for the owner - what was started with, made, used and left, the biggest gap or overproduction, in 2-4 lines.
- Language: write in the language asked for (bn = simple everyday Bengali in Bengali script, hi = simple Hindi in Devanagari, en = plain English). Item names may stay in English.`;

export async function aiProductionCoach(kv: Kv, o: { stage: string; lang: string; facts: string }): Promise<string> {
  const deps = { kv, verifyUser: async () => ({ error: 'unused', status: 401 }), getTodayIST: () => istDay(new Date().toISOString()) } as Deps;
  const res = await callClaude(deps, {
    purpose: 'production-coach',
    system: COACH_SYSTEM,
    effort: 'low',
    noThinking: true,
    maxTokens: 600,
    messages: [{ role: 'user', content: `Stage: ${o.stage}. Language: ${o.lang}.\nKitchen stock:\n${o.facts}` }],
  });
  const text = textOf(res).trim();
  if (!text) throw new AiError('Bunny had nothing to say.', 502);
  return text.slice(0, 900);
}

// A burst from a kitchen-activity camera (cctv.ts, owner 29 Oct 2026 "for better detection"):
// 20 frames 15 seconds apart, looked at together so each person is followed through the minutes
// and what they do is judged from the movement across frames, not one frozen moment.
const BURST_SYSTEM = `You watch a short burst of CCTV frames from a momo kitchen in India: the same camera, frames in order, a fixed number of seconds apart.
- List each distinct person seen in any frame once, following them from frame to frame by their clothes and where they are. Not people in posters, screens or reflections.
- top: the main colour of their top (shirt / t-shirt / kurta - not the apron or hairnet).
- bottom: the main colour of their trousers (pants, jeans or lungi); "unseen" if the legs are hidden in every frame. Two people in the same colour top are told apart by this.
- activities: one entry per frame, in order, exactly as many as there are frames: what they are doing in that frame, using the frames before and after to tell (${ACTIVITY_GUIDE}; away = not in this frame).
- phoneFrames: the frame numbers (1 = first) where a phone is in their hand or at their ear.
- cap (head covering: cap, hairnet or bandana), gloves (on both visible hands), apron: judged across the frames. "no" only when the item is clearly missing in most frames where the person is clearly visible; "yes" when clearly worn; otherwise "unclear".
- bestFrame: the frame number where this person is seen most clearly.
- evidenceFrame: the frame number that best shows someone without a cap, gloves or apron; if nobody is missing anything, the clearest frame.
- peopleCount: the most people in any one frame.`;
const burstSchema = {
  type: 'object',
  properties: {
    peopleCount: { type: 'integer', description: 'The most people in any one frame' },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          where: { type: 'string', description: 'Where they mostly are in the frame, a few words' },
          top: cameraSchema.properties.people.items.properties.top,
          bottom: TROUSERS,
          cap: yesNo, gloves: yesNo, apron: yesNo,
          activities: { type: 'array', items: { type: 'string', enum: ['folding', 'machine', 'prep', 'filling', 'cooking', 'packing', 'cleaning', 'phone', 'idle', 'other', 'away'] } },
          phoneFrames: { type: 'array', items: { type: 'integer' } },
          bestFrame: { type: 'integer' },
        },
        required: ['where', 'top', 'bottom', 'cap', 'gloves', 'apron', 'activities', 'phoneFrames', 'bestFrame'],
        additionalProperties: false,
      },
    },
    evidenceFrame: { type: 'integer' },
    note: { type: 'string', description: 'One short sentence on what the burst shows' },
  },
  required: ['peopleCount', 'people', 'evidenceFrame', 'note'],
  additionalProperties: false,
};
// The numbered burst (owner, 30 Oct 2026: two men in red were one person, and trouser colours in words
// didn't hold): the camera PC finds the people and draws a numbered box round each (numbers hold
// within the burst); Bunny gets reference photos of the people seen earlier today and says which of
// them each box is - so a person's minutes stay theirs all day - and what each is doing.
const NUMBERED_SYSTEM = `You watch a short burst of CCTV frames from a momo kitchen in India: the same camera, frames in order, a fixed number of seconds apart. Each person has been found and marked with a coloured box with a number in its corner; the same number is the same person all through this burst.
- List each numbered box that holds a real person once, by its number (box). Leave out a box round an object - a sack, bag, bucket, water jar, coat or apron on a hook, anything without a human head and body - and people in posters, screens or reflections.
- Someone clearly in the kitchen in these frames who never got a box (seated far back, cut off by the edge): list them too, with box 0.
- known: which of today's known people this is (their reference photos come first, each with its number), judged by clothes, cap or hairnet, build and anything printed on the top; 0 if it is none of them (someone new today). Two boxes may be the same known person if the boxing lost them for a while. Don't guess: 0 is better than the wrong person.
- top: the main colour of their top (shirt / t-shirt / kurta - not the apron or hairnet).
- activities: one entry per frame, in order, exactly as many as there are frames: what they are doing in that frame, using the frames before and after to tell (${ACTIVITY_GUIDE}). If the box missed them in a frame where they are still clearly there, still say what they are doing; away = not in the frame at all.
- phoneFrames: the frame numbers (1 = first) where a phone is in their hand or at their ear.
- cap (head covering: cap, hairnet or bandana), gloves (on both visible hands), apron: judged across the frames. "no" only when the item is clearly missing in most frames where the person is clearly visible; "yes" when clearly worn; otherwise "unclear".
- bestFrame: the frame number where this person is seen most clearly.
- evidenceFrame: the frame number that best shows someone without a cap, gloves or apron; if nobody is missing anything, the clearest frame.
- peopleCount: the most boxed people in any one frame.`;
const numberedSchema = {
  type: 'object',
  properties: {
    peopleCount: { type: 'integer' },
    people: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          box: { type: 'integer', description: 'The number on their box; 0 if they never got one' },
          known: { type: 'integer', description: "Today's known person this is, or 0 if new" },
          where: { type: 'string', description: 'Where they mostly are in the frame, a few words' },
          top: cameraSchema.properties.people.items.properties.top,
          cap: yesNo, gloves: yesNo, apron: yesNo,
          activities: { type: 'array', items: { type: 'string', enum: ['folding', 'machine', 'prep', 'filling', 'cooking', 'packing', 'cleaning', 'phone', 'idle', 'other', 'away'] } },
          phoneFrames: { type: 'array', items: { type: 'integer' } },
          bestFrame: { type: 'integer' },
        },
        required: ['box', 'known', 'where', 'top', 'cap', 'gloves', 'apron', 'activities', 'phoneFrames', 'bestFrame'],
        additionalProperties: false,
      },
    },
    evidenceFrame: { type: 'integer' },
    note: { type: 'string', description: 'One short sentence on what the burst shows' },
  },
  required: ['peopleCount', 'people', 'evidenceFrame', 'note'],
  additionalProperties: false,
};

export type BurstLook = {
  peopleCount: number;
  people: { where: string; top: string; bottom: string; cap: string; gloves: string; apron: string; activities: string[]; phoneFrames: number[]; bestFrame: number; box?: number; known?: number }[];
  evidenceFrame: number;
  note: string;
};
export type BurstNumbered = {
  boxes: number[][]; // per frame, the box numbers drawn on it
  known: { id: number; images: string[] }[]; // today's people so far: reference photos (base64 JPEG)
};

export async function aiLookAtBurst(kv: Kv, burst: { frames: string[]; gapSec: number; place: string; notes?: string; numbered?: BurstNumbered }): Promise<BurstLook> {
  const deps = { kv, verifyUser: async () => ({ error: 'unused', status: 401 }), getTodayIST: () => istDay(new Date().toISOString()) } as Deps;
  const n = burst.frames.length;
  const num = burst.numbered;
  const content: any[] = [];
  if (num?.known.length) {
    content.push({ type: 'text', text: "Today's known people so far (reference photos):" });
    for (const k of num.known) {
      content.push({ type: 'text', text: `Known person ${k.id}` });
      for (const data of k.images) content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
    }
  }
  burst.frames.forEach((data, i) => {
    content.push({ type: 'text', text: num ? `Frame ${i + 1} (boxes: ${(num.boxes[i] || []).join(', ') || 'none'})` : `Frame ${i + 1}` });
    content.push({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data } });
  });
  // Spread bursts (owner, 31 Oct 2026): frames minutes apart are judged one by one.
  const spread = burst.gapSec >= 60
    ? ` The frames are spread over the last ${Math.round((n * burst.gapSec) / 60)} minutes, about ${Math.round(burst.gapSec / 6) / 10} minutes apart: people may move or switch work in between, so judge each frame mainly by what it shows (their hands, what is on the table in front of them); the frames around it are only a hint.`
    : '';
  content.push({ type: 'text', text: `Camera: ${burst.place.slice(0, 80)}.${burst.notes ? ` About this kitchen: ${burst.notes.slice(0, 400)}` : ''} ${n} frames, ${burst.gapSec} seconds apart: give each ${num ? 'numbered box' : 'person'} exactly ${n} activities.${spread}${num && !num.known.length ? ' Nobody is known yet today: every box is known 0.' : ''}` });
  const res = await callClaude(deps, {
    purpose: 'camera',
    system: num ? NUMBERED_SYSTEM : BURST_SYSTEM,
    effort: 'low',
    noThinking: true,
    maxTokens: 4000,
    format: { type: 'json_schema', schema: num ? numberedSchema : burstSchema },
    messages: [{ role: 'user', content }],
  });
  let parsed: any = null;
  try { parsed = JSON.parse(textOf(res)); } catch { /* handled below */ }
  if (!parsed || typeof parsed.peopleCount !== 'number') throw new AiError('The camera check returned nothing.', 502);
  const one = (v: any) => (['yes', 'no', 'unclear'].includes(v) ? v : 'unclear');
  const frameNo = (v: any, fallback: number) => (Number.isInteger(v) && v >= 1 && v <= n ? v : fallback);
  const boxNumbers = new Set((num?.boxes || []).flat());
  const knownIds = new Set((num?.known || []).map((k) => k.id));
  const people = (Array.isArray(parsed.people) ? parsed.people : []).slice(0, 12).map((p: any) => {
    const acts = (Array.isArray(p?.activities) ? p.activities : []).slice(0, n).map((a: any) => String(a || 'away').slice(0, 20));
    while (acts.length < n) acts.push('away');
    const firstSeen = acts.findIndex((a: string) => a !== 'away') + 1 || 1;
    return {
      where: String(p?.where || '').slice(0, 60), top: String(p?.top || 'other').slice(0, 20), bottom: String(p?.bottom || 'unseen').slice(0, 20), cap: one(p?.cap), gloves: one(p?.gloves), apron: one(p?.apron),
      activities: acts,
      phoneFrames: [...new Set((Array.isArray(p?.phoneFrames) ? p.phoneFrames : []).filter((f: any) => Number.isInteger(f) && f >= 1 && f <= n))] as number[],
      bestFrame: frameNo(p?.bestFrame, firstSeen),
      ...(num ? { box: Number(p?.box), known: knownIds.has(Number(p?.known)) ? Number(p.known) : 0 } : {}),
    };
  // A box that wasn't drawn, or listed twice: dropped (box 0 = someone the boxing never caught).
  }).filter((p: any, i: number, all: any[]) => !num || p.box === 0 || (boxNumbers.has(p.box) && all.findIndex((q: any) => q.box === p.box) === i));
  return {
    peopleCount: Math.max(people.length ? 1 : 0, Math.min(30, Math.round(parsed.peopleCount))),
    people,
    evidenceFrame: frameNo(parsed.evidenceFrame, people[0]?.bestFrame || 1),
    note: String(parsed.note || '').slice(0, 200),
  };
}

export async function aiScorePhoto(
  kv: Kv,
  photo: { base64: string; mediaType: string; itemName: string; hint?: string },
): Promise<PhotoHygieneScore> {
  const rubric = HYGIENE_RUBRICS.find(([re]) => re.test(photo.itemName))?.[1] || GENERAL_RUBRIC;
  // callClaude only reads deps.kv; the rest of Deps isn't used for a scoring call.
  const deps = { kv, verifyUser: async () => ({ error: 'unused', status: 401 }), getTodayIST: () => istDay(new Date().toISOString()) } as Deps;
  const res = await callClaude(deps, {
    purpose: 'workplace-photo',
    system: HYGIENE_SYSTEM,
    effort: 'low',
    noThinking: true,
    maxTokens: 1500,
    format: { type: 'json_schema', schema: hygieneSchema },
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'base64', media_type: photo.mediaType, data: photo.base64 } },
        { type: 'text', text: `Area: ${photo.itemName.slice(0, 80)}${photo.hint ? ` (owner's note: ${photo.hint.slice(0, 160)})` : ''}.\nWhat to check: ${rubric}` },
      ],
    }],
  });
  let parsed: any = null;
  try { parsed = JSON.parse(textOf(res)); } catch { /* handled below */ }
  if (!parsed || typeof parsed.score !== 'number') throw new AiError('The photo check returned no score.', 502);
  const verdict = ['clean', 'needs_cleaning', 'unclear_photo'].includes(parsed.verdict) ? parsed.verdict : 'unclear_photo';
  const list = (v: any) => (Array.isArray(v) ? v : []).map((s: any) => String(s || '').trim().slice(0, 120)).filter(Boolean).slice(0, 4);
  return {
    score: Math.max(0, Math.min(10, Math.round(parsed.score))),
    verdict,
    issues: list(parsed.issues),
    issuesBengali: list(parsed.issuesBengali),
    whatIsShown: String(parsed.whatIsShown || '').slice(0, 200),
    severe: parsed.severe === true && verdict !== 'unclear_photo',
  };
}
