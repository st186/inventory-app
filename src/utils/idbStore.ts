// A tiny IndexedDB key-value store (no library) for each person's saved data (dataCache.ts) and the
// offline outbox (outbox.ts). localStorage is close to its 5-10 MB limit with one person's day of
// data, and a shared counter phone holds two people; IndexedDB has room for both.
//
// Where IndexedDB is missing or blocked (a private window, a test runner) everything falls back to
// memory for the session, so callers never have to check.

export type StoreName = 'cache' | 'outbox';

const DB_NAME = 'bunny-app';
const DB_VERSION = 1;
const STORES: StoreName[] = ['cache', 'outbox'];

let dbPromise: Promise<IDBDatabase | null> | null = null;
const memory: Record<StoreName, Map<string, unknown>> = { cache: new Map(), outbox: new Map() };

function openDb(): Promise<IDBDatabase | null> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve) => {
    try {
      if (typeof indexedDB === 'undefined') return resolve(null);
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        for (const name of STORES) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name);
        }
      };
      req.onsuccess = () => {
        const db = req.result;
        // Another tab opening a newer version: let it, and reopen next time.
        db.onversionchange = () => { db.close(); dbPromise = null; };
        resolve(db);
      };
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
  return dbPromise;
}

function done(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

export async function idbGet<T>(store: StoreName, key: string): Promise<T | undefined> {
  return (await idbGetMany<T>(store, [key]))[0];
}

// Several keys in one read transaction (startup reads a dozen datasets at once).
export async function idbGetMany<T>(store: StoreName, keys: string[]): Promise<(T | undefined)[]> {
  const db = await openDb();
  if (!db) return keys.map((k) => memory[store].get(k) as T | undefined);
  try {
    const tx = db.transaction(store, 'readonly');
    const os = tx.objectStore(store);
    const results: (T | undefined)[] = new Array(keys.length);
    keys.forEach((key, i) => {
      const req = os.get(key);
      req.onsuccess = () => { results[i] = req.result as T | undefined; };
    });
    await done(tx);
    return results;
  } catch (error) {
    console.warn('Saved data read failed:', error);
    return keys.map(() => undefined);
  }
}

export async function idbSet(store: StoreName, key: string, value: unknown): Promise<boolean> {
  const db = await openDb();
  if (!db) {
    memory[store].set(key, value);
    return true;
  }
  try {
    const tx = db.transaction(store, 'readwrite');
    tx.objectStore(store).put(value, key);
    await done(tx);
    return true;
  } catch (error) {
    console.warn('Saved data write failed:', error);
    return false;
  }
}

export async function idbDelete(store: StoreName, keys: string | string[]): Promise<void> {
  const list = Array.isArray(keys) ? keys : [keys];
  if (list.length === 0) return;
  const db = await openDb();
  if (!db) {
    list.forEach((k) => memory[store].delete(k));
    return;
  }
  try {
    const tx = db.transaction(store, 'readwrite');
    const os = tx.objectStore(store);
    list.forEach((k) => os.delete(k));
    await done(tx);
  } catch (error) {
    console.warn('Saved data delete failed:', error);
  }
}

// Every [key, value] whose key starts with `prefix` (all of them for '').
export async function idbEntries<T>(store: StoreName, prefix = ''): Promise<[string, T][]> {
  const db = await openDb();
  if (!db) {
    return [...memory[store].entries()].filter(([k]) => k.startsWith(prefix)) as [string, T][];
  }
  try {
    const tx = db.transaction(store, 'readonly');
    const range = prefix ? IDBKeyRange.bound(prefix, `${prefix}￿`) : undefined;
    const req = tx.objectStore(store).openCursor(range);
    const out: [string, T][] = [];
    req.onsuccess = () => {
      const cursor = req.result;
      if (!cursor) return;
      out.push([String(cursor.key), cursor.value as T]);
      cursor.continue();
    };
    await done(tx);
    return out;
  } catch (error) {
    console.warn('Saved data listing failed:', error);
    return [];
  }
}

// Only for the test script, which runs without IndexedDB.
export function _resetMemoryStoreForTests(): void {
  memory.cache.clear();
  memory.outbox.clear();
}
