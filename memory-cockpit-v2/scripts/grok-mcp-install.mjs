#!/usr/bin/env node
/** Primary: install cockpit-research MCP for Grok Build. */
import { spawnSync } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const r = spawnSync(process.execPath, [path.join(here, 'agent-mcp-install.mjs'), '--grok'], {
  stdio: 'inherit',
  env: process.env,
});
process.exit(r.status ?? 1);
