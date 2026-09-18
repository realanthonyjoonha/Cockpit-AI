#!/usr/bin/env node
import fs from 'fs';
import os from 'os';
import path from 'path';
import { seedDesks } from './dogfood-seed-desks.mjs';

let pass = 0;
let fail = 0;
const ok = (n) => { pass += 1; console.log(`  ✓ ${n}`); };
const bad = (n) => { fail += 1; console.log(`  ✗ ${n}`); };

console.log('\ndogfood-seed-desks\n');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-seed-'));
const vault = path.join(tmp, 'vault');
const ont = path.join(tmp, 'ont');
const dest = path.join(tmp, 'seal');
const kernel = path.join(os.homedir(), 'Desktop', 'cockpit-kernel');

fs.mkdirSync(path.join(dest, 'memory-cockpit-v2', 'config'), { recursive: true });
fs.writeFileSync(path.join(dest, 'memory-cockpit-v2', 'config', 'thin-desks.json'), JSON.stringify({ rooms: ['overview'], desks: [] }, null, 2));

const registry = {
  rooms: ['overview', 'filings'],
  desks: ['nvda', 'mu', 'lly', 'avgo'].map((slug) => ({
    slug,
    ticker: slug.toUpperCase(),
    house_file: `house-view-${slug}.md`,
    profile: {
      displayName: slug,
      entitySlug: slug,
      rawDir: `raw/${slug}-research`,
      risksSource: `raw/${slug}-research/08-risks-catalysts.md`,
    },
  })),
};
const regPath = path.join(tmp, 'thin-desks.json');
fs.writeFileSync(regPath, JSON.stringify(registry, null, 2));

for (const slug of ['nvda', 'mu', 'lly', 'avgo']) {
  fs.mkdirSync(path.join(vault, 'raw', `${slug}-research`), { recursive: true });
  fs.writeFileSync(path.join(vault, `house-view-${slug}.md`), `# House ${slug}\n\n## Flip triggers\n\n- x\n`);
  fs.writeFileSync(path.join(vault, 'raw', `${slug}-research`, '08-risks-catalysts.md'), `# risks ${slug}\n`);
  fs.mkdirSync(path.join(ont, 'packs'), { recursive: true });
  fs.writeFileSync(path.join(ont, 'packs', `${slug.toUpperCase()}.json`), `{}\n`);
  fs.mkdirSync(path.join(ont, 'store', 'by_ticker'), { recursive: true });
  fs.writeFileSync(path.join(ont, 'store', 'by_ticker', `${slug.toUpperCase()}.json`), `{"ticker":"${slug.toUpperCase()}","compiled_at":"2026-08-01T00:00:00Z"}\n`);
}

const r = seedDesks({
  root: dest,
  slugs: ['nvda', 'mu', 'lly'],
  registryPath: regPath,
  vaultPath: vault,
  ontologyPath: ont,
});
const td = JSON.parse(fs.readFileSync(path.join(dest, 'memory-cockpit-v2', 'config', 'thin-desks.json'), 'utf8'));
if (r.desks === 3 && td.desks.map((d) => d.slug).join(',') === 'nvda,mu,lly') ok('seal registry is nvda,mu,lly only');
else bad(`desks ${JSON.stringify(td.desks)}`);
if (!td.desks.some((d) => d.slug === 'avgo')) ok('AVGO not copied');
else bad('AVGO leaked');
if (fs.existsSync(path.join(dest, 'research-wiki', 'house-view-nvda.md'))) ok('NVDA house copied');
else bad('no nvda house');
if (fs.existsSync(path.join(dest, 'ontology', 'store', 'by_ticker', 'LLY.json'))) ok('LLY pack store copied');
else bad('no lly store');
if (!fs.lstatSync(path.join(dest, 'research-wiki')).isSymbolicLink()) ok('dest wiki is a real dir');
else bad('symlink wiki');

const createdStub = !fs.existsSync(kernel);
if (createdStub) {
  fs.mkdirSync(path.join(kernel, 'memory-cockpit-v2', 'config'), { recursive: true });
  fs.writeFileSync(path.join(kernel, 'KERNEL.md'), 'stub — lab only\n');
  fs.writeFileSync(
    path.join(kernel, 'memory-cockpit-v2', 'config', 'thin-desks.json'),
    JSON.stringify({ rooms: ['overview'], desks: [] }, null, 2),
  );
}
let threw = false;
try {
  seedDesks({
    root: kernel,
    slugs: ['nvda'],
    registryPath: regPath,
    vaultPath: vault,
    ontologyPath: ont,
  });
} catch (e) {
  threw = /refusing dogfood fixture in live tree/.test(String(e.message || e));
}
if (createdStub) {
  try { fs.rmSync(kernel, { recursive: true, force: true }); } catch { /* */ }
}
if (threw) ok('refuses to seed into live kernel');
else bad('seeded live kernel');

fs.rmSync(tmp, { recursive: true, force: true });
console.log(`\ndogfood-seed-desks ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
