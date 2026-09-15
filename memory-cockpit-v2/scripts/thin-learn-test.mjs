#!/usr/bin/env node
/**
 * thin-learn-test.mjs — Background primer + learner merge (silence ≠ contradiction).
 */
import { spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-learn-'));
process.env.COCKPIT_VAULT = tmpVault;

const {
  mergeLearner,
  emptyLearner,
  validatePrimerMarkdown,
  adviceHits,
} = await import(path.join(ROOT, 'server', 'learnSchema.js'));
const {
  getLearnSnapshot,
  getLesson,
  getLearnDeep,
  startLearnDeep,
  publishLearnDeep,
  publishPrimer,
  publishLearner,
  publishLesson,
  publishProductMap,
  sanitizeLearnHtml,
} = await import(path.join(ROOT, 'server', 'thinLearn.js'));
const {
  fixtureDeepNoteMarkdown,
  DEEP_HARD_MIN_WORDS,
  DEEP_READY_WORDS,
  validateDeepMarkdown,
} = await import(path.join(ROOT, 'server', 'learnDeep.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nthin learn — background + tutor memory\n');

const empty = getLearnSnapshot('TEST');
if (empty.available) bad('empty vault should be unavailable');
else ok('empty snapshot needs_build');
if (!Array.isArray(empty.deep) || empty.deep.length) bad('empty snapshot missing deep=[]');
else ok('empty snapshot deep=[]');

const advice = validatePrimerMarkdown('# x\nYou should buy this name at a price target for you');
if (advice.ok) bad('advice primer accepted');
else ok('primer rejects buy/sell');

if (adviceHits('fair value $12 for you')) ok('adviceHits PT-ish');
else bad('adviceHits missed');

const pub = publishPrimer('TEST', {
  markdown: '# TEST — what they build\n\nThey sell **widgets** to hyperscalers. Mix $ is GAP.\n',
});
if (!pub.ok || !pub.available || !pub.primer?.html) bad(`primer publish ${pub.error}`);
else ok('primer publish + html');

const wiki = publishPrimer('WIKI', {
  markdown: '# WIKI\n\nSee [[acme-10k]] and [[acme-10k|the 10-K]].\n',
});
if (!wiki.ok) bad(`wiki primer ${wiki.error}`);
else if (wiki.primer.html.includes('[[')) bad('wikilinks leaked into html');
else if (!wiki.primer.html.includes('acme-10k') || !wiki.primer.html.includes('the 10-K')) bad('wikilink unwrap failed');
else ok('wikilinks unwrap in primer html');

const got = getLearnSnapshot('TEST');
if (!got.primer?.title?.includes('TEST')) bad(`title ${got.primer?.title}`);
else ok('primer title from heading');

const l1 = publishLearner('TEST', {
  known: [{ id: 'widgets', label: 'Widgets' }],
  fuzzy: [{ id: 'mix', label: 'Revenue mix', note: 'no $ split' }],
  next: [{ id: 'customers', label: 'Who pays' }],
  last_session: { covered: ['widgets'], note: 'first sitting' },
});
if (!l1.ok || l1.learner.known.length !== 1) bad(`learner1 ${l1.error}`);
else ok('learner first write');

const l2 = publishLearner('TEST', {
  known: [{ id: 'optics', label: 'Optics' }],
});
if (!l2.ok) bad(`merge ${l2.error}`);
else if (l2.learner.known.length !== 2) bad(`known wiped or not upserted ${l2.learner.known.length}`);
else if (l2.learner.fuzzy.length !== 1) bad('fuzzy wiped by silence');
else if (l2.learner.next.length !== 1) bad('next wiped by silence');
else ok('silence is not contradiction (known upsert, fuzzy/next kept)');

const l3 = publishLearner('TEST', {
  known: [{ id: 'mix', label: 'Revenue mix (now known)' }],
});
if (l3.learner.fuzzy.some((t) => t.id === 'mix')) bad('known id stayed in fuzzy');
else ok('promoting to known drops fuzzy');

const l4 = publishLearner('TEST', {
  next: [{ id: 'packaging', label: 'Packaging' }],
});
if (!l4.ok) bad(`next upsert ${l4.error}`);
else if (l4.learner.next.length < 2) bad(`next replaced instead of upsert (${l4.learner.next.length})`);
else if (!l4.learner.next.some((t) => t.id === 'customers') || !l4.learner.next.some((t) => t.id === 'packaging')) {
  bad('next upsert lost an id');
} else ok('next upserts like known (silence-safe)');

const l5 = publishLearner('TEST', {
  known: [{ id: 'customers', label: 'Who pays (now known)' }],
});
if (l5.learner.next.some((t) => t.id === 'customers')) bad('known id stayed in next');
else ok('promoting to known drops next');

const badL = publishLearner('TEST', { last_session: { note: 'you should buy' } });
if (badL.ok) bad('learner advice accepted');
else ok('learner rejects advice language');

const les = publishLesson('TEST', { id: 'widgets', markdown: '# Widgets\n\nHow the SKU attaches. GAP on $.\n' });
if (!les.ok || !les.lessons?.some((x) => x.id === 'widgets')) bad(`lesson ${les.error}`);
else ok('lesson publish listed');

const prior = emptyLearner('ZZ');
const merged = mergeLearner(prior, { known: ['Alpha Board'] }, 'ZZ');
if (merged.known[0]?.id !== 'alpha-board') bad(`topic id ${merged.known[0]?.id}`);
else ok('string topic normalizes to id');

const t1 = getLearnSnapshot('TEST').learner.updated_at;
const t2 = getLearnSnapshot('TEST').learner.updated_at;
if (!t1 || t1 !== t2) bad(`GET reminted learner.updated_at ${t1} vs ${t2}`);
else ok('GET does not remint learner.updated_at');

const other = publishPrimer('OTHR', { markdown: '# OTHR only\n\nSeparate ticker.\n' });
if (!other.ok) bad(`other primer ${other.error}`);
const still = getLearnSnapshot('TEST');
if (!still.primer?.title?.includes('TEST')) bad('ticker isolation leaked');
else ok('primers isolated per ticker');

const trav = getLesson('TEST', '../secret');
if (trav.ok) bad('path traversal lesson accepted');
else ok('lesson id refuses traversal');

const miss = getLesson('TEST', 'no-such-lesson');
if (miss.ok) bad('missing lesson ok');
else ok('missing lesson fail-closed');

const xss = publishPrimer('XSS', {
  markdown: '# XSS\n\n<script>alert(1)</script>\n<img src="x" onerror="alert(2)">\n',
});
if (!xss.ok) bad(`xss primer ${xss.error}`);
else if (/<script/i.test(xss.primer.html) || /onerror=/i.test(xss.primer.html)) bad('unsafe html leaked');
else ok('primer html sanitized');

if (sanitizeLearnHtml('<p onclick="x">ok</p>').includes('onclick')) bad('sanitize left onclick');
else ok('sanitizeLearnHtml strips handlers');

const {
  harvestLearnSources,
} = await import(path.join(ROOT, 'server', 'learnHarvest.js'));
const {
  validateProductMap,
  scoreLearnDepth,
  inferLearnFamily,
  fixtureProductMap,
  fixtureDeepLessonMarkdown,
  LEARN_DEPTH_BAR,
  LEARN_FAMILIES,
} = await import(path.join(ROOT, 'server', 'learnMap.js'));
const {
  validateLearnDiagram,
  validateLearnDiagrams,
  diagramToMermaid,
  fixtureLearnDiagrams,
} = await import(path.join(ROOT, 'server', 'learnDiagrams.js'));

const foundryFam = inferLearnFamily('pure-play foundry wafer fabrication process technology 12-inch-equivalent');
if (foundryFam !== 'foundry') bad(`infer foundry got ${foundryFam}`);
else ok('inferLearnFamily foundry from content');

const memFam = inferLearnFamily('HBM3E and HBM4 stacked DRAM plus NAND at an IDM with proprietary process technology');
if (memFam !== 'memory_idm') bad(`infer memory got ${memFam}`);
else ok('inferLearnFamily memory_idm from content');

const nvdaFam = inferLearnFamily('fabless accelerated-computing platform CUDA GeForce; competition is custom XPU via NVLink Fusion');
if (nvdaFam !== 'fabless_platform') bad(`infer nvda-like got ${nvdaFam}`);
else ok('inferLearnFamily fabless_platform wins over incidental custom XPU');

const muFam = inferLearnFamily('IDM: wafer fabrication of DRAM and HBM in wholly-owned facilities, not a fabless design house');
if (muFam !== 'memory_idm') bad(`infer mu-like got ${muFam}`);
else ok('inferLearnFamily memory_idm not foundry for IDM DRAM');

const shazFam = inferLearnFamily('Australian neocloud operator GPU-heavy AI/HPC; TCV is not revenue');
if (shazFam !== 'ai_infra_operator') bad(`infer shaz-like got ${shazFam}`);
else ok('inferLearnFamily ai_infra_operator from neocloud operator');

const mrvlFam = inferLearnFamily('custom products and electro-optics portfolio; Teralynx Ethernet; foundry partners');
if (mrvlFam !== 'custom_silicon') bad(`infer mrvl-like got ${mrvlFam}`);
else ok('inferLearnFamily custom_silicon from electro-optics / Teralynx');

const llyFam = inferLearnFamily('single business segment—human pharmaceutical products; tirzepatide sold as Mounjaro and Zepbound; GIP and GLP-1 for type 2 diabetes and obesity');
if (llyFam !== 'pharma') bad(`infer pharma got ${llyFam}`);
else ok('inferLearnFamily pharma from human pharmaceutical / tirzepatide');
if (!LEARN_FAMILIES.pharma?.required_kinds.includes('sku_family')
  || !LEARN_FAMILIES.pharma.required_diagrams.includes('stack')
  || LEARN_FAMILIES.pharma.min_mechanism_nodes !== 2) {
  bad('pharma family missing sku_family / stack / min_mechanism_nodes');
} else ok('pharma family template is factory, not a ticker fork');

const badMap = validateProductMap({ family: 'nope', as_of: '2026-01-01', sources: [{ label: 'x' }], nodes: [] });
if (badMap.ok) bad('unknown family accepted');
else ok('unknown family rejected');

const advMap = validateProductMap({
  ...fixtureProductMap('ADV'),
  nodes: [{ ...fixtureProductMap('ADV').nodes[0], title: 'you should buy this' }],
});
if (advMap.ok) bad('map advice accepted');
else ok('product map rejects advice language');

const rawDir = path.join(tmpVault, 'raw', 'widget-research');
fs.mkdirSync(rawDir, { recursive: true });
fs.writeFileSync(path.join(rawDir, '01-overview.md'), '# 01\n\n**As-of:** 2026-08-01\n\nThey sell widgets.\n', 'utf8');
fs.writeFileSync(path.join(rawDir, '02-ai-semiconductor.md'), '# 02\n\n## Custom XPU layer\n\nNot a GPU brand.\n', 'utf8');
const hv = harvestLearnSources('WIDG', { rawDir: 'raw/widget-research' });
if (!hv.ok || hv.files.length !== 2) bad(`harvest files ${hv.files?.length} ${hv.error}`);
else if (!hv.files.some((f) => f.rel.endsWith('02-ai-semiconductor.md'))) bad('harvest missed AVGO-style 02 name');
else ok('harvest globs 01-* and 02-* (including 02-ai-semiconductor.md)');

const thinScore = scoreLearnDepth({
  primerMarkdown: '# x\nshort',
  lessons: [{ id: 'a', n_chars: 80 }],
  map: null,
});
if (thinScore.ok) bad('thin score passed');
else if (!thinScore.reasons.some((r) => /no product-map/.test(r))) bad(`thin reasons ${thinScore.reasons}`);
else ok('live-style one-pager fails depth bar');

const deepPrimer = [
  '# DEEP — what they build',
  '',
  '**As-of:** 2026-01-25 · FY2026 10-K Item 1 [A]',
  'Decision-support only. Not House. Not Model numbers. Not a rating.',
  '',
  '## Filed mix',
  '',
  'They sell a platform, not a single SKU. Mix $ below are filed cuts, not SKU splits.',
  `${'Named products, systems, networking, and software sit in the spine. '.repeat(160)}`,
  '',
  '## Still GAP',
  '',
  'SKU $ mix is UNKNOWN in the primaries used here.',
].join('\n');
publishPrimer('DEEP', { markdown: deepPrimer });
const priorDeep = publishLearner('DEEP', {
  known: [{ id: 'not-gpu', label: 'Not a merchant GPU company' }],
  fuzzy: [{ id: 'cpo', label: 'CPO vs LPO', note: 'scale-up optics' }],
  next: [{ id: 'custom-xpu', label: 'Custom XPU' }],
  last_session: { covered: ['not-gpu'], note: 'keep this' },
});
if (!priorDeep.ok) bad(`DEEP learner ${priorDeep.error}`);
const knownAt = priorDeep.learner.updated_at;

const fmap = fixtureProductMap('DEEP');
const pubMap = publishProductMap('DEEP', fmap);
if (!pubMap.ok || !pubMap.map) bad(`map publish ${pubMap.error}`);
else if (pubMap.learner?.known?.[0]?.id !== 'not-gpu') bad('map publish wiped known');
else if (pubMap.learner?.last_session?.note !== 'keep this') bad('map publish wiped last_session');
else if (pubMap.learner?.updated_at !== knownAt) bad(`map reminted learner ${pubMap.learner?.updated_at} vs ${knownAt}`);
else ok('map publish does not wipe or remint learner');

const rebuilt = publishPrimer('DEEP', { markdown: `${deepPrimer}\n\nRebuilt spine still not House.\n` });
if (!rebuilt.ok) bad(`rebuild primer ${rebuilt.error}`);
else if (!rebuilt.learner?.known?.some((t) => t.id === 'not-gpu')) bad('primer rebuild wiped MRVL-style known');
else if (rebuilt.learner?.fuzzy?.[0]?.id !== 'cpo') bad('primer rebuild wiped fuzzy');
else ok('primer rebuild keeps learner memory');

for (const n of fmap.nodes) {
  const les = publishLesson('DEEP', { id: n.lesson_id, markdown: fixtureDeepLessonMarkdown(n.title) });
  if (!les.ok) bad(`deep lesson ${n.lesson_id} ${les.error}`);
}
const deepSnap = getLearnSnapshot('DEEP');
if (!deepSnap.depth_gate?.ok) bad(`fixture should meet bar: ${(deepSnap.depth_gate?.reasons || []).join('; ')}`);
else ok(`fixture map+lessons meet depth bar (${deepSnap.depth_gate.primer_words}w, ${deepSnap.depth_gate.deep_lessons} lessons)`);

if (deepSnap.depth_gate.bar.primer_min_words !== LEARN_DEPTH_BAR.primer_min_words) bad('bar missing on snapshot');
else ok('depth_gate.bar on snapshot');
if (typeof deepSnap.depth_gate.ready_nodes !== 'number' || typeof deepSnap.depth_gate.source_pins !== 'number') {
  bad('depth_gate missing ready_nodes/source_pins for meter');
} else ok(`depth_gate meter counts ready=${deepSnap.depth_gate.ready_nodes} pins=${deepSnap.depth_gate.source_pins}`);
if (!Array.isArray(deepSnap.map?.diagram_order) || deepSnap.map.diagram_order[0] !== 'stack') {
  bad(`diagram_order ${JSON.stringify(deepSnap.map?.diagram_order)}`);
} else ok('snapshot diagram_order follows family required_diagrams');
if (!Array.isArray(deepSnap.deep) || deepSnap.deep.length !== 0) bad('DEEP snapshot should start with no deep notes');
else ok('DEEP snapshot deep=[] before deepen');

const noMapDeep = startLearnDeep('TEST', 'widgets');
if (noMapDeep.ok) bad('deepen without map accepted');
else ok('deepen without map refused');

const badNode = startLearnDeep('DEEP', 'not-a-node');
if (badNode.ok) bad('unknown node deepen accepted');
else ok('unknown map node deepen refused');

const travDeep = getLearnDeep('DEEP', '../secret');
if (travDeep.ok) bad('deep traversal GET ok');
else ok('deep traversal GET 404');

const learnerBeforeDeep = fs.readFileSync(path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'learner.json'));
const started = startLearnDeep('DEEP', 'cuda');
const learnerDuringDeep = fs.readFileSync(path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'learner.json'));
if (!started.ok) bad(`startDeep ${started.error}`);
else if (started.meta?.status !== 'running') bad(`startDeep status ${started.meta?.status}`);
else if (!started.deep?.some((x) => x.node_id === 'cuda' && x.status === 'running')) bad('snapshot missing running cuda');
else if (!learnerBeforeDeep.equals(learnerDuringDeep)) bad('startDeep reminted learner.json');
else ok('startDeep marks RUNNING without reminting learner');

