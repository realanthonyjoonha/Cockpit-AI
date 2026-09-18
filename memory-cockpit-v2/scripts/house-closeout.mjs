#!/usr/bin/env node
/**
 * house-closeout.mjs — DEEP new-desk fail-closed.
 *
 * PASS if live house is not the scaffold, OR a pending house proposal exists
 * whose markdown is not the scaffold (AMAT).
 * FAIL if live house is still "edit after research" AND no such proposal (TSLA).
 *
 * Does not CONFIRM. Does not write the vault.
 *
 *   node scripts/house-closeout.mjs --slug tsla
 *   node scripts/house-closeout.mjs --slug amat
 *   COCKPIT_VAULT=/path node scripts/house-closeout.mjs --slug tsla --json
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { isScaffoldHouseMarkdown, houseMarkdownStatus } from '../server/houseStance.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.COCKPIT_REPO || path.join(ROOT, '..');

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

function pendingNonScaffold(vault, slug) {
  const p = path.join(vault, 'cockpit', 'proposals', `house-${slug}.json`);
  if (!fs.existsSync(p)) return { ok: false, detail: 'no house-{slug}.json' };
  let data;
  try {
    data = JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (e) {
    return { ok: false, detail: `proposal json: ${e.message}` };
  }
  const list = Array.isArray(data.proposals) ? data.proposals : [];
  const pending = list.filter((x) => x && x.status === 'pending');
  const good = pending.find((x) => {
    const md = String(x.markdown || '');
    if (isScaffoldHouseMarkdown(md)) return false;
    if (houseMarkdownStatus(md) !== 'CONFIRMED') return false;
    if (md.length < 1800) return false;
    return true;
  });
  if (good) {
    return {
      ok: true,
      detail: `pending ${good.id} · CONFIRMED · ${good.bytes || good.markdown.length} bytes`,
    };
  }
  if (pending.length) {
    return { ok: false, detail: `${pending.length} pending but FORMING/scaffold/thin — FORMING does not count` };
  }
  return { ok: false, detail: 'proposal file has no pending row' };
}

export function houseCloseout(slug, opts = {}) {
  const vault = opts.vault || vaultRoot();
  const housePath = path.join(vault, `house-view-${slug}.md`);
  const live = fs.existsSync(housePath) ? fs.readFileSync(housePath, 'utf8') : '';
  const liveScaffold = !live || isScaffoldHouseMarkdown(live);
  const pend = pendingNonScaffold(vault, slug);

  if (!liveScaffold) {
    return {
      slug,
      pass: true,
      reason: 'live house is not the FORMING scaffold',
      live_bytes: live.length,
      pending: pend,
    };
  }
  if (pend.ok) {
    return {
      slug,
      pass: true,
      reason: 'live house is scaffold; pending CONFIRMED proposal exists (GO, not FORMING)',
      live_bytes: live.length,
      pending: pend,
    };
  }
  return {
    slug,
    pass: false,
    reason: 'TSLA-class miss: live house is still scaffold and there is no pending CONFIRMED proposal. Dump in Grok; user GO then propose_house CONFIRMED + commit_on_go. Do not propose FORMING.',
    live_bytes: live.length,
    pending: pend,
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.slug) {
    console.log(`Usage:
  node scripts/house-closeout.mjs --slug SLUG [--json]
  COCKPIT_VAULT=/path/to/wiki
Exit 0 pass · 1 fail · 2 usage`);
    process.exit(args.help ? 0 : 2);
  }
  const r = houseCloseout(args.slug);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`house-closeout ${r.pass ? 'PASS' : 'FAIL'}  ${r.slug}`);
    console.log(`  ${r.reason}`);
    if (r.pending) console.log(`  pending: ${r.pending.detail}`);
  }
  process.exit(r.pass ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
