// net.js — shared fetch helpers for updaters. Ported from v1 scripts/fetch-series.js
// (§8 manifest) — every quirk here was earned the hard way (see build-plan §12).
// Zero deps; Node global fetch.

export const UA_BROWSER = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
export const UA_SEC = 'memory-cockpit research (anthonyjoonha@gmail.com)'; // SEC requires a descriptive UA

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const iso = (unixSec) => new Date(unixSec * 1000).toISOString().slice(0, 10);
// LOCAL date — a 9pm PT run must not stamp tomorrow (v1's UTC today() could)
export const todayLocal = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);

export async function fetchRaw(url, headers = {}, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try { return await fetch(url, { headers, signal: ctl.signal }); }
  finally { clearTimeout(t); }
}
export async function fetchText(url, headers = {}, timeoutMs = 20000) {
  const res = await fetchRaw(url, headers, timeoutMs);
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.text();
}
export async function fetchJson(url, headers = {}, timeoutMs = 20000) {
  const res = await fetchRaw(url, headers, timeoutMs);
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}
// keyless form-POST (KITA k-stat's worker endpoint needs it) — sibling to fetchText
export async function fetchTextPost(url, body, headers = {}, timeoutMs = 20000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { method: 'POST', body, headers, signal: ctl.signal });
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    return res.text();
  } finally { clearTimeout(t); }
}

// try a primary source, fall back on any failure (Nasdaq/Naver primary, Yahoo fallback —
// his Mac egresses via T-Mobile cellular; Yahoo v8 hard-429s it, so Yahoo is LAST resort)
export const withFallback = (primary, fb, log = () => {}) => async () => {
  try { return await primary(); }
  catch (e) { log(`(${e.message} — falling back)`); return await fb(); }
};

// Yahoo v8 chart (fallback only): retries with backoff to smooth transient 429s
export async function fetchYahooRows(symbol) {
  const headers = { 'User-Agent': UA_BROWSER, Referer: 'https://finance.yahoo.com/',
    Accept: 'application/json,text/plain,*/*', 'Accept-Language': 'en-US,en;q=0.9' };
  let lastErr;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt) await sleep(1500 * attempt);
    const host = attempt % 2 ? 'query1' : 'query2';
    const url = `https://${host}.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=5y&interval=1d`;
    const res = await fetchRaw(url, headers);
    if (res.ok) {
      const r = (await res.json())?.chart?.result?.[0];
      if (!r) throw new Error(`Yahoo ${symbol}: no result`);
      const ts = r.timestamp || [];
      const closes = r.indicators?.adjclose?.[0]?.adjclose || r.indicators?.quote?.[0]?.close || [];
      return ts.map((t, i) => [iso(t), closes[i] == null ? null : Math.round(closes[i] * 100) / 100]);
    }
    lastErr = new Error(`Yahoo ${symbol} ${res.status}`);
    if (res.status !== 429 && res.status !== 503) break;
  }
  throw lastErr;
}

