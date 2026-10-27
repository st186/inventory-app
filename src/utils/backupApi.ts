// Talks to the backup routes (supabase/functions/make-server-c2dd9b9d/backup.ts) for the Backup
// page. Owner only.
//
// A backup file is "BNYBKUP1" + a small plain header + sections that are each encrypted on their
// own, with the encrypted manifest last. The phone never decrypts anything (only the server has
// the passphrase); it just splits the file at section boundaries and sends it back a few sections
// at a time, always with the header and manifest, so each server call stays inside the edge
// function's 2 s CPU limit however big the backup is.
import { API_BASE } from './api';
import { currentAccessToken } from './accessToken';

const MAGIC = 'BNYBKUP1';
const T_ROWS = 1;
const T_AUTH = 2;
const T_MANIFEST = 9;
// About 8 MB of rows per request: roughly what one server call can decrypt, compare and write.
const BATCH_RAW = 8 * 1024 * 1024;

// Views over a plain ArrayBuffer (what Blob accepts).
type Bytes = Uint8Array<ArrayBuffer>;
type Section = { type: number; index: number; rawLen: number; bytes: Bytes };
export type ParsedBackup = {
  header: { createdAt: string; createdAtIST?: string; appVersion?: string; [k: string]: any };
  headerBytes: Bytes;
  sections: Section[];
  manifest: Section;
  size: number;
};

export type PrefixCounts = { inBackup: number; missing: number; changed: number; same: number; newSinceBackup: number };
export type ManifestSummary = {
  createdAt: string;
  finishedAt: string;
  appVersion: string;
  kind: string;
  totalRows: number;
  authUsers: number;
  prefixes: Record<string, number>;
  skippedRows: number;
  payloadSha256: string;
  calls: number;
  sections: { i: number; type: number; rows: number; raw: number }[];
};
export type Login = { email: string | null; role: string | null; name: string | null; created_at?: string };
export type BackupStatus = {
  passphraseSet: boolean;
  passphraseOk: boolean;
  driveConnected: boolean;
  schedule: string;
  last: null | {
    at: string; ok: boolean; error?: string | null; warning?: string; notConfigured?: boolean; rows?: number | null;
    bytes?: number | null; fileId?: string | null; fileName?: string; calls?: number; oldFilesRemoved?: number;
  };
  lastDownload: null | { at: string; by?: string; rows: number; bytes: number };
  running: null | { startedAt: string; rows: number; bytes: number; calls: number; lastError: string | null };
  restores: { run: string; startedAt: string; finishedAt?: string; by?: string; mode: string; prefixes: string[]; added: number; overwritten: number; snapshots: string[] }[];
};
export type VerifyResult = {
  ok: boolean;
  problems: string[];
  manifest: ManifestSummary;
  live: { total: number; prefixes: Record<string, number> };
  logins: Login[];
  sectionsChecked: number;
};
export type PlanResult = {
  manifest: ManifestSummary;
  prefixes: Record<string, PrefixCounts>;
  // Which record types each section would change; used to send only those sections when restoring.
  sections: { i: number; prefixes: string[] }[];
};
export type ApplyResult = { run: string; added: number; overwritten: number; unchanged: number; snapshots: string[] };
export type Progress = (done: number, total: number, note?: string) => void;

const u32 = (n: number) => { const b = new Uint8Array(4); new DataView(b.buffer).setUint32(0, n); return b; };

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const token = await currentAccessToken();
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  } catch {
    throw new Error('No connection to the server. Check the internet and try again.');
  }
  if (!res.ok) {
    let message = `Server error ${res.status}`;
    try { const body = await res.json(); message = body.error || body.message || message; } catch { /* not JSON */ }
    throw new Error(message);
  }
  return res;
}

async function postEnvelope(path: string, opts: unknown, parts: BlobPart[]): Promise<any> {
  const json = new TextEncoder().encode(JSON.stringify(opts));
  const body = new Blob([u32(json.length), json, ...parts]);
  const res = await request(path, { method: 'POST', headers: { 'Content-Type': 'application/octet-stream' }, body });
  return res.json();
}

