// contextpack.js — JS mirror of ontology/api/contextpack.py (same JSON rules).
// No writes. Decision-support only. ASCII needles. No ticker branch. No model call.
// A tagged XBRL fact owns its metric slot. A sentence fills only an untagged
// metric, only with an amount of that slot's kind, and is marked low confidence.
import { readFileSync } from 'fs';
import path from 'path';
import { conceptIndex, loadTaxonomy, sentenceFillAllowed, taggedSlots } from './xbrlFacts.js';

const GRADE_W = { A: 3, B: 2, C: 1 };
export const FISCAL_GAP = 'as_of is a fiscal label without a period-end date';
export const SENTENCE_GAP = 'no tagged XBRL fact; live value is sentence-derived (low confidence): ';
export const HEADLINE_GAP = (mid, n) => `${mid}: no tagged fact; ${n} candidate sentences in context`;
export const CONTEXT_CAP = 8;
const COUNT = /\b(?!(?:19|20)\d{2}\b)\d[\d,]*(?:\.\d+)?\b/;

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sept: 9, sep: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};
const MON = 'january|february|march|april|june|july|august|september|october|november|december|sept|jan|feb|mar|apr|jun|jul|aug|sep|oct|nov|dec|may';
const MDY = new RegExp(`\\b(?<mon>${MON})\\.?\\s+(?<d>\\d{1,2})(?:st|nd|rd|th)?,?\\s+(?<y>\\d{4})\\b`, 'gi');
const DMY = new RegExp(`\\b(?<d>\\d{1,2})(?:st|nd|rd|th)?\\s+(?<mon>${MON})\\.?\\s+(?<y>\\d{4})\\b`, 'gi');
const ISO = /\b(?<y>\d{4})-(?<m>\d{1,2})-(?<d>\d{1,2})(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?)?\b/g;
const ENDED = /\b(?:fiscal\s+year\s+ended|year\s+ended|(?:52|53)\s+weeks\s+ended)\s+(?<rest>.+)$/is;
const FY = /\b(?:fy\s*20\d{2}|fiscal\s+(?:year\s+)?20\d{2})\b/i;

const NUM = '(?:\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.\\d+)?';
const SCALE = '(?:[Tt]rillion|[Bb]illion|[Mm]illion|[Tt]housand|[Tt][Nn]|[Bb][Nn]|[Mm][Nn]|[Mm][Mm]|[KkBbMm])';
const SYM = '(?:[Uu][Ss]\\$|[€£¥$])';
const CODE = 'USD|EUR|GBP|JPY|CNY|RMB|KRW|CAD|AUD|CHF|HKD|SGD|SEK|NOK|DKK|NZD|INR|BRL|MXN|ZAR|TWD|THB|MYR|IDR|PHP|PLN|CZK|HUF|ILS|TRY|SAR|AED|CLP|COP|PEN|ARS|VND|PKR|BDT|EGP|NGN|KES';
const SYM_PREFIX = new RegExp(`(?<cur>${SYM})\\s*(?<num>${NUM})(?:\\s*(?<scale>${SCALE}))?\\b`, 'g');
const CODE_PREFIX = new RegExp(`\\b(?<cur>${CODE})\\b\\s*(?<num>${NUM})(?:\\s*(?<scale>${SCALE}))?\\b`, 'g');
const CODE_SUFFIX = new RegExp(`(?<num>${NUM})\\s*\\b(?<cur>${CODE})\\b(?:\\s*(?<scale>${SCALE}))?\\b`, 'g');
const PCT = new RegExp(`(?<num>${NUM})\\s*(?:%|[Pp]ercent\\b|[Pp][Cc][Tt]\\b)`, 'g');
const BPS = new RegExp(`(?:(?:(?<cur>${SYM})|(?:\\b(?<code>${CODE})\\b))\\s*)?(?<num>${NUM})\\s*(?:[Bb]asis\\s+[Pp]oints|[Bb][Pp][Ss])\\b`, 'g');
const PER_SHARE_AFTER = /^(?:\s*\/\s*shares?\b|\s*,?\s*(?:per\s+(?:diluted\s+|basic\s+|common\s+)?shares?|a\s+share)\b)/i;
const PER_SHARE_CUE = /\b(?:diluted\s+earnings\s+per\s+shares?|basic\s+earnings\s+per\s+shares?|earnings\s+per\s+(?:diluted\s+|basic\s+|common\s+)?shares?|per\s+(?:diluted\s+|basic\s+|common\s+)?shares?|eps)\b/i;
const PER_SHARE_LEGEND = /\bexcept\s+per[-\s]+shares?\b/i;
const EXCLUSION_BEFORE = /(?:other than|excluding|except|exclusive of)\b(?:\s+\w+){0,6}\s+$/i;
const SENTENCE_SCALE = /\bin\s+(thousands|millions|billions|trillions)\b/i;
const SENTENCE_SPLIT = /(?<=[.!?])\s+|\n+/g;

