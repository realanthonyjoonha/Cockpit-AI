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
} = await import(path.join(ROOT, 'server', 'thinResearchRuns.js'));
const {
  validateResearchRunPublish,
} = await import(path.join(ROOT, 'server', 'researchRunsSchema.js'));

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

try { fs.rmSync(tmpVault, { recursive: true, force: true }); } catch { /* */ }

console.log(`\nthin-research-runs ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
