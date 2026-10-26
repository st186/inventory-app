// Password rotation (owner, 27 Oct 2026: "periodically ask people to change password").
// Registered from index.ts with registerPasswordRoutes; the login gate there calls passwordGate.
//
// Stored in app_metadata, which only this server can write (user_metadata is editable by the
// signed-in person themself, so a policy kept there could be switched off from the phone):
//   passwordChangedAt  ISO time of the last change
//   mustChangePassword true after the owner forces a reset
//   passwordChangedBy  'self' | 'owner'
//
// Policy: a password lasts 90 days. The app shows a banner from 7 days before, and the daily cron
// pushes a reminder at 7, 3 and 1 days left. Once it has expired, or the owner forced a reset,
// every route except the password ones answers 403 PASSWORD_EXPIRED until a new one is set.
//
// Logins that never had passwordChangedAt count as changed when this first ran (kept once in KV
// under password-policy:first-seen) or when the login was created, whichever is later, so nobody
// is locked out on day one and a login made later gets its own full 90 days.
//
// The strength rules are mirrored in src/utils/passwordPolicy.ts for the live checklist in the
// app - keep the two in sync. Passwords and tokens are never logged or stored.

import { createClient } from 'npm:@supabase/supabase-js@2';

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  getByPrefix: <T = any>(prefix: string) => Promise<T[]>;
};
type Deps = {
  // Service-role client (index.ts's): admin user reads/updates and session sign-outs.
  supabase: any;
  verifyUser: (authHeader: string | null) => Promise<any>;
  kv: Kv;
  notifyUser: (userId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => Promise<any>;
  // index.ts caches verified tokens for 30 s; after a change that cache would still show the old
  // app_metadata (and keep someone blocked who has just fixed their password).
  forgetVerifiedTokens?: () => void;
};

export const PASSWORD_MAX_AGE_DAYS = 90;
export const PASSWORD_WARN_DAYS = 7;
const REMINDER_DAYS = [7, 3, 1];
const MIN_LENGTH = 10;
// bcrypt (Supabase Auth) only reads the first 72 bytes; Auth refuses longer ones outright.
const MAX_BYTES = 72;
const COMMON_WORDS = ['bunny', 'momo', 'bhandar', 'password', '1234', 'qwerty'];
const FIRST_SEEN_KEY = 'password-policy:first-seen';
const DAY_MS = 24 * 60 * 60 * 1000;
const IST_OFFSET_MS = 330 * 60 * 1000;
// Wrong current-password tries before change-password pauses: each try is a real sign-in against
// Supabase Auth, which rate-limits sign-ins per IP - and every try comes from this server's IP,
// so one person guessing could slow sign-in for everyone.
const MAX_WRONG_TRIES = 5;
const WRONG_TRY_WINDOW_MS = 15 * 60 * 1000;
const P = '/make-server-c2dd9b9d';

// Routes that still answer while a password is expired: the two needed to fix it, and push
// (un)subscribe so "Log out" on the blocking screen still detaches the phone and a fresh login
// still registers it (both are limited to the caller's own phone by the login gate).
// /health and /app-version are public, so they never reach the gate at all.
const OPEN_WHILE_EXPIRED = [
  /^\/auth\/password-status$/,
  /^\/auth\/change-password$/,
  /^\/push\/(subscribe|unsubscribe|subscribe-fcm|unsubscribe-fcm)$/,
];

let deps: Deps | null = null;
let firstSeenAt: string | null = null;

export type PasswordStatus = {
  changedAt: string;
  expiresAt: string;
  // Whole IST calendar days until the expiry day (0 = expires today). Calendar days rather than
  // 24-hour blocks so the once-a-day reminder never skips or repeats a count.
  daysLeft: number;
  mustChange: boolean;
  reason: 'expired' | 'reset' | null;
  changedBy: 'self' | 'owner' | null;
  // true when no change was ever recorded and the deploy/creation date stands in for it.
  assumed: boolean;
};

const validIso = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
const istDayNumber = (ms: number) => Math.floor((ms + IST_OFFSET_MS) / DAY_MS);
const istDate = (ms: number) => new Date(ms + IST_OFFSET_MS).toISOString().slice(0, 10);

async function firstSeen(kv: Kv): Promise<string> {
  if (firstSeenAt) return firstSeenAt;
  const stored = await kv.get<any>(FIRST_SEEN_KEY);
  if (validIso(stored?.at)) return (firstSeenAt = stored.at);
  const now = new Date().toISOString();
  await kv.set(FIRST_SEEN_KEY, { at: now, note: 'Password rotation started; logins with no recorded change count as changed at this time' });
  return (firstSeenAt = now);
}

function statusOf(user: any, since: string, now = Date.now()): PasswordStatus {
  const app = user?.app_metadata || {};
  const recorded = validIso(app.passwordChangedAt) ? app.passwordChangedAt : null;
  let changedAt = recorded || since;
  if (!recorded && validIso(user?.created_at) && Date.parse(user.created_at) > Date.parse(changedAt)) changedAt = user.created_at;
  const expiresMs = Date.parse(changedAt) + PASSWORD_MAX_AGE_DAYS * DAY_MS;
  const reset = app.mustChangePassword === true;
  const expired = now >= expiresMs;
  return {
    changedAt,
    expiresAt: new Date(expiresMs).toISOString(),
    daysLeft: Math.max(0, istDayNumber(expiresMs) - istDayNumber(now)),
    mustChange: reset || expired,
    reason: reset ? 'reset' : expired ? 'expired' : null,
    changedBy: app.passwordChangedBy === 'self' || app.passwordChangedBy === 'owner' ? app.passwordChangedBy : null,
    assumed: !recorded,
  };
}

// Called by the login gate in index.ts for every signed-in request. Returns the 403 body when the
// caller's password must be changed first, or null to let the request through.
export async function passwordGate(path: string, user: any): Promise<{ error: string; code: 'PASSWORD_EXPIRED'; reason: string } | null> {
  if (!deps || !user?.id || OPEN_WHILE_EXPIRED.some((r) => r.test(path))) return null;
  let status: PasswordStatus;
  try {
    status = statusOf(user, await firstSeen(deps.kv));
    if (!status.mustChange) return null;
    // verifyUser answers from a 30-second cache per server copy, so someone who changed their
    // password a moment ago (perhaps through another copy) can still look expired here. Check the
    // live record before blocking - this extra read only ever happens for blocked people.
    const { data } = await deps.supabase.auth.admin.getUserById(user.id);
    if (data?.user) status = statusOf(data.user, await firstSeen(deps.kv));
  } catch (e) {
    // A database hiccup must not lock the whole team out: the sign-in itself was already checked
    // by the gate, and expiry is a rotation policy on top of it.
    console.log('Password expiry check skipped:', e instanceof Error ? e.message : String(e));
    return null;
  }
  if (!status.mustChange) return null;
  return {
    error: status.reason === 'reset'
      ? 'The owner reset your password. Set a new one to continue.'
      : 'Your password is more than 90 days old. Set a new one to continue.',
    code: 'PASSWORD_EXPIRED',
    reason: status.reason || 'expired',
  };
}

// ---- Strength rules (mirrored in src/utils/passwordPolicy.ts) ----

// Lower-case letters and digits only, and the same with common look-alike swaps undone
// ("p@ssw0rd" -> "password"), so punctuation or swaps don't sneak a banned word through.
const squash = (s: string) => s.toLowerCase().replace(/[^a-z0-9]/g, '');
const unswap = (s: string) => s.toLowerCase()
  .replace(/0/g, 'o').replace(/[1!|]/g, 'i').replace(/3/g, 'e').replace(/[4@]/g, 'a').replace(/[5$]/g, 's').replace(/7/g, 't');
const containsWord = (pw: string, word: string) =>
  squash(pw).includes(squash(word)) || squash(unswap(pw)).includes(squash(unswap(word)));

type Person = { name?: string; employeeId?: string; email?: string };

// Bits of the person's identity a password must not contain. Name and email parts need 4+
// letters: shorter ones ("Das", "Sen", "Roy") would also ban everyday words like "present".
function personalWords(person: Person): string[] {
  const words = new Set<string>();
  const name = (person.name || '').toLowerCase();
  const local = (person.email || '').toLowerCase().split('@')[0];
  for (const part of [...name.split(/[^a-z]+/), ...local.split(/[^a-z]+/)]) if (part.length >= 4) words.add(part);
  for (const whole of [squash(name), squash(local), squash(person.employeeId || '')]) if (whole.length >= 3) words.add(whole);
  return [...words];
}

export function passwordProblems(pw: string, person: Person): { code: string; message: string }[] {
  const problems: { code: string; message: string }[] = [];
  if ([...pw].length < MIN_LENGTH) problems.push({ code: 'too_short', message: `Use at least ${MIN_LENGTH} characters` });
  if (!/[A-Za-z]/.test(pw) || !/[0-9]/.test(pw)) problems.push({ code: 'needs_letter_and_digit', message: 'Use both letters (A-Z) and numbers (0-9)' });
  if (new TextEncoder().encode(pw).length > MAX_BYTES) problems.push({ code: 'too_long', message: `Use at most ${MAX_BYTES} characters` });
  if (personalWords(person).some((w) => containsWord(pw, w))) problems.push({ code: 'personal_info', message: 'Do not use your name, staff ID or email in it' });
  if (COMMON_WORDS.some((w) => containsWord(pw, w))) problems.push({ code: 'common_word', message: 'Do not use easy words like bunny, momo, bhandar, password, 1234 or qwerty' });
  return problems;
}

// ---- Sign-in helpers ----

// A separate client that stores nothing, so checking a password never touches the server's own
// service-role client.
function throwawayClient() {
  const url = Deno.env.get('SUPABASE_URL');
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY');
  if (!url || !anonKey) throw new Error('SUPABASE_URL / SUPABASE_ANON_KEY are not set');
  return createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });
}

