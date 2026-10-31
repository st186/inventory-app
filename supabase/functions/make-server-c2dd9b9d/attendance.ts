// Shift clock-in / clock-out (owner, 27 Oct 2026). Registered through kpi.ts.
//
// One record per person and shift day: `punch:{employeeId}:{date}` =
//   { in, out, outsideWorkplace, pending: { arrival, exit }, flags }
// Two ways in:
//  - Automatic (Android app): while the shift window is open (an hour either side of the shift)
//    the phone watches its location on the phone itself and only sends the moment it arrived at
//    or left the workplace (a "suggestion"). The person - or their manager, the same day -
//    confirms it and the ARRIVAL / EXIT time is what counts (source 'geofence'). The location
//    trail itself never leaves the phone. With consent version 2 (owner, 31 Oct 2026) the phone
//    also sends, between check-in and check-out, stretches of "at work" / "stepped out (at most
//    this far)" - `presence:{employeeId}:{date}`, presenceRules.ts - for the owner's kitchen camera
//    check of long absences; still no positions.
//  - Manual Start shift / End shift buttons (web, or as a fallback): the time of the tap counts;
//    verified only if GPS puts the person within the radius at that moment. GPS failing never
//    blocks a punch - it is just saved as not verified.
// Odd cases (confirmed hours later, phone clock off, mock location) are flagged for the owner
// rather than blocked. Riders have no fixed workplace, so they are exempt from the geofence.

import {
  DEFAULT_RADIUS_M, addDays, atWorkplace, eventPinsFor, istDate, nearestPin, resolveSettings, roleGroupOf, shiftWindow,
  suspicionFlags, workplaceKindOf, workplacePins, hoursBetween, isWorkingDay,
  type KpiSettings, type Pin, type PunchEvent, type PunchRecord, type PunchSuggestion, type RoleGroup, type WorkplaceKind,
} from './kpiCore.ts';
import { timesheetFromPunch } from './punchTimesheet.ts';
import { cleanSpans, mergeSpans, type PresenceDay } from './presenceRules.ts';

export type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  del: (key: string) => Promise<any>;
  getByPrefix: <T = any>(prefix: string) => Promise<T[]>;
  mget: <T = any>(keys: string[]) => Promise<T[]>;
};
export type KpiDeps = {
  kv: Kv;
  verifyUser: (authHeader: any) => Promise<any>;
  getAllByPrefix: (prefix: string) => Promise<any[]>; // paginated (plain getByPrefix stops at 1000 rows)
  // In-app + push notification to one login (index.ts notifyUser).
  notifyUser?: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<any>;
  // A timesheet filled from the punches that waits for approval: tell the approver (index.ts).
  timesheetPending?: (sheet: any) => Promise<any>;
};

export const P = '/make-server-c2dd9b9d';
// 2 (31 Oct 2026): "at work / stepped out" during the shift too. Version 1 still runs automatic
// check-in; the phone sends presence only for 2, after the person read and agreed to the new note.
const CONSENT_VERSION = 2;
const PRESENCE_CONSENT = 2;

export type Actor = {
  userId: string;
  employeeId: string | null;
  emp: any;
  role: string;
  designation: string | null;
  name: string;
  isOwner: boolean;
  isOps: boolean; // operations manager (a manager who isn't a store or production incharge)
};

export async function actorOf(deps: KpiDeps, c: any): Promise<{ actor?: Actor; error?: any }> {
  const auth = await deps.verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
  const meta = auth.user.user_metadata || {};
  const employeeId = meta.employeeId ? String(meta.employeeId) : null;
  const emp = employeeId ? await deps.kv.get<any>(`unified-employee:${employeeId}`) : null;
  const role = meta.role;
  const designation = emp?.designation || meta.designation || null;
  return {
    actor: {
      userId: auth.user.id, employeeId, emp, role, designation,
      name: emp?.name || meta.name || 'Owner',
      isOwner: role === 'cluster_head',
      isOps: role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge',
    },
  };
}

