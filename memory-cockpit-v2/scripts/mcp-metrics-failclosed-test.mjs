#!/usr/bin/env node
/** Gate 0: metric names are not registered and do not touch 08. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const mcp = fs.readFileSync(path.join(ROOT, 'scripts/mcp-cockpit-research.mjs'), 'utf8');
const catalog = fs.readFileSync(path.join(ROOT, 'server/mcpToolCatalog.js'), 'utf8');
const rp = fs.readFileSync(path.join(ROOT, 'server/riskProposals.js'), 'utf8');
let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

function registered(name) {
  return new RegExp(`tool\\(\\s*['"]${name}['"]`).test(mcp);
}

if (registered('propose_add_metric')) bad('propose_add_metric still registered');
else ok('propose_add_metric absent');
if (registered('get_metric_sor')) bad('get_metric_sor still registered');
else ok('get_metric_sor absent');

if (/proposeAddRisk\(/.test(catalog)) bad('catalog calls proposeAddRisk');
else ok('no proposeAddRisk under the removed names');
if (/getSorRiskSnapshot\(/.test(catalog)) bad('catalog reads 08');
else ok('removed names do not read 08');
if (/propose_add_metric/.test(catalog) && /get_metric_sor/.test(catalog)) ok('removed names documented on the lazy-load catalog');
else bad('removed names missing from catalog');

if (/k === 'metrics'/.test(mcp) && /kind=metrics is not wired/.test(mcp) && !/k === 'register' \|\| k === 'risks' \|\| k === 'metrics'/.test(mcp)) {
  ok('kind=metrics refuses');
} else if (/error: 'kind=metrics is not wired/.test(mcp)) ok('kind=metrics refuses');
else bad('commit_on_go still aliases metrics → register');

if (/- \*\*Kind:\*\* \$\{k\}/.test(rp) || /\*\*Kind:\*\* \$\{/.test(rp)) bad('buildAddRiskSection still writes Kind into 08');
else ok('no Kind write on add_risk');

if (fail) {
  console.log(`\nmcp-metrics-failclosed-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nmcp-metrics-failclosed-test OK');
