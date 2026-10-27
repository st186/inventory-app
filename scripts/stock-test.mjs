#!/usr/bin/env node
// Runs the Stock & Production unit tests (src/components/stock/*.test.ts): each is bundled with
// esbuild (they import app TypeScript) and run under plain node.
//
//   node scripts/stock-test.mjs

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIR = path.join(ROOT, 'src', 'components', 'stock');
const esbuild = await import('esbuild');
const cache = path.join(ROOT, 'node_modules', '.cache', 'stock-test');
fs.mkdirSync(cache, { recursive: true });

let failed = 0;
for (const name of fs.readdirSync(DIR).filter((f) => f.endsWith('.test.ts')).sort()) {
  const out = path.join(cache, `${name.replace(/\.ts$/, '')}-${process.pid}.mjs`);
  try {
    await esbuild.build({
      entryPoints: [path.join(DIR, name)],
      bundle: true,
      platform: 'node',
      format: 'esm',
      outfile: out,
      logLevel: 'silent',
      external: ['@capacitor/*'],
    });
    await import(pathToFileURL(out).href);
  } catch (err) {
    failed += 1;
    console.error(`${name}:`, err?.message || err);
  } finally {
    fs.rmSync(out, { force: true });
  }
}
if (failed) {
  console.error(`${failed} test file(s) failed`);
  process.exit(1);
}