export async function getBackupStatus(): Promise<BackupStatus> {
  return (await request('/admin/backup/status')).json();
}

// Downloads the whole encrypted backup, one server step at a time, and joins the pieces.
export async function downloadFullBackup(onProgress?: (rows: number, bytes: number) => void): Promise<{ blob: Blob; fileName: string; rows: number }> {
  const pieces: Bytes[] = [];
  let meta: any = null;
  do {
    const query = meta ? `?run=${encodeURIComponent(meta.run)}&part=${meta.part + 1}` : '';
    const buf = new Uint8Array(await (await request(`/admin/backup/download${query}`)).arrayBuffer());
    const n = new DataView(buf.buffer, buf.byteOffset, buf.byteLength).getUint32(0);
    meta = JSON.parse(new TextDecoder().decode(buf.subarray(4, 4 + n)));
    pieces.push(buf.subarray(4 + n));
    onProgress?.(meta.rows, meta.bytes);
  } while (!meta.done);
  return { blob: new Blob(pieces, { type: 'application/octet-stream' }), fileName: meta.fileName, rows: meta.rows };
}

// "Back up to Google Drive now": repeats the one-step call until the run is finished.
export async function runDriveBackupNow(onProgress?: (rows: number, bytes: number) => void): Promise<any> {
  for (let i = 0; i < 60; i++) {
    const r = await (await request('/admin/backup/drive-run', { method: 'POST' })).json();
    if (r.busy) throw new Error(r.message || 'A backup is already running. Try again in a few minutes.');
    if (r.ok === false && !r.retrying) throw new Error(r.error || 'The backup failed.');
    if (r.done) return r.status;
    onProgress?.(r.rows || 0, r.bytes || 0);
  }
  throw new Error('The backup is taking very long; it will carry on tonight.');
}

// Splits a backup file at section boundaries. Only the structure is read here, not the data.
export function parseBackupFile(buf: ArrayBuffer): ParsedBackup {
  const bytes = new Uint8Array(buf);
  if (bytes.length < 12 || new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC) {
    throw new Error('This is not a Bunny Momos backup file. (Files from the old Backup page, ending in .json, cannot be used.)');
  }
  const dv = new DataView(buf);
  const headerLen = dv.getUint32(8);
  if (12 + headerLen > bytes.length) throw new Error('The backup file is cut off.');
  const header = JSON.parse(new TextDecoder().decode(bytes.subarray(12, 12 + headerLen)));
  const sections: Section[] = [];
  let off = 12 + headerLen;
  while (off < bytes.length) {
    if (off + 13 > bytes.length) throw new Error('The backup file is cut off part-way through. Download it again.');
    const len = dv.getUint32(off + 9);
    if (off + 13 + len > bytes.length) throw new Error('The backup file is cut off part-way through. Download it again.');
    sections.push({ type: bytes[off], index: dv.getUint32(off + 1), rawLen: dv.getUint32(off + 5), bytes: bytes.subarray(off, off + 13 + len) });
    off += 13 + len;
  }
  const manifest = sections.find((s) => s.type === T_MANIFEST);
  if (!manifest) throw new Error('The end of this backup file is missing (it was probably cut off while saving). Use another copy.');
  return { header, headerBytes: bytes.subarray(0, 12 + headerLen), sections: sections.filter((s) => s !== manifest), manifest, size: bytes.length };
}

// Groups sections into requests of about 8 MB of rows; each request is header + sections + manifest.
function batches(p: ParsedBackup, keep: (s: Section) => boolean): Section[][] {
  const out: Section[][] = [];
  let cur: Section[] = [];
  let raw = 0;
  for (const s of p.sections.filter(keep)) {
    if (cur.length && raw + s.rawLen > BATCH_RAW) { out.push(cur); cur = []; raw = 0; }
    cur.push(s);
    raw += s.rawLen;
  }
  if (cur.length) out.push(cur);
  return out;
}
const filePart = (p: ParsedBackup, sections: Section[]): BlobPart[] => [p.headerBytes, ...sections.map((s) => s.bytes), p.manifest.bytes];

