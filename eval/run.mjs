#!/usr/bin/env node
/**
 * LARGE eval runner. Single command: node eval/run.mjs
 * Models run via Cursor Grok 4.6. Never XAI_API_KEY.
 */
import { execSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildAnswerKey, persistAnswerKey } from './lib/answer-key.mjs';
import { buildJobs, persistJobs } from './lib/jobs.mjs';
import {
  assertNoXai, childEnvWithoutXai, EVAL_ROOT, jobsDir, keysDir, loadConfig,
  REPO_ROOT, tracesDir, unsetAndAssertNoXai,
} from './lib/load-config.mjs';
import {
  assertExactGrok46, assertGrok46, collectTraceModels, isGrok46, logModel, REQUIRED_GROK46,
} from './lib/models.mjs';
import { writeReport } from './lib/report.mjs';
import { applyGapSelection, isGapPair, selectGapItems } from './lib/gap-select.mjs';
import { writeGapReport } from './lib/gap-report.mjs';
import { readArmTranscripts } from './lib/gap-read.mjs';
import {
  persistBlindBatch, applyGrades, collectOpenEnded, checkCalibration, scoreDistribution, CALIBRATION,
} from './lib/grader.mjs';
import { persistTrace } from './lib/persist-trace.mjs';
import { extractJsonArray, scoreTrace } from './lib/score.mjs';
import { fetchCompanyfacts, readCachedFacts, writeJson } from './lib/sec.mjs';
import { rollup } from './lib/stats.mjs';
import { countTokens } from './vendor/tokens.mjs';
import { vaultHasForbiddenFigures } from './lib/vault.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));

function gitCommit() {
  try {
    return execSync('git rev-parse HEAD', { cwd: REPO_ROOT, encoding: 'utf8' }).trim();
  } catch {
    return 'unknown';
  }
}

function parseArgs(argv) {
  const raw = argv.slice(2);
  const args = new Set(raw);
  const persistAt = raw.indexOf('--persist');
  return {
    selfTest: args.has('--self-test'),
    prepare: args.has('--prepare') || args.size === 0 || args.has('--all'),
    score: args.has('--score') || args.size === 0 || args.has('--all'),
    report: args.has('--report') || args.size === 0 || args.has('--all'),
    jobsOnly: args.has('--jobs'),
    offline: args.has('--offline'),
    persistJob: persistAt >= 0 ? raw[persistAt + 1] : null,
    persistPath: persistAt >= 0 ? raw[persistAt + 2] : null,
    gapCheck: args.has('--gap-check') || args.has('--gap'),
  };
}

function assertConfiguredModels(cfg) {
  assertExactGrok46([cfg.pilot.models.subject, cfg.pilot.models.grader], 'configured subject/grader');
}

export async function prepareLive(cfg) {
  assertNoXai();
  assertConfiguredModels(cfg);
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
  let selection = null;
  if (cfg.mode === 'gap') {
    selection = applyGapSelection(cfg, key);
    writeJson(path.join(keysDir(cfg), 'gap-selection.json'), selection);
  }
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
    grader: cfg.pilot.models.grader,
    xai_key_used: false,
    on_demand: false,
    mode: cfg.mode,
    gap_items: selection?.n ?? null,
  };
  writeJson(path.join(keysDir(cfg), 'pin.json'), pin);
  writeJson(path.join(jobsDir(cfg), 'pin.json'), { git_commit: pin.git_commit, fetched_at: pin.fetched_at, model: pin.model });
  return { key, jobs, index, pin, keyPath };
}

export function prepareOfflineConstructed(cfg, destDir = path.join(EVAL_ROOT, 'results-offline')) {
  const isolated = {
    ...cfg,
    pilot: { ...cfg.pilot, paths: { ...cfg.pilot.paths, results: path.relative(EVAL_ROOT, destDir) } },
    gapItems: cfg.gapItems,
  };
  const doc = JSON.parse(readFileSync(path.join(EVAL_ROOT, 'fixtures/constructed-companyfacts.json'), 'utf8'));
  const docs = {};
  for (const company of cfg.companies) docs[company.ticker] = doc;
  const key = buildAnswerKey(docs, isolated);
  let selection = null;
  if (isolated.mode === 'gap') {
    selection = applyGapSelection(isolated, key);
    cfg.gapItems = isolated.gapItems;
  }
  persistAnswerKey(key, isolated);
  const jobs = buildJobs(key, isolated);
  persistJobs(jobs, isolated);
  return { key, jobs, selection };
}

