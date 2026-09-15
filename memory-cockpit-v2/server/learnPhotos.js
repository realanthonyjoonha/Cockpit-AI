// learnPhotos.js — schema-pinned raster photos on product-map.json (learn-map engine).
// Two lanes: primary (IR / newsroom / SEC) and tape (Google Images via engine-built queries).
// Server downloads bytes. No SERP scrape, no Google API key, no GenerateImage fakes.
// Decision-support only. Photos never mint pack / house / mix $. Not COMPILE BOOK.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { adviceHits, sanitizeTicker, topicId } from './learnSchema.js';
import { MONEY_RE, SKU_SPLIT_RE } from './learnDiagrams.js';
import { resolveVaultDir } from './monorepoPaths.js';
import { getLiveThinDeskProfiles } from './thinDeskProfiles.js';

export const PHOTO_KINDS = Object.freeze(['product', 'process', 'system']);
export const PHOTO_KIND_SET = new Set(PHOTO_KINDS);
export const PHOTO_LANES = Object.freeze(['primary', 'tape']);
export const PHOTO_LANE_SET = new Set(PHOTO_LANES);
export const PHOTOS_MAX_TOTAL = 8;
export const PHOTOS_MAX_TAPE = 4;
export const MAX_PHOTO_BYTES = 3 * 1024 * 1024;
export const PHOTO_QUERY_MAX = 10;
export const PHOTO_QUERY_CHARS = 160;

export const SEC_HOSTS = Object.freeze(['www.sec.gov']);

export const TAPE_HOST_BLOCKLIST = Object.freeze([
  'gstatic.com',
  'googleusercontent.com',
  'google.com',
  'unsplash.com',
  'pexels.com',
  'pixabay.com',
  'shutterstock.com',
  'gettyimages.com',
  'istockphoto.com',
  'alamy.com',
  'dreamstime.com',
  'imgur.com',
  'redd.it',
  'imgflip.com',
  'knowyourmeme.com',
  '9gag.com',
]);

const CHART_RE = /\b(chart|graph|rating|price.target|stock.performance)\b/i;
const PIXEL_PATH_RE = /logo|icon|favicon|sprite|1x1/i;
const BROWSER_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36';
const FETCH_MS = 15_000;
const QUERY_NODE_KINDS = new Set(['silicon', 'systems', 'networking', 'process', 'mechanism']);
const QUERY_DIAGRAM_TYPES = new Set(['stack', 'flow']);

const PNG_MAGIC = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
const JPEG_MAGIC = Buffer.from([0xff, 0xd8, 0xff]);

/** @type {Map<string, { mtime: number, hosts: string[], pages: object[] }>} */
const allowCache = new Map();

function str(v) {
  return v == null ? '' : String(v).trim();
}

function vaultRoot() {
  return resolveVaultDir();
}

export function clearPhotoHostAllowlistCache() {
  allowCache.clear();
}

export function photosDir(ticker) {
  const id = sanitizeTicker(ticker);
  if (!id) return null;
  return path.join(vaultRoot(), 'cockpit', 'learn', id, 'photos');
}

export function photoRelSrc(ticker, id, ext) {
  const t = sanitizeTicker(ticker);
  const pid = topicId(id);
  const e = String(ext || '').toLowerCase().replace(/^\./, '');
  if (!t || !pid || !/^(png|jpg|webp)$/.test(e)) return null;
  return `cockpit/learn/${t}/photos/${pid}.${e}`;
}

