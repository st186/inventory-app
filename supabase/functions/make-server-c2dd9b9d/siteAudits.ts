// Surprise audits (owner, 28 Oct 2026): the owner - or an independent auditor the owner assigns,
// with a payout - visits a store or the production house without warning, goes through a
// checklist (OK / problem / not applicable, a note and photos for each), adds anything else they
// saw, and submits. Bunny then writes the report (score, what's good, problems by how serious,
// what to do and who), and the owner is told. Marking the auditor paid logs a "Professional fees"
// expense for that place, paid with the owner's own money (no cash drawer changes).
// Nobody at the place is told: audits are seen only by the owner, operations managers and the
// person assigned. Independent auditors sign in as a site auditor (role audit, designation
// site_auditor) and see nothing but their audits (index.ts gate). Registered from index.ts.
//
//   site-audit:{id}   one audit: place, auditor, window, payout, checklist, results, report, payment
// Photos: private bucket audit-photos at {auditId}/{random}.{ext}, shown through signed links.

import { askClaudeWithImages } from './insights.ts';
import { inBackground } from './background.ts';

type Kv = { get: (key: string) => Promise<any>; set: (key: string, value: any) => Promise<void>; getByPrefix: (prefix: string) => Promise<any[]> };
export type SiteAuditDeps = {
  kv: Kv;
  verifyUser: (authHeader: string | null) => Promise<any>;
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<unknown>;
  storage: any;
  getTodayIST: () => string;
  // A site-auditor login (index.ts: the auth account and the staff record).
  createAuditorLogin: (o: { name: string; email: string; phone: string; password: string; createdBy: string }) => Promise<{ employeeId: string } | { error: string }>;
};

type PlaceKind = 'store' | 'production';
type Verdict = 'ok' | 'issue' | 'na';
type Photo = { path: string; at: string };
type Item = { id: string; section: string; text: string };
type Result = { verdict?: Verdict; note?: string; photos?: Photo[]; at?: string };
type Report = {
  status: 'pending' | 'done' | 'failed'; at?: string; model?: string; error?: string;
  score?: number; rating?: 'good' | 'fair' | 'poor' | 'critical'; summary?: string;
  goodPoints?: string[]; problems?: { section: string; item: string; severity: 'low' | 'medium' | 'high' | 'critical'; note: string }[];
  actions?: { action: string; who: string; byWhen: string }[];
};
export type SiteAudit = {
  id: string; placeKind: PlaceKind; placeId: string; placeName: string;
  auditorId: string; auditorName: string; auditorAuthId: string | null; byOwner: boolean;
  from: string; to: string; payout: number; notes: string;
  items: Item[]; results: Record<string, Result>; observations: { id: string; note: string; photos: Photo[]; at: string }[];
  status: 'assigned' | 'in_progress' | 'submitted' | 'reported' | 'cancelled';
  createdBy: string; createdAt: string;
  startedAt?: string; startGeo?: { distanceM: number | null; atPlace: boolean | null };
  submittedAt?: string; report?: Report;
  paid?: { at: string; by: string; amount: number; expenseKey: string } | null;
};

const P = '/make-server-c2dd9b9d';
const BUCKET = 'audit-photos';
const SIGNED_URL_SECONDS = 3600;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const MAX_PHOTOS_PER_ITEM = 4;
const REPORT_PHOTOS = 8;
const AT_PLACE_M = 300; // a start within this of the place's map pin counts as on site
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const str = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const rid = () => [...crypto.getRandomValues(new Uint8Array(9))].map((b) => b.toString(16).padStart(2, '0')).join('');

