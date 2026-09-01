// vault.js — read-only vault access. The vault is the brain; this module NEVER writes it
// (the single exception in the whole app is the machine sidecar .sync-state.json, owned by
// server/index.js). Parser comes from the vault's own cockpit/lib/fm.js so the schema has
// exactly one definition (§5).
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
import { marked } from 'marked';
import { resolveVaultDir } from './monorepoPaths.js';

// Prefer COCKPIT_VAULT → monorepo research-wiki → legacy ~/Trading/research-wiki
export const VAULT_DIR = resolveVaultDir();
export const VAULT_REAL = fs.existsSync(VAULT_DIR) ? fs.realpathSync(VAULT_DIR) : VAULT_DIR;

/**
 * Frontmatter parser. Prefer vault cockpit/lib/fm.js (one schema with lint/sync).
 * Empty product / this VM may have no vault — never require ~/Trading/research-wiki.
 * Stub is parse-only; it does not invent research content.
 */
function stubParseFrontmatter(raw) {
  const text = String(raw ?? '');
  if (!text.startsWith('---')) return { meta: {}, body: text };
  const end = text.indexOf('\n---', 3);
  if (end < 0) return { meta: {}, body: text };
  const block = text.slice(3, end).replace(/^\n/, '');
  const body = text.slice(end + 4).replace(/^\n/, '');
  const meta = {};
  for (const line of block.split('\n')) {
    const m = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!m) continue;
    meta[m[1]] = m[2].replace(/^['"]|['"]$/g, '').trim();
  }
  return { meta, body };
}

async function loadFm() {
  const p = path.join(VAULT_DIR, 'cockpit', 'lib', 'fm.js');
  if (!fs.existsSync(p)) {
    return { parseFrontmatter: stubParseFrontmatter };
  }
  try {
    return await import(pathToFileURL(p).href);
  } catch {
    return { parseFrontmatter: stubParseFrontmatter };
  }
}

export const fm = await loadFm();

// symlink-safe path guard (ported from v1): realpath the deepest existing ancestor
export function canonicalize(absCandidate) {
  let probe = path.resolve(absCandidate);
  const missing = [];
  while (!fs.existsSync(probe)) {
    missing.unshift(path.basename(probe));
    const parent = path.dirname(probe);
    if (parent === probe) break;
    probe = parent;
  }
  return path.join(fs.realpathSync(probe), ...missing);
}
export function isInsideVault(absCandidate) {
  const real = canonicalize(absCandidate);
  return real === VAULT_REAL || real.startsWith(VAULT_REAL + path.sep);
}

// ---------- page scan (reader + ⌘K + backlinks) ----------
const SKIP_DIRS = new Set(['raw', 'reports', 'scripts', 'templates', 'viz', 'workflows', 'Users', 'node_modules', 'lib', 'updaters']);

function listMarkdownFiles(dir) {
  const out = [];
  const walk = (d) => {
    for (const entry of fs.readdirSync(d, { withFileTypes: true })) {
      if (entry.name.startsWith('.')) continue;
      const p = path.join(d, entry.name);
      if (entry.isDirectory()) { if (!SKIP_DIRS.has(entry.name)) walk(p); }
      else if (entry.name.endsWith('.md')) out.push(p);
    }
  };
  walk(dir);
  return out;
}

export function parsePage(absPath) {
  const raw = fs.readFileSync(absPath, 'utf8');
  const { meta, body } = fm.parseFrontmatter(raw);
  const rel = path.relative(VAULT_DIR, absPath);
  const slug = String(meta.slug || path.basename(absPath, '.md')).trim();
  const titleMatch = body.match(/^#\s+(.+)$/m);
  const links = [...body.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|[^\]]*)?\]\]/g)]
    .map((m) => m[1].trim()).filter((s, i, a) => s && a.indexOf(s) === i);
  return {
    slug, rel, abs: absPath,
    name: meta.name || (titleMatch ? titleMatch[1].trim() : slug),
    type: meta.type || 'page',
    updated: meta.updated || null,
    links, body,
  };
}

