#!/usr/bin/env node
/**
 * E2E: agent ACCEPT house + risk proposals (scenario grant).
 * Must set COCKPIT_VAULT / COCKPIT_AGENT_ACCEPT before import (spawn wrapper).
 * Decision-support only.
 */
import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';

const vault = process.env.COCKPIT_VAULT;
const repo = process.env.COCKPIT_REPO || path.resolve(vault, '..');
if (!vault || !fs.existsSync(vault)) {
  console.error('COCKPIT_VAULT required and must exist');
  process.exit(1);
}

process.env.COCKPIT_AGENT_ACCEPT = process.env.COCKPIT_AGENT_ACCEPT || '1';
process.env.COCKPIT_EXPECT_ROOT = process.env.COCKPIT_EXPECT_ROOT || repo;

const root = path.join(path.dirname(pathToFileURL(import.meta.url).pathname), '..');
// On mac path may have %20 etc — use fileURLToPath
import { fileURLToPath } from 'url';
const GLASS = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const { proposeHouse, acceptHouseProposal, listHouseProposals } = await import(
  pathToFileURL(path.join(GLASS, 'server/houseProposals.js')).href
);
const { proposeAddRisk, acceptRiskProposal, listRiskProposals } = await import(
  pathToFileURL(path.join(GLASS, 'server/riskProposals.js')).href
);
const {
  assertAgentAcceptAllowed,
  isAgentAcceptEnabled,
  appendAgentAcceptAudit,
  assertMcpPin,
} = await import(pathToFileURL(path.join(GLASS, 'server/mcpPinGuard.js')).href);

let pass = 0;
let fail = 0;
function ok(m) {
  console.log('  ✓', m);
  pass += 1;
}
function bad(m) {
  console.log('  ✗', m);
  fail += 1;
}

const SLUG = process.env.TEST_SLUG || 'tstk';
const TICKER = (process.env.TEST_TICKER || 'TSTK').toUpperCase();
const HOUSE = process.env.TEST_HOUSE_FILE || `house-view-${SLUG}.md`;
const RISKS = process.env.TEST_RISKS_REL || `raw/${SLUG}-research/08-risks-catalysts.md`;

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  AGENT ACCEPT E2E                                        ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('  vault:', vault);
console.log('  repo:', repo);
console.log('  agent_accept:', isAgentAcceptEnabled());
console.log('  slug:', SLUG);
console.log();

// Pin + grant
try {
  assertMcpPin({ repoRoot: repo, vault, deskSlug: SLUG });
  ok('pin allows desk');
} catch (e) {
  // allowed slugs may be empty = unrestricted
  try {
    assertMcpPin({ repoRoot: repo, vault });
    ok('pin root ok (no slug lock or slug not in env)');
  } catch (e2) {
    bad('pin: ' + e2.message);
  }
}

try {
  assertAgentAcceptAllowed(repo);
  ok('agent accept allowed');
} catch (e) {
  bad('agent accept blocked: ' + e.message);
  process.exit(1);
}

// Deny path: flip off
{
  const prev = process.env.COCKPIT_AGENT_ACCEPT;
  process.env.COCKPIT_AGENT_ACCEPT = '0';
  let denied = false;
  try {
    assertAgentAcceptAllowed(repo);
  } catch {
    denied = true;
  }
  process.env.COCKPIT_AGENT_ACCEPT = prev || '1';
  if (denied) ok('agent accept denied when COCKPIT_AGENT_ACCEPT=0');
  else bad('expected deny when agent accept off');
}

// House propose + accept
const houseMd = `---
type: house-view
ticker: ${TICKER}
status: FORMING
updated: 2026-08-06
---

# House View — Test (${TICKER}) · **FORMING**

> Decision-support only. No buy/sell/PT/sizing.

**Stance:** Test underwrite placeholder for agent-accept e2e.

## Body

Agent-accepted body marker AGENT_ACCEPT_HOUSE_OK.

## Acceptance log

| Date | Status |
|------|--------|
| 2026-08-06 | agent-accept e2e |
`;

