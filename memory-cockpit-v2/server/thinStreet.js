// thinStreet.js — per-ticker published street targets (third-party PTs/ratings).
// Vault: research-wiki/cockpit/street/{TICKER}.json — NOT pack SoR / house.
// v2: Memory-parity firm models (why + sources); format gate via streetSchema.js.
// Decision-support only. Never invent firms or PTs.
import fs from 'fs';
import path from 'path';
import { resolveVaultDir } from './monorepoPaths.js';
import {
  STREET_SCHEMA_VERSION,
  validateStreetSnapshot,
  infoChecklist,
  coercePt,
  isCompleteFirm,
} from './streetSchema.js';

/** Days after which a snapshot is marked STALE (fetched_at). */
export const STALE_DAYS = 14;
const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

function vaultRoot() {
  return resolveVaultDir();
}

export function streetDir() {
  return path.join(vaultRoot(), 'cockpit', 'street');
}

export function streetHistoryDir(ticker) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  return path.join(streetDir(), 'history', id);
}

export function streetPath(ticker) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id) return null;
  return path.join(streetDir(), `${id}.json`);
}

function median(nums) {
  if (!nums.length) return null;
  const a = [...nums].sort((x, y) => x - y);
  const m = Math.floor(a.length / 2);
  return a.length % 2 ? a[m] : (a[m - 1] + a[m]) / 2;
}

/**
 * @param {unknown} row
 * @returns {object|null}
 */
export function normalizeFirmRow(row) {
  if (!row || typeof row !== 'object') return null;
  const firm = String(row.firm || row.broker || row.name || '').trim();
  if (!firm) return null;
  let pt = row.pt ?? row.price_target ?? row.target ?? null;
  if (pt != null && pt !== '') {
    const n = Number(pt);
    pt = Number.isFinite(n) ? n : null;
  } else {
    pt = null;
  }
  return {
    firm,
    analyst: row.analyst != null ? String(row.analyst).trim() || null : null,
    rating: row.rating != null ? String(row.rating).trim() || null : null,
    pt,
    currency: row.currency != null ? String(row.currency).trim() || 'USD' : 'USD',
    as_of: row.as_of != null ? String(row.as_of).slice(0, 32) : null,
    url: row.url != null ? String(row.url).trim() || null : null,
    note: row.note != null ? String(row.note).trim() || null : null,
  };
}

/**
 * Compact prior for Δ (stored on next snapshot).
 * @param {object} snap
 */
export function summarizePrior(snap) {
  if (!snap || typeof snap !== 'object') return null;
  const firms = Array.isArray(snap.firms) ? snap.firms : [];
  const pts = firms.map((f) => f.pt).filter((p) => p != null && Number.isFinite(Number(p))).map(Number);
  const cons = snap.consensus && typeof snap.consensus === 'object' ? snap.consensus : null;
  const byFirm = {};
  for (const f of firms) {
    if (!f?.firm) continue;
    const key = String(f.firm).toLowerCase();
    byFirm[key] = {
      firm: f.firm,
      pt: f.pt != null && Number.isFinite(Number(f.pt)) ? Number(f.pt) : null,
      rating: f.rating || null,
    };
  }
  return {
    as_of: snap.as_of || null,
    fetched_at: snap.fetched_at || null,
    provider: snap.provider || null,
    n_firms: firms.length,
    pt_high: coercePt(cons?.pt_high ?? cons?.high) ?? (pts.length ? Math.max(...pts) : null),
    pt_low: coercePt(cons?.pt_low ?? cons?.low) ?? (pts.length ? Math.min(...pts) : null),
    pt_mean: coercePt(cons?.pt_avg ?? cons?.mean) ?? median(pts),
    mean_rating: cons?.mean_rating || cons?.rating || null,
    by_firm: byFirm,
  };
}

/**
 * Δ current snapshot vs prior summary.
 * @param {object} snap
 * @param {object|null} prior
 */