// ---------------- Default checklists ----------------
// [section, item]. The owner can add their own lines for one audit.
const STORE_ITEMS: [string, string][] = [
  ['Cleanliness', 'Kitchen floor and corners clean, nothing under the counters'],
  ['Cleanliness', 'Counters and work tables wiped, no food left out'],
  ['Cleanliness', 'Fryer, steamer, griller and inductions clean'],
  ['Cleanliness', 'Dustbins covered, not overflowing; back area and drain clear'],
  ['Cleanliness', 'Seating area: tables, chairs, floor, fans and lights clean'],
  ['Food safety', 'Momos and raw items covered and kept cold; freezer cold enough'],
  ['Food safety', 'No expired or spoiled sauces, butter, buns or drinks'],
  ['Food safety', 'Frying oil fresh enough (not dark, not smoking)'],
  ['Food safety', 'Raw and cooked food kept apart'],
  ['Food safety', 'Staff wear caps; hands washed; no eating at the counter'],
  ['Money', 'Cash in the drawer matches today\'s POS sales so far (note both amounts)'],
  ['Money', 'Every sale rung up on the POS (watch a few orders)'],
  ['Stock', 'Momo stock roughly matches the app\'s on-hand'],
  ['People', 'Staff on duty as per the shift; on time'],
  ['People', 'Customers greeted and served politely'],
  ['Safety and papers', 'FSSAI licence on display; fire extinguisher in place'],
];
const PRODUCTION_ITEMS: [string, string][] = [
  ['Cleanliness', 'Floor, walls and corners clean; no dough or stuffing waste lying'],
  ['Cleanliness', 'Folding and steaming tables clean'],
  ['Cleanliness', 'Dough kneader, sheet roller, onion slicer and mixer grinder clean'],
  ['Cleanliness', 'Crates and containers washed, dry, stacked'],
  ['Cleanliness', 'Dustbins covered; back area and drain clear'],
  ['Food safety', 'Raw meat kept cold and apart from vegetables'],
  ['Food safety', 'Fridge and freezer cold enough; nothing stored open'],
  ['Food safety', 'Stuffing and dough covered and dated'],
  ['Food safety', 'No expired or spoiled raw material'],
  ['Food safety', 'Staff wear caps and gloves; hands washed'],
  ['Food safety', 'No signs of rats, cockroaches or flies'],
  ['Records and stock', 'Today\'s production entered in the app as it happens'],
  ['Records and stock', 'Stock on the shelves roughly matches the app\'s on-hand'],
  ['People', 'Staff on duty as per the shift; on time'],
  ['Safety', 'Gas cylinders, wiring and fire extinguisher safe'],
];
const defaultItems = (kind: PlaceKind): Item[] =>
  (kind === 'store' ? STORE_ITEMS : PRODUCTION_ITEMS).map(([section, text], i) => ({ id: `i${i + 1}`, section, text }));

let bucketReady: Promise<void> | null = null;
function ensureBucket(storage: any): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data, error } = await storage.getBucket(BUCKET);
      if (data && !error) {
        if (data.public) await storage.updateBucket(BUCKET, { public: false });
        return;
      }
      const { error: createError } = await storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_PHOTO_BYTES, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
      if (createError && !/already exists/i.test(createError.message || '')) throw createError;
    })().catch((e) => { bucketReady = null; throw e; });
  }
  return bucketReady;
}

function haversineM(lat1: number, lng1: number, lat2: number, lng2: number) {
  const R = 6371000, toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1), dLng = toRad(lng2 - lng1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

const REPORT_SYSTEM = `You write the report of a surprise audit at Bunny Momos, a small momo business in West Bengal, India: a production house makes dough, stuffing and sauces and steams or freezes momos; a store keeps them, steams or fries them and serves customers. You get the auditor's checklist (each item OK, problem or not applicable, with notes), anything else they noted, and some of their photos. Write for the owner: short, plain English, concrete. Judge only from what the auditor recorded and the photos; do not invent problems. Score 0-100 for how the place stood up overall (food safety problems weigh most, then cleanliness, then money and records). For each action, say who should do it (store incharge, production incharge, owner, all staff) and by when (today, this week, this month).`;
const REPORT_SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['score', 'rating', 'summary', 'goodPoints', 'problems', 'actions'],
  properties: {
    score: { type: 'integer' },
    rating: { type: 'string', enum: ['good', 'fair', 'poor', 'critical'] },
    summary: { type: 'string' },
    goodPoints: { type: 'array', items: { type: 'string' } },
    problems: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['section', 'item', 'severity', 'note'], properties: {
      section: { type: 'string' }, item: { type: 'string' }, severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] }, note: { type: 'string' } } } },
    actions: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['action', 'who', 'byWhen'], properties: {
      action: { type: 'string' }, who: { type: 'string' }, byWhen: { type: 'string' } } } },
  },
};

