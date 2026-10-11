/**
 * Phase gates. Exit 1 when a case in that phase fails.
 * P0 owns the DEMO repros and the ten-sector fixture.
 * P1 adds the cap, the agent closer, and the series allowlist.
 * Later phases add GO cases to --assert sectors.
 */
import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  claimGaps,
  classifyClaim,
  classifyMetric,
  liveClaims,
  loadContextpackRules,
  parseAmounts,
  parseAsOf,
  riskMetric,
} from '../../memory-cockpit-v2/server/contextpack.js';
import { sectorBudgetErrors } from './assert-p1.mjs';
import {
  bannedNeedles,
  bannedWordHits,
  checkDemo,
  checkSectors,
  loadSectors,
} from './sector-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

function pySnapshot(bundles) {
  const proc = spawnSync('python3', [path.join(HERE, 'parity_live.py')], {
    input: JSON.stringify({ bundles }),
    encoding: 'utf8',
    maxBuffer: 8 * 1024 * 1024,
  });
  if (proc.status !== 0) {
    return { error: proc.stderr || `python exit ${proc.status}` };
  }
  try {
    return JSON.parse(proc.stdout);
  } catch (err) {
    return { error: `bad python json: ${err.message}` };
  }
}

function num(n) {
  const f = Number(n);
  if (Math.abs(f - Math.round(f)) < 1e-6) return Math.round(f);
  return f;
}

