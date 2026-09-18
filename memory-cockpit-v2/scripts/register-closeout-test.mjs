#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { registerCloseout } from './register-closeout.mjs';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'register-closeout-'));
fs.mkdirSync(path.join(tmp, 'raw', 'tsla-research'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'raw', 'nvda-research'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'raw', 'meta-research'), { recursive: true });
fs.mkdirSync(path.join(tmp, 'cockpit', 'proposals'), { recursive: true });

const forming = `---
status: FORMING
---
# House · **FORMING**
**Stance:** (edit after research — do not invent)
Scaffold created 2026-09-17. Replace this body with your underwriting.
`;
const confirmed = `---
status: CONFIRMED
---
# House · **CONFIRMED 2026-09-17**
**Stance:** Constructive on a franchise.
`;
function eight({ n = 4, accepted = false }) {
  let s = `# 08\n**Status:** ${accepted ? '**ACCEPTED** 2026-09-17' : '**DRAFT** — not ACCEPTED.'}\n`;
  for (let i = 1; i <= n; i++) {
    s += `### R${i} — Risk ${i}\n- **Status:** WATCH · **Grade:** [A] · Body.\n`;
    s += `| Signal | Tripwire | Current state | As-of |\n|--------|----------|---------------|-------|\n| A | B | C | 2026-01-01 |\n| D | E | F | 2026-01-01 |\n`;
  }
  return s;
}

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

fs.writeFileSync(path.join(tmp, 'house-view-tsla.md'), forming);
fs.writeFileSync(path.join(tmp, 'raw', 'tsla-research', '08-risks-catalysts.md'), eight({ n: 6, accepted: true }));
let r = registerCloseout('tsla', { vault: tmp });
if (!r.pass && /not CONFIRMED/i.test(r.reason)) ok('house not CONFIRMED → FAIL first');
else bad(`expected house-first fail: ${r.reason}`);

fs.writeFileSync(path.join(tmp, 'house-view-nvda.md'), confirmed);
fs.writeFileSync(path.join(tmp, 'raw', 'nvda-research', '08-risks-catalysts.md'), '# empty\n');
r = registerCloseout('nvda', { vault: tmp });
if (!r.pass && /08 missing or thin/i.test(r.reason)) ok('CONFIRMED house + empty 08 → FAIL');
else bad(`expected thin 08: ${r.reason}`);

fs.writeFileSync(path.join(tmp, 'raw', 'nvda-research', '08-risks-catalysts.md'), eight({ n: 6, accepted: true }));
r = registerCloseout('nvda', { vault: tmp });
if (r.pass) ok('CONFIRMED + ACCEPTED 08 → PASS');
else bad(`expected pass accepted 08: ${r.reason}`);

fs.writeFileSync(path.join(tmp, 'house-view-meta.md'), confirmed);
fs.writeFileSync(path.join(tmp, 'raw', 'meta-research', '08-risks-catalysts.md'), eight({ n: 6, accepted: false }));
r = registerCloseout('meta', { vault: tmp });
if (!r.pass && /DRAFT/i.test(r.reason)) ok('CONFIRMED + DRAFT 08, no chips → FAIL');
else bad(`expected draft fail: ${r.reason}`);

const chips = { version: 1, slug: 'meta', proposals: [] };
for (let i = 1; i <= 4; i++) {
  chips.proposals.push({ id: `p${i}`, kind: 'add_risk', status: 'pending', title: `Risk ${i}` });
}
fs.writeFileSync(path.join(tmp, 'cockpit', 'proposals', 'risks-meta.json'), JSON.stringify(chips));
r = registerCloseout('meta', { vault: tmp });
if (r.pass) ok('CONFIRMED + DRAFT 08 + pending add_risk ≥4 → PASS');
else bad(`expected chips pass: ${r.reason}`);

fs.rmSync(tmp, { recursive: true, force: true });
if (fail) {
  console.log(`\nregister-closeout-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nregister-closeout-test OK');
