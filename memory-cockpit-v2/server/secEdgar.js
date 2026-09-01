// secEdgar.js — deep-compile pipeline stages 0 (RESOLVE) + 1 (ACQUIRE).
// Free SEC EDGAR only (keyless law). Everything here is a typed record derived from
// data.sec.gov — no invention, no LLM. Plan: plans/2026-08-19-deep-compile-redesign.md
//
// Vault lane (NOT pack/house SoR): research-wiki/cockpit/compile/{TICKER}/
//   entity.json          stage 0 — profile + coverage tier
//   submissions.json     raw SEC submissions cache (TTL)
//   filings/index.json   stage 1 — normalized document records
//
// Politeness: custom UA (COCKPIT_SEC_UA overrides), TTL caches, 60s force-refresh
// cooldown, fail-soft to last-good cache on network error. No cron — request-time
// freshness only (same discipline as sync.js).
import fs from 'fs';
import path from 'path';
import { resolveVaultDir } from './monorepoPaths.js';

const SEC_UA = process.env.COCKPIT_SEC_UA
  || 'memory-cockpit-v2/2.0 (personal research cockpit; set COCKPIT_SEC_UA to contact)';
const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
const TICKERS_TTL_MS = 7 * 24 * 3600 * 1000; // universe map moves slowly
const SUBMISSIONS_TTL_MS = 6 * 3600 * 1000;  // filings feed: request-time freshness
const MEM_TTL_MS = 5 * 60 * 1000;
const FORCE_COOLDOWN_MS = 60 * 1000;
const FETCH_TIMEOUT_MS = 15 * 1000;

const memCache = new Map(); // key → { at, data }
const lastForce = new Map(); // ticker → ts

function tickerId(t) {
  return String(t || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
}

export function compileLaneDir(ticker) {
  const id = tickerId(ticker);
  return id ? path.join(resolveVaultDir(), 'cockpit', 'compile', id) : null;
}

function secSharedDir() {
  return path.join(resolveVaultDir(), 'cockpit', 'compile', '_sec');
}

function vaultRootExists() {
  try {
    return fs.existsSync(resolveVaultDir());
  } catch {
    return false;
  }
}

function atomicWriteJson(filePath, obj) {
  // Empty product / no-vault VMs: do not mkdir ~/Trading/research-wiki as a side effect.
  if (!vaultRootExists()) return;
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(obj, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
}

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch { return null; }
}

function fileAgeMs(filePath) {
  try { return Date.now() - fs.statSync(filePath).mtimeMs; } catch { return Infinity; }
}

async function fetchJson(url) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': SEC_UA, 'Accept-Encoding': 'gzip, deflate' },
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status} ${url}`);
    return await res.json();
  } finally { clearTimeout(t); }
}

/**
 * Disk+TTL cached fetch. Fail-soft: on network error serve last-good with stale flag.
 * @returns {{ data: object|null, fetched_at: string|null, stale: boolean, error?: string }}
 */
async function cachedFetch(url, cachePath, ttlMs, force) {
  const fresh = !force && fileAgeMs(cachePath) < ttlMs;
  if (fresh) {
    const data = readJsonSafe(cachePath);
    if (data) return { data, fetched_at: new Date(fs.statSync(cachePath).mtimeMs).toISOString(), stale: false };
  }
  try {
    const data = await fetchJson(url);
    atomicWriteJson(cachePath, data);
    return { data, fetched_at: new Date().toISOString(), stale: false };
  } catch (e) {
    const data = readJsonSafe(cachePath); // last-good
    return {
      data,
      fetched_at: data ? new Date(fs.statSync(cachePath).mtimeMs).toISOString() : null,
      stale: true,
      error: String(e?.message || e),
    };
  }
}

/** Ticker → { cik, title } from SEC universe map (10k+ rows, cached 7d). */
export async function resolveCik(ticker, opts = {}) {
  const id = tickerId(ticker);
  if (!id) return { cik: null, title: null, universe_stale: false };
  const cachePath = path.join(secSharedDir(), 'company_tickers.json');
  const { data, stale, error } = await cachedFetch(TICKERS_URL, cachePath, TICKERS_TTL_MS, opts.force === true);
  if (!data) return { cik: null, title: null, universe_stale: true, error };
  for (const row of Object.values(data)) {
    if (String(row.ticker).toUpperCase() === id) {
      return { cik: Number(row.cik_str), title: row.title, universe_stale: !!stale };
    }
  }
  return { cik: null, title: null, universe_stale: !!stale };
}

/**
 * Normalize SEC submissions.recent (parallel arrays) → document records.
 * @returns {Array<object>} newest first (SEC order)
 */
export function normalizeFilings(submissions) {
  const r = submissions?.filings?.recent;
  if (!r || !Array.isArray(r.accessionNumber)) return [];
  const cikNum = Number(submissions.cik || 0);
  const out = [];
  for (let i = 0; i < r.accessionNumber.length; i++) {
    const accession = r.accessionNumber[i];
    const primary = r.primaryDocument?.[i] || '';
    out.push({
      accession,
      form: r.form?.[i] || '',
      filed: r.filingDate?.[i] || '',
      report_date: r.reportDate?.[i] || null,
      acceptance: r.acceptanceDateTime?.[i] || null,
      items: r.items?.[i] || '',
      is_xbrl: !!r.isXBRL?.[i],
      is_inline_xbrl: !!r.isInlineXBRL?.[i],
      primary_document: primary,
      primary_doc_description: r.primaryDocDescription?.[i] || '',
      url: primary
        ? `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession.replace(/-/g, '')}/${primary}`
        : `https://www.sec.gov/Archives/edgar/data/${cikNum}/${accession.replace(/-/g, '')}/`,
      source: 'sec-edgar',
    });
  }
  return out;
}