let cache = null, cacheTime = 0;
export function scanVault(force = false) {
  const now = Date.now();
  if (cache && !force && now - cacheTime < 5000) return cache;
  if (!fs.existsSync(VAULT_DIR)) {
    cache = { pages: [], bySlug: new Map() };
    cacheTime = now;
    return cache;
  }
  const pages = [];
  for (const f of listMarkdownFiles(VAULT_DIR)) {
    try { pages.push(parsePage(f)); } catch { /* unreadable page — skip, never crash */ }
  }
  const bySlug = new Map(pages.map((p) => [p.slug.toLowerCase(), p]));
  cache = { pages, bySlug };
  cacheTime = now;
  return cache;
}
export function resolveSlug(slug) {
  return scanVault().bySlug.get(String(slug).toLowerCase()) || null;
}
export function backlinksFor(slug) {
  const s = String(slug).toLowerCase();
  return scanVault().pages
    .filter((p) => p.links.some((l) => l.toLowerCase() === s))
    .map((p) => ({ slug: p.slug, name: p.name }));
}

// wikilinks → in-app reader links; unresolved links degrade to plain text
export function renderMd(md) {
  const linked = md.replace(/\[\[([^\]|#]+)(?:#[^\]|]*)?(?:\|([^\]]+))?\]\]/g, (_, target, label) => {
    const t = target.trim();
    return resolveSlug(t) ? `[${label || t}](#/page/${encodeURIComponent(t)})` : (label || t);
  });
  return marked.parse(linked);
}

// ---------- house view (READ-ONLY, always) ----------
export function houseView() {
  try {
    const raw = fs.readFileSync(path.join(VAULT_DIR, 'house-view.md'), 'utf8');
    const { meta, body } = fm.parseFrontmatter(raw);
    return { raw, body, updated: meta.updated || null };
  } catch { return { raw: '', body: '', updated: null }; }
}

// parse the CONFIRMED Memory/DRAM entry into the stance-strip fields. Content-coupled
// regexes with raw-text fallbacks — a house-view rewrite degrades the display, never crashes.
export function stance() {
  const { body, updated } = houseView();
  const secM = body.match(/^### Memory \/ DRAM[^\n]*?(CONFIRMED|FORMING|DRAFT)[^\n]*?(\d{4}-\d{2}-\d{2})[\s\S]*?(?=^### |\n## |$(?![\s\S]))/m);
  const sec = secM ? secM[0] : '';
  const bullet = (label) => {
    const m = sec.match(new RegExp(`\\*\\*${label}:?\\*\\*:?\\s*([^\\n]+)`));
    return m ? m[1].replace(/\*\*/g, '').replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).trim() : null;
  };
  const stage = bullet('Stage'), regime = bullet('Regime'), horizon = bullet('Horizon');
  const drivers = bullet('Demand drivers');
  const shortHorizon = horizon ? (horizon.match(/at least to (\d{4})/) ? `SHORTAGE ≥${horizon.match(/at least to (\d{4})/)[1]}` : horizon.slice(0, 24).toUpperCase()) : null;
  return {
    confirmed: secM ? secM[1] : null,
    confirmedDate: secM ? secM[2] : null,
    updated,
    stage, regime, horizon, drivers,
    line: [
      stage ? stage.split('—')[0].trim().toUpperCase() : null,
      regime && /de-cycled/i.test(regime) ? 'STRUCTURAL DE-CYCLE' : regime ? regime.slice(0, 28).toUpperCase() : null,
      shortHorizon,
      drivers && /content per AI chip/i.test(drivers) ? 'HINGE = HBM/DRAM CONTENT PER AI CHIP' : null,
    ].filter(Boolean).join(' · '),
  };
}

// ---------- sync state (machine sidecar — read here, written only by index.js) ----------
export const STATE_PATH = path.join(VAULT_DIR, 'cockpit', '.sync-state.json');
export const LOCK_PATH = path.join(VAULT_DIR, 'cockpit', '.sync.lock');
export function syncState() {
  try { return JSON.parse(fs.readFileSync(STATE_PATH, 'utf8')); } catch { return { updaters: {} }; }
}
