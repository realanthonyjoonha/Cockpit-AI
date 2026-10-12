import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { extractJsonArray } from './score.mjs';
import { jobsDir, loadConfig, tracesDir } from './load-config.mjs';
import { assertGrok46, logModel } from './models.mjs';
import { writeJson } from './sec.mjs';

function safeName(id) {
  return String(id).replace(/[^A-Za-z0-9._+-]+/g, '_');
}

export function persistTrace(jobId, answersOrText, extras = {}, cfg = loadConfig()) {
  const metaPath = path.join(jobsDir(cfg), `${safeName(jobId)}.meta.json`);
  if (!existsSync(metaPath)) throw new Error(`missing job meta ${metaPath}`);
  const meta = JSON.parse(readFileSync(metaPath, 'utf8'));
  const answers = Array.isArray(answersOrText)
    ? answersOrText
    : extractJsonArray(answersOrText);
  if (!Array.isArray(answers) || answers.length !== (meta.item_ids || []).length) {
    throw new Error(`${jobId}: expected ${meta.item_ids.length} answers, got ${answers?.length ?? 0}`);
  }
  const raw = extras.raw_text || JSON.stringify(answers, null, 2);
  const missing = (meta.item_ids || []).filter((id) => !answers.some((a) => a && a.item_id === id));
  if (missing.length) throw new Error(`${jobId}: missing item_ids ${missing.join(',')}`);
  const model = extras.model || meta.model;
  assertGrok46(model, `trace ${jobId}`);
  const dest = path.join(tracesDir(cfg), `${safeName(jobId)}.json`);
  const trace = {
    job_id: meta.job_id,
    arm: meta.arm,
    repeat: meta.repeat,
    shard: meta.shard ?? 0,
    model,
    item_ids: meta.item_ids,
    prompt_tokens: extras.prompt_tokens ?? meta.prompt_tokens ?? 0,
    cached_tokens: extras.cached_tokens || 0,
    completion_tokens: extras.completion_tokens || 0,
    tool_def_tokens: extras.tool_def_tokens || 0,
    latency_ms: extras.latency_ms || 0,
    answers,
    raw_text: raw,
  };
  logModel(trace);
  writeJson(dest, trace);
  return dest;
}
