// houseProposals.js — Agent proposes full house markdown; human accepts on glass.
// MCP may WRITE only the proposals store (cockpit/proposals/house-<slug>.json).
// Accept applies via thinHouseSave (allowlisted vault-root house_file only).
// Never writes ontology/store. Decision-support only.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { VAULT_DIR, isInsideVault, renderMd, fm } from './vault.js';
import { saveHouseMarkdown, readHouseMarkdown, HOUSE_MAX_BYTES } from './thinHouseSave.js';
import { assertVaultWriteMatches } from './writeAssert.js';

const PROPOSALS_DIR = path.join(VAULT_DIR, 'cockpit', 'proposals');

function storePath(slug) {
  const s = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!s) throw new Error('invalid desk slug');
  return path.join(PROPOSALS_DIR, `house-${s}.json`);
}

function ensureDir() {
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

function validateMarkdown(markdown) {
  if (typeof markdown !== 'string') throw new Error('markdown must be a string');
  const bytes = Buffer.byteLength(markdown, 'utf8');
  if (!markdown.trim()) throw new Error('markdown empty');
  if (bytes > HOUSE_MAX_BYTES) throw new Error(`markdown exceeds ${HOUSE_MAX_BYTES} bytes`);
  return bytes;
}

function splitLines(s) {
  return String(s || '').replace(/\r\n/g, '\n').split('\n');
}

function extractStance(body) {
  const t = String(body || '');
  const m = t.match(/\*\*Stance:\*\*\s*([\s\S]+?)(?=\n\n|\n>|\n#|\n\*\*Flip|\nFlip |\n---\s*$|$)/i)
    || t.match(/Stance:\s*"([^"]+)"/)
    || t.match(/stance\s+"([^"]+)"/i);
  if (!m) return null;
  return String(m[1] || '').replace(/\s+/g, ' ').replace(/^"|"$/g, '').trim().slice(0, 800);
}

function parseHouseParts(md) {
  const { meta, body } = fm.parseFrontmatter(String(md || ''));
  return {
    status: meta.status ? String(meta.status).trim() : null,
    updated: meta.updated ? String(meta.updated).trim() : null,
    owner: meta.owner ? String(meta.owner).replace(/\s+/g, ' ').trim().slice(0, 240) : null,
    stance: extractStance(body),
    body: String(body || '').trim(),
  };
}

function clip(s, n = 280) {
  const t = String(s || '').trim();
  if (t.length <= n) return t;
  return `${t.slice(0, n - 1)}…`;
}

/** LCS line diff. Fine for house files (typically well under 800 lines). */
export function diffLines(oldText, newText) {
  const a = splitLines(oldText);
  const b = splitLines(newText);
  const n = a.length;
  const m = b.length;
  if (n + m === 0) return [];
  if (n > 800 || m > 800) {
    return [{ t: 'eq', s: '(draft too large to diff — open raw markdown)' }];
  }
  const dp = Array.from({ length: n + 1 }, () => new Uint16Array(m + 1));
  for (let i = n - 1; i >= 0; i--) {
    for (let j = m - 1; j >= 0; j--) {
      dp[i][j] = a[i] === b[j]
        ? dp[i + 1][j + 1] + 1
        : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }
  const ops = [];
  let i = 0;
  let j = 0;
  while (i < n && j < m) {
    if (a[i] === b[j]) {
      ops.push({ t: 'eq', s: a[i] });
      i += 1;
      j += 1;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ t: 'del', s: a[i] });
      i += 1;
    } else {
      ops.push({ t: 'add', s: b[j] });
      j += 1;
    }
  }
  while (i < n) {
    ops.push({ t: 'del', s: a[i] });
    i += 1;
  }
  while (j < m) {
    ops.push({ t: 'add', s: b[j] });
    j += 1;
  }
  return ops;
}

export function hunksFromOps(ops, context = 2, maxHunkLines = 80) {
  const idx = [];
  for (let k = 0; k < ops.length; k++) {
    if (ops[k].t !== 'eq') idx.push(k);
  }
  if (!idx.length) return [];
  const keep = new Set();
  for (const k of idx) {
    for (let x = Math.max(0, k - context); x <= Math.min(ops.length - 1, k + context); x++) {
      keep.add(x);
    }
  }
  const out = [];
  let gap = false;
  for (let k = 0; k < ops.length && out.length < maxHunkLines; k++) {
    if (!keep.has(k)) {
      gap = true;
      continue;
    }
    if (gap && out.length) out.push({ t: 'gap', s: '…' });
    gap = false;
    out.push(ops[k]);
  }
  if (ops.length > maxHunkLines && idx.length) {
    out.push({ t: 'gap', s: '…' });
  }
  return out;
}

/**
 * Glass review payload: field deltas + body hunks + HTML of proposed body.
 * Current house is compared so the reader is not dumped a YAML wall.
 */
