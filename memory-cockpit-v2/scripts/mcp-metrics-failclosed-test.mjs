#!/usr/bin/env node
/** Gate 0: metric aliases must not touch 08. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcp = fs.readFileSync(path.join(ROOT, 'scripts/mcp-cockpit-research.mjs'), 'utf8');
const rp = fs.readFileSync(path.join(ROOT, 'server/riskProposals.js'), 'utf8');
let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const metricTool = mcp.split("server.tool(\n  'propose_add_metric'")[1]?.split("server.tool(")[0] || '';
if (!metricTool) bad('propose_add_metric missing');
else if (/proposeAddRisk\(/.test(metricTool)) bad('propose_add_metric still calls proposeAddRisk');
else ok('propose_add_metric does not call proposeAddRisk');
if (/not wired/.test(metricTool)) ok('propose_add_metric not wired');
else bad('propose_add_metric copy');

const getMetric = mcp.split("server.tool(\n  'get_metric_sor'")[1]?.split("server.tool(")[0] || '';
if (/getSorRiskSnapshot\(/.test(getMetric)) bad('get_metric_sor still reads 08');
else ok('get_metric_sor does not call getSorRiskSnapshot');

const commit = mcp.split("server.tool(\n  'commit_on_go'")[1]?.split("server.tool(")[0] || '';
if (/k === 'metrics'/.test(commit) && /not wired/.test(commit) && !/k === 'register' \|\| k === 'risks' \|\| k === 'metrics'/.test(commit)) {
  ok('kind=metrics refuses');
} else if (/error: 'kind=metrics is not wired/.test(commit)) ok('kind=metrics refuses');
else bad('commit_on_go still aliases metrics → register');

if (/- \*\*Kind:\*\* \$\{k\}/.test(rp) || /\*\*Kind:\*\* \$\{/.test(rp)) bad('buildAddRiskSection still writes Kind into 08');
else ok('no Kind write on add_risk');

if (fail) {
  console.log(`\nmcp-metrics-failclosed-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nmcp-metrics-failclosed-test OK');
