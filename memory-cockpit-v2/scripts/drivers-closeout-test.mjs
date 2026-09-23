#!/usr/bin/env node
import { driversOk } from './drivers-closeout.mjs';

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

if (driversOk('').ok && driversOk('# Drivers\n').ok) ok('empty PASS');
else bad('empty');

const good = `### D1 — Ads
- **House:** «funder»
- **Watching:** impressions
`;
if (driversOk(good).ok) ok('Dn with House PASS');
else bad('good');

const badMd = `### D1 — Ads
- **Last:** x
- **Status:** TRACK
`;
if (!driversOk(badMd).ok) ok('Dn without House FAIL');
else bad('should fail missing House');

const rn = `### R1 — Legal\n- **Status:** WATCH\n`;
if (driversOk(rn).ok && driversOk(rn).n === 0) ok('Rn ignored (empty PASS)');
else bad('Rn');

if (fail) {
  console.log(`\ndrivers-closeout-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\ndrivers-closeout-test OK');
