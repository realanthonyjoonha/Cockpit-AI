#!/usr/bin/env node
/** Mirror Python ContextPack v2 live-claim pick for NVDA/SHAZ. */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  assembleAgentPack,
  claimGaps,
  classifyClaim,
  classifyMetric,
  enforceCharBudget,
  liveClaims,
  loadContextpackRules,
  OVERVIEW_BUDGET_CHARS,
  parseAmounts,
  parseAsOf,
  riskMetric,
  sentenceHasAmount,
} from '../server/contextpack.js';
import { capAssistClipboard, HOUSE_FILE_POINTER } from '../server/assistContext.js';
import { factNumber, parseXbrlFacts, shiftDecimal, taggedSlots } from '../server/xbrlFacts.js';
import {
  bannedNeedles,
  bannedWordHits,
  checkDemo,
  checkSectors,
  loadSectors,
} from '../../harness-stress/lib/sector-check.mjs';
import { checkReview, checkTaggedSectors } from '../../harness-stress/lib/review-check.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = path.resolve(ROOT, '..');
const ont = path.join(REPO, 'ontology');
let fail = 0;
function ok(m) { console.log('  ✓', m); }
function bad(m) { console.log('  ✗', m); fail += 1; }

const rules = loadContextpackRules(ont);
const nvdaPath = path.join(ont, 'store/by_ticker/NVDA.json');
const shazPath = path.join(ont, 'store/by_ticker/SHAZ.json');
if (!existsSync(nvdaPath) || !existsSync(shazPath)) {
  ok('skip live NVDA/SHAZ store (empty product — no books)');
} else {
  const nvda = JSON.parse(readFileSync(nvdaPath, 'utf8'));
  const live = liveClaims(nvda.claims, rules);
  const supply = live.filter((c) => c.metric_id === 'purchase_commitments');
  if (supply.length === 1 && /279/.test(supply[0].text) && !/were \$119 billion as of April/.test(supply[0].text)) {
    ok('JS NVDA purchase_commitments is $279B');
  } else bad(`JS NVDA supply ${JSON.stringify(supply.map((c) => c.text))}`);
  if (live.length < nvda.claims.length) ok(`JS NVDA live ${live.length} < store ${nvda.claims.length}`);
  else bad('JS did not shrink NVDA claims');

  const shaz = JSON.parse(readFileSync(shazPath, 'utf8'));
  const cash = liveClaims(shaz.claims, rules).filter((c) => c.metric_id === 'cash');
  if (cash.length === 1 && /1,861/.test(cash[0].text)) ok('JS SHAZ cash is June $1.86B');
  else bad(`JS SHAZ cash ${JSON.stringify(cash.map((c) => c.text))}`);
}

const rulesText = readFileSync(path.join(ont, 'schema/contextpack_metrics.json'), 'utf8').toLowerCase();
const banned = ['h20', 'h200', 'nvda', 'shaz', 'data center', 'china', 'rvg', 'blackwell'];
const hits = banned.filter((b) => rulesText.includes(b));
if (!hits.length) ok('metrics JSON has no issuer/sector names');
else bad(`metrics desk-tuned: ${hits}`);

const acme = liveClaims([
  { id: 'n', text: 'Net sales were $12.4 billion in the quarter', as_of: '2026-08-15', grade: 'A' },
  { id: 'o', text: 'Net sales were $11.0 billion in the quarter', as_of: '2026-05-15', grade: 'A' },
], rules);
const acmeRev = acme.filter((c) => c.metric_id === 'company_revenue');
if (acmeRev.length === 1 && /12\.4/.test(acmeRev[0].text)) ok('JS retailer net sales latest wins');
else bad(`JS acme ${JSON.stringify(acmeRev)}`);
if (classifyMetric('FY2026 Data Center revenue was $193.7 billion', rules) === 'company_revenue') {
  ok('JS files a revenue line as company_revenue');
} else bad('JS still special-cases data-center revenue');

const api = { rules, liveClaims, classifyClaim, classifyMetric, parseAsOf, parseAmounts, claimGaps, riskMetric };
const demoErrors = checkDemo(api);
if (!demoErrors.length) ok('JS DEMO repros (dates, cash, guidance, goodwill, drops, grade)');
else demoErrors.forEach((e) => bad(e));
const sectorErrors = checkSectors(loadSectors(), api);
if (!sectorErrors.length) ok('JS ten-sector fixture');
else sectorErrors.forEach((e) => bad(e));

