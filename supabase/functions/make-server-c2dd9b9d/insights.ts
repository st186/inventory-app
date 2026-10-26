// Insights: festival calendar, demand forecast and the Claude-written parts (daily brief,
// weekly growth ideas, calendar draft, "Ask Bunny" chat). Registered from index.ts.
//
// The forecast itself is plain statistics (forecast.ts, shared with the app); Claude only
// writes on top of it. Only sales totals, momo counts, events, wastage, stock-outs, requests,
// production counts and expense totals by category go to Claude - never salaries, Aadhaar,
// phone numbers or other personal details.
//
// Needs the ANTHROPIC_API_KEY secret. AI_MODEL (default claude-opus-5-5) and
// AI_MONTHLY_CAP_USD (default 30) are optional secrets.

import Anthropic from 'npm:@anthropic-ai/sdk';
import {
  FORECAST_TYPES, forecastDays, learnEffects, prepareHistory, addDaysISO, weekdayOf, WEEKDAY_SHORT,
  type CalendarEvent, type DayEffect, type DayRecord, type MomoKey,
} from './forecast.ts';

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  del: (key: string) => Promise<any>;
  getByPrefix: <T = any>(prefix: string) => Promise<T[]>;
};
type Deps = { kv: Kv; verifyUser: (authHeader: string | null) => Promise<any>; getTodayIST: () => string };

const AI_MODEL = Deno.env.get('AI_MODEL') || 'claude-opus-5-5';
const AI_MONTHLY_CAP_USD = Number(Deno.env.get('AI_MONTHLY_CAP_USD') || '30');
// $ per million tokens: input, output, cache read. Cache writes cost 1.25x input.
const PRICES: Record<string, [number, number, number]> = {
  'claude-opus-5-5': [4, 20, 0.2],
  'claude-sonnet-5-5': [2, 10, 0.2],
  'claude-haiku-5-5': [0.1, 0.5, 0.01],
};
// Server-side refusal fallback: Opus and Sonnet only (Haiku has none).
const SUPPORTS_FALLBACK = /opus|sonnet|fable/.test(AI_MODEL);

const EFFECTS: DayEffect[] = ['normal', 'closed', 'low_nonveg', 'busy', 'quiet'];
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
    role,
    designation,
    // Owner side: may run the AI features and edit the calendar.
    canManage: role === 'cluster_head' || isOperationsManager,
    canView: role === 'cluster_head' || role === 'manager' || role === 'audit',
  };
}

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
    kv.getByPrefix<any>('sales:'),
    kv.getByPrefix<any>('sales_data_'),
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

