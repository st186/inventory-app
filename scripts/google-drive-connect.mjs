#!/usr/bin/env node
// One-time Google Drive connection for the nightly backup and the workplace photos.
// Run on your own computer (Node 18 or newer, nothing to install):
//
//   node scripts/google-drive-connect.mjs --client-id "<id>" --client-secret "<secret>"
//
// It opens Google's consent page, catches Google's answer on this computer (127.0.0.1, so it
// works with a "Desktop app" OAuth client and never goes through the server), makes the app's own
// "Bunny Momos" folder in your Drive, and prints the `supabase secrets set` commands to run.
//
// Why a script and not a page in the app: the refresh token is a long-lived key to the files the
// app makes in your Drive. This way it goes straight from Google to your terminal and into the
// Supabase secrets, and is never stored in the database or shown in the app.
// Steps around it: docs/backup-google-drive-setup.md.
import http from 'node:http';
import crypto from 'node:crypto';
import { execFile } from 'node:child_process';

const SCOPE = 'https://www.googleapis.com/auth/drive.file'; // only files the app makes itself
const ROOT_FOLDER = 'Bunny Momos';
const PROJECT_REF = 'xssxnhrzxvtejavoqgwg';

const arg = (name) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : undefined;
};
const clientId = arg('client-id') || process.env.GDRIVE_CLIENT_ID;
const clientSecret = arg('client-secret') || process.env.GDRIVE_CLIENT_SECRET;
if (!clientId || !clientSecret) {
  console.error('Usage: node scripts/google-drive-connect.mjs --client-id "<id>" --client-secret "<secret>"');
  console.error('(from Google Cloud > APIs & Services > Credentials > your "Desktop app" OAuth client)');
  process.exit(1);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');
const verifier = b64url(crypto.randomBytes(32));
const challenge = b64url(crypto.createHash('sha256').update(verifier).digest());
const state = b64url(crypto.randomBytes(16));

async function driveJson(token, url, init = {}) {
  const res = await fetch(url, { ...init, headers: { Authorization: `Bearer ${token}`, ...(init.headers || {}) } });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`Google Drive said ${res.status}: ${JSON.stringify(body).slice(0, 300)}`);
  return body;
}

// With drive.file the app only sees folders it made, so it makes (or finds its own) root folder.
async function rootFolder(token) {
  const q = `name = '${ROOT_FOLDER}' and mimeType = 'application/vnd.google-apps.folder' and 'root' in parents and trashed = false`;
  const found = await driveJson(token, `https://www.googleapis.com/drive/v3/files?${new URLSearchParams({ q, fields: 'files(id)', spaces: 'drive' })}`);
  if (found.files?.length) return found.files[0].id;
  const made = await driveJson(token, 'https://www.googleapis.com/drive/v3/files?fields=id', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: ROOT_FOLDER, mimeType: 'application/vnd.google-apps.folder', parents: ['root'] }),
  });
  return made.id;
}

function openBrowser(url) {
  const [cmd, args] = process.platform === 'win32' ? ['rundll32', ['url.dll,FileProtocolHandler', url]]
    : process.platform === 'darwin' ? ['open', [url]] : ['xdg-open', [url]];
  execFile(cmd, args, () => {});
}

const page = (title, text) => `<!doctype html><meta charset="utf-8"><title>${title}</title><body style="font-family:sans-serif;max-width:40em;margin:3em auto"><h2>${title}</h2><p>${text}</p></body>`;

let redirectUri = '';
const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, redirectUri);
  if (url.pathname !== '/') { res.writeHead(404).end(); return; }
  const finish = (code, title, text) => { res.writeHead(code, { 'Content-Type': 'text/html; charset=utf-8' }).end(page(title, text)); };
  if (url.searchParams.get('state') !== state) return finish(400, 'Wrong link', 'This answer is not from this run of the script. Close this tab.');
  if (url.searchParams.get('error')) {
    finish(400, 'Not connected', `Google said: ${url.searchParams.get('error')}. Close this tab and run the script again.`);
    console.error(`\nGoogle said: ${url.searchParams.get('error')}`);
    server.close();
    process.exitCode = 1;
    return;
  }
  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code: url.searchParams.get('code') || '', client_id: clientId, client_secret: clientSecret,
        redirect_uri: redirectUri, grant_type: 'authorization_code', code_verifier: verifier,
      }),
    });
    const tokens = await tokenRes.json();
    if (!tokenRes.ok) throw new Error(tokens.error_description || tokens.error || `HTTP ${tokenRes.status}`);
    if (!tokens.refresh_token) {
      throw new Error('Google did not send a refresh token. Open https://myaccount.google.com/permissions, remove this app, and run the script again.');
    }
    const folderId = await rootFolder(tokens.access_token);
    finish(200, 'Connected', 'Google Drive is connected. Close this tab and go back to the terminal window.');
    console.log('\nConnected. A folder called "Bunny Momos" is now in your Google Drive (the app keeps everything inside it).');
    console.log('\nRun these in PowerShell from the project folder (one line at a time is fine):\n');
    console.log(`supabase secrets set --project-ref ${PROJECT_REF} "GDRIVE_CLIENT_ID=${clientId}"`);
    console.log(`supabase secrets set --project-ref ${PROJECT_REF} "GDRIVE_CLIENT_SECRET=${clientSecret}"`);
    console.log(`supabase secrets set --project-ref ${PROJECT_REF} "GDRIVE_REFRESH_TOKEN=${tokens.refresh_token}"`);
    console.log(`supabase secrets set --project-ref ${PROJECT_REF} "GDRIVE_FOLDER_ID=${folderId}"`);
    console.log('\nThe refresh token is a key to the app\'s files in your Drive: do not paste it anywhere else, and clear this window afterwards (cls).');
  } catch (e) {
    finish(500, 'Not connected', `Something went wrong: ${e.message}. Close this tab; details are in the terminal.`);
    console.error(`\nNot connected: ${e.message}`);
    process.exitCode = 1;
  } finally {
    server.close();
  }
});

server.listen(0, '127.0.0.1', () => {
  redirectUri = `http://127.0.0.1:${server.address().port}/`;
  const consent = `https://accounts.google.com/o/oauth2/v2/auth?${new URLSearchParams({
    client_id: clientId, redirect_uri: redirectUri, response_type: 'code', scope: SCOPE,
    access_type: 'offline', prompt: 'consent', state, code_challenge: challenge, code_challenge_method: 'S256',
  })}`;
  console.log('Opening Google in your browser. If it does not open, copy this link into the browser:\n');
  console.log(consent);
  console.log('\nSign in with the Google account that should hold the backups, then allow access.');
  openBrowser(consent);
});
// Gives up after 10 minutes so the script never hangs around.
setTimeout(() => { console.error('\nTimed out waiting for Google. Run the script again.'); server.close(); process.exit(1); }, 10 * 60_000).unref();
