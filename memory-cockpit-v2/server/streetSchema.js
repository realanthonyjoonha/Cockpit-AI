// streetSchema.js — hard format gate for Street v2 (agent-built firm models).
// Complete rows only: PT + rating + 3–5 sentence why + article URL.
// Decision-support only. Fail closed — do not publish incomplete snapshots.
export const STREET_SCHEMA_VERSION = 2;

/** ~3 sentences minimum (characters). */
export const WHY_MIN_LEN = 180;
/** Soft upper bound for “3–5 sentences” (~5 short sentences). */
export const WHY_MAX_LEN = 900;
export const MIN_FIRMS = 3;
export const MAX_FIRMS = 25;

const ADVICE_RE = /\b(buy|sell|short|long more|trim|add to|position size|how many shares|price target for you|should i (buy|sell)|house (buy|sell|pt)|we recommend|you should (buy|sell))\b/i;
const URL_RE = /^https?:\/\/.+/i;

/**
 * @param {unknown} pt
 * @returns {number|null}
 */
export function coercePt(pt) {
  if (pt == null || pt === '') return null;
  if (typeof pt === 'number' && Number.isFinite(pt)) return pt;
  const n = Number(String(pt).replace(/[$,\s]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Count sentence-like units (., !, ?). */
export function countSentences(text) {
  const t = String(text || '').trim();
  if (!t) return 0;
  const parts = t.split(/[.!?]+/).map((s) => s.trim()).filter((s) => s.length > 8);
  return parts.length || (t.length >= WHY_MIN_LEN ? 1 : 0);
}

/**
 * True if firm row is display-complete (no empty cells).
 * @param {object} f
 */
export function isCompleteFirm(f) {
  if (!f || typeof f !== 'object') return false;
  if (!String(f.firm || '').trim()) return false;
  if (coercePt(f.pt) == null) return false;
  if (!String(f.rating || '').trim()) return false;
  if (!String(f.date || f.as_of || '').trim()) return false;
  const why = String(f.why || '').trim();
  if (why.length < WHY_MIN_LEN || why.length > WHY_MAX_LEN) return false;
  if (countSentences(why) < 3) return false;
  const url = String(f.source_url || f.url || '').trim();
  if (!URL_RE.test(url)) return false;
  if (ADVICE_RE.test(why)) return false;
  return true;
}

/**
 * Normalize one firm row for v2.
 * @param {unknown} row
 */
export function normalizeFirmV2(row) {
  if (!row || typeof row !== 'object') return null;
  const firm = String(row.firm || row.broker || row.name || '').trim();
  if (!firm) return null;
  const pt = coercePt(row.pt ?? row.price_target ?? row.target);
  const rating = row.rating != null ? String(row.rating).trim() || null : null;
  const whyRaw = row.why != null ? String(row.why).trim() : '';
  const date = row.date != null ? String(row.date).trim()
    : (row.as_of != null ? String(row.as_of).trim() : null);
  let flag = row.flag != null ? String(row.flag).toLowerCase() : null;
  if (flag && !['bull', 'bear', 'stale', 'anchor'].includes(flag)) flag = null;
  const source_url = row.source_url != null ? String(row.source_url).trim()
    : (row.url != null ? String(row.url).trim() : '');

  return {
    firm,
    rating,
    pt,
    pt_display: row.pt_display != null ? String(row.pt_display) : (pt != null ? `$${pt}` : null),
    date: date || null,
    why: whyRaw || null,
    flag,
    source_url: source_url || null,
    source_note: row.source_note != null ? String(row.source_note).trim() || null : null,
    metrics: row.metrics && typeof row.metrics === 'object' ? row.metrics : null,
    y2026: row.y2026 != null ? String(row.y2026) : null,
    y2027: row.y2027 != null ? String(row.y2027) : null,
    y2028: row.y2028 != null ? String(row.y2028) : null,
  };
}

/**
 * Format-verify a full street snapshot. Incomplete firms → errors (not silent blanks).
 * @param {object} raw
 * @param {{ ticker?: string, requireFirms?: boolean }} [opts]
 */
export function validateStreetSnapshot(raw, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['body must be an object'], warnings };
  }

  const ticker = String(opts.ticker || raw.ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!ticker) errors.push('ticker required');

  const schema_version = Number(raw.schema_version ?? STREET_SCHEMA_VERSION);
  if (schema_version !== STREET_SCHEMA_VERSION) {
    errors.push(`schema_version must be ${STREET_SCHEMA_VERSION}`);
  }

  const firmsIn = Array.isArray(raw.firms) ? raw.firms : null;
  if (!firmsIn) {
    errors.push('firms[] required');
    return { ok: false, errors, warnings };
  }

  const requireFirms = opts.requireFirms !== false;
  if (requireFirms && firmsIn.length === 0) {
    errors.push('firms[] must be non-empty');
  }
  if (firmsIn.length > MAX_FIRMS) {
    errors.push(`firms[] max ${MAX_FIRMS} complete models (prefer depth over breadth)`);
  }

  const seen = new Set();
  const firms = [];
  for (let i = 0; i < firmsIn.length; i++) {
    const n = normalizeFirmV2(firmsIn[i]);
    if (!n) {
      errors.push(`firms[${i}]: missing firm name`);
      continue;
    }
    const key = n.firm.toLowerCase();
    if (seen.has(key)) {
      errors.push(`firms[${i}]: duplicate firm "${n.firm}"`);
      continue;
    }
    seen.add(key);

    if (n.pt == null) {
      errors.push(`firms[${i}] (${n.firm}): pt required (no empty target cells)`);
    }
    if (!n.rating) {
      errors.push(`firms[${i}] (${n.firm}): rating required (no empty rating cells)`);
    }
    if (!n.date) {
      errors.push(`firms[${i}] (${n.firm}): date required`);
    }
    if (!n.why || n.why.length < WHY_MIN_LEN) {
      errors.push(`firms[${i}] (${n.firm}): why must be 3–5 sentences (≥${WHY_MIN_LEN} chars)`);
    } else if (n.why.length > WHY_MAX_LEN) {
      errors.push(`firms[${i}] (${n.firm}): why too long (keep ~3–5 sentences, ≤${WHY_MAX_LEN} chars)`);
    } else if (countSentences(n.why) < 3) {
      errors.push(`firms[${i}] (${n.firm}): why needs ≥3 sentences explaining the PT`);
    }
    if (!n.source_url || !URL_RE.test(n.source_url)) {
      errors.push(`firms[${i}] (${n.firm}): source_url required (https link to article/note)`);
    }
    if (n.why && ADVICE_RE.test(n.why)) {
      errors.push(`firms[${i}] (${n.firm}): why must not be personal buy/sell advice`);
    }
    if (isCompleteFirm(n)) firms.push(n);
  }

  if (requireFirms && firms.length < MIN_FIRMS && errors.length === 0) {
    errors.push(`need at least ${MIN_FIRMS} complete firm models (got ${firms.length})`);
  }
  // If some rows invalid, still error overall
  if (firms.length < firmsIn.length && firmsIn.length > 0 && errors.length === 0) {
    errors.push('some firms incomplete — every published row must be fully filled');
  }

  for (const field of ['bull', 'bear', 'trap', 'frame', 'actuals']) {
    if (raw[field] && ADVICE_RE.test(String(raw[field]))) {
      errors.push(`${field}: looks like advice language`);
    }
  }

  // Narrative blocks required for non-empty publish (no empty sections on glass)
  if (requireFirms && firms.length > 0) {
    if (!raw.frame || String(raw.frame).trim().length < 40) {
      errors.push('frame required (≥40 chars): how to read the table');
    }
    if (!raw.bull || String(raw.bull).trim().length < 40) {
      errors.push('bull required (≥40 chars): street bull frame');
    }
    if (!raw.bear || String(raw.bear).trim().length < 40) {
      errors.push('bear required (≥40 chars): street skeptic frame');
    }
    if (!raw.consensus || typeof raw.consensus !== 'object') {
      errors.push('consensus object required (rating/tally/pt_avg/pt_low/pt_high)');
    } else {
      const c = raw.consensus;
      if (coercePt(c.pt_avg ?? c.mean ?? c.ptAvg) == null) errors.push('consensus.pt_avg required');
      if (coercePt(c.pt_low ?? c.low ?? c.ptLow) == null) errors.push('consensus.pt_low required');
      if (coercePt(c.pt_high ?? c.high ?? c.ptHigh) == null) errors.push('consensus.pt_high required');
      if (!c.tally && !c.rating) errors.push('consensus.tally or consensus.rating required');
    }
  }

  let consensus = null;
  if (raw.consensus && typeof raw.consensus === 'object') {
    const c = raw.consensus;
    consensus = {
      rating: c.rating != null ? String(c.rating) : null,
      tally: c.tally != null ? String(c.tally) : null,
      pt_avg: coercePt(c.pt_avg ?? c.mean ?? c.ptAvg),
      pt_low: coercePt(c.pt_low ?? c.low ?? c.ptLow),
      pt_high: coercePt(c.pt_high ?? c.high ?? c.ptHigh),
      pt_note: c.pt_note != null ? String(c.pt_note) : (c.ptNote != null ? String(c.ptNote) : null),
      source: c.source != null ? String(c.source) : null,
    };
  }

  if (errors.length) return { ok: false, errors, warnings };

  const now = new Date().toISOString();
  const snapshot = {
    schema_version: STREET_SCHEMA_VERSION,
    ticker,
    name: raw.name != null ? String(raw.name) : null,
    currency: raw.currency || 'USD',
    as_of: raw.as_of || now.slice(0, 10),
    built_at: raw.built_at || now,
    fetched_at: raw.fetched_at || now,
    status: raw.status || 'published',
    frame: String(raw.frame).trim(),
    actuals: raw.actuals != null ? String(raw.actuals).trim() : null,
    consensus,
    bull: String(raw.bull).trim(),
    bear: String(raw.bear).trim(),
    trap: raw.trap != null && String(raw.trap).trim() ? String(raw.trap).trim() : null,
    firms,
    refresh: {
      cadence: raw.refresh?.cadence || 'after earnings / PT cluster, or monthly',
      last_built_at: now,
      method: raw.refresh?.method || raw.method || 'agent-fill-verify-loop-v2',
      volatile: ['firms', 'consensus', 'as_of', 'bull', 'bear', 'trap'],
    },
    prior: raw.prior || null,
    verify: {
      format_ok: true,
      info_ok: raw.verify?.info_ok !== false,
      checked_at: now,
      issues: Array.isArray(raw.verify?.issues) ? raw.verify.issues.map(String) : [],
      loops: raw.verify?.loops || { format: 0, info: 0 },
    },
    warnings: [
      ...(Array.isArray(raw.warnings) ? raw.warnings.map(String) : []),
      'Curated complete firm models only — not a full sell-side universe',
      'Third-party published targets only — not house PT',
    ],
    provider: raw.provider || 'agent-curated-v2',
    method: raw.method || 'agent-fill-verify-loop-v2',
    partial: true,
    decision_support_only: true,
  };

  return { ok: true, errors: [], warnings, snapshot };
}

/**
 * Info checklist (structural; agent does live source reading).
 * @param {object} snapshot
 */
export function infoChecklist(snapshot) {
  const issues = [];
  for (const f of snapshot?.firms || []) {
    if (!isCompleteFirm(f)) {
      issues.push(`${f.firm || '?'}: incomplete row`);
      continue;
    }
    if (!f.source_url || !URL_RE.test(f.source_url)) {
      issues.push(`${f.firm}: invalid source_url`);
    }
    if (countSentences(f.why) < 3) {
      issues.push(`${f.firm}: why needs ≥3 sentences`);
    }
  }
  if (!snapshot?.frame) issues.push('missing frame');
  if (!snapshot?.bull) issues.push('missing bull');
  if (!snapshot?.bear) issues.push('missing bear');
  if (!snapshot?.consensus?.pt_avg) issues.push('missing consensus.pt_avg');
  return {
    info_ok: issues.length === 0,
    issues,
  };
}
