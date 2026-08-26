#!/usr/bin/env node
/** source-catalog-test.mjs — a desk catalog must not list other tickers' filings. */
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const { sourceOwnedByDesk, filterCatalogForDesk, pathMatchesGlob } = await import(
  path.join(ROOT, 'server', 'sourceCatalog.js')
);

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nsource-catalog (desk isolation)\n');

const tsm = {
  ticker: 'TSM',
  slug: 'tsm',
  entitySlug: 'tsm',
  rawDir: 'raw/tsm-research',
  sourceGlobs: ['raw/tsm-research/*.md', 'wiki/entities/tsm.md', 'wiki/sources/tsm-*.md'],
};

if (sourceOwnedByDesk({ id: 'tsm-20f-2025', path: '/vault/wiki/sources/tsm-20f-2025.md' }, tsm)) {
  ok('keep tsm-20f on TSM');
} else bad('dropped own 20-F');

if (sourceOwnedByDesk({ id: '08-risks-catalysts', path: '/vault/raw/tsm-research/08-risks-catalysts.md' }, tsm)) {
  ok('keep this desk raw 08-risks');
} else bad('dropped own raw risks');

if (sourceOwnedByDesk({ id: 'tsm', path: '/vault/wiki/entities/tsm.md' }, tsm)) {
  ok('keep entity page');
} else bad('dropped entity');

if (!sourceOwnedByDesk({ id: 'lly-10k-fy2025', path: '/vault/wiki/sources/lly-10k-fy2025.md' }, tsm)) {
  ok('drop LLY 10-K from TSM');
} else bad('LLY 10-K leaked onto TSM');

if (!sourceOwnedByDesk({ id: 'nvda-10k-fy2026', path: '/vault/wiki/sources/nvda-10k-fy2026.md' }, tsm)) {
  ok('drop NVDA 10-K from TSM');
} else bad('NVDA 10-K leaked onto TSM');

const nbis = {
  ticker: 'NBIS',
  slug: 'nbis',
  entitySlug: 'nbis',
  rawDir: 'raw/nbis-research',
  sourceGlobs: ['wiki/sources/nbis-*.md', 'wiki/sources/crwv-q1-26-release.md'],
};
if (sourceOwnedByDesk({ id: 'crwv-q1-26-release', path: '/vault/wiki/sources/crwv-q1-26-release.md' }, nbis)) {
  ok('NBIS explicit glob keeps CoreWeave filing');
} else bad('lost NBIS crwv glob');
if (!sourceOwnedByDesk({ id: 'lly-10k-fy2025', path: '/vault/wiki/sources/lly-10k-fy2025.md' }, nbis)) {
  ok('NBIS still drops LLY');
} else bad('LLY leaked onto NBIS');

if (pathMatchesGlob('/x/wiki/sources/nbis-20f-2024.md', 'wiki/sources/nbis-*.md')) ok('glob nbis-*.md');
else bad('glob miss');

const polluted = [
  { id: 'lly-10k-fy2025', path: '/vault/wiki/sources/lly-10k-fy2025.md' },
  { id: 'tsm-20f-2025', path: '/vault/wiki/sources/tsm-20f-2025.md' },
  { id: '01-overview', path: '/vault/raw/tsm-research/01-overview.md' },
];
const kept = filterCatalogForDesk(polluted, tsm).map((s) => s.id);
if (kept.includes('tsm-20f-2025') && kept.includes('01-overview') && !kept.includes('lly-10k-fy2025')) {
  ok('filterCatalogForDesk strips foreign wiki-sources');
} else bad(`filter result ${JSON.stringify(kept)}`);

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
