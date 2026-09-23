#!/usr/bin/env node
/**
 * Prototype: Drivers is a Risks-shaped room. Not Metrics. Not Risks. No GO. No 08 read.
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

const page = src('src/pages/thin/Drivers.jsx');
if (/<h2>DRIVERS<\/h2>/.test(page) && !/<h2>RISK REGISTER<\/h2>/.test(page) && !/<h2>METRICS<\/h2>/.test(page) && !/<h2>KEY METRICS<\/h2>/.test(page)) {
  ok('list heading DRIVERS');
} else bad('list heading');
if (/your engines/.test(page) || /Watching/.test(page)) ok('drivers SoR copy');
else bad('drivers copy');
if (/api\(`.+\/risks/.test(page)) bad('Drivers list still loads /risks API');
else ok('no /risks API');
if (!/GrokAgents/.test(page) || !/variant="drivers"/.test(page)) bad('OPEN GROK missing on Drivers');
else ok('OPEN GROK on Drivers');
if (/cockpit-risk-add/.test(page)) bad('risk-add seed on Drivers page');
else ok('no risk-add on Drivers page');
if (/<th>Driver<\/th>/.test(page) && /#\/\$\{slug\}\/driver\//.test(page) && !/ON-PLAN/.test(page)) {
  ok('clickable driver rows');
} else bad('rows not clickable');
if (/#\/\$\{slug\}\/driver\//.test(page)) ok('rows go to /driver/id');
else bad('row route');
if (/No engines pinned/.test(page) || /Add driver/.test(page)) ok('empty until user pins engines');
else bad('empty copy');
if (/<th>Claim<\/th>/.test(page) && />KEEP</.test(page)) bad('still house TOC cull on glass');
else ok('no TOC cull table');
if (/kind-legend/.test(page) || /CALENDAR/.test(page) || /stance-strip/.test(page)) {
  bad('extra chrome (legend / calendar / pulse)');
} else ok('no Kind/calendar/pulse');

const copy = src('src/metricCopy.js');
if (/id: 'print'/.test(copy) && /id: 'condition'/.test(copy) && /id: 'catalyst'/.test(copy)) ok('kinds in fixture');
else bad('kinds');
if (/id: 'risk'/.test(copy)) bad('kind=risk still on Drivers copy');
else ok('no kind=risk');
if (/status: 'WATCH'/.test(copy) || /status: 'FIRED'/.test(copy) || /status: 'INTACT'/.test(copy)) {
  bad('mock rows still use WATCH/FIRED/INTACT');
} else ok('mock status is TRACK/ON-PLAN/OFF-PLAN');
if (/proto-m1-ads/.test(copy) && /proto-m3-muse/.test(copy) && /M1 —/.test(copy)) ok('register-weight mock');
else bad('mock fixture');
if (/HOUSE_CANDIDATES_META/.test(copy) && /houseCandidatesForDesk/.test(copy)) ok('house candidates META-only');
else bad('house candidates');

const detail = src('src/pages/thin/Driver.jsx');
if (/FIGURES/.test(detail) && /DUE DILIGENCE/.test(detail) && /<h2>RESEARCH<\/h2>/.test(detail) && /STILL OPEN/.test(detail)
  && /prose wide/.test(detail) && /variant="driver"/.test(detail)
  && !/MONITORS/.test(detail) && !/KILL/.test(detail) && !/nvdaDriverProto/.test(detail) && !/ON-PLAN/.test(detail)) {
  ok('dossier is figures, due diligence, research, still open');
} else bad('detail');
if (/Nothing logged yet/.test(detail)) ok('empty log copy');
else bad('empty log');
if (!/GrokAgents/.test(detail) || !/variant="driver"/.test(detail)) bad('OPEN GROK missing on driver detail');
else ok('OPEN GROK on driver detail');
if (/cockpit-risk-add/.test(detail)) bad('risk-add on driver detail');
else ok('no risk-add on driver detail');

const router = src('src/pages/thin/DeskRouter.jsx');
if (/ThinDrivers/.test(router) && /startsWith\('drivers'\)/.test(router) && /ThinDriver/.test(router)) ok('DeskRouter drivers');
else bad('DeskRouter');
if (/startsWith\('drivers'\) return <ThinRisks/.test(router)) bad('Drivers mounts Risks');
else ok('no Risks on /drivers');

const app = src('src/App.jsx');
if (/\/drivers`\)\) return `#\/\$\{slug\}\/drivers`/.test(app)) ok('App highlight /drivers');
else bad('App highlight');
if (/\/metrics`\)\) return `#\/\$\{slug\}\/risks`/.test(app)) bad('App still highlights /metrics as Risks');
else ok('metrics hash not Risks');

const rail = src('src/thinDesks.js');
if (/\$\{L\} Drivers/.test(rail) && /\/drivers`/.test(rail) && !/\$\{L\} Metrics/.test(rail)) ok('rail Drivers');
else bad('rail');

const add = buildInitialPrompt({ action: 'risk-add', desk: 'tsla' });
if (/\/cockpit-risk-add tsla/.test(add) && !/\/cockpit-metric-add/.test(add)) ok('risk-add seed still risk-*');
else bad(`risk-add seed ${add}`);
const dadd = buildInitialPrompt({ action: 'driver-add', desk: 'meta' });
if (/\/cockpit-driver-add meta/.test(dadd)) ok('driver-add seed');
else bad(`driver-add seed ${dadd}`);
const dsess = buildInitialPrompt({ action: 'drivers-session', desk: 'meta' });
if (/\/cockpit-drivers meta --session/.test(dsess)) ok('drivers-session seed');
else bad(`drivers-session ${dsess}`);
const rvar = listGrokAgents({ variant: 'register' });
const def = (rvar.agents || []).find((a) => a.action === rvar.default_action);
if (/Edit register in Grok/i.test(def?.label || '')) ok('register default still Edit register');
else bad(`register default ${def?.label}`);
if ((rvar.agents || []).some((a) => a.action === 'driver-add')) bad('driver-add leaked into register');
else ok('register menu has no Add driver');
const dvar = listGrokAgents({ variant: 'drivers' });
const ddef = (dvar.agents || []).find((a) => a.action === dvar.default_action);
if (/Edit drivers in Grok/i.test(ddef?.label || '')) ok('drivers default Edit drivers');
else bad(`drivers default ${ddef?.label}`);
if ((dvar.agents || []).some((a) => a.action === 'risk-add')) bad('Add risk leaked into drivers');
else ok('drivers menu has no Add risk');

if (fail) {
  console.log(`\nmetrics-proto-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nmetrics-proto-test OK');