function loadKey(cfg) {
  const dest = path.join(keysDir(cfg), 'answer-key.json');
  if (!existsSync(dest)) throw new Error('no answer key — run node eval/run.mjs --prepare');
  return JSON.parse(readFileSync(dest, 'utf8'));
}

function loadTraces(cfg) {
  const dir = tracesDir(cfg);
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith('.json')).map((f) => {
    const trace = JSON.parse(readFileSync(path.join(dir, f), 'utf8'));
    logModel(trace);
    assertExactGrok46(trace.model, `trace ${trace.job_id || f}`);
    return trace;
  });
}

function markSpotCheck(scored, cfg) {
  const open = scored.filter((r) => r.question_id === 'risk_propose' || r.question_id === 'steelman');
  const want = cfg.pilot.scoring.spot_check_n || Math.max(1, Math.round(open.length * (cfg.pilot.scoring.spot_check_rate || 0.1)));
  const n = Math.min(24, Math.max(1, want));
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
    scored.push(...scoreTrace({ ...trace, item_ids: itemIds, answers: rawAnswers }, key, cfg));
  }
  const selPath = path.join(keysDir(cfg), 'gap-selection.json');
  if (existsSync(selPath)) {
    const selection = JSON.parse(readFileSync(selPath, 'utf8'));
    cfg.gapItems = selection.items;
  }
  let graded = scored;
  const open = collectOpenEnded(scored, cfg);
  const blind = persistBlindBatch(open, cfg);
  const gradePath = path.join(keysDir(cfg), '..', 'grader', 'grades.json');
  let calibration = null;
  if (existsSync(gradePath)) {
    const gradesDoc = JSON.parse(readFileSync(gradePath, 'utf8'));
    const grades = Array.isArray(gradesDoc) ? gradesDoc : gradesDoc.items || [];
    if (gradesDoc.model) assertExactGrok46(gradesDoc.model, 'grader grades.json');
    graded = applyGrades(scored, grades, blind.map);
    calibration = checkCalibration(grades, blind.map);
    writeJson(path.join(keysDir(cfg), '..', 'grader', 'calibration.json'), calibration);
  }
  const rolled = rollup(graded, traces, cfg);
  const spot = markSpotCheck(graded, cfg);
  const distribution = scoreDistribution(graded, cfg);
  const models = collectTraceModels(traces);
  writeJson(path.join(keysDir(cfg), '..', 'scored.json'), { n: graded.length, items: graded });
  writeJson(path.join(keysDir(cfg), '..', 'rollup.json'), rolled);
  writeJson(path.join(keysDir(cfg), '..', 'spot-check.json'), spot);
  writeJson(path.join(keysDir(cfg), '..', 'distribution.json'), distribution);
  return { key, traces, scored: graded, rolled, spot, blind, calibration, distribution, models };
}

export function quoteFrom(traces) {
  return {
    tokens_in: traces.reduce((s, t) => s + (t.prompt_tokens || 0), 0),
    tokens_out: traces.reduce((s, t) => s + (t.completion_tokens || 0), 0),
    tokens_cached: traces.reduce((s, t) => s + (t.cached_tokens || 0), 0),
    n_traces: traces.length,
    n_items: traces.reduce((s, t) => s + (t.item_ids?.length || 0), 0),
  };
}

export function emitReport(payload, cfg) {
  if (cfg.mode === 'gap' || cfg.pilot?.mode === 'gap') return writeGapReport(payload, cfg);
  return writeReport(payload, cfg);
}

