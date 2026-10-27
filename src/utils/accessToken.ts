// The signed-in person's access token - always the current one, never the copy taken at login.
//
// Supabase access tokens last an hour. The app used to copy the token into `user.accessToken` at
// login and pass that to every request, so after an hour every call was refused once, renewed and
// retried, and a renewal that failed on a weak signal logged the person out. Requests now ask here
// (api.ts / http.ts do it for every call, whatever token the caller passed), and the answer comes
// from memory while the token is good, from supabase-js when it is nearly due.
//
// Before sign-in currentAccessToken() falls back to the public key, which only the public routes
// (app version, push key) accept.
import { getSupabaseClient, AUTH_STORAGE_KEY } from './supabase/client';
import { publicAnonKey } from './supabase/info';
import { isAuthRetryableFetchError } from '@supabase/supabase-js';
import type { Session } from '@supabase/supabase-js';

type Tracked = { token: string; expiresAt: number; userId: string };

let tracked: Tracked | null = null;
let tracking = false;

// Renew when under a minute is left; supabase-js itself renews 90 s before expiry.
const FRESH_MARGIN_MS = 60_000;
// The longest a request waits for a renewal before going out with the token it has.
const SESSION_WAIT_MS = 8_000;
const REFRESH_WAIT_MS = 20_000;

function remember(session: Session | null | undefined) {
  tracked = session?.access_token
    ? { token: session.access_token, expiresAt: (session.expires_at || 0) * 1000, userId: session.user?.id || '' }
    : null;
}

const TIMED_OUT = Symbol('timed out');
function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | typeof TIMED_OUT> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(TIMED_OUT), ms);
    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      () => { clearTimeout(timer); resolve(TIMED_OUT); },
    );
  });
}

// Keeps `tracked` in step with supabase-js (renewals, sign-out). Idempotent.
export function startAuthTracking(): void {
  if (tracking || typeof window === 'undefined') return;
  tracking = true;
  getSupabaseClient().auth.onAuthStateChange((event, session) => {
    if (event === 'SIGNED_OUT') tracked = null;
    else if (session) remember(session);
  });
}

export interface StoredSession {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string; app_metadata?: Record<string, any>; user_metadata?: Record<string, any> };
}

// The session supabase-js saved on this device, read straight from storage with no network and no
// lock - so the app can open from saved data at once instead of waiting for a token renewal (which
// after a night always happens, and on a weak signal can take 30 s). Null when signed out.
export function peekStoredSession(): StoredSession | null {
  try {
    const raw = localStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const session = parsed?.currentSession ?? parsed; // very old supabase-js wrapped it
    return session?.refresh_token && session?.user?.id ? session as StoredSession : null;
  } catch {
    return null;
  }
}

// The current token for a request, or null when nobody is signed in. On a slow renewal it waits
// at most 8 s and then returns the token it has: a request sent with it either works, fails fast
// offline, or gets a 401 that waits on the same renewal (see refreshAccessToken).
export async function getAccessToken(): Promise<string | null> {
  startAuthTracking();
  if (tracked && tracked.expiresAt - Date.now() > FRESH_MARGIN_MS) return tracked.token;
  const result = await withTimeout(getSupabaseClient().auth.getSession(), SESSION_WAIT_MS);
  if (result === TIMED_OUT || (result.error && isAuthRetryableFetchError(result.error))) {
    return tracked?.token ?? peekStoredSession()?.access_token ?? null;
  }
  remember(result.data.session);
  return result.data.session?.access_token ?? null;
}

export async function currentAccessToken(): Promise<string> {
  try {
    return (await getAccessToken()) || publicAnonKey;
  } catch {
    return publicAnonKey;
  }
}

// The auth user id of whoever is signed in on this device (from memory or storage, no network).
export function currentAuthUserId(): string | null {
  return tracked?.userId || peekStoredSession()?.user?.id || null;
}

export type RefreshResult = { token: string; reason?: undefined } | { token: null; reason: 'network' | 'signed-out' };

// Supabase refresh tokens are single-use: if several requests got a 401 at once and each renewed
// separately, only the first renewal worked and the rest used to force a logout. All concurrent
// callers share one renewal here. 'network' means the renewal couldn't reach the login server (the
// session is kept - never a reason to sign out); 'signed-out' means the login server refused it,
// in which case supabase-js has already removed the session and announced SIGNED_OUT.
let inFlightRefresh: Promise<RefreshResult> | null = null;

export function refreshAccessToken(): Promise<RefreshResult> {
  if (!inFlightRefresh) {
    inFlightRefresh = (async (): Promise<RefreshResult> => {
      const result = await withTimeout(getSupabaseClient().auth.refreshSession(), REFRESH_WAIT_MS);
      if (result === TIMED_OUT) return { token: null, reason: 'network' };
      if (result.error) {
        return { token: null, reason: isAuthRetryableFetchError(result.error) ? 'network' : 'signed-out' };
      }
      if (!result.data.session) return { token: null, reason: 'signed-out' };
      remember(result.data.session);
      return { token: result.data.session.access_token };
    })().finally(() => { inFlightRefresh = null; });
  }
  return inFlightRefresh;
}

// The server refused a freshly renewed token (an archived login, say): sign out on this device
// only. App.tsx hears SIGNED_OUT and shows the sign-in page; saved data and the outbox are kept.
let signingOut = false;
export async function signOutAfterRejection(): Promise<void> {
  if (signingOut) return;
  signingOut = true;
  try {
    await getSupabaseClient().auth.signOut({ scope: 'local' });
  } catch (error) {
    console.warn('Local sign-out failed:', error);
  } finally {
    tracked = null;
    signingOut = false;
  }
}
