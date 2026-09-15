// thinLearn.js — Background primer + learner state + optional lessons.
// Vault: cockpit/learn/{TICKER}/  NOT pack / house / Model / Street.
// Decision-support only. Learner merge is silent-ok (not book SoR).
import fs from 'fs';
import path from 'path';
import { marked } from 'marked';
import { resolveVaultDir } from './monorepoPaths.js';
import {
  LEARN_SCHEMA_VERSION,
  LESSONS_MAX,
  adviceHits,
  emptyLearner,
  mergeLearner,
  primerTitleFromMarkdown,
  sanitizeTicker,
  topicId,
  validateLessonMarkdown,
  validatePrimerMarkdown,
} from './learnSchema.js';
import { LEARN_FAMILIES, scoreLearnDepth, validateProductMap } from './learnMap.js';
import { decorateLearnPhotos } from './learnPhotos.js';
import {
  listDeepNotes,
  startDeepNote,
  readDeepNote,
  writeDeepNote,
} from './learnDeep.js';

function vaultRoot() {
  return resolveVaultDir();
}

export function learnDir(ticker) {
  const id = sanitizeTicker(ticker);
  if (!id) return null;
  return path.join(vaultRoot(), 'cockpit', 'learn', id);
}

export function primerPath(ticker) {
  const dir = learnDir(ticker);
  return dir ? path.join(dir, 'primer.md') : null;
}

export function learnerPath(ticker) {
  const dir = learnDir(ticker);
  return dir ? path.join(dir, 'learner.json') : null;
}

export function lessonsDir(ticker) {
  const dir = learnDir(ticker);
  return dir ? path.join(dir, 'lessons') : null;
}

export function productMapPath(ticker) {
  const dir = learnDir(ticker);
  return dir ? path.join(dir, 'product-map.json') : null;
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

/** Strip script/handlers so vault markdown cannot run on glass. */
export function sanitizeLearnHtml(html) {
  return String(html || '')
    .replace(/<script\b[\s\S]*?<\/script>/gi, '')
    .replace(/<style\b[\s\S]*?<\/style>/gi, '')
    .replace(/<iframe\b[\s\S]*?<\/iframe>/gi, '')
    .replace(/<object\b[\s\S]*?<\/object>/gi, '')
    .replace(/<embed\b[^>]*>/gi, '')
    .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
    .replace(/javascript:/gi, '')
    .replace(/data:text\/html/gi, '');
}

function primerHtml(md) {
  try {
    const linked = String(md || '').replace(
      /\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g,
      (_, target, label) => (label || target).trim(),
    );
    return sanitizeLearnHtml(marked.parse(linked));
  } catch {
    return '';
  }
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

export function readLearner(ticker) {
  const file = learnerPath(ticker);
  const empty = emptyLearner(ticker);
  if (!file || !fs.existsSync(file)) return { ...empty, path: file || '' };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const merged = mergeLearner(empty, raw, ticker, { touch: false });
    if (raw.updated_at) merged.updated_at = String(raw.updated_at);
    return merged;
  } catch (e) {
    return { ...empty, path: file, error: e.message || String(e) };
  }
}

function listLessons(ticker) {
  const dir = lessonsDir(ticker);
  if (!dir || !fs.existsSync(dir)) return [];
  const names = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  const out = [];
  for (const name of names) {
    const abs = path.join(dir, name);
    const md = readUtf(abs) || '';
    const id = name.replace(/\.md$/i, '');
    out.push({
      id,
      title: primerTitleFromMarkdown(md, id),
      updated_at: fileMtime(abs),
      n_chars: md.length,
    });
    if (out.length >= LESSONS_MAX) break;
  }
  return out;
}

export function readProductMap(ticker) {
  const file = productMapPath(ticker);
  if (!file || !fs.existsSync(file)) return { present: false, map: null };
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    const gate = validateProductMap(raw, ticker);
    if (!gate.ok) return { present: true, map: null, error: gate.error, path: file };
    return {
      present: true,
      map: gate.map,
      path: file,
      updated_at: fileMtime(file),
    };
  } catch (e) {
    return { present: true, map: null, error: e.message || String(e), path: file };
  }
}

