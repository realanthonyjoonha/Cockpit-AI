#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { houseCloseout } from './house-closeout.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'house-closeout-'));
const proposals = path.join(tmp, 'cockpit', 'proposals');
fs.mkdirSync(proposals, { recursive: true });

const scaffold = `---
status: FORMING
---

# House View — Tesla · **FORMING**

**Stance:** (edit after research — do not invent)

Scaffold created 2026-09-17. Replace this body with your underwriting. Agents may propose; you ACCEPT.

## Acceptance log
| Date | Status |
| 2026-09-17 | Scaffold only — FORMING |
`;

const formingFull = `${'x'.repeat(900)}
**Stance:** Constructive on a materials-engineering franchise conditional on leading-edge mix.

### The load-bearing view

Applied sells process equipment. FY2025 revenue is filed. This paragraph exists so the closeout bar is not a stub.
${'y'.repeat(900)}

### What looks advantaged
- filed mix

### Flip triggers
- mix
`;

const confirmedFull = `---
status: CONFIRMED
---
# House · **CONFIRMED 2026-09-18**
${formingFull}
`;

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

fs.writeFileSync(path.join(tmp, 'house-view-tsla.md'), scaffold);
let r = houseCloseout('tsla', { vault: tmp });
if (!r.pass) ok('TSLA-class: scaffold + no proposal → FAIL');
else bad('tsla should fail');

fs.writeFileSync(path.join(tmp, 'house-view-formingpend.md'), scaffold);
fs.writeFileSync(path.join(proposals, 'house-formingpend.json'), JSON.stringify({
  version: 1,
  slug: 'formingpend',
  proposals: [{
    id: 'hp_forming',
    status: 'pending',
    markdown: formingFull,
    bytes: formingFull.length,
  }],
}));
r = houseCloseout('formingpend', { vault: tmp });
if (!r.pass) ok('FORMING pending does not PASS closeout');
else bad('FORMING pending must not pass house-closeout');

fs.writeFileSync(path.join(tmp, 'house-view-amat.md'), scaffold);
fs.writeFileSync(path.join(proposals, 'house-amat.json'), JSON.stringify({
  version: 1,
  slug: 'amat',
  proposals: [{
    id: 'hp_test',
    status: 'pending',
    markdown: confirmedFull,
    bytes: confirmedFull.length,
  }],
}));
r = houseCloseout('amat', { vault: tmp });
if (r.pass) ok('AMAT-class: scaffold + pending CONFIRMED proposal → PASS');
else bad(`amat should pass: ${r.reason}`);

fs.writeFileSync(path.join(tmp, 'house-view-nvda.md'), confirmedFull);
r = houseCloseout('nvda', { vault: tmp });
if (r.pass) ok('live non-scaffold house, no pending → PASS');
else bad(`nvda should pass: ${r.reason}`);

const confirmedWithLog = `---
status: CONFIRMED
---

# House View — Eli Lilly · **CONFIRMED 2026-08-23**

**Stance:** Constructive on Lilly as owner of the next oral + injectable incretin layer.

### The load-bearing view
${'z'.repeat(500)}

## Acceptance log
| Date | Status |
| 2026-08-24 | Scaffold only — FORMING |
| 2026-08-23 | CONFIRMED |
`;
fs.writeFileSync(path.join(tmp, 'house-view-lly.md'), confirmedWithLog);
r = houseCloseout('lly', { vault: tmp });
if (r.pass) ok('CONFIRMED house with scaffold-only log row → PASS (not TSLA-class)');
else bad(`lly false FAIL: ${r.reason}`);

fs.rmSync(tmp, { recursive: true, force: true });
if (fail) {
  console.log(`\nhouse-closeout-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nhouse-closeout-test OK');
