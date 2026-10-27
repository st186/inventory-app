// Each person's last good copy of the app's data, kept on the phone so the app opens straight onto
// it ("Updated 10 min ago") and refreshes in the background, even with no signal at all.
//
// Stored in IndexedDB (idbStore.ts): the copy is ~5 MB per person and localStorage, where it used
// to live, holds 5-10 MB per app - on a shared counter phone the second person's copy failed to save
// without a word. Kept for 7 days (it used to be deleted after an hour, so the first open of every
// day started from nothing). Phones are shared, so every record is per signed-in person.
//
// Records:  meta:<person>       { version, fetchedAt, savedAt, hash, etag, lastFullAt, profile }
//           ds:<person>:<key>   { savedAt, data }
// The small meta record answers "how fresh is it?" without reading megabytes of data.
//
// USAGE:
// - setCacheUser(id): whose copy is read and written - on sign-in, null on sign-out
// - readCache(keys): the saved copy (skips anything older than 7 days)
// - writeDataset(key, data): save one dataset (after a load or a change on this phone)
// - markFetched(...): record that datasets came fresh from the server
// - invalidateCache(key): mark a dataset as needing a refresh (the copy stays for instant start)
// - invalidateAllCaches(): wipe every saved copy on this phone (manual logout only)

import { idbDelete, idbEntries, idbGetMany, idbSet } from './idbStore';

const CACHE_VERSION = 3; // 3: IndexedDB, per dataset (1-2 were localStorage)
const FRESH_MS = 5 * 60 * 1000; // fresh: no refresh needed yet
const KEEP_MS = 7 * 24 * 60 * 60 * 1000; // kept this long for opening without a signal
const LEGACY_PREFIX = 'bhandar_cache_';

export interface CachedProfile {
  storeId: string | null;
  designation: string | null;
  assignedStoreIds: string[];
  assignedProductionHouseIds: string[];
}

export interface CacheMeta {
  version: number;
  savedAt: Record<string, number>; // when each dataset was last written on this phone
  fetchedAt: Record<string, number>; // when each dataset last came fresh from the server
  hash: Record<string, string>; // hash of the server's answer, to skip re-rendering an unchanged one
  etag?: string | null; // GET /bootstrap
  etagWindow?: string; // the date range that etag was for ('' = everything)
  lastFullAt?: number; // last refresh that wasn't a date-range top-up
  profile?: CachedProfile | null; // the person's own store/designation (from their employee record)
}

let cacheUser: string | null = null;
let meta: CacheMeta | null = null;
let metaWrite: Promise<unknown> = Promise.resolve();

export function setCacheUser(userId: string | null): void {
  const next = userId ? userId.toLowerCase() : null;
  if (next !== cacheUser) meta = null;
  cacheUser = next;
}

const metaKey = (user: string) => `meta:${encodeURIComponent(user)}`;
const dataKey = (user: string, key: string) => `ds:${encodeURIComponent(user)}:${key}`;

function emptyMeta(): CacheMeta {
  return { version: CACHE_VERSION, savedAt: {}, fetchedAt: {}, hash: {} };
}

// The saved copy for the current person: meta plus every requested dataset that is under 7 days old.
export async function readCache(keys: string[]): Promise<{ meta: CacheMeta | null; data: Record<string, any> }> {
  const user = cacheUser;
  if (!user) return { meta: null, data: {} };
  const records = await idbGetMany<any>('cache', [metaKey(user), ...keys.map((k) => dataKey(user, k))]);
  const stored = records[0] as CacheMeta | undefined;
  const now = Date.now();
  const data: Record<string, any> = {};
  if (!stored || stored.version !== CACHE_VERSION) {
    if (user === cacheUser) meta = emptyMeta();
    return { meta: null, data };
  }
  keys.forEach((key, i) => {
    const record = records[i + 1] as { savedAt: number; data: any } | undefined;
    if (record && now - record.savedAt < KEEP_MS) data[key] = record.data;
  });
  if (user === cacheUser) meta = { ...emptyMeta(), ...stored };
  return { meta: meta ? { ...meta } : null, data };
}

function currentMeta(): CacheMeta {
  if (!meta) meta = emptyMeta();
  return meta;
}

// Meta writes are queued so two quick updates can't overwrite each other.
function saveMeta(user: string) {
  const snapshot = { ...currentMeta() };
  metaWrite = metaWrite.then(() => idbSet('cache', metaKey(user), snapshot)).catch(() => undefined);
}

