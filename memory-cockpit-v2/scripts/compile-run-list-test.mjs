#!/usr/bin/env node
/**
 * compile-run-list-test.mjs — Compile list Show recent / Show all.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { visibleCompileRuns } = await import(path.join(ROOT, 'src/pages/thin/compileRunList.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\ncompile run list\n');

const nvda = [
  { run_id: 'a', status: 'complete', n_claims: 46 },
  { run_id: 'b', status: 'cancelled' },
  { run_id: 'c', status: 'complete', n_claims: 63 },
  { run_id: 'd', status: 'complete', n_claims: 0 },
  { run_id: 'e', status: 'complete', n_claims: 0 },
  { run_id: 'f', status: 'complete', n_claims: 0 },
];

const recent = visibleCompileRuns(nvda, { showAll: false });
if (recent.map((r) => r.run_id).join(',') !== 'a,c,d') {
  bad(`recent ${recent.map((r) => r.run_id).join(',')}`);
} else ok('recent = 3 newest complete; cancelled dropped');

const all = visibleCompileRuns(nvda, { showAll: true });
if (all.length !== 6) bad(`showAll ${all.length}`);
else ok('show all keeps archive');

const withCancelSel = visibleCompileRuns(nvda, { showAll: false, selectedId: 'b' });
if (!withCancelSel.some((r) => r.run_id === 'b')) bad('selected cancelled hidden');
else ok('selected cancelled stays visible');

const inflight = visibleCompileRuns(
  [{ run_id: 'q', status: 'queued' }, ...nvda],
  { showAll: false },
);
if (inflight[0].run_id !== 'q' || inflight.length !== 4) {
  bad(`inflight ${inflight.map((r) => r.run_id).join(',')}`);
} else ok('queued plus 3 complete');

if (visibleCompileRuns([], { showAll: false }).length !== 0) bad('empty');
else ok('empty list');

console.log(`\ncompile-run-list ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