type SignInResult = { ok: true; accessToken: string } | { ok: false; busy: boolean };

async function trySignIn(email: string, password: string): Promise<SignInResult> {
  const { data, error } = await throwawayClient().auth.signInWithPassword({ email, password });
  if (error || !data?.session) {
    // 429 / 5xx means Auth is rate-limiting or down, not that the password is wrong.
    const status = Number((error as any)?.status) || 0;
    return { ok: false, busy: status === 429 || status >= 500 };
  }
  return { ok: true, accessToken: data.session.access_token };
}

// Ends sessions using one of the person's own tokens - supabase-js v2 has no "sign out by user id".
async function signOutWith(accessToken: string, scope: 'local' | 'others' | 'global'): Promise<boolean> {
  try {
    const { error } = await deps!.supabase.auth.admin.signOut(accessToken, scope);
    return !error;
  } catch {
    return false;
  }
}

const isWeakPasswordError = (error: any) =>
  error?.code === 'weak_password' || error?.name === 'AuthWeakPasswordError' || /weak|pwned|leak/i.test(String(error?.message || ''));

// Easy to read out over the phone: lower-case letters and digits without look-alikes (0/o, 1/l/i),
// as three groups of four (about 59 bits). It only has to last until the person signs in once.
const TEMP_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
function makeTemporaryPassword(person: Person): string {
  for (;;) {
    const chars: string[] = [];
    // 248 = 31 * 8: dropping bytes above it keeps every character equally likely.
    for (const b of crypto.getRandomValues(new Uint8Array(64))) {
      if (b < 248) chars.push(TEMP_ALPHABET[b % TEMP_ALPHABET.length]);
      if (chars.length === 12) break;
    }
    if (chars.length < 12) continue;
    const pw = `${chars.slice(0, 4).join('')}-${chars.slice(4, 8).join('')}-${chars.slice(8).join('')}`;
    if (passwordProblems(pw, person).length === 0) return pw;
  }
}

