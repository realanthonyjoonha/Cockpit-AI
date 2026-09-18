#!/usr/bin/env node
/**
 * GO / SAVE DRAFT / EDIT classifier. EDIT and SAVE DRAFT must never look like GO.
 */
import {
  classifyHouseUtterance,
  isGoUtterance,
  isEditUtterance,
  isSaveDraftUtterance,
  mayCommit,
  mayProposeIntent,
  assertGoUtterance,
  DUMP_PROMPT,
  REGISTER_DUMP_PROMPT,
} from '../server/houseUtterance.js';
import { assertProposeHouseMarkdown } from '../server/houseStance.js';

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const expect = (got, want, m) => {
  if (got === want) ok(m);
  else bad(`${m}: got ${got} want ${want}`);
};

expect(classifyHouseUtterance('GO'), 'go', 'GO');
expect(classifyHouseUtterance('looks good'), 'go', 'looks good → go');
expect(classifyHouseUtterance("that's my house"), 'go', "that's my house → go");
expect(classifyHouseUtterance('CONFIRM'), 'go', 'CONFIRM → go');
expect(classifyHouseUtterance('ACCEPT REGISTER'), 'go', 'ACCEPT REGISTER → go');
expect(classifyHouseUtterance('SAVE DRAFT'), 'save_draft', 'SAVE DRAFT');
expect(classifyHouseUtterance('save-draft'), 'save_draft', 'save-draft');
expect(classifyHouseUtterance('EDIT'), 'edit', 'EDIT');
expect(classifyHouseUtterance('edit the stance — HBM mix not IDM'), 'edit', 'EDIT + delta');
expect(classifyHouseUtterance('change the load-bearing view'), 'edit', 'change → edit');
expect(classifyHouseUtterance('fix R2 tripwires'), 'edit', 'fix → edit');
expect(classifyHouseUtterance('drop R7'), 'edit', 'drop Rn → edit');
expect(classifyHouseUtterance('rewrite the stance'), 'edit', 'rewrite → edit');
expect(classifyHouseUtterance('not yet'), 'edit', 'not yet → edit');
expect(classifyHouseUtterance('STOP'), 'stop', 'STOP');
expect(classifyHouseUtterance(''), 'unknown', 'empty unknown');
expect(classifyHouseUtterance('maybe later'), 'unknown', 'maybe later unknown');

if (isGoUtterance('GO') && !isGoUtterance('EDIT') && !isGoUtterance('SAVE DRAFT')) ok('isGoUtterance exclusive');
else bad('isGoUtterance exclusive');
if (isEditUtterance('EDIT') && isSaveDraftUtterance('SAVE DRAFT')) ok('edit/save flags');
else bad('edit/save flags');
if (mayCommit('GO') && !mayCommit('EDIT') && !mayCommit('SAVE DRAFT') && !mayCommit('change the stance')) {
  ok('mayCommit only GO');
} else bad('mayCommit leaked');
if (mayProposeIntent('go') && !mayProposeIntent('save_draft') && !mayProposeIntent('edit')) ok('mayProposeIntent only GO');
else bad('mayProposeIntent');

try {
  assertGoUtterance('EDIT');
  bad('assertGoUtterance EDIT should throw');
} catch (e) {
  if (/EDIT does not write/i.test(e.message)) ok('assertGoUtterance refuses EDIT');
  else bad(e.message);
}
try {
  assertGoUtterance('change the stance');
  bad('change should throw');
} catch (e) {
  if (/EDIT does not write/i.test(e.message)) ok('assertGoUtterance refuses change-as-edit');
  else bad(e.message);
}
try {
  assertGoUtterance('SAVE DRAFT');
  bad('SAVE DRAFT should throw');
} catch (e) {
  if (/SAVE DRAFT/i.test(e.message)) ok('assertGoUtterance refuses SAVE DRAFT');
  else bad(e.message);
}
try {
  assertGoUtterance('GO');
  ok('assertGoUtterance GO');
} catch (e) {
  bad(e.message);
}

const forming = `---
status: FORMING
---
# House · **FORMING**
**Stance:** Constructive on a cash engine.
### The load-bearing view
${'x'.repeat(900)}
`;
try {
  assertProposeHouseMarkdown(forming, 'edit');
  bad('propose intent edit should throw');
} catch (e) {
  if (/EDIT does not propose/i.test(e.message)) ok('propose_house refuses intent=edit');
  else bad(e.message);
}

if (/\bGO\b/.test(DUMP_PROMPT) && /SAVE DRAFT/.test(DUMP_PROMPT) && /\bEDIT\b/.test(DUMP_PROMPT)) {
  ok('house dump prompt names three words');
} else bad('DUMP_PROMPT');
if (/\bGO\b/.test(REGISTER_DUMP_PROMPT) && /SAVE DRAFT/.test(REGISTER_DUMP_PROMPT) && /\bEDIT\b/.test(REGISTER_DUMP_PROMPT)) {
  ok('register dump prompt names three words');
} else bad('REGISTER_DUMP_PROMPT');

if (fail) {
  console.log(`\nhouse-utterance-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nhouse-utterance-test OK');
