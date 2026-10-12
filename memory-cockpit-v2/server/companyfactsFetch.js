// companyfactsFetch.js — desk add / pipeline refresh only.
// Never imported by companyfacts.js, contextpack.js, retrieve, or ask.
import fs from 'fs';
import path from 'path';
import { resolveOntRoot, resolveVaultDir } from './monorepoPaths.js';

export const TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
export const COMPANYFACTS_URL = 'https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json';
const MIN_INTERVAL_MS = 200;
let lastFetch = 0;

export function padCik(cik) {
  if (typeof cik === 'boolean') throw new Error('cik is empty');
  let s = cik;
  if (typeof cik === 'number' && Number.isFinite(cik)) {
    if (!Number.isInteger(cik)) throw new Error('cik is empty');
    s = String(Math.trunc(cik));
  }
  s = String(s ?? '').trim();
  if (/^-?\d+\.0+$/.test(s)) s = s.split('.')[0];
  const digits = s.replace(/\D/g, '');
  if (!digits) throw new Error('cik is empty');
  return digits.padStart(10, '0');
}

export function readPackUserAgent(ticker, ontRoot) {
  const ident = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!ident) return null;
  const file = path.join(ontRoot || resolveOntRoot(), 'packs', `${ident}.json`);
  try {
    const ua = String(JSON.parse(fs.readFileSync(file, 'utf8')).sec_user_agent || '').trim();
    return ua || null;
  } catch {
    return null;
  }
}