export function deltaVsPrior(snap, prior) {
  if (!prior || typeof prior !== 'object') return null;
  const cons = snap?.consensus && typeof snap.consensus === 'object' ? snap.consensus : null;
  const firms = Array.isArray(snap?.firms) ? snap.firms : [];
  const pts = firms.map((f) => f.pt).filter((p) => p != null && Number.isFinite(Number(p))).map(Number);

  const curHigh = cons?.high != null ? Number(cons.high) : (pts.length ? Math.max(...pts) : null);
  const curLow = cons?.low != null ? Number(cons.low) : (pts.length ? Math.min(...pts) : null);
  const curMean = cons?.mean != null ? Number(cons.mean) : median(pts);

  const numDelta = (cur, prev) => {
    if (cur == null || prev == null || !Number.isFinite(cur) || !Number.isFinite(prev)) return null;
    return Math.round((cur - prev) * 100) / 100;
  };

  let raised = 0;
  let cut = 0;
  let unchanged = 0;
  let newFirms = 0;
  const prevMap = prior.by_firm && typeof prior.by_firm === 'object' ? prior.by_firm : {};

  for (const f of firms) {
    if (f.pt == null || !Number.isFinite(Number(f.pt))) continue;
    const key = String(f.firm || '').toLowerCase();
    const prev = prevMap[key];
    if (!prev || prev.pt == null || !Number.isFinite(Number(prev.pt))) {
      newFirms += 1;
      continue;
    }
    const d = Number(f.pt) - Number(prev.pt);
    if (d > 0.005) raised += 1;
    else if (d < -0.005) cut += 1;
    else unchanged += 1;
  }

  return {
    prior_as_of: prior.as_of || null,
    prior_fetched_at: prior.fetched_at || null,
    mean_delta: numDelta(curMean, prior.pt_mean != null ? Number(prior.pt_mean) : null),
    high_delta: numDelta(curHigh, prior.pt_high != null ? Number(prior.pt_high) : null),
    low_delta: numDelta(curLow, prior.pt_low != null ? Number(prior.pt_low) : null),
    firm_pt_raised: raised,
    firm_pt_cut: cut,
    firm_pt_unchanged: unchanged,
    firm_pt_new: newFirms,
    n_firms_delta: firms.length - (prior.n_firms != null ? Number(prior.n_firms) : 0),
  };
}

/**
 * @param {object} snap
 */
export function computeStreetView(snap) {
  const firms = Array.isArray(snap?.firms) ? snap.firms : [];
  const pts = firms.map((f) => f.pt).filter((p) => p != null && Number.isFinite(Number(p))).map(Number);
  const fetched = snap?.fetched_at ? Date.parse(snap.fetched_at) : NaN;
  const ageMs = Number.isFinite(fetched) ? Math.max(0, Date.now() - fetched) : null;
  const stale = ageMs == null ? true : ageMs > STALE_MS;
  const age_days = ageMs == null ? null : Math.round((ageMs / 864e5) * 10) / 10;
  return {
    n_firms: firms.length,
    n_with_pt: pts.length,
    pt_high: pts.length ? Math.max(...pts) : null,
    pt_low: pts.length ? Math.min(...pts) : null,
    pt_median: median(pts),
    stale,
    stale_days_threshold: STALE_DAYS,
    age_days,
    currency: snap?.currency || 'USD',
  };
}

/**
 * @param {string} ticker
 */
export function readStreetSnapshot(ticker) {
  const filePath = streetPath(ticker);
  if (!filePath) {
    return { available: false, snapshot: null, path: '', reason: 'empty ticker' };
  }
  if (!fs.existsSync(filePath)) {
    return {
      available: false,
      snapshot: null,
      path: filePath,
      reason: 'No street snapshot yet — REFRESH STREET or POST firms',
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
      reason: `street file unreadable: ${e.message || e}`,
    };
  }
}

/**
 * @param {string} ticker
 * @param {object} snapshot
 */
