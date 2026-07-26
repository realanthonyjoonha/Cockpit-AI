// model.js — assembles vault files into page payloads. Everything here derives from the
// vault at request time (5s scan cache aside): zero app-side state, per §4.1.
import fs from 'fs';
import path from 'path';
import { VAULT_DIR, fm, scanVault, resolveSlug, renderMd, houseView, stance, syncState } from './vault.js';
import { liveComplexQuotes } from './quotes.js';

const COCKPIT = path.join(VAULT_DIR, 'cockpit');
const SERIES_DIR = path.join(COCKPIT, 'series');

// ---------- series (registry-driven — replaces v1's hardcoded list) ----------
export function registry() {
  try {
    return fm.parseRegistry(fs.readFileSync(path.join(SERIES_DIR, '_registry.md'), 'utf8'));
  } catch (e) { return { series: [], warnings: [`_registry.md unreadable: ${e.message}`] }; }
}

export function readSeries(id) {
  const file = path.join(SERIES_DIR, `${String(id).replace(/[^a-z0-9-]/g, '')}.csv`);
  if (!fs.existsSync(file)) return [];
  const lines = fs.readFileSync(file, 'utf8').trim().split('\n').slice(1);
  return lines.map((l) => {
    const [date, value, chg] = l.split(',');
    return { date, value: Number(value), chg: chg !== undefined && chg !== '' ? Number(chg) : null };
  }).filter((p) => p.date && !Number.isNaN(p.value));
}

export function seriesMeta(id) {
  const data = readSeries(id);
  if (!data.length) return { points: 0, available: false };
  const first = data[0], last = data[data.length - 1], prev = data[data.length - 2] || first;
  return {
    points: data.length, available: true, last, first,
    deltaPct: first.value ? ((last.value - first.value) / Math.abs(first.value)) * 100 : null,
    lastChangePct: prev.value ? ((last.value - prev.value) / Math.abs(prev.value)) * 100 : null,
    sessionChg: last.chg ?? null,
  };
}

export function listSeries() {
  const reg = registry();
  return reg.series.map((s) => ({ ...s, ...seriesMeta(s.id) }));
}

// % change vs ~N years back (calendar lookup on the dated series)
function deltaYears(data, years) {
  if (data.length < 2) return null;
  const last = data[data.length - 1];
  const target = `${Number(last.date.slice(0, 4)) - years}${last.date.slice(4)}`;
  const base = data.find((p) => p.date >= target) || data[0];
  if (!base || !base.value) return null;
  return ((last.value - base.value) / Math.abs(base.value)) * 100;
}
function drawdownPct(data) {
  if (!data.length) return null;
  const max = Math.max(...data.map((p) => p.value));
  const last = data[data.length - 1].value;
  return max ? ((last - max) / max) * 100 : null;
}

// ---------- risks ----------
export function risks() {
  const dir = path.join(COCKPIT, 'risks');
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    try {
      const parsed = fm.parseRiskFile(fs.readFileSync(path.join(dir, f), 'utf8'));
      const m = parsed.meta;
      out.push({
        id: m.id || f.replace(/\.md$/, ''),
        name: m.name || m.id, status: fm.STATUSES.includes(m.status) ? m.status : 'INTACT',
        grade: m.grade ?? '—', gradeLetter: fm.gradeLetter(m.grade),
        order: Number.isInteger(m.order) ? m.order : 99,
        houseview: m.houseview || '', hv: m.hv === true, hvlabel: m.hvlabel || null,
        summary: m.summary || parsed.tripwires[0]?.trip || '',
        category: m.category || null,
        series: m.series || [], pages: m.pages || [], updated: m.updated || null,
        tripwires: parsed.tripwires, tripNote: parsed.tripNote,
        prose: parsed.prose, research: parsed.research, history: parsed.history,
        warnings: parsed.warnings,
      });
    } catch (e) {
      out.push({ id: f.replace(/\.md$/, ''), name: f, status: 'INTACT', grade: '—', order: 99, unparsed: e.message, tripwires: [], history: [], series: [], pages: [], warnings: [`unparsed: ${e.message}`] });
    }
  }
  out.sort((a, b) => a.order - b.order);
  for (const r of out) r.sec = `3.${r.order}`;
  return out;
}
export const riskById = (id) => risks().find((r) => r.id === id) || null;
export const riskSecMap = () => Object.fromEntries(risks().map((r) => [r.id, r.sec]));

export function riskDetail(id) {
  const r = riskById(id);
  if (!r) return null;
  const reg = registry().series;
  return {
    ...r,
    proseHtml: renderMd(r.prose),
    researchHtml: r.research ? renderMd(r.research) : '',
    instruments: r.series.map((sid) => ({
      ...(reg.find((s) => s.id === sid) || { id: sid, label: sid, unit: '', kind: 'line' }),
      ...seriesMeta(sid),
    })),
    researchPages: r.pages.map((slug) => {
      const p = resolveSlug(slug);
      return p ? { slug: p.slug, name: p.name, html: renderMd(p.body) } : { slug, name: slug, missing: true };
    }),
    positioningRead: id === 'positioning-unwind' ? buildPositioningRead() : null,
  };
}

