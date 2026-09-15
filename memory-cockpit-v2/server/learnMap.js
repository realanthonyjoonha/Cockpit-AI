// learnMap.js — product-map schema + depth gate for Background / tutor.
// Vault: cockpit/learn/{TICKER}/product-map.json  NOT pack / house / Model / Street.
// Decision-support only. Map rebuild must never wipe learner.json.
import { adviceHits, topicId } from './learnSchema.js';
import {
  fixtureLearnDiagrams,
  scoreLearnDiagrams,
  validateLearnDiagrams,
} from './learnDiagrams.js';
import { fixtureLearnPhotos, validateLearnPhotos } from './learnPhotos.js';

export const PRODUCT_MAP_SCHEMA_VERSION = 1;

/** Industry shapes — factory templates, not per-ticker UI forks. */
export const LEARN_FAMILIES = Object.freeze({
  fabless_platform: {
    label: 'Fabless compute platform',
    required_kinds: ['silicon', 'systems', 'networking', 'software', 'segment', 'not_this', 'mechanism', 'process'],
    required_diagrams: ['stack', 'flow', 'segments', 'interconnect'],
    min_mechanism_nodes: 2,
  },
  custom_silicon: {
    label: 'Custom silicon + connect',
    required_kinds: ['silicon', 'networking', 'segment', 'not_this'],
    required_diagrams: ['stack', 'interconnect'],
  },
  dual_engine: {
    label: 'Semi + software engines',
    required_kinds: ['silicon', 'software', 'segment', 'not_this'],
    required_diagrams: ['stack', 'segments'],
  },
  foundry: {
    label: 'Pure-play foundry / process',
    required_kinds: ['process', 'segment', 'not_this'],
    required_diagrams: ['flow', 'segments'],
  },
  memory_idm: {
    label: 'Memory IDM',
    required_kinds: ['silicon', 'process', 'segment', 'not_this'],
    required_diagrams: ['stack', 'flow'],
  },
  neocloud: {
    label: 'AI cloud / GPU infra',
    required_kinds: ['systems', 'software', 'segment', 'not_this'],
    required_diagrams: ['stack', 'interconnect'],
  },
  power_dc: {
    label: 'Power + data-center operator',
    required_kinds: ['power', 'systems', 'segment', 'not_this'],
    required_diagrams: ['stack', 'flow'],
  },
  ai_infra_operator: {
    label: 'AI infra operator (capacity / TCV)',
    required_kinds: ['systems', 'software', 'segment', 'not_this'],
    required_diagrams: ['stack', 'segments'],
  },
  pharma: {
    label: 'Human pharmaceutical products',
    required_kinds: ['sku_family', 'mechanism', 'process', 'segment', 'not_this'],
    required_diagrams: ['stack', 'flow', 'segments'],
    min_mechanism_nodes: 2,
  },
});

export const NODE_KINDS = new Set([
  'silicon',
  'systems',
  'networking',
  'process',
  'software',
  'power',
  'segment',
  'not_this',
  'mechanism',
  'sku_family',
]);

export const NODE_STATUS = new Set(['ready', 'gap', 'stub', 'unknown']);

/** Depth bar for a *built* product map (live moderate primers will fail — that is the point). */
export const LEARN_DEPTH_BAR = Object.freeze({
  primer_min_words: 1400,
  lesson_min_words: 450,
  min_ready_nodes: 9,
  min_lessons_with_body: 9,
  min_source_pins: 4,
  min_diagrams: 3,
});

function str(v) {
  return v == null ? '' : String(v).trim();
}

function wordCount(text) {
  return str(text).split(/\s+/).filter(Boolean).length;
}

/**
 * Infer family from harvested text (content, not a ticker table).
 * Distinctive signals outrank incidental phrases ("custom XPU" as competition, "process technology" at an IDM).
 * Desk N free-rides: no per-slug UI.
 */
