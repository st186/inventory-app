// Google Drive helpers shared by the nightly backup (backup.ts, files under "Backups/") and the
// workplace photos ("Workplace photos/YYYY-MM/YYYY-MM-DD/<location>/").
//
// Why it works this way:
// - It signs in as the owner's own Google account with a refresh token made once by
//   scripts/google-drive-connect.mjs (docs/backup-google-drive-setup.md). Secrets:
//   GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN, GDRIVE_FOLDER_ID.
// - The scope is drive.file only: the app can see and change only files and folders it made
//   itself, never the rest of the owner's Drive. That is also why GDRIVE_FOLDER_ID must be the
//   folder the connect script made, not one made by hand in Drive (the app could not see it).
// - Big files go up with Drive's resumable upload in 8 MB pieces (every piece but the last must
//   be a multiple of 256 KB), so a file never has to be sent in one request; the backup also
//   carries an upload on across several calls (startResumableUpload + DriveResumableUpload).

const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const DRIVE_UPLOAD_API = 'https://www.googleapis.com/upload/drive/v3';
const FOLDER_MIME = 'application/vnd.google-apps.folder';
const MiB = 1024 * 1024;
export const DRIVE_CHUNK = 8 * MiB;
export const DRIVE_ALIGN = 256 * 1024;
// Small files go in one multipart request; anything bigger uses the resumable upload.
const MULTIPART_MAX = 5 * MiB;

export class DriveError extends Error {
  status: number;
  driveStatus?: number;
  constructor(message: string, driveStatus?: number) {
    super(message);
    this.status = 502;
    this.driveStatus = driveStatus;
  }
}

const env = (name: string) => Deno.env.get(name) || '';

export function driveConfigured(): boolean {
  return !!(env('GDRIVE_CLIENT_ID') && env('GDRIVE_CLIENT_SECRET') && env('GDRIVE_REFRESH_TOKEN') && env('GDRIVE_FOLDER_ID'));
}

function requireConfig() {
  if (!driveConfigured()) {
    throw new DriveError('Google Drive is not connected: set GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN and GDRIVE_FOLDER_ID (docs/backup-google-drive-setup.md).');
  }
}

// An access token lasts about an hour; a warm worker reuses it until a minute before it ends.
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getDriveAccessToken(): Promise<string> {
  requireConfig();
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.token;
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GDRIVE_CLIENT_ID'), client_secret: env('GDRIVE_CLIENT_SECRET'),
      refresh_token: env('GDRIVE_REFRESH_TOKEN'), grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    cachedToken = null;
    if (body.error === 'invalid_grant') {
      throw new DriveError('Google refused the saved sign-in (GDRIVE_REFRESH_TOKEN). It was revoked, or the OAuth consent screen was still in Testing, which ends it after 7 days. Run scripts/google-drive-connect.mjs again and save the new token.');
    }
    throw new DriveError(`Google sign-in failed: ${body.error_description || body.error || res.status}`);
  }
  cachedToken = { token: body.access_token, expiresAt: Date.now() + Number(body.expires_in || 3600) * 1000 };
  return cachedToken.token;
}

async function driveJson(url: string, init: RequestInit = {}): Promise<any> {
  const token = await getDriveAccessToken();
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const text = await res.text();
  if (!res.ok) throw new DriveError(`Google Drive said ${res.status}: ${text.slice(0, 200)}`, res.status);
  return text ? JSON.parse(text) : {};
}

// Drive search strings put names in single quotes.
const q = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// The root folder is checked once per worker so a wrong GDRIVE_FOLDER_ID gives a clear message
// instead of Drive's bare "File not found".
let rootChecked = '';
async function rootFolder(): Promise<string> {
  requireConfig();
  const root = env('GDRIVE_FOLDER_ID');
  if (rootChecked === root) return root;
  try {
    const f = await driveJson(`${DRIVE_API}/files/${encodeURIComponent(root)}?fields=id,trashed,mimeType`);
    if (f.trashed) throw new DriveError('The Google Drive folder in GDRIVE_FOLDER_ID is in the bin. Restore it in Drive, or run scripts/google-drive-connect.mjs to make a new one.');
    if (f.mimeType !== FOLDER_MIME) throw new DriveError('GDRIVE_FOLDER_ID is not a folder.');
  } catch (e) {
    if (e instanceof DriveError && e.driveStatus === 404) {
      throw new DriveError('Google Drive cannot find the folder in GDRIVE_FOLDER_ID for this app. The app can only use folders it made itself (drive.file permission): use the folder ID printed by scripts/google-drive-connect.mjs.', 404);
    }
    throw e;
  }
  rootChecked = root;
  return root;
}