export function reviewHouseProposal(currentMd, proposedMd) {
  const cur = parseHouseParts(currentMd);
  const next = parseHouseParts(proposedMd);
  const fields = [];
  for (const key of ['status', 'updated', 'stance']) {
    const from = cur[key] || '';
    const to = next[key] || '';
    if (from !== to) {
      fields.push({ key, from: clip(from || '—', 420), to: clip(to || '—', 420) });
    }
  }
  const hunks = hunksFromOps(diffLines(cur.body, next.body));
  let html = '';
  try {
    html = renderMd(next.body || '');
  } catch {
    html = '';
  }
  return {
    fields,
    hunks,
    html,
    unchanged: fields.length === 0 && hunks.length === 0,
  };
}

/**
 * Apply exact string replacements to current vault house (fail closed).
 * Each replacement must match exactly once.
 * @param {string} baseMarkdown
 * @param {Array<{ find?: string, old_string?: string, replace?: string, new_string?: string }>} replacements
 * @returns {{ markdown: string, applied: Array<{ find: string, replace: string }> }}
 */
export function applyHouseReplacements(baseMarkdown, replacements) {
  if (!Array.isArray(replacements) || replacements.length === 0) {
    throw new Error('replacements[] required (non-empty)');
  }
  if (replacements.length > 40) {
    throw new Error('too many replacements (max 40)');
  }
  let md = String(baseMarkdown || '');
  if (!md.trim()) throw new Error('base house markdown empty');

  const applied = [];
  for (let i = 0; i < replacements.length; i++) {
    const r = replacements[i] || {};
    const find = String(r.find ?? r.old_string ?? '');
    const replace = String(r.replace ?? r.new_string ?? '');
    if (!find) throw new Error(`replacements[${i}]: find/old_string required`);
    if (find.length > 50_000 || replace.length > 50_000) {
      throw new Error(`replacements[${i}]: string too large`);
    }
    const count = md.split(find).length - 1;
    if (count === 0) {
      throw new Error(
        `replacements[${i}]: find string not found in current house `
        + `(preview: ${JSON.stringify(find.slice(0, 80))}…)`,
      );
    }
    if (count > 1) {
      throw new Error(
        `replacements[${i}]: find string matches ${count} times — must be unique`,
      );
    }
    md = md.replace(find, replace);
    applied.push({ find: find.slice(0, 200), replace: replace.slice(0, 200) });
  }
  if (md === baseMarkdown) {
    throw new Error('replacements produced no change');
  }
  return { markdown: md, applied };
}

/**
 * Efficient propose: load current vault house, apply exact replacements, store proposal.
 * Prefer this over shipping full 10kb+ markdown through the agent.
 * @param {{ slug: string, ticker: string, houseFile: string, replacements: array, rationale?: string, summary?: string, source?: string }} opts
 */
export function proposeHouseFromCurrent(opts) {
  const houseFile = String(opts.houseFile || '');
  const raw = readHouseMarkdown(houseFile);
  if (!raw.exists || !raw.markdown) {
    throw new Error(`vault house missing: ${houseFile}`);
  }
  const { markdown, applied } = applyHouseReplacements(raw.markdown, opts.replacements);
  const out = proposeHouse({
    slug: opts.slug,
    ticker: opts.ticker,
    houseFile,
    markdown,
    rationale: opts.rationale,
    summary: opts.summary,
    source: opts.source || 'agent',
  });
  return {
    ...out,
    mode: 'from_current',
    replacements_applied: applied.length,
    applied,
    note: (out.note || '')
      + ' Built from current vault house via exact replacements (not chat history).',
  };
}

/**
 * Agent (or glass) files a pending house proposal.
 * @param {{ slug: string, ticker: string, houseFile: string, markdown: string, rationale?: string, summary?: string, source?: string }} opts
 */
export function proposeHouse(opts) {
  const slug = String(opts.slug || '').toLowerCase();
  const ticker = String(opts.ticker || '').toUpperCase();
  const houseFile = String(opts.houseFile || '');
  if (!slug || !ticker || !houseFile) throw new Error('slug, ticker, houseFile required');

  const bytes = validateMarkdown(opts.markdown);
  const store = readStore(slug);
  const id = `hp_${Date.now().toString(36)}_${crypto.randomBytes(3).toString('hex')}`;
  const proposal = {
    id,
    kind: 'house_view',
    status: 'pending',
    slug,
    ticker,
    house_file: houseFile,
    markdown: opts.markdown,
    bytes,
    rationale: String(opts.rationale || '').slice(0, 4000),
    summary: String(opts.summary || opts.rationale || 'House draft').slice(0, 400),
    source: String(opts.source || 'agent').slice(0, 80),
    created_at: new Date().toISOString(),
    accepted_at: null,
    rejected_at: null,
  };
  store.proposals.unshift(proposal);
  // keep last 50
  store.proposals = store.proposals.slice(0, 50);
  writeStore(slug, store);

  return {
    ok: true,
    available: true,
    proposal: {
      id: proposal.id,
      status: proposal.status,
      slug,
      ticker,
      house_file: houseFile,
      bytes,
      summary: proposal.summary,
      rationale: proposal.rationale,
      source: proposal.source,
      created_at: proposal.created_at,
    },
    note: 'Proposal stored. House file NOT written. Accept on glass House page to apply.',
    next_steps: [
      `Open glass #/${slug}/house`,
      'Review pending agent proposal → ACCEPT or REJECT',
      'After ACCEPT: COMPILE BOOK → REFRESH',
    ],
    decision_support_only: true,
  };
}

