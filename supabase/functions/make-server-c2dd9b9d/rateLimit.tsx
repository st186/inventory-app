// Lightweight, KV-store-backed rate limiter for sensitive endpoints (signup,
// 2FA verification, etc.). Implements a fixed-window counter per key (e.g. per
// IP address or per user id) so repeated brute-force/credential-stuffing
// attempts can be throttled even though Supabase Edge Functions are stateless
// across invocations (in-memory counters would not be reliable).
import * as kv from './kv_store.tsx';

interface RateLimitRecord {
  count: number;
  windowStartMs: number;
}

export interface RateLimitResult {
  allowed: boolean;
  retryAfterSeconds?: number;
}

// Checks and increments a rate limit counter for `key` within a fixed window
// of `windowMs` milliseconds, allowing at most `maxAttempts` calls per window.
export async function checkRateLimit(
  key: string,
  maxAttempts: number,
  windowMs: number
): Promise<RateLimitResult> {
  const storeKey = `ratelimit:${key}`;
  const now = Date.now();

  let record: RateLimitRecord | null = null;
  try {
    record = await kv.get(storeKey);
  } catch (error) {
    // If the store is unreachable, fail open rather than blocking legitimate
    // traffic on an infrastructure error.
    console.error('❌ Rate limiter store read failed, failing open:', error);
    return { allowed: true };
  }

  if (!record || now - record.windowStartMs >= windowMs) {
    record = { count: 0, windowStartMs: now };
  }

  record.count += 1;

  try {
    await kv.set(storeKey, record);
  } catch (error) {
    console.error('❌ Rate limiter store write failed, failing open:', error);
    return { allowed: true };
  }

  if (record.count > maxAttempts) {
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((record.windowStartMs + windowMs - now) / 1000)
    );
    return { allowed: false, retryAfterSeconds };
  }

  return { allowed: true };
}

// Convenience helper returning a Hono-compatible 429 JSON response body/status
// for a rejected rate-limit check.
export function rateLimitedResponse(result: RateLimitResult) {
  return {
    body: {
      error: 'Too many requests. Please try again later.',
      retryAfterSeconds: result.retryAfterSeconds,
    },
    status: 429 as const,
  };
}
