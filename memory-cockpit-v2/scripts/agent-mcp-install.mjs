#!/usr/bin/env node
/**
 * Install cockpit-research MCP for agent hosts.
 *
 * Primary:  Grok Build  (`grok mcp add`) → ~/.grok/config.toml
 * Optional: Claude Desktop  (claude_desktop_config.json) when --claude or CLAUDE_MCP=1
 *
 *   npm run agent:mcp-install           # Grok only
 *   npm run agent:mcp-install -- --claude
 *   npm run grok:mcp-install
 *   npm run claude:mcp-install          # Claude Desktop only (future-ready)
 */
import { readFileSync, writeFileSync, existsSync, copyFileSync, mkdirSync } from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';
import { ensureProjectCockpitMcp } from '../server/cockpitMcpProject.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const MONOREPO_ROOT = path.resolve(ROOT, '..');
const MCP_SCRIPT = path.join(ROOT, 'scripts', 'mcp-cockpit-research.mjs');
const SERVER_NAME = 'cockpit-research';

const vault = process.env.COCKPIT_VAULT || path.join(MONOREPO_ROOT, 'research-wiki');
const store = process.env.ONTOLOGY_STORE || path.join(MONOREPO_ROOT, 'ontology', 'store', 'by_ticker');
const ontRoot = process.env.ONTOLOGY_ROOT || path.join(MONOREPO_ROOT, 'ontology');
const nodeBin = process.execPath;

const args = process.argv.slice(2);
const wantClaude = args.includes('--claude') || process.env.CLAUDE_MCP === '1'
  || path.basename(process.argv[1] || '').includes('claude-mcp');
const wantGrok = !args.includes('--claude-only')
  && (args.includes('--grok') || !wantClaude || args.includes('--all')
    || path.basename(process.argv[1] || '').includes('agent-mcp')
    || path.basename(process.argv[1] || '').includes('grok-mcp')
    || (!path.basename(process.argv[1] || '').includes('claude-mcp')));

// Normalize: claude:mcp-install script → Claude only; agent/grok → Grok (and --claude for both)
const scriptBase = path.basename(process.argv[1] || '');
const mode = scriptBase.includes('claude-mcp-install')
  ? 'claude'
  : scriptBase.includes('grok-mcp')
    ? 'grok'
    : args.includes('--claude-only')
      ? 'claude'
      : args.includes('--all') || args.includes('--claude')
        ? 'both'
        : 'grok';

if (!existsSync(MCP_SCRIPT)) {
  console.error('Missing', MCP_SCRIPT);
  process.exit(1);
}

function installGrok() {
  const grok = process.env.GROK_BIN
    || (existsSync(path.join(os.homedir(), '.grok', 'bin', 'grok'))
      ? path.join(os.homedir(), '.grok', 'bin', 'grok')
      : 'grok');

  // Always pin project MCP first (OPEN GROK / cd monorepo → this vault).
  const pin = ensureProjectCockpitMcp(MONOREPO_ROOT, { nodeBin, mcpScript: MCP_SCRIPT });
  if (pin.ok) {
    console.log(`[Grok Build] project MCP pin → ${pin.path}`);
    console.log(`  monorepo: ${pin.monorepo_root}`);
    console.log(`  vault:    ${pin.vault}`);
  } else {
    console.warn(`[Grok Build] project MCP pin failed: ${pin.error}`);
  }

  // User scope so tools work even outside the monorepo; project overrides when cwd is here.
  const scope = args.includes('--project-only') ? 'project' : 'user';
  const cwd = MONOREPO_ROOT;

  if (scope === 'project') {
    console.log('[Grok Build] --project-only: project config written; skipping user mcp add');
    return pin.ok;
  }

  const cmd = [
    'mcp', 'add', SERVER_NAME,
    '-s', 'user',
    '-e', `COCKPIT_VAULT=${vault}`,
    '-e', `ONTOLOGY_STORE=${store}`,
    '-e', `ONTOLOGY_ROOT=${ontRoot}`,
    '--',
    nodeBin,
    MCP_SCRIPT,
  ];

  console.log(`\n[Grok Build] ${grok} ${cmd.join(' ')}`);
  const r = spawnSync(grok, cmd, { cwd, encoding: 'utf8', env: process.env });
  if (r.stdout) process.stdout.write(r.stdout);
  if (r.stderr) process.stderr.write(r.stderr);
  if (r.status !== 0) {
    console.error(`\nGrok MCP install failed (exit ${r.status}). Is Grok Build installed?`);
    console.error('  Install: https://x.ai/cli  or  curl -fsSL https://x.ai/cli/install.sh | bash');
    console.error('  Then:    grok  (login with SuperGrok / X Premium+)');
    // Project pin alone still helps OPEN GROK from this folder
    return pin.ok;
  }
  console.log(`[Grok Build] MCP server "${SERVER_NAME}" installed (scope=user + project pin).`);
  console.log('  Fresh product path: one monorepo folder → install once → OPEN GROK from that glass.');
  console.log('  Tools: list_desks, get_house_view, get_pack_snapshot, get_house_assist_context');
  return true;
}

function installClaudeDesktop() {
  const CONFIG = path.join(
    os.homedir(),
    'Library',
    'Application Support',
    'Claude',
    'claude_desktop_config.json',
  );
  const entry = {
    command: nodeBin,
    args: [MCP_SCRIPT],
    env: {
      COCKPIT_VAULT: vault,
      ONTOLOGY_STORE: store,
      ONTOLOGY_ROOT: ontRoot,
    },
  };

  let cfg = {};
  if (existsSync(CONFIG)) {
    const bak = CONFIG + `.bak-${Date.now()}`;
    copyFileSync(CONFIG, bak);
    console.log('[Claude Desktop] Backup:', bak);
    cfg = JSON.parse(readFileSync(CONFIG, 'utf8'));
  } else {
    mkdirSync(path.dirname(CONFIG), { recursive: true });
  }
  if (!cfg.mcpServers || typeof cfg.mcpServers !== 'object') cfg.mcpServers = {};
  cfg.mcpServers[SERVER_NAME] = entry;
  writeFileSync(CONFIG, JSON.stringify(cfg, null, 2) + '\n', 'utf8');
  console.log(`[Claude Desktop] Wrote mcpServers.${SERVER_NAME} → ${CONFIG}`);
  console.log('  Quit Claude Desktop fully (Cmd+Q) and reopen (future / optional host).');
  return true;
}

console.log('cockpit-research MCP install');
console.log('  script:', MCP_SCRIPT);
console.log('  vault: ', vault);
console.log('  mode:  ', mode);

let ok = true;
if (mode === 'grok' || mode === 'both') {
  ok = installGrok() && ok;
}
if (mode === 'claude' || mode === 'both') {
  ok = installClaudeDesktop() && ok;
}

console.log('\nHouse commit path (all hosts): glass EDIT → SAVE → COMPILE BOOK → REFRESH');
console.log('Decision-support only. MCP tools are read-only.');
process.exit(ok ? 0 : 1);
