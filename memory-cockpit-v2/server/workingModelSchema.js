// workingModelSchema.js — format gate for thin desk Model vault (user working numbers).
// Decision-support only. Fail closed — no buy/sell/PT advice language.
// Vault: research-wiki/cockpit/model/{TICKER}.json — NOT pack / house / Street SoR.

export const WORKING_MODEL_SCHEMA_VERSION = 1;

/** Soft max free-text length on notes. */
export const NOTE_MAX_LEN = 800;
export const HOUSE_TOUCH_MAX = 900;
export const WATCH_RISK_MAX = 160;
export const PRINT_EVENT_MAX = 48;

/** Print Card (Phase A): arm an event, lock YOUR CASE before it. No scorecard yet. */
export const PRINT_STATUSES = new Set(['armed', 'locked']);
/** Phase A is manual arm only — agent/IR date fetch is Phase B. */
export const PRINT_DATE_SOURCES = new Set(['user']);

/** Row layers: pack facts vs guide vs your forward case */
export const ASSUMPTION_LAYERS = new Set([
  'pack_actual',
  'pack_guide',
  'user_case',
  'structural',
  'mixed',
]);

const ADVICE_RE =
  /\b(buy|sell|short|long more|trim|add to|position size|how many shares|price target for you|should i (buy|sell)|fair value\s*\$|we recommend|you should (buy|sell)|house (buy|sell|pt))\b/i;

/**
 * @param {unknown} v
 * @returns {string}
 */
function str(v) {
  return v == null ? '' : String(v).trim();
}

/**
 * Preserve pack risk ids (e.g. nvda-r1-data-center-...). Do not truncate to 12 chars.
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizeWatchRiskId(raw) {
  const s = str(raw);
  if (!s) return null;
  // Allow pack slug ids + short Rn labels
  const cleaned = s.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, WATCH_RISK_MAX);
  return cleaned || null;
}

/**
 * Short display label for glass (R1, R2, …) from id or explicit label.
 * @param {string|null} watchRisk
 * @param {unknown} explicit
 */
export function watchRiskLabel(watchRisk, explicit) {
  const e = str(explicit);
  if (e) return e.slice(0, 24);
  if (!watchRisk) return null;
  const m = String(watchRisk).match(/(?:^|[-_])r(\d+)\b/i)
    || String(watchRisk).match(/^R(\d+)$/i);
  if (m) return `R${m[1]}`;
  return String(watchRisk).slice(0, 18);
}

/**
 * @param {unknown} row
 * @returns {object|null}
 */
export function normalizeAssumption(row) {
  if (!row || typeof row !== 'object') return null;
  const label = str(row.label || row.name || row.driver);
  if (!label) return null;
  const id = str(row.id) || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  let source = str(row.source || row.src).toLowerCase() || 'user';
  if (!['user', 'pack', 'paste', 'gap', 'mixed'].includes(source)) source = 'user';

  let layer = str(row.layer || row.tier || row.bucket).toLowerCase() || '';
  if (!ASSUMPTION_LAYERS.has(layer)) {
    // Infer layer from source when omitted
    if (source === 'pack') layer = 'pack_actual';
    else if (source === 'user' || source === 'paste') layer = 'user_case';
    else if (source === 'mixed') layer = 'mixed';
    else if (source === 'gap') layer = 'user_case';
    else layer = 'pack_actual';
  }

  const watch_risk = normalizeWatchRiskId(row.watch_risk || row.risk_id || row.rn);
  const watch_label = watchRiskLabel(watch_risk, row.watch_label || row.risk_label);

  return {
    id: id || `a_${Math.random().toString(36).slice(2, 8)}`,
    label,
    value: row.value != null && row.value !== '' ? str(row.value) : null,
    unit: str(row.unit) || null,
    source,
    layer,
    note: str(row.note).slice(0, NOTE_MAX_LEN) || null,
    watch_risk,
    watch_label,
    watch_note: str(row.watch_note).slice(0, NOTE_MAX_LEN) || null,
  };
}

/**
 * @param {unknown} row
 * @returns {object|null}
 */
export function normalizeBridgeLine(row) {
  if (!row || typeof row !== 'object') return null;
  const label = str(row.label || row.name || row.line);
  if (!label) return null;
  const id = str(row.id) || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 48);
  let layer = str(row.layer || row.tier).toLowerCase() || 'pack_actual';
  if (!ASSUMPTION_LAYERS.has(layer)) layer = 'pack_actual';
  return {
    id: id || `b_${Math.random().toString(36).slice(2, 8)}`,
    label,
    value: row.value != null && row.value !== '' ? str(row.value) : null,
    unit: str(row.unit) || null,
    note: str(row.note).slice(0, NOTE_MAX_LEN) || null,
    layer,
  };
}

/**
 * @param {unknown} row
 * @returns {object|null}
 */
