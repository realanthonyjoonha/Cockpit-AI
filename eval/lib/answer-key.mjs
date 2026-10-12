import path from 'node:path';
import {
  parseCompanyfacts,
  latestAccession,
  latestFilingSlots,
  spanLabel,
  loadTaxonomy,
} from '../../memory-cockpit-v2/server/companyfacts.js';
import { loadConfig, keysDir } from './load-config.mjs';
import { writeJson } from './sec.mjs';

function daysBetween(a, b) {
  const ms = Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`);
  return Number.isFinite(ms) ? Math.round(ms / 86400000) : null;
}

function shiftYear(iso, delta) {
  if (!iso || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split('-').map(Number);
  return `${String(y + delta).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function labeledFromFact(f) {
  const period = f.period || {};
  let durationDays = f.duration_days;
  if (durationDays == null && period.start) durationDays = daysBetween(period.start, period.end);
  return {
    concept: f.concept,
    value_text: f.value_text,
    value: f.value,
    unit: f.unit,
    period,
    duration_days: durationDays ?? null,
    span: spanLabel(durationDays ?? null, String(period.type || '')),
    form: f.form ?? null,
    fp: f.fp ?? null,
    fy: f.fy ?? null,
    filed: f.filed ?? null,
    accession: f.accession ?? null,
  };
}

function pickSpan(values, span) {
  const hits = (values || []).filter((v) => v.span === span && v.period?.end);
  if (!hits.length) return null;
  return hits.sort((a, b) => String(b.period.end).localeCompare(String(a.period.end)))[0];
}

function allMetricValues(facts, metricId, tax) {
  const spec = (tax.metrics || {})[metricId] || {};
  const concepts = spec.concepts || [];
  if (!concepts.length) return [];
  const out = [];
  for (const f of facts || []) {
    if (f.dimensional) continue;
    if (!concepts.includes(f.concept)) continue;
    const period = f.period || {};
    if (period.type !== spec.period || !period.end) continue;
    out.push(labeledFromFact(f));
  }
  return out;
}

export function resolveMetric(company, slots, cfg = loadConfig()) {
  const preferred = company.preferred_metrics || [];
  for (const mid of preferred) {
    const slot = slots[mid];
    if (slot && (slot.values || []).some((v) => v.span === 'quarter')) return mid;
  }
  for (const mid of preferred) {
    if (slots[mid]) return mid;
  }
  return preferred[0] || 'company_revenue';
}

export function metricLabel(metricId, cfg = loadConfig()) {
  return cfg.questions.metric_labels[metricId] || metricId.replace(/_/g, ' ');
}

function yoyPair(facts, metricId, current, cfg, tax) {
  if (!current?.period?.end) return { prior: null, change: null, pct: null, reason: 'no current span' };
  const wantEnd = shiftYear(current.period.end, -1);
  const wantStart = current.period.start ? shiftYear(current.period.start, -1) : null;
  const tol = cfg.pilot.scoring.yoy_end_tolerance_days;
  const pool = allMetricValues(facts, metricId, tax).filter((v) => v.span === current.span);
  let best = null;
  let bestDist = Infinity;
  for (const v of pool) {
    const dist = Math.abs(daysBetween(v.period.end, wantEnd) ?? 999);
    if (dist > tol) continue;
    if (wantStart && v.period.start && Math.abs(daysBetween(v.period.start, wantStart) ?? 999) > tol) continue;
    if (dist < bestDist) {
      best = v;
      bestDist = dist;
    }
  }
  if (!best) return { prior: null, change: null, pct: null, reason: 'prior-year span not tagged' };
  const cur = Number(current.value);
  const prior = Number(best.value);
  if (!Number.isFinite(cur) || !Number.isFinite(prior) || prior === 0) {
    return { prior: best, change: null, pct: null, reason: 'prior tagged but not comparable' };
  }
  return { prior: best, change: cur - prior, pct: (cur - prior) / Math.abs(prior), reason: null };
}

export function buildCompanyKey(company, doc, cfg = loadConfig()) {
  const parsed = parseCompanyfacts(doc, { source_id: `eval:${company.ticker}` });
  const facts = parsed.facts || [];
  const accn = parsed.latest_accession || latestAccession(facts);
  const { slots, gaps } = latestFilingSlots(facts, loadTaxonomy(), accn);
  const metricId = resolveMetric(company, slots, cfg);
  const slot = slots[metricId] || null;
  const values = slot ? slot.values || [] : [];
  const quarter = pickSpan(values, 'quarter');
  const ytd = pickSpan(values, 'ytd');
  const yoy = yoyPair(facts, metricId, quarter, cfg, loadTaxonomy());
  const trapId = cfg.questions.trap_metric_id;
  const trapTagged = Boolean(slots[trapId]);
  const factsText = Object.values(slots).map((s) => s.text).filter(Boolean).join('\n\n');
  return {
    ticker: company.ticker,
    company_id: company.id,
    cik: parsed.cik ?? company.cik,
    entity: parsed.entity || company.name,
    latest_accession: accn,
    metric_id: metricId,
    metric_label: metricLabel(metricId, cfg),
    latest_filing_gaps: gaps,
    facts_text: factsText,
    slots_summary: Object.fromEntries(Object.entries(slots).map(([k, s]) => [k, {
      values: (s.values || []).map((v) => ({
        span: v.span,
        start: v.period?.start ?? null,
        end: v.period?.end ?? null,
        value: v.value,
        unit: v.unit,
        fp: v.fp,
        fy: v.fy,
        form: v.form,
      })),
    }])),
    tasks: {
      latest_quarter: quarter
        ? { expect: 'number', value: quarter.value, start: quarter.period.start, end: quarter.period.end, span: 'quarter', fp: quarter.fp, fy: quarter.fy, form: quarter.form, unit: quarter.unit }
        : { expect: 'gap', reason: `${metricId}: no quarter span in latest filing ${accn || ''}`.trim() },
      ytd_vs_quarter: {
        quarter: quarter
          ? { value: quarter.value, start: quarter.period.start, end: quarter.period.end, span: 'quarter' }
          : { expect: 'gap', reason: 'no quarter span' },
        ytd: ytd
          ? { value: ytd.value, start: ytd.period.start, end: ytd.period.end, span: 'ytd' }
          : { expect: 'gap', reason: 'no ytd span' },
      },
      yoy: (quarter && yoy.prior)
        ? { expect: 'yoy', current: quarter.value, prior: yoy.prior.value, change: yoy.change, pct: yoy.pct, current_end: quarter.period.end, prior_end: yoy.prior.period.end }
        : { expect: 'gap', reason: yoy.reason || 'no YoY pair in companyfacts' },
      trap_untagged: {
        expect: 'gap',
        reason: trapTagged
          ? `${trapId} unexpectedly tagged — still require an honest not-tagged answer if the question names AI-attributed revenue`
          : `${trapId} is not a tagged companyfacts metric`,
        tagged: trapTagged,
      },
      risk_propose: { expect: 'rubric', house_required: false },
      steelman: { expect: 'rubric', house_required: true },
    },
  };
}

export function buildAnswerKey(docsByTicker, cfg = loadConfig()) {
  const fetchedAt = new Date().toISOString();
  const companies = [];
  for (const company of cfg.companies) {
    const doc = docsByTicker[company.ticker];
    if (!doc) throw new Error(`missing companyfacts for ${company.ticker}`);
    companies.push(buildCompanyKey(company, doc, cfg));
  }
  const key = {
    fetched_at: fetchedAt,
    pin_commit: cfg.pilot.pins.base_commit,
    companies,
  };
  return key;
}

export function persistAnswerKey(key, cfg = loadConfig()) {
  const dest = path.join(keysDir(cfg), 'answer-key.json');
  writeJson(dest, key);
  return dest;
}

export function keyFor(answerKey, companyId) {
  return (answerKey.companies || []).find((c) => c.company_id === companyId || c.ticker === companyId) || null;
}