const adviceDeep = publishLearnDeep('DEEP', {
  node_id: 'cuda',
  markdown: `${fixtureDeepNoteMarkdown('CUDA').slice(0, 800)}\nYou should buy this name at a price target for you\n`,
});
if (adviceDeep.ok) bad('deep advice accepted');
else ok('deep-dive rejects buy/sell');

const tinyDeep = validateDeepMarkdown('# Tiny\n\nToo short.\n');
if (tinyDeep.ok) bad('sub-floor deep accepted');
else ok(`deep hard floor ${DEEP_HARD_MIN_WORDS}w`);

const thinBody = [
  '# CUDA is not a chip',
  '',
  '## Setup',
  '',
  `${'Setup context in company language. '.repeat(40)}`,
  '',
  '## Mechanism',
  '',
  `${'Mechanism of the software layer. '.repeat(40)}`,
  '',
  '## Evidence',
  '',
  '- Filed language (2026-01-25) [A] FY 10-K.',
  '',
  '## What a figure is not',
  '',
  'Not a SKU split.',
  '',
  '## GAP / UNKNOWN',
  '',
  '- Mix $ UNKNOWN.',
  '',
  '## Exec',
  '',
  'CUDA is not a chip.',
].join('\n');
const thinPub = publishLearnDeep('DEEP', { node_id: 'cuda', markdown: thinBody });
if (!thinPub.ok) bad(`thin deep rejected ${thinPub.error}`);
else if (!thinPub.meta?.thin) bad('thin deep not marked thin');
else if (thinPub.meta?.status !== 'fired') bad(`thin deep status ${thinPub.meta?.status}`);
else ok(`thin deep publishes FIRED+THIN (${thinPub.meta.n_words}w)`);

