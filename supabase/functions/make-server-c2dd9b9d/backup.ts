// Full backup and restore of the business data, plus the nightly encrypted copy to Google Drive.
// Registered from index.ts (registerBackupRoutes). Owner (cluster head) only.
//
// Why it is built this way:
// - Every business record is a JSON row in kv_store_c2dd9b9d, so a backup is simply every row in
//   key order (minus short-lived rows, see SKIP_PREFIXES) plus the list of logins. The old in-app
//   backup saved only 11 lists the browser had loaded, and its restore re-created records through
//   the normal "add" routes with new IDs, which made duplicates. This one keeps the original keys.
// - An edge function call gets about 2 s of CPU and 256 MB of memory, so the work is cut into
//   steps. A step reads rows (up to 1000 at a time), packs them into sections of about 4 MB and
//   stops after about 24 MB or 0.8 s of busy time. Progress is kept in a backup-run: row, and the
//   next call carries on from the last key. Most days one call is enough.
// - File: "BNYBKUP1", a small plain JSON header (format version, PBKDF2 salt, AES-GCM IV, app
//   version, time), then sections. Each section is gzip'd NDJSON (one {k, v} per line) encrypted
//   with AES-256-GCM on its own. That lets a file made over several calls be streamed to Drive, and
//   lets the app send a file back a few sections at a time to check or restore it, so no call ever
//   holds the whole backup in memory.
// - The manifest (rows per prefix, SHA-256 of every section and of the whole payload) is the last
//   section, encrypted. It is only known once everything has been read, and a plain copy at the top
//   would tell anyone holding the file how many staff, sales days, etc. the business has.
// - The money, request and notification tables of the database overhaul (schema ledger, owner
//   29 Oct 2026: "include new tables [in the] Google Drive backup") follow the rows, a page at a
//   time through public.ledger_backup_page (service role only; the schema itself is private), as
//   type-3 sections {t: table, r: row}. Today they mirror the KV rows, so a restore still writes
//   KV only (the triggers refill the tables); after the switch-over they become the original.
// - The key comes from the BACKUP_PASSPHRASE secret (PBKDF2-SHA-256, 200k iterations, a new random
//   salt per file). Without that passphrase no backup can be read, by design, so the owner must
//   also keep it outside Supabase. BACKUP_PASSPHRASE_PREVIOUS (optional) still opens older files
//   after the passphrase is changed. scripts/backup-decrypt.mjs opens a file offline.
// Owner set-up: docs/backup-google-drive-setup.md.

import {
  DriveError, DriveResumableUpload, driveConfigured, driveUploadReceived, ensureDriveFolder,
  getDriveAccessToken, listDriveFiles, startResumableUpload, trashDriveFile,
} from './gdrive.ts';

type Kv = {
  get: <T = any>(key: string) => Promise<T>;
  set: (key: string, value: any) => Promise<any>;
  del: (key: string) => Promise<any>;
  mset: (keys: string[], values: any[]) => Promise<any>;
};
type Deps = {
  supabase: any; // the service-role client from index.ts
  kv: Kv;
  verifyUser: (authHeader: string | null) => Promise<any>;
  appVersion: string;
  // Push + in-app notification to every cluster head (used when the nightly backup fails).
  notifyClusterHeads?: (title: string, message: string) => Promise<number>;
};

const P = '/make-server-c2dd9b9d';
const TABLE = 'kv_store_c2dd9b9d';
const MAGIC = 'BNYBKUP1';
const FORMAT = 'bunny-momos-backup';
const FORMAT_VERSION = 1;
const PBKDF2_ITERATIONS = 200_000;
const MiB = 1024 * 1024;
const PAGE_ROWS = 1000;
// Rows that can hold photos (receipt photos up to 900 KB, Aadhaar images on employee records) or
// whole old data dumps (legacy backup: rows, if any are left) are read 10 at a time, so a page of
// them cannot blow the 256 MB memory limit.
const HEAVY_PAGE_ROWS = 10;
const HEAVY_PREFIXES = new Set(['delivery-photo:', 'unified-employee:', 'unified_employee:', 'employee:', 'employee_', 'archived-employee:', 'backup:']);
const isHeavy = (prefix: string) => HEAVY_PREFIXES.has(prefix) || /photo|image|aadha/i.test(prefix);
const SECTION_RAW_TARGET = 4 * MiB;
const STEP_RAW_BUDGET = 24 * MiB;
// Measured busy time of the CPU-heavy parts (JSON, gzip, encryption). Kept well under the 2 s
// limit because the time spent parsing database replies inside supabase-js is only estimated.
const STEP_BUSY_MS = 800;
const RUN_STALE_MS = 6 * 3600_000;
const LOCK_STALE_MS = 5 * 60_000;
const MAX_STEP_ATTEMPTS = 3;
const MAX_UPLOAD_BYTES = 64 * MiB;
const KEEP_DAILY = 30;
const KEEP_MONTHLY = 12;
const DRIVE_RUN_KEY = 'backup-run:drive';
const STATUS_KEY = 'backup-status:last';
const DOWNLOAD_STATUS_KEY = 'backup-status:download';
// Under the Drive root folder (GDRIVE_FOLDER_ID); the workplace photos use "Workplace photos/".
const DRIVE_BACKUP_FOLDER = ['Backups'];

// Section types.
const T_ROWS = 1;
const T_AUTH = 2;
const T_TABLE = 3;
const T_MANIFEST = 9;
// The database overhaul's tables (schema ledger), in the order they are written.
const LEDGER_TABLES = [
  'sales_days', 'online_sales_days', 'purchases', 'running_costs', 'fixed_costs', 'payouts',
  'stock_requests', 'stock_request_lines', 'cash_topups', 'notifications', 'mirror_checks', 'mirror_issues',
];
const TABLE_PAGE_ROWS = 500;

// Short-lived rows that mean nothing a day later or are rebuilt on their own: live rider
// positions, cached ETAs and forecast checks, one-time approve/reject links, per-person AI
// allowance counters, "reminder already sent" flags, and this file's own progress, lock, status
// and safety-copy rows (a restore must never bring back an old lock or an old status).
export const SKIP_PREFIXES = [
  'rider-location:', 'rider-eta:', 'quick_action_token:', 'ai-user-usage:', 'forecast-check:',
  'notified_pending_request:', 'eod_alert_sent:',
  'backup-run:', 'backup-lock:', 'backup-status:', 'restore-snapshot:',
];
const SKIP_PATTERNS = [/^[a-z_]+_reminder_sent:/, /^[a-z0-9_-]*(cache|verified)[a-z0-9_-]*:/i];
export const isSkipped = (key: string) => SKIP_PREFIXES.some((p) => key.startsWith(p)) || SKIP_PATTERNS.some((r) => r.test(key));