export function registerSiteAuditRoutes(app: any, deps: SiteAuditDeps) {
  const { kv } = deps;
  const key = (id: string) => `site-audit:${id}`;
  const fail = (c: any, err: any) => { console.log('[site-audits]', err?.message || 'error'); return c.json({ error: 'Something went wrong - try again' }, 500); };

  const actorOf = async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const m = auth.user.user_metadata || {};
    const lead = m.role === 'cluster_head' || (m.role === 'manager' && m.designation !== 'store_incharge' && m.designation !== 'production_incharge');
    return { authId: auth.user.id, employeeId: m.employeeId ? String(m.employeeId) : null, name: String(m.name || auth.user.email || 'Someone'), lead, isOwner: m.role === 'cluster_head' };
  };
  type Actor = { authId: string; employeeId: string | null; name: string; lead: boolean; isOwner: boolean };
  const mineToRun = (a: Actor, x: SiteAudit) => (!!a.employeeId && x.auditorId === a.employeeId) || x.auditorAuthId === a.authId;
  const canSee = (a: Actor, x: SiteAudit) => a.lead || mineToRun(a, x);
  const load = async (c: any, a: Actor) => {
    const x: SiteAudit | null = await kv.get(key(c.req.param('id')));
    if (!x || !canSee(a, x)) return null;
    return x;
  };

  // Photos come back as signed links that last an hour.
  const withLinks = async (x: SiteAudit) => {
    const paths = [...Object.values(x.results).flatMap((r) => (r.photos || []).map((p) => p.path)), ...x.observations.flatMap((o) => o.photos.map((p) => p.path))];
    const links: Record<string, string> = {};
    if (paths.length) {
      try {
        const { data } = await deps.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
        (data || []).forEach((d: any, i: number) => { if (d?.signedUrl) links[paths[i]] = d.signedUrl; });
      } catch { /* shown without photos */ }
    }
    return { ...x, photoLinks: links };
  };
  const summary = (x: SiteAudit, a: Actor) => ({
    id: x.id, placeKind: x.placeKind, placeName: x.placeName, auditorName: x.auditorName, byOwner: x.byOwner,
    from: x.from, to: x.to, payout: x.payout, status: x.status, startedAt: x.startedAt, submittedAt: x.submittedAt,
    checked: x.items.filter((i) => x.results[i.id]?.verdict).length, total: x.items.length,
    problems: x.items.filter((i) => x.results[i.id]?.verdict === 'issue').length,
    score: x.report?.status === 'done' ? x.report.score : null, rating: x.report?.status === 'done' ? x.report.rating : null,
    paid: a.lead ? x.paid || null : x.paid ? { at: x.paid.at, amount: x.paid.amount } : null,
  });

  // ---------------- Lists ----------------
  app.get(`${P}/site-audits`, async (c: any) => {
    const a: any = await actorOf(c); if (a.error) return a.error;
    try {
      const all = ((await kv.getByPrefix('site-audit:')) || []).filter((x: SiteAudit) => x?.id && canSee(a, x));
      all.sort((p: SiteAudit, q: SiteAudit) => String(q.createdAt).localeCompare(String(p.createdAt)));
      const res: any = { audits: all.map((x: SiteAudit) => summary(x, a)), canManage: a.lead, isOwner: a.isOwner };
      if (a.lead) {
        const [stores, houses, people] = await Promise.all([kv.getByPrefix('store:'), kv.getByPrefix('production_house_'), kv.getByPrefix('unified-employee:')]);
        res.places = [
          ...(stores || []).filter((s: any) => s?.id).map((s: any) => ({ kind: 'store', id: String(s.id), name: String(s.name || s.id) })),
          ...(houses || []).filter((h: any) => h?.id).map((h: any) => ({ kind: 'production', id: String(h.id), name: String(h.name || h.id) })),
        ];
        res.auditors = (people || []).filter((e: any) => e?.role === 'audit' && e?.designation === 'site_auditor' && e?.status !== 'inactive')
          .map((e: any) => ({ id: String(e.employeeId), name: String(e.name || e.employeeId), phone: String(e.phone || '') }));
      }
      return c.json(res);
    } catch (err) { return fail(c, err); }
  });

  app.get(`${P}/site-audits/:id`, async (c: any) => {
    const a: any = await actorOf(c); if (a.error) return a.error;
    try {
      const x = await load(c, a);
      if (!x) return c.json({ error: 'Audit not found' }, 404);
      return c.json({ audit: await withLinks(a.lead ? x : { ...x, paid: x.paid ? { ...x.paid, expenseKey: '' } : null }), canManage: a.lead, canRun: mineToRun(a, x) || (a.lead && x.byOwner) });
    } catch (err) { return fail(c, err); }
  });

  // ---------------- Owner: auditors and audits ----------------
  app.post(`${P}/site-audits/auditors`, async (c: any) => {
    const a: any = await actorOf(c); if (a.error) return a.error;
    if (!a.isOwner) return c.json({ error: 'Only the owner adds auditors' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const name = str(body?.name, 60); const email = str(body?.email, 120).toLowerCase(); const password = typeof body?.password === 'string' ? body.password : '';
      const phone = String(body?.phone ?? '').replace(/[^\d]/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
      if (name.length < 2) return c.json({ error: 'Write the auditor\'s name' }, 400);
      if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return c.json({ error: 'Write an email for their sign-in' }, 400);
      if (password.length < 8) return c.json({ error: 'The first password needs at least 8 characters' }, 400);
      if (phone && !/^\d{10}$/.test(phone)) return c.json({ error: 'The phone number needs 10 digits' }, 400);
      const r = await deps.createAuditorLogin({ name, email, phone, password, createdBy: a.name });
      if ('error' in r) return c.json({ error: r.error }, 400);
      return c.json({ auditor: { id: r.employeeId, name, phone } });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/site-audits`, async (c: any) => {
    const a: any = await actorOf(c); if (a.error) return a.error;
    if (!a.lead) return c.json({ error: 'Only the owner or an operations manager can set up an audit' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const placeKind: PlaceKind = body?.placeKind === 'production' ? 'production' : 'store';
      const placeId = str(body?.placeId, 80);
      const place = await kv.get(placeKind === 'production' ? `production_house_${placeId}` : `store:${placeId}`);
      if (!place) return c.json({ error: 'Pick the store or production house' }, 400);
      const from = DATE.test(String(body?.from || '')) ? body.from : deps.getTodayIST();
      const to = DATE.test(String(body?.to || '')) && body.to >= from ? body.to : from;
      const payout = Math.max(0, Math.round(Number(body?.payout) || 0));
      let auditorId = '', auditorName = '', auditorAuthId: string | null = null; let byOwner = false;
      if (body?.auditorId === 'self' || !body?.auditorId) {
        byOwner = true; auditorId = a.employeeId || ''; auditorName = a.name; auditorAuthId = a.authId;
      } else {
        const e = await kv.get(`unified-employee:${str(body.auditorId, 40)}`);
        if (!e || e.role !== 'audit' || e.designation !== 'site_auditor' || e.status === 'inactive') return c.json({ error: 'Pick an auditor' }, 400);
        auditorId = String(e.employeeId); auditorName = String(e.name || e.employeeId); auditorAuthId = e.authUserId || null;
      }
      const extra = (Array.isArray(body?.extraItems) ? body.extraItems : []).map((t: any) => str(t, 160)).filter(Boolean).slice(0, 15);
      const items = [...defaultItems(placeKind), ...extra.map((text: string, i: number) => ({ id: `x${i + 1}`, section: 'Also check', text }))];
      const x: SiteAudit = {
        id: `${Date.now().toString(36)}${rid().slice(0, 6)}`, placeKind, placeId, placeName: String(place.name || placeId),
        auditorId, auditorName, auditorAuthId, byOwner, from, to, payout: byOwner ? 0 : payout, notes: str(body?.notes, 600),
        items, results: {}, observations: [], status: 'assigned', createdBy: a.name, createdAt: new Date().toISOString(),
      };
      await kv.set(key(x.id), x);
      // Only the auditor is told - never anyone at the place.
      if (!byOwner && auditorAuthId) {
        await deps.notifyUser(auditorAuthId, 'audit_assigned', `New audit: ${x.placeName}`,
          `Visit any time ${from === to ? `on ${from}` : `between ${from} and ${to}`}, unannounced.${x.payout ? ` Payout Rs ${x.payout}.` : ''}`, x.id, from).catch(() => undefined);
      }
      return c.json({ audit: summary(x, a) });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/site-audits/:id/cancel`, async (c: any) => {
    const a: any = await actorOf(c); if (a.error) return a.error;
    if (!a.lead) return c.json({ error: 'Only the owner or an operations manager can cancel' }, 403);
    try {
      const x = await load(c, a);
      if (!x) return c.json({ error: 'Audit not found' }, 404);
      if (x.status !== 'assigned' && x.status !== 'in_progress') return c.json({ error: 'This audit is already done' }, 409);
      x.status = 'cancelled';
      await kv.set(key(x.id), x);
      if (!x.byOwner && x.auditorAuthId) await deps.notifyUser(x.auditorAuthId, 'audit_assigned', `Audit cancelled: ${x.placeName}`, 'No need to visit.', x.id, x.from).catch(() => undefined);
      return c.json({ audit: summary(x, a) });
    } catch (err) { return fail(c, err); }
  });

  // ---------------- Doing the audit ----------------
  const running = async (c: any) => {
    const a: any = await actorOf(c); if (a.error) return { error: a.error };
    const x = await load(c, a);
    if (!x) return { error: c.json({ error: 'Audit not found' }, 404) };
    if (!(mineToRun(a, x) || (a.lead && x.byOwner))) return { error: c.json({ error: 'This audit is someone else\'s to do' }, 403) };
    if (x.status !== 'in_progress' && x.status !== 'assigned') return { error: c.json({ error: 'This audit has been submitted' }, 409) };
    return { a, x };
  };

  app.post(`${P}/site-audits/:id/start`, async (c: any) => {
    const r: any = await running(c); if (r.error) return r.error;
    const { x } = r as { x: SiteAudit };
    try {
      const body = await c.req.json().catch(() => ({}));
      const today = deps.getTodayIST();
      if (today < x.from) return c.json({ error: `This audit is from ${x.from}` }, 400);
      if (x.status === 'assigned') {
        const pin = await kv.get(`rider-place:${x.placeKind}:${x.placeId}`);
        const lat = Number(body?.latitude), lng = Number(body?.longitude);
        const distanceM = pin && Number.isFinite(lat) && Number.isFinite(lng) ? Math.round(haversineM(lat, lng, Number(pin.latitude), Number(pin.longitude))) : null;
        x.status = 'in_progress';
        x.startedAt = new Date().toISOString();
        x.startGeo = { distanceM, atPlace: distanceM === null ? null : distanceM <= AT_PLACE_M };
        await kv.set(key(x.id), x);
      }
      return c.json({ audit: await withLinks(x) });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/site-audits/:id/item`, async (c: any) => {
    const r: any = await running(c); if (r.error) return r.error;
    const { x } = r as { x: SiteAudit };
    try {
      const body = await c.req.json().catch(() => ({}));
      const itemId = str(body?.itemId, 20);
      if (!x.items.some((i) => i.id === itemId)) return c.json({ error: 'That item is not on this audit' }, 400);
      const verdict: Verdict | undefined = ['ok', 'issue', 'na'].includes(body?.verdict) ? body.verdict : undefined;
      const cur = x.results[itemId] || {};
      x.results[itemId] = { ...cur, ...(verdict ? { verdict } : {}), ...(typeof body?.note === 'string' ? { note: str(body.note, 600) } : {}), at: new Date().toISOString() };
      if (x.status === 'assigned') { x.status = 'in_progress'; x.startedAt = x.startedAt || new Date().toISOString(); }
      await kv.set(key(x.id), x);
      return c.json({ result: x.results[itemId] });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/site-audits/:id/observation`, async (c: any) => {
    const r: any = await running(c); if (r.error) return r.error;
    const { x } = r as { x: SiteAudit };
    try {
      const body = await c.req.json().catch(() => ({}));
      const note = str(body?.note, 600);
      if (!note) return c.json({ error: 'Write what you saw' }, 400);
      const o = { id: `o${Date.now().toString(36)}`, note, photos: [], at: new Date().toISOString() };
      x.observations.push(o);
      await kv.set(key(x.id), x);
      return c.json({ observation: o });
    } catch (err) { return fail(c, err); }
  });

  // A photo for an item (target: the item id) or an observation (target: its id).
  app.post(`${P}/site-audits/:id/photo`, async (c: any) => {
    const r: any = await running(c); if (r.error) return r.error;
    const { x } = r as { x: SiteAudit };
    try {
      const body = await c.req.json().catch(() => ({}));
      const target = str(body?.target, 30);
      const obs = x.observations.find((o) => o.id === target);
      const isItem = x.items.some((i) => i.id === target);
      if (!obs && !isItem) return c.json({ error: 'Pick what the photo is for' }, 400);
      const list = obs ? obs.photos : (x.results[target]?.photos || []);
      if (list.length >= MAX_PHOTOS_PER_ITEM) return c.json({ error: `At most ${MAX_PHOTOS_PER_ITEM} photos for one item` }, 400);
      const m = IMAGE_DATA_URL.exec(typeof body?.image === 'string' ? body.image : '');
      if (!m) return c.json({ error: 'Take a photo first' }, 400);
      const bin = atob(m[2]);
      if (bin.length > MAX_PHOTO_BYTES || bin.length < 500) return c.json({ error: 'That photo could not be used - take it again' }, 400);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const path = `${x.id}/${rid()}.${m[1] === 'jpeg' ? 'jpg' : m[1]}`;
      await ensureBucket(deps.storage);
      const { error } = await deps.storage.from(BUCKET).upload(path, bytes, { contentType: `image/${m[1]}`, upsert: false });
      if (error) throw new Error(error.message);
      // The latest copy: another photo or answer may have landed meanwhile.
      const latest: SiteAudit = (await kv.get(key(x.id))) || x;
      const photo = { path, at: new Date().toISOString() };
      if (obs) latest.observations = latest.observations.map((o) => (o.id === target ? { ...o, photos: [...o.photos, photo] } : o));
      else latest.results[target] = { ...(latest.results[target] || {}), photos: [...(latest.results[target]?.photos || []), photo] };
      await kv.set(key(x.id), latest);
      const { data } = await deps.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
      return c.json({ photo, url: data?.signedUrl || null });
    } catch (err) { return fail(c, err); }
  });

  // Submitted: Bunny writes the report in the background and the owner is told.
  app.post(`${P}/site-audits/:id/submit`, async (c: any) => {
    const r: any = await running(c); if (r.error) return r.error;
    const { a, x } = r as { a: Actor; x: SiteAudit };
    try {
      const unanswered = x.items.filter((i) => !x.results[i.id]?.verdict).length;
      if (unanswered) return c.json({ error: `${unanswered} item${unanswered === 1 ? '' : 's'} not checked yet - mark each OK, problem or not applicable` }, 400);
      x.status = 'submitted';
      x.submittedAt = new Date().toISOString();
      x.report = { status: 'pending', at: x.submittedAt };
      await kv.set(key(x.id), x);
      await inBackground('Audit report', () => writeReport(x.id, a.name));
      return c.json({ audit: summary(x, a) });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/site-audits/:id/report`, async (c: any) => {
    const a: any = await actorOf(c); if (a.error) return a.error;
    if (!a.lead) return c.json({ error: 'Only the owner or an operations manager can do this' }, 403);
    try {
      const x = await load(c, a);
      if (!x || (x.status !== 'submitted' && x.status !== 'reported')) return c.json({ error: 'Not submitted yet' }, 409);
      await writeReport(x.id, x.auditorName, true);
      return c.json({ audit: await withLinks((await kv.get(key(x.id))) as SiteAudit) });
    } catch (err) { return fail(c, err); }
  });

  // The auditor paid: a "Professional fees" expense for the place, paid with the owner's money.
  app.post(`${P}/site-audits/:id/paid`, async (c: any) => {
    const a: any = await actorOf(c); if (a.error) return a.error;
    if (!a.isOwner) return c.json({ error: 'Only the owner marks auditors paid' }, 403);
    try {
      const x = await load(c, a);
      if (!x) return c.json({ error: 'Audit not found' }, 404);
      if (x.byOwner) return c.json({ error: 'Nothing to pay for your own audit' }, 400);
      if (x.paid) return c.json({ error: 'Already marked paid' }, 409);
      if (x.status !== 'submitted' && x.status !== 'reported') return c.json({ error: 'Pay once the audit is submitted' }, 409);
      const body = await c.req.json().catch(() => ({}));
      const amount = Math.round(Number(body?.amount) || x.payout);
      if (!(amount > 0)) return c.json({ error: 'Write the amount paid' }, 400);
      const date = deps.getTodayIST();
      const expenseId = `${Date.now()}-${rid().slice(0, 9)}`;
      const expenseKey = `overhead:${a.authId}:${expenseId}`;
      await kv.set(expenseKey, {
        id: expenseId, userId: a.authId, date, category: 'professional_fees',
        description: `Surprise audit - ${x.placeName} - ${x.auditorName}`, amount,
        paymentMethod: 'owner', cashAmount: 0, onlineAmount: 0,
        entityType: x.placeKind === 'production' ? 'production_house' : 'store',
        storeId: x.placeKind === 'store' ? x.placeId : null, productionHouseId: x.placeKind === 'production' ? x.placeId : null,
        paidFromProductionHouseId: null, siteAuditId: x.id,
      });
      x.paid = { at: new Date().toISOString(), by: a.name, amount, expenseKey };
      await kv.set(key(x.id), x);
      if (x.auditorAuthId) await deps.notifyUser(x.auditorAuthId, 'audit_paid', `Paid for the ${x.placeName} audit`, `Rs ${amount}.`, x.id, date).catch(() => undefined);
      return c.json({ audit: summary(x, a) });
    } catch (err) { return fail(c, err); }
  });

  // ---------------- The report ----------------
  async function writeReport(id: string, auditorName: string, rerun = false) {
    const x: SiteAudit | null = await kv.get(key(id));
    if (!x) return;
    const lines = x.items.map((i) => {
      const r = x.results[i.id] || {};
      return { section: i.section, item: i.text, result: r.verdict === 'ok' ? 'OK' : r.verdict === 'issue' ? 'PROBLEM' : r.verdict === 'na' ? 'not applicable' : 'not checked', note: r.note || '', photos: (r.photos || []).length };
    });
    // The photos of problems first, then the rest, then what else they saw.
    const photoPaths = [
      ...x.items.filter((i) => x.results[i.id]?.verdict === 'issue').flatMap((i) => (x.results[i.id]?.photos || []).map((p) => ({ p: p.path, about: i.text }))),
      ...x.observations.flatMap((o) => o.photos.map((p) => ({ p: p.path, about: o.note }))),
      ...x.items.filter((i) => x.results[i.id]?.verdict !== 'issue').flatMap((i) => (x.results[i.id]?.photos || []).map((p) => ({ p: p.path, about: i.text }))),
    ].slice(0, REPORT_PHOTOS);
    const images: { base64: string; mediaType: string }[] = [];
    for (const { p } of photoPaths) {
      try {
        const { data } = await deps.storage.from(BUCKET).download(p);
        if (!data) continue;
        const buf = new Uint8Array(await data.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        images.push({ base64: btoa(bin), mediaType: data.type || 'image/jpeg' });
      } catch { /* left out */ }
    }
    let report: Report;
    try {
      const { data, model } = await askClaudeWithImages(kv as any, {
        purpose: 'site-audit-report', user: { id: 'site-audit', isOwner: true } as any, system: REPORT_SYSTEM, images, maxImages: REPORT_PHOTOS,
        text: JSON.stringify({
          place: `${x.placeName} (${x.placeKind === 'production' ? 'production house' : 'store'})`, auditor: x.byOwner ? 'the owner' : 'an independent auditor',
          visited: x.startedAt, ownersNotes: x.notes, checklist: lines, alsoNoted: x.observations.map((o) => ({ note: o.note, photos: o.photos.length })),
          photosAttached: photoPaths.map((p, i) => `photo ${i + 1}: ${p.about}`),
        }),
        schema: REPORT_SCHEMA,
      });
      report = {
        status: 'done', at: new Date().toISOString(), model,
        score: Math.max(0, Math.min(100, Math.round(Number(data.score) || 0))), rating: data.rating, summary: str(data.summary, 800),
        goodPoints: (data.goodPoints || []).map((s: any) => str(s, 200)).filter(Boolean).slice(0, 6),
        problems: (data.problems || []).slice(0, 12).map((p: any) => ({ section: str(p.section, 60), item: str(p.item, 160), severity: p.severity, note: str(p.note, 300) })),
        actions: (data.actions || []).slice(0, 10).map((p: any) => ({ action: str(p.action, 200), who: str(p.who, 60), byWhen: str(p.byWhen, 40) })),
      };
    } catch (err: any) {
      console.log('Audit report failed:', String(err?.message || err).slice(0, 160));
      report = { status: 'failed', at: new Date().toISOString(), error: 'Bunny could not write the report - try again' };
    }
    const latest: SiteAudit = (await kv.get(key(id))) || x;
    latest.report = report;
    if (report.status === 'done') latest.status = 'reported';
    await kv.set(key(id), latest);
    if (rerun) return;
    const owners = ((await kv.getByPrefix('unified-employee:')) || []).filter((e: any) => e?.role === 'cluster_head' && e?.authUserId && e?.status !== 'inactive');
    for (const o of owners) {
      await deps.notifyUser(o.authUserId, 'audit_report', report.status === 'done' ? `Audit report: ${x.placeName}, ${report.score}/100` : `Audit submitted: ${x.placeName}`,
        report.status === 'done' ? `${report.summary || ''} By ${auditorName}.`.trim() : `By ${auditorName}. Open it to write the report again.`, x.id, x.from).catch(() => undefined);
    }
  }
}