export function photoAbsPath(ticker, file) {
  const dir = photosDir(ticker);
  const name = path.basename(String(file || ''));
  if (!dir || !name || name !== String(file || '').replace(/^.*[/\\]/, '')) return null;
  if (name.includes('..') || name.includes('/') || name.includes('\\')) return null;
  if (!/^[a-z0-9._-]+\.(png|jpg|webp)$/i.test(name)) return null;
  const abs = path.resolve(dir, name);
  const root = path.resolve(dir);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export function sniffImageBytes(buf) {
  const b = Buffer.isBuffer(buf) ? buf : Buffer.from(buf || []);
  if (b.length >= 4 && b.subarray(0, 4).equals(PNG_MAGIC)) return { ok: true, ext: 'png' };
  if (b.length >= 3 && b.subarray(0, 3).equals(JPEG_MAGIC)) return { ok: true, ext: 'jpg' };
  if (b.length >= 12 && b.subarray(0, 4).toString('ascii') === 'RIFF' && b.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { ok: true, ext: 'webp' };
  }
  if (b.length < 12) return { ok: false, error: 'image too small to sniff' };
  return { ok: false, error: 'bytes are not PNG, JPEG, or WebP (SVG/HTML/GIF rejected)' };
}

export function parseHttpsUrl(raw) {
  const u = str(raw);
  if (!u || u.startsWith('data:')) return null;
  try {
    const parsed = new URL(u);
    if (parsed.protocol !== 'https:') return null;
    return parsed;
  } catch {
    return null;
  }
}

function hostOf(raw) {
  const parsed = parseHttpsUrl(raw);
  return parsed ? parsed.hostname.toLowerCase() : null;
}

export function hostMatchesSuffix(host, domain) {
  const h = String(host || '').toLowerCase();
  const d = String(domain || '').toLowerCase();
  if (!h || !d) return false;
  return h === d || h.endsWith(`.${d}`);
}

export function isGoogleHost(host) {
  const h = String(host || '').toLowerCase();
  if (!h) return false;
  return h === 'google.com' || h.endsWith('.google.com') || h.startsWith('google.');
}

export function tapeHostBlocked(url) {
  const parsed = parseHttpsUrl(url);
  if (!parsed) return { blocked: true, reason: 'url must be https' };
  const host = parsed.hostname.toLowerCase();
  if (/tbn/i.test(parsed.pathname) || /tbn/i.test(host)) {
    return { blocked: true, reason: 'expiring Google thumbnail / tbn path' };
  }
  for (const d of TAPE_HOST_BLOCKLIST) {
    if (hostMatchesSuffix(host, d)) return { blocked: true, reason: `blocklisted host ${host}` };
  }
  return { blocked: false, host };
}

function sourcePrimaryReForTicker(ticker) {
  const id = sanitizeTicker(ticker);
  if (!id) return /.^/;
  try {
    const { bySlug } = getLiveThinDeskProfiles();
    for (const b of Object.values(bySlug || {})) {
      if (b?.model?.ticker === id) return b.model.sourcePrimaryRe || new RegExp(id, 'i');
    }
  } catch { /* empty registry / tests */ }
  return new RegExp(id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
}

function parseSourceFrontmatter(md) {
  const m = String(md || '').match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!m) return null;
  const fm = {};
  for (const line of m[1].split(/\r?\n/)) {
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    let val = kv[2].trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    fm[kv[1]] = val;
  }
  return fm;
}

function sourcesDirMtime() {
  const dir = path.join(vaultRoot(), 'wiki', 'sources');
  try {
    return fs.statSync(dir).mtimeMs;
  } catch {
    return 0;
  }
}

/**
 * Deterministic per-desk host allowlist from graded wiki/sources frontmatter + SEC.
 * No wildcards, no env override, no per-ticker table.
 */
export function photoHostAllowlist(ticker) {
  const id = sanitizeTicker(ticker);
  if (!id) return { hosts: [...SEC_HOSTS], pages: [] };
  const mtime = sourcesDirMtime();
  const cacheKey = `${vaultRoot()}::${id}`;
  const hit = allowCache.get(cacheKey);
  if (hit && hit.mtime === mtime) return { hosts: hit.hosts.slice(), pages: hit.pages.slice() };

  const re = sourcePrimaryReForTicker(id);
  const dir = path.join(vaultRoot(), 'wiki', 'sources');
  const hosts = new Set(SEC_HOSTS);
  const pages = [];
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith('.md')).sort();
  } catch {
    names = [];
  }
  for (const name of names) {
    const abs = path.join(dir, name);
    let md = '';
    try {
      md = fs.readFileSync(abs, 'utf8');
    } catch {
      continue;
    }
    const fm = parseSourceFrontmatter(md);
    if (!fm) continue;
    const slug = str(fm.slug || name.replace(/\.md$/i, ''));
    const blob = `${slug} ${name} ${str(fm.title)}`;
    if (!re.test(blob)) continue;
    const grade = str(fm.grade).toUpperCase();
    if (grade !== 'A' && grade !== 'B') continue;
    const parsed = parseHttpsUrl(fm.url);
    if (!parsed) continue;
    const host = parsed.hostname.toLowerCase();
    hosts.add(host);
    pages.push({
      slug,
      url: parsed.href,
      host,
      grade,
      title: str(fm.title).slice(0, 200),
      publisher: str(fm.publisher).slice(0, 120),
    });
  }
  const hostsList = [...hosts].sort();
  allowCache.set(cacheKey, { mtime, hosts: hostsList, pages });
  return { hosts: hostsList, pages };
}

