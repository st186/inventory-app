import { monthlySalaryOf } from './payslipRules.ts';
import { Hono } from 'npm:hono';
import { cors } from 'npm:hono/cors';
import { logger } from 'npm:hono/logger';
import { createClient as createSupabaseClient } from 'npm:@supabase/supabase-js@2';
import * as kv from './kv_store.tsx';
import inventoryItemsRoutes from './inventory-items.tsx';
import { classifyAndSumProductsByChannel, classifyAndSumProductsByItemAndChannel, classifyOrderItems, classifyProductBreakdown } from './posItemClassifier.tsx';
import { MOMO_TYPES as PRODUCTION_MOMO_TYPES, GLOBAL_POOLS } from './momoTypes.ts';
import { AiError, aiProductionCoach, askClaudeForJson, registerInsightsRoutes } from './insights.ts';
import { CATEGORY_CHOICES, catLabel, recheckAmount, closeFlagsOf, registerExpenseReviewRoutes, reviewExpense, settleApproval, type ExpenseReviewDeps } from './expenseReview.ts';
import { registerPaperworkRoutes } from './expensePaperwork.ts';
import { registerSiteAuditRoutes } from './siteAudits.ts';
import { flagLedgerDay, registerProductionReviewRoutes, reviewProduction } from './productionReview.ts';
import { LEFTOVER_PLANS, OVER_PREPARED_CAUSES, checkNewReason, cleanWithLeftover, leftoverLines, piecesPerKg, poolLabel, reasonsText, uncountedPools, withLeftoverLines } from './leftoverRules.ts';
import { checkBurgers, isBurgerPurchase, salesByDay } from './burgerCheck.ts';
import { BUILT_IN, homeElsewhere, homeLabel, itemHomes, settleCategory } from './itemHome.ts';
import { roundupFor } from './roundup.ts';
import { RUNNING_HOMES, decideName, itemLike, loadAliases, reviewNewName, settleName, type EntryType, type NameReviewDeps } from './itemNameReview.ts';
import { matchName, nameKey, type KnownItem } from './itemNames.ts';
import { raiseRepairAlert, registerRepairRoutes } from './repairs.ts';
import { registerComplaintRoutes } from './complaints.ts';
import { BENGALI_TITLE, BUNDLE_MINUTES, DAILY_BUZZ_CAP, DEFAULT_PREFS, bundles, escalates, inQuietHours, loudness, notificationCategory, oneADay, oneRowPerRecord, ownerBuzzes } from './notificationRules.ts';
import { DEFAULT_GRACE_MIN, DEFAULT_SHIFTS, lateStartIssues, parseHHMM } from './kpiCore.ts';
import { registerProfileRoutes } from './profile.ts';
import { registerPasswordRoutes, passwordGate, warmPasswordPolicy } from './passwords.ts';
import { paytmAnchorBefore, paytmMovement, paytmSourcesForStore, payoutHitsPaytm, recalDayEndBalance, recalibrationOn } from './paytmRules.ts';
import { registerAssetsRoutes } from './assets.ts';
import { CHECKS_FROM, CHECK_MONTHS } from './assetRules.ts';
import { registerWorkplaceRoutes, markCheckOk } from './workplace.ts';
import { registerBackupRoutes } from './backup.ts';
import { registerKpiRoutes } from './kpi.ts';
import { syncTimesheet } from './attendance.ts';
import { idempotencyMiddleware } from './idempotency.ts';
import { registerBootstrapRoutes } from './bootstrap.ts';
import {
  attachEventRollups, buildEventTopupRequest, eventInchargeAuthId, eventTopupFunding, eventTransfersForStore,
  registerEventsRoutes, runEventPosSync, withoutEventRollups, type EventsDeps,
} from './events.ts';
import { registerRecipeRoutes } from './recipes.ts';
import * as stockCheck from './stockCheck.ts';
import * as liveOrders from './liveOrders.ts';

// ---- Trusted roles (security review, 27 Oct 2026) ----
// A person's role, designation, store and employee id are trusted only from app_metadata, which
// the server alone can write: user_metadata can be edited by the signed-in person themself, so
// reading roles from it let anyone make themselves owner. Every admin createUser /
// updateUserById that sets one of these in user_metadata also writes it to app_metadata
// (createClient below wraps the client), and verifyUser reads them back from app_metadata only.
const TRUSTED_AUTH_KEYS = ['role', 'designation', 'storeId', 'employeeId', 'productionHouseId', 'assignedStoreIds', 'assignedProductionHouseIds'];

function mirrorTrustedKeys(attrs: any) {
  const meta = attrs?.user_metadata;
  if (!meta) return attrs;
  const trusted: Record<string, any> = {};
  for (const k of TRUSTED_AUTH_KEYS) if (k in meta) trusted[k] = meta[k];
  return Object.keys(trusted).length ? { ...attrs, app_metadata: { ...(attrs.app_metadata || {}), ...trusted } } : attrs;
}

function createClient(url: string, key: string, options?: any): any {
  const client: any = createSupabaseClient(url, key, options);
  const admin = client.auth.admin;
  const createUser = admin.createUser.bind(admin);
  const updateUserById = admin.updateUserById.bind(admin);
  admin.createUser = (attrs: any) => createUser(mirrorTrustedKeys(attrs));
  admin.updateUserById = (id: string, attrs: any) => updateUserById(id, mirrorTrustedKeys(attrs));
  return client;
}

// The user with role fields taken from app_metadata only. A login the server never set up gets
// the least access (employee).
function withTrustedRoles(user: any) {
  const app = user?.app_metadata || {};
  const meta: Record<string, any> = { ...(user?.user_metadata || {}) };
  for (const k of TRUSTED_AUTH_KEYS) {
    if (k in app) meta[k] = app[k];
    else delete meta[k];
  }
  if (!app.role) meta.role = 'employee';
  return { ...user, user_metadata: meta };
}

type Viewer = { role?: string; employeeId?: string; lean?: boolean };

// The signed-in caller's role and employee id (already verified by the login gate), and
// whether the app asked for lean lists (see withoutImages).
async function viewerOf(c: any): Promise<Viewer> {
  const lean = wantsLeanLists(c);
  const auth = await verifyUser(c.req.header('Authorization'));
  return 'error' in auth ? { lean } : { role: auth.user.user_metadata?.role, employeeId: auth.user.user_metadata?.employeeId, lean };
}

// The whole record, Aadhaar images included: the owner, and the person themself.
function seesFullEmployeeRecord(emp: any, viewer: Viewer): boolean {
  if (viewer.role === 'cluster_head') return true;
  return !!viewer.employeeId && (emp?.employeeId === viewer.employeeId || emp?.id === viewer.employeeId);
}

// Who sees what in employee records: Aadhaar card images only the owner and the person
// themself; pay, date of birth and phone also managers and audit.
function employeeForViewer(emp: any, viewer: Viewer) {
  if (!emp) return emp;
  if (seesFullEmployeeRecord(emp, viewer)) return viewer.lean ? withoutImages(emp) : emp;
  const { aadharFront, aadharBack, ...rest } = emp;
  const out: any = { ...rest, hasAadharImages: !!(aadharFront || aadharBack) };
  if (viewer.role !== 'manager' && viewer.role !== 'audit') {
    for (const k of ['salaryStructure', 'monthlySalary', 'dailyRate', 'salary', 'dob', 'dateOfBirth', 'phone', 'contactEmail', 'bankDetails', 'tempPassword']) delete out[k];
  }
  return viewer.lean ? withoutImages(out) : out;
}

// Who is asking, for pay and leave lists (security review, 28 Oct 2026).
async function callerOf(c: any): Promise<{ role: string; employeeId: string | null; lead: boolean; incharge: boolean; places: string[] }> {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return { role: '', employeeId: null, lead: false, incharge: false, places: [] };
  const m = auth.user.user_metadata || {};
  const places = [m.storeId, ...(Array.isArray(m.assignedStoreIds) ? m.assignedStoreIds : []), ...(Array.isArray(m.assignedProductionHouseIds) ? m.assignedProductionHouseIds : [])].filter(Boolean).map(String);
  return {
    role: String(m.role || ''), employeeId: m.employeeId ? String(m.employeeId) : null,
    lead: ['cluster_head', 'manager', 'audit'].includes(m.role),
    incharge: ['store_incharge', 'production_incharge', 'operations_incharge'].includes(m.designation), places,
  };
}

// Pay rows (payouts, salary advances): everything for the owner, managers and audit; an incharge
// also the ones paid from their store's or production house's cash (their day close counts them);
// everyone else only their own.
async function payScope(c: any, rows: any[]): Promise<any[]> {
  const caller = await callerOf(c);
  if (caller.lead) return rows || [];
  return (rows || []).filter((r: any) => (caller.employeeId && String(r?.employeeId) === caller.employeeId)
    || (caller.incharge && r?.storeId && caller.places.includes(String(r.storeId))));
}

// ---- Lean employee lists (lean-lists-v1, speed work 28 Oct 2026) ----
// An app that sends X-Bunny-Client: 2 gets employee lists without any image data (Aadhaar
// front/back, photos, any data: URL), with hasAadharImages saying whether Aadhaar images exist;
// it opens them one person at a time from GET /employees/:id/documents. The owner's phone used
// to download ~0.7 MB of photos per app open. Without the header the lists are as before.
const IMAGE_FIELD = /aadh?ar(front|back)|photo|image|selfie|avatar|picture/i;

function wantsLeanLists(c: any): boolean {
  return c.req.header('X-Bunny-Client') === '2';
}

function isImageField(key: string, value: unknown): boolean {
  return typeof value === 'string' && (IMAGE_FIELD.test(key) || value.startsWith('data:'));
}

function withoutImages(emp: any) {
  if (!emp || typeof emp !== 'object') return emp;
  const out: any = {};
  for (const [k, v] of Object.entries(emp)) if (!isImageField(k, v)) out[k] = v;
  out.hasAadharImages = emp.hasAadharImages === true || !!(emp.aadharFront || emp.aadharBack);
  return out;
}

// ============================================
// IST TIMEZONE UTILITIES (GMT+5:30)
// ============================================
const IST_OFFSET_HOURS = 5;
const IST_OFFSET_MINUTES = 30;
const IST_OFFSET_MS = (IST_OFFSET_HOURS * 60 + IST_OFFSET_MINUTES) * 60 * 1000;

function getNowIST(): string {
  const now = new Date();
  const istTime = new Date(now.getTime() + IST_OFFSET_MS);
  return istTime.toISOString();
}

function getTodayIST(): string {
  return getNowIST().substring(0, 10);
}

function getDayOfMonthIST(timestamp?: string): number {
  const date = timestamp ? timestamp : getNowIST();
  return parseInt(date.substring(8, 10), 10);
}

function getHourIST(timestamp?: string): number {
  const date = timestamp ? timestamp : getNowIST();
  return parseInt(date.substring(11, 13), 10);
}

function formatDateISTFromDate(date: Date): string {
  return new Date(date.getTime() + IST_OFFSET_MS).toISOString().substring(0, 10);
}

// Pure calendar-date-string arithmetic (no local-timezone-dependent Date object math) -
// safe to use regardless of what timezone this function happens to run in.
function addDaysToDateString(dateStr: string, days: number): string {
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().substring(0, 10);
}

// "09:00" -> "9:00 AM". Timesheet start/endTime are plain "HH:MM" strings (no timezone
// component to worry about), so this is pure string/number formatting.
function formatTime12h(time24?: string): string {
  if (!time24 || !/^\d{1,2}:\d{2}$/.test(time24)) return time24 || '';
  const [h, m] = time24.split(':').map(Number);
  const period = h >= 12 ? 'PM' : 'AM';
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${m.toString().padStart(2, '0')} ${period}`;
}

// One-line summary used in timesheet notifications: "9:00 AM - 6:00 PM (9.00 hrs)".
function formatTimesheetSummary(timesheet: any): string {
  const range = timesheet.startTime && timesheet.endTime
    ? `${formatTime12h(timesheet.startTime)} - ${formatTime12h(timesheet.endTime)}`
    : null;
  const hours = typeof timesheet.totalHours === 'number' ? `${timesheet.totalHours.toFixed(2)} hrs` : null;
  if (range && hours) return `${range} (${hours})`;
  return range || hours || '';
}

function normalizeCiferonTransactionDate(rawValue: any): string | null {
  if (!rawValue) return null;
  const raw = String(rawValue).trim();
  if (!raw) return null;

  const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) {
    const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
    if (!hasExplicitTimezone) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  }

  const numeric = raw.match(/^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})/);
  if (numeric) {
    const first = parseInt(numeric[1], 10);
    const second = parseInt(numeric[2], 10);
    const day = first > 12 ? first : (second > 12 ? second : first);
    const month = first > 12 ? second : (second > 12 ? first : second);
    return `${numeric[3]}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }

  const parsed = new Date(raw);
  if (!Number.isNaN(parsed.getTime())) return formatDateISTFromDate(parsed);

  return null;
}

function getCiferonOrderDate(order: any): string | null {
  return normalizeCiferonTransactionDate(
    order?.TransactionTime ||
    order?.BillDate ||
    order?.OrderDate ||
    order?.CreatedDate ||
    order?.InvoiceDate ||
    order?.Date
  );
}

// Same raw-field fallback chain as getCiferonOrderDate, but keeps the hour instead of
// discarding it - powers the "orders by hour" chart. Returns null (rather than guessing)
// whenever the raw value turns out to be date-only, since fabricating a time would be
// worse than just leaving that order out of the hourly breakdown.
// The IST calendar date of an OrderReport/Sale order, from EntryDate ("2026-07-28T16:40:15",
// IST wall-clock time with no timezone marker), or null when the order carries no usable date.
function getCiferonOrderEntryDateIST(order: any): string | null {
  const raw = String(order?.EntryDate || '').trim();
  const m = raw.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : null;
}

function getCiferonOrderHourIST(order: any): number | null {
  // EntryDate is OrderReport/Sale's real per-order timestamp field (confirmed against a
  // live sample response, e.g. "2026-07-28T16:40:15" - see
  // CIFERON_POS_API_DOCUMENTATION.md). The other names are SaleDetails' field names, kept
  // as a fallback in case this ever gets reused against that endpoint's orders instead.
  const rawValue = order?.EntryDate || order?.TransactionTime || order?.BillDate || order?.OrderDate || order?.CreatedDate || order?.InvoiceDate || order?.Date;
  if (!rawValue) return null;
  const raw = String(rawValue).trim();
  if (!raw) return null;

  // Pure "YYYY-MM-DD" or "DD/MM/YYYY"-style date with nothing after it - no time to extract.
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{4}$/.test(raw)) return null;

  const parsed = new Date(raw);
  if (Number.isNaN(parsed.getTime())) return null;

  const hasExplicitTimezone = /(?:z|[+-]\d{2}:?\d{2})$/i.test(raw);
  if (!hasExplicitTimezone) {
    // No timezone marker - same assumption normalizeCiferonTransactionDate makes for the
    // date-only case: treat the digits as already being IST wall-clock time, read the hour
    // straight off the string instead of running it through IST_OFFSET_MS (which would
    // shift a value that was never UTC in the first place).
    const timeMatch = raw.match(/(\d{1,2}):(\d{2})/);
    return timeMatch ? parseInt(timeMatch[1], 10) : null;
  }

  // Has an explicit timezone (e.g. trailing Z) - convert properly to IST.
  return new Date(parsed.getTime() + IST_OFFSET_MS).getUTCHours();
}

function getExistingSalesAmountTotal(sale: any): number {
  return (sale?.offlineSales || 0) + (sale?.cashAmount || 0) + (sale?.paytmAmount || 0) + (sale?.onlineSales || 0) + (sale?.posOnlineSales || 0);
}

function formatDateTimeIST(timestamp: string): string {
  const date = new Date(timestamp);
  const day = date.getUTCDate();
  const month = date.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' });
  const year = date.getUTCFullYear();
  let hours = date.getUTCHours();
  const minutes = date.getUTCMinutes();
  const ampm = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12 || 12;
  const minutesStr = minutes.toString().padStart(2, '0');
  return `${day} ${month} ${year}, ${hours}:${minutesStr} ${ampm} IST`;
}

const app = new Hono();

// Server version for debugging
console.log('=== Bhandar-IMS Server v1.9 - Paginated getByPrefix Fix ===');
console.log('Server UTC Time:', new Date().toISOString());
console.log('Server IST Time:', getNowIST());
console.log('Environment check:', {
  hasSupabaseUrl: !!Deno.env.get('SUPABASE_URL'),
  hasServiceRoleKey: !!Deno.env.get('SUPABASE_SERVICE_ROLE_KEY'),
  hasVapidKeys: !!Deno.env.get('VAPID_PUBLIC_KEY')
});
console.log('About to configure CORS and middleware...');

// cors-v2 (speed work, 28 Oct 2026): x-region lets the app run the function next to the
// database (Tokyo) instead of next to the phone; idempotency-key, x-bunny-client and
// if-none-match carry the safe-retry, lean-list and bootstrap/ETag features (see
// SERVER_FEATURES). Deployed before any app build sends them.
app.use('*', cors({
  origin: '*',
  allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowHeaders: ['Content-Type', 'Authorization', 'x-region', 'idempotency-key', 'x-bunny-client', 'if-none-match'],
  exposeHeaders: ['Content-Length', 'etag', 'idempotent-replay', 'x-sb-edge-region'],
  maxAge: 86400,
}));
console.log('✅ CORS configured successfully');

app.use('*', logger(console.log));
console.log('✅ Logger middleware configured');

// ---- Login gate (security review, 27 Oct 2026) ----
// Every route needs a signed-in user except a short public list and the cron-only routes (which
// carry X-Cron-Secret). Leftover setup/test/debug routes are switched off. The most sensitive
// routes are limited by role here as well; routes still do their own finer checks.
const API_PREFIX = '/make-server-c2dd9b9d';
// The camera PC (cctv.ts) has no login: it sends the camera's own key.
const PUBLIC_ROUTES = ['/health', '/app-version', '/push/vapid-public-key', '/quick-action', '/workplace/push-photo', '/cctv/config', '/cctv/frame'];
// Read-only item catalog lists that app builds up to 1.15.18 (and the website before PR #4)
// fetch with the public key. Nothing private in them; drop this once every phone is on 1.15.19+.
const LEGACY_PUBLIC_READS = ['/inventory-items', '/custom-items', '/custom-categories'];
const DISABLED_ROUTES = [
  '/auth/signup', '/auth/setup-test-cluster-head', '/auth/admin-login', '/auth/reset-all-accounts', '/auth/fix-role',
  '/auth/create-employee-accounts', '/setup-cluster-head', '/debug/', '/diagnostic/', '/attendance/employees', '/attendance/managers',
];
const OWNER_ONLY = ['cluster_head'];
const LEADS = ['cluster_head', 'manager'];
const WRITES = ['POST', 'PUT', 'DELETE'];
const INCHARGE_DESIGNATIONS = ['store_incharge', 'production_incharge', 'operations_incharge'];
// Expenses (inventory, overheads, fixed costs): managers, the cluster head and incharges on either
// login type; plain staff and contract workers can't (owner, 27 Oct 2026). Each route still pins
// an incharge to their own store or production house.
const canWriteExpenses = (user: { user_metadata?: Record<string, unknown> }) =>
  ['manager', 'cluster_head'].includes(String(user.user_metadata?.role)) ||
  INCHARGE_DESIGNATIONS.includes(String(user.user_metadata?.designation));
// alsoDesignations: let these designations through whatever their login role (incharges on employee logins).
const ROLE_GATES: { test: RegExp; methods?: string[]; roles: string[]; alsoDesignations?: string[] }[] = [
  { test: /^\/unified-employees\/[^/]+\/reset-password$/, roles: OWNER_ONLY },
  { test: /^\/admin\/employees\/[^/]+\/force-password-reset$/, roles: OWNER_ONLY },
  { test: /^\/cluster-heads(\/|$)/, methods: WRITES, roles: OWNER_ONLY },
  { test: /^\/item-sales(\/|$)/, methods: ['DELETE'], roles: OWNER_ONLY },
  { test: /^\/investors(\/|$)/, methods: WRITES, roles: OWNER_ONLY },
  // Full backup download, file checks and restore (backup.ts).
  { test: /^\/admin\/(backup|restore)(\/|$)/, roles: OWNER_ONLY },
  { test: /^\/(unified-employees|employees|archived-employees)(\/|$)/, methods: WRITES, roles: LEADS },
  { test: /^\/payouts(\/|$)/, methods: WRITES, roles: LEADS },
  { test: /^\/salary-advances\/.+/, methods: ['PUT', 'DELETE'], roles: LEADS },
  // Store/production incharges (role employee) approve their own staff; the routes check who (canApproveFor).
  { test: /^\/(timesheets|leaves)\/[^/]+\/(approve|reject)$/, roles: [...LEADS, 'employee'] },
  { test: /^\/push\/send(-multiple)?$/, roles: LEADS },
  // Pay and money that is not the caller's: the org chart, investors, online loans (security review, 28 Oct 2026).
  { test: /^\/organizational-hierarchy$/, roles: [...LEADS, 'audit'] },
  { test: /^\/investors(\/|$)/, roles: [...LEADS, 'audit'] },
  { test: /^\/online-loans(\/|$)/, roles: [...LEADS, 'audit'], alsoDesignations: INCHARGE_DESIGNATIONS },
  // Reminder blasts: the cron jobs (with the secret) or a manager pressing the button.
  { test: /^\/send-/, roles: LEADS },
  // Item catalog edits: renaming, merging or deleting expense items and changing the momo
  // item list (inventory-items.tsx has no checks of its own). Incharges on employee logins keep
  // editing it, as before (owner, 27 Oct 2026).
  { test: /^\/custom-items\/[^/]+$/, methods: ['PUT', 'DELETE'], roles: LEADS, alsoDesignations: INCHARGE_DESIGNATIONS },
  { test: /^\/inventory-items(\/|$)/, methods: WRITES, roles: LEADS, alsoDesignations: INCHARGE_DESIGNATIONS },
  // Events (events.ts): only the owner creates, edits, closes or reopens an event and sets event
  // costs. Everything else on an event (day close, expenses, stock, money, assets) is open to the
  // assigned people and managers, checked per event by the routes themselves.
  { test: /^\/events$/, methods: ['POST'], roles: OWNER_ONLY },
  { test: /^\/events\/[^/]+$/, methods: ['PUT', 'DELETE'], roles: OWNER_ONLY },
  { test: /^\/events\/[^/]+\/(close|reopen)$/, roles: OWNER_ONLY },
  // Recipe capture (recipes.ts): only the owner sets a standard; review, costs and price links are
  // for the owner and managers (the module narrows managers to operations managers).
  { test: /^\/recipes\/standards(\/|$)/, methods: WRITES, roles: OWNER_ONLY },
  { test: /^\/recipes\/(review|costs|price-items|price-links)(\/|$)/, roles: LEADS },
];
const PUSH_SELF_ROUTES = /^\/push\/(subscribe|unsubscribe|subscribe-fcm|unsubscribe-fcm)$/;
// Security review, 28 Oct 2026:
// - The cron secret opens only the scheduled-job routes (it used to skip every check on every route).
const CRON_ROUTES = /^\/(cron\/|send-|pos-sync$|production\/auto-approve-stale$|timesheets\/auto-approve-stale$|notifications\/auto-cleanup$|app-updates\/cleanup$|admin\/recompute-(paytm-balance|production-cash)$|workplace\/summary$)/;
// - The read-only auditor role writes nothing of the business (site auditors post to their audits).
const AUDIT_WRITES = /^\/(notifications|push|auth|me|site-audits|insights)(\/|$)/;
// - Timesheets, leave and salary advances name their person in the body: staff file only their own.
const OWN_RECORD_POSTS = /^\/(timesheets|timesheets\/bulk|leaves|leaves\/bulk|salary-advances)$/;
// - Staff records of the owner and managers, and your own, are changed only by the owner (a manager
//   could archive the owner - a 100-year login block - or change the owner's email, role or pay).
const STAFF_RECORD = /^\/(unified-employees|employees|employee)\/([^/]+)(\/|$)/;
const OWNER_ONLY_FIELDS = ['email', 'role', 'salaryStructure', 'monthlySalary', 'dailyRate', 'salary', 'hourlyRate', 'variablePayMax', 'hasVariablePay', 'bonus'];

// Constant-time comparison for shared secrets.
function sameSecret(given: string | undefined | null, expected: string | undefined | null): boolean {
  if (!given || !expected) return false;
  const a = new TextEncoder().encode(given);
  const b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}
const SITE_AUDITOR_PATHS = /^\/(site-audits|notifications|push|me|auth|bootstrap)(\/|$)/;

app.use(`${API_PREFIX}/*`, async (c, next) => {
  if (c.req.method === 'OPTIONS') return next();
  const path = c.req.path.slice(API_PREFIX.length) || '/';
  if (DISABLED_ROUTES.some((p) => (p.endsWith('/') ? path.startsWith(p) : path === p || path.startsWith(`${p}/`)))) {
    return c.json({ error: 'This feature has been switched off' }, 410);
  }
  if (PUBLIC_ROUTES.some((p) => path === p || path.startsWith(`${p}/`))) return next();
  if (c.req.method === 'GET' && LEGACY_PUBLIC_READS.includes(path)) return next();
  if (CRON_ROUTES.test(path) && sameSecret(c.req.header('X-Cron-Secret'), Deno.env.get('CRON_SYNC_SECRET'))) return next();

  warmPasswordPolicy();
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  // Password rotation (passwords.ts): a password past 90 days, or one the owner force-reset, only
  // opens the password routes until it is changed; the app then shows its change-password screen.
  const passwordBlock = await passwordGate(path, auth.user);
  if (passwordBlock) return c.json(passwordBlock, 403);
  // Independent site auditors (siteAudits.ts) reach their audits, their own login and their
  // notifications - nothing of the business.
  if (auth.user.user_metadata?.designation === 'site_auditor' && !SITE_AUDITOR_PATHS.test(path)) return c.json({ error: 'You are not allowed to do this' }, 403);
  const role = auth.user.user_metadata?.role;
  const gate = ROLE_GATES.find((g) => g.test.test(path) && (!g.methods || g.methods.includes(c.req.method)));
  const designation = auth.user.user_metadata?.designation;
  if (gate && !gate.roles.includes(role) && !gate.alsoDesignations?.includes(designation)) return c.json({ error: 'You are not allowed to do this' }, 403);
  const writing = WRITES.includes(c.req.method) || c.req.method === 'PATCH';
  if (role === 'audit' && writing && !AUDIT_WRITES.test(path)) return c.json({ error: 'This login can only look, not change anything' }, 403);
  const me = auth.user.user_metadata?.employeeId ? String(auth.user.user_metadata.employeeId) : null;
  if (c.req.method === 'POST' && OWN_RECORD_POSTS.test(path) && !LEADS.includes(role) && !INCHARGE_DESIGNATIONS.includes(designation)) {
    const body = await c.req.json().catch(() => ({}));
    const rows = [body, ...(Array.isArray(body?.timesheets) ? body.timesheets : []), ...(Array.isArray(body?.leaves) ? body.leaves : [])];
    if (rows.some((r: any) => r?.employeeId && String(r.employeeId) !== me)) return c.json({ error: 'You can only do this for yourself' }, 403);
  }
  const staffRecord = writing && role !== 'cluster_head' ? STAFF_RECORD.exec(path) : null;
  if (staffRecord && staffRecord[2] !== 'by-email') {
    const targetId = decodeURIComponent(staffRecord[2]);
    const target = await kv.get<any>(`unified-employee:${targetId}`).catch(() => null);
    if (targetId === me || target?.employeeId === me || target?.role === 'cluster_head' || target?.role === 'manager') {
      return c.json({ error: 'Only the owner can change this person' }, 403);
    }
    if (c.req.method === 'PUT') {
      const body = await c.req.json().catch(() => ({}));
      const changed = OWNER_ONLY_FIELDS.filter((k) => body && k in body && JSON.stringify(body[k]) !== JSON.stringify(target?.[k]));
      if (changed.length) return c.json({ error: 'Only the owner can change email, role or pay' }, 403);
    }
  }

  if (WRITES.includes(c.req.method) && /^\/unified-employees(\/|$)/.test(path) && role !== 'cluster_head') {
    // Only the owner hands out manager, owner or audit roles.
    const body = await c.req.json().catch(() => ({}));
    if (body?.role && !['employee', 'rider'].includes(body.role)) return c.json({ error: 'Only the owner can give someone this role' }, 403);
  }
  if (PUSH_SELF_ROUTES.test(path) && role !== 'cluster_head') {
    // Notifications can only be pointed at your own phone.
    const body = await c.req.json().catch(() => ({}));
    if (body?.userId && body.userId !== auth.user.user_metadata?.employeeId) return c.json({ error: 'You can only set up notifications for yourself' }, 403);
  }
  return next();
});

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);
console.log('✅ Supabase client initialized');

// Safe retries for writes: Idempotency-Key (idempotency.ts). After the login gate, before every
// route, so only signed-in requests are keyed (per person).
app.use(`${API_PREFIX}/*`, idempotencyMiddleware({ supabase, verifyUser }));

// When someone approves, rejects or decides a record, every notification about it shows as done
// ("Approved by the store incharge") for everyone it went to (notification-related:{id}).
const RESOLVES: RegExp[] = [
  '/leaves/([^/]+)/(approve|reject)$', '/timesheets/([^/]+)/(approve|reject)$', '/production/([^/]+)/(approve)$',
  '/sales/([^/]+)/(approve|approve-discrepancy|reject-discrepancy)$', '/cash-topup-requests/([^/]+)/(approve|reject)$',
  '/online-loans/([^/]+)/(approve|reject)$', '/production-cash/([^/]+)/(approve-discrepancy|reject-discrepancy)$',
  '/stock-recalibration/([^/]+)/(approve|reject)$', '/repair-alerts/([^/]+)/(fixed)$', '/complaints/([^/]+)/(explain|decide)$',
].map((re) => new RegExp(re));
const VERB: Record<string, string> = { approve: 'approved', reject: 'rejected', 'approve-discrepancy': 'approved', 'reject-discrepancy': 'rejected', fixed: 'fixed', explain: 'explained', decide: 'decided' };
app.use(`${API_PREFIX}/*`, async (c, next) => {
  await next();
  if ((c.req.method !== 'POST' && c.req.method !== 'PUT') || c.res.status >= 300) return;
  const path = new URL(c.req.url).pathname;
  for (const re of RESOLVES) {
    const m = path.match(re);
    if (!m) continue;
    const auth = await verifyUser(c.req.header('Authorization'));
    const by = 'error' in auth ? 'someone' : (auth.user.user_metadata?.name || auth.user.email || 'someone');
    const id = decodeURIComponent(m[1]);
    const verb = VERB[m[2]] || 'handled';
    await afterResponse('Resolve notifications', () => resolveNotifications(id, { by, verb, onlyUser: m[2] === 'explain' && !('error' in auth) ? auth.user.id : undefined }));
    break;
  }
});

// ---- Date windows on the history lists (date-range-v1, speed work 28 Oct 2026) ----
// The big history lists accept ?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional, inclusive) and
// return only records whose own calendar date (the IST date the app stored on them) falls in
// the window. Without either parameter a route answers exactly as before (older app builds).
type DateRange = { from?: string; to?: string; field: string };
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// The window asked for on this request, null when none, or an error message for a bad date.
function requestedDateRange(c: any, field = 'date'): { range: DateRange | null } | { error: string } {
  const from = c.req.query('from') || undefined;
  const to = c.req.query('to') || undefined;
  if (!from && !to) return { range: null };
  if ((from && !ISO_DAY.test(from)) || (to && !ISO_DAY.test(to))) return { error: 'from and to must be dates like 2026-10-28' };
  if (from && to && from > to) return { error: 'from must not be after to' };
  return { range: { from, to, field } };
}

// Exact check in code, after the database's own (text) filter: a stored value with a time part
// ("2026-10-28T09:00") counts as its date.
function inDateRange(record: any, range: DateRange): boolean {
  const day = typeof record?.[range.field] === 'string' ? record[range.field].slice(0, 10) : '';
  if (!day) return false;
  return (!range.from || day >= range.from) && (!range.to || day <= range.to);
}

// Paginated getByPrefix to bypass Supabase's default 1000-row limit. The first page also
// returns the total, and any further pages are fetched together rather than one after
// another (inventory: is 5 pages; each round trip to the database used to add ~260 ms).
// Rows are de-duplicated by key, so a row added while the pages are read can't appear twice.
// With a date range the database filters too, so only that window is read at all.
async function getAllByPrefix(prefix: string, range?: DateRange | null): Promise<any[]> {
  const pageSize = 1000;
  const page = (start: number, withCount: boolean) => {
    let query = supabase
      .from('kv_store_c2dd9b9d')
      .select('key, value', withCount ? { count: 'exact' } : undefined)
      .like('key', prefix + '%');
    if (range?.from) query = query.gte(`value->>${range.field}`, range.from);
    // Below the next day rather than <= to, so a stored date with a time part is included.
    if (range?.to) query = query.lt(`value->>${range.field}`, addDaysToDateString(range.to, 1));
    return query
      // Without a stable order, page boundaries can shift between requests and rows get
      // returned twice or skipped entirely once a prefix passes 1000 rows.
      .order('key', { ascending: true })
      .range(start, start + pageSize - 1);
  };

  const byKey = new Map<string, any>();
  const take = (rows: any[] | null) => {
    for (const row of rows || []) if (!byKey.has(row.key)) byKey.set(row.key, row.value);
  };

  const first = await page(0, true);
  if (first.error) throw new Error(first.error.message);
  take(first.data);
  let lastLength = first.data?.length || 0;
  let next = pageSize;
  if (lastLength === pageSize) {
    const total = typeof first.count === 'number' ? first.count : 0;
    const starts: number[] = [];
    for (let s = pageSize; s < total; s += pageSize) starts.push(s);
    const pages = await Promise.all(starts.map((s) => page(s, false)));
    for (const p of pages) {
      if (p.error) throw new Error(p.error.message);
      take(p.data);
    }
    if (pages.length) {
      lastLength = pages[pages.length - 1].data?.length || 0;
      next = starts[starts.length - 1] + pageSize;
    }
    // Rows added since the count: carry on page by page until a short page.
    while (lastLength === pageSize) {
      const p = await page(next, false);
      if (p.error) throw new Error(p.error.message);
      take(p.data);
      lastLength = p.data?.length || 0;
      next += pageSize;
    }
  }

  const values = Array.from(byKey.values());
  return range ? values.filter((v) => inDateRange(v, range)) : values;
}

// Paginated version with retry
async function getAllByPrefixWithRetry(prefix: string, range?: DateRange | null): Promise<any[]> {
  return retryWithBackoff(() => getAllByPrefix(prefix, range), `getAllByPrefix(${prefix})`);
}

// One record of a collection by its id field. The database finds it, instead of the whole
// collection being downloaded to search it (inventory: is 4,000+ rows, ~2 MB, 5 pages).
// Same answer as that search: the first exact match in key order.
async function findByIdInPrefix(prefix: string, id: string): Promise<any | undefined> {
  return retryWithBackoff(async () => {
    const { data, error } = await supabase
      .from('kv_store_c2dd9b9d')
      .select('key, value')
      .like('key', prefix + '%')
      .eq('value->>id', id)
      .order('key', { ascending: true });
    if (error) throw new Error(error.message);
    return (data || []).map((row: any) => row.value).find((v: any) => v?.id === id);
  }, `findByIdInPrefix(${prefix})`);
}

// Generic retry wrapper for database operations
async function retryWithBackoff<T>(
  operation: () => Promise<T>,
  operationName: string,
  maxRetries = 3
): Promise<T> {
  const retryDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 5000);
  
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error: any) {
      // Check for infrastructure errors (Cloudflare 500, HTML responses, etc.)
      const isInfrastructureError = 
        error?.message?.includes('<!DOCTYPE html>') ||
        error?.message?.includes('500: Internal server error') ||
        error?.message?.includes('Cloudflare') ||
        error?.message?.includes('Internal server error');
      
      const isConnectionError = 
        error?.message?.includes('connection reset') || 
        error?.message?.includes('connection error') ||
        error?.message?.includes('ECONNRESET') ||
        error?.message?.includes('ETIMEDOUT') ||
        error?.message?.includes('client error');
      
      // For infrastructure errors, don't retry - fail fast with a clear message
      if (isInfrastructureError) {
        console.error(`❌ Infrastructure error in ${operationName}:`, 'Supabase/Cloudflare service temporarily unavailable');
        throw new Error('DATABASE_UNAVAILABLE');
      }
      
      if (isConnectionError && attempt < maxRetries) {
        const delay = retryDelay(attempt);
        console.log(`⚠️ Connection error in ${operationName}, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries})...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }
      
      // If we've exhausted retries or it's a different error, throw it
      console.error(`❌ Error in ${operationName} after ${attempt + 1} attempts:`, error);
      throw error;
    }
  }
  
  throw new Error(`Failed to execute ${operationName} after ${maxRetries} retries`);
}

// KV operation wrappers with retry logic
const kvWithRetry = {
  get: <T = any>(key: string) => retryWithBackoff<T>(() => kv.get(key), `kv.get(${key})`),
  set: (key: string, value: any) => retryWithBackoff(() => kv.set(key, value), `kv.set(${key})`),
  del: (key: string) => retryWithBackoff(() => kv.del(key), `kv.del(${key})`),
  getByPrefix: <T = any>(prefix: string) => retryWithBackoff<T[]>(() => kv.getByPrefix(prefix), `kv.getByPrefix(${prefix})`),
  mget: <T = any>(keys: string[]) => retryWithBackoff<T[]>(() => kv.mget(keys), `kv.mget`),
  mset: (keys: string[], values: any[]) => retryWithBackoff(() => kv.mset(keys, values), `kv.mset`),
  mdel: (keys: string[]) => retryWithBackoff(() => kv.mdel(keys), `kv.mdel`)
};

// ---- Work after the response (speed work, 28 Oct 2026) ----
// Notifications and pushes don't change what a save answers, so the slow write routes hand
// them over here and reply at once (a POST /inventory used to take 3.5 s, mostly this; and the
// longer a save stays open on a weak signal, the likelier it drops). EdgeRuntime.waitUntil keeps
// the server copy alive until the work is done; where it doesn't exist the work is awaited as
// before. Failures are logged, never thrown - the save itself has already succeeded.
function afterResponse(label: string, work: () => Promise<unknown>): Promise<void> {
  const task = Promise.resolve()
    .then(work)
    .then(() => undefined, (error) => console.log(`${label} failed (after the response):`, error instanceof Error ? error.message : String(error)));
  const runtime = (globalThis as any).EdgeRuntime;
  if (runtime && typeof runtime.waitUntil === 'function') {
    runtime.waitUntil(task);
    return Promise.resolve();
  }
  return task;
}

// ---- Login check (speed work, 28 Oct 2026) ----
// Each answer is kept per server copy for up to a minute (never past the token's own expiry),
// and the login gate, the route and anything else in the same request share one check while it
// runs. On a fresh copy the check costs one call to the auth server: getUser already returns
// the stored user (current roles, ban and app_metadata), so the second getUserById call it used
// to make bought nothing. The archived-record read starts alongside it.
const VERIFIED_TOKEN_TTL_MS = 60_000;
const verifiedTokens = new Map<string, { at: number; until: number; result: any }>();
const verifyingTokens = new Map<string, Promise<any>>();

// The token's claims, read without checking the signature: only a hint for the archived-record
// read started in parallel, used only once getUser has vouched for the same login.
function unverifiedClaims(accessToken: string): any {
  try {
    const part = accessToken.split('.')[1];
    if (!part) return null;
    const json = atob(part.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(part.length / 4) * 4, '='));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function rememberVerified(accessToken: string, result: any, claims: any) {
  const now = Date.now();
  const expiresMs = typeof claims?.exp === 'number' ? claims.exp * 1000 : now + VERIFIED_TOKEN_TTL_MS;
  const until = Math.min(now + VERIFIED_TOKEN_TTL_MS, expiresMs);
  if (until <= now) return;
  if (verifiedTokens.size > 500) {
    for (const [token, entry] of verifiedTokens) if (entry.until <= now) verifiedTokens.delete(token);
    if (verifiedTokens.size > 500) verifiedTokens.clear();
  }
  verifiedTokens.set(accessToken, { at: now, until, result });
}

// Auth server unreachable or failing (as opposed to "this token is no good"): supabase-js hands
// these back as an error value rather than throwing, and they used to answer 401, which signs
// the person out on a network blip.
function isTransientAuthError(error: any): boolean {
  if (!error) return false;
  if (error.name === 'AuthRetryableFetchError') return true;
  const status = typeof error.status === 'number' ? error.status : undefined;
  return status === 0 || (status !== undefined && status >= 500);
}

// Middleware to verify user authentication with retry logic
async function verifyUser(authHeader: string | null): Promise<any> {
  if (!authHeader) {
    return { error: 'Unauthorized', status: 401 };
  }

  const accessToken = authHeader.split(' ')[1];
  if (!accessToken) return { error: 'Unauthorized', status: 401 };
  // The login gate and the route itself both verify the same token: reuse a fresh answer.
  const cachedAuth = verifiedTokens.get(accessToken);
  if (cachedAuth && Date.now() < cachedAuth.until) return cachedAuth.result;
  const running = verifyingTokens.get(accessToken);
  if (running) return running;
  const check = verifyAccessToken(accessToken).finally(() => verifyingTokens.delete(accessToken));
  verifyingTokens.set(accessToken, check);
  return check;
}

async function verifyAccessToken(accessToken: string, retryCount = 0): Promise<any> {
  const maxRetries = 3;
  const retryDelay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 5000); // Exponential backoff, max 5s

  // Start the archived-record read now, by the employee id the token itself names, so it
  // overlaps the auth call. (Never for the owner - see below.)
  const claims = unverifiedClaims(accessToken);
  const claimedEmployeeId = claims?.app_metadata?.employeeId || claims?.user_metadata?.employeeId;
  const archivedEarly = typeof claims?.sub === 'string' && typeof claimedEmployeeId === 'string' && claims?.app_metadata?.role !== 'cluster_head'
    ? isArchivedLogin(claimedEmployeeId, claims.sub)
    : null;

  try {
    const { data: { user }, error } = await supabase.auth.getUser(accessToken);
    if (isTransientAuthError(error)) throw error;

    if (error || !user?.id) {
      return { error: 'Unauthorized', status: 401 };
    }

    // An archived employee's login is banned (see setEmployeeLoginBlocked), but an access
    // token issued before that stays valid until it expires - refuse it here so leaving
    // takes effect at once. 401 makes the app sign them out.
    // Someone archived before archiving switched logins off has no ban yet: catch them
    // by their archived record and ban them now. (Never the owner - a stray archived
    // copy of their record must not lock the business out.)
    const employeeIdHint = user.app_metadata?.employeeId || user.user_metadata?.employeeId;
    const isOwner = user.app_metadata?.role === 'cluster_head';
    const archived = !isOwner && (archivedEarly && user.id === claims.sub && employeeIdHint === claimedEmployeeId
      ? await archivedEarly
      : await isArchivedLogin(employeeIdHint, user.id));
    if (isLoginBlocked(user) || archived) {
      if (!isLoginBlocked(user)) await setEmployeeLoginBlocked(user.id, true);
      const result = { error: 'This login has been switched off', status: 401 };
      rememberVerified(accessToken, result, claims);
      return result;
    }
    // Roles from app_metadata only (see withTrustedRoles).
    const result = { user: withTrustedRoles(user) };
    rememberVerified(accessToken, result, claims);
    return result;
  } catch (error: any) {
    // Only an infra/network hiccup talking to Supabase Auth lands here (a thrown exception,
    // or a retryable/5xx error re-thrown above) - not proof the user's session is bad. A
    // genuinely invalid/expired token is answered with 401 above.
    // Retry generously, and if retries are exhausted, return 503 (not 401) so the
    // frontend's retry-on-5xx logic kicks in instead of force-logging the user out -
    // treating "we couldn't verify" as "verification failed" was logging people out
    // on ordinary network blips.
    if (retryCount < maxRetries) {
      const delay = retryDelay(retryCount);
      console.log(`⚠️ Transient error in verifyUser (${error?.message || error}), retrying in ${delay}ms (attempt ${retryCount + 1}/${maxRetries})...`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return verifyAccessToken(accessToken, retryCount + 1);
    }

    console.error('❌ Error in verifyUser after retries:', error);
    return { error: 'Service temporarily unavailable, please retry', status: 503 };
  }
}

// ---- Leaving staff lose their login ----
// Archiving used to only flag isActive in user_metadata, which nothing checked, so a former
// employee kept full access. Now the login is banned (no sign-in, no token refresh) and
// app_metadata.archived is set; verifyUser refuses both, which also cuts off a session that
// was already open. Restoring the employee lifts the ban.
const ARCHIVED_BAN_DURATION = '876000h'; // ~100 years: GoTrue has no "forever"

function isLoginBlocked(user: any): boolean {
  if (user?.app_metadata?.archived === true) return true;
  const until = user?.banned_until ? new Date(user.banned_until).getTime() : 0;
  return until > Date.now();
}

// True when this login belongs to an archived employee record and to no active one. Ids
// were reused in the past, so the archived record must carry this very login. One primary
// key read on the common path (verifyUser answers are cached for a minute and the read runs
// alongside the auth call); a read failure never locks anyone out.
async function isArchivedLogin(employeeId: string | undefined, authUserId: string): Promise<boolean> {
  if (!employeeId) return false;
  try {
    const archived = await kv.get(`archived-employee:${employeeId}`);
    if (!archived || archived.authUserId !== authUserId) return false;
    const active = await kv.get(`unified-employee:${employeeId}`);
    return !(active && active.authUserId === authUserId);
  } catch {
    return false;
  }
}

// true = done, false = the auth call failed, null = this record has no login to change.
async function setEmployeeLoginBlocked(authUserId: string | undefined, blocked: boolean): Promise<boolean | null> {
  if (!authUserId) return null;
  try {
    const { error } = await supabase.auth.admin.updateUserById(authUserId, {
      ban_duration: blocked ? ARCHIVED_BAN_DURATION : 'none',
      app_metadata: { archived: blocked },
      user_metadata: blocked
        ? { isActive: false, archivedAt: new Date().toISOString() }
        : { isActive: true, archivedAt: null },
    });
    if (error) throw error;
    // Drop any cached "verified" answer for this person so the change applies immediately.
    for (const [token, entry] of verifiedTokens) {
      if (entry.result?.user?.id === authUserId) verifiedTokens.delete(token);
    }
    return true;
  } catch (error) {
    console.log(`Could not ${blocked ? 'block' : 'restore'} a login:`, error instanceof Error ? error.message : String(error));
    return false;
  }
}

// Signup route
app.post('/make-server-c2dd9b9d/auth/signup', async (c) => {
  try {
    const { email, password, name, role, employeeId } = await c.req.json();

    console.log('=== SIGNUP REQUEST ===');
    console.log('Email:', email);
    console.log('Role:', role);
    console.log('EmployeeId:', employeeId);

    if (!email || !password || !role) {
      return c.json({ error: 'Email, password, and role are required' }, 400);
    }

    if (!['manager', 'cluster_head', 'employee', 'audit'].includes(role)) {
      return c.json({ error: 'Invalid role. Must be manager, cluster_head, employee, or audit' }, 400);
    }

    // For employees, employeeId is required
    if (role === 'employee' && !employeeId) {
      return c.json({ error: 'Employee ID is required for employee accounts' }, 400);
    }

    // Create user with Supabase Auth
    console.log('Creating user with admin API...');
    const { data, error } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { name, role, employeeId: employeeId || null }
    });

    if (error) {
      console.log('Signup error:', error);
      return c.json({ error: error.message }, 400);
    }

    console.log('User created successfully:', data.user?.id);
    
    // IMPORTANT: Update the password to ensure it's properly set for signInWithPassword
    console.log('Setting password explicitly...');
    await supabase.auth.admin.updateUserById(data.user.id, {
      password: password
    });

    // If employee, link to existing employee record
    if (role === 'employee' && employeeId) {
      try {
        const employees = await kv.getByPrefix('employee:');
        const employee = employees.find((emp: any) => emp.employeeId === employeeId);
        
        if (employee) {
          // Update employee with email
          await kv.set(`employee:${employee.id}`, { ...employee, email });
        }
      } catch (err) {
        console.log('Error linking employee:', err);
      }
    }

    return c.json({ success: true, user: data.user });
  } catch (error) {
    console.log('Server error during signup:', error);
    return c.json({ error: 'Failed to create account' }, 500);
  }
});

// Quick setup endpoint for creating test cluster head (for development/testing)
// This endpoint handles everything: delete old account + create new account + create employee record
app.post('/make-server-c2dd9b9d/auth/setup-test-cluster-head', async (c) => {
  try {
    const testEmail = 'admin@bhandar.com';
    const testPassword = 'Admin@123';
    const testName = 'Test Cluster Head';
    const employeeId = 'BM001';
    
    // Step 1: Check if cluster head already exists and delete it
    try {
      const { data: existingUsers } = await supabase.auth.admin.listUsers();
      const existing = existingUsers?.users?.find(u => u.email === testEmail);
      
      if (existing) {
        // Delete existing user
        await supabase.auth.admin.deleteUser(existing.id);
        console.log('Deleted existing test cluster head');
        
        // Also delete the unified employee record
        try {
          await kv.del(`unified-employee:${employeeId}`);
          console.log('Deleted existing unified employee record');
        } catch (e) {
          console.log('No unified employee record to delete');
        }
      }
    } catch (e) {
      console.log('No existing user to delete');
    }

    // Step 2: Create the new account with admin API (bypasses email confirmation)
    const { data: userData, error: createError } = await supabase.auth.admin.createUser({
      email: testEmail,
      password: testPassword,
      user_metadata: {
        name: testName,
        role: 'cluster_head',
        employeeId: employeeId
      },
      email_confirm: true // Auto-confirm email
    });

    if (createError) {
      console.log('Failed to create cluster head:', createError);
      return c.json({ error: createError.message }, 400);
    }

    console.log('Created cluster head auth account:', userData.user.id);

    // Step 3: Create unified employee record
    try {
      const employee = {
        employeeId: employeeId,
        name: testName,
        email: testEmail,
        role: 'cluster_head',
        employmentType: 'fulltime',
        joiningDate: new Date().toISOString().split('T')[0],
        createdBy: 'system',
        status: 'active',
        authUserId: userData.user.id,
        createdAt: getNowIST()
      };
      
      await kv.set(`unified-employee:${employeeId}`, employee);
      console.log('Created unified employee record');
    } catch (err) {
      console.log('Error creating unified employee record:', err);
    }

    return c.json({
      success: true,
      message: 'Test cluster head created successfully!',
      credentials: {
        email: testEmail,
        password: testPassword,
        name: testName,
        role: 'cluster_head',
        employeeId: employeeId
      }
    });
  } catch (error) {
    console.log('Setup error:', error);
    return c.json({ error: 'Failed to setup test cluster head' }, 500);
  }
});

// Admin login endpoint - generates session token using admin privileges
// This bypasses password authentication for development/testing
app.post('/make-server-c2dd9b9d/auth/admin-login', async (c) => {
  try {
    const { email } = await c.req.json();
    
    if (!email) {
      return c.json({ error: 'Email is required' }, 400);
    }

    // Find user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return c.json({ error: listError.message }, 400);
    }

    const user = users.users.find(u => u.email === email);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Generate a magic link which includes access tokens
    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: email,
      options: {
        redirectTo: window?.location?.origin || 'http://localhost:3000'
      }
    });

    if (linkError) {
      console.log('Error generating login link:', linkError);
      return c.json({ error: linkError.message }, 400);
    }

    // Extract tokens from the properties
    const properties = linkData?.properties;
    
    return c.json({
      success: true,
      user: {
        id: user.id,
        email: user.email,
        user_metadata: user.user_metadata
      },
      session: properties
    });
  } catch (error) {
    console.log('Admin login error:', error);
    return c.json({ error: 'Failed to generate admin login' }, 500);
  }
});

// Delete ALL auth accounts - complete reset for fixing broken accounts
app.post('/make-server-c2dd9b9d/auth/reset-all-accounts', async (c) => {
  try {
    console.log('Deleting ALL auth accounts for fresh start...');
    
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return c.json({ error: listError.message }, 400);
    }

    const deleted = [];
    const errors = [];

    // Delete every single auth account
    for (const user of users.users) {
      try {
        await supabase.auth.admin.deleteUser(user.id);
        deleted.push(user.email);
        console.log(`Deleted: ${user.email}`);
      } catch (err) {
        errors.push({ email: user.email, error: String(err) });
      }
    }

    // Clear authUserId from all employee records
    try {
      const allEmployees = await kv.getByPrefix('employee:');
      for (const emp of allEmployees) {
        await kv.set(`employee:${emp.id}`, { ...emp, authUserId: null });
      }
      
      const unifiedEmployees = await kv.getByPrefix('unified-employee:');
      for (const emp of unifiedEmployees) {
        const key = `unified-employee:${emp.employeeId}`;
        await kv.set(key, { ...emp, authUserId: null });
      }
    } catch (err) {
      console.log('Error clearing employee auth IDs:', err);
    }

    return c.json({
      success: true,
      message: 'All auth accounts deleted. System reset complete.',
      deleted: deleted.length,
      deletedAccounts: deleted,
      errors: errors.length,
      errorDetails: errors
    });
  } catch (error) {
    console.log('Reset accounts error:', error);
    return c.json({ error: 'Failed to reset accounts' }, 500);
  }
});

// Get all inventory items for user
app.get('/make-server-c2dd9b9d/inventory', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    console.log('🔍 [INVENTORY GET] Fetching inventory items (paginated)...');
    // All users (cluster heads, employees, and managers) see all inventory
    // Filtering by storeId happens in the frontend
    // Use paginated query to avoid Supabase's default 1000-row limit
    const items = await getAllByPrefixWithRetry('inventory:', windowed.range);
    console.log('🔍 [INVENTORY GET] Found items:', items.length);
    console.log('🔍 [INVENTORY GET] Sample items:', items.slice(0, 3).map(i => ({ id: i.id, date: i.date, itemName: i.itemName })));
    
    return c.json({ inventory: items || [] });
  } catch (error: any) {
    console.error('❌ [INVENTORY GET] Error fetching inventory:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ inventory: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch inventory' }, 500);
  }
});

// Add inventory item
app.post('/make-server-c2dd9b9d/inventory', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    console.log('💾 [INVENTORY POST] Starting inventory save...');
    console.log('💾 [INVENTORY POST] User ID:', userId);
    console.log('💾 [INVENTORY POST] User role:', role);

    if (!canWriteExpenses(authResult.user)) {
      console.log('❌ [INVENTORY POST] Access denied - user is not a manager or cluster head');
      return c.json({ error: 'Only managers and cluster heads can add inventory items' }, 403);
    }

    const item = await c.req.json();
    console.log('💾 [INVENTORY POST] Item data received:', { date: item.date, itemName: item.itemName, amount: item.amount });
    // One item, one name (itemNameReview.ts): a known item typed another way is saved under its name.
    const known = await knownNames();
    const named = settleName(item.itemName, 'inventory', item.category, known.items, known.aliases);
    if (named.typedAs) Object.assign(item, { itemName: named.name, typedAs: named.typedAs });
    // One item, one category (itemHome.ts): a known item goes under its own, whatever the form sent.
    const settled = settleCategory(item.itemName, item.category, await loadItemHomes());
    if (settled.moved) console.log(`[INVENTORY POST] ${item.itemName} sent under ${item.category}: saved under ${settled.category}, its own category`);
    
    const itemId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = `inventory:${userId}:${itemId}`;

    const storeId = authResult.user.user_metadata?.storeId;
    const designation = authResult.user.user_metadata?.designation;
    const userName = authResult.user.user_metadata?.name;
    const userEmail = authResult.user.email;
    const employeeId = authResult.user.user_metadata?.employeeId; // Employee ID like BM001

    // Production incharges have their production house ID stored in storeId (see
    // /production-houses/:id/assign-head above); everyone else's storeId is a real store.
    const isProductionIncharge = designation === 'production_incharge';
    const isStoreIncharge = designation === 'store_incharge';
    // Everyone can choose entity via the client payload. Flexible roles (operations
    // manager, cluster head, etc.) trust it outright. Store/production incharge are
    // normally pinned to their own location, but the Quick Add flow explicitly lets them
    // log an expense for the OTHER entity too (e.g. a store incharge picking up the
    // production house's chicken order while out - the matcher itself already suggests
    // "usually bought at Production House" regardless of who's submitting). Honor that
    // explicit choice using the id the client sent for it, since their own profile only
    // carries an id for their own side.
    const requestedEntityType: 'store' | 'production_house' | null =
      item.entityType === 'production_house' || item.entityType === 'store' ? item.entityType : null;
    const naturalEntityType: 'store' | 'production_house' = isProductionIncharge ? 'production_house' : 'store';
    const entityType = requestedEntityType || naturalEntityType;
    // The cluster head and operations managers belong to no single store or production house,
    // so whichever one the client names is the one the expense is for (an operations manager
    // used to be pinned to their own storeId too). Store and production incharges stay pinned.
    const pinnedToOwnSide = role !== 'cluster_head' && (isStoreIncharge || isProductionIncharge);
    const resolvedProductionHouseId = entityType === 'production_house'
      ? (pinnedToOwnSide && entityType === naturalEntityType ? (storeId || null) : (item.productionHouseId || null))
      : null;
    const resolvedStoreId = entityType === 'store'
      ? (pinnedToOwnSide && entityType === naturalEntityType ? (storeId || null) : (item.storeId || null))
      : null;
    if (!pinnedToOwnSide && !resolvedStoreId && !resolvedProductionHouseId) {
      return c.json({ error: 'Pick the store or production house this expense is for' }, 400);
    }

    const inventoryItem = {
      ...item,
      category: settled.category,
      id: itemId,
      userId,
      storeId: resolvedStoreId,
      entityType,
      productionHouseId: resolvedProductionHouseId,
      paidFromProductionHouseId: resolvePaidFromProductionHouseId({ ...item, entityType }, role, null),
      createdBy: employeeId || userId, // Use employeeId if available, fallback to userId
      createdByName: userName,
      createdByEmail: userEmail
    };

    console.log('💾 [INVENTORY POST] Saving to key:', key);
    console.log('💾 [INVENTORY POST] Full item:', inventoryItem);
    
    await kvWithRetry.set(key, inventoryItem);
    console.log('✅ [INVENTORY POST] Inventory Purchase Record saved successfully!');
    // (A read-back of the row just written, for a log line, used to follow here: removed.)

    await cascadeProductionCashForExpense(inventoryItem);
    // Checked for slips, odd categories and repeat buys, after the response (expenseReview.ts).
    await afterResponse('Expense review', () => reviewExpense(expenseReviewDeps, 'inventory', key, inventoryItem, userName || userEmail, role));
    // A name the app doesn't know: Bunny reads it, else it waits for the owner (itemNameReview.ts).
    if (!named.typedAs) await afterResponse('Item name check', () => reviewNewName(nameReviewDeps, { key, type: 'inventory', row: inventoryItem, by: userName || userEmail, byOwner: role === 'cluster_head' }));

    // Notify the production incharge (bill paid from production cash) and cluster heads about
    // the inventory data entry - after the response (afterResponse).
    const managerName = authResult.user.user_metadata?.name || authResult.user.email;
    await afterResponse('Inventory notifications', async () => {
      if (inventoryItem.paidFromProductionHouseId) {
        await notifyStoreBillPaidFromProductionCash(inventoryItem, userName || userEmail);
      }
      const clusterHeads = await getAllClusterHeads();
      console.log('📢 [INVENTORY POST] Notifying cluster heads:', clusterHeads.length);
      for (const clusterHead of clusterHeads) {
        if (clusterHead.authUserId) {
          const notificationResult = await notifyUser(
            clusterHead.authUserId,
            'inventory_logged',
            'Inventory Data Logged',
            `${managerName} logged inventory data for ${item.date}`,
            itemId,
            item.date
          );
          console.log('📢 [INVENTORY POST] Notification result for', clusterHead.name, ':', notificationResult ? 'success' : 'failed (non-critical)');
        }
      }
    });

    console.log('✅ [INVENTORY POST] Complete! Returning success response');
    return c.json({ success: true, item: inventoryItem });
  } catch (error) {
    console.error('❌ [INVENTORY POST] Error adding inventory item:', error);
    console.error('❌ [INVENTORY POST] Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return c.json({ error: 'Failed to add inventory item' }, 500);
  }
});

// Who logged an expense stays on it: the edit forms don't send these fields and the PUT
// routes replace the whole record, so every edit used to drop them.
function keepExpenseAuthor(existing: any, updated: any) {
  for (const field of ['createdBy', 'createdByName', 'createdByEmail']) {
    if (existing?.[field] !== undefined) updated[field] = existing[field];
  }
  return updated;
}

// Update inventory item
app.put('/make-server-c2dd9b9d/inventory/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (!canWriteExpenses(authResult.user)) {
      return c.json({ error: 'Only managers and cluster heads can update inventory items' }, 403);
    }

    const itemId = c.req.param('id');
    // Update the record where it already lives (under whoever created it). Writing under the
    // editor's own id used to leave the original in place and add a second copy whenever
    // someone edited another person's entry (a 22 Jan 2026 gas bill exists twice this way).
    // Paginated: inventory: has 3000+ rows, and the plain prefix read stops at 1000, so an
    // older entry wasn't found and the edit was saved as a second copy.
    const existing = await findByIdInPrefix('inventory:', itemId);
    // An edit of an entry deleted meanwhile (another phone, an open form) used to write it back.
    if (!existing) {
      return c.json({ error: 'Inventory item not found - it may have been deleted' }, 404);
    }
    const ownerId = existing.userId || userId;
    const key = `inventory:${ownerId}:${itemId}`;
    const updates = await c.req.json();

    const inventoryItem = keepExpenseAuthor(existing, {
      ...updates,
      id: itemId,
      userId: ownerId
    });
    const settled = settleCategory(inventoryItem.itemName, inventoryItem.category, await loadItemHomes());
    if (settled.moved) inventoryItem.category = settled.category;
    inventoryItem.paidFromProductionHouseId = resolvePaidFromProductionHouseId(inventoryItem, role, existing);

    await kvWithRetry.set(key, inventoryItem);
    console.log('✅ Inventory Purchase Record updated successfully:', key);
    await afterResponse('Expense recheck', () => recheckAmount(expenseReviewDeps, inventoryItem, authResult.user.user_metadata?.name || authResult.user.email));

    await cascadeProductionCashForExpense(existing, inventoryItem);
    if (inventoryItem.paidFromProductionHouseId && inventoryItem.paidFromProductionHouseId !== existing?.paidFromProductionHouseId) {
      await afterResponse('Store bill notification', () => notifyStoreBillPaidFromProductionCash(inventoryItem, authResult.user.user_metadata?.name || authResult.user.email));
    }

    return c.json({ success: true, item: inventoryItem });
  } catch (error) {
    console.log('Error updating inventory item:', error);
    return c.json({ error: 'Failed to update inventory item' }, 500);
  }
});

// Delete inventory item
app.delete('/make-server-c2dd9b9d/inventory/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (!canWriteExpenses(authResult.user)) {
      return c.json({ error: 'Only managers and cluster heads can delete inventory items' }, 403);
    }

    const itemId = c.req.param('id');
    
    // Find the inventory item by searching all inventory items with this ID
    const targetInventory = await findByIdInPrefix('inventory:', itemId);
    
    if (!targetInventory) {
      console.log(`⚠️ Inventory item not found: ${itemId}. It may have been already deleted.`);
      // Return success even if not found - idempotent delete
      return c.json({ success: true, message: 'Item already deleted or does not exist' });
    }
    
    // Construct the key using the original creator's userId
    const key = `inventory:${targetInventory.userId}:${itemId}`;
    console.log(`🗑️ Deleting inventory item: ${key}`);

    await kvWithRetry.del(key);
    await cascadeProductionCashForExpense(targetInventory);
    await afterResponse('Expense checks', () => closeFlagsOf(expenseReviewDeps, itemId, authResult.user.user_metadata?.name || authResult.user.email || 'Someone'));

    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting inventory item:', error);
    return c.json({ error: 'Failed to delete inventory item' }, 500);
  }
});

// Get all overhead items for user
app.get('/make-server-c2dd9b9d/overheads', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    // All users (cluster heads, employees, and managers) see all overheads
    // Filtering by storeId happens in the frontend
    // Use paginated query to avoid Supabase's default 1000-row limit
    const items = await getAllByPrefixWithRetry('overhead:', windowed.range);
    
    return c.json({ overheads: items || [] });
  } catch (error: any) {
    console.log('Error fetching overheads:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ overheads: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch overheads' }, 500);
  }
});

// Add overhead item
app.post('/make-server-c2dd9b9d/overheads', async (c) => {
  console.log('🔵 POST /overheads - Adding Expense/Overhead Request received');
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    console.log('❌ Auth failed for overhead creation:', authResult.error);
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;
    console.log(`👤 User ${userId} with role ${role} is creating expense/overhead`);

    if (!canWriteExpenses(authResult.user)) {
      console.log('⛔ Unauthorized: User is not a manager or cluster head');
      return c.json({ error: 'Only managers and cluster heads can add overhead items' }, 403);
    }

    const item = await c.req.json();
    if (item?.category === 'fuel' && role !== 'cluster_head') {
      return c.json({ error: 'Fuel cost entries need cluster head permission. Use Electric Bike Charging for the e-bike.' }, 403);
    }
    if (mealsStopped(item?.category, item?.date)) return c.json({ error: MEALS_STOPPED_TEXT }, 400);
    if ((item?.category === 'losses_writeoffs' || item?.category === 'ai_credits') && role !== 'cluster_head') {
      return c.json({ error: 'Only the cluster head can write off a loss.' }, 403);
    }
    console.log('💰 Expense/Overhead item data received:', JSON.stringify(item, null, 2));
    // One item, one name and one category (itemNameReview.ts) - never into a category this person
    // couldn't pick (fuel, write-offs) or one closed for the date (meals from November).
    const known = await knownNames();
    const named = settleName(item.description, 'overhead', item.category, known.items, known.aliases);
    if (named.typedAs) Object.assign(item, { description: named.name, typedAs: named.typedAs });
    const ownerOnly = ['fuel', 'losses_writeoffs', 'ai_credits'].includes(named.category) && role !== 'cluster_head';
    if (named.category !== item.category && !ownerOnly && !mealsStopped(named.category, item?.date)) item.category = named.category;

    const itemId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = `overhead:${userId}:${itemId}`;

    const storeId = authResult.user.user_metadata?.storeId;
    const designation = authResult.user.user_metadata?.designation;
    console.log(`🏪 StoreId: ${storeId || 'null'}`);

    const isProductionIncharge = designation === 'production_incharge';
    const isStoreIncharge = designation === 'store_incharge';
    // See the matching comment in the /inventory POST route above - store/production
    // incharge can explicitly log against the other entity via the client payload.
    const requestedEntityType: 'store' | 'production_house' | null =
      item.entityType === 'production_house' || item.entityType === 'store' ? item.entityType : null;
    const naturalEntityType: 'store' | 'production_house' = isProductionIncharge ? 'production_house' : 'store';
    const entityType = requestedEntityType || naturalEntityType;
    // The cluster head and operations managers belong to no single store or production house,
    // so whichever one the client names is the one the expense is for (an operations manager
    // used to be pinned to their own storeId too). Store and production incharges stay pinned.
    const pinnedToOwnSide = role !== 'cluster_head' && (isStoreIncharge || isProductionIncharge);
    const resolvedProductionHouseId = entityType === 'production_house'
      ? (pinnedToOwnSide && entityType === naturalEntityType ? (storeId || null) : (item.productionHouseId || null))
      : null;
    const resolvedStoreId = entityType === 'store'
      ? (pinnedToOwnSide && entityType === naturalEntityType ? (storeId || null) : (item.storeId || null))
      : null;
    if (!pinnedToOwnSide && !resolvedStoreId && !resolvedProductionHouseId) {
      return c.json({ error: 'Pick the store or production house this expense is for' }, 400);
    }

    const overheadItem = {
      ...item,
      id: itemId,
      userId,
      storeId: resolvedStoreId,
      entityType,
      productionHouseId: resolvedProductionHouseId,
      paidFromProductionHouseId: resolvePaidFromProductionHouseId({ ...item, entityType }, role, null),
    };

    console.log('💾 Saving expense/overhead item to KV store:', key);
    await kvWithRetry.set(key, overheadItem);
    console.log('✅ Expense/Overhead item saved successfully');

    await cascadeProductionCashForExpense(overheadItem);
    if (overheadItem.paidFromProductionHouseId) {
      await afterResponse('Store bill notification', () => notifyStoreBillPaidFromProductionCash(overheadItem, authResult.user.user_metadata?.name || authResult.user.email));
    }
    await afterResponse('Expense review', () => reviewExpense(expenseReviewDeps, 'overhead', key, overheadItem, authResult.user.user_metadata?.name || authResult.user.email, role));
    if (!named.typedAs) await afterResponse('Item name check', () => reviewNewName(nameReviewDeps, { key, type: 'overhead', row: overheadItem, by: authResult.user.user_metadata?.name || authResult.user.email, byOwner: role === 'cluster_head' }));

    return c.json({ success: true, item: overheadItem });
  } catch (error) {
    console.log('❌ Error adding overhead item:', error);
    console.log('Error details:', error instanceof Error ? error.message : String(error));
    console.log('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return c.json({ error: 'Failed to add overhead item' }, 500);
  }
});

// Update overhead item
app.put('/make-server-c2dd9b9d/overheads/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (!canWriteExpenses(authResult.user)) {
      return c.json({ error: 'Only managers and cluster heads can update overhead items' }, 403);
    }

    const itemId = c.req.param('id');
    // Update the record where it already lives (under whoever created it). Writing under the
    // editor's own id used to leave the original in place and add a second copy whenever
    // someone edited another person's entry (a 22 Jan 2026 gas bill exists twice this way).
    // Paginated, like GET /overheads: the plain prefix read stops at 1000 rows.
    const existing = await findByIdInPrefix('overhead:', itemId);
    // An edit of an entry deleted meanwhile (another phone, an open form) used to write it back.
    if (!existing) {
      return c.json({ error: 'Overhead item not found - it may have been deleted' }, 404);
    }
    const ownerId = existing.userId || userId;
    const key = `overhead:${ownerId}:${itemId}`;
    const updates = await c.req.json();
    if (updates?.category === 'fuel' && role !== 'cluster_head') {
      return c.json({ error: 'Fuel cost entries need cluster head permission.' }, 403);
    }
    if (mealsStopped(updates?.category ?? existing.category, updates?.date ?? existing.date) && !mealsStopped(existing.category, existing.date)) {
      return c.json({ error: MEALS_STOPPED_TEXT }, 400);
    }
    if ((updates?.category === 'losses_writeoffs' || updates?.category === 'ai_credits') && role !== 'cluster_head') {
      return c.json({ error: 'Only the cluster head can write off a loss.' }, 403);
    }
    
    const overheadItem = keepExpenseAuthor(existing, {
      ...updates,
      id: itemId,
      userId: ownerId
    });
    overheadItem.paidFromProductionHouseId = resolvePaidFromProductionHouseId(overheadItem, role, existing);

    await kvWithRetry.set(key, overheadItem);
    console.log('✅ Expense/Overhead item updated successfully:', key);

    await cascadeProductionCashForExpense(existing, overheadItem);
    if (overheadItem.paidFromProductionHouseId && overheadItem.paidFromProductionHouseId !== existing?.paidFromProductionHouseId) {
      await afterResponse('Store bill notification', () => notifyStoreBillPaidFromProductionCash(overheadItem, authResult.user.user_metadata?.name || authResult.user.email));
    }

    return c.json({ success: true, item: overheadItem });
  } catch (error) {
    console.log('Error updating overhead item:', error);
    return c.json({ error: 'Failed to update overhead item' }, 500);
  }
});

// Delete overhead item
app.delete('/make-server-c2dd9b9d/overheads/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (!canWriteExpenses(authResult.user)) {
      return c.json({ error: 'Only managers and cluster heads can delete overhead items' }, 403);
    }

    const itemId = c.req.param('id');
    
    // Find the overhead item by searching all overhead items with this ID
    const targetOverhead = await findByIdInPrefix('overhead:', itemId);
    
    if (!targetOverhead) {
      console.log(`⚠️ Overhead item not found: ${itemId}. It may have been already deleted.`);
      // Return success even if not found - idempotent delete
      return c.json({ success: true, message: 'Item already deleted or does not exist' });
    }
    
    // Construct the key using the original creator's userId
    const key = `overhead:${targetOverhead.userId}:${itemId}`;
    console.log(`🗑️ Deleting overhead item: ${key}`);

    await kvWithRetry.del(key);
    await cascadeProductionCashForExpense(targetOverhead);
    await afterResponse('Expense checks', () => closeFlagsOf(expenseReviewDeps, itemId, authResult.user.user_metadata?.name || authResult.user.email || 'Someone'));

    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting overhead item:', error);
    return c.json({ error: 'Failed to delete overhead item' }, 500);
  }
});

// ========================================
// FIXED COST ROUTES
// ========================================

// Get all fixed costs for user
app.get('/make-server-c2dd9b9d/fixed-costs', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    // All users (cluster heads, employees, and managers) see all fixed costs
    // Filtering by storeId happens in the frontend
    const items = await getAllByPrefixWithRetry('fixedcost:', windowed.range);
    
    return c.json({ fixedCosts: items || [] });
  } catch (error) {
    console.log('Error fetching fixed costs:', error);
    return c.json({ error: 'Failed to fetch fixed costs' }, 500);
  }
});

// Add fixed cost item
app.post('/make-server-c2dd9b9d/fixed-costs', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;
    const storeId = authResult.user.user_metadata?.storeId;
    const designation = authResult.user.user_metadata?.designation;

    if (!canWriteExpenses(authResult.user)) {
      return c.json({ error: 'Only managers and cluster heads can add fixed costs' }, 403);
    }

    const body = await c.req.json();
    const id = crypto.randomUUID();
    const key = `fixedcost:${userId}:${id}`;

    const isProductionIncharge = designation === 'production_incharge';
    const isStoreIncharge = designation === 'store_incharge';
    // See the matching comment in the /inventory POST route above - store/production
    // incharge can explicitly log against the other entity via the client payload.
    const requestedEntityType: 'store' | 'production_house' | null =
      body.entityType === 'production_house' || body.entityType === 'store' ? body.entityType : null;
    const naturalEntityType: 'store' | 'production_house' = isProductionIncharge ? 'production_house' : 'store';
    const entityType = requestedEntityType || naturalEntityType;
    // The cluster head and operations managers belong to no single store or production house,
    // so whichever one the client names is the one the expense is for (an operations manager
    // used to be pinned to their own storeId too). Store and production incharges stay pinned.
    const pinnedToOwnSide = role !== 'cluster_head' && (isStoreIncharge || isProductionIncharge);
    const resolvedProductionHouseId = entityType === 'production_house'
      ? (pinnedToOwnSide && entityType === naturalEntityType ? (storeId || null) : (body.productionHouseId || null))
      : null;
    const resolvedStoreId = entityType === 'store'
      ? (pinnedToOwnSide && entityType === naturalEntityType ? (storeId || null) : (body.storeId || null))
      : null;
    if (!pinnedToOwnSide && !resolvedStoreId && !resolvedProductionHouseId) {
      return c.json({ error: 'Pick the store or production house this expense is for' }, 400);
    }

    const fixedCostItem = {
      ...body,
      id,
      userId,
      storeId: resolvedStoreId,
      entityType,
      productionHouseId: resolvedProductionHouseId,
      paidFromProductionHouseId: resolvePaidFromProductionHouseId({ ...body, entityType }, role, null),
    };

    await kvWithRetry.set(key, fixedCostItem);
    console.log('✅ Fixed Cost item saved successfully:', key);

    await cascadeProductionCashForExpense(fixedCostItem);
    if (fixedCostItem.paidFromProductionHouseId) {
      await afterResponse('Store bill notification', () => notifyStoreBillPaidFromProductionCash(fixedCostItem, authResult.user.user_metadata?.name || authResult.user.email));
    }

    return c.json({ success: true, item: fixedCostItem });
  } catch (error) {
    console.log('Error adding fixed cost item:', error);
    return c.json({ error: 'Failed to add fixed cost item' }, 500);
  }
});

// Update fixed cost item
app.put('/make-server-c2dd9b9d/fixed-costs/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (!canWriteExpenses(authResult.user)) {
      return c.json({ error: 'Only managers and cluster heads can update fixed costs' }, 403);
    }

    const itemId = c.req.param('id');
    // Update the record where it already lives (under whoever created it). Writing under the
    // editor's own id used to leave the original in place and add a second copy whenever
    // someone edited another person's entry (a 22 Jan 2026 gas bill exists twice this way).
    // Paginated: the plain prefix read stops at 1000 rows.
    const existing = await findByIdInPrefix('fixedcost:', itemId);
    // An edit of an entry deleted meanwhile (another phone, an open form) used to write it back.
    if (!existing) {
      return c.json({ error: 'Fixed cost not found - it may have been deleted' }, 404);
    }
    const ownerId = existing.userId || userId;
    const key = `fixedcost:${ownerId}:${itemId}`;
    const updates = await c.req.json();

    const fixedCostItem = keepExpenseAuthor(existing, {
      ...updates,
      id: itemId,
      userId: ownerId
    });
    fixedCostItem.paidFromProductionHouseId = resolvePaidFromProductionHouseId(fixedCostItem, role, existing);

    await kvWithRetry.set(key, fixedCostItem);
    console.log('✅ Fixed Cost item updated successfully:', key);

    await cascadeProductionCashForExpense(existing, fixedCostItem);
    if (fixedCostItem.paidFromProductionHouseId && fixedCostItem.paidFromProductionHouseId !== existing?.paidFromProductionHouseId) {
      await afterResponse('Store bill notification', () => notifyStoreBillPaidFromProductionCash(fixedCostItem, authResult.user.user_metadata?.name || authResult.user.email));
    }

    return c.json({ success: true, item: fixedCostItem });
  } catch (error) {
    console.log('Error updating fixed cost item:', error);
    return c.json({ error: 'Failed to update fixed cost item' }, 500);
  }
});

// Delete fixed cost item
app.delete('/make-server-c2dd9b9d/fixed-costs/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const role = authResult.user.user_metadata?.role;

    if (!canWriteExpenses(authResult.user)) {
      return c.json({ error: 'Only managers and cluster heads can delete fixed costs' }, 403);
    }

    const itemId = c.req.param('id');
    
    // Find the fixed cost item by searching all fixed cost items with this ID
    const targetFixedCost = await findByIdInPrefix('fixedcost:', itemId);
    
    if (!targetFixedCost) {
      console.log(`⚠️ Fixed cost item not found: ${itemId}. It may have been already deleted.`);
      // Return success even if not found - idempotent delete
      return c.json({ success: true, message: 'Item already deleted or does not exist' });
    }
    
    // Construct the key using the original creator's userId
    const key = `fixedcost:${targetFixedCost.userId}:${itemId}`;
    console.log(`🗑️ Deleting fixed cost item: ${key}`);

    await kvWithRetry.del(key);
    await cascadeProductionCashForExpense(targetFixedCost);

    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting fixed cost item:', error);
    return c.json({ error: 'Failed to delete fixed cost item' }, 500);
  }
});

// Get all sales data for user
app.get('/make-server-c2dd9b9d/sales', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    // Get all sales data (not scoped by userId since everyone needs to see all sales)
    // Use paginated query to avoid Supabase's default 1000-row limit
    const items = await getAllByPrefixWithRetry('sales:', windowed.range);
    // Event stalls on the store's Paytm, and cash moved between a stall and its store, show on
    // the store's own row for the day (eventPaytmIn / eventCashIn / eventCashOut - events.ts).
    await attachEventRollups(items || [], { kv: kvWithRetry, getAllByPrefix: getAllByPrefixWithRetry }).catch((error) => console.log('Event rollups skipped:', error?.message || error));
    
    return c.json({ sales: items || [] });
  } catch (error: any) {
    console.log('Error fetching sales data:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ sales: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch sales data' }, 500);
  }
});

// Add sales data
// When a person first saved a day's sales (the "Sales saved on time" KPI); later edits keep it.
// A day a person saved before this was stamped keeps the last save time the record shows.
function firstSavedAtOf(existing: any): string {
  if (existing?.firstSavedAt) return existing.firstSavedAt;
  const byPerson = !!existing && (!!existing.updatedBy || !['', 'pos-sync', 'cash-topup-approval'].includes(String(existing.createdBy || '')));
  return (byPerson && (existing.updatedAt || (!existing.approvalRequired && existing.approvedAt))) || new Date().toISOString();
}

app.post('/make-server-c2dd9b9d/sales', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    console.log('Sales add - Auth error:', authResult.error);
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const userEmail = authResult.user.email;
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;

    // Check if role exists at all
    if (!role) {
      console.log('ERROR: No role found in user metadata. User needs to be assigned a role.');
      return c.json({ error: 'User role not configured. Please contact administrator.' }, 403);
    }

    // Store incharge logs/validates the day's sales (POS-reported once live) against
    // the cash they counted - operations manager gets a read-only monitoring view.
    const isManager = role === 'manager';
    const isStoreIncharge = designation === 'store_incharge';

    if (!isManager || !isStoreIncharge) {
      console.log('ERROR: User is not authorized. Current role:', role, 'Designation:', designation);
      return c.json({
        error: `Only store incharges can add sales data. Your current role: ${role}`,
        debug: {
          currentRole: role,
          currentDesignation: designation,
          requiredRole: 'store incharge'
        }
      }, 403);
    }

    console.log('SUCCESS: Role check passed. Adding sales data...');

    const item = await c.req.json();
    const storeId = authResult.user.user_metadata?.storeId;
    const userName = authResult.user.user_metadata?.name;
    const employeeId = authResult.user.user_metadata?.employeeId; // Employee ID like BM001

    // Saves onto the day's existing row when there is one, never beside it. The form only
    // POSTs when it hadn't seen a row for this store+date, but the 10:30 PM POS sync (or a
    // top-up approval) can create one in between - this used to add a second row, and the
    // day then existed twice and every total for it doubled.
    const existingSale = storeId && item.date
      ? (await getAllByPrefixWithRetry('sales:')).find((s: any) => s.storeId === storeId && s.date === item.date)
      : null;
    const itemId = existingSale?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const ownerUserId = existingSale?.userId || userId;
    const key = `sales:${ownerUserId}:${itemId}`;

    const salesItem: any = {
      ...(existingSale || {}),
      ...item,
      id: itemId,
      userId: ownerUserId,
      storeId: storeId || null,
      approvalRequired: true,
      createdBy: employeeId || userId, // Use employeeId if available, fallback to userId
      createdByName: userName,
      createdByEmail: userEmail,
      // Marks the day as saved by a person rather than a POS-sync/top-up placeholder (see
      // isPlaceholderSale in paytmRules.ts).
      updatedBy: employeeId || userId,
      updatedAt: new Date().toISOString(),
      firstSavedAt: firstSavedAtOf(existingSale),
      // Same reasoning as PUT /sales/:id below: usedOnlineMoney only ever moves via the
      // cash-topup-approval route, never a general sales save - a new row starts at 0 and an
      // existing one keeps whatever approved top-ups already credited it.
      usedOnlineMoney: existingSale?.usedOnlineMoney || 0
    };
    if (existingSale) {
      // The form's POS-synced totals were blanks (it hadn't seen this row) - keep the synced ones.
      for (const field of ['offlineSales', 'posOnlineSales', 'posOfflineSales']) {
        if (!item[field] && existingSale[field]) salesItem[field] = existingSale[field];
      }
    }

    await kvWithRetry.set(key, salesItem);
    console.log(`✅ Sales data ${existingSale ? 'saved onto the existing row' : 'saved'}:`, itemId);

    // CONFIRMED ROOT CAUSE (found 2026-08-30, the 3rd incident from this same underlying
    // gap): this route saves whatever actualPaytmBalance the CLIENT computed, with nothing
    // server-side re-deriving it afterward - every other Paytm-affecting write (settlement
    // upload/delete, top-up approval, recalibration save) already triggers this cascade, but
    // a manual sales entry save never did. If the store incharge's local data was even
    // slightly stale (a topup approved seconds earlier they haven't refreshed to see, a
    // settlement uploaded moments before), their save would silently persist a wrong number
    // that nothing would catch until some unrelated later trigger happened to sweep through
    // this date. Running it here makes the server's own cascade the final word on every
    // save, regardless of what the client's snapshot looked like at compute time.
    if (storeId && salesItem.date) {
      await cascadeRecomputePaytmBalances(storeId, salesItem.date);
      await cascadeProductionCashForStoreSale(storeId, salesItem.date);
    }

    // Notify cluster heads and this store's operations manager(s) about the sales entry
    // (after the response - see afterResponse).
    const managerName = authResult.user.user_metadata?.name || authResult.user.email;
    await afterResponse('Sales notifications', async () => {
      const clusterHeads = await getAllClusterHeads();
      const opsManagers = await getOperationsManagers(storeId);
      for (const recipient of [...clusterHeads, ...opsManagers]) {
        if (recipient.authUserId) {
          await notifyUser(
            recipient.authUserId,
            'sales_logged',
            'Sales Data Logged',
            `${managerName} logged sales data for ${item.date}`,
            itemId,
            item.date
          );
        }
      }
    });

    // The cascade above has just rewritten this row's actualPaytmBalance - hand back that
    // version, not the one from before it ran.
    const savedItem = (await kvWithRetry.get(key)) || salesItem;
    return c.json({ success: true, item: savedItem });
  } catch (error) {
    console.log('EXCEPTION in add sales:', error);
    return c.json({ error: 'Failed to add sales data' }, 500);
  }
});

// Update sales data
app.put('/make-server-c2dd9b9d/sales/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;

    // Store incharge owns sales entry, POS validation, and cash reconciliation as a
    // single workflow now - enforced here, not just in the UI. Either login type (owner, 27 Oct 2026).
    const isManager = role === 'manager';
    const isStoreIncharge = designation === 'store_incharge';

    if (!isStoreIncharge) {
      return c.json({ error: 'Only store incharges can update sales data' }, 403);
    }

    const itemId = c.req.param('id');
    const updates = await c.req.json();

    // Find the sales item with this ID (look through all users' sales)
    const existingSale = await findByIdInPrefix('sales:', itemId);

    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }

    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;
    const editorId = authResult.user.user_metadata?.employeeId || authResult.user.id;

    const salesItem = {
      ...existingSale,
      ...updates,
      id: itemId,
      userId: existingSale.userId,
      // Marks the day as saved by a person rather than a POS-sync/top-up placeholder (see
      // isPlaceholderSale in paytmRules.ts).
      updatedBy: editorId,
      updatedAt: new Date().toISOString(),
      firstSavedAt: firstSavedAtOf(existingSale),
      // CONFIRMED ROOT CAUSE (found 2026-10-16, real case: a ₹540 approved store_inventory
      // cash top-up for Rohan/Bunny Momos 1 on 2026-10-12 showed as ₹0 in the Store Cash in
      // Hand breakdown): usedOnlineMoney is a running ledger only ever meant to move via the
      // cash-topup-approval route (above) - never via this general sales-data save. The
      // store incharge's form loads it once when the page opens and echoes that same value
      // back on every save; if a top-up gets approved *after* the page loaded but *before*
      // the store incharge clicks Save - entirely plausible, since a save often happens late
      // at night after the till is counted - this stale echo silently overwrote the
      // just-approved credit with the old number. Always keep the server's own value; a
      // client-submitted usedOnlineMoney is never trusted here, exactly like
      // actualPaytmBalance is server-derived rather than client-trusted for the same reason.
      usedOnlineMoney: existingSale.usedOnlineMoney || 0
    };

    await kvWithRetry.set(key, salesItem);
    console.log('✅ Sales data updated successfully:', key);

    // CONFIRMED ROOT CAUSE (found 2026-08-30): this is the actually-common save path (pos-
    // sync creates the day's placeholder, the store incharge edits/confirms it here) and it
    // saved whatever actualPaytmBalance the CLIENT computed with nothing server-side ever
    // re-deriving it - the one gap in an otherwise-complete web of cascade triggers
    // (settlement upload/delete, top-up approval, recalibration save all already call this).
    // A topup approved between page-load and save, or any other Paytm-affecting event the
    // incharge's local snapshot hadn't refreshed to see yet, would silently persist a wrong
    // number that stayed wrong until some unrelated later trigger happened to sweep through
    // this date - exactly what happened on 2026-08-29. Running it here makes the server's
    // own cascade the final word on every save, regardless of the client's snapshot.
    if (salesItem.storeId && salesItem.date) {
      await cascadeRecomputePaytmBalances(salesItem.storeId, salesItem.date);
      await cascadeProductionCashForStoreSale(salesItem.storeId, salesItem.date);
    }

    // Notify this store's operations manager(s) that the store incharge logged/confirmed
    // today's sales - the common path now that pos-sync creates the day's record first and
    // the store incharge edits/confirms it via this route, not the POST route above.
    // After the response (afterResponse), which also logs any failure.
    const managerName = authResult.user.user_metadata?.name || authResult.user.email;
    await afterResponse('Notifying operations manager of sales update', async () => {
      const opsManagers = await getOperationsManagers(salesItem.storeId);
      for (const opsManager of opsManagers) {
        if (opsManager.authUserId) {
          await notifyUser(
            opsManager.authUserId,
            'sales_logged',
            'Sales Data Logged',
            `${managerName} logged sales data for ${salesItem.date}`,
            itemId,
            salesItem.date
          );
        }
      }
    });

    // The cascade above has just rewritten this row's actualPaytmBalance - hand back that
    // version, not the one from before it ran (the form would otherwise show a stale balance).
    const savedItem = (await kvWithRetry.get(key)) || salesItem;
    return c.json({ success: true, item: savedItem });
  } catch (error) {
    console.log('Error updating sales data:', error);
    return c.json({ error: 'Failed to update sales data' }, 500);
  }
});

// Migrate sales discrepancy values (cluster head only)
app.post('/make-server-c2dd9b9d/sales/migrate-discrepancy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    // Only cluster heads can run migration
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can run migration' }, 403);
    }

    // Get all sales data
    const allSales = await getAllByPrefixWithRetry('sales:');
    
    let updated = 0;
    const salesToUpdate = allSales.filter((sale: any) => sale.salesDiscrepancy === undefined);
    
    // Update each sale to set salesDiscrepancy = cashOffset
    for (const sale of salesToUpdate) {
      const key = `sales:${sale.userId}:${sale.id}`;
      const updatedSale = {
        ...sale,
        salesDiscrepancy: sale.cashOffset || 0
      };
      await kv.set(key, updatedSale);
      updated++;
    }
    
    return c.json({ 
      success: true, 
      updated,
      total: allSales.length,
      message: `Updated ${updated} sales records with locked discrepancy values`
    });
  } catch (error) {
    console.log('Error migrating sales discrepancy:', error);
    return c.json({ error: 'Failed to migrate sales data' }, 500);
  }
});


// Request approval for high discrepancy (manager)
app.post('/make-server-c2dd9b9d/sales/:id/request-approval', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;

    // Allow managers and store incharge to request approval
    const isManager = role === 'manager';
    const isStoreIncharge = role === 'employee' && designation === 'store_incharge';
    
    if (!isManager && !isStoreIncharge) {
      return c.json({ error: 'Only managers and store incharge can request approval' }, 403);
    }

    const itemId = c.req.param('id');
    const { requestedCashInHand, requestedOffset } = await c.req.json();
    
    // Find the sales item with this ID
    const existingSale = await findByIdInPrefix('sales:', itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;

    const updatedItem = {
      ...existingSale,
      approvalRequested: true,
      approvalRequestedAt: new Date().toISOString(),
      requestedCashInHand,
      requestedOffset,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null
    };

    await kv.set(key, updatedItem);
    
    // Create notifications for all cluster heads (after the response - see afterResponse)
    const managerName = authResult.user.user_metadata?.name || authResult.user.email;
    await afterResponse('Discrepancy request notifications', async () => {
      const clusterHeads = await getAllClusterHeads();
      for (const clusterHead of clusterHeads) {
        if (clusterHead.authUserId) {
          await notifyUser(
            clusterHead.authUserId,
            'discrepancy_request',
            'Cash Discrepancy Approval Needed',
            `${managerName} requests approval for ₹${Math.abs(requestedOffset).toFixed(2)} discrepancy on ${existingSale.date}`,
            itemId,
            existingSale.date
          );
        }
      }
    });

    return c.json({ success: true, item: updatedItem });
  } catch (error) {
    console.log('Error requesting approval:', error);
    return c.json({ error: 'Failed to request approval' }, 500);
  }
});

// Approve discrepancy request (cluster head only)
app.post('/make-server-c2dd9b9d/sales/:id/approve-discrepancy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can approve discrepancies' }, 403);
    }

    const itemId = c.req.param('id');
    
    // Find the sales item with this ID
    const existingSale = await findByIdInPrefix('sales:', itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    if (!existingSale.approvalRequested) {
      return c.json({ error: 'No approval request found' }, 400);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;

    // Approve: Update actual cash to the requested amount
    const approvedItem = {
      ...existingSale,
      actualCashInHand: existingSale.requestedCashInHand,
      cashOffset: existingSale.requestedOffset,
      salesDiscrepancy: existingSale.requestedOffset, // CRITICAL: Lock the discrepancy value at approval time
      approvalRequired: false,
      approvalStatus: 'approved', // Explicitly set approval status
      approvedBy: authResult.user.email,
      approvedAt: getNowIST(),
      approvalRequested: false,
      requestedCashInHand: null,
      requestedOffset: null
    };

    await kv.set(key, approvedItem);
    
    // Notify the manager who submitted the sale (after the response - see afterResponse)
    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    await afterResponse('Discrepancy approved notification', () => notifyUser(
      existingSale.userId,
      'discrepancy_approved',
      'Discrepancy Approved ✓',
      `${clusterHeadName} approved your cash discrepancy of ₹${Math.abs(existingSale.requestedOffset).toFixed(2)} for ${existingSale.date}`,
      itemId,
      existingSale.date
    ));
    
    return c.json({ success: true, item: approvedItem });
  } catch (error) {
    console.log('Error approving discrepancy:', error);
    return c.json({ error: 'Failed to approve discrepancy' }, 500);
  }
});

// Reject discrepancy request (cluster head only)
app.post('/make-server-c2dd9b9d/sales/:id/reject-discrepancy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can reject discrepancies' }, 403);
    }

    const itemId = c.req.param('id');
    const { reason } = await c.req.json();
    
    // Find the sales item with this ID
    const existingSale = await findByIdInPrefix('sales:', itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    if (!existingSale.approvalRequested) {
      return c.json({ error: 'No approval request found' }, 400);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;

    // Reject: Keep the old amount, mark as rejected
    const rejectedItem = {
      ...existingSale,
      approvalRequested: false,
      rejectedBy: authResult.user.email,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
      requestedCashInHand: null,
      requestedOffset: null
    };

    await kv.set(key, rejectedItem);
    
    // Notify the manager who submitted the sale (after the response - see afterResponse)
    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    await afterResponse('Discrepancy rejected notification', () => notifyUser(
      existingSale.userId,
      'discrepancy_rejected',
      'Discrepancy Rejected ✗',
      `${clusterHeadName} rejected your cash discrepancy request for ${existingSale.date}. Reason: ${reason}. You must pay the difference.`,
      itemId,
      existingSale.date
    ));
    
    return c.json({ success: true, item: rejectedItem });
  } catch (error) {
    console.log('Error rejecting discrepancy:', error);
    return c.json({ error: 'Failed to reject discrepancy' }, 500);
  }
});

// Approve sales data (cluster head and operations manager)
app.post('/make-server-c2dd9b9d/sales/:id/approve', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;

    // Allow cluster heads and operations managers (managers who are NOT store/production incharge)
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (role !== 'cluster_head' && !isOperationsManager) {
      return c.json({ error: 'Only cluster heads and operations managers can approve sales data' }, 403);
    }

    const itemId = c.req.param('id');
    
    // Find the sales item with this ID (look through all users' sales)
    const existingSale = await findByIdInPrefix('sales:', itemId);
    
    if (!existingSale) {
      return c.json({ error: 'Sales data not found' }, 404);
    }
    
    // Use the key from the existing sale
    const key = `sales:${existingSale.userId}:${itemId}`;

    const approvedItem = {
      ...existingSale,
      approvalRequired: false,
      approvalStatus: 'approved', // Explicitly set approval status
      approvedBy: authResult.user.email,
      approvedAt: getNowIST()
    };

    await kv.set(key, approvedItem);
    
    return c.json({ success: true, item: approvedItem });
  } catch (error) {
    console.log('Error approving sales data:', error);
    return c.json({ error: 'Failed to approve sales data' }, 500);
  }
});

// ===== CASH TOP-UP REQUESTS =====
// Ops Manager -> Cluster Head: when the offline till is running low (after that day's
// store inventory spend), the ops manager asks for more physical cash. On approval, the
// amount is credited to Offline Cash in Hand and debited from Online Cash in Hand by
// bumping that day's sales record's usedOnlineMoney - the same lever the cash math in
// SalesManagement.tsx already uses (see expectedCashInHand / calculatePaytmBalance there).
// Kept as its own flow, separate from the cash-discrepancy escalation above.

// Get all cash top-up requests
app.get('/make-server-c2dd9b9d/cash-topup-requests', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const requests = await getAllByPrefixWithRetry('cash-topup:');
    return c.json({ requests: requests || [] });
  } catch (error: any) {
    console.log('Error fetching cash top-up requests:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ requests: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch cash top-up requests' }, 500);
  }
});

// Create a cash top-up request (store/production incharge, operations manager, or a cluster
// head - whose own request is approved on the spot, since cluster heads are the approvers)
app.post('/make-server-c2dd9b9d/cash-topup-requests', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isStoreIncharge = designation === 'store_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    const isClusterHead = role === 'cluster_head';

    // An event stall asking for cash (events.ts): the event incharge or a manager asks; the
    // approver later picks whether the store's Paytm or the production house's cash pays.
    const peek = await c.req.json().catch(() => ({}));
    if (peek?.reason === 'event_cash') {
      const built = await buildEventTopupRequest(eventsDeps, authResult.user, peek);
      if (built.error) return c.json({ error: built.error }, (built.status || 400) as any);
      await kvWithRetry.set(`cash-topup:${built.record.id}`, built.record);
      const approvers = [...(await getAllClusterHeads()), ...(await getOperationsManagers())];
      const seen = new Set<string>();
      for (const person of approvers) {
        if (!person.authUserId || seen.has(person.authUserId)) continue;
        seen.add(person.authUserId);
        await notifyUser(person.authUserId, 'cash_topup_request', 'Event cash requested',
          `${built.record.requestedByName} (${built.event.name}) asked for ₹${built.record.requestedAmount.toFixed(2)} event cash for ${built.record.date}${built.record.note ? ` - ${built.record.note}` : ''}.`,
          built.record.id, built.record.date);
      }
      return c.json({ success: true, request: built.record });
    }

    if (!isOperationsManager && !isStoreIncharge && !isProductionIncharge && !isClusterHead) {
      return c.json({ error: 'Only store incharges, operations managers, production incharges and cluster heads can request a cash top-up' }, 403);
    }

    const { date, requestedAmount, reason, targetStoreId, targetProductionHouseId } = await c.req.json();
    const REASON_OPTIONS = ['store_inventory', 'production_inventory', 'other'];
    if (!date || !requestedAmount || requestedAmount <= 0 || !REASON_OPTIONS.includes(reason)) {
      return c.json({ error: 'Invalid cash top-up request data' }, 400);
    }

    // Store incharge/ops manager credit their own store's cash - UNLESS reason is
    // 'production_inventory', in which case the money is destined for the production
    // house's own cash ledger (see /production-cash above), not the store's. A production
    // incharge has no cash-in-hand ledger of their own for anything OTHER than production
    // spend - they must pick which store's till gets credited for non-production reasons.
    let storeId: string;
    let requestedByEntityType: 'store' | 'production_house';
    let requestedByEntityName: string;
    // Resolved below whenever reason === 'production_inventory' (from either branch) -
    // this is what /production-cash's cashTopupCredited sum matches against once approved.
    let resolvedProductionHouseId: string | undefined;

    if (isClusterHead) {
      // The cluster head names where the cash goes: a store's till, or a production house's
      // cash (which drains the Paytm of the store that production house supplies).
      const allStores = await kv.getByPrefix('store:');
      if (reason === 'production_inventory') {
        const productionHouseId = targetProductionHouseId || allStores.find((s: any) => s.id === targetStoreId)?.productionHouseId;
        const linkedStore = productionHouseId ? allStores.find((s: any) => s.productionHouseId === productionHouseId) : null;
        if (!productionHouseId || !linkedStore) {
          return c.json({ error: 'Pick the production house to give the cash to' }, 400);
        }
        const productionHouse = await kv.get(`production_house_${productionHouseId}`);
        storeId = linkedStore.id;
        requestedByEntityType = 'production_house';
        requestedByEntityName = productionHouse?.name || 'Production House';
        resolvedProductionHouseId = productionHouseId;
      } else {
        const store = allStores.find((s: any) => s.id === targetStoreId);
        if (!store) {
          return c.json({ error: 'Pick the store to give the cash to' }, 400);
        }
        storeId = store.id;
        requestedByEntityType = 'store';
        requestedByEntityName = store.name || 'Store';
      }
    } else if (isProductionIncharge) {
      if (!targetStoreId) {
        return c.json({ error: 'Production incharges must select which store to credit' }, 400);
      }
      // Prefer the explicit assignedProductionHouseIds mapping on the employee record
      // (the real fix - unambiguous, supports more than one production house) over the
      // legacy guess below. Only fall back to guessing from user_metadata.storeId for
      // employees not yet migrated to the new field.
      const employeeId = authResult.user.user_metadata?.employeeId;
      const employeeRecord = employeeId ? await kv.get(`unified-employee:${employeeId}`) : null;
      const assignedProductionHouseIds: string[] = employeeRecord?.assignedProductionHouseIds || [];

      // A production incharge's user_metadata.storeId doesn't reliably hold the
      // production house's own UUID - in practice it's often set to the STORE- id of
      // the store their production house supplies (matching how ProductionRequests.tsx
      // resolves this same ambiguity). Try it directly as a production house UUID first;
      // if that record doesn't exist, resolve it via that store's own productionHouseId.
      const rawProductionHouseRef = authResult.user.user_metadata?.storeId;
      const allStores = await kv.getByPrefix('store:');
      let productionHouseId: string | undefined = assignedProductionHouseIds[0] || rawProductionHouseRef;
      const directProductionHouse = productionHouseId ? await kv.get(`production_house_${productionHouseId}`) : null;
      if (!directProductionHouse && rawProductionHouseRef && assignedProductionHouseIds.length === 0) {
        const linkedStore = allStores.find((s: any) => s.id === rawProductionHouseRef);
        productionHouseId = linkedStore?.productionHouseId || rawProductionHouseRef;
      }
      const targetStore = allStores.find((s: any) => s.id === targetStoreId);
      if (!targetStore || targetStore.productionHouseId !== productionHouseId) {
        return c.json({ error: 'Selected store is not supplied by your production house' }, 400);
      }
      storeId = targetStoreId;
      const productionHouse = directProductionHouse || await kv.get(`production_house_${productionHouseId}`);
      requestedByEntityType = 'production_house';
      requestedByEntityName = productionHouse?.name || 'Production House';
      resolvedProductionHouseId = productionHouseId;
    } else {
      storeId = authResult.user.user_metadata?.storeId;
      if (!storeId) {
        return c.json({ error: 'No store assigned to this account' }, 400);
      }
      const allStores = await kv.getByPrefix('store:');
      const store = allStores.find((s: any) => s.id === storeId);
      requestedByEntityType = 'store';
      requestedByEntityName = store?.name || 'Store';

      // A store incharge/ops manager topping up FOR the production house (they're
      // fronting the cash from their own store's till, per the real handover flow) - the
      // approved amount should credit the production ledger, not usedOnlineMoney on this
      // store's own sales: record.
      if (reason === 'production_inventory') {
        if (!store?.productionHouseId) {
          return c.json({ error: 'This store has no linked production house to credit' }, 400);
        }
        resolvedProductionHouseId = store.productionHouseId;
      }
    }

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = `cash-topup:${id}`;
    const requestedBy = authResult.user.user_metadata?.employeeId || authResult.user.id;
    const requestedByName = authResult.user.user_metadata?.name || authResult.user.email;

    const topupRequest = {
      id,
      storeId,
      // Set only when this top-up is destined for the production ledger (§4 of the cash
      // split plan) - undefined for ordinary store_inventory/other requests, which still
      // credit the store exactly as before.
      ...(resolvedProductionHouseId ? { productionHouseId: resolvedProductionHouseId } : {}),
      date,
      requestedAmount,
      reason,
      requestedByEntityType,
      requestedByEntityName,
      status: 'pending',
      requestedBy,
      requestedByName,
      requestedByUserId: authResult.user.id,
      requestDate: getNowIST(),
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null
    };

    await kvWithRetry.set(key, topupRequest);

    if (isClusterHead) {
      const approvedRequest = await applyCashTopupApproval(topupRequest, authResult.user.email);
      // Tell whoever holds that cash that it has been added.
      try {
        const employees = await kv.getByPrefix('unified-employee:');
        const holders = resolvedProductionHouseId
          ? employees.filter((e: any) => e.designation === 'production_incharge' && e.status !== 'inactive' && e.authUserId &&
              ((e.assignedProductionHouseIds || []).includes(resolvedProductionHouseId) || e.storeId === storeId))
          : employees.filter((e: any) => e.designation === 'store_incharge' && e.storeId === storeId && e.status !== 'inactive' && e.authUserId);
        for (const holder of holders) {
          await notifyUser(
            holder.authUserId,
            'cash_topup_approved',
            'Cash top-up added',
            `${requestedByName} added ₹${requestedAmount.toFixed(2)} to ${requestedByEntityName} cash for ${date}.`,
            id,
            date
          );
        }
      } catch (error) {
        console.error('Cluster head top-up saved but notifying failed:', error);
      }
      return c.json({ success: true, request: approvedRequest });
    }

    // Notify all cluster heads
    const clusterHeads = await getAllClusterHeads();
    for (const clusterHead of clusterHeads) {
      if (clusterHead.authUserId) {
        await notifyUser(
          clusterHead.authUserId,
          'cash_topup_request',
          'Cash Top-up Requested',
          `${requestedByName} (${requestedByEntityName}) requested ₹${requestedAmount.toFixed(2)} cash top-up for ${date} - reason: ${reason.replace('_', ' ')}`,
          id,
          date
        );
      }
    }

    return c.json({ success: true, request: topupRequest });
  } catch (error) {
    console.log('Error creating cash top-up request:', error);
    return c.json({ error: 'Failed to create cash top-up request' }, 500);
  }
});

// Scooter EMI (purchased Oct 2026) - ₹5,543 auto-debits from the bank on the 5th of every
// month, but the store's own till doesn't see that money move on its own. Rather than
// relying on someone remembering to raise a cash top-up every single month, this creates
// the request automatically on the 1st (a few days ahead of the actual debit), in Aniket
// Prasad's name, exactly like a normal manually-raised request - it still needs a cluster
// head's approval, this only saves someone having to remember to ask every month.
// Hardcoded to this one specific EMI; if the amount changes or the loan is paid off, update
// (or remove) this block and its cron (see the scooter-emi-cash-topup migration).
const SCOOTER_EMI_AMOUNT = 5543;
const SCOOTER_EMI_STORE_ID = 'STORE-1766938921191-9LCH05'; // Bunny Momos 1
const SCOOTER_EMI_REQUESTER_EMPLOYEE_ID = 'BM004'; // Aniket Prasad
// 36 EMIs, 5 Nov 2026 to 5 Oct 2029 - no request is raised after the last one.
const SCOOTER_EMI_FIRST_MONTH = '2026-11';
const SCOOTER_EMI_LAST_MONTH = '2029-10';

app.post('/make-server-c2dd9b9d/cron/scooter-emi-cash-topup', async (c) => {
  const cronSecret = c.req.header('X-Cron-Secret');
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const today = getTodayIST();
    const month = today.slice(0, 7);
    if (month < SCOOTER_EMI_FIRST_MONTH || month > SCOOTER_EMI_LAST_MONTH) {
      return c.json({ success: true, skipped: `outside the EMI period (${SCOOTER_EMI_FIRST_MONTH} to ${SCOOTER_EMI_LAST_MONTH})` });
    }

    // Guard against double-creation if the cron ever fires twice in one day (pg_cron
    // retries, a manual re-trigger while debugging, etc.) - never raise two requests for
    // the same month.
    const existing = await getAllByPrefixWithRetry('cash-topup:');
    const alreadyRaisedThisMonth = existing.some((t: any) =>
      t.storeId === SCOOTER_EMI_STORE_ID &&
      t.requestedAmount === SCOOTER_EMI_AMOUNT &&
      t.reason === 'store_inventory' &&
      typeof t.date === 'string' && t.date.slice(0, 7) === today.slice(0, 7)
    );
    if (alreadyRaisedThisMonth) {
      return c.json({ success: true, skipped: 'already raised this month' });
    }

    const requester = await kv.get(`unified-employee:${SCOOTER_EMI_REQUESTER_EMPLOYEE_ID}`);
    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === SCOOTER_EMI_STORE_ID);

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const key = `cash-topup:${id}`;
    const topupRequest = {
      id,
      storeId: SCOOTER_EMI_STORE_ID,
      date: today,
      requestedAmount: SCOOTER_EMI_AMOUNT,
      reason: 'store_inventory',
      requestedByEntityType: 'store',
      requestedByEntityName: store?.name || 'Store',
      status: 'pending',
      requestedBy: SCOOTER_EMI_REQUESTER_EMPLOYEE_ID,
      requestedByName: requester?.name || 'Aniket Prasad',
      requestedByUserId: requester?.authUserId || '',
      requestDate: getNowIST(),
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      // Not read by any existing screen - purely so this record is self-explanatory to
      // anyone looking at the raw data later, same as every other auto-generated record
      // this session has left a trail for.
      autoGeneratedNote: 'Auto-raised monthly for the scooter EMI (debits from the bank on the 5th) - see SCOOTER_EMI_AMOUNT in index.ts.'
    };

    await kvWithRetry.set(key, topupRequest);

    const clusterHeads = await getAllClusterHeads();
    for (const clusterHead of clusterHeads) {
      if (clusterHead.authUserId) {
        await notifyUser(
          clusterHead.authUserId,
          'cash_topup_request',
          'Cash Top-up Requested (Scooter EMI)',
          `${topupRequest.requestedByName} (${topupRequest.requestedByEntityName}) - auto-raised ₹${SCOOTER_EMI_AMOUNT.toFixed(2)} cash top-up for the scooter EMI, due ${today}`,
          id,
          today
        );
      }
    }

    console.log(`Scooter EMI cash top-up auto-raised: ${id}`);
    return c.json({ success: true, id });
  } catch (error: any) {
    console.log('Error auto-raising scooter EMI cash top-up:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ error: 'Database temporarily unavailable' }, 503);
    }
    return c.json({ error: 'Failed to auto-raise scooter EMI cash top-up' }, 500);
  }
});

// Approve a cash top-up request (cluster head only)
// Credits an approved top-up where it belongs (the store's day or the production cash
// ledger), marks it approved and refreshes Paytm from that date. Used by the approve route
// and when a cluster head raises a top-up, which needs no second approval.
async function applyCashTopupApproval(existingRequest: any, approvedByEmail: string) {
  // An event stall's cash (events.ts): nothing goes on a store's sales row - the event's own cash
  // ledger counts the approved request. The store's Paytm (paytmStoreId, through paytmRules.ts)
  // or the production house's cash (fundedFromProductionHouseId) pays, as the approver chose.
  if (existingRequest.reason === 'event_cash') {
    const approvedEvent = {
      ...existingRequest,
      status: 'approved',
      approvedBy: approvedByEmail,
      approvedAt: new Date().toISOString(),
      approvedAtIsUtc: true,
    };
    await kv.set(`cash-topup:${existingRequest.id}`, approvedEvent);
    if (approvedEvent.fundingSource === 'store_paytm' && approvedEvent.paytmStoreId) {
      await cascadeRecomputePaytmBalances(approvedEvent.paytmStoreId, approvedEvent.date);
    } else if (approvedEvent.fundingSource === 'production_cash' && approvedEvent.fundedFromProductionHouseId) {
      await cascadeRecomputeProductionCash(approvedEvent.fundedFromProductionHouseId, approvedEvent.date);
    }
    return approvedEvent;
  }
  const forProductionCash = existingRequest.reason === 'production_inventory' && existingRequest.productionHouseId;
  if (forProductionCash) {
    // Destined for the production cash ledger (§4 of the cash split plan), not the
    // store's usedOnlineMoney. Nothing needs to be written to production-cash directly -
    // computeProductionCashExpected sums approved production_inventory top-ups from the
    // cash-topup: records, and the cascade after the approval is saved (below) refreshes a
    // day that already has a saved count.
  } else {
    // Find that day's sales record for the store and bump usedOnlineMoney - this is the
    // exact lever expectedCashInHand/calculatePaytmBalance already use to move money
    // between the offline and online pools (see SalesManagement.tsx).
    //
    // A top-up requested in the morning (before the store incharge's end-of-day sales
    // entry exists) used to fail here with a 404 - there was nothing to credit it
    // against yet, so an approved top-up wouldn't actually show up anywhere until the
    // day's sales were logged hours later. Fixed by upserting a stub sales record (same
    // find-or-create pattern runPosSync's Step A already uses) instead of requiring one
    // to pre-exist - the store incharge's real end-of-day submission later finds this
    // same record (by storeId+date) via salesForDate and edits it in place, so the
    // top-up's usedOnlineMoney contribution is preserved, not overwritten or duplicated.
    const allSales = await getAllByPrefixWithRetry('sales:');
    const salesRecord = allSales.find((s: any) => s.storeId === existingRequest.storeId && s.date === existingRequest.date);

    if (salesRecord) {
      const salesKey = `sales:${salesRecord.userId}:${salesRecord.id}`;
      await kv.set(salesKey, {
        ...salesRecord,
        usedOnlineMoney: (salesRecord.usedOnlineMoney || 0) + existingRequest.requestedAmount
      });
    } else {
      // Placeholder below, then fall through to the cascade call after this if/else -
      // both branches need actualPaytmBalance recomputed from this date forward now that
      // usedOnlineMoney just changed on it.
      const storeIncharge = await getStoreIncharge(existingRequest.storeId);
      const ownerUserId = storeIncharge?.authUserId || existingRequest.requestedByUserId;
      // Deterministic id (same one runPosSync's new-record branch uses) instead of a random
      // one: two top-ups for the same store/date approved at nearly the same moment (found
      // 700ms apart on 2026-10-17) both ran the find above, both saw no record, and each
      // created its own stub - the day then existed twice and every total on the Sales
      // overview doubled. With one shared key a concurrent second create lands on the
      // first's record instead of becoming a sibling.
      const itemId = `pos-sync-${existingRequest.storeId}-${existingRequest.date}`;
      // This stub is meant to be found-and-edited-in-place by the real end-of-day
      // submission (pos-sync or the store incharge's manual save) later, exactly like a
      // pos-sync placeholder - give it the SAME shape/defaults a pos-sync-created record
      // gets (see the nightly sync's "new record" branch) instead of just the 5 fields it
      // strictly needs. Previously this only set id/userId/storeId/date/usedOnlineMoney
      // plus createdBy: 'cash-topup-approval' - a literal internal action name that then
      // displayed raw as "Logged by: cash-topup-approval" to anyone viewing the aggregate
      // Sales overview, and left approvalStatus/actualCashInHand/cashOffset/etc. undefined
      // forever if the nightly sync's update branch (which only overwrites POS-derived
      // fields) found this stub already existing - so a day with genuine sales data could
      // still show "Pending approval" / "Not yet reconciled" indefinitely. createdBy is
      // 'pos-sync' now so this stub is indistinguishable from - and gets properly filled in
      // by - the normal placeholder-creation path everyone else already relies on.
      await kv.set(`sales:${ownerUserId}:${itemId}`, {
        id: itemId,
        userId: ownerUserId,
        storeId: existingRequest.storeId,
        date: existingRequest.date,
        offlineSales: 0,
        onlineSales: 0,
        onlineSalesCommission: 0,
        employeeSalary: 0,
        usedOnlineMoney: existingRequest.requestedAmount,
        approvalStatus: 'pending',
        // null = nobody has counted yet. These used to be 0, which every carry-forward then
        // read as a real count (₹0 in the till, ₹0 in Paytm) - see countedCashInHand /
        // knownPaytmBalance in paytmRules.ts. The cascade below fills actualPaytmBalance in.
        actualCashInHand: null,
        cashOffset: 0,
        approvalRequired: false,
        approvedBy: null,
        approvedAt: null,
        approvalRequested: false,
        approvalRequestedAt: null,
        requestedCashInHand: null,
        requestedOffset: null,
        rejectedBy: null,
        rejectedAt: null,
        rejectionReason: null,
        actualPaytmBalance: null,
        paytmOffset: 0,
        createdBy: 'pos-sync',
        createdByName: 'Ciferon POS Auto-Sync',
      });
    }
  }

  const approvedRequest = {
    ...existingRequest,
    status: 'approved',
    approvedBy: approvedByEmail,
    // Real UTC now. This used to be getNowIST() - IST wall time with a 'Z' - and was compared
    // as a string against a recalibration's real-UTC createdAt, so a top-up approved up to
    // 5h30 before a count looked like it came after it and was taken off Paytm twice. The
    // flag tells readers which kind they have (topupApprovedAtMs in paytmRules.ts).
    approvedAt: new Date().toISOString(),
    approvedAtIsUtc: true
  };
  await kv.set(`cash-topup:${existingRequest.id}`, approvedRequest);

  // After the save: the cascade reads the request's status from the store, and run before it
  // (as it was) it still saw 'pending' and credited nothing - a day already counted kept
  // "Today's cash top-up ₹0" (27 Oct 2026, and the second top-up of 31 Aug and 6 Sep).
  if (forProductionCash) {
    await cascadeRecomputeProductionCash(existingRequest.productionHouseId, existingRequest.date);
  }

  // Refresh actualPaytmBalance from this date forward now that Paytm just moved -
  // every other Paytm-affecting write (recalibration save/edit/delete, settlement
  // upload) already triggers this; approving a top-up was the one gap, which meant the
  // stored balance only became fresh by accident whenever something else later happened
  // to sweep through this date. Must run AFTER the kv.set above so approvedAt is already
  // on the record - the cascade's late-top-up check needs it to decide whether this
  // specific top-up landed before or after that day's recalibration, if any.
  // Confirmed with the business owner: a production-reason top-up drains this SAME
  // Paytm/bank balance exactly like a store-reason one does - only the destination till
  // differs - so both reasons must refresh the cascade, not just 'store_inventory'.
  await cascadeRecomputePaytmBalances(existingRequest.storeId, existingRequest.date);
  return approvedRequest;
}

app.post('/make-server-c2dd9b9d/cash-topup-requests/:id/approve', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const requestId = c.req.param('id');
    const key = `cash-topup:${requestId}`;
    const existingRequest = await kv.get(key);
    // An event's request (events.ts) may also be approved by an operations manager, who says
    // where the money comes from (the store's Paytm or the production house's cash).
    const isEventTopup = existingRequest?.reason === 'event_cash';
    if (role !== 'cluster_head' && !(isEventTopup && isClusterHeadOrOps(authResult.user))) {
      return c.json({ error: 'Only cluster heads can approve cash top-up requests' }, 403);
    }

    if (!existingRequest) {
      return c.json({ error: 'Cash top-up request not found' }, 404);
    }
    if (existingRequest.status !== 'pending') {
      return c.json({ error: 'This request has already been resolved' }, 400);
    }

    let toApprove = existingRequest;
    if (isEventTopup) {
      const funding = eventTopupFunding(existingRequest, await c.req.json().catch(() => ({})));
      if (funding.error) return c.json({ error: funding.error, code: 'EVENT_FUNDING_REQUIRED' }, 400);
      toApprove = { ...existingRequest, ...funding };
    }

    const approvedRequest = await applyCashTopupApproval(toApprove, authResult.user.email);
    if (isEventTopup) {
      const inchargeAuthId = await eventInchargeAuthId(kvWithRetry, existingRequest.eventId);
      if (inchargeAuthId && inchargeAuthId !== existingRequest.requestedByUserId) {
        await notifyUser(inchargeAuthId, 'cash_topup_approved', 'Event cash approved',
          `₹${existingRequest.requestedAmount.toFixed(2)} added to ${existingRequest.eventName || 'the event'} cash for ${existingRequest.date}.`, requestId, existingRequest.date);
      }
    }

    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    if (existingRequest.requestedByUserId) {
      await notifyUser(
        existingRequest.requestedByUserId,
        'cash_topup_approved',
        'Cash Top-up Approved ✓',
        `${clusterHeadName} approved your ₹${existingRequest.requestedAmount.toFixed(2)} cash top-up for ${existingRequest.date}`,
        requestId,
        existingRequest.date
      );
    }

    return c.json({ success: true, request: approvedRequest });
  } catch (error) {
    console.log('Error approving cash top-up request:', error);
    return c.json({ error: 'Failed to approve cash top-up request' }, 500);
  }
});

// Reject a cash top-up request (cluster head only)
app.post('/make-server-c2dd9b9d/cash-topup-requests/:id/reject', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const requestId = c.req.param('id');
    const { reason } = await c.req.json();
    const key = `cash-topup:${requestId}`;
    const existingRequest = await kv.get(key);
    // An event's request (events.ts) may also be decided by an operations manager.
    if (role !== 'cluster_head' && !(existingRequest?.reason === 'event_cash' && isClusterHeadOrOps(authResult.user))) {
      return c.json({ error: 'Only cluster heads can reject cash top-up requests' }, 403);
    }

    if (!existingRequest) {
      return c.json({ error: 'Cash top-up request not found' }, 404);
    }
    if (existingRequest.status !== 'pending') {
      return c.json({ error: 'This request has already been resolved' }, 400);
    }

    const rejectedRequest = {
      ...existingRequest,
      status: 'rejected',
      rejectedBy: authResult.user.email,
      rejectedAt: getNowIST(),
      rejectionReason: reason || ''
    };
    await kv.set(key, rejectedRequest);

    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    if (existingRequest.requestedByUserId) {
      await notifyUser(
        existingRequest.requestedByUserId,
        'cash_topup_rejected',
        'Cash Top-up Rejected ✗',
        `${clusterHeadName} rejected your ₹${existingRequest.requestedAmount.toFixed(2)} cash top-up request for ${existingRequest.date}${reason ? `. Reason: ${reason}` : ''}`,
        requestId,
        existingRequest.date
      );
    }

    return c.json({ success: true, request: rejectedRequest });
  } catch (error) {
    console.log('Error rejecting cash top-up request:', error);
    return c.json({ error: 'Failed to reject cash top-up request' }, 500);
  }
});

// ===== PRODUCTION DATA ENDPOINTS =====

// Get all production data
app.get('/make-server-c2dd9b9d/production', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    const allProduction = await getAllByPrefixWithRetry('production:', windowed.range);
    return c.json({ production: allProduction });
  } catch (error: any) {
    console.log('Error fetching production data:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ production: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch production data' }, 500);
  }
});

// Credits a production record's finished-piece quantities into ProductionHouse.inventory.
// Moved server-side (previously only done client-side, in ProductionManagement.tsx's
// handleApprove) so it happens exactly once no matter which of the three approval paths
// fired: this route, the inline pending-approvals "Approve" button (which calls this same
// route), or the 24h auto-approve-stale cron below - confirmed bug this session, both of
// the latter two skipped crediting entirely since only the client-side path did it.
// Credits only the change since the entry was last credited (creditedPieces, per type): an
// approved entry that is edited goes back to pending, and approving it again used to add its
// whole quantity a second time. Returns the pieces now credited, to save on the record, or
// null when nothing was credited.
async function creditProductionHouseInventory(productionData: any): Promise<Record<string, number> | null> {
  try {
    let productionHouseId = productionData.productionHouseId;
    let productionHouse = productionHouseId ? await kv.get(`production_house_${productionHouseId}`) : null;

    if (!productionHouse) {
      // Fallback for older records saved before productionHouseId was reliably set -
      // match by the submitting production head instead.
      const allHouses = await kv.getByPrefix('production_house_');
      productionHouse = (allHouses || []).find((h: any) => h.productionHeadId === productionData.createdBy) || null;
      if (productionHouse) productionHouseId = productionHouse.id;
    }
    if (!productionHouse || !productionHouseId) {
      console.log('creditProductionHouseInventory: no matching production house found for', productionData.id, '- skipping credit');
      return null;
    }

    const alreadyCredited = productionData.creditedPieces || {};
    const credited = producedPiecesByType(productionData);
    const newInventory = { ...(productionHouse.inventory || {}) };
    for (const momoType of PRODUCTION_MOMO_TYPES) {
      const change = credited[momoType.inventoryKey] - (Number(alreadyCredited[momoType.inventoryKey]) || 0);
      if (change !== 0) {
        newInventory[momoType.inventoryKey] = (newInventory[momoType.inventoryKey] || 0) + change;
      }
    }

    await kv.set(`production_house_${productionHouseId}`, {
      ...productionHouse,
      inventory: newInventory,
      updatedAt: getNowIST(),
    });
    console.log(`Credited production house ${productionHouseId} inventory from production ${productionData.id}:`, newInventory);
    return credited;
  } catch (error) {
    console.log('Error crediting production house inventory:', error);
    // Non-fatal - the approval itself already succeeded; worst case inventory needs a
    // manual fix, same tradeoff every other non-fatal side effect in this file accepts.
    return null;
  }
}

// Finished pieces per type (ProductionHouse.inventory keys) on a production entry.
function producedPiecesByType(productionData: any): Record<string, number> {
  const pieces: Record<string, number> = {};
  for (const momoType of PRODUCTION_MOMO_TYPES) {
    pieces[momoType.inventoryKey] = Math.max(0, Number(productionData?.[momoType.key]?.final) || 0);
  }
  return pieces;
}

// Approves a production entry and credits the production house: the record is saved as
// approved first, then creditedPieces is saved once the credit went through, so a failed
// credit never marks pieces as credited.
async function approveProductionRecord(existing: any, approvedBy: string): Promise<any> {
  const key = `production:${existing.userId}:${existing.id}`;
  const approvedItem = { ...existing, approvalStatus: 'approved', approvedBy, approvedAt: getNowIST() };
  await kv.set(key, approvedItem);
  const credited = await creditProductionHouseInventory(approvedItem);
  if (!credited) return approvedItem;
  const creditedItem = { ...approvedItem, creditedPieces: credited };
  await kv.set(key, creditedItem);
  return creditedItem;
}

// The production house a production entry, ledger item or wastage note belongs to. The app
// sends a production incharge's storeId, and Team → Change store once set one to the store
// their kitchen supplies: two weeks of entries were filed under a house that doesn't exist.
// A store's id maps to that store's production house; anything else passes through.
async function canonicalProductionHouseId(id: any): Promise<any> {
  if (!id || typeof id !== 'string') return id;
  const store = await kv.get(`store:${id}`);
  return store?.productionHouseId || id;
}

// Production entries carry their house in productionHouseId and, for a production incharge's
// own entries, in storeId too.
async function withCanonicalHouse(data: any): Promise<any> {
  const house = await canonicalProductionHouseId(data?.productionHouseId);
  if (!house || house === data.productionHouseId) return data;
  return { ...data, productionHouseId: house, ...(data.storeId === data.productionHouseId ? { storeId: house } : {}) };
}

// What the expense checks read and who they tell (expenseReview.ts). Used from the routes below,
// so it is set up before any request arrives.
const expenseReviewDeps: ExpenseReviewDeps = {
  kv: kvWithRetry,
  rows: (prefix, range) => getAllByPrefixWithRetry(prefix, range),
  verifyUser,
  notifyUser: (authUserId, type, title, message, relatedId, relatedDate, quickAction) => notifyUser(authUserId, type, title, message, relatedId, relatedDate, quickAction),
};

// From 1 November 2026 staff food is Rs 500 a month in salary (owner, 28 Oct): meals are no longer
// expenses (the app's forms stop them too; this catches older app versions).
const MEAL_CATEGORY_KEYS = ['breakfast', 'lunch', 'dinner', 'evening_snacks'];
const MEALS_STOPPED_TEXT = "From 1 November staff food is paid in salary (Rs 500 a month), so meals aren't logged as expenses.";
const mealsStopped = (category: any, date: any) => MEAL_CATEGORY_KEYS.includes(String(category)) && String(date || '') > '2026-10-31';

// Cluster head, or an operations manager (a manager who is not a store or production incharge).
function isClusterHeadOrOps(user: any): boolean {
  const role = user?.user_metadata?.role;
  const designation = user?.user_metadata?.designation;
  return role === 'cluster_head' || (role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge');
}

// Add production data
app.post('/make-server-c2dd9b9d/production', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const data = await withCanonicalHouse(await c.req.json());
    const newItem = {
      ...data,
      id: crypto.randomUUID(),
      userId: authResult.user.id,
      // Submission timestamp - used by the 24h auto-approve cron (see
      // /production/auto-approve-stale below) to tell how long this has been pending.
      createdAt: getNowIST()
    };

    const key = `production:${authResult.user.id}:${newItem.id}`;
    await kv.set(key, newItem);
    // Anomaly checks on the numbers (productionReview.ts), after the response.
    await afterResponse('Production review', () => reviewProduction(expenseReviewDeps, key, newItem, authResult.user.user_metadata?.name || authResult.user.email));
    console.log('Production data saved successfully:', newItem.id);

    // Notify cluster heads and operations managers about production submission - both
    // can approve production data (see the /approve route below), so both should know
    // there's something awaiting their review.
    const operationsManagers = await getOperationsManagers(newItem.storeId);
    const clusterHeads = await getAllClusterHeads();
    console.log('Found approvers to notify:', operationsManagers.length, 'operations managers,', clusterHeads.length, 'cluster heads, for storeId:', newItem.storeId);

    const productionHeadName = authResult.user.user_metadata?.name || data.createdBy || authResult.user.email;

    const approvers = [...operationsManagers, ...clusterHeads];

    console.log('Total approvers to notify:', approvers.length);
    
    for (const approver of approvers) {
      if (approver.authUserId) {
        console.log('Creating notification for approver:', approver.email || approver.authUserId);
        await notifyUser(
          approver.authUserId,
          'production_pending',
          'Production Data Awaiting Approval',
          `${productionHeadName} submitted production data for ${data.date}`,
          newItem.id,
          data.date
        );
        console.log('Notification created successfully');
      } else {
        console.log('Skipping approver without authUserId:', approver.email);
      }
    }

    return c.json({ success: true, item: newItem });
  } catch (error) {
    console.log('Error adding production data:', error);
    return c.json({ error: 'Failed to add production data' }, 500);
  }
});

// Update production data
app.put('/make-server-c2dd9b9d/production/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    // Production incharges edit their own house's entries (an edit goes back to pending for
    // approval); operations managers and the cluster head can edit any.
    const isProductionIncharge = authResult.user.user_metadata?.designation === 'production_incharge';
    if (!isProductionIncharge && !isClusterHeadOrOps(authResult.user)) {
      return c.json({ error: 'Only the production incharge, operations managers and the cluster head can edit production data' }, 403);
    }

    const itemId = c.req.param('id');
    const data = await withCanonicalHouse(await c.req.json());

    // Update the record where it already lives (under whoever created it): writing under the
    // editor's own id left the original in place and added a second copy. Paginated, as the
    // plain prefix read stops at 1000 rows.
    const existing = await findByIdInPrefix('production:', itemId);
    if (!existing) {
      return c.json({ error: 'Production data not found' }, 404);
    }
    // A production incharge's storeId holds their production house's id.
    const ownHouseIds = [authResult.user.user_metadata?.storeId, ...(authResult.user.user_metadata?.assignedProductionHouseIds || [])].filter(Boolean);
    if (isProductionIncharge && !isClusterHeadOrOps(authResult.user) && !ownHouseIds.includes(existing.productionHouseId) && !ownHouseIds.includes(existing.storeId)) {
      return c.json({ error: 'You can only edit your own production house\'s entries' }, 403);
    }

    const key = `production:${existing.userId}:${itemId}`;
    const updatedItem = {
      ...data,
      id: itemId,
      userId: existing.userId,
      // The production incharge's own edit always goes back for approval (the app already
      // sends pending; this stops an edit from marking itself approved).
      ...(isClusterHeadOrOps(authResult.user) ? {} : { approvalStatus: 'pending', approvedBy: null, approvedAt: null }),
      // Kept by the server, not the form: what approval has already credited to the production
      // house, so re-approving the edit credits only the change. An entry approved before this
      // was tracked had its pieces credited when it was approved.
      creditedPieces: existing.creditedPieces ?? (existing.approvalStatus === 'approved' ? producedPiecesByType(existing) : undefined),
      // Also kept by the server: the form doesn't send the submission time, and an entry without
      // one was never auto-approved. editedAt gives the approvers 24 hours to look at the edit.
      ...(existing.createdAt ? { createdAt: existing.createdAt } : {}),
      editedAt: getNowIST(),
    };

    await kv.set(key, updatedItem);
    await afterResponse('Production review', () => reviewProduction(expenseReviewDeps, key, updatedItem, authResult.user.user_metadata?.name || authResult.user.email));

    return c.json({ success: true, item: updatedItem });
  } catch (error) {
    console.log('Error updating production data:', error);
    return c.json({ error: 'Failed to update production data' }, 500);
  }
});

// Approve production data
app.post('/make-server-c2dd9b9d/production/:id/approve', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;

    // Allow cluster heads and operations managers
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (role !== 'cluster_head' && !isOperationsManager) {
      return c.json({ error: 'Only cluster heads and operations managers can approve production data' }, 403);
    }

    const itemId = c.req.param('id');

    // Find the production item. Paginated: the plain prefix read stops at 1000 rows, so
    // entries past that came back "not found".
    const allProduction = await getAllByPrefixWithRetry('production:');
    const existingProduction = allProduction.find((p: any) => p.id === itemId);
    
    if (!existingProduction) {
      return c.json({ error: 'Production data not found' }, 404);
    }
    // A second approval (double tap, two approvers at once) would credit the pieces again.
    if (existingProduction.approvalStatus === 'approved') {
      return c.json({ error: 'This production entry is already approved' }, 409);
    }

    const approverName = authResult.user.user_metadata?.name || authResult.user.email;
    const approvedItem = await approveProductionRecord(existingProduction, approverName);
    console.log('Production data approved:', itemId);

    // Notify the production head who submitted the data
    if (existingProduction.userId) {
      console.log('Creating approval notification for production head:', existingProduction.userId);
      await notifyUser(
        existingProduction.userId,
        'production_approved',
        'Production Data Approved',
        `Your production data for ${existingProduction.date} was approved by ${approverName}`,
        itemId,
        existingProduction.date
      );
      console.log('Approval notification created successfully');
    } else {
      console.log('No userId found for production data, skipping notification');
    }
    
    return c.json({ success: true, item: approvedItem });
  } catch (error) {
    console.log('Error approving production data:', error);
    return c.json({ error: 'Failed to approve production data' }, 500);
  }
});

// Auto-approves production data that's been sitting in 'pending' for more than 24
// hours without a cluster head / operations manager acting on it, so a forgotten
// approval never blocks stock calculations indefinitely. Cron-only (see the
// production-auto-approve-stale pg_cron migration) - not reachable by regular users.
app.post('/make-server-c2dd9b9d/production/auto-approve-stale', async (c) => {
  const cronSecret = c.req.header('X-Cron-Secret');
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    // Paginated - the plain prefix read stops at 1000 rows, so pending entries past that were skipped.
    const allProduction = await getAllByPrefixWithRetry('production:');
    const stalePending = allProduction.filter((p: any) => {
      if (p.approvalStatus !== 'pending') return false;
      // Records submitted before createdAt existed (or edited before edits kept it) have no
      // reliable submission timestamp - skip them here rather than guess; a person approves
      // those. An edited entry counts from its last edit.
      const submittedAt = p.editedAt || p.createdAt;
      if (!submittedAt) return false;
      // An entry with no finished pieces at all is never auto-approved: 20 Oct went through
      // this way at 0 pieces although stock was sent that day. A person has to confirm that
      // nothing was made (or fix the entry) before it counts.
      const totalPieces = PRODUCTION_MOMO_TYPES.reduce((sum, t) => sum + (Number(p[t.key]?.final) || 0), 0);
      if (totalPieces <= 0) return false;
      const submitted = new Date(submittedAt).getTime();
      return !isNaN(submitted) && submitted <= cutoff;
    });

    let approvedCount = 0;
    for (const item of stalePending) {
      // Same path as a manual approval, so an edited entry is credited only its change.
      await approveProductionRecord(item, 'Auto-approved (no action within 24 hours)');
      approvedCount++;

      if (item.userId) {
        await notifyUser(
          item.userId,
          'production_approved',
          'Production Data Auto-Approved',
          `Your production data for ${item.date} was automatically approved after 24 hours with no response.`,
          item.id,
          item.date
        );
      }
    }

    console.log(`Auto-approve-stale: approved ${approvedCount} of ${stalePending.length} stale pending production records`);
    return c.json({ success: true, approvedCount });
  } catch (error) {
    console.log('Error auto-approving stale production data:', error);
    return c.json({ error: 'Failed to auto-approve stale production data' }, 500);
  }
});

// One-time migration: Create notifications for existing pending production entries
app.post('/make-server-c2dd9b9d/production/migrate-notifications', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    
    // Allow cluster heads and operations managers to run this
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (role !== 'cluster_head' && !isOperationsManager) {
      return c.json({ error: 'Only cluster heads and operations managers can run this migration' }, 403);
    }

    // Get all pending production entries
    const allProduction = await kv.getByPrefix('production:');
    const pendingProduction = allProduction.filter((p: any) => p.approvalStatus === 'pending');
    
    console.log('Found pending production entries:', pendingProduction.length);
    
    let notificationsCreated = 0;
    
    for (const prod of pendingProduction) {
      console.log('Processing production entry:', prod.id, 'storeId:', prod.storeId);
      
      // Get approvers for this production entry
      // Get approvers for this production entry (only Operations Managers, not Cluster Heads)
      const operationsManagers = await getOperationsManagers(prod.storeId);
      console.log('Operations managers found:', operationsManagers.length, operationsManagers.map(m => ({ email: m.email, authUserId: m.authUserId, role: m.role, designation: m.designation })));
      
      // Only Operations Managers can approve production data
      const approvers = operationsManagers;
      
      console.log('Total approvers:', approvers.length);
      
      // Get production head name
      const productionHeadName = prod.createdBy || 'Production Head';
      
      // Create notifications for each approver
      for (const approver of approvers) {
        console.log('Checking approver:', approver.email, 'authUserId:', approver.authUserId);
        if (approver.authUserId) {
          await notifyUser(
            approver.authUserId,
            'production_pending',
            'Production Data Awaiting Approval',
            `${productionHeadName} submitted production data for ${prod.date}`,
            prod.id,
            prod.date
          );
          notificationsCreated++;
          console.log('Notification created for:', approver.email);
        } else {
          console.log('Skipping approver without authUserId:', approver.email);
        }
      }
    }
    
    console.log('Migration complete. Notifications created:', notificationsCreated);
    
    return c.json({ 
      success: true, 
      message: `Created ${notificationsCreated} notifications for ${pendingProduction.length} pending production entries` 
    });
  } catch (error) {
    console.log('Error migrating production notifications:', error);
    return c.json({ error: 'Failed to migrate notifications' }, 500);
  }
});

// Cleanup duplicate entries in the database
app.post('/make-server-c2dd9b9d/cleanup-duplicates', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can run cleanup
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can cleanup duplicates' }, 403);
    }

    console.log('🧹 Starting cleanup-duplicates operation...');
    
    let removedCount = 0;
    const details: any = {
      inventory: { before: 0, after: 0, removed: 0 },
      overheads: { before: 0, after: 0, removed: 0 },
      sales: { before: 0, after: 0, removed: 0 }
    };

    // Helper function to cleanup a specific prefix with batching
    async function cleanupPrefix(prefix: string, category: string) {
      console.log(`Processing ${category}...`);
      
      // Fetch with retry logic
      const allItems = await retryWithBackoff(
        () => kv.getByPrefix(prefix),
        `getByPrefix(${prefix})`
      );
      
      if (!allItems || allItems.length === 0) {
        console.log(`No ${category} items found`);
        return;
      }
      
      details[category].before = allItems.length;
      console.log(`Found ${allItems.length} ${category} items`);
      
      // Find unique items by ID
      const uniqueItems = new Map();
      for (const item of allItems) {
        if (item.id && !uniqueItems.has(item.id)) {
          uniqueItems.set(item.id, item);
        }
      }
      
      const duplicatesCount = allItems.length - uniqueItems.size;
      
      if (duplicatesCount === 0) {
        console.log(`No duplicates found in ${category}`);
        details[category].after = allItems.length;
        details[category].removed = 0;
        return;
      }
      
      console.log(`Found ${duplicatesCount} duplicates in ${category}, processing...`);
      
      // Process deletions in batches to avoid memory issues
      const BATCH_SIZE = 50;
      const keysToDelete: string[] = [];
      
      for (const item of allItems) {
        if (item.userId && item.id) {
          keysToDelete.push(`${prefix}${item.userId}:${item.id}`);
        }
      }
      
      // Delete in batches
      for (let i = 0; i < keysToDelete.length; i += BATCH_SIZE) {
        const batch = keysToDelete.slice(i, i + BATCH_SIZE);
        await retryWithBackoff(
          () => kvWithRetry.mdel(batch),
          `mdel batch ${i / BATCH_SIZE + 1}`
        );
        console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(keysToDelete.length / BATCH_SIZE)}`);
      }
      
      // Re-save unique items in batches
      const uniqueItemsArray = Array.from(uniqueItems.values());
      const keysToSet: string[] = [];
      const valuesToSet: any[] = [];
      
      for (const item of uniqueItemsArray) {
        if (item.userId && item.id) {
          keysToSet.push(`${prefix}${item.userId}:${item.id}`);
          valuesToSet.push(item);
        }
      }
      
      // Set in batches
      for (let i = 0; i < keysToSet.length; i += BATCH_SIZE) {
        const keyBatch = keysToSet.slice(i, i + BATCH_SIZE);
        const valueBatch = valuesToSet.slice(i, i + BATCH_SIZE);
        await retryWithBackoff(
          () => kvWithRetry.mset(keyBatch, valueBatch),
          `mset batch ${i / BATCH_SIZE + 1}`
        );
        console.log(`Saved batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(keysToSet.length / BATCH_SIZE)}`);
      }
      
      details[category].after = uniqueItems.size;
      details[category].removed = duplicatesCount;
      removedCount += duplicatesCount;
      
      console.log(`✓ ${category}: removed ${duplicatesCount} duplicates`);
    }

    // Process each category sequentially to avoid overwhelming the system
    await cleanupPrefix('inventory:', 'inventory');
    await cleanupPrefix('overhead:', 'overheads');
    await cleanupPrefix('sales:', 'sales');

    console.log('🧹 Cleanup completed:', details);
    
    return c.json({ 
      success: true, 
      removed: removedCount,
      details 
    });
  } catch (error) {
    console.error('❌ Error cleaning up duplicates:', error);
    return c.json({ 
      error: 'Failed to cleanup duplicates', 
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Fix orphaned sales/inventory records with null storeId
app.post('/make-server-c2dd9b9d/fix-orphaned-store-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can run this fix
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can fix orphaned data' }, 403);
    }

    const { targetStoreId, dataType, recordIds } = await c.req.json();
    
    if (!targetStoreId) {
      return c.json({ error: 'targetStoreId is required' }, 400);
    }

    let fixedCount = 0;
    const fixed: any[] = [];

    if (dataType === 'sales' || !dataType) {
      // Fix sales data with null storeId
      const allSales = await getAllByPrefixWithRetry('sales:');
      
      for (const sale of allSales) {
        // If recordIds provided, only fix those specific records
        if (recordIds && !recordIds.includes(sale.id)) {
          continue;
        }
        
        // Fix if storeId is null or undefined
        if (!sale.storeId) {
          const oldKey = `sales:${sale.userId}:${sale.id}`;
          
          // Update the record with the target storeId
          const updatedSale = { ...sale, storeId: targetStoreId };
          
          // Save with updated storeId
          await kv.set(oldKey, updatedSale);
          
          fixedCount++;
          fixed.push({
            type: 'sales',
            id: sale.id,
            date: sale.date,
            oldStoreId: null,
            newStoreId: targetStoreId
          });
        }
      }
    }

    if (dataType === 'inventory' || !dataType) {
      // Fix inventory data with null storeId
      const allInventory = await kv.getByPrefix('inventory:');
      
      for (const item of allInventory) {
        if (recordIds && !recordIds.includes(item.id)) {
          continue;
        }
        
        if (!item.storeId) {
          const oldKey = `inventory:${item.userId}:${item.id}`;
          const updatedItem = { ...item, storeId: targetStoreId };
          await kv.set(oldKey, updatedItem);
          
          fixedCount++;
          fixed.push({
            type: 'inventory',
            id: item.id,
            date: item.date,
            oldStoreId: null,
            newStoreId: targetStoreId
          });
        }
      }
    }

    if (dataType === 'overhead' || !dataType) {
      // Fix overhead data with null storeId
      const allOverheads = await kv.getByPrefix('overhead:');
      
      for (const item of allOverheads) {
        if (recordIds && !recordIds.includes(item.id)) {
          continue;
        }
        
        if (!item.storeId) {
          const oldKey = `overhead:${item.userId}:${item.id}`;
          const updatedItem = { ...item, storeId: targetStoreId };
          await kv.set(oldKey, updatedItem);
          
          fixedCount++;
          fixed.push({
            type: 'overhead',
            id: item.id,
            date: item.date,
            oldStoreId: null,
            newStoreId: targetStoreId
          });
        }
      }
    }

    console.log(`🔧 Fixed ${fixedCount} orphaned records, assigned to store ${targetStoreId}`);
    
    return c.json({ 
      success: true, 
      fixedCount,
      fixed
    });
  } catch (error) {
    console.log('Error fixing orphaned store data:', error);
    return c.json({ error: 'Failed to fix orphaned data' }, 500);
  }
});

// Clear all data for user (for testing purposes)
app.delete('/make-server-c2dd9b9d/clear-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    
    // Get all inventory items
    const inventoryItems = await kv.getByPrefix(`inventory:${userId}:`);
    for (const item of inventoryItems || []) {
      await kv.del(`inventory:${userId}:${item.id}`);
    }
    
    // Get all overhead items
    const overheadItems = await kv.getByPrefix(`overhead:${userId}:`);
    for (const item of overheadItems || []) {
      await kv.del(`overhead:${userId}:${item.id}`);
    }
    
    // Get all sales data
    const salesItems = await getAllByPrefixWithRetry(`sales:${userId}:`);
    for (const item of salesItems || []) {
      await kv.del(`sales:${userId}:${item.id}`);
    }
    
    return c.json({ success: true, message: 'All data cleared successfully' });
  } catch (error) {
    console.log('Error clearing data:', error);
    return c.json({ error: 'Failed to clear data' }, 500);
  }
});

// Health check
app.get('/make-server-c2dd9b9d/health', (c) => {
  return c.json({ status: 'ok' });
});

// Bump this string every time a new build (web or Android APK) actually ships - it's
// compared against APP_VERSION (src/utils/appVersion.ts) baked into that build's bundle.
// No KV storage involved on purpose: this file already gets redeployed as part of every
// release in this project's workflow, so the constant here and the one in the frontend
// bundle are updated together, in the same release, by construction.
const LATEST_APP_VERSION = '1.19.0';

// What this server supports, so a newer app can switch each feature on only against a server
// that has it (an older app ignores the list). Add a name here only once the feature ships:
//   cors-v2        x-region / idempotency-key / x-bunny-client / if-none-match allowed (CORS above)
//   date-range-v1  ?from=&to= (YYYY-MM-DD, inclusive) on the history lists: /inventory, /overheads,
//                  /fixed-costs, /sales, /sales-data, /production, /online-sales, /online-payouts,
//                  /aggregator-settlements (settlementDate), /stock-requests and /production-requests
//                  (requestDate), /online-cash-recalibration/all, /timesheets/all, /payouts,
//                  /leaves/all (leaveDate), /order-item-detail
//   lean-lists-v1  X-Bunny-Client: 2 strips images from the employee lists (/employees,
//                  /unified-employees[/manager|/cluster-head], /archived-employees, /cluster-heads,
//                  /me/employee) and keeps hasAadharImages; GET /employees/:id/documents has them
//   idempotency-v1 Idempotency-Key on any POST/PUT/PATCH/DELETE: a repeat replays the stored answer
//                  (Idempotent-Replay: true) instead of saving twice (idempotency.ts)
//   bootstrap-v1   GET /bootstrap: the startup routes for the caller's role in one answer, with an
//                  ETag / If-None-Match -> 304 (bootstrap.ts)
const SERVER_FEATURES: string[] = ['cors-v2', 'date-range-v1', 'lean-lists-v1', 'idempotency-v1', 'bootstrap-v1'];

// Public, no-login-required version check so a soft "update available" nudge can show even
// if a stale build's own auth has gone stale. Deliberately not gated on verifyUser.
// `updates`: the Android app's live updates (src/utils/liveUpdate.ts) - the latest bundle of
// screens and code and the latest APK, in the public app-updates storage folder. Written by
// scripts/publish-update.mjs.
app.get('/make-server-c2dd9b9d/app-version', async (c) => {
  const updates = await kv.get('app-update-manifest').catch(() => null);
  return c.json({ latestVersion: LATEST_APP_VERSION, features: SERVER_FEATURES, updates: updates || null });
});

// Deletes published update files no phone needs any more, so the app-updates storage folder
// stays small (free plan: 1 GB). Keeps what the manifest points to and the newest two of each
// kind, so a phone half-way through a download can still finish it. Cron-secret only: the
// publish script (scripts/publish-update.mjs) calls it through the database after each release.
app.post('/make-server-c2dd9b9d/app-updates/cleanup', async (c) => {
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || c.req.header('X-Cron-Secret') !== expectedSecret) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const manifest = await kv.get('app-update-manifest');
    const keep = new Set([manifest?.bundle?.url, manifest?.apk?.url].filter(Boolean).map((url: string) => url.split('/app-updates/')[1]));
    const removed: string[] = [];
    for (const folder of ['bundles', 'apk']) {
      const { data, error } = await supabase.storage.from('app-updates').list(folder, { limit: 1000, sortBy: { column: 'created_at', order: 'desc' } });
      if (error) throw error;
      const stale = (data || []).filter((f: any) => f.id).map((f: any) => `${folder}/${f.name}`).slice(2).filter((path: string) => !keep.has(path));
      if (stale.length === 0) continue;
      const { error: removeError } = await supabase.storage.from('app-updates').remove(stale);
      if (removeError) throw removeError;
      removed.push(...stale);
    }
    console.log('App update cleanup removed:', removed);
    return c.json({ success: true, removed });
  } catch (error) {
    console.log('Error cleaning up app update files:', error);
    return c.json({ error: 'Failed to clean up update files' }, 500);
  }
});

// Debug endpoint to check user metadata
app.get('/make-server-c2dd9b9d/debug/user', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  return c.json({
    userId: authResult.user.id,
    email: authResult.user.email,
    metadata: authResult.user.user_metadata,
    role: authResult.user.user_metadata?.role,
    app_metadata: authResult.user.app_metadata
  });
});

// Fix user role - updates the user's metadata to include the role
app.post('/make-server-c2dd9b9d/auth/fix-role', async (c) => {
  try {
    const { email, role } = await c.req.json();

    if (!email || !role) {
      return c.json({ error: 'Email and role are required' }, 400);
    }

    if (!['manager', 'cluster_head', 'employee', 'audit'].includes(role)) {
      return c.json({ error: 'Invalid role' }, 400);
    }

    // Get user by email
    const { data: users, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) {
      return c.json({ error: listError.message }, 400);
    }

    const user = users.users.find(u => u.email === email);
    if (!user) {
      return c.json({ error: 'User not found' }, 404);
    }

    // Update user metadata
    const { data, error } = await supabase.auth.admin.updateUserById(
      user.id,
      {
        user_metadata: {
          ...user.user_metadata,
          role
        }
      }
    );

    if (error) {
      return c.json({ error: error.message }, 400);
    }

    return c.json({ success: true, message: `Role updated to ${role}. Please log out and log back in.` });
  } catch (error) {
    console.log('Error fixing role:', error);
    return c.json({ error: 'Failed to update role' }, 500);
  }
});

// Bulk create employee accounts
app.post('/make-server-c2dd9b9d/auth/create-employee-accounts', async (c) => {
  try {
    const { employees } = await c.req.json();

    if (!employees || !Array.isArray(employees)) {
      return c.json({ error: 'Employees array is required' }, 400);
    }

    const results = [];
    const errors = [];

    for (const emp of employees) {
      try {
        // Check if user already exists
        const { data: existingUsers } = await supabase.auth.admin.listUsers();
        const existingUser = existingUsers?.users?.find(u => u.email === emp.email);

        if (existingUser) {
          // DELETE existing user - it has broken password from admin API
          const { error: deleteError } = await supabase.auth.admin.deleteUser(existingUser.id);
          
          if (deleteError) {
            errors.push({ email: emp.email, error: deleteError.message, action: 'delete' });
            continue;  // Skip to next employee
          }
          
          console.log(`Deleted existing broken account for ${emp.email}`);
        }
        
        // NOW create account - but DON'T use admin API!
        // Instead, store credentials for employee to signup themselves
        {
          results.push({ 
            email: emp.email, 
            status: 'ready_for_signup',
            employeeId: emp.employeeId,
            message: 'Employee must complete signup at login page',
            credentials: {
              email: emp.email,
              password: emp.password
            }
          });

          // Update employee record with email and temp password
          const allEmployees = await kv.getByPrefix('employee:');
          const employeeRecord = allEmployees.find((e: any) => e.employeeId === emp.employeeId);
          
          if (employeeRecord) {
            const employeeKey = `employee:${employeeRecord.id}`;
            await kv.set(employeeKey, { 
              ...employeeRecord, 
              email: emp.email,
              tempPassword: emp.password,  // Store for employee to use
              authUserId: null
            });
          }
        }
      } catch (err) {
        errors.push({ 
          email: emp.email, 
          error: err instanceof Error ? err.message : String(err),
          action: 'process'
        });
      }
    }

    return c.json({ 
      success: true, 
      deleted: results.filter(r => r.status === 'ready_for_signup').length,
      message: 'Old accounts deleted. Employees must signup at the login page using their credentials.',
      failed: errors.length,
      results,
      errors 
    });
  } catch (error) {
    console.log('Error creating employee accounts:', error);
    return c.json({ error: 'Failed to create employee accounts' }, 500);
  }
});

// Unified employee records as the employee lists hand them out: both id and employeeId set, and
// type mirroring employmentType (payroll reads type).
function normalizeEmployee(emp: any) {
  return {
    ...emp,
    id: emp.id || emp.employeeId, // Use employeeId as id if id doesn't exist
    employeeId: emp.employeeId || emp.id, // Ensure employeeId exists
    type: emp.employmentType || emp.type // Map employmentType to type for payroll compatibility
  };
}

// Employee Management Routes
// Get all employees
app.get('/make-server-c2dd9b9d/employees', async (c) => {
  try {
    // Only unified-employee: records. The old employee: collection has been empty for months
    // and nothing in the app writes it, yet it was scanned on every call (~500 times a day).
    const unifiedEmployees = await kvWithRetry.getByPrefix('unified-employee:');
    const allEmployees = unifiedEmployees.map(normalizeEmployee);

    const viewer = await viewerOf(c);
    return c.json({ success: true, employees: allEmployees.map((e: any) => employeeForViewer(e, viewer)) });
  } catch (error: any) {
    console.log('Error fetching employees:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ success: true, employees: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// The signed-in person's own employee record (same shape as their entry in GET /employees),
// so a plain employee's phone needn't download the whole staff list to find itself.
// employee is null for a login with no employee record.
app.get('/make-server-c2dd9b9d/me/employee', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const employeeId = authResult.user.user_metadata?.employeeId;
    const record = employeeId ? await kvWithRetry.get(`unified-employee:${employeeId}`) : null;
    const viewer = await viewerOf(c);
    return c.json({ success: true, employee: record ? employeeForViewer(normalizeEmployee(record), viewer) : null });
  } catch (error) {
    console.log('Error fetching own employee record:', error);
    return c.json({ error: 'Failed to fetch your employee record' }, 500);
  }
});

// One person's document images (Aadhaar front and back, and any other photo kept on the
// record), for the lean lists above. Exactly who sees them in the full lists: the owner and the
// person themself; anyone else gets 403. ?archived=true reads the past-employee record (ids
// were reused in the past, so an active record with the same id may exist too).
app.get('/make-server-c2dd9b9d/employees/:id/documents', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const id = c.req.param('id');
    const wantArchived = c.req.query('archived') === 'true';
    const [active, archived] = await Promise.all([
      wantArchived ? Promise.resolve(null) : kvWithRetry.get(`unified-employee:${id}`),
      kvWithRetry.get(`archived-employee:${id}`),
    ]);
    const record = active || archived;
    if (!record) {
      return c.json({ error: 'Employee not found' }, 404);
    }
    const viewer = await viewerOf(c);
    if (!seesFullEmployeeRecord(normalizeEmployee(record), viewer)) {
      return c.json({ error: 'Only the owner and the employee themself can see these documents' }, 403);
    }

    const images: Record<string, string> = {};
    for (const [k, v] of Object.entries(record)) {
      if (k !== 'aadharFront' && k !== 'aadharBack' && isImageField(k, v)) images[k] = v as string;
    }
    return c.json({
      success: true,
      employeeId: record.employeeId || record.id || id,
      archived: !active,
      aadharFront: record.aadharFront || null,
      aadharBack: record.aadharBack || null,
      images,
    });
  } catch (error) {
    console.log('Error fetching employee documents:', error);
    return c.json({ error: 'Failed to fetch employee documents' }, 500);
  }
});

// Add employee
app.post('/make-server-c2dd9b9d/employees', async (c) => {
  try {
    const employee = await c.req.json();
    const key = `employee:${employee.id}`;
    
    await kv.set(key, employee);
    
    return c.json({ success: true, employee });
  } catch (error) {
    console.log('Error adding employee:', error);
    return c.json({ error: 'Failed to add employee' }, 500);
  }
});

// Update employee
app.put('/make-server-c2dd9b9d/employees/:id', async (c) => {
  try {
    const employeeId = c.req.param('id');
    const updates = await c.req.json();
    
    console.log('Updating employee:', employeeId, Object.keys(updates || {}));
    
    // Try both old and new key formats for backward compatibility
    let key = `employee:${employeeId}`;
    let existingEmployee = await kv.get(key);
    
    // If not found with old format, try unified format
    if (!existingEmployee) {
      console.log('Employee not found with old format, trying unified format');
      key = `unified-employee:${employeeId}`;
      existingEmployee = await kv.get(key);
    }
    
    if (!existingEmployee) {
      console.log('Employee not found with either format');
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    console.log('Existing employee found:', JSON.stringify(existingEmployee));
    
    const updatedEmployee = {
      ...existingEmployee,
      ...updates,
      id: employeeId,
      employeeId: employeeId // Ensure employeeId is preserved
    };
    
    await kv.set(key, updatedEmployee);
    console.log('Employee updated successfully with key:', key);
    
    return c.json({ success: true, employee: updatedEmployee });
  } catch (error) {
    console.log('Error updating employee:', error);
    return c.json({ error: 'Failed to update employee' }, 500);
  }
});

// Delete employee (Archive with employment history)
app.delete('/make-server-c2dd9b9d/employees/:id', async (c) => {
  try {
    const idParam = c.req.param('id');
    console.log('Archiving employee with ID:', idParam);
    
    let key: string;
    let existingEmployee: any = null;
    let employeeId: string;
    
    // Check if it's a UUID (database id) or custom employeeId
    const isUUID = idParam.includes('-') && idParam.length > 20;
    
    if (isUUID) {
      // It's a database UUID - need to search all employees to find the matching one
      console.log('Searching by database UUID:', idParam);
      const [oldEmployees, unifiedEmployees] = await Promise.all([
        kv.getByPrefix('employee:'),
        kv.getByPrefix('unified-employee:')
      ]);
      
      const allEmployees = [...oldEmployees, ...unifiedEmployees];
      existingEmployee = allEmployees.find((emp: any) => emp.id === idParam);
      
      if (existingEmployee) {
        employeeId = existingEmployee.employeeId;
        // Determine which key format was used
        key = oldEmployees.find((emp: any) => emp.id === idParam) 
          ? `employee:${employeeId}` 
          : `unified-employee:${employeeId}`;
        console.log('Found employee by UUID with key:', key);
      }
    } else {
      // It's a custom employeeId - use the old logic
      employeeId = idParam;
      key = `employee:${employeeId}`;
      existingEmployee = await kv.get(key);
      
      // If not found with old format, try unified format
      if (!existingEmployee) {
        console.log('Employee not found with old format, trying unified format');
        key = `unified-employee:${employeeId}`;
        existingEmployee = await kv.get(key);
      }
    }
    
    if (!existingEmployee) {
      console.log('Employee not found with either format');
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    // Calculate total earnings from payouts (paginated: payouts pass 1000 rows)
    const payouts = await getAllByPrefixWithRetry('payout:');
    const employeePayouts = payouts.filter((p: any) => p.employeeId === employeeId);
    const totalEarnings = employeePayouts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    // Payroll's delete button archives through this route too - switch the login off here
    // as well, or a released employee could keep using the app.
    const loginRevoked = await setEmployeeLoginBlocked(existingEmployee.authUserId, true);

    // Archive the employee with release information
    const archivedEmployee = {
      ...existingEmployee,
      isActive: false,
      releasedAt: new Date().toISOString(),
      totalEarnings,
      archivedFrom: key,
    };

    // Save to archived employees
    const archiveKey = `archived-employee:${employeeId}`;
    await kv.set(archiveKey, archivedEmployee);

    // Remove from active employees
    await kv.del(key);

    console.log('Employee archived successfully. Total earnings:', totalEarnings);

    return c.json({ success: true, archived: archivedEmployee, loginRevoked });
  } catch (error) {
    console.log('Error archiving employee:', error);
    return c.json({ error: 'Failed to archive employee' }, 500);
  }
});

// Get all archived employees
app.get('/make-server-c2dd9b9d/archived-employees', async (c) => {
  try {
    const archivedEmployees = await kv.getByPrefix('archived-employee:');
    console.log('Fetched archived employees:', archivedEmployees.length);
    // Same normalization GET /employees already applies to active unified employees -
    // without it, every archived employee's `type` reads as null (they only ever had
    // `employmentType` set), so PayrollManagement.tsx's Contract/Permanent split silently
    // excludes their entire payout history once they're archived, regardless of whether
    // the store/archive-status filtering is otherwise correct. Confirmed real: Akash Dey's
    // August payout existed the whole time but could never match either tab.
    const normalized = archivedEmployees.map(normalizeEmployee);
    const viewer = await viewerOf(c);
    return c.json({ success: true, employees: normalized.map((e: any) => employeeForViewer(e, viewer)) });
  } catch (error) {
    console.log('Error fetching archived employees:', error);
    return c.json({ error: 'Failed to fetch archived employees' }, 500);
  }
});

// A salary paid from Paytm moves that store's balance (one with no storeId counts against
// every store - see paytmSourcesForStore), so saving, editing or deleting a payout re-runs the
// Paytm cascade from its date. Before this, a payout only reached the stored balances whenever
// something unrelated happened to sweep through those days later.
async function cascadePaytmForPayouts(payouts: any[]): Promise<void> {
  const fromByStore = new Map<string, string>();
  const note = (storeId: string, date: string) => {
    const current = fromByStore.get(storeId);
    if (!current || date < current) fromByStore.set(storeId, date);
  };
  let everyStoreFrom: string | null = null;
  for (const p of payouts) {
    if (!p || typeof p.date !== 'string' || !payoutHitsPaytm(p)) continue;
    const date = p.date.substring(0, 10);
    if (p.storeId) note(p.storeId, date);
    else if (!everyStoreFrom || date < everyStoreFrom) everyStoreFrom = date;
  }
  try {
    if (everyStoreFrom) {
      const stores = await kv.getByPrefix('store:');
      for (const store of stores || []) if (store?.id) note(store.id, everyStoreFrom);
    }
    for (const [storeId, fromDate] of fromByStore) {
      await cascadeRecomputePaytmBalances(storeId, fromDate);
    }
  } catch (error) {
    // Non-fatal, like the cascade itself - the payout is already saved.
    console.log('Error refreshing Paytm balances after a payout change:', error);
  }
}

// Bring a past employee back (owner only): moves the record back to where it was archived
// from and lifts the login ban that archiving put on.
app.post('/make-server-c2dd9b9d/archived-employees/:employeeId/restore', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  if (authResult.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only the owner can restore a past employee' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const archived = await kv.get(`archived-employee:${employeeId}`);
    if (!archived) {
      return c.json({ error: 'Past employee not found' }, 404);
    }

    const { isActive: _isActive, releasedAt: _releasedAt, totalEarnings: _totalEarnings, archivedFrom, ...record } = archived;
    const restoreKey = typeof archivedFrom === 'string' && /^(unified-employee|employee):/.test(archivedFrom)
      ? archivedFrom
      : `unified-employee:${employeeId}`;
    if (await kv.get(restoreKey)) {
      return c.json({ error: 'An active employee already uses this id' }, 409);
    }

    await kv.set(restoreKey, { ...record, restoredAt: new Date().toISOString() });
    await kv.del(`archived-employee:${employeeId}`);
    const loginRestored = await setEmployeeLoginBlocked(record.authUserId, false);

    return c.json({ success: true, loginRestored });
  } catch (error) {
    console.log('Error restoring employee:', error);
    return c.json({ error: 'Failed to restore employee' }, 500);
  }
});

// Payout Management Routes
// Get all payouts
app.get('/make-server-c2dd9b9d/payouts', async (c) => {
  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    // Paginated: every salary and daily wage is a row, so this passes 1000 and payslips,
    // My Payouts and advance recovery would silently miss the rest.
    const payouts = await getAllByPrefixWithRetry('payout:', windowed.range);
    return c.json({ success: true, payouts: await payScope(c, payouts) });
  } catch (error: any) {
    console.log('Error fetching payouts:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ success: true, payouts: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch payouts' }, 500);
  }
});

// Add payouts (batch)
app.post('/make-server-c2dd9b9d/payouts', async (c) => {
  try {
    const body = await c.req.json();
    console.log('Received payout request:', Array.isArray(body) ? body.length : 1, "item(s)");
    
    const { payouts } = body;
    
    if (!payouts) {
      console.log('Error: payouts field missing from request body');
      return c.json({ error: 'Payouts field is required' }, 400);
    }
    
    if (!Array.isArray(payouts)) {
      console.log('Error: payouts is not an array:', typeof payouts);
      return c.json({ error: 'Payouts must be an array' }, 400);
    }
    
    console.log(`Processing ${payouts.length} payouts`);
    
    // Build separate arrays for keys and values as required by mset
    const keys: string[] = [];
    const values: any[] = [];
    
    payouts.forEach((payout, index) => {
      console.log(`Payout ${index}:`, payout?.employeeId, payout?.date);
      const key = `payout:${payout.id}`;
      keys.push(key);
      values.push(payout);
    });
    
    console.log('Saving payouts to KV store...');
    await kv.mset(keys, values);
    console.log('Payouts saved successfully');
    await cascadePaytmForPayouts(payouts);

    // Notify each employee their salary has been credited - a payout record being created
    // here means the transfer has already happened (this isn't an approval queue), so this
    // is a "money has moved" notice, not a pending-action one.
    for (const payout of payouts) {
      try {
        const employee = await kv.get(`unified-employee:${payout.employeeId}`);
        if (!employee?.authUserId) continue;

        const monthLabel = payout.forMonth
          ? new Date(`${payout.forMonth}-01T00:00:00Z`).toLocaleString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' })
          : payout.date;
        const amountLabel = `₹${Number(payout.amount || 0).toLocaleString('en-IN')}`;
        const txnLabel = payout.transactionId ? ` (Transaction ID: ${payout.transactionId})` : '';

        await notifyUser(
          employee.authUserId,
          'salary_credited',
          'Salary Credited 💰',
          `Your salary of ${amountLabel} for ${monthLabel} has been credited to your bank account${txnLabel}.`,
          payout.id,
          payout.date
        );
      } catch (notifyError) {
        console.log(`Failed to notify employee ${payout.employeeId} of payout:`, notifyError);
      }
    }

    return c.json({ success: true, payouts });
  } catch (error) {
    console.log('Error adding payouts:', error);
    console.log('Error details:', error instanceof Error ? error.message : String(error));
    console.log('Error stack:', error instanceof Error ? error.stack : 'No stack trace');
    return c.json({ error: 'Failed to add payouts', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Update payout
app.put('/make-server-c2dd9b9d/payouts/:id', async (c) => {
  try {
    const payoutId = c.req.param('id');
    const updates = await c.req.json();
    
    console.log('Updating payout:', payoutId, Object.keys(updates || {}));
    
    const key = `payout:${payoutId}`;
    const existingPayout = await kv.get(key);
    
    if (!existingPayout) {
      return c.json({ error: 'Payout not found' }, 404);
    }
    
    const updatedPayout = {
      ...existingPayout,
      ...updates,
      id: payoutId
    };
    
    await kv.set(key, updatedPayout);
    console.log('Payout updated successfully');
    // Both versions: a moved date or a switch to/from "paid from Paytm" changes both days.
    await cascadePaytmForPayouts([existingPayout, updatedPayout]);

    return c.json({ success: true, payout: updatedPayout });
  } catch (error) {
    console.log('Error updating payout:', error);
    return c.json({ error: 'Failed to update payout' }, 500);
  }
});

// Delete payout
app.delete('/make-server-c2dd9b9d/payouts/:id', async (c) => {
  try {
    const payoutId = c.req.param('id');
    console.log('Deleting payout:', payoutId);
    
    const key = `payout:${payoutId}`;
    const existingPayout = await kv.get(key);
    await kv.del(key);
    console.log('Payout deleted successfully');
    if (existingPayout) await cascadePaytmForPayouts([existingPayout]);
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting payout:', error);
    return c.json({ error: 'Failed to delete payout' }, 500);
  }
});

// ============================================
// Online Sales (Swiggy/Zomato) Management Routes
// ============================================

// Get all online sales
app.get('/make-server-c2dd9b9d/online-sales', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    const sales = await getAllByPrefixWithRetry('online_sales:', windowed.range);
    return c.json({ success: true, sales });
  } catch (error: any) {
    console.log('Error fetching online sales:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ success: true, sales: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch online sales' }, 500);
  }
});

// Save online sales entry (store incharge only, same as offline sales)
app.post('/make-server-c2dd9b9d/online-sales', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    if (role !== 'manager' || designation !== 'store_incharge') {
      return c.json({ error: 'Only store incharges can log online sales' }, 403);
    }

    const entry = await c.req.json();
    console.log('Saving online sales entry:', entry);

    const key = `online_sales:${entry.id}`;
    await kv.set(key, entry);
    console.log('Online sales entry saved successfully');

    return c.json({ success: true, entry });
  } catch (error) {
    console.log('Error saving online sales:', error);
    return c.json({ error: 'Failed to save online sales' }, 500);
  }
});

// Get all online payouts
app.get('/make-server-c2dd9b9d/online-payouts', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    const payouts = await getAllByPrefixWithRetry('online_payout:', windowed.range);
    return c.json({ success: true, payouts });
  } catch (error: any) {
    console.log('Error fetching online payouts:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ success: true, payouts: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch online payouts' }, 500);
  }
});

// Save online payout entry (aggregator settlement reconciliation - operations manager / cluster head only,
// NOT the store incharge, since this reveals commission structure)
app.post('/make-server-c2dd9b9d/online-payouts', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';

    if (!isOperationsManager && role !== 'cluster_head') {
      return c.json({ error: 'Only operations managers or cluster heads can record payout data' }, 403);
    }

    const entry = await c.req.json();
    console.log('Saving online payout entry:', entry);

    const key = `online_payout:${entry.id}`;
    await kv.set(key, entry);
    console.log('Online payout entry saved successfully');

    // If the aggregator paid out more than the recorded online sales for this day,
    // the excess goes into the store's Paytm cash-in-hand. This adjusts the sales
    // record server-side (under the operations manager's own authorization) since
    // the sales record itself can otherwise only be edited by the store incharge.
    try {
      const allOnlineSales = await getAllByPrefixWithRetry('online_sales:');
      const salesEntry = (allOnlineSales || []).find((s: any) =>
        s.date === entry.date && (!entry.storeId || s.storeId === entry.storeId)
      );
      const totalOnlineSales = (salesEntry?.swiggySales || 0) + (salesEntry?.zomatoSales || 0);
      const totalPayout = (entry.swiggyPayout || 0) + (entry.zomatoPayout || 0);
      const extraPayout = totalPayout - totalOnlineSales;

      if (extraPayout > 0) {
        const allSales = await getAllByPrefixWithRetry('sales:');
        const existingSale = (allSales || []).find((s: any) =>
          s.date === entry.date && (!entry.storeId || s.storeId === entry.storeId)
        );

        if (existingSale) {
          const salesKey = `sales:${existingSale.userId}:${existingSale.id}`;
          await kv.set(salesKey, {
            ...existingSale,
            paytmAmount: (existingSale.paytmAmount || 0) + extraPayout
          });
          console.log(`Applied extra payout of ₹${extraPayout} to Paytm cash-in-hand for ${entry.date}`);
        }
      }
    } catch (adjustError) {
      // Don't fail the payout save if this best-effort adjustment fails
      console.log('Warning: failed to apply extra payout to sales Paytm amount:', adjustError);
    }

    return c.json({ success: true, entry });
  } catch (error) {
    console.log('Error saving online payout:', error);
    return c.json({ error: 'Failed to save online payout' }, 500);
  }
});

// ============================================
// Aggregator Settlement Routes - replaces the online-payouts daily-entry mechanism
// above with document-upload settlements. Each settlement's netPayout is credited to
// Paytm on its own settlementDate purely by calculatePaytmBalance summing these records
// for the relevant date range client-side (same pattern already used for onlineLoans) -
// no server-side mutation of the sales: record is needed here.
// ============================================

app.get('/make-server-c2dd9b9d/aggregator-settlements', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // A settlement's own date is the day it was paid out (settlementDate).
  const windowed = requestedDateRange(c, 'settlementDate');
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    const storeId = c.req.query('storeId');
    let settlements = await getAllByPrefixWithRetry('aggregator-settlement:', windowed.range);
    if (storeId) {
      settlements = (settlements || []).filter((s: any) => s.storeId === storeId);
    }
    return c.json({ success: true, settlements: settlements || [] });
  } catch (error) {
    console.log('Error fetching aggregator settlements:', error);
    return c.json({ error: 'Failed to fetch aggregator settlements' }, 500);
  }
});

// Recomputes and re-saves actualPaytmBalance for every one of a store's sales records
// from a given date through today, in chronological order - each day's corrected balance
// becomes the anchor for the next. Runs automatically whenever a settlement is
// saved/replaced, because the online-cash balance formula carries each day's counted
// balance forward as the next day's starting point (see SalesManagement.tsx's
// calculatePaytmBalance) - a settlement landing after a later day was already reconciled
// used to leave that day, and every day after it, silently stuck on a stale number until
// someone manually recomputed it by hand. This closes that gap at the source instead.
// The formula itself lives in paytmRules.ts, the same file the app's own Paytm figures run
// (src/utils/paytmRules.ts is its byte-for-byte twin), so the balance stored here is the one
// the store incharge's form and the Sales overview show. This used to be a separate copy
// that ignored loans and repayments, took bank/cash-paid salaries off Paytm, and dropped a
// settlement or salary landing on a day with no sales row.
//
// A logged Online Cash Recalibration (a human physically checking the real Paytm app
// balance) is a VERIFIED checkpoint and always wins over whatever this formula would
// otherwise compute for that exact date - every later day's chain anchors off it, not off
// an unverified number that's been silently compounding since account inception.
// Confirmed the hard way: this store's chain had never had a single verified checkpoint
// (a separate bug prevented recalibration from ever saving at all - see
// OnlineCashRecalibration.tsx), so a months-long formula-only chain drifted with nothing
// to correct it against. Without this, a recalibration would keep being silently
// overwritten by the very formula it exists to override the next time this cascade runs.
// CONFIRMED FAILURE MODE (found 2026-08-26): every settlement-mutating route above already
// calls this cascade, but a settlement removed via a direct database edit instead of those
// routes (e.g. a one-off duplicate cleanup) skips it entirely - the affected day's
// actualPaytmBalance stays stuck at whatever it was double/under-counted to, and every
// later day inherits the error via previousPaytm chaining (SalesView.tsx) since nothing
// ever re-triggers a recompute on its own. Found this way: 2026-08-24 was stuck ₹11,621.89
// too high (one extra copy of that day's Zomato settlement) for two days before a store
// incharge noticed the jump in "previous day's balance". Any direct DB correction to
// aggregator-settlement/cash-topup/payout/recalibration records MUST be followed by calling
// this function (or the existing diagnostic-route pattern used throughout this session) from
// that record's date forward - never assume a manual data fix is complete on its own.
async function cascadeRecomputePaytmBalances(storeId: string, fromDate: string): Promise<void> {
  try {
    const today = getTodayIST();
    if (fromDate > today) return;

    const [allSales, allSettlements, allPayouts, allRecalibrations, allTopups, allLoans, allOverheads] = await Promise.all([
      getAllByPrefixWithRetry('sales:'),
      getAllByPrefixWithRetry('aggregator-settlement:'),
      getAllByPrefixWithRetry('payout:'),
      getAllByPrefixWithRetry('online-cash-recalibration:'),
      getAllByPrefixWithRetry('cash-topup:'),
      getAllByPrefixWithRetry('online-loan:'),
      // Only the aggregator-commission entries matter here (see isCommissionEntry).
      getAllByPrefixWithRetry('overhead:'),
    ]);

    // A recalibration (a human physically checking the Paytm app balance) resets the chain
    // on its own date; a production-reason top-up drains this same Paytm even though it never
    // goes on a sales row; a same-day top-up only comes off a recalibration if it was approved
    // after the count - all of that is in paytmRules.ts now, shared with the app.
    // Event stall collections into this store's Paytm (events.ts), same as GET /sales shows.
    await attachEventRollups(allSales || [], { kv: kvWithRetry, getAllByPrefix: getAllByPrefixWithRetry });
    const src = paytmSourcesForStore({
      sales: (allSales || []).filter((s: any) => typeof s?.date === 'string'),
      settlements: allSettlements || [],
      payouts: allPayouts || [],
      topups: allTopups || [],
      loans: allLoans || [],
      overheads: allOverheads || [],
      recalibrations: allRecalibrations || [],
    }, storeId);

    // Start from whichever is chronologically most recent strictly before fromDate - a
    // verified recalibration or the last real balance on a sales record (a POS-sync
    // placeholder's blank or old 0 is skipped) - and walk forward a day at a time. The first
    // step also covers any gap between that anchor and fromDate. No anchor at all = every
    // record from the beginning, from zero, exactly like the app's own fallback.
    const anchor = paytmAnchorBefore(src, fromDate);
    let running = anchor ? anchor.balance : 0;
    let lastDate = anchor ? anchor.date : '';
    let cursor = fromDate;
    let updated = 0;
    while (cursor <= today) {
      const recal = recalibrationOn(src, cursor);
      running = recal ? recalDayEndBalance(src, recal) : running + paytmMovement(src, lastDate, cursor).net;
      for (const record of src.sales.filter((s: any) => s.date === cursor)) {
        if (typeof record.actualPaytmBalance !== 'number' || Math.abs(record.actualPaytmBalance - running) > 0.005) {
          await kv.set(`sales:${record.userId}:${record.id}`, { ...withoutEventRollups(record), actualPaytmBalance: running });
          updated++;
        }
      }
      lastDate = cursor;
      cursor = addDaysToDateString(cursor, 1);
    }
    console.log(`Cascade Paytm recompute for store ${storeId} from ${fromDate}: ${updated} record(s) updated`);
  } catch (error) {
    console.log('Error cascading Paytm balance recompute:', error);
    // Non-fatal - the settlement itself already saved successfully; worst case, this
    // falls back to the old behavior of a stale value needing a manual fix.
  }
}

// Reusable admin trigger for cascadeRecomputePaytmBalances, per its own comment above
// ("any direct DB correction... MUST be followed by calling this function... from that
// record's date forward"). Every normal write path already calls it automatically; this
// exists for the case this comment warns about - a direct database correction made outside
// any of those paths (e.g. 2026-10-16: usedOnlineMoney hand-corrected on a past date after
// fixing the bug that zeroed it out) - so the fix doesn't just sit on that one day while
// every later day keeps chaining off the stale balance. Cron-secret protected like the
// other admin/cron-only routes, since it writes data and isn't meant for regular users.
app.post('/make-server-c2dd9b9d/admin/recompute-paytm-balance', async (c) => {
  const cronSecret = c.req.header('X-Cron-Secret');
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const { storeId, fromDate } = await c.req.json();
    if (!storeId || !fromDate) {
      return c.json({ error: 'storeId and fromDate are required' }, 400);
    }
    await cascadeRecomputePaytmBalances(storeId, fromDate);
    return c.json({ success: true });
  } catch (error: any) {
    console.log('Error in manual Paytm recompute trigger:', error);
    return c.json({ error: 'Failed to recompute' }, 500);
  }
});

// Same manual trigger for the production-cash ledger (cron-secret gated, like the Paytm one
// above) - for repairing a stretch of days after a correction that the automatic cascades
// didn't see.
app.post('/make-server-c2dd9b9d/admin/recompute-production-cash', async (c) => {
  const cronSecret = c.req.header('X-Cron-Secret');
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }
  try {
    const { productionHouseId, fromDate } = await c.req.json();
    if (!productionHouseId || !fromDate) {
      return c.json({ error: 'productionHouseId and fromDate are required' }, 400);
    }
    await cascadeRecomputeProductionCash(productionHouseId, fromDate);
    return c.json({ success: true });
  } catch (error: any) {
    console.log('Error in manual production cash recompute trigger:', error);
    return c.json({ error: 'Failed to recompute' }, 500);
  }
});

// Recomputes and re-saves the derived fields (openingBalance/cashTopupCredited/
// productionExpenses/expectedClosingCashInHand) on every one of a production house's
// production-cash records from a given date through today, in chronological order -
// mirrors cascadeRecomputePaytmBalances above exactly, same reason: a correction to a
// past day (a late-added production expense, a topup approved after the fact, a
// corrected physical count) must ripple forward, or every day after it silently keeps
// using a stale opening balance until someone notices and manually fixes it by hand -
// the exact bug this session already found and fixed once for Paytm balances.
//
// Unlike the Paytm cascade, `actualCashInHand` here is a REAL independent physical count
// (production's own till), not a fully-determined value - so this never overwrites
// actualCashInHand itself, only the derived/expected fields around it. The anchor for
// the next day is the day's actualCashInHand when one was actually counted, falling back
// to that day's own expectedClosingCashInHand when nobody has counted yet (an idle/
// unreconciled day passes its expected balance through unchanged, same as the store side
// already does with previousCashInHand today).
//
// A day with no production-cash record at all (nobody opened the Cash tab that day) is
// left alone rather than fabricated - its production expenses are still real and will be
// picked up once someone actually reconciles that day, but until then the running
// balance simply doesn't reflect them yet. This mirrors how a sales: record only exists
// for a day someone actually interacted with it.
// Shared by the cascade below and by GET /production-cash's live-compute path for a date
// that has no saved record yet, so the two can never drift apart into disagreeing about
// what "expected" means for the same day.
// A production house's opening balance for `date` is NOT just its own carried-forward
// leftover - it's that leftover PLUS the linked store's actual cash-in-hand from the
// PRIOR day, physically handed over by the store incharge to production each morning
// (confirmed via a real worked example: Aug 21's production opening = Aug 20's store
// actualCashInHand (₹2,320) + production's own prior leftover (₹0, no history yet)).
// Real money coming IN fresh each day, not part of production's own running balance - so
// this is looked up per-day from the stores' own sales: records, never carried forward
// like the production-side anchor is. Sums across every store currently linked to this
// house (N:1 is allowed by the schema even though only one store uses it today).
function getStoreHandoverForDate(allSales: any[], allStores: any[], productionHouseId: string, date: string): number {
  const priorDate = addDaysToDateString(date, -1);
  const linkedStoreIds = new Set((allStores || []).filter((s: any) => s.productionHouseId === productionHouseId).map((s: any) => s.id));
  if (linkedStoreIds.size === 0) return 0;
  return (allSales || [])
    .filter((s: any) => linkedStoreIds.has(s.storeId) && s.date === priorDate)
    .reduce((sum: number, s: any) => sum + (typeof s.actualCashInHand === 'number' ? s.actualCashInHand : 0), 0);
}

function computeProductionCashExpected(
  allInventory: any[], allOverheads: any[], allFixedCosts: any[], allTopups: any[],
  productionHouseId: string, date: string, openingBalance: number
): { productionExpenses: number; cashTopupCredited: number; expectedClosingCashInHand: number } {
  // Its own expenses, plus store bills the cluster head paid out of this house's cash (the
  // cost stays the store's; only the cash came from here).
  const isProdHouseSpend = (item: any) =>
    (item.entityType === 'production_house' && item.productionHouseId === productionHouseId) ||
    item.paidFromProductionHouseId === productionHouseId;
  // Only the CASH portion of a production expense reduces cash-in-hand - an online-paid
  // expense never touched the physical till. Confirmed bug: this previously summed the
  // full totalCost/amount regardless of paymentMethod (the store's own equivalent formula
  // already gets this right - see totalExpenses in SalesManagement.tsx/SalesView.tsx).
  // Hasn't visibly manifested yet since every production expense logged so far happens to
  // be paymentMethod: 'cash', but would silently overstate expenses the day an online-paid
  // one is logged.
  const cashPortion = (item: any) => {
    if (item.paymentMethod === 'both') return item.cashAmount || 0;
    if (item.paymentMethod === 'online') return 0;
    if (item.paymentMethod === 'owner') return 0; // cluster head's own money
    return item.totalCost ?? item.amount ?? 0; // default/'cash'
  };
  const productionExpenses =
    (allInventory || []).filter((i: any) => i.date === date && isProdHouseSpend(i)).reduce((s: number, i: any) => s + cashPortion(i), 0) +
    (allOverheads || []).filter((o: any) => o.date === date && isProdHouseSpend(o)).reduce((s: number, o: any) => s + cashPortion(o), 0) +
    (allFixedCosts || []).filter((f: any) => f.date === date && isProdHouseSpend(f)).reduce((s: number, f: any) => s + cashPortion(f), 0);
  const cashTopupCredited = (allTopups || [])
    .filter((t: any) => t.status === 'approved' && t.reason === 'production_inventory' && t.productionHouseId === productionHouseId && t.date === date)
    .reduce((s: number, t: any) => s + (t.requestedAmount || 0), 0);
  // An event's cash top-up the approver paid out of this house's cash (events.ts) leaves the
  // till like any production spend, so it is counted in with the day's production expenses.
  const eventTopupsPaid = (allTopups || [])
    .filter((t: any) => t.status === 'approved' && t.reason === 'event_cash' && t.fundingSource === 'production_cash' && t.fundedFromProductionHouseId === productionHouseId && t.date === date)
    .reduce((s: number, t: any) => s + (t.requestedAmount || 0), 0);
  const spent = productionExpenses + eventTopupsPaid;
  return { productionExpenses: spent, cashTopupCredited, expectedClosingCashInHand: openingBalance + cashTopupCredited - spent };
}

// A day with no saved production-cash record (nobody counted that day, or the shop was shut,
// e.g. Dashami 21 Oct) still has real money moving through it: the store's prior-night cash
// handed over, top-ups and production expenses. It used to be skipped entirely - the next
// day's opening jumped straight back to the last SAVED day's count, so on 22 Oct production
// opened at ₹10,385 (19 Oct's count) instead of ₹16,041, losing 19 Oct's ₹3,350 handover,
// 20 Oct's ₹1,314 of expenses and 20 Oct's ₹3,620 handover. Unsaved days are now walked
// through at their expected closing. Only from this date on: the three earlier gaps (27 Aug,
// 12 Sep, 1 Oct) were already absorbed by the physical counts and approvals on the days
// after them, and re-deriving them would rewrite those approved records.
const PRODUCTION_CASH_GAP_CARRY_FROM = '2026-10-20';

type ProductionCashData = {
  allInventory: any[]; allOverheads: any[]; allFixedCosts: any[]; allTopups: any[]; allSales: any[]; allStores: any[];
};

// Production's own closing balance after an unsaved `date`, given what it opened with.
function carryThroughUnsavedDay(carry: number, data: ProductionCashData, productionHouseId: string, date: string): number {
  if (date < PRODUCTION_CASH_GAP_CARRY_FROM) return carry;
  const opening = carry + getStoreHandoverForDate(data.allSales, data.allStores, productionHouseId, date);
  return computeProductionCashExpected(data.allInventory, data.allOverheads, data.allFixedCosts, data.allTopups, productionHouseId, date, opening).expectedClosingCashInHand;
}

// Production's own leftover carried into `date` (store handover for `date` itself NOT
// included): the last saved record's count (or expected closing), then walked forward
// through any unsaved days in between.
function productionCarryIntoDate(houseRecords: any[], data: ProductionCashData, productionHouseId: string, date: string): number {
  const prior = houseRecords
    .filter((r: any) => r.date < date)
    .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
  if (!prior) return 0;
  let carry = prior.actualCashInHand ?? prior.expectedClosingCashInHand ?? 0;
  for (let d = addDaysToDateString(prior.date, 1); d < date; d = addDaysToDateString(d, 1)) {
    carry = carryThroughUnsavedDay(carry, data, productionHouseId, d);
  }
  return carry;
}

async function cascadeRecomputeProductionCash(productionHouseId: string, fromDate: string): Promise<void> {
  try {
    const today = getTodayIST();
    if (fromDate > today) return;

    // getAllByPrefixWithRetry, NOT plain kv.getByPrefix - confirmed bug: kv.getByPrefix
    // silently truncates to Supabase/PostgREST's default 1000-row cap with no error, and
    // inventory: alone already has 3000+ rows (overhead: is close behind at ~900). A raw
    // kv.getByPrefix('inventory:') here returned an arbitrary ~1000-row slice that happened
    // to mostly miss a specific production house's specific day, undercounting its expenses
    // by thousands of rupees with no indication anything was wrong. GET /inventory and
    // GET /overheads already learned this lesson (see their own "paginated query" comments)
    // - this cascade just hadn't been updated to match.
    const [allProductionCash, allInventory, allOverheads, allFixedCosts, allTopups, allSales, allStores] = await Promise.all([
      getAllByPrefixWithRetry('production-cash:'),
      getAllByPrefixWithRetry('inventory:'),
      getAllByPrefixWithRetry('overhead:'),
      getAllByPrefixWithRetry('fixedcost:'),
      getAllByPrefixWithRetry('cash-topup:'),
      getAllByPrefixWithRetry('sales:'),
      kv.getByPrefix('store:'),
    ]);

    const houseRecords = (allProductionCash || []).filter((r: any) => r.productionHouseId === productionHouseId && r.date);
    const data: ProductionCashData = { allInventory, allOverheads, allFixedCosts, allTopups, allSales, allStores };

    // Production's OWN carried-forward leftover only (not the store handover - that's
    // looked up fresh per-day below via getStoreHandoverForDate, since it's new money
    // coming in each day, not part of production's own running balance). Anchor: the most
    // recent record strictly before fromDate - trust its actual count if one was entered,
    // otherwise its own (already-recomputed) expected closing - walked through any unsaved
    // days between it and fromDate.
    let ownCarryAnchor = productionCarryIntoDate(houseRecords, data, productionHouseId, fromDate);

    let cursor = fromDate;
    let updated = 0;
    while (cursor <= today) {
      const existing = houseRecords.find((r: any) => r.date === cursor);
      if (existing) {
        // manualOpeningOverride (only ever meaningful on the very first day this ledger
        // exists for a house - see POST /production-cash's handling) takes priority over
        // the computed opening for that specific date, so a cluster head's one-time "what's
        // physically counted right now" seed isn't immediately overwritten by a cascade run
        // from an earlier date.
        const storeHandover = getStoreHandoverForDate(allSales, allStores, productionHouseId, cursor);
        const openingBalance = typeof existing.manualOpeningOverride === 'number' ? existing.manualOpeningOverride : storeHandover + ownCarryAnchor;
        const { productionExpenses, cashTopupCredited, expectedClosingCashInHand } = computeProductionCashExpected(
          allInventory, allOverheads, allFixedCosts, allTopups, productionHouseId, cursor, openingBalance
        );

        const changed =
          Math.abs((existing.openingBalance ?? 0) - openingBalance) > 0.005 ||
          Math.abs((existing.cashTopupCredited ?? 0) - cashTopupCredited) > 0.005 ||
          Math.abs((existing.productionExpenses ?? 0) - productionExpenses) > 0.005 ||
          Math.abs((existing.expectedClosingCashInHand ?? 0) - expectedClosingCashInHand) > 0.005;

        if (changed) {
          const discrepancy = typeof existing.actualCashInHand === 'number' ? existing.actualCashInHand - expectedClosingCashInHand : existing.discrepancy ?? null;
          await kv.set(`production-cash:${productionHouseId}:${cursor}`, {
            ...existing, openingBalance, cashTopupCredited, productionExpenses, expectedClosingCashInHand, discrepancy,
          });
          updated++;
        }

        ownCarryAnchor = typeof existing.actualCashInHand === 'number' ? existing.actualCashInHand : expectedClosingCashInHand;
      } else {
        // No record for this date - nothing to save, but its handover, top-ups and expenses
        // still move the running balance (see carryThroughUnsavedDay).
        ownCarryAnchor = carryThroughUnsavedDay(ownCarryAnchor, data, productionHouseId, cursor);
      }
      cursor = addDaysToDateString(cursor, 1);
    }
    console.log(`Cascade production-cash recompute for house ${productionHouseId} from ${fromDate}: ${updated} record(s) updated`);
  } catch (error) {
    console.log('Error cascading production cash recompute:', error);
    // Non-fatal - matches cascadeRecomputePaytmBalances' own convention.
  }
}

// A store's actual cash-in-hand for a day is handed over to its linked production house the
// next morning and becomes part of that day's production opening balance (see
// getStoreHandoverForDate). So whenever a store's sales record is saved - its actual count may
// have just changed - the production-cash records from the following day forward must be
// recomputed too. Without this, the 18th's production opening stayed at the production's own
// leftover (3,700) after the store's 17th count (6,850) was saved, instead of the 10,550 both
// together actually hold. Non-fatal, like the other cascades.
async function cascadeProductionCashForStoreSale(storeId: string, date: string): Promise<void> {
  try {
    if (!storeId || !date) return;
    const stores = await kv.getByPrefix('store:');
    const productionHouseId = (stores || []).find((s: any) => s.id === storeId)?.productionHouseId;
    if (!productionHouseId) return;
    await cascadeRecomputeProductionCash(productionHouseId, addDaysToDateString(date, 1));
  } catch (error) {
    console.log('Error cascading production cash after a store sales save:', error);
  }
}

// A store expense can be paid out of a production house's cash in hand instead of the
// store's own (e.g. the store's electricity bill paid from production's spare cash): the
// cost stays the store's, only the cash comes off production's till. Only the cluster head
// picks this, and only for a cash-paid store expense. Anyone else's save, or a save that
// doesn't send the field at all, keeps whatever was already on the record.
function resolvePaidFromProductionHouseId(item: any, role: string | undefined, existing: any | null): string | null {
  const sentByClusterHead = role === 'cluster_head' && !!item && Object.prototype.hasOwnProperty.call(item, 'paidFromProductionHouseId');
  const picked = sentByClusterHead ? item.paidFromProductionHouseId : existing?.paidFromProductionHouseId;
  const isCashStoreExpense = item?.entityType !== 'production_house' && (item?.paymentMethod ?? 'cash') === 'cash';
  return picked && isCashStoreExpense ? String(picked) : null;
}

// Production houses whose cash in hand an expense moves: its own house for a production
// expense, the paying house for a store bill paid from production cash.
function productionHousesPayingFor(item: any): string[] {
  if (!item) return [];
  const houses = new Set<string>();
  if (item.entityType === 'production_house' && item.productionHouseId) houses.add(item.productionHouseId);
  if (item.paidFromProductionHouseId) houses.add(item.paidFromProductionHouseId);
  return [...houses];
}

// Adding, editing or deleting an expense never touched the production-cash records already
// saved for its day, so a late entry only showed up once someone re-saved that day's count.
// Recompute from the earliest affected date for every house the old or new version of the
// expense was paid from. Non-fatal, like the other cascades.
async function cascadeProductionCashForExpense(...versions: any[]): Promise<void> {
  const fromDateByHouse = new Map<string, string>();
  for (const version of versions) {
    if (!version?.date) continue;
    const from = version.date < PRODUCTION_CASH_GO_LIVE_DATE ? PRODUCTION_CASH_GO_LIVE_DATE : version.date;
    for (const house of productionHousesPayingFor(version)) {
      const current = fromDateByHouse.get(house);
      if (!current || from < current) fromDateByHouse.set(house, from);
    }
  }
  for (const [house, from] of fromDateByHouse) {
    await cascadeRecomputeProductionCash(house, from);
  }
}

// Tell the production incharge a store bill came out of their cash, so their count matches
// the lower expected figure instead of looking short.
async function notifyStoreBillPaidFromProductionCash(item: any, byName: string): Promise<void> {
  try {
    const house = item?.paidFromProductionHouseId;
    if (!house) return;
    const amount = Number(item.totalCost ?? item.amount ?? 0);
    const what = item.itemName || item.description || 'a store bill';
    const employees = await kv.getByPrefix('unified-employee:');
    const holders = employees.filter((e: any) => e.designation === 'production_incharge' && e.status !== 'inactive' && e.authUserId &&
      ((e.assignedProductionHouseIds || []).includes(house) || e.storeId === house));
    for (const holder of holders) {
      await notifyUser(
        holder.authUserId,
        'production_cash_store_bill',
        'Store bill paid from production cash',
        `${byName} paid ${what} (₹${amount.toFixed(2)}) for the store out of production cash on ${item.date}. It's taken off your expected cash for that day.`,
        item.id,
        item.date
      );
    }
  } catch (error) {
    console.error('Store bill saved but notifying production failed:', error);
  }
}

// ===== PRODUCTION CASH IN HAND =====
// Store Cash in Hand (sales: records) and Production Cash in Hand (these records) used to
// be one blended figure - a store incharge's physical count was checked against an
// "expected cash" that silently subtracted the linked production house's own spending too,
// even though the store incharge never touches that money. This is the production side's
// own ledger, reconciled by whoever actually holds and spends that cash (a production
// incharge, or an operations manager - see canReconcileProductionCash below), completely
// separate from the store's own reconciliation.
const PRODUCTION_CASH_GO_LIVE_DATE = '2026-08-21';

// Get a production house's cash-in-hand entry for one date (live-computed if nothing has
// been saved for that date yet, so the UI always has something to render), or a date range
// (only actually-saved records, for a future trend view).
app.get('/make-server-c2dd9b9d/production-cash', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const productionHouseId = c.req.query('productionHouseId');
    const date = c.req.query('date');
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!productionHouseId) {
      return c.json({ error: 'productionHouseId is required' }, 400);
    }

    const allRecords = (await getAllByPrefixWithRetry('production-cash:')).filter((r: any) => r.productionHouseId === productionHouseId);

    if (from && to) {
      return c.json({ entries: allRecords.filter((r: any) => r.date >= from && r.date <= to) });
    }

    if (!date) {
      return c.json({ error: 'date, or from+to, is required' }, 400);
    }

    const existing = allRecords.find((r: any) => r.date === date);
    if (existing) {
      return c.json({ entry: existing });
    }

    // Nothing saved for this date yet - live-compute what it WOULD be, same formula the
    // cascade uses: production's own carried-forward leftover (anchored on the last
    // actual/expected balance strictly before this date, walked through any unsaved days)
    // PLUS the linked store's actual cash-in-hand handed over the prior day (see
    // getStoreHandoverForDate above).
    // getAllByPrefixWithRetry, not plain kv.getByPrefix - see the cascade's own comment on
    // this exact bug (Supabase/PostgREST's silent 1000-row cap).
    const [allInventory, allOverheads, allFixedCosts, allTopups, allSales, allStores] = await Promise.all([
      getAllByPrefixWithRetry('inventory:'), getAllByPrefixWithRetry('overhead:'), getAllByPrefixWithRetry('fixedcost:'), getAllByPrefixWithRetry('cash-topup:'),
      getAllByPrefixWithRetry('sales:'), kv.getByPrefix('store:'),
    ]);
    const ownCarry = productionCarryIntoDate(allRecords, { allInventory, allOverheads, allFixedCosts, allTopups, allSales, allStores }, productionHouseId, date);
    const storeHandover = getStoreHandoverForDate(allSales, allStores, productionHouseId, date);
    const openingBalance = storeHandover + ownCarry;
    const { productionExpenses, cashTopupCredited, expectedClosingCashInHand } = computeProductionCashExpected(
      allInventory, allOverheads, allFixedCosts, allTopups, productionHouseId, date, openingBalance
    );

    return c.json({
      entry: null,
      live: { productionHouseId, date, openingBalance, cashTopupCredited, productionExpenses, expectedClosingCashInHand },
    });
  } catch (error) {
    console.log('Error fetching production cash entry:', error);
    return c.json({ error: 'Failed to fetch production cash entry' }, 500);
  }
});

// Save today's physical cash count for a production house. Mirrors the discrepancy-gating
// fix already applied to sales: records this session - a high discrepancy must NEVER
// auto-approve itself just because the submitter isn't in some specific role; approval is
// gated purely on whether the discrepancy itself is large enough to need a cluster head's
// sign-off, full stop.
app.post('/make-server-c2dd9b9d/production-cash', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    const isClusterHead = role === 'cluster_head';
    if (!isProductionIncharge && !isOperationsManager && !isClusterHead) {
      return c.json({ error: 'Only production incharges, operations managers, or cluster heads can reconcile production cash' }, 403);
    }

    const { productionHouseId, date, actualCashInHand, manualOpeningOverride } = await c.req.json();
    if (!productionHouseId || !date || typeof actualCashInHand !== 'number') {
      return c.json({ error: 'productionHouseId, date, and actualCashInHand are required' }, 400);
    }
    if (date < PRODUCTION_CASH_GO_LIVE_DATE) {
      return c.json({ error: `Production Cash in Hand tracking starts ${PRODUCTION_CASH_GO_LIVE_DATE} - earlier dates use the old combined store calculation` }, 400);
    }

    const allRecords = (await getAllByPrefixWithRetry('production-cash:')).filter((r: any) => r.productionHouseId === productionHouseId);
    const existing = allRecords.find((r: any) => r.date === date);

    // manualOpeningOverride is only ever meaningful on the very first day this ledger
    // exists for a house (a cluster head's one-time "what's physically counted right now"
    // seed) - accept it here but only apply it if there's genuinely no history yet, so a
    // later resubmission of the same day can't accidentally reset the anchor. Otherwise the
    // opening balance is production's own carried-forward leftover PLUS the linked store's
    // actual cash-in-hand handed over the prior day (see getStoreHandoverForDate above) -
    // this applies from day one, not just once history exists, since the store handover is
    // a real number even on the very first day (confirmed via a real worked example).
    const hasAnyPriorRecord = allRecords.some((r: any) => r.date < date);

    // getAllByPrefixWithRetry, not plain kv.getByPrefix - see the cascade's own comment on
    // this exact bug (Supabase/PostgREST's silent 1000-row cap).
    const [allInventory, allOverheads, allFixedCosts, allTopups, allSales, allStores] = await Promise.all([
      getAllByPrefixWithRetry('inventory:'), getAllByPrefixWithRetry('overhead:'), getAllByPrefixWithRetry('fixedcost:'), getAllByPrefixWithRetry('cash-topup:'),
      getAllByPrefixWithRetry('sales:'), kv.getByPrefix('store:'),
    ]);
    const ownCarry = productionCarryIntoDate(allRecords, { allInventory, allOverheads, allFixedCosts, allTopups, allSales, allStores }, productionHouseId, date);
    const storeHandover = getStoreHandoverForDate(allSales, allStores, productionHouseId, date);
    const openingBalance = !hasAnyPriorRecord && typeof manualOpeningOverride === 'number'
      ? manualOpeningOverride
      : storeHandover + ownCarry;
    const { productionExpenses, cashTopupCredited, expectedClosingCashInHand } = computeProductionCashExpected(
      allInventory, allOverheads, allFixedCosts, allTopups, productionHouseId, date, openingBalance
    );

    const discrepancy = actualCashInHand - expectedClosingCashInHand;
    const approvalRequired = Math.abs(discrepancy) > 200;
    const submittedBy = authResult.user.user_metadata?.employeeId || authResult.user.email;
    const submittedByName = authResult.user.user_metadata?.name || authResult.user.email;

    const id = existing?.id || `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const record = {
      id, productionHouseId, date,
      openingBalance, cashTopupCredited, productionExpenses, expectedClosingCashInHand,
      actualCashInHand, discrepancy,
      approvalRequired,
      approvalStatus: approvalRequired ? 'pending' : 'approved',
      approvedBy: approvalRequired ? null : submittedBy,
      approvedAt: approvalRequired ? null : getNowIST(),
      approvalRequested: existing?.approvalRequested || false,
      approvalRequestedAt: existing?.approvalRequestedAt || null,
      requestedCashInHand: existing?.requestedCashInHand ?? null,
      requestedOffset: existing?.requestedOffset ?? null,
      rejectedBy: null, rejectedAt: null, rejectionReason: null,
      ...(!hasAnyPriorRecord && typeof manualOpeningOverride === 'number' ? { manualOpeningOverride } : {}),
      createdBy: existing?.createdBy || submittedBy,
      createdByName: existing?.createdByName || submittedByName,
      // The real Supabase auth user id, kept separate from createdBy (a display-friendly
      // employeeId/email) specifically because notifyUser() needs the actual authUserId to
      // resolve a push-notification recipient - mirrors sales:'s own userId field, which
      // the sales approve/reject-discrepancy routes notify against, not its createdBy.
      createdByUserId: existing?.createdByUserId || authResult.user.id,
      createdAt: existing?.createdAt || getNowIST(),
      updatedAt: getNowIST(),
    };

    await kv.set(`production-cash:${productionHouseId}:${date}`, record);
    await cascadeRecomputeProductionCash(productionHouseId, date);

    if (approvalRequired) {
      const clusterHeads = await getAllClusterHeads();
      for (const clusterHead of clusterHeads) {
        if (clusterHead.authUserId) {
          await notifyUser(
            clusterHead.authUserId,
            'production_cash_discrepancy',
            'Production Cash Discrepancy',
            `${submittedByName} logged a ₹${Math.abs(discrepancy).toFixed(2)} production cash discrepancy for ${date}`,
            id,
            date
          );
        }
      }
    }

    return c.json({ success: true, entry: record });
  } catch (error) {
    console.log('Error saving production cash entry:', error);
    return c.json({ error: 'Failed to save production cash entry' }, 500);
  }
});

// ============ Out-of-stock log (store SOP ST-28) ============
// Whoever is billing at the store records each item that runs out: what, why, from when to
// when, and whether it was switched off on Zomato/Swiggy in Ciferon. One record per stock-out
// at `stock-out:{storeId}:{id}`. Store crew can only log for their own store; the store's
// production incharge hears about it straight away so more can be sent.
const STOCK_OUT_REASONS = ['sold_out', 'short_delivery', 'not_requested', 'quality', 'equipment', 'ingredient', 'other'];
const STOCK_OUT_REASON_LABELS: Record<string, string> = {
  sold_out: 'sold out', short_delivery: 'delivery short or late', not_requested: 'not requested enough',
  quality: 'bad quality', equipment: 'equipment down', ingredient: 'ingredient finished', other: 'other',
};

// Who is asking, and which store they belong to. The employee record is the reliable source
// for storeId/designation (auth metadata is missing them on some crew logins).
async function stockOutActor(authResult: any) {
  const meta = authResult.user.user_metadata || {};
  const employeeId = meta.employeeId || null;
  const employee = employeeId ? await kvWithRetry.get<any>(`unified-employee:${employeeId}`) : null;
  const role = meta.role;
  const designation = employee?.designation || meta.designation || null;
  return {
    employeeId: employeeId || authResult.user.email,
    name: employee?.name || meta.name || authResult.user.email,
    storeId: employee?.storeId || meta.storeId || null,
    isOversight: role === 'cluster_head' || (role === 'manager' && designation !== 'store_incharge') || role === 'audit',
    isStoreIncharge: designation === 'store_incharge',
  };
}

function cleanIso(value: any): string | null {
  if (!value || typeof value !== 'string') return null;
  const t = Date.parse(value);
  return Number.isNaN(t) ? null : new Date(t).toISOString();
}

app.get('/make-server-c2dd9b9d/stock-outs', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const storeId = c.req.query('storeId');
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!storeId) return c.json({ error: 'storeId is required' }, 400);
    const all = await kvWithRetry.getByPrefix<any>(`stock-out:${storeId}:`);
    // In range by IST start date; anything still open is always included.
    const istDay = (iso: string) => new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10);
    const entries = (all || [])
      .filter((e: any) => !e.endAt || ((!from || istDay(e.startAt) >= from) && (!to || istDay(e.startAt) <= to)))
      .sort((a: any, b: any) => (b.startAt || '').localeCompare(a.startAt || ''));
    return c.json({ entries });
  } catch (error: any) {
    console.error('Error fetching stock-outs:', error);
    return c.json({ error: error.message }, 500);
  }
});

app.post('/make-server-c2dd9b9d/stock-outs', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await stockOutActor(authResult);
    const body = await c.req.json();
    const storeId = String(body.storeId || '');
    if (!storeId) return c.json({ error: 'storeId is required' }, 400);
    if (!actor.isOversight && actor.storeId !== storeId) {
      return c.json({ error: 'You can only log stock-outs for your own store' }, 403);
    }
    const item = String(body.item || '').trim().slice(0, 80);
    const reason = String(body.reason || '');
    const reasonNote = String(body.reasonNote || '').trim().slice(0, 300);
    const startAt = cleanIso(body.startAt);
    const endAt = cleanIso(body.endAt);
    if (!item) return c.json({ error: 'Which item is out of stock?' }, 400);
    if (!STOCK_OUT_REASONS.includes(reason)) return c.json({ error: 'Pick a reason' }, 400);
    if (reason === 'other' && !reasonNote) return c.json({ error: 'Write why it ran out' }, 400);
    if (!startAt) return c.json({ error: 'Start time is required' }, 400);
    if (endAt && endAt < startAt) return c.json({ error: 'End time is before the start time' }, 400);

    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const entry = {
      id,
      storeId,
      item,
      category: ['momo', 'sauce', 'other'].includes(body.category) ? body.category : 'other',
      reason,
      reasonNote: reasonNote || undefined,
      startAt,
      endAt: endAt || null,
      offOnline: !!body.offOnline,
      backOnline: endAt ? !!body.backOnline : undefined,
      createdBy: actor.employeeId,
      createdByName: actor.name,
      endedByName: endAt ? actor.name : undefined,
      createdAt: now,
      updatedAt: now,
    };
    await kvWithRetry.set(`stock-out:${storeId}:${id}`, entry);

    // A live stock-out (not one logged after the fact) goes to the store incharge and, unless
    // the cause is the store's own equipment, to the production incharge who can send more.
    if (!endAt) {
      try {
        const store = await kvWithRetry.get<any>(`store:${storeId}`);
        const employees = await kvWithRetry.getByPrefix<any>('unified-employee:');
        const recipients = new Map<string, any>();
        const incharge = employees.find((e: any) => e.designation === 'store_incharge' && e.storeId === storeId && e.status !== 'inactive');
        if (incharge?.authUserId && incharge.employeeId !== actor.employeeId) recipients.set(incharge.authUserId, incharge);
        if (reason !== 'equipment') {
          employees
            .filter((e: any) => e.designation === 'production_incharge' && e.status !== 'inactive' && e.authUserId &&
              ((store?.productionHouseId && (e.assignedProductionHouseIds || []).includes(store.productionHouseId)) || e.storeId === storeId))
            .forEach((e: any) => recipients.set(e.authUserId, e));
        }
        const since = new Date(Date.parse(startAt) + 330 * 60000).toISOString().slice(11, 16);
        for (const authUserId of recipients.keys()) {
          await notifyUser(
            authUserId,
            'stock_out',
            `Out of stock: ${item}`,
            `${store?.name || 'The store'} has been out of ${item} since ${since} (${STOCK_OUT_REASON_LABELS[reason]}${reasonNote ? `: ${reasonNote}` : ''}). Logged by ${actor.name}.`,
            id,
            new Date(Date.parse(startAt) + 330 * 60000).toISOString().slice(0, 10)
          );
        }
      } catch (error) {
        console.error('Stock-out saved but notifying failed:', error);
      }
    }

    return c.json({ entry });
  } catch (error: any) {
    console.error('Error saving stock-out:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Edit a stock-out: mark it back in stock (endAt), or fix the item, reason or times.
app.put('/make-server-c2dd9b9d/stock-outs/:storeId/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await stockOutActor(authResult);
    const storeId = c.req.param('storeId');
    const id = c.req.param('id');
    if (!actor.isOversight && actor.storeId !== storeId) {
      return c.json({ error: 'You can only change stock-outs for your own store' }, 403);
    }
    const key = `stock-out:${storeId}:${id}`;
    const existing = await kvWithRetry.get<any>(key);
    if (!existing) return c.json({ error: 'Stock-out not found' }, 404);

    const body = await c.req.json();
    const next = { ...existing };
    if (typeof body.item === 'string' && body.item.trim()) next.item = body.item.trim().slice(0, 80);
    if (['momo', 'sauce', 'other'].includes(body.category)) next.category = body.category;
    if (body.reason !== undefined) {
      if (!STOCK_OUT_REASONS.includes(body.reason)) return c.json({ error: 'Pick a reason' }, 400);
      next.reason = body.reason;
    }
    if (body.reasonNote !== undefined) next.reasonNote = String(body.reasonNote || '').trim().slice(0, 300) || undefined;
    if (next.reason === 'other' && !next.reasonNote) return c.json({ error: 'Write why it ran out' }, 400);
    if (body.startAt !== undefined) {
      const s = cleanIso(body.startAt);
      if (!s) return c.json({ error: 'Start time is required' }, 400);
      next.startAt = s;
    }
    if (body.endAt !== undefined) {
      const e = body.endAt ? cleanIso(body.endAt) : null;
      if (body.endAt && !e) return c.json({ error: 'End time is not valid' }, 400);
      if (e && !existing.endAt) next.endedByName = actor.name;
      next.endAt = e;
    }
    if (body.offOnline !== undefined) next.offOnline = !!body.offOnline;
    if (body.backOnline !== undefined) next.backOnline = !!body.backOnline;
    if (next.endAt && next.endAt < next.startAt) return c.json({ error: 'End time is before the start time' }, 400);
    next.updatedAt = new Date().toISOString();
    await kvWithRetry.set(key, next);
    return c.json({ entry: next });
  } catch (error: any) {
    console.error('Error updating stock-out:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Remove an entry made by mistake - store incharge, operations manager or cluster head.
app.delete('/make-server-c2dd9b9d/stock-outs/:storeId/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await stockOutActor(authResult);
    const storeId = c.req.param('storeId');
    if (!actor.isOversight && !(actor.isStoreIncharge && actor.storeId === storeId)) {
      return c.json({ error: 'Only the store incharge or a manager can delete a stock-out' }, 403);
    }
    await kvWithRetry.del(`stock-out:${storeId}:${c.req.param('id')}`);
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting stock-out:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============ Stock Wastage (Store Momo Wastage, by piece) ============
// Daily wastage entry for a store, in pieces, per momo type - all 7 canonical types
// (MOMO_TYPES) including both Veg Kurkure and Chicken Kurkure. Requested 2026-08-30:
// tracked from this feature's launch forward only, no historical backfill - there's no
// reliable pre-existing wastage data to recover, same "clean cutover" rule used for the
// production ledger/cash-split features earlier this session.
app.get('/make-server-c2dd9b9d/stock-wastage', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const storeId = c.req.query('storeId');
    const date = c.req.query('date');
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!storeId) {
      return c.json({ error: 'storeId is required' }, 400);
    }

    const allRecords = (await getAllByPrefixWithRetry('stock-wastage:')).filter((r: any) => r.storeId === storeId);

    if (from && to) {
      return c.json({ entries: allRecords.filter((r: any) => r.date >= from && r.date <= to) });
    }
    if (date) {
      return c.json({ entry: allRecords.find((r: any) => r.date === date) || null });
    }
    return c.json({ entries: allRecords });
  } catch (error) {
    console.log('Error fetching stock wastage:', error);
    return c.json({ error: 'Failed to fetch stock wastage' }, 500);
  }
});

// Save/update a store's wastage entry for one date. Deterministic key
// (stock-wastage:{storeId}:{date}) so a resubmission for the same day corrects the
// existing record instead of creating a sibling duplicate - the same race-condition fix
// applied to pos-sync's own record IDs earlier this session.
app.post('/make-server-c2dd9b9d/stock-wastage', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isStoreIncharge = designation === 'store_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    const isClusterHead = role === 'cluster_head';
    const isOperationsManager = role === 'manager' && !isStoreIncharge && !isProductionIncharge;
    // Matches the frontend's canViewWorkflowSummary gate exactly - anyone who can see the
    // Production Request Workflow numbers can also view/log stock wastage, not just the
    // store's own incharge.
    if (!isStoreIncharge && !isClusterHead && !isProductionIncharge && !isOperationsManager) {
      return c.json({ error: 'Only store incharges, production incharges, operations managers, or cluster heads can log stock wastage' }, 403);
    }

    const { storeId, date, wastage, notes, reasons } = await c.req.json();
    if (!storeId || !date || !wastage || typeof wastage !== 'object') {
      return c.json({ error: 'storeId, date, and wastage are required' }, 400);
    }

    const key = `stock-wastage:${storeId}:${date}`;
    const existing = await kvWithRetry.get<any>(key);

    // Clamp to non-negative whole pieces and drop zero entries - a wastage count can't be
    // negative or fractional, and there's no need to persist "0 wasted" for every type.
    const cleanWastage: Record<string, number> = {};
    for (const [itemKey, value] of Object.entries(wastage)) {
      const n = Math.max(0, Math.round(Number(value) || 0));
      if (n > 0) cleanWastage[itemKey] = n;
    }

    // Pieces per SOP reason code (T, D, B, R, X, F, Q, P, S, O) for each type, sent by app
    // 1.15.17+. Older apps send none, which keeps whatever breakdown was saved before.
    let cleanReasons: Record<string, Record<string, number>> | undefined = existing?.reasons;
    if (reasons && typeof reasons === 'object') {
      cleanReasons = {};
      for (const [itemKey, byCode] of Object.entries(reasons as Record<string, any>)) {
        if (!byCode || typeof byCode !== 'object') continue;
        for (const [code, value] of Object.entries(byCode)) {
          const n = Math.max(0, Math.round(Number(value) || 0));
          if (n > 0) cleanReasons[itemKey] = { ...(cleanReasons[itemKey] || {}), [code]: n };
        }
      }
    }

    const submittedBy = authResult.user.user_metadata?.employeeId || authResult.user.email;
    const submittedByName = authResult.user.user_metadata?.name || authResult.user.email;

    const record = {
      id: existing?.id || key,
      storeId,
      date,
      wastage: cleanWastage,
      ...(cleanReasons ? { reasons: cleanReasons } : {}),
      notes: typeof notes === 'string' ? notes : (existing?.notes || ''),
      submittedBy,
      submittedByName,
      createdAt: existing?.createdAt || getNowIST(),
      updatedAt: getNowIST(),
    };

    await kvWithRetry.set(key, record);
    return c.json({ success: true, entry: record });
  } catch (error) {
    console.log('Error saving stock wastage:', error);
    return c.json({ error: 'Failed to save stock wastage' }, 500);
  }
});

// Request cluster-head approval for a high production-cash discrepancy - mirrors
// POST /sales/:id/request-approval exactly.
app.post('/make-server-c2dd9b9d/production-cash/:id/request-approval', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    if (!isProductionIncharge && !isOperationsManager) {
      return c.json({ error: 'Only production incharges or operations managers can request approval' }, 403);
    }

    const itemId = c.req.param('id');
    const { requestedCashInHand, requestedOffset } = await c.req.json();

    const allRecords = await kv.getByPrefix('production-cash:');
    const existing = allRecords.find((r: any) => r.id === itemId);
    if (!existing) {
      return c.json({ error: 'Production cash entry not found' }, 404);
    }

    const updatedItem = {
      ...existing,
      approvalRequested: true,
      approvalRequestedAt: new Date().toISOString(),
      requestedCashInHand, requestedOffset,
      rejectedBy: null, rejectedAt: null, rejectionReason: null,
    };
    await kv.set(`production-cash:${existing.productionHouseId}:${existing.date}`, updatedItem);

    const clusterHeads = await getAllClusterHeads();
    const requesterName = authResult.user.user_metadata?.name || authResult.user.email;
    for (const clusterHead of clusterHeads) {
      if (clusterHead.authUserId) {
        await notifyUser(
          clusterHead.authUserId,
          'production_cash_discrepancy_request',
          'Production Cash Discrepancy Approval Needed',
          `${requesterName} requests approval for a ₹${Math.abs(requestedOffset).toFixed(2)} production cash discrepancy on ${existing.date}`,
          itemId,
          existing.date
        );
      }
    }

    return c.json({ success: true, entry: updatedItem });
  } catch (error) {
    console.log('Error requesting production cash approval:', error);
    return c.json({ error: 'Failed to request approval' }, 500);
  }
});

// Approve/reject a production-cash discrepancy request (cluster head only) - mirrors
// POST /sales/:id/approve-discrepancy and /reject-discrepancy exactly.
app.post('/make-server-c2dd9b9d/production-cash/:id/approve-discrepancy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    if (authResult.user.user_metadata?.role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can approve discrepancies' }, 403);
    }

    const itemId = c.req.param('id');
    const allRecords = await kv.getByPrefix('production-cash:');
    const existing = allRecords.find((r: any) => r.id === itemId);
    if (!existing) {
      return c.json({ error: 'Production cash entry not found' }, 404);
    }
    if (!existing.approvalRequested) {
      return c.json({ error: 'No approval request found' }, 400);
    }

    const approvedItem = {
      ...existing,
      actualCashInHand: existing.requestedCashInHand,
      discrepancy: existing.requestedOffset,
      approvalRequired: false,
      approvalStatus: 'approved',
      approvedBy: authResult.user.email,
      approvedAt: getNowIST(),
      approvalRequested: false,
      requestedCashInHand: null, requestedOffset: null,
    };
    await kv.set(`production-cash:${existing.productionHouseId}:${existing.date}`, approvedItem);
    await cascadeRecomputeProductionCash(existing.productionHouseId, existing.date);

    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    await notifyUser(
      existing.createdByUserId,
      'production_cash_discrepancy_approved',
      'Production Cash Discrepancy Approved ✓',
      `${clusterHeadName} approved your production cash discrepancy of ₹${Math.abs(existing.requestedOffset).toFixed(2)} for ${existing.date}`,
      itemId,
      existing.date
    );

    return c.json({ success: true, entry: approvedItem });
  } catch (error) {
    console.log('Error approving production cash discrepancy:', error);
    return c.json({ error: 'Failed to approve discrepancy' }, 500);
  }
});

app.post('/make-server-c2dd9b9d/production-cash/:id/reject-discrepancy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    if (authResult.user.user_metadata?.role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can reject discrepancies' }, 403);
    }

    const itemId = c.req.param('id');
    const { reason } = await c.req.json();
    const allRecords = await kv.getByPrefix('production-cash:');
    const existing = allRecords.find((r: any) => r.id === itemId);
    if (!existing) {
      return c.json({ error: 'Production cash entry not found' }, 404);
    }
    if (!existing.approvalRequested) {
      return c.json({ error: 'No approval request found' }, 400);
    }

    const rejectedItem = {
      ...existing,
      approvalRequested: false,
      rejectedBy: authResult.user.email,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason,
      requestedCashInHand: null, requestedOffset: null,
    };
    await kv.set(`production-cash:${existing.productionHouseId}:${existing.date}`, rejectedItem);

    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    await notifyUser(
      existing.createdByUserId,
      'production_cash_discrepancy_rejected',
      'Production Cash Discrepancy Rejected ✗',
      `${clusterHeadName} rejected your production cash discrepancy request for ${existing.date}. Reason: ${reason}.`,
      itemId,
      existing.date
    );

    return c.json({ success: true, entry: rejectedItem });
  } catch (error) {
    console.log('Error rejecting production cash discrepancy:', error);
    return c.json({ error: 'Failed to reject discrepancy' }, 500);
  }
});

// ===== PRODUCTION LEDGER (dough/stuffing/batter/coating carry-forward) =====
// Store/Production Cash (above) solved the money side of the same problem: dough,
// stuffing, batter and coating used to be write-only numbers entered fresh every day on a
// `production:` record, with no shared pool and no leftover carried forward to tomorrow.
// This is the raw-stock equivalent, same cascade-recompute-forward architecture as Paytm
// balances and Production Cash, generalized across several named pools instead of one
// number. `production:` itself (the finished-pieces/wastage/sauces record) is untouched -
// this is a second, parallel record.
const PRODUCTION_LEDGER_GO_LIVE_DATE = '2026-08-23';
// No day's dough, stuffing, batter or coating comes near 100 kg, so a bigger figure is grams
// typed in a kg box (seven ledger entries by Oct 2026, corrected 28 Oct). Refused, not saved.
const LEDGER_MAX_KG = 100;
function ledgerGramsError(values: any[]): string | null {
  const big = values.map((v) => Number(v) || 0).find((v) => v > LEDGER_MAX_KG);
  return big === undefined ? null : `${big} kg is more than a day's production - it looks like grams. Type kilograms: ${big / 1000} for ${big} g.`;
}

// One pool id per row of a production-ledger record: the two global pools ('dough',
// 'batter', shared across every momo type in that group) plus one per-type pool per momo
// type ('stuffing:chicken', 'coating:vegKurkure', ...), plus one OPTIONAL dedicated
// global-field pool per momo type ('dough:cheeseCorn', 'batter:chickenKurkure', ...) for
// the rare batch that doesn't draw from the shared pool at all (e.g. a momo type made with
// its own separately-mixed dough). Almost always sits at 0 - only appears in the UI when
// actually used (see the isFirstEverDay/EndOfDayCloseForm non-trivial-pool filter) - but is
// tracked here unconditionally so carry-forward is never silently lost for a house that
// does use one. Derived from the canonical MOMO_TYPES list (momoTypes.ts) so a new momo
// type automatically gets its own pools with nothing else to update here.
const ALL_POOL_IDS: string[] = [
  ...GLOBAL_POOLS,
  ...PRODUCTION_MOMO_TYPES.map((t) => `${t.perTypePoolField}:${t.inventoryKey}`),
  ...PRODUCTION_MOMO_TYPES.map((t) => `${t.globalPoolField}:${t.inventoryKey}`),
];

// Sauces are counted with the kitchen stock in the morning and at night (owner, 31 Oct 2026: "morning
// stock count for dough, sauces or batter ... and what is left in dough and stuffing and batter or
// sauces"). Litres, soup premix kg. Not pools: what's made comes from the day's production entry,
// so a closed day keeps them apart as sauceLeft.
const SAUCE_IDS: string[] = ['panfriedSauce', 'chilliChickenSauce', 'spicyKoreanSauce', 'hotGarlicSauce', 'tandooriSauce', 'soupPremix', 'greenMayoChutney', 'spicyRedChutney'].map((k) => `sauce:${k}`);

function emptyPoolState() {
  return { opening: 0, prepared: 0, closingActual: null as number | null, wastage: null as number | null, wastageOverride: null as number | null };
}

// Sums every production-ledger-item logged for a house/date into the 'prepared' figure
// per pool. Two sentinel momoKeys ('GLOBAL_DOUGH'/'GLOBAL_BATTER') represent a direct log
// of the shared pool itself, with no momo type attached - the normal way dough/batter is
// now logged (once for the day, not re-entered on every batch). For a real momo-type item,
// globalPoolQty means "dedicated dough/batter for JUST this type" (only present when the
// "Unique dough for this?" toggle was used) and routes to that type's own pool instead of
// the shared one; perTypePoolQty (stuffing/coating) always accumulates within its own type.
// Only cheese corn has a dough of its own (owner, 31 Oct 2026: "corn cheese dough is different from
// the rest"). From 30 Oct any other type's "own" dough or batter is the shared one (30 Oct's 9 kg
// went under chicken by a tick-box; the app no longer offers it).
const OWN_DOUGH_TYPES = new Set(['cheeseCorn']);
const OWN_DOUGH_ONLY_FROM = '2026-10-30';

function aggregatePreparedByPool(items: any[]): Record<string, number> {
  const prepared: Record<string, number> = {};
  for (const id of ALL_POOL_IDS) prepared[id] = 0;
  for (const item of items || []) {
    if (item.momoKey === 'GLOBAL_DOUGH') { prepared['dough'] += item.globalPoolQty || 0; continue; }
    if (item.momoKey === 'GLOBAL_BATTER') { prepared['batter'] += item.globalPoolQty || 0; continue; }
    const momoType = PRODUCTION_MOMO_TYPES.find((t) => t.key === item.momoKey);
    if (!momoType) continue;
    if (item.globalPoolQty) {
      const shared = String(item.date || '') >= OWN_DOUGH_ONLY_FROM && !OWN_DOUGH_TYPES.has(momoType.inventoryKey);
      const poolId = shared ? momoType.globalPoolField : `${momoType.globalPoolField}:${momoType.inventoryKey}`;
      prepared[poolId] += item.globalPoolQty;
    }
    const perTypePoolId = `${momoType.perTypePoolField}:${momoType.inventoryKey}`;
    prepared[perTypePoolId] += item.perTypePoolQty || 0;
  }
  return prepared;
}

// Opening balance per pool for `date`, anchored on the most recent PRIOR day's ledger
// record for this house - same "trust the last real count, else pass the estimate
// through" rule as every other cascade this session. A pool's anchor is its
// closingActual when that prior day was actually closed, otherwise opening+prepared
// (nothing consumed assumed - without a close there's no reported figure for what was
// actually used that day). No prior record at all anchors at 0.
// The day's morning weigh-in (production-morning:{house}:{date}, owner 29 Oct 2026) wins over
// anything carried: what was weighed is what the day starts with, so an uncounted night can't
// carry a stale figure forward for weeks (13 Oct's dough was still "there" on 29 Oct).
function computeLedgerOpening(houseLedgerRecords: any[], date: string, mornings: Record<string, any> = {}): Record<string, number> {
  const priorRecord = houseLedgerRecords
    .filter((r: any) => r.date < date)
    .sort((a: any, b: any) => b.date.localeCompare(a.date))[0];
  const opening: Record<string, number> = {};
  const weighed = mornings[date]?.counts || {};
  for (const id of ALL_POOL_IDS) {
    const priorPool = priorRecord?.pools?.[id];
    opening[id] = typeof weighed[id] === 'number' ? weighed[id] : priorPool
      ? (typeof priorPool.closingActual === 'number' ? priorPool.closingActual : (priorPool.opening || 0) + (priorPool.prepared || 0))
      : 0;
  }
  return opening;
}

// When each item was last weighed before `date` (a night count, or a morning weigh-in), so the
// morning screen can say "counted last night" or "last weighed 17 Oct".
function lastCountedBefore(houseRecords: any[], mornings: Record<string, any>, date: string) {
  const out: Record<string, { date: string; kg: number; when: 'night' | 'morning' }> = {};
  const seen = (id: string, d: string, kg: number, when: 'night' | 'morning') => {
    const cur = out[id];
    if (!cur || d > cur.date || (d === cur.date && when === 'night')) out[id] = { date: d, kg, when };
  };
  for (const r of houseRecords) {
    if (r.date >= date) continue;
    for (const id of ALL_POOL_IDS) if (typeof r.pools?.[id]?.closingActual === 'number') seen(id, r.date, r.pools[id].closingActual, 'night');
    for (const [id, left] of Object.entries(r.sauceLeft || {})) if (typeof left === 'number') seen(id, r.date, left, 'night');
  }
  for (const [d, m] of Object.entries(mornings)) {
    if (d >= date) continue;
    for (const [id, kg] of Object.entries(m?.counts || {})) if (typeof kg === 'number') seen(id, d, kg, 'morning');
  }
  return out;
}

// One production house's closed days and logged items, read by key prefix
// (production-ledger:{house}:{date}, production-ledger-item:{house}:{date}:{id}) - just one
// day's items when itemDate is given - and paginated. The plain prefix read of every house's
// rows stops at 1000, after which logged items and closed days silently dropped out of the
// totals and openings.
async function getHouseLedger(productionHouseId: string, itemDate?: string): Promise<{ houseRecords: any[]; houseItems: any[]; houseMornings: Record<string, any> }> {
  const [records, items, mornings] = await Promise.all([
    getAllByPrefixWithRetry(`production-ledger:${productionHouseId}:`),
    getAllByPrefixWithRetry(`production-ledger-item:${productionHouseId}:${itemDate ? `${itemDate}:` : ''}`),
    getAllByPrefixWithRetry(`production-morning:${productionHouseId}:`),
  ]);
  const houseMornings: Record<string, any> = {};
  for (const m of mornings || []) if (m?.date && m.productionHouseId === productionHouseId) houseMornings[m.date] = m;
  return {
    houseRecords: records.filter((r: any) => r.productionHouseId === productionHouseId),
    houseItems: items.filter((i: any) => i.productionHouseId === productionHouseId && (!itemDate || i.date === itemDate)),
    houseMornings,
  };
}

async function cascadeRecomputeProductionLedger(productionHouseId: string, fromDate: string): Promise<void> {
  try {
    const today = getTodayIST();
    if (fromDate > today) return;

    const { houseRecords, houseItems, houseMornings } = await getHouseLedger(productionHouseId);

    let cursor = fromDate;
    let updated = 0;
    while (cursor <= today) {
      const existing = houseRecords.find((r: any) => r.date === cursor);
      if (existing) {
        const opening = computeLedgerOpening(houseRecords, cursor, houseMornings);
        const prepared = aggregatePreparedByPool(houseItems.filter((i: any) => i.date === cursor));

        const newPools: Record<string, any> = {};
        let changed = false;
        for (const id of ALL_POOL_IDS) {
          const prevPool = existing.pools?.[id] || emptyPoolState();
          const closingActual = typeof prevPool.closingActual === 'number' ? prevPool.closingActual : null;
          // A confirmed wastage override sticks through this recompute even if opening/
          // prepared just changed (a backdated correction) - see the close-day route's own
          // comment on why. Only falls back to the formula when nobody ever overrode it.
          const wastageOverride = typeof prevPool.wastageOverride === 'number' ? prevPool.wastageOverride : null;
          const wastage = typeof wastageOverride === 'number'
            ? wastageOverride
            : (typeof closingActual === 'number' ? (opening[id] + prepared[id] - closingActual) : null);
          newPools[id] = { opening: opening[id], prepared: prepared[id], closingActual, wastage, wastageOverride };
          if (
            Math.abs((prevPool.opening || 0) - opening[id]) > 0.005 ||
            Math.abs((prevPool.prepared || 0) - prepared[id]) > 0.005 ||
            Math.abs((prevPool.wastage ?? 0) - (wastage ?? 0)) > 0.005
          ) {
            changed = true;
          }
        }

        if (changed) {
          const updatedRecord = { ...existing, pools: newPools };
          await kv.set(`production-ledger:${productionHouseId}:${cursor}`, updatedRecord);
          // Keep the in-memory copy fresh so the NEXT iteration's computeLedgerOpening
          // (which reads houseRecords) sees this day's just-recomputed pools, not stale
          // ones - otherwise every day after the first change would anchor on stale data.
          const idx = houseRecords.findIndex((r: any) => r.date === cursor);
          if (idx >= 0) houseRecords[idx] = updatedRecord;
          updated++;
        }
      }
      // No record for this date - nothing to recompute, matches every other cascade this
      // session (a day nobody interacted with isn't fabricated).
      cursor = addDaysToDateString(cursor, 1);
    }
    console.log(`Cascade production-ledger recompute for house ${productionHouseId} from ${fromDate}: ${updated} record(s) updated`);
  } catch (error) {
    console.log('Error cascading production ledger recompute:', error);
    // Non-fatal, same convention as every other cascade this session.
  }
}

// ============ Weekly Production Goal ============
// A cluster head/operations manager sets a per-momo-type piece target for one calendar
// week (Monday-start); progress is computed live from the same `production:` records'
// .final counts everything else already reads (see ProductionData type), summed from that
// week's Monday through whichever date is being viewed - not a separate tracked number
// that could drift out of sync with what production actually reported.
app.get('/make-server-c2dd9b9d/production-weekly-goal', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  try {
    const productionHouseId = c.req.query('productionHouseId');
    const weekStart = c.req.query('weekStart'); // YYYY-MM-DD, must be a Monday
    if (!productionHouseId || !weekStart) {
      return c.json({ error: 'productionHouseId and weekStart are required' }, 400);
    }
    const goal = await kvWithRetry.get<any>(`production-weekly-goal:${productionHouseId}:${weekStart}`);
    return c.json({ goal: goal || null });
  } catch (error) {
    console.log('Error fetching production weekly goal:', error);
    return c.json({ error: 'Failed to fetch production weekly goal' }, 500);
  }
});

app.post('/make-server-c2dd9b9d/production-weekly-goal', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isClusterHead = role === 'cluster_head';
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (!isClusterHead && !isOperationsManager) {
      return c.json({ error: 'Only cluster heads or operations managers can set the weekly production goal' }, 403);
    }

    const { productionHouseId, weekStart, goals } = await c.req.json();
    if (!productionHouseId || !weekStart || !goals || typeof goals !== 'object') {
      return c.json({ error: 'productionHouseId, weekStart, and goals are required' }, 400);
    }
    // weekStart must actually be a Monday - a goal keyed to the wrong day would silently
    // never match the week the frontend looks it up under.
    const weekday = new Date(weekStart + 'T00:00:00Z').getUTCDay(); // 0=Sun..6=Sat
    if (weekday !== 1) {
      return c.json({ error: 'weekStart must be a Monday (YYYY-MM-DD)' }, 400);
    }

    const key = `production-weekly-goal:${productionHouseId}:${weekStart}`;
    const existing = await kvWithRetry.get<any>(key);
    const cleanGoals: Record<string, number> = {};
    for (const t of PRODUCTION_MOMO_TYPES) {
      const n = Math.max(0, Math.round(Number(goals[t.key]) || 0));
      if (n > 0) cleanGoals[t.key] = n;
    }

    const submittedBy = authResult.user.user_metadata?.employeeId || authResult.user.email;
    const submittedByName = authResult.user.user_metadata?.name || authResult.user.email;
    const record = {
      id: existing?.id || key,
      productionHouseId,
      weekStart,
      goals: cleanGoals,
      setBy: submittedBy,
      setByName: submittedByName,
      createdAt: existing?.createdAt || getNowIST(),
      updatedAt: getNowIST(),
    };
    await kvWithRetry.set(key, record);
    return c.json({ success: true, goal: record });
  } catch (error) {
    console.log('Error saving production weekly goal:', error);
    return c.json({ error: 'Failed to save production weekly goal' }, 500);
  }
});

// Get a production house's ledger for one date (persisted record if it's been closed at
// least once, else a live-computed preview - never persisted) or a date range (only
// actually-saved records, for Analytics).
app.get('/make-server-c2dd9b9d/production-ledger', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const productionHouseId = await canonicalProductionHouseId(c.req.query('productionHouseId'));
    const date = c.req.query('date');
    const from = c.req.query('from');
    const to = c.req.query('to');
    if (!productionHouseId) {
      return c.json({ error: 'productionHouseId is required' }, 400);
    }

    if (from && to) {
      const records = await getAllByPrefixWithRetry(`production-ledger:${productionHouseId}:`);
      return c.json({ entries: records.filter((r: any) => r.productionHouseId === productionHouseId && r.date >= from && r.date <= to) });
    }

    if (!date) {
      return c.json({ error: 'date, or from+to, is required' }, 400);
    }

    const { houseRecords, houseItems, houseMornings } = await getHouseLedger(productionHouseId, date);
    const todaysItems = houseItems
      .sort((a: any, b: any) => (a.loggedAt || '').localeCompare(b.loggedAt || ''));
    const existing = houseRecords.find((r: any) => r.date === date);
    // The morning weigh-in and when each item was last weighed (the guided day, owner 29 Oct 2026).
    const morning = houseMornings[date] || null;
    const lastCounted = lastCountedBefore(houseRecords, houseMornings, date);
    // Whether this house has ever closed a day strictly before `date` - the frontend uses
    // this to decide whether the one-time manual opening override is offered at all (it's
    // only ever meaningful on the very first day, same rule the close endpoint enforces).
    const hasAnyPriorRecord = houseRecords.some((r: any) => r.date < date);

    if (existing) {
      return c.json({ entry: existing, items: todaysItems, hasAnyPriorRecord, morning, lastCounted });
    }

    // Nothing closed yet for this date - live-compute opening + prepared-so-far, same
    // style as GET /production-cash's own live-preview branch. Never persisted.
    const opening = computeLedgerOpening(houseRecords, date, houseMornings);
    const prepared = aggregatePreparedByPool(todaysItems);
    const pools: Record<string, any> = {};
    for (const id of ALL_POOL_IDS) {
      pools[id] = { opening: opening[id], prepared: prepared[id], closingActual: null, wastage: null };
    }

    return c.json({ entry: null, live: { productionHouseId, date, pools }, items: todaysItems, hasAnyPriorRecord, morning, lastCounted });
  } catch (error) {
    console.log('Error fetching production ledger:', error);
    return c.json({ error: 'Failed to fetch production ledger' }, 500);
  }
});

// Log one prepared line item (a momo type + how much of its global/per-type pool was
// prepared for it just now). Eager-persist per item, not batched into one big form
// submit, so a shift's entries survive an early tab close - same pattern as the rest of
// this app.
app.post('/make-server-c2dd9b9d/production-ledger-item', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    if (!isProductionIncharge && !isOperationsManager) {
      return c.json({ error: 'Only production incharges or operations managers can log production' }, 403);
    }

    const { productionHouseId: rawHouseId, date, momoKey, globalPoolQty, perTypePoolQty, withLeftover: rawWithLeftover } = await c.req.json();
    const productionHouseId = await canonicalProductionHouseId(rawHouseId);
    if (!productionHouseId || !date || !momoKey) {
      return c.json({ error: 'productionHouseId, date, and momoKey are required' }, 400);
    }
    if (date < PRODUCTION_LEDGER_GO_LIVE_DATE) {
      return c.json({ error: `Production ledger tracking starts ${PRODUCTION_LEDGER_GO_LIVE_DATE}` }, 400);
    }
    const isSentinel = momoKey === 'GLOBAL_DOUGH' || momoKey === 'GLOBAL_BATTER';
    const momoType = isSentinel ? null : PRODUCTION_MOMO_TYPES.find((t) => t.key === momoKey);
    if (!isSentinel && !momoType) {
      return c.json({ error: 'Unknown momo type' }, 400);
    }
    const gramsError = ledgerGramsError([globalPoolQty, perTypePoolQty]);
    if (gramsError) return c.json({ error: gramsError }, 400);

    // Stuffing or coating made while yesterday's was still there needs a reason (owner, 29 Oct
    // 2026: "why so much stuffing was prepared even when there was stuffing left"), and goes to
    // the operations managers and the owner straight away.
    const poolId = momoType ? `${momoType.perTypePoolField}:${momoType.inventoryKey}` : null;
    let withLeftover: any = null;
    let dayItems: any[] = [];
    if (poolId && Number(perTypePoolQty) > 0) {
      const { houseRecords, houseItems, houseMornings } = await getHouseLedger(productionHouseId, date);
      dayItems = houseItems;
      const openingKg = computeLedgerOpening(houseRecords, date, houseMornings)[poolId] || 0;
      if (openingKg >= LEFTOVER_REASON_MIN_KG) {
        const clean = cleanWithLeftover(rawWithLeftover);
        if (clean.error) return c.json({ error: clean.error, needsLeftoverReason: true, openingKg }, 400);
        withLeftover = { ...clean.value, openingKg: Math.round(openingKg * 100) / 100 };
      }
    }

    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const loggedBy = authResult.user.user_metadata?.employeeId || authResult.user.email;
    const loggedByName = authResult.user.user_metadata?.name || authResult.user.email;
    const item = {
      id, productionHouseId, date, momoKey,
      globalPoolQty: globalPoolQty || 0,
      perTypePoolQty: perTypePoolQty || 0,
      ...(withLeftover ? { withLeftover } : {}),
      loggedBy, loggedByName, loggedByUserId: authResult.user.id,
      loggedAt: getNowIST(),
    };
    await kv.set(`production-ledger-item:${productionHouseId}:${date}:${id}`, item);
    if (withLeftover) {
      const made = [...dayItems, item].filter((x: any) => x?.withLeftover).map((x: any) => {
        const t = PRODUCTION_MOMO_TYPES.find((m) => m.key === x.momoKey)!;
        const [h, m] = String(x.loggedAt).slice(11, 16).split(':').map(Number);
        return { pool: `${t.perTypePoolField}:${t.inventoryKey}`, kg: Number(x.perTypePoolQty) || 0, openingKg: x.withLeftover.openingKg, at: `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'pm' : 'am'}`, by: x.loggedByName || 'Someone', withLeftover: x.withLeftover };
      });
      await afterResponse('Made with leftover check', () => flagLedgerDay(expenseReviewDeps,
        { key: `production-ledger:${productionHouseId}:${date}`, id: `${productionHouseId}-${date}`, date, house: productionHouseId, loggedBy: loggedByName },
        ['madeWithLeftover'],
        [{ kind: 'madeWithLeftover', title: 'Stuffing made while yesterday\'s was there', message: withLeftoverLines(made).join(' ') }]));
    }

    // Only refreshes anything if this date has already been closed once (e.g. logging
    // something forgotten after the fact) - a normal same-day entry has no record yet, so
    // the cascade correctly no-ops and GET computes the live total on demand instead.
    await cascadeRecomputeProductionLedger(productionHouseId, date);

    return c.json({ success: true, item });
  } catch (error) {
    console.log('Error logging production ledger item:', error);
    return c.json({ error: 'Failed to log production item' }, 500);
  }
});

app.put('/make-server-c2dd9b9d/production-ledger-item/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    if (!isProductionIncharge && !isOperationsManager) {
      return c.json({ error: 'Only production incharges or operations managers can edit production items' }, 403);
    }

    const itemId = c.req.param('id');
    // Paginated - the plain prefix read stops at 1000 rows, so items past that were "not found".
    const allItems = await getAllByPrefixWithRetry('production-ledger-item:');
    const existing = allItems.find((i: any) => i.id === itemId);
    if (!existing) {
      return c.json({ error: 'Production ledger item not found' }, 404);
    }

    const { globalPoolQty, perTypePoolQty } = await c.req.json();
    const gramsError = ledgerGramsError([globalPoolQty, perTypePoolQty]);
    if (gramsError) return c.json({ error: gramsError }, 400);
    const updated = {
      ...existing,
      globalPoolQty: typeof globalPoolQty === 'number' ? globalPoolQty : existing.globalPoolQty,
      perTypePoolQty: typeof perTypePoolQty === 'number' ? perTypePoolQty : existing.perTypePoolQty,
      updatedAt: getNowIST(),
    };
    await kv.set(`production-ledger-item:${existing.productionHouseId}:${existing.date}:${existing.id}`, updated);
    // Backdated edits (or same-day, harmlessly) ripple forward - a past day's prepared
    // total changing must not leave every later day's opening balance silently stale.
    await cascadeRecomputeProductionLedger(existing.productionHouseId, existing.date);

    return c.json({ success: true, item: updated });
  } catch (error) {
    console.log('Error updating production ledger item:', error);
    return c.json({ error: 'Failed to update production item' }, 500);
  }
});

app.delete('/make-server-c2dd9b9d/production-ledger-item/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    if (!isProductionIncharge && !isOperationsManager) {
      return c.json({ error: 'Only production incharges or operations managers can remove production items' }, 403);
    }

    const itemId = c.req.param('id');
    // Paginated - the plain prefix read stops at 1000 rows, so items past that were "not found".
    const allItems = await getAllByPrefixWithRetry('production-ledger-item:');
    const existing = allItems.find((i: any) => i.id === itemId);
    if (!existing) {
      return c.json({ error: 'Production ledger item not found' }, 404);
    }

    await kv.del(`production-ledger-item:${existing.productionHouseId}:${existing.date}:${existing.id}`);
    await cascadeRecomputeProductionLedger(existing.productionHouseId, existing.date);

    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting production ledger item:', error);
    return c.json({ error: 'Failed to delete production item' }, 500);
  }
});

// ---- Why stuffing was left over (owner, 28 Oct 2026) ----
// When the day closes with stuffing or coating left over, the incharge says why: a power cut
// (from when to when), a late start (when work began, who was late, why, and whether that was
// genuine), a break that ran past its hour (who, about how long, why, genuine - breaks themselves
// aren't tracked, owner 28 Oct 2026), a machine breakdown (which machine, down from when to when, what was used instead -
// raising a repair alarm, repairs.ts), fewer orders, made ahead for tomorrow, short of staff or
// something else. Kept on the day's ledger record as leftoverReport.
const LEFTOVER_REASON_MIN_KG = 0.5; // the app asks for a reason from this much stuffing/coating left
// Owner, 29 Oct 2026 ("Over time couldnt be a reason there should be a lot of checklist"): what
// went wrong in the kitchen itself, a plan for the leftover, and "other" only with a full sentence.
const LEFTOVER_KINDS = ['over_prepared', 'old_not_used', 'slow_folding', 'dough_problem', 'power_cut', 'late_start', 'long_break', 'machine', 'low_demand', 'planned', 'short_staff', 'other'];
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
const leftoverKgOf = (pools: Record<string, any>) => Object.entries(pools || {})
  .filter(([id, p]) => /^(stuffing|coating):/.test(id) && typeof p?.closingActual === 'number')
  .reduce((sum, [, p]) => sum + Math.max(0, p.closingActual), 0);

// Active staff who work at a production house (a production person's storeId is sometimes the
// store that house supplies).
async function houseStaff(productionHouseId: string): Promise<any[]> {
  const [employees, stores] = await Promise.all([getAllByPrefixWithRetry('unified-employee:'), kv.getByPrefix('store:')]);
  const storeHouse = new Map((stores || []).filter((st: any) => st?.id).map((st: any) => [String(st.id), String(st.productionHouseId || '')]));
  return (employees || []).filter((e: any) => {
    if (!e?.employeeId || e.status === 'inactive' || ['cluster_head', 'audit'].includes(e.role) || e.designation === 'rider') return false;
    const ids = [e.storeId, e.productionHouseId, ...(e.assignedProductionHouseIds || []), ...(e.assignedStoreIds || [])].filter(Boolean).map(String);
    if (ids.includes(productionHouseId)) return true;
    const productionPerson = e.department === 'production' || /^production_/.test(String(e.designation || ''));
    return productionPerson && ids.some((id) => storeHouse.get(id) === productionHouseId);
  });
}

// Checks and tidies a leftover report from the app. Returns an error message for the first problem.
function cleanLeftoverReport(raw: any, staff: any[]): { report?: any; error?: string } {
  const reasons = Array.isArray(raw?.reasons) ? raw.reasons : null;
  if (!reasons || !reasons.length) return { error: 'Say why stuffing was left over' };
  const names = new Map(staff.map((e: any) => [String(e.employeeId), String(e.name || e.employeeId)]));
  const text = (v: any, max = 300) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const people = (v: any) => (Array.isArray(v) ? [...new Set(v.map(String))].filter((id) => names.has(id)).slice(0, 12).map((id) => ({ id, name: names.get(id)! })) : []);
  const out: any[] = [];
  for (const x of reasons.slice(0, LEFTOVER_KINDS.length)) {
    const kind = String(x?.kind || '');
    if (!LEFTOVER_KINDS.includes(kind) || out.some((o) => o.kind === kind)) continue;
    if (kind === 'power_cut') {
      const periods = (Array.isArray(x.periods) ? x.periods : []).slice(0, 3)
        .map((pd: any) => ({ from: String(pd?.from || ''), to: String(pd?.to || '') }))
        .filter((pd: any) => HHMM.test(pd.from) && HHMM.test(pd.to));
      if (!periods.length) return { error: 'Power cut: give the time it went and came back' };
      if (periods.some((pd: any) => pd.from >= pd.to)) return { error: 'Power cut: the power must come back after it went' };
      out.push({ kind, periods, note: text(x.note) });
    } else if (kind === 'long_break') {
      // One entry per person who went over (several people can), each with their own reason.
      const entries: any[] = [];
      for (const en of (Array.isArray(x.entries) ? x.entries : []).slice(0, 12)) {
        const id = en?.personId ? String(en.personId) : null;
        if (id && !names.has(id)) continue;
        const name = id ? names.get(id)! : '';
        const why = text(en?.why);
        if (why.length < 3) return { error: `Long break${name ? ` (${name})` : ''}: say why it went past the hour` };
        const genuine = ['yes', 'no', 'unsure'].includes(en?.genuine) ? en.genuine : null;
        if (!genuine) return { error: `Long break${name ? ` (${name})` : ''}: say whether the reason was genuine` };
        const minutes = Math.round(Number(en?.minutes));
        entries.push({ id, name, minutes: Number.isFinite(minutes) && minutes > 0 && minutes <= 480 ? minutes : null, why, genuine });
      }
      if (!entries.length) return { error: 'Long break: say who took it' };
      out.push({ kind, entries });
    } else if (kind === 'late_start') {
      const why = text(x.why);
      if (why.length < 3) return { error: 'Late start: say why work started late' };
      const genuine = ['yes', 'no', 'unsure'].includes(x.genuine) ? x.genuine : null;
      if (!genuine) return { error: 'Late start: say whether the reason was genuine' };
      out.push({ kind, startedAt: HHMM.test(String(x.startedAt || '')) ? x.startedAt : null, people: people(x.people), why, genuine });
    } else if (kind === 'machine') {
      const machine = text(x.machine, 80);
      if (!machine) return { error: 'Machine breakdown: say which machine' };
      const downFrom = HHMM.test(String(x.downFrom || '')) ? x.downFrom : null;
      if (!downFrom) return { error: 'Machine breakdown: give the time it stopped' };
      const stillDown = !!x.stillDown;
      const downTo = !stillDown && HHMM.test(String(x.downTo || '')) ? x.downTo : null;
      if (!stillDown && !downTo) return { error: 'Machine breakdown: give the time it worked again, or tick "Still not working"' };
      if (downTo && downTo <= downFrom) return { error: 'Machine breakdown: it must work again after it stopped' };
      const alternative = text(x.alternative);
      if (!alternative) return { error: 'Machine breakdown: say what was used instead (or "nothing")' };
      out.push({ kind, assetId: x.assetId ? text(x.assetId, 80) : null, machine, downFrom, downTo, stillDown, alternative, raiseRepair: x.raiseRepair !== false });
    } else {
      const problem = checkNewReason(kind, x);
      if (problem) return { error: problem };
      const note = text(x.note);
      if (kind === 'over_prepared') {
        out.push({ kind, causes: [...new Set((x.causes || []).filter((cz: string) => (OVER_PREPARED_CAUSES as readonly string[]).includes(cz)))], who: text(x.who, 60), note });
      } else {
        out.push({ kind, note, ...(kind === 'short_staff' || kind === 'slow_folding' ? { people: people(x.people) } : {}) });
      }
    }
  }
  if (!out.length) return { error: 'Say why stuffing was left over' };
  const plan = (LEFTOVER_PLANS as readonly string[]).includes(raw?.plan) ? raw.plan : null;
  if (!plan) return { error: 'Say what happens to the leftover stuffing: used first tomorrow, thrown away or kept in the freezer' };
  return { report: { reasons: out, plan } };
}

// Momos made at a house on a day, by type (the production entry), and pieces a kg of stuffing
// made over the house's last three weeks of closed days - for the leftover flag.
async function houseYield(productionHouseId: string, date: string, houseRecords: any[]) {
  const from = new Date(Date.parse(`${date}T00:00:00Z`) - 21 * 86400000).toISOString().slice(0, 10);
  const productions = (await getAllByPrefixWithRetry('production:')).filter((p: any) => p && p.approvalStatus !== 'rejected'
    && (p.productionHouseId === productionHouseId || p.storeId === productionHouseId) && String(p.date || '').slice(0, 10) >= from);
  const piecesOn = (d: string) => {
    const out: Record<string, number> = {};
    for (const p of productions.filter((x: any) => String(x.date).slice(0, 10) === d)) {
      for (const t of PRODUCTION_MOMO_TYPES) out[t.key] = (out[t.key] || 0) + (Number(p[t.key]?.final) || 0);
    }
    return out;
  };
  const days = houseRecords.filter((r: any) => r.date >= from && r.date < date && r.closed).map((r: any) => ({ pools: r.pools || {}, pieces: piecesOn(r.date) }));
  return { piecesToday: piecesOn(date), perKg: piecesPerKg(days) };
}

// The house's staff on a day: check-in, shift start, minutes late beyond the grace, leave.
async function staffOnDay(productionHouseId: string, date: string) {
  const staff = await houseStaff(productionHouseId);
  return Promise.all(staff.map(async (e: any) => {
    const id = String(e.employeeId);
    const [punch, settings, leaves] = await Promise.all([
      kv.get(`punch:${id}:${date}`).catch(() => null),
      kv.get(`kpi-settings:${id}`).catch(() => null),
      kv.getByPrefix(`leave:${id}:`).catch(() => []),
    ]);
    const shiftStart = parseHHMM(settings?.shiftStart) !== null ? settings.shiftStart : DEFAULT_SHIFTS.production.start;
    const grace = Number.isFinite(settings?.graceMin) ? settings.graceMin : DEFAULT_GRACE_MIN;
    const inAt: string | null = punch?.in?.at || null;
    const inMin = inAt ? Math.round(((Date.parse(inAt) + IST_OFFSET_MS) % 86400000) / 60000) : null;
    const late = inMin !== null ? inMin - (parseHHMM(shiftStart) as number) : null;
    const onLeave = (leaves || []).some((l: any) => l?.status === 'approved' && String(l.leaveDate).slice(0, 10) === date && l.leaveType !== 'half');
    return { id, name: String(e.name || id), shiftStart, checkInAt: inAt, inMin, lateMin: late !== null && late > grace ? late : 0, onLeave };
  }));
}

// What the leftover form needs: the house's staff with today's check-in and lateness, and its
// machines from the equipment register.
// PUT /production-ledger/:houseId/:date/morning {counts: {pool: kg}} - the morning weigh-in: what is
// in the kitchen before anything new is made (owner, 29 Oct 2026: the day starts from what was
// weighed, not from a carried figure). Weighing again replaces it.
app.put('/make-server-c2dd9b9d/production-ledger/:houseId/:date/morning', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (designation !== 'production_incharge' && !isOperationsManager) {
      return c.json({ error: 'Only production incharges or operations managers weigh the kitchen stock' }, 403);
    }
    const productionHouseId = await canonicalProductionHouseId(c.req.param('houseId'));
    const date = c.req.param('date');
    if (!productionHouseId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return c.json({ error: 'Pick a production house and date' }, 400);
    if (date < PRODUCTION_LEDGER_GO_LIVE_DATE) return c.json({ error: `Production ledger tracking starts ${PRODUCTION_LEDGER_GO_LIVE_DATE}` }, 400);
    const body = await c.req.json().catch(() => ({}));
    const counts: Record<string, number> = {};
    for (const id of [...ALL_POOL_IDS, ...SAUCE_IDS]) {
      const v = Number(body?.counts?.[id]);
      if (body?.counts?.[id] !== undefined && body?.counts?.[id] !== null && Number.isFinite(v) && v >= 0) counts[id] = Math.round(v * 1000) / 1000;
    }
    if (!Object.keys(counts).length) return c.json({ error: 'Weigh at least one item' }, 400);
    const gramsError = ledgerGramsError(Object.values(counts));
    if (gramsError) return c.json({ error: gramsError }, 400);
    // Which stuffing was frozen when weighed (owner, 29 Oct 2026: it takes 4-5 hours to thaw).
    const thaw: Record<string, { frozen: boolean }> = {};
    for (const id of Object.keys(counts)) {
      if (/^(stuffing|coating):/.test(id) && body?.thaw?.[id] && typeof body.thaw[id].frozen === 'boolean') thaw[id] = { frozen: body.thaw[id].frozen };
    }
    const record = {
      productionHouseId, date, counts, thaw, at: getNowIST(),
      by: authResult.user.user_metadata?.employeeId || authResult.user.email,
      byName: authResult.user.user_metadata?.name || authResult.user.email,
    };
    await kv.set(`production-morning:${productionHouseId}:${date}`, record);
    await cascadeRecomputeProductionLedger(productionHouseId, date);
    return c.json({ morning: record });
  } catch (error) {
    console.log('Error saving the morning weigh-in:', error);
    return c.json({ error: 'Could not save the weigh-in' }, 500);
  }
});

// POST /production-ledger/:houseId/:date/coach {stage: 'morning' | 'night' | 'summary', lang, facts}
// - Bunny's plain-language word for the production incharge (and the day's summary for the owner
// and operations), written from the numbers the screen already shows. Same facts, same words:
// kept for the day so opening the screen again costs nothing.
app.post('/make-server-c2dd9b9d/production-ledger/:houseId/:date/coach', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (designation !== 'production_incharge' && !isOperationsManager && role !== 'cluster_head') return c.json({ error: 'Not allowed' }, 403);
    const productionHouseId = await canonicalProductionHouseId(c.req.param('houseId'));
    const date = c.req.param('date');
    const body = await c.req.json().catch(() => ({}));
    const stage = ['morning', 'night', 'summary'].includes(body.stage) ? body.stage : 'morning';
    const lang = ['bn', 'hi'].includes(body.lang) ? body.lang : 'en';
    const facts = JSON.stringify(body.facts || {}).slice(0, 4000);
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`${stage}|${lang}|${facts}`)))).slice(0, 12).map((b) => b.toString(16).padStart(2, '0')).join('');
    const key = `production-coach:${productionHouseId}:${date}:${stage}:${lang}`;
    const cached = await kv.get(key).catch(() => null);
    if (cached?.hash === hash) return c.json({ text: cached.text, cached: true });
    const text = await aiProductionCoach(kv as any, { stage, lang, facts });
    await kv.set(key, { hash, text, at: getNowIST() });
    return c.json({ text });
  } catch (error: any) {
    if (error instanceof AiError) return c.json({ error: error.message }, error.status as any);
    console.log('Production coach failed:', error?.message || error);
    return c.json({ error: 'Bunny could not help just now' }, 500);
  }
});

// GET /insights/staffing?storeId=&from=&to= - who was at the store each hour (from the shift
// check-ins) and the day's wage cost (monthly salaries spread over the month), for "staffing
// against orders by hour" on the Insights Revenue tab (owner, 30 Oct 2026). The owner and
// operations managers only (salaries).
app.get('/make-server-c2dd9b9d/insights/staffing', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOps = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (role !== 'cluster_head' && !isOps) return c.json({ error: 'Only the owner or an operations manager sees staffing costs' }, 403);
    const storeId = c.req.query('storeId') || '';
    const from = c.req.query('from') || '';
    const to = c.req.query('to') || '';
    if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to) || from > to) return c.json({ error: 'Pick a period' }, 400);
    const stores = (await kv.getByPrefix('store:')).filter((st: any) => st?.id && (!storeId || st.id === storeId));
    const ids = new Set(stores.map((st: any) => String(st.id)));
    const staff = (await getAllByPrefixWithRetry('unified-employee:')).filter((e: any) => e?.employeeId && !['inactive', 'archived'].includes(e.status)
      && e.role !== 'cluster_head' && e.designation !== 'rider' && !/^production_/.test(String(e.designation || '')) && e.department !== 'production'
      && [e.storeId, ...(e.assignedStoreIds || [])].filter(Boolean).map(String).some((id: string) => ids.has(id)));
    const days: any[] = [];
    let since: string | null = null;
    const today = getTodayIST();
    for (let d = from; d <= to && d <= today; d = addDaysToDateString(d, 1)) {
      const month = d.slice(0, 7);
      const dim = new Date(Date.UTC(Number(month.slice(0, 4)), Number(month.slice(5, 7)), 0)).getUTCDate();
      const byHour = Array(24).fill(0);
      let staffHours = 0, onShift = 0;
      for (const e of staff) {
        const p: any = await kv.get(`punch:${e.employeeId}:${d}`).catch(() => null);
        if (!p?.in?.at) continue;
        onShift++;
        if (!since || d < since) since = d;
        const start = Date.parse(p.in.at) + IST_OFFSET_MS;
        // No check-out: counted to the close (11 PM) on a past day, to now today.
        const endRaw = p.out?.at ? Date.parse(p.out.at) + IST_OFFSET_MS : d < today ? Date.parse(`${d}T23:00:00Z`) : Date.now() + IST_OFFSET_MS;
        const dayStart = Date.parse(`${d}T00:00:00Z`);
        for (let h = 0; h < 24; h++) {
          const hs = dayStart + h * 3600000, he = hs + 3600000;
          const overlap = Math.max(0, Math.min(he, endRaw) - Math.max(hs, start));
          if (overlap > 0) { byHour[h] += overlap / 3600000; staffHours += overlap / 3600000; }
        }
      }
      const wages = staff.reduce((s: number, e: any) => s + monthlySalaryOf(e, month) / dim, 0);
      days.push({ date: d, onShift, staffHours: Math.round(staffHours * 10) / 10, wages: Math.round(wages), byHour: byHour.map((x) => Math.round(x * 100) / 100) });
    }
    return c.json({ days, since, staff: staff.length });
  } catch (error) {
    console.log('Error loading staffing:', error);
    return c.json({ error: 'Could not load staffing' }, 500);
  }
});

app.get('/make-server-c2dd9b9d/production-ledger/:houseId/:date/day-context', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    if (designation !== 'production_incharge' && !isOperationsManager && role !== 'cluster_head') {
      return c.json({ error: 'Only production incharges, operations managers and the owner see this' }, 403);
    }
    const productionHouseId = await canonicalProductionHouseId(c.req.param('houseId'));
    const date = c.req.param('date');
    if (!productionHouseId || !/^\d{4}-\d{2}-\d{2}$/.test(date || '')) return c.json({ error: 'Pick a production house and date' }, 400);
    const [day, assets] = await Promise.all([staffOnDay(productionHouseId, date), getAllByPrefixWithRetry('asset:')]);
    const people = day.map(({ inMin: _inMin, ...p }) => p);
    const machines = (assets || [])
      .filter((a: any) => a?.id && a.locationKind === 'production' && a.locationId === productionHouseId && !a.dismissed && a.condition !== 'disposed')
      .map((a: any) => ({ id: a.id, name: a.name, condition: a.condition }))
      .sort((a: any, b: any) => String(a.name).localeCompare(String(b.name)));
    const { houseRecords } = await getHouseLedger(productionHouseId, date);
    const { perKg } = await houseYield(productionHouseId, date, houseRecords).catch(() => ({ perKg: {} as Record<string, number> }));
    return c.json({ date, staff: people.sort((a, b) => a.name.localeCompare(b.name)), machines, minKg: LEFTOVER_REASON_MIN_KG, perKg });
  } catch (error) {
    console.log('Error loading the production day context:', error);
    return c.json({ error: 'Could not load the day' }, 500);
  }
});

// Closes a production day: writes the directly-reported closingActual per pool (counted/
// weighed, not derived from a yield formula - confirmed requirement) and derives wastage
// from it. Does NOT gate on production: approval status - tomorrow's opening balance must
// be available regardless of whether yesterday's paperwork has been approved yet.
app.put('/make-server-c2dd9b9d/production-ledger/:houseId/:date/close', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    if (!isProductionIncharge && !isOperationsManager) {
      return c.json({ error: 'Only production incharges or operations managers can close a production day' }, 403);
    }

    const productionHouseId = await canonicalProductionHouseId(c.req.param('houseId'));
    const date = c.req.param('date');
    if (date < PRODUCTION_LEDGER_GO_LIVE_DATE) {
      return c.json({ error: `Production ledger tracking starts ${PRODUCTION_LEDGER_GO_LIVE_DATE}` }, 400);
    }
    const { closingActuals, manualOpeningOverride, wastageOverrides, leftoverReport: rawLeftover, sauceLeft: rawSauceLeft } = await c.req.json();
    if (!closingActuals || typeof closingActuals !== 'object') {
      return c.json({ error: 'closingActuals (per pool) is required' }, 400);
    }
    // Sauces left (app 1.21+): litres, soup premix kg.
    const sauceLeft: Record<string, number> = {};
    for (const id of SAUCE_IDS) {
      const v = Number(rawSauceLeft?.[id]);
      if (rawSauceLeft?.[id] !== undefined && rawSauceLeft?.[id] !== null && Number.isFinite(v) && v >= 0) sauceLeft[id] = Math.round(v * 1000) / 1000;
    }
    const gramsError = ledgerGramsError([
      ...Object.values(closingActuals),
      ...Object.values(sauceLeft),
      ...Object.values(wastageOverrides && typeof wastageOverrides === 'object' ? wastageOverrides : {}),
      ...Object.values(manualOpeningOverride && typeof manualOpeningOverride === 'object' ? manualOpeningOverride : {}),
    ]);
    if (gramsError) return c.json({ error: gramsError }, 400);

    const { houseRecords, houseItems, houseMornings } = await getHouseLedger(productionHouseId, date);

    const existing = houseRecords.find((r: any) => r.date === date);
    const hasAnyPriorRecord = houseRecords.some((r: any) => r.date < date);
    let opening = computeLedgerOpening(houseRecords, date, houseMornings);

    // manualOpeningOverride is only ever meaningful on the very first day this ledger
    // exists for a house (a one-time "what's physically on the shelf right now" seed) -
    // same escape hatch as production-cash's own manualOpeningOverride.
    if (!hasAnyPriorRecord && manualOpeningOverride && typeof manualOpeningOverride === 'object') {
      opening = { ...opening, ...manualOpeningOverride };
    }

    const prepared = aggregatePreparedByPool(houseItems);
    const submittedBy = authResult.user.user_metadata?.employeeId || authResult.user.email;
    const submittedByName = authResult.user.user_metadata?.name || authResult.user.email;

    const pools: Record<string, any> = {};
    for (const id of ALL_POOL_IDS) {
      const closingActual = typeof closingActuals[id] === 'number' ? closingActuals[id] : (existing?.pools?.[id]?.closingActual ?? null);
      // Wastage is never assumed from the opening+prepared-closing gap alone - that's only
      // ever offered to the incharge as a one-click suggestion (EndOfDayCloseForm), never
      // applied silently. A confirmed override sticks even through a later backdated
      // correction that changes opening/prepared (cascadeRecomputeProductionLedger respects
      // it the same way) - the human's word on actual waste doesn't get quietly recomputed
      // out from under them.
      const wastageOverride = wastageOverrides && typeof wastageOverrides[id] === 'number'
        ? wastageOverrides[id]
        : (existing?.pools?.[id]?.wastageOverride ?? null);
      const wastage = typeof wastageOverride === 'number'
        ? wastageOverride
        : (typeof closingActual === 'number' ? (opening[id] + prepared[id] - closingActual) : null);
      pools[id] = { opening: opening[id], prepared: prepared[id], closingActual, wastage, wastageOverride };
    }

    // Every item carried over or made today is counted (0 when none is left): a blank one carried
    // into tomorrow as if none of it was used (29 Oct: dough, veg and cheese corn stuffing).
    const notCounted = uncountedPools(pools, Object.fromEntries(Object.entries(pools).map(([id, p]: [string, any]) => [id, p.closingActual])));
    if (notCounted.length) return c.json({ error: `Count every item before closing (0 if none is left): ${notCounted.map(poolLabel).join(', ')}` }, 400);

    // Why stuffing was left over (sent by app 1.16.9+; older apps close without it).
    const leftoverKg = Math.round(leftoverKgOf(pools) * 100) / 100;
    let leftoverReport: any = existing?.leftoverReport || null;
    if (rawLeftover) {
      const clean = cleanLeftoverReport(rawLeftover, await houseStaff(productionHouseId));
      if (clean.error) return c.json({ error: clean.error }, 400);
      const houseName = (await kv.get(`production_house_${productionHouseId}`).catch(() => null))?.name || 'Production';
      // A machine breakdown raises one repair alarm; closing the day again keeps the same one.
      for (const reason of clean.report.reasons) {
        if (reason.kind !== 'machine' || !reason.raiseRepair) continue;
        const before = (existing?.leftoverReport?.reasons || []).find((x: any) => x.kind === 'machine' && x.machine === reason.machine && x.repairAlertId);
        if (before) { reason.repairAlertId = before.repairAlertId; continue; }
        const alert = await raiseRepairAlert(expenseReviewDeps, {
          locationKind: 'production', locationId: productionHouseId, locationName: houseName,
          assetId: reason.assetId, machine: reason.machine, date, downFrom: reason.downFrom, downTo: reason.downTo, stillDown: reason.stillDown,
          alternative: reason.alternative, source: 'leftover', reportedBy: submittedByName, reportedById: authResult.user.user_metadata?.employeeId || null,
        });
        reason.repairAlertId = alert.id;
      }
      leftoverReport = { ...clean.report, leftoverKg, by: submittedByName, at: getNowIST() };
      const late = clean.report.reasons.find((x: any) => x.kind === 'late_start');
      const issues = late ? lateStartIssues(late, await staffOnDay(productionHouseId, date)) : [];
      if (issues.length) leftoverReport.lateCheck = { issues, at: getNowIST() };
    }

    const record = {
      id: existing?.id || `${productionHouseId}-${date}`,
      productionHouseId, date, pools,
      ...(Object.keys(sauceLeft).length || existing?.sauceLeft ? { sauceLeft: { ...(existing?.sauceLeft || {}), ...sauceLeft } } : {}),
      ...(leftoverReport ? { leftoverReport } : {}),
      closed: true,
      closedBy: submittedBy, closedByName: submittedByName, closedByUserId: authResult.user.id,
      closedAt: getNowIST(),
      ...((!hasAnyPriorRecord && manualOpeningOverride) ? { manualOpeningOverride } : {}),
      createdBy: existing?.createdBy || submittedBy,
      createdByName: existing?.createdByName || submittedByName,
      createdAt: existing?.createdAt || getNowIST(),
      updatedAt: getNowIST(),
    };
    await kv.set(`production-ledger:${productionHouseId}:${date}`, record);
    await cascadeRecomputeProductionLedger(productionHouseId, date);
    // A late start that doesn't match the check-ins goes to the incharges and the owner as a
    // production check; closing again with it fixed closes the check. So does any leftover
    // (owner, 29 Oct 2026: "immediately flagged to operation manager and also owner with proper
    // reasoning"): how much, from what, how many momos it could have made, and the reasons.
    {
      const issues: string[] = leftoverReport?.lateCheck?.issues || [];
      const findings: any[] = issues.length ? [{ kind: 'lateMismatch', title: 'Late start doesn\'t match the check-ins', message: issues.join(' ') }] : [];
      await afterResponse('Leftover check', async () => {
        if (leftoverKg >= LEFTOVER_REASON_MIN_KG) {
          const { piecesToday, perKg } = await houseYield(productionHouseId, date, houseRecords);
          findings.push({ kind: 'leftover', title: `${leftoverKg} kg stuffing left over`, message: `${leftoverLines(pools, piecesToday, perKg).join(' ')} ${reasonsText(leftoverReport)}` });
        }
        await flagLedgerDay(expenseReviewDeps, { key: `production-ledger:${productionHouseId}:${date}`, id: record.id, date, house: productionHouseId, loggedBy: submittedByName }, ['lateMismatch', 'leftover'], findings);
      });
    }

    return c.json({ success: true, entry: record });
  } catch (error) {
    console.log('Error closing production ledger day:', error);
    return c.json({ error: 'Failed to close production day' }, 500);
  }
});

// Free-text wastage notes - for something wasted that isn't one of the tracked
// dough/stuffing/batter/coating pools above (a sauce, a chutney, a raw ingredient). Not fed
// into the pool cascade at all - a lightweight, separately-listed log rather than trying to
// force everything through the pool system, since most of what lands here (sauces, in L/ml)
// isn't a "pool" this ledger tracks in the first place.
app.get('/make-server-c2dd9b9d/production-wastage-notes', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  try {
    const productionHouseId = await canonicalProductionHouseId(c.req.query('productionHouseId'));
    const date = c.req.query('date');
    if (!productionHouseId || !date) {
      return c.json({ error: 'productionHouseId and date are required' }, 400);
    }
    const allNotes = await kv.getByPrefix(`production-wastage-note:${productionHouseId}:${date}:`);
    return c.json({ notes: (allNotes || []).sort((a: any, b: any) => (a.loggedAt || '').localeCompare(b.loggedAt || '')) });
  } catch (error) {
    console.log('Error fetching production wastage notes:', error);
    return c.json({ error: 'Failed to fetch wastage notes' }, 500);
  }
});

app.post('/make-server-c2dd9b9d/production-wastage-notes', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isProductionIncharge = designation === 'production_incharge';
    if (!isProductionIncharge && !isOperationsManager) {
      return c.json({ error: 'Only production incharges or operations managers can log wastage' }, 403);
    }
    const { productionHouseId: rawHouseId, date, description, quantity, unit, reason } = await c.req.json();
    const productionHouseId = await canonicalProductionHouseId(rawHouseId);
    if (!productionHouseId || !date || !description || typeof quantity !== 'number' || !unit) {
      return c.json({ error: 'productionHouseId, date, description, quantity, and unit are required' }, 400);
    }
    // 30 Oct 2026: "200 kg" of dough thrown away was 200 g.
    if ((unit === 'kg' || unit === 'L') && quantity > LEDGER_MAX_KG) return c.json({ error: ledgerGramsError([quantity]) }, 400);
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const loggedBy = authResult.user.user_metadata?.employeeId || authResult.user.email;
    const loggedByName = authResult.user.user_metadata?.name || authResult.user.email;
    // SOP 1.7 reason code (T, D, X, F, P, O at the production house) - app 1.15.17+.
    const note = { id, productionHouseId, date, description, quantity, unit, ...(typeof reason === 'string' && reason ? { reason } : {}), loggedBy, loggedByName, loggedAt: getNowIST() };
    await kv.set(`production-wastage-note:${productionHouseId}:${date}:${id}`, note);
    return c.json({ success: true, note });
  } catch (error) {
    console.log('Error logging production wastage note:', error);
    return c.json({ error: 'Failed to log wastage note' }, 500);
  }
});

app.delete('/make-server-c2dd9b9d/production-wastage-notes/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  try {
    const itemId = c.req.param('id');
    const allNotes = await kv.getByPrefix('production-wastage-note:');
    const existing = (allNotes || []).find((n: any) => n.id === itemId);
    if (!existing) return c.json({ error: 'Wastage note not found' }, 404);
    await kv.del(`production-wastage-note:${existing.productionHouseId}:${existing.date}:${existing.id}`);
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting production wastage note:', error);
    return c.json({ error: 'Failed to delete wastage note' }, 500);
  }
});

app.post('/make-server-c2dd9b9d/aggregator-settlements', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const role = authResult.user.user_metadata?.role;
  const designation = authResult.user.user_metadata?.designation;
  const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
  if (!isOperationsManager && role !== 'cluster_head') {
    return c.json({ error: 'Only operations managers or cluster heads can upload settlements' }, 403);
  }

  try {
    const body = await c.req.json();
    const required = ['storeId', 'aggregator', 'settlementDate', 'grossSales', 'netPayout', 'orderCount'];
    for (const field of required) {
      if (body[field] === undefined || body[field] === null || body[field] === '') {
        return c.json({ error: `Missing required field: ${field}` }, 400);
      }
    }

    // Reject any re-upload for a store/aggregator/date that's already been saved - the
    // frontend already checks this before offering the upload, but this is the last line
    // of defense against double-crediting Paytm from a duplicate save (e.g. two people
    // uploading the same file around the same time, or the same date uploaded twice days
    // apart after a late-arriving settlement). If the caller explicitly asked to replace
    // (e.g. re-uploading the same file after the parser gained a new field, like adSpend),
    // delete the old record instead of rejecting.
    //
    // CONFIRMED GAP (found 2026-08-26): this used to also require an exact bankUTR match,
    // which meant two uploads for the SAME date with a blank or differently-parsed UTR
    // (a real possibility - the parser doesn't always capture one cleanly, and a corrected
    // re-upload can easily land with a different value) silently passed as "not a
    // duplicate" and created two settlement records for one date, double-crediting that
    // day's Paytm balance with no error or warning. Checked this store's entire settlement
    // history - no store/aggregator/date has ever legitimately needed two records - so the
    // UTR is no longer part of what defines a duplicate; date alone is enough to require an
    // explicit replace.
    const existingSettlements = await getAllByPrefixWithRetry('aggregator-settlement:');
    const duplicate = (existingSettlements || []).find((s: any) =>
      s.storeId === body.storeId &&
      s.aggregator === body.aggregator &&
      s.settlementDate === body.settlementDate
    );
    if (duplicate) {
      if (!body.replace) {
        return c.json({ error: `A ${body.aggregator} settlement for ${body.settlementDate} has already been uploaded (UTR ${duplicate.bankUTR || 'n/a'} vs this upload's ${body.bankUTR || 'n/a'}) - confirm replace if this is a corrected re-upload` }, 409);
      }
      await kv.del(`aggregator-settlement:${duplicate.id}`);
    }

    const id = `AGG-SETTLE-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const orderDates = Array.isArray(body.orders)
      ? body.orders.map((order: any) => order?.orderDate).filter((date: any) => typeof date === 'string' && date)
      : [];
    const inferredPeriodStart = orderDates.length ? orderDates.reduce((min: string, date: string) => date < min ? date : min, orderDates[0]) : undefined;
    const inferredPeriodEnd = orderDates.length ? orderDates.reduce((max: string, date: string) => date > max ? date : max, orderDates[0]) : undefined;
    const settlement = {
      id,
      storeId: body.storeId,
      storeName: body.storeName || '',
      aggregator: body.aggregator,
      settlementDate: body.settlementDate,
      periodStart: body.periodStart || inferredPeriodStart,
      periodEnd: body.periodEnd || inferredPeriodEnd,
      bankUTR: body.bankUTR || '',
      grossSales: body.grossSales,
      netPayout: body.netPayout,
      netCommission: body.netCommission ?? (body.grossSales - body.netPayout),
      orderCount: body.orderCount,
      orders: Array.isArray(body.orders) ? body.orders : [],
      adSpend: typeof body.adSpend === 'number' ? body.adSpend : undefined,
      // Zomato-only discount/subtotal breakdown from the settlement's own "Order Level"
      // sheet - undefined on Swiggy settlements and on Zomato settlements uploaded before
      // this was parsed. Left undefined (not defaulted to 0) so callers can tell "not
      // captured for this settlement" apart from "genuinely zero discount".
      itemSubtotal: typeof body.itemSubtotal === 'number' ? body.itemSubtotal : undefined,
      promoDiscount: typeof body.promoDiscount === 'number' ? body.promoDiscount : undefined,
      flatOffDiscount: typeof body.flatOffDiscount === 'number' ? body.flatOffDiscount : undefined,
      totalDiscount: typeof body.totalDiscount === 'number' ? body.totalDiscount : undefined,
      gstCollected: typeof body.gstCollected === 'number' ? body.gstCollected : undefined,
      sourceFileName: body.sourceFileName || '',
      uploadedBy: authResult.user.email,
      uploadedAt: getNowIST(),
    };

    await kv.set(`aggregator-settlement:${id}`, settlement);

    // Keep every affected day's stored Paytm balance in sync with this new settlement,
    // not just today's - see cascadeRecomputePaytmBalances' own comment for why this
    // matters. Runs after the response-critical save above; a failure here doesn't
    // fail the upload itself (logged and swallowed inside the helper).
    await cascadeRecomputePaytmBalances(settlement.storeId, settlement.settlementDate);

    return c.json({ success: true, settlement });
  } catch (error) {
    console.log('Error saving aggregator settlement:', error);
    return c.json({ error: 'Failed to save aggregator settlement' }, 500);
  }
});

// Per-menu-item Offline/Online prices, keyed by Ciferon's real ProductId (the same ID that
// appears on OrderItemWrapperList items in Step D) - lets Profitability figures use each
// item's real price per channel instead of one manual price per momo category. Seeded from
// the store's actual Ciferon POS export + Online Submenu export, editable afterwards since
// menu prices change and some items needed manual correction (variant-priced items whose
// base list price is 0).
app.get('/make-server-c2dd9b9d/menu-item-prices', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  try {
    const items = await kv.getByPrefix('menu-item-price:');
    return c.json({ success: true, items: items || [] });
  } catch (error) {
    console.log('Error fetching menu item prices:', error);
    return c.json({ error: 'Failed to fetch menu item prices' }, 500);
  }
});

app.post('/make-server-c2dd9b9d/menu-item-prices', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  if (authResult.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can edit menu item prices' }, 403);
  }
  try {
    const body = await c.req.json();
    const { productId, productName, momoCategory, piecesPerUnit, offlinePrice, onlinePrice } = body || {};
    if (!productId || !productName) {
      return c.json({ error: 'Missing required field: productId or productName' }, 400);
    }
    const entry = {
      productId,
      productName,
      momoCategory: momoCategory ?? null,
      piecesPerUnit: piecesPerUnit ?? 6,
      offlinePrice: offlinePrice ?? 0,
      onlinePrice: onlinePrice ?? 0,
      updatedBy: authResult.user.email,
      updatedAt: getNowIST(),
    };
    await kv.set(`menu-item-price:${productId}`, entry);
    return c.json({ success: true, item: entry });
  } catch (error) {
    console.log('Error saving menu item price:', error);
    return c.json({ error: 'Failed to save menu item price' }, 500);
  }
});

// Per-order item detail synced by Step D of runPosSync (Ciferon's OrderReport/Sale,
// IsAllVisible=true) - the real momo content of every order plus its ExternalId, used to
// join against an uploaded aggregator settlement's per-order payout.
app.get('/make-server-c2dd9b9d/order-item-detail', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    const storeId = c.req.query('storeId');
    const startDate = c.req.query('startDate');
    const endDate = c.req.query('endDate');

    // With ?from/&to the database narrows it first: by store through the key
    // (order-item-detail:{storeId}:{date}) and by day. Without them, as before.
    let records = windowed.range
      ? await getAllByPrefixWithRetry(storeId ? `order-item-detail:${storeId}:` : 'order-item-detail:', windowed.range)
      : await kv.getByPrefix('order-item-detail:');
    records = (records || []).filter((r: any) => {
      if (storeId && r.storeId !== storeId) return false;
      if (startDate && r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      return true;
    });
    return c.json({ success: true, records });
  } catch (error) {
    console.log('Error fetching order item detail:', error);
    return c.json({ error: 'Failed to fetch order item detail' }, 500);
  }
});

// Aggregates real per-order POS data (order-item-detail, synced since ~July 1) into
// packaging (box/tray) and beverage consumption for the Utilities stock status tab.
// Box = TakeAway + HomeDelivery orders (Zomato/Swiggy are also HomeDelivery); Tray =
// DineIn. Only counts items whose CategoryName isn't 'Addon' - a combo's auto-decomposed
// sibling lines (its embedded burger/extra momos/soft drink) represent the SAME combo
// purchase as its own line, not a separately-boxed item (confirmed against real order
// data - a "Mania Combo" order shows 3-4 lines for what is physically one meal in one
// box). Beverage consumption counts ALL matching lines regardless of Addon, since a
// combo's embedded soft drink is still a real bottle handed to the customer.
const BEVERAGE_KEYWORDS = ['coke', 'coca', 'campa', 'cola', 'soft drink', 'cold drink'];

function normalizeBeverageName(name: string): string {
  return name
    .replace(/\(.*?\)/g, '')
    .replace(/\d+\s*m?l/gi, '')
    .replace(/-\s*[AO]\s*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();
}

app.get('/make-server-c2dd9b9d/utilities-consumption', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const storeId = c.req.query('storeId');
    const startDate = c.req.query('startDate') || '2026-07-19';
    const endDate = c.req.query('endDate');

    let records = await kv.getByPrefix('order-item-detail:');
    records = (records || []).filter((r: any) => {
      if (storeId && r.storeId !== storeId) return false;
      if (r.date < startDate) return false;
      if (endDate && r.date > endDate) return false;
      return true;
    });

    let boxesUsed = 0;
    let traysUsed = 0;
    let unattributedOrders = 0;
    const beverageConsumption: Record<string, number> = {};

    for (const record of records) {
      for (const order of (record.orders || [])) {
        // Ciferon's SaleOrderType is missing for a large chunk of orders (confirmed
        // against real data - notably every Zomato/Swiggy order, plus a smaller set of
        // Cash/Paytm counter orders). A Zomato/Swiggy order is always a delivery - the
        // aggregator has no dine-in concept - so paymentMode alone is enough to call it
        // a box with confidence even without orderType. Cash/Paytm/PhonePe orders with
        // no orderType genuinely could be either dine-in or takeaway; there's no signal
        // to disambiguate those, so they correctly stay unattributed rather than guessed.
        const isAggregatorDelivery = order.paymentMode === 'Zomato' || order.paymentMode === 'Swiggy';
        const isBox = order.orderType === 'TakeAway' || order.orderType === 'HomeDelivery' || isAggregatorDelivery;
        const isTray = order.orderType === 'DineIn';
        if (!isBox && !isTray) unattributedOrders++;

        for (const item of (order.rawItems || [])) {
          const nameLower = (item.productName || '').toLowerCase();
          const isBeverage = BEVERAGE_KEYWORDS.some((k) => nameLower.includes(k));

          if (isBeverage) {
            const canonical = normalizeBeverageName(item.productName || '');
            beverageConsumption[canonical] = (beverageConsumption[canonical] || 0) + (item.quantity || 0);
            continue;
          }

          if (item.categoryName === 'Addon') continue; // combo-decomposed sibling line, not its own box/tray

          if (isBox) boxesUsed += item.quantity || 0;
          else if (isTray) traysUsed += item.quantity || 0;
        }
      }
    }

    // Items moved from the store to an event stall (events.ts) left the store's stock too.
    const toEvents = await eventTransfersForStore(kvWithRetry, storeId || undefined, startDate, endDate || undefined);
    boxesUsed += toEvents.boxes;
    traysUsed += toEvents.trays;
    for (const [name, qty] of Object.entries(toEvents.beverages)) {
      const canonical = normalizeBeverageName(name);
      beverageConsumption[canonical] = (beverageConsumption[canonical] || 0) + qty;
    }

    return c.json({
      success: true,
      startDate,
      endDate: endDate || getTodayIST(),
      daysWithData: records.length,
      boxesUsed,
      traysUsed,
      unattributedOrders,
      beverageConsumption,
      movedToEvents: toEvents,
      burgers: await burgerCheckFor(records, storeId || undefined, startDate, endDate || getTodayIST()),
    });
  } catch (error) {
    console.log('Error computing utilities consumption:', error);
    return c.json({ error: 'Failed to compute utilities consumption' }, 500);
  }
});

// Burger buns bought (logged "Burger" purchases) against burgers sold (POS orders) over the same
// days, and what doesn't add up - burgerCheck.ts (owner, 30 Oct 2026). A purchase with no store on
// it (the early ones were logged against the production house) counts for every store: only Bunny
// Momos 1 sells burgers.
async function burgerCheckFor(records: any[], storeId: string | undefined, since: string, today: string) {
  const settings = await kv.get('burger-settings').catch(() => null);
  const purchases = (await getAllByPrefixWithRetry('inventory:'))
    .filter((i: any) => isBurgerPurchase(i) && (!storeId || !i.storeId || i.storeId === storeId))
    .map((i: any) => ({ date: String(i.date || '').slice(0, 10), quantity: Number(i.quantity) || 0, category: i.category, unit: i.unit }));
  // Days with enough orders synced to trust a day with no burgers (21 Oct 2026 came through with one).
  const posDays = records.filter((r: any) => (r.orders || []).length >= 15).map((r: any) => r.date);
  return checkBurgers({ purchases, sales: salesByDay(records), since, today, bunsPerUnit: Number(settings?.bunsPerUnit) || null, posDays });
}

// PUT /burger-settings {bunsPerUnit} - how many buns one logged "Burger" (a packet) holds. Owner or
// operations managers. Until it's set the burger alerts stay off: every count would be off by it.
app.put('/make-server-c2dd9b9d/burger-settings', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  const role = authResult.user.user_metadata?.role;
  const designation = authResult.user.user_metadata?.designation;
  const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
  if (role !== 'cluster_head' && !isOperationsManager) return c.json({ error: 'Only the owner or an operations manager sets this' }, 403);
  const body = await c.req.json().catch(() => ({}));
  const n = Number(body?.bunsPerUnit);
  if (!Number.isInteger(n) || n < 1 || n > 24) return c.json({ error: 'How many buns are in one packet? 1 to 24' }, 400);
  const settings = { bunsPerUnit: n, setBy: authResult.user.user_metadata?.name || authResult.user.email, setAt: new Date().toISOString() };
  await kv.set('burger-settings', settings);
  return c.json({ settings });
});

// After the nightly POS sync: the last 30 days' burger check for the burger store(s); anything that
// doesn't add up goes to the owner, operations managers and store incharges, once a week per kind.
async function sendBurgerAlerts(): Promise<number> {
  const today = getTodayIST();
  const since = new Date(Date.parse(`${today}T00:00:00Z`) - 30 * 86400000).toISOString().slice(0, 10);
  const records = ((await kv.getByPrefix('order-item-detail:')) || []).filter((r: any) => r.date >= since && r.date <= today);
  const check = await burgerCheckFor(records, undefined, since, today);
  if (!check.anomalies.length) return 0;
  const monday = new Date(Date.parse(`${today}T00:00:00Z`) - (((new Date(`${today}T00:00:00Z`).getUTCDay() + 6) % 7) * 86400000)).toISOString().slice(0, 10);
  const people = new Map<string, any>();
  const employees = await kv.getByPrefix('unified-employee:');
  for (const p of [...(await getAllClusterHeads()), ...(await getOperationsManagers()), ...employees.filter((e: any) => e.designation === 'store_incharge' && e.status !== 'inactive')]) {
    if (p?.authUserId) people.set(p.authUserId, p);
  }
  let sent = 0;
  for (const a of check.anomalies) {
    const key = `burger-alert:${a.kind}:${a.kind === 'odd-entry' ? a.date : monday}`;
    if (await kv.get(key)) continue;
    const title = a.kind === 'sold-more' ? 'Burgers: more sold than buns bought' : a.kind === 'bought-more' ? 'Buns going stale'
      : a.kind === 'none-sold' ? 'Burgers: none sold for 2 days' : 'Burgers: check a bun purchase';
    const why = a.kind === 'sold-more' ? ' Buns bought and not logged, or the count is off.' : a.kind === 'bought-more' ? ' Bought too many, or burgers made and not billed.'
      : a.kind === 'none-sold' ? ' Out of buns, or burgers and meals switched off in Ciferon? If they are being sold, they are not being billed.' : '';
    for (const p of people.values()) {
      await notifyUser(p.authUserId, 'burger_check', `🍔 ${title}`, `${a.text}.${why} Stock on hand › Boxes.`, undefined, today).catch(() => undefined);
    }
    await kv.set(key, { at: new Date().toISOString(), ...a });
    sent++;
  }
  return sent;
}

app.delete('/make-server-c2dd9b9d/aggregator-settlements/:id', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const role = authResult.user.user_metadata?.role;
  const designation = authResult.user.user_metadata?.designation;
  const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
  if (!isOperationsManager && role !== 'cluster_head') {
    return c.json({ error: 'Only operations managers or cluster heads can delete a settlement' }, 403);
  }

  try {
    const id = c.req.param('id');
    const existing = await kv.get(`aggregator-settlement:${id}`);
    await kv.del(`aggregator-settlement:${id}`);

    // Same reasoning as the upload route - removing a settlement changes what every
    // day from its date forward should have added up to, so those days' stored Paytm
    // balances need recomputing too, not just left pointing at a payout that's gone.
    if (existing?.storeId && existing?.settlementDate) {
      await cascadeRecomputePaytmBalances(existing.storeId, existing.settlementDate);
    }

    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting aggregator settlement:', error);
    return c.json({ error: 'Failed to delete aggregator settlement' }, 500);
  }
});

// ============================================
// Salary Advance Management Routes
// ============================================

// Get all salary advances
app.get('/make-server-c2dd9b9d/salary-advances', async (c) => {
  try {
    const salaryAdvances = await kv.getByPrefix('salary_advance:');
    return c.json({ success: true, salaryAdvances: await payScope(c, salaryAdvances) });
  } catch (error) {
    console.log('Error fetching salary advances:', error);
    return c.json({ error: 'Failed to fetch salary advances' }, 500);
  }
});

// Create salary advance
app.post('/make-server-c2dd9b9d/salary-advances', async (c) => {
  try {
    const advance = await c.req.json();
    console.log('Creating salary advance:', JSON.stringify(advance));
    
    const advanceId = `ADV-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const newAdvance = {
      ...advance,
      id: advanceId,
      createdAt: getNowIST(),
    };
    
    const key = `salary_advance:${advanceId}`;
    await kv.set(key, newAdvance);
    console.log('Salary advance created successfully');
    
    return c.json({ success: true, salaryAdvance: newAdvance });
  } catch (error) {
    console.log('Error creating salary advance:', error);
    return c.json({ error: 'Failed to create salary advance' }, 500);
  }
});

// Update salary advance
app.put('/make-server-c2dd9b9d/salary-advances/:id', async (c) => {
  try {
    const advanceId = c.req.param('id');
    const updates = await c.req.json();
    console.log('Updating salary advance:', advanceId, Object.keys(updates || {}));
    
    const key = `salary_advance:${advanceId}`;
    const existing = await kv.get(key);
    
    if (!existing) {
      return c.json({ error: 'Salary advance not found' }, 404);
    }
    
    const updatedAdvance = { ...existing, ...updates };
    await kv.set(key, updatedAdvance);
    console.log('Salary advance updated successfully');
    
    return c.json({ success: true, salaryAdvance: updatedAdvance });
  } catch (error) {
    console.log('Error updating salary advance:', error);
    return c.json({ error: 'Failed to update salary advance' }, 500);
  }
});

// Delete salary advance
app.delete('/make-server-c2dd9b9d/salary-advances/:id', async (c) => {
  try {
    const advanceId = c.req.param('id');
    console.log('Deleting salary advance:', advanceId);
    
    const key = `salary_advance:${advanceId}`;
    await kv.del(key);
    console.log('Salary advance deleted successfully');
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting salary advance:', error);
    return c.json({ error: 'Failed to delete salary advance' }, 500);
  }
});

// Setup cluster head account (special endpoint for initial setup)
app.post('/make-server-c2dd9b9d/setup-cluster-head', async (c) => {
  try {
    const { email, password, name } = await c.req.json();
    
    console.log('Setting up cluster head account for:', email);

    // Generate employee ID
    const allEmployees = await kv.getByPrefix('unified_employee:');
    const numbers = allEmployees
      .map((emp: any) => {
        const match = emp.employeeId?.match(/BM(\d+)/);
        return match ? parseInt(match[1]) : 0;
      })
      .filter((num: number) => num > 0);
    
    const nextNumber = numbers.length > 0 ? Math.max(...numbers) + 1 : 1;
    const employeeId = `BM${nextNumber.toString().padStart(3, '0')}`;

    console.log('Generated employee ID:', employeeId);

    // Create user in Supabase Auth with service role
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    );

    // Delete existing user and employee records if any
    console.log('Checking for existing user and employee records...');
    
    // Delete from Auth
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const existingUser = existingUsers?.users?.find(u => u.email === email);
    
    if (existingUser) {
      console.log('Deleting existing auth user:', existingUser.id);
      await supabase.auth.admin.deleteUser(existingUser.id);
    }
    
    // Delete from KV store - find and delete any employee records with this email
    const allExistingEmployees = await kv.getByPrefix('unified_employee:');
    const employeeToDelete = allExistingEmployees.find((emp: any) => emp.email === email);
    
    if (employeeToDelete) {
      console.log('Deleting existing employee record:', employeeToDelete.employeeId);
      await kv.del(`unified_employee:${employeeToDelete.employeeId}`);
    }

    // Create new user
    console.log('Creating new user in auth...');
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // Auto-confirm since we don't have email server
      user_metadata: {
        role: 'cluster_head',
        employeeId: employeeId,
        name: name
      }
    });

    if (authError) {
      console.log('Auth error:', authError);
      return c.json({ error: authError.message }, 400);
    }

    console.log('User created in auth with ID:', authData.user.id);

    // Create employee record in KV store
    const employeeData = {
      id: authData.user.id,
      employeeId: employeeId,
      name: name,
      email: email,
      role: 'cluster_head',
      employmentType: 'fulltime',
      joiningDate: new Date().toISOString().split('T')[0],
      status: 'active',
      createdBy: 'system',
      createdAt: getNowIST()
    };

    const employeeKey = `unified_employee:${employeeId}`;
    await kv.set(employeeKey, employeeData);
    console.log('Employee record created in KV store');

    return c.json({ 
      success: true, 
      message: 'Cluster head account created successfully',
      employeeId: employeeId,
      email: email
    });
  } catch (error) {
    console.log('Error setting up cluster head:', error);
    return c.json({ 
      error: 'Failed to setup cluster head account',
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// ===== Item Sales Management =====

// Get all item sales data
app.get('/make-server-c2dd9b9d/item-sales', async (c) => {
  try {
    console.log('Fetching item sales data...');
    const itemSales = await kv.getByPrefix('item-sales:');
    console.log(`Found ${itemSales.length} item sales entries`);
    return c.json({ itemSales });
  } catch (error) {
    console.log('Error fetching item sales:', error);
    return c.json({ error: 'Failed to fetch item sales data' }, 500);
  }
});

// Upload item sales data (merges with existing data)
app.post('/make-server-c2dd9b9d/item-sales', async (c) => {
  try {
    console.log('=== Item Sales Upload Started ===');
    
    let body;
    try {
      const rawBody = await c.req.text();
      console.log('Raw request body length:', rawBody.length);
      body = JSON.parse(rawBody);
    } catch (jsonError) {
      console.log('JSON parsing error:', jsonError);
      return c.json({ 
        error: 'Invalid JSON in request body', 
        details: jsonError instanceof Error ? jsonError.message : String(jsonError) 
      }, 400);
    }
    
    console.log('Received item sales upload request');
    console.log('Body has keys:', Object.keys(body));
    
    const { salesData, period } = body;
    
    if (!salesData || !Array.isArray(salesData)) {
      console.log('Invalid sales data - not an array');
      return c.json({ error: 'Invalid sales data. Expected an array.' }, 400);
    }
    
    if (salesData.length === 0) {
      console.log('Empty sales data array');
      return c.json({ error: 'No sales data provided' }, 400);
    }
    
    console.log('Processing', salesData.length, 'item sales entries for period:', period);
    
    // Validate and sanitize each item
    const sanitizedData = salesData.map((item) => {
      // Ensure all fields are valid types and clean
      const sanitized = {
        itemName: String(item.itemName || 'Unknown').trim().substring(0, 100),
        quantity: Number(item.quantity) || 0,
        revenue: Number(item.revenue) || 0,
        date: String(item.date || new Date().toISOString().split('T')[0]),
        period: String(item.period || period || 'custom')
      };
      
      return sanitized;
    });
    
    console.log('First sanitized item:', sanitizedData[0]);
    
    // Build arrays for mset
    const keys: string[] = [];
    const values: any[] = [];
    
    sanitizedData.forEach((item) => {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const id = `${timestamp}-${random}`;
      const key = `item-sales:${id}`;
      keys.push(key);
      values.push({
        id,
        itemName: item.itemName,
        quantity: item.quantity,
        revenue: item.revenue,
        date: item.date,
        period: item.period,
        uploadedAt: new Date().toISOString()
      });
    });
    
    console.log('Saving', keys.length, 'items to KV store...');
    await kv.mset(keys, values);
    console.log('Item sales saved successfully');
    
    return c.json({ success: true, count: sanitizedData.length });
  } catch (error) {
    console.log('=== Error uploading item sales ===');
    console.log('Error type:', error?.constructor?.name);
    console.log('Error message:', error instanceof Error ? error.message : String(error));
    if (error instanceof Error && error.stack) {
      console.log('Error stack:', error.stack);
    }
    return c.json({ 
      error: 'Failed to upload item sales data', 
      details: error instanceof Error ? error.message : String(error) 
    }, 500);
  }
});

// Delete all item sales data
app.delete('/make-server-c2dd9b9d/item-sales', async (c) => {
  try {
    console.log('Clearing all item sales data...');
    const itemSales = await kv.getByPrefix('item-sales:');
    console.log(`Found ${itemSales.length} item sales entries to delete`);
    
    if (itemSales.length > 0) {
      const keys = itemSales.map((item: any) => `item-sales:${item.id}`);
      await kv.mdel(keys);
      console.log('All item sales data cleared successfully');
    }
    
    return c.json({ success: true, deletedCount: itemSales.length });
  } catch (error) {
    console.log('Error clearing item sales:', error);
    return c.json({ error: 'Failed to clear item sales data' }, 500);
  }
});

// ===== Attendance & Leave Management =====

// Leave policy reset: on Aug 1, 2026 all prior leave balances/usage were wiped and the
// monthly credit increased from 3 to 4 days/month.
const LEAVE_POLICY_RESET_DATE = '2026-08-01';
const LEAVES_PER_MONTH = 4;

// Leave is counted from the 1 Aug 2026 reset with no end: 4 days are credited on the 1st of
// every month, there are no fixed weekly offs (staff take their days whenever they need), and
// unused leave carries forward month to month and into the next year - nothing lapses on 31
// December (owner, 28 Oct 2026). It used to start fresh every 1 January.
function leavePeriodIST(): { start: string; end: string } {
  return { start: LEAVE_POLICY_RESET_DATE, end: '9999-12-31' };
}

// Helper function to calculate leave balance
// usedLeaves can be a decimal (e.g., 1.5 for one full day + one half day)
function calculateLeaveBalance(joiningDate: string, usedLeaves: number): number {
  const today = getTodayIST();
  const { start } = leavePeriodIST();
  // Credit starts at the policy reset, or the joining date if that is later.
  const joined = /^\d{4}-\d{2}-\d{2}/.test(joiningDate || '') ? joiningDate.slice(0, 10) : start;
  const creditFrom = joined > start ? joined : start;

  // Joining date still in the future: nothing credited yet
  if (creditFrom > today) {
    return -usedLeaves;
  }

  // 4 leaves credited on the 1st of each month from the credit month to this month, across years.
  const monthsToCount = (parseInt(today.slice(0, 4), 10) - parseInt(creditFrom.slice(0, 4), 10)) * 12
    + parseInt(today.slice(5, 7), 10) - parseInt(creditFrom.slice(5, 7), 10) + 1;
  const totalCredited = monthsToCount * LEAVES_PER_MONTH;

  // Available balance (can be negative if advance leaves are taken)
  // Negative balance will be carried forward and deducted from next month's allocation
  return totalCredited - usedLeaves;
}

function leaveDays(leaves: any[]): number {
  // Old leaves without leaveType count as full days
  return leaves.reduce((total: number, leave: any) => total + ((leave.leaveType || 'full') === 'half' ? 0.5 : 1), 0);
}

// One person's leave position for this leave year. The joining date comes from their own
// employee record (the app had no joining date to send and fell back to 2024-01-01).
// pendingDays is reported separately so applying can count it against the balance.
async function leaveBalanceFor(employeeId: string, joiningDateHint?: string): Promise<{ balance: number; pendingDays: number; joiningDate: string; leaveYearStart: string }> {
  const employee = (await kv.get(`unified-employee:${employeeId}`)) || (await kv.get(`archived-employee:${employeeId}`));
  const joiningDate = String(employee?.joiningDate || employee?.createdAt || joiningDateHint || getTodayIST()).slice(0, 10);
  const { start, end } = leavePeriodIST();
  const sinceReset = (await getAllByPrefixWithRetry(`leave:${employeeId}:`))
    .filter((l: any) => l.leaveDate >= start && l.leaveDate <= end);
  return {
    balance: calculateLeaveBalance(joiningDate, leaveDays(sinceReset.filter((l: any) => l.status === 'approved'))),
    pendingDays: leaveDays(sinceReset.filter((l: any) => l.status === 'pending')),
    joiningDate,
    leaveYearStart: start,
  };
}

// Create employee account (by manager)
app.post('/make-server-c2dd9b9d/attendance/employees', async (c) => {
  try {
    const { name, dob, email, password, employeeId, managerId, aadharFront, aadharBack, joiningDate } = await c.req.json();
    
    if (!name || !email || !password || !employeeId || !managerId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // Create Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { 
        name, 
        role: 'employee', 
        employeeId,
        managerId,
        joiningDate: joiningDate || new Date().toISOString().split('T')[0]
      },
      email_confirm: true
    });
    
    if (authError) {
      console.log('Error creating auth user:', authError);
      return c.json({ error: authError.message }, 400);
    }
    
    // Store employee details
    const employee = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      employeeId,
      name,
      dob,
      email,
      managerId,
      aadharFront,
      aadharBack,
      joiningDate: joiningDate || getTodayIST(),
      authUserId: authData.user.id,
      createdAt: getNowIST()
    };
    
    await kv.set(`attendance-employee:${employeeId}`, employee);
    
    return c.json({ success: true, employee });
  } catch (error) {
    console.log('Error creating employee:', error);
    return c.json({ error: 'Failed to create employee' }, 500);
  }
});

// Get employees by manager
app.get('/make-server-c2dd9b9d/attendance/employees/manager/:managerId', async (c) => {
  try {
    const managerId = c.req.param('managerId');
    const allEmployees = await kv.getByPrefix('attendance-employee:');
    const employees = allEmployees.filter((emp: any) => emp.managerId === managerId);
    return c.json({ employees });
  } catch (error) {
    console.log('Error fetching employees:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Create manager account (by cluster head)
app.post('/make-server-c2dd9b9d/attendance/managers', async (c) => {
  try {
    const { name, email, password, clusterHeadId, storeId } = await c.req.json();
    
    if (!name || !email || !password || !clusterHeadId) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    const employeeId = `MGR${Date.now().toString().slice(-8)}`;
    
    // Create Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      user_metadata: { 
        name, 
        role: 'manager', 
        employeeId,
        clusterHeadId,
        storeId: storeId || null,
        joiningDate: new Date().toISOString().split('T')[0]
      },
      email_confirm: true
    });
    
    if (authError) {
      console.log('Error creating auth user:', authError);
      return c.json({ error: authError.message }, 400);
    }
    
    // Store manager details
    const manager = {
      id: `${Date.now()}-${Math.random().toString(36).substring(7)}`,
      employeeId,
      name,
      email,
      clusterHeadId,
      storeId: storeId || null,
      joiningDate: getTodayIST(),
      authUserId: authData.user.id,
      createdAt: getNowIST()
    };
    
    await kv.set(`attendance-manager:${employeeId}`, manager);
    
    return c.json({ success: true, manager, employeeId });
  } catch (error) {
    console.log('Error creating manager:', error);
    return c.json({ error: 'Failed to create manager' }, 500);
  }
});

// Get managers by cluster head
app.get('/make-server-c2dd9b9d/attendance/managers/cluster/:clusterHeadId', async (c) => {
  try {
    const clusterHeadId = c.req.param('clusterHeadId');
    const allManagers = await kv.getByPrefix('attendance-manager:');
    const managers = allManagers.filter((mgr: any) => mgr.clusterHeadId === clusterHeadId);
    return c.json({ managers });
  } catch (error) {
    console.log('Error fetching managers:', error);
    return c.json({ error: 'Failed to fetch managers' }, 500);
  }
});

// ===== Timesheet Management =====

// Who approves a person's timesheets and leave: their incharge when they have one (assigning
// an incharge clears managerId, which used to send these to every owner instead), else their
// manager, else the owner(s) so nothing is stranded.
async function approversFor(employee: any): Promise<any[]> {
  if (employee?.inchargeId) {
    const incharge = await kv.get(`unified-employee:${employee.inchargeId}`);
    // Only while they still hold an incharge designation - otherwise they can't approve.
    if (incharge && (incharge.designation === 'store_incharge' || incharge.designation === 'production_incharge')) return [incharge];
  }
  if (employee?.managerId) {
    const manager = await kv.get(`unified-employee:${employee.managerId}`);
    if (manager) return [manager];
  }
  return getAllClusterHeads();
}

// May this signed-in person approve/reject a record belonging to employeeId? The owner and
// managers can (as before); a store/production incharge only for staff assigned to them.
async function canApproveFor(authUser: any, employeeId: string): Promise<boolean> {
  const role = authUser?.user_metadata?.role;
  if (role === 'cluster_head' || role === 'manager') return true;
  const designation = authUser?.user_metadata?.designation;
  if (designation !== 'store_incharge' && designation !== 'production_incharge') return false;
  const employee = await kv.get(`unified-employee:${employeeId}`);
  return !!employee && !!employee.inchargeId && employee.inchargeId === authUser?.user_metadata?.employeeId;
}

// One timesheet/leave by its id, read straight from the table. Scanning the whole
// collection with kv.getByPrefix stopped at 1000 rows, so approving anything past that
// answered "not found".
async function findKvRecordById(prefix: string, id: string): Promise<{ key: string; value: any } | null> {
  return retryWithBackoff(async () => {
    const { data, error } = await supabase
      .from('kv_store_c2dd9b9d')
      .select('key, value')
      .like('key', `${prefix}%`)
      .eq('value->>id', id)
      .limit(1);
    if (error) throw new Error(error.message);
    return data?.[0] || null;
  }, `findKvRecordById(${prefix})`);
}

// A new timesheet/leave always starts as pending: the app used to be trusted with the status,
// so a crafted request could save itself as approved. Approval only happens through the
// approve routes, the notification quick action or the server's own auto-approve.
function asNewSubmission(entry: any) {
  const { approvedBy: _a, approvedAt: _b, rejectedBy: _c, rejectedAt: _d, rejectionReason: _e, ...rest } = entry || {};
  return { ...rest, status: 'pending' };
}

// NOTE: must stay registered BEFORE '/timesheets/:employeeId' below - otherwise Hono matches
// 'all' as an employeeId and returns an empty list (the Attendance Compliance section
// showed every employee as missing every day because of exactly that).
// Get every employee's timesheets - powers the Staff Attendance Compliance section on
// the Store-Production SLA Analysis page (who hasn't submitted, and how long a pending
// one has been waiting on manager approval). Mirrors GET /leaves/all.
app.get('/make-server-c2dd9b9d/timesheets/all', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    const allTimesheets = await getAllByPrefixWithRetry('timesheet:', windowed.range);
    return c.json({ timesheets: allTimesheets });
  } catch (error: any) {
    console.log('Error fetching all timesheets:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ timesheets: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch timesheets' }, 500);
  }
});

// Get timesheets for an employee
app.get('/make-server-c2dd9b9d/timesheets/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const caller = await callerOf(c);
    if (!caller.lead && !caller.incharge && caller.employeeId !== employeeId) return c.json({ error: 'You can only see your own timesheets' }, 403);
    // Paginated: a year of daily timesheets is ~365 rows, so one person passes 1000 in time.
    const allTimesheets = await getAllByPrefixWithRetry(`timesheet:${employeeId}:`);
    return c.json({ timesheets: allTimesheets });
  } catch (error) {
    console.log('Error fetching timesheets:', error);
    return c.json({ error: 'Failed to fetch timesheets' }, 500);
  }
});

// "Timesheet Approval Needed" to the person's own approver - their incharge or manager (see
// approversFor); cluster heads only for someone with neither on file.
async function notifyTimesheetApprovers(savedTimesheet: any) {
  // attendance-employee: is an empty/legacy collection - real employee records
  // (with the actual name and authUserId) live under unified-employee:.
  const employee = await kv.get(`unified-employee:${savedTimesheet.employeeId}`);
  const employeeName = employee?.name || savedTimesheet.employeeId;
  const recipients = await approversFor(employee);
  const timeSummary = formatTimesheetSummary(savedTimesheet);
  const fromPunch = savedTimesheet.source === 'punch' ? ' (from check-in and check-out away from the workplace)' : '';
  for (const recipient of recipients) {
    if (recipient.authUserId) {
      await notifyUser(
        recipient.authUserId,
        'timesheet_pending',
        'Timesheet Approval Needed',
        `${employeeName} (${savedTimesheet.employeeId}) submitted timesheet for ${savedTimesheet.date}${timeSummary ? ` - ${timeSummary}` : ''}${fromPunch}`,
        savedTimesheet.id,
        savedTimesheet.date,
        { recordType: 'timesheet', recordId: savedTimesheet.id }
      );
    }
  }
}

// Save single timesheet
app.post('/make-server-c2dd9b9d/timesheets', async (c) => {
  try {
    const timesheet = asNewSubmission(await c.req.json());
    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const key = `timesheet:${timesheet.employeeId}:${timesheet.date}`;

    const savedTimesheet = {
      ...timesheet,
      id,
      submittedAt: new Date().toISOString()
    };

    await kv.set(key, savedTimesheet);

    // Route the approval notification to the employee's own approver - this route used to
    // hardcode cluster heads unconditionally. Sent after the response (afterResponse).
    if (timesheet.status === 'pending') {
      await afterResponse('Timesheet notifications', () => notifyTimesheetApprovers(savedTimesheet));
    }

    return c.json({ success: true, id });
  } catch (error) {
    console.log('Error saving timesheet:', error);
    return c.json({ error: 'Failed to save timesheet' }, 500);
  }
});

// Save bulk timesheets - a multi-day submission from EmployeeTimesheet.tsx. Previously
// sent no approval notification at all (only the single-day POST /timesheets route did,
// and even that one went to the wrong recipient - see the note there); this sends one
// summarizing notification per employee to their actual manager instead of one per day.
app.post('/make-server-c2dd9b9d/timesheets/bulk', async (c) => {
  try {
    const { timesheets } = await c.req.json();

    const keys: string[] = [];
    const values: any[] = [];

    for (const timesheet of timesheets) {
      const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const key = `timesheet:${timesheet.employeeId}:${timesheet.date}`;
      keys.push(key);
      values.push({
        ...asNewSubmission(timesheet),
        id,
        submittedAt: new Date().toISOString()
      });
    }

    await kv.mset(keys, values);

    const pending = values.filter((t: any) => t.status === 'pending');
    if (pending.length > 0) {
      const byEmployee = new Map<string, any[]>();
      for (const t of pending) {
        if (!byEmployee.has(t.employeeId)) byEmployee.set(t.employeeId, []);
        byEmployee.get(t.employeeId)!.push(t);
      }

      // Sent after the response (afterResponse).
      await afterResponse('Bulk timesheet notifications', async () => {
        for (const [employeeId, entries] of byEmployee) {
          const employee = await kv.get(`unified-employee:${employeeId}`);
          const employeeName = employee?.name || employeeId;

          const recipients = await approversFor(employee);

          const sortedDates = entries.map((t: any) => t.date).sort();
          const dateRangeLabel = entries.length > 1 ? `${sortedDates[0]} to ${sortedDates[sortedDates.length - 1]} (${entries.length} days)` : sortedDates[0];
          const firstId = entries[0].id;

          for (const recipient of recipients) {
            if (recipient.authUserId) {
              await notifyUser(
                recipient.authUserId,
                'timesheet_pending',
                'Timesheet Approval Needed',
                `${employeeName} (${employeeId}) submitted timesheet: ${dateRangeLabel}`,
                firstId,
                sortedDates[0],
                { recordType: 'timesheet', recordId: firstId }
              );
            }
          }
        }
      });
    }

    return c.json({ success: true, count: timesheets.length });
  } catch (error) {
    console.log('Error saving timesheets:', error);
    return c.json({ error: 'Failed to save timesheets' }, 500);
  }
});

// Approve timesheet
app.post('/make-server-c2dd9b9d/timesheets/:timesheetId/approve', async (c) => {
  try {
    const timesheetId = c.req.param('timesheetId');
    const { managerId } = await c.req.json();

    // Find the timesheet
    const found = await findKvRecordById('timesheet:', timesheetId);
    const timesheet = found?.value;

    if (!timesheet) {
      return c.json({ error: 'Timesheet not found' }, 404);
    }
    const auth = await verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);
    if (!(await canApproveFor(auth.user, timesheet.employeeId))) {
      return c.json({ error: 'You can only approve timesheets of your own staff' }, 403);
    }

    const key = found!.key;
    const approvedTimesheet = {
      ...timesheet,
      status: 'approved',
      approvedBy: managerId,
      approvedAt: getNowIST()
    };
    await kv.set(key, approvedTimesheet);
    
    // Notify the employee
    const employee = await kv.get(`unified-employee:${timesheet.employeeId}`);
    if (employee?.authUserId) {
      const timeSummary = formatTimesheetSummary(timesheet);
      await notifyUser(
        employee.authUserId,
        'timesheet_approved',
        'Timesheet Approved ✅',
        `Your timesheet for ${timesheet.date} has been approved${timeSummary ? ` - ${timeSummary}` : ''}`,
        timesheetId,
        timesheet.date
      );
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error approving timesheet:', error);
    return c.json({ error: 'Failed to approve timesheet' }, 500);
  }
});

// Reject timesheet
app.post('/make-server-c2dd9b9d/timesheets/:timesheetId/reject', async (c) => {
  try {
    const timesheetId = c.req.param('timesheetId');
    const { managerId, reason } = await c.req.json();

    // Find the timesheet
    const found = await findKvRecordById('timesheet:', timesheetId);
    const timesheet = found?.value;

    if (!timesheet) {
      return c.json({ error: 'Timesheet not found' }, 404);
    }
    const auth = await verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);
    if (!(await canApproveFor(auth.user, timesheet.employeeId))) {
      return c.json({ error: 'You can only reject timesheets of your own staff' }, 403);
    }

    const key = found!.key;
    const rejectedTimesheet = {
      ...timesheet,
      status: 'rejected',
      rejectedBy: managerId,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    };
    await kv.set(key, rejectedTimesheet);
    
    // Notify the employee
    const employee = await kv.get(`unified-employee:${timesheet.employeeId}`);
    if (employee?.authUserId) {
      const timeSummary = formatTimesheetSummary(timesheet);
      await notifyUser(
        employee.authUserId,
        'timesheet_rejected',
        'Timesheet Rejected ✗',
        `Your timesheet for ${timesheet.date}${timeSummary ? ` (${timeSummary})` : ''} was rejected. Reason: ${reason}`,
        timesheetId,
        timesheet.date
      );
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error rejecting timesheet:', error);
    return c.json({ error: 'Failed to reject timesheet' }, 500);
  }
});

// Auto-approves timesheets that have sat 'pending' for more than 5 days without the
// employee's manager acting on it, so a forgotten approval doesn't block payroll/attendance
// records indefinitely. Mirrors production's 24h auto-approve-stale cron (same file,
// same non-fatal per-item try/catch shape) but with a 5-day cutoff, since a missed
// timesheet approval is far less time-sensitive than a missed stock request. Cron-only
// (see the timesheets-auto-approve-stale pg_cron migration) - not reachable by regular users.
const TIMESHEET_AUTO_APPROVE_DAYS = 5;
app.post('/make-server-c2dd9b9d/timesheets/auto-approve-stale', async (c) => {
  const cronSecret = c.req.header('X-Cron-Secret');
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const cutoff = Date.now() - TIMESHEET_AUTO_APPROVE_DAYS * 24 * 60 * 60 * 1000;
    const allTimesheets = await getAllByPrefixWithRetry('timesheet:');
    const stalePending = allTimesheets.filter((t: any) => {
      if (t.status !== 'pending') return false;
      // No submittedAt at all means it predates that field - skip rather than guess how
      // long it's actually been waiting.
      if (!t.submittedAt) return false;
      const submitted = new Date(t.submittedAt).getTime();
      return !isNaN(submitted) && submitted <= cutoff;
    });

    let approvedCount = 0;
    for (const timesheet of stalePending) {
      try {
        const key = `timesheet:${timesheet.employeeId}:${timesheet.date}`;
        const approvedTimesheet = {
          ...timesheet,
          status: 'approved',
          approvedBy: `Auto-approved (no action within ${TIMESHEET_AUTO_APPROVE_DAYS} days)`,
          approvedAt: getNowIST(),
        };
        await kv.set(key, approvedTimesheet);
        approvedCount++;

        const employee = await kv.get(`unified-employee:${timesheet.employeeId}`);
        if (employee?.authUserId) {
          const timeSummary = formatTimesheetSummary(timesheet);
          await notifyUser(
            employee.authUserId,
            'timesheet_approved',
            'Timesheet Auto-Approved',
            `Your timesheet for ${timesheet.date}${timeSummary ? ` (${timeSummary})` : ''} was automatically approved after ${TIMESHEET_AUTO_APPROVE_DAYS} days with no response from your manager.`,
            timesheet.id,
            timesheet.date
          );
        }
      } catch (itemError) {
        // Non-fatal per item - one bad record shouldn't stop the rest of the batch.
        console.log('Error auto-approving timesheet', timesheet.id, itemError);
      }
    }

    console.log(`Timesheet auto-approve-stale: approved ${approvedCount} of ${stalePending.length} stale pending timesheets`);
    return c.json({ success: true, approvedCount });
  } catch (error: any) {
    console.log('Error auto-approving stale timesheets:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ error: 'Database temporarily unavailable' }, 503);
    }
    return c.json({ error: 'Failed to auto-approve stale timesheets' }, 500);
  }
});

// ===== Leave Management =====

// Get all leaves (for cluster heads/managers)
app.get('/make-server-c2dd9b9d/leaves/all', async (c) => {
  const windowed = requestedDateRange(c, 'leaveDate');
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    // Paginated - plain getByPrefix stopped at 1000 rows and hid newer applications.
    const allLeaves = await getAllByPrefixWithRetry('leave:', windowed.range);
    // The reason is for the person, their approvers, the owner and managers (security review, 28 Oct 2026).
    const caller = await callerOf(c);
    const approver = caller.lead || caller.incharge;
    const leaves = approver ? allLeaves : (allLeaves || []).map((l: any) => (String(l?.employeeId) === caller.employeeId ? l : { ...l, reason: undefined, notes: undefined }));
    return c.json({ leaves });
  } catch (error) {
    console.log('Error fetching all leaves:', error);
    return c.json({ error: 'Failed to fetch all leaves' }, 500);
  }
});

// Who is off and when, for everyone in the team to plan their own leave around (owner, 28 Oct
// 2026: "otherwise two people take the same day and the store or production is short"). Names,
// where they work, the day, full or half day, approved or still waiting - never the reason.
// Default: today to the end of next month; at most 92 days.
app.get('/make-server-c2dd9b9d/team/leave-calendar', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const myId = authResult.user.user_metadata?.employeeId || null;
    const today = getTodayIST();
    const [y, m] = today.split('-').map(Number);
    const endOfNextMonth = new Date(Date.UTC(y, m + 1, 0)).toISOString().slice(0, 10);
    const from = c.req.query('from') || today;
    const to = c.req.query('to') || endOfNextMonth;
    if (!ISO_DAY.test(from) || !ISO_DAY.test(to) || from > to) return c.json({ error: 'from and to must be dates like 2026-10-28, from first' }, 400);
    if ((Date.parse(to) - Date.parse(from)) / 86400000 > 92) return c.json({ error: 'At most 92 days at a time' }, 400);

    const [people, leaves, stores, houses] = await Promise.all([
      kv.getByPrefix('unified-employee:'),
      getAllByPrefixWithRetry('leave:', { from, to, field: 'leaveDate' }),
      kv.getByPrefix('store:'),
      kv.getByPrefix('production_house_'),
    ]);
    const storeById = new Map<string, any>((stores || []).filter((s: any) => s?.id).map((s: any) => [s.id, s]));
    const houseById = new Map<string, any>((houses || []).filter((h: any) => h?.id).map((h: any) => [h.id, h]));
    // A production person's storeId held their house's id until assignedProductionHouseIds.
    const placeOf = (p: any) => {
      const designation = String(p.designation || '');
      if (designation === 'rider') return { key: 'riders', kind: 'riders', id: null, name: '' };
      if (designation.startsWith('production')) {
        const id = p.assignedProductionHouseIds?.[0] || (houseById.has(p.storeId) ? p.storeId : storeById.get(p.storeId)?.productionHouseId) || null;
        return { key: `production:${id || ''}`, kind: 'production', id, name: houseById.get(id)?.name || '' };
      }
      if (designation.startsWith('store')) {
        const id = (storeById.has(p.storeId) ? p.storeId : p.assignedStoreIds?.[0]) || null;
        return { key: `store:${id || ''}`, kind: 'store', id, name: storeById.get(id)?.name || '' };
      }
      return { key: 'managers', kind: 'managers', id: null, name: '' };
    };

    const active = (people || []).filter((p: any) => p?.employeeId && p.status !== 'inactive');
    const byId = new Map<string, any>();
    const places = new Map<string, any>();
    for (const p of active) {
      const place = placeOf(p);
      byId.set(p.employeeId, { name: p.name || p.employeeId, placeKey: place.key });
      const row = places.get(place.key) || { ...place, people: 0 };
      row.people++;
      places.set(place.key, row);
    }
    const days = (leaves || [])
      .filter((l: any) => (l.status === 'approved' || l.status === 'pending') && byId.has(l.employeeId))
      .map((l: any) => ({
        leaveDate: String(l.leaveDate).slice(0, 10),
        employeeId: l.employeeId,
        name: byId.get(l.employeeId).name,
        placeKey: byId.get(l.employeeId).placeKey,
        leaveType: l.leaveType === 'half' ? 'half' : 'full',
        status: l.status,
      }))
      .sort((a: any, b: any) => a.leaveDate.localeCompare(b.leaveDate) || a.name.localeCompare(b.name));
    return c.json({ today, from, to, people: active.length, places: [...places.values()], leaves: days, myPlaceKey: (myId && byId.get(myId)?.placeKey) || null });
  } catch (error) {
    console.log('Error fetching the team leave calendar:', error);
    return c.json({ error: 'Failed to fetch who is on leave' }, 500);
  }
});

// Get leaves for an employee
app.get('/make-server-c2dd9b9d/leaves/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const caller = await callerOf(c);
    if (!caller.lead && !caller.incharge && caller.employeeId !== employeeId) return c.json({ error: 'You can only see your own leave' }, 403);
    const allLeaves = await getAllByPrefixWithRetry(`leave:${employeeId}:`);
    return c.json({ leaves: allLeaves });
  } catch (error) {
    console.log('Error fetching leaves:', error);
    return c.json({ error: 'Failed to fetch leaves' }, 500);
  }
});

// Get leave balance - this leave year only, credited from the joining date on the
// employee's own record (see leaveBalanceFor). The joiningDate query is only a fallback
// for someone with no employee record.
app.get('/make-server-c2dd9b9d/leaves/:employeeId/balance', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    return c.json(await leaveBalanceFor(employeeId, c.req.query('joiningDate')));
  } catch (error) {
    console.log('Error calculating leave balance:', error);
    return c.json({ error: 'Failed to calculate leave balance' }, 500);
  }
});

// Apply for leave
app.post('/make-server-c2dd9b9d/leaves', async (c) => {
  try {
    const leave = asNewSubmission(await c.req.json());
    const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
    const key = `leave:${leave.employeeId}:${id}`;

    const savedLeave = {
      ...leave,
      id,
      appliedAt: new Date().toISOString()
    };

    await kv.set(key, savedLeave);

    // Route the approval notification: regular leave (and advance leave up to the
    // escalation threshold) goes to the employee's own approver - incharge or manager
    // (approversFor), matching who can act on it in the Approve Leaves screen. Advance
    // leave past the threshold is escalated straight to the cluster head instead.
    // Sent after the response (afterResponse).
    if (leave.status === 'pending') {
      await afterResponse('Leave notifications', async () => {
        // attendance-employee: is a legacy/unused collection - real employee records
        // (name, managerId, authUserId) live under unified-employee:, keyed directly by employeeId.
        const applicant = await kv.get(`unified-employee:${leave.employeeId}`);
        const employeeLabel = applicant?.name ? `${applicant.name} (${leave.employeeId})` : leave.employeeId;
        const escalateToClusterHead = leave.isAdvanceLeave && leave.approverRole === 'cluster_head';

        const title = escalateToClusterHead ? 'Advance Leave Approval Needed' : 'Leave Approval Needed';
        const message = escalateToClusterHead
          ? `${employeeLabel} requested ${leave.advanceDaysRequested || ''} day(s) of advance leave starting ${leave.leaveDate} - escalated for cluster head approval`
          : `${employeeLabel} applied for leave on ${leave.leaveDate}`;

        const recipients = escalateToClusterHead ? await getAllClusterHeads() : await approversFor(applicant);

        for (const recipient of recipients) {
          if (recipient.authUserId) {
            await notifyUser(recipient.authUserId, 'leave_pending', title, message, id, leave.leaveDate, { recordType: 'leave', recordId: id });
          }
        }
      });
    }

    return c.json({ success: true, id });
  } catch (error) {
    console.log('Error applying leave:', error);
    return c.json({ error: 'Failed to apply leave' }, 500);
  }
});

// Apply for a multi-day leave in one call - saves one leave: record per day (unchanged
// from the single-day route, since balance/approval tracking is still per-day), but
// sends ONE notification summarizing the whole date range instead of one per day. The
// single-day POST /leaves route above still fires a notification per call, so a
// multi-day application that loops it floods the approver with a notification per day.
app.post('/make-server-c2dd9b9d/leaves/bulk', async (c) => {
  try {
    const { leaves: requested } = await c.req.json();
    if (!Array.isArray(requested) || requested.length === 0) {
      return c.json({ error: 'No leave applications provided' }, 400);
    }
    const employeeId = requested[0]?.employeeId;
    if (!employeeId || requested.some((l: any) => l?.employeeId !== employeeId || !l?.leaveDate)) {
      return c.json({ error: 'An application must be for one person, with a date on every day' }, 400);
    }

    // Idempotent: the app retries a POST that got a 5xx, and this route used to mint new ids
    // on every call, so a retry after a slow first attempt saved every day twice. A day that
    // already has a pending or approved leave for this person is not saved again - its
    // existing id is returned instead.
    const existingByDate = new Map<string, any>();
    for (const l of await getAllByPrefixWithRetry(`leave:${employeeId}:`)) {
      if (l.status !== 'rejected') existingByDate.set(l.leaveDate, l);
    }
    const leaves: any[] = [];
    for (const leave of requested) {
      if (!existingByDate.has(leave.leaveDate) && !leaves.some((l) => l.leaveDate === leave.leaveDate)) {
        leaves.push(asNewSubmission(leave));
      }
    }

    // Regular leave can't go past the balance, counting applications still waiting
    // (advance leave is how someone borrows ahead, so it isn't capped here).
    if (leaves.length > 0 && !leaves[0].isAdvanceLeave) {
      const { balance, pendingDays } = await leaveBalanceFor(employeeId);
      const available = balance - pendingDays;
      if (leaveDays(leaves) > available) {
        return c.json({ error: `Not enough leave balance: ${available} day(s) left after applications still waiting. Apply as Advance Leave instead.` }, 400);
      }
    }

    const ids: string[] = [];
    for (const leave of leaves) {
      const id = `${Date.now()}-${Math.random().toString(36).substring(7)}`;
      const key = `leave:${leave.employeeId}:${id}`;
      const savedLeave = { ...leave, id, appliedAt: new Date().toISOString() };
      await kv.set(key, savedLeave);
      ids.push(id);
    }
    // Every requested day's id in the order asked, whether saved now or already on file.
    const allIds = requested.map((l: any) => existingByDate.get(l.leaveDate)?.id || ids[leaves.findIndex((n) => n.leaveDate === l.leaveDate)]);

    const first = leaves[0];
    if (first && first.status === 'pending') {
      const sortedDates = leaves.map((l: any) => l.leaveDate).sort();
      const startDate = sortedDates[0];
      const endDate = sortedDates[sortedDates.length - 1];
      const dateRangeLabel = leaves.length > 1 ? `${startDate} to ${endDate} (${leaves.length} days)` : startDate;

      // attendance-employee: is a legacy/unused collection - real employee records
      // (name, managerId, authUserId) live under unified-employee:, keyed directly by employeeId.
      const applicant = await kv.get(`unified-employee:${first.employeeId}`);
      const employeeLabel = applicant?.name ? `${applicant.name} (${first.employeeId})` : first.employeeId;
      const escalateToClusterHead = first.isAdvanceLeave && first.approverRole === 'cluster_head';

      const title = escalateToClusterHead ? 'Advance Leave Approval Needed' : 'Leave Approval Needed';
      const message = escalateToClusterHead
        ? `${employeeLabel} requested ${first.advanceDaysRequested || leaves.length} day(s) of advance leave: ${dateRangeLabel} - escalated for cluster head approval`
        : `${employeeLabel} applied for leave: ${dateRangeLabel}`;

      const recipients = escalateToClusterHead ? await getAllClusterHeads() : await approversFor(applicant);

      for (const recipient of recipients) {
        if (recipient.authUserId) {
          // recordId is comma-joined so one Approve/Reject tap on the notification acts on
          // every day in this multi-day application, not just the first - see POST
          // /quick-action, which splits it back out.
          await notifyUser(recipient.authUserId, 'leave_pending', title, message, ids[0], startDate, { recordType: 'leave', recordId: ids.join(',') });
        }
      }
    }

    return c.json({ success: true, ids: allIds });
  } catch (error) {
    console.log('Error applying bulk leave:', error);
    return c.json({ error: 'Failed to apply leave' }, 500);
  }
});

// Executes an Approve/Reject action tapped directly from the Android notification tray
// (see QuickActionReceiver.java) - deliberately NOT gated by verifyUser/session, since a
// background broadcast receiver has no access to the device's live login session. Instead
// it's authorized by the single-use token minted in notifyUser/createQuickActionToken,
// which only ever grants the one action on the one record it was created for.
const QUICK_ACTION_TOKEN_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

app.post('/make-server-c2dd9b9d/quick-action', async (c) => {
  try {
    const { token } = await c.req.json();
    if (!token) {
      return c.json({ error: 'Missing token' }, 400);
    }

    const tokenKey = `quick_action_token:${token}`;
    const tokenRecord = await kv.get(tokenKey);
    if (!tokenRecord) {
      return c.json({ error: 'This action has expired or was already used' }, 404);
    }
    if (tokenRecord.used) {
      return c.json({ error: 'This action was already used' }, 409);
    }
    const age = Date.now() - new Date(tokenRecord.createdAt).getTime();
    if (age > QUICK_ACTION_TOKEN_MAX_AGE_MS) {
      return c.json({ error: 'This action has expired' }, 410);
    }

    // Mark used immediately (before performing the mutation) so a double-tap or retry
    // can't double-apply the action - the small risk of "marked used but the mutation
    // itself then failed" is an acceptable tradeoff for a fire-and-forget quick action.
    await kv.set(tokenKey, { ...tokenRecord, used: true, usedAt: new Date().toISOString() });

    const approverEmployeeId = await getEmployeeIdByAuthUserId(tokenRecord.approverUserId);
    const approver = approverEmployeeId ? await kv.get(`unified-employee:${approverEmployeeId}`) : null;
    // Tokens are minted only for active staff, so no active record now means the person was
    // archived since - their notification buttons must stop working along with their login.
    if (!approver) {
      return c.json({ error: 'This action is no longer available' }, 403);
    }
    const approverName = approver?.name || 'a manager';
    const approve = tokenRecord.action === 'approve';

    if (tokenRecord.recordType === 'leave') {
      const leaveIds: string[] = String(tokenRecord.recordId).split(',');
      let employeeAuthUserId: string | null = null;
      let sampleDate = '';

      for (const leaveId of leaveIds) {
        // Read each day directly - scanning every leave stopped at 1000 rows.
        const found = await findKvRecordById('leave:', leaveId);
        const leave = found?.value;
        if (!leave || leave.status !== 'pending') continue;

        const key = found!.key;
        const updated = approve
          ? { ...leave, status: 'approved', approvedBy: approverName, approvedAt: getNowIST() }
          : { ...leave, status: 'rejected', rejectedBy: approverName, rejectedAt: getNowIST(), rejectionReason: 'Rejected via notification quick action' };
        await kv.set(key, updated);
        sampleDate = leave.leaveDate;

        if (!employeeAuthUserId) {
          const employee = await kv.get(`unified-employee:${leave.employeeId}`);
          employeeAuthUserId = employee?.authUserId || null;
        }
      }

      for (const leaveId of leaveIds) await resolveNotifications(leaveId, { by: approverName, verb: approve ? 'approved' : 'rejected' });
      if (employeeAuthUserId) {
        const dateLabel = leaveIds.length > 1 ? `starting ${sampleDate} (${leaveIds.length} day(s))` : sampleDate;
        await notifyUser(
          employeeAuthUserId,
          approve ? 'leave_approved' : 'leave_rejected',
          approve ? 'Leave Approved ✓' : 'Leave Rejected ✗',
          `Your leave ${dateLabel} was ${approve ? 'approved' : 'rejected'} by ${approverName}`,
          leaveIds[0],
          sampleDate
        );
      }

      return c.json({ success: true, title: approve ? 'Leave approved' : 'Leave rejected', message: `${leaveIds.length} day(s) updated` });
    }

    if (tokenRecord.recordType === 'timesheet') {
      const found = await findKvRecordById('timesheet:', String(tokenRecord.recordId));
      const timesheet = found?.value;
      if (!timesheet) {
        return c.json({ error: 'Timesheet not found' }, 404);
      }
      if (timesheet.status !== 'pending') {
        return c.json({ success: true, title: 'Already resolved', message: 'This timesheet was already actioned' });
      }

      const key = found!.key;
      const updated = approve
        ? { ...timesheet, status: 'approved', approvedBy: approverName, approvedAt: getNowIST() }
        : { ...timesheet, status: 'rejected', rejectedBy: approverName, rejectedAt: new Date().toISOString(), rejectionReason: 'Rejected via notification quick action' };
      await kv.set(key, updated);
      await resolveNotifications(String(tokenRecord.recordId), { by: approverName, verb: approve ? 'approved' : 'rejected' });

      const employee = await kv.get(`unified-employee:${timesheet.employeeId}`);
      if (employee?.authUserId) {
        await notifyUser(
          employee.authUserId,
          approve ? 'timesheet_approved' : 'timesheet_rejected',
          approve ? 'Timesheet Approved ✓' : 'Timesheet Rejected ✗',
          `Your timesheet for ${timesheet.date} was ${approve ? 'approved' : 'rejected'} by ${approverName}`,
          tokenRecord.recordId,
          timesheet.date
        );
      }

      return c.json({ success: true, title: approve ? 'Timesheet approved' : 'Timesheet rejected', message: timesheet.date });
    }

    if (tokenRecord.recordType === 'production_request') {
      const request = await kv.get(`production_request_${tokenRecord.recordId}`);
      if (!request) {
        return c.json({ error: 'Production request not found' }, 404);
      }
      if (request.status !== 'shipped' && request.status !== 'partially-shipped') {
        return c.json({ success: true, title: 'Already resolved', message: 'This request was already actioned' });
      }

      const now = getNowIST();
      const finalStatus = request.status === 'partially-shipped' ? 'partially-delivered' : 'delivered';
      const updated = {
        ...request,
        status: finalStatus,
        deliveredAt: now,
        deliveredBy: approverEmployeeId || 'quick-action',
      };
      await creditStoreInventoryForDelivery(updated, tokenRecord.recordId);
      await kv.set(`production_request_${tokenRecord.recordId}`, updated);

      // Let the same stakeholders who got the "shipped" notification know it landed.
      const storeName = updated.storeName || 'Store';
      const opsManagers = await getOperationsManagers(updated.storeId);
      const clusterHeads = await getAllClusterHeads();
      const stakeholders = [...opsManagers, ...clusterHeads].filter((u: any) => u.authUserId);
      for (const stakeholder of stakeholders) {
        await notifyUser(
          stakeholder.authUserId,
          `production_request_${finalStatus}`,
          finalStatus === 'delivered' ? 'Production Delivered' : 'Production Partially Delivered',
          `${storeName}'s production request was marked ${finalStatus === 'delivered' ? 'delivered' : 'partially delivered'} by ${approverName}`,
          tokenRecord.recordId,
          updated.requestDate
        );
      }

      return c.json({ success: true, title: 'Marked delivered', message: updated.requestDate });
    }

    // A store's stock request, accepted from the production incharge's notification: the same as
    // Accept in the app (PUT /production-requests/:id/status) - it counts for "accepted by 9 AM".
    if (tokenRecord.recordType === 'stock_request') {
      const key = `production_request_${tokenRecord.recordId}`;
      const request = await kv.get(key);
      if (!request) return c.json({ error: 'Stock request not found' }, 404);
      if (request.status !== 'pending') {
        return c.json({ success: true, title: 'Already accepted', message: `This request is already ${request.status}` });
      }
      const now = new Date().toISOString();
      const updated = { ...request, status: 'accepted', updatedAt: now, acceptedAt: now, acceptedBy: approverName };
      await kv.set(key, updated);
      const storeName = updated.storeName || 'Unknown Store';
      const requestDate = new Date(updated.requestDate).toLocaleDateString();
      const storeIncharge = await getStoreIncharge(updated.storeId);
      const told = [storeIncharge, ...(await getOperationsManagers(updated.storeId)), ...(await getAllClusterHeads())].filter((u: any) => u?.authUserId);
      for (const person of told) {
        await notifyUser(person.authUserId, 'production_request_accepted', 'Production Request Accepted',
          `Production request from ${storeName} for ${requestDate} has been accepted by ${approverName} and is ready for preparation`, tokenRecord.recordId, updated.requestDate);
      }
      await resolveNotifications(String(tokenRecord.recordId), { by: approverName, verb: 'accepted' });
      return c.json({ success: true, title: 'Request accepted', message: `${storeName} · ${requestDate}` });
    }

    // The owner's OK on a repair, labour or equipment expense above ₹2,000 (expenseReview.ts).
    if (tokenRecord.recordType === 'expense_approval') {
      const r: any = await settleApproval(expenseReviewDeps, String(tokenRecord.recordId), approve, approverName);
      if (r.error) return r.status === 409 ? c.json({ success: true, title: 'Already decided', message: r.error }) : c.json({ error: r.error }, r.status);
      return c.json({ success: true, title: approve ? 'Expense OK' : 'Marked not OK', message: `${r.entry?.itemName || r.entry?.description || 'Expense'} · ${r.entry?.date || ''}` });
    }

    // "Looks OK" on an AI photo flag: the same as a reviewer's OK in Workplace checks.
    if (tokenRecord.recordType === 'workplace_photo') {
      const [date, employeeId, itemId] = String(tokenRecord.recordId).split('|');
      const it = await markCheckOk(kv, { date, employeeId, itemId, by: approverName, byId: approverEmployeeId || undefined });
      if (!it) return c.json({ error: 'That photo check is no longer there' }, 404);
      return c.json({ success: true, title: 'Marked OK', message: it.name });
    }

    return c.json({ error: 'Unknown record type' }, 400);
  } catch (error) {
    console.log('Error executing quick action:', error);
    return c.json({ error: 'Failed to execute action' }, 500);
  }
});

// Approve leave
app.post('/make-server-c2dd9b9d/leaves/:leaveId/approve', async (c) => {
  try {
    const leaveId = c.req.param('leaveId');
    const { managerId, managerName } = await c.req.json();
    
    // Find the leave
    const found = await findKvRecordById('leave:', leaveId);
    const leave = found?.value;

    if (!leave) {
      return c.json({ error: 'Leave not found' }, 404);
    }
    const auth = await verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);
    if (!(await canApproveFor(auth.user, leave.employeeId))) {
      return c.json({ error: 'You can only approve leave of your own staff' }, 403);
    }

    const key = found!.key;
    const approvedLeave = {
      ...leave,
      status: 'approved',
      approvedBy: managerName,
      approvedAt: getNowIST()
    };
    await kv.set(key, approvedLeave);
    
    // Notify the employee
    const employee = await kv.get(`unified-employee:${leave.employeeId}`);
    if (employee?.authUserId) {
      await notifyUser(
        employee.authUserId,
        'leave_approved',
        'Leave Approved ✓',
        `Your leave on ${leave.leaveDate} has been approved by ${managerName}`,
        leaveId,
        leave.leaveDate
      );
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error approving leave:', error);
    return c.json({ error: 'Failed to approve leave' }, 500);
  }
});

// Reject leave
app.post('/make-server-c2dd9b9d/leaves/:leaveId/reject', async (c) => {
  try {
    const leaveId = c.req.param('leaveId');
    const { managerId, managerName, reason } = await c.req.json();
    
    // Find the leave
    const found = await findKvRecordById('leave:', leaveId);
    const leave = found?.value;

    if (!leave) {
      return c.json({ error: 'Leave not found' }, 404);
    }
    const auth = await verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return c.json({ error: auth.error }, auth.status);
    if (!(await canApproveFor(auth.user, leave.employeeId))) {
      return c.json({ error: 'You can only reject leave of your own staff' }, 403);
    }

    const key = found!.key;
    const rejectedLeave = {
      ...leave,
      status: 'rejected',
      rejectedBy: managerName,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    };
    await kv.set(key, rejectedLeave);
    
    // Notify the employee
    const employee = await kv.get(`unified-employee:${leave.employeeId}`);
    if (employee?.authUserId) {
      await notifyUser(
        employee.authUserId,
        'leave_rejected',
        'Leave Rejected ✗',
        `Your leave on ${leave.leaveDate} was rejected by ${managerName}. Reason: ${reason}`,
        leaveId,
        leave.leaveDate
      );
    }
    
    return c.json({ success: true });
  } catch (error) {
    console.log('Error rejecting leave:', error);
    return c.json({ error: 'Failed to reject leave' }, 500);
  }
});

// Delete a leave application - only while it's still awaiting a decision. Once a manager
// or cluster head has approved it, the leave balance/notifications already reflect it, so
// deleting it out from under that record would leave things inconsistent; a rejected
// leave is also left alone (it's already resolved and visible as history) - only 'pending'
// can be removed, e.g. an employee who applied for the wrong date and wants to redo it.
app.delete('/make-server-c2dd9b9d/leaves/:leaveId', async (c) => {
  try {
    const leaveId = c.req.param('leaveId');

    const found = await findKvRecordById('leave:', leaveId);
    const leave = found?.value;

    if (!leave) {
      return c.json({ error: 'Leave not found' }, 404);
    }
    // Only the person themself, or the owner and managers, take back a leave request.
    const caller = await callerOf(c);
    if (caller.role !== 'cluster_head' && caller.role !== 'manager' && String(leave.employeeId) !== caller.employeeId) {
      return c.json({ error: 'You can only take back your own leave request' }, 403);
    }
    if (leave.status !== 'pending') {
      return c.json({ error: `Cannot delete a leave that has already been ${leave.status}` }, 400);
    }

    const key = found!.key;
    await kv.del(key);

    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting leave:', error);
    return c.json({ error: 'Failed to delete leave' }, 500);
  }
});

// ===== Unified Employee Management =====

// Get all unified employees
app.get('/make-server-c2dd9b9d/unified-employees', async (c) => {
  try {
    console.log('GET /unified-employees - Fetching all employees');
    const employees = await kv.getByPrefix('unified-employee:');
    console.log('GET /unified-employees - Found', employees.length, 'employees');
    const viewer = await viewerOf(c);
    return c.json({ employees: employees.map((e: any) => employeeForViewer(e, viewer)) });
  } catch (error) {
    console.log('Error fetching unified employees:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Get employees by manager (MUST BE BEFORE /:employeeId route)
app.get('/make-server-c2dd9b9d/unified-employees/manager/:managerId', async (c) => {
  try {
    const managerId = c.req.param('managerId');
    console.log('=== GET /unified-employees/manager/:managerId ROUTE HIT ===');
    console.log('Fetching employees for managerId:', managerId);
    console.log('Request path:', c.req.path);
    console.log('Request method:', c.req.method);
    
    const allEmployees = await kv.getByPrefix('unified-employee:');
    console.log('Total unified employees found:', allEmployees.length);

    const employees = allEmployees.filter((emp: any) => emp.managerId === managerId);
    console.log('Filtered employees for manager:', employees.length);

    // Same who-sees-what as the other employee lists - this one used to hand managers
    // everyone's Aadhaar images.
    const viewer = await viewerOf(c);
    return c.json({ employees: employees.map((e: any) => employeeForViewer(e, viewer)) });
  } catch (error) {
    console.log('Error fetching employees by manager:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Get managers by cluster head (MUST BE BEFORE /:employeeId route)
app.get('/make-server-c2dd9b9d/unified-employees/cluster-head/:clusterHeadId', async (c) => {
  try {
    const clusterHeadId = c.req.param('clusterHeadId');
    console.log('=== GET /unified-employees/cluster-head/:clusterHeadId ROUTE HIT ===');
    console.log('Fetching managers for clusterHeadId:', clusterHeadId);
    
    const allEmployees = await kv.getByPrefix('unified-employee:');
    console.log('Total unified employees found:', allEmployees.length);
    
    // Log all managers in the system
    const allManagers = allEmployees.filter((emp: any) => emp.role === 'manager');
    console.log('All managers in system:', allManagers.map((m: any) => ({
      id: m.employeeId,
      name: m.name,
      clusterHeadId: m.clusterHeadId,
      hasClusterHead: !!m.clusterHeadId
    })));
    
    const managers = allEmployees.filter((emp: any) => emp.clusterHeadId === clusterHeadId && emp.role === 'manager');
    console.log('Filtered managers for cluster head', clusterHeadId, ':', managers.length);
    console.log('Filtered managers:', managers.map((m: any) => ({
      id: m.employeeId,
      name: m.name,
      clusterHeadId: m.clusterHeadId
    })));

    const viewer = await viewerOf(c);
    return c.json({ managers: managers.map((m: any) => employeeForViewer(m, viewer)) });
  } catch (error) {
    console.log('Error fetching managers by cluster head:', error);
    return c.json({ error: 'Failed to fetch managers' }, 500);
  }
});

// Employee ids are never reused. Timesheets, leave, payouts and advances are all keyed by
// employee id, so a new hire handed a former employee's id (the app used to pick "highest
// active id + 1", ignoring archived staff) inherited their whole history. The next number is
// one past the highest ever issued: a stored counter, plus a scan of active, archived and old
// employee: records for ids issued before the counter existed.
const EMPLOYEE_ID_COUNTER_KEY = 'counter:employee-id';

async function issueNextEmployeeId(): Promise<string> {
  const [active, archived, legacy, counter] = await Promise.all([
    getAllByPrefixWithRetry('unified-employee:'),
    getAllByPrefixWithRetry('archived-employee:'),
    getAllByPrefixWithRetry('employee:'),
    kv.get(EMPLOYEE_ID_COUNTER_KEY),
  ]);
  let highest = Number(counter?.last) || 0;
  for (const emp of [...active, ...archived, ...legacy]) {
    for (const id of [emp?.employeeId, emp?.id]) {
      const match = typeof id === 'string' ? id.match(/^BM(\d+)$/i) : null;
      if (match) highest = Math.max(highest, parseInt(match[1], 10));
    }
  }
  // Skip past any id still taken (e.g. two hires created at the same moment).
  let next = highest + 1;
  const idFor = (n: number) => `BM${n.toString().padStart(3, '0')}`;
  while (
    (await kv.get(`unified-employee:${idFor(next)}`)) ||
    (await kv.get(`archived-employee:${idFor(next)}`)) ||
    (await kv.get(`employee:${idFor(next)}`))
  ) next++;
  await kv.set(EMPLOYEE_ID_COUNTER_KEY, { last: next, updatedAt: new Date().toISOString() });
  return idFor(next);
}

// Create unified employee (Manager or Employee with unique ID BM001, BM002, etc.)
app.post('/make-server-c2dd9b9d/unified-employees', async (c) => {
  try {
    const employeeData = await c.req.json();

    if (!employeeData.name || !employeeData.email || !employeeData.password) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // The id is always issued here (any id the app sent is ignored) - see issueNextEmployeeId.
    employeeData.employeeId = await issueNextEmployeeId();

    // Create Supabase auth account
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email: employeeData.email,
      password: employeeData.password,
      user_metadata: { 
        name: employeeData.name, 
        role: employeeData.role,
        employeeId: employeeData.employeeId,
        managerId: employeeData.managerId,
        clusterHeadId: employeeData.clusterHeadId,
        joiningDate: employeeData.joiningDate
      },
      email_confirm: true
    });
    
    if (authError) {
      console.log('Error creating auth user:', authError);
      return c.json({ error: authError.message }, 400);
    }
    
    // Store unified employee details
    const employee = {
      ...employeeData,
      authUserId: authData.user.id,
      id: employeeData.employeeId // Use employeeId as the primary ID
    };
    
    delete employee.password; // Don't store password in KV
    
    await kv.set(`unified-employee:${employeeData.employeeId}`, employee);
    
    return c.json({ success: true, employee });
  } catch (error) {
    console.log('Error creating unified employee:', error);
    return c.json({ error: 'Failed to create employee' }, 500);
  }
});

// Delete unified employee (Archive with employment history)
app.delete('/make-server-c2dd9b9d/unified-employees/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    
    // Get employee to find auth user ID
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    // Calculate total earnings from payouts (paginated: payouts pass 1000 rows)
    const payouts = await getAllByPrefixWithRetry('payout:');
    const employeePayouts = payouts.filter((p: any) => p.employeeId === employeeId);
    const totalEarnings = employeePayouts.reduce((sum: number, p: any) => sum + (p.amount || 0), 0);

    // Disable the login (kept, not deleted, so a restore can switch it back on)
    const loginRevoked = await setEmployeeLoginBlocked(employee.authUserId, true);

    // Archive the employee with release information
    const archivedEmployee = {
      ...employee,
      isActive: false,
      releasedAt: new Date().toISOString(),
      totalEarnings,
      joiningDate: employee.joiningDate || employee.createdAt,
      archivedFrom: `unified-employee:${employeeId}`,
    };
    
    // Save to archived employees
    await kv.set(`archived-employee:${employeeId}`, archivedEmployee);
    
    // Delete from active employees
    await kv.del(`unified-employee:${employeeId}`);
    
    console.log('Employee archived successfully. Total earnings:', totalEarnings);

    return c.json({ success: true, archived: archivedEmployee, loginRevoked });
  } catch (error) {
    console.log('Error deleting unified employee:', error);
    return c.json({ error: 'Failed to delete employee' }, 500);
  }
});

// Reset employee password
app.post('/make-server-c2dd9b9d/unified-employees/:employeeId/reset-password', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const { newPassword } = await c.req.json();
    
    if (!newPassword) {
      return c.json({ error: 'New password is required' }, 400);
    }
    
    // Get employee to find auth user ID
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    let authUserId = employee.authUserId;
    let needsNewAccount = false;
    
    // If employee has an authUserId, verify the user still exists
    if (authUserId) {
      const { data: existingUser, error: getUserError } = await supabase.auth.admin.getUserById(authUserId);
      
      if (getUserError || !existingUser.user) {
        console.log(`Auth user ${authUserId} not found for employee ${employeeId}, will create new account`);
        needsNewAccount = true;
        authUserId = null;
      }
    } else {
      needsNewAccount = true;
    }
    
    // Create new auth account if needed
    if (needsNewAccount) {
      console.log(`Creating auth account for employee ${employeeId} during password reset`);
      
      const { data: authData, error: createError } = await supabase.auth.admin.createUser({
        email: employee.email,
        password: newPassword,
        email_confirm: true,
        user_metadata: {
          employeeId: employee.employeeId,
          name: employee.name,
          role: employee.role
        }
      });
      
      if (createError || !authData.user) {
        console.log('Error creating auth account during password reset:', createError);
        return c.json({ error: 'Failed to create auth account: ' + (createError?.message || 'Unknown error') }, 500);
      }
      
      authUserId = authData.user.id;
      
      // Update employee with auth user ID
      employee.authUserId = authUserId;
      await kv.set(`unified-employee:${employeeId}`, employee);
      
      console.log(`Auth account created for employee ${employeeId}: ${authUserId}`);
    } else {
      // Update existing auth account password
      const { error } = await supabase.auth.admin.updateUserById(
        authUserId,
        { password: newPassword }
      );
      
      if (error) {
        console.log('Error resetting password:', error);
        return c.json({ error: error.message }, 400);
      }
    }
    
    return c.json({ 
      success: true, 
      message: 'Password reset successfully',
      credentials: {
        email: employee.email,
        password: newPassword,
        employeeId: employee.employeeId
      }
    });
  } catch (error) {
    console.log('Error resetting employee password:', error);
    return c.json({ error: 'Failed to reset password' }, 500);
  }
});

// Assign manager to employee (MUST BE BEFORE generic /:employeeId route)
app.put('/make-server-c2dd9b9d/unified-employees/:employeeId/assign-manager', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can assign managers
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can assign managers to employees' }, 403);
    }

    const employeeId = c.req.param('employeeId');
    const { managerId } = await c.req.json();

    console.log(`Assigning manager ${managerId} to employee ${employeeId}`);

    // Get the employee record
    const employeeKey = `unified-employee:${employeeId}`;
    const employee = await kv.get(employeeKey);

    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Verify the manager exists and is a manager
    const managerKey = `unified-employee:${managerId}`;
    const manager = await kv.get(managerKey);

    if (!manager) {
      return c.json({ error: 'Manager not found' }, 404);
    }

    if (manager.role !== 'manager') {
      return c.json({ error: 'The specified user is not a manager' }, 400);
    }

    // Verify the manager belongs to the same cluster head or was created by them
    const clusterHeadId = authResult.user.user_metadata?.employeeId;
    const clusterHeadEmail = authResult.user.email;
    
    console.log(`Checking manager assignment permissions:`, {
      managerId: manager.employeeId,
      managerName: manager.name,
      managerClusterHeadId: manager.clusterHeadId,
      managerCreatedBy: manager.createdBy,
      currentClusterHeadId: clusterHeadId,
      currentClusterHeadEmail: clusterHeadEmail
    });
    
    // Cluster heads can assign any manager within their organization
    // For simplicity in prototype, allow all managers to be assigned by any cluster head
    // In production, you'd want stricter validation based on organization structure
    console.log(`Cluster head ${clusterHeadEmail} is assigning manager ${manager.employeeId} - allowing assignment`);
    
    // Skip validation for now - cluster heads have full assignment rights
    // if (!isManagerUnderThisClusterHead) {
    //   console.log(`Assignment blocked - manager not under this cluster head's organization`);
    //   return c.json({ error: 'You can only assign managers from your organization' }, 403);
    // }

    // Update the employee with the new manager
    const updatedEmployee = {
      ...employee,
      managerId: managerId,
      updatedAt: new Date().toISOString()
    };

    await kv.set(employeeKey, updatedEmployee);
    console.log(`Successfully assigned manager ${managerId} to employee ${employeeId}`);

    return c.json({ success: true, employee: updatedEmployee });
  } catch (error) {
    console.log('Error assigning manager:', error);
    return c.json({ error: 'Failed to assign manager' }, 500);
  }
});

// Update unified employee
app.put('/make-server-c2dd9b9d/unified-employees/:employeeId', async (c) => {
  try {
    const employeeId = c.req.param('employeeId');
    const updates = await c.req.json();
    
    console.log('Update unified employee - employeeId:', employeeId);
    console.log('Update unified employee - updates:', Object.keys(updates || {}));
    
    // Debug: List all employee keys to check what exists
    const allEmployees = await kv.getByPrefix('unified-employee:');
    console.log('Update unified employee - All employee IDs in system:', allEmployees.map((e: any) => e.employeeId || 'no-id'));
    
    // Get existing employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    console.log('Update unified employee - existing employee found:', employee ? 'yes' : 'no');
    
    if (!employee) {
      console.log('Update unified employee - ERROR: Employee not found');
      return c.json({ error: 'Employee not found' }, 404);
    }
    
    // Update employee details (preserve immutable fields)
    const updatedEmployee = {
      ...employee,
      ...updates,
      employeeId: employee.employeeId, // Don't allow changing ID
      authUserId: employee.authUserId, // Don't allow changing auth ID
      createdBy: employee.createdBy, // Don't allow changing creator
      createdAt: employee.createdAt, // Don't allow changing creation date
    };
    
    console.log('Update unified employee - updated employee data:', updatedEmployee?.employeeId);
    
    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, updatedEmployee);
    console.log('Update unified employee - KV store updated successfully');
    
    // Update auth metadata if email, name, role, designation, department, or storeId changed
    if (employee.authUserId && (updates.email || updates.name || updates.role || updates.designation !== undefined || updates.department !== undefined || updates.storeId !== undefined)) {
      try {
        console.log('Update unified employee - updating auth user:', employee.authUserId);
        await supabase.auth.admin.updateUserById(
          employee.authUserId,
          {
            email: updates.email || employee.email,
            user_metadata: {
              name: updates.name || employee.name,
              role: updates.role || employee.role,
              employeeId: employee.employeeId,
              managerId: updates.managerId || employee.managerId,
              clusterHeadId: updates.clusterHeadId || employee.clusterHeadId,
              joiningDate: updates.joiningDate || employee.joiningDate,
              designation: updates.designation !== undefined ? updates.designation : employee.designation,
              department: updates.department !== undefined ? updates.department : employee.department,
              storeId: updates.storeId !== undefined ? updates.storeId : employee.storeId,
            }
          }
        );
        console.log('Update unified employee - auth user updated successfully');
      } catch (authError) {
        console.log('Update unified employee - ERROR updating auth user:', authError);
        // Continue even if auth update fails
      }
    }
    
    console.log('Update unified employee - SUCCESS');
    return c.json({ success: true, employee: updatedEmployee });
  } catch (error) {
    console.log('Update unified employee - FATAL ERROR:', error);
    return c.json({ error: 'Failed to update employee', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Assign cluster head to manager
app.put('/make-server-c2dd9b9d/unified-employees/:managerId/assign-cluster-head', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const managerId = c.req.param('managerId');
    const { clusterHeadId } = await c.req.json();
    
    console.log('=== ASSIGN CLUSTER HEAD TO MANAGER ===');
    console.log('Manager ID:', managerId);
    console.log('Cluster Head ID:', clusterHeadId);
    
    // Get the manager
    const manager = await kv.get(`unified-employee:${managerId}`);
    
    if (!manager) {
      return c.json({ error: 'Manager not found' }, 404);
    }
    
    if (manager.role !== 'manager') {
      return c.json({ error: 'Target employee is not a manager' }, 400);
    }
    
    // Verify cluster head exists and has correct role
    if (clusterHeadId) {
      const clusterHead = await kv.get(`unified-employee:${clusterHeadId}`);
      if (!clusterHead) {
        return c.json({ error: 'Cluster head not found' }, 404);
      }
      if (clusterHead.role !== 'cluster_head') {
        return c.json({ error: 'Assigned employee is not a cluster head' }, 400);
      }
    }
    
    // Update manager with cluster head assignment
    manager.clusterHeadId = clusterHeadId;
    await kv.set(`unified-employee:${managerId}`, manager);
    
    // Update auth metadata
    if (manager.authUserId) {
      try {
        await supabase.auth.admin.updateUserById(
          manager.authUserId,
          {
            user_metadata: {
              ...manager,
              clusterHeadId: clusterHeadId
            }
          }
        );
      } catch (authError) {
        console.log('Error updating auth metadata:', authError);
      }
    }
    
    return c.json({ 
      success: true, 
      message: 'Cluster head assigned successfully',
      manager 
    });
  } catch (error) {
    console.log('Error assigning cluster head:', error);
    return c.json({ error: 'Failed to assign cluster head' }, 500);
  }
});

// Get organizational hierarchy
app.get('/make-server-c2dd9b9d/organizational-hierarchy', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const storeId = c.req.query('storeId');
    // Every record cleaned for the viewer: no Aadhaar images, and pay, birthday and phone only for
    // the owner, managers and audit (security review, 28 Oct 2026).
    const hierarchyViewer = await viewerOf(c);
    let allEmployees = (await kv.getByPrefix('unified-employee:')).map((e: any) => employeeForViewer(e, hierarchyViewer));
    
    console.log(`[Hierarchy] Total employees before filtering: ${allEmployees.length}`);
    console.log(`[Hierarchy] Requested storeId: ${storeId || 'ALL'}`);
    
    // Filter by store if specified
    // IMPORTANT: Also include employees without a storeId (newly created employees)
    if (storeId) {
      allEmployees = allEmployees.filter((emp: any) => emp.storeId === storeId || !emp.storeId);
      console.log(`[Hierarchy] Employees after store filter (including unassigned): ${allEmployees.length}`);
    }
    
    // Organize by role
    const clusterHeads = allEmployees.filter((emp: any) => emp.role === 'cluster_head');
    const managers = allEmployees.filter((emp: any) => emp.role === 'manager');
    const employees = allEmployees.filter((emp: any) => emp.role === 'employee');
    
    console.log(`[Hierarchy] Breakdown - Cluster Heads: ${clusterHeads.length}, Managers: ${managers.length}, Employees: ${employees.length}`);
    
    // Helper function to recursively build manager hierarchy
    const buildManagerHierarchy = (managerId: string, allManagers: any[], allEmployees: any[]): any => {
      // Get subordinate managers (managers who report to this manager)
      const subordinateManagers = allManagers.filter((m: any) => m.managerId === managerId);
      
      // Get direct employees (non-managers) under this manager
      // Fall back to inchargeId for employees that have an incharge but no managerId
      // (e.g. production staff assigned to their production incharge) - without this they
      // appeared nowhere in the tree.
      const directEmployees = allEmployees.filter((e: any) =>
        e.managerId === managerId || (!e.managerId && e.inchargeId === managerId));
      
      // Recursively build subordinate manager hierarchies
      const managersWithHierarchy = subordinateManagers.map((subMgr: any) => {
        const subHierarchy = buildManagerHierarchy(subMgr.employeeId, allManagers, allEmployees);
        return {
          ...subMgr,
          managers: subHierarchy.managers,
          employees: subHierarchy.employees
        };
      });
      
      return {
        managers: managersWithHierarchy,
        employees: directEmployees
      };
    };
    
    // Build hierarchy structure with multi-level manager support
    const hierarchy = clusterHeads.map((ch: any) => {
      // Get top-level managers (those directly reporting to cluster head)
      // This includes managers with managerId === cluster head ID OR (no managerId AND clusterHeadId === cluster head ID)
      const topLevelManagers = managers.filter((m: any) => 
        m.clusterHeadId === ch.employeeId && (!m.managerId || m.managerId === ch.employeeId)
      );
      
      // Build each top-level manager's hierarchy recursively
      const managersWithHierarchy = topLevelManagers.map((m: any) => {
        const hierarchy = buildManagerHierarchy(m.employeeId, managers, employees);
        return {
          ...m,
          managers: hierarchy.managers,
          employees: hierarchy.employees
        };
      });
      
      return {
        ...ch,
        managers: managersWithHierarchy
      };
    });
    
    // Also include unassigned managers and employees (managers without cluster head OR manager assignment)
    const unassignedManagers = managers
      .filter((m: any) => !m.clusterHeadId && !m.managerId)  // Only show if BOTH are missing
      .map((m: any) => {
        const hierarchy = buildManagerHierarchy(m.employeeId, managers, employees);
        return {
          ...m,
          managers: hierarchy.managers,
          employees: hierarchy.employees
        };
      });
    
    console.log('[Hierarchy Debug] Manager filtering:', {
      totalManagers: managers.length,
      managersWithClusterHead: managers.filter((m: any) => m.clusterHeadId).map((m: any) => `${m.employeeId} (CH: ${m.clusterHeadId})`),
      managersWithManagerId: managers.filter((m: any) => m.managerId).map((m: any) => `${m.employeeId} (MGR: ${m.managerId})`),
      unassignedCount: unassignedManagers.length,
      unassigned: unassignedManagers.map((m: any) => m.employeeId)
    });
    
    // "Unassigned" = not reachable from any manager in the tree above (not just "has no
    // managerId") - an employee pointing at the cluster head directly or at someone who
    // isn't a manager used to vanish from the page entirely.
    const placedEmployeeIds = new Set<string>();
    const collectPlaced = (node: any) => {
      (node.employees || []).forEach((e: any) => placedEmployeeIds.add(e.employeeId));
      (node.managers || []).forEach(collectPlaced);
    };
    hierarchy.forEach(collectPlaced);
    unassignedManagers.forEach(collectPlaced);
    const unassignedEmployees = employees.filter((e: any) => !placedEmployeeIds.has(e.employeeId));
    
    return c.json({ 
      hierarchy,
      unassignedManagers,
      unassignedEmployees,
      stats: {
        totalClusterHeads: clusterHeads.length,
        totalManagers: managers.length,
        totalEmployees: employees.length
      }
    });
  } catch (error) {
    console.log('Error fetching organizational hierarchy:', error);
    return c.json({ error: 'Failed to fetch organizational hierarchy' }, 500);
  }
});

// Migration utility: Assign storeIds to employees based on their manager's store
app.post('/make-server-c2dd9b9d/migrate-employee-stores', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can run migrations
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can run migrations' }, 403);
  }

  try {
    console.log('Starting employee store migration...');
    const allEmployees = await kv.getByPrefix('unified-employee:');
    
    let updated = 0;
    let skipped = 0;
    let errors = 0;
    let needsManualAssignment = 0;
    const updates = [];
    const manualAssignmentNeeded = [];
    const errorDetails = [];

    for (const employee of allEmployees) {
      // Skip if already has storeId
      if (employee.storeId) {
        skipped++;
        continue;
      }

      // Skip cluster heads - they don't belong to a specific store
      if (employee.role === 'cluster_head') {
        skipped++;
        continue;
      }

      // For managers without storeId, they need manual assignment via store management
      if (employee.role === 'manager') {
        console.log(`Manager ${employee.employeeId} (${employee.name}) needs storeId assigned via store management`);
        needsManualAssignment++;
        manualAssignmentNeeded.push({
          employeeId: employee.employeeId,
          name: employee.name,
          role: employee.role,
          reason: 'Manager needs store assignment via Store Management'
        });
        continue;
      }

      // For employees (or any role that's not manager/cluster_head), get storeId from their manager
      const isNonManagerRole = employee.role !== 'manager' && employee.role !== 'cluster_head';
      
      if (isNonManagerRole && employee.managerId) {
        const manager = await kv.get(`unified-employee:${employee.managerId}`);
        if (manager && manager.storeId) {
          employee.storeId = manager.storeId;
          await kv.set(`unified-employee:${employee.employeeId}`, employee);
          updates.push({
            employeeId: employee.employeeId,
            name: employee.name,
            role: employee.role,
            assignedStoreId: manager.storeId
          });
          updated++;
          console.log(`Assigned storeId ${manager.storeId} to employee ${employee.employeeId} (${employee.name}) with role ${employee.role}`);
        } else if (manager && !manager.storeId) {
          console.log(`Cannot assign storeId to employee ${employee.employeeId} - manager ${employee.managerId} has no storeId`);
          needsManualAssignment++;
          manualAssignmentNeeded.push({
            employeeId: employee.employeeId,
            name: employee.name,
            role: employee.role,
            managerId: employee.managerId,
            managerName: manager.name,
            reason: `Manager ${manager.name} needs store assignment first`
          });
        } else {
          console.log(`Cannot find manager ${employee.managerId} for employee ${employee.employeeId}`);
          errors++;
          errorDetails.push({
            employeeId: employee.employeeId,
            name: employee.name,
            role: employee.role,
            reason: `Manager ID ${employee.managerId} not found`
          });
        }
      } else if (isNonManagerRole && !employee.managerId) {
        console.log(`Employee ${employee.employeeId} (role: ${employee.role}) has no managerId assigned`);
        needsManualAssignment++;
        manualAssignmentNeeded.push({
          employeeId: employee.employeeId,
          name: employee.name,
          role: employee.role,
          reason: 'No manager assigned - needs manual assignment'
        });
      } else if (!isNonManagerRole && employee.role !== 'manager' && employee.role !== 'cluster_head') {
        // This case should never happen now, but keep for safety
        console.log(`Skipping ${employee.employeeId} - unexpected role: ${employee.role}`);
        errors++;
        errorDetails.push({
          employeeId: employee.employeeId,
          name: employee.name,
          role: employee.role,
          reason: `Unexpected role: ${employee.role}`
        });
      }
    }

    console.log(`Migration complete: ${updated} updated, ${skipped} skipped, ${needsManualAssignment} need manual assignment, ${errors} errors`);

    return c.json({
      success: true,
      summary: {
        total: allEmployees.length,
        updated,
        skipped,
        needsManualAssignment,
        errors
      },
      updates,
      manualAssignmentNeeded,
      errorDetails
    });
  } catch (error) {
    console.log('Error running employee store migration:', error);
    return c.json({ error: 'Failed to run migration' }, 500);
  }
});

// Get all cluster heads
app.get('/make-server-c2dd9b9d/cluster-heads', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const allEmployees = await kv.getByPrefix('unified-employee:');
    const clusterHeads = allEmployees.filter((emp: any) => emp.role === 'cluster_head');
    const viewer = await viewerOf(c);
    return c.json({ clusterHeads: clusterHeads.map((e: any) => employeeForViewer(e, viewer)) });
  } catch (error) {
    console.log('Error fetching cluster heads:', error);
    return c.json({ error: 'Failed to fetch cluster heads' }, 500);
  }
});

// Assign manager to employee (updates managerId and storeId to match manager's store)
app.post('/make-server-c2dd9b9d/assign-manager-to-employee', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can assign managers
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can assign managers' }, 403);
  }

  try {
    const { employeeId, managerId } = await c.req.json();
    
    if (!employeeId || !managerId) {
      return c.json({ error: 'Employee ID and Manager ID are required' }, 400);
    }

    console.log(`Assigning manager ${managerId} to employee ${employeeId}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Get the manager (can be a manager or cluster head)
    const manager = await kv.get(`unified-employee:${managerId}`);
    if (!manager) {
      return c.json({ error: 'Manager not found' }, 404);
    }

    // Allow assigning to both managers and cluster heads (for multi-level hierarchy)
    if (manager.role !== 'manager' && manager.role !== 'cluster_head') {
      return c.json({ error: 'Selected user must be a manager or cluster head' }, 400);
    }

    // Update employee's managerId and storeId to match manager's store
    employee.managerId = managerId;
    // The mirror of assign-incharge clearing managerId: an old incharge would otherwise stay
    // this person's approver (approversFor tries the incharge first).
    delete employee.inchargeId;
    if (manager.storeId) {
      employee.storeId = manager.storeId;
    }

    await kv.set(`unified-employee:${employeeId}`, employee);

    console.log(`Successfully assigned manager ${managerId} to employee ${employeeId}, storeId: ${employee.storeId || 'none'}`);

    return c.json({
      success: true,
      employee
    });
  } catch (error) {
    console.log('Error assigning manager to employee:', error);
    return c.json({ error: 'Failed to assign manager' }, 500);
  }
});

// Update employee role (for fixing custom roles)
app.put('/make-server-c2dd9b9d/employee/:employeeId/role', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can update roles
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can update employee roles' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { newRole } = await c.req.json();
    
    if (!newRole || !['employee', 'manager', 'cluster_head'].includes(newRole)) {
      return c.json({ error: 'Invalid role. Must be: employee, manager, or cluster_head' }, 400);
    }

    console.log(`Updating role for ${employeeId} to ${newRole}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    const oldRole = employee.role;
    employee.role = newRole;

    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, employee);

    // Update in Supabase Auth metadata - only the role. (It used to spread the owner's
    // metadata, then the person's own; but user_metadata is self-editable and every trusted
    // key in it is copied into app_metadata, so copying it let a self-set designation, store
    // or employee id become trusted. GoTrue merges metadata, so sending just the role is enough.)
    if (employee.authUserId) {
      await supabase.auth.admin.updateUserById(employee.authUserId, {
        user_metadata: { role: newRole }
      });
    }

    console.log(`Successfully updated role for ${employeeId} from ${oldRole} to ${newRole}`);

    return c.json({
      success: true,
      employee,
      message: `Role updated from ${oldRole} to ${newRole}`
    });
  } catch (error) {
    console.log('Error updating employee role:', error);
    return c.json({ error: 'Failed to update role' }, 500);
  }
});

// Update employee store assignment
app.put('/make-server-c2dd9b9d/employee/:employeeId/store', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can reassign stores
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can reassign employee stores' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { newStoreId } = await c.req.json();
    
    if (!newStoreId) {
      return c.json({ error: 'Store ID is required' }, 400);
    }

    console.log(`Reassigning employee ${employeeId} to store ${newStoreId}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Kitchen staff belong to a production house (their storeId holds its id); everyone else
    // to a store. Setting a production incharge to a store filed their production entries
    // under that store.
    const kitchenStaff = employee.designation === 'production_incharge' || employee.designation === 'production_ops' || employee.department === 'production';
    const store = await kv.get(kitchenStaff ? `production_house_${newStoreId}` : `store:${newStoreId}`);
    if (!store) {
      return c.json({ error: kitchenStaff ? 'Pick one of the production houses for kitchen staff' : 'Store not found' }, kitchenStaff ? 400 : 404);
    }

    const oldStoreId = employee.storeId || 'none';
    
    // If this is a store incharge, check if they're the only one for their current store
    if (employee.designation === 'store_incharge' && oldStoreId !== 'none' && oldStoreId !== newStoreId) {
      // Get all employees
      const allEmployees = await kv.getByPrefix('unified-employee:');
      
      // Count store incharges in the old store (excluding current employee)
      const storeInchargesInOldStore = allEmployees.filter((emp: any) => 
        emp.storeId === oldStoreId && 
        emp.designation === 'store_incharge' && 
        emp.employeeId !== employeeId
      );
      
      if (storeInchargesInOldStore.length === 0) {
        return c.json({ 
          error: `Cannot reassign this Store Incharge to another store. This is the only Store Incharge for store ${oldStoreId}. Each store must have at least one Store Incharge. Please assign another Store Incharge for store ${oldStoreId} before reassigning this employee.` 
        }, 400);
      }
    }
    
    employee.storeId = newStoreId;

    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, employee);
    // The server's checks read storeId from the login, so it moves too (GoTrue merges metadata).
    if (employee.authUserId) {
      await supabase.auth.admin.updateUserById(employee.authUserId, { user_metadata: { storeId: newStoreId } });
    }

    console.log(`Successfully reassigned employee ${employeeId} from store ${oldStoreId} to ${newStoreId}`);

    return c.json({
      success: true,
      employee,
      message: `Store updated from ${oldStoreId} to ${newStoreId}`,
      oldStoreId,
      newStoreId
    });
  } catch (error) {
    console.log('Error updating employee store:', error);
    return c.json({ error: 'Failed to update store' }, 500);
  }
});

// Explicit multi-store/multi-production-house access for an employee - replaces the
// assumption baked into the old /store route above that one employee maps to exactly
// one store. A production incharge's own storeId field actually holds a production
// house id (a historical ambiguity that broke several screens this session, since
// most code reads user.storeId assuming it's always a real store id); these arrays are
// the explicit, unambiguous source of truth going forward.
app.put('/make-server-c2dd9b9d/employee/:employeeId/assignments', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const role = authResult.user.user_metadata?.role;
  if (role !== 'cluster_head' && role !== 'manager') {
    return c.json({ error: 'Only cluster heads and operations managers can manage store/production house access' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { assignedStoreIds, assignedProductionHouseIds } = await c.req.json();

    if (!Array.isArray(assignedStoreIds) || !Array.isArray(assignedProductionHouseIds)) {
      return c.json({ error: 'assignedStoreIds and assignedProductionHouseIds must be arrays' }, 400);
    }

    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    employee.assignedStoreIds = assignedStoreIds;
    employee.assignedProductionHouseIds = assignedProductionHouseIds;
    await kv.set(`unified-employee:${employeeId}`, employee);

    console.log(`Updated assignments for employee ${employeeId}: stores=${JSON.stringify(assignedStoreIds)}, productionHouses=${JSON.stringify(assignedProductionHouseIds)}`);

    return c.json({ success: true, employee });
  } catch (error) {
    console.log('Error updating employee assignments:', error);
    return c.json({ error: 'Failed to update employee assignments' }, 500);
  }
});

// Update employee designation (Store Incharge / Production Incharge)
app.put('/make-server-c2dd9b9d/employee/:employeeId/designation', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads and operations managers can assign designations
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head' && role !== 'manager') {
    return c.json({ error: 'Only cluster heads and operations managers can assign designations' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { designation, department } = await c.req.json();
    
    console.log(`Updating designation for employee ${employeeId}: designation: ${designation}, department: ${department}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Only regular employees (role: 'employee') can be assigned as incharges
    if (employee.role !== 'employee') {
      return c.json({ error: 'Only regular employees can be assigned as Store Incharge or Production Incharge' }, 400);
    }

    const oldDesignation = employee.designation;
    const oldDepartment = employee.department;

    // If removing Store Incharge designation, check if this is the only store incharge for this store
    if (oldDesignation === 'store_incharge' && designation !== 'store_incharge' && employee.storeId) {
      // Get all employees
      const allEmployees = await kv.getByPrefix('unified-employee:');
      
      // Count store incharges in this store (excluding current employee)
      const storeInchargesInStore = allEmployees.filter((emp: any) => 
        emp.storeId === employee.storeId && 
        emp.designation === 'store_incharge' && 
        emp.employeeId !== employeeId
      );
      
      if (storeInchargesInStore.length === 0) {
        return c.json({ 
          error: `Cannot remove Store Incharge designation. This is the only Store Incharge for store ${employee.storeId}. Each store must have at least one Store Incharge. Please assign another Store Incharge for this store before removing this designation.` 
        }, 400);
      }
    }

    // Update designation and department
    employee.designation = designation;
    employee.department = department;

    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, employee);

    // IMPORTANT: Also update the auth user's metadata so designation is available in the session
    if (employee.authUserId) {
      try {
        const supabaseAdmin = createClient(
          Deno.env.get('SUPABASE_URL')!,
          Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
          { auth: { persistSession: false, autoRefreshToken: false } }
        );

        await supabaseAdmin.auth.admin.updateUserById(
          employee.authUserId,
          {
            user_metadata: {
              designation: designation,
              department: department
            }
          }
        );
        
        console.log(`Successfully updated auth user metadata for ${employee.authUserId} with designation: ${designation}`);
      } catch (authError) {
        console.error('Error updating auth user metadata:', authError);
        // Don't fail the whole operation if auth update fails
      }
    }

    console.log(`Successfully updated designation for employee ${employeeId}`);

    return c.json({
      success: true,
      employee,
      message: 'Designation updated successfully',
      oldDesignation,
      oldDepartment,
      newDesignation: designation,
      newDepartment: department
    });
  } catch (error) {
    console.log('Error updating employee designation:', error);
    return c.json({ error: 'Failed to update designation' }, 500);
  }
});

// Sync all employee designations to auth metadata (one-time fix)
app.post('/make-server-c2dd9b9d/sync-designations', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads can run this sync
  const role = authResult.user.user_metadata?.role;
  if (role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can sync designations' }, 403);
  }

  try {
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      { auth: { persistSession: false, autoRefreshToken: false } }
    );

    // Get all employees
    const allEmployees = await kv.getByPrefix('unified-employee:');
    
    let synced = 0;
    let skipped = 0;
    const errors = [];

    for (const employee of allEmployees) {
      // Only sync if employee has an authUserId and a designation
      if (employee.authUserId && employee.designation) {
        try {
          await supabaseAdmin.auth.admin.updateUserById(
            employee.authUserId,
            {
              user_metadata: {
                designation: employee.designation,
                department: employee.department || null
              }
            }
          );
          synced++;
          console.log(`Synced designation for ${employee.employeeId}: ${employee.designation}`);
        } catch (authError) {
          console.error(`Error syncing ${employee.employeeId}:`, authError);
          errors.push({ employeeId: employee.employeeId, error: String(authError) });
        }
      } else {
        skipped++;
      }
    }

    return c.json({
      success: true,
      message: 'Designation sync completed',
      synced,
      skipped,
      errors: errors.length > 0 ? errors : undefined
    });
  } catch (error) {
    console.log('Error syncing designations:', error);
    return c.json({ error: 'Failed to sync designations' }, 500);
  }
});

// Get employees by incharge ID
app.get('/make-server-c2dd9b9d/employees/by-incharge/:inchargeId', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const inchargeId = c.req.param('inchargeId');
    
    console.log(`Fetching employees for incharge: ${inchargeId}`);

    // Get all employees
    const employeeKeys = await kv.getByPrefix('unified-employee:');
    
    // Filter employees where inchargeId matches
    const employees = employeeKeys
      .filter((emp: any) => emp.inchargeId === inchargeId && emp.role === 'employee')
      .map((emp: any) => ({
        id: emp.id,
        employeeId: emp.employeeId,
        name: emp.name,
        email: emp.email,
        role: emp.role,
        type: emp.type,
        joiningDate: emp.joiningDate,
        storeId: emp.storeId,
        inchargeId: emp.inchargeId,
        department: emp.department
      }));

    console.log(`Found ${employees.length} employees under incharge ${inchargeId}`);

    return c.json(employees);
  } catch (error) {
    console.log('Error fetching employees by incharge:', error);
    return c.json({ error: 'Failed to fetch employees' }, 500);
  }
});

// Assign incharge to employee
app.put('/make-server-c2dd9b9d/employee/:employeeId/assign-incharge', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  // Only cluster heads and operations managers can assign incharges
  const role = authResult.user.user_metadata?.role;
  
  if (role !== 'cluster_head' && role !== 'manager') {
    return c.json({ error: 'Only cluster heads and operations managers can assign employees to incharges' }, 403);
  }

  try {
    const employeeId = c.req.param('employeeId');
    const { inchargeId } = await c.req.json();
    
    console.log(`Assigning employee ${employeeId} to incharge ${inchargeId}`);

    // Get the employee
    const employee = await kv.get(`unified-employee:${employeeId}`);
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Get the incharge
    const incharge = await kv.get(`unified-employee:${inchargeId}`);
    if (!incharge) {
      return c.json({ error: 'Incharge not found' }, 404);
    }

    // Verify the incharge has a valid designation
    if (!incharge.designation || (incharge.designation !== 'store_incharge' && incharge.designation !== 'production_incharge')) {
      return c.json({ error: 'Selected employee is not an incharge' }, 400);
    }

    const oldInchargeId = employee.inchargeId;
    const oldManagerId = employee.managerId;

    // Assign to incharge
    employee.inchargeId = inchargeId;
    // Clear direct manager assignment when assigning to incharge - the incharge is now this
    // person's approver: timesheet/leave notifications go to them (approversFor) and they
    // approve in their Approve screens (canApproveFor), not every cluster head.
    employee.managerId = undefined;
    // Inherit department from incharge
    employee.department = incharge.department;
    // Inherit store from incharge
    employee.storeId = incharge.storeId;

    // Update in KV store
    await kv.set(`unified-employee:${employeeId}`, employee);

    console.log(`Successfully assigned employee ${employeeId} to incharge ${inchargeId}`);

    return c.json({
      success: true,
      employee,
      message: 'Incharge assigned successfully',
      oldInchargeId,
      oldManagerId,
      newInchargeId: inchargeId,
      inheritedDepartment: incharge.department,
      inheritedStore: incharge.storeId
    });
  } catch (error) {
    console.log('Error assigning incharge to employee:', error);
    return c.json({ error: 'Failed to assign incharge' }, 500);
  }
});

// Delete cluster head by email (admin utility endpoint)
app.delete('/make-server-c2dd9b9d/cluster-heads/by-email/:email', async (c) => {
  try {
    const email = decodeURIComponent(c.req.param('email'));
    console.log('Deleting cluster head with email:', email);
    
    // Find and delete from Auth first
    const { data: existingUsers } = await supabase.auth.admin.listUsers();
    const authUser = existingUsers?.users?.find((u: any) => u.email === email);
    
    if (authUser) {
      try {
        await supabase.auth.admin.deleteUser(authUser.id);
        console.log('Deleted auth user:', authUser.id);
      } catch (authError) {
        console.log('Error deleting auth user:', authError);
      }
    }
    
    // Find the employee by email
    const allEmployees = await kv.getByPrefix('unified-employee:');
    const employee = allEmployees.find((emp: any) => emp.email === email);
    
    if (employee) {
      // Delete from KV store
      await kv.del(`unified-employee:${employee.employeeId}`);
      console.log('Deleted employee record:', employee.employeeId);
      return c.json({ success: true, deleted: employee });
    } else {
      console.log('No employee record found, but auth user may have been deleted');
      return c.json({ success: true, message: 'Deleted auth user if existed' });
    }
  } catch (error) {
    console.log('Error deleting cluster head by email:', error);
    return c.json({ error: 'Failed to delete cluster head' }, 500);
  }
});

// ===== Custom Inventory Items Management =====

// Keep in sync with src/utils/inventoryData.ts INVENTORY_CATEGORIES keys.
// Prevents orphaned category values (e.g. a stray "gas_utilities" found in the data)
// from entering the catalog again.
const VALID_INVENTORY_CATEGORIES = new Set([
  'fresh_produce', 'staples', 'spices_seasonings', 'bread_buns', 'dairy', 'meat', 'packaging', 'packaging_bulk', 'beverages',
  // legacy (moved to overheads 23 Oct 2026) — still valid on historical data
  'cleaning_sanitation', 'equipment_smallwares', 'staff_welfare_ppe', 'office_admin_supplies', 'puja_items',
  'staff_essentials',
]);

// Cluster-head-created categories (see /custom-categories below) extend the fixed set
// above at runtime - fetched fresh each time rather than cached, since a category added
// moments ago needs to be usable immediately.
async function getValidInventoryCategoryKeys(): Promise<Set<string>> {
  const customCategories = await kv.getByPrefix('custom-category:');
  const combined = new Set(VALID_INVENTORY_CATEGORIES);
  for (const cat of customCategories) {
    if (cat?.key) combined.add(cat.key);
  }
  return combined;
}

// Same idea for overhead/fixed-cost custom items (the smart quick-add's "remember this
// item's classification" feature) - keep in sync with OVERHEAD_CATEGORY_META /
// FIXED_COST_CATEGORIES in src/utils/inventoryData.ts.
const VALID_OVERHEAD_CATEGORIES = new Set([
  'fuel', 'ev_charging', 'travel', 'transportation', 'marketing', 'service_charge', 'repair', 'renovation',
  'labour_charge', 'puja_expense', 'office_supplies', 'deep_cleaning', 'party',
  'emergency_online', 'staff_emergency_services', 'utensils', 'cleaning_supplies',
  'equipments', 'license', 'water_jar', 'vehicle_maintenance', 'donations_community',
  'staff_welfare', 'breakfast', 'lunch', 'dinner', 'evening_snacks', 'personal_expense',
  'miscellaneous', 'hygiene_ppe', 'professional_fees', 'losses_writeoffs', 'ai_credits',
  'asset_kitchen_equipment', 'asset_furniture', 'asset_electrical', 'asset_vehicle', 'vehicle_emi',
]);
const VALID_FIXEDCOST_CATEGORIES = new Set(['electricity', 'rent', 'internet_phone', 'software_subscription', 'lpg_gas']);

const isValidCategoryForType = (entryType: string | undefined, category: string): boolean => {
  if (entryType === 'overhead') return VALID_OVERHEAD_CATEGORIES.has(category);
  if (entryType === 'fixedcost') return VALID_FIXEDCOST_CATEGORIES.has(category);
  return VALID_INVENTORY_CATEGORIES.has(category);
};

// Get all custom items
app.get('/make-server-c2dd9b9d/custom-items', async (c) => {
  try {
    // Query database directly since getByPrefix doesn't return keys
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    const { data, error } = await supabase
      .from('kv_store_c2dd9b9d')
      .select('key, value')
      .like('key', 'custom-item:%');
    
    if (error) {
      console.log('Error fetching custom items from DB:', error);
      return c.json({ customItems: [] });
    }
    
    const customItems = (data || []).map((item: any) => ({
      id: item.key.replace('custom-item:', ''),
      category: item.value.category,
      itemName: item.value.itemName,
      itemNameBengali: item.value.itemNameBengali,
      emoji: item.value.emoji,
      entryType: item.value.entryType,
      entityType: item.value.entityType,
      createdAt: item.value.createdAt
    }));

    return c.json({ customItems });
  } catch (error) {
    console.log('Error fetching custom items:', error);
    return c.json({ customItems: [] });
  }
});

// One item, one category (itemHome.ts): the built-in list plus the items added to it, read again
// at most every 10 minutes and straight after the list changes.
let itemHomesCache: { at: number; homes: Map<string, string[]> } | null = null;
async function loadItemHomes(): Promise<Map<string, string[]>> {
  if (itemHomesCache && Date.now() - itemHomesCache.at < 10 * 60_000) return itemHomesCache.homes;
  const custom = await kv.getByPrefix('custom-item:').catch(() => null);
  const homes = itemHomes(Array.isArray(custom) ? custom : []);
  if (Array.isArray(custom)) itemHomesCache = { at: Date.now(), homes };
  return homes;
}

// The names the app knows (itemNameReview.ts): the built-in items, running costs with a home, the
// item list, and names used at least twice in the last 120 days (their usual spelling, no
// category: "Toto" is both goods transport and travel). Plus the aliases the owner or Bunny decided.
let knownCache: { at: number; items: KnownItem[]; aliases: Map<string, KnownItem> } | null = null;
async function knownNames(): Promise<{ items: KnownItem[]; aliases: Map<string, KnownItem> }> {
  if (knownCache && Date.now() - knownCache.at < 10 * 60_000) return knownCache;
  const from = new Date(Date.now() - 120 * 86400000).toISOString().slice(0, 10);
  const [custom, purchases, running, aliases] = await Promise.all([
    kv.getByPrefix('custom-item:').catch(() => []),
    getAllByPrefixWithRetry('inventory:', { from, field: 'date' }).catch(() => []),
    getAllByPrefixWithRetry('overhead:', { from, field: 'date' }).catch(() => []),
    loadAliases({ rows: (prefix) => getAllByPrefixWithRetry(prefix) }),
  ]);
  const items: KnownItem[] = [];
  const has = new Set<string>();
  const add = (it: KnownItem) => { const k = `${it.type}|${nameKey(it.name)}`; if (nameKey(it.name) && !has.has(k)) { has.add(k); items.push(it); } };
  for (const [category, names] of Object.entries(BUILT_IN)) for (const name of names) add({ name, category, type: 'inventory' });
  for (const [name, category] of Object.entries(RUNNING_HOMES)) add({ name, category, type: 'overhead' });
  for (const ci of (custom || []) as any[]) if (ci?.itemName) add({ name: ci.itemName, category: ci.category || null, type: ci.entryType === 'overhead' ? 'overhead' : ci.entryType === 'fixedcost' ? 'fixedcost' : 'inventory' });
  const used = new Map<string, Map<string, number>>();
  const count = (name: unknown, type: EntryType) => {
    const n = String(name || '').trim();
    if (!nameKey(n) || n.length > 30 || n.split(/\s+/).length > 3) return;
    const k = `${type}|${nameKey(n)}`;
    const m = used.get(k) || new Map<string, number>();
    m.set(n, (m.get(n) || 0) + 1);
    used.set(k, m);
  };
  for (const r of (purchases || []) as any[]) count(r?.itemName, 'inventory');
  for (const r of (running || []) as any[]) count(r?.description, 'overhead');
  for (const [k, spellings] of used) {
    const total = [...spellings.values()].reduce((a, b) => a + b, 0);
    if (total < 2) continue;
    const name = [...spellings.entries()].sort((a, b) => b[1] - a[1])[0][0];
    add({ name, category: null, type: k.split('|')[0] as EntryType });
  }
  knownCache = { at: Date.now(), items, aliases };
  return knownCache;
}

const nameReviewDeps: NameReviewDeps = {
  kv: kvWithRetry,
  rows: (prefix) => getAllByPrefixWithRetry(prefix),
  known: async () => (await knownNames()).items,
  ownerIds: async () => (await getAllClusterHeads()).map((u: any) => u.authUserId).filter(Boolean),
  notifyUser: (id, type, title, message, relatedId, relatedDate) => notifyUser(id, type, title, message, relatedId, relatedDate),
  askBunny: async (p) => {
    const { data } = await askClaudeForJson(kvWithRetry as any, {
      purpose: 'item-names',
      user: { id: 'item-names', isOwner: true },
      system: [
        'You keep the expense item list of a small momo shop in West Bengal tidy. Names are often Bengali or Hindi words typed in English letters, and often misspelled.',
        'Given a newly typed name and the names already on the list, say whether it is the same thing as one of them (sameAs: that exact list name, or an empty string).',
        'confident: true only when it is clearly the same thing - a misspelling, the same thing in another language, the same product - not when it is only related (Tomato and Tomato Sauce are different items; so are Butter and Butter paper).',
        'cleanName: how it should be written if it is a new item - the usual name, capitalised, with the local word in brackets when that helps (hata -> Ladle (hata)).',
      ].join(' '),
      prompt: JSON.stringify(p),
      schema: { type: 'object', additionalProperties: false, required: ['sameAs', 'confident', 'cleanName'], properties: { sameAs: { type: 'string' }, confident: { type: 'boolean' }, cleanName: { type: 'string' } } },
      maxTokens: 300,
    });
    return { sameAs: String(data?.sameAs || ''), confident: !!data?.confident, cleanName: String(data?.cleanName || '') };
  },
  addToList: async (it) => {
    const id = `custom-item-${Date.now()}-${Math.random().toString(36).slice(2, 11)}`;
    await kv.set(`custom-item:${id}`, { category: it.category, itemName: it.itemName, entryType: it.entryType, entityType: it.entityType || undefined, createdAt: new Date().toISOString(), addedFrom: 'owner name check' });
    itemHomesCache = null;
    knownCache = null;
  },
  categoryLabel: (category) => catLabel(category),
};

// Bunny's roundup (roundup.ts): the day's camera PPE and photo checks in a few plain lines.
const roundupDeps = {
  kv: kvWithRetry,
  getAllByPrefix: (prefix: string) => getAllByPrefixWithRetry(prefix),
  ask: async (facts: any) => {
    const { data } = await askClaudeForJson(kvWithRetry as any, {
      purpose: 'roundup',
      user: { id: 'roundup', isOwner: true },
      system: [
        'You write the owner\'s short roundup for a small momo business in West Bengal (a production house and a store), from facts counted by the app.',
        'Plain English, short sentences, no greeting. At most 5 lines; lead with what needs attention. Use only the numbers given - never invent or round them differently.',
        'Say when a problem is a pattern (in every check, since the morning, worse than yesterday) rather than listing each time. Name people only when names are given ("Person 3" stays "Person 3").',
        'End a problem line with one concrete action for the owner or the incharge. Mention reminders already sent and false alarms marked. Skip anything that is fine, except one short "all fine" line if everything is.',
        'headline: under 60 characters, the main thing (e.g. "Caps off all morning at the production house").',
      ].join(' '),
      prompt: JSON.stringify(facts),
      schema: { type: 'object', additionalProperties: false, required: ['headline', 'lines'], properties: { headline: { type: 'string' }, lines: { type: 'array', items: { type: 'string' } } } },
      maxTokens: 700,
    });
    return { headline: String(data?.headline || ''), lines: Array.isArray(data?.lines) ? data.lines.map(String) : [] };
  },
};

// The owner's list of new names to check, and the decision on one (itemNameReview.ts).
app.get('/make-server-c2dd9b9d/item-names', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  if (auth.user.user_metadata?.role !== 'cluster_head') return c.json({ open: [], known: [] });
  try {
    const [rows, known] = await Promise.all([getAllByPrefixWithRetry('item-name:'), knownNames()]);
    const open = (rows || []).filter((r: any) => r?.status === 'open').sort((a: any, b: any) => String(b.lastAt).localeCompare(String(a.lastAt)));
    return c.json({ open, known: known.items.map((k) => ({ name: k.name, type: k.type, category: k.category || null })) });
  } catch (error) {
    console.log('Error loading the new item names:', error);
    return c.json({ error: 'Could not load the new names' }, 500);
  }
});

// While someone types a name the app doesn't know (owner, 31 Oct 2026: "jhul jhara when written it
// should suggest cobweb - can it do it using Bunny"): the known item it means, else Bunny's reading -
// the usual name, purchase or running cost, and the category. Each word is asked about once and
// kept 60 days (item-suggest:{nameKey}). Registered before /item-names/:key, which would take it.
app.post('/make-server-c2dd9b9d/item-names/suggest', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  if (!canWriteExpenses(auth.user)) return c.json({});
  try {
    const body = await c.req.json().catch(() => ({}));
    const typed = String(body?.typed || '').trim().slice(0, 60);
    const nk = nameKey(typed);
    if (nk.length < 3) return c.json({});
    const known = await knownNames();
    const hit = known.aliases.get(nk) || matchName(typed, known.items)?.item;
    if (hit) return c.json({ sameAs: hit.name, type: hit.type || null, category: hit.category || null });
    const cached = await kv.get(`item-suggest:${nk}`).catch(() => null);
    if (cached?.at && Date.now() - Date.parse(cached.at) < 60 * 86400000) return c.json(cached.answer || {});
    const { data } = await askClaudeForJson(kvWithRetry as any, {
      purpose: 'item-names',
      user: { id: auth.user.id, isOwner: auth.user.user_metadata?.role === 'cluster_head' },
      system: [
        'You help staff of a small momo shop in West Bengal log what they bought. Names are often Bengali or Hindi words typed in English letters, often misspelled (jhul jhara = cobweb brush on a stick, hata = ladle, balti = bucket, tar brush = wire brush).',
        'Given what was typed and the names already on the list: if it is clearly the same thing as one of them, sameAs is that exact list name; otherwise sameAs is empty.',
        'cleanName: how a new item should be written - the usual English name, capitalised, with the local word in brackets (Cobweb brush (jhul jhara)).',
        'type: "inventory" for a purchase of goods (ingredients, packaging, cleaning things, utensils), "overhead" for a running cost (transport, repairs, labour, services). category: one key from that type\'s list.',
      ].join(' '),
      prompt: JSON.stringify({ typed, onTheList: known.items.slice(0, 500).map((k) => `${k.name} (${k.type === 'overhead' ? 'running cost' : 'purchase'})`), purchaseCategories: CATEGORY_CHOICES.inventory, runningCostCategories: CATEGORY_CHOICES.overhead }),
      schema: {
        type: 'object', additionalProperties: false, required: ['sameAs', 'cleanName', 'type', 'category'],
        properties: { sameAs: { type: 'string' }, cleanName: { type: 'string' }, type: { type: 'string', enum: ['inventory', 'overhead'] }, category: { type: 'string' } },
      },
      maxTokens: 300,
    });
    const same = data?.sameAs ? known.items.find((k) => k.name === data.sameAs) : null;
    const type = data?.type === 'overhead' ? 'overhead' : 'inventory';
    const answer = same
      ? { sameAs: same.name, type: same.type || null, category: same.category || null }
      : { cleanName: String(data?.cleanName || '').slice(0, 60) || null, type, category: CATEGORY_CHOICES[type][data?.category] ? data.category : null, byBunny: true };
    await kv.set(`item-suggest:${nk}`, { key: nk, typed, answer, at: new Date().toISOString() });
    return c.json(answer);
  } catch (error) {
    // No suggestion is fine: the person picks the category as before.
    console.log('Item name suggestion failed:', error instanceof Error ? error.message : String(error));
    return c.json({});
  }
});

app.post('/make-server-c2dd9b9d/item-names/:key', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  if (auth.user.user_metadata?.role !== 'cluster_head') return c.json({ error: 'Only the owner decides new item names' }, 403);
  try {
    const body = await c.req.json().catch(() => ({}));
    if (!['new', 'same', 'keep'].includes(body?.action)) return c.json({ error: 'Choose new item, same as, or leave it' }, 400);
    const result = await decideName(nameReviewDeps, decodeURIComponent(c.req.param('key')), { action: body.action, name: body.name, category: body.category, by: auth.user.user_metadata?.name || 'Owner' });
    if (result.error) return c.json({ error: result.error }, 400);
    knownCache = null;
    return c.json({ record: result.record });
  } catch (error) {
    console.log('Error deciding a new item name:', error);
    return c.json({ error: 'Could not save that' }, 500);
  }
});

// Add custom item to a category - cluster-head only (see the InventoryForm/QuickAddExpense
// "+ Add Custom Item" gating on the frontend for why: store/operations incharges shouldn't
// be able to expand the item catalog on their own, only pick from what's already there).
app.post('/make-server-c2dd9b9d/custom-items', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  if (auth.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can add new inventory items' }, 403);
  }

  try {
    const { category, itemName, entryType, entityType } = await c.req.json();

    if (!category || !itemName) {
      return c.json({ error: 'Category and item name are required' }, 400);
    }
    const validCategories = entryType === 'overhead' || entryType === 'fixedcost'
      ? null
      : await getValidInventoryCategoryKeys();
    const categoryIsValid = validCategories ? validCategories.has(category) : isValidCategoryForType(entryType, category);
    if (!categoryIsValid) {
      return c.json({ error: `Unknown category "${category}"` }, 400);
    }

    // Check if this custom item already exists - query database directly
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: existingItems } = await supabase
      .from('kv_store_c2dd9b9d')
      .select('key, value')
      .like('key', 'custom-item:%');

    const duplicate = (existingItems || []).find((item: any) =>
      item.value.category === category && item.value.itemName === itemName
    );

    // Already on the list under another category: one item, one category.
    if ((entryType || 'inventory') === 'inventory') {
      const other = homeElsewhere(itemName, category, await loadItemHomes());
      if (other) return c.json({ error: `"${itemName}" is already on the list under ${homeLabel(other)}. One item goes under one category.`, category: other }, 409);
    }

    if (duplicate) {
      return c.json({
        customItem: {
          id: duplicate.key.replace('custom-item:', ''),
          category: duplicate.value.category,
          itemName: duplicate.value.itemName,
          entryType: duplicate.value.entryType,
          entityType: duplicate.value.entityType,
          createdAt: duplicate.value.createdAt
        }
      });
    }

    // Create new custom item
    const id = `custom-item-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    const customItem = {
      category,
      itemName,
      entryType: entryType || 'inventory',
      entityType: entityType || undefined,
      createdAt: new Date().toISOString()
    };

    await kv.set(`custom-item:${id}`, customItem);
    itemHomesCache = null;
    knownCache = null;

    return c.json({
      customItem: {
        id,
        ...customItem
      }
    });
  } catch (error) {
    console.log('Error adding custom item:', error);
    return c.json({ error: 'Failed to add custom item' }, 500);
  }
});

// Update a custom item (rename, recategorize, add emoji/Bengali name)
app.put('/make-server-c2dd9b9d/custom-items/:id', async (c) => {
  try {
    const id = c.req.param('id');
    const updates = await c.req.json();
    const key = `custom-item:${id}`;
    const existing = await kv.get(key);

    if (!existing) {
      return c.json({ error: 'Custom item not found' }, 404);
    }
    if (updates.category) {
      const effectiveEntryType = updates.entryType || (existing as any).entryType;
      const categoryIsValid = effectiveEntryType === 'overhead' || effectiveEntryType === 'fixedcost'
        ? isValidCategoryForType(effectiveEntryType, updates.category)
        : (await getValidInventoryCategoryKeys()).has(updates.category);
      if (!categoryIsValid) {
        return c.json({ error: `Unknown category "${updates.category}"` }, 400);
      }
    }

    const updated = { ...existing, ...updates };
    if ((updated.entryType || 'inventory') === 'inventory' && (updates.category || updates.itemName)) {
      // Its own row doesn't count, so an added item the built-in list doesn't have can still be moved.
      const others = ((await kv.getByPrefix('custom-item:')) || []).filter((x: any) => !(x?.itemName === (existing as any).itemName && x?.category === (existing as any).category));
      const other = homeElsewhere(updated.itemName, updated.category, itemHomes(others));
      if (other) return c.json({ error: `"${updated.itemName}" is already on the list under ${homeLabel(other)}. One item goes under one category.`, category: other }, 409);
    }
    await kv.set(key, updated);
    itemHomesCache = null;

    return c.json({ customItem: { id, ...updated } });
  } catch (error) {
    console.log('Error updating custom item:', error);
    return c.json({ error: 'Failed to update custom item' }, 500);
  }
});

// Delete a custom item (used when merging away a duplicate)
app.delete('/make-server-c2dd9b9d/custom-items/:id', async (c) => {
  try {
    const id = c.req.param('id');
    await kv.del(`custom-item:${id}`);
    itemHomesCache = null;
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting custom item:', error);
    return c.json({ error: 'Failed to delete custom item' }, 500);
  }
});

// ===== Custom Inventory Categories (Cluster Head only) =====
// Cluster-head-created categories, separate for store vs. production-house inventory (a
// store's day-to-day purchases are a small curated subset - see STORE_CATEGORY_ITEMS in
// inventoryData.ts - so a new category needs to say which side it's for). Merged with the
// fixed INVENTORY_CATEGORIES list on the frontend and with VALID_INVENTORY_CATEGORIES here
// (via getValidInventoryCategoryKeys) so items can actually be filed under them.

app.get('/make-server-c2dd9b9d/custom-categories', async (c) => {
  try {
    const categories = await kv.getByPrefix('custom-category:');
    return c.json({ categories: categories || [] });
  } catch (error) {
    console.log('Error fetching custom categories:', error);
    return c.json({ categories: [] });
  }
});

app.post('/make-server-c2dd9b9d/custom-categories', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  if (auth.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can add new categories' }, 403);
  }

  try {
    const { scope, label, emoji } = await c.req.json();
    if (!scope || (scope !== 'store' && scope !== 'production')) {
      return c.json({ error: 'scope must be "store" or "production"' }, 400);
    }
    if (!label || !label.trim()) {
      return c.json({ error: 'Category label is required' }, 400);
    }

    // Derive a stable key from the label (lowercase, underscored) - matches the
    // convention every built-in category key already follows.
    const baseKey = label.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
    if (!baseKey) {
      return c.json({ error: 'Could not derive a valid category key from that label' }, 400);
    }

    const existing = await kv.getByPrefix('custom-category:');
    if ((existing || []).some((cat: any) => cat.key === baseKey) || VALID_INVENTORY_CATEGORIES.has(baseKey)) {
      return c.json({ error: `A category with the key "${baseKey}" already exists` }, 409);
    }

    const category = {
      key: baseKey,
      scope,
      label: label.trim(),
      emoji: emoji || '📦',
      createdBy: auth.user.user_metadata?.name || auth.user.email || 'cluster_head',
      createdAt: new Date().toISOString(),
    };
    await kv.set(`custom-category:${baseKey}`, category);

    return c.json({ category });
  } catch (error) {
    console.log('Error adding custom category:', error);
    return c.json({ error: 'Failed to add custom category' }, 500);
  }
});

app.delete('/make-server-c2dd9b9d/custom-categories/:key', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  if (auth.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can remove categories' }, 403);
  }

  try {
    const key = c.req.param('key');

    // Deleting the category definition doesn't touch items already filed under it -
    // same as the built-in 'staff_essentials' retirement earlier, historical records
    // keep whatever category they were logged with. Only block the delete if items are
    // still actively catalogued there, so a cluster head notices and reassigns them
    // first rather than the category silently vanishing out from under live items.
    const itemsUsingCategory = await kv.getByPrefix('custom-item:');
    const stillInUse = (itemsUsingCategory || []).filter((item: any) => item.category === key);
    if (stillInUse.length > 0) {
      return c.json({
        error: `${stillInUse.length} item(s) are still filed under this category - reassign or delete them first`,
        itemNames: stillInUse.map((i: any) => i.itemName),
      }, 409);
    }

    await kv.del(`custom-category:${key}`);
    return c.json({ success: true });
  } catch (error) {
    console.log('Error deleting custom category:', error);
    return c.json({ error: 'Failed to delete custom category' }, 500);
  }
});

// Catch-all 404 handler for debugging
app.notFound((c) => {
  console.log('=== 404 NOT FOUND ===');
  console.log('Path:', c.req.path);
  console.log('Method:', c.req.method);
  console.log('URL:', c.req.url);
  return c.json({ 
    error: 'Route not found',
    path: c.req.path,
    method: c.req.method,
    message: 'This route does not exist. Check the API documentation.'
  }, 404);
});

// ============================================
// STORE MANAGEMENT ENDPOINTS
// ============================================

// Create store (cluster head only)
app.post('/make-server-c2dd9b9d/stores', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can create stores' }, 403);
    }

    const { name, location } = await c.req.json();

    if (!name) {
      return c.json({ error: 'Store name is required' }, 400);
    }

    const storeId = `STORE-${Date.now()}-${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
    const store = {
      id: storeId,
      name,
      location: location || '',
      managerId: null,
      createdBy: authResult.user.id,
      createdAt: new Date().toISOString()
    };

    await kv.set(`store:${storeId}`, store);

    return c.json({ success: true, store });
  } catch (error) {
    console.log('Error creating store:', error);
    return c.json({ error: 'Failed to create store' }, 500);
  }
});

// Get all stores
app.get('/make-server-c2dd9b9d/stores', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const userId = authResult.user.id;
    const employeeId = authResult.user.user_metadata?.employeeId;

    const allStores = await kv.getByPrefix('store:');

    // Cluster heads see all stores
    if (role === 'cluster_head') {
      return c.json({ stores: allStores });
    }

    // Managers (Operations Managers) see all stores (they need to see store-production house mappings for analytics)
    if (role === 'manager') {
      return c.json({ stores: allStores });
    }

    // Audit users see all stores (read-only access to all data)
    if (role === 'audit') {
      return c.json({ stores: allStores });
    }

    // Employees with designation (store/production incharge) see all stores
    // (Production incharges need to see stores mapped to their production house for calculating deliveries)
    if (role === 'employee' && employeeId) {
      return c.json({ stores: allStores });
    }

    return c.json({ stores: [] });
  } catch (error) {
    console.log('Error fetching stores:', error);
    return c.json({ error: 'Failed to fetch stores' }, 500);
  }
});

// Assign manager to store (cluster head only)
app.put('/make-server-c2dd9b9d/stores/:storeId/assign-manager', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can assign managers' }, 403);
    }

    const storeId = c.req.param('storeId');
    const { managerId } = await c.req.json();

    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === storeId);

    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    // Update the store with the manager
    const updatedStore = {
      ...store,
      managerId,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`store:${storeId}`, updatedStore);

    // Also update the manager's employee record to set their storeId
    if (managerId) {
      const allEmployees = await kv.getByPrefix('employee:');
      const managerEmployee = allEmployees.find((emp: any) => emp.employeeId === managerId);
      
      if (managerEmployee) {
        const updatedManager = {
          ...managerEmployee,
          storeId: storeId,
          updatedAt: new Date().toISOString()
        };
        await kv.set(`employee:${managerEmployee.id}`, updatedManager);
      }
    }

    return c.json({ success: true, store: updatedStore });
  } catch (error) {
    console.log('Error assigning manager:', error);
    return c.json({ error: 'Failed to assign manager' }, 500);
  }
});

// Assign production house to store (cluster head only)
app.put('/make-server-c2dd9b9d/stores/:storeId/assign-production-house', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can assign production houses' }, 403);
    }

    const storeId = c.req.param('storeId');
    const { productionHouseId } = await c.req.json();

    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === storeId);

    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    // Update the store with the production house
    const updatedStore = {
      ...store,
      productionHouseId,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`store:${storeId}`, updatedStore);

    return c.json({ success: true, store: updatedStore });
  } catch (error) {
    console.log('Error assigning production house:', error);
    return c.json({ error: 'Failed to assign production house' }, 500);
  }
});

// Update store details
app.put('/make-server-c2dd9b9d/stores/:storeId', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can update stores' }, 403);
    }

    const storeId = c.req.param('storeId');
    const { name, location, ciferonStoreId } = await c.req.json();

    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === storeId);

    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    const updatedStore = {
      ...store,
      name: name || store.name,
      location: location !== undefined ? location : store.location,
      ciferonStoreId: ciferonStoreId !== undefined ? ciferonStoreId : store.ciferonStoreId,
      updatedAt: new Date().toISOString()
    };

    await kv.set(`store:${storeId}`, updatedStore);

    return c.json({ success: true, store: updatedStore });
  } catch (error) {
    console.log('Error updating store:', error);
    return c.json({ error: 'Failed to update store' }, 500);
  }
});

// Migrate all existing data to a store (cluster head only)
app.post('/make-server-c2dd9b9d/stores/:storeId/migrate-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;

    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can migrate data' }, 403);
    }

    const storeId = c.req.param('storeId');

    const allStores = await kv.getByPrefix('store:');
    const store = allStores.find((s: any) => s.id === storeId);

    if (!store) {
      return c.json({ error: 'Store not found' }, 404);
    }

    let migratedCount = {
      inventory: 0,
      overheads: 0,
      sales: 0,
      employees: 0,
      timesheets: 0,
      leaves: 0,
      payouts: 0
    };

    // Migrate inventory items without storeId
    const inventoryItems = await kv.getByPrefix('inventory:');
    for (const item of inventoryItems) {
      if (!item.storeId) {
        const updatedItem = { ...item, storeId };
        await kv.set(`inventory:${item.id}`, updatedItem);
        migratedCount.inventory++;
      }
    }

    // Migrate overhead items without storeId
    const overheadItems = await kv.getByPrefix('overhead:');
    for (const item of overheadItems) {
      if (!item.storeId) {
        const updatedItem = { ...item, storeId };
        await kv.set(`overhead:${item.id}`, updatedItem);
        migratedCount.overheads++;
      }
    }

    // Migrate sales data without storeId
    const salesItems = await getAllByPrefixWithRetry('sales:');
    for (const item of salesItems) {
      if (!item.storeId) {
        const updatedItem = { ...item, storeId };
        // Sales keys have the format sales:userId:itemId, need to preserve this
        const key = `sales:${item.userId}:${item.id}`;
        await kv.set(key, updatedItem);
        migratedCount.sales++;
      }
    }

    // Migrate employees without storeId
    const employees = await kv.getByPrefix('employee:');
    for (const emp of employees) {
      if (!emp.storeId) {
        const updatedEmp = { ...emp, storeId };
        await kv.set(`employee:${emp.employeeId}`, updatedEmp);
        migratedCount.employees++;
      }
    }

    // Migrate timesheets without storeId
    const timesheets = await kv.getByPrefix('timesheet:');
    for (const ts of timesheets) {
      if (!ts.storeId) {
        const updatedTs = { ...ts, storeId };
        await kv.set(`timesheet:${ts.id}`, updatedTs);
        migratedCount.timesheets++;
      }
    }

    // Migrate leaves without storeId
    const leaves = await kv.getByPrefix('leave:');
    for (const leave of leaves) {
      if (!leave.storeId) {
        const updatedLeave = { ...leave, storeId };
        await kv.set(`leave:${leave.id}`, updatedLeave);
        migratedCount.leaves++;
      }
    }

    // Migrate payouts without storeId
    const payouts = await getAllByPrefixWithRetry('payout:');
    for (const payout of payouts) {
      if (!payout.storeId) {
        const updatedPayout = { ...payout, storeId };
        await kv.set(`payout:${payout.id}`, updatedPayout);
        migratedCount.payouts++;
      }
    }

    return c.json({ 
      success: true, 
      message: `Data migrated to ${store.name}`,
      migratedCount
    });
  } catch (error) {
    console.log('Error migrating data:', error);
    return c.json({ error: 'Failed to migrate data' }, 500);
  }
});

// ============================================
// NOTIFICATION ENDPOINTS
// ============================================

// Get notifications for user
app.get('/make-server-c2dd9b9d/notifications', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;

    // Most recent 100 by the real createdAt (the key's uuid suffix says nothing about age) and
    // the full unread count, both computed in the database - this used to download a user's
    // whole history (6,000+ rows for the cluster head) on every 30s poll.
    const prefix = `notification:${userId}:`;
    const [{ data: recent, error: listError }, { data: unread, error: countError }] = await Promise.all([
      supabase
        .from('kv_store_c2dd9b9d')
        .select('value')
        .like('key', prefix + '%')
        .order('value->>createdAt', { ascending: false })
        .limit(100),
      supabase.rpc('notification_unread_count', { p_user: userId }),
    ]);
    if (listError) throw new Error(listError.message);
    if (countError) throw new Error(countError.message);

    const notifications = (recent || []).map((r: any) => r.value);
    await settleDecidedRequests(userId, notifications);
    return c.json({ notifications, unreadCount: unread ?? 0 });
  } catch (error: any) {
    console.log('Error fetching notifications:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ notifications: [], warning: 'Database temporarily unavailable' });
    }
    return c.json({ error: 'Failed to fetch notifications' }, 500);
  }
});

// A request decided where its notification couldn't hear about it - notifications from before the
// done-elsewhere links (28 Oct 2026), an auto-approval, another screen: when the inbox loads, a
// leave, timesheet or stock request that is no longer pending shows as done, without its buttons.
// Each open one is looked at no more than every 10 minutes per server copy (the inbox polls).
const DECIDED_CHECKS: Record<string, { find: (id: string) => Promise<any>; done: (r: any) => { verb: string; by: string } | null }> = {
  leave_pending: {
    find: async (id) => (await findKvRecordById('leave:', id))?.value,
    done: (r) => (r.status === 'approved' ? { verb: 'approved', by: r.approvedBy } : r.status === 'rejected' ? { verb: 'rejected', by: r.rejectedBy } : null),
  },
  timesheet_pending: {
    find: async (id) => (await findKvRecordById('timesheet:', id))?.value,
    done: (r) => (r.status === 'approved' ? { verb: 'approved', by: r.approvedBy } : r.status === 'rejected' ? { verb: 'rejected', by: r.rejectedBy } : null),
  },
  stock_request_new: {
    find: (id) => kvWithRetry.get(`production_request_${id}`),
    done: (r) => (r.status && r.status !== 'pending' ? { verb: 'accepted', by: r.acceptedBy } : null),
  },
};
const DECIDED_RECHECK_MS = 10 * 60_000;
const decidedCheckedAt = new Map<string, number>();
async function settleDecidedRequests(userId: string, list: any[]) {
  const now = Date.now();
  const open = list.filter((n) => n?.id && n.relatedId && !n.resolvedAt && DECIDED_CHECKS[n.type] && now - (decidedCheckedAt.get(n.id) || 0) > DECIDED_RECHECK_MS).slice(0, 20);
  if (!open.length) return;
  const staff = await staffForNotifications().catch(() => [] as any[]);
  await Promise.all(open.map(async (n) => {
    decidedCheckedAt.set(n.id, now);
    try {
      const check = DECIDED_CHECKS[n.type];
      const record = await check.find(String(n.relatedId).split(',')[0]);
      const d = record ? check.done(record) : null;
      if (!d) return;
      // Some routes store the approver's employee id rather than their name.
      const by = staff.find((e: any) => e.employeeId && e.employeeId === d.by)?.name || d.by || 'someone';
      const at = new Date().toISOString();
      Object.assign(n, { resolvedAt: at, resolvedBy: by, resolvedVerb: d.verb, read: true, readAt: n.readAt || at });
      await kvWithRetry.set(`notification:${userId}:${n.id}`, n);
    } catch {
      // looked at again on a later load
    }
  }));
  if (decidedCheckedAt.size > 5000) decidedCheckedAt.clear();
}

// Mark notification as read
app.put('/make-server-c2dd9b9d/notifications/:id/read', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    const notificationId = c.req.param('id');
    const key = `notification:${userId}:${notificationId}`;
    
    // Optimize: Directly get the specific notification instead of fetching all
    const notification = await kvWithRetry.get(key);
    
    if (!notification) {
      return c.json({ error: 'Notification not found' }, 404);
    }
    
    const updatedNotification = {
      ...notification,
      read: true,
      readAt: notification.readAt || new Date().toISOString(),
    };
    
    await kvWithRetry.set(key, updatedNotification);
    await afterResponse('Tray dismiss', () => dismissOnPhone(userId, [notificationId]));
    
    return c.json({ success: true, notification: updatedNotification });
  } catch (error: any) {
    console.log('Error marking notification as read:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ error: 'Database temporarily unavailable' }, 503);
    }
    return c.json({ error: 'Failed to mark notification as read' }, 500);
  }
});

// Mark all notifications as read
// Each person's notification settings: quiet hours, muted kinds, the evening digest.
app.get('/make-server-c2dd9b9d/notifications/prefs', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  const saved = await kvWithRetry.get(`notification-prefs:${authResult.user.id}`);
  const isOwner = authResult.user.user_metadata?.role === 'cluster_head';
  return c.json({ prefs: { ...DEFAULT_PREFS, digest: isOwner, ...(saved || {}) }, isOwner });
});
app.put('/make-server-c2dd9b9d/notifications/prefs', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  const body = await c.req.json().catch(() => ({}));
  const time = (v: any, d: string) => (typeof v === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(v) ? v : d);
  const muted: Record<string, boolean> = {};
  for (const k of ['action', 'reminder', 'update']) if (body?.muted?.[k]) muted[k] = true; // urgent can't be muted
  const prefs = { quietOn: !!body.quietOn, quietFrom: time(body.quietFrom, DEFAULT_PREFS.quietFrom), quietTo: time(body.quietTo, DEFAULT_PREFS.quietTo), muted, digest: !!body.digest, updatedAt: new Date().toISOString() };
  await kvWithRetry.set(`notification-prefs:${authResult.user.id}`, prefs);
  return c.json({ prefs });
});
app.post('/make-server-c2dd9b9d/notifications/test', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  const employeeId = await getEmployeeIdByAuthUserId(authResult.user.id);
  const n = await createNotification(authResult.user.id, 'test_notification', 'Test notification', 'Notifications reach this phone.');
  const sent = employeeId ? await push.sendPushNotification(employeeId, { title: 'Test notification', message: 'Notifications reach this phone.', tag: 'test_notification', data: { type: 'test_notification', notificationId: n?.id || null, category: 'update' } }) : false;
  return c.json({ sent });
});

// 7 AM, 1 PM and 9 PM IST (pg_cron): one buzz for what was held - overnight (quiet hours) in the
// morning, the day's updates (digest) at 1 PM and in the evening. At 1 PM and 9 PM the owner and the
// operations managers get Bunny's roundup with it (roundup.ts, owner 31 Oct 2026): the day's camera
// PPE checks and photo checks in a few lines, instead of an alert for each.
app.post('/make-server-c2dd9b9d/cron/notification-digest', async (c) => {
  const secret = Deno.env.get('CRON_SYNC_SECRET');
  if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const hour = new Date(Date.now() + IST_OFFSET_MS).getUTCHours();
    const held = hour < 12 ? 'quiet' : 'digest';
    const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString();
    const { data, error } = await supabase.from('kv_store_c2dd9b9d').select('key, value')
      .like('key', 'notification:%').eq('value->>pushHeld', held).eq('value->>read', 'false').is('value->>digestedAt', null).gte('value->>createdAt', since).limit(2000);
    if (error) throw new Error(error.message);
    const byUser = new Map<string, any[]>();
    for (const row of data || []) byUser.set(row.value.userId, [...(byUser.get(row.value.userId) || []), row]);
    // Bunny's roundup, for the owner and the operations managers (with or without held updates).
    const roundup = held === 'digest' ? await roundupFor(roundupDeps).catch((e) => { console.log('Roundup failed:', e?.message || e); return null; }) : null;
    const readers = new Set<string>();
    if (roundup) {
      for (const u of await staffForNotifications()) {
        if (u?.authUserId && (u.role === 'cluster_head' || (u.role === 'manager' && !['store_incharge', 'production_incharge'].includes(u.designation)))) {
          readers.add(u.authUserId);
          if (!byUser.has(u.authUserId)) byUser.set(u.authUserId, []);
        }
      }
    }
    let sent = 0;
    for (const [userId, rows] of byUser) {
      const employeeId = await getEmployeeIdByAuthUserId(userId);
      const kinds = new Map<string, number>();
      for (const r of rows) kinds.set(r.value.title, (kinds.get(r.value.title) || 0) + (Number(r.value.count) || 1));
      const total = [...kinds.values()].reduce((a, b) => a + b, 0);
      const list = [...kinds.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([t, n]) => (n > 1 ? `${t} ×${n}` : t)).join(' · ');
      const withRoundup = !!roundup && readers.has(userId);
      // The roundup in full stays in the inbox; a quiet day's "all clear" doesn't buzz on its own.
      if (withRoundup) await createNotification(userId, 'bunny_roundup', `Bunny's roundup: ${roundup!.headline}`, roundup!.lines.join('\n'), undefined, getTodayIST());
      const buzzRoundup = withRoundup && roundup!.worth;
      if (employeeId && (total > 0 || buzzRoundup)) {
        await push.sendPushNotification(employeeId, buzzRoundup ? {
          title: `Bunny: ${roundup!.headline}`,
          message: `${roundup!.lines.slice(0, 3).join(' ')}${total ? ` · Also ${total} update${total === 1 ? '' : 's'} in your inbox.` : ''}`,
          tag: 'digest_roundup', data: { type: 'bunny_roundup', category: 'update' },
        } : {
          title: held === 'quiet' ? `While you were away: ${total} notification${total === 1 ? '' : 's'}` : `Today's updates: ${total}`,
          message: list, tag: `digest_${held}`, data: { type: 'digest', category: 'update' },
        }).catch(() => undefined);
        sent++;
      }
      const at = new Date().toISOString();
      for (const r of rows) await kvWithRetry.set(r.key, { ...r.value, digestedAt: at });
    }
    return c.json({ success: true, held, users: byUser.size, sent });
  } catch (error: any) {
    console.log('Notification digest failed:', error?.message || error);
    return c.json({ error: 'Digest failed' }, 500);
  }
});

// Every 15 minutes (pg_cron): an urgent notification nobody has opened for 30 minutes goes to the
// owner as well ("Not seen yet"), once.
app.post('/make-server-c2dd9b9d/cron/notification-escalations', async (c) => {
  const secret = Deno.env.get('CRON_SYNC_SECRET');
  if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const now = Date.now();
    const { data, error } = await supabase.from('kv_store_c2dd9b9d').select('key, value')
      .like('key', 'notification:%').eq('value->>category', 'urgent').eq('value->>read', 'false').is('value->>escalatedAt', null)
      .lte('value->>createdAt', new Date(now - 30 * 60000).toISOString()).gte('value->>createdAt', new Date(now - 6 * 3600000).toISOString()).limit(500);
    if (error) throw new Error(error.message);
    const staff = await staffForNotifications();
    const owners = staff.filter((u: any) => u.role === 'cluster_head' && u.authUserId && u.status !== 'inactive');
    const ownerIds = new Set(owners.map((o: any) => o.authUserId));
    let sent = 0;
    for (const row of data || []) {
      const n = row.value;
      await kvWithRetry.set(row.key, { ...n, escalatedAt: new Date().toISOString() });
      // Reminders that ask again by themselves aren't sent on to the owner (notificationRules.ts).
      if (ownerIds.has(n.userId) || !escalates(n.type)) continue;
      const who = staff.find((u: any) => u.authUserId === n.userId)?.name || 'Someone';
      const time = new Date(Date.parse(n.createdAt) + IST_OFFSET_MS).toISOString().slice(11, 16);
      for (const o of owners) {
        await notifyUser(o.authUserId, 'escalation', `Not seen yet: ${n.title}`, `${who} hasn't opened it since ${time}. ${n.message}`.slice(0, 300), n.relatedId || undefined, n.relatedDate || undefined).catch(() => undefined);
        sent++;
      }
    }
    return c.json({ success: true, escalated: (data || []).length, sent });
  } catch (error: any) {
    console.log('Notification escalation failed:', error?.message || error);
    return c.json({ error: 'Escalation failed' }, 500);
  }
});

app.put('/make-server-c2dd9b9d/notifications/read-all', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;

    // One UPDATE in the database (see migration 20261017000000_notification_rpcs.sql) -
    // downloading the history and re-writing it row batches missed rows on large backlogs.
    const { data: updated, error: rpcError } = await supabase.rpc('mark_all_notifications_read', { p_user: userId });
    if (rpcError) throw new Error(rpcError.message);
    await afterResponse('Tray dismiss', () => dismissOnPhone(userId, 'all'));

    return c.json({ success: true, updated: updated ?? 0 });
  } catch (error: any) {
    console.log('Error marking all notifications as read:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ error: 'Database temporarily unavailable' }, 503);
    }
    return c.json({ error: 'Failed to mark all notifications as read' }, 500);
  }
});

// Delete old notifications (cleanup endpoint)
app.delete('/make-server-c2dd9b9d/notifications/cleanup', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const userId = authResult.user.id;
    
    // Delete notifications older than 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    
    // Fetch all user notifications with retry logic
    const { data, error } = await retryWithBackoff(
      async () => {
        const result = await supabase
          .from('kv_store_c2dd9b9d')
          .select('key, value')
          .like('key', `notification:${userId}:%`);
        
        if (result.error) throw new Error(result.error.message);
        return result;
      },
      'fetch notifications for cleanup'
    );
    
    // Filter notifications older than 30 days
    const oldNotifications = (data || []).filter((d) => {
      const createdAt = new Date(d.value.createdAt);
      return createdAt < thirtyDaysAgo;
    });
    
    if (oldNotifications.length === 0) {
      return c.json({ success: true, deleted: 0, message: 'No old notifications to delete' });
    }
    
    // Delete old notifications in batch with retry logic
    const keysToDelete = oldNotifications.map(n => n.key);
    await kvWithRetry.mdel(keysToDelete);
    
    return c.json({ 
      success: true, 
      deleted: oldNotifications.length,
      message: `Deleted ${oldNotifications.length} notifications older than 30 days`
    });
  } catch (error: any) {
    console.log('Error cleaning up old notifications:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ error: 'Database temporarily unavailable' }, 503);
    }
    return c.json({ error: 'Failed to cleanup notifications' }, 500);
  }
});

// Create notification (internal helper)
async function createNotification(userId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) {
  return (await saveNotification(userId, type, title, message, relatedId, relatedDate))?.record || null;
}

// Midnight today in India, as an ISO time.
function istDayStartISO(nowMs = Date.now()): string {
  return new Date(`${new Date(nowMs + IST_OFFSET_MS).toISOString().slice(0, 10)}T00:00:00+05:30`).toISOString();
}

// Saves the inbox row and says whether it should buzz (notificationRules.ts, owner 30 Oct 2026: too
// many notifications). null = not sent at all. A quiet kind is saved already read; a stock request
// keeps one row per person that each step replaces; a noisy kind keeps one row a day.
async function saveNotification(userId: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string): Promise<{ record: any; buzz: boolean } | null> {
  const loud = loudness(type);
  if (loud === 'off') return null;
  const category = notificationCategory(type);
  const now = new Date().toISOString();
  const quiet = loud === 'quiet';
  const unread = (n: any) => {
    const { resolvedAt: _a, resolvedBy: _b, resolvedVerb: _c, readAt: _d, escalatedAt: _e, ...rest } = n;
    return quiet ? { ...rest, read: true, readAt: now } : { ...rest, read: false };
  };
  try {
    if (relatedId && oneRowPerRecord(type)) {
      const keys: string[] = ((await kvWithRetry.get(`notification-related:${relatedId}`)) || []).filter((k: string) => k.startsWith(`notification:${userId}:`));
      for (const key of keys) {
        const p = await kvWithRetry.get(key);
        if (!p?.id || !oneRowPerRecord(String(p.type || ''))) continue;
        const record = unread({ ...p, type, category, title, message, relatedDate: relatedDate || p.relatedDate || null, createdAt: now, steps: [p.title, ...(p.steps || [])].filter(Boolean).slice(0, 8) });
        await kvWithRetry.set(key, record);
        return { record, buzz: !quiet && p.type !== type };
      }
    }
    // Another of the same kind today (one-a-day kinds), or within 30 minutes and still unread (the
    // kinds that bundle), folds into the last one ("Inventory logged +3 more").
    const daily = oneADay(type);
    if (daily || bundles(type)) {
      let q = supabase.from('kv_store_c2dd9b9d').select('key, value')
        .like('key', `notification:${userId}:%`).eq('value->>type', type)
        .gte('value->>createdAt', daily ? istDayStartISO() : new Date(Date.now() - BUNDLE_MINUTES * 60000).toISOString());
      if (!daily) q = q.eq('value->>read', 'false');
      const { data } = await q.order('value->>createdAt', { ascending: false }).limit(1);
      const prev = data?.[0];
      if (prev?.value?.id) {
        const p = prev.value;
        const merged = {
          ...p, title, message, category, relatedId: relatedId || p.relatedId || null, relatedDate: relatedDate || p.relatedDate || null,
          // The earlier one's title too when it said something else ("Workplace photos missed · Rohan").
          count: (Number(p.count) || 1) + 1, items: [p.title && p.title !== title ? `${p.title}: ${p.message}` : p.message, ...(p.items || [])].filter(Boolean).slice(0, 6), createdAt: now,
        };
        const record = daily ? unread(merged) : merged;
        await kvWithRetry.set(prev.key, record);
        if (relatedId) await indexRelatedNotification(relatedId, prev.key);
        return { record, buzz: !daily && !quiet };
      }
    }
    const notificationId = crypto.randomUUID();
    const notification = {
      id: notificationId, userId, type, category, title, message,
      relatedId: relatedId || null, relatedDate: relatedDate || null, read: quiet, ...(quiet ? { readAt: now } : {}), createdAt: now,
    };
    const key = `notification:${userId}:${notificationId}`;
    await kvWithRetry.set(key, notification);
    if (relatedId) await indexRelatedNotification(relatedId, key);
    return { record: notification, buzz: !quiet };
  } catch (error: any) {
    console.error(`Failed to create notification for user ${userId}:`, error);
    // Don't throw - notifications are non-critical, don't fail the main operation
    return null;
  }
}

// Buzzes a person has had today, urgent apart (DAILY_BUZZ_CAP).
async function buzzedToday(userId: string): Promise<number> {
  const { count } = await supabase.from('kv_store_c2dd9b9d').select('key', { count: 'exact', head: true })
    .like('key', `notification:${userId}:%`).eq('value->>buzzed', 'true').neq('value->>category', 'urgent').gte('value->>createdAt', istDayStartISO());
  return count || 0;
}

// Which notifications are about one record (notification-related:{relatedId}), so they can all be
// marked done when someone approves, rejects or decides it.
async function indexRelatedNotification(relatedId: string, key: string) {
  const k = `notification-related:${relatedId}`;
  const keys: string[] = (await kvWithRetry.get(k)) || [];
  if (!keys.includes(key)) await kvWithRetry.set(k, [key, ...keys].slice(0, 30));
}

async function resolveNotifications(relatedId: string, o: { by: string; verb: string; onlyUser?: string }) {
  const keys: string[] = (await kvWithRetry.get(`notification-related:${relatedId}`)) || [];
  const now = new Date().toISOString();
  const done = new Map<string, string[]>(); // person -> notification ids, to take off their phones
  for (const key of keys) {
    if (o.onlyUser && !key.startsWith(`notification:${o.onlyUser}:`)) continue;
    const n = await kvWithRetry.get(key);
    if (!n || n.resolvedAt) continue;
    await kvWithRetry.set(key, { ...n, resolvedAt: now, resolvedBy: o.by, resolvedVerb: o.verb, read: true, readAt: n.readAt || now });
    const [, userId, id] = key.split(':');
    if (userId && id) done.set(userId, [...(done.get(userId) || []), id]);
  }
  for (const [userId, ids] of done) await dismissOnPhone(userId, ids).catch(() => undefined);
}

// Takes notifications off the person's phone tray: handled by someone else, or read in the app
// (new Android builds only; push.sendFcmDismiss).
async function dismissOnPhone(authUserId: string, ids: string[] | 'all') {
  const emp = (await staffForNotifications()).find((u: any) => u.authUserId === authUserId);
  if (emp?.employeeId) await push.sendFcmDismiss(emp.employeeId, ids);
}

// Nightly cleanup across ALL users - deletes notifications that are already read and
// older than 30 days. The per-user DELETE /notifications/cleanup route above existed
// but was never actually invoked by anything (no cron, no button), so notifications
// accumulated forever; once a user passed 100 total, GET /notifications and
// PUT /notifications/read-all (both previously capped at an arbitrary 100-row slice)
// stopped being able to show or clear the same set consistently. This keeps the total
// bounded going forward. Never deletes anything still unread, no matter how old, so a
// missed notification can't silently disappear before the user has seen it.
// Cron-only (see 20260814000000_notifications_auto_cleanup_cron.sql) - not reachable by
// regular users.
app.post('/make-server-c2dd9b9d/notifications/auto-cleanup', async (c) => {
  const cronSecret = c.req.header('X-Cron-Secret');
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    // Read notifications go after 30 days, unread ones after 90 (owner, 27 Oct 2026).
    const thirtyDaysAgoMs = Date.now() - 30 * 24 * 60 * 60 * 1000;
    const ninetyDaysAgoMs = Date.now() - 90 * 24 * 60 * 60 * 1000;
    const allNotifications = await getAllByPrefixWithRetry('notification:');
    const stale = allNotifications.filter((n: any) => {
      const created = n.createdAt ? new Date(n.createdAt).getTime() : NaN;
      if (!Number.isFinite(created)) return false;
      return n.read ? created < thirtyDaysAgoMs : created < ninetyDaysAgoMs;
    });

    if (stale.length === 0) {
      return c.json({ success: true, deleted: 0 });
    }

    const keys = stale.map((n: any) => `notification:${n.userId}:${n.id}`);
    // 500 keys made the delete request's URL too long ("Bad Request"), so the clean-up had
    // failed every night since it was added; 100 fits.
    const CHUNK_SIZE = 100;
    for (let i = 0; i < keys.length; i += CHUNK_SIZE) {
      await kvWithRetry.mdel(keys.slice(i, i + CHUNK_SIZE));
    }

    return c.json({ success: true, deleted: stale.length });
  } catch (error: any) {
    console.log('Error in notification auto-cleanup:', error);
    if (error?.message === 'DATABASE_UNAVAILABLE') {
      return c.json({ error: 'Database temporarily unavailable' }, 503);
    }
    return c.json({ error: 'Failed to auto-cleanup notifications' }, 500);
  }
});

// Push subscriptions are keyed by employeeId, but most notification call sites only
// have the Supabase authUserId on hand. Reverse-lookup employeeId from authUserId so
// existing call sites can gain push notifications without restructuring.
async function getEmployeeIdByAuthUserId(authUserId: string): Promise<string | null> {
  try {
    const allUsers = await staffForNotifications();
    const match = allUsers.find((u: any) => u.authUserId === authUserId);
    return match?.employeeId || null;
  } catch (error) {
    console.log('Error looking up employeeId for push notification:', error);
    return null;
  }
}

// A single-use, scoped credential embedded in a push notification so the Android
// notification-tray Approve/Reject buttons (see QuickActionMessagingService.java) can
// call back into the API without the device needing a live logged-in session - a
// background BroadcastReceiver has no access to the user's Supabase auth session, so it
// can't call the normal authenticated /approve or /reject routes. The token only ever
// authorizes the exact action on the exact record it was minted for (see POST
// /quick-action below) and is marked used immediately, so it can't be replayed.
// The buttons each kind of record gets on its notification (Android, QuickActionMessagingService).
type QuickRecord = 'leave' | 'timesheet' | 'production_request' | 'stock_request' | 'workplace_photo' | 'expense_approval';
type QuickVerb = 'approve' | 'reject' | 'deliver' | 'accept' | 'ok';
const QUICK_ACTIONS: Record<QuickRecord, { action: QuickVerb; label: string }[]> = {
  leave: [{ action: 'approve', label: 'Approve' }, { action: 'reject', label: 'Reject' }],
  timesheet: [{ action: 'approve', label: 'Approve' }, { action: 'reject', label: 'Reject' }],
  production_request: [{ action: 'deliver', label: 'Delivered' }],
  stock_request: [{ action: 'accept', label: 'Accept' }],
  workplace_photo: [{ action: 'ok', label: 'Looks OK' }],
  expense_approval: [{ action: 'approve', label: 'OK' }, { action: 'reject', label: 'Not OK' }],
};

async function createQuickActionToken(action: QuickVerb, recordType: QuickRecord, recordId: string, approverUserId: string): Promise<string> {
  const token = `${crypto.randomUUID()}${crypto.randomUUID()}`;
  await kv.set(`quick_action_token:${token}`, {
    action,
    recordType,
    recordId,
    approverUserId,
    used: false,
    createdAt: new Date().toISOString(),
  });
  return token;
}

// Create both the in-app (bell) notification and a push notification for the same event.
// Push failures (no subscription, VAPID not configured, etc.) are non-fatal and swallowed,
// matching the existing non-critical error handling of createNotification.
// `quickAction`, when provided, mints a pair of Approve/Reject tokens for the push
// payload so the Android app can show tappable action buttons on the notification itself.
// For 'production_request', it's a single "Delivered" button instead (there's no reject
// counterpart to shipping something that's already on its way).
async function notifyUser(
  userId: string,
  type: string,
  title: string,
  message: string,
  relatedId?: string,
  relatedDate?: string,
  quickAction?: { recordType: QuickRecord; recordId: string },
  // imageUrl: a photo shown inside the Android notification (a link that works for a day).
  extras?: { imageUrl?: string }
) {
  const saved = await saveNotification(userId, type, title, message, relatedId, relatedDate);
  const notificationResult = saved?.record || null;
  // Not sent, quiet, or added to a row that already buzzed: no buzz (notificationRules.ts).
  if (!saved?.buzz) return notificationResult;

  try {
    const emp = (await staffForNotifications()).find((u: any) => u.authUserId === userId) || null;
    const employeeId = emp?.employeeId || null;
    // Quiet hours, muted kinds and the evening digest hold the buzz (the inbox still has it);
    // urgent always goes through (notificationRules.ts).
    const category = notificationCategory(type);
    const prefs = { ...DEFAULT_PREFS, digest: emp?.role === 'cluster_head', ...((await kvWithRetry.get(`notification-prefs:${userId}`)) || {}) };
    let held: string | null = null;
    if (category !== 'urgent') {
      if (prefs.muted?.[category]) held = 'muted';
      else if (inQuietHours(prefs)) held = 'quiet';
      // The owner's phone: urgent and what only the owner decides; the rest in the 9 PM summary.
      else if (prefs.digest && (emp?.role === 'cluster_head' ? !ownerBuzzes(type) : category === 'update')) held = 'digest';
      else if (await buzzedToday(userId) >= DAILY_BUZZ_CAP) held = 'digest';
    }
    if (held && notificationResult?.id) {
      await kvWithRetry.set(`notification:${userId}:${notificationResult.id}`, { ...notificationResult, pushHeld: held }).catch(() => undefined);
    }
    // Staff read Bengali more easily: the Bengali title follows the English one.
    const isStaff = !!emp && emp.role !== 'cluster_head' && !(emp.role === 'manager' && emp.designation !== 'store_incharge' && emp.designation !== 'production_incharge');
    const count = Number((notificationResult as any)?.count) || 1;
    const pushTitle = `${title}${count > 1 ? ` (+${count - 1} more)` : ''}${isStaff && BENGALI_TITLE[type] ? ` · ${BENGALI_TITLE[type]}` : ''}`;
    if (employeeId && !held) {
      // notificationId carries the real per-notification unique id so the Android side
      // can derive a unique tray notification ID from it (see
      // QuickActionMessagingService.java) instead of from `tag`/`type`. `type` is shared
      // by every notification of that kind (e.g. every "Inventory Data Logged" push has
      // tag "inventory_logged"), so keying the Android notification ID off `tag` alone
      // made each new push silently replace the previous unseen one in the tray instead
      // of stacking - a recurring daily notification like this one would only ever show
      // its single latest occurrence.
      const data: Record<string, any> = {
        type,
        relatedId: relatedId || null,
        relatedDate: relatedDate || null,
        notificationId: notificationResult?.id || null,
      };
      if (quickAction) {
        const actions: { id: string; label: string; token: string }[] = [];
        for (const k of QUICK_ACTIONS[quickAction.recordType] || []) {
          const token = await createQuickActionToken(k.action, quickAction.recordType, quickAction.recordId, userId);
          actions.push({ id: k.action, label: k.label, token });
          // App builds before 1.17.0 read these three instead of `actions`.
          if (k.action === 'approve') data.approveToken = token;
          if (k.action === 'reject') data.rejectToken = token;
          if (k.action === 'deliver') data.deliverToken = token;
        }
        data.actions = actions;
      }
      if (extras?.imageUrl) data.imageUrl = extras.imageUrl;
      data.category = category;
      await push.sendPushNotification(employeeId, {
        title: pushTitle,
        message,
        tag: type,
        data,
      });
      // Counted for the daily cap; a row that buzzed now isn't held for the digest any more.
      if (notificationResult?.id && (!notificationResult.buzzed || notificationResult.pushHeld)) {
        const { pushHeld: _held, ...rest } = notificationResult;
        await kvWithRetry.set(`notification:${userId}:${notificationResult.id}`, { ...rest, buzzed: true }).catch(() => undefined);
      }
    }
  } catch (pushError) {
    console.log(`Push notification failed for user ${userId}:`, pushError);
  }

  return notificationResult;
}

// Staff records for working out who to notify, read once a minute per server copy: one save
// used to scan every employee record (Aadhaar photos included) once per recipient. Callers get
// copies, so nothing can change the shared list.
const NOTIFY_STAFF_TTL_MS = 60_000;
let notifyStaff: { at: number; list: Promise<any[]> } | null = null;
async function staffForNotifications(): Promise<any[]> {
  if (!notifyStaff || Date.now() - notifyStaff.at > NOTIFY_STAFF_TTL_MS) {
    const list = kv.getByPrefix('unified-employee:');
    notifyStaff = { at: Date.now(), list };
    list.catch(() => { if (notifyStaff?.list === list) notifyStaff = null; });
  }
  return (await notifyStaff.list).map((u: any) => ({ ...u }));
}

// Helper to get all cluster heads
async function getAllClusterHeads() {
  const allUsers = await staffForNotifications();
  return allUsers.filter((u: any) => u.role === 'cluster_head');
}

// Helper to get operations managers (excluding store/production incharges)
async function getOperationsManagers(storeId?: string) {
  const allUsers = await staffForNotifications();
  const managers = allUsers.filter((u: any) =>
    u.role === 'manager' && 
    u.designation !== 'store_incharge' && 
    u.designation !== 'production_incharge'
  );
  
  // Filter by store if provided - exact match only. This used to also match any manager
  // with NO storeId set at all (treating "unset" as "matches every store"), which was
  // invisible with a single store but would leak a Store 1 manager's notifications into
  // Store 2's events (and vice versa) the moment a second store exists. A manager who's
  // genuinely meant to see every store should be given cluster-head-style access instead
  // of relying on this fallback.
  if (storeId) {
    return managers.filter((m: any) => m.storeId === storeId);
  }

  return managers;
}

// Helper to get all production heads/incharges
async function getAllProductionHeads() {
  const allUsers = await kv.getByPrefix('unified-employee:');
  return allUsers.filter((u: any) => u.designation === 'production_incharge');
}

// Helper to get store incharge for a specific store
async function getStoreIncharge(storeId: string) {
  const allUsers = await kv.getByPrefix('unified-employee:');
  // An event's stock request carries the event id as its storeId (events.ts): the event
  // incharge gets the "shipped / delivered" news a store incharge would.
  if (typeof storeId === 'string' && storeId.startsWith('EVENT-')) {
    const ev = await kv.get(`event:${storeId}`);
    return ev?.inchargeId ? allUsers.find((u: any) => u.employeeId === ev.inchargeId) : undefined;
  }
  return allUsers.find((u: any) => u.designation === 'store_incharge' && u.storeId === storeId);
}

// ============================================
// RIDER TRIPS (logistics: production house -> store)
// ============================================
// A "rider" is a regular employee (role: 'employee') with designation 'rider'. One trip is one
// run: production calls the rider in, the rider moves it through the stages below with a
// button each, and everyone involved is notified at the relevant steps.
//   called -> on_the_way -> arrived -> picked_up -> delivered   (or cancelled by dispatch)
// Production must mark the order "ready for pickup" before the rider can mark it picked up.
// Phase 1 is status-only; live GPS/map layers on top of these same trip records later.
const RIDER_MAX_TRIPS_PER_DAY = 4;
const RIDER_NEXT_STATUS: Record<string, string> = {
  called: 'on_the_way',
  on_the_way: 'arrived',
  arrived: 'picked_up',
  picked_up: 'delivered',
};
const RIDER_ACTIVE_STATUSES = ['called', 'on_the_way', 'arrived', 'picked_up'];

async function getRiderActor(authUser: any) {
  const meta = authUser?.user_metadata || {};
  const employeeId: string | null = meta.employeeId || null;
  const employee = employeeId ? await kv.get(`unified-employee:${employeeId}`) : null;
  const role: string = meta.role || employee?.role || '';
  const designation: string | null = meta.designation || employee?.designation || null;
  return {
    employeeId,
    employee,
    role,
    designation,
    name: meta.name || employee?.name || authUser?.email || 'Someone',
    storeId: employee?.storeId || meta.storeId || null,
    // Who may call riders / mark an order ready: cluster head, production incharge, or an
    // operations manager (a manager who isn't tied to a single store).
    canDispatch: role === 'cluster_head' || designation === 'production_incharge' || (role === 'manager' && designation !== 'store_incharge'),
    isRider: designation === 'rider',
  };
}

// Riders don't get the staff list or the stock requests, so their own rides carry what the ride
// screens would take from them: who to call at each store / production house stop (rides still
// under way only) and the linked stock requests, for "Carrying 20 bags · 580 momos".
const RIDE_REQUEST_FIELDS = ['id', 'storeId', 'requestDate', 'status', 'shippedQuantities', 'dispatch', 'chickenMomos', 'chickenCheeseMomos', 'vegMomos', 'cheeseCornMomos', 'paneerMomos', 'vegKurkureMomos', 'chickenKurkureMomos'];
async function withRiderRideDetails(trips: any[]): Promise<any[]> {
  const anyActive = trips.some((t) => RIDER_ACTIVE_STATUSES.includes(t.status));
  const staff: any[] = anyActive ? ((await kv.getByPrefix('unified-employee:')) || []) : [];
  const telOf = (phone?: string) => String(phone || '').replace(/[^\d+]/g, '');
  const contactFor = (stop: any) => {
    if (!stop?.id || stop.kind === 'custom') return null;
    const wanted = stop.kind === 'store' ? 'store_incharge' : 'production_incharge';
    const assigned = (p: any) => (stop.kind === 'store' ? p.assignedStoreIds : p.assignedProductionHouseIds) || [];
    const person = staff.find((p) => p.designation === wanted && p.status !== 'inactive' && (p.storeId === stop.id || assigned(p).includes(stop.id)) && telOf(p.phone).length >= 10);
    return person ? { name: person.name, phone: telOf(person.phone) } : null;
  };
  const ids = [...new Set(trips.flatMap((t) => (Array.isArray(t.requestIds) ? t.requestIds : [])))] as string[];
  const found = ids.length > 0 ? await kv.mget(ids.map((id) => `production_request_${id}`)) : [];
  const requests = new Map<string, any>();
  for (const r of found) {
    if (!r?.id) continue;
    const slim: any = {};
    for (const f of RIDE_REQUEST_FIELDS) if (r[f] !== undefined) slim[f] = r[f];
    requests.set(r.id, slim);
  }
  return trips.map((t) => {
    const linked = (Array.isArray(t.requestIds) ? t.requestIds : []).map((id: string) => requests.get(id)).filter(Boolean);
    const stops = RIDER_ACTIVE_STATUSES.includes(t.status) ? t.stops.map((st: any) => ({ ...st, contact: contactFor(st) })) : t.stops;
    return { ...t, stops, ...(linked.length > 0 ? { linkedRequests: linked } : {}) };
  });
}

async function notifyEmployeeIds(employees: any[], type: string, title: string, message: string, trip: any) {
  const seen = new Set<string>();
  for (const emp of employees) {
    if (!emp?.authUserId || seen.has(emp.authUserId)) continue;
    seen.add(emp.authUserId);
    try {
      await notifyUser(emp.authUserId, type, title, message, trip.id, trip.date);
      // Keep what Google said about this push, so a "no alert arrived" report can be traced to
      // the server side (no token / rejected) or the phone side (accepted but nothing shown).
      try {
        const outcome = push.getLastFcmOutcome(emp.employeeId);
        await kv.set(`rider-push-log:${trip.id}:${type}:${Date.now()}`, { tripId: trip.id, type, employeeId: emp.employeeId, outcome });
      } catch (_) { /* diagnostics only */ }
    } catch (error) {
      console.log(`Rider notification (${type}) failed for ${emp.employeeId}:`, error);
    }
  }
}

// ---- Rider profile, availability and fares ----
// rider-profile:{employeeId} = { name, aadhaar, defaultRate, availability, unavailableUntil }
// availability = { mon: { enabled, from: 'HH:MM', to: 'HH:MM' }, ... } (India time). Riders count as
// available inside their schedule unless they marked themselves unavailable.
const RIDER_DAY_KEYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'];
const RIDER_DAY_LABELS: Record<string, string> = { sun: 'Sunday', mon: 'Monday', tue: 'Tuesday', wed: 'Wednesday', thu: 'Thursday', fri: 'Friday', sat: 'Saturday' };

function riderIstNow() {
  const now = new Date();
  const ist = new Date(now.getTime() + 5.5 * 3600 * 1000);
  const endOfDayIst = new Date(Date.UTC(ist.getUTCFullYear(), ist.getUTCMonth(), ist.getUTCDate() + 1) - 5.5 * 3600 * 1000);
  return {
    now,
    dayKey: RIDER_DAY_KEYS[ist.getUTCDay()],
    minutes: ist.getUTCHours() * 60 + ist.getUTCMinutes(),
    endOfDayIso: endOfDayIst.toISOString(),
  };
}

const hhmmToMinutes = (t: string) => {
  const m = /^(\d{1,2}):(\d{2})$/.exec(t || '');
  return m ? parseInt(m[1], 10) * 60 + parseInt(m[2], 10) : NaN;
};

function riderAvailability(profile: any): { available: boolean; reason: string | null } {
  const { now, dayKey, minutes } = riderIstNow();
  const until = profile?.unavailableUntil;
  if (until === 'indefinite') return { available: false, reason: 'Marked unavailable' };
  if (until && new Date(until).getTime() > now.getTime()) {
    const t = new Date(until).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' });
    return { available: false, reason: `Marked unavailable until ${t}` };
  }
  const day = profile?.availability?.[dayKey];
  if (day) {
    if (!day.enabled) return { available: false, reason: `Off on ${RIDER_DAY_LABELS[dayKey]}s` };
    const from = hhmmToMinutes(day.from);
    const to = hhmmToMinutes(day.to);
    if (!isNaN(from) && !isNaN(to) && (minutes < from || minutes >= to)) {
      return { available: false, reason: `Outside working hours (${day.from} - ${day.to})` };
    }
  }
  return { available: true, reason: null };
}

const maskAadhaar = (a: string | null | undefined) => (a && a.length >= 4 ? `XXXX XXXX ${a.slice(-4)}` : null);

async function loadRiderProfile(employeeId: string) {
  return (await kv.get(`rider-profile:${employeeId}`)) || null;
}

// A ride is an ordered list of STOPS; the rider works through it one leg (stop -> next stop) at a
// time. Production -> store and store -> production have two stops, a round trip (store ->
// production -> store) has three, and a custom ride (e.g. a stall at an event) has two stops where
// either end can be a one-off location with its own coordinates.
type RiderStop = { kind: 'production' | 'store' | 'custom'; id: string | null; name: string; latitude?: number | null; longitude?: number | null };

// Rides created before multi-stop rides existed have no `stops` - derive them from the direction.
function tripStops(trip: any): RiderStop[] {
  if (Array.isArray(trip.stops) && trip.stops.length >= 2) return trip.stops;
  const production: RiderStop = { kind: 'production', id: trip.productionHouseId || null, name: trip.productionHouseName || 'the production house' };
  const store: RiderStop = { kind: 'store', id: trip.storeId || null, name: trip.storeName || 'the store' };
  return trip.direction === 'to_production' ? [store, production] : [production, store];
}
const tripLegIndex = (trip: any) => Math.min(Math.max(0, trip.legIndex || 0), tripStops(trip).length - 2);
const isFinalLeg = (trip: any) => tripLegIndex(trip) >= tripStops(trip).length - 2;

// The two ends of the leg the rider is on right now.
const rideEnds = (trip: any) => {
  const stops = tripStops(trip);
  const i = tripLegIndex(trip);
  const pickup = stops[i];
  const drop = stops[i + 1];
  return { pickup, drop, pickupKind: pickup.kind, dropKind: drop.kind, pickupName: pickup.name, dropName: drop.name };
};

// Who to tell about a stop: production heads, that store's incharge, or - for a one-off custom
// location - whoever created the ride.
async function stopParty(stop: RiderStop, trip: any): Promise<any[]> {
  if (stop.kind === 'production') return await getAllProductionHeads();
  if (stop.kind === 'store') {
    const incharge = stop.id ? await getStoreIncharge(stop.id) : null;
    return incharge ? [incharge] : [];
  }
  const caller = trip.calledBy ? await kv.get(`unified-employee:${trip.calledBy}`) : null;
  return caller ? [caller] : [];
}

// Coordinates for a stop: a custom stop carries its own, production/store use their map pin.
async function stopCoordinates(stop: RiderStop): Promise<{ latitude: number; longitude: number } | null> {
  if (isValidLatLng(stop.latitude, stop.longitude)) return { latitude: stop.latitude as number, longitude: stop.longitude as number };
  if (stop.kind === 'custom' || !stop.id) return null;
  const place = await kv.get(`rider-place:${stop.kind}:${stop.id}`);
  return place && isValidLatLng(place.latitude, place.longitude) ? { latitude: place.latitude, longitude: place.longitude } : null;
}

// ---- Linking a ride to the stock requests it carries ----
// A ride can carry stock requests (trip.requestIds). The store confirms the delivery ONCE: either
// "Confirm received" on the ride (which marks the carried requests delivered) or "Delivered" on the
// Stock Requests screen (which confirms the ride). Both directions below.
const REQUEST_DONE = ['delivered', 'partially-delivered'];

// Marks one stock request delivered because the ride confirmed it. Only a request production has
// actually shipped can be delivered (delivery credits the shipped quantities to the store's stock),
// and a request that is already delivered is left alone so stock is never credited twice.
async function deliverRequestFromRide(requestId: string, byName: string): Promise<'delivered' | 'already' | 'not_shipped' | 'missing'> {
  const req = await kv.get(`production_request_${requestId}`);
  if (!req) return 'missing';
  if (REQUEST_DONE.includes(req.status)) return 'already';
  if (req.status !== 'shipped' && req.status !== 'partially-shipped') return 'not_shipped';
  const now = new Date().toISOString();
  await creditStoreInventoryForDelivery(req, requestId);
  await kv.set(`production_request_${requestId}`, { ...req, status: 'delivered', updatedAt: now, deliveredAt: now, deliveredBy: byName, deliveredViaRide: true });
  return 'delivered';
}

// If every stock request on a delivered ride has already been marked delivered in Stock Requests,
// the ride's receipt is confirmed automatically - the store should not have to confirm it twice.
async function autoReceiptFromRequests(trip: any, byName?: string): Promise<any | null> {
  const ids: string[] = Array.isArray(trip.requestIds) ? trip.requestIds : [];
  if (trip.status !== 'delivered' || trip.receipt || ids.length === 0) return null;
  const reqs = await Promise.all(ids.map((id) => kv.get(`production_request_${id}`)));
  if (reqs.some((r) => !r || !REQUEST_DONE.includes(r.status))) return null;
  const partial = reqs.some((r) => r.status === 'partially-delivered');
  const stops = tripStops(trip);
  const lastStop = stops[stops.length - 1];
  const who = byName || reqs[reqs.length - 1]?.deliveredBy || 'the store';
  const receipt = {
    status: partial ? 'issue' : 'confirmed',
    note: partial ? 'Marked partially delivered in Stock Requests - see the request for what was short' : 'Confirmed through Stock Requests',
    byName: who,
    at: new Date().toISOString(),
    viaRequests: true,
    requestsDelivered: ids.length,
  };
  const updated = { ...trip, receipt };
  await kv.set(`rider-trip:${trip.id}`, updated);
  const heads = await getAllProductionHeads();
  const caller = trip.calledBy ? await kv.get(`unified-employee:${trip.calledBy}`) : null;
  await notifyEmployeeIds(
    [...heads, caller],
    'rider_receipt',
    partial ? 'Delivery partly received' : 'Delivery received',
    partial ? `${lastStop.name} marked the stock request partially delivered - check what was short.` : `${lastStop.name} confirmed the stock request from ${trip.riderName}'s ride was received.`,
    updated
  );
  return updated;
}

// Called whenever a stock request is marked delivered: confirm any delivered ride that carried it.
async function confirmRidesForRequest(requestId: string, byName?: string): Promise<void> {
  try {
    // Stock Requests records who delivered it as an employee id - show their name instead.
    let name = byName;
    if (byName) {
      const emp = await kv.get(`unified-employee:${byName}`);
      if (emp?.name) name = emp.name;
    }
    const trips = await getAllByPrefixWithRetry('rider-trip:');
    for (const t of trips || []) {
      if (t.status === 'delivered' && !t.receipt && Array.isArray(t.requestIds) && t.requestIds.includes(requestId)) {
        await autoReceiptFromRequests(t, name);
      }
    }
  } catch (error) {
    console.log('Could not sync ride receipts for request', requestId, error);
  }
}

// Guardrail: the rider may only mark Arrived / Picked up / Delivered while actually at that stop.
// Checked against the phone's last reported position (and its stated accuracy), which must be
// fresh. A stop with no map location yet can't be checked, so it is allowed but recorded as
// unverified rather than blocking the ride.
const RIDER_GEOFENCE_METRES = 200;
const RIDER_LOCATION_MAX_AGE_MS = 3 * 60 * 1000;

async function checkRiderAtStop(
  trip: any,
  stop: RiderStop,
  action: string
): Promise<{ ok: true; verified: boolean; meters: number | null } | { ok: false; error: string }> {
  const coords = await stopCoordinates(stop);
  if (!coords) return { ok: true, verified: false, meters: null };
  const loc = await kv.get(`rider-location:${trip.id}`);
  if (!loc || Date.now() - new Date(loc.updatedAt).getTime() > RIDER_LOCATION_MAX_AGE_MS) {
    return { ok: false, error: "We can't see your location right now. Turn on location/GPS, wait a few seconds, then try again." };
  }
  const meters = haversineMetres(loc.latitude, loc.longitude, coords.latitude, coords.longitude);
  const allowed = RIDER_GEOFENCE_METRES + Math.min(typeof loc.accuracy === 'number' ? loc.accuracy : 0, 100);
  if (meters > allowed) {
    const away = meters >= 1000 ? `${(meters / 1000).toFixed(1)} km` : `${Math.round(meters / 10) * 10} m`;
    return { ok: false, error: `You're about ${away} from ${stop.name}. Get to ${stop.name} before marking ${action}.` };
  }
  return { ok: true, verified: true, meters: Math.round(meters) };
}

// Is the actor store staff for a store this ride stops at, and may they watch the rider right now?
// (Watching: once the order is on its way to their store, or while the rider is coming to pick up from it.)
function storeStaffMayWatch(trip: any, actor: any): boolean {
  if (!(actor.designation === 'store_incharge' || actor.designation === 'store_ops') || !actor.storeId) return false;
  const { pickup, drop } = rideEnds(trip);
  const pickupIsMine = pickup.kind === 'store' && pickup.id === actor.storeId;
  const dropIsMine = drop.kind === 'store' && drop.id === actor.storeId;
  return (pickupIsMine && RIDER_LOCATION_STATUSES.includes(trip.status)) || (dropIsMine && trip.status === 'picked_up');
}

// Riders available to be called (dispatch roles only), with live availability and default rate.
app.get('/make-server-c2dd9b9d/rider/riders', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.canDispatch) return c.json({ error: 'Not allowed' }, 403);
    const all = await kv.getByPrefix('unified-employee:');
    const riderEmployees = (all || []).filter((e: any) => e.designation === 'rider' && e.status !== 'inactive');
    const riders = [];
    for (const e of riderEmployees) {
      const profile = await loadRiderProfile(e.employeeId);
      const avail = riderAvailability(profile);
      riders.push({
        employeeId: e.employeeId,
        name: profile?.name || e.name,
        available: avail.available,
        unavailableReason: avail.reason,
        defaultRate: profile?.defaultRate ?? null,
        aadhaarMasked: maskAadhaar(profile?.aadhaar),
        aadhaarFull: actor.role === 'cluster_head' ? (profile?.aadhaar || null) : null,
        hasProfile: !!profile,
      });
    }
    // Available riders first, unavailable (shown red) last.
    riders.sort((a, b) => Number(b.available) - Number(a.available) || a.name.localeCompare(b.name));
    return c.json({ riders });
  } catch (error) {
    console.log('Error fetching riders:', error);
    return c.json({ error: 'Failed to fetch riders' }, 500);
  }
});

// Trips for a date (default today) plus any still-active trip from an earlier day, scoped by who
// is asking: a rider sees only their own, store staff only rides that stop at their store,
// dispatch roles see everything.
app.get('/make-server-c2dd9b9d/rider/trips', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    const date = c.req.query('date') || getTodayIST();
    // Optional range (inclusive, YYYY-MM-DD) for the Past rides view; without it: one day + anything still active.
    const from = c.req.query('from');
    const to = c.req.query('to');
    const isIso = (d?: string) => !!d && /^\d{4}-\d{2}-\d{2}$/.test(d);
    const all = await getAllByPrefixWithRetry('rider-trip:');
    let trips = (all || []).filter((t: any) =>
      isIso(from) && isIso(to)
        ? t.date >= (from as string) && t.date <= (to as string)
        : t.date === date || RIDER_ACTIVE_STATUSES.includes(t.status)
    );
    if (actor.isRider) {
      trips = trips.filter((t: any) => t.riderEmployeeId === actor.employeeId);
    } else if (!actor.canDispatch) {
      const isStoreStaff = actor.designation === 'store_incharge' || actor.designation === 'store_ops';
      if (!isStoreStaff || !actor.storeId) return c.json({ trips: [] });
      trips = trips.filter((t: any) => tripStops(t).some((st) => st.kind === 'store' && st.id === actor.storeId));
    }
    // Give older rides the same shape as new ones so the screens only deal with one format.
    trips = trips.map((t: any) => ({ ...t, stops: tripStops(t), legIndex: tripLegIndex(t), tripType: t.tripType || (t.direction === 'to_production' ? 'to_production' : 'to_store') }));
    if (actor.isRider) trips = await withRiderRideDetails(trips);
    trips.sort((a: any, b: any) => String(b.calledAt).localeCompare(String(a.calledAt)));
    return c.json({ trips, maxTripsPerDay: RIDER_MAX_TRIPS_PER_DAY });
  } catch (error) {
    console.log('Error fetching rider trips:', error);
    return c.json({ error: 'Failed to fetch trips' }, 500);
  }
});

// Call a rider in (dispatch roles). tripType: 'to_store' (production house -> store, the default),
// 'to_production' (store -> production house), 'round_trip' (store -> production -> store) or
// 'custom' (any two places, including a one-off location such as an event stall).
app.post('/make-server-c2dd9b9d/rider/trips', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.canDispatch) return c.json({ error: 'Only the production incharge, an operations manager or the cluster head can call a rider' }, 403);

    const body = await c.req.json();
    const { riderEmployeeId, storeId, note, fare, force } = body;
    const requestedRequestIds: string[] = Array.isArray(body.requestIds) ? body.requestIds.filter((x: any) => typeof x === 'string') : [];
    const tripType: string = ['to_store', 'to_production', 'round_trip', 'custom'].includes(body.tripType) ? body.tripType : (body.direction === 'to_production' ? 'to_production' : 'to_store');
    if (!riderEmployeeId) return c.json({ error: 'Choose a rider' }, 400);

    const rider = await kv.get(`unified-employee:${riderEmployeeId}`);
    if (!rider || rider.designation !== 'rider') return c.json({ error: 'That employee is not a rider' }, 400);

    // ---- work out the stops
    const makeStop = async (input: any): Promise<RiderStop | { error: string }> => {
      if (input?.kind === 'production') {
        const house = input.id ? await kv.get(`production_house_${input.id}`) : null;
        return house ? { kind: 'production', id: input.id, name: house.name || 'Production house' } : { error: 'Production house not found' };
      }
      if (input?.kind === 'store') {
        const st = input.id ? await kv.get(`store:${input.id}`) : null;
        return st ? { kind: 'store', id: input.id, name: st.name || 'Store' } : { error: 'Store not found' };
      }
      if (input?.kind === 'custom') {
        const name = typeof input.name === 'string' ? input.name.trim() : '';
        if (name.length < 2) return { error: 'Give the custom location a name' };
        if (!isValidLatLng(input.latitude, input.longitude)) return { error: `Set the map location for "${name}"` };
        return { kind: 'custom', id: null, name, latitude: input.latitude, longitude: input.longitude };
      }
      return { error: 'Choose where the ride starts and ends' };
    };

    let stops: RiderStop[] = [];
    if (tripType === 'custom') {
      const pickup = await makeStop(body.pickup);
      if ('error' in pickup) return c.json({ error: pickup.error }, 400);
      const drop = await makeStop(body.drop);
      if ('error' in drop) return c.json({ error: drop.error }, 400);
      stops = [pickup, drop];
    } else {
      if (!storeId) return c.json({ error: 'Choose a store' }, 400);
      const store = await kv.get(`store:${storeId}`);
      if (!store) return c.json({ error: 'Store not found' }, 404);
      if (!store.productionHouseId) return c.json({ error: `${store.name || 'This store'} has no production house linked` }, 400);
      const houseStop = await makeStop({ kind: 'production', id: store.productionHouseId });
      if ('error' in houseStop) return c.json({ error: houseStop.error }, 400);
      const storeStop: RiderStop = { kind: 'store', id: storeId, name: store.name || 'Store' };
      stops = tripType === 'to_production' ? [storeStop, houseStop]
        : tripType === 'round_trip' ? [storeStop, houseStop, storeStop]
        : [houseStop, storeStop];
    }
    if (stops.length === 2 && stops[0].kind === stops[1].kind && stops[0].id === stops[1].id && stops[0].kind !== 'custom') {
      return c.json({ error: 'The ride starts and ends at the same place' }, 400);
    }

    const profile = await loadRiderProfile(riderEmployeeId);
    const avail = riderAvailability(profile);
    if (!avail.available && !force) {
      return c.json({ error: `${profile?.name || rider.name} is unavailable right now (${avail.reason}).`, unavailable: true }, 409);
    }

    const today = getTodayIST();
    const all = await getAllByPrefixWithRetry('rider-trip:');
    const riderTrips = (all || []).filter((t: any) => t.riderEmployeeId === riderEmployeeId);
    if (riderTrips.some((t: any) => RIDER_ACTIVE_STATUSES.includes(t.status))) {
      return c.json({ error: `${rider.name} already has a ride in progress. Wait until it is delivered or cancel it first.` }, 400);
    }
    const todaysCount = riderTrips.filter((t: any) => t.date === today && t.status !== 'cancelled').length;
    if (todaysCount >= RIDER_MAX_TRIPS_PER_DAY) {
      return c.json({ error: `${rider.name} has already done ${RIDER_MAX_TRIPS_PER_DAY} rides today.` }, 400);
    }

    // Fare: what production typed, else the rider's own default rate. With no rate at all the
    // rider has to name one first (and production approves it) before the ride can start.
    const typedFare = typeof fare === 'number' && fare > 0 ? fare : null;
    const startingFare = typedFare ?? (profile?.defaultRate > 0 ? profile.defaultRate : 0);

    const primaryStore = stops.find((st) => st.kind === 'store') || null;
    const primaryHouse = stops.find((st) => st.kind === 'production') || null;

    // Stock requests this ride carries: only those for the store it finally delivers to, and not
    // already delivered. They get marked delivered when the store confirms the ride.
    const finalStop = stops[stops.length - 1];
    let requestIds: string[] = [];
    if (finalStop.kind === 'store' && requestedRequestIds.length > 0) {
      const found = await Promise.all(requestedRequestIds.map((id) => kv.get(`production_request_${id}`)));
      requestIds = requestedRequestIds.filter((id, i) => found[i] && found[i].storeId === finalStop.id && !REQUEST_DONE.includes(found[i].status));
    }
    const now = new Date().toISOString();
    const id = `${Date.now()}-${Math.random().toString(36).substr(2, 7)}`;
    const trip = {
      id,
      date: today,
      tripNumber: todaysCount + 1,
      tripType,
      direction: tripType === 'to_production' ? 'to_production' : 'to_store',
      stops,
      legIndex: 0,
      legs: [],
      requestIds,
      riderEmployeeId,
      riderName: profile?.name || rider.name,
      storeId: primaryStore?.id || null,
      storeName: primaryStore?.name || '',
      productionHouseId: primaryHouse?.id || null,
      productionHouseName: primaryHouse?.name || null,
      note: typeof note === 'string' ? note.trim() : '',
      fare: startingFare,
      defaultFare: startingFare,
      proposedFare: null,
      fareStatus: startingFare > 0 ? 'agreed' : 'needs_rate',
      status: 'called',
      calledAt: now,
      calledBy: actor.employeeId,
      calledByName: actor.name,
      onTheWayAt: null,
      arrivedAt: null,
      readyAt: null,
      readyByName: null,
      pickedUpAt: null,
      deliveredAt: null,
      cancelledAt: null,
    };
    await kv.set(`rider-trip:${id}`, trip);

    const route = stops.map((st) => st.name).join(' → ');
    await notifyEmployeeIds(
      [rider],
      'rider_called',
      stops[0].kind === 'production' ? 'Come to the production house now' : `Pick up at ${stops[0].name} now`,
      `${actor.name} is calling you for a ride: ${route}${startingFare > 0 ? ` (fare ₹${startingFare})` : ''}${trip.note ? ` - ${trip.note}` : ''}.`,
      trip
    );
    return c.json({ success: true, trip });
  } catch (error) {
    console.log('Error calling rider:', error);
    return c.json({ error: 'Failed to call rider' }, 500);
  }
});

// Whoever hands the order over marks it ready: dispatch roles always; for store -> production
// rides the store incharge of that store too.
app.post('/make-server-c2dd9b9d/rider/trips/:id/ready', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);
    const pickupStop = rideEnds(trip).pickup;
    const isPickupStoreStaff = pickupStop.kind === 'store' &&
      (actor.designation === 'store_incharge' || actor.designation === 'store_ops') && !!actor.storeId && actor.storeId === pickupStop.id;
    if (!actor.canDispatch && !isPickupStoreStaff) return c.json({ error: 'Not allowed' }, 403);
    if (!['called', 'on_the_way', 'arrived'].includes(trip.status)) {
      return c.json({ error: 'This ride is already picked up or closed' }, 400);
    }
    if (trip.readyAt) return c.json({ success: true, trip });

    const updated = { ...trip, readyAt: new Date().toISOString(), readyByName: actor.name };
    await kv.set(`rider-trip:${trip.id}`, updated);

    const rider = await kv.get(`unified-employee:${trip.riderEmployeeId}`);
    await notifyEmployeeIds(
      [rider],
      'rider_ready',
      'Order ready for pickup',
      trip.status === 'arrived' ? 'Your order is ready - collect it now.' : `The order is ready. Collect it when you reach ${rideEnds(trip).pickupName}.`,
      updated
    );
    return c.json({ success: true, trip: updated });
  } catch (error) {
    console.log('Error marking trip ready:', error);
    return c.json({ error: 'Failed to mark ready' }, 500);
  }
});

// Rider moves their own trip to the next stage.
app.post('/make-server-c2dd9b9d/rider/trips/:id/advance', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);
    const { status, override } = await c.req.json();
    // Dispatch can confirm a step on the rider's behalf (e.g. their GPS is not working) - skips the
    // location check, and is recorded on the ride.
    const isOverride = !!override && actor.canDispatch;
    if (!isOverride && (!actor.isRider || trip.riderEmployeeId !== actor.employeeId)) {
      return c.json({ error: 'This is not your ride' }, 403);
    }
    if (RIDER_NEXT_STATUS[trip.status] !== status) {
      return c.json({ error: 'That is not the next step for this ride' }, 400);
    }
    // The fare has to be settled before the ride starts: either the default was accepted, or
    // the rider's changed rate was approved by production. (Rides created before fares existed
    // have no fareStatus and are never blocked.)
    if (status === 'on_the_way' && trip.fareStatus && trip.fareStatus !== 'agreed') {
      return c.json({
        error: trip.fareStatus === 'proposed'
          ? "Production hasn't approved your rate yet. Wait for their reply."
          : 'Set your rate for this ride first - production has to agree to it.',
      }, 400);
    }
    if (status === 'picked_up' && !trip.readyAt) {
      return c.json({ error: "The order hasn't been marked ready for pickup yet. Wait for the go-ahead." }, 400);
    }
    // Location guardrails: arriving and picking up happen at the pickup stop, delivering at the drop.
    let geo: any = isOverride ? { overriddenBy: actor.name } : null;
    if (!isOverride && (status === 'arrived' || status === 'picked_up' || status === 'delivered')) {
      const here = rideEnds(trip);
      const check = await checkRiderAtStop(trip, status === 'delivered' ? here.drop : here.pickup, status === 'arrived' ? 'arrived' : status === 'picked_up' ? 'picked up' : 'delivered');
      if (!check.ok) return c.json({ error: check.error }, 400);
      geo = { verified: check.verified, meters: check.meters };
    }
    const geoKey = `${tripLegIndex(trip)}:${status}`;

    const now = new Date().toISOString();
    const stampField: Record<string, string> = {
      on_the_way: 'onTheWayAt',
      arrived: 'arrivedAt',
      picked_up: 'pickedUpAt',
      delivered: 'deliveredAt',
    };
    const ends = rideEnds(trip);
    const who = trip.riderName;
    const pickupParty = await stopParty(ends.pickup, trip);
    const dropParty = await stopParty(ends.drop, trip);

    // Delivering a leg that is not the last one (e.g. store -> production on a round trip): the
    // rider is now AT the next pickup, so the ride carries on from "arrived" for the next leg.
    if (status === 'delivered' && !isFinalLeg(trip)) {
      const legRecord = {
        pickup: ends.pickupName, drop: ends.dropName,
        onTheWayAt: trip.onTheWayAt, arrivedAt: trip.arrivedAt, readyAt: trip.readyAt, pickedUpAt: trip.pickedUpAt, deliveredAt: now,
      };
      const next = tripStops(trip)[tripLegIndex(trip) + 2];
      const advanced = {
        ...trip,
        legs: [...(trip.legs || []), legRecord],
        legIndex: tripLegIndex(trip) + 1,
        status: 'arrived',
        onTheWayAt: null, arrivedAt: now, readyAt: null, readyByName: null, pickedUpAt: null, deliveredAt: null,
        geo: { ...(trip.geo || {}), [geoKey]: geo },
      };
      await kv.set(`rider-trip:${trip.id}`, advanced);
      await notifyEmployeeIds(dropParty, 'rider_arrived', 'Rider has arrived', `${who} delivered to ${ends.dropName} and is there for the next pickup (on to ${next?.name || 'the next stop'}). Mark the order ready.`, advanced);
      await notifyEmployeeIds(pickupParty, 'rider_delivered', 'Leg delivered', `${who} delivered the order to ${ends.dropName}.`, advanced);
      return c.json({ success: true, trip: advanced });
    }

    const updated = { ...trip, status, [stampField[status]]: now, ...(geo ? { geo: { ...(trip.geo || {}), [geoKey]: geo } } : {}) };
    await kv.set(`rider-trip:${trip.id}`, updated);

    if (status === 'on_the_way') {
      await notifyEmployeeIds(pickupParty, 'rider_on_the_way', 'Rider is on the way', `${who} is heading to ${ends.pickupName} for the pickup.`, updated);
    } else if (status === 'arrived') {
      await notifyEmployeeIds(pickupParty, 'rider_arrived', 'Rider has arrived', `${who} is at ${ends.pickupName} for the pickup.`, updated);
    } else if (status === 'picked_up') {
      await notifyEmployeeIds(dropParty, 'rider_picked_up', 'Order is on its way', `${who} has picked up the order and is heading to ${ends.dropName}.`, updated);
      await notifyEmployeeIds(pickupParty, 'rider_picked_up', 'Order picked up', `${who} has picked up the order for ${ends.dropName}.`, updated);
    } else if (status === 'delivered') {
      await notifyEmployeeIds(dropParty, 'rider_delivered', 'Order delivered', `${who} has delivered the order to ${ends.dropName}. Please check it and confirm you received it.`, updated);
      await notifyEmployeeIds(pickupParty, 'rider_delivered', 'Order delivered', `${who} delivered the order to ${ends.dropName}.`, updated);
    }
    // The store may already have marked the carried stock requests delivered - then the ride's
    // receipt is confirmed right away.
    if (status === 'delivered') {
      const settled = await autoReceiptFromRequests(updated);
      if (settled) return c.json({ success: true, trip: settled });
    }
    return c.json({ success: true, trip: updated });
  } catch (error) {
    console.log('Error advancing rider trip:', error);
    return c.json({ error: 'Failed to update the ride' }, 500);
  }
});

// Rider proposes a different rate for a ride that is waiting for them (before accepting it).
app.post('/make-server-c2dd9b9d/rider/trips/:id/fare', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);
    if (!actor.isRider || trip.riderEmployeeId !== actor.employeeId) return c.json({ error: 'This is not your ride' }, 403);
    if (trip.status !== 'called') return c.json({ error: 'The rate can only be changed before you start the ride' }, 400);

    const { amount } = await c.req.json();
    if (typeof amount !== 'number' || !isFinite(amount) || amount <= 0 || amount > 100000) {
      return c.json({ error: 'Enter a valid rate in rupees' }, 400);
    }
    const rounded = Math.round(amount);
    // Same as the agreed fare: nothing to approve.
    if (rounded === trip.fare && trip.fareStatus === 'agreed') return c.json({ success: true, trip });

    const updated = { ...trip, proposedFare: rounded, fareStatus: 'proposed', fareProposedAt: new Date().toISOString() };
    await kv.set(`rider-trip:${trip.id}`, updated);

    const productionHeads = await getAllProductionHeads();
    const caller = trip.calledBy ? await kv.get(`unified-employee:${trip.calledBy}`) : null;
    await notifyEmployeeIds(
      [...productionHeads, caller],
      'rider_fare_proposed',
      'Rider asks for a different rate',
      `${trip.riderName} wants ₹${rounded} for the ride to ${rideEnds(trip).dropName}${trip.fare > 0 ? ` instead of ₹${trip.fare}` : ''}. Approve or reject it in Riders.`,
      updated
    );
    return c.json({ success: true, trip: updated });
  } catch (error) {
    console.log('Error proposing rider fare:', error);
    return c.json({ error: 'Failed to send your rate' }, 500);
  }
});

// Production approves or rejects the rider's proposed rate.
app.post('/make-server-c2dd9b9d/rider/trips/:id/fare-decision', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.canDispatch) return c.json({ error: 'Not allowed' }, 403);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);
    if (trip.fareStatus !== 'proposed' || !trip.proposedFare) return c.json({ error: 'There is no rate waiting for a decision' }, 400);

    const { approve } = await c.req.json();
    const rider = await kv.get(`unified-employee:${trip.riderEmployeeId}`);
    let updated;
    if (approve) {
      updated = { ...trip, fare: trip.proposedFare, proposedFare: null, fareStatus: 'agreed', fareDecidedByName: actor.name, fareDecidedAt: new Date().toISOString() };
      await kv.set(`rider-trip:${trip.id}`, updated);
      await notifyEmployeeIds([rider], 'rider_fare_decided', 'Rate approved', `${actor.name} approved ₹${updated.fare} for this ride. You can start now.`, updated);
    } else {
      // Rejected: the previous fare stands (if there was none, the rider must name a rate again).
      updated = { ...trip, proposedFare: null, fareStatus: trip.fare > 0 ? 'agreed' : 'needs_rate', fareDecidedByName: actor.name, fareDecidedAt: new Date().toISOString() };
      await kv.set(`rider-trip:${trip.id}`, updated);
      await notifyEmployeeIds(
        [rider],
        'rider_fare_decided',
        'Rate not approved',
        updated.fare > 0 ? `${actor.name} kept the fare at ₹${updated.fare}. Start the ride, or ask the production incharge to talk.` : `${actor.name} did not approve that rate. Enter a new one.`,
        updated
      );
    }
    return c.json({ success: true, trip: updated });
  } catch (error) {
    console.log('Error deciding rider fare:', error);
    return c.json({ error: 'Failed to record the decision' }, 500);
  }
});

// The receiving end confirms the delivery (or reports a problem): the store incharge of the final
// stop, or dispatch roles. Does not hold up the rider's earnings - it is a record for production.
app.post('/make-server-c2dd9b9d/rider/trips/:id/receipt', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);
    if (trip.status !== 'delivered') return c.json({ error: 'The ride has not been delivered yet' }, 400);

    const stops = tripStops(trip);
    const lastStop = stops[stops.length - 1];
    const isReceivingStoreStaff = lastStop.kind === 'store' &&
      (actor.designation === 'store_incharge' || actor.designation === 'store_ops') && !!actor.storeId && actor.storeId === lastStop.id;
    if (!actor.canDispatch && !isReceivingStoreStaff) return c.json({ error: 'Not allowed' }, 403);

    const { ok, note } = await c.req.json();
    const cleanNote = typeof note === 'string' ? note.trim() : '';
    if (!ok && cleanNote.length < 3) return c.json({ error: 'Say what was wrong with the delivery' }, 400);

    // Confirming the ride also marks the stock requests it carried as delivered, so the store only
    // confirms once. (Reporting a problem leaves them as they are - use Stock Requests for a partial
    // delivery.) A request production never marked shipped can't be delivered and is reported back.
    let requestsDelivered = 0;
    const requestsNotShipped: string[] = [];
    if (ok) {
      for (const requestId of Array.isArray(trip.requestIds) ? trip.requestIds : []) {
        const outcome = await deliverRequestFromRide(requestId, actor.name);
        if (outcome === 'delivered' || outcome === 'already') requestsDelivered++;
        else if (outcome === 'not_shipped') requestsNotShipped.push(requestId);
      }
    }
    const linkNote = requestsNotShipped.length > 0
      ? ` ${requestsNotShipped.length} stock request${requestsNotShipped.length === 1 ? ' was' : 's were'} not shipped in Stock Requests yet, so ${requestsNotShipped.length === 1 ? 'it was' : 'they were'} left open.`
      : '';
    const receipt = {
      status: ok ? 'confirmed' : 'issue',
      note: cleanNote + (ok ? linkNote : ''),
      byName: actor.name,
      at: new Date().toISOString(),
      requestsDelivered,
    };
    const updated = { ...trip, receipt };
    await kv.set(`rider-trip:${trip.id}`, updated);

    const heads = await getAllProductionHeads();
    const caller = trip.calledBy ? await kv.get(`unified-employee:${trip.calledBy}`) : null;
    await notifyEmployeeIds(
      [...heads, caller],
      'rider_receipt',
      ok ? 'Delivery received' : 'Problem with a delivery',
      ok ? `${actor.name} confirmed ${lastStop.name} received the delivery from ${trip.riderName}.` : `${actor.name} reported a problem at ${lastStop.name}: ${cleanNote}`,
      updated
    );
    return c.json({ success: true, trip: updated });
  } catch (error) {
    console.log('Error recording delivery receipt:', error);
    return c.json({ error: 'Failed to record the confirmation' }, 500);
  }
});

// ---- Rider's own profile, availability and earnings ----
app.get('/make-server-c2dd9b9d/rider/profile', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.isRider || !actor.employeeId) return c.json({ error: 'Only riders have a rider profile' }, 403);
    const profile = await loadRiderProfile(actor.employeeId);
    const avail = riderAvailability(profile);
    return c.json({
      profile: {
        name: profile?.name || actor.name,
        aadhaar: profile?.aadhaar || '',
        defaultRate: profile?.defaultRate ?? null,
        availability: profile?.availability || null,
        unavailableUntil: profile?.unavailableUntil || null,
      },
      available: avail.available,
      unavailableReason: avail.reason,
    });
  } catch (error) {
    console.log('Error fetching rider profile:', error);
    return c.json({ error: 'Failed to load your profile' }, 500);
  }
});

app.put('/make-server-c2dd9b9d/rider/profile', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.isRider || !actor.employeeId) return c.json({ error: 'Only riders have a rider profile' }, 403);
    const body = await c.req.json();

    const name = typeof body.name === 'string' ? body.name.trim() : '';
    if (name.length < 2 || name.length > 80) return c.json({ error: 'Enter your full name' }, 400);

    const aadhaar = typeof body.aadhaar === 'string' ? body.aadhaar.replace(/\s+/g, '') : '';
    if (aadhaar && !/^\d{12}$/.test(aadhaar)) return c.json({ error: 'Aadhaar number must be 12 digits' }, 400);

    const rate = body.defaultRate === null || body.defaultRate === '' || body.defaultRate === undefined ? null : Number(body.defaultRate);
    if (rate !== null && (!isFinite(rate) || rate < 0 || rate > 100000)) return c.json({ error: 'Enter a valid rate per ride' }, 400);

    // Availability: one from/to range per weekday.
    const availability: Record<string, { enabled: boolean; from: string; to: string }> = {};
    for (const day of RIDER_DAY_KEYS) {
      const d = body.availability?.[day];
      if (!d) continue;
      const enabled = !!d.enabled;
      const from = String(d.from || '');
      const to = String(d.to || '');
      if (enabled) {
        const f = hhmmToMinutes(from);
        const t = hhmmToMinutes(to);
        if (isNaN(f) || isNaN(t) || f >= t) return c.json({ error: `${RIDER_DAY_LABELS[day]}: the end time must be after the start time` }, 400);
      }
      availability[day] = { enabled, from, to };
    }

    const existing = await loadRiderProfile(actor.employeeId);
    const profile = {
      ...(existing || {}),
      employeeId: actor.employeeId,
      name,
      aadhaar,
      defaultRate: rate,
      availability: Object.keys(availability).length ? availability : existing?.availability || null,
      updatedAt: new Date().toISOString(),
    };
    await kv.set(`rider-profile:${actor.employeeId}`, profile);
    return c.json({ success: true });
  } catch (error) {
    console.log('Error saving rider profile:', error);
    return c.json({ error: 'Failed to save your profile' }, 500);
  }
});

// Rider marks themselves unavailable for a while (or available again) on top of their schedule.
app.post('/make-server-c2dd9b9d/rider/availability', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.isRider || !actor.employeeId) return c.json({ error: 'Only riders can change availability' }, 403);
    const { unavailable, duration } = await c.req.json();

    const { now, endOfDayIso } = riderIstNow();
    let until: string | null = null;
    if (unavailable) {
      if (duration === 'hour') until = new Date(now.getTime() + 3600 * 1000).toISOString();
      else if (duration === 'three_hours') until = new Date(now.getTime() + 3 * 3600 * 1000).toISOString();
      else if (duration === 'rest_of_day') until = endOfDayIso;
      else until = 'indefinite';
    }
    const existing = (await loadRiderProfile(actor.employeeId)) || { employeeId: actor.employeeId, name: actor.name };
    await kv.set(`rider-profile:${actor.employeeId}`, { ...existing, unavailableUntil: until, updatedAt: new Date().toISOString() });
    const avail = riderAvailability({ ...existing, unavailableUntil: until });
    return c.json({ success: true, unavailableUntil: until, available: avail.available, unavailableReason: avail.reason });
  } catch (error) {
    console.log('Error saving rider availability:', error);
    return c.json({ error: 'Failed to update availability' }, 500);
  }
});

// What the rider has earned from delivered rides, and what has been paid out so far this month.
app.get('/make-server-c2dd9b9d/rider/summary', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.isRider || !actor.employeeId) return c.json({ error: 'Only riders have earnings' }, 403);
    const today = getTodayIST();
    const month = today.slice(0, 7);
    const [trips, payouts] = await Promise.all([getAllByPrefixWithRetry('rider-trip:'), getAllByPrefixWithRetry('payout:')]);
    const mine = (trips || []).filter((t: any) => t.riderEmployeeId === actor.employeeId && t.status === 'delivered');
    const sum = (rows: any[]) => rows.reduce((t, r) => t + (r.fare || 0), 0);
    const todayRides = mine.filter((t: any) => t.date === today);
    const monthRides = mine.filter((t: any) => (t.date || '').startsWith(month));
    const paid = (payouts || [])
      .filter((p: any) => p.employeeId === actor.employeeId && ((p.forMonth || (p.date || '').slice(0, 7)) === month))
      .reduce((t: number, p: any) => t + (p.amount || 0), 0);
    return c.json({
      today: { rides: todayRides.length, earned: sum(todayRides) },
      month: { rides: monthRides.length, earned: sum(monthRides), paid, balance: sum(monthRides) - paid },
    });
  } catch (error) {
    console.log('Error computing rider summary:', error);
    return c.json({ error: 'Failed to load earnings' }, 500);
  }
});

// Dispatch cancels a ride that is not yet delivered.
app.post('/make-server-c2dd9b9d/rider/trips/:id/cancel', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.canDispatch) return c.json({ error: 'Not allowed' }, 403);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);
    if (!RIDER_ACTIVE_STATUSES.includes(trip.status)) return c.json({ error: 'This ride is already closed' }, 400);

    const updated = { ...trip, status: 'cancelled', cancelledAt: new Date().toISOString() };
    await kv.set(`rider-trip:${trip.id}`, updated);
    const rider = await kv.get(`unified-employee:${trip.riderEmployeeId}`);
    await notifyEmployeeIds([rider], 'rider_cancelled', 'Ride cancelled', `${actor.name} cancelled the ride to ${trip.storeName}.`, updated);
    return c.json({ success: true, trip: updated });
  } catch (error) {
    console.log('Error cancelling rider trip:', error);
    return c.json({ error: 'Failed to cancel the ride' }, 500);
  }
});

// ---- Phase 2: live location + map pins ----
// Location lives in its OWN record per trip (rider-location:{tripId}) rather than on the trip
// itself: the rider's phone writes every few seconds, and a read-modify-write on the trip
// record could overwrite a status change (arrived / picked up) that landed in between.
const RIDER_LOCATION_STATUSES = ['on_the_way', 'arrived', 'picked_up'];
const RIDER_TRACK_MAX_POINTS = 500;
const RIDER_TRACK_MIN_STEP_METRES = 20;

const isValidLatLng = (lat: any, lng: any) =>
  typeof lat === 'number' && typeof lng === 'number' && isFinite(lat) && isFinite(lng) &&
  lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180;

function haversineMetres(aLat: number, aLng: number, bLat: number, bLng: number): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(bLat - aLat);
  const dLng = toRad(bLng - aLng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(aLat)) * Math.cos(toRad(bLat)) * Math.sin(dLng / 2) ** 2;
  return 2 * 6371000 * Math.asin(Math.sqrt(h));
}

// The rider's phone reports its position here while a ride is on the way / arrived / picked up.
app.post('/make-server-c2dd9b9d/rider/trips/:id/location', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);
    if (!actor.isRider || trip.riderEmployeeId !== actor.employeeId) return c.json({ error: 'This is not your ride' }, 403);
    // 409 tells the phone this ride no longer needs tracking, so it can stop sharing.
    if (!RIDER_LOCATION_STATUSES.includes(trip.status)) return c.json({ error: 'Ride is not being tracked', status: trip.status }, 409);

    const { latitude, longitude, accuracy, speed, bearing } = await c.req.json();
    if (!isValidLatLng(latitude, longitude)) return c.json({ error: 'Invalid location' }, 400);

    const key = `rider-location:${trip.id}`;
    const existing = await kv.get(key);
    const track: [number, number, string][] = Array.isArray(existing?.track) ? existing.track : [];
    const now = new Date().toISOString();
    const last = track[track.length - 1];
    if (!last || haversineMetres(last[0], last[1], latitude, longitude) >= RIDER_TRACK_MIN_STEP_METRES) {
      track.push([latitude, longitude, now]);
      if (track.length > RIDER_TRACK_MAX_POINTS) track.splice(0, track.length - RIDER_TRACK_MAX_POINTS);
    }
    await kv.set(key, {
      tripId: trip.id,
      latitude,
      longitude,
      accuracy: typeof accuracy === 'number' ? accuracy : null,
      speed: typeof speed === 'number' ? speed : null,
      bearing: typeof bearing === 'number' ? bearing : null,
      updatedAt: now,
      track,
    });
    return c.json({ success: true });
  } catch (error) {
    console.log('Error saving rider location:', error);
    return c.json({ error: 'Failed to save location' }, 500);
  }
});

// Live position + the pins for every stop of one trip. Riders see their own; dispatch roles see
// any active trip; store staff see a ride that is coming to / leaving from their store.
app.get('/make-server-c2dd9b9d/rider/trips/:id/location', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);

    const isOwnRider = actor.isRider && trip.riderEmployeeId === actor.employeeId;
    if (!(isOwnRider || actor.canDispatch || storeStaffMayWatch(trip, actor))) return c.json({ error: 'Not allowed' }, 403);

    const location = await kv.get(`rider-location:${trip.id}`);
    const stops = tripStops(trip);
    const places: { kind: string; name: string; latitude: number; longitude: number }[] = [];
    const missingPins: string[] = [];
    const seen = new Set<string>();
    for (const stop of stops) {
      const key = `${stop.kind}:${stop.id || stop.name}`;
      if (seen.has(key)) continue;   // a round trip passes the same store twice
      seen.add(key);
      const coords = await stopCoordinates(stop);
      if (coords) places.push({ kind: stop.kind, name: stop.name, ...coords });
      else missingPins.push(stop.name);
    }
    const firstOf = (kind: string) => places.find((p) => p.kind === kind) || null;
    return c.json({
      status: trip.status,
      location: location || null,
      places,
      missingPins,
      // Kept for app versions that predate multi-stop rides.
      production: firstOf('production'),
      store: firstOf('store'),
    });
  } catch (error) {
    console.log('Error fetching rider location:', error);
    return c.json({ error: 'Failed to fetch location' }, 500);
  }
});

// ---- ETA, distance and traffic for an active ride ----
// Route distance/duration come from the free OSRM public router (free-flow driving time - it has
// NO live traffic). Traffic is therefore judged from how fast the rider is actually moving
// compared with that free-flow speed, and "late / early" compares the predicted leg time with
// what this leg usually takes (median of past rides in the same direction, or - until there are
// enough past rides - the route's free-flow time plus a 25% city buffer). If a paid traffic
// provider (e.g. Google Directions) is added later, only osrmRoute() below needs to change.
const OSRM_BASE = 'https://router.project-osrm.org';
const ETA_CACHE_MS = 40_000;

async function osrmRoute(aLat: number, aLng: number, bLat: number, bLng: number): Promise<{ distance: number; duration: number; source: string }> {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 6000);
    const res = await fetch(`${OSRM_BASE}/route/v1/driving/${aLng},${aLat};${bLng},${bLat}?overview=false`, {
      signal: ctrl.signal,
      headers: { 'User-Agent': 'BunnyMomosInventory/1.0 (rider ETA)' },
    });
    clearTimeout(timer);
    if (res.ok) {
      const json = await res.json();
      const r = json?.routes?.[0];
      if (r && typeof r.distance === 'number' && typeof r.duration === 'number') {
        return { distance: r.distance, duration: r.duration, source: 'osrm' };
      }
    }
  } catch (_) { /* fall through to the straight-line estimate */ }
  // Straight-line distance x 1.35 for real roads, at a slow 22 km/h city average.
  const distance = haversineMetres(aLat, aLng, bLat, bLng) * 1.35;
  return { distance, duration: distance / (22 / 3.6), source: 'estimate' };
}

const median = (xs: number[]) => {
  const a = [...xs].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
};

app.get('/make-server-c2dd9b9d/rider/trips/:id/eta', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    const trip = await kv.get(`rider-trip:${c.req.param('id')}`);
    if (!trip) return c.json({ error: 'Trip not found' }, 404);

    const isOwnRider = actor.isRider && trip.riderEmployeeId === actor.employeeId;
    if (!(isOwnRider || actor.canDispatch || storeStaffMayWatch(trip, actor))) return c.json({ error: 'Not allowed' }, 403);

    // Which leg is the rider on? On the way = heading to the pickup, picked up = heading to the drop.
    const ends = rideEnds(trip);
    const leg = trip.status === 'on_the_way' ? 'pickup' : trip.status === 'picked_up' ? 'drop' : null;
    if (!leg) return c.json({ leg: null });
    const targetStop = leg === 'pickup' ? ends.pickup : ends.drop;
    const targetKind = targetStop.kind;
    const targetName = targetStop.name;
    const targetPlace = await stopCoordinates(targetStop);
    const location = await kv.get(`rider-location:${trip.id}`);
    if (!location) return c.json({ leg, targetName, unavailable: 'waiting_for_location' });
    if (!targetPlace) return c.json({ leg, targetName, unavailable: 'destination_not_pinned' });

    const legKey = `${tripLegIndex(trip)}:${leg}`;
    const prev = await kv.get(`rider-eta:${trip.id}`);
    const sameLeg = prev && prev.legKey === legKey;
    if (sameLeg && Date.now() - new Date(prev.computedAt).getTime() < ETA_CACHE_MS) return c.json(prev);

    const route = await osrmRoute(location.latitude, location.longitude, targetPlace.latitude, targetPlace.longitude);
    // OSRM's driving times are free-flow and optimistic for a city like this (it happily assumes
    // 50-80 km/h), which produced a 3 minute ETA for 3.8 km. Use a realistic city pace instead:
    // at least 1.3x OSRM's time and never faster than a 25 km/h average.
    const baseDuration = Math.max(route.duration * 1.3, route.distance / (25 / 3.6));
    const freeFlowMps = baseDuration > 0 ? route.distance / baseDuration : 0;

    // Observed speed over the last few minutes (stops included, so a jam shows up as slow).
    const track: [number, number, string][] = Array.isArray(location.track) ? location.track : [];
    const endMs = new Date(location.updatedAt).getTime();
    const windowStart = endMs - 8 * 60 * 1000;
    const recent = track.filter((p) => new Date(p[2]).getTime() >= windowStart);
    let observedMps: number | null = null;
    if (recent.length >= 2) {
      let path = 0;
      for (let i = 1; i < recent.length; i++) path += haversineMetres(recent[i - 1][0], recent[i - 1][1], recent[i][0], recent[i][1]);
      const spanSec = (endMs - new Date(recent[0][2]).getTime()) / 1000;
      if (spanSec >= 120) observedMps = path / spanSec;
    } else if (recent.length <= 1 && track.length > 0) {
      const lastMs = new Date(track[track.length - 1][2]).getTime();
      if (endMs - lastMs >= 120 * 1000) observedMps = 0; // no movement for 2+ minutes
    }

    const nearTarget = route.distance < 150;
    let level: 'light' | 'moderate' | 'heavy' | 'unknown' = 'unknown';
    if (observedMps !== null && freeFlowMps > 0 && !nearTarget) {
      const ratio = observedMps / freeFlowMps;
      level = ratio < 0.35 ? 'heavy' : ratio < 0.7 ? 'moderate' : 'light';
    }

    let etaSeconds = baseDuration;
    if (observedMps !== null && observedMps > 0.5 && !nearTarget) {
      // A burst of speed (or a GPS jump) must not collapse the ETA - clip to 45 km/h.
      const usable = Math.min(observedMps, 12.5);
      etaSeconds = Math.min(baseDuration * 3, 0.5 * baseDuration + 0.5 * (route.distance / usable));
    } else if (observedMps === 0 && !nearTarget) {
      etaSeconds = baseDuration * 1.5;
    }
    etaSeconds = Math.round(Math.max(etaSeconds, nearTarget ? 0 : route.distance / 12.5)); // never faster than a 45 km/h average

    // What this leg normally takes: median of past rides of the same type to/from the same store
    // once there are three, else free-flow time + 25%. Fixed at the first estimate of the leg.
    let expectedSeconds: number = sameLeg && prev.expectedSeconds ? prev.expectedSeconds : 0;
    if (!expectedSeconds) {
      const typeOf = (t: any) => t.tripType || t.direction;
      const history = trip.storeId
        ? (await getAllByPrefixWithRetry('rider-trip:'))
            .filter((t: any) => t.status === 'delivered' && typeOf(t) === typeOf(trip) && t.storeId === trip.storeId && t.id !== trip.id)
            .map((t: any) => leg === 'drop'
              ? (t.deliveredAt && t.pickedUpAt ? (new Date(t.deliveredAt).getTime() - new Date(t.pickedUpAt).getTime()) / 1000 : 0)
              : (t.arrivedAt && t.onTheWayAt ? (new Date(t.arrivedAt).getTime() - new Date(t.onTheWayAt).getTime()) / 1000 : 0))
            .filter((x: number) => x > 60 && x < 3 * 3600)
        : [];
      expectedSeconds = history.length >= 3 ? Math.round(median(history)) : Math.round(baseDuration * 1.1);
    }
    const legStartIso = leg === 'drop' ? trip.pickedUpAt : trip.onTheWayAt;
    const elapsedSeconds = legStartIso ? Math.max(0, (Date.now() - new Date(legStartIso).getTime()) / 1000) : 0;
    const deltaSeconds = Math.round(elapsedSeconds + etaSeconds - expectedSeconds);
    const tolerance = Math.max(300, expectedSeconds * 0.2);
    const timing: 'late' | 'early' | 'on_time' = deltaSeconds > tolerance ? 'late' : deltaSeconds < -tolerance ? 'early' : 'on_time';

    const result = {
      leg,
      legKey,
      targetName,
      distanceMeters: Math.round(route.distance),
      etaSeconds,
      etaAt: new Date(Date.now() + etaSeconds * 1000).toISOString(),
      traffic: {
        level,
        observedKmh: observedMps === null ? null : Math.round(observedMps * 3.6),
        freeFlowKmh: Math.round(freeFlowMps * 3.6),
      },
      timing,
      deltaMinutes: Math.round(deltaSeconds / 60),
      expectedMinutes: Math.round(expectedSeconds / 60),
      source: route.source,
      computedAt: new Date().toISOString(),
      expectedSeconds,
      lateNotified: !!(sameLeg && prev.lateNotified),
    };

    // Tell the people waiting at the destination once, when the rider is clearly running late.
    if (timing === 'late' && deltaSeconds >= 600 && !result.lateNotified) {
      result.lateNotified = true;
      const party = await stopParty(targetStop, trip);
      const why = level === 'heavy' ? ' - heavy traffic' : level === 'moderate' ? ' - slow traffic' : '';
      await notifyEmployeeIds(
        party,
        'rider_running_late',
        'Rider is running late',
        `${trip.riderName} is about ${Math.round(deltaSeconds / 60)} min later than usual to ${targetName}${why}. New ETA ${new Date(result.etaAt).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata' })}.`,
        trip
      );
    }

    await kv.set(`rider-eta:${trip.id}`, result);
    return c.json(result);
  } catch (error) {
    console.log('Error computing rider ETA:', error);
    return c.json({ error: 'Failed to compute ETA' }, 500);
  }
});

// Which production houses / stores already have a map pin (dispatch roles).
app.get('/make-server-c2dd9b9d/rider/places', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.canDispatch) return c.json({ error: 'Not allowed' }, 403);
    const [stores, houses, places] = await Promise.all([
      kv.getByPrefix('store:'),
      kv.getByPrefix('production_house_'),
      kv.getByPrefix('rider-place:'),
    ]);
    const placeFor = (kind: string, id: string) => (places || []).find((p: any) => p.kind === kind && p.id === id) || null;
    const shape = (kind: 'production' | 'store', e: any) => {
      const p = placeFor(kind, e.id);
      return { kind, id: e.id, name: e.name, latitude: p?.latitude ?? null, longitude: p?.longitude ?? null, setByName: p?.setByName ?? null, setAt: p?.setAt ?? null };
    };
    return c.json({
      places: [
        ...(houses || []).filter((h: any) => h?.id).map((h: any) => shape('production', h)),
        ...(stores || []).filter((s: any) => s?.id).map((s: any) => shape('store', s)),
      ],
    });
  } catch (error) {
    console.log('Error fetching rider places:', error);
    return c.json({ error: 'Failed to fetch places' }, 500);
  }
});

// Pin a production house or store on the map (dispatch roles) - done while standing there.
app.post('/make-server-c2dd9b9d/rider/places', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const actor = await getRiderActor(authResult.user);
    if (!actor.canDispatch) return c.json({ error: 'Not allowed' }, 403);
    const { kind, id, latitude, longitude } = await c.req.json();
    if (kind !== 'production' && kind !== 'store') return c.json({ error: 'Invalid place type' }, 400);
    if (!id || !isValidLatLng(latitude, longitude)) return c.json({ error: 'Invalid location' }, 400);
    const entity = await kv.get(kind === 'production' ? `production_house_${id}` : `store:${id}`);
    if (!entity) return c.json({ error: 'Place not found' }, 404);
    await kv.set(`rider-place:${kind}:${id}`, { kind, id, latitude, longitude, setByName: actor.name, setAt: new Date().toISOString() });
    return c.json({ success: true });
  } catch (error) {
    console.log('Error saving rider place:', error);
    return c.json({ error: 'Failed to save place' }, 500);
  }
});

// ============================================
// PRODUCTION REQUESTS ROUTES
// ============================================

// Fetch production requests whose requestDate >= fromDate (optional upper bound), paginated
// and filtered in Postgres (not pulled into memory and filtered here) so the query stays cheap
// as the table grows. With no fromDate, defaults are applied by the caller.
async function getProductionRequestsFrom(fromDate?: string, toDate?: string): Promise<any[]> {
  const pageSize = 1000;
  let allResults: any[] = [];
  let from = 0;

  while (true) {
    let query = supabase
      .from('kv_store_c2dd9b9d')
      .select('key, value')
      .like('key', 'production_request_%');

    if (fromDate) {
      query = query.gte('value->>requestDate', fromDate);
    }
    if (toDate) {
      query = query.lte('value->>requestDate', toDate);
    }

    const { data, error } = await query.range(from, from + pageSize - 1);
    if (error) {
      throw new Error(error.message);
    }
    if (!data || data.length === 0) break;

    allResults = allResults.concat(data.map((d) => d.value));

    if (data.length < pageSize) break;
    from += pageSize;
  }

  return allResults;
}

// Get production requests, scoped to a date range so the page doesn't load the
// entire history on every visit. Accepts ?from=YYYY-MM-DD&to=YYYY-MM-DD (both optional).
// With no `from`, defaults to the start of last month (covers the current month view
// plus the previous-month comparison used by the stats cards); `to` is left open-ended
// so future/advance requests are never excluded.
app.get('/make-server-c2dd9b9d/production-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const requestedFrom = c.req.query('from');
    const requestedTo = c.req.query('to');

    let fromDate = requestedFrom;
    if (!fromDate) {
      const now = new Date();
      const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      fromDate = lastMonthStart.toISOString().split('T')[0];
    }

    const requests = await getProductionRequestsFrom(fromDate, requestedTo);

    // Sort by request date descending (newest first)
    const sortedRequests = requests.sort((a: any, b: any) => {
      return new Date(b.requestDate).getTime() - new Date(a.requestDate).getTime();
    });

    return c.json({ requests: sortedRequests, from: fromDate, to: requestedTo || null });
  } catch (error: any) {
    console.error('Error fetching production requests:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create a new production request
app.post('/make-server-c2dd9b9d/production-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const body = await c.req.json();
    const id = crypto.randomUUID();
    const now = new Date().toISOString();
    
    // Fetch store name from storeId if not provided
    let storeName = body.storeName;
    if (body.storeId && !storeName) {
      console.log('Fetching store name for storeId:', body.storeId);
      const store = await kv.get(`store:${body.storeId}`);
      if (store) {
        storeName = store.name;
        console.log('Found store:', { id: store.id, name: store.name });
      } else {
        storeName = 'Unknown Store';
        console.log('Store not found for storeId:', body.storeId);
      }
    }
    
    const request = {
      id,
      ...body,
      storeName, // Override with fetched store name
      status: 'pending',
      createdAt: now,
      updatedAt: now,
    };
    
    await kv.set(`production_request_${id}`, request);

    console.log('Production request created:', { id, storeId: request.storeId, storeName: request.storeName, requestedBy: request.requestedBy });

    // Production Heads (Vijay) get pinged immediately once stores are actually open and
    // staffed (9 AM IST onward) so acceptance/preparation starts right away. A request
    // placed overnight/before 9 AM is deliberately NOT pinged here - waking someone up for
    // it achieves nothing before the production house opens - it's picked up by the 9 AM
    // "send-morning-request-reminders" cron instead, alongside anything still pending from
    // this same run of a slower morning. Operations Heads (Aniket) are notified either way,
    // immediately, purely as visibility - they don't act on acceptance themselves.
    const hourNow = getHourIST();
    const placedAtLabel = formatTime12h(getNowIST().substring(11, 16));
    const productionHeads = await getAllProductionHeads();
    const opsManagers = await getOperationsManagers(request.storeId);

    if (hourNow >= 9) {
      console.log('Notifying production heads immediately:', productionHeads.length);
      for (const prodHead of productionHeads) {
        if (prodHead.authUserId) {
          await notifyUser(
            prodHead.authUserId,
            'production_request_new',
            'New Stock Request',
            `${request.storeName} has requested stock for ${new Date(request.requestDate).toLocaleDateString()} (placed ${placedAtLabel}). Please accept and start preparation as soon as possible.`,
            id,
            request.requestDate
          );
        }
      }
    } else {
      console.log('Request placed before 9 AM IST - deferring production head notification to the 9 AM reminder job');
    }

    for (const opsManager of opsManagers) {
      if (opsManager.authUserId) {
        await notifyUser(
          opsManager.authUserId,
          'production_request_new',
          'Stock Request Placed',
          `${request.storeName} placed a stock request for ${new Date(request.requestDate).toLocaleDateString()} at ${placedAtLabel}.`,
          id,
          request.requestDate
        );
      }
    }

    return c.json({ request });
  } catch (error: any) {
    console.error('Error creating production request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Shared by the /status route's 'delivered'/'partially-delivered' case AND the
// quick-action "Delivered" notification button (POST /quick-action below) - both need
// the exact same shipped-quantities-into-store, deducted-from-production-house inventory
// math, and duplicating it invited the two paths to silently drift apart.
async function creditStoreInventoryForDelivery(existingRequest: any, requestId: string) {
  console.log('📦 Updating store inventory for delivered request:', {
    requestId,
    storeId: existingRequest.storeId
  });

  try {
    // Stores live under `store:` (see /stores). This read `store_`, never found the store and
    // returned here, so neither the store credit nor the production-house deduction below ran.
    // An event's request (events.ts) has the event as its "store": the event record gets the
    // credit and the request's own productionHouseId the deduction, exactly as for a store.
    const isEvent = !!existingRequest.eventId;
    const storeKey = isEvent ? `event:${existingRequest.eventId}` : `store:${existingRequest.storeId}`;
    const store = await kv.get(storeKey);

    if (!store) {
      console.warn('⚠️ Store not found for inventory update:', existingRequest.storeId);
      return;
    }

    const currentInventory = store.inventory || {};

    const inventoryItemsData = await kv.getByPrefix('inventory_item_');
    const finishedProducts = inventoryItemsData
      .filter((item: any) => item.category === 'finished_product' && item.isActive)
      .map((item: any) => ({
        key: item.name,
        camelKey: item.name.replace(/_([a-z])/g, (_: string, letter: string) => letter.toUpperCase()),
        displayName: item.displayName
      }));

    finishedProducts.forEach(({ camelKey, key }: any) => {
      const shippedQty = existingRequest.shippedQuantities?.[camelKey]
        ?? existingRequest[camelKey]
        ?? existingRequest[camelKey + 's']
        ?? 0;

      if (shippedQty > 0) {
        currentInventory[camelKey] = (currentInventory[camelKey] || 0) + shippedQty;
        console.log(`  ✅ Added ${shippedQty} ${camelKey} to store inventory (shipped qty)`);
      }
    });

    await kv.set(storeKey, {
      ...store,
      inventory: currentInventory,
      updatedAt: new Date().toISOString()
    });

    console.log('✅ Store inventory updated successfully:', currentInventory);

    const productionHouseId = isEvent ? (existingRequest.productionHouseId || store.productionHouseId) : store.productionHouseId;
    if (productionHouseId) {
      console.log('🏭 Deducting from production house inventory:', productionHouseId);

      const productionHouseKey = `production_house_${productionHouseId}`;
      const productionHouse = await kv.get(productionHouseKey);

      if (productionHouse) {
        const phInventory = productionHouse.inventory || {};

        finishedProducts.forEach(({ camelKey }: any) => {
          const shippedQty = existingRequest.shippedQuantities?.[camelKey]
            ?? existingRequest[camelKey]
            ?? existingRequest[camelKey + 's']
            ?? 0;

          if (shippedQty > 0) {
            phInventory[camelKey] = (phInventory[camelKey] || 0) - shippedQty;
            console.log(`  ⬇️ Deducted ${shippedQty} ${camelKey} from production house inventory (shipped qty)`);
          }
        });

        await kv.set(productionHouseKey, {
          ...productionHouse,
          inventory: phInventory,
          updatedAt: new Date().toISOString()
        });

        console.log('✅ Production house inventory updated:', phInventory);
      } else {
        console.warn('⚠️ Production house not found:', productionHouseId);
      }
    } else {
      console.warn('⚠️ Store has no mapped production house');
    }
  } catch (invError) {
    console.error('❌ Error updating store inventory:', invError);
    // Don't fail the whole request update if inventory update fails
  }
}

// Update production request status
app.put('/make-server-c2dd9b9d/production-requests/:id/status', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const { status, updatedBy } = await c.req.json();
    
    const existingRequest = await kv.get(`production_request_${id}`);
    if (!existingRequest) {
      return c.json({ error: 'Production request not found' }, 404);
    }
    
    // Accept .. ship are production steps: production incharge, operations managers, cluster
    // head. Confirming delivery is also open to the receiving store's own people (the store
    // incharge's "Confirm Delivery" before receive-and-count goes live), and only from shipped.
    // A delivered request can't be moved again - moving it back and confirming again credited
    // the store's stock twice.
    const meta = auth.user.user_metadata || {};
    const isProductionSide = meta.designation === 'production_incharge' || isClusterHeadOrOps(auth.user);
    if (REQUEST_DONE.includes(existingRequest.status)) {
      return c.json({ error: `This delivery is already marked ${existingRequest.status}` }, 409);
    }
    if (status === 'delivered' || status === 'partially-delivered') {
      const isOwnStore = !!existingRequest.storeId && (meta.storeId === existingRequest.storeId || (meta.assignedStoreIds || []).includes(existingRequest.storeId));
      if (!isOwnStore && !isProductionSide) {
        return c.json({ error: 'Only the receiving store or the production side can confirm this delivery' }, 403);
      }
      if (existingRequest.status !== 'shipped' && existingRequest.status !== 'partially-shipped') {
        return c.json({ error: 'This request has not been shipped yet' }, 409);
      }
    } else if (!['accepted', 'in-preparation', 'prepared', 'shipped', 'partially-shipped'].includes(status)) {
      return c.json({ error: `Unknown status: ${status}` }, 400);
    } else if (!isProductionSide) {
      return c.json({ error: 'Only the production incharge, operations managers and the cluster head can update a request' }, 403);
    }

    const now = new Date().toISOString();
    const updates: any = {
      status,
      updatedAt: now,
    };
    
    // Update timestamps based on status
    switch (status) {
      case 'accepted':
        updates.acceptedAt = now;
        updates.acceptedBy = updatedBy;
        break;
      case 'in-preparation':
        // Status set by production head after accepting
        break;
      case 'prepared':
        updates.preparedAt = now;
        break;
      case 'shipped':
        updates.shippedAt = now;
        break;
      case 'delivered':
      case 'partially-delivered':
        updates.deliveredAt = now;
        updates.deliveredBy = updatedBy;
        await creditStoreInventoryForDelivery(existingRequest, id);
        break;
    }
    
    const updatedRequest = {
      ...existingRequest,
      ...updates,
    };
    
    await kv.set(`production_request_${id}`, updatedRequest);
    
    // If a rider delivered this request, confirming it here also confirms that ride's receipt.
    if (status === 'delivered' || status === 'partially-delivered') {
      await confirmRidesForRequest(id, typeof updatedBy === 'string' ? updatedBy : undefined);
    }

    console.log('Production request status updated:', { id, status, updatedBy });
    
    // Send notifications based on status change
    const storeName = updatedRequest.storeName || 'Unknown Store';
    const requestDate = new Date(updatedRequest.requestDate).toLocaleDateString();
    
    // Notify Store In-Charge, Operations Managers, and Cluster Heads about status changes
    const storeIncharge = await getStoreIncharge(updatedRequest.storeId);
    const operationsManagers = await getOperationsManagers(updatedRequest.storeId);
    const clusterHeads = await getAllClusterHeads();
    
    // Combine all stakeholders who should be notified
    const stakeholders = [];
    if (storeIncharge?.authUserId) stakeholders.push({ ...storeIncharge, role: 'Store In-Charge' });
    operationsManagers.forEach(om => {
      if (om.authUserId) stakeholders.push({ ...om, role: 'Operations Manager' });
    });
    clusterHeads.forEach(ch => {
      if (ch.authUserId) stakeholders.push({ ...ch, role: 'Cluster Head' });
    });
    
    // Create status-specific notifications
    let notificationTitle = '';
    let notificationMessage = '';
    
    switch (status) {
      case 'accepted':
        notificationTitle = 'Production Request Accepted';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been accepted and is ready for preparation`;
        break;
      case 'in-preparation':
        notificationTitle = 'Production Started';
        notificationMessage = `Production request from ${storeName} for ${requestDate} is now in preparation`;
        break;
      case 'prepared':
        notificationTitle = 'Production Completed';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been prepared and is ready for shipping`;
        break;
      case 'shipped':
        notificationTitle = 'Production Shipped';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been shipped and is on the way`;
        break;
      case 'partially-shipped':
        notificationTitle = 'Production Partially Shipped';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been partially shipped. Check details for shipped quantities.`;
        break;
      case 'delivered':
        notificationTitle = 'Production Delivered';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been successfully delivered`;
        break;
      case 'partially-delivered':
        notificationTitle = 'Production Partially Delivered';
        notificationMessage = `Production request from ${storeName} for ${requestDate} has been partially delivered`;
        break;
    }
    
    // Send notifications to all stakeholders
    console.log('Sending status update notifications to', stakeholders.length, 'stakeholders');
    for (const stakeholder of stakeholders) {
      await notifyUser(
        stakeholder.authUserId,
        `production_request_${status}`,
        notificationTitle,
        notificationMessage,
        id,
        updatedRequest.requestDate
      );
    }
    
    return c.json({ request: updatedRequest });
  } catch (error: any) {
    console.error('Error updating production request status:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Ship production request with quantities
app.put('/make-server-c2dd9b9d/production-requests/:id/ship', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const { shippedQuantities, shippingNotes, shippedBy, shippedSauces, dispatch } = await c.req.json();

    if (auth.user.user_metadata?.designation !== 'production_incharge' && !isClusterHeadOrOps(auth.user)) {
      return c.json({ error: 'Only the production incharge, operations managers and the cluster head can ship a request' }, 403);
    }

    const existingRequest = await kv.get(`production_request_${id}`);
    if (!existingRequest) {
      return c.json({ error: 'Production request not found' }, 404);
    }
    // Shipping again would set it back to shipped, and the store's confirmation would then
    // credit its stock a second time.
    if (REQUEST_DONE.includes(existingRequest.status)) {
      return c.json({ error: `This delivery is already marked ${existingRequest.status}` }, 409);
    }
    
    const now = new Date().toISOString();
    
    // Determine if this is a partial shipment
    let isPartialShipment = false;

    // Check momos — momo item names are dynamic (configured via "Finished
    // Product" inventory items), not a fixed set, so treat any numeric field
    // on the request that isn't one of the known non-momo fields as a momo
    // quantity to compare, rather than a hardcoded field list (which silently
    // skipped this check entirely whenever item names didn't match exactly).
    const nonMomoFields = new Set([
      'id', 'requestDate', 'storeId', 'storeName', 'requestedBy', 'requestedByName',
      'status', 'kitchenUtilities', 'sauces', 'utilities', 'notes', 'acceptedAt',
      'acceptedBy', 'preparedAt', 'shippedAt', 'shippedQuantities', 'shippedSauces',
      'shippingNotes', 'deliveredAt', 'deliveredBy', 'createdAt', 'updatedAt',
      'dispatch', 'receipt', 'oneHourDeliveryCheckSentAt',
    ]);
    for (const [field, requested] of Object.entries(existingRequest)) {
      if (nonMomoFields.has(field) || typeof requested !== 'number') continue;
      const shipped = shippedQuantities[field] || 0;
      if (requested > 0 && shipped < requested) {
        isPartialShipment = true;
        break;
      }
    }
    
    // Check kitchen utilities
    if (existingRequest.kitchenUtilities && !isPartialShipment) {
      for (const [name, data] of Object.entries(existingRequest.kitchenUtilities as Record<string, any>)) {
        const requested = data.quantity || 0;
        const shipped = shippedQuantities[`kitchenUtility_${name}`] || 0;
        if (requested > 0 && shipped < requested) {
          isPartialShipment = true;
          break;
        }
      }
    }
    
    // Check utilities
    if (existingRequest.utilities && !isPartialShipment) {
      for (const [name, requested] of Object.entries(existingRequest.utilities as Record<string, number>)) {
        const shipped = shippedQuantities[`utility_${name}`] || 0;
        if (requested > 0 && shipped < requested) {
          isPartialShipment = true;
          break;
        }
      }
    }

    // Check sauces (boolean requested/included, not quantity-based)
    if (existingRequest.sauces && !isPartialShipment) {
      for (const name of Object.keys(existingRequest.sauces as Record<string, boolean>)) {
        const wasRequested = existingRequest.sauces[name];
        const wasShipped = shippedSauces ? shippedSauces[name] : true;
        if (wasRequested && !wasShipped) {
          isPartialShipment = true;
          break;
        }
      }
    }

    const updates: any = {
      status: isPartialShipment ? 'partially-shipped' : 'shipped',
      shippedAt: now,
      shippedQuantities,
      shippedSauces: shippedSauces || null,
      shippingNotes,
      updatedAt: now,
    };
    // Bags, batch codes, box/tub numbers and who packed/checked - the app's copy of the
    // dispatch slip (SOP log 1.5, top half). Sent by app 1.15.17+; older apps send none.
    if (dispatch && typeof dispatch === 'object') {
      updates.dispatch = { ...dispatch, packedAt: dispatch.packedAt || now };
    }
    
    const updatedRequest = {
      ...existingRequest,
      ...updates,
    };
    
    await kv.set(`production_request_${id}`, updatedRequest);
    
    const storeName = updatedRequest.storeName || 'Store';
    const requestDate = new Date(updatedRequest.requestDate).toLocaleDateString();
    
    // Notify stakeholders
    const storeIncharge = await getStoreIncharge(updatedRequest.storeId);
    const operationsManagers = await getOperationsManagers(updatedRequest.storeId);
    const clusterHeads = await getAllClusterHeads();
    
    const stakeholders = [];
    if (storeIncharge?.authUserId) stakeholders.push({ ...storeIncharge, role: 'Store In-Charge' });
    operationsManagers.forEach(om => {
      if (om.authUserId) stakeholders.push({ ...om, role: 'Operations Manager' });
    });
    clusterHeads.forEach(ch => {
      if (ch.authUserId) stakeholders.push({ ...ch, role: 'Cluster Head' });
    });
    
    const notificationTitle = isPartialShipment ? 'Production Partially Shipped' : 'Production Shipped';
    const notificationMessage = isPartialShipment 
      ? `Production request from ${storeName} for ${requestDate} has been partially shipped. Check details for shipped quantities.`
      : `Production request from ${storeName} for ${requestDate} has been shipped and is on the way`;
    
    for (const stakeholder of stakeholders) {
      await notifyUser(
        stakeholder.authUserId,
        `production_request_${updates.status}`,
        notificationTitle,
        notificationMessage,
        id,
        updatedRequest.requestDate
      );
    }

    // Any store crew member can receive and count the delivery, so the store's crew hear
    // it's on the way too (the incharge already got the message above) - from Phase 1
    // go-live, when crew receiving starts (PHASE1_GO_LIVE in src/utils/batches.ts).
    if (updates.dispatch && getTodayIST() >= '2026-11-01') {
      const allEmployees = await kv.getByPrefix('unified-employee:');
      const crew = allEmployees.filter((e: any) => e.designation === 'store_ops' && e.storeId === updatedRequest.storeId && e.status !== 'inactive' && e.authUserId);
      for (const member of crew) {
        await notifyUser(
          member.authUserId,
          'delivery_incoming',
          'Momos on the way',
          `${updates.dispatch.boxes || 'The'} box${updates.dispatch.boxes === 1 ? '' : 'es'} left the production house. Count the bags against the slip when they arrive, then press Receive.`,
          id,
          updatedRequest.requestDate
        );
      }
    }

    return c.json({ request: updatedRequest });
  } catch (error: any) {
    console.error('Error shipping production request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Pieces the store didn't get (short count) or couldn't use (crushed, stuck, thawed) are
// booked into that day's stock-wastage entry under SOP reason code Q (rejected at receipt).
// The store is still credited the full shipped quantity (creditStoreInventoryForDelivery and
// every stock report work from shippedQuantities), so this is what brings its stock back
// down to what actually went into the freezer.
async function addReceiptLossToStockWastage(storeId: string, date: string, loss: Record<string, number>, requestId: string, byName: string): Promise<void> {
  try {
    const key = `stock-wastage:${storeId}:${date}`;
    const existing = await kvWithRetry.get<any>(key);
    const wastage: Record<string, number> = { ...(existing?.wastage || {}) };
    const reasons: Record<string, Record<string, number>> = JSON.parse(JSON.stringify(existing?.reasons || {}));
    for (const [itemKey, qty] of Object.entries(loss)) {
      wastage[itemKey] = (wastage[itemKey] || 0) + qty;
      reasons[itemKey] = { ...(reasons[itemKey] || {}), Q: (reasons[itemKey]?.Q || 0) + qty };
    }
    const note = `Receipt #${requestId.slice(0, 8).toUpperCase()}: ${Object.entries(loss).map(([k, n]) => `${k} ${n}`).join(', ')} (Q)`;
    await kvWithRetry.set(key, {
      id: existing?.id || key,
      storeId,
      date,
      wastage,
      reasons,
      notes: existing?.notes ? `${existing.notes}\n${note}` : note,
      submittedBy: existing?.submittedBy || byName,
      submittedByName: existing?.submittedByName || byName,
      createdAt: existing?.createdAt || getNowIST(),
      updatedAt: getNowIST(),
    });
  } catch (error) {
    console.log('Error booking receipt loss into stock wastage:', error);
  }
}

// The store's count of a delivery (SOP log 1.5, bottom half): pieces received and damaged
// per type, which batch the damage came from, sauces missing, boxes, whether the momos
// arrived hard frozen, photos. Replaces the old one-tap "Confirm Delivery" (which still
// works for older app versions) - any store login can do it, crew included.
app.put('/make-server-c2dd9b9d/production-requests/:id/receive', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const { receipt } = await c.req.json();
    if (!receipt || typeof receipt !== 'object' || !receipt.lines || typeof receipt.lines !== 'object') {
      return c.json({ error: 'receipt with lines is required' }, 400);
    }

    const existingRequest = await kv.get(`production_request_${id}`);
    if (!existingRequest) {
      return c.json({ error: 'Production request not found' }, 404);
    }
    if (existingRequest.status !== 'shipped' && existingRequest.status !== 'partially-shipped') {
      return c.json({ error: `This delivery is already marked ${existingRequest.status}` }, 409);
    }

    const now = new Date().toISOString();
    const receivedBy = auth.user.user_metadata?.employeeId || auth.user.email;
    const receivedByName = auth.user.user_metadata?.name || auth.user.email;
    const whole = (v: any) => Math.max(0, Math.round(Number(v) || 0));

    const lines: Record<string, any> = {};
    for (const [itemKey, raw] of Object.entries(receipt.lines as Record<string, any>)) {
      const shipped = whole(existingRequest.shippedQuantities?.[itemKey] ?? raw?.shipped);
      const received = whole(raw?.received);
      const damaged = Math.min(whole(raw?.damaged), received);
      lines[itemKey] = {
        shipped,
        received,
        damaged,
        ...(damaged > 0 && raw?.damageReason ? { damageReason: String(raw.damageReason) } : {}),
        ...(damaged > 0 && raw?.damageBatch ? { damageBatch: String(raw.damageBatch) } : {}),
      };
    }

    const cleanReceipt = {
      lines,
      saucesMissing: Array.isArray(receipt.saucesMissing) ? receipt.saucesMissing.map(String) : [],
      boxesReceived: receipt.boxesReceived != null ? whole(receipt.boxesReceived) : null,
      hardFrozen: receipt.hardFrozen !== false,
      notes: typeof receipt.notes === 'string' ? receipt.notes.trim() : '',
      photoIds: Array.isArray(receipt.photoIds) ? receipt.photoIds.map(String) : [],
      receivedBy,
      receivedByName,
      receivedAt: now,
    };

    const status = existingRequest.status === 'partially-shipped' ? 'partially-delivered' : 'delivered';
    const updatedRequest = {
      ...existingRequest,
      status,
      deliveredAt: now,
      deliveredBy: receivedBy,
      receipt: cleanReceipt,
      updatedAt: now,
    };
    await kv.set(`production_request_${id}`, updatedRequest);
    await creditStoreInventoryForDelivery(existingRequest, id);
    await confirmRidesForRequest(id, typeof receivedBy === 'string' ? receivedBy : undefined);

    const loss: Record<string, number> = {};
    const problems: string[] = [];
    for (const [itemKey, line] of Object.entries(lines)) {
      const missing = Math.max(0, line.shipped - line.received);
      const extra = Math.max(0, line.received - line.shipped);
      if (missing + line.damaged > 0) loss[itemKey] = missing + line.damaged;
      if (missing > 0) problems.push(`${itemKey} ${missing} short`);
      if (extra > 0) problems.push(`${itemKey} ${extra} extra`);
      if (line.damaged > 0) problems.push(`${itemKey} ${line.damaged} ${line.damageReason || 'damaged'}${line.damageBatch ? ` (${line.damageBatch})` : ''}`);
    }
    if (cleanReceipt.saucesMissing.length > 0) problems.push(`missing: ${cleanReceipt.saucesMissing.join(', ')}`);
    if (!cleanReceipt.hardFrozen) problems.push('momos arrived soft');
    // An event's receipt (events.ts) keeps its loss on the request itself (receipt lines); a
    // stock-wastage row would be keyed by the event id as if it were a store.
    if (Object.keys(loss).length > 0 && !existingRequest.eventId) {
      await addReceiptLossToStockWastage(existingRequest.storeId, getTodayIST(), loss, id, receivedByName);
    }

    const storeName = updatedRequest.storeName || 'Store';
    const requestDate = new Date(updatedRequest.requestDate).toLocaleDateString();
    const storeIncharge = await getStoreIncharge(updatedRequest.storeId);
    const operationsManagers = await getOperationsManagers(updatedRequest.storeId);
    const clusterHeads = await getAllClusterHeads();
    const recipients = new Map<string, any>();
    for (const person of [storeIncharge, ...operationsManagers, ...clusterHeads]) {
      if (person?.authUserId) recipients.set(person.authUserId, person);
    }
    // Production hears about it only when something didn't match - that's their batch.
    if (problems.length > 0) {
      const allEmployees = await kv.getByPrefix('unified-employee:');
      for (const person of allEmployees.filter((e: any) => e.designation === 'production_incharge' && e.authUserId)) {
        recipients.set(person.authUserId, person);
      }
    }
    const title = problems.length > 0 ? 'Delivery received with differences' : 'Delivery received, all correct';
    const message = problems.length > 0
      ? `${storeName} (${requestDate}), counted by ${receivedByName}: ${problems.join('; ')}.`
      : `${storeName} (${requestDate}): ${receivedByName} counted the delivery and everything matched.`;
    for (const recipient of recipients.values()) {
      await notifyUser(recipient.authUserId, problems.length > 0 ? 'delivery_variance' : `production_request_${status}`, title, message, id, updatedRequest.requestDate);
    }

    return c.json({ request: updatedRequest });
  } catch (error: any) {
    console.error('Error receiving production request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Delivery damage photos, stored one per key (not inside the request, which every stock
// screen loads in bulk). Compressed on the phone first - a ~1000px JPEG.
// Confirm a delivery that was marked received for the store (owner, 29 Oct 2026: two part-sent
// orders were never received in the app, so the owner marked them received to put the store's stock
// right and asked the store incharge to confirm what actually came). Not right: the owner and the
// operations managers hear what was missing.
app.post('/make-server-c2dd9b9d/production-requests/:id/confirm-receipt', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) return c.json({ error: authResult.error }, authResult.status);
  try {
    const id = c.req.param('id');
    const key = `production_request_${id}`;
    const req = await kv.get(key);
    if (!req) return c.json({ error: 'That request was not found' }, 404);
    if (!req.receiptConfirm?.pending) return c.json({ error: 'This delivery is already confirmed' }, 409);
    const m = authResult.user.user_metadata || {};
    const isLead = m.role === 'cluster_head' || (m.role === 'manager' && m.designation !== 'store_incharge' && m.designation !== 'production_incharge');
    const incharge = req.storeId ? await getStoreIncharge(req.storeId) : null;
    const isIncharge = !!incharge && !!m.employeeId && String(incharge.employeeId) === String(m.employeeId);
    if (!isLead && !isIncharge) return c.json({ error: 'Only the store incharge can confirm this delivery' }, 403);
    const body = await c.req.json().catch(() => ({}));
    const ok = body?.ok !== false;
    const note = typeof body?.note === 'string' ? body.note.trim().slice(0, 300) : '';
    if (!ok && !note) return c.json({ error: 'Write what was missing or different' }, 400);
    const name = m.name || authResult.user.email || 'Someone';
    const now = new Date().toISOString();
    const updated = { ...req, receiptConfirm: { ...req.receiptConfirm, pending: false, ok, ...(note ? { note } : {}), by: name, at: now }, updatedAt: now };
    await kv.set(key, updated);
    if (!ok) {
      const told = new Set<string>();
      for (const p of [...(await getAllClusterHeads()), ...(await getOperationsManagers())]) {
        if (!p?.authUserId || told.has(p.authUserId)) continue;
        told.add(p.authUserId);
        await notifyUser(p.authUserId, 'delivery_variance', `Delivery not right: ${req.requestDate} order`, `${name}: ${note}`, id, req.requestDate).catch(() => undefined);
      }
    }
    return c.json({ request: updated });
  } catch (error) {
    console.log('Error confirming a delivery:', error);
    return c.json({ error: 'Could not save that - try again' }, 500);
  }
});

app.post('/make-server-c2dd9b9d/production-requests/:id/receipt-photos', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  try {
    const requestId = c.req.param('id');
    const { dataUrl } = await c.req.json();
    if (typeof dataUrl !== 'string' || !dataUrl.startsWith('data:image/')) {
      return c.json({ error: 'dataUrl must be an image data URL' }, 400);
    }
    if (dataUrl.length > 900_000) {
      return c.json({ error: 'Photo is too large - please retake it' }, 413);
    }
    const photoId = crypto.randomUUID();
    await kv.set(`delivery-photo:${requestId}:${photoId}`, {
      id: photoId,
      requestId,
      dataUrl,
      uploadedBy: auth.user.user_metadata?.name || auth.user.email,
      uploadedAt: new Date().toISOString(),
    });
    return c.json({ photoId });
  } catch (error: any) {
    console.error('Error saving receipt photo:', error);
    return c.json({ error: 'Failed to save photo' }, 500);
  }
});

app.get('/make-server-c2dd9b9d/production-requests/:id/receipt-photos', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  try {
    const requestId = c.req.param('id');
    const photos = await kv.getByPrefix(`delivery-photo:${requestId}:`);
    return c.json({ photos: (photos || []).map((p: any) => ({ id: p.id, dataUrl: p.dataUrl, uploadedBy: p.uploadedBy, uploadedAt: p.uploadedAt })) });
  } catch (error: any) {
    console.error('Error loading receipt photos:', error);
    return c.json({ error: 'Failed to load photos' }, 500);
  }
});

// Check for pending production requests > 12 hours and send notifications
app.post('/make-server-c2dd9b9d/production-requests/check-pending', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const allRequests = await kv.getByPrefix('production_request:');
    const now = new Date();
    const twelveHoursAgo = new Date(now.getTime() - 12 * 60 * 60 * 1000);
    
    console.log('🕐 Checking for pending requests > 12 hours. Current time:', now.toISOString());
    
    // Filter pending requests older than 12 hours
    const oldPendingRequests = allRequests.filter((req: any) => {
      if (req.status !== 'pending') return false;
      
      const requestDate = new Date(req.requestDate || req.createdAt);
      const isPastThreshold = requestDate < twelveHoursAgo;
      
      if (isPastThreshold) {
        console.log(`⏰ Found old pending request: ${req.id.slice(0, 8)}, created: ${requestDate.toISOString()}`);
      }
      
      return isPastThreshold;
    });
    
    if (oldPendingRequests.length === 0) {
      console.log('✅ No pending requests > 12 hours');
      return c.json({ 
        checked: true, 
        oldPendingCount: 0,
        notificationsSent: 0
      });
    }
    
    console.log(`🚨 Found ${oldPendingRequests.length} pending requests > 12 hours`);
    
    // Get all notified request IDs to avoid duplicates
    const notifiedRequests = await kv.getByPrefix('notified_pending_request:');
    const notifiedRequestIds = new Set(notifiedRequests.map((n: any) => n.requestId));
    
    // Get recipients: Cluster Heads, Production Incharge, Operations Manager
    const clusterHeads = await getAllClusterHeads();
    const productionHeads = await getAllProductionHeads();
    const operationsManagers = await getOperationsManagers();
    
    const recipients = [
      ...clusterHeads,
      ...productionHeads,
      ...operationsManagers.filter(m => m.designation === 'operations_incharge')
    ];
    
    console.log(`👥 Found ${recipients.length} recipients for notifications`);
    
    let notificationsSent = 0;
    
    for (const request of oldPendingRequests) {
      // Skip if already notified
      if (notifiedRequestIds.has(request.id)) {
        console.log(`⏭️ Skipping already notified request: ${request.id.slice(0, 8)}`);
        continue;
      }
      
      const requestAge = Math.floor((now.getTime() - new Date(request.requestDate || request.createdAt).getTime()) / (1000 * 60 * 60));
      
      // Send notifications to all recipients
      for (const recipient of recipients) {
        if (recipient.authUserId) {
          await notifyUser(
            recipient.authUserId,
            'stock_request_delayed',
            '⏰ Stock Request Delayed',
            `Stock request from ${request.storeName || 'Unknown Store'} has been pending for ${requestAge}+ hours. Please take action.`,
            request.id,
            request.requestDate
          );
          notificationsSent++;
        }
      }
      
      // Mark this request as notified
      await kv.set(`notified_pending_request:${request.id}`, {
        requestId: request.id,
        notifiedAt: now.toISOString(),
        requestDate: request.requestDate || request.createdAt
      });
      
      console.log(`📬 Sent ${recipients.filter(r => r.authUserId).length} notifications for request: ${request.id.slice(0, 8)}`);
    }
    
    console.log(`✅ Check complete. Sent ${notificationsSent} notifications for ${oldPendingRequests.length - notifiedRequestIds.size} requests`);
    
    return c.json({ 
      checked: true, 
      oldPendingCount: oldPendingRequests.length,
      newPendingCount: oldPendingRequests.length - notifiedRequestIds.size,
      notificationsSent
    });
  } catch (error: any) {
    console.error('Error checking pending requests:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// SALES DATA ENDPOINTS (XLSX Upload)
// ============================================

// Get all sales data records
app.get('/make-server-c2dd9b9d/sales-data', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    const records = await getAllByPrefixWithRetry('sales_data_', windowed.range);

    console.log('Retrieved sales data records:', records.length);
    
    return c.json({ data: records });
  } catch (error: any) {
    console.error('Error fetching sales data:', error);
    return c.json({ error: error.message || 'Failed to fetch sales data' }, 500);
  }
});

// Create/save new sales data record
app.post('/make-server-c2dd9b9d/sales-data', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const record = await c.req.json();
    
    // Validate required fields
    if (!record.id || !record.date || !record.storeId || !record.data) {
      return c.json({ error: 'Missing required fields' }, 400);
    }
    
    // Save the record
    await kv.set(`sales_data_${record.id}`, record);
    
    console.log('Sales data record saved:', { id: record.id, date: record.date, storeId: record.storeId });
    
    return c.json({ record });
  } catch (error: any) {
    console.error('Error saving sales data:', error);
    return c.json({ error: error.message || 'Failed to save sales data' }, 500);
  }
});

// Delete a sales data record
app.delete('/make-server-c2dd9b9d/sales-data/:id', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    
    const existingRecord = await kv.get(`sales_data_${id}`);
    if (!existingRecord) {
      return c.json({ error: 'Sales data record not found' }, 404);
    }
    
    await kv.del(`sales_data_${id}`);
    
    console.log('Sales data record deleted:', id);
    
    return c.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting sales data:', error);
    return c.json({ error: error.message || 'Failed to delete sales data' }, 500);
  }
});

// ============================================
// MIGRATION ENDPOINT - Production House System
// ============================================

// One-time migration to set up production house system
app.post('/make-server-c2dd9b9d/migrate-production-house-system', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  // Only cluster heads can run migrations
  const userRole = auth.user.user_metadata?.role;
  if (userRole !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can run migrations' }, 403);
  }

  try {
    console.log('🚀 Starting Production House System Migration...');
    
    // Step 1: Check if production house already exists
    const existingHouses = await kv.getByPrefix('production_house_');
    if (existingHouses.length > 0) {
      console.log('ℹ️  Production houses already exist. Skipping creation.');
    } else {
      // Create default production house
      const defaultHouseId = crypto.randomUUID();
      const defaultHouse = {
        id: defaultHouseId,
        name: 'Main Production House',
        location: 'Sector 21, Dwarka',
        productionHeadId: null,
        inventory: {
          chicken: 0,
          chickenCheese: 0,
          veg: 0,
          cheeseCorn: 0,
          paneer: 0,
          vegKurkure: 0,
          chickenKurkure: 0,
        },
        createdBy: auth.user.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      await kv.set(`production_house_${defaultHouseId}`, defaultHouse);
      console.log('✅ Created default production house:', defaultHouseId);

      // Step 2: Map all existing stores to this production house - stores are stored
      // under the `store:` prefix (see /stores), not `store_`.
      const stores = await kv.getByPrefix('store:');
      let mappedStores = 0;

      for (const store of stores) {
        const updated = {
          ...store,
          productionHouseId: defaultHouseId,
          updatedAt: new Date().toISOString(),
        };
        await kv.set(`store:${store.id}`, updated);
        mappedStores++;
      }
      console.log(`✅ Mapped ${mappedStores} stores to production house`);

      // Step 3: Find all production heads and assign to production house
      const employees = await kv.getByPrefix('employee_');
      const productionHeads = employees.filter(e => e.designation === 'production_incharge');
      
      if (productionHeads.length > 0) {
        // Assign first production head to the house
        const firstHead = productionHeads[0];
        defaultHouse.productionHeadId = firstHead.employeeId;
        await kv.set(`production_house_${defaultHouseId}`, defaultHouse);
        console.log(`✅ Assigned production head: ${firstHead.name} (${firstHead.employeeId})`);
      }

      // Step 4: Migrate ProductionData from storeId to productionHouseId
      const productionRecords = await kv.getByPrefix('production_');
      let migratedRecords = 0;

      for (const record of productionRecords) {
        if (record.storeId && !record.productionHouseId) {
          const updated = {
            ...record,
            productionHouseId: defaultHouseId,
            // Keep storeId for now for backward compatibility
          };
          await kv.set(`production_${record.id}`, updated);
          migratedRecords++;
        }
      }
      console.log(`✅ Migrated ${migratedRecords} production records`);

      // Step 5: Calculate initial inventory from last 7 days of production
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const cutoffDate = sevenDaysAgo.toISOString().split('T')[0];

      const recentProduction = productionRecords.filter(p => 
        p.date >= cutoffDate && p.approvalStatus === 'approved'
      );

      const totalProduction = recentProduction.reduce((acc, prod) => ({
        chicken: acc.chicken + (prod.chickenMomos?.final || 0),
        chickenCheese: acc.chickenCheese + (prod.chickenCheeseMomos?.final || 0),
        veg: acc.veg + (prod.vegMomos?.final || 0),
        cheeseCorn: acc.cheeseCorn + (prod.cheeseCornMomos?.final || 0),
        paneer: acc.paneer + (prod.paneerMomos?.final || 0),
        vegKurkure: acc.vegKurkure + (prod.vegKurkureMomos?.final || 0),
        chickenKurkure: acc.chickenKurkure + (prod.chickenKurkureMomos?.final || 0),
      }), {
        chicken: 0, chickenCheese: 0, veg: 0, cheeseCorn: 0, 
        paneer: 0, vegKurkure: 0, chickenKurkure: 0
      });

      // Update inventory
      defaultHouse.inventory = totalProduction;
      await kv.set(`production_house_${defaultHouseId}`, defaultHouse);
      
      const totalInventory = Object.values(totalProduction).reduce((sum, val) => sum + val, 0);
      console.log(`✅ Initialized inventory with ${totalInventory} total momos from last 7 days`);
    }

    return c.json({
      success: true,
      message: 'Production house system migration completed successfully!',
      details: {
        productionHousesCreated: existingHouses.length === 0 ? 1 : 0,
        alreadyExisted: existingHouses.length > 0,
      }
    });

  } catch (error: any) {
    console.error('❌ Migration error:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// PRODUCTION HOUSE ENDPOINTS
// ============================================

// Get all production houses
app.get('/make-server-c2dd9b9d/production-houses', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const houses = await kv.getByPrefix('production_house_');
    console.log('Retrieved production houses:', houses.length);
    return c.json({ productionHouses: houses });
  } catch (error: any) {
    console.error('Error fetching production houses:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create a new production house
app.post('/make-server-c2dd9b9d/production-houses', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  // Production house set-up, stock and records: the cluster head and operations managers only
  // (any signed-in user could change them).
  if (!isClusterHeadOrOps(auth.user)) {
    return c.json({ error: 'Only the cluster head and operations managers can change production houses' }, 403);
  }

  try {
    const body = await c.req.json();
    const { name, location, productionHeadId, inventory, createdBy } = body;

    if (!name || !location) {
      return c.json({ error: 'Name and location are required' }, 400);
    }

    const id = crypto.randomUUID();
    const productionHouse = {
      id,
      name,
      location,
      productionHeadId: productionHeadId || null,
      inventory: inventory || {
        chicken: 0,
        chickenCheese: 0,
        veg: 0,
        cheeseCorn: 0,
        paneer: 0,
        vegKurkure: 0,
        chickenKurkure: 0,
      },
      createdBy: createdBy || auth.user.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`production_house_${id}`, productionHouse);
    console.log('Production house created:', { id, name, location });

    return c.json({ productionHouse });
  } catch (error: any) {
    console.error('Error creating production house:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update production house
app.put('/make-server-c2dd9b9d/production-houses/:id', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  // Production house set-up, stock and records: the cluster head and operations managers only
  // (any signed-in user could change them).
  if (!isClusterHeadOrOps(auth.user)) {
    return c.json({ error: 'Only the cluster head and operations managers can change production houses' }, 403);
  }

  try {
    const id = c.req.param('id');
    const updates = await c.req.json();

    const existing = await kv.get(`production_house_${id}`);
    if (!existing) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    const updated = {
      ...existing,
      ...updates,
      id, // Ensure ID doesn't change
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`production_house_${id}`, updated);
    console.log('Production house updated:', id);

    return c.json({ productionHouse: updated });
  } catch (error: any) {
    console.error('Error updating production house:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update production house inventory
app.put('/make-server-c2dd9b9d/production-houses/:id/inventory', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  // Production house set-up, stock and records: the cluster head and operations managers only
  // (any signed-in user could change them).
  if (!isClusterHeadOrOps(auth.user)) {
    return c.json({ error: 'Only the cluster head and operations managers can change production houses' }, 403);
  }

  try {
    const id = c.req.param('id');
    const { inventory } = await c.req.json();

    if (!inventory) {
      return c.json({ error: 'Inventory data required' }, 400);
    }

    const existing = await kv.get(`production_house_${id}`);
    if (!existing) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    const updated = {
      ...existing,
      inventory,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`production_house_${id}`, updated);
    console.log('Production house inventory updated:', id);

    return c.json({ productionHouse: updated });
  } catch (error: any) {
    console.error('Error updating production house inventory:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Assign production head to production house
app.put('/make-server-c2dd9b9d/production-houses/:id/assign-head', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  // Production house set-up, stock and records: the cluster head and operations managers only
  // (any signed-in user could change them).
  if (!isClusterHeadOrOps(auth.user)) {
    return c.json({ error: 'Only the cluster head and operations managers can change production houses' }, 403);
  }

  try {
    const id = c.req.param('id');
    const { productionHeadId } = await c.req.json();

    const existing = await kv.get(`production_house_${id}`);
    if (!existing) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    // Update production house
    const updated = {
      ...existing,
      productionHeadId,
      updatedAt: new Date().toISOString(),
    };

    await kv.set(`production_house_${id}`, updated);
    console.log('Production head assigned to production house:', { houseId: id, headId: productionHeadId });

    // IMPORTANT: Also update the employee's storeId to point to this production house
    // This ensures that when the production head creates production records, they use the correct production house ID
    if (productionHeadId) {
      const employee = await kv.get(`employee_${productionHeadId}`);
      if (employee) {
        const updatedEmployee = {
          ...employee,
          storeId: id, // Set employee's storeId to the production house ID
          updatedAt: new Date().toISOString(),
        };
        await kv.set(`employee_${productionHeadId}`, updatedEmployee);
        console.log('✅ Updated employee storeId to production house ID:', { employeeId: productionHeadId, productionHouseId: id });
      } else {
        console.warn('⚠️  Employee not found:', productionHeadId);
      }
    }

    return c.json({ productionHouse: updated });
  } catch (error: any) {
    console.error('Error assigning production head:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Fix production records for a production house (update old records that have wrong storeId/productionHouseId)
app.post('/make-server-c2dd9b9d/production-houses/:id/fix-records', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  // Production house set-up, stock and records: the cluster head and operations managers only
  // (any signed-in user could change them).
  if (!isClusterHeadOrOps(auth.user)) {
    return c.json({ error: 'Only the cluster head and operations managers can change production houses' }, 403);
  }

  try {
    const productionHouseId = c.req.param('id');
    const { oldStoreId } = await c.req.json(); // The old storeId that was incorrectly used

    if (!oldStoreId) {
      return c.json({ error: 'oldStoreId is required' }, 400);
    }

    const productionHouse = await kv.get(`production_house_${productionHouseId}`);
    if (!productionHouse) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    // Find all production records with the old storeId
    const allProduction = await kv.getByPrefix('production:');
    let updatedCount = 0;

    for (const record of allProduction) {
      // Update records that match the old storeId
      if (record.storeId === oldStoreId || record.productionHouseId === oldStoreId) {
        const updated = {
          ...record,
          productionHouseId: productionHouseId, // Set correct production house ID
          storeId: record.storeId, // Keep original storeId for backward compatibility
        };
        // Use the correct key format: production:userId:recordId
        const key = `production:${record.userId}:${record.id}`;
        await kv.set(key, updated);
        updatedCount++;
        console.log('✅ Fixed production record:', { recordId: record.id, date: record.date, oldId: oldStoreId, newId: productionHouseId });
      }
    }

    return c.json({ 
      success: true, 
      updatedCount,
      message: `Fixed ${updatedCount} production records`
    });
  } catch (error: any) {
    console.error('Error fixing production records:', error);
    return c.json({ error: error.message }, 500);
  }
});

// NOTE: there used to be a second, duplicate "assign store to production house" handler
// here, registered under this exact same PUT path. Hono routes to whichever handler was
// registered first (see the one above, ~6327), so this second one was dead code - it
// never actually ran. It also read/wrote the store record under a `store_` key instead
// of the real `store:` key every other store route uses, so if it HAD been reachable it
// would have silently failed to find the store. Removed rather than fixed, since the
// working handler above already covers this route.

// Delete production house
app.delete('/make-server-c2dd9b9d/production-houses/:id', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  // Production house set-up, stock and records: the cluster head and operations managers only
  // (any signed-in user could change them).
  if (!isClusterHeadOrOps(auth.user)) {
    return c.json({ error: 'Only the cluster head and operations managers can change production houses' }, 403);
  }

  try {
    const id = c.req.param('id');

    // Check if production house exists
    const existing = await kv.get(`production_house_${id}`);
    if (!existing) {
      return c.json({ error: 'Production house not found' }, 404);
    }

    // Check if any stores are mapped to this production house - stores are actually
    // stored under the `store:` prefix (see /stores and store creation below); this was
    // reading `store_` instead, which never matches anything, so this guard silently
    // never blocked deletion of a production house with real mapped stores.
    const allStores = await kv.getByPrefix('store:');
    const mappedStores = allStores.filter((store: any) => store.productionHouseId === id);
    
    if (mappedStores.length > 0) {
      return c.json({ 
        error: `Cannot delete production house. ${mappedStores.length} store(s) are currently mapped to it. Please unmap stores first.` 
      }, 400);
    }

    // Delete the production house
    await kv.del(`production_house_${id}`);
    console.log('Production house deleted:', id);

    return c.json({ success: true, message: 'Production house deleted successfully' });
  } catch (error: any) {
    console.error('Error deleting production house:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Transfer inventory between production houses
app.post('/make-server-c2dd9b9d/production-houses/transfer-inventory', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  // Production house set-up, stock and records: the cluster head and operations managers only
  // (any signed-in user could change them).
  if (!isClusterHeadOrOps(auth.user)) {
    return c.json({ error: 'Only the cluster head and operations managers can change production houses' }, 403);
  }

  try {
    const { fromHouseId, toHouseId, quantities } = await c.req.json();

    if (!fromHouseId || !toHouseId) {
      return c.json({ error: 'Both fromHouseId and toHouseId are required' }, 400);
    }

    if (fromHouseId === toHouseId) {
      return c.json({ error: 'Cannot transfer to the same production house' }, 400);
    }

    // Get both production houses
    const fromHouse = await kv.get(`production_house_${fromHouseId}`);
    const toHouse = await kv.get(`production_house_${toHouseId}`);

    if (!fromHouse) {
      return c.json({ error: `Source production house not found: ${fromHouseId}` }, 404);
    }

    if (!toHouse) {
      return c.json({ error: `Destination production house not found: ${toHouseId}` }, 404);
    }

    // If quantities not provided, transfer all
    const transferQuantities = quantities || {
      chicken: fromHouse.inventory?.chicken || 0,
      chickenCheese: fromHouse.inventory?.chickenCheese || 0,
      veg: fromHouse.inventory?.veg || 0,
      cheeseCorn: fromHouse.inventory?.cheeseCorn || 0,
      paneer: fromHouse.inventory?.paneer || 0,
      vegKurkure: fromHouse.inventory?.vegKurkure || 0,
      chickenKurkure: fromHouse.inventory?.chickenKurkure || 0,
    };

    // Validate quantities don't exceed available stock
    const momoTypes = ['chicken', 'chickenCheese', 'veg', 'cheeseCorn', 'paneer', 'vegKurkure', 'chickenKurkure'];
    for (const type of momoTypes) {
      const transferQty = transferQuantities[type] || 0;
      const availableQty = fromHouse.inventory?.[type] || 0;
      
      if (transferQty < 0) {
        return c.json({ error: `Invalid quantity for ${type}: cannot be negative` }, 400);
      }
      
      if (transferQty > availableQty) {
        return c.json({ 
          error: `Insufficient stock for ${type}: requested ${transferQty}, available ${availableQty}` 
        }, 400);
      }
    }

    // Transfer inventory from source to destination
    const updatedToHouse = {
      ...toHouse,
      inventory: {
        chicken: (toHouse.inventory?.chicken || 0) + (transferQuantities.chicken || 0),
        chickenCheese: (toHouse.inventory?.chickenCheese || 0) + (transferQuantities.chickenCheese || 0),
        veg: (toHouse.inventory?.veg || 0) + (transferQuantities.veg || 0),
        cheeseCorn: (toHouse.inventory?.cheeseCorn || 0) + (transferQuantities.cheeseCorn || 0),
        paneer: (toHouse.inventory?.paneer || 0) + (transferQuantities.paneer || 0),
        vegKurkure: (toHouse.inventory?.vegKurkure || 0) + (transferQuantities.vegKurkure || 0),
        chickenKurkure: (toHouse.inventory?.chickenKurkure || 0) + (transferQuantities.chickenKurkure || 0),
      },
      updatedAt: new Date().toISOString(),
    };

    // Deduct transferred quantities from source
    const updatedFromHouse = {
      ...fromHouse,
      inventory: {
        chicken: (fromHouse.inventory?.chicken || 0) - (transferQuantities.chicken || 0),
        chickenCheese: (fromHouse.inventory?.chickenCheese || 0) - (transferQuantities.chickenCheese || 0),
        veg: (fromHouse.inventory?.veg || 0) - (transferQuantities.veg || 0),
        cheeseCorn: (fromHouse.inventory?.cheeseCorn || 0) - (transferQuantities.cheeseCorn || 0),
        paneer: (fromHouse.inventory?.paneer || 0) - (transferQuantities.paneer || 0),
        vegKurkure: (fromHouse.inventory?.vegKurkure || 0) - (transferQuantities.vegKurkure || 0),
        chickenKurkure: (fromHouse.inventory?.chickenKurkure || 0) - (transferQuantities.chickenKurkure || 0),
      },
      updatedAt: new Date().toISOString(),
    };

    // Save both updates
    await kv.set(`production_house_${toHouseId}`, updatedToHouse);
    await kv.set(`production_house_${fromHouseId}`, updatedFromHouse);

    console.log('Inventory transferred:', { 
      from: fromHouse.name, 
      to: toHouse.name,
      quantities: transferQuantities 
    });

    return c.json({ 
      success: true, 
      message: 'Inventory transferred successfully',
      fromHouse: updatedFromHouse,
      toHouse: updatedToHouse
    });
  } catch (error: any) {
    console.error('Error transferring inventory:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK REQUEST ENDPOINTS
// ============================================

// Get all stock requests
app.get('/make-server-c2dd9b9d/stock-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  const windowed = requestedDateRange(c, 'requestDate');
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    console.log('🔍 SERVER: Fetching stock requests with prefix stock_request_');
    const requests = await getAllByPrefixWithRetry('stock_request_', windowed.range);
    console.log('📦 Server: Retrieved stock requests:', requests.length);
    // (A debugging scan of every stock_* key used to run here on each call, after the list
    // was already read - a second database round trip on every app start. Removed.)

    return c.json({ stockRequests: requests });
  } catch (error: any) {
    console.error('Error fetching stock requests:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Create a new stock request
app.post('/make-server-c2dd9b9d/stock-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const body = await c.req.json();
    const { 
      storeId, 
      storeName,
      productionHouseId, 
      productionHouseName,
      requestedBy, 
      requestedByName,
      requestDate,
      requestedQuantities 
    } = body;

    if (!storeId || !productionHouseId || !requestedBy || !requestDate || !requestedQuantities) {
      return c.json({ error: 'Missing required fields' }, 400);
    }

    // Generate ID with timestamp prefix for tracking when request was created (consistent with other data types)
    const id = `${Date.now()}-${crypto.randomUUID()}`;
    const stockRequest = {
      id,
      storeId,
      storeName: storeName || '',
      productionHouseId,
      productionHouseName: productionHouseName || '',
      requestedBy,
      requestedByName: requestedByName || '',
      requestDate,
      requestedQuantities,
      fulfilledQuantities: null,
      status: 'pending',
      fulfilledBy: null,
      fulfilledByName: null,
      fulfillmentDate: null,
      notes: null,
    };

    await kv.set(`stock_request_${id}`, stockRequest);
    console.log('Stock request created:', { id, storeId, productionHouseId });

    // Send notification to production heads of the target production house
    const productionHeads = await getAllProductionHeads();
    console.log('All production heads:', productionHeads.length);
    
    // Filter production heads for this specific production house
    const relevantProductionHeads = productionHeads.filter((ph: any) => 
      ph.productionHouseId === productionHouseId
    );
    
    console.log('Notifying production heads for production house', productionHouseId, ':', relevantProductionHeads.length);
    
    for (const prodHead of relevantProductionHeads) {
      if (prodHead.authUserId) {
        await notifyUser(
          prodHead.authUserId,
          'stock_request_new',
          'New Stock Request',
          `${storeName} has requested stock from ${productionHouseName} for ${new Date(requestDate).toLocaleDateString()}`,
          id,
          requestDate,
          { recordType: 'stock_request', recordId: id }
        );
        console.log('Notified production head:', prodHead.name, prodHead.authUserId);
      }
    }
    
    // If no production heads found for specific house, notify all production heads
    if (relevantProductionHeads.length === 0) {
      console.log('No production heads found for house', productionHouseId, ', notifying all production heads');
      for (const prodHead of productionHeads) {
        if (prodHead.authUserId) {
          await notifyUser(
            prodHead.authUserId,
            'stock_request_new',
            'New Stock Request',
            `${storeName} has requested stock from ${productionHouseName} for ${new Date(requestDate).toLocaleDateString()}`,
            id,
            requestDate,
            { recordType: 'stock_request', recordId: id }
          );
          console.log('Notified production head (fallback):', prodHead.name, prodHead.authUserId);
        }
      }
    }

    return c.json({ stockRequest });
  } catch (error: any) {
    console.error('Error creating stock request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Fulfill stock request
app.put('/make-server-c2dd9b9d/stock-requests/:id/fulfill', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');
    const { fulfilledQuantities, fulfilledBy, fulfilledByName, notes } = await c.req.json();

    const existing = await kv.get(`stock_request_${id}`);
    if (!existing) {
      return c.json({ error: 'Stock request not found' }, 404);
    }

    if (existing.status !== 'pending') {
      return c.json({ error: 'Stock request already processed' }, 400);
    }

    // Determine status based on fulfillment
    let status = 'fulfilled';
    const requested = existing.requestedQuantities;
    const fulfilled = fulfilledQuantities;
    
    const isPartial = Object.keys(requested).some(key => 
      fulfilled[key] < requested[key] && fulfilled[key] > 0
    );
    
    if (isPartial) {
      status = 'partially_fulfilled';
    }

    const updated = {
      ...existing,
      fulfilledQuantities,
      fulfilledBy,
      fulfilledByName: fulfilledByName || '',
      fulfillmentDate: new Date().toISOString(),
      notes: notes || null,
      status,
    };

    await kv.set(`stock_request_${id}`, updated);

    // Update production house inventory (decrease)
    const house = await kv.get(`production_house_${existing.productionHouseId}`);
    if (house) {
      const newInventory = { ...house.inventory };
      Object.keys(fulfilledQuantities).forEach(key => {
        newInventory[key] = Math.max(0, (newInventory[key] || 0) - fulfilledQuantities[key]);
      });

      await kv.set(`production_house_${existing.productionHouseId}`, {
        ...house,
        inventory: newInventory,
        updatedAt: new Date().toISOString(),
      });

      console.log('Production house inventory updated after fulfillment:', existing.productionHouseId);
    }

    console.log('Stock request fulfilled:', { id, status });

    return c.json({ stockRequest: updated });
  } catch (error: any) {
    console.error('Error fulfilling stock request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Cancel stock request
app.put('/make-server-c2dd9b9d/stock-requests/:id/cancel', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const id = c.req.param('id');

    const existing = await kv.get(`stock_request_${id}`);
    if (!existing) {
      return c.json({ error: 'Stock request not found' }, 404);
    }

    if (existing.status !== 'pending') {
      return c.json({ error: 'Can only cancel pending requests' }, 400);
    }

    const updated = {
      ...existing,
      status: 'cancelled',
    };

    await kv.set(`stock_request_${id}`, updated);
    console.log('Stock request cancelled:', id);

    return c.json({ stockRequest: updated });
  } catch (error: any) {
    console.error('Error cancelling stock request:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Fix old stock request data - ensure all requests have proper productionHouseId from store mapping
app.post('/make-server-c2dd9b9d/fix-stock-requests', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    console.log('🔧 Starting stock request data fix...');
    
    // Get all stock requests
    const allRequests = await getAllByPrefixWithRetry('stock_request_');
    console.log(`Found ${allRequests.length} stock requests to check`);
    
    // Get all stores to map storeId -> productionHouseId (stores live under `store:`)
    const allStores = await kv.getByPrefix('store:');
    const storeMap = new Map();
    allStores.forEach((store: any) => {
      storeMap.set(store.id, store.productionHouseId);
    });
    console.log(`Loaded ${storeMap.size} store mappings`);
    
    let fixedCount = 0;
    let unchangedCount = 0;
    const fixed: any[] = [];
    
    for (const request of allRequests) {
      const correctProductionHouseId = storeMap.get(request.storeId);
      
      if (!correctProductionHouseId) {
        console.log(`⚠️ Warning: Store ${request.storeId} not found in store map`);
        continue;
      }
      
      // Check if productionHouseId needs fixing
      if (request.productionHouseId !== correctProductionHouseId) {
        console.log(`Fixing request ${request.id}: ${request.productionHouseId} -> ${correctProductionHouseId}`);
        
        const updatedRequest = {
          ...request,
          productionHouseId: correctProductionHouseId
        };
        
        await kv.set(`stock_request_${request.id}`, updatedRequest);
        fixedCount++;
        fixed.push({
          id: request.id,
          storeId: request.storeId,
          oldProductionHouseId: request.productionHouseId,
          newProductionHouseId: correctProductionHouseId,
          status: request.status
        });
      } else {
        unchangedCount++;
      }
    }
    
    console.log(`✅ Stock request fix complete: ${fixedCount} fixed, ${unchangedCount} unchanged`);
    
    return c.json({
      success: true,
      message: `Fixed ${fixedCount} stock requests, ${unchangedCount} were already correct`,
      fixed,
      totalChecked: allRequests.length
    });
  } catch (error: any) {
    console.error('Error fixing stock requests:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Add timestamps to old stock request IDs (cluster head only)
app.post('/make-server-c2dd9b9d/migrate-stock-request-timestamps', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const role = auth.user.user_metadata?.role;
    
    // Only cluster heads can run migration
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can run migration' }, 403);
    }

    console.log('🔧 Starting stock request timestamp migration...');
    
    // Get all stock requests
    const allRequests = await getAllByPrefixWithRetry('stock_request_');
    console.log(`Found ${allRequests.length} stock requests to check`);
    
    let updated = 0;
    let skipped = 0;
    
    for (const request of allRequests) {
      // Check if ID already has timestamp (contains 13-digit number at the start)
      const firstPart = request.id.split('-')[0];
      const isTimestamp = !isNaN(parseInt(firstPart)) && parseInt(firstPart) > 1000000000000;
      
      if (isTimestamp) {
        // Already has timestamp, skip
        skipped++;
        continue;
      }
      
      // Generate timestamp from requestDate (use noon on that date)
      const requestDateObj = new Date(request.requestDate + 'T12:00:00');
      const timestamp = requestDateObj.getTime();
      
      // Create new ID with timestamp prefix
      const newId = `${timestamp}-${request.id}`;
      
      // Delete old key
      await kv.del(`stock_request_${request.id}`);
      
      // Save with new key
      const updatedRequest = {
        ...request,
        id: newId
      };
      await kv.set(`stock_request_${newId}`, updatedRequest);
      
      updated++;
      console.log(`Migrated: ${request.id} -> ${newId}`);
    }
    
    console.log(`✅ Migration complete: ${updated} updated, ${skipped} skipped`);
    
    return c.json({
      success: true,
      updated,
      skipped,
      total: allRequests.length,
      message: `Updated ${updated} stock requests with timestamp IDs`
    });
  } catch (error: any) {
    console.error('Error migrating stock request timestamps:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK RECALIBRATION ROUTES
// ============================================

// Submit monthly stock recalibration
app.post('/make-server-c2dd9b9d/stock-recalibration', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const recalibrationData = await c.req.json();
    const { locationId, locationType, locationName, items } = recalibrationData;

    console.log(`📊 Processing stock recalibration for ${locationType}: ${locationName}`);

    // Create a unique ID for this recalibration record
    const recalibrationId = `recal_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    // Use IST timestamp for all recalibration operations
    const currentTimestamp = getNowIST();
    
    // NEW: Determine if this is an opening balance (1st of month) or current stock (other days)
    const dayOfMonth = getDayOfMonthIST(currentTimestamp);
    const isOpeningBalance = dayOfMonth === 1;
    const recalibrationType = isOpeningBalance ? 'opening_balance' : 'current_stock';
    
    console.log(`📅 Recalibration IST timestamp: ${currentTimestamp}`);
    console.log(`📅 Recalibration type: ${recalibrationType} (Day of month: ${dayOfMonth})`);

    // Store the recalibration record
    const recalibrationRecord = {
      id: recalibrationId,
      locationId,
      locationType,
      locationName,
      date: currentTimestamp, // Store full ISO timestamp
      type: recalibrationType, // NEW: 'opening_balance' or 'current_stock'
      isOpeningBalance, // NEW: true if done on 1st, false otherwise
      status: 'pending', // Default status is pending approval
      performedBy: auth.user.id,
      performedByName: auth.user.user_metadata?.name || auth.user.email,
      items,
      totalItems: items.length,
      itemsWithDifference: items.filter((item: any) => item.difference !== 0).length,
      totalWastage: items
        .filter((item: any) => item.adjustmentType === 'wastage' && item.difference < 0)
        .reduce((sum: number, item: any) => sum + Math.abs(item.difference), 0),
      totalCountingErrors: items
        .filter((item: any) => item.adjustmentType === 'counting_error')
        .reduce((sum: number, item: any) => sum + Math.abs(item.difference), 0)
    };

    await kv.set(`recalibration_${recalibrationId}`, recalibrationRecord);

    // IMPORTANT: For finished products (momos), we do NOT update the inventory quantity
    // because stock is calculated dynamically from production/deliveries/sales.
    // Only update inventory for NON-finished products (raw materials, etc.)
    let updatedCount = 0;
    for (const item of items) {
      if (item.difference !== 0 && item.category !== 'finished_product') {
        try {
          const inventoryItem = await kv.get(`inventory_${item.itemId}`);
          if (inventoryItem) {
            const updatedItem = {
              ...inventoryItem,
              quantity: item.actualQuantity,
              lastRecalibrated: currentTimestamp,
              lastRecalibratedBy: auth.user.user_metadata?.name || auth.user.email
            };
            await kv.set(`inventory_${item.itemId}`, updatedItem);
            updatedCount++;
            console.log(`  ✅ Updated inventory ${item.itemId} to ${item.actualQuantity}`);
          }
        } catch (err) {
          console.error(`Error updating inventory item ${item.itemId}:`, err);
        }
      } else if (item.category === 'finished_product') {
        console.log(`  ⏭️ Skipping finished product ${item.itemId} - stock is calculated dynamically`);
      }
    }

    console.log(`✅ Recalibration complete: ${updatedCount} non-finished-product items updated`);

    // NEW: Send notifications to Cluster Heads and Operations Managers
    try {
      const performedByName = auth.user.user_metadata?.name || auth.user.email;
      const recalDate = new Date(currentTimestamp).toLocaleDateString('en-US', { 
        month: 'short', 
        day: 'numeric', 
        year: 'numeric' 
      });
      
      // Get all cluster heads
      const clusterHeads = await getAllClusterHeads();
      
      // Get all operations managers (excluding store/production incharges)
      const operationsManagers = await getOperationsManagers();
      
      // Combine all recipients
      const allRecipients = [...clusterHeads, ...operationsManagers];
      
      console.log(`📢 Sending recalibration notifications to ${allRecipients.length} users (${clusterHeads.length} cluster heads, ${operationsManagers.length} operations managers)`);
      
      // Create notifications for all cluster heads and operations managers
      for (const recipient of allRecipients) {
        if (recipient.authUserId) {
          await notifyUser(
            recipient.authUserId,
            'stock_recalibration',
            'Stock Recalibration Performed',
            `${performedByName} performed a stock recalibration for ${locationName} on ${recalDate}. ${recalibrationRecord.itemsWithDifference} items had differences, with ${recalibrationRecord.totalWastage.toFixed(2)} units of wastage.`,
            recalibrationId,
            currentTimestamp.substring(0, 10) // Date in YYYY-MM-DD format
          );
        }
      }
      
      console.log(`✅ Notifications sent successfully`);
    } catch (notificationError) {
      console.error('Error sending recalibration notifications:', notificationError);
      // Don't fail the recalibration if notifications fail
    }

    return c.json({
      success: true,
      message: `Stock recalibration completed successfully. ${updatedCount} items updated.`,
      recalibrationId,
      updatedCount
    });

  } catch (error: any) {
    console.error('Error processing recalibration:', error);
    return c.json({ error: error.message || 'Failed to process recalibration' }, 500);
  }
});

// Get latest recalibration for a location
app.get('/make-server-c2dd9b9d/stock-recalibration/latest/:locationId', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const locationId = c.req.param('locationId');
    const locationType = c.req.query('locationType'); // 'store' or 'production_house'

    // Get all recalibration records for this location
    const allRecalibrations = await kv.getByPrefix('recalibration_');
    let locationRecalibrations = allRecalibrations
      .filter((r: any) => r.locationId === locationId);
    
    // Filter by locationType if provided
    if (locationType) {
      locationRecalibrations = locationRecalibrations
        .filter((r: any) => r.locationType === locationType);
    }
    
    locationRecalibrations = locationRecalibrations
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    if (locationRecalibrations.length === 0) {
      return c.json({ lastRecalibration: null });
    }

    return c.json({ 
      lastRecalibration: locationRecalibrations[0].date,
      record: locationRecalibrations[0]
    });

  } catch (error: any) {
    console.error('Error fetching latest recalibration:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get recalibration history for a location
app.get('/make-server-c2dd9b9d/stock-recalibration/history/:locationId', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const locationId = c.req.param('locationId');
    const role = auth.user.user_metadata?.role;
    // Get locationType from query parameter to filter results
    const locationType = c.req.query('locationType'); // 'store' or 'production_house'

    // Get all recalibration records
    const allRecalibrations = await kv.getByPrefix('recalibration_');
    
    let locationRecalibrations;
    
    // If locationId is "all-cluster-locations", fetch for all managed locations
    if (locationId === 'all-cluster-locations' && role === 'cluster_head') {
      const employeeId = auth.user.user_metadata?.employeeId;
      const employee = await kv.get(`unified-employee:${employeeId}`);
      
      if (employee) {
        const managedStoreIds = employee.managedStoreIds || [];
        const managedProductionHouseIds = employee.managedProductionHouseIds || [];
        const allManagedIds = [...managedStoreIds, ...managedProductionHouseIds];
        
        locationRecalibrations = allRecalibrations
          .filter((r: any) => {
            const matchesLocation = allManagedIds.includes(r.locationId);
            const matchesType = !locationType || r.locationType === locationType;
            return matchesLocation && matchesType;
          })
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      } else {
        locationRecalibrations = [];
      }
    } else {
      // Standard query for a specific location
      // CRITICAL FIX: For production houses, we need to handle BOTH the UUID AND mapped store IDs
      // Because a production house might have been created from a store that was converted,
      // and old recalibrations might be saved with the original store ID
      
      console.log(`📋 Recalibration History Query:
        - Querying locationId: ${locationId}
        - Filtering by locationType: ${locationType || 'ALL'}`);
      
      // If this is a production_house query, we need to find all stores mapped to this production house
      // and include recalibrations from those store IDs as well
      let validLocationIds = [locationId];
      
      if (locationType === 'production_house') {
        // Get all stores to find which ones map to this production house (stores live
        // under `store:`, not `store_`)
        const allStores = await kv.getByPrefix('store:');
        const mappedStores = allStores.filter((store: any) =>
          store.productionHouseId === locationId
        );
        
        // Add the mapped store IDs to our search
        const mappedStoreIds = mappedStores.map((s: any) => s.id);
        validLocationIds = [locationId, ...mappedStoreIds];
        
        console.log(`📋 Production House Query - Including IDs:`, validLocationIds);
        console.log(`   - Production House UUID: ${locationId}`);
        console.log(`   - Mapped Store IDs: ${mappedStoreIds.join(', ') || 'none'}`);
      }
      
      // Only return recalibrations for THIS specific location OR its mapped stores
      // If locationType is specified, ONLY return that type
      locationRecalibrations = allRecalibrations
        .filter((r: any) => {
          const matchesLocation = validLocationIds.includes(r.locationId);
          const matchesType = !locationType || r.locationType === locationType;
          return matchesLocation && matchesType;
        })
        .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
      
      console.log(`📋 Found ${locationRecalibrations.length} recalibration records`);
      if (locationRecalibrations.length > 0) {
        console.log(`📋 Sample locationIds from results:`, locationRecalibrations.slice(0, 3).map((r: any) => r.locationId));
      }
    }

    return c.json({ 
      history: locationRecalibrations,
      count: locationRecalibrations.length
    });

  } catch (error: any) {
    console.error('Error fetching recalibration history:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all pending recalibrations for approval (Managers and Cluster Heads only)
app.get('/make-server-c2dd9b9d/stock-recalibration/pending-approval', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    // Get all recalibration records
    const allRecalibrations = await kv.getByPrefix('recalibration_');
    
    // Filter for pending status (default to 'pending' if no status field)
    const pendingRecalibrations = allRecalibrations
      .filter((r: any) => !r.status || r.status === 'pending')
      .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return c.json({ 
      recalibrations: pendingRecalibrations,
      count: pendingRecalibrations.length
    });

  } catch (error: any) {
    console.error('Error fetching pending recalibrations:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Approve a recalibration
app.post('/make-server-c2dd9b9d/stock-recalibration/:id/approve', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    // Approvers are the cluster head and operations managers (as on the Recalibration screen),
    // and never the person who did the count: anyone could approve, their own count included.
    if (!isClusterHeadOrOps(auth.user)) {
      return c.json({ error: 'Only the cluster head and operations managers can approve a stock count' }, 403);
    }
    const recalibrationId = c.req.param('id');
    
    // Get the recalibration record
    const recalibration = await kv.get(`recalibration_${recalibrationId}`);
    if (!recalibration) {
      return c.json({ error: 'Recalibration not found' }, 404);
    }
    if (recalibration.performedBy === auth.user.id) {
      return c.json({ error: 'Someone other than the person who did the count has to approve it' }, 403);
    }
    if (recalibration.status && recalibration.status !== 'pending') {
      return c.json({ error: `This stock count is already ${recalibration.status}` }, 409);
    }

    // Update the record with approval
    const updatedRecalibration = {
      ...recalibration,
      status: 'approved',
      approvedBy: auth.user.id,
      approvedByName: auth.user.user_metadata?.name || auth.user.email,
      approvedAt: getNowIST()
    };

    await kv.set(`recalibration_${recalibrationId}`, updatedRecalibration);

    console.log(`✅ Recalibration ${recalibrationId} approved by ${updatedRecalibration.approvedByName}`);

    return c.json({
      success: true,
      message: 'Recalibration approved successfully',
      recalibration: updatedRecalibration
    });

  } catch (error: any) {
    console.error('Error approving recalibration:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Reject a recalibration
app.post('/make-server-c2dd9b9d/stock-recalibration/:id/reject', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    if (!isClusterHeadOrOps(auth.user)) {
      return c.json({ error: 'Only the cluster head and operations managers can reject a stock count' }, 403);
    }
    const recalibrationId = c.req.param('id');
    const { reason } = await c.req.json();
    
    if (!reason) {
      return c.json({ error: 'Rejection reason is required' }, 400);
    }

    // Get the recalibration record
    const recalibration = await kv.get(`recalibration_${recalibrationId}`);
    if (!recalibration) {
      return c.json({ error: 'Recalibration not found' }, 404);
    }

    // Update the record with rejection
    const updatedRecalibration = {
      ...recalibration,
      status: 'rejected',
      rejectedBy: auth.user.id,
      rejectedByName: auth.user.user_metadata?.name || auth.user.email,
      rejectedAt: new Date().toISOString(),
      rejectionReason: reason
    };

    await kv.set(`recalibration_${recalibrationId}`, updatedRecalibration);

    console.log(`❌ Recalibration ${recalibrationId} rejected by ${updatedRecalibration.rejectedByName}`);

    return c.json({
      success: true,
      message: 'Recalibration rejected',
      recalibration: updatedRecalibration
    });

  } catch (error: any) {
    console.error('Error rejecting recalibration:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get monthly wastage report
app.get('/make-server-c2dd9b9d/stock-recalibration/wastage-report', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const month = c.req.query('month'); // Expected format: "2026-01"
    const locationId = c.req.query('locationId'); // Optional - filter by location
    const locationType = c.req.query('locationType'); // 'store' or 'production_house'
    const role = auth.user.user_metadata?.role;

    if (!month) {
      return c.json({ error: 'Month parameter is required (format: YYYY-MM)' }, 400);
    }

    // Get all recalibration records
    const allRecalibrations = await kv.getByPrefix('recalibration_');
    
    // Filter by month and optionally by location
    let filteredRecalibrations;
    
    // If locationId is "all-cluster-locations", fetch for all managed locations
    if (locationId === 'all-cluster-locations' && role === 'cluster_head') {
      const employeeId = auth.user.user_metadata?.employeeId;
      const employee = await kv.get(`unified-employee:${employeeId}`);
      
      if (employee) {
        const managedStoreIds = employee.managedStoreIds || [];
        const managedProductionHouseIds = employee.managedProductionHouseIds || [];
        const allManagedIds = [...managedStoreIds, ...managedProductionHouseIds];
        
        filteredRecalibrations = allRecalibrations.filter((r: any) => {
          const recalMonth = r.date.substring(0, 7);
          const matchesMonth = recalMonth === month;
          const matchesLocation = allManagedIds.includes(r.locationId);
          const matchesType = !locationType || r.locationType === locationType;
          return matchesMonth && matchesLocation && matchesType;
        });
      } else {
        filteredRecalibrations = [];
      }
    } else {
      // Standard query - CRITICAL FIX: For production houses, handle BOTH UUID AND mapped store IDs
      
      console.log(`📊 Wastage Report Query:
        - Month: ${month}
        - Querying locationId: ${locationId}
        - Filtering by locationType: ${locationType || 'ALL'}`);
      
      // If this is a production_house query, we need to find all stores mapped to this production house
      let validLocationIds = locationId ? [locationId] : null;
      
      if (locationId && locationType === 'production_house') {
        // Get all stores to find which ones map to this production house (stores live
        // under `store:`, not `store_`)
        const allStores = await kv.getByPrefix('store:');
        const mappedStores = allStores.filter((store: any) =>
          store.productionHouseId === locationId
        );
        
        // Add the mapped store IDs to our search
        const mappedStoreIds = mappedStores.map((s: any) => s.id);
        validLocationIds = [locationId, ...mappedStoreIds];
        
        console.log(`📊 Production House Wastage Query - Including IDs:`, validLocationIds);
      }
      
      filteredRecalibrations = allRecalibrations.filter((r: any) => {
        const recalMonth = r.date.substring(0, 7); // "2026-01"
        if (recalMonth !== month) return false;
        if (validLocationIds && !validLocationIds.includes(r.locationId)) return false;
        if (locationType && r.locationType !== locationType) return false;
        return true;
      });
      
      console.log(`📊 Found ${filteredRecalibrations.length} recalibration records for wastage report`);
    }

    // Collect all items with wastage or counting errors
    const wastageItems: any[] = [];
    filteredRecalibrations.forEach((recal: any) => {
      recal.items?.forEach((item: any) => {
        if (item.difference !== 0 && item.adjustmentType) {
          wastageItems.push({
            ...item,
            locationId: recal.locationId,
            locationName: recal.locationName,
            date: recal.date,
            performedBy: recal.performedByName
          });
        }
      });
    });

    // Calculate summary statistics
    const summary = {
      totalRecalibrations: filteredRecalibrations.length,
      uniqueLocations: new Set(filteredRecalibrations.map((r: any) => r.locationId)).size,
      totalWastage: wastageItems.filter(i => i.adjustmentType === 'wastage').length,
      totalCountingErrors: wastageItems.filter(i => i.adjustmentType === 'counting_error').length,
      totalDifferenceValue: wastageItems.reduce((sum, item) => sum + Math.abs(item.difference), 0)
    };

    return c.json({
      month,
      locationId: locationId || 'all',
      summary,
      items: wastageItems,
      recalibrations: filteredRecalibrations.map((r: any) => ({
        id: r.id,
        locationName: r.locationName,
        date: r.date,
        performedBy: r.performedByName,
        itemsWithDifference: r.itemsWithDifference,
        status: r.status || 'pending'
      }))
    });

  } catch (error: any) {
    console.error('Error generating wastage report:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK THRESHOLD SETTINGS
// ============================================

// Get stock thresholds for a store
app.get('/make-server-c2dd9b9d/stock-thresholds/:storeId', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const storeId = c.req.param('storeId');
    const thresholds = await kv.get(`stock-thresholds:${storeId}`);
    
    // Return default thresholds if none saved
    if (!thresholds) {
      return c.json({
        thresholds: {
          chicken: { high: 1200, medium: 600, low: 300 },
          chickenCheese: { high: 600, medium: 300, low: 150 },
          veg: { high: 600, medium: 300, low: 150 },
          cheeseCorn: { high: 600, medium: 300, low: 150 },
          paneer: { high: 600, medium: 300, low: 150 },
          vegKurkure: { high: 600, medium: 300, low: 150 },
          chickenKurkure: { high: 600, medium: 300, low: 150 },
        }
      });
    }
    
    return c.json({ thresholds });
  } catch (error: any) {
    console.error('Error fetching stock thresholds:', error);
    console.error('Stack trace:', error.stack);
    // Return default thresholds on error instead of failing
    console.log('Returning default thresholds due to database error');
    return c.json({
      thresholds: {
        chicken: { high: 1200, medium: 600, low: 300 },
        chickenCheese: { high: 600, medium: 300, low: 150 },
        veg: { high: 600, medium: 300, low: 150 },
        cheeseCorn: { high: 600, medium: 300, low: 150 },
        paneer: { high: 600, medium: 300, low: 150 },
        vegKurkure: { high: 600, medium: 300, low: 150 },
        chickenKurkure: { high: 600, medium: 300, low: 150 },
      }
    });
  }
});

// Save stock thresholds for a store
app.post('/make-server-c2dd9b9d/stock-thresholds/:storeId', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const storeId = c.req.param('storeId');
    const { thresholds } = await c.req.json();
    
    // Save thresholds
    await kv.set(`stock-thresholds:${storeId}`, thresholds);
    
    return c.json({ success: true, thresholds });
  } catch (error: any) {
    console.error('Error saving stock thresholds:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Shared (not per-store) momo plate configuration - pieces per plate and menu selling
// price per plate, for each finished-product category. Used to convert POS-synced piece
// counts into plates and revenue for the Category Sales profitability breakdown.
// Keyed by the same category labels used in sales_data_ records (SalesDataRecord.data /
// MomoCategory), not the camelKey convention used elsewhere in this file, so Category
// Sales can read this config with no translation layer.
const DEFAULT_MOMO_PLATE_CONFIG: Record<string, { piecesPerPlate: number; pricePerPlate: number }> = {
  'Chicken Momos': { piecesPerPlate: 6, pricePerPlate: 0 },
  'Chicken Cheese Momos': { piecesPerPlate: 6, pricePerPlate: 0 },
  'Veg Momos': { piecesPerPlate: 6, pricePerPlate: 0 },
  'Paneer Momos': { piecesPerPlate: 6, pricePerPlate: 0 },
  'Corn Cheese Momos': { piecesPerPlate: 6, pricePerPlate: 0 },
  'Chicken Kurkure Momos': { piecesPerPlate: 6, pricePerPlate: 0 },
  'Veg Kurkure Momos': { piecesPerPlate: 6, pricePerPlate: 0 },
};

app.get('/make-server-c2dd9b9d/momo-plate-config', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  try {
    const config = await kv.get('momo-plate-config:global');
    return c.json({ config: config || DEFAULT_MOMO_PLATE_CONFIG });
  } catch (error: any) {
    console.error('Error fetching momo plate config:', error);
    return c.json({ config: DEFAULT_MOMO_PLATE_CONFIG });
  }
});

app.post('/make-server-c2dd9b9d/momo-plate-config', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  if (auth.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can update plate configuration' }, 403);
  }
  try {
    const { config } = await c.req.json();
    await kv.set('momo-plate-config:global', config);
    return c.json({ success: true, config });
  } catch (error: any) {
    console.error('Error saving momo plate config:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// CLUSTER MANAGEMENT ROUTES
// ============================================

// Get cluster head info with managed locations
app.get('/make-server-c2dd9b9d/cluster/info', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const role = auth.user.user_metadata?.role;
    
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can access cluster info' }, 403);
    }

    const employeeId = auth.user.user_metadata?.employeeId;
    if (!employeeId) {
      return c.json({ error: 'Employee ID not found' }, 400);
    }

    // Get the unified employee record which contains cluster mappings
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ 
        managedStoreIds: [], 
        managedProductionHouseIds: [],
        message: 'No cluster assignments found'
      });
    }

    return c.json({
      managedStoreIds: employee.managedStoreIds || [],
      managedProductionHouseIds: employee.managedProductionHouseIds || [],
      employeeId: employee.employeeId,
      name: employee.name
    });

  } catch (error: any) {
    console.error('Error fetching cluster info:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Update cluster head assignments (admin/cluster head only)
app.post('/make-server-c2dd9b9d/cluster/update-assignments', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const role = auth.user.user_metadata?.role;
    
    // Only cluster heads can update their own assignments (self-service)
    // Or future: add admin role for cross-cluster management
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can update cluster assignments' }, 403);
    }

    const { employeeId, managedStoreIds, managedProductionHouseIds } = await c.req.json();

    if (!employeeId) {
      return c.json({ error: 'Employee ID is required' }, 400);
    }

    // Get the existing employee record
    const employee = await kv.get(`unified-employee:${employeeId}`);
    
    if (!employee) {
      return c.json({ error: 'Employee not found' }, 404);
    }

    // Update with cluster assignments
    const updatedEmployee = {
      ...employee,
      managedStoreIds: managedStoreIds || [],
      managedProductionHouseIds: managedProductionHouseIds || [],
      updatedAt: new Date().toISOString()
    };

    await kv.set(`unified-employee:${employeeId}`, updatedEmployee);

    console.log(`✅ Updated cluster assignments for ${employeeId}:`, {
      stores: managedStoreIds?.length || 0,
      productionHouses: managedProductionHouseIds?.length || 0
    });

    return c.json({
      success: true,
      message: 'Cluster assignments updated successfully',
      employee: updatedEmployee
    });

  } catch (error: any) {
    console.error('Error updating cluster assignments:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Get all cluster heads with their assignments (for management UI)
app.get('/make-server-c2dd9b9d/cluster/all-cluster-heads', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }

  try {
    const role = auth.user.user_metadata?.role;
    
    // Only cluster heads can view all cluster assignments
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can access this endpoint' }, 403);
    }

    // Get all unified employee records
    const allEmployees = await kv.getByPrefix('unified-employee:');
    
    // Filter for cluster heads only
    const clusterHeads = allEmployees
      .filter((emp: any) => emp.role === 'cluster_head')
      .map((emp: any) => ({
        employeeId: emp.employeeId,
        name: emp.name,
        email: emp.email,
        managedStoreIds: emp.managedStoreIds || [],
        managedProductionHouseIds: emp.managedProductionHouseIds || [],
        status: emp.status
      }));

    return c.json({
      clusterHeads,
      count: clusterHeads.length
    });

  } catch (error: any) {
    console.error('Error fetching cluster heads:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// PUSH NOTIFICATION ROUTES
// ============================================

// Import push notification functions
import * as push from './pushNotifications.tsx';

// Get VAPID public key for client-side subscription
app.get('/make-server-c2dd9b9d/push/vapid-public-key', (c) => {
  const publicKey = Deno.env.get('VAPID_PUBLIC_KEY');
  
  if (!publicKey) {
    // Return success but indicate keys are not configured
    return c.json({ publicKey: null, configured: false });
  }
  
  return c.json({ publicKey, configured: true });
});

// Subscribe to push notifications
app.post('/make-server-c2dd9b9d/push/subscribe', async (c) => {
  try {
    const { subscription, userId } = await c.req.json();
    
    if (!subscription || !userId) {
      return c.json({ error: 'Subscription and userId are required' }, 400);
    }
    
    await push.storeSubscription(userId, subscription);
    
    return c.json({ 
      success: true, 
      message: 'Successfully subscribed to push notifications' 
    });
  } catch (error: any) {
    console.error('Error subscribing to push notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Unsubscribe from push notifications
app.post('/make-server-c2dd9b9d/push/unsubscribe', async (c) => {
  try {
    const { userId } = await c.req.json();
    
    if (!userId) {
      return c.json({ error: 'userId is required' }, 400);
    }
    
    await push.removeSubscription(userId);
    
    return c.json({ 
      success: true, 
      message: 'Successfully unsubscribed from push notifications' 
    });
  } catch (error: any) {
    console.error('Error unsubscribing from push notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Subscribe to native (Android/FCM) push notifications
app.post('/make-server-c2dd9b9d/push/subscribe-fcm', async (c) => {
  try {
    const { token, userId, nativeBuild } = await c.req.json();

    if (!token || !userId) {
      return c.json({ error: 'token and userId are required' }, 400);
    }

    await push.storeFcmToken(userId, token, Number(nativeBuild) || undefined);

    return c.json({
      success: true,
      message: 'Successfully subscribed to native push notifications'
    });
  } catch (error: any) {
    console.error('Error subscribing to native push notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Unsubscribe from native (Android/FCM) push notifications
app.post('/make-server-c2dd9b9d/push/unsubscribe-fcm', async (c) => {
  try {
    const { userId } = await c.req.json();

    if (!userId) {
      return c.json({ error: 'userId is required' }, 400);
    }

    await push.removeFcmToken(userId);

    return c.json({
      success: true,
      message: 'Successfully unsubscribed from native push notifications'
    });
  } catch (error: any) {
    console.error('Error unsubscribing from native push notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Send push notification to a user (protected route)
app.post('/make-server-c2dd9b9d/push/send', async (c) => {
  try {
    const authResult = await verifyUser(c.req.header('Authorization'));
    if ('error' in authResult) {
      return c.json({ error: authResult.error }, authResult.status);
    }
    
    const { userId, title, message, icon, tag, data } = await c.req.json();
    
    if (!userId || !title || !message) {
      return c.json({ error: 'userId, title, and message are required' }, 400);
    }
    
    const result = await push.sendPushNotification(userId, {
      title,
      message,
      icon,
      tag,
      data,
    });
    
    if (result) {
      return c.json({ success: true, message: 'Push notification sent' });
    } else {
      return c.json({ success: false, message: 'Failed to send push notification' }, 500);
    }
  } catch (error: any) {
    console.error('Error sending push notification:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Send push notification to multiple users (protected route)
app.post('/make-server-c2dd9b9d/push/send-multiple', async (c) => {
  try {
    const authResult = await verifyUser(c.req.header('Authorization'));
    if ('error' in authResult) {
      return c.json({ error: authResult.error }, authResult.status);
    }
    
    const { userIds, title, message, icon, tag, data } = await c.req.json();
    
    if (!userIds || !Array.isArray(userIds) || !title || !message) {
      return c.json({ error: 'userIds (array), title, and message are required' }, 400);
    }
    
    const result = await push.sendPushNotificationToMultipleUsers(userIds, {
      title,
      message,
      icon,
      tag,
      data,
    });
    
    return c.json({ 
      success: true, 
      message: `Sent ${result.success} notifications, ${result.failed} failed`,
      ...result 
    });
  } catch (error: any) {
    console.error('Error sending push notifications:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK REQUEST BY MIDNIGHT (owner, 29 Oct 2026: "stock request for next day should be sent by
// midnight ... notify as critical for rohan to send stock request")
// ============================================
// pg_cron, IST: ?slot=first at 9:30 PM and ?slot=last at 11:15 PM - a store with no request for
// tomorrow: its store incharge gets an urgent push (never held for quiet hours; the owner is told if
// it is not opened in 30 minutes). ?slot=missed at 12:05 AM - still none for the day that has just
// begun: the owner and operations managers are told (an action, kept for the morning). Once per
// store, day and slot. (The old 3 PM version read the wrong records and never reached anyone.)
app.post('/make-server-c2dd9b9d/send-stock-request-reminders', async (c) => {
  const secret = Deno.env.get('CRON_SYNC_SECRET');
  if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const slot = c.req.query('slot') === 'last' ? 'last' : c.req.query('slot') === 'missed' ? 'missed' : 'first';
    const today = getTodayIST();
    const forDate = slot === "missed" ? today : new Date(Date.parse(`${today}T00:00:00Z`) + 86400000).toISOString().slice(0, 10);
    const { data, error } = await supabase.from('kv_store_c2dd9b9d').select('value')
      .like('key', 'production_request_%').eq('value->>requestDate', forDate);
    if (error) throw new Error(error.message);
    const sentFor = new Set((data || []).map((r: any) => r.value).filter((r: any) => r && !['cancelled', 'rejected'].includes(r.status)).map((r: any) => r.storeId));
    const stores = (await kv.getByPrefix('store:')).filter((st: any) => st?.id && st.productionHouseId && st.status !== 'inactive' && st.status !== 'closed');
    const staff = (await staffForNotifications()).filter((u: any) => u.authUserId && u.status !== 'inactive');
    const dayName = new Date(`${forDate}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const results: any[] = [];
    for (const store of stores) {
      if (sentFor.has(store.id)) continue;
      const onceKey = `stock-request-reminder:${store.id}:${forDate}:${slot}`;
      if (await kv.get(onceKey)) continue;
      let to: any[];
      let type: string, title: string, message: string;
      if (slot === 'missed') {
        to = staff.filter((u: any) => u.role === 'cluster_head' || (u.role === 'manager' && !['store_incharge', 'production_incharge'].includes(u.designation)));
        type = 'stock_request_missed';
        title = `No stock request from ${store.name}`;
        message = `The request for ${dayName} was not sent by midnight. Production has nothing to plan from.`;
      } else {
        to = staff.filter((u: any) => u.designation === 'store_incharge' && (u.storeId === store.id || (u.assignedStoreIds || []).includes(store.id)));
        type = 'stock_request_reminder';
        title = slot === 'last' ? `45 minutes left: stock request for ${dayName}` : `Send tomorrow's stock request by midnight`;
        message = slot === 'last'
          ? `${store.name} has not sent the request for ${dayName}. Open Stock > Requests, tap Fill in for me, check and send.`
          : `${store.name}: the request for ${dayName} is due by midnight tonight. Open Stock > Requests, tap Fill in for me, check and send.`;
      }
      for (const u of to) await notifyUser(u.authUserId, type, title, message, undefined, forDate).catch(() => undefined);
      await kv.set(onceKey, { at: new Date().toISOString(), to: to.map((u: any) => u.id) });
      results.push({ store: store.name, to: to.map((u: any) => u.name) });
    }
    console.log(`Stock request reminders (${slot}, ${forDate}):`, JSON.stringify(results));
    return c.json({ success: true, slot, forDate, reminded: results });
  } catch (error: any) {
    console.error('Error sending stock request reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// MONTH-END STOCK COUNT (owner, 29 Oct 2026: "we have a stock count due on 31st October ... push
// this notification as urgent to store incharge ... repeated notifications starting from previous
// day 6pm, max 5 notifications. Do this every month.")
// ============================================
// pg_cron calls this every day at 12, 4, 6, 8 and 9 PM IST. It acts only on the day before the
// month's last day (6 PM, 9 PM) and the last day (12 PM, 4 PM, 8 PM): five reminders at most. A
// store whose count is in - a stock count saved for it since 6 PM the day before - is left alone.
// Urgent to the store incharge (never held for quiet hours; the owner is told if it isn't opened).
// Once per store, month and slot. ?slot= overrides the hour and ?today= the date, and ?dry=1 only
// says who would be reminded (for a test).
const COUNT_SLOTS: Record<string, { day: 'eve' | 'last'; n: number }> = {
  'eve-6pm': { day: 'eve', n: 1 }, 'eve-9pm': { day: 'eve', n: 2 }, '12pm': { day: 'last', n: 3 }, '4pm': { day: 'last', n: 4 }, '8pm': { day: 'last', n: 5 },
};
const COUNT_SLOT_AT_HOUR: Record<number, string> = { 18: 'eve-6pm', 21: 'eve-9pm', 12: '12pm', 16: '4pm', 20: '8pm' };
app.post('/make-server-c2dd9b9d/send-stock-count-reminders', async (c) => {
  const secret = Deno.env.get('CRON_SYNC_SECRET');
  if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const now = getNowIST();
    const dry = c.req.query('dry') === '1';
    const today = (dry && /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('today') || '') ? c.req.query('today')! : now.slice(0, 10));
    const slot = c.req.query('slot') || COUNT_SLOT_AT_HOUR[Number(now.slice(11, 13))];
    const def = COUNT_SLOTS[slot || ''];
    const nextMonth = new Date(Date.parse(`${today.slice(0, 7)}-01T00:00:00Z`) + 32 * 86400000).toISOString().slice(0, 7);
    const last = new Date(Date.parse(`${nextMonth}-01T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    const eve = new Date(Date.parse(`${last}T00:00:00Z`) - 86400000).toISOString().slice(0, 10);
    if (!def || today !== (def.day === 'eve' ? eve : last)) return c.json({ success: true, skipped: 'not a count reminder time', today, slot: slot || null });
    // Counted: a stock count for the store saved since 6 PM the day before the last day (IST).
    const since = `${eve}T18:00`;
    const recentCounts = (await getAllByPrefixWithRetry('recalibration_'))
      .filter((r: any) => typeof r?.date === 'string' && r.date >= since && r.status !== 'rejected');
    const counted = new Set(recentCounts.filter((r: any) => r.locationType === 'store').map((r: any) => r.locationId));
    const stores = (await kv.getByPrefix('store:')).filter((st: any) => st?.id && st.status !== 'inactive' && st.status !== 'closed');
    const staff = (await staffForNotifications()).filter((u: any) => u.authUserId && u.status !== 'inactive');
    const lastName = new Date(`${last}T00:00:00Z`).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
    const results: any[] = [];
    for (const store of stores) {
      if (counted.has(store.id)) continue;
      const onceKey = `stock-count-reminder:${store.id}:${last.slice(0, 7)}:${slot}`;
      if (await kv.get(onceKey)) continue;
      const to = staff.filter((u: any) => u.designation === 'store_incharge' && (u.storeId === store.id || (u.assignedStoreIds || []).includes(store.id)));
      if (dry) {
        results.push({ store: store.name, to: to.map((u: any) => u.name), dry: true });
        continue;
      }
      const title = def.day === 'eve' ? `Month-end momo count tomorrow (${lastName})` : `Count the momos today: month-end stock count`;
      // Tapping it opens the count (notificationNavigation: stock_count_reminder, 31 Oct 2026).
      const message = def.day === 'eve'
        ? `${store.name}: tomorrow is the month-end stock count. Count every momo type in the freezer and enter it in Stock > Count stock. Reminder ${def.n} of 5.`
        : `${store.name}: count every momo type in the freezer and enter it today - tap here to open the count. It shows how many momos went missing this month. Reminder ${def.n} of 5.`;
      for (const u of to) await notifyUser(u.authUserId, 'stock_count_reminder', title, message, undefined, last).catch(() => undefined);
      await kv.set(onceKey, { at: new Date().toISOString(), to: to.map((u: any) => u.id) });
      results.push({ store: store.name, to: to.map((u: any) => u.name) });
    }
    // The production house's count too (owner, 31 Oct 2026: Vijay was never reminded): to its
    // production incharge, the same five times, until a count is saved for the house - after the
    // day's momos have gone. A count saved under a store id the house supplies (older records) counts.
    const countHouses = (await getAllByPrefixWithRetry('production_house_')).filter((h: any) => h?.id && h.status !== 'inactive');
    for (const house of countHouses) {
      const storeIds = new Set(stores.filter((st: any) => st.productionHouseId === house.id).map((st: any) => st.id));
      if (recentCounts.some((r: any) => r.locationType === 'production_house' && (r.locationId === house.id || storeIds.has(r.locationId)))) continue;
      const onceKey = `stock-count-reminder:${house.id}:${last.slice(0, 7)}:${slot}`;
      if (await kv.get(onceKey)) continue;
      const to = staff.filter((u: any) => u.designation === 'production_incharge'
        && (u.storeId === house.id || u.productionHouseId === house.id || (u.assignedProductionHouseIds || []).includes(house.id)));
      if (dry) {
        results.push({ house: house.name, to: to.map((u: any) => u.name), dry: true });
        continue;
      }
      const title = def.day === 'eve' ? `Month-end momo count tomorrow (${lastName})` : `Count the momos today: month-end stock count`;
      const message = def.day === 'eve'
        ? `${house.name}: tomorrow is the month-end stock count. After the day's momos have gone, count every momo type in the freezer and enter it in Production > Requests > Count stock. Reminder ${def.n} of 5.`
        : `${house.name}: after the day's momos have gone, count every momo type in the freezer and enter it today - tap here to open the count. Reminder ${def.n} of 5.`;
      for (const u of to) await notifyUser(u.authUserId, 'stock_count_reminder', title, message, undefined, last).catch(() => undefined);
      await kv.set(onceKey, { at: new Date().toISOString(), to: to.map((u: any) => u.id) });
      results.push({ house: house.name, to: to.map((u: any) => u.name) });
    }
    // Every 3 months the equipment check goes with the momo count (owner, 30 Oct 2026): each store
    // and production house incharge, same five reminders, until their place's check is saved.
    const equipment: any[] = [];
    if (CHECK_MONTHS.includes(Number(last.slice(5, 7))) && last.slice(0, 7) >= CHECKS_FROM) {
      const houses = (await getAllByPrefixWithRetry('production_house_')).filter((h: any) => h?.id && h.status !== 'inactive');
      const places = [...stores.map((st: any) => ({ kind: 'store', id: String(st.id), name: st.name, designation: 'store_incharge' })), ...houses.map((h: any) => ({ kind: 'production_house', id: String(h.id), name: h.name || 'Production house', designation: 'production_incharge' }))];
      for (const pl of places) {
        if (await kv.get(`asset-check:${pl.kind}:${pl.id}:${last.slice(0, 7)}`)) continue;
        const onceKey = `equipment-check-reminder:${pl.kind}:${pl.id}:${last.slice(0, 7)}:${slot}`;
        if (await kv.get(onceKey)) continue;
        const to = staff.filter((u: any) => u.designation === pl.designation && [u.storeId, u.productionHouseId, ...(u.assignedStoreIds || []), ...(u.assignedProductionHouseIds || [])].map(String).includes(pl.id));
        if (dry) { equipment.push({ place: pl.name, to: to.map((u: any) => u.name), dry: true }); continue; }
        const title = def.day === 'eve' ? `Equipment check due (${pl.name})` : `Check the equipment today: ${pl.name}`;
        const message = `Every 3 months: open More > Equipment and assets > Check the equipment. Tick each item seen, not found or broken, count the sets, and photograph anything over Rs 2,000. Reminder ${def.n} of 5.`;
        for (const u of to) await notifyUser(u.authUserId, 'equipment_check_due', title, message, undefined, last).catch(() => undefined);
        await kv.set(onceKey, { at: new Date().toISOString(), to: to.map((u: any) => u.id) });
        equipment.push({ place: pl.name, to: to.map((u: any) => u.name) });
      }
    }
    console.log(`Stock count reminders (${slot}, month ending ${last}):`, JSON.stringify(results), 'equipment:', JSON.stringify(equipment));
    return c.json({ success: true, slot, monthEnd: last, reminded: results, equipment });
  } catch (error: any) {
    console.error('Error sending stock count reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// DAILY STOCK CHECK (owner, 31 Oct 2026: "keep a daily check on item sales and stock left logic
// for production and store and validate if logic is correct or not and then on 30th nov we will
// check again how it spanned out") - stockCheck.ts
// ============================================
// pg_cron calls this at 11:40 PM IST, after the POS syncs (10:30 and 11 PM). For each store and
// production house: the day's in and out, what should be left since its last count, and what looks
// wrong. Saved as stock-check:{date}; nobody is notified. ?date= checks another day; ?dry=1 doesn't save.
async function runStockCheck(date: string) {
  const [counts, storesAll, houses, requests, sales, wastage, production, itemsRaw] = await Promise.all([
    getAllByPrefixWithRetry('recalibration_'), kv.getByPrefix('store:'), getAllByPrefixWithRetry('production_house_'),
    getAllByPrefixWithRetry('production_request_'), getAllByPrefixWithRetry('sales_data_'), getAllByPrefixWithRetry('stock-wastage:'),
    getAllByPrefixWithRetry('production:'), getAllByPrefixWithRetry('inventory_item_'),
  ]);
  const items = (itemsRaw || []).filter((i: any) => i?.id && i?.name).map((i: any) => ({ id: String(i.id), name: String(i.name) }));
  const stores = (storesAll || []).filter((s: any) => s?.id && s.status !== 'inactive' && s.status !== 'closed');
  const upTo = (rows: any[]) => rows.filter((r: any) => typeof r?.date === 'string' && r.date.slice(0, 10) <= date);
  const prev = await kv.get(`stock-check:${addDaysToDateString(date, -1)}`) as { places?: stockCheck.PlaceDay[] } | null;
  const places: stockCheck.PlaceDay[] = [];

  for (const store of stores) {
    const base = stockCheck.lastCount(upTo(counts).filter((r: any) => r.locationType === 'store' && r.locationId === store.id), items);
    const day = stockCheck.storeDay({ id: store.id, name: store.name, date, base, requests, sales, wastage });
    const itemRecords = (sales || []).filter((s: any) => s.storeId === store.id && s.date === date);
    const inTransit = (requests || []).filter((r: any) => r.storeId === store.id && !r.eventId && (r.status === 'shipped' || r.status === 'partially-shipped')
      && (stockCheck.istOf(r.shippedAt) || '').slice(0, 10) <= date);
    const syncLog = await kv.get(`pos-sync-log:${date}:${store.id}`) as any;
    const sold = !!syncLog?.stepA?.success || (Number(syncLog?.stepA?.totalSales) || 0) > 0;
    day.flags = [
      ...stockCheck.lateChanges(prev?.places?.find((p) => p.kind === 'store' && p.id === store.id), day.opening),
      ...stockCheck.storeFlags(day, { itemRecords, inTransit, syncLog, sold }),
    ];
    places.push(day);
  }
  for (const house of houses || []) {
    if (!house?.id || house.status === 'inactive') continue;
    const storeIds = stores.filter((s: any) => s.productionHouseId === house.id).map((s: any) => s.id);
    const ids = [house.id, ...storeIds];
    // A house's counts are also saved under a store id it supplies (older records).
    const base = stockCheck.lastCount(upTo(counts).filter((r: any) => r.locationType === 'production_house' && ids.includes(r.locationId)), items);
    const day = stockCheck.houseDay({ id: house.id, name: house.name || 'Production house', date, base, ids, storeIds, production, requests });
    const entries = (production || []).filter((p: any) => p.date === date && p.approvalStatus !== 'rejected' && (ids.includes(p.productionHouseId) || ids.includes(p.storeId)));
    day.flags = [
      ...stockCheck.lateChanges(prev?.places?.find((p) => p.kind === 'production' && p.id === house.id), day.opening),
      ...stockCheck.houseFlags(day, { entries }),
    ];
    places.push(day);
  }
  return { date, at: new Date().toISOString(), places };
}

app.post('/make-server-c2dd9b9d/cron/stock-check', async (c) => {
  const secret = Deno.env.get('CRON_SYNC_SECRET');
  if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const q = c.req.query('date') || '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : getTodayIST();
    const result = await runStockCheck(date);
    if (c.req.query('dry') === '1') return c.json(result);
    await kv.set(`stock-check:${date}`, result);
    const summary = result.places.map((p) => ({ place: p.name, since: p.since, flags: p.flags.map((f) => f.code) }));
    console.log(`Stock check ${date}:`, JSON.stringify(summary));
    return c.json({ success: true, date, places: summary });
  } catch (error: any) {
    console.error('Error running the stock check:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /stock-check?from=&to= - the owner: the saved nightly checks (up to 62 days).
app.get('/make-server-c2dd9b9d/stock-check', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  if (auth.user.user_metadata?.role !== 'cluster_head') return c.json({ error: 'Only the owner sees the stock check' }, 403);
  const today = getTodayIST();
  const to = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('to') || '') ? c.req.query('to')! : today;
  const from = /^\d{4}-\d{2}-\d{2}$/.test(c.req.query('from') || '') ? c.req.query('from')! : addDaysToDateString(to, -6);
  if (from > to || addDaysToDateString(from, 62) < to) return c.json({ error: 'Pick up to 62 days' }, 400);
  const dates: string[] = [];
  for (let d = from; d <= to; d = addDaysToDateString(d, 1)) dates.push(d);
  const days = (await kv.mget(dates.map((d) => `stock-check:${d}`))).filter(Boolean);
  return c.json({ from, to, days });
});

// ============================================
// LIVE ORDERS (owner, 31 Oct 2026: "Build 1, 2 and 3") - liveOrders.ts
// ============================================
// Ciferon's admin Live Status list (GET Api/OrderReport/GetLiveOrderDetail, the same admin login
// as OrderReport/Sale) every 3 minutes from 3 PM to 11:45 PM IST (pg_cron live-orders):
//   1. at 11:45 PM (live-orders-close, before Ciferon's 11:50 PM day close) each order seen open is
//      checked against the day's bills: never billed, billed for less, or still open -> the owner
//   2. an order open past its limit -> the store incharge (order_stuck, urgent: escalates)
//   3. GET /live-orders/now -> the "Right now" card on the owner's Home
// Saved per store and day as live-orders:{storeId}:{date} and live-orders-check:{storeId}:{date}.
const LIVE_FROM_MIN = 15 * 60;
const LIVE_TO_MIN = 23 * 60 + 45;
function istMinutesNow(): number {
  const now = getNowIST();
  return parseInt(now.substring(11, 13), 10) * 60 + parseInt(now.substring(14, 16), 10);
}

// Ciferon can hang (it did at midnight, while closing its day): no call waits longer than this.
const CIFERON_TIMEOUT_MS = 15 * 1000;
// One admin login kept while this server copy is warm (each poll would otherwise log in again).
let ciferonAdminSession: { authkey: string; at: number } | null = null;
async function ciferonAdminAuth(fresh = false): Promise<string> {
  if (!fresh && ciferonAdminSession && Date.now() - ciferonAdminSession.at < 20 * 60 * 1000) return ciferonAdminSession.authkey;
  const adminEmail = Deno.env.get('CIFERON_ADMIN_EMAIL');
  const adminPassword = Deno.env.get('CIFERON_ADMIN_PASSWORD');
  if (!adminEmail || !adminPassword) throw new Error('CIFERON_ADMIN_EMAIL/PASSWORD not configured');
  const loginRes = await fetch('https://api.ciferon.com/api/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ UserName: adminEmail, Password: adminPassword }),
    signal: AbortSignal.timeout(CIFERON_TIMEOUT_MS),
  }).catch((e) => { throw new Error(`Ciferon login: ${e?.message || e}`); });
  if (!loginRes.ok) throw new Error(`Ciferon login returned HTTP ${loginRes.status}`);
  const loginData = await loginRes.json();
  const authkey = loginData?.Result?.authkey || loginData?.Result?.AuthKey || loginData?.authkey || loginData?.AuthKey || loginData?.token || loginData?.Token;
  if (!authkey) throw new Error('Ciferon login did not return an authkey');
  const companyKey = await ciferonCompanyKey(authkey);
  ciferonAdminSession = { authkey: companyKey, at: Date.now() };
  return companyKey;
}

// After signing in, the admin panel picks the company (api/init/getcompanies, then SwitchCompany)
// and uses the key that hands back for everything. GetLiveOrderDetail, which names no store, hung
// with the plain login key (1 Nov 2026). The company is the one holding our Ciferon store.
async function ciferonCompanyKey(loginKey: string): Promise<string> {
  const get = (url: string) => fetch(url, {
    headers: { Authorization: `Bearer ${loginKey}`, BrandId: '0', Accept: 'application/json' },
    signal: AbortSignal.timeout(CIFERON_TIMEOUT_MS),
  }).catch((e) => { throw new Error(`${new URL(url).pathname}: ${e?.message || e}`); });
  const res = await get('https://api.ciferon.com/api/init/getcompanies');
  if (!res.ok) throw new Error(`getcompanies returned HTTP ${res.status}`);
  const companies: any[] = (await res.json())?.Result?.Companies || [];
  const ours = new Set((await liveStores()).map((st: any) => String(st.ciferonStoreId)));
  const company = companies.find((co) => (co?.StoreList || []).some((st: any) => ours.has(String(st?.StoreID)))) || companies[0];
  if (!company?.CompanyId) throw new Error('getcompanies: no company');
  const sw = await get(`https://api.ciferon.com/api/V2/InitApi/SwitchCompany?companyId=${encodeURIComponent(String(company.CompanyId))}`);
  if (!sw.ok) throw new Error(`SwitchCompany returned HTTP ${sw.status}`);
  const key = (await sw.json())?.Result?.AuthKey;
  if (!key) throw new Error('SwitchCompany did not return a key');
  return key;
}

async function ciferonAdminGet(store: any, url: string): Promise<any> {
  const call = async (authkey: string) => fetch(url, {
    headers: { Authorization: `Bearer ${authkey}`, StoreId: String(store.ciferonStoreId), BrandId: '0', Accept: 'application/json' },
    signal: AbortSignal.timeout(CIFERON_TIMEOUT_MS),
  }).catch((e) => { throw new Error(`${new URL(url).pathname}: ${e?.message || e}`); });
  let res = await call(await ciferonAdminAuth());
  if (res.status === 401 || res.status === 403) res = await call(await ciferonAdminAuth(true));
  if (!res.ok) throw new Error(`Ciferon returned HTTP ${res.status}`);
  const data = await res.json();
  if (!data?.IsSuccess) throw new Error('Ciferon responded with IsSuccess=false');
  return data;
}

// The day's bills (OrderReport/Sale, as Step D of runPosSync): only orders that weren't cancelled.
async function fetchBilledOrders(store: any, date: string): Promise<liveOrders.FinalOrder[]> {
  const day = new Date(`${date}T00:00:00Z`).toUTCString();
  const params = new URLSearchParams({
    StartDate: day, EndDate: day, ReportType: 'SaleReport', IsAllVisible: 'true', IsSplitPaymentMode: 'false', SaleOrderType: 'undefined',
    IsCancel: 'false', IsComplementary: 'false', IsPending: 'false', IsSettle: 'false', IsInit: 'false', PaymentModeIds: 'undefined',
    StoreIds: 'undefined', PaymentFilter: 'undefined', IsEdit: 'false', IsReprint: 'false', IsCustomerGst: 'false', IsDiscount: 'false',
    CompanyBrandId: '0', IsDeliveryApp: 'false', TerminalId: '0',
  });
  const data = await ciferonAdminGet(store, `https://api.ciferon.com/api/OrderReport/Sale?${params.toString()}`);
  const all = data.Result?.OrderList || [];
  const sameDay = all.filter((o: any) => { const d = getCiferonOrderEntryDateIST(o); return !d || d === date; });
  if (all.length > 0 && sameDay.length === 0) throw new Error(`OrderReport/Sale returned ${all.length} orders, none dated ${date}`);
  return sameDay.map((o: any) => ({
    orderId: o.OrderId ?? null, serialNo: o.SerialNo ?? null, externalId: o.ExternalId ?? null,
    grandTotal: Number(o.GrandTotal) || 0, orderType: o.SaleOrderType || null, entryDate: o.EntryDate || null,
  }));
}

const liveStores = async () => (await kv.getByPrefix('store:'))
  .filter((s: any) => s?.id && s.ciferonStoreId && s.status !== 'inactive' && s.status !== 'closed');

// Tells the store incharge (else the operations managers) about orders open too long, once each.
async function alertStuckOrders(store: any, date: string, stuck: liveOrders.SeenOrder[]): Promise<number> {
  const staff = (await staffForNotifications()).filter((u: any) => u.authUserId && u.status !== 'inactive');
  let to = staff.filter((u: any) => u.designation === 'store_incharge' && (u.storeId === store.id || (u.assignedStoreIds || []).includes(store.id)));
  if (!to.length) to = staff.filter((u: any) => u.role === 'manager' && !['store_incharge', 'production_incharge'].includes(u.designation));
  let sent = 0;
  for (const o of stuck) {
    const onceKey = `live-order-alert:${store.id}:${date}:${o.key}`;
    if (await kv.get(onceKey)) continue;
    const mins = liveOrders.ageMin(o, Date.now());
    const what = [`${liveOrders.typeWord(o.type)} order`, o.serial ? `#${o.serial}` : '', o.table ? `(table ${o.table})` : ''].filter(Boolean).join(' ');
    const title = `Order open ${mins} min: ${what}`;
    const items = liveOrders.itemsLine(o.items);
    const message = `${store.name}: ${what}, Rs ${Math.round(o.total)}, has been open in Ciferon for ${mins} minutes${items ? ` - ${items}` : ''}. If it has gone out, settle it in Ciferon; if it is still being made, hurry it along.`;
    for (const u of to) await notifyUser(u.authUserId, 'order_stuck', title, message, o.key, date).catch(() => undefined);
    await kv.set(onceKey, { at: new Date().toISOString(), mins, to: to.map((u: any) => u.id) });
    sent++;
  }
  return sent;
}

// One look at each store's open orders, added to the day. Only the cron's look sends alerts; the
// owner's pull down only refreshes the list.
async function pollLiveOrders(opts: { alert: boolean; storeIds?: string[] }) {
  const date = getTodayIST();
  const nowIso = new Date().toISOString();
  const results: any[] = [];
  for (const store of await liveStores()) {
    if (opts.storeIds && !opts.storeIds.includes(store.id)) continue;
    const key = `live-orders:${store.id}:${date}`;
    const prev = await kv.get(key) as liveOrders.LiveDay | null;
    try {
      const { orders, fields } = liveOrders.parseLive(await ciferonAdminGet(store, 'https://api.ciferon.com/Api/OrderReport/GetLiveOrderDetail'));
      const day = liveOrders.mergePoll(prev, { storeId: store.id, date }, orders, nowIso, fields);
      let alerted = 0;
      const settings = (await kv.get('live-orders:settings')) as { alerts?: boolean } | null;
      if (opts.alert && settings?.alerts !== false) {
        const stuck = liveOrders.stuckToAlert(day, Date.now());
        if (stuck.length) {
          alerted = await alertStuckOrders(store, date, stuck);
          for (const o of stuck) day.orders[o.key] = { ...day.orders[o.key], alertedAt: nowIso };
        }
      }
      await kv.set(key, day);
      const view = liveOrders.nowView(day, Date.now());
      results.push({ store: store.name, open: view.open, openTotal: view.openTotal, stuck: view.stuck, alerted });
    } catch (error: any) {
      await kv.set(key, { ...(prev || { storeId: store.id, date, orders: {}, lastPoll: null, polls: 0 }), error: error?.message || String(error) }).catch(() => undefined);
      results.push({ store: store.name, error: error?.message || String(error) });
    }
  }
  return results;
}

app.post('/make-server-c2dd9b9d/cron/live-orders', async (c) => {
  const secret = Deno.env.get('CRON_SYNC_SECRET');
  if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
  const minutes = istMinutesNow();
  if (c.req.query('force') !== '1' && (minutes < LIVE_FROM_MIN || minutes >= LIVE_TO_MIN)) return c.json({ success: true, skipped: true });
  try {
    return c.json({ success: true, stores: await pollLiveOrders({ alert: c.req.query('alert') !== '0' }) });
  } catch (error: any) {
    console.error('Error checking live orders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// 11:45 PM: a last look, then every order seen today against the day's bills. ?date= checks another
// day's saved orders; ?dry=1 neither saves nor tells anyone.
app.post('/make-server-c2dd9b9d/cron/live-orders-close', async (c) => {
  const secret = Deno.env.get('CRON_SYNC_SECRET');
  if (!secret || c.req.header('X-Cron-Secret') !== secret) return c.json({ error: 'Unauthorized' }, 401);
  try {
    const today = getTodayIST();
    const q = c.req.query('date') || '';
    const date = /^\d{4}-\d{2}-\d{2}$/.test(q) ? q : today;
    const dry = c.req.query('dry') === '1';
    if (date === today && !dry && !inPosQuietHours()) await pollLiveOrders({ alert: false });
    const nowIso = new Date().toISOString();
    const results: any[] = [];
    const owners = (await staffForNotifications()).filter((u: any) => u.role === 'cluster_head' && u.authUserId && u.status !== 'inactive');
    for (const store of await liveStores()) {
      const day = await kv.get(`live-orders:${store.id}:${date}`) as liveOrders.LiveDay | null;
      if (!day || !Object.keys(day.orders || {}).length) { results.push({ store: store.name, seen: 0 }); continue; }
      let check: liveOrders.CloseCheck;
      try {
        check = liveOrders.closeCheck(day, await fetchBilledOrders(store, date), nowIso);
      } catch (error: any) {
        results.push({ store: store.name, error: `Bills not read: ${error?.message || error}` });
        continue;
      }
      const s = liveOrders.checkSummary(check.findings);
      results.push({ store: store.name, seen: check.seen, matched: check.matched, bills: check.finals, ...s });
      if (dry) continue;
      await kv.set(`live-orders-check:${store.id}:${date}`, check);
      const onceKey = `live-orders-check-sent:${store.id}:${date}`;
      if (!check.findings.length || await kv.get(onceKey)) continue;
      const parts = [
        s.notBilled ? `${s.notBilled} order${s.notBilled > 1 ? 's were' : ' was'} open but never became a bill (Rs ${s.notBilledTotal})` : '',
        s.billedLess ? `${s.billedLess} ${s.billedLess > 1 ? 'were' : 'was'} billed Rs ${s.lessBy} less than ${s.billedLess > 1 ? 'they' : 'it'} came to` : '',
        s.openAtClose ? `${s.openAtClose} ${s.openAtClose > 1 ? 'are' : 'is'} still open in Ciferon (Rs ${s.openTotal})` : '',
      ].filter(Boolean);
      const message = `${store.name}, ${date}: ${parts.join(', ')}. Open Home > Right now to see which.`;
      for (const u of owners) await notifyUser(u.authUserId, 'orders_unbilled', `Orders to check: ${store.name}`, message, undefined, date).catch(() => undefined);
      await kv.set(onceKey, { at: nowIso, findings: check.findings.length });
    }
    console.log(`Live orders closing check ${date}:`, JSON.stringify(results));
    return c.json({ success: true, date, stores: results });
  } catch (error: any) {
    console.error('Error running the live orders closing check:', error);
    return c.json({ error: error.message }, 500);
  }
});

// GET /live-orders/now - the owner and operations managers: what is open now in each store, and the
// latest closing check (today's, else last night's). ?fresh=1 (a pull down) looks again when the last
// look is over a minute old.
app.get('/make-server-c2dd9b9d/live-orders/now', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) return c.json({ error: auth.error }, auth.status);
  const role = auth.user.user_metadata?.role;
  const designation = auth.user.user_metadata?.designation;
  const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
  if (role !== 'cluster_head' && !isOperationsManager) return c.json({ error: 'Only the owner and operations see live orders' }, 403);
  try {
    const date = getTodayIST();
    const minutes = istMinutesNow();
    const open = minutes >= LIVE_FROM_MIN && minutes < LIVE_TO_MIN;
    const stores = await liveStores();
    const keys = stores.map((s: any) => `live-orders:${s.id}:${date}`);
    if (c.req.query('fresh') === '1' && open) {
      const prev = await kv.mget(keys) as (liveOrders.LiveDay | null)[];
      const stale = stores.filter((_: any, i: number) => !prev[i]?.lastPoll || Date.now() - Date.parse(prev[i]!.lastPoll!) > 60 * 1000);
      if (stale.length) await pollLiveOrders({ alert: false, storeIds: stale.map((s: any) => s.id) }).catch(() => undefined);
    }
    const days = await kv.mget(keys) as (liveOrders.LiveDay | null)[];
    const yesterday = addDaysToDateString(date, -1);
    const checks = await kv.mget(stores.flatMap((s: any) => [`live-orders-check:${s.id}:${date}`, `live-orders-check:${s.id}:${yesterday}`])) as (liveOrders.CloseCheck | null)[];
    return c.json({
      date, open,
      stores: stores.map((s: any, i: number) => {
        const check = checks[2 * i] || checks[2 * i + 1] || null;
        return {
          storeId: s.id, storeName: s.name,
          ...liveOrders.nowView(days[i], Date.now()),
          error: days[i]?.error || null,
          check: check ? { ...check, summary: liveOrders.checkSummary(check.findings) } : null,
        };
      }),
    });
  } catch (error: any) {
    console.error('Error reading live orders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// ATTENDANCE (TIMESHEET) REMINDERS
// ============================================
// Checks each employee/manager for missing timesheet entries over the
// trailing 5 days (excluding today, since today isn't over yet) and sends
// a reminder notification (in-app + push) once per day if anything is
// missing. A day is NOT considered missing if the employee has an approved
// leave for that date, or if the date is before they joined.
app.post('/make-server-c2dd9b9d/send-attendance-reminders', async (c) => {
  try {
    console.log('=== ATTENDANCE REMINDER CHECK ===');
    const now = new Date();
    const today = now.toISOString().split('T')[0];

    // Trailing window: the 5 days before today (today itself is still in progress)
    const windowDates: string[] = [];
    for (let i = 1; i <= 5; i++) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      windowDates.push(d.toISOString().split('T')[0]);
    }

    const allEmployees = await kv.getByPrefix('unified-employee:');
    // Riders don't fill attendance, so they are never reminded about it.
    const attendees = allEmployees.filter((e: any) =>
      (e.role === 'employee' || e.role === 'manager') && e.employeeId && e.authUserId && e.designation !== 'rider'
    );

    console.log(`Checking attendance for ${attendees.length} employees/managers`);

    let sent = 0;
    let skippedAlreadyNotified = 0;
    let skippedComplete = 0;

    for (const employee of attendees) {
      // Ignore days before the employee joined
      const joiningDate = employee.joiningDate || '0000-00-00';
      const relevantDates = windowDates.filter(d => d >= joiningDate);
      if (relevantDates.length === 0) continue;

      // Paginated: one person's daily timesheets pass 1000 rows in under three years, and
      // a cut-off list would remind them about days they did fill in.
      const timesheets = await getAllByPrefixWithRetry(`timesheet:${employee.employeeId}:`);
      const filledDates = new Set(timesheets.map((t: any) => t.date));
      // A day with a check-in and check-out fills its own timesheet (punchTimesheet.ts) - the
      // shift clock catches up here on days it missed (the first run after it started did all five).
      for (const d of relevantDates.filter((d) => !filledDates.has(d))) {
        const punch: any = await kv.get(`punch:${employee.employeeId}:${d}`).catch(() => null);
        if (!punch?.in || !punch?.out) continue;
        await syncTimesheet(punchDeps, punch);
        if (await kv.get(`timesheet:${employee.employeeId}:${d}`)) filledDates.add(d);
      }

      const leaves = await getAllByPrefixWithRetry(`leave:${employee.employeeId}:`);
      const leaveDates = new Set(
        leaves.filter((l: any) => l.status === 'approved').map((l: any) => l.leaveDate)
      );

      const missingDates = relevantDates.filter(d => !filledDates.has(d) && !leaveDates.has(d));

      // Only when yesterday is missing: the same old days used to be asked about every morning for
      // five days, and the reminder was opened 15% of the time (owner, 30 Oct 2026).
      if (missingDates.length === 0 || !missingDates.includes(windowDates[0])) {
        skippedComplete++;
        continue;
      }

      // Only send one reminder per employee per day
      const dedupeKey = `attendance_reminder_sent:${employee.employeeId}:${today}`;
      const alreadySent = await kv.get(dedupeKey);
      if (alreadySent) {
        skippedAlreadyNotified++;
        continue;
      }

      missingDates.sort();
      const title = '⏰ Attendance Not Filled';
      const message = missingDates.length === 1
        ? `Hi ${employee.name}, you haven't filled your attendance/timesheet for ${missingDates[0]}. Please fill it as soon as possible.`
        : `Hi ${employee.name}, you haven't filled your attendance/timesheet for ${missingDates.length} days (${missingDates[0]} to ${missingDates[missingDates.length - 1]}). Please catch up as soon as possible.`;

      try {
        await notifyUser(employee.authUserId, 'attendance_reminder', title, message, undefined, today);
        await kv.set(dedupeKey, { sentAt: now.toISOString(), missingDates });
        sent++;
        console.log(`✓ Sent attendance reminder to ${employee.name} (${missingDates.length} day(s) missing)`);
      } catch (error) {
        console.error(`Error sending attendance reminder to ${employee.name}:`, error);
      }
    }

    console.log(`=== ATTENDANCE REMINDER SUMMARY: ${sent} sent, ${skippedComplete} complete, ${skippedAlreadyNotified} already notified today ===`);

    return c.json({
      success: true,
      message: 'Attendance reminders processed',
      summary: {
        totalChecked: attendees.length,
        remindersSent: sent,
        alreadyComplete: skippedComplete,
        alreadyNotifiedToday: skippedAlreadyNotified,
      },
    });
  } catch (error: any) {
    console.error('Error sending attendance reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// FULFILLMENT REMINDERS (Production Heads, 1PM)
// ============================================
// Reminds Production Heads about stock requests (raw stock, StockRequestManagement)
// and production requests (momo requests, ProductionRequests) that are still
// awaiting fulfillment/shipment. Stock requests are scoped to the Production Head's
// own production house; production requests aren't scoped by production house in
// the data model, so (matching how "New Production Request" already notifies
// everyone) all pending production requests are included for every Production Head.
app.post('/make-server-c2dd9b9d/send-fulfillment-reminders', async (c) => {
  try {
    console.log('=== FULFILLMENT REMINDER CHECK (1PM) ===');
    const today = new Date().toISOString().split('T')[0];

    const productionHeads = await getAllProductionHeads();

    const allStockRequests = await getAllByPrefixWithRetry('stock_request_');
    const pendingStockRequests = allStockRequests.filter((r: any) => r.status === 'pending');

    const notYetSentStatuses = ['pending', 'accepted', 'in-preparation', 'prepared'];
    const allProductionRequests = await kv.getByPrefix('production_request_');
    const pendingProductionRequests = allProductionRequests.filter((r: any) => notYetSentStatuses.includes(r.status));

    let sent = 0;
    let skipped = 0;

    for (const prodHead of productionHeads) {
      if (!prodHead.authUserId || !prodHead.employeeId) continue;

      const myStockRequests = pendingStockRequests.filter((r: any) => r.productionHouseId === prodHead.productionHouseId);
      const myProductionRequests = pendingProductionRequests;

      const totalPending = myStockRequests.length + myProductionRequests.length;
      if (totalPending === 0) {
        skipped++;
        continue;
      }

      const dedupeKey = `fulfillment_reminder_sent:${prodHead.employeeId}:${today}`;
      if (await kv.get(dedupeKey)) {
        skipped++;
        continue;
      }

      const parts: string[] = [];
      if (myStockRequests.length > 0) parts.push(`${myStockRequests.length} stock request${myStockRequests.length > 1 ? 's' : ''}`);
      if (myProductionRequests.length > 0) parts.push(`${myProductionRequests.length} production request${myProductionRequests.length > 1 ? 's' : ''}`);

      const message = `Hi ${prodHead.name}, you have ${parts.join(' and ')} awaiting fulfillment. Please send stock to the requesting store(s) as soon as possible.`;

      try {
        await notifyUser(prodHead.authUserId, 'fulfillment_reminder', '📦 Requests Awaiting Fulfillment', message, undefined, today);
        await kv.set(dedupeKey, {
          sentAt: new Date().toISOString(),
          stockRequestCount: myStockRequests.length,
          productionRequestCount: myProductionRequests.length,
        });
        sent++;
        console.log(`✓ Sent fulfillment reminder to ${prodHead.name} (${totalPending} pending)`);
      } catch (error) {
        console.error(`Error sending fulfillment reminder to ${prodHead.name}:`, error);
      }
    }

    console.log(`=== FULFILLMENT REMINDER SUMMARY: ${sent} sent, ${skipped} skipped ===`);

    return c.json({
      success: true,
      message: 'Fulfillment reminders processed',
      summary: { totalChecked: productionHeads.length, remindersSent: sent, skipped },
    });
  } catch (error: any) {
    console.error('Error sending fulfillment reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// STOCK/PRODUCTION REQUEST ACCEPTANCE ESCALATION (Production Heads, 12PM Noon)
// ============================================
// A store incharge's production request (e.g. Rohan requesting momos for his store)
// notifies every Production Head immediately on creation (see POST /production-requests
// above), but a request can still sit un-acted-on ('pending', not yet moved to
// 'accepted') if that notification gets missed. This escalates: any request still
// 'pending' by noon gets a second, more urgent nudge to whichever Production Head(s)
// are on record (Vijay, in the current single-production-house setup), once per head
// per day so it doesn't repeat every time the cron fires.
app.post('/make-server-c2dd9b9d/send-acceptance-reminders', async (c) => {
  try {
    console.log('=== ACCEPTANCE ESCALATION CHECK (12PM) ===');
    const today = getTodayIST();

    const allProductionRequests = await kv.getByPrefix('production_request_');
    const pendingRequests = allProductionRequests.filter((r: any) => r.status === 'pending');

    if (pendingRequests.length === 0) {
      console.log('No pending production requests - nothing to escalate');
      return c.json({ success: true, message: 'No pending requests awaiting acceptance', summary: { pendingCount: 0, remindersSent: 0 } });
    }

    const productionHeads = await getAllProductionHeads();
    let sent = 0;
    let skipped = 0;

    for (const prodHead of productionHeads) {
      if (!prodHead.authUserId || !prodHead.employeeId) continue;

      const dedupeKey = `acceptance_reminder_sent:${prodHead.employeeId}:${today}`;
      if (await kv.get(dedupeKey)) {
        skipped++;
        continue;
      }

      const storeNames = [...new Set(pendingRequests.map((r: any) => r.storeName).filter(Boolean))] as string[];
      const count = pendingRequests.length;
      const message = `Hi ${prodHead.name}, ${count} stock request${count > 1 ? 's' : ''} from ${storeNames.join(', ') || 'a store'} ${count > 1 ? 'are' : 'is'} still pending your acceptance as of noon. Please accept and start preparation as soon as possible.`;

      try {
        await notifyUser(prodHead.authUserId, 'acceptance_reminder', '⏰ Stock Requests Awaiting Acceptance', message, undefined, today);
        await kv.set(dedupeKey, { sentAt: new Date().toISOString(), pendingCount: count });
        sent++;
        console.log(`✓ Sent acceptance escalation to ${prodHead.name} (${count} pending)`);
      } catch (error) {
        console.error(`Error sending acceptance escalation to ${prodHead.name}:`, error);
      }
    }

    console.log(`=== ACCEPTANCE ESCALATION SUMMARY: ${sent} sent, ${skipped} skipped ===`);

    return c.json({
      success: true,
      message: 'Acceptance escalation reminders processed',
      summary: { pendingCount: pendingRequests.length, remindersSent: sent, skipped },
    });
  } catch (error: any) {
    console.error('Error sending acceptance escalation reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// MORNING REQUEST REMINDER (Production Heads, 9AM)
// ============================================
// A request placed before 9 AM IST deliberately doesn't ping the Production Head at
// creation time (see POST /production-requests above - no point waking someone up before
// the production house is even open). This is that deferred ping: whatever's still
// 'pending' once 9 AM arrives - whether placed overnight or simply not yet accepted - gets
// notified now. Distinct dedupe key from the noon escalation above so both can fire
// independently on the same day without one blocking the other.
app.post('/make-server-c2dd9b9d/send-morning-request-reminders', async (c) => {
  try {
    console.log('=== MORNING REQUEST REMINDER CHECK (9AM) ===');
    const today = getTodayIST();

    const allProductionRequests = await kv.getByPrefix('production_request_');
    const pendingRequests = allProductionRequests.filter((r: any) => r.status === 'pending');

    if (pendingRequests.length === 0) {
      console.log('No pending production requests this morning');
      return c.json({ success: true, message: 'No pending requests this morning', summary: { pendingCount: 0, remindersSent: 0 } });
    }

    const productionHeads = await getAllProductionHeads();
    let sent = 0;
    let skipped = 0;

    for (const prodHead of productionHeads) {
      if (!prodHead.authUserId || !prodHead.employeeId) continue;

      const dedupeKey = `morning_reminder_sent:${prodHead.employeeId}:${today}`;
      if (await kv.get(dedupeKey)) {
        skipped++;
        continue;
      }

      const storeNames = [...new Set(pendingRequests.map((r: any) => r.storeName).filter(Boolean))] as string[];
      const count = pendingRequests.length;
      const message = `Hi ${prodHead.name}, ${count} stock request${count > 1 ? 's' : ''} from ${storeNames.join(', ') || 'a store'} ${count > 1 ? 'are' : 'is'} awaiting your acceptance. Please accept and start preparation as soon as possible.`;

      try {
        await notifyUser(prodHead.authUserId, 'morning_request_reminder', '🌅 Stock Requests Awaiting Acceptance', message, undefined, today);
        await kv.set(dedupeKey, { sentAt: new Date().toISOString(), pendingCount: count });
        sent++;
        console.log(`✓ Sent morning reminder to ${prodHead.name} (${count} pending)`);
      } catch (error) {
        console.error(`Error sending morning reminder to ${prodHead.name}:`, error);
      }
    }

    console.log(`=== MORNING REQUEST REMINDER SUMMARY: ${sent} sent, ${skipped} skipped ===`);

    return c.json({
      success: true,
      message: 'Morning request reminders processed',
      summary: { pendingCount: pendingRequests.length, remindersSent: sent, skipped },
    });
  } catch (error: any) {
    console.error('Error sending morning request reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// DELIVERY CONFIRMATION REMINDER (Store Incharges, 10PM)
// ============================================
// A production request that's been 'shipped' still needs the receiving store to confirm
// it actually arrived (moves it to 'delivered'/'partially-delivered' - see PUT
// /production-requests/:id/status) - until then the store's stock figures don't reflect
// what's physically sitting there. This nudges whichever store incharge owns the request
// (Rohan, for the current single-store setup) once per store per day if anything shipped
// to them is still unconfirmed by 10 PM.
// 10 PM nudge to each production incharge whose day has no production entry yet - a quiet
// one-person reminder, 90 minutes before send-eod-data-alerts escalates the same gap to
// operations and cluster heads. Rides on the existing 10 PM delivery-reminder cron rather
// than a new cron job. Days 21-24 Oct went unlogged while stock was still being sent.
async function sendProductionLogReminders(today: string): Promise<number> {
  const allEmployees = await kv.getByPrefix('unified-employee:');
  const productionIncharges = allEmployees.filter((e: any) => e.designation === 'production_incharge' && e.status !== 'inactive');
  let sent = 0;
  for (const incharge of productionIncharges) {
    if (!incharge.authUserId || !incharge.employeeId) continue;
    const productionEntries = await kv.getByPrefix(`production:${incharge.authUserId}:`);
    if (productionEntries.some((e: any) => e.date === today)) continue;
    const dedupeKey = `production_log_reminder_sent:${incharge.employeeId}:${today}`;
    if (await kv.get(dedupeKey)) continue;
    try {
      await notifyUser(
        incharge.authUserId,
        'production_log_reminder',
        "Log today's production",
        `Hi ${incharge.name}, today's (${today}) production isn't in the app yet. Please enter the pieces made per batch before you leave - if nothing was made, save the day with 0.`,
        undefined,
        today
      );
      await kv.set(dedupeKey, { sentAt: new Date().toISOString() });
      sent++;
    } catch (error) {
      console.error(`Error sending production log reminder to ${incharge.name}:`, error);
    }
  }
  return sent;
}

app.post('/make-server-c2dd9b9d/send-delivery-confirmation-reminders', async (c) => {
  try {
    // 10 PM, and 9:30 AM with ?slot=am (owner, 29 Oct 2026: orders sat unreceived for days). Urgent
    // (notificationRules.ts): it gets through quiet hours and reaches the owner if not opened.
    const slot = c.req.query('slot') === 'am' ? 'am' : 'pm';
    console.log(`=== DELIVERY CONFIRMATION REMINDER CHECK (${slot === 'am' ? '9:30 AM' : '10 PM'}) ===`);
    const today = getTodayIST();

    const productionRemindersSent = slot === 'pm' ? await sendProductionLogReminders(today) : 0;

    const allProductionRequests = await kv.getByPrefix('production_request_');
    const istDay = (iso: any) => (iso && !Number.isNaN(Date.parse(iso)) ? new Date(Date.parse(iso) + 330 * 60000).toISOString().slice(0, 10) : '');
    // Sent and not received (in the morning: sent before today), and deliveries marked received
    // for the store that the incharge hasn't confirmed yet.
    const shippedRequests = allProductionRequests.filter((r: any) =>
      ((r.status === 'shipped' || r.status === 'partially-shipped') && (slot === 'pm' || istDay(r.shippedAt) < today)) || r.receiptConfirm?.pending);

    if (shippedRequests.length === 0) {
      console.log('No shipped-but-unconfirmed requests tonight');
      return c.json({ success: true, message: 'No shipped requests awaiting delivery confirmation', summary: { shippedCount: 0, remindersSent: 0, productionRemindersSent } });
    }

    const byStore = new Map<string, any[]>();
    for (const req of shippedRequests) {
      if (!req.storeId) continue;
      if (!byStore.has(req.storeId)) byStore.set(req.storeId, []);
      byStore.get(req.storeId)!.push(req);
    }

    let sent = 0;
    let skipped = 0;

    for (const [storeId, requests] of byStore) {
      const storeIncharge = await getStoreIncharge(storeId);
      if (!storeIncharge?.authUserId || !storeIncharge?.employeeId) continue;

      const dedupeKey = `delivery_reminder_sent:${storeIncharge.employeeId}:${today}${slot === 'am' ? ':am' : ''}`;
      if (await kv.get(dedupeKey)) {
        skipped++;
        continue;
      }

      const count = requests.length;
      const dayWord = (d: string) => (d ? new Date(`${d}T00:00:00Z`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'UTC' }) : '');
      const lines = requests
        .sort((a: any, b: any) => String(a.requestDate).localeCompare(String(b.requestDate)))
        .map((r: any) => (r.receiptConfirm?.pending ? `${dayWord(r.requestDate)} order: check what came` : `${dayWord(r.requestDate)} order: sent ${dayWord(istDay(r.shippedAt))}, not received`));
      const title = count === 1 ? (requests[0].receiptConfirm?.pending ? 'Confirm a delivery' : 'Receive a delivery') : `${count} deliveries to receive or confirm`;
      const message = `${lines.join('; ')}. Tap each one on Home - the store's stock is wrong until you do.`;

      try {
        await notifyUser(storeIncharge.authUserId, 'delivery_confirmation_reminder', title, message, undefined, today);
        await kv.set(dedupeKey, { sentAt: new Date().toISOString(), shippedCount: count });
        sent++;
        console.log(`✓ Sent delivery confirmation reminder to ${storeIncharge.name} (${count} shipped)`);
      } catch (error) {
        console.error(`Error sending delivery confirmation reminder to ${storeIncharge.name}:`, error);
      }
    }

    console.log(`=== DELIVERY CONFIRMATION REMINDER SUMMARY: ${sent} sent, ${skipped} skipped ===`);

    return c.json({
      success: true,
      message: 'Delivery confirmation reminders processed',
      summary: { shippedCount: shippedRequests.length, remindersSent: sent, skipped, productionRemindersSent },
    });
  } catch (error: any) {
    console.error('Error sending delivery confirmation reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// ONE-HOUR-AFTER-SHIPPED DELIVERY CHECK
// ============================================
// Runs every ~15 min (see cron migration). One hour after a request is marked shipped,
// asks the store incharge "has this arrived?" with a one-tap Delivered button right on
// the notification - no need to open the app. Separate from the 10PM catch-all reminder
// above: this one fires fast, per-request, and can resolve the request by itself.
app.post('/make-server-c2dd9b9d/send-shipped-delivery-check', async (c) => {
  try {
    console.log('=== ONE-HOUR SHIPPED DELIVERY CHECK ===');
    const nowMs = Date.now();
    const ONE_HOUR_MS = 60 * 60 * 1000;

    const allProductionRequests = await kv.getByPrefix('production_request_');
    const dueRequests = allProductionRequests.filter((r: any) =>
      (r.status === 'shipped' || r.status === 'partially-shipped') &&
      r.shippedAt &&
      !r.oneHourDeliveryCheckSentAt &&
      (nowMs - new Date(r.shippedAt).getTime()) >= ONE_HOUR_MS
    );

    if (dueRequests.length === 0) {
      console.log('No shipped requests have crossed the 1-hour mark');
      return c.json({ success: true, message: 'Nothing due', summary: { sent: 0 } });
    }

    let sent = 0;
    let skipped = 0;

    for (const req of dueRequests) {
      const storeIncharge = req.storeId ? await getStoreIncharge(req.storeId) : null;
      if (!storeIncharge?.authUserId) {
        skipped++;
        continue;
      }

      try {
        await notifyUser(
          storeIncharge.authUserId,
          'shipped_delivery_check',
          '📦 Has this arrived?',
          `It's been an hour since ${req.storeName || 'your'} shipment left the production house. Tap Delivered below once it's arrived - no need to open the app.`,
          req.id,
          req.requestDate,
          { recordType: 'production_request', recordId: req.id }
        );
        await kv.set(`production_request_${req.id}`, { ...req, oneHourDeliveryCheckSentAt: new Date().toISOString() });
        sent++;
        console.log(`✓ Sent 1-hour delivery check to ${storeIncharge.name} for request ${req.id}`);
      } catch (error) {
        console.error(`Error sending 1-hour delivery check for request ${req.id}:`, error);
      }
    }

    console.log(`=== 1-HOUR DELIVERY CHECK SUMMARY: ${sent} sent, ${skipped} skipped ===`);

    return c.json({ success: true, message: '1-hour delivery checks processed', summary: { due: dueRequests.length, sent, skipped } });
  } catch (error: any) {
    console.error('Error sending 1-hour delivery checks:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// DAILY DATA ENTRY REMINDERS (Operations Managers, 8PM)
// ============================================
// Reminds Operations Managers who haven't logged inventory and/or sales data
// for today yet. Fires once per person per day.
app.post('/make-server-c2dd9b9d/send-data-entry-reminders', async (c) => {
  try {
    console.log('=== DATA ENTRY REMINDER CHECK (8PM) ===');
    const today = new Date().toISOString().split('T')[0];

    const operationsManagers = await getOperationsManagers();

    let sent = 0;
    let skipped = 0;

    for (const manager of operationsManagers) {
      if (!manager.authUserId) continue;

      const inventoryEntries = await kv.getByPrefix(`inventory:${manager.authUserId}:`);
      const hasInventoryToday = inventoryEntries.some((e: any) => e.date === today);

      const salesEntries = await getAllByPrefixWithRetry(`sales:${manager.authUserId}:`);
      const hasSalesToday = salesEntries.some((e: any) => e.date === today);

      if (hasInventoryToday && hasSalesToday) {
        skipped++;
        continue;
      }

      const dedupeKey = `data_entry_reminder_sent:${manager.authUserId}:${today}`;
      if (await kv.get(dedupeKey)) {
        skipped++;
        continue;
      }

      const missing: string[] = [];
      if (!hasInventoryToday) missing.push('inventory data');
      if (!hasSalesToday) missing.push('sales data');

      const message = `Hi ${manager.name}, you haven't logged ${missing.join(' or ')} for today (${today}). Please update it before the day ends.`;

      try {
        await notifyUser(manager.authUserId, 'data_entry_reminder', '📝 Daily Update Reminder', message, undefined, today);
        await kv.set(dedupeKey, { sentAt: new Date().toISOString(), missing });
        sent++;
        console.log(`✓ Sent data entry reminder to ${manager.name} (missing: ${missing.join(', ')})`);
      } catch (error) {
        console.error(`Error sending data entry reminder to ${manager.name}:`, error);
      }
    }

    console.log(`=== DATA ENTRY REMINDER SUMMARY: ${sent} sent, ${skipped} skipped ===`);

    return c.json({
      success: true,
      message: 'Data entry reminders processed',
      summary: { totalChecked: operationsManagers.length, remindersSent: sent, skipped },
    });
  } catch (error: any) {
    console.error('Error sending data entry reminders:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// END-OF-DAY HIGH ALERT (Store/Production Incharges, 11:30PM)
// ============================================
// A much harder deadline than the 8PM data-entry reminder above (which is aimed at
// Operations Managers and deliberately excludes store/production incharges - see
// getOperationsManagers). This checks the incharges themselves: if a store incharge
// (Rohan) hasn't logged today's sales, or a production incharge (Vijay) hasn't logged
// today's production, by 11:30 PM there's no more time left in the day to fix it - so
// this escalates past just the incharge, to Operations Heads and Cluster Heads too
// (Aniket, Subham), rather than a quiet one-person nudge. Fires once per incharge per day.
// Weekly nudge to count the real Paytm/bank balance and recalibrate. The app's Paytm
// balance is a running calculation from the last physical count, so any payment or receipt
// that never gets logged (found 2026-10-16: a month of drift, Rs.5,173, from unlogged
// transfers and Zomato payouts that were never uploaded) silently accumulates until
// someone checks. A regular count caps that drift at one week. Skipped when a
// recalibration already happened within the last 6 days, so it never nags right after one.
// Cron-secret protected like the other cron-only routes.
app.post('/make-server-c2dd9b9d/cron/weekly-paytm-recalibration-reminder', async (c) => {
  const cronSecret = c.req.header('X-Cron-Secret');
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  try {
    const today = getTodayIST();
    const stores = await kv.getByPrefix('store:');
    const recalibrations = await getAllByPrefixWithRetry('online-cash-recalibration:');
    const clusterHeads = await getAllClusterHeads();
    let sent = 0;

    for (const store of stores) {
      const storeRecals = recalibrations.filter((r: any) => r.storeId === store.id && r.date);
      const lastDate = storeRecals.map((r: any) => r.date as string).sort().pop() || null;
      const daysSince = lastDate
        ? Math.round((new Date(`${today}T00:00:00Z`).getTime() - new Date(`${lastDate}T00:00:00Z`).getTime()) / 86400000)
        : null;
      if (daysSince !== null && daysSince < 6) continue;

      // Only stores that actually trade - an inactive/sandbox store has nothing to count.
      const hasRecentSales = (await getAllByPrefixWithRetry('sales:')).some((s: any) =>
        s.storeId === store.id && s.date && s.date >= addDaysToDateString(today, -7)
      );
      if (!hasRecentSales) continue;

      const since = lastDate ? `Last recalibrated ${daysSince} days ago (${lastDate}).` : 'It has never been recalibrated.';
      for (const clusterHead of clusterHeads) {
        if (!clusterHead.authUserId) continue;
        await notifyUser(
          clusterHead.authUserId,
          'paytm_recalibration_reminder',
          'Weekly Paytm check',
          `${store.name}: please check your actual Paytm/bank balance and recalibrate if it differs from the app. ${since}`,
          store.id,
          today
        );
        sent++;
      }
    }

    return c.json({ success: true, sent });
  } catch (error: any) {
    console.log('Error sending weekly Paytm recalibration reminder:', error);
    return c.json({ error: 'Failed to send reminder' }, 500);
  }
});

app.post('/make-server-c2dd9b9d/send-eod-data-alerts', async (c) => {
  try {
    console.log('=== END-OF-DAY DATA ALERT CHECK (11:30PM) ===');
    const today = getTodayIST();

    const allEmployees = await kv.getByPrefix('unified-employee:');
    const storeIncharges = allEmployees.filter((e: any) => e.designation === 'store_incharge');
    const productionIncharges = allEmployees.filter((e: any) => e.designation === 'production_incharge');
    const opsManagers = await getOperationsManagers();
    const clusterHeads = await getAllClusterHeads();

    let sent = 0;
    let skipped = 0;

    const raiseAlert = async (incharge: any, dataLabel: string) => {
      const dedupeKey = `eod_alert_sent:${incharge.employeeId}:${today}`;
      if (await kv.get(dedupeKey)) {
        skipped++;
        return;
      }

      const message = `HIGH ALERT: ${incharge.name} (${incharge.employeeId}) has not logged today's (${today}) ${dataLabel} data, even at 11:30 PM. Please follow up immediately.`;

      // Dedupe recipients by authUserId - the incharge, every Operations Head, and every
      // Cluster Head, but only once each even if a name happens to appear in more than
      // one of those groups.
      const recipients = new Map<string, any>();
      for (const person of [incharge, ...opsManagers, ...clusterHeads]) {
        if (person?.authUserId) recipients.set(person.authUserId, person);
      }

      for (const recipient of recipients.values()) {
        try {
          await notifyUser(
            recipient.authUserId,
            'eod_data_alert',
            `🚨 High Alert: ${dataLabel === 'sales' ? 'Sales' : 'Production'} Data Not Updated`,
            message,
            undefined,
            today
          );
        } catch (error) {
          console.error(`Error sending EOD alert to ${recipient.name || recipient.authUserId}:`, error);
        }
      }

      await kv.set(dedupeKey, { sentAt: new Date().toISOString(), dataLabel });
      sent++;
      console.log(`✓ Sent EOD high alert for ${incharge.name} (missing ${dataLabel}) to ${recipients.size} recipient(s)`);
    };

    for (const incharge of storeIncharges) {
      if (!incharge.authUserId || !incharge.employeeId) continue;
      const salesEntries = await getAllByPrefixWithRetry(`sales:${incharge.authUserId}:`);
      const hasSalesToday = salesEntries.some((e: any) => e.date === today);
      if (hasSalesToday) {
        skipped++;
        continue;
      }
      await raiseAlert(incharge, 'sales');
    }

    for (const incharge of productionIncharges) {
      if (!incharge.authUserId || !incharge.employeeId) continue;
      const productionEntries = await kv.getByPrefix(`production:${incharge.authUserId}:`);
      const hasProductionToday = productionEntries.some((e: any) => e.date === today);
      if (hasProductionToday) {
        skipped++;
        continue;
      }
      await raiseAlert(incharge, 'production');
    }

    console.log(`=== END-OF-DAY DATA ALERT SUMMARY: ${sent} sent, ${skipped} skipped ===`);

    return c.json({
      success: true,
      message: 'End-of-day data alerts processed',
      summary: { totalChecked: storeIncharges.length + productionIncharges.length, alertsSent: sent, skipped },
    });
  } catch (error: any) {
    console.error('Error sending end-of-day data alerts:', error);
    return c.json({ error: error.message }, 500);
  }
});

// ============================================
// POS NIGHTLY AUTO-SYNC (Ciferon)
// ============================================
// Runs nightly via pg_cron at 10:30 PM IST (17:00 UTC) - see
// supabase/migrations/20260728000000_pos_nightly_sync_cron.sql. No user session exists at
// cron time, so this route is gated by a shared secret header instead of verifyUser,
// matching the reminder-job routes above but with an added secret check since this route
// writes financial/stock data rather than just sending notifications.
//
// Two independent steps per store (each isolated so one failing doesn't block the other):
//   Step A (reliable): official SaleDetails API -> cash/paytm/zomato/swiggy totals for the
//     day, written into that day's sales: record (posOnlineSales/posOfflineSales/
//     cashAmount/paytmAmount) and online_sales: record (swiggySales/zomatoSales).
//   Step B (fragile): undocumented OrderReport/v2/SaleCount endpoint, which needs a live
//     admin-panel login (no long-lived key exists for item-wise data - confirmed by
//     testing the integration key against it directly, which fails) - item-wise sold
//     quantities classified into the 7 finished-product categories and written as a
//     SalesDataRecord via the same path manual sales-sheet uploads use, so
//     ProductionRequests.tsx's Opening+Received-Sold reconciliation picks it up unchanged.
// Shared sync logic - called by both the cron-secret-gated nightly route and the
// verifyUser-gated manual "Sync Now" button, so there is exactly one implementation.
// All stores open at 3 PM IST - syncing "today" before then would either return nothing
// or (worse) a handful of pre-opening test/staging orders that read as confusing partial
// sales, so the whole run is skipped rather than writing a misleading record for the day.
const STORE_OPENING_HOUR_IST = 15;

// Ciferon is still closing the day between 11:50 PM and 6:10 AM IST and hands back wrong or
// previous-day figures (the 25 Oct 2026 copy of 24 Oct was saved by a 1:09 AM re-sync), so no
// sync of any kind - nightly, Sync Now, past-day or bulk re-sync - runs in that window (owner,
// 27 Oct 2026). The nightly cron fires at 10:30 PM and again at 11 PM for last-minute sales
// (pg_cron pos-nightly-sync and pos-late-sync), both outside it.
const POS_SYNC_LAST_START_KEY = 'pos-sync:last-start';
// A pull down on the screen syncs too (owner, 31 Oct 2026); one within this long of the last sync
// is skipped and the phone just reloads what that sync brought in.
const PULL_SYNC_GAP_MS = 2 * 60 * 1000;
const POS_QUIET_START_MIN_IST = 23 * 60 + 50;
const POS_QUIET_END_MIN_IST = 6 * 60 + 10;
function inPosQuietHours(): boolean {
  const now = getNowIST();
  const minutes = parseInt(now.substring(11, 13), 10) * 60 + parseInt(now.substring(14, 16), 10);
  return minutes >= POS_QUIET_START_MIN_IST || minutes < POS_QUIET_END_MIN_IST;
}

// targetDate lets a cluster head backfill-correct a past day's already-closed sales record
// (e.g. one written before the offlineSales staleness fix) by re-pulling that day's real
// SaleDetails from Ciferon. Only Step A (cash/Paytm/online totals) runs for a backfill -
// Step B (item-wise stock) and Step C (low-stock alert) are "tonight" side effects that
// don't make sense to redo for a day that's already closed and reconciled elsewhere.
async function runPosSync(targetDate?: string) {
  const isBackfill = !!targetDate && targetDate !== getTodayIST();
  const today = targetDate || getTodayIST();
  const todayRfc1123 = new Date(`${today}T00:00:00Z`).toUTCString();
  const results: any[] = [];

  if (inPosQuietHours()) {
    const message = 'Ciferon shows unreliable figures between 11:50 PM and 6:10 AM, so syncing is paused then. Please try again after 6:10 AM.';
    return { success: false, skipped: true, status: 423, date: today, error: message, message, results };
  }

  if (!isBackfill && getHourIST() < STORE_OPENING_HOUR_IST) {
    return { success: true, skipped: true, date: today, message: `Skipped - stores haven't opened yet (before ${STORE_OPENING_HOUR_IST}:00 IST)`, results };
  }
  // When today's last sync started: a pull down on the phone skips a sync this recent (trigger route).
  if (!isBackfill) await kv.set(POS_SYNC_LAST_START_KEY, { at: new Date().toISOString() }).catch(() => undefined);

  try {
    const allStores = await kv.getByPrefix('store:');
    const storesWithCiferon = (allStores || []).filter((s: any) => s.ciferonStoreId);

    for (const store of storesWithCiferon) {
      const storeResult: any = { storeId: store.id, storeName: store.name, date: today };

      // ---- Step A: reliable cash/online sync via SaleDetails ----
      try {
        const apiKey = Deno.env.get('CIFERON_API_KEY');
        if (!apiKey) throw new Error('CIFERON_API_KEY not configured');

        const saleDetailsRes = await fetch('https://api.ciferon.com/api/LoginApi/SaleDetails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${apiKey}`,
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ StartDate: today, EndDate: today })
        });

        if (!saleDetailsRes.ok) {
          throw new Error(`SaleDetails returned HTTP ${saleDetailsRes.status}`);
        }
        const saleDetailsData = await saleDetailsRes.json();
        if (!saleDetailsData.IsSuccess) {
          throw new Error('SaleDetails responded with IsSuccess=false');
        }

        const allOrders = saleDetailsData.Result?.orderList || [];
        // Exclude cancelled orders - Ciferon still returns them in the day's orderList with
        // their original BillAmount, which would otherwise inflate every total below.
        //
        // Also exclude anything whose real TransactionTime isn't actually `today` - Ciferon's
        // SaleDetails endpoint doesn't reliably honor EndDate for the most recent day: a
        // request for {StartDate: today, EndDate: today} was confirmed (via the raw response)
        // to also include orders from the following day up through the moment of the request,
        // which silently inflated "today"'s totals with tomorrow's not-yet-closed sales. Since
        // each order carries its own TransactionTime, filtering on that directly is a safe fix
        // regardless of whatever Ciferon's date-range filter is actually doing server-side.
        // Only orders whose real TransactionTime falls on `today` (see note above) - this
        // pre-filter set (todaysOrders) still includes cancelled orders, since discount and
        // cancellation stats need to be reported for the day regardless of settlement status.
        const todaysOrders = allOrders.filter((order: any) => getCiferonOrderDate(order) === today);
        const isOnlineMode = (mode: string) => mode === 'Zomato' || mode === 'Swiggy';

        const orders = todaysOrders.filter((order: any) => !(order.TransactionStatus || '').toLowerCase().includes('cancel'));
        let cashTotal = 0, paytmTotal = 0, zomatoTotal = 0, swiggyTotal = 0;
        let offlineDiscount = 0, onlineDiscount = 0;
        // Financially, Paytm/PhonePe/Card/Google Pay/Razorpay are still all deliberately
        // folded into one "Paytm" bucket above (nothing is missing from reconciliation) -
        // this just ALSO keeps the raw per-mode split for insight purposes, e.g. seeing
        // how much volume actually goes through Card/GPay vs Paytm within that bucket.
        const paymentModeBreakdown: Record<string, number> = {};
        let complimentaryCount = 0, complimentaryAmount = 0;
        for (const order of orders) {
          const mode = (order.PaymentMode && order.PaymentMode[0]) || 'Unknown';
          const amount = order.BillAmount || 0;
          const discount = order.DiscountAmount || 0;
          paymentModeBreakdown[mode] = (paymentModeBreakdown[mode] || 0) + amount;
          if (order.IsComplimentary) {
            // CONFIRMED BUG (found 2026-09-14): a complimentary/free order collects no real
            // cash or Paytm, but Ciferon still tags it with SOME PaymentMode (often blank,
            // which the fallback above turns into 'Unknown') - and 'Unknown' fell into the
            // catch-all "else" branch below, silently added to paytmTotal as if it were a
            // real digital payment. That inflated posOfflineSales/offlineSales by the comp
            // amount, which then always came up short against the store incharge's actual
            // cash+Paytm count - a real, recurring mismatch, not a counting mistake. Comp
            // orders are tallied separately (complimentaryCount/Amount) and must NOT touch
            // any of the real collectible totals below.
            complimentaryCount++;
            complimentaryAmount += amount;
            continue;
          }
          if (mode === 'Cash') { cashTotal += amount; offlineDiscount += discount; }
          else if (mode === 'Zomato') { zomatoTotal += amount; onlineDiscount += discount; }
          else if (mode === 'Swiggy') { swiggyTotal += amount; onlineDiscount += discount; }
          else { paytmTotal += amount; offlineDiscount += discount; } // Paytm/PhonePe/Card/Google Pay/Razorpay - all digital counter payments
        }

        // Cancelled orders, split the same way, so the day's cancellation impact is visible
        // per offline/online instead of just silently dropped from every total.
        const cancelledOrders = todaysOrders.filter((order: any) => (order.TransactionStatus || '').toLowerCase().includes('cancel'));
        let offlineCancelledAmount = 0, offlineCancelledCount = 0, onlineCancelledAmount = 0, onlineCancelledCount = 0;
        for (const order of cancelledOrders) {
          const mode = (order.PaymentMode && order.PaymentMode[0]) || 'Unknown';
          const amount = order.BillAmount || 0;
          if (isOnlineMode(mode)) { onlineCancelledAmount += amount; onlineCancelledCount++; }
          else { offlineCancelledAmount += amount; offlineCancelledCount++; }
        }

        const posOfflineSales = cashTotal + paytmTotal;
        const posOnlineSales = zomatoTotal + swiggyTotal;

        const storeIncharge = await getStoreIncharge(store.id);
        if (!storeIncharge || !storeIncharge.authUserId) {
          throw new Error('No store incharge with an auth account found for this store');
        }
        const userId = storeIncharge.authUserId;

        const allSales = await getAllByPrefixWithRetry('sales:');
        const existingSale = (allSales || []).find((s: any) => s.storeId === store.id && s.date === today);
        const fetchedSalesTotal = posOfflineSales + posOnlineSales;
        const existingSalesTotal = getExistingSalesAmountTotal(existingSale);
        const shouldSkipZeroOverwrite = !!existingSale && fetchedSalesTotal <= 0 && existingSalesTotal > 0;

        // Carry forward yesterday's real actual cash-in-hand instead of hardcoding 0 below -
        // otherwise the store incharge's own form later pre-fills previousCashInHand from
        // this placeholder's stale 0 instead of the real balance, and the cluster head's
        // read-only view shows a nonsense "previous day's cash ₹0" until the incharge
        // manually reconciles and overwrites it.
        const yesterday = new Date(`${today}T00:00:00Z`);
        yesterday.setUTCDate(yesterday.getUTCDate() - 1);
        const yesterdayStr = yesterday.toISOString().substring(0, 10);
        const yesterdaySale = (allSales || []).find((s: any) => s.storeId === store.id && s.date === yesterdayStr);
        const carriedPreviousCashInHand = yesterdaySale?.actualCashInHand ?? 0;

        if (shouldSkipZeroOverwrite) {
          storeResult.stepA = {
            success: true,
            skipped: true,
            reason: 'Skipped zero POS result to avoid overwriting an existing non-zero sales row',
            cashTotal,
            paytmTotal,
            zomatoTotal,
            swiggyTotal,
            orderCount: orders.length,
            rawOrderCount: allOrders.length,
            datedOrderCount: todaysOrders.length
          };
        } else if (existingSale) {
          const key = `sales:${existingSale.userId}:${existingSale.id}`;
          // CONFIRMED BUG (found 2026-09-14): once the store incharge has entered/saved
          // their OWN Cash/Paytm split, that split is the ground truth - Ciferon's
          // per-order PaymentMode tagging is genuinely unreliable during a rush (a busy
          // counter routinely mis-keys Cash vs Card/Paytm on the POS terminal). Every
          // resync of this same day (the nightly cron re-running after the incharge has
          // already reconciled, a manual "Sync Now", a delayed Ciferon finalization)
          // was unconditionally overwriting cashAmount/paytmAmount with fresh
          // cashTotal/paytmTotal, silently discarding an honest physical count in favor
          // of Ciferon's own mis-tagged split. The TOTAL (offlineSales, built from real
          // bill amounts, not payment-mode tags) is still reliable and must stay synced;
          // only the CASH/PAYTM SPLIT is protected once a human has set it. If the
          // corrected total no longer matches the preserved split, the existing "Cash +
          // Paytm is short/over Net offline sales" warning surfaces that for a human to
          // resolve - exactly what it's for, instead of the system quietly overwriting
          // what was actually counted.
          const hasHumanSplit = !!existingSale.createdBy && existingSale.createdBy !== 'pos-sync';
          await kv.set(key, {
            ...existingSale,
            offlineSales: posOfflineSales, // BUG FIX: this was left stale on re-sync, only cashAmount/paytmAmount updated
            ...(hasHumanSplit ? {} : { cashAmount: cashTotal, paytmAmount: paytmTotal }),
            // Stamped on every pos-sync write only (never touched by the store incharge's own
            // save, which merges via PUT /sales/:id and so leaves this alone) - lets the UI
            // show "last synced" without guessing from approvedAt/createdAt, which reflect
            // human review, not Ciferon sync freshness.
            syncedAt: getNowIST(),
            posOnlineSales,
            posOfflineSales,
            offlineDiscount,
            onlineDiscount,
            offlineCancelledAmount,
            offlineCancelledCount,
            onlineCancelledAmount,
            onlineCancelledCount,
            paymentModeBreakdown,
            complimentaryCount,
            complimentaryAmount
          });
          // Re-run the Paytm cascade only when this write actually moved the day's Paytm
          // takings (a placeholder or POS-only row getting fresh figures). A counted day keeps
          // its human split, so its Paytm is unchanged - and recomputing from an old date
          // rewrites every saved balance after it up to the next recalibration: the 27 Oct
          // 2026 re-sync of 17 Jan replaced 227 days of saved balances, many typed in after
          // checking the Paytm app, with a chain that ran to -₹1.8 lakh (restored from
          // backup:paytm-balances-before-resync:2026-10-27).
          const paytmMoved = !hasHumanSplit && Math.abs((Number(existingSale.paytmAmount) || 0) - paytmTotal) > 0.005;
          if (paytmMoved && existingSale.storeId && existingSale.date) {
            await cascadeRecomputePaytmBalances(existingSale.storeId, existingSale.date);
          }
        } else {
          // CONFIRMED BUG (found 2026-08-29): a random itemId here means two near-simultaneous
          // runPosSync invocations (e.g. the scheduled cron overlapping a manual "Sync Now"
          // click) can both run the read-then-check above, both see no existing record for
          // (store, today), and both create their own separate sales: record - a real
          // duplicate found 289ms apart, each internally correct but disagreeing with each
          // other on actualPaytmBalance, and nothing downstream (previousPaytm chaining,
          // revenue totals, item breakdowns) has any way to know which one is "the" record for
          // that day. A deterministic itemId makes two concurrent creates collide on the same
          // KV key instead of becoming siblings - the second write just overwrites the first
          // with equivalent data, so this is safe with no locking needed. Keyed by store too,
          // not just date, since two stores can share the same storeIncharge/userId.
          const itemId = `pos-sync-${store.id}-${today}`;
          const key = `sales:${userId}:${itemId}`;
          await kv.set(key, {
            id: itemId,
            userId,
            storeId: store.id,
            date: today,
            offlineSales: posOfflineSales,
            paytmAmount: paytmTotal,
            cashAmount: cashTotal,
            onlineSales: 0,
            onlineSalesCommission: 0,
            employeeSalary: 0,
            posOnlineSales,
            posOfflineSales,
            offlineDiscount,
            onlineDiscount,
            offlineCancelledAmount,
            offlineCancelledCount,
            onlineCancelledAmount,
            onlineCancelledCount,
            paymentModeBreakdown,
            complimentaryCount,
            complimentaryAmount,
            approvalStatus: 'pending',
            // null = not counted yet. 0 here used to be read as a real count everywhere that
            // looks back for the last count (Paytm carry-forward, the cascade's anchor, the
            // "store cash is ₹0, use production's" prompt on every bill) - see
            // countedCashInHand / knownPaytmBalance in paytmRules.ts.
            actualCashInHand: null,
            cashOffset: 0,
            approvalRequired: false,
            approvedBy: null,
            approvedAt: null,
            approvalRequested: false,
            approvalRequestedAt: null,
            requestedCashInHand: null,
            requestedOffset: null,
            rejectedBy: null,
            rejectedAt: null,
            rejectionReason: null,
            previousCashInHand: carriedPreviousCashInHand,
            usedOnlineMoney: 0,
            actualPaytmBalance: null,
            paytmOffset: 0,
            createdBy: 'pos-sync',
            createdByName: 'Ciferon POS Auto-Sync',
            syncedAt: getNowIST(),
          });
          // Works out the new row's closing Paytm balance (today's POS Paytm takings now count).
          await cascadeRecomputePaytmBalances(store.id, today);
        }

        // Upsert online_sales: record (Zomato/Swiggy split), same as the manual OnlineSalesTab entry
        const allOnlineSales = await getAllByPrefixWithRetry('online_sales:');
        const existingOnlineSales = (allOnlineSales || []).find((s: any) => s.storeId === store.id && s.date === today);
        const existingOnlineSalesTotal = (existingOnlineSales?.swiggySales || 0) + (existingOnlineSales?.zomatoSales || 0);
        const shouldSkipZeroOnlineOverwrite = !!existingOnlineSales && posOnlineSales <= 0 && existingOnlineSalesTotal > 0;
        if (shouldSkipZeroOnlineOverwrite) {
          // Keep a previously good online-sales split if Ciferon returns an empty result for
          // this date; the main sales row skip above records the diagnostic details.
        } else if (existingOnlineSales) {
          await kv.set(`online_sales:${existingOnlineSales.id}`, {
            ...existingOnlineSales,
            swiggySales: swiggyTotal,
            zomatoSales: zomatoTotal
          });
        } else {
          // Same race condition as the sales: record above (found 2026-08-29, this parallel
          // Zomato/Swiggy split copy wasn't covered by that fix) - a random/time-based id let
          // two near-simultaneous runPosSync invocations each create their own record for the
          // same (store, date), and the "Online Sales" card sums every online_sales: record
          // matching that date/store, silently double-counting. Deterministic id makes
          // concurrent creates collide on one KV key instead of becoming siblings.
          const entryId = `ONLINE-SALES-POS-${store.id}-${today}`;
          await kv.set(`online_sales:${entryId}`, {
            id: entryId,
            date: today,
            swiggySales: swiggyTotal,
            zomatoSales: zomatoTotal,
            storeId: store.id,
            createdAt: new Date().toISOString()
          });
        }

        if (!storeResult.stepA) {
          storeResult.stepA = { success: true, cashTotal, paytmTotal, zomatoTotal, swiggyTotal, orderCount: orders.length, rawOrderCount: allOrders.length, datedOrderCount: todaysOrders.length };
        }
      } catch (stepAError: any) {
        storeResult.stepA = { success: false, error: stepAError?.message || String(stepAError) };
        console.error(`[pos-sync] Step A failed for store ${store.id}:`, stepAError);
      }

      // ---- Step B: item-wise category sync (Category Sales / Store Stock Status). Also
      // runs during a backfill now (the classifier's Mania Combo bug is fixed, and Category
      // Sales needs to be able to pull historical dates via the API, not just "today") ----
      try {
        const adminEmail = Deno.env.get('CIFERON_ADMIN_EMAIL');
        const adminPassword = Deno.env.get('CIFERON_ADMIN_PASSWORD');
        if (!adminEmail || !adminPassword) throw new Error('CIFERON_ADMIN_EMAIL/PASSWORD not configured');

        const loginRes = await fetch('https://api.ciferon.com/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ UserName: adminEmail, Password: adminPassword })
        });
        if (!loginRes.ok) throw new Error(`Ciferon login returned HTTP ${loginRes.status}`);
        const loginData = await loginRes.json();
        // Field name unconfirmed for a scripted login (only observed via localStorage after
        // an interactive login) - check the common shapes defensively rather than assume one.
        const authkey =
          loginData?.Result?.authkey || loginData?.Result?.AuthKey || loginData?.authkey ||
          loginData?.AuthKey || loginData?.token || loginData?.Token;
        if (!authkey) {
          throw new Error(`Ciferon login did not return a recognizable authkey. Response keys: ${Object.keys(loginData || {}).join(', ')}`);
        }

        const saleCountUrl = `https://api.ciferon.com/Api/OrderReport/v2/SaleCount?StartDate=${encodeURIComponent(todayRfc1123)}&EndDate=${encodeURIComponent(todayRfc1123)}&StoreIds=undefined&IsInit=false&searchString=undefined&CompanyBrandId=0&FoodType=undefined&TerminalId=0&IsTallyMode=false&isSuperCategory=false&FloorId=0`;
        const saleCountRes = await fetch(saleCountUrl, {
          headers: {
            'Authorization': `Bearer ${authkey}`,
            'StoreId': String(store.ciferonStoreId),
            'BrandId': '0',
            'Accept': 'application/json'
          }
        });
        if (!saleCountRes.ok) throw new Error(`SaleCount returned HTTP ${saleCountRes.status}`);
        const saleCountData = await saleCountRes.json();
        if (!saleCountData.IsSuccess) throw new Error('SaleCount responded with IsSuccess=false');

        // Flatten CategoryList[].ProductList[] into a single product array, keeping each
        // product's PlatformList (per-channel qty/revenue) alongside it. Result.Columns
        // gives the channel name for each PlatformList index (e.g. ["POS","Zomato","Swiggy",
        // "Contactless"] - PlatformList[1] is that product's Zomato figures).
        const categoryList = saleCountData.Result?.lists || [];
        const channelNames: string[] = saleCountData.Result?.Columns || [];
        const products: Array<{ ProductName: string; Quantity: number; PlatformList?: Array<{ Value: string | number; Text: string | number }> }> = [];
        for (const cat of categoryList) {
          for (const prod of (cat.ProductList || [])) {
            products.push({ ProductName: prod.ProductName, Quantity: prod.Quantity, PlatformList: prod.PlatformList });
          }
        }

        const { totals: categoryTotals, byChannel } = classifyAndSumProductsByChannel(products, channelNames);
        const productBreakdown = classifyProductBreakdown(products);
        // Per-menu-item (not rolled up to category) channel split - lets the Aggregator
        // Payout page's "Are We Pricing This Right?" section compare online vs dine-in price
        // per actual menu item instead of per broad category (see classifyAndSumProductsByItemAndChannel).
        const itemChannelBreakdown = classifyAndSumProductsByItemAndChannel(products, channelNames);

        // Upsert (not duplicate) today's pos-sync-originated SalesDataRecord for this store
        const allSalesData = await getAllByPrefixWithRetry('sales_data_');
        const existingRecord = (allSalesData || []).find(
          (r: any) => r.storeId === store.id && r.date === today && r.uploadedBy === 'pos-sync'
        );

        // Ciferon's SaleCount/OrderReport endpoint has been observed to hand back the
        // previous day's already-closed totals verbatim instead of the requested day's
        // (same underlying date-range unreliability documented for Step A's SaleDetails
        // above, but with no per-order timestamp to filter on here). Every category
        // matching the prior day's stored figure exactly is a near-impossible coincidence
        // for a real business day, so treat it as a stale/cached response: don't silently
        // overwrite what may be correct data for `today`, and flag it for a human to
        // verify against Ciferon's own dashboard instead.
        const yesterdayRecord = (allSalesData || []).find(
          (r: any) => r.storeId === store.id && r.date === addDaysToDateString(today, -1) && r.uploadedBy === 'pos-sync'
        );
        // Compared value by value: the stored record comes back from the database with its
        // keys in a different order, so comparing JSON text never matched - which let a stale
        // copy of 24 Oct overwrite 25 Oct 2026.
        const sameTotals = (a: Record<string, number> = {}, b: Record<string, number> = {}) => {
          const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
          for (const k of keys) if ((Number(a[k]) || 0) !== (Number(b[k]) || 0)) return false;
          return true;
        };
        const looksStale = !!yesterdayRecord && sameTotals(yesterdayRecord.data, categoryTotals as Record<string, number>)
          && Object.values(categoryTotals as Record<string, number>).some((v) => (v || 0) > 0);

        if (looksStale) {
          storeResult.stepB = {
            success: false,
            skipped: true,
            reason: `Item-wise totals for ${today} are identical to ${addDaysToDateString(today, -1)} - likely a stale Ciferon response, not written`,
            categoryTotals
          };
          console.warn(`[pos-sync] Step B looks stale for store ${store.id} on ${today} (identical to previous day) - skipping write`);

          try {
            const clusterHeads = await getAllClusterHeads();
            const opsManagers = await getOperationsManagers(store.id);
            const recipients = [...clusterHeads, ...opsManagers];
            for (const recipient of recipients) {
              if (recipient.authUserId) {
                await notifyUser(
                  recipient.authUserId,
                  'pos_sync_stock_failed',
                  'POS Item-wise Sync Looks Stale',
                  `Tonight's item-wise stock sync for ${store.name} on ${today} returned totals identical to ${addDaysToDateString(today, -1)} - likely a stale Ciferon response. Not saved; please verify against Ciferon's dashboard and use manual sales-data upload if needed.`,
                  store.id,
                  today
                );
              }
            }
          } catch (notifyError) {
            console.error('[pos-sync] Failed to send Step B staleness notification:', notifyError);
          }
        } else {
          const recordId = existingRecord?.id || `POS-SYNC-${store.id}-${today}`;
          await kv.set(`sales_data_${recordId}`, {
            id: recordId,
            date: today,
            storeId: store.id,
            storeName: store.name,
            data: categoryTotals,
            // Per-channel (POS/Zomato/Swiggy/...) pieces + revenue per momo category - lets
            // Category Sales compute a real revenue-per-momo figure instead of an assumed price.
            channelBreakdown: byChannel,
            // Per-menu-item detail (e.g. "Chicken Steamed Momos" kept separate from "Chicken
            // Afghani Momos", not collapsed into "Chicken Momos") - lets Category Sales show
            // real item-level detail on top of the rolled-up category totals above.
            productBreakdown,
            // Per-menu-item channel split (pieces/revenue by POS/Zomato/Swiggy/... for each
            // real product name, not rolled up to category) - see classifyAndSumProductsByItemAndChannel.
            itemChannelBreakdown,
            uploadedBy: 'pos-sync',
            uploadedAt: new Date().toISOString()
          });

          storeResult.stepB = { success: true, categoryTotals, productCount: products.length };
        }
      } catch (stepBError: any) {
        storeResult.stepB = { success: false, error: stepBError?.message || String(stepBError) };
        console.error(`[pos-sync] Step B failed for store ${store.id}:`, stepBError);

        // Step B is known-fragile - alert so the manual /sales-data upload is used as a
        // fallback for today, rather than silently having no item-wise data at all.
        try {
          const clusterHeads = await getAllClusterHeads();
          const opsManagers = await getOperationsManagers(store.id);
          const recipients = [...clusterHeads, ...opsManagers];
          for (const recipient of recipients) {
            if (recipient.authUserId) {
              await notifyUser(
                recipient.authUserId,
                'pos_sync_stock_failed',
                'POS Item-wise Sync Failed',
                `Tonight's item-wise stock sync failed for ${store.name}: ${stepBError?.message || String(stepBError)}. Please use manual sales-data upload for ${today}.`,
                store.id,
                today
              );
            }
          }
        } catch (notifyError) {
          console.error('[pos-sync] Failed to send Step B failure notification:', notifyError);
        }
      }

      // ---- Step D: per-order item detail (OrderReport/Sale, IsAllVisible=true) - each
      // order's real momo content plus its ExternalId (the Zomato/Swiggy order ID), so an
      // uploaded settlement's per-order payout can be joined back to exactly which momo
      // types were in it, instead of assuming a uniform commission rate across all types.
      //
      // CONFIRMED RISK - do not backfill an old date to "fix" a coverage gap without reading
      // this: this endpoint returns Ciferon's LIVE, non-cancelled-only order list (confirmed
      // via a raw fetch - the response's own `totalOrder` field matches OrderList.length
      // exactly, so it isn't pagination truncating anything), not an immutable historical
      // snapshot. An order that was live when the ORIGINAL same-day sync ran can later be
      // cancelled/voided in Ciferon days or weeks after, even though the (already-closed,
      // already-paid) aggregator-settlement record still lists it - so backfilling that same
      // date later can come back with FEWER orders than the original sync captured, silently
      // losing ones that used to match. Tried exactly this on 2026-08-25 to fix 30 "unmatched"
      // Zomato orders in OnlineSalesTab's channelEconomicsData (29 of them traced to a real,
      // one-time gap on 2026-08-17 - that day's original sync ran before all 78 of the day's
      // orders had been placed) - backfilling 2026-08-05/06/07/14/15/16/17/18 fully closed the
      // 08-17 gap but coincidentally dropped since-cancelled orders whose PLACEMENT date fell
      // in that range but which had SETTLED on 08-10 and 08-21 (settlement lags placement by
      // 1-3+ days) - net result went from 30 to 39 unmatched, with no snapshot of the prior
      // records to revert to. If a gap like this recurs, treat it as inherent, accept the
      // lower match rate, or accompany a backfill with an explicit before/after order-ID diff
      // (not just a total count) so a regression like this is caught before it lands. ----
      try {
        const adminEmail = Deno.env.get('CIFERON_ADMIN_EMAIL');
        const adminPassword = Deno.env.get('CIFERON_ADMIN_PASSWORD');
        if (!adminEmail || !adminPassword) throw new Error('CIFERON_ADMIN_EMAIL/PASSWORD not configured');

        const loginRes = await fetch('https://api.ciferon.com/api/login', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ UserName: adminEmail, Password: adminPassword })
        });
        if (!loginRes.ok) throw new Error(`Ciferon login returned HTTP ${loginRes.status}`);
        const loginData = await loginRes.json();
        const authkey =
          loginData?.Result?.authkey || loginData?.Result?.AuthKey || loginData?.authkey ||
          loginData?.AuthKey || loginData?.token || loginData?.Token;
        if (!authkey) throw new Error(`Ciferon login did not return a recognizable authkey. Response keys: ${Object.keys(loginData || {}).join(', ')}`);

        const orderSaleParams = new URLSearchParams({
          StartDate: todayRfc1123,
          EndDate: todayRfc1123,
          ReportType: 'SaleReport',
          IsAllVisible: 'true',
          IsSplitPaymentMode: 'false',
          SaleOrderType: 'undefined',
          IsCancel: 'false',
          IsComplementary: 'false',
          IsPending: 'false',
          IsSettle: 'false',
          IsInit: 'false',
          PaymentModeIds: 'undefined',
          StoreIds: 'undefined',
          PaymentFilter: 'undefined',
          IsEdit: 'false',
          IsReprint: 'false',
          IsCustomerGst: 'false',
          IsDiscount: 'false',
          CompanyBrandId: '0',
          IsDeliveryApp: 'false',
          TerminalId: '0',
        });
        const orderSaleRes = await fetch(`https://api.ciferon.com/api/OrderReport/Sale?${orderSaleParams.toString()}`, {
          headers: {
            'Authorization': `Bearer ${authkey}`,
            'StoreId': String(store.ciferonStoreId),
            'BrandId': '0',
            'Accept': 'application/json'
          }
        });
        if (!orderSaleRes.ok) throw new Error(`OrderReport/Sale returned HTTP ${orderSaleRes.status}`);
        const orderSaleData = await orderSaleRes.json();
        if (!orderSaleData.IsSuccess) throw new Error('OrderReport/Sale responded with IsSuccess=false');

        // Only orders whose own EntryDate falls on `today`. A late-night backfill for 25 Oct
        // 2026 got 24 Oct's orders back from this endpoint and overwrote the right ones. If
        // Ciferon returns orders but none for this day, nothing is saved.
        const rawOrderList = orderSaleData.Result?.OrderList || [];
        const sameDayOrders = rawOrderList.filter((o: any) => {
          const d = getCiferonOrderEntryDateIST(o);
          return !d || d === today;
        });
        if (rawOrderList.length > 0 && sameDayOrders.length === 0) {
          throw new Error(`OrderReport/Sale returned ${rawOrderList.length} orders, none dated ${today} - stale response, not saved`);
        }
        const orders = sameDayOrders.map((o: any) => ({
          orderId: o.OrderId,
          externalId: o.ExternalId ? String(o.ExternalId) : null,
          paymentMode: o.PaymentMode,
          grandTotal: o.GrandTotal || 0,
          subtotal: o.Subtotal || 0,
          discount: o.Discount || 0,
          // 'DineIn' | 'TakeAway' | 'HomeDelivery' (Zomato/Swiggy orders are also
          // HomeDelivery) - confirmed against the raw OrderReport/Sale response (NOT the
          // field named "Type", which is unrelated ["SaleInvoice" etc] - the real order-type
          // field is SaleOrderType). Used by /utilities-consumption to attribute box
          // (TakeAway+HomeDelivery) vs tray (DineIn) usage per order.
          orderType: o.SaleOrderType || null,
          orderHourIST: getCiferonOrderHourIST(o),
          items: classifyOrderItems((o.OrderItemWrapperList || []).map((i: any) => ({
            ProductId: i.ProductId, ProductName: i.ProductName, Quantity: i.Quantity, Rate: i.Rate, Total: i.Total
          }))),
          // Raw per-item name/quantity/category, kept separate from the momo-category
          // classification above - CategoryName === 'Addon' marks a combo's auto-decomposed
          // sibling lines (e.g. a Mania Combo's embedded burger/extra-momos/soft-drink),
          // which represent the SAME physical order as their combo's own line, not an
          // independently-boxed item - confirmed against real order data. Used by
          // /utilities-consumption for box/tray counting (skip Addon lines) and beverage
          // consumption (match by name regardless of Addon, since a combo's embedded soft
          // drink is still a real bottle handed to the customer).
          rawItems: (o.OrderItemWrapperList || []).map((i: any) => ({
            productName: i.ProductName || '',
            quantity: i.Quantity || 0,
            categoryName: i.CategoryName || '',
          })),
        }));

        await kv.set(`order-item-detail:${store.id}:${today}`, {
          storeId: store.id,
          date: today,
          orders,
          syncedAt: new Date().toISOString(),
        });

        storeResult.stepD = { success: true, orderCount: orders.length };
      } catch (stepDError: any) {
        storeResult.stepD = { success: false, error: stepDError?.message || String(stepDError) };
        console.error(`[pos-sync] Step D failed for store ${store.id}:`, stepDError);
      }

      // ---- Step C: low-stock alert (opening + this month's received - this month's sold,
      // same formula ProductionRequests.tsx's "Store Stock Status" uses, simplified to
      // skip its mid-month-recalibration-override edge case) ----
      if (isBackfill) {
        storeResult.stepC = { success: true, skipped: true, reason: 'backfill only re-runs Step A' };
      } else
      try {
        const CATEGORY_KEYS: Array<{ camelKey: string; legacyKey: string }> = [
          { camelKey: 'chicken', legacyKey: 'Chicken Momos' },
          { camelKey: 'chickenCheese', legacyKey: 'Chicken Cheese Momos' },
          { camelKey: 'veg', legacyKey: 'Veg Momos' },
          { camelKey: 'paneer', legacyKey: 'Paneer Momos' },
          { camelKey: 'cheeseCorn', legacyKey: 'Corn Cheese Momos' },
          { camelKey: 'chickenKurkure', legacyKey: 'Chicken Kurkure Momos' },
          { camelKey: 'vegKurkure', legacyKey: 'Veg Kurkure Momos' },
        ];
        const currentMonth = today.substring(0, 7);
        const monthStart = `${currentMonth}-01`;

        // Opening balance from this month's most recent store recalibration, if any
        const allRecalibrations = await kv.getByPrefix('recalibration_');
        const storeRecalibrations = (allRecalibrations || [])
          .filter((r: any) => r.locationId === store.id && r.locationType === 'store' && r.date?.startsWith(currentMonth))
          .sort((a: any, b: any) => new Date(b.date).getTime() - new Date(a.date).getTime());
        const latestRecal = storeRecalibrations[0];

        const openingBalance: Record<string, number> = {};
        if (latestRecal?.items) {
          const allInventoryItems = await kv.getByPrefix('inventory_item_');
          for (const item of latestRecal.items) {
            const invItem = (allInventoryItems || []).find((i: any) => i.id === item.itemId || i.name === item.itemId);
            if (invItem) {
              const camelKey = invItem.name.replace(/_([a-z])/g, (_: string, c: string) => c.toUpperCase());
              openingBalance[camelKey] = item.actualQuantity;
            }
          }
        }

        // This month's delivered/partially-delivered production requests for this store.
        // Real records use statuses like "delivered", "partially-delivered", or
        // "partially-shipped" - deliveredAt being set is the reliable signal that some
        // quantity actually reached the store, regardless of the exact status string. The
        // real shipped amount lives in shippedQuantities (falls back to the requested
        // top-level field for older records that predate that field).
        const monthRequests = await getProductionRequestsFrom(monthStart);
        const deliveredRequests = (monthRequests || []).filter((r: any) => r.storeId === store.id && !!r.deliveredAt);
        const received: Record<string, number> = {};
        for (const key of CATEGORY_KEYS) {
          received[key.camelKey] = deliveredRequests.reduce((sum: number, r: any) => {
            const shipped = r.shippedQuantities?.[key.camelKey];
            const qty = shipped !== undefined ? shipped : ((r[key.camelKey] || 0) + (r[key.camelKey + 's'] || 0));
            return sum + qty;
          }, 0);
        }

        // This month's sold, from SalesDataRecords - includes tonight's Step B write
        const monthSalesRecords = (await getAllByPrefixWithRetry('sales_data_') || [])
          .filter((r: any) => r.storeId === store.id && r.date?.startsWith(currentMonth));
        const sold: Record<string, number> = {};
        for (const key of CATEGORY_KEYS) {
          sold[key.camelKey] = monthSalesRecords.reduce(
            (sum: number, r: any) => sum + (r.data?.[key.legacyKey] || 0), 0
          );
        }

        const thresholdsRecord = (await kv.get(`stock-thresholds:${store.id}`)) || {};
        const lowCategories: string[] = [];
        for (const key of CATEGORY_KEYS) {
          const stock = (openingBalance[key.camelKey] || 0) + received[key.camelKey] - sold[key.camelKey];
          const thresholds = (thresholdsRecord as any)[key.camelKey] || { high: 600, medium: 300, low: 150 };
          if (stock <= thresholds.low) {
            lowCategories.push(`${key.legacyKey} (${stock} left)`);
          }
        }

        // NOTE: notification-sending is intentionally disabled for now. A live test against
        // this store's real data showed the received-quantity calc below doesn't yet match
        // real production-request records, which use statuses like "partially-delivered"/
        // "partially-shipped" (not just "delivered") and store the actual shipped amount in
        // a separate shippedQuantities sub-object, not the top-level requested-quantity
        // fields this reads today - so lowCategories can be wrong. Fix that calc and verify
        // it against ProductionRequests.tsx's real on-screen numbers for this store before
        // re-enabling the notifyUser block below (kept, commented, to make re-enabling easy).
        if (lowCategories.length > 0) {
          console.log(`[pos-sync] Step C would have alerted for ${store.name}:`, lowCategories);
          /*
          const recipients: any[] = [];
          const storeIncharge = await getStoreIncharge(store.id);
          if (storeIncharge) recipients.push(storeIncharge);
          recipients.push(...(await getOperationsManagers(store.id)));
          if (store.productionHouseId) {
            const productionHouse = await kv.get(`production_house_${store.productionHouseId}`);
            if (productionHouse?.productionHeadId) {
              const productionHead = await kv.get(`unified-employee:${productionHouse.productionHeadId}`);
              if (productionHead) recipients.push(productionHead);
            }
          }
          recipients.push(...(await getAllClusterHeads()));

          const notified = new Set<string>();
          for (const recipient of recipients) {
            if (recipient?.authUserId && !notified.has(recipient.authUserId)) {
              notified.add(recipient.authUserId);
              await notifyUser(
                recipient.authUserId,
                'low_stock_alert',
                '⚠️ Low Stock Alert',
                `${store.name} is running low on: ${lowCategories.join(', ')}`,
                store.id,
                today
              );
            }
          }
          */
        }

        storeResult.stepC = { success: true, lowCategories };
      } catch (stepCError: any) {
        storeResult.stepC = { success: false, error: stepCError?.message || String(stepCError) };
        console.error(`[pos-sync] Step C failed for store ${store.id}:`, stepCError);
      }

      // Per-store audit log so failures are diagnosable without digging through function logs
      await kv.set(`pos-sync-log:${today}:${store.id}`, {
        date: today,
        storeId: store.id,
        storeName: store.name,
        stepA: storeResult.stepA,
        stepB: storeResult.stepB,
        stepC: storeResult.stepC,
        stepD: storeResult.stepD,
        ranAt: new Date().toISOString()
      });

      results.push(storeResult);
    }

    // Event stalls with their own Ciferon outlet (events.ts), into their own day rows.
    let events: any[] = [];
    try {
      events = await runEventPosSync(eventsDeps, today);
    } catch (eventError: any) {
      console.error('[pos-sync] Event outlets failed:', eventError?.message || eventError);
    }

    return { success: true, date: today, results, events };
  } catch (error: any) {
    console.error('[pos-sync] Unexpected error:', error);
    return { success: false, error: error?.message || 'pos-sync failed', results, status: 500 };
  }
}

// Nightly cron-invoked entrypoint - no user session exists at cron time, so this is
// gated by a shared secret header instead of verifyUser (see the migration referenced
// above), with an added secret check since this route writes financial/stock data
// rather than just sending notifications like the reminder-job routes above.
app.post('/make-server-c2dd9b9d/pos-sync', async (c) => {
  const cronSecret = c.req.header('X-Cron-Secret');
  const expectedSecret = Deno.env.get('CRON_SYNC_SECRET');
  if (!expectedSecret || cronSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const result = await runPosSync();
  // The day's orders are in: check burgers against buns bought (burgerCheck.ts). Never fails the sync.
  const burgerAlerts = await sendBurgerAlerts().catch((e) => { console.log('Burger check failed:', e); return -1; });
  return c.json({ ...(result as any), burgerAlerts }, (result as any).status || 200);
});

// Manual "Sync Now" button entrypoint - lets production head, operations manager, store
// incharge, or cluster head trigger today's sync early instead of waiting for the 10:30 PM
// cron, e.g. to check figures before closing. Same underlying logic as the cron route above.
app.post('/make-server-c2dd9b9d/pos-sync/trigger', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  const role = authResult.user.user_metadata?.role;
  const designation = authResult.user.user_metadata?.designation;
  const isStoreIncharge = designation === 'store_incharge';
  const isProductionIncharge = designation === 'production_incharge';
  const isOperationsManager = role === 'manager' && !isStoreIncharge && !isProductionIncharge;
  if (role !== 'cluster_head' && !isOperationsManager && !isStoreIncharge && !isProductionIncharge) {
    return c.json({ error: 'Only production head, operations manager, store incharge, or cluster head can trigger a manual POS sync' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  if (body?.fromPull) {
    const last = await kv.get(POS_SYNC_LAST_START_KEY).catch(() => null) as { at?: string } | null;
    if (last?.at && Date.now() - Date.parse(last.at) < PULL_SYNC_GAP_MS) {
      return c.json({ success: true, skipped: true, recent: true, lastAt: last.at, message: 'Synced moments ago' });
    }
  }

  const result = await runPosSync();
  return c.json(result, (result as any).status || 200);
});

// TEMP DIAGNOSTIC - remove after backfilling the Aug 5-7 / 14-18 order-item-detail gap
// (confirmed 29 of 30 "unmatched" Zomato orders trace to the 2026-08-17 order-item-detail
// sync only having captured 46 of that day's 78 real orders - the same-day sync ran before
// the day finished). Unauthenticated on purpose, matching this session's established
// diagnostic-route pattern - remove once the backfill is confirmed and redeploy clean.
// Backfill entrypoint - cluster head only. Re-pulls a specific already-closed day's
// SaleDetails from Ciferon and overwrites that day's cash/Paytm/online totals, for
// correcting a historical record written before a sync bug was fixed (Step A only -
// see runPosSync's isBackfill branch).
app.post('/make-server-c2dd9b9d/pos-sync/backfill', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }
  if (authResult.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only cluster heads can backfill a past day\'s POS sync' }, 403);
  }

  const body = await c.req.json().catch(() => ({}));
  const date = body?.date;
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Provide a date in YYYY-MM-DD format' }, 400);
  }

  const result = await runPosSync(date);
  return c.json(result, (result as any).status || 200);
});

// One-off admin utility - backfills every day in [startDate, endDate] via the same
// per-day backfill path above, for verifying the sync end-to-end across a range at once.
// Gated by a dedicated secret (not user auth) since it's a maintenance tool, not an
// in-app feature - never exposed in the frontend.
app.post('/make-server-c2dd9b9d/pos-sync/admin-bulk-backfill', async (c) => {
  const adminSecret = c.req.header('X-Admin-Secret');
  const expectedSecret = Deno.env.get('ADMIN_TOOLS_SECRET');
  if (!expectedSecret || adminSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { startDate, endDate } = body || {};
  if (!startDate || !endDate || !/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
    return c.json({ error: 'Provide startDate and endDate in YYYY-MM-DD format' }, 400);
  }

  const results: any[] = [];
  let cursor = new Date(`${startDate}T00:00:00Z`);
  const end = new Date(`${endDate}T00:00:00Z`);
  while (cursor <= end) {
    const date = cursor.toISOString().substring(0, 10);
    const result = await runPosSync(date);
    results.push({ date, result });
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }

  return c.json({ success: true, days: results.length, results });
});

// One-off debug utility - returns Ciferon's raw SaleDetails response for a single date,
// unprocessed, so a discrepancy between our aggregated totals and Ciferon's own dashboard
// can be inspected order-by-order instead of guessing. Same admin-secret gate as the bulk
// backfill above - never exposed in the frontend.
app.post('/make-server-c2dd9b9d/pos-sync/admin-raw-fetch', async (c) => {
  const adminSecret = c.req.header('X-Admin-Secret');
  const expectedSecret = Deno.env.get('ADMIN_TOOLS_SECRET');
  if (!expectedSecret || adminSecret !== expectedSecret) {
    return c.json({ error: 'Unauthorized' }, 401);
  }

  const body = await c.req.json().catch(() => ({}));
  const { date, mode, storeId } = body || {};
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return c.json({ error: 'Provide date in YYYY-MM-DD format' }, 400);
  }

  if (mode === 'salecount') {
    // Same login + endpoint Step B uses - dumped raw and unprocessed, to check whether the
    // response actually carries any per-order or per-channel (Zomato/Swiggy/offline) detail
    // beyond the day-level ProductName+Quantity totals the classifier currently reads.
    const adminEmail = Deno.env.get('CIFERON_ADMIN_EMAIL');
    const adminPassword = Deno.env.get('CIFERON_ADMIN_PASSWORD');
    if (!adminEmail || !adminPassword) return c.json({ error: 'CIFERON_ADMIN_EMAIL/PASSWORD not configured' }, 500);

    const allStores = await kv.getByPrefix('store:');
    const store = storeId
      ? (allStores || []).find((s: any) => s.id === storeId)
      : (allStores || []).find((s: any) => s.ciferonStoreId);
    if (!store?.ciferonStoreId) return c.json({ error: 'No store with a ciferonStoreId found' }, 400);

    const loginRes = await fetch('https://api.ciferon.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ UserName: adminEmail, Password: adminPassword })
    });
    if (!loginRes.ok) return c.json({ error: `Ciferon login returned HTTP ${loginRes.status}` }, 502);
    const loginData = await loginRes.json();
    const authkey =
      loginData?.Result?.authkey || loginData?.Result?.AuthKey || loginData?.authkey ||
      loginData?.AuthKey || loginData?.token || loginData?.Token;
    if (!authkey) return c.json({ error: 'No authkey in Ciferon login response', loginDataKeys: Object.keys(loginData || {}) }, 502);

    const dateRfc1123 = new Date(`${date}T00:00:00Z`).toUTCString();
    const saleCountUrl = `https://api.ciferon.com/Api/OrderReport/v2/SaleCount?StartDate=${encodeURIComponent(dateRfc1123)}&EndDate=${encodeURIComponent(dateRfc1123)}&StoreIds=undefined&IsInit=false&searchString=undefined&CompanyBrandId=0&FoodType=undefined&TerminalId=0&IsTallyMode=false&isSuperCategory=false&FloorId=0`;
    const saleCountRes = await fetch(saleCountUrl, {
      headers: {
        'Authorization': `Bearer ${authkey}`,
        'StoreId': String(store.ciferonStoreId),
        'BrandId': '0',
        'Accept': 'application/json'
      }
    });
    const data = await saleCountRes.json().catch(() => null);
    return c.json({ requestedDate: date, httpStatus: saleCountRes.status, raw: data });
  }

  if (mode === 'ordersale') {
    // OrderReport/Sale (the admin panel's "Sales Summary" report) - checking whether its
    // OrderList actually carries per-order item content when IsAllVisible=true, since the
    // page's "Show Items" checkbox displays exactly that from a captured real request.
    const adminEmail = Deno.env.get('CIFERON_ADMIN_EMAIL');
    const adminPassword = Deno.env.get('CIFERON_ADMIN_PASSWORD');
    if (!adminEmail || !adminPassword) return c.json({ error: 'CIFERON_ADMIN_EMAIL/PASSWORD not configured' }, 500);

    const allStores = await kv.getByPrefix('store:');
    const store = storeId
      ? (allStores || []).find((s: any) => s.id === storeId)
      : (allStores || []).find((s: any) => s.ciferonStoreId);
    if (!store?.ciferonStoreId) return c.json({ error: 'No store with a ciferonStoreId found' }, 400);

    const loginRes = await fetch('https://api.ciferon.com/api/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ UserName: adminEmail, Password: adminPassword })
    });
    if (!loginRes.ok) return c.json({ error: `Ciferon login returned HTTP ${loginRes.status}` }, 502);
    const loginData = await loginRes.json();
    const authkey =
      loginData?.Result?.authkey || loginData?.Result?.AuthKey || loginData?.authkey ||
      loginData?.AuthKey || loginData?.token || loginData?.Token;
    if (!authkey) return c.json({ error: 'No authkey in Ciferon login response', loginDataKeys: Object.keys(loginData || {}) }, 502);

    const dateRfc1123 = new Date(`${date}T00:00:00Z`).toUTCString();
    const params = new URLSearchParams({
      StartDate: dateRfc1123,
      EndDate: dateRfc1123,
      ReportType: 'SaleReport',
      IsAllVisible: 'true',
      IsSplitPaymentMode: 'false',
      SaleOrderType: 'undefined',
      IsCancel: 'false',
      IsComplementary: 'false',
      IsPending: 'false',
      IsSettle: 'false',
      IsInit: 'false',
      PaymentModeIds: 'undefined',
      StoreIds: 'undefined',
      PaymentFilter: 'undefined',
      IsEdit: 'false',
      IsReprint: 'false',
      IsCustomerGst: 'false',
      IsDiscount: 'false',
      CompanyBrandId: '0',
      IsDeliveryApp: 'false',
      TerminalId: '0',
    });
    const orderSaleUrl = `https://api.ciferon.com/api/OrderReport/Sale?${params.toString()}`;
    const orderSaleRes = await fetch(orderSaleUrl, {
      headers: {
        'Authorization': `Bearer ${authkey}`,
        'StoreId': String(store.ciferonStoreId),
        'BrandId': '0',
        'Accept': 'application/json'
      }
    });
    const data = await orderSaleRes.json().catch(() => null);
    return c.json({ requestedDate: date, httpStatus: orderSaleRes.status, raw: data });
  }

  const apiKey = Deno.env.get('CIFERON_API_KEY');
  if (!apiKey) return c.json({ error: 'CIFERON_API_KEY not configured' }, 500);

  const res = await fetch('https://api.ciferon.com/api/LoginApi/SaleDetails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ StartDate: date, EndDate: date })
  });
  const data = await res.json();
  return c.json({ requestedDate: date, httpStatus: res.status, raw: data });
});

// ============================================
// PRODUCTION DATA CLEANUP
// ============================================
// Selective cleanup for production launch - removes ALL transactional data
// while preserving master data (inventory items, employees, stores, etc.)
//
// DELETES:
// - inventory: (purchase logs)
// - overhead: (expense logs) 
// - fixedcost: (fixed cost logs)
// - sales: (sales records)
// - production: (production logs)
// - production-request: (production requests)
// - item-sales: (category sales)
// - notification: (all notifications)
// - stock-request: (stock requests)
// - stock-recalibration: (monthly recalibrations)
//
// PRESERVES:
// - employee: / unified-employee: / attendance-employee: (master data)
// - inventory_item_ (product metadata)
// - store: / production-house: (locations)
// - archived-employee: (historical records)
// - payout: (employee payouts)
// - timesheet: (daily timesheets)
// - leave: (leave applications)
// ============================================

app.post('/make-server-c2dd9b9d/cleanup-production-data', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can run cleanup
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can cleanup production data' }, 403);
    }

    console.log('🗑️ Starting selective production data cleanup...');
    console.log('📅 Removing transactional data for production launch');
    
    const stats = {
      inventory: 0,
      sales: 0,
      itemSales: 0,
      stockRequests: 0,
      stockRecalibrations: 0,
      productionData: 0,
      productionRequests: 0,
      notifications: 0,
      overheads: 0,
      fixedCosts: 0
    };

    // Get all keys from database
    const { data: allRecords, error: fetchError } = await supabase
      .from('kv_store_c2dd9b9d')
      .select('key');
    
    if (fetchError) {
      throw new Error(`Failed to fetch keys: ${fetchError.message}`);
    }

    console.log(`📊 Total records in database: ${allRecords?.length || 0}`);

    // Filter and delete transactional data keys
    const keysToDelete: string[] = [];
    
    for (const record of allRecords || []) {
      const key = record.key;
      
      // TRANSACTIONAL DATA TO DELETE
      // These are all daily operations and transactions
      const isTransactional = 
        key.startsWith('inventory:') ||           // Daily inventory purchases
        key.startsWith('overhead:') ||            // Daily overhead expenses
        key.startsWith('fixedcost:') ||           // Fixed costs
        key.startsWith('sales:') ||               // Daily sales data
        key.startsWith('production:') ||          // Production logs
        key.startsWith('item-sales:') ||          // Category sales tracking
        key.startsWith('notification:') ||        // Notifications
        key.startsWith('stock-request:') ||       // Stock requests
        key.startsWith('stock-recalibration:') || // Monthly stock recalibrations
        key.startsWith('production-request:') ||  // Production requests
        key.startsWith('notified_pending_request:'); // Pending request notification tracking
      
      // MASTER DATA TO PRESERVE
      // These are configuration and employee records
      const isMasterData = 
        key.startsWith('employee:') ||
        key.startsWith('unified-employee:') ||
        key.startsWith('unified_employee:') ||
        key.startsWith('attendance-employee:') ||
        key.startsWith('attendance-manager:') ||
        key.startsWith('archived-employee:') ||
        key.startsWith('inventory_item_') ||      // Product metadata
        key.startsWith('store:') ||
        key.startsWith('production-house:') ||
        key.startsWith('payout:') ||              // Employee payouts (keep per request)
        key.startsWith('timesheet:') ||           // Timesheets (keep per request)
        key.startsWith('leave:');                 // Leave data (keep per request)
      
      if (isTransactional && !isMasterData) {
        keysToDelete.push(key);
      }
    }

    console.log(`🗑️  Deleting ${keysToDelete.length} transactional records...`);
    
    // Count by type for detailed reporting
    stats.inventory = keysToDelete.filter(k => k.startsWith('inventory:')).length;
    stats.sales = keysToDelete.filter(k => k.startsWith('sales:')).length;
    stats.itemSales = keysToDelete.filter(k => k.startsWith('item-sales:')).length;
    stats.overheads = keysToDelete.filter(k => k.startsWith('overhead:')).length;
    stats.fixedCosts = keysToDelete.filter(k => k.startsWith('fixedcost:')).length;
    stats.stockRequests = keysToDelete.filter(k => k.startsWith('stock-request:')).length;
    stats.stockRecalibrations = keysToDelete.filter(k => k.startsWith('stock-recalibration:')).length;
    stats.productionData = keysToDelete.filter(k => k.startsWith('production:')).length;
    stats.productionRequests = keysToDelete.filter(k => k.startsWith('production-request:')).length;
    stats.notifications = keysToDelete.filter(k => k.startsWith('notification:')).length;

    // Delete in batches
    const batchSize = 100;
    for (let i = 0; i < keysToDelete.length; i += batchSize) {
      const batch = keysToDelete.slice(i, i + batchSize);
      await kv.mdel(batch);
      console.log(`✅ Deleted batch ${Math.floor(i / batchSize) + 1}/${Math.ceil(keysToDelete.length / batchSize)}`);
    }

    console.log('✅ Production data cleanup completed!');
    console.log('📊 Summary:', stats);
    console.log('✅ PRESERVED: Inventory Items, Employee Master Data, Payroll, Timesheets, Leaves, Stores, Production Houses');

    return c.json({ 
      success: true, 
      message: 'Production data cleaned successfully. All transactional data removed. Preserved: inventory items metadata, employee master data, payroll, timesheets, leaves, stores, and production houses.',
      stats,
      totalDeleted: keysToDelete.length
    });
  } catch (error) {
    console.error('❌ Error during production cleanup:', error);
    return c.json({ error: error.message }, 500);
  }
});

// Clean up duplicate pending production entries
app.post('/make-server-c2dd9b9d/production/cleanup-duplicates', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    
    // Only cluster heads can clean up duplicates
    if (role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can clean up duplicate entries' }, 403);
    }

    console.log('🧹 Starting duplicate production entry cleanup...');
    
    // Get all production entries with retry logic
    const allProduction = await retryWithBackoff(
      () => kv.getByPrefix('production:'),
      'getByPrefix(production:)'
    );
    
    console.log(`📦 Found ${allProduction.length} total production entries`);
    
    // Group by date and storeId to find duplicates
    const groupedByDateStore = new Map<string, any[]>();
    
    for (const prod of allProduction) {
      // Only look at pending entries
      if (prod.approvalStatus === 'pending') {
        const key = `${prod.date}:${prod.storeId || 'no-store'}`;
        if (!groupedByDateStore.has(key)) {
          groupedByDateStore.set(key, []);
        }
        groupedByDateStore.get(key)!.push(prod);
      }
    }
    
    const duplicatesFound: any[] = [];
    const keysToDelete: string[] = [];
    
    // For each group, keep the oldest entry and delete the rest
    for (const [key, entries] of groupedByDateStore.entries()) {
      if (entries.length > 1) {
        console.log(`🔍 Found ${entries.length} duplicate pending entries for ${key}`);
        
        // Sort by creation time (if available) or by id to get consistent ordering
        // Keep the first entry, delete the rest
        entries.sort((a, b) => {
          // If we have createdAt timestamps, use those
          if (a.createdAt && b.createdAt) {
            return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          }
          // Otherwise sort by id to maintain consistency
          return a.id.localeCompare(b.id);
        });
        
        const [keeper, ...duplicates] = entries;
        
        duplicatesFound.push({
          date: keeper.date,
          storeId: keeper.storeId,
          keepingId: keeper.id,
          deletingCount: duplicates.length,
          deletingIds: duplicates.map(d => d.id)
        });
        
        // Collect keys to delete
        for (const dup of duplicates) {
          const dupKey = `production:${dup.userId}:${dup.id}`;
          keysToDelete.push(dupKey);
          console.log(`  📌 Marked for deletion: ${dup.id}`);
        }
        
        console.log(`  ✅ Will keep original: ${keeper.id}`);
      }
    }
    
    // Delete in batches to avoid memory issues
    const BATCH_SIZE = 50;
    let totalDeleted = 0;
    
    for (let i = 0; i < keysToDelete.length; i += BATCH_SIZE) {
      const batch = keysToDelete.slice(i, i + BATCH_SIZE);
      await retryWithBackoff(
        () => kvWithRetry.mdel(batch),
        `mdel production batch ${i / BATCH_SIZE + 1}`
      );
      totalDeleted += batch.length;
      console.log(`Deleted batch ${Math.floor(i / BATCH_SIZE) + 1}/${Math.ceil(keysToDelete.length / BATCH_SIZE)}`);
    }
    
    console.log(`✅ Cleanup completed! Deleted ${totalDeleted} duplicate entries`);
    
    return c.json({
      success: true,
      message: `Successfully cleaned up ${totalDeleted} duplicate production entries`,
      duplicatesFound: duplicatesFound.length,
      totalDeleted,
      details: duplicatesFound
    });
  } catch (error) {
    console.error('❌ Error cleaning up duplicates:', error);
    return c.json({ 
      error: 'Failed to clean up duplicates', 
      details: error instanceof Error ? error.message : String(error)
    }, 500);
  }
});

// Mount inventory items routes
app.route('/', inventoryItemsRoutes);
console.log('✅ Inventory items routes mounted');

// ============================================
// ONLINE CASH RECALIBRATION
// ============================================

// Get latest online cash recalibration for a store
app.get('/make-server-c2dd9b9d/online-cash-recalibration/latest/:storeId', async (c) => {
  try {
    const storeId = c.req.param('storeId');
    const allRecalibrations = await kvWithRetry.getByPrefix(`online-cash-recalibration:${storeId}:`);
    
    console.log(`📊 Fetching latest recalibration for store ${storeId}:`, {
      found: allRecalibrations?.length || 0,
      data: allRecalibrations
    });
    
    if (!allRecalibrations || allRecalibrations.length === 0) {
      return c.json({ recalibration: null });
    }
    
    // Sort by createdAt or timestamp descending and get the latest
    const latest = allRecalibrations.sort((a: any, b: any) => {
      const timeA = new Date(a.createdAt || a.timestamp).getTime();
      const timeB = new Date(b.createdAt || b.timestamp).getTime();
      return timeB - timeA;
    })[0];
    
    // Ensure the ID is set if not already present
    if (!latest.id && latest.storeId && latest.month) {
      latest.id = `ONLINE-CASH-RECAL-${latest.storeId}-${latest.month}`;
    }
    
    console.log('📊 Latest recalibration:', latest);
    
    return c.json({ recalibration: latest });
  } catch (error) {
    console.error('❌ Error fetching latest online cash recalibration:', error);
    return c.json({ error: 'Failed to fetch latest recalibration' }, 500);
  }
});

// Get online cash recalibration history for a store
app.get('/make-server-c2dd9b9d/online-cash-recalibration/history/:storeId', async (c) => {
  try {
    const storeId = c.req.param('storeId');
    const allRecalibrations = await kvWithRetry.getByPrefix(`online-cash-recalibration:${storeId}:`);
    
    // Sort by timestamp descending (newest first)
    const sorted = (allRecalibrations || []).sort((a: any, b: any) => 
      new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
    );
    
    return c.json({ history: sorted });
  } catch (error) {
    console.error('Error fetching online cash recalibration history:', error);
    return c.json({ error: 'Failed to fetch recalibration history' }, 500);
  }
});

// Get all online cash recalibrations (for all stores)
app.get('/make-server-c2dd9b9d/online-cash-recalibration/all', async (c) => {
  const windowed = requestedDateRange(c);
  if ('error' in windowed) return c.json({ error: windowed.error }, 400);

  try {
    const allRecalibrations = windowed.range
      ? await getAllByPrefixWithRetry('online-cash-recalibration:', windowed.range)
      : await kvWithRetry.getByPrefix('online-cash-recalibration:');
    
    console.log(`📊 Fetching all recalibrations:`, {
      count: allRecalibrations?.length || 0
    });
    
    return c.json({ data: allRecalibrations || [] });
  } catch (error) {
    console.error('Error fetching all online cash recalibrations:', error);
    return c.json({ error: 'Failed to fetch all recalibrations' }, 500);
  }
});

// Save online cash recalibration (one per store PER DATE, so a cluster head can log a
// separate weekly Sunday reconciliation each week without overwriting earlier weeks).
app.post('/make-server-c2dd9b9d/online-cash-recalibration', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  if (auth.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only the cluster head can log an online cash recalibration' }, 403);
  }

  try {
    const recalibration = await c.req.json();
    if (!recalibration.date) {
      return c.json({ error: 'date is required' }, 400);
    }

    console.log('💾 [SERVER] ===== SAVING RECALIBRATION =====');
    console.log('🏪 [SERVER] Store ID:', recalibration.storeId);
    console.log('📅 [SERVER] Date:', recalibration.date);
    console.log('💰 [SERVER] Actual Balance:', recalibration.actualBalance);

    // Use the exact date as part of the key (one recalibration per date per store)
    const key = `online-cash-recalibration:${recalibration.storeId}:${recalibration.date}`;
    console.log('🔑 [SERVER] Storage key:', key);

    // createdAt is when the count was taken - same-day top-ups approved after it still come off
    // the counted figure. The app edits a recalibration by re-saving it here, which used to
    // re-stamp createdAt with the edit time and silently reclassify that day's top-ups; an
    // edit keeps the original count time.
    const existing = await kvWithRetry.get(key);
    const timestamp = existing?.createdAt || existing?.timestamp || recalibration.createdAt || new Date().toISOString();
    const recalibrationWithTimestamp = {
      ...recalibration,
      month: recalibration.date.substring(0, 7), // kept for display/backward-compat only
      id: `ONLINE-CASH-RECAL-${recalibration.storeId}-${recalibration.date}`,
      createdAt: timestamp,
      timestamp: timestamp, // For backward compatibility
      ...(existing ? { updatedAt: new Date().toISOString() } : {})
    };

    console.log('🆔 [SERVER] Generated ID:', recalibrationWithTimestamp.id);
    console.log('⏰ [SERVER] Timestamp:', timestamp);

    await kvWithRetry.set(key, recalibrationWithTimestamp);

    console.log(`✅ [SERVER] Online cash recalibration saved to KV store`);
    console.log('💾 [SERVER] ===== END SAVING RECALIBRATION =====\n');

    // This recalibration is now the authoritative anchor for its own date - ripple it
    // forward so every later day's stored Paytm balance reflects it immediately, instead
    // of waiting for some unrelated settlement/topup edit to happen to trigger a recompute.
    await cascadeRecomputePaytmBalances(recalibration.storeId, recalibration.date);

    return c.json({ success: true, recalibration: recalibrationWithTimestamp });
  } catch (error) {
    console.error('❌ [SERVER] Error saving online cash recalibration:', error);
    return c.json({ error: 'Failed to save recalibration' }, 500);
  }
});

// Update online cash recalibration
app.put('/make-server-c2dd9b9d/online-cash-recalibration/:id', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  if (auth.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only the cluster head can edit an online cash recalibration' }, 403);
  }

  try {
    const recalibrationId = c.req.param('id');
    const updates = await c.req.json();

    console.log('🔄 Updating recalibration ID:', recalibrationId);

    // Parse the ID to get storeId and date
    // ID format: ONLINE-CASH-RECAL-{storeId}-{YYYY-MM-DD}
    // Example: ONLINE-CASH-RECAL-STORE-1766938921191-9LCH05-2026-08-09
    const prefix = 'ONLINE-CASH-RECAL-';
    if (!recalibrationId.startsWith(prefix)) {
      return c.json({ error: 'Invalid recalibration ID format' }, 400);
    }

    const afterPrefix = recalibrationId.substring(prefix.length);
    // The last 10 characters should be YYYY-MM-DD (e.g., "2026-08-09")
    const date = afterPrefix.slice(-10);
    const storeId = afterPrefix.slice(0, -11); // Everything before the date and its separator hyphen

    console.log('📝 Parsed storeId:', storeId, 'date:', date);

    const key = `online-cash-recalibration:${storeId}:${date}`;

    // Get existing recalibration
    const existing = await kvWithRetry.get(key);
    if (!existing) {
      console.log('❌ Recalibration not found at key:', key);
      return c.json({ error: 'Recalibration not found' }, 404);
    }

    // Merge updates with existing data. The count time never changes on an edit - later
    // top-ups are split off against it (see the POST route above).
    const updated = {
      ...existing,
      ...updates,
      id: recalibrationId, // Keep the ID
      createdAt: existing.createdAt || existing.timestamp,
      timestamp: existing.timestamp || existing.createdAt,
      updatedAt: new Date().toISOString(),
    };

    // If date is updated, move to the new key
    let cascadeFromDate = date;
    if (updates.date && updates.date !== date) {
      const newDate = updates.date;
      await kvWithRetry.del(key);
      const newKey = `online-cash-recalibration:${storeId}:${newDate}`;
      updated.id = `ONLINE-CASH-RECAL-${storeId}-${newDate}`;
      updated.month = newDate.substring(0, 7);
      await kvWithRetry.set(newKey, updated);
      console.log(`✅ Online cash recalibration moved from ${date} to ${newDate}`);
      // Recompute from whichever date is earlier - the old date's anchor override no
      // longer applies from there, and the new date's does from wherever it now sits.
      cascadeFromDate = date < newDate ? date : newDate;
    } else {
      await kvWithRetry.set(key, updated);
      console.log(`✅ Online cash recalibration updated: ${key}`);
    }

    await cascadeRecomputePaytmBalances(storeId, cascadeFromDate);

    return c.json({ success: true, recalibration: updated });
  } catch (error) {
    console.error('❌ Error updating online cash recalibration:', error);
    return c.json({ error: 'Failed to update recalibration', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Delete online cash recalibration
app.delete('/make-server-c2dd9b9d/online-cash-recalibration/:id', async (c) => {
  const auth = await verifyUser(c.req.header('Authorization'));
  if ('error' in auth) {
    return c.json({ error: auth.error }, auth.status);
  }
  if (auth.user.user_metadata?.role !== 'cluster_head') {
    return c.json({ error: 'Only the cluster head can delete an online cash recalibration' }, 403);
  }

  try {
    const recalibrationId = c.req.param('id');
    console.log('🗑️ Deleting online cash recalibration with ID:', recalibrationId);

    // Parse the ID to get storeId and date
    // ID format: ONLINE-CASH-RECAL-{storeId}-{YYYY-MM-DD}
    // Example: ONLINE-CASH-RECAL-STORE-1766938921191-9LCH05-2026-08-09
    const prefix = 'ONLINE-CASH-RECAL-';
    if (!recalibrationId.startsWith(prefix)) {
      return c.json({ error: 'Invalid recalibration ID format' }, 400);
    }

    const afterPrefix = recalibrationId.substring(prefix.length);
    // The last 10 characters should be YYYY-MM-DD (e.g., "2026-08-09")
    const date = afterPrefix.slice(-10);
    const storeId = afterPrefix.slice(0, -11); // Everything before the date and its separator hyphen

    console.log('📝 Parsed storeId:', storeId, 'date:', date);

    // Get all recalibrations for this store using prefix search
    const allRecalibrations = await kvWithRetry.getByPrefix(`online-cash-recalibration:${storeId}:`);
    console.log('🔍 Found recalibrations for store:', allRecalibrations?.length || 0);

    if (!allRecalibrations || allRecalibrations.length === 0) {
      console.log('❌ No recalibrations found for store:', storeId);
      return c.json({ error: 'No recalibrations found for this store' }, 404);
    }

    // Find the one matching the date
    const targetRecal = allRecalibrations.find((r: any) => r.date === date);

    if (!targetRecal) {
      console.log('❌ No recalibration found for date:', date);
      console.log('Available dates:', allRecalibrations.map((r: any) => r.date));
      return c.json({ error: 'Recalibration not found for this date' }, 404);
    }

    console.log('✅ Found target recalibration:', {
      id: targetRecal.id,
      storeId: targetRecal.storeId,
      date: targetRecal.date
    });

    // Construct the key and delete
    const key = `online-cash-recalibration:${storeId}:${date}`;
    console.log('🔑 Deleting key:', key);

    await kvWithRetry.del(key);
    console.log(`✅ Online cash recalibration deleted: ${key}`);

    // The anchor override for this date is gone - every day from here forward needs to
    // fall back to the formula (or an earlier/later recalibration, if one exists).
    await cascadeRecomputePaytmBalances(storeId, date);

    return c.json({ success: true, message: 'Recalibration deleted successfully' });
  } catch (error) {
    console.error('❌ Error deleting online cash recalibration:', error);
    return c.json({ error: 'Failed to delete recalibration', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// ============================================
// INVESTOR MANAGEMENT
// ============================================

// Create a new investor
app.post('/make-server-c2dd9b9d/investors', async (c) => {
  try {
    const investorData = await c.req.json();
    
    // Generate unique ID
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    const investorId = `INVESTOR-${timestamp}-${randomStr}`;
    
    const investor = {
      ...investorData,
      id: investorId,
      createdAt: getNowIST(),
    };
    
    const key = `investor:${investorId}`;
    await kvWithRetry.set(key, investor);
    
    console.log(`✅ Investor created: ${key}`, investor);
    
    return c.json({ success: true, investor });
  } catch (error) {
    console.error('❌ Error creating investor:', error);
    return c.json({ error: 'Failed to create investor', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Get all investors
app.get('/make-server-c2dd9b9d/investors', async (c) => {
  try {
    const investors = await kvWithRetry.getByPrefix('investor:');
    
    // Sort by name
    const sorted = (investors || []).sort((a: any, b: any) => 
      a.name.localeCompare(b.name)
    );
    
    console.log(`📊 Fetched ${sorted.length} investors`);
    
    return c.json({ success: true, investors: sorted });
  } catch (error) {
    console.error('❌ Error fetching investors:', error);
    return c.json({ error: 'Failed to fetch investors', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Update investor
app.put('/make-server-c2dd9b9d/investors/:id', async (c) => {
  try {
    const investorId = c.req.param('id');
    const updateData = await c.req.json();
    
    const key = `investor:${investorId}`;
    const existing = await kvWithRetry.get(key);
    
    if (!existing) {
      return c.json({ error: 'Investor not found' }, 404);
    }
    
    const updatedInvestor = {
      ...existing,
      ...updateData,
    };
    
    await kvWithRetry.set(key, updatedInvestor);
    
    console.log(`✅ Investor updated: ${key}`);
    
    return c.json({ success: true, investor: updatedInvestor });
  } catch (error) {
    console.error('❌ Error updating investor:', error);
    return c.json({ error: 'Failed to update investor', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Delete investor
app.delete('/make-server-c2dd9b9d/investors/:id', async (c) => {
  try {
    const investorId = c.req.param('id');
    
    const key = `investor:${investorId}`;
    await kvWithRetry.del(key);
    
    console.log(`✅ Investor deleted: ${key}`);
    
    return c.json({ success: true });
  } catch (error) {
    console.error('❌ Error deleting investor:', error);
    return c.json({ error: 'Failed to delete investor', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// ============================================
// ONLINE LOANS (Paytm/Online Cash Loans)
// ============================================

// Request a new loan - raised by an operations manager or cluster head for expenses over
// ₹5,000, requires cluster-head approval before it counts toward Paytm cash-in-hand (see
// the approve/reject routes below and calculatePaytmBalance's status gate).
app.post('/make-server-c2dd9b9d/online-loans', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    const role = authResult.user.user_metadata?.role;
    const designation = authResult.user.user_metadata?.designation;
    const isOperationsManager = role === 'manager' && designation !== 'store_incharge' && designation !== 'production_incharge';
    const isClusterHead = role === 'cluster_head';

    if (!isOperationsManager && !isClusterHead) {
      return c.json({ error: 'Only operations managers and cluster heads can request a loan' }, 403);
    }

    const loanData = await c.req.json();
    if (!loanData.loanAmount || loanData.loanAmount <= 5000) {
      return c.json({ error: 'Loans must be for more than ₹5,000' }, 400);
    }
    if (!loanData.storeId) {
      return c.json({ error: 'storeId is required' }, 400);
    }

    // Get investor name if investorId is provided
    let investorName = null;
    if (loanData.investorId) {
      const investor = await kvWithRetry.get(`investor:${loanData.investorId}`);
      if (investor) {
        investorName = investor.name;
      }
    }

    // Generate unique ID
    const timestamp = Date.now();
    const randomStr = Math.random().toString(36).substring(2, 8).toUpperCase();
    const loanId = `ONLINE-LOAN-${loanData.storeId}-${timestamp}-${randomStr}`;
    const requestedByName = authResult.user.user_metadata?.name || authResult.user.email;

    const loan = {
      ...loanData,
      id: loanId,
      status: 'pending',
      repaidAmount: 0,
      repaymentDate: null,
      repaymentType: null,
      investorName,
      requestedByName,
      requestedByUserId: authResult.user.id,
      approvedBy: null,
      approvedAt: null,
      rejectedBy: null,
      rejectedAt: null,
      rejectionReason: null,
      createdAt: getNowIST(),
    };

    const key = `online-loan:${loanData.storeId}:${loanId}`;
    await kvWithRetry.set(key, loan);

    console.log(`✅ Online loan requested: ${key}`, loan);

    // Notify all cluster heads (mirrors the Cash Top-up Request pattern)
    const clusterHeads = await getAllClusterHeads();
    for (const clusterHead of clusterHeads) {
      if (clusterHead.authUserId) {
        await notifyUser(
          clusterHead.authUserId,
          'loan_requested',
          'Loan Approval Needed',
          `${requestedByName} requested a loan of ₹${loanData.loanAmount.toLocaleString()} for ${loanData.storeName || loanData.storeId}`,
          loanId,
          loanData.loanDate
        );
      }
    }

    return c.json({ success: true, loan });
  } catch (error) {
    console.error('❌ Error creating online loan:', error);
    return c.json({ error: 'Failed to create loan', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Approve a pending loan (cluster head only) - counts toward Paytm cash-in-hand from here
app.post('/make-server-c2dd9b9d/online-loans/:id/approve', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    if (authResult.user.user_metadata?.role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can approve loans' }, 403);
    }

    const loanId = c.req.param('id');
    const idParts = loanId.split('-');
    if (idParts.length < 4) {
      return c.json({ error: 'Invalid loan ID format' }, 400);
    }
    const storeId = idParts.slice(2, -2).join('-');
    const key = `online-loan:${storeId}:${loanId}`;

    const existing = await kvWithRetry.get(key);
    if (!existing) {
      return c.json({ error: 'Loan not found' }, 404);
    }
    if (existing.status !== 'pending') {
      return c.json({ error: 'This loan has already been resolved' }, 400);
    }

    const approved = {
      ...existing,
      status: 'active',
      approvedBy: authResult.user.email,
      approvedAt: getNowIST(),
    };
    await kvWithRetry.set(key, approved);
    // An approved loan adds to Paytm on its loanDate - refresh the stored balances from there.
    if (existing.storeId && existing.loanDate) {
      await cascadeRecomputePaytmBalances(existing.storeId, existing.loanDate);
    }

    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    if (existing.requestedByUserId) {
      await notifyUser(
        existing.requestedByUserId,
        'loan_approved',
        'Loan Approved ✓',
        `${clusterHeadName} approved your loan request of ₹${existing.loanAmount.toLocaleString()}`,
        loanId,
        existing.loanDate
      );
    }

    return c.json({ success: true, loan: approved });
  } catch (error) {
    console.error('❌ Error approving loan:', error);
    return c.json({ error: 'Failed to approve loan' }, 500);
  }
});

// Reject a pending loan (cluster head only)
app.post('/make-server-c2dd9b9d/online-loans/:id/reject', async (c) => {
  const authResult = await verifyUser(c.req.header('Authorization'));
  if ('error' in authResult) {
    return c.json({ error: authResult.error }, authResult.status);
  }

  try {
    if (authResult.user.user_metadata?.role !== 'cluster_head') {
      return c.json({ error: 'Only cluster heads can reject loans' }, 403);
    }

    const loanId = c.req.param('id');
    const { reason } = await c.req.json();
    const idParts = loanId.split('-');
    if (idParts.length < 4) {
      return c.json({ error: 'Invalid loan ID format' }, 400);
    }
    const storeId = idParts.slice(2, -2).join('-');
    const key = `online-loan:${storeId}:${loanId}`;

    const existing = await kvWithRetry.get(key);
    if (!existing) {
      return c.json({ error: 'Loan not found' }, 404);
    }
    if (existing.status !== 'pending') {
      return c.json({ error: 'This loan has already been resolved' }, 400);
    }

    const rejected = {
      ...existing,
      status: 'rejected',
      rejectedBy: authResult.user.email,
      rejectedAt: getNowIST(),
      rejectionReason: reason || '',
    };
    await kvWithRetry.set(key, rejected);

    const clusterHeadName = authResult.user.user_metadata?.name || authResult.user.email;
    if (existing.requestedByUserId) {
      await notifyUser(
        existing.requestedByUserId,
        'loan_rejected',
        'Loan Rejected ✗',
        `${clusterHeadName} rejected your loan request of ₹${existing.loanAmount.toLocaleString()}${reason ? `: ${reason}` : ''}`,
        loanId,
        existing.loanDate
      );
    }

    return c.json({ success: true, loan: rejected });
  } catch (error) {
    console.error('❌ Error rejecting loan:', error);
    return c.json({ error: 'Failed to reject loan' }, 500);
  }
});

// Get all loans (optionally filter by store)
app.get('/make-server-c2dd9b9d/online-loans', async (c) => {
  try {
    const storeId = c.req.query('storeId');
    
    const prefix = storeId ? `online-loan:${storeId}:` : 'online-loan:';
    const loans = await kvWithRetry.getByPrefix(prefix);
    
    // Sort by loanDate descending (newest first)
    const sorted = (loans || []).sort((a: any, b: any) => {
      const dateA = new Date(a.loanDate).getTime();
      const dateB = new Date(b.loanDate).getTime();
      return dateB - dateA;
    });
    
    console.log(`📊 Fetched ${sorted.length} online loans for store ${storeId || 'all'}`);
    
    return c.json({ success: true, loans: sorted });
  } catch (error) {
    console.error('❌ Error fetching online loans:', error);
    return c.json({ error: 'Failed to fetch loans', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Repay a loan (partial or full)
app.put('/make-server-c2dd9b9d/online-loans/:id/repay', async (c) => {
  try {
    const loanId = c.req.param('id');
    const repaymentData = await c.req.json();
    
    // Extract storeId from loanId
    const idParts = loanId.split('-');
    if (idParts.length < 4) {
      return c.json({ error: 'Invalid loan ID format' }, 400);
    }
    
    // Find the store ID (between LOAN and timestamp)
    const storeId = idParts.slice(2, -2).join('-');
    const key = `online-loan:${storeId}:${loanId}`;
    
    // Get existing loan
    const existing = await kvWithRetry.get(key);
    if (!existing) {
      return c.json({ error: 'Loan not found' }, 404);
    }
    const repaymentAmount = Number(repaymentData.repaymentAmount);
    const repaymentDate = repaymentData.repaymentDate;
    if (!(repaymentAmount > 0) || typeof repaymentDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(repaymentDate)) {
      return c.json({ error: 'A repayment needs an amount and a date' }, 400);
    }
    if (existing.status !== 'active') {
      return c.json({ error: 'Only an approved loan that is still outstanding can be repaid' }, 400);
    }

    // Calculate new repaid amount
    const newRepaidAmount = (existing.repaidAmount || 0) + repaymentAmount;

    // Check if loan is fully repaid
    const isFullyRepaid = newRepaidAmount >= existing.loanAmount;

    // Each repayment is kept with its own date so Paytm drops on the day the money actually
    // went out. A partial repayment used to only bump repaidAmount - no date anywhere - so it
    // never moved Paytm until the loan was finished, and then the whole amount landed on the
    // final day. Partial repayments made before this list existed are carried in as one entry
    // on the day of the last of them (updatedAt holds IST wall time, so its first 10
    // characters are that IST date).
    const earlierRepayments = Array.isArray(existing.repayments)
      ? existing.repayments
      : (existing.repaidAmount || 0) > 0
        ? [{ date: (typeof existing.updatedAt === 'string' && existing.updatedAt.substring(0, 10)) || repaymentDate, amount: existing.repaidAmount, carriedOver: true }]
        : [];
    const repayments = [...earlierRepayments, { date: repaymentDate, amount: repaymentAmount, recordedAt: new Date().toISOString() }];

    const updated = {
      ...existing,
      repaidAmount: newRepaidAmount,
      repayments,
      status: isFullyRepaid ? 'repaid' : 'active',
      repaymentDate: isFullyRepaid ? repaymentDate : existing.repaymentDate,
      repaymentType: isFullyRepaid ? 'full' : 'partial',
      notes: repaymentData.notes ? `${existing.notes}\n[Repayment on ${repaymentDate}]: ${repaymentData.notes}` : existing.notes,
      updatedAt: getNowIST(),
    };

    await kvWithRetry.set(key, updated);

    // Paytm moves on this repayment's date (and on the carried-over one, the first time).
    const newEntries = Array.isArray(existing.repayments) ? [] : earlierRepayments;
    const cascadeFrom = newEntries.reduce((min: string, r: any) => (r.date < min ? r.date : min), repaymentDate);
    if (existing.storeId) {
      await cascadeRecomputePaytmBalances(existing.storeId, cascadeFrom);
    }

    console.log(`✅ Online loan repayment processed: ${key}`, {
      repaidAmount: repaymentData.repaymentAmount,
      totalRepaid: newRepaidAmount,
      status: updated.status
    });
    
    return c.json({ success: true, loan: updated });
  } catch (error) {
    console.error('❌ Error repaying online loan:', error);
    return c.json({ error: 'Failed to process loan repayment', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Get all loans across all stores
app.get('/make-server-c2dd9b9d/online-loans/all', async (c) => {
  try {
    const loans = await kvWithRetry.getByPrefix('online-loan:');
    
    // Sort by loanDate descending (newest first)
    const sorted = (loans || []).sort((a: any, b: any) => {
      const dateA = new Date(a.loanDate).getTime();
      const dateB = new Date(b.loanDate).getTime();
      return dateB - dateA;
    });
    
    console.log(`📊 Fetched ${sorted.length} online loans (all stores)`);
    
    return c.json({ success: true, loans: sorted });
  } catch (error) {
    console.error('❌ Error fetching all online loans:', error);
    return c.json({ error: 'Failed to fetch loans', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// Get all loan repayments (for analytics)
app.get('/make-server-c2dd9b9d/online-loans/repayments', async (c) => {
  try {
    const loans = await kvWithRetry.getByPrefix('online-loan:');
    
    // Filter loans that have repayments
    const repaymentsData = (loans || [])
      .filter((loan: any) => loan.repaidAmount > 0)
      .map((loan: any) => ({
        id: loan.id,
        storeId: loan.storeId,
        storeName: loan.storeName,
        investorId: loan.investorId,
        investorName: loan.investorName,
        loanAmount: loan.loanAmount,
        repaidAmount: loan.repaidAmount,
        interestRate: loan.interestRate,
        loanDate: loan.loanDate,
        repaymentDate: loan.repaymentDate,
        status: loan.status,
        repaymentType: loan.repaymentType,
      }))
      .sort((a: any, b: any) => {
        const dateA = new Date(a.repaymentDate || a.loanDate).getTime();
        const dateB = new Date(b.repaymentDate || b.loanDate).getTime();
        return dateB - dateA;
      });
    
    console.log(`📊 Fetched ${repaymentsData.length} loan repayments`);
    
    return c.json({ success: true, repayments: repaymentsData });
  } catch (error) {
    console.error('❌ Error fetching loan repayments:', error);
    return c.json({ error: 'Failed to fetch repayments', details: error instanceof Error ? error.message : String(error) }, 500);
  }
});

// What events.ts needs from here (also used by runPosSync, which runs only after start-up).
const eventsDeps: EventsDeps = {
  kv: kvWithRetry,
  verifyUser,
  getAllByPrefix: getAllByPrefixWithRetry,
  getTodayIST,
  notifyUser: (id, type, title, message, relatedId, relatedDate) => notifyUser(id, type, title, message, relatedId, relatedDate),
  getAllClusterHeads,
  getOperationsManagers,
  cascadeRecomputePaytmBalances,
  inPosQuietHours,
  ciferonOrderDate: getCiferonOrderDate,
  afterResponse,
};

// Full backup / restore and the nightly encrypted copy to Google Drive (backup.ts).
registerBackupRoutes(app, { supabase, kv: kvWithRetry, verifyUser, appVersion: LATEST_APP_VERSION, notifyClusterHeads: async (title, message) => { let sent = 0; for (const head of await getAllClusterHeads()) if (head.authUserId) { await notifyUser(head.authUserId, 'backup_failed', title, message); sent++; } return sent; } });

// Festival calendar, forecast and the Claude-written insights (insights.ts).
registerProfileRoutes(app, { kv: kvWithRetry, verifyUser });
registerAssetsRoutes(app, { kv: kvWithRetry, verifyUser, getAllByPrefix: getAllByPrefixWithRetry, getTodayIST, notifyUser: (u, type, title, message, relatedId, relatedDate) => notifyUser(u, type, title, message, relatedId, relatedDate) });
registerWorkplaceRoutes(app, { kv: kvWithRetry, verifyUser, getTodayIST, notifyUser, getAllClusterHeads, storage: supabase.storage });
// Recipe capture sheets, standards and cost per piece (recipes.ts).
registerRecipeRoutes(app, { kv: kvWithRetry, verifyUser, getTodayIST, getAllByPrefix: getAllByPrefixWithRetry, storage: supabase.storage });
// Shift clock-in/out, team KPIs and variable pay (attendance.ts, kpi.ts).
// The shift clock and KPIs; the attendance reminder uses the same deps to fill timesheets from punches.
const punchDeps = { kv: kvWithRetry, verifyUser, getAllByPrefix: getAllByPrefixWithRetry, notifyUser: (id: string, type: string, title: string, message: string, relatedId?: string, relatedDate?: string) => notifyUser(id, type, title, message, relatedId, relatedDate), timesheetPending: notifyTimesheetApprovers };
registerKpiRoutes(app, punchDeps);
// Event stalls: their own P&L, stock, cash, staff and sales (events.ts).
registerEventsRoutes(app, eventsDeps);
// Expense checks: flags on new entries, and the routes to list and decide them (expenseReview.ts).
registerExpenseReviewRoutes(app, expenseReviewDeps);
registerProductionReviewRoutes(app, expenseReviewDeps);
registerRepairRoutes(app, expenseReviewDeps);
// Customer complaints: photos, Bunny's reading, explanations, decisions (complaints.ts).
registerComplaintRoutes(app, { kv: kvWithRetry, getAllByPrefix: getAllByPrefixWithRetry, verifyUser, notifyUser, storage: supabase.storage, getTodayIST });
registerPaperworkRoutes(app, { kv: kvWithRetry, rows: getAllByPrefixWithRetry, verifyUser, storage: supabase.storage });
registerSiteAuditRoutes(app, {
  kv: kvWithRetry, verifyUser, notifyUser, storage: supabase.storage, getTodayIST,
  // A sign-in for an independent auditor: role audit, designation site_auditor (trusted keys are
  // mirrored into app_metadata), and a staff record that no staff list, KPI or payroll counts.
  createAuditorLogin: async ({ name, email, phone, password, createdBy }) => {
    const employeeId = await issueNextEmployeeId();
    const { data, error } = await supabase.auth.admin.createUser({
      email, password, email_confirm: true,
      user_metadata: { name, role: 'audit', designation: 'site_auditor', employeeId },
      // The owner typed the first password, so the auditor sets their own at first sign-in (passwords.ts).
      app_metadata: { mustChangePassword: true, passwordChangedAt: new Date().toISOString(), passwordChangedBy: 'owner' },
    });
    if (error || !data?.user) return { error: error?.message || 'Could not create the sign-in' };
    await kvWithRetry.set(`unified-employee:${employeeId}`, {
      id: employeeId, employeeId, name, email, phone, role: 'audit', designation: 'site_auditor', employmentType: 'contract',
      joiningDate: getTodayIST(), status: 'active', authUserId: data.user.id, createdBy, createdAt: new Date().toISOString(),
    });
    return { employeeId };
  },
});
registerInsightsRoutes(app, {
  kv: { ...kvWithRetry, getAllByPrefix: getAllByPrefixWithRetry },
  verifyUser,
  getTodayIST,
  notifyClusterHeads: async (type, title, message, relatedDate) => {
    let sent = 0;
    for (const clusterHead of await getAllClusterHeads()) {
      if (!clusterHead.authUserId) continue;
      await notifyUser(clusterHead.authUserId, type, title, message, undefined, relatedDate);
      sent++;
    }
    return sent;
  },
});
// Password rotation: status, self-service change, owner force reset, daily reminders (passwords.ts).
registerPasswordRoutes(app, { supabase, verifyUser, kv: kvWithRetry, notifyUser, forgetVerifiedTokens: () => verifiedTokens.clear() });
// Everything the app loads at startup in one request, built from the routes above (bootstrap.ts).
registerBootstrapRoutes(app, { verifyUser });

console.log('✅ Server initialization complete - all routes registered successfully');
console.log('🚀 Starting Deno server...');

try {
  Deno.serve(app.fetch);
  console.log('✅ Deno server started successfully');
} catch (serverError) {
  console.error('❌ CRITICAL: Failed to start Deno server:', serverError);
  console.error('Error details:', serverError instanceof Error ? serverError.stack : String(serverError));
  throw serverError;
}
