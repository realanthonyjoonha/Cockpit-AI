/**
 * Deterministic context probes. Imports product contextpack.js read-only.
 * Python retrieve/agent runs against a temp store under workDir, never ontology/store.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  assembleAgentPack,
  claimGaps,
  liveClaims,
  loadContextpackRules,
} from '../../memory-cockpit-v2/server/contextpack.js';
import { countTokens } from './tokens.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const RULES_PATH = path.join(REPO, 'ontology/schema/contextpack_metrics.json');

function claim(id, text, asOf, grade = 'A') {
  return { id, text, as_of: asOf, grade, source_id: 'fixture' };
}

function baseStore(claims, extra = {}) {
  return {
    focus: { ticker: 'DEMO', id: 'demo' },
    compiled_at: '2026-01-15T00:00:00Z',
    house_prior: {
      play: 'fixture',
      status: 'CONFIRMED',
      date: '2026-01-15',
      view_excerpt: 'HEAD-CANARY fixture excerpt',
      ...(extra.house_prior || {}),
    },
    object: {
      id: 'demo',
      name: 'Demo Fixture',
      ticker: 'DEMO',
      summary: extra.summary || 'HEAD-CANARY company summary',
      stance: [],
      role_in_theses: extra.role || '',
    },
    claims,
    risks: extra.risks || [],
    risk_summary: extra.risk_summary || { watch: [], fired: [] },
    gaps: extra.gaps || ['GAP-CANARY-TAIL'],
    provenance: { note: 'harness fixture', pack_config: 'demo' },
    series_snapshot: extra.series_snapshot || [],
    catalysts: extra.catalysts || [],
    sources: [],
    related: extra.related || [],
  };
}

function jsLive(claims, rules) {
  return liveClaims(claims, rules).map((c) => ({
    id: c.id,
    metric_id: c.metric_id,
    as_of: c.as_of,
    grade: c.grade,
    text: c.text,
  }));
}

function ids(rows) {
  return rows.map((r) => r.id);
}

export function contextProbe() {
  const rules = loadContextpackRules(path.join(REPO, 'ontology'));
  const rulesText = readFileSync(RULES_PATH, 'utf8');
  const cases = [];

  const datePair = [
    claim('sep', 'Net sales were $111 million', '2026-9-30'),
    claim('oct', 'Net sales were $222 million', '2026-10-01'),
  ];
  const dateLive = jsLive(datePair, rules);
  cases.push({
    id: 'C-date-unpadded',
    live: dateLive,
    winner: dateLive[0]?.id || null,
    newer_id: 'oct',
    older_id: 'sep',
  });

  const isoPair = [
    claim('old', 'Net sales were $111 million', '2026-09-30'),
    claim('new', 'Net sales were $222 million', '2026-10-01'),
  ];
  const isoLive = jsLive(isoPair, rules);
  cases.push({
    id: 'C-date-iso',
    live: isoLive,
    winner: isoLive[0]?.id || null,
  });

  const cashGuide = [
    claim('cash-clean', 'Cash and cash equivalents were $90 million', '2026-06-01'),
    claim('cash-guid', 'Cash and cash equivalents were $90 million. See guidance.', '2026-06-02'),
    claim('outlook', 'Outlook for next quarter revenue is $100 million', '2026-06-01'),
  ];
  cases.push({
    id: 'C-guid-steals-cash',
    live: jsLive(cashGuide, rules),
  });

  const freshCash = [
    claim('old-cash', 'Cash and cash equivalents were $111 million', '2024-01-01'),
    claim('new-cash', 'Cash was $222 million', '2026-06-01'),
  ];
  cases.push({
    id: 'C-cash-phrase',
    live: jsLive(freshCash, rules),
  });

  const goodwill = [
    claim('inv-imp', 'Inventory impairment of $9 million', '2026-05-01'),
    claim('gw-bal', 'A goodwill balance of $5 billion', '2026-05-01'),
  ];
  cases.push({
    id: 'C-goodwill-any',
    live: jsLive(goodwill, rules),
  });

  const dropped = [
    claim('space', 'Unmatched spend was $ 12 million', '2026-01-01'),
    claim('tight', 'Unmatched spend was $12 million', '2026-01-01'),
    claim('emp', 'Number of employees was $4242 thousand', '2026-01-01'),
    claim('qual', 'CANARY-SEGMENTS the fixture reports exactly 3 segments', '2026-01-01'),
    claim('pct', 'segment mix was 45 percent', '2026-01-01'),
    claim('pctsign', 'segment mix was 45%', '2026-01-02'),
  ];
  cases.push({
    id: 'C-drops',
    input_ids: dropped.map((c) => c.id),
    live: jsLive(dropped, rules),
  });

  const residual = [];
  for (let i = 1; i <= 12; i++) {
    const month = String(i).padStart(2, '0');
    residual.push(claim(
      `r${i}`,
      `Unmatched item ${i} cost $${i} million`,
      `2026-${month}-01`,
      i % 2 ? 'A' : 'C',
    ));
  }
  const residualLive = jsLive(residual, rules);
  cases.push({
    id: 'C-residual-cap',
    input: 12,
    kept: residualLive.length,
    kept_ids: ids(residualLive),
    cap: 8,
    gaps: claimGaps(residual, rules),
  });

  const missingGrade = [
    claim('bare', 'Net sales were $10 million', '2026-08-01', ''),
    claim('cee', 'Net sales were $11 million', '2026-08-01', 'C'),
  ];
  cases.push({
    id: 'C-missing-grade',
    js: jsLive(missingGrade, rules),
  });

  const tie = [
    claim('first', 'Net sales were $10 million from the first filing', '2026-08-01'),
    claim('second', 'Net sales were $99 million from the second filing', '2026-08-01'),
  ];
  cases.push({
    id: 'C-same-day-tie',
    winner: jsLive(tie, rules)[0]?.id || null,
    note: 'same as_of and grade; stable sort keeps the earlier array element',
  });

  const packClaims = [
    ...datePair,
    ...cashGuide,
    claim('qual2', 'CANARY-SEGMENTS the fixture reports exactly 3 segments', '2026-06-01'),
  ];
  const assembled = assembleAgentPack(baseStore(packClaims), rules);
  const assembledJson = JSON.stringify(assembled);
  cases.push({
    id: 'C-js-assemble-shape',
    chars: assembledJson.length,
    tokens: countTokens(assembledJson),
    schema: assembled.schema,
    has_budget: Object.prototype.hasOwnProperty.call(assembled, 'budget'),
    has_superseded: Object.prototype.hasOwnProperty.call(assembled, 'superseded_count'),
    has_stale_tripwires: Object.prototype.hasOwnProperty.call(assembled, 'stale_tripwires'),
    claim_ids: (assembled.claims || []).map((c) => `${c.metric_id}:${c.id}`),
    store_claims: assembled.store_claims,
  });

  const fatText = 'Z'.repeat(8000);
  const fatClaims = [
    claim('fat1', `Net sales were $10 million ${fatText}`, '2026-01-01'),
    claim('fat2', `Gross margin was 40% ${fatText}`, '2026-01-02'),
  ];
  const fatPack = assembleAgentPack(baseStore(fatClaims), rules);
  const fatJson = JSON.stringify(fatPack);
  cases.push({
    id: 'C-js-no-char-cap',
    chars: fatJson.length,
    over_10000: fatJson.length > 10_000,
    claim_count: fatPack.claims.length,
  });

  const pyCases = [];

  pyCases.push({
    id: 'C-date-unpadded',
    op: 'live',
    store: baseStore(datePair),
  });
  pyCases.push({
    id: 'C-missing-grade',
    op: 'live',
    store: baseStore(missingGrade.map((c) => ({ ...c, grade: c.grade || null }))),
  });
  pyCases.push({
    id: 'C-guid-steals-cash',
    op: 'live',
    store: baseStore(cashGuide),
  });

  const crowd = [];
  for (let i = 0; i < 10; i++) {
    crowd.push(claim(`rev${i}`, `Net sales were $${200 + i} million`, `2026-12-${String(i + 1).padStart(2, '0')}`));
  }
  crowd.push(claim('cash-old', 'Cash and cash equivalents were $5 million', '2020-01-01'));
  crowd.push(claim('debt-old', 'Long-term debt was $7 million', '2020-01-01'));
  crowd.push(claim('gm-old', 'Gross margin was 40%', '2020-01-01'));
  pyCases.push({
    id: 'C-retrieve-crowd',
    op: 'retrieve',
    intent: 'overview',
    store: baseStore(crowd),
  });

  pyCases.push({
    id: 'C-retrieve-fat-claims',
    op: 'retrieve',
    intent: 'overview',
    store: baseStore(fatClaims),
  });

  pyCases.push({
    id: 'C-retrieve-unknown-house-field',
    op: 'retrieve',
    intent: 'overview',
    store: baseStore(
      [claim('rev', 'Net sales were $10 million', '2026-01-01')],
      { house_prior: { notes: 'N'.repeat(20_000) } },
    ),
  });

  pyCases.push({
    id: 'C-retrieve-risks-mu-filter',
    op: 'retrieve',
    intent: 'risks',
    store: baseStore(
      [claim('rev', 'Net sales were $10 million', '2026-01-01')],
      {
        series_snapshot: [
          { id: 'demo-price', name: 'fixture' },
          { id: 'mu-price', name: 'other ticker series' },
        ],
      },
    ),
  });

  const longClaim = claim(
    'long',
    `Net sales were $10 million ${'WORD '.repeat(6000)} HEAD-CANARY`,
    '2026-06-01',
  );
  pyCases.push({
    id: 'C-agent-tail-cut',
    op: 'agent',
    question: 'overview status',
    store: baseStore([longClaim], {
      gaps: ['GAP-CANARY-TAIL'],
      summary: 'HEAD-CANARY',
    }),
  });

  const work = mkdtempSync(path.join(tmpdir(), 'cockpit-ctx-'));
  const storeDir = path.join(work, 'store');
  let py = { ok: false, error: 'not run' };
  try {
    const proc = spawnSync('python3', [path.join(REPO, 'harness-stress/lib/retrieve_probe.py')], {
      input: JSON.stringify({ store_dir: storeDir, cases: pyCases }),
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    });
    if (proc.status !== 0 && !proc.stdout) {
      py = { ok: false, error: proc.stderr || `exit ${proc.status}` };
    } else {
      try {
        py = JSON.parse(proc.stdout);
      } catch (e) {
        py = { ok: false, error: `bad json: ${e.message}`, stderr: (proc.stderr || '').slice(0, 2000), stdout_head: (proc.stdout || '').slice(0, 500) };
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }

  const pyById = Object.fromEntries((py.cases || []).map((c) => [c.id, c]));
  const missingJs = cases.find((c) => c.id === 'C-missing-grade');
  const missingPy = pyById['C-missing-grade'];
  const gradeDivergence = {
    js_winner: missingJs?.js?.[0]?.id || null,
    py_winner: missingPy?.live?.[0]?.id || null,
    js_grades: missingJs?.js,
    py_live: missingPy?.live,
  };

  return {
    rules_bytes: rulesText.length,
    metric_ids: (JSON.parse(rulesText).metrics || []).map((m) => m.id),
    boilerplate: JSON.parse(rulesText).boilerplate,
    js_cases: cases,
    python: py,
    grade_divergence: gradeDivergence,
    product_store_written: false,
  };
}
