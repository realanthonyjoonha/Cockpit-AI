#!/usr/bin/env node
import { ensureProjectCockpitMcp, mcpServerName } from '../server/cockpitMcpProject.js';

let root = null;
let name = 'cockpit-research-dogfood';
for (let i = 2; i < process.argv.length; i++) {
  if (process.argv[i] === '--root') root = process.argv[++i];
  else if (process.argv[i] === '--name') name = process.argv[++i];
}
if (!root) {
  console.error('Usage: node scripts/write-dogfood-pin.mjs --root DIR [--name cockpit-research-dogfood]');
  process.exit(2);
}
const server = mcpServerName(name);
if (server === 'cockpit-research') {
  console.error('testing cockpit must not pin mcp_servers.cockpit-research');
  process.exit(1);
}
const r = ensureProjectCockpitMcp(root, { mcpName: server });
if (!r.ok) {
  console.error(r.error);
  process.exit(1);
}
console.log('  pin', r.path);
console.log('  mcp_name', r.mcp_name);
