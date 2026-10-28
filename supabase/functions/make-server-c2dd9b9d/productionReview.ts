// Every production entry is checked right after it is saved or edited (owner, 28 Oct 2026: "have
// AI check for anomalies in production data"). Plain rules compare the day with the house's last
// 60 days and that day's production ledger; then Bunny (askClaudeForJson, the same small model and
// monthly cap as Insights) reads the day against the last two weeks for anything else clearly
// odd. A flag says what looks wrong with the numbers; the production incharge, the operations
// managers who approve production, and the owner are told, and any of them can mark it checked.
// An edit that clears a problem closes its flag.
//
//   production-flag:{productionId}:{kind}   one problem with one entry (open / fixed / dismissed)
//   production-review:{productionId}        the numbers Bunny last read, so an unchanged re-save isn't re-read
//
// Kinds: empty (no pieces at all), twin (two entries for one day), copy (same pieces as another
// day), total (the day far above or below usual), type (one momo type far above usual), perKg
// (pieces per kg of stuffing far from usual), sauce (a sauce weight that looks like a slip),
// wastage (a lot written off), late (entered days afterwards), ai-1 / ai-2 (Bunny's own findings).
// A day's close adds lateMismatch (flagLedgerDay): a late start given as the reason for leftover
// stuffing that the check-ins don't bear out; its productionId is the ledger day's id.
import { askClaudeForJson } from './insights.ts';

type Kv = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  mget?: (keys: string[]) => Promise<any[]>;
};
type Range = { from?: string; to?: string; field: string };
export type ProductionReviewDeps = {
  kv: Kv;
  rows: (prefix: string, range?: Range | null) => Promise<any[]>;
  verifyUser: (authHeader: string | null) => Promise<any>;
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<unknown>;
};
type Flag = {
  id: string; productionId: string; productionKey: string; kind: string; date: string; house: string;
  title: string; message: string; byAi?: boolean;
  status: 'open' | 'fixed' | 'dismissed'; createdAt: string; loggedBy?: string;
  decidedBy?: string; decidedAt?: string; note?: string;
};
type Finding = { kind: string; title: string; message: string; byAi?: boolean };

const P = '/make-server-c2dd9b9d';
const TYPES: Record<string, string> = {
  chickenMomos: 'Chicken', vegMomos: 'Veg', paneerMomos: 'Paneer', cheeseCornMomos: 'Cheese corn',
  chickenCheeseMomos: 'Chicken cheese', vegKurkureMomos: 'Veg kurkure', chickenKurkureMomos: 'Chicken kurkure',
};
const SAUCES: Record<string, string> = {
  spicyRedChutney: 'Spicy red chutney', greenMayoChutney: 'Green mayo chutney', panfriedSauce: 'Pan-fried sauce',
  hotGarlicSauce: 'Hot garlic sauce', spicyKoreanSauce: 'Spicy Korean sauce', chilliChickenSauce: 'Chilli chicken sauce',
  tandooriSauce: 'Tandoori sauce', soupPremix: 'Soup premix',
};
const HISTORY_DAYS = 60;
const AI_DAYS = 14;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const median = (xs: number[]) => {
  const s = xs.filter((x) => Number.isFinite(x)).sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : 0;
};
const houseOf = (r: any) => String(r?.productionHouseId || r?.storeId || '');
const piecesOf = (r: any) => Object.fromEntries(Object.keys(TYPES).map((t) => [t, Number(r?.[t]?.final) || 0])) as Record<string, number>;
const totalOf = (p: Record<string, number>) => Object.values(p).reduce((s, n) => s + n, 0);
const n0 = (n: number) => Math.round(n).toLocaleString('en-IN');
const n1 = (n: number) => String(Math.round(n * 10) / 10);
const dayLabel = (d: string) => new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' });
// The ledger has no unit; an amount over 100 was typed in grams (refused since 28 Oct 2026).
const kg = (q: any) => { const n = Number(q) || 0; return n > 100 ? n / 1000 : n; };