export function writeStreetSnapshot(ticker, snapshot) {
  const filePath = streetPath(ticker);
  if (!filePath) throw new Error('empty ticker');
  const dir = streetDir();
  fs.mkdirSync(dir, { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
  return filePath;
}

/**
 * Archive a copy under history/ for Δ over time (best-effort).
 * @param {string} ticker
 * @param {object} snapshot
 */
export function writeStreetHistory(ticker, snapshot) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id || !snapshot) return null;
  const dir = streetHistoryDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const stamp = String(snapshot.fetched_at || new Date().toISOString()).replace(/[:.]/g, '-');
  const filePath = path.join(dir, `${stamp}.json`);
  fs.writeFileSync(filePath, `${JSON.stringify(snapshot, null, 2)}\n`, 'utf8');
  return filePath;
}

/**
 * @param {string} ticker
 * @param {object} [extra]
 */
export function emptyStreetPayload(ticker, extra = {}) {
  const id = String(ticker || '').toUpperCase();
  return {
    available: false,
    desk: extra.desk || null,
    ticker: id,
    path: streetPath(id),
    schema_version: STREET_SCHEMA_VERSION,
    reason: extra.reason || 'No curated street models yet — REBUILD STREET (agent) or publish schema v2 firms with why',
    needs_rebuild: true,
    decision_support_only: true,
    note: 'Third-party published targets only — not house PT / not pack SoR.',
    ...extra,
  };
}

/**
 * Glass GET payload.
 * @param {string} ticker
 * @param {{ desk?: string }} [opts]
 */
export function getStreet(ticker, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const { available, snapshot, path: filePath, reason } = readStreetSnapshot(id);
  if (!available || !snapshot) {
    return emptyStreetPayload(id, { desk: opts.desk, reason });
  }
  const computed = computeStreetView(snapshot);
  const cons = snapshot.consensus && typeof snapshot.consensus === 'object' ? snapshot.consensus : null;
  // v2 consensus uses pt_avg/pt_high/pt_low; v1 used mean/high/low
  if (cons) {
    const high = coercePt(cons.pt_high ?? cons.high);
    const low = coercePt(cons.pt_low ?? cons.low);
    const mean = coercePt(cons.pt_avg ?? cons.mean);
    if (high != null) computed.pt_high = high;
    if (low != null) computed.pt_low = low;
    if (mean != null) computed.pt_median = mean;
    if (cons.n_brokers_listed != null) computed.n_brokers_listed = cons.n_brokers_listed;
    if (cons.mean_rating || cons.rating) computed.mean_rating = cons.mean_rating || cons.rating;
    if (cons.tally) computed.tally = cons.tally;
  }
  const prior = snapshot.prior || null;
  const delta = deltaVsPrior(snapshot, prior);
  const schema_version = Number(snapshot.schema_version || 1);
  const rawFirms = Array.isArray(snapshot.firms) ? snapshot.firms : [];
  // Never show incomplete rows (no empty cells / empty coverage lists)
  const firms = rawFirms.filter(isCompleteFirm);
  const suppressed = rawFirms.length - firms.length;
  const complete = firms.length >= 3
    && snapshot.frame
    && snapshot.bull
    && snapshot.bear
    && (cons?.pt_avg != null || cons?.mean != null || computed.pt_median != null);
  const needs_rebuild = !complete;

  // Incomplete legacy snapshots → EMPTY CTA (not a sparse table)
  if (needs_rebuild) {
    return emptyStreetPayload(id, {
      desk: opts.desk,
      reason: suppressed > 0 || rawFirms.length
        ? `Street models incomplete (${firms.length} complete of ${rawFirms.length}). REBUILD STREET — agent fills PT, rating, 3–5 sentence why, and article link for each firm.`
        : 'No complete street models. REBUILD STREET runs the agent fill→verify loop.',
      legacy_path: filePath,
      legacy_n: rawFirms.length,
      complete_n: firms.length,
      needs_rebuild: true,
    });
  }

  computed.n_firms = firms.length;
  computed.n_with_pt = firms.filter((f) => f.pt != null).length;

  return {
    available: true,
    desk: opts.desk || null,
    ticker: id,
    path: filePath,
    schema_version,
    name: snapshot.name || null,
    as_of: snapshot.as_of || null,
    built_at: snapshot.built_at || snapshot.fetched_at || null,
    fetched_at: snapshot.fetched_at || snapshot.built_at || null,
    provider: snapshot.provider || null,
    method: snapshot.method || null,
    status: snapshot.status || 'published',
    frame: snapshot.frame || null,
    actuals: snapshot.actuals || null,
    bull: snapshot.bull || null,
    bear: snapshot.bear || null,
    trap: snapshot.trap || null,
    partial: snapshot.partial !== false,
    warnings: Array.isArray(snapshot.warnings) ? snapshot.warnings : [],
    firms,
    consensus: cons,
    prior,
    delta,
    verify: snapshot.verify || null,
    needs_rebuild: false,
    computed,
    decision_support_only: true,
    note: 'Third-party published targets only — not house PT / not pack SoR.',
  };
}