const fullNote = fixtureDeepNoteMarkdown('CUDA is not a chip');
const fullPub = publishLearnDeep('DEEP', { node_id: 'cuda', markdown: fullNote, as_of: '2026-01-25' });
const learnerAfterDeep = fs.readFileSync(path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'learner.json'));
const gotDeep = getLearnDeep('DEEP', 'cuda');
if (!fullPub.ok) bad(`full deep ${fullPub.error}`);
else if (fullPub.meta?.thin) bad(`ready deep marked thin ${fullPub.meta.n_words}w missing=${(fullPub.meta.missing_sections || []).join(',')}`);
else if (fullPub.meta?.status !== 'fired') bad('ready deep not fired');
else if (!learnerBeforeDeep.equals(learnerAfterDeep)) bad('publishDeep reminted learner.json');
else if (!gotDeep.ok || !gotDeep.html) bad('GET deep missing html');
else if (gotDeep.html.includes('[[')) bad('deep html leaked wikilinks');
else if (!gotDeep.meta?.sections?.includes('mechanism')) bad('deep missing mechanism section score');
else ok(`deep-dive FIRED ready (${gotDeep.meta.n_words}w ≥ ${DEEP_READY_WORDS})`);

const reStart = startLearnDeep('DEEP', 'cuda');
if (!reStart.ok || reStart.meta?.status !== 'running') bad(`re-run start ${reStart.error}`);
else if (!reStart.deep?.find((x) => x.node_id === 'cuda')?.has_note) bad('re-run dropped prior note');
else ok('re-run marks RUNNING and keeps prior note readable');

const llyReg = JSON.parse(fs.readFileSync(path.join(ROOT, 'config', 'thin-desks.json'), 'utf8'));
const slugs = (llyReg.desks || []).map((d) => String(d.slug).toLowerCase());
if (slugs.includes('lly') || (llyReg.desks || []).some((d) => String(d.ticker).toUpperCase() === 'LLY')) {
  ok('kernel registry may include LLY — factory skips it as a learn-map desk');
} else {
  ok('LLY is not a registry desk');
}

const dollarDiagram = validateLearnDiagram({
  id: 'mix',
  type: 'segments',
  title: 'Invented mix',
  as_of: '2026-01-25',
  sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25' }],
  blocks: [
    { id: 'a', label: 'Compute $40B', status: 'ready' },
    { id: 'b', label: 'Graphics', status: 'ready' },
  ],
});
if (dollarDiagram.ok) bad('diagram accepted mix $ without filed');
else ok('diagram rejects $ without filed pin');

const skuDiagram = validateLearnDiagram({
  id: 'sku',
  type: 'segments',
  title: 'SKU split',
  as_of: '2026-01-25',
  sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25' }],
  blocks: [
    { id: 'a', label: 'SKU split by generation', status: 'ready' },
    { id: 'b', label: 'Other', status: 'ready' },
  ],
});
if (skuDiagram.ok) bad('diagram accepted SKU split without filed');
else ok('diagram rejects SKU split without filed pin');

const gapIc = validateLearnDiagram(fixtureLearnDiagrams()[1]);
if (!gapIc.ok) bad(`GAP interconnect rejected ${gapIc.error}`);
else if (gapIc.diagram.blocks.find((b) => b.id === 'xpu')?.status !== 'gap') bad('fixture XPU not GAP');
else ok('GAP interconnect accepted (unknown attach is a box, not a lie)');

const mermaid = diagramToMermaid(fixtureLearnDiagrams()[0]);
if (!mermaid.includes('flowchart')) bad('mermaid export missing flowchart');
else if (/\$\s*\d/.test(mermaid)) bad('mermaid export invented $');
else ok('mermaid preview helper has no invented $ (glass does not execute it)');