export async function reviewProduction(deps: ProductionReviewDeps, key: string, item: any, loggedBy?: string): Promise<Flag[]> {
  try {
    const date = String(item?.date || '').slice(0, 10);
    const house = houseOf(item);
    if (!item?.id || !date || !house) return [];
    const [history, ledgerItems, wasteNotes] = await Promise.all([
      deps.rows('production:', { from: addDays(date, -HISTORY_DAYS), to: addDays(date, 2), field: 'date' }),
      deps.rows(`production-ledger-item:${house}:`, { from: addDays(date, -HISTORY_DAYS), to: date, field: 'date' }),
      deps.rows(`production-wastage-note:${house}:${date}`),
    ]);
    const others = history.filter((r: any) => r && r.id !== item.id && houseOf(r) === house);
    const past = others.filter((r: any) => r.date < date && r.date >= addDays(date, -HISTORY_DAYS));
    const pieces = piecesOf(item);
    const total = totalOf(pieces);
    const findings: Finding[] = [];

    // Stuffing (or coating) kg per momo type per day, from the ledger.
    const stuffingByDay = new Map<string, Record<string, number>>();
    for (const x of ledgerItems || []) {
      const d = String(x?.date || '').slice(0, 10);
      if (!d || !TYPES[x?.momoKey]) continue;
      const day = stuffingByDay.get(d) || {};
      day[x.momoKey] = (day[x.momoKey] || 0) + kg(x.perTypePoolQty);
      stuffingByDay.set(d, day);
    }
    const stuffingFor = (r: any, t: string) => (stuffingByDay.get(String(r.date).slice(0, 10))?.[t] || 0) + (Number(r?.[t]?.stuffing) || 0);

    if (total === 0) {
      findings.push({ kind: 'empty', title: 'Nothing made?', message: `No finished pieces in the entry for ${dayLabel(date)}. Add the pieces made, or delete the entry if nothing was made that day.` });
    }

    const twin = others.find((r: any) => String(r.date).slice(0, 10) === date);
    if (twin) {
      findings.push({ kind: 'twin', title: 'Two entries for one day', message: `There is already a production entry for ${dayLabel(date)} (${n0(totalOf(piecesOf(twin)))} pieces). Keep one: put everything made that day in it and delete the other, or the pieces are counted twice.` });
    }

    if (total > 0) {
      const copy = others.find((r: any) => String(r.date).slice(0, 10) !== date && Math.abs(Date.parse(r.date) - Date.parse(date)) <= 14 * 86400000
        && Object.keys(TYPES).every((t) => piecesOf(r)[t] === pieces[t]));
      if (copy) {
        findings.push({ kind: 'copy', title: 'Same numbers as another day', message: `Every momo count matches ${dayLabel(copy.date)} exactly (${n0(total)} pieces). Check the day wasn't copied.` });
      }
    }

    // The day's total, and each type, against the usual.
    const pastTotals = past.map((r: any) => totalOf(piecesOf(r))).filter((x: number) => x > 0);
    let totalFlagged = false;
    if (total > 0 && pastTotals.length >= 5) {
      const usual = median(pastTotals);
      if (usual > 0 && (total >= usual * 2 || total <= usual * 0.4)) {
        totalFlagged = true;
        const more = total > usual;
        findings.push({ kind: 'total', title: more ? 'Much more than usual' : 'Much less than usual', message: `${n0(total)} pieces on ${dayLabel(date)}; a day here is usually about ${n0(usual)}. ${more ? 'Check for a typed extra digit or a day entered twice.' : 'Check nothing was left out.'}` });
      }
    }
    if (total > 0 && !totalFlagged) {
      const high: string[] = [];
      for (const t of Object.keys(TYPES)) {
        const made = past.map((r: any) => piecesOf(r)[t]).filter((x: number) => x > 0);
        if (pieces[t] > 0 && made.length >= 4) {
          const usual = median(made);
          if (usual > 0 && pieces[t] >= usual * 3) high.push(`${TYPES[t]} ${n0(pieces[t])} (usually about ${n0(usual)})`);
        }
      }
      if (high.length) findings.push({ kind: 'type', title: 'One type far above usual', message: `${high.join('; ')}. Check for a typed extra digit.` });
    }

    // Pieces per kg of stuffing over the last three days - stuffing made one day is often used the
    // next, so a single day swings both ways (5 Oct read 19 a kg and 6 Oct 80; the two together 44).
    const byDate = new Map<string, any>();
    for (const r of [...past, item]) byDate.set(String(r.date).slice(0, 10), r);
    const window3 = (d: string, t: string) => {
      let p = 0, kgs = 0;
      for (const day of [addDays(d, -2), addDays(d, -1), d]) {
        const r = byDate.get(day);
        if (r) { p += piecesOf(r)[t]; kgs += stuffingFor(r, t); } else kgs += stuffingByDay.get(day)?.[t] || 0;
      }
      return { p, kgs };
    };
    const perKg: string[] = [];
    for (const t of Object.keys(TYPES)) {
      const w = window3(date, t);
      if (pieces[t] <= 0 || w.kgs < 6 || w.p <= 0) continue;
      const ratios = past.map((r: any) => { const x = window3(String(r.date).slice(0, 10), t); return x.kgs >= 6 && x.p > 0 ? x.p / x.kgs : NaN; }).filter((x: number) => Number.isFinite(x));
      if (ratios.length < 4) continue;
      const usual = median(ratios);
      const now = w.p / w.kgs;
      if (usual > 0 && (now >= usual * 1.4 || now <= usual * 0.6)) {
        perKg.push(`${TYPES[t]}: ${n0(w.p)} pieces from ${n1(w.kgs)} kg stuffing over ${dayLabel(addDays(date, -2))} to ${dayLabel(date)} is ${n0(now)} a kg, usually about ${n0(usual)} a kg (${now > usual ? 'more pieces than the stuffing explains: check the count, or stuffing not logged' : 'fewer pieces than the stuffing should give: check for pieces not entered, or stuffing wasted'})`);
      }
    }
    if (perKg.length) findings.push({ kind: 'perKg', title: 'Pieces and stuffing don\'t match', message: perKg.join('. ') + '.' });

    // Sauce weights: a slip of the decimal point.
    const sauceSlips: string[] = [];
    for (const [s, label] of Object.entries(SAUCES)) {
      const v = Number(item?.sauces?.[s]) || 0;
      if (v <= 0) continue;
      const usual = median(past.map((r: any) => Number(r?.sauces?.[s]) || 0).filter((x: number) => x > 0));
      if (v > 30 || (usual >= 0.5 && v >= usual * 8)) sauceSlips.push(`${label} ${n1(v)} kg${usual > 0 ? ` (usually about ${n1(usual)} kg)` : ''}`);
    }
    if (sauceSlips.length) findings.push({ kind: 'sauce', title: 'Sauce weight looks wrong', message: `${sauceSlips.join('; ')}. Check the decimal point - weights are in kg.` });

    // Written off (the wastage notes) against what was prepared that day. The entry's own wastage
    // fields copy the ledger's day figure, which is everything used, not what was thrown away.
    const wasted = (wasteNotes || []).reduce((s: number, x: any) => s + (Number(x?.quantity) || 0) / (String(x?.unit || 'kg').toLowerCase() === 'g' ? 1000 : 1), 0);
    const prepared = Object.values(stuffingByDay.get(date) || {}).reduce((s, x) => s + x, 0)
      + (ledgerItems || []).filter((x: any) => String(x?.date).slice(0, 10) === date).reduce((s: number, x: any) => s + kg(x.globalPoolQty), 0);
    if (wasted >= 1 && prepared > 0 && wasted / prepared > 0.1) {
      findings.push({ kind: 'wastage', title: 'A lot written off', message: `${n1(wasted)} kg written off against ${n1(prepared)} kg prepared on ${dayLabel(date)} (${Math.round((wasted / prepared) * 100)}%). Note what went wrong, so it can be stopped.` });
    }

    const firstSaved = String(item.createdAt || '').slice(0, 10);
    if (/^\d{4}-\d{2}-\d{2}$/.test(firstSaved) && firstSaved > addDays(date, 2)) {
      const late = Math.round((Date.parse(firstSaved) - Date.parse(date)) / 86400000);
      findings.push({ kind: 'late', title: 'Entered days later', message: `The entry for ${dayLabel(date)} was first saved ${late} days later. Numbers written up from memory are easy to get wrong; enter production the same evening.` });
    }

    // Bunny reads the day against the last two weeks, once per set of numbers.
    if (total > 0) {
      const sig = JSON.stringify([pieces, item.sauces || {}, stuffingByDay.get(date) || {}]);
      const reviewKey = `production-review:${item.id}`;
      const last = await deps.kv.get(reviewKey).catch(() => null);
      if (last?.sig !== sig) {
        try {
          const recent = past.filter((r: any) => r.date >= addDays(date, -AI_DAYS)).sort((a: any, b: any) => String(a.date).localeCompare(String(b.date)));
          const row = (r: any) => ({
            date: String(r.date).slice(0, 10),
            pieces: Object.fromEntries(Object.entries(piecesOf(r)).filter(([, v]) => v > 0).map(([t, v]) => [TYPES[t], v])),
            stuffingKg: Object.fromEntries(Object.keys(TYPES).map((t) => [TYPES[t], Math.round(stuffingFor(r, t) * 10) / 10]).filter(([, v]) => (v as number) > 0)),
            saucesKg: Object.fromEntries(Object.entries(r.sauces || {}).filter(([, v]) => Number(v) > 0).map(([s, v]) => [SAUCES[s] || s, v])),
          });
          const { data } = await askClaudeForJson(deps.kv as any, {
            purpose: 'production-review',
            user: { id: 'production-review', isOwner: true },
            system: 'You check the daily production entry of a small momo kitchen in West Bengal, India, against its last two weeks. Pieces are finished momos by type; stuffing is kg prepared that day (it can carry over a day); sauces are kg. Report only clear anomalies in the numbers that the rule checks already listed do not cover - for example a type made in a very different amount from its pattern, kurkure pieces with no batter or coating, a sauce made far more often or in far bigger amounts than usual, or numbers that look made up or copied. Quote the numbers in each finding. Plain short English, no names. Return an empty list when nothing is clearly wrong; at most two findings.',
            prompt: JSON.stringify({ today: row(item), lastTwoWeeks: recent.map(row), alreadyFlagged: findings.map((f) => f.title) }),
            schema: {
              type: 'object', additionalProperties: false, required: ['findings'],
              properties: {
                findings: {
                  type: 'array',
                  items: {
                    type: 'object', additionalProperties: false, required: ['title', 'message', 'confidence'],
                    properties: { title: { type: 'string' }, message: { type: 'string' }, confidence: { type: 'string', enum: ['high', 'medium', 'low'] } },
                  },
                },
              },
            },
            maxTokens: 600,
          });
          (Array.isArray(data?.findings) ? data.findings : [])
            .filter((f: any) => f?.confidence === 'high' && f.title && f.message)
            .slice(0, 2)
            .forEach((f: any, i: number) => findings.push({ kind: `ai-${i + 1}`, title: String(f.title).slice(0, 70), message: String(f.message).slice(0, 400), byAi: true }));
          await deps.kv.set(reviewKey, { sig, at: new Date().toISOString(), aiKinds: findings.filter((f) => f.byAi).map((f) => f.kind) });
        } catch (error) {
          console.log('Production review: Bunny could not check the entry:', error instanceof Error ? error.message : String(error));
        }
      } else {
        // Same numbers as last time: keep Bunny's open findings as they are.
        (last.aiKinds || []).forEach((k: string) => findings.push({ kind: k, title: '', message: '', byAi: true }));
      }
    }

    // Save new findings; an edit that cleared an open one closes it.
    const now = new Date().toISOString();
    const kinds = new Set(findings.map((f) => f.kind));
    const existing = (await deps.rows(`production-flag:${item.id}:`)) as Flag[];
    for (const f of existing) {
      if (f?.status === 'open' && !kinds.has(f.kind)) {
        await deps.kv.set(`production-flag:${f.id}`, { ...f, status: 'fixed', decidedBy: 'Changed in an edit', decidedAt: now });
      }
    }
    const saved: Flag[] = [];
    for (const f of findings) {
      if (!f.title) continue; // a kept AI finding, already saved
      const id = `${item.id}:${f.kind}`;
      const prev = existing.find((x) => x?.id === id);
      if (prev && (prev.status === 'dismissed' || (prev.status === 'open' && prev.message === f.message))) continue;
      const flag: Flag = { ...f, id, productionId: item.id, productionKey: key, date, house, status: 'open', createdAt: now, loggedBy };
      await deps.kv.set(`production-flag:${id}`, flag);
      saved.push(flag);
    }
    if (saved.length) await tellPeople(deps, item, house, saved);
    return saved;
  } catch (error) {
    console.log('Production review failed:', error instanceof Error ? error.message : String(error));
    return [];
  }
}

