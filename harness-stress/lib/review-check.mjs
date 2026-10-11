/**
 * Review-comment sentences and held-out wording against tagged XBRL slots.
 * A sentence either leaves every live slot alone or, when a tagged fact exists,
 * the tagged value stays live. Python mirrors this in ontology/tests/test_xbrl_facts.py.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, '../fixtures');
export const REVIEW_PATH = path.join(FIXTURES, 'review-sentences.json');
export const EXPECTED_PATH = path.join(FIXTURES, 'xbrl/expected.json');
export const FACT_SETS = { 'us-gaap': 'xbrl/industrial.htm', 'ifrs-full': 'xbrl/fpi.htm' };

export function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`;
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${stable(value[k])}`).join(',')}}`;
  }
  return JSON.stringify(value === undefined ? null : value);
}

export function loadReview() {
  return JSON.parse(readFileSync(REVIEW_PATH, 'utf8'));
}

export function loadExpected() {
  return JSON.parse(readFileSync(EXPECTED_PATH, 'utf8'));
}

export function factsFor(api, rel) {
  const text = readFileSync(path.join(FIXTURES, rel), 'utf8');
  return api.parseXbrlFacts(text, { sourceId: path.basename(rel) });
}

export function runLive(api, claims, facts) {
  const gaps = [];
  const context = [];
  const live = api.liveClaims(claims, api.rules, 8, gaps, { facts: facts || [], contextOut: context });
  return { live, gaps, context };
}

/** Same shape as parity_live.py `tagged`. */
export function taggedSnapshot(api, claims, facts) {
  const slots = api.taggedSlots(facts || []);
  const { live, gaps, context } = runLive(api, claims, facts);
  return {
    slots: Object.fromEntries(Object.entries(slots).map(([mid, s]) => [mid, {
      id: s.id,
      value_text: s.value_text,
      prior: s.prior ? s.prior.value_text : null,
    }])),
    live: live.map((c) => [c.id, c.metric_id, c.confidence || null]),
    gaps,
    context: context.map((c) => [c.id, c.metric_id, c.reason]),
  };
}

function claim(id, text, asOf) {
  return { id, text, as_of: asOf, grade: 'A', source_id: 'review' };
}

function slotProperties(api, tag, claims, facts) {
  const errors = [];
  const slots = api.taggedSlots(facts || []);
  const { live } = runLive(api, claims, facts);
  const byMetric = {};
  for (const row of live) {
    if (row.metric_id === 'other') continue;
    if (byMetric[row.metric_id]) errors.push(`${tag} two live rows for ${row.metric_id}`);
    byMetric[row.metric_id] = row;
  }
  for (const [mid, slot] of Object.entries(slots)) {
    const row = byMetric[mid];
    if (!row || row.id !== slot.id || row.value_text !== slot.value_text || row.confidence !== 'tagged') {
      errors.push(`${tag} tagged ${mid} replaced by ${row ? `${row.id} (${row.confidence})` : 'nothing'}`);
    }
  }
  for (const row of Object.values(byMetric)) {
    if (row.origin === 'xbrl') continue;
    if (slots[row.metric_id]) errors.push(`${tag} sentence ${row.id} took tagged ${row.metric_id}`);
    if (row.confidence !== 'low') errors.push(`${tag} sentence ${row.id} confidence ${row.confidence}`);
    if (!api.sentenceHasAmount(row.metric_id, row.text || '')) {
      errors.push(`${tag} sentence ${row.id} took ${row.metric_id} without an amount`);
    }
  }
  return errors;
}

