#!/usr/bin/env node
/**
 * drivers-closeout — third new-desk bar.
 * House CONFIRMED + register would pass (or skip if --drivers-only).
 * Zero ### Dn = PASS. Any Dn needs **House:**.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { houseIsConfirmed } from './register-closeout.mjs';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const REPO = process.env.COCKPIT_REPO || path.join(ROOT, '..');

function vaultRoot() {
  return process.env.COCKPIT_VAULT || process.env.ONTOLOGY_WIKI || path.join(REPO, 'research-wiki');
}

function parseArgs(argv) {
  const out = { slug: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--json') out.json = true;
    else if (argv[i] === '--slug') out.slug = String(argv[++i] || '').toLowerCase();
  }
  return out;
}

export function driversOk(md) {
  const t = String(md || '');
  const heads = t.match(/### D\d+/g) || [];
  if (!heads.length) return { ok: true, n: 0, detail: 'empty drivers PASS' };
  const parsedHouse = (t.match(/\*\*House:\*\*/gi) || []).length;
  if (parsedHouse < heads.length) {
    return { ok: false, n: heads.length, detail: `${heads.length} Dn but ${parsedHouse} House: cites` };
  }
  return { ok: true, n: heads.length, detail: `${heads.length} Dn with House:` };
}

function main() {
  const args = parseArgs(process.argv);
  if (!args.slug) {
    console.error('usage: node scripts/drivers-closeout.mjs --slug SLUG');
    process.exit(2);
  }
  const vault = vaultRoot();
  const house = path.join(vault, `house-view-${args.slug}.md`);
  const nine = path.join(vault, 'raw', `${args.slug}-research`, '09-drivers.md');
  const hv = fs.existsSync(house) ? fs.readFileSync(house, 'utf8') : '';
  const dmd = fs.existsSync(nine) ? fs.readFileSync(nine, 'utf8') : '';
  const houseOk = houseIsConfirmed(hv);
  const drv = driversOk(dmd);
  const pass = houseOk && drv.ok;
  const rec = { slug: args.slug, house_confirmed: houseOk, drivers: drv, pass };
  if (args.json) console.log(JSON.stringify(rec, null, 2));
  else {
    console.log(pass ? 'PASS' : 'FAIL', args.slug);
    console.log('  house', houseOk ? 'CONFIRMED' : 'not CONFIRMED');
    console.log('  drivers', drv.detail);
  }
  process.exit(pass ? 0 : 1);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
