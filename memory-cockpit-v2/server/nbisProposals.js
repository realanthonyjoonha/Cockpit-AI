// nbisProposals.js — Phase 5b propose / accept / reject pin workflow.
// Proposals sit in vault cockpit/proposals/ until accepted.
// Accept writes ONLY allowlisted research-wiki paths (entity Key facts or risks source).
// Never writes house-view or ontology/store. Decision-support only.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { VAULT_DIR, isInsideVault, canonicalize } from './vault.js';

const TICKER = 'NBIS';
const PROPOSALS_DIR = path.join(VAULT_DIR, 'cockpit', 'proposals');
const STORE_FILE = path.join(PROPOSALS_DIR, 'nbis-pending.json');
const ENTITY = path.join(VAULT_DIR, 'wiki', 'entities', 'nebius.md');
const RISKS_SOURCE = path.join(VAULT_DIR, 'raw', 'nebius-research', '08-risks-catalysts.md');
const FACTS_HDR = '## Key facts (timestamped · graded · sourced)';

const CLAIM_LINE_RE = /^-\s+.+\s+\(\d{4}-\d{2}-\d{2}(?:[^)]*)?\)\s+\[[ABC]\]\s+\[\[[^\]]+\]\]\s*$/;

function ensureStore() {
  if (!fs.existsSync(PROPOSALS_DIR)) fs.mkdirSync(PROPOSALS_DIR, { recursive: true, mode: 0o755 });
  if (!fs.existsSync(STORE_FILE)) {
    fs.writeFileSync(STORE_FILE, JSON.stringify({ version: 1, proposals: [] }, null, 2), 'utf8');
  }
}

function readStore() {
  ensureStore();
  try {
    const j = JSON.parse(fs.readFileSync(STORE_FILE, 'utf8'));
    return { version: j.version || 1, proposals: Array.isArray(j.proposals) ? j.proposals : [] };
  } catch {
    return { version: 1, proposals: [] };
  }
}

function writeStore(store) {
  ensureStore();
  const tmp = STORE_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  fs.renameSync(tmp, STORE_FILE);
}

function assertVaultWrite(target) {
  const abs = path.resolve(target);
  if (!isInsideVault(abs)) throw new Error('refusing write outside vault');
  // only allow entity or risks source
  const allowed = [path.resolve(ENTITY), path.resolve(RISKS_SOURCE)];
  if (!allowed.includes(abs)) throw new Error('path not on allowlist for accept');
}

function buildClaimLine({ text, as_of, grade, source_id }) {
  const t = String(text || '').replace(/\s+/g, ' ').trim();
  const d = String(as_of || '').trim();
  const g = String(grade || 'C').toUpperCase();
  const s = String(source_id || 'unsourced').replace(/[\[\]]/g, '').trim();
  if (!t) throw new Error('claim text required');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) throw new Error('as_of must be YYYY-MM-DD');
  if (!/^[ABC]$/.test(g)) throw new Error('grade must be A, B, or C');
  if (!s) throw new Error('source_id required');
  const line = `- ${t} (${d}) [${g}] [[${s}]]`;
  if (!CLAIM_LINE_RE.test(line)) throw new Error('claim line failed format check');
  return line + '\n';
}

function insertClaimIntoEntity(line) {
  assertVaultWrite(ENTITY);
  if (!fs.existsSync(ENTITY)) throw new Error('entity file missing');
  const before = fs.readFileSync(ENTITY, 'utf8');
  const fi = before.indexOf(FACTS_HDR);
  if (fi < 0) throw new Error('entity missing Key facts heading');
  const afterHdr = before.indexOf('\n', fi) + 1;
  const rest = before.slice(afterHdr);
  const firstBullet = rest.search(/^- /m);
  if (firstBullet < 0) throw new Error('no claim bullets under Key facts');
  const insertAt = afterHdr + firstBullet;
  const next = before.slice(0, insertAt) + line + before.slice(insertAt);
  fs.writeFileSync(ENTITY, next, 'utf8');
  return { path: ENTITY, bytes: next.length };
}