async function personOf(kv: Kv, user: any): Promise<Person> {
  const employeeId = user?.user_metadata?.employeeId || user?.app_metadata?.employeeId || '';
  const names = [user?.user_metadata?.name || ''];
  if (employeeId) {
    try {
      const employee = await kv.get<any>(`unified-employee:${employeeId}`);
      if (employee?.name) names.push(employee.name);
    } catch { /* the login's own name is enough */ }
  }
  return { name: names.join(' '), employeeId, email: user?.email || '' };
}

async function listAllUsers(supabase: any): Promise<any[]> {
  const users: any[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const batch = data?.users || [];
    users.push(...batch);
    if (batch.length < 1000) break;
  }
  return users;
}

const BN_DIGITS = '০১২৩৪৫৬৭৮৯';
const bn = (n: number) => String(n).replace(/[0-9]/g, (d) => BN_DIGITS[Number(d)]);

function reminderText(daysLeft: number) {
  const en = daysLeft === 1 ? 'tomorrow' : `in ${daysLeft} days`;
  const bnWhen = daysLeft === 1 ? 'আগামীকাল' : `${bn(daysLeft)} দিনের মধ্যে`;
  return {
    title: `Password expires ${en}`,
    message: `Change it from the menu: Change password. পাসওয়ার্ডের মেয়াদ ${bnWhen} শেষ হবে - মেনু থেকে "পাসওয়ার্ড বদলান" চাপুন।`,
  };
}

