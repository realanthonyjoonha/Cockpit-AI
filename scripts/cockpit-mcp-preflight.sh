#!/usr/bin/env bash
# Usage: ./scripts/cockpit-mcp-preflight.sh
# Exit non-zero unless cockpit-research starts, tools/list is 24, list_desks pin_ok is true on the sibling vault or in-tree research-wiki, and a /tmp vault copy returns pin_ok false.
set -euo pipefail
[ -n "${BASH_VERSION:-}" ] || { echo "error: bash required" >&2; exit 1; }

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
LAUNCHER="$ROOT/scripts/cursor-kernel-mcp.sh"
SDK="$ROOT/memory-cockpit-v2/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js"
if [ ! -f "$LAUNCHER" ]; then
  echo "FAIL: missing $LAUNCHER" >&2
  exit 1
fi
if [ ! -f "$SDK" ]; then
  echo "FAIL: MCP SDK missing ($SDK). Run: cd memory-cockpit-v2 && npm ci" >&2
  exit 1
fi

export COCKPIT_PREFLIGHT_ROOT="$ROOT"
export COCKPIT_PREFLIGHT_LAUNCHER="$LAUNCHER"
exec node --input-type=module <<'EOF'
import { copyFileSync, existsSync, mkdirSync, realpathSync, rmSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = process.env.COCKPIT_PREFLIGHT_ROOT;
const launcher = process.env.COCKPIT_PREFLIGHT_LAUNCHER;
const sdkClient = path.join(root, 'memory-cockpit-v2/node_modules/@modelcontextprotocol/sdk/dist/esm/client/index.js');
const sdkStdio = path.join(root, 'memory-cockpit-v2/node_modules/@modelcontextprotocol/sdk/dist/esm/client/stdio.js');
const { Client } = await import(pathToFileURL(sdkClient).href);
const { StdioClientTransport } = await import(pathToFileURL(sdkStdio).href);

const STRIP = [
  'COCKPIT_VAULT',
  'ONTOLOGY_WIKI',
  'ONTOLOGY_STORE',
  'ONTOLOGY_ROOT',
  'COCKPIT_REPO',
  'COCKPIT_EXPECT_ROOT',
  'COCKPIT_MCP_NAME',
  'COCKPIT_ALLOWED_SLUGS',
  'COCKPIT_SCENARIO_NAME',
  'COCKPIT_AGENT_ACCEPT',
  'COCKPIT_DOGFOOD',
  'COCKPIT_DOGFOOD_SLUGS',
  'COCKPIT_ENV_QUIET',
];

function baseEnv(extra = {}) {
  const env = { ...process.env };
  for (const key of STRIP) delete env[key];
  return { ...env, ...extra };
}

function real(p) {
  return realpathSync(p);
}

function allowedVaults() {
  const out = [];
  const sibling = path.resolve(root, '..', 'cockpit-vault');
  const inTree = path.join(root, 'research-wiki');
  if (existsSync(sibling)) out.push(real(sibling));
  if (existsSync(inTree)) out.push(real(inTree));
  return out;
}

function toolJson(result) {
  const text = (result?.content || []).find((c) => c.type === 'text')?.text;
  if (!text) throw new Error('tool result missing text content');
  return JSON.parse(text);
}

async function probe(extraEnv) {
  const transport = new StdioClientTransport({
    command: 'bash',
    args: [launcher],
    cwd: root,
    env: baseEnv(extraEnv),
    stderr: 'pipe',
  });
  const stderrChunks = [];
  transport.stderr.on('data', (chunk) => stderrChunks.push(Buffer.from(chunk)));
  const client = new Client({ name: 'cockpit-mcp-preflight', version: '1.0.0' });
  try {
    await client.connect(transport);
    const listed = await client.listTools();
    const desks = await client.callTool({ name: 'list_desks', arguments: {} });
    return {
      listed,
      desks: toolJson(desks),
      stderr: Buffer.concat(stderrChunks).toString('utf8'),
    };
  } catch (err) {
    const stderr = Buffer.concat(stderrChunks).toString('utf8').trim();
    const extra = stderr ? `\nserver stderr:\n${stderr}` : '';
    throw new Error(`${err?.message || err}${extra}`);
  } finally {
    try { await client.close(); } catch { /* already closed */ }
  }
}

const failures = [];
function fail(msg) {
  failures.push(msg);
  console.error(`FAIL: ${msg}`);
}
function pass(msg) {
  console.log(`PASS: ${msg}`);
}

const neg = '/tmp/cockpit-vault-pin-negative';
try {
  rmSync(neg, { recursive: true, force: true });
  const fmSrc = path.resolve(root, '..', 'cockpit-vault', 'cockpit', 'lib', 'fm.js');
  const fmAlt = path.join(root, 'research-wiki', 'cockpit', 'lib', 'fm.js');
  const src = existsSync(fmSrc) ? fmSrc : (existsSync(fmAlt) ? fmAlt : '');
  mkdirSync(path.join(neg, 'cockpit', 'lib'), { recursive: true });
  if (src) copyFileSync(src, path.join(neg, 'cockpit', 'lib', 'fm.js'));

  let positive;
  try {
    positive = await probe({});
    pass('server started');
  } catch (err) {
    fail(`server did not start (${err.message})`);
  }

  let desksBody = null;
  if (positive) {
    const names = (positive.listed?.tools || []).map((t) => t.name);
    const unique = new Set(names);
    if (names.length === 24 && unique.size === 24 && unique.has('list_desks')) {
      pass('tools/list=24');
    } else {
      fail(`tools/list count=${names.length} unique=${unique.size} has_list_desks=${unique.has('list_desks')}`);
    }
    desksBody = positive.desks;
    const allowed = allowedVaults();
    let vaultReal = '';
    try { vaultReal = desksBody?.vault ? real(desksBody.vault) : ''; } catch { vaultReal = ''; }
    const vaultOk = Boolean(vaultReal) && allowed.includes(vaultReal);
    const rootReal = real(root);
    const monoOk = desksBody?.monorepo_root === root || desksBody?.monorepo_real === rootReal;
    if (desksBody?.pin_ok === true && desksBody?.ok === true && vaultOk && monoOk) {
      pass(`list_desks pin_ok=true vault=${vaultReal}`);
    } else {
      fail(`list_desks pin_ok=${desksBody?.pin_ok} ok=${desksBody?.ok} vault=${desksBody?.vault || ''} monorepo_root=${desksBody?.monorepo_root || ''} (allowed vaults: ${allowed.join(', ') || 'none'})`);
    }
    if (positive.stderr.includes('COCKPIT_REPO=')) {
      fail('launcher leaked monorepo-env banner on stderr (stdout channel must stay quiet; banner means COCKPIT_ENV_QUIET was not set before source)');
    }
  }

  let negative;
  try {
    negative = await probe({ COCKPIT_VAULT: neg });
  } catch (err) {
    fail(`/tmp vault probe did not return a tool result (${err.message})`);
  }
  if (negative) {
    const body = negative.desks;
    if (body?.pin_ok === false && body?.ok === false) {
      pass(`/tmp vault pin_ok=false (${neg})`);
    } else {
      fail(`/tmp vault pin_ok=${body?.pin_ok} ok=${body?.ok} — pin guard must refuse ${neg}`);
    }
  }

  if (desksBody && failures.length === 0) {
    console.log('LIST_DESKS_BEGIN');
    console.log(JSON.stringify(desksBody, null, 2));
    console.log('LIST_DESKS_END');
  }
} finally {
  rmSync(neg, { recursive: true, force: true });
}

if (failures.length) {
  console.error(`FAIL: ${failures.length} check(s)`);
  process.exit(1);
}
console.log('PASS: cockpit-mcp-preflight');
EOF
