// learnDeep.js — on-demand product-mechanism deep-dives for the Study Tree.
// Vault: cockpit/learn/{TICKER}/deep/{node_id}/  NOT pack / house / Model / Street / thesis lane.
// Craft of a Reports deep-dive (setup · mechanism · evidence · figure · GAP · exec).
// Not house-as-chapter, not register, not propose_*, not scripts/report.
// Decision-support only. Deepen must never remint learner.json.
import fs from 'fs';
import path from 'path';
import { adviceHits, topicId, sanitizeTicker } from './learnSchema.js';

export const DEEP_SCHEMA_VERSION = 1;
export const DEEP_HARD_MIN_WORDS = 400;
export const DEEP_READY_WORDS = 1800;
export const DEEP_MAX_CHARS = 200_000;
export const DEEP_NOTES_MAX = 80;

/** Required ## headings (matched case-insensitive against heading text). */
export const DEEP_REQUIRED_SECTIONS = Object.freeze([
  { id: 'setup', re: /\bsetup\b/i },
  { id: 'mechanism', re: /\bmechanism\b/i },
  { id: 'evidence', re: /\b(evidence|anchors?)\b/i },
  { id: 'figure', re: /\b(what a figure is not|figure is not|\bfigure\b)/i },
  { id: 'gaps', re: /\b(gaps?|unknown)\b/i },
  { id: 'exec', re: /\bexec(utive)?\b/i },
]);

export const DEEP_ORDER = Object.freeze([
  'setup',
  'mechanism',
  'evidence',
  'what-a-figure-is-not',
  'gaps',
  'exec',
]);

function str(v) {
  return v == null ? '' : String(v).trim();
}

export function wordCount(text) {
  return str(text).split(/\s+/).filter(Boolean).length;
}

export function deepDir(learnRoot) {
  if (!learnRoot) return null;
  return path.join(learnRoot, 'deep');
}

export function deepNodeDir(learnRoot, nodeId) {
  const dir = deepDir(learnRoot);
  const id = topicId(nodeId);
  if (!dir || !id) return null;
  return path.join(dir, id);
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function readUtf(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function fileMtime(file) {
  try {
    return fs.statSync(file).mtime.toISOString();
  } catch {
    return null;
  }
}

function safeNodeId(raw) {
  const id = topicId(raw);
  if (!id) return null;
  if (id === '.' || id === '..') return null;
  if (id.includes('/') || id.includes('\\')) return null;
  return id;
}

export function extractHeadings(markdown) {
  const out = [];
  const lines = String(markdown || '').split(/\n/);
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+?)\s*$/);
    if (!m) continue;
    out.push(str(m[1]).slice(0, 160));
  }
  return out;
}

export function scoreDeepMarkdown(markdown) {
  const md = str(markdown);
  const words = wordCount(md);
  const headings = extractHeadings(md);
  const blob = headings.join(' · ');
  const present = [];
  const missing = [];
  for (const sec of DEEP_REQUIRED_SECTIONS) {
    if (sec.re.test(blob)) present.push(sec.id);
    else missing.push(sec.id);
  }
  const thin = words < DEEP_READY_WORDS || missing.length > 0;
  return {
    n_chars: md.length,
    n_words: words,
    sections: present,
    missing_sections: missing,
    thin,
    headings,
  };
}

export function validateDeepMarkdown(markdown) {
  const md = str(markdown);
  if (!md) return { ok: false, error: 'deep-dive markdown empty' };
  if (md.length > DEEP_MAX_CHARS) {
    return { ok: false, error: `deep-dive too long (${md.length} > ${DEEP_MAX_CHARS})` };
  }
  if (adviceHits(md)) return { ok: false, error: 'advice language rejected (no buy/sell/PT)' };
  const words = wordCount(md);
  if (words < DEEP_HARD_MIN_WORDS) {
    return { ok: false, error: `deep-dive ${words} words < ${DEEP_HARD_MIN_WORDS} hard floor` };
  }
  return { ok: true, markdown: md, score: scoreDeepMarkdown(md) };
}

function emptyMeta(ticker, nodeId, extra = {}) {
  return {
    schema_version: DEEP_SCHEMA_VERSION,
    ticker: sanitizeTicker(ticker) || null,
    node_id: nodeId,
    title: extra.title || nodeId,
    status: extra.status || 'running',
    started_at: extra.started_at || null,
    published_at: extra.published_at || null,
    updated_at: extra.updated_at || null,
    n_chars: extra.n_chars || 0,
    n_words: extra.n_words || 0,
    sections: extra.sections || [],
    missing_sections: extra.missing_sections || [],
    thin: extra.thin !== false,
    as_of: extra.as_of || null,
    sources: Array.isArray(extra.sources) ? extra.sources : [],
    error: extra.error || null,
    decision_support_only: true,
  };
}