async function main() {
  unsetAndAssertNoXai();
  childEnvWithoutXai();
  const args = parseArgs(process.argv);
  const cfg = loadConfig();
  assertConfiguredModels(cfg);
  mkdirSync(path.join(HERE, 'results'), { recursive: true });

  if (args.persistJob) {
    const raw = readFileSync(args.persistPath, 'utf8');
    const dest = persistTrace(args.persistJob, raw, { latency_ms: 0, model: cfg.pilot.models.subject });
    console.log(JSON.stringify({ persisted: dest, model: cfg.pilot.models.subject }, null, 2));
    return;
  }

  if (args.selfTest) {
    const scoreMod = await import('./lib/score.mjs');
    const statsMod = await import('./lib/stats.mjs');
    globalThis.__score = scoreMod;
    globalThis.__stats = statsMod;
    if (args.gapCheck || cfg.mode === 'gap') gapSelfTest();
    else selfTestPatched();
    return;
  }

  if (args.jobsOnly || args.prepare) {
    if (args.offline) {
      const { jobs } = prepareOfflineConstructed(cfg);
      console.log(JSON.stringify({ mode: 'offline', jobs: jobs.length, model: cfg.pilot.models.subject }, null, 2));
    } else {
      const out = await prepareLive(cfg);
      console.log(JSON.stringify({
        mode: 'prepare',
        fetched_at: out.pin.fetched_at,
        git_commit: out.pin.git_commit,
        jobs: out.index.length,
        items: out.pin.n_items,
        key: out.keyPath,
        model: out.pin.model,
      }, null, 2));
    }
  }

  const haveTraces = existsSync(tracesDir(cfg)) && readdirSync(tracesDir(cfg)).some((f) => f.endsWith('.json'));
  if ((args.score || args.report) && haveTraces) {
    const { traces, scored, rolled, spot, key, calibration, distribution, models } = scoreAll(cfg);
    const pin = existsSync(path.join(keysDir(cfg), 'pin.json'))
      ? JSON.parse(readFileSync(path.join(keysDir(cfg), 'pin.json'), 'utf8'))
      : { git_commit: gitCommit(), fetched_at: key.fetched_at };
    const quote = quoteFrom(traces);
    const selPath = path.join(keysDir(cfg), 'gap-selection.json');
    const selection = existsSync(selPath) ? JSON.parse(readFileSync(selPath, 'utf8')) : null;
    const reads = cfg.mode === 'gap'
      ? cfg.arms.map((a) => readArmTranscripts(scored, a.id))
      : [];
    const callLogPath = path.join(keysDir(cfg), '..', 'model-calls.json');
    const callLog = existsSync(callLogPath) ? JSON.parse(readFileSync(callLogPath, 'utf8')) : null;
    const report = emitReport({
      meta: { ...pin, n_traces: traces.length, n_items: scored.length, models: models.models },
      rollup: rolled,
      spotCheck: spot,
      quote,
      calibration,
      distribution,
      models: { ...models, grader: cfg.pilot.models.grader },
      selection,
      reads,
      callLog,
      scored,
      traces,
    }, cfg);
    writeJson(path.join(keysDir(cfg), '..', 'quote.json'), quote);
    console.log(JSON.stringify({
      scored: scored.length,
      traces: traces.length,
      report,
      quote,
      model: cfg.pilot.models.subject,
      calibration_ok: calibration ? calibration.ok : null,
    }, null, 2));
    if (calibration && !calibration.ok) {
      throw new Error('HARD FAIL: grader could not separate seeded-bad from good. See eval/results/grader/calibration.json');
    }
  } else if (args.score || args.report) {
    console.log('no traces yet — write Cursor Grok 4.6 replies to eval/results/traces/<job_id>.json then rerun node eval/run.mjs --score');
  }
}

