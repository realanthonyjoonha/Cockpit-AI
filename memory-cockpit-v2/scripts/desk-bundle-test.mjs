#!/usr/bin/env node
/** Desk bundle + delete. Fixture vault only. Never touches the live books. */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { buildAllBundles } from '../server/deskBundle.js';
import { deleteDeskBundle, removeDeskFromRegistryText } from '../server/deleteDesk.js';

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

function desk(slug, ticker) {
  return {
    slug,
    ticker,
    house_file: `house-view-${slug}.md`,
    profile: { entitySlug: slug, rawDir: `raw/${slug}-research` },
  };
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

function fixture() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-bundle-'));
  const vault = path.join(root, 'vault');
  const ont = path.join(root, 'ont');
  const store = path.join(ont, 'store', 'by_ticker');
  fs.mkdirSync(store, { recursive: true });
  for (const [slug, ticker] of [['mu', 'MU'], ['mur', 'MUR']]) {
    write(path.join(vault, `house-view-${slug}.md`), `house ${slug}\n`);
    write(path.join(vault, 'raw', `${slug}-research`, '08-risks-catalysts.md'), `risks ${slug}\n`);
    write(path.join(vault, 'wiki', 'entities', `${slug}.md`), `entity ${slug}\n`);
    write(path.join(ont, 'packs', `${ticker}.json`), `${JSON.stringify({
      ticker,
      source_globs: [
        `raw/${slug}-research/*.md`,
        `wiki/entities/${slug}.md`,
        `wiki/sources/${slug}-*.md`,
      ],
    })}\n`);
    write(path.join(store, `${ticker}.json`), `{}\n`);
  }
  write(path.join(vault, 'wiki', 'sources', 'mu-note.md'), 'mu source\n');
  write(path.join(vault, 'wiki', 'sources', 'mur-note.md'), 'mur source\n');
  write(path.join(vault, 'wiki', 'concepts', 'shared.md'), 'shared\n');
  write(path.join(vault, 'cockpit', 'street', 'MU.json'), '{"firm":"mu"}\n');
  write(path.join(vault, 'cockpit', 'street', 'MUR.json'), '{"firm":"mur"}\n');
  write(path.join(vault, 'cockpit', 'proposals', 'house-mu.json'), '{}\n');
  write(path.join(vault, 'cockpit', 'proposals', 'house-mur.json'), '{}\n');
  write(path.join(vault, 'cockpit', 'history', 'house-mu.2026.md'), 'hist mu\n');
  write(path.join(vault, 'cockpit', 'history', 'house-mur.2026.md'), 'hist mur\n');
  write(path.join(vault, 'cockpit', 'go-commit-log.jsonl'), '');
  write(path.join(vault, 'cockpit', 'session', 'mu.json'), '{"phase":"REGISTER_COMMITTED"}\n');
  write(path.join(vault, 'cockpit', 'session', 'mur.json'), '{"phase":"REGISTER_COMMITTED"}\n');
  write(path.join(root, 'outside.md'), 'nope\n');
  const registry = {
    desks: [desk('mu', 'MU'), desk('mur', 'MUR')],
  };
  write(path.join(root, 'thin-desks.json'), `${JSON.stringify(registry, null, 2)}\n`);
  return { root, vault, ont, store, registryPath: path.join(root, 'thin-desks.json'), registry };
}

function rels(bundle) {
  return new Set(bundle.items.filter((i) => i.exists).map((i) => i.rel));
}

console.log('\ndesk bundle\n');

const fx = fixture();
const bundles = buildAllBundles({
  desks: fx.registry.desks,
  vaultRoot: fx.vault,
  ontRoot: fx.ont,
  storeDir: fx.store,
});
const mu = bundles.find((b) => b.slug === 'mu');
const mur = bundles.find((b) => b.slug === 'mur');

if (mu?.ok) ok('mu bundle accepts its own files');
else bad(`mu refused: ${(mu?.errors || []).join('; ')}`);

const muRels = rels(mu);
if (muRels.has('wiki/sources/mu-note.md') && !muRels.has('wiki/sources/mur-note.md')) {
  ok('mu owns mu-note.md and not mur-note.md');
} else bad(`mu sources: ${[...muRels].join(', ')}`);

if (muRels.has('cockpit/proposals/house-mu.json') && !muRels.has('cockpit/proposals/house-mur.json')) {
  ok('proposal names are exact');
} else bad('proposal match leaked');

if (muRels.has('cockpit/history/house-mu.2026.md') && !muRels.has('cockpit/history/house-mur.2026.md')) {
  ok('history names are exact');
} else bad('history match leaked');

if (![...muRels].some((r) => r.includes('shared.md'))) ok('shared concept stays out of the bundle');
else bad('shared concept was claimed');

if (mur?.ok && rels(mur).has('wiki/sources/mur-note.md') && !rels(mur).has('wiki/sources/mu-note.md')) {
  ok('mur is the mirror image');
} else bad(`mur ${mur?.ok} ${[...rels(mur)].join(', ')}`);

const overlapped = buildAllBundles({
  desks: [...fx.registry.desks, desk('mu-note', 'MUNOTE')],
  vaultRoot: fx.vault,
  ontRoot: fx.ont,
  storeDir: fx.store,
});
const muOverlap = overlapped.find((b) => b.slug === 'mu');
const noteOverlap = overlapped.find((b) => b.slug === 'mu-note');
if (muOverlap && !muOverlap.ok && noteOverlap && !noteOverlap.ok
  && noteOverlap.errors.some((e) => e.includes('shared with mu'))) {
  ok('a source claimed by mu and mu-note refuses both');
} else bad(`overlap: mu=${muOverlap?.ok} note=${noteOverlap?.ok} ${(noteOverlap?.errors || []).join('; ')}`);

const empty = buildAllBundles({ desks: [], vaultRoot: fx.vault, ontRoot: fx.ont, storeDir: fx.store });
if (empty.length === 0) ok('empty registry yields no bundles');
else bad('empty registry produced bundles');

const escapeDesk = desk('mu', 'MU');
escapeDesk.house_file = '../outside.md';
const escaped = buildAllBundles({
  desks: [escapeDesk],
  vaultRoot: fx.vault,
  ontRoot: fx.ont,
  storeDir: fx.store,
});
if (escaped[0] && !escaped[0].ok && !escaped[0].items.some((i) => i.rel.includes('outside'))) {
  ok('a house path outside the vault is refused');
} else bad(`escape: ${JSON.stringify(escaped[0]?.errors)}`);

write(path.join(fx.ont, 'packs', 'MU.json'), `${JSON.stringify({
  ticker: 'MU',
  source_globs: ['raw/mu-research/*.md', 'wiki/entities/mu.md'],
})}\n`);
write(path.join(fx.vault, 'wiki', 'sources', 'mu-omitted.md'), 'pack forgot this\n');
const omitted = buildAllBundles({
  desks: fx.registry.desks,
  vaultRoot: fx.vault,
  ontRoot: fx.ont,
  storeDir: fx.store,
}).find((b) => b.slug === 'mu');
if (omitted?.ok && rels(omitted).has('wiki/sources/mu-omitted.md') && rels(omitted).has('cockpit/session/mu.json')) {
  ok('a slug-named source and the session file are owned even when the pack glob omits them');
} else bad(`omitted source: ${(omitted?.errors || []).join('; ')} ${[...rels(omitted || { items: [] })].join(', ')}`);

const murBefore = fs.readFileSync(path.join(fx.vault, 'house-view-mur.md'), 'utf8');
const murStreet = fs.readFileSync(path.join(fx.vault, 'cockpit', 'street', 'MUR.json'), 'utf8');
let threw = false;
try {
  deleteDeskBundle({
    registry: fx.registry,
    registryPath: fx.registryPath,
    slug: 'mu',
    confirm: 'nope',
    vaultRoot: fx.vault,
    ontRoot: fx.ont,
    storeDir: fx.store,
  });
} catch (e) {
  threw = e.code === 'desk_delete_confirm';
}
if (threw && fs.existsSync(path.join(fx.vault, 'house-view-mu.md'))) ok('wrong ticker deletes nothing');
else bad('confirm gate failed');

const removed = deleteDeskBundle({
  registry: JSON.parse(fs.readFileSync(fx.registryPath, 'utf8')),
  registryPath: fx.registryPath,
  slug: 'mu',
  confirm: 'MU',
  vaultRoot: fx.vault,
  ontRoot: fx.ont,
  storeDir: fx.store,
  now: new Date('2026-11-14T12:00:00.000Z'),
});
if (removed.ok && removed.registry_removed && removed.deleted > 0) ok('mu delete reports the files removed');
else bad('delete did not report success');

const after = JSON.parse(fs.readFileSync(fx.registryPath, 'utf8'));
if (!after.desks.some((d) => d.slug === 'mu') && after.desks.some((d) => d.slug === 'mur')) {
  ok('registry drops mu and keeps mur');
} else bad(`registry desks: ${after.desks.map((d) => d.slug).join(',')}`);

if (!fs.existsSync(path.join(fx.vault, 'house-view-mu.md'))
  && !fs.existsSync(path.join(fx.vault, 'cockpit', 'trash'))) {
  ok('mu house is deleted and nothing is archived');
} else bad('mu house was kept');

if (!fs.existsSync(path.join(fx.ont, 'packs', 'MU.json'))) {
  ok('mu pack is deleted from the ontology tree');
} else bad('mu pack was kept');

if (fs.readFileSync(path.join(fx.vault, 'house-view-mur.md'), 'utf8') === murBefore
  && fs.readFileSync(path.join(fx.vault, 'cockpit', 'street', 'MUR.json'), 'utf8') === murStreet
  && fs.existsSync(path.join(fx.ont, 'packs', 'MUR.json'))
  && fs.existsSync(path.join(fx.vault, 'wiki', 'concepts', 'shared.md'))
  && fs.existsSync(path.join(fx.vault, 'wiki', 'sources', 'mur-note.md'))) {
  ok('mur and the shared concept are byte-for-byte still there');
} else bad('another desk or a shared file changed');

const log = fs.readFileSync(path.join(fx.vault, 'cockpit', 'go-commit-log.jsonl'), 'utf8');
if (log.includes('"kind":"desk_deleted"') && log.includes('"slug":"mu"')) ok('delete appends one log line');
else bad('go-commit log missing');

if (!fs.existsSync(path.join(fx.vault, 'cockpit', 'session', 'mu.json'))
  && fs.readFileSync(path.join(fx.vault, 'cockpit', 'session', 'mur.json'), 'utf8').includes('REGISTER_COMMITTED')) {
  ok('mu session is deleted, mur session stayed');
} else bad('session files were not split cleanly');

if (!fs.existsSync(path.join(fx.vault, 'wiki', 'sources', 'mu-omitted.md'))) {
  ok('the source the pack forgot is deleted');
} else bad('omitted source stayed in the live vault');

if (!fs.existsSync(`${fx.registryPath}.lock`)) ok('registry lock is released');
else bad('registry lock left behind');

const registryText = `{
  "rooms": ["overview"],
  "desks": [
    {
      "slug": "mu",
      "ticker": "MU",
      "house_file": "house-view-mu.md",
      "profile": { "entitySlug": "mu", "rawDir": "raw/mu-research", "houseTitleDefault": "House View \\u2014 MU" }
    },
    {
      "slug": "mur",
      "ticker": "MUR",
      "house_file": "house-view-mur.md",
      "profile": { "entitySlug": "mur", "rawDir": "raw/mur-research", "houseTitleDefault": "House View \\u2014 MUR" }
    }
  ]
}
`;
const spliced = removeDeskFromRegistryText(registryText, 'mu');
const murObject = registryText.slice(registryText.indexOf('"slug": "mur"') - 6, registryText.lastIndexOf('}') );
if (spliced.includes('House View \\u2014 MUR') && spliced.includes('"slug": "mur"')
  && !/"slug": "mu"/.test(spliced) && JSON.parse(spliced).desks[0].profile.houseTitleDefault.includes('—')) {
  ok('removing one desk leaves the other desk\'s escapes untouched');
} else bad(`splice rewrote a kept desk: ${spliced}`);
if (murObject && spliced.includes(murObject.trim())) ok('the kept desk object is the same bytes');
else bad('kept desk object bytes changed');

fs.rmSync(fx.root, { recursive: true, force: true });

if (fail) {
  console.log(`\ndesk-bundle FAIL ${fail}  pass ${pass}`);
  process.exit(1);
}
console.log(`\ndesk-bundle OK ${pass}`);
