#!/usr/bin/env node
/**
 * Delete harness census.
 * Every per-desk path the server knows how to write must be owned by deskBundle.
 * A planted company is then removed. Owned paths are gone. The other company is the same bytes.
 * Decision-support only. Fixture vault only.
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { buildAllBundles, proposalOwned, unownedCompanyFiles } from '../server/deskBundle.js';
import { deleteDeskBundle, resumeUnfinishedDeletes } from '../server/deleteDesk.js';
import { acceptProposal } from '../server/nbisProposals.js';

const SERVER = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../server');
const BUNDLE_SRC = fs.readFileSync(path.join(SERVER, 'deskBundle.js'), 'utf8');

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

function walkJs(dir) {
  const out = [];
  for (const name of fs.readdirSync(dir)) {
    const abs = path.join(dir, name);
    if (fs.statSync(abs).isDirectory()) out.push(...walkJs(abs));
    else if (name.endsWith('.js')) out.push(abs);
  }
  return out;
}

function normalize(raw) {
  return raw
    .replace(/\$\{[^}]+\}/g, '*')
    .replace(/\{TICKER\}/gi, '*')
    .replace(/\{ticker\}/g, '*')
    .replace(/\{slug\}/g, '*')
    .replace(/\{id\}/g, '*')
    .replace(/\{s\}/g, '*');
}

/** A template is covered only when the bundle moves that exact shape, not merely the same top folder. */
function templateCovered(norm) {
  if (norm.startsWith('cockpit/trash/')) return true;
  if (norm.startsWith('cockpit/learn/')) return true;
  if (norm.startsWith('cockpit/research/')) return true;
  if (norm.startsWith('cockpit/compile/')) return true;
  if (norm.startsWith('cockpit/street/history/')) return true;
  if (norm === 'cockpit/street/*.json') return true;
  if (norm.startsWith('cockpit/model/history/')) return true;
  if (norm === 'cockpit/model/*.json') return true;
  if (norm.startsWith('cockpit/session/')) return true;
  if (norm.startsWith('cockpit/briefs/daily/')) return true;
  if (norm === 'cockpit/proposals/*') return true;
  if (/^cockpit\/proposals\/(house|risks|drivers)-\*/.test(norm)) return true;
  if (norm === 'cockpit/history' || norm === 'cockpit/history/*') return true;
  if (/^cockpit\/history\/[^/]*$/.test(norm)) return true;
  if (/^cockpit\/history\/(house|register|drivers)-/.test(norm)) return true;
  if (norm.startsWith('house-view-')) return true;
  if (norm.startsWith('raw/') && norm.includes('-research')) return true;
  if (norm.startsWith('wiki/entities/')) return true;
  if (norm.startsWith('wiki/sources/')) return true;
  if (norm.startsWith('packs/') || norm.includes('/packs/')) return true;
  if (norm.includes('store/by_ticker')) return true;
  return false;
}

const SHARED_EXACT = new Set([
  'cockpit',
  'cockpit/.sync-state.json',
  'cockpit/.sync.lock',
  'cockpit/compile/_sec',
  'cockpit/compile/_sec/company_tickers.json',
  'cockpit/desks',
  'cockpit/forecast',
  'cockpit/forecast/nowcast-panel.json',
  'cockpit/forecast/nowcast.json',
  'cockpit/go-commit-log.jsonl',
  'cockpit/house-write-log.jsonl',
  'cockpit/headlines.csv',
  'cockpit/history',
  'cockpit/leverage/leverage-monitor.json',
  'cockpit/lib/fm.js',
  'cockpit/margins/margins.json',
  'cockpit/model',
  'cockpit/proposals',
  'cockpit/risks',
  'cockpit/series',
  'cockpit/series/_registry.md',
  'cockpit/street',
  'cockpit/street/street-models.json',
  'cockpit/sync.js',
]);

// Factory files. Delete must leave these. Adding a company lane here hides debt.
const SHARED_SHAPE = new Set([
  'cockpit/desks/*',
  'cockpit/forecast/*',
  'cockpit/risks/*',
  'cockpit/series/*.csv',
  'cockpit/delete-receipts',
  'cockpit/delete-receipts/*.json',
]);

const LEGACY_BOOK = new Set([
  'house-view-nebius.md',
  'raw/nebius-research',
  'raw/nebius-research/08-risks-catalysts.md',
  'wiki/entities/nebius.md',
]);

function stripComments(src) {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:\\])\/\/.*$/gm, '$1');
}

function extractBalanced(src, openIdx) {
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (let i = openIdx; i < src.length; i += 1) {
    const c = src[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; continue; }
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) return { inner: src.slice(openIdx + 1, i), end: i };
    }
  }
  return null;
}

function splitArgs(argSrc) {
  const args = [];
  let cur = '';
  let depth = 0;
  let inStr = null;
  let esc = false;
  for (const c of argSrc) {
    if (inStr) {
      cur += c;
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === inStr) inStr = null;
      continue;
    }
    if (c === '"' || c === "'" || c === '`') { inStr = c; cur += c; continue; }
    if (c === '(' || c === '[' || c === '{') { depth += 1; cur += c; continue; }
    if (c === ')' || c === ']' || c === '}') { depth -= 1; cur += c; continue; }
    if (c === ',' && depth === 0) { args.push(cur.trim()); cur = ''; continue; }
    cur += c;
  }
  if (cur.trim()) args.push(cur.trim());
  return args;
}

