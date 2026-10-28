// Team KPIs and variable pay (owner, 27 Oct 2026). Registered from index.ts; also registers the
// shift clock routes (attendance.ts). The scoring rules themselves are in kpiCore.ts.
//
// KV rows:
//   kpi-settings:{employeeId}        shift times, weekly off, grace, weights, variable-pay maximum
//   kpi-config                       workplace radius, whether staff see money, first shift-clock day
//   kpi-review:{month}:{employeeId}  the AI's review, cached so reopening the screen doesn't re-run it
//   variable-pay:{month}:{employeeId} { formula, ai, approved, approvedBy, approvedAt } - read by payroll
//   extra-hours:{employeeId}:{date}  the incharge's word on time beyond the shift (confirmed / declined)
//
// Who: the owner sees and decides everything. Operations managers see the team (not themselves),
// change shift times / weekly off / weights and can ask the AI, but don't change pay or approve.
// Everyone sees their own month in "My KPIs"; money only if the owner switches that on.
//
// The AI review gets only the KPI numbers, the role and the pay maximum under an anonymous
// label - never names, phone numbers, Aadhaar, salaries or other personal details.

import { createClient } from 'npm:@supabase/supabase-js@2';
import { askClaudeForJson, AiError } from './insights.ts';
import {
  FLAG_LABELS, KPI_LABELS, ROLE_LABELS, AI_MAX_SHIFT, EXTRA_MIN_OFFERED, addDays, checkApprovedAmount, clampAiAmount, cleanSettingsInput,
  computeMonthKpis, extraMinutesOf, isMonth, istDate, monthDays, variablePayFormula,
  type KpiId, type MonthKpis,
} from './kpiCore.ts';
import {
  P, actorOf, canManage, loadConfig, loadPlaces, profileOf, registerAttendanceRoutes,
  type Actor, type KpiDeps, type Places, type Profile,
} from './attendance.ts';

// Rows with their keys (the shared kv helpers return values only, and photo-check rows carry the
// date and person in the key). Paginated, ordered by key so pages never skip or repeat.
let client: any = null;
const db = () => (client ||= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!));
async function rowsByPrefix(prefix: string): Promise<{ key: string; value: any }[]> {
  const out: { key: string; value: any }[] = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db().from('kv_store_c2dd9b9d').select('key, value').like('key', `${prefix}%`).order('key', { ascending: true }).range(from, from + 999);
    if (error) throw new Error(error.message);
    out.push(...(data || []));
    if (!data || data.length < 1000) break;
  }
  return out;
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) { const i = next++; out[i] = await fn(items[i]); }
  }));
  return out;
}

