#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildInitialPrompt, listGrokAgents } from '../server/openGrok.js';
import { listHouseDriverCandidates } from '../server/driverProposals.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');
let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const page = src('src/pages/thin/Drivers.jsx');
if (/<h2>DRIVERS<\/h2>/.test(page) && !/<h2>RISK REGISTER<\/h2>/.test(page)) ok('heading DRIVERS');
else bad('heading');
if (/api\(`\$\{slug\}\/drivers`\)/.test(page)) ok('list loads /drivers API');
else bad('API');
if (/HOUSE_CANDIDATES_META|METRICS_PROTO_ROWS/.test(page)) bad('still uses META costume as list source');
else ok('no META mock as SoR');
if (/variant="drivers"/.test(page) && !/cockpit-risk-add/.test(page)) ok('OPEN GROK drivers');
else bad('OPEN GROK');
if (/nvdaDriverProto|prototype · not vault/.test(page)) bad('NVDA prototype still on the list');
else ok('list is 09, not a prototype');
if (/#\/\$\{slug\}\/driver\//.test(page) && /<th>Driver<\/th>/.test(page) && /<th>Watching<\/th>/.test(page)) ok('rows open a driver page');
else bad('columns');
if (/<th>Claim<\/th>/.test(page) && />KEEP</.test(page)) bad('glass still a house TOC cull');
else ok('no heading KEEP table');
if (/Add driver/.test(page) || /engines/.test(page)) ok('empty/add is engines');
else ok('drivers page');

const mount = src('server/thinDeskMount.js');
if (/model\.drivers\(\)/.test(mount) && /\/api\/:slug\/drivers/.test(mount)) ok('GET /drivers');
else bad('mount');
if (/exists \? fromFile : fromPack/.test(src('server/thinModel.js'))) ok('09 file wins over a stale pack');
else bad('empty 09 must not fall back to pack.drivers');
if (/\/metrics', j\(withDesk\(\(rt\) => rt.model.risks/.test(mount)) bad('/metrics still aliases risks()');
else ok('/metrics not risks()');

const add = buildInitialPrompt({ action: 'risk-add', desk: 'tsla' });
if (/\/cockpit-risk-add tsla/.test(add)) ok('risk-add isolated');
else bad(add);
const dadd = buildInitialPrompt({ action: 'driver-add', desk: 'meta' });
if (/\/cockpit-driver-add meta/.test(dadd)) ok('driver-add seed');
else bad(dadd);
const drv = listGrokAgents({ variant: 'drivers' });
if (drv.default_action === 'drivers-session' && !drv.agents.some((a) => a.action === 'risk-add')) ok('drivers menu isolated');
else bad('drivers menu');
const reg = listGrokAgents({ variant: 'register' });
if (!reg.agents.some((a) => a.action === 'driver-add')) ok('register has no driver-add');
else bad('leak');

const toc = listHouseDriverCandidates(`# House
**Stance:** Constructive on SK hynix.

## The load-bearing view
SK hynix is a high fixed-cost memory manufacturer selling DRAM including HBM.

## What would change the view (flip triggers)
Cycle break two sequential revenue declines.

## Linked register
Risks: 08-risks-catalysts.md
`);
if (toc.length === 0) ok('parser does not emit house TOC as drivers');
else bad(`TOC leaked ${toc.map((c) => c.title).join(', ')}`);
if (toc.some((c) => /load-bearing|Stance|flip/i.test(c.title))) bad('heading titles as drivers');
else ok('no Stance/load-bearing/flip titles');

if (fail) {
  console.log(`\ndrivers-room-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\ndrivers-room-test OK');
