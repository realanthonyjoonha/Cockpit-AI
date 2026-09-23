#!/usr/bin/env node
/**
 * mcp-name-isolation-test.mjs — testing cockpits must not reuse cockpit-research.
 * Decision-support only.
 */
import assert from 'assert';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { mcpServerName, ensureProjectCockpitMcp } from '../server/cockpitMcpProject.js';

let pass = 0;
const ok = (n) => { pass += 1; console.log(`  ✓ ${n}`); };

console.log('\nmcp-name isolation\n');

assert.strictEqual(mcpServerName(), 'cockpit-research');
ok('default name is cockpit-research');

assert.strictEqual(mcpServerName('cockpit-research'), 'cockpit-research');
ok('explicit default stays default');

assert.strictEqual(mcpServerName('dogfood'), 'cockpit-research-dogfood');
ok('short name gets cockpit-research- prefix');

assert.strictEqual(mcpServerName('cockpit-research-dogfood'), 'cockpit-research-dogfood');
ok('full dogfood name is stable');

assert.strictEqual(mcpServerName('kernel'), 'cockpit-research-kernel');
ok('kernel suffix is a distinct server');

assert.notStrictEqual(mcpServerName('dogfood'), mcpServerName());
ok('dogfood name !== operate name');

process.env.COCKPIT_MCP_NAME = 'dogfood';
assert.strictEqual(mcpServerName(), 'cockpit-research-dogfood');
ok('COCKPIT_MCP_NAME env is honored');
delete process.env.COCKPIT_MCP_NAME;

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-mcp-name-'));
const kernel = path.join(tmp, 'kernel');
const dog = path.join(tmp, 'dogfood');
for (const root of [kernel, dog]) {
  fs.mkdirSync(path.join(root, 'memory-cockpit-v2', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'memory-cockpit-v2', 'scripts', 'mcp-cockpit-research.mjs'), '// stub\n');
}

function hasServerHeader(toml, name) {
  return toml.split(/\r?\n/).includes(`[mcp_servers.${name}]`);
}

const kPin = ensureProjectCockpitMcp(kernel, { mcpName: 'cockpit-research' });
const dPin = ensureProjectCockpitMcp(dog, { mcpName: 'cockpit-research-dogfood' });
assert.ok(kPin.ok && dPin.ok);
const kToml = fs.readFileSync(kPin.path, 'utf8');
const dToml = fs.readFileSync(dPin.path, 'utf8');
assert.ok(hasServerHeader(kToml, 'cockpit-research'));
assert.ok(!hasServerHeader(kToml, 'cockpit-research-dogfood'));
ok('kernel pin toml is cockpit-research only');
assert.ok(hasServerHeader(dToml, 'cockpit-research-dogfood'));
assert.ok(!hasServerHeader(dToml, 'cockpit-research'));
ok('dogfood pin toml is cockpit-research-dogfood only');
assert.notStrictEqual(kPin.mcp_name, dPin.mcp_name);
ok('pins report distinct mcp_name');

const scA = path.join(tmp, 'sc-a');
const scB = path.join(tmp, 'sc-b');
for (const root of [scA, scB]) {
  fs.mkdirSync(path.join(root, 'memory-cockpit-v2', 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(root, 'memory-cockpit-v2', 'scripts', 'mcp-cockpit-research.mjs'), '// stub\n');
}
fs.writeFileSync(path.join(scA, '.cockpit-scenario.json'), JSON.stringify({
  name: 'dogfood',
  mcp_name: 'cockpit-research-dogfood',
  expect_root: scA,
  allowed_slugs: ['dogf'],
}));
fs.writeFileSync(path.join(scB, '.cockpit-scenario.json'), JSON.stringify({
  name: 'lab-b',
  mcp_name: 'cockpit-research-lab-b',
  expect_root: scB,
  allowed_slugs: ['t3'],
}));
delete process.env.COCKPIT_MCP_NAME;
const aPin = ensureProjectCockpitMcp(scA);
const bPin = ensureProjectCockpitMcp(scB);
assert.ok(aPin.ok && bPin.ok);
assert.strictEqual(aPin.mcp_name, 'cockpit-research-dogfood');
assert.strictEqual(bPin.mcp_name, 'cockpit-research-lab-b');
assert.notStrictEqual(aPin.mcp_name, bPin.mcp_name);
assert.ok(hasServerHeader(fs.readFileSync(aPin.path, 'utf8'), 'cockpit-research-dogfood'));
assert.ok(!hasServerHeader(fs.readFileSync(aPin.path, 'utf8'), 'cockpit-research'));
assert.ok(hasServerHeader(fs.readFileSync(bPin.path, 'utf8'), 'cockpit-research-lab-b'));
ok('OPEN GROK-style pin honors scenario mcp_name; two scenarios do not share a server');

const scBare = path.join(tmp, 'sc-bare');
fs.mkdirSync(path.join(scBare, 'memory-cockpit-v2', 'scripts'), { recursive: true });
fs.writeFileSync(path.join(scBare, 'memory-cockpit-v2', 'scripts', 'mcp-cockpit-research.mjs'), '// stub\n');
fs.writeFileSync(path.join(scBare, '.cockpit-scenario.json'), JSON.stringify({
  name: 'agentaccept',
  expect_root: scBare,
  allowed_slugs: ['tstk'],
}));
delete process.env.COCKPIT_MCP_NAME;
const barePin = ensureProjectCockpitMcp(scBare);
assert.ok(barePin.ok);
assert.strictEqual(barePin.mcp_name, 'cockpit-research-agentaccept');
assert.ok(!hasServerHeader(fs.readFileSync(barePin.path, 'utf8'), 'cockpit-research'));
assert.ok(hasServerHeader(fs.readFileSync(barePin.path, 'utf8'), 'cockpit-research-agentaccept'));
ok('scenario without mcp_name still does not steal cockpit-research');

const seal = path.join(tmp, 'seal');
fs.mkdirSync(path.join(seal, 'memory-cockpit-v2', 'scripts'), { recursive: true });
fs.mkdirSync(path.join(seal, 'research-wiki'), { recursive: true });
fs.writeFileSync(path.join(seal, 'memory-cockpit-v2', 'scripts', 'mcp-cockpit-research.mjs'), '// stub\n');
fs.writeFileSync(path.join(seal, '.cockpit-scenario.json'), JSON.stringify({
  name: 'dogfood',
  mcp_name: 'cockpit-research-dogfood',
  mode: 'testing-cockpit',
  expect_root: seal,
  allowed_slugs: ['dogf'],
}));
delete process.env.COCKPIT_MCP_NAME;
const keep = ensureProjectCockpitMcp(seal, { mcpName: 'cockpit-research-dogfood' });
assert.ok(keep.ok);
const collide = ensureProjectCockpitMcp(seal, { mcpName: 'cockpit-research' });
assert.ok(!collide.ok);
assert.match(String(collide.error || ''), /must not pin mcp_servers\.cockpit-research/);
assert.ok(hasServerHeader(fs.readFileSync(keep.path, 'utf8'), 'cockpit-research-dogfood'));
ok('testing-cockpit mode refuses cockpit-research pin');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\nmcp-name-isolation PASS — ${pass} passed, 0 failed`);