export async function loadConfig(kv: Kv) {
  const c = await kv.get<any>('kpi-config');
  return {
    radiusM: Number(c?.radiusM) > 0 ? Number(c.radiusM) : DEFAULT_RADIUS_M,
    showMoneyToStaff: !!c?.showMoneyToStaff,
    punchSince: (c?.punchSince as string) || null, // first day anyone used the shift clock
    raw: c || {},
  };
}

// events: event stalls (events.ts) - an assigned person's pins include the stall during its days.
export type Places = { stores: Set<string>; houses: Set<string>; pins: Pin[]; storeHouse: Map<string, string | null>; events?: any[]; today?: string };

export async function loadPlaces(kv: Kv): Promise<Places> {
  const [stores, houses, raw, events] = await Promise.all([
    kv.getByPrefix<any>('store:'), kv.getByPrefix<any>('production_house_'), kv.getByPrefix<any>('rider-place:'), kv.getByPrefix<any>('event:'),
  ]);
  const names = new Map<string, string>();
  for (const s of stores || []) if (s?.id) names.set(`store:${s.id}`, s.name);
  for (const h of houses || []) if (h?.id) names.set(`production:${h.id}`, h.name);
  const pins: Pin[] = (raw || [])
    .filter((p: any) => (p?.kind === 'store' || p?.kind === 'production') && p.id && Number.isFinite(p.latitude) && Number.isFinite(p.longitude))
    .map((p: any) => ({ kind: p.kind, id: String(p.id), name: names.get(`${p.kind}:${p.id}`), lat: p.latitude, lng: p.longitude }));
  return {
    stores: new Set((stores || []).filter((s: any) => s?.id).map((s: any) => String(s.id))),
    houses: new Set((houses || []).filter((h: any) => h?.id).map((h: any) => String(h.id))),
    pins,
    storeHouse: new Map((stores || []).filter((s: any) => s?.id).map((s: any) => [String(s.id), s.productionHouseId || null])),
    events: (events || []).filter((e: any) => e?.id && String(e.id).startsWith('EVENT-')),
    today: istDate(Date.now()),
  };
}

export type Profile = { kind: WorkplaceKind; group: RoleGroup; settings: KpiSettings; pins: Pin[]; exempt: boolean };

export function profileOf(emp: any, places: Places, saved: any): Profile {
  const kind = workplaceKindOf(emp, places);
  const group = roleGroupOf(emp, kind);
  return {
    kind, group,
    settings: resolveSettings(saved, String(emp.employeeId), kind, group),
    pins: [...workplacePins(emp, kind, places.pins), ...eventPinsFor(emp, places.events || [], places.today || istDate(Date.now()))],
    exempt: group === 'rider',
  };
}

// Owner and operations managers may confirm anyone's check-in; others only for people who report
// to them (managerId / inchargeId on the employee record).
export function canManage(actor: Actor, target: any) {
  if (!target || (actor.employeeId && String(target.employeeId) === actor.employeeId)) return false;
  if (actor.isOwner || actor.isOps) return true;
  return !!actor.employeeId && (target.managerId === actor.employeeId || target.inchargeId === actor.employeeId);
}

// The shift day a moment belongs to: before yesterday's window has closed (a shift past
// midnight), it is still yesterday's shift.
export function shiftDateFor(nowMs: number, settings: KpiSettings) {
  const today = istDate(nowMs);
  const y = addDays(today, -1);
  return nowMs <= shiftWindow(y, settings).endMs ? y : today;
}

const validLatLng = (lat: any, lng: any) => Number.isFinite(lat) && Number.isFinite(lng) && Math.abs(lat) <= 90 && Math.abs(lng) <= 180 && !(lat === 0 && lng === 0);
const round5 = (n: number) => Math.round(n * 1e5) / 1e5;
const emptyRecord = (employeeId: string, date: string): PunchRecord => ({ employeeId, date, in: null, out: null, outsideWorkplace: false, pending: {} });

function finish(rec: PunchRecord): PunchRecord {
  rec.outsideWorkplace = !!(rec.in?.outside || rec.out?.outside);
  rec.flags = [...new Set([...(rec.in?.flags || []), ...(rec.out?.flags || [])])];
  rec.updatedAt = new Date().toISOString();
  return rec;
}

