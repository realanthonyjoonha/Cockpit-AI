#!/usr/bin/env node
/**
 * learn-factory.mjs — score (and optionally seed) Background product maps.
 *
 * Default: dry-run against registry desks only. Never writes primers.
 * Never treats LLY as a desk (even if cockpit/learn/LLY exists).
 *
 *   node scripts/learn-factory.mjs
 *   node scripts/learn-factory.mjs --dry-run
 *   node scripts/learn-factory.mjs --desk nvda --write-seed
 *
 * Decision-support only. Not House / pack / COMPILE BOOK.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'config', 'thin-desks.json');

const args = process.argv.slice(2);
const dryRun = !args.includes('--write-seed') && !args.includes('--fill');
const writeSeed = args.includes('--write-seed');
const deskArgIdx = args.indexOf('--desk');
const deskFilter = deskArgIdx >= 0 ? String(args[deskArgIdx + 1] || '').toLowerCase() : null;

function loadRegistryDesks() {
  const raw = JSON.parse(fs.readFileSync(REG, 'utf8'));
  const desks = Array.isArray(raw.desks) ? raw.desks : [];
  return desks.map((d) => ({
    slug: d.slug,
    ticker: String(d.ticker || '').toUpperCase(),
    label: d.label || d.ticker,
    rawDir: d.profile?.rawDir || null,
  }));
}

const {
  getLearnSnapshot,
} = await import(path.join(ROOT, 'server', 'thinLearn.js'));
const { harvestLearnSources } = await import(path.join(ROOT, 'server', 'learnHarvest.js'));
const { writeLearnAgentSeed } = await import(path.join(ROOT, 'server', 'learnAgentSeed.js'));
const { LEARN_DEPTH_BAR } = await import(path.join(ROOT, 'server', 'learnMap.js'));
const { resolveVaultDir } = await import(path.join(ROOT, 'server', 'monorepoPaths.js'));

let fail = 0;
let pass = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nlearn-map factory');
console.log(`  registry: ${REG}`);
  console.log(`  bar: primer≥${LEARN_DEPTH_BAR.primer_min_words}w · nodes≥${LEARN_DEPTH_BAR.min_ready_nodes} · lessons≥${LEARN_DEPTH_BAR.min_lessons_with_body}×${LEARN_DEPTH_BAR.lesson_min_words}w · diagrams≥${LEARN_DEPTH_BAR.min_diagrams}`);
console.log(`  mode: ${writeSeed ? 'write-seed (no primer overwrite)' : 'dry-run (no writes)'}\n`);

if (args.includes('--fill')) {
  console.log('  REFUSE --fill in this spike. Do not silently rewrite live primers.');
  console.log('  Dogfood: OPEN GROK /cockpit-learn {slug} primer after reading the seed.\n');
  process.exit(2);
}

const desks = loadRegistryDesks();
const isLly = (d) => String(d.ticker).toUpperCase() === 'LLY' || String(d.slug).toLowerCase() === 'lly';
const learnDesks = desks.filter((d) => !isLly(d));
if (desks.some(isLly)) {
  ok('LLY registry row skipped — not a learn-map desk (do not add more)');
} else {
  ok('LLY is not a registry desk');
}

const learnRoot = path.join(resolveVaultDir(), 'cockpit', 'learn');
if (fs.existsSync(path.join(learnRoot, 'LLY'))) {
  ok('LLY learn files may exist on disk — factory still skips them');
}

const targets = deskFilter
  ? learnDesks.filter((d) => d.slug === deskFilter || d.ticker.toLowerCase() === deskFilter)
  : learnDesks;
if (deskFilter === 'lly') {
  ok('--desk lly skipped (not a learn-map desk)');
} else if (deskFilter && targets.length === 0) {
  bad(`unknown --desk ${deskFilter} (not in thin-desks.json)`);
}

if (desks.length === 0) {
  ok('empty registry — nothing to score (product desks=[] still fine)');
}

function pad(s, n) {
  const t = String(s ?? '');
  if (t.length >= n) return t.slice(0, n);
  return t + ' '.repeat(n - t.length);
}

function photosCol(photos) {
  const list = Array.isArray(photos) ? photos : [];
  const primary = list.filter((p) => (p.lane || 'primary') === 'primary').length;
  const tape = list.filter((p) => p.lane === 'tape').length;
  const missing = list.some((p) => p.present === false);
  return `${primary}p+${tape}t${missing ? '!' : ''}`;
}

console.log(`\n  ${pad('desk', 8)} ${pad('fam~', 18)} ${pad('words', 6)} ${pad('less', 5)} ${pad('map', 4)} ${pad('diag', 4)} ${pad('photos', 8)} ${pad('types', 28)} ${pad('gate', 6)} reasons`);
for (const d of targets) {
  const harvest = harvestLearnSources(d.ticker, { desk: d.slug, rawDir: d.rawDir });
  const snap = getLearnSnapshot(d.ticker, { desk: d.slug });
  const gate = snap.depth_gate || {};
  const words = gate.primer_words || 0;
  const fam = harvest.family_guess || '—';
  const typeList = [...new Set((snap.map?.diagrams || []).map((x) => x.type))].join(',') || '—';
  const reasons = (gate.reasons || []).join('; ').slice(0, 72);
  console.log(
    `  ${pad(d.slug, 8)} ${pad(fam, 18)} ${pad(words, 6)} ${pad(gate.lesson_count || 0, 5)} ${pad(gate.map_nodes || 0, 4)} ${pad(gate.diagram_count || 0, 4)} ${pad(photosCol(snap.map?.photos), 8)} ${pad(typeList, 28)} ${pad(gate.ok ? 'PASS' : 'FAIL', 6)} ${reasons}`,
  );
  if (writeSeed) {
    const seed = writeLearnAgentSeed(d.slug, { mode: 'primer', rawDir: d.rawDir });
    if (!seed.ok) bad(`${d.slug} seed ${seed.error}`);
    else ok(`${d.slug} seed ${seed.path} (${seed.bytes} bytes)`);
  }
}

if (targets.length && !writeSeed) {
  ok(`scored ${targets.length} registry desk(s); live primers not written`);
}

console.log(`\nlearn-factory ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
console.log('  Next (operate, not this script): dogfood NVDA fill, then MRVL to prove learner merge.');
process.exit(fail ? 1 : 0);
