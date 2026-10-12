// companyfacts.js — JS twin of ontology/api/companyfacts.py (same taxonomy JSON).
// Parse a local SEC companyfacts cache. No network. No model. No writes.
// V2: latest filing, group by period, unique-or-gap. No ranking engine.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_ONTOLOGY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ontology');
const ALLOWED_FORMS = new Set(['10-K', '10-Q', '20-F', '40-F', '6-K', '10-KT']);
const ISO4217 = /^[A-Z]{3}$/;
const TAXONOMIES = ['us-gaap', 'ifrs-full'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export const MISSING_CACHE = 'companyfacts cache missing; headline slots empty';
export const UNREADABLE = 'companyfacts cache unreadable';

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
  if (spec.concepts && spec.concepts.length) return false;
  return spec.sentence_fill !== false;
}

export function structuredMetric(metricId, taxonomy = null) {
  const spec = ((taxonomy || loadTaxonomy()).metrics || {})[metricId] || {};
  if (spec.alias_of) return true;
  return Boolean(spec.concepts && spec.concepts.length);
}

export function conceptIndex(taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const idx = {};
  for (const [mid, spec] of Object.entries(tax.metrics || {})) {
    if (spec.alias_of) continue;
    for (const concept of (spec.concepts || [])) {
      if (!idx[concept]) idx[concept] = mid;
      const localName = concept.split(':').pop();
      if (!idx[localName]) idx[localName] = mid;
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
  if (!start || !end) return null;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.round((b - a) / 86400000);
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

export function parseCompanyfacts(doc, opts = {}) {
  const notes = [];
  if (!doc || typeof doc !== 'object' || !doc.facts || typeof doc.facts !== 'object') {
    return { facts: [], notes: [UNREADABLE], entity: null, cik: null };
  }
  const sourceId = opts.sourceId || null;
  const out = [];
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
            duration_days: start ? days(start, end) : null,
            fy: Number.isInteger(raw.fy) ? raw.fy : null,
            fp: typeof raw.fp === 'string' ? raw.fp : null,
            form,
            filed: String(raw.filed),
            accession: String(raw.accn),
            dimensional: false,
            source_id: sourceId || `companyfacts:${raw.accn}`,
          });
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

export function mappedConcepts(taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const out = new Set();
  for (const spec of Object.values(tax.metrics || {})) {
    if (spec.alias_of) continue;
    for (const c of (spec.concepts || [])) out.add(c);
  }
  return [...out].sort();
}

export function mappedInventory(doc, taxonomy = null) {
  return extractMappedDocument(doc, taxonomy).inventory;
}

export function missingMappedFromSource(fixtureDoc, sourceInventory, taxonomy = null) {
  const have = mappedInventory(fixtureDoc, taxonomy);
  const missing = [];
  for (const [concept, units] of Object.entries(sourceInventory || {})) {
    if (!have[concept]) {
      missing.push(concept);
      continue;
    }
    for (const [unit, count] of Object.entries(units || {})) {
      if ((have[concept][unit] || 0) < Number(count)) missing.push(`${concept}:${unit}`);
    }
  }
  return missing;
}

export function extractMappedDocument(doc, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const want = {};
  for (const concept of mappedConcepts(tax)) {
    const [ns, loc] = concept.split(':');
    if (!want[ns]) want[ns] = new Set();
    want[ns].add(loc);
  }
  const srcFacts = doc && typeof doc === 'object' && doc.facts && typeof doc.facts === 'object' ? doc.facts : {};
  const facts = {};
  const inventory = {};
  for (const [ns, locals] of Object.entries(want)) {
    const group = srcFacts[ns];
    if (!group || typeof group !== 'object') continue;
    const kept = {};
    for (const loc of [...locals].sort()) {
      const node = group[loc];
      if (!node || typeof node !== 'object') continue;
      kept[loc] = node;
      const units = node.units && typeof node.units === 'object' ? node.units : {};
      inventory[`${ns}:${loc}`] = Object.fromEntries(
        Object.entries(units).map(([unit, pts]) => [unit, Array.isArray(pts) ? pts.length : 0]),
      );
    }
    if (Object.keys(kept).length) facts[ns] = kept;
  }
  const extracted = {};
  if (doc && Object.prototype.hasOwnProperty.call(doc, 'cik')) extracted.cik = doc.cik;
  if (doc && Object.prototype.hasOwnProperty.call(doc, 'entityName')) extracted.entityName = doc.entityName;
  extracted.facts = facts;
  return { extracted, inventory };
}

export function mappedFacts(facts, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const known = new Set();
  for (const spec of Object.values(tax.metrics || {})) {
    if (spec.alias_of) continue;
    for (const c of (spec.concepts || [])) known.add(c);
  }
  return (facts || []).filter((f) => known.has(f.concept) && !f.dimensional);
}

export function latestAccession(facts) {
  let best = null;
  for (const f of facts || []) {
    if (!ALLOWED_FORMS.has(formFamily(f.form))) continue;
    const filed = String(f.filed || '');
    const accn = String(f.accession || '');
    if (!accn) continue;
    if (!best || filed > best.filed || (filed === best.filed && accn > best.accession)) {
      best = { filed, accession: accn };
    }
  }
  return best ? best.accession : null;
}

export function periodKey(fact) {
  const period = (fact && fact.period) || {};
  return [period.start ?? null, period.end ?? null];
}

export function spanLabel(durationDays, periodType) {
  if (periodType === 'instant') return null;
  if (durationDays == null) return 'other';
  if (durationDays >= 70 && durationDays <= 130) return 'quarter';
  if (durationDays >= 131 && durationDays <= 340) return 'ytd';
  if (durationDays >= 341) return 'annual';
  return 'other';
}

export function candidatesFor(metricId, facts, accession, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const spec = (tax.metrics || {})[metricId] || {};
  const concepts = spec.concepts || [];
  if (spec.alias_of || !concepts.length) return [];
  const out = [];
  for (const f of facts || []) {
    if (f.dimensional) continue;
    if (f.accession !== accession) continue;
    if (!concepts.includes(f.concept)) continue;
    const period = f.period || {};
    if (period.type !== spec.period || !period.end) continue;
    if (!unitOk(String(f.unit || ''), String(spec.unit))) continue;
    out.push(f);
  }
  return out;
}

export function groupByPeriod(facts) {
  const groups = new Map();
  for (const f of facts || []) {
    const [start, end] = periodKey(f);
    const key = `${start || ''}|${end || ''}`;
    if (!groups.has(key)) groups.set(key, { start: start ?? null, end: end ?? null, rows: [] });
    groups.get(key).rows.push(f);
  }
  return groups;
}

export function agree(a, b) {
  return a.value_text === b.value_text && a.unit === b.unit;
}

function periodAgrees(rows) {
  if (!rows.length) return true;
  const first = rows[0];
  return rows.every((row) => agree(first, row));
}

function labeled(rows) {
  const picked = [...rows].sort((a, b) => String(a.concept || '').localeCompare(String(b.concept || '')))[0];
  const period = { ...(picked.period || {}) };
  let durationDays = picked.duration_days;
  if (durationDays == null && period.start) durationDays = days(period.start, period.end);
  const tags = [...new Set(rows.map((f) => f.concept).filter(Boolean))].sort();
  return {
    concept: picked.concept,
    tags,
    value_text: picked.value_text,
    unit: picked.unit,
    currency: picked.currency ?? null,
    period,
    duration_days: durationDays ?? null,
    span: spanLabel(durationDays ?? null, String(period.type || '')),
    form: picked.form ?? null,
    fp: picked.fp ?? null,
    fy: picked.fy ?? null,
    filed: picked.filed ?? null,
    accession: picked.accession ?? null,
    source_id: picked.source_id ?? null,
    value: picked.value,
  };
}

function periodWhen(period) {
  if (period.type === 'duration' && period.start) return `for ${period.start} to ${period.end}`;
  return `at ${period.end}`;
}

function valueBlock(lab) {
  const bits = [];
  if (lab.span) bits.push(String(lab.span));
  bits.push(`form ${lab.form || ''}`.trimEnd());
  if (lab.fp) bits.push(`fp=${lab.fp}`);
  if (lab.fy != null) bits.push(`fy=${lab.fy}`);
  if (lab.filed) bits.push(`filed ${lab.filed}`);
  if (lab.accession) bits.push(`accn ${lab.accession}`);
  return `${local(lab.concept)} ${lab.unit} ${groupDigits(lab.value_text)} ${periodWhen(lab.period)}\n(${bits.join(', ')})`;
}

function periodGapKey(start, end) {
  return `${start || ''}/${end || ''}`;
}

function conflictGap(mid, accn, start, end, rows) {
  const header = `${mid} ${periodGapKey(start, end)}: latest filing ${accn} has ${rows.length} disagreeing tagged facts`;
  const lines = [header];
  const ordered = [...rows].sort((a, b) => {
    const c = String(a.concept || '').localeCompare(String(b.concept || ''));
    if (c) return c;
    const u = String(a.unit || '').localeCompare(String(b.unit || ''));
    if (u) return u;
    return String(a.value_text || '').localeCompare(String(b.value_text || ''));
  });
  for (const row of ordered) {
    const fp = row.fp || '';
    lines.push(`  - ${row.concept} ${row.unit} ${row.value_text} ${row.form} ${fp}`.trimEnd());
  }
  return lines;
}

function sortValues(values) {
  return [...values].sort((a, b) => {
    const ae = (a.period && a.period.end) || '';
    const be = (b.period && b.period.end) || '';
    if (ae !== be) return ae < be ? -1 : 1;
    const as = (a.period && a.period.start) || '';
    const bs = (b.period && b.period.start) || '';
    if (as !== bs) return as < bs ? -1 : 1;
    return 0;
  });
}

function slot(mid, accn, values) {
  const ordered = sortValues(values);
  const text = ordered.map(valueBlock).join('\n');
  const sole = ordered.length === 1 ? ordered[0] : null;
  return {
    id: `xbrl:${mid}:${accn}`,
    metric_id: mid,
    text,
    as_of: sole ? sole.period.end : null,
    grade: 'A',
    source_id: sole ? (sole.source_id ?? null) : `companyfacts:${accn}`,
    origin: 'companyfacts',
    confidence: 'tagged',
    values: ordered,
    concept: sole ? sole.concept : null,
    value: sole ? sole.value : null,
    value_text: sole ? sole.value_text : null,
    unit: sole ? sole.unit : null,
    currency: sole ? (sole.currency ?? null) : null,
    period: sole ? { ...sole.period } : null,
    fy: sole ? (sole.fy ?? null) : null,
    fp: sole ? (sole.fp ?? null) : null,
    form: sole ? (sole.form ?? null) : null,
    filed: sole ? (sole.filed ?? null) : null,
    accession: accn,
  };
}

export function latestFilingSlots(facts, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const accn = latestAccession(facts || []);
  const slots = {};
  const gaps = [];
  for (const [mid, spec] of Object.entries(tax.metrics || {})) {
    if (spec.alias_of) continue;
    if (!(spec.concepts && spec.concepts.length)) continue;
    if (!accn) {
      gaps.push(`${mid}: not reported in latest filing`);
      continue;
    }
    const cands = candidatesFor(mid, facts || [], accn, tax);
    if (!cands.length) {
      gaps.push(`${mid}: not reported in latest filing ${accn}`);
      continue;
    }
    const values = [];
    for (const group of groupByPeriod(cands).values()) {
      if (periodAgrees(group.rows)) values.push(labeled(group.rows));
      else gaps.push(...conflictGap(mid, accn, group.start, group.end, group.rows));
    }
    if (values.length) slots[mid] = slot(mid, accn, values);
  }
  return { slots, gaps };
}

export function taggedSlots(facts, taxonomy = null) {
  return latestFilingSlots(facts, taxonomy).slots;
}

export function headlineGaps(slots, taxonomy = null, facts = null) {
  return latestFilingSlots(facts || [], taxonomy).gaps;
}

export function defaultCache(wikiRoot, slug) {
  return path.join(wikiRoot, 'raw', `${slug}-research`, 'sec', 'companyfacts.json');
}

export function loadCompanyfacts(cfg, wikiRoot, slug) {
  const override = cfg && cfg.companyfacts_path;
  let filePath;
  if (override) {
    filePath = path.isAbsolute(override) ? override : path.join(wikiRoot, override);
  } else {
    filePath = defaultCache(wikiRoot, slug);
  }
  try {
    readFileSync(filePath);
  } catch {
    return { facts: [], notes: [cacheStatusGap(filePath) || MISSING_CACHE], files: [], slots: {} };
  }
  const parsed = loadCompanyfactsFile(filePath, { sourceId: filePath });
  const { slots, gaps } = latestFilingSlots(parsed.facts);
  const kept = mappedFacts(parsed.facts);
  const notes = [...(parsed.notes || [])];
  const statusGap = cacheStatusGap(filePath);
  if (statusGap && !notes.includes(statusGap)) notes.unshift(statusGap);
  notes.push(...gaps);
  return { facts: kept, notes, files: [filePath], slots };
}
