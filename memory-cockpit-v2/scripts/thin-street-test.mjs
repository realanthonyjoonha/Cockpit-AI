#!/usr/bin/env node
/**
 * thin-street-test.mjs — Street v2 complete-row gate (why 3–5 sentences + URL).
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-street-'));
process.env.COCKPIT_VAULT = tmpVault;

const { getStreet, refreshStreet } = await import(path.join(ROOT, 'server', 'thinStreet.js'));
const { validateStreetSnapshot, WHY_MIN_LEN } = await import(path.join(ROOT, 'server', 'streetSchema.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

console.log('\nthin-street agentic v2\n');

const why = (s) => `${s} Second sentence adds mechanism detail from the note. Third sentence ties the published target to that assumption without inventing figures.`;

const firm = (name, pt, rating = 'Buy') => ({
  firm: name,
  rating,
  pt,
  date: '2026-08-01',
  why: why(`${name} set a $${pt} target citing documented demand and margin assumptions in their published note.`),
  source_url: `https://example.com/research/${name.replace(/\s+/g, '-').toLowerCase()}`,
  flag: pt >= 120 ? 'bull' : 'bear',
});

const goodBody = {
  schema_version: 2,
  ticker: 'TEST',
  frame: 'How to read: calendar-year figures from published notes; street only, not house.',
  bull: 'Bull desks capitalize multi-year demand visibility and scarcity pricing in published models.',
  bear: 'Skeptic desks haircut terminal growth and cite rich positioning in published notes.',
  consensus: { pt_avg: 110, pt_low: 100, pt_high: 130, tally: '3 models', rating: 'Mixed' },
  firms: [firm('Alpha', 130), firm('Beta', 100, 'Hold'), firm('Gamma', 110)],
};

if (!validateStreetSnapshot(goodBody, { ticker: 'TEST' }).ok) bad('good should pass');
else ok('complete snapshot validates');

const shortWhy = {
  ...goodBody,
  firms: [{ ...firm('Alpha', 130), why: 'Too short.' }],
};
if (validateStreetSnapshot(shortWhy, { ticker: 'TEST' }).ok) bad('short why');
else ok('short why rejected');

const noUrl = {
  ...goodBody,
  firms: goodBody.firms.map((f, i) => (i === 0 ? { ...f, source_url: null } : f)),
};
if (validateStreetSnapshot(noUrl, { ticker: 'TEST' }).ok) bad('no url');
else ok('missing URL rejected');

const empty = await refreshStreet('TEST', {});
if (empty.ok) bad('empty body');
else ok('empty body no scrape overwrite');

const pub = await refreshStreet('TEST', goodBody);
if (!pub.ok || pub.firms?.length !== 3) bad(`publish ${pub.error}`);
else ok(`publish 3 complete firms`);

const get = getStreet('TEST');
if (!get.available || get.needs_rebuild) bad('get should be complete');
else ok('GET shows complete models only');

if (!get.firms.every((f) => f.why && f.why.length >= WHY_MIN_LEN && f.source_url)) bad('cells incomplete');
else ok('no empty why/url cells on GET');

// incomplete legacy file should surface as EMPTY needs rebuild
const legacyPath = path.join(tmpVault, 'cockpit', 'street', 'LEG.json');
fs.mkdirSync(path.dirname(legacyPath), { recursive: true });
fs.writeFileSync(legacyPath, JSON.stringify({
  schema_version: 1,
  ticker: 'LEG',
  firms: [{ firm: 'X', pt: null, rating: null }],
  provider: 'nasdaq-public',
}));
const leg = getStreet('LEG');
if (leg.available) bad('legacy incomplete should not display as available table');
else ok('legacy sparse → EMPTY rebuild CTA');

try { fs.rmSync(tmpVault, { recursive: true, force: true }); } catch { /* */ }

console.log(`\nthin-street agentic ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
