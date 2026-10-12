#!/usr/bin/env node
/** Mirror Python ContextPack v2 live-claim pick for NVDA/SHAZ. */
import { existsSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  claimGaps,
  classifyClaim,
  classifyMetric,
  liveClaims,
  loadContextpackRules,
  parseAmounts,
  parseAsOf,
  riskMetric,
  sentenceHasAmount,
} from '../server/contextpack.js';
import { headlineGaps, parseCompanyfacts, structuredMetric, taggedSlots } from '../server/companyfacts.js';
import { checkCompanyfactsExact } from '../../harness-stress/lib/review-check.mjs';
import {
  bannedNeedles,
  bannedWordHits,
  checkDemo,
  checkSectors,
  loadSectors,
} from '../../harness-stress/lib/sector-check.mjs';
import { checkReview, checkReviewerCases, checkTaggedSectors } from '../../harness-stress/lib/review-check.mjs';

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
  { id: 'n', text: 'Gross margin was 41 percent in the quarter', as_of: '2026-08-15', grade: 'A' },
  { id: 'o', text: 'Gross margin was 40 percent in the quarter', as_of: '2026-05-15', grade: 'A' },
], rules);
const acmeRev = acme.filter((c) => c.metric_id === 'gross_margin');
if (acmeRev.length === 1 && acmeRev[0].id === 'n') ok('JS retailer latest sentence wins a non-headline slot');
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

const xApi = { ...api, sentenceHasAmount, parseCompanyfacts, structuredMetric, taggedSlots, headlineGaps };
const exactErrors = checkCompanyfactsExact(xApi);
if (!exactErrors.length) ok('JS companyfacts properties + constructed documents');
else exactErrors.forEach((e) => bad(e));
const taggedErrors = checkTaggedSectors(loadSectors(), xApi);
if (!taggedErrors.length) ok('JS companyfacts slots own the ten-sector live values');
else taggedErrors.forEach((e) => bad(e));
const reviewRun = checkReview(xApi);
if (!reviewRun.errors.length) ok(`JS ${reviewRun.sentences} review sentences leave structured slots alone`);
else reviewRun.errors.slice(0, 20).forEach((e) => bad(e));
const reviewerErrors = checkReviewerCases(xApi);
if (!reviewerErrors.length) ok('JS constructed unique / two-periods / disagree / none');
else reviewerErrors.forEach((e) => bad(e));

console.log(fail ? `\n${fail} failed` : '\ncontextpack JS OK');
process.exit(fail ? 1 : 0);
