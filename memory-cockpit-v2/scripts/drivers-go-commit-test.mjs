#!/usr/bin/env node
/** Gate 3: GO kind=drivers writes 09, not 08. Empty legal. house_cite required. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);

function acceptedRegister() {
  const rows = [1, 2, 3, 4].map((i) => `### R${i} — Risk ${i}
- **Status:** WATCH · **Grade:** [A] · Body.
| Signal | Tripwire | Current state | As-of |
| --- | --- | --- | --- |
| A | B | C | 2026-01-01 |`).join('\n');
  return `# 08
**Status:** **ACCEPTED** 2026-09-21 — GO in Grok
${rows}
`;
}
const CONFIRMED = `---
status: CONFIRMED
---
# House · **CONFIRMED 2026-09-20**
**Stance:** Ads funder. Attach is why capex is ok.

## Engine
This house lives on FoA ads mix holding and Muse attach through Instagram.
`;

if (process.env.DRV_GO_WORKER !== '1') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drv-go-'));
  const vault = path.join(tmp, 'wiki');
  fs.mkdirSync(path.join(vault, 'cockpit', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'cockpit', 'proposals'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'raw', 'drvgo-research'), { recursive: true });
  const fmSrc = path.join(HERE, '../../research-wiki/cockpit/lib/fm.js');
  if (fs.existsSync(fmSrc)) fs.copyFileSync(fmSrc, path.join(vault, 'cockpit', 'lib', 'fm.js'));
  else {
    const alt = path.join(HERE, '../../../cockpit-vault/cockpit/lib/fm.js');
    if (fs.existsSync(alt)) fs.copyFileSync(alt, path.join(vault, 'cockpit', 'lib', 'fm.js'));
  }
  fs.writeFileSync(path.join(vault, 'house-view-drvgo.md'), CONFIRMED);
  fs.writeFileSync(path.join(vault, 'raw', 'drvgo-research', '08-risks-catalysts.md'), acceptedRegister());
  const r = spawnSync(process.execPath, [SELF], {
    env: { ...process.env, DRV_GO_WORKER: '1', COCKPIT_VAULT: vault, COCKPIT_GO_COMMIT_NO_COMPILE: '1' },
    encoding: 'utf8',
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(r.status === 0 ? 0 : 1);
}

const vault = process.env.COCKPIT_VAULT;
const { goCommitDrivers } = await import('../server/goCommit.js');
const { proposeKeepDriver, parseDriversMarkdown, readDriversSource, driversSourceRel } = await import('../server/driverProposals.js');

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const eightBefore = fs.readFileSync(path.join(vault, 'raw', 'drvgo-research', '08-risks-catalysts.md'), 'utf8');

try {
  proposeKeepDriver({ slug: 'drvgo', title: 'no cite' });
  bad('keep without cite should throw');
} catch (e) {
  if (/house_cite/i.test(e.message)) ok('refuse keep without house_cite');
  else bad(e.message);
}

try {
  goCommitDrivers({ slug: 'drvgo', houseFile: 'house-view-drvgo.md', utterance: 'SAVE DRAFT', compile: false });
  bad('SAVE DRAFT should throw');
} catch (e) {
  if (/GO|utterance|SAVE DRAFT/i.test(e.message)) ok('SAVE DRAFT not GO');
  else bad(e.message);
}

const houseBefore = fs.readFileSync(path.join(vault, 'house-view-drvgo.md'), 'utf8');

try {
  proposeKeepDriver({
    slug: 'drvgo',
    title: 'FoA ads mix',
    house_cite: 'This house lives on FoA ads mix holding',
    status: 'ON-PLAN',
  });
  bad('status should throw');
} catch (e) {
  if (/no status/i.test(e.message)) ok('refuse status on a driver');
  else bad(e.message);
}

try {
  proposeKeepDriver({
    slug: 'drvgo',
    title: 'The load-bearing view',
    house_cite: 'This house lives on FoA ads mix holding',
  });
  bad('heading title should throw');
} catch (e) {
  if (/house heading/i.test(e.message)) ok('refuse house heading as engine');
  else bad(e.message);
}

const k = proposeKeepDriver({
  slug: 'drvgo',
  title: 'FoA ads mix',
  house_cite: 'This house lives on FoA ads mix holding',
  watching: 'impressions and price',
});
if (k.ok && k.proposal?.id) ok('keep pending');
else bad('keep');

const out = goCommitDrivers({
  slug: 'drvgo',
  houseFile: 'house-view-drvgo.md',
  utterance: 'GO',
  compile: false,
});
if (out.ok && out.kind === 'drivers') ok('GO drivers');
else bad(`GO ${JSON.stringify(out)}`);

const eightAfter = fs.readFileSync(path.join(vault, 'raw', 'drvgo-research', '08-risks-catalysts.md'), 'utf8');
if (eightAfter === eightBefore) ok('08 unchanged');
else bad('08 mutated');

const rel = driversSourceRel('drvgo');
const { text } = readDriversSource(rel);
const rows = parseDriversMarkdown(text);
if (rows.length === 1 && /ads mix/i.test(rows[0].name) && rows[0].house && /impressions/.test(rows[0].watching || '')) {
  ok('09 has D1 with House and Watching');
} else bad(`09 ${text.slice(0, 400)}`);
if (rows[0] && rows[0].status == null && !/\*\*Status:\*\*/.test(text) && !/ON-PLAN/.test(text)) ok('09 has no status');
else bad('status leaked into 09');
const houseAfter = fs.readFileSync(path.join(vault, 'house-view-drvgo.md'), 'utf8');
if (houseAfter === houseBefore) ok('house unchanged');
else bad('house mutated');
if (/\*\*ACCEPTED\*\*/.test(text)) ok('09 ACCEPTED header');
else bad('no ACCEPTED');
if (/### R1/.test(text)) bad('Rn in 09');
else ok('no Rn in 09');

const emptyVault = path.join(path.dirname(vault), 'empty');
// second GO empty on same slug after keeps applied — pending empty
const out2 = goCommitDrivers({
  slug: 'drvgo',
  houseFile: 'house-view-drvgo.md',
  utterance: 'looks good',
  compile: false,
});
if (out2.ok) ok('empty pending GO still ok');
else bad('empty pending GO');

if (fail) {
  console.log(`\ndrivers-go-commit-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\ndrivers-go-commit-test OK');
