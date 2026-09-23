#!/usr/bin/env node
/**
 * thin-rail-test.mjs — glass rail vs leftover APIs.
 * Ask: off rail, hash + /ask API stay.
 * Compile room: deleted from glass; research/runs API stays for thesis/model_read.
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

console.log('\nthin rail — Ask off glass · Compile room deleted\n');

const rail = read('src/thinDesks.js');
const railFn = rail.match(/export function thinRail\([\s\S]*?^\}\n/m);
if (!railFn) bad('thinRail missing');
else if (/\/ask/.test(railFn[0]) || /Ask —/.test(railFn[0])) bad('thinRail still advertises Ask');
else ok('thinRail has no Ask entry');

if (!railFn) { /* already bad */ }
else if (/\/research/.test(railFn[0]) || /Compile —/.test(railFn[0])) bad('thinRail still advertises Compile');
else ok('thinRail has no Compile entry');
if (!railFn) { /* already bad */ }
else if (!/\/background/.test(railFn[0])) bad('thinRail missing Background');
else ok('thinRail has Background entry');
if (!railFn) { /* already bad */ }
else if (!/\/filings/.test(railFn[0])) bad('thinRail missing Filings');
else ok('thinRail has Filings entry');
if (!railFn) { /* already bad */ }
else if (!/\/drivers/.test(railFn[0]) || !/Drivers/.test(railFn[0])) bad('thinRail missing Drivers');
else ok('thinRail has Drivers entry');
if (!railFn) { /* already bad */ }
else if (!/\/risks/.test(railFn[0]) || !/Risks/.test(railFn[0])) bad('thinRail missing Risks');
else ok('thinRail still has Risks entry');

const overview = read('src/pages/thin/Overview.jsx');
if (/\/ask/.test(overview) || /ask the book/.test(overview)) bad('Overview still chips to Ask');
else ok('Overview has no ask-the-book chip');
if (/location\.hash = `\$\{base\}\/research`/.test(overview) || /> compile</.test(overview)) bad('Overview still chips to Compile');
else ok('Overview has no compile chip');

const empty = read('src/pages/thin/Empty.jsx');
if (/\bask\b/.test(empty)) bad('Empty still lists ask as a room');
else ok('Empty does not list ask as a valid room');
if (/compile/.test(empty) || /\/research/.test(empty)) bad('Empty still lists compile/research as a room');
else ok('Empty does not list compile as a valid room');
if (!/\bbackground\b/.test(empty)) bad('Empty omits background as a valid room');
else ok('Empty lists background as a valid room');
if (!/\bfilings\b/.test(empty)) bad('Empty omits filings as a valid room');
else ok('Empty lists filings as a valid room');

const rooms = JSON.parse(read('config/thin-desks.json')).rooms || [];
if (rooms.includes('ask')) bad('registry rooms still includes ask');
else ok('registry rooms omit ask');
if (rooms.includes('research')) bad('registry rooms still includes research');
else ok('registry rooms omit research');
if (!rooms.includes('filings')) bad('registry rooms omit filings');
else ok('registry rooms include filings');