// Older record types use underscores instead of a colon (production_house_<id> etc.).
const UNDERSCORE_FAMILIES = [
  'production_house_', 'production_request_', 'stock_request_', 'inventory_item_', 'sales_data_',
  'recalibration_', 'employee_', 'inventory_', 'production_',
];
// The record type a key belongs to: "sales:2026-10-01:s1" -> "sales:". Used for the counts in the
// manifest and for choosing what to restore, so it must stay the same in every version.
export function prefixOf(key: string): string {
  const colon = key.indexOf(':');
  if (colon !== -1) return key.slice(0, colon + 1);
  const family = UNDERSCORE_FAMILIES.find((f) => key.startsWith(f));
  if (family) return family;
  const m = key.match(/^(.*?[_-])[0-9]/);
  return m ? m[1] : key;
}

class BackupError extends Error {
  status: number;
  constructor(message: string, status = 400) {
    super(message);
    this.status = status;
  }
}

const te = new TextEncoder();
const td = new TextDecoder();
const errText = (e: unknown) => (e instanceof Error ? e.message : String(e));

// ---------- small byte helpers ----------
function b64(bytes: Uint8Array): string {
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return btoa(s);
}
function unb64(text: string): Uint8Array {
  const s = atob(text);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}
function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let off = 0;
  for (const p of parts) { out.set(p, off); off += p.length; }
  return out;
}
async function sha256Hex(data: Uint8Array | string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', typeof data === 'string' ? te.encode(data) : data);
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}
async function gzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
async function gunzip(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream('gzip'));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
// [u32 length][JSON][bytes] - used for download replies and for files sent back by the app, so
// a binary body can carry a little JSON with it (the CORS set-up exposes no custom headers).
function envelope(meta: unknown, body: Uint8Array): Uint8Array {
  const m = te.encode(JSON.stringify(meta));
  const out = new Uint8Array(4 + m.length + body.length);
  new DataView(out.buffer).setUint32(0, m.length);
  out.set(m, 4);
  out.set(body, 4 + m.length);
  return out;
}

// ---------- time ----------
const istIso = (iso: string) => new Date(Date.parse(iso) + 330 * 60000).toISOString();
const istDate = (iso: string) => istIso(iso).slice(0, 10);
const istStamp = (iso: string) => istIso(iso).slice(0, 16).replace('T', '-').replace(':', '');
const istText = (iso: string) => `${istIso(iso).slice(0, 16).replace('T', ' ')} IST`;
const newRunId = () => `${istIso(new Date().toISOString()).slice(0, 19).replace(/[T:]/g, '-')}-${b64(crypto.getRandomValues(new Uint8Array(3))).replace(/[+/=]/g, 'x')}`;

// ---------- encryption ----------
function requirePassphrase(): string {
  const pass = Deno.env.get('BACKUP_PASSPHRASE');
  if (!pass) throw new BackupError('Backups are switched off: the BACKUP_PASSPHRASE secret is not set. See docs/backup-google-drive-setup.md, step 1.', 503);
  if (pass.length < 12) throw new BackupError('BACKUP_PASSPHRASE is too short. Use at least 12 characters (docs/backup-google-drive-setup.md, step 1).', 503);
  return pass;
}
const passphrases = () => [Deno.env.get('BACKUP_PASSPHRASE'), Deno.env.get('BACKUP_PASSPHRASE_PREVIOUS')].filter((p): p is string => !!p);

// PBKDF2 at 200k iterations costs real CPU, and a restore sends many requests for the same file,
// so a warm worker keeps the keys it has already worked out.
const keyCache = new Map<string, CryptoKey>();
async function deriveKey(pass: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const id = `${await sha256Hex(pass)}|${b64(salt)}|${iterations}`;
  const hit = keyCache.get(id);
  if (hit) return hit;
  const base = await crypto.subtle.importKey('raw', te.encode(pass), 'PBKDF2', false, ['deriveKey']);
  const key = await crypto.subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, base,
    { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt'],
  );
  if (keyCache.size > 20) keyCache.clear();
  keyCache.set(id, key);
  return key;
}
// Each section gets its own IV: the file's IV with the section number XORed into the last 4
// bytes. Reordering sections therefore fails to decrypt instead of silently mixing data.
function sectionIv(iv: Uint8Array, index: number): Uint8Array {
  const out = iv.slice();
  const dv = new DataView(out.buffer);
  dv.setUint32(8, dv.getUint32(8) ^ index);
  return out;
}
// The header and the section type are authenticated too, so neither can be swapped.
const sectionAad = (headerJson: Uint8Array, type: number) => concat([headerJson, new Uint8Array([type])]);

async function sealSection(key: CryptoKey, iv: Uint8Array, headerJson: Uint8Array, type: number, index: number, raw: Uint8Array) {
  const sha256 = await sha256Hex(raw);
  const packed = await gzip(raw);
  const cipher = new Uint8Array(await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv: sectionIv(iv, index), additionalData: sectionAad(headerJson, type) }, key, packed,
  ));
  const out = new Uint8Array(13 + cipher.length);
  const dv = new DataView(out.buffer);
  out[0] = type;
  dv.setUint32(1, index);
  dv.setUint32(5, raw.length);
  dv.setUint32(9, cipher.length);
  out.set(cipher, 13);
  return { bytes: out, sha256 };
}

type ParsedSection = { type: number; index: number; rawLen: number; cipher: Uint8Array };
type ParsedFile = { header: any; headerJson: Uint8Array; sections: ParsedSection[] };

function parseFile(buf: Uint8Array): ParsedFile {
  if (buf.length < 12 || td.decode(buf.subarray(0, 8)) !== MAGIC) {
    throw new BackupError('This is not a Bunny Momos backup file (files from the old Backup page cannot be used here).');
  }
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const headerLen = dv.getUint32(8);
  if (12 + headerLen > buf.length) throw new BackupError('The backup file is cut off.');
  const headerJson = buf.subarray(12, 12 + headerLen);
  let header: any;
  try { header = JSON.parse(td.decode(headerJson)); } catch { throw new BackupError('The backup file header is damaged.'); }
  if (header?.format !== FORMAT || header?.version !== FORMAT_VERSION) {
    throw new BackupError(`This backup was made by a different app version (format ${header?.version}); update the app first.`);
  }
  const sections: ParsedSection[] = [];
  let off = 12 + headerLen;
  while (off < buf.length) {
    if (off + 13 > buf.length) throw new BackupError('The backup file is cut off part-way through.');
    const len = dv.getUint32(off + 9);
    if (off + 13 + len > buf.length) throw new BackupError('The backup file is cut off part-way through.');
    sections.push({ type: buf[off], index: dv.getUint32(off + 1), rawLen: dv.getUint32(off + 5), cipher: buf.subarray(off + 13, off + 13 + len) });
    off += 13 + len;
  }
  return { header, headerJson, sections };
}

type Opened = { file: ParsedFile; key: CryptoKey; iv: Uint8Array; manifest: any };

