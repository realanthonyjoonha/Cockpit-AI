/**
 * GO in Grok writes vault via the same path as glass ACCEPT.
 * Not kernel agent_accept. Requires a pending proposal + GO utterance.
 * SAVE DRAFT and EDIT must not call this. Decision-support only.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import { VAULT_DIR, isInsideVault } from './vault.js';
import {
  getHouseProposal,
  acceptHouseProposal,
} from './houseProposals.js';
import {
  listRiskProposals,
  acceptRiskProposal,
  readRisksSource,
  saveRisksSource,
} from './riskProposals.js';
import {
  houseMarkdownStatus,
  isScaffoldHouseMarkdown,
} from './houseStance.js';
import { readHouseMarkdown } from './thinHouseSave.js';
import {
  isGoUtterance,
  assertGoUtterance,
} from './houseUtterance.js';

export { isGoUtterance, assertGoUtterance };

export function sessionFile(slug) {
  const s = String(slug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!s) throw new Error('invalid slug');
  return path.join(VAULT_DIR, 'cockpit', 'session', `${s}.json`);
}

export function readSession(slug) {
  const fp = sessionFile(slug);
  if (!fs.existsSync(fp)) {
    return { version: 1, slug: String(slug || '').toLowerCase(), phase: 'RESEARCHING' };
  }
  try {
    return JSON.parse(fs.readFileSync(fp, 'utf8'));
  } catch {
    return { version: 1, slug: String(slug || '').toLowerCase(), phase: 'RESEARCHING' };
  }
}

export function stampSession(slug, patch) {
  const cur = readSession(slug);
  const next = {
    ...cur,
    ...patch,
    slug: String(slug || '').toLowerCase(),
    updated_at: new Date().toISOString(),
  };
  const fp = sessionFile(slug);
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  if (!isInsideVault(fp)) throw new Error('session outside vault');
  fs.writeFileSync(fp, JSON.stringify(next, null, 2), 'utf8');
  return next;
}

export function appendGoCommitAudit(entry) {
  const dir = path.join(VAULT_DIR, 'cockpit');
  fs.mkdirSync(dir, { recursive: true });
  const fp = path.join(dir, 'go-commit-log.jsonl');
  if (!isInsideVault(fp)) throw new Error('audit outside vault');
  fs.appendFileSync(fp, `${JSON.stringify({ at: new Date().toISOString(), ...entry })}\n`);
  return fp;
}

function snapshotRel(rel, slug, kind) {
  const src = path.resolve(VAULT_DIR, rel);
  if (!fs.existsSync(src)) return null;
  if (!isInsideVault(src)) throw new Error('snapshot source outside vault');
  const dir = path.join(VAULT_DIR, 'cockpit', 'history');
  fs.mkdirSync(dir, { recursive: true });
  const iso = new Date().toISOString().replace(/[:.]/g, '-');
  const dest = path.join(dir, `${kind}-${slug}.${iso}.md`);
  if (!isInsideVault(dest)) throw new Error('history outside vault');
  fs.copyFileSync(src, dest);
  return path.relative(VAULT_DIR, dest);
}

export function markRegisterAcceptedHeader(md, when = new Date()) {
  const day = when.toISOString().slice(0, 10);
  const t = String(md || '');
  if (/\*\*Status:\*\*\s*\*\*ACCEPTED\b/i.test(t) || /\*\*ACCEPTED\*\*\s+\d{4}/i.test(t)) {
    return { text: t, changed: false };
  }
  const line = `**Status:** **ACCEPTED** ${day} — GO in Grok`;
  if (/\*\*Status:\*\*[^\n]*/i.test(t)) {
    return { text: t.replace(/\*\*Status:\*\*[^\n]*/i, line), changed: true };
  }
  const m = t.match(/^#.*$/m);
  if (m) {
    const idx = t.indexOf(m[0]) + m[0].length;
    return { text: `${t.slice(0, idx)}\n\n${line}\n${t.slice(idx)}`, changed: true };
  }
  return { text: `${line}\n\n${t}`, changed: true };
}

function tryOntCompile(ticker) {
  if (process.env.COCKPIT_GO_COMMIT_NO_COMPILE === '1') {
    return { ran: false, reason: 'COCKPIT_GO_COMMIT_NO_COMPILE' };
  }
  const t = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!t) return { ran: false, reason: 'no ticker' };
  const ontRoot = process.env.ONTOLOGY_ROOT
    || path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'ontology');
  const ont = path.join(ontRoot, 'ont');
  if (!fs.existsSync(ont)) return { ran: false, reason: 'ont missing' };
  const r = spawnSync(ont, ['compile', t], {
    encoding: 'utf8',
    cwd: ontRoot,
    timeout: 120_000,
    env: { ...process.env },
  });
  return {
    ran: true,
    ok: r.status === 0,
    status: r.status,
    error: r.status === 0 ? null : String(r.stderr || r.stdout || '').slice(0, 400),
  };
}

/**
 * Write live house from a pending CONFIRMED proposal.
 * @param {{ slug: string, proposalId: string, houseFile: string, utterance: string, ticker?: string, compile?: boolean }} opts
 */
