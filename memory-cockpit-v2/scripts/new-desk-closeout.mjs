#!/usr/bin/env node
/**
 * Last step of DEEP /cockpit-new-desk before the agent may stop.
 * Runs house-closeout. Stamps 00-research-status.md. Exit 1 if FAIL.
 *
 *   node scripts/new-desk-closeout.mjs --slug tsla
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { houseCloseout } from './house-closeout.mjs';

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

const STAMP_RE = /<!-- cockpit:house-closeout:(PASS|FAIL):[^>]+ -->/;

export function stampResearchStatus(zeroPath, pass, iso) {
  const stamp = `<!-- cockpit:house-closeout:${pass ? 'PASS' : 'FAIL'}:${iso} -->`;
  if (!fs.existsSync(zeroPath)) {
    fs.mkdirSync(path.dirname(zeroPath), { recursive: true });
    fs.writeFileSync(zeroPath, `# Research status\n\n${stamp}\n`, 'utf8');
    return { wrote: true, created: true };
  }
  let text = fs.readFileSync(zeroPath, 'utf8');
  if (STAMP_RE.test(text)) text = text.replace(STAMP_RE, stamp);
  else text = `${text.replace(/\s*$/, '')}\n\n${stamp}\n`;
  fs.writeFileSync(zeroPath, text, 'utf8');
  return { wrote: true, created: false };
}

export function newDeskCloseout(slug, opts = {}) {
  const vault = opts.vault || vaultRoot();
  const r = houseCloseout(slug, { vault });
  const iso = new Date().toISOString();
  const zeroPath = path.join(vault, 'raw', `${slug}-research`, '00-research-status.md');
  stampResearchStatus(zeroPath, r.pass, iso);
  return {
    ...r,
    stamped: true,
    stamp_path: zeroPath,
    next: r.pass
      ? 'Dump full house → GO writes CONFIRMED (commit_on_go) · SAVE DRAFT / EDIT stay in Grok (no FORMING chip)'
      : 'Dump in Grok; user GO then propose_house CONFIRMED + commit_on_go. Do not propose FORMING.',
  };
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.slug) {
    console.log(`Usage: node scripts/new-desk-closeout.mjs --slug SLUG [--json]`);
    process.exit(args.help ? 0 : 2);
  }
  const r = newDeskCloseout(args.slug);
  if (args.json) console.log(JSON.stringify(r, null, 2));
  else {
    console.log(`new-desk-closeout ${r.pass ? 'PASS' : 'FAIL'}  ${r.slug}`);
    console.log(`  ${r.reason}`);
    console.log(`  ${r.next}`);
  }
  process.exit(r.pass ? 0 : 1);
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) main();
