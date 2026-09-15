// learnDiagrams.js — architecture diagrams for Background / tutor (learn-map engine).
// Schema is SoR. Glass renders from this jail — not mermaid in primer.md, not SVG dumps,
// not Reports PNGs, not Memory-desk wiki art.
// Decision-support only. Fail-closed: mix $ / SKU splits / fake topology → GAP or reject.
import { adviceHits, topicId } from './learnSchema.js';

export const LEARN_DIAGRAM_TYPES = Object.freeze(['stack', 'flow', 'segments', 'interconnect']);

export const LEARN_DIAGRAM_TYPE_SET = new Set(LEARN_DIAGRAM_TYPES);

/** What a Background diagram is for (teaching the product), vs what it is not. */
export const LEARN_DIAGRAM_ALLOWED = Object.freeze({
  stack: 'Block / architecture layers (what sits on what)',
  flow: 'Process / how it is made or how bits move (foundry node, HBM stack, power→IT)',
  segments: 'How the company cuts the book (filed segments / platforms)',
  interconnect: 'How products attach (scale-up / scale-out / software layer)',
});

export const LEARN_DIAGRAM_FORBIDDEN = Object.freeze([
  'price charts',
  'ratings / PT / buy-sell',
  'COMPILE BOOK art',
  'House stance graphics',
  'invented SKU $ mix',
  'named customers the filing does not name',
  'utilization from nameplate',
  'Memory-desk wiki Background art',
]);

export const BLOCK_STATUS = new Set(['ready', 'gap', 'stub', 'unknown']);

export const MONEY_RE = /\$\s*\d|\d+(?:\.\d+)?\s*%/;
export const SKU_SPLIT_RE = /\bsku\s*(\$|split|mix)\b/i;

function str(v) {
  return v == null ? '' : String(v).trim();
}

export function requiredDiagramsForFamily(familySpec) {
  const req = familySpec && Array.isArray(familySpec.required_diagrams)
    ? familySpec.required_diagrams
    : ['stack'];
  return req.filter((t) => LEARN_DIAGRAM_TYPE_SET.has(t));
}

function moneyWithoutFiled(text, filed) {
  const blob = str(text);
  if (!blob) return false;
  if (filed) return false;
  return MONEY_RE.test(blob) || SKU_SPLIT_RE.test(blob);
}

function normalizeBlock(row, i) {
  if (!row || typeof row !== 'object') return { ok: false, error: `diagram block ${i} not an object` };
  const label = str(row.label || row.title || row.name).slice(0, 120);
  const id = topicId(row.id || label);
  if (!id || !label) return { ok: false, error: `diagram block ${i} id/label missing` };
  const status = str(row.status || 'ready').toLowerCase();
  if (!BLOCK_STATUS.has(status)) return { ok: false, error: `diagram block ${id} bad status` };
  const filed = row.filed === true;
  if (moneyWithoutFiled(label, filed) || moneyWithoutFiled(row.note, filed)) {
    return {
      ok: false,
      error: `diagram block ${id} has mix $ / % / SKU split without filed pin — GAP or filed+as_of+source`,
    };
  }
  const kind = str(row.kind).toLowerCase().slice(0, 32) || undefined;
  const layer = Number.isFinite(Number(row.layer)) ? Number(row.layer) : (Number.isFinite(Number(row.order)) ? Number(row.order) : i);
  const note = str(row.note || row.not_this).slice(0, 240) || undefined;
  const asOf = str(row.as_of).slice(0, 32) || undefined;
  const source = str(row.source || row.source_label).slice(0, 160) || undefined;
  if (filed && !asOf && !source) {
    return { ok: false, error: `diagram block ${id} marked filed but missing as_of/source` };
  }
  const block = { id, label, status, layer, filed };
  if (kind) block.kind = kind;
  if (note) block.note = note;
  if (asOf) block.as_of = asOf;
  if (source) block.source = source;
  const share = str(row.share || row.mix).slice(0, 40);
  if (share) {
    if (!filed) {
      return { ok: false, error: `diagram block ${id} share/mix requires filed:true` };
    }
    block.share = share;
  }
  const group = str(row.group).slice(0, 48);
  if (group) {
    if (moneyWithoutFiled(group, filed)) {
      return {
        ok: false,
        error: `diagram block ${id} group has mix $ / % without filed pin — GAP or filed+as_of+source`,
      };
    }
    block.group = group;
  }
  const parentRaw = str(row.parent);
  if (parentRaw) {
    const parent = topicId(parentRaw);
    if (!parent) return { ok: false, error: `diagram block ${id} parent is empty — do not invent containment` };
    block.parent = parent;
  }
  return { ok: true, block };
}