async function overview(deps: Deps, storeId: string | null) {
  const today = deps.getTodayIST();
  const from = addDaysISO(today, -84);
  const [days, events] = await Promise.all([loadDays(deps.kv, storeId, from, addDaysISO(today, -1)), loadEvents(deps.kv)]);
  const eventMap = new Map(events.map((e) => [e.date, e]));
  const forecast = forecastDays(days, events, today, 7, today);
  const yesterday = addDaysISO(today, -1);
  const yActual = days.find((d) => d.date === yesterday);
  const yExpected = forecastDays(days, events, yesterday, 1, yesterday)[0];
  const learned = learnEffects(prepareHistory(days, eventMap), eventMap, today);
  return {
    today,
    storeId,
    history: days,
    events: events.filter((e) => e.date >= addDaysISO(today, -120) && e.date <= addDaysISO(today, 90)),
    forecast,
    yesterday: { date: yesterday, actual: yActual?.revenue ?? null, actualPieces: yActual?.pieces ?? null, expected: yExpected },
    learned,
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
  const cost = (input * inP + output * outP + cacheRead * cacheP + cacheWrite * inP * 1.25) / 1_000_000;
  const key = monthKey();
  const cur = (await kv.get<any>(key)) || { calls: 0, costUsd: 0, inputTokens: 0, outputTokens: 0, byPurpose: {} };
  cur.calls += 1;
  cur.costUsd = Math.round((cur.costUsd + cost) * 10000) / 10000;
  cur.inputTokens += input + cacheRead + cacheWrite;
  cur.outputTokens += output;
  cur.byPurpose[purpose] = Math.round(((cur.byPurpose[purpose] || 0) + cost) * 10000) / 10000;
  cur.model = AI_MODEL;
  await kv.set(key, cur);
}

class AiError extends Error {
  constructor(message: string, public status: number) { super(message); }
}

const SYSTEM_PROMPT = `You are Bunny, the business analyst built into the Bunny Momos staff app.

About the business:
- Bunny Momos runs one store (Bunny Momos 1) in Birhata, Bardhaman, West Bengal, and a production house that makes momos fresh every day, steams and freezes them, and sends them to the store in bags (50 chicken, 20 of every other type).
- Seven momo types: chicken, chicken cheese, chicken kurkure (non-veg); veg, cheese corn, paneer, veg kurkure (veg). Chicken is about 80% of momo revenue.
- The counter (dine-in and takeaway) is the main business. Zomato and Swiggy exist, but the owner deliberately keeps online small: never suggest growing online or spending more on the platforms.
- Bengali festivals move demand a lot. On days when many people avoid non-veg (for example Lakshmi Puja) sales roughly halve while veg holds up; festival crowds can lift sales well above normal. The store is sometimes closed on festival days.
- Revenue figures are counter plus POS-recorded online sales in rupees. Momo counts are pieces sold per type from the POS.

How to answer:
- Write for a busy owner: short, plain English, concrete numbers, and what to do. Rupees as "Rs 12,400" with Indian digit grouping.
- Use only the data you are given or fetch with your tools. If something is not in the data, say so instead of guessing.
- Name dates as "Sun 25 Oct". Today's date is given in each request.
- Never ask for or discuss individual salaries or personal details.`;

async function callClaude(deps: Deps, opts: {
  purpose: string;
  messages: any[];
  tools?: any[];
  effort?: 'low' | 'medium' | 'high';
  maxTokens?: number;
  format?: any;
}) {
  if (!aiConfigured()) throw new AiError('AI is not set up yet: add the ANTHROPIC_API_KEY secret in Supabase.', 503);
  const spent = await spentThisMonth(deps.kv);
  if (spent >= AI_MONTHLY_CAP_USD) throw new AiError(`This month's AI budget ($${AI_MONTHLY_CAP_USD}) is used up. Raise AI_MONTHLY_CAP_USD to continue.`, 429);
  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });
  const body: any = {
    model: AI_MODEL,
    max_tokens: opts.maxTokens || 8000,
    system: [{ type: 'text', text: SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } }],
    messages: opts.messages,
    output_config: { effort: opts.effort || 'medium', ...(opts.format ? { format: opts.format } : {}) },
  };
  if (opts.tools) body.tools = opts.tools;
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
  if (res.stop_reason === 'refusal') throw new AiError('Claude declined this request.', 422);
  return res;
}

const textOf = (res: any) => (res.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('').trim();

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
  { name: 'get_expenses', description: 'Expense totals by category (stock purchases, overheads, fixed costs) in a date range. No individual salaries.', input_schema: dateRange },
];