const NEXT_VIEW_CAP = 6;

/**
 * Read-path NEXT chips. Relabel map-node ids; append ready nodes not already
 * in known/fuzzy/next. Never writes learner.json.
 */
export function learnerNextView(learner, map) {
  const base = learner && typeof learner === 'object' ? learner : {};
  const diskNext = Array.isArray(base.next) ? base.next : [];
  const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
  if (!nodes.length) return { ...base, next: diskNext.slice() };
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const taken = new Set();
  for (const t of base.known || []) if (t?.id) taken.add(t.id);
  for (const t of base.fuzzy || []) if (t?.id) taken.add(t.id);
  const view = [];
  for (const t of diskNext) {
    if (!t || !t.id) continue;
    const node = byId.get(t.id);
    const row = { id: t.id, label: node ? node.title : t.label };
    if (t.note) row.note = t.note;
    view.push(row);
    taken.add(t.id);
    if (view.length >= NEXT_VIEW_CAP) break;
  }
  if (view.length < NEXT_VIEW_CAP) {
    for (const n of nodes) {
      if (view.length >= NEXT_VIEW_CAP) break;
      if (!n || n.status !== 'ready' || taken.has(n.id)) continue;
      view.push({ id: n.id, label: n.title, derived: true });
      taken.add(n.id);
    }
  }
  return { ...base, next: view };
}

function slimMap(map, extra = {}) {
  if (!map) return null;
  const ticker = extra.ticker || map.ticker;
  const slug = extra.desk || extra.slug || null;
  return {
    schema_version: map.schema_version,
    ticker: map.ticker,
    family: map.family,
    as_of: map.as_of,
    updated_at: extra.updated_at || map.updated_at || null,
    sources: map.sources || [],
    not_this: map.not_this || [],
    gaps: map.gaps || [],
    nodes: map.nodes || [],
    diagrams: Array.isArray(map.diagrams) ? map.diagrams : [],
    diagram_order: (LEARN_FAMILIES[map.family] && LEARN_FAMILIES[map.family].required_diagrams)
      ? LEARN_FAMILIES[map.family].required_diagrams.slice()
      : ['stack', 'flow', 'segments', 'interconnect'],
    photos: decorateLearnPhotos(map.photos, { ticker, slug, nodes: map.nodes }),
    decision_support_only: true,
  };
}

/**
 * @param {string} ticker
 * @param {{ desk?: string }} [opts]
 */
export function getLearnSnapshot(ticker, opts = {}) {
  const id = sanitizeTicker(ticker);
  const desk = opts.desk || null;
  if (!id) {
    return {
      available: false,
      reason: 'empty ticker',
      ticker: null,
      desk,
      learner: emptyLearner(''),
      lessons: [],
      deep: [],
    };
  }
  const pPath = primerPath(id);
  const md = pPath && fs.existsSync(pPath) ? readUtf(pPath) : null;
  const learnerDisk = readLearner(id);
  const lessons = listLessons(id);
  const mapRead = readProductMap(id);
  const learner = learnerNextView(learnerDisk, mapRead.map);
  const depth_gate = scoreLearnDepth({
    primerMarkdown: md || '',
    lessons,
    map: mapRead.map,
  });
  const mapPayload = mapRead.map
    ? slimMap(mapRead.map, { updated_at: mapRead.updated_at, ticker: id, desk })
    : null;
  const dir = learnDir(id);
  const deep = listDeepNotes(dir, id);
  if (!md) {
    return {
      available: false,
      needs_build: true,
      reason: 'No background primer yet — BUILD BACKGROUND',
      ticker: id,
      desk,
      schema_version: LEARN_SCHEMA_VERSION,
      primer: null,
      learner,
      lessons,
      map: mapPayload,
      map_error: mapRead.error || null,
      deep,
      depth_gate,
      path: dir,
      decision_support_only: true,
    };
  }
  return {
    available: true,
    needs_build: false,
    ticker: id,
    desk,
    schema_version: LEARN_SCHEMA_VERSION,
    primer: {
      markdown: md,
      html: primerHtml(md),
      title: primerTitleFromMarkdown(md, `${id} background`),
      updated_at: fileMtime(pPath),
      n_chars: md.length,
    },
    learner,
    lessons,
    map: mapPayload,
    map_error: mapRead.error || null,
    deep,
    depth_gate,
    path: dir,
    decision_support_only: true,
  };
}

