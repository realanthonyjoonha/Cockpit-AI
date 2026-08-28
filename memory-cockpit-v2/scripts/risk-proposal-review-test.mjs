#!/usr/bin/env node
/**
 * risk-proposal-review-test.mjs — readable risk proposal review payload.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { reviewRiskProposal } = await import(path.join(ROOT, 'server', 'riskProposals.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nrisk proposal review\n');

const add = reviewRiskProposal({
  kind: 'add_risk',
  risk_name: 'R10 — Pre-approval retatrutide leak',
  to_status: 'WATCH',
  grade: 'B',
  summary: 'Leak risk before approval.',
  mechanism: 'Franchise narrative can reprice on a leak.',
  tripwires: [
    { signal: 'Press', tripwire: 'Named leak in Tier-1 outlet', state: 'GAP' },
  ],
  rationale: 'Anchored in print coverage.',
  section_markdown: '### R10 — Pre-approval retatrutide leak\n',
});
if (add.title !== 'R10 — Pre-approval retatrutide leak') bad(`title ${add.title}`);
else ok('add_risk title');
if (!add.fields.some((f) => f.key === 'status' && f.to === 'WATCH')) bad('status field');
else ok('add_risk status field');
if (!add.blocks.some((b) => b.k === 'MECHANISM' && /reprice/.test(b.text))) bad('mechanism block');
else ok('add_risk mechanism block');
if (!add.tripwires.some((t) => t.t === 'add' && /Press/.test(t.s))) bad('tripwire add');
else ok('add_risk tripwire lines');
if (!add.rationale) bad('rationale');
else ok('add_risk rationale');

const status = reviewRiskProposal({
  kind: 'status_change',
  risk_name: 'R1 — Demand',
  from_status: 'WATCH',
  to_status: 'FIRED',
  rationale: 'Tripwire hit.',
});
if (!status.fields.some((f) => f.key === 'status' && f.from === 'WATCH' && f.to === 'FIRED')) {
  bad(`status change ${JSON.stringify(status.fields)}`);
} else ok('status_change field');

const tw = reviewRiskProposal({
  kind: 'set_tripwires',
  risk_name: 'R2 — Conc',
  prior_tripwires: [{ signal: 'Old', tripwire: 'A', state: 'GAP' }],
  tripwires: [{ signal: 'New', tripwire: 'B', state: 'OPEN' }],
});
if (!tw.tripwires.some((t) => t.t === 'del' && /Old/.test(t.s))) bad('prior del');
else ok('set_tripwires prior as del');
if (!tw.tripwires.some((t) => t.t === 'add' && /New/.test(t.s))) bad('next add');
else ok('set_tripwires next as add');

console.log(`\nrisk-proposal-review ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
