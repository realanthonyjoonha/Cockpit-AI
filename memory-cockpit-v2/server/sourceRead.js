// sourceRead.js — allowlisted read of pack/wiki/provenance files for glass Sources reader.
// Read-only. Path must remap into the live vault (or ontology packs/). Decision-support only.
import fs from 'fs';
import path from 'path';
import { VAULT_DIR, isInsideVault, canonicalize, renderMd, fm } from './vault.js';
import { resolveOntRoot } from './monorepoPaths.js';

export const SOURCE_MAX_BYTES = 800000;

const ONT_ROOT = resolveOntRoot();

/** Map a pack path (often a foreign absolute vault) onto this clone's vault. */
export function remapVaultCandidate(pathStr, vaultDir) {
  if (!pathStr || typeof pathStr !== 'string') return null;
  const raw = pathStr.trim();
  if (!raw) return null;
  const norm = raw.replace(/\\/g, '/');
  if (!path.isAbsolute(raw)) {
    return path.resolve(vaultDir, raw);
  }
  const wiki = norm.search(/\/wiki\//i);
  if (wiki >= 0) return path.resolve(vaultDir, norm.slice(wiki + 1));
  const rawi = norm.search(/\/raw\//i);
  if (rawi >= 0) return path.resolve(vaultDir, norm.slice(rawi + 1));
  const house = norm.match(/\/(house-view-[^/]+\.md)$/i);
  if (house) return path.resolve(vaultDir, house[1]);
  return path.resolve(raw);
}

export function isInsideDir(absCandidate, rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) return false;
  let rootReal;
  try {
    rootReal = fs.realpathSync(rootDir);
  } catch {
    return false;
  }
  const real = canonicalize(absCandidate);
  return real === rootReal || real.startsWith(rootReal + path.sep);
}

function textKindOk(abs) {
  const b = path.basename(abs).toLowerCase();
  return b.endsWith('.md') || b.endsWith('.json') || b.endsWith('.txt');
}

function readTextFile(abs) {
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return { ok: false, reason: 'GAP — file not on disk' };
  }
  const stat = fs.statSync(abs);
  const n = Math.min(stat.size, SOURCE_MAX_BYTES);
  const buf = Buffer.alloc(n);
  const fd = fs.openSync(abs, 'r');
  fs.readSync(fd, buf, 0, n, 0);
  fs.closeSync(fd);
  const markdown = buf.toString('utf8');
  return {
    ok: true,
    markdown,
    bytes: stat.size,
    truncated: stat.size > SOURCE_MAX_BYTES,
  };
}

function decorate(id, title, kind, abs, payload) {
  if (!payload.ok) {
    return {
      available: false,
      id,
      title,
      kind,
      path: abs,
      reason: payload.reason,
      markdown: null,
      html: null,
    };
  }
  let html = null;
  try {
    const { body } = abs.toLowerCase().endsWith('.md')
      ? fm.parseFrontmatter(payload.markdown)
      : { body: payload.markdown };
    html = renderMd(body || payload.markdown);
  } catch {
    html = `<pre>${escapeHtml(payload.markdown.slice(0, 20000))}</pre>`;
  }
  return {
    available: true,
    id,
    title,
    kind,
    path: abs,
    bytes: payload.bytes,
    truncated: payload.truncated || false,
    markdown: payload.markdown,
    html,
    note: payload.truncated
      ? `Truncated to ${SOURCE_MAX_BYTES} bytes for glass (file is ${payload.bytes} bytes).`
      : undefined,
  };
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/**
 * Resolve + read one allowlisted file.
 * @param {{ pathStr: string, vaultDir?: string, ontRoot?: string, allowOntPacks?: boolean }} opts
 */
export function openMappedFile(opts) {
  const vaultDir = opts.vaultDir || VAULT_DIR;
  const ontRoot = opts.ontRoot || ONT_ROOT;
  const pathStr = opts.pathStr;
  const allowOntPacks = !!opts.allowOntPacks;
  const mapped = remapVaultCandidate(pathStr, vaultDir);
  if (!mapped) return { ok: false, reason: 'GAP — empty path' };
  if (!textKindOk(mapped)) return { ok: false, reason: 'GAP — not a text source (.md / .json / .txt)' };

  const inVault = vaultDir === VAULT_DIR ? isInsideVault(mapped) : isInsideDir(mapped, vaultDir);
  const packsRoot = path.join(ontRoot, 'packs');
  const inPacks = allowOntPacks && isInsideDir(mapped, packsRoot);
  if (!inVault && !inPacks) {
    return { ok: false, reason: 'path not in vault' };
  }
  return readTextFile(mapped);
}

/**
 * @param {{ pack: object, id: string, houseFile?: string, entitySlug?: string, ticker?: string }} args
 */
export function readCatalogSource({ pack, id, houseFile, entitySlug, ticker }) {
  const rawId = decodeURIComponent(String(id || '')).trim();
  if (!rawId) {
    return { available: false, id: '', reason: 'missing source id', markdown: null, html: null };
  }

  if (rawId === '__entity__') {
    const p = pack?.provenance?.entity_path
      || (entitySlug ? path.join(VAULT_DIR, 'wiki', 'entities', `${entitySlug}.md`) : null);
    if (!p) return { available: false, id: rawId, reason: 'GAP — no entity path', markdown: null, html: null };
    const got = openMappedFile({ pathStr: p });
    return decorate(rawId, 'Entity', 'entity', remapVaultCandidate(p, VAULT_DIR), got);
  }
  if (rawId === '__house__') {
    const p = pack?.provenance?.house_view
      || (houseFile ? path.join(VAULT_DIR, houseFile) : null);
    if (!p) return { available: false, id: rawId, reason: 'GAP — no house path', markdown: null, html: null };
    const got = openMappedFile({ pathStr: p });
    return decorate(rawId, 'House view', 'house-view', remapVaultCandidate(p, VAULT_DIR), got);
  }
  if (rawId === '__pack_config__') {
    const rel = pack?.provenance?.pack_config || (ticker ? `packs/${ticker}.json` : null);
    if (!rel) return { available: false, id: rawId, reason: 'GAP — no pack config', markdown: null, html: null };
    const abs = path.isAbsolute(rel) ? rel : path.join(ONT_ROOT, rel);
    const got = openMappedFile({ pathStr: abs, allowOntPacks: true });
    return decorate(rawId, 'Pack config', 'pack-config', abs, got);
  }

  const list = Array.isArray(pack?.sources) ? pack.sources : [];
  const hit = list.find((s) => String(s.id) === rawId);
  if (!hit) {
    return { available: false, id: rawId, reason: 'not in pack catalog', markdown: null, html: null };
  }
  const pathStr = hit.path;
  if (!pathStr) {
    return { available: false, id: rawId, title: hit.title, reason: 'GAP — catalog row has no path', markdown: null, html: null };
  }
  const mapped = remapVaultCandidate(pathStr, VAULT_DIR);
  const got = openMappedFile({ pathStr });
  return decorate(rawId, hit.title || rawId, hit.kind || hit.type || null, mapped, got);
}
