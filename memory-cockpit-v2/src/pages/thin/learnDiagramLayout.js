// Pure geometry for Background architecture drawings.
// Input: one validated diagram. Output: viewBox + bands/tiles/blocks/edges.
// No DOM, no React, no measurement. Same JSON in → same geometry out.
// Desk N inherits this file as-is — no slug branch, no per-desk art.

export const VIEWBOX_W = 720;
export const BAND_H = 56;
export const BOX_PAD = 8;
export const CHAR_W = 7.2;
export const FONT_PX = 12;
export const LINE_H = 14;
export const FLOW_WRAP = 4;
export const SEGMENTS_FOOTNOTE = 'categories · tile size carries no $ meaning';

function str(v) {
  return v == null ? '' : String(v).trim();
}

function isGap(row) {
  const s = str(row && row.status).toLowerCase();
  return s === 'gap' || s === 'unknown' || s === 'stub';
}

/** Character-count wrap. maxWidth is in viewBox units. */
export function wrapText(text, maxWidth, charW = CHAR_W) {
  const words = str(text).split(/\s+/).filter(Boolean);
  const maxChars = Math.max(4, Math.floor(Number(maxWidth) / charW) || 4);
  const lines = [];
  let cur = '';
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = w;
    } else cur = next;
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [''];
}

function blockLines(label, innerW) {
  return wrapText(label, Math.max(24, innerW - BOX_PAD * 2));
}

function boxH(lines, extra = 0) {
  const kindRow = 12;
  return BOX_PAD + kindRow + lines.length * LINE_H + extra + BOX_PAD;
}

function implicitFlowEdges(blocks) {
  const sorted = [...blocks].sort((a, b) => (Number(a.layer) || 0) - (Number(b.layer) || 0));
  const edges = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    edges.push({ from: sorted[i].id, to: sorted[i + 1].id, status: 'ready' });
  }
  return edges;
}

function emptyGeo(type, note) {
  return {
    type: type || 'fallback',
    viewBox: { w: VIEWBOX_W, h: 72 },
    bands: [],
    tiles: [],
    blocks: [],
    edges: [],
    lanes: [],
    captions: note ? [{ text: note, x: 10, y: 22, role: 'fallback' }] : [],
    footnote: null,
    fallback: true,
  };
}

function layoutFallback(diagram, note) {
  const blocksIn = Array.isArray(diagram && diagram.blocks) ? diagram.blocks : [];
  const cols = 3;
  const gap = 12;
  const inset = 12;
  const cellW = (VIEWBOX_W - inset * 2 - gap * (cols - 1)) / cols;
  const blocks = [];
  let y = 16;
  let rowH = 0;
  blocksIn.forEach((b, i) => {
    const col = i % cols;
    if (col === 0 && i > 0) {
      y += rowH + gap;
      rowH = 0;
    }
    const lines = blockLines(b.label, cellW);
    const extra = b.share ? 14 : 0;
    const h = boxH(lines, extra + (isGap(b) ? 12 : 0));
    rowH = Math.max(rowH, h);
    blocks.push({
      id: b.id,
      x: inset + col * (cellW + gap),
      y,
      w: cellW,
      h,
      label: b.label,
      lines,
      kind: b.kind || '',
      gap: isGap(b),
      note: b.note,
      source: b.source,
      share: b.filed && b.share ? b.share : '',
    });
  });
  const h = Math.max(72, y + rowH + 28);
  return {
    type: (diagram && diagram.type) || 'fallback',
    viewBox: { w: VIEWBOX_W, h },
    bands: [],
    tiles: [],
    blocks,
    edges: [],
    lanes: [],
    captions: [{ text: note || 'layout fallback', x: 10, y: h - 10, role: 'fallback' }],
    footnote: null,
    fallback: true,
  };
}