async function decryptSection(o: { key: CryptoKey; iv: Uint8Array; file: ParsedFile }, s: ParsedSection): Promise<Uint8Array> {
  const packed = new Uint8Array(await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: sectionIv(o.iv, s.index), additionalData: sectionAad(o.file.headerJson, s.type) }, o.key, s.cipher,
  ));
  const raw = await gunzip(packed);
  if (raw.length !== s.rawLen) throw new BackupError(`Section ${s.index} has the wrong length.`);
  return raw;
}

// Finds the passphrase that opens this file by trying it on the manifest, which the app sends
// with every request.
async function openFile(buf: Uint8Array): Promise<Opened> {
  const file = parseFile(buf);
  const kdf = file.header.kdf || {};
  const iterations = Number(kdf.iterations);
  if (kdf.name !== 'PBKDF2' || !(iterations >= 10_000 && iterations <= 5_000_000)) throw new BackupError('The backup file header is damaged.');
  const salt = unb64(kdf.salt);
  const iv = unb64(file.header.cipher?.iv || '');
  if (iv.length !== 12) throw new BackupError('The backup file header is damaged.');
  const manifestSection = file.sections.find((s) => s.type === T_MANIFEST);
  if (!manifestSection) throw new BackupError('The closing part of the backup (its list of contents) is missing - the file was probably cut off while saving.');
  requirePassphrase();
  for (const pass of passphrases()) {
    const key = await deriveKey(pass, salt, iterations);
    let raw: Uint8Array;
    try { raw = await decryptSection({ key, iv, file }, manifestSection); } catch { continue; }
    return { file, key, iv, manifest: JSON.parse(td.decode(raw)) };
  }
  throw new BackupError('This backup cannot be opened with the passphrase set now (BACKUP_PASSPHRASE, or BACKUP_PASSPHRASE_PREVIOUS for older files), or the file is damaged.');
}

type Row = { k: string; v: any; size: number };

// Decrypts a section, checks it against the manifest's SHA-256 and row count, and returns its lines.
async function readSection(o: Opened, s: ParsedSection): Promise<Row[]> {
  const info = (o.manifest.sections || []).find((x: any) => x.i === s.index && x.type === s.type);
  if (!info) throw new BackupError(`Section ${s.index} is not listed in the backup's contents.`);
  let raw: Uint8Array;
  try { raw = await decryptSection(o, s); } catch (e) {
    throw e instanceof BackupError ? e : new BackupError(`Section ${s.index} is damaged (it does not decrypt).`);
  }
  if ((await sha256Hex(raw)) !== info.sha256) throw new BackupError(`Section ${s.index} does not match its checksum.`);
  const text = td.decode(raw);
  const rows: Row[] = [];
  for (const line of text.split('\n')) {
    if (!line) continue;
    const row = JSON.parse(line);
    if (s.type === T_ROWS && typeof row?.k !== 'string') throw new BackupError(`Section ${s.index} has a line without a key.`);
    rows.push({ k: row.k, v: s.type === T_ROWS ? row.v : row, size: line.length });
  }
  if (rows.length !== info.rows) throw new BackupError(`Section ${s.index} has ${rows.length} rows, its contents list says ${info.rows}.`);
  return rows;
}

// ---------- export engine ----------
type SectionInfo = { i: number; type: number; rows: number; raw: number; sha256: string; lastKey?: string };
type RunState = {
  id: string;
  kind: 'download' | 'drive';
  by?: string;
  startedAt: string;
  updatedAt: string;
  appVersion: string;
  salt: string;
  iv: string;
  header: string; // base64 of the header JSON (it is authenticated with every section)
  next: number; // next section number
  phase: 'auth' | 'rows' | 'tables' | 'done';
  table?: number; // which LEDGER_TABLES entry is being written
  tableAfter?: string | null; // cursor within it (the page function's sort key)
  tables?: Record<string, number>;
  tablesSkipped?: string;
  afterKey: string | null; // cursor: everything up to and including this key is written
  pageRows: number;
  rows: number;
  skipped: number;
  raw: number;
  out: number;
  authUsers: number;
  prefixes: Record<string, number>;
  sections: SectionInfo[];
  steps: number;
  attempts: number;
  lastError?: string;
  drive?: { session: string; uploaded: number; carry: string; name: string; date: string; folderId: string };
};

function startRun(appVersion: string, kind: RunState['kind'], by?: string): RunState {
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const createdAt = new Date().toISOString();
  const header = {
    format: FORMAT,
    version: FORMAT_VERSION,
    createdAt,
    createdAtIST: istText(createdAt),
    appVersion,
    kdf: { name: 'PBKDF2', hash: 'SHA-256', iterations: PBKDF2_ITERATIONS, salt: b64(salt) },
    cipher: { name: 'AES-GCM', keyBits: 256, iv: b64(iv), perSection: 'IV XOR section number (last 4 bytes); AAD = this header + section type' },
    sections: 'type u8, number u32, plain length u32, cipher length u32, then AES-GCM(gzip(NDJSON)); type 1 = rows {k, v}, 2 = logins, 3 = database tables {t, r}, 9 = manifest (last)',
  };
  return {
    id: newRunId(), kind, by, startedAt: createdAt, updatedAt: createdAt, appVersion,
    salt: b64(salt), iv: b64(iv), header: b64(te.encode(JSON.stringify(header))),
    next: 0, phase: 'auth', afterKey: null, pageRows: PAGE_ROWS,
    rows: 0, skipped: 0, raw: 0, out: 0, authUsers: 0, prefixes: {}, sections: [], steps: 0, attempts: 0,
  };
}

// Logins: who they are and their roles, never passwords or password hashes. Restoring logins is a
// manual job (the restore screen lists them).
async function listAuthUsers(supabase: any) {
  const out: any[] = [];
  for (let page = 1; page <= 100; page++) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error(`Reading the logins failed: ${error.message}`);
    const users = data?.users || [];
    for (const u of users) {
      out.push({ id: u.id, email: u.email ?? null, app_metadata: u.app_metadata || {}, user_metadata: u.user_metadata || {}, created_at: u.created_at });
    }
    if (users.length < 1000) break;
  }
  return out;
}

// How many rows to read next: photo/employee rows 10 at a time, others up to 1000 (only keys are
// read to decide, which is cheap). Also shrinks after a page of unexpectedly big rows.
async function nextPageRows(supabase: any, afterKey: string | null, sizeHint: number): Promise<number> {
  let q = supabase.from(TABLE).select('key').order('key', { ascending: true }).limit(PAGE_ROWS);
  if (afterKey !== null) q = q.gt('key', afterKey);
  const { data, error } = await q;
  if (error) throw new Error(`Reading the data failed: ${error.message}`);
  const keys: string[] = (data || []).map((r: any) => r.key);
  if (!keys.length) return 0;
  if (isHeavy(prefixOf(keys[0]))) return HEAVY_PAGE_ROWS;
  const light = keys.findIndex((k) => isHeavy(prefixOf(k)));
  return Math.max(1, Math.min(light === -1 ? keys.length : light, sizeHint));
}

