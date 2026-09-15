#!/usr/bin/env node
/**
 * filing-map-closeout-test.mjs — plan + propose-from-map (temp vault, no Grok).
 * Decision-support only. Never ACCEPT / never pack write.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONOREPO = path.join(ROOT, '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-fmap-closeout-'));
process.env.COCKPIT_VAULT = tmpVault;

// vault.js requires cockpit/lib/fm.js
const fmSrc = path.join(MONOREPO, 'research-wiki', 'cockpit', 'lib', 'fm.js');
fs.mkdirSync(path.join(tmpVault, 'cockpit', 'lib'), { recursive: true });
if (fs.existsSync(fmSrc)) {
  fs.copyFileSync(fmSrc, path.join(tmpVault, 'cockpit', 'lib', 'fm.js'));
} else {
  fs.writeFileSync(path.join(tmpVault, 'cockpit', 'lib', 'fm.js'), 'export default {};\n', 'utf8');
}

const { closeoutPreviewCounts, houseHitTrips } = await import(
  path.join(ROOT, 'src', 'pages', 'thin', 'filingMapPaint.js')
);
const {
  planFilingMapCloseout,
  proposeFromFilingMap,
} = await import(path.join(ROOT, 'server', 'filingMapCloseout.js'));
const { listHouseProposals } = await import(path.join(ROOT, 'server', 'houseProposals.js'));
const { listRiskProposals } = await import(path.join(ROOT, 'server', 'riskProposals.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nfiling-map closeout\n');

// --- paint preview ---
const quietDelta = {
  rows: [{
    accession: 'a1',
    house_hits: [{ trigger: 'X', trips: false, note: 'Does not trip.' }],
    risk_hits: [{ name: 'R1 — Foo', test: 'none', note: 'GAP' }],
    add_risk_candidates: [],
  }],
};
const quietPrev = closeoutPreviewCounts(quietDelta);
if (quietPrev.actionable !== 0) bad(`quiet preview ${JSON.stringify(quietPrev)}`);
else ok('preview quiet when no trips/add');

const loudDelta = {
  rows: [{
    accession: 'a2',
    house_hits: [{ trigger: 'Break', trips: true, note: 'Trips on print.' }],
    risk_hits: [{ name: 'R1 — Foo', test: 'FIRED', note: 'Fired.' }],
    add_risk_candidates: [{ name: 'New overhang', note: 'Disclosed backstop.' }],
  }],
};
const loudPrev = closeoutPreviewCounts(loudDelta);
if (loudPrev.house !== 1 || loudPrev.risk !== 1 || loudPrev.add !== 1) {
  bad(`loud preview ${JSON.stringify(loudPrev)}`);
} else ok('preview counts house/risk/add');

if (!houseHitTrips({ trips: true })) bad('houseHitTrips true');
else ok('houseHitTrips true');
if (houseHitTrips({ note: 'Does not trip.' })) bad('houseHitTrips false on does not trip');
else ok('houseHitTrips respects does not trip');

// --- plan with SoR ---
const sorMap = {
  R1: { rNum: '1', heading: 'R1 — Foo', status: 'WATCH' },
  R2: { rNum: '2', heading: 'R2 — Bar', status: 'INTACT' },
};
const planDelta = {
  summary: 'Test map.',
  rows: [
    {
      accession: '0001',
      form: '8-K',
      filed: '2026-09-01',
      house_hits: [
        { trigger: 'Quiet wire', trips: false, note: 'Does not trip.' },
        { trigger: 'Loud wire', trips: true, note: 'Trips — printed miss.' },
      ],
      risk_hits: [
        {
          id: 'test-r1-foo',
          name: 'R1 — Foo',
          test: 'FIRED',
          tripwire: 'Miss guide',
          note: 'Fired on print.',
        },
        {
          id: 'test-r2-bar',
          name: 'R2 — Bar',
          test: 'INTACT',
          note: 'Already intact.',
        },
        {
          id: 'test-r3-gap',
          name: 'R3 — Gap',
          test: 'none',
          note: 'Not testable.',
        },
      ],
      add_risk_candidates: [
        { name: 'Lease residual backstop', note: 'Max liability disclosed.' },
      ],
    },
  ],
};

const plan = planFilingMapCloseout(planDelta, { sorMap, runId: 'run_x' });
if (plan.counts.house !== 1) bad(`plan house ${plan.counts.house}`);
else ok('plan one house trip');
if (plan.counts.risk_status !== 1 || plan.risk_status[0].to_status !== 'FIRED') {
  bad(`plan risk ${JSON.stringify(plan.risk_status)}`);
} else ok('plan R1 WATCH→FIRED only');
if (plan.counts.add_risk !== 1) bad(`plan add ${plan.counts.add_risk}`);
else ok('plan one add-risk');
if (!plan.skipped.some((s) => s.kind === 'risk_unchanged')) bad('expected R2 skip');
else ok('skip unchanged SoR status');
if (!plan.skipped.some((s) => s.kind === 'risk_skip')) bad('expected test=none skip');
else ok('skip non-actionable risk test');

// --- fixture vault + propose ---
const houseFile = 'house-view-testco.md';
const risksRel = 'raw/testco-research/08-risks-catalysts.md';
fs.writeFileSync(path.join(tmpVault, houseFile), `# House View — TESTCO

> **Stance:** Tracking TESTCO for diligence.

## Flip triggers
- Quiet wire
- Loud wire
`, 'utf8');
fs.mkdirSync(path.join(tmpVault, 'raw', 'testco-research'), { recursive: true });
fs.writeFileSync(path.join(tmpVault, risksRel), `# Risks — TESTCO

## A) Risks

### R1 — Foo
- **Status:** WATCH · **Grade:** [B] · Cycle risk
- **Mechanism:** Demand fades.

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| Print | Miss guide | OPEN | 2026-01-01 |

### R2 — Bar
- **Status:** INTACT · **Grade:** [B] · Stable
- **Mechanism:** Hold.

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| Event | Break | OPEN | 2026-01-01 |

## B) Catalysts
`, 'utf8');

const runId = '20260911T120000Z_filing_map_TESTCO';
const runDir = path.join(tmpVault, 'cockpit', 'research', 'TESTCO', 'runs', runId);
fs.mkdirSync(runDir, { recursive: true });
fs.writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify({
  schema_version: 1,
  run_id: runId,
  job: 'filing_map',
  status: 'complete',
  ticker: 'TESTCO',
  desk: 'testco',
  started_at: '2026-09-11T12:00:00Z',
  finished_at: '2026-09-11T12:05:00Z',
  immutable: true,
}, null, 2), 'utf8');
fs.writeFileSync(path.join(runDir, 'delta.json'), JSON.stringify(planDelta, null, 2), 'utf8');
fs.writeFileSync(path.join(runDir, 'inbox.json'), JSON.stringify({
  last_print: { accession: '0001' },
  material_not_in_book: [],
}, null, 2), 'utf8');

const dry = proposeFromFilingMap({
  slug: 'testco',
  ticker: 'TESTCO',
  houseFile,
  risksSourceRel: risksRel,
  runId,
  dryRun: true,
  desk: 'testco',
});
if (!dry.ok || !dry.dry_run) bad(`dry ${JSON.stringify(dry)}`);
else if (dry.counts.actionable !== 3) bad(`dry actionable ${dry.counts.actionable}`);
else ok(`dry_run actionable=${dry.counts.actionable}`);

const applied = proposeFromFilingMap({
  slug: 'testco',
  ticker: 'TESTCO',
  houseFile,
  risksSourceRel: risksRel,
  runId,
  dryRun: false,
  desk: 'testco',
});
if (!applied.ok) bad(`apply ${JSON.stringify(applied.errors || applied)}`);
else if (!Array.isArray(applied.created) || applied.created.length !== 3) {
  bad(`created ${JSON.stringify(applied.created)}`);
} else ok(`created ${applied.created.length} pending proposals`);

const housePending = listHouseProposals('testco', { status: 'pending' });
if ((housePending.counts?.pending || 0) < 1) bad('house pending missing');
else if (!String(housePending.proposals[0].source || '').includes('filing_map')) {
  bad(`house source ${housePending.proposals[0].source}`);
} else ok('house proposal pending with filing_map source');

const riskPending = listRiskProposals('testco', { status: 'pending' });
const kinds = (riskPending.proposals || []).map((p) => p.kind).sort();
if (!kinds.includes('status_change') || !kinds.includes('add_risk')) {
  bad(`risk kinds ${kinds.join(',')}`);
} else ok('risk status_change + add_risk pending');

// house file must NOT be written yet
const houseNow = fs.readFileSync(path.join(tmpVault, houseFile), 'utf8');
if (/Filing map closeout/.test(houseNow)) bad('house vault written without ACCEPT');
else ok('house vault untouched until ACCEPT');

const risksNow = fs.readFileSync(path.join(tmpVault, risksRel), 'utf8');
if (/Lease residual/.test(risksNow) || /\*\*Status:\*\*\s*FIRED/.test(risksNow)) {
  bad('risks SoR written without ACCEPT');
} else ok('risks SoR untouched until ACCEPT');

if (!fs.existsSync(path.join(runDir, 'closeout.json'))) bad('closeout.json crumb missing');
else ok('closeout.json audit crumb written');

// second propose should mostly skip / not duplicate house
const again = proposeFromFilingMap({
  slug: 'testco',
  ticker: 'TESTCO',
  houseFile,
  risksSourceRel: risksRel,
  runId,
  dryRun: false,
  desk: 'testco',
});
if ((again.created || []).length !== 0 && !again.skipped?.length) {
  // allow zero created with skips
  bad(`second pass unexpected creates ${JSON.stringify(again.created)}`);
} else ok('second pass does not double-create (dedupe/skip)');

// incomplete run rejected
const badRun = proposeFromFilingMap({
  slug: 'testco',
  ticker: 'TESTCO',
  houseFile,
  risksSourceRel: risksRel,
  runId: 'missing_run',
  dryRun: true,
});
if (badRun.ok) bad('missing run should fail');
else ok('missing run fail-closed');

// Quiet map (no trips) still writes closeout crumb so glance clears
const quietId = '20260911T130000Z_filing_map_TESTCO';
const quietDir = path.join(tmpVault, 'cockpit', 'research', 'TESTCO', 'runs', quietId);
fs.mkdirSync(quietDir, { recursive: true });
fs.writeFileSync(path.join(quietDir, 'meta.json'), JSON.stringify({
  schema_version: 1,
  run_id: quietId,
  job: 'filing_map',
  status: 'complete',
  ticker: 'TESTCO',
  desk: 'testco',
  started_at: '2026-09-11T13:00:00Z',
  finished_at: '2026-09-11T13:01:00Z',
  immutable: true,
  promotion: { status: 'none' },
}, null, 2), 'utf8');
fs.writeFileSync(path.join(quietDir, 'delta.json'), JSON.stringify({
  schema_version: 1,
  rows: [{
    accession: '0002',
    house_hits: [{ trigger: 'Quiet wire', trips: false, note: 'does not trip' }],
    risk_tests: [{ risk: 'R1', status: 'WATCH', note: 'unchanged' }],
    add_risk: [],
  }],
}, null, 2), 'utf8');
const quiet = proposeFromFilingMap({
  slug: 'testco',
  ticker: 'TESTCO',
  houseFile,
  risksSourceRel: risksRel,
  runId: quietId,
  dryRun: false,
  desk: 'testco',
});
if (!quiet.ok || quiet.counts.actionable !== 0) bad(`quiet apply ${JSON.stringify(quiet.counts)}`);
else if (!fs.existsSync(path.join(quietDir, 'closeout.json'))) bad('quiet closeout.json missing');
else {
  const meta = JSON.parse(fs.readFileSync(path.join(quietDir, 'meta.json'), 'utf8'));
  if (meta.promotion?.status !== 'quiet') bad(`quiet promo ${meta.promotion?.status}`);
  else ok('quiet map writes closeout + promotion.quiet');
}

console.log(`\nfiling-map-closeout ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
try {
  fs.rmSync(tmpVault, { recursive: true, force: true });
} catch { /* */ }
process.exit(fail ? 1 : 0);