export function layoutStack(diagram) {
  const blocksIn = Array.isArray(diagram.blocks) ? diagram.blocks : [];
  const edgesIn = Array.isArray(diagram.edges) ? diagram.edges : [];
  const byLayer = new Map();
  for (const b of blocksIn) {
    const layer = Number.isFinite(Number(b.layer)) ? Number(b.layer) : 0;
    if (!byLayer.has(layer)) byLayer.set(layer, []);
    byLayer.get(layer).push(b);
  }
  const layers = [...byLayer.keys()].sort((a, b) => a - b);
  const bands = [];
  let y = 0;
  for (const layer of layers) {
    const row = byLayer.get(layer);
    const kinds = [...new Set(row.map((b) => b.kind).filter(Boolean))];
    const gap = row.some(isGap);
    const n = row.length;
    const innerPad = 28;
    const gapX = 8;
    const innerW = (VIEWBOX_W - innerPad * 2 - gapX * Math.max(0, n - 1)) / Math.max(1, n);
    const inner = [];
    let needH = BAND_H;
    for (let i = 0; i < row.length; i += 1) {
      const b = row[i];
      const lines = blockLines(b.label, n === 1 ? VIEWBOX_W - 80 : innerW);
      const extra = b.share ? 14 : 0;
      const bh = boxH(lines, extra);
      needH = Math.max(needH, Math.max(BAND_H, bh + 8));
      inner.push({
        id: b.id,
        label: b.label,
        lines,
        kind: b.kind || kinds[0] || '',
        gap: isGap(b),
        note: b.note,
        source: b.source,
        share: b.filed && b.share ? b.share : '',
        i,
      });
    }
    const h = needH;
    for (let i = 0; i < inner.length; i += 1) {
      const w = n === 1 ? VIEWBOX_W : innerW;
      inner[i].x = n === 1 ? 0 : innerPad + i * (innerW + gapX);
      inner[i].y = y;
      inner[i].w = w;
      inner[i].h = h;
    }
    bands.push({
      layer,
      x: 0,
      y,
      w: VIEWBOX_W,
      h,
      kind: kinds[0] || '',
      gap,
      blocks: inner,
    });
    y += h;
  }
  const captions = [];
  const byId = new Map(blocksIn.map((b) => [b.id, b]));
  for (const e of edgesIn) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const la = Number.isFinite(Number(a.layer)) ? Number(a.layer) : 0;
    const lb = Number.isFinite(Number(b.layer)) ? Number(b.layer) : 0;
    if (Math.abs(la - lb) !== 1) continue;
    if (!e.label) continue;
    const topLayer = Math.min(la, lb);
    const band = bands.find((x) => x.layer === topLayer);
    if (!band) continue;
    captions.push({
      text: e.label,
      x: VIEWBOX_W / 2,
      y: band.y + band.h - 2,
      role: 'seam',
    });
  }
  return {
    type: 'stack',
    viewBox: { w: VIEWBOX_W, h: Math.max(BAND_H, y) },
    bands,
    tiles: [],
    blocks: bands.flatMap((band) => band.blocks),
    edges: [],
    lanes: [],
    captions,
    footnote: null,
    fallback: false,
  };
}

