// riskProposals.js — Structured risk register proposals (thin desks).
// Propose stores pending only. ACCEPT writes allowlisted risks_source SoR.
// Never writes ontology/store or house. Decision-support only.
// Factory: one module for all slugs; paths from profile risksSourceRel.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { VAULT_DIR, isInsideVault } from './vault.js';
import { assertVaultWriteMatches } from './writeAssert.js';

const PROPOSALS_DIR = path.join(VAULT_DIR, 'cockpit', 'proposals');
const STATUSES = new Set(['INTACT', 'WATCH', 'FIRED']);
const GRADES = new Set(['A', 'B', 'C']);
const MAX_RATIONALE = 4000;
const MAX_NAME = 120;
const MAX_SUMMARY = 400;
const MAX_MECHANISM = 2000;
const MAX_TRIPWIRES = 12;

function storePath(slug) {
  const s = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!s) throw new Error('invalid desk slug');
  return path.join(PROPOSALS_DIR, `risks-${s}.json`);
}

function ensureDir() {
  if (!fs.existsSync(VAULT_DIR)) return;
  if (!fs.existsSync(PROPOSALS_DIR)) {
    fs.mkdirSync(PROPOSALS_DIR, { recursive: true, mode: 0o755 });
  }
  const abs = path.resolve(PROPOSALS_DIR);
  if (!isInsideVault(abs)) throw new Error('proposals dir outside vault');
}

function readStore(slug) {
  ensureDir();
  const fp = storePath(slug);
  if (!fs.existsSync(fp)) {
    return { version: 1, slug, proposals: [] };
  }
  try {
    const j = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return {
      version: j.version || 1,
      slug,
      proposals: Array.isArray(j.proposals) ? j.proposals : [],
    };
  } catch {
    return { version: 1, slug, proposals: [] };
  }
}

