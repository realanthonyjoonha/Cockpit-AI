// pack.js — read compiled ontology packs (JSON) for dual-read desks.
// Request-time file read only — never spawns ./ont (PATH/launchd footgun).
// Cache TTL matches vault scan (5s). Never invents content if the file is missing.
import fs from 'fs';
import path from 'path';
import { resolveStoreDir } from './monorepoPaths.js';

// Prefer ONTOLOGY_STORE → monorepo ontology/store/by_ticker → legacy ~/Trading
const STORE_DIR = resolveStoreDir();

const cache = new Map(); // ticker → { at, data, path, exists, mtimeMs }

/**
 * Load a compiled pack by ticker (e.g. 'NBIS').
 * @param {string} ticker
 * @param {{ force?: boolean }} [opts] — force: skip TTL and re-read from disk (book refresh)
 * @returns {{ available: boolean, pack: object|null, path: string, reason?: string, mtimeMs?: number }}
 */
export function loadPack(ticker, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id) return { available: false, pack: null, path: '', reason: 'empty ticker' };

  const packPath = path.join(STORE_DIR, `${id}.json`);
  const now = Date.now();
  const force = opts.force === true;
  const hit = cache.get(id);

  // mtime is authoritative: compile must never leave glass on a stale pack mid-TTL.
  // TTL only skips re-parse when the file is unchanged.
  if (!force && hit) {
    try {
      if (hit.exists && fs.existsSync(packPath)) {
        const mtimeMs = fs.statSync(packPath).mtimeMs;
        if (mtimeMs === hit.mtimeMs && now - hit.at < 5000) {
          return {
            available: true,
            pack: hit.data,
            path: packPath,
            mtimeMs: hit.mtimeMs,
          };
        }
        // mtime changed or TTL expired → fall through to re-read
      } else if (!hit.exists && !fs.existsSync(packPath)) {
        if (now - hit.at < 5000) {
          return {
            available: false,
            pack: null,
            path: packPath,
            reason: 'pack file missing',
            mtimeMs: null,
          };
        }
      }
    } catch { /* fall through to reload */ }
  }

  if (!fs.existsSync(packPath)) {
    cache.set(id, { at: now, data: null, path: packPath, exists: false, mtimeMs: null });
    return { available: false, pack: null, path: packPath, reason: 'pack file missing — run ./ont compile ' + id };
  }

  try {
    const st = fs.statSync(packPath);
    const raw = fs.readFileSync(packPath, 'utf8');
    const pack = JSON.parse(raw);
    cache.set(id, { at: now, data: pack, path: packPath, exists: true, mtimeMs: st.mtimeMs });
    return { available: true, pack, path: packPath, mtimeMs: st.mtimeMs };
  } catch (e) {
    cache.set(id, { at: now, data: null, path: packPath, exists: false, mtimeMs: null });
    return { available: false, pack: null, path: packPath, reason: `pack unreadable: ${e.message}` };
  }
}

/** Drop cached pack(s). Next loadPack re-reads disk. */
export function clearPackCache(ticker) {
  if (ticker == null || ticker === '' || ticker === '*') {
    cache.clear();
    return { cleared: 'all' };
  }
  const id = String(ticker).toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  cache.delete(id);
  return { cleared: id };
}

export function storeDir() {
  return STORE_DIR;
}
