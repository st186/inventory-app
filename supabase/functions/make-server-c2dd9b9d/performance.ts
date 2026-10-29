// Payslips and monthly performance notes (owner, 29 Oct 2026): "at the end of month each user should
// get a notification to download their payslip ... once they download it should disappear. Also
// there should be a note about performance from both manager and owner ... just under the payslip
// and once he reads it both payslip and performance report should disappear. ... for managers and
// owners the performance report should have a checklist and score for each point along with a
// personalized note." Registered from kpi.ts. The rules are in payslipRules.ts.
//
// The owner's choices: the payslip notice goes out once the month's salary is paid; one 6-point
// checklist for everyone (editable), scored 1-5; notes are written on the 1st-5th of the next month
// (reminders on the 1st and the 4th) and staff see each one as soon as it is sent.
//
//   perf-checklist                            the points scored: [{key, label, labelBn}]
//   perf-report:{month}:{employeeId}:{kind}   kind manager | owner: scores, note, who wrote it
//   payslip-state:{employeeId}:{month}        readyAt (notice sent), downloadedAt, read: kinds read
import { P, actorOf, type Actor, type KpiDeps } from './attendance.ts';
import {
  DEFAULT_CHECKLIST, PAYSLIP_FROM, averageOf, buildPayslip, cleanItems, isStaff, managerOf, monthlySalaryOf, payoutMonth, payslipReady,
  personalExpensesFor, prevMonth, rupeesInWords, type ChecklistItem, type Report, type WriterKind,
} from './payslipRules.ts';

const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const isMonth = (m: unknown): m is string => typeof m === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(m);
const monthLabel = (m: string) => new Date(`${m}-01T00:00:00Z`).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const reportKey = (month: string, employeeId: string, kind: WriterKind) => `perf-report:${month}:${employeeId}:${kind}`;
const stateKey = (employeeId: string, month: string) => `payslip-state:${employeeId}:${month}`;
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 30) || 'point';

type State = { readyAt?: string; downloadedAt?: string; read?: WriterKind[] };

