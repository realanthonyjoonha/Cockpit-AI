// quotes.js — request-time LIVE price quotes for the §2.0 "complex" tiles ONLY (MU, DRAM ETF,
// SK Hynix, Samsung). This is the app's ONE outbound-at-request-time path; every other route is a
// pure vault readout. It exists so those four prices refresh on page-load instead of waiting on the
// ≤20h sync cadence — nothing else on the site changes source.
//
// Source order (Anthony, 2026-07-06): Nasdaq real-time (US) / Naver latest close (KR) FIRST, Yahoo
// LAST. Yahoo is last because this Mac's egress HARD-429s Yahoo v8 (verified 2026-07-06; the same
// reason cockpit/lib/net.js §12 keeps Yahoo a fallback). Every fetch is timeout-bounded and
// swallowed to null on failure, so a tile silently falls back to its synced CSV value and the
// empty-environment boot invariant still holds. Keyless — no credentials, no API keys.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';

async function fetchJson(url, headers, timeoutMs = 6000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctl.signal });
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    return await res.json();
  } finally { clearTimeout(t); }
}
const NASDAQ_H = { 'User-Agent': UA, Accept: 'application/json, text/plain, */*', Origin: 'https://www.nasdaq.com', Referer: 'https://www.nasdaq.com/' };
const numFrom = (s) => { const n = Number(String(s).replace(/[$,%+\s]/g, '')); return Number.isFinite(n) ? n : null; };

// Nasdaq /info — real-time intraday last sale for US equities + ETFs (isRealTime true in-session,
// last close otherwise). Keyless; works from IPs Yahoo 429s.
async function nasdaqQuote(symbol, assetclass) {
  const j = await fetchJson(`https://api.nasdaq.com/api/quote/${symbol}/info?assetclass=${assetclass}`, NASDAQ_H);
  const p = j?.data?.primaryData;
  const price = p ? numFrom(p.lastSalePrice) : null;
  if (price == null) throw new Error(`nasdaq ${symbol}: no price`);
  // percentageChange already carries its own sign, e.g. "+1.90%" / "-1.90%"
  let pct = p.percentageChange != null ? Number(String(p.percentageChange).replace(/[%+,\s]/g, '')) : null;
  if (!Number.isFinite(pct)) pct = null;
  return { price: Math.round(price * 100) / 100, pct, asOf: p.lastTradeTimestamp || null, realtime: p.isRealTime === true, source: 'nasdaq' };
}

// last two daily closes → { price, pct, asOf } (shared by the Naver + Yahoo row shapes)
function lastTwo(rows) {
  const clean = rows.filter((r) => r[1] != null && Number.isFinite(r[1])).sort((a, b) => String(a[0]).localeCompare(String(b[0])));
  if (!clean.length) return null;
  const last = clean[clean.length - 1], prev = clean[clean.length - 2];
  return { price: last[1], pct: prev && prev[1] ? ((last[1] - prev[1]) / prev[1]) * 100 : null, asOf: last[0] };
}
const pad2 = (n) => String(n).padStart(2, '0');
const stampNaver = (d) => `${d.getFullYear()}${pad2(d.getMonth() + 1)}${pad2(d.getDate())}0000`;

// Naver KR day-chart — latest close (KRX closes during Anthony's day, so latest close == current).
// Short ~3-week window (not the sync's 5y) — this is a freshness top-up, not a history pull.
async function naverLast(code) {
  const now = new Date();
  const url = `https://api.stock.naver.com/chart/domestic/item/${code}/day?startDateTime=${stampNaver(new Date(now.getTime() - 21 * 864e5))}&endDateTime=${stampNaver(now)}`;
  const arr = await fetchJson(url, { 'User-Agent': UA, Referer: 'https://m.stock.naver.com/' });
  if (!Array.isArray(arr)) throw new Error(`naver ${code}: shape`);
  const lt = lastTwo(arr.map((r) => { const d = String(r.localDate); return [`${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`, Number(r.closePrice)]; }));
  if (!lt) throw new Error(`naver ${code}: no rows`);
  return { ...lt, realtime: false, source: 'naver' };
}

// Yahoo v8 chart — FALLBACK ONLY (429s this Mac). Single attempt, no backoff: if it 429s we've
// already tried the primary, so fail fast to the CSV rather than stall the page.
async function yahooLast(symbol) {
  const j = await fetchJson(`https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?range=1mo&interval=1d`,
    { 'User-Agent': UA, Referer: 'https://finance.yahoo.com/', Accept: 'application/json,text/plain,*/*' });
  const r = j?.chart?.result?.[0];
  const ts = r?.timestamp || [];
  const closes = r?.indicators?.quote?.[0]?.close || r?.indicators?.adjclose?.[0]?.adjclose || [];
  const lt = lastTwo(ts.map((t, i) => [new Date(t * 1000).toISOString().slice(0, 10), closes[i] == null ? null : Math.round(closes[i] * 100) / 100]));
  if (!lt) throw new Error(`yahoo ${symbol}: no rows`);
  return { ...lt, realtime: false, source: 'yahoo' };
}

const withTimeout = (p, ms) => Promise.race([p, new Promise((res) => setTimeout(() => res(null), ms))]);
async function tryChain(fns) {
  for (const fn of fns) { try { const v = await fn(); if (v && v.price != null) return v; } catch { /* try next source */ } }
  return null;
}

// Anthony 2026-07-06: works-first (Nasdaq/Naver primary), Yahoo fallback. To flip to Yahoo-first,
// reorder the chains below — the merge/cache/fallback plumbing is source-agnostic.
const TICKERS = [
  { id: 'price-mu', kind: 'us', nasdaq: ['MU', 'stocks'], yahoo: 'MU' },
  { id: 'price-dram-etf', kind: 'us', nasdaq: ['DRAM', 'etf'], yahoo: 'DRAM' },
  { id: 'price-sk-hynix', kind: 'kr', naver: '000660', yahoo: '000660.KS' },
  { id: 'price-samsung', kind: 'kr', naver: '005930', yahoo: '005930.KS' },
];

// { [seriesId]: { price, pct, asOf, realtime, source } | null } — never throws; per-ticker null on
// total source failure (caller falls back to the synced CSV).
export async function liveComplexQuotes() {
  const out = {};
  await Promise.all(TICKERS.map(async (t) => {
    const chain = t.kind === 'us'
      ? [() => nasdaqQuote(t.nasdaq[0], t.nasdaq[1]), () => yahooLast(t.yahoo)]
      : [() => naverLast(t.naver), () => yahooLast(t.yahoo)];
    out[t.id] = await withTimeout(tryChain(chain), 7500);
  }));
  return out;
}

// Single US equity/ETF live quote (Nasdaq primary, Yahoo last). Never throws — null on total failure.
// Used by Nebius desk Overview chip (NBIS) without pulling the full memory complex.
export async function liveUsEquity(symbol, assetclass = 'stocks') {
  const sym = String(symbol || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!sym) return null;
  return withTimeout(
    tryChain([() => nasdaqQuote(sym, assetclass), () => yahooLast(sym)]),
    7500,
  );
}
