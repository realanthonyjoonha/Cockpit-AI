#!/usr/bin/env node
/**
 * thin-rail-test.mjs — Ask is off the glass rail; pack Q&A stays on API/CLI + hash route.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const KERNEL = path.join(ROOT, '..');

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };
const read = (rel) => fs.readFileSync(path.join(ROOT, rel), 'utf8');

console.log('\nthin rail — Ask off glass\n');

const rail = read('src/thinDesks.js');
const railFn = rail.match(/export function thinRail\([\s\S]*?^\}\n/m);
if (!railFn) bad('thinRail missing');
else if (/\/ask/.test(railFn[0]) || /Ask —/.test(railFn[0])) bad('thinRail still advertises Ask');
else ok('thinRail has no Ask entry');

const overview = read('src/pages/thin/Overview.jsx');
if (/\/ask/.test(overview) || /ask the book/.test(overview)) bad('Overview still chips to Ask');
else ok('Overview has no ask-the-book chip');

const empty = read('src/pages/thin/Empty.jsx');
if (/\bask\b/.test(empty)) bad('Empty still lists ask as a room');
else ok('Empty does not list ask as a valid room');

const rooms = JSON.parse(read('config/thin-desks.json')).rooms || [];
if (rooms.includes('ask')) bad('registry rooms still includes ask');
else ok('registry rooms omit ask');

const model = read('server/thinModel.js');
const roomsLit = model.match(/rooms:\s*\[([^\]]+)\]/);
if (roomsLit && /['"]ask['"]/.test(roomsLit[1])) bad('thinModel contract rooms still include ask');
else ok('thinModel advertised rooms omit ask');
if (!model.includes('pack_ask: true')) bad('pack_ask capability dropped');
else ok('pack_ask capability stays');

const router = read('src/pages/thin/DeskRouter.jsx');
if (!router.includes('ThinAsk') || !router.includes("startsWith('ask')")) bad('DeskRouter dropped Ask mount');
else ok('DeskRouter still mounts #/{desk}/ask');

if (!fs.existsSync(path.join(ROOT, 'src/pages/thin/Ask.jsx'))) bad('Ask.jsx missing');
else ok('Ask.jsx kept');

const mount = read('server/thinDeskMount.js');
if (!/\/api\/:slug\/ask/.test(mount)) bad('thinDeskMount dropped /ask routes');
else ok('GET/POST /api/{slug}/ask stay');

const profiles = read('server/thinDeskProfiles.js');
if (!profiles.includes('askProfileFromDesk')) bad('ask profiles dropped');
else ok('profile.ask factory stays');

const ensurePath = path.join(KERNEL, 'scripts/ensure-thin-rooms.mjs');
if (!fs.existsSync(ensurePath)) {
  bad('ensure-thin-rooms.mjs missing');
} else {
  const ensure = fs.readFileSync(ensurePath, 'utf8');
  if (!ensure.includes("DROP = ['ask']")) bad('ensure-thin-rooms does not drop ask');
  else ok('ensure-thin-rooms drops ask on upgrade');
}

console.log(`\nthin-rail ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
