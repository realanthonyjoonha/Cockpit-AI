// packStale.js — vault inputs newer than compiled store? Factory, any ticker.
// Does not spawn ./ont. Decision-support only.
import fs from 'fs';
import path from 'path';

function mtimeMs(p) {
  try {
    if (!p || !fs.existsSync(p)) return 0;
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
}

/** Expand a vault-relative glob. `*` matches one path segment only. */
export function expandGlob(root, pattern) {
  const norm = String(pattern || '').replace(/\\/g, '/').replace(/^\.\//, '');
  if (!root || !norm) return [];
  const parts = norm.split('/').filter(Boolean);
  let curs = [root];
  for (const part of parts) {
    const next = [];
    const re = part.includes('*')
      ? new RegExp(`^${part.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*')}$`, 'i')
      : null;
    for (const dir of curs) {
      if (!fs.existsSync(dir)) continue;
      const st = fs.statSync(dir);
      if (re) {
        if (!st.isDirectory()) continue;
        for (const name of fs.readdirSync(dir)) {
          if (re.test(name)) next.push(path.join(dir, name));
        }
      } else {
        next.push(path.join(dir, part));
      }
    }
    curs = next;
  }
  return curs.filter((p) => {
    try {
      return fs.existsSync(p) && fs.statSync(p).isFile();
    } catch {
      return false;
    }
  });
}

function resolveUnder(root, rel) {
  if (!rel) return null;
  const p = PathLike(rel);
  if (path.isAbsolute(p)) return p;
  return path.join(root, p);
}

function PathLike(rel) {
  return String(rel).replace(/\\/g, '/');
}

/**
 * @param {{ ticker: string, vaultDir: string, ontRoot: string, storeDir?: string }} opts
 * @returns {{ stale: boolean, reason: string, store_mtime_ms: number, newest_input_ms: number, newest_input?: string }}
 */
export function inspectPackStale({ ticker, vaultDir, ontRoot, storeDir }) {
  const T = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const store = storeDir || path.join(ontRoot, 'store', 'by_ticker');
  const storePath = path.join(store, `${T}.json`);
  const storeM = mtimeMs(storePath);

  const packPath = path.join(ontRoot, 'packs', `${T}.json`);
  let cfg = {};
  try {
    if (fs.existsSync(packPath)) cfg = JSON.parse(fs.readFileSync(packPath, 'utf8'));
  } catch {
    cfg = {};
  }

  const slug = String(cfg.entity_slug || cfg.focus_id || T.toLowerCase()).toLowerCase();
  const inputs = [];

  const add = (p, label) => {
    if (!p) return;
    const m = mtimeMs(p);
    if (m > 0) inputs.push({ path: p, label, m });
  };

  add(packPath, 'pack_config');
  const house = cfg.house_view_path || `house-view-${slug}.md`;
  add(resolveUnder(vaultDir, house), 'house');
  add(path.join(vaultDir, 'wiki', 'entities', `${slug}.md`), 'entity');
  if (cfg.risks_source) add(resolveUnder(vaultDir, cfg.risks_source), 'risks_source');

  for (const g of cfg.source_globs || []) {
    for (const f of expandGlob(vaultDir, g)) add(f, 'glob');
  }
  for (const root of cfg.source_roots || []) {
    const abs = resolveUnder(vaultDir, root);
    if (!abs || !fs.existsSync(abs) || !fs.statSync(abs).isDirectory()) continue;
    for (const name of fs.readdirSync(abs)) {
      if (!name.toLowerCase().endsWith('.md')) continue;
      add(path.join(abs, name), 'source_root');
    }
  }

  if (!storeM) {
    return {
      stale: true,
      reason: 'no compiled pack',
      store_mtime_ms: 0,
      newest_input_ms: inputs.reduce((a, x) => Math.max(a, x.m), 0),
      newest_input: (inputs.sort((a, b) => b.m - a.m)[0] || {}).path || null,
    };
  }

  let newest = { m: 0, path: null };
  for (const x of inputs) {
    if (x.m > newest.m) newest = { m: x.m, path: x.path };
  }
  const stale = newest.m > storeM + 2;
  return {
    stale,
    reason: stale ? 'vault newer than pack' : 'pack current',
    store_mtime_ms: storeM,
    newest_input_ms: newest.m,
    newest_input: newest.path,
  };
}
