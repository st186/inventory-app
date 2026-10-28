// Safe retries for writes (idempotency-v1, speed work 28 Oct 2026). Registered from index.ts
// right after the login gate.
//
// On a weak signal a save can reach the server while its answer is lost; the app then retries
// and, before this, a second expense or sale was created. Now any POST/PUT/PATCH/DELETE may
// carry `Idempotency-Key: <uuid>`:
//   - the first time, the request is claimed under idem:<authUserId>:<key>, processed as usual,
//     and its status and JSON body are kept for 24 hours;
//   - a repeat with the same key from the same person gets that stored answer back with
//     `Idempotent-Replay: true`, and nothing is written again;
//   - a repeat that arrives while the first is still running gets 409 IDEMPOTENCY_IN_PROGRESS
//     (retry shortly); a key reused for a different method/path gets 422 IDEMPOTENCY_KEY_REUSED.
// No header = exactly the old behaviour. A server error (5xx) is not kept, so retrying it runs
// the request again. Cost: one conditional insert before and one write after; expired entries
// are simply overwritten when their key comes round again, and are safe to delete at any time.

type Deps = {
  // Service-role client (index.ts's).
  supabase: any;
  verifyUser: (authHeader: string | null) => Promise<any>;
};

const TABLE = 'kv_store_c2dd9b9d';
const METHODS = ['POST', 'PUT', 'PATCH', 'DELETE'];
const KEEP_MS = 24 * 60 * 60 * 1000;
// A claim this old that never finished belongs to a run that died (the server copy was shut
// down mid-request): let the retry go ahead rather than answering "in progress" for a day.
const ABANDONED_AFTER_MS = 2 * 60 * 1000;
// Write responses are small; a bigger one isn't kept (a retry then simply runs again).
const MAX_BODY_CHARS = 512 * 1024;
const KEY_FORMAT = /^[A-Za-z0-9_-]{8,128}$/;

type Entry = {
  state: 'pending' | 'done';
  method: string;
  path: string;
  createdAt: string;
  expiresAt: string;
  status?: number;
  contentType?: string;
  body?: string;
};

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

export function idempotencyMiddleware(deps: Deps) {
  const { supabase, verifyUser } = deps;

  // true when this request now owns the key (no entry existed).
  const claim = async (key: string, entry: Entry): Promise<boolean> => {
    const { data, error } = await supabase
      .from(TABLE)
      .upsert({ key, value: entry }, { onConflict: 'key', ignoreDuplicates: true })
      .select('key');
    if (error) throw new Error(error.message);
    return Array.isArray(data) && data.length > 0;
  };
  const read = async (key: string): Promise<Entry | null> => {
    const { data, error } = await supabase.from(TABLE).select('value').eq('key', key).maybeSingle();
    if (error) throw new Error(error.message);
    return data?.value ?? null;
  };
  const write = async (key: string, entry: Entry) => {
    const { error } = await supabase.from(TABLE).upsert({ key, value: entry });
    if (error) throw new Error(error.message);
  };
  const release = async (key: string) => {
    const { error } = await supabase.from(TABLE).delete().eq('key', key);
    if (error) throw new Error(error.message);
  };

  return async (c: any, next: () => Promise<void>) => {
    if (!METHODS.includes(c.req.method)) return next();
    const clientKey = c.req.header('Idempotency-Key');
    if (!clientKey) return next();
    if (!KEY_FORMAT.test(clientKey)) {
      return c.json({ error: 'Idempotency-Key must be 8 to 128 letters, digits, - or _', code: 'IDEMPOTENCY_KEY_INVALID' }, 400);
    }
    // Cron and public routes have no signed-in person to key on: they run as before.
    const auth = await verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return next();

    const key = `idem:${auth.user.id}:${clientKey}`;
    const now = Date.now();
    const pending: Entry = {
      state: 'pending',
      method: c.req.method,
      path: c.req.path,
      createdAt: new Date(now).toISOString(),
      expiresAt: new Date(now + KEEP_MS).toISOString(),
    };

    try {
      if (!(await claim(key, pending))) {
        const saved = await read(key);
        const expired = !saved || !(Date.parse(saved.expiresAt) > now);
        const abandoned = saved?.state === 'pending' && !(now - Date.parse(saved.createdAt) < ABANDONED_AFTER_MS);
        if (!expired && !abandoned) {
          if (saved!.method !== pending.method || saved!.path !== pending.path) {
            return c.json({ error: 'This Idempotency-Key was already used for a different request', code: 'IDEMPOTENCY_KEY_REUSED' }, 422);
          }
          if (saved!.state === 'pending') {
            c.header('Retry-After', '2');
            return c.json({ error: 'This save is still being processed - try again in a moment', code: 'IDEMPOTENCY_IN_PROGRESS' }, 409);
          }
          return c.body(saved!.body ?? '', saved!.status ?? 200, {
            'Content-Type': saved!.contentType || 'application/json; charset=UTF-8',
            'Idempotent-Replay': 'true',
          });
        }
        // An old entry for a reused key, or a run that died: this request takes it over.
        await write(key, pending);
      }
    } catch (e) {
      // The store itself failing must not block saving: process as if no key had been sent.
      console.log('Idempotency check skipped:', message(e));
      return next();
    }

    await next();

    try {
      const res: Response | undefined = c.res;
      const status = res?.status ?? 500;
      const contentType = res?.headers.get('content-type') || '';
      const body = res && status < 500 && contentType.includes('application/json') ? await res.clone().text() : null;
      if (body === null || body.length > MAX_BODY_CHARS) {
        await release(key);
        return;
      }
      await write(key, { ...pending, state: 'done', status, contentType, body });
    } catch (e) {
      // The save itself went through; only a later retry loses its protection.
      console.log('Could not keep the idempotent response:', message(e));
    }
  };
}