// One step of a backup: carries on from s.afterKey and stops on the budget. Mutates s, so callers
// work on a copy and only save it once the step's bytes are safely out.
async function runStep(deps: Deps, s: RunState, emit: (b: Uint8Array) => Promise<void>, scale = 1): Promise<void> {
  const pass = requirePassphrase();
  const headerJson = unb64(s.header);
  const iv = unb64(s.iv);
  const key = await deriveKey(pass, unb64(s.salt), PBKDF2_ITERATIONS);
  const rawBudget = STEP_RAW_BUDGET * scale;
  const busyBudget = STEP_BUSY_MS * scale;
  let stepRaw = 0;
  let busy = 0;
  const out = async (b: Uint8Array) => { s.out += b.length; await emit(b); };
  if (s.steps === 0) {
    const head = new Uint8Array(12 + headerJson.length);
    head.set(te.encode(MAGIC), 0);
    new DataView(head.buffer).setUint32(8, headerJson.length);
    head.set(headerJson, 12);
    await out(head);
  }
  s.steps++;

  const seal = async (type: number, raw: Uint8Array, rows: number, lastKey?: string) => {
    const t0 = performance.now();
    const index = s.next++;
    const { bytes, sha256 } = await sealSection(key, iv, headerJson, type, index, raw);
    busy += performance.now() - t0;
    s.sections.push(lastKey === undefined ? { i: index, type, rows, raw: raw.length, sha256 } : { i: index, type, rows, raw: raw.length, sha256, lastKey });
    s.raw += raw.length;
    stepRaw += raw.length;
    await out(bytes);
  };

  if (s.phase === 'auth') {
    const users = await listAuthUsers(deps.supabase);
    await seal(T_AUTH, te.encode(users.map((u) => JSON.stringify(u)).join('\n')), users.length);
    s.authUsers = users.length;
    s.phase = 'rows';
  }

  let lines: string[] = [];
  let pending = 0;
  const flush = async () => {
    if (!lines.length) return;
    const t0 = performance.now();
    const raw = te.encode(lines.join('\n'));
    busy += performance.now() - t0;
    const n = lines.length;
    lines = [];
    pending = 0;
    await seal(T_ROWS, raw, n, s.afterKey ?? '');
  };

  while (s.phase === 'rows') {
    const limit = await nextPageRows(deps.supabase, s.afterKey, s.pageRows || PAGE_ROWS);
    if (limit === 0) { await flush(); s.phase = 'tables'; break; }
    let q = deps.supabase.from(TABLE).select('key,value').order('key', { ascending: true }).limit(limit);
    if (s.afterKey !== null) q = q.gt('key', s.afterKey);
    const { data, error } = await q;
    if (error) throw new Error(`Reading the data failed: ${error.message}`);
    const page: { key: string; value: any }[] = data || [];
    let mark = performance.now();
    let loop = 0;
    let pageChars = 0;
    for (const row of page) {
      s.afterKey = row.key;
      if (isSkipped(row.key)) { s.skipped++; continue; }
      const line = JSON.stringify({ k: row.key, v: row.value });
      lines.push(line);
      pending += line.length;
      pageChars += line.length;
      const p = prefixOf(row.key);
      s.prefixes[p] = (s.prefixes[p] || 0) + 1;
      s.rows++;
      if (pending >= SECTION_RAW_TARGET) {
        loop += performance.now() - mark;
        await flush();
        mark = performance.now();
      }
    }
    loop += performance.now() - mark;
    // Parsing the reply inside supabase-js is not measured; it costs about as much as writing
    // the lines again, so count the loop twice.
    busy += 2 * loop;
    // Next page size: aim for about 4 MB per page whatever the row size.
    const avg = page.length ? pageChars / page.length : 0;
    s.pageRows = avg > 0 ? Math.max(HEAVY_PAGE_ROWS, Math.min(PAGE_ROWS, Math.floor(SECTION_RAW_TARGET / avg))) : PAGE_ROWS;
    // The end of the table is found by the next look-ahead returning no keys.
    if (stepRaw + pending >= rawBudget || busy >= busyBudget) { await flush(); break; }
  }

  // The ledger tables, one page at a time, packed like the rows.
  let tableLines: string[] = [];
  let tablePending = 0;
  const flushTables = async (name: string) => {
    if (!tableLines.length) return;
    const raw = te.encode(tableLines.join('\n'));
    const n = tableLines.length;
    tableLines = [];
    tablePending = 0;
    await seal(T_TABLE, raw, n, `${name}:${s.tableAfter ?? ''}`);
  };
  while (s.phase === 'tables' && stepRaw < rawBudget && busy < busyBudget) {
    const name = LEDGER_TABLES[s.table ?? 0];
    if (!name) { s.phase = 'done'; break; }
    const { data, error } = await deps.supabase.rpc('ledger_backup_page', { p_table: name, p_after: s.tableAfter ?? null, p_limit: TABLE_PAGE_ROWS });
    if (error) {
      // Without the page function (or the ledger), the backup goes ahead with the rows alone.
      if (/function|does not exist|schema cache|unknown table/i.test(error.message)) { s.tablesSkipped = error.message.slice(0, 200); s.phase = 'done'; break; }
      throw new Error(`Reading the ${name} table failed: ${error.message}`);
    }
    const page: { k: string; r: any }[] = Array.isArray(data) ? data : [];
    const t0 = performance.now();
    for (const item of page) {
      const line = JSON.stringify({ t: name, r: item.r });
      tableLines.push(line);
      tablePending += line.length;
      s.tableAfter = item.k;
    }
    s.tables = { ...(s.tables || {}), [name]: (s.tables?.[name] || 0) + page.length };
    busy += 2 * (performance.now() - t0);
    if (page.length < TABLE_PAGE_ROWS) {
      await flushTables(name);
      s.table = (s.table ?? 0) + 1;
      s.tableAfter = null;
    } else if (tablePending >= SECTION_RAW_TARGET) {
      await flushTables(name);
    }
  }
  if (s.phase === 'tables') await flushTables(LEDGER_TABLES[s.table ?? 0] || 'end');

  if (s.phase === 'done') {
    const dataSections = s.sections.map(({ i, type, rows, raw, sha256, lastKey }) => ({ i, type, rows, raw, sha256, ...(lastKey !== undefined ? { lastKey } : {}) }));
    const manifest = {
      format: FORMAT,
      version: FORMAT_VERSION,
      createdAt: s.startedAt,
      finishedAt: new Date().toISOString(),
      appVersion: s.appVersion,
      kind: s.kind,
      totalRows: s.rows,
      authUsers: s.authUsers,
      prefixes: s.prefixes,
      tables: s.tables || {},
      ...(s.tablesSkipped ? { tablesSkipped: s.tablesSkipped } : {}),
      skippedRows: s.skipped,
      skippedRules: [...SKIP_PREFIXES, ...SKIP_PATTERNS.map(String)],
      sections: dataSections,
      // SHA-256 over the SHA-256 of every section in order: it can be built up across calls,
      // which a hash of the whole payload in one go could not.
      payloadSha256: await sha256Hex(dataSections.map((x) => x.sha256).join('\n')),
      calls: s.steps,
      note: s.steps > 1 ? 'Read over several calls; rows changed in between may come from slightly different moments.' : 'Read in one call.',
    };
    await seal(T_MANIFEST, te.encode(JSON.stringify(manifest)), 0);
  }
  s.updatedAt = new Date().toISOString();
}

