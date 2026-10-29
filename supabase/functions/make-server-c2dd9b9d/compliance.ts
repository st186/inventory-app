// Compliance calendar (owner, 29 Oct 2026: "compliance calender is something good to include"):
// licences, safety checks and staff certificates with their due dates. A repeating one moves on to
// its next date when it is marked done; the owner and operations managers are reminded before each
// is due and while it is overdue (send-compliance-reminders, pg_cron every morning). The usual list
// for a food business is offered until each is added. Owner and operations managers only.
// Registered from kpi.ts.
//
//   compliance:{id}   one thing to keep up: title, kind, place, due date, how often, who handles
//                     it, notes, and each time it was done (date, by, note, photo of the paper)
import { P, actorOf, type KpiDeps } from './attendance.ts';

export type Repeat = 'none' | 'monthly' | 'quarterly' | 'half_yearly' | 'yearly' | 'two_yearly';
const MONTHS: Record<Repeat, number> = { none: 0, monthly: 1, quarterly: 3, half_yearly: 6, yearly: 12, two_yearly: 24 };
const KINDS = ['licence', 'safety', 'hygiene', 'staff', 'tax', 'property', 'other'] as const;
type Kind = typeof KINDS[number];
type Done = { date: string; by: string; note?: string; photoPath?: string; at: string };
type Item = {
  id: string; starter?: string; title: string; kind: Kind; place: string; dueDate: string | null; repeat: Repeat;
  handledBy?: string; notes?: string; history: Done[]; createdBy: string; createdAt: string; updatedAt: string;
};

// The usual ones, offered until added (each with its usual repeat; the due date is the owner's).
const STARTERS: { key: string; title: string; kind: Kind; repeat: Repeat; hint: string }[] = [
  { key: 'fssai', title: 'FSSAI licence renewal', kind: 'licence', repeat: 'yearly', hint: 'The food licence: renew before the date printed on it.' },
  { key: 'trade', title: 'Trade licence renewal', kind: 'licence', repeat: 'yearly', hint: 'From the municipality, renewed every year.' },
  { key: 'fire', title: 'Fire extinguisher refill and check', kind: 'safety', repeat: 'yearly', hint: 'The refill date is on the tag on each extinguisher.' },
  { key: 'pest', title: 'Pest control', kind: 'hygiene', repeat: 'monthly', hint: 'Keep the service slip; inspectors ask for it.' },
  { key: 'tank', title: 'Water tank cleaning', kind: 'hygiene', repeat: 'half_yearly', hint: 'The tank the kitchen water comes from.' },
  { key: 'water', title: 'Drinking water test', kind: 'hygiene', repeat: 'half_yearly', hint: 'A lab report on the water used for cooking and drinking.' },
  { key: 'medical', title: 'Staff medical fitness certificates', kind: 'staff', repeat: 'yearly', hint: 'FSSAI asks for one for every food handler each year.' },
  { key: 'hood', title: 'Fryer hood and exhaust cleaning', kind: 'safety', repeat: 'quarterly', hint: 'Grease in the duct is a fire risk.' },
  { key: 'electric', title: 'Electrical wiring and earthing check', kind: 'safety', repeat: 'yearly', hint: 'By a licensed electrician.' },
  { key: 'firstaid', title: 'First-aid box refill', kind: 'safety', repeat: 'quarterly', hint: 'Burn cream, plasters, bandages.' },
  { key: 'rent', title: 'Rent agreement renewal', kind: 'property', repeat: 'none', hint: 'The date the agreement ends.' },
  { key: 'gst', title: 'GST registration check with the CA', kind: 'tax', repeat: 'none', hint: 'Yearly sales are about ₹35–40 lakh with online orders.' },
];

