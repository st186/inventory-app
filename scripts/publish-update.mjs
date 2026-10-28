#!/usr/bin/env node
// Publishes an update to the public app-updates storage folder that the Android app reads
// (src/utils/liveUpdate.ts):
//
//   node scripts/publish-update.mjs bundle   Live update: zips dist/ (run `npm run build` first)
//                                            as version APP_VERSION (src/utils/appVersion.ts).
//                                            Phones on the current APK (build.gradle versionCode)
//                                            or newer switch to it on their next open.
//   node scripts/publish-update.mjs apk      New Android app: uploads the debug APK as
//                                            versionName / versionCode from build.gradle. Phones
//                                            on an older APK get a Download button.
//
// --dry builds the files and the new manifest in a temp folder without uploading anything.
// Files go to the app-updates storage folder, named with a fingerprint of their contents, as
// `supabase storage cp` can't replace a file: a rebuilt file gets a new name. The manifest - both halves, the other one kept -
// is the kv row app-update-manifest, which GET /app-version hands out. Both go through the
// Supabase CLI, signed in as the project owner.
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, relative, sep } from 'node:path';
import { crc32, deflateRawSync } from 'node:zlib';

const root = join(import.meta.dirname, '..');
const kind = process.argv[2];
const dry = process.argv.includes('--dry');
if (kind !== 'bundle' && kind !== 'apk') {
  console.error('Usage: node scripts/publish-update.mjs bundle|apk');
  process.exit(1);
}

const projectId = readFileSync(join(root, 'src/utils/supabase/info.tsx'), 'utf8').match(/projectId = "([^"]+)"/)[1];
const base = `https://${projectId}.supabase.co/storage/v1/object/public/app-updates`;
const appVersionUrl = `https://${projectId}.supabase.co/functions/v1/make-server-c2dd9b9d/app-version`;
const appVersion = readFileSync(join(root, 'src/utils/appVersion.ts'), 'utf8').match(/APP_VERSION = '([\d.]+)'/)[1];
const gradle = readFileSync(join(root, 'android/app/build.gradle'), 'utf8');
const versionCode = Number(gradle.match(/versionCode (\d+)/)[1]);
const versionName = gradle.match(/versionName "([\d.]+)"/)[1];
const work = mkdtempSync(join(tmpdir(), 'bunny-update-'));

// Windows runs npx through the shell, which splits unquoted paths at spaces ("Bunny Momos"); and
// the CLI reads a "C:" path as a URL, so paths go in relative to the project.
const win = process.platform === 'win32';
const npx = (args) => execFileSync('npx', win ? args.map((a) => `"${a}"`) : args, { cwd: root, stdio: 'inherit', shell: win });
const local = (file) => relative(root, file).split(sep).join('/');

const fingerprint = (file) => createHash('sha256').update(readFileSync(file)).digest('hex');

async function upload(file, dest, contentType, cacheControl) {
  if ((await fetch(`${base}/${dest}`, { method: 'HEAD' })).ok) return console.log(`app-updates/${dest} is already published`);
  if (dry) return console.log(`(dry) would upload ${file} -> app-updates/${dest}`);
  npx(['supabase', 'storage', 'cp', local(file), `ss:///app-updates/${dest}`, '--linked', '--experimental', '--content-type', contentType, '--cache-control', cacheControl]);
}