// After a step that died (for example killed for using too much CPU), the next try does less.
const scaleFor = (attempts: number) => (attempts > 1 ? 1 / 2 ** (attempts - 1) : 1);

// ---------- reading the live table ----------
// Keyset scan over keys only (cheap), between two keys: (after, upTo].
async function scanKeys(supabase: any, after: string | null, upTo: string | null, each: (key: string) => void) {
  let cursor = after;
  while (true) {
    let q = supabase.from(TABLE).select('key').order('key', { ascending: true }).limit(PAGE_ROWS);
    if (cursor !== null) q = q.gt('key', cursor);
    if (upTo !== null) q = q.lte('key', upTo);
    const { data, error } = await q;
    if (error) throw new Error(`Reading the data failed: ${error.message}`);
    const keys: string[] = (data || []).map((r: any) => r.key);
    for (const k of keys) each(k);
    if (keys.length < PAGE_ROWS) return;
    cursor = keys[keys.length - 1];
  }
}

async function liveCounts(supabase: any) {
  const prefixes: Record<string, number> = {};
  let total = 0;
  await scanKeys(supabase, null, null, (k) => {
    if (isSkipped(k)) return;
    total++;
    const p = prefixOf(k);
    prefixes[p] = (prefixes[p] || 0) + 1;
  });
  return { total, prefixes };
}

// Current values for some keys. Small batches keep the request URL short and photo rows light.
async function liveValues(supabase: any, keys: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const batches: string[][] = [];
  let cur: string[] = [];
  for (const k of keys) {
    cur.push(k);
    if (cur.length >= (isHeavy(prefixOf(k)) ? 5 : 50)) { batches.push(cur); cur = []; }
  }
  if (cur.length) batches.push(cur);
  let next = 0;
  const worker = async () => {
    while (next < batches.length) {
      const batch = batches[next++];
      const { data, error } = await supabase.from(TABLE).select('key,value').in('key', batch);
      if (error) throw new Error(`Reading the data failed: ${error.message}`);
      for (const r of data || []) out.set(r.key, r.value);
    }
  };
  await Promise.all(Array.from({ length: 6 }, worker));
  return out;
}

function stableStringify(v: any): string {
  if (v === null || typeof v !== 'object') return JSON.stringify(v);
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${stableStringify(v[k])}`).join(',')}}`;
}
// Both sides come out of Postgres jsonb (same key order), so the plain compare almost always
// decides; the sorted compare only runs when the plain one says "different".
const sameValue = (a: any, b: any) => JSON.stringify(a) === JSON.stringify(b) || stableStringify(a) === stableStringify(b);

type Counts = { inBackup: number; missing: number; changed: number; same: number; newSinceBackup: number };
const emptyCounts = (): Counts => ({ inBackup: 0, missing: 0, changed: 0, same: 0, newSinceBackup: 0 });

// Compares one rows section with what is live now. Sections cover touching key ranges
// (previous section's lastKey, this lastKey], so rows added since the backup are found too.
async function compareSection(deps: Deps, o: Opened, s: ParsedSection, wanted: ((prefix: string) => boolean) | null) {
  const rows = (await readSection(o, s)).filter((r) => !isSkipped(r.k));
  const dataSections = (o.manifest.sections || []).filter((x: any) => x.type === T_ROWS);
  const j = dataSections.findIndex((x: any) => x.i === s.index);
  const lower = j > 0 ? dataSections[j - 1].lastKey : null;
  const upper = j < dataSections.length - 1 ? dataSections[j].lastKey : null;
  const live = new Set<string>();
  await scanKeys(deps.supabase, lower, upper, (k) => { if (!isSkipped(k)) live.add(k); });
  const chosen = wanted ? rows.filter((r) => wanted(prefixOf(r.k))) : rows;
  const values = await liveValues(deps.supabase, chosen.filter((r) => live.has(r.k)).map((r) => r.k));
  const counts: Record<string, Counts> = {};
  const bump = (p: string, f: keyof Counts) => { (counts[p] ||= emptyCounts())[f]++; };
  const missing: Row[] = [];
  const changed: Row[] = [];
  let same = 0;
  for (const r of chosen) {
    const p = prefixOf(r.k);
    bump(p, 'inBackup');
    if (!values.has(r.k)) { missing.push(r); bump(p, 'missing'); }
    else if (!sameValue(r.v, values.get(r.k))) { changed.push(r); bump(p, 'changed'); }
    else { same++; bump(p, 'same'); }
  }
  const inBackup = new Set(rows.map((r) => r.k));
  for (const k of live) {
    if (inBackup.has(k)) continue;
    const p = prefixOf(k);
    if (!wanted || wanted(p)) bump(p, 'newSinceBackup');
  }
  return { counts, missing, changed, same, values };
}

function manifestSummary(m: any) {
  return {
    createdAt: m.createdAt, finishedAt: m.finishedAt, appVersion: m.appVersion, kind: m.kind,
    totalRows: m.totalRows, authUsers: m.authUsers, prefixes: m.prefixes, skippedRows: m.skippedRows,
    payloadSha256: m.payloadSha256, calls: m.calls,
    sections: (m.sections || []).map((x: any) => ({ i: x.i, type: x.type, rows: x.rows, raw: x.raw })),
  };
}

async function writeRows(kv: Kv, rows: Row[]) {
  let keys: string[] = [];
  let values: any[] = [];
  let size = 0;
  for (const r of rows) {
    keys.push(r.k);
    values.push(r.v);
    size += r.size;
    if (keys.length >= 500 || size >= 2 * MiB) {
      await kv.mset(keys, values);
      keys = []; values = []; size = 0;
    }
  }
  if (keys.length) await kv.mset(keys, values);
}