export function checkReview(api) {
  const errors = [];
  const review = loadReview();
  const expected = loadExpected();
  const asOf = review.as_of;
  const factSets = Object.fromEntries(Object.entries(FACT_SETS).map(([tax, rel]) => [tax, factsFor(api, rel).facts]));
  const rows = [...(review.sentences || []), ...(review.held_out || [])];
  if ((review.sentences || []).length === 0 || (review.held_out || []).length === 0) {
    errors.push('review fixture is empty');
  }
  const all = rows.map((s) => claim(s.id, s.text, asOf));
  for (const [tax, facts] of Object.entries(factSets)) {
    for (const c of all) errors.push(...slotProperties(api, `${tax}/${c.id}`, [c], facts));
    errors.push(...slotProperties(api, `${tax}/all`, all, facts));
  }
  for (const c of all) errors.push(...slotProperties(api, `untagged/${c.id}`, [c], []));
  errors.push(...slotProperties(api, 'untagged/all', all, []));

  const issuerFor = { 'us-gaap': 'industrial', 'ifrs-full': 'fpi' };
  for (const pair of review.pairs || []) {
    const tax = pair.taxonomy || 'us-gaap';
    const claims = [claim('older', pair.older.text, pair.older.as_of), claim('newer', pair.newer.text, pair.newer.as_of)];
    const want = (expected[issuerFor[tax]]?.slots || {})[pair.metric_id];
    if (!want) {
      errors.push(`pair ${pair.id} has no tagged ${pair.metric_id} in ${issuerFor[tax]}`);
      continue;
    }
    const tagged = runLive(api, claims, factSets[tax]).live.find((c) => c.metric_id === pair.metric_id);
    if (!tagged || tagged.origin !== 'xbrl' || tagged.value_text !== want.value_text || tagged.concept !== want.concept) {
      errors.push(`pair ${pair.id} tagged ${pair.metric_id} is ${tagged ? `${tagged.id}=${tagged.value_text}` : 'missing'}`);
    }
    const bare = runLive(api, claims, []).live.find((c) => c.metric_id === pair.metric_id);
    if (pair.sentence_only && bare?.id !== pair.sentence_only) {
      errors.push(`pair ${pair.id} sentence-only winner ${bare?.id || null} != ${pair.sentence_only}`);
    }
    if (bare && bare.confidence !== 'low') errors.push(`pair ${pair.id} sentence-only confidence ${bare.confidence}`);
  }
  return { errors, sentences: all.length, pairs: (review.pairs || []).length };
}

export function checkTaggedSectors(fixture, api) {
  const errors = [];
  const expected = loadExpected();
  for (const issuer of fixture.issuers || []) {
    if (!issuer.xbrl) {
      errors.push(`${issuer.id} has no xbrl fixture`);
      continue;
    }
    const facts = factsFor(api, issuer.xbrl).facts;
    const slots = api.taggedSlots(facts);
    const want = (expected[issuer.id] || {}).slots || {};
    const got = Object.fromEntries(Object.entries(slots).map(([mid, s]) => [mid, {
      concept: s.concept,
      end: s.period.end,
      value_text: s.value_text,
      prior_value_text: s.prior ? s.prior.value_text : null,
    }]));
    if (stable(got) !== stable(want)) errors.push(`${issuer.id} tagged slots ${stable(got)} != ${stable(want)}`);
    const { live, gaps, context } = runLive(api, issuer.claims || [], facts);
    const t = issuer.tagged || {};
    const liveRows = live.map((c) => ({ id: c.id, metric_id: c.metric_id, confidence: c.confidence || null }));
    if (stable(liveRows) !== stable(t.live || [])) errors.push(`${issuer.id} tagged live drift ${stable(liveRows)}`);
    if (stable(gaps) !== stable(t.gaps || [])) errors.push(`${issuer.id} tagged gaps ${stable(gaps)}`);
    const ctxRows = context.map((c) => ({ id: c.id, metric_id: c.metric_id, reason: c.reason }));
    if (stable(ctxRows) !== stable(t.context || [])) errors.push(`${issuer.id} tagged context ${stable(ctxRows)}`);
    errors.push(...slotProperties(api, `${issuer.id}/tagged`, issuer.claims || [], facts));
    errors.push(...slotProperties(api, `${issuer.id}/sentence-only`, issuer.claims || [], []));
  }
  return errors;
}