/**
 * List proposals for a desk.
 * @param {string} slug
 * @param {{ status?: string, includeMarkdown?: boolean }} [opts]
 */
export function listHouseProposals(slug, opts = {}) {
  const store = readStore(slug);
  let list = store.proposals.slice();
  if (opts.status) {
    list = list.filter((p) => p.status === opts.status);
  }
  const includeMd = opts.includeMarkdown === true;
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
      status: p.status,
      slug: p.slug,
      ticker: p.ticker,
      house_file: p.house_file,
      bytes: p.bytes,
      summary: p.summary,
      rationale: p.rationale,
      source: p.source,
      created_at: p.created_at,
      accepted_at: p.accepted_at,
      rejected_at: p.rejected_at,
      markdown: includeMd ? p.markdown : undefined,
      markdown_preview: includeMd
        ? undefined
        : String(p.markdown || '').slice(0, 400),
    })),
  };
}

/**
 * @param {string} slug
 * @param {string} id
 * @param {{ includeMarkdown?: boolean }} [opts]
 */
export function getHouseProposal(slug, id, opts = {}) {
  const store = readStore(slug);
  const p = store.proposals.find((x) => x.id === id);
  if (!p) return null;
  let review = null;
  try {
    let current = opts.currentMarkdown;
    if (current == null && p.house_file) {
      const raw = readHouseMarkdown(p.house_file);
      current = raw?.markdown || '';
    }
    review = reviewHouseProposal(current || '', p.markdown || '');
  } catch {
    review = null;
  }
  return {
    available: true,
    proposal: {
      ...p,
      markdown: opts.includeMarkdown === false ? undefined : p.markdown,
      review,
    },
  };
}

/**
 * Human ACCEPT — writes house via allowlisted saveHouseMarkdown.
 * Fail-closed: re-read vault and require body == proposal markdown before
 * marking accepted (catches silent write miss / immediate clobber).
 * @param {string} slug
 * @param {string} id
 * @param {{ houseFile: string }} desk — must match proposal.house_file
 */
export function acceptHouseProposal(slug, id, desk) {
  const store = readStore(slug);
  const p = store.proposals.find((x) => x.id === id);
  if (!p) throw new Error('proposal not found');
  if (p.status !== 'pending') throw new Error(`proposal not pending (status=${p.status})`);
  if (p.house_file !== desk.houseFile) {
    throw new Error('proposal house_file mismatch for this desk');
  }

  const expected = p.markdown;
  if (typeof expected !== 'string' || !expected.trim()) {
    throw new Error('proposal markdown empty — cannot accept');
  }

  // Write first; only mark accepted after readback matches (fail-closed).
  const written = saveHouseMarkdown(desk.houseFile, expected);
  const readback = readHouseMarkdown(desk.houseFile);
  const verify = assertVaultWriteMatches({
    expected,
    actual: readback.exists ? readback.markdown : null,
    path: written.path,
    kind: 'house',
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
      accepted_at: p.accepted_at,
      house_file: p.house_file,
    },
    written: {
      path: written.path,
      bytes: written.bytes,
      saved_at: written.saved_at,
      verified: true,
      sha256: verify.sha256,
      verify_bytes: verify.bytes,
    },
    note: 'House file updated from accepted proposal (readback verified). Run COMPILE BOOK + REFRESH.',
    next_steps: [
      `POST /api/${slug}/compile`,
      `POST /api/${slug}/book/refresh`,
    ],
    decision_support_only: true,
  };
}

/**
 * Human REJECT.
 */
export function rejectHouseProposal(slug, id) {
  const store = readStore(slug);
  const p = store.proposals.find((x) => x.id === id);
  if (!p) throw new Error('proposal not found');
  if (p.status !== 'pending') throw new Error(`proposal not pending (status=${p.status})`);
  p.status = 'rejected';
  p.rejected_at = new Date().toISOString();
  writeStore(slug, store);
  return {
    ok: true,
    available: true,
    proposal: { id: p.id, status: p.status, rejected_at: p.rejected_at },
    note: 'Proposal rejected. House file unchanged.',
  };
}