export function goCommitHouse(opts = {}) {
  const slug = String(opts.slug || '').toLowerCase();
  const proposalId = String(opts.proposalId || opts.proposal_id || '').trim();
  const houseFile = String(opts.houseFile || `house-view-${slug}.md`);
  assertGoUtterance(opts.utterance);
  if (!slug) throw new Error('slug required');
  if (!proposalId) {
    throw new Error('proposal_id required — commit the pending CONFIRMED proposal; do not pass raw markdown');
  }

  const got = getHouseProposal(slug, proposalId, { includeMarkdown: true });
  if (!got?.proposal) throw new Error(`proposal not found: ${proposalId}`);
  const p = got.proposal;
  if (p.status !== 'pending') throw new Error(`proposal not pending (status=${p.status})`);
  const will = p.will_write || houseMarkdownStatus(p.markdown);
  if (will !== 'CONFIRMED') {
    throw new Error(
      'GO commit requires will_write CONFIRMED (FORMING is never a glass proposal; leftover FORMING cannot commit)',
    );
  }
  if (isScaffoldHouseMarkdown(p.markdown || '')) {
    throw new Error('refuse scaffold GO commit');
  }

  const snapshot = snapshotRel(houseFile, slug, 'house');
  const written = acceptHouseProposal(slug, proposalId, { houseFile });
  const compile = opts.compile === false
    ? { ran: false, reason: 'compile false' }
    : tryOntCompile(opts.ticker || p.ticker);
  const session = stampSession(slug, {
    phase: 'HOUSE_COMMITTED',
    house_proposal_id: proposalId,
    house_committed_at: new Date().toISOString(),
    house_snapshot: snapshot,
    compile,
  });
  const audit = appendGoCommitAudit({
    kind: 'house',
    slug,
    proposal_id: proposalId,
    utterance: String(opts.utterance || '').slice(0, 80),
    snapshot,
    written_path: written.written?.path,
    compile_ran: !!compile.ran,
  });
  const live = readHouseMarkdown(houseFile);
  return {
    ok: true,
    available: true,
    kind: 'house',
    slug,
    proposal_id: proposalId,
    will_write: 'CONFIRMED',
    written: written.written,
    live_status: houseMarkdownStatus(live.markdown),
    snapshot,
    session,
    audit_log: audit,
    compile,
    note: 'House written from GO (same path as glass ACCEPT). Glass ACCEPT was not required.',
    next_steps: [
      'Stay in this Grok terminal — dump full 08, then GO to commit_on_go kind=register',
      compile.ran && compile.ok ? 'Pack compiled' : `COMPILE BOOK if pack lags (#/${slug}/house)`,
    ],
    decision_support_only: true,
  };
}

/**
 * Apply pending risk chips + mark 08 ACCEPTED. House live file must already be CONFIRMED.
 * @param {{ slug: string, houseFile?: string, risksSourceRel: string, utterance: string, proposalIds?: string[], ticker?: string, compile?: boolean }} opts
 */
export function goCommitRegister(opts = {}) {
  const slug = String(opts.slug || '').toLowerCase();
  const houseFile = String(opts.houseFile || `house-view-${slug}.md`);
  const risksSourceRel = String(opts.risksSourceRel || `raw/${slug}-research/08-risks-catalysts.md`);
  assertGoUtterance(opts.utterance);
  if (!slug) throw new Error('slug required');

  const liveHouse = readHouseMarkdown(houseFile);
  if (houseMarkdownStatus(liveHouse.markdown) !== 'CONFIRMED') {
    throw new Error('House is not CONFIRMED. GO the house first (commit_on_go kind=house).');
  }

  const { text: eight } = readRisksSource(risksSourceRel);
  const heads = eight.match(/### R\d+/g) || [];
  const listed = Array.isArray(opts.proposalIds || opts.proposal_ids)
    ? (opts.proposalIds || opts.proposal_ids).map(String)
    : null;
  const pending = listRiskProposals(slug, { status: 'pending' }).proposals
    .filter((p) => !listed || listed.includes(p.id));

  if (heads.length < 4 && pending.length < 4) {
    throw new Error('08 is thin and there are not enough pending add_risk chips. Dump full 08, propose, then GO.');
  }

  const snapshot = snapshotRel(risksSourceRel, slug, 'register');
  const applied = [];
  const skipped = [];
  for (const p of pending) {
    try {
      const out = acceptRiskProposal({
        slug,
        id: p.id,
        risksSourceRel,
      });
      applied.push({ id: p.id, kind: p.kind, status: 'accepted' });
      if (!out?.ok && out?.error) skipped.push({ id: p.id, error: out.error });
    } catch (e) {
      const msg = e.message || String(e);
      if (/already exists/i.test(msg)) {
        skipped.push({ id: p.id, error: 'already in SoR' });
        continue;
      }
      throw e;
    }
  }

  const after = readRisksSource(risksSourceRel);
  const marked = markRegisterAcceptedHeader(after.text);
  if (marked.changed) saveRisksSource(risksSourceRel, marked.text);

  const compile = opts.compile === false
    ? { ran: false, reason: 'compile false' }
    : tryOntCompile(opts.ticker);
  const session = stampSession(slug, {
    phase: 'REGISTER_COMMITTED',
    register_committed_at: new Date().toISOString(),
    register_snapshot: snapshot,
    register_applied: applied.map((x) => x.id),
    compile,
  });
  const audit = appendGoCommitAudit({
    kind: 'register',
    slug,
    utterance: String(opts.utterance || '').slice(0, 80),
    snapshot,
    applied: applied.length,
    skipped: skipped.length,
    compile_ran: !!compile.ran,
  });
  return {
    ok: true,
    available: true,
    kind: 'register',
    slug,
    applied,
    skipped,
    header_accepted: true,
    snapshot,
    session,
    audit_log: audit,
    compile,
    note: 'Register written from GO (chips + ACCEPTED header). Glass ACCEPT was not required.',
    next_steps: [
      compile.ran && compile.ok ? 'Pack compiled' : `COMPILE BOOK if pack lags (#/${slug}/risks)`,
      `node scripts/register-closeout.mjs --slug ${slug}`,
    ],
    decision_support_only: true,
  };
}
