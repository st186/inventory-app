// Store cover (owner, 28 Oct 2026). Someone set up for it (kpi-settings:{id}.storeCover - today the
// operations incharge) works at the production house from 8 AM and goes to the store for the
// evening (5-10 PM) on a store-cover day: a store staff member on approved leave, a Saturday or
// Sunday, or a festival in the store calendar (store-calendar:{date}). They and the store's
// incharge are reminded that morning, they get a "leave for the store" nudge in the afternoon, and
// they check in and out at the store separately from their production shift.
// Registered from kpi.ts.
//
//   punch-cover:{employeeId}:{date}     the separate store check-in / check-out
//   store-cover-sent:{date}:{employeeId} reminders already sent that day
import {
  DEFAULT_RADIUS_M, atWorkplace, coverReasonsOn, fmt12, haversineM, istDate, parseHHMM,
  type StoreCover,
} from './kpiCore.ts';
import { P, actorOf, loadConfig, loadPlaces, profileOf, type KpiDeps } from './attendance.ts';

const istMinutesNow = () => {
  const d = new Date(Date.now() + 330 * 60000);
  return d.getUTCHours() * 60 + d.getUTCMinutes();
};
const isStoreStaff = (e: any, storeId: string) => e?.status !== 'inactive' && e?.designation !== 'rider'
  && (String(e?.storeId || '') === storeId || (e?.assignedStoreIds || []).map(String).includes(storeId))
  && (/^store_/.test(String(e?.designation || '')) || e?.department === 'store_operations');

type CoverCtx = { employees: any[]; leaves: any[]; calendar: Map<string, any>; stores: Map<string, any>; places: any };

export async function loadCoverContext(deps: KpiDeps): Promise<CoverCtx> {
  const [employees, leaves, calendar, stores, places] = await Promise.all([
    deps.kv.getByPrefix<any>('unified-employee:'),
    deps.kv.getByPrefix<any>('leave:'),
    deps.kv.getByPrefix<any>('store-calendar:'),
    deps.kv.getByPrefix<any>('store:'),
    loadPlaces(deps.kv),
  ]);
  return {
    employees: (employees || []).filter((e: any) => e?.employeeId),
    leaves: leaves || [],
    calendar: new Map((calendar || []).filter((e: any) => e?.date).map((e: any) => [String(e.date), e])),
    stores: new Map((stores || []).filter((s: any) => s?.id).map((s: any) => [String(s.id), s])),
    places,
  };
}

// Today's (or a date's) cover for one person: null when they have no store cover set up.
export async function coverFor(deps: KpiDeps, ctx: CoverCtx, emp: any, date: string) {
  const saved = await deps.kv.get<any>(`kpi-settings:${emp.employeeId}`);
  const cover: StoreCover | null = profileOf(emp, ctx.places, saved).settings.storeCover;
  if (!cover) return null;
  const storeStaff = ctx.employees.filter((e) => isStoreStaff(e, cover.storeId)).map((e) => ({ id: String(e.employeeId), name: String(e.name || e.employeeId) }));
  const reasons = coverReasonsOn(date, cover, { coverId: String(emp.employeeId), storeStaff, leaves: ctx.leaves, calendar: ctx.calendar });
  return { cover, reasons, storeName: String(ctx.stores.get(cover.storeId)?.name || 'the store') };
}

