// Cameras (owner, 29 Oct 2026): a PC next to the Tapo cameras (tools/cctv/camera_watch.py) sends
// stills here. In working hours one every 30 minutes, checked for cap, gloves and apron; outside
// them only when it sees movement, and anyone in view is an unauthorised entry. The AI (insights.ts
// aiLookAtCamera) counts people and judges each item yes / no / unclear; only a clear "no" raises a
// PPE alert. Alerts go to the place's incharge and the owner with the photo; whoever opens one
// marks it correct, false alarm or (after hours) one of us, so we can see how well it works.
// Who is there: the app's shift check-ins (movement after hours while someone is checked in there
// is them working late, not an intruder) and face recognition on the camera PC only
// (tools/cctv/faces.py - the face numbers never leave it; it sends the names it recognised). After
// hours, people who are all recognised colleagues aren't an intruder either; alerts say who was
// seen and who is on shift. Registered from kpi.ts. The rules are in cameraRules.ts.
//
//   cctv-camera:{id}            name, place, what to check, working hours, how often, key (hashed)
//   cctv-alert:{id}             kind ppe | intruder, when, what was missing, photo path, the mark
//   cctv-check:{cameraId}:{at}  every checked still: people, missing items, alert or not (30 days)
import { createClient } from 'npm:@supabase/supabase-js@2';
import { P, actorOf, type Actor, type KpiDeps } from './attendance.ts';
import { AiError, aiLookAtCamera } from './insights.ts';
import { PPE_ITEMS, cleanFaces, decide, inHours, istClock, minutesUntilHours, missingText, onlyKnownStaff, type PpeItem } from './cameraRules.ts';

const BUCKET = 'cctv-photos'; // private; evidence photos of alerts only, kept KEEP_DAYS
const KEEP_DAYS = 30;
const PPE_GAP_MIN = 15;
const INTRUDER_GAP_MIN = 10;
const MOTION_LOOK_GAP_MS = 2 * 60000; // after hours, at most one AI look every 2 minutes
const MAX_IMAGE_CHARS = 2_000_000; // ~1.5 MB of JPEG as base64

type Camera = {
  id: string; name: string; placeKind: 'production' | 'store'; placeId: string; checks: PpeItem[];
  from: string; to: string; everyMin: number; active: boolean; keyHash: string; keyHint: string;
  createdAt: string; createdBy: string; lastSeenAt?: string; lastScheduledAt?: string; lastMotionLookAt?: string;
  lastAlert?: { ppe?: string; intruder?: string };
};
type Alert = {
  id: string; cameraId: string; kind: 'ppe' | 'intruder'; at: string; missing: Partial<Record<PpeItem, number>>; peopleCount: number;
  note: string; photoPath: string | null; onShift?: string[]; seen?: string[]; unknownFaces?: number; mark?: 'correct' | 'false' | 'staff'; markedBy?: string; markedAt?: string;
};

