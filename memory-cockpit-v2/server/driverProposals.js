/**
 * Drivers proposals — user-named engines. Pending until GO.
 * Writes 09 only. Never writes 08 or the house. Decision-support only.
 *
 * A kept driver is: name, house cite, what is watched, optional why,
 * figures, a dated log (print | news | open | note | house), still-open questions.
 * No status.
 */
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { VAULT_DIR, isInsideVault } from './vault.js';
import { assertVaultWriteMatches } from './writeAssert.js';
import { houseMarkdownStatus } from './houseStance.js';

const PROPOSALS_DIR = path.join(VAULT_DIR, 'cockpit', 'proposals');
const VIAS = new Set(['print', 'news', 'open', 'note', 'house']);
const HEADING_TITLE = /load-bearing|flip trigger|advantaged|exposed|what would change the view|linked register/i;

function storePath(slug) {
  const s = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!s) throw new Error('invalid desk slug');
  return path.join(PROPOSALS_DIR, `drivers-${s}.json`);
}

function ensureDir() {
  if (!fs.existsSync(PROPOSALS_DIR)) fs.mkdirSync(PROPOSALS_DIR, { recursive: true, mode: 0o755 });
  if (!isInsideVault(path.resolve(PROPOSALS_DIR))) throw new Error('proposals dir outside vault');
}

function readStore(slug) {
  ensureDir();
  const fp = storePath(slug);
  if (!fs.existsSync(fp)) return { version: 1, slug, proposals: [] };
  try {
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return { version: 1, slug, proposals: Array.isArray(j.proposals) ? j.proposals : [] };
  } catch {
    return { version: 1, slug, proposals: [] };
  }
}

function writeStore(slug, store) {
  ensureDir();
  const fp = storePath(slug);
  if (!isInsideVault(fp)) throw new Error('refusing write outside vault');
  const tmp = `${fp}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

export function driversSourceRel(slug) {
  return `raw/${String(slug || '').toLowerCase()}-research/09-drivers.md`;
}

function resolveAbs(rel) {
  const r = String(rel || '').replace(/^\/+/, '');
  if (!r || r.includes('..')) throw new Error('invalid drivers source');
  const abs = path.resolve(path.join(VAULT_DIR, r));
  if (!isInsideVault(abs) || !abs.endsWith('.md')) throw new Error('drivers source outside vault');
  return abs;
}

export function readDriversSource(rel) {
  const abs = resolveAbs(rel);
  if (!fs.existsSync(abs)) return { abs, text: '', exists: false };
  return { abs, text: fs.readFileSync(abs, 'utf8'), exists: true };
}

export function saveDriversSource(rel, text) {
  const abs = resolveAbs(rel);
  fs.mkdirSync(path.dirname(abs), { recursive: true });
  const tmp = `${abs}.tmp.${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, abs);
  const actual = fs.readFileSync(abs, 'utf8');
  assertVaultWriteMatches({ expected: text, actual, path: abs, kind: 'drivers' });
  return abs;
}

