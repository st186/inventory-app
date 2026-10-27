// Every request to the app's own server goes through here: api.ts (fetchWithAuth and authFetch), the
// offline outbox and the startup loader. It adds what a weak mobile signal needs:
//  - the current login token (accessToken.ts), renewed once on a 401 - and never a sign-out just
//    because the renewal couldn't reach the login server;
//  - a time limit on every request (reads 20 s, writes 45 s, uploads 90 s, slow jobs 2 min), so no
//    spinner sits there for minutes;
//  - reads retried with backoff on network errors and 5xx. Writes are never retried automatically
//    unless the server dedupes them (feature 'idempotency-v1'), so a lost answer can't turn one
//    expense into two;
//  - one network call for identical reads in flight at the same time, and a 60 s memory copy of the
//    reference lists (employees, stores...) that screens fetch again on every visit;
//  - the optional headers the server advertises in GET /app-version `features`.

import { projectId, publicAnonKey } from './supabase/info';
import { getAccessToken, refreshAccessToken, signOutAfterRejection, currentAuthUserId } from './accessToken';

export const API_BASE = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d`;

// Fired on window when the server answers 403 PASSWORD_EXPIRED (password past 90 days, or the
// owner forced a reset - see passwords.ts on the server). App.tsx listens and shows the blocking
// change-password screen; the event detail is the error body ({ error, code, reason }).
export const PASSWORD_EXPIRED_EVENT = 'bunny:password-expired';

// ============================================
// SERVER FEATURES (GET /app-version)
// ============================================

// What the server says it supports. Each one changes what the app may send, so nothing optional is
// sent until /app-version has answered this session: an unknown header fails the browser's CORS
// check and the whole request with it. Servers from before 28 Oct 2026 send no list = none.
export type ServerFeature = 'cors-v2' | 'bootstrap-v1' | 'idempotency-v1' | 'lean-lists-v1' | 'date-range-v1';

let features: Set<string> | null = null;
let latestVersion: string | null = null;
let featuresPromise: Promise<void> | null = null;
let featuresFailedAt = 0;

export function loadServerFeatures(force = false): Promise<void> {
  if (features) return Promise.resolve();
  if (featuresPromise) return featuresPromise;
  // After a failure (offline), ask again at most every 30 s unless told to (back online).
  if (!force && Date.now() - featuresFailedAt < 30_000) return Promise.resolve();
  featuresPromise = (async () => {
    try {
      const response = await fetchWithTimeout(`${API_BASE}/app-version`, {
        headers: { Authorization: `Bearer ${publicAnonKey}` },
      }, 8_000);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      latestVersion = typeof data?.latestVersion === 'string' ? data.latestVersion : null;
      features = new Set(Array.isArray(data?.features) ? data.features.filter((f: unknown) => typeof f === 'string') : []);
      markReachable();
    } catch {
      featuresFailedAt = Date.now();
    } finally {
      featuresPromise = null;
    }
  })();
  return featuresPromise;
}

export function hasFeature(feature: ServerFeature): boolean {
  return !!features?.has(feature);
}

// Waits for /app-version, but never longer than `maxWaitMs` (then: no optional features).
export async function whenFeaturesKnown(maxWaitMs: number): Promise<void> {
  await Promise.race([loadServerFeatures(), new Promise((r) => setTimeout(r, maxWaitMs))]);
}

export async function getLatestVersion(): Promise<string | null> {
  await loadServerFeatures();
  return latestVersion;
}

// ============================================
// CONNECTIVITY
// ============================================

export type ConnectivityEvent = 'online' | 'offline' | 'resume' | 'reachable';
const connectivityListeners = new Set<(event: ConnectivityEvent) => void>();
let connectivityWired = false;
let lastReachedAt = 0;
let lastNetworkFailureAt = 0;

function emit(event: ConnectivityEvent) {
  connectivityListeners.forEach((listener) => {
    try { listener(event); } catch (error) { console.error('Connectivity listener failed:', error); }
  });
}

function wireConnectivity() {
  if (connectivityWired || typeof window === 'undefined') return;
  connectivityWired = true;
  window.addEventListener('online', () => { loadServerFeatures(true); emit('online'); });
  window.addEventListener('offline', () => emit('offline'));
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') emit('resume');
  });
  // Capacitor fires 'resume' on document when the Android app comes back to the front.
  document.addEventListener('resume', () => emit('resume'));
}

export function onConnectivity(listener: (event: ConnectivityEvent) => void): () => void {
  wireConnectivity();
  connectivityListeners.add(listener);
  return () => { connectivityListeners.delete(listener); };
}

function markReachable() {
  const wasFailing = lastNetworkFailureAt > lastReachedAt;
  lastReachedAt = Date.now();
  if (wasFailing) emit('reachable');
}

function markNetworkFailure() {
  lastNetworkFailureAt = Date.now();
}

// Online as far as we can tell: the phone says it has a network, or the server answered within the
// last minute (navigator.onLine is occasionally wrong; a real answer isn't).
export function isOnline(): boolean {
  if (Date.now() - lastReachedAt < 60_000 && lastReachedAt >= lastNetworkFailureAt) return true;
  return typeof navigator === 'undefined' || navigator.onLine !== false;
}

// True while the most recent request failed on the network (weak signal even if "online").
export function lastRequestFailedOnNetwork(): boolean {
  return lastNetworkFailureAt > lastReachedAt;
}

// ============================================
// ERRORS
// ============================================

export class NetworkError extends Error {
  readonly isNetworkError = true;
  constructor(message: string, readonly timedOut = false) {
    super(message);
    this.name = 'NetworkError';
  }
}

export function isNetworkError(error: unknown): error is NetworkError {
  return !!error && (error as any).isNetworkError === true;
}

const NETWORK_MESSAGE = 'Network error: Unable to connect to server. Please check your internet connection.';
const TIMEOUT_MESSAGE = 'Network error: the server took too long to answer. Please check your internet connection.';

// ============================================
// REQUESTS
// ============================================

export interface HttpOptions {
  timeoutMs?: number;
  // Extra tries for reads after a network error or 5xx (default 2). Writes: see idempotency-v1.
  retries?: number;
  // Writes: the key that makes a repeat harmless (the outbox passes the entry's id). Sent only
  // when the server advertises idempotency-v1.
  idempotencyKey?: string;
  signal?: AbortSignal;
  // Skip the 60 s memory copy for this read (it still shares an identical read in flight).
  noCache?: boolean;
}

export interface RawResponse {
  status: number;
  statusText: string;
  ok: boolean;
  headers: Headers;
  text: string;
}

const READ_TIMEOUT_MS = 20_000;
const WRITE_TIMEOUT_MS = 45_000;
const UPLOAD_TIMEOUT_MS = 90_000;
const SLOW_TIMEOUT_MS = 120_000;
// AI answers, POS syncs, migrations and bulk jobs legitimately take a while.
const SLOW_PATHS = ['/ai/', '/insights/', '/pos-sync/', '/migrate', '/cleanup', '/clear-data', '/fix-', '/sync-designations', '/bulk', '/transfer-inventory'];
const RETRY_DELAYS_MS = [1_000, 3_000, 7_000];

// Reference lists fetched again by most screens on every visit; a 60 s copy in memory answers
// those repeats. Any write through here clears it. Lists that other modules write with their own
// fetch (inventory items, custom items) are left out, as are live lists (notifications, rides).
const MEMORY_CACHE_MS = 60_000;
const MEMORY_CACHE_PATHS = new Set([
  '/employees', '/archived-employees', '/stores', '/production-houses', '/payouts', '/leaves/all',
  '/online-loans', '/menu-item-prices', '/momo-plate-config', '/cluster/info', '/order-item-detail', '/sales-data',
]);
const memoryCache = new Map<string, { at: number; response: RawResponse }>();
const inFlightReads = new Map<string, Promise<RawResponse>>();

export function clearMemoryCache(): void {
  memoryCache.clear();
}

export function newIdempotencyKey(): string {
  const c: Crypto | undefined = typeof crypto !== 'undefined' ? crypto : undefined;
  if (c?.randomUUID) return c.randomUUID();
  const bytes = new Uint8Array(16);
  if (c?.getRandomValues) c.getRandomValues(bytes);
  else for (let i = 0; i < 16; i++) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function pathOf(url: string): string {
  const rest = url.startsWith(API_BASE) ? url.slice(API_BASE.length) : url;
  return rest.split('?')[0] || '/';
}

function bodySize(body: BodyInit | null | undefined): number {
  if (!body) return 0;
  if (typeof body === 'string') return body.length;
  if (typeof Blob !== 'undefined' && body instanceof Blob) return body.size;
  return UPLOAD_SIZE; // FormData and the like: treat as an upload
}
const UPLOAD_SIZE = 200_000;

function timeoutFor(method: string, url: string, body: BodyInit | null | undefined): number {
  const path = pathOf(url);
  if (SLOW_PATHS.some((p) => path.includes(p))) return SLOW_TIMEOUT_MS;
  if (method === 'GET' || method === 'HEAD') return READ_TIMEOUT_MS;
  return bodySize(body) >= UPLOAD_SIZE ? UPLOAD_TIMEOUT_MS : WRITE_TIMEOUT_MS;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const jitter = (ms: number) => Math.round(ms * (0.8 + Math.random() * 0.5));

async function fetchWithTimeout(url: string, init: RequestInit, timeoutMs: number): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

type AttemptResult = { response: RawResponse } | { networkError: NetworkError };

// One try: fetch and read the whole body inside the time limit.
async function attempt(url: string, init: RequestInit, headers: Headers, timeoutMs: number, signal?: AbortSignal): Promise<AttemptResult> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const onOuterAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener('abort', onOuterAbort, { once: true });
  }
  try {
    const response = await fetch(url, { ...init, headers, signal: controller.signal });
    const text = await response.text();
    markReachable();
    return { response: { status: response.status, statusText: response.statusText, ok: response.ok, headers: response.headers, text } };
  } catch (error) {
    if (signal?.aborted) throw error; // the caller gave up: not a network problem
    markNetworkFailure();
    return { networkError: new NetworkError(timedOut ? TIMEOUT_MESSAGE : NETWORK_MESSAGE, timedOut) };
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener('abort', onOuterAbort);
  }
}

function buildHeaders(init: RequestInit, token: string | null, method: string, idempotencyKey: string | undefined): Headers {
  const headers = new Headers(init.headers || {});
  if (token) headers.set('Authorization', `Bearer ${token}`);
  else if (!headers.has('Authorization')) headers.set('Authorization', `Bearer ${publicAnonKey}`);
  // Run the function in Tokyo next to the database instead of Mumbai (each internal call then
  // stays local). Needs the server's CORS to allow the header, hence the feature check.
  if (hasFeature('cors-v2')) headers.set('x-region', 'ap-northeast-1');
  if (method !== 'GET' && method !== 'HEAD' && idempotencyKey && hasFeature('idempotency-v1')) {
    headers.set('Idempotency-Key', idempotencyKey);
  }
  return headers;
}

async function send(url: string, init: RequestInit, opts: HttpOptions): Promise<RawResponse> {
  const method = (init.method || 'GET').toUpperCase();
  const isRead = method === 'GET' || method === 'HEAD';
  const timeoutMs = opts.timeoutMs ?? timeoutFor(method, url, init.body);
  // A write keeps one key across its tries, so the server can tell a repeat from a new entry.
  const idempotencyKey = isRead ? undefined : (opts.idempotencyKey || newIdempotencyKey());
  const canRetry = isRead || hasFeature('idempotency-v1');
  const maxRetries = canRetry ? (opts.retries ?? 2) : 0;

  let token = await getAccessToken();
  let renewed = false;
  for (let tryNo = 0; ; tryNo++) {
    const result = await attempt(url, init, buildHeaders(init, token, method, idempotencyKey), timeoutMs, opts.signal);

    if ('networkError' in result) {
      // No retry while the phone is offline - fail fast and let the caller show saved data.
      if (tryNo < maxRetries && isOnline()) {
        console.warn(`Network error [${url}] (attempt ${tryNo + 1}/${maxRetries + 1}) - retrying...`);
        await sleep(jitter(RETRY_DELAYS_MS[tryNo] ?? 7_000));
        continue;
      }
      throw result.networkError;
    }

    const response = result.response;
    if (response.status >= 500 && tryNo < maxRetries) {
      console.warn(`Server error [${url}] ${response.status} (attempt ${tryNo + 1}/${maxRetries + 1}) - retrying...`);
      await sleep(jitter(RETRY_DELAYS_MS[tryNo] ?? 7_000));
      continue;
    }

    // A 401 usually just means the token ran out while the app was in the background. Renew once
    // and try again; if the server refuses even a fresh token, that's a real rejection (an
    // archived login): sign out on this device.
    if (response.status === 401 && !renewed) {
      renewed = true;
      const refreshed = await refreshAccessToken();
      if (refreshed.token) {
        token = refreshed.token;
        tryNo--; // the retry with the new token doesn't use up a network retry
        continue;
      }
      if (refreshed.reason === 'network') {
        markNetworkFailure();
        throw new NetworkError('Network error: could not renew your login. Please check your internet connection.');
      }
      return response; // signed out by supabase-js; App.tsx shows the sign-in page
    }
    if (response.status === 401 && renewed) {
      console.error('Session rejected by the server even after renewal. Signing out on this device.');
      signOutAfterRejection();
    }
    return response;
  }
}

// The request, with reads shared while in flight and reference lists served from memory for 60 s.
export async function requestRaw(url: string, init: RequestInit = {}, opts: HttpOptions = {}): Promise<RawResponse> {
  const method = (init.method || 'GET').toUpperCase();
  if (method !== 'GET') {
    const response = await send(url, init, opts);
    if (response.ok) clearMemoryCache();
    return response;
  }

  const key = `${currentAuthUserId() || 'anon'}|${url}`;
  const cacheable = MEMORY_CACHE_PATHS.has(pathOf(url)) && !opts.noCache;
  if (cacheable) {
    const hit = memoryCache.get(key);
    if (hit && Date.now() - hit.at < MEMORY_CACHE_MS) return hit.response;
  }

  let shared = inFlightReads.get(key);
  if (!shared) {
    // The shared call isn't tied to any one caller's signal (one leaving the screen mustn't cancel
    // it for the others); each caller's own signal is honoured below.
    shared = send(url, init, { ...opts, signal: undefined }).then((response) => {
      if (cacheable && response.ok) memoryCache.set(key, { at: Date.now(), response });
      return response;
    }).finally(() => { inFlightReads.delete(key); });
    inFlightReads.set(key, shared);
  }
  if (!opts.signal) return shared;
  const signal = opts.signal;
  return new Promise<RawResponse>((resolve, reject) => {
    const onAbort = () => reject(new DOMException('Aborted', 'AbortError'));
    if (signal.aborted) return onAbort();
    signal.addEventListener('abort', onAbort, { once: true });
    shared!.then(resolve, reject).finally(() => signal.removeEventListener('abort', onAbort));
  });
}

// JSON request with the app's error conventions: throws an Error carrying `status` and `details`
// (the error body - e.g. the AI allowance's limit / retryAfterMinutes) on any non-2xx answer, and a
// NetworkError when the server couldn't be reached.
export async function requestJson<T = any>(url: string, init: RequestInit = {}, opts: HttpOptions = {}): Promise<T> {
  const headers = new Headers(init.headers || {});
  const isForm = typeof FormData !== 'undefined' && init.body instanceof FormData;
  if (!headers.has('Content-Type') && !isForm) headers.set('Content-Type', 'application/json');
  const response = await requestRaw(url, { ...init, headers }, opts);
  return parseJsonResponse<T>(url, response);
}

export function parseJsonResponse<T = any>(url: string, response: RawResponse): T {
  let body: any = null;
  let parseError: unknown = null;
  if (response.text) {
    try { body = JSON.parse(response.text); } catch (error) { parseError = error; }
  }
  if (!response.ok) {
    const message = (body && (body.error || body.message)) || `HTTP ${response.status}: ${response.statusText}`;
    console.error(`API Error [${url}]:`, message);
    if (response.status === 403 && body?.code === 'PASSWORD_EXPIRED' && typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent(PASSWORD_EXPIRED_EVENT, { detail: body }));
    }
    throw Object.assign(new Error(message), { status: response.status, details: body });
  }
  if (parseError) throw parseError;
  if (body?.warning) console.warn(`API Warning [${url}]:`, body.warning);
  return body as T;
}

// Drop-in for fetch() on the app's server: same Response back, but with the current token in place
// of whatever Authorization the caller set, plus the time limit, retries and headers above.
export async function authFetch(url: string, init: RequestInit = {}, opts: HttpOptions = {}): Promise<Response> {
  const response = await requestRaw(url, init, opts);
  const nullBody = response.status === 204 || response.status === 205 || response.status === 304;
  return new Response(nullBody ? null : response.text, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}
