// operateGlance.js — multi-desk attention board for START (factory-native).
// Pack/house/risk/street status only — no invent, no PTs as house targets.
// Decision-support only.
import { getLiveThinRegistry, resolveThinDesk } from './thinDeskMount.js';
import { getStreet, STALE_DAYS } from './thinStreet.js';
import { listResearchRuns, scanRunMetas } from './thinResearchRuns.js';
import { stalledOverlay } from './researchRunsWorker.js';

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
    if (row.watch_count > 0) return 3;
    if (row.attention.includes('house') || row.attention.includes('compile')) return 4;
    if (row.attention.includes('street') || row.attention.includes('street-stale')) return 5;
    if (row.attention.includes('pack') || row.error) return 6;
    return 7;
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
