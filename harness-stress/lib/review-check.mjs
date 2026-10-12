/**
 * Review-comment sentences against companyfacts slots.
 * A sentence never changes a structured numeric slot, including an empty one.
 * V2: properties + constructed documents. No frozen dollars.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  agree,
  latestAccession,
  latestFilingFacts,
  latestFilingSlots,
  mappedFacts,
  mappedLatestFacts,
} from '../../memory-cockpit-v2/server/companyfacts.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const FIXTURES = path.join(HERE, '../fixtures');
export const REVIEW_PATH = path.join(FIXTURES, 'review-sentences.json');
export const CF_DIR = path.join(FIXTURES, 'companyfacts');
export const FACT_SETS = { 'us-gaap': 'industrial', 'ifrs-full': 'fpi' };
export const CONSTRUCTED = ['unique', 'two-periods', 'same-period-disagree', 'none'];

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

export function loadIndex() {
  return JSON.parse(readFileSync(path.join(CF_DIR, 'index.json'), 'utf8'));
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
      value_text: s.value_text ?? null,
      values: (s.values || []).map((v) => ({
        value_text: v.value_text,
        period: v.period,
        accession: v.accession,
        concept: v.concept,
      })),
    }])),
    live: live.map((c) => [c.id, c.metric_id, c.confidence || null]),
    gaps,
    context: context.map((c) => [c.id, c.metric_id, c.reason]),
  };
}

function claim(id, text, asOf) {
  return { id, text, as_of: asOf, grade: 'A', source_id: 'review' };
}

export function slotPropertyErrors(facts, slots) {
  const errors = [];
  const accn = latestAccession(facts);
  for (const [mid, slot] of Object.entries(slots || {})) {
    if (slot.ytd || slot.prior) errors.push(`${mid} has ranking sidecar`);
    const values = slot.values || [];
    if (slot.value_text != null && values.length !== 1) errors.push(`${mid} value_text set with ${values.length} periods`);
    if (slot.value_text == null && values.length === 1) errors.push(`${mid} value_text null with one period`);
    if (slot.accession !== accn) errors.push(`${mid} accession ${slot.accession} != latest ${accn}`);
    for (const val of values) {
      if (val.accession !== accn) errors.push(`${mid} shown period not latest filing`);
      const matches = (facts || []).filter((f) => (
        f.value_text === val.value_text
        && f.unit === val.unit
        && (f.period || {}).start === (val.period || {}).start
        && (f.period || {}).end === (val.period || {}).end
        && f.form === val.form
        && f.filed === val.filed
        && f.accession === val.accession
        && (f.concept === val.concept || (val.tags || []).includes(f.concept))
      ));
      if (!matches.length) errors.push(`${mid} shown value is not a tagged fact`);
      for (const other of matches) {
        if (!agree(val, other)) errors.push(`${mid} invented a value`);
      }
    }
  }
  return errors;
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
    const pairFacts = pair.companyfacts ? factsFor(api, pair.companyfacts).facts : factSets[tax];
    const slot = api.taggedSlots(pairFacts)[pair.metric_id];
    if (!slot) {
      errors.push(`pair ${pair.id} has no tagged ${pair.metric_id} in ${factsId}`);
      continue;
    }
    const tagged = runLive(api, claims, pairFacts).live.find((c) => c.metric_id === pair.metric_id);
    if (!tagged || (tagged.origin !== 'companyfacts' && tagged.origin !== 'xbrl') || tagged.id !== slot.id) {
      errors.push(`pair ${pair.id} tagged ${pair.metric_id} is ${tagged ? tagged.id : 'missing'}`);
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
    errors.push(...slotPropertyErrors(parsed.facts, api.taggedSlots(parsed.facts)).map((e) => `${issuer.id} ${e}`));
    errors.push(...slotProperties(api, `${issuer.id}/tagged`, issuer.claims || [], parsed.facts));
    errors.push(...slotProperties(api, `${issuer.id}/sentence-only`, issuer.claims || [], []));
  }
  return errors;
}

export function checkReviewerCases(api) {
  const errors = [];
  const claimRow = (id, text, asOf) => ({ id, text, as_of: asOf, grade: 'A', source_id: 'review' });

  const unique = latestFilingSlots(factsFor(api, 'unique').facts);
  if ((unique.slots.company_revenue?.values || []).length !== 1 || unique.slots.company_revenue?.value_text == null) {
    errors.push('unique did not fill one labeled period');
  }
  errors.push(...slotPropertyErrors(factsFor(api, 'unique').facts, unique.slots));

  const two = latestFilingSlots(factsFor(api, 'two-periods').facts);
  if ((two.slots.company_revenue?.values || []).length !== 2 || two.slots.company_revenue?.value_text != null) {
    errors.push('two-periods did not show both periods');
  }
  if ((two.gaps || []).some((g) => g.includes('disagreeing tagged facts'))) {
    errors.push('two-periods treated different periods as a conflict');
  }
  errors.push(...slotPropertyErrors(factsFor(api, 'two-periods').facts, two.slots));

  const clash = latestFilingSlots(factsFor(api, 'same-period-disagree').facts);
  if (clash.slots.company_revenue) errors.push('same-period-disagree filled company_revenue');
  const clashText = (clash.gaps || []).join('\n');
  if (!clashText.includes('disagreeing tagged facts') || !clashText.includes('us-gaap:Revenues')) {
    errors.push(`same-period-disagree gap ${JSON.stringify(clash.gaps)}`);
  }

  const none = latestFilingSlots(factsFor(api, 'none').facts);
  const accn = latestAccession(factsFor(api, 'none').facts);
  if (none.slots.company_revenue) errors.push('none filled company_revenue');
  if (!(none.gaps || []).includes(`company_revenue: not reported in latest filing ${accn}`)) {
    errors.push(`none gap ${JSON.stringify(none.gaps)}`);
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

  return errors;
}

export function checkCompanyfactsExact(api) {
  const errors = [];
  const index = loadIndex();
  for (const need of CONSTRUCTED) {
    if (!(index.issuers || []).some((row) => row.id === need)) errors.push(`missing constructed fixture ${need}`);
  }
  const dirs = readdirSync(CF_DIR, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
  for (const id of dirs) {
    if (!existsCompanyfacts(id)) continue;
    const parsed = factsFor(api, id);
    const { slots, gaps } = latestFilingSlots(parsed.facts);
    errors.push(...slotPropertyErrors(parsed.facts, slots).map((e) => `${id} ${e}`));
    if (api.headlineGaps) {
      const fromApi = api.headlineGaps(slots, null, parsed.facts);
      if (stable(fromApi) !== stable(gaps)) errors.push(`${id} headlineGaps drifted from latestFilingSlots`);
    }
  }
  return errors;
}

/** Later 10-Q/A tags only Assets; older 10-Q tags Revenues. Values stay local. */
export function amendmentAssetsOnlyDoc() {
  const older = '0000000099-25-000010';
  const later = '0000000099-25-000020';
  return {
    older,
    later,
    doc: {
      cik: 99,
      entityName: 'Constructed Amendment Assets Only',
      facts: {
        'us-gaap': {
          Revenues: {
            units: {
              USD: [{
                start: '2025-01-01',
                end: '2025-03-31',
                val: 11,
                accn: older,
                fy: 2025,
                fp: 'Q1',
                form: '10-Q',
                filed: '2025-05-01',
              }],
            },
          },
          Assets: {
            units: {
              USD: [{
                end: '2025-06-30',
                val: 22,
                accn: later,
                fy: 2025,
                fp: 'Q2',
                form: '10-Q/A',
                filed: '2025-08-15',
              }],
            },
          },
        },
      },
    },
  };
}

