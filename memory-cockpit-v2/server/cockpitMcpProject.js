// cockpitMcpProject.js — bind Grok MCP "cockpit-research" to THIS monorepo via project config.
// Product hygiene: fresh users open Grok from glass (cd COCKPIT_REPO) and tools hit the same vault.
// Machine-local absolute paths → write .grok/config.toml (gitignored), not shared product content.
// Decision-support only. Does not invent research.
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

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

  const glass = path.join(root, 'memory-cockpit-v2');
  const mcpScript = opts.mcpScript
    || path.join(glass, 'scripts', 'mcp-cockpit-research.mjs');
  if (!fs.existsSync(mcpScript)) {
    return { ok: false, error: `MCP script missing: ${mcpScript}` };
  }

  const vault = process.env.COCKPIT_VAULT || path.join(root, 'research-wiki');
  const store = process.env.ONTOLOGY_STORE || path.join(root, 'ontology', 'store', 'by_ticker');
  const ontRoot = process.env.ONTOLOGY_ROOT || path.join(root, 'ontology');
  const nodeBin = opts.nodeBin || process.execPath;

  const grokDir = path.join(root, '.grok');
  const cfgPath = path.join(grokDir, 'config.toml');
  fs.mkdirSync(grokDir, { recursive: true });

  // TOML with absolute paths (machine-local). Skills call cockpit-research by name.
  const body = `# Auto-written by cockpit (install-grok-mcp / OPEN GROK). Machine-local — do not commit.
# When Grok cwd is this monorepo, project scope overrides user MCP of the same name.
# Ensures list_desks / risk-check hit THIS vault (not another clone on the same Mac).

[mcp_servers.cockpit-research]
command = ${tomlStr(nodeBin)}
args = [${tomlStr(mcpScript)}]
enabled = true

[mcp_servers.cockpit-research.env]
COCKPIT_VAULT = ${tomlStr(vault)}
ONTOLOGY_STORE = ${tomlStr(store)}
ONTOLOGY_ROOT = ${tomlStr(ontRoot)}
`;

  fs.writeFileSync(cfgPath, body, 'utf8');
  return { ok: true, path: cfgPath, monorepo_root: root, vault, store };
}

function tomlStr(s) {
  return JSON.stringify(String(s));
}

/** Default glass root (for unit-ish checks). */
export function glassRoot() {
  return GLASS_ROOT;
}
