// Store opening checklist (owner, 28 Oct 2026): before the store opens, the store incharge ticks
// what is ready - oil, butter, soup, sauces, the KOT and POS machines, lights and seating, burger
// stock, each machine working, the porch and drain, the dustbin, the pooja, water and cold drinks,
// and on Saturdays the lemon and chillies at the door. Reminded at 9 AM, due by 4 PM. Each day's
// score (ticked by the due time counts in full, later that day half) is the "Store ready on time"
// KPI (kpiCore storeReadiness).
// On a day the incharge is on full-day leave the cover person does it (due 5:30 PM - on cover days
// they reach the store at 5); if they are away too, the backup the owner set, else the owner picks
// someone for the day. Registered from kpi.ts; the reminders ride on the store-cover cron.
//
//   opening-template:{storeId}      the list, who does it, the times
//   opening-check:{date}:{storeId}  that day's ticks, the day's pick, reminders sent
import { P, actorOf, type KpiDeps } from './attendance.ts';
import { fmt12, istDate, parseHHMM } from './kpiCore.ts';
import {
  DEFAULT_OPENING_ITEMS, istMinutesOf, openingDoer, openingScore, openingTickables,
  type OpeningDay, type OpeningTemplate,
} from './openingRules.ts';
export type { OpeningDay, OpeningTemplate } from './openingRules.ts';

const templateKey = (storeId: string) => `opening-template:${storeId}`;
const dayKey = (date: string, storeId: string) => `opening-check:${date}:${storeId}`;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const istMinutesNow = () => istMinutesOf(new Date().toISOString());

type Ctx = { employees: any[]; leaves: any[]; stores: Map<string, any> };
async function loadCtx(deps: KpiDeps): Promise<Ctx> {
  const [employees, leaves, stores] = await Promise.all([
    deps.kv.getByPrefix<any>('unified-employee:'), deps.getAllByPrefix('leave:'), deps.kv.getByPrefix<any>('store:'),
  ]);
  return {
    employees: (employees || []).filter((e: any) => e?.employeeId && e.status !== 'inactive'),
    leaves: leaves || [],
    stores: new Map((stores || []).filter((s: any) => s?.id).map((s: any) => [String(s.id), s])),
  };
}
const awayOn = (ctx: Ctx, id: string | null | undefined, date: string) => !!id && ctx.leaves.some((l: any) =>
  l?.status === 'approved' && String(l.employeeId) === id && String(l.leaveDate || '').slice(0, 10) === date && l.leaveType !== 'half');
const nameOf = (ctx: Ctx, id: string | null | undefined) => (id ? String(ctx.employees.find((e) => String(e.employeeId) === id)?.name || id) : '');

const isLead = (a: { isOwner: boolean; role: string; designation: string | null }) =>
  a.isOwner || (a.role === 'manager' && a.designation !== 'store_incharge' && a.designation !== 'production_incharge');

