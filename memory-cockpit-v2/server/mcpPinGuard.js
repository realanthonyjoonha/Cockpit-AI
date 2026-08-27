// mcpPinGuard.js — fail-closed monorepo / slug pin for cockpit-research MCP.
// Prevents wrong-vault house/risks/pack when multiple Cockpit folders exist on one Mac.
// Decision-support only.
import fs from 'fs';
import os from 'os';
import path from 'path';

/**
 * @param {string} p
 * @returns {string}
 */
export function realpathSafe(p) {
  const abs = path.resolve(String(p || ''));
  try {
    return fs.realpathSync(abs);
  } catch {
    return abs;
  }
}

/**
 * Human-facing monorepo path. Prefer COCKPIT_EXPECT_ROOT / ~/Desktop/cockpit-kernel
 * when they realpath to the same inode as repoRoot. Stops agents treating
 * Trading/cockpit vs Desktop/cockpit-kernel as two products.
 * Pin *comparison* still uses realpathSafe.
 */
export function displayMonorepoRoot(repoRoot, opts = {}) {
  const real = realpathSafe(repoRoot);
  const expect = opts.expectRoot != null ? opts.expectRoot : process.env.COCKPIT_EXPECT_ROOT;
  if (expect && String(expect).trim() && realpathSafe(expect) === real) {
    return path.resolve(String(expect).trim());
  }
  const aliases = Array.isArray(opts.aliases) && opts.aliases.length
    ? opts.aliases
    : [path.join(os.homedir(), 'Desktop', 'cockpit-kernel')];
  for (const a of aliases) {
    if (!a) continue;
    try {
      if (fs.existsSync(a) && realpathSafe(a) === real) return path.resolve(a);
    } catch { /* skip */ }
  }
  return real;
}

/**
 * Load optional monorepo `.cockpit-scenario.json` into process.env if unset.
 * @param {string} repoRoot
 */
export function loadScenarioFileIntoEnv(repoRoot) {
  const p = path.join(realpathSafe(repoRoot), '.cockpit-scenario.json');
  if (!fs.existsSync(p)) return { loaded: false, path: p };
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    if (j.expect_root && !process.env.COCKPIT_EXPECT_ROOT) {
      process.env.COCKPIT_EXPECT_ROOT = String(j.expect_root);
    }
    if (j.allowed_slugs != null && !process.env.COCKPIT_ALLOWED_SLUGS) {
      const slugs = Array.isArray(j.allowed_slugs)
        ? j.allowed_slugs
        : String(j.allowed_slugs).split(/[\s,]+/);
      process.env.COCKPIT_ALLOWED_SLUGS = slugs.filter(Boolean).join(',');
    }
    if (j.name && !process.env.COCKPIT_SCENARIO_NAME) {
      process.env.COCKPIT_SCENARIO_NAME = String(j.name);
    }
    // agent_accept: true in scenario → grant (only if env not already set to 0/false)
    if (j.agent_accept === true && process.env.COCKPIT_AGENT_ACCEPT == null) {
      process.env.COCKPIT_AGENT_ACCEPT = '1';
    }
    if (j.agent_accept === false && process.env.COCKPIT_AGENT_ACCEPT == null) {
      process.env.COCKPIT_AGENT_ACCEPT = '0';
    }
    return { loaded: true, path: p, name: j.name || null, agent_accept: j.agent_accept };
  } catch (e) {
    return { loaded: false, path: p, error: String(e?.message || e) };
  }
}

/**
 * Parse COCKPIT_ALLOWED_SLUGS env (comma/space separated).
 * @returns {Set<string>|null} null if unrestricted
 */
