#!/usr/bin/env node
/**
 * phone-chrome-test.mjs — locked iPhone shell (~640px).
 * Phone behavior only inside @media (max-width: 640px).
 * Desktop shell (52px rail + full desk-switch) must remain in the default CSS.
 * Factory: every registry desk free-rides shared App.jsx + theme.css. desks=[] still has Start + shell.
 */
import { readFileSync, existsSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

let pass = 0;
let fail = 0;
const ok = (n) => { pass++; console.log(`  ✓ ${n}`); };
const bad = (n, m) => { fail++; console.log(`  ✗ ${n} — ${m}`); };

function read(rel) {
  const p = path.join(ROOT, rel);
  if (!existsSync(p)) return '';
  return readFileSync(p, 'utf8');
}

const css = read('src/theme.css');
const app = read('src/App.jsx');
const railSrc = read('src/thinDesks.js');

console.log('\nphone-chrome (iPhone shell lock)\n');

const idx640 = css.search(/@media\s*\(\s*max-width:\s*640px\s*\)/);
if (idx640 < 0) {
  bad('640 media', 'missing @media (max-width: 640px)');
} else {
  ok('@media (max-width: 640px) present');
}

const desktop = idx640 >= 0 ? css.slice(0, idx640) : css;
const phone = idx640 >= 0 ? css.slice(idx640) : '';

if (/grid-template-columns:\s*52px\s+1fr/.test(desktop)) ok('desktop .shell is 52px + 1fr');
else bad('desktop shell', 'default CSS must keep grid-template-columns: 52px 1fr');

if (/\.desk-phone,\s*\.room-bar\s*\{[^}]*display:\s*none/.test(desktop)
  || /\.desk-phone,\s*\.room-bar \{ display: none; \}/.test(desktop)) {
  ok('desk-phone + room-bar hidden in default CSS');
} else {
  bad('desktop hide', 'desk-phone and room-bar must be display:none outside the 640px query');
}

if (/\.rail\s*\{[^}]*flex-direction:\s*column/.test(desktop)) ok('desktop .rail is a column');
else bad('desktop rail', 'default .rail must stay flex-direction: column');

if (/grid-template-columns:\s*52px/.test(phone)) {
  bad('phone shell', '640px block must not restate 52px rail columns as the phone layout');
} else {
  ok('640px block does not keep 52px rail columns');
}

const phoneNeedles = [
  [/\.desk-switch\s*\{\s*display:\s*none/, 'hides .desk-switch'],
  [/\.rail\s*\{\s*display:\s*none/, 'hides .rail'],
  [/\.room-bar\s*\{/, 'defines .room-bar'],
  [/min-height:\s*44px/, '~44px tap targets'],
  [/safe-area-inset-/, 'safe-area insets'],
  [/overflow-x:\s*hidden/, 'keeps overflow-x hidden'],
  [/overflow-x:\s*auto/, 'keeps table swipe (overflow-x auto)'],
  [/\.px4\s*\{[^}]*1fr/, 'keeps 1-col .px4'],
  [/\.prose\s*\{[^}]*16px/, 'raises .prose type'],
];
for (const [re, label] of phoneNeedles) {
  if (re.test(phone)) ok(`640px ${label}`);
  else bad(`640px ${label}`, 'missing from phone block');
}

if (app.includes('desk-phone')) ok('App.jsx has desk-phone picker');
else bad('App desk-phone', 'missing phone Desks picker');

if (app.includes('Desks') && app.includes('desk-phone-go')) ok('App.jsx Desks control label');
else bad('App Desks', 'picker must expose a Desks control');

if (app.includes('room-bar')) ok('App.jsx has room-bar');
else bad('App room-bar', 'missing phone room thumb bar');

if (app.includes('thinRail') && /room-bar[\s\S]*rail\.map/.test(app)) ok('room-bar maps thinRail');
else bad('room-bar source', 'must map the same thinRail() list');

if (app.includes('className="desk-switch"') && app.includes('desks.map')) ok('desktop desk-switch still in App');
else bad('desk-switch', 'must keep the desktop tab row in the DOM');

if (app.includes('className="rail"')) ok('desktop .rail still in App');
else bad('rail DOM', 'must keep the desktop left rail');

if (app.includes('className="top"') && app.includes('className="shell"') && app.includes('<main>')) {
  ok('shared chrome .top + .shell + main (empty product still has Start + shell)');
} else {
  bad('shared chrome', 'Start/unknown/desk must share .top .shell main');
}

if (!existsSync(path.join(ROOT, 'src/pages/nvda')) && !existsSync(path.join(ROOT, 'src/pages/avgo'))) {
  ok('no per-ticker pages/{ticker}/ fork');
} else {
  bad('pages/{ticker}', 'do not add a per-ticker UI fork');
}

if (/export function thinRail/.test(railSrc)) ok('thinRail factory list present');
else bad('thinRail', 'room-bar must share thinRail()');

const idx = read('index.html');
if (/viewport-fit=cover/.test(idx)) ok('index.html viewport-fit=cover');
else bad('viewport', 'need viewport-fit=cover for safe-area');

console.log(`\nphone-chrome ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
