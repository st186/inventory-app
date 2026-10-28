// Workplace checks (owner, 27 Oct 2026): photo proof, at set times each day, that every area is
// clean and in order. Around 3-4 PM the store worker photographs the fryer, steamer, crates,
// freezer, back area, shop front, kitchen, fan and lights; production staff the folding table,
// post-steaming table, surfaces, walls and equipment. Each photo is scored for hygiene by the AI
// (insights.ts aiScorePhoto) and kept in the owner's Google Drive (gdrive.ts) - or, until Drive is
// set up, in a private Supabase bucket that keeps 60 days. Registered from index.ts.
// Owner, 28 Oct 2026: taking the photos should be a two-minute job. A photo is saved and answered
// at once and the AI looks at it afterwards (inBackground; the 15-minute cron picks up any left
// behind); the person is told when their round of photos is checked (resultPush). A check can
// hold several photos (walls, shelves, stacks of crates), each retaken or removed on its own.
//
// KV:
//   workplace-template:{store|production}:{locationId}  one location's checklist (who, when, which days)
//   workplace-check:{date}:{employeeId}                 one person's day - the KPI feature reads this shape
//   workplace-sent:{date}                               reminders already sent that day (cron)
//   workplace-results-sent:{date}:{employeeId}          when the person was last told their photos were checked
//   push-photo:{token}                                  a photo shown inside a push notification (a day; pushPhotoUrl)
//   workplace-settings                                  AI scoring on/off and the auto-flag score
// Event stalls (events.ts) are a third kind of place, 'event': on the event days the incharge gets
// a short stall checklist by default (or the one the owner saves for that event).
// Photos: Drive "Workplace photos/YYYY-MM/YYYY-MM-DD/<location name>/" (+ "thumbs/"), or bucket
// workplace-photos at {date}/{kind}-{locationId}/{employeeId}/{itemId}-{timestamp}.jpg.
// Nobody gets a public link: photos are streamed through GET /workplace/photo to people allowed
// to see them.

import { aiScorePhoto } from './insights.ts';
import { driveConfigured, ensureDriveFolder, uploadDriveFile, downloadDriveFile } from './gdrive.ts';
import { AI_KEYS, isLow, photosOf, rollUp, settleFlag, type Photo } from './workplacePhotos.ts';
import { inBackground } from './background.ts';

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  del: (key: string) => Promise<any>;
  getByPrefix: <T = any>(prefix: string) => Promise<T[]>;
  mget?: <T = any>(keys: string[]) => Promise<T[]>;
};
type Deps = {
  kv: Kv;
  verifyUser: (authHeader: string | null) => Promise<any>;
  getTodayIST: () => string;
  notifyUser: (authUserId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string,
    quickAction?: { recordType: 'workplace_photo'; recordId: string }, extras?: { imageUrl?: string }) => Promise<any>;
  getAllClusterHeads: () => Promise<any[]>;
  storage: any; // service-role Supabase Storage client, used only when Drive isn't set up
};

type LocationKind = 'store' | 'production' | 'event';
// coverId: who takes the photo on a day the assignee is on leave (see coverOn). from: the first day
// it's due, so a check added after the day's window doesn't count as missed that day.
type TemplateItem = { id: string; name: string; nameBn: string; hint?: string; assigneeId: string | null; coverId?: string | null; start: string; end: string; days: number[]; from?: string };
// activeFrom/activeTo: an event's checklist only applies on the event days (taken from the event).
type Template = { locationKind: LocationKind; locationId: string; items: TemplateItem[]; updatedAt?: string; updatedBy?: string; activeFrom?: string; activeTo?: string };
type Assigned = { id: string; name: string; nameBn: string; hint?: string; start: string; end: string; locationKind: LocationKind; locationId: string; coveringFor?: string; coveringForName?: string };
type Flag = { status: 'ok' | 'needs_cleaning'; note: string; by: string; byId?: string; at: string; auto?: boolean; fixedAt?: string };
type CheckItem = {
  name: string; nameBn?: string; path: string; uploadedAt: string; late: boolean; flag?: Flag;
  locationKind: LocationKind; locationId: string; firstUploadedAt?: string; retakes?: number;
  wasFlagged?: boolean; // a reviewer marked it needs-cleaning at some point (kept for KPIs after it's fixed)
  aiSevere?: boolean; // the AI saw a garbage dump, overflowing waste, pests or filth in this photo
  wasSevere?: boolean; // ... in this or an earlier photo of the day (kept after a clean retake: the incharge's KPI)
  onBehalf?: boolean; uploadedById?: string; uploadedByName?: string;
  storage: 'drive' | 'bucket'; driveFileId?: string; driveThumbId?: string; thumbPath?: string; mimeType: string;
  aiStatus?: 'pending' | 'scored' | 'failed' | 'off'; aiScore?: number; aiVerdict?: string;
  aiIssues?: string[]; aiIssuesBengali?: string[]; aiShown?: string; aiAt?: string;
  // Every photo of the check, first one the cover. The storage and AI fields above are a roll-up
  // of these (rollUp) so the KPI, review and complaint readers still see one answer per check.
  // Rows from before several photos were allowed have none: photosOf reads them as one.
  photos?: Photo[];
};
type CheckRow = {
  date: string; employeeId: string; locationKind: LocationKind | null; locationId: string | null;
  items: Record<string, CheckItem>; required: number; done: number; onTime: number;
  assigned?: Assigned[]; // what was on the person's list that day (for "missed" after the day ends)
  updatedAt?: string;
};
type Settings = { aiEnabled: boolean; aiThreshold: number; updatedAt?: string; updatedBy?: string };
type Loc = {
  kind: LocationKind; id: string; name: string; productionHouseId?: string | null; productionHeadId?: string | null;
  // events only
  inchargeId?: string | null; staffIds?: string[]; startDate?: string; endDate?: string; closed?: boolean;
};
type Locations = { stores: Loc[]; houses: Loc[]; events: Loc[] };

const P = '/make-server-c2dd9b9d';
const BUCKET = 'workplace-photos';
const MAX_PHOTO_BYTES = 1.5 * 1024 * 1024; // the app sends ~200-400 KB JPEGs (1280 px, quality 0.7)
const MAX_THUMB_BYTES = 200 * 1024; // ~320 px thumbnail made by the app alongside the photo
const MAX_DATA_URL_CHARS = Math.ceil((MAX_PHOTO_BYTES * 4) / 3) + 64;
const EARLY_UPLOAD_MINUTES = 30; // a photo hours before the window proves nothing about 3-4 PM
const MAX_RETAKES = 10; // per item per day, so a stuck camera button can't fill the storage
const MAX_PHOTOS = 6; // per check: a few walls or shelves, not an album
const STUCK_PENDING_MINUTES = 3; // a photo still waiting for the AI this long after upload is scored by the cron
const LEFTOVERS_PER_RUN = 6; // ... at most this many per cron run
const KEEP_BUCKET_DAYS = 60; // bucket fallback only - Drive photos are kept
const MAX_ITEMS = 40;
const MAX_RANGE_DAYS = 31;
const AI_TIMEOUT_MS = 45_000;
const DEFAULT_SETTINGS: Settings = { aiEnabled: true, aiThreshold: 6 };
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// ---------------- Time (IST) ----------------
const istNow = () => new Date(Date.now() + 330 * 60000);
const nowMinutesIST = () => { const d = istNow(); return d.getUTCHours() * 60 + d.getUTCMinutes(); };
const toMin = (t: string) => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const weekdayOf = (date: string) => new Date(`${date}T00:00:00Z`).getUTCDay();
function addDays(date: string, n: number) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function datesBetween(from: string, to: string) {
  const out: string[] = [];
  for (let d = from; d <= to && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}
function fmt12(t: string) {
  const h = Number(t.slice(0, 2)); const m = t.slice(3, 5);
  return `${h % 12 || 12}${m === '00' ? '' : `:${m}`} ${h >= 12 ? 'PM' : 'AM'}`;
}
const bnDigits = (s: string) => s.replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[Number(d)]);
// "by 4 PM" in Bengali: "৪টের মধ্যে", "৪:৩০-এর মধ্যে".
function bnBy(t: string) {
  const h = Number(t.slice(0, 2)) % 12 || 12; const m = t.slice(3, 5);
  return m === '00' ? `${bnDigits(String(h))}টের মধ্যে` : `${bnDigits(`${h}:${m}`)}-এর মধ্যে`;
}

// ---------------- Keys and small helpers ----------------
const templateKey = (kind: LocationKind, id: string) => `workplace-template:${kind}:${id}`;
const checkKey = (date: string, employeeId: string) => `workplace-check:${date}:${employeeId}`;
const sentKey = (date: string) => `workplace-sent:${date}`;
const resultsSentKey = (date: string, employeeId: string) => `workplace-results-sent:${date}:${employeeId}`;
const SETTINGS_KEY = 'workplace-settings';
const safeSeg = (s: string) => String(s || '').replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 60) || 'x';
const str = (v: unknown, max: number) => String(v ?? '').trim().slice(0, max);
const isKind = (k: unknown): k is LocationKind => k === 'store' || k === 'production' || k === 'event';
const empIdOf = (e: any) => String(e?.employeeId || e?.id || '');
const randomId = () => Math.random().toString(36).slice(2, 6);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 24) || 'check';
const atLocation = (x: { locationKind?: string | null; locationId?: string | null }, kind: string, id: string) => x.locationKind === kind && x.locationId === id;

// mget sends the keys in the request URL, so long ranges go in chunks.
async function mgetRows<T>(kv: Pick<Kv, 'get' | 'mget'>, keys: string[]): Promise<T[]> {
  const out: T[] = [];
  for (let i = 0; i < keys.length; i += 50) {
    const chunk = keys.slice(i, i + 50);
    const got = kv.mget ? await kv.mget<T>(chunk) : await Promise.all(chunk.map((k) => kv.get<T>(k)));
    out.push(...((got || []).filter(Boolean) as T[]));
  }
  return out;
}

async function inBatches<T, R>(list: T[], size: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < list.length; i += size) out.push(...(await Promise.all(list.slice(i, i + size).map(fn))));
  return out;
}

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error('timed out')), ms);
    p.then((v) => { clearTimeout(t); resolve(v); }, (e) => { clearTimeout(t); reject(e); });
  });
}

