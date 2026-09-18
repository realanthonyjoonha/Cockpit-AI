#!/usr/bin/env node
import { assertProposeHouseMarkdown, houseMarkdownStatus } from '../server/houseStance.js';

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const scaffold = `---
status: FORMING
---
# House · **FORMING**
**Stance:** (edit after research — do not invent)
Scaffold created 2026-09-17. Replace this body with your underwriting. Agents may propose; you ACCEPT.
`;

const forming = `---
status: FORMING
---
# House · **FORMING**
**Stance:** Constructive on a cash engine conditional on mix.
### The load-bearing view
${'x'.repeat(900)}
`;

const confirmed = `---
status: CONFIRMED
---
# House · **CONFIRMED 2026-09-17**
**Stance:** Constructive on a cash engine conditional on mix.
### The load-bearing view
${'x'.repeat(900)}
`;

try {
  assertProposeHouseMarkdown(scaffold);
  bad('scaffold should throw');
} catch (e) {
  if (/scaffold/i.test(e.message)) ok('refuse scaffold proposal');
  else bad(e.message);
}

try {
  assertProposeHouseMarkdown(forming);
  bad('FORMING markdown should throw even without intent');
} catch (e) {
  if (/refuses FORMING/i.test(e.message)) ok('refuse FORMING proposal (no glass chip)');
  else bad(e.message);
}

try {
  assertProposeHouseMarkdown(forming, 'go');
  bad('GO + FORMING should throw');
} catch (e) {
  if (/CONFIRMED/i.test(e.message)) ok('GO requires CONFIRMED markdown');
  else bad(e.message);
}

try {
  const st = assertProposeHouseMarkdown(confirmed, 'go');
  if (st === 'CONFIRMED') ok('GO + CONFIRMED allowed');
  else bad(st);
} catch (e) { bad(e.message); }

try {
  assertProposeHouseMarkdown(forming, 'save_draft');
  bad('SAVE DRAFT should throw');
} catch (e) {
  if (/SAVE DRAFT|FORMING does not propose/i.test(e.message)) ok('SAVE DRAFT does not propose');
  else bad(e.message);
}

try {
  assertProposeHouseMarkdown(forming, 'edit');
  bad('EDIT intent should throw');
} catch (e) {
  if (/EDIT does not propose/i.test(e.message)) ok('EDIT does not propose');
  else bad(e.message);
}

if (houseMarkdownStatus(confirmed) !== 'CONFIRMED') bad('status parse CONFIRMED');
else ok('houseMarkdownStatus CONFIRMED');

if (fail) {
  console.log(`\nhouse-propose-guard FAIL ${fail}`);
  process.exit(1);
}
console.log('\nhouse-propose-guard OK');
