// sourceCatalog.js — desk-owned source rows only (never the whole vault).
// Decision-support only.

function normPath(p) {
  return String(p || '').replace(/\\/g, '/').toLowerCase();
}

/** True if filePath matches a pack source_glob (relative to vault, * = one path segment). */
export function pathMatchesGlob(filePath, globPattern) {
  const p = normPath(filePath);
  const g = normPath(globPattern).replace(/^\.\//, '');
  if (!p || !g) return false;
  const esc = g.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*');
  return new RegExp(`(?:^|/)${esc}$`).test(p);
}

/**
 * Keep catalog rows that belong to this desk.
 * @param {{ id?: string, path?: string }} entry
 * @param {{ ticker?: string, slug?: string, entitySlug?: string, rawDir?: string, sourceGlobs?: string[] }} desk
 */
export function sourceOwnedByDesk(entry, desk) {
  if (!entry || !desk) return false;
  const ticker = String(desk.ticker || '').toLowerCase();
  const slug = String(desk.slug || desk.entitySlug || ticker).toLowerCase();
  const entity = String(desk.entitySlug || slug).toLowerCase();
  const prefixes = [...new Set([ticker, slug, entity].filter(Boolean))];
  if (!prefixes.length) return false;

  const id = String(entry.id || '').toLowerCase();
  const pth = normPath(entry.path);
  const stem = (pth.split('/').pop() || '').replace(/\.md$/i, '');
  const prefixed = (name) => prefixes.some((x) => name === x || name.startsWith(`${x}-`));

  if (prefixed(id) || prefixed(stem)) return true;

  for (const x of prefixes) {
    if (pth.includes(`/entities/${x}.md`) || pth.endsWith(`/entities/${x}.md`)) return true;
    if (pth.includes(`house-view-${x}`)) return true;
    if (pth.includes(`/raw/${x}-research/`)) return true;
  }

  const rawDir = normPath(desk.rawDir).replace(/^\/+/, '');
  if (rawDir && pth.includes(rawDir)) return true;

  for (const g of desk.sourceGlobs || []) {
    if (pathMatchesGlob(pth, g)) return true;
  }
  return false;
}

export function filterCatalogForDesk(entries, desk) {
  const list = Array.isArray(entries) ? entries : [];
  return list.filter((s) => sourceOwnedByDesk(s, desk));
}