export function inferLearnFamily(text) {
  const blob = str(text);
  if (!blob) return 'fabless_platform';
  const score = {
    foundry: 0,
    memory_idm: 0,
    power_dc: 0,
    dual_engine: 0,
    custom_silicon: 0,
    neocloud: 0,
    ai_infra_operator: 0,
    fabless_platform: 0,
    pharma: 0,
  };
  if (/\b(pure-play foundry|12-inch-equivalent)\b/i.test(blob)) score.foundry += 4;
  if (/\bwafer fabrication\b/i.test(blob) && !/\b(IDM|DRAM|HBM)\b/i.test(blob)) score.foundry += 3;
  if (/\b(HBM|HBM3E|HBM4)\b/i.test(blob) && /\bDRAM\b/i.test(blob)) score.memory_idm += 4;
  if (/\bintegrated device manufacturer\b/i.test(blob) && /\bDRAM\b/i.test(blob)) score.memory_idm += 3;
  if (/\b(bitcoin mining|hashrate|EH\/s|grid-connected power)\b/i.test(blob)) score.power_dc += 4;
  if (/\bVMware\b/i.test(blob) && /\b(semiconductor|XPU|custom accelerator)\b/i.test(blob)) score.dual_engine += 4;
  if (/\b(full-stack multi-tenant AI cloud|AI-optimized GPU infrastructure)\b/i.test(blob)) score.neocloud += 4;
  if (/\b(Teralynx|electro-optics|Photonic Fabric)\b/i.test(blob)) score.custom_silicon += 4;
  if (/\bcustom ASIC\b/i.test(blob) && !/\b(CUDA|GeForce|fabless accelerated)\b/i.test(blob)) score.custom_silicon += 2;
  if (/\b(TCV|total contract value)\b/i.test(blob) && /\bGPU\b/i.test(blob) && !/\bCUDA\b/i.test(blob)) {
    score.ai_infra_operator += 3;
  }
  if (/\bneocloud operator\b/i.test(blob) && /\bGPU\b/i.test(blob)) score.ai_infra_operator += 4;
  if (/\b(CUDA|GeForce|fabless accelerated-computing|Instinct|ROCm)\b/i.test(blob)) score.fabless_platform += 4;
  if (/\bhuman pharmaceutical products\b/i.test(blob)) score.pharma += 4;
  if (/\btirzepatide\b/i.test(blob) && /\b(Mounjaro|Zepbound)\b/i.test(blob)) score.pharma += 4;
  if (/\b(GLP-1|GIP and GLP-1|incretin)\b/i.test(blob) && /\b(type 2 diabetes|obesity)\b/i.test(blob)) {
    score.pharma += 3;
  }

  let best = 'fabless_platform';
  let bestScore = 0;
  for (const [fam, n] of Object.entries(score)) {
    if (n > bestScore) {
      best = fam;
      bestScore = n;
    }
  }
  return best;
}

function normalizeSource(row) {
  if (row == null) return null;
  if (typeof row === 'string') {
    const label = str(row).slice(0, 200);
    if (!label) return null;
    return { label };
  }
  if (typeof row !== 'object') return null;
  const label = str(row.label || row.name || row.id || row.source_id).slice(0, 200);
  if (!label) return null;
  const out = { label };
  const asOf = str(row.as_of || row.date).slice(0, 32);
  if (asOf) out.as_of = asOf;
  const grade = str(row.grade).toUpperCase().slice(0, 4);
  if (grade) out.grade = grade;
  const note = str(row.note || row.not_this).slice(0, 240);
  if (note) out.note = note;
  return out;
}

function normalizeGap(row) {
  if (row == null) return null;
  if (typeof row === 'string') {
    const label = str(row).slice(0, 200);
    const id = topicId(label);
    if (!id || !label) return null;
    return { id, label, status: 'unknown' };
  }
  if (typeof row !== 'object') return null;
  const label = str(row.label || row.name || row.id).slice(0, 200);
  const id = topicId(row.id || label);
  if (!id || !label) return null;
  const status = str(row.status).toLowerCase();
  return {
    id,
    label,
    status: NODE_STATUS.has(status) ? status : 'unknown',
  };
}