const itemKey = (id: string) => `compliance:${id}`;
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const isDate = (s: unknown): s is string => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s);
const newId = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, '0')).join('');
const todayIST = () => new Date(Date.now() + 5.5 * 3600000).toISOString().slice(0, 10);
const daysBetween = (from: string, to: string) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86400000);
function addMonths(date: string, n: number): string {
  const [y, m, d] = date.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + n, 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return target.toISOString().slice(0, 10);
}
const shortDate = (date: string) => new Date(`${date}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });

/** Reminders: 30 days before (for things done every 3 months or less often), 7 days, 1 day, the
 *  day itself, then every 7 days while overdue. */
export function reminderStage(item: Pick<Item, 'dueDate' | 'repeat'>, today: string): number | null {
  if (!item.dueDate) return null;
  const left = daysBetween(today, item.dueDate);
  if (left < 0) return -left % 7 === 0 ? left : null;
  if (left === 30) return MONTHS[item.repeat] === 0 || MONTHS[item.repeat] >= 3 ? 30 : null;
  return [7, 1, 0].includes(left) ? left : null;
}

export function registerComplianceRoutes(app: any, deps: KpiDeps) {
  const fail = (c: any, err: any) => { console.log('[compliance]', err?.message || 'error'); return c.json({ error: 'Something went wrong - try again' }, 500); };
  const leadOf = async (c: any) => {
    const { actor, error } = await actorOf(deps, c);
    if (error) return { error };
    if (!actor!.isOwner && !actor!.isOps) return { error: c.json({ error: 'Only the owner and operations managers keep the compliance calendar' }, 403) };
    return { actor: actor! };
  };
  const all = async (): Promise<Item[]> => ((await deps.kv.getByPrefix<any>('compliance:')) || []).filter((x: any) => x?.id);
  const read = (body: any): Omit<Item, 'id' | 'history' | 'createdBy' | 'createdAt' | 'updatedAt'> | string => {
    const title = clip(body?.title, 80);
    if (title.length < 3) return 'Write what it is';
    if (!isDate(body?.dueDate)) return 'Pick the due date';
    const repeat = (Object.keys(MONTHS) as Repeat[]).includes(body?.repeat) ? body.repeat as Repeat : 'none';
    const kind = (KINDS as readonly string[]).includes(body?.kind) ? body.kind as Kind : 'other';
    const place = typeof body?.place === 'string' && /^(all|store:[\w-]+|production:[\w-]+)$/.test(body.place) ? body.place : 'all';
    const starter = STARTERS.some((s) => s.key === body?.starter) ? String(body.starter) : undefined;
    return { title, kind, place, dueDate: body.dueDate, repeat, handledBy: clip(body?.handledBy, 60) || undefined, notes: clip(body?.notes, 400) || undefined, ...(starter ? { starter } : {}) };
  };

  app.get(`${P}/compliance`, async (c: any) => {
    const { error } = await leadOf(c); if (error) return error;
    try {
      const items = await all();
      const today = todayIST();
      const taken = new Set(items.map((x) => x.starter).filter(Boolean));
      return c.json({
        today,
        items: items
          .map((x) => ({ ...x, daysLeft: x.dueDate ? daysBetween(today, x.dueDate) : null }))
          .sort((a, b) => (a.dueDate || '9999').localeCompare(b.dueDate || '9999') || a.title.localeCompare(b.title)),
        starters: STARTERS.filter((s) => !taken.has(s.key)),
      });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/compliance`, async (c: any) => {
    const { actor, error } = await leadOf(c); if (error) return error;
    try {
      const v = read(await c.req.json().catch(() => ({})));
      if (typeof v === 'string') return c.json({ error: v }, 400);
      const items = await all();
      if (items.length >= 150) return c.json({ error: 'That is the most the calendar keeps' }, 400);
      if (v.starter && items.some((x) => x.starter === v.starter)) return c.json({ error: 'That one is already in the calendar' }, 409);
      const now = new Date().toISOString();
      const item: Item = { ...v, id: newId(), history: [], createdBy: actor!.name, createdAt: now, updatedAt: now };
      await deps.kv.set(itemKey(item.id), item);
      return c.json({ item });
    } catch (err) { return fail(c, err); }
  });

  app.put(`${P}/compliance/:id`, async (c: any) => {
    const { error } = await leadOf(c); if (error) return error;
    try {
      const old: Item | null = await deps.kv.get(itemKey(c.req.param('id')));
      if (!old) return c.json({ error: 'That item was not found' }, 404);
      const v = read(await c.req.json().catch(() => ({})));
      if (typeof v === 'string') return c.json({ error: v }, 400);
      const item: Item = { ...old, ...v, starter: old.starter, updatedAt: new Date().toISOString() };
      await deps.kv.set(itemKey(item.id), item);
      return c.json({ item });
    } catch (err) { return fail(c, err); }
  });

  app.delete(`${P}/compliance/:id`, async (c: any) => {
    const { error } = await leadOf(c); if (error) return error;
    try {
      await deps.kv.del(itemKey(c.req.param('id')));
      return c.json({ ok: true });
    } catch (err) { return fail(c, err); }
  });

  // Done: kept in its history; a repeating one moves on from the day it was done.
  app.post(`${P}/compliance/:id/done`, async (c: any) => {
    const { actor, error } = await leadOf(c); if (error) return error;
    try {
      const old: Item | null = await deps.kv.get(itemKey(c.req.param('id')));
      if (!old) return c.json({ error: 'That item was not found' }, 404);
      const body = await c.req.json().catch(() => ({}));
      const date = isDate(body?.date) ? body.date : todayIST();
      if (date > todayIST()) return c.json({ error: 'The date it was done can\'t be in the future' }, 400);
      const photoPath = typeof body?.photoPath === 'string' && /^[\w./-]{5,200}$/.test(body.photoPath) ? body.photoPath : undefined;
      const done: Done = { date, by: actor!.name, note: clip(body?.note, 300) || undefined, ...(photoPath ? { photoPath } : {}), at: new Date().toISOString() };
      const months = MONTHS[old.repeat];
      const item: Item = { ...old, history: [done, ...(old.history || [])].slice(0, 40), dueDate: months ? addMonths(date, months) : null, updatedAt: done.at };
      await deps.kv.set(itemKey(item.id), item);
      return c.json({ item });
    } catch (err) { return fail(c, err); }
  });

  // Every morning (pg_cron, X-Cron-Secret): what is coming up or overdue, to the owner and
  // operations managers. Once per item, due date and stage.
  app.post(`${P}/send-compliance-reminders`, async (c: any) => {
    const secret = Deno.env.get('CRON_SYNC_SECRET');
    if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const today = todayIST();
      const due = (await all()).map((x) => ({ x, stage: reminderStage(x, today) })).filter((d) => d.stage !== null);
      if (!due.length || !deps.notifyUser) return c.json({ success: true, today, reminded: 0 });
      const people = (await deps.getAllByPrefix('unified-employee:')).filter((e: any) => e?.authUserId && e.status !== 'inactive' && e.status !== 'archived'
        && (e.role === 'cluster_head' || (e.role === 'manager' && !['store_incharge', 'production_incharge'].includes(e.designation))));
      let sent = 0;
      for (const { x, stage } of due) {
        const onceKey = `compliance-reminder:${x.id}:${x.dueDate}:${stage}`;
        if (await deps.kv.get(onceKey)) continue;
        const left = stage!;
        const overdue = left < 0;
        const title = overdue ? `Overdue: ${x.title}` : left === 0 ? `Due today: ${x.title}` : `${x.title}: due in ${left} day${left === 1 ? '' : 's'}`;
        const message = overdue
          ? `It was due on ${shortDate(x.dueDate!)} (${-left} days ago). Do it and mark it done in More > Compliance calendar.`
          : `Due on ${shortDate(x.dueDate!)}${x.handledBy ? ` · ${x.handledBy}` : ''}. Mark it done in More > Compliance calendar once it is.`;
        for (const p of people) await deps.notifyUser(p.authUserId, overdue ? 'compliance_overdue' : 'compliance_due', title, message, x.id, x.dueDate || undefined).catch(() => undefined);
        await deps.kv.set(onceKey, { at: new Date().toISOString() });
        sent++;
      }
      return c.json({ success: true, today, reminded: sent });
    } catch (err) { return fail(c, err); }
  });
}
