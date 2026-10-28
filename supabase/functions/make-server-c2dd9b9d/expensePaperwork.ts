// Repairs, labour and equipment (owner, 28 Oct 2026, the expenses plan): which machine, what was
// wrong or what job, and who did it (the technician list); a bill photo above ₹500; the owner's OK
// above ₹2,000; and a nudge to replace a machine after 3 repairs in 4 months, or once its repairs
// reach 40% of its price. The checks run with the others in expenseReview.ts; this file has the
// rules, the technician list and the bill photos. Registered from index.ts.
//
//   technician:{id}   a repair person or contractor: name, phone, what they fix
//
// Bill photos live in the private bucket `expense-bills` at {YYYY-MM}/{random}.{ext} and are shown
// through signed links that last an hour. Technicians' numbers stay in the app (owner's OK) and are
// never sent to the AI.

import { isEquipmentExpense } from './assetRules.ts';

export const BILL_PHOTO_ABOVE = 500;
export const APPROVAL_ABOVE = 2000;
export const REPLACE_AFTER_REPAIRS = 3;
export const REPLACE_WINDOW_DAYS = 120; // "3 repairs in 4 months"
export const REPLACE_SHARE = 0.4; // repairs reaching 40% of the price
const SERVICE_CATEGORIES = ['repair', 'labour_charge'];

// Repairs, labour and equipment purchases: the entries the bill and OK rules apply to.
export const needsPaperwork = (source: 'inventory' | 'overhead', item: any) =>
  (source === 'overhead' && SERVICE_CATEGORIES.includes(item?.category)) || isEquipmentExpense(item, source);

// "Fridge (production) · not cooling · by Raju" - what an entry was for, from its repair details.
export function describeRepair(item: any): string {
  const name = String(item?.itemName || item?.description || '').trim();
  const r = item?.repair || {};
  return [name, r.machine && r.machine !== name ? r.machine : '', r.fault, r.technicianName ? `by ${r.technicianName}` : '']
    .filter(Boolean).join(' · ');
}

type Kv = {
  get: (key: string) => Promise<any>;
  set: (key: string, value: any) => Promise<void>;
  del: (key: string) => Promise<void>;
};
export type PaperworkDeps = {
  kv: Kv;
  rows: (prefix: string) => Promise<any[]>;
  verifyUser: (authHeader: string | null) => Promise<any>;
  storage: any; // service-role Supabase Storage client
};
type Technician = { id: string; name: string; phone: string; trade: string; addedBy: string; addedAt: string; updatedAt?: string };

const P = '/make-server-c2dd9b9d';
const BUCKET = 'expense-bills';
const SIGNED_URL_SECONDS = 3600;
const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/;
const BILL_PATH = /^\d{4}-\d{2}\/[a-z0-9]{16,40}\.(jpg|png|webp)$/;
const str = (v: any, max: number) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
// Indian mobile or landline digits; +91 / 0 in front dropped.
const cleanPhone = (v: any) => String(v ?? '').replace(/[^\d]/g, '').replace(/^(91|0)(?=\d{10}$)/, '');

let bucketReady: Promise<void> | null = null;
function ensureBucket(storage: any): Promise<void> {
  if (!bucketReady) {
    bucketReady = (async () => {
      const { data, error } = await storage.getBucket(BUCKET);
      if (data && !error) {
        if (data.public) await storage.updateBucket(BUCKET, { public: false });
        return;
      }
      const { error: createError } = await storage.createBucket(BUCKET, { public: false, fileSizeLimit: MAX_IMAGE_BYTES, allowedMimeTypes: ['image/jpeg', 'image/png', 'image/webp'] });
      if (createError && !/already exists/i.test(createError.message || '')) throw createError;
    })().catch((e) => { bucketReady = null; throw e; });
  }
  return bucketReady;
}

