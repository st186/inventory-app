// Customer complaints (owner, 28 Oct 2026): a 1-star rating, food that was contaminated, rotten
// or smelt bad, a review about dirt. The owner (or an operations manager) logs it with the photos
// and what the customer said; the server gathers what the app knows about that day and week -
// photo-check hygiene at the store and the production house, stuffing carried over from earlier
// days, machine or power trouble, production checks raised - and Bunny reads the photos and the
// evidence: what went wrong, how serious, and whether it most likely came from the store, the
// production house or delivery. The owner confirms who must explain; they are asked on their Home
// and by push, answer in the app, and the owner decides: upheld (with points off each person's
// monthly KPI total, kpi.ts) or not our fault. Everything stays as a log.
//
//   complaint:{id}   one complaint, its photos, evidence, Bunny's reading, explanations, decision
// Photos are in the private bucket complaint-photos at {id}/{n}.jpg, shown by signed links.
import { askClaudeWithImages } from './insights.ts';
import { inBackground } from './background.ts';

type Kv = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  getByPrefix: (prefix: string) => Promise<any[]>;
};
export type ComplaintDeps = {
  kv: Kv;
  getAllByPrefix: (prefix: string) => Promise<any[]>;
  verifyUser: (authHeader: string | null) => Promise<any>;
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<unknown>;
  storage: any;
  getTodayIST: () => string;
};

const P = '/make-server-c2dd9b9d';
const BUCKET = 'complaint-photos';
const MAX_PHOTOS = 6;
const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const SIGNED_URL_SECONDS = 3600;
export const COMPLAINT_SOURCES = ['zomato', 'swiggy', 'google', 'walk_in', 'phone', 'other'];
export const ISSUE_KINDS = ['foreign_object', 'hair', 'insect_pest', 'raw_undercooked', 'rotten_spoiled', 'foul_smell', 'unclean_premises', 'unclean_packaging', 'cold_food', 'taste_quality', 'wrong_missing_item', 'staff_behaviour', 'delay', 'other'];
// Default points off the monthly KPI total for an upheld complaint, by severity (owner can change).
export const PENALTY_BY_SEVERITY: Record<string, number> = { low: 5, medium: 10, high: 20, critical: 30 };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const addDays = (date: string, n: number) => new Date(Date.parse(`${date}T00:00:00Z`) + n * 86400000).toISOString().slice(0, 10);
const str = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
const round1 = (n: number) => Math.round(n * 10) / 10;

