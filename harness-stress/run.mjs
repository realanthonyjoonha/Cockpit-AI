#!/usr/bin/env node
/**
 * Deterministic stress run. Does not modify product sources.
 * Usage: node harness-stress/run.mjs [--report] [--assert p0|p1|p2|p3|sectors]
 */
import { execSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { assertP0, assertSectors } from './lib/assert-phase.mjs';
import { assertP1 } from './lib/assert-p1.mjs';
import { assertP2 } from './lib/assert-p2.mjs';
import { assertP3 } from './lib/assert-p3.mjs';
import { contextProbe } from './lib/context-probe.mjs';
import { flowSim } from './lib/flow-sim.mjs';
import { emitPrompts } from './lib/prompts.mjs';
import { writeReport } from './lib/report.mjs';
import { toolProbe } from './lib/tool-probe.mjs';
import { TOKENIZER } from './lib/tokens.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '..');
const OUT = path.join(HERE, 'results');
const reportOnly = process.argv.includes('--report');
const assertAt = process.argv.indexOf('--assert');
const assertPhase = assertAt >= 0 ? process.argv[assertAt + 1] : null;

if (assertPhase) {
  const known = { p0: assertP0, p1: assertP1, p2: assertP2, p3: assertP3, sectors: assertSectors };
  const run = known[assertPhase];
  if (!run) {
    console.error(`unknown phase ${assertPhase}`);
    process.exit(1);
  }
  const errors = run();
  if (errors.length) {
    for (const err of errors) console.error(`✗ ${err}`);
    console.error(`${errors.length} ${assertPhase} case(s) failed`);
    process.exit(1);
  }
  console.log(`assert ${assertPhase} ok`);
  if (!reportOnly && assertPhase) process.exit(0);
}

function productDirty() {
  const out = execSync('git status --short --untracked-files=all', {
    cwd: REPO,
    encoding: 'utf8',
  });
  return out.split('\n').map((l) => l.trimEnd()).filter((l) => {
    if (!l) return false;
    return !l.includes('harness-stress/');
  });
}

function writeJson(name, obj) {
  writeFileSync(path.join(OUT, name), JSON.stringify(obj, null, 2));
}

mkdirSync(OUT, { recursive: true });

if (reportOnly) {
  const info = writeReport(OUT, path.join(HERE, 'REPORT.md'));
  console.log(`report ${info.path} findings=${info.findings}`);
  process.exit(0);
}

const dirtyBefore = productDirty();
if (dirtyBefore.length) {
  console.error('refusing to run: product tree already dirty');
  for (const line of dirtyBefore) console.error(line);
  process.exit(2);
}

const desksPath = path.join(REPO, 'memory-cockpit-v2/config/thin-desks.json');
const desksBefore = readFileSync(desksPath, 'utf8');
const started = Date.now();
console.log('context probe');
const context = contextProbe();
writeJson('context.json', context);
console.log('tool probe');
const tools = await toolProbe();
writeJson('tools.json', tools);
console.log('flow sim');
const flow = flowSim(tools.schema?.catalog_tokens || 0);
writeJson('flow.json', flow);
console.log('prompts');
const promptMeta = emitPrompts(path.join(HERE, 'prompts'), tools.catalog || []);
writeJson('prompt-meta.json', promptMeta);

const desksAfter = readFileSync(desksPath, 'utf8');
const dirtyAfter = productDirty();
const meta = {
  started_at: new Date(started).toISOString(),
  finished_at: new Date().toISOString(),
  wall_ms: Date.now() - started,
  tokenizer: TOKENIZER,
  desks_unchanged: desksBefore === desksAfter,
  product_dirty: dirtyAfter,
  xai_key_used: false,
};
writeJson('run-meta.json', meta);
const info = writeReport(OUT, path.join(HERE, 'REPORT.md'));
console.log(JSON.stringify({
  wall_ms: meta.wall_ms,
  findings: info.findings,
  desks_unchanged: meta.desks_unchanged,
  product_dirty: dirtyAfter,
  tools: tools.tool_names?.length,
  fat_chars: tools.fat_pack?.chars,
}, null, 2));
if (dirtyAfter.length || desksBefore !== desksAfter) {
  console.error('product tree changed during the probe');
  process.exit(3);
}
