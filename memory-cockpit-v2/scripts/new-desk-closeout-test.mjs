#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { newDeskCloseout, stampResearchStatus } from './new-desk-closeout.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'new-desk-closeout-'));
fs.mkdirSync(path.join(tmp, 'raw', 'tsla-research'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'cockpit', 'proposals'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'house-view-tsla.md'), `---
status: FORMING
---
# House · **FORMING**
**Stance:** (edit after research — do not invent)
Scaffold created 2026-09-17. Replace this body with your underwriting. Agents may propose; you ACCEPT.
`);
fs.writeFileSync(path.join(tmp, 'raw', 'tsla-research', '00-research-status.md'), '# status\n\nDEEP done?\n');

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const r = newDeskCloseout('tsla', { vault: tmp });
if (!r.pass) ok('new-desk-closeout FAIL on TSLA-class stub');
else bad('should fail');
const stamped = fs.readFileSync(path.join(tmp, 'raw', 'tsla-research', '00-research-status.md'), 'utf8');
if (/cockpit:house-closeout:FAIL:/.test(stamped)) ok('stamped FAIL on 00-research-status');
else bad('missing FAIL stamp');

const iso = '2026-09-17T00:00:00.000Z';
stampResearchStatus(path.join(tmp, 'raw', 'tsla-research', '00-research-status.md'), true, iso);
const stamped2 = fs.readFileSync(path.join(tmp, 'raw', 'tsla-research', '00-research-status.md'), 'utf8');
if (stamped2.includes('cockpit:house-closeout:PASS:2026-09-17T00:00:00.000Z') && !stamped2.includes(':FAIL:')) {
  ok('PASS stamp replaces FAIL');
} else bad('stamp replace');

fs.rmSync(tmp, { recursive: true, force: true });
if (fail) {
  console.log(`\nnew-desk-closeout-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nnew-desk-closeout-test OK');
