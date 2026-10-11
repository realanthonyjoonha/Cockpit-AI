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
  if (classifyMetric('FY2026 Data Center revenue was $193.7 billion', rules) != null) errors.push('data-center special case');

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
