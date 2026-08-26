#!/usr/bin/env node
/** source-read-test.mjs — allowlisted vault reads; reject traversal. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { remapVaultCandidate, openMappedFile, readCatalogSource } = await import(
  path.join(ROOT, 'server', 'sourceRead.js')
);

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-src-'));
const vault = path.join(tmp, 'research-wiki');
const outside = path.join(tmp, 'outside.txt');
fs.mkdirSync(path.join(vault, 'wiki', 'sources'), { recursive: true });
fs.writeFileSync(path.join(vault, 'wiki', 'sources', 'demo.md'), '---\nslug: demo\n---\n\n# Demo source\n\nHello.\n');
fs.writeFileSync(outside, 'secret\n');

console.log('\nsource-read (allowlist + remap)\n');

const remapped = remapVaultCandidate(
  '/Users/someone/Desktop/cockpit-vault/wiki/sources/demo.md',
  vault,
);
if (remapped === path.join(vault, 'wiki', 'sources', 'demo.md')) ok('remap foreign absolute wiki/ onto live vault');
else bad(`remap wiki got ${remapped}`);

const rel = remapVaultCandidate('wiki/sources/demo.md', vault);
if (rel === path.join(vault, 'wiki', 'sources', 'demo.md')) ok('relative wiki path');
else bad(`relative got ${rel}`);

const house = remapVaultCandidate('/x/house-view-tsm.md', vault);
if (house === path.join(vault, 'house-view-tsm.md')) ok('remap house-view-*.md basename');
else bad(`house remap ${house}`);

const hit = openMappedFile({ pathStr: 'wiki/sources/demo.md', vaultDir: vault });
if (hit.ok && /Hello/.test(hit.markdown)) ok('read allowlisted file from injected vault');
else bad(`read failed ${JSON.stringify(hit)}`);

const leak = openMappedFile({ pathStr: outside, vaultDir: vault });
if (!leak.ok) ok('reject file outside vault');
else bad('leaked outside file');

const trav = openMappedFile({ pathStr: path.join(vault, '..', 'outside.txt'), vaultDir: vault });
if (!trav.ok) ok('reject .. traversal out of vault');
else bad('traversal succeeded');

const missing = readCatalogSource({ pack: { sources: [] }, id: 'nope' });
if (!missing.available && /catalog/.test(missing.reason || '')) ok('unknown id not in catalog');
else bad(`catalog miss ${JSON.stringify(missing)}`);

fs.rmSync(tmp, { recursive: true, force: true });

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
