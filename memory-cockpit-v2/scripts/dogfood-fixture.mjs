#!/usr/bin/env node
/**
 * dogfood-fixture.mjs — inject synthetic desk DOGF into a sealed testing cockpit.
 * Not NVDA. Not kernel vault. Enough house/risks/registry for Filings + Learn wiring.
 * Decision-support only.
 *
 *   node scripts/dogfood-fixture.mjs --root /path/to/cockpit-dogfood
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const SLUG = 'dogf';
const TICKER = 'DOGF';
const NAME = 'Dogfood Fixture';
const TODAY = new Date().toISOString().slice(0, 10);

function parseArgs(argv) {
  const out = { root: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = argv[++i];
  }
  return out;
}

function write(p, body) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, body.endsWith('\n') ? body : `${body}\n`, 'utf8');
}

export function liveTreePaths() {
  const home = os.homedir();
  return [
    path.join(home, 'Desktop', 'cockpit-kernel'),
    path.join(home, 'Desktop', 'cockpit-product'),
    path.join(home, 'Desktop', 'cockpit-vault'),
    path.join(home, 'cockpit-personal', 'repo'),
  ];
}

/** Refuse kernel/product/vault/personal — never unlink their wiki or rewrite desks. */
export function assertInjectableRoot(root) {
  const abs = path.resolve(root);
  let real = abs;
  try {
    if (fs.existsSync(abs)) real = fs.realpathSync(abs);
  } catch { /* keep abs */ }
  for (const p of liveTreePaths()) {
    try {
      if (!fs.existsSync(p)) continue;
      if (fs.realpathSync(p) === real) {
        throw new Error(`refusing dogfood fixture in live tree: ${p}`);
      }
    } catch (e) {
      if (/refusing dogfood fixture/.test(String(e.message || e))) throw e;
    }
  }
}

