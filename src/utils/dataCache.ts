// Aggressive data caching utility for instant load times
// Implements stale-while-revalidate pattern with localStorage
//
// PERFORMANCE BENEFITS:
// - First load: Data displays instantly from cache (0ms perceived load time)
// - Fresh data fetched in background if cache is stale (< 5 min old)
// - Reduces server load by minimizing redundant API calls
// - Survives page refreshes and browser sessions
// - Automatic cleanup of old cache entries to prevent storage bloat
//
// USAGE:
// - getCache(key): Get cached data
// - setCache(key, data): Store data in cache
// - invalidateCache(key): Clear specific cache entry (use after data mutations)
// - invalidateAllCaches(): Clear all caches (use on logout)

const CACHE_PREFIX = 'bhandar_cache_';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes - data is considered fresh
const MAX_STALE_AGE = 60 * 60 * 1000; // 1 hour - maximum age before forcing refresh

export interface CacheEntry<T> {
  data: T;
  timestamp: number;
  version: number; // For cache invalidation
}

const CACHE_VERSION = 1; // Increment this to invalidate all caches

// Get cached data
export function getCache<T>(key: string): T | null {
  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return null;
    }

    const entry: CacheEntry<T> = JSON.parse(cached);
    
    // Check version
    if (entry.version !== CACHE_VERSION) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    const age = Date.now() - entry.timestamp;
    
    // If too old, remove and return null
    if (age > MAX_STALE_AGE) {
      localStorage.removeItem(cacheKey);
      return null;
    }

    return entry.data;
  } catch (error) {
    console.error('Cache read error:', error);
    return null;
  }
}

// Check if cache is fresh (within CACHE_DURATION)
export function isCacheFresh(key: string): boolean {
  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const cached = localStorage.getItem(cacheKey);
    
    if (!cached) {
      return false;
    }

    const entry: CacheEntry<any> = JSON.parse(cached);
    const age = Date.now() - entry.timestamp;
    
    return age < CACHE_DURATION && entry.version === CACHE_VERSION;
  } catch (error) {
    return false;
  }
}

// Set cache data
export function setCache<T>(key: string, data: T): void {
  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    const entry: CacheEntry<T> = {
      data,
      timestamp: Date.now(),
      version: CACHE_VERSION
    };
    
    localStorage.setItem(cacheKey, JSON.stringify(entry));
  } catch (error) {
    // If localStorage is full, clear old caches
    if (error instanceof Error && error.name === 'QuotaExceededError') {
      clearOldCaches();
      try {
        const cacheKey = `${CACHE_PREFIX}${key}`;
        const entry: CacheEntry<T> = {
          data,
          timestamp: Date.now(),
          version: CACHE_VERSION
        };
        localStorage.setItem(cacheKey, JSON.stringify(entry));
      } catch (retryError) {
        console.error('Cache write error after cleanup:', retryError);
      }
    } else {
      console.error('Cache write error:', error);
    }
  }
}

// Clear old cache entries
export function clearOldCaches(): void {
  try {
    const now = Date.now();
    const keysToRemove: string[] = [];

    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        try {
          const cached = localStorage.getItem(key);
          if (cached) {
            const entry: CacheEntry<any> = JSON.parse(cached);
            const age = now - entry.timestamp;
            
            // Remove if older than max stale age or wrong version
            if (age > MAX_STALE_AGE || entry.version !== CACHE_VERSION) {
              keysToRemove.push(key);
            }
          }
        } catch (error) {
          keysToRemove.push(key);
        }
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`🧹 Cleared ${keysToRemove.length} old cache entries`);
  } catch (error) {
    console.error('Cache cleanup error:', error);
  }
}

// Invalidate specific cache
export function invalidateCache(key: string): void {
  try {
    const cacheKey = `${CACHE_PREFIX}${key}`;
    localStorage.removeItem(cacheKey);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

// Invalidate all caches
export function invalidateAllCaches(): void {
  try {
    const keysToRemove: string[] = [];
    
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key && key.startsWith(CACHE_PREFIX)) {
        keysToRemove.push(key);
      }
    }

    keysToRemove.forEach(key => localStorage.removeItem(key));
    console.log(`🧹 Invalidated all caches (${keysToRemove.length} entries)`);
  } catch (error) {
    console.error('Cache invalidation error:', error);
  }
}

// Wrapper for API calls with caching
export async function cachedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: {
    forceRefresh?: boolean;
    skipCache?: boolean;
  } = {}
): Promise<T> {
  // Skip cache if requested
  if (options.skipCache) {
    const data = await fetchFn();
    setCache(key, data);
    return data;
  }

  // Check cache first
  const cached = getCache<T>(key);
  
  // If cache is fresh and not forcing refresh, return immediately
  if (!options.forceRefresh && cached && isCacheFresh(key)) {
    console.log(`⚡ Cache hit (fresh): ${key}`);
    return cached;
  }

  // If cache exists but stale, return stale data and fetch in background
  if (cached && !options.forceRefresh) {
    console.log(`⚡ Cache hit (stale): ${key} - refreshing in background`);
    
    // Return stale data immediately
    Promise.resolve().then(async () => {
      try {
        const freshData = await fetchFn();
        setCache(key, freshData);
        console.log(`✅ Background refresh complete: ${key}`);
      } catch (error) {
        console.error(`❌ Background refresh failed: ${key}`, error);
      }
    });
    
    return cached;
  }

  // No cache or force refresh - fetch and cache
  console.log(`🔄 Cache miss: ${key} - fetching fresh data`);
  const data = await fetchFn();
  setCache(key, data);
  return data;
}

// Batch cache operations
export function batchGetCache<T>(keys: string[]): Map<string, T | null> {
  const results = new Map<string, T | null>();
  
  keys.forEach(key => {
    results.set(key, getCache<T>(key));
  });
  
  return results;
}

export function batchSetCache<T>(entries: Map<string, T>): void {
  entries.forEach((data, key) => {
    setCache(key, data);
  });
}