function norm(s) {
  return String(s || '').toLowerCase().replace(/[`*«»"']/g, '').replace(/\s+/g, ' ').trim();
}

function oneLine(s, max = 800) {
  return String(s || '').replace(/\s+/g, ' ').trim().slice(0, max);
}

function cell(s) {
  return oneLine(s, 800).replace(/\|/g, '/');
}

function slugTitle(title) {
  return String(title || '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48);
}

function driverId(rid, title) {
  return `${String(rid || '').toLowerCase()}-${slugTitle(title)}`.replace(/-$/, '');
}

export function citeInHouse(cite, markdown) {
  const c = norm(cite);
  if (c.length < 8) return false;
  return norm(markdown).includes(c);
}

function assertEngineTitle(title) {
  if (HEADING_TITLE.test(title || '')) {
    throw new Error('that is a house heading, not an engine. Name the side of the business.');
  }
}

function assertCiteOnConfirmedHouse(cite, markdown) {
  if (markdown == null) throw new Error('house markdown required');
  if (houseMarkdownStatus(markdown) !== 'CONFIRMED') {
    throw new Error('House is not CONFIRMED. GO the house first.');
  }
  if (!citeInHouse(cite, markdown)) {
    throw new Error('house_cite is not in the CONFIRMED house. GO house first, then pin.');
  }
}

function field(body, name) {
  const m = String(body || '').match(new RegExp(`\\*\\*${name}:\\*\\*\\s*(.+)`, 'i'));
  return m ? m[1].trim() : '';
}

function splitDriverBody(body) {
  const parts = { head: [], figures: [], log: [], open: [] };
  let mode = 'head';
  for (const ln of String(body || '').split('\n')) {
    const h = ln.match(/^\*\*(Figures|Log|Open)\*\*\s*$/i);
    if (h) {
      mode = h[1].toLowerCase();
      continue;
    }
    parts[mode].push(ln);
  }
  return {
    head: parts.head.join('\n'),
    figures: parts.figures.join('\n'),
    log: parts.log.join('\n'),
    open: parts.open.join('\n'),
  };
}

function parseTable(text) {
  const rows = [];
  for (const ln of String(text || '').split('\n')) {
    const t = ln.trim();
    if (!t.startsWith('|')) continue;
    if (/^\|\s*:?-{3,}/.test(t)) continue;
    const cells = t.split('|').slice(1, -1).map((c) => c.trim());
    if (!cells.length) continue;
    if (/^(item|date|signal)$/i.test(cells[0] || '')) continue;
    rows.push(cells);
  }
  return rows;
}

function parseFigures(text) {
  return parseTable(text)
    .filter((c) => c[0] && c[1])
    .slice(0, 8)
    .map((c) => ({ item: c[0], figure: c[1], note: c[2] || '' }));
}

function parseLog(text) {
  return parseTable(text)
    .filter((c) => c[0] && c[2])
    .map((c) => ({ date: c[0], via: String(c[1] || '').toLowerCase(), fact: c[2] }));
}

function parseOpen(text) {
  return String(text || '').split('\n')
    .map((ln) => (ln.match(/^\s*-\s+(.+)\s*$/) || [])[1] || '')
    .map((s) => s.trim())
    .filter(Boolean);
}

function driverSpans(text) {
  const src = String(text || '');
  const re = /^###\s+(D\d+)\s*[—–-]\s*(.+?)\s*$/gm;
  const matches = [...src.matchAll(re)];
  return matches.map((m, i) => {
    const bodyStart = m.index + m[0].length;
    let end = i + 1 < matches.length ? matches[i + 1].index : src.length;
    const h2 = src.indexOf('\n## ', bodyStart);
    if (h2 !== -1 && h2 < end) end = h2;
    const rid = m[1].toUpperCase();
    const title = m[2].trim();
    return { rid, title, id: driverId(rid, title), start: m.index, bodyStart, end };
  });
}

function findSpan(spans, ref) {
  const w = String(ref || '').trim().toLowerCase();
  if (w.length < 2) throw new Error('driver ref required');
  const exact = spans.filter((s) => w === s.rid.toLowerCase() || w === s.id || w === s.title.toLowerCase());
  const hit = exact.length
    ? exact
    : spans.filter((s) => w.length >= 4 && (s.title.toLowerCase().includes(w) || w.includes(s.title.toLowerCase())));
  if (hit.length !== 1) {
    throw new Error(hit.length ? `driver ref is ambiguous: ${ref}` : `driver not found: ${ref}`);
  }
  return hit[0];
}

function rowFromSpan(text, span) {
  const body = text.slice(span.bodyStart, span.end);
  const parts = splitDriverBody(body);
  const house = field(parts.head, 'House');
  if (!house) return null;
  if (HEADING_TITLE.test(span.title)) return null;
  const watching = field(parts.head, 'Watching');
  const why = field(parts.head, 'Why');
  const figures = parseFigures(parts.figures);
  const log = parseLog(parts.log);
  const open = parseOpen(parts.open);
  const legacyLast = field(parts.head, 'Last');
  const last = log[0]?.fact || legacyLast || '—';
  const checked = log[0]?.date || '';
  return {
    id: span.id,
    rid: span.rid,
    name: span.title,
    house,
    watching,
    why,
    figures,
    log,
    open,
    last,
    checked,
    order: Number(span.rid.replace(/\D/g, '')) || 99,
  };
}

export function parseDriversMarkdown(text) {
  return driverSpans(text)
    .map((span) => rowFromSpan(text, span))
    .filter(Boolean);
}

function figuresTable(rows) {
  let s = '| Item | Figure | Note |\n| --- | --- | --- |\n';
  for (const r of rows) {
    s += `| ${cell(r.item)} | ${cell(r.figure)} | ${cell(r.note || '')} |\n`;
  }
  return s;
}

function logTable(rows) {
  let s = '| Date | Via | Fact |\n| --- | --- | --- |\n';
  for (const r of rows) {
    s += `| ${cell(r.date)} | ${cell(r.via)} | ${cell(r.fact)} |\n`;
  }
  return s;
}

function openList(items) {
  if (!items.length) return '';
  return `${items.map((q) => `- ${oneLine(q, 400)}`).join('\n')}\n`;
}

function cleanHead(head) {
  return String(head || '')
    .split('\n')
    .filter((ln) => !/^\s*-\s+\*\*(Status|Next|Kill|Last):\*\*/i.test(ln))
    .join('\n');
}

function rebuildBody(head, parts) {
  let out = `${cleanHead(head).replace(/\s+$/, '')}\n`;
  if (parts.figures != null) out += `\n**Figures**\n\n${parts.figures.trim()}\n`;
  if (parts.log != null) out += `\n**Log**\n\n${parts.log.trim()}\n`;
  if (parts.open != null) out += `\n**Open**\n\n${String(parts.open || '').trim()}\n`;
  return out.endsWith('\n') ? out : `${out}\n`;
}

function validateLogProposal(p) {
  const fact = oneLine(p.fact || '', 800);
  const open = oneLine(p.open || p.open_question || '', 400);
  const figures = normalizeFigures(p.figures);
  if (!fact && !open && !figures.length) throw new Error('log needs a fact, an open question, or figures');
  let date = '';
  let via = '';
  if (fact) {
    date = String(p.date || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('log date must be YYYY-MM-DD');
    via = String(p.via || '').trim().toLowerCase();
    if (!VIAS.has(via)) throw new Error('via must be print | news | open | note | house');
  }
  if (!String(p.driver || p.driver_ref || '').trim()) throw new Error('driver ref required');
  return { fact, open, figures, date, via };
}

function normalizeFigures(rows) {
  if (!Array.isArray(rows)) return [];
  return rows
    .filter((r) => r && String(r.item || '').trim() && String(r.figure || '').trim())
    .slice(0, 4)
    .map((r) => ({
      item: oneLine(r.item, 80),
      figure: oneLine(r.figure, 80),
      note: oneLine(r.note || '', 160),
    }));
}

function applyLogToText(text, proposal) {
  const fields = validateLogProposal(proposal);
  const ref = proposal.driver || proposal.driver_ref;
  const spans = driverSpans(text);
  const hit = findSpan(spans, ref);
  const body = text.slice(hit.bodyStart, hit.end);
  const parts = splitDriverBody(body);
  const next = {
    figures: parts.figures.trim() ? parts.figures : null,
    log: parts.log.trim() ? parts.log : null,
    open: parts.open.trim() ? parts.open : null,
  };
  if (fields.figures.length) next.figures = figuresTable(fields.figures);
  if (fields.fact) {
    const rows = parseLog(parts.log);
    rows.unshift({ date: fields.date, via: fields.via, fact: fields.fact });
    next.log = logTable(rows);
  }
  if (fields.open) {
    const items = parseOpen(parts.open);
    if (!items.some((q) => norm(q) === norm(fields.open))) items.push(fields.open);
    next.open = openList(items);
  }
  const rebuilt = rebuildBody(parts.head, next);
  return text.slice(0, hit.bodyStart) + rebuilt + text.slice(hit.end);
}

/**
 * Do not emit house TOC (Stance, flip-triggers, load-bearing view, …) as Drivers.
 * Personalization: the human (via Grok) names engines and cites the house.
 */
export const DRIVER_CANDIDATE_HINT =
  'Do not KEEP house headings. Name 2–5 business engines the user wants watched closer, each with a house_cite quote from the CONFIRMED house. Examples: AWS growth and profitability; neocloud demand NVDA is backing; FoA ads mix. Cadence is print, news, or on-demand — not 10-Q only. If the engine is not in the house, STOP — GO house first. Never auto-keep. No status.';

export function listHouseDriverCandidates(_markdown) {
  return [];
}

export function listDriverProposals(slug, { status } = {}) {
  const store = readStore(slug);
  let proposals = store.proposals;
  if (status) proposals = proposals.filter((p) => p.status === status);
  return { ok: true, slug, proposals };
}

export function proposeKeepDriver(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const cite = String(opts.house_cite || opts.houseCite || '').trim();
  if (!cite) throw new Error('house_cite required. If it is not on the house, GO house first.');
  if (opts.status || opts.vs_house || opts.kill) {
    throw new Error('drivers have no status. Pin the engine, then append a log line.');
  }
  const title = String(opts.title || cite.slice(0, 80)).trim();
  assertEngineTitle(title);
  if (opts.houseMarkdown != null) assertCiteOnConfirmedHouse(cite, opts.houseMarkdown);
  const id = `drv-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const p = {
    id,
    kind: 'keep_driver',
    status: 'pending',
    created_at: new Date().toISOString(),
    title,
    house_cite: oneLine(cite, 800),
    watching: oneLine(opts.watching || '', 400),
    why: oneLine(opts.why || '', 1200),
    figures: normalizeFigures(opts.figures),
    candidate_id: opts.candidate_id || opts.candidateId || '',
  };
  const store = readStore(slug);
  store.proposals.push(p);
  writeStore(slug, store);
  return { ok: true, proposal: p };
}

export function proposeSkipDriver(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const cite = String(opts.house_cite || opts.houseCite || '').trim();
  if (!cite) throw new Error('house_cite required');
  const id = `drv-skip-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const p = {
    id,
    kind: 'skip_driver',
    status: 'pending',
    created_at: new Date().toISOString(),
    title: String(opts.title || '').slice(0, 80),
    house_cite: cite.slice(0, 800),
  };
  const store = readStore(slug);
  store.proposals.push(p);
  writeStore(slug, store);
  return { ok: true, proposal: p };
}

export function proposeDriverLog(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const fields = validateLogProposal(opts);
  const ref = String(opts.driver || opts.driver_ref || '').trim();
  const { text, exists } = readDriversSource(driversSourceRel(slug));
  if (!exists) throw new Error(`driver not found: ${ref}`);
  findSpan(driverSpans(text), ref);
  const id = `drv-log-${Date.now().toString(36)}-${crypto.randomBytes(3).toString('hex')}`;
  const p = {
    id,
    kind: 'log_driver',
    status: 'pending',
    created_at: new Date().toISOString(),
    driver: String(opts.driver || opts.driver_ref).trim().slice(0, 120),
    date: fields.date,
    via: fields.via,
    fact: fields.fact,
    open: fields.open,
    figures: fields.figures,
  };
  const store = readStore(slug);
  store.proposals.push(p);
  writeStore(slug, store);
  return { ok: true, proposal: p };
}

export function assertPendingDrivers({ pending, text, houseMarkdown }) {
  let virtual = String(text || '');
  for (const p of pending || []) {
    if (p.kind === 'skip_driver') continue;
    if (p.kind === 'keep_driver') {
      if (!String(p.house_cite || '').trim()) throw new Error('keep_driver missing house_cite');
      assertEngineTitle(p.title);
      assertCiteOnConfirmedHouse(p.house_cite, houseMarkdown);
      const n = (virtual.match(/### D\d+/g) || []).length + 1;
      virtual += `\n### D${n} — ${p.title}\n- **House:** ${p.house_cite}\n`;
      continue;
    }
    if (p.kind === 'log_driver') {
      validateLogProposal(p);
      findSpan(driverSpans(virtual), p.driver);
    }
  }
}