function writeStore(slug, store) {
  ensureDir();
  const fp = storePath(slug);
  const abs = path.resolve(fp);
  if (!isInsideVault(abs)) throw new Error('refusing write outside vault');
  if (path.dirname(abs) !== path.resolve(PROPOSALS_DIR)) {
    throw new Error('proposal store must live under cockpit/proposals');
  }
  const tmp = fp + `.tmp.${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, fp);
}

function resolveRisksSourceAbs(risksSourceRel) {
  const rel = String(risksSourceRel || '').replace(/^\/+/, '');
  if (!rel || rel.includes('..')) throw new Error('invalid risksSource path');
  const abs = path.resolve(path.join(VAULT_DIR, rel));
  if (!isInsideVault(abs)) throw new Error('risks source outside vault');
  if (!abs.endsWith('.md')) throw new Error('risks source must be a .md file');
  return abs;
}

export function readRisksSource(risksSourceRel) {
  const abs = resolveRisksSourceAbs(risksSourceRel);
  if (!fs.existsSync(abs)) throw new Error(`risks source missing: ${risksSourceRel}`);
  return { abs, text: fs.readFileSync(abs, 'utf8') };
}

/** Snapshot of one risk section from SoR (for tripwire research). */
export function getSorRiskSnapshot(risksSourceRel, selectors = {}) {
  const { text, abs } = readRisksSource(risksSourceRel);
  const section = findRiskSection(text, selectors);
  const tripwires = parseTripwiresFromSection(section.full);
  const sm = section.full.match(/\*\*Status:\*\*\s*(.+?)(?:\s*·\s*\*\*Grade|\n)/is);
  const status = sm ? parseStatusClause(sm[1]) : null;
  return {
    path: risksSourceRel,
    abs,
    heading: section.heading,
    r_num: section.rNum,
    status,
    tripwires,
    tripwire_count: tripwires.length,
    section_preview: section.full.slice(0, 1200),
  };
}

function writeRisksSource(abs, text) {
  if (!isInsideVault(abs)) throw new Error('refusing write outside vault');
  const tmp = abs + `.tmp.${process.pid}`;
  fs.writeFileSync(tmp, text, 'utf8');
  fs.renameSync(tmp, abs);
}

/**
 * Extract ### Rn section bodies. Returns [{ heading, start, end, body, rNum, title }]
 */
function parseRiskSections(text) {
  const re = /^###\s+(R(\d+)\s*[—–-]\s*.+)$/gm;
  const matches = [];
  let m;
  while ((m = re.exec(text)) !== null) {
    matches.push({
      heading: m[1].trim(),
      rNum: m[2],
      index: m.index,
      headerLen: m[0].length,
    });
  }
  const sections = [];
  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i];
    const start = cur.index;
    let end = i + 1 < matches.length ? matches[i + 1].index : text.length;
    // Cap at next ## section so Rn after B/C (or last risk under A) does not
    // swallow catalysts/claims into the risk body.
    const afterHeader = start + cur.headerLen;
    const nextH2 = text.indexOf('\n## ', afterHeader);
    if (nextH2 !== -1 && nextH2 < end) end = nextH2;
    const full = text.slice(start, end);
    sections.push({
      heading: cur.heading,
      rNum: cur.rNum,
      title: cur.heading,
      start,
      end,
      full,
    });
  }
  return sections;
}

/**
 * Match pack risk id / R3 / name fragment to a dossier section.
 */
export function findRiskSection(text, { riskId, riskName, rNum } = {}) {
  const sections = parseRiskSections(text);
  if (!sections.length) throw new Error('no ### Rn risk sections in SoR');

  const id = String(riskId || '').toLowerCase();
  const name = String(riskName || '').trim();
  const rn = rNum != null ? String(rNum) : (id.match(/-r(\d+)-/) || [])[1];

  if (rn) {
    const hit = sections.find((s) => s.rNum === rn);
    if (hit) return hit;
  }
  if (name) {
    const n = name.toLowerCase();
    const hit = sections.find(
      (s) => s.heading.toLowerCase() === n
        || s.heading.toLowerCase().includes(n)
        || n.includes(s.heading.toLowerCase()),
    );
    if (hit) return hit;
  }
  if (id) {
    const m = id.match(/r(\d+)/);
    if (m) {
      const hit = sections.find((s) => s.rNum === m[1]);
      if (hit) return hit;
    }
  }
  throw new Error(
    `risk section not found (risk_id=${riskId || '—'} name=${riskName || '—'})`,
  );
}

/**
 * Normalize tripwire rows for table write.
 */
export function normalizeTripwires(tripwires) {
  if (!Array.isArray(tripwires) || tripwires.length === 0) {
    throw new Error('tripwires[] required (non-empty)');
  }
  if (tripwires.length > MAX_TRIPWIRES) {
    throw new Error(`too many tripwires (max ${MAX_TRIPWIRES})`);
  }
  return tripwires.map((t, i) => {
    const signal = String(t.signal || t.Signal || '').replace(/\|/g, '/').trim().slice(0, 80);
    const tripwire = String(t.tripwire || t.Tripwire || t.tell || '').replace(/\|/g, '/').trim().slice(0, 200);
    const state = String(t.state || t.State || t.current || 'GAP').replace(/\|/g, '/').trim().slice(0, 160);
    const as_of = String(t.as_of || t.asOf || '—').replace(/\|/g, '/').trim().slice(0, 32);
    if (!signal && !tripwire) throw new Error(`tripwires[${i}]: signal or tripwire required`);
    return {
      signal: signal || 'Monitor',
      tripwire: tripwire || '—',
      state: state || 'GAP',
      as_of: as_of || '—',
    };
  });
}

export function formatTripwireTable(tripwires) {
  const rows = normalizeTripwires(tripwires);
  let table = `| Signal | Tripwire | Current state | As-of |\n|--------|----------|---------------|-------|\n`;
  for (const t of rows) {
    table += `| ${t.signal} | ${t.tripwire} | ${t.state} | ${t.as_of} |\n`;
  }
  return table;
}

/**
 * Replace (or append) the tripwire markdown table inside one ### Rn section.
 */
export function applyTripwiresInSection(sectionFull, tripwires) {
  const table = formatTripwireTable(tripwires);
  // Match first markdown table in section (header row with Signal)
  const tableRe = /(?:^|\n)(\|[^\n]*Signal[^\n]*\n\|[\s:|\-]+\n(?:\|[^\n]*\n)*)/i;
  if (tableRe.test(sectionFull)) {
    const next = sectionFull.replace(tableRe, (m, _tbl) => {
      const lead = m.startsWith('\n') ? '\n' : '';
      return `${lead}${table}${table.endsWith('\n') ? '' : '\n'}`;
    });
    if (next === sectionFull) throw new Error('tripwire table replace produced no change');
    return next;
  }
  // No table: append after body
  const trimmed = sectionFull.replace(/\s+$/, '');
  return `${trimmed}\n\n${table}\n`;
}

/**
 * Parse tripwire rows currently in a section (for agent context).
 */
export function parseTripwiresFromSection(sectionFull) {
  const rows = [];
  let inTable = false;
  for (const ln of String(sectionFull || '').split('\n')) {
    if (/^\|\s*Signal\s*\|/i.test(ln)) {
      inTable = true;
      continue;
    }
    if (inTable && /^\|\s*[-:]+/.test(ln)) continue;
    if (inTable && ln.trim().startsWith('|')) {
      const parts = ln.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim());
      if (parts.length >= 2 && !/^-+$/.test(parts[0])) {
        rows.push({
          signal: parts[0] || '',
          tripwire: parts[1] || '',
          state: parts[2] || '',
          as_of: parts[3] || '',
        });
      }
    } else if (inTable && !ln.trim().startsWith('|')) {
      inTable = false;
    }
  }
  return rows;
}

/**
 * Apply primary status token change inside one section.
 * Line shape: - **Status:** INTACT · elevated · **Grade:** ...
 */
export function applyStatusChangeInSection(sectionFull, toStatus) {
  const to = String(toStatus || '').toUpperCase();
  if (!STATUSES.has(to)) throw new Error(`to_status must be INTACT|WATCH|FIRED (got ${toStatus})`);

  const statusLineRe = /^([ \t]*-\s*\*\*Status:\*\*\s*)(INTACT|WATCH|FIRED)(\b.*)$/im;
  if (!statusLineRe.test(sectionFull)) {
    throw new Error('status line not found in risk section (expected - **Status:** INTACT|WATCH|FIRED …)');
  }
  const next = sectionFull.replace(statusLineRe, (_, pre, _from, rest) => `${pre}${to}${rest}`);
  if (next === sectionFull) {
    // same status already
    const cur = sectionFull.match(statusLineRe);
    if (cur && cur[2].toUpperCase() === to) {
      throw new Error(`status already ${to}`);
    }
    throw new Error('status replace produced no change');
  }
  return next;
}

/**
 * @param {{ slug: string, ticker: string, risksSourceRel: string, body: object }} opts
 */
export function proposeRiskStatus(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const ticker = String(opts.ticker || '').toUpperCase();
  const risksSourceRel = opts.risksSourceRel;
  const body = opts.body || {};

  const toStatus = String(body.to_status || body.toStatus || '').toUpperCase();
  if (!STATUSES.has(toStatus)) {
    throw new Error('to_status required: INTACT | WATCH | FIRED');
  }
  const riskId = String(body.risk_id || body.riskId || '').trim();
  const riskName = String(body.risk_name || body.riskName || body.name || '').trim();
  if (!riskId && !riskName) throw new Error('risk_id or risk_name required');

  const fromStatus = body.from_status || body.fromStatus
    ? String(body.from_status || body.fromStatus).toUpperCase()
    : null;
  if (fromStatus && !STATUSES.has(fromStatus)) {
    throw new Error('from_status must be INTACT|WATCH|FIRED if set');
  }

  const rationale = String(body.rationale || body.summary || '').trim().slice(0, MAX_RATIONALE);
  const asOf = String(body.as_of || body.asOf || new Date().toISOString().slice(0, 10)).slice(0, 32);

  // Validate section exists and status line is patchable
  const { text } = readRisksSource(risksSourceRel);
  const section = findRiskSection(text, { riskId, riskName });
  const patched = applyStatusChangeInSection(section.full, toStatus);
  // dry-run only
  void patched;

  const id = `rp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const proposal = {
    id,
    kind: 'status_change',
    status: 'pending',
    slug,
    ticker,
    risks_source: risksSourceRel,
    risk_id: riskId || null,
    risk_name: riskName || section.heading,
    r_num: section.rNum,
    section_heading: section.heading,
    from_status: fromStatus,
    to_status: toStatus,
    rationale: rationale || null,
    as_of: asOf,
    source: body.source || 'glass',
    created_at: new Date().toISOString(),
    accepted_at: null,
    rejected_at: null,
  };

  const store = readStore(slug);
  store.proposals.unshift(proposal);
  writeStore(slug, store);

  return {
    ok: true,
    available: true,
    proposal: {
      id: proposal.id,
      status: proposal.status,
      kind: proposal.kind,
      risk_name: proposal.risk_name,
      from_status: proposal.from_status,
      to_status: proposal.to_status,
      as_of: proposal.as_of,
      created_at: proposal.created_at,
    },
    note: 'Proposal stored. SoR NOT written until glass ACCEPT. Then COMPILE BOOK → REFRESH.',
    decision_support_only: true,
  };
}

