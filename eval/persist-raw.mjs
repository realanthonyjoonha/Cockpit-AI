#!/usr/bin/env node
/** Persist subject-raw JSON into traces. Logs model id. Aborts on non-Grok. */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { persistTrace } from './lib/persist-trace.mjs';
import { loadConfig } from './lib/load-config.mjs';
import { countTokens } from './vendor/tokens.mjs';
import { REQUIRED_GROK46 } from './lib/models.mjs';

const cfg = loadConfig();
const rawDir = path.join('eval/results/subject-raw');
const only = process.argv.slice(2);
const files = only.length
  ? only.map((id) => `${id.replace(/[^A-Za-z0-9._+-]+/g, '_')}.json`)
  : (existsSync(rawDir) ? readdirSync(rawDir).filter((f) => f.endsWith('.json')) : []);
const out = { ok: [], fail: [] };
for (const file of files) {
  const jobId = file.replace(/\.json$/, '').replace(/_/g, (c, i, s) => s); // keep as filename stem
  const p = path.join(rawDir, file);
  if (!existsSync(p)) {
    out.fail.push({ file, error: 'missing' });
    continue;
  }
  const raw = readFileSync(p, 'utf8');
  const started = (() => {
    try { return statSync(p).mtimeMs; } catch { return 0; }
  })();
  const id = file.replace(/\.json$/, '');
  try {
    const dest = persistTrace(id, raw, {
      model: REQUIRED_GROK46,
      completion_tokens: countTokens(raw),
      latency_ms: 0,
    }, cfg);
    out.ok.push({ job_id: id, dest, model: REQUIRED_GROK46 });
  } catch (err) {
    out.fail.push({ job_id: id, error: err.message });
  }
}
console.log(JSON.stringify(out, null, 2));
if (out.fail.length && !out.ok.length) process.exit(1);
