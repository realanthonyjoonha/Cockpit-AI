#!/usr/bin/env node
/**
 * pack-cache-test.mjs — loadPack re-reads when store mtime changes (compile mid-session).
 * Decision-support only. Does not invent research.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { setTimeout as sleep } from 'timers/promises';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

// Isolate store dir so we do not touch real packs
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-pack-cache-'));
const store = path.join(tmp, 'by_ticker');
fs.mkdirSync(store, { recursive: true });
process.env.ONTOLOGY_STORE = store;

// Dynamic import after env so resolveStoreDir sees ONTOLOGY_STORE
const { loadPack, clearPackCache } = await import(path.join(ROOT, 'server', 'pack.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

const packPath = path.join(store, 'TEST.json');
let epoch = Date.now();

const writePack = async (n, compiled_at) => {
  fs.writeFileSync(
    packPath,
    JSON.stringify({
      ticker: 'TEST',
      compiled_at,
      claims: [],
      risks: [],
      sources: [{ id: `src-${n}`, path: `raw/test/${n}.md`, title: `n${n}` }],
    }),
    'utf8',
  );
  // Monotonic mtime past any prior read (avoids coarse FS clocks / same-ms writes)
  epoch += 2000;
  const t = new Date(epoch);
  fs.utimesSync(packPath, t, t);
  await sleep(15);
};

console.log('\npack-cache (mtime invalidation)\n');

await writePack(1, 't1');
clearPackCache('*');
const a = loadPack('TEST');
if (!a.available || a.pack?.sources?.[0]?.id !== 'src-1') bad('first load');
else ok('first load src-1');

await writePack(2, 't2');
const b = loadPack('TEST');
if (!b.available || b.pack?.sources?.[0]?.id !== 'src-2') {
  bad(`after mtime change expected src-2 got ${b.pack?.sources?.[0]?.id}`);
} else ok('mtime change → re-read src-2 (no restart)');

const c = loadPack('TEST');
if (c.pack?.sources?.[0]?.id !== 'src-2') bad('same mtime still src-2');
else ok('same mtime serves cache');

const d = loadPack('TEST', { force: true });
if (d.pack?.sources?.[0]?.id !== 'src-2') bad('force load');
else ok('force load ok');

// cleanup
try { fs.rmSync(tmp, { recursive: true, force: true }); } catch { /* */ }

console.log(`\npack-cache ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
