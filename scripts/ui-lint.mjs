#!/usr/bin/env node
// Counts the "warm ledger" forbidden patterns (design review section c6) per file.
//
//   node scripts/ui-lint.mjs                      every .ts/.tsx/.js/.jsx under src/
//   node scripts/ui-lint.mjs --files a.tsx b.tsx  only these files (a package's own files)
//   node scripts/ui-lint.mjs --strict             exit code 1 when anything is found
//   node scripts/ui-lint.mjs --json               machine-readable output
//   node scripts/ui-lint.mjs --details            also print each hit (file:line and text)
//
// Comments are ignored. src/components/ui/* is where palette colours and modal overlays are
// allowed to live, so those two rules skip it.

import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SRC = path.join(ROOT, 'src');
const UI_DIR = path.join(SRC, 'components', 'ui') + path.sep;

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose';
const SHADES = '50|100|200|300|400|500|600|700|800|900|950';

const RULES = [
  { id: 'gradient', label: 'Gradients', re: /\bbg-(?:gradient|linear|radial|conic)-[\w[\]/-]*|\b(?:linear|radial|conic)-gradient\(/g },
  {
    id: 'shadow-colour',
    label: 'Coloured shadows',
    re: new RegExp(String.raw`\bshadow-(?:${PALETTE}|primary|secondary|accent|destructive|success|warning|danger|info)(?:-(?:${SHADES}))?(?:\/\d+)?(?![\w-])`, 'g'),
  },
  { id: 'blur-deco', label: 'blur-2xl/3xl decoration', re: /\bblur-(?:2xl|3xl)\b/g },
  { id: 'bounce', label: 'animate-bounce', re: /\banimate-bounce\b/g },
  { id: 'hover-scale', label: 'hover:scale-*', re: /\b(?:group-)?hover:scale-[\w.[\]]+/g },
  { id: 'opacity-util', label: 'bg-opacity-* (v3)', re: /\b(?:bg|text|border|ring|divide|placeholder)-opacity-\d+\b/g },
  {
    id: 'tiny-text',
    label: 'Text under 12 px',
    test(line) {
      const hits = [];
      for (const m of line.matchAll(/\btext-\[(\d+(?:\.\d+)?)(px|rem)\]/g)) {
        const px = m[2] === 'rem' ? Number(m[1]) * 16 : Number(m[1]);
        if (px < 12) hits.push(m[0]);
      }
      for (const m of line.matchAll(/fontSize\s*:\s*['"]?(\d+(?:\.\d+)?)(px)?['"]?/g)) {
        if (Number(m[1]) < 12) hits.push(m[0]);
      }
      return hits;
    },
  },
  {
    id: 'raw-hex',
    label: 'Raw hex colours',
    re: /(?<=[\s'"`[(:,=])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![\w-])/g,
  },
  {
    id: 'palette',
    label: 'Raw palette classes (outside ui/*)',
    skipUi: true,
    re: new RegExp(
      String.raw`(?<![\w-])(?:[a-z-]+:)*(?:bg|text|border(?:-[trblxy])?|ring|ring-offset|from|via|to|fill|stroke|divide|outline|placeholder|decoration|accent|caret)-(?:${PALETTE})-(?:${SHADES})(?:\/\d+)?(?![\w-])`,
      'g',
    ),
  },
  {
    id: 'emoji',
    label: 'Emoji',
    test(line) {
      if (/\bconsole\.(?:log|info|debug|warn|error)\(/.test(line)) return [];
      const hits = [];
      for (const m of line.matchAll(/\p{Extended_Pictographic}|[✓✔✗✘]/gu)) {
        const ch = m[0];
        // ©, ®, ™ and plain arrows are typography, not emoji
        if (/[©®™←-↙↩↪]/.test(ch)) continue;
        hits.push(ch);
      }
      return hits;
    },
  },
  {
    id: 'native-dialog',
    label: 'alert/confirm/prompt',
    // a string or variable argument = the browser's dialog; confirm({ ... }) is the ui helper
    re: /(?<![\w.$])(?<!function\s)(?:window\.)?(?:alert|confirm|prompt)\s*\((?!\s*[{)])/g,
  },
  {
    id: 'fixed-modal',
    label: 'Hand-rolled fixed inset-0 modals',
    skipUi: true,
    test(line) {
      const hits = [];
      for (const m of line.matchAll(/(["'`])([^"'`]*)\1/g)) {
        const cls = m[2];
        if (/(?:^|\s)fixed(?:\s|$)/.test(cls) && /(?:^|\s)inset-0(?:\s|$)/.test(cls)) hits.push('fixed inset-0');
      }
      return hits;
    },
  },
];

// Blank out comments but keep strings, line numbers and column positions.
function stripComments(source) {
  let out = '';
  let i = 0;
  const n = source.length;
  let mode = 'code';
  let quote = '';
  while (i < n) {
    const c = source[i];
    const next = source[i + 1];
    if (mode === 'code') {
      if (c === '/' && next === '/') {
        mode = 'line';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '/' && next === '*') {
        mode = 'block';
        out += '  ';
        i += 2;
        continue;
      }
      if (c === '"' || c === "'" || c === '`') {
        mode = 'string';
        quote = c;
      }
      out += c;
      i += 1;
      continue;
    }
    if (mode === 'string') {
      out += c;
      if (c === '\\') {
        out += source[i + 1] ?? '';
        i += 2;
        continue;
      }
      if (c === quote) mode = 'code';
      else if (c === '\n' && quote !== '`') mode = 'code';
      i += 1;
      continue;
    }
    if (mode === 'line') {
      if (c === '\n') {
        mode = 'code';
        out += c;
      } else out += ' ';
      i += 1;
      continue;
    }
    // block comment
    if (c === '*' && next === '/') {
      mode = 'code';
      out += '  ';
      i += 2;
      continue;
    }
    out += c === '\n' ? '\n' : ' ';
    i += 1;
  }
  return out;
}

function walk(dir, files = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue;
      walk(full, files);
    } else if (/\.(tsx?|jsx?)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
      files.push(full);
    }
  }
  return files;
}

function lintFile(file) {
  const text = stripComments(fs.readFileSync(file, 'utf8'));
  const inUi = path.resolve(file).startsWith(UI_DIR);
  const counts = Object.fromEntries(RULES.map((r) => [r.id, 0]));
  const details = [];
  text.split('\n').forEach((line, idx) => {
    for (const rule of RULES) {
      if (rule.skipUi && inUi) continue;
      const hits = rule.test ? rule.test(line) : [...line.matchAll(rule.re)].map((m) => m[0]);
      if (hits.length) {
        counts[rule.id] += hits.length;
        for (const h of hits) details.push({ rule: rule.id, line: idx + 1, text: h });
      }
    }
  });
  return { counts, details };
}

// --- CLI ---
const args = process.argv.slice(2);
const strict = args.includes('--strict');
const asJson = args.includes('--json');
const showDetails = args.includes('--details');
let targets;
const filesAt = args.indexOf('--files');
if (filesAt !== -1) {
  targets = [];
  for (const a of args.slice(filesAt + 1)) {
    if (a.startsWith('--')) break;
    const full = path.resolve(process.cwd(), a);
    if (!fs.existsSync(full)) {
      console.error(`ui-lint: no such file: ${a}`);
      process.exit(2);
    }
    if (fs.statSync(full).isDirectory()) walk(full, targets);
    else targets.push(full);
  }
} else {
  targets = walk(SRC);
}

const results = targets
  .map((file) => ({ file: path.relative(ROOT, file).split(path.sep).join('/'), ...lintFile(file) }))
  .map((r) => ({ ...r, total: Object.values(r.counts).reduce((a, b) => a + b, 0) }));

const totals = Object.fromEntries(RULES.map((r) => [r.id, results.reduce((s, f) => s + f.counts[r.id], 0)]));
const grand = Object.values(totals).reduce((a, b) => a + b, 0);
const filesWithHits = results.filter((r) => r.total > 0).sort((a, b) => b.total - a.total);

if (asJson) {
  console.log(JSON.stringify({ files: results.length, filesWithHits: filesWithHits.length, totals, total: grand, results: filesWithHits }, null, 2));
} else {
  const short = { gradient: 'grad', 'shadow-colour': 'shad', 'blur-deco': 'blur', bounce: 'bnc', 'hover-scale': 'hscl', 'opacity-util': 'opac', 'tiny-text': '<12', 'raw-hex': 'hex', palette: 'pal', emoji: 'emoji', 'native-dialog': 'dlg', 'fixed-modal': 'modal' };
  const cols = RULES.map((r) => short[r.id]);
  const nameWidth = Math.min(60, Math.max(20, ...filesWithHits.map((r) => r.file.length)));
  const pad = (s, w) => String(s).padStart(w);
  const header = `${'file'.padEnd(nameWidth)} ${cols.map((c) => pad(c, 5)).join(' ')} ${pad('total', 6)}`;
  console.log(header);
  console.log('-'.repeat(header.length));
  for (const r of filesWithHits) {
    const name = r.file.length > nameWidth ? '…' + r.file.slice(-(nameWidth - 1)) : r.file.padEnd(nameWidth);
    console.log(`${name} ${RULES.map((rule) => pad(r.counts[rule.id] || '.', 5)).join(' ')} ${pad(r.total, 6)}`);
    if (showDetails) for (const d of r.details) console.log(`    ${d.rule.padEnd(14)} ${r.file}:${d.line}  ${d.text}`);
  }
  console.log('-'.repeat(header.length));
  console.log(`${'TOTAL'.padEnd(nameWidth)} ${RULES.map((rule) => pad(totals[rule.id], 5)).join(' ')} ${pad(grand, 6)}`);
  console.log(`\n${results.length} files scanned, ${filesWithHits.length} with findings.`);
  console.log('Columns: ' + RULES.map((r) => `${short[r.id]} = ${r.label}`).join(' · '));
}

if (strict && grand > 0) process.exit(1);
