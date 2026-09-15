// Pure helpers for the Background architecture board.
// Default tab follows family required_diagrams order, then first present type.
// Zero ticker literals. Desk N inherits this file.

export const DIAGRAM_TAB_ORDER = Object.freeze(['stack', 'flow', 'segments', 'interconnect']);

export const DIAGRAM_TAB_LABEL = Object.freeze({
  stack: 'Stack',
  flow: 'Flow',
  segments: 'Segments',
  interconnect: 'Attach',
});

function typeOf(d) {
  return String(d && d.type || '').toLowerCase();
}

/**
 * @param {object[]} diagrams
 * @param {string[]} [order] family required_diagrams from the snapshot
 * @returns {object|null}
 */
export function pickBoardDiagram(diagrams, order) {
  const list = Array.isArray(diagrams) ? diagrams : [];
  if (!list.length) return null;
  const pref = Array.isArray(order) && order.length ? order : DIAGRAM_TAB_ORDER;
  for (const t of pref) {
    const hit = list.find((d) => typeOf(d) === String(t).toLowerCase());
    if (hit) return hit;
  }
  return list[0];
}

/** Unique types on this map, stable family-first order. */
export function diagramTabTypes(diagrams, order) {
  const list = Array.isArray(diagrams) ? diagrams : [];
  const seen = new Set();
  const out = [];
  const pref = Array.isArray(order) && order.length ? order : DIAGRAM_TAB_ORDER;
  for (const t of pref) {
    const key = String(t).toLowerCase();
    if (list.some((d) => typeOf(d) === key) && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  for (const d of list) {
    const key = typeOf(d);
    if (key && !seen.has(key)) {
      seen.add(key);
      out.push(key);
    }
  }
  return out;
}

export function tabLabel(type) {
  const t = String(type || '').toLowerCase();
  return DIAGRAM_TAB_LABEL[t] || t || 'Board';
}