function normalizeEdge(row, i, blockIds) {
  if (!row || typeof row !== 'object') return { ok: false, error: `diagram edge ${i} not an object` };
  const from = topicId(row.from || row.source);
  const to = topicId(row.to || row.target);
  if (!from || !to) return { ok: false, error: `diagram edge ${i} from/to missing` };
  const status = str(row.status || 'ready').toLowerCase();
  if (!BLOCK_STATUS.has(status)) return { ok: false, error: `diagram edge ${from}→${to} bad status` };
  const label = str(row.label).slice(0, 80) || undefined;
  const filed = row.filed === true;
  if (label && moneyWithoutFiled(label, filed)) {
    return {
      ok: false,
      error: `diagram edge ${from}→${to} has mix $ without filed pin — GAP instead of a pretty lie`,
    };
  }
  const fromKnown = blockIds.has(from);
  const toKnown = blockIds.has(to);
  if (!fromKnown || !toKnown) {
    if (status === 'ready') {
      return {
        ok: false,
        error: `diagram edge ${from}→${to} points at missing block — use status gap/unknown, do not invent topology`,
      };
    }
  }
  const edge = { from, to, status };
  if (label) edge.label = label;
  if (filed) edge.filed = true;
  return { ok: true, edge };
}

/**
 * @param {unknown} raw
 * @returns {{ ok: true, diagram: object } | { ok: false, error: string }}
 */
