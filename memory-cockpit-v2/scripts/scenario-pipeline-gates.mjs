#!/usr/bin/env node
/**
 * scenario-pipeline-gates.mjs — fail-closed checks + agent ACCEPT for scenario desks.
 *
 * HARD LAW: Scenario books must mirror cockpit-kernel /cockpit-new-desk DEEP underwrite.
 * Thin seeders / megacap stubs / light fixtures FAIL by default.
 *
 * Env (required):
 *   COCKPIT_VAULT, COCKPIT_REPO (scenario monorepo), COCKPIT_AGENT_ACCEPT=1
 *   COCKPIT_EXPECT_ROOT, COCKPIT_ALLOWED_SLUGS, TEST_SLUG, TEST_TICKER
 * Optional:
 *   TEST_HOUSE_FILE, TEST_RISKS_REL, GLASS_PORT, SKIP_ACCEPT=1, SKIP_STREET=1
 *   ALLOW_LIGHT_FIXTURE=1 + FIXTURE_LIGHT=1 — ONLY opt-out for factory plumbing tests
 *     (not for real ticker scenario dogfood)
 *
 * Decision-support only.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { spawnSync } from 'child_process';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const GLASS = path.join(__dirname, '..');
const vault = process.env.COCKPIT_VAULT;
const repo = process.env.COCKPIT_REPO || path.resolve(vault, '..');
const SLUG = String(process.env.TEST_SLUG || '').toLowerCase();
const TICKER = String(process.env.TEST_TICKER || SLUG).toUpperCase();
const HOUSE = process.env.TEST_HOUSE_FILE || `house-view-${SLUG}.md`;
const RISKS = process.env.TEST_RISKS_REL || `raw/${SLUG}-research/08-risks-catalysts.md`;
const PORT = Number(process.env.GLASS_PORT || 0);
const SKIP_ACCEPT = process.env.SKIP_ACCEPT === '1';
const SKIP_STREET = process.env.SKIP_STREET === '1';
const FIXTURE_LIGHT = process.env.FIXTURE_LIGHT === '1';
/** Double opt-in: both flags required. Never for real underwrite tickers. */
const ALLOW_LIGHT_FIXTURE = process.env.ALLOW_LIGHT_FIXTURE === '1';
const LIGHT_OK = FIXTURE_LIGHT && ALLOW_LIGHT_FIXTURE;
const DO_ACCEPT = process.env.DO_ACCEPT !== '0' && !SKIP_ACCEPT;

/** Kernel /cockpit-new-desk DEEP floors (scenario must match unless LIGHT_OK). */
const MIN_CLAIMS = LIGHT_OK ? 10 : 25;
const MIN_RISKS = LIGHT_OK ? 6 : 6;
const MIN_RAW_SLICES = LIGHT_OK ? 1 : 5; // 00-status + research files
const MIN_HOUSE_CHARS = LIGHT_OK ? 400 : 2800;
const MIN_STREET_FIRMS = 3;

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

function must(cond, m) {
  if (cond) ok(m);
  else bad(m);
  return cond;
}

if (!vault || !fs.existsSync(vault)) {
  console.error('COCKPIT_VAULT required');
  process.exit(1);
}
if (!SLUG || !TICKER) {
  console.error('TEST_SLUG and TEST_TICKER required');
  process.exit(1);
}

process.env.COCKPIT_AGENT_ACCEPT = process.env.COCKPIT_AGENT_ACCEPT || '1';
process.env.COCKPIT_EXPECT_ROOT = process.env.COCKPIT_EXPECT_ROOT || repo;

const {
  assertAgentAcceptAllowed,
  isAgentAcceptEnabled,
  appendAgentAcceptAudit,
  assertMcpPin,
} = await import(pathToFileURL(path.join(GLASS, 'server/mcpPinGuard.js')).href);
const { proposeHouse, acceptHouseProposal, listHouseProposals } = await import(
  pathToFileURL(path.join(GLASS, 'server/houseProposals.js')).href
);
const { proposeRiskStatus, proposeAddRisk, acceptRiskProposal, listRiskProposals } = await import(
  pathToFileURL(path.join(GLASS, 'server/riskProposals.js')).href
);
const { validateStreetSnapshot } = await import(
  pathToFileURL(path.join(GLASS, 'server/streetSchema.js')).href
);

