#!/usr/bin/env node
/**
 * register-closeout.mjs — DEEP new-desk, second bar.
 *
 * House CONFIRMED first (live house-view-{slug}.md). Then 08 must be a real
 * register (### Rn + tripwire tables) AND either pending add_risk chips
 * or an ACCEPTED header (not DRAFT-only).
 *
 *   node scripts/register-closeout.mjs --slug nvda
 *   COCKPIT_VAULT=/path node scripts/register-closeout.mjs --slug tsla --json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.COCKPIT_REPO || path.join(ROOT, '..');
const MIN_RISKS = 4;

function vaultRoot() {
  return process.env.COCKPIT_VAULT
    || process.env.ONTOLOGY_WIKI
    || path.join(REPO, 'research-wiki');
}

function parseArgs(argv) {
  const out = { slug: null, json: false, help: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--slug') out.slug = String(argv[++i] || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    else if (a === '-h' || a === '--help') out.help = true;
    else {
      console.error(`unknown arg: ${a}`);
      out.help = true;
    }
  }
  return out;
}

export function houseIsConfirmed(md) {
  const t = String(md || '');
  if (/^status:\s*CONFIRMED\b/im.test(t)) return true;
  if (/·\s*\*\*CONFIRMED\b/i.test(t)) return true;
  return false;
}

export function risksDrafted(md) {
  const t = String(md || '');
  const heads = t.match(/### R\d+/g) || [];
  const tables = t.match(/\|\s*Signal\s*\|\s*Tripwire\s*\|/gi) || [];
  return {
    n: heads.length,
    tables: tables.length,
    ok: heads.length >= MIN_RISKS && tables.length >= Math.min(MIN_RISKS, heads.length),
  };
}

export function registerAcceptedHeader(md) {
  const t = String(md || '');
  if (/\*\*Status:\*\*\s*\*\*ACCEPTED\b/i.test(t)) return true;
  if (/\*\*ACCEPTED\*\*\s+\d{4}/i.test(t)) return true;
  return false;
}

function pendingAddRisks(vault, slug) {
  const p = path.join(vault, 'cockpit', 'proposals', `risks-${slug}.json`);
  if (!fs.existsSync(p)) return { ok: false, n: 0, detail: 'no risks-{slug}.json' };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { ok: false, n: 0, detail: `json: ${e.message}` };
  }
  const list = Array.isArray(data.proposals) ? data.proposals : [];
  const pending = list.filter((x) => x && x.status === 'pending' && (x.kind === 'add_risk' || !x.kind));
  if (pending.length >= MIN_RISKS) {
    return { ok: true, n: pending.length, detail: `${pending.length} pending add_risk` };
  }
  if (pending.length) {
    return { ok: false, n: pending.length, detail: `${pending.length} pending add_risk (need ≥${MIN_RISKS})` };
  }
  return { ok: false, n: 0, detail: 'no pending add_risk' };
}

export function registerCloseout(slug, opts = {}) {
  const vault = opts.vault || vaultRoot();
  const housePath = path.join(vault, `house-view-${slug}.md`);
  const house = fs.existsSync(housePath) ? fs.readFileSync(housePath, 'utf8') : '';
  if (!houseIsConfirmed(house)) {
    return {
      slug,
      pass: false,
      reason: 'House is not CONFIRMED. GO in Grok (commit_on_go writes CONFIRMED), then register-closeout.',
      house_confirmed: false,
    };
  }
  const eightPath = path.join(vault, 'raw', `${slug}-research`, '08-risks-catalysts.md');
  const eight = fs.existsSync(eightPath) ? fs.readFileSync(eightPath, 'utf8') : '';
  const drafted = risksDrafted(eight);
  if (!drafted.ok) {
    return {
      slug,
      pass: false,
      reason: `08 missing or thin (### Rn ${drafted.n}, tripwire tables ${drafted.tables}; need ≥${MIN_RISKS}). Draft register, dump full 08 in Grok.`,
      house_confirmed: true,
      drafted,
    };
  }
  const accepted = registerAcceptedHeader(eight);
  const chips = pendingAddRisks(vault, slug);
  if (accepted || chips.ok) {
    return {
      slug,
      pass: true,
      reason: accepted
        ? 'House CONFIRMED; 08 drafted and ACCEPTED'
        : `House CONFIRMED; 08 drafted; ${chips.detail}`,
      house_confirmed: true,
      drafted,
      accepted,
      chips,
    };
  }
  return {
    slug,
    pass: false,
    reason: '08 is drafted but still DRAFT with no pending add_risk chips. Dump 08 in Grok, GO, commit_on_go kind=register (or glass ACCEPT chips), then re-run.',
    house_confirmed: true,
    drafted,
    accepted: false,
    chips,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.slug) {
    console.log(`Usage:
  node scripts/register-closeout.mjs --slug SLUG [--json]
Exit 0 pass · 1 fail · 2 usage`);
    process.exit(args.help ? 0 : 2);
  }
  const r = registerCloseout(args.slug);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`register-closeout ${r.pass ? 'PASS' : 'FAIL'}  ${r.slug}`);
    console.log(`  ${r.reason}`);
  }
  process.exit(r.pass ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