export function publishPrimer(ticker, body = {}, opts = {}) {
  const id = sanitizeTicker(ticker);
  if (!id) return { ok: false, error: 'empty ticker' };
  const gate = validatePrimerMarkdown(body.markdown || body.body || body.primer);
  if (!gate.ok) return { ok: false, error: gate.error };
  const dir = learnDir(id);
  ensureDir(dir);
  const file = primerPath(id);
  fs.writeFileSync(file, `${gate.markdown.replace(/\s+$/, '')}\n`, 'utf8');
  return { ok: true, ...getLearnSnapshot(id, opts) };
}

export function publishLearner(ticker, body = {}, opts = {}) {
  const id = sanitizeTicker(ticker);
  if (!id) return { ok: false, error: 'empty ticker' };
  const blob = JSON.stringify(body || {});
  if (adviceHits(blob)) return { ok: false, error: 'advice language rejected (no buy/sell/PT)' };
  const prior = readLearner(id);
  const merged = mergeLearner(prior, body, id, { touch: true });
  const dir = learnDir(id);
  ensureDir(dir);
  const file = learnerPath(id);
  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return { ok: true, learner: merged, ...getLearnSnapshot(id, opts) };
}

export function getLesson(ticker, lessonId, opts = {}) {
  const id = sanitizeTicker(ticker);
  const lid = topicId(lessonId);
  const dir = lessonsDir(id);
  if (!id || !lid || !dir) return { ok: false, error: 'bad lesson id' };
  const file = path.join(dir, `${lid}.md`);
  if (!fs.existsSync(file)) return { ok: false, error: 'lesson not found' };
  const markdown = readUtf(file) || '';
  return {
    ok: true,
    id: lid,
    title: primerTitleFromMarkdown(markdown, lid),
    markdown,
    html: primerHtml(markdown),
    updated_at: fileMtime(file),
    ticker: id,
    desk: opts.desk || null,
  };
}

export function publishProductMap(ticker, body = {}, opts = {}) {
  const id = sanitizeTicker(ticker);
  if (!id) return { ok: false, error: 'empty ticker' };
  const raw = body.map && typeof body.map === 'object' ? body.map : body;
  const gate = validateProductMap(raw, id);
  if (!gate.ok) return { ok: false, error: gate.error };
  const dir = learnDir(id);
  ensureDir(dir);
  const file = productMapPath(id);
  const priorLearner = readLearner(id);
  const stamped = { ...gate.map, ticker: id, updated_at: new Date().toISOString() };
  fs.writeFileSync(file, `${JSON.stringify(stamped, null, 2)}\n`, 'utf8');
  const snap = getLearnSnapshot(id, opts);
  const afterLearner = readLearner(id);
  if (priorLearner.updated_at !== afterLearner.updated_at) {
    return { ok: false, error: 'map publish must not remint learner' };
  }
  return { ok: true, map: snap.map, ...snap };
}

function learnerStamp(ticker) {
  return readLearner(ticker).updated_at || null;
}

function guardLearner(ticker, priorStamp, payload) {
  const after = learnerStamp(ticker);
  if (priorStamp !== after) {
    return { ok: false, error: 'learn write must not remint learner' };
  }
  return payload;
}

/**
 * Mark a Study Tree node RUNNING. Requires a product-map node id.
 * Does not wipe an existing note.md (re-run keeps last FIRED readable).
 */
