#!/usr/bin/env node
/** House Overview lede — scaffold must not dump ## tables. */
import { stanceLine, isScaffoldStance } from '../server/houseStance.js';

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nhouse stance lede\n');

const scaffold = `---
status: FORMING
---

# House View — Meta Platforms (META) · **FORMING**

**Stance:** (edit after research — do not invent)

Scaffold created 2026-09-17. Replace this body with your underwriting. Agents may propose; you ACCEPT.

## Acceptance log

| Date | Status |
|------|--------|
| 2026-09-17 | Scaffold only — FORMING |
`;

const s1 = stanceLine({ view_excerpt: scaffold });
if (s1 == null) ok('FORMING scaffold does not become Overview lede');
else bad(`scaffold leaked: ${s1}`);

const flat = scaffold.replace(/\n/g, ' ');
const s2 = stanceLine({ view_excerpt: flat });
if (s2 == null) ok('flattened pack excerpt still hides scaffold');
else bad(`flat leaked: ${s2}`);

const nvda = `**Stance:** **Constructive on NVIDIA as the full-stack merchant AI infrastructure platform — with the bull case conditional on Data Center demand digestion, export regime stability under a zero-China-compute baseline, and concentration not breaking the print.**

Not a rating. Not sizing.

### The load-bearing view
`;
const s3 = stanceLine({ view_excerpt: nvda });
if (s3 && /Constructive on NVIDIA/.test(s3) && !/load-bearing/.test(s3)) {
  ok('CONFIRMED house keeps the stance, not the next heading');
} else bad(`nvda ${s3}`);

if (isScaffoldStance('edit after research — do not invent')) ok('scaffold detector');
else bad('scaffold detector');

if (fail) {
  console.log(`\nhouse-stance FAIL ${fail}  pass ${pass}`);
  process.exit(1);
}
console.log(`\nhouse-stance OK ${pass}`);