// ---------------- Default checklists ----------------
// [slug, English, Bengali, hint]. Unassigned until the owner picks a person for each.
const DEFAULT_ITEMS: Record<LocationKind, [string, string, string, string][]> = {
  store: [
    ['fryer', 'Fryer', 'ফ্রায়ার', 'Oil filtered, outside and stand wiped · তেল ছাঁকা, বাইরে মোছা'],
    ['steamer', 'Steamer', 'স্টিমার', 'Trays and water area clean · ট্রে ও জলের জায়গা পরিষ্কার'],
    ['momo-crates', 'Momo crates', 'মোমোর ক্রেট', 'Washed, dry, stacked · ধোয়া, শুকনো, সাজানো'],
    ['freezer', 'Freezer', 'ফ্রিজার', 'Door seal clean, packs closed · দরজার রাবার পরিষ্কার, প্যাকেট বন্ধ'],
    ['garbage-area', 'Garbage / back area', 'ময়লা রাখার পিছনের জায়গা', 'Bins covered, floor swept · ডাস্টবিন ঢাকা, মেঝে ঝাঁট দেওয়া'],
    ['shop-front', 'Shop front', 'দোকানের সামনে', 'Entrance and counter clean · ঢোকার জায়গা ও কাউন্টার পরিষ্কার'],
    ['kitchen-area', 'Kitchen area', 'রান্নাঘর', 'Floor and corners · মেঝে ও কোণ'],
    ['kitchen-table', 'Kitchen table', 'রান্নাঘরের টেবিল', ''],
    ['kitchen-surface', 'Kitchen surface', 'রান্নাঘরের তাক ও কাউন্টার', 'Dry, no food bits · শুকনো, খাবারের টুকরো নেই'],
    ['dining-fan', 'Dining area fan', 'বসার জায়গার পাখা', 'Blades dust-free · পাখার ব্লেডে ধুলো নেই'],
    ['lights', 'Lights', 'লাইট', 'No dust or cobwebs · ধুলো বা ঝুল নেই'],
  ],
  production: [
    ['folding-table', 'Folding table', 'মোমো মোড়ানোর টেবিল', 'No dough or flour left · ময়দা বা আটা পড়ে নেই'],
    ['post-steam-table', 'Post-steaming table', 'ভাপানোর পরে মোমো রাখার টেবিল', ''],
    ['work-surfaces', 'Work surfaces', 'কাজের জায়গা ও তাক', 'Dry, no food bits · শুকনো, খাবারের টুকরো নেই'],
    ['walls', 'Walls', 'দেওয়াল', 'No stains or cobwebs · দাগ বা ঝুল নেই'],
    ['steamer', 'Steamer', 'স্টিমার', 'No stuck dough · আটকে থাকা ময়দা নেই'],
    ['freezer', 'Freezer', 'ফ্রিজার', 'Door seal clean, no ice build-up · দরজার রাবার পরিষ্কার, বরফ জমেনি'],
    ['other-equipment', 'Other equipment', 'অন্যান্য যন্ত্রপাতি', 'Utensils, trays and small tools · বাসন, ট্রে ও ছোট যন্ত্রপাতি'],
    ['crates', 'Crates', 'ক্রেট', 'Washed, dry, stacked · ধোয়া, শুকনো, সাজানো'],
    ['containers', 'Containers', 'কন্টেনার', 'Washed, dry, lids on · ধোয়া, শুকনো, ঢাকনা লাগানো'],
    ['dough-kneader', 'Dough kneader', 'আটা মাখার মেশিন', 'Bowl and blade clean, no dough stuck · বাটি ও ব্লেড পরিষ্কার, আটা লেগে নেই'],
    ['sheet-roller', 'Momo sheet roller', 'মোমো শিট রোলার', 'Rollers clean, no dough or flour built up · রোলার পরিষ্কার, আটা জমে নেই'],
    ['onion-slicer', 'Onion slicer', 'পেঁয়াজ কাটার মেশিন', 'Blades and tray clean, no peel left · ব্লেড ও ট্রে পরিষ্কার, খোসা পড়ে নেই'],
    ['fridge-outside', 'Fridge (outside)', 'ফ্রিজ (বাইরে)', 'Door, handle, seal and top wiped · দরজা, হাতল, রাবার ও ওপর মোছা'],
    ['fridge-inside', 'Fridge (inside)', 'ফ্রিজ (ভেতরে)', 'Shelves clean, food covered, nothing spilt · তাক পরিষ্কার, খাবার ঢাকা, কিছু পড়ে নেই'],
    ['mixer-grinder', 'Mixer grinder', 'মিক্সার গ্রাইন্ডার', 'Jars and blades washed, base wiped · জার ও ব্লেড ধোয়া, নিচটা মোছা'],
  ],
  event: [
    ['stall-front', 'Stall front and counter', 'স্টলের সামনে ও কাউন্টার', 'Counter wiped, banner straight · কাউন্টার মোছা, ব্যানার সোজা'],
    ['steamer', 'Steamer', 'স্টিমার', 'Trays and water area clean · ট্রে ও জলের জায়গা পরিষ্কার'],
    ['serving-area', 'Serving area', 'পরিবেশনের জায়গা', 'Plates and sauces covered · প্লেট ও সস ঢাকা'],
    ['cooking-area', 'Gas / fryer area', 'গ্যাস ও ফ্রায়ারের জায়গা', 'No oil spills · তেল পড়ে নেই'],
    ['bins', 'Bins', 'ডাস্টবিন', 'Covered, not overflowing · ঢাকা, উপচে পড়ছে না'],
  ],
};

// Ids get a random tail so the same check at two locations never shares an id in someone's day.
function defaultTemplate(kind: LocationKind, id: string): Template {
  return {
    locationKind: kind,
    locationId: id,
    items: DEFAULT_ITEMS[kind].map(([s, name, nameBn, hint]) => ({
      id: `${s}-${randomId()}`, name, nameBn, ...(hint ? { hint } : {}), assigneeId: null, start: '15:00', end: '16:00', days: [...ALL_DAYS],
    })),
  };
}

// An event's checklist: the saved one, or the default stall checklist given to the event incharge
// (ids fixed per event, so photos sent today still match it tomorrow), on the event days only.
function eventTemplate(saved: Template | null, ev: Loc): Template {
  const tail = ev.id.slice(-6).toLowerCase().replace(/[^a-z0-9]/g, '') || 'event';
  const base: Template = saved || {
    locationKind: 'event', locationId: ev.id,
    items: DEFAULT_ITEMS.event.map(([sl, name, nameBn, hint]) => ({
      id: `${sl}-${tail}`, name, nameBn, ...(hint ? { hint } : {}), assigneeId: ev.inchargeId || null, start: '16:00', end: '17:00', days: [...ALL_DAYS],
    })),
  };
  return { ...base, activeFrom: ev.startDate, activeTo: ev.endDate };
}

async function loadEventLocs(kv: Kv): Promise<Loc[]> {
  const rows = (await kv.getByPrefix<any>('event:')) || [];
  return rows.filter((e) => e?.id && String(e.id).startsWith('EVENT-') && e?.name).map((e) => ({
    kind: 'event' as const, id: String(e.id), name: String(e.name), inchargeId: e.inchargeId || null, staffIds: Array.isArray(e.staffIds) ? e.staffIds.map(String) : [],
    startDate: e.startDate, endDate: e.endDate, closed: !!e.closedAt || e.status === 'closed',
  }));
}

async function loadTemplate(kv: Kv, kind: LocationKind, id: string): Promise<Template | null> {
  const t = await kv.get<Template>(templateKey(kind, id));
  const saved = t && Array.isArray(t.items) ? t : null;
  if (kind !== 'event') return saved;
  const ev = (await loadEventLocs(kv)).find((e) => e.id === id);
  return ev ? eventTemplate(saved, ev) : saved;
}

async function loadAllTemplates(kv: Kv): Promise<Template[]> {
  const [rows, events] = await Promise.all([kv.getByPrefix<Template>('workplace-template:'), loadEventLocs(kv)]);
  const saved = (rows || []).filter((t) => t && isKind(t.locationKind) && t.locationId && Array.isArray(t.items));
  const open = new Map(events.filter((e) => !e.closed).map((e) => [e.id, e]));
  const out = saved.filter((t) => t.locationKind !== 'event');
  // Open events only: their saved checklist or the default one, with the event days.
  for (const ev of open.values()) out.push(eventTemplate(saved.find((t) => t.locationKind === 'event' && t.locationId === ev.id) || null, ev));
  return out;
}

// Cover for someone away (owner, 28 Oct 2026: who takes the photos when that person is on leave): on a
// day a person has approved full-day leave, each of their checks goes to the check's "if away"
// person, else the place's incharge, else someone else who works there (that kind of staff first).
// The person on leave has nothing due that day, so nothing counts as missed for them.
type Cover = { away: Set<string>; fallback: (t: Template, assigneeId: string) => string | null; names: Map<string, string> };
type CoverInputs = { leaves: any[]; employees: any[]; locs: Locations };

async function loadCoverInputs(kv: Kv, employees?: any[], locs?: Locations): Promise<CoverInputs> {
  const [leaves, emps, places] = await Promise.all([kv.getByPrefix<any>('leave:'), employees || loadEmployees(kv), locs || loadLocations(kv)]);
  return { leaves: leaves || [], employees: emps, locs: places };
}

function coverOn(inputs: CoverInputs, date: string): Cover {
  const { leaves, employees, locs } = inputs;
  const away = new Set<string>();
  for (const l of leaves) {
    if (l?.status === 'approved' && String(l.leaveDate || '').slice(0, 10) === date && l.leaveType !== 'half' && l.employeeId) away.add(String(l.employeeId));
  }
  const names = new Map(employees.map((e) => [empIdOf(e), String(e.name || empIdOf(e))]));
  const candidates = new Map<string, string[]>();
  const candidatesOf = (t: Template) => {
    const key = `${t.locationKind}:${t.locationId}`;
    if (candidates.has(key)) return candidates.get(key)!;
    let list: string[];
    if (t.locationKind === 'event') {
      const ev = findLoc(locs, 'event', t.locationId);
      list = [ev?.inchargeId, ...(ev?.staffIds || [])].filter(Boolean).map(String);
    } else {
      const incharges = inchargesOf(employees, t.locationKind, t.locationId, locs).map(empIdOf);
      const prefix = t.locationKind === 'store' ? 'store_' : 'production_';
      const staff = employees
        .filter((e) => e.status !== 'inactive' && e.designation !== 'rider' && !['cluster_head', 'audit'].includes(e.role) && worksAt(e, t.locationKind, t.locationId, locs))
        .sort((a, b) => Number(!String(a.designation || '').startsWith(prefix)) - Number(!String(b.designation || '').startsWith(prefix)) || String(a.name).localeCompare(String(b.name)))
        .map(empIdOf);
      list = [...incharges, ...staff];
    }
    candidates.set(key, list);
    return list;
  };
  return { away, names, fallback: (t, assigneeId) => candidatesOf(t).find((id) => id && id !== assigneeId && !away.has(id)) || null };
}

// Who has which check on a date (with cover, the person standing in for someone on leave).
function assignedOn(templates: Template[], date: string, employeeId?: string, cover?: Cover): (Assigned & { assigneeId: string })[] {
  const wd = weekdayOf(date);
  const out: (Assigned & { assigneeId: string })[] = [];
  for (const t of templates) {
    if ((t.activeFrom && date < t.activeFrom) || (t.activeTo && date > t.activeTo)) continue;
    for (const it of t.items) {
      if (!it.assigneeId || !(it.days || ALL_DAYS).includes(wd) || (it.from && date < it.from)) continue;
      let who = it.assigneeId;
      let coveringFor: string | undefined;
      if (cover?.away.has(who)) {
        const stand = (it.coverId && !cover.away.has(it.coverId) ? it.coverId : null) || cover.fallback(t, who);
        if (stand && stand !== who) { coveringFor = who; who = stand; }
      }
      if (employeeId && who !== employeeId) continue;
      out.push({
        id: it.id, name: it.name, nameBn: it.nameBn, ...(it.hint ? { hint: it.hint } : {}), start: it.start, end: it.end,
        locationKind: t.locationKind, locationId: t.locationId, assigneeId: who,
        ...(coveringFor ? { coveringFor, coveringForName: cover!.names.get(coveringFor) || coveringFor } : {}),
      });
    }
  }
  return out.sort((a, b) => a.start.localeCompare(b.start));
}
const stripAssignee = ({ assigneeId: _a, ...rest }: Assigned & { assigneeId?: string }): Assigned => rest;

// ---------------- One person's day ----------------
function recount(row: CheckRow) {
  const uploaded = Object.keys(row.items || {});
  row.required = new Set([...(row.assigned || []).map((a) => a.id), ...uploaded]).size;
  row.done = uploaded.length;
  row.onTime = uploaded.filter((k) => !row.items[k].late).length;
}

