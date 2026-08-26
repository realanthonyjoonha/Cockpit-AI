// thinWorkingModel.js — per-ticker user working model (assumptions + bridge).
// Vault: research-wiki/cockpit/model/{TICKER}.json — NOT pack / house / Street SoR.
// Decision-support only. Format-gated publish via workingModelSchema.js.
import fs from 'fs';
import path from 'path';
import { resolveVaultDir } from './monorepoPaths.js';
import {
  WORKING_MODEL_SCHEMA_VERSION,
  validateWorkingModelSnapshot,
  summarizeWorkingModelPrior,
  normalizePrintDate,
  lockViolations,
  PRINT_EVENT_MAX,
} from './workingModelSchema.js';
import { loadPack } from './pack.js';

function vaultRoot() {
  return resolveVaultDir();
}

/** A case line counts as pre-committed only when it carries a real value — GAP is not a case. */
function isFilledCase(a) {
  if (!a) return false;
  const v = a.value == null ? '' : String(a.value).trim();
  return !!v && !/^gap$/i.test(v);
}

export function workingModelDir() {
  return path.join(vaultRoot(), 'cockpit', 'model');
}

export function workingModelHistoryDir(ticker) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  return path.join(workingModelDir(), 'history', id);
}

export function workingModelPath(ticker) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id) return null;
  return path.join(workingModelDir(), `${id}.json`);
}

/**
 * @param {string} ticker
 */
export function readWorkingModelSnapshot(ticker) {
  const filePath = workingModelPath(ticker);
  if (!filePath) {
    return { available: false, snapshot: null, path: '', reason: 'empty ticker' };
  }
  if (!fs.existsSync(filePath)) {
    return {
      available: false,
      snapshot: null,
      path: filePath,
      reason: 'No working model yet — UPDATE MODEL or POST assumptions + bridge',
    };
  }
  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const snapshot = JSON.parse(raw);
    return { available: true, snapshot, path: filePath };
  } catch (e) {
    return {
      available: false,
      snapshot: null,
      path: filePath,
      reason: `model file unreadable: ${e.message || e}`,
    };
  }
}

/**
 * @param {string} ticker
 * @param {object} snapshot
 */
export function writeWorkingModelSnapshot(ticker, snapshot) {
  const filePath = workingModelPath(ticker);
  if (!filePath) throw new Error('empty ticker');
  const dir = workingModelDir();
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
  return filePath;
}

/**
 * @param {string} ticker
 * @param {object} snapshot
 * @param {{ marker?: string }} [opts] marker tags the file (e.g. lock-FQ2-2027) so a
 *   pre-print commitment is findable in history without parsing every snapshot.
 */
