// operate-glance-test.mjs — START multi-desk glance (empty + content installs)
// Decision-support only.
import { operateGlance } from '../server/operateGlance.js';

let pass = 0;
let fail = 0;
function ok(cond, msg) {
  if (cond) {
    pass += 1;
    console.log(`  ✓ ${msg}`);
  } else {
    fail += 1;
    console.error(`  ✗ ${msg}`);
  }
}

console.log('\noperate-glance\n');

const g = operateGlance();
ok(g && g.ok === true, 'ok true');
ok(Array.isArray(g.desks), 'desks array');
ok(g.totals && typeof g.totals.desks === 'number', 'totals.desks');
ok(g.totals.desks === g.desks.length, 'totals match length');
ok(g.decision_support_only === true, 'decision_support_only');

if (g.desks.length === 0) {
  ok(true, 'empty install path (0 desks)');
} else {
  const row = g.desks[0];
  ok(!!row.slug && !!row.ticker, 'row has slug+ticker');
  ok(Array.isArray(row.attention), 'row.attention array');
  ok(typeof row.watch_count === 'number', 'watch_count number');
  ok(typeof row.street_status === 'string' || row.street_status == null, 'street_status');
}

if (fail) {
  console.error(`\noperate-glance FAIL — ${pass} pass ${fail} fail\n`);
  process.exit(1);
}
console.log(`\noperate-glance PASS — ${pass} pass 0 fail\n`);