function syncRow(row: CheckRow | null, date: string, employeeId: string, assigned: Assigned[]): CheckRow {
  const next: CheckRow = row
    ? { ...row, items: { ...(row.items || {}) } }
    : { date, employeeId, locationKind: assigned[0]?.locationKind || null, locationId: assigned[0]?.locationId || null, items: {}, required: 0, done: 0, onTime: 0 };
  next.assigned = assigned;
  if (!next.locationKind && assigned[0]) { next.locationKind = assigned[0].locationKind; next.locationId = assigned[0].locationId; }
  recount(next);
  return next;
}

const rowChanged = (a: CheckRow | null, b: CheckRow) =>
  !a || a.required !== b.required || a.done !== b.done || a.onTime !== b.onTime || JSON.stringify(a.assigned || []) !== JSON.stringify(b.assigned || []);

type Status = 'done' | 'done_late' | 'upcoming' | 'due' | 'late' | 'missed';
// late = window over and no photo yet (still accepted today, marked late); missed = day over.
function statusOf(date: string, today: string, nowMin: number, a: { start: string; end: string }, uploaded?: CheckItem): Status {
  if (uploaded) return uploaded.late ? 'done_late' : 'done';
  if (date < today) return 'missed';
  if (date > today || !a.start) return 'upcoming';
  if (nowMin < toMin(a.start)) return 'upcoming';
  if (nowMin <= toMin(a.end)) return 'due';
  return 'late';
}

// The parts of a stored item a screen needs (no storage ids).
function itemView(it?: CheckItem) {
  if (!it) return { hasPhoto: false };
  return {
    hasPhoto: true, uploadedAt: it.uploadedAt, late: it.late, retakes: it.retakes || 0,
    onBehalf: !!it.onBehalf, uploadedByName: it.onBehalf ? it.uploadedByName : undefined,
    flag: it.flag || null, aiStatus: it.aiStatus || 'off', aiScore: it.aiScore ?? null, aiVerdict: it.aiVerdict || null,
    aiIssues: it.aiIssues || [], aiIssuesBengali: it.aiIssuesBengali || [], aiShown: it.aiShown || '',
    photos: photosOf(it).map((p) => ({
      id: p.id, uploadedAt: p.uploadedAt, aiStatus: p.aiStatus || 'off', aiScore: p.aiScore ?? null, aiVerdict: p.aiVerdict || null,
      aiIssues: p.aiIssues || [], aiIssuesBengali: p.aiIssuesBengali || [], aiShown: p.aiShown || '', aiSevere: !!p.aiSevere,
    })),
  };
}

// ---------------- Several photos per check (rules in workplacePhotos.ts) ----------------
const newPhotoId = () => `p${Date.now().toString(36)}${randomId()}`;

// ---------------- People, places and permissions ----------------
async function loadEmployees(kv: Kv): Promise<any[]> {
  return ((await kv.getByPrefix<any>('unified-employee:')) || []).filter((e) => empIdOf(e));
}

async function loadLocations(kv: Kv): Promise<Locations> {
  const [stores, houses, events] = await Promise.all([kv.getByPrefix<any>('store:'), kv.getByPrefix<any>('production_house_'), loadEventLocs(kv)]);
  return {
    stores: (stores || []).filter((s) => s?.id && s?.name).map((s) => ({ kind: 'store' as const, id: String(s.id), name: String(s.name), productionHouseId: s.productionHouseId || null })),
    houses: (houses || []).filter((h) => h?.id && h?.name).map((h) => ({ kind: 'production' as const, id: String(h.id), name: String(h.name), productionHeadId: h.productionHeadId || null })),
    events,
  };
}
const findLoc = (locs: Locations, kind: LocationKind, id: string) =>
  (kind === 'store' ? locs.stores : kind === 'event' ? locs.events : locs.houses).find((l) => l.id === id) || null;

// Whether an employee record belongs to a location. A production person's storeId sometimes holds
// a store id rather than the house id - the store says which house supplies it.
function worksAt(e: any, kind: LocationKind, id: string, locs: Locations) {
  if (kind === 'event') {
    const ev = findLoc(locs, 'event', id);
    return !!ev && (ev.inchargeId === empIdOf(e) || (ev.staffIds || []).includes(empIdOf(e)));
  }
  const ids = new Set<string>([e?.storeId, e?.productionHouseId, ...(e?.assignedStoreIds || []), ...(e?.assignedProductionHouseIds || [])].filter(Boolean).map(String));
  if (ids.has(id)) return true;
  if (kind !== 'production') return false;
  if (findLoc(locs, 'production', id)?.productionHeadId === empIdOf(e)) return true;
  const productionPerson = e?.department === 'production' || /^production_/.test(String(e?.designation || ''));
  return productionPerson && locs.stores.some((s) => ids.has(s.id) && s.productionHouseId === id);
}

type Actor = { authUserId: string; employeeId: string | null; name: string; role: string; designation: string | null; isOwner: boolean; isOps: boolean; canSetup: boolean; record: any };

async function actorOf(deps: Deps, c: any): Promise<{ actor?: Actor; error?: any }> {
  const auth = await deps.verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
  const meta = auth.user.user_metadata || {};
  const employeeId = meta.employeeId ? String(meta.employeeId) : null;
  const emp = employeeId ? await deps.kv.get<any>(`unified-employee:${employeeId}`) : null;
  const role = String(meta.role || 'employee');
  const designation = (meta.designation ?? emp?.designation) || null;
  const isOwner = role === 'cluster_head';
  const isOps = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
  // Trusted role fields (app_metadata) win over the employee record for location too.
  const record = { ...(emp || {}), employeeId, designation, storeId: meta.storeId ?? emp?.storeId, productionHouseId: meta.productionHouseId ?? emp?.productionHouseId,
    assignedStoreIds: meta.assignedStoreIds ?? emp?.assignedStoreIds, assignedProductionHouseIds: meta.assignedProductionHouseIds ?? emp?.assignedProductionHouseIds };
  return { actor: { authUserId: auth.user.id, employeeId, name: emp?.name || meta.name || 'Manager', role, designation, isOwner, isOps, canSetup: isOwner || isOps, record } };
}

// Owner and operations managers review everywhere; a store or production incharge their own place.
function reviews(actor: Actor, kind: LocationKind, id: string, locs: Locations) {
  if (actor.isOwner || actor.isOps) return true;
  if (kind === 'event') return !!actor.employeeId && findLoc(locs, 'event', id)?.inchargeId === actor.employeeId;
  if (kind === 'store' && actor.designation !== 'store_incharge') return false;
  if (kind === 'production' && actor.designation !== 'production_incharge') return false;
  return worksAt(actor.record, kind, id, locs) || (kind === 'production' && findLoc(locs, 'production', id)?.productionHeadId === actor.employeeId);
}

// The incharge(s) of a place - told about missed photos and AI flags.
function inchargesOf(employees: any[], kind: LocationKind, id: string, locs: Locations) {
  if (kind === 'event') {
    const inchargeId = findLoc(locs, 'event', id)?.inchargeId;
    return inchargeId ? employees.filter((e) => e.status !== 'inactive' && empIdOf(e) === inchargeId) : [];
  }
  const designation = kind === 'store' ? 'store_incharge' : 'production_incharge';
  return employees.filter((e) => e.status !== 'inactive' && (
    (e.designation === designation && worksAt(e, kind, id, locs)) ||
    (kind === 'production' && findLoc(locs, 'production', id)?.productionHeadId === empIdOf(e))
  ));
}

async function getSettings(kv: Kv): Promise<Settings> {
  const s = await kv.get<Settings>(SETTINGS_KEY);
  return { ...DEFAULT_SETTINGS, ...(s || {}) };
}

// more: a "Looks OK" button for a photo (POST /quick-action) and the photo itself in the push.
async function safeNotify(deps: Deps, authUserId: string | undefined, type: string, title: string, message: string, relatedId?: string, relatedDate?: string,
  more?: { photoCheck?: string; imageUrl?: string | null }) {
  if (!authUserId) return false;
  try {
    await deps.notifyUser(authUserId, type, title, message, relatedId, relatedDate,
      more?.photoCheck ? { recordType: 'workplace_photo', recordId: more.photoCheck } : undefined, more?.imageUrl ? { imageUrl: more.imageUrl } : undefined);
    return true;
  } catch { return false; }
}

// A link to one photo for the phone to show inside a notification. Push messages can't carry the
// photo itself and photos have no public links, so this is an unguessable link that works for a
// day (GET /workplace/push-photo/:token, no sign-in - the phone fetches it before it shows).
const PUSH_PHOTO_HOURS = 24;
async function pushPhotoUrl(kv: Kv, o: { date: string; employeeId: string; itemId: string; photoId: string }) {
  const base = Deno.env.get('SUPABASE_URL');
  if (!base) return null;
  const token = [...crypto.getRandomValues(new Uint8Array(18))].map((b) => b.toString(16).padStart(2, '0')).join('');
  await kv.set(`push-photo:${token}`, { token, ...o, expiresAt: new Date(Date.now() + PUSH_PHOTO_HOURS * 3600000).toISOString() });
  return `${base}/functions/v1/make-server-c2dd9b9d/workplace/push-photo/${token}`;
}

// "Looks OK" from a notification's button (POST /quick-action in index.ts): the same as a
// reviewer's OK in Workplace checks, without a note, so the person isn't pushed about it.
export async function markCheckOk(kv: Pick<Kv, 'get' | 'set'>, o: { date: string; employeeId: string; itemId: string; by: string; byId?: string }) {
  if (!DATE.test(o.date || '') || !o.employeeId || !o.itemId) return null;
  const key = checkKey(o.date, o.employeeId);
  const row = await kv.get<CheckRow>(key);
  const it = row?.items?.[o.itemId];
  if (!row || !it) return null;
  it.flag = { status: 'ok', note: '', by: o.by, ...(o.byId ? { byId: o.byId } : {}), at: new Date().toISOString() };
  await kv.set(key, row);
  return it;
}

// ---------------- Photos ----------------
type Image = { bytes: Uint8Array; base64: string; type: string; ext: string };