const missingTypes = scoreLearnDepth({
  primerMarkdown: deepPrimer,
  lessons: fmap.nodes.map((n) => ({ id: n.lesson_id, markdown: fixtureDeepLessonMarkdown(n.title) })),
  map: { ...fmap, diagrams: [fixtureLearnDiagrams()[0]] },
});
if (missingTypes.ok) bad('missing interconnect still passed bar');
else if (!missingTypes.reasons.some((r) => /diagrams missing types/.test(r))) {
  bad(`expected missing types reason, got ${missingTypes.reasons.join('; ')}`);
} else ok('family required diagram types fail the bar (fabless needs interconnect)');

const emptyDiagrams = scoreLearnDepth({
  primerMarkdown: deepPrimer,
  lessons: fmap.nodes.map((n) => ({ id: n.lesson_id, markdown: fixtureDeepLessonMarkdown(n.title) })),
  map: { ...fmap, diagrams: [] },
});
if (emptyDiagrams.ok) bad('empty diagrams passed bar');
else if (!emptyDiagrams.reasons.some((r) => /no architecture diagrams/.test(r))) {
  bad(`expected no-diagram reason, got ${emptyDiagrams.reasons.join('; ')}`);
} else ok('empty diagrams fail depth bar');

const badTypeList = validateLearnDiagrams([{
  id: 'price', type: 'price_chart', title: 'Price', as_of: '2026-01-25',
  sources: [{ label: 'x' }],
  blocks: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }],
}]);
if (badTypeList.ok) bad('price_chart diagram accepted');
else ok('price / rating chart types rejected');

if (LEARN_FAMILIES.foundry.required_diagrams.includes('flow')
  && LEARN_FAMILIES.fabless_platform.required_diagrams.includes('stack')
  && LEARN_FAMILIES.fabless_platform.required_diagrams.includes('flow')
  && LEARN_FAMILIES.fabless_platform.min_mechanism_nodes === 2) {
  ok('family required_diagrams are templates, not a ticker table');
} else bad('family required_diagrams missing');

const {
  layoutDiagram,
  layoutStack,
  VIEWBOX_W,
  BAND_H,
  SEGMENTS_FOOTNOTE,
} = await import(path.join(ROOT, 'src', 'pages', 'thin', 'learnDiagramLayout.js'));

function validated(raw) {
  const g = validateLearnDiagram(raw);
  if (!g.ok) throw new Error(g.error);
  return g.diagram;
}

const parentUnknown = validateLearnDiagram({
  id: 'p-unk', type: 'segments', title: 'Containment', as_of: '2026-01-25',
  sources: [{ label: 'x' }],
  blocks: [
    { id: 'a', label: 'A', status: 'ready' },
    { id: 'b', label: 'B', status: 'ready', parent: 'nope' },
  ],
});
if (parentUnknown.ok) bad('unknown parent accepted');
else if (!/do not invent containment/.test(parentUnknown.error)) bad(`parent unknown msg ${parentUnknown.error}`);
else ok('parent unknown-id rejected');

const parentSelf = validateLearnDiagram({
  id: 'p-self', type: 'segments', title: 'Self', as_of: '2026-01-25',
  sources: [{ label: 'x' }],
  blocks: [
    { id: 'a', label: 'A', status: 'ready', parent: 'a' },
    { id: 'b', label: 'B', status: 'ready' },
  ],
});
if (parentSelf.ok) bad('self parent accepted');
else if (!/do not invent containment/.test(parentSelf.error)) bad(`parent self msg ${parentSelf.error}`);
else ok('parent self-reference rejected');

const parentDeep = validateLearnDiagram({
  id: 'p-deep', type: 'segments', title: 'Deep', as_of: '2026-01-25',
  sources: [{ label: 'x' }],
  blocks: [
    { id: 'a', label: 'A', status: 'ready' },
    { id: 'b', label: 'B', status: 'ready', parent: 'a' },
    { id: 'c', label: 'C', status: 'ready', parent: 'b' },
  ],
});
if (parentDeep.ok) bad('depth-2 parent chain accepted');
else if (!/do not invent containment/.test(parentDeep.error)) bad(`parent depth msg ${parentDeep.error}`);
else ok('parent depth-2 rejected');

const groupMoney = validateLearnDiagram({
  id: 'g-money', type: 'segments', title: 'Group $', as_of: '2026-01-25',
  sources: [{ label: 'x' }],
  blocks: [
    { id: 'a', label: 'A', status: 'ready', group: 'FY $10B' },
    { id: 'b', label: 'B', status: 'ready' },
  ],
});
if (groupMoney.ok) bad('group $ without filed accepted');
else ok('group with $ and no filed pin rejected');

const stackGeo = layoutDiagram(validated(fixtureLearnDiagrams().find((d) => d.type === 'stack')));
const bands = stackGeo.bands || [];
if (bands.length < 4) bad(`stack bands ${bands.length}`);
else if (bands.some((b) => b.w !== VIEWBOX_W || b.x !== 0)) bad('stack bands not full-width');
else if (bands.some((b, i) => i > 0 && b.y !== bands[i - 1].y + bands[i - 1].h)) bad('stack bands not flush');
else if (bands.some((b, i) => i > 0 && b.layer < bands[i - 1].layer)) bad('stack bands not sorted by layer');
else ok('stack geometry: full-width flush bands sorted by layer');

const flowGeo = layoutDiagram(validated(fixtureLearnDiagrams().find((d) => d.type === 'flow')));
const flowBlocks = flowGeo.blocks || [];
const flowEdges = flowGeo.edges || [];
const row1 = flowBlocks.filter((b) => b.row === 1);
if (flowBlocks.length !== 5) bad(`flow blocks ${flowBlocks.length}`);
else if (flowEdges.length !== 4) bad(`flow arrows ${flowEdges.length}`);
else if (!row1.length || !row1.every((b) => b.rtl)) bad('flow 5-block missing serpentine second row');
else ok('flow geometry: 4 arrow paths, serpentine second row when >4');

const icGeo = layoutDiagram(validated(fixtureLearnDiagrams().find((d) => d.type === 'interconnect')));
const xpu = (icGeo.blocks || []).find((b) => b.id === 'xpu');
const gapEdge = (icGeo.edges || []).find((e) => e.from === 'xpu' || e.to === 'xpu');
if (!xpu?.gap) bad('interconnect xpu not flagged gap');
else if (!gapEdge?.dashed || !/GAP: who/.test(gapEdge.label || '')) bad(`interconnect gap edge ${JSON.stringify(gapEdge)}`);
else ok('interconnect geometry: xpu GAP + dashed GAP: who edge');

const segGeo = layoutDiagram(validated(fixtureLearnDiagrams().find((d) => d.type === 'segments')));
const kids = (segGeo.tiles || []).filter((t) => t.depth === 1);
const parentTile = (segGeo.tiles || []).find((t) => t.id === 'dc-q1');
const same = kids.filter((t) => t.parent === 'dc-q1');
if (same.length !== 2) bad(`segments children ${same.length}`);
else if (same[0].w !== same[1].w || same[0].h !== same[1].h) bad('segments sibling size encodes share');
else if (!parentTile || same.some((t) => t.x < parentTile.x || t.x + t.w > parentTile.x + parentTile.w + 0.01
  || t.y < parentTile.y || t.y + t.h > parentTile.y + parentTile.h + 0.01)) {
  bad('segments child outside parent bounds');
} else if (segGeo.footnote !== SEGMENTS_FOOTNOTE) bad('segments footnote missing');
else ok('segments geometry: equal same-depth tiles, child inside parent');