// Finds or makes nested folders under the root, e.g. ['Workplace photos', '2026-10', '2026-10-27',
// 'Store 1']; returns the last one's id. Remembered per worker, and two calls for the same path at
// the same moment share one lookup so they do not make the folder twice.
const folderCache = new Map<string, Promise<string>>();

export async function ensureDriveFolder(pathParts: string[]): Promise<string> {
  let parent = await rootFolder();
  let path = parent;
  for (const raw of pathParts) {
    const name = String(raw).trim() || '_';
    path += `/${name}`;
    const parentId = parent;
    let pending = folderCache.get(path);
    if (!pending) {
      pending = (async () => {
        const query = `'${q(parentId)}' in parents and name = '${q(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
        const found = await driveJson(`${DRIVE_API}/files?${new URLSearchParams({ q: query, fields: 'files(id)', spaces: 'drive' })}`);
        if (found.files?.length) return found.files[0].id as string;
        const made = await driveJson(`${DRIVE_API}/files?fields=id`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parentId] }),
        });
        return made.id as string;
      })();
      folderCache.set(path, pending);
      pending.catch(() => folderCache.delete(path));
    }
    parent = await pending;
  }
  return parent;
}

export type DriveFileMeta = {
  name: string;
  mimeType: string;
  folderId: string;
  description?: string;
  // Private tags only this app sees; used to find the files a feature made (e.g. bunnyBackup=1).
  appProperties?: Record<string, string>;
};

const metadataOf = (m: DriveFileMeta) => ({
  name: m.name, mimeType: m.mimeType, parents: [m.folderId],
  ...(m.description ? { description: m.description } : {}),
  ...(m.appProperties ? { appProperties: m.appProperties } : {}),
});

// Opens a resumable upload and returns its session URL (valid for about a week).
export async function startResumableUpload(meta: DriveFileMeta): Promise<string> {
  const token = await getDriveAccessToken();
  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=resumable&fields=id,name,size`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json; charset=UTF-8', 'X-Upload-Content-Type': meta.mimeType },
    body: JSON.stringify(metadataOf(meta)),
  });
  const session = res.headers.get('Location');
  if (!res.ok || !session) throw new DriveError(`Google Drive would not start the upload (${res.status}): ${(await res.text()).slice(0, 200)}`, res.status);
  await res.body?.cancel();
  return session;
}

const rangeEnd = (range: string | null) => {
  const m = range?.match(/bytes=0-(\d+)/);
  return m ? Number(m[1]) + 1 : 0;
};

// How many bytes Drive already holds for an unfinished resumable upload.
export async function driveUploadReceived(session: string): Promise<number> {
  const res = await fetch(session, { method: 'PUT', headers: { 'Content-Range': 'bytes */*' } });
  await res.body?.cancel();
  if (res.status === 308) return rangeEnd(res.headers.get('Range'));
  throw new DriveError(`The Google Drive upload expired or was already closed (${res.status}).`, res.status);
}

// Feeds a resumable upload. write() only collects; bytes go out in 8 MB pieces when pause() or
// finish() is called, so a caller that dies half-way (the backup) never leaves Drive ahead of its
// saved progress. pause() sends what fits Drive's 256 KB rule and hands back the rest (under
// 256 KB) to keep until next time.
export class DriveResumableUpload {
  private parts: Uint8Array[] = [];
  private pending = 0;
  constructor(private session: string, public uploaded = 0, carry?: Uint8Array) {
    if (carry?.length) { this.parts.push(carry); this.pending = carry.length; }
  }
  write = async (b: Uint8Array) => { this.parts.push(b); this.pending += b.length; };
  private take(n: number): Uint8Array {
    const out = new Uint8Array(n);
    let off = 0;
    while (off < n) {
      const p = this.parts[0];
      const k = Math.min(p.length, n - off);
      out.set(p.subarray(0, k), off);
      off += k;
      if (k === p.length) this.parts.shift(); else this.parts[0] = p.subarray(k);
    }
    this.pending -= n;
    return out;
  }
  private async put(n: number, total: number | null): Promise<any> {
    const body = this.take(n);
    const range = n === 0 ? `bytes */${total}` : `bytes ${this.uploaded}-${this.uploaded + n - 1}/${total ?? '*'}`;
    const res = await fetch(this.session, { method: 'PUT', headers: { 'Content-Range': range }, body });
    const text = await res.text();
    if (total === null) {
      if (res.status !== 308) throw new DriveError(`Google Drive upload stopped (${res.status}): ${text.slice(0, 200)}`, res.status);
      if (rangeEnd(res.headers.get('Range')) !== this.uploaded + n) throw new DriveError('Google Drive kept only part of an upload piece.');
      this.uploaded += n;
      return null;
    }
    if (res.status !== 200 && res.status !== 201) throw new DriveError(`Google Drive did not accept the end of the file (${res.status}): ${text.slice(0, 200)}`, res.status);
    this.uploaded += n;
    return JSON.parse(text);
  }
  private async sendFullChunks() {
    while (this.pending >= DRIVE_CHUNK) await this.put(DRIVE_CHUNK, null);
  }
  async pause(): Promise<Uint8Array> {
    await this.sendFullChunks();
    const n = Math.floor(this.pending / DRIVE_ALIGN) * DRIVE_ALIGN;
    if (n) await this.put(n, null);
    return this.take(this.pending);
  }
  async finish(): Promise<{ id: string; size: number }> {
    await this.sendFullChunks();
    const total = this.uploaded + this.pending;
    const file = await this.put(this.pending, total);
    return { id: file.id, size: total };
  }
}

export async function uploadDriveFile(opts: { name: string; bytes: Uint8Array; mimeType: string; folderId: string }): Promise<{ id: string }> {
  if (opts.bytes.length > MULTIPART_MAX) {
    const upload = new DriveResumableUpload(await startResumableUpload(opts));
    await upload.write(opts.bytes);
    return { id: (await upload.finish()).id };
  }
  const token = await getDriveAccessToken();
  const boundary = `bunny${crypto.randomUUID().replace(/-/g, '')}`;
  const te = new TextEncoder();
  const head = te.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadataOf(opts))}\r\n` +
    `--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  );
  const tail = te.encode(`\r\n--${boundary}--\r\n`);
  const body = new Uint8Array(head.length + opts.bytes.length + tail.length);
  body.set(head, 0);
  body.set(opts.bytes, head.length);
  body.set(tail, head.length + opts.bytes.length);
  const res = await fetch(`${DRIVE_UPLOAD_API}/files?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': `multipart/related; boundary=${boundary}` },
    body,
  });
  const text = await res.text();
  if (!res.ok) throw new DriveError(`Google Drive did not take the file (${res.status}): ${text.slice(0, 200)}`, res.status);
  return { id: JSON.parse(text).id };
}

// The file's bytes as a streaming Response (pass it straight on, or read it).
export async function downloadDriveFile(fileId: string): Promise<Response> {
  const token = await getDriveAccessToken();
  const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media`, { headers: { Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    const text = await res.text();
    throw new DriveError(`Google Drive could not give the file (${res.status}): ${text.slice(0, 200)}`, res.status);
  }
  return res;
}

// Deletes for good (skips the Drive bin). A file that is already gone counts as deleted.
export async function deleteDriveFile(fileId: string): Promise<void> {
  const token = await getDriveAccessToken();
  const res = await fetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${token}` } });
  const text = await res.text();
  if (!res.ok && res.status !== 404) throw new DriveError(`Google Drive could not delete the file (${res.status}): ${text.slice(0, 200)}`, res.status);
}

// Moves a file to the Drive bin (Drive empties it after 30 days) - gentler than deleting.
export async function trashDriveFile(fileId: string): Promise<void> {
  await driveJson(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`, {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ trashed: true }),
  });
}

// Files this app made that match a Drive search, all pages.
export async function listDriveFiles(query: string, fields = 'id,name,createdTime,appProperties,size'): Promise<any[]> {
  const files: any[] = [];
  let pageToken = '';
  do {
    const params = new URLSearchParams({ q: query, fields: `nextPageToken,files(${fields})`, pageSize: '1000', spaces: 'drive' });
    if (pageToken) params.set('pageToken', pageToken);
    const page = await driveJson(`${DRIVE_API}/files?${params}`);
    files.push(...(page.files || []));
    pageToken = page.nextPageToken || '';
  } while (pageToken);
  return files;
}