export function registerStoreCoverRoutes(app: any, deps: KpiDeps) {
  const fail = (c: any, err: any) => {
    console.log('[store-cover]', err?.message || 'error');
    return c.json({ error: 'Something went wrong - try again' }, 500);
  };
  const view = (date: string, info: NonNullable<Awaited<ReturnType<typeof coverFor>>>, rec: any) => ({
    date, cover: info.reasons.length > 0, reasons: info.reasons, storeId: info.cover.storeId, storeName: info.storeName,
    start: info.cover.start, end: info.cover.end, productionEnd: info.cover.productionEnd, punch: rec || null,
  });

  // The signed-in person's store cover for today (cover: false on an ordinary day).
  app.get(`${P}/shift/cover-today`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.employeeId || !a.emp) return c.json({ setUp: false });
    try {
      const date = istDate(Date.now());
      const info = await coverFor(deps, await loadCoverContext(deps), a.emp, date);
      if (!info) return c.json({ setUp: false });
      const rec = await deps.kv.get<any>(`punch-cover:${a.employeeId}:${date}`);
      return c.json({ setUp: true, ...view(date, info, rec) });
    } catch (err) { return fail(c, err); }
  });

  // The separate check-in / check-out at the store, checked against the store's map pin.
  app.post(`${P}/shift/cover-punch`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.employeeId || !a.emp) return c.json({ error: 'Only staff logins can check in' }, 400);
    try {
      const body = await c.req.json().catch(() => ({}));
      const action = body.action;
      if (action !== 'in' && action !== 'out') return c.json({ error: 'Choose check in or check out' }, 400);
      const date = istDate(Date.now());
      const ctx = await loadCoverContext(deps);
      const info = await coverFor(deps, ctx, a.emp, date);
      if (!info) return c.json({ error: 'Store cover is not set up for you' }, 400);
      const key = `punch-cover:${a.employeeId}:${date}`;
      const rec = (await deps.kv.get<any>(key)) || { employeeId: a.employeeId, date, storeId: info.cover.storeId, reasons: info.reasons, in: null, out: null };
      if (action === 'in' && rec.in) return c.json({ error: 'You have already checked in at the store today', punch: rec }, 409);
      const lat = Number(body.lat), lng = Number(body.lng);
      const accuracyM = Number.isFinite(Number(body.accuracyM)) ? Math.round(Number(body.accuracyM)) : undefined;
      const ev: any = { at: new Date().toISOString(), source: 'manual' };
      const pin = ctx.places.pins.find((p: any) => p.kind === 'store' && p.id === info.cover.storeId);
      if (body.gpsError || !Number.isFinite(lat) || !Number.isFinite(lng)) ev.noGps = true;
      else {
        ev.lat = Math.round(lat * 1e5) / 1e5; ev.lng = Math.round(lng * 1e5) / 1e5; ev.accuracyM = accuracyM;
        if (pin) {
          const cfg = await loadConfig(deps.kv);
          const d = haversineM(lat, lng, pin.lat, pin.lng);
          ev.distanceM = Math.round(d);
          ev.outside = !atWorkplace(d, accuracyM, cfg.radiusM || DEFAULT_RADIUS_M);
        }
      }
      if (action === 'in') rec.in = ev; else rec.out = ev;
      rec.reasons = info.reasons;
      rec.updatedAt = ev.at;
      await deps.kv.set(key, rec);
      return c.json({ punch: rec });
    } catch (err) { return fail(c, err); }
  });

  // Who is covering a store today: the store's incharge sees their store, the owner and
  // operations managers every store.
  app.get(`${P}/shift/cover-team`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    const storeIds = new Set<string>([a.emp?.storeId, ...(a.emp?.assignedStoreIds || [])].filter(Boolean).map(String));
    const all = a.isOwner || a.isOps;
    if (!all && a.designation !== 'store_incharge') return c.json({ covers: [] });
    try {
      const date = istDate(Date.now());
      const ctx = await loadCoverContext(deps);
      const covers: any[] = [];
      for (const e of ctx.employees) {
        if (e.status === 'inactive' || String(e.employeeId) === a.employeeId) continue;
        const info = await coverFor(deps, ctx, e, date);
        if (!info || !info.reasons.length || (!all && !storeIds.has(info.cover.storeId))) continue;
        const rec = await deps.kv.get<any>(`punch-cover:${e.employeeId}:${date}`);
        covers.push({ employeeId: String(e.employeeId), name: String(e.name || e.employeeId), ...view(date, info, rec) });
      }
      return c.json({ covers });
    } catch (err) { return fail(c, err); }
  });

  // Every 30 minutes (pg_cron): in the morning, tell the cover person and the store's incharge(s)
  // that today is a store-cover day and why; from 4:15 PM, nudge the cover person to leave for the
  // store if they haven't checked in there. Once each per person per day.
  app.post(`${P}/cron/store-cover-reminders`, async (c: any) => {
    const secret = Deno.env.get('CRON_SYNC_SECRET');
    if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
    if (!deps.notifyUser) return c.json({ success: true, sent: 0 });
    try {
      const date = istDate(Date.now());
      const now = istMinutesNow();
      const ctx = await loadCoverContext(deps);
      let sent = 0;
      for (const e of ctx.employees) {
        if (e.status === 'inactive') continue;
        const info = await coverFor(deps, ctx, e, date);
        if (!info || !info.reasons.length) continue;
        const sentKey = `store-cover-sent:${date}:${e.employeeId}`;
        const done = (await deps.kv.get<any>(sentKey)) || {};
        const why = info.reasons.join(', ');
        const window = `${fmt12(parseHHMM(info.cover.start) as number)}-${fmt12(parseHHMM(info.cover.end) as number)}`;
        if (!done.morning && now >= 7 * 60) {
          if (e.authUserId) {
            await deps.notifyUser(e.authUserId, 'store_cover', `Store cover today, ${window}`,
              `${why}. Work at the production house from 8 AM, leave by ${fmt12(parseHHMM(info.cover.productionEnd) as number)}, and check in at ${info.storeName} when you reach (Home > Store cover).`, undefined, date).catch(() => undefined);
            sent++;
          }
          for (const inc of ctx.employees.filter((x) => x.designation === 'store_incharge' && x.status !== 'inactive' && x.authUserId && isStoreStaff(x, info.cover.storeId))) {
            await deps.notifyUser(inc.authUserId, 'store_cover', `${e.name || 'Store cover'} covers the store today, ${window}`, `${why}.`, undefined, date).catch(() => undefined);
            sent++;
          }
          done.morning = new Date().toISOString();
        }
        if (!done.afternoon && now >= 16 * 60 + 15 && now < parseHHMM(info.cover.end)!) {
          const rec = await deps.kv.get<any>(`punch-cover:${e.employeeId}:${date}`);
          if (!rec?.in && e.authUserId) {
            await deps.notifyUser(e.authUserId, 'store_cover', `Leave for ${info.storeName} now`,
              `Store cover ${window} (${why}). Check in at the store when you reach.`, undefined, date).catch(() => undefined);
            sent++;
          }
          done.afternoon = new Date().toISOString();
        }
        await deps.kv.set(sentKey, done);
      }
      return c.json({ success: true, sent });
    } catch (err) { return fail(c, err); }
  });
}