/**
 * Next Rn number from SoR sections (max + 1).
 */
export function nextRiskNumber(text) {
  const sections = parseRiskSections(text);
  let max = 0;
  for (const s of sections) {
    const n = parseInt(s.rNum, 10);
    if (Number.isFinite(n) && n > max) max = n;
  }
  return max + 1;
}

/**
 * Build dossier section markdown for a new risk (compile-compatible).
 */
export function buildAddRiskSection({ rNum, title, status, grade, summary, mechanism, tripwires }) {
  const rn = String(rNum).replace(/\D/g, '') || '99';
  const name = String(title || '').trim();
  if (!name) throw new Error('title required');
  const st = String(status || 'WATCH').toUpperCase();
  if (!STATUSES.has(st)) throw new Error('status must be INTACT|WATCH|FIRED');
  const g = String(grade || 'B').toUpperCase();
  if (!GRADES.has(g)) throw new Error('grade must be A|B|C');
  const sum = String(summary || '').replace(/\s+/g, ' ').trim().slice(0, MAX_SUMMARY);
  const mech = String(mechanism || sum || name).replace(/\s+/g, ' ').trim().slice(0, MAX_MECHANISM);
  if (!sum && !mech) throw new Error('summary or mechanism required');

  let table;
  try {
    table = formatTripwireTable(tripwires);
  } catch {
    table = formatTripwireTable([
      { signal: 'Monitor', tripwire: 'First concrete tell', state: 'GAP', as_of: '—' },
    ]);
  }

  return (
    `### R${rn} — ${name}\n`
    + `- **Status:** ${st} · **Grade:** [${g}] · ${sum || mech.slice(0, 160)}\n`
    + `- **Mechanism:** ${mech}\n\n`
    + `${table}\n`
  );
}