export function registerOpeningChecklistRoutes(app: any, deps: KpiDeps) {
  const loadTemplates = async () => ((await deps.kv.getByPrefix<OpeningTemplate>('opening-template:')) || []).filter((t) => t?.storeId && Array.isArray(t.items));
  const fail = (c: any, err: any) => { console.log('[opening-checklist]', err?.message || 'error'); return c.json({ error: 'Something went wrong - try again' }, 500); };

  const viewOf = (ctx: Ctx, t: OpeningTemplate, day: OpeningDay | null, date: string) => {
    const who = openingDoer(t, day, date, (id) => awayOn(ctx, id, date));
    const boxes = openingTickables(t, date).map((b) => ({ ...b, tick: day?.ticks?.[b.id] || null }));
    return {
      date, storeId: t.storeId, storeName: String(ctx.stores.get(t.storeId)?.name || 'Store'),
      doerId: who.personId, doerName: nameOf(ctx, who.personId), doerAs: who.as, dueBy: who.dueBy,
      assigneeName: nameOf(ctx, t.assigneeId), coverName: nameOf(ctx, t.coverId),
      items: boxes, done: boxes.filter((b) => b.tick).length, total: boxes.length,
      score: openingScore(t, day, date, who.dueBy),
    };
  };

  // Today's checklist for whoever does it, and every store's progress for the owner and ops.
  app.get(`${P}/opening-checklist/today`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const date = istDate(Date.now());
      const [templates, ctx] = await Promise.all([loadTemplates(), loadCtx(deps)]);
      const lead = isLead(actor!);
      const mine: any[] = []; const overview: any[] = [];
      for (const t of templates) {
        const day = await deps.kv.get<OpeningDay>(dayKey(date, t.storeId));
        const v = viewOf(ctx, t, day, date);
        if (actor!.employeeId && v.doerId === actor!.employeeId) mine.push(v);
        if (lead) overview.push({ ...v, needsPick: !v.doerId && !!t.assigneeId });
      }
      return c.json({ date, mine, ...(lead ? { overview } : {}) });
    } catch (err) { return fail(c, err); }
  });

  // One box ticked or unticked, by today's doer (or the owner / ops).
  app.post(`${P}/opening-checklist/tick`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    try {
      const body = await c.req.json().catch(() => ({}));
      const storeId = String(body?.storeId || ''); const itemId = String(body?.itemId || '');
      const date = istDate(Date.now());
      const t = await deps.kv.get<OpeningTemplate>(templateKey(storeId));
      if (!t) return c.json({ error: 'No opening checklist for this store' }, 404);
      if (!openingTickables(t, date).some((b) => b.id === itemId)) return c.json({ error: 'That item is not on today\'s list' }, 400);
      const ctx = await loadCtx(deps);
      const day: OpeningDay = (await deps.kv.get<OpeningDay>(dayKey(date, storeId))) || { date, storeId, ticks: {} };
      const who = openingDoer(t, day, date, (id) => awayOn(ctx, id, date));
      if (who.personId !== actor!.employeeId && !isLead(actor!)) return c.json({ error: 'Today\'s opening checklist is someone else\'s' }, 403);
      if (body?.done === false) delete day.ticks[itemId];
      else day.ticks[itemId] = { at: new Date().toISOString(), byId: actor!.employeeId || actor!.userId, byName: actor!.name };
      await deps.kv.set(dayKey(date, storeId), day);
      return c.json({ checklist: viewOf(ctx, t, day, date) });
    } catch (err) { return fail(c, err); }
  });

  // Everyone set up is on leave: the owner or ops picks who opens the store today.
  app.post(`${P}/opening-checklist/pick`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can pick' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const storeId = String(body?.storeId || ''); const employeeId = String(body?.employeeId || '');
      const date = istDate(Date.now());
      const t = await deps.kv.get<OpeningTemplate>(templateKey(storeId));
      if (!t) return c.json({ error: 'No opening checklist for this store' }, 404);
      const ctx = await loadCtx(deps);
      const person = ctx.employees.find((e) => String(e.employeeId) === employeeId);
      if (!person) return c.json({ error: 'Pick someone from the team' }, 400);
      const day: OpeningDay = (await deps.kv.get<OpeningDay>(dayKey(date, storeId))) || { date, storeId, ticks: {} };
      day.pickedId = employeeId; day.pickedBy = actor!.name;
      await deps.kv.set(dayKey(date, storeId), day);
      const v = viewOf(ctx, t, day, date);
      if (person.authUserId && deps.notifyUser) {
        await deps.notifyUser(person.authUserId, 'opening_due', `Open ${v.storeName} today: ${v.total} checks by ${fmt12(parseHHMM(v.dueBy) ?? 960)}`,
          `${actor!.name} picked you: ${nameOf(ctx, t.assigneeId)} and ${nameOf(ctx, t.coverId) || 'the cover'} are on leave. Home > Opening checklist.`, undefined, date).catch(() => undefined);
      }
      return c.json({ checklist: v });
    } catch (err) { return fail(c, err); }
  });

  // Who does it and the times (the list itself stays as set); the last two weeks' scores.
  app.get(`${P}/opening-checklist/setup`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can do this' }, 403);
    try {
      const [templates, ctx] = await Promise.all([loadTemplates(), loadCtx(deps)]);
      const today = istDate(Date.now());
      const stores = [...ctx.stores.values()].map((s: any) => ({ id: String(s.id), name: String(s.name || s.id) }));
      const history: Record<string, { date: string; doerName: string; score: number | null; done: number; total: number }[]> = {};
      for (const t of templates) {
        const rows: any[] = [];
        for (let i = 1; i <= 14; i++) {
          const date = istDate(Date.parse(`${today}T12:00:00+05:30`) - i * 86400000);
          if (date < t.startedOn) break;
          const day = await deps.kv.get<OpeningDay>(dayKey(date, t.storeId));
          const v = viewOf(ctx, t, day, date);
          rows.push({ date, doerName: v.doerName, score: v.score, done: v.done, total: v.total });
        }
        history[t.storeId] = rows;
      }
      const people = ctx.employees.filter((e) => e.role !== 'audit' && e.designation !== 'rider')
        .map((e) => ({ id: String(e.employeeId), name: String(e.name || e.employeeId) })).sort((a, b) => a.name.localeCompare(b.name));
      return c.json({ templates, stores, people, history, defaultItems: DEFAULT_OPENING_ITEMS });
    } catch (err) { return fail(c, err); }
  });

  app.put(`${P}/opening-checklist/setup`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!isLead(actor!)) return c.json({ error: 'Only the owner or an operations manager can do this' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const storeId = String(body?.storeId || '');
      const ctx = await loadCtx(deps);
      if (!ctx.stores.has(storeId)) return c.json({ error: 'Pick a store' }, 400);
      const known = (id: unknown) => (id && ctx.employees.some((e) => String(e.employeeId) === String(id)) ? String(id) : null);
      for (const k of ['dueBy', 'coverDueBy']) if (body?.[k] && !TIME.test(String(body[k]))) return c.json({ error: 'Times look like 16:00' }, 400);
      const cur = await deps.kv.get<OpeningTemplate>(templateKey(storeId));
      const next: OpeningTemplate = {
        storeId,
        assigneeId: known(body?.assigneeId), coverId: known(body?.coverId), backupId: known(body?.backupId),
        notifyAt: cur?.notifyAt || '09:00', dueBy: body?.dueBy || cur?.dueBy || '16:00', coverDueBy: body?.coverDueBy || cur?.coverDueBy || '17:30',
        items: cur?.items?.length ? cur.items : DEFAULT_OPENING_ITEMS,
        startedOn: cur?.startedOn || istDate(Date.now()),
        updatedAt: new Date().toISOString(), updatedBy: actor!.name,
      };
      await deps.kv.set(templateKey(storeId), next);
      return c.json({ template: next });
    } catch (err) { return fail(c, err); }
  });
}