const rulesFile = readFileSync(path.join(ont, 'schema/contextpack_metrics.json'), 'utf8');
const xbrlFile = readFileSync(path.join(ont, 'schema/taxonomy_xbrl.json'), 'utf8');
const bannedHits = [...bannedWordHits(rulesFile), ...bannedWordHits(xbrlFile)];
if (!bannedHits.length) ok('metrics JSON and XBRL map have no issuer tokens');
else bad(`issuer tokens: ${bannedHits.join(', ')}`);
const stems = bannedNeedles(rules);
if (!stems.length) ok('no guid or inventor stems');
else bad(`stems: ${stems.join(', ')}`);

const fat = 'Z'.repeat(8000);
const fatPack = assembleAgentPack({
  compiled_at: '2026-01-15T00:00:00Z',
  house_prior: { play: 'fixture', status: 'CONFIRMED', date: '2026-01-15', view_excerpt: 'short', notes: 'N'.repeat(20000) },
  claims: [
    { id: 'fat1', text: `Net sales were $10 million ${fat}`, as_of: '2026-01-01', grade: 'A', source_id: 'fixture' },
    { id: 'fat2', text: `Gross margin was 40% ${fat}`, as_of: '2026-01-02', grade: 'A', source_id: 'fixture' },
  ],
  gaps: [],
}, rules);
const fatJson = JSON.stringify(fatPack);
if (fatJson.length <= OVERVIEW_BUDGET_CHARS && fatPack.budget.used_chars === fatJson.length && !fatPack.house_prior.notes) {
  ok('JS assemble stays under 10000 and drops notes');
} else bad(`JS assemble cap ${fatJson.length} notes=${fatPack.house_prior && fatPack.house_prior.notes != null}`);

const residual = [];
for (let i = 1; i <= 12; i++) {
  residual.push({ id: `r${i}`, text: `Unmatched item ${i} cost $${i} million`, as_of: `2026-${String(i).padStart(2, '0')}-01`, grade: 'A', source_id: 'fixture' });
}
const residualGaps = claimGaps(residual, rules);
if (liveClaims(residual, rules).length === 8 && residualGaps.includes('4 unclassified numbered claims omitted')) {
  ok('JS residual cap names the omission');
} else bad(`JS residual ${JSON.stringify(residualGaps)}`);

const pretty = enforceCharBudget({
  claims: [{ id: 'fat', metric_id: 'company_revenue', text: `Net sales were $1 ${'Q'.repeat(12000)}`, as_of: '2026-01-01', grade: 'A' }],
  house_prior: { status: 'CONFIRMED', date: '2026-01-15', notes: 'N'.repeat(20000), view_excerpt: 'H'.repeat(4000) },
  gaps: [],
}, 10000, (row) => JSON.stringify(row, null, 2).length);
if (JSON.stringify(pretty, null, 2).length <= 10000 && !(pretty.house_prior && pretty.house_prior.notes)) {
  ok('JS pretty snapshot stays under 10000');
} else bad('JS pretty snapshot over cap');

const clip = capAssistClipboard('rules\n```markdown\n' + 'H'.repeat(20000) + '\n```\n');
if (clip.length <= 10000 && clip.includes(HOUSE_FILE_POINTER)) ok('assist clipboard points at get_house_view');
else bad(`assist clipboard ${clip.length}`);

const xbrlUnits = [
  [shiftDecimal('1234.5', 6), '1234500000'],
  [shiftDecimal('12', -2), '0.12'],
  [shiftDecimal('-3', 3), '-3000'],
  [factNumber('1.234,5', 'ixt:num-comma-decimal'), '1234.5'],
  [factNumber('No', 'ixt-sec:numwordsen'), '0'],
  [factNumber('\u2014', 'ixt:fixed-zero'), '0'],
  [factNumber('about nine', 'ixt:num-dot-decimal'), null],
];
if (xbrlUnits.every(([got, want]) => got === want)) ok('JS XBRL scale and formats are string-exact');
else bad(`JS XBRL units ${JSON.stringify(xbrlUnits)}`);
const xApi = { ...api, sentenceHasAmount, parseXbrlFacts, taggedSlots };
const taggedErrors = checkTaggedSectors(loadSectors(), xApi);
if (!taggedErrors.length) ok('JS tagged XBRL slots own the ten-sector live values');
else taggedErrors.forEach((e) => bad(e));
const reviewRun = checkReview(xApi);
if (!reviewRun.errors.length) ok(`JS ${reviewRun.sentences} review sentences leave tagged slots alone`);
else reviewRun.errors.slice(0, 20).forEach((e) => bad(e));

console.log(fail ? `\n${fail} failed` : '\ncontextpack JS OK');
process.exit(fail ? 1 : 0);