// ---------- positioning read (synthesis of the positioning-unwind instruments) ----------
// A transparent, heuristic READ — NOT a precision index. It groups the risk's heterogeneous
// series into four positioning dimensions, reads each one's recent DIRECTION, and surfaces the
// divergence that 14 separate charts obscure (weak hands buying while strong hands distribute).
// Decision-support only: describes the crowding STATE, never a buy/sell call.
const krwB = (v) => (Math.abs(v) >= 1000 ? `₩${(v / 1000).toFixed(1)}T` : `₩${Math.round(v)}B`);
function buildPositioningRead() {
  const last = (id) => { const d = readSeries(id); return d.length ? d[d.length - 1].value : null; };
  const sumLast = (id, n) => readSeries(id).slice(-n).reduce((s, p) => s + p.value, 0);
  const win = (id) => { const d = readSeries(id); return d.length >= 2 ? d[d.length - 1].value - d[0].value : 0; };
  const winRecent = (id, n) => { const d = readSeries(id).slice(-n); return d.length >= 2 ? d[d.length - 1].value - d[0].value : 0; };
  const has = (id) => readSeries(id).length >= 3;
  const dims = [];

  if (has('retail-flow-hynix') || has('lev-etf-flow')) {
    const net = sumLast('retail-flow-hynix', 6) + sumLast('retail-flow-samsung', 6) + sumLast('lev-etf-flow', 6);
    const state = net > 0 ? 'building' : net < 0 ? 'cooling' : 'flat';
    dims.push({ key: 'retail', label: 'Retail / leverage', state,
      tone: state === 'building' ? 'hot' : state === 'cooling' ? 'cool' : 'neutral',
      note: `KR retail + leverage net ${net >= 0 ? '+' : '−'}${krwB(Math.abs(net))} over recent sessions` });
  }
  if (has('foreign-flow-hynix') || has('foreign-own-hynix')) {
    const flow = sumLast('foreign-flow-hynix', 6) + sumLast('foreign-flow-samsung', 6);
    const own = win('foreign-own-hynix') + win('foreign-own-samsung');
    const state = (flow < 0 || own < 0) ? 'distributing' : (flow > 0 && own >= 0) ? 'accumulating' : 'steady';
    dims.push({ key: 'foreign', label: 'Foreign (smart money)', state,
      tone: state === 'distributing' ? 'hot' : state === 'accumulating' ? 'cool' : 'neutral',
      note: `foreign net ${flow >= 0 ? '+' : '−'}${krwB(Math.abs(flow))}; ownership ${own < 0 ? '↓' : '↑'}${Math.abs(own).toFixed(1)}pp` });
  }
  if (has('mu-short-interest')) {
    const si = winRecent('mu-short-interest', 6);
    const dtc = last('mu-days-to-cover');
    const state = si > 0 ? 'building' : si < 0 ? 'covering' : 'flat';
    dims.push({ key: 'shorts', label: 'MU shorts', state,
      tone: state === 'building' ? 'hot' : state === 'covering' ? 'cool' : 'neutral',
      note: `short interest ${si >= 0 ? '↑' : '↓'}${Math.abs(si).toFixed(1)}M sh; ${dtc != null ? dtc.toFixed(1) : '?'} days-to-cover${dtc != null && dtc <= 1.1 ? ' · no cushion' : ''}` });
  }
  if (has('mu-insider-net') || has('mu-13f-primecap')) {
    const ins = last('mu-insider-net');
    const auto = winRecent('mu-insider-auto-sell', 4);
    const pc = win('mu-13f-primecap');
    const state = ((ins != null && ins < 0) || auto > 0 || pc < 0) ? 'distributing' : 'steady';
    const bits = [];
    if (ins != null) bits.push(`insiders ${ins < 0 ? 'net-selling' : 'net-buying'}`);
    if (pc) bits.push(`PRIMECAP ${pc < 0 ? 'trimming' : 'adding'}`);
    if (auto) bits.push(`10b5-1 sells ${auto > 0 ? '↑' : '↓'}`);
    dims.push({ key: 'insti', label: 'Insiders / 13F', state,
      tone: state === 'distributing' ? 'hot' : 'neutral', note: bits.join('; ') || 'no recent moves' });
  }
  if (!dims.length) return null;

  const st = (k) => { const d = dims.find((x) => x.key === k); return d ? d.state : null; };
  const retailBuilding = st('retail') === 'building';
  const smartDist = st('foreign') === 'distributing' || st('insti') === 'distributing';
  const shortsBuilding = st('shorts') === 'building';

  let verdict, severity, synthesis;
  if (retailBuilding && smartDist) {
    verdict = 'CROWDED — DISTRIBUTION TO RETAIL'; severity = 'high';
    synthesis = 'Retail and leverage keep piling in while foreign and long-only institutions distribute — weak hands absorbing what strong hands sell. That divergence is the textbook late-stage crowded-trade setup, the state in which a positioning unwind does the most damage.';
  } else if (smartDist) {
    verdict = 'DISTRIBUTION — RETAIL BACKING OFF'; severity = 'elevated';
    synthesis = 'Foreign and institutional selling continues, but retail is no longer catching it — the marginal-buyer support under the trade is thinning.';
  } else if (!retailBuilding) {
    verdict = 'COOLING / DE-RISKING'; severity = 'moderate';
    synthesis = 'Froth is easing and smart-money distribution has paused — crowding is coming down in an orderly way rather than building.';
  } else {
    verdict = 'BROAD BID'; severity = 'moderate';
    synthesis = 'The bid looks broad-based rather than retail-only — less of the weak-hand / strong-hand divergence that makes an unwind violent.';
  }
  if (shortsBuilding) synthesis += ' On the US leg, MU short interest is building into a ~1-day cover — bearish bets rising with no squeeze cushion.';

  const asOf = ['retail-flow-hynix', 'foreign-flow-hynix', 'mu-short-interest', 'mu-insider-net', 'mu-13f-primecap']
    .map((id) => { const d = readSeries(id); return d.length ? d[d.length - 1].date : null; })
    .filter(Boolean).sort().pop() || null;

  return { verdict, severity, synthesis, dims, asOf,
    caveat: 'A heuristic read of recent direction across the instruments below — not a precision index; KR-flow and 13F history are still accruing.' };
}