/**
 * Coverage tier (pure — unit-testable). Plan §stage 0.
 *   A US filer, XBRL, ≥3 10-Ks   B US filer, thin history   C FPI (20-F/40-F/6-K)   D no periodic SEC disclosure
 * @param {{ cik?: number|null }} profile
 * @param {Array<{form:string,is_xbrl:boolean}>} filings
 */
export function coverageTier(profile, filings) {
  if (!profile || !profile.cik) {
    return { tier: 'D', label: 'no SEC entity', reasons: ['ticker not found in SEC universe map'] };
  }
  const forms = (filings || []).map((f) => f.form);
  const exact = (p) => forms.filter((f) => f === p).length;
  const fam = (p) => forms.filter((f) => f === p || f.startsWith(`${p}/`)).length;
  const k10 = exact('10-K');
  const q10 = fam('10-Q');
  const fpiAnnual = fam('20-F') + fam('40-F');
  const k6 = fam('6-K');
  const domestic = k10 + q10 > 0;
  const reasons = [];
  if (domestic) {
    const periodic = (filings || []).filter((f) => /^10-[KQ]/.test(f.form));
    const xbrlShare = periodic.length
      ? periodic.filter((f) => f.is_xbrl).length / periodic.length : 0;
    reasons.push(`10-K×${k10} · 10-Q(fam)×${q10} · XBRL ${Math.round(xbrlShare * 100)}% of periodic`);
    if (k10 >= 3 && xbrlShare > 0.5) return { tier: 'A', label: 'US filer · full spine', reasons };
    if (k10 < 3) reasons.push(`only ${k10} 10-K(s) — trend/diff signals limited`);
    if (xbrlShare <= 0.5) reasons.push('sparse XBRL on periodic filings');
    return { tier: 'B', label: 'US filer · thin history', reasons };
  }
  if (fpiAnnual > 0 || k6 > 0) {
    reasons.push(`20-F/40-F(fam)×${fpiAnnual} · 6-K(fam)×${k6} — no 10-Q, interims unstructured`);
    return { tier: 'C', label: 'foreign private issuer · text lanes only', reasons };
  }
  reasons.push('SEC entity exists but no periodic disclosure forms found');
  return { tier: 'D', label: 'no periodic disclosure', reasons };
}

/**
 * Filings strictly after the pack compile moment (pure — unit-testable).
 * Uses acceptanceDateTime (full timestamp) when present, else filingDate vs compile date.
 * @param {Array<object>} filings
 * @param {string|null} compiledAtIso pack compiled_at
 */
export function filedSinceCompile(filings, compiledAtIso) {
  if (!compiledAtIso) {
    return { baseline_compiled_at: null, count: null, by_form: {}, items: [], note: 'no pack compiled_at — compile the book first' };
  }
  const baselineDate = String(compiledAtIso).slice(0, 10);
  const items = (filings || []).filter((f) => (
    f.acceptance ? f.acceptance > compiledAtIso : (f.filed && f.filed > baselineDate)
  ));
  const by_form = {};
  for (const f of items) by_form[f.form] = (by_form[f.form] || 0) + 1;
  // Routine housekeeping (insider Forms 3/4/5, Rule 144 notices, the company's own 13F)
  // vs material disclosure — the Overview strip leads with material only.
  const routine = (f) => /^(3|4|5|144|13F-HR|13F-NT)(\/A)?$/.test(f.form);
  const material_items = items.filter((f) => !routine(f));
  const material_by_form = {};
  for (const f of material_items) material_by_form[f.form] = (material_by_form[f.form] || 0) + 1;
  return {
    baseline_compiled_at: compiledAtIso,
    count: items.length,
    by_form,
    material_count: material_items.length,
    material_by_form,
    routine_count: items.length - material_items.length,
    items: material_items.concat(items.filter(routine)).slice(0, 50),
    material_items: material_items.slice(0, 25),
  };
}

