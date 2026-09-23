#!/usr/bin/env node
/** Log append writes 09 only. Cite must be in the house. No status. JS parser matches Python. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SELF = fileURLToPath(import.meta.url);
const ROOT = path.join(HERE, '../..');

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

if (process.env.DRV_LOG_WORKER !== '1') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'drv-log-'));
  const vault = path.join(tmp, 'wiki');
  fs.mkdirSync(path.join(vault, 'cockpit', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'cockpit', 'proposals'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'raw', 'drvlog-research'), { recursive: true });
  const fmSrc = path.join(HERE, '../../research-wiki/cockpit/lib/fm.js');
  const alt = path.join(HERE, '../../../cockpit-vault/cockpit/lib/fm.js');
  if (fs.existsSync(fmSrc)) fs.copyFileSync(fmSrc, path.join(vault, 'cockpit', 'lib', 'fm.js'));
  else if (fs.existsSync(alt)) fs.copyFileSync(alt, path.join(vault, 'cockpit', 'lib', 'fm.js'));
  fs.writeFileSync(path.join(vault, 'house-view-drvlog.md'), CONFIRMED);
  fs.writeFileSync(path.join(vault, 'raw', 'drvlog-research', '08-risks-catalysts.md'), acceptedRegister());
  const r = spawnSync(process.execPath, [SELF], {
    env: { ...process.env, DRV_LOG_WORKER: '1', COCKPIT_VAULT: vault, COCKPIT_GO_COMMIT_NO_COMPILE: '1' },
    encoding: 'utf8',
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(r.status === 0 ? 0 : 1);
}

const vault = process.env.COCKPIT_VAULT;
const { goCommitDrivers } = await import('../server/goCommit.js');
const {
  proposeKeepDriver,
  proposeDriverLog,
  parseDriversMarkdown,
  readDriversSource,
  driversSourceRel,
} = await import('../server/driverProposals.js');

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const housePath = path.join(vault, 'house-view-drvlog.md');
const eightPath = path.join(vault, 'raw', 'drvlog-research', '08-risks-catalysts.md');
const houseBefore = fs.readFileSync(housePath, 'utf8');
const eightBefore = fs.readFileSync(eightPath, 'utf8');
const rel = driversSourceRel('drvlog');
const ninePath = path.join(vault, rel);

function go(ids) {
  return goCommitDrivers({
    slug: 'drvlog',
    houseFile: 'house-view-drvlog.md',
    utterance: 'GO',
    compile: false,
    proposalIds: ids,
  });
}

try {
  proposeKeepDriver({
    slug: 'drvlog',
    title: 'Not in the book',
    house_cite: 'totally absent sentence from nowhere',
    watching: 'nope',
    houseMarkdown: houseBefore,
  });
  bad('cite outside house should throw at propose');
} catch (e) {
  if (/not in the CONFIRMED house/i.test(e.message)) ok('propose refuses cite missing from house');
  else bad(e.message);
}

const badKeep = proposeKeepDriver({
  slug: 'drvlog',
  title: 'Not in the book',
  house_cite: 'totally absent sentence from nowhere',
  watching: 'nope',
});
try {
  go([badKeep.proposal.id]);
  bad('GO should refuse cite missing from house');
} catch (e) {
  if (/not in the CONFIRMED house/i.test(e.message)) ok('GO refuses cite missing from house');
  else bad(e.message);
}
if (!fs.existsSync(ninePath)) ok('failed GO did not create 09');
else bad('09 created on failed cite');

const ads = proposeKeepDriver({
  slug: 'drvlog',
  title: 'FoA ads mix',
  house_cite: 'This house lives on FoA ads mix holding',
  watching: 'impressions and price',
  why: 'Ads are the funder.',
  figures: [{ item: 'Impressions', figure: '+14%', note: 'Q2' }],
});
const muse = proposeKeepDriver({
  slug: 'drvlog',
  title: 'Muse attach',
  house_cite: 'Muse attach through Instagram',
  watching: 'attach that makes capex ok',
});
const pinned = go([ads.proposal.id, muse.proposal.id]);
if (pinned.ok) ok('GO two engines');
else bad('pin GO');

let rows = parseDriversMarkdown(readDriversSource(rel).text);
if (rows.length === 2 && rows[0].figures?.[0]?.figure === '+14%' && rows[1].name === 'Muse attach') {
  ok('figures on the pin');
} else bad(`pin rows ${JSON.stringify(rows.map((r) => r.name))}`);

try {
  proposeDriverLog({ slug: 'drvlog', driver: 'FoA ads mix', via: 'rumor', fact: 'x', date: '2026-09-21' });
  bad('bad via should throw');
} catch (e) {
  if (/via must be/i.test(e.message)) ok('refuse unknown via');
  else bad(e.message);
}

try {
  proposeDriverLog({ slug: 'drvlog', driver: 'no such engine', via: 'print', fact: 'x', date: '2026-09-21' });
  const pendingLog = proposeDriverLog({ slug: 'drvlog', driver: 'no such engine', via: 'print', fact: 'missing', date: '2026-09-21' });
  go([pendingLog.proposal.id]);
  bad('missing driver should throw');
} catch (e) {
  if (/driver not found/i.test(e.message)) ok('log refuses unknown driver');
  else bad(e.message);
}

const log1 = proposeDriverLog({
  slug: 'drvlog',
  driver: 'D1',
  date: '2026-09-20',
  via: 'print',
  fact: 'impressions +14%',
});
const log2 = proposeDriverLog({
  slug: 'drvlog',
  driver: 'FoA ads mix',
  date: '2026-09-21',
  via: 'news',
  fact: 'a headline after the print',
  figures: [{ item: 'Impressions', figure: '+15%', note: 'news does not replace the print' }],
});
if (go([log1.proposal.id]).ok && go([log2.proposal.id]).ok) ok('two log GOs');
else bad('log GO');

rows = parseDriversMarkdown(readDriversSource(rel).text);
const d1 = rows.find((r) => r.rid === 'D1');
const d2 = rows.find((r) => r.rid === 'D2');
if (d1?.log?.length === 2 && d1.log[0].date === '2026-09-21' && d1.log[1].via === 'print') ok('newest log first');
else bad(`log order ${JSON.stringify(d1?.log)}`);
if (d1?.figures?.[0]?.figure === '+15%') ok('print/news can replace figures when asked');
else bad(`figures ${JSON.stringify(d1?.figures)}`);
if (d2 && !(d2.log || []).length && /Muse attach through Instagram/.test(d2.house)) ok('other engine untouched');
else bad('D2 mutated');
if (d1?.checked === '2026-09-21' && /headline/.test(d1.last || '')) ok('list last is the newest fact');
else bad(`last ${d1?.last}`);

const q = proposeDriverLog({
  slug: 'drvlog',
  driver: 'Muse attach',
  open: 'Does attach still fund the capex?',
});
const q2 = proposeDriverLog({
  slug: 'drvlog',
  driver: 'Muse attach',
  open: 'Does attach still fund the capex?',
});
if (go([q.proposal.id, q2.proposal.id]).ok) ok('open-question GO');
else bad('open GO');
rows = parseDriversMarkdown(readDriversSource(rel).text);
const museRow = rows.find((r) => r.rid === 'D2');
if (museRow?.open?.length === 1 && /fund the capex/.test(museRow.open[0]) && !(museRow.log || []).length) {
  ok('duplicate question not doubled, no empty log line');
} else bad(`open ${JSON.stringify(museRow)}`);

const text = readDriversSource(rel).text;
if (!/\*\*Status:\*\*/.test(text) && !/ON-PLAN|OFF-PLAN/.test(text)) ok('log file has no status');
else bad('status in 09');
if (fs.readFileSync(housePath, 'utf8') === houseBefore) ok('house unchanged after logs');
else bad('house mutated');
if (fs.readFileSync(eightPath, 'utf8') === eightBefore) ok('08 unchanged after logs');
else bad('08 mutated');

const code = `
from pathlib import Path
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'ontology'))})
from compile.from_nebius_drivers import parse_drivers_md
print(json.dumps(parse_drivers_md(Path(${JSON.stringify(ninePath)}).read_text(), id_prefix="drvlog")))
`;
const py = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
if (py.status !== 0) bad(py.stderr || 'python');
else {
  const got = JSON.parse(py.stdout);
  const js = parseDriversMarkdown(readDriversSource(rel).text);
  const same = got.length === js.length && got.every((d, i) => d.id === js[i].id && d.log.length === js[i].log.length && d.open.length === js[i].open.length);
  if (same && got.every((d) => d.status == null)) ok('python parser matches glass ids');
  else bad(`parity js=${js.map((d) => d.id)} py=${got.map((d) => d.id)}`);
}

if (fail) {
  console.log(`\ndrivers-log-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\ndrivers-log-test OK');