function gapSelfTest() {
  const scoreMod = globalThis.__score;
  const cfg = loadConfig();
  const errors = [];
  try {
    unsetAndAssertNoXai(['node', 'eval/run.mjs', '--gap-check', '--self-test']);
    childEnvWithoutXai();
  } catch (err) {
    errors.push(`xai: ${err.message}`);
  }
  try {
    assertExactGrok46([cfg.pilot.models.subject, cfg.pilot.models.grader], 'gap models');
  } catch (err) {
    errors.push(`exact pin: ${err.message}`);
  }
  try {
    assertExactGrok46('grok-4.6-high-fast', 'probe-alias');
    errors.push('assertExactGrok46 accepted a non-exact Grok id');
  } catch { /* expected — exact pin is cursor-grok-4.6-high-fast */ }
  try {
    assertExactGrok46('gpt-5.6-sol-high-fast', 'probe');
    errors.push('assertExactGrok46 missed gpt');
  } catch { /* expected */ }
  const armIds = cfg.arms.map((a) => a.id);
  if (armIds.join(',') !== '0+a,full') errors.push(`gap arms should be 0+a,full got ${armIds}`);
  if (cfg.pilot.repeats !== 3) errors.push(`gap repeats should be 3, got ${cfg.pilot.repeats}`);
  if (cfg.mode !== 'gap') errors.push('mode should be gap');
  const desks = JSON.parse(readFileSync(path.join(REPO_ROOT, 'memory-cockpit-v2/config/thin-desks.json'), 'utf8'));
  if (!Array.isArray(desks.desks) || desks.desks.length !== 0) errors.push('product desks must stay []');
  const { key, jobs, selection } = prepareOfflineConstructed(cfg);
  if (!selection || selection.n < 8 || selection.n > 12) {
    errors.push(`selection size ${selection?.n} not in 8–12`);
  }
  const ids = new Set(selection.items.map((i) => i.item_id));
  if (ids.size !== selection.n) errors.push('duplicate selected items');
  for (const it of selection.items) {
    const companyKey = key.companies.find((c) => c.company_id === it.company_id);
    const desk = cfg.desks.desks[it.company_id];
    const ask = cfg.questions.questions.find((q) => q.id === it.question_id);
    if (!isGapPair(companyKey, desk, ask)) errors.push(`selected ${it.item_id} fails isGapPair`);
    const spec = companyKey.tasks[it.question_id];
    if (spec?.expect !== 'gap') errors.push(`task ${it.item_id} expect should be gap`);
  }
  const expectedJobs = cfg.arms.length * cfg.pilot.repeats;
  if (jobs.length !== expectedJobs) errors.push(`expected ${expectedJobs} jobs, got ${jobs.length}`);
  const perJob = selection.n;
  if (jobs.some((j) => j.items.length !== perJob)) {
    errors.push(`each job should have ${perJob} items`);
  }
  if (jobs.some((j) => j.model !== REQUIRED_GROK46)) errors.push('job model is not exact pin');
  const tagged = JSON.parse(JSON.stringify(key));
  const first = tagged.companies[0];
  first.slots_summary = first.slots_summary || {};
  first.slots_summary.rpo_backlog = { values: [{ span: 'instant', value: 1 }] };
  const blocked = selectGapItems(tagged, { ...cfg, gapItems: null });
  const leaked = blocked.items.find((i) => i.company_id === first.company_id && i.question_id === 'rpo_backlog');
  if (leaked) errors.push('rule kept rpo_backlog after the slot was tagged');
  const desk = cfg.desks.desks[cfg.companies[0].id];
  const packBlocked = isGapPair(first, { ...desk, implied_multiple: '12x' }, cfg.questions.questions.find((q) => q.id === 'house_implied_multiple'));
  if (packBlocked) errors.push('rule kept house_implied_multiple after pack field was populated');
  const { scoreItem, numbersInText } = scoreMod;
  const scales = cfg.pilot.scoring.scale_words;
  if ((numbersInText('GAP accession 0000070858-26-000394', scales) || []).length) {
    errors.push('accession ids must not parse as figures');
  }
  if ((numbersInText('annual 20-F basis', scales) || []).length) {
    errors.push('form tokens such as 20-F must not parse as figures');
  }
  const gapOk = scoreItem({ answer: 'GAP — not tagged', gap: true, numbers: [] }, { expect: 'gap' }, 'GAP — not tagged');
  if (!gapOk.accuracy || !gapOk.honest_gap) errors.push('honest gap should pass');
  const gapBad = scoreItem({ answer: 'headcount was 50000', number: 50000, gap: false }, { expect: 'gap' }, 'headcount was 50000');
  if (!gapBad.hallucination) errors.push('invented gap number should hallucinate');
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log('gap-check self-test ok');
  console.log(JSON.stringify({
    mode: 'gap',
    model: cfg.pilot.models.subject,
    grader: cfg.pilot.models.grader,
    arms: armIds,
    selected: selection.items.map((i) => i.item_id),
    jobs: jobs.length,
    items_per_job: jobs[0].items.length,
    xai_key: Object.prototype.hasOwnProperty.call(process.env, 'XAI_API_KEY'),
  }));
}