export function normalizeVarianceRow(row) {
  if (!row || typeof row !== 'object') return null;
  const line = str(row.line || row.label || row.name);
  if (!line) return null;
  return {
    line,
    prior: row.prior != null && row.prior !== '' ? str(row.prior) : null,
    current: row.current != null && row.current !== '' ? str(row.current) : null,
    delta: row.delta != null && row.delta !== '' ? str(row.delta) : null,
    comment: str(row.comment || row.note).slice(0, NOTE_MAX_LEN) || null,
  };
}

/**
 * Scan free text for advice language.
 * @param {string} text
 */
function adviceHit(text) {
  return ADVICE_RE.test(text || '');
}

/**
 * Strict calendar YYYY-MM-DD (rejects 2026-02-31).
 * @param {unknown} raw
 * @returns {string|null}
 */
export function normalizePrintDate(raw) {
  const s = str(raw).slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
  return s;
}

/**
 * Print Card block — user-armed event + hard-locked case snapshot.
 * Returns { print, errors }. A null print with no errors means "no print block".
 * @param {unknown} raw
 */
export function normalizePrintBlock(raw) {
  const errors = [];
  if (raw == null) return { print: null, errors };
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { print: null, errors: ['print must be an object'] };
  }

  const event = str(raw.event || raw.label).slice(0, PRINT_EVENT_MAX);
  if (!event) errors.push('print.event required (e.g. FQ2-2027)');
  if (event && adviceHit(event)) errors.push('print.event contains advice language');

  const date = normalizePrintDate(raw.date);
  if (!date) errors.push('print.date required as YYYY-MM-DD');

  let status = str(raw.status).toLowerCase() || 'armed';
  if (!PRINT_STATUSES.has(status)) {
    errors.push(`print.status must be one of ${[...PRINT_STATUSES].join(' | ')}`);
    status = 'armed';
  }

  let date_source = str(raw.date_source).toLowerCase() || 'user';
  if (!PRINT_DATE_SOURCES.has(date_source)) date_source = 'user';

  const locked_case = (Array.isArray(raw.locked_case) ? raw.locked_case : [])
    .map((row) => {
      if (!row || typeof row !== 'object') return null;
      const id = str(row.id);
      if (!id) return null;
      return {
        id,
        label: str(row.label).slice(0, 120) || id,
        value: row.value != null && row.value !== '' ? str(row.value) : null,
        unit: str(row.unit) || null,
      };
    })
    .filter(Boolean);

  for (const row of locked_case) {
    if (adviceHit([row.label, row.value].filter(Boolean).join(' '))) {
      errors.push(`print.locked_case "${row.label}" contains advice language`);
    }
  }

  const locked_at = str(raw.locked_at) || null;
  if (status === 'locked' && !locked_case.length) {
    errors.push('print.status locked requires a locked_case snapshot');
  }
  if (status === 'locked' && !locked_at) {
    errors.push('print.status locked requires locked_at');
  }

  if (errors.length) return { print: null, errors };

  return {
    print: {
      event,
      date,
      date_source,
      status,
      armed_at: str(raw.armed_at) || new Date().toISOString(),
      locked_at: status === 'locked' ? locked_at : null,
      locked_case: status === 'locked' ? locked_case : [],
    },
    errors,
  };
}

/**
 * Format-verify a working model snapshot.
 * @param {object} raw
 * @param {{ ticker?: string, requireContent?: boolean }} [opts]
 */
