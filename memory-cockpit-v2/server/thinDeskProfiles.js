// thinDeskProfiles.js — load thin desk model/ask profiles from config/thin-desks.json.
// Desk N = research + pack + registry profile fields (no PROFILES map in thinDeskMount).
// Live mtime cache: MCP + helpers re-read when thin-desks.json changes (same idea as glass).
// Decision-support only. Fail closed on missing required paths.
import { readFileSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
export const REG_PATH = path.join(ROOT, 'config', 'thin-desks.json');

/** @type {{ mtimeMs: number, registry: object, registryPath: string, bySlug: object } | null} */
let profilesLiveCache = null;

function asRe(pattern, flags = 'i') {
  if (pattern instanceof RegExp) return pattern;
  if (typeof pattern === 'string' && pattern.length) return new RegExp(pattern, flags);
  return /./;
}

/**
 * Build model profile object expected by createThinModel.
 * @param {object} desk — registry desk row
 */
export function modelProfileFromDesk(desk) {
  const p = desk.profile || {};
  const slug = desk.slug;
  const ticker = desk.ticker;
  if (!slug || !ticker) {
    throw new Error(`thin-desks.json desk missing slug/ticker: ${JSON.stringify(desk)}`);
  }
  const houseFile = desk.house_file || p.houseFile;
  const rawDir = p.rawDir;
  const risksSource = p.risksSource;
  const risksGenerated = p.risksGenerated;
  if (!houseFile || !rawDir || !risksSource || !risksGenerated) {
    throw new Error(
      `thin-desks.json desk "${slug}": profile requires house_file, rawDir, risksSource, risksGenerated`,
    );
  }
  return {
    ticker: String(ticker).toUpperCase(),
    slug,
    deskId: desk.id || slug,
    displayName: p.displayName || desk.label || ticker,
    houseFile,
    entitySlug: p.entitySlug || desk.id || slug,
    rawDir,
    risksSource,
    risksGenerated,
    sourcePrimaryRe: asRe(p.sourcePrimaryRe || slug),
    stanceExtended: !!p.stanceExtended,
    houseTitleDefault: p.houseTitleDefault || `House View — ${p.displayName || desk.label || ticker} (${ticker})`,
    neverGeneratedNote: p.neverGeneratedNote
      || `SoR is ${risksSource} (generated cards under ${risksGenerated} are compile output)`,
  };
}

/**
 * Build ask profile for createThinAsk.
 * @param {object} desk
 */
export function askProfileFromDesk(desk) {
  const p = desk.profile || {};
  const ask = p.ask || {};
  const ticker = String(desk.ticker || '').toUpperCase();
  const displayName = p.displayName || desk.label || ticker;
  const name = String(displayName).toLowerCase();
  const slug = desk.slug;
  return {
    ticker,
    displayName,
    houseConflictNeedles: ask.houseConflictNeedles || ['sca', 'backlog', 'earnings'],
    claimRouteNeedles: ask.claimRouteNeedles || [],
    claimTopicNeedles: ask.claimTopicNeedles || [],
    claimTopicRe: asRe(ask.claimTopicRe || name),
    sourcePrimaryRe: asRe(ask.sourcePrimaryRe || p.sourcePrimaryRe || slug),
    companyQuestionNeedles: ask.companyQuestionNeedles || [
      `what is ${name}`,
      `who is ${name}`,
      'company',
      'summary',
      `what is ${String(ticker).toLowerCase()}`,
    ],
  };
}

/**
 * Load full registry + hydrated profiles by slug.
 * @returns {{
 *   registry: object,
 *   registryPath: string,
 *   bySlug: Record<string, { desk: object, model: object, ask: object }>,
 * }}
 */
export function loadThinDeskProfiles() {
  const registry = JSON.parse(readFileSync(REG_PATH, 'utf8'));
  // Empty desks[] is valid cold-start kernel (no company underwritten yet)
  if (!Array.isArray(registry.desks)) {
    throw new Error('thin-desks.json: desks[] must be an array (may be empty)');
  }
  /** @type {Record<string, { desk: object, model: object, ask: object }>} */
  const bySlug = {};
  for (const desk of registry.desks) {
    const model = modelProfileFromDesk(desk);
    const ask = askProfileFromDesk(desk);
    if (model.ticker !== String(desk.ticker).toUpperCase()) {
      throw new Error(`desk ${desk.slug}: ticker mismatch`);
    }
    bySlug[desk.slug] = { desk, model, ask };
  }
  return { registry, registryPath: REG_PATH, bySlug };
}

/**
 * Registry + profiles with mtime cache (re-read thin-desks.json when it changes).
 * Use this from MCP and long-lived processes — do not freeze desks at process start.
 * @returns {{
 *   mtimeMs: number,
 *   registry: object,
 *   registryPath: string,
 *   bySlug: Record<string, { desk: object, model: object, ask: object }>,
 * }}
 */
export function getLiveThinDeskProfiles() {
  let mtimeMs = 0;
  try {
    mtimeMs = statSync(REG_PATH).mtimeMs;
  } catch (e) {
    throw new Error(`thin-desks.json unreadable: ${e.message || e}`);
  }
  if (profilesLiveCache && profilesLiveCache.mtimeMs === mtimeMs) {
    return profilesLiveCache;
  }
  const loaded = loadThinDeskProfiles();
  profilesLiveCache = {
    mtimeMs,
    registry: loaded.registry,
    registryPath: loaded.registryPath,
    bySlug: loaded.bySlug,
  };
  return profilesLiveCache;
}

/** Drop live cache (tests / explicit refresh). Next getLiveThinDeskProfiles re-reads disk. */
export function clearThinDeskProfilesCache() {
  profilesLiveCache = null;
}

/** @param {string} slug */
export function getThinDeskBundle(slug) {
  const { bySlug } = getLiveThinDeskProfiles();
  const b = bySlug[slug];
  if (!b) {
    const known = Object.keys(bySlug);
    throw new Error(
      `unknown thin desk slug "${slug}" — known: ${known.length ? known.join(', ') : '(none — empty kernel)'}`,
    );
  }
  return b;
}

/** Optional profile for legacy re-exports when slug not registered (empty kernel). */
export function tryGetThinDeskBundle(slug) {
  try {
    return getThinDeskBundle(slug);
  } catch {
    return null;
  }
}