export function registerPasswordRoutes(app: any, d: Deps) {
  deps = d;
  const { supabase, verifyUser, kv } = d;

  app.get(`${P}/auth/password-status`, async (c: any) => {
    const auth = await verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);
    try {
      const status = statusOf(auth.user, await firstSeen(kv));
      return c.json({ ...status, policy: { maxAgeDays: PASSWORD_MAX_AGE_DAYS, warnDays: PASSWORD_WARN_DAYS, minLength: MIN_LENGTH, maxBytes: MAX_BYTES } });
    } catch (e) {
      console.error('password-status failed:', e instanceof Error ? e.message : String(e));
      return c.json({ error: 'Could not read the password status' }, 500);
    }
  });

  app.post(`${P}/auth/change-password`, async (c: any) => {
    const auth = await verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);
    const user = auth.user;
    const who = user.user_metadata?.employeeId || user.id;
    const body = await c.req.json().catch(() => ({}));
    const currentPassword = typeof body?.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body?.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || !newPassword) return c.json({ error: 'Enter your current password and a new one', code: 'MISSING_FIELDS' }, 400);
    if (!user.email) return c.json({ error: 'This login has no email address', code: 'NO_EMAIL' }, 400);

    const triesKey = `password-policy:wrong-tries:${user.id}`;
    let now = '';
    try {
      const tries = await kv.get<any>(triesKey);
      const recentTries = tries && validIso(tries.since) && Date.now() - Date.parse(tries.since) < WRONG_TRY_WINDOW_MS ? Number(tries.count) || 0 : 0;
      if (recentTries >= MAX_WRONG_TRIES) {
        return c.json({ error: 'Too many wrong tries. Wait 15 minutes and try again.', code: 'TOO_MANY_TRIES' }, 429);
      }

      const problems = passwordProblems(newPassword, await personOf(kv, user));
      // The current password is confirmed by a real sign-in just below, so comparing the two
      // strings is the same test as signing in with the new one - without a second sign-in
      // counting against Auth's per-IP limit.
      if (newPassword === currentPassword) problems.push({ code: 'same_as_current', message: 'The new password must be different from the current one' });
      if (problems.length) return c.json({ error: problems[0].message, code: 'WEAK_PASSWORD', problems }, 400);

      const check = await trySignIn(user.email, currentPassword);
      if (!check.ok) {
        if (check.busy) return c.json({ error: 'Could not check your password right now. Try again in a few minutes.', code: 'AUTH_BUSY' }, 429);
        await kv.set(triesKey, { count: recentTries + 1, since: recentTries ? tries.since : new Date().toISOString() });
        return c.json({ error: 'Your current password is not right', code: 'WRONG_CURRENT_PASSWORD' }, 400);
      }
      // That check opened a session of its own; close it straight away.
      await signOutWith(check.accessToken, 'local');
      if (recentTries) await kv.set(triesKey, { count: 0, since: new Date().toISOString() });

      now = new Date().toISOString();
      const { error } = await supabase.auth.admin.updateUserById(user.id, {
        password: newPassword,
        app_metadata: { passwordChangedAt: now, mustChangePassword: false, passwordChangedBy: 'self' },
      });
      if (error) {
        if (isWeakPasswordError(error)) {
          // Supabase Auth's own rules (dashboard password requirements, leaked-password check).
          return c.json({
            error: 'This password is too easy to guess or has shown up in a data leak. Choose another.',
            code: 'WEAK_PASSWORD',
            problems: [{ code: 'rejected_by_auth', message: 'Rejected by the sign-in service' }],
          }, 400);
        }
        console.error(`Password change failed for ${who}:`, error.message);
        return c.json({ error: 'Could not change the password. Try again.' }, 500);
      }
    } catch (e) {
      console.error(`Password change failed for ${who}:`, e instanceof Error ? e.message : String(e));
      return c.json({ error: 'Could not change the password. Try again.' }, 500);
    }

    // The password is changed: nothing below may fail the request (the app would retry, and the
    // retry would then find the "current" password wrong).
    // Other phones signed in as this person must sign in again with the new password. Supabase
    // Auth may already have ended them as part of the password update; this makes sure.
    const callerToken = (c.req.header('Authorization') || '').split(' ')[1] || '';
    const otherSessionsSignedOut = callerToken ? await signOutWith(callerToken, 'others') : false;
    d.forgetVerifiedTokens?.();
    console.log(`🔑 Password changed by ${who}`);
    return c.json({ success: true, otherSessionsSignedOut, ...statusOf({ app_metadata: { passwordChangedAt: now, passwordChangedBy: 'self' } }, now) });
  });

  // Owner only (ROLE_GATES in index.ts, checked again here so the route is safe on its own).
  app.post(`${P}/admin/employees/:employeeId/force-password-reset`, async (c: any) => {
    const auth = await verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);
    if (auth.user.user_metadata?.role !== 'cluster_head') return c.json({ error: 'You are not allowed to do this' }, 403);
    const employeeId = c.req.param('employeeId');
    try {
      const employee = await kv.get<any>(`unified-employee:${employeeId}`);
      if (!employee) return c.json({ error: 'Employee not found' }, 404);
      if (!employee.authUserId) return c.json({ error: 'This person has no app login yet' }, 409);
      if (employee.authUserId === auth.user.id) return c.json({ error: 'Use "Change password" in the menu for your own login' }, 400);
      const { data: target, error: getError } = await supabase.auth.admin.getUserById(employee.authUserId);
      if (getError || !target?.user) return c.json({ error: 'Their app login was not found' }, 404);
      const email = target.user.email || employee.email || '';

      const temporaryPassword = makeTemporaryPassword({ name: employee.name, employeeId, email });
      const { error } = await supabase.auth.admin.updateUserById(employee.authUserId, {
        password: temporaryPassword,
        app_metadata: { passwordChangedAt: new Date().toISOString(), mustChangePassword: true, passwordChangedBy: 'owner' },
      });
      if (error) {
        console.error(`Force password reset failed for ${employeeId}:`, error.message);
        return c.json({ error: 'Could not reset the password. Try again.' }, 500);
      }

      // Sign them out on every phone. supabase-js can only end sessions with one of the person's
      // own tokens, so open one with the temporary password and end all of theirs ('global')
      // with it. Their access token still works until it lapses (up to an hour), but the expiry
      // gate already blocks it because mustChangePassword is set.
      let signedOutEverywhere = false;
      try {
        const session = email ? await trySignIn(email, temporaryPassword) : null;
        if (session?.ok) signedOutEverywhere = await signOutWith(session.accessToken, 'global');
      } catch { /* the reset itself worked; report it below */ }
      d.forgetVerifiedTokens?.();
      console.log(`🔑 Password force-reset for ${employeeId} by ${auth.user.user_metadata?.employeeId || auth.user.id}`);

      // Shown once to the owner and never stored anywhere.
      c.header('Cache-Control', 'no-store');
      return c.json({ success: true, employeeId, name: employee.name || '', email, temporaryPassword, signedOutEverywhere });
    } catch (e) {
      console.error(`Force password reset failed for ${employeeId}:`, e instanceof Error ? e.message : String(e));
      return c.json({ error: 'Could not reset the password. Try again.' }, 500);
    }
  });

  // Daily at 10:00 IST (pg_cron, see the password_reminders_cron migration): push + in-app
  // notification at 7, 3 and 1 days left. Each count is sent once per password, so a second run
  // on the same day (pg_cron retry, manual trigger) sends nothing new.
  app.post(`${P}/cron/password-reminders`, async (c: any) => {
    const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
    if (!expectedSecret || c.req.header('X-Cron-Secret') !== expectedSecret) return c.json({ error: 'Unauthorized' }, 401);
    try {
      const since = await firstSeen(kv);
      const today = istDate(Date.now());
      // Only people with a current staff record: archived staff and stray test logins get nothing.
      const staff = new Set(((await kv.getByPrefix<any>('unified-employee:')) || []).map((e) => e?.authUserId).filter(Boolean));
      let checked = 0;
      let reminded = 0;
      for (const user of await listAllUsers(supabase)) {
        if (!staff.has(user.id)) continue;
        if (validIso(user.banned_until) && Date.parse(user.banned_until) > Date.now()) continue;
        checked++;
        const status = statusOf(user, since);
        if (status.mustChange || !REMINDER_DAYS.includes(status.daysLeft)) continue;
        const key = `password-policy:reminded:${user.id}`;
        const sent = await kv.get<any>(key);
        const sentDays: number[] = sent?.expiresAt === status.expiresAt && Array.isArray(sent.days) ? sent.days : [];
        if (sentDays.includes(status.daysLeft)) continue;
        const { title, message } = reminderText(status.daysLeft);
        await d.notifyUser(user.id, 'password_expiring', title, message, undefined, today);
        await kv.set(key, { expiresAt: status.expiresAt, days: [...sentDays, status.daysLeft] });
        reminded++;
      }
      console.log(`🔑 Password reminders: ${reminded} sent, ${checked} logins checked`);
      return c.json({ success: true, checked, reminded });
    } catch (e) {
      console.error('Password reminders failed:', e instanceof Error ? e.message : String(e));
      return c.json({ error: 'Password reminders failed' }, 500);
    }
  });
}