// Problems found when a production day is closed (index.ts), kept and shown like the entry checks.
// `kinds` are the kinds this call decides: an open one of those that no longer applies is closed.
export async function flagLedgerDay(
  deps: ProductionReviewDeps,
  day: { key: string; id: string; date: string; house: string; loggedBy?: string },
  kinds: string[],
  findings: Finding[],
): Promise<Flag[]> {
  const now = new Date().toISOString();
  const existing = (await deps.rows(`production-flag:${day.id}:`)) as Flag[];
  for (const f of existing) {
    if (f?.status === 'open' && kinds.includes(f.kind) && !findings.some((x) => x.kind === f.kind)) {
      await deps.kv.set(`production-flag:${f.id}`, { ...f, status: 'fixed', decidedBy: 'Changed when the day was closed again', decidedAt: now });
    }
  }
  const saved: Flag[] = [];
  for (const f of findings) {
    const id = `${day.id}:${f.kind}`;
    const prev = existing.find((x) => x?.id === id);
    if (prev && (prev.status === 'dismissed' || prev.status === 'open') && prev.message === f.message) continue;
    const flag: Flag = { ...f, id, productionId: day.id, productionKey: day.key, date: day.date, house: day.house, status: 'open', createdAt: now, loggedBy: day.loggedBy };
    await deps.kv.set(`production-flag:${id}`, flag);
    saved.push(flag);
  }
  if (saved.length) await tellPeople(deps, { id: day.id, date: day.date }, day.house, saved);
  return saved;
}

