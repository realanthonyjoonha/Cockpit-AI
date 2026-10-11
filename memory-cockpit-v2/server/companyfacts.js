// companyfacts.js — JS mirror of ontology/api/companyfacts.py (same taxonomy JSON).
// Parse a local SEC companyfacts cache. No network. No model. No writes.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_ONTOLOGY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ontology');
const ALLOWED_FORMS = new Set(['10-K', '10-Q', '20-F', '40-F', '6-K', '10-KT']);
const ANNUAL_FORMS = new Set(['10-K', '20-F', '40-F', '10-KT']);
const INTERIM_FORMS = new Set(['10-Q', '6-K']);
const QUARTER_FP = new Set(['Q1', 'Q2', 'Q3']);
const ISO4217 = /^[A-Z]{3}$/;
const TAXONOMIES = ['us-gaap', 'ifrs-full'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
export const STALE_DAYS = 730;

export const MISSING_CACHE = 'companyfacts cache missing; headline slots empty';
export const UNREADABLE = 'companyfacts cache unreadable';
export const STRUCTURED_GAP = (mid) => `${mid}: not reported in structured data`;
export const STALE_GAP = (mid, end) => `${mid}: stale: last reported ${end}`;

let taxonomyCache = null;

export function loadTaxonomy(ontologyRoot) {
  if (taxonomyCache && !ontologyRoot) return taxonomyCache;
  try {
    const root = ontologyRoot || process.env.ONTOLOGY_ROOT || DEFAULT_ONTOLOGY;
    taxonomyCache = JSON.parse(readFileSync(path.join(root, 'schema', 'taxonomy_xbrl.json'), 'utf8'));
  } catch {
    taxonomyCache = { namespaces: {}, metrics: {} };
  }
  return taxonomyCache;
}

export function canonicalMetric(metricId, taxonomy = null) {
  const spec = ((taxonomy || loadTaxonomy()).metrics || {})[metricId] || {};
  return spec.alias_of ? String(spec.alias_of) : metricId;
}

export function sentenceFillAllowed(metricId, taxonomy = null) {
  const spec = ((taxonomy || loadTaxonomy()).metrics || {})[canonicalMetric(metricId, taxonomy)] || {};
  if ((spec.concepts && spec.concepts.length) || (spec.fallback && spec.fallback.length)) return false;
  return spec.sentence_fill !== false;
}

export function structuredMetric(metricId, taxonomy = null) {
  const spec = ((taxonomy || loadTaxonomy()).metrics || {})[metricId] || {};
  if (spec.alias_of) return true;
  return Boolean((spec.concepts && spec.concepts.length) || (spec.fallback && spec.fallback.length));
}

export function conceptIndex(taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const idx = {};
  for (const [mid, spec] of Object.entries(tax.metrics || {})) {
    if (spec.alias_of) continue;
    for (const concept of [...(spec.concepts || []), ...(spec.fallback || [])]) {
      if (!idx[concept]) idx[concept] = mid;
      const local = concept.split(':').pop();
      if (!idx[local]) idx[local] = mid;
    }
  }
  return idx;
}

function local(name) {
  const parts = String(name).split(':');
  return parts[parts.length - 1];
}

export function valueText(val) {
  if (val == null || typeof val === 'boolean') return null;
  const f = Number(val);
  if (!Number.isFinite(f)) return null;
  if (typeof val === 'string') {
    const t = val.trim();
    if (/^-?\d+$/.test(t)) {
      const neg = t.startsWith('-');
      const body = t.replace(/^-/, '').replace(/^0+(?=\d)/, '') || '0';
      return `${neg && body !== '0' ? '-' : ''}${body}`;
    }
    if (/^-?\d+\.\d+$/.test(t)) {
      const s = t.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
      return s === '-0' ? '0' : s;
    }
  }
  if (Math.abs(f) < 2 ** 53 && Number.isInteger(f)) return `${Math.trunc(f)}`;
  const s = f.toFixed(12).replace(/0+$/, '').replace(/\.$/, '');
  return (s === '-0' || s === '') ? '0' : s;
}

export function toNumber(text) {
  return String(text).includes('.') ? Number(text) : parseInt(text, 10);
}

export function groupDigits(text) {
  const neg = String(text).startsWith('-');
  const s = String(text).replace(/^-/, '');
  const [ipRaw, fp] = s.split('.');
  let ip = ipRaw;
  let out = '';
  while (ip.length > 3) {
    out = `,${ip.slice(-3)}${out}`;
    ip = ip.slice(0, -3);
  }
  return `${neg ? '-' : ''}${ip}${out}${fp != null ? `.${fp}` : ''}`;
}

export function formFamily(form) {
  return String(form || '').split('/')[0].toUpperCase();
}

function days(start, end) {
  if (!start || !end) return 0;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return 0;
  return Math.round((b - a) / 86400000);
}

export function durationKind(n, fp, form, peerDays) {
  const family = formFamily(form);
  const fpU = String(fp || '').toUpperCase();
  const peers = (peerDays || []).map((p) => Number(p)).filter((p) => Number.isFinite(p));
  const longer = peers.some((p) => p > n + 14);
  const shorter = peers.some((p) => p < n - 14);
  if (longer && n <= 200) return 'quarter';
  if (shorter && n <= 340) return 'ytd';
  if (ANNUAL_FORMS.has(family) || fpU === 'FY') {
    if (n >= 300 || fpU === 'FY') return 'annual';
  }
  if (QUARTER_FP.has(fpU)) {
    if (n <= 130) return 'quarter';
    if (n <= 340) return 'ytd';
    return 'annual';
  }
  if (n >= 341) return 'annual';
  if (n >= 70 && n <= 130) return 'quarter';
  if (n >= 131 && n <= 340) return 'ytd';
  return 'other';
}

function unitKind(unit) {
  if (ISO4217.test(unit || '')) return 'currency';
  if (String(unit).endsWith('/shares') && ISO4217.test(String(unit).split('/')[0])) return 'per_share';
  if (unit === 'shares') return 'shares';
  return null;
}

function currencyOf(unit) {
  const kind = unitKind(unit);
  if (kind === 'currency') return unit;
  if (kind === 'per_share') return String(unit).split('/')[0];
  return null;
}

function unitOk(unit, kind) {
  return unitKind(unit) === kind;
}

function cmpTuple(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function parseCompanyfacts(doc, opts = {}) {
  const notes = [];
  if (!doc || typeof doc !== 'object' || !doc.facts || typeof doc.facts !== 'object') {
    return { facts: [], notes: [UNREADABLE], entity: null, cik: null };
  }
  const sourceId = opts.sourceId || null;
  const out = [];
  let order = 0;
  for (const tax of TAXONOMIES) {
    const group = doc.facts[tax];
    if (!group || typeof group !== 'object') continue;
    for (const [loc, node] of Object.entries(group)) {
      if (!node || typeof node !== 'object' || !node.units || typeof node.units !== 'object') continue;
      const concept = `${tax}:${loc}`;
      for (const [unit, points] of Object.entries(node.units)) {
        if (!Array.isArray(points) || !unitKind(unit)) continue;
        for (const raw of points) {
          if (!raw || typeof raw !== 'object') continue;
          const end = raw.end;
          if (typeof end !== 'string' || !DATE.test(end)) continue;
          const text = valueText(raw.val);
          if (text == null) continue;
          const form = String(raw.form || '');
          const family = formFamily(form);
          if (!ALLOWED_FORMS.has(family)) continue;
          if (!raw.accn || !raw.filed) continue;
          let start = typeof raw.start === 'string' ? raw.start : null;
          if (start && !DATE.test(start)) start = null;
          out.push({
            concept,
            value: toNumber(text),
            value_text: text,
            unit: String(unit),
            currency: currencyOf(String(unit)),
            period: { type: start ? 'duration' : 'instant', start, end },
            fy: Number.isInteger(raw.fy) ? raw.fy : null,
            fp: typeof raw.fp === 'string' ? raw.fp : null,
            form,
            filed: String(raw.filed),
            accession: String(raw.accn),
            dimensional: false,
            source_id: sourceId || `companyfacts:${raw.accn}`,
            order,
          });
          order += 1;
        }
      }
    }
  }
  return { facts: out, notes, entity: doc.entityName || null, cik: doc.cik ?? null };
}

export function cacheStatusGap(cacheFile) {
  try {
    const status = JSON.parse(readFileSync(path.join(path.dirname(cacheFile), 'companyfacts.status.json'), 'utf8'));
    return status && status.gap ? String(status.gap) : null;
  } catch {
    return null;
  }
}

export function loadCompanyfactsFile(filePath, opts = {}) {
  try {
    const doc = JSON.parse(readFileSync(filePath, 'utf8'));
    const parsed = parseCompanyfacts(doc, { sourceId: opts.sourceId || filePath });
    const gap = cacheStatusGap(filePath);
    if (gap && !parsed.notes.includes(gap)) parsed.notes.unshift(gap);
    return parsed;
  } catch {
    const gap = cacheStatusGap(filePath);
    return { facts: [], notes: [gap || UNREADABLE], entity: null, cik: null };
  }
}

export function mappedFacts(facts, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const known = new Set();
  for (const spec of Object.values(tax.metrics || {})) {
    if (spec.alias_of) continue;
    for (const c of [...(spec.concepts || []), ...(spec.fallback || [])]) known.add(c);
  }
  return (facts || []).filter((f) => known.has(f.concept) && !f.dimensional);
}

function periodDesc(p) {
  return p.type === 'duration' ? `${p.start} to ${p.end}` : String(p.end);
}

function periodLabel(p) {
  return p.type === 'duration' ? `${p.start}/${p.end}` : String(p.end);
}

function latestPeriodicEnd(facts) {
  let latest = '';
  for (const f of facts || []) {
    if (!ALLOWED_FORMS.has(formFamily(f.form))) continue;
    const end = f.period && f.period.end;
    if (end && end > latest) latest = end;
  }
  return latest || null;
}

export function factIsStale(end, latest) {
  return Boolean(end && latest && days(end, latest) > STALE_DAYS);
}

export function selectSlots(facts, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const slots = {};
  const stale = {};
  const latestPeriodic = latestPeriodicEnd(facts || []);
  for (const [mid, spec] of Object.entries(tax.metrics || {})) {
    if (spec.alias_of) continue;
    const primary = spec.concepts || [];
    const fallback = spec.fallback || [];
    const concepts = [...primary, ...fallback.filter((c) => !primary.includes(c))];
    if (!concepts.length) continue;
    const pool = (facts || []).filter((f) => !f.dimensional
      && f.period && f.period.type === spec.period
      && f.period.end
      && unitOk(String(f.unit || ''), String(spec.unit)));
    const cands = pool.filter((f) => concepts.includes(f.concept));
    if (!cands.length) continue;

    const groups = new Map();
    for (const f of cands) {
      const key = `${f.concept}|${f.period.start || ''}|${f.period.end}|${f.unit}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(f);
    }
    const winners = [];
    for (const rows of groups.values()) {
      rows.sort((a, b) => cmpTuple(
        [a.filed || '', a.accession || '', Number(a.order || 0)],
        [b.filed || '', b.accession || '', Number(b.order || 0)],
      ));
      const win = rows[rows.length - 1];
      let prior = null;
      for (let i = rows.length - 2; i >= 0; i--) {
        if (rows[i].value_text !== win.value_text) {
          prior = rows[i];
          break;
        }
      }
      winners.push([win, prior]);
    }
    const latestEnd = winners.reduce((acc, [w]) => (w.period.end > acc ? w.period.end : acc), '');
    const atEnd = winners.filter(([w]) => w.period.end === latestEnd);
    const families = new Set(atEnd.map(([w]) => formFamily(w.form)));
    const onlyAnnual = [...families].every((f) => ANNUAL_FORMS.has(f));
    const hasInterimForm = [...families].some((f) => INTERIM_FORMS.has(f));

    const kindOf = (w) => durationKind(
      days(w.period.start, w.period.end),
      w.fp,
      w.form,
      atEnd.filter(([o]) => o !== w).map(([o]) => days(o.period.start, o.period.end)),
    );
    const annualFormAnnual = atEnd.some(([w]) => ANNUAL_FORMS.has(formFamily(w.form)) && kindOf(w) === 'annual');
    const interim = hasInterimForm && !onlyAnnual && !annualFormAnnual;

    const rank = ([w]) => {
      const kind = kindOf(w);
      const dur = interim ? ({ quarter: 2, ytd: 1 }[kind] || 0) : (kind === 'annual' ? 2 : 0);
      const cidx = concepts.indexOf(w.concept);
      const n = days(w.period.start, w.period.end);
      const span = interim ? -n : n;
      return [-(cidx < 0 ? 99 : cidx), dur, span, w.filed || '', w.accession || ''];
    };
    const best = atEnd.reduce((acc, row) => (acc == null || cmpTuple(rank(row), rank(acc)) > 0 ? row : acc), null);
    const win = best[0];
    const restatedFrom = best[1];
    if (factIsStale(win.period.end, latestPeriodic)) {
      stale[mid] = win.period.end;
      continue;
    }
    let ytd = null;
    if (spec.period === 'duration' && kindOf(win) === 'quarter') {
      const ytdRows = atEnd
        .map(([w]) => w)
        .filter((w) => w.concept === win.concept && kindOf(w) === 'ytd');
      if (ytdRows.length) {
        ytd = ytdRows.reduce((acc, w) => (acc == null || cmpTuple([w.filed || '', w.accession || ''], [acc.filed || '', acc.accession || '']) > 0 ? w : acc), null);
      }
    }
    let text = `${local(win.concept)} ${win.unit} ${groupDigits(win.value_text)} for ${periodDesc(win.period)} (consolidated companyfacts`;
    let prior = null;
    if (restatedFrom) {
      text += `; restated from ${groupDigits(restatedFrom.value_text)}`;
      prior = {
        end: restatedFrom.period.end,
        value: restatedFrom.value,
        value_text: restatedFrom.value_text,
        restated: true,
        filed: restatedFrom.filed ?? null,
        accession: restatedFrom.accession ?? null,
        source_id: restatedFrom.source_id ?? null,
      };
    }
    if (ytd) text += `; ytd ${groupDigits(ytd.value_text)}`;
    text += ')';
    slots[mid] = {
      id: `xbrl:${win.concept}:${periodLabel(win.period)}`,
      metric_id: mid,
      text,
      as_of: win.period.end,
      grade: 'A',
      source_id: win.source_id ?? null,
      origin: 'companyfacts',
      confidence: 'tagged',
      concept: win.concept,
      value: win.value,
      value_text: win.value_text,
      unit: win.unit,
      currency: win.currency ?? null,
      period: { ...win.period },
      fy: win.fy ?? null,
      fp: win.fp ?? null,
      form: win.form ?? null,
      filed: win.filed ?? null,
      accession: win.accession ?? null,
      prior,
      ytd: ytd ? {
        start: ytd.period.start,
        end: ytd.period.end,
        value: ytd.value,
        value_text: ytd.value_text,
        concept: ytd.concept,
      } : null,
    };
  }
  return { slots, stale };
}

export function taggedSlots(facts, taxonomy = null) {
  return selectSlots(facts, taxonomy).slots;
}

export function headlineGaps(slots, taxonomy = null, facts = null) {
  const tax = taxonomy || loadTaxonomy();
  const stale = facts != null ? selectSlots(facts, tax).stale : {};
  const gaps = [];
  for (const [mid, spec] of Object.entries(tax.metrics || {})) {
    if (spec.alias_of) continue;
    if (!((spec.concepts && spec.concepts.length) || (spec.fallback && spec.fallback.length))) continue;
    if (slots[mid]) continue;
    if (stale[mid]) gaps.push(STALE_GAP(mid, stale[mid]));
    else gaps.push(STRUCTURED_GAP(mid));
  }
  return gaps;
}