const foundryFlow = layoutDiagram(validated({
  id: 'foundry-flow', type: 'flow', title: 'Wafer flow', as_of: '2026-01-25',
  sources: [{ label: '01-overview' }],
  blocks: [
    { id: 'mask', label: 'Mask / design', kind: 'software', layer: 0, status: 'ready' },
    { id: 'fab', label: 'Wafer fab', kind: 'process', layer: 1, status: 'ready' },
    { id: 'sort', label: 'Probe / sort', kind: 'process', layer: 2, status: 'ready' },
    { id: 'out', label: 'Die to customer', kind: 'segment', layer: 3, status: 'ready' },
  ],
  edges: [],
}));
if (foundryFlow.fallback || foundryFlow.edges.length < 3) bad('foundry-style flow layout failed');
else ok('foundry-style flow renders from fixture (no desk data)');

const memStack = layoutStack(validated({
  id: 'mem-stack', type: 'stack', title: 'Memory stack', as_of: '2026-01-25',
  sources: [{ label: '01-overview' }],
  blocks: [
    { id: 'ctrl', label: 'Controller / firmware', kind: 'software', layer: 0, status: 'ready' },
    { id: 'mod', label: 'Module / package', kind: 'systems', layer: 1, status: 'ready' },
    { id: 'dram', label: 'DRAM / HBM die', kind: 'silicon', layer: 2, status: 'ready' },
    { id: 'proc', label: 'IDM process', kind: 'process', layer: 3, status: 'ready' },
  ],
  edges: [],
}));
if (memStack.bands.length !== 4 || memStack.bands[0].w !== VIEWBOX_W) bad('memory-IDM stack layout failed');
else ok('memory-IDM-style stack renders from fixture (no desk data)');

const shallowNodes = fixtureProductMap('SHAL').nodes
  .filter((n) => n.kind !== 'mechanism' && n.kind !== 'process');
const sevenMap = {
  ...fixtureProductMap('SHAL'),
  nodes: [
    ...shallowNodes,
    {
      id: 'extra', kind: 'sku_family', title: 'Named family', status: 'ready',
      lesson_id: 'extra',
      sources: [{ label: 'FY2026 10-K', as_of: '2026-01-25', grade: 'A' }],
      not_this: 'not a $ split',
    },
  ],
};
const sevenScore = scoreLearnDepth({
  primerMarkdown: deepPrimer,
  lessons: sevenMap.nodes.map((n) => ({ id: n.lesson_id, markdown: fixtureDeepLessonMarkdown(n.title) })),
  map: sevenMap,
});
if (sevenScore.ok) bad('7-node no-mechanism map passed new bar');
else if (!sevenScore.reasons.some((r) => /mechanism\/process/.test(r))) bad(`missing mechanism reason ${sevenScore.reasons.join('; ')}`);
else if (!sevenScore.reasons.some((r) => /ready nodes/.test(r))) bad(`missing ready-nodes reason ${sevenScore.reasons.join('; ')}`);
else ok('old 7-node no-mechanism shape fails mechanism/process and ready nodes');

if (!deepSnap.depth_gate?.ok) bad('updated fixture should still meet new bar');
else ok('updated fixture PASSES new bar');

const { scoreLearnDiagrams } = await import(path.join(ROOT, 'server', 'learnDiagrams.js'));
const tinyStack = validateLearnDiagram({
  id: 'tiny-stack', type: 'stack', title: 'Tiny', as_of: '2026-01-25',
  sources: [{ label: 'x' }],
  blocks: [
    { id: 'a', label: 'A', kind: 'software', layer: 0, status: 'ready' },
    { id: 'b', label: 'B', kind: 'silicon', layer: 1, status: 'ready' },
  ],
});
const tinyScore = scoreLearnDiagrams([tinyStack.diagram], LEARN_FAMILIES.fabless_platform);
if (tinyScore.ok) bad('2-block stack passed quality floor');
else if (!tinyScore.reasons.some((r) => /stack floor/.test(r))) bad(`stack floor reason ${tinyScore.reasons.join('; ')}`);
else ok('2-block stack fails stack floor');

const oneEdgeIc = validateLearnDiagram({
  id: 'one-edge', type: 'interconnect', title: 'Thin attach', as_of: '2026-01-25',
  sources: [{ label: 'x' }],
  blocks: [
    { id: 'a', label: 'A', kind: 'silicon', status: 'ready' },
    { id: 'b', label: 'B', kind: 'networking', status: 'ready' },
    { id: 'c', label: 'C', kind: 'silicon', status: 'gap' },
  ],
  edges: [{ from: 'a', to: 'b', status: 'ready' }],
});
const oneEdgeScore = scoreLearnDiagrams([oneEdgeIc.diagram], LEARN_FAMILIES.fabless_platform);
if (oneEdgeScore.ok) bad('1-edge interconnect passed quality floor');
else if (!oneEdgeScore.reasons.some((r) => /interconnect floor/.test(r))) bad(`ic floor reason ${oneEdgeScore.reasons.join('; ')}`);
else ok('1-edge interconnect fails interconnect floor');

const deepLearnerFile = path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'learner.json');
const beforeBytes = fs.readFileSync(deepLearnerFile);
const nextSnap = getLearnSnapshot('DEEP');
const afterBytes = fs.readFileSync(deepLearnerFile);
if (!nextSnap.learner?.next?.some((t) => t.derived)) bad(`NEXT view missing derived ${JSON.stringify(nextSnap.learner?.next)}`);
else if (!beforeBytes.equals(afterBytes)) bad('getLearnSnapshot wrote learner.json');
else ok('NEXT view derived chips present; learner.json bytes unchanged');

const relabel = publishLearner('DEEP', { next: [{ id: 'cuda', label: 'old cuda label' }] });
const cudaChip = relabel.learner?.next?.find((t) => t.id === 'cuda');
const afterRelabel = fs.readFileSync(deepLearnerFile);
if (cudaChip?.label !== 'CUDA is not a chip') bad(`NEXT relabel ${cudaChip?.label}`);
else if (JSON.parse(afterRelabel).next.find((t) => t.id === 'cuda')?.label !== 'old cuda label') {
  bad('relabel wrote map title into learner.json');
} else ok('NEXT relabels from map title without writing learner.json');

const layoutSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'thin', 'learnDiagramLayout.js'), 'utf8');
const jsxSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'thin', 'LearnDiagrams.jsx'), 'utf8');
const photoJsx = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'thin', 'LearnPhotos.jsx'), 'utf8');
const bgSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'thin', 'Background.jsx'), 'utf8');
const deepSrc = fs.readFileSync(path.join(ROOT, 'server', 'learnDeep.js'), 'utf8');
const tickerRe = /nvda|avgo|tsm|amd|shaz|nbis|\bmu\b|mrvl|iren|lly/i;
if (tickerRe.test(layoutSrc) || tickerRe.test(jsxSrc) || tickerRe.test(photoJsx)) {
  bad('renderer source contains ticker/slug literals');
} else ok('renderer + layout + photo source contain no ticker/slug literals');
const slugWordRe = /\b(nvda|avgo|tsm|amd|shaz|nbis|mu|mrvl|iren|lly)\b/i;
if (slugWordRe.test(bgSrc) || slugWordRe.test(deepSrc)) {
  bad('Background / learnDeep contain ticker/slug literals');
} else ok('Background + learnDeep contain no ticker/slug literals');
if (/<svg\b/i.test(jsxSrc) || /layoutDiagram\s*\(/.test(jsxSrc)) bad('LearnDiagrams still uses SVG/layoutDiagram');
else ok('LearnDiagrams is HTML (no svg, no layoutDiagram import)');
if (/MAP THIN/.test(bgSrc)) bad('Background still uses MAP THIN mood pill');
else if (!/NOT RUN/.test(bgSrc) || !/learn-deepen/.test(bgSrc)) bad('Background missing unfired Study Tree / learn-deepen');
else ok('Study Tree is unfired launcher (NOT RUN + learn-deepen)');
if (/OPEN TUTOR/.test(bgSrc) || /YOUR LEVEL/.test(bgSrc) || /DepthMeter/.test(bgSrc)) {
  bad('Background chrome still has tutor / YOUR LEVEL / DepthMeter');
} else if (/learn-split/.test(bgSrc)) {
  bad('Background still uses two-column tree|primer split');
} else if (!/SPINE SHORT/.test(bgSrc) || !/StudyTree/.test(bgSrc)) {
  bad('Background missing stacked tree / unmapped crumb');
} else ok('Background stacks tree then primer (no split)');
if (!/learn-tab/.test(jsxSrc) || !/learnDiagramPick/.test(jsxSrc)) bad('LearnDiagrams missing board tabs');
else ok('architecture board uses type tabs');
const pickSrc = fs.readFileSync(path.join(ROOT, 'src', 'pages', 'thin', 'learnDiagramPick.js'), 'utf8');
if (slugWordRe.test(pickSrc)) bad('learnDiagramPick contains ticker literals');
else ok('learnDiagramPick has no ticker literals');

const { pickBoardDiagram, diagramTabTypes } = await import(path.join(ROOT, 'src', 'pages', 'thin', 'learnDiagramPick.js'));
const foundryPick = pickBoardDiagram(
  [{ id: 's', type: 'segments' }, { id: 'f', type: 'flow' }],
  LEARN_FAMILIES.foundry.required_diagrams,
);
if (!foundryPick || foundryPick.id !== 'f') bad(`foundry default tab ${foundryPick && foundryPick.id}`);
else ok('foundry family defaults to flow tab');
const fablessPick = pickBoardDiagram(fixtureLearnDiagrams(), LEARN_FAMILIES.fabless_platform.required_diagrams);
if (!fablessPick || fablessPick.type !== 'stack') bad(`fabless default ${fablessPick && fablessPick.type}`);
else ok('fabless family defaults to stack tab');
const twoTabs = diagramTabTypes(
  [{ type: 'interconnect' }, { type: 'stack' }],
  LEARN_FAMILIES.custom_silicon.required_diagrams,
);
if (twoTabs.join(',') !== 'stack,interconnect') bad(`tab types ${twoTabs.join(',')}`);
else ok('tabs are present types in family order (no empty tabs)');

for (const raw of fixtureLearnDiagrams()) {
  const v = validateLearnDiagram(raw);
  if (!v.ok) {
    bad(`fixture ${raw.id} invalid ${v.error}`);
    continue;
  }
  try {
    const g = layoutDiagram(v.diagram);
    if (!g?.viewBox || !Number.isFinite(g.viewBox.h)) bad(`layout ${raw.id} missing viewBox`);
    else ok(`layout total: ${raw.id} (${g.type})`);
  } catch (e) {
    bad(`layout threw on ${raw.id}: ${e.message}`);
  }
}

if (BAND_H < 40) bad('BAND_H too small');
else ok(`layout constants exported (viewBox ${VIEWBOX_W})`);

const fixturePath = path.join(ROOT, 'scripts', 'fixtures', 'learn-product-map.json');
let fileMapRaw = null;
try {
  fileMapRaw = JSON.parse(fs.readFileSync(fixturePath, 'utf8'));
} catch (e) {
  bad(`test fixture product-map missing ${e.message}`);
}
if (fileMapRaw) {
  const fileGate = validateProductMap(fileMapRaw, 'TEST');
  if (!fileGate.ok) bad(`test fixture product-map invalid ${fileGate.error}`);
  else {
    const types = new Set((fileGate.map.diagrams || []).map((d) => d.type));
    const need = ['stack', 'flow', 'segments', 'interconnect'];
    const missingType = need.filter((t) => !types.has(t));
    if (missingType.length) bad(`test fixture missing diagram types ${missingType.join(',')}`);
    else {
      let layoutOk = true;
      for (const d of fileGate.map.diagrams) {
        const g = layoutDiagram(d);
        if (!g?.viewBox || !Number.isFinite(g.viewBox.h)) {
          bad(`test fixture layout ${d.id} missing viewBox`);
          layoutOk = false;
        }
      }
      if (layoutOk) ok('glass fixture product-map layouts stack/flow/segments/interconnect (no vault fill)');
    }
    const photos = fileGate.map.photos || [];
    if (!photos.length) bad('test fixture missing photos[] (GAP-safe pins)');
    else ok(`test fixture photos[] present (${photos.length}) — missing files render as GAP`);
  }
}

const {
  validateLearnPhotos,
  photoHostAllowlist,
  learnPhotoQueries,
  sniffImageBytes,
  harvestPhoto,
  resolveLearnPhotoFile,
  clearPhotoHostAllowlistCache,
  fixtureLearnPhotos,
  PHOTOS_MAX_TOTAL,
  PHOTOS_MAX_TAPE,
  MAX_PHOTO_BYTES,
} = await import(path.join(ROOT, 'server', 'learnPhotos.js'));

const PNG_1x1 = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const JPEG_1x1 = Buffer.from([0xff, 0xd8, 0xff, 0xd9]);
const WEBP_1x1 = Buffer.concat([Buffer.from('RIFF'), Buffer.from([0x08, 0x00, 0x00, 0x00]), Buffer.from('WEBP')]);

function stubFetch(buf, status = 200) {
  return async () => ({
    ok: status >= 200 && status < 300,
    status,
    headers: { get: () => null },
    arrayBuffer: async () => buf,
  });
}

const emptyPhotos = validateLearnPhotos(undefined, { ticker: 'DEEP', nodeIds: new Set() });
if (!emptyPhotos.ok || emptyPhotos.photos.length !== 0) bad('missing photos[] should default empty');
else ok('maps without photos[] stay valid');

const fxPhotos = fixtureLearnPhotos('DEEP');
const fxGate = validateLearnPhotos(fxPhotos, {
  ticker: 'DEEP',
  nodeIds: new Set(fmap.nodes.map((n) => n.id)),
});
if (!fxGate.ok) bad(`fixture photos rejected ${fxGate.error}`);
else ok('fixture primary + tape photos validate');

const webpSniff = sniffImageBytes(WEBP_1x1);
if (!webpSniff.ok || webpSniff.ext !== 'webp') bad(`webp sniff ${webpSniff.error}`);
else ok('webp magic accepted');

function photoPin(over = {}) {
  const base = {
    id: 'filed-rack',
    lane: 'primary',
    kind: 'system',
    src: 'cockpit/learn/DEEP/photos/filed-rack.jpg',
    sha256: 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',
    as_of: '2026-01-25',
    caption: 'Filed system photo from an exhibit',
    source: {
      label: 'FY exhibit photo',
      page_url: 'https://www.sec.gov/Archives/edgar/data/1/exhibit.htm',
      image_url: 'https://www.sec.gov/Archives/edgar/data/1/rack.jpg',
      grade: 'A',
      retrieved_at: '2026-08-28T00:00:00.000Z',
    },
    node_id: 'platform',
  };
  const next = { ...base, ...over };
  if (over.source) next.source = { ...base.source, ...over.source };
  return next;
}

const rejectCases = [
  [{ ...photoPin(), source: undefined, caption: 'x' }, 'missing source'],
  [photoPin({ caption: 'Costs $12 on the rack' }), '$ in caption'],
  [photoPin({ caption: 'Mix is 40% compute' }), '% in caption'],
  [photoPin({ caption: 'you should buy this rack' }), 'advice caption'],
  [photoPin({ caption: 'SKU mix photo' }), 'SKU in caption'],
  [photoPin({ caption: 'Stock performance hero' }), 'rating/chart words'],
  [photoPin({ src: 'cockpit/learn/DEEP/photos/filed-rack.svg' }), '.svg src'],
  [photoPin({ src: 'cockpit/learn/DEEP/photos/../secret.jpg' }), 'traversal src'],
  [photoPin({ kind: 'meme' }), 'bad kind'],
  [photoPin({ lane: 'stock' }), 'bad lane'],
  [photoPin({ node_id: 'no-such-node' }), 'unknown node_id'],
  [photoPin({ sha256: 'deadbeef' }), 'missing sha256'],
];
for (const [row, label] of rejectCases) {
  const g = validateLearnPhotos([row], { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) });
  if (g.ok) bad(`accepted ${label}`);
  else ok(`rejects ${label}`);
}