export function hostOnAllowlist(host, allowHosts) {
  const h = String(host || '').toLowerCase();
  return (allowHosts || []).some((a) => a.toLowerCase() === h);
}

function normalizeQuery(s) {
  return str(s)
    .replace(/["'`]/g, '')
    .replace(/[^\w\s.+-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, PHOTO_QUERY_CHARS);
}

/**
 * Engine-owned Google Images query strings. Grok runs these verbatim.
 * @param {object} map
 * @param {string} displayName
 */
export function learnPhotoQueries(map, displayName) {
  const name = str(displayName) || str(map?.ticker) || 'company';
  const out = [];
  const seen = new Set();
  const push = (q) => {
    const n = normalizeQuery(q);
    if (!n || seen.has(n.toLowerCase())) return;
    seen.add(n.toLowerCase());
    out.push(n);
  };
  const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
  for (const n of nodes) {
    if (out.length >= PHOTO_QUERY_MAX) break;
    if (!n || n.status !== 'ready' || !QUERY_NODE_KINDS.has(n.kind)) continue;
    push(`"${name}" ${n.title || n.label || ''}`);
  }
  const diagrams = Array.isArray(map?.diagrams) ? map.diagrams : [];
  for (const d of diagrams) {
    if (out.length >= PHOTO_QUERY_MAX) break;
    if (!d || !QUERY_DIAGRAM_TYPES.has(d.type)) continue;
    const blocks = Array.isArray(d.blocks) ? d.blocks : [];
    for (const b of blocks) {
      if (out.length >= PHOTO_QUERY_MAX) break;
      if (!b || !b.label) continue;
      push(`"${name}" ${b.label} photo`);
    }
  }
  return out.slice(0, PHOTO_QUERY_MAX);
}

function laneOf(row) {
  const lane = str(row?.lane).toLowerCase();
  if (!lane) return 'primary';
  return lane;
}

function rejectDraft(row, { ticker, nodeIds, allowHosts }) {
  if (!row || typeof row !== 'object') return { ok: false, error: 'photo not an object' };
  const id = topicId(row.id);
  if (!id) return { ok: false, error: 'photo id missing' };
  const lane = laneOf(row);
  if (!PHOTO_LANE_SET.has(lane)) return { ok: false, error: `unknown photo lane "${row.lane}"` };
  const kind = str(row.kind).toLowerCase();
  if (!PHOTO_KIND_SET.has(kind)) return { ok: false, error: `unknown photo kind "${row.kind}"` };
  const asOf = str(row.as_of);
  if (!asOf || asOf.length > 32) return { ok: false, error: `photo ${id} as_of required (≤32 chars)` };
  const caption = str(row.caption);
  if (!caption) return { ok: false, error: `photo ${id} caption required` };
  if (caption.length > 200) return { ok: false, error: `photo ${id} caption exceeds 200 chars` };
  if (adviceHits(caption)) return { ok: false, error: `photo ${id} advice language rejected` };
  if (/\$/.test(caption) || MONEY_RE.test(caption) || SKU_SPLIT_RE.test(caption)) {
    return { ok: false, error: `photo ${id} never carry $ / % / SKU split` };
  }
  const source = row.source && typeof row.source === 'object' ? row.source : null;
  const pageUrl = str(source?.page_url || row.page_url);
  const imageUrl = str(source?.image_url || row.image_url);
  const label = str(source?.label || row.source_label);
  if (!source && !label) return { ok: false, error: `photo ${id} source required` };
  if (!label) return { ok: false, error: `photo ${id} source.label required` };
  if (!parseHttpsUrl(pageUrl) || !parseHttpsUrl(imageUrl)) {
    return { ok: false, error: `photo ${id} page_url and image_url must be https` };
  }
  if (CHART_RE.test(caption) || CHART_RE.test(imageUrl)) {
    return { ok: false, error: `photo ${id} chart/rating heuristic rejected` };
  }
  const pageHost = hostOf(pageUrl);
  const imageHost = hostOf(imageUrl);
  const nodeId = topicId(row.node_id || source?.node_id || '');
  const query = str(source?.query || row.query);
  const retrievedAt = str(source?.retrieved_at);

  if (lane === 'primary') {
    if (query) return { ok: false, error: `photo ${id} primary must not carry source.query` };
    const hosts = allowHosts || photoHostAllowlist(ticker).hosts;
    if (!hostOnAllowlist(pageHost, hosts) || !hostOnAllowlist(imageHost, hosts)) {
      return { ok: false, error: `photo ${id} primary host not on desk allowlist` };
    }
    const grade = str(source?.grade || row.grade || 'A').toUpperCase();
    if (grade !== 'A' && grade !== 'B') {
      return { ok: false, error: `photo ${id} primary grade must be A or B` };
    }
    if (nodeId && nodeIds && !nodeIds.has(nodeId)) {
      return { ok: false, error: `photo ${id} node_id "${nodeId}" unknown` };
    }
    return {
      ok: true,
      draft: {
        id, lane, kind, as_of: asOf.slice(0, 32), caption,
        source: {
          label: label.slice(0, 200),
          page_url: pageUrl,
          image_url: imageUrl,
          grade,
          retrieved_at: retrievedAt || undefined,
        },
        node_id: nodeId || undefined,
      },
    };
  }

  if (!query) return { ok: false, error: `photo ${id} tape requires source.query` };
  if (query.length > PHOTO_QUERY_CHARS) return { ok: false, error: `photo ${id} query exceeds ${PHOTO_QUERY_CHARS} chars` };
  if (!nodeId) return { ok: false, error: `photo ${id} tape requires node_id` };
  if (nodeIds && !nodeIds.has(nodeId)) {
    return { ok: false, error: `photo ${id} node_id "${nodeId}" unknown` };
  }
  if (isGoogleHost(pageHost)) {
    return { ok: false, error: `photo ${id} tape page_url cannot be a Google SERP` };
  }
  const pageBlock = tapeHostBlocked(pageUrl);
  const imageBlock = tapeHostBlocked(imageUrl);
  if (pageBlock.blocked || imageBlock.blocked) {
    return { ok: false, error: `photo ${id} tape host blocked (${pageBlock.reason || imageBlock.reason})` };
  }
  const grade = str(source?.grade || 'tape').toLowerCase();
  if (grade !== 'tape') return { ok: false, error: `photo ${id} tape grade must be "tape"` };
  return {
    ok: true,
    draft: {
      id, lane, kind, as_of: asOf.slice(0, 32), caption,
      source: {
        label: label.slice(0, 200),
        page_url: pageUrl,
        image_url: imageUrl,
        grade: 'tape',
        query: query.slice(0, PHOTO_QUERY_CHARS),
        retrieved_at: retrievedAt || undefined,
      },
      node_id: nodeId,
    },
  };
}

/**
 * @param {unknown} rawList
 * @param {{ ticker?: string, nodeIds?: Set<string> }} [opts]
 */
export function validateLearnPhotos(rawList, opts = {}) {
  if (rawList == null) return { ok: true, photos: [] };
  if (!Array.isArray(rawList)) return { ok: false, error: 'photos must be an array' };
  const ticker = sanitizeTicker(opts.ticker);
  if (rawList.length && !ticker) return { ok: false, error: 'photos require a ticker' };
  if (rawList.length > PHOTOS_MAX_TOTAL) {
    return { ok: false, error: `photos exceed cap ${PHOTOS_MAX_TOTAL}` };
  }
  const nodeIds = opts.nodeIds instanceof Set
    ? opts.nodeIds
    : new Set(Array.isArray(opts.nodeIds) ? opts.nodeIds : []);
  const allowHosts = photoHostAllowlist(ticker).hosts;
  const out = [];
  const seen = new Set();
  let tapeN = 0;
  for (const row of rawList) {
    const g = rejectDraft(row, { ticker, nodeIds, allowHosts });
    if (!g.ok) return g;
    if (seen.has(g.draft.id)) return { ok: false, error: `duplicate photo id ${g.draft.id}` };
    seen.add(g.draft.id);
    const ext = str(row.src).split('.').pop()?.toLowerCase();
    const expected = photoRelSrc(ticker, g.draft.id, ext);
    if (!expected || str(row.src) !== expected) {
      return { ok: false, error: `photo ${g.draft.id} src must be cockpit/learn/{TICKER}/photos/{id}.png|jpg|webp` };
    }
    const sha = str(row.sha256).toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(sha)) {
      return { ok: false, error: `photo ${g.draft.id} sha256 required (64 hex)` };
    }
    if (!str(g.draft.source.retrieved_at)) {
      return { ok: false, error: `photo ${g.draft.id} source.retrieved_at required` };
    }
    if (g.draft.lane === 'tape') {
      tapeN += 1;
      if (tapeN > PHOTOS_MAX_TAPE) {
        return { ok: false, error: `tape photos exceed cap ${PHOTOS_MAX_TAPE}` };
      }
    }
    const photo = {
      id: g.draft.id,
      lane: g.draft.lane,
      kind: g.draft.kind,
      src: expected,
      sha256: sha,
      as_of: g.draft.as_of,
      caption: g.draft.caption,
      source: { ...g.draft.source },
    };
    if (g.draft.node_id) photo.node_id = g.draft.node_id;
    out.push(photo);
  }
  return { ok: true, photos: out };
}

export function decorateLearnPhotos(photos, { ticker, slug, nodes } = {}) {
  const list = Array.isArray(photos) ? photos.slice() : [];
  const primary = list.filter((p) => (p.lane || 'primary') === 'primary');
  const tape = list.filter((p) => p.lane === 'tape');
  const id = sanitizeTicker(ticker);
  const desk = str(slug || '').toLowerCase();
  const byId = new Map((Array.isArray(nodes) ? nodes : []).map((n) => [n.id, n]));
  return [...primary, ...tape].map((p) => {
    const file = path.basename(String(p.src || ''));
    const abs = photoAbsPath(id, file);
    const node = p.node_id ? byId.get(p.node_id) : null;
    return {
      ...p,
      present: !!(abs && fs.existsSync(abs)),
      href: desk && file ? `/api/${desk}/learn/photos/${file}` : null,
      node_title: node ? node.title : undefined,
    };
  });
}

function extractImageCandidates(html, pageUrl) {
  const out = [];
  const seen = new Set();
  const push = (raw, alt) => {
    if (!raw || raw.startsWith('data:')) return;
    let abs;
    try {
      abs = new URL(raw, pageUrl).href;
    } catch {
      return;
    }
    const parsed = parseHttpsUrl(abs);
    if (!parsed) return;
    const p = parsed.pathname.toLowerCase();
    if (p.endsWith('.svg') || p.endsWith('.gif')) return;
    if (PIXEL_PATH_RE.test(p) || PIXEL_PATH_RE.test(parsed.search)) return;
    if (seen.has(parsed.href)) return;
    seen.add(parsed.href);
    out.push({ image_url: parsed.href, alt: str(alt).slice(0, 160) });
  };
  const text = String(html || '');
  for (const m of text.matchAll(/<meta\b[^>]*>/gi)) {
    const tag = m[0];
    if (!/property\s*=\s*["']og:image["']/i.test(tag) && !/name\s*=\s*["']og:image["']/i.test(tag)) continue;
    const content = tag.match(/content\s*=\s*["']([^"']+)["']/i);
    if (content) push(content[1], 'og:image');
  }
  for (const m of text.matchAll(/<img\b[^>]*>/gi)) {
    const tag = m[0];
    const src = tag.match(/\bsrc\s*=\s*["']([^"']+)["']/i);
    const alt = tag.match(/\balt\s*=\s*["']([^"']*)["']/i);
    if (src) push(src[1], alt ? alt[1] : '');
  }
  return out;
}

async function fetchText(url, fetchImpl, timeoutMs = FETCH_MS) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(url, {
      headers: { 'User-Agent': BROWSER_UA, Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.8' },
      signal: ctl.signal,
      redirect: 'follow',
    });
    if (!res.ok) return { ok: false, error: `fetch ${res.status}` };
    const text = await res.text();
    return { ok: true, text };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  } finally {
    clearTimeout(t);
  }
}

/**
 * Read-only candidate discovery from pinned source pages (depth 0).
 */
export async function discoverPhotoCandidates(ticker, opts = {}) {
  const id = sanitizeTicker(ticker);
  const allow = photoHostAllowlist(id);
  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const rows = [];
  for (const page of allow.pages) {
    const got = await fetchText(page.url, fetchImpl);
    if (!got.ok) {
      rows.push({ page_url: page.url, error: got.error, images: [] });
      continue;
    }
    const images = extractImageCandidates(got.text, page.url)
      .filter((img) => hostOnAllowlist(hostOf(img.image_url), allow.hosts));
    rows.push({
      page_url: page.url,
      title: page.title,
      host: page.host,
      images,
    });
  }
  const flat = [];
  for (const row of rows) {
    for (const img of row.images || []) {
      flat.push({
        image_url: img.image_url,
        page_url: row.page_url,
        alt: img.alt,
        page_title: row.title,
      });
    }
  }
  return { ok: true, ticker: id, hosts: allow.hosts, pages: allow.pages, rows, candidates: flat };
}

async function fetchImageBytes(url, { fetchImpl, lane, allowHosts }) {
  let current = url;
  for (let hop = 0; hop < 5; hop += 1) {
    const parsed = parseHttpsUrl(current);
    if (!parsed) return { ok: false, error: 'image_url must be https' };
    const host = parsed.hostname.toLowerCase();
    if (lane === 'primary') {
      if (!hostOnAllowlist(host, allowHosts)) {
        return { ok: false, error: `redirect/host ${host} not on primary allowlist` };
      }
    } else {
      const blocked = tapeHostBlocked(current);
      if (blocked.blocked) return { ok: false, error: blocked.reason };
    }
    const ctl = new AbortController();
    const t = setTimeout(() => ctl.abort(), FETCH_MS);
    let res;
    try {
      res = await fetchImpl(current, {
        headers: { 'User-Agent': BROWSER_UA, Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8' },
        signal: ctl.signal,
        redirect: 'manual',
      });
    } catch (e) {
      clearTimeout(t);
      return { ok: false, error: e.message || String(e) };
    }
    clearTimeout(t);
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers?.get?.('location');
      if (!loc) return { ok: false, error: 'redirect without location' };
      try {
        current = new URL(loc, current).href;
      } catch {
        return { ok: false, error: 'bad redirect location' };
      }
      continue;
    }
    if (!res.ok) return { ok: false, error: `image fetch ${res.status}` };
    const cl = Number(res.headers?.get?.('content-length'));
    if (Number.isFinite(cl) && cl > MAX_PHOTO_BYTES) {
      return { ok: false, error: `image exceeds ${MAX_PHOTO_BYTES} bytes` };
    }
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.length > MAX_PHOTO_BYTES) {
      return { ok: false, error: `image exceeds ${MAX_PHOTO_BYTES} bytes` };
    }
    return { ok: true, bytes: buf, finalUrl: current };
  }
  return { ok: false, error: 'too many redirects' };
}

function readRawMap(ticker) {
  const id = sanitizeTicker(ticker);
  const file = path.join(vaultRoot(), 'cockpit', 'learn', id, 'product-map.json');
  if (!id || !fs.existsSync(file)) return { ok: false, error: 'no product-map.json — publish the map before photos', file };
  try {
    return { ok: true, file, raw: JSON.parse(fs.readFileSync(file, 'utf8')) };
  } catch (e) {
    return { ok: false, error: e.message || String(e), file };
  }
}

function learnerBytes(ticker) {
  const id = sanitizeTicker(ticker);
  const file = path.join(vaultRoot(), 'cockpit', 'learn', id, 'learner.json');
  try {
    return fs.existsSync(file) ? fs.readFileSync(file) : null;
  } catch {
    return null;
  }
}

/**
 * Download + pin. fetchImpl injectable. learner.json bytes must stay identical.
 */
export async function harvestPhoto(ticker, body = {}, opts = {}) {
  const id = sanitizeTicker(ticker);
  if (!id) return { ok: false, error: 'empty ticker' };
  const mapRead = readRawMap(id);
  if (!mapRead.ok) return mapRead;
  const nodeIds = new Set(
    (Array.isArray(mapRead.raw.nodes) ? mapRead.raw.nodes : [])
      .map((n) => topicId(n.id || n.title))
      .filter(Boolean),
  );
  const allowHosts = photoHostAllowlist(id).hosts;
  const draftRow = {
    id: body.id,
    lane: body.lane,
    kind: body.kind,
    as_of: body.as_of,
    caption: body.caption,
    node_id: body.node_id,
    query: body.query,
    source_label: body.source_label,
    grade: body.grade,
    source: {
      label: body.source_label || body.source?.label,
      page_url: body.page_url || body.source?.page_url,
      image_url: body.image_url || body.source?.image_url,
      grade: body.grade || body.source?.grade,
      query: body.query || body.source?.query,
    },
  };
  const pre = rejectDraft(draftRow, { ticker: id, nodeIds, allowHosts });
  if (!pre.ok) return pre;

  const fetchImpl = opts.fetchImpl || globalThis.fetch;
  const got = await fetchImageBytes(pre.draft.source.image_url, {
    fetchImpl,
    lane: pre.draft.lane,
    allowHosts,
  });
  if (!got.ok) return got;
  const sniff = sniffImageBytes(got.bytes);
  if (!sniff.ok) return sniff;

  const sha = crypto.createHash('sha256').update(got.bytes).digest('hex');
  const src = photoRelSrc(id, pre.draft.id, sniff.ext);
  const retrievedAt = new Date().toISOString();
  const photo = {
    ...pre.draft,
    src,
    sha256: sha,
    source: { ...pre.draft.source, retrieved_at: retrievedAt },
  };

  const prior = Array.isArray(mapRead.raw.photos) ? mapRead.raw.photos.slice() : [];
  const next = prior.filter((p) => topicId(p.id) !== photo.id);
  next.push(photo);
  const photosGate = validateLearnPhotos(next, { ticker: id, nodeIds });
  if (!photosGate.ok) return photosGate;

  const priorLearner = learnerBytes(id);
  const dir = photosDir(id);
  fs.mkdirSync(dir, { recursive: true });
  const abs = photoAbsPath(id, `${photo.id}.${sniff.ext}`);
  fs.writeFileSync(abs, got.bytes);

  const stamped = {
    ...mapRead.raw,
    ticker: id,
    photos: photosGate.photos,
    updated_at: new Date().toISOString(),
  };

  let snap;
  try {
    const { validateProductMap } = await import('./learnMap.js');
    const gate = validateProductMap(stamped, id);
    if (!gate.ok) {
      try { fs.unlinkSync(abs); } catch { /* keep fail-closed */ }
      return { ok: false, error: gate.error };
    }
    // Write the existing book + photos. Do not canonicalize nodes/diagrams
    // through publishProductMap — harvest is additive, not a map rewrite.
    fs.writeFileSync(mapRead.file, `${JSON.stringify(stamped, null, 2)}\n`, 'utf8');
    const thin = await import('./thinLearn.js');
    snap = thin.getLearnSnapshot(id, { desk: opts.desk });
  } catch (e) {
    try { fs.unlinkSync(abs); } catch { /* keep fail-closed */ }
    return { ok: false, error: e.message || String(e) };
  }
  const afterLearner = learnerBytes(id);
  if (priorLearner && afterLearner && !priorLearner.equals(afterLearner)) {
    return { ok: false, error: 'photo harvest must not remint learner' };
  }
  return { ok: true, photo, map: snap?.map, ...snap };
}

export function resolveLearnPhotoFile(ticker, file) {
  const id = sanitizeTicker(ticker);
  const name = String(file || '');
  if (!id) return { ok: false, error: 'empty ticker' };
  if (!/^[a-z0-9._-]+\.(png|jpg|webp)$/i.test(name) || name.includes('..') || name.includes('/') || name.includes('\\')) {
    return { ok: false, error: 'not found' };
  }
  const abs = photoAbsPath(id, name);
  if (!abs) return { ok: false, error: 'not found' };
  const mapRead = readRawMap(id);
  if (!mapRead.ok) return { ok: false, error: 'not found' };
  const nodeIds = new Set(
    (Array.isArray(mapRead.raw.nodes) ? mapRead.raw.nodes : [])
      .map((n) => topicId(n.id || n.title))
      .filter(Boolean),
  );
  const gate = validateLearnPhotos(mapRead.raw.photos, { ticker: id, nodeIds });
  if (!gate.ok) return { ok: false, error: 'not found' };
  const rel = `cockpit/learn/${id}/photos/${name}`;
  const hit = gate.photos.find((p) => p.src === rel);
  if (!hit) return { ok: false, error: 'not found' };
  if (!fs.existsSync(abs)) return { ok: false, error: 'not found' };
  return { ok: true, abs, photo: hit };
}

export function fixtureLearnPhotos(ticker = 'TEST') {
  const id = sanitizeTicker(ticker) || 'TEST';
  return [
    {
      id: 'filed-rack',
      lane: 'primary',
      kind: 'system',
      src: `cockpit/learn/${id}/photos/filed-rack.jpg`,
      sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
      as_of: '2026-01-25',
      caption: 'Filed system photo from an exhibit',
      source: {
        label: 'FY exhibit photo',
        page_url: 'https://www.sec.gov/Archives/edgar/data/1/exhibit.htm',
        image_url: 'https://www.sec.gov/Archives/edgar/data/1/rack.jpg',
        grade: 'A',
        retrieved_at: '2026-08-28T00:00:00.000Z',
      },
      node_id: 'platform',
    },
    {
      id: 'web-package',
      lane: 'tape',
      kind: 'process',
      src: `cockpit/learn/${id}/photos/web-package.webp`,
      sha256: 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb',
      as_of: '2026-08-28',
      caption: 'Package photo — web, not a filing',
      source: {
        label: 'Tech press article photo',
        page_url: 'https://www.tomshardware.com/reviews/package',
        image_url: 'https://cdn.mos.cms.futurecdn.net/package.webp',
        grade: 'tape',
        query: 'Acme packaging photo',
        retrieved_at: '2026-08-28T00:00:00.000Z',
      },
      node_id: 'pkg-how',
    },
  ];
}

export function formatPhotoSeedBlock({ allow, queries, candidates, slug }) {
  const hosts = (allow?.hosts || []).join(', ') || '(none — SEC only if no graded urls)';
  const qLines = (queries || []).map((q) => `- \`${q}\``).join('\n') || '- (no ready silicon/systems/networking/process/mechanism nodes)';
  const candLines = (candidates || []).slice(0, 24).map((c) => (
    `- ${c.image_url} · page ${c.page_url}${c.alt ? ` · ${c.alt}` : ''}`
  )).join('\n') || '- (none — primary lane is GAP until a pinned IR/newsroom/SEC page surfaces a photo)';
  return [
    '## Photos job (two lanes — enrichment, not a depth-bar gate)',
    '',
    'Photos sit on `product-map.json` `photos[]` and render in ARCHITECTURE next to the HTML drawings.',
    'They never mint a pack claim, a house line, a risk, or a mix $. Captions carry no $.',
    `Caps: ≤${PHOTOS_MAX_TOTAL} total / ≤${PHOTOS_MAX_TAPE} tape. Missing file on disk → GAP box, never a broken image.`,
    'No generated images (no DALL-E / GenerateImage). No Google API key. Do not scrape the SERP in Node.',
    'Do not hotlink `encrypted-tbn*` / gstatic thumbs — the server downloads origin bytes and stores a vault copy.',
    '',
    '### Lane primary (IR / newsroom / SEC)',
    '',
    `Allowlist (graded wiki/sources hosts + www.sec.gov): ${hosts}`,
    'Unknown host → server rejects. To admit a new host, file a graded source slug first.',
    '',
    'Candidates from pinned pages (depth 0) — run `node scripts/learn-photos.mjs --desk {slug} --candidates` then paste the usable rows:',
    candLines,
    '',
    '### Lane tape (Google Images — web, not a filing)',
    '',
    'Run these queries **verbatim** on Google Images. Open the result host page. Take the full-size image_url (not the SERP thumb), the page_url, and what the page says the photo shows.',
    'Identification gate: publish only when the page itself names the study-tree product. Wrong chip, stock office, meme, competitor mislabel → skip; the node keeps its GAP.',
    'Blocklist: gstatic / googleusercontent / google thumbs, stock agencies, meme/repost farms. page_url must not be google.*',
    '',
    qLines,
    '',
    '### Publish',
    '',
    `POST \`/api/${slug || '{slug}'}/learn/photos\` — server fetches \`image_url\` itself (magic sniff, 3 MB cap, sha256).`,
    'Primary body: `{ id, lane: "primary", kind, image_url, page_url, caption, as_of, node_id?, source_label }` grade A/B.',
    'Tape body: same + `lane: "tape"`, required `node_id` + `query`, caption must say it is **web, not a filing**.',
    'Do not POST learner.json. Do not upload image bytes.',
  ].join('\n');
}