// ---------- headlines ----------
function parseCsvLine(line) {
  const out = []; let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (inQ) { if (c === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else inQ = false; } else cur += c; }
    else if (c === '"') inQ = true;
    else if (c === ',') { out.push(cur); cur = ''; }
    else cur += c;
  }
  out.push(cur);
  return out;
}
// wire services syndicate the same story to many outlets — keep the first per title
export function dedupeByTitle(list) {
  const seen = new Set();
  return list.filter((h) => {
    const k = h.title.toLowerCase().replace(/\W+/g, ' ').trim();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

export function headlines() {
  const file = path.join(COCKPIT, 'headlines.csv');
  if (!fs.existsSync(file)) return [];
  const secs = riskSecMap();
  return fs.readFileSync(file, 'utf8').trim().split('\n').slice(1).map((l) => {
    const [date, ts, source, risk, topics, title, url] = parseCsvLine(l);
    return { date, ts, source, risk: risk || null, sec: risk ? secs[risk] || null : null, topics: topics ? topics.split(';') : [], title, url };
  }).filter((h) => h.title && h.ts).sort((a, b) => b.ts.localeCompare(a.ts));
}

// ---------- catalysts / log / reports ----------
export function catalysts() {
  try { return fm.parseCatalysts(fs.readFileSync(path.join(VAULT_DIR, 'wiki', 'catalysts.md'), 'utf8')); }
  catch { return { rows: [], warnings: ['wiki/catalysts.md unreadable'] }; }
}

const KIND_INFER = [
  [/\[sync\]|^\d+\/\d+ changed/i, 'sync'], [/ingest/i, 'ingest'], [/series live|instrumented|— \*\*\[series\]\*\*/i, 'series'],
  [/house[- ]view|LOCKED into/i, 'house'], [/monitors|watchlist rebuilt/i, 'monitors'], [/report|initiation|finalized/i, 'report'],
];
export function logTail(n = 50) {
  const file = path.join(VAULT_DIR, 'wiki', 'log.md');
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (const line of fs.readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^-\s+\*\*(\d{4}-\d{2}-\d{2})\*\*\s*—\s*(?:\*\*\[(\w[\w-]*)\]\*\*\s*)?([\s\S]*)$/);
    if (!m) continue;
    const kind = m[2] || (KIND_INFER.find(([re]) => re.test(m[3])) || [, 'note'])[1];
    const text = m[3].replace(/\*\*/g, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a);
    out.push({ date: m[1], kind, text: text.length > 400 ? text.slice(0, 397) + '…' : text });
  }
  return out.reverse().slice(0, n); // newest first
}

const REPORT_KIND = [
  [/scenario-model/, 'model'], [/panel/, 'panel'], [/houseview|house-view/, 'house'],
  [/adjudication|substitution/, 'verdict'], [/proposed-edits/, 'edits'], [/leo-rf|starlink|spacex/, 'off-spine'],
];
export function reports() {
  const dir = path.join(VAULT_DIR, 'reports');
  if (!fs.existsSync(dir)) return [];
  const byBase = new Map();
  for (const f of fs.readdirSync(dir)) {
    const m = f.match(/^(.+)\.(html|pdf|md)$/);
    if (!m) continue;
    const base = m[1];
    if (!byBase.has(base)) byBase.set(base, { base, formats: {} });
    byBase.get(base).formats[m[2]] = f;
  }
  const out = [];
  for (const r of byBase.values()) {
    if (!r.formats.html && !r.formats.pdf) continue; // md-only working files stay off the shelf
    const date = (r.base.match(/^(\d{4}-\d{2}-\d{2})/) || [])[1] || '';
    let title = r.base.replace(/^\d{4}-\d{2}-\d{2}-/, '').replace(/-/g, ' ');
    if (r.formats.md) {
      try {
        const h1 = fs.readFileSync(path.join(dir, r.formats.md), 'utf8').match(/^#\s+(.+)$/m);
        if (h1) title = h1[1].replace(/\*\*/g, '').trim();
      } catch { /* keep filename title */ }
    }
    const kind = (REPORT_KIND.find(([re]) => re.test(r.base)) || [, 'report'])[1];
    out.push({ base: r.base, date, title, kind, html: r.formats.html || null, pdf: r.formats.pdf || null });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date) || a.title.localeCompare(b.title));
}

// ---------- street read (published third-party forecasts — MU / SK Hynix / Samsung) ----------
// Curated dataset in cockpit/street/street-models.json (paywalled consensus feeds aren't keyless-
// syncable, so it's hand-refreshed like the curated 13F set). The site is a pure readout: this
// builder derives the counts + a synthesis READ at request time. Decision-support only — it
// catalogs what firms PUBLISHED plus their own targets; it never emits a house target or reco.
const isCautiousRating = (r) => /neutral|hold|sell/i.test(r || '');
export function street() {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(COCKPIT, 'street', 'street-models.json'), 'utf8')); }
  catch (e) { return { available: false, error: e.message }; }

  const companies = (d.companies || []).map((c) => {
    const firms = c.firms || [];
    const cautious = firms.filter((f) => isCautiousRating(f.rating) && f.flag !== 'stale');
    return { ...c, derived: {
      nFirms: firms.length,
      nBull: firms.filter((f) => f.flag === 'bull').length,
      nBear: firms.filter((f) => f.flag === 'bear').length,
      nStale: firms.filter((f) => f.flag === 'stale').length,
      cautious: cautious.map((f) => f.firm),
    } };
  });

  // synthesis dims — one per company, COMPUTED from the rows (transparent, not asserted)
  const dims = companies.map((c) => {
    const cd = c.derived, cs = c.consensus || {};
    const caut = cd.cautious.length
      ? `${cd.cautious.length} cautious (${cd.cautious.map((n) => n.split(' ')[0]).join(', ')})`
      : 'no cautious majors';
    return {
      key: c.id, label: c.name,
      state: `${cs.rating || '—'} · ${cd.nFirms} desks`,
      tone: cd.cautious.length ? 'warn' : 'cool',
      note: `consensus ${cs.ptAvg || '—'} (${cs.ptLow || '—'}–${cs.ptHigh || '—'}); ${cd.nBull} at the bull end, ${caut}. 2028: ${cs.cov2028 || '—'}`,
    };
  });
  const houses = d.independents?.houses || [];
  const bears = houses.filter((h) => /bear/i.test(h.stance));
  dims.push({
    key: 'independents', label: 'Independent houses', tone: 'neutral',
    state: `${houses.length} houses`,
    note: `total-memory 2026 ranges ~$550–889B; nearly all peak 2027${bears.length ? `; lone structural 2028 bear: ${bears.map((b) => b.house.split(' (')[0]).join(', ')}` : ''}.`,
  });

  const totalDesks = companies.reduce((s, c) => s + c.derived.nFirms, 0);
  const noSell = companies.every((c) => (c.firms || []).every((f) => !/\bsell\b/i.test(f.rating || '')));

  return {
    available: true, asOf: d.asOf || null, reportSlug: d.reportSlug || null,
    read: {
      verdict: d.throughline?.verdict || 'STREET READ',
      synthesis: d.throughline?.synthesis || '',
      dims,
      stat: `${totalDesks} sell-side models + ${houses.length} independent houses surveyed${noSell ? ' · no Sell rating on any of the three' : ''}`,
      caveat: d.throughline?.caveat || '',
      asOf: d.asOf || null,
    },
    companies,
    independents: d.independents || null,
    agree: d.agree || [], forks: d.forks || [], headToHead: d.headToHead || [], traps: d.traps || [],
  };
}

// ---------- margins (official operating-margin history + graded HBM/DRAM estimate layer) ----------
// Curated dataset in cockpit/margins/margins.json (quarterly earnings, hand-refreshed like the
// street/13F sets — not keyless-syncable). Resolves each chart's series refs into MultiLineChart-
// ready {label,color,dashed,grade,data:[{date,value}]}. Decision-support only — official disclosures
// + clearly-graded estimates, never a house margin or reco.
export function margins() {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(COCKPIT, 'margins', 'margins.json'), 'utf8')); }
  catch (e) { return { available: false, error: e.message }; }
  const S = d.series || {};
  const toData = (pts) => (pts || []).map(([date, value]) => ({ date, value }));
  const charts = (d.charts || []).map((c) => ({
    id: c.id, title: c.title, sub: c.sub,
    series: (c.series || []).map((r) => {
      const s = S[r.ref] || {};
      return { label: s.label || r.ref, grade: s.grade || null, note: s.note || '', color: r.color, dashed: !!r.dashed, data: toData(s.points) };
    }),
  }));
  return {
    available: true, asOf: d.asOf || null, unit: d.unit || 'pct',
    headline: d.headline || '', insight: d.insight || '', framing: d.framing || '',
    charts, regimeFlip: d.regimeFlip || '',
    estimates: d.estimates || null, quotes: d.quotes || [], caveats: d.caveats || [],
  };
}