function normalizeNode(row) {
  if (!row || typeof row !== 'object') return { ok: false, error: 'node not an object' };
  const title = str(row.title || row.label).slice(0, 160);
  const id = topicId(row.id || title);
  if (!id || !title) return { ok: false, error: 'node id/title missing' };
  const kind = str(row.kind).toLowerCase();
  if (!NODE_KINDS.has(kind)) return { ok: false, error: `unknown node kind "${row.kind}"` };
  const status = str(row.status || 'stub').toLowerCase();
  if (!NODE_STATUS.has(status)) return { ok: false, error: `unknown node status "${row.status}"` };
  const lessonId = topicId(row.lesson_id || (status === 'ready' ? id : '')) || null;
  const sources = Array.isArray(row.sources)
    ? row.sources.map(normalizeSource).filter(Boolean).slice(0, 12)
    : [];
  const depends = Array.isArray(row.depends_on)
    ? row.depends_on.map((d) => topicId(d)).filter(Boolean).slice(0, 12)
    : [];
  const summary = str(row.summary).slice(0, 400) || undefined;
  const notThis = str(row.not_this || row.what_this_is_not).slice(0, 400) || undefined;
  const node = { id, kind, title, status, sources, depends_on: depends };
  if (lessonId) node.lesson_id = lessonId;
  if (summary) node.summary = summary;
  if (notThis) node.not_this = notThis;
  const asOf = str(row.as_of).slice(0, 32);
  if (asOf) node.as_of = asOf;
  return { ok: true, node };
}

/**
 * @param {unknown} raw
 * @param {string} [ticker]
 */
export function validateProductMap(raw, ticker = '') {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'product map empty' };
  const blob = JSON.stringify(raw);
  if (adviceHits(blob)) return { ok: false, error: 'advice language rejected (no buy/sell/PT)' };
  const family = str(raw.family).toLowerCase();
  if (!LEARN_FAMILIES[family]) {
    return { ok: false, error: `unknown family "${raw.family}"` };
  }
  const asOf = str(raw.as_of);
  if (!asOf) return { ok: false, error: 'product map as_of required' };
  const sources = Array.isArray(raw.sources)
    ? raw.sources.map(normalizeSource).filter(Boolean).slice(0, 24)
    : [];
  if (sources.length < 1) return { ok: false, error: 'product map needs at least one source pin' };

  const nodesIn = Array.isArray(raw.nodes) ? raw.nodes : [];
  const nodes = [];
  const seen = new Set();
  for (const row of nodesIn) {
    const n = normalizeNode(row);
    if (!n.ok) return n;
    if (seen.has(n.node.id)) continue;
    seen.add(n.node.id);
    nodes.push(n.node);
    if (nodes.length >= 40) break;
  }
  if (nodes.length < 1) return { ok: false, error: 'product map needs nodes' };

  const notThis = Array.isArray(raw.not_this)
    ? raw.not_this.map((x) => str(x).slice(0, 200)).filter(Boolean).slice(0, 16)
    : [];
  const gaps = Array.isArray(raw.gaps)
    ? raw.gaps.map(normalizeGap).filter(Boolean).slice(0, 24)
    : [];

  const diagramsGate = validateLearnDiagrams(raw.diagrams);
  if (!diagramsGate.ok) return diagramsGate;

  const id = str(ticker || raw.ticker).toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const photosGate = validateLearnPhotos(raw.photos, {
    ticker: id,
    nodeIds: new Set(nodes.map((n) => n.id)),
  });
  if (!photosGate.ok) return photosGate;

  const map = {
    schema_version: PRODUCT_MAP_SCHEMA_VERSION,
    ticker: id || null,
    family,
    as_of: asOf.slice(0, 40),
    updated_at: str(raw.updated_at) || new Date().toISOString(),
    sources,
    not_this: notThis,
    gaps,
    nodes,
    diagrams: diagramsGate.diagrams,
    photos: photosGate.photos,
    decision_support_only: true,
  };
  return { ok: true, map };
}

/**
 * Score primer + lessons + optional map against the depth bar.
 * Does not write. Live moderate primers are expected to fail until fill.
 */
