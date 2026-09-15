#!/usr/bin/env node
/**
 * learn-photos.mjs — allowlist / queries / candidates / fetch for learn-map photos.
 *
 * Default (no flags): print allowlist + tape queries and exit — no network.
 *
 *   node scripts/learn-photos.mjs --desk nvda
 *   node scripts/learn-photos.mjs --desk nvda --allowlist
 *   node scripts/learn-photos.mjs --desk nvda --queries
 *   node scripts/learn-photos.mjs --desk nvda --candidates
 *   node scripts/learn-photos.mjs --desk nvda --fetch <image_url> --lane … --id … --kind … --caption … --page … [--query …]
 *
 * Decision-support only. No SERP scrape. No Google API key. Factory --fill stays refused elsewhere.
 */
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);

function flag(name) {
  return args.includes(name);
}
function opt(name) {
  const i = args.indexOf(name);
  return i >= 0 ? String(args[i + 1] || '') : '';
}

const desk = opt('--desk') || opt('--ticker') || args.find((a) => !a.startsWith('--') && a !== opt('--fetch')) || '';
if (!desk) {
  console.error('usage: node scripts/learn-photos.mjs --desk {slug} [--allowlist|--queries|--candidates|--fetch …]');
  process.exit(2);
}

const { resolveDeskIdentity } = await import(path.join(ROOT, 'server', 'streetAgentSeed.js'));
const { tryGetThinDeskBundle } = await import(path.join(ROOT, 'server', 'thinDeskProfiles.js'));
const { getLearnSnapshot } = await import(path.join(ROOT, 'server', 'thinLearn.js'));
const {
  photoHostAllowlist,
  learnPhotoQueries,
  discoverPhotoCandidates,
  harvestPhoto,
} = await import(path.join(ROOT, 'server', 'learnPhotos.js'));

const id = resolveDeskIdentity(desk);
const bundle = tryGetThinDeskBundle(id.slug);
const displayName = bundle?.model?.displayName || id.label;
const snap = getLearnSnapshot(id.ticker, { desk: id.slug });
const allow = photoHostAllowlist(id.ticker);
const queries = learnPhotoQueries(snap.map, displayName);

const wantAllow = flag('--allowlist');
const wantQueries = flag('--queries');
const wantCandidates = flag('--candidates');
const fetchUrl = opt('--fetch');
const defaultPrint = !wantAllow && !wantQueries && !wantCandidates && !fetchUrl;

if (wantAllow || defaultPrint) {
  console.log(`allowlist ${id.ticker}`);
  for (const h of allow.hosts) console.log(h);
  if (allow.pages.length) {
    console.log('pinned pages');
    for (const p of allow.pages) console.log(`  ${p.grade} ${p.url}`);
  }
}

if (wantQueries || defaultPrint) {
  console.log(`queries ${id.ticker} (${displayName})`);
  if (!queries.length) console.log('(none)');
  for (const q of queries) console.log(q);
}

if (wantCandidates) {
  const found = await discoverPhotoCandidates(id.ticker);
  console.log(`candidates ${id.ticker} (${found.candidates.length})`);
  if (!found.candidates.length) console.log('(none — primary lane GAP)');
  for (const c of found.candidates) {
    console.log(`${c.image_url} · ${c.page_url}${c.alt ? ` · ${c.alt}` : ''}`);
  }
}

if (fetchUrl) {
  const body = {
    id: opt('--id'),
    lane: opt('--lane') || 'primary',
    kind: opt('--kind'),
    image_url: fetchUrl,
    page_url: opt('--page') || opt('--page-url'),
    caption: opt('--caption'),
    as_of: opt('--as-of') || opt('--as_of') || new Date().toISOString().slice(0, 10),
    node_id: opt('--node') || opt('--node-id') || undefined,
    source_label: opt('--label') || opt('--source-label'),
    query: opt('--query') || undefined,
    grade: opt('--grade') || undefined,
  };
  const out = await harvestPhoto(id.ticker, body, { desk: id.slug, displayName });
  if (!out.ok) {
    console.error(`fetch FAIL: ${out.error}`);
    process.exit(1);
  }
  console.log(`fetched ${out.photo.id} → ${out.photo.src} sha256=${out.photo.sha256.slice(0, 12)}…`);
}

process.exit(0);