// ---------- Google Drive (helpers in gdrive.ts, shared with the workplace photos) ----------
// Keeps the newest backup of each of the last 30 days and the first backup of each of the last 12
// months; other files this feature made go to the Drive bin (Drive empties it after 30 days).
// Only files tagged bunnyBackup=1 are looked at, so nothing else in the folder is touched.
async function applyRetention(folderId: string, keepId: string): Promise<number> {
  const files = await listDriveFiles(`'${folderId}' in parents and trashed = false and appProperties has { key='bunnyBackup' and value='1' }`, 'id,createdTime,appProperties');
  const dateOf = (f: any) => f.appProperties?.backupDate || String(f.createdTime).slice(0, 10);
  const newestFirst = [...files].sort((a, b) => String(b.createdTime).localeCompare(String(a.createdTime)));
  const keep = new Set<string>([keepId]);
  const days = new Set<string>();
  for (const f of newestFirst) {
    const d = dateOf(f);
    if (!days.has(d) && days.size < KEEP_DAILY) { days.add(d); keep.add(f.id); }
  }
  const firstOfMonth = new Map<string, string>();
  for (const f of [...newestFirst].reverse()) {
    const m = dateOf(f).slice(0, 7);
    if (!firstOfMonth.has(m)) firstOfMonth.set(m, f.id);
  }
  for (const m of [...firstOfMonth.keys()].sort().reverse().slice(0, KEEP_MONTHLY)) keep.add(firstOfMonth.get(m)!);
  let trashed = 0;
  for (const f of files) {
    if (keep.has(f.id)) continue;
    await trashDriveFile(f.id);
    trashed++;
  }
  return trashed;
}

// One run at a time: a plain insert either creates the lock row or fails because it exists.
async function takeLock(deps: Deps, name: string): Promise<boolean> {
  const key = `backup-lock:${name}`;
  const value = { at: new Date().toISOString() };
  if (!(await deps.supabase.from(TABLE).insert({ key, value })).error) return true;
  const held = await deps.kv.get<any>(key);
  if (held && Date.now() - Date.parse(held.at) < LOCK_STALE_MS) return false;
  await deps.kv.del(key);
  return !(await deps.supabase.from(TABLE).insert({ key, value })).error;
}

async function recordFailure(deps: Deps, s: RunState | null, error: string, opts: { notConfigured?: boolean; manual?: boolean }) {
  const prev = await deps.kv.get<any>(STATUS_KEY).catch(() => null);
  await deps.kv.set(STATUS_KEY, {
    at: new Date().toISOString(), ok: false, kind: 'drive', error, notConfigured: !!opts.notConfigured,
    startedAt: s?.startedAt || null, rows: s?.rows ?? null, bytes: null, fileId: null,
  });
  // A missing set-up is told once, not every night; someone pressing the button sees the error.
  const repeat = prev && !prev.ok && prev.error === error;
  if (opts.manual || (opts.notConfigured && repeat) || !deps.notifyClusterHeads) return;
  await deps.notifyClusterHeads('Backup failed', `Last night's Google Drive backup did not work: ${error.slice(0, 200)} Open Backup in the app for details.`)
    .catch((e) => console.error('[backup] notify failed', e));
}

// One call's worth of the Drive backup: starts tonight's run or carries on with it.
async function driveTick(deps: Deps, opts: { manual: boolean; by?: string }): Promise<any> {
  let setupError: string | null = null;
  try { requirePassphrase(); } catch (e) { setupError = errText(e); }
  if (!setupError && !driveConfigured()) {
    setupError = 'Google Drive is not connected: set GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN and GDRIVE_FOLDER_ID (docs/backup-google-drive-setup.md).';
  }
  if (setupError) {
    await recordFailure(deps, null, setupError, { notConfigured: true, manual: opts.manual });
    return { ok: false, error: setupError };
  }
  if (!(await takeLock(deps, 'drive'))) return { ok: true, busy: true, message: 'A backup is already running. Try again in a few minutes.' };
  try {
    let s = await deps.kv.get<RunState>(DRIVE_RUN_KEY);
    let restarted = false;
    if (s && Date.now() - Date.parse(s.startedAt) > RUN_STALE_MS) {
      await deps.kv.del(DRIVE_RUN_KEY);
      await recordFailure(deps, s, `The backup started at ${istText(s.startedAt)} did not finish${s.lastError ? ` (${s.lastError})` : ''}.`, opts);
      s = null;
      restarted = true;
    }
    if (!s) {
      if (!opts.manual && !restarted) {
        // The cron calls every 5 minutes for an hour so a big backup can finish; once tonight's
        // run is done (or has failed and told the owner) the other calls do nothing.
        const last = await deps.kv.get<any>(STATUS_KEY);
        if (last && !last.notConfigured && istDate(last.at) === istDate(new Date().toISOString())) {
          return { ok: true, skipped: last.ok ? 'Already backed up today' : 'Already tried today; see the status' };
        }
      }
      const fresh = startRun(deps.appVersion, 'drive', opts.by);
      try {
        const folderId = await ensureDriveFolder(DRIVE_BACKUP_FOLDER);
        const name = `bunny-momos-backup-${istStamp(fresh.startedAt)}.bunnybak`;
        const date = istDate(fresh.startedAt);
        const session = await startResumableUpload({
          name, folderId, mimeType: 'application/octet-stream',
          description: 'Bunny Momos encrypted backup. Opens only with the backup passphrase (Backup page in the app, or scripts/backup-decrypt.mjs).',
          // Marks the files this feature made, so the clean-up never touches anything else.
          appProperties: { bunnyBackup: '1', backupDate: date },
        });
        fresh.drive = { session, uploaded: 0, carry: '', name, date, folderId };
      } catch (e) {
        await recordFailure(deps, fresh, errText(e), opts);
        return { ok: false, error: errText(e) };
      }
      s = fresh;
    }

    // Counted before the work, so a step killed for using too much CPU still counts as a try.
    s.attempts++;
    await deps.kv.set(DRIVE_RUN_KEY, s);
    try {
      await getDriveAccessToken(); // fails early, with a clear message, if the sign-in is broken
      const drive = s.drive!;
      if ((await driveUploadReceived(drive.session)) !== drive.uploaded) throw new BackupError('Google Drive and the saved progress disagree; the backup has to start again.', 502);
      const upload = new DriveResumableUpload(drive.session, drive.uploaded, unb64(drive.carry));
      const work: RunState = structuredClone(s);
      await runStep(deps, work, upload.write, scaleFor(s.attempts));
      if (work.phase === 'done') {
        const file = await upload.finish();
        let trashed = 0;
        let warning: string | undefined;
        try { trashed = await applyRetention(drive.folderId, file.id); } catch (e) { warning = `Old backups were not tidied: ${errText(e)}`; }
        await deps.kv.del(DRIVE_RUN_KEY);
        const status = {
          at: new Date().toISOString(), ok: true, kind: 'drive', rows: work.rows, authUsers: work.authUsers, bytes: file.size,
          fileId: file.id, fileName: drive.name, startedAt: work.startedAt, calls: work.steps, oldFilesRemoved: trashed, error: null,
          ...(warning ? { warning } : {}),
        };
        await deps.kv.set(STATUS_KEY, status);
        return { ok: true, done: true, status };
      }
      work.drive!.carry = b64(await upload.pause());
      work.drive!.uploaded = upload.uploaded;
      work.attempts = 0;
      delete work.lastError;
      await deps.kv.set(DRIVE_RUN_KEY, work);
      return { ok: true, done: false, rows: work.rows, bytes: work.out, calls: work.steps };
    } catch (e) {
      s.lastError = errText(e);
      if (s.attempts >= MAX_STEP_ATTEMPTS || /disagree|expired|already closed/.test(s.lastError)) {
        await deps.kv.del(DRIVE_RUN_KEY);
        await recordFailure(deps, s, s.lastError, opts);
        return { ok: false, error: s.lastError };
      }
      await deps.kv.set(DRIVE_RUN_KEY, s);
      return { ok: false, retrying: true, error: s.lastError };
    }
  } finally {
    await deps.kv.del('backup-lock:drive').catch(() => {});
  }
}