const SCALE_VALUE = {
  thousand: ['thousand', 1000],
  k: ['thousand', 1000],
  million: ['million', 1_000_000],
  m: ['million', 1_000_000],
  mn: ['million', 1_000_000],
  mm: ['million', 1_000_000],
  billion: ['billion', 1_000_000_000],
  b: ['billion', 1_000_000_000],
  bn: ['billion', 1_000_000_000],
  trillion: ['trillion', 1_000_000_000_000],
  tn: ['trillion', 1_000_000_000_000],
};
const SENTENCE_SCALE_VALUE = {
  thousands: ['thousand', 1000],
  millions: ['million', 1_000_000],
  billions: ['billion', 1_000_000_000],
  trillions: ['trillion', 1_000_000_000_000],
};
const SYMBOL_CODE = { '$': 'USD', us$: 'USD', '€': 'EUR', '£': 'GBP', '¥': 'JPY' };
const CODE_SET = new Set(CODE.split('|'));

export function loadContextpackRules(ontologyRoot) {
  loadTaxonomy(ontologyRoot);
  const p = path.join(ontologyRoot, 'schema', 'contextpack_metrics.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

function loadXbrl() {
  return loadTaxonomy();
}

export function gradeWeight(grade) {
  if (grade == null) return 1;
  const g = String(grade).trim().toUpperCase();
  if (!g) return 1;
  return GRADE_W[g] || 1;
}

function leap(year) {
  return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
}

function ymd(year, month, day) {
  if (!(year >= 1900 && year <= 2100 && month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const mdays = [0, 31, leap(year) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (day > mdays[month]) return null;
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function monthNum(name) {
  return MONTHS[String(name || '').toLowerCase().replace(/\.$/, '')] || null;
}

function collect(re, fragment, kind) {
  re.lastIndex = 0;
  const cands = [];
  let m;
  while ((m = re.exec(fragment))) {
    let sk = null;
    if (kind === 'iso') sk = ymd(Number(m.groups.y), Number(m.groups.m), Number(m.groups.d));
    else {
      const mon = monthNum(m.groups.mon);
      sk = mon ? ymd(Number(m.groups.y), mon, Number(m.groups.d)) : null;
    }
    if (sk) cands.push([m.index, sk]);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return cands;
}

function dayIn(fragment) {
  const cands = [
    ...collect(MDY, fragment, 'mdy'),
    ...collect(DMY, fragment, 'dmy'),
    ...collect(ISO, fragment, 'iso'),
  ];
  if (!cands.length) return null;
  cands.sort((a, b) => a[0] - b[0]);
  return cands[0][1];
}

export function parseAsOf(raw) {
  const text = raw == null ? '' : String(raw).trim();
  const base = { sort_key: null, precision: 'unknown', raw };
  if (!text) return base;
  const ended = ENDED.exec(text);
  if (ended) {
    const day = dayIn(ended.groups.rest);
    if (day) return { sort_key: day, precision: 'day', raw };
    if (FY.test(ended.groups.rest) || FY.test(text)) {
      return { sort_key: null, precision: 'fiscal_label', raw };
    }
    return base;
  }
  const day = dayIn(text);
  if (day) return { sort_key: day, precision: 'day', raw };
  if (FY.test(text)) return { sort_key: null, precision: 'fiscal_label', raw };
  return base;
}

function escapeReg(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function phraseIn(text, phrase) {
  const p = String(phrase || '').toLowerCase().trim();
  if (!p) return false;
  const left = /[A-Za-z0-9]/.test(p[0]) ? '\\b' : '';
  const right = /[A-Za-z0-9]/.test(p[p.length - 1]) ? '\\b' : '';
  return new RegExp(left + escapeReg(p) + right).test(text);
}

function metricIds(rules) {
  return new Set((rules.metrics || []).map((rule) => String(rule.id)));
}

function resolveConcept(concept, rules, xbrl) {
  const ids = metricIds(rules);
  if (ids.has(concept)) return concept;
  const idx = conceptIndex(xbrl);
  const has = (k) => Object.prototype.hasOwnProperty.call(idx, k);
  if (has(concept) && ids.has(idx[concept])) return idx[concept];
  if (concept.includes(':')) {
    const local = concept.split(':').pop();
    if (has(local) && ids.has(idx[local])) return idx[local];
  }
  return null;
}

function spanExcluded(text, absIndex) {
  const before = text.slice(Math.max(0, absIndex - 60), absIndex);
  if (/non[-\s]+$/i.test(before)) return true;
  return EXCLUSION_BEFORE.test(before);
}

function headHits(text, head, start, end) {
  const re = new RegExp(`\\b${escapeReg(head)}\\b`, 'gi');
  const hits = [];
  let m;
  while ((m = re.exec(text.slice(start, end)))) {
    hits.push(start + m.index);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
  return hits;
}

function matchExcluded(text, head, start, end) {
  const hits = headHits(text, head, start, end);
  if (!hits.length) return false;
  return hits.every((i) => spanExcluded(text, i));
}

function hasCleanHead(text, head) {
  return headHits(text, head, 0, text.length).some((i) => !spanExcluded(text, i));
}

function headQualified(text, head, start, end, qualifiers) {
  const hits = headHits(text, head, start, end);
  if (!hits.length) return false;
  return hits.every((absIndex) => {
    const before = text.slice(Math.max(0, absIndex - 40), absIndex);
    const m = /([a-z0-9-]+)\s+$/i.exec(before);
    return !!(m && qualifiers.has(m[1].toLowerCase()));
  });
}

function patternsMatch(rule, text) {
  const head = String(rule.head || '').toLowerCase();
  const qualifiers = new Set((rule.qualifier_block || []).map((q) => String(q).toLowerCase()));
  for (const pat of rule.patterns || []) {
    let rx;
    try { rx = new RegExp(pat, 'gi'); } catch { continue; }
    let m;
    while ((m = rx.exec(text))) {
      const start = m.index;
      const end = m.index + m[0].length;
      const excluded = head && matchExcluded(text, head, start, end);
      const qualified = head && qualifiers.size && headQualified(text, head, start, end, qualifiers);
      if (!excluded && !qualified) return true;
      if (m.index === rx.lastIndex) rx.lastIndex += 1;
    }
  }
  return false;
}

function ruleMatches(rule, text) {
  if (rule.patterns) {
    if (!patternsMatch(rule, text)) return false;
  } else {
    if ((rule.none || []).some((n) => phraseIn(text, n))) return false;
    let positive = false;
    if (rule.regex) {
      try {
        if (new RegExp(rule.regex, 'i').test(text)) positive = true;
      } catch { /* skip bad regex */ }
    }
    const groups = rule.all_any || [];
    if (groups.length && groups.every((group) => group.some((p) => phraseIn(text, p)))) positive = true;
    const alls = rule.all || [];
    if (alls.length && alls.every((a) => phraseIn(text, a))) positive = true;
    const anys = rule.any || [];
    if (anys.length && anys.some((a) => phraseIn(text, a))) positive = true;
    if (!positive) return false;
    const head = String(rule.head || '').toLowerCase();
    if (head && !hasCleanHead(text, head)) return false;
  }
  if (rule.requires_count && !/\d/.test(text)) return false;
  if (rule.requires_figure && !hasFigure(text)) return false;
  return true;
}

export function classifyMetric(text, rules) {
  const t = String(text || '').toLowerCase();
  for (const rule of rules.metrics || []) {
    if (ruleMatches(rule, t)) return rule.id;
  }
  return null;
}

export function classifyClaim(claim, rules) {
  const notes = [];
  const concept = String((claim && claim.concept) || '').trim();
  if (concept) {
    const mapped = resolveConcept(concept, rules, loadXbrl());
    if (mapped) return { metric_id: mapped, notes };
    notes.push(`unmapped_concept: ${concept}`);
  }
  return { metric_id: classifyMetric((claim && claim.text) || '', rules), notes };
}

export function isBoilerplate(text, rules) {
  const t = String(text || '').toLowerCase();
  return (rules.boilerplate || []).some((p) => t.includes(String(p).toLowerCase()));
}

function num(raw) {
  const n = Number(String(raw).replace(/,/g, ''));
  return Number.isFinite(n) ? n : null;
}

function codeOf(token) {
  const t = String(token || '').trim();
  if (SYMBOL_CODE[t]) return SYMBOL_CODE[t];
  const low = t.toLowerCase();
  if (SYMBOL_CODE[low]) return SYMBOL_CODE[low];
  const up = t.toUpperCase();
  if (up === 'RMB') return 'CNY';
  if (CODE_SET.has(up)) return up;
  return null;
}

function scaleOf(token) {
  if (!token) return null;
  return SCALE_VALUE[String(token).toLowerCase()] || null;
}

function overlaps(a, b) {
  return !(a.end <= b.start || b.end <= a.start);
}

function keepSpans(rows) {
  const kept = [];
  const ordered = [...rows].sort((a, b) => a.start - b.start || (b.end - b.start) - (a.end - a.start));
  for (const row of ordered) {
    if (kept.some((prev) => overlaps(row, prev))) continue;
    kept.push(row);
  }
  kept.sort((a, b) => a.start - b.start);
  return kept;
}

function currencyRow(m, base) {
  const display = num(m.groups.num);
  const code = codeOf(m.groups.cur);
  if (display == null || !code) return null;
  const scale = scaleOf(m.groups.scale);
  return {
    start: base + m.index,
    end: base + m.index + m[0].length,
    value: scale ? display * scale[1] : display,
    display,
    currency: code,
    scale: scale ? scale[0] : null,
    unit: 'currency',
  };
}

function eachMatch(re, fragment, fn) {
  re.lastIndex = 0;
  let m;
  while ((m = re.exec(fragment))) {
    fn(m);
    if (m.index === re.lastIndex) re.lastIndex += 1;
  }
}

function amountsIn(fragment, base) {
  const rows = [];
  const bpsSpans = [];
  eachMatch(BPS, fragment, (m) => {
    bpsSpans.push([base + m.index, base + m.index + m[0].length]);
    const display = num(m.groups.num);
    if (display == null) return;
    rows.push({
      start: base + m.index,
      end: base + m.index + m[0].length,
      value: display,
      display,
      currency: null,
      scale: null,
      unit: 'bps',
    });
  });
  eachMatch(PCT, fragment, (m) => {
    const span = [base + m.index, base + m.index + m[0].length];
    if (bpsSpans.some(([s, e]) => !(span[1] <= s || span[0] >= e))) return;
    const display = num(m.groups.num);
    if (display == null) return;
    rows.push({
      start: span[0],
      end: span[1],
      value: display,
      display,
      currency: null,
      scale: null,
      unit: 'percent',
    });
  });
  for (const re of [SYM_PREFIX, CODE_PREFIX, CODE_SUFFIX]) {
    eachMatch(re, fragment, (m) => {
      const row = currencyRow(m, base);
      if (!row) return;
      if (bpsSpans.some(([s, e]) => !(row.end <= s || row.start >= e))) return;
      rows.push(row);
    });
  }
  return keepSpans(rows);
}

function currencySpans(fragment) {
  const found = [];
  SYM_PREFIX.lastIndex = 0;
  let m;
  while ((m = SYM_PREFIX.exec(fragment))) {
    found.push({ start: m.index, end: m.index + m[0].length });
    if (m.index === SYM_PREFIX.lastIndex) SYM_PREFIX.lastIndex += 1;
  }
  SYM_PREFIX.lastIndex = 0;
  return found;
}

function perShareAmount(frag, start, end, base) {
  const localS = start - base;
  const localE = end - base;
  if (PER_SHARE_AFTER.test(frag.slice(localE, localE + 32))) return true;
  let gapStart = 0;
  for (const span of currencySpans(frag)) {
    if (span.start < localS && span.end <= localS) gapStart = span.end;
  }
  const gap = frag.slice(gapStart, localS).replace(PER_SHARE_LEGEND, ' ');
  if (PER_SHARE_CUE.test(gap)) return true;
  const dollars = currencySpans(frag);
  return dollars.length === 1 && PER_SHARE_LEGEND.test(frag);
}

function sentenceSpans(text) {
  const spans = [];
  SENTENCE_SPLIT.lastIndex = 0;
  let start = 0;
  let m;
  while ((m = SENTENCE_SPLIT.exec(text))) {
    if (text.slice(start, m.index).trim()) spans.push([start, m.index]);
    start = m.index + m[0].length;
    if (m.index === SENTENCE_SPLIT.lastIndex) SENTENCE_SPLIT.lastIndex += 1;
  }
  if (text.slice(start).trim()) spans.push([start, text.length]);
  return spans;
}

export function parseAmounts(text) {
  if (!text) return [];
  const out = [];
  for (const [start, end] of sentenceSpans(String(text))) {
    const frag = String(text).slice(start, end);
    const sent = SENTENCE_SCALE.exec(frag);
    const sentScale = sent ? SENTENCE_SCALE_VALUE[sent[1].toLowerCase()] : null;
    for (const row of amountsIn(frag, start)) {
      const perShare = perShareAmount(frag, row.start, row.end, start);
      if (row.unit === 'currency' && row.scale == null && sentScale && !perShare) {
        row.value = row.display * sentScale[1];
        row.scale = sentScale[0];
      }
      delete row.start;
      delete row.end;
      out.push(row);
    }
  }
  return out;
}

function hasFigure(text) {
  return parseAmounts(text).some((a) => a.unit === 'currency' || a.unit === 'percent');
}

export function compareClaimsNewestFirst(a, b, ia = 0, ib = 0) {
  const sa = parseAsOf(a && a.as_of).sort_key || '0000-00-00';
  const sb = parseAsOf(b && b.as_of).sort_key || '0000-00-00';
  if (sa !== sb) return sa < sb ? 1 : -1;
  const ga = gradeWeight(a && a.grade);
  const gb = gradeWeight(b && b.grade);
  if (ga !== gb) return gb - ga;
  return ia - ib;
}

export function sentenceHasAmount(metricId, text, taxonomy = null) {
  const tax = taxonomy || loadTaxonomy();
  const spec = (tax.metrics || {})[metricId];
  const kind = (spec && spec.unit) || 'currency_or_percent';
  if (kind === 'count' || kind === 'shares') return COUNT.test(String(text || ''));
  const units = new Set(parseAmounts(text || '').map((a) => a.unit));
  if (kind === 'currency') return units.has('currency');
  if (kind === 'percent') return units.has('percent');
  return units.has('currency') || units.has('percent');
}

function contextRow(c, mid, reason) {
  return {
    id: c.id,
    metric_id: mid,
    text: c.text,
    as_of: c.as_of,
    grade: c.grade,
    source_id: c.source_id,
    reason,
  };
}

export function liveClaims(claims, rules, residualCap = 8, gapsOut = null, opts = {}) {
  const tax = loadTaxonomy();
  const slots = taggedSlots((opts && opts.facts) || [], tax);
  const buckets = {};
  const residual = [];
  const context = [];
  const gaps = [];
  const seen = new Set();
  const newer = new Map();
  const blocked = new Map();
  const base = Object.keys(slots).length;
  const addGap = (msg) => {
    if (!seen.has(msg)) {
      seen.add(msg);
      gaps.push(msg);
    }
  };
  (claims || []).forEach((c, j) => {
    const i = base + j;
    const text = c.text || '';
    const classified = classifyClaim(c, rules);
    for (const note of classified.notes || []) addGap(note);
    if (parseAsOf(c.as_of).precision === 'fiscal_label') addGap(FISCAL_GAP);
    const mid = classified.metric_id;
    if (mid) {
      if (Object.prototype.hasOwnProperty.call(slots, mid)) {
        context.push({ i, row: contextRow(c, mid, 'tagged_slot') });
        const slotKey = parseAsOf(slots[mid].as_of).sort_key || '';
        const ownKey = parseAsOf(c.as_of).sort_key || '';
        if (ownKey > slotKey) newer.set(mid, (newer.get(mid) || 0) + 1);
      } else if (!sentenceFillAllowed(mid, tax)) {
        if (sentenceHasAmount(mid, text, tax)) {
          context.push({ i, row: contextRow(c, mid, 'no_tagged_fact') });
          blocked.set(mid, (blocked.get(mid) || 0) + 1);
        } else {
          context.push({ i, row: contextRow(c, mid, 'no_amount') });
        }
      } else if (!sentenceHasAmount(mid, text, tax)) {
        context.push({ i, row: contextRow(c, mid, 'no_amount') });
      } else {
        if (!buckets[mid]) buckets[mid] = [];
        buckets[mid].push({ c, i });
      }
    } else if (hasFigure(text)) {
      residual.push({ c, i });
    }
  });
  for (const [mid, n] of newer) {
    addGap(`${mid}: ${n} newer sentence(s) not used; live value is the tagged ${slots[mid].as_of} fact`);
  }
  for (const [mid, n] of blocked) addGap(HEADLINE_GAP(mid, n));
  const indexed = [];
  Object.values(slots).forEach((row, k) => indexed.push({ i: k, row: { ...row } }));
  const filled = Object.keys(buckets);
  if (filled.length) addGap(SENTENCE_GAP + [...filled].sort().join(', '));
  for (const [mid, group] of Object.entries(buckets)) {
    const ordered = [...group].sort((x, y) => compareClaimsNewestFirst(x.c, y.c, x.i, y.i));
    indexed.push({ i: ordered[0].i, row: { ...ordered[0].c, metric_id: mid, origin: 'sentence', confidence: 'low' } });
  }
  if (residual.length > residualCap) {
    addGap(`${residual.length - residualCap} unclassified numbered claims omitted`);
  }
  residual
    .sort((x, y) => compareClaimsNewestFirst(x.c, y.c, x.i, y.i))
    .slice(0, residualCap)
    .forEach((item) => indexed.push({ i: item.i, row: { ...item.c, metric_id: 'other' } }));
  indexed.sort((x, y) => compareClaimsNewestFirst(x.row, y.row, x.i, y.i));
  if (Array.isArray(gapsOut)) gapsOut.push(...gaps);
  if (opts && Array.isArray(opts.contextOut)) {
    context.sort((x, y) => compareClaimsNewestFirst(x.row, y.row, x.i, y.i));
    opts.contextOut.push(...context.map((item) => item.row));
  }
  return indexed.map((item) => item.row);
}

export function packClaim(c) {
  const row = {
    id: c.id,
    metric_id: c.metric_id,
    text: c.text,
    as_of: c.as_of,
    grade: c.grade,
    source_id: c.source_id,
  };
  if (c.origin) {
    row.origin = c.origin;
    row.confidence = c.confidence;
  }
  if (c.origin === 'xbrl') {
    for (const key of ['concept', 'value', 'unit']) row[key] = c[key];
  }
  return row;
}

export function contextClaim(c) {
  return {
    id: c.id,
    metric_id: c.metric_id,
    text: String(c.text || '').slice(0, 240),
    as_of: c.as_of,
    reason: c.reason,
  };
}

export function riskMetric(name, rules) {
  const t = String(name || '').toLowerCase();
  for (const row of (rules && rules.risk_metric) || []) {
    if (phraseIn(t, String(row[0]))) return String(row[1]);
  }
  return null;
}

export function claimGaps(claims, rules, residualCap = 8, facts = null) {
  const gaps = [];
  liveClaims(claims, rules, residualCap, gaps, { facts: facts || [] });
  return gaps;
}

export function assembleAgentPack(store, rules) {
  const gaps = [];
  const context = [];
  const live = liveClaims(store.claims || [], rules, 8, gaps, {
    facts: Array.isArray(store.facts) ? store.facts : [],
    contextOut: context,
  });
  const pinRisks = (store.risks || []).filter((r) => {
    const st = String(r.status || '').toUpperCase();
    return st === 'WATCH' || st === 'FIRED';
  });
  const storeGaps = Array.isArray(store.gaps) ? store.gaps : [];
  const merged = storeGaps.slice();
  for (const g of gaps) if (!merged.includes(g)) merged.push(g);
  const pack = {
    schema: 'contextpack.v2',
    intent: 'agent',
    compiled_at: store.compiled_at || null,
    house_prior: store.house_prior || null,
    pin: {
      watch: (store.risk_summary || {}).watch || [],
      fired: (store.risk_summary || {}).fired || [],
      risks: pinRisks.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        grade: r.grade || null,
        summary: r.summary || '',
      })),
    },
    claims: live.map(packClaim),
    context_claims: context.slice(0, CONTEXT_CAP).map(contextClaim),
    store_claims: (store.claims || []).length,
    gaps: merged,
    decision_support_only: true,
  };
  return enforceCharBudget(pack, OVERVIEW_BUDGET_CHARS);
}

/** Same cap as ontology/paths.py OVERVIEW_BUDGET_CHARS. Not raised per ticker. */
export const OVERVIEW_BUDGET_CHARS = 10000;

const HOUSE_PRIOR_KEYS = ['play', 'status', 'date', 'view_excerpt'];
const PACK_KEYS = new Set([
  'schema', 'intent', 'focus', 'compiled_at', 'house_prior', 'object', 'claims',
  'risk_summary', 'risks', 'series_snapshot', 'catalysts', 'sources', 'related',
  'gaps', 'provenance', 'pin', 'superseded_count', 'stale_tripwires', 'store_claims',
  'context_claims', 'decision_support_only', 'budget', 'available', 'ticker', 'slug', 'pack_path',
  'contextpack', 'sor_ahead_of_pack', 'note',
]);

function addGap(pack, msg) {
  const gaps = Array.isArray(pack.gaps) ? pack.gaps.slice() : [];
  if (!gaps.includes(msg)) gaps.push(msg);
  pack.gaps = gaps;
}

function seal(pack, limit, trimmed, measure) {
  pack.budget = { limit_chars: limit, used_chars: 0, trimmed: !!trimmed };
  let n = 0;
  for (let i = 0; i < 4; i++) {
    n = measure(pack);
    if (pack.budget.used_chars === n) return n;
    pack.budget.used_chars = n;
  }
  return measure(pack);
}

function allowlist(pack) {
  let changed = false;
  const hp = pack.house_prior;
  if (hp && typeof hp === 'object' && !Array.isArray(hp)) {
    const dropped = Object.keys(hp).filter((k) => !HOUSE_PRIOR_KEYS.includes(k));
    const kept = {};
    for (const key of HOUSE_PRIOR_KEYS) {
      if (Object.prototype.hasOwnProperty.call(hp, key)) kept[key] = hp[key];
    }
    pack.house_prior = kept;
    for (const key of dropped) addGap(pack, `dropped house_prior.${key}`);
    if (dropped.length) changed = true;
  }
  for (const key of Object.keys(pack)) {
    if (!PACK_KEYS.has(key)) {
      delete pack[key];
      addGap(pack, `dropped key ${key}`);
      changed = true;
    }
  }
  return changed;
}

function clipClaimTexts(pack, n, metricId) {
  let changed = false;
  const out = [];
  for (const claim of pack.claims || []) {
    if (!claim || typeof claim !== 'object') {
      out.push(claim);
      continue;
    }
    const row = { ...claim };
    if (metricId == null || row.metric_id === metricId) {
      if (typeof row.text === 'string' && row.text.length > n) {
        row.text = row.text.slice(0, n);
        changed = true;
      }
    }
    out.push(row);
  }
  if (changed) pack.claims = out;
  return changed;
}

function clipObject(pack, n) {
  const obj = pack.object;
  if (!obj || typeof obj !== 'object') return false;
  const row = { ...obj };
  let changed = false;
  for (const key of ['summary', 'role_in_theses']) {
    if (typeof row[key] === 'string' && row[key].length > n) {
      row[key] = row[key].slice(0, n);
      changed = true;
    }
  }
  if (Array.isArray(row.stance) && row.stance.length > 4) {
    row.stance = row.stance.slice(0, 4);
    changed = true;
  }
  if (changed) pack.object = row;
  return changed;
}

function clipRisks(pack, summaryN, tripN) {
  if (!Array.isArray(pack.risks)) return false;
  let changed = false;
  const out = pack.risks.map((risk) => {
    if (!risk || typeof risk !== 'object') return risk;
    const row = { ...risk };
    if (typeof row.summary === 'string' && row.summary.length > summaryN) {
      row.summary = row.summary.slice(0, summaryN);
      changed = true;
    }
    if (tripN != null && Array.isArray(row.tripwires) && row.tripwires.length > tripN) {
      row.tripwires = row.tripwires.slice(0, tripN);
      changed = true;
    }
    return row;
  });
  if (changed) pack.risks = out;
  return changed;
}

function clipPin(pack, n) {
  const pin = pack.pin;
  if (!pin || typeof pin !== 'object' || !Array.isArray(pin.risks)) return false;
  let changed = false;
  const risks = pin.risks.map((risk) => {
    if (!risk || typeof risk !== 'object') return risk;
    const row = { ...risk };
    if (typeof row.summary === 'string' && row.summary.length > n) {
      row.summary = row.summary.slice(0, n);
      changed = true;
    }
    return row;
  });
  if (!changed) return false;
  pack.pin = { ...pin, risks };
  return true;
}

function clipExcerpt(pack, n) {
  const hp = pack.house_prior;
  if (!hp || typeof hp !== 'object') return false;
  if (typeof hp.view_excerpt !== 'string' || hp.view_excerpt.length <= n) return false;
  pack.house_prior = { ...hp, view_excerpt: hp.view_excerpt.slice(0, n) };
  return true;
}

function clipProvenance(pack, n) {
  const prov = pack.provenance;
  if (!prov || typeof prov !== 'object') return false;
  if (typeof prov.note !== 'string' || prov.note.length <= n) return false;
  pack.provenance = { note: prov.note.slice(0, n), pack_config: prov.pack_config || '' };
  return true;
}

function takeList(pack, key, n) {
  if (!Array.isArray(pack[key]) || pack[key].length <= n) return false;
  pack[key] = pack[key].slice(0, n);
  return true;
}

function clearList(pack, key) {
  if (!Array.isArray(pack[key]) || !pack[key].length) return false;
  pack[key] = [];
  return true;
}

function dropOtherClaims(pack) {
  const claims = (pack.claims || []).filter((c) => c && typeof c === 'object');
  const kept = claims.filter((c) => c.metric_id !== 'other');
  const dropped = claims.length - kept.length;
  if (!dropped) return false;
  pack.claims = kept;
  addGap(pack, `${dropped} residual claims omitted`);
  return true;
}

function isTaggedClaim(claim) {
  return !!(claim && (claim.origin === 'xbrl' || claim.confidence === 'tagged'));
}

function dropTailClaim(pack) {
  const claims = (pack.claims || []).filter((c) => c && typeof c === 'object');
  if (!claims.length) return false;
  let idx = -1;
  for (let i = claims.length - 1; i >= 0; i--) {
    if (!isTaggedClaim(claims[i])) {
      idx = i;
      break;
    }
  }
  if (idx < 0) idx = claims.length - 1;
  const dropped = claims[idx];
  pack.claims = claims.filter((_, i) => i !== idx);
  addGap(pack, `dropped claim ${dropped.id || dropped.metric_id || 'claim'}`);
  return true;
}

function dropUntaggedClaims(pack) {
  const claims = (pack.claims || []).filter((c) => c && typeof c === 'object');
  const kept = claims.filter(isTaggedClaim);
  const dropped = claims.length - kept.length;
  if (!dropped) return false;
  pack.claims = kept;
  addGap(pack, `${dropped} untagged claims omitted`);
  return true;
}

function stubPack(pack, limit, measure) {
  const focus = pack.focus && typeof pack.focus === 'object' ? pack.focus : {};
  const hp = pack.house_prior && typeof pack.house_prior === 'object' ? pack.house_prior : {};
  let gaps = (pack.gaps || []).filter((g) => typeof g === 'string' && g.length <= 180);
  if (!gaps.includes('pack was over budget')) gaps.push('pack was over budget');
  const stub = {
    focus: { id: String(focus.id || '').slice(0, 64), ticker: String(focus.ticker || '').slice(0, 16) },
    intent: String(pack.intent || 'overview').slice(0, 32),
    house_prior: {
      status: String(hp.status || '').slice(0, 32),
      date: String(hp.date || '').slice(0, 32),
    },
    gaps: gaps.slice(0, 12),
    claims: [],
    budget: { limit_chars: limit, used_chars: 0, trimmed: true },
  };
  if (measure(stub) > limit) {
    stub.gaps = ['pack was over budget'];
    stub.focus = { ticker: String(stub.focus.ticker || '').slice(0, 12) };
  }
  seal(stub, limit, true, measure);
  return stub;
}

export function enforceCharBudget(pack, limit = OVERVIEW_BUDGET_CHARS, measure = null) {
  const size = measure || ((p) => JSON.stringify(p).length);
  const cap = Number(limit);
  let trimmed = allowlist(pack);
  const fits = () => seal(pack, cap, trimmed, size) <= cap;
  if (fits()) return pack;
  trimmed = true;
  const steps = [
    () => clearList(pack, 'related'),
    () => clearList(pack, 'context_claims'),
    () => clipClaimTexts(pack, 480, 'other'),
    () => clipClaimTexts(pack, 480, null),
    () => clipObject(pack, 300),
    () => clipRisks(pack, 160, 2),
    () => clipPin(pack, 160),
    () => clipExcerpt(pack, 500),
    () => clipProvenance(pack, 120),
    () => takeList(pack, 'catalysts', 4),
    () => takeList(pack, 'series_snapshot', 4),
    () => takeList(pack, 'sources', 4),
    () => clipExcerpt(pack, 200),
    () => clipClaimTexts(pack, 160, 'other'),
    () => clipClaimTexts(pack, 160, null),
    () => dropOtherClaims(pack),
    () => clipClaimTexts(pack, 80, null),
    () => clipExcerpt(pack, 80),
    () => clearList(pack, 'catalysts'),
    () => clearList(pack, 'series_snapshot'),
    () => clearList(pack, 'sources'),
    () => takeList(pack, 'risks', 2),
    () => dropTailClaim(pack),
    () => dropTailClaim(pack),
    () => dropTailClaim(pack),
    () => dropTailClaim(pack),
    () => dropUntaggedClaims(pack),
    () => dropTailClaim(pack),
    () => dropTailClaim(pack),
    () => clearList(pack, 'claims'),
    () => clearList(pack, 'risks'),
    () => clearList(pack, 'stale_tripwires'),
  ];
  for (const step of steps) {
    if (fits()) return pack;
    step();
  }
  if (fits()) return pack;
  const stub = stubPack(pack, cap, size);
  for (const key of Object.keys(pack)) delete pack[key];
  Object.assign(pack, stub);
  if (size(pack) > cap) {
    for (const key of Object.keys(pack)) delete pack[key];
    Object.assign(pack, {
      gaps: ['pack was over budget'],
      budget: { limit_chars: cap, used_chars: 0, trimmed: true },
    });
    seal(pack, cap, true, size);
  }
  return pack;
}
