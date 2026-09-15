#!/usr/bin/env node
/**
 * dogfood-fixture-test.mjs — sealed fixture is DOGF only, never kernel books.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { injectDogfoodFixture, assertInjectableRoot } from './dogfood-fixture.mjs';

let pass = 0;
let fail = 0;
const ok = (n) => { pass += 1; console.log(`  ✓ ${n}`); };
const bad = (n) => { fail += 1; console.log(`  ✗ ${n}`); };

console.log('\ndogfood-fixture\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-dogfood-fix-'));
fs.mkdirSync(path.join(tmp, 'memory-cockpit-v2', 'config'), { recursive: true });
fs.writeFileSync(path.join(tmp, 'memory-cockpit-v2', 'config', 'thin-desks.json'), JSON.stringify({
  rooms: ['overview', 'filings'],
  desks: [{ slug: 'nvda', ticker: 'NVDA' }],
}, null, 2));
// Pretend someone pointed research-wiki at kernel vault.
fs.symlinkSync(os.tmpdir(), path.join(tmp, 'research-wiki'));

const r = injectDogfoodFixture(tmp);
const td = JSON.parse(fs.readFileSync(path.join(tmp, 'memory-cockpit-v2', 'config', 'thin-desks.json'), 'utf8'));
if (td.desks.length === 1 && td.desks[0].slug === 'dogf') ok('registry is DOGF only (NVDA stripped)');
else bad(`desks=${JSON.stringify(td.desks)}`);
if (td.rooms.includes('filings') && td.rooms.includes('background')) ok('filings + background rooms present');
else bad('rooms missing filings/background');

const wikiStat = fs.lstatSync(path.join(tmp, 'research-wiki'));
if (!wikiStat.isSymbolicLink()) ok('vault symlink replaced with a real dir');
else bad('research-wiki still a symlink (would leak kernel vault)');

const house = fs.readFileSync(path.join(tmp, 'research-wiki', 'house-view-dogf.md'), 'utf8');
if (/Flip[- ]triggers/.test(house) && /FORMING/.test(house) && !/NVDA/.test(house)) ok('fixture house has flip-triggers, no NVDA');
else bad('house fixture');

const risks = fs.readFileSync(path.join(tmp, 'research-wiki', 'raw/dogf-research/08-risks-catalysts.md'), 'utf8');
if (/R1 — Gross margin/.test(risks) && /WATCH/.test(risks)) ok('fixture WATCH risk R1');
else bad('risks fixture');

const blob = JSON.stringify(td) + house + risks;
if (!/nbis|nvda|avgo/i.test(blob)) ok('no dogfood-book tickers in fixture SoR');
else bad('ticker leak in fixture');

const prevVault = process.env.COCKPIT_VAULT;
process.env.COCKPIT_VAULT = path.join(tmp, 'research-wiki');
const { pipelineSnapshot, clearSecMemCache } = await import('../server/secEdgar.js');
clearSecMemCache();
const snap = await pipelineSnapshot('DOGF', { compiledAt: '2026-08-01T00:00:00Z' });
if (snap.available && snap.cache_only && snap.last_print?.form === '10-Q') {
  ok('pipelineSnapshot uses compile-lane cache when ticker is not in SEC universe');
} else {
  bad(`pipeline cache ${JSON.stringify({ available: snap.available, cache_only: snap.cache_only, print: snap.last_print })}`);
}
const secUniverse = path.join(tmp, 'research-wiki', 'cockpit', 'compile', '_sec', 'company_tickers.json');
if (!fs.existsSync(secUniverse)) ok('fixture pipeline did not download SEC universe');
else bad('fixture pipeline hit SEC universe (should use compile-lane cache first)');
if (prevVault == null) delete process.env.COCKPIT_VAULT;
else process.env.COCKPIT_VAULT = prevVault;

const kernelLive = path.join(os.homedir(), 'Desktop', 'cockpit-kernel');
if (fs.existsSync(kernelLive)) {
  let threw = false;
  try { assertInjectableRoot(kernelLive); } catch (e) { threw = /live tree/.test(String(e.message || e)); }
  if (threw) ok('fixture refuses live kernel (no desk rewrite)');
  else bad('fixture did not refuse live kernel');
}

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ndogfood-fixture PASS — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