const model = read('server/thinModel.js');
const roomsLit = model.match(/rooms:\s*\[([^\]]+)\]/);
if (roomsLit && /['"]ask['"]/.test(roomsLit[1])) bad('thinModel contract rooms still include ask');
else ok('thinModel advertised rooms omit ask');
if (roomsLit && /['"]research['"]/.test(roomsLit[1])) bad('thinModel contract rooms still include research');
else ok('thinModel advertised rooms omit research');
if (!model.includes('pack_ask: true')) bad('pack_ask capability dropped');
else ok('pack_ask capability stays');
if (!model.includes('research_runs: true')) bad('research_runs capability dropped');
else ok('research_runs capability stays (thesis/model_read)');
if (!model.includes('learn: true')) bad('learn capability dropped');
else ok('learn capability stays (background + tutor)');
if (!model.includes('learn_map: true')) bad('learn_map capability dropped');
else ok('learn_map capability stays');
if (!model.includes('learnMapPublish') || !model.includes('learnPhotoPublish') || !model.includes('learnPhotoFile')) {
  bad('thinModel missing learn map/photo publishers');
} else ok('thinModel learnMapPublish / learnPhotoPublish / learnPhotoFile stay');

const router = read('src/pages/thin/DeskRouter.jsx');
if (!router.includes('ThinAsk') || !router.includes("startsWith('ask')")) bad('DeskRouter dropped Ask mount');
else ok('DeskRouter still mounts #/{desk}/ask');
if (router.includes('ThinResearch') || router.includes("startsWith('research')")) {
  bad('DeskRouter still mounts Compile room');
} else ok('DeskRouter does not mount Compile room');
if (!router.includes('ThinBackground') || !router.includes("startsWith('background')")) {
  bad('DeskRouter missing Background room');
} else ok('DeskRouter mounts Background room');
if (!router.includes('ThinFilings') || !router.includes("startsWith('filings')")) {
  bad('DeskRouter missing Filings room');
} else ok('DeskRouter mounts Filings room');

const startPage = read('src/pages/Start.jsx');
if (startPage.includes("`#/${row.slug}/research`")) bad('Start still links to Compile room');
else if (!startPage.includes("`#/${row.slug}/reports`")) bad('Start missing Reports shortcut');
else ok('Start desk row goes to Reports, not Compile');
if (!startPage.includes("`#/${row.slug}/filings`")) bad('Start missing Filings shortcut');
else ok('Start desk row goes to Filings room');

const startTpl = fs.readFileSync(path.join(KERNEL, 'scripts/templates/Start.kernel.jsx'), 'utf8');
if (startTpl.includes("`#/${row.slug}/research`")) bad('Start.kernel.jsx still links to Compile room');
else ok('Start template does not link Compile room');

if (!fs.existsSync(path.join(ROOT, 'src/pages/thin/Ask.jsx'))) bad('Ask.jsx missing');
else ok('Ask.jsx kept');
if (fs.existsSync(path.join(ROOT, 'src/pages/thin/Research.jsx'))) bad('Research.jsx still on disk');
else ok('Research.jsx deleted');
if (fs.existsSync(path.join(ROOT, 'src/pages/thin/compileRunList.js'))) bad('compileRunList.js still on disk');
else ok('compileRunList.js deleted');

const mount = read('server/thinDeskMount.js');
if (!/\/api\/:slug\/ask/.test(mount)) bad('thinDeskMount dropped /ask routes');
else ok('GET/POST /api/{slug}/ask stay');
if (!/research\/runs/.test(mount)) bad('thinDeskMount dropped research/runs routes');
else ok('research/runs routes stay');
if (!/\/api\/:slug\/learn/.test(mount)) bad('thinDeskMount missing /learn routes');
else ok('GET/POST /api/{slug}/learn stay');
if (!/learn\/map/.test(mount) || !/learn\/photos/.test(mount)) bad('thinDeskMount missing learn map/photos routes');
else ok('POST /learn/map and GET/POST /learn/photos stay');
if (!fs.existsSync(path.join(ROOT, 'src/pages/thin/LearnDiagrams.jsx'))
  || !fs.existsSync(path.join(ROOT, 'src/pages/thin/LearnPhotos.jsx'))
  || !fs.existsSync(path.join(ROOT, 'src/pages/thin/learnDiagramLayout.js'))) {
  bad('LearnDiagrams / LearnPhotos / layout missing');
} else ok('architecture glass files stay');

const profiles = read('server/thinDeskProfiles.js');
if (!profiles.includes('askProfileFromDesk')) bad('ask profiles dropped');
else ok('profile.ask factory stays');

const ensurePath = path.join(KERNEL, 'scripts/ensure-thin-rooms.mjs');
if (!fs.existsSync(ensurePath)) {
  bad('ensure-thin-rooms.mjs missing');
} else {
  const ensure = fs.readFileSync(ensurePath, 'utf8');
  if (!ensure.includes("'research'") || !ensure.includes('DROP')) bad('ensure-thin-rooms DROP missing research');
  else if (!/DROP\s*=\s*\[[^\]]*research/.test(ensure)) bad('ensure-thin-rooms does not drop research');
  else ok('ensure-thin-rooms drops ask + research on upgrade');
  if (/REQUIRED[\s\S]*'research'/.test(ensure) && !/DROP[\s\S]*research/.test(ensure)) {
    bad('ensure-thin-rooms still requires research');
  }
}

console.log(`\nthin-rail ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
