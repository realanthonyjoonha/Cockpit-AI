#!/usr/bin/env node
/**
 * Fixture: GO commit writes CONFIRMED pending; SAVE DRAFT / FORMING / no-id refuse.
 * Spawns a worker with COCKPIT_VAULT=tmp so houseProposals bind the fixture vault.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const GLASS = path.join(HERE, '..');
const KERNEL = path.join(GLASS, '..');
const SELF = fileURLToPath(import.meta.url);

const SCAFFOLD = `---
status: FORMING
---
# House · **FORMING**
**Stance:** (edit after research — do not invent)
Scaffold created 2026-09-17. Replace this body with your underwriting. Agents may propose; you ACCEPT.
`;

const CONFIRMED = `---
status: CONFIRMED
---
# House · **CONFIRMED 2026-09-17**
**Stance:** Constructive on a cash engine conditional on mix.
### The load-bearing view
${'x'.repeat(900)}
`;

const FORMING_FULL = `---
status: FORMING
---
# House · **FORMING**
**Stance:** Constructive on a cash engine conditional on mix.
### The load-bearing view
${'x'.repeat(900)}
`;

function eight({ n = 4, accepted = false }) {
  let s = `# 08\n**Status:** ${accepted ? '**ACCEPTED** 2026-09-17' : '**DRAFT** — not ACCEPTED.'}\n`;
  for (let i = 1; i <= n; i++) {
    s += `### R${i} — Risk ${i}\n- **Status:** WATCH · **Grade:** [A] · Body.\n`;
    s += `| Signal | Tripwire | Current state | As-of |\n|--------|----------|---------------|-------|\n| A | B | C | 2026-01-01 |\n| D | E | F | 2026-01-01 |\n`;
  }
  return s;
}

if (process.env.GO_COMMIT_WORKER !== '1') {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'go-commit-'));
  const vault = path.join(tmp, 'wiki');
  fs.mkdirSync(path.join(vault, 'cockpit', 'lib'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'cockpit', 'proposals'), { recursive: true });
  fs.mkdirSync(path.join(vault, 'raw', 'gocom-research'), { recursive: true });
  const fmSrc = path.join(KERNEL, 'research-wiki', 'cockpit', 'lib', 'fm.js');
  fs.copyFileSync(fmSrc, path.join(vault, 'cockpit', 'lib', 'fm.js'));
  fs.writeFileSync(path.join(vault, 'house-view-gocom.md'), SCAFFOLD);
  fs.writeFileSync(path.join(vault, 'raw', 'gocom-research', '08-risks-catalysts.md'), eight({ n: 6, accepted: false }));
  const r = spawnSync(process.execPath, [SELF], {
    env: {
      ...process.env,
      GO_COMMIT_WORKER: '1',
      COCKPIT_VAULT: vault,
      COCKPIT_REPO: tmp,
      COCKPIT_GO_COMMIT_NO_COMPILE: '1',
    },
    encoding: 'utf8',
  });
  process.stdout.write(r.stdout || '');
  process.stderr.write(r.stderr || '');
  fs.rmSync(tmp, { recursive: true, force: true });
  process.exit(r.status === 0 ? 0 : 1);
}

const vault = process.env.COCKPIT_VAULT;
const {
  isGoUtterance,
  goCommitHouse,
  goCommitRegister,
  readSession,
} = await import('../server/goCommit.js');
const { proposeHouse, listHouseProposals } = await import('../server/houseProposals.js');
const { proposeAddRisk } = await import('../server/riskProposals.js');

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

if (isGoUtterance('GO') && isGoUtterance('looks good') && isGoUtterance("that's my house")) ok('GO aliases');
else bad('GO aliases');
if (!isGoUtterance('SAVE DRAFT') && !isGoUtterance('') && !isGoUtterance('stop')) ok('SAVE DRAFT / empty not GO');
else bad('SAVE DRAFT should not be GO');

const liveBefore = () => fs.readFileSync(path.join(vault, 'house-view-gocom.md'), 'utf8');

try {
  goCommitHouse({
    slug: 'gocom',
    proposalId: 'hp_missing',
    houseFile: 'house-view-gocom.md',
    utterance: 'GO',
    compile: false,
  });
  bad('missing proposal should throw');
} catch (e) {
  if (/not found|required/i.test(e.message)) ok('refuse missing proposal');
  else bad(e.message);
}

try {
  proposeHouse({
    slug: 'gocom',
    ticker: 'GOCOM',
    houseFile: 'house-view-gocom.md',
    markdown: FORMING_FULL,
    rationale: 'save draft fixture',
    summary: 'FORMING',
    source: 'go_commit_test',
    intent: 'save_draft',
  });
  bad('propose FORMING should throw');
} catch (e) {
  if (/FORMING|SAVE DRAFT/i.test(e.message)) ok('proposeHouse refuses FORMING');
  else bad(e.message);
}

const leftoverId = 'hp_forming_leftover';
fs.mkdirSync(path.join(vault, 'cockpit', 'proposals'), { recursive: true });
fs.writeFileSync(path.join(vault, 'cockpit', 'proposals', 'house-gocom.json'), JSON.stringify({
  version: 1,
  slug: 'gocom',
  proposals: [{
    id: leftoverId,
    status: 'pending',
    slug: 'gocom',
    ticker: 'GOCOM',
    house_file: 'house-view-gocom.md',
    markdown: FORMING_FULL,
    will_write: 'FORMING',
    bytes: FORMING_FULL.length,
    created_at: new Date().toISOString(),
  }],
}, null, 2));
try {
  goCommitHouse({
    slug: 'gocom',
    proposalId: leftoverId,
    houseFile: 'house-view-gocom.md',
    utterance: 'GO',
    compile: false,
  });
  bad('FORMING pending should not GO-commit');
} catch (e) {
  if (/CONFIRMED/i.test(e.message)) ok('refuse GO commit of leftover FORMING pending');
  else bad(e.message);
}
if (/status: FORMING/i.test(liveBefore()) && /edit after research/i.test(liveBefore())) {
  ok('live house unchanged after FORMING refuse');
} else bad('live house mutated on refuse');

try {
  goCommitHouse({
    slug: 'gocom',
    proposalId: leftoverId,
    houseFile: 'house-view-gocom.md',
    utterance: 'SAVE DRAFT',
    compile: false,
  });
  bad('SAVE DRAFT utterance should throw');
} catch (e) {
  if (/SAVE DRAFT/i.test(e.message)) ok('refuse SAVE DRAFT utterance');
  else bad(e.message);
}

try {
  goCommitHouse({
    slug: 'gocom',
    proposalId: leftoverId,
    houseFile: 'house-view-gocom.md',
    utterance: 'EDIT',
    compile: false,
  });
  bad('EDIT utterance should throw');
} catch (e) {
  if (/EDIT does not write/i.test(e.message)) ok('refuse EDIT utterance');
  else bad(e.message);
}

try {
  goCommitHouse({
    slug: 'gocom',
    proposalId: leftoverId,
    houseFile: 'house-view-gocom.md',
    utterance: 'change the stance',
    compile: false,
  });
  bad('change-as-edit should throw');
} catch (e) {
  if (/EDIT does not write/i.test(e.message)) ok('refuse change-as-edit utterance');
  else bad(e.message);
}

try {
  goCommitRegister({
    slug: 'gocom',
    houseFile: 'house-view-gocom.md',
    risksSourceRel: 'raw/gocom-research/08-risks-catalysts.md',
    utterance: 'GO',
    compile: false,
  });
  bad('register before CONFIRMED house should throw');
} catch (e) {
  if (/not CONFIRMED/i.test(e.message)) ok('register refused until house CONFIRMED');
  else bad(e.message);
}

const conf = proposeHouse({
  slug: 'gocom',
  ticker: 'GOCOM',
  houseFile: 'house-view-gocom.md',
  markdown: CONFIRMED,
  rationale: 'go fixture',
  summary: 'CONFIRMED',
  source: 'go_commit_test',
  intent: 'go',
});
const wrote = goCommitHouse({
  slug: 'gocom',
  proposalId: conf.proposal.id,
  houseFile: 'house-view-gocom.md',
  utterance: 'GO',
  ticker: 'GOCOM',
  compile: false,
});
if (wrote.ok && wrote.live_status === 'CONFIRMED') ok('GO commit writes live CONFIRMED');
else bad(`write result ${JSON.stringify(wrote.live_status)}`);
const live = liveBefore();
if (/^status:\s*CONFIRMED/im.test(live) && !/edit after research/i.test(live)) ok('vault house is CONFIRMED body');
else bad('vault house not the CONFIRMED proposal');
if (wrote.snapshot && fs.existsSync(path.join(vault, wrote.snapshot))) ok('previous house snapshotted');
else bad('missing snapshot');
const sess = readSession('gocom');
if (sess.phase === 'HOUSE_COMMITTED') ok('session HOUSE_COMMITTED');
else bad(`session ${sess.phase}`);
const listed = listHouseProposals('gocom');
const acc = listed.proposals.find((p) => p.id === conf.proposal.id);
if (acc?.status === 'accepted') ok('proposal marked accepted');
else bad('proposal not accepted');
if (fs.existsSync(path.join(vault, 'cockpit', 'go-commit-log.jsonl'))) ok('audit jsonl');
else bad('missing audit');

const stillForming = listed.proposals.find((p) => p.id === leftoverId);
if (stillForming?.status === 'pending') ok('FORMING pending still pending (glass alternate)');
else bad('FORMING pending was consumed');

const add = proposeAddRisk({
  slug: 'gocom',
  ticker: 'GOCOM',
  risksSourceRel: 'raw/gocom-research/08-risks-catalysts.md',
  body: {
    title: 'Extra chip risk',
    summary: 'chip for GO commit',
    mechanism: 'fixture mechanism',
    grade: 'B',
    status: 'WATCH',
    tripwires: [
      { signal: 'A', tripwire: 'B', state: 'C', as_of: '2026-01-01' },
    ],
  },
});
const reg = goCommitRegister({
  slug: 'gocom',
  houseFile: 'house-view-gocom.md',
  risksSourceRel: 'raw/gocom-research/08-risks-catalysts.md',
  utterance: 'GO',
  ticker: 'GOCOM',
  compile: false,
});
if (reg.ok && reg.header_accepted) ok('register GO marks ACCEPTED header');
else bad(`register ${reg.error || JSON.stringify(reg)}`);
const eightNow = fs.readFileSync(path.join(vault, 'raw', 'gocom-research', '08-risks-catalysts.md'), 'utf8');
if (/\*\*ACCEPTED\*\*/i.test(eightNow)) ok('08 header ACCEPTED');
else bad('08 still DRAFT');
if (readSession('gocom').phase === 'REGISTER_COMMITTED') ok('session REGISTER_COMMITTED');
else bad(`session after register ${readSession('gocom').phase}`);
if (add?.proposal?.id && (reg.applied || []).some((x) => x.id === add.proposal.id)) {
  ok('pending add_risk chip applied');
} else bad('chip not applied');

if (fail) {
  console.log(`\ngo-commit-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\ngo-commit-test OK');