function readMetaFile(file, ticker, nodeId) {
  const raw = readUtf(file);
  if (!raw) return null;
  try {
    const j = JSON.parse(raw);
    if (!j || typeof j !== 'object') return null;
    return {
      ...emptyMeta(ticker, nodeId),
      ...j,
      node_id: nodeId,
      ticker: sanitizeTicker(j.ticker || ticker) || null,
    };
  } catch {
    return null;
  }
}

function writeMeta(dir, meta) {
  ensureDir(dir);
  const file = path.join(dir, 'meta.json');
  fs.writeFileSync(file, `${JSON.stringify(meta, null, 2)}\n`, 'utf8');
  return file;
}

/**
 * List deep-dive metas for a learn root. No markdown bodies.
 * @param {string} learnRoot
 * @param {string} ticker
 */
export function listDeepNotes(learnRoot, ticker) {
  const root = deepDir(learnRoot);
  if (!root || !fs.existsSync(root)) return [];
  let names = [];
  try {
    names = fs.readdirSync(root);
  } catch {
    return [];
  }
  const out = [];
  for (const name of names) {
    const id = safeNodeId(name);
    if (!id || id !== name) continue;
    const dir = path.join(root, id);
    let st;
    try {
      st = fs.statSync(dir);
    } catch {
      continue;
    }
    if (!st.isDirectory()) continue;
    const noteFile = path.join(dir, 'note.md');
    const metaFile = path.join(dir, 'meta.json');
    const md = fs.existsSync(noteFile) ? (readUtf(noteFile) || '') : '';
    const scored = md ? scoreDeepMarkdown(md) : null;
    const prior = readMetaFile(metaFile, ticker, id) || emptyMeta(ticker, id);
    const hasNote = md.length > 0;
    let status;
    if (prior.status === 'running') status = 'running';
    else if (hasNote) status = 'fired';
    else if (prior.status === 'failed') status = 'failed';
    else status = 'running';
    const row = {
      ...prior,
      node_id: id,
      status,
      n_chars: scored ? scored.n_chars : (prior.n_chars || 0),
      n_words: scored ? scored.n_words : (prior.n_words || 0),
      sections: scored ? scored.sections : (prior.sections || []),
      missing_sections: scored ? scored.missing_sections : (prior.missing_sections || []),
      thin: scored ? scored.thin : true,
      updated_at: fileMtime(hasNote ? noteFile : metaFile) || prior.updated_at,
      has_note: hasNote,
    };
    out.push(row);
    if (out.length >= DEEP_NOTES_MAX) break;
  }
  out.sort((a, b) => String(a.node_id).localeCompare(String(b.node_id)));
  return out;
}

/**
 * Mark a node running. Keeps an existing note.md so FIRED content stays readable.
 * @param {string} learnRoot
 * @param {string} ticker
 * @param {string} nodeId
 * @param {{ title?: string }} [opts]
 */
export function startDeepNote(learnRoot, ticker, nodeId, opts = {}) {
  const id = safeNodeId(nodeId);
  if (!learnRoot || !id) return { ok: false, error: 'bad deep node id' };
  const dir = deepNodeDir(learnRoot, id);
  const now = new Date().toISOString();
  const priorList = listDeepNotes(learnRoot, ticker);
  const prior = priorList.find((n) => n.node_id === id);
  const meta = emptyMeta(ticker, id, {
    title: opts.title || prior?.title || id,
    status: 'running',
    started_at: now,
    published_at: prior?.published_at || null,
    updated_at: now,
    n_chars: prior?.n_chars || 0,
    n_words: prior?.n_words || 0,
    sections: prior?.sections || [],
    missing_sections: prior?.missing_sections || [],
    thin: prior ? prior.thin : true,
    as_of: prior?.as_of || null,
    sources: prior?.sources || [],
  });
  writeMeta(dir, meta);
  return { ok: true, meta };
}

/**
 * Read one deep-dive (markdown + meta). Path-jailed.
 */