/**
 * Propose replace/set tripwires for an existing risk (pending only).
 */
export function proposeRiskTripwires(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const ticker = String(opts.ticker || '').toUpperCase();
  const risksSourceRel = opts.risksSourceRel;
  const body = opts.body || {};

  const riskId = String(body.risk_id || body.riskId || '').trim();
  const riskName = String(body.risk_name || body.riskName || body.name || '').trim();
  if (!riskId && !riskName) throw new Error('risk_id or risk_name required');

  const tripwires = normalizeTripwires(body.tripwires);
  const rationale = String(body.rationale || '').trim().slice(0, MAX_RATIONALE);
  const asOf = String(body.as_of || body.asOf || new Date().toISOString().slice(0, 10)).slice(0, 32);
  const mode = String(body.mode || 'replace').toLowerCase(); // replace | merge later

  const { text } = readRisksSource(risksSourceRel);
  const section = findRiskSection(text, { riskId, riskName });
  const prior = parseTripwiresFromSection(section.full);
  const patched = applyTripwiresInSection(section.full, tripwires);
  if (patched === section.full) throw new Error('tripwires unchanged');

  const id = `rp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const proposal = {
    id,
    kind: 'set_tripwires',
    status: 'pending',
    slug,
    ticker,
    risks_source: risksSourceRel,
    risk_id: riskId || null,
    risk_name: riskName || section.heading,
    r_num: section.rNum,
    section_heading: section.heading,
    tripwires,
    prior_tripwires: prior,
    mode,
    from_status: null,
    to_status: null,
    rationale: rationale || null,
    as_of: asOf,
    source: body.source || 'agent',
    created_at: new Date().toISOString(),
    accepted_at: null,
    rejected_at: null,
  };

  const store = readStore(slug);
  store.proposals.unshift(proposal);
  writeStore(slug, store);

  return {
    ok: true,
    available: true,
    proposal: {
      id: proposal.id,
      status: proposal.status,
      kind: proposal.kind,
      risk_name: proposal.risk_name,
      r_num: proposal.r_num,
      tripwire_count: tripwires.length,
      prior_count: prior.length,
      as_of: proposal.as_of,
      created_at: proposal.created_at,
    },
    preview_tripwires: tripwires,
    prior_tripwires: prior,
    note: 'set_tripwires pending. SoR NOT written until glass ACCEPT. User should confirm which monitors matter.',
    glass: `http://127.0.0.1:4681/#/${slug}/risks`,
    decision_support_only: true,
  };
}