export function writeWorkingModelHistory(ticker, snapshot, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id || !snapshot) return null;
  const dir = workingModelHistoryDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = String(snapshot.fetched_at || new Date().toISOString()).replace(/[:.]/g, '-');
  const marker = String(opts.marker || '').replace(/[^A-Za-z0-9._-]/g, '').slice(0, 64);
  const filePath = path.join(dir, marker ? `${stamp}--${marker}.json` : `${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}

/**
 * @param {string} ticker
 * @param {object} [extra]
 */
export function emptyWorkingModelPayload(ticker, extra = {}) {
  const id = String(ticker || '').toUpperCase();
  return {
    available: false,
    desk: extra.desk || null,
    ticker: id,
    path: workingModelPath(id),
    schema_version: WORKING_MODEL_SCHEMA_VERSION,
    reason: extra.reason || 'No working model yet — UPDATE MODEL builds assumptions + bridge (not pack/house SoR)',
    needs_rebuild: true,
    decision_support_only: true,
    note: 'User working numbers only — illustration, not PT / not pack / not house.',
    ...extra,
  };
}

/**
 * Glass GET payload.
 * @param {string} ticker
 * @param {{ desk?: string }} [opts]
 */
export function getWorkingModel(ticker, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const { available, snapshot, path: filePath, reason } = readWorkingModelSnapshot(id);
  if (!available || !snapshot) {
    return emptyWorkingModelPayload(id, { desk: opts.desk, reason });
  }

  const validated = validateWorkingModelSnapshot(snapshot, { ticker: id, requireContent: true });
  if (!validated.ok) {
    return emptyWorkingModelPayload(id, {
      desk: opts.desk,
      reason: `Working model incomplete: ${(validated.errors || []).join('; ')}. UPDATE MODEL to rebuild.`,
      legacy_path: filePath,
      format_errors: validated.errors,
      needs_rebuild: true,
    });
  }

  const snap = validated.snapshot;
  const assumptions = snap.assumptions || [];
  const bridge = snap.bridge || [];
  const variance = Array.isArray(snapshot.variance) ? snapshot.variance : (snap.variance || []);
  const n_watch = assumptions.filter((a) => a.watch_risk).length;
  const layer_counts = { pack_actual: 0, pack_guide: 0, user_case: 0, structural: 0, mixed: 0 };
  for (const a of assumptions) {
    const L = a.layer || 'pack_actual';
    if (layer_counts[L] != null) layer_counts[L] += 1;
  }
  const caseRows = assumptions.filter((a) => a.layer === 'user_case');
  const n_case_filled = caseRows.filter((a) => isFilledCase(a)).length;

  // Live house strip (read-only) — not vault SoR; helps “vs house” without writing house
  let house_context = null;
  try {
    const packLoad = loadPack(id, { force: false });
    if (packLoad.available && packLoad.pack?.house_prior) {
      const hp = packLoad.pack.house_prior;
      const risks = Array.isArray(packLoad.pack.risks) ? packLoad.pack.risks : [];
      const watch = risks.filter((r) => String(r.status || '').toUpperCase() === 'WATCH');
      house_context = {
        status: hp.status || null,
        date: hp.date || null,
        play: hp.play ? String(hp.play).slice(0, 200) : null,
        view_excerpt: hp.view_excerpt
          ? String(hp.view_excerpt).replace(/\s+/g, ' ').slice(0, 420)
          : null,
        watch_count: watch.length,
        watch_labels: watch.slice(0, 8).map((r) => {
          const name = String(r.name || r.id || '');
          const m = name.match(/R\d+/i);
          return {
            id: r.id,
            label: m ? m[0].toUpperCase() : String(r.id || '').slice(0, 12),
            name: name.replace(/^R\d+\s*[—–-]\s*/i, '').slice(0, 80),
            status: r.status,
          };
        }),
      };
    }
  } catch { /* pack optional */ }

  return {
    available: true,
    desk: opts.desk || null,
    ticker: id,
    path: filePath,
    schema_version: snap.schema_version,
    as_of: snap.as_of || null,
    built_at: snap.built_at || snap.fetched_at || null,
    fetched_at: snap.fetched_at || snap.built_at || null,
    frame: snap.frame || null,
    house_touch: snap.house_touch || snapshot.house_touch || null,
    house_context,
    assumptions,
    bridge,
    variance,
    gaps: snap.gaps || [],
    print: snap.print || null,
    disclaimer: snap.disclaimer,
    status: snap.status || 'published',
    method: snap.method || null,
    prior: snapshot.prior || null,
    verify: snapshot.verify || snap.verify || null,
    needs_rebuild: false,
    computed: {
      n_assumptions: assumptions.length,
      n_bridge: bridge.length,
      n_variance: variance.length,
      n_watch_linked: n_watch,
      n_gaps: (snap.gaps || []).length,
      n_pack_actual: layer_counts.pack_actual || 0,
      n_pack_guide: layer_counts.pack_guide || 0,
      n_user_case: layer_counts.user_case || 0,
      n_case_filled,
      n_case_gap: caseRows.length - n_case_filled,
      layer_counts,
    },
    decision_support_only: true,
    note: 'Working model vault — pack facts + your case. Not PT / not house write path / not Street.',
  };
}

function failKeep(prev, id, opts, error) {
  if (prev.available && prev.snapshot) {
    return {
      ok: false,
      error,
      kept_last_good: true,
      ...getWorkingModel(id, opts),
    };
  }
  return {
    ok: false,
    error,
    kept_last_good: false,
    ...emptyWorkingModelPayload(id, { desk: opts.desk }),
  };
}

/**
 * Publish working model (format-gated).
 * @param {string} ticker
 * @param {object} [body]
 * @param {{ desk?: string }} [opts]
 */
export async function refreshWorkingModel(ticker, body = {}, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id) {
    return { ok: false, error: 'empty ticker', ...emptyWorkingModelPayload('') };
  }

  const prev = readWorkingModelSnapshot(id);
  const priorSummary = prev.available && prev.snapshot
    ? summarizeWorkingModelPrior(prev.snapshot)
    : null;

  const hasPayload = !!(
    (Array.isArray(body.assumptions) && body.assumptions.length)
    || (Array.isArray(body.bridge) && body.bridge.length)
    || body.snapshot
    || body.schema_version
    || body.mode === 'publish'
  );

  if (!hasPayload) {
    return failKeep(
      prev,
      id,
      opts,
      'Working model: POST assumptions + bridge (schema_version 1), or use OPEN GROK /cockpit-model. Empty body does not clear vault.',
    );
  }

  const raw = body.snapshot && typeof body.snapshot === 'object'
    ? { ...body.snapshot, ticker: id }
    : { ...body, ticker: id, schema_version: body.schema_version || WORKING_MODEL_SCHEMA_VERSION };

  // The print block is owned solely by arm/lock — refresh can never set, clear, or
  // unlock it. Without this an agent rebuild could silently drop a locked commitment.
  const priorPrint = (prev.available && prev.snapshot?.print) ? prev.snapshot.print : null;
  const attemptedPrintWrite = raw.print !== undefined;
  raw.print = priorPrint;

  // Auto-build variance from prior if not provided
  if ((!Array.isArray(raw.variance) || !raw.variance.length) && priorSummary?.by_id) {
    const variance = [];
    const assumptions = Array.isArray(raw.assumptions) ? raw.assumptions : [];
    for (const a of assumptions) {
      const idKey = a.id || String(a.label || '').toLowerCase().replace(/[^a-z0-9]+/g, '_');
      const prevRow = priorSummary.by_id[idKey];
      if (!prevRow) continue;
      const cur = a.value != null ? String(a.value) : null;
      const prior = prevRow.value != null ? String(prevRow.value) : null;
      if (prior !== cur) {
        variance.push({
          line: a.label || idKey,
          prior,
          current: cur,
          delta: prior != null && cur != null ? `${prior} → ${cur}` : null,
          comment: 'auto vs prior model',
        });
      }
    }
    if (variance.length) raw.variance = variance;
  }

  const validated = validateWorkingModelSnapshot(raw, { ticker: id, requireContent: true });
  if (!validated.ok) {
    return {
      ...failKeep(prev, id, opts, `format verify failed: ${validated.errors.join('; ')}`),
      format_errors: validated.errors,
      format_warnings: validated.warnings,
    };
  }

  // Hard lock: a locked case line is what you actually pre-committed. Fail closed.
  const violations = lockViolations(priorPrint, validated.snapshot.assumptions);
  if (violations.length) {
    return {
      ...failKeep(prev, id, opts, `print locked: ${violations.join('; ')}`),
      lock_violations: violations,
      print_locked: true,
    };
  }

  const warnings = [...(validated.warnings || [])];
  if (attemptedPrintWrite) {
    warnings.push('print block ignored on refresh — use arm/lock');
  }

  const snapshot = {
    ...validated.snapshot,
    prior: priorSummary,
    verify: {
      format_ok: true,
      checked_at: new Date().toISOString(),
      issues: warnings,
    },
  };

  try {
    const filePath = writeWorkingModelSnapshot(id, snapshot);
    let history_path = null;
    try {
      history_path = writeWorkingModelHistory(id, snapshot);
    } catch { /* best-effort */ }
    return {
      ok: true,
      written: filePath,
      history_path,
      kept_last_good: false,
      format_ok: true,
      ...getWorkingModel(id, opts),
    };
  } catch (e) {
    return failKeep(prev, id, opts, e.message || String(e));
  }
}

/**
 * Re-publish an existing snapshot with a new print block, through the same format gate.
 * @param {string} id
 * @param {object} snapshot current vault snapshot
 * @param {object|null} print
 * @param {{ desk?: string }} opts
 * @param {{ marker?: string }} [historyOpts]
 */
function publishPrintChange(id, snapshot, print, opts, historyOpts = {}) {
  const validated = validateWorkingModelSnapshot(
    { ...snapshot, print },
    { ticker: id, requireContent: true },
  );
  if (!validated.ok) {
    return {
      ok: false,
      error: `format verify failed: ${validated.errors.join('; ')}`,
      format_errors: validated.errors,
      kept_last_good: true,
      ...getWorkingModel(id, opts),
    };
  }

  const next = {
    ...validated.snapshot,
    prior: snapshot.prior || null,
    verify: {
      format_ok: true,
      checked_at: new Date().toISOString(),
      issues: validated.warnings || [],
    },
  };

  try {
    const written = writeWorkingModelSnapshot(id, next);
    let history_path = null;
    if (historyOpts.marker) {
      try {
        history_path = writeWorkingModelHistory(id, next, { marker: historyOpts.marker });
      } catch { /* best-effort */ }
    }
    return {
      ok: true,
      written,
      history_path,
      format_ok: true,
      ...getWorkingModel(id, opts),
    };
  } catch (e) {
    return {
      ok: false,
      error: e.message || String(e),
      kept_last_good: true,
      ...getWorkingModel(id, opts),
    };
  }
}

/**
 * ARM a print — manual event label + date (Phase A: no IR fetch, nothing invented).
 * Re-arming after a lock starts a fresh cycle; the locked snapshot stays in history.
 * @param {string} ticker
 * @param {{ event?: string, date?: string }} body
 * @param {{ desk?: string }} [opts]
 */
export function armWorkingModelPrint(ticker, body = {}, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const prev = readWorkingModelSnapshot(id);
  if (!prev.available || !prev.snapshot) {
    return {
      ok: false,
      error: 'No working model yet — UPDATE MODEL before arming a print.',
      ...emptyWorkingModelPayload(id, { desk: opts.desk }),
    };
  }

  const event = String(body.event || '').trim().slice(0, PRINT_EVENT_MAX);
  const date = normalizePrintDate(body.date);
  if (!event || !date) {
    return {
      ok: false,
      error: !event
        ? 'Event label required (e.g. FQ2-2027).'
        : 'Print date required as YYYY-MM-DD.',
      ...getWorkingModel(id, opts),
    };
  }

  return publishPrintChange(id, prev.snapshot, {
    event,
    date,
    date_source: 'user',
    status: 'armed',
    armed_at: new Date().toISOString(),
    locked_at: null,
    locked_case: [],
  }, opts);
}

/**
 * HARD LOCK the case for the armed print. Snapshots every user_case row as-is —
 * GAP rows lock as GAP, because a line you did not commit is not a case.
 * @param {string} ticker
 * @param {{ desk?: string }} [opts]
 */
export function lockWorkingModelPrint(ticker, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const prev = readWorkingModelSnapshot(id);
  if (!prev.available || !prev.snapshot) {
    return {
      ok: false,
      error: 'No working model yet — nothing to lock.',
      ...emptyWorkingModelPayload(id, { desk: opts.desk }),
    };
  }

  const print = prev.snapshot.print;
  if (!print || print.status !== 'armed') {
    return {
      ok: false,
      error: print?.status === 'locked'
        ? `Print ${print.event} is already locked.`
        : 'No armed print — ARM PRINT first.',
      ...getWorkingModel(id, opts),
    };
  }

  const assumptions = Array.isArray(prev.snapshot.assumptions) ? prev.snapshot.assumptions : [];
  const caseRows = assumptions.filter((a) => a?.layer === 'user_case');
  const filled = caseRows.filter(isFilledCase);
  if (!filled.length) {
    return {
      ok: false,
      error: 'Fill at least one YOUR CASE line before locking — an all-GAP case commits to nothing.',
      ...getWorkingModel(id, opts),
    };
  }

  return publishPrintChange(id, prev.snapshot, {
    ...print,
    status: 'locked',
    locked_at: new Date().toISOString(),
    locked_case: caseRows.map((a) => ({
      id: a.id,
      label: a.label,
      value: a.value,
      unit: a.unit || null,
    })),
  }, opts, { marker: `lock-${print.event}` });
}