export function startLearnDeep(ticker, nodeId, opts = {}) {
  const id = sanitizeTicker(ticker);
  const nid = topicId(nodeId);
  if (!id) return { ok: false, error: 'empty ticker' };
  if (!nid) return { ok: false, error: 'deep node id missing' };
  const mapRead = readProductMap(id);
  if (!mapRead.map) return { ok: false, error: 'no product-map.json — BUILD BACKGROUND first' };
  const node = (mapRead.map.nodes || []).find((n) => n.id === nid);
  if (!node) return { ok: false, error: `node ${nid} not on product-map` };
  const dir = learnDir(id);
  ensureDir(dir);
  const prior = learnerStamp(id);
  const started = startDeepNote(dir, id, nid, { title: node.title || nid });
  if (!started.ok) return started;
  return guardLearner(id, prior, { ok: true, meta: started.meta, ...getLearnSnapshot(id, opts) });
}

export function getLearnDeep(ticker, nodeId, opts = {}) {
  const id = sanitizeTicker(ticker);
  const nid = topicId(nodeId);
  const dir = learnDir(id);
  if (!id || !nid || !dir) return { ok: false, error: 'bad deep node id' };
  const got = readDeepNote(dir, id, nid);
  if (!got.ok) return got;
  return {
    ok: true,
    id: nid,
    ticker: id,
    desk: opts.desk || null,
    title: got.meta?.title || nid,
    markdown: got.markdown || '',
    html: primerHtml(got.markdown || ''),
    meta: got.meta,
    updated_at: got.meta?.updated_at || null,
    decision_support_only: true,
  };
}

export function publishLearnDeep(ticker, body = {}, opts = {}) {
  const id = sanitizeTicker(ticker);
  if (!id) return { ok: false, error: 'empty ticker' };
  const nid = topicId(body.node_id || body.id || body.slug);
  if (!nid) return { ok: false, error: 'deep node id missing' };
  const mapRead = readProductMap(id);
  if (!mapRead.map) return { ok: false, error: 'no product-map.json — BUILD BACKGROUND first' };
  const node = (mapRead.map.nodes || []).find((n) => n.id === nid);
  if (!node) return { ok: false, error: `node ${nid} not on product-map` };
  const dir = learnDir(id);
  ensureDir(dir);
  const prior = learnerStamp(id);
  const written = writeDeepNote(dir, id, nid, body.markdown || body.body, {
    title: body.title || node.title || nid,
    as_of: body.as_of || body.asOf || node.as_of,
    sources: body.sources || node.sources,
  });
  if (!written.ok) return written;
  return guardLearner(id, prior, { ok: true, meta: written.meta, ...getLearnSnapshot(id, opts) });
}

export function publishLesson(ticker, body = {}, opts = {}) {
  const id = sanitizeTicker(ticker);
  if (!id) return { ok: false, error: 'empty ticker' };
  const gate = validateLessonMarkdown(body.markdown || body.body);
  if (!gate.ok) return { ok: false, error: gate.error };
  const lid = topicId(body.id || body.slug || primerTitleFromMarkdown(gate.markdown, 'lesson'));
  if (!lid) return { ok: false, error: 'lesson id missing' };
  const existing = listLessons(id);
  if (existing.length >= LESSONS_MAX && !existing.some((x) => x.id === lid)) {
    return { ok: false, error: `too many lessons (max ${LESSONS_MAX})` };
  }
  const dir = lessonsDir(id);
  ensureDir(dir);
  const file = path.join(dir, `${lid}.md`);
  const title = primerTitleFromMarkdown(gate.markdown, body.title || lid);
  const md = gate.markdown.startsWith('#') ? gate.markdown : `# ${title}\n\n${gate.markdown}`;
  fs.writeFileSync(file, `${md.replace(/\s+$/, '')}\n`, 'utf8');
  return { ok: true, lesson_id: lid, ...getLearnSnapshot(id, opts) };
}
