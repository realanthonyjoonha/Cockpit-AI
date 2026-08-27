#!/usr/bin/env node
/** report-schedule-test.mjs — earnings arm is due-logic only; no invented dates. */
import { pickLatestPrint, scheduleDue } from '../server/reportSchedule.js';

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nreport-schedule\n');

const print = pickLatestPrint([
  { form: '4', filed: '2026-08-20' },
  { form: '10-Q', filed: '2026-08-26', url: 'https://sec.gov/a' },
  { form: '8-K', filed: '2026-08-27', items: '5.02' },
]);
if (print && print.date === '2026-08-26' && print.form === '10-Q') ok('picks latest 10-Q; ignores Form 4 and non-2.02 8-K');
else bad(`print ${JSON.stringify(print)}`);

const e8 = pickLatestPrint([{ form: '8-K', filed: '2026-08-28', items: '2.02' }]);
if (e8 && e8.date === '2026-08-28') ok('8-K item 2.02 counts as print');
else bad(`8k ${JSON.stringify(e8)}`);

if (pickLatestPrint([{ form: '4', filed: '2026-08-20' }]) === null) ok('no print → UNKNOWN (null)');
else bad('invented a print');

if (!scheduleDue({ armed: false, printDate: '2026-08-26' })) ok('disarmed → not due');
else bad('disarmed due');

if (scheduleDue({ armed: true, printDate: '2026-08-26', lastCompleteAt: null, ackPrint: null })) {
  ok('armed + print + no report → due');
} else bad('should be due');

if (!scheduleDue({ armed: true, printDate: '2026-08-26', lastCompleteAt: '2026-08-27T01:00:00Z' })) {
  ok('complete earnings-update after print → not due');
} else bad('still due after report');

if (!scheduleDue({ armed: true, printDate: '2026-08-26', ackPrint: '2026-08-26' })) {
  ok('acked print → not due');
} else bad('ack ignored');

if (!scheduleDue({ armed: true, printDate: null })) ok('UNKNOWN print → not due');
else bad('due without date');

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
