// monorepoPaths.js — resolve vault / ontology paths without requiring ~/Trading tribal layout.
// Priority: env override → monorepo sibling (this clone) → legacy ~/Trading fallback.
// Decision-support only. Does not invent research content.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SERVER_DIR = path.dirname(fileURLToPath(import.meta.url));
/** memory-cockpit-v2/ */
export const GLASS_ROOT = path.resolve(SERVER_DIR, '..');
/** monorepo root (cockpit-research-os/) when glass is checked out as sibling of ontology + research-wiki */
export const MONOREPO_ROOT = path.resolve(GLASS_ROOT, '..');

const MONOREPO_WIKI = path.join(MONOREPO_ROOT, 'research-wiki');
const MONOREPO_ONT = path.join(MONOREPO_ROOT, 'ontology');
const MONOREPO_STORE = path.join(MONOREPO_ONT, 'store', 'by_ticker');

function looksLikeVault(dir) {
  return (
    fs.existsSync(path.join(dir, 'cockpit', 'lib', 'fm.js'))
    || fs.existsSync(path.join(dir, 'wiki', 'entities'))
    || fs.existsSync(path.join(dir, 'house-view-nebius.md'))
  );
}

/**
 * Vault SoR (research-wiki).
 * @returns {string} absolute path
 */
export function resolveVaultDir() {
  if (process.env.COCKPIT_VAULT) {
    return path.resolve(process.env.COCKPIT_VAULT);
  }
  if (looksLikeVault(MONOREPO_WIKI)) {
    return MONOREPO_WIKI;
  }
  return path.join(os.homedir(), 'Trading', 'research-wiki');
}

/**
 * Ontology project root (has ./ont).
 * @returns {string}
 */
export function resolveOntRoot() {
  if (process.env.ONTOLOGY_ROOT) {
    return path.resolve(process.env.ONTOLOGY_ROOT);
  }
  if (fs.existsSync(path.join(MONOREPO_ONT, 'ont'))) {
    return MONOREPO_ONT;
  }
  return path.join(os.homedir(), 'Trading', 'ontology');
}

/**
 * Compiled packs directory (store/by_ticker).
 * @returns {string}
 */
export function resolveStoreDir() {
  if (process.env.ONTOLOGY_STORE) {
    return path.resolve(process.env.ONTOLOGY_STORE);
  }
  const ont = resolveOntRoot();
  const store = path.join(ont, 'store', 'by_ticker');
  if (fs.existsSync(store) || fs.existsSync(path.join(ont, 'ont'))) {
    return store;
  }
  return path.join(os.homedir(), 'Trading', 'ontology', 'store', 'by_ticker');
}

/**
 * Wiki path for ./ont compile (ONTOLOGY_WIKI / COCKPIT_VAULT).
 * @returns {string}
 */
export function resolveWikiDir() {
  if (process.env.ONTOLOGY_WIKI) {
    return path.resolve(process.env.ONTOLOGY_WIKI);
  }
  if (process.env.COCKPIT_VAULT) {
    return path.resolve(process.env.COCKPIT_VAULT);
  }
  return resolveVaultDir();
}

/**
 * Monorepo root for OPEN GROK / slash cwd.
 * @returns {string}
 */
export function resolveRepoRoot() {
  if (process.env.COCKPIT_REPO && fs.existsSync(process.env.COCKPIT_REPO)) {
    return path.resolve(process.env.COCKPIT_REPO);
  }
  // Prefer monorepo if AGENTS.md present (this clone layout)
  if (fs.existsSync(path.join(MONOREPO_ROOT, 'AGENTS.md'))) {
    return MONOREPO_ROOT;
  }
  return MONOREPO_ROOT;
}

// Re-export resolved monorepo candidates for diagnostics
export const candidates = {
  monorepoRoot: MONOREPO_ROOT,
  monorepoWiki: MONOREPO_WIKI,
  monorepoOnt: MONOREPO_ONT,
  monorepoStore: MONOREPO_STORE,
};
