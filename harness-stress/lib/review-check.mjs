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
    if (!pair.sentence_only) {
      if (bare) errors.push(`pair ${pair.id} sentence-only filled ${bare.id}`);
    } else if (bare?.id !== pair.sentence_only) {
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

function ixDoc(contexts, body) {
  return `<?xml version="1.0"?><html xmlns:ix="http://www.xbrl.org/2013/inlineXBRL" xmlns:xbrli="http://www.xbrl.org/2003/instance" xmlns:xbrldi="http://xbrl.org/2006/xbrldi" xmlns:iso4217="http://www.xbrl.org/2003/iso4217" xmlns:us-gaap="http://fasb.org/us-gaap/2024" xmlns:srt="http://fasb.org/srt/2024" xmlns:fix="http://example.com/fixture/2025" xmlns:dei="http://xbrl.sec.gov/dei/2024" xmlns:ixt="http://www.xbrl.org/inlineXBRL/transformation/2020-02-12" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><body><ix:header><ix:resources>${contexts}<xbrli:unit id="usd"><xbrli:measure>iso4217:USD</xbrli:measure></xbrli:unit></ix:resources></ix:header>${body}</body></html>`;
}

function ixCtx(id, start, end, seg = '') {
  const period = start
    ? `<xbrli:startDate>${start}</xbrli:startDate><xbrli:endDate>${end}</xbrli:endDate>`
    : `<xbrli:instant>${end}</xbrli:instant>`;
  return `<xbrli:context id="${id}"><xbrli:entity><xbrli:identifier scheme="http://www.sec.gov/CIK">0000900099</xbrli:identifier>${seg}</xbrli:entity><xbrli:period>${period}</xbrli:period></xbrli:context>`;
}

function ixFact(name, context, text, extra = '') {
  return `<ix:nonFraction name="${name}" contextRef="${context}" unitRef="usd"${extra}>${text}</ix:nonFraction>`;
}

export function checkReviewerCases(api) {
  const errors = [];
  const claim = (id, text, asOf) => ({ id, text, as_of: asOf, grade: 'A', source_id: 'review' });
  const fy = ixCtx('FY25', '2025-01-01', '2025-12-31') + ixCtx('FY24', '2024-01-01', '2024-12-31') + ixCtx('I25', null, '2025-12-31');

  const sameCtx = api.parseXbrlFacts(ixDoc(fy, ixFact('us-gaap:Revenues', 'FY25', '10,000', ' scale="6" format="ixt:num-dot-decimal"') + ixFact('us-gaap:Revenues', 'FY25', '14,000', ' scale="6" format="ixt:num-dot-decimal"')));
  const sameSlot = api.taggedSlots(sameCtx.facts).company_revenue;
  if (sameSlot?.value_text !== '10000000000') errors.push(`same-context restatement ${sameSlot?.value_text}`);
  if (!sameCtx.notes.some((n) => /duplicate facts/.test(n))) errors.push('same-context missing duplicate note');

  const orig = api.parseXbrlFacts(`<FILING-DATE>2026-02-01</FILING-DATE><ACCESSION-NUMBER>0000900001-26-000001</ACCESSION-NUMBER>${ixDoc(fy, ixFact('us-gaap:Revenues', 'FY25', '10,000', ' scale="6" format="ixt:num-dot-decimal"'))}`, { sourceId: '10k.htm' });
  const amend = api.parseXbrlFacts(`<FILING-DATE>2026-03-15</FILING-DATE><ACCESSION-NUMBER>0000900001-26-000010</ACCESSION-NUMBER><ix:nonNumeric name="dei:DocumentType" contextRef="FY25">10-K/A</ix:nonNumeric>${ixDoc(fy, ixFact('us-gaap:Revenues', 'FY25', '14,200', ' scale="6" format="ixt:num-dot-decimal"'))}`, { sourceId: '10ka.htm', orderBase: 50 });
  const rest = api.taggedSlots([...orig.facts, ...amend.facts]).company_revenue;
  if (rest?.value_text !== '14200000000' || rest.filed !== '2026-03-15' || rest.accession !== '0000900001-26-000010' || !rest.prior?.restated || rest.prior.value_text !== '10000000000') {
    errors.push(`later-filed restatement ${JSON.stringify(rest && { v: rest.value_text, filed: rest.filed, acc: rest.accession, prior: rest.prior })}`);
  }

  const restCtx = api.parseXbrlFacts(ixDoc(fy + ixCtx('FY25_Restated', '2025-01-01', '2025-12-31'), ixFact('us-gaap:Revenues', 'FY25', '10,000', ' scale="6" format="ixt:num-dot-decimal"') + ixFact('us-gaap:Revenues', 'FY25_Restated', '14,200', ' scale="6" format="ixt:num-dot-decimal"')));
  if (api.taggedSlots(restCtx.facts).company_revenue?.value_text !== '14200000000') errors.push('restated context id lost');

  const laterOrder = api.taggedSlots(api.parseXbrlFacts(ixDoc(fy + ixCtx('FY25b', '2025-01-01', '2025-12-31'), ixFact('us-gaap:Revenues', 'FY25', '10,000', ' scale="6" format="ixt:num-dot-decimal"') + ixFact('us-gaap:Revenues', 'FY25b', '14,200', ' scale="6" format="ixt:num-dot-decimal"'))).facts).company_revenue;
  if (laterOrder?.value_text !== '14200000000' || laterOrder.prior?.value_text !== '10000000000') errors.push('same-file later context');

  const byName = api.taggedSlots([
    ...api.parseXbrlFacts(ixDoc(fy, ixFact('us-gaap:Revenues', 'FY25', '10,000', ' scale="6" format="ixt:num-dot-decimal"')), { sourceId: '10k.htm' }).facts,
    ...api.parseXbrlFacts(ixDoc(fy, ixFact('us-gaap:Revenues', 'FY25', '14,200', ' scale="6" format="ixt:num-dot-decimal"')), { sourceId: '10ka.htm', orderBase: 50 }).facts,
  ]).company_revenue;
  if (byName?.value_text !== '14200000000' || byName.source_id !== '10ka.htm' || !byName.prior?.restated) errors.push('10ka filename restatement');

  const laterEnd = api.taggedSlots(api.parseXbrlFacts(ixDoc(fy, ixFact('us-gaap:Revenues', 'FY24', '10,000', ' scale="6" format="ixt:num-dot-decimal"') + ixFact('us-gaap:Revenues', 'FY25', '15,000', ' scale="6" format="ixt:num-dot-decimal"'))).facts).company_revenue;
  if (laterEnd?.value_text !== '15000000000' || laterEnd.prior?.value_text !== '10000000000' || laterEnd.prior?.restated) errors.push('later period end');

  const gaps = [];
  const context = [];
  const live = api.liveClaims([
    claim('total', 'Total revenues were $48.2 billion.', '2025-12-31'),
    claim('svc', 'Service revenue was $2.2 billion.', '2026-02-20'),
  ], api.rules, 8, gaps, { contextOut: context });
  if (live.some((c) => c.metric_id === 'company_revenue')) errors.push('service revenue filled company_revenue');
  if (!gaps.includes('company_revenue: no tagged fact; 2 candidate sentences in context')) errors.push(`headline gap ${JSON.stringify(gaps)}`);

  const gw = api.liveClaims([
    claim('bal', 'Goodwill was $4.1 billion.', '2025-12-31'),
    claim('imp', 'Goodwill related to the 2019 acquisition was impaired by $75 million.', '2026-01-20'),
  ], api.rules);
  if (gw.some((c) => c.metric_id === 'goodwill' || c.metric_id === 'goodwill_impairment')) errors.push('impaired-by filled goodwill');

  const lowSeg = '<xbrli:segment><xbrldi:explicitmember dimension="srt:ProductOrServiceAxis">fix:ServiceMember</xbrldi:explicitmember></xbrli:segment>';
  const low = api.parseXbrlFacts(ixDoc(fy + ixCtx('FY25low', '2025-01-01', '2025-12-31', lowSeg), ixFact('us-gaap:OperatingIncomeLoss', 'FY25low', '7,000', ' scale="6" format="ixt:num-dot-decimal"') + ixFact('us-gaap:OperatingIncomeLoss', 'FY25', '11,000', ' scale="6" format="ixt:num-dot-decimal"')));
  if (!low.facts.find((f) => f.context_id === 'FY25low')?.dimensional) errors.push('lowercase member not dimensional');
  if (api.taggedSlots(low.facts).operating_income?.value_text !== '11000000000') errors.push('lowercase member beat consolidated');

  const pascalSeg = '<xbrli:segment><xbrldi:ExplicitMember dimension="srt:ProductOrServiceAxis">fix:NorthMember</xbrldi:ExplicitMember></xbrli:segment>';
  const pascal = api.parseXbrlFacts(ixDoc(ixCtx('FY25P', '2025-01-01', '2025-12-31', pascalSeg), ixFact('us-gaap:NetIncomeLoss', 'FY25P', '4,000', ' scale="6" format="ixt:num-dot-decimal"')));
  if (api.taggedSlots(pascal.facts).net_income) errors.push('PascalCase member filled net_income');

  const dup = api.parseXbrlFacts(ixDoc(
    ixCtx('cDup', '2025-01-01', '2025-12-31', lowSeg) + ixCtx('cDup', '2025-01-01', '2025-12-31'),
    ixFact('us-gaap:Revenues', 'cDup', '777', ' scale="6" format="ixt:num-dot-decimal"'),
  ));
  if (!dup.facts[0]?.dimensional || !dup.notes.some((n) => /duplicate context/.test(n))) errors.push('duplicate context id');
  if (api.taggedSlots(dup.facts).company_revenue) errors.push('dup context became consolidated');

  const q = api.parseXbrlFacts(ixDoc(
    ixCtx('Q3', '2025-07-01', '2025-09-30') + ixCtx('YTD', '2025-01-01', '2025-09-30'),
    ixFact('us-gaap:Revenues', 'Q3', '2,200', ' scale="6" format="ixt:num-dot-decimal"')
    + ixFact('us-gaap:SalesRevenueNet', 'Q3', '2,100', ' scale="6" format="ixt:num-dot-decimal"')
    + ixFact('us-gaap:Revenues', 'YTD', '9,100', ' scale="6" format="ixt:num-dot-decimal"'),
  ));
  const qslot = api.taggedSlots(q.facts).company_revenue;
  if (qslot?.value_text !== '2200000000' || qslot?.ytd?.value_text !== '9100000000') errors.push(`10-Q quarter ${qslot?.value_text} ytd ${qslot?.ytd?.value_text}`);

  const signed = api.parseXbrlFacts(ixDoc(fy,
    ixFact('us-gaap:LongTermDebtNoncurrent', 'I25', '10', ' scale="+6"')
    + ixFact('us-gaap:ResearchAndDevelopmentExpense', 'FY25', '-88', ' scale="6" sign="-"')
    + ixFact('us-gaap:OperatingIncomeLoss', 'FY25', '88', ' scale="6" sign="-"'),
  ));
  const by = Object.fromEntries(signed.facts.map((f) => [f.concept, f.value_text]));
  if (by['us-gaap:LongTermDebtNoncurrent'] !== '10000000') errors.push(`scale +6 ${by['us-gaap:LongTermDebtNoncurrent']}`);
  if (by['us-gaap:ResearchAndDevelopmentExpense'] !== '-88000000') errors.push(`sign+minus ${by['us-gaap:ResearchAndDevelopmentExpense']}`);
  if (by['us-gaap:OperatingIncomeLoss'] !== '-88000000') errors.push(`sign abs ${by['us-gaap:OperatingIncomeLoss']}`);

  return errors;
}