// Download runs the app gave up on (closed half-way) are removed after a while.
async function removeStaleDownloads(deps: Deps) {
  const { data } = await deps.supabase.from(TABLE).select('key, startedAt:value->>startedAt').like('key', 'backup-run:%');
  for (const r of data || []) {
    if (r.key !== DRIVE_RUN_KEY && Date.now() - Date.parse(r.startedAt || 0) > RUN_STALE_MS) await deps.kv.del(r.key);
  }
}

async function readEnvelope(c: any): Promise<{ opts: any; file: Uint8Array }> {
  const declared = Number(c.req.header('Content-Length') || 0);
  if (declared > MAX_UPLOAD_BYTES) throw new BackupError('That piece of the file is too big; update the app and try again.', 413);
  const buf = new Uint8Array(await c.req.arrayBuffer());
  if (buf.length < 4 || buf.length > MAX_UPLOAD_BYTES) throw new BackupError('Nothing usable was sent.');
  const n = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0);
  if (4 + n > buf.length) throw new BackupError('Nothing usable was sent.');
  let opts: any;
  try { opts = JSON.parse(td.decode(buf.subarray(4, 4 + n))); } catch { throw new BackupError('Nothing usable was sent.'); }
  return { opts: opts || {}, file: buf.subarray(4 + n) };
}

