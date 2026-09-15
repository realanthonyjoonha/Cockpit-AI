// learnSchema.js — format gate for Background primer + learner state.
// Vault: cockpit/learn/{TICKER}/ — NOT pack / house / Model / Street SoR.
// Decision-support only. Learner writes are merge-not-wipe (silence ≠ contradiction).

export const LEARN_SCHEMA_VERSION = 1;
export const PRIMER_MAX_CHARS = 100_000;
export const LESSON_MAX_CHARS = 40_000;
export const TOPIC_ID_MAX = 64;
export const TOPIC_LABEL_MAX = 160;
export const NOTE_MAX = 400;
export const LESSONS_MAX = 40;

const ADVICE_RE =
  /\b(should i (buy|sell)|you should (buy|sell)|we recommend|buy rating|sell rating|price target for you|fair value\s*\$|house (buy|sell|pt)|how many shares|position size)\b/i;

const EXPERIENCE = new Set(['learning', 'intermediate', 'experienced']);
const DEPTH = new Set(['quick', 'moderate', 'deep']);

function str(v) {
  return v == null ? '' : String(v).trim();
}

export function adviceHits(text) {
  return ADVICE_RE.test(String(text || ''));
}

export function sanitizeTicker(ticker) {
  return String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
}

export function topicId(raw) {
  const s = str(raw).toLowerCase().replace(/[^a-z0-9._-]+/g, '-').replace(/^-+|-+$/g, '').slice(0, TOPIC_ID_MAX);
  return s || null;
}

/**
 * @param {unknown} row
 * @returns {{ id: string, label: string, note?: string, as_of?: string }|null}
 */
export function normalizeTopic(row) {
  if (row == null) return null;
  if (typeof row === 'string') {
    const label = str(row).slice(0, TOPIC_LABEL_MAX);
    const id = topicId(label);
    if (!id || !label) return null;
    return { id, label };
  }
  if (typeof row !== 'object') return null;
  const label = str(row.label || row.name || row.topic || row.id).slice(0, TOPIC_LABEL_MAX);
  const id = topicId(row.id || label);
  if (!id || !label) return null;
  const out = { id, label };
  const note = str(row.note || row.why).slice(0, NOTE_MAX);
  if (note) out.note = note;
  const asOf = str(row.as_of || row.at).slice(0, 32);
  if (asOf) out.as_of = asOf;
  return out;
}

function topicList(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    const t = normalizeTopic(row);
    if (!t || seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(t);
    if (out.length >= 80) break;
  }
  return out;
}

export function emptyLearner(ticker) {
  return {
    schema_version: LEARN_SCHEMA_VERSION,
    ticker: sanitizeTicker(ticker) || null,
    updated_at: null,
    style: { experience: 'learning', depth: 'moderate' },
    known: [],
    fuzzy: [],
    next: [],
    last_session: null,
  };
}

/**
 * Merge incoming learner patch onto prior.
 * Omitted arrays are kept (silence is not contradiction).
 * Known / fuzzy / next all upsert. Known ids are dropped from fuzzy and next.
 */
export function mergeLearner(prior, incoming, ticker, opts = {}) {
  const base = emptyLearner(ticker);
  const prev = prior && typeof prior === 'object' ? prior : {};
  const next = incoming && typeof incoming === 'object' ? incoming : {};

  const styleIn = next.style && typeof next.style === 'object' ? next.style : {};
  const stylePrev = prev.style && typeof prev.style === 'object' ? prev.style : {};
  const experience = EXPERIENCE.has(str(styleIn.experience).toLowerCase())
    ? str(styleIn.experience).toLowerCase()
    : (EXPERIENCE.has(str(stylePrev.experience).toLowerCase()) ? str(stylePrev.experience).toLowerCase() : base.style.experience);
  const depth = DEPTH.has(str(styleIn.depth).toLowerCase())
    ? str(styleIn.depth).toLowerCase()
    : (DEPTH.has(str(stylePrev.depth).toLowerCase()) ? str(stylePrev.depth).toLowerCase() : base.style.depth);

  const knownPrev = topicList(prev.known) || [];
  const fuzzyPrev = topicList(prev.fuzzy) || [];
  const nextPrev = topicList(prev.next) || [];

  const knownIn = Object.prototype.hasOwnProperty.call(next, 'known') ? topicList(next.known) : null;
  const fuzzyIn = Object.prototype.hasOwnProperty.call(next, 'fuzzy') ? topicList(next.fuzzy) : null;
  const nextIn = Object.prototype.hasOwnProperty.call(next, 'next') ? topicList(next.next) : null;

  const knownMap = new Map(knownPrev.map((t) => [t.id, t]));
  if (knownIn) {
    for (const t of knownIn) knownMap.set(t.id, t);
  }
  const known = [...knownMap.values()];
  const knownIds = new Set(known.map((t) => t.id));

  const fuzzyMap = new Map(fuzzyPrev.map((t) => [t.id, t]));
  if (fuzzyIn) {
    for (const t of fuzzyIn) fuzzyMap.set(t.id, t);
  }
  const fuzzy = [...fuzzyMap.values()].filter((t) => !knownIds.has(t.id));

  const nextMap = new Map(nextPrev.map((t) => [t.id, t]));
  if (nextIn) {
    for (const t of nextIn) nextMap.set(t.id, t);
  }
  const nextTopics = [...nextMap.values()].filter((t) => !knownIds.has(t.id));

  let last = prev.last_session && typeof prev.last_session === 'object' ? prev.last_session : null;
  if (next.last_session && typeof next.last_session === 'object') {
    const covered = topicList(next.last_session.covered) || [];
    last = {
      at: str(next.last_session.at || new Date().toISOString()).slice(0, 40) || new Date().toISOString(),
      covered: covered.map((t) => t.id),
      note: str(next.last_session.note).slice(0, NOTE_MAX) || undefined,
    };
  }

  const touch = opts.touch !== false;
  return {
    schema_version: LEARN_SCHEMA_VERSION,
    ticker: sanitizeTicker(ticker || next.ticker || prev.ticker) || null,
    updated_at: touch ? new Date().toISOString() : (str(prev.updated_at).slice(0, 40) || null),
    style: { experience, depth },
    known,
    fuzzy,
    next: nextTopics,
    last_session: last,
  };
}

export function validatePrimerMarkdown(markdown) {
  const md = str(markdown);
  if (!md) return { ok: false, error: 'primer markdown empty' };
  if (md.length > PRIMER_MAX_CHARS) return { ok: false, error: `primer too long (${md.length} > ${PRIMER_MAX_CHARS})` };
  if (adviceHits(md)) return { ok: false, error: 'advice language rejected (no buy/sell/PT)' };
  return { ok: true, markdown: md };
}

export function validateLessonMarkdown(markdown) {
  const md = str(markdown);
  if (!md) return { ok: false, error: 'lesson markdown empty' };
  if (md.length > LESSON_MAX_CHARS) return { ok: false, error: `lesson too long (${md.length} > ${LESSON_MAX_CHARS})` };
  if (adviceHits(md)) return { ok: false, error: 'advice language rejected (no buy/sell/PT)' };
  return { ok: true, markdown: md };
}

export function primerTitleFromMarkdown(markdown, fallback) {
  const m = String(markdown || '').match(/^#\s+(.+)$/m);
  if (m) return str(m[1]).slice(0, 160);
  return str(fallback).slice(0, 160) || 'Background';
}
