/**
 * HARD MODEL RULE: every subject and grader call must be Cursor Grok 4.6.
 * Never gpt-*, claude-*, gemini-*, opus, or XAI_API_KEY.
 */

const GROK46_RE = /^(cursor-)?grok-4\.6([._-]|$)/i;
const BANNED_RE = /gpt-|claude-|gemini-|opus|anthropic|other[\s_-]*models/i;

export const REQUIRED_GROK46 = 'cursor-grok-4.6-high-fast';

export function isGrok46(id) {
  const s = String(id || '').trim();
  if (!s || BANNED_RE.test(s)) return false;
  return GROK46_RE.test(s) || /cursor-grok-4\.6/i.test(s);
}

export function assertGrok46(models, label = 'model') {
  const ids = (Array.isArray(models) ? models : [models]).filter((x) => x != null);
  if (!ids.length) {
    throw new Error(`HARD MODEL RULE: ${label} is missing. Aborting. Only Cursor Grok 4.6 is allowed.`);
  }
  for (const id of ids) {
    if (!isGrok46(id)) {
      throw new Error(
        `HARD MODEL RULE: ${label} '${id}' is not Cursor Grok 4.6. Aborting. Never gpt-*/claude-*/gemini-*/opus.`,
      );
    }
  }
  return ids;
}

/** Subject, grader, and any reviewer (including pstack interrogate) must be this exact id. */
export function assertExactGrok46(models, label = 'model') {
  const ids = assertGrok46(models, label);
  for (const id of ids) {
    if (String(id).trim() !== REQUIRED_GROK46) {
      throw new Error(
        `HARD MODEL RULE: ${label} '${id}' is not pinned to exact id ${REQUIRED_GROK46}. Aborting.`,
      );
    }
  }
  return ids;
}

export function logModel(traceOrJob) {
  const model = traceOrJob?.model || '(missing)';
  const job = traceOrJob?.job_id || traceOrJob?.arm || '?';
  console.log(JSON.stringify({
    event: 'model_id',
    job_id: job,
    arm: traceOrJob?.arm || null,
    repeat: traceOrJob?.repeat ?? null,
    model,
    grok46: isGrok46(model),
  }));
  return model;
}

export function collectTraceModels(traces) {
  const ids = [...new Set((traces || []).map((t) => t.model).filter(Boolean))];
  return {
    models: ids,
    n_traces: (traces || []).length,
    all_grok46: ids.length > 0 && ids.every(isGrok46),
  };
}