/**
 * Insert new section after last ### Rn block (before ## B) if present).
 */
export function insertRiskSection(text, sectionMarkdown) {
  // Always insert before ## B) (catalyst section) when present — last ### Rn
  // may sit after B/C if a prior bug appended at EOF; never grow past section A.
  const block = sectionMarkdown.endsWith('\n') ? sectionMarkdown : `${sectionMarkdown}\n`;
  const b = text.search(/\n##\s+B\)/i);
  if (b >= 0) return text.slice(0, b + 1) + block + text.slice(b + 1);
  const sections = parseRiskSections(text);
  if (sections.length === 0) {
    return `${text.trimEnd()}\n\n${block}`;
  }
  const last = sections[sections.length - 1];
  return text.slice(0, last.end) + block + text.slice(last.end);
}

/**
 * Propose a new risk for the register (pending only).
 * @param {{ slug, ticker, risksSourceRel, body }} opts
 */
export function proposeAddRisk(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const ticker = String(opts.ticker || '').toUpperCase();
  const risksSourceRel = opts.risksSourceRel;
  const body = opts.body || {};

  const title = String(body.title || body.name || body.risk_name || '').trim().slice(0, MAX_NAME);
  if (!title) throw new Error('title/name required (short risk name without Rn prefix ok)');
  // strip leading "R12 — " if agent included it
  const cleanTitle = title.replace(/^R\d+\s*[—–-]\s*/i, '').trim();
  if (!cleanTitle) throw new Error('title empty after stripping Rn prefix');

  const status = String(body.status || body.to_status || 'WATCH').toUpperCase();
  if (!STATUSES.has(status)) throw new Error('status must be INTACT|WATCH|FIRED');
  const grade = String(body.grade || 'B').toUpperCase();
  if (!GRADES.has(grade)) throw new Error('grade must be A|B|C');

  const summary = String(body.summary || '').trim().slice(0, MAX_SUMMARY);
  const mechanism = String(body.mechanism || body.text || '').trim().slice(0, MAX_MECHANISM);
  if (!summary && !mechanism) throw new Error('summary or mechanism required');

  const tripwires = Array.isArray(body.tripwires) ? body.tripwires : [];
  const rationale = String(body.rationale || '').trim().slice(0, MAX_RATIONALE);
  const asOf = String(body.as_of || body.asOf || new Date().toISOString().slice(0, 10)).slice(0, 32);

  const { text } = readRisksSource(risksSourceRel);
  // reject duplicate titles
  const existing = parseRiskSections(text);
  const lower = cleanTitle.toLowerCase();
  if (existing.some((s) => s.heading.toLowerCase().includes(lower) || lower.includes(s.heading.replace(/^R\d+\s*[—–-]\s*/i, '').toLowerCase()))) {
    throw new Error(`similar risk title already in SoR: ${cleanTitle}`);
  }

  const rNum = body.r_num != null ? String(body.r_num).replace(/\D/g, '') : String(nextRiskNumber(text));
  if (existing.some((s) => s.rNum === rNum)) {
    throw new Error(`R${rNum} already exists — omit r_num to auto-assign`);
  }

  const section_markdown = buildAddRiskSection({
    rNum,
    title: cleanTitle,
    status,
    grade,
    summary: summary || mechanism.slice(0, 160),
    mechanism: mechanism || summary,
    tripwires,
  });
  // dry-run insert
  const preview = insertRiskSection(text, section_markdown);
  if (preview.length < text.length) throw new Error('insert preview failed');

  const heading = `R${rNum} — ${cleanTitle}`;
  const id = `rp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const proposal = {
    id,
    kind: 'add_risk',
    status: 'pending',
    slug,
    ticker,
    risks_source: risksSourceRel,
    risk_id: null,
    risk_name: heading,
    r_num: rNum,
    section_heading: heading,
    title: cleanTitle,
    to_status: status,
    grade,
    summary: summary || mechanism.slice(0, 160),
    mechanism: mechanism || summary,
    tripwires,
    section_markdown,
    from_status: null,
    rationale: rationale || null,
    as_of: asOf,
    source: body.source || 'agent',
    created_at: new Date().toISOString(),
    accepted_at: null,
    rejected_at: null,
  };

  const store = readStore(slug);
  store.proposals.unshift(proposal);
  writeStore(slug, store);

  return {
    ok: true,
    available: true,
    proposal: {
      id: proposal.id,
      status: proposal.status,
      kind: proposal.kind,
      risk_name: proposal.risk_name,
      r_num: proposal.r_num,
      to_status: proposal.to_status,
      grade: proposal.grade,
      as_of: proposal.as_of,
      created_at: proposal.created_at,
    },
    note: 'add_risk pending. SoR NOT written until glass ACCEPT on Risks page. Then COMPILE BOOK.',
    glass: `http://127.0.0.1:4681/#/${slug}/risks`,
    decision_support_only: true,
  };
}

