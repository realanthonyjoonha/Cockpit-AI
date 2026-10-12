/**
 * P1 gate: 10k post-condition, END CONTEXT, no mu series filter, residual gap.
 * Same rules for every issuer in the ten-sector fixture.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assembleAgentPack,
  claimGaps,
  enforceCharBudget,
  liveClaims,
  loadContextpackRules,
  OVERVIEW_BUDGET_CHARS,
} from '../../memory-cockpit-v2/server/contextpack.js';
import { capAssistClipboard, HOUSE_FILE_POINTER, assistToolTrailer } from '../../memory-cockpit-v2/server/assistContext.js';
import { latestFilingSlots, mappedLatestFacts, parseCompanyfacts } from '../../memory-cockpit-v2/server/companyfacts.js';
import { loadSectors } from './sector-check.mjs';
import { loadIndex } from './review-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

function claim(id, text, asOf, grade = 'A') {
  return { id, text, as_of: asOf, grade, source_id: 'fixture' };
}

function baseStore(claims, extra = {}) {
  return {
    focus: { ticker: extra.ticker || 'DEMO', id: extra.id || 'demo' },
    compiled_at: '2026-01-15T00:00:00Z',
    house_prior: {
      play: 'fixture',
      status: 'CONFIRMED',
      date: '2026-01-15',
      view_excerpt: 'HEAD-CANARY fixture excerpt',
      ...(extra.house_prior || {}),
    },
    object: {
      id: extra.id || 'demo',
      name: extra.name || 'Demo Fixture',
      ticker: extra.ticker || 'DEMO',
      summary: extra.summary || 'HEAD-CANARY company summary',
      stance: [],
      role_in_theses: '',
    },
    claims,
    risks: extra.risks || [],
    risk_summary: { watch: [], fired: [] },
    gaps: extra.gaps || ['GAP-CANARY-TAIL'],
    provenance: { note: 'harness fixture', pack_config: 'demo' },
    series_snapshot: extra.series_snapshot || [],
    catalysts: [],
    sources: [],
    related: [],
  };
}

function pyCases(cases) {
  const work = mkdtempSync(path.join(tmpdir(), 'cockpit-p1-'));
  const storeDir = path.join(work, 'store');
  try {
    const proc = spawnSync('python3', [path.join(REPO, 'harness-stress/lib/retrieve_probe.py')], {
      input: JSON.stringify({ store_dir: storeDir, cases }),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (proc.status !== 0 && !proc.stdout) {
      return { error: proc.stderr || `python exit ${proc.status}` };
    }
    try {
      return JSON.parse(proc.stdout);
    } catch (err) {
      return { error: `bad python json: ${err.message}`, stderr: (proc.stderr || '').slice(0, 1500) };
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
}

function budgetOk(row, errors, id) {
  if (!row) {
    errors.push(`${id} missing`);
    return;
  }
  if (row.error) errors.push(`${id} ${row.error}`);
  if (row.chars > 10_000) errors.push(`${id} chars ${row.chars}`);
  const used = row.budget?.used_chars;
  if (typeof used === 'number' && used > 10_000) errors.push(`${id} used_chars ${used}`);
  if (row.over_budget) errors.push(`${id} over_budget`);
  if (row.budget?.trimmed && used > row.budget?.limit_chars) {
    errors.push(`${id} trimmed while over the limit`);
  }
}

function sectorStores() {
  const cases = [];
  for (const issuer of loadSectors().issuers || []) {
    const top = (issuer.live || []).find((row) => row.metric_id && row.metric_id !== 'other');
    const topClaim = (issuer.claims || []).find((c) => c.id === top?.id) || (issuer.claims || [])[0];
    const claims = (issuer.claims || []).map((c) => ({ ...c }));
    if (topClaim) {
      for (let i = 0; i < 10; i++) {
        claims.push({
          ...topClaim,
          id: `${topClaim.id}-rep${i}`,
          as_of: `2026-12-${String(i + 1).padStart(2, '0')}`,
        });
      }
    }
    const store = baseStore(claims, {
      ticker: String(issuer.id || 'SECTOR').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12) || 'SECTOR',
      id: issuer.id,
      name: issuer.sector,
      house_prior: { notes: 'N'.repeat(20_000) },
      series_snapshot: [{ id: `${issuer.id}-series`, name: 'fixture series' }],
      gaps: [],
    });
    store.focus = { ticker: store.focus.ticker, id: issuer.id };
    cases.push({
      issuer,
      ticker: store.focus.ticker,
      distinctive: (issuer.live || []).filter((row) => row.metric_id && row.metric_id !== 'other'),
      store,
    });
  }
  return cases;
}

export function sectorBudgetErrors() {
  const errors = [];
  const prepared = sectorStores();
  if (prepared.length !== 10) errors.push(`sector budget expected 10 issuers, got ${prepared.length}`);
  const cases = [];
  for (const row of prepared) {
    cases.push({
      id: `sector-retrieve-${row.issuer.id}`,
      op: 'retrieve',
      intent: 'overview',
      ticker: row.ticker,
      store: row.store,
    });
    cases.push({
      id: `sector-risks-${row.issuer.id}`,
      op: 'retrieve',
      intent: 'risks',
      ticker: row.ticker,
      store: row.store,
    });
    cases.push({
      id: `sector-agent-${row.issuer.id}`,
      op: 'agent',
      ticker: row.ticker,
      question: 'overview status',
      store: row.store,
    });
  }
  const py = pyCases(cases);
  if (py.error) {
    errors.push(py.error);
    return errors;
  }
  const byId = Object.fromEntries((py.cases || []).map((c) => [c.id, c]));
  for (const row of prepared) {
    const tag = row.issuer.id;
    const pack = byId[`sector-retrieve-${tag}`];
    budgetOk(pack, errors, `sector ${tag} retrieve`);
    if (pack && !pack.error) {
      if ((pack.notes_len || 0) > 0) errors.push(`sector ${tag} notes survived len ${pack.notes_len}`);
      if ((pack.house_keys || []).includes('notes')) errors.push(`sector ${tag} kept notes`);
      const metrics = new Set(pack.metric_ids || []);
      for (const live of row.distinctive) {
        if (!metrics.has(live.metric_id)) {
          errors.push(`sector ${tag} dropped distinctive metric ${live.metric_id}`);
        }
      }
    }
    const risks = byId[`sector-risks-${tag}`];
    budgetOk(risks, errors, `sector ${tag} risks`);
    if (risks && !risks.error && !(risks.series_ids || []).includes(`${tag}-series`)) {
      errors.push(`sector ${tag} dropped its series`);
    }
    const agent = byId[`sector-agent-${tag}`];
    if (!agent) errors.push(`sector ${tag} agent missing`);
    else if (agent.error) errors.push(`sector ${tag} agent ${agent.error}`);
    else {
      if (!agent.has_end_marker) errors.push(`sector ${tag} agent missing END CONTEXT`);
      if (agent.chars > 28_000) errors.push(`sector ${tag} agent chars ${agent.chars}`);
      if (agent.truncated) errors.push(`sector ${tag} agent hard-truncated`);
    }
  }
  return errors;
}

export function assertP1() {
  const errors = [];
  const ont = path.join(REPO, 'ontology');
  const rules = loadContextpackRules(ont);
  const retrieveSrc = readFileSync(path.join(ont, 'api/retrieve.py'), 'utf8');
  if (/startswith\(\s*["']mu["']\s*\)/.test(retrieveSrc)) errors.push('mu prefix filter remains');
  if (retrieveSrc.includes('micron-capex') || retrieveSrc.includes('dram-spot-ddr5')) {
    errors.push('micron series id list remains');
  }
  if (!retrieveSrc.includes('no compiled pack for this focus')) {
    errors.push('focus error still names a universe');
  }

  const desks = JSON.parse(readFileSync(path.join(REPO, 'memory-cockpit-v2/config/thin-desks.json'), 'utf8'));
  if (!Array.isArray(desks.desks) || desks.desks.length !== 0) errors.push('thin-desks.json desks is not empty');

  const fatText = 'Z'.repeat(8000);
  const fatClaims = [
    claim('fat1', `Net sales were $10 million ${fatText}`, '2026-01-01'),
    claim('fat2', `Gross margin was 40% ${fatText}`, '2026-01-02'),
  ];
  const fatPack = assembleAgentPack(baseStore(fatClaims), rules);
  const fatJson = JSON.stringify(fatPack);
  if (fatJson.length > 10_000) errors.push(`C-js-no-char-cap ${fatJson.length}`);
  if (!fatPack.budget || fatPack.budget.used_chars > OVERVIEW_BUDGET_CHARS) {
    errors.push('C-js-no-char-cap budget missing or over');
  }
  if (fatPack.budget && fatPack.budget.used_chars !== fatJson.length) {
    errors.push(`C-js-no-char-cap used_chars ${fatPack.budget.used_chars} != ${fatJson.length}`);
  }
  if (fatPack.budget?.trimmed && fatPack.budget.used_chars > fatPack.budget.limit_chars) {
    errors.push('C-js-no-char-cap trimmed over the limit');
  }

  const noted = assembleAgentPack(baseStore(
    [claim('rev', 'Net sales were $10 million', '2026-01-01')],
    { house_prior: { notes: 'N'.repeat(20_000) } },
  ), rules);
  const notedJson = JSON.stringify(noted);
  if (notedJson.length > 10_000) errors.push(`JS notes pack ${notedJson.length}`);
  if (noted.house_prior && Object.prototype.hasOwnProperty.call(noted.house_prior, 'notes')) {
    errors.push('JS house_prior.notes survived');
  }
  if (!(noted.gaps || []).some((g) => String(g).includes('notes'))) errors.push('JS notes drop was not named');

  const pretty = {
    claims: [claim('fat', `Net sales were $1 ${'Q'.repeat(12_000)}`, '2026-01-01')],
    house_prior: { status: 'CONFIRMED', date: '2026-01-15', notes: 'N'.repeat(20_000), view_excerpt: 'H'.repeat(4000) },
    gaps: [],
  };
  enforceCharBudget(pretty, 10_000, (row) => JSON.stringify(row, null, 2).length);
  const prettyText = JSON.stringify(pretty, null, 2);
  if (prettyText.length > 10_000) errors.push(`pretty snapshot ${prettyText.length}`);
  if (pretty.house_prior && pretty.house_prior.notes) errors.push('pretty snapshot kept notes');

  const residual = [];
  for (let i = 1; i <= 12; i++) {
    residual.push(claim(`r${i}`, `Unmatched item ${i} cost $${i} million`, `2026-${String(i).padStart(2, '0')}-01`));
  }
  const residualLive = liveClaims(residual, rules);
  const residualGaps = claimGaps(residual, rules);
  if (residualLive.length !== 8) errors.push(`C-residual-cap kept ${residualLive.length}`);
  if (!residualGaps.some((g) => g === '4 unclassified numbered claims omitted')) {
    errors.push(`C-residual-cap gaps ${JSON.stringify(residualGaps)}`);
  }

  const longHouse = `\`\`\`markdown\n${'H'.repeat(20_000)}\n\`\`\``;
  const clip = capAssistClipboard(`rules\n${longHouse}\nclaims\n`);
  const clipTrailer = assistToolTrailer({ chars: clip.length, house_exists: true, compiled_at: '2026-01-15T00:00:00Z' });
  if (clip.length + clipTrailer.length > 10_000) errors.push(`assist clipboard+trailer ${clip.length + clipTrailer.length}`);
  if (!clip.includes(HOUSE_FILE_POINTER)) errors.push('assist clipboard missing get_house_view pointer');

  const crowded = {
    claims: [
      ...Array.from({ length: 16 }, (_, i) => ({
        id: `sent-${i}`,
        metric_id: 'gross_margin',
        text: `Gross margin was ${40 + i} percent. ${'WORD '.repeat(60)}`,
        origin: 'sentence',
        confidence: 'low',
        as_of: '2026-01-01',
        grade: 'A',
      })),
      {
        id: 'xbrl:us-gaap:Revenues:2025-01-01/2025-12-31',
        metric_id: 'company_revenue',
        origin: 'xbrl',
        confidence: 'tagged',
        text: 'Revenues USD 48,000,000,000 for 2025-01-01 to 2025-12-31 (consolidated tagged fact)',
        value_text: '48000000000',
        as_of: '2025-12-31',
        grade: 'A',
      },
    ],
    house_prior: { status: 'CONFIRMED', date: '2026-01-15', view_excerpt: 'H'.repeat(1800) },
    gaps: [],
  };
  enforceCharBudget(crowded, 2800);
  if (!(crowded.claims || []).some((c) => c.origin === 'companyfacts' || c.origin === 'xbrl')) {
    errors.push('over-budget pack dropped the tagged row');
  }
  if (JSON.stringify(crowded).length > 2800) errors.push(`over-budget tagged-first ${JSON.stringify(crowded).length}`);

  const crowd = [];
  for (let i = 0; i < 10; i++) {
    crowd.push(claim(`rev${i}`, `Net sales were $${200 + i} million`, `2026-12-${String(i + 1).padStart(2, '0')}`));
  }
  crowd.push(claim('conc-old', 'Customer concentration was 40 percent', '2020-01-01'));
  crowd.push(claim('guide-old', 'Outlook for next quarter revenue is $100 million', '2020-01-01'));
  crowd.push(claim('gm-old', 'Gross margin was 40%', '2020-01-01'));

  const longClaim = claim(
    'long',
    `Net sales were $10 million ${'WORD '.repeat(6000)} HEAD-CANARY`,
    '2026-06-01',
  );

  const cases = [
    { id: 'C-retrieve-fat-claims', op: 'retrieve', intent: 'overview', store: baseStore(fatClaims) },
    {
      id: 'C-retrieve-unknown-house-field',
      op: 'retrieve',
      intent: 'overview',
      store: baseStore([claim('rev', 'Net sales were $10 million', '2026-01-01')], {
        house_prior: { notes: 'N'.repeat(20_000) },
      }),
    },
    { id: 'C-retrieve-crowd', op: 'retrieve', intent: 'overview', store: baseStore(crowd) },
    {
      id: 'C-retrieve-risks-mu-filter',
      op: 'retrieve',
      intent: 'risks',
      store: baseStore([claim('rev', 'Net sales were $10 million', '2026-01-01')], {
        series_snapshot: [
          { id: 'demo-price', name: 'fixture' },
          { id: 'mu-price', name: 'other ticker series' },
        ],
      }),
    },
    {
      id: 'C-retrieve-risks-demo-only',
      op: 'retrieve',
      intent: 'risks',
      store: baseStore([claim('rev', 'Net sales were $10 million', '2026-01-01')], {
        series_snapshot: [{ id: 'demo-price', name: 'fixture' }],
      }),
    },
    {
      id: 'C-agent-tail-cut',
      op: 'agent',
      question: 'overview status',
      store: baseStore([longClaim], { gaps: ['GAP-CANARY-TAIL'], summary: 'HEAD-CANARY' }),
    },
    {
      id: 'C-agent-reserve',
      op: 'agent',
      question: 'overview status',
      max_chars: 1500,
      store: baseStore([longClaim], { gaps: ['GAP-CANARY-TAIL'], summary: 'HEAD-CANARY' }),
    },
    { id: 'C-residual-cap', op: 'live', store: baseStore(residual) },
    { id: 'C-resolve-unknown', op: 'resolve', focus: 'not-a-filer' },
    { id: 'C-resolve-alias', op: 'resolve', focus: 'micron' },
  ];

  const py = pyCases(cases);
  if (py.error) {
    errors.push(py.error);
    return errors;
  }
  const byId = Object.fromEntries((py.cases || []).map((c) => [c.id, c]));

  budgetOk(byId['C-retrieve-fat-claims'], errors, 'C-retrieve-fat-claims');
  const notes = byId['C-retrieve-unknown-house-field'];
  budgetOk(notes, errors, 'C-retrieve-unknown-house-field');
  if (notes && !notes.error) {
    if ((notes.notes_len || 0) > 0) errors.push(`notes survived len ${notes.notes_len}`);
    if ((notes.house_keys || []).includes('notes')) errors.push('notes key survived');
    if (!(notes.gap_texts || []).some((g) => String(g).includes('notes'))) {
      errors.push('notes drop was not named');
    }
  }

  const crowdRow = byId['C-retrieve-crowd'];
  if (!crowdRow || crowdRow.error) errors.push(`C-retrieve-crowd ${crowdRow?.error || 'missing'}`);
  else {
    for (const id of ['conc-old', 'guide-old', 'gm-old']) {
      if (!(crowdRow.claim_ids || []).includes(id)) errors.push(`C-retrieve-crowd dropped ${id}`);
    }
  }

  const mu = byId['C-retrieve-risks-mu-filter'];
  if (!mu || mu.error) errors.push(`C-retrieve-risks-mu-filter ${mu?.error || 'missing'}`);
  else {
    if (!(mu.series_ids || []).includes('demo-price')) errors.push('demo-price dropped');
    if (!(mu.series_ids || []).includes('mu-price')) errors.push('mu-price dropped though it was in the store');
  }
  const demoOnly = byId['C-retrieve-risks-demo-only'];
  if (!demoOnly || demoOnly.error) errors.push(`C-retrieve-risks-demo-only ${demoOnly?.error || 'missing'}`);
  else if (!(demoOnly.series_ids || []).includes('demo-price')) errors.push('demo-only series dropped');

  const agent = byId['C-agent-tail-cut'];
  if (!agent || agent.error) errors.push(`C-agent-tail-cut ${agent?.error || 'missing'}`);
  else {
    if (!agent.has_end_marker) errors.push('C-agent-tail-cut missing END CONTEXT');
    if (agent.chars > 28_000) errors.push(`C-agent-tail-cut chars ${agent.chars}`);
    if (agent.truncated) errors.push('C-agent-tail-cut still hard-slices');
  }
  const reserved = byId['C-agent-reserve'];
  if (!reserved || reserved.error) errors.push(`C-agent-reserve ${reserved?.error || 'missing'}`);
  else {
    if (!reserved.has_end_marker) errors.push('reserved closer missing END CONTEXT');
    if (reserved.chars > 1500) errors.push(`reserved closer chars ${reserved.chars}`);
    if (!reserved.middle_omitted) errors.push('reserved closer did not name the omitted middle');
  }

  const residualPy = byId['C-residual-cap'];
  if (!residualPy || residualPy.error) errors.push(`C-residual-cap py ${residualPy?.error || 'missing'}`);
  else {
    if ((residualPy.live || []).length !== 8) errors.push(`py residual kept ${(residualPy.live || []).length}`);
    if (!(residualPy.gaps || []).includes('4 unclassified numbered claims omitted')) {
      errors.push(`py residual gaps ${JSON.stringify(residualPy.gaps)}`);
    }
  }

  const unknown = byId['C-resolve-unknown'];
  const unknownMsg = unknown?.error || '';
  if (!unknownMsg.includes('no compiled pack for this focus')) errors.push(`focus error ${unknownMsg}`);
  if (/\bMU\b|\bNBIS\b/.test(unknownMsg)) errors.push('focus error still lists a universe');
  const alias = byId['C-resolve-alias'];
  if (!alias || alias.error || alias.ticker !== 'MU') errors.push(`micron alias ${alias?.error || alias?.ticker}`);

  errors.push(...sectorBudgetErrors());
  errors.push(...labeledPeriodsSurviveCap(rules));
  return errors;
}

function periodKeyOf(val) {
  const period = (val && val.period) || {};
  return `${period.start ?? ''}|${period.end ?? ''}`;
}

function labeledPeriodsSurviveCap(rules) {
  const errors = [];
  const index = loadIndex();
  const cfDir = path.join(REPO, 'harness-stress/fixtures/companyfacts');
  let checked = 0;
  for (const row of index.issuers || []) {
    if (row.kind !== 'extract' && row.kind !== 'constructed') continue;
    const doc = JSON.parse(readFileSync(path.join(cfDir, row.id, 'companyfacts.json'), 'utf8'));
    const allFacts = parseCompanyfacts(doc, { sourceId: `companyfacts/${row.id}` }).facts;
    const { slots } = latestFilingSlots(allFacts);
    const want = {};
    for (const [mid, slot] of Object.entries(slots)) {
      const values = slot.values || [];
      let latestEnd = '';
      for (const v of values) {
        const end = String((v.period || {}).end || '');
        if (end > latestEnd) latestEnd = end;
      }
      const periods = new Set(
        values.filter((v) => String((v.period || {}).end || '') === latestEnd).map(periodKeyOf),
      );
      if (periods.size) want[mid] = periods;
    }
    if (!Object.keys(want).length) continue;
    const fat = Array.from({ length: 12 }, (_, i) => claim(
      `sent-${i}`,
      `Gross margin was ${40 + i} percent. ${'WORD '.repeat(80)}`,
      `2026-01-${String(i + 1).padStart(2, '0')}`,
    ));
    const store = baseStore(fat, {
      ticker: row.id.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 12),
      id: row.id,
      house_prior: { notes: 'N'.repeat(20_000), view_excerpt: 'E'.repeat(5000) },
      gaps: [],
    });
    store.facts = mappedLatestFacts(allFacts);
    const assembled = assembleAgentPack(store, rules);
    const live = liveClaims(fat, rules, 8, null, { facts: store.facts });
    const snapshot = {
      available: true,
      ticker: store.focus.ticker,
      house_prior: { status: 'CONFIRMED', date: '2026-01-15', view_excerpt: 'E'.repeat(5000), notes: 'N'.repeat(20_000) },
      claims: live.map((c) => ({
        text: c.text,
        grade: c.grade,
        as_of: c.as_of,
        source_id: c.source_id,
        metric_id: c.metric_id || null,
        confidence: c.confidence || null,
        origin: c.origin,
        values: c.values,
      })),
      gaps: [],
    };
    enforceCharBudget(snapshot, OVERVIEW_BUDGET_CHARS, (row) => JSON.stringify(row, null, 2).length);
    if (JSON.stringify(snapshot, null, 2).length > OVERVIEW_BUDGET_CHARS) {
      errors.push(`${row.id} pretty snapshot over cap`);
    }
    for (const pack of [assembled, snapshot]) {
      const byMid = {};
      for (const c of pack.claims || []) {
        if (c.origin === 'companyfacts' || c.origin === 'xbrl') byMid[c.metric_id] = c;
      }
      for (const [mid, periods] of Object.entries(want)) {
        const claimRow = byMid[mid];
        if (!claimRow) {
          errors.push(`${row.id} lost ${mid} under the cap`);
          continue;
        }
        const got = new Set((claimRow.values || []).map(periodKeyOf));
        for (const key of periods) {
          if (!got.has(key)) errors.push(`${row.id} ${mid} lost labeled period ${key}`);
        }
      }
    }
    checked += 1;
  }
  if (checked < 1) errors.push('no live-shaped extracts to check labeled periods');
  return errors;
}
