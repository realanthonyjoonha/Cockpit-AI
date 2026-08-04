#!/usr/bin/env node
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  validateStreetSnapshot,
  WHY_MIN_LEN,
  countSentences,
  isCompleteFirm,
} = await import(path.join(ROOT, 'server', 'streetSchema.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

const longWhy = 'First sentence states the published demand thesis behind the target. Second sentence cites the margin or growth assumption in the note. Third sentence links that assumption to the numeric price target without advising the reader.';

console.log('\nstreet-schema complete rows\n');

if (countSentences(longWhy) < 3) bad('sentence count');
else ok(`sentences=${countSentences(longWhy)}`);

const firm = {
  firm: 'Desk',
  pt: 10,
  rating: 'Buy',
  date: '2026-08-01',
  why: longWhy,
  source_url: 'https://example.com/a',
};

if (!isCompleteFirm(firm)) bad('complete firm');
else ok('isCompleteFirm');

const body = {
  schema_version: 2,
  ticker: 'X',
  frame: 'Read calendar published notes only; street catalog not house.',
  bull: 'Bull notes emphasize multi-year contracted demand and scarcity pricing.',
  bear: 'Bear notes emphasize cycle risk and rich positioning already in the print.',
  consensus: { pt_avg: 10, pt_low: 8, pt_high: 12, tally: '3' },
  firms: [
    firm,
    { ...firm, firm: 'B', pt: 8, source_url: 'https://example.com/b' },
    { ...firm, firm: 'C', pt: 12, source_url: 'https://example.com/c' },
  ],
};

let r = validateStreetSnapshot(body, { ticker: 'X' });
if (!r.ok) bad(r.errors.join('; '));
else ok('full snapshot ok');

r = validateStreetSnapshot({ ...body, firms: [firm] }, { ticker: 'X' });
if (r.ok) bad('min firms');
else ok('min 3 firms enforced');

r = validateStreetSnapshot({
  ...body,
  firms: body.firms.map((f, i) => (i === 0 ? { ...f, why: 'short' } : f)),
}, { ticker: 'X' });
if (r.ok) bad('short why');
else ok(`why min ${WHY_MIN_LEN}`);

console.log(`\nstreet-schema ${fail ? 'FAIL' : 'PASS'} — ${pass} pass ${fail} fail`);
process.exit(fail ? 1 : 0);