export function validateLearnDiagram(raw) {
  if (!raw || typeof raw !== 'object') return { ok: false, error: 'diagram empty' };
  if (adviceHits(JSON.stringify(raw))) return { ok: false, error: 'advice language rejected (no buy/sell/PT)' };
  const type = str(raw.type || raw.kind).toLowerCase();
  if (!LEARN_DIAGRAM_TYPE_SET.has(type)) {
    return { ok: false, error: `unknown diagram type "${raw.type}" (stack|flow|segments|interconnect)` };
  }
  const title = str(raw.title || raw.label).slice(0, 160);
  const id = topicId(raw.id || title || type);
  if (!id || !title) return { ok: false, error: 'diagram id/title missing' };
  const asOf = str(raw.as_of);
  if (!asOf) return { ok: false, error: `diagram ${id} as_of required` };
  const sources = Array.isArray(raw.sources)
    ? raw.sources.map((s) => {
      if (typeof s === 'string') return { label: str(s).slice(0, 200) };
      const label = str(s?.label || s?.name).slice(0, 200);
      if (!label) return null;
      const out = { label };
      const a = str(s.as_of).slice(0, 32);
      const g = str(s.grade).toUpperCase().slice(0, 4);
      if (a) out.as_of = a;
      if (g) out.grade = g;
      return out;
    }).filter(Boolean).slice(0, 8)
    : [];
  if (sources.length < 1) return { ok: false, error: `diagram ${id} needs a source pin` };

  const blocksIn = Array.isArray(raw.blocks) ? raw.blocks : (Array.isArray(raw.nodes) ? raw.nodes : []);
  const blocks = [];
  const seen = new Set();
  for (let i = 0; i < blocksIn.length; i += 1) {
    const b = normalizeBlock(blocksIn[i], i);
    if (!b.ok) return b;
    if (seen.has(b.block.id)) continue;
    seen.add(b.block.id);
    blocks.push(b.block);
    if (blocks.length >= 24) break;
  }
  if (blocks.length < 2) return { ok: false, error: `diagram ${id} needs at least two blocks` };

  const blockIds = new Set(blocks.map((b) => b.id));
  const usedAsParent = new Set(blocks.map((b) => b.parent).filter(Boolean));
  for (const b of blocks) {
    if (!b.parent) continue;
    if (b.parent === b.id) {
      return { ok: false, error: `diagram block ${b.id} parent is self — do not invent containment` };
    }
    if (!blockIds.has(b.parent)) {
      return { ok: false, error: `diagram block ${b.id} parent "${b.parent}" unknown — do not invent containment` };
    }
    if (usedAsParent.has(b.id)) {
      return { ok: false, error: `diagram block ${b.id} is both parent and child — max depth 2, do not invent containment` };
    }
  }
  const edgesIn = Array.isArray(raw.edges) ? raw.edges : [];
  const edges = [];
  for (let i = 0; i < edgesIn.length; i += 1) {
    const e = normalizeEdge(edgesIn[i], i, blockIds);
    if (!e.ok) return e;
    edges.push(e.edge);
    if (edges.length >= 40) break;
  }
  if (type === 'interconnect' && edges.length < 1) {
    return { ok: false, error: `diagram ${id} interconnect needs edges (or mark the missing attach as GAP)` };
  }
  if (type === 'flow' && edges.length < 1 && blocks.length >= 2) {
    // implicit left-to-right from layer/order is allowed
  }

  const gaps = Array.isArray(raw.gaps)
    ? raw.gaps.map((g) => (typeof g === 'string' ? str(g).slice(0, 200) : str(g?.label || g?.id).slice(0, 200))).filter(Boolean).slice(0, 12)
    : [];
  const notThis = str(raw.not_this).slice(0, 240) || undefined;

  const diagram = {
    id,
    type,
    title,
    as_of: asOf.slice(0, 40),
    sources,
    blocks,
    edges,
    gaps,
    decision_support_only: true,
  };
  if (notThis) diagram.not_this = notThis;
  return { ok: true, diagram };
}

/**
 * @param {unknown} rawList
 */
export function validateLearnDiagrams(rawList) {
  if (rawList == null) return { ok: true, diagrams: [] };
  if (!Array.isArray(rawList)) return { ok: false, error: 'diagrams must be an array' };
  const out = [];
  const seen = new Set();
  for (const row of rawList.slice(0, 8)) {
    const g = validateLearnDiagram(row);
    if (!g.ok) return g;
    if (seen.has(g.diagram.id)) continue;
    seen.add(g.diagram.id);
    out.push(g.diagram);
  }
  return { ok: true, diagrams: out };
}

export function scoreLearnDiagrams(diagrams, familySpec) {
  const list = Array.isArray(diagrams) ? diagrams : [];
  const reasons = [];
  const required = requiredDiagramsForFamily(familySpec);
  const types = new Set(list.map((d) => d.type));
  const missing = required.filter((t) => !types.has(t));
  if (list.length === 0) {
    reasons.push(`no architecture diagrams (need ${required.join(', ') || 'stack'})`);
  } else if (missing.length) {
    reasons.push(`diagrams missing types: ${missing.join(', ')}`);
  }
  for (const d of list) {
    const blocks = Array.isArray(d.blocks) ? d.blocks : [];
    const edges = Array.isArray(d.edges) ? d.edges : [];
    if (d.type === 'stack') {
      const layers = new Set(blocks.map((b) => b.layer));
      const kinds = new Set(blocks.map((b) => b.kind).filter(Boolean));
      if (layers.size < 4 || kinds.size < 3) {
        reasons.push(`stack floor: layers ${layers.size} < 4 or kinds ${kinds.size} < 3`);
      }
    } else if (d.type === 'flow') {
      if (blocks.length < 4) reasons.push(`flow floor: blocks ${blocks.length} < 4`);
    } else if (d.type === 'interconnect') {
      if (blocks.length < 3 || edges.length < 2) {
        reasons.push(`interconnect floor: blocks ${blocks.length} / edges ${edges.length} (need ≥3 blocks and ≥2 edges)`);
      }
    } else if (d.type === 'segments') {
      const filedN = blocks.filter((b) => b.filed === true).length;
      if (filedN < 3) reasons.push(`segments floor: filed blocks ${filedN} < 3`);
    }
  }
  return {
    ok: reasons.length === 0,
    diagram_count: list.length,
    types: [...types],
    reasons,
    required,
  };
}

