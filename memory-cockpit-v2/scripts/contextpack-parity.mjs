#!/usr/bin/env node
/** Same fixture in, same winners out of the JS and Python live pickers. */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimGaps,
  classifyClaim,
  liveClaims,
  loadContextpackRules,
  parseAmounts,
  parseAsOf,
} from '../server/contextpack.js';
import { loadSectors } from '../../harness-stress/lib/sector-check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ont = path.join(REPO, 'ontology');
const rules = loadContextpackRules(ont);

function num(n) {
  const f = Number(n);
  if (Math.abs(f - Math.round(f)) < 1e-6) return Math.round(f);
  return f;
}

function snapshot(claims) {
  const live = liveClaims(claims, rules);
  return {
    live: Object.fromEntries(live.map((c) => [c.id, c.metric_id])),
    gaps: claimGaps(claims, rules),
    dates: Object.fromEntries(claims.map((c) => {
      const p = parseAsOf(c.as_of);
      return [c.id, { sort_key: p.sort_key, precision: p.precision }];
    })),
    units: Object.fromEntries(claims.map((c) => [c.id, parseAmounts(c.text || '').map((a) => ({
      unit: a.unit,
      currency: a.currency,
      scale: a.scale,
      value: num(a.value),
    }))])),
    classify: Object.fromEntries(claims.map((c) => [c.id, classifyClaim(c, rules).metric_id])),
  };
}

const fixture = loadSectors();
const bundles = fixture.issuers.map((issuer) => ({ id: issuer.id, claims: issuer.claims }));
const js = Object.fromEntries(bundles.map((b) => [b.id, snapshot(b.claims)]));
const proc = spawnSync('python3', [path.join(REPO, 'harness-stress/lib/parity_live.py')], {
  input: JSON.stringify({ bundles }),
  encoding: 'utf8',
  maxBuffer: 8 * 1024 * 1024,
});
if (proc.status !== 0) {
  console.error(proc.stderr || `python exit ${proc.status}`);
  process.exit(1);
}
const py = Object.fromEntries(JSON.parse(proc.stdout).bundles.map((b) => [b.id, b]));
let fail = 0;
for (const issuer of fixture.issuers) {
  const a = js[issuer.id];
  const b = py[issuer.id];
  delete b.id;
  if (JSON.stringify(a) !== JSON.stringify(b)) {
    fail += 1;
    console.error(`✗ ${issuer.id}`);
    console.error('  js', JSON.stringify(a));
    console.error('  py', JSON.stringify(b));
  } else {
    console.log('  ✓', issuer.id);
  }
}
console.log(fail ? `\n${fail} parity mismatches` : '\ncontextpack parity OK');
process.exit(fail ? 1 : 0);
