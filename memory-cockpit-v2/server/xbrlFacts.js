// xbrlFacts.js — JS mirror of ontology/api/xbrl_facts.py (same taxonomy JSON).
// Tagged XBRL facts for live metric slots. No network. No model. No writes.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const DEFAULT_ONTOLOGY = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../ontology');

const TOKEN = /<!--[\s\S]*?-->|<!\[CDATA\[(?<cdata>[\s\S]*?)\]\]>|<\?[\s\S]*?\?>|<![^>]*>|<(?<close>\/)?(?<name>[A-Za-z_][\w.\-]*(?::[A-Za-z_][\w.\-]*)?)(?<attrs>(?:\s+[^\s=/>]+(?:\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+))?)*)\s*(?<self>\/)?>/g;
const ATTR = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+)))?/g;
const ENTITY = /&(#x[0-9A-Fa-f]+|#\d+|[A-Za-z]+);/g;
const NAMED = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0' };
const DATE = /^(\d{4})-(\d{2})-(\d{2})/;
const PLAIN = /^-?\d+(?:\.\d+)?$/;
const INT = /^-?\d+$/;
const NUM_WORDS = {
  no: '0', none: '0', nil: '0', zero: '0',
  one: '1', two: '2', three: '3', four: '4', five: '5',
  six: '6', seven: '7', eight: '8', nine: '9', ten: '10',
};
const TEXT_LOCALS = new Set(['identifier', 'startDate', 'endDate', 'instant', 'explicitMember', 'measure']);
const DOT_FORMATS = new Set(['', 'numdotdecimal', 'num-dot-decimal']);
const COMMA_FORMATS = new Set(['numcommadecimal', 'num-comma-decimal']);
const ZERO_FORMATS = new Set(['fixed-zero', 'fixedzero', 'zerodash']);
const WORD_FORMATS = new Set(['numwordsen', 'num-word-en']);

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

function decode(text) {
  return String(text).replace(ENTITY, (whole, ent) => {
    if (ent.startsWith('#x')) return String.fromCodePoint(parseInt(ent.slice(2), 16));
    if (ent.startsWith('#')) return String.fromCodePoint(parseInt(ent.slice(1), 10));
    return Object.prototype.hasOwnProperty.call(NAMED, ent) ? NAMED[ent] : whole;
  });
}

function parseAttrs(raw) {
  const out = {};
  ATTR.lastIndex = 0;
  let m;
  while ((m = ATTR.exec(raw || ''))) {
    let val = m[2];
    if (val === undefined) val = m[3];
    if (val === undefined) val = m[4];
    out[m[1]] = decode(val || '');
    if (m.index === ATTR.lastIndex) ATTR.lastIndex += 1;
  }
  return out;
}

function local(name) {
  const parts = String(name).split(':');
  return parts[parts.length - 1];
}

function canonicalPrefix(prefix, prefixes, namespaces) {
  const uri = prefixes[prefix];
  if (uri) {
    for (const [canon, uris] of Object.entries(namespaces || {})) {
      if ((uris || []).some((u) => uri.startsWith(u))) return canon;
    }
  }
  return prefix;
}

export function canonicalConcept(qname, prefixes, namespaces) {
  const q = String(qname);
  const at = q.indexOf(':');
  if (at < 0) return q;
  return `${canonicalPrefix(q.slice(0, at), prefixes, namespaces)}:${q.slice(at + 1)}`;
}

function dateOnly(raw) {
  const m = DATE.exec(String(raw || '').trim());
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null;
}

export function shiftDecimal(num, scale) {
  const neg = num.startsWith('-');
  const s = num.replace(/^-+/, '');
  const dot = s.indexOf('.');
  let ip = dot < 0 ? s : s.slice(0, dot);
  let fp = dot < 0 ? '' : s.slice(dot + 1);
  let digits = ip + fp;
  let point = ip.length + scale;
  if (point <= 0) {
    digits = '0'.repeat(1 - point) + digits;
    point = 1;
  }
  if (point > digits.length) digits += '0'.repeat(point - digits.length);
  ip = digits.slice(0, point).replace(/^0+/, '') || '0';
  fp = digits.slice(point).replace(/0+$/, '');
  let out = ip + (fp ? `.${fp}` : '');
  if (neg && out !== '0') out = `-${out}`;
  return out;
}

export function factNumber(text, fmt) {
  let t = String(text || '').replace(/\s+/g, ' ').trim();
  const loc = local(fmt || '').toLowerCase();
  if (ZERO_FORMATS.has(loc)) return '0';
  if (WORD_FORMATS.has(loc)) {
    const w = t.toLowerCase().replace(/^[ .]+|[ .]+$/g, '');
    return Object.prototype.hasOwnProperty.call(NUM_WORDS, w) ? NUM_WORDS[w] : null;
  }
  if (COMMA_FORMATS.has(loc)) t = t.replace(/[\s.'\u00a0]/g, '').replace(/,/g, '.');
  else if (DOT_FORMATS.has(loc)) t = t.replace(/[\s,'\u00a0]/g, '');
  else return null;
  if (!PLAIN.test(t)) return null;
  if (t.startsWith('-') && loc) return null;
  return t;
}

function unitString(unit) {
  const join = (ms) => ms.map(local).join('*');
  if (unit.num.length || unit.den.length) return `${join(unit.num)}/${join(unit.den)}`;
  return join(unit.measures);
}

export function parseXbrlFacts(text, { sourceId = null, orderBase = 0, taxonomy = null } = {}) {
  const namespaces = (taxonomy || loadTaxonomy()).namespaces || {};
  const prefixes = {};
  const contexts = {};
  const units = {};
  const rawFacts = [];
  const stack = [];
  let excludeDepth = 0;
  let pos = 0;
  const doc = String(text || '');

  const feed = (chunk) => {
    if (!chunk || excludeDepth) return;
    for (const frame of stack) if (frame.want) frame.text.push(chunk);
  };
  const inside = (loc) => {
    for (let k = stack.length - 1; k >= 0; k--) if (stack[k].local === loc) return stack[k];
    return null;
  };
  const close = (frame) => {
    const loc = frame.local;
    const body = decode(frame.text.join(''));
    const attrs = frame.attrs;
    if (loc === 'exclude') {
      excludeDepth -= 1;
      return;
    }
    if (frame.fact) {
      rawFacts.push({
        name: attrs.name || frame.name,
        context: attrs.contextRef,
        unit: attrs.unitRef,
        decimals: attrs.decimals,
        scale: attrs.scale,
        sign: attrs.sign,
        format: attrs.format,
        nil: String(attrs['xsi:nil'] || attrs.nil || '').toLowerCase() === 'true',
        text: body,
      });
      return;
    }
    const ctx = inside('context');
    if (ctx && (loc === 'startDate' || loc === 'endDate' || loc === 'instant')) ctx.ctx[loc] = dateOnly(body);
    else if (ctx && loc === 'forever') ctx.ctx.forever = true;
    else if (ctx && loc === 'explicitMember') ctx.ctx.dims.push([attrs.dimension || '', body.trim()]);
    else if (ctx && loc === 'typedMember') ctx.ctx.dims.push([attrs.dimension || '', 'typed']);
    else if (loc === 'context' && attrs.id) contexts[attrs.id] = frame.ctx;
    const unit = inside('unit');
    if (unit && loc === 'measure') {
      if (inside('unitNumerator')) unit.unit.num.push(body.trim());
      else if (inside('unitDenominator')) unit.unit.den.push(body.trim());
      else unit.unit.measures.push(body.trim());
    } else if (loc === 'unit' && attrs.id) units[attrs.id] = frame.unit;
  };

  TOKEN.lastIndex = 0;
  let m;
  while ((m = TOKEN.exec(doc))) {
    feed(doc.slice(pos, m.index));
    pos = m.index + m[0].length;
    if (m.index === TOKEN.lastIndex) TOKEN.lastIndex += 1;
    const g = m.groups;
    if (g.cdata !== undefined) {
      feed(g.cdata);
      continue;
    }
    const name = g.name;
    if (!name) continue;
    if (g.close) {
      for (let k = stack.length - 1; k >= 0; k--) {
        if (stack[k].name === name) {
          while (stack.length > k) close(stack.pop());
          break;
        }
      }
      continue;
    }
    const attrs = parseAttrs(g.attrs || '');
    for (const [key, val] of Object.entries(attrs)) {
      if (key.startsWith('xmlns:')) prefixes[key.slice(6)] = val;
    }
    const loc = local(name);
    const isIxFraction = loc.toLowerCase() === 'nonfraction';
    const isInstanceFact = !isIxFraction
      && Object.prototype.hasOwnProperty.call(attrs, 'contextRef')
      && Object.prototype.hasOwnProperty.call(attrs, 'unitRef')
      && !['nonnumeric', 'fraction'].includes(loc.toLowerCase());
    const frame = {
      name,
      local: loc,
      attrs,
      text: [],
      fact: isIxFraction || isInstanceFact,
      want: isIxFraction || isInstanceFact || TEXT_LOCALS.has(loc),
      ctx: loc === 'context' ? { dims: [] } : null,
      unit: loc === 'unit' ? { measures: [], num: [], den: [] } : null,
    };
    if (loc === 'exclude') excludeDepth += 1;
    stack.push(frame);
    if (g.self) close(stack.pop());
  }
  feed(doc.slice(pos));
  while (stack.length) close(stack.pop());

  const facts = [];
  const counts = { nil: 0, no_context: 0, no_unit: 0, unparsed: 0, conflict: 0 };
  const seen = new Map();
  rawFacts.forEach((raw, idx) => {
    if (raw.nil) {
      counts.nil += 1;
      return;
    }
    const ctx = Object.prototype.hasOwnProperty.call(contexts, raw.context || '') ? contexts[raw.context || ''] : null;
    if (!ctx) {
      counts.no_context += 1;
      return;
    }
    const unit = Object.prototype.hasOwnProperty.call(units, raw.unit || '') ? units[raw.unit || ''] : null;
    if (!unit) {
      counts.no_unit += 1;
      return;
    }
    const num = factNumber(raw.text, raw.format);
    if (num == null) {
      counts.unparsed += 1;
      return;
    }
    const scaleRaw = String(raw.scale || '').trim();
    const scale = INT.test(scaleRaw) ? parseInt(scaleRaw, 10) : 0;
    let valueText = shiftDecimal(num, scale);
    if (String(raw.sign || '').trim() === '-' && valueText !== '0') {
      valueText = valueText.startsWith('-') ? valueText.slice(1) : `-${valueText}`;
    }
    const decRaw = String(raw.decimals || '').trim();
    const decimals = INT.test(decRaw) ? parseInt(decRaw, 10) : (decRaw.toUpperCase() === 'INF' ? 'INF' : null);
    let period;
    if (ctx.instant) period = { type: 'instant', start: null, end: ctx.instant };
    else if (ctx.endDate) period = { type: 'duration', start: ctx.startDate || null, end: ctx.endDate };
    else period = { type: 'forever', start: null, end: null };
    const concept = canonicalConcept(raw.name, prefixes, namespaces);
    const unitStr = unitString(unit);
    const key = JSON.stringify([concept, raw.context || '', unitStr]);
    if (seen.has(key)) {
      if (seen.get(key) !== valueText) counts.conflict += 1;
      return;
    }
    seen.set(key, valueText);
    const dims = ctx.dims.map(([a, b]) => [canonicalConcept(a, prefixes, namespaces), canonicalConcept(b, prefixes, namespaces)]);
    facts.push({
      concept,
      value: Number(valueText),
      value_text: valueText,
      unit: unitStr,
      decimals,
      period,
      dimensional: dims.length > 0,
      dims,
      context_id: raw.context,
      source_id: sourceId,
      order: orderBase + idx,
    });
  });
  const notes = [];
  if (counts.conflict) notes.push(`xbrl: ${counts.conflict} duplicate facts disagree; first kept`);
  if (counts.unparsed) notes.push(`xbrl: ${counts.unparsed} facts with an unsupported format skipped`);
  if (counts.no_context || counts.no_unit) {
    notes.push(`xbrl: ${counts.no_context + counts.no_unit} facts without a context or unit skipped`);
  }
  return { facts, notes, contexts: Object.keys(contexts).length, units: Object.keys(units).length };
}

function days(period) {
  if (!period || period.type !== 'duration' || !period.start || !period.end) return 0;
  const toUtc = (s) => Date.UTC(Number(s.slice(0, 4)), Number(s.slice(5, 7)) - 1, Number(s.slice(8, 10)));
  return Math.round((toUtc(period.end) - toUtc(period.start)) / 86400000);
}

function unitOk(unit, kind) {
  if (kind === 'currency') return /^[A-Z]{3}$/.test(unit || '');
  if (kind === 'shares') return unit === 'shares';
  return false;
}

export function conceptIndex(taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const idx = {};
  for (const [mid, spec] of Object.entries(tax.metrics || {})) {
    for (const concept of spec.concepts || []) {
      if (!Object.prototype.hasOwnProperty.call(idx, concept)) idx[concept] = mid;
      const loc = local(concept);
      if (!Object.prototype.hasOwnProperty.call(idx, loc)) idx[loc] = mid;
    }
  }
  return idx;
}

export function groupDigits(valueText) {
  const neg = valueText.startsWith('-');
  const s = valueText.replace(/^-+/, '');
  const dot = s.indexOf('.');
  let ip = dot < 0 ? s : s.slice(0, dot);
  const tail = dot < 0 ? '' : s.slice(dot);
  let out = '';
  while (ip.length > 3) {
    out = `,${ip.slice(-3)}${out}`;
    ip = ip.slice(0, -3);
  }
  return `${neg ? '-' : ''}${ip}${out}${tail}`;
}

function periodDesc(p) {
  return p.type === 'duration' ? `${p.start} to ${p.end}` : String(p.end);
}

function periodLabel(p) {
  return p.type === 'duration' ? `${p.start}/${p.end}` : String(p.end);
}

function cmpTuple(a, b) {
  for (let i = 0; i < a.length; i++) {
    if (a[i] < b[i]) return -1;
    if (a[i] > b[i]) return 1;
  }
  return 0;
}

export function taggedSlots(facts, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const slots = {};
  for (const [mid, spec] of Object.entries(tax.metrics || {})) {
    const concepts = spec.concepts || [];
    if (!concepts.length) continue;
    const cands = (facts || []).filter((f) => concepts.includes(f.concept)
      && !f.dimensional
      && f.period && f.period.type === spec.period
      && f.period.end
      && unitOk(String(f.unit || ''), String(spec.unit)));
    if (!cands.length) continue;
    const rank = (f) => [f.period.end, days(f.period), -concepts.indexOf(f.concept), -Number(f.order || 0)];
    const best = (rows) => rows.reduce((acc, f) => (acc == null || cmpTuple(rank(f), rank(acc)) > 0 ? f : acc), null);
    const win = best(cands);
    const older = cands.filter((f) => f.concept === win.concept
      && f.period.end < win.period.end
      && Math.abs(days(f.period) - days(win.period)) <= 7);
    const prior = older.length ? best(older) : null;
    let text = `${win.concept} = ${win.unit} ${groupDigits(win.value_text)} for ${periodDesc(win.period)} (consolidated, tagged XBRL fact`;
    if (prior) text += `; prior ${prior.period.end}: ${groupDigits(prior.value_text)}`;
    text += ')';
    slots[mid] = {
      id: `xbrl:${win.concept}:${periodLabel(win.period)}`,
      metric_id: mid,
      text,
      as_of: win.period.end,
      grade: 'A',
      source_id: win.source_id ?? null,
      origin: 'xbrl',
      confidence: 'tagged',
      concept: win.concept,
      value: win.value,
      value_text: win.value_text,
      unit: win.unit,
      decimals: win.decimals ?? null,
      period: { ...win.period },
      prior: prior ? { end: prior.period.end, value: prior.value, value_text: prior.value_text } : null,
    };
  }
  return slots;
}

export function mappedFacts(facts, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const known = new Set();
  for (const spec of Object.values(tax.metrics || {})) for (const c of spec.concepts || []) known.add(c);
  return (facts || []).filter((f) => known.has(f.concept) && !f.dimensional);
}