// Nasdaq public API — keyless; works from IPs Yahoo 429s. ~5y (matches the 5Y preset).
export async function fetchNasdaqRows(symbol, assetclass = 'stocks') {
  const t = todayLocal();
  const from = `${Number(t.slice(0, 4)) - 5}${t.slice(4)}`;
  const url = `https://api.nasdaq.com/api/quote/${symbol}/historical?assetclass=${assetclass}&fromdate=${from}&todate=${t}&limit=9999`;
  const j = await fetchJson(url, { 'User-Agent': UA_BROWSER, Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' });
  const rows = j?.data?.tradesTable?.rows;
  if (!rows?.length) throw new Error(`Nasdaq ${symbol}: no rows`);
  return rows.map((r) => {
    const [m, d, y] = String(r.date).split('/');
    const v = Number(String(r.close).replace(/[$,]/g, ''));
    return [`${y}-${m}-${d}`, Number.isFinite(v) ? Math.round(v * 100) / 100 : null];
  });
}

// Nasdaq short-interest — keyless, same host as prices. Bi-monthly FINRA settlement rows
// (~1yr served). Returns {date, shares (millions, 2dp), dtc}. Deep history is seeded once;
// appendPoint dedupes by settlement date so each run tops up the latest fortnightly print.
export async function fetchNasdaqShortInterest(symbol) {
  const url = `https://api.nasdaq.com/api/quote/${symbol}/short-interest?assetclass=stocks`;
  const j = await fetchJson(url, { 'User-Agent': UA_BROWSER, Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' });
  const rows = j?.data?.shortInterestTable?.rows;
  if (!rows?.length) throw new Error(`Nasdaq short-interest ${symbol}: no rows`);
  return rows.map((r) => {
    const [m, d, y] = String(r.settlementDate).split('/');
    const shares = Number(String(r.interest).replace(/[,\s]/g, ''));
    const dtc = Number(String(r.daysToCover).replace(/[,\s]/g, ''));
    return { date: (y && m && d) ? `${y}-${m}-${d}` : null,
      shares: Number.isFinite(shares) ? Math.round(shares / 1e4) / 100 : null,
      dtc: Number.isFinite(dtc) ? dtc : null };
  }).filter((r) => r.date && r.date.length === 10);
}

// Nasdaq insider trades — keyless, ~2yr of Form 4 activity. Returns {date, type, dollars}.
// type is Nasdaq's category: "Buy"/"Sell" = open-market discretionary; "Automatic Sell" =
// 10b5-1 planned; "Acquisition/Disposition (Non Open Market)" = grants/tax; "Option Execute".
export async function fetchNasdaqInsider(symbol, limit = 3000) {
  const url = `https://api.nasdaq.com/api/company/${symbol}/insider-trades?limit=${limit}&type=ALL&sortColumn=lastDate&sortOrder=DESC`;
  const j = await fetchJson(url, { 'User-Agent': UA_BROWSER, Accept: 'application/json, text/plain, */*',
    Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' });
  const rows = j?.data?.transactionTable?.table?.rows;
  if (!rows?.length) throw new Error(`Nasdaq insider ${symbol}: no rows`);
  const num = (s) => Number(String(s).replace(/[$,\s]/g, '')) || 0;
  return rows.map((r) => {
    const [m, d, y] = String(r.lastDate).split('/');
    return { date: (y && m && d) ? `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}` : null,
      type: r.transactionType, dollars: num(r.sharesTraded) * num(r.lastPrice) };
  }).filter((r) => r.date);
}

// SEC EDGAR 13F — LATEST filing's common-share holding of one CUSIP for a filer. Keyless
// (descriptive UA). The info-table XML is namespaced (<ns1:infoTable>/<ns1:cusip>/<ns1:sshPrnamt>)
// and named per-filer, so match tags namespace-agnostically. Puts/Calls excluded (long only).
export async function fetchEdgar13FHolding(cik, cusip) {
  const pad = 'CIK' + String(cik).padStart(10, '0');
  const sub = await fetchJson(`https://data.sec.gov/submissions/${pad}.json`, { 'User-Agent': UA_SEC });
  const f = sub?.filings?.recent;
  if (!f?.form) throw new Error(`EDGAR ${cik}: no filings`);
  const idx = f.form.findIndex((x) => x === '13F-HR');
  if (idx < 0) return null; // filer has no recent 13F-HR
  const accNo = f.accessionNumber[idx].replace(/-/g, '');
  const period = f.reportDate[idx];
  const dir = `https://www.sec.gov/Archives/edgar/data/${cik}/${accNo}/`;
  const ix = await fetchJson(dir + 'index.json', { 'User-Agent': UA_SEC });
  const cand = ix.directory.item.map((i) => i.name).filter((n) => /\.xml$/i.test(n) && !/primary_doc/i.test(n));
  const tag = (t) => new RegExp(`<(?:\\w+:)?${t}>\\s*([^<\\s][^<]*?)\\s*</(?:\\w+:)?${t}>`, 'i');
  for (const c of cand) {
    const xml = await fetchText(dir + c, { 'User-Agent': UA_SEC });
    if (!xml.includes(cusip)) continue;
    let shares = 0, hit = false;
    for (const b of xml.split(/<(?:\w+:)?infoTable>/i).slice(1)) {
      const cm = b.match(tag('cusip'));
      if (!cm || cm[1].trim() !== cusip) continue;
      if (/<(?:\w+:)?putCall>\s*(Put|Call)/i.test(b)) continue; // long common only
      const sm = b.match(tag('sshPrnamt'));
      if (sm) { shares += Number(sm[1]); hit = true; }
    }
    if (hit) return { period, shares };
  }
  return { period, shares: 0 }; // filed a 13F but holds no common of this CUSIP (exited)
}

// Translate a list of strings → { original: english } for any that contain Hangul (others are
// left out of the map). Keyless (Google's unofficial gtx endpoint — same posture as the other
// sources). Batches newline-joined groups and verifies the line count round-trips; on a mismatch
// or error it falls back to per-item, and a hard failure simply leaves that string untranslated
// (it still has Hangul, so the caller retries it next run). de-dupes so repeated sources cost once.
const HANGUL = /[가-힣㄰-㆏]/;
export const hasHangul = (s) => HANGUL.test(String(s));
async function gtxOne(text) {
  const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=auto&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const j = await fetchJson(url, { 'User-Agent': UA_BROWSER });
  if (!Array.isArray(j?.[0])) throw new Error('gtx: unexpected shape');
  return j[0].map((s) => s[0]).join('').trim();
}
export async function translateMap(list, log = () => {}) {
  const map = {};
  const uniq = [...new Set(list.filter(hasHangul))];
  const BATCH = 12;
  for (let b = 0; b < uniq.length; b += BATCH) {
    const grp = uniq.slice(b, b + BATCH);
    const src = grp.map((s) => s.replace(/[\r\n]+/g, ' ')); // protect the newline join
    let ok = false;
    try {
      const en = (await gtxOne(src.join('\n'))).split('\n').map((s) => s.trim()).filter((s) => s.length);
      if (en.length === grp.length) { grp.forEach((k, i) => { map[k] = en[i]; }); ok = true; }
    } catch (e) { log(`translate batch failed: ${e.message} — per-item fallback`); }
    if (!ok) {
      for (const k of grp) { try { map[k] = await gtxOne(k.replace(/[\r\n]+/g, ' ')); } catch { /* keep original, retried next run */ } await sleep(120); }
    }
    await sleep(180);
  }
  return map;
}

// Naver Finance daily closes — KRX equities, keyless JSON. ~5y.
export async function fetchNaverRows(code) {
  const t = todayLocal();
  const end = t.replace(/-/g, '') + '0000';
  const start = `${Number(t.slice(0, 4)) - 5}${t.slice(5, 7)}${t.slice(8, 10)}0000`;
  const url = `https://api.stock.naver.com/chart/domestic/item/${code}/day?startDateTime=${start}&endDateTime=${end}`;
  const arr = await fetchJson(url, { 'User-Agent': UA_BROWSER, Referer: 'https://m.stock.naver.com/' });
  if (!Array.isArray(arr) || !arr.length) throw new Error(`Naver ${code}: no rows`);
  return arr.map((r) => {
    const d = String(r.localDate);
    const v = Number(r.closePrice);
    return [`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, Number.isFinite(v) ? v : null];
  });
}

// SEC EDGAR companyconcept → quarterly rows by YTD-differencing (facts are YTD-cumulative
// within fiscal years). Dedupe by (start,end) preferring latest filed; collapse duplicate
// end-dates keeping the smaller positive (Amazon files overlapping period sets).
export async function edgarConceptQuarterlyRows(cikPadded, concept, { scale = 1e6, round = true } = {}) {
  const url = `https://data.sec.gov/api/xbrl/companyconcept/${cikPadded}/us-gaap/${concept}.json`;
  const res = await fetchRaw(url, { 'User-Agent': UA_SEC, 'Accept-Encoding': 'gzip, deflate' });
  if (res.status === 404) return []; // this filer doesn't use this concept
  if (!res.ok) throw new Error(`EDGAR ${cikPadded}/${concept} ${res.status}`);
  const units = (await res.json())?.units || {};
  const facts = units.USD || units['USD/shares'] || [];
  const byPeriod = new Map();
  for (const f of facts) {
    if (!f.start || !f.end) continue;
    const k = `${f.start}|${f.end}`;
    const prev = byPeriod.get(k);
    if (!prev || String(f.filed) > String(prev.filed)) byPeriod.set(k, f);
  }
  const groups = new Map();
  for (const f of byPeriod.values()) {
    if (!groups.has(f.start)) groups.set(f.start, []);
    groups.get(f.start).push(f);
  }
  const byEnd = new Map();
  for (const [, list] of groups) {
    if (list.length < 2) continue; // annual-only years — skip to keep cadence quarterly
    list.sort((a, b) => a.end.localeCompare(b.end));
    let prev = 0;
    for (const f of list) {
      const raw = (f.val - prev) / scale;
      const q = round ? Math.round(raw) : Math.round(raw * 100) / 100;
      prev = f.val;
      if (q > 0 && (!byEnd.has(f.end) || q < byEnd.get(f.end))) byEnd.set(f.end, q);
    }
  }
  return [...byEnd.entries()].sort((a, b) => a[0].localeCompare(b[0]));
}

// some filers change the capex tag over time (Amazon → ProductiveAssets in 2017);
// try each candidate, keep the one reaching the latest quarter.
export async function edgarCapexQuarterlyRows(cikPadded, concepts = ['PaymentsToAcquirePropertyPlantAndEquipment']) {
  let best = [];
  for (const c of concepts) {
    let rows = [];
    try { rows = await edgarConceptQuarterlyRows(cikPadded, c); } catch { /* unusable concept */ }
    const bestLast = best.length ? best[best.length - 1][0] : '';
    const rowsLast = rows.length ? rows[rows.length - 1][0] : '';
    if (rowsLast > bestLast) best = rows;
  }
  return best;
}