function jsFull(claims, rules) {
  const live = liveClaims(claims, rules);
  return {
    winner: live[0]?.id || null,
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

export function assertSectors() {
  const errors = [];
  const ont = path.join(REPO, 'ontology');
  const rules = loadContextpackRules(ont);
  const api = { rules, liveClaims, classifyClaim, classifyMetric, parseAsOf, parseAmounts, claimGaps, riskMetric };
  errors.push(...checkSectors(loadSectors(), api));
  const rulesText = readFileSync(path.join(ont, 'schema/contextpack_metrics.json'), 'utf8');
  const xbrlText = readFileSync(path.join(ont, 'schema/taxonomy_xbrl.json'), 'utf8');
  for (const hit of bannedWordHits(rulesText)) errors.push(`metrics JSON contains ${hit}`);
  for (const hit of bannedWordHits(xbrlText)) errors.push(`XBRL map contains ${hit}`);
  for (const stem of bannedNeedles(rules)) errors.push(`needle stem ${stem}`);
  const fixture = loadSectors();
  const py = pySnapshot(fixture.issuers.map((issuer) => ({ id: issuer.id, claims: issuer.claims })));
  if (py.error) errors.push(py.error);
  else {
    const pyById = Object.fromEntries((py.bundles || []).map((b) => [b.id, b]));
    for (const issuer of fixture.issuers) {
      const js = jsFull(issuer.claims, rules);
      const row = pyById[issuer.id];
      if (!row) {
        errors.push(`${issuer.id} missing from python`);
        continue;
      }
      delete row.id;
      const { winner: _w, ...jsRest } = js;
      if (JSON.stringify(jsRest) !== JSON.stringify(row)) {
        errors.push(`${issuer.id} js/py snapshot mismatch`);
      }
    }
  }
  const desks = JSON.parse(readFileSync(path.join(REPO, 'memory-cockpit-v2/config/thin-desks.json'), 'utf8'));
  if (!Array.isArray(desks.desks) || desks.desks.length !== 0) {
    errors.push('thin-desks.json desks is not empty');
  }
  errors.push(...sectorBudgetErrors());
  return errors;
}

export function assertP0() {
  const errors = assertSectors();
  const ont = path.join(REPO, 'ontology');
  const rules = loadContextpackRules(ont);
  const api = { rules, liveClaims, classifyClaim, classifyMetric, parseAsOf, parseAmounts, claimGaps, riskMetric };
  errors.push(...checkDemo(api));

  const claim = (id, text, asOf, grade = 'A') => ({ id, text, as_of: asOf, grade, source_id: 'fixture' });
  const bundles = [
    {
      id: 'C-date-unpadded',
      claims: [
        claim('sep', 'Net sales were $111 million', '2026-9-30'),
        claim('oct', 'Net sales were $222 million', '2026-10-01'),
      ],
      winner: 'oct',
    },
    {
      id: 'C-date-iso',
      claims: [
        claim('old', 'Net sales were $111 million', '2026-09-30'),
        claim('new', 'Net sales were $222 million', '2026-10-01'),
      ],
      winner: 'new',
    },
    {
      id: 'C-guid-steals-cash',
      claims: [
        claim('cash-clean', 'Cash and cash equivalents were $90 million', '2026-06-01'),
        claim('cash-guid', 'Cash and cash equivalents were $90 million. See guidance.', '2026-06-02'),
        claim('outlook', 'Outlook for next quarter revenue is $100 million', '2026-06-01'),
      ],
      live: { 'cash-guid': 'cash', outlook: 'revenue_guide' },
    },
    {
      id: 'C-cash-phrase',
      claims: [
        claim('old-cash', 'Cash and cash equivalents were $111 million', '2024-01-01'),
        claim('new-cash', 'Cash was $222 million', '2026-06-01'),
      ],
      live: { 'new-cash': 'cash' },
    },
    {
      id: 'C-drops',
      claims: [
        claim('space', 'Unmatched spend was $ 12 million', '2026-01-01'),
        claim('tight', 'Unmatched spend was $12 million', '2026-01-01'),
        claim('emp', 'Number of employees was $4242 thousand', '2026-01-01'),
        claim('qual', 'CANARY-SEGMENTS the fixture reports exactly 3 segments', '2026-01-01'),
        claim('pct', 'segment mix was 45 percent', '2026-01-01'),
        claim('pctsign', 'segment mix was 45%', '2026-01-02'),
      ],
      present: ['space', 'tight', 'emp', 'pct', 'pctsign'],
      absent: ['qual'],
      live: { emp: 'headcount' },
    },
    {
      id: 'C-goodwill-any',
      claims: [
        claim('inv-imp', 'Inventory impairment of $9 million', '2026-05-01'),
        claim('gw-bal', 'A goodwill balance of $5 billion', '2026-05-01'),
      ],
      live: { 'inv-imp': 'impairment', 'gw-bal': 'goodwill' },
    },
    {
      id: 'C-missing-grade',
      claims: [
        claim('bare', 'Net sales were $10 million', '2026-08-01', ''),
        claim('cee', 'Net sales were $11 million', '2026-08-01', 'C'),
      ],
      winner: 'bare',
    },
    {
      id: 'C-same-day-tie',
      claims: [
        claim('first', 'Net sales were $10 million from the first filing', '2026-08-01'),
        claim('second', 'Net sales were $99 million from the second filing', '2026-08-01'),
      ],
      winner: 'first',
    },
  ];

  const py = pySnapshot(bundles.map((b) => ({ id: b.id, claims: b.claims })));
  if (py.error) {
    errors.push(py.error);
    return errors;
  }
  const pyById = Object.fromEntries((py.bundles || []).map((b) => [b.id, b]));

  for (const bundle of bundles) {
    const pyRow = pyById[bundle.id];
    if (!pyRow) {
      errors.push(`${bundle.id} missing from python`);
      continue;
    }
    const js = jsFull(bundle.claims, rules);
    if (JSON.stringify(js.live) !== JSON.stringify(pyRow.live)) {
      errors.push(`${bundle.id} js/py live mismatch ${JSON.stringify(js.live)} != ${JSON.stringify(pyRow.live)}`);
    }
    if (bundle.winner) {
      const pyWinner = Object.keys(pyRow.live || [])[0] || null;
      if (js.winner !== bundle.winner) errors.push(`${bundle.id} js winner ${js.winner} != ${bundle.winner}`);
      if (pyWinner !== bundle.winner) errors.push(`${bundle.id} py winner ${pyWinner} != ${bundle.winner}`);
    }
    if (bundle.live) {
      for (const [id, mid] of Object.entries(bundle.live)) {
        if (js.live[id] !== mid) errors.push(`${bundle.id} ${id} is ${js.live[id]} != ${mid}`);
      }
    }
    if (bundle.present) {
      for (const id of bundle.present) {
        if (!js.live[id]) errors.push(`${bundle.id} missing ${id}`);
      }
    }
    if (bundle.absent) {
      for (const id of bundle.absent) {
        if (js.live[id]) errors.push(`${bundle.id} kept ${id}`);
      }
    }
  }

  const ask = readFileSync(path.join(ont, 'api/ask.py'), 'utf8').toLowerCase();
  if (ask.includes('what is micron')) errors.push('ask.py still matches what is micron');
  return errors;
}