export function scoreLearnDepth({ primerMarkdown = '', lessons = [], map = null } = {}) {
  const reasons = [];
  const primerWords = wordCount(primerMarkdown);
  const lessonBodies = (Array.isArray(lessons) ? lessons : []).map((l) => ({
    id: l.id,
    words: wordCount(l.markdown || l.body || ''),
    n_chars: Number(l.n_chars) || 0,
  }));
  const lessonsDeep = lessonBodies.filter((l) => l.words >= LEARN_DEPTH_BAR.lesson_min_words
    || l.n_chars >= LEARN_DEPTH_BAR.lesson_min_words * 5);

  if (primerWords < LEARN_DEPTH_BAR.primer_min_words) {
    reasons.push(`primer ${primerWords} words < ${LEARN_DEPTH_BAR.primer_min_words} spine floor`);
  }
  if (!map || !Array.isArray(map.nodes) || map.nodes.length === 0) {
    reasons.push('no product-map.json');
  } else {
    const ready = map.nodes.filter((n) => n.status === 'ready');
    if (ready.length < LEARN_DEPTH_BAR.min_ready_nodes) {
      reasons.push(`ready nodes ${ready.length} < ${LEARN_DEPTH_BAR.min_ready_nodes}`);
    }
    const family = LEARN_FAMILIES[map.family];
    if (family) {
      const kinds = new Set(map.nodes.map((n) => n.kind));
      const missing = family.required_kinds.filter((k) => !kinds.has(k));
      if (missing.length) reasons.push(`family ${map.family} missing kinds: ${missing.join(', ')}`);
      const minMech = Number(family.min_mechanism_nodes) || 0;
      if (minMech > 0) {
        const mech = ready.filter((n) => n.kind === 'mechanism' || n.kind === 'process');
        if (mech.length < minMech) {
          reasons.push(`mechanism/process nodes ${mech.length} < ${minMech}`);
        }
      }
    }
    const pins = Array.isArray(map.sources) ? map.sources.length : 0;
    if (pins < LEARN_DEPTH_BAR.min_source_pins) {
      reasons.push(`source pins ${pins} < ${LEARN_DEPTH_BAR.min_source_pins}`);
    }
    const readyWithLesson = ready.filter((n) => n.lesson_id);
    if (readyWithLesson.length < Math.min(ready.length, LEARN_DEPTH_BAR.min_lessons_with_body)) {
      reasons.push('ready nodes missing lesson_id');
    }
    const dScore = scoreLearnDiagrams(map.diagrams, family);
    reasons.push(...dScore.reasons);
  }
  if (lessonsDeep.length < LEARN_DEPTH_BAR.min_lessons_with_body) {
    reasons.push(`deep lessons ${lessonsDeep.length} < ${LEARN_DEPTH_BAR.min_lessons_with_body} (need ≥${LEARN_DEPTH_BAR.lesson_min_words} words each)`);
  }

  const readyNodes = map && Array.isArray(map.nodes)
    ? map.nodes.filter((n) => n.status === 'ready').length
    : 0;
  const sourcePins = Array.isArray(map?.sources) ? map.sources.length : 0;

  return {
    ok: reasons.length === 0,
    primer_words: primerWords,
    lesson_count: lessonBodies.length,
    deep_lessons: lessonsDeep.length,
    map_nodes: map?.nodes?.length || 0,
    ready_nodes: readyNodes,
    source_pins: sourcePins,
    diagram_count: Array.isArray(map?.diagrams) ? map.diagrams.length : 0,
    family: map?.family || null,
    reasons,
    bar: LEARN_DEPTH_BAR,
  };
}

