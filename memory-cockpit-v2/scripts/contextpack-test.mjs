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
} from '../server/contextpack.js';
import {
  bannedNeedles,
  bannedWordHits,
  checkDemo,
  checkSectors,
  loadSectors,
} from '../../harness-stress/lib/sector-check.mjs';

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

console.log(fail ? `\n${fail} failed` : '\ncontextpack JS OK');
process.exit(fail ? 1 : 0);