// Where a GPS fix is relative to the workplace.
function placeCheck(lat: number, lng: number, accuracyM: number | undefined, profile: Profile, radiusM: number) {
  const near = nearestPin(lat, lng, profile.pins);
  if (!near) return { distanceM: undefined, verified: false, outside: false, noPin: true } as const;
  // An event stall's pin carries its own radius (set on the event).
  const ok = atWorkplace(near.distanceM, accuracyM, near.pin.radiusM || radiusM);
  return { distanceM: Math.round(near.distanceM), verified: ok, outside: !ok, placeKind: near.pin.kind, placeId: near.pin.id, noPin: false } as const;
}

// Bengali digits for the check-in prompt.
const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (s: string) => s.replace(/\d/g, (d) => BN_DIGITS[Number(d)]);
function istClock(ms: number) {
  const d = new Date(ms + 330 * 60000);
  const h = d.getUTCHours();
  const m = String(d.getUTCMinutes()).padStart(2, '0');
  return { en: `${h % 12 || 12}:${m} ${h >= 12 ? 'PM' : 'AM'}`, bn: bn(`${h % 12 || 12}:${m}`) };
}

export function suggestionMessage(kind: 'arrival' | 'exit', atMs: number, placeKind?: string) {
  const t = istClock(atMs);
  if (kind === 'exit') return { title: 'Check out?', message: `You left at ${t.en} - check out? · ${t.bn}-এ বেরিয়েছেন - চেক আউট করবেন?` };
  const place = placeKind === 'production' ? { en: 'production house', bn: 'প্রোডাকশন হাউসে' }
    : placeKind === 'event' ? { en: 'event stall', bn: 'ইভেন্টের স্টলে' } : { en: 'store', bn: 'দোকানে' };
  return { title: 'Check in?', message: `You reached the ${place.en} at ${t.en} - check in? · ${place.bn} পৌঁছেছেন ${t.bn}-এ - চেক ইন করবেন?` };
}

// Turns a phone-reported moment into server time. The phone sends both when it saw the event and
// its own clock now, so the age is right even if the phone clock is off.
function serverTimeOf(detected: any, deviceNow: any, serverNow: number) {
  const det = typeof detected === 'number' ? detected : Date.parse(String(detected || ''));
  const dev = Number(deviceNow);
  if (!Number.isFinite(det)) return null;
  if (!Number.isFinite(dev)) return { atMs: Math.min(det, serverNow), skewMs: undefined };
  const age = Math.max(0, dev - det);
  return { atMs: serverNow - age, skewMs: dev - serverNow };
}

function buildSuggestion(body: any, profile: Profile, radiusM: number, serverNow: number): PunchSuggestion | { error: string } {
  const lat = Number(body.lat);
  const lng = Number(body.lng);
  if (!validLatLng(lat, lng)) return { error: 'Location is missing' };
  const t = serverTimeOf(body.detectedAt, body.deviceNow, serverNow);
  if (!t) return { error: 'Time is missing' };
  const accuracyM = Number.isFinite(Number(body.accuracyM)) ? Math.round(Number(body.accuracyM)) : undefined;
  const where = placeCheck(lat, lng, accuracyM, profile, radiusM);
  return {
    detectedAt: new Date(t.atMs).toISOString(), lat: round5(lat), lng: round5(lng), accuracyM,
    distanceM: where.distanceM, placeKind: where.noPin ? undefined : where.placeKind, placeId: where.noPin ? undefined : where.placeId,
    simulated: !!body.simulated, clockSkewMs: t.skewMs, receivedAt: new Date(serverNow).toISOString(),
  };
}

function eventFromSuggestion(s: PunchSuggestion, profile: Profile, radiusM: number, confirmedBy: string, now: number): PunchEvent {
  const where = placeCheck(s.lat, s.lng, s.accuracyM, profile, radiusM);
  return {
    at: s.detectedAt, source: 'geofence',
    verified: !profile.exempt && where.verified && !s.simulated,
    outside: profile.exempt ? false : where.outside,
    lat: s.lat, lng: s.lng, accuracyM: s.accuracyM, distanceM: where.distanceM,
    placeKind: where.noPin ? undefined : where.placeKind, placeId: where.noPin ? undefined : where.placeId,
    detectedAt: s.detectedAt, confirmedAt: new Date(now).toISOString(), confirmedBy,
    ...(profile.exempt ? { exempt: true } : {}),
    flags: suspicionFlags({ detectedAtMs: Date.parse(s.detectedAt), confirmedAtMs: now, clockSkewMs: s.clockSkewMs, simulated: s.simulated }),
  };
}

