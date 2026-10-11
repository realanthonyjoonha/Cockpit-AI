/**
 * Review-comment sentences against companyfacts slots.
 * A sentence never changes a structured numeric slot, including an empty one.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, '../fixtures');
export const REVIEW_PATH = path.join(FIXTURES, 'review-sentences.json');
export const CF_DIR = path.join(FIXTURES, 'companyfacts');
export const FACT_SETS = { 'us-gaap': 'industrial', 'ifrs-full': 'fpi' };

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

export function loadExpected(id) {
  return JSON.parse(readFileSync(path.join(CF_DIR, id, 'expected.json'), 'utf8'));
}

export function factsFor(api, id) {
  const text = readFileSync(path.join(CF_DIR, id, 'companyfacts.json'), 'utf8');
  return api.parseCompanyfacts(JSON.parse(text), { sourceId: `companyfacts/${id}` });
}

export function runLive(api, claims, facts) {
  const gaps = [];
  const context = [];
  const live = api.liveClaims(claims, api.rules, 8, gaps, { facts: facts || [], contextOut: context });
  return { live, gaps, context };
}

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
    if (row.origin === 'companyfacts' || row.origin === 'xbrl') continue;
    if (slots[row.metric_id]) errors.push(`${tag} sentence ${row.id} took tagged ${row.metric_id}`);
    if (api.structuredMetric && api.structuredMetric(row.metric_id)) {
      errors.push(`${tag} sentence ${row.id} filled structured ${row.metric_id}`);
    }
  }
  return errors;
}

export function checkReview(api) {
  const errors = [];
  const review = loadReview();
  const asOf = review.as_of;
  const factSets = Object.fromEntries(Object.entries(FACT_SETS).map(([tax, id]) => [tax, factsFor(api, id).facts]));
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
    const factsId = pair.companyfacts || issuerFor[tax];
    const want = (loadExpected(factsId).slots || {})[pair.metric_id];
    if (!want) {
      errors.push(`pair ${pair.id} has no tagged ${pair.metric_id} in ${factsId}`);
      continue;
    }
    const pairFacts = pair.companyfacts ? factsFor(api, pair.companyfacts).facts : factSets[tax];
    const tagged = runLive(api, claims, pairFacts).live.find((c) => c.metric_id === pair.metric_id);
    if (!tagged || (tagged.origin !== 'companyfacts' && tagged.origin !== 'xbrl') || tagged.value_text !== want.value_text || tagged.concept !== want.concept) {
      errors.push(`pair ${pair.id} tagged ${pair.metric_id} is ${tagged ? `${tagged.id}=${tagged.value_text}` : 'missing'}`);
    }
    const bare = runLive(api, claims, []).live.find((c) => c.metric_id === pair.metric_id);
    if (bare) errors.push(`pair ${pair.id} sentence filled ${bare.id}`);
  }
  return { errors, sentences: all.length, pairs: (review.pairs || []).length };
}

export function checkTaggedSectors(fixture, api) {
  const errors = [];
  for (const issuer of fixture.issuers || []) {
    const id = issuer.companyfacts || issuer.id;
    let parsed;
    try {
      parsed = factsFor(api, id);
    } catch (err) {
      errors.push(`${issuer.id} companyfacts missing: ${err.message}`);
      continue;
    }
    const slots = api.taggedSlots(parsed.facts);
    const want = (loadExpected(id).slots || {});
    for (const [mid, exp] of Object.entries(want)) {
      const got = slots[mid];
      if (!got || got.value_text !== exp.value_text || got.concept !== exp.concept || got.period.end !== exp.end) {
        errors.push(`${issuer.id} slot ${mid} ${got ? got.value_text : 'missing'} != ${exp.value_text}`);
      }
    }
    errors.push(...slotProperties(api, `${issuer.id}/tagged`, issuer.claims || [], parsed.facts));
    errors.push(...slotProperties(api, `${issuer.id}/sentence-only`, issuer.claims || [], []));
  }
  return errors;
}

export function checkReviewerCases(api) {
  const errors = [];
  const claimRow = (id, text, asOf) => ({ id, text, as_of: asOf, grade: 'A', source_id: 'review' });

  const rest = factsFor(api, 'restate');
  const slot = api.taggedSlots(rest.facts).company_revenue;
  if (slot?.value_text !== '29520000000' || slot?.prior?.value_text !== '30871000000') {
    errors.push(`restate ${slot?.value_text} prior ${slot?.prior?.value_text}`);
  }

  const q = factsFor(api, 'qtd');
  const qslot = api.taggedSlots(q.facts).company_revenue;
  if (qslot?.value_text !== '26539000000' || qslot?.ytd?.value_text !== '51982000000') {
    errors.push(`qtd ${qslot?.value_text} ytd ${qslot?.ytd?.value_text}`);
  }

  const gaps = [];
  const live = api.liveClaims([
    claimRow('total', 'Total revenues were $48.2 billion.', '2025-12-31'),
    claimRow('svc', 'Service revenue was $2.2 billion.', '2026-02-20'),
  ], api.rules, 8, gaps);
  if (live.some((c) => c.metric_id === 'company_revenue')) errors.push('service revenue filled company_revenue');
  if (!gaps.includes('company_revenue: not reported in structured data')) errors.push(`headline gap ${JSON.stringify(gaps)}`);

  const gw = api.liveClaims([
    claimRow('bal', 'Goodwill was $4.1 billion.', '2025-12-31'),
    claimRow('imp', 'Goodwill related to the 2019 acquisition was impaired by $75 million.', '2026-01-20'),
  ], api.rules);
  if (gw.some((c) => c.metric_id === 'goodwill' || c.metric_id === 'goodwill_impairment')) {
    errors.push('impaired-by filled goodwill');
  }

  const synthetic = {
    cik: 1,
    entityName: 'Fixture',
    facts: {
      'us-gaap': {
        Revenues: {
          units: {
            USD: [
              { start: '2025-07-01', end: '2025-09-30', val: 2200000000, accn: '0000000001-25-000002', fy: 2025, fp: 'Q3', form: '10-Q', filed: '2025-11-01' },
              { start: '2025-01-01', end: '2025-09-30', val: 9100000000, accn: '0000000001-25-000002', fy: 2025, fp: 'Q3', form: '10-Q', filed: '2025-11-01' },
            ],
          },
        },
      },
    },
  };
  const syn = api.parseCompanyfacts(synthetic).facts;
  const synSlot = api.taggedSlots(syn).company_revenue;
  if (synSlot?.value_text !== '2200000000' || synSlot?.ytd?.value_text !== '9100000000') {
    errors.push(`synthetic 10-Q ${synSlot?.value_text} ytd ${synSlot?.ytd?.value_text}`);
  }

  const oldP = api.taggedSlots(factsFor(api, 'old-primary').facts).company_revenue;
  if (oldP?.value_text !== '250000000' || oldP?.concept !== 'us-gaap:PremiumsEarnedNet') {
    errors.push(`old-primary hid current fallback ${oldP?.concept}=${oldP?.value_text}`);
  }
  const q111 = api.taggedSlots(factsFor(api, 'q111').facts).company_revenue;
  const q111r = api.taggedSlots(factsFor(api, 'q111-rev').facts).company_revenue;
  if (q111?.value_text !== '111000000' || q111?.ytd?.value_text !== '333000000') {
    errors.push(`q111 ${q111?.value_text} ytd ${q111?.ytd?.value_text}`);
  }
  if (q111r?.value_text !== q111?.value_text || q111r?.ytd?.value_text !== q111?.ytd?.value_text) {
    errors.push('q111 array order changed the slot');
  }
  const pref = api.taggedSlots(factsFor(api, 'concept-priority').facts).company_revenue;
  if (pref?.value_text !== '1000000000' || pref?.concept !== 'us-gaap:Revenues') {
    errors.push(`concept-priority ${pref?.concept}=${pref?.value_text}`);
  }

  const sixk = api.taggedSlots(factsFor(api, 'sixk-q').facts).company_revenue;
  if (sixk?.value_text !== '90000000' || sixk?.ytd?.value_text !== '190000000' || sixk?.form !== '6-K') {
    errors.push(`sixk-q ${sixk?.value_text} ytd ${sixk?.ytd?.value_text} form ${sixk?.form}`);
  }
  const tenkt = api.taggedSlots(factsFor(api, 'tenkt').facts).company_revenue;
  if (tenkt?.value_text !== '440000000' || tenkt?.form !== '10-KT') {
    errors.push(`tenkt ${tenkt?.value_text} form ${tenkt?.form}`);
  }
  const sixkNo = api.taggedSlots(factsFor(api, 'sixk-nofp').facts).company_revenue;
  if (sixkNo?.value_text !== '80000000' || sixkNo?.ytd?.value_text !== '170000000') {
    errors.push(`sixk-nofp ${sixkNo?.value_text} ytd ${sixkNo?.ytd?.value_text}`);
  }
  const tenktQ = api.taggedSlots(factsFor(api, 'tenkt-q').facts).company_revenue;
  if (tenktQ?.value_text !== '440000000' || tenktQ?.form !== '10-KT' || tenktQ?.ytd) {
    errors.push(`tenkt-q ${tenktQ?.value_text} form ${tenktQ?.form} ytd ${tenktQ?.ytd?.value_text}`);
  }
  const kq4 = api.taggedSlots(factsFor(api, 'k-vs-q4').facts).company_revenue;
  if (kq4?.value_text !== '1000000000' || kq4?.form !== '10-K' || kq4?.ytd) {
    errors.push(`k-vs-q4 ${kq4?.value_text} form ${kq4?.form}`);
  }
  const pytd = api.taggedSlots(factsFor(api, 'primary-ytd').facts).company_revenue;
  if (pytd?.value_text !== '500000000' || pytd?.concept !== 'us-gaap:Revenues') {
    errors.push(`primary-ytd ${pytd?.concept}=${pytd?.value_text}`);
  }
  const span = api.taggedSlots(factsFor(api, 'span-tie').facts).company_revenue;
  const spanR = api.taggedSlots(factsFor(api, 'span-tie-rev').facts).company_revenue;
  if (span?.value_text !== '200000000' || spanR?.value_text !== span?.value_text) {
    errors.push(`span-tie ${span?.value_text} rev ${spanR?.value_text}`);
  }
  const tot = api.taggedSlots(factsFor(api, 'true-total').facts).company_revenue;
  if (tot?.value_text !== '182447000000' || tot?.concept !== 'us-gaap:Revenues') {
    errors.push(`true-total ${tot?.concept}=${tot?.value_text}`);
  }
  const staleFacts = factsFor(api, 'stale-slot').facts;
  const staleSlots = api.taggedSlots(staleFacts);
  if (staleSlots.total_debt) errors.push(`stale-slot filled total_debt ${staleSlots.total_debt?.value_text}`);
  const staleGaps = api.headlineGaps ? api.headlineGaps(staleSlots, null, staleFacts) : [];
  if (!staleGaps.some((g) => g.includes('stale: last reported 2014-06-30'))) {
    errors.push(`stale-slot gap ${JSON.stringify(staleGaps)}`);
  }
  const bank = api.taggedSlots(factsFor(api, 'bank').facts);
  if (bank.company_revenue?.value_text !== '182447000000' || bank.company_revenue?.concept !== 'us-gaap:Revenues') {
    errors.push(`bank revenue ${bank.company_revenue?.concept}=${bank.company_revenue?.value_text}`);
  }
  if (bank.total_debt || bank.interest_revenue) {
    errors.push(`bank stale slots still filled debt=${bank.total_debt?.value_text} int=${bank.interest_revenue?.value_text}`);
  }

  return errors;
}

export function checkCompanyfactsExact(api) {
  const errors = [];
  const index = JSON.parse(readFileSync(path.join(CF_DIR, 'index.json'), 'utf8'));
  if ((index.issuers || []).length < 12) errors.push(`companyfacts issuers ${index.issuers?.length}`);
  for (const need of [
    'old-primary', 'q111', 'q111-rev', 'concept-priority',
    'sixk-q', 'tenkt', 'sixk-nofp', 'tenkt-q', 'k-vs-q4',
    'primary-ytd', 'span-tie', 'span-tie-rev', 'true-total', 'stale-slot',
  ]) {
    if (!(index.issuers || []).some((row) => row.id === need)) errors.push(`missing reviewer fixture ${need}`);
  }
  for (const row of index.issuers || []) {
    const parsed = factsFor(api, row.id);
    const slots = api.taggedSlots(parsed.facts);
    const expected = loadExpected(row.id);
    for (const [mid, want] of Object.entries(expected.slots || {})) {
      const got = slots[mid];
      const ytd = got?.ytd ? got.ytd.value_text : null;
      const wantYtd = want.ytd ? want.ytd.value_text : null;
      if (!got
        || got.value_text !== want.value_text
        || got.concept !== want.concept
        || got.period.end !== want.end
        || got.unit !== want.unit
        || got.form !== want.form
        || got.filed !== want.filed
        || ytd !== wantYtd) {
        errors.push(`${row.id} ${mid} ${got ? got.value_text : 'missing'} != ${want.value_text}`);
      }
    }
    for (const mid of expected.empty || []) {
      if (slots[mid]) errors.push(`${row.id} ${mid} should be empty`);
    }
    if (api.headlineGaps && (expected.gaps_contain || []).length) {
      const gaps = api.headlineGaps(slots, null, parsed.facts);
      for (const msg of expected.gaps_contain) {
        if (!gaps.includes(msg)) errors.push(`${row.id} missing gap ${msg}`);
      }
    }
  }
  return errors;
}