async function runTool(deps: Deps, storeId: string | null, name: string, input: any) {
  const today = deps.getTodayIST();
  const clampFrom = (from: string, to: string) => (from < addDaysISO(to, -120) ? addDaysISO(to, -120) : from);
  const from = input?.from ? clampFrom(String(input.from), String(input.to || today)) : addDaysISO(today, -14);
  const to = input?.to ? String(input.to) : today;
  const events = await loadEvents(deps.kv);
  const eventMap = new Map(events.map((e) => [e.date, e]));
  switch (name) {
    case 'get_daily_sales':
      return (await loadDays(deps.kv, storeId, from, to)).map((d) => compactDay(d, eventMap));
    case 'get_forecast': {
      const days = await loadDays(deps.kv, storeId, addDaysISO(today, -84), addDaysISO(today, -1));
      return forecastDays(days, events, today, Math.min(14, Math.max(1, Number(input?.days) || 7)), today);
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
      const [inv, ovh, fix] = await Promise.all([deps.kv.getByPrefix<any>('inventory:'), deps.kv.getByPrefix<any>('overhead:'), deps.kv.getByPrefix<any>('fixedcost:')]);
      const sum = (rows: any[], amountKey: string) => {
        const out: Record<string, number> = {};
        for (const r of rows.filter((x) => x.date >= from && x.date <= to && (!storeId || !x.storeId || x.storeId === storeId || x.entityType === 'production_house'))) {
          out[r.category || 'other'] = Math.round((out[r.category || 'other'] || 0) + (Number(r[amountKey]) || 0));
        }
        return out;
      };
      return { stockPurchases: sum(inv, 'totalCost'), overheads: sum(ovh.filter((o) => o.category !== 'personal_expense'), 'amount'), fixedCosts: sum(fix, 'amount') };
    }
    default:
      return { error: `Unknown tool ${name}` };
  }
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
    if (err instanceof AiError) return c.json({ error: err.message }, err.status);
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
    return c.json({ configured: aiConfigured(), model: AI_MODEL, spentThisMonthUsd: await spentThisMonth(deps.kv), capUsd: AI_MONTHLY_CAP_USD, canManage: g.actor!.canManage });
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

  // Draft festival / event days for a date range. Nothing is saved - the owner accepts each one.
  app.post(`${P}/ai/calendar-draft`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    try {
      const today = deps.getTodayIST();
      const body = await c.req.json().catch(() => ({}));
      const from = body.from || today;
      const to = body.to || addDaysISO(from, 60);
      const existing = (await loadEvents(deps.kv)).filter((e) => e.date >= from && e.date <= to);
      const res = await callClaude(deps, {
        purpose: 'calendar',
        effort: 'low',
        maxTokens: 8000,
        tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 5, user_location: { type: 'approximate', country: 'IN', region: 'West Bengal', city: 'Bardhaman', timezone: 'Asia/Kolkata' } }],
        messages: [{
          role: 'user',
          content: `List the days between ${from} and ${to} that are likely to change sales at a momo shop in Bardhaman, West Bengal: Bengali and national festivals, puja days when many people avoid non-veg, big local fairs, public holidays. Check the exact ${from.slice(0, 4)} dates with web search - lunar festival dates move every year.

For each day give: date (YYYY-MM-DD), name, effect - one of "low_nonveg" (many avoid non-veg), "busy" (festival crowds, holidays out), "quiet" (people stay home or fast) - a one-line reason, and confidence ("high" if you confirmed the date, "medium" otherwise). Skip days with no real effect. Days already in the calendar: ${JSON.stringify(existing.map((e) => e.date))} - skip those.

Answer with only a JSON array, no other text.`,
        }],
      });
      const text = textOf(res);
      const start = text.indexOf('[');
      const end = text.lastIndexOf(']');
      let suggestions: any[] = [];
      try { suggestions = JSON.parse(text.slice(start, end + 1)); } catch { /* fall through */ }
      suggestions = (Array.isArray(suggestions) ? suggestions : [])
        .filter((s) => /^\d{4}-\d{2}-\d{2}$/.test(s?.date) && s.date >= from && s.date <= to && ['low_nonveg', 'busy', 'quiet'].includes(s.effect) && s.name)
        .map((s) => ({ date: s.date, name: String(s.name).slice(0, 80), effect: s.effect, reason: String(s.reason || '').slice(0, 200), confidence: s.confidence === 'high' ? 'high' : 'medium' }));
      return c.json({ suggestions });
    } catch (err) { return fail(c, err); }
  });

  // Read a photographed invoice or bill (English or Bengali) into lines for the expense form.
  // Nothing is saved here - the app shows the lines for the user to check first.
  app.post(`${P}/ai/invoice-read`, async (c: any) => {
    const authResult = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
    const role = authResult.user.user_metadata?.role;
    if (role !== 'manager' && role !== 'cluster_head') return c.json({ error: 'Only people who add expenses can scan invoices' }, 403);
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

  // "Ask Bunny": a question answered from the app's data. Claude can only read, never change.
  app.post(`${P}/ai/ask`, async (c: any) => {
    const g = await guard(c, 'manage'); if (g.error) return g.error;
    try {
      const body = await c.req.json();
      const storeId = body.storeId || null;
      const history = (Array.isArray(body.messages) ? body.messages : [])
        .filter((m: any) => (m.role === 'user' || m.role === 'assistant') && typeof m.content === 'string' && m.content.trim())
        .slice(-12)
        .map((m: any) => ({ role: m.role, content: m.content.slice(0, 4000) }));
      if (!history.length || history[history.length - 1].role !== 'user') return c.json({ error: 'Ask a question' }, 400);
      const today = deps.getTodayIST();
      history[history.length - 1] = { role: 'user', content: `(Today is ${WEEKDAY_SHORT[weekdayOf(today)]} ${today}.)\n\n${history[history.length - 1].content}` };
      const messages: any[] = history;
      const used: string[] = [];
      for (let turn = 0; turn < 6; turn++) {
        const res = await callClaude(deps, { purpose: 'ask', effort: 'medium', maxTokens: 6000, tools: ASK_TOOLS, messages });
        if (res.stop_reason !== 'tool_use') return c.json({ answer: textOf(res) || 'No answer.', toolsUsed: used });
        messages.push({ role: 'assistant', content: res.content });
        const results = [];
        for (const block of res.content.filter((b: any) => b.type === 'tool_use')) {
          used.push(block.name);
          let content: string;
          try {
            content = JSON.stringify(await runTool(deps, storeId, block.name, block.input)).slice(0, 60000);
          } catch (toolErr: any) {
            results.push({ type: 'tool_result', tool_use_id: block.id, content: `Error: ${toolErr?.message || toolErr}`, is_error: true });
            continue;
          }
          results.push({ type: 'tool_result', tool_use_id: block.id, content });
        }
        messages.push({ role: 'user', content: results });
      }
      return c.json({ answer: 'That needed more look-ups than allowed - try a narrower question.', toolsUsed: used });
    } catch (err) { return fail(c, err); }
  });
}
