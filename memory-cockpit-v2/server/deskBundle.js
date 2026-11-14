// deskBundle.js — which files one registered desk owns.
// Derived from the registry row + pack source_globs. Not a second copy of the book.
// A path another desk also owns, or a path that leaves the vault or the ontology tree, refuses the bundle.
// Decision-support only. This module does not delete.
import fs from 'fs';
import path from 'path';

const SLUG_RE = /^[a-z0-9-]+$/;
const TICKER_RE = /^[A-Z0-9.-]+$/;

/**
 * @param {string} root absolute directory that must contain abs
 * @param {string} abs absolute candidate
 * @returns {{ abs: string, rel: string }}
 */
export function locateInside(root, abs) {
  const rootReal = fs.realpathSync(root);
  const resolved = path.resolve(abs);
  let real = resolved;
  if (fs.existsSync(resolved)) {
    real = fs.realpathSync(resolved);
  } else {
    let parent = path.dirname(resolved);
    while (!fs.existsSync(parent)) {
      const next = path.dirname(parent);
      if (next === parent) break;
      parent = next;
    }
    const parentReal = fs.realpathSync(parent);
    real = path.resolve(parentReal, path.relative(parent, resolved));
  }
  const rel = path.relative(rootReal, real);
  if (rel === '' || rel.startsWith('..') || path.isAbsolute(rel)) {
    const err = new Error(`path leaves ${rootReal}: ${abs}`);
    err.code = 'desk_bundle_escape';
    throw err;
  }
  return { abs: real, rel: rel.split(path.sep).join('/') };
}

function matchSeg(globSeg, name) {
  const parts = globSeg.split('*').map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  return new RegExp(`^${parts.join('[^/]*')}$`).test(name);
}

/** @param {string} rel posix relative @param {string} glob posix glob */
export function matchGlob(rel, glob) {
  const g = String(glob || '').split('/').filter((s) => s !== '');
  const r = String(rel || '').split('/').filter((s) => s !== '');
  function rec(gi, ri) {
    if (gi === g.length) return ri === r.length;
    if (g[gi] === '**') {
      for (let k = ri; k <= r.length; k += 1) {
        if (rec(gi + 1, k)) return true;
      }
      return false;
    }
    if (ri >= r.length) return false;
    if (!matchSeg(g[gi], r[ri])) return false;
    return rec(gi + 1, ri + 1);
  }
  return rec(0, 0);
}