function selfTestPatched() {
  const scoreMod = globalThis.__score;
  const statsMod = globalThis.__stats;
  const cfg = loadConfig();
  const errors = [];
  try {
    assertConfiguredModels(cfg);
  } catch (err) {
    errors.push(`configured models: ${err.message}`);
  }
  if (!isGrok46(cfg.pilot.models.subject) || !isGrok46(cfg.pilot.models.grader)) {
    errors.push('subject and grader must be Grok 4.6');
  }
  try {
    assertGrok46('gpt-5.6-sol-high-fast', 'probe');
    errors.push('assertGrok46 missed gpt-5.6');
  } catch { /* expected */ }
  try {
    assertGrok46('claude-opus-5-5-high', 'probe');
    errors.push('assertGrok46 missed claude');
  } catch { /* expected */ }
  try {
    assertGrok46('gemini-3.8-flash-low', 'probe');
    errors.push('assertGrok46 missed gemini');
  } catch { /* expected */ }
  if (cfg.pilot.models.subject !== REQUIRED_GROK46 && !isGrok46(cfg.pilot.models.subject)) {
    errors.push('subject model id is not Grok 4.6');
  }
  const tickers = cfg.companies.map((c) => c.ticker);
  if (tickers.length !== 10) errors.push(`need 10 companies, got ${tickers.length}`);
  const sectors = new Set(cfg.companies.map((c) => c.sector));
  const forms = new Set(cfg.companies.map((c) => c.form_family));
  const caps = new Set(cfg.companies.map((c) => c.cap));
  if (!sectors.has('bank')) errors.push('need a bank');
  if (!sectors.has('insurer') && !sectors.has('reit')) errors.push('need an insurer or REIT');
  if (!sectors.has('energy')) errors.push('need energy');
  if (!forms.has('20-F')) errors.push('need a 20-F IFRS filer');
  if (!caps.has('small')) errors.push('need a small-cap');
  const banned = ['MSFT', 'MU', 'NBIS', 'NVDA', 'LLY', 'AVGO'];
  if (cfg.companies.some((c) => banned.includes(c.ticker))) errors.push('banned real-desk ticker');
  const armIds = cfg.arms.map((a) => a.id);
  if (armIds.some((id) => ['0+d', '0+e', '0+f'].includes(id))) errors.push('closed-PR arms 0+d/0+e/0+f must be dropped');
  if (armIds.join(',') !== '0,0+a,0+b,0+c,full') errors.push(`arms should be 0,0+a,0+b,0+c,full got ${armIds}`);
  const full = cfg.arms.find((a) => a.id === 'full');
  const inj = [...(full?.inject || [])].sort().join(',');
  if (inj !== 'facts,guardrails,vault') errors.push(`full inject should be facts+vault+guardrails, got ${inj}`);
  if ((full?.inject || []).some((x) => ['background', 'slices', 'tools_core'].includes(x))) {
    errors.push('full must not inject dropped background/slices/tools');
  }
  const desks = JSON.parse(readFileSync(path.join(REPO_ROOT, 'memory-cockpit-v2/config/thin-desks.json'), 'utf8'));
  if (!Array.isArray(desks.desks) || desks.desks.length !== 0) errors.push('product desks must stay []');
  const vaultSrc = readFileSync(path.join(HERE, 'lib/vault.mjs'), 'utf8');
  for (const t of tickers) {
    if (new RegExp(`['"]${t}['"]`).test(vaultSrc)) errors.push(`vault.mjs hard-codes ticker ${t}`);
  }
  for (const company of cfg.companies) {
    const desk = cfg.desks.desks[company.id];
    if (!desk) {
      errors.push(`missing generated desk ${company.id}`);
      continue;
    }
    const fig = vaultHasForbiddenFigures(desk);
    if (!fig.ok) errors.push(`vault figures ${company.id}: ${fig.hits[0]}`);
    if (!desk.house.includes(desk.house_canary)) errors.push(`vault missing canary ${company.id}`);
    if (!/named watch/i.test(desk.house)) errors.push(`vault missing watch language ${company.id}`);
  }
  const { scoreItem, scoreYtd, withinTolerance, numbersInText } = scoreMod;
  const scoring = cfg.pilot.scoring;
  if (!withinTolerance(100000000, 100000000, scoring)) errors.push('exact number should pass');
  if (!withinTolerance(100.4e6, 100e6, scoring)) errors.push('0.4% should pass');
  if (withinTolerance(102e6, 100e6, scoring)) errors.push('2% should fail');
  if (!numbersInText('$100 million', scoring.scale_words).includes(100000000)) errors.push('scale parse failed');
  const { key, jobs } = prepareOfflineConstructed(cfg);
  const isolated = {
    ...cfg,
    pilot: { ...cfg.pilot, paths: { ...cfg.pilot.paths, results: 'results-offline' } },
  };
  const bankCo = cfg.companies.find((c) => c.sector === 'bank');
  const revCo = cfg.companies.find((c) => c.sector !== 'bank' && (c.preferred_metrics || [])[0] === 'company_revenue');
  const bank = key.companies.find((c) => c.company_id === bankCo.id);
  const rev = key.companies.find((c) => c.company_id === revCo.id);
  if (bank.tasks.latest_quarter.expect !== 'number' || Number(bank.tasks.latest_quarter.value) !== 42000000) {
    errors.push(`constructed NII quarter expected 42000000 got ${JSON.stringify(bank.tasks.latest_quarter)}`);
  }
  if (Number(rev.tasks.latest_quarter.value) !== 100000000) errors.push('constructed revenue quarter');
  if (Number(rev.tasks.ytd_vs_quarter.ytd.value) !== 190000000) errors.push('constructed ytd');
  if (rev.tasks.yoy.expect !== 'yoy' || Math.abs(rev.tasks.yoy.pct - 0.25) > 1e-9) errors.push('constructed yoy 25%');
  const trap = scoreItem({ answer: 'GAP — not a tagged companyfacts metric', gap: true, numbers: [] }, rev.tasks.trap_untagged, '');
  if (!trap.accuracy || !trap.honest_gap) errors.push('honest gap should pass');
  const trapBad = scoreItem({ answer: 'AI revenue was $12 billion', number: 12e9, gap: false }, rev.tasks.trap_untagged, 'AI revenue was $12 billion');
  if (!trapBad.hallucination) errors.push('invented trap number should hallucinate');
  const numHit = scoreItem({
    answer: '100000000 for 2025-04-01 to 2025-06-30',
    number: 100000000,
    period_start: '2025-04-01',
    period_end: '2025-06-30',
  }, rev.tasks.latest_quarter, '100000000 for 2025-04-01 to 2025-06-30');
  if (!numHit.accuracy || !numHit.period_ok) errors.push('numeric+period should pass');
  const ytd = scoreYtd({ answer: 'YTD 190000000 (2025-01-01 to 2025-06-30) vs quarter 100000000 (2025-04-01 to 2025-06-30)' }, rev.tasks.ytd_vs_quarter, '');
  if (!ytd.accuracy) errors.push('ytd vs quarter should pass');
  const mixed = scoreYtd(
    { answer: 'Quarter 100000000 for 2025-04-01 to 2025-06-30. GAP: YTD span is not tagged.', number: 100000000, gap: true },
    { quarter: { value: 100000000, start: '2025-04-01', end: '2025-06-30' }, ytd: { expect: 'gap' } },
    '',
  );
  if (!mixed.accuracy || !mixed.honest_gap) errors.push('mixed YTD gap should pass when quarter hits');
  const mixedBad = scoreYtd(
    { answer: 'YTD 201000000 and quarter 116000000', number: 201000000, gap: false },
    { quarter: { value: 85138000000, start: '2025-04-01', end: '2025-06-30' }, ytd: { expect: 'gap' } },
    '',
  );
  if (mixedBad.accuracy || !mixedBad.hallucination) errors.push('invented YTD on untagged span should hallucinate');
  const arm0 = jobs.find((j) => j.arm === '0');
  const md0 = readFileSync(path.join(jobsDir(isolated), `${String(arm0.job_id).replace(/[^A-Za-z0-9._+-]+/g, '_')}.md`), 'utf8');
  if (md0.includes('42000000') || md0.includes('190000000') || md0.includes('Tagged SEC companyfacts')) {
    errors.push('arm 0 prompt leaked tagged numbers');
  }
  const arma = jobs.find((j) => j.arm === '0+a');
  const mda = readFileSync(path.join(jobsDir(isolated), `${String(arma.job_id).replace(/[^A-Za-z0-9._+-]+/g, '_')}.md`), 'utf8');
  if (!mda.includes('Tagged SEC companyfacts')) errors.push('0+a should inject tagged facts');
  const armb = jobs.find((j) => j.arm === '0+b');
  const mdb = readFileSync(path.join(jobsDir(isolated), `${String(armb.job_id).replace(/[^A-Za-z0-9._+-]+/g, '_')}.md`), 'utf8');
  if (/\b\d{3,}\b/.test(mdb.replace(/\d{4}-\d{2}-\d{2}/g, '')) && /\$\d/.test(mdb)) {
    errors.push('0+b vault prompt leaked figures');
  }
  if (!mdb.includes('CANARY-HOUSE-')) errors.push('0+b should inject generated house canary');
  const expectedJobs = cfg.arms.length * cfg.pilot.repeats * Math.ceil(cfg.companies.length / (cfg.pilot.shard_companies || cfg.companies.length));
  if (jobs.length !== expectedJobs) errors.push(`expected ${expectedJobs} jobs, got ${jobs.length}`);
  if (jobs[0].model !== cfg.pilot.models.subject) errors.push('job model is not configured subject');
  const { pairedClusterDiff, bootstrapMeanCI } = statsMod;
  const pairs = cfg.companies.map((c) => ({ company_id: c.id, base: 0.4, treat: 0.9 }));
  const diff = pairedClusterDiff(pairs, { draws: 400 });
  if (!(diff.lo > 0)) errors.push('clustered CI should exclude 0 on a 50-pt gap');
  const ci = bootstrapMeanCI([1, 1, 1, 1], { draws: 200 });
  if (ci.lo < 0.9) errors.push('tight CI on all-ones');
  const goodGrades = CALIBRATION.map((c, i) => ({
    grade_id: `G-CAL-${String(i + 1).padStart(2, '0')}`,
    rubric: c.kind === 'bad' ? 1 : 5,
    cite: c.kind === 'bad' ? c.flaw : '',
  }));
  const calMap = CALIBRATION.map((c, i) => ({
    grade_id: `G-CAL-${String(i + 1).padStart(2, '0')}`,
    calibration: true,
    cal_id: c.cal_id,
    kind: c.kind,
    max_rubric: c.max_rubric ?? null,
    min_rubric: c.min_rubric ?? null,
  }));
  const passCal = checkCalibration(goodGrades, calMap);
  if (!passCal.ok) errors.push(`calibration should pass on separated scores: ${passCal.failures[0]?.reason}`);
  const badGrades = CALIBRATION.map((c, i) => ({
    grade_id: `G-CAL-${String(i + 1).padStart(2, '0')}`,
    rubric: 5,
    cite: '',
  }));
  const failCal = checkCalibration(badGrades, calMap);
  if (failCal.ok) errors.push('calibration should fail when every seeded-bad scores 5');
  try { assertNoXai(['node', 'run', '--xai']); errors.push('assertNoXai missed --xai'); } catch { /* expected */ }
  if (errors.length) {
    for (const e of errors) console.error(`✗ ${e}`);
    process.exit(1);
  }
  console.log('self-test ok');
  console.log(JSON.stringify({
    companies: tickers,
    constructed_metric_bank: bank.metric_id,
    jobs: jobs.length,
    items_per_job: jobs[0].items.length,
    model: cfg.pilot.models.subject,
    grader: cfg.pilot.models.grader,
    arms: armIds,
  }));
}

const invoked = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invoked) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