let hpId;
try {
  const prop = proposeHouse({
    slug: SLUG,
    ticker: TICKER,
    houseFile: HOUSE,
    markdown: houseMd,
    rationale: 'e2e agent accept',
    summary: 'e2e house',
    source: 'agent_accept_e2e',
  });
  hpId = prop.proposal?.id || prop.id;
  if (!hpId && prop.proposal) hpId = prop.proposal.id;
  // proposeHouse returns { proposal: { id } } or nested
  if (!hpId) {
    const listed = listHouseProposals(SLUG, { status: 'pending' });
    hpId = listed.proposals?.[0]?.id;
  }
  if (hpId) ok('house proposed ' + hpId);
  else bad('house propose missing id: ' + JSON.stringify(prop).slice(0, 200));
} catch (e) {
  bad('house propose: ' + e.message);
}

if (hpId) {
  try {
    const acc = acceptHouseProposal(SLUG, hpId, { houseFile: HOUSE });
    if (acc.ok && acc.written?.verified) ok('house accepted + verified write');
    else bad('house accept incomplete: ' + JSON.stringify(acc).slice(0, 200));
    const housePath = path.join(vault, HOUSE);
    const body = fs.readFileSync(housePath, 'utf8');
    if (body.includes('AGENT_ACCEPT_HOUSE_OK')) ok('house file contains accepted body');
    else bad('house file missing marker');
    appendAgentAcceptAudit(vault, { kind: 'house', desk: SLUG, proposal_id: hpId, test: true });
    ok('house audit log append');
  } catch (e) {
    bad('house accept: ' + e.message);
  }
}

// Risk propose + accept (SoR must exist with section A structure)
const risksAbs = path.join(vault, RISKS);
if (!fs.existsSync(risksAbs)) {
  fs.mkdirSync(path.dirname(risksAbs), { recursive: true });
  fs.writeFileSync(
    risksAbs,
    `# Risks — ${TICKER}

## A) Risk register

(none yet)

## B) Catalysts

(none)
`,
    'utf8',
  );
  ok('seeded risks SoR skeleton');
}

let rpId;
try {
  const prop = proposeAddRisk({
    slug: SLUG,
    ticker: TICKER,
    risksSourceRel: RISKS,
    body: {
      title: 'Launch cadence dependency',
      summary: 'Ops risk for e2e agent accept',
      mechanism: 'Test mechanism — decision-support only',
      grade: 'B',
      status: 'WATCH',
      tripwires: [
        { signal: 'Public launch slip', tripwire: 'Major slip >90d', state: 'monitor', as_of: '2026-08-06' },
        { signal: 'Regulatory hold', tripwire: 'New FAA hold', state: 'monitor', as_of: '2026-08-06' },
      ],
      rationale: 'e2e',
      as_of: '2026-08-06',
      source: 'agent_accept_e2e',
    },
  });
  rpId = prop.proposal?.id;
  if (!rpId) {
    const listed = listRiskProposals(SLUG, { status: 'pending' });
    rpId = listed.proposals?.[0]?.id;
  }
  if (rpId) ok('risk add proposed ' + rpId);
  else bad('risk propose missing id');
} catch (e) {
  bad('risk propose: ' + e.message);
}

if (rpId) {
  try {
    const acc = acceptRiskProposal({
      slug: SLUG,
      id: rpId,
      risksSourceRel: RISKS,
    });
    if (acc.ok && acc.written?.verified) ok('risk accepted + verified SoR write');
    else bad('risk accept incomplete');
    const sor = fs.readFileSync(risksAbs, 'utf8');
    if (/Launch cadence/i.test(sor) && /WATCH/i.test(sor)) ok('risks SoR contains new risk');
    else bad('risks SoR missing new section');
    appendAgentAcceptAudit(vault, { kind: 'risk', desk: SLUG, proposal_id: rpId, test: true });
    ok('risk audit log append');
  } catch (e) {
    bad('risk accept: ' + e.message);
  }
}

// Pending lists clean
try {
  const hp = listHouseProposals(SLUG, { status: 'pending' });
  const rp = listRiskProposals(SLUG, { status: 'pending' });
  const hpend = (hp.proposals || []).length;
  const rpend = (rp.proposals || []).length;
  if (hpend === 0) ok('no pending house after accept');
  else bad('still pending house: ' + hpend);
  if (rpend === 0) ok('no pending risk after accept');
  else bad('still pending risk: ' + rpend);
} catch (e) {
  bad('list proposals: ' + e.message);
}

console.log();
if (fail === 0) {
  console.log(`AGENT ACCEPT E2E PASS (${pass} checks)`);
  process.exit(0);
}
console.log(`AGENT ACCEPT E2E FAIL (${fail} failed, ${pass} passed)`);
process.exit(1);
