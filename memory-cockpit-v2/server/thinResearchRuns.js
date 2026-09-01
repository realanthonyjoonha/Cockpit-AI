// thinResearchRuns.js — per-ticker research run archive (on-demand deep compiles).
// Vault: research-wiki/cockpit/research/{TICKER}/
// Decision-support only. Not pack/house/Street SoR until explicit promote.
import fs from 'fs';
import path from 'path';
import { resolveVaultDir } from './monorepoPaths.js';
import {
  RESEARCH_RUNS_SCHEMA_VERSION,
  RESEARCH_JOBS,
  makeRunId,
  validateResearchRunPublish,
  indexRowFromMeta,
  humanJobLabel,
} from './researchRunsSchema.js';
import {
  pidAlive,
  killProcessGroup,
  spawnResearchWorker,
  reconcileRun,
  stalledOverlay,
  heartbeatAgeMs,
  readLogTail,
  resolveGrokBin,
} from './researchRunsWorker.js';
import { acquireUrlToRun } from './researchAcquire.js';
import { writeResearchRunsAgentSeed } from './researchRunsAgentSeed.js';

function vaultRoot() {
  return resolveVaultDir();
}

export function tickerId(ticker) {
  return String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
}

const IN_FLIGHT = new Set(['queued', 'running']);

function workerDeps() {
  return {
    findInFlightRun,
    attachWorker,
    patchRunMeta,
    failResearchRun,
    researchRunDir,
  };
}

export function researchRoot(ticker) {
  const id = tickerId(ticker);
  if (!id) return null;
  return path.join(vaultRoot(), 'cockpit', 'research', id);
}

export function researchIndexPath(ticker) {
  const root = researchRoot(ticker);
  return root ? path.join(root, 'index.json') : null;
}