/** Deterministic mermaid preview from schema (seed / tests). Glass does not execute mermaid. */
export function diagramToMermaid(diagram) {
  const d = diagram && typeof diagram === 'object' ? diagram : {};
  const blocks = Array.isArray(d.blocks) ? d.blocks : [];
  const edges = Array.isArray(d.edges) ? d.edges : [];
  const idSafe = (s) => String(s || 'x').replace(/[^a-zA-Z0-9_]/g, '_');
  const labelOf = (b) => {
    const gap = b.status === 'gap' || b.status === 'unknown' ? ' [GAP]' : '';
    const share = b.filed && b.share ? ` ${b.share}` : '';
    return `${b.label}${share}${gap}`.replace(/"/g, "'");
  };
  if (d.type === 'flow' || d.type === 'interconnect') {
    const lines = ['flowchart LR'];
    for (const b of blocks) lines.push(`  ${idSafe(b.id)}["${labelOf(b)}"]`);
    if (edges.length) {
      for (const e of edges) {
        const lab = e.label ? `|${String(e.label).replace(/\|/g, '/')}|` : '';
        const arrow = e.status === 'ready' ? '-->' : '-.->';
        lines.push(`  ${idSafe(e.from)} ${arrow}${lab} ${idSafe(e.to)}`);
      }
    } else {
      const sorted = [...blocks].sort((a, b) => (a.layer || 0) - (b.layer || 0));
      for (let i = 0; i < sorted.length - 1; i += 1) {
        lines.push(`  ${idSafe(sorted[i].id)} --> ${idSafe(sorted[i + 1].id)}`);
      }
    }
    return lines.join('\n');
  }
  const lines = ['flowchart TB'];
  const sorted = [...blocks].sort((a, b) => (a.layer || 0) - (b.layer || 0));
  for (const b of sorted) lines.push(`  ${idSafe(b.id)}["${labelOf(b)}"]`);
  for (let i = 0; i < sorted.length - 1; i += 1) {
    lines.push(`  ${idSafe(sorted[i].id)} --> ${idSafe(sorted[i + 1].id)}`);
  }
  return lines.join('\n');
}

export function fixtureLearnDiagrams() {
  return [
    {
      id: 'stack',
      type: 'stack',
      title: 'Platform stack (what they sell)',
      as_of: '2026-01-25',
      sources: [{ label: 'FY2026 10-K Item 1', as_of: '2026-01-25', grade: 'A' }],
      not_this: 'Not a GPU-only ticker',
      gaps: ['SKU $ by generation'],
      blocks: [
        { id: 'sw', label: 'CUDA / software', kind: 'software', layer: 0, status: 'ready' },
        { id: 'sys', label: 'Systems / racks', kind: 'systems', layer: 1, status: 'ready' },
        { id: 'net', label: 'NVLink / networking', kind: 'networking', layer: 2, status: 'ready' },
        { id: 'si', label: 'GPU / CPU / DPU', kind: 'silicon', layer: 3, status: 'ready' },
      ],
      edges: [
        { from: 'sw', to: 'sys', status: 'ready', label: 'programs' },
        { from: 'sys', to: 'net', status: 'ready' },
        { from: 'net', to: 'si', status: 'ready' },
      ],
    },
    {
      id: 'attach',
      type: 'interconnect',
      title: 'How a custom XPU attaches (company language)',
      as_of: '2026-01-25',
      sources: [{ label: 'FY2026 10-K Item 1', as_of: '2026-01-25', grade: 'A' }],
      not_this: 'Not “they became a custom-ASIC house”',
      gaps: ['Named identity of NVLink Fusion customers'],
      blocks: [
        { id: 'gpu', label: 'House GPU', kind: 'silicon', status: 'ready' },
        { id: 'fusion', label: 'Attach fabric', kind: 'networking', status: 'ready' },
        { id: 'xpu', label: 'Customer CPU/XPU', kind: 'silicon', status: 'gap', note: 'attach exists; customer names UNKNOWN' },
      ],
      edges: [
        { from: 'gpu', to: 'fusion', status: 'ready' },
        { from: 'xpu', to: 'fusion', status: 'gap', label: 'GAP: who' },
      ],
    },
    {
      id: 'flow',
      type: 'flow',
      title: 'How the product is made',
      as_of: '2026-01-25',
      sources: [{ label: 'FY2026 10-K Item 1', as_of: '2026-01-25', grade: 'A' }],
      not_this: 'Not utilization. Not a foundry node map.',
      gaps: ['Contract terms'],
      blocks: [
        { id: 'design', label: 'Design (fabless)', kind: 'software', layer: 0, status: 'ready' },
        { id: 'wafer', label: 'Wafers at foundry', kind: 'process', layer: 1, status: 'ready' },
        { id: 'mem', label: 'Memory attach', kind: 'process', layer: 2, status: 'ready' },
        { id: 'pkg', label: 'Advanced packaging', kind: 'process', layer: 3, status: 'ready' },
        { id: 'sysout', label: 'System to the customer', kind: 'systems', layer: 4, status: 'ready' },
      ],
      edges: [
        { from: 'design', to: 'wafer', status: 'ready' },
        { from: 'wafer', to: 'mem', status: 'ready' },
        { from: 'mem', to: 'pkg', status: 'ready' },
        { from: 'pkg', to: 'sysout', status: 'ready' },
      ],
    },
    {
      id: 'segments',
      type: 'segments',
      title: 'Filed platform cuts',
      as_of: '2026-04-26',
      sources: [{ label: 'FY2026 Q4 PR', as_of: '2026-01-25', grade: 'A' }],
      not_this: 'Not a SKU $ pie. Tile size carries no $ meaning.',
      gaps: ['SKU generation $'],
      blocks: [
        {
          id: 'co-fy26', label: 'FY company', kind: 'segment', status: 'ready',
          filed: true, share: '$100B', as_of: '2026-01-25', source: 'FY PR', group: 'FY26',
        },
        {
          id: 'dc-fy26', label: 'FY platform', kind: 'segment', status: 'ready',
          filed: true, share: '$90B', as_of: '2026-01-25', source: 'FY PR', group: 'FY26', parent: 'co-fy26',
        },
        {
          id: 'dc-q1', label: 'Q1 platform', kind: 'segment', status: 'ready',
          filed: true, share: '$30B', as_of: '2026-04-26', source: 'Q1 PR', group: 'Q1',
        },
        {
          id: 'dc-compute', label: 'Q1 compute', kind: 'segment', status: 'ready',
          filed: true, share: '$24B', as_of: '2026-04-26', source: 'Q1 PR', group: 'Q1', parent: 'dc-q1',
        },
        {
          id: 'dc-net', label: 'Q1 networking', kind: 'segment', status: 'ready',
          filed: true, share: '$6B', as_of: '2026-04-26', source: 'Q1 PR', group: 'Q1', parent: 'dc-q1',
        },
      ],
      edges: [],
    },
  ];
}
