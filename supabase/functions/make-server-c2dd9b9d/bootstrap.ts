// GET /bootstrap (bootstrap-v1, speed work 28 Oct 2026). Registered from index.ts.
//
// Everything the app loads at startup for the signed-in person's role, in one request instead
// of ~20 (most of them in seven rounds, one after another). The answer is
//
//   { etag, generatedAt, data: { "/employees": <body>, "/stores": <body>, ... }, errors? }
//
// Each value in data is exactly the JSON that route answers for this person: the parts are
// made by running those very routes inside this server copy, in parallel, with the caller's own
// Authorization - so the login gate, the role checks and employeeForViewer apply unchanged and
// nothing is computed twice. The login check itself is shared (verifyUser caches per token).
//
//   - A part that fails (or answers "database temporarily unavailable") is left out of data and
//     listed in errors as { status, error }; the app fetches that route on its own.
//   - ?from=YYYY-MM-DD&to=YYYY-MM-DD is handed to the history lists (date-range-v1).
//   - X-Bunny-Client: 2 is handed on, so the employee lists come back lean (lean-lists-v1).
//   - etag covers data (and errors); If-None-Match with it answers 304 when nothing changed.
//     It is also the ETag response header; quotes and a W/ prefix are optional when sent back.
//
// Role scope - who gets which parts (plain staff and riders get nothing business-wide):
//   owner, managers, audit, store/production incharges: their own record and profile cards,
//     the staff list, stores, production houses, the item catalog and the history lists
//     (plus /cluster/info for the owner);
//   riders: their own record and cards, stores, and production requests (deliveries to run);
//   everyone else (plain employees): their own record and cards only.

type Deps = {
  verifyUser: (authHeader: string | null) => Promise<any>;
};

const P = '/make-server-c2dd9b9d';
// The history lists the app keeps in memory (App.tsx loadData); all take ?from=&to=.
const HISTORY = [
  '/inventory', '/overheads', '/fixed-costs', '/sales', '/sales-data', '/production', '/stock-requests',
  '/production-requests', '/online-cash-recalibration/all', '/online-sales', '/online-payouts', '/aggregator-settlements',
];
const CATALOG = ['/production-houses', '/inventory-items'];
const SELF = ['/me/employee', '/me/profile', '/auth/password-status'];
const INCHARGES = ['store_incharge', 'production_incharge'];
const LEADS = ['cluster_head', 'manager', 'audit'];
// One slow part must not hold up the rest: past this it is reported in errors instead.
const PART_TIMEOUT_MS = 20_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

export function bootstrapPathsFor(meta: { role?: string; designation?: string }): string[] {
  const role = meta?.role || 'employee';
  const designation = meta?.designation || '';
  // Independent site auditors: their own record only (siteAudits.ts).
  if (designation === 'site_auditor') return [...SELF];
  if (LEADS.includes(role) || INCHARGES.includes(designation)) {
    return [...SELF, '/employees', '/stores', ...CATALOG, ...HISTORY, ...(role === 'cluster_head' ? ['/cluster/info'] : [])];
  }
  if (designation === 'rider' || role === 'rider') return [...SELF, '/stores', '/production-requests'];
  return [...SELF];
}

type Part = { path: string; status: number; text?: string; error?: string };

const message = (e: unknown) => (e instanceof Error ? e.message : String(e));

function errorText(body: string): string {
  try {
    const parsed = JSON.parse(body);
    if (typeof parsed?.error === 'string') return parsed.error.slice(0, 300);
  } catch { /* not JSON */ }
  return body.slice(0, 300);
}

async function sha256Hex(text: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

const bareTag = (tag: string) => tag.trim().replace(/^W\//, '').replace(/^"|"$/g, '');

function etagMatches(ifNoneMatch: string | undefined, etag: string): boolean {
  if (!ifNoneMatch) return false;
  const want = bareTag(etag);
  return ifNoneMatch.split(',').some((t) => t.trim() === '*' || bareTag(t) === want);
}

export function registerBootstrapRoutes(app: any, deps: Deps) {
  const runPart = async (url: string, path: string, headers: Record<string, string>): Promise<Part> => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      const res: Response = await Promise.race([
        app.request(url, { headers }),
        new Promise<never>((_, reject) => {
          timer = setTimeout(() => reject(new Error('Timed out')), PART_TIMEOUT_MS);
        }),
      ]);
      const text = await res.text();
      if (res.status !== 200 || !(res.headers.get('content-type') || '').includes('application/json')) {
        return { path, status: res.status, error: errorText(text) };
      }
      // The lists answer 200 with an empty list and this warning when the database is down;
      // the app should keep what it has rather than cache the empty list.
      if (text.slice(-200).includes('"warning":"Database temporarily unavailable')) {
        return { path, status: 503, error: 'Database temporarily unavailable' };
      }
      return { path, status: 200, text };
    } catch (e) {
      return { path, status: 504, error: message(e) };
    } finally {
      if (timer !== undefined) clearTimeout(timer);
    }
  };

  app.get(`${P}/bootstrap`, async (c: any) => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);

    const from = c.req.query('from') || '';
    const to = c.req.query('to') || '';
    if ((from && !ISO_DAY.test(from)) || (to && !ISO_DAY.test(to))) {
      return c.json({ error: 'from and to must be dates like 2026-10-28' }, 400);
    }
    const windowParams = new URLSearchParams();
    if (from) windowParams.set('from', from);
    if (to) windowParams.set('to', to);
    const windowQuery = windowParams.toString() ? `?${windowParams.toString()}` : '';

    const headers: Record<string, string> = { Authorization: c.req.header('Authorization') };
    const client = c.req.header('X-Bunny-Client');
    if (client) headers['X-Bunny-Client'] = client;

    const paths = bootstrapPathsFor(auth.user.user_metadata || {});
    const parts = await Promise.all(paths.map((path) =>
      runPart(`${P}${path}${HISTORY.includes(path) ? windowQuery : ''}`, path, headers)));

    // Written out by hand so each part's JSON goes through exactly as its route produced it.
    const ok = parts.filter((p) => p.text !== undefined);
    const failed = parts.filter((p) => p.text === undefined);
    const dataText = `{${ok.map((p) => `${JSON.stringify(p.path)}:${p.text}`).join(',')}}`;
    const errorsText = failed.length
      ? JSON.stringify(Object.fromEntries(failed.map((p) => [p.path, { status: p.status, error: p.error }])))
      : '';
    for (const p of failed) console.log(`bootstrap: ${p.path} left out (${p.status}): ${p.error}`);

    const etag = `"bs1-${(await sha256Hex(`${dataText}\n${errorsText}`)).slice(0, 40)}"`;
    const cacheHeaders = { ETag: etag, 'Cache-Control': 'private, no-cache' };
    if (etagMatches(c.req.header('If-None-Match'), etag)) return c.body(null, 304, cacheHeaders);

    const body = `{"etag":${JSON.stringify(etag)},"generatedAt":${JSON.stringify(new Date().toISOString())},"data":${dataText}${errorsText ? `,"errors":${errorsText}` : ''}}`;
    return c.body(body, 200, { ...cacheHeaders, 'Content-Type': 'application/json; charset=UTF-8' });
  });
}