export function validateWorkingModelSnapshot(raw, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['body must be an object'], warnings };
  }

  const ticker = str(raw.ticker || opts.ticker).toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!ticker) errors.push('ticker required');

  const schema_version = Number(raw.schema_version || WORKING_MODEL_SCHEMA_VERSION);
  if (schema_version !== WORKING_MODEL_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${WORKING_MODEL_SCHEMA_VERSION}`);
  }

  const assumptions = (Array.isArray(raw.assumptions) ? raw.assumptions : [])
    .map(normalizeAssumption)
    .filter(Boolean);
  const bridge = (Array.isArray(raw.bridge) ? raw.bridge : [])
    .map(normalizeBridgeLine)
    .filter(Boolean);
  const variance = (Array.isArray(raw.variance) ? raw.variance : [])
    .map(normalizeVarianceRow)
    .filter(Boolean);

  if (opts.requireContent !== false) {
    if (assumptions.length < 1) errors.push('at least one assumption required');
    if (bridge.length < 1) errors.push('at least one bridge line required');
  }

  for (const a of assumptions) {
    if (adviceHit([a.label, a.value, a.note, a.watch_note].filter(Boolean).join(' '))) {
      errors.push(`assumption "${a.label}" contains advice language`);
    }
  }
  for (const b of bridge) {
    if (adviceHit([b.label, b.value, b.note].filter(Boolean).join(' '))) {
      errors.push(`bridge "${b.label}" contains advice language`);
    }
  }
  for (const v of variance) {
    if (adviceHit([v.line, v.prior, v.current, v.delta, v.comment].filter(Boolean).join(' '))) {
      errors.push(`variance "${v.line}" contains advice language`);
    }
  }

  const frame = str(raw.frame).slice(0, 600) || null;
  if (frame && adviceHit(frame)) errors.push('frame contains advice language');

  const house_touch = str(raw.house_touch || raw.vs_house || raw.house_link).slice(0, HOUSE_TOUCH_MAX) || null;
  if (house_touch && adviceHit(house_touch)) errors.push('house_touch contains advice language');

  const gaps = Array.isArray(raw.gaps)
    ? raw.gaps.map((g) => str(g)).filter(Boolean).slice(0, 30)
    : [];
  for (const g of gaps) {
    if (adviceHit(g)) errors.push('gaps contain advice language');
  }

  const disclaimer = str(raw.disclaimer)
    || 'Decision-support only. Illustration from user assumptions — not a price target, fair value, or recommendation. Not pack or house SoR.';
  if (adviceHit(disclaimer) && !/not a (price target|recommendation)/i.test(disclaimer)) {
    warnings.push('disclaimer unusual');
  }

  if (opts.requireContent !== false && assumptions.length && bridge.length) {
    const hasValue = assumptions.some((a) => a.value != null || a.source === 'gap')
      || bridge.some((b) => b.value != null);
    if (!hasValue) {
      warnings.push('no numeric/text values yet — GAP-only model');
    }
  }

  const { print, errors: printErrors } = normalizePrintBlock(raw.print);
  errors.push(...printErrors);

  if (errors.length) {
    return { ok: false, errors, warnings };
  }

  const now = new Date().toISOString();
  const byLayer = { pack_actual: 0, pack_guide: 0, user_case: 0, structural: 0, mixed: 0 };
  for (const a of assumptions) {
    if (byLayer[a.layer] != null) byLayer[a.layer] += 1;
  }

  const snapshot = {
    schema_version: WORKING_MODEL_SCHEMA_VERSION,
    ticker,
    as_of: str(raw.as_of).slice(0, 32) || now.slice(0, 10),
    built_at: str(raw.built_at) || now,
    fetched_at: str(raw.fetched_at) || now,
    frame,
    house_touch,
    assumptions,
    bridge,
    variance,
    gaps,
    print,
    disclaimer,
    status: str(raw.status) || 'published',
    method: str(raw.method) || 'agent',
    prior: raw.prior && typeof raw.prior === 'object' ? raw.prior : null,
    verify: raw.verify && typeof raw.verify === 'object' ? raw.verify : null,
    _layer_counts: byLayer,
  };

  return { ok: true, errors: [], warnings, snapshot };
}

/**
 * Hard lock: once a print is locked, its case snapshot is immutable. You are scored
 * against what you actually pre-committed. Non-locked lines (pack actuals, new rows)
 * stay editable so the post-print refresh still works.
 * @param {object|null} priorPrint print block already on the vault
 * @param {Array<object>} assumptions normalized incoming assumptions
 * @returns {string[]} violation messages (empty = clean)
 */
export function lockViolations(priorPrint, assumptions) {
  if (!priorPrint || priorPrint.status !== 'locked') return [];
  const locked = Array.isArray(priorPrint.locked_case) ? priorPrint.locked_case : [];
  if (!locked.length) return [];

  const byId = new Map();
  for (const a of assumptions || []) {
    if (a?.id) byId.set(a.id, a);
  }

  const out = [];
  for (const row of locked) {
    const incoming = byId.get(row.id);
    if (!incoming) {
      out.push(`locked case line "${row.label}" cannot be removed while print ${priorPrint.event} is locked`);
      continue;
    }
    const before = row.value == null ? '' : String(row.value);
    const after = incoming.value == null ? '' : String(incoming.value);
    if (before !== after) {
      out.push(`locked case line "${row.label}" is ${before || 'GAP'} — cannot change to ${after || 'GAP'} while print ${priorPrint.event} is locked`);
    }
  }
  return out;
}

/**
 * Compact prior for next variance.
 * @param {object} snap
 */
export function summarizeWorkingModelPrior(snap) {
  if (!snap || typeof snap !== 'object') return null;
  const assumptions = Array.isArray(snap.assumptions) ? snap.assumptions : [];
  const bridge = Array.isArray(snap.bridge) ? snap.bridge : [];
  const by_id = {};
  for (const a of assumptions) {
    if (!a?.id) continue;
    by_id[a.id] = { kind: 'assumption', label: a.label, value: a.value, unit: a.unit, layer: a.layer };
  }
  for (const b of bridge) {
    if (!b?.id) continue;
    by_id[b.id] = { kind: 'bridge', label: b.label, value: b.value, unit: b.unit };
  }
  return {
    as_of: snap.as_of || null,
    built_at: snap.built_at || snap.fetched_at || null,
    n_assumptions: assumptions.length,
    n_bridge: bridge.length,
    by_id,
  };
}
