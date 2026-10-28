// "Complete your profile": each person adds their own Aadhaar card photos (front and back), phone
// number and personal email from their home screen (owner, 27 Oct 2026). Login emails are
// placeholder addresses, so the personal one is kept separately as contactEmail and the login
// email is left alone. Only the signed-in person's own record can be changed here - the
// employee routes stay limited to managers and the owner. Registered from index.ts.

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
};
type Deps = { kv: Kv; verifyUser: (authHeader: string | null) => Promise<any> };

const MAX_IMAGE_CHARS = 2_500_000; // a data URL of about 1.8 MB; the app sends ~300 KB JPEGs
const IMAGE_DATA_URL = /^data:image\/(jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
// Indian mobile: 10 digits starting 6-9, with an optional +91 / 0 in front.
const normalisePhone = (raw: string) => {
  const digits = String(raw || '').replace(/\D/g, '').replace(/^(91|0)(?=\d{10}$)/, '');
  return /^[6-9]\d{9}$/.test(digits) ? digits : null;
};

function missingFields(emp: any) {
  const missing: string[] = [];
  if (!emp?.aadharFront) missing.push('aadharFront');
  if (!emp?.aadharBack) missing.push('aadharBack');
  if (!emp?.phone) missing.push('phone');
  if (!emp?.contactEmail) missing.push('contactEmail');
  return missing;
}

export function registerProfileRoutes(app: any, deps: Deps) {
  const P = '/make-server-c2dd9b9d';

  const me = async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { error: c.json({ error: auth.error }, auth.status) };
    const meta = auth.user.user_metadata || {};
    // The owner and the audit login aren't asked to fill this in.
    if (meta.role === 'cluster_head' || meta.role === 'audit' || !meta.employeeId) return { skip: true };
    const key = `unified-employee:${meta.employeeId}`;
    const emp = await deps.kv.get<any>(key);
    if (!emp) return { skip: true };
    return { key, emp };
  };

  app.get(`${P}/me/profile`, async (c: any) => {
    const r = await me(c);
    if (r.error) return r.error;
    if (r.skip) return c.json({ required: false, complete: true, missing: [] });
    const missing = missingFields(r.emp);
    return c.json({
      required: true,
      complete: missing.length === 0,
      missing,
      phone: r.emp.phone || '',
      contactEmail: r.emp.contactEmail || '',
    });
  });

  app.put(`${P}/me/profile`, async (c: any) => {
    const r = await me(c);
    if (r.error) return r.error;
    if (r.skip) return c.json({ error: 'Nothing to update for this login' }, 400);
    const body = await c.req.json().catch(() => ({}));
    const updates: Record<string, any> = {};
    if (body.phone !== undefined) {
      const phone = normalisePhone(body.phone);
      if (!phone) return c.json({ error: 'Enter a 10-digit mobile number' }, 400);
      updates.phone = phone;
    }
    if (body.contactEmail !== undefined) {
      const email = String(body.contactEmail || '').trim().toLowerCase();
      if (!EMAIL.test(email) || email.length > 120) return c.json({ error: 'Enter a valid email address' }, 400);
      updates.contactEmail = email;
    }
    for (const side of ['aadharFront', 'aadharBack'] as const) {
      if (body[side] === undefined) continue;
      const img = String(body[side] || '');
      if (!IMAGE_DATA_URL.test(img)) return c.json({ error: 'The Aadhaar photo must be a JPEG, PNG or WebP image' }, 400);
      if (img.length > MAX_IMAGE_CHARS) return c.json({ error: 'The Aadhaar photo is too large - take it again' }, 400);
      updates[side] = img;
    }
    if (!Object.keys(updates).length) return c.json({ error: 'Nothing to save' }, 400);
    const next = { ...r.emp, ...updates, profileUpdatedAt: new Date().toISOString() };
    await deps.kv.set(r.key, next);
    const missing = missingFields(next);
    return c.json({ complete: missing.length === 0, missing, phone: next.phone || '', contactEmail: next.contactEmail || '' });
  });
}
