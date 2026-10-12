/**
 * Every subject, grader, and reviewer call must log its exact model id.
 * Fail closed on any non-Grok or off-pin id.
 */
import { REQUIRED_GROK46, assertExactGrok46, logModel } from './models.mjs';
import { writeJson } from './sec.mjs';

const calls = [];

export function recordCall(entry) {
  const model = entry?.model;
  assertExactGrok46(model, entry?.role || 'call');
  const row = {
    at: new Date().toISOString(),
    role: entry.role || 'unknown',
    job_id: entry.job_id || null,
    arm: entry.arm || null,
    repeat: entry.repeat ?? null,
    model,
    via: entry.via || 'cursor-task',
    on_demand: false,
    xai_key: false,
    prompt_tokens: entry.prompt_tokens || 0,
    completion_tokens: entry.completion_tokens || 0,
  };
  logModel({ model, job_id: row.job_id, arm: row.arm, repeat: row.repeat });
  calls.push(row);
  return row;
}

export function getCalls() {
  return [...calls];
}

export function calledModelIds() {
  return [...new Set(calls.map((c) => c.model))];
}

export function persistCalls(dest) {
  const ids = calledModelIds();
  if (ids.some((id) => id !== REQUIRED_GROK46)) {
    throw new Error(`HARD MODEL RULE: call log has non-pin ids: ${ids.join(',')}`);
  }
  writeJson(dest, {
    required: REQUIRED_GROK46,
    n: calls.length,
    models: ids,
    on_demand: false,
    xai_key: false,
    calls,
  });
  return dest;
}