export async function writeDataset(key: string, data: unknown): Promise<void> {
  const user = cacheUser;
  if (!user) return;
  const savedAt = Date.now();
  const ok = await idbSet('cache', dataKey(user, key), { savedAt, data });
  if (!ok || user !== cacheUser) return;
  currentMeta().savedAt = { ...currentMeta().savedAt, [key]: savedAt };
  saveMeta(user);
}

// Datasets just loaded from the server (with the answer's hash where there is one).
export function markFetched(keys: string[], hashes: Record<string, string> = {}, extra: Partial<Pick<CacheMeta, 'etag' | 'etagWindow' | 'lastFullAt'>> = {}): void {
  const user = cacheUser;
  if (!user) return;
  const m = currentMeta();
  const now = Date.now();
  m.fetchedAt = { ...m.fetchedAt, ...Object.fromEntries(keys.map((k) => [k, now])) };
  m.hash = { ...m.hash, ...hashes };
  Object.assign(m, extra);
  saveMeta(user);
}

export function setCachedProfile(profile: CachedProfile | null): void {
  const user = cacheUser;
  if (!user) return;
  currentMeta().profile = profile;
  saveMeta(user);
}

export function getCachedHash(key: string): string | undefined {
  return meta?.hash[key];
}

export function getCachedEtag(): string | null {
  return meta?.etag ?? null;
}

export function getCachedEtagWindow(): string {
  return meta?.etagWindow ?? '';
}

export function getLastFullRefresh(): number {
  return meta?.lastFullAt ?? 0;
}

export function getFetchedAt(key: string): number {
  return meta?.fetchedAt[key] ?? 0;
}

export function getSavedAt(key: string): number {
  return meta?.savedAt[key] ?? 0;
}

// Fresh = loaded from the server in the last 5 minutes.
export function isCacheFresh(key: string): boolean {
  return Date.now() - getFetchedAt(key) < FRESH_MS;
}

// After a change on this phone: the next refresh should reload this dataset. The saved copy itself
// stays (App.tsx re-saves the updated list), so the next open is still instant.
export function invalidateCache(key: string): void {
  const user = cacheUser;
  if (!user || !meta) return;
  meta.fetchedAt = { ...meta.fetchedAt, [key]: 0 };
  const { [key]: _dropped, ...rest } = meta.hash;
  meta.hash = rest;
  if (key === 'inventory' || key === 'overheads' || key === 'fixedCosts' || key === 'salesData') meta.etag = null;
  saveMeta(user);
}

// Wipes every saved copy on this phone, everyone's - on a manual logout, so a shared phone shows
// nothing of the last person. (Never on an automatic sign-out; never touches the outbox.)
export async function invalidateAllCaches(): Promise<void> {
  meta = null;
  try {
    const all = await idbEntries<unknown>('cache');
    await idbDelete('cache', all.map(([k]) => k));
    console.log(`🧹 Invalidated all caches (${all.length} entries)`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
  clearLegacyLocalStorage();
}

// Drops people's copies untouched for 7 days, and the old localStorage copies (which also frees
// the localStorage space other features need).
export async function clearOldCaches(): Promise<void> {
  clearLegacyLocalStorage();
  try {
    const metas = await idbEntries<CacheMeta>('cache', 'meta:');
    const now = Date.now();
    for (const [key, m] of metas) {
      const newest = Math.max(0, ...Object.values(m?.savedAt || {}));
      if (m?.version === CACHE_VERSION && now - newest < KEEP_MS) continue;
      const user = key.slice('meta:'.length);
      const records = await idbEntries<unknown>('cache', `ds:${user}:`);
      await idbDelete('cache', [key, ...records.map(([k]) => k)]);
    }
  } catch (error) {
    console.error('Cache cleanup error:', error);
  }
}

function clearLegacyLocalStorage() {
  try {
    const keys: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(LEGACY_PREFIX)) keys.push(key);
    }
    keys.forEach((key) => localStorage.removeItem(key));
  } catch {
    // Storage blocked - nothing to clean.
  }
}

// Cheap fingerprint of a server answer (FNV-1a over the text, plus its length) - telling "same as
// last time" apart without keeping megabytes of text around.
export function textHash(text: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return `${text.length}:${(h >>> 0).toString(36)}`;
}
