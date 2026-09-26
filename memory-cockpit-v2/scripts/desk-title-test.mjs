#!/usr/bin/env node
/** Desk title is ticker-agnostic. Slug and ticker are not a company name. */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { shownCompanyName } from '../src/deskTitle.js';

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\ndesk title\n');

const acme = { slug: 'acme', ticker: 'ACME', displayName: 'Acme Widgets, Inc.', label: 'ACME' };
if (shownCompanyName('acme', acme) === 'Acme Widgets, Inc.') ok('slug pack name uses registry display name');
else bad('slug leaked as title');
if (shownCompanyName('ACME', acme) === 'Acme Widgets, Inc.') ok('ticker pack name uses registry display name');
else bad('ticker leaked as title');
if (shownCompanyName('', acme) === 'Acme Widgets, Inc.') ok('empty pack name uses registry display name');
else bad('empty name');
if (shownCompanyName('Northwind Holdings', acme) === 'Northwind Holdings') ok('a real pack name is kept');
else bad('real name replaced');
if (shownCompanyName('Acme Widgets, Inc.', acme) === 'Acme Widgets, Inc.') ok('display name stored on the pack is kept');
else bad('display name dropped');

const nwd = { slug: 'nwd', ticker: 'NWD', displayName: 'Northwind', label: 'NWD' };
if (shownCompanyName('nwd', nwd) === 'Northwind') ok('second ticker also refuses the slug');
else bad('second ticker hardcoded path');
if (shownCompanyName('NWD', { slug: 'nwd', ticker: 'NWD', label: 'NWD' }) === 'NWD') ok('ticker label remains when no display name exists');
else bad('label fallback');

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const engine = [
  'memory-cockpit-v2/src/deskTitle.js',
  'memory-cockpit-v2/server/houseStance.js',
  'memory-cockpit-v2/server/thinModel.js',
  'memory-cockpit-v2/src/pages/thin/Overview.jsx',
  'ontology/compile/from_wiki.py',
  'scripts/scaffold-new-desk.sh',
  'memory-cockpit-v2/scripts/house-stance-test.mjs',
];
for (const rel of engine) {
  const text = fs.readFileSync(path.join(root, rel), 'utf8');
  const banned = ['Tem', 'pus'].join('');
  if (text.toLowerCase().includes(banned.toLowerCase())) bad(`${rel} names a specific company`);
  else ok(`${rel} names no company`);
}

if (fail) {
  console.log(`\ndesk-title FAIL ${fail}  pass ${pass}`);
  process.exit(1);
}
console.log(`\ndesk-title OK ${pass}`);