export function injectDogfoodFixture(root) {
  const abs = path.resolve(root);
  assertInjectableRoot(abs);
  const glass = path.join(abs, 'memory-cockpit-v2');
  const vault = path.join(abs, 'research-wiki');
  const tdPath = path.join(glass, 'config', 'thin-desks.json');
  if (!fs.existsSync(tdPath)) {
    throw new Error(`thin-desks.json missing under ${abs}`);
  }

  // Never follow a symlink into kernel/personal vault.
  try {
    if (fs.lstatSync(vault).isSymbolicLink()) {
      fs.unlinkSync(vault);
    }
  } catch { /* missing is fine */ }
  fs.mkdirSync(vault, { recursive: true });

  const houseRel = `house-view-${SLUG}.md`;
  const raw = `raw/${SLUG}-research`;
  const risksSrc = `${raw}/08-risks-catalysts.md`;

  const td = JSON.parse(fs.readFileSync(tdPath, 'utf8'));
  const rooms = Array.isArray(td.rooms) ? td.rooms : [];
  for (const r of ['overview', 'risks', 'house', 'sources', 'street', 'model', 'reports', 'filings', 'background', 'update']) {
    if (!rooms.includes(r)) rooms.push(r);
  }
  td.rooms = rooms;
  td.desks = [{
    slug: SLUG,
    ticker: TICKER,
    id: SLUG,
    label: TICKER,
    mark: 'D',
    house_file: houseRel,
    profile: {
      displayName: NAME,
      entitySlug: SLUG,
      rawDir: raw,
      risksSource: risksSrc,
      risksGenerated: `${raw}/risks`,
      sourcePrimaryRe: `${SLUG}|${TICKER.toLowerCase()}`,
      stanceExtended: false,
      houseTitleDefault: `House View — ${NAME} (${TICKER})`,
      neverGeneratedNote: `SoR is ${risksSrc}`,
      ask: {
        houseConflictNeedles: ['margin', 'print'],
        claimRouteNeedles: [],
        claimTopicNeedles: [],
        claimTopicRe: SLUG,
        sourcePrimaryRe: `${SLUG}|${TICKER.toLowerCase()}`,
        companyQuestionNeedles: ['dogfood fixture', 'what is dogf'],
      },
    },
  }];
  write(tdPath, JSON.stringify(td, null, 2));

  write(path.join(vault, houseRel), `---
type: house-view
scope: single-name
entity: "${NAME}"
ticker: ${TICKER}
updated: ${TODAY}
status: FORMING
owner: "Testing cockpit fixture — not a live book. Agents may ACCEPT only inside this seal."
governance: |
  USER-OWNED, SAVE-ON-COMMAND.
  Decision-support only: no buy/sell/hold, no price target, no position sizing.
  Synthetic fixture for feature dogfood. Never copy into product or kernel vault.
---

# House View — ${NAME} (${TICKER}) · **FORMING**

> **FORMING** — testing-cockpit fixture. Decision-support only. No buy/sell/PT/sizing.

**Stance:** Fixture desk for platform dogfood (not a real issuer).

## Flip triggers

- Gross margin print below 40% on the next 10-Q
- Named customer concentration disclosed above 25% of revenue

## Acceptance log

| Date | Status |
|------|--------|
| ${TODAY} | Fixture only — FORMING |
`);

  write(path.join(vault, risksSrc), `# Risks & catalysts — ${NAME} (${TICKER})

**Fixture register for testing-cockpit mode.** Not a live book.

## A) Risks (register)

### R1 — Gross margin compression
- **Status:** WATCH · **Grade:** [B]
- **Summary:** Fixture tripwire so MAP FILINGS has a named risk to bind.
- **Mechanism:** Next 10-Q print vs 40% bar (synthetic).

| Signal | Tripwire | State |
|--------|----------|-------|
| Gross margin | Print below 40% | armed |

## B) Catalysts

- Next 10-Q print (fixture accession)
`);
  write(path.join(vault, raw, 'risks', '.gitkeep'), '');
  write(path.join(vault, `wiki/entities/${SLUG}.md`), `# ${NAME} (${TICKER})

Synthetic testing-cockpit entity. Not a real issuer.

## Key facts (timestamped · graded · sourced)

- Fixture desk for Filings / Learn wiring (${TODAY}) [C] [[fixture]]
`);

  write(path.join(abs, 'ontology', 'packs', `${TICKER}.json`), JSON.stringify({
    focus_id: SLUG,
    ticker: TICKER,
    entity_slug: SLUG,
    aliases: [NAME, TICKER],
    themes: [],
    house_view_path: houseRel,
    house_view_play_match: NAME,
    series_allowlist: [],
    risks_dir: `${raw}/risks`,
    risks_source: risksSrc,
    source_globs: [`${raw}/*.md`, `wiki/entities/${SLUG}.md`],
    source_roots: [raw],
    sources: [],
  }, null, 2));

  const compiledAt = '2026-08-01T00:00:00Z';
  write(path.join(abs, 'ontology', 'store', 'by_ticker', `${TICKER}.json`), JSON.stringify({
    ticker: TICKER,
    compiled_at: compiledAt,
    schema_version: 1,
    decision_support_only: true,
    house_prior: { status: 'FORMING' },
    claims: [],
    risks: [{
      name: 'Gross margin compression',
      status: 'WATCH',
      grade: 'B',
    }],
    gaps: ['fixture pack — not a live compile'],
  }, null, 2));

  const filings = [
    {
      form: '10-Q',
      filed: '2026-08-05',
      accession: '0000000000-26-000001',
      items: '',
      url: 'https://www.sec.gov/fixture/dogf-10q',
    },
    {
      form: '8-K',
      filed: '2026-09-01',
      accession: '0000000000-26-000002',
      items: '8.01',
      url: 'https://www.sec.gov/fixture/dogf-8k',
    },
  ];
  write(path.join(vault, 'cockpit', 'compile', TICKER, 'filings', 'index.json'), JSON.stringify({
    schema_version: 1,
    ticker: TICKER,
    as_of: compiledAt,
    count: filings.length,
    filings,
    fixture: true,
  }, null, 2));

  return {
    root: abs,
    slug: SLUG,
    ticker: TICKER,
    desks: 1,
    vault,
  };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const { root } = parseArgs(process.argv);
  if (!root) {
    console.error('Usage: node scripts/dogfood-fixture.mjs --root DIR');
    process.exit(2);
  }
  const r = injectDogfoodFixture(root);
  console.log(`dogfood fixture OK slug=${r.slug} ticker=${r.ticker} root=${r.root}`);
}

export { SLUG, TICKER };