export function checkHonestyFixes(api) {
  const errors = [];
  const { older, later, doc } = amendmentAssetsOnlyDoc();
  const parsed = api.parseCompanyfacts(doc, { sourceId: 'companyfacts/amendment-assets-only' });
  const allFacts = parsed.facts || [];
  if (latestAccession(allFacts) !== later) {
    errors.push(`amendment latest ${latestAccession(allFacts)} != ${later}`);
  }
  const { slots, gaps } = latestFilingSlots(allFacts);
  if (slots.company_revenue) {
    errors.push('amendment resurrected company_revenue from the older 10-Q');
  }
  const named = (gaps || []).some((g) => g.includes('company_revenue') && g.includes(later) && !g.includes(older));
  if (!named) errors.push(`amendment gap did not name later accession: ${JSON.stringify(gaps)}`);
  const mappedAll = mappedFacts(allFacts);
  if (!mappedAll.some((f) => f.accession === older)) {
    errors.push('construct lost the older mapped revenue');
  }
  const kept = mappedLatestFacts(allFacts);
  if (kept.some((f) => f.accession !== later)) {
    errors.push('mappedLatestFacts kept an older filing');
  }
  if (kept.some((f) => f.concept && String(f.concept).endsWith(':Revenues'))) {
    errors.push('mappedLatestFacts kept older Revenues');
  }
  const liveSlots = api.taggedSlots(kept);
  if (liveSlots.company_revenue) {
    errors.push('taggedSlots(mappedLatest) filled company_revenue from an older filing');
  }
  const gout = [];
  const live = api.liveClaims(
    [{ id: 'sent', text: 'Revenue was $11.', as_of: '2025-03-31', grade: 'A', source_id: 'review' }],
    api.rules,
    8,
    gout,
    { facts: kept },
  );
  const rev = live.find((c) => c.metric_id === 'company_revenue');
  if (rev && (rev.origin === 'companyfacts' || rev.origin === 'xbrl')) {
    errors.push('liveClaims used an older filing company_revenue');
  }
  if (rev && rev.origin === 'sentence') {
    errors.push('sentence filled company_revenue when the latest filing left it empty');
  }

  const twoFacts = factsFor(api, 'two-periods').facts;
  const twoSlot = api.taggedSlots(twoFacts).company_revenue;
  if (!twoSlot || (twoSlot.values || []).length < 2) {
    errors.push('two-periods fixture lost labeled periods');
  } else {
    const undated = [];
    api.liveClaims(
      [{ id: 'u', text: 'Revenue was higher this quarter.', as_of: null, grade: 'A', source_id: 'review' }],
      api.rules,
      8,
      undated,
      { facts: twoFacts },
    );
    if (undated.some((g) => /newer sentence/.test(g))) {
      errors.push('null as_of sentence counted newer than a multi-period filing');
    }
    const dated = [];
    api.liveClaims(
      [{ id: 'd', text: 'Revenue was higher this quarter.', as_of: '2026-12-31', grade: 'A', source_id: 'review' }],
      api.rules,
      8,
      dated,
      { facts: twoFacts },
    );
    if (dated.some((g) => /newer sentence/.test(g))) {
      errors.push('dated sentence counted newer than a filing with null as_of');
    }
    if (typeof api.staleTripwires === 'function') {
      const claim = { ...twoSlot };
      const rules = {
        ...api.rules,
        risk_metric: [...(api.rules.risk_metric || []), ['company_revenue', 'company_revenue']],
      };
      const matchVal = twoSlot.values[0].value_text;
      const otherVal = twoSlot.values[1].value_text;
      const match = api.staleTripwires(
        [{ id: 'r', name: 'company_revenue', status: 'WATCH', tripwires: [{ state: `$${matchVal}` }] }],
        [claim],
        rules,
        [],
      );
      if (match.length) errors.push('tripwire matching one labeled period was marked stale');
      const other = api.staleTripwires(
        [{ id: 'r', name: 'company_revenue', status: 'WATCH', tripwires: [{ state: `$${otherVal}` }] }],
        [claim],
        rules,
        [],
      );
      if (other.length) errors.push('tripwire matching the other labeled period was marked stale');
      const amounts = twoSlot.values.map((v) => Number(v.value_text)).filter((n) => Number.isFinite(n) && n > 0);
      const disagree = Math.max(...amounts) * 3;
      const stale = api.staleTripwires(
        [{ id: 'r', name: 'company_revenue', status: 'WATCH', tripwires: [{ state: `$${disagree}` }] }],
        [claim],
        rules,
        [],
      );
      if (!stale.length) errors.push('tripwire matching no labeled period was skipped');
    }
  }

  const uniqueFacts = factsFor(api, 'unique').facts;
  const uniqueSlot = api.taggedSlots(uniqueFacts).company_revenue;
  if (uniqueSlot && uniqueSlot.as_of) {
    const undatedUnique = [];
    api.liveClaims(
      [{ id: 'u2', text: 'Revenue was discussed.', as_of: null, grade: 'A', source_id: 'review' }],
      api.rules,
      8,
      undatedUnique,
      { facts: uniqueFacts },
    );
    if (undatedUnique.some((g) => /newer sentence/.test(g))) {
      errors.push('undated sentence counted newer than a dated structured slot');
    }
    const newer = [];
    api.liveClaims(
      [{ id: 'n2', text: 'Revenue was discussed.', as_of: '2099-12-31', grade: 'A', source_id: 'review' }],
      api.rules,
      8,
      newer,
      { facts: uniqueFacts },
    );
    if (!newer.some((g) => /newer sentence/.test(g))) {
      errors.push('dated later sentence should still count newer than a dated slot');
    }
  }
  return errors;
}

function existsCompanyfacts(id) {
  try {
    readFileSync(path.join(CF_DIR, id, 'companyfacts.json'));
    return true;
  } catch {
    return false;
  }
}
