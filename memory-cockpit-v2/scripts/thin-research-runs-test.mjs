#!/usr/bin/env node
/**
 * thin-research-runs-test.mjs — Research run archive format gate + start/publish.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-research-'));
process.env.COCKPIT_VAULT = tmpVault;

const {
  listResearchRuns,
  startResearchRun,
  publishResearchRun,
  getResearchRun,
  cancelResearchRun,
  failResearchRun,
  findInFlightRun,
  patchRunMeta,
  attachWorker,
  setThesisCheckpoint,
  researchRunFile,
} = await import(path.join(ROOT, 'server', 'thinResearchRuns.js'));
const {
  validateResearchRunPublish,
  humanJobLabel,
  isThesisReportJob,
  RESEARCH_JOBS,
  researchLane,
  normalizeRegisterScope,
  normalizeRegisterIds,
  resolveThesisRegister,
  normalizeThesisPace,
  defaultThesisOrder,
  orderOmitsRegister,
  skimThesisViolations,
  parseConfigPyOrder,
} = await import(path.join(ROOT, 'server', 'researchRunsSchema.js'));
const { writeResearchRunsAgentSeed } = await import(path.join(ROOT, 'server', 'researchRunsAgentSeed.js'));
const { reconcileRun, ORPHAN_FAIL_MS } = await import(path.join(ROOT, 'server', 'researchRunsWorker.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

console.log('\nthin research runs v1\n');

const emptyList = listResearchRuns('TEST');
if (emptyList.available) bad('empty should not be available');
else ok('empty list');

const started = startResearchRun('TEST', { job: 'deep_compile' }, { desk: 'test' });
if (!started.ok || !started.run_id) bad(`start ${started.error}`);
else ok(`start run ${started.run_id}`);

const runId = started.run_id;
const mid = getResearchRun('TEST', runId);
if (!mid.available || mid.status !== 'queued') bad(`queued status got ${mid.status}`);
else ok('GET queued run (no worker yet)');

const againStart = startResearchRun('TEST', { job: 'deep_compile' }, { desk: 'test' });
if (!againStart.already_in_flight || againStart.run_id !== runId) bad('same-desk mutex');
else ok('second start returns already_in_flight same run_id');

const goodBody = {
  schema_version: 1,
  run_id: runId,
  ticker: 'TEST',
  job: 'deep_compile',
  status: 'complete',
  summary: 'TEST Co makes widgets. Load-bearing: growth in data center, margin stable, concentration risk on top customers.',
  sources: [
    {
      id: 'src_1',
      title: 'Form 10-K',
      kind: '10-K',
      as_of: '2026-01-25',
      url: 'https://example.com/10k',
      grade_hint: 'A',
    },
  ],
  financials: [
    {
      text: 'FY2026 revenue was $10 billion',
      as_of: '2026-01-25',
      grade: 'A',
      source_ids: ['src_1'],
      layer_hint: 'pack_actual',
    },
  ],
  risks: [
    {
      text: 'Customer concentration is a material risk',
      as_of: '2026-01-25',
      grade: 'B',
      source_ids: ['src_1'],
    },
  ],
  narrative: [
    {
      text: 'Company is a fabless designer of chips for AI infrastructure',
      as_of: '2026-01-25',
      grade: 'B',
      source_ids: ['src_1'],
    },
  ],
  guide: [],
  gaps: ['No consensus estimates from public sources'],
};

if (!validateResearchRunPublish(goodBody, { ticker: 'TEST', run_id: runId }).ok) {
  bad('validate good');
} else ok('validate complete publish');

const advice = {
  ...goodBody,
  summary: 'You should buy this stock immediately for huge gains',
};
if (validateResearchRunPublish(advice, { ticker: 'TEST', run_id: runId }).ok) bad('advice');
else ok('advice language rejected');

const pub = publishResearchRun('TEST', runId, goodBody, { desk: 'test' });
if (!pub.ok || pub.status !== 'complete') bad(`publish ${pub.error}`);
else ok('publish complete');

const got = getResearchRun('TEST', runId);
if (!got.available || !got.summary || !got.sources?.length) bad('get complete incomplete');
else ok('GET complete with summary+sources');

const list = listResearchRuns('TEST');
if (!list.available || list.n_runs < 1) bad('list after publish');
else ok(`list n_runs=${list.n_runs}`);

const again = publishResearchRun('TEST', runId, { ...goodBody, summary: 'changed' });
if (again.ok) bad('immutable should reject');
else ok('complete run immutable');

// second run
const s2 = startResearchRun('TEST', { job: 'print_package' });
const pub2 = publishResearchRun('TEST', s2.run_id, {
  ...goodBody,
  run_id: s2.run_id,
  job: 'print_package',
  summary: 'Print package: last quarter sales grew; guide points to continued demand. GAPs noted.',
});
if (!pub2.ok) bad(`pub2 ${pub2.error}`);
else ok('second run publish');

const list2 = listResearchRuns('TEST');
if (list2.n_runs !== 2) bad(`expected 2 runs got ${list2.n_runs}`);
else ok('two runs indexed');

// cancel path (cross-desk parallel hygiene)
const s3 = startResearchRun('TEST', { job: 'deep_compile' });
const c1 = cancelResearchRun('TEST', s3.run_id);
if (!c1.ok || c1.status !== 'cancelled') bad(`cancel running ${c1.error || c1.status}`);
else ok('cancel running run');
const pubAfterCancel = publishResearchRun('TEST', s3.run_id, { ...goodBody, run_id: s3.run_id });
if (pubAfterCancel.ok) bad('publish into cancelled run must be rejected');
else ok('late publish into cancelled run rejected');
const cComplete = cancelResearchRun('TEST', runId);
if (cComplete.ok) bad('cancel of complete run must be rejected');
else ok('cancel of complete run rejected (immutable)');
const list3 = listResearchRuns('TEST');
const cancelledRow = (list3.runs || []).find((r) => r.run_id === s3.run_id);
if (!cancelledRow || cancelledRow.status !== 'cancelled') bad('index shows cancelled status');
else ok('index reflects cancelled');

// attach then fail must not wipe acquired/
const s4 = startResearchRun('TEST', { job: 'deep_compile' });
const acqDir = path.join(s4.path, 'acquired');
fs.mkdirSync(acqDir, { recursive: true });
fs.writeFileSync(path.join(acqDir, 'keep.txt'), 'filing excerpt here for tests 12345\n');
attachWorker('TEST', s4.run_id, { pid: 999998, log: path.join(s4.path, 'worker.log') });
const failed = failResearchRun('TEST', s4.run_id, 'test fail');
if (!failed.ok || failed.status !== 'failed') bad(`failResearchRun ${failed.error}`);
else ok('failResearchRun via patchRunMeta');
if (!fs.existsSync(path.join(acqDir, 'keep.txt'))) bad('fail wiped acquired/');
else ok('fail does not wipe acquired/');
const failPub = publishResearchRun('TEST', s4.run_id, { ...goodBody, run_id: s4.run_id });
if (failPub.ok) bad('publish into failed run must reject');
else ok('publish into failed run rejected');

const failComplete = failResearchRun('TEST', runId, 'should not overwrite complete');
if (failComplete.ok) bad('fail of complete must reject');
else ok('fail of complete rejected (extracts intact)');
const still = getResearchRun('TEST', runId);
if (!still.summary || still.status !== 'complete') bad('complete extracts survived fail attempt');
else ok('complete extracts survived fail attempt');

// thesis_report job (Phase 3) — not deep compile
if (!RESEARCH_JOBS.has('thesis_report')) bad('RESEARCH_JOBS missing thesis_report');
else ok('thesis_report in RESEARCH_JOBS');
if (humanJobLabel('thesis_report') !== 'Thesis report') bad('humanJobLabel thesis');
else ok('humanJobLabel Thesis report');
if (!isThesisReportJob('thesis_report') || isThesisReportJob('deep_compile')) bad('isThesisReportJob');
else ok('isThesisReportJob');
if (researchLane('thesis_report') !== 'reports' || researchLane('deep_compile') !== 'compile') {
  bad('researchLane');
} else ok('researchLane compile vs reports');

if (normalizeRegisterScope('house-only') !== 'skim' || normalizeRegisterScope('ids') !== 'pick') {
  bad('normalizeRegisterScope aliases');
} else ok('normalizeRegisterScope aliases');
if (normalizeRegisterIds('R1, r1, R9; nope!').join(',') !== 'R1,R9') bad('normalizeRegisterIds');
else ok('normalizeRegisterIds dedupes');
const longId = 'lly-r1-tirzepatide-cash-engine-concentration-outgoing-mounjaro-zepbound';
if (normalizeRegisterIds(longId).join(',') !== longId) bad('normalizeRegisterIds dropped pack slug');
else ok('normalizeRegisterIds keeps pack slug');
if (resolveThesisRegister({ register_scope: 'pick' }).register_scope !== 'all') {
  bad('pick with no ids should fall back to all');
} else ok('pick empty → all');

const th = startResearchRun('TEST', { job: 'thesis_report', thesis_mode: 'earnings-update' }, { desk: 'test' });
if (!th.ok || !/_thesis_report_/i.test(th.run_id)) bad(`thesis start id ${th.run_id}`);
else ok(`thesis start ${th.run_id}`);
if (th.thesis?.register_scope !== 'all') bad(`thesis default register ${th.thesis?.register_scope}`);
else ok('thesis default register_scope all');
if (normalizeThesisPace('e2e') !== 'through' || normalizeThesisPace('gated') !== 'stop') {
  bad('normalizeThesisPace aliases');
} else ok('normalizeThesisPace aliases');
if (th.thesis?.thesis_pace !== 'stop') bad(`thesis default pace ${th.thesis?.thesis_pace}`);
else ok('thesis default thesis_pace stop');
if (!th.interactive) bad('thesis start should be interactive (no headless worker)');
else ok('thesis start interactive');
const thDir = th.path;
if (!fs.existsSync(path.join(thDir, 'sections')) || !fs.existsSync(path.join(thDir, 'output'))) {
  bad('thesis folders sections/output');
} else ok('thesis folders sections + output');
const thGet = getResearchRun('TEST', th.run_id);
if (thGet.thesis?.mode !== 'earnings-update' || thGet.thesis?.checkpoint !== 'scope') {
  bad(`thesis GET ${JSON.stringify(thGet.thesis)}`);
} else ok('thesis GET checkpoint scope');

const cp = setThesisCheckpoint('TEST', th.run_id, 'research');
if (!cp.ok || cp.checkpoint !== 'research') bad(`checkpoint ${cp.error}`);
else ok('setThesisCheckpoint research');
const cpBad = setThesisCheckpoint('TEST', runId, 'qa');
if (cpBad.ok) bad('checkpoint on deep_compile must reject');
else ok('checkpoint rejected on non-thesis job');

const dcWhileTh = startResearchRun('TEST', { job: 'deep_compile' }, { desk: 'test' });
if (!dcWhileTh.ok || dcWhileTh.already_in_flight) bad('compile must not be blocked by in-flight thesis');
else ok('compile mutex independent of thesis');
const dcWhileTh2 = startResearchRun('TEST', { job: 'deep_compile' }, { desk: 'test' });
if (!dcWhileTh2.already_in_flight) bad('second compile should mutex');
else ok('compile lane mutex');
const th2 = startResearchRun('TEST', { job: 'thesis_report', thesis_mode: 'deep-dive' }, { desk: 'test' });
if (!th2.already_in_flight) bad('second thesis should mutex');
else ok('reports lane mutex');
if (dcWhileTh.run_id) cancelResearchRun('TEST', dcWhileTh.run_id);
const thPick = startResearchRun('PICKTEST', {
  job: 'thesis_report', thesis_mode: 'deep-dive',
  register_scope: 'pick', register_ids: ['R1', 'R9', 'R1'],
}, { desk: 'picktest' });
if (!thPick.ok || thPick.already_in_flight) bad(`thesis pick start ${thPick.error || 'in flight'}`);
else ok('thesis pick start');
const thPickGet = getResearchRun('PICKTEST', thPick.run_id);
if (thPickGet.thesis?.register_scope !== 'pick' || (thPickGet.thesis?.register_ids || []).join(',') !== 'R1,R9') {
  bad(`thesis pick GET ${JSON.stringify(thPickGet.thesis)}`);
} else ok('thesis pick persist R1,R9');
const seedPick = writeResearchRunsAgentSeed('PICKTEST', {
  mode: 'pipeline', run_id: thPick.run_id, job: 'thesis_report', thesis_mode: 'deep-dive',
  register_scope: 'pick', register_ids: ['R1', 'R9'],
});
const seedTxt = seedPick.ok && seedPick.path ? fs.readFileSync(seedPick.path, 'utf8') : '';
if (!seedTxt.includes('pick — deep only R1, R9') || !seedTxt.includes('House: always on')) {
  bad(`thesis seed missing register scope (${seedPick.error || seedPick.path})`);
} else ok('thesis seed register scope');
const thSkim = startResearchRun('PICKTEST', { job: 'thesis_report', register_scope: 'skim' }, { desk: 'picktest' });
if (!thSkim.already_in_flight) bad('skim should mutex with in-flight pick');
else ok('skim mutex with pick in-flight');
cancelResearchRun('PICKTEST', thPick.run_id);
const thSlug = startResearchRun('SLUGTEST', {
  job: 'thesis_report', register_scope: 'pick', register_ids: [longId],
}, { desk: 'slugtest' });
const thSlugGet = getResearchRun('SLUGTEST', thSlug.run_id);
if (thSlugGet.thesis?.register_scope !== 'pick' || (thSlugGet.thesis?.register_ids || []).join(',') !== longId) {
  bad(`thesis pack slug persist ${JSON.stringify(thSlugGet.thesis)}`);
} else ok('thesis pick persists pack slug');
cancelResearchRun('SLUGTEST', thSlug.run_id);
const thThru = startResearchRun('THRUTEST', {
  job: 'thesis_report', thesis_mode: 'deep-dive', thesis_pace: 'through',
}, { desk: 'thrutest' });
const thThruGet = getResearchRun('THRUTEST', thThru.run_id);
if (thThruGet.thesis?.thesis_pace !== 'through') bad(`thesis through GET ${JSON.stringify(thThruGet.thesis)}`);
else ok('thesis through persist');
const seedThru = writeResearchRunsAgentSeed('THRUTEST', {
  mode: 'pipeline', run_id: thThru.run_id, job: 'thesis_report', thesis_mode: 'deep-dive',
  thesis_pace: 'through',
});
const seedThruTxt = seedThru.ok && seedThru.path ? fs.readFileSync(seedThru.path, 'utf8') : '';
if (!seedThruTxt.includes('Pace: through') && !seedThruTxt.includes('do not wait at Checkpoint')) {
  bad(`thesis through seed missing pace (${seedThru.error || seedThru.path})`);
} else ok('thesis through seed pace');
cancelResearchRun('THRUTEST', thThru.run_id);
const thSkimSeed = startResearchRun('SKIMSEED', {
  job: 'thesis_report', thesis_mode: 'deep-dive', register_scope: 'skim',
}, { desk: 'skimseed' });
const seedSkim = writeResearchRunsAgentSeed('SKIMSEED', {
  mode: 'pipeline', run_id: thSkimSeed.run_id, job: 'thesis_report',
  thesis_mode: 'deep-dive', register_scope: 'skim',
});
const seedSkimTxt = seedSkim.ok && seedSkim.path ? fs.readFileSync(seedSkim.path, 'utf8') : '';
if (!seedSkimTxt.includes('omit `register-updated`') || !seedSkimTxt.includes('No register chapter')) {
  bad(`skim seed still asks for register chapter (${seedSkim.error || 'no match'})`);
} else ok('skim seed omits register chapter');
const skimOrder = defaultThesisOrder('deep-dive', 'skim');
if (!orderOmitsRegister(skimOrder) || skimOrder.includes('register-updated')) {
  bad(`deep-dive skim ORDER ${skimOrder.join(',')}`);
} else ok('deep-dive skim ORDER has no register-updated');
if (!orderOmitsRegister(defaultThesisOrder('earnings-update', 'house-only'))) {
  bad('earnings-update skim still has register');
} else ok('earnings-update skim ORDER omits register');
if (orderOmitsRegister(defaultThesisOrder('deep-dive', 'all'))) {
  bad('deep-dive all lost register-updated');
} else ok('deep-dive all still has register-updated');
if (!seedSkimTxt.includes(skimOrder.join(' · '))) {
  bad('skim seed missing exact ORDER list');
} else ok('skim seed lists exact ORDER');
const skimGet = getResearchRun('SKIMSEED', thSkimSeed.run_id);
if ((skimGet.thesis?.order || []).join(',') !== skimOrder.join(',')) {
  bad(`skim persist ORDER ${JSON.stringify(skimGet.thesis)}`);
} else ok('skim run persists ORDER');

if (parseConfigPyOrder('ORDER = ["setup", "register-updated", "exec"]')?.join(',') !== 'setup,register-updated,exec') {
  bad('parseConfigPyOrder');
} else ok('parseConfigPyOrder');
if (skimThesisViolations({ register_scope: 'skim', order: skimOrder }).length) {
  bad('clean skim ORDER should pass');
} else ok('skimThesisViolations clean ORDER');
if (!skimThesisViolations({
  register_scope: 'skim',
  order: ['setup', 'register-updated', 'exec'],
}).some((e) => /ORDER/.test(e))) {
  bad('bad ORDER not rejected');
} else ok('skimThesisViolations rejects register ORDER');

const skimGate = startResearchRun('SKIMGATE', {
  job: 'thesis_report', thesis_mode: 'deep-dive', register_scope: 'skim',
}, { desk: 'skimgate' });
if (!skimGate?.run_id) bad(`skimgate start ${skimGate?.error}`);
else {
  const gateDir = skimGate.path;
  fs.writeFileSync(path.join(gateDir, 'config.py'), 'ORDER = ["setup", "register-updated", "exec"]\n', 'utf8');
  fs.mkdirSync(path.join(gateDir, 'sections'), { recursive: true });
  fs.writeFileSync(path.join(gateDir, 'sections', 'register-updated.md'), '# register\n', 'utf8');
  const diskHits = skimThesisViolations({
    register_scope: 'skim',
    order: skimOrder,
    runDir: gateDir,
  });
  if (!diskHits.some((e) => /config\.py/.test(e)) || !diskHits.some((e) => /register-updated\.md/.test(e))) {
    bad(`disk skim gate ${JSON.stringify(diskHits)}`);
  } else ok('skimThesisViolations rejects config.py + section file');
  const pubBad = publishResearchRun('SKIMGATE', skimGate.run_id, {
    status: 'complete',
    job: 'thesis_report',
    summary: 'House-only note. Decision-support only.',
    register_scope: 'skim',
    thesis_mode: 'deep-dive',
  }, { desk: 'skimgate' });
  if (pubBad?.ok) bad('publish must fail on skim register chapter');
  else ok('publish refuses skim with register chapter on disk');
  cancelResearchRun('SKIMGATE', skimGate.run_id);
}
cancelResearchRun('SKIMSEED', thSkimSeed.run_id);
const laneComp = listResearchRuns('TEST', { desk: 'test', lane: 'compile' });
const laneRep = listResearchRuns('TEST', { desk: 'test', lane: 'reports' });
if (!laneComp.runs.every((r) => r.job !== 'thesis_report')) bad('compile lane leaked thesis');
else ok('list lane=compile filters thesis');
if (!laneRep.runs.every((r) => r.job === 'thesis_report')) bad('reports lane leaked compile');
else ok('list lane=reports filters compile');

// Live meta.json must beat a stale index.json (thesis PDF closeout without index rebuild).
const stale = startResearchRun('STALETEST', { job: 'thesis_report', thesis_mode: 'deep-dive' }, { desk: 'staletest' });
if (!stale?.ok && !stale?.run_id) bad(`stale start ${stale?.error || 'no run_id'}`);
else {
  const dir = stale.path;
  fs.mkdirSync(path.join(dir, 'output'), { recursive: true });
  fs.writeFileSync(path.join(dir, 'output', 'note.pdf'), '%PDF-1.4\n');
  const mp = path.join(dir, 'meta.json');
  const m = JSON.parse(fs.readFileSync(mp, 'utf8'));
  m.status = 'complete';
  m.finished_at = new Date().toISOString();
  m.error = null;
  m.inputs = { ...(m.inputs || {}), checkpoint: 'closeout' };
  m.thesis = { ...(m.thesis || {}), checkpoint: 'closeout', pdf_rel: 'output/note.pdf' };
  fs.writeFileSync(mp, `${JSON.stringify(m, null, 2)}\n`);
  const ip = path.join(tmpVault, 'cockpit', 'research', 'STALETEST', 'index.json');
  const idx = JSON.parse(fs.readFileSync(ip, 'utf8'));
  idx.runs = (idx.runs || []).map((r) => (
    r.run_id === stale.run_id ? { ...r, status: 'failed', checkpoint: 'qa' } : r
  ));
  fs.writeFileSync(ip, `${JSON.stringify(idx, null, 2)}\n`);
  const liveList = listResearchRuns('STALETEST', { desk: 'staletest', lane: 'reports' });
  const liveRow = (liveList.runs || []).find((r) => r.run_id === stale.run_id);
  if (!liveRow || liveRow.status !== 'complete' || !(liveRow.pdfs || [])[0]) {
    bad(`stale index hid complete thesis (${liveRow?.status} pdfs=${(liveRow?.pdfs || []).join(',')})`);
  } else ok('list overlays live meta over stale index');
}

const now = Date.now();
const oldIso = new Date(now - ORPHAN_FAIL_MS - 60_000).toISOString();
const thOrph = startResearchRun('THORPH', { job: 'thesis_report', thesis_mode: 'deep-dive' }, { desk: 'thorph' });
patchRunMeta('THORPH', thOrph.run_id, (m) => ({ ...m, started_at: oldIso }));
const recTh = reconcileRun('THORPH', getResearchRun('THORPH', thOrph.run_id), {
  patchRunMeta, failResearchRun, findInFlightRun, attachWorker,
}, now);
const thAfter = getResearchRun('THORPH', thOrph.run_id);
if (recTh.failed || thAfter.status === 'failed') bad(`thesis orphan auto-fail ${thAfter.status}`);
else ok('thesis queued + no pid + 15m does not auto-fail');
const thList = listResearchRuns('THORPH', { desk: 'thorph', lane: 'reports' });
const thListRow = (thList.runs || []).find((r) => r.run_id === thOrph.run_id);
if (!thListRow || thListRow.status === 'failed') bad(`thesis list reconcile failed ${thListRow?.status}`);
else ok('list reconcile leaves aged thesis queued');
cancelResearchRun('THORPH', thOrph.run_id);

const dcOrph = startResearchRun('DCORPH', { job: 'deep_compile' }, { desk: 'dcorph' });
patchRunMeta('DCORPH', dcOrph.run_id, (m) => ({ ...m, started_at: oldIso, worker: null }));
const recDc = reconcileRun('DCORPH', getResearchRun('DCORPH', dcOrph.run_id), {
  patchRunMeta, failResearchRun, findInFlightRun, attachWorker,
}, now);
const dcAfter = getResearchRun('DCORPH', dcOrph.run_id);
if (!recDc.failed && dcAfter.status !== 'failed') bad(`compile orphan still ${dcAfter.status}`);
else ok('compile queued + no pid + 15m still auto-fails');

const forbidden = researchRunFile('TEST', th.run_id, '../meta.json');
if (forbidden.ok) bad('researchRunFile must refuse ..');
else ok('researchRunFile refuses path escape');

const thPubBody = {
  schema_version: 1,
  run_id: th.run_id,
  ticker: 'TEST',
  job: 'thesis_report',
  status: 'complete',
  thesis_mode: 'earnings-update',
  checkpoint: 'qa',
  summary: 'Verdict: cash engine prints; succession not started. Decision-support only.',
  sources: [],
  financials: [],
  risks: [],
  narrative: [],
  guide: [],
  gaps: ['Bridge not in this print'],
};
const thVal = validateResearchRunPublish(thPubBody, { ticker: 'TEST', run_id: th.run_id });
if (!thVal.ok) bad(`thesis validate ${thVal.errors?.join('; ')}`);
else ok('thesis complete publish validates without extracts');
const thPack = validateResearchRunPublish(
  { ...thPubBody, promotion: { pack_claims: true } },
  { ticker: 'TEST', run_id: th.run_id },
);
if (thPack.ok) bad('pack_claims on thesis must fail');
else ok('thesis pack_claims rejected');
const thPub = publishResearchRun('TEST', th.run_id, thPubBody, { desk: 'test' });
if (!thPub.ok) bad(`thesis publish ${thPub.error}`);
else ok('thesis publish complete');

try { fs.rmSync(tmpVault, { recursive: true, force: true }); } catch { /* */ }

console.log(`\nthin-research-runs ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