console.log('╔══════════════════════════════════════════════════════════╗');
console.log('║  SCENARIO PIPELINE GATES                                 ║');
console.log('╚══════════════════════════════════════════════════════════╝');
console.log('  repo:  ', repo);
console.log('  vault: ', vault);
console.log('  desk:  ', SLUG, TICKER);
console.log('  agent_accept:', isAgentAcceptEnabled());
console.log('  depth mode:', LIGHT_OK ? 'LIGHT FIXTURE (opt-in only)' : 'KERNEL DEEP (default)');
console.log();

if (FIXTURE_LIGHT && !ALLOW_LIGHT_FIXTURE) {
  bad(
    'FIXTURE_LIGHT=1 refused — also set ALLOW_LIGHT_FIXTURE=1 only for plumbing tests. Real tickers need DEEP underwrite (mirror /cockpit-new-desk).',
  );
}

// ── 1. Pin ──────────────────────────────────────────────────────────
try {
  assertMcpPin({ repoRoot: repo, vault, deskSlug: SLUG });
  ok(`pin allows desk ${SLUG}`);
} catch (e) {
  bad(`pin: ${e.message}`);
}

try {
  assertAgentAcceptAllowed(repo);
  ok('agent accept grant on');
} catch (e) {
  if (DO_ACCEPT) bad(`agent accept blocked: ${e.message}`);
  else ok('agent accept off (SKIP_ACCEPT)');
}

// Deny wrong slug when allowed list set
if (process.env.COCKPIT_ALLOWED_SLUGS) {
  let denied = false;
  try {
    assertMcpPin({ repoRoot: repo, vault, deskSlug: '__not_allowed_slug__' });
  } catch {
    denied = true;
  }
  must(denied, 'pin fail-closed on foreign slug');
}

// ── 2. Registry ─────────────────────────────────────────────────────
const regPath = path.join(repo, 'memory-cockpit-v2/config/thin-desks.json');
let reg = { desks: [], rooms: [] };
if (fs.existsSync(regPath)) {
  reg = JSON.parse(fs.readFileSync(regPath, 'utf8'));
  const desk = (reg.desks || []).find((d) => d.slug === SLUG || d.ticker === TICKER);
  must(!!desk, `registry has desk ${SLUG}`);
  must((reg.rooms || []).includes('street'), 'registry rooms include street');
} else {
  bad('thin-desks.json missing');
}

// ── 3. Dist Street UI ───────────────────────────────────────────────
const distDir = path.join(repo, 'memory-cockpit-v2/dist');
let distOk = false;
if (fs.existsSync(distDir)) {
  try {
    const assets = fs.readdirSync(path.join(distDir, 'assets')).filter((f) => f.endsWith('.js'));
    for (const a of assets) {
      const t = fs.readFileSync(path.join(distDir, 'assets', a), 'utf8');
      if (/REFRESH STREET|FIRM MODELS/.test(t)) {
        distOk = true;
        break;
      }
    }
  } catch { /* ignore */ }
}
must(distOk, 'glass dist includes Street UI');

// ── 4. Optional light fixture (not deep research) ───────────────────
function ensureDir(p) {
  fs.mkdirSync(p, { recursive: true });
}

