// streetProvider.js — best-effort keyless street snapshot fetch (Phase 2).
// Primary: Nasdaq analyst ratings + consensus target price (same UA pattern as quotes.js).
// Decision-support only. Partial coverage; not full sell-side. Never invent PTs.
const UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const NASDAQ_H = {
  'User-Agent': UA,
  Accept: 'application/json, text/plain, */*',
  Origin: 'https://www.nasdaq.com',
  Referer: 'https://www.nasdaq.com/',
};

async function fetchJson(url, headers, timeoutMs = 10000) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetch(url, { headers, signal: ctl.signal });
    if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(t);
  }
}

/**
 * @param {string} ticker
 * @returns {Promise<{
 *   firms: object[],
 *   provider: string,
 *   method: string,
 *   as_of: string,
 *   currency: string,
 *   partial: boolean,
 *   warnings: string[],
 *   consensus?: object,
 * }>}
 */
export async function fetchStreetFromNasdaq(ticker) {
  const sym = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!sym) throw new Error('empty ticker');

  const ratingsUrl = `https://api.nasdaq.com/api/analyst/${encodeURIComponent(sym)}/ratings`;
  const targetUrl = `https://api.nasdaq.com/api/analyst/${encodeURIComponent(sym)}/targetprice`;

  const [ratingsJ, targetJ] = await Promise.all([
    fetchJson(ratingsUrl, NASDAQ_H),
    fetchJson(targetUrl, NASDAQ_H),
  ]);

  const rData = ratingsJ?.data || {};
  const tData = targetJ?.data || {};
  const overview = tData.consensusOverview || {};
  const brokers = Array.isArray(rData.brokerNames) ? rData.brokerNames : [];
  const meanRating = rData.meanRatingType || null;
  const summary = rData.ratingsSummary || null;

  const high = overview.highPriceTarget != null ? Number(overview.highPriceTarget) : null;
  const low = overview.lowPriceTarget != null ? Number(overview.lowPriceTarget) : null;
  const mean = overview.priceTarget != null ? Number(overview.priceTarget) : null;
  const buy = overview.buy != null ? Number(overview.buy) : null;
  const hold = overview.hold != null ? Number(overview.hold) : null;
  const sell = overview.sell != null ? Number(overview.sell) : null;

  const as_of = new Date().toISOString().slice(0, 10);
  const firms = [];

  // Consensus anchors first (provider does not expose per-firm PTs on this feed)
  if (mean != null && Number.isFinite(mean)) {
    firms.push({
      firm: 'Street consensus (Nasdaq)',
      analyst: null,
      rating: meanRating,
      pt: mean,
      currency: 'USD',
      as_of,
      url: `https://www.nasdaq.com/market-activity/stocks/${sym.toLowerCase()}/analyst-research`,
      note: [
        summary,
        buy != null || hold != null || sell != null
          ? `counts buy=${buy ?? '—'} hold=${hold ?? '—'} sell=${sell ?? '—'}`
          : null,
      ].filter(Boolean).join(' · ') || 'Consensus mean PT',
    });
  }
  if (high != null && Number.isFinite(high)) {
    firms.push({
      firm: 'Street high (Nasdaq)',
      rating: null,
      pt: high,
      currency: 'USD',
      as_of,
      note: 'Consensus high price target',
    });
  }
  if (low != null && Number.isFinite(low)) {
    firms.push({
      firm: 'Street low (Nasdaq)',
      rating: null,
      pt: low,
      currency: 'USD',
      as_of,
      note: 'Consensus low price target',
    });
  }

  // Broker coverage list — names only (no firm-level PT from this API)
  for (const name of brokers) {
    const firm = String(name || '').trim();
    if (!firm) continue;
    firms.push({
      firm,
      analyst: null,
      rating: null,
      pt: null,
      currency: 'USD',
      as_of,
      url: null,
      note: 'Coverage list — firm-level PT not on this feed',
    });
  }

  // Recent upgrades/downgrades if present
  const ud = Array.isArray(rData.upgradesDowngrades) ? rData.upgradesDowngrades : [];
  for (const row of ud.slice(0, 40)) {
    const firm = String(row.firm || row.brokerName || row.companyName || '').trim();
    if (!firm) continue;
    firms.push({
      firm,
      analyst: row.analystName ? String(row.analystName) : null,
      rating: row.toGrade || row.rating || row.action || null,
      pt: row.priceTarget != null ? Number(row.priceTarget) : null,
      currency: 'USD',
      as_of: row.date || row.effectiveDate || as_of,
      note: row.action ? `action: ${row.action}` : 'upgrade/downgrade feed',
    });
  }

  if (!firms.length) {
    throw new Error(`nasdaq: no street rows for ${sym}`);
  }

  const warnings = [
    'Partial street snapshot — not full sell-side coverage',
    'Per-firm price targets are usually unavailable on this free feed; consensus high/mean/low when present',
    'Broker list = coverage names from Nasdaq ratings module',
  ];

  return {
    firms,
    provider: 'nasdaq-public',
    method: 'GET api.nasdaq.com /analyst/{symbol}/ratings + /targetprice',
    as_of,
    currency: 'USD',
    partial: true,
    warnings,
    consensus: {
      mean,
      high,
      low,
      buy,
      hold,
      sell,
      mean_rating: meanRating,
      n_brokers_listed: brokers.length,
    },
  };
}

/**
 * Try providers in order. Throws if all fail.
 * @param {string} ticker
 */
export async function fetchStreetAuto(ticker) {
  const errors = [];
  try {
    return await fetchStreetFromNasdaq(ticker);
  } catch (e) {
    errors.push(`nasdaq: ${e.message || e}`);
  }
  throw new Error(`street fetch failed (${errors.join('; ')})`);
}