function sniff(b: Uint8Array): string | null {
  if (b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return 'image/png';
  if (b[0] === 0x52 && b[1] === 0x49 && b[2] === 0x46 && b[3] === 0x46 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return 'image/webp';
  return null;
}

// A data URL from the app -> checked bytes. The declared type must match the file's own header.
function parseImage(raw: unknown, maxBytes: number): Image | { error: string } {
  const s = typeof raw === 'string' ? raw : '';
  if (!s) return { error: 'Take a photo first · আগে ছবি তুলুন' };
  if (s.length > Math.ceil((maxBytes * 4) / 3) + 64) return { error: 'The photo is too large - take it again · ছবিটা খুব বড়, আবার তুলুন' };
  const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/.exec(s);
  if (!m) return { error: 'The photo must be a JPEG, PNG or WebP image' };
  let bin: string;
  try { bin = atob(m[2]); } catch { return { error: 'Could not read that photo - take it again' }; }
  if (bin.length > maxBytes) return { error: 'The photo is too large - take it again · ছবিটা খুব বড়, আবার তুলুন' };
  if (bin.length < 500) return { error: 'That photo is empty - take it again' };
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  const type = sniff(bytes);
  if (!type || type !== m[1]) return { error: 'That file is not a photo' };
  return { bytes, base64: m[2], type, ext: type === 'image/jpeg' ? 'jpg' : type === 'image/png' ? 'png' : 'webp' };
}

function toBase64(bytes: Uint8Array) {
  let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(bin);
}

// The bucket is made private on first use; if someone made it public it's switched back.
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

type Stored = Pick<CheckItem, 'storage' | 'path' | 'driveFileId' | 'driveThumbId' | 'thumbPath' | 'mimeType'>;

async function storePhoto(deps: Deps, o: { date: string; item: Assigned; employeeId: string; locName: string; photo: Image; thumb: Image | null }): Promise<Stored> {
  const ts = Date.now();
  if (driveConfigured()) {
    const folder = ['Workplace photos', o.date.slice(0, 7), o.date, o.locName];
    const clock = istNow().toISOString().slice(11, 16).replace(':', '-');
    const name = `${o.item.name.replace(/[\\/]/g, '-')} - ${o.employeeId} - ${clock}.${o.photo.ext}`;
    const folderId = await ensureDriveFolder(folder);
    const file = await uploadDriveFile({ name, bytes: o.photo.bytes, mimeType: o.photo.type, folderId });
    let driveThumbId: string | undefined;
    if (o.thumb) {
      try {
        const thumbFolder = await ensureDriveFolder([...folder, 'thumbs']);
        driveThumbId = (await uploadDriveFile({ name, bytes: o.thumb.bytes, mimeType: o.thumb.type, folderId: thumbFolder })).id;
      } catch { /* the full photo stands in for the thumbnail */ }
    }
    return { storage: 'drive', path: `${folder.join('/')}/${name}`, driveFileId: file.id, ...(driveThumbId ? { driveThumbId } : {}), mimeType: o.photo.type };
  }
  await ensureBucket(deps.storage);
  const path = `${o.date}/${o.item.locationKind}-${safeSeg(o.item.locationId)}/${safeSeg(o.employeeId)}/${safeSeg(o.item.id)}-${ts}.${o.photo.ext}`;
  const { error } = await deps.storage.from(BUCKET).upload(path, o.photo.bytes, { contentType: o.photo.type, upsert: false });
  if (error) throw new Error('Photo storage upload failed');
  let thumbPath: string | undefined;
  if (o.thumb) {
    const tp = `${o.date}/${o.item.locationKind}-${safeSeg(o.item.locationId)}/${safeSeg(o.employeeId)}/${safeSeg(o.item.id)}-${ts}-thumb.${o.thumb.ext}`;
    const { error: thumbError } = await deps.storage.from(BUCKET).upload(tp, o.thumb.bytes, { contentType: o.thumb.type, upsert: false });
    if (!thumbError) thumbPath = tp;
  }
  return { storage: 'bucket', path, ...(thumbPath ? { thumbPath } : {}), mimeType: o.photo.type };
}

async function readPhoto(deps: Deps, it: Stored, thumb: boolean): Promise<{ body: ReadableStream | Uint8Array; type: string } | null> {
  try {
    if (it.storage === 'drive') {
      const id = (thumb && it.driveThumbId) || it.driveFileId;
      if (!id) return null;
      const res = await downloadDriveFile(id);
      if (!res.ok || !res.body) return null;
      return { body: res.body, type: res.headers.get('Content-Type') || it.mimeType || 'image/jpeg' };
    }
    const path = (thumb && it.thumbPath) || it.path;
    const { data, error } = await deps.storage.from(BUCKET).download(path);
    if (error || !data) return null; // past the 60-day keep, or never stored
    return { body: new Uint8Array(await data.arrayBuffer()), type: data.type || it.mimeType || 'image/jpeg' };
  } catch {
    return null;
  }
}

// Superseded retakes are removed from the small bucket; Drive keeps every photo.
function dropOldBucketPhoto(deps: Deps, prev?: Stored) {
  if (!prev || prev.storage !== 'bucket') return;
  const paths = [prev.path, prev.thumbPath].filter(Boolean);
  if (paths.length) deps.storage.from(BUCKET).remove(paths).catch(() => {});
}

// ---------------- AI hygiene score ----------------
async function scorePhoto(deps: Deps, settings: Settings, a: { name: string; hint?: string }, base64: string, mediaType: string): Promise<Partial<CheckItem>> {
  if (!settings.aiEnabled || !Deno.env.get('ANTHROPIC_API_KEY')) return { aiStatus: 'off' };
  try {
    const r = await withTimeout(aiScorePhoto(deps.kv, { base64, mediaType, itemName: a.name, hint: a.hint }), AI_TIMEOUT_MS);
    return { aiStatus: 'scored', aiScore: r.score, aiVerdict: r.verdict, aiIssues: r.issues, aiIssuesBengali: r.issuesBengali, aiShown: r.whatIsShown, aiSevere: r.severe, aiAt: new Date().toISOString() };
  } catch (err: any) {
    console.log('Workplace photo AI score failed:', err?.status || '', String(err?.message || err).slice(0, 160));
    return { aiStatus: 'failed', aiAt: new Date().toISOString() };
  }
}

// Scores one photo and saves the answer on the latest copy of the person's day (more photos may
// have landed meanwhile). Two saves at the same moment can overwrite each other, so it checks its
// answer stuck. null when the photo was retaken or removed before the answer came back.
async function scoreOne(deps: Deps, settings: Settings, o: { key: string; itemId: string; photoId: string; hint?: string; base64: string; mediaType: string }) {
  const first = await deps.kv.get<CheckRow>(o.key);
  const name = first?.items?.[o.itemId]?.name;
  if (!name) return null;
  const ai = await scorePhoto(deps, settings, { name, hint: o.hint }, o.base64, o.mediaType);
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await deps.kv.get<CheckRow>(o.key);
    const it = row?.items?.[o.itemId];
    const photo = it ? photosOf(it).find((x) => x.id === o.photoId) : undefined;
    if (!row || !it || !photo) return null;
    it.photos = photosOf(it);
    for (const k of AI_KEYS) delete photo[k];
    Object.assign(photo, ai);
    rollUp(it);
    settleFlag(it, settings.aiThreshold);
    await deps.kv.set(o.key, row);
    const check = await deps.kv.get<CheckRow>(o.key);
    const saved = check?.items?.[o.itemId];
    const kept = saved?.photos?.find((x) => x.id === o.photoId);
    if (!kept) return null;
    if (kept.aiStatus === ai.aiStatus) return { it: saved!, photo: kept };
  }
  return null;
}

// What the person (and the incharge and owner) hear about one scored photo, then the round's
// "your photos are checked" once nothing is waiting.
async function afterScore(deps: Deps, settings: Settings, o: { date: string; employeeId: string; itemId: string; it: CheckItem; photo: Photo }) {
  if (isLow(o.photo, settings.aiThreshold) && o.it.flag?.auto) {
    // The photo's own issues, not the whole check's.
    const view = { ...o.it, aiScore: o.photo.aiScore, aiIssues: o.photo.aiIssues, aiIssuesBengali: o.photo.aiIssuesBengali, aiSevere: o.photo.aiSevere };
    await pushAutoFlag(deps, { date: o.date, employeeId: o.employeeId, itemId: o.itemId, photoId: o.photo.id, it: view, actorEmployeeId: null });
  } else if (o.photo.aiStatus === 'scored' && o.photo.aiVerdict === 'unclear_photo') {
    const person = await deps.kv.get<any>(`unified-employee:${o.employeeId}`);
    const imageUrl = await pushPhotoUrl(deps.kv, { date: o.date, employeeId: o.employeeId, itemId: o.itemId, photoId: o.photo.id }).catch(() => null);
    await safeNotify(deps, person?.authUserId, 'workplace_flag', `Retake: ${o.it.name} photo is not clear`,
      'Take it again in good light with the whole area in the frame. · ভালো আলোয়, পুরো জায়গাটা ফ্রেমে রেখে আবার তুলুন।', `${o.it.locationKind}:${o.it.locationId}`, o.date, { imageUrl });
  }
  await resultPush(deps, o.date, o.employeeId);
}

// "Your photos are checked": once nothing is waiting for the AI and every check that has opened
// has a photo, one push for the round rather than one per photo. A retake later gets its own.
async function resultPush(deps: Deps, date: string, employeeId: string) {
  const row = await deps.kv.get<CheckRow>(checkKey(date, employeeId));
  const items = Object.values(row?.items || {});
  const photos = items.flatMap((it) => photosOf(it));
  if (!row || !photos.length || photos.some((p) => p.aiStatus === 'pending')) return;
  const sent = await deps.kv.get<{ at: string }>(resultsSentKey(date, employeeId));
  if (!photos.some((p) => p.aiAt && p.aiAt > (sent?.at || ''))) return;
  const nowMin = nowMinutesIST();
  const open = (row.assigned || []).filter((a) => date < deps.getTodayIST() || !a.start || nowMin >= toMin(a.start) - EARLY_UPLOAD_MINUTES);
  if (open.some((a) => !row.items?.[a.id])) return;
  // Two checks finishing together could both get here: whoever's mark stuck sends it.
  const mark = { date, employeeId, at: new Date().toISOString(), by: Math.random().toString(36).slice(2) };
  await deps.kv.set(resultsSentKey(date, employeeId), mark);
  if ((await deps.kv.get<{ by?: string }>(resultsSentKey(date, employeeId)))?.by !== mark.by) return;
  const dirty = items.filter((it) => it.flag?.status === 'needs_cleaning' && it.flag.auto);
  const unclear = items.filter((it) => it.aiStatus === 'scored' && it.aiVerdict === 'unclear_photo');
  const clean = items.filter((it) => it.aiStatus === 'scored' && it.aiVerdict !== 'unclear_photo' && !dirty.includes(it)).length;
  const unscored = items.filter((it) => it.aiStatus === 'failed').length;
  const names = (xs: CheckItem[]) => xs.slice(0, 4).map((it) => it.name).join(', ') + (xs.length > 4 ? ` +${xs.length - 4}` : '');
  const namesBn = (xs: CheckItem[]) => xs.slice(0, 4).map((it) => it.nameBn || it.name).join(', ') + (xs.length > 4 ? ` +${bnDigits(String(xs.length - 4))}` : '');
  const title = dirty.length ? `Photos checked: ${dirty.length} to clean again` : unclear.length ? `Photos checked: ${unclear.length} not clear`
    : unscored ? `Photos checked: ${clean} clean` : `Photos checked: all ${clean} clean`;
  const message = [
    dirty.length ? `Clean and retake: ${names(dirty)}. · আবার পরিষ্কার করে তুলুন: ${namesBn(dirty)}।` : '',
    unclear.length ? `Retake, not clear: ${names(unclear)}. · পরিষ্কার আসেনি, আবার তুলুন: ${namesBn(unclear)}।` : '',
    !dirty.length && !unclear.length ? 'Nothing to redo. Thank you! · সব ঠিক আছে, ধন্যবাদ!' : '',
    unscored ? `${unscored} could not be checked; the incharge will look. · ${bnDigits(String(unscored))}টা দেখা যায়নি, ইনচার্জ দেখবেন।` : '',
  ].filter(Boolean).join(' ');
  const person = await deps.kv.get<any>(`unified-employee:${employeeId}`);
  await safeNotify(deps, person?.authUserId, 'workplace_checked', title, message, row.locationKind && row.locationId ? `${row.locationKind}:${row.locationId}` : undefined, date);
}

// Photos the background scoring never finished (the server copy stopped, or a timeout), today only.
async function scoreLeftovers(deps: Deps, rows: CheckRow[]) {
  const settings = await getSettings(deps.kv);
  if (!settings.aiEnabled || !Deno.env.get('ANTHROPIC_API_KEY')) return 0;
  const cutoff = new Date(Date.now() - STUCK_PENDING_MINUTES * 60000).toISOString();
  const stuck: { row: CheckRow; itemId: string; photo: Photo }[] = [];
  for (const row of rows) {
    for (const [itemId, it] of Object.entries(row.items || {})) {
      for (const photo of photosOf(it)) if (photo.aiStatus === 'pending' && photo.uploadedAt < cutoff) stuck.push({ row, itemId, photo });
    }
  }
  let done = 0;
  for (const { row, itemId, photo } of stuck.slice(0, LEFTOVERS_PER_RUN)) {
    const file = await readPhoto(deps, photo, false);
    if (!file) continue;
    const bytes = file.body instanceof Uint8Array ? file.body : new Uint8Array(await new Response(file.body).arrayBuffer());
    const hint = (row.assigned || []).find((a) => a.id === itemId)?.hint;
    const r = await scoreOne(deps, settings, { key: checkKey(row.date, row.employeeId), itemId, photoId: photo.id, hint, base64: toBase64(bytes), mediaType: sniff(bytes) || photo.mimeType });
    if (r) { done++; await afterScore(deps, settings, { date: row.date, employeeId: row.employeeId, itemId, it: r.it, photo: r.photo }); }
  }
  return done;
}

// photoId: the photo the push shows (default: the check's worst-scoring one).
async function pushAutoFlag(deps: Deps, o: { date: string; employeeId: string; itemId: string; photoId?: string; it: CheckItem; actorEmployeeId: string | null }) {
  const [employees, locs] = await Promise.all([loadEmployees(deps.kv), loadLocations(deps.kv)]);
  const person = employees.find((e) => empIdOf(e) === o.employeeId);
  const locName = findLoc(locs, o.it.locationKind, o.it.locationId)?.name || 'your workplace';
  const en = (o.it.aiIssues || []).join(', ');
  const bn = (o.it.aiIssuesBengali || []).join(', ');
  const related = `${o.it.locationKind}:${o.it.locationId}`;
  const shown = o.photoId || [...photosOf(o.it)].sort((a, b) => (a.aiScore ?? 10) - (b.aiScore ?? 10))[0]?.id;
  const imageUrl = shown ? await pushPhotoUrl(deps.kv, { date: o.date, employeeId: o.employeeId, itemId: o.itemId, photoId: shown }).catch(() => null) : null;
  const photoCheck = `${o.date}|${o.employeeId}|${o.itemId}`;
  // Scored in the background, so the person is told too; a reviewer scoring again on screen
  // (actorEmployeeId) is not told about their own look.
  if (person && o.employeeId !== o.actorEmployeeId) {
    await safeNotify(deps, person.authUserId, 'workplace_flag', `Clean again: ${o.it.name} (AI ${o.it.aiScore}/10)`,
      `${en ? `${en}. ` : ''}Clean it and take a new photo. · ${bn ? `${bn}। ` : ''}পরিষ্কার করে নতুন ছবি দিন।`, related, o.date, { imageUrl });
  }
  // A garbage dump, overflowing waste, pests or filth: an alarm at once to the incharge, the
  // operations managers and the owner (it also stays on their Home, GET /workplace/alerts).
  if (o.it.aiSevere) {
    const to = new Map<string, any>();
    for (const e of inchargesOf(employees, o.it.locationKind, o.it.locationId, locs)) if (e.authUserId) to.set(e.authUserId, e);
    for (const e of employees) if (e.status !== 'inactive' && e.authUserId && e.role === 'manager' && e.designation !== 'store_incharge' && e.designation !== 'production_incharge') to.set(e.authUserId, e);
    for (const e of (await deps.getAllClusterHeads()) || []) if (e?.authUserId) to.set(e.authUserId, e);
    for (const authUserId of to.keys()) {
      await safeNotify(deps, authUserId, 'workplace_alarm', `Garbage / dirt alert: ${o.it.name} at ${locName}`,
        `${person?.name || 'A staff member'}'s photo shows a serious problem (AI ${o.it.aiScore}/10)${en ? `: ${en}` : ''}. Get it cleaned now. It lowers the incharge's KPI.`, related, o.date, { imageUrl });
    }
    return;
  }
  // Any other AI flag: the place's incharge and the owner (owner, 28 Oct 2026).
  const to = new Map<string, any>();
  for (const inc of inchargesOf(employees, o.it.locationKind, o.it.locationId, locs)) {
    if (empIdOf(inc) === o.employeeId || empIdOf(inc) === o.actorEmployeeId) continue;
    if (inc.authUserId) to.set(inc.authUserId, inc);
  }
  for (const e of (await deps.getAllClusterHeads()) || []) if (e?.authUserId) to.set(e.authUserId, e);
  for (const authUserId of to.keys()) {
    await safeNotify(deps, authUserId, 'workplace_flag', `AI flagged ${o.it.name} at ${locName}`,
      `${person?.name || 'A staff member'}'s photo scored ${o.it.aiScore}/10${en ? `: ${en}` : ''}. Open Workplace checks to confirm or mark it OK.`, related, o.date, { imageUrl, photoCheck });
  }
}

// ---------------- Routes ----------------
export function registerWorkplaceRoutes(app: any, deps: Deps) {
  const { kv } = deps;

  const parseLocation = (c: any) => {
    const kind = c.req.query('kind');
    const id = str(c.req.query('id'), 80);
    return isKind(kind) && id ? { kind, id } : null;
  };

  // Places the caller can review (and set up), plus the AI settings the screens show.
  app.get(`${P}/workplace/locations`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const [locs, settings] = await Promise.all([loadLocations(kv), getSettings(kv)]);
    const locations = [...locs.stores, ...locs.houses, ...locs.events.filter((e) => !e.closed)].filter((l) => reviews(actor!, l.kind, l.id, locs)).map(({ kind, id, name }) => ({ kind, id, name }));
    return c.json({
      canSetup: actor!.canSetup,
      locations,
      settings: { aiEnabled: settings.aiEnabled, aiThreshold: settings.aiThreshold },
      ...(actor!.canSetup ? { storage: driveConfigured() ? 'drive' : 'bucket', aiConfigured: !!Deno.env.get('ANTHROPIC_API_KEY') } : {}),
    });
  });

  app.put(`${P}/workplace/settings`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!actor!.canSetup) return c.json({ error: 'Only the owner and operations managers can change this' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const cur = await getSettings(kv);
    const threshold = body.aiThreshold === undefined ? cur.aiThreshold : Math.round(Number(body.aiThreshold));
    if (!Number.isFinite(threshold) || threshold < 1 || threshold > 10) return c.json({ error: 'The auto-flag score must be 1 to 10' }, 400);
    const next: Settings = { aiEnabled: body.aiEnabled === undefined ? cur.aiEnabled : !!body.aiEnabled, aiThreshold: threshold, updatedAt: new Date().toISOString(), updatedBy: actor!.name };
    await kv.set(SETTINGS_KEY, next);
    return c.json({ settings: { aiEnabled: next.aiEnabled, aiThreshold: next.aiThreshold } });
  });

  // A location's checklist (the suggested one until it's saved) and, for setup, the staff to pick from.
  app.get(`${P}/workplace/template`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const loc = parseLocation(c); if (!loc) return c.json({ error: 'Pick a store or production house' }, 400);
    const locs = await loadLocations(kv);
    if (!findLoc(locs, loc.kind, loc.id)) return c.json({ error: 'That place was not found' }, 404);
    if (!actor!.canSetup && !reviews(actor!, loc.kind, loc.id, locs)) return c.json({ error: 'You are not allowed to see this' }, 403);
    const saved = await loadTemplate(kv, loc.kind, loc.id);
    let people: any[] | undefined;
    if (actor!.canSetup) {
      people = (await loadEmployees(kv))
        .filter((e) => e.status !== 'inactive' && e.role !== 'cluster_head' && e.role !== 'audit' && e.designation !== 'rider')
        .map((e) => ({ id: empIdOf(e), name: String(e.name || empIdOf(e)), designation: e.designation || e.role || null, here: worksAt(e, loc.kind, loc.id, locs) }))
        .sort((a, b) => Number(b.here) - Number(a.here) || a.name.localeCompare(b.name));
    }
    // An event's loadTemplate is never empty (the default stall checklist); isDefault says whether it was saved.
    const stored = loc.kind === 'event' ? await kv.get<Template>(templateKey(loc.kind, loc.id)) : saved;
    return c.json({ template: saved || defaultTemplate(loc.kind, loc.id), isDefault: !stored, ...(people ? { people } : {}) });
  });

  app.put(`${P}/workplace/template`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    if (!actor!.canSetup) return c.json({ error: 'Only the owner and operations managers can change the checklist' }, 403);
    const loc = parseLocation(c); if (!loc) return c.json({ error: 'Pick a store or production house' }, 400);
    const locs = await loadLocations(kv);
    if (!findLoc(locs, loc.kind, loc.id)) return c.json({ error: 'That place was not found' }, 404);
    const body = await c.req.json().catch(() => ({}));
    const raw = Array.isArray(body.items) ? body.items : null;
    if (!raw) return c.json({ error: 'No checklist sent' }, 400);
    if (raw.length > MAX_ITEMS) return c.json({ error: `At most ${MAX_ITEMS} checks per place` }, 400);
    const staff = new Set((await loadEmployees(kv)).map(empIdOf));
    const seen = new Set<string>();
    const items: TemplateItem[] = [];
    for (const r of raw) {
      const name = str(r?.name, 60);
      if (!name) return c.json({ error: 'Every check needs an English name' }, 400);
      const start = str(r?.start, 5); const end = str(r?.end, 5);
      if (!TIME.test(start) || !TIME.test(end)) return c.json({ error: `${name}: set the start and end time` }, 400);
      if (toMin(start) >= toMin(end)) return c.json({ error: `${name}: the time must end after it starts (same day)` }, 400);
      const days = [...new Set((Array.isArray(r?.days) ? r.days : []).map(Number).filter((d: number) => Number.isInteger(d) && d >= 0 && d <= 6))].sort() as number[];
      if (!days.length) return c.json({ error: `${name}: pick at least one day` }, 400);
      const assigneeId = r?.assigneeId ? str(r.assigneeId, 80) : null;
      if (assigneeId && !staff.has(assigneeId)) return c.json({ error: `${name}: that person is not in the staff list` }, 400);
      const coverId = r?.coverId ? str(r.coverId, 80) : null;
      if (coverId && !staff.has(coverId)) return c.json({ error: `${name}: the "if away" person is not in the staff list` }, 400);
      if (coverId && coverId === assigneeId) return c.json({ error: `${name}: the "if away" person must be someone else` }, 400);
      let id = str(r?.id, 40);
      if (!/^[a-z0-9-]{1,40}$/.test(id) || seen.has(id)) id = `${slug(name)}-${randomId()}`;
      seen.add(id);
      const hint = str(r?.hint, 160);
      const from = str(r?.from, 10);
      items.push({ id, name, nameBn: str(r?.nameBn, 60), ...(hint ? { hint } : {}), assigneeId, ...(coverId ? { coverId } : {}), start, end, days, ...(DATE.test(from) ? { from } : {}) });
    }
    const template: Template = { locationKind: loc.kind, locationId: loc.id, items, updatedAt: new Date().toISOString(), updatedBy: actor!.name };
    await kv.set(templateKey(loc.kind, loc.id), template);
    // The event days are taken from the event each time the checklist is read (loadTemplate).
    return c.json({ template, isDefault: false });
  });

  // The signed-in person's checks for today.
  app.get(`${P}/workplace/my`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const today = deps.getTodayIST();
    if (!actor!.employeeId) return c.json({ date: today, earlyMinutes: EARLY_UPLOAD_MINUTES, items: [] });
    const [templates, row, locs] = await Promise.all([loadAllTemplates(kv), kv.get<CheckRow>(checkKey(today, actor!.employeeId)), loadLocations(kv)]);
    const nowMin = nowMinutesIST();
    const cover = coverOn(await loadCoverInputs(kv, undefined, locs), today);
    const mine = assignedOn(templates, today, actor!.employeeId, cover).map(stripAssignee);
    const items = mine.map((a) => {
      const it = row?.items?.[a.id];
      return { ...a, locationName: findLoc(locs, a.locationKind, a.locationId)?.name || '', status: statusOf(today, today, nowMin, a, it), ...itemView(it) };
    });
    // Photos already sent for a check that has since been taken off the list still show.
    for (const [id, it] of Object.entries(row?.items || {})) {
      if (items.some((x) => x.id === id)) continue;
      items.push({ id, name: it.name, nameBn: it.nameBn || '', start: '', end: '', locationKind: it.locationKind, locationId: it.locationId,
        locationName: findLoc(locs, it.locationKind, it.locationId)?.name || '', status: statusOf(today, today, nowMin, { start: '', end: '' }, it), ...itemView(it) });
    }
    return c.json({ date: today, earlyMinutes: EARLY_UPLOAD_MINUTES, employeeId: actor!.employeeId, items });
  });

  // One photo for one check: the first, another one (add), or a retake of one (replacePhotoId; an
  // older app's plain retake replaces them all). Only the person it's assigned to, or a reviewer
  // of that place on their behalf (recorded as such). The reply comes once the photo is saved; the
  // AI looks at it afterwards (inBackground).
  app.post(`${P}/workplace/upload`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const body = await c.req.json().catch(() => ({}));
    const itemId = str(body.itemId, 40);
    const forEmployeeId = body.forEmployeeId ? str(body.forEmployeeId, 80) : actor!.employeeId;
    if (!forEmployeeId) return c.json({ error: 'Only staff logins can send workplace photos' }, 400);
    const today = deps.getTodayIST();
    const [templates, locs] = await Promise.all([loadAllTemplates(kv), loadLocations(kv)]);
    const mine = assignedOn(templates, today, forEmployeeId, coverOn(await loadCoverInputs(kv, undefined, locs), today)).map(stripAssignee);
    const a = mine.find((x) => x.id === itemId);
    if (!a) return c.json({ error: 'This check is not on the list for today · আজকের তালিকায় এটা নেই' }, 404);
    const onBehalf = forEmployeeId !== actor!.employeeId;
    if (onBehalf && !reviews(actor!, a.locationKind, a.locationId, locs)) return c.json({ error: 'Only the person this check is assigned to can send its photo' }, 403);
    const nowMin = nowMinutesIST();
    const opensAt = Math.max(0, toMin(a.start) - EARLY_UPLOAD_MINUTES);
    if (nowMin < opensAt) {
      const opens = `${String(Math.floor(opensAt / 60)).padStart(2, '0')}:${String(opensAt % 60).padStart(2, '0')}`;
      return c.json({ error: `Photos for ${a.name} open at ${fmt12(opens)} · ${bnDigits(fmt12(opens))} থেকে ছবি দেওয়া যাবে` }, 400);
    }
    const key = checkKey(today, forEmployeeId);
    const before = await kv.get<CheckRow>(key);
    const prev = before?.items?.[a.id];
    const prevPhotos = prev ? photosOf(prev) : [];
    const adding = !!body.add && prevPhotos.length > 0;
    const replaceId = !adding && body.replacePhotoId ? str(body.replacePhotoId, 40) : '';
    if (replaceId && !prevPhotos.some((p) => p.id === replaceId)) return c.json({ error: 'That photo was already replaced - refresh · ছবিটা আগেই বদলানো হয়েছে, রিফ্রেশ করুন' }, 409);
    if (adding && prevPhotos.length >= MAX_PHOTOS) return c.json({ error: `At most ${MAX_PHOTOS} photos for one check · একটা কাজে সর্বোচ্চ ${bnDigits(String(MAX_PHOTOS))}টা ছবি` }, 400);
    const retake = !!prev && !adding;
    if (retake && (prev!.retakes || 0) >= MAX_RETAKES) return c.json({ error: 'Too many retakes for this check today' }, 400);
    const photo = parseImage(body.image, MAX_PHOTO_BYTES);
    if ('error' in photo) return c.json({ error: photo.error }, 400);
    const parsedThumb = body.thumb ? parseImage(body.thumb, MAX_THUMB_BYTES) : null;
    const thumb = parsedThumb && !('error' in parsedThumb) ? parsedThumb : null;

    let stored: Stored;
    try {
      stored = await storePhoto(deps, { date: today, item: a, employeeId: forEmployeeId, locName: findLoc(locs, a.locationKind, a.locationId)?.name || `${a.locationKind}-${a.locationId}`, photo, thumb });
    } catch (err: any) {
      console.log('Workplace photo storage failed:', String(err?.message || err).slice(0, 160));
      return c.json({ error: 'Could not save the photo - try again · ছবি সেভ হয়নি, আবার চেষ্টা করুন' }, 502);
    }

    const settings = await getSettings(kv);
    const aiOn = settings.aiEnabled && !!Deno.env.get('ANTHROPIC_API_KEY');
    const nowIso = new Date().toISOString();
    const shot: Photo = { id: newPhotoId(), uploadedAt: nowIso, ...stored, aiStatus: aiOn ? 'pending' : 'off', ...(onBehalf ? { onBehalf: true, uploadedByName: actor!.name } : {}) };
    const photos = adding ? [...prevPhotos, shot] : replaceId ? prevPhotos.map((p) => (p.id === replaceId ? shot : p)) : [shot];
    const dropped = adding ? [] : replaceId ? prevPhotos.filter((p) => p.id === replaceId) : prevPhotos;
    const late = nowMin > toMin(a.end);
    // Another photo leaves a reviewer's verdict as it was. A retake marks a reviewer's
    // needs-cleaning fixed (it stays until they look again) and drops their OK, which was about the
    // old photo. The AI's own flag is worked out again from the photos (settleFlag).
    const flag = !prev?.flag ? undefined
      : prev.flag.auto || adding ? prev.flag
      : prev.flag.status === 'needs_cleaning' ? { ...prev.flag, fixedAt: nowIso } : undefined;
    const entry: CheckItem = {
      name: a.name, nameBn: a.nameBn, ...stored, uploadedAt: nowIso, firstUploadedAt: prev?.firstUploadedAt || prev?.uploadedAt || nowIso,
      // A retake keeps an earlier on-time photo on time (e.g. re-shooting after a flag).
      late: prev ? prev.late && late : late,
      locationKind: a.locationKind, locationId: a.locationId,
      ...(retake ? { retakes: (prev!.retakes || 0) + 1 } : prev?.retakes ? { retakes: prev.retakes } : {}),
      ...(prev?.wasFlagged ? { wasFlagged: true } : {}),
      ...(prev?.wasSevere ? { wasSevere: true } : {}),
      ...(flag ? { flag } : {}),
      ...(onBehalf ? { onBehalf: true, uploadedById: actor!.employeeId || actor!.authUserId, uploadedByName: actor!.name } : {}),
      photos,
    };
    rollUp(entry);
    settleFlag(entry, settings.aiThreshold);
    const row = syncRow(before, today, forEmployeeId, mine);
    row.items[a.id] = entry;
    recount(row);
    row.updatedAt = nowIso;
    await kv.set(key, row);
    for (const d of dropped) dropOldBucketPhoto(deps, d);

    // Anything the background check leaves behind is scored by the 15-minute cron (scoreLeftovers).
    if (aiOn) {
      await inBackground('Workplace photo check', async () => {
        const r = await scoreOne(deps, settings, { key, itemId: a.id, photoId: shot.id, hint: a.hint, base64: photo.base64, mediaType: photo.type });
        if (r) await afterScore(deps, settings, { date: today, employeeId: forEmployeeId, itemId: a.id, it: r.it, photo: r.photo });
      });
    }
    return c.json({ success: true, flagged: false, item: { ...a, status: statusOf(today, today, nowMin, a, entry), ...itemView(entry) } });
  });

  // Takes one photo off a check (sent by mistake): today only, never the last one (retake that).
  app.post(`${P}/workplace/photo-remove`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const body = await c.req.json().catch(() => ({}));
    const itemId = str(body.itemId, 40); const photoId = str(body.photoId, 40);
    const employeeId = body.forEmployeeId ? str(body.forEmployeeId, 80) : actor!.employeeId;
    if (!employeeId || !itemId || !photoId) return c.json({ error: 'Missing photo details' }, 400);
    const today = deps.getTodayIST();
    const key = checkKey(today, employeeId);
    const row = await kv.get<CheckRow>(key);
    const it = row?.items?.[itemId];
    if (!row || !it) return c.json({ error: 'No photo for this check' }, 404);
    if (employeeId !== actor!.employeeId && !reviews(actor!, it.locationKind, it.locationId, await loadLocations(kv))) return c.json({ error: 'You are not allowed to do this' }, 403);
    const photos = photosOf(it);
    const gone = photos.find((p) => p.id === photoId);
    if (!gone) return c.json({ error: 'That photo was already removed - refresh · ছবিটা আগেই সরানো হয়েছে' }, 404);
    if (photos.length < 2) return c.json({ error: 'A check needs at least one photo - retake it instead · অন্তত একটা ছবি লাগবে, আবার তুলুন' }, 400);
    it.photos = photos.filter((p) => p.id !== photoId);
    rollUp(it);
    settleFlag(it, (await getSettings(kv)).aiThreshold);
    row.updatedAt = new Date().toISOString();
    await kv.set(key, row);
    dropOldBucketPhoto(deps, gone);
    const a = (row.assigned || []).find((x) => x.id === itemId) || { id: itemId, name: it.name, nameBn: it.nameBn || '', start: '', end: '', locationKind: it.locationKind, locationId: it.locationId };
    return c.json({ success: true, item: { ...a, status: statusOf(today, today, nowMinutesIST(), a, it), ...itemView(it) } });
  });

  // Score a check's photos again (the AI call failed, or a reviewer wants a second look), or just
  // one of them (photoId). Answered on screen, so it waits for the AI.
  app.post(`${P}/workplace/rescore`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const body = await c.req.json().catch(() => ({}));
    const date = str(body.date, 10); const employeeId = str(body.employeeId, 80); const itemId = str(body.itemId, 40);
    const photoId = body.photoId ? str(body.photoId, 40) : '';
    if (!DATE.test(date) || !employeeId || !itemId) return c.json({ error: 'Missing photo details' }, 400);
    const key = checkKey(date, employeeId);
    const row = await kv.get<CheckRow>(key);
    const it = row?.items?.[itemId];
    if (!row || !it) return c.json({ error: 'No photo for this check' }, 404);
    const locs = await loadLocations(kv);
    if (employeeId !== actor!.employeeId && !reviews(actor!, it.locationKind, it.locationId, locs)) return c.json({ error: 'You are not allowed to do this' }, 403);
    const settings = await getSettings(kv);
    if (!settings.aiEnabled || !Deno.env.get('ANTHROPIC_API_KEY')) return c.json({ error: 'AI photo checks are switched off' }, 400);
    const targets = photosOf(it).filter((p) => !photoId || p.id === photoId);
    if (!targets.length) return c.json({ error: 'That photo is no longer there' }, 404);
    const hint = (row.assigned || []).find((x) => x.id === itemId)?.hint;
    const answers = await Promise.all(targets.map(async (p) => {
      const file = await readPhoto(deps, p, false);
      if (!file) return { id: p.id, ai: null };
      const bytes = file.body instanceof Uint8Array ? file.body : new Uint8Array(await new Response(file.body).arrayBuffer());
      return { id: p.id, ai: await scorePhoto(deps, settings, { name: it.name, hint }, toBase64(bytes), sniff(bytes) || p.mimeType) };
    }));
    if (answers.every((x) => !x.ai)) return c.json({ error: 'The photo is no longer kept' }, 404);
    const latest = (await kv.get<CheckRow>(key)) || row;
    const target = latest.items?.[itemId];
    if (!target) return c.json({ error: 'No photo for this check' }, 404);
    target.photos = photosOf(target);
    const wasFlagged = target.flag?.status === 'needs_cleaning' && !!target.flag.auto;
    let scoredAny = false;
    for (const { id, ai } of answers) {
      const p = target.photos.find((x) => x.id === id);
      // A failed second look keeps the score the photo already had.
      if (!p || !ai || (ai.aiStatus !== 'scored' && p.aiStatus === 'scored')) continue;
      for (const k of AI_KEYS) delete p[k];
      Object.assign(p, ai);
      if (ai.aiStatus === 'scored') scoredAny = true;
    }
    rollUp(target);
    settleFlag(target, settings.aiThreshold);
    await kv.set(key, latest);
    const flagged = !wasFlagged && target.flag?.status === 'needs_cleaning' && !!target.flag.auto;
    if (flagged) await pushAutoFlag(deps, { date, employeeId, itemId, it: target, actorEmployeeId: actor!.employeeId });
    return c.json({ success: scoredAny, flagged, ...itemView(target) });
  });

  // The photo inside a push notification (pushPhotoUrl): no sign-in, the unguessable token that
  // works for a day is the permission. Public in index.ts (PUBLIC_ROUTES).
  app.get(`${P}/workplace/push-photo/:token`, async (c: any) => {
    const token = String(c.req.param('token') || '');
    if (!/^[0-9a-f]{36}$/.test(token)) return c.json({ error: 'Not found' }, 404);
    const rec = await kv.get<any>(`push-photo:${token}`);
    if (!rec || !rec.expiresAt || rec.expiresAt < new Date().toISOString()) return c.json({ error: 'Not found' }, 404);
    const it = (await kv.get<CheckRow>(checkKey(rec.date, rec.employeeId)))?.items?.[rec.itemId];
    const photo = it ? photosOf(it).find((p) => p.id === rec.photoId) : undefined;
    const file = photo ? await readPhoto(deps, photo, false) : null;
    if (!file) return c.json({ error: 'Not found' }, 404);
    return c.body(file.body, 200, { 'Content-Type': file.type, 'Cache-Control': 'private, max-age=3600' });
  });

  // Streams one photo (or its thumbnail) to someone allowed to see it: reviewers of that place and
  // the person whose check it is. Never a public link.
  app.get(`${P}/workplace/photo/:date/:employeeId/:itemId`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const date = c.req.param('date'); const employeeId = c.req.param('employeeId'); const itemId = c.req.param('itemId');
    if (!DATE.test(date)) return c.json({ error: 'Bad date' }, 400);
    const row = await kv.get<CheckRow>(checkKey(date, employeeId));
    const it = row?.items?.[itemId];
    if (!it) return c.json({ error: 'No photo' }, 404);
    if (employeeId !== actor!.employeeId && !reviews(actor!, it.locationKind, it.locationId, await loadLocations(kv))) return c.json({ error: 'You are not allowed to see this photo' }, 403);
    // ?photo= picks one of the check's photos; without it, the first (the cover).
    const photos = photosOf(it);
    const which = c.req.query('photo') ? photos.find((p) => p.id === c.req.query('photo')) : photos[0];
    if (!which) return c.json({ error: 'That photo was replaced' }, 404);
    const file = await readPhoto(deps, which, c.req.query('size') === 'thumb');
    if (!file) return c.json({ error: 'The photo is no longer kept' }, 404);
    return c.body(file.body, 200, { 'Content-Type': file.type, 'Cache-Control': 'private, max-age=3600' });
  });

  // Gallery / review: every check at one place over a date range, with status, AI score and flags.
  app.get(`${P}/workplace/review`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const loc = parseLocation(c); if (!loc) return c.json({ error: 'Pick a store or production house' }, 400);
    const today = deps.getTodayIST();
    const to = DATE.test(c.req.query('to') || '') ? c.req.query('to') : today;
    const from = DATE.test(c.req.query('from') || '') ? c.req.query('from') : to;
    if (from > to) return c.json({ error: 'The start date is after the end date' }, 400);
    const dates = datesBetween(from, to > today ? today : to);
    if (dates.length > MAX_RANGE_DAYS) return c.json({ error: `Pick at most ${MAX_RANGE_DAYS} days` }, 400);
    const locs = await loadLocations(kv);
    const place = findLoc(locs, loc.kind, loc.id);
    if (!place) return c.json({ error: 'That place was not found' }, 404);
    if (!reviews(actor!, loc.kind, loc.id, locs)) return c.json({ error: 'You are not allowed to see this place' }, 403);
    const [template, employees, rowsByDate] = await Promise.all([
      loadTemplate(kv, loc.kind, loc.id),
      loadEmployees(kv),
      inBatches(dates, 8, async (d) => ({ d, rows: ((await kv.getByPrefix<CheckRow>(`workplace-check:${d}:`)) || []).filter((r) => r?.employeeId) })),
    ]);
    const names = new Map(employees.map((e) => [empIdOf(e), String(e.name || empIdOf(e))]));
    const nowMin = nowMinutesIST();
    const items: any[] = [];
    for (const { d, rows } of rowsByDate) {
      const byPerson = new Map(rows.map((r) => [r.employeeId, r]));
      const seen = new Set<string>();
      const add = (employeeId: string, a: Assigned, it?: CheckItem) => {
        const k = `${employeeId}|${a.id}`;
        if (seen.has(k)) return;
        seen.add(k);
        items.push({
          date: d, employeeId, personName: names.get(employeeId) || 'Former staff', itemId: a.id, name: a.name, nameBn: a.nameBn || '', hint: a.hint || '',
          start: a.start, end: a.end, status: statusOf(d, today, nowMin, a, it), ...itemView(it),
          ...(a.coveringFor ? { coveringForName: a.coveringForName || names.get(a.coveringFor) || '' } : {}),
        });
      };
      // What was due here: today from the live checklist, earlier days from what each person had.
      if (d === today && template) {
        const cover = coverOn(await loadCoverInputs(kv, employees, locs), d);
        for (const a of assignedOn([template], d, undefined, cover)) add(a.assigneeId, stripAssignee(a), byPerson.get(a.assigneeId)?.items?.[a.id]);
      } else {
        for (const r of rows) for (const a of r.assigned || []) if (atLocation(a, loc.kind, loc.id)) add(r.employeeId, a, r.items?.[a.id]);
      }
      // Photos taken here for checks no longer on the list.
      for (const r of rows) {
        for (const [id, it] of Object.entries(r.items || {})) {
          if (!atLocation(it, loc.kind, loc.id)) continue;
          const a = (r.assigned || []).find((x) => x.id === id) || { id, name: it.name, nameBn: it.nameBn || '', start: '', end: '', locationKind: it.locationKind, locationId: it.locationId };
          add(r.employeeId, a, it);
        }
      }
    }
    items.sort((x, y) => y.date.localeCompare(x.date) || (x.start || '99').localeCompare(y.start || '99') || x.name.localeCompare(y.name));
    return c.json({ from, to, location: { kind: place.kind, id: place.id, name: place.name }, items });
  });

  // Garbage dumps and filth from the last three days still showing in the latest photo (not re-shot
  // clean, not marked OK by a reviewer), at the places the caller reviews - shown on Home.
  app.get(`${P}/workplace/alerts`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const today = deps.getTodayIST();
    const dates = [addDays(today, -2), addDays(today, -1), today];
    const [locs, employees, rowsByDate] = await Promise.all([
      loadLocations(kv),
      loadEmployees(kv),
      inBatches(dates, 3, async (d) => ({ d, rows: ((await kv.getByPrefix<CheckRow>(`workplace-check:${d}:`)) || []).filter((r) => r?.employeeId) })),
    ]);
    const names = new Map(employees.map((e) => [empIdOf(e), String(e.name || empIdOf(e))]));
    const alerts: any[] = [];
    for (const { d, rows } of rowsByDate) {
      for (const r of rows) {
        for (const [itemId, it] of Object.entries(r.items || {})) {
          if (!it.aiSevere || it.flag?.status === 'ok') continue;
          if (!reviews(actor!, it.locationKind, it.locationId, locs)) continue;
          alerts.push({
            date: d, employeeId: r.employeeId, personName: names.get(r.employeeId) || 'Former staff', itemId, name: it.name,
            locationKind: it.locationKind, locationId: it.locationId, locationName: findLoc(locs, it.locationKind, it.locationId)?.name || '',
            aiScore: it.aiScore ?? null, issues: it.aiIssues || [], uploadedAt: it.uploadedAt,
          });
        }
      }
    }
    alerts.sort((a, b) => String(b.uploadedAt).localeCompare(String(a.uploadedAt)));
    return c.json({ alerts });
  });

  // A reviewer's verdict on a photo: OK, or needs cleaning with a note (pushed to the person).
  app.post(`${P}/workplace/flag`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const body = await c.req.json().catch(() => ({}));
    const date = str(body.date, 10); const employeeId = str(body.employeeId, 80); const itemId = str(body.itemId, 40);
    const status = body.status === 'ok' || body.status === 'needs_cleaning' ? body.status : null;
    const note = str(body.note, 300);
    if (!DATE.test(date) || !employeeId || !itemId || !status) return c.json({ error: 'Missing details' }, 400);
    if (status === 'needs_cleaning' && !note) return c.json({ error: 'Write what needs cleaning' }, 400);
    const key = checkKey(date, employeeId);
    const row = await kv.get<CheckRow>(key);
    const it = row?.items?.[itemId];
    if (!row || !it) return c.json({ error: 'No photo for this check yet' }, 404);
    const locs = await loadLocations(kv);
    if (!reviews(actor!, it.locationKind, it.locationId, locs)) return c.json({ error: 'You are not allowed to review this place' }, 403);
    it.flag = { status, note, by: actor!.name, byId: actor!.employeeId || actor!.authUserId, at: new Date().toISOString() };
    if (status === 'needs_cleaning') it.wasFlagged = true;
    await kv.set(key, row);
    // Needs-cleaning always reaches the person; a plain OK only when there's a note, so eleven
    // approvals a day don't turn into eleven pushes.
    if (employeeId !== actor!.employeeId && (status === 'needs_cleaning' || note)) {
      const person = await kv.get<any>(`unified-employee:${employeeId}`);
      const retake = date === deps.getTodayIST() ? ' and take a new photo · পরিষ্কার করে নতুন ছবি দিন' : ' · আবার পরিষ্কার করুন';
      await safeNotify(deps, person?.authUserId, 'workplace_flag',
        status === 'needs_cleaning' ? `Clean again: ${it.name}` : `Looks good: ${it.name}`,
        status === 'needs_cleaning' ? `${note} - please clean it${retake}` : note,
        `${it.locationKind}:${it.locationId}`, date);
    }
    return c.json({ success: true, flag: it.flag });
  });

  // This week (Monday to today) per person at one place: on time, done, needs cleaning, AI average.
  app.get(`${P}/workplace/summary`, async (c: any) => {
    const { actor, error } = await actorOf(deps, c); if (error) return error;
    const loc = parseLocation(c); if (!loc) return c.json({ error: 'Pick a store or production house' }, 400);
    const locs = await loadLocations(kv);
    if (!reviews(actor!, loc.kind, loc.id, locs)) return c.json({ error: 'You are not allowed to see this place' }, 403);
    const today = deps.getTodayIST();
    const from = addDays(today, -((weekdayOf(today) + 6) % 7));
    const nowMin = nowMinutesIST();
    const [employees, rowsByDate] = await Promise.all([
      loadEmployees(kv),
      inBatches(datesBetween(from, today), 8, async (d) => ({ d, rows: ((await kv.getByPrefix<CheckRow>(`workplace-check:${d}:`)) || []).filter((r) => r?.employeeId) })),
    ]);
    const names = new Map(employees.map((e) => [empIdOf(e), String(e.name || empIdOf(e))]));
    const per = new Map<string, { required: number; done: number; onTime: number; needsCleaning: number; scoreSum: number; scored: number }>();
    for (const { d, rows } of rowsByDate) {
      for (const r of rows) {
        const uploaded = Object.entries(r.items || {}).filter(([, it]) => atLocation(it, loc.kind, loc.id));
        // Today's checks count once their window has closed (or a photo is in).
        const due = (r.assigned || []).filter((a) => atLocation(a, loc.kind, loc.id) && (d < today || nowMin > toMin(a.end) || r.items?.[a.id]));
        const ids = new Set([...due.map((a) => a.id), ...uploaded.map(([id]) => id)]);
        if (!ids.size) continue;
        const p = per.get(r.employeeId) || { required: 0, done: 0, onTime: 0, needsCleaning: 0, scoreSum: 0, scored: 0 };
        p.required += ids.size;
        p.done += uploaded.length;
        p.onTime += uploaded.filter(([, it]) => !it.late).length;
        p.needsCleaning += uploaded.filter(([, it]) => it.flag?.status === 'needs_cleaning' || it.wasFlagged).length;
        for (const [, it] of uploaded) if (typeof it.aiScore === 'number' && it.aiVerdict !== 'unclear_photo') { p.scoreSum += it.aiScore; p.scored++; }
        per.set(r.employeeId, p);
      }
    }
    const people = [...per.entries()].map(([employeeId, p]) => ({
      employeeId, name: names.get(employeeId) || 'Former staff', required: p.required, done: p.done, onTime: p.onTime, needsCleaning: p.needsCleaning,
      avgScore: p.scored ? Math.round((p.scoreSum / p.scored) * 10) / 10 : null,
    })).sort((a, b) => a.name.localeCompare(b.name));
    return c.json({ from, to: today, people });
  });

  // ---------------- Cron ----------------
  const cronAllowed = (c: any) => {
    const secret = Deno.env.get('CRON_SYNC_SECRET');
    return !!secret && c.req.header('X-Cron-Secret') === secret;
  };

  // Every 15 minutes (pg_cron, see the workplace_reminders_cron migration): keeps today's rows
  // current (so a day with no photos still counts in KPIs), pushes each person when their window
  // opens, tells the incharge and the owner once a day per person when photos were missed, and
  // scores photos the background check never finished.
  app.post(`${P}/cron/workplace-reminders`, async (c: any) => {
    if (!cronAllowed(c)) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const today = deps.getTodayIST();
      const nowMin = nowMinutesIST();
      const [templates, employees, locs] = await Promise.all([loadAllTemplates(kv), loadEmployees(kv), loadLocations(kv)]);
      const all = assignedOn(templates, today, undefined, coverOn(await loadCoverInputs(kv, employees, locs), today));
      if (!all.length) return c.json({ success: true, people: 0 });
      const byPerson = new Map<string, Assigned[]>();
      for (const a of all) byPerson.set(a.assigneeId, [...(byPerson.get(a.assigneeId) || []), stripAssignee(a)]);
      const [clusterHeads, sentRaw] = await Promise.all([deps.getAllClusterHeads(), kv.get<any>(sentKey(today))]);
      const sent = { date: today, due: { ...(sentRaw?.due || {}) } as Record<string, string[]>, missed: { ...(sentRaw?.missed || {}) } as Record<string, boolean> };
      let sentChanged = false; let duePushes = 0; let missedPushes = 0;
      const rows = await mgetRows<CheckRow>(kv, [...byPerson.keys()].map((id) => checkKey(today, id)));
      const rowOf = new Map(rows.map((r) => [r.employeeId, r]));

      for (const [employeeId, list] of byPerson) {
        const person = employees.find((e) => empIdOf(e) === employeeId);
        let row = rowOf.get(employeeId) || null;
        if (list.some((a) => nowMin >= toMin(a.start) - EARLY_UPLOAD_MINUTES)) {
          const next = syncRow(row, today, employeeId, list);
          if (rowChanged(row, next)) { next.updatedAt = new Date().toISOString(); await kv.set(checkKey(today, employeeId), next); }
          row = next;
        }
        const uploaded = row?.items || {};

        // Window just opened: one push per window, listing what's still to photograph.
        const windows = new Map<string, Assigned[]>();
        for (const a of list) if (nowMin >= toMin(a.start) && nowMin < toMin(a.end) && !uploaded[a.id]) windows.set(`${a.start}-${a.end}`, [...(windows.get(`${a.start}-${a.end}`) || []), a]);
        for (const [win, pending] of windows) {
          if ((sent.due[employeeId] || []).includes(win)) continue;
          sent.due[employeeId] = [...(sent.due[employeeId] || []), win];
          sentChanged = true;
          const end = pending[0].end;
          const names = pending.slice(0, 5).map((a) => a.name).join(', ') + (pending.length > 5 ? ` +${pending.length - 5}` : '');
          const covering = [...new Set(pending.map((a) => a.coveringForName).filter(Boolean))];
          if (await safeNotify(deps, person?.authUserId, 'workplace_due', `Workplace photos due by ${fmt12(end)}`,
            `${pending.length} photo${pending.length === 1 ? '' : 's'}: ${names}.${covering.length ? ` Covering for ${covering.join(', ')} (on leave).` : ''} · ${bnBy(end)} ছবি দিন`, undefined, today)) duePushes++;
        }

        // Window closed without a photo: once a day per person, to the incharge(s) and the owner.
        const missed = list.filter((a) => nowMin > toMin(a.end) && !uploaded[a.id]);
        if (missed.length && !sent.missed[employeeId]) {
          sent.missed[employeeId] = true;
          sentChanged = true;
          const first = missed[0];
          const place = findLoc(locs, first.locationKind, first.locationId);
          const recipients = new Map<string, any>();
          for (const e of inchargesOf(employees, first.locationKind, first.locationId, locs)) if (e.authUserId) recipients.set(e.authUserId, e);
          for (const e of clusterHeads || []) if (e?.authUserId) recipients.set(e.authUserId, e);
          if (person?.authUserId) recipients.delete(person.authUserId);
          const names = missed.slice(0, 5).map((a) => a.name).join(', ') + (missed.length > 5 ? ` +${missed.length - 5}` : '');
          for (const authUserId of recipients.keys()) {
            if (await safeNotify(deps, authUserId, 'workplace_missed', `Workplace photos missed · ${person?.name || employeeId}`,
              `${missed.length} of ${list.length} not sent by ${fmt12(first.end)}${place ? ` at ${place.name}` : ''}: ${names}.`, `${first.locationKind}:${first.locationId}`, today)) missedPushes++;
          }
        }
      }
      if (sentChanged) await kv.set(sentKey(today), sent);
      const leftoversScored = await scoreLeftovers(deps, [...rowOf.values()]).catch((err) => { console.log('Workplace leftover scoring failed:', String(err?.message || err).slice(0, 160)); return 0; });
      return c.json({ success: true, people: byPerson.size, duePushes, missedPushes, leftoversScored });
    } catch (err: any) {
      console.log('Workplace reminders failed:', String(err?.message || err).slice(0, 200));
      return c.json({ error: 'Workplace reminders failed' }, 500);
    }
  });

  // Daily: removes bucket photos older than 60 days (the fallback store only - Drive photos are
  // kept) and old reminder bookkeeping. The day rows stay for KPIs and history.
  app.post(`${P}/cron/workplace-cleanup`, async (c: any) => {
    if (!cronAllowed(c)) return c.json({ error: 'Unauthorized' }, 401);
    const today = deps.getTodayIST();
    const cutoff = addDays(today, -KEEP_BUCKET_DAYS);
    let deleted = 0;
    try {
      const bucket = deps.storage.from(BUCKET);
      const listAll = async (prefix: string): Promise<{ name: string; id: string | null }[]> => {
        const out: { name: string; id: string | null }[] = [];
        for (let offset = 0; offset < 20000; offset += 1000) {
          const { data, error } = await bucket.list(prefix, { limit: 1000, offset });
          if (error || !data?.length) break;
          out.push(...data);
          if (data.length < 1000) break;
        }
        return out;
      };
      // Folders: {date}/{place}/{employee}/files - walk the old date folders only.
      const walk = async (prefix: string, depth: number): Promise<string[]> => {
        const files: string[] = [];
        for (const e of await listAll(prefix)) {
          const p = `${prefix}/${e.name}`;
          if (e.id) files.push(p);
          else if (depth < 3) files.push(...(await walk(p, depth + 1)));
        }
        return files;
      };
      const top = await listAll('');
      for (const day of top.filter((e) => !e.id && DATE.test(e.name) && e.name < cutoff).map((e) => e.name)) {
        const files = await walk(day, 1);
        for (let i = 0; i < files.length; i += 100) {
          const { error } = await bucket.remove(files.slice(i, i + 100));
          if (!error) deleted += Math.min(100, files.length - i);
        }
        if (deleted > 5000) break; // the rest next run
      }
    } catch (err: any) {
      console.log('Workplace photo cleanup skipped:', String(err?.message || err).slice(0, 160));
    }
    let sentRowsRemoved = 0;
    for (const s of (await kv.getByPrefix<any>('workplace-sent:')) || []) {
      if (s?.date && s.date < addDays(today, -7)) { await kv.del(sentKey(s.date)); sentRowsRemoved++; }
    }
    const nowIso = new Date().toISOString();
    for (const link of (await kv.getByPrefix<any>('push-photo:')) || []) {
      if (link?.token && (!link.expiresAt || link.expiresAt < nowIso)) await kv.del(`push-photo:${link.token}`);
    }
    for (const r of (await kv.getByPrefix<any>('workplace-results-sent:')) || []) {
      if (r?.date && r?.employeeId && r.date < addDays(today, -7)) { await kv.del(resultsSentKey(r.date, r.employeeId)); sentRowsRemoved++; }
    }
    return c.json({ success: true, deleted, sentRowsRemoved });
  });
}

