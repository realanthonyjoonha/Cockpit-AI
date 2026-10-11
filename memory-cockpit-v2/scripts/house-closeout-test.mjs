#!/usr/bin/env node
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { houseCloseout } from './house-closeout.mjs';
import { HOUSE_OUTSIDE_WRITE_GAP, readHouseWriteAudit } from '../server/thinHouseSave.js';

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

const prose = `${confirmedFull}\nHARNESS-HOUSE-PROSE-NOT-IN-LOG\n`;
fs.writeFileSync(path.join(tmp, 'house-view-audit.md'), prose);
const logDir = path.join(tmp, 'cockpit');
fs.mkdirSync(logDir, { recursive: true });
const logPath = path.join(logDir, 'house-write-log.jsonl');
const beforeRead = fs.existsSync(logPath);
const bare = readHouseWriteAudit(tmp, 'house-view-nvda.md', confirmedFull, { exists: true });
if (!bare.mismatch && bare.state === 'no_audit' && fs.existsSync(logPath) === beforeRead) {
  ok('missing house-write log is no audit yet and does not baseline');
} else bad(`missing log ${JSON.stringify(bare)}`);
r = houseCloseout('nvda', { vault: tmp });
if (r.pass && r.audit_state === 'no_audit') ok('no audit yet still passes a real house');
else bad(`nvda after audit read: ${r.reason}`);

const hash = crypto.createHash('sha256').update(prose, 'utf8').digest('hex');
fs.appendFileSync(logPath, `${JSON.stringify({ house_file: 'house-view-audit.md', sha256: hash, at: '2026-01-15T00:00:00.000Z' })}\n`);
if (!fs.readFileSync(logPath, 'utf8').includes('HARNESS-HOUSE-PROSE-NOT-IN-LOG')) ok('hash log has no house prose');
else bad('hash log stored house prose');
const matched = readHouseWriteAudit(tmp, 'house-view-audit.md', prose, { exists: true });
if (!matched.mismatch && matched.state === 'match') ok('glass-save bytes without an append match');
else bad(`match audit ${JSON.stringify(matched)}`);
r = houseCloseout('audit', { vault: tmp });
if (r.pass) ok('matching hash clears house-closeout');
else bad(`audit match closeout: ${r.reason}`);

fs.appendFileSync(path.join(tmp, 'house-view-audit.md'), '\nBASH-BYPASS-CANARY\n');
const mismatched = readHouseWriteAudit(tmp, 'house-view-audit.md', fs.readFileSync(path.join(tmp, 'house-view-audit.md'), 'utf8'), { exists: true });
if (mismatched.mismatch && mismatched.gap === HOUSE_OUTSIDE_WRITE_GAP) ok('shell append after a logged write mismatches');
else bad(`mismatch audit ${JSON.stringify(mismatched)}`);
r = houseCloseout('audit', { vault: tmp });
if (!r.pass && r.gap === HOUSE_OUTSIDE_WRITE_GAP) ok('append cannot clear house-closeout');
else bad(`audit mismatch closeout: ${r.reason}`);

fs.rmSync(tmp, { recursive: true, force: true });
if (fail) {
  console.log(`\nhouse-closeout-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nhouse-closeout-test OK');