export async function verifyBackupFile(p: ParsedBackup, onProgress?: Progress): Promise<VerifyResult> {
  const summary = await postEnvelope('/admin/backup/verify', { summary: true }, filePart(p, []));
  const manifest: ManifestSummary = summary.manifest;
  const problems: string[] = [];
  if (!summary.payloadOk) problems.push('The list of contents inside the file does not add up.');
  const groups = batches(p, (s) => s.type === T_ROWS || s.type === T_AUTH);
  const checked = new Map<number, any>();
  for (let i = 0; i < groups.length; i++) {
    onProgress?.(i, groups.length);
    const r = await postEnvelope('/admin/backup/verify', {}, filePart(p, groups[i]));
    for (const s of r.sections) checked.set(s.i, s);
  }
  onProgress?.(groups.length, groups.length);
  let logins: Login[] = [];
  let rows = 0;
  for (const want of manifest.sections) {
    const got = checked.get(want.i);
    if (!got) problems.push(`Part ${want.i} of the file is missing.`);
    else if (!got.ok) problems.push(got.error || `Part ${want.i} is damaged.`);
    else if (want.type === T_ROWS) rows += got.rows;
    if (got?.logins) logins = got.logins;
  }
  if (!problems.length && rows !== manifest.totalRows) problems.push(`The file holds ${rows} records but says ${manifest.totalRows}.`);
  return { ok: problems.length === 0, problems, manifest, live: summary.live, logins, sectionsChecked: checked.size };
}

export async function planRestore(p: ParsedBackup, onProgress?: Progress): Promise<PlanResult> {
  const groups = batches(p, (s) => s.type === T_ROWS);
  const prefixes: Record<string, PrefixCounts> = {};
  const sections: PlanResult['sections'] = [];
  let manifest: ManifestSummary | null = null;
  for (let i = 0; i < groups.length; i++) {
    onProgress?.(i, groups.length);
    const r = await postEnvelope('/admin/restore/plan', {}, filePart(p, groups[i]));
    manifest = r.manifest;
    sections.push(...r.sections);
    for (const [prefix, n] of Object.entries(r.prefixes as Record<string, PrefixCounts>)) {
      const t = (prefixes[prefix] ||= { inBackup: 0, missing: 0, changed: 0, same: 0, newSinceBackup: 0 });
      t.inBackup += n.inBackup; t.missing += n.missing; t.changed += n.changed; t.same += n.same; t.newSinceBackup += n.newSinceBackup;
    }
  }
  onProgress?.(groups.length, groups.length);
  if (!manifest) {
    // A backup of an empty database: nothing to compare, but still show what the file is.
    manifest = (await postEnvelope('/admin/backup/verify', { summary: true }, filePart(p, []))).manifest;
  }
  return { manifest: manifest!, prefixes, sections };
}

export async function applyRestore(
  p: ParsedBackup,
  plan: PlanResult,
  opts: { prefixes: string[]; mode: 'missing-only' | 'overwrite'; confirm: string },
  onProgress?: Progress,
): Promise<ApplyResult> {
  const chosen = new Set(opts.prefixes);
  // Only sections that hold rows of the chosen kinds which differ from today's data.
  const needed = new Set(plan.sections.filter((s) => s.prefixes.some((x) => chosen.has(x))).map((s) => s.i));
  const groups = batches(p, (s) => s.type === T_ROWS && needed.has(s.index));
  let run: string | undefined;
  const result: ApplyResult = { run: '', added: 0, overwritten: 0, unchanged: 0, snapshots: [] };
  for (let i = 0; i < groups.length; i++) {
    onProgress?.(i, groups.length);
    const r = await postEnvelope('/admin/restore/apply', { ...opts, run, last: i === groups.length - 1 }, filePart(p, groups[i]));
    run = r.run;
    Object.assign(result, { run: r.run, added: r.log.added, overwritten: r.log.overwritten, unchanged: r.log.unchanged, snapshots: r.log.snapshots });
  }
  onProgress?.(groups.length, groups.length);
  return result;
}