export function registerPerformanceRoutes(app: any, deps: KpiDeps) {
  const fail = (c: any, err: any) => {
    console.error('[performance]', err?.message || 'error');
    return c.json({ error: 'Something went wrong - try again' }, 500);
  };
  const employees = async () => (await deps.getAllByPrefix('unified-employee:')).filter((e: any) => e?.employeeId);
  const checklist = async (): Promise<ChecklistItem[]> => {
    const saved = await deps.kv.get<any>('perf-checklist');
    return Array.isArray(saved?.items) && saved.items.length ? saved.items : DEFAULT_CHECKLIST;
  };
  const reportsAbout = async (month: string, employeeId: string): Promise<Report[]> =>
    (await Promise.all((['manager', 'owner'] as WriterKind[]).map((k) => deps.kv.get<Report>(reportKey(month, employeeId, k))))).filter(Boolean) as Report[];
  const withAverage = (r: Report) => ({ ...r, average: averageOf(r.items) });
  const notify = (authUserId: string | undefined, type: string, title: string, message: string, relatedDate?: string) =>
    authUserId && deps.notifyUser ? deps.notifyUser(authUserId, type, title, message, undefined, relatedDate).catch(() => undefined) : Promise.resolve();

  // Which note the actor writes for a person: the owner's, or the manager's if they manage them.
  const kindFor = (a: Actor, target: any, all: any[]): WriterKind | null => {
    if (!isStaff(target) || (a.employeeId && String(target.employeeId) === a.employeeId)) return null;
    if (a.isOwner) return 'owner';
    return managerOf(target, all)?.employeeId === a.employeeId ? 'manager' : null;
  };

  // ---- The payslip itself (the app draws the PDF) ----

  async function payslipOf(emp: any, month: string) {
    const [payouts, overheads, vp, leaves, advances, store, houses] = await Promise.all([
      deps.getAllByPrefix('payout:'),
      deps.getAllByPrefix('overhead:'),
      deps.kv.get<any>(`variable-pay:${month}:${emp.employeeId}`),
      deps.kv.getByPrefix<any>(`leave:${emp.employeeId}:`),
      deps.kv.getByPrefix<any>('salary_advance:'),
      emp.storeId ? deps.kv.get<any>(`store:${emp.storeId}`) : null,
      emp.storeId ? deps.kv.getByPrefix<any>('production_house_') : [],
    ]);
    const mine = (payouts || []).filter((p: any) => (p?.employeeId === emp.employeeId || p?.employeeId === emp.id) && payoutMonth(p) === month);
    const slip = buildPayslip({
      month,
      structure: emp.salaryStructure,
      payouts: mine,
      personalExpenses: personalExpensesFor(overheads, emp.employeeId, month),
      kpi: vp?.formula && Number.isFinite(Number(vp.formula.total)) ? { score: Math.round(Number(vp.formula.total)), max: Number(vp.formula.max) || 0 } : null,
    });
    const leaveDays = (leaves || []).filter((l: any) => l?.status === 'approved' && String(l.leaveDate || '').startsWith(month))
      .reduce((s: number, l: any) => s + (l.leaveType === 'half' ? 0.5 : 1), 0);
    const advanceLeft = (advances || [])
      .filter((a: any) => (a?.employeeId === emp.id || a?.employeeId === emp.employeeId || a?.employeeEmployeeId === emp.employeeId) && a.status === 'approved')
      .reduce((s: number, a: any) => s + Math.max(0, Number(a.remainingAmount) || 0), 0);
    const place = store?.name || (houses || []).find((h: any) => h?.id === emp.storeId)?.name || '';
    return {
      number: `${emp.employeeId}-${month}`,
      employee: { employeeId: emp.employeeId, name: emp.name, designation: emp.designation || emp.role || '', place, joiningDate: emp.joiningDate || null },
      leaveDays,
      advanceLeft,
      inWords: rupeesInWords(slip.net),
      paid: mine.length > 0,
      ready: payslipReady({ month, today: todayIST(), salary: monthlySalaryOf(emp, month), payouts: mine }),
      ...slip,
    };
  }

  // GET /payslip?month=YYYY-MM[&employeeId=] - your own, or anyone's for the owner.
  app.get(`${P}/payslip`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    const month = c.req.query('month');
    if (!isMonth(month)) return c.json({ error: 'month must be YYYY-MM' }, 400);
    const id = c.req.query('employeeId') || a.employeeId;
    if (!id) return c.json({ error: 'No employee record for this login' }, 400);
    if (id !== a.employeeId && !a.isOwner) return c.json({ error: 'Only the owner opens other people\'s payslips' }, 403);
    try {
      const emp = await deps.kv.get<any>(`unified-employee:${id}`);
      if (!emp) return c.json({ error: 'Person not found' }, 404);
      return c.json({ payslip: await payslipOf(emp, month) });
    } catch (err) { return fail(c, err); }
  });

  // GET /payslip/months - the last 12 months with any pay, newest first, for More > Payslips.
  app.get(`${P}/payslip/months`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.employeeId || !a.emp) return c.json({ months: [] });
    try {
      const payouts = (await deps.getAllByPrefix('payout:')).filter((p: any) => p?.employeeId === a.employeeId || p?.employeeId === a.emp.id);
      const today = todayIST();
      const months: { month: string; paid: number; ready: boolean }[] = [];
      for (let m = today.slice(0, 7), i = 0; i < 12; m = prevMonth(m), i++) {
        const mine = payouts.filter((p: any) => payoutMonth(p) === m);
        if (!mine.length) continue;
        months.push({ month: m, paid: mine.reduce((s: number, p: any) => s + (Number(p.amount) || 0), 0), ready: payslipReady({ month: m, today, salary: monthlySalaryOf(a.emp, m), payouts: mine }) });
      }
      return c.json({ months });
    } catch (err) { return fail(c, err); }
  });

  // ---- The Home card: payslips not downloaded yet, notes not read yet ----

  app.get(`${P}/payslip/inbox`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.employeeId || !isStaff(a.emp)) return c.json({ items: [] });
    try {
      const last = prevMonth(todayIST().slice(0, 7));
      const items = [];
      for (const month of [prevMonth(last), last]) {
        if (month < PAYSLIP_FROM) continue;
        const [state, reports] = await Promise.all([deps.kv.get<State>(stateKey(a.employeeId, month)), reportsAbout(month, a.employeeId)]);
        const read = new Set(state?.read || []);
        const payslipDue = !!state?.readyAt && !state?.downloadedAt;
        const unread = reports.filter((x) => !read.has(x.kind));
        if (!payslipDue && !unread.length) continue;
        items.push({ month, payslipReady: !!state?.readyAt, downloaded: !!state?.downloadedAt, reports: reports.map((x) => ({ ...withAverage(x), read: read.has(x.kind) })) });
      }
      return c.json({ items });
    } catch (err) { return fail(c, err); }
  });

  // POST /payslip/:month/seen {downloaded?: true, read?: ['manager','owner']} - your own.
  app.post(`${P}/payslip/:month/seen`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    const month = c.req.param('month');
    if (!a.employeeId || !isMonth(month)) return c.json({ error: 'Not allowed' }, 400);
    try {
      const body = await c.req.json().catch(() => ({}));
      const key = stateKey(a.employeeId, month);
      const state: State = (await deps.kv.get<State>(key)) || {};
      if (body.downloaded && !state.downloadedAt) state.downloadedAt = new Date().toISOString();
      const kinds = (Array.isArray(body.read) ? body.read : []).filter((k: any) => k === 'manager' || k === 'owner');
      if (kinds.length) state.read = [...new Set([...(state.read || []), ...kinds])] as WriterKind[];
      await deps.kv.set(key, state);
      return c.json({ state });
    } catch (err) { return fail(c, err); }
  });

  // ---- Performance notes ----

  app.get(`${P}/performance/checklist`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    return c.json({ items: await checklist() });
  });

  // PUT /performance/checklist {items: [{label, labelBn}]} - the owner changes the points.
  app.put(`${P}/performance/checklist`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    if (!r.actor!.isOwner) return c.json({ error: 'Only the owner changes the checklist' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const raw = Array.isArray(body.items) ? body.items : [];
      const current = await checklist();
      const used = new Set<string>();
      const items: ChecklistItem[] = [];
      for (const x of raw) {
        const label = clip(x?.label, 60);
        if (!label) continue;
        // Keep a point's key when its label is unchanged, so last month's notes still line up.
        let key = current.find((cur) => cur.label === label)?.key || clip(x?.key, 30) || slug(label);
        while (used.has(key)) key = `${key}-2`;
        used.add(key);
        items.push({ key, label, labelBn: clip(x?.labelBn, 80) });
      }
      if (items.length < 3 || items.length > 10) return c.json({ error: 'Keep 3 to 10 points' }, 400);
      await deps.kv.set('perf-checklist', { items, updatedAt: new Date().toISOString(), updatedBy: r.actor!.name });
      return c.json({ items });
    } catch (err) { return fail(c, err); }
  });

  // GET /performance/write?month= - the people the caller writes notes for, and what is written.
  app.get(`${P}/performance/write`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    const month = c.req.query('month') || prevMonth(todayIST().slice(0, 7));
    if (!isMonth(month)) return c.json({ error: 'month must be YYYY-MM' }, 400);
    try {
      const all = await employees();
      const people = [];
      for (const e of all) {
        const kind = kindFor(a, e, all);
        if (!kind) continue;
        const [mine, other] = await Promise.all([
          deps.kv.get<Report>(reportKey(month, e.employeeId, kind)),
          // The owner sees what the manager wrote; a manager doesn't see the owner's.
          a.isOwner ? deps.kv.get<Report>(reportKey(month, e.employeeId, 'manager')) : null,
        ]);
        const manager = managerOf(e, all);
        people.push({
          employeeId: e.employeeId, name: e.name, designation: e.designation || e.role, kind,
          managerName: manager?.name || null,
          mine: mine ? withAverage(mine) : null,
          manager: other ? withAverage(other) : null,
        });
      }
      people.sort((x, y) => Number(!!x.mine) - Number(!!y.mine) || String(x.name).localeCompare(String(y.name)));
      return c.json({ month, items: await checklist(), people });
    } catch (err) { return fail(c, err); }
  });

  // PUT /performance/:month/:employeeId {items: [{key, score}], note} - write or change your note.
  app.put(`${P}/performance/:month/:employeeId`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    const month = c.req.param('month');
    const employeeId = c.req.param('employeeId');
    if (!isMonth(month)) return c.json({ error: 'month must be YYYY-MM' }, 400);
    const thisMonth = todayIST().slice(0, 7);
    if (month > thisMonth || month < prevMonth(prevMonth(thisMonth))) return c.json({ error: 'Notes are for this month or the two before' }, 400);
    try {
      const all = await employees();
      const target = all.find((e: any) => String(e.employeeId) === employeeId);
      const kind = target ? kindFor(a, target, all) : null;
      if (!kind) return c.json({ error: 'You do not write this person\'s note' }, 403);
      const body = await c.req.json().catch(() => ({}));
      const { items, error } = cleanItems(await checklist(), body.items);
      if (error) return c.json({ error }, 400);
      const note = clip(body.note, 1500);
      if (note.length < 10) return c.json({ error: 'Write a short personal note (a sentence or two)' }, 400);
      const key = reportKey(month, employeeId, kind);
      const prev = await deps.kv.get<Report>(key);
      const now = new Date().toISOString();
      const report: Report = {
        month, employeeId, kind, writerId: a.employeeId, writerName: a.name, items: items!, note,
        sentAt: prev?.sentAt || now, updatedAt: now,
      };
      await deps.kv.set(key, report);
      // A changed note is new to them again.
      const sKey = stateKey(employeeId, month);
      const state = await deps.kv.get<State>(sKey);
      if (state?.read?.includes(kind)) await deps.kv.set(sKey, { ...state, read: state.read.filter((k) => k !== kind) });
      if (!prev) {
        await notify(target.authUserId, 'performance_report', `Your ${monthLabel(month)} performance note`,
          `${kind === 'owner' ? 'The owner' : a.name} wrote about your work in ${monthLabel(month)}. Open it on Home. · কাজের মূল্যায়ন এসেছে, Home-এ দেখুন`, month);
      }
      return c.json({ report: withAverage(report) });
    } catch (err) { return fail(c, err); }
  });

  // GET /performance/mine - notes about the caller, newest month first.
  app.get(`${P}/performance/mine`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.employeeId) return c.json({ months: [] });
    try {
      const rows = (await deps.kv.getByPrefix<Report>('perf-report:')).filter((x) => x?.employeeId === a.employeeId);
      const byMonth = new Map<string, Report[]>();
      for (const x of rows) byMonth.set(x.month, [...(byMonth.get(x.month) || []), x]);
      const months = [...byMonth.keys()].sort().reverse().map((month) => ({
        month,
        reports: byMonth.get(month)!.sort((x, y) => (x.kind === 'manager' ? -1 : 1) - (y.kind === 'manager' ? -1 : 1)).map(withAverage),
      }));
      return c.json({ months });
    } catch (err) { return fail(c, err); }
  });

  // ---- Every morning (pg_cron, X-Cron-Secret, 10:30 AM IST) ----
  // Payslip notices for last month once its salary is paid; on the 1st and the 4th, reminders to
  // write last month's notes. ?dry=1&today=YYYY-MM-DD for a test run that sends nothing.
  app.post(`${P}/send-payslip-notices`, async (c: any) => {
    const secret = Deno.env.get('CRON_SYNC_SECRET');
    if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const dry = c.req.query('dry') === '1';
      const today = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('today') || '') ? c.req.query('today') : todayIST();
      const month = prevMonth(today.slice(0, 7));
      if (month < PAYSLIP_FROM) return c.json({ success: true, month, payslips: [], reminders: [] });
      const all = await employees();
      const staff = all.filter(isStaff);
      const payouts = await deps.getAllByPrefix('payout:');

      const payslips: string[] = [];
      for (const e of staff) {
        const key = stateKey(e.employeeId, month);
        const state = (await deps.kv.get<State>(key)) || {};
        if (state.readyAt) continue;
        const mine = payouts.filter((p: any) => (p?.employeeId === e.employeeId || p?.employeeId === e.id) && payoutMonth(p) === month);
        if (!payslipReady({ month, today, salary: monthlySalaryOf(e, month), payouts: mine })) continue;
        payslips.push(e.name);
        if (dry) continue;
        await deps.kv.set(key, { ...state, readyAt: new Date().toISOString() });
        await notify(e.authUserId, 'payslip_ready', `Your ${monthLabel(month)} payslip is ready`,
          `Download it from Home. · ${monthLabel(month)}-এর বেতনের স্লিপ তৈরি, Home থেকে ডাউনলোড করুন`, month);
      }

      const reminders: { to: string; people: string[] }[] = [];
      const day = Number(today.slice(8, 10));
      if (day === 1 || day === 4) {
        const owners = all.filter((e: any) => e.role === 'cluster_head' && !['inactive', 'archived'].includes(e.status));
        const toWrite = new Map<string, { writer: any; people: string[] }>();
        const add = (writer: any, name: string) => {
          const k = String(writer.employeeId);
          toWrite.set(k, { writer, people: [...(toWrite.get(k)?.people || []), name] });
        };
        for (const e of staff) {
          const manager = managerOf(e, all);
          if (manager && !(await deps.kv.get(reportKey(month, e.employeeId, 'manager')))) add(manager, e.name);
          if (!(await deps.kv.get(reportKey(month, e.employeeId, 'owner')))) for (const o of owners) add(o, e.name);
        }
        for (const { writer, people } of toWrite.values()) {
          reminders.push({ to: writer.name, people });
          if (dry) continue;
          const names = people.slice(0, 4).join(', ') + (people.length > 4 ? ` +${people.length - 4}` : '');
          await notify(writer.authUserId, 'performance_due', day === 1 ? `Write ${monthLabel(month)} performance notes` : `${people.length} performance note${people.length === 1 ? '' : 's'} still to write`,
            `${names}. Score each point 1 to 5 and add a personal note, by the 5th. More > Performance reports.`, month);
        }
      }
      return c.json({ success: true, month, dry, payslips, reminders });
    } catch (err) { return fail(c, err); }
  });
}