function appendRiskNote(text, proposalId) {
  assertVaultWrite(RISKS_SOURCE);
  if (!fs.existsSync(RISKS_SOURCE)) throw new Error('risks source missing');
  const note = String(text || '').trim();
  if (!note) throw new Error('risk_note text required');
  const stamp = new Date().toISOString().slice(0, 10);
  const block = `\n\n## Accepted proposal note (${stamp}) · \`${proposalId}\`\n\n${note}\n`;
  fs.appendFileSync(RISKS_SOURCE, block, 'utf8');
  return { path: RISKS_SOURCE };
}

/**
 * Validate and normalize an incoming proposal body.
 */
export function normalizeProposal(body, createdBy = 'user') {
  const kind = String(body?.kind || 'claim').toLowerCase();
  if (kind === 'house' || kind === 'house_view') {
    throw new Error('house view cannot be proposed via this API — explicit save only');
  }
  if (kind !== 'claim' && kind !== 'risk_note') {
    throw new Error('kind must be claim or risk_note');
  }
  const id = crypto.randomBytes(8).toString('hex');
  const base = {
    id,
    status: 'pending',
    kind,
    ticker: TICKER,
    created_at: new Date().toISOString(),
    created_by: String(createdBy || 'user').slice(0, 64),
    rationale: body?.rationale ? String(body.rationale).slice(0, 2000) : null,
    accepted_at: null,
    rejected_at: null,
    file_written: null,
    error: null,
  };
  if (kind === 'claim') {
    const claim = {
      text: String(body?.text || body?.claim?.text || '').trim(),
      as_of: String(body?.as_of || body?.claim?.as_of || '').trim(),
      grade: String(body?.grade || body?.claim?.grade || 'C').toUpperCase(),
      source_id: String(body?.source_id || body?.claim?.source_id || '').trim(),
    };
    // validate by building line
    buildClaimLine(claim);
    return { ...base, claim };
  }
  const risk_note = { text: String(body?.text || body?.risk_note?.text || '').trim() };
  if (!risk_note.text) throw new Error('risk_note text required');
  return { ...base, risk_note };
}

export function listProposals({ status } = {}) {
  const store = readStore();
  let list = store.proposals.slice().sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
  if (status) list = list.filter((p) => p.status === status);
  return {
    available: true,
    ticker: TICKER,
    store_path: STORE_FILE,
    counts: {
      pending: store.proposals.filter((p) => p.status === 'pending').length,
      accepted: store.proposals.filter((p) => p.status === 'accepted').length,
      rejected: store.proposals.filter((p) => p.status === 'rejected').length,
    },
    proposals: list,
    next_steps_after_accept: [
      'cd ~/Trading/ontology && ./ont compile NBIS',
      'On glass: REFRESH BOOK',
      'Verify Overview / Ask / Risks',
    ],
  };
}

export function createProposal(body, createdBy) {
  const p = normalizeProposal(body, createdBy);
  const store = readStore();
  store.proposals.unshift(p);
  // cap history
  if (store.proposals.length > 200) store.proposals = store.proposals.slice(0, 200);
  writeStore(store);
  return { available: true, proposal: p };
}

export function rejectProposal(id) {
  const store = readStore();
  const p = store.proposals.find((x) => x.id === id);
  if (!p) return null;
  if (p.status !== 'pending') throw new Error(`proposal is ${p.status}, not pending`);
  p.status = 'rejected';
  p.rejected_at = new Date().toISOString();
  writeStore(store);
  return { available: true, proposal: p };
}

export function acceptProposal(id) {
  const store = readStore();
  const p = store.proposals.find((x) => x.id === id);
  if (!p) return null;
  if (p.status !== 'pending') throw new Error(`proposal is ${p.status}, not pending`);

  let written;
  if (p.kind === 'claim') {
    const line = buildClaimLine(p.claim);
    written = insertClaimIntoEntity(line);
  } else if (p.kind === 'risk_note') {
    written = appendRiskNote(p.risk_note?.text, p.id);
  } else {
    throw new Error(`unknown kind ${p.kind}`);
  }

  p.status = 'accepted';
  p.accepted_at = new Date().toISOString();
  p.file_written = written.path;
  writeStore(store);

  return {
    available: true,
    proposal: p,
    file_written: written.path,
    next_steps: [
      'cd ~/Trading/ontology && ./ont compile NBIS',
      'On glass: REFRESH BOOK',
      'Verify Overview / Ask (claims) or Risks (risk notes)',
    ],
    note: 'Files pinned. Compile is still CLI — browser does not compile.',
  };
}
