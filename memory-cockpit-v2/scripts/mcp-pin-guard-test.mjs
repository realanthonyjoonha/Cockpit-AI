#!/usr/bin/env node
/**
 * Unit tests for mcpPinGuard fail-closed pin.
 * Decision-support only.
 */
import assert from 'assert';
import {
  assertExpectRoot,
  assertDeskAllowed,
  assertMcpPin,
  assertVaultUnderRepo,
  vaultBelongsToRepo,
  allowedSlugSet,
  realpathSafe,
  scenarioPinPreamble,
  isAgentAcceptEnabled,
  assertAgentAcceptAllowed,
  displayMonorepoRoot,
} from '../server/mcpPinGuard.js';
import fs from 'fs';
import os from 'os';
import path from 'path';

let passed = 0;
function ok(name) {
  console.log(`  ✓ ${name}`);
  passed += 1;
}

// expect root
{
  const root = realpathSafe(process.cwd());
  delete process.env.COCKPIT_EXPECT_ROOT;
  assert.deepStrictEqual(assertExpectRoot(root).enforced, false);
  ok('expect root optional when unset');

  process.env.COCKPIT_EXPECT_ROOT = root;
  assert.strictEqual(assertExpectRoot(root).ok, true);
  ok('expect root match');

  process.env.COCKPIT_EXPECT_ROOT = path.join(root, 'does-not-match-xyz');
  let threw = false;
  try {
    assertExpectRoot(root);
  } catch (e) {
    threw = /pin mismatch/i.test(String(e.message));
  }
  assert.ok(threw);
  ok('expect root mismatch throws');
  delete process.env.COCKPIT_EXPECT_ROOT;
}

// allowed slugs
{
  delete process.env.COCKPIT_ALLOWED_SLUGS;
  assert.strictEqual(allowedSlugSet(), null);
  ok('allowed slugs unrestricted');

  process.env.COCKPIT_ALLOWED_SLUGS = 'aaa,bbb';
  assert.strictEqual(assertDeskAllowed('aaa').ok, true);
  assert.strictEqual(assertDeskAllowed('bbb').ok, true);
  let threw = false;
  try {
    assertDeskAllowed('mu');
  } catch (e) {
    threw = /not allowed/i.test(String(e.message));
  }
  assert.ok(threw);
  ok('foreign desk mu rejected');
  delete process.env.COCKPIT_ALLOWED_SLUGS;
}

// vault pin: in-tree vs sibling cockpit-vault vs foreign
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-pin-'));
  const repo = path.join(tmp, 'cockpit');
  const sibling = path.join(tmp, 'cockpit-vault');
  const foreign = path.join(tmp, 'other-wiki');
  fs.mkdirSync(repo);
  fs.mkdirSync(sibling);
  fs.mkdirSync(foreign);
  const inTree = path.join(repo, 'research-wiki');
  fs.mkdirSync(inTree);

  assert.strictEqual(vaultBelongsToRepo(repo, inTree), true);
  assert.strictEqual(assertVaultUnderRepo(repo, inTree).ok, true);
  ok('in-tree research-wiki allowed');

  assert.strictEqual(vaultBelongsToRepo(repo, sibling), true);
  assert.strictEqual(assertVaultUnderRepo(repo, sibling).ok, true);
  ok('sibling cockpit-vault allowed');

  let threw = false;
  try {
    assertVaultUnderRepo(repo, foreign);
  } catch (e) {
    threw = /contamination/i.test(String(e.message));
  }
  assert.ok(threw);
  ok('foreign vault rejected');

  fs.rmSync(tmp, { recursive: true, force: true });
}

// full pin
{
  const root = realpathSafe(process.cwd());
  const vault = path.join(root, 'research-wiki');
  process.env.COCKPIT_EXPECT_ROOT = root;
  process.env.COCKPIT_ALLOWED_SLUGS = 'spcx';
  process.env.COCKPIT_VAULT = vault;
  assert.strictEqual(assertMcpPin({ repoRoot: root, vault, deskSlug: 'spcx' }).ok, true);
  let threw = false;
  try {
    assertMcpPin({ repoRoot: root, vault, deskSlug: 'nvda' });
  } catch {
    threw = true;
  }
  assert.ok(threw);
  ok('full pin allows spcx rejects nvda');
  delete process.env.COCKPIT_EXPECT_ROOT;
  delete process.env.COCKPIT_ALLOWED_SLUGS;
}

// preamble only when scenario file exists
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-scen-'));
  assert.strictEqual(scenarioPinPreamble(tmp), '');
  ok('no preamble without scenario file');
  fs.writeFileSync(
    path.join(tmp, '.cockpit-scenario.json'),
    JSON.stringify({ name: 'A', expect_root: tmp, allowed_slugs: ['x', 'y'] }),
  );
  const pre = scenarioPinPreamble(tmp);
  assert.ok(/PIN CHECK/i.test(pre));
  assert.ok(pre.includes(tmp));
  ok('preamble when scenario file present');
  fs.rmSync(tmp, { recursive: true, force: true });
}

// agent accept grant
{
  delete process.env.COCKPIT_AGENT_ACCEPT;
  assert.strictEqual(isAgentAcceptEnabled(), false);
  ok('agent accept off by default');
  process.env.COCKPIT_AGENT_ACCEPT = '1';
  assert.strictEqual(isAgentAcceptEnabled(), true);
  assert.strictEqual(assertAgentAcceptAllowed(process.cwd()).ok, true);
  ok('agent accept on with env');
  process.env.COCKPIT_AGENT_ACCEPT = '0';
  let denied = false;
  try {
    assertAgentAcceptAllowed(process.cwd());
  } catch {
    denied = true;
  }
  assert.ok(denied);
  ok('agent accept denied when 0');
  delete process.env.COCKPIT_AGENT_ACCEPT;
}

// display path: symlink spelling, not realpath
{
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-disp-'));
  const real = path.join(tmp, 'real-repo');
  const link = path.join(tmp, 'cockpit-kernel');
  fs.mkdirSync(real);
  fs.symlinkSync(real, link);
  process.env.COCKPIT_EXPECT_ROOT = link;
  assert.strictEqual(displayMonorepoRoot(real), path.resolve(link));
  ok('display prefers EXPECT_ROOT symlink over realpath');
  delete process.env.COCKPIT_EXPECT_ROOT;
  const shown = displayMonorepoRoot(real, { aliases: [link] });
  assert.strictEqual(shown, path.resolve(link));
  ok('display prefers kernel alias when it realpaths to repo');
  fs.rmSync(tmp, { recursive: true, force: true });
}

console.log(`\nmcp-pin-guard-test PASS (${passed})`);
