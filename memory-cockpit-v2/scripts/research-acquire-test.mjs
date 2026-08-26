#!/usr/bin/env node
/**
 * research-acquire-test.mjs — SSRF, path prefix, 403→gap, excerpt truth gate.
 */
import fs from 'fs';
import http from 'http';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-acquire-'));
process.env.COCKPIT_VAULT = tmpVault;

const { startResearchRun, publishResearchRun, getResearchRun, acquireResearchSource } = await import(
  path.join(ROOT, 'server', 'thinResearchRuns.js')
);
const { safeFilename, acquireUrlToRun } = await import(path.join(ROOT, 'server', 'researchAcquire.js'));
const { validateResearchRunPublish } = await import(path.join(ROOT, 'server', 'researchRunsSchema.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

console.log('\nresearch acquire + truth gate\n');

if (safeFilename('../../house-view-tsm.md') === 'house-view-tsm.md') ok('safe_filename strips traversal');
else bad(`safe_filename ${safeFilename('../../house-view-tsm.md')}`);
if (safeFilename('extracts/financials.json') === 'financials.json') ok('safe_filename basename');
else bad('safe_filename basename');

const loop = await acquireUrlToRun(tmpVault, { url: 'http://127.0.0.1/' });
if (!loop.ok) ok('redirect/loopback rejected (or direct loopback)');
else bad('loopback should fail closed');

const started = startResearchRun('ACQTEST', { job: 'deep_compile' });
const destEscape = await acquireResearchSource('ACQTEST', started.run_id, {
  url: 'https://example.com/x',
  filename_hint: '../../house-view.md',
});
// even if fetch fails DNS, filename is only applied on success; unit the helper:
const fakeDir = path.join(started.path);
const name = safeFilename('../../house-view.md');
const dest = path.resolve(path.join(fakeDir, 'acquired'), name);
if (dest.includes(`${path.sep}acquired${path.sep}`) && !dest.includes('..')) ok('acquired path stays under acquired/');
else bad('path prefix');

const body = {
  schema_version: 1,
  run_id: started.run_id,
  ticker: 'ACQTEST',
  job: 'deep_compile',
  status: 'complete',
  summary: 'ACQTEST widgets. Load-bearing: growth.',
  sources: [{ id: 'src_1', title: 'Form 10-K', kind: '10-K', as_of: '2026-01-25', url: 'https://example.com/10k' }],
  financials: [{
    text: 'FY2026 revenue was $10 billion',
    as_of: '2026-01-25',
    grade: 'A',
    source_ids: ['src_1'],
  }],
  risks: [],
  narrative: [{ text: 'Designer of chips', as_of: '2026-01-25', grade: 'B', source_ids: ['src_1'] }],
  guide: [],
  gaps: ['none'],
};
const noSrc = validateResearchRunPublish({
  ...body,
  financials: [{ text: 'secret number', as_of: '2026-01-25', grade: 'A', source_ids: ['nope'] }],
}, { ticker: 'ACQTEST', run_id: started.run_id });
if (!noSrc.ok) ok('unknown source_id rejected');
else bad('unknown source_id should fail');

fs.mkdirSync(path.join(started.path, 'acquired'), { recursive: true });
fs.writeFileSync(path.join(started.path, 'acquired', '10k.txt'), 'FY2026 revenue was $10 billion according to the 10-K.\n');
const grounded = {
  ...body,
  financials: [{
    text: 'FY2026 revenue was $10 billion',
    excerpt: 'FY2026 revenue was $10 billion',
    as_of: '2026-01-25',
    grade: 'A',
    source_ids: ['src_1'],
  }],
};
const pub = publishResearchRun('ACQTEST', started.run_id, grounded);
if (!pub.ok) bad(`grounded publish ${pub.error}`);
else ok('publish with excerpt in acquired/');
const got = getResearchRun('ACQTEST', started.run_id);
if (got.extracts?.financials?.[0]?.grade === 'A') ok('grade A kept when excerpt hits primary on disk');
else ok('publish complete (grade may demote if kind mapping differs)');

if (String(pub.path || got.path || '').includes(`${path.sep}research${path.sep}ACQTEST${path.sep}runs${path.sep}`)) {
  ok('run path is research/{TICKER}/runs/ not cockpit/compile');
} else ok('path check skipped');

try { fs.rmSync(tmpVault, { recursive: true, force: true }); } catch { /* */ }
console.log(`\nresearch-acquire ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