export function readDeepNote(learnRoot, ticker, nodeId) {
  const id = safeNodeId(nodeId);
  if (!learnRoot || !id) return { ok: false, error: 'bad deep node id' };
  const dir = deepNodeDir(learnRoot, id);
  const noteFile = path.join(dir, 'note.md');
  const metaFile = path.join(dir, 'meta.json');
  if (!fs.existsSync(metaFile) && !fs.existsSync(noteFile)) {
    return { ok: false, error: 'deep-dive not found' };
  }
  const md = fs.existsSync(noteFile) ? (readUtf(noteFile) || '') : '';
  const listed = listDeepNotes(learnRoot, ticker).find((n) => n.node_id === id);
  const meta = listed || emptyMeta(ticker, id);
  return {
    ok: true,
    id,
    ticker: sanitizeTicker(ticker) || null,
    markdown: md,
    meta,
  };
}

/**
 * Publish a deep-dive note. Caller is responsible for learner remint guard.
 */
export function writeDeepNote(learnRoot, ticker, nodeId, markdown, opts = {}) {
  const id = safeNodeId(nodeId);
  if (!learnRoot || !id) return { ok: false, error: 'bad deep node id' };
  const gate = validateDeepMarkdown(markdown);
  if (!gate.ok) return { ok: false, error: gate.error };
  const dir = deepNodeDir(learnRoot, id);
  ensureDir(dir);
  const now = new Date().toISOString();
  const score = gate.score;
  const prior = listDeepNotes(learnRoot, ticker).find((n) => n.node_id === id);
  const sources = Array.isArray(opts.sources) ? opts.sources.slice(0, 12) : (prior?.sources || []);
  const asOf = str(opts.as_of || opts.asOf).slice(0, 32) || prior?.as_of || null;
  const title = str(opts.title).slice(0, 160) || prior?.title || id;
  const md = gate.markdown.startsWith('#') ? gate.markdown : `# ${title}\n\n${gate.markdown}`;
  const noteFile = path.join(dir, 'note.md');
  fs.writeFileSync(noteFile, `${md.replace(/\s+$/, '')}\n`, 'utf8');
  const scored = scoreDeepMarkdown(md);
  const meta = emptyMeta(ticker, id, {
    title,
    status: 'fired',
    started_at: prior?.started_at || now,
    published_at: now,
    updated_at: now,
    n_chars: scored.n_chars,
    n_words: scored.n_words,
    sections: scored.sections,
    missing_sections: scored.missing_sections,
    thin: scored.thin,
    as_of: asOf,
    sources,
  });
  writeMeta(dir, meta);
  return { ok: true, meta, score: { ...score, ...scored } };
}

/** Pad a structurally complete note to the ready word floor (tests only). */
export function fixtureDeepNoteMarkdown(title, extra = '') {
  const body = [
    `# ${title}`,
    '',
    'Decision-support only. Not House. Not Model numbers. Not a rating. Not a thesis PDF.',
    '',
    '## Setup',
    '',
    'This note is a product-mechanism deep-dive on one Study Tree node. It is not a house',
    'chapter, not a register update, and not a coverage initiation. As-of and source pins',
    'belong in English (FY 10-K Item 1, IR deck), never as wikilinks.',
    extra || 'The filing names the product family; adjacent objects people confuse it with are named below.',
    '',
    '## Mechanism',
    '',
    'How the product actually sits in the stack: what is designed in-house, what is attached,',
    'what a partner builds, and which company words are load-bearing. Mechanism is the point',
    'of the sitting. Invented attach or a pretty topology is a GAP, not a diagram.',
    '',
    '## Evidence',
    '',
    '- Filed product language (YYYY-MM-DD) [A] FY 10-K Item 1.',
    '- IR cut, if used, is labeled IR — not a SKU split (YYYY-MM-DD) [A].',
    '- Soft press stays [soft]. Missing mix $ / named customers / utilization stay GAP.',
    '',
    '## What a figure is not',
    '',
    'A filed segment / platform / company line is not a SKU $, not utilization, and not the',
    'named identity of a customer the filing does not name. Contract / TCV / RPO / commitment',
    'is not last year\'s revenue. Tile size on architecture never encodes dollars.',
    '',
    '## GAP / UNKNOWN',
    '',
    '- SKU $ mix — not in the primary used here.',
    '- Named attach counterparties — UNKNOWN unless the filing names them.',
    '',
    '## Exec',
    '',
    'What this node is, what it is not, and which GAP still blocks a clean picture.',
    'No rating. No PT. No sizing. No propose_*.',
  ].join('\n');
  const pad = ' Company language, graded anchors, and honest GAP are the whole point of this node note.';
  let md = body;
  while (wordCount(md) < DEEP_READY_WORDS) md += pad;
  return `${md}\n`;
}
