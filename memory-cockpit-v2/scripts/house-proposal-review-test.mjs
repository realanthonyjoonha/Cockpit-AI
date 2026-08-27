#!/usr/bin/env node
/**
 * house-proposal-review-test.mjs — readable house proposal review payload.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { reviewHouseProposal, diffLines } = await import(path.join(ROOT, 'server', 'houseProposals.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nhouse proposal review\n');

const current = `---
type: house-view
ticker: MU
updated: 2026-08-04
status: CONFIRMED — Anthony 2026-08-04
---

# House View — Micron (MU)

> **Stance:** Constructive on Micron as a U.S. IDM.

Flip triggers stay as written.
`;

const proposed = `---
type: house-view
ticker: MU
updated: 2026-08-27
status: CONFIRMED — Anthony 2026-08-04
---

# House View — Micron (MU)

> **Stance:** Constructive on Micron as a U.S. IDM.

Print: 16 SCAs and ~$100B min-price RPO.
Flip triggers stay as written.
`;

const rev = reviewHouseProposal(current, proposed);
if (!rev.fields.some((f) => f.key === 'updated' && /2026-08-27/.test(f.to))) {
  bad(`updated field ${JSON.stringify(rev.fields)}`);
} else ok('updated date in WHAT CHANGES');
if (rev.fields.some((f) => f.key === 'stance')) bad('stance should be unchanged');
else ok('stance unchanged omitted');
if (!rev.html || !/House View/.test(rev.html)) bad('proposed html missing');
else ok('proposed house HTML for prose render');
if (!rev.hunks.some((h) => h.t === 'add' && /16 SCAs/.test(h.s))) {
  bad(`hunks missing add ${JSON.stringify(rev.hunks)}`);
} else ok('body add shows in VS LIVE HOUSE');
if (rev.unchanged) bad('should not be unchanged');
else ok('not marked unchanged');

const same = reviewHouseProposal(current, current);
if (!same.unchanged) bad('identical draft should be unchanged');
else ok('identical draft unchanged');

const ops = diffLines('a\nb\n', 'a\nc\n');
if (!ops.some((o) => o.t === 'del' && o.s === 'b') || !ops.some((o) => o.t === 'add' && o.s === 'c')) {
  bad(`diffLines ${JSON.stringify(ops)}`);
} else ok('diffLines del/add');

console.log(`\nhouse-proposal-review ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