/** Minimal fixture that passes validate + depth bar (tests only). */
export function fixtureProductMap(ticker = 'TEST') {
  const id = String(ticker || 'TEST').toUpperCase();
  return {
    schema_version: PRODUCT_MAP_SCHEMA_VERSION,
    ticker: id,
    family: 'fabless_platform',
    as_of: '2026-04-26',
    sources: [
      { label: 'FY2026 10-K Item 1', as_of: '2026-01-25', grade: 'A' },
      { label: 'FY2026 Q4 PR', as_of: '2026-01-25', grade: 'A' },
      { label: 'FY2027 Q1 10-Q', as_of: '2026-04-26', grade: 'A' },
      { label: 'vault 02-business-model', as_of: '2026-07-26', grade: 'B' },
    ],
    not_this: ['foundry', 'memory IDM', 'merchant-GPU-only ticker'],
    gaps: [{ id: 'sku-mix', label: 'SKU $ splits', status: 'unknown' }],
    nodes: [
      {
        id: 'platform', kind: 'systems', title: 'Rack-scale AI factory', status: 'ready',
        lesson_id: 'platform', as_of: '2026-01-25',
        sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25', grade: 'A' }],
        not_this: 'Not a single-chip ASP story',
        depends_on: [],
      },
      {
        id: 'gpu', kind: 'silicon', title: 'GPU / CPU / DPU silicon', status: 'ready',
        lesson_id: 'gpu', depends_on: ['platform'],
        sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25', grade: 'A' }],
        not_this: 'Not a foundry wafer',
      },
      {
        id: 'nvlink', kind: 'networking', title: 'NVLink / InfiniBand / Ethernet', status: 'ready',
        lesson_id: 'nvlink', depends_on: ['platform'],
        sources: [{ label: 'FY2027 Q1 PR', as_of: '2026-04-26', grade: 'A' }],
        not_this: 'Not a SKU $ split vs compute',
      },
      {
        id: 'cuda', kind: 'software', title: 'CUDA is not a chip', status: 'ready',
        lesson_id: 'cuda', depends_on: ['gpu'],
        sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25', grade: 'A' }],
        not_this: 'Not a revenue line',
      },
      {
        id: 'segments', kind: 'segment', title: 'Compute and Networking vs Graphics', status: 'ready',
        lesson_id: 'segments',
        sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25', grade: 'A' }],
        not_this: 'Not the FY2027 platform cut',
      },
      {
        id: 'not-foundry', kind: 'not_this', title: 'Not a foundry', status: 'ready',
        lesson_id: 'not-foundry',
        sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25', grade: 'A' }],
        not_this: 'Partners build the wafers',
      },
      {
        id: 'rack-how', kind: 'mechanism', title: 'How a rack is built', status: 'ready',
        lesson_id: 'rack-how', depends_on: ['platform'],
        sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25', grade: 'A' }],
        not_this: 'Not a rack BOM $ or per-rack ASP',
      },
      {
        id: 'pkg-how', kind: 'process', title: 'Packaging and memory supply', status: 'ready',
        lesson_id: 'pkg-how', depends_on: ['gpu'],
        sources: [{ label: 'FY2027 Q1 10-Q', as_of: '2026-04-26', grade: 'A' }],
        not_this: 'Not contract terms, not utilization',
      },
      {
        id: 'attach-how', kind: 'mechanism', title: 'How attach works', status: 'ready',
        lesson_id: 'attach-how', depends_on: ['nvlink'],
        sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25', grade: 'A' }],
        not_this: 'Not a named customer list',
      },
    ],
    diagrams: fixtureLearnDiagrams(),
    photos: fixtureLearnPhotos(id),
    decision_support_only: true,
  };
}

export function fixtureDeepLessonMarkdown(title, extra = '') {
  const body = [
    `# ${title}`,
    '',
    `**As-of:** 2026-01-25 · **Source:** FY2026 10-K Item 1 [A]`,
    'Decision-support only. Not House. Not Model numbers. Not a rating.',
    '',
    '## What this is',
    '',
    'This unit teaches the mechanism in company language: how the product sits in the stack,',
    'what the filing actually names, and which adjacent object people confuse it with.',
    extra || 'Named products belong here. Filed mix belongs in the spine, not invented SKU dollars.',
    '',
    '## What a figure is not',
    '',
    'Any dollar below is a **filed** cut (segment / platform / company). It is **not** a SKU split,',
    'not utilization, and not a named customer identity unless the filing names it.',
    '',
    '## GAP / UNKNOWN',
    '',
    '- SKU $ mix — not in the primary used here.',
    '',
    '## Study check',
    '',
    'If you cannot say what this is **not**, you are not done with this node.',
  ].join('\n');
  // Pad to the 400-word floor without inventing facts.
  const pad = ' Company language, as-of date, and honest GAP are the whole point of this lesson unit.';
  let md = body;
  while (wordCount(md) < LEARN_DEPTH_BAR.lesson_min_words) md += pad;
  return `${md}\n`;
}
