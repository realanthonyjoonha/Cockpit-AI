// operateGlance.js — multi-desk attention board for START (factory-native).
// Pack/house/risk/street status only — no invent, no PTs as house targets.
// Decision-support only.
import { getLiveThinRegistry, resolveThinDesk } from './thinDeskMount.js';
import { getStreet, STALE_DAYS } from './thinStreet.js';
import { listResearchRuns, scanRunMetas } from './thinResearchRuns.js';
import { stalledOverlay } from './researchRunsWorker.js';
import { loadCachedFilings } from './filingMapInbox.js';
import { lastPrintCatalog, filedSinceCompile } from './secEdgar.js';
import { pendingProposalGlance } from './researchRunCloseout.js';
import { planFilingMapCloseout } from './filingMapCloseout.js';
import { readSorStatusMap } from './riskProposals.js';
import { getResearchRun } from './thinResearchRuns.js';
import fs from 'fs';
import path from 'path';
import { researchRunDir } from './thinResearchRuns.js';
import { isThesisReportJob } from './researchRunsSchema.js';

/** Research run counts in flight for one desk (cross-desk parallel fleet view). */
function researchInFlight(ticker, slug) {
  try {
    const list = listResearchRuns(ticker, { desk: slug });
    const metas = scanRunMetas(ticker);
    const byId = new Map(metas.map((m) => [m.run_id, m]));
    const runs = Array.isArray(list?.runs) ? list.runs : [];
    let running = 0; let stalled = 0;
    let lastComplete = null;
    for (const r of runs) {
      if (r.status === 'complete') {
        if (!lastComplete || String(r.finished_at || '') > String(lastComplete.finished_at || '')) {
          lastComplete = r;
        }
      }
      if (r.status !== 'running' && r.status !== 'queued') continue;
      const meta = byId.get(r.run_id) || r;
      if (stalledOverlay(meta)) stalled += 1;
      else running += 1;
    }
    return {
      running,
      stalled,
      last_complete_run_id: lastComplete?.run_id || null,
      last_complete_at: lastComplete?.finished_at || null,
      last_complete_n_sources: lastComplete?.n_sources || 0,
    };
  } catch {
    return {
      running: 0,
      stalled: 0,
      last_complete_run_id: null,
      last_complete_at: null,
      last_complete_n_sources: 0,
    };
  }
}

function filingGlance(ticker, slug, compiledAt) {
  const empty = {
    filing_print_form: null,
    filing_print_date: null,
    filing_print_in_book: null,
    filing_material_not_in_book: 0,
    filing_map_status: 'none',
    filing_map_run_id: null,
    filing_map_summary: null,
    filing_map_needs_propose: false,
  };
  try {
    const filings = loadCachedFilings(ticker);
    const print = lastPrintCatalog(filings, compiledAt || null);
    const since = filedSinceCompile(filings, compiledAt || null);
    const materialN = Number(since.material_count) || 0;
    const listed = listResearchRuns(ticker, { desk: slug, lane: 'filings' });
    const runs = Array.isArray(listed.runs) ? listed.runs : [];
    const inflight = runs.find((r) => r.status === 'queued' || r.status === 'running');
    const complete = runs.find((r) => r.status === 'complete');
    const status = inflight ? 'queued' : (complete ? 'complete' : 'none');
    const summary = complete?.summary
      ? String(complete.summary).replace(/\s+/g, ' ').trim().slice(0, 160)
      : null;
    let needsPropose = false;
    if (complete?.run_id && status === 'complete') {
      try {
        const dir = researchRunDir(ticker, complete.run_id);
        if (dir && fs.existsSync(dir) && !fs.existsSync(path.join(dir, 'closeout.json'))) {
          const rt = resolveThinDesk(slug);
          const risksRel = rt?.desk?.profile?.risksSource
            || rt?.desk?.risksSourceRel
            || rt?.risksSourceRel;
          const run = getResearchRun(ticker, complete.run_id, { desk: slug });
          if (run?.delta && risksRel) {
            let sorMap = {};
            try { sorMap = readSorStatusMap(risksRel); } catch { /* */ }
            const plan = planFilingMapCloseout(run.delta, { sorMap, runId: complete.run_id });
            needsPropose = (plan.counts?.actionable || 0) > 0;
          } else {
            needsPropose = true;
          }
        }
      } catch { /* */ }
    }
    return {
      filing_print_form: print.known ? print.form : null,
      filing_print_date: print.known ? print.date : null,
      filing_print_in_book: print.known ? print.in_book : null,
      filing_material_not_in_book: materialN,
      filing_map_status: status,
      filing_map_run_id: (complete || inflight)?.run_id || null,
      filing_map_summary: summary,
      filing_map_needs_propose: needsPropose,
    };
  } catch {
    return empty;
  }
}