export function registerBackupRoutes(app: any, deps: Deps) {
  const fail = (c: any, e: unknown) => {
    if (e instanceof BackupError || e instanceof DriveError) return c.json({ error: e.message }, e.status);
    console.error('[backup]', e);
    return c.json({ error: errText(e) || 'Something went wrong' }, 500);
  };
  // The login gate already limits /admin/backup and /admin/restore to the owner (ROLE_GATES);
  // checked again here so a merge that drops that line cannot open these up.
  const owner = async (c: any): Promise<{ res?: any; email?: string }> => {
    const auth = await deps.verifyUser(c.req.header('Authorization'));
    if ('error' in auth) return { res: c.json({ error: auth.error }, auth.status) };
    if (auth.user.user_metadata?.role !== 'cluster_head') return { res: c.json({ error: 'Only the owner (cluster head) can use backups' }, 403) };
    return { email: auth.user.email || auth.user.id };
  };

  // What the Backup page shows: set-up state, last automatic backup, a run in progress, recent restores.
  app.get(`${P}/admin/backup/status`, async (c: any) => {
    const g = await owner(c); if (g.res) return g.res;
    try {
      const pass = Deno.env.get('BACKUP_PASSPHRASE') || '';
      const run = await deps.kv.get<RunState>(DRIVE_RUN_KEY);
      const { data: logs } = await deps.supabase.from(TABLE).select('key,value').like('key', 'restore-log:%').order('key', { ascending: false }).limit(5);
      return c.json({
        passphraseSet: !!pass,
        passphraseOk: pass.length >= 12,
        driveConnected: driveConfigured(),
        schedule: 'Every night from 2:30 AM IST',
        last: (await deps.kv.get(STATUS_KEY)) || null,
        lastDownload: (await deps.kv.get(DOWNLOAD_STATUS_KEY)) || null,
        running: run ? { startedAt: run.startedAt, rows: run.rows, bytes: run.out, calls: run.steps, lastError: run.lastError || null } : null,
        restores: (logs || []).map((r: any) => r.value),
      });
    } catch (e) { return fail(c, e); }
  });

  // The encrypted file, one step per call: [u32][meta JSON][file bytes]. The app calls again with
  // ?run=&part= until meta.done and joins the bytes in order.
  app.get(`${P}/admin/backup/download`, async (c: any) => {
    const g = await owner(c); if (g.res) return g.res;
    try {
      requirePassphrase();
      const runId = c.req.query('run');
      let s: RunState;
      if (!runId) {
        await removeStaleDownloads(deps);
        s = startRun(deps.appVersion, 'download', g.email);
      } else {
        const saved = await deps.kv.get<RunState>(`backup-run:${runId}`);
        if (!saved || saved.kind !== 'download') throw new BackupError('This download stopped for too long. Start it again.', 409);
        if (saved.steps !== Number(c.req.query('part') || 0) - 1) throw new BackupError('A piece of the download went missing. Start it again.', 409);
        s = saved;
      }
      const key = `backup-run:${s.id}`;
      s.attempts++;
      await deps.kv.set(key, s);
      const parts: Uint8Array[] = [];
      const work: RunState = structuredClone(s);
      await runStep(deps, work, async (b) => { parts.push(b); }, scaleFor(s.attempts));
      const done = work.phase === 'done';
      if (done) {
        await deps.kv.del(key);
        await deps.kv.set(DOWNLOAD_STATUS_KEY, { at: new Date().toISOString(), by: g.email, rows: work.rows, authUsers: work.authUsers, bytes: work.out, calls: work.steps });
      } else {
        work.attempts = 0;
        await deps.kv.set(key, work);
      }
      const meta = {
        run: work.id, part: work.steps, done, rows: work.rows, bytes: work.out, authUsers: work.authUsers,
        fileName: `bunny-momos-backup-${istStamp(work.startedAt)}.bunnybak`,
      };
      return c.body(envelope(meta, concat(parts)), 200, { 'Content-Type': 'application/octet-stream', 'Cache-Control': 'no-store' });
    } catch (e) { return fail(c, e); }
  });

  // Checks a backup file the app sends back a few sections at a time (always with the header and
  // manifest): it decrypts, matches the checksums and row counts, and with summary=true compares
  // the counts per record type with the live data.
  app.post(`${P}/admin/backup/verify`, async (c: any) => {
    const g = await owner(c); if (g.res) return g.res;
    try {
      const { opts, file } = await readEnvelope(c);
      const o = await openFile(file);
      const result: any = { manifest: manifestSummary(o.manifest), sections: [] };
      if (opts.summary) {
        const sections = o.manifest.sections || [];
        result.payloadOk = (await sha256Hex(sections.map((x: any) => x.sha256).join('\n'))) === o.manifest.payloadSha256;
        result.live = await liveCounts(deps.supabase);
      }
      for (const s of o.file.sections) {
        if (s.type === T_MANIFEST) continue;
        try {
          const rows = await readSection(o, s);
          const r: any = { i: s.index, type: s.type, ok: true, rows: rows.length };
          if (s.type === T_AUTH) {
            r.logins = rows.map(({ v }) => ({ email: v.email, role: v.app_metadata?.role || null, name: v.user_metadata?.name || null, created_at: v.created_at }));
          }
          result.sections.push(r);
        } catch (e) {
          result.sections.push({ i: s.index, type: s.type, ok: false, error: errText(e) });
        }
      }
      return c.json(result);
    } catch (e) { return fail(c, e); }
  });

  // Dry run: for each record type, how many rows are missing now, changed since, the same, or new
  // since the backup (restore never deletes those). Nothing is written.
  app.post(`${P}/admin/restore/plan`, async (c: any) => {
    const g = await owner(c); if (g.res) return g.res;
    try {
      const { file } = await readEnvelope(c);
      const o = await openFile(file);
      const prefixes: Record<string, Counts> = {};
      const sections: { i: number; prefixes: string[] }[] = [];
      for (const s of o.file.sections) {
        if (s.type !== T_ROWS) continue;
        const cmp = await compareSection(deps, o, s, null);
        for (const [p, n] of Object.entries(cmp.counts)) {
          const t = (prefixes[p] ||= emptyCounts());
          for (const f of Object.keys(n) as (keyof Counts)[]) t[f] += n[f];
        }
        // Which record types this section would change, so the app sends only those sections.
        sections.push({ i: s.index, prefixes: Object.entries(cmp.counts).filter(([, n]) => n.missing || n.changed).map(([p]) => p) });
      }
      return c.json({ manifest: manifestSummary(o.manifest), prefixes, sections });
    } catch (e) { return fail(c, e); }
  });

  // Restore: writes the backup's rows back under their original keys for the chosen record types.
  // 'missing-only' only puts back rows that are gone; 'overwrite' also replaces rows that changed.
  // Before writing, the rows it will replace (and the keys it will add) are saved to
  // restore-snapshot:{run}:{section}, and progress goes to restore-log:{run}. Never deletes.
  app.post(`${P}/admin/restore/apply`, async (c: any) => {
    const g = await owner(c); if (g.res) return g.res;
    try {
      const { opts, file } = await readEnvelope(c);
      if (opts.confirm !== 'RESTORE') throw new BackupError('Type RESTORE to confirm.');
      if (opts.mode !== 'missing-only' && opts.mode !== 'overwrite') throw new BackupError('Choose how to restore.');
      const chosen: string[] = Array.isArray(opts.prefixes) ? opts.prefixes.filter((p: any) => typeof p === 'string') : [];
      if (!chosen.length) throw new BackupError('Choose at least one kind of record to restore.');
      const wanted = new Set(chosen);
      const o = await openFile(file);
      const run = typeof opts.run === 'string' && /^[\w-]{6,60}$/.test(opts.run) ? opts.run : newRunId();
      const logKey = `restore-log:${run}`;
      const now = new Date().toISOString();
      const log = (await deps.kv.get<any>(logKey)) || {
        run, startedAt: now, by: g.email, mode: opts.mode, prefixes: chosen,
        backup: { createdAt: o.manifest.createdAt, totalRows: o.manifest.totalRows, appVersion: o.manifest.appVersion, payloadSha256: o.manifest.payloadSha256 },
        sectionsDone: [] as number[], added: 0, overwritten: 0, unchanged: 0, snapshots: [] as string[],
        loginsNote: 'Logins are not restored; re-create missing people by hand.',
      };
      if (log.mode !== opts.mode || log.backup?.payloadSha256 !== o.manifest.payloadSha256) {
        throw new BackupError('This restore was started with a different file or mode. Start a new restore.', 409);
      }
      const done: any[] = [];
      for (const s of o.file.sections) {
        if (s.type !== T_ROWS || log.sectionsDone.includes(s.index)) continue; // a retried request is harmless
        const cmp = await compareSection(deps, o, s, (p) => wanted.has(p));
        const add = cmp.missing;
        const replace = opts.mode === 'overwrite' ? cmp.changed : [];
        if (add.length || replace.length) {
          const snapKey = `restore-snapshot:${run}:${s.index}`;
          const snap = (await deps.kv.get<any>(snapKey)) || {
            run, section: s.index, savedAt: now,
            note: 'Rows exactly as they were before this restore replaced them (rows), and the keys it added (added).',
            rows: [] as { k: string; v: any }[], added: [] as string[],
          };
          const saved = new Set(snap.rows.map((r: any) => r.k));
          for (const r of replace) if (!saved.has(r.k)) snap.rows.push({ k: r.k, v: cmp.values.get(r.k) });
          const added = new Set(snap.added);
          for (const r of add) if (!added.has(r.k)) snap.added.push(r.k);
          await deps.kv.set(snapKey, snap); // the safety copy is saved before anything is overwritten
          if (!log.snapshots.includes(snapKey)) log.snapshots.push(snapKey);
          await writeRows(deps.kv, [...add, ...replace]);
        }
        log.added += add.length;
        log.overwritten += replace.length;
        log.unchanged += cmp.same + (opts.mode === 'missing-only' ? cmp.changed.length : 0);
        log.sectionsDone.push(s.index);
        log.updatedAt = new Date().toISOString();
        await deps.kv.set(logKey, log);
        done.push({ i: s.index, added: add.length, overwritten: replace.length });
      }
      if (opts.last) {
        log.finishedAt = new Date().toISOString();
        await deps.kv.set(logKey, log);
      }
      return c.json({ run, sections: done, log });
    } catch (e) { return fail(c, e); }
  });

  // The nightly copy to Google Drive (pg_cron, see the backup_drive_cron migration).
  app.post(`${P}/cron/backup-drive`, async (c: any) => {
    const expected = Deno.env.get('CRON_SYNC_SECRET');
    if (!expected || c.req.header('X-Cron-Secret') !== expected) return c.json({ error: 'Unauthorized' }, 401);
    try { return c.json(await driveTick(deps, { manual: false })); } catch (e) { return fail(c, e); }
  });

  // "Back up to Google Drive now" on the Backup page: one step per call; the app repeats until done.
  app.post(`${P}/admin/backup/drive-run`, async (c: any) => {
    const g = await owner(c); if (g.res) return g.res;
    try { return c.json(await driveTick(deps, { manual: true, by: g.email })); } catch (e) { return fail(c, e); }
  });
}
