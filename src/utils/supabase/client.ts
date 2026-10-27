import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { projectId, publicAnonKey } from './info';

// Create a singleton Supabase client to avoid multiple instances
// Use window to persist across hot module reloads in development
declare global {
  interface Window {
    __supabaseClient?: SupabaseClient;
  }
}

// Where supabase-js keeps the session in localStorage. accessToken.ts reads it directly at startup
// so the app can open from saved data before any token renewal has finished.
export const AUTH_STORAGE_KEY = `sb-${projectId}-auth-token`;

const AUTH_TIMEOUT_MS = 15_000;

// Calls to the login server (mostly token renewals) get a time limit, and any answer that isn't a
// definite refusal becomes a plain network error. supabase-js signs the person out when a renewal
// is refused, and it counted as "refused" a stalled request, a Wi-Fi login page, a proxy error page,
// the login server's own 5xx and a rate limit (429). On a weak signal that signed people out and
// wiped their saved data. As a network error the renewal is retried and the session kept; only a
// 4xx JSON answer from the login server itself (bad or revoked refresh token) still signs out.
async function authFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), AUTH_TIMEOUT_MS);
  const outer = init?.signal;
  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', () => controller.abort(), { once: true });
  }
  try {
    const response = await fetch(input, { ...init, signal: controller.signal });
    const isJson = (response.headers.get('content-type') || '').includes('json');
    if (!response.ok && (!isJson || response.status >= 500 || response.status === 429 || response.status === 408)) {
      throw new TypeError(`Failed to fetch (login server answered ${response.status})`);
    }
    return response;
  } finally {
    clearTimeout(timer);
  }
}

export function getSupabaseClient() {
  if (typeof window !== 'undefined' && !window.__supabaseClient) {
    window.__supabaseClient = createClient(
      `https://${projectId}.supabase.co`,
      publicAnonKey,
      {
        auth: {
          // Use a unique storage key to prevent conflicts
          storageKey: AUTH_STORAGE_KEY,
          // Ensure only one client instance
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: true
        },
        global: { fetch: authFetch }
      }
    );
  }
  return window.__supabaseClient!;
}