export function allowedSlugSet() {
  const raw = process.env.COCKPIT_ALLOWED_SLUGS;
  if (raw == null || String(raw).trim() === '') return null;
  const set = new Set(
    String(raw)
      .split(/[\s,]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  return set.size ? set : null;
}

/**
 * Assert MCP monorepo root matches COCKPIT_EXPECT_ROOT when set.
 * @param {string} repoRoot
 * @throws {Error}
 */
export function assertExpectRoot(repoRoot) {
  const expect = process.env.COCKPIT_EXPECT_ROOT;
  if (!expect || !String(expect).trim()) return { ok: true, enforced: false };
  const a = realpathSafe(repoRoot);
  const b = realpathSafe(expect);
  if (a !== b) {
    throw new Error(
      `MCP pin mismatch: monorepo_root=${a} but COCKPIT_EXPECT_ROOT=${b}. ` +
        `Wrong Cockpit folder. cd the scenario/product monorepo, run ./scripts/install-grok-mcp.sh, ` +
        `OPEN GROK only from that glass. (scenario=${process.env.COCKPIT_SCENARIO_NAME || 'n/a'})`,
    );
  }
  return { ok: true, enforced: true, monorepo_root: a };
}

/**
 * True if vault is this monorepo's book:
 *   - in-tree (…/research-wiki), or
 *   - sibling …/cockpit-vault (2026-08-20 code/content split).
 * Any other path is contamination (wrong clone, tribal ~/Trading/research-wiki, etc.).
 */
export function vaultBelongsToRepo(repoRoot, vault) {
  if (!vault) return true;
  const root = realpathSafe(repoRoot);
  const v = realpathSafe(vault);
  if (v === root || v.startsWith(root + path.sep)) return true;
  const sibling = realpathSafe(path.join(path.dirname(root), 'cockpit-vault'));
  if (v === sibling || v.startsWith(sibling + path.sep)) return true;
  return false;
}

/**
 * Assert vault is in-tree or sibling cockpit-vault (contamination guard).
 * @param {string} repoRoot
 * @param {string} vault
 */
export function assertVaultUnderRepo(repoRoot, vault) {
  if (!vault) return { ok: true };
  if (vaultBelongsToRepo(repoRoot, vault)) return { ok: true };
  const root = realpathSafe(repoRoot);
  const v = realpathSafe(vault);
  throw new Error(
    `MCP vault not pinned to this monorepo (contamination risk): vault=${v} monorepo=${root}. ` +
      `Allowed: ${path.join(root, 'research-wiki')} or sibling ${path.join(path.dirname(root), 'cockpit-vault')}. ` +
      `Re-install MCP from the correct monorepo.`,
  );
}

/**
 * Assert desk slug is in COCKPIT_ALLOWED_SLUGS when set.
 * @param {string} slug
 */
export function assertDeskAllowed(slug) {
  const set = allowedSlugSet();
  if (!set) return { ok: true, enforced: false };
  const s = String(slug || '').trim().toLowerCase();
  if (!s) return { ok: true, enforced: true };
  if (!set.has(s)) {
    throw new Error(
      `desk "${slug}" not allowed in this scenario. ` +
        `COCKPIT_ALLOWED_SLUGS=${[...set].join(',')}. ` +
        `OPEN GROK from the correct scenario glass or pick an allowed desk.`,
    );
  }
  return { ok: true, enforced: true };
}

/**
 * Full pin check for MCP tool entry.
 * @param {{ repoRoot: string, vault?: string, deskSlug?: string }} opts
 */
export function assertMcpPin(opts = {}) {
  const repoRoot = opts.repoRoot;
  assertExpectRoot(repoRoot);
  assertVaultUnderRepo(repoRoot, opts.vault || process.env.COCKPIT_VAULT || '');
  if (opts.deskSlug) assertDeskAllowed(opts.deskSlug);
  const real = realpathSafe(repoRoot);
  const display = displayMonorepoRoot(repoRoot);
  return {
    ok: true,
    monorepo_root: display,
    monorepo_real: real,
    expect_root: process.env.COCKPIT_EXPECT_ROOT || null,
    allowed_slugs: process.env.COCKPIT_ALLOWED_SLUGS || null,
    scenario: process.env.COCKPIT_SCENARIO_NAME || null,
    agent_accept: isAgentAcceptEnabled(),
    same_tree: display === real ? true : realpathSafe(display) === real,
  };
}

/**
 * Agent may ACCEPT house/risk proposals only when explicitly granted.
 * Grant via: COCKPIT_AGENT_ACCEPT=1|true|yes  OR  .cockpit-scenario.json { "agent_accept": true }
 * Default: false (human glass ACCEPT only).
 */
export function isAgentAcceptEnabled() {
  const e = String(process.env.COCKPIT_AGENT_ACCEPT || '').trim().toLowerCase();
  if (e === '1' || e === 'true' || e === 'yes' || e === 'on') return true;
  return false;
}

/**
 * @throws {Error} if agent accept not granted
 */
export function assertAgentAcceptAllowed(repoRoot) {
  // Reload scenario file in case env was not set at process start
  loadScenarioFileIntoEnv(repoRoot);
  if (isAgentAcceptEnabled()) {
    return {
      ok: true,
      agent_accept: true,
      monorepo_root: realpathSafe(repoRoot),
      scenario: process.env.COCKPIT_SCENARIO_NAME || null,
    };
  }
  throw new Error(
    'Agent ACCEPT denied. House/risks SoR writes require glass ACCEPT unless this monorepo ' +
      'grants agent accept (COCKPIT_AGENT_ACCEPT=1 or .cockpit-scenario.json agent_accept:true). ' +
      'Use scenario-up (agent accept on by default) or explicit grant — never on kernel dogfood by accident.',
  );
}

/**
 * Append audit line under vault cockpit/agent-accept-log.jsonl
 * @param {string} vault
 * @param {object} entry
 */
export function appendAgentAcceptAudit(vault, entry) {
  const dir = path.join(realpathSafe(vault), 'cockpit');
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch { /* ignore */ }
  const logPath = path.join(dir, 'agent-accept-log.jsonl');
  const line = JSON.stringify({
    at: new Date().toISOString(),
    actor: 'agent_accept',
    ...entry,
  }) + '\n';
  fs.appendFileSync(logPath, line, 'utf8');
  return logPath;
}

/**
 * Preamble for OPEN GROK initial prompts when scenario file exists.
 * @param {string} repoRoot
 */
export function scenarioPinPreamble(repoRoot) {
  const root = realpathSafe(repoRoot);
  const p = path.join(root, '.cockpit-scenario.json');
  if (!fs.existsSync(p)) return '';
  let j = {};
  try {
    j = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return '';
  }
  const slugs = Array.isArray(j.allowed_slugs)
    ? j.allowed_slugs.join(', ')
    : String(j.allowed_slugs || '(any in this monorepo)');
  const name = j.name || 'scenario';
  const accept = j.agent_accept === true
    ? 'Agent ACCEPT is ON for this scenario (accept_house_proposal / accept_risk_proposal after propose).'
    : 'Agent ACCEPT is OFF — house/risks need glass ACCEPT unless COCKPIT_AGENT_ACCEPT=1.';
  return (
    `PIN CHECK (required before house/risks/pack tools): Call MCP list_desks first. ` +
    `monorepo_root must be exactly: ${j.expect_root || root}. ` +
    `Scenario: ${name}. Allowed slugs only: ${slugs}. ` +
    `${accept} ` +
    `If list_desks shows another path or foreign tickers — STOP. Do not continue. ` +
    `Re-run install-grok-mcp from this monorepo and OPEN GROK only from this glass.\n\n`
  );
}
