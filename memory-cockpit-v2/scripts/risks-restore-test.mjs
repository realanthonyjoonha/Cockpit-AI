#!/usr/bin/env node
/**
 * Restore gate: glass + OPEN GROK seeds are Risks / risk-*, not Key metrics.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildInitialPrompt, listGrokAgents } from '../server/openGrok.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const risksPage = src('src/pages/thin/Risks.jsx');
if (/RISK REGISTER/.test(risksPage) && !/<h2>KEY METRICS<\/h2>/.test(risksPage)) ok('list heading RISK REGISTER');
else bad('list heading');
if (/kind-legend/.test(risksPage)) bad('Kind legend still on Risks page');
else ok('no Kind legend');
if (/#\/\$\{slug\}\/risk\//.test(risksPage)) ok('rows go to /risk/id');
else bad('row route');

const rail = src('src/thinDesks.js');
if (/\$\{L\} Risks/.test(rail) && /\/risks`/.test(rail) && !/Key metrics/.test(rail)) ok('rail Risks');
else bad('rail');
if (/\$\{L\} Drivers/.test(rail) && /\/drivers`/.test(rail) && !/\$\{L\} Metrics/.test(rail) && !/Key metrics/.test(rail)) {
  ok('rail Drivers (own room)');
} else bad('rail Drivers');

const agents = src('src/pages/thin/GrokAgents.jsx') + src('server/openGrok.js');
if (/label: 'Add risk'/.test(agents) && !/label: 'Add metric'/.test(agents)) ok('Add risk label');
else bad('Add risk');
if (/label: 'Add driver'/.test(agents) && /label: 'Edit drivers in Grok'/.test(agents)) ok('Add driver / Edit drivers labels');
else bad('drivers OPEN GROK labels');
if (/label: 'Risk check'/.test(agents) && !/label: 'Metric check'/.test(agents)) ok('Risk check label');
else bad('Risk check');
if (/label: 'Risk tripwires'/.test(agents) && !/label: 'Metric tripwires'/.test(agents)) ok('Risk tripwires label');
else bad('Risk tripwires');
if (/label: 'Edit register in Grok'/.test(agents) && !/label: 'Edit metrics in Grok'/.test(agents)) ok('Edit register label');
else bad('Edit register');

const add = buildInitialPrompt({ action: 'risk-add', desk: 'tsla' });
if (/\/cockpit-risk-add tsla/.test(add) && !/\/cockpit-metric-add/.test(add)) ok(`seed add: ${add}`);
else bad(`seed add ${add}`);
const chk = buildInitialPrompt({ action: 'risk-check', desk: 'tsla', risk_id: 'tsla-r1' });
if (/\/cockpit-risk-check/.test(chk) && !/\/cockpit-metric-check/.test(chk)) ok(`seed check: ${chk}`);
else bad(`seed check ${chk}`);
const tw = buildInitialPrompt({ action: 'risk-tripwires', desk: 'tsla', risk_name: 'R1' });
if (/\/cockpit-risk-tripwires/.test(tw) && !/\/cockpit-metric-tripwires/.test(tw)) ok(`seed tripwires: ${tw}`);
else bad(`seed tripwires ${tw}`);
const reg = buildInitialPrompt({ action: 'register-session', desk: 'meta' });
if (/\/cockpit-register meta/.test(reg)) ok(`seed register: ${reg}`);
else bad(`seed register ${reg}`);

const house = listGrokAgents({ variant: 'house' });
if (house.default_action === 'propose') ok('house default propose');
else bad('house default');
const rvar = listGrokAgents({ variant: 'register' });
const def = (rvar.agents || []).find((a) => a.action === rvar.default_action);
if (/Edit register in Grok/i.test(def?.label || '')) ok('register default Edit register in Grok');
else bad(`register default ${def?.label}`);

const reports = src('src/pages/thin/Reports.jsx');
if (/scope-k">REGISTER</.test(reports) && !/scope-k">KEY METRICS</.test(reports)) ok('Reports REGISTER');
else bad('Reports heading');
if (/Deep only the risks you tick/.test(reports)) ok('Reports pick hint risks');
else bad('Reports pick hint');

const start = src('src/pages/Start.jsx');
if (/>Risks</.test(start) && /Open Risks/.test(start)) ok('START Risks column');
else bad('START glance');

const ov = src('src/pages/thin/Overview.jsx');
if (/risk register/.test(ov) && !/key metrics/.test(ov)) ok('Overview risk register chip');
else bad('Overview');

if (fail) {
  console.log(`\nrisks-restore-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nrisks-restore-test OK');