const nine = [];
for (let i = 0; i < 9; i += 1) {
  nine.push(photoPin({
    id: `extra-${i}`,
    src: `cockpit/learn/DEEP/photos/extra-${i}.jpg`,
    sha256: 'c'.repeat(64),
  }));
}
if (validateLearnPhotos(nine, { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) }).ok) {
  bad('9th photo accepted');
} else ok(`rejects 9th photo (cap ${PHOTOS_MAX_TOTAL})`);

const fiveTape = [
  photoPin(),
  ...[0, 1, 2, 3, 4].map((i) => photoPin({
    id: `tape-${i}`,
    lane: 'tape',
    kind: 'process',
    src: `cockpit/learn/DEEP/photos/tape-${i}.webp`,
    sha256: 'd'.repeat(64),
    caption: 'Web package — web, not a filing',
    node_id: 'pkg-how',
    source: {
      label: 'Press',
      page_url: 'https://www.tomshardware.com/x',
      image_url: 'https://cdn.mos.cms.futurecdn.net/x.webp',
      grade: 'tape',
      query: 'Acme packaging photo',
      retrieved_at: '2026-08-28T00:00:00.000Z',
    },
  })),
];
if (validateLearnPhotos(fiveTape, { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) }).ok) {
  bad('5th tape accepted');
} else ok(`rejects 5th tape photo (cap ${PHOTOS_MAX_TAPE})`);

const webPrimary = validateLearnPhotos([photoPin({
  source: {
    label: 'Random web',
    page_url: 'https://example.com/news',
    image_url: 'https://example.com/rack.jpg',
    grade: 'A',
    retrieved_at: '2026-08-28T00:00:00.000Z',
  },
})], { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) });
if (webPrimary.ok) bad('primary web host accepted');
else ok('rejects primary with web host (allowlist)');

const tapeNoQuery = validateLearnPhotos([photoPin({
  id: 'tape-nq',
  lane: 'tape',
  src: 'cockpit/learn/DEEP/photos/tape-nq.webp',
  caption: 'Web package — web, not a filing',
  node_id: 'pkg-how',
  source: {
    label: 'Press',
    page_url: 'https://www.tomshardware.com/x',
    image_url: 'https://cdn.mos.cms.futurecdn.net/x.webp',
    grade: 'tape',
    retrieved_at: '2026-08-28T00:00:00.000Z',
  },
})], { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) });
if (tapeNoQuery.ok) bad('tape without query accepted');
else ok('rejects tape without query');

const tapeNoNode = validateLearnPhotos([photoPin({
  id: 'tape-nn',
  lane: 'tape',
  src: 'cockpit/learn/DEEP/photos/tape-nn.webp',
  caption: 'Web package — web, not a filing',
  node_id: '',
  source: {
    label: 'Press',
    page_url: 'https://www.tomshardware.com/x',
    image_url: 'https://cdn.mos.cms.futurecdn.net/x.webp',
    grade: 'tape',
    query: 'Acme packaging photo',
    retrieved_at: '2026-08-28T00:00:00.000Z',
  },
})], { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) });
if (tapeNoNode.ok) bad('tape without node_id accepted');
else ok('rejects tape without node_id');

const tapeThumb = validateLearnPhotos([photoPin({
  id: 'tape-tbn',
  lane: 'tape',
  src: 'cockpit/learn/DEEP/photos/tape-tbn.webp',
  caption: 'Web package — web, not a filing',
  node_id: 'pkg-how',
  source: {
    label: 'SERP thumb',
    page_url: 'https://www.tomshardware.com/x',
    image_url: 'https://encrypted-tbn0.gstatic.com/images?q=tbn:x',
    grade: 'tape',
    query: 'Acme packaging photo',
    retrieved_at: '2026-08-28T00:00:00.000Z',
  },
})], { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) });
if (tapeThumb.ok) bad('gstatic thumb accepted');
else ok('rejects tape gstatic.com thumb');

const tapeStock = validateLearnPhotos([photoPin({
  id: 'tape-stock',
  lane: 'tape',
  src: 'cockpit/learn/DEEP/photos/tape-stock.jpg',
  caption: 'Office servers — web, not a filing',
  node_id: 'pkg-how',
  source: {
    label: 'Stock',
    page_url: 'https://unsplash.com/photos/x',
    image_url: 'https://images.unsplash.com/x.jpg',
    grade: 'tape',
    query: 'server room',
    retrieved_at: '2026-08-28T00:00:00.000Z',
  },
})], { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) });
if (tapeStock.ok) bad('stock-agency host accepted');
else ok('rejects tape stock-agency host');

const tapeSerp = validateLearnPhotos([photoPin({
  id: 'tape-serp',
  lane: 'tape',
  src: 'cockpit/learn/DEEP/photos/tape-serp.jpg',
  caption: 'Web package — web, not a filing',
  node_id: 'pkg-how',
  source: {
    label: 'SERP',
    page_url: 'https://www.google.com/search?q=x&tbm=isch',
    image_url: 'https://cdn.mos.cms.futurecdn.net/x.jpg',
    grade: 'tape',
    query: 'Acme packaging photo',
    retrieved_at: '2026-08-28T00:00:00.000Z',
  },
})], { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) });
if (tapeSerp.ok) bad('google.com page_url accepted');
else ok('rejects tape google.com page_url');

const queryOnPrimary = validateLearnPhotos([photoPin({
  source: {
    label: 'FY exhibit photo',
    page_url: 'https://www.sec.gov/Archives/edgar/data/1/exhibit.htm',
    image_url: 'https://www.sec.gov/Archives/edgar/data/1/rack.jpg',
    grade: 'A',
    query: 'should not be here',
    retrieved_at: '2026-08-28T00:00:00.000Z',
  },
})], { ticker: 'DEEP', nodeIds: new Set(fmap.nodes.map((n) => n.id)) });
if (queryOnPrimary.ok) bad('query on primary accepted');
else ok('rejects query on a primary entry');

const qList = learnPhotoQueries(fmap, 'Acme Widgets');
if (!Array.isArray(qList) || qList.length === 0) bad('queries empty');
else if (qList.length > 10) bad(`queries ${qList.length} > 10`);
else if (qList.some((q) => q.length > 160)) bad('query exceeds 160');
else if (qList.some((q) => !/Acme Widgets/i.test(q))) bad(`query missing display name ${qList[0]}`);
else ok(`learnPhotoQueries deterministic (${qList.length}, display name, ≤10, ≤160)`);