export function listRiskProposals(slug, { status } = {}) {
  const store = readStore(slug);
  let list = store.proposals;
  if (status) list = list.filter((p) => p.status === status);
  return {
    available: true,
    slug,
    counts: {
      pending: store.proposals.filter((p) => p.status === 'pending').length,
      accepted: store.proposals.filter((p) => p.status === 'accepted').length,
      rejected: store.proposals.filter((p) => p.status === 'rejected').length,
    },
    proposals: list.map((p) => ({
      id: p.id,
      kind: p.kind,
      status: p.status,
      risk_id: p.risk_id,
      risk_name: p.risk_name,
      r_num: p.r_num,
      title: p.title || null,
      from_status: p.from_status,
      to_status: p.to_status,
      grade: p.grade || null,
      summary: p.summary || null,
      tripwires: p.tripwires || null,
      prior_tripwires: p.prior_tripwires || null,
      tripwire_count: Array.isArray(p.tripwires) ? p.tripwires.length : null,
      rationale: p.rationale,
      as_of: p.as_of,
      created_at: p.created_at,
      accepted_at: p.accepted_at,
      rejected_at: p.rejected_at,
    })),
    decision_support_only: true,
  };
}

export function getRiskProposal(slug, id) {
  const store = readStore(slug);
  const p = store.proposals.find((x) => x.id === id);
  return p || null;
}

/**
 * @param {{ slug: string, id: string, risksSourceRel: string }} opts
 */
export function acceptRiskProposal(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const id = String(opts.id || '');
  const risksSourceRel = opts.risksSourceRel;

  const store = readStore(slug);
  const p = store.proposals.find((x) => x.id === id);
  if (!p) throw new Error(`proposal not found: ${id}`);
  if (p.status !== 'pending') throw new Error(`proposal is ${p.status}, not pending`);

  const { abs, text } = readRisksSource(risksSourceRel);
  let newText;

  if (p.kind === 'status_change') {
    const section = findRiskSection(text, {
      riskId: p.risk_id,
      riskName: p.risk_name || p.section_heading,
      rNum: p.r_num,
    });

    if (p.from_status) {
      const cur = section.full.match(/\*\*Status:\*\*\s*(INTACT|WATCH|FIRED)/i);
      if (cur && cur[1].toUpperCase() !== p.from_status) {
        throw new Error(
          `SoR status is ${cur[1]}, proposal expected from_status ${p.from_status} — re-propose`,
        );
      }
    }

    const newSection = applyStatusChangeInSection(section.full, p.to_status);
    newText = text.slice(0, section.start) + newSection + text.slice(section.end);
  } else if (p.kind === 'set_tripwires') {
    const section = findRiskSection(text, {
      riskId: p.risk_id,
      riskName: p.risk_name || p.section_heading,
      rNum: p.r_num,
    });
    const tw = p.tripwires || [];
    const newSection = applyTripwiresInSection(section.full, tw);
    newText = text.slice(0, section.start) + newSection + text.slice(section.end);
  } else if (p.kind === 'add_risk') {
    const md = p.section_markdown
      || buildAddRiskSection({
        rNum: p.r_num,
        title: p.title || String(p.risk_name || '').replace(/^R\d+\s*[—–-]\s*/i, ''),
        status: p.to_status || 'WATCH',
        grade: p.grade || 'B',
        summary: p.summary,
        mechanism: p.mechanism,
        tripwires: p.tripwires,
      });
    // re-check number not already present
    let already = false;
    try {
      findRiskSection(text, { rNum: p.r_num });
      already = true;
    } catch (e) {
      if (!/not found/i.test(e.message)) throw e;
    }
    if (already) {
      throw new Error(`R${p.r_num} already exists in SoR — reject and re-propose`);
    }
    newText = insertRiskSection(text, md);
  } else {
    throw new Error(`unsupported kind: ${p.kind}`);
  }

  // Write first; only mark accepted after readback matches (fail-closed).
  writeRisksSource(abs, newText);
  const readback = readRisksSource(risksSourceRel);
  const verify = assertVaultWriteMatches({
    expected: newText,
    actual: readback.text,
    path: abs,
    kind: 'risks_source',
  });

  p.status = 'accepted';
  p.accepted_at = new Date().toISOString();
  writeStore(slug, store);

  return {
    ok: true,
    available: true,
    proposal: {
      id: p.id,
      status: p.status,
      kind: p.kind,
      risk_name: p.risk_name,
      to_status: p.to_status,
      accepted_at: p.accepted_at,
    },
    written: {
      path: risksSourceRel,
      abs,
      verified: true,
      sha256: verify.sha256,
      bytes: verify.bytes,
    },
    next_steps: [
      'COMPILE BOOK on glass (or ./ont compile TICKER)',
      'REFRESH pack',
      'Confirm risk on Risks page',
    ],
    note: 'SoR updated (readback verified). Pack unchanged until COMPILE BOOK (glass ACCEPT may auto-compile).',
    decision_support_only: true,
  };
}