const monthLabel = (month: string) => new Date(`${month}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const istDayOf = (iso: any) => (typeof iso === 'string' && !Number.isNaN(Date.parse(iso)) ? istDate(Date.parse(iso)) : '');
// Riders are paid per trip, with no KPIs or variable pay (owner, 28 Oct 2026).
const isStaff = (e: any) => e?.employeeId && e.status !== 'inactive' && e.role !== 'cluster_head' && e.role !== 'audit' && e.designation !== 'rider';

function storeOf(emp: any, places: Places): string | null {
  const ids = [emp.storeId, ...(emp.assignedStoreIds || [])].filter(Boolean).map(String);
  return ids.find((id) => places.stores.has(id)) || null;
}
function houseOf(emp: any, places: Places): string | null {
  const ids = [...(emp.assignedProductionHouseIds || []), emp.storeId].filter(Boolean).map(String);
  return ids.find((id) => places.houses.has(id)) || null;
}

// Month-wide data shared by everyone on the team screen, loaded once and only when a role needs it.
type Shared = {
  month: string; today: string; places: Places; punchSince: string | null;
  sales: any[]; production: any[]; requests: any[]; trips: any[]; expenses: any[];
  checks: Map<string, { date: string; row: any }[]>;
  stockOuts: Map<string, Promise<any[]>>;
  ledger: Map<string, Promise<{ made: { date: string; kg: number }[]; wasted: { date: string; kg: number }[] }>>;
};

// `needs`: every KPI someone on the screen has, so only the data those KPIs read is loaded.
async function loadShared(deps: KpiDeps, month: string, needs: Set<KpiId>, places: Places, punchSince: string | null): Promise<Shared> {
  const days = monthDays(month);
  const first = days[0];
  const last = days[days.length - 1];
  const inMonth = (d: string) => d >= first && d <= last;
  const need = (...ids: KpiId[]) => ids.some((id) => needs.has(id));
  const none = Promise.resolve([] as any[]);
  const [sales, production, requests, trips, checkRows, inventory, overheads] = await Promise.all([
    need('cashCount', 'cashAccuracy', 'salesOnTime') ? deps.getAllByPrefix('sales:') : none,
    need('productionLogged', 'wastage', 'productionApproved') ? deps.getAllByPrefix('production:') : none,
    need('shippedOnTime', 'requestOnTime') ? deps.getAllByPrefix('production_request_') : none,
    need('trips') ? deps.getAllByPrefix('rider-trip:') : none,
    rowsByPrefix(`workplace-check:${month}-`),
    need('expensesOnTime') ? deps.getAllByPrefix('inventory:') : none,
    need('expensesOnTime') ? deps.getAllByPrefix('overhead:') : none,
  ]);
  const checks = new Map<string, { date: string; row: any }[]>();
  for (const { key, value } of checkRows) {
    // workplace-check:{date}:{employeeId}
    const rest = key.slice('workplace-check:'.length);
    const date = rest.slice(0, 10);
    const employeeId = rest.slice(11);
    if (!employeeId) continue;
    if (!checks.has(employeeId)) checks.set(employeeId, []);
    checks.get(employeeId)!.push({ date, row: value });
  }
  return {
    month, today: istDate(Date.now()), places, punchSince,
    sales: (sales || []).filter((s: any) => s?.date && inMonth(String(s.date).slice(0, 10))),
    production: (production || []).filter((p: any) => p?.date && inMonth(String(p.date).slice(0, 10))),
    requests: (requests || []).filter((r: any) => r?.requestDate && inMonth(String(r.requestDate).slice(0, 10))),
    trips: (trips || []).filter((t: any) => t?.date && inMonth(String(t.date).slice(0, 10))),
    expenses: [...(inventory || []), ...(overheads || [])].filter((e: any) => e?.date && inMonth(String(e.date).slice(0, 10))),
    checks,
    stockOuts: new Map(),
    ledger: new Map(),
  };
}

async function personKpis(deps: KpiDeps, emp: any, profile: Profile, shared: Shared): Promise<MonthKpis> {
  const id = String(emp.employeeId);
  const { month, places } = shared;
  const [punches, timesheets, leaves, extraHours] = await Promise.all([
    deps.kv.getByPrefix<any>(`punch:${id}:${month}-`),
    deps.getAllByPrefix(`timesheet:${id}:`),
    deps.kv.getByPrefix<any>(`leave:${id}:`),
    deps.kv.getByPrefix<any>(`extra-hours:${id}:${month}-`),
  ]);
  const first = `${month}-01`;
  const store = storeOf(emp, places);
  const house = houseOf(emp, places);
  const has = new Set(profile.settings.kpis);
  let stockOuts: any[] = [];
  if (has.has('stockOuts') && store) {
    if (!shared.stockOuts.has(store)) shared.stockOuts.set(store, deps.kv.getByPrefix<any>(`stock-out:${store}:`));
    stockOuts = await shared.stockOuts.get(store)!;
  }
  const housesStores = house ? [...places.storeHouse.entries()].filter(([, h]) => h === house).map(([s]) => s) : [];
  // The house's production ledger for the month, once per house: kg made and kg written off.
  let ledger: { made: { date: string; kg: number }[]; wasted: { date: string; kg: number }[] } = { made: [], wasted: [] };
  if (house && has.has('wastage')) {
    if (!shared.ledger.has(house)) {
      shared.ledger.set(house, Promise.all([
        deps.kv.getByPrefix<any>(`production-ledger-item:${house}:${month}-`),
        deps.kv.getByPrefix<any>(`production-wastage-note:${house}:${month}-`),
      ]).then(([items, notes]) => ({
        // The ledger has no unit: a pool entry over 200 was typed in grams (21,940 for 21.94 kg).
        made: (items || []).map((x: any) => {
          const kg = (q: any) => { const n = Number(q) || 0; return n > 200 ? n / 1000 : n; };
          return { date: String(x?.date || '').slice(0, 10), kg: kg(x?.globalPoolQty) + kg(x?.perTypePoolQty) };
        }),
        wasted: (notes || []).map((x: any) => ({ date: String(x?.date || '').slice(0, 10), kg: (Number(x?.quantity) || 0) / (String(x?.unit || 'kg').toLowerCase() === 'g' ? 1000 : 1) })),
      })));
    }
    ledger = await shared.ledger.get(house)!;
  }
  // Production entries are approved for the house that supplies the person's store.
  const supplyHouse = house || (store ? places.storeHouse.get(store) || null : null);
  const ids = new Set([id, emp.authUserId].filter(Boolean).map(String));
  return computeMonthKpis({
    month, today: shared.today, emp: { employeeId: id, joiningDate: emp.joiningDate || null },
    group: profile.group, kind: profile.kind, settings: profile.settings, punchSince: shared.punchSince,
    punches: punches || [],
    timesheets: (timesheets || []).filter((t: any) => String(t?.date || '').startsWith(month)),
    hasTimesheetHistory: (timesheets || []).some((t: any) => t?.date && String(t.date) < first),
    leaves: leaves || [],
    workplaceChecks: shared.checks.get(id) || [],
    sales: store ? shared.sales.filter((s: any) => s.storeId === store) : [],
    stockOuts,
    production: house ? shared.production.filter((p: any) => (p.productionHouseId || p.storeId) === house) : shared.production,
    requests: housesStores.length ? shared.requests.filter((r: any) => housesStores.includes(r.storeId)) : shared.requests,
    trips: shared.trips.filter((t: any) => t.riderEmployeeId === id),
    ledgerMadeKg: ledger.made,
    ledgerWastedKg: ledger.wasted,
    extraHours: extraHours || [],
    storeRequests: store ? shared.requests.filter((r: any) => r.storeId === store) : [],
    expenses: shared.expenses.filter((e: any) => ids.has(String(e.createdBy || '')) || ids.has(String(e.userId || ''))),
    approvals: supplyHouse ? shared.production.filter((p: any) => (p.productionHouseId || p.storeId) === supplyHouse) : [],
  });
}

// ---------------- AI review ----------------

const REVIEW_SYSTEM = `You review one staff member's monthly KPIs for Bunny Momos, a small momo shop and production house in West Bengal, India, and suggest their variable (incentive) pay for the month.

You get only numbers, the role and the pay limits - no names or personal details. Never guess or mention names, gender, family or personal life.

Pay rules:
- Start from the formula amount. You may move it up or down by at most 15% of the formula amount, never below 0 and never above the maximum.
- Move it only for a clear reason in the numbers - for example a KPI with very little data, one bad week dragging a score, check-ins flagged as odd, or a role metric that matters more than the total shows. Otherwise keep the formula amount.
- If the formula amount is 0, suggest 0.
- Say why in adjustmentReason, with the numbers ("No change" if you kept it).

Writing: short, plain, kind English that the owner can read out to the person. oneLineSummary is one sentence. strengths 1-3 items, concerns 0-3 items, whatToImproveNextMonth 1-3 concrete actions tied to the KPI numbers. Rupees as "Rs 1,500".`;

const REVIEW_SCHEMA = {
  type: 'object',
  properties: {
    suggestedAmount: { type: 'number', description: 'Rupees, within 15% of the formula amount and not above the maximum' },
    adjustmentReason: { type: 'string' },
    oneLineSummary: { type: 'string' },
    strengths: { type: 'array', items: { type: 'string' } },
    concerns: { type: 'array', items: { type: 'string' } },
    whatToImproveNextMonth: { type: 'array', items: { type: 'string' } },
  },
  required: ['suggestedAmount', 'adjustmentReason', 'oneLineSummary', 'strengths', 'concerns', 'whatToImproveNextMonth'],
  additionalProperties: false,
};

function reviewPrompt(profile: Profile, k: MonthKpis, formula: { amount: number; explanation: string }, monthComplete: boolean) {
  const flags = Object.entries(k.flags).filter(([, n]) => n > 0).map(([f, n]) => `${n} x ${FLAG_LABELS[f] || f}`);
  return `Review this month and suggest the variable pay.

${JSON.stringify({
  staff: 'Staff member A',
  role: ROLE_LABELS[profile.group],
  workplace: profile.kind,
  month: k.month,
  monthComplete,
  daysCounted: k.from ? `${k.from} to ${k.to}` : 'none',
  scheduledWorkingDays: k.scheduledDays,
  shift: `${profile.settings.shiftStart}-${profile.settings.shiftEnd}, ${profile.settings.graceMin} min grace`,
  kpis: k.kpis.filter((x) => x.weight > 0).map((x) => ({ kpi: x.label, score: x.score, weight: x.weight, details: x.explanation })),
  weightedTotal: k.total,
  extraHoursBonus: k.extra ? { confirmedHours: k.extra.hours, days: k.extra.days, pointsAdded: k.extra.points } : null,
  shareOfWeightWithData: k.coverage,
  notes: k.notes,
  checkInsFlagged: flags,
  formula: { amount: formula.amount, rule: 'total under 50 -> 0; 50 to 100 -> straight line from 0 to the maximum', working: formula.explanation },
  variablePayMaximum: profile.settings.hasVariablePay ? profile.settings.variablePayMax : 0,
  allowedRange: [Math.max(0, Math.floor(formula.amount * (1 - AI_MAX_SHIFT))), Math.min(profile.settings.variablePayMax, Math.ceil(formula.amount * (1 + AI_MAX_SHIFT)))],
})}`;
}

export function registerKpiRoutes(app: any, deps: KpiDeps) {
  registerAttendanceRoutes(app, deps);

  const fail = (c: any, err: any) => {
    if (err instanceof AiError) return c.json({ error: err.message, ...err.extra }, err.status);
    console.error('[kpi]', err?.message || 'error'); // no names or ids in logs
    return c.json({ error: 'Something went wrong - try again' }, 500);
  };
  const lead = async (c: any): Promise<{ actor?: Actor; error?: any }> => {
    const r = await actorOf(deps, c);
    if (r.error) return r;
    if (!r.actor!.isOwner && !r.actor!.isOps) return { error: c.json({ error: 'Only the owner or an operations manager can see team KPIs' }, 403) };
    return r;
  };
  const monthOf = (c: any, value?: any) => {
    const today = istDate(Date.now());
    const m = value ?? c.req.query('month');
    if (m === undefined || m === null || m === '') return today.slice(0, 7);
    return isMonth(m) && m <= today.slice(0, 7) ? m : null;
  };
  const target = async (actor: Actor, employeeId: string) => {
    const emp = await deps.kv.get<any>(`unified-employee:${employeeId}`);
    if (!isStaff(emp)) return { error: 'Person not found', status: 404 };
    if (!actor.isOwner && emp.employeeId === actor.employeeId) return { error: 'Your own KPIs are set by the owner', status: 403 };
    return { emp };
  };
  // Everything about one person for one month (used by the review and approve routes).
  const onePerson = async (emp: any, month: string) => {
    const [places, cfg, saved] = await Promise.all([loadPlaces(deps.kv), loadConfig(deps.kv), deps.kv.get<any>(`kpi-settings:${emp.employeeId}`)]);
    const profile = profileOf(emp, places, saved);
    const shared = await loadShared(deps, month, new Set(profile.settings.kpis), places, cfg.punchSince);
    const kpis = await personKpis(deps, emp, profile, shared);
    const formula = variablePayFormula(kpis.total, profile.settings.hasVariablePay ? profile.settings.variablePayMax : 0);
    return { profile, kpis, formula, cfg };
  };

  // ---- Extra hours ----
  // Days in the last three weeks where someone the caller manages (canManage: the owner and
  // operations managers anyone, an incharge their own people) worked 30+ minutes beyond the shift,
  // with nobody's decision yet.
  app.get(`${P}/kpi/extra-hours`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const employees = ((await deps.kv.getByPrefix<any>('unified-employee:')) || []).filter((e: any) => isStaff(e) && canManage(a, e));
      if (!employees.length) return c.json({ days: [] });
      const places = await loadPlaces(deps.kv);
      const today = istDate(Date.now());
      const since = addDays(today, -21);
      const out: any[] = [];
      await mapLimit(employees, 6, async (e: any) => {
        const id = String(e.employeeId);
        const [saved, punches, decided] = await Promise.all([
          deps.kv.get<any>(`kpi-settings:${id}`),
          deps.kv.getByPrefix<any>(`punch:${id}:`),
          deps.kv.getByPrefix<any>(`extra-hours:${id}:`),
        ]);
        const settings = profileOf(e, places, saved).settings;
        const done = new Set((decided || []).map((x: any) => x?.date));
        for (const p of punches || []) {
          if (!p?.date || p.date < since || p.date >= today || done.has(p.date)) continue;
          const minutes = extraMinutesOf(p, p.date, settings);
          if (minutes < EXTRA_MIN_OFFERED) continue;
          out.push({ employeeId: id, name: e.name || id, date: p.date, inAt: p.in.at, outAt: p.out.at, shiftStart: settings.shiftStart, shiftEnd: settings.shiftEnd, minutes });
        }
      });
      out.sort((x, y) => y.date.localeCompare(x.date) || x.name.localeCompare(y.name));
      return c.json({ days: out });
    } catch (err) { return fail(c, err); }
  });

  // Confirm (with the reason it was needed, and the minutes - never more than the clock shows) or decline.
  app.post(`${P}/kpi/extra-hours`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const body = await c.req.json().catch(() => ({}));
      const id = String(body.employeeId || '');
      const date = String(body.date || '');
      const decision = body.decision === 'confirm' ? 'confirmed' : body.decision === 'decline' ? 'declined' : null;
      if (!id || !/^\d{4}-\d{2}-\d{2}$/.test(date) || !decision) return c.json({ error: 'Missing details' }, 400);
      const emp = await deps.kv.get<any>(`unified-employee:${id}`);
      if (!isStaff(emp) || !canManage(a, emp)) return c.json({ error: 'You can only confirm extra hours for your own team' }, 403);
      const [saved, punch, places] = await Promise.all([deps.kv.get<any>(`kpi-settings:${id}`), deps.kv.get<any>(`punch:${id}:${date}`), loadPlaces(deps.kv)]);
      const clocked = extraMinutesOf(punch, date, profileOf(emp, places, saved).settings);
      if (clocked < EXTRA_MIN_OFFERED) return c.json({ error: 'The check-in and check-out don\'t show extra time that day' }, 400);
      const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 200) : '';
      if (decision === 'confirmed' && reason.length < 3) return c.json({ error: 'Say why the extra time was needed' }, 400);
      const asked = Math.round(Number(body.minutes));
      const minutes = decision === 'confirmed' ? (Number.isFinite(asked) && asked > 0 ? Math.min(asked, clocked) : clocked) : 0;
      const rec = { employeeId: id, date, status: decision, minutes, clockedMinutes: clocked, reason, decidedBy: a.name, decidedById: a.employeeId, decidedAt: new Date().toISOString() };
      await deps.kv.set(`extra-hours:${id}:${date}`, rec);
      return c.json({ extra: rec });
    } catch (err) { return fail(c, err); }
  });

  // ---- Settings ----

  app.put(`${P}/kpi/settings/:employeeId`, async (c: any) => {
    const r = await lead(c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const t = await target(a, c.req.param('employeeId'));
      if (t.error) return c.json({ error: t.error }, t.status as any);
      const body = await c.req.json().catch(() => ({}));
      const clean = cleanSettingsInput(body, a.isOwner);
      if (!clean.ok) return c.json({ error: clean.error }, 400);
      const key = `kpi-settings:${t.emp.employeeId}`;
      const saved = (await deps.kv.get<any>(key)) || {};
      const next = {
        ...saved, ...clean.value,
        weights: { ...(saved.weights || {}), ...(clean.value.weights || {}) },
        employeeId: String(t.emp.employeeId), updatedBy: a.name, updatedAt: new Date().toISOString(),
      };
      await deps.kv.set(key, next);
      const profile = profileOf(t.emp, await loadPlaces(deps.kv), next);
      return c.json({ settings: profile.settings });
    } catch (err) { return fail(c, err); }
  });

  // Business-wide: workplace radius, and whether staff see money in My KPIs (owner only).
  app.put(`${P}/kpi/config`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    if (!r.actor!.isOwner) return c.json({ error: 'Only the owner can change this' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const cur = (await deps.kv.get<any>('kpi-config')) || {};
    const next = { ...cur };
    if (body.radiusM !== undefined) {
      const m = Number(body.radiusM);
      if (!Number.isFinite(m) || m < 50 || m > 1000) return c.json({ error: 'The workplace radius must be between 50 and 1000 m' }, 400);
      next.radiusM = Math.round(m);
    }
    if (body.showMoneyToStaff !== undefined) next.showMoneyToStaff = !!body.showMoneyToStaff;
    next.updatedAt = new Date().toISOString();
    await deps.kv.set('kpi-config', next);
    const cfg = await loadConfig(deps.kv);
    return c.json({ config: { radiusM: cfg.radiusM, showMoneyToStaff: cfg.showMoneyToStaff, punchSince: cfg.punchSince } });
  });

  // ---- Team screen ----

  app.get(`${P}/kpi/team`, async (c: any) => {
    const r = await lead(c);
    if (r.error) return r.error;
    const a = r.actor!;
    const month = monthOf(c);
    if (!month) return c.json({ error: 'Pick a month up to this one' }, 400);
    try {
      const [employees, places, cfg, savedRows, reviewRows, payRows] = await Promise.all([
        deps.kv.getByPrefix<any>('unified-employee:'),
        loadPlaces(deps.kv),
        loadConfig(deps.kv),
        rowsByPrefix('kpi-settings:'),
        rowsByPrefix(`kpi-review:${month}:`),
        rowsByPrefix(`variable-pay:${month}:`),
      ]);
      const staff = (employees || []).filter((e: any) => isStaff(e) && (a.isOwner || e.employeeId !== a.employeeId));
      const saved = new Map(savedRows.map((x) => [x.key.slice('kpi-settings:'.length), x.value]));
      const reviews = new Map(reviewRows.map((x) => [x.key.slice(`kpi-review:${month}:`.length), x.value]));
      const pays = new Map(payRows.map((x) => [x.key.slice(`variable-pay:${month}:`.length), x.value]));
      const profiles = staff.map((e: any) => profileOf(e, places, saved.get(String(e.employeeId))));
      const shared = await loadShared(deps, month, new Set(profiles.flatMap((p) => p.settings.kpis)), places, cfg.punchSince);
      const people = await mapLimit(staff, 6, async (emp: any) => {
        const i = staff.indexOf(emp);
        const profile = profiles[i];
        const kpis = await personKpis(deps, emp, profile, shared);
        const max = profile.settings.hasVariablePay ? profile.settings.variablePayMax : 0;
        return {
          employeeId: String(emp.employeeId),
          name: emp.name || String(emp.employeeId),
          roleLabel: ROLE_LABELS[profile.group],
          group: profile.group,
          workplace: profile.kind,
          pinMissing: !profile.exempt && profile.pins.length === 0,
          settings: profile.settings,
          kpis,
          formula: profile.settings.hasVariablePay ? variablePayFormula(kpis.total, max) : null,
          review: reviews.get(String(emp.employeeId)) || null,
          approval: pays.get(String(emp.employeeId)) || null,
        };
      });
      people.sort((x, y) => Number(y.settings.hasVariablePay) - Number(x.settings.hasVariablePay) || x.name.localeCompare(y.name));
      return c.json({
        month,
        today: shared.today,
        monthComplete: shared.today > monthDays(month).slice(-1)[0],
        config: { radiusM: cfg.radiusM, showMoneyToStaff: cfg.showMoneyToStaff, punchSince: cfg.punchSince },
        canEditMoney: a.isOwner,
        canApprove: a.isOwner,
        kpiLabels: KPI_LABELS,
        people,
      });
    } catch (err) { return fail(c, err); }
  });

  // ---- AI review (cached per month and person) ----

  app.post(`${P}/kpi/review`, async (c: any) => {
    const r = await lead(c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const body = await c.req.json().catch(() => ({}));
      const month = monthOf(c, body.month);
      if (!month) return c.json({ error: 'Pick a month up to this one' }, 400);
      const t = await target(a, String(body.employeeId || ''));
      if (t.error) return c.json({ error: t.error }, t.status as any);
      const key = `kpi-review:${month}:${t.emp.employeeId}`;
      if (!body.refresh) {
        const cached = await deps.kv.get<any>(key);
        if (cached) return c.json({ review: cached, cached: true });
      }
      const { profile, kpis, formula } = await onePerson(t.emp, month);
      if (kpis.total === null) return c.json({ error: 'No KPI data for this month yet' }, 400);
      const max = profile.settings.hasVariablePay ? profile.settings.variablePayMax : 0;
      const monthComplete = istDate(Date.now()) > monthDays(month).slice(-1)[0];
      const { data, model } = await askClaudeForJson(deps.kv, {
        purpose: 'kpi-review',
        system: REVIEW_SYSTEM,
        prompt: reviewPrompt(profile, kpis, formula, monthComplete),
        schema: REVIEW_SCHEMA,
        user: { id: a.userId, isOwner: a.isOwner },
        effort: 'low',
        maxTokens: 3000,
      });
      const clamp = clampAiAmount(formula.amount, data.suggestedAmount, max);
      const list = (v: any, n: number) => (Array.isArray(v) ? v.map((s) => String(s).slice(0, 240)).filter(Boolean).slice(0, n) : []);
      const review = {
        suggestedAmount: clamp.amount,
        aiAskedFor: Number.isFinite(Number(data.suggestedAmount)) ? Math.round(Number(data.suggestedAmount)) : null,
        keptWithinLimits: clamp.clamped,
        allowedRange: [clamp.lo, clamp.hi],
        adjustmentReason: String(data.adjustmentReason || '').slice(0, 400),
        oneLineSummary: String(data.oneLineSummary || '').slice(0, 300),
        strengths: list(data.strengths, 3),
        concerns: list(data.concerns, 3),
        whatToImproveNextMonth: list(data.whatToImproveNextMonth, 3),
        formulaAmount: formula.amount,
        total: kpis.total,
        max,
        monthComplete,
        model,
        generatedAt: new Date().toISOString(),
      };
      await deps.kv.set(key, review);
      return c.json({ review, cached: false });
    } catch (err) { return fail(c, err); }
  });

  // ---- Approve (owner) ----

  app.post(`${P}/kpi/approve`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.isOwner) return c.json({ error: 'Only the owner approves variable pay' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const month = monthOf(c, body.month);
      if (!month) return c.json({ error: 'Pick a month up to this one' }, 400);
      const t = await target(a, String(body.employeeId || ''));
      if (t.error) return c.json({ error: t.error }, t.status as any);
      const key = `variable-pay:${month}:${t.emp.employeeId}`;
      if (body.withdraw) { await deps.kv.del(key); return c.json({ approval: null }); }
      const { profile, kpis, formula } = await onePerson(t.emp, month);
      if (!profile.settings.hasVariablePay) return c.json({ error: 'Turn on variable pay for this person first' }, 400);
      const check = checkApprovedAmount(body.amount, profile.settings.variablePayMax);
      if (!check.ok) return c.json({ error: check.error }, 400);
      const review = await deps.kv.get<any>(`kpi-review:${month}:${t.emp.employeeId}`);
      const prev = await deps.kv.get<any>(key);
      const approval = {
        month,
        employeeId: String(t.emp.employeeId),
        formula: { amount: formula.amount, total: kpis.total, max: profile.settings.variablePayMax },
        ai: review ? { suggestedAmount: review.suggestedAmount, oneLineSummary: review.oneLineSummary, generatedAt: review.generatedAt } : null,
        approved: check.value,
        approvedBy: a.name,
        approvedAt: new Date().toISOString(),
      };
      await deps.kv.set(key, approval);
      // Tell the person their review is in - no amount in the notification.
      if (!prev && t.emp.authUserId && deps.notifyUser) {
        await deps.notifyUser(t.emp.authUserId, 'kpi_ready', 'Your monthly review is ready', `Your ${monthLabel(month)} KPIs have been reviewed - open My KPIs to see how you did and what to improve.`, undefined, month).catch(() => {});
      }
      return c.json({ approval });
    } catch (err) { return fail(c, err); }
  });

  // Payroll: the approved amount for a month, to fill in Variable Pay on the payout.
  app.get(`${P}/kpi/variable-pay`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.isOwner && a.role !== 'manager') return c.json({ error: 'Not allowed' }, 403);
    const month = c.req.query('month');
    if (!isMonth(month)) return c.json({ error: 'month must be YYYY-MM' }, 400);
    const employeeId = c.req.query('employeeId');
    try {
      if (employeeId) {
        const [rec, settings] = await Promise.all([deps.kv.get<any>(`variable-pay:${month}:${employeeId}`), deps.kv.get<any>(`kpi-settings:${employeeId}`)]);
        // max: 0 when the person has no variable pay (shown on their page under Pay components).
        const max = settings?.hasVariablePay ? Number(settings.variablePayMax) || 0 : 0;
        return c.json({ month, employeeId, approved: rec?.approved ?? null, approvedAt: rec?.approvedAt ?? null, max });
      }
      const rows = await rowsByPrefix(`variable-pay:${month}:`);
      return c.json({ month, approvals: rows.map((x) => ({ employeeId: x.value?.employeeId, approved: x.value?.approved ?? null, approvedAt: x.value?.approvedAt ?? null })) });
    } catch (err) { return fail(c, err); }
  });

  // ---- My KPIs (the signed-in person only) ----

  app.get(`${P}/kpi/me`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.employeeId || !isStaff(a.emp)) return c.json({ required: false });
    const month = monthOf(c);
    if (!month) return c.json({ error: 'Pick a month up to this one' }, 400);
    try {
      const { profile, kpis, formula, cfg } = await onePerson(a.emp, month);
      let money = null;
      if (cfg.showMoneyToStaff && profile.settings.hasVariablePay) {
        const rec = await deps.kv.get<any>(`variable-pay:${month}:${a.employeeId}`);
        money = { max: profile.settings.variablePayMax, estimate: formula.amount, approved: rec?.approved ?? null };
      }
      return c.json({
        required: true,
        month,
        today: istDate(Date.now()),
        roleLabel: ROLE_LABELS[profile.group],
        workplace: profile.kind,
        settings: { shiftStart: profile.settings.shiftStart, shiftEnd: profile.settings.shiftEnd, graceMin: profile.settings.graceMin, weeklyOff: profile.settings.weeklyOff },
        kpis,
        money,
        reviewed: !!(await deps.kv.get<any>(`variable-pay:${month}:${a.employeeId}`)),
        lastMonth: addDays(`${month}-01`, -1).slice(0, 7),
      });
    } catch (err) { return fail(c, err); }
  });
}