// The 9 AM reminder, the 4 PM "not done", and asking the owner to pick when everyone is away.
// Called from the store-cover cron (every half hour), so no job of its own.
export async function openingChecklistTick(deps: KpiDeps) {
  if (!deps.notifyUser) return 0;
  const templates = ((await deps.kv.getByPrefix<OpeningTemplate>('opening-template:')) || []).filter((t) => t?.storeId && t.assigneeId);
  if (!templates.length) return 0;
  const ctx = await loadCtx(deps);
  const date = istDate(Date.now());
  const now = istMinutesNow();
  const owners = ctx.employees.filter((e) => e.role === 'cluster_head' && e.authUserId);
  let sent = 0;
  for (const t of templates) {
    const key = dayKey(date, t.storeId);
    const day: OpeningDay = (await deps.kv.get<OpeningDay>(key)) || { date, storeId: t.storeId, ticks: {} };
    const sentBefore = JSON.stringify(day.sent || {});
    day.sent = day.sent || {};
    const who = openingDoer(t, day, date, (id) => awayOn(ctx, id, date));
    const boxes = openingTickables(t, date);
    const done = boxes.filter((b) => day.ticks?.[b.id]).length;
    const storeName = String(ctx.stores.get(t.storeId)?.name || 'the store');
    const person = ctx.employees.find((e) => String(e.employeeId) === who.personId);
    const due = parseHHMM(who.dueBy) ?? 16 * 60;
    if (now >= (parseHHMM(t.notifyAt) ?? 9 * 60) && now < due) {
      if (person && !day.sent.morning) {
        const covering = who.as === 'cover' || who.as === 'backup' ? ` ${nameOf(ctx, t.assigneeId)} is on leave, so it's yours today.` : '';
        await deps.notifyUser(person.authUserId, 'opening_due', `Opening checklist: ${boxes.length} checks by ${fmt12(due)}`,
          `${storeName}: tick each one as it's ready.${covering} · দোকান খোলার আগে ${boxes.length}টা জিনিস দেখে টিক দিন।`, undefined, date).catch(() => undefined);
        day.sent.morning = new Date().toISOString(); sent++;
      } else if (!person && !day.sent.pick) {
        for (const o of owners) {
          await deps.notifyUser(o.authUserId, 'opening_pick', `Pick who opens ${storeName} today`,
            `${nameOf(ctx, t.assigneeId)} and ${nameOf(ctx, t.coverId) || 'the cover'} are both on leave. Home > Opening checklist.`, undefined, date).catch(() => undefined);
          sent++;
        }
        day.sent.pick = new Date().toISOString();
      }
    }
    if (now >= due && done < boxes.length && !day.sent.late) {
      const left = boxes.filter((b) => !day.ticks?.[b.id]).slice(0, 4).map((b) => b.name).join(', ');
      const to = new Set<string>([...(person?.authUserId ? [person.authUserId] : []), ...owners.map((o) => o.authUserId)]);
      for (const authUserId of to) {
        await deps.notifyUser(authUserId, 'opening_late', `Opening checklist not done: ${boxes.length - done} of ${boxes.length} left`,
          `${storeName}${person ? ` (${person.name})` : ''}: ${left}${boxes.length - done > 4 ? ' …' : ''}.`, undefined, date).catch(() => undefined);
        sent++;
      }
      day.sent.late = new Date().toISOString();
    }
    if (JSON.stringify(day.sent) !== sentBefore) {
      // The day row is written by ticks too: write back only the reminders, onto the latest copy.
      const latest: OpeningDay = (await deps.kv.get<OpeningDay>(key)) || day;
      await deps.kv.set(key, { ...latest, sent: { ...(latest.sent || {}), ...day.sent } });
    }
  }
  return sent;
}