function seedLightFixture() {
  const asOf = new Date().toISOString().slice(0, 10);
  const entityDir = path.join(vault, 'wiki/entities');
  const sourcesDir = path.join(vault, 'wiki/sources');
  const rawDir = path.join(vault, `raw/${SLUG}-research`);
  ensureDir(entityDir);
  ensureDir(sourcesDir);
  ensureDir(rawDir);
  ensureDir(path.join(rawDir, 'risks'));
  ensureDir(path.join(vault, 'cockpit/street'));

  const srcSlug = `${SLUG}-fixture-primary`;
  fs.writeFileSync(
    path.join(sourcesDir, `${srcSlug}.md`),
    `---\ntype: source\nslug: ${srcSlug}\ntitle: "${TICKER} fixture primary"\nurl: https://example.com/${SLUG}\ngrade_hint: B\n---\n\n# ${srcSlug}\n\nScenario light fixture source (decision-support only).\n`,
    'utf8',
  );

  const claims = [];
  for (let i = 1; i <= 12; i++) {
    claims.push(
      `- Fixture claim ${i} for ${TICKER} scenario pipeline light book (${asOf}) [B] [[${srcSlug}]]`,
    );
  }
  fs.writeFileSync(
    path.join(entityDir, `${SLUG}.md`),
    `---
type: entity
name: "Scenario Fixture ${TICKER}"
ticker: ${TICKER}
slug: ${SLUG}
updated: ${asOf}
---

# Scenario Fixture ${TICKER}

**What it is:** Light fixture entity for scenario pipeline E2E (not deep research).

## Key facts (timestamped · graded · sourced)

${claims.join('\n')}
`,
    'utf8',
  );

  const risksBody = `# Risks & catalysts — ${TICKER} (light fixture)

**As-of:** ${asOf} · Decision-support only · No buy/sell/PT/sizing

## A) Risk register

### R1 — Customer concentration
- **Status:** WATCH · **Grade:** [B] · Fixture risk for pipeline E2E
- **Mechanism:** Single large customer pause would pressure revenue.
- **Evidence:** Fixture only. (${asOf}) [B] [[${srcSlug}]]
- **Tripwires**

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| Customer share | >40% revenue from one counterparty disclosed | monitor | ${asOf} |
| Order pause | Public order pause from top customer | monitor | ${asOf} |

### R2 — Execution / product cycle
- **Status:** WATCH · **Grade:** [B] · Fixture
- **Mechanism:** Product ramp delay compresses growth narrative.
- **Evidence:** Fixture only. (${asOf}) [B] [[${srcSlug}]]
- **Tripwires**

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| Guide cut | Material guide cut mid-year | monitor | ${asOf} |
| Delay | Named product volume delay | monitor | ${asOf} |

### R3 — Competition / pricing
- **Status:** WATCH · **Grade:** [C] · Fixture
- **Mechanism:** Peer ASP pressure hits margin.
- **Evidence:** Fixture only. (${asOf}) [B] [[${srcSlug}]]
- **Tripwires**

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| ASP | Company cites ASP collapse as primary miss | monitor | ${asOf} |
| Share | Loss of named program to peer | monitor | ${asOf} |

### R4 — Liquidity
- **Status:** INTACT · **Grade:** [B] · Fixture
- **Mechanism:** Working capital stress during ramp.
- **Evidence:** Fixture only. (${asOf}) [B] [[${srcSlug}]]
- **Tripwires**

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| Liquidity | Distressed financing language | monitor | ${asOf} |
| WC | AR+inventory grow far faster than revenue | monitor | ${asOf} |

### R5 — Geo / supply
- **Status:** WATCH · **Grade:** [B] · Fixture
- **Mechanism:** Manufacturing disruption.
- **Evidence:** Fixture only. (${asOf}) [B] [[${srcSlug}]]
- **Tripwires**

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| Site | Material facility disruption | monitor | ${asOf} |
| Trade | Quantified multi-quarter tariff hit | monitor | ${asOf} |

### R6 — Forecast error
- **Status:** WATCH · **Grade:** [B] · Fixture
- **Mechanism:** PO-based forecasting air pocket.
- **Evidence:** Fixture only. (${asOf}) [B] [[${srcSlug}]]
- **Tripwires**

| Signal | Tripwire | State | As-of |
|--------|----------|-------|-------|
| Guide | Annual guide cut >20% | monitor | ${asOf} |
| Cancel | Public cancel from >10% customer | monitor | ${asOf} |

## B) Catalysts

- Fixture catalyst only. (${asOf}) [C] [[${srcSlug}]]

## Status summary ${asOf}

R1 WATCH · R2 WATCH · R3 WATCH · R4 INTACT · R5 WATCH · R6 WATCH
`;
  fs.writeFileSync(path.join(vault, RISKS), risksBody, 'utf8');

  const houseMd = `---
type: house-view
scope: single-name
entity: "Scenario Fixture ${TICKER}"
ticker: ${TICKER}
updated: ${asOf}
status: FORMING — scenario pipeline light fixture
owner: "Scenario pipeline E2E. Decision-support only."
governance: |
  USER-OWNED via agent_accept grant on scenario monorepo when CONFIRMED.
  Decision-support only: no buy/sell/hold, no price target, no position sizing.
---

# House View — Scenario Fixture (${TICKER}) · **FORMING**

> Decision-support only. No buy/sell/PT/sizing.  
> Light fixture for scenario pipeline gates — not a deep underwrite.

**Stance:** Constructive on ${TICKER} as a scenario pipeline fixture only — conditional on concentration, execution, competition, liquidity, geo, and forecast tripwires remaining bounded. Not a rating. Not sizing.

### The load-bearing view

This is a **light fixture book** for automated scenario E2E. It exists so pin, accept, compile, verify, street, and glass gates can run without inventing a real underwrite.

### Flip triggers

- Any R1–R6 tripwire fires  
- Fixture retired  

### Explicitly not in this house

- Buy/sell/hold, PT, sizing  
- Claiming deep research depth  

### Linked register

\`${RISKS}\`

**SCENARIO_PIPELINE_LIGHT_FIXTURE**
`;
  fs.writeFileSync(path.join(vault, HOUSE), houseMd, 'utf8');

  // pack config
  const packsDir = path.join(repo, 'ontology/packs');
  ensureDir(packsDir);
  fs.writeFileSync(
    path.join(packsDir, `${TICKER}.json`),
    JSON.stringify(
      {
        focus_id: SLUG,
        ticker: TICKER,
        entity_slug: SLUG,
        aliases: [TICKER],
        themes: [],
        house_view_path: HOUSE,
        house_view_play_match: TICKER,
        series_allowlist: [],
        risks_dir: `raw/${SLUG}-research/risks`,
        risks_source: RISKS,
        source_globs: [`raw/${SLUG}-research/*.md`, `wiki/entities/${SLUG}.md`],
        source_roots: [`raw/${SLUG}-research`],
        sources: [],
      },
      null,
      2,
    ) + '\n',
    'utf8',
  );

  // street v2 complete (no buy/sell advice words)
  const street = {
    schema_version: 2,
    ticker: TICKER,
    name: `Scenario Fixture ${TICKER}`,
    currency: 'USD',
    as_of: asOf,
    built_at: new Date().toISOString(),
    fetched_at: new Date().toISOString(),
    status: 'ok',
    frame:
      'Third-party published analyst price objectives only — not the house view, not pack SoR, and not a portfolio recommendation. Scenario light fixture for pipeline gates.',
    bull:
      'Fixture bull frame: growth narrative holds when concentration and execution tripwires stay quiet. Higher published objectives cluster when demand stays elevated. Decision-support context only for Street room.',
    bear:
      'Fixture skeptic frame: order air pocket, competition, or geo disruption compresses the story. Lower objectives treat margin pressure as the base case. Not house advice.',
    consensus: {
      rating: 'Mixed (fixture)',
      tally: '3 fixture models',
      pt_avg: 100,
      pt_low: 70,
      pt_high: 130,
      pt_note: 'Fixture dispersion for schema gate only.',
      source: 'https://example.com/' + SLUG + '/forecast',
    },
    firms: [
      {
        firm: 'Fixture Research A',
        rating: 'Outperform / Positive',
        pt: 130,
        pt_display: '$130',
        date: asOf,
        flag: 'bull',
        source_url: 'https://example.com/' + SLUG + '/note-a',
        why:
          'Fixture Research A published a constructive rating and a one-hundred-thirty dollar price objective on the fixture name, per the scenario seed article link. The objective sits at the high end of the three-model fixture range and reflects an optimistic growth path with concentration risks acknowledged. This desk treats the figure as a third-party published target only for Street room completeness, not a house price objective.',
      },
      {
        firm: 'Fixture Research B',
        rating: 'Neutral / Mixed',
        pt: 100,
        pt_display: '$100',
        date: asOf,
        flag: 'anchor',
        source_url: 'https://example.com/' + SLUG + '/note-b',
        why:
          'Fixture Research B maintained a mixed rating and a one-hundred dollar price objective in the scenario seed window. The mid-range objective anchors consensus for the light fixture Street table and pairs growth optionality with execution uncertainty. As with all Street rows, this is an external model for the Street room only and is not the house view.',
      },
      {
        firm: 'Fixture Research C',
        rating: 'Underweight / Cautious',
        pt: 70,
        pt_display: '$70',
        date: asOf,
        flag: 'bear',
        source_url: 'https://example.com/' + SLUG + '/note-c',
        why:
          'Fixture Research C published a cautious rating and a seventy dollar price objective for the fixture name. The low objective marks the skeptic end of the fixture range and emphasizes concentration and cycle risks. Included as a complete third-party row for Street schema gates, not as portfolio guidance.',
      },
    ],
    decision_support_only: true,
    note: 'Scenario pipeline light fixture Street — not deep research.',
  };
  fs.writeFileSync(
    path.join(vault, 'cockpit/street', `${TICKER}.json`),
    JSON.stringify(street, null, 2) + '\n',
    'utf8',
  );

  ok('seeded light fixture book (entity/house/risks/street/pack config)');
}

