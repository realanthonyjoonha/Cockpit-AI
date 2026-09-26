/**
 * Company title for any desk.
 * A pack name that is only the file slug or the ticker is not a title.
 * displayName / label is the registry name. No ticker is special-cased.
 */
export function shownCompanyName(packName, desk = {}) {
  const name = String(packName || '').trim();
  const low = name.toLowerCase();
  const slug = String(desk.slug || '').toLowerCase();
  const tick = String(desk.ticker || '').toLowerCase();
  const fallback = String(desk.displayName || desk.company || desk.label || '').trim();
  if (!name || (slug && low === slug) || (tick && low === tick)) return fallback || name;
  return name;
}