/**
 * Stage 0+1 snapshot for one desk — powers /api/:slug/pipeline and materializes
 * the vault compile lane (entity.json, filings/index.json) on each successful fetch.
 * @param {string} ticker
 * @param {{ compiledAt?: string|null, force?: boolean }} opts
 */
export async function pipelineSnapshot(ticker, opts = {}) {
  const id = tickerId(ticker);
  if (!id) return { available: false, reason: 'empty ticker' };

  const memKey = `snap:${id}`;
  const force = opts.force === true;
  if (force) {
    const last = lastForce.get(id) || 0;
    if (Date.now() - last < FORCE_COOLDOWN_MS) {
      return { available: false, reason: 'refresh cooldown (60s) — pipeline was just refreshed', cooldown: true };
    }
    lastForce.set(id, Date.now());
    memCache.delete(memKey);
  }
  const hit = memCache.get(memKey);
  if (hit && Date.now() - hit.at < MEM_TTL_MS && !force) {
    return { ...hit.data, since_compile: filedSinceCompile(hit.data._filings, opts.compiledAt || null), _filings: undefined };
  }

  const lane = compileLaneDir(id);
  const resolved = await resolveCik(id, { force });
  if (!resolved.cik) {
    const out = {
      available: false,
      ticker: id,
      reason: resolved.error
        ? `SEC universe map unavailable: ${resolved.error}`
        : `ticker ${id} not found in SEC universe map (tier D — pipeline declines; desk stays vault-only)`,
      tier: { tier: 'D', label: 'no SEC entity', reasons: [resolved.error || 'not in company_tickers.json'] },
    };
    return out;
  }

  const cik10 = String(resolved.cik).padStart(10, '0');
  const subUrl = `https://data.sec.gov/submissions/CIK${cik10}.json`;
  const subPath = path.join(lane, 'submissions.json');
  const { data: sub, fetched_at, stale, error } = await cachedFetch(subUrl, subPath, SUBMISSIONS_TTL_MS, force);
  if (!sub) {
    return { available: false, ticker: id, cik: resolved.cik, reason: `submissions unavailable: ${error}` };
  }

  const filings = normalizeFilings(sub);
  const entity = {
    cik: resolved.cik,
    name: sub.name || resolved.title,
    entity_type: sub.entityType || null,
    sic: sub.sic || null,
    sic_description: sub.sicDescription || null,
    fiscal_year_end: sub.fiscalYearEnd || null,
    state_of_incorp: sub.stateOfIncorporation || null,
    exchanges: sub.exchanges || [],
    tickers: sub.tickers || [],
    universe_title: resolved.title,
  };
  const tier = coverageTier(entity, filings);

  // Materialize the vault compile lane (stage 0+1 outputs) — cache lane, not SoR.
  try {
    atomicWriteJson(path.join(lane, 'entity.json'), {
      schema_version: 1, ticker: id, as_of: fetched_at, entity, tier,
      decision_support_only: true,
    });
    atomicWriteJson(path.join(lane, 'filings', 'index.json'), {
      schema_version: 1, ticker: id, as_of: fetched_at, count: filings.length,
      filings: filings.slice(0, 200),
    });
  } catch { /* cache write failure must not break the read path */ }

  const snap = {
    available: true,
    ticker: id,
    cik: resolved.cik,
    entity,
    tier,
    fetched_at,
    stale: !!stale,
    stale_error: stale ? error : undefined,
    filings_total_recent: filings.length,
    latest_filings: filings.slice(0, 10),
    _filings: filings,
    decision_support_only: true,
    note: 'Stage 0+1 of deep-compile pipeline (SEC EDGAR, keyless). Not pack/house SoR.',
  };
  memCache.set(memKey, { at: Date.now(), data: snap });
  return { ...snap, since_compile: filedSinceCompile(filings, opts.compiledAt || null), _filings: undefined };
}

/** Tests only. */
export function clearSecMemCache() { memCache.clear(); lastForce.clear(); }