let client: any = null;
const storage = () => (client ||= createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!)).storage;
// The bucket is made (private) the first time an alert needs it, like the other photo buckets.
let bucketReady: Promise<void> | null = null;
function ensureBucket(): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data, error } = await storage().getBucket(BUCKET);
      if (data && !error) {
        if (data.public) await storage().updateBucket(BUCKET, { public: false });
        return;
      }
      const { error: createError } = await storage().createBucket(BUCKET, { public: false, fileSizeLimit: 2 * 1024 * 1024, allowedMimeTypes: ['image/jpeg'] });
      if (createError && !/already exists/i.test(createError.message || '')) throw createError;
    })().catch((e) => { bucketReady = null; throw e; });
  }
  return bucketReady;
}
const newId = (bytes = 9) => [...crypto.getRandomValues(new Uint8Array(bytes))].map((b) => b.toString(16).padStart(2, '0')).join('');
async function sha256(text: string) {
  const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
function same(a: string, b: string) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const clip = (s: unknown, n: number) => String(s ?? '').trim().slice(0, n);
const publicCamera = ({ keyHash: _k, ...c }: Camera) => ({ ...c, online: !!c.lastSeenAt && Date.now() - Date.parse(c.lastSeenAt) < 2 * 3600000 });

export function registerCameraRoutes(app: any, deps: KpiDeps) {
  const fail = (c: any, err: any) => {
    if (err instanceof AiError) return c.json({ error: err.message }, err.status as any);
    console.error('[cctv]', err?.message || 'error');
    return c.json({ error: 'Something went wrong - try again' }, 500);
  };
  const cameras = async () => (await deps.kv.getByPrefix<Camera>('cctv-camera:')).filter((x) => x?.id);
  // Owners and operations managers see every camera; an incharge the cameras at their place.
  const seesPlace = (a: Actor, cam: Camera) => {
    if (a.isOwner || a.isOps) return true;
    const e = a.emp || {};
    const ids = new Set([e.storeId, e.productionHouseId, ...(e.assignedStoreIds || []), ...(e.assignedProductionHouseIds || [])].filter(Boolean).map(String));
    return ['store_incharge', 'production_incharge'].includes(a.designation || '') && ids.has(cam.placeId);
  };
  const placeName = async (cam: Camera) => {
    if (cam.placeKind === 'store') return (await deps.kv.get<any>(`store:${cam.placeId}`))?.name || 'Store';
    return (await deps.kv.getByPrefix<any>('production_house_')).find((h) => h?.id === cam.placeId)?.name || 'Production';
  };
  async function recipients(cam: Camera) {
    const all = await deps.getAllByPrefix('unified-employee:');
    const designation = cam.placeKind === 'store' ? 'store_incharge' : 'production_incharge';
    return all.filter((e: any) => e?.authUserId && !['inactive', 'archived'].includes(e.status) && (
      e.role === 'cluster_head'
      || (e.designation === designation && [e.storeId, e.productionHouseId, ...(e.assignedStoreIds || []), ...(e.assignedProductionHouseIds || [])].map(String).includes(cam.placeId))
    ));
  }
  // Who is checked in at the camera's place right now (shift clock: in and not yet out, today or a
  // shift that started yesterday).
  async function onShift(cam: Camera): Promise<string[]> {
    const all = await deps.getAllByPrefix('unified-employee:');
    const here = all.filter((e: any) => e?.employeeId && !['inactive', 'archived'].includes(e.status) && e.role !== 'cluster_head'
      && [e.storeId, e.productionHouseId, ...(e.assignedStoreIds || []), ...(e.assignedProductionHouseIds || [])].map(String).includes(cam.placeId));
    const today = new Date(Date.now() + 330 * 60000).toISOString().slice(0, 10);
    const yesterday = new Date(Date.now() + 330 * 60000 - 86400000).toISOString().slice(0, 10);
    const names: string[] = [];
    for (const e of here) {
      const recs = await Promise.all([today, yesterday].map((d) => deps.kv.get<any>(`punch:${e.employeeId}:${d}`)));
      if (recs.some((x) => x?.in && !x?.out)) names.push(String(e.name || e.employeeId));
    }
    return names;
  }

  async function cleanup(cameraId: string) {
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86400000).toISOString();
    const old = (await deps.kv.getByPrefix<Alert>('cctv-alert:')).filter((a) => a?.cameraId === cameraId && a.at < cutoff);
    const paths = old.map((a) => a.photoPath).filter(Boolean) as string[];
    if (paths.length) await storage().from(BUCKET).remove(paths).catch(() => undefined);
    for (const a of old) await deps.kv.del(`cctv-alert:${a.id}`);
    const checks = await deps.kv.getByPrefix<any>(`cctv-check:${cameraId}:`);
    for (const x of checks) if (x?.at && x.at < cutoff) await deps.kv.del(`cctv-check:${cameraId}:${x.at}`);
  }

  // ---- The camera PC (no login: the camera's own key) ----

  async function deviceCamera(c: any): Promise<Camera | null> {
    const id = clip(c.req.header('X-Camera-Id'), 40);
    const key = c.req.header('X-Camera-Key') || '';
    if (!id || key.length < 20) return null;
    const cam = await deps.kv.get<Camera>(`cctv-camera:${id}`);
    return cam && same(cam.keyHash, await sha256(key)) ? cam : null;
  }
  const plan = (cam: Camera) => {
    const now = istClock(Date.now());
    const working = inHours(now, cam.from, cam.to);
    const sinceLast = cam.lastScheduledAt ? (Date.now() - Date.parse(cam.lastScheduledAt)) / 1000 : Infinity;
    return {
      active: cam.active, from: cam.from, to: cam.to, everyMin: cam.everyMin, working,
      // Seconds until the next scheduled still (working hours) or until watching for movement matters.
      nextStillInSec: !cam.active ? 3600 : working ? Math.max(0, Math.round(cam.everyMin * 60 - sinceLast)) : minutesUntilHours(now, cam.from, cam.to) * 60,
    };
  };

  // GET /cctv/config - what the camera PC should be doing now.
  app.get(`${P}/cctv/config`, async (c: any) => {
    const cam = await deviceCamera(c);
    if (!cam) return c.json({ error: 'Unknown camera or wrong key' }, 401);
    await deps.kv.set(`cctv-camera:${cam.id}`, { ...cam, lastSeenAt: new Date().toISOString() });
    return c.json({ camera: cam.name, ...plan(cam) });
  });

  // POST /cctv/frame {kind: 'scheduled' | 'motion', image: base64 JPEG}
  app.post(`${P}/cctv/frame`, async (c: any) => {
    const cam = await deviceCamera(c);
    if (!cam) return c.json({ error: 'Unknown camera or wrong key' }, 401);
    try {
      const body = await c.req.json().catch(() => ({}));
      const kind = body.kind === 'motion' ? 'motion' : 'scheduled';
      const faces = cleanFaces(body.faces);
      const image = String(body.image || '');
      if (!image || image.length > MAX_IMAGE_CHARS || !/^[A-Za-z0-9+/=]+$/.test(image.slice(0, 200))) return c.json({ error: 'Send one JPEG as base64' }, 400);
      const nowMs = Date.now();
      const now = new Date(nowMs).toISOString();
      cam.lastSeenAt = now;
      const p = plan(cam);
      // The server keeps the schedule, whatever the PC's clock says (and the AI budget with it).
      if (!cam.active) { await deps.kv.set(`cctv-camera:${cam.id}`, cam); return c.json({ skipped: 'paused', ...p }); }
      if (kind === 'scheduled' && (!p.working || p.nextStillInSec > 60)) { await deps.kv.set(`cctv-camera:${cam.id}`, cam); return c.json({ skipped: p.working ? 'too soon' : 'outside working hours', ...p }); }
      if (kind === 'motion') {
        if (p.working) { await deps.kv.set(`cctv-camera:${cam.id}`, cam); return c.json({ skipped: 'working hours', ...p }); }
        if (cam.lastMotionLookAt && nowMs - Date.parse(cam.lastMotionLookAt) < MOTION_LOOK_GAP_MS) { await deps.kv.set(`cctv-camera:${cam.id}`, cam); return c.json({ skipped: 'looked a moment ago', ...p }); }
        cam.lastMotionLookAt = now;
      } else {
        cam.lastScheduledAt = now;
      }
      await deps.kv.set(`cctv-camera:${cam.id}`, cam);

      const place = await placeName(cam);
      const look = await aiLookAtCamera(deps.kv as any, { base64: image, mediaType: 'image/jpeg', place: `${cam.name}, ${place}` });
      const lastAlertAt = kind === 'motion' ? cam.lastAlert?.intruder : cam.lastAlert?.ppe;
      const d = decide({ kind, look, checks: cam.checks, nowMs, lastAlertAt, gapMin: kind === 'motion' ? INTRUDER_GAP_MIN : PPE_GAP_MIN });
      const staff = d.alert || (kind === 'motion' && look.peopleCount > 0) ? await onShift(cam) : [];
      // Someone checked in here after hours is staff working late; so is a recognised colleague.
      if (d.alert === 'intruder' && (staff.length || onlyKnownStaff(faces, look.peopleCount))) d.alert = null;
      const seen = faces?.names || [];
      await deps.kv.set(`cctv-check:${cam.id}:${now}`, { at: now, kind, peopleCount: look.peopleCount, missing: d.missing, alert: d.alert, note: look.note, onShift: staff, seen, unknownFaces: faces?.unknown || 0 });

      let alert: Alert | null = null;
      if (d.alert) {
        const id = newId();
        const path = `${cam.id}/${now.slice(0, 10)}/${id}.jpg`;
        const bytes = Uint8Array.from(atob(image), (ch) => ch.charCodeAt(0));
        const { error } = await ensureBucket().then(() => storage().from(BUCKET).upload(path, bytes, { contentType: 'image/jpeg', upsert: false }))
          .catch((e: any) => ({ error: e }));
        if (error) console.error('[cctv] photo not stored:', String(error?.message || error).slice(0, 120));
        alert = { id, cameraId: cam.id, kind: d.alert, at: now, missing: d.missing, peopleCount: look.peopleCount, note: look.note, photoPath: error ? null : path, onShift: staff, seen, unknownFaces: faces?.unknown || 0 };
        await deps.kv.set(`cctv-alert:${id}`, alert);
        const fresh = (await deps.kv.get<Camera>(`cctv-camera:${cam.id}`)) || cam;
        await deps.kv.set(`cctv-camera:${cam.id}`, { ...fresh, lastAlert: { ...(fresh.lastAlert || {}), [d.alert]: now } });
        const at = new Date(nowMs + 330 * 60000).toISOString().slice(11, 16);
        const title = d.alert === 'intruder' ? `Someone at ${place} after hours` : `PPE missing at ${place}`;
        const message = d.alert === 'intruder'
          ? `${look.peopleCount} ${look.peopleCount === 1 ? 'person' : 'people'} seen by ${cam.name} at ${at} (working hours ${cam.from}-${cam.to})${faces?.unknown ? `, ${faces.unknown} face${faces.unknown === 1 ? '' : 's'} not recognised` : ''}${seen.length ? `; recognised: ${seen.join(', ')}` : ''}. Open Cameras to see the photo. · কাজের সময়ের বাইরে কেউ ঢুকেছে`
          : `${missingText(d.missing)} at ${at} (${cam.name}).${seen.length ? ` Seen: ${seen.join(', ')}.` : ''}${staff.length ? ` On shift: ${staff.join(', ')}.` : ''} Open Cameras to see the photo. · টুপি / গ্লাভস / অ্যাপ্রন নেই`;
        for (const r of await recipients(cam)) {
          await deps.notifyUser?.(r.authUserId, d.alert === 'intruder' ? 'cctv_intruder' : 'cctv_ppe', title, message, id, now.slice(0, 10)).catch(() => undefined);
        }
        cleanup(cam.id).catch(() => undefined);
      }
      return c.json({ ok: true, peopleCount: look.peopleCount, missing: d.missing, alert: alert?.kind || null, ...plan((await deps.kv.get<Camera>(`cctv-camera:${cam.id}`)) || cam) });
    } catch (err) { return fail(c, err); }
  });

  // ---- The app ----

  app.get(`${P}/cctv/cameras`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    try {
      const list = (await cameras()).filter((cam) => seesPlace(r.actor!, cam));
      const weekAgo = new Date(Date.now() - 7 * 86400000).toISOString();
      const alerts = (await deps.kv.getByPrefix<Alert>('cctv-alert:')).filter((a) => a?.at >= weekAgo);
      const out = [];
      for (const cam of list) {
        const checks = (await deps.kv.getByPrefix<any>(`cctv-check:${cam.id}:`)).filter((x) => x?.at >= weekAgo);
        const mine = alerts.filter((a) => a.cameraId === cam.id);
        out.push({
          ...publicCamera(cam), place: await placeName(cam),
          week: { checks: checks.length, alerts: mine.length, falseAlarms: mine.filter((a) => a.mark === 'false').length, unmarked: mine.filter((a) => !a.mark).length },
          lastCheck: checks.sort((a: any, b: any) => b.at.localeCompare(a.at))[0] || null,
        });
      }
      return c.json({ cameras: out, canManage: r.actor!.isOwner });
    } catch (err) { return fail(c, err); }
  });

  const cleanSettings = (body: any) => {
    const checks = (Array.isArray(body.checks) ? body.checks : []).filter((x: any) => PPE_ITEMS.includes(x));
    const from = TIME.test(body.from) ? body.from : null;
    const to = TIME.test(body.to) ? body.to : null;
    const everyMin = Math.round(Number(body.everyMin));
    if (!from || !to) return { error: 'Working hours as HH:MM' };
    if (!(everyMin >= 5 && everyMin <= 240)) return { error: 'Check every 5 to 240 minutes' };
    return { checks, from, to, everyMin };
  };

  // POST /cctv/cameras {name, placeKind, placeId, checks, from, to, everyMin} - the owner adds one;
  // the key comes back once, for the camera PC's settings file.
  app.post(`${P}/cctv/cameras`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    if (!r.actor!.isOwner) return c.json({ error: 'Only the owner adds cameras' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const s = cleanSettings(body);
      if ('error' in s) return c.json({ error: s.error }, 400);
      const name = clip(body.name, 40);
      const placeKind = body.placeKind === 'store' ? 'store' : 'production';
      const placeId = clip(body.placeId, 80);
      if (!name || !placeId) return c.json({ error: 'Give the camera a name and a place' }, 400);
      const key = newId(24);
      const cam: Camera = {
        id: `cam-${newId(4)}`, name, placeKind, placeId, ...s, active: true, keyHash: await sha256(key), keyHint: key.slice(-4),
        createdAt: new Date().toISOString(), createdBy: r.actor!.name,
      };
      await deps.kv.set(`cctv-camera:${cam.id}`, cam);
      return c.json({ camera: publicCamera(cam), key });
    } catch (err) { return fail(c, err); }
  });

  // PUT /cctv/cameras/:id - name, what to check, hours, how often, paused.
  app.put(`${P}/cctv/cameras/:id`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    if (!r.actor!.isOwner) return c.json({ error: 'Only the owner changes cameras' }, 403);
    try {
      const cam = await deps.kv.get<Camera>(`cctv-camera:${c.req.param('id')}`);
      if (!cam) return c.json({ error: 'Camera not found' }, 404);
      const body = await c.req.json().catch(() => ({}));
      const s = cleanSettings({ ...cam, ...body });
      if ('error' in s) return c.json({ error: s.error }, 400);
      const next = { ...cam, ...s, name: clip(body.name ?? cam.name, 40) || cam.name, active: body.active === undefined ? cam.active : !!body.active };
      await deps.kv.set(`cctv-camera:${cam.id}`, next);
      return c.json({ camera: publicCamera(next) });
    } catch (err) { return fail(c, err); }
  });

  // POST /cctv/cameras/:id/key - a new key (the old one stops working).
  app.post(`${P}/cctv/cameras/:id/key`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    if (!r.actor!.isOwner) return c.json({ error: 'Only the owner changes camera keys' }, 403);
    try {
      const cam = await deps.kv.get<Camera>(`cctv-camera:${c.req.param('id')}`);
      if (!cam) return c.json({ error: 'Camera not found' }, 404);
      const key = newId(24);
      await deps.kv.set(`cctv-camera:${cam.id}`, { ...cam, keyHash: await sha256(key), keyHint: key.slice(-4) });
      return c.json({ key });
    } catch (err) { return fail(c, err); }
  });

  // GET /cctv/alerts?cameraId= - the last 30 days, newest first, with a photo link for an hour.
  app.get(`${P}/cctv/alerts`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    try {
      const visible = new Map((await cameras()).filter((cam) => seesPlace(r.actor!, cam)).map((cam) => [cam.id, cam]));
      const only = c.req.query('cameraId');
      const list = (await deps.kv.getByPrefix<Alert>('cctv-alert:'))
        .filter((a) => a?.id && visible.has(a.cameraId) && (!only || a.cameraId === only))
        .sort((a, b) => b.at.localeCompare(a.at)).slice(0, 60);
      const paths = list.map((a) => a.photoPath).filter(Boolean) as string[];
      const urls = new Map<string, string>();
      if (paths.length) {
        const { data } = await storage().from(BUCKET).createSignedUrls(paths, 3600);
        for (const x of data || []) if (x?.path && x.signedUrl) urls.set(x.path, x.signedUrl);
      }
      return c.json({
        alerts: list.map((a) => ({ ...a, cameraName: visible.get(a.cameraId)?.name || '', photoUrl: a.photoPath ? urls.get(a.photoPath) || null : null, text: a.kind === 'ppe' ? missingText(a.missing) : `${a.peopleCount} in view after hours` })),
      });
    } catch (err) { return fail(c, err); }
  });

  // POST /cctv/alerts/:id/mark {mark: 'correct' | 'false' | 'staff'}
  app.post(`${P}/cctv/alerts/:id/mark`, async (c: any) => {
    const r = await actorOf(deps, c);
    if (r.error) return r.error;
    try {
      const a = await deps.kv.get<Alert>(`cctv-alert:${c.req.param('id')}`);
      if (!a) return c.json({ error: 'Alert not found' }, 404);
      const cam = await deps.kv.get<Camera>(`cctv-camera:${a.cameraId}`);
      if (!cam || !seesPlace(r.actor!, cam)) return c.json({ error: 'Not allowed' }, 403);
      const body = await c.req.json().catch(() => ({}));
      if (!['correct', 'false', 'staff'].includes(body.mark)) return c.json({ error: 'Mark it correct, false alarm or one of us' }, 400);
      const next = { ...a, mark: body.mark, markedBy: r.actor!.name, markedAt: new Date().toISOString() };
      await deps.kv.set(`cctv-alert:${a.id}`, next);
      return c.json({ alert: next });
    } catch (err) { return fail(c, err); }
  });
}
