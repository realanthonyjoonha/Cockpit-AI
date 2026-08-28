#!/usr/bin/env node
/**
 * model-read-graph-test.mjs — numbers-graph jail + model_read job lane.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-model-read-'));
process.env.COCKPIT_VAULT = tmpVault;

const {
  buildNumbersGraph,
  parsePriorGuide,
  classifyVsGuide,
  MODEL_READ_ORDER,
  modelReadOrderViolations,
} = await import(path.join(ROOT, 'server', 'modelReadGraph.js'));
const {
  startResearchRun,
  publishResearchRun,
  getResearchRun,
  listResearchRuns,
  cancelResearchRun,
  researchRunFile,
} = await import(path.join(ROOT, 'server', 'thinResearchRuns.js'));
const {
  isModelReadJob,
  researchLane,
  jobMatchesLane,
  humanJobLabel,
  RESEARCH_JOBS,
} = await import(path.join(ROOT, 'server', 'researchRunsSchema.js'));
const { writeResearchRunsAgentSeed } = await import(path.join(ROOT, 'server', 'researchRunsAgentSeed.js'));
const { reconcileRun, ORPHAN_FAIL_MS } = await import(path.join(ROOT, 'server', 'researchRunsWorker.js'));
const { patchRunMeta, failResearchRun, findInFlightRun, attachWorker } = await import(
  path.join(ROOT, 'server', 'thinResearchRuns.js')
);

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

console.log('\nmodel-read graph + job\n');

if (!RESEARCH_JOBS.has('model_read')) bad('RESEARCH_JOBS missing model_read');
else ok('model_read in RESEARCH_JOBS');
if (!isModelReadJob('model_read') || isModelReadJob('thesis_report')) bad('isModelReadJob');
else ok('isModelReadJob');
if (researchLane('model_read') !== 'model') bad('researchLane model');
else ok('researchLane model');
if (jobMatchesLane('model_read', 'compile') || jobMatchesLane('thesis_report', 'model')) {
  bad('lanes leak');
} else ok('compile/reports/model lanes isolated');
if (humanJobLabel('model_read') !== 'Model read') bad('humanJobLabel');
else ok('humanJobLabel Model read');
if (modelReadOrderViolations(['thermometer', 'exec']).length === 0) bad('bad ORDER not rejected');
else ok('ORDER gate rejects extras');
if (modelReadOrderViolations(MODEL_READ_ORDER).length) bad('canonical ORDER failed');
else ok('canonical ORDER ok');

const prior = parsePriorGuide('A · printed above prior $78B ±2% guide [[nvda-fy27q1-pr]]');
if (!prior || prior.mid !== 78 || prior.band_pct !== 2) bad(`parsePriorGuide ${JSON.stringify(prior)}`);
else ok('parsePriorGuide $78B ±2%');
if (classifyVsGuide(81.6, 78, 2) !== 'beat') bad(`classify beat ${classifyVsGuide(81.6, 78, 2)}`);
else ok('81.6 vs 78±2% is beat');
if (classifyVsGuide(78.5, 78, 2) !== 'in-line') bad('in-line');
else ok('inside band is in-line');
if (classifyVsGuide(null, 91, 2) !== 'bar_only') bad('bar_only');
else ok('null actual is bar_only');

const snap = {
  ticker: 'NVDA',
  as_of: '2026-05-20',
  house_touch: 'House is CONFIRMED constructive.',
  assumptions: [
    {
      id: 'fy26_rev', label: 'FY2026 revenue', value: '215.9', unit: '$B',
      source: 'pack', layer: 'pack_actual', note: 'A · +65% YoY',
    },
    {
      id: 'fy26_dc', label: 'FY2026 Data Center revenue', value: '193.7', unit: '$B',
      source: 'pack', layer: 'pack_actual', note: '~90% of co',
    },
    {
      id: 'q1_rev', label: 'Q1 FY2027 revenue', value: '81.6', unit: '$B',
      source: 'pack', layer: 'pack_actual',
      note: 'A · printed above prior $78B ±2% guide [[nvda-fy27q1-pr]]',
    },
    {
      id: 'q2_guide', label: 'Q2 FY2027 revenue guide (mid)', value: '91.0', unit: '$B ±2%',
      source: 'pack', layer: 'pack_guide', note: 'no China DC compute in guide',
    },
    {
      id: 'china_hopper_q1', label: 'Q1 FY27 China Hopper DC shipments', value: '0', unit: '$B',
      source: 'pack', layer: 'pack_actual', note: 'vs $4.6B Hopper DC to China in Q1 FY26',
    },
    {
      id: 'user_dc_growth', label: 'YOUR: DC rev growth (next 4Q)', value: 'GAP', unit: '%',
      source: 'gap', layer: 'user_case',
    },
  ],
  gaps: ['YOUR CASE DC growth still GAP'],
};

const g = buildNumbersGraph(snap, { ticker: 'NVDA' });
if (!g.ok) bad(`graph not ok ${g.reason}`);
else ok('graph ok from snapshot');
const q1 = g.cells.find((c) => c.id === 'q1_rev');
if (!q1 || q1.numeric !== 81.6 || q1.period !== 'Q1 FY2027') bad(`q1 cell ${JSON.stringify(q1)}`);
else ok('q1 cell period + numeric');
const done = g.offset_pairs.find((p) => p.kind === 'completed');
if (!done || done.vs_band !== 'beat' || done.guide_mid !== 78) bad(`completed pair ${JSON.stringify(done)}`);
else ok('completed pair beat vs $78 ±2%');
const bar = g.offset_pairs.find((p) => p.kind === 'open_bar');
if (!bar || bar.vs_band !== 'bar_only' || bar.guide_mid !== 91) bad(`open bar ${JSON.stringify(bar)}`);
else ok('open bar $91 not treated as actual');
if (!g.thermometer.some((t) => t.id === 'q1_rev') || !g.thermometer.some((t) => t.id === 'q2_guide')) {
  bad(`thermometer ${g.thermometer.map((t) => t.id).join(',')}`);
} else ok('thermometer includes print + next bar');
if (!g.still_gap.some((x) => x.id === 'user_dc_growth')) bad('still_gap missing YOUR CASE');
else ok('still_gap lists YOUR CASE');
if (!g.quality_flags.some((f) => f.id === 'china_zero')) bad('china_zero flag');
else ok('china_zero quality flag');
if (!g.quality_flags.some((f) => f.id === 'volume_price_gap')) bad('volume_price_gap');
else ok('volume_price_gap when no ASP');

const emptyG = buildNumbersGraph({ assumptions: [] }, { ticker: 'ZZZ' });
if (emptyG.ok) bad('empty graph should not be ok');
else ok('empty snapshot fail-closed');

const modelDir = path.join(tmpVault, 'cockpit', 'model');
fs.mkdirSync(modelDir, { recursive: true });
fs.writeFileSync(path.join(modelDir, 'NVDA.json'), `${JSON.stringify({
  schema_version: 1,
  ticker: 'NVDA',
  as_of: '2026-05-20',
  assumptions: snap.assumptions,
  bridge: [],
  gaps: snap.gaps,
  disclaimer: 'Decision-support only.',
  status: 'published',
}, null, 2)}\n`);

const started = startResearchRun('NVDA', { job: 'model_read', launch: false }, { desk: 'nvda' });
if (!started.ok || !/_model_read_/i.test(started.run_id)) bad(`start ${started.error} ${started.run_id}`);
else ok(`start ${started.run_id}`);
if (!started.interactive) bad('model_read should be interactive');
else ok('interactive (no headless)');
if (started.model_read?.graph_ok !== true) bad(`graph_ok ${started.model_read?.graph_ok}`);
else ok('start writes graph_ok');
const graphFile = path.join(started.path, 'numbers-graph.json');
if (!fs.existsSync(graphFile)) bad('numbers-graph.json missing on start');
else ok('numbers-graph.json on disk');
if (!fs.existsSync(path.join(started.path, 'sections'))) bad('sections folder');
else ok('sections + output folders');

const fileOk = researchRunFile('NVDA', started.run_id, 'numbers-graph.json');
if (!fileOk.ok) bad(`file allowlist ${fileOk.error}`);
else ok('numbers-graph.json allowlisted');

const seed = writeResearchRunsAgentSeed('NVDA', {
  mode: 'pipeline', run_id: started.run_id, job: 'model_read',
});
const seedTxt = seed.ok && seed.path ? fs.readFileSync(seed.path, 'utf8') : '';
if (!seedTxt.includes('MODEL READ') || !seedTxt.includes('numbers-graph.json') || !seedTxt.includes('/cockpit-model-read')) {
  bad(`seed ${seed.error || 'missing phrases'}`);
} else ok('seed teaches jail + slash');
if (!seedTxt.includes(MODEL_READ_ORDER.join(' · '))) bad('seed missing ORDER');
else ok('seed lists exact ORDER');

const compileWhile = startResearchRun('NVDA', { job: 'deep_compile' }, { desk: 'nvda' });
if (!compileWhile.ok || compileWhile.already_in_flight) bad('compile blocked by model_read');
else ok('compile mutex independent of model_read');
if (compileWhile.run_id) cancelResearchRun('NVDA', compileWhile.run_id);

const thWhile = startResearchRun('NVDA', { job: 'thesis_report' }, { desk: 'nvda' });
if (!thWhile.ok || thWhile.already_in_flight) bad('thesis blocked by model_read');
else ok('thesis mutex independent of model_read');
if (thWhile.run_id) cancelResearchRun('NVDA', thWhile.run_id);

const second = startResearchRun('NVDA', { job: 'model_read' }, { desk: 'nvda' });
if (!second.already_in_flight) bad('second model_read should mutex');
else ok('model lane mutex');

const laneModel = listResearchRuns('NVDA', { desk: 'nvda', lane: 'model' });
const laneComp = listResearchRuns('NVDA', { desk: 'nvda', lane: 'compile' });
const laneRep = listResearchRuns('NVDA', { desk: 'nvda', lane: 'reports' });
if (!laneModel.runs.every((r) => r.job === 'model_read')) bad('lane=model leaked');
else ok('list lane=model');
if (laneComp.runs.some((r) => r.job === 'model_read')) bad('compile leaked model_read');
else ok('compile does not list model_read');
if (laneRep.runs.some((r) => r.job === 'model_read')) bad('reports leaked model_read');
else ok('reports does not list model_read');

const pubNoOut = publishResearchRun('NVDA', started.run_id, {
  status: 'complete',
  job: 'model_read',
  summary: 'Q1 beat the company guide. Next bar is $91B. Decision-support only.',
}, { desk: 'nvda' });
if (pubNoOut.ok) bad('publish without PDF/HTML must fail');
else ok('publish refuses missing output');

fs.mkdirSync(path.join(started.path, 'output'), { recursive: true });
fs.writeFileSync(path.join(started.path, 'output', 'model-read.html'), '<html><body>mock</body></html>');
const pub = publishResearchRun('NVDA', started.run_id, {
  status: 'complete',
  job: 'model_read',
  summary: 'Q1 beat the company $78B ±2% guide. Next bar $91B with China out. Decision-support only.',
}, { desk: 'nvda' });
if (!pub.ok) bad(`publish ${pub.error || JSON.stringify(pub.format_errors)}`);
else ok('publish with HTML');

const got = getResearchRun('NVDA', started.run_id);
if (got.status !== 'complete' || !got.model_read?.pdfs) bad(`GET after publish ${got.status}`);
else ok('GET model_read pdfs');

const now = Date.now();
const oldIso = new Date(now - ORPHAN_FAIL_MS - 60_000).toISOString();
const orph = startResearchRun('ORPHMR', { job: 'model_read' }, { desk: 'orphmr' });
patchRunMeta('ORPHMR', orph.run_id, (m) => ({ ...m, started_at: oldIso }));
const rec = reconcileRun('ORPHMR', getResearchRun('ORPHMR', orph.run_id), {
  patchRunMeta, failResearchRun, findInFlightRun, attachWorker,
}, now);
const after = getResearchRun('ORPHMR', orph.run_id);
if (rec.failed || after.status === 'failed') bad(`model_read orphan auto-fail ${after.status}`);
else ok('model_read queued + no pid + 15m does not auto-fail');
cancelResearchRun('ORPHMR', orph.run_id);

console.log(`\n${pass} passed, ${fail} failed\n`);
if (fail) process.exit(1);
