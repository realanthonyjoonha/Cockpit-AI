#!/usr/bin/env node
/**
 * thin-desk-format-check.mjs — fail-closed chrome parity for thin desks (Phase 3).
 * Registry: config/thin-desks.json
 * Chrome: pages/thin/* — desk folders must only re-export with desk props.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = JSON.parse(readFileSync(path.join(ROOT, 'config/thin-desks.json'), 'utf8'));
const THIN_DESKS = REG.desks.map((d) => d.slug);
const SHARED = [
  'Overview.jsx',
  'Risks.jsx',
  'Risk.jsx',
  'House.jsx',
  'Sources.jsx',
  'Street.jsx',
  'Ask.jsx',
  'Empty.jsx',
  'BookStrip.jsx',
  'UpdateMetaOnly.jsx',
  'DeskRouter.jsx',
];

let pass = 0;
let fail = 0;
const ok = (n) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad = (n, m) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n} — ${m}`); };

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) return null;
  return readFileSync(p, 'utf8');
}

console.log('\nThin-desk format / chrome parity (Phase 3 shared):\n');

// Registry present
ok(`registry desks: ${THIN_DESKS.join(', ')}`);

// Shared modules exist
for (const f of SHARED) {
  const rel = `src/pages/thin/${f}`;
  if (!existsSync(path.join(ROOT, rel))) bad(rel, 'missing shared module');
  else ok(rel);
}

// UpdateMetaOnly rules
{
  const rel = 'src/pages/thin/UpdateMetaOnly.jsx';
  const src = read(rel) || '';
  const codeOnly = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
  if (/<ol[\s>]/.test(codeOnly)) bad(rel, 'no <ol> for ritual criteria');
  else ok(`${rel} no <ol>`);
  if (!src.includes('16px')) bad(rel, 'expected 16px padding tokens');
  else ok(`${rel} 16px padding`);
  if (!src.includes('className="reg"')) bad(rel, 'use .reg lists');
  else ok(`${rel} .reg lists`);
}

// BookStrip labels
{
  const rel = 'src/pages/thin/BookStrip.jsx';
  const src = read(rel) || '';
  if (!src.includes('COMPILE BOOK') || !src.includes('REFRESH')) bad(rel, 'COMPILE BOOK + REFRESH');
  else ok(`${rel} labels`);
  if (/margin:\s*['"]0 12px/.test(src)) bad(rel, 'no 12px margins');
  else ok(`${rel} no 12px margins`);
}

// Per-slug wrappers are OPTIONAL (factory path: App → DeskRouter + pages/thin/*).
// If any wrapper exists for a desk, require the full set and thin re-exports only.
// Do not fail on missing pages/{slug}/* — that was fighting Path 2 registry scaling.
const WRAP = ['Overview', 'Risks', 'Risk', 'House', 'Sources', 'Ask', 'Empty', 'Update', 'BookStrip'];
{
  const app = read('src/App.jsx') || '';
  if (!app.includes('DeskRouter') && !app.includes('pages/thin/DeskRouter')) {
    bad('src/App.jsx', 'factory path requires DeskRouter (pages/thin) for thin desks');
  } else {
    ok('src/App.jsx uses DeskRouter / thin factory route');
  }
}
for (const slug of THIN_DESKS) {
  const present = [];
  const missing = [];
  for (const name of WRAP) {
    const rel = `src/pages/${slug}/${name}.jsx`;
    const src = read(rel);
    if (!src) {
      missing.push(name);
      continue;
    }
    present.push({ name, rel, src });
  }
  if (present.length === 0) {
    ok(`pages/${slug}/ — factory path (no per-slug wrappers; DeskRouter + thin/*)`);
    continue;
  }
  if (missing.length > 0) {
    bad(
      `pages/${slug}/`,
      `partial wrappers (${present.map((p) => p.name).join(',')}; missing ${missing.join(',')}) — full thin re-export set or none`,
    );
  }
  for (const { name, rel, src } of present) {
    if (!src.includes('../thin/') && !src.includes("pages/thin/")) {
      bad(rel, 'must re-export/use pages/thin/*');
      continue;
    }
    if (src.includes('className="sect"') && name !== 'BookStrip') {
      bad(rel, 'layout must not live in desk wrapper');
      continue;
    }
    ok(`${rel} → thin`);
  }
}

// thinDesks.js imports registry
{
  const src = read('src/thinDesks.js') || '';
  if (!src.includes('thin-desks.json')) bad('src/thinDesks.js', 'must import config/thin-desks.json');
  else ok('src/thinDesks.js registry import');
}

console.log(`\nformat-check ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