// ---------------- KPI helper ----------------
// Totals for one person over a date range (inclusive), from the workplace-check rows. required,
// done and onTime are summed as stored (today's row counts checks whose window hasn't closed yet);
// flaggedNeedsCleaning counts photos currently marked needs-cleaning or ever marked so by a
// reviewer; avgHygieneScore is the mean AI score of scored photos (unreadable photos left out),
// null when none were scored.
export async function workplaceScore(kv: Pick<Kv, 'get' | 'mget'>, employeeId: string, from: string, to: string) {
  const totals = { required: 0, done: 0, onTime: 0, flaggedNeedsCleaning: 0, avgHygieneScore: null as number | null };
  if (!employeeId || !DATE.test(from) || !DATE.test(to) || from > to) return totals;
  const rows = await mgetRows<CheckRow>(kv, datesBetween(from, to).map((d) => checkKey(d, employeeId)));
  let scoreSum = 0; let scored = 0;
  for (const row of rows) {
    if (row?.employeeId !== employeeId) continue;
    totals.required += Number(row.required) || 0;
    totals.done += Number(row.done) || 0;
    totals.onTime += Number(row.onTime) || 0;
    for (const it of Object.values(row.items || {})) {
      if (it?.flag?.status === 'needs_cleaning' || it?.wasFlagged) totals.flaggedNeedsCleaning++;
      if (typeof it?.aiScore === 'number' && it.aiVerdict !== 'unclear_photo') { scoreSum += it.aiScore; scored++; }
    }
  }
  totals.avgHygieneScore = scored ? Math.round((scoreSum / scored) * 10) / 10 : null;
  return totals;
}
