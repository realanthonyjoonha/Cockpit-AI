/**
 * Expand paraphrase-spec.json into property cases.
 * ontology/tests and harness-stress/lib/paraphrase_expand.py implement the same steps.
 * Index ids, not slugs, so the two expanders stay identical.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const PARAPHRASE_SPEC_PATH = path.join(HERE, '../fixtures/paraphrase-spec.json');

export function loadParaphraseSpec() {
  return JSON.parse(readFileSync(PARAPHRASE_SPEC_PATH, 'utf8'));
}

function wrapped(wrap, sector, text) {
  return String(wrap).split('{sector}').join(sector).split('{text}').join(text);
}

export function expandParaphrases(spec) {
  const cases = [];
  const sectors = spec.sectors || [];
  const wrap = spec.wrap;
  for (const group of spec.groups || []) {
    (group.positive || []).forEach((text, i) => {
      sectors.forEach((sector, s) => {
        cases.push({
          id: `${group.id}:p:${i}:${s}`,
          kind: 'classify',
          text: wrapped(wrap, sector, text),
          metric: group.metric,
        });
      });
    });
    (group.negative || []).forEach((neg, i) => {
      sectors.forEach((sector, s) => {
        cases.push({
          id: `${group.id}:n:${i}:${s}`,
          kind: 'classify',
          text: wrapped(wrap, sector, neg.text),
          metric: neg.metric ?? null,
        });
      });
    });
  }
  for (const row of spec.review || []) {
    cases.push({ ...row });
    if (!row.across_sectors || row.kind === 'date') continue;
    sectors.forEach((sector, s) => {
      const copy = { ...row, id: `${row.id}:${s}` };
      delete copy.across_sectors;
      if (row.kind === 'classify' || row.kind === 'amounts' || row.kind === 'concept') {
        copy.text = wrapped(wrap, sector, row.text);
      } else if (row.kind === 'risk') {
        copy.name = wrapped(wrap, sector, row.name);
      } else if (row.kind === 'live') {
        copy.claims = (row.claims || []).map((claim) => ({
          ...claim,
          text: wrapped(wrap, sector, claim.text),
        }));
      }
      cases.push(copy);
    });
  }
  return cases;
}

function close(a, b) {
  const x = Number(a);
  const y = Number(b);
  return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));
}

function sameAmount(got, exp) {
  return got.unit === exp.unit
    && (got.currency || null) === (exp.currency || null)
    && (got.scale || null) === (exp.scale || null)
    && close(got.value, exp.value);
}

function liveMap(rows) {
  return Object.fromEntries(rows.map((c) => [c.id, c.metric_id]));
}

export function expectedCaseCount(spec) {
  const sectors = (spec.sectors || []).length;
  let n = 0;
  for (const group of spec.groups || []) {
    n += ((group.positive || []).length + (group.negative || []).length) * sectors;
  }
  for (const row of spec.review || []) {
    n += 1;
    if (row.across_sectors && row.kind !== 'date') n += sectors;
  }
  return n;
}

export function checkParaphrases(cases, api, spec) {
  const errors = [];
  const covered = new Set((spec.groups || []).map((g) => g.metric));
  for (const rule of (api.rules && api.rules.metrics) || []) {
    if (!covered.has(rule.id)) errors.push(`metric ${rule.id} has no paraphrase group`);
  }
  for (const group of spec.groups || []) {
    if (!(group.positive || []).length) errors.push(`${group.id} has no positive paraphrase`);
    if (!(group.negative || []).length) errors.push(`${group.id} has no negation`);
  }
  if (cases.length !== expectedCaseCount(spec)) {
    errors.push(`case count ${cases.length} != ${expectedCaseCount(spec)}`);
  }
  const texts = new Set();
  const names = new Set();
  for (const row of cases) {
    if (row.text) texts.add(row.text);
    if (row.name) names.add(row.name);
    for (const claim of row.claims || []) {
      if (claim.text) texts.add(claim.text);
    }
  }
  for (const sentence of spec.must_include || []) {
    if (!texts.has(sentence) && !names.has(sentence)) errors.push(`missing review sentence: ${sentence}`);
  }
  let passed = 0;
  for (const row of cases) {
    const err = checkOne(row, api);
    if (err) errors.push(`${row.id}: ${err}`);
    else passed += 1;
  }
  return { errors, passed, total: cases.length, failed: cases.length - passed };
}

function checkOne(row, api) {
  if (row.kind === 'classify' || (row.kind === 'amounts' && Object.prototype.hasOwnProperty.call(row, 'metric'))) {
    const got = api.classifyMetric(row.text, api.rules);
    if (row.kind === 'classify' && got !== row.metric) return `classify ${got} != ${row.metric}`;
    if (row.kind === 'amounts' && got !== row.metric) return `classify ${got} != ${row.metric}`;
  }
  if (row.kind === 'amounts') {
    const got = api.parseAmounts(row.text);
    const exp = row.amounts || [];
    if (got.length !== exp.length) return `amounts ${got.length} != ${exp.length} ${JSON.stringify(got)}`;
    for (let i = 0; i < exp.length; i += 1) {
      if (!sameAmount(got[i], exp[i])) return `amount ${JSON.stringify(got[i])} != ${JSON.stringify(exp[i])}`;
    }
  }
  if (row.kind === 'risk') {
    const got = api.riskMetric(row.name, api.rules);
    if (got !== row.metric) return `risk ${got} != ${row.metric}`;
  }
  if (row.kind === 'concept') {
    const got = api.classifyClaim({ concept: row.concept, text: row.text }, api.rules);
    if (got.metric_id !== row.metric) return `concept ${got.metric_id} != ${row.metric}`;
  }
  if (row.kind === 'live') {
    const live = api.liveClaims(row.claims, api.rules);
    const got = liveMap(live);
    const exp = row.live || {};
    const gk = Object.keys(got).sort();
    const ek = Object.keys(exp).sort();
    if (gk.join('|') !== ek.join('|') || ek.some((k) => got[k] !== exp[k])) {
      return `live ${JSON.stringify(got)} != ${JSON.stringify(exp)}`;
    }
    for (const id of row.absent || []) {
      if (got[id]) return `absent ${id} is live`;
    }
    if (row.winner && live[0]?.id !== row.winner) return `winner ${live[0]?.id} != ${row.winner}`;
  }
  if (row.kind === 'date') {
    const parsed = api.parseAsOf(row.text);
    if (parsed.sort_key !== row.sort_key || parsed.precision !== row.precision) {
      return `date ${parsed.sort_key}/${parsed.precision} != ${row.sort_key}/${row.precision}`;
    }
  }
  return null;
}