function piece(arg) {
  const t = arg.trim();
  let m = t.match(/^['"]([A-Za-z0-9_./-]*)['"]$/);
  if (m) return m[1];
  m = t.match(/^`([A-Za-z0-9_./-]*)`$/);
  if (m) return m[1];
  m = t.match(/^`([A-Za-z0-9_./-]*)\$\{[^}]+\}([A-Za-z0-9_./-]*)`$/);
  if (m) return `${m[1]}*${m[2]}`;
  if (t.includes('${')) return '*';
  if (/^[A-Za-z_][A-Za-z0-9_]*\([^()]*\)$/.test(t)) return { call: t.slice(0, t.indexOf('(')) };
  m = t.match(/^([A-Z][A-Z0-9_]*)$/);
  if (m) return { name: m[1] };
  return '*';
}

function nearestBinder(src, joinIdx) {
  const before = src.slice(0, joinIdx);
  const ret = before.match(/function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\([^)]*\)\s*\{[^{}]*return\s*$/);
  if (ret) return { kind: 'fn', name: ret[1] };
  const asg = before.match(/(?:const|let|var)\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*$/);
  if (asg) return { kind: 'const', name: asg[1] };
  return null;
}

function functionSpans(src) {
  const marks = [];
  const re = /(?:^|\n)(?:export\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(/g;
  let m;
  while ((m = re.exec(src))) marks.push({ name: m[1], start: m.index });
  const spans = [];
  for (let i = 0; i < marks.length; i += 1) {
    spans.push({ name: marks[i].name, start: marks[i].start, end: i + 1 < marks.length ? marks[i + 1].start : src.length });
  }
  return spans;
}

function joinShapes() {
  const parsed = walkJs(SERVER).map((abs) => ({
    rel: path.relative(SERVER, abs),
    text: stripComments(fs.readFileSync(abs, 'utf8')),
  }));
  const globalFns = new Map();
  const fileBinds = new Map();
  const localBinds = new Map();
  const fileStrings = new Map();
  const joins = [];
  const constRe = /(?:^|\n)\s*(?:export\s+)?(?:const|let|var)\s+([A-Z][A-Z0-9_]*)\s*=\s*['"]([A-Za-z0-9_./-]*)['"]/g;
  for (const file of parsed) {
    const strings = new Map();
    let cm;
    constRe.lastIndex = 0;
    while ((cm = constRe.exec(file.text))) strings.set(cm[1], cm[2]);
    fileStrings.set(file.rel, strings);
    const spans = functionSpans(file.text);
    const locals = new Map();
    fileBinds.set(file.rel, new Map());
    let idx = 0;
    while ((idx = file.text.indexOf('path.join(', idx)) !== -1) {
      const open = file.text.indexOf('(', idx);
      const bal = extractBalanced(file.text, open);
      if (!bal) break;
      const args = splitArgs(bal.inner).map(piece);
      const binder = nearestBinder(file.text, idx);
      const span = spans.find((s) => s.start <= idx && idx < s.end) || null;
      joins.push({ file: file.rel, line: file.text.slice(0, idx).split('\n').length, args, spanStart: span ? span.start : -1 });
      if (binder?.kind === 'fn') {
        const prev = globalFns.get(binder.name);
        if (!prev) globalFns.set(binder.name, { args, file: file.rel });
        else if (prev.file !== file.rel) globalFns.set(binder.name, { ambiguous: true });
      } else if (binder?.kind === 'const') {
        const bucket = span ? (locals.get(span.start) || new Map()) : fileBinds.get(file.rel);
        bucket.set(binder.name, args);
        if (span) locals.set(span.start, bucket);
      }
      idx = bal.end + 1;
    }
    localBinds.set(file.rel, locals);
  }

  function resolve(args, depth, stack, file, spanStart) {
    const out = [];
    for (const a of args) {
      if (typeof a === 'string') { out.push(a); continue; }
      const key = a && (a.call || a.name);
      const local = spanStart >= 0 ? localBinds.get(file)?.get(spanStart) : null;
      const bound = (local && local.get(key)) || fileBinds.get(file)?.get(key) || null;
      const fn = !bound && key && a.call ? globalFns.get(key) : null;
      const next = bound || (fn && !fn.ambiguous ? fn.args : null);
      if (next && depth < 6 && !stack.includes(key)) {
        out.push(...resolve(next, depth + 1, [...stack, key], file, spanStart));
        continue;
      }
      if (a && a.name) {
        const lit = fileStrings.get(file)?.get(a.name);
        if (lit != null) { out.push(lit); continue; }
      }
      out.push('*');
    }
    return out;
  }

  const found = [];
  for (const j of joins) {
    const joined = resolve(j.args, 0, [], j.file, j.spanStart).join('/').replace(/\/+/g, '/');
    const book = joined.match(/(?:^|\/)((?:house-view-[A-Za-z0-9_.*-]+\.md|raw\/[A-Za-z0-9_.*-]+-research(?:\/[A-Za-z0-9_.*-]*)?|wiki\/entities\/[A-Za-z0-9_.*-]+\.md|wiki\/sources(?:\/[A-Za-z0-9_.*-]+)?))$/);
    const cock = joined.match(/(?:^|\/)(cockpit(?:\/[A-Za-z0-9_.*-]+)*)$/);
    const shape = book ? book[1] : cock ? cock[1] : null;
    if (!shape || shape.startsWith('cockpit-')) continue;
    found.push({ file: j.file, line: j.line, norm: shape });
  }
  return found;
}

function shapeOwned(norm) {
  if (templateCovered(norm)) return true;
  if (SHARED_EXACT.has(norm) || SHARED_SHAPE.has(norm)) return true;
  if (LEGACY_BOOK.has(norm)) return true;
  const file = norm.match(/^cockpit\/proposals\/([^/*]+)$/);
  if (file) {
    const slug = file[1].match(/^(?:house|risks|drivers)-([a-z0-9-]+)\.json$/)?.[1]
      || file[1].match(/^([a-z0-9-]+)-pending\.json$/)?.[1]
      || file[1].match(/^([a-z0-9-]+)-house-propose/)?.[1];
    if (slug && proposalOwned(slug, file[1])) return true;
  }
  if (/^wiki\/entities\/\*\.md$/.test(norm)) return true;
  if (/^raw\/\*-research(?:\/.*)?$/.test(norm)) return true;
  if (/^house-view-\*\.md$/.test(norm)) return true;
  if (norm === 'wiki/sources' || /^wiki\/sources\/[^/]+$/.test(norm)) return true;
  return false;
}

function hardcodedBookPaths() {
  const re = /house-view-[a-z0-9-]+\.md|raw\/[a-z0-9-]+-research|wiki\/entities\/[a-z0-9-]+\.md/g;
  const found = [];
  for (const file of walkJs(SERVER)) {
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    let m;
    while ((m = re.exec(text))) {
      if (m[0].includes('${') || m[0].includes('*')) continue;
      found.push({ file: path.relative(SERVER, file), raw: m[0] });
    }
  }
  return found;
}

function sourceTemplates() {
  const found = [];
  const re = /cockpit\/[a-z0-9_./-]*(?:\$\{[^}]+\}|\{TICKER\}|\{ticker\}|\{slug\}|\{id\})[a-z0-9_./-]*/gi;
  const also = /(?:house-view-|raw\/|wiki\/entities\/|wiki\/sources\/|packs\/)[a-z0-9_./-]*(?:\$\{[^}]+\}|\{TICKER\}|\{slug\})[a-z0-9_./-]*/g;
  for (const file of walkJs(SERVER)) {
    const text = fs.readFileSync(file, 'utf8');
    const lines = text.split('\n');
    lines.forEach((line, i) => {
      for (const rx of [re, also]) {
        rx.lastIndex = 0;
        let m;
        while ((m = rx.exec(line))) {
          found.push({
            file: path.relative(SERVER, file),
            line: i + 1,
            raw: m[0],
            norm: normalize(m[0]),
          });
        }
      }
    });
  }
  return found;
}

function historyKindsInBundle() {
  return [...BUNDLE_SRC.matchAll(/new RegExp\(`\^([a-z]+)-\$\{slug\}/g)].map((m) => m[1]);
}

function proposalPrefixesInBundle() {
  return [...BUNDLE_SRC.matchAll(/name === `([a-z]+)-\$\{slug\}\.json`/g)].map((m) => m[1]);
}

console.log('\ndelete census — server templates\n');

const uncovered = [
  ...sourceTemplates().filter((t) => !templateCovered(t.norm)),
  ...joinShapes().filter((t) => !shapeOwned(t.norm)),
];
if (uncovered.length === 0) ok('every per-desk path the server can write is owned by the delete bundle');
else {
  bad('a server path is not owned by delete — this becomes leftover debt');
  for (const t of uncovered) console.log(`    ${t.file}:${t.line || '?'}  ${t.norm}`);
}

const legacyHits = hardcodedBookPaths().filter((t) => !LEGACY_BOOK.has(t.raw) && !LEGACY_BOOK.has(t.raw.replace(/\/[^/]+$/, '')));
const knownLegacy = hardcodedBookPaths().filter((t) => LEGACY_BOOK.has(t.raw) || LEGACY_BOOK.has(t.raw.replace(/\/[^/]+$/, '')));
if (legacyHits.length === 0 && knownLegacy.length > 0) {
  ok('hardcoded company paths are only the pre-thin nebius names');
} else {
  bad('a new hardcoded company path is not on the delete bundle');
  for (const t of legacyHits) console.log(`    ${t.file}  ${t.raw}`);
}

const kinds = historyKindsInBundle();
const snapKinds = [];
for (const file of walkJs(SERVER)) {
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/snapshotRel\(\s*[^,\n]+,\s*[^,\n]+,\s*'([a-z]+)'\s*\)/g)) {
    snapKinds.push({ kind: m[1], file: path.relative(SERVER, file) });
  }
}
const missingKind = snapKinds.filter((s) => !kinds.includes(s.kind));
if (snapKinds.length >= 3 && missingKind.length === 0) ok(`history snapshots (${[...new Set(snapKinds.map((s) => s.kind))].join(', ')}) are all removed`);
else bad(`history kind not in the bundle: ${missingKind.map((s) => `${s.kind} (${s.file})`).join(', ') || 'none found'}`);

const prefixes = proposalPrefixesInBundle();
const writerPrefixes = [];
for (const file of walkJs(SERVER)) {
  if (path.basename(file) === 'deskBundle.js') continue;
  const text = fs.readFileSync(file, 'utf8');
  for (const m of text.matchAll(/`([a-z]+)-\$\{s(?:lug)?\}\.json`/g)) {
    writerPrefixes.push({ prefix: m[1], file: path.relative(SERVER, file) });
  }
}
const missingPrefix = writerPrefixes.filter((w) => !prefixes.includes(w.prefix));
if (writerPrefixes.length >= 3 && missingPrefix.length === 0) {
  ok(`proposal stores (${[...new Set(writerPrefixes.map((w) => w.prefix))].join(', ')}) are all removed`);
} else bad(`proposal store not in the bundle: ${missingPrefix.map((w) => `${w.prefix} (${w.file})`).join(', ') || 'none found'}`);

console.log('\ndelete census — planted company over time\n');

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function desk(slug, ticker, title) {
  return {
    slug,
    ticker,
    house_file: `house-view-${slug}.md`,
    profile: {
      entitySlug: slug,
      rawDir: `raw/${slug}-research`,
      houseTitleDefault: title,
    },
  };
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-census-'));
const vault = path.join(root, 'vault');
const ont = path.join(root, 'ont');
const store = path.join(ont, 'store', 'by_ticker');
fs.mkdirSync(store, { recursive: true });

const plants = [
  'house-view-zz.md',
  'raw/zz-research/08-risks-catalysts.md',
  'raw/zz-research/09-drivers.md',
  'raw/zz-research/risks/card.md',
  'wiki/entities/zz.md',
  'wiki/sources/zz.md',
  'wiki/sources/zz-10k.md',
  'wiki/sources/zz-extra.md',
  'cockpit/street/ZZ.json',
  'cockpit/street/history/ZZ/old.json',
  'cockpit/model/ZZ.json',
  'cockpit/model/history/ZZ/old.json',
  'cockpit/learn/ZZ/photos/rack.png',
  'cockpit/learn/ZZ/deep/silicon/note.md',
  'cockpit/research/ZZ/runs/r1/meta.json',
  'cockpit/research/ZZ/schedule.json',
  'cockpit/compile/ZZ/filings/index.json',
  'cockpit/briefs/daily/zz/day.md',
  'cockpit/session/zz.json',
  'cockpit/proposals/house-zz.json',
  'cockpit/proposals/risks-zz.json',
  'cockpit/proposals/drivers-zz.json',
  'cockpit/proposals/zz-pending.json',
  'cockpit/proposals/zz-house-propose.md',
  'cockpit/proposals/zz-house-propose-later.md',
  'cockpit/history/house-zz.2026.md',
  'cockpit/history/register-zz.2026.md',
  'cockpit/history/drivers-zz.2026.md',
];
for (const rel of plants) write(path.join(vault, rel), `zz ${rel}\n`);
write(path.join(ont, 'packs', 'ZZ.json'), `${JSON.stringify({
  ticker: 'ZZ',
  source_globs: ['raw/zz-research/*.md', 'wiki/entities/zz.md'],
}, null, 2)}\n`);
write(path.join(store, 'ZZ.json'), '{}\n');

const decoys = [
  'house-view-yy.md',
  'raw/yy-research/08-risks-catalysts.md',
  'wiki/entities/yy.md',
  'wiki/sources/yy-note.md',
  'wiki/sources/fuzz-zz.md',
  'wiki/sources/zznote.md',
  'wiki/entities/nebius.md',
  'raw/nebius-research/08-risks-catalysts.md',
  'wiki/concepts/shared.md',
  'cockpit/street/ZZZ.json',
  'cockpit/street/street-models.json',
  'cockpit/learn/ZZZ/primer.md',
  'cockpit/model/ZZZ.json',
  'cockpit/series/zz.csv',
  'cockpit/series/_registry.md',
  'cockpit/desks/zz.md',
  'cockpit/risks/zz.md',
  'cockpit/compile/_sec/company_tickers.json',
  'cockpit/margins/margins.json',
  'cockpit/forecast/nowcast.json',
  'cockpit/forecast/nowcast-panel.json',
  'cockpit/leverage/leverage-monitor.json',
  'cockpit/headlines.csv',
  'cockpit/lib/fm.js',
  'cockpit/.sync-state.json',
  'cockpit/street/YY.json',
  'cockpit/street/history/YY/old.json',
  'cockpit/model/YY.json',
  'cockpit/learn/YY/lessons/cardiometabolic.md',
  'cockpit/research/YY/runs/r1/meta.json',
  'cockpit/session/yy.json',
  'cockpit/proposals/house-yy.json',
  'cockpit/history/house-yy.2026.md',
  'cockpit/go-commit-log.jsonl',
  'cockpit/agent-accept-log.jsonl',
];
for (const rel of decoys) write(path.join(vault, rel), `keep ${rel}\n`);
write(path.join(ont, 'packs', 'YY.json'), `${JSON.stringify({ ticker: 'YY', source_globs: ['wiki/sources/yy-*.md'] })}\n`);
write(path.join(store, 'YY.json'), '{}\n');
write(path.join(vault, 'house-view-aa.md'), 'aa\n');
write(path.join(ont, 'packs', 'AA.json'), '{"ticker":"AA","source_globs":[]}\n');

const registryText = `{
  "rooms": ["overview"],
  "desks": [
    {
      "slug": "zz",
      "ticker": "ZZ",
      "house_file": "house-view-zz.md",
      "profile": { "entitySlug": "zz", "rawDir": "raw/zz-research", "houseTitleDefault": "House View \\u2014 ZZ" }
    },
    {
      "slug": "yy",
      "ticker": "YY",
      "house_file": "house-view-yy.md",
      "profile": { "entitySlug": "yy", "rawDir": "raw/yy-research", "houseTitleDefault": "House View \\u2014 YY" }
    },
    {
      "slug": "aa",
      "ticker": "AA",
      "house_file": "house-view-aa.md",
      "profile": { "entitySlug": "aa", "rawDir": "raw/aa-research", "houseTitleDefault": "House View \\u2014 AA" }
    }
  ]
}
`;
const registryPath = path.join(root, 'thin-desks.json');
write(registryPath, registryText);
const yyMarker = '"houseTitleDefault": "House View \\u2014 YY"';

function digest(rels, base) {
  const h = crypto.createHash('sha256');
  for (const rel of [...rels].sort()) {
    h.update(rel);
    h.update(fs.readFileSync(path.join(base, rel)));
  }
  return h.digest('hex');
}
const stableDecoys = decoys.filter((r) => !r.endsWith('log.jsonl'));
const yyHash = digest(stableDecoys, vault);
const packHash = digest(['packs/YY.json'], ont);

function ownedLeft(slug, ticker) {
  const left = [];
  const visit = (base, relRoot) => {
    if (!fs.existsSync(base)) return;
    const stack = [base];
    while (stack.length) {
      const dir = stack.pop();
      for (const name of fs.readdirSync(dir)) {
        const abs = path.join(dir, name);
        const rel = path.join(relRoot, path.relative(base, abs)).split(path.sep).join('/');
        if (rel.startsWith('cockpit/trash/')) continue;
        const st = fs.lstatSync(abs);
        if (st.isSymbolicLink()) {
          left.push(rel);
          continue;
        }
        if (st.isDirectory()) stack.push(abs);
        else if (isOwnedPath(rel, slug, ticker)) left.push(rel);
      }
    }
  };
  visit(vault, '');
  visit(ont, 'ontology');
  return left;
}

function isOwnedPath(rel, slug, ticker) {
  const base = path.posix.basename(rel);
  if (rel === `house-view-${slug}.md`) return true;
  if (rel === `raw/${slug}-research` || rel.startsWith(`raw/${slug}-research/`)) return true;
  if (rel === `wiki/entities/${slug}.md`) return true;
  if (rel.startsWith('wiki/sources/') && (base === `${slug}.md` || base.startsWith(`${slug}-`))) return true;
  if (rel === `cockpit/street/${ticker}.json` || rel.startsWith(`cockpit/street/history/${ticker}/`)) return true;
  if (rel === `cockpit/model/${ticker}.json` || rel.startsWith(`cockpit/model/history/${ticker}/`)) return true;
  if (rel === `cockpit/learn/${ticker}` || rel.startsWith(`cockpit/learn/${ticker}/`)) return true;
  if (rel === `cockpit/research/${ticker}` || rel.startsWith(`cockpit/research/${ticker}/`)) return true;
  if (rel === `cockpit/compile/${ticker}` || rel.startsWith(`cockpit/compile/${ticker}/`)) return true;
  if (rel === `cockpit/briefs/daily/${slug}` || rel.startsWith(`cockpit/briefs/daily/${slug}/`)) return true;
  if (rel === `cockpit/session/${slug}.json`) return true;
  if (rel.startsWith('cockpit/proposals/') && proposalOwned(slug, base)) return true;
  if (rel.startsWith('cockpit/history/') && new RegExp(`^(house|register|drivers)-${slug}\\.`).test(base)) return true;
  if (rel === `ontology/packs/${ticker}.json` || rel === `ontology/store/by_ticker/${ticker}.json`) return true;
  return false;
}

const beforeWrong = digest([...plants, ...decoys], vault);
let refused = false;
try {
  deleteDeskBundle({
    registryPath, slug: 'zz', confirm: 'no', vaultRoot: vault, ontRoot: ont, storeDir: store,
  });
} catch (e) {
  refused = e.code === 'desk_delete_confirm';
}
if (refused && digest([...plants, ...decoys], vault) === beforeWrong) ok('wrong ticker leaves the vault byte-for-byte');
else bad('wrong ticker changed the vault');

const removed = deleteDeskBundle({
  registryPath, slug: 'zz', confirm: 'ZZ', vaultRoot: vault, ontRoot: ont, storeDir: store,
  now: new Date('2026-11-14T15:00:00.000Z'),
});
const zzLeft = ownedLeft('zz', 'ZZ');
if (removed.ok && zzLeft.length === 0) ok(`zz removed from every planted lane (${plants.length} files)`);
else bad(`zz still live: ${zzLeft.join(', ')}`);

const omitted = path.join(vault, 'wiki', 'sources', 'zz-10k.md');
if (!fs.existsSync(omitted) && !fs.existsSync(path.join(ont, 'packs', 'ZZ.json'))) {
  ok('a source the pack glob forgot is deleted, and the pack is gone');
} else bad('pack-omitted source or pack was kept');

const deletedSet = new Set(removed.files || []);
const covered = (rel) => deletedSet.has(rel) || [...deletedSet].some((m) => rel.startsWith(`${m}/`));
const plantMiss = plants.filter((rel) => !covered(rel));
const lanesGone = [
  'cockpit/learn/ZZ',
  'cockpit/research/ZZ',
  'cockpit/compile/ZZ',
  'cockpit/street/history/ZZ',
  'cockpit/model/history/ZZ',
  'cockpit/street/ZZ.json',
  'raw/zz-research',
].filter((rel) => fs.existsSync(path.join(vault, rel)));
if (plantMiss.length === 0 && lanesGone.length === 0 && !fs.existsSync(path.join(vault, 'cockpit', 'trash'))) {
  ok('every planted file is deleted and no archive is left');
} else bad(`leftover: missing=${plantMiss.join(',')} still=${lanesGone.join(',')}`);

const later = [
  'cockpit/research/YY/runs/r2/later.md',
  'wiki/sources/yy-later.md',
  'cockpit/proposals/risks-yy.json',
  'cockpit/learn/YY/learner.json',
];
for (const rel of later) write(path.join(vault, rel), `later ${rel}\n`);
const laterHash = digest(later, vault);

const afterText = fs.readFileSync(registryPath, 'utf8');
if (afterText.includes(yyMarker) && !/"slug": "zz"/.test(afterText)) {
  ok('the company that stayed kept its exact registry bytes');
} else bad('registry rewrite touched the company that stayed');

const logText = fs.readFileSync(path.join(vault, 'cockpit', 'go-commit-log.jsonl'), 'utf8');
if (digest(stableDecoys, vault) === yyHash
  && digest(['packs/YY.json'], ont) === packHash
  && fs.readFileSync(path.join(vault, 'wiki', 'sources', 'fuzz-zz.md'), 'utf8').includes('keep')
  && logText.startsWith('keep cockpit/go-commit-log.jsonl')
  && logText.includes('"slug":"zz"')) {
  ok('lookalike names, shared notes, and the other company stayed byte-for-byte');
} else bad('a decoy or the other company changed');

deleteDeskBundle({
  registryPath, slug: 'aa', confirm: 'aa', vaultRoot: vault, ontRoot: ont, storeDir: store,
  now: new Date('2026-11-14T15:01:00.000Z'),
});
const finalText = fs.readFileSync(registryPath, 'utf8');
const still = JSON.parse(finalText).desks.map((d) => d.slug);
let retryCode = '';
try {
  deleteDeskBundle({
    registryPath, slug: 'zz', confirm: 'ZZ', vaultRoot: vault, ontRoot: ont, storeDir: store,
    now: new Date('2026-11-14T15:02:00.000Z'),
  });
} catch (e) {
  retryCode = e.code || '';
}
if (still.length === 1 && still[0] === 'yy' && finalText.includes(yyMarker)
  && ownedLeft('aa', 'AA').length === 0 && ownedLeft('zz', 'ZZ').length === 0
  && !fs.existsSync(`${registryPath}.lock`)
  && digest(later, vault) === laterHash
  && retryCode === 'thin_desk_not_found'
  && !fs.existsSync(path.join(vault, 'cockpit', 'trash'))) {
  ok('later work on the company that stayed survives a second removal, and the first one does not come back');
} else {
  bad(`sequential delete drifted: desks=${still.join(',')} later=${digest(later, vault) === laterHash} retry=${retryCode} zzLeft=${ownedLeft('zz', 'ZZ').length}`);
}

const bundle = buildAllBundles({
  desks: [desk('zz', 'ZZ', 'x'), desk('yy', 'YY', 'y')],
  vaultRoot: vault,
  ontRoot: ont,
  storeDir: store,
}).find((b) => b.slug === 'yy');
if (bundle?.ok && !bundle.items.some((i) => i.rel.includes('/ZZ/') || i.rel.includes('zz-'))) {
  ok('the survivor bundle does not list the deleted company');
} else bad('survivor bundle still sees the deleted company');

console.log('\ndelete census — refuse a path that leaves the vault\n');

const escRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-census-esc-'));
const escVault = path.join(escRoot, 'vault');
const escOnt = path.join(escRoot, 'ont');
const escStore = path.join(escOnt, 'store', 'by_ticker');
fs.mkdirSync(escStore, { recursive: true });
write(path.join(escVault, 'house-view-zz.md'), 'zz\n');
write(path.join(escOnt, 'packs', 'ZZ.json'), '{"ticker":"ZZ","source_globs":["wiki/sources/zz-*.md"]}\n');
const outside = path.join(escRoot, 'secret.txt');
write(outside, 'secret\n');
fs.mkdirSync(path.join(escVault, 'wiki', 'sources'), { recursive: true });
fs.symlinkSync(outside, path.join(escVault, 'wiki', 'sources', 'zz-link.md'));
const escReg = path.join(escRoot, 'thin-desks.json');
write(escReg, `${JSON.stringify({ desks: [desk('zz', 'ZZ', 'ZZ')] }, null, 2)}\n`);
let escaped = false;
try {
  deleteDeskBundle({
    registryPath: escReg, slug: 'zz', confirm: 'ZZ', vaultRoot: escVault, ontRoot: escOnt, storeDir: escStore,
  });
} catch (e) {
  escaped = e.code === 'desk_bundle_refused';
}
if (escaped && fs.existsSync(outside) && fs.existsSync(path.join(escVault, 'house-view-zz.md'))
  && fs.readFileSync(outside, 'utf8') === 'secret\n') {
  ok('a symlink out of the vault refuses the whole delete');
} else bad('symlink escape was not refused');

const nestRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-census-nest-'));
const nestVault = path.join(nestRoot, 'vault');
const nestOnt = path.join(nestRoot, 'ont');
const nestStore = path.join(nestOnt, 'store', 'by_ticker');
fs.mkdirSync(nestStore, { recursive: true });
write(path.join(nestVault, 'house-view-zz.md'), 'zz\n');
write(path.join(nestVault, 'raw', 'zz-research', '08-risks-catalysts.md'), 'book\n');
write(path.join(nestOnt, 'packs', 'ZZ.json'), '{"ticker":"ZZ","source_globs":[]}\n');
const nestSecret = path.join(nestRoot, 'secret.txt');
write(nestSecret, 'secret\n');
fs.symlinkSync(nestSecret, path.join(nestVault, 'raw', 'zz-research', 'leak.md'));
const nestReg = path.join(nestRoot, 'thin-desks.json');
write(nestReg, `${JSON.stringify({ desks: [desk('zz', 'ZZ', 'ZZ')] }, null, 2)}\n`);
let nested = false;
try {
  deleteDeskBundle({
    registryPath: nestReg, slug: 'zz', confirm: 'ZZ', vaultRoot: nestVault, ontRoot: nestOnt, storeDir: nestStore,
  });
} catch (e) {
  nested = e.code === 'desk_bundle_refused';
}
if (nested
  && fs.readFileSync(nestSecret, 'utf8') === 'secret\n'
  && fs.existsSync(path.join(nestVault, 'house-view-zz.md'))
  && fs.existsSync(path.join(nestVault, 'raw', 'zz-research', '08-risks-catalysts.md'))
  && fs.readFileSync(nestReg, 'utf8').includes('"slug": "zz"')) {
  ok('a symlink inside the book refuses the delete and leaves the company in place');
} else bad('a nested symlink was followed or the company was partly deleted');

console.log('\ndelete census — empty book and a shared name\n');

const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-census-empty-'));
const emptyVault = path.join(emptyRoot, 'vault');
const emptyOnt = path.join(emptyRoot, 'ont');
const emptyStore = path.join(emptyOnt, 'store', 'by_ticker');
fs.mkdirSync(emptyStore, { recursive: true });
write(path.join(emptyVault, 'house-view-zz.md'), 'zz\n');
const emptyReg = path.join(emptyRoot, 'thin-desks.json');
write(emptyReg, '{ "rooms": ["overview"], "desks": [] }\n');
let emptyCode = '';
try {
  deleteDeskBundle({
    registryPath: emptyReg, slug: 'zz', confirm: 'ZZ', vaultRoot: emptyVault, ontRoot: emptyOnt, storeDir: emptyStore,
  });
} catch (e) {
  emptyCode = e.code || '';
}
if (emptyCode === 'thin_desk_not_found'
  && fs.readFileSync(path.join(emptyVault, 'house-view-zz.md'), 'utf8') === 'zz\n'
  && !fs.existsSync(path.join(emptyVault, 'cockpit', 'trash'))
  && fs.readFileSync(emptyReg, 'utf8').includes('"desks": []')) {
  ok('an empty book refuses the removal and writes nothing');
} else bad(`empty book changed: ${emptyCode}`);

const lapRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-census-lap-'));
const lapVault = path.join(lapRoot, 'vault');
const lapOnt = path.join(lapRoot, 'ont');
const lapStore = path.join(lapOnt, 'store', 'by_ticker');
fs.mkdirSync(lapStore, { recursive: true });
write(path.join(lapVault, 'house-view-zz.md'), 'zz\n');
write(path.join(lapVault, 'house-view-zz-note.md'), 'note\n');
write(path.join(lapVault, 'wiki', 'sources', 'zz-note.md'), 'shared name\n');
write(path.join(lapOnt, 'packs', 'ZZ.json'), '{"ticker":"ZZ","source_globs":[]}\n');
write(path.join(lapOnt, 'packs', 'ZZN.json'), '{"ticker":"ZZN","source_globs":[]}\n');
const lapReg = path.join(lapRoot, 'thin-desks.json');
write(lapReg, `${JSON.stringify({
  desks: [desk('zz', 'ZZ', 'ZZ'), desk('zz-note', 'ZZN', 'ZZN')],
}, null, 2)}\n`);
let lapCode = '';
try {
  deleteDeskBundle({
    registryPath: lapReg, slug: 'zz', confirm: 'ZZ', vaultRoot: lapVault, ontRoot: lapOnt, storeDir: lapStore,
  });
} catch (e) {
  lapCode = e.code || '';
}
if (lapCode === 'desk_bundle_refused'
  && fs.readFileSync(path.join(lapVault, 'wiki', 'sources', 'zz-note.md'), 'utf8') === 'shared name\n'
  && fs.existsSync(path.join(lapVault, 'house-view-zz.md'))
  && fs.existsSync(path.join(lapVault, 'house-view-zz-note.md'))
  && !fs.existsSync(path.join(lapVault, 'cockpit', 'trash'))) {
  ok('two companies that share a filename are both left in place');
} else bad(`shared name was not refused: ${lapCode}`);

const gapRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-census-gap-'));
const gapVault = path.join(gapRoot, 'vault');
const gapOnt = path.join(gapRoot, 'ont');
const gapStore = path.join(gapOnt, 'store', 'by_ticker');
fs.mkdirSync(gapStore, { recursive: true });
write(path.join(gapVault, 'wiki', 'sources', 'zz-extra.md'), 'extra\n');
const omittedFromBundle = unownedCompanyFiles({
  slug: 'zz', ticker: 'ZZ', items: [], vaultRoot: gapVault, ontRoot: gapOnt, storeDir: gapStore,
});
const included = unownedCompanyFiles({
  slug: 'zz', ticker: 'ZZ', items: [{ rel: 'wiki/sources/zz-extra.md' }], vaultRoot: gapVault, ontRoot: gapOnt, storeDir: gapStore,
});
if (omittedFromBundle.includes('wiki/sources/zz-extra.md') && included.length === 0) {
  ok('a source the pack forgot blocks removal until the bundle owns it');
} else bad(`unowned check drifted: omitted=${omittedFromBundle.join(',')} included=${included.join(',')}`);

const strayRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-census-stray-'));
const strayVault = path.join(strayRoot, 'vault');
const strayOnt = path.join(strayRoot, 'ont');
const strayStore = path.join(strayOnt, 'store', 'by_ticker');
fs.mkdirSync(strayStore, { recursive: true });
write(path.join(strayVault, 'house-view-zz.md'), 'zz\n');
write(path.join(strayVault, 'wiki', 'sources', 'zz-extra.md'), 'extra\n');
write(path.join(strayVault, 'cockpit', 'notes', 'ZZ', 'note.md'), 'stray\n');
write(path.join(strayOnt, 'packs', 'ZZ.json'), '{"ticker":"ZZ","source_globs":[]}\n');
const strayReg = path.join(strayRoot, 'thin-desks.json');
write(strayReg, `${JSON.stringify({ desks: [desk('zz', 'ZZ', 'ZZ')] }, null, 2)}\n`);
let strayCode = '';
let strayMsg = '';
try {
  deleteDeskBundle({
    registryPath: strayReg, slug: 'zz', confirm: 'ZZ', vaultRoot: strayVault, ontRoot: strayOnt, storeDir: strayStore,
  });
} catch (e) {
  strayCode = e.code || '';
  strayMsg = e.message || '';
}
if (strayCode === 'desk_bundle_refused'
  && strayMsg.includes('left outside the bundle: cockpit/notes/ZZ')
  && fs.readFileSync(path.join(strayVault, 'house-view-zz.md'), 'utf8') === 'zz\n'
  && fs.readFileSync(path.join(strayVault, 'wiki', 'sources', 'zz-extra.md'), 'utf8') === 'extra\n'
  && fs.readFileSync(path.join(strayVault, 'cockpit', 'notes', 'ZZ', 'note.md'), 'utf8') === 'stray\n'
  && fs.readFileSync(strayReg, 'utf8').includes('"slug": "zz"')) {
  ok('a company-named file outside the bundle refuses the removal and lists the path');
} else bad(`stray file was not refused: ${strayCode} ${strayMsg}`);

const crashRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-census-crash-'));
const crashVault = path.join(crashRoot, 'vault');
const crashOnt = path.join(crashRoot, 'ont');
const crashStore = path.join(crashOnt, 'store', 'by_ticker');
fs.mkdirSync(crashStore, { recursive: true });
write(path.join(crashVault, 'house-view-zz.md'), 'zz\n');
write(path.join(crashVault, 'house-view-yy.md'), 'yy\n');
write(path.join(crashOnt, 'packs', 'ZZ.json'), '{"ticker":"ZZ","source_globs":[]}\n');
write(path.join(crashOnt, 'packs', 'YY.json'), '{"ticker":"YY","source_globs":[]}\n');
const crashReg = path.join(crashRoot, 'thin-desks.json');
write(crashReg, `${JSON.stringify({ desks: [desk('zz', 'ZZ', 'ZZ'), desk('yy', 'YY', 'YY')] }, null, 2)}\n`);
let stopped = '';
try {
  deleteDeskBundle({
    registryPath: crashReg, slug: 'zz', confirm: 'ZZ', vaultRoot: crashVault, ontRoot: crashOnt, storeDir: crashStore,
    stopAfter: 'files',
  });
} catch (e) {
  stopped = e.code || '';
}
const resumed = stopped === 'desk_delete_stopped'
  ? resumeUnfinishedDeletes({
    registryPath: crashReg, vaultRoot: crashVault, ontRoot: crashOnt, storeDir: crashStore,
  })
  : [];
const crashDesks = JSON.parse(fs.readFileSync(crashReg, 'utf8')).desks.map((d) => d.slug);
if (stopped === 'desk_delete_stopped'
  && !fs.existsSync(path.join(crashVault, 'house-view-zz.md'))
  && fs.readFileSync(path.join(crashVault, 'house-view-yy.md'), 'utf8') === 'yy\n'
  && resumed.length === 1 && resumed[0] === 'zz'
  && crashDesks.length === 1 && crashDesks[0] === 'yy'
  && !fs.existsSync(path.join(crashVault, 'cockpit', 'delete-receipts', 'zz.json'))) {
  ok('a crash after the files are gone finishes on the next load');
} else bad(`interrupted removal drifted: stopped=${stopped} desks=${crashDesks.join(',')} resumed=${resumed.join(',')}`);

const oldRoute = fs.readFileSync(path.join(SERVER, 'nbisProposals.js'), 'utf8');
const retired = ['wiki/entities/nebius.md', 'raw/nebius-research', 'house-view-nebius.md'];
let acceptCode = '';
try { acceptProposal('unused'); } catch (e) { acceptCode = e.code || ''; }
if (acceptCode === 'nbis_accept_retired' && retired.every((rel) => !oldRoute.includes(rel))) {
  ok('the old NBIS accept route writes none of the pre-thin paths');
} else bad(`old NBIS accept still writes: ${acceptCode}`);

fs.rmSync(root, { recursive: true, force: true });
fs.rmSync(gapRoot, { recursive: true, force: true });
fs.rmSync(strayRoot, { recursive: true, force: true });
fs.rmSync(crashRoot, { recursive: true, force: true });
fs.rmSync(escRoot, { recursive: true, force: true });
fs.rmSync(nestRoot, { recursive: true, force: true });
fs.rmSync(emptyRoot, { recursive: true, force: true });
fs.rmSync(lapRoot, { recursive: true, force: true });

if (fail) {
  console.log(`\ndesk-delete-census FAIL ${fail}  pass ${pass}`);
  process.exit(1);
}
console.log(`\ndesk-delete-census OK ${pass}`);