export function registerPaperworkRoutes(app: any, deps: PaperworkDeps) {
  // The owner, operations managers and incharges (the people who log and check these expenses).
  const who = async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const m = auth.user.user_metadata || {};
    const incharge = m.designation === 'store_incharge' || m.designation === 'production_incharge';
    const lead = m.role === 'cluster_head' || (m.role === 'manager' && !incharge);
    if (!lead && !incharge) return { error: c.json({ error: 'Only the owner, operations managers and incharges can do this' }, 403) };
    return { name: String(m.name || auth.user.email || 'Someone'), isOwner: m.role === 'cluster_head' };
  };

  // ---------------- Technicians ----------------
  const readTech = (body: any): { tech?: Pick<Technician, 'name' | 'phone' | 'trade'>; error?: string } => {
    const name = str(body?.name, 60);
    const phone = cleanPhone(body?.phone);
    const trade = str(body?.trade, 60);
    if (name.length < 2) return { error: 'Write the technician\'s name' };
    if (!/^\d{10}$/.test(phone)) return { error: 'The phone number needs 10 digits' };
    return { tech: { name, phone, trade } };
  };

  app.get(`${P}/technicians`, async (c: any) => {
    const w: any = await who(c);
    if (w.error) return w.error;
    const list = ((await deps.rows('technician:')) || []).filter((t: any) => t?.id).sort((a: any, b: any) => a.name.localeCompare(b.name));
    return c.json({ technicians: list });
  });

  app.post(`${P}/technicians`, async (c: any) => {
    const w: any = await who(c);
    if (w.error) return w.error;
    const { tech, error } = readTech(await c.req.json().catch(() => ({})));
    if (error) return c.json({ error }, 400);
    const existing = ((await deps.rows('technician:')) || []).find((t: any) => t?.phone === tech!.phone);
    if (existing) return c.json({ technician: existing, existing: true });
    const t: Technician = { id: `T${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`, ...tech!, addedBy: w.name, addedAt: new Date().toISOString() };
    await deps.kv.set(`technician:${t.id}`, t);
    return c.json({ technician: t });
  });

  app.put(`${P}/technicians/:id`, async (c: any) => {
    const w: any = await who(c);
    if (w.error) return w.error;
    const key = `technician:${c.req.param('id')}`;
    const current = await deps.kv.get(key);
    if (!current) return c.json({ error: 'That technician was not found' }, 404);
    const { tech, error } = readTech(await c.req.json().catch(() => ({})));
    if (error) return c.json({ error }, 400);
    const next = { ...current, ...tech, updatedAt: new Date().toISOString() };
    await deps.kv.set(key, next);
    return c.json({ technician: next });
  });

  app.delete(`${P}/technicians/:id`, async (c: any) => {
    const w: any = await who(c);
    if (w.error) return w.error;
    if (!w.isOwner) return c.json({ error: 'Only the owner can remove a technician' }, 403);
    await deps.kv.del(`technician:${c.req.param('id')}`);
    return c.json({ success: true });
  });

  // ---------------- Bill photos ----------------
  // Stored first; the path then goes with the expense (or onto a flagged entry, expenseReview.ts).
  app.post(`${P}/expense-bills`, async (c: any) => {
    const w: any = await who(c);
    if (w.error) return w.error;
    const body = await c.req.json().catch(() => ({}));
    const m = IMAGE_DATA_URL.exec(typeof body?.image === 'string' ? body.image : '');
    if (!m) return c.json({ error: 'Take a photo of the bill' }, 400);
    let bytes: Uint8Array;
    try {
      const bin = atob(m[2]);
      if (bin.length > MAX_IMAGE_BYTES) return c.json({ error: 'The photo is too large - take it again' }, 400);
      if (bin.length < 500) return c.json({ error: 'That photo is empty - take it again' }, 400);
      bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    } catch {
      return c.json({ error: 'Could not read that photo - take it again' }, 400);
    }
    const ext = m[1] === 'jpeg' ? 'jpg' : m[1];
    const rand = [...crypto.getRandomValues(new Uint8Array(12))].map((b) => b.toString(16).padStart(2, '0')).join('');
    const path = `${new Date(Date.now() + 330 * 60000).toISOString().slice(0, 7)}/${rand}.${ext}`;
    try {
      await ensureBucket(deps.storage);
      const { error } = await deps.storage.from(BUCKET).upload(path, bytes, { contentType: `image/${m[1]}`, upsert: false });
      if (error) throw new Error(error.message);
    } catch (err: any) {
      console.log('Bill photo upload failed:', String(err?.message || err).slice(0, 160));
      return c.json({ error: 'Could not save the bill photo - try again' }, 502);
    }
    return c.json({ path });
  });

  app.get(`${P}/expense-bills/link`, async (c: any) => {
    const w: any = await who(c);
    if (w.error) return w.error;
    const path = String(c.req.query('path') || '');
    if (!BILL_PATH.test(path)) return c.json({ error: 'Bad bill photo' }, 400);
    const { data, error } = await deps.storage.from(BUCKET).createSignedUrl(path, SIGNED_URL_SECONDS);
    if (error || !data?.signedUrl) return c.json({ error: 'The bill photo was not found' }, 404);
    return c.json({ url: data.signedUrl });
  });
}

export const isBillPath = (path: unknown) => typeof path === 'string' && BILL_PATH.test(path);
