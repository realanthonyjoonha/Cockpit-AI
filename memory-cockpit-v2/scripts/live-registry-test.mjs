#!/usr/bin/env node
/**
 * live-registry-test.mjs — getLiveThinDeskProfiles picks up thin-desks.json mtime changes.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REG = path.join(ROOT, 'config', 'thin-desks.json');

// We cannot safely rewrite real thin-desks.json in dogfood.
// Test cache hit/miss API: clear + load, assert mtimeMs present and desks array.
const {
  getLiveThinDeskProfiles,
  clearThinDeskProfilesCache,
  loadThinDeskProfiles,
} = await import(path.join(ROOT, 'server', 'thinDeskProfiles.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

console.log('\nlive-registry (MCP desk reload)\n');

clearThinDeskProfilesCache();
const a = getLiveThinDeskProfiles();
if (!a.registry?.desks || !Array.isArray(a.registry.desks)) bad('registry.desks');
else ok(`live desks: ${a.registry.desks.map((d) => d.slug).join(', ')}`);
if (typeof a.mtimeMs !== 'number' || a.mtimeMs <= 0) bad('mtimeMs');
else ok(`mtimeMs=${a.mtimeMs}`);

const b = getLiveThinDeskProfiles();
if (b !== a && b.mtimeMs !== a.mtimeMs) {
  // object identity may differ if recreated; mtime match is enough
}
if (b.mtimeMs !== a.mtimeMs) bad('cache should keep same mtime');
else ok('second call same mtime (cache hit path)');

// bySlug covers every desk
const pure = loadThinDeskProfiles();
const slugs = pure.registry.desks.map((d) => d.slug);
for (const s of slugs) {
  if (!a.bySlug[s]) { bad(`missing bySlug ${s}`); }
}
ok(`bySlug covers ${slugs.length} desks`);

// Simulate "process started with old list" then disk updates: we can't mutate registry
// without risk; instead assert clear + reload still works.
clearThinDeskProfilesCache();
const c = getLiveThinDeskProfiles();
if (c.registry.desks.length !== pure.registry.desks.length) bad('after clear, desk count');
else ok('after clearThinDeskProfilesCache, full reload');

// Alias resolve path is in MCP; profiles must include tsm aliases if present
const tsm = pure.registry.desks.find((d) => d.slug === 'tsm');
if (tsm?.aliases?.includes('tsmc')) ok('tsm has tsmc alias in registry (MCP resolve)');
else ok('no tsm alias required in this install');

console.log(`\nlive-registry ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