const STALE_MS = STALE_DAYS * 24 * 60 * 60 * 1000;

/**
 * @param {string|null|undefined} iso
 * @returns {boolean}
 */
function isStaleIso(iso) {
  if (!iso) return false;
  const t = Date.parse(String(iso));
  if (!Number.isFinite(t)) return false;
  return Date.now() - t > STALE_MS;
}

/**
 * One desk row for operate glance. Fail soft per desk.
 * @param {{ slug: string, ticker?: string, label?: string, mark?: string, displayName?: string }} desk
 */
function glanceOne(desk) {
  const slug = String(desk.slug || '').toLowerCase();
  const ticker = String(desk.ticker || slug).toUpperCase();
  const base = {
    slug,
    ticker,
    label: desk.label || ticker,
    mark: desk.mark || String(desk.label || ticker || '?')[0],
    displayName: desk.displayName || desk.label || ticker,
    ok: false,
    house_status: null,
    house_date: null,
    stance_line: null,
    risks_count: 0,
    watch_count: 0,
    fired_count: 0,
    watch_names: [],
    fired_names: [],
    sor_ahead_of_pack: false,
    pack_available: false,
    compiled_at: null,
    street_available: false,
    street_as_of: null,
    street_n_firms: 0,
    street_stale: false,
    street_status: null,
    research_running: 0,
    research_stalled: 0,
    research_last_complete_run_id: null,
    research_last_complete_at: null,
    research_last_complete_n_sources: 0,
    filing_print_form: null,
    filing_print_date: null,
    filing_print_in_book: null,
    filing_material_not_in_book: 0,
    filing_map_status: 'none',
    filing_map_run_id: null,
    filing_map_summary: null,
    filing_map_needs_propose: false,
    propose_pending: 0,
    house_propose_pending: 0,
    risk_propose_pending: 0,
    research_needs_promote: false,
    attention: [],
    error: null,
  };

  try {
    const rt = resolveThinDesk(slug);
    if (!rt?.model) {
      return { ...base, error: 'desk resolve failed', attention: ['resolve'] };
    }

    let ov = {};
    try {
      ov = rt.model.overview() || {};
    } catch (e) {
      return { ...base, error: e.message || String(e), attention: ['overview'] };
    }

    const rs = ov.risk_summary || {};
    const nameOf = (x) => (typeof x === 'string' ? x : (x && x.name) ? String(x.name) : '');
    const watchNames = Array.isArray(rs.watch) ? rs.watch.map(nameOf).filter(Boolean) : [];
    const firedNames = Array.isArray(rs.fired) ? rs.fired.map(nameOf).filter(Boolean) : [];
    const houseStatus = ov.house?.status ? String(ov.house.status) : null;

    let street = { available: false };
    try {
      street = getStreet(ticker, { desk: slug }) || { available: false };
    } catch {
      street = { available: false };
    }

    const firms = Array.isArray(street.firms) ? street.firms : [];
    const streetAvail = street.available === true && firms.length > 0 && !street.needs_rebuild;
    const streetAsOf = street.as_of || street.fetched_at || street.built_at || null;
    const streetStale = streetAvail && isStaleIso(street.fetched_at || street.built_at || street.as_of);
    const streetStatus = streetAvail
      ? (streetStale ? 'STALE' : 'OK')
      : (street.needs_rebuild ? 'NEEDS BUILD' : 'EMPTY');

    const inFlight = researchInFlight(ticker, slug);
    const filings = filingGlance(ticker, slug, ov.compiled_at || null);
    const pending = pendingProposalGlance(slug);

    let researchNeedsPromote = false;
    try {
      const rid = inFlight.last_complete_run_id;
      if (rid) {
        const dir = researchRunDir(ticker, rid);
        const metaPath = dir ? path.join(dir, 'meta.json') : null;
        if (metaPath && fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          const job = String(meta.job || '');
          const promo = meta.promotion || {};
          const promoNone = !promo.status || promo.status === 'none';
          // Glass closeout for runs lives on Reports (thesis). Compile-lane
          // promote stays API/MCP; do not flash START without a room to open.
          if (isThesisReportJob(job) && promoNone
            && !fs.existsSync(path.join(dir, 'closeout.json'))) {
            researchNeedsPromote = true;
          }
        }
      }
    } catch { /* */ }

    const attention = [];
    if (firedNames.length) attention.push('fired');
    if (watchNames.length) attention.push('watch');
    if (houseStatus && /FORMING|DRAFT|pending/i.test(houseStatus)) attention.push('house');
    if (ov.available === false) attention.push('pack');
    if (ov.sor_ahead_of_pack) attention.push('compile');
    if (!streetAvail) attention.push('street');
    else if (streetStale) attention.push('street-stale');
    if (inFlight.stalled) attention.push('compile-stalled');
    else if (inFlight.running) attention.push('compile-running');
    if (filings.filing_material_not_in_book > 0 && filings.filing_map_status !== 'complete') {
      attention.push('filing-unmapped');
    }
    if (filings.filing_map_needs_propose) attention.push('filing-propose');
    if (pending.pending_total > 0) attention.push('propose-pending');
    if (researchNeedsPromote) attention.push('research-promote');

    return {
      ...base,
      ok: true,
      house_status: houseStatus,
      house_date: ov.house?.date || null,
      stance_line: ov.house?.stance_line
        ? String(ov.house.stance_line).replace(/\*\*/g, '').slice(0, 160)
        : null,
      risks_count: Number(rs.count) || (watchNames.length + firedNames.length) || 0,
      watch_count: watchNames.length,
      fired_count: firedNames.length,
      watch_names: watchNames.slice(0, 8),
      fired_names: firedNames.slice(0, 8),
      sor_ahead_of_pack: !!ov.sor_ahead_of_pack,
      pack_available: ov.available !== false,
      compiled_at: ov.compiled_at || null,
      street_available: streetAvail,
      street_as_of: streetAsOf ? String(streetAsOf).slice(0, 10) : null,
      street_n_firms: firms.length,
      street_stale: streetStale,
      street_status: streetStatus,
      research_running: inFlight.running,
      research_stalled: inFlight.stalled,
      research_last_complete_run_id: inFlight.last_complete_run_id || null,
      research_last_complete_at: inFlight.last_complete_at || null,
      research_last_complete_n_sources: inFlight.last_complete_n_sources || 0,
      ...filings,
      propose_pending: pending.pending_total,
      house_propose_pending: pending.house_pending,
      risk_propose_pending: pending.risk_pending,
      research_needs_promote: researchNeedsPromote,
      attention,
      error: null,
    };
  } catch (e) {
    return { ...base, error: e.message || String(e), attention: ['error'] };
  }
}