export function contactUserAgent(explicit, ticker, ontRoot) {
  const ua = String(
    explicit
    || process.env.SEC_USER_AGENT
    || process.env.COCKPIT_SEC_UA
    || (ticker ? readPackUserAgent(ticker, ontRoot) : '')
    || '',
  ).trim();
  if (!ua || !(/@|https?:\/\//.test(ua))) {
    throw new Error('SEC_USER_AGENT (or sec_user_agent) must include contact info');
  }
  return ua;
}

export function cachePath(wikiRoot, slug, override) {
  if (override) {
    return path.isAbsolute(override) ? override : path.join(wikiRoot, override);
  }
  return path.join(wikiRoot, 'raw', `${slug}-research`, 'sec', 'companyfacts.json');
}

export function statusPath(dest) {
  return path.join(path.dirname(dest), 'companyfacts.status.json');
}

export function tickerCachePath(wikiRoot) {
  return path.join(wikiRoot, 'cockpit', 'compile', '_sec', 'company_tickers.json');
}

function writeJson(filePath, obj) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  const tmp = `${filePath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(obj), 'utf8');
  fs.renameSync(tmp, filePath);
}

export function writeStatus(dest, payload) {
  const file = statusPath(dest);
  writeJson(file, payload);
  return file;
}

async function waitFloor(sleep) {
  const wait = MIN_INTERVAL_MS - (Date.now() - lastFetch);
  if (wait > 0) await sleep(wait);
  lastFetch = Date.now();
}

async function defaultGet(url, headers, timeoutMs) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctrl.signal });
    const buf = Buffer.from(await res.arrayBuffer());
    return { status: res.status, body: buf };
  } finally {
    clearTimeout(timer);
  }
}

function decodeJson(body) {
  return JSON.parse(Buffer.from(body).toString('utf8'));
}

export async function loadTickerMap(wikiRoot, opts = {}) {
  const cache = tickerCachePath(wikiRoot);
  const ttlMs = opts.ttlMs == null ? 7 * 24 * 3600 * 1000 : opts.ttlMs;
  if (!opts.force && fs.existsSync(cache) && (Date.now() - fs.statSync(cache).mtimeMs) < ttlMs) {
    return JSON.parse(fs.readFileSync(cache, 'utf8'));
  }
  const ua = contactUserAgent(opts.userAgent);
  const get = opts.fetchImpl || defaultGet;
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  await waitFloor(sleep);
  let res = await get(TICKERS_URL, { 'User-Agent': ua, Accept: 'application/json' }, opts.timeoutMs || 30000);
  if (res.status === 429 || res.status === 503) {
    await sleep(1500);
    await waitFloor(sleep);
    res = await get(TICKERS_URL, { 'User-Agent': ua, Accept: 'application/json' }, opts.timeoutMs || 30000);
  }
  if (res.status !== 200) {
    if (fs.existsSync(cache)) return JSON.parse(fs.readFileSync(cache, 'utf8'));
    throw new Error(`company_tickers fetch failed: HTTP ${res.status}`);
  }
  const data = decodeJson(res.body);
  if (!data || typeof data !== 'object') throw new Error('company_tickers fetch was not an object');
  writeJson(cache, data);
  return data;
}

export async function resolveCik(ticker, wikiRoot, opts = {}) {
  const ident = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!ident) return { cik: null, title: null, ticker: ident };
  const data = opts.tickerMap || await loadTickerMap(wikiRoot, opts);
  for (const row of Object.values(data || {})) {
    if (!row || typeof row !== 'object') continue;
    if (String(row.ticker || '').toUpperCase() === ident) {
      try {
        return { cik: padCik(row.cik_str ?? row.cik), title: row.title || null, ticker: ident };
      } catch {
        return { cik: null, title: row.title || null, ticker: ident };
      }
    }
  }
  return { cik: null, title: null, ticker: ident };
}

export async function refreshDeskCompanyfacts(opts = {}) {
  const ident = String(opts.ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const slug = String(opts.slug || ident.toLowerCase()).replace(/[^a-z0-9-]/g, '');
  const wikiRoot = opts.wikiRoot || resolveVaultDir();
  const dest = opts.dest || cachePath(wikiRoot, slug, opts.override);
  const result = {
    ok: false,
    ticker: ident,
    slug,
    cik: null,
    path: dest,
    gap: null,
  };
  let ua;
  try {
    ua = contactUserAgent(opts.userAgent, ident, opts.ontRoot);
  } catch (err) {
    result.gap = `companyfacts fetch failed: ${err.message || err}`;
    writeStatus(dest, result);
    return result;
  }
  const sleep = opts.sleep || ((ms) => new Promise((r) => setTimeout(r, ms)));
  const get = opts.fetchImpl || defaultGet;
  let cik = null;
  if (opts.cik != null && String(opts.cik).trim()) {
    try { cik = padCik(opts.cik); } catch { cik = null; }
  }
  if (!cik) {
    try {
      const found = await resolveCik(ident, wikiRoot, {
        fetchImpl: get,
        sleep,
        userAgent: ua,
        tickerMap: opts.tickerMap,
        force: opts.force,
        timeoutMs: opts.timeoutMs,
      });
      cik = found.cik;
    } catch (err) {
      result.gap = `companyfacts fetch failed: ${err.message || err}`;
      writeStatus(dest, result);
      return result;
    }
  }
  if (!cik) {
    result.gap = `companyfacts fetch failed: ticker ${ident} not in SEC universe map`;
    writeStatus(dest, result);
    return result;
  }
  result.cik = cik;
  const url = (opts.urlTemplate || COMPANYFACTS_URL).replace('{cik}', cik);
  try {
    await waitFloor(sleep);
    let res = await get(url, { 'User-Agent': ua, Accept: 'application/json' }, opts.timeoutMs || 30000);
    if (res.status === 429 || res.status === 503) {
      await sleep(1500);
      await waitFloor(sleep);
      res = await get(url, { 'User-Agent': ua, Accept: 'application/json' }, opts.timeoutMs || 30000);
    }
    if (res.status !== 200) throw new Error(`companyfacts fetch failed: HTTP ${res.status}`);
    const doc = decodeJson(res.body);
    if (!doc || typeof doc !== 'object' || !doc.facts) {
      throw new Error('companyfacts fetch was not a companyfacts document');
    }
    writeJson(dest, doc);
    result.ok = true;
    result.bytes = fs.statSync(dest).size;
    writeStatus(dest, { ok: true, ticker: ident, slug, cik, path: dest });
    return result;
  } catch (err) {
    const msg = String(err.message || err);
    result.gap = msg.startsWith('companyfacts fetch failed') ? msg : `companyfacts fetch failed: ${msg}`;
    writeStatus(dest, result);
    return result;
  }
}
