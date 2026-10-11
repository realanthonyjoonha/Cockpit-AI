/**
 * Shared P0 expectations for the ten-sector fixture and the DEMO repro sentences.
 * Both languages must satisfy the same fixture. No issuer branch.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SECTORS_PATH = path.join(HERE, '../fixtures/sectors.json');

export const SECTOR_PROFILE = [
  ['bank', '10-K', 'us-gaap', 'USD'],
  ['insurer', '10-K', 'us-gaap', 'USD'],
  ['reit', '10-K', 'us-gaap', 'USD'],
  ['utility', '10-K', 'us-gaap', 'USD'],
  ['biotech', '10-K', 'us-gaap', 'USD'],
  ['retail', '10-K', 'us-gaap', 'USD'],
  ['energy', '10-K', 'us-gaap', 'USD'],
  ['industrial', '10-K', 'us-gaap', 'USD'],
  ['software', '10-K', 'us-gaap', 'USD'],
  ['foreign private issuer', '20-F', 'ifrs-full', 'EUR'],
];

export const BANNED_WORDS = [
  'h20', 'h200', 'nvda', 'shaz', 'data center', 'china', 'rvg', 'blackwell',
  'micron', 'nebius', 'nvidia', 'amazon', 'microsoft', 'azure', 'hbm', 'dram',
  'mu', 'amzn', 'msft', 'nbis', 'aapl', 'meta', 'tsla', 'intc', 'amd', 'goog',
  'googl', 'jpm', 'avgo', 'qcom',
];

function close(a, b) {
  const x = Number(a);
  const y = Number(b);
  return Math.abs(x - y) <= 1e-6 * Math.max(1, Math.abs(x), Math.abs(y));
}

function sameMap(got, exp) {
  const gk = Object.keys(got).sort();
  const ek = Object.keys(exp).sort();
  if (gk.join('|') !== ek.join('|')) return false;
  return ek.every((k) => got[k] === exp[k]);
}

export function loadSectors() {
  return JSON.parse(readFileSync(SECTORS_PATH, 'utf8'));
}

export function checkSectors(fixture, api) {
  const errors = [];
  const issuers = fixture.issuers || [];
  if (issuers.length !== SECTOR_PROFILE.length) {
    errors.push(`expected ${SECTOR_PROFILE.length} issuers, got ${issuers.length}`);
  }
  issuers.forEach((issuer, i) => {
    const want = SECTOR_PROFILE[i];
    if (!want) return;
    const tag = issuer.id || `issuer${i}`;
    if (issuer.sector !== want[0] || issuer.form !== want[1] || issuer.reporting !== want[2] || issuer.currency !== want[3]) {
      errors.push(`${tag} profile ${issuer.sector}/${issuer.form}/${issuer.reporting}/${issuer.currency}`);
    }
    for (const phrase of issuer.forbid_phrases || []) {
      const hit = (issuer.claims || []).some((c) => new RegExp(`\\b${phrase}\\b`, 'i').test(c.text || ''));
      if (hit) errors.push(`${tag} contains forbidden phrase ${phrase}`);
    }
    const claims = issuer.claims || [];
    const live = api.liveClaims(claims, api.rules);
    const got = Object.fromEntries(live.map((c) => [c.id, c.metric_id]));
    const exp = Object.fromEntries((issuer.live || []).map((c) => [c.id, c.metric_id]));
    if (!sameMap(got, exp)) errors.push(`${tag} live ${JSON.stringify(got)} != ${JSON.stringify(exp)}`);
    for (const id of issuer.absent || []) {
      if (got[id]) errors.push(`${tag} absent id ${id} is live as ${got[id]}`);
    }
    const gaps = api.claimGaps(claims, api.rules);
    if (JSON.stringify(gaps) !== JSON.stringify(issuer.gaps || [])) {
      errors.push(`${tag} gaps ${JSON.stringify(gaps)} != ${JSON.stringify(issuer.gaps || [])}`);
    }
    for (const claim of claims) {
      const classified = api.classifyClaim(claim, api.rules);
      if (classified.metric_id !== claim.classify) {
        errors.push(`${tag}/${claim.id} classify ${classified.metric_id} != ${claim.classify}`);
      }
      const parsed = api.parseAsOf(claim.as_of);
      if (parsed.sort_key !== claim.sort_key || parsed.precision !== claim.precision) {
        errors.push(`${tag}/${claim.id} date ${parsed.sort_key}/${parsed.precision} != ${claim.sort_key}/${claim.precision}`);
      }
      if (parsed.raw !== claim.as_of) errors.push(`${tag}/${claim.id} as_of rewritten`);
      if (claim.sort_key === '2026-01-28' && parsed.sort_key === '2026-01-31') {
        errors.push(`${tag}/${claim.id} snapped a 53-week date to January 31`);
      }
      if (Array.isArray(claim.units)) {
        const amounts = api.parseAmounts(claim.text || '');
        if (claim.units.length === 0 && amounts.length !== 0) {
          errors.push(`${tag}/${claim.id} expected no amount, got ${JSON.stringify(amounts)}`);
        }
        if (amounts.length !== claim.units.length) {
          errors.push(`${tag}/${claim.id} amount count ${amounts.length} != ${claim.units.length}`);
        }
        for (const unit of claim.units) {
          const ok = amounts.some((a) => a.unit === unit.unit
            && (a.currency || null) === (unit.currency || null)
            && (a.scale || null) === (unit.scale || null)
            && close(a.value, unit.value));
          if (!ok) errors.push(`${tag}/${claim.id} missing unit ${JSON.stringify(unit)} in ${JSON.stringify(amounts)}`);
        }
      }
    }
  });
  if (!api.riskMetric) {
    errors.push('riskMetric missing from checker api');
  } else {
    for (const row of fixture.risk_metric || []) {
      const mapped = api.riskMetric(row.name, api.rules);
      if (mapped !== row.metric_id) errors.push(`risk ${row.name} ${mapped} != ${row.metric_id}`);
    }
  }
  return errors;
}

export function checkDemo(api) {
  const errors = [];
  const { rules, liveClaims, classifyMetric, parseAsOf, parseAmounts } = api;
  const claim = (id, text, asOf, grade = 'A') => ({ id, text, as_of: asOf, grade, source_id: 'fixture' });
  const live = (rows) => liveClaims(rows, rules);

  const date = live([
    claim('sep', 'Net sales were $111 million', '2026-9-30'),
    claim('oct', 'Net sales were $222 million', '2026-10-01'),
  ]);
  if (date[0]?.id !== 'oct' || date[0]?.metric_id !== 'company_revenue') {
    errors.push(`C-date-unpadded winner ${date[0]?.id}`);
  }
  if (parseAsOf('2026-9-30').sort_key !== '2026-09-30') errors.push('unpadded September key');
  if (parseAsOf('2026-10-01T23:30:00-07:00').sort_key !== '2026-10-01') errors.push('ISO datetime shifted');
  if (parseAsOf('2026-01-01T23:30:00-05:00').sort_key !== '2026-01-01') errors.push('ISO offset shifted the day');
  const wk = parseAsOf('52 weeks ended August 29, 2026');
  if (wk.sort_key !== '2026-08-29') errors.push(`52-week key ${wk.sort_key}`);
  const fy = parseAsOf('FY2026');
  if (fy.sort_key != null || fy.precision !== 'fiscal_label') errors.push('bare FY invented a day');

  const guide = live([
    claim('cash-clean', 'Cash and cash equivalents were $90 million', '2026-06-01'),
    claim('cash-guid', 'Cash and cash equivalents were $90 million. See guidance.', '2026-06-02'),
    claim('outlook', 'Outlook for next quarter revenue is $100 million', '2026-06-01'),
  ]);
  const byId = Object.fromEntries(guide.map((c) => [c.id, c.metric_id]));
  if (byId['cash-guid'] !== 'cash') errors.push(`cash-guid ${byId['cash-guid']}`);
  if (byId.outlook !== 'revenue_guide') errors.push(`outlook ${byId.outlook}`);
  if (byId['cash-clean']) errors.push('older cash stayed live beside the newer cash sentence');

  const cash = live([
    claim('old-cash', 'Cash and cash equivalents were $111 million', '2024-01-01'),
    claim('new-cash', 'Cash was $222 million', '2026-06-01'),
  ]);
  if (cash.length !== 1 || cash[0].id !== 'new-cash' || cash[0].metric_id !== 'cash') {
    errors.push(`C-cash-phrase ${JSON.stringify(cash.map((c) => [c.id, c.metric_id]))}`);
  }

  const gw = live([
    claim('inv-imp', 'Inventory impairment of $9 million', '2026-05-01'),
    claim('gw-bal', 'A goodwill balance of $5 billion', '2026-05-01'),
  ]);
  const gwMap = Object.fromEntries(gw.map((c) => [c.id, c.metric_id]));
  if (gwMap['inv-imp'] !== 'impairment') errors.push(`inv-imp ${gwMap['inv-imp']}`);
  if (gwMap['gw-bal'] !== 'goodwill') errors.push(`gw-bal ${gwMap['gw-bal']}`);

  const dropped = live([
    claim('space', 'Unmatched spend was $ 12 million', '2026-01-01'),
    claim('tight', 'Unmatched spend was $12 million', '2026-01-01'),
    claim('emp', 'Number of employees was $4242 thousand', '2026-01-01'),
    claim('qual', 'CANARY-SEGMENTS the fixture reports exactly 3 segments', '2026-01-01'),
    claim('pct', 'segment mix was 45 percent', '2026-01-01'),
    claim('pctsign', 'segment mix was 45%', '2026-01-02'),
  ]);
  const dropIds = new Set(dropped.map((c) => c.id));
  for (const id of ['space', 'tight', 'emp', 'pct', 'pctsign']) {
    if (!dropIds.has(id)) errors.push(`C-drops missing ${id}`);
  }
  if (dropIds.has('qual')) errors.push('qualitative segment sentence was kept');
  const emp = dropped.find((c) => c.id === 'emp');
  if (emp?.metric_id !== 'headcount') errors.push(`emp ${emp?.metric_id}`);

  const segs = live([claim('segs', 'The company has 3 operating segments.', '2026-01-01')]);
  if (segs[0]?.metric_id !== 'operating_segments') errors.push(`operating segments ${segs[0]?.metric_id}`);
  if (classifyMetric('42.4 thousand employees', rules) !== 'headcount') errors.push('thousand employees');
  if (parseAmounts('42.4 thousand employees').length !== 0) errors.push('headcount became currency');
  if (classifyMetric('The inventor was paid $1 million', rules) != null) errors.push('inventor stem');
  if (classifyMetric('FY2026 Data Center revenue was $193.7 billion', rules) !== 'company_revenue') {
    errors.push('data-center special case');
  }

  const bare = live([
    claim('bare', 'Net sales were $10 million', '2026-08-01', ''),
    claim('cee', 'Net sales were $11 million', '2026-08-01', 'C'),
  ]);
  if (bare[0]?.id !== 'bare') errors.push(`missing grade winner ${bare[0]?.id}`);
  const tie = live([
    claim('first', 'Net sales were $10 million from the first filing', '2026-08-01'),
    claim('second', 'Net sales were $99 million from the second filing', '2026-08-01'),
  ]);
  if (tie[0]?.id !== 'first') errors.push(`same-day tie ${tie[0]?.id}`);

  const spaced = parseAmounts('Unmatched spend was $ 12');
  if (!(spaced[0]?.value === 12 && spaced[0]?.currency === 'USD' && spaced[0]?.scale == null)) {
    errors.push(`spaced $ 12 ${JSON.stringify(spaced)}`);
  }
  const pctWord = parseAmounts('segment mix was 45 percent');
  if (!(pctWord[0]?.unit === 'percent' && pctWord[0]?.value === 45)) errors.push('45 percent');
  const leaked = parseAmounts('Figures in millions. Unmatched spend was $ 12.');
  if (leaked[0]?.value !== 12) errors.push('sentence scale leaked');
  const bps = parseAmounts('spread was 50 basis points');
  if (bps.some((a) => a.unit === 'percent')) errors.push('basis points entered the percent bucket');
  if (parseAsOf('53 weeks ended January 28, 2026').sort_key !== '2026-01-28') errors.push('53-week date snapped');
  if (parseAsOf('fiscal year ended 31 March 2026').sort_key !== '2026-03-31') errors.push('31 March key');
  if (parseAsOf('2026-10-01T23:30:00-10:00').sort_key !== '2026-10-01') errors.push('ISO -10:00 shifted the day');
  if (parseAsOf('FY2026').sort_key != null) errors.push('FY2026 invented a day');

  const crowd = live([
    claim('gw-real', 'Goodwill impairment was $4 million.', '2024-06-01'),
    claim('gw-other', 'Impairment of intangible assets other than goodwill was $4 million.', '2026-06-01'),
  ]);
  const crowdMap = Object.fromEntries(crowd.map((c) => [c.id, c.metric_id]));
  if (crowdMap['gw-real'] !== 'goodwill_impairment') errors.push(`gw-real ${crowdMap['gw-real']}`);
  if (crowdMap['gw-other'] !== 'impairment') errors.push(`gw-other ${crowdMap['gw-other']}`);

  const ocf = live([
    claim('ocf-2024', 'Net cash provided by operating activities was $500 million.', '2024-12-31'),
    claim('ocf-weather', 'Operating activities may be affected by weather.', '2026-06-01'),
    claim('ocf-qual', 'Net cash provided by operating activities may be affected by weather.', '2026-07-01'),
  ]);
  if (ocf.length !== 1 || ocf[0].id !== 'ocf-2024' || ocf[0].metric_id !== 'operating_cash_flow') {
    errors.push(`operating cash flow live ${JSON.stringify(ocf.map((c) => [c.id, c.metric_id]))}`);
  }

  const classifyRows = [
    ['Revenue was $10 billion.', 'company_revenue'],
    ['Revenues were $10 billion.', 'company_revenue'],
    ['Total net revenue was $10 billion.', 'company_revenue'],
    ['Total revenue was $10 billion.', 'company_revenue'],
    ['Net sales were $10 million. See guidance in Note 2.', 'company_revenue'],
    ['The board sanctions the capital plan of $5 billion.', null],
    ['The company does indemnify customers for $5 million.', 'guarantees'],
    ['The inventor was paid $1 million', null],
    ['The guid is stored in the filing.', null],
    ['The guidelines were updated.', null],
    ['Cash was $222 million. See guidance.', 'cash'],
    ['Total deposits were $88,000 million.', null],
    ['Deferred revenue was $4,050 million.', null],
    ['Production was 12 million barrels of oil equivalent per day.', null],
    ['Funds from operations were $620 million.', null],
    ['Outlook for next quarter revenue is $100 million', 'revenue_guide'],
    ['Goodwill impairment was $4 million.', 'goodwill_impairment'],
    ['Impairment of intangible assets other than goodwill was $4 million.', 'impairment'],
  ];
  for (const [text, mid] of classifyRows) {
    const got = classifyMetric(text, rules);
    if (got !== mid) errors.push(`classify ${JSON.stringify(text)} ${got} != ${mid}`);
  }

  const ni = parseAmounts('Net income was $12, or $0.12 per share, in millions except per share.');
  const scaled = ni.find((a) => a.value === 12000000 && a.scale === 'million');
  const perShare = ni.find((a) => a.unit === 'currency' && a.value === 0.12 && a.scale == null);
  if (!scaled || !perShare) errors.push(`per-share scale ${JSON.stringify(ni)}`);
  const bpsDollar = parseAmounts('$12 bps');
  if (!(bpsDollar.length === 1 && bpsDollar[0].unit === 'bps' && bpsDollar[0].value === 12 && bpsDollar[0].currency == null)) {
    errors.push(`$12 bps ${JSON.stringify(bpsDollar)}`);
  }
  if (parseAmounts('$12')[0]?.unit !== 'currency') errors.push('$12 alone is not currency');

  const blank = live([
    claim('bare', 'Gross margin was 40 percent.', '2026-08-01', ''),
    claim('cee', 'Gross margin was 41 percent.', '2026-08-01', 'C'),
  ]);
  if (blank[0]?.id !== 'bare') errors.push(`blank grade versus C ${blank[0]?.id}`);

  const risk = api.riskMetric;
  if (!risk) errors.push('riskMetric missing');
  else {
    if (risk('Operating margin pressure', rules) != null) errors.push('operating margin mapped to gross margin');
    if (risk('Customer lawsuit', rules) != null) errors.push('customer lawsuit mapped to concentration');
    if (risk('Gross margin', rules) !== 'gross_margin') errors.push('gross margin tripwire');
    if (risk('The board sanctions the capital plan', rules) != null) errors.push('board sanctions tripwire');
    if (risk('Indemnify', rules) !== 'guarantees') errors.push('indemnify tripwire');
  }
  return errors;
}

export function bannedWordHits(text) {
  const hits = [];
  for (const word of BANNED_WORDS) {
    const re = new RegExp(`\\b${word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'i');
    if (re.test(text)) hits.push(word);
  }
  return hits;
}

export function bannedNeedles(rules) {
  const needles = [];
  for (const rule of rules.metrics || []) {
    for (const key of ['any', 'all', 'none']) {
      for (const n of rule[key] || []) needles.push(String(n));
    }
    for (const group of rule.all_any || []) {
      for (const n of group || []) needles.push(String(n));
    }
    if (rule.regex) needles.push(String(rule.regex));
  }
  for (const row of rules.risk_metric || []) needles.push(String(row[0]));
  return needles.filter((n) => /\bguid\b/i.test(n) || /\binventor\b/i.test(n));
}