// A plain zip (deflate, forward-slash paths, index.html at the root) - what the updater unpacks.
function zipFolder(dir) {
  const files = [];
  const walk = (d) => readdirSync(d).forEach((name) => {
    const full = join(d, name);
    if (statSync(full).isDirectory()) walk(full);
    else files.push(relative(dir, full).split(sep).join('/'));
  });
  walk(dir);
  const parts = [];
  const central = [];
  let offset = 0;
  for (const path of files) {
    const data = readFileSync(join(dir, path));
    const packed = deflateRawSync(data, { level: 9 });
    const name = Buffer.from(path, 'utf8');
    const crc = crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6); // UTF-8 names
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt16LE(0x21, 12); // 1 Jan 1980
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(packed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(name.length, 26);
    parts.push(local, name, packed);
    const entry = Buffer.alloc(46);
    entry.writeUInt32LE(0x02014b50, 0);
    entry.writeUInt16LE(20, 4);
    entry.writeUInt16LE(20, 6);
    entry.writeUInt16LE(0x0800, 8);
    entry.writeUInt16LE(8, 10);
    entry.writeUInt16LE(0x21, 14);
    entry.writeUInt32LE(crc, 16);
    entry.writeUInt32LE(packed.length, 20);
    entry.writeUInt32LE(data.length, 24);
    entry.writeUInt16LE(name.length, 28);
    entry.writeUInt32LE(offset, 42);
    central.push(entry, name);
    offset += 30 + name.length + packed.length;
  }
  const directory = Buffer.concat(central);
  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(files.length, 8);
  end.writeUInt16LE(files.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(offset, 16);
  return Buffer.concat([...parts, directory, end]);
}

const current = await fetch(`${appVersionUrl}?t=${Date.now()}`, { cache: 'no-store' });
if (!current.ok) throw new Error(`GET /app-version answered ${current.status}`);
const manifest = (await current.json()).updates || {};

if (kind === 'bundle') {
  const dist = join(root, 'dist');
  if (!existsSync(join(dist, 'index.html'))) throw new Error('No dist/index.html - run npm run build first');
  // The build must be of this version, or phones would download it again on every open.
  const js = readdirSync(join(dist, 'assets')).filter((f) => f.endsWith('.js')).map((f) => readFileSync(join(dist, 'assets', f), 'utf8'));
  if (!js.some((text) => text.includes(`"${appVersion}"`))) throw new Error(`dist/ was not built with APP_VERSION ${appVersion} - run npm run build`);
  if (manifest.bundle?.version === appVersion) throw new Error(`Bundle ${appVersion} is already published - bump APP_VERSION`);
  const zip = zipFolder(dist);
  const file = join(work, `${appVersion}.zip`);
  writeFileSync(file, zip);
  const checksum = fingerprint(file);
  const dest = `bundles/${appVersion}-${checksum.slice(0, 10)}.zip`;
  await upload(file, dest, 'application/zip', 'max-age=31536000');
  manifest.bundle = { version: appVersion, url: `${base}/${dest}`, checksum, minNativeBuild: versionCode };
  console.log(`Bundle ${appVersion}: ${(zip.length / 1e6).toFixed(1)} MB, for APK build ${versionCode} and newer`);
} else {
  const apk = join(root, 'android/app/build/outputs/apk/debug/app-debug.apk');
  const built = JSON.parse(readFileSync(join(root, 'android/app/build/outputs/apk/debug/output-metadata.json'), 'utf8')).elements[0];
  if (built.versionCode !== versionCode) throw new Error(`The APK is build ${built.versionCode}, build.gradle says ${versionCode} - rebuild it`);
  const dest = `apk/BunnyMomos-${versionName}-${fingerprint(apk).slice(0, 10)}.apk`;
  await upload(apk, dest, 'application/vnd.android.package-archive', 'max-age=31536000');
  manifest.apk = { version: versionName, build: versionCode, url: `${base}/${dest}` };
  console.log(`APK ${versionName} (build ${versionCode})`);
}

console.log(JSON.stringify(manifest, null, 2));
const sql = join(work, 'manifest.sql');
writeFileSync(sql, `insert into kv_store_c2dd9b9d (key, value) values ('app-update-manifest', $manifest$${JSON.stringify(manifest)}$manifest$::jsonb)
on conflict (key) do update set value = excluded.value;
`);
if (dry) console.log(`(dry) would run ${sql}`);
else {
  npx(['supabase', 'db', 'query', '--linked', '-f', local(sql)]);
  console.log('Published: GET /app-version now hands it out.');
}