const housePath = path.join(vault, HOUSE);
const risksPath = path.join(vault, RISKS);
const entityPath = path.join(vault, 'wiki/entities', `${SLUG}.md`);
const streetPath = path.join(vault, 'cockpit/street', `${TICKER}.json`);

function countEntityClaims(p) {
  if (!fs.existsSync(p)) return 0;
  const t = fs.readFileSync(p, 'utf8');
  const re = /^-\s+.+\(\d{4}-\d{2}-\d{2}\)[^\n]*\[[ABC]\][^\n]*\[\[/gm;
  return (t.match(re) || []).length;
}
function countRiskSections(p) {
  if (!fs.existsSync(p)) return 0;
  return (fs.readFileSync(p, 'utf8').match(/^### R\d+/gm) || []).length;
}

const claimN = countEntityClaims(entityPath);
const riskN = countRiskSections(risksPath);
const hasStreet = fs.existsSync(streetPath);
const hasFiles =
  fs.existsSync(housePath) && fs.existsSync(risksPath) && fs.existsSync(entityPath);

/** Thin-content ban list — these prove a shortcut seeder, not kernel deep underwrite. */
const BANNED_BOOK_MARKERS = [
  'SCENARIO_PIPELINE_LIGHT_FIXTURE',
  'Scenario Fixture',
  'light fixture book',
  'Parallel scenario pipeline',
  'Parallel multi-instance scenario book',
  'seed-scenario-megacap',
  'megacap seeder',
  'not a full 10-K underwrite',
  'Deep-enough scenario entity for parallel pipeline',
  'Parallel scenario research notes',
];

function countRawSlices(rawDirRel) {
  const dir = path.join(vault, rawDirRel);
  if (!fs.existsSync(dir)) return 0;
  return fs
    .readdirSync(dir)
    .filter((f) => f.endsWith('.md') && f !== '08-risks-catalysts.md')
    .length;
}

function assessHouseDepth(houseMd) {
  const body = String(houseMd || '');
  // strip frontmatter for length
  const prose = body.replace(/^---[\s\S]*?---\s*/, '');
  const chars = prose.length;
  const need = [
    { re: /\*\*Stance:\*\*|Stance:/i, name: 'Stance' },
    { re: /load-bearing|The load-bearing view/i, name: 'load-bearing view' },
    { re: /advantaged|What looks advantaged/i, name: 'advantaged' },
    { re: /exposed|What is exposed|conditional/i, name: 'exposed/conditional' },
    { re: /Flip trigger/i, name: 'flip triggers' },
    { re: /Explicitly not in this house|not in this house/i, name: 'explicitly not' },
    { re: /R[1-9]|risk register|Linked register/i, name: 'risk register link' },
  ];
  const missing = need.filter((n) => !n.re.test(prose)).map((n) => n.name);
  const banned = BANNED_BOOK_MARKERS.filter((m) => body.includes(m));
  return { chars, missing, banned, prose };
}

function assessBookDepth() {
  const rawRel = `raw/${SLUG}-research`;
  const sliceN = countRawSlices(rawRel);
  const houseMd = fs.existsSync(housePath) ? fs.readFileSync(housePath, 'utf8') : '';
  const risksMd = fs.existsSync(risksPath) ? fs.readFileSync(risksPath, 'utf8') : '';
  const entityMd = fs.existsSync(entityPath) ? fs.readFileSync(entityPath, 'utf8') : '';
  const h = assessHouseDepth(houseMd);
  const bannedAll = [
    ...h.banned,
    ...BANNED_BOOK_MARKERS.filter(
      (m) => entityMd.includes(m) || risksMd.includes(m) || houseMd.includes(m),
    ),
  ];
  const uniqueBanned = [...new Set(bannedAll)];

  // Tripwire tables: at least one | Signal | style table in risks
  const tripwireTables = (risksMd.match(/\| Signal \|/gi) || []).length;

  return {
    claimN,
    riskN,
    sliceN,
    hasStreet,
    houseChars: h.chars,
    houseMissing: LIGHT_OK ? [] : h.missing,
    banned: LIGHT_OK ? [] : uniqueBanned,
    tripwireTables,
  };
}

// Light fixture seed only with double opt-in AND empty/thin book
let depth = null;
if (LIGHT_OK && (!hasFiles || claimN < MIN_CLAIMS)) {
  seedLightFixture();
  // recompute after seed
}

{
  const cN = countEntityClaims(entityPath);
  const rN = countRiskSections(risksPath);
  const st = fs.existsSync(streetPath);
  const files =
    fs.existsSync(housePath) && fs.existsSync(risksPath) && fs.existsSync(entityPath);
  depth = assessBookDepth();
  // refresh counts after possible seed
  depth.claimN = cN;
  depth.riskN = rN;
  depth.hasStreet = st;

  if (!files && !LIGHT_OK) {
    bad(
      'vault book missing — run DEEP underwrite first (mirror kernel /cockpit-new-desk). ' +
        'Do not use thin seeders. Light fixture only: FIXTURE_LIGHT=1 ALLOW_LIGHT_FIXTURE=1',
    );
  } else {
    must(depth.claimN >= MIN_CLAIMS, `entity claims ${depth.claimN} ≥ ${MIN_CLAIMS} (kernel deep floor)`);
    must(depth.riskN >= MIN_RISKS, `risks Rn ${depth.riskN} ≥ ${MIN_RISKS}`);
    must(
      depth.sliceN >= MIN_RAW_SLICES,
      `raw research slices ${depth.sliceN} ≥ ${MIN_RAW_SLICES} under raw/${SLUG}-research/`,
    );
    must(
      depth.houseChars >= MIN_HOUSE_CHARS,
      `house prose ${depth.houseChars} chars ≥ ${MIN_HOUSE_CHARS} (full house, not stance stub)`,
    );
    if (!LIGHT_OK) {
      if (depth.houseMissing.length === 0) {
        ok('house has required sections (stance, load-bearing, advantaged, exposed, flip, not-in, risks)');
      } else {
        bad(`house missing sections: ${depth.houseMissing.join(', ')} — expand to kernel house shape`);
      }
      if (depth.banned.length === 0) {
        ok('no thin-seeder / light-fixture banned markers in book');
      } else {
        bad(
          `banned thin-content markers: ${depth.banned.slice(0, 4).join(' | ')} — rewrite with DEEP underwrite`,
        );
      }
      must(
        depth.tripwireTables >= Math.min(6, depth.riskN),
        `risk tripwire tables ${depth.tripwireTables} (need per-risk tables)`,
      );
    }
    must(SKIP_STREET || depth.hasStreet, 'street vault file present');
    if (
      depth.claimN >= MIN_CLAIMS &&
      depth.riskN >= MIN_RISKS &&
      depth.houseChars >= MIN_HOUSE_CHARS &&
      (LIGHT_OK || depth.houseMissing.length === 0) &&
      (LIGHT_OK || depth.banned.length === 0)
    ) {
      ok(
        `kernel-depth book OK (claims=${depth.claimN} risks=${depth.riskN} houseChars=${depth.houseChars} slices=${depth.sliceN})`,
      );
    }
  }
}

// ── 5. Street schema ────────────────────────────────────────────────
if (!SKIP_STREET) {
  if (!fs.existsSync(streetPath)) {
    bad(`street file missing: ${streetPath}`);
  } else {
    try {
      const raw = JSON.parse(fs.readFileSync(streetPath, 'utf8'));
      const r = validateStreetSnapshot(raw, { ticker: TICKER });
      if (r.ok) ok(`street schema v2 ok (${r.snapshot?.firms?.length || 0} firms)`);
      else bad(`street schema: ${(r.errors || []).slice(0, 4).join('; ')}`);
    } catch (e) {
      bad(`street parse: ${e.message}`);
    }
  }
}

// ── 6. Agent ACCEPT (house confirm stamp + risk status touch) ───────
if (DO_ACCEPT && isAgentAcceptEnabled()) {
  try {
    let md = fs.readFileSync(housePath, 'utf8');
    // Promote FORMING → CONFIRMED for scenario accept path when fixture/deep ready
    md = md.replace(/^status:\s*.+$/im, 'status: CONFIRMED — scenario agent-ACCEPT');
    if (!/^status:\s*/im.test(md)) {
      md = md.replace(/^---\n/, '---\nstatus: CONFIRMED — scenario agent-ACCEPT\n');
    }
    md = md
      .replace(/\*\*FORMING\*\*/g, '**CONFIRMED (scenario agent)**')
      .replace(/· \*\*FORMING\*\*/g, '· **CONFIRMED (scenario agent)**')
      .replace(/# House View[^\n]*FORMING[^\n]*/i, (line) =>
        line.replace(/FORMING/gi, 'CONFIRMED (scenario agent)'),
      );
    if (!/CONFIRMED/i.test(md.slice(0, 600))) {
      md = md.replace(
        /^(# House View[^\n]*)/m,
        `$1 · **CONFIRMED (scenario agent)**`,
      );
    }
    const stamp = `\n\n### Agent ACCEPT stamp\n\n| Date | Actor | Result |\n|------|-------|--------|\n| ${new Date().toISOString().slice(0, 10)} | scenario pipeline agent ACCEPT | house written via accept_house_proposal |\n\n**AGENT_ACCEPT_HOUSE_OK · scenario-pipeline**\n`;
    if (!md.includes('AGENT_ACCEPT_HOUSE_OK')) md = md.trimEnd() + stamp;
    else if (!md.includes('Agent ACCEPT stamp')) md = md.trimEnd() + stamp;

    const prop = proposeHouse({
      slug: SLUG,
      ticker: TICKER,
      houseFile: HOUSE,
      markdown: md,
      rationale: 'Scenario pipeline agent CONFIRM (decision-support only).',
      summary: `CONFIRM ${TICKER} house via agent ACCEPT`,
      source: 'scenario_pipeline_e2e',
    });
    let hpId = prop.proposal?.id || prop.id;
    if (!hpId) {
      hpId = listHouseProposals(SLUG, { status: 'pending' }).proposals?.[0]?.id;
    }
    if (!hpId) throw new Error('house propose missing id');
    ok(`house proposed ${hpId}`);

    const hAcc = acceptHouseProposal(SLUG, hpId, { houseFile: HOUSE });
    if (!(hAcc.ok && hAcc.written?.verified)) throw new Error(JSON.stringify(hAcc).slice(0, 200));
    const body = fs.readFileSync(housePath, 'utf8');
    must(/CONFIRMED/i.test(body), 'house vault CONFIRMED after accept');
    must(/AGENT_ACCEPT_HOUSE_OK/.test(body), 'house has AGENT_ACCEPT_HOUSE_OK marker');
    appendAgentAcceptAudit(vault, {
      kind: 'house',
      desk: SLUG,
      proposal_id: hpId,
      scenario: process.env.COCKPIT_SCENARIO_NAME || true,
      pipeline: true,
    });
    ok('house agent ACCEPT verified');
  } catch (e) {
    bad(`house accept: ${e.message}`);
  }

  try {
    // Prefer any Rn currently INTACT → WATCH; else add a small monitor risk
    let rpId = null;
    const sor = fs.readFileSync(risksPath, 'utf8');
    // Match Status within the same Rn section only (do not spill into later Rn)
    const intactHit = sor.match(
      /### (R\d+)[^\n]*\n(?:(?!### )[\s\S])*?-\s*\*\*Status:\*\*\s*INTACT\b/i,
    );
    if (intactHit) {
      const rName = intactHit[1];
      const prop = proposeRiskStatus({
        slug: SLUG,
        ticker: TICKER,
        risksSourceRel: RISKS,
        body: {
          risk_name: rName,
          from_status: 'INTACT',
          to_status: 'WATCH',
          rationale: `Scenario pipeline agent CONFIRM: elevate ${rName} INTACT→WATCH.`,
          as_of: new Date().toISOString().slice(0, 10),
          source: 'scenario_pipeline_e2e',
        },
      });
      rpId = prop.proposal?.id;
      ok(`risk status proposed ${rpId} (${rName}→WATCH)`);
    } else if (/### R\d+/i.test(sor)) {
      const tag = Date.now().toString(36).slice(-4);
      const prop = proposeAddRisk({
        slug: SLUG,
        ticker: TICKER,
        risksSourceRel: RISKS,
        body: {
          title: `Scenario pipeline accept monitor ${tag}`,
          summary: 'E2E agent-accept path monitor (decision-support only)',
          mechanism: 'Ensures accept_risk_proposal write path is exercised on deep books.',
          grade: 'C',
          status: 'WATCH',
          tripwires: [
            { signal: 'Pipeline retired', tripwire: 'Scenario deleted', state: 'monitor', as_of: new Date().toISOString().slice(0, 10) },
            { signal: 'Pin wrong', tripwire: 'list_desks monorepo_root mismatch', state: 'monitor', as_of: new Date().toISOString().slice(0, 10) },
          ],
          rationale: 'scenario pipeline',
          as_of: new Date().toISOString().slice(0, 10),
          source: 'scenario_pipeline_e2e',
        },
      });
      rpId = prop.proposal?.id;
      ok(`risk add proposed ${rpId}`);
    } else {
      bad('risks SoR missing Rn structure for accept demo');
    }

    if (rpId) {
      const rAcc = acceptRiskProposal({ slug: SLUG, id: rpId, risksSourceRel: RISKS });
      if (!(rAcc.ok && rAcc.written?.verified)) throw new Error(JSON.stringify(rAcc).slice(0, 240));
      ok('risk agent ACCEPT verified');
      appendAgentAcceptAudit(vault, {
        kind: 'risk',
        desk: SLUG,
        proposal_id: rpId,
        scenario: process.env.COCKPIT_SCENARIO_NAME || true,
        pipeline: true,
      });
      const after = fs.readFileSync(risksPath, 'utf8');
      must(/WATCH/i.test(after), 'risks SoR still has WATCH rows');
    }
  } catch (e) {
    bad(`risk accept: ${e.message}`);
  }
} else if (!DO_ACCEPT) {
  ok('skipped agent ACCEPT (SKIP_ACCEPT=1)');
}

// ── 7. Compile + verify ─────────────────────────────────────────────
const ontRoot = process.env.ONTOLOGY_ROOT || path.join(repo, 'ontology');
const ontBin = path.join(ontRoot, 'ont');
if (fs.existsSync(ontBin)) {
  const env = {
    ...process.env,
    ONTOLOGY_WIKI: vault,
    COCKPIT_VAULT: vault,
    ONTOLOGY_STORE: process.env.ONTOLOGY_STORE || path.join(ontRoot, 'store/by_ticker'),
    ONTOLOGY_ROOT: ontRoot,
  };
  const c = spawnSync(ontBin, ['compile', TICKER], { cwd: ontRoot, env, encoding: 'utf8' });
  if (c.status === 0) ok(`ont compile ${TICKER}`);
  else bad(`ont compile failed: ${(c.stderr || c.stdout || '').slice(0, 300)}`);

  const v = spawnSync(ontBin, ['verify', TICKER], { cwd: ontRoot, env, encoding: 'utf8' });
  if (v.status === 0) ok(`ont verify ${TICKER} exit 0`);
  else bad(`ont verify failed:\n${(v.stdout || v.stderr || '').split('\n').slice(0, 20).join('\n')}`);
} else {
  bad(`ont binary missing at ${ontBin}`);
}

// ── 8. Glass APIs ───────────────────────────────────────────────────
async function fetchJson(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → ${res.status}`);
  return res.json();
}

if (PORT > 0) {
  try {
    const td = await fetchJson(`http://127.0.0.1:${PORT}/api/thin-desks`);
    const desks = td.desks || [];
    must(
      desks.some((d) => d.slug === SLUG),
      `glass thin-desks includes ${SLUG}`,
    );
    const ov = await fetchJson(`http://127.0.0.1:${PORT}/api/${SLUG}/overview`);
    must(ov.available === true, 'glass overview available');
    const stance = (ov.house && ov.house.stance_line) || '';
    must(stance.length > 40, `glass overview stance_len=${stance.length}`);
    const hs = await fetchJson(`http://127.0.0.1:${PORT}/api/${SLUG}/house`);
    must(hs.available === true && hs.source === 'vault', 'glass house vault');
    must(/CONFIRMED/i.test((hs.hero && hs.hero.status) || hs.markdown || ''), 'glass house CONFIRMED');
    const rk = await fetchJson(`http://127.0.0.1:${PORT}/api/${SLUG}/risks`);
    must((rk.risks || []).length >= 6, `glass risks count=${(rk.risks || []).length}`);
    if (!SKIP_STREET) {
      const st = await fetchJson(`http://127.0.0.1:${PORT}/api/${SLUG}/street`);
      must(st.available === true && !st.needs_rebuild, 'glass street available');
      must((st.firms || []).length >= 3, `glass street firms=${(st.firms || []).length}`);
    }
    ok(`glass APIs green on :${PORT}`);
  } catch (e) {
    bad(`glass API: ${e.message}`);
  }
} else {
  ok('glass API checks skipped (no GLASS_PORT)');
}

// ── Summary ─────────────────────────────────────────────────────────
console.log();
if (fail === 0) {
  console.log(`SCENARIO PIPELINE GATES PASS (${pass} checks)`);
  console.log(`  glass: http://127.0.0.1:${PORT || '—'}/#/${SLUG}/overview`);
  process.exit(0);
}
console.log(`SCENARIO PIPELINE GATES FAIL (${fail} failed, ${pass} passed)`);
process.exit(1);