let bucketReady = false;
async function ensureBucket(storage: any) {
  if (bucketReady) return;
  const { data } = await storage.getBucket(BUCKET);
  if (!data) {
    const { error } = await storage.createBucket(BUCKET, { public: false, fileSizeLimit: 3 * 1024 * 1024, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
    if (error && !/exist/i.test(error.message || '')) throw new Error(error.message);
  }
  bucketReady = true;
}

function parseDataUrl(v: any): { base64: string; mediaType: string; bytes: Uint8Array } | null {
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(typeof v === 'string' ? v : '');
  if (!m) return null;
  const bin = atob(m[2]);
  if (bin.length > MAX_PHOTO_BYTES) return null;
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { base64: m[2], mediaType: m[1], bytes };
}

// ---------------- Evidence: what the app knows about the day and the week ----------------
type PlaceHygiene = { photos: number; avgScore: number | null; needsCleaning: number; severe: number; worst: string[] };
async function hygieneAt(deps: ComplaintDeps, kind: 'store' | 'production', id: string | null, from: string, to: string): Promise<PlaceHygiene> {
  const out: PlaceHygiene = { photos: 0, avgScore: null, needsCleaning: 0, severe: 0, worst: [] };
  if (!id) return out;
  let sum = 0, scored = 0;
  const low: { name: string; score: number; date: string }[] = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const rows = await deps.kv.getByPrefix(`workplace-check:${d}:`);
    for (const r of rows || []) {
      for (const it of Object.values(r?.items || {}) as any[]) {
        if (it?.locationKind !== kind || it?.locationId !== id) continue;
        out.photos++;
        if (typeof it.aiScore === 'number' && it.aiVerdict !== 'unclear_photo') { sum += it.aiScore; scored++; if (it.aiScore < 6) low.push({ name: it.name, score: it.aiScore, date: d }); }
        if (it.wasSevere || it.aiSevere) out.severe++;
        else if (it.wasFlagged || it.flag?.status === 'needs_cleaning' || it.aiVerdict === 'needs_cleaning') out.needsCleaning++;
      }
    }
  }
  out.avgScore = scored ? round1(sum / scored) : null;
  out.worst = low.sort((a, b) => a.score - b.score).slice(0, 4).map((x) => `${x.name} ${x.score}/10 (${x.date.slice(5)})`);
  return out;
}

async function staffOnShift(deps: ComplaintDeps, people: any[], dates: string[]) {
  const on: { id: string; name: string; designation: string }[] = [];
  for (const e of people) {
    const id = String(e.employeeId);
    let worked = false;
    for (const d of dates) {
      const [punch, sheet] = await Promise.all([deps.kv.get(`punch:${id}:${d}`), deps.kv.get(`timesheet:${id}:${d}`)]);
      if (punch?.in || punch?.out || (sheet && !sheet.isLeave && sheet.status !== 'rejected')) { worked = true; break; }
    }
    if (worked) on.push({ id, name: String(e.name || id), designation: String(e.designation || '') });
  }
  return on;
}

async function gatherEvidence(deps: ComplaintDeps, storeId: string, orderDate: string) {
  const [stores, employees] = await Promise.all([deps.kv.getByPrefix('store:'), deps.kv.getByPrefix('unified-employee:')]);
  const store = (stores || []).find((s: any) => String(s?.id) === storeId);
  const house: string | null = store?.productionHouseId ? String(store.productionHouseId) : null;
  const weekFrom = addDays(orderDate, -6);
  const [storeHygiene, productionHygiene] = await Promise.all([
    hygieneAt(deps, 'store', storeId, weekFrom, orderDate),
    hygieneAt(deps, 'production', house, weekFrom, orderDate),
  ]);
  // Stuffing carried over from earlier days into the order day, and what the day closes said.
  const ledgerDays: any[] = [];
  if (house) {
    for (const d of [addDays(orderDate, -2), addDays(orderDate, -1), orderDate]) {
      const rec = await deps.kv.get(`production-ledger:${house}:${d}`);
      if (!rec) continue;
      const carried = Object.entries(rec.pools || {}).filter(([pid, p]: [string, any]) => /^(stuffing|coating):/.test(pid) && (p?.opening || 0) > 0.05)
        .map(([pid, p]: [string, any]) => `${pid.split(':')[1]} ${round1(p.opening)} kg`);
      const reasons = (rec.leftoverReport?.reasons || []).map((r: any) => r.kind);
      ledgerDays.push({ date: d, carriedOver: carried, leftoverReasons: reasons, lateCheck: rec.leftoverReport?.lateCheck?.issues?.length || 0 });
    }
  }
  const [flags, repairs] = await Promise.all([deps.kv.getByPrefix('production-flag:'), deps.kv.getByPrefix('repair-alert:')]);
  const productionChecks = (flags || []).filter((f: any) => f?.house === house && f.date >= weekFrom && f.date <= orderDate).map((f: any) => `${f.date.slice(5)}: ${f.title}`).slice(0, 6);
  const machines = (repairs || []).filter((r: any) => r?.locationId === house && r.date >= addDays(orderDate, -7) && r.date <= orderDate).map((r: any) => `${r.machine} (${r.date.slice(5)}${r.status === 'open' ? ', still down' : ''})`);
  const active = (employees || []).filter((e: any) => e?.employeeId && e.status !== 'inactive' && e.designation !== 'rider' && e.role !== 'cluster_head');
  const storeStaff = active.filter((e: any) => [e.storeId, ...(e.assignedStoreIds || [])].map(String).includes(storeId) && (/^store_/.test(String(e.designation || '')) || e.department === 'store_operations'));
  const houseStaff = house ? active.filter((e: any) => {
    const ids = [e.storeId, e.productionHouseId, ...(e.assignedProductionHouseIds || [])].filter(Boolean).map(String);
    return ids.includes(house) || ((e.department === 'production' || /^production_/.test(String(e.designation || ''))) && ids.includes(storeId));
  }) : [];
  const [storeOnShift, productionOnShift] = await Promise.all([
    staffOnShift(deps, storeStaff, [orderDate]),
    staffOnShift(deps, houseStaff, [addDays(orderDate, -1), orderDate]),
  ]);
  return {
    storeId, storeName: String(store?.name || 'Store'), productionHouseId: house, weekFrom,
    storeHygiene, productionHygiene, ledgerDays, productionChecks, machines,
    storeIncharges: storeStaff.filter((e: any) => e.designation === 'store_incharge').map((e: any) => ({ id: String(e.employeeId), name: String(e.name) })),
    productionIncharges: houseStaff.filter((e: any) => e.designation === 'production_incharge').map((e: any) => ({ id: String(e.employeeId), name: String(e.name) })),
    storeOnShift, productionOnShift,
  };
}

const evidenceText = (ev: any) => JSON.stringify({
  storeWeekHygiene: ev.storeHygiene, productionWeekHygiene: ev.productionHygiene,
  productionDays: ev.ledgerDays, productionChecksRaised: ev.productionChecks, machinesDown: ev.machines,
  storeStaffOnShift: ev.storeOnShift.length, productionStaffOnShift: ev.productionOnShift.length,
});

// ---------------- Bunny's reading ----------------
const SYSTEM = `You investigate customer complaints for Bunny Momos in West Bengal, India: one production house makes the dough, stuffing and sauces and steams or freezes momos; the store keeps them, steams or fries them, packs and serves (counter, Zomato, Swiggy). You get the complaint, any photos, and evidence from the app about the order day and the week before: average hygiene photo scores (0-10) and flagged photos at the store and the production house, stuffing carried over from earlier days, machine or power trouble, production checks raised.
- Judge only from the photos, the customer's words and the evidence. Be fair: do not blame without a reason; say "unclear" when you cannot tell.
- likelySource: "production" (raw material, stuffing or dough, storage at the kitchen, old stock), "store" (holding, cooking, hygiene at the counter, packing), "delivery" (transit, rider, packaging damage after it left), or "unclear".
- severity: low (taste, temperature, small quality slip), medium (clearly bad product), high (rotten, raw, foul smell, dirty), critical (foreign object, insect, hair, anything that can make someone ill).
- reasoning: 2-4 short sentences citing the evidence numbers you used.
- questionsForStaff: up to 4 short, specific questions the responsible people must answer. recommendedActions: up to 4 concrete steps. Plain English, no names.`;

const SCHEMA = {
  type: 'object', additionalProperties: false,
  required: ['summary', 'issues', 'severity', 'likelySource', 'confidence', 'reasoning', 'questionsForStaff', 'recommendedActions'],
  properties: {
    summary: { type: 'string' },
    issues: { type: 'array', items: { type: 'object', additionalProperties: false, required: ['kind', 'note'], properties: { kind: { type: 'string', enum: ISSUE_KINDS }, note: { type: 'string' } } } },
    severity: { type: 'string', enum: ['low', 'medium', 'high', 'critical'] },
    likelySource: { type: 'string', enum: ['production', 'store', 'delivery', 'unclear'] },
    confidence: { type: 'string', enum: ['low', 'medium', 'high'] },
    reasoning: { type: 'string' },
    questionsForStaff: { type: 'array', items: { type: 'string' } },
    recommendedActions: { type: 'array', items: { type: 'string' } },
  },
};

async function analyse(deps: ComplaintDeps, c: any, images: { base64: string; mediaType: string }[]) {
  try {
    const { data, model } = await askClaudeWithImages(deps.kv as any, {
      purpose: 'complaint-review',
      user: { id: 'complaint-review', isOwner: true },
      system: SYSTEM,
      images,
      text: JSON.stringify({
        source: c.source, rating: c.rating, orderDate: c.orderDate, store: c.evidence.storeName,
        customerSaid: c.customerText, ownerNote: c.ownerNote, photos: images.length, evidence: JSON.parse(evidenceText(c.evidence)),
      }),
      schema: SCHEMA,
    });
    return {
      status: 'done', model, at: new Date().toISOString(),
      summary: str(data.summary, 400),
      issues: (Array.isArray(data.issues) ? data.issues : []).filter((x: any) => ISSUE_KINDS.includes(x?.kind)).slice(0, 5).map((x: any) => ({ kind: x.kind, note: str(x.note, 200) })),
      severity: ['low', 'medium', 'high', 'critical'].includes(data.severity) ? data.severity : 'medium',
      likelySource: ['production', 'store', 'delivery', 'unclear'].includes(data.likelySource) ? data.likelySource : 'unclear',
      confidence: ['low', 'medium', 'high'].includes(data.confidence) ? data.confidence : 'low',
      reasoning: str(data.reasoning, 800),
      questionsForStaff: (data.questionsForStaff || []).map((q: any) => str(q, 200)).filter(Boolean).slice(0, 4),
      recommendedActions: (data.recommendedActions || []).map((q: any) => str(q, 200)).filter(Boolean).slice(0, 4),
    };
  } catch (error) {
    console.log('Complaint review failed:', error instanceof Error ? error.message : String(error));
    return { status: 'failed', at: new Date().toISOString(), error: error instanceof Error ? error.message.slice(0, 200) : 'Bunny could not read it' };
  }
}

// Who should explain, from where it most likely came from.
function proposePeople(ev: any, source: string) {
  const pick = new Map<string, { id: string; name: string; why: string }>();
  const addAll = (list: any[], why: string) => list.forEach((p) => { if (!pick.has(p.id)) pick.set(p.id, { id: p.id, name: p.name, why }); });
  if (source === 'store' || source === 'delivery') { addAll(ev.storeIncharges, 'store incharge'); addAll(ev.storeOnShift, 'at the store that day'); }
  else if (source === 'production') { addAll(ev.productionIncharges, 'production incharge'); addAll(ev.productionOnShift, 'in production that day or the day before'); }
  else { addAll(ev.storeIncharges, 'store incharge'); addAll(ev.productionIncharges, 'production incharge'); }
  return [...pick.values()];
}

// ---------------- Routes ----------------
export function registerComplaintRoutes(app: any, deps: ComplaintDeps) {
  const actorOf = async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const m = auth.user.user_metadata || {};
    const isLead = m.role === 'cluster_head' || (m.role === 'manager' && m.designation !== 'store_incharge' && m.designation !== 'production_incharge');
    return { user: auth.user, employeeId: m.employeeId ? String(m.employeeId) : null, name: m.name || auth.user.email || 'Someone', isLead, isOwner: m.role === 'cluster_head' };
  };
  const fail = (c: any, err: any) => {
    console.log('[complaints]', err?.message || 'error');
    return c.json({ error: 'Something went wrong - try again' }, 500);
  };
  const withPhotos = async (c: any) => {
    const paths = (c.photos || []).map((p: any) => p.path);
    if (!paths.length) return { ...c, photoUrls: [] };
    try {
      const { data } = await deps.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
      return { ...c, photoUrls: (data || []).map((d: any) => d?.signedUrl || null) };
    } catch { return { ...c, photoUrls: [] }; }
  };
  const tell = async (employeeIds: string[], type: string, title: string, message: string, relatedId: string, date: string) => {
    for (const id of employeeIds) {
      const e = await deps.kv.get(`unified-employee:${id}`);
      if (e?.authUserId) await deps.notifyUser(e.authUserId, type, title, message, relatedId, date).catch(() => undefined);
    }
  };
  const headline = (c: any) => `${c.rating ? `${c.rating}★ ` : ''}${({ zomato: 'Zomato', swiggy: 'Swiggy', google: 'Google review', walk_in: 'Walk-in', phone: 'Phone call', other: 'Customer' } as any)[c.source] || 'Customer'} complaint`;

  // The owner and operations managers see every complaint; anyone asked to explain sees theirs.
  app.get(`${P}/complaints`, async (c: any) => {
    const a: any = await actorOf(c);
    if (a.error) return a.error;
    try {
      const rows = (await deps.getAllByPrefix('complaint:')).filter((x: any) => x?.id);
      const mine = (x: any) => !!a.employeeId && (x.asked || []).some((p: any) => p.id === a.employeeId);
      const list = rows.filter((x: any) => a.isLead || mine(x)).sort((x: any, y: any) => String(y.createdAt).localeCompare(String(x.createdAt)));
      return c.json({ complaints: await Promise.all(list.map(withPhotos)), canManage: a.isLead, me: a.employeeId });
    } catch (err) { return fail(c, err); }
  });

  app.post(`${P}/complaints`, async (c: any) => {
    const a: any = await actorOf(c);
    if (a.error) return a.error;
    if (!a.isLead) return c.json({ error: 'Only the owner and operations managers log complaints' }, 403);
    try {
      const body = await c.req.json().catch(() => ({}));
      const source = COMPLAINT_SOURCES.includes(body.source) ? body.source : 'other';
      const rating = Number(body.rating);
      const orderDate = DATE.test(String(body.orderDate || '')) ? body.orderDate : deps.getTodayIST();
      const storeId = str(body.storeId, 80);
      if (!storeId) return c.json({ error: 'Pick the store' }, 400);
      const customerText = str(body.customerText, 2000);
      const ownerNote = str(body.ownerNote, 1000);
      const photosIn = (Array.isArray(body.photos) ? body.photos : []).slice(0, MAX_PHOTOS).map(parseDataUrl);
      if (photosIn.some((p: any) => !p)) return c.json({ error: 'A photo could not be read or is too big' }, 400);
      if (!customerText && !photosIn.length) return c.json({ error: 'Add what the customer said or a photo' }, 400);
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const photos: any[] = [];
      if (photosIn.length) {
        await ensureBucket(deps.storage);
        for (let i = 0; i < photosIn.length; i++) {
          const ph = photosIn[i]!;
          const path = `${id}/${i + 1}.${ph.mediaType.split('/')[1]}`;
          const { error } = await deps.storage.from(BUCKET).upload(path, ph.bytes, { contentType: ph.mediaType, upsert: false });
          if (error) throw new Error(error.message);
          photos.push({ path, uploadedAt: new Date().toISOString() });
        }
      }
      const evidence = await gatherEvidence(deps, storeId, orderDate);
      const complaint: any = {
        id, createdAt: new Date().toISOString(), createdBy: a.name, source, rating: rating >= 1 && rating <= 5 ? Math.round(rating) : null,
        orderDate, storeId, customerText, ownerNote, photos, evidence, status: 'open', asked: [], explanations: {},
        ai: { status: 'pending', at: new Date().toISOString() }, proposed: proposePeople(evidence, 'unclear'),
      };
      await deps.kv.set(`complaint:${id}`, complaint);
      // Saved and answered at once; Bunny reads it afterwards and tells whoever logged it.
      const images = photosIn.map((p: any) => ({ base64: p.base64, mediaType: p.mediaType }));
      await inBackground('Complaint review', async () => {
        const ai = await analyse(deps, complaint, images);
        const latest = (await deps.kv.get(`complaint:${id}`)) || complaint;
        latest.ai = ai;
        if (!latest.asked?.length) latest.proposed = proposePeople(latest.evidence, ai.likelySource || 'unclear');
        await deps.kv.set(`complaint:${id}`, latest);
        await deps.notifyUser(a.user.id, 'complaint_read', ai.status === 'done' ? `Bunny has read it: ${headline(latest)}` : `Bunny could not read it: ${headline(latest)}`,
          ai.status === 'done' ? `${ai.summary || ''} Open it to ask the people concerned to explain.`.trim() : 'Open the complaint and tap Try again.', id, latest.orderDate).catch(() => undefined);
      });
      return c.json({ complaint: await withPhotos(complaint) });
    } catch (err) { return fail(c, err); }
  });

  // Read it again (Bunny failed, or more was learned): the photos are fetched back from storage.
  app.post(`${P}/complaints/:id/analyse`, async (c: any) => {
    const a: any = await actorOf(c);
    if (a.error) return a.error;
    if (!a.isLead) return c.json({ error: 'Only the owner and operations managers can do this' }, 403);
    try {
      const key = `complaint:${c.req.param('id')}`;
      const cmp = await deps.kv.get(key);
      if (!cmp) return c.json({ error: 'Complaint not found' }, 404);
      const images: { base64: string; mediaType: string }[] = [];
      for (const ph of (cmp.photos || []).slice(0, 4)) {
        const { data } = await deps.storage.from(BUCKET).download(ph.path);
        if (!data) continue;
        const buf = new Uint8Array(await data.arrayBuffer());
        let bin = '';
        for (let i = 0; i < buf.length; i += 0x8000) bin += String.fromCharCode(...buf.subarray(i, i + 0x8000));
        images.push({ base64: btoa(bin), mediaType: data.type || 'image/jpeg' });
      }
      cmp.evidence = await gatherEvidence(deps, cmp.storeId, cmp.orderDate);
      cmp.ai = await analyse(deps, cmp, images);
      cmp.proposed = proposePeople(cmp.evidence, cmp.ai.likelySource || 'unclear');
      await deps.kv.set(key, cmp);
      return c.json({ complaint: await withPhotos(cmp) });
    } catch (err) { return fail(c, err); }
  });

  // Ask people to explain: a notification and a task on their Home until they answer.
  app.post(`${P}/complaints/:id/ask`, async (c: any) => {
    const a: any = await actorOf(c);
    if (a.error) return a.error;
    if (!a.isLead) return c.json({ error: 'Only the owner and operations managers can do this' }, 403);
    try {
      const key = `complaint:${c.req.param('id')}`;
      const cmp = await deps.kv.get(key);
      if (!cmp) return c.json({ error: 'Complaint not found' }, 404);
      const body = await c.req.json().catch(() => ({}));
      const ids: string[] = [...new Set((Array.isArray(body.employeeIds) ? body.employeeIds : []).map(String))].slice(0, 12) as string[];
      if (!ids.length) return c.json({ error: 'Pick who must explain' }, 400);
      const people = await Promise.all(ids.map(async (id) => ({ id, e: await deps.kv.get(`unified-employee:${id}`) })));
      const fresh = people.filter((p) => p.e && !(cmp.asked || []).some((x: any) => x.id === p.id)).map((p) => ({ id: p.id, name: String(p.e.name || p.id), askedAt: new Date().toISOString() }));
      cmp.asked = [...(cmp.asked || []), ...fresh];
      cmp.status = 'awaiting';
      if (body.note) cmp.askNote = str(body.note, 500);
      await deps.kv.set(key, cmp);
      const issue = cmp.ai?.summary || cmp.customerText.slice(0, 120) || 'a customer complaint';
      await tell(fresh.map((p) => p.id), 'complaint_explain', `${headline(cmp)}: please explain`,
        `${issue} (order ${cmp.orderDate}). Open Home and say what happened.`, cmp.id, cmp.orderDate);
      return c.json({ complaint: await withPhotos(cmp) });
    } catch (err) { return fail(c, err); }
  });

  // The person's explanation.
  app.post(`${P}/complaints/:id/explain`, async (c: any) => {
    const a: any = await actorOf(c);
    if (a.error) return a.error;
    try {
      const key = `complaint:${c.req.param('id')}`;
      const cmp = await deps.kv.get(key);
      if (!cmp) return c.json({ error: 'Complaint not found' }, 404);
      if (!a.employeeId || !(cmp.asked || []).some((p: any) => p.id === a.employeeId)) return c.json({ error: 'You were not asked about this complaint' }, 403);
      if (cmp.status === 'closed') return c.json({ error: 'This complaint is already decided' }, 409);
      const body = await c.req.json().catch(() => ({}));
      const text = str(body.text, 1500);
      if (text.length < 5) return c.json({ error: 'Write what happened' }, 400);
      cmp.explanations = { ...(cmp.explanations || {}), [a.employeeId]: { text, at: new Date().toISOString(), name: a.name } };
      await deps.kv.set(key, cmp);
      // Tell the owner when everyone asked has answered.
      if ((cmp.asked || []).every((p: any) => cmp.explanations[p.id])) {
        const owners = (await deps.kv.getByPrefix('unified-employee:')).filter((e: any) => e?.role === 'cluster_head' && e.authUserId);
        for (const o of owners) await deps.notifyUser(o.authUserId, 'complaint_answered', `${headline(cmp)}: everyone has explained`, 'Open Customer complaints to decide.', cmp.id, cmp.orderDate).catch(() => undefined);
      }
      return c.json({ ok: true });
    } catch (err) { return fail(c, err); }
  });

  // The owner's decision: upheld with points off each person's monthly KPI total, or not our fault.
  app.post(`${P}/complaints/:id/decide`, async (c: any) => {
    const a: any = await actorOf(c);
    if (a.error) return a.error;
    if (!a.isLead) return c.json({ error: 'Only the owner and operations managers can decide' }, 403);
    try {
      const key = `complaint:${c.req.param('id')}`;
      const cmp = await deps.kv.get(key);
      if (!cmp) return c.json({ error: 'Complaint not found' }, 404);
      const body = await c.req.json().catch(() => ({}));
      const upheld = !!body.upheld;
      const penalties: Record<string, number> = {};
      if (upheld) {
        for (const [id, pts] of Object.entries(body.penalties || {})) {
          const n = Math.round(Number(pts));
          if (Number.isFinite(n) && n > 0 && n <= 50) penalties[String(id)] = n;
        }
        if (!Object.keys(penalties).length) return c.json({ error: 'Set the points off for at least one person' }, 400);
      }
      cmp.decision = { upheld, penalties, note: str(body.note, 800), by: a.name, at: new Date().toISOString() };
      cmp.status = 'closed';
      await deps.kv.set(key, cmp);
      const asked = (cmp.asked || []).map((p: any) => p.id);
      for (const id of new Set([...asked, ...Object.keys(penalties)])) {
        const pts = penalties[id];
        await tell([id], 'complaint_decided', upheld && pts ? `${headline(cmp)}: ${pts} KPI points off` : `${headline(cmp)}: closed`,
          upheld && pts ? `The complaint from ${cmp.orderDate} was upheld.${cmp.decision.note ? ` ${cmp.decision.note}` : ''}` : `The complaint from ${cmp.orderDate} was closed without a penalty for you.`, cmp.id, cmp.orderDate);
      }
      return c.json({ complaint: await withPhotos(cmp) });
    } catch (err) { return fail(c, err); }
  });
}
