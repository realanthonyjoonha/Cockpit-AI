#!/usr/bin/env node
/**
 * Restore gate: kernel MCP speaks risk register, not Key metrics.
 * Tool ids propose_add_metric / get_metric_sor may exist as unused aliases.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const src = fs.readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), 'mcp-cockpit-research.mjs'),
  'utf8',
);
let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

if (/#\/\$\{d\.slug\}\/risks/.test(src)) ok('MCP glass /risks');
else bad('MCP missing /risks glass URL');

if (/#\/\$\{d\.slug\}\/metrics/.test(src) || /#\/\$\{[^}]+\}\/metrics/.test(src)) {
  bad('MCP still points glass at /metrics');
} else ok('no glass /metrics URL');

if (/house \| register \| metrics/.test(src)) bad('commit_on_go still advertises kind=metrics');
else if (/house \| register \| drivers/.test(src) || /house \| register/.test(src)) ok('commit_on_go schema');
else bad('commit_on_go schema');

if (/Propose NEW risk on register/.test(src) || /NEW risk on register/.test(src)) ok('propose_add_risk copy');
else bad('propose_add_risk copy not restored');

if (/on Risks page/.test(src) || /\/risks/.test(src)) ok('Risks page in MCP copy');
else bad('no Risks page');

if (/print\|condition\|risk\|catalyst/.test(src)) bad('MCP still teaches Kind print|condition|risk|catalyst');
else ok('no Kind product schema');

if (/KEY METRICS/.test(src) || /key metrics/i.test(src)) bad('MCP still says key metrics');
else ok('no key-metrics product copy');

if (/Not wired\. Use propose_add_risk/.test(src)) ok('propose_add_metric stub');
else bad('propose_add_metric not stubbed');

if (/Not wired\. Use get_risk_sor/.test(src)) ok('get_metric_sor stub');
else bad('get_metric_sor not stubbed');

if (/k === 'metrics'/.test(src) && /not wired/.test(src) && !/k === 'register' \|\| k === 'risks' \|\| k === 'metrics'/.test(src)) {
  ok('kind=metrics refuses (not register alias)');
} else if (/kind=metrics is not wired/.test(src)) ok('kind=metrics refuses');
else bad('kind=metrics still aliases to register');

if (fail) {
  console.log(`\nmcp-risks-restore-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nmcp-risks-restore-test OK');
