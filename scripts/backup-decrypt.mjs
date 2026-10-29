#!/usr/bin/env node
// Opens a Bunny Momos backup file on your own computer, without the app or Supabase - for when the
// app itself is gone, or to look inside a backup. Node 18 or newer, nothing to install.
//
// PowerShell:
//   $env:BACKUP_PASSPHRASE = '<the backup passphrase>'
//   node scripts/backup-decrypt.mjs "C:\path\bunny-momos-backup-2026-10-27-0230.bunnybak"
//
// Writes, next to the file (or into the folder given as a second argument):
//   rows.ndjson    every record, one {"k": key, "v": value} per line (what the in-app restore writes back)
//   logins.json    the logins (email, roles, names; never passwords)
//   manifest.json  counts per record type and the checksums
// These files are NOT encrypted: keep them private and delete them when done.
// Format: supabase/functions/make-server-c2dd9b9d/backup.ts.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { createHash, webcrypto } from 'node:crypto';
import path from 'node:path';

const [file, outArg] = process.argv.slice(2);
const pass = process.env.BACKUP_PASSPHRASE;
if (!file || !pass) {
  console.error('Usage: set $env:BACKUP_PASSPHRASE, then: node scripts/backup-decrypt.mjs <backup file> [output folder]');
  process.exit(1);
}

const buf = readFileSync(file);
if (buf.subarray(0, 8).toString() !== 'BNYBKUP1') throw new Error('Not a Bunny Momos backup file');
const headerLen = buf.readUInt32BE(8);
const headerJson = buf.subarray(12, 12 + headerLen);
const header = JSON.parse(headerJson.toString('utf8'));
const sections = [];
for (let off = 12 + headerLen; off < buf.length;) {
  const len = buf.readUInt32BE(off + 9);
  if (off + 13 + len > buf.length) throw new Error('The file is cut off part-way through');
  sections.push({ type: buf[off], index: buf.readUInt32BE(off + 1), rawLen: buf.readUInt32BE(off + 5), cipher: buf.subarray(off + 13, off + 13 + len) });
  off += 13 + len;
}

const subtle = webcrypto.subtle;
const base = await subtle.importKey('raw', Buffer.from(pass, 'utf8'), 'PBKDF2', false, ['deriveKey']);
const key = await subtle.deriveKey(
  { name: 'PBKDF2', hash: 'SHA-256', salt: Buffer.from(header.kdf.salt, 'base64'), iterations: header.kdf.iterations },
  base, { name: 'AES-GCM', length: 256 }, false, ['decrypt'],
);
const iv = Buffer.from(header.cipher.iv, 'base64');

async function open(s) {
  const sectionIv = Buffer.from(iv);
  sectionIv.writeUInt32BE((sectionIv.readUInt32BE(8) ^ s.index) >>> 0, 8);
  const packed = await subtle.decrypt(
    { name: 'AES-GCM', iv: sectionIv, additionalData: Buffer.concat([headerJson, Buffer.from([s.type])]) }, key, s.cipher,
  ).catch(() => { throw new Error(`Section ${s.index} does not open: wrong passphrase, or the file is damaged`); });
  const raw = gunzipSync(Buffer.from(packed));
  if (raw.length !== s.rawLen) throw new Error(`Section ${s.index} has the wrong length`);
  return raw;
}

const manifestSection = sections.find((s) => s.type === 9);
if (!manifestSection) throw new Error('The end of the file (its list of contents) is missing; the file was cut off');
const manifest = JSON.parse((await open(manifestSection)).toString('utf8'));
const outDir = outArg || `${file}-opened`;
if (!existsSync(outDir)) mkdirSync(outDir, { recursive: true });

const rowParts = [];
const tableParts = [];
let logins = [];
let rows = 0;
let tableRows = 0;
for (const info of manifest.sections) {
  const s = sections.find((x) => x.index === info.i && x.type === info.type);
  if (!s) throw new Error(`Section ${info.i} is missing from the file`);
  const raw = await open(s);
  if (createHash('sha256').update(raw).digest('hex') !== info.sha256) throw new Error(`Section ${info.i} does not match its checksum`);
  const text = raw.toString('utf8');
  if (info.type === 2) logins = text ? text.split('\n').map((l) => JSON.parse(l)) : [];
  else if (info.type === 3) { if (text) tableParts.push(text); tableRows += info.rows; } // database tables {t, r}
  else { if (text) rowParts.push(text); rows += info.rows; }
}
writeFileSync(path.join(outDir, 'rows.ndjson'), rowParts.join('\n') + (rowParts.length ? '\n' : ''));
writeFileSync(path.join(outDir, 'logins.json'), JSON.stringify(logins, null, 2));
if (tableParts.length) writeFileSync(path.join(outDir, 'tables.ndjson'), tableParts.join('\n') + '\n');
writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`Backup made ${header.createdAtIST || header.createdAt} (app ${header.appVersion}).`);
console.log(`${rows} records, ${tableRows} table rows and ${logins.length} logins, all checksums match. Written to ${outDir}`);
console.log('These files are not encrypted: keep them private and delete them when done.');
