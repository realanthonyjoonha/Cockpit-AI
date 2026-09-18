#!/usr/bin/env node
/** Pack compile used to slice risk summaries at 160 chars. SoR overlay must not. */
import { parseSorRiskSummary } from '../server/riskProposals.js';

const r1 = `### R1 — Family ads growth digestion / DAP and mix
- **Status:** WATCH · **Grade:** [A] · Advertising is ~98% of revenue. Family DAP growth slowed from +7% (Dec 2025) to +3% (Jun 2026) while Q2’26 still printed +28% revenue on +14% impressions and +12% price. Reels still monetizes below Feed/Stories.
- **Mechanism:** Revenue = impressions × price.
`;
const sum = parseSorRiskSummary(r1);
if (!sum.includes('+12% price')) {
  console.error('FAIL expected +12% price, got', JSON.stringify(sum).slice(0, 220));
  process.exit(1);
}
if (sum.endsWith('+1')) {
  console.error('FAIL still truncated at +1');
  process.exit(1);
}
const stub = 'Advertising is ~98% of revenue. Family DAP growth slowed from +7% (Dec 2025) to +3% (Jun 2026) while Q2’26 still printed +28% revenue on +14% impressions and +1';
if (!(sum.length > stub.length)) {
  console.error('FAIL SoR summary not longer than 160-char pack stub');
  process.exit(1);
}
console.log('risk-sor-summary OK', sum.length, 'chars');