/**
 * Read primary status for each ### Rn section from SoR (authoring truth).
 * Used when pack lags compile after ACCEPT.
 * @returns {Record<string, { rNum: string, heading: string, status: string }>}
 *   keys: `R1`, `R2`, … and full heading
 */
/**
 * Parse primary register status from a status clause (match ontology compile):
 * FIRED wins; WATCH or ELEVATED → WATCH; else INTACT.
 */
export function parseStatusClause(clause) {
  const st = String(clause || '').toUpperCase();
  if (st.includes('FIRED')) return 'FIRED';
  if (st.includes('WATCH') || st.includes('ELEVATED')) return 'WATCH';
  if (st.includes('INTACT')) return 'INTACT';
  return null;
}

export function readSorStatusMap(risksSourceRel) {
  const { text } = readRisksSource(risksSourceRel);
  const sections = parseRiskSections(text);
  const map = {};
  for (const s of sections) {
    // same capture window as ontology/compile/from_nebius_risks.py
    const m = s.full.match(/\*\*Status:\*\*\s*(.+?)(?:\s*·\s*\*\*Grade|\n)/is);
    const status = m ? parseStatusClause(m[1]) : null;
    if (!status) continue;
    const entry = { rNum: s.rNum, heading: s.heading, status };
    map[`R${s.rNum}`] = entry;
    map[s.heading] = entry;
    map[s.heading.toLowerCase()] = entry;
  }
  return map;
}

/**
 * Prefer SoR status when it differs from pack (post-ACCEPT, pre-compile lag).
 * @param {string} packStatus
 * @param {string} riskName e.g. "R1 — …"
 * @param {Record<string, { status: string }>} sorMap
 */
export function resolveDisplayStatus(packStatus, riskName, sorMap) {
  if (!sorMap || !riskName) return { status: packStatus || '—', status_source: 'pack' };
  const rn = String(riskName).match(/^R(\d+)/i);
  const hit = (rn && sorMap[`R${rn[1]}`])
    || sorMap[riskName]
    || sorMap[String(riskName).toLowerCase()];
  if (hit?.status) {
    if (hit.status !== (packStatus || '').toUpperCase()) {
      return { status: hit.status, status_source: 'sor', pack_status: packStatus || null };
    }
    return { status: hit.status, status_source: 'pack' };
  }
  return { status: packStatus || '—', status_source: 'pack' };
}

export function rejectRiskProposal(slug, id) {
  const store = readStore(slug);
  const p = store.proposals.find((x) => x.id === id);
  if (!p) throw new Error(`proposal not found: ${id}`);
  if (p.status !== 'pending') throw new Error(`proposal is ${p.status}, not pending`);
  p.status = 'rejected';
  p.rejected_at = new Date().toISOString();
  writeStore(slug, store);
  return {
    ok: true,
    proposal: { id: p.id, status: p.status, rejected_at: p.rejected_at },
    decision_support_only: true,
  };
}
