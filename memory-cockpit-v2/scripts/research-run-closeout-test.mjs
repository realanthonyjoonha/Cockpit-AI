#!/usr/bin/env node
/**
 * research-run-closeout-test.mjs — deep_compile / thesis_report → pending proposals.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONOREPO = path.join(ROOT, '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-run-closeout-'));
process.env.COCKPIT_VAULT = tmpVault;

const fmSrc = path.join(MONOREPO, 'research-wiki', 'cockpit', 'lib', 'fm.js');
fs.mkdirSync(path.join(tmpVault, 'cockpit', 'lib'), { recursive: true });
if (fs.existsSync(fmSrc)) fs.copyFileSync(fmSrc, path.join(tmpVault, 'cockpit', 'lib', 'fm.js'));
else fs.writeFileSync(path.join(tmpVault, 'cockpit', 'lib', 'fm.js'), 'export default {};\n', 'utf8');

const {
  planResearchRunCloseout,
  proposeFromResearchRun,
  pendingProposalGlance,
} = await import(path.join(ROOT, 'server', 'researchRunCloseout.js'));
const { listRiskProposals } = await import(path.join(ROOT, 'server', 'riskProposals.js'));
const { listHouseProposals } = await import(path.join(ROOT, 'server', 'houseProposals.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nresearch-run closeout\n');

const plan = planResearchRunCloseout({
  job: 'deep_compile',
  run_id: 'x',
  summary: 'Print summary.',
  extracts: {
    risks: [
      { text: 'R1 candidate: Lease residual backstop on AI racks.', grade: 'B' },
      { text: 'R2 status → FIRED on printed miss vs guide.', grade: 'A' },
      { text: 'Color commentary with no action.', grade: 'C' },
    ],
    narrative: [{ text: 'Should not become house on compile lane.' }],
  },
}, {
  sorMap: {
    R2: { rNum: '2', heading: 'R2 — Demand', status: 'WATCH' },
  },
  runId: 'x',
});

if (plan.counts.add_risk !== 1) bad(`add ${plan.counts.add_risk}`);
else ok('plan add-risk from candidate');
if (plan.counts.risk_status !== 1 || plan.risk_status[0].to_status !== 'FIRED') {
  bad(`status ${JSON.stringify(plan.risk_status)}`);
} else ok('plan R2 WATCH→FIRED');
if (plan.counts.house !== 0) bad('compile lane should skip house');
else ok('compile lane skips house appendix');

const thesisPlan = planResearchRunCloseout({
  job: 'thesis_report',
  summary: 'Thesis summary line for house note.',
  extracts: { risks: [], narrative: [{ text: 'Narrative support for stance.' }] },
}, { sorMap: {}, runId: 't1' });
if (thesisPlan.counts.house < 1) bad('thesis should plan house notes');
else ok('thesis plans house notes');

// Fixture vault
const houseFile = 'house-view-closeco.md';
const risksRel = 'raw/closeco-research/08-risks-catalysts.md';
fs.writeFileSync(path.join(tmpVault, houseFile), '# House View — CLOSECO\n\n> **Stance:** Tracking.\n', 'utf8');
fs.mkdirSync(path.join(tmpVault, 'raw', 'closeco-research'), { recursive: true });
fs.writeFileSync(path.join(tmpVault, risksRel), `# Risks

## A) Risks

### R2 — Demand
- **Status:** WATCH · **Grade:** [B] · Digestion
- **Mechanism:** Miss vs guide.

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| Print | Miss | OPEN | 2026-01-01 |

## B) Catalysts
`, 'utf8');

const runId = '20260912T010000Z_deep_compile_CLOSECO';
const runDir = path.join(tmpVault, 'cockpit', 'research', 'CLOSECO', 'runs', runId);
fs.mkdirSync(path.join(runDir, 'extracts'), { recursive: true });
fs.writeFileSync(path.join(runDir, 'meta.json'), JSON.stringify({
  schema_version: 1,
  run_id: runId,
  job: 'deep_compile',
  status: 'complete',
  ticker: 'CLOSECO',
  desk: 'closeco',
  started_at: '2026-09-12T01:00:00Z',
  finished_at: '2026-09-12T01:10:00Z',
  immutable: true,
  promotion: { status: 'none', pack_claims: false, risks_proposed: false, house_proposed: false },
}, null, 2), 'utf8');
fs.writeFileSync(path.join(runDir, 'extracts', 'risks.json'), JSON.stringify({
  items: [
    { text: 'R1 candidate: New supply concentration risk.', grade: 'B', as_of: '2026-09-01', source_ids: ['edgar:x'] },
    { text: 'R2 → FIRED after printed AI miss.', grade: 'A', as_of: '2026-09-01', source_ids: ['edgar:x'] },
  ],
}, null, 2), 'utf8');
fs.writeFileSync(path.join(runDir, 'extracts', 'narrative.json'), JSON.stringify({ items: [] }, null, 2), 'utf8');
fs.writeFileSync(path.join(runDir, 'extracts', 'financials.json'), JSON.stringify({ items: [] }, null, 2), 'utf8');
fs.writeFileSync(path.join(runDir, 'extracts', 'guide.json'), JSON.stringify({ items: [] }, null, 2), 'utf8');

const dry = proposeFromResearchRun({
  slug: 'closeco',
  ticker: 'CLOSECO',
  houseFile,
  risksSourceRel: risksRel,
  runId,
  dryRun: true,
  desk: 'closeco',
});
if (!dry.ok || dry.counts.actionable < 2) bad(`dry ${JSON.stringify(dry.counts)}`);
else ok(`dry_run actionable=${dry.counts.actionable}`);

const applied = proposeFromResearchRun({
  slug: 'closeco',
  ticker: 'CLOSECO',
  houseFile,
  risksSourceRel: risksRel,
  runId,
  dryRun: false,
  desk: 'closeco',
});
if (!applied.ok || !applied.created?.length) bad(`apply ${JSON.stringify(applied)}`);
else ok(`created ${applied.created.length} proposals`);

const risks = listRiskProposals('closeco', { status: 'pending' });
if ((risks.counts?.pending || 0) < 1) bad('risk pending missing');
else ok('risk proposals pending');

const house = listHouseProposals('closeco', { status: 'pending' });
if ((house.counts?.pending || 0) !== 0) bad('compile lane should not create house');
else ok('no house proposal on deep_compile');

if (!fs.existsSync(path.join(runDir, 'closeout.json'))) bad('closeout.json missing');
else ok('closeout.json written');

const meta = JSON.parse(fs.readFileSync(path.join(runDir, 'meta.json'), 'utf8'));
if (meta.promotion?.status !== 'pending_accept') bad(`promotion ${JSON.stringify(meta.promotion)}`);
else ok('meta.promotion pending_accept');

const glance = pendingProposalGlance('closeco');
if (glance.pending_total < 1) bad(`glance pending ${glance.pending_total}`);
else ok(`pendingProposalGlance=${glance.pending_total}`);

const houseNow = fs.readFileSync(path.join(tmpVault, houseFile), 'utf8');
if (/Research run closeout/.test(houseNow)) bad('house written without ACCEPT');
else ok('house vault untouched');

console.log(`\nresearch-run-closeout ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
try { fs.rmSync(tmpVault, { recursive: true, force: true }); } catch { /* */ }
process.exit(fail ? 1 : 0);