// The house's production incharge, the operations managers (they approve production) and the
// owner get one notification per entry.
async function tellPeople(deps: ProductionReviewDeps, item: any, house: string, flags: Flag[]) {
  const people = await deps.rows('unified-employee:');
  const to = new Map<string, any>();
  people.filter((p: any) => p?.status !== 'inactive' && p?.authUserId && (
    p.role === 'cluster_head'
    || (p.role === 'manager' && p.designation !== 'store_incharge' && p.designation !== 'production_incharge')
    || (p.designation === 'production_incharge' && (p.storeId === house || (p.assignedProductionHouseIds || []).includes(house)))
  )).forEach((p: any) => to.set(p.authUserId, p));
  const title = flags.length === 1 ? flags[0].title : 'Check a production entry';
  const message = `Production for ${dayLabel(item.date)}: ${flags.map((f) => f.title.toLowerCase()).join(', ')}.`;
  for (const authUserId of to.keys()) {
    await deps.notifyUser(authUserId, 'production_flag', title, message, item.id, item.date).catch(() => undefined);
  }
}

export function registerProductionReviewRoutes(app: any, deps: ProductionReviewDeps) {
  // Who sees and decides: the owner and operations managers everywhere, a production incharge for
  // their own house.
  const viewerOf = async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const m = auth.user.user_metadata || {};
    const all = m.role === 'cluster_head' || (m.role === 'manager' && m.designation !== 'store_incharge' && m.designation !== 'production_incharge');
    const houses = new Set<string>();
    if (m.designation === 'production_incharge') [m.storeId, ...(m.assignedProductionHouseIds || [])].filter(Boolean).forEach((id: string) => houses.add(String(id)));
    if (!all && houses.size === 0) return { error: c.json({ error: 'Only the owner, operations managers and production incharges check production' }, 403) };
    return { all, houses, name: m.name || auth.user.email || 'Someone' };
  };
  const canSee = (v: { all: boolean; houses: Set<string> }, flag: Flag) => v.all || v.houses.has(flag.house);

  app.get(`${P}/production-flags`, async (c: any) => {
    const v: any = await viewerOf(c);
    if (v.error) return v.error;
    try {
      const status = c.req.query('status') || 'open';
      const flags = (await deps.rows('production-flag:')).filter((f: Flag) => f && (status === 'all' || f.status === status) && canSee(v, f));
      const keys = [...new Set(flags.map((f: Flag) => f.productionKey))];
      const records = keys.length && deps.kv.mget ? await deps.kv.mget(keys) : [];
      const byId = new Map<string, any>();
      records.filter(Boolean).forEach((r: any) => byId.set(r.id, r));
      const rows = flags
        .map((f: Flag) => {
          const entry = byId.get(f.productionId);
          // A day-close check points at the ledger day, which has no pieces of its own.
          return { ...f, entry: entry ? { date: entry.date, pieces: entry.pools ? null : totalOf(piecesOf(entry)), approvalStatus: entry.approvalStatus || null } : null };
        })
        .filter((f: any) => f.entry || f.status !== 'open') // the entry was deleted
        .sort((a: any, b: any) => String(b.date).localeCompare(String(a.date)));
      return c.json({ flags: rows });
    } catch (error) {
      console.log('Error listing production flags:', error);
      return c.json({ error: 'Could not load the entries to check' }, 500);
    }
  });

  app.post(`${P}/production-flags/:id/dismiss`, async (c: any) => {
    const v: any = await viewerOf(c);
    if (v.error) return v.error;
    try {
      const id = decodeURIComponent(c.req.param('id'));
      const flag: Flag | null = await deps.kv.get(`production-flag:${id}`);
      if (!flag) return c.json({ error: 'That check was not found' }, 404);
      if (!canSee(v, flag)) return c.json({ error: 'This entry belongs to another production house' }, 403);
      if (flag.status !== 'open') return c.json({ error: 'Someone has already decided this one' }, 409);
      const body = await c.req.json().catch(() => ({}));
      const next: Flag = { ...flag, status: 'dismissed', decidedBy: v.name, decidedAt: new Date().toISOString(), note: typeof body?.note === 'string' ? body.note.slice(0, 300) : undefined };
      await deps.kv.set(`production-flag:${id}`, next);
      return c.json({ flag: next });
    } catch (error) {
      console.log('Error deciding a production flag:', error);
      return c.json({ error: 'Could not save that' }, 500);
    }
  });
}