export async function loadProfileFor(deps: KpiDeps, emp: any, places?: Places): Promise<Profile> {
  const [pl, saved] = await Promise.all([places ? Promise.resolve(places) : loadPlaces(deps.kv), deps.kv.get<any>(`kpi-settings:${emp.employeeId}`)]);
  return profileOf(emp, pl, saved);
}

// The first day anyone used the shift clock: punch KPIs only count from then on.
async function notePunchStart(kv: Kv, date: string) {
  const cfg = (await kv.get<any>('kpi-config')) || {};
  if (cfg.punchSince && cfg.punchSince <= date) return;
  await kv.set('kpi-config', { ...cfg, punchSince: date });
}

// The day's timesheet from the check-in and check-out (punchTimesheet.ts). Never fails the punch.
export async function syncTimesheet(deps: KpiDeps, rec: PunchRecord | null) {
  if (!rec?.in || !rec?.out) return;
  try {
    const key = `timesheet:${rec.employeeId}:${rec.date}`;
    const sheet = timesheetFromPunch(rec, await deps.kv.get<any>(key), new Date().toISOString());
    if (!sheet) return;
    const saved = { ...sheet, id: sheet.id || `${Date.now()}-${Math.random().toString(36).slice(2, 8)}` };
    await deps.kv.set(key, saved);
    if (saved.status === 'pending' && deps.timesheetPending) await deps.timesheetPending(saved).catch(() => undefined);
  } catch (err: any) {
    console.error('[shift] timesheet', err?.message || 'error');
  }
}

function publicPunch(rec: PunchRecord | null) {
  if (!rec) return null;
  return { ...rec, hours: hoursBetween(rec.in?.at, rec.out?.at) };
}

