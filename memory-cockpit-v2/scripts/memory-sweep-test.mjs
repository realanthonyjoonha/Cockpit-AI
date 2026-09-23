#!/usr/bin/env node
/**
 * Live agent law: GO writes, never FORMING on glass, risk register (not a Metrics page).
 * Does not rewrite vault 08. MCP tool ids stay propose_add_risk.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const KERNEL = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

const LIVE = [
  'AGENTS.md',
  'docs/SESSION.md',
  'docs/EASY.md',
  'OPERATE.md',
  'COLD-START.md',
  'README.md',
  '.grok/skills/cockpit/SKILL.md',
  '.grok/commands/cockpit-propose.md',
  '.grok/commands/cockpit-new-desk.md',
  '.grok/commands/cockpit-register.md',
  '.grok/commands/cockpit-risk-add.md',
  '.grok/skills/ib-report/SKILL.md',
  '.grok/skills/filing-map/SKILL.md',
  'memory-cockpit-v2/src/pages/thin/GrokAgents.jsx',
  'memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md',
  'memory-cockpit-v2/server/assistContext.js',
  'memory-cockpit-v2/server/houseUtterance.js',
  'memory-cockpit-v2/server/goCommit.js',
  'memory-cockpit-v2/scripts/mcp-cockpit-research.mjs',
];

const BANNED = [
  /SAVE DRAFT stays pending/i,
  /glass ACCEPT writes FORMING/i,
  /CONFIRM\/ACCEPT on glass/i,
  /Remind glass CONFIRM\/ACCEPT/i,
  /written ONLY when he ACCEPTs on glass/i,
  /propose, then glass \*\*ACCEPT\*\*/i,
  /House edit.*→ glass ACCEPT →/i,
  /you CONFIRM\/ACCEPT book gates/i,
  /SAVE DRAFT \(FORMING pending\)/i,
  /SAVE DRAFT parks/i,
  /SAVE DRAFT → pending chips/i,
  /label: 'Add metric'/i,
  /\/cockpit-metric-add/,
];

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

for (const rel of LIVE) {
  const fp = path.join(KERNEL, rel);
  if (!fs.existsSync(fp)) {
    bad(`missing live file ${rel}`);
    continue;
  }
  const t = fs.readFileSync(fp, 'utf8');
  for (const re of BANNED) {
    if (re.test(t)) bad(`${rel} still has ${re}`);
  }
}
if (!fail) ok(`${LIVE.length} live instruction files clean of banned memory phrases`);

const skill = fs.readFileSync(path.join(KERNEL, '.grok/skills/cockpit/SKILL.md'), 'utf8');
if (/commit_on_go/.test(skill) && /Never propose FORMING/.test(skill)) ok('SKILL teaches GO + FORMING ban');
else bad('SKILL missing commit_on_go / FORMING ban');

const agents = fs.readFileSync(path.join(KERNEL, 'AGENTS.md'), 'utf8');
if (/commit_on_go/.test(agents) && /Never propose FORMING/.test(agents)) {
  ok('AGENTS.md teaches GO + FORMING ban');
} else bad('AGENTS.md missing GO / FORMING');

const reg = fs.readFileSync(path.join(KERNEL, '.grok/commands/cockpit-register.md'), 'utf8');
if (/risk register/i.test(reg) && /OPEN GROK from Risks/.test(reg) && !/\*\*Kind:\*\* print/.test(reg)) {
  ok('cockpit-register dumps risk register from Risks');
} else bad('cockpit-register not restored');

const prompt = fs.readFileSync(path.join(KERNEL, 'memory-cockpit-v2/server/houseUtterance.js'), 'utf8');
if (/writes register/.test(prompt) && /pending chips/.test(prompt) === false) {
  ok('REGISTER_DUMP_PROMPT writes register');
} else bad('REGISTER_DUMP_PROMPT');

if (fail) {
  console.log(`\nmemory-sweep-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nmemory-sweep-test OK');