export function acceptDriverProposal(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const id = String(opts.id || '');
  const rel = opts.driversSourceRel || driversSourceRel(slug);
  const store = readStore(slug);
  const p = store.proposals.find((x) => x.id === id);
  if (!p) throw new Error('proposal not found');
  if (p.status !== 'pending') throw new Error(`proposal ${p.status}`);
  if (p.kind === 'skip_driver') {
    p.status = 'accepted';
    p.accepted_at = new Date().toISOString();
    writeStore(slug, store);
    return { ok: true, skipped: true, id };
  }
  const { text, exists } = readDriversSource(rel);
  if (p.kind === 'log_driver') {
    if (!exists) throw new Error('driver not found: no 09');
    const next = applyLogToText(text, p);
    saveDriversSource(rel, next);
    p.status = 'accepted';
    p.accepted_at = new Date().toISOString();
    writeStore(slug, store);
    return { ok: true, id, kind: 'log_driver' };
  }
  if (p.kind !== 'keep_driver') throw new Error('unknown driver proposal kind');
  if (opts.houseMarkdown != null) assertCiteOnConfirmedHouse(p.house_cite, opts.houseMarkdown);
  assertEngineTitle(p.title);
  const n = (text.match(/### D\d+/g) || []).length + 1;
  const block = formatDn(n, p);
  const next = exists && text.trim()
    ? `${text.trimEnd()}\n\n${block}`
    : emptyHeader(slug) + block;
  saveDriversSource(rel, next);
  p.status = 'accepted';
  p.accepted_at = new Date().toISOString();
  p.rid = `D${n}`;
  writeStore(slug, store);
  return { ok: true, id, rid: `D${n}` };
}

export function formatDn(n, p) {
  const title = String(p.title || 'Driver').replace(/^D\d+\s*[—–-]\s*/, '').trim();
  const lines = [
    `### D${n} — ${title}`,
    `- **House:** ${oneLine(p.house_cite, 800)}`,
    `- **Watching:** ${oneLine(p.watching || '', 400)}`,
  ];
  if (String(p.why || '').trim()) lines.push(`- **Why:** ${oneLine(p.why, 1200)}`);
  let block = `${lines.join('\n')}\n`;
  const figs = normalizeFigures(p.figures);
  if (figs.length) block += `\n**Figures**\n\n${figuresTable(figs)}`;
  block += `\n**Log**\n\n${logTable([])}`;
  block += `\n**Open**\n\n`;
  return block;
}

export function emptyHeader(slug) {
  return `# Drivers — ${slug}\n\n**ACCEPTED** · empty is valid. User pins engines. Decision-support only.\n\n`;
}

export function markDriversAcceptedHeader(text) {
  let t = String(text || '');
  if (!t.trim()) t = emptyHeader('desk');
  if (/\*\*ACCEPTED\*\*/.test(t)) return { text: t, changed: false };
  t = t.replace(/\*\*Scaffold only\.\*\*[^\n]*/i, '**ACCEPTED**');
  if (!/\*\*ACCEPTED\*\*/.test(t)) {
    t = t.replace(/^(# Drivers[^\n]*\n)/, '$1\n**ACCEPTED**\n');
  }
  return { text: t, changed: true };
}