export function researchRunDir(ticker, runId) {
  const root = researchRoot(ticker);
  const rid = String(runId || '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!root || !rid) return null;
  return path.join(root, 'runs', rid);
}

function vaultRootExists() {
  try {
    return fs.existsSync(vaultRoot());
  } catch {
    return false;
  }
}

function atomicWriteJson(filePath, obj) {
  // Empty product / no-vault VMs: do not mkdir ~/Trading/research-wiki as a side effect of list/read.
  if (!vaultRootExists()) return;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function atomicWriteText(filePath, text) {
  if (!vaultRootExists()) return;
  const dir = path.dirname(filePath);
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, String(text || ''), 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJsonSafe(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/**
 * @param {string} ticker
 */
export function readResearchIndex(ticker) {
  const p = researchIndexPath(ticker);
  if (!p) return { ticker: '', runs: [] };
  if (!vaultRootExists()) {
    return { schema_version: RESEARCH_RUNS_SCHEMA_VERSION, ticker: tickerId(ticker), runs: [] };
  }
  const raw = readJsonSafe(p);
  if (!raw || !Array.isArray(raw.runs)) {
    return rebuildResearchIndex(ticker);
  }
  return {
    schema_version: RESEARCH_RUNS_SCHEMA_VERSION,
    ticker: tickerId(ticker),
    runs: raw.runs,
  };
}

/**
 * Scan runs dir and rebuild index.
 * @param {string} ticker
 */
export function rebuildResearchIndex(ticker) {
  const id = tickerId(ticker);
  const root = researchRoot(id);
  const runsDir = root ? path.join(root, 'runs') : null;
  const runs = [];
  if (runsDir && fs.existsSync(runsDir)) {
    for (const name of fs.readdirSync(runsDir)) {
      const metaPath = path.join(runsDir, name, 'meta.json');
      const meta = readJsonSafe(metaPath);
      if (!meta) continue;
      const runDir = path.join(runsDir, name);
      // enrich counts from vault files so the list shows real depth (not just n_sources)
      const sources = readJsonSafe(path.join(runDir, 'sources.json'));
      if (sources?.items) meta.n_sources = sources.items.length;
      else if (Array.isArray(sources)) meta.n_sources = sources.length;

      const countItems = (file) => {
        const raw = readJsonSafe(path.join(runDir, 'extracts', file));
        if (Array.isArray(raw?.items)) return raw.items.length;
        if (Array.isArray(raw)) return raw.length;
        return 0;
      };
      meta.n_financials = countItems('financials.json');
      meta.n_risks = countItems('risks.json');
      meta.n_narrative = countItems('narrative.json');
      meta.n_guide = countItems('guide.json');
      const gaps = readJsonSafe(path.join(runDir, 'gaps.json'));
      meta.n_gaps = Array.isArray(gaps?.gaps) ? gaps.gaps.length
        : (Array.isArray(gaps) ? gaps.length : 0);

      const row = indexRowFromMeta({ ...meta, run_id: meta.run_id || name });
      if (row) runs.push(row);
    }
  }
  runs.sort((a, b) => String(b.started_at || '').localeCompare(String(a.started_at || '')));
  const index = {
    schema_version: RESEARCH_RUNS_SCHEMA_VERSION,
    ticker: id,
    runs,
  };
  const ip = researchIndexPath(id);
  if (ip) {
    try { atomicWriteJson(ip, index); } catch { /* */ }
  }
  return index;
}

/**
 * Disk scan of each run's meta.json (do not trust stale index.json for the mutex).
 * @param {string} ticker
 * @returns {object[]}
 */
export function scanRunMetas(ticker) {
  const id = tickerId(ticker);
  const root = researchRoot(id);
  const runsDir = root ? path.join(root, 'runs') : null;
  const out = [];
  if (!runsDir || !fs.existsSync(runsDir)) return out;
  for (const name of fs.readdirSync(runsDir)) {
    const meta = readJsonSafe(path.join(runsDir, name, 'meta.json'));
    if (!meta) continue;
    if (!meta.run_id) meta.run_id = name;
    out.push(meta);
  }
  return out;
}

/**
 * First queued|running run for this ticker, or null.
 * @param {string} ticker
 */
export function findInFlightRun(ticker) {
  const rows = scanRunMetas(ticker)
    .filter((m) => IN_FLIGHT.has(m.status))
    .sort((a, b) => String(a.started_at || '').localeCompare(String(b.started_at || '')));
  return rows[0] || null;
}

/**
 * In-place meta patch. Never writes summary/sources/gaps/extracts.
 * Compare-and-swap: refuses complete/cancelled unless opts.allowTerminal.
 */
export function patchRunMeta(ticker, runId, patcher, opts = {}) {
  const id = tickerId(ticker);
  const rid = String(runId || '').replace(/[^A-Za-z0-9._-]/g, '');
  const dir = researchRunDir(id, rid);
  if (!dir) return { ok: false, error: 'invalid ticker/run', decision_support_only: true };
  const metaPath = path.join(dir, 'meta.json');
  const meta = readJsonSafe(metaPath);
  if (!meta) return { ok: false, error: `run not found: ${rid}`, decision_support_only: true };
  const status = meta.status;
  if ((status === 'complete' || status === 'cancelled') && !opts.allowTerminal) {
    return { ok: false, error: `run is ${status} — meta patch refused`, status, decision_support_only: true };
  }
  if (status === 'failed' && !opts.allowRetry && !opts.allowFailed) {
    return { ok: false, error: 'run is failed — retry or start a new compile', status, decision_support_only: true };
  }
  let next;
  try {
    next = patcher({ ...meta });
  } catch (e) {
    return { ok: false, error: e.message || String(e), decision_support_only: true };
  }
  if (next && next.ok === false) return next;
  if (!next || typeof next !== 'object') {
    return { ok: false, error: 'patcher produced no meta', decision_support_only: true };
  }
  atomicWriteJson(metaPath, next);
  if (opts.rebuild !== false) {
    try { rebuildResearchIndex(id); } catch { /* */ }
  }
  return { ok: true, run_id: rid, ticker: id, status: next.status, meta: next, decision_support_only: true };
}

export function attachWorker(ticker, runId, worker = {}) {
  const now = new Date().toISOString();
  return patchRunMeta(ticker, runId, (m) => ({
    ...m,
    status: m.status === 'queued' ? 'running' : (m.status || 'running'),
    worker: {
      ...(m.worker || {}),
      pid: worker.pid || null,
      spawned_at: worker.spawned_at || now,
      log: worker.log || null,
      prompt: worker.prompt || null,
      seed: worker.seed || null,
      heartbeat_at: worker.heartbeat_at || now,
      pid_dead_since: null,
    },
  }));
}

export function heartbeatResearchRun(ticker, runId) {
  const now = new Date().toISOString();
  return patchRunMeta(ticker, runId, (m) => ({
    ...m,
    worker: { ...(m.worker || {}), heartbeat_at: now },
  }));
}

function reconcileTicker(ticker) {
  const id = tickerId(ticker);
  const deps = workerDeps();
  for (const meta of scanRunMetas(id)) {
    if (!IN_FLIGHT.has(meta.status)) continue;
    reconcileRun(id, meta, deps);
  }
}

/**
 * @param {string} ticker
 * @param {{ desk?: string }} [opts]
 */
export function listResearchRuns(ticker, opts = {}) {
  const id = tickerId(ticker);
  if (!id) {
    return {
      available: false,
      desk: opts.desk || null,
      ticker: '',
      reason: 'empty ticker',
      runs: [],
      decision_support_only: true,
    };
  }
  reconcileTicker(id);
  const index = readResearchIndex(id);
  const metas = new Map(scanRunMetas(id).map((m) => [m.run_id, m]));
  const runs = (Array.isArray(index.runs) ? index.runs : []).map((row) => {
    const meta = metas.get(row.run_id);
    if (!meta) return row;
    return { ...row, stalled: stalledOverlay(meta), worker_pid: meta.worker?.pid || null };
  });
  return {
    available: runs.length > 0,
    desk: opts.desk || null,
    ticker: id,
    path: researchRoot(id),
    schema_version: RESEARCH_RUNS_SCHEMA_VERSION,
    runs,
    n_runs: runs.length,
    n_complete: runs.filter((r) => r.status === 'complete').length,
    latest: runs[0] || null,
    needs_rebuild: runs.length === 0,
    reason: runs.length ? null : 'No research runs yet — New compile saves a deep archive for this desk',
    decision_support_only: true,
    note: 'Draft archive of on-demand compiles — not live pack/house. Prefer reopen over re-run.',
  };
}

/**
 * @param {string} ticker
 * @param {string} runId
 * @param {{ desk?: string }} [opts]
 */
export function getResearchRun(ticker, runId, opts = {}) {
  const id = tickerId(ticker);
  const dir = researchRunDir(id, runId);
  if (!dir) {
    return {
      available: false,
      desk: opts.desk || null,
      ticker: id,
      run_id: runId,
      reason: 'invalid ticker/run',
      decision_support_only: true,
    };
  }
  if (!fs.existsSync(dir)) {
    return {
      available: false,
      desk: opts.desk || null,
      ticker: id,
      run_id: runId,
      path: dir,
      reason: 'run not found',
      decision_support_only: true,
    };
  }

  let meta = readJsonSafe(path.join(dir, 'meta.json')) || {};
  if (IN_FLIGHT.has(meta.status)) {
    const rec = reconcileRun(id, meta, workerDeps());
    meta = rec.meta || meta;
    meta = readJsonSafe(path.join(dir, 'meta.json')) || meta;
  }
  const stalled = stalledOverlay(meta);
  let summary = null;
  try {
    const sp = path.join(dir, 'summary.md');
    if (fs.existsSync(sp)) summary = fs.readFileSync(sp, 'utf8');
  } catch { /* */ }

  const sourcesRaw = readJsonSafe(path.join(dir, 'sources.json'));
  const sources = Array.isArray(sourcesRaw?.items) ? sourcesRaw.items
    : (Array.isArray(sourcesRaw) ? sourcesRaw : (meta.sources || []));

  const gapsRaw = readJsonSafe(path.join(dir, 'gaps.json'));
  const gaps = Array.isArray(gapsRaw?.gaps) ? gapsRaw.gaps
    : (Array.isArray(gapsRaw) ? gapsRaw : (meta.gaps || []));

  const financials = readJsonSafe(path.join(dir, 'extracts', 'financials.json'));
  const risks = readJsonSafe(path.join(dir, 'extracts', 'risks.json'));
  const narrative = readJsonSafe(path.join(dir, 'extracts', 'narrative.json'));
  const guide = readJsonSafe(path.join(dir, 'extracts', 'guide.json'));

  const extracts = {
    financials: Array.isArray(financials?.items) ? financials.items
      : (Array.isArray(financials) ? financials : (meta.extracts?.financials || [])),
    risks: Array.isArray(risks?.items) ? risks.items
      : (Array.isArray(risks) ? risks : (meta.extracts?.risks || [])),
    narrative: Array.isArray(narrative?.items) ? narrative.items
      : (Array.isArray(narrative) ? narrative : (meta.extracts?.narrative || [])),
    guide: Array.isArray(guide?.items) ? guide.items
      : (Array.isArray(guide) ? guide : (meta.extracts?.guide || [])),
  };

  const status = meta.status || 'unknown';
  return {
    available: true,
    desk: opts.desk || meta.desk || null,
    ticker: id,
    run_id: meta.run_id || runId,
    path: dir,
    schema_version: meta.schema_version || RESEARCH_RUNS_SCHEMA_VERSION,
    job: meta.job || 'deep_compile',
    job_label: humanJobLabel(meta.job),
    status,
    started_at: meta.started_at || null,
    finished_at: meta.finished_at || null,
    trigger: meta.trigger || null,
    compute: meta.compute || null,
    inputs: meta.inputs || null,
    summary: summary || meta.summary || null,
    sources,
    gaps,
    extracts,
    promotion: meta.promotion || null,
    immutable: meta.immutable === true || status === 'complete',
    error: meta.error || null,
    worker: meta.worker || null,
    pid_alive: pidAlive(meta.worker?.pid),
    stalled,
    heartbeat_age_ms: heartbeatAgeMs(meta),
    log_tail: readLogTail(meta.worker?.log),
    decision_support_only: true,
    note: 'Draft archive — not live book. Promote via existing gates only.',
  };
}

/**
 * Start a new run (meta=queued until worker attach). Same-desk mutex:
 * if a queued|running run exists, return it with already_in_flight (no second grok).
 * body.launch === true spawns the pipeline worker before return.
 */
export function startResearchRun(ticker, body = {}, opts = {}) {
  const id = tickerId(ticker);
  if (!id) {
    return { ok: false, error: 'empty ticker', decision_support_only: true };
  }
  reconcileTicker(id);
  const existing = findInFlightRun(id);
  if (existing) {
    return {
      ok: true,
      already_in_flight: true,
      run_id: existing.run_id,
      ticker: id,
      desk: existing.desk || opts.desk || body.desk || null,
      job: existing.job,
      status: existing.status,
      path: researchRunDir(id, existing.run_id),
      vault_rel: `cockpit/research/${id}/runs/${existing.run_id}`,
      decision_support_only: true,
      ...listResearchRuns(id, opts),
    };
  }

  let job = String(body.job || 'deep_compile');
  if (!RESEARCH_JOBS.has(job)) job = 'deep_compile';

  let run_id = makeRunId(id, job);
  let dir = researchRunDir(id, run_id);
  for (let n = 2; fs.existsSync(path.join(dir, 'meta.json')) && n < 100; n++) {
    run_id = `${makeRunId(id, job)}-${n}`;
    dir = researchRunDir(id, run_id);
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, 'extracts'), { recursive: true });
  fs.mkdirSync(path.join(dir, 'acquired'), { recursive: true });

  const now = new Date().toISOString();
  const launch = body.launch === true || body.launch === 'true';
  const meta = {
    schema_version: RESEARCH_RUNS_SCHEMA_VERSION,
    run_id,
    ticker: id,
    desk: opts.desk || body.desk || null,
    job,
    status: 'queued',
    started_at: now,
    finished_at: null,
    trigger: 'user',
    compute: { note: 'heavy', duration_sec: null, agent_calls: null },
    inputs: {
      focus: body.focus ? String(body.focus).slice(0, 400) : null,
      prior_run_id: body.prior_run_id ? String(body.prior_run_id) : null,
      as_of_request: now.slice(0, 10),
    },
    worker: null,
    promotion: {
      status: 'none',
      pack_claims: false,
      risks_proposed: false,
      house_proposed: false,
      model_pack_layers: false,
      notes: null,
    },
    immutable: false,
    decision_support_only: true,
  };
  atomicWriteJson(path.join(dir, 'meta.json'), meta);
  rebuildResearchIndex(id);

  let spawn = null;
  if (launch) {
    spawn = launchPipeline(id, run_id, {
      desk: meta.desk,
      job,
      prompt: body.prompt || null,
      spawnImpl: opts.spawnImpl,
    });
    if (!spawn?.ok) {
      failResearchRun(id, run_id, spawn?.error || 'pipeline spawn failed');
      return {
        ok: false,
        error: spawn?.error || 'pipeline spawn failed',
        run_id,
        status: 'failed',
        decision_support_only: true,
        ...listResearchRuns(id, opts),
      };
    }
  }

  const fresh = readJsonSafe(path.join(dir, 'meta.json')) || meta;
  return {
    ok: true,
    already_in_flight: false,
    run_id,
    ticker: id,
    desk: meta.desk,
    job,
    status: fresh.status,
    spawned: spawn?.ok ? { pid: spawn.pid, log: spawn.log } : null,
    path: dir,
    vault_rel: `cockpit/research/${id}/runs/${run_id}`,
    decision_support_only: true,
    ...listResearchRuns(id, opts),
  };
}

function launchPipeline(ticker, runId, opts = {}) {
  const dir = researchRunDir(ticker, runId);
  let seedPath = dir ? path.join(dir, 'seed.md') : null;
  try {
    const seed = writeResearchRunsAgentSeed(opts.desk || ticker, {
      mode: 'pipeline',
      run_id: runId,
      job: opts.job || 'deep_compile',
    });
    if (seed?.ok && seed.path) seedPath = seed.path;
  } catch { /* keep run-folder seed path */ }
  const prompt = opts.prompt || [
    `/cockpit-research-compile ${String(opts.desk || ticker).toLowerCase()} pipeline ${runId}`,
    '',
    `PIPELINE MODE — execute the research job now; do not stop at a menu or ask which desk. `,
    `First read the seed file: ${seedPath} . `,
    `run_id ${runId} is already created (status=queued until worker attach); `,
    `write only under that run folder and publish via the API in the seed. Decision-support only.`,
  ].join('');
  return spawnResearchWorker({
    ticker,
    run_id: runId,
    desk: opts.desk,
    job: opts.job,
    prompt,
    seed_path: seedPath,
    grok: resolveGrokBin(),
    repo: process.env.COCKPIT_REPO || undefined,
    spawnImpl: opts.spawnImpl,
    deps: workerDeps(),
  });
}

/**
 * Publish complete (or failed) run payload. Format-gated for complete.
 * @param {string} ticker
 * @param {string} runId
 * @param {object} body
 * @param {{ desk?: string }} [opts]
 */
export function publishResearchRun(ticker, runId, body = {}, opts = {}) {
  const id = tickerId(ticker);
  const rid = String(runId || '').replace(/[^A-Za-z0-9._-]/g, '');
  const dir = researchRunDir(id, rid);
  if (!dir) {
    return { ok: false, error: 'invalid ticker/run', decision_support_only: true };
  }

  const existingMeta = readJsonSafe(path.join(dir, 'meta.json'));
  // Cancelled runs stay cancelled: a Grok session that wakes up after the human gave up
  // must not resurrect the run (its seed/context may be stale). New work = new run.
  if (existingMeta?.status === 'cancelled') {
    return {
      ok: false,
      error: 'run was cancelled — start a new compile instead of publishing into it',
      decision_support_only: true,
    };
  }
  if (existingMeta?.immutable === true || existingMeta?.status === 'complete') {
    return {
      ok: false,
      error: 'run is immutable (complete) — start a new compile',
      print_locked: false,
      decision_support_only: true,
    };
  }
  if (existingMeta?.status === 'failed') {
    return {
      ok: false,
      error: 'run is failed — POST retry or start a new compile',
      decision_support_only: true,
    };
  }

  const acquiredDir = path.join(dir, 'acquired');
  const validated = validateResearchRunPublish(
    {
      ...body,
      run_id: rid,
      ticker: id,
      desk: body.desk || opts.desk || existingMeta?.desk,
      started_at: body.started_at || existingMeta?.started_at,
      job: body.job || existingMeta?.job,
    },
    {
      ticker: id,
      run_id: rid,
      requireComplete: body.status !== 'failed' && body.status !== 'cancelled',
      acquiredDir: fs.existsSync(acquiredDir) ? acquiredDir : null,
    },
  );

  if (!validated.ok) {
    return {
      ok: false,
      error: `format verify failed: ${(validated.errors || []).join('; ')}`,
      format_errors: validated.errors,
      decision_support_only: true,
    };
  }

  const snap = validated.snapshot;
  fs.mkdirSync(path.join(dir, 'extracts'), { recursive: true });

  // meta without large blobs
  const meta = {
    schema_version: snap.schema_version,
    run_id: snap.run_id,
    ticker: snap.ticker,
    desk: snap.desk,
    job: snap.job,
    status: snap.status,
    started_at: snap.started_at,
    finished_at: snap.finished_at,
    trigger: snap.trigger,
    compute: snap.compute,
    inputs: snap.inputs,
    promotion: snap.promotion,
    immutable: snap.immutable,
    decision_support_only: true,
    n_sources: (snap.sources || []).length,
    n_financials: (snap.extracts?.financials || []).length,
    n_risks: (snap.extracts?.risks || []).length,
    n_narrative: (snap.extracts?.narrative || []).length,
    n_guide: (snap.extracts?.guide || []).length,
    n_gaps: (snap.gaps || []).length,
    error: snap.error || null,
  };
  atomicWriteJson(path.join(dir, 'meta.json'), meta);

  if (snap.summary) {
    atomicWriteText(path.join(dir, 'summary.md'), snap.summary.endsWith('\n') ? snap.summary : `${snap.summary}\n`);
  }
  atomicWriteJson(path.join(dir, 'sources.json'), { schema_version: 1, items: snap.sources || [] });
  atomicWriteJson(path.join(dir, 'gaps.json'), { schema_version: 1, gaps: snap.gaps || [] });
  atomicWriteJson(path.join(dir, 'extracts', 'financials.json'), {
    schema_version: 1,
    items: snap.extracts?.financials || [],
  });
  atomicWriteJson(path.join(dir, 'extracts', 'risks.json'), {
    schema_version: 1,
    items: snap.extracts?.risks || [],
  });
  atomicWriteJson(path.join(dir, 'extracts', 'narrative.json'), {
    schema_version: 1,
    items: snap.extracts?.narrative || [],
  });
  atomicWriteJson(path.join(dir, 'extracts', 'guide.json'), {
    schema_version: 1,
    items: snap.extracts?.guide || [],
  });

  rebuildResearchIndex(id);

  return {
    ok: true,
    written: dir,
    run_id: rid,
    status: snap.status,
    ...getResearchRun(id, rid, opts),
  };
}

/**
 * Mark run failed.
 */
/**
 * Cancel a queued/running run (cross-desk parallel hygiene — stranded launches must
 * not sit "running" forever). Complete runs stay immutable; cancel refuses them.
 * @param {string} ticker
 * @param {string} runId
 * @param {{ reason?: string }} [opts]
 */
export function cancelResearchRun(ticker, runId, opts = {}) {
  const id = tickerId(ticker);
  const rid = String(runId || '').replace(/[^A-Za-z0-9._-]/g, '');
  const dir = researchRunDir(id, rid);
  if (!dir) return { ok: false, error: 'invalid ticker/run', decision_support_only: true };
  const meta = readJsonSafe(path.join(dir, 'meta.json'));
  if (!meta) return { ok: false, error: `run not found: ${rid}`, decision_support_only: true };
  if (meta.immutable === true || meta.status === 'complete') {
    return { ok: false, error: 'run is complete (immutable) — cannot cancel', decision_support_only: true };
  }
  if (meta.status === 'cancelled') {
    return { ok: true, run_id: rid, status: 'cancelled', note: 'already cancelled', decision_support_only: true };
  }
  const pid = meta.worker?.pid;
  if (pid) killProcessGroup(pid);
  const now = new Date().toISOString();
  const patched = patchRunMeta(id, rid, (m) => ({
    ...m,
    status: 'cancelled',
    finished_at: now,
    error: String(opts.reason || 'cancelled by user (no publish received)').slice(0, 300),
  }), { allowFailed: true });
  if (!patched.ok) return patched;
  return {
    ok: true,
    run_id: rid,
    ticker: id,
    status: 'cancelled',
    cancelled_at: now,
    killed_pid: pid || null,
    decision_support_only: true,
    ...listResearchRuns(id),
  };
}

export function failResearchRun(ticker, runId, error) {
  const id = tickerId(ticker);
  const rid = String(runId || '').replace(/[^A-Za-z0-9._-]/g, '');
  const dir = researchRunDir(id, rid);
  const meta = dir ? readJsonSafe(path.join(dir, 'meta.json')) : null;
  if (meta?.worker?.pid) killProcessGroup(meta.worker.pid);
  const now = new Date().toISOString();
  return patchRunMeta(ticker, runId, (m) => ({
    ...m,
    status: 'failed',
    finished_at: now,
    immutable: false,
    error: String(error || 'failed').slice(0, 500),
  }));
}

export function retryResearchRun(ticker, runId, opts = {}) {
  const id = tickerId(ticker);
  const existing = findInFlightRun(id);
  if (existing && existing.run_id !== runId) {
    return {
      ok: false,
      error: `desk already has in-flight run ${existing.run_id}`,
      already_in_flight: true,
      run_id: existing.run_id,
      decision_support_only: true,
    };
  }
  const patched = patchRunMeta(id, runId, (m) => {
    if (m.status !== 'failed') {
      return { ok: false, error: `retry only from failed (status=${m.status})` };
    }
    return {
      ...m,
      status: 'queued',
      finished_at: null,
      error: null,
      worker: m.worker ? { ...m.worker, pid: null, pid_dead_since: null, heartbeat_at: null } : null,
    };
  }, { allowRetry: true });
  if (!patched.ok) return patched;
  if (opts.launch === true) {
    const spawn = launchPipeline(id, runId, {
      desk: patched.meta?.desk,
      job: patched.meta?.job,
      spawnImpl: opts.spawnImpl,
    });
    if (!spawn?.ok) {
      failResearchRun(id, runId, spawn?.error || 'retry spawn failed');
      return { ok: false, error: spawn?.error || 'retry spawn failed', run_id: runId, decision_support_only: true };
    }
    return { ok: true, run_id: runId, status: 'running', spawned: { pid: spawn.pid }, decision_support_only: true };
  }
  return { ok: true, run_id: runId, status: 'queued', decision_support_only: true };
}

export async function acquireResearchSource(ticker, runId, body = {}) {
  const id = tickerId(ticker);
  const rid = String(runId || '').replace(/[^A-Za-z0-9._-]/g, '');
  const dir = researchRunDir(id, rid);
  if (!dir || !fs.existsSync(path.join(dir, 'meta.json'))) {
    return { ok: false, error: 'run not found', gap: 'run not found', decision_support_only: true };
  }
  const meta = readJsonSafe(path.join(dir, 'meta.json'));
  if (meta?.status === 'complete' || meta?.status === 'cancelled') {
    return { ok: false, error: `run is ${meta.status}`, gap: `run is ${meta.status}`, decision_support_only: true };
  }
  const out = await acquireUrlToRun(dir, body);
  return { ...out, run_id: rid, ticker: id, decision_support_only: true };
}