// ---------- DRAM revenue nowcast (own-brain statistical model — parked v1.0.0) ----------
// Reads the engine's authoritative output (cockpit/forecast/nowcast.json — status, version, backtest,
// feature freshness) alongside the curated display panel (nowcast-panel.json — effectiveness table,
// Street benchmark, usage guide, diagnostic). No LLM at inference; decision-support only. Nothing here
// emits an estimate — the parked status is surfaced verbatim from the engine file.
export function dramNowcast() {
  const dir = path.join(COCKPIT, 'forecast');
  let core, panel;
  try { core = JSON.parse(fs.readFileSync(path.join(dir, 'nowcast.json'), 'utf8')); }
  catch (e) { return { available: false, error: e.message }; }
  try { panel = JSON.parse(fs.readFileSync(path.join(dir, 'nowcast-panel.json'), 'utf8')); }
  catch (e) { panel = {}; }
  const bt = core.backtest || {};
  const fresh = (core.features?.freshness || []).map((f) => ({
    series: f.series, label: f.label, source: f.source, latest: f.latest_obs, grade: f.grade, n: f.n_points,
  }));
  return {
    available: true,
    status: core.status || 'unknown',
    modelVersion: core.model_version || null,
    generatedAt: core.generated_at || null,
    asOf: panel.asOf || core.asOf || null,
    targetBasis: core.target_basis || null,
    whatItIs: panel.whatItIs || '',
    v2: panel.v2 || null,
    usage: panel.usage || null,
    effectiveness: panel.effectiveness || null,
    benchmark: panel.benchmark || null,
    diagnostic: panel.diagnostic || null,
    methodology: panel.methodology || [],
    gate: {
      verdict: bt.verdict || null, infoSet: bt.info_set || null, nOOS: bt.n_oos_quarters || null,
      mapeRatio: bt.mape_ratio ?? null, hitRate: bt.hit_rate ?? null,
    },
    freshness: fresh,
  };
}

// ---------- leverage monitor (KR gap-risk readout — SK Hynix & Samsung) ----------
// Dedicated daily-check page for the near-term retail-leverage cascade risk. Live price + KR
// flows auto-sync (Naver); the trigger levels + amplifier AUM + the margin snapshot are curated
// (cockpit/leverage/leverage-monitor.json, hand-refreshed like street/margins). The read is
// COMPUTED at request time (distance-to-trigger + flow direction + amplifier size → a mechanical
// gap-risk STATE). Decision-support only — a state readout, never a target, sizing, or reco.
function flowSum6(id) {
  if (!id) return null;
  const s = readSeries(id);
  if (!s.length) return null;
  return s.slice(-6).reduce((a, p) => a + p.value, 0);
}
export function leverageMonitor() {
  let d;
  try { d = JSON.parse(fs.readFileSync(path.join(COCKPIT, 'leverage', 'leverage-monitor.json'), 'utf8')); }
  catch (e) { return { available: false, error: e.message }; }

  const names = (d.names || []).map((c) => {
    const meta = seriesMeta(c.priceSeries);
    const px = meta.available ? meta.last.value : null;
    const t = c.triggers || {};
    const above = (lvl) => (px && lvl ? ((px - lvl) / lvl) * 100 : null); // % the price sits above a level
    let zone = '—', tone = 'neutral';
    if (px != null) {
      if (px <= t.battleLow) { zone = 'BELOW THE FLOOR BAND'; tone = 'hot'; }
      else if (px <= t.battleHigh) { zone = 'IN THE FLOOR BAND'; tone = 'hot'; }
      else if (px <= t.firstRetest) { zone = 'IN THE CASCADE ZONE'; tone = 'warn'; }
      else { zone = 'ABOVE THE FIRST TRIGGER'; tone = 'cool'; }
    }
    const foreign = flowSum6(c.flow?.foreign), retail = flowSum6(c.flow?.retail);
    const ownMeta = c.flow?.own ? seriesMeta(c.flow.own) : null;
    return {
      id: c.id, name: c.name, ticker: c.ticker, unit: c.unit || 'KRW',
      price: px, lastDate: meta.available ? meta.last.date : null,
      peak: c.peak || null, offPeakPct: px && c.peak ? ((px - c.peak) / c.peak) * 100 : null,
      triggers: t, distFirstRetest: above(t.firstRetest), distBattleHigh: above(t.battleHigh),
      zone, tone, amp: c.amp || null,
      flow: {
        foreignState: foreign == null ? null : (foreign < 0 ? 'distributing' : foreign > 0 ? 'accumulating' : 'steady'),
        retailState: retail == null ? null : (retail > 0 ? 'building' : retail < 0 ? 'cooling' : 'flat'),
        own: ownMeta?.available ? ownMeta.last.value : null,
      },
    };
  });

  const withDist = names.filter((n) => n.distFirstRetest != null);
  const nearest = withDist.length ? withDist.slice().sort((a, b) => a.distFirstRetest - b.distFirstRetest)[0] : null;
  const distToRetail = names.some((n) => n.flow.foreignState === 'distributing' && n.flow.retailState === 'building');
  const ampTotal = names.reduce((s, n) => s + (n.amp?.aum2xUsdB || 0), 0);

  let verdict = 'LEVERAGE MONITOR';
  if (nearest) {
    const loaded = (d.fuel?.state || 'LOADED').split('—')[0].trim().toUpperCase();
    if (nearest.distFirstRetest <= 0) verdict = `${nearest.name.toUpperCase()} — THROUGH ITS FIRST TRIGGER`;
    else if (nearest.distFirstRetest <= 5) verdict = `AT THE TRIGGER — ${nearest.name.split(' ')[0].toUpperCase()} ${nearest.distFirstRetest.toFixed(0)}% ABOVE ITS FIRST LINE`;
    else verdict = `${loaded} — ${nearest.name.split(' ')[0].toUpperCase()} ${nearest.distFirstRetest.toFixed(0)}% ABOVE ITS FIRST TRIGGER`;
  }
  const stat = `~$${ampTotal.toFixed(1)}B of 2× leverage exposure${d.fuel?.marginTotalKrwT ? ` · margin ₩${d.fuel.marginTotalKrwT}T (record)` : ''}${distToRetail ? ' · distribution to retail' : ''}`;

  // a plain-language translation of the computed state (the "what this means" line)
  let plain = '';
  if (nearest) {
    const near = nearest.name.split(' ')[0];
    const dist = nearest.distFirstRetest;
    if (dist <= 0) {
      plain = `${near} has broken below its first trigger — the level where forced selling re-ignites — and the market open is where that does the most damage. Below here, margin calls (at the open) and 2× ETF selling (into the close) can compound down toward the floor band.`;
    } else {
      plain = `In plain terms: the leverage fuel is stacked at a record and has not drained — but price hasn't yet hit the level that restarts forced selling. ${near} is the nearest, about ${dist.toFixed(0)}% above its first trigger. Break that line and margin calls at the open plus 2× ETF selling into the close can compound down toward the floor band — where value buyers should meet it, if the memory deficit still holds.`;
    }
  }

  return {
    available: true, asOf: d.asOf || null, reportSlug: d.reportSlug || null, note: d.note || '',
    read: { verdict, plain, stat, fuel: d.fuel || null, caveat: d.caveat || '' },
    names,
    legend: d.legend || [], mechanics: d.mechanics || [], watch: d.watch || [],
  };
}