function pathHV(x1, y1, x2, y2) {
  if (Math.abs(y1 - y2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  if (Math.abs(x1 - x2) < 1) return `M ${x1} ${y1} L ${x2} ${y2}`;
  const midY = (y1 + y2) / 2;
  return `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;
}

export function layoutFlow(diagram) {
  const blocksIn = [...(Array.isArray(diagram.blocks) ? diagram.blocks : [])]
    .sort((a, b) => (Number(a.layer) || 0) - (Number(b.layer) || 0));
  const edgesIn = Array.isArray(diagram.edges) && diagram.edges.length
    ? diagram.edges
    : implicitFlowEdges(blocksIn);
  if (blocksIn.length < 1) return layoutFallback(diagram, 'layout fallback');

  const inset = 12;
  const arrowW = 36;
  const rowGap = 28;
  const rows = [];
  for (let i = 0; i < blocksIn.length; i += FLOW_WRAP) {
    rows.push(blocksIn.slice(i, i + FLOW_WRAP));
  }
  const placed = [];
  const pos = new Map();
  let y = 16;
  rows.forEach((row, ri) => {
    const rtl = ri % 2 === 1;
    const n = row.length;
    const inner = VIEWBOX_W - inset * 2;
    const boxW = (inner - arrowW * Math.max(0, n - 1)) / n;
    const prepared = row.map((b) => {
      const lines = blockLines(b.label, boxW);
      const extra = (b.share ? 14 : 0) + (isGap(b) ? 12 : 0);
      return { b, lines, h: boxH(lines, extra) };
    });
    const rowH = Math.max(40, ...prepared.map((p) => p.h));
    prepared.forEach((p, i) => {
      const vis = rtl ? (n - 1 - i) : i;
      const x = inset + vis * (boxW + arrowW);
      const block = {
        id: p.b.id,
        x,
        y,
        w: boxW,
        h: rowH,
        label: p.b.label,
        lines: p.lines,
        kind: p.b.kind || '',
        gap: isGap(p.b),
        note: p.b.note,
        source: p.b.source,
        share: p.b.filed && p.b.share ? p.b.share : '',
        row: ri,
        rtl,
      };
      placed.push(block);
      pos.set(p.b.id, block);
    });
    y += rowH + rowGap;
  });

  const edges = [];
  for (const e of edgesIn) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    const gap = isGap(e) || e.status === 'gap' || e.status === 'unknown';
    let x1;
    let x2;
    if (a.row === b.row) {
      const aRightOfB = a.x > b.x;
      x1 = aRightOfB ? a.x : a.x + a.w;
      x2 = aRightOfB ? b.x + b.w : b.x;
    } else {
      x1 = a.x + a.w / 2;
      x2 = b.x + b.w / 2;
    }
    const y1 = a.row === b.row ? a.y + a.h / 2 : a.y + a.h;
    const y2 = a.row === b.row ? b.y + b.h / 2 : b.y;
    const d = pathHV(x1, y1, x2, y2);
    const lx = (x1 + x2) / 2;
    const ly = (y1 + y2) / 2 - 6;
    edges.push({
      from: e.from,
      to: e.to,
      d,
      gap,
      dashed: gap,
      label: e.label || (gap ? 'GAP' : ''),
      lx,
      ly,
      arrow: true,
    });
  }

  const h = y - rowGap + 12;
  return {
    type: 'flow',
    viewBox: { w: VIEWBOX_W, h: Math.max(80, h) },
    bands: [],
    tiles: [],
    blocks: placed,
    edges,
    lanes: [],
    captions: [],
    footnote: null,
    fallback: false,
  };
}

function assignInterconnectCols(blocks, edges) {
  const asFrom = new Set();
  const asTo = new Set();
  for (const e of edges) {
    if (e.from) asFrom.add(e.from);
    if (e.to) asTo.add(e.to);
  }
  const col = new Map();
  const left = [];
  const center = [];
  const right = [];
  let flip = 0;
  for (const b of blocks) {
    let slot;
    if (str(b.kind).toLowerCase() === 'networking') slot = 'center';
    else if (isGap(b)) slot = 'right';
    else if (asFrom.has(b.id) && !asTo.has(b.id)) slot = 'left';
    else if (asTo.has(b.id) && !asFrom.has(b.id)) slot = 'right';
    else {
      slot = flip % 2 === 0 ? 'left' : 'right';
      flip += 1;
    }
    col.set(b.id, slot);
    if (slot === 'left') left.push(b);
    else if (slot === 'center') center.push(b);
    else right.push(b);
  }
  return { left, center, right, col };
}

export function layoutInterconnect(diagram) {
  const blocksIn = Array.isArray(diagram.blocks) ? diagram.blocks : [];
  const edgesIn = Array.isArray(diagram.edges) ? diagram.edges : [];
  if (blocksIn.length < 1) return layoutFallback(diagram, 'layout fallback');
  const { left, center, right } = assignInterconnectCols(blocksIn, edgesIn);
  const cols = [left, center, right];
  const inset = 12;
  const gapX = 28;
  const colW = (VIEWBOX_W - inset * 2 - gapX * 2) / 3;
  const gapY = 14;
  const placed = [];
  const pos = new Map();
  let maxY = 24;
  cols.forEach((list, ci) => {
    let y = 20;
    for (const b of list) {
      const lines = blockLines(b.label, colW);
      const extra = (b.share ? 14 : 0) + (isGap(b) ? 14 : 0);
      const h = boxH(lines, extra);
      const block = {
        id: b.id,
        x: inset + ci * (colW + gapX),
        y,
        w: colW,
        h,
        label: b.label,
        lines,
        kind: b.kind || '',
        gap: isGap(b),
        note: b.note,
        source: b.source,
        share: b.filed && b.share ? b.share : '',
        col: ci,
      };
      placed.push(block);
      pos.set(b.id, block);
      y += h + gapY;
    }
    maxY = Math.max(maxY, y);
  });

  const edges = [];
  for (const e of edgesIn) {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    if (!a || !b) continue;
    const gap = isGap(e) || e.status === 'gap' || e.status === 'unknown';
    const aMidY = a.y + a.h / 2;
    const bMidY = b.y + b.h / 2;
    let x1;
    let x2;
    if (a.x + a.w < b.x) {
      x1 = a.x + a.w;
      x2 = b.x;
    } else if (b.x + b.w < a.x) {
      x1 = a.x;
      x2 = b.x + b.w;
    } else {
      x1 = a.x + a.w / 2;
      x2 = b.x + b.w / 2;
    }
    const d = pathHV(x1, aMidY, x2, bMidY);
    edges.push({
      from: e.from,
      to: e.to,
      d,
      gap,
      dashed: gap,
      label: e.label || (gap ? 'GAP' : ''),
      lx: (x1 + x2) / 2,
      ly: (aMidY + bMidY) / 2 - 8,
      arrow: true,
    });
  }

  return {
    type: 'interconnect',
    viewBox: { w: VIEWBOX_W, h: Math.max(80, maxY + 8) },
    bands: [],
    tiles: [],
    blocks: placed,
    edges,
    lanes: [],
    captions: [],
    footnote: null,
    fallback: false,
  };
}

export function layoutSegments(diagram) {
  const blocksIn = Array.isArray(diagram.blocks) ? diagram.blocks : [];
  if (blocksIn.length < 1) return layoutFallback(diagram, 'layout fallback');
  const byId = new Map(blocksIn.map((b) => [b.id, b]));
  const groupOrder = [];
  const grouped = new Map();
  for (const b of blocksIn) {
    const g = str(b.group) || '_';
    if (!grouped.has(g)) {
      grouped.set(g, []);
      groupOrder.push(g);
    }
    grouped.get(g).push(b);
  }

  const inset = 8;
  const laneGap = 10;
  const nLanes = groupOrder.length;
  const laneW = (VIEWBOX_W - inset * 2 - laneGap * Math.max(0, nLanes - 1)) / Math.max(1, nLanes);
  const headerH = 22;
  const lanes = [];
  const tiles = [];
  let maxH = 40;

  groupOrder.forEach((g, gi) => {
    const members = grouped.get(g);
    const roots = members.filter((b) => !b.parent || !members.some((m) => m.id === b.parent));
    const childrenOf = new Map();
    for (const b of members) {
      if (b.parent && byId.has(b.parent)) {
        if (!childrenOf.has(b.parent)) childrenOf.set(b.parent, []);
        childrenOf.get(b.parent).push(b);
      }
    }
    const lx = inset + gi * (laneW + laneGap);
    const src = members.find((b) => b.source)?.source || '';
    const asOf = members.find((b) => b.as_of)?.as_of || '';
    const laneLabel = g === '_' ? '' : g;
    const sub = [src, asOf].filter(Boolean).join(' · ');
    lanes.push({
      id: g,
      label: sub ? `${laneLabel}${laneLabel ? ' · ' : ''}${sub}` : laneLabel,
      x: lx,
      y: 4,
      w: laneW,
      h: headerH,
      source: src,
      as_of: asOf,
    });

    const nRoots = Math.max(1, roots.length);
    const rootGap = 8;
    const weights = roots.map((root) => 1 + (childrenOf.get(root.id) || []).length);
    const weightSum = weights.reduce((a, b) => a + b, 0) || 1;
    const innerLane = laneW - 8 - rootGap * (nRoots - 1);
    let laneBottom = headerH + 6;
    let cursorX = lx + 4;
    roots.forEach((root, ri) => {
      const kids = childrenOf.get(root.id) || [];
      const rootW = innerLane * (weights[ri] / weightSum);
      const rx = cursorX;
      cursorX += rootW + rootGap;
      const ry = headerH + 6;
      const childGap = 6;
      const childPadX = 8;
      const innerW = rootW - childPadX * 2;
      const childW = kids.length
        ? (innerW - childGap * (kids.length - 1)) / kids.length
        : 0;
      const rootLines = blockLines(root.label, rootW - 16);
      const headerBox = boxH(rootLines, root.share ? 14 : 0);
      let childH = 0;
      const kidGeom = kids.map((k) => {
        const lines = blockLines(k.label, childW);
        const h = boxH(lines, k.share ? 14 : 0);
        childH = Math.max(childH, h);
        return { k, lines };
      });
      // Equal sibling child size (max of the set) — size ⊥ share.
      const kidBoxH = kids.length ? Math.max(40, childH) : 0;
      const rootH = headerBox + (kids.length ? kidBoxH + 12 : 0);
      tiles.push({
        id: root.id,
        x: rx,
        y: ry,
        w: rootW,
        h: rootH,
        label: root.label,
        lines: rootLines,
        kind: root.kind || '',
        gap: isGap(root),
        share: root.filed && root.share ? root.share : '',
        filed: root.filed === true,
        depth: 0,
        parent: null,
        group: g === '_' ? '' : g,
        note: root.note,
        source: root.source,
        header: kids.length > 0,
      });
      kidGeom.forEach((kg, ki) => {
        tiles.push({
          id: kg.k.id,
          x: rx + childPadX + ki * (childW + childGap),
          y: ry + headerBox,
          w: childW,
          h: kidBoxH,
          label: kg.k.label,
          lines: kg.lines,
          kind: kg.k.kind || '',
          gap: isGap(kg.k),
          share: kg.k.filed && kg.k.share ? kg.k.share : '',
          filed: kg.k.filed === true,
          depth: 1,
          parent: root.id,
          group: g === '_' ? '' : g,
          note: kg.k.note,
          source: kg.k.source,
        });
      });
      laneBottom = Math.max(laneBottom, ry + rootH);
    });
    maxH = Math.max(maxH, laneBottom);
  });

  const footY = maxH + 18;
  return {
    type: 'segments',
    viewBox: { w: VIEWBOX_W, h: footY + 10 },
    bands: [],
    tiles,
    blocks: tiles,
    edges: [],
    lanes,
    captions: [{ text: SEGMENTS_FOOTNOTE, x: 10, y: footY, role: 'foot' }],
    footnote: SEGMENTS_FOOTNOTE,
    fallback: false,
  };
}

/**
 * Total function: never throws on validated input. Fallback grid if needed.
 * @param {object} diagram
 */
export function layoutDiagram(diagram) {
  try {
    const d = diagram && typeof diagram === 'object' ? diagram : {};
    const type = str(d.type).toLowerCase();
    if (type === 'stack') return layoutStack(d);
    if (type === 'flow') return layoutFlow(d);
    if (type === 'segments') return layoutSegments(d);
    if (type === 'interconnect') return layoutInterconnect(d);
    return layoutFallback(d, 'layout fallback');
  } catch {
    return layoutFallback(diagram && typeof diagram === 'object' ? diagram : {}, 'layout fallback');
  }
}