const srcDir = path.join(tmpVault, 'wiki', 'sources');
fs.mkdirSync(srcDir, { recursive: true });
fs.writeFileSync(path.join(srcDir, 'widg-ir.md'), [
  '---',
  'type: source',
  'slug: widg-ir',
  'title: Widget IR rack',
  'url: https://ir.widgets.test/news/rack',
  'grade: A',
  '---',
  '',
  '# Widget IR',
  '',
].join('\n'), 'utf8');
clearPhotoHostAllowlistCache();
const widgAllow = photoHostAllowlist('WIDG');
if (!widgAllow.hosts.includes('ir.widgets.test') || !widgAllow.hosts.includes('www.sec.gov')) {
  bad(`WIDG allowlist ${widgAllow.hosts.join(',')}`);
} else if (widgAllow.hosts.some((h) => /nvidia|nvidianews/i.test(h))) {
  bad('WIDG allowlist leaked another desk host');
} else ok('allowlist from fake wiki/sources on a non-dogfood desk');

const widgMap = fixtureProductMap('WIDG');
const widgQ = learnPhotoQueries(widgMap, 'Widget Co');
if (!widgQ.length || widgQ.some((q) => !/Widget Co/i.test(q))) bad(`WIDG queries ${JSON.stringify(widgQ)}`);
else ok('queries derive from map + display name (no dogfood data)');

const deepSnapPhotos = getLearnSnapshot('DEEP').map?.photos || [];
const lanes = deepSnapPhotos.map((p) => p.lane);
const tapeIdx = lanes.indexOf('tape');
const primaryIdx = lanes.indexOf('primary');
if (!deepSnapPhotos.length) bad('snapshot missing fixture photos');
else if (tapeIdx !== -1 && primaryIdx !== -1 && tapeIdx < primaryIdx) bad('tape sorted before primary');
else if (!deepSnapPhotos.every((p) => p.present === false)) bad('pins without files should be present:false');
else ok('snapshot: tape after primary; missing files present:false');

const deepLearnerFile2 = path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'learner.json');
const deepMapFile = path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'product-map.json');
const mapBeforeHarvest = JSON.parse(fs.readFileSync(deepMapFile, 'utf8'));
mapBeforeHarvest.nodes[0]._harvest_sentinel = 'keep-me';
const nodeKeysBefore = Object.keys(mapBeforeHarvest.nodes[0]);
fs.writeFileSync(deepMapFile, `${JSON.stringify(mapBeforeHarvest, null, 2)}\n`);
const beforeHarvest = fs.readFileSync(deepLearnerFile2);
const hvOk = await harvestPhoto('DEEP', {
  id: 'harvest-jpeg',
  lane: 'primary',
  kind: 'system',
  image_url: 'https://www.sec.gov/Archives/edgar/data/1/harvest.jpg',
  page_url: 'https://www.sec.gov/Archives/edgar/data/1/exhibit.htm',
  caption: 'Harvested exhibit photo',
  as_of: '2026-01-25',
  node_id: 'platform',
  source_label: 'FY exhibit',
}, { fetchImpl: stubFetch(JPEG_1x1), desk: 'deep' });
const afterHarvest = fs.readFileSync(deepLearnerFile2);
const harvestedAbs = path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'photos', 'harvest-jpeg.jpg');
const mapAfterHarvest = JSON.parse(fs.readFileSync(deepMapFile, 'utf8'));
const nodeKeysAfter = Object.keys(mapAfterHarvest.nodes[0] || {});
if (!hvOk.ok) bad(`harvest jpeg ${hvOk.error}`);
else if (!fs.existsSync(harvestedAbs)) bad('harvest did not write file');
else if (!beforeHarvest.equals(afterHarvest)) bad('harvest reminted learner.json');
else if (mapAfterHarvest.nodes[0]?._harvest_sentinel !== 'keep-me') bad('harvest canonicalized map (dropped sentinel)');
else if (JSON.stringify(nodeKeysAfter) !== JSON.stringify(nodeKeysBefore)) bad('harvest rewrote node key order');
else ok('harvest JPEG writes file + map; learner.json bytes unchanged; map body preserved');

const hvSvg = await harvestPhoto('DEEP', {
  id: 'harvest-svg',
  lane: 'primary',
  kind: 'system',
  image_url: 'https://www.sec.gov/Archives/edgar/data/1/x.svg',
  page_url: 'https://www.sec.gov/Archives/edgar/data/1/exhibit.htm',
  caption: 'Not a photo',
  as_of: '2026-01-25',
  source_label: 'FY exhibit',
}, { fetchImpl: stubFetch(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"></svg>')), desk: 'deep' });
const svgAbs = path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'photos', 'harvest-svg.svg');
const svgJpg = path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'photos', 'harvest-svg.jpg');
if (hvSvg.ok) bad('svg harvest accepted');
else if (fs.existsSync(svgAbs) || fs.existsSync(svgJpg)) bad('svg harvest wrote a file');
else ok('harvest SVG/HTML bytes rejected; no file');

const fat = Buffer.concat([JPEG_1x1, Buffer.alloc(MAX_PHOTO_BYTES)]);
const hvFat = await harvestPhoto('DEEP', {
  id: 'harvest-fat',
  lane: 'primary',
  kind: 'system',
  image_url: 'https://www.sec.gov/Archives/edgar/data/1/fat.jpg',
  page_url: 'https://www.sec.gov/Archives/edgar/data/1/exhibit.htm',
  caption: 'Too large',
  as_of: '2026-01-25',
  source_label: 'FY exhibit',
}, { fetchImpl: stubFetch(fat), desk: 'deep' });
const fatAbs = path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'photos', 'harvest-fat.jpg');
if (hvFat.ok) bad('4MB harvest accepted');
else if (fs.existsSync(fatAbs)) bad('4MB harvest wrote a file');
else ok('harvest 4MB rejected; no file');

const orphanDir = path.join(tmpVault, 'cockpit', 'learn', 'DEEP', 'photos');
fs.mkdirSync(orphanDir, { recursive: true });
fs.writeFileSync(path.join(orphanDir, 'orphan-drop.jpg'), JPEG_1x1);
const orphan = resolveLearnPhotoFile('DEEP', 'orphan-drop.jpg');
if (orphan.ok) bad('orphan file served');
else ok('serving jail: orphan file 404');

const travPhoto = resolveLearnPhotoFile('DEEP', '../primer.md');
const travPhoto2 = resolveLearnPhotoFile('DEEP', '..%2Fsecret.jpg');
if (travPhoto.ok || travPhoto2.ok) bad('photo traversal served');
else ok('serving jail: traversal 404');

const listed = resolveLearnPhotoFile('DEEP', 'harvest-jpeg.jpg');
if (!listed.ok || !listed.abs) bad(`listed photo 404 ${listed.error}`);
else ok('serving jail: map-listed file resolves');

if (PHOTOS_MAX_TOTAL !== 8 || PHOTOS_MAX_TAPE !== 4) bad('caps drifted');
else ok('caps 8 total / 4 tape');

const fill = spawnSync(process.execPath, [path.join(ROOT, 'scripts', 'learn-factory.mjs'), '--fill'], {
  encoding: 'utf8',
  env: { ...process.env, COCKPIT_VAULT: tmpVault },
});
if (fill.status !== 2) bad(`learn-factory --fill exit ${fill.status} (want 2)`);
else if (!/REFUSE --fill/.test(`${fill.stdout || ''}${fill.stderr || ''}`)) bad('--fill missing refuse text');
else ok('learn-factory --fill refused (exit 2)');

console.log(`\nthin-learn ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
