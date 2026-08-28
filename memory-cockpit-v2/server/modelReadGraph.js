// modelReadGraph.js — mechanical numbers-graph from a working-model snapshot.
// Jail for model_read: prose may only cite these cells. Never invents consensus / PT.
// Decision-support only. Ticker-agnostic — no per-desk forks.
import fs from 'fs';
import path from 'path';

export const MODEL_READ_GRAPH_VERSION = 1;

export const MODEL_READ_ORDER = [
  'thermometer',
  'print-vs-guide',
  'quality',
  'new-guide',
  'still-gap',
  'next-print',
];

export function formatModelReadOrder(order) {
  const o = Array.isArray(order) ? order.map((s) => String(s || '').trim()).filter(Boolean) : [];
  return o.join(' · ');
}

export function isGapValue(v) {
  const s = v == null ? '' : String(v).trim();
  return !s || /^gap$/i.test(s);
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

function layerOf(row) {
  const L = str(row?.layer).toLowerCase();
  if (L) return L;
  const src = str(row?.source).toLowerCase();
  if (src === 'user' || src === 'paste' || src === 'gap') return 'user_case';
  if (src === 'pack') return 'pack_actual';
  return 'mixed';
}

/** Parse the first number in a model cell. Keeps native units (B stays B, % stays %). */
export function parseNumeric(value, unit) {
  const blob = `${value == null ? '' : value} ${unit || ''}`;
  const m = String(blob).replace(/,/g, '').match(/(-?\d+(?:\.\d+)?)/);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

export function parseBandPct(value, unit, note) {
  const blob = `${value || ''} ${unit || ''} ${note || ''}`;
  const m = blob.match(/±\s*(\d+(?:\.\d+)?)\s*%/i);
  if (!m) return null;
  const n = Number(m[1]);
  return Number.isFinite(n) ? n : null;
}

/**
 * Fiscal period from a label/note. { q: 1-4|null, fy: number|null, key }
 */
export function parsePeriod(text) {
  const s = String(text || '');
  const q = s.match(/\bQ\s*([1-4])\s*FY\s*(\d{4})\b/i)
    || s.match(/\bFY\s*(\d{4})\s*Q\s*([1-4])\b/i);
  if (q) {
    const fy = Number(q[2].length === 4 ? q[2] : q[1]);
    const qq = Number(q[2].length === 4 ? q[1] : q[2]);
    if (Number.isFinite(fy) && qq >= 1 && qq <= 4) {
      return { q: qq, fy, key: `Q${qq} FY${fy}` };
    }
  }
  const fyOnly = s.match(/\bFY\s*(\d{4})\b/i);
  if (fyOnly) {
    const fy = Number(fyOnly[1]);
    if (Number.isFinite(fy)) return { q: null, fy, key: `FY${fy}` };
  }
  return null;
}

export function periodKey(p) {
  if (!p) return null;
  if (p.q) return `Q${p.q} FY${p.fy}`;
  if (p.fy) return `FY${p.fy}`;
  return null;
}

export function prevQuarter(p) {
  if (!p?.q || !p.fy) return null;
  if (p.q === 1) return { q: 4, fy: p.fy - 1, key: `Q4 FY${p.fy - 1}` };
  return { q: p.q - 1, fy: p.fy, key: `Q${p.q - 1} FY${p.fy}` };
}

/** “printed above prior $78B ±2% guide” */
export function parsePriorGuide(note) {
  const s = String(note || '');
  const m = s.match(/prior\s+\$?\s*([\d.]+)\s*B?\s*±\s*([\d.]+)\s*%/i);
  if (!m) return null;
  const mid = Number(m[1]);
  const band = Number(m[2]);
  if (!Number.isFinite(mid) || !Number.isFinite(band)) return null;
  return { mid, band_pct: band };
}

function bandEdges(mid, bandPct) {
  if (mid == null || bandPct == null) return { low: null, high: null };
  const w = Math.abs(mid) * (bandPct / 100);
  return { low: mid - w, high: mid + w };
}

/**
 * In-line = inside the company's published band when they gave ±N%.
 * If no band, Daloopa default ±1% of midpoint.
 */
export function classifyVsGuide(actual, mid, bandPct) {
  if (actual == null || mid == null) return 'bar_only';
  const pct = bandPct == null ? 1 : bandPct;
  const { low, high } = bandEdges(mid, pct);
  if (actual > high) return 'beat';
  if (actual < low) return 'miss';
  return 'in-line';
}

function vsMidPct(actual, mid) {
  if (actual == null || mid == null || mid === 0) return null;
  return ((actual - mid) / Math.abs(mid)) * 100;
}

function cellFromAssumption(a) {
  if (!a || typeof a !== 'object') return null;
  const id = str(a.id);
  const label = str(a.label || a.name || a.driver);
  if (!id && !label) return null;
  const unit = str(a.unit) || null;
  const value = a.value == null ? '' : String(a.value);
  const note = str(a.note) || null;
  const period = parsePeriod(`${label} ${note || ''}`);
  return {
    id: id || label.toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 48),
    label: label || id,
    value,
    unit,
    layer: layerOf(a),
    source: str(a.source) || null,
    note,
    watch_risk: str(a.watch_risk) || null,
    watch_label: str(a.watch_label) || null,
    numeric: isGapValue(value) ? null : parseNumeric(value, unit),
    band_pct: parseBandPct(value, unit, note),
    period: period ? period.key : null,
    period_parts: period,
    gap: isGapValue(value),
  };
}

function scoreThermometer(cell, all) {
  if (!cell || cell.gap) return -1;
  if (cell.layer === 'user_case') return -1;
  const lab = `${cell.label} ${cell.note || ''}`.toLowerCase();
  let s = 0;
  if (cell.layer === 'pack_guide' && cell.period_parts?.q) s += 55;
  if (cell.layer === 'pack_actual' && /\brevenue\b/.test(lab) && cell.period_parts?.q) s += 48;
  if (cell.layer === 'pack_actual' && /\brevenue\b/.test(lab) && !cell.period_parts?.q) s += 28;
  if (/\bdata center\b|\bdatacenter\b/.test(lab) && cell.layer === 'pack_actual') s += 36;
  if (cell.layer === 'pack_guide') s += 12;
  if (typeof cell.numeric === 'number') {
    const max = Math.max(0, ...all.filter((c) => c.layer === 'pack_actual' && typeof c.numeric === 'number').map((c) => c.numeric));
    if (max > 0 && cell.numeric === max) s += 8;
  }
  if (cell.layer === 'mixed') s -= 15;
  if (cell.layer === 'structural') s -= 8;
  return s;
}

function thermometerWhy(cell) {
  const lab = `${cell.label}`.toLowerCase();
  if (cell.layer === 'pack_guide') return 'This is the next bar the company published — homework, not a result.';
  if (/\bdata center\b|\bdatacenter\b/.test(lab)) return 'Largest slice of the company — if this slows, the whole print slows.';
  if (/\brevenue\b/.test(lab) && cell.period_parts?.q) return 'Last printed company sales — the number you score against last quarter’s guide.';
  if (/\brevenue\b/.test(lab)) return 'Last full-year company sales — the scale of the business.';
  return 'Load-bearing pack line on this Model.';
}

function qualityFlags(cells) {
  const flags = [];
  const china = cells.filter((c) => /china/i.test(`${c.label} ${c.note || ''}`));
  for (const c of china) {
    if (c.numeric === 0 || /^0\b/.test(String(c.value))) {
      flags.push({
        id: 'china_zero',
        cell_id: c.id,
        kind: 'exclusion',
        text: `${c.label} is ${c.value}${c.unit ? ` ${c.unit}` : ''}. If a year-ago amount is in the note, the beat is without that slice.`,
      });
    }
  }
  const compute = cells.find((c) => /\bcompute\b/i.test(c.label) && c.layer === 'pack_actual');
  const net = cells.find((c) => /\bnetwork/i.test(c.label) && c.layer === 'pack_actual');
  if (compute && net) {
    flags.push({
      id: 'mix_compute_networking',
      cell_id: compute.id,
      kind: 'mix',
      text: `Pack splits Data Center into compute (${compute.value}) and networking (${net.value}). That is mix, not units × price.`,
    });
  }
  const hasUnits = cells.some((c) => /\b(units?|asp|average selling)\b/i.test(c.label));
  if (!hasUnits) {
    flags.push({
      id: 'volume_price_gap',
      cell_id: null,
      kind: 'gap',
      text: 'Model has no units × ASP split. Do not invent “sold more chips” vs “charged more.”',
    });
  }
  const gm = cells.find((c) => /\bgross margin\b|\bgm\b/i.test(c.label) && c.layer === 'pack_actual' && c.period_parts?.q);
  const gmFy = cells.find((c) => /\bgross margin\b|\bgm\b/i.test(c.label) && c.layer === 'pack_actual' && !c.period_parts?.q);
  if (gm) {
    flags.push({
      id: 'margin_print',
      cell_id: gm.id,
      kind: 'margin',
      text: gmFy
        ? `${gm.label} is ${gm.value}${gm.unit || ''} vs full-year ${gmFy.value}${gmFy.unit || ''}. One quarter is a print, not a floor.`
        : `${gm.label} is ${gm.value}${gm.unit || ''}. One quarter is a print, not a floor.`,
    });
  }
  const ocf = cells.find((c) => /\boperating cash\b|\bocf\b/i.test(c.label));
  const commit = cells.find((c) => /\bcommit/i.test(c.label) || /\bsupply/i.test(c.label));
  if (ocf && commit) {
    flags.push({
      id: 'cash_vs_commit',
      cell_id: ocf.id,
      kind: 'cash',
      text: `${ocf.label} ${ocf.value}${ocf.unit ? ` ${ocf.unit}` : ''} sits next to ${commit.label} ${commit.value}${commit.unit ? ` ${commit.unit}` : ''}. Cash and a bill — not a thesis.`,
    });
  }
  return flags;
}

function completedPairsFromNotes(cells) {
  const pairs = [];
  for (const c of cells) {
    if (c.layer !== 'pack_actual' || c.gap || c.numeric == null) continue;
    const prior = parsePriorGuide(c.note);
    if (!prior) continue;
    const { low, high } = bandEdges(prior.mid, prior.band_pct);
    const cls = classifyVsGuide(c.numeric, prior.mid, prior.band_pct);
    const src = c.period_parts ? prevQuarter(c.period_parts) : null;
    pairs.push({
      id: `print_${c.id}`,
      kind: 'completed',
      guide_cell_id: null,
      actual_cell_id: c.id,
      guide_source_period: src ? src.key : null,
      applies_to_period: c.period,
      guide_mid: prior.mid,
      guide_band_pct: prior.band_pct,
      guide_low: low,
      guide_high: high,
      actual: c.numeric,
      vs_mid_pct: vsMidPct(c.numeric, prior.mid),
      vs_band: cls,
      note: c.note,
    });
  }
  return pairs;
}

function openGuidePairs(cells, takenActuals) {
  const pairs = [];
  for (const g of cells) {
    if (g.layer !== 'pack_guide' || g.gap || g.numeric == null) continue;
    const actual = cells.find((c) => (
      c.layer === 'pack_actual'
      && !c.gap
      && c.period
      && c.period === g.period
      && /\brevenue\b/i.test(`${c.label} ${g.label}`) === /\brevenue\b/i.test(c.label)
    ));
    // Same-period actual would be treating the new guide as a result — refuse.
    if (actual && takenActuals.has(actual.id)) {
      /* already scored via note */
    }
    const { low, high } = bandEdges(g.numeric, g.band_pct == null ? 2 : g.band_pct);
    pairs.push({
      id: `bar_${g.id}`,
      kind: 'open_bar',
      guide_cell_id: g.id,
      actual_cell_id: null,
      guide_source_period: g.period,
      applies_to_period: g.period,
      guide_mid: g.numeric,
      guide_band_pct: g.band_pct,
      guide_low: low,
      guide_high: high,
      actual: null,
      vs_mid_pct: null,
      vs_band: 'bar_only',
      note: g.note,
    });
  }
  return pairs;
}

/**
 * @param {object|null} snapshot working-model JSON
 * @param {{ ticker?: string, house_excerpt?: string|null }} [opts]
 */
export function buildNumbersGraph(snapshot, opts = {}) {
  const ticker = str(opts.ticker || snapshot?.ticker).toUpperCase();
  const assumptions = Array.isArray(snapshot?.assumptions) ? snapshot.assumptions : [];
  const cells = assumptions.map(cellFromAssumption).filter(Boolean);
  if (!cells.length) {
    return {
      schema_version: MODEL_READ_GRAPH_VERSION,
      ok: false,
      reason: 'No working model cells — UPDATE MODEL first',
      ticker: ticker || null,
      as_of: snapshot?.as_of || null,
      built_at: new Date().toISOString(),
      cells: [],
      offset_pairs: [],
      thermometer: [],
      quality_flags: [],
      still_gap: [],
      variance: [],
      house_excerpt: opts.house_excerpt || snapshot?.house_touch || null,
      order: MODEL_READ_ORDER,
      decision_support_only: true,
    };
  }

  const completed = completedPairsFromNotes(cells);
  const taken = new Set(completed.map((p) => p.actual_cell_id).filter(Boolean));
  const open = openGuidePairs(cells, taken);
  const offset_pairs = [...completed, ...open];

  const ranked = cells
    .map((c) => ({ c, s: scoreThermometer(c, cells) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s);
  const seen = new Set();
  const thermometer = [];
  for (const { c } of ranked) {
    if (seen.has(c.id)) continue;
    seen.add(c.id);
    thermometer.push({ id: c.id, label: c.label, value: c.value, unit: c.unit, layer: c.layer, why: thermometerWhy(c) });
    if (thermometer.length >= 3) break;
  }

  const still_gap = cells
    .filter((c) => c.layer === 'user_case' && c.gap)
    .map((c) => ({ id: c.id, label: c.label, layer: c.layer, unit: c.unit }));

  const variance = Array.isArray(snapshot?.variance)
    ? snapshot.variance.map((v) => ({
      line: str(v.line),
      prior: str(v.prior),
      current: str(v.current),
      delta: str(v.delta),
      comment: str(v.comment),
    })).filter((v) => v.line)
    : [];

  return {
    schema_version: MODEL_READ_GRAPH_VERSION,
    ok: true,
    reason: null,
    ticker: ticker || null,
    as_of: snapshot?.as_of || null,
    built_at: new Date().toISOString(),
    cells,
    offset_pairs,
    thermometer,
    quality_flags: qualityFlags(cells),
    still_gap,
    variance,
    gaps: Array.isArray(snapshot?.gaps) ? snapshot.gaps.map((g) => str(g)).filter(Boolean) : [],
    house_excerpt: opts.house_excerpt || snapshot?.house_touch || null,
    order: MODEL_READ_ORDER,
    forbidden: ['consensus as bar', 'price target', 'buy/sell/hold', 'invented ASP/units'],
    decision_support_only: true,
  };
}

export function writeNumbersGraph(runDir, graph) {
  if (!runDir) return null;
  fs.mkdirSync(runDir, { recursive: true });
  const filePath = path.join(runDir, 'numbers-graph.json');
  const tmp = `${filePath}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, `${JSON.stringify(graph, null, 2)}\n`, 'utf8');
  fs.renameSync(tmp, filePath);
  return filePath;
}

export function readNumbersGraph(runDir) {
  if (!runDir) return null;
  const filePath = path.join(runDir, 'numbers-graph.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Fail-closed: complete model_read needs a graph on disk. */
export function modelReadGraphViolations(runDir) {
  const errors = [];
  const g = readNumbersGraph(runDir);
  if (!g) {
    errors.push('model_read: numbers-graph.json missing — refuse to invent');
    return errors;
  }
  if (g.ok === false) {
    errors.push(`model_read: graph not ok (${g.reason || 'empty model'})`);
  }
  if (!Array.isArray(g.cells) || !g.cells.length) {
    errors.push('model_read: graph has no cells');
  }
  return errors;
}

export function modelReadOutputViolations(runDir) {
  const errors = [];
  if (!runDir) {
    errors.push('model_read: run folder missing');
    return errors;
  }
  const out = path.join(runDir, 'output');
  let names = [];
  try {
    names = fs.readdirSync(out).filter((n) => !n.startsWith('.'));
  } catch {
    errors.push('model_read: output/ missing');
    return errors;
  }
  const hasPdf = names.some((n) => n.toLowerCase().endsWith('.pdf'));
  const hasHtml = names.some((n) => n.toLowerCase().endsWith('.html'));
  if (!hasPdf && !hasHtml) {
    errors.push('model_read: output/ needs a PDF (or HTML if Chrome unavailable)');
  }
  return errors;
}

export function modelReadOrderViolations(order) {
  const got = Array.isArray(order) ? order.map((s) => String(s || '').trim()).filter(Boolean) : [];
  const want = MODEL_READ_ORDER;
  if (got.length && got.join(',') !== want.join(',')) {
    return [`model_read: ORDER must be ${want.join(' · ')} (got ${got.join(' · ') || 'empty'})`];
  }
  return [];
}
