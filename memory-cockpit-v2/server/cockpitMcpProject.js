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
 * Write monorepo-root `.grok/config.toml` so Grok sessions with cwd under this tree
 * use cockpit-research → this vault/store (project scope overrides user-level same name).
 *
 * @param {string} monorepoRoot absolute path to monorepo / kernel root
 * @param {{ nodeBin?: string, mcpScript?: string }} [opts]
 * @returns {{ ok: boolean, path?: string, error?: string }}
 */
export function ensureProjectCockpitMcp(monorepoRoot, opts = {}) {
  const root = path.resolve(String(monorepoRoot || ''));
  if (!root || !fs.existsSync(root)) {
    return { ok: false, error: `monorepo root missing: ${root}` };
  }
  const displayRoot = displayMonorepoRoot(root);

  const glass = path.join(displayRoot, 'memory-cockpit-v2');
  const mcpScript = opts.mcpScript
    || path.join(glass, 'scripts', 'mcp-cockpit-research.mjs');
  if (!fs.existsSync(mcpScript)) {
    return { ok: false, error: `MCP script missing: ${mcpScript}` };
  }

  const vault = process.env.COCKPIT_VAULT || path.join(displayRoot, 'research-wiki');
  const store = process.env.ONTOLOGY_STORE || path.join(displayRoot, 'ontology', 'store', 'by_ticker');
  const ontRoot = process.env.ONTOLOGY_ROOT || path.join(displayRoot, 'ontology');
  const nodeBin = opts.nodeBin || process.execPath;

  // Scenario / pin isolation (multi-cockpit on one Mac)
  let expectRoot = process.env.COCKPIT_EXPECT_ROOT || displayRoot;
  let allowedSlugs = process.env.COCKPIT_ALLOWED_SLUGS || '';
  let scenarioName = process.env.COCKPIT_SCENARIO_NAME || '';
  let agentAccept = process.env.COCKPIT_AGENT_ACCEPT || '';
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
      if (sc.agent_accept === true && !agentAccept) agentAccept = '1';
      if (sc.agent_accept === false && !agentAccept) agentAccept = '0';
    } catch { /* ignore bad scenario file */ }
  }

  const grokDir = path.join(root, '.grok');
  const cfgPath = path.join(grokDir, 'config.toml');
  fs.mkdirSync(grokDir, { recursive: true });

  // TOML with absolute paths (machine-local). Skills call cockpit-research by name.
  const body = `# Auto-written by cockpit (install-grok-mcp / OPEN GROK). Machine-local — do not commit.
# When Grok cwd is this monorepo, project scope overrides user MCP of the same name.
# Ensures list_desks / risk-check hit THIS vault (not another clone on the same Mac).
# COCKPIT_EXPECT_ROOT + COCKPIT_ALLOWED_SLUGS fail-closed multi-scenario pins.

[mcp_servers.cockpit-research]
command = ${tomlStr(nodeBin)}
args = [${tomlStr(mcpScript)}]
enabled = true

[mcp_servers.cockpit-research.env]
COCKPIT_VAULT = ${tomlStr(vault)}
ONTOLOGY_STORE = ${tomlStr(store)}
ONTOLOGY_ROOT = ${tomlStr(ontRoot)}
COCKPIT_EXPECT_ROOT = ${tomlStr(expectRoot)}
${allowedSlugs ? `COCKPIT_ALLOWED_SLUGS = ${tomlStr(allowedSlugs)}\n` : ''}${scenarioName ? `COCKPIT_SCENARIO_NAME = ${tomlStr(scenarioName)}\n` : ''}${agentAccept ? `COCKPIT_AGENT_ACCEPT = ${tomlStr(agentAccept)}\n` : ''}`;

  fs.writeFileSync(cfgPath, body, 'utf8');
  return {
    ok: true,
    path: cfgPath,
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
