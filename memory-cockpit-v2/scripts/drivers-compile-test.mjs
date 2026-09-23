#!/usr/bin/env node
/** Gate 1: 09 parser — empty legal, House: required, Rn ignored. */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '../..');
const py = path.join(ROOT, 'ontology/compile/from_nebius_drivers.py');
let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

function parse(text) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'drv-'));
  const md = path.join(dir, '09-drivers.md');
  fs.writeFileSync(md, text);
  const code = `
from pathlib import Path
import json, sys
sys.path.insert(0, ${JSON.stringify(path.join(ROOT, 'ontology'))})
from compile.from_nebius_drivers import parse_drivers_md
print(json.dumps(parse_drivers_md(Path(${JSON.stringify(md)}).read_text(), id_prefix="tstk")))
`;
  const r = spawnSync('python3', ['-c', code], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr || r.stdout);
  return JSON.parse(r.stdout);
}

try {
  const empty = parse('# Drivers\n\nScaffold only.\n');
  if (Array.isArray(empty) && empty.length === 0) ok('empty 09 → []');
  else bad(`empty ${JSON.stringify(empty)}`);
} catch (e) { bad(`empty ${e.message}`); }

try {
  const none = parse('');
  if (none.length === 0) ok('missing body → []');
  else bad('missing body');
} catch (e) { bad(e.message); }

try {
  const got = parse(`
### D1 — Ads mix
- **House:** «FoA is the funder»
- **Watching:** impressions and price
- **Why:** the funder of the book

**Figures**

| Item | Figure | Note |
| --- | --- | --- |
| Impressions | +14% | Q2 |

**Log**

| Date | Via | Fact |
| --- | --- | --- |
| 2026-09-20 | print | imp +14% |

**Open**

- Is it price or volume?

### D2 — Capex
- **House:** «spend ok if attach»
- **Watching:** FCF

### D3 — The load-bearing view
- **House:** «not an engine»

### R1 — Legal
- **House:** should not parse as driver
- **Status:** WATCH
`);
  if (got.length === 2) ok('two engines, heading dropped');
  else bad(`count ${got.length} ${JSON.stringify(got.map((d) => d.name))}`);
  const d1 = got.find((d) => /Ads mix/.test(d.name));
  if (!d1) bad('missing ads');
  else if (d1.status != null) bad(`status leaked ${d1.status}`);
  else if (d1.watching !== 'impressions and price') bad(`watching ${d1.watching}`);
  else if (!/funder of the book/.test(d1.why || '')) bad('why');
  else if (d1.figures?.[0]?.figure !== '+14%') bad(`figures ${JSON.stringify(d1.figures)}`);
  else if (d1.log?.[0]?.via !== 'print' || d1.log?.[0]?.date !== '2026-09-20') bad(`log ${JSON.stringify(d1.log)}`);
  else if (!d1.open?.some((q) => /price or volume/.test(q))) bad(`open ${JSON.stringify(d1.open)}`);
  else if (d1.id !== 'd1-ads-mix') bad(`id ${d1.id}`);
  else if (d1.last !== 'imp +14%' || d1.checked !== '2026-09-20') bad(`last ${d1.last}`);
  else ok('figures, log, open, no status');
  if (got.every((d) => d.house && d.type === 'Driver')) ok('House: present, type Driver');
  else bad('house/type');
  if (got.some((d) => /Legal|load-bearing/.test(d.name))) bad('Rn or heading parsed as driver');
  else ok('### Rn and house headings ignored');
} catch (e) { bad(`fixture ${e.message}`); }

try {
  const drop = parse(`
### D1 — No cite
- **Last:** foo
- **Status:** TRACK

### D2 — Has cite
- **House:** «from house»
- **Last:** bar
- **Status:** ON-PLAN
`);
  if (drop.length === 1 && /Has cite/.test(drop[0].name) && drop[0].status == null && drop[0].last === 'bar') {
    ok('missing House dropped; legacy status ignored');
  } else bad(`drop ${JSON.stringify(drop)}`);
} catch (e) { bad(`drop ${e.message}`); }

if (fail) {
  console.log(`\ndrivers-compile-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\ndrivers-compile-test OK');