// ---------- companies ----------
// exchange/ticker lines are stable entity facts (presentation map, not state);
// role lines derive from each page's first body sentence — the vault stays the author.
const COMPANY_ORDER = [
  ['roundhill-dram-etf', 'NASDAQ · THE EXPRESSION', 'price-dram-etf', '★'],
  ['micron', 'NASDAQ · MU', 'price-mu', ''],
  ['sk-hynix', 'KRX 000660', 'price-sk-hynix', ''],
  ['samsung-electronics', 'KRX 005930', 'price-samsung', ''],
  ['cxmt', 'PRIVATE · CHINA', null, ''],
  ['hbm', 'CONCEPT PAGE', null, ''],
  ['ddr5', 'CONCEPT PAGE', null, ''],
  ['memory-oligopoly', 'CONCEPT PAGE', null, ''],
];
function firstSentence(body) {
  const text = body.replace(/^#.+$/gm, '').replace(/[>*_`]|\[\[|\]\]/g, '').replace(/\n+/g, ' ').trim();
  const wi = text.match(/What it is:\s*([^.;]{20,200}[.;])/i); // entity pages lead with this
  if (wi) return wi[1].trim();
  const m = text.match(/^.{0,40}?([A-Z][^.;]{25,150}[.;])/);
  return (m ? m[1] : text.slice(0, 120).replace(/\s+\S*$/, '') + '…').replace(/^What it is:\s*/i, '').trim();
}
export function companies() {
  return COMPANY_ORDER.map(([slug, tag, seriesId, star]) => {
    const p = resolveSlug(slug);
    const meta = seriesId ? seriesMeta(seriesId) : null;
    const data = seriesId ? readSeries(seriesId) : [];
    const monitors = p ? (p.body.match(/\bMonitor(?:able)?s?\b\s*:/gi) || []).length : 0;
    return {
      slug, tag, star, name: p ? p.name.toUpperCase() : slug.toUpperCase(),
      price: meta?.available ? meta.last.value : null,
      unit: seriesId === 'price-sk-hynix' || seriesId === 'price-samsung' ? 'KRW' : 'USD',
      delta1y: data.length ? deltaYears(data, 1) : null,
      delta3y: data.length ? deltaYears(data, 3) : null,
      drawdown: data.length ? drawdownPct(data) : null,
      role: p ? firstSentence(p.body) : '(page missing)',
      monitors,
    };
  });
}

// ---------- desks ----------
export function desks() {
  const dir = path.join(COCKPIT, 'desks');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md')).sort()) {
    try {
      const { meta, body } = fm.parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
      out.push({ id: meta.id || f.replace(/\.md$/, ''), name: meta.name || meta.id, order: meta.order ?? 99, tells: meta.tells === true, series: meta.series || [], topics: meta.topics || [], pages: meta.pages || [], entities: meta.entities || [], overlay: meta.overlay || [], overlayTitle: meta.overlayTitle || null, overlayLabels: meta.overlayLabels || [], intro: body.trim() });
    } catch { /* skip unparsable desk */ }
  }
  return out.sort((a, b) => a.order - b.order);
}
export function deskDetail(id) {
  const d = desks().find((x) => x.id === id);
  if (!d) return null;
  const reg = registry().series;
  const heads = headlines().filter((h) => h.topics.some((t) => d.topics.includes(t))).slice(0, 12);
  const OVL_COLORS = ['#6E8BD6', '#46C482', '#DFAF4E', '#EF7480'];
  const overlays = (d.overlay && d.overlay.length) ? [{
    title: d.overlayTitle || 'Overlay',
    unit: (reg.find((s) => s.id === d.overlay[0]) || {}).unit || 'pct',
    series: d.overlay.map((sid, i) => {
      const meta = reg.find((s) => s.id === sid) || {};
      return { id: sid, label: d.overlayLabels[i] || meta.label || sid, color: OVL_COLORS[i % OVL_COLORS.length], dashed: i > 0, data: readSeries(sid) };
    }).filter((s) => s.data.length),
  }] : [];
  return {
    ...d, introHtml: renderMd(d.intro), overlays,
    instruments: d.series.map((sid) => ({ ...(reg.find((s) => s.id === sid) || { id: sid, label: sid, kind: 'line' }), ...seriesMeta(sid) })),
    headlines: heads,
    researchPages: d.pages.map((slug) => {
      const p = resolveSlug(slug);
      return p ? { slug: p.slug, name: p.name, html: renderMd(p.body) } : { slug, name: slug, missing: true };
    }),
    masterTells: d.tells ? masterTells() : null,
  };
}