/**
 * Multi-desk operate glance for START.
 * Empty registry → empty desks[] (friend/kernel cold start OK).
 */
export function operateGlance() {
  const live = getLiveThinRegistry();
  const regDesks = Array.isArray(live.registry?.desks) ? live.registry.desks : [];
  const desks = regDesks.map((d) => glanceOne({
    slug: d.slug,
    ticker: d.ticker,
    label: d.label,
    mark: d.mark,
    displayName: (d.profile && d.profile.displayName) || d.label || d.ticker,
  }));

  // Sort: FIRED first, then WATCH, then house FORMING, then street empty/stale, then slug
  const rank = (row) => {
    if (row.attention.includes('compile-stalled')) return 0;
    if (row.attention.includes('compile-running')) return 1;
    if (row.fired_count > 0) return 2;
    if (row.attention.includes('propose-pending')) return 3;
    if (row.attention.includes('filing-propose') || row.attention.includes('research-promote')) return 4;
    if (row.watch_count > 0) return 5;
    if (row.attention.includes('house') || row.attention.includes('compile')) return 6;
    if (row.attention.includes('filing-unmapped')) return 7;
    if (row.attention.includes('street') || row.attention.includes('street-stale')) return 8;
    if (row.attention.includes('pack') || row.error) return 9;
    return 10;
  };
  desks.sort((a, b) => rank(a) - rank(b) || String(a.slug).localeCompare(String(b.slug)));

  const totals = {
    desks: desks.length,
    with_watch: desks.filter((d) => d.watch_count > 0).length,
    with_fired: desks.filter((d) => d.fired_count > 0).length,
    street_empty: desks.filter((d) => !d.street_available).length,
    need_compile: desks.filter((d) => d.sor_ahead_of_pack).length,
    compiles_running: desks.reduce((n, d) => n + (d.research_running || 0), 0),
    compiles_stalled: desks.reduce((n, d) => n + (d.research_stalled || 0), 0),
  };

  return {
    ok: true,
    available: true,
    as_of: new Date().toISOString(),
    desks,
    totals,
    stale_days: STALE_DAYS,
    note: desks.length
      ? 'Operate glance — house/WATCH/Street from pack+vault. Decision-support only.'
      : 'No desks registered — cold start / empty product shell.',
    decision_support_only: true,
  };
}
