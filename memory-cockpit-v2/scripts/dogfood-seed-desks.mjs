#!/usr/bin/env node
/**
 * Copy allowlisted desks (registry row + house + risks + pack + filings cache)
 * into a testing-cockpit seal. Never writes kernel/product/vault in place.
 *
 *   node scripts/dogfood-seed-desks.mjs --root SEAL --slugs nvda,mu,lly \
 *     --registry /path/thin-desks.json --vault /path/cockpit-vault
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { assertInjectableRoot } from './dogfood-fixture.mjs';

const DEFAULT_SLUGS = ['nvda', 'mu', 'lly'];

function parseArgs(argv) {
  const out = { root: null, slugs: DEFAULT_SLUGS.slice(), registry: null, vault: null, ont: null };
  for (let i = 2; i < argv.length; i++) {
    if (argv[i] === '--root') out.root = argv[++i];
    else if (argv[i] === '--slugs') {
      out.slugs = String(argv[++i] || '')
        .split(',')
        .map((s) => s.trim().toLowerCase())
        .filter(Boolean);
    } else if (argv[i] === '--registry') out.registry = argv[++i];
    else if (argv[i] === '--vault') out.vault = argv[++i];
    else if (argv[i] === '--ontology') out.ont = argv[++i];
  }
  return out;
}

function cpFile(src, dest) {
  if (!src || !fs.existsSync(src) || !fs.statSync(src).isFile()) return false;
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
  return true;
}

function cpDir(src, dest) {
  if (!src || !fs.existsSync(src) || !fs.statSync(src).isDirectory()) return false;
  fs.mkdirSync(dest, { recursive: true });
  fs.cpSync(src, dest, { recursive: true, dereference: true });
  return true;
}

function resolveHouse(vault, houseFile) {
  const names = [houseFile];
  const base = path.basename(houseFile);
  const m = /^house-view-(.+)\.md$/i.exec(base);
  if (m) {
    const id = m[1];
    names.push(`house-view-${id.toLowerCase()}.md`, `house-view-${id.toUpperCase()}.md`);
  }
  for (const n of names) {
    const p = path.join(vault, n);
    if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
  }
  return null;
}

export function seedDesks({ root, slugs, registryPath, vaultPath, ontologyPath }) {
  const abs = path.resolve(root);
  assertInjectableRoot(abs);
  const want = (slugs || DEFAULT_SLUGS).map((s) => String(s).toLowerCase());
  if (!want.length) throw new Error('no slugs');
  const tdPath = path.join(abs, 'memory-cockpit-v2', 'config', 'thin-desks.json');
  const srcTd = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  const bySlug = new Map((srcTd.desks || []).map((d) => [String(d.slug || '').toLowerCase(), d]));
  const desks = [];
  for (const slug of want) {
    const row = bySlug.get(slug);
    if (!row) throw new Error(`slug ${slug} not in registry ${registryPath}`);
    desks.push(JSON.parse(JSON.stringify(row)));
  }

  const vaultDest = path.join(abs, 'research-wiki');
  try {
    if (fs.lstatSync(vaultDest).isSymbolicLink()) fs.unlinkSync(vaultDest);
  } catch { /* ok */ }
  fs.mkdirSync(vaultDest, { recursive: true });

  const copied = [];
  for (const row of desks) {
    const ticker = String(row.ticker || '').toUpperCase();
    const prof = row.profile || {};
    const houseRel = row.house_file || `house-view-${row.slug}.md`;
    const houseSrc = resolveHouse(vaultPath, houseRel);
    if (!houseSrc) throw new Error(`missing house ${houseRel} in ${vaultPath}`);
    cpFile(houseSrc, path.join(vaultDest, path.basename(houseRel)));
    const srcBase = path.basename(houseSrc);
    if (srcBase !== path.basename(houseRel)) {
      cpFile(houseSrc, path.join(vaultDest, srcBase));
    }
    if (prof.risksSource) {
      cpFile(path.join(vaultPath, prof.risksSource), path.join(vaultDest, prof.risksSource));
    }
    if (prof.risksGenerated) {
      cpDir(path.join(vaultPath, prof.risksGenerated), path.join(vaultDest, prof.risksGenerated));
    }
    if (prof.rawDir) {
      const rawSrc = path.join(vaultPath, prof.rawDir);
      if (fs.existsSync(rawSrc)) cpDir(rawSrc, path.join(vaultDest, prof.rawDir));
    }
    const ent = prof.entitySlug || row.slug;
    cpFile(path.join(vaultPath, 'wiki', 'entities', `${ent}.md`), path.join(vaultDest, 'wiki', 'entities', `${ent}.md`));
    const packSrc = [
      path.join(ontologyPath, 'packs', `${ticker}.json`),
      path.join(vaultPath, '..', 'ontology', 'packs', `${ticker}.json`),
    ].find((p) => fs.existsSync(p));
    if (packSrc) cpFile(packSrc, path.join(abs, 'ontology', 'packs', `${ticker}.json`));
    const storeSrc = [
      path.join(ontologyPath, 'store', 'by_ticker', `${ticker}.json`),
      path.join(vaultPath, '..', 'ontology', 'store', 'by_ticker', `${ticker}.json`),
    ].find((p) => fs.existsSync(p));
    if (storeSrc) cpFile(storeSrc, path.join(abs, 'ontology', 'store', 'by_ticker', `${ticker}.json`));
    const filingsSrc = path.join(vaultPath, 'cockpit', 'compile', ticker, 'filings');
    if (fs.existsSync(filingsSrc)) {
      cpDir(filingsSrc, path.join(vaultDest, 'cockpit', 'compile', ticker, 'filings'));
    }
    copied.push({ slug: row.slug, ticker, house: path.basename(houseRel) });
  }

  const rooms = Array.isArray(srcTd.rooms) ? srcTd.rooms.slice() : [];
  for (const r of ['overview', 'risks', 'house', 'filings', 'background']) {
    if (!rooms.includes(r)) rooms.push(r);
  }
  const outTd = { ...srcTd, rooms, desks };
  fs.writeFileSync(tdPath, `${JSON.stringify(outTd, null, 2)}\n`);
  return { root: abs, slugs: want, copied, desks: desks.length };
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isMain) {
  const a = parseArgs(process.argv);
  if (!a.root || !a.registry || !a.vault) {
    console.error('Usage: node scripts/dogfood-seed-desks.mjs --root SEAL --slugs nvda,mu,lly --registry thin-desks.json --vault VAULT [--ontology ONT]');
    process.exit(2);
  }
  const ont = a.ont || path.join(path.dirname(a.registry), '..', '..', 'ontology');
  const r = seedDesks({
    root: a.root,
    slugs: a.slugs,
    registryPath: a.registry,
    vaultPath: a.vault,
    ontologyPath: ont,
  });
  console.log(`dogfood seed OK desks=${r.desks} slugs=${r.slugs.join(',')} root=${r.root}`);
}