export function registerAttendanceRoutes(app: any, deps: KpiDeps) {
  const fail = (c: any, err: any) => {
    console.error('[shift]', err?.message || 'error'); // no names or ids in logs
    return c.json({ error: 'Something went wrong - try again' }, 500);
  };
  const self = async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r;
    const a = r.actor!;
    if (!a.employeeId || !a.emp || a.isOwner || a.role === 'audit') return { error: c.json({ error: 'The shift clock is for staff logins' }, 400) };
    return r;
  };

  // Today's shift: record, settings, window, workplace pins (for the phone's own geofence).
  app.get(`${P}/shift/today`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!a.employeeId || !a.emp || a.isOwner || a.role === 'audit') return c.json({ required: false });
    try {
      const [cfg, profile, consent] = await Promise.all([loadConfig(deps.kv), loadProfileFor(deps, a.emp), deps.kv.get<any>(`shift-consent:${a.employeeId}`)]);
      const now = Date.now();
      const date = shiftDateFor(now, profile.settings);
      const rec = await deps.kv.get<PunchRecord>(`punch:${a.employeeId}:${date}`);
      const w = shiftWindow(date, profile.settings);
      return c.json({
        required: true,
        employeeId: a.employeeId,
        date,
        serverNow: new Date(now).toISOString(),
        exempt: profile.exempt,
        workplace: profile.kind,
        punch: publicPunch(rec),
        settings: { shiftStart: profile.settings.shiftStart, shiftEnd: profile.settings.shiftEnd, graceMin: profile.settings.graceMin, weeklyOff: profile.settings.weeklyOff },
        workingDay: isWorkingDay(date, profile.settings),
        window: { startAt: new Date(w.startMs).toISOString(), endAt: new Date(w.endMs).toISOString(), shiftStartAt: new Date(w.shiftStartMs).toISOString(), shiftEndAt: new Date(w.shiftEndMs).toISOString() },
        pins: profile.exempt ? [] : profile.pins.map((p) => ({ kind: p.kind, id: p.id, name: p.name || null, lat: p.lat, lng: p.lng, ...(p.radiusM ? { radiusM: p.radiusM } : {}) })),
        radiusM: cfg.radiusM,
        consent: consent?.version >= 1 ? { accepted: !!consent.accepted, at: consent.at, version: consent.version } : null,
        presence: !!consent?.accepted && consent.version >= PRESENCE_CONSENT,
      });
    } catch (err) { return fail(c, err); }
  });

  // First-time consent for automatic check-in (kept as a record of what the person agreed to).
  app.post(`${P}/shift/consent`, async (c: any) => {
    const r = await self(c);
    if (r.error) return r.error;
    const body = await c.req.json().catch(() => ({}));
    const rec = { accepted: !!body.accepted, version: CONSENT_VERSION, at: new Date().toISOString() };
    await deps.kv.set(`shift-consent:${r.actor!.employeeId}`, rec);
    return c.json({ consent: rec });
  });

  // At work / stepped out stretches from the phone (see the top of this file). Ignored without
  // consent version 2; only the day's own record, only stretches (cleanSpans).
  app.post(`${P}/shift/presence`, async (c: any) => {
    const r = await self(c);
    if (r.error) return r.error;
    const employeeId = r.actor!.employeeId;
    const consent = await deps.kv.get<any>(`shift-consent:${employeeId}`);
    if (!consent?.accepted || !(consent.version >= PRESENCE_CONSENT)) return c.json({ ignored: true });
    const body = await c.req.json().catch(() => ({}));
    const date = String(body?.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return c.json({ error: 'Which day?' }, 400);
    const spans = cleanSpans(body?.spans, Date.now());
    if (!spans.length) return c.json({ ok: true, spans: 0 });
    const key = `presence:${employeeId}:${date}`;
    const day = (await deps.kv.get<PresenceDay>(key)) || { employeeId, date, spans: [] };
    const next: PresenceDay = { employeeId, date, spans: mergeSpans(day.spans || [], spans) };
    await deps.kv.set(key, next);
    return c.json({ ok: true, spans: next.spans.length });
  });

  // Manual Start shift / End shift. One check-in a day; a later End shift replaces the earlier one.
  app.post(`${P}/shift/punch`, async (c: any) => {
    const r = await self(c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const body = await c.req.json().catch(() => ({}));
      const action = body.action;
      if (action !== 'in' && action !== 'out') return c.json({ error: 'Choose start or end of shift' }, 400);
      const [cfg, profile] = await Promise.all([loadConfig(deps.kv), loadProfileFor(deps, a.emp)]);
      const now = Date.now();
      const date = shiftDateFor(now, profile.settings);
      const key = `punch:${a.employeeId}:${date}`;
      const rec: PunchRecord = (await deps.kv.get<PunchRecord>(key)) || emptyRecord(a.employeeId!, date);
      if (action === 'in' && rec.in) return c.json({ error: 'You have already started today\'s shift', punch: publicPunch(rec) }, 409);

      const lat = Number(body.lat);
      const lng = Number(body.lng);
      const hasGps = !body.gpsError && validLatLng(lat, lng);
      const accuracyM = Number.isFinite(Number(body.accuracyM)) ? Math.round(Number(body.accuracyM)) : undefined;
      const skew = Number.isFinite(Number(body.deviceNow)) ? Number(body.deviceNow) - now : undefined;
      let ev: PunchEvent = { at: new Date(now).toISOString(), source: 'manual', verified: false, flags: suspicionFlags({ clockSkewMs: skew }) };
      if (!hasGps) ev.noGps = true;
      else {
        ev = { ...ev, lat: round5(lat), lng: round5(lng), accuracyM };
        if (profile.exempt) ev.exempt = true;
        else {
          const where = placeCheck(lat, lng, accuracyM, profile, cfg.radiusM);
          ev = { ...ev, verified: where.verified, outside: where.outside, distanceM: where.distanceM, placeKind: where.noPin ? undefined : where.placeKind, placeId: where.noPin ? undefined : where.placeId };
        }
      }
      if (action === 'in') { rec.in = ev; if (rec.pending) rec.pending.arrival = null; }
      else { rec.out = ev; if (rec.pending) rec.pending.exit = null; }
      await deps.kv.set(key, finish(rec));
      await notePunchStart(deps.kv, date);
      await syncTimesheet(deps, rec);
      return c.json({ punch: publicPunch(rec) });
    } catch (err) { return fail(c, err); }
  });

  // The phone saw the person arrive at / leave the workplace. Saved as a suggestion to confirm,
  // with a notification so they can confirm from the lock screen too.
  app.post(`${P}/shift/suggestion`, async (c: any) => {
    const r = await self(c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const body = await c.req.json().catch(() => ({}));
      const kind = body.kind;
      if (kind !== 'arrival' && kind !== 'exit') return c.json({ error: 'Unknown event' }, 400);
      const [cfg, profile] = await Promise.all([loadConfig(deps.kv), loadProfileFor(deps, a.emp)]);
      if (profile.exempt) return c.json({ ignored: true });
      const now = Date.now();
      const s = buildSuggestion(body, profile, cfg.radiusM, now);
      if ('error' in s) return c.json({ error: s.error }, 400);
      const date = shiftDateFor(Date.parse(s.detectedAt), profile.settings);
      const w = shiftWindow(date, profile.settings);
      const t = Date.parse(s.detectedAt);
      if (t < w.startMs - 15 * 60000 || t > w.endMs + 15 * 60000) return c.json({ error: 'That is outside your shift window' }, 400);
      const key = `punch:${a.employeeId}:${date}`;
      const rec: PunchRecord = (await deps.kv.get<PunchRecord>(key)) || emptyRecord(a.employeeId!, date);
      if (kind === 'arrival' && rec.in) return c.json({ ignored: true, punch: publicPunch(rec) });
      const prev = rec.pending?.[kind];
      rec.pending = { ...(rec.pending || {}), [kind]: s };
      await deps.kv.set(key, finish(rec));
      // One reminder per event; a fresh exit (they came back and left again) gets a new one.
      const notify = !prev || Math.abs(Date.parse(prev.detectedAt) - t) > 20 * 60000;
      if (notify && deps.notifyUser) {
        const msg = suggestionMessage(kind, t, s.placeKind);
        await deps.notifyUser(a.userId, 'shift_checkin', msg.title, msg.message, undefined, date).catch(() => {});
      }
      return c.json({ punch: publicPunch(rec) });
    } catch (err) { return fail(c, err); }
  });

  // Confirm a detected arrival / exit - the person themself, or their manager the same day.
  // The phone may send the event along in case it never reached the server (no signal).
  app.post(`${P}/shift/confirm`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    try {
      const body = await c.req.json().catch(() => ({}));
      const kind = body.kind;
      if (kind !== 'arrival' && kind !== 'exit') return c.json({ error: 'Unknown event' }, 400);
      const forId = body.employeeId ? String(body.employeeId) : a.employeeId;
      if (!forId) return c.json({ error: 'Whose check-in?' }, 400);
      const target = forId === a.employeeId ? a.emp : await deps.kv.get<any>(`unified-employee:${forId}`);
      if (!target) return c.json({ error: 'Person not found' }, 404);
      const bySelf = forId === a.employeeId;
      if (!bySelf && !canManage(a, target)) return c.json({ error: 'You can only confirm check-ins for your own team' }, 403);
      const [cfg, profile] = await Promise.all([loadConfig(deps.kv), loadProfileFor(deps, target)]);
      const now = Date.now();
      const today = shiftDateFor(now, profile.settings);
      const date = isDateStr(body.date) ? body.date : today;
      // Same day only, except the owner who can sort out older days.
      if (date !== today && !a.isOwner) return c.json({ error: 'Check-ins can only be confirmed on the same day' }, 400);
      const key = `punch:${forId}:${date}`;
      const rec: PunchRecord = (await deps.kv.get<PunchRecord>(key)) || emptyRecord(forId, date);
      let s = rec.pending?.[kind] || null;
      if (!s && bySelf && body.event) {
        const built = buildSuggestion(body.event, profile, cfg.radiusM, now);
        if ('error' in built) return c.json({ error: built.error }, 400);
        if (shiftDateFor(Date.parse(built.detectedAt), profile.settings) !== date) return c.json({ error: 'That time belongs to another day' }, 400);
        s = built;
      }
      if (!s) return c.json({ error: 'Nothing to confirm' }, 404);
      if (kind === 'arrival' && rec.in) return c.json({ error: 'Already checked in', punch: publicPunch(rec) }, 409);
      const ev = eventFromSuggestion(s, profile, cfg.radiusM, bySelf ? forId : (a.employeeId || 'owner'), now);
      if (kind === 'arrival') rec.in = ev; else rec.out = ev;
      rec.pending = { ...(rec.pending || {}), [kind]: null };
      await deps.kv.set(key, finish(rec));
      await notePunchStart(deps.kv, date);
      await syncTimesheet(deps, rec);
      return c.json({ punch: publicPunch(rec) });
    } catch (err) { return fail(c, err); }
  });

  // "That wasn't me arriving" - drop a detected arrival / exit.
  app.post(`${P}/shift/dismiss`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    const body = await c.req.json().catch(() => ({}));
    const kind = body.kind;
    if (kind !== 'arrival' && kind !== 'exit') return c.json({ error: 'Unknown event' }, 400);
    const forId = body.employeeId ? String(body.employeeId) : a.employeeId;
    const target = forId === a.employeeId ? a.emp : forId ? await deps.kv.get<any>(`unified-employee:${forId}`) : null;
    if (!forId || !target || (forId !== a.employeeId && !canManage(a, target))) return c.json({ error: 'Not allowed' }, 403);
    const profile = await loadProfileFor(deps, target);
    const date = isDateStr(body.date) ? body.date : shiftDateFor(Date.now(), profile.settings);
    const key = `punch:${forId}:${date}`;
    const rec = await deps.kv.get<PunchRecord>(key);
    if (!rec?.pending?.[kind]) return c.json({ punch: publicPunch(rec) });
    rec.pending = { ...rec.pending, [kind]: null };
    await deps.kv.set(key, finish(rec));
    return c.json({ punch: publicPunch(rec) });
  });

  // Managers: today's check-ins waiting for confirmation in their team.
  app.get(`${P}/shift/team-pending`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    const a = r.actor!;
    if (!(a.isOwner || a.role === 'manager' || a.designation === 'store_incharge' || a.designation === 'production_incharge')) return c.json({ pending: [] });
    try {
      const employees = (await deps.kv.getByPrefix<any>('unified-employee:'))
        .filter((e: any) => e?.employeeId && e.status !== 'inactive' && e.role !== 'cluster_head' && canManage(a, e));
      if (!employees.length) return c.json({ pending: [] });
      // Each person's own shift day (a shift past midnight still belongs to yesterday).
      const [places, saved] = await Promise.all([loadPlaces(deps.kv), deps.kv.mget<any>(employees.map((e: any) => `kpi-settings:${e.employeeId}`))]);
      const savedBy = new Map((saved || []).filter((s: any) => s?.employeeId).map((s: any) => [String(s.employeeId), s]));
      const now = Date.now();
      const keys = employees.map((e: any) => `punch:${e.employeeId}:${shiftDateFor(now, profileOf(e, places, savedBy.get(String(e.employeeId))).settings)}`);
      const rows = await deps.kv.mget<PunchRecord>(keys);
      const names = new Map(employees.map((e: any) => [String(e.employeeId), e.name]));
      const pending = (rows || [])
        .filter((p) => p && (p.pending?.arrival || p.pending?.exit))
        .map((p) => ({
          employeeId: p.employeeId, name: names.get(p.employeeId) || p.employeeId, date: p.date,
          arrival: p.pending?.arrival && !p.in ? { detectedAt: p.pending.arrival.detectedAt, distanceM: p.pending.arrival.distanceM ?? null, simulated: !!p.pending.arrival.simulated } : null,
          exit: p.pending?.exit ? { detectedAt: p.pending.exit.detectedAt, distanceM: p.pending.exit.distanceM ?? null, simulated: !!p.pending.exit.simulated } : null,
        }))
        .filter((p) => p.arrival || p.exit);
      return c.json({ pending });
    } catch (err) { return fail(c, err); }
  });
}

const isDateStr = (d: any): d is string => typeof d === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(d);
