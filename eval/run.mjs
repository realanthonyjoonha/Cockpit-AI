#!/usr/bin/env node
/**
 * PILOT eval runner. Single command: node eval/run.mjs
 * Models run via Cursor (harness-stress model arm). Never XAI_API_KEY.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAnswerKey, persistAnswerKey } from './lib/answer-key.mjs';
import { buildJobs, persistJobs } from './lib/jobs.mjs';
import {
  assertNoXai, EVAL_ROOT, jobsDir, keysDir, loadConfig, REPO_ROOT, tracesDir,
} from './lib/load-config.mjs';
import { writeReport } from './lib/report.mjs';
import { extractJsonArray, scoreTrace } from './lib/score.mjs';
import { fetchCompanyfacts, readCachedFacts, writeJson } from './lib/sec.mjs';
import { estimateCost, rollup } from './lib/stats.mjs';
import { countTokens } from './vendor/tokens.mjs';
import { checkSliceCard } from './vendor/slice-card-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseArgs(argv) {
  const args = new Set(argv.slice(2));
  return {
    selfTest: args.has('--self-test'),
    prepare: args.has('--prepare') || args.size === 0 || args.has('--all'),
    score: args.has('--score') || args.size === 0 || args.has('--all'),
    report: args.has('--report') || args.size === 0 || args.has('--all'),
    jobsOnly: args.has('--jobs'),
    offline: args.has('--offline'),
  };
}

export async function prepareLive(cfg) {
  assertNoXai();
  const docs = {};
  const fetchMeta = [];
  for (const company of cfg.companies) {
    const cached = readCachedFacts(company, cfg);
    if (cached) {
      docs[company.ticker] = cached.doc;
      fetchMeta.push({
        ticker: company.ticker, cik: company.cik, sha256: cached.sha256, bytes: cached.bytes, cached: true,
      });
      continue;
    }
    const info = await fetchCompanyfacts(company, cfg);
    docs[company.ticker] = JSON.parse(readFileSync(info.path, 'utf8'));
    fetchMeta.push({ ...info, cached: false });
  }
  const key = buildAnswerKey(docs, cfg);
  const keyPath = persistAnswerKey(key, cfg);
  const jobs = buildJobs(key, cfg);
  const index = persistJobs(jobs, cfg);
  const pin = {
    git_commit: gitCommit(),
    fetched_at: key.fetched_at,
    fetch: fetchMeta,
    n_jobs: index.length,
    n_items: jobs.reduce((s, j) => s + j.items.length, 0),
    model: cfg.pilot.models.subject,
    xai_key_used: false,
  };
  writeJson(path.join(keysDir(cfg), 'pin.json'), pin);
  writeJson(path.join(jobsDir(cfg), 'pin.json'), { git_commit: pin.git_commit, fetched_at: pin.fetched_at });
  return { key, jobs, index, pin, keyPath };
}

export function prepareOfflineConstructed(cfg) {
  const doc = JSON.parse(readFileSync(path.join(EVAL_ROOT, 'fixtures/constructed-companyfacts.json'), 'utf8'));
  const docs = {};
  for (const company of cfg.companies) docs[company.ticker] = doc;
  const key = buildAnswerKey(docs, cfg);
  persistAnswerKey(key, cfg);
  const jobs = buildJobs(key, cfg);
  persistJobs(jobs, cfg);
  return { key, jobs };
}

function loadKey(cfg) {
  const dest = path.join(keysDir(cfg), 'answer-key.json');
  if (!existsSync(dest)) throw new Error('no answer key — run node eval/run.mjs --prepare');
  return JSON.parse(readFileSync(dest, 'utf8'));
}

function loadTraces(cfg) {
  const dir = tracesDir(cfg);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')));
}

function markSpotCheck(scored, cfg) {
  const open = scored.filter((r) => r.question_id === 'risk_propose' || r.question_id === 'steelman');
  const n = Math.max(1, Math.round(open.length * cfg.pilot.scoring.spot_check_rate));
  const shuffled = [...open].sort((a, b) => `${a.item_id}${a.arm}${a.repeat}`.localeCompare(`${b.item_id}${b.arm}${b.repeat}`));
  const step = Math.max(1, Math.floor(shuffled.length / n));
  const picked = [];
  for (let i = 0; i < shuffled.length && picked.length < n; i += step) picked.push(shuffled[i]);
  return picked.map((row, i) => ({
    mark: `SPOT-${String(i + 1).padStart(2, '0')}`,
    item_id: row.item_id,
    company_id: row.company_id,
    question_id: row.question_id,
    arm: row.arm,
    repeat: row.repeat,
    rubric: row.rubric,
    excerpt: row.answer_excerpt,
  }));
}

export function scoreAll(cfg) {
  const key = loadKey(cfg);
  const traces = loadTraces(cfg);
  const scored = [];
  for (const trace of traces) {
    const rawAnswers = Array.isArray(trace.answers) ? trace.answers : extractJsonArray(trace.raw_text);
    const itemIds = trace.item_ids || (rawAnswers || []).map((a) => a.item_id).filter(Boolean);
    const completion = countTokens(trace.raw_text || JSON.stringify(trace.answers || []));
    const promptTokens = trace.prompt_tokens || 0;
    const cached = trace.cached_tokens || 0;
    trace.completion_tokens = trace.completion_tokens ?? completion;
    trace.cost_usd = estimateCost(promptTokens, trace.completion_tokens, cached, cfg.pilot.pricing);
    scored.push(...scoreTrace({ ...trace, item_ids: itemIds, answers: rawAnswers }, key, cfg));
  }
  const rolled = rollup(scored, traces, cfg);
  const spot = markSpotCheck(scored, cfg);
  writeJson(path.join(keysDir(cfg), '..', 'scored.json'), { n: scored.length, items: scored });
  writeJson(path.join(keysDir(cfg), '..', 'rollup.json'), rolled);
  writeJson(path.join(keysDir(cfg), '..', 'spot-check.json'), spot);
  return { key, traces, scored, rolled, spot };
}

export function quoteFrom(traces, rolled, cfg) {
  const pilotUsd = traces.reduce((s, t) => s + (t.cost_usd || 0), 0);
  const nItems = traces.reduce((s, t) => s + (t.item_ids?.length || 0), 0) || scoredLen(rolled);
  const perItem = nItems ? pilotUsd / nItems : 0;
  const fullN = cfg.pilot.full_run.companies * cfg.pilot.full_run.questions * cfg.pilot.full_run.arms * cfg.pilot.full_run.repeats;
  const anyKeep = Object.values(rolled.diffs || {}).some((d) => d.keep === 'keep');
  const smaller = anyKeep ? null : {
    label: '5 companies × 6 × 3 arms (0, 0+a, full) × 3 repeats = 270',
    n: 5 * 6 * 3 * 3,
    usd: perItem * 5 * 6 * 3 * 3,
  };
  return {
    pilot_usd: pilotUsd,
    per_item_usd: perItem,
    full_2400_usd: perItem * fullN,
    smaller_run: smaller,
  };
}

function scoredLen(rolled) {
  return Object.values(rolled.byArm || {}).reduce((s, a) => s + (a.n || 0), 0);
}

export function emitReport(payload, cfg) {
  return writeReport(payload, cfg);
}

async function main() {
  assertNoXai();
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  mkdirSync(path.join(HERE, 'results'), { recursive: true });

  if (args.selfTest) {
    // bind real helpers for the test body
    const scoreMod = await import('./lib/score.mjs');
    const statsMod = await import('./lib/stats.mjs');
    globalThis.__score = scoreMod;
    globalThis.__stats = statsMod;
    selfTestPatched();
    return;
  }

  if (args.jobsOnly || args.prepare) {
    if (args.offline) {
      const { jobs } = prepareOfflineConstructed(cfg);
      console.log(JSON.stringify({ mode: 'offline', jobs: jobs.length }, null, 2));
    } else {
      const out = await prepareLive(cfg);
      console.log(JSON.stringify({
        mode: 'prepare',
        fetched_at: out.pin.fetched_at,
        git_commit: out.pin.git_commit,
        jobs: out.index.length,
        items: out.pin.n_items,
        key: out.keyPath,
      }, null, 2));
    }
  }

  const haveTraces = existsSync(tracesDir(cfg)) && readdirSync(tracesDir(cfg)).some((f) => f.endsWith('.json'));
  if ((args.score || args.report) && haveTraces) {
    const { traces, scored, rolled, spot, key } = scoreAll(cfg);
    const pin = existsSync(path.join(keysDir(cfg), 'pin.json'))
      ? JSON.parse(readFileSync(path.join(keysDir(cfg), 'pin.json'), 'utf8'))
      : { git_commit: gitCommit(), fetched_at: key.fetched_at };
    const quote = quoteFrom(traces, rolled, cfg);
    const report = emitReport({
      meta: { ...pin, n_traces: traces.length, n_items: scored.length },
      rollup: rolled,
      spotCheck: spot,
      quote,
    }, cfg);
    writeJson(path.join(keysDir(cfg), '..', 'quote.json'), quote);
    console.log(JSON.stringify({ scored: scored.length, traces: traces.length, report, quote }, null, 2));
  } else if (args.score || args.report) {
    console.log('no traces yet — write Cursor subagent replies to eval/results/traces/<job_id>.json then rerun node eval/run.mjs --score');
  }
}

function selfTestPatched() {
  const scoreMod = globalThis.__score;
  const statsMod = globalThis.__stats;
  const cfg = loadConfig();
  const errors = [];
  const tickers = cfg.companies.map((c) => c.ticker);
  if (tickers.length !== 5) errors.push('need 5 companies');
  if (!cfg.companies.some((c) => c.sector === 'bank')) errors.push('need a bank');
  if (!cfg.companies.some((c) => c.sector === 'mega_cap_tech')) errors.push('need mega-cap tech');
  if (!cfg.companies.some((c) => c.form_family === '20-F')) errors.push('need a 20-F');
  const banned = ['MSFT', 'MU', 'NBIS', 'NVDA', 'LLY', 'AVGO'];
  if (cfg.companies.some((c) => banned.includes(c.ticker))) errors.push('banned real-desk ticker');
  const desks = JSON.parse(readFileSync(path.join(REPO_ROOT, 'memory-cockpit-v2/config/thin-desks.json'), 'utf8'));
  if (!Array.isArray(desks.desks) || desks.desks.length !== 0) errors.push('product desks must stay []');
  for (const [id, desk] of Object.entries(cfg.desks.desks)) {
    for (const card of desk.slices || []) {
      const chk = checkSliceCard(card);
      if (!chk.ok) errors.push(`slice card ${id}: ${chk.errors.join('; ')}`);
    }
  }
  const { scoreItem, scoreYtd, withinTolerance, numbersInText } = scoreMod;
  const scoring = cfg.pilot.scoring;
  if (!withinTolerance(100000000, 100000000, scoring)) errors.push('exact number should pass');
  if (!withinTolerance(100.4e6, 100e6, scoring)) errors.push('0.4% should pass');
  if (withinTolerance(102e6, 100e6, scoring)) errors.push('2% should fail');
  if (!numbersInText('$100 million', scoring.scale_words).includes(100000000)) errors.push('scale parse failed');
  const { key, jobs } = prepareOfflineConstructed(cfg);
  const jpm = key.companies.find((c) => c.company_id === 'jpm');
  if (jpm.tasks.latest_quarter.expect !== 'number' || Number(jpm.tasks.latest_quarter.value) !== 42000000) {
    errors.push(`constructed NII quarter expected 42000000 got ${JSON.stringify(jpm.tasks.latest_quarter)}`);
  }
  const aapl = key.companies.find((c) => c.company_id === 'aapl');
  if (Number(aapl.tasks.latest_quarter.value) !== 100000000) errors.push('constructed revenue quarter');
  if (Number(aapl.tasks.ytd_vs_quarter.ytd.value) !== 190000000) errors.push('constructed ytd');
  if (aapl.tasks.yoy.expect !== 'yoy' || Math.abs(aapl.tasks.yoy.pct - 0.25) > 1e-9) errors.push('constructed yoy 25%');
  const trap = scoreItem({ answer: 'GAP — not a tagged companyfacts metric', gap: true, numbers: [] }, aapl.tasks.trap_untagged, '');
  if (!trap.accuracy || !trap.honest_gap) errors.push('honest gap should pass');
  const trapBad = scoreItem({ answer: 'AI revenue was $12 billion', number: 12e9, gap: false }, aapl.tasks.trap_untagged, 'AI revenue was $12 billion');
  if (!trapBad.hallucination) errors.push('invented trap number should hallucinate');
  const numHit = scoreItem({
    answer: '100000000 for 2025-04-01 to 2025-06-30',
    number: 100000000,
    period_start: '2025-04-01',
    period_end: '2025-06-30',
  }, aapl.tasks.latest_quarter, '100000000 for 2025-04-01 to 2025-06-30');
  if (!numHit.accuracy || !numHit.period_ok) errors.push('numeric+period should pass');
  const ytd = scoreYtd({ answer: 'YTD 190000000 (2025-01-01 to 2025-06-30) vs quarter 100000000 (2025-04-01 to 2025-06-30)' }, aapl.tasks.ytd_vs_quarter, '');
  if (!ytd.accuracy) errors.push('ytd vs quarter should pass');
  const arm0 = jobs.find((j) => j.arm === '0');
  const md0 = readFileSync(path.join(jobsDir(cfg), `${String(arm0.job_id).replace(/[^A-Za-z0-9._+-]+/g, '_')}.md`), 'utf8');
  if (md0.includes('42000000') || md0.includes('190000000') || md0.includes('Tagged SEC companyfacts')) {
    errors.push('arm 0 prompt leaked tagged numbers');
  }
  const arma = jobs.find((j) => j.arm === '0+a');
  const mda = readFileSync(path.join(jobsDir(cfg), `${String(arma.job_id).replace(/[^A-Za-z0-9._+-]+/g, '_')}.md`), 'utf8');
  if (!mda.includes('Tagged SEC companyfacts')) errors.push('0+a should inject tagged facts');
  const { pairedClusterDiff, bootstrapMeanCI } = statsMod;
  const pairs = cfg.companies.map((c) => ({ company_id: c.id, base: 0.4, treat: 0.9 }));
  const diff = pairedClusterDiff(pairs, { draws: 400 });
  if (!(diff.lo > 0)) errors.push('clustered CI should exclude 0 on a 50-pt gap');
  const ci = bootstrapMeanCI([1, 1, 1, 1], { draws: 200 });
  if (ci.lo < 0.9) errors.push('tight CI on all-ones');
  try { assertNoXai(['node', 'run', '--xai']); errors.push('assertNoXai missed --xai'); } catch { /* expected */ }
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log('self-test ok');
  console.log(JSON.stringify({
    companies: tickers,
    constructed_metric_jpm: jpm.metric_id,
    jobs: jobs.length,
    items_per_job: jobs[0].items.length,
  }));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