function failKeep(prev, id, opts, error) {
  if (prev.available && prev.snapshot) {
    return {
      ok: false,
      error,
      kept_last_good: true,
      ...getStreet(id, opts),
    };
  }
  return {
    ok: false,
    error,
    kept_last_good: false,
    ...emptyStreetPayload(id, { desk: opts.desk }),
  };
}

/**
 * Publish Street v2 snapshot (format-gated). Curated firms with why — not Nasdaq coverage dump.
 * body: full snapshot or { firms, consensus, bull, bear, trap, frame, actuals, ... }.
 *
 * @param {string} ticker
 * @param {object} [body]
 * @param {{ desk?: string }} [opts]
 */
export async function refreshStreet(ticker, body = {}, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id) {
    return { ok: false, error: 'empty ticker', ...emptyStreetPayload('') };
  }

  const prev = readStreetSnapshot(id);
  const priorSummary = prev.available && prev.snapshot ? summarizePrior(prev.snapshot) : null;
  const rawFirms = Array.isArray(body.firms) ? body.firms : null;
  const hasPayload = !!(rawFirms?.length || body.snapshot || body.schema_version || body.mode === 'publish');

  if (!hasPayload) {
    return failKeep(
      prev,
      id,
      opts,
      'Street v2: firm table is curated Memory-style models. Use OPEN GROK (/cockpit-street) or POST schema_version 2 firms with why. Auto-scrape no longer replaces the firm table.',
    );
  }

  const raw = body.snapshot && typeof body.snapshot === 'object'
    ? { ...body.snapshot, ticker: id }
    : { ...body, ticker: id, schema_version: body.schema_version || STREET_SCHEMA_VERSION };

  const validated = validateStreetSnapshot(raw, { ticker: id, requireFirms: true });
  if (!validated.ok) {
    return {
      ...failKeep(prev, id, opts, `format verify failed: ${validated.errors.join('; ')}`),
      format_errors: validated.errors,
      format_warnings: validated.warnings,
    };
  }

  const info = infoChecklist(validated.snapshot);
  if (!info.info_ok) {
    return {
      ...failKeep(prev, id, opts, `info verify failed: ${info.issues.join('; ')}`),
      format_ok: true,
      info_ok: false,
      info_issues: info.issues,
    };
  }

  const snapshot = {
    ...validated.snapshot,
    prior: priorSummary,
    verify: {
      format_ok: true,
      info_ok: true,
      checked_at: new Date().toISOString(),
      issues: [],
      loops: body.verify?.loops || { format: 1, info: 1 },
    },
  };

  try {
    const filePath = writeStreetSnapshot(id, snapshot);
    let history_path = null;
    try {
      history_path = writeStreetHistory(id, snapshot);
    } catch { /* best-effort */ }
    return {
      ok: true,
      written: filePath,
      history_path,
      kept_last_good: false,
      format_ok: true,
      info_ok: true,
      info_issues: [],
      ...getStreet(id, opts),
    };
  } catch (e) {
    return failKeep(prev, id, opts, e.message || String(e));
  }
}
