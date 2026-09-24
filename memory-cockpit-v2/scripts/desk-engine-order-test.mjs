#!/usr/bin/env node
/**
 * New-ticker book order is enforced, not just described.
 * House confirmed → register closed → drivers (empty legal).
 * SAVE DRAFT writes nothing. Drivers GO does not touch house or 08.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const KERNEL = path.join(HERE, '../..');

function acceptedShape(statusLine) {
  const rows = [1, 2, 3, 4].map((i) => `### R${i} — Risk ${i}
- **Status:** WATCH · **Grade:** [A] · Body.
| Signal | Tripwire | Current state | As-of |
| --- | --- | --- | --- |
| A | B | C | 2026-01-01 |`).join('\n');
  return `# 08
**Status:** ${statusLine}
${rows}
`;
}

const FORMING = `---
status: FORMING
---
# House · **FORMING**
Scaffold. Not the book yet.
`;

const CONFIRMED = `---
status: CONFIRMED
---
# House · **CONFIRMED 2026-09-21**
**Stance:** Ads funder.

## Engine
This house lives on FoA ads mix holding and Muse attach through Instagram.
`;

if (process.env.ENG_ORDER_WORKER !== '1') {
  let fail = 0;
  const ok = (m) => console.log('  ✓', m);
  const bad = (m) => { fail += 1; console.log('  ✗', m); };
  const cmd = (name) => fs.readFileSync(path.join(KERNEL, '.grok/commands', name), 'utf8');
  const desk = cmd('cockpit-new-desk.md');
  const prop = cmd('cockpit-propose.md');
  if (/House, then register, then drivers/.test(desk) && /drivers-closeout\.mjs/.test(desk)) {
    ok('new-desk command continues into drivers');
  } else bad('new-desk command skips drivers');
  if (/SAVE DRAFT on the register does not start Drivers/.test(desk)) ok('save-draft register does not start drivers');
  else bad('save-draft gate missing from new-desk');
  if (/print the heading \*\*DRIVERS\*\*/.test(desk) && /name the side of the business/.test(desk) && /do \*\*not\*\* edit the house/.test(desk)) {
    ok('setup names the DRIVERS step and does not rewrite the house');
  } else bad('setup drivers prompt missing heading or house rule');
  if (/Print the heading \*\*DRIVERS\*\*/.test(prop) && /name their own/.test(prop) && /do \*\*not\*\* rewrite the house/.test(prop)) {
    ok('propose command: user can name a driver; house is not auto-edited');
  } else bad('propose drivers section');
  if (/same terminal, drivers/.test(prop) && /do \*\*not\*\* flow into drivers/.test(prop)) {
    ok('propose command: drivers only after register GO');
  } else bad('propose command order');

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'eng-order-'));
  const vault = path.join(tmp, 'wiki');
  fs.mkdirSync(path.join(vault, 'cockpit', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'cockpit', 'proposals'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'raw', 'engord-research'), { recursive: true });
  const fmSrc = path.join(HERE, '../../research-wiki/cockpit/lib/fm.js');
  const alt = path.join(HERE, '../../../cockpit-vault/cockpit/lib/fm.js');
  if (fs.existsSync(fmSrc)) fs.copyFileSync(fmSrc, path.join(vault, 'cockpit', 'lib', 'fm.js'));
  else if (fs.existsSync(alt)) fs.copyFileSync(alt, path.join(vault, 'cockpit', 'lib', 'fm.js'));
  const r = spawnSync(process.execPath, [SELF], {
    env: { ...process.env, ENG_ORDER_WORKER: '1', COCKPIT_VAULT: vault, COCKPIT_GO_COMMIT_NO_COMPILE: '1' },
    encoding: 'utf8',
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  fs.rmSync(tmp, { recursive: true, force: true });
  if (fail || r.status !== 0) {
    console.log('\ndesk-engine-order-test FAIL');
    process.exit(1);
  }
  console.log('\ndesk-engine-order-test OK');
  process.exit(0);
}

const vault = process.env.COCKPIT_VAULT;
const { goCommitRegister, goCommitDrivers } = await import('../server/goCommit.js');
const { proposeKeepDriver, parseDriversMarkdown, readDriversSource, driversSourceRel } = await import('../server/driverProposals.js');
const { registerCloseout } = await import('./register-closeout.mjs');
const { driversOk } = await import('./drivers-closeout.mjs');

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const housePath = path.join(vault, 'house-view-engord.md');
const eightPath = path.join(vault, 'raw', 'engord-research', '08-risks-catalysts.md');
const ninePath = path.join(vault, 'raw', 'engord-research', '09-drivers.md');
fs.writeFileSync(housePath, FORMING);
fs.writeFileSync(eightPath, '# 08\n### R1 — Legal\n- **Status:** WATCH\n');

function reg(utterance) {
  return goCommitRegister({
    slug: 'engord',
    houseFile: 'house-view-engord.md',
    risksSourceRel: 'raw/engord-research/08-risks-catalysts.md',
    utterance,
    compile: false,
  });
}
function drv(utterance, ids) {
  return goCommitDrivers({
    slug: 'engord',
    houseFile: 'house-view-engord.md',
    utterance,
    compile: false,
    proposalIds: ids,
  });
}
function throws(fn) {
  try {
    fn();
    return '';
  } catch (e) {
    return e.message || String(e);
  }
}

const eightThin = fs.readFileSync(eightPath, 'utf8');
let msg = throws(() => reg('SAVE DRAFT'));
if (/SAVE DRAFT does not write/i.test(msg) && fs.readFileSync(eightPath, 'utf8') === eightThin) ok('SAVE DRAFT does not write the register');
else bad(`save draft register: ${msg}`);
msg = throws(() => reg('GO'));
if (/not CONFIRMED/i.test(msg)) ok('register GO refused before house');
else bad(`register before house: ${msg}`);
msg = throws(() => drv('GO'));
if (/not CONFIRMED/i.test(msg) && !fs.existsSync(ninePath)) ok('drivers GO refused before house, no 09');
else bad(`drivers before house: ${msg}`);

fs.writeFileSync(housePath, CONFIRMED);
const houseConfirmed = fs.readFileSync(housePath, 'utf8');
msg = throws(() => drv('GO'));
if (/Register is not closed/i.test(msg) && /thin/i.test(msg) && !fs.existsSync(ninePath)) {
  ok('drivers GO refused while register is thin');
} else bad(`drivers on thin register: ${msg}`);
msg = throws(() => reg('GO'));
if (/thin/i.test(msg)) ok('register GO refused while 08 is thin');
else bad(`thin register GO: ${msg}`);

fs.writeFileSync(eightPath, acceptedShape('**DRAFT** — not ACCEPTED.'));
msg = throws(() => drv('GO'));
if (/Register is not closed/i.test(msg) && !fs.existsSync(ninePath)) ok('drivers GO refused on a draft register');
else bad(`drivers on draft register: ${msg}`);

const closed = reg('GO');
if (closed.ok && closed.kind === 'register') ok('register GO after confirmed house');
else bad('register GO');
const regBar = registerCloseout('engord', { vault });
if (regBar.pass) ok('register-closeout PASS');
else bad(regBar.reason);
const houseAfterRegister = fs.readFileSync(housePath, 'utf8');
const eightAfterRegister = fs.readFileSync(eightPath, 'utf8');
if (houseAfterRegister === houseConfirmed) ok('register GO did not edit the house');
else bad('register GO edited the house');

msg = throws(() => drv('SAVE DRAFT'));
if (/SAVE DRAFT does not write/i.test(msg) && !fs.existsSync(ninePath)) ok('SAVE DRAFT does not open drivers');
else bad(`save draft drivers: ${msg}`);

const empty = drv('GO');
if (empty.ok && empty.kind === 'drivers') ok('empty drivers GO');
else bad('empty drivers GO');
const nine = fs.readFileSync(ninePath, 'utf8');
const emptyBar = driversOk(nine);
if (emptyBar.ok && emptyBar.n === 0 && /\*\*ACCEPTED\*\*/.test(nine)) ok('empty drivers closeout PASS');
else bad(`empty closeout ${JSON.stringify(emptyBar)}`);
if (fs.readFileSync(housePath, 'utf8') === houseAfterRegister && fs.readFileSync(eightPath, 'utf8') === eightAfterRegister) {
  ok('empty drivers GO left house and 08 unchanged');
} else bad('empty drivers GO touched house or 08');

const keep = proposeKeepDriver({
  slug: 'engord',
  title: 'FoA ads mix',
  house_cite: 'This house lives on FoA ads mix holding',
  watching: 'impressions and price',
});
const pinned = drv('GO', [keep.proposal.id]);
if (!pinned.ok) bad('pin GO');
const rows = parseDriversMarkdown(readDriversSource(driversSourceRel('engord')).text);
if (rows.length === 1 && /ads mix/i.test(rows[0].name) && rows[0].status == null) ok('one engine pinned, no status');
else bad(`rows ${JSON.stringify(rows)}`);
if (fs.readFileSync(housePath, 'utf8') === houseAfterRegister && fs.readFileSync(eightPath, 'utf8') === eightAfterRegister) {
  ok('pinning a driver left house and 08 unchanged');
} else bad('pin touched house or 08');
const afterPin = fs.readFileSync(ninePath, 'utf8');

const badCite = proposeKeepDriver({
  slug: 'engord',
  title: 'Not in the book',
  house_cite: 'totally absent sentence from nowhere',
  watching: 'nope',
});
msg = throws(() => drv('GO', [badCite.proposal.id]));
if (/not in the CONFIRMED house/i.test(msg) && fs.readFileSync(ninePath, 'utf8') === afterPin) {
  ok('cite outside the house refused, 09 unchanged');
} else bad(`bad cite: ${msg}`);

if (fail) {
  console.log(`\ndesk-engine-order worker FAIL ${fail}`);
  process.exit(1);
}
console.log('  worker sequence ok');