function readPack(ontRoot, ticker) {
  const file = path.join(ontRoot, 'packs', `${ticker}.json`);
  if (!fs.existsSync(file)) return { file, pack: null };
  try {
    return { file, pack: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { file, pack: null, error: e.message || String(e) };
  }
}

function expandGlob(vaultRoot, glob) {
  if (glob.includes('..') || path.isAbsolute(glob)) {
    throw new Error(`source glob is not a vault-relative path: ${glob}`);
  }
  const hits = [];
  const walk = (dirRel) => {
    const abs = path.join(vaultRoot, dirRel);
    if (!fs.existsSync(abs)) return;
    for (const name of fs.readdirSync(abs)) {
      const rel = dirRel ? `${dirRel}/${name}` : name;
      const child = path.join(abs, name);
      let st;
      try { st = fs.lstatSync(child); } catch { continue; }
      if (st.isDirectory()) walk(rel);
      else if (st.isFile() && matchGlob(rel, glob)) hits.push(rel);
    }
  };
  const firstStar = glob.indexOf('*');
  const prefix = firstStar === -1 ? glob : glob.slice(0, firstStar);
  const baseDir = path.posix.dirname(prefix);
  const start = baseDir === '.' ? '' : baseDir;
  if (firstStar === -1) {
    const abs = path.join(vaultRoot, glob);
    if (fs.existsSync(abs) && fs.statSync(abs).isFile()) hits.push(glob);
    return hits;
  }
  walk(start);
  return hits;
}

function sourceNameOk(slug, basename) {
  return basename === `${slug}.md` || basename.startsWith(`${slug}-`);
}

function pushItem(items, item) {
  const parent = items.find((x) => x.kind === 'dir' && (item.rel === x.rel || item.rel.startsWith(`${x.rel}/`)));
  if (parent) return;
  for (let i = items.length - 1; i >= 0; i -= 1) {
    const x = items[i];
    if (item.kind === 'dir' && (x.rel === item.rel || x.rel.startsWith(`${item.rel}/`))) items.splice(i, 1);
  }
  if (!items.some((x) => x.rel === item.rel && x.root === item.root)) items.push(item);
}

function addExisting(items, errors, spec) {
  const { rootDir, rel, lane, root, kind } = spec;
  let located;
  try {
    located = locateInside(rootDir, path.join(rootDir, rel));
  } catch (e) {
    errors.push(e.message || String(e));
    return;
  }
  if (located.rel !== rel) {
    errors.push(`resolved path does not match ${rel}`);
    return;
  }
  const exists = fs.existsSync(located.abs);
  if (exists) {
    const st = fs.lstatSync(located.abs);
    if (st.isSymbolicLink()) {
      errors.push(`${rel} is a symlink`);
      return;
    }
    if (kind === 'dir' && !st.isDirectory()) {
      errors.push(`${rel} is not a directory`);
      return;
    }
    if (kind === 'file' && !st.isFile()) {
      errors.push(`${rel} is not a file`);
      return;
    }
  }
  pushItem(items, { lane, root, kind, rel, abs: located.abs, exists });
}

/**
 * @param {{ desk: object, vaultRoot: string, ontRoot: string, storeDir: string }} args
 */
export function buildDeskBundle({ desk, vaultRoot, ontRoot, storeDir }) {
  const errors = [];
  const items = [];
  const slug = String(desk?.slug || '');
  const ticker = String(desk?.ticker || '').toUpperCase();
  if (!SLUG_RE.test(slug)) errors.push(`slug is not a desk id: ${slug || '(empty)'}`);
  if (!TICKER_RE.test(ticker)) errors.push(`ticker is not a desk id: ${ticker || '(empty)'}`);
  if (errors.length) {
    return { ok: false, slug, ticker, errors, items };
  }

  const houseRel = `house-view-${slug}.md`;
  if (desk.house_file && desk.house_file !== houseRel) {
    errors.push(`house_file must be ${houseRel}`);
  } else {
    addExisting(items, errors, { rootDir: vaultRoot, rel: houseRel, lane: 'house', root: 'vault', kind: 'file' });
  }

  const rawRel = `raw/${slug}-research`;
  const profileRaw = desk.profile && desk.profile.rawDir;
  if (profileRaw && profileRaw !== rawRel) {
    errors.push(`rawDir must be ${rawRel}`);
  } else {
    addExisting(items, errors, { rootDir: vaultRoot, rel: rawRel, lane: 'book', root: 'vault', kind: 'dir' });
  }

  const entityRel = `wiki/entities/${slug}.md`;
  const entitySlug = (desk.profile && desk.profile.entitySlug) || slug;
  if (entitySlug !== slug) errors.push(`entitySlug must be ${slug}`);
  else addExisting(items, errors, { rootDir: vaultRoot, rel: entityRel, lane: 'sources', root: 'vault', kind: 'file' });

  const { file: packFile, pack, error: packErr } = readPack(ontRoot, ticker);
  if (packErr) errors.push(`pack unreadable: ${packErr}`);
  let packRel = 'ontology/packs/' + ticker + '.json';
  try {
    const loc = locateInside(ontRoot, packFile);
    if (loc.rel !== `packs/${ticker}.json`) errors.push('pack path leaves ontology/packs');
    else {
      pushItem(items, {
        lane: 'pack', root: 'kernel', kind: 'file', rel: packRel, abs: loc.abs, exists: fs.existsSync(loc.abs),
      });
    }
  } catch (e) {
    errors.push(e.message || String(e));
  }

  const storeFile = path.join(storeDir, `${ticker}.json`);
  try {
    const loc = locateInside(storeDir, storeFile);
    if (loc.rel !== `${ticker}.json`) errors.push('store path leaves the pack store');
    else {
      pushItem(items, {
        lane: 'store',
        root: 'kernel',
        kind: 'file',
        rel: `ontology/store/by_ticker/${ticker}.json`,
        abs: loc.abs,
        exists: fs.existsSync(loc.abs),
      });
    }
  } catch (e) {
    errors.push(e.message || String(e));
  }

  const globs = pack && Array.isArray(pack.source_globs) ? pack.source_globs : [];
  for (const glob of globs) {
    let hits = [];
    try {
      hits = expandGlob(vaultRoot, String(glob));
    } catch (e) {
      errors.push(e.message || String(e));
      continue;
    }
    for (const rel of hits) {
      if (rel === rawRel || rel.startsWith(`${rawRel}/`)) continue;
      const base = path.posix.basename(rel);
      if (rel === entityRel) continue;
      if (rel.startsWith('wiki/sources/') && sourceNameOk(slug, base)) {
        addExisting(items, errors, { rootDir: vaultRoot, rel, lane: 'sources', root: 'vault', kind: 'file' });
        continue;
      }
      errors.push(`source glob claims a path this desk cannot own: ${rel}`);
    }
  }

  // Pack globs are often incomplete. A note named for this slug is still this desk's file.
  const sourcesDir = path.join(vaultRoot, 'wiki', 'sources');
  if (fs.existsSync(sourcesDir)) {
    for (const name of fs.readdirSync(sourcesDir)) {
      if (!sourceNameOk(slug, name)) continue;
      const abs = path.join(sourcesDir, name);
      let st;
      try { st = fs.lstatSync(abs); } catch { continue; }
      if (st.isSymbolicLink()) {
        errors.push(`wiki/sources/${name} is a symlink`);
        continue;
      }
      if (!st.isFile()) continue;
      addExisting(items, errors, {
        rootDir: vaultRoot, rel: `wiki/sources/${name}`, lane: 'sources', root: 'vault', kind: 'file',
      });
    }
  }

  const ops = [
    ['street', `cockpit/street/${ticker}.json`, 'file'],
    ['street', `cockpit/street/history/${ticker}`, 'dir'],
    ['model', `cockpit/model/${ticker}.json`, 'file'],
    ['model', `cockpit/model/history/${ticker}`, 'dir'],
    ['background', `cockpit/learn/${ticker}`, 'dir'],
    ['reports', `cockpit/research/${ticker}`, 'dir'],
    ['compile', `cockpit/compile/${ticker}`, 'dir'],
    ['briefs', `cockpit/briefs/daily/${slug}`, 'dir'],
    ['session', `cockpit/session/${slug}.json`, 'file'],
  ];
  for (const [lane, rel, kind] of ops) {
    addExisting(items, errors, { rootDir: vaultRoot, rel, lane, root: 'vault', kind });
  }

  const proposalsDir = path.join(vaultRoot, 'cockpit', 'proposals');
  if (fs.existsSync(proposalsDir)) {
    for (const name of fs.readdirSync(proposalsDir)) {
      if (!proposalOwned(slug, name)) continue;
      addExisting(items, errors, {
        rootDir: vaultRoot, rel: `cockpit/proposals/${name}`, lane: 'proposals', root: 'vault', kind: 'file',
      });
    }
  }
  const historyDir = path.join(vaultRoot, 'cockpit', 'history');
  if (fs.existsSync(historyDir)) {
    const res = [
      new RegExp(`^house-${slug}\\.`),
      new RegExp(`^register-${slug}\\.`),
      new RegExp(`^drivers-${slug}\\.`),
    ];
    for (const name of fs.readdirSync(historyDir)) {
      if (!res.some((re) => re.test(name))) continue;
      const abs = path.join(historyDir, name);
      const kind = fs.statSync(abs).isDirectory() ? 'dir' : 'file';
      addExisting(items, errors, {
        rootDir: vaultRoot, rel: `cockpit/history/${name}`, lane: 'history', root: 'vault', kind,
      });
    }
  }

  return { ok: errors.length === 0, slug, ticker, errors, items };
}

export function proposalOwned(slug, name) {
  return name === `house-${slug}.json`
    || name === `risks-${slug}.json`
    || name === `drivers-${slug}.json`
    || name === `${slug}-pending.json`
    || name === `${slug}-house-propose.md`
    || name.startsWith(`${slug}-house-propose-`);
}

const SHARED_FILE = new Set([
  'cockpit/go-commit-log.jsonl',
  'cockpit/agent-accept-log.jsonl',
  'cockpit/headlines.csv',
  'cockpit/sync.js',
  'cockpit/street/street-models.json',
  'cockpit/.sync-state.json',
  'cockpit/.sync.lock',
]);

const SHARED_DIR = [
  'cockpit/series/',
  'cockpit/desks/',
  'cockpit/risks/',
  'cockpit/forecast/',
  'cockpit/margins/',
  'cockpit/leverage/',
  'cockpit/compile/_sec/',
  'cockpit/lib/',
  'cockpit/delete-receipts/',
  'cockpit/trash/',
  'wiki/concepts/',
];

function companyNamed(rel, slug, ticker) {
  const norm = String(rel || '').replace(/\\/g, '/');
  if (!norm || SHARED_FILE.has(norm)) return false;
  if (SHARED_DIR.some((prefix) => norm.startsWith(prefix))) return false;
  const base = path.posix.basename(norm);
  if (norm === `house-view-${slug}.md`) return true;
  if (norm === `raw/${slug}-research` || norm.startsWith(`raw/${slug}-research/`)) return true;
  if (norm === `wiki/entities/${slug}.md`) return true;
  if (norm.startsWith('wiki/sources/') && (base === `${slug}.md` || base.startsWith(`${slug}-`))) return true;
  if (norm === `cockpit/street/${ticker}.json` || norm === `cockpit/street/history/${ticker}` || norm.startsWith(`cockpit/street/history/${ticker}/`)) return true;
  if (norm === `cockpit/model/${ticker}.json` || norm === `cockpit/model/history/${ticker}` || norm.startsWith(`cockpit/model/history/${ticker}/`)) return true;
  if (norm === `cockpit/learn/${ticker}` || norm.startsWith(`cockpit/learn/${ticker}/`)) return true;
  if (norm === `cockpit/research/${ticker}` || norm.startsWith(`cockpit/research/${ticker}/`)) return true;
  if (norm === `cockpit/compile/${ticker}` || norm.startsWith(`cockpit/compile/${ticker}/`)) return true;
  if (norm === `cockpit/briefs/daily/${slug}` || norm.startsWith(`cockpit/briefs/daily/${slug}/`)) return true;
  if (norm === `cockpit/session/${slug}.json`) return true;
  if (norm.startsWith('cockpit/proposals/') && proposalOwned(slug, base)) return true;
  if (norm.startsWith('cockpit/history/') && new RegExp(`^(house|register|drivers)-${slug}\\.`).test(base)) return true;
  if (norm === `ontology/packs/${ticker}.json` || norm === `ontology/store/by_ticker/${ticker}.json`) return true;
  if (base === `${slug}.md` || base.startsWith(`${slug}-`) || base === `${ticker}.json` || base === `${ticker}.md` || base.startsWith(`${ticker}-`)) return true;
  return norm.split('/').some((part) => part === slug || part === ticker);
}

function walkTree(root, visit) {
  const start = path.resolve(root);
  if (!fs.existsSync(start)) return;
  const stack = [''];
  while (stack.length) {
    const rel = stack.pop();
    const abs = rel ? path.join(start, rel) : start;
    let st;
    try { st = fs.lstatSync(abs); } catch { continue; }
    if (st.isSymbolicLink()) {
      if (rel) visit(rel);
      continue;
    }
    if (!st.isDirectory()) {
      if (rel) visit(rel);
      continue;
    }
    if (rel) visit(rel);
    let names = [];
    try { names = fs.readdirSync(abs); } catch { continue; }
    for (const name of names) {
      if (name === '.git' || name === 'node_modules') continue;
      stack.push(rel ? `${rel}/${name}` : name);
    }
  }
}

/**
 * Company-named paths the bundle does not own. A removal must refuse these.
 * @param {{ slug: string, ticker: string, items: Array<{ rel: string }>, vaultRoot: string, ontRoot: string, storeDir: string }} args
 */
export function unownedCompanyFiles({ slug, ticker, items, vaultRoot, ontRoot, storeDir }) {
  const owned = new Set((items || []).map((item) => item.rel));
  const covered = (rel) => owned.has(rel) || [...owned].some((have) => rel.startsWith(`${have}/`));
  const found = new Set();
  const consider = (rel) => {
    if (companyNamed(rel, slug, ticker) && !covered(rel)) found.add(rel);
  };
  walkTree(vaultRoot, consider);
  walkTree(ontRoot, (rel) => consider(rel.startsWith('ontology/') ? rel : `ontology/${rel}`));
  if (storeDir && path.resolve(storeDir) !== path.resolve(ontRoot)) {
    walkTree(storeDir, (rel) => consider(`ontology/store/by_ticker/${rel}`));
  }
  const tops = [];
  for (const rel of [...found].sort()) {
    if (tops.some((top) => rel.startsWith(`${top}/`))) continue;
    tops.push(rel);
  }
  return tops;
}

/**
 * Mark bundles that share a path or sit inside each other's directory.
 * @param {Array<{ ok: boolean, slug: string, errors: string[], items: Array<{ abs: string, rel: string, kind: string }> }>} bundles
 */
export function markOverlaps(bundles) {
  const owned = [];
  for (const b of bundles) {
    if (!b.ok) continue;
    for (const item of b.items) {
      if (!item.exists) continue;
      owned.push({ slug: b.slug, abs: item.abs, rel: item.rel });
    }
  }
  for (let i = 0; i < owned.length; i += 1) {
    for (let j = i + 1; j < owned.length; j += 1) {
      const a = owned[i];
      const b = owned[j];
      if (a.slug === b.slug) continue;
      const nested = a.abs === b.abs
        || a.abs.startsWith(b.abs + path.sep)
        || b.abs.startsWith(a.abs + path.sep);
      if (!nested) continue;
      for (const slug of [a.slug, b.slug]) {
        const bundle = bundles.find((x) => x.slug === slug);
        if (!bundle) continue;
        bundle.ok = false;
        const msg = `shared with ${slug === a.slug ? b.slug : a.slug}: ${a.abs === b.abs ? a.rel : `${a.rel} / ${b.rel}`}`;
        if (!bundle.errors.includes(msg)) bundle.errors.push(msg);
      }
    }
  }
  return bundles;
}

export function buildAllBundles({ desks, vaultRoot, ontRoot, storeDir }) {
  const list = Array.isArray(desks) ? desks : [];
  const bundles = list.map((desk) => buildDeskBundle({ desk, vaultRoot, ontRoot, storeDir }));
  return markOverlaps(bundles);
}

export function countLanes(items) {
  const counts = {};
  for (const item of items) {
    if (!item.exists) continue;
    counts[item.lane] = (counts[item.lane] || 0) + 1;
  }
  return counts;
}
