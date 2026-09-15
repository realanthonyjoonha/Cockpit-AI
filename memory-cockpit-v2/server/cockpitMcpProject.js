// cockpitMcpProject.js — bind Grok MCP "cockpit-research" to THIS monorepo via project config.
// Product hygiene: fresh users open Grok from glass (cd COCKPIT_REPO) and tools hit the same vault.
// Machine-local absolute paths → write .grok/config.toml (gitignored), not shared product content.
// Decision-support only. Does not invent research.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { displayMonorepoRoot, realpathSafe } from './mcpPinGuard.js';

const GLASS_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

/**
 * MCP server name for this Cockpit instance.
 * Default `cockpit-research` (operate / product). Testing cockpits MUST pass a
 * distinct name (e.g. cockpit-research-dogfood) so they do not overwrite kernel.
 * @param {string} [raw]
 * @returns {string}
 */
export function mcpServerName(raw) {
  const src = raw != null && String(raw).trim()
    ? String(raw)
    : (process.env.COCKPIT_MCP_NAME || 'cockpit-research');
  let s = src.toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '');
  if (!s) s = 'cockpit-research';
  if (s === 'cockpit-research') return s;
  if (s.startsWith('cockpit-research-')) return s;
  return `cockpit-research-${s}`;
}

/**
 * Write monorepo-root `.grok/config.toml` so Grok sessions with cwd under this tree
 * use this instance's MCP → this vault/store (project scope overrides user-level same name).
 *
 * @param {string} monorepoRoot absolute path to monorepo / kernel root
 * @param {{ nodeBin?: string, mcpScript?: string, mcpName?: string }} [opts]
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
export function ensureProjectCockpitMcp(monorepoRoot, opts = {}) {
  const root = path.resolve(String(monorepoRoot || ''));
  if (!root || !fs.existsSync(root)) {
    return { ok: false, error: `monorepo root missing: ${root}` };
  }
  const displayRoot = displayMonorepoRoot(root);

  // Bind MCP script to THIS tree (not displayRoot aliases).
  const glass = path.join(root, 'memory-cockpit-v2');
  const mcpScript = opts.mcpScript
    || path.join(glass, 'scripts', 'mcp-cockpit-research.mjs');
  if (!fs.existsSync(mcpScript)) {
    return { ok: false, error: `MCP script missing: ${mcpScript}` };
  }

  let vault = process.env.COCKPIT_VAULT || path.join(root, 'research-wiki');
  const store = process.env.ONTOLOGY_STORE || path.join(root, 'ontology', 'store', 'by_ticker');
  const ontRoot = process.env.ONTOLOGY_ROOT || path.join(root, 'ontology');
  const nodeBin = opts.nodeBin || process.execPath;

  // Scenario / pin isolation (multi-cockpit on one Mac).
  // Read mcp_name BEFORE naming the server so OPEN GROK from a testing
  // cockpit cannot rewrite [mcp_servers.cockpit-research] over kernel.
  let expectRoot = process.env.COCKPIT_EXPECT_ROOT || displayRoot;
  let allowedSlugs = process.env.COCKPIT_ALLOWED_SLUGS || '';
  let scenarioName = process.env.COCKPIT_SCENARIO_NAME || '';
  let agentAccept = process.env.COCKPIT_AGENT_ACCEPT || '';
  let scenarioMcpName = '';
  let testingCockpit = false;
  const scenarioPath = path.join(root, '.cockpit-scenario.json');
  if (fs.existsSync(scenarioPath)) {
    try {
      const sc = JSON.parse(fs.readFileSync(scenarioPath, 'utf8'));
      if (sc.expect_root) expectRoot = String(sc.expect_root);
      if (sc.allowed_slugs != null) {
        allowedSlugs = Array.isArray(sc.allowed_slugs)
          ? sc.allowed_slugs.join(',')
          : String(sc.allowed_slugs);
      }
      if (sc.name) scenarioName = String(sc.name);
      if (sc.mcp_name) scenarioMcpName = String(sc.mcp_name).trim();
      if (sc.mode === 'testing-cockpit') testingCockpit = true;
      if (sc.agent_accept === true && !agentAccept) agentAccept = '1';
      if (sc.agent_accept === false && !agentAccept) agentAccept = '0';
    } catch { /* ignore bad scenario file */ }
  }

  const rawName = (opts.mcpName != null && String(opts.mcpName).trim())
    ? String(opts.mcpName)
    : (scenarioMcpName || process.env.COCKPIT_MCP_NAME || 'cockpit-research');
  const serverName = mcpServerName(rawName);
  if (testingCockpit && serverName === 'cockpit-research') {
    return { ok: false, error: 'testing cockpit must not pin mcp_servers.cockpit-research' };
  }
  if (testingCockpit) {
    const inTree = path.join(root, 'research-wiki');
    try {
      if (fs.lstatSync(inTree).isSymbolicLink()) {
        return { ok: false, error: `testing cockpit research-wiki is a symlink: ${inTree}` };
      }
    } catch { /* missing vault is a later glass concern */ }
    vault = inTree;
  }

  const grokDir = path.join(root, '.grok');
  const cfgPath = path.join(grokDir, 'config.toml');
  fs.mkdirSync(grokDir, { recursive: true });

  // TOML with absolute paths (machine-local). Testing cockpits use a distinct
  // mcp_servers.<name> so they never overwrite kernel's cockpit-research pin.
  const body = `# Auto-written by cockpit (install-grok-mcp / OPEN GROK / dogfood-up). Machine-local — do not commit.
# When Grok cwd is this monorepo, project scope overrides user MCP of the same name.
# Unique COCKPIT_MCP_NAME (default cockpit-research) keeps testing cockpits from colliding.
# COCKPIT_EXPECT_ROOT + COCKPIT_ALLOWED_SLUGS fail-closed multi-scenario pins.

[mcp_servers.${serverName}]
command = ${tomlStr(nodeBin)}
args = [${tomlStr(mcpScript)}]
enabled = true

[mcp_servers.${serverName}.env]
COCKPIT_VAULT = ${tomlStr(vault)}
ONTOLOGY_STORE = ${tomlStr(store)}
ONTOLOGY_ROOT = ${tomlStr(ontRoot)}
COCKPIT_EXPECT_ROOT = ${tomlStr(expectRoot)}
COCKPIT_MCP_NAME = ${tomlStr(serverName)}
${allowedSlugs ? `COCKPIT_ALLOWED_SLUGS = ${tomlStr(allowedSlugs)}\n` : ''}${scenarioName ? `COCKPIT_SCENARIO_NAME = ${tomlStr(scenarioName)}\n` : ''}${agentAccept ? `COCKPIT_AGENT_ACCEPT = ${tomlStr(agentAccept)}\n` : ''}`;

  fs.writeFileSync(cfgPath, body, 'utf8');
  return {
    ok: true,
    path: cfgPath,
    mcp_name: serverName,
    monorepo_root: displayRoot,
    monorepo_real: realpathSafe(root),
    vault,
    store,
    expect_root: expectRoot,
    allowed_slugs: allowedSlugs || null,
    scenario: scenarioName || null,
    agent_accept: agentAccept || null,
  };
}

function tomlStr(s) {
  return JSON.stringify(String(s));
}

/** Default glass root (for unit-ish checks). */
export function glassRoot() {
  return GLASS_ROOT;
}