// the ⭐5 from monitors.md; wired live where a tell-flagged tripwire exists on a risk
export function masterTells() {
  const p = resolveSlug('monitors');
  if (!p) return [];
  const block = p.body.split(/^## /m).find((s) => s.startsWith('⭐'));
  if (!block) return [];
  const all = risks();
  const out = [];
  for (const m of block.matchAll(/^(\d)\.\s+(.+)$/gm)) {
    const text = m[2].replace(/\*\*/g, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).trim();
    const owner = all.find((r) => r.tripwires.some((t) => t.tell) && sameTell(Number(m[1]), r.id));
    out.push({ n: Number(m[1]), text, risk: owner ? { id: owner.id, sec: owner.sec, status: owner.status } : null });
  }
  return out;
}
// tells №1–3 live on the register (§6); №4–5 are off-spine
function sameTell(n, riskId) {
  return (n === 1 && riskId === 'price-cycle') || (n === 2 && riskId === 'memory-per-token') || (n === 3 && riskId === 'capex-rollover');
}

// ---------- overview ----------
// Micron fiscal calendar: FY starts ~Sep → Q1 Sep-Nov · Q2 Dec-Feb · Q3 Mar-May · Q4 Jun-Aug
function muFiscal(endDate) {
  if (!endDate) return '';
  const [y, mo] = [Number(endDate.slice(0, 4)), Number(endDate.slice(5, 7))];
  const fy = mo >= 9 ? y + 1 : y;
  const q = mo >= 9 ? 1 : mo >= 6 ? 4 : mo >= 3 ? 3 : 2;
  return `FY${String(fy).slice(2)}·Q${q}`;
}
function yoyPct(data) {
  if (data.length < 5) return null;
  const last = data[data.length - 1], prior = data[data.length - 5];
  return prior.value ? ((last.value - prior.value) / Math.abs(prior.value)) * 100 : null;
}

export function overview() {
  const st = stance();
  const all = risks();
  const byId = Object.fromEntries(all.map((r) => [r.id, r]));
  const trigger = (id) => byId[id] ? { id, sec: byId[id].sec, status: byId[id].status } : { id, sec: null, status: null };

  const spot5 = seriesMeta('dram-spot-ddr5'), spot4 = seriesMeta('dram-spot-ddr4');
  const ai = seriesMeta('ai-capex'), aiData = readSeries('ai-capex');
  const mu = seriesMeta('micron-capex'), muData = readSeries('micron-capex');
  const muIsRecord = muData.length && muData[muData.length - 1].value >= Math.max(...muData.map((p) => p.value));

  const tiles = [
    { id: 'price-dram-etf', slug: 'roundhill-dram-etf', label: 'DRAM ETF ★ THE EXPRESSION', venue: 'NASDAQ', unit: 'USD', deltaYears: 1 },
    { id: 'price-mu', slug: 'micron', label: 'MICRON — MU', venue: 'NASDAQ', unit: 'USD', deltaYears: 3 },
    { id: 'price-sk-hynix', slug: 'sk-hynix', label: 'SK HYNIX', venue: 'KRX 000660', unit: 'KRW', deltaYears: 3 },
    { id: 'price-samsung', slug: 'samsung-electronics', label: 'SAMSUNG', venue: 'KRX 005930', unit: 'KRW', deltaYears: 3 },
  ].map((t) => {
    const data = readSeries(t.id);
    const meta = seriesMeta(t.id);
    const dd = drawdownPct(data);
    return { ...t, available: meta.available, last: meta.last || null, delta: deltaYears(data, t.deltaYears), offHigh: dd != null && dd <= -10 ? dd : null };
  });

  const state = syncState();
  const ups = Object.entries(state.updaters || {});
  const live = ups.filter(([, u]) => u.lastSuccess && !/^parked/.test(u.lastSummary || '')).length;

  return {
    stance: {
      chip: all.some((r) => r.status === 'FIRED') ? 'LONG · TRIGGERED' : 'LONG · INTACT',
      line: st.line, confirmed: st.confirmed, confirmedDate: st.confirmedDate,
      triggers: [
        { label: 'VALUATION', ...trigger('valuation-rerating') },
        { label: 'EFFICIENCY/EDGE', ...trigger('memory-per-token') },
        { label: 'AI-TRADE HEALTH', ...trigger('capex-rollover') },
      ],
    },
    rev: st.updated ? `REV ${st.updated.slice(5)}` : 'REV —',
    conditions: {
      ddr5: spot5.available ? { v: spot5.last.value, chg: spot5.sessionChg } : null,
      ddr4: spot4.available ? { v: spot4.last.value, chg: spot4.sessionChg } : null,
      aiCapex: ai.available ? { v: ai.last.value, yoy: yoyPct(aiData), q: ai.last.date } : null,
      muCapex: mu.available ? { v: mu.last.value, fiscal: muFiscal(mu.last.date), record: muIsRecord } : null,
    },
    tiles,
    register: all.map((r) => ({ id: r.id, sec: r.sec, name: r.name, status: r.status, hv: r.hv, summary: r.summary, updated: r.updated })),
    watchCount: all.filter((r) => r.status === 'WATCH').length,
    firedCount: all.filter((r) => r.status === 'FIRED').length,
    headlines: dedupeByTitle(headlines()).slice(0, 6),
    events: catalysts().rows.filter((r) => r.section === 'upcoming').slice(0, 5),
    sync: { lastRun: state.lastRun || null, live, total: ups.length || 11, lastVisit: state.lastVisit || null },
  };
}

// ---------- complex quotes (LIVE price overlay for the §2.0 tiles — the one live path) ----------
// Powers ONLY the four "complex" tiles on the Overview: a request-time live price (Nasdaq/Naver,
// Yahoo fallback — see quotes.js) laid over the synced CSV, plus the one-week day-to-day % table.
// The live price is a freshness overlay; the WEEK is derived purely from the synced CSVs (so it
// works with zero network and never invents a number). Cached 60s so reloads don't re-hit sources.
// Decision-support only — describes price state, never an action. Other graphs are untouched.
const COMPLEX = [
  { id: 'price-dram-etf', label: 'DRAM ETF ★', unit: 'USD' },
  { id: 'price-mu', label: 'MU', unit: 'USD' },
  { id: 'price-sk-hynix', label: 'SK Hynix', unit: 'KRW' },
  { id: 'price-samsung', label: 'Samsung', unit: 'KRW' },
];
let _quoteCache = { at: 0, data: null, inflight: null };
async function buildComplexQuotes() {
  let live = {};
  try { live = await liveComplexQuotes(); } catch { live = {}; }
  const quotes = COMPLEX.map((c) => {
    const csv = readSeries(c.id);
    const lastCsv = csv.length ? csv[csv.length - 1] : null;
    const lq = live[c.id] && live[c.id].price != null ? live[c.id] : null;
    // one week = the last 5 COMPLETED day-to-day % moves, from the synced CSV (6 closes → 5 deltas).
    // Today's live move is NOT folded in here (it's the tile's session % + the row's NOW cell) —
    // this column stays "completed sessions" so the same move never shows twice.
    const tail = csv.slice(-6);
    const week = [];
    for (let i = 1; i < tail.length; i++) {
      const prev = tail[i - 1].value, cur = tail[i].value;
      week.push({ date: tail[i].date, close: cur, chgPct: prev ? ((cur - prev) / prev) * 100 : null });
    }
    const price = lq ? lq.price : (lastCsv ? lastCsv.value : null);
    return {
      id: c.id, label: c.label, unit: c.unit,
      available: price != null,
      price, pct: lq ? lq.pct : null,
      realtime: lq ? lq.realtime === true : false,
      source: lq ? lq.source : 'csv',
      asOf: lq ? lq.asOf : (lastCsv ? lastCsv.date : null),
      lastClose: lastCsv ? lastCsv.value : null,
      week: week.slice(-5),
    };
  });
  return { available: true, fetchedAt: new Date().toISOString(), live: quotes.some((q) => q.source !== 'csv'), quotes };
}
// 60s TTL + single-flight so concurrent loads (and the auto-refresh poll) share one upstream fetch
export async function complexQuotes() {
  const now = Date.now();
  if (_quoteCache.data && now - _quoteCache.at < 60000) return _quoteCache.data;
  if (_quoteCache.inflight) return _quoteCache.inflight;
  _quoteCache.inflight = buildComplexQuotes()
    .then((d) => { _quoteCache = { at: Date.now(), data: d, inflight: null }; return d; })
    .catch((e) => { _quoteCache.inflight = null; throw e; });
  return _quoteCache.inflight;
}

// ---------- house view (READ-ONLY render, split into entries) ----------
export function houseEntries() {
  const { body, updated } = houseView();
  const entries = [];
  for (const m of body.matchAll(/^### (.+?) — (CONFIRMED|DRAFT|FORMING)(?: · (\d{4}-\d{2}-\d{2}))?\s*$\n([\s\S]*?)(?=^### |\n## |$(?![\s\S]))/gm)) {
    entries.push({ title: m[1].trim(), status: m[2], date: m[3] || null, html: renderMd(m[4].trim()) });
  }
  const hero = entries.find((e) => /Memory \/ DRAM/i.test(e.title)) || null;
  return {
    updated,
    hero,
    others: entries.filter((e) => e !== hero && e.status === 'CONFIRMED'),
    drafts: entries.filter((e) => e.status === 'DRAFT' || e.status === 'FORMING'),
    triggers: overviewTriggers(),
  };
}
function overviewTriggers() {
  const all = risks();
  const byId = Object.fromEntries(all.map((r) => [r.id, r]));
  return [
    { label: 'valuations', id: 'valuation-rerating' },
    { label: 'engineering breakthroughs / edge-on-device', id: 'memory-per-token' },
    { label: 'AI-trade health, capex-to-OCF', id: 'capex-rollover' },
  ].map((t) => ({ ...t, sec: byId[t.id]?.sec || null, status: byId[t.id]?.status || null }));
}

// ---------- analysts (figure-brains, Stated-vs-Inferred discipline) ----------
// Surfaces the WHOLE brain: every stated-view (memory first; each with its **Headline:** when
// present), the index's delta section, and chips for method / sources / every view / reports.
export function analysts() {
  const dir = path.join(VAULT_DIR, 'figures');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const d of fs.readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory() || d.name.startsWith('_') || d.name.startsWith('.')) continue;
    const figDir = path.join(dir, d.name);
    const idxPath = path.join(figDir, 'index.md');
    if (!fs.existsSync(idxPath)) continue;
    const { meta, body } = fm.parseFrontmatter(fs.readFileSync(idxPath, 'utf8'));

    // every stated-view: topic + confidence from frontmatter, **Headline:** rendered when present
    const svDir = path.join(figDir, 'stated-views');
    const views = [];
    if (fs.existsSync(svDir)) {
      for (const f of fs.readdirSync(svDir).filter((x) => x.endsWith('.md'))) {
        try {
          const sv = fm.parseFrontmatter(fs.readFileSync(path.join(svDir, f), 'utf8'));
          const headline = sv.body.match(/\*\*Headline:([\s\S]*?)\*\*/);
          views.push({
            slug: f.replace(/\.md$/, ''),
            topic: sv.meta.topic || f.replace(/\.md$/, ''),
            headlineHtml: headline ? renderMd(`**${headline[1].trim()}**`) : null,
            isMemory: /memory/.test(f),
          });
        } catch { /* skip unparsable view — forgiving */ }
      }
    }
    // memory view leads (this is the memory cockpit), then headline'd views, then the rest
    views.sort((a, b) => (b.isMemory - a.isMemory) || ((b.headlineHtml ? 1 : 0) - (a.headlineHtml ? 1 : 0)) || a.topic.localeCompare(b.topic));
    const lead = views.find((v) => v.isMemory);
    const statedHtml = lead?.headlineHtml
      || (lead ? renderMd(fm.parseFrontmatter(fs.readFileSync(path.join(svDir, `${lead.slug}.md`), 'utf8')).body.split('\n## ')[0].split('\n').slice(-3).join('\n')) : null);

    // DELTA: the index's overlap/diverge section
    const deltaSec = body.match(/^## Where the lens overlaps[\s\S]*?(?=^## |$(?![\s\S]))/m);
    const deltaHtml = deltaSec ? renderMd(deltaSec[0].replace(/^## .*$/m, '').trim()) : null;

    const hasMethod = ['method.md', 'framework.md'].find((f) => fs.existsSync(path.join(figDir, f)));
    const relReports = reports().filter((r) => r.base.includes(d.name.split('-').pop()));
    out.push({
      slug: d.name, name: meta.figure || d.name, updated: meta.updated || null,
      statedHtml,
      moreViews: views.filter((v) => v !== lead && v.headlineHtml).map((v) => ({ slug: v.slug, topic: v.topic, headlineHtml: v.headlineHtml })),
      deltaHtml,
      chips: [
        ...(hasMethod ? [{ label: `${hasMethod.replace('.md', '')} (the reasoning engine)`, goto: `#/page/${hasMethod.replace('.md', '')}` }] : []),
        ...views.map((v) => ({ label: `${v.slug} (stated view)`, goto: `#/page/${v.slug}` })),
        ...relReports.map((r) => ({ label: `${r.base.replace(/^\d{4}-\d{2}-\d{2}-/, '')} (report)`, goto: '#/reports' })),
      ],
    });
  }
  return out;
}

// ---------- cockpit read (the daily front door — pure aggregation over the vault) ----------
// Anthony's "open it first each morning" page. Derives ENTIRELY from existing vault artifacts
// (reports, log, figure-brains, catalysts, risks, street) at request time — no new curated
// dataset, so it inherits their refresh cadence and adds zero maintenance. Decision-support
// only: it SURFACES what's already authored (the house stance is quoted + attributed; nothing
// here is a generated opinion, target, or reco), and never writes a view.
export function cockpitRead() {
  const st = stance();
  const allRisks = risks();
  const active = allRisks.filter((r) => r.status && r.status !== 'INTACT');

  // A) freshest vault activity — merged recency feed across the AUTHORED surfaces. Substantive
  // changes only: reports, figure-brains, and real log events — the high-frequency 'sync' churn
  // (RSS trimming, spot-price ticks) is plumbing already reflected in the top-bar sync chip, and
  // a risk's file-updated date is not a "changed today" signal (current risk state lives in C).
  const changes = [];
  for (const r of reports().slice(0, 4)) changes.push({ date: r.date, kind: 'report', text: r.title, goto: '#/reports' });
  for (const l of logTail(16)) if (l.kind !== 'sync') changes.push({ date: l.date, kind: l.kind, text: l.text, goto: '#/log' });
  for (const f of analysts()) if (f.updated) changes.push({ date: f.updated, kind: 'figure', text: `${f.name} — figure-brain`, goto: '#/analysts' });
  changes.sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
  const whatsNew = changes.slice(0, 10);

  // B) upcoming catalysts — verbatim from wiki/catalysts.md (curated chronological order)
  const nextUp = (catalysts().rows || []).filter((r) => r.section === 'upcoming').slice(0, 7)
    .map((r) => ({ date: r.date, name: r.name, nameSlug: r.nameSlug || null, event: r.event, why: r.why, conf: r.conf }));

  // C) live disagreements — where the base case faces pressure / the lenses split (all authored)
  const str = street();
  const forks = str.available ? (str.forks || []) : [];
  const lenses = analysts().map((f) => ({ name: f.name, updated: f.updated, goto: '#/analysts' }));

  return {
    asOf: st.updated || null,
    house: {
      confirmed: st.confirmed, confirmedDate: st.confirmedDate,
      line: st.line, horizon: st.horizon || null,
      chip: active.some((r) => r.status === 'FIRED') ? 'LONG · TRIGGERED' : 'LONG · INTACT',
    },
    register: {
      total: allRisks.length,
      fired: allRisks.filter((r) => r.status === 'FIRED').length,
      watch: allRisks.filter((r) => r.status === 'WATCH').length,
    },
    whatsNew,
    nextUp,
    disagreements: {
      active: active.map((r) => ({ sec: r.sec, name: r.name, status: r.status, summary: r.summary, goto: `#/risk/${r.id}` })),
      streetVerdict: str.available ? (str.read?.verdict || null) : null,
      forks: forks.map((f) => ({ topic: f.topic, bull: f.bull, bear: f.bear })),
      lenses,
    },
  };
}

// ---------- background primer (wiki/background/*.md — vault-defined chapters) ----------
export function background() {
  const dir = path.join(VAULT_DIR, 'wiki', 'background');
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.md'))) {
    try {
      const { meta } = fm.parseFrontmatter(fs.readFileSync(path.join(dir, f), 'utf8'));
      out.push({
        slug: f.replace(/\.md$/, ''),
        order: Number.isInteger(meta.order) ? meta.order : 99,
        name: meta.name || f.replace(/\.md$/, ''),
        summary: meta.summary || '',
        updated: meta.updated || null,
      });
    } catch { /* skip unparsable chapter — forgiving */ }
  }
  return out.sort((a, b) => a.order - b.order);
}

// ---------- reader ----------
export function readerPage(slug) {
  const p = resolveSlug(slug);
  if (!p) return null;
  return {
    slug: p.slug, name: p.name, rel: p.rel, updated: p.updated, type: p.type,
    isHouseView: p.rel === 'house-view.md',
    html: renderMd(p.body),
    backlinks: backlinksLocal(p.slug),
  };
}
function backlinksLocal(slug) {
  const s = slug.toLowerCase();
  return scanVault().pages.filter((p) => p.links.some((l) => l.toLowerCase() === s)).map((p) => ({ slug: p.slug, name: p.name }));
}

// ---------- ⌘K ----------
export function searchIndex() {
  const out = [];
  out.push({ kind: 'read', label: 'Cockpit Read — daily front door', sub: 'freshest changes · catalysts · disagreements', goto: '#/cockpit' });
  for (const r of risks()) out.push({ kind: 'risk', label: `§${r.sec} ${r.name}`, sub: r.status, goto: `#/risk/${r.id}` });
  for (const b of background()) out.push({ kind: 'primer', label: b.name, sub: b.summary.slice(0, 40), goto: `#/page/${b.slug}` });
  for (const s of registry().series) out.push({ kind: 'series', label: s.label, sub: s.id, goto: `#/data` });
  for (const d of desks()) out.push({ kind: 'desk', label: d.name, sub: 'desk', goto: `#/desks/${d.id}` });
  for (const [slug] of COMPANY_ORDER) { const p = resolveSlug(slug); if (p) out.push({ kind: 'company', label: p.name, sub: slug, goto: `#/page/${slug}` }); }
  for (const r of reports()) out.push({ kind: 'report', label: r.title, sub: r.date, goto: `#/reports` });
  const str = street();
  if (str.available) {
    out.push({ kind: 'street', label: 'Street Read — firm models', sub: 'MU · SK Hynix · Samsung', goto: `#/street` });
    for (const c of str.companies) out.push({ kind: 'street', label: `${c.name} — Street models`, sub: `${c.derived.nFirms} desks`, goto: `#/street` });
  }
  const mg = margins();
  if (mg.available) out.push({ kind: 'margins', label: 'Margins — HBM/DRAM operating margin', sub: 'official + estimates', goto: `#/margins` });
  const lev = leverageMonitor();
  if (lev.available) out.push({ kind: 'leverage', label: 'Leverage Monitor — SK Hynix / Samsung gap-risk', sub: 'margin · 2× ETFs · trigger map', goto: `#/leverage` });
  const nc = dramNowcast();
  if (nc.available) out.push({ kind: 'nowcast', label: 'DRAM Revenue Nowcast — own-brain model', sub: `${nc.status} · v${nc.modelVersion} · research data point`, goto: `#/nowcast` });
  for (const p of scanVault().pages) out.push({ kind: 'page', label: p.name, sub: p.rel, goto: `#/page/${encodeURIComponent(p.slug)}` });
  return out;
}
