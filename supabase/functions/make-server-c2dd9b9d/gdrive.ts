// Google Drive access to the owner's Drive (owner, 27 Oct 2026: Supabase Storage is too small for
// photos and backups). Minimal version so workplace.ts works on its own - the backup agent's fuller
// gdrive.ts replaces this file at merge, so keep exactly these exports and nothing else relies on it.
//
// Secrets: GDRIVE_CLIENT_ID, GDRIVE_CLIENT_SECRET, GDRIVE_REFRESH_TOKEN (an OAuth refresh token for
// the owner's Google account with the drive.file scope) and GDRIVE_FOLDER_ID (the folder everything
// goes under).

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DRIVE_API = 'https://www.googleapis.com/drive/v3';
const UPLOAD_URL = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id&supportsAllDrives=true';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

const env = (name: string) => Deno.env.get(name) || '';

export function driveConfigured(): boolean {
  return ['GDRIVE_CLIENT_ID', 'GDRIVE_CLIENT_SECRET', 'GDRIVE_REFRESH_TOKEN', 'GDRIVE_FOLDER_ID'].every((k) => !!env(k));
}

// Access tokens last an hour; reuse one until a minute before it runs out.
let cachedToken: { token: string; expiresAt: number } | null = null;

export async function getDriveAccessToken(): Promise<string> {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: env('GDRIVE_CLIENT_ID'),
      client_secret: env('GDRIVE_CLIENT_SECRET'),
      refresh_token: env('GDRIVE_REFRESH_TOKEN'),
      grant_type: 'refresh_token',
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) throw new Error(`Google Drive sign-in failed (${res.status})`);
  cachedToken = { token: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return cachedToken.token;
}

async function driveFetch(url: string, init: RequestInit = {}): Promise<Response> {
  const token = await getDriveAccessToken();
  const res = await fetch(url, { ...init, headers: { ...(init.headers || {}), Authorization: `Bearer ${token}` } });
  if (!res.ok) {
    await res.body?.cancel();
    throw new Error(`Google Drive request failed (${res.status})`);
  }
  return res;
}

// Drive search strings are single-quoted; quotes and backslashes in names must be escaped.
const escapeQuery = (s: string) => s.replace(/\\/g, '\\\\').replace(/'/g, "\\'");

// Folder ids found or made in this run, so a day of uploads doesn't search Drive every time.
const folderIds = new Map<string, string>();

export async function ensureDriveFolder(pathParts: string[]): Promise<string> {
  let parent = env('GDRIVE_FOLDER_ID');
  for (const raw of pathParts) {
    const name = String(raw || '').replace(/[\\/]/g, '-').trim() || 'Untitled';
    const cacheKey = `${parent}/${name}`;
    const known = folderIds.get(cacheKey);
    if (known) { parent = known; continue; }
    const q = `'${escapeQuery(parent)}' in parents and name = '${escapeQuery(name)}' and mimeType = '${FOLDER_MIME}' and trashed = false`;
    const found = await (await driveFetch(`${DRIVE_API}/files?q=${encodeURIComponent(q)}&fields=files(id)&pageSize=1&supportsAllDrives=true&includeItemsFromAllDrives=true`)).json();
    let id: string | undefined = found?.files?.[0]?.id;
    if (!id) {
      const created = await (await driveFetch(`${DRIVE_API}/files?fields=id&supportsAllDrives=true`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, mimeType: FOLDER_MIME, parents: [parent] }),
      })).json();
      id = created?.id;
    }
    if (!id) throw new Error('Could not make a Google Drive folder');
    folderIds.set(cacheKey, id);
    parent = id;
  }
  return parent;
}

export async function uploadDriveFile(opts: { name: string; bytes: Uint8Array; mimeType: string; folderId: string }): Promise<{ id: string }> {
  const boundary = `bunny-${crypto.randomUUID()}`;
  const enc = new TextEncoder();
  const head = enc.encode(
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify({ name: opts.name, parents: [opts.folderId] })}\r\n` +
    `--${boundary}\r\nContent-Type: ${opts.mimeType}\r\n\r\n`,
  );
  const tail = enc.encode(`\r\n--${boundary}--`);
  const body = new Uint8Array(head.length + opts.bytes.length + tail.length);
  body.set(head, 0);
  body.set(opts.bytes, head.length);
  body.set(tail, head.length + opts.bytes.length);
  const res = await driveFetch(UPLOAD_URL, { method: 'POST', headers: { 'Content-Type': `multipart/related; boundary=${boundary}` }, body });
  const json = await res.json();
  if (!json?.id) throw new Error('Google Drive upload returned no file id');
  return { id: json.id };
}

export async function downloadDriveFile(fileId: string): Promise<Response> {
  return driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?alt=media&supportsAllDrives=true`);
}

export async function deleteDriveFile(fileId: string): Promise<void> {
  await driveFetch(`${DRIVE_API}/files/${encodeURIComponent(fileId)}?supportsAllDrives=true`, { method: 'DELETE' });
}
