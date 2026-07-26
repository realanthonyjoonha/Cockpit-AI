#!/usr/bin/env node
// Opt-in write-path drill (Phase 5). Mutates entity claim then reverts.
//   WRITE_PATH_DRILL=1 npm run write-path-drill
// Never run as default smoke.
import { spawnSync } from 'child_process';
import { createHash } from 'crypto';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

if (process.env.WRITE_PATH_DRILL !== '1') {
  console.error('Refusing to run: set WRITE_PATH_DRILL=1 to opt in (mutates wiki entity temporarily).');
  process.exit(2);
}

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const HOME = os.homedir();
/** Prefer monorepo clone (sibling of memory-cockpit-v2), then env, then ~/Trading legacy. */
function resolveWiki() {
  if (process.env.COCKPIT_VAULT || process.env.ONTOLOGY_WIKI) {
    return path.resolve(process.env.COCKPIT_VAULT || process.env.ONTOLOGY_WIKI);
  }
  const mono = path.resolve(ROOT, '..', 'research-wiki');
  if (existsSync(path.join(mono, 'wiki', 'entities', 'nebius.md'))) return mono;
  return path.join(HOME, 'Trading', 'research-wiki');
}
function resolveOnt() {
  if (process.env.ONTOLOGY_ROOT) {
    const p = path.join(process.env.ONTOLOGY_ROOT, 'ont');
    if (existsSync(p)) return p;
  }
  const mono = path.resolve(ROOT, '..', 'ontology', 'ont');
  if (existsSync(mono)) return mono;
  return path.join(HOME, 'Trading', 'ontology', 'ont');
}
function resolveStore() {
  if (process.env.ONTOLOGY_STORE) return path.resolve(process.env.ONTOLOGY_STORE);
  const mono = path.resolve(ROOT, '..', 'ontology', 'store', 'by_ticker');
  if (existsSync(path.join(mono, 'NBIS.json'))) return mono;
  return path.join(HOME, 'Trading', 'ontology', 'store', 'by_ticker');
}
const WIKI = resolveWiki();
const ENTITY = path.join(WIKI, 'wiki', 'entities', 'nebius.md');
const HOUSE = path.join(WIKI, 'house-view-nebius.md');
const ONT = resolveOnt();
const STORE = resolveStore();
const TOKEN = `PHASE5-PROBE-${new Date().toISOString().slice(0, 10)}-${process.pid}`;
const PROBE_LINE = `- Write-path drill probe ${TOKEN} (2026-07-20) [C] [[phase5-probe]]\n`;

function sha(p) {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

function fail(msg) {
  console.error('FAIL:', msg);
  process.exit(1);
}

function ok(msg) {
  console.log('  ✓', msg);
}

console.log('\nWRITE-PATH DRILL (opt-in) — token', TOKEN);
console.log('wiki=', WIKI);
console.log('ont=', ONT);
console.log('store=', STORE);

if (!existsSync(ENTITY)) fail(`entity missing: ${ENTITY}`);
if (!existsSync(HOUSE)) fail(`house missing: ${HOUSE}`);
if (!existsSync(ONT)) fail(`ont missing: ${ONT}`);

const houseBefore = sha(HOUSE);
const entityBefore = readFileSync(ENTITY, 'utf8');
ok(`house hash snap ${houseBefore.slice(0, 12)}…`);

// S2 — insert into Key facts section (compile only parses that section)
if (entityBefore.includes(TOKEN)) fail('token already in entity — clean up first');
const factsHdr = '## Key facts (timestamped · graded · sourced)';
const fi = entityBefore.indexOf(factsHdr);
if (fi < 0) fail('entity missing Key facts section');
// Insert after first claim bullet under Key facts
const afterHdr = entityBefore.indexOf('\n', fi) + 1;
const rest = entityBefore.slice(afterHdr);
const firstBullet = rest.search(/^- /m);
if (firstBullet < 0) fail('no claim bullets under Key facts');
const insertAt = afterHdr + firstBullet;
const entityWithProbe = entityBefore.slice(0, insertAt) + PROBE_LINE + entityBefore.slice(insertAt);
writeFileSync(ENTITY, entityWithProbe);
ok('inserted probe claim under Key facts section');

// S3 compile
let r = spawnSync(ONT, ['compile', 'NBIS'], { encoding: 'utf8', cwd: path.dirname(ONT) });
if (r.status !== 0) {
  writeFileSync(ENTITY, entityBefore);
  fail(`compile failed: ${(r.stderr || r.stdout || '').slice(0, 400)}`);
}
ok('compiled NBIS');

// S6 house unchanged after pin
if (sha(HOUSE) !== houseBefore) {
  writeFileSync(ENTITY, entityBefore);
  spawnSync(ONT, ['compile', 'NBIS'], { cwd: path.dirname(ONT) });
  fail('house-view-nebius.md changed during claims-only write — S6 violated');
}
ok('house file hash unchanged (S6)');

// S5 ask CLI contains token
r = spawnSync(ONT, ['ask', 'NBIS', 'key claims'], { encoding: 'utf8', cwd: path.dirname(ONT) });
const askOut = (r.stdout || '') + (r.stderr || '');
if (!askOut.includes(TOKEN) && !askOut.toLowerCase().includes('claim')) {
  // claims may not all surface in ask if format drop — check pack JSON
  const pack = JSON.parse(readFileSync(path.join(STORE, 'NBIS.json'), 'utf8'));
  const texts = (pack.claims || []).map((c) => c.text || '').join('\n');
  if (!texts.includes(TOKEN)) {
    writeFileSync(ENTITY, entityBefore);
    spawnSync(ONT, ['compile', 'NBIS'], { cwd: path.dirname(ONT) });
    fail('probe token not in pack claims after compile — check claim format parsing');
  }
  ok('probe in pack claims (CLI ask may truncate)');
} else if (askOut.includes(TOKEN)) {
  ok('probe visible in ./ont ask key claims');
} else {
  const pack = JSON.parse(readFileSync(path.join(STORE, 'NBIS.json'), 'utf8'));
  const texts = (pack.claims || []).map((c) => c.text || '').join('\n');
  if (!texts.includes(TOKEN)) {
    writeFileSync(ENTITY, entityBefore);
    spawnSync(ONT, ['compile', 'NBIS'], { cwd: path.dirname(ONT) });
    fail('probe not in pack');
  }
  ok('probe in pack claims');
}

// Cleanup
writeFileSync(ENTITY, entityBefore);
r = spawnSync(ONT, ['compile', 'NBIS'], { encoding: 'utf8', cwd: path.dirname(ONT) });
if (r.status !== 0) fail('cleanup compile failed — entity restored but pack may still hold probe until compile OK');
ok('reverted entity + recompiled');

if (sha(HOUSE) !== houseBefore) fail('house changed during cleanup');
ok('house hash still stable');

const pack2 = JSON.parse(readFileSync(path.join(STORE, 'NBIS.json'), 'utf8'));
const texts2 = (pack2.claims || []).map((c) => c.text || '').join('\n');
if (texts2.includes(TOKEN)) fail('probe still in pack after cleanup');
ok('probe removed from pack');

console.log(`\nWRITE-PATH DRILL PASS — wiki=${WIKI}`);
console.log('S2/S3/S5/S6 exercised (S1 human; S4 glass REFRESH BOOK)\n');
process.exit(0);
