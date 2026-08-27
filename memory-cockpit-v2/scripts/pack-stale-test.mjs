#!/usr/bin/env node
/** pack-stale-test.mjs — vault newer than store ⇒ stale; same mtime ⇒ current. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { inspectPackStale, expandGlob } = await import(path.join(ROOT, 'server', 'packStale.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-stale-'));
const vault = path.join(tmp, 'vault');
const ont = path.join(tmp, 'ontology');
fs.mkdirSync(path.join(vault, 'wiki', 'entities'), { recursive: true });
fs.mkdirSync(path.join(vault, 'raw', 'zz-research'), { recursive: true });
fs.mkdirSync(path.join(ont, 'packs'), { recursive: true });
fs.mkdirSync(path.join(ont, 'store', 'by_ticker'), { recursive: true });

fs.writeFileSync(path.join(vault, 'house-view-zz.md'), '# ZZ\n');
fs.writeFileSync(path.join(vault, 'wiki', 'entities', 'zz.md'), '- fact (2026-01-01) [A] [[zz]]\n');
fs.writeFileSync(path.join(vault, 'raw', 'zz-research', '08-risks-catalysts.md'), '# risks\n');
fs.writeFileSync(path.join(vault, 'raw', 'zz-research', '01-overview.md'), '# ov\n');
fs.writeFileSync(path.join(ont, 'packs', 'ZZ.json'), JSON.stringify({
  ticker: 'ZZ',
  entity_slug: 'zz',
  house_view_path: 'house-view-zz.md',
  risks_source: 'raw/zz-research/08-risks-catalysts.md',
  source_globs: ['raw/zz-research/*.md', 'wiki/entities/zz.md'],
  source_roots: ['raw/zz-research'],
}, null, 2));

console.log('\npack-stale\n');

const globs = expandGlob(vault, 'raw/zz-research/*.md');
if (globs.some((p) => p.endsWith('01-overview.md'))) ok('expandGlob raw/*.md');
else bad(`glob ${JSON.stringify(globs)}`);

const missing = inspectPackStale({ ticker: 'ZZ', vaultDir: vault, ontRoot: ont });
if (missing.stale && missing.reason === 'no compiled pack') ok('no store → stale');
else bad(`missing ${JSON.stringify(missing)}`);

const storePath = path.join(ont, 'store', 'by_ticker', 'ZZ.json');
fs.writeFileSync(storePath, '{"schema_version":"0.1"}\n');
const t0 = Date.now() + 60_000;
fs.utimesSync(storePath, t0 / 1000, t0 / 1000);
const current = inspectPackStale({ ticker: 'ZZ', vaultDir: vault, ontRoot: ont });
if (!current.stale) ok('store newer than vault → current');
else bad(`current? ${JSON.stringify(current)}`);

const future = Date.now() / 1000 + 120;
fs.utimesSync(path.join(vault, 'house-view-zz.md'), future, future);
const stale = inspectPackStale({ ticker: 'ZZ', vaultDir: vault, ontRoot: ont });
if (stale.stale && stale.reason === 'vault newer than pack') ok('house newer → stale');
else bad(`stale? ${JSON.stringify(stale)}`);

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
