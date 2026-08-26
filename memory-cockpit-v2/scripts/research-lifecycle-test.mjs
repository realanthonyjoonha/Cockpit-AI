#!/usr/bin/env node
/**
 * research-lifecycle-test.mjs — mutex, spawn refuse, dead-pid reaper, parallel desks.
 * Uses tmp vault. Does not spawn real grok.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawn } from 'child_process';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-lifecycle-'));
process.env.COCKPIT_VAULT = tmpVault;

const {
  startResearchRun,
  findInFlightRun,
  attachWorker,
  failResearchRun,
  getResearchRun,
  cancelResearchRun,
  patchRunMeta,
  retryResearchRun,
  scanRunMetas,
} = await import(path.join(ROOT, 'server', 'thinResearchRuns.js'));
const { spawnResearchWorker, reconcileRun, PID_DEAD_GRACE_MS } = await import(
  path.join(ROOT, 'server', 'researchRunsWorker.js')
);
const { researchRunDir, attachWorker: aw, findInFlightRun: fif, patchRunMeta: prm, failResearchRun: fr } = await import(
  path.join(ROOT, 'server', 'thinResearchRuns.js')
);

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

console.log('\nresearch lifecycle\n');

const deps = {
  findInFlightRun: fif,
  attachWorker: aw,
  patchRunMeta: prm,
  failResearchRun: fr,
  researchRunDir,
};

// AAA + BBB parallel
const a = startResearchRun('AAA', { job: 'deep_compile' }, { desk: 'aaa' });
const b = startResearchRun('BBB', { job: 'deep_compile' }, { desk: 'bbb' });
if (a.ok && b.ok && a.run_id !== b.run_id) ok('AAA+BBB parallel starts');
else bad('AAA+BBB parallel');

const a2 = startResearchRun('AAA', { job: 'deep_compile' });
if (a2.already_in_flight && a2.run_id === a.run_id) ok('AAA second start same id');
else bad('AAA mutex');

// spawn refuse when pid alive
const sleeper = spawn('sleep', ['30'], { detached: true, stdio: 'ignore' });
sleeper.unref();
attachWorker('AAA', a.run_id, {
  pid: sleeper.pid,
  log: path.join(a.path, 'worker.log'),
});
fs.appendFileSync(path.join(a.path, 'worker.log'), 'alive\n');
const refused = spawnResearchWorker({
  ticker: 'AAA',
  run_id: a.run_id,
  prompt: 'no',
  spawnImpl: () => { throw new Error('must not spawn'); },
  deps,
});
if (refused.already_in_flight) ok('second spawn refused while pid alive');
else bad(`spawn refuse ${JSON.stringify(refused)}`);

try { process.kill(sleeper.pid, 'SIGKILL'); } catch { /* */ }

// dead pid auto-fail after grace
const d = startResearchRun('ZZZZTEST', { job: 'deep_compile' });
attachWorker('ZZZZTEST', d.run_id, { pid: 999999, log: path.join(d.path, 'worker.log') });
patchRunMeta('ZZZZTEST', d.run_id, (m) => ({
  ...m,
  worker: {
    ...(m.worker || {}),
    pid_dead_since: new Date(Date.now() - PID_DEAD_GRACE_MS - 1000).toISOString(),
    heartbeat_at: new Date(Date.now() - 60_000).toISOString(),
  },
}));
const rec = reconcileRun('ZZZZTEST', getResearchRun('ZZZZTEST', d.run_id), {
  ...deps,
  failResearchRun: fr,
});
const after = getResearchRun('ZZZZTEST', d.run_id);
if (after.status === 'failed' || rec.failed) ok('dead pid → failed');
else bad(`dead pid still ${after.status}`);

// started_at old + fresh log → not stalled
const e = startResearchRun('QQQTEST', { job: 'deep_compile' });
const logE = path.join(e.path, 'worker.log');
fs.writeFileSync(logE, 'fresh log\n');
const live = spawn('sleep', ['20'], { detached: true, stdio: 'ignore' });
live.unref();
attachWorker('QQQTEST', e.run_id, { pid: live.pid, log: logE });
patchRunMeta('QQQTEST', e.run_id, (m) => ({
  ...m,
  started_at: new Date(Date.now() - 40 * 60 * 1000).toISOString(),
  worker: { ...(m.worker || {}), heartbeat_at: new Date().toISOString() },
}));
const gotE = getResearchRun('QQQTEST', e.run_id);
if (!gotE.stalled) ok('old started_at + fresh heartbeat not stalled');
else bad('false stall from started_at');
try { process.kill(live.pid, 'SIGKILL'); } catch { /* */ }
cancelResearchRun('QQQTEST', e.run_id);

// retry from failed
const rtry = retryResearchRun('ZZZZTEST', d.run_id, { launch: false });
if (rtry.ok && (rtry.status === 'queued')) ok('retry API from failed → queued');
else bad(`retry ${rtry.error || rtry.status}`);

try { fs.rmSync(tmpVault, { recursive: true, force: true }); } catch { /* */ }
console.log(`\nresearch-lifecycle ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
