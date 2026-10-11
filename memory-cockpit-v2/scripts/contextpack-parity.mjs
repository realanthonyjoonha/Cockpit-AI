#!/usr/bin/env node
/** Same fixture in, same winners out of the JS and Python live pickers, sentences and tagged XBRL facts. */
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
  sentenceHasAmount,
} from '../server/contextpack.js';
import { parseXbrlFacts, taggedSlots } from '../server/xbrlFacts.js';
import { loadSectors } from '../../harness-stress/lib/sector-check.mjs';
import { FACT_SETS, factsFor, loadReview, stable, taggedSnapshot } from '../../harness-stress/lib/review-check.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ont = path.join(REPO, 'ontology');
const rules = loadContextpackRules(ont);
const api = { rules, liveClaims, sentenceHasAmount, parseXbrlFacts, taggedSlots };

function num(n) {
  const f = Number(n);
  if (Math.abs(f - Math.round(f)) < 1e-6) return Math.round(f);
  return f;
}

function snapshot(claims, xbrl) {
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
    ...(xbrl ? tagged(claims, xbrl) : {}),
  };
}

function tagged(claims, xbrl) {
  const parsed = factsFor(api, xbrl);
  return { facts: parsed.facts, notes: parsed.notes, tagged: taggedSnapshot(api, claims, parsed.facts) };
}

const fixture = loadSectors();
const review = loadReview();
const reviewClaims = [...review.sentences, ...review.held_out]
  .map((s) => ({ id: s.id, text: s.text, as_of: review.as_of, grade: 'A', source_id: 'review' }));
const bundles = [
  ...fixture.issuers.map((issuer) => ({ id: issuer.id, claims: issuer.claims, xbrl: issuer.xbrl })),
  ...Object.entries(FACT_SETS).map(([tax, xbrl]) => ({ id: `review-${tax}`, claims: reviewClaims, xbrl })),
];
const js = Object.fromEntries(bundles.map((b) => [b.id, snapshot(b.claims, b.xbrl)]));
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
for (const { id } of bundles) {
  const a = js[id];
  const b = py[id];
  delete b.id;
  if (stable(a) !== stable(b)) {
    fail += 1;
    console.error(`✗ ${id}`);
    console.error('  js', stable(a).slice(0, 2000));
    console.error('  py', stable(b).slice(0, 2000));
  } else {
    console.log('  ✓', id, a.facts ? `(${a.facts.length} facts, ${Object.keys(a.tagged.slots).length} tagged slots)` : '');
  }
}
console.log(fail ? `\n${fail} parity mismatches` : '\ncontextpack parity OK');
process.exit(fail ? 1 : 0);
