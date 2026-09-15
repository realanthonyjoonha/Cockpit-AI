#!/usr/bin/env node
/**
 * filing-map-test.mjs — Layer 0 catalog + Layer 1 job jail (no Grok, no SEC).
 * LLY-shaped Form 4 flood must not make last print UNKNOWN.
 */
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  pickLatestPrint,
  lastPrintCatalog,
  eightKItemLabel,
  isRoutineFiling,
  filedSinceCompile,
  decorateFiling,
} from '../server/secEdgar.js';
import { buildFilingMapInbox, parseFlipTriggers, tripwireLabel } from '../server/filingMapInbox.js';
import {
  dossierHeadline,
  splitSentences,
  isCatalogSentence,
  findingsSentences,
  houseHitTrips,
  classifyHouseHits,
  classifyRiskHits,
  operatorGaps,
  completeMaps,
  shapeFilingMapDossier,
  filingPageDigest,
  stripAccession,
  filingsStripMode,
  nextFilingsOpen,
  filingsExtraRows,
  filingsLedgerExtras,
  filingsMapList,
  filingsRailLabel,
  filingEventAt,
  readFilingsExpandStore,
  writeFilingsExpandStore,
  filingsExpandKey,
} from '../src/pages/thin/filingMapPaint.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-filing-map-'));
process.env.COCKPIT_VAULT = tmpVault;

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

function f(form, filed, extra = {}) {
  return { form, filed, accession: extra.accession || `${form}-${filed}`, items: extra.items || '', url: extra.url || `https://sec.gov/${form}`, ...extra };
}

console.log('\nfiling-map catalog (layer 0)\n');

const flood = [];
for (let i = 0; i < 13; i++) flood.push(f('4', '2026-09-04', { accession: `4-${i}` }));
flood.push(f('3/A', '2026-09-04', { accession: '3a' }));
flood.push(f('10-Q', '2026-08-05', { accession: 'lly-10q', url: 'https://sec.gov/lly-10q' }));
flood.push(f('8-K', '2026-08-05', { accession: 'lly-8k', items: '2.02,9.01' }));

const truncated = flood.slice(0, 10);
if (!pickLatestPrint(truncated)) ok('top-10 of Form 4 flood has no print (the old bug)');
else bad('top-10 should not see the 10-Q');

const full = pickLatestPrint(flood);
if (full && full.form === '10-Q' && full.date === '2026-08-05' && full.accession === 'lly-10q') {
  ok('full list last print is 10-Q 2026-08-05, not UNKNOWN');
} else bad(`full print ${JSON.stringify(full)}`);

const cat = lastPrintCatalog(flood, '2026-08-28T00:29:15Z');
if (cat.known && cat.in_book === true && cat.form === '10-Q') ok('10-Q before compile → IN BOOK');
else bad(`in_book ${JSON.stringify({ known: cat.known, in_book: cat.in_book, form: cat.form })}`);

const k8 = pickLatestPrint([f('8-K', '2026-08-28', { items: '2.02,9.01' })]);
if (k8 && k8.form === '8-K' && /2\.02/.test(k8.item_label || k8.items)) ok('8-K 2.02 counts as print');
else bad(`8k 2.02 ${JSON.stringify(k8)}`);

const notPrint = pickLatestPrint([f('8-K', '2026-09-03', { items: '8.01' })]);
if (!notPrint) ok('8-K 8.01 is not a print');
else bad('8.01 counted as print');

const sc801 = filedSinceCompile(
  [f('8-K', '2026-09-03', { items: '8.01', acceptance: '2026-09-03T20:00:00.000Z' })],
  '2026-08-28T00:00:00Z',
);
if (sc801.material_count === 1 && sc801.material_items[0].form === '8-K') ok('8-K 8.01 is material not-in-book');
else bad(`8.01 material ${JSON.stringify(sc801)}`);

const fpi = pickLatestPrint([f('6-K', '2026-09-01'), f('20-F', '2026-04-01', { accession: '20f' })]);
if (fpi && fpi.form === '20-F') ok('FPI last print is 20-F');
else bad(`fpi ${JSON.stringify(fpi)}`);

const routineSince = filedSinceCompile(
  [
    f('4', '2026-09-04', { acceptance: '2026-09-04T20:00:00.000Z' }),
    f('10-Q', '2026-08-05', { acceptance: '2026-08-05T12:00:00.000Z' }),
  ],
  '2026-08-28T00:29:15Z',
);
if (routineSince.material_count === 0 && routineSince.routine_count === 1) {
  ok('routine-only since compile → no material rows');
} else bad(`routine since ${JSON.stringify(routineSince)}`);

const none = lastPrintCatalog([f('8-K', '2026-09-01', { items: '8.01' })], '2026-08-01T00:00:00Z');
if (!none.known && none.label === 'UNKNOWN') ok('no periodics → last print UNKNOWN');
else bad(`unknown ${JSON.stringify(none)}`);

if (isRoutineFiling(f('4', '2026-09-04')) && isRoutineFiling(f('3/A', '2026-09-04')) && !isRoutineFiling(f('8-K', '2026-09-03', { items: '8.01' }))) {
  ok('routine = 3/4/5/144/13F not 8-K');
} else bad('routine classifier');

const gloss = eightKItemLabel('2.02,9.01');
if (gloss && gloss.includes('2.02') && gloss.includes('Results of operations') && gloss.includes('9.01')) {
  ok('English 8-K items 2.02 + 9.01');
} else bad(`gloss ${gloss}`);

const other = eightKItemLabel('8.01');
if (other === '8.01 Other events') ok('8.01 Other events');
else bad(`8.01 ${other}`);

if (eightKItemLabel('99.99') === '99.99') ok('unknown item stays the code');
else bad(`unknown ${eightKItemLabel('99.99')}`);

if (decorateFiling(f('8-K', '2026-09-03', { items: '8.01' })).item_label === '8.01 Other events') {
  ok('decorateFiling sets item_label');
} else bad('decorateFiling');

const emptyInbox = buildFilingMapInbox({ ticker: 'TEST', filings: [] });
if (!emptyInbox.ok) ok('empty filings → no SEC pipeline');
else bad('empty filings should fail');

const built = buildFilingMapInbox({
  ticker: 'TEST',
  desk: 'test',
  compiledAt: '2026-08-28T00:29:15Z',
  filings: flood,
  house: {
    status: 'CONFIRMED',
    date: '2026-08-23',
    stance_line: 'Constructive on next layer',
    flip_triggers: ['Retatrutide conversion miss: BLA slips'],
  },
  risks: [{ id: 'test-r1-x', name: 'R1 — cash engine', status: 'WATCH', grade: 'A', tripwires: [{ label: 'mix ≥70%' }] }],
});
if (built.ok && built.inbox.last_print.form === '10-Q' && built.inbox.last_print.in_book === true
  && built.inbox.material_not_in_book.every((row) => row.form !== '4')
  && built.inbox.house.flip_triggers[0].includes('Retatrutide')) {
  ok('inbox: 10-Q in book, no Form 4s, flip-triggers copied');
} else bad(`inbox ${JSON.stringify(built.inbox?.last_print)} mat=${(built.inbox?.material_not_in_book || []).map((x) => x.form)}`);

const flips = parseFlipTriggers('### What would change the view (flip triggers)\n\n- **Foo miss:** bar\n- Baz\n\n### Explicitly not\n');
if (flips.length === 2 && flips[0].includes('Foo miss')) ok('parseFlipTriggers copies bullets');
else bad(`flips ${JSON.stringify(flips)}`);

const hyphenFlips = parseFlipTriggers('## Flip-triggers\n\n- Gross margin print below 40%\n- Named customer concentration\n');
if (hyphenFlips.length === 2 && /Gross margin/.test(hyphenFlips[0])) ok('parseFlipTriggers accepts Flip-triggers hyphen heading');
else bad(`hyphen flips ${JSON.stringify(hyphenFlips)}`);

if (tripwireLabel({ foo: 1 }) === '' && tripwireLabel({ monitor: 'mix ≥70%' }) === 'mix ≥70%') {
  ok('tripwireLabel never String(object)');
} else bad(`tripwireLabel ${tripwireLabel({ foo: 1 })}`);

console.log('\nfiling-map job (layer 1 tmp vault)\n');

const {
  startResearchRun,
  publishResearchRun,
  cancelResearchRun,
  findInFlightRun,
  listResearchRuns,
  getResearchRun,
} = await import(path.join(ROOT, 'server', 'thinResearchRuns.js'));
const {
  RESEARCH_JOBS,
  isFilingMapJob,
  isInteractiveResearchJob,
  researchLane,
  humanJobLabel,
} = await import(path.join(ROOT, 'server', 'researchRunsSchema.js'));
const { writeResearchRunsAgentSeed } = await import(path.join(ROOT, 'server', 'researchRunsAgentSeed.js'));
const { reconcileRun, ORPHAN_FAIL_MS } = await import(path.join(ROOT, 'server', 'researchRunsWorker.js'));
const { failResearchRun, patchRunMeta } = await import(path.join(ROOT, 'server', 'thinResearchRuns.js'));

if (!RESEARCH_JOBS.has('filing_map') || !isFilingMapJob('filing_map') || researchLane('filing_map') !== 'filings') {
  bad('job/lane registration');
} else ok('filing_map in RESEARCH_JOBS · lane filings');

if (humanJobLabel('filing_map') !== 'Filing map') bad('label');
else ok('humanJobLabel Filing map');

if (!isInteractiveResearchJob('filing_map')) bad('interactive');
else ok('filing_map is interactive');

const noPipe = startResearchRun('NOPIPE', { job: 'filing_map' }, { desk: 'nopipe' });
if (!noPipe.ok && /pipeline/i.test(noPipe.error || '')) ok('start without EDGAR cache fails closed');
else bad(`nopipe ${JSON.stringify(noPipe)}`);

const cacheDir = path.join(tmpVault, 'cockpit', 'compile', 'MAPTEST', 'filings');
fs.mkdirSync(cacheDir, { recursive: true });
fs.writeFileSync(path.join(cacheDir, 'index.json'), `${JSON.stringify({
  schema_version: 1, ticker: 'MAPTEST', filings: flood,
}, null, 2)}\n`);

const started = startResearchRun('MAPTEST', { job: 'filing_map' }, { desk: 'maptest' });
if (!started.ok || !/_filing_map_/i.test(started.run_id || '')) bad(`start ${started.error}`);
else ok(`start ${started.run_id}`);

const inboxPath = path.join(tmpVault, 'cockpit', 'research', 'MAPTEST', 'runs', started.run_id, 'inbox.json');
if (fs.existsSync(inboxPath)) ok('writes inbox.json');
else bad('missing inbox.json');

const again = startResearchRun('MAPTEST', { job: 'filing_map' }, { desk: 'maptest' });
if (again.already_in_flight && again.run_id === started.run_id) ok('filings-lane mutex');
else bad(`mutex ${JSON.stringify(again)}`);

const thesis = startResearchRun('MAPTEST', { job: 'thesis_report', thesis_mode: 'deep-dive' }, { desk: 'maptest' });
if (thesis.ok && !thesis.already_in_flight) ok('thesis does not block filing_map');
else bad(`thesis mutex ${JSON.stringify(thesis)}`);
if (thesis.ok) cancelResearchRun('MAPTEST', thesis.run_id);

const inbox = JSON.parse(fs.readFileSync(inboxPath, 'utf8'));
const goodAcc = inbox.last_print.accession;
const acquiredDir = path.join(tmpVault, 'cockpit', 'research', 'MAPTEST', 'runs', started.run_id, 'acquired');
fs.writeFileSync(path.join(acquiredDir, '10q.htm'), 'verbatim phrase from the filing body for excerpt gate testing.\n');

const badAcc = publishResearchRun('MAPTEST', started.run_id, {
  job: 'filing_map',
  status: 'complete',
  summary: 'Last print already in the book; no material 8-Ks after compile.',
  rows: [{ accession: 'not-in-inbox', form: '8-K', what: { text: 'x', excerpt: 'verbatim phrase from the filing body for excerpt gate testing.', grade: 'A' } }],
});
if (!badAcc.ok && /not in inbox/i.test(badAcc.error || '')) ok('publish rejects accession not in inbox');
else bad(`badAcc ${badAcc.error}`);

const packClaims = publishResearchRun('MAPTEST', started.run_id, {
  job: 'filing_map',
  status: 'complete',
  summary: 'Last print already in the book; no material 8-Ks after compile.',
  promotion: { pack_claims: true },
  rows: [{ accession: goodAcc, form: '10-Q', what: { text: 'q', excerpt: 'verbatim phrase from the filing body for excerpt gate testing.', grade: 'A' } }],
});
if (!packClaims.ok && /pack/i.test(packClaims.error || '')) ok('publish rejects pack_claims');
else bad(`packClaims ${packClaims.error}`);

const published = publishResearchRun('MAPTEST', started.run_id, {
  job: 'filing_map',
  status: 'complete',
  summary: 'Last print already in the book; no material 8-Ks after compile.',
  rows: [{
    accession: goodAcc,
    form: '10-Q',
    filed: '2026-08-05',
    in_book: true,
    what: { text: 'Q2 10-Q', excerpt: 'verbatim phrase from the filing body for excerpt gate testing.', grade: 'A' },
    house_hits: [],
    risk_hits: [{ id: 'test-r1-x', name: 'R1 — cash engine', test: 'WATCH' }],
    add_risk_candidates: [],
    gaps: [],
  }],
});
if (published.ok && published.status === 'complete') ok('publish valid delta');
else bad(`publish ${published.error}`);

const got = getResearchRun('MAPTEST', started.run_id);
if (got.delta && Array.isArray(got.delta.rows) && got.delta.rows[0]?.accession === goodAcc) {
  ok('getResearchRun returns delta.rows');
} else bad(`delta ${JSON.stringify(got.delta)}`);

const listed = listResearchRuns('MAPTEST', { lane: 'filings' });
if (listed.runs.find((r) => r.run_id === started.run_id)?.summary) ok('list row has summary');
else bad('list missing summary');
if (listed.lane === 'filings' && listed.runs.every((r) => r.job === 'filing_map')) ok('filings lane lists only filing_map');
else bad(`listed ${listed.lane} ${listed.runs?.map((r) => r.job)}`);

const compileLane = listResearchRuns('MAPTEST', { lane: 'compile' });
if (compileLane.runs.every((r) => r.job !== 'filing_map')) ok('compile lane excludes filing_map');
else bad('compile leaked filing_map');

const seed = writeResearchRunsAgentSeed('maptest', {
  mode: 'pipeline', run_id: started.run_id, job: 'filing_map',
});
const seedText = seed.ok ? fs.readFileSync(seed.path, 'utf8') : '';
if (seed.ok && /inbox\.json/.test(seedText) && /do not propose/i.test(seedText) && /\/cockpit-filing-map/.test(seedText)) {
  ok('seed jails inbox and forbids propose');
} else bad('seed');

const chatSeed = writeResearchRunsAgentSeed('maptest', {
  mode: 'chat', run_id: started.run_id, job: 'filing_map',
});
const chatText = chatSeed.ok ? fs.readFileSync(chatSeed.path, 'utf8') : '';
if (chatSeed.ok && /CHAT/i.test(chatText) && /do not start a second/i.test(chatText) && /propose_\*/.test(chatText)) {
  ok('chat seed does not start a second map');
} else bad('chat seed');

fs.mkdirSync(path.join(tmpVault, 'cockpit', 'compile', 'MAPORPH', 'filings'), { recursive: true });
fs.writeFileSync(path.join(tmpVault, 'cockpit', 'compile', 'MAPORPH', 'filings', 'index.json'), `${JSON.stringify({ filings: flood }, null, 2)}\n`);
const orph2 = startResearchRun('MAPORPH', { job: 'filing_map' }, { desk: 'maporph' });
if (orph2.ok) {
  const now = Date.now();
  const oldIso = new Date(now - ORPHAN_FAIL_MS - 60_000).toISOString();
  patchRunMeta('MAPORPH', orph2.run_id, (m) => ({ ...m, started_at: oldIso }));
  const rec = reconcileRun('MAPORPH', getResearchRun('MAPORPH', orph2.run_id), {
    patchRunMeta, failResearchRun, findInFlightRun,
  }, now);
  const st = getResearchRun('MAPORPH', orph2.run_id).status;
  if (st === 'queued' && !rec.failed) ok('interactive filing_map not auto-failed as orphan');
  else bad(`orphan ${st} failed=${rec.failed}`);
  cancelResearchRun('MAPORPH', orph2.run_id);
} else bad(`orph start ${orph2.error}`);

try { fs.rmSync(tmpVault, { recursive: true, force: true }); } catch { /* */ }

console.log('\nfiling-map dossier paint\n');

const nvdaSummary = 'Last print (Q2 FY27 10-Q 0001045810-26-000075, filed 2026-08-26) is already in the book; no material 8-Ks after compile. Print does not trip house flips: DC +117% Y/Y, GAAP GM 75.0%, largest direct 16%. Load-bearing new items vs SoR as-of dates are supply commitments $119B→$279B (R6 WATCH test) and SB Energy residual-value guarantees capped at $105B (add-risk candidate). R1 register FIRED is not corroborated by this 10-Q.';
const nvdaSents = splitSentences(stripAccession(nvdaSummary));
if (nvdaSents.length === 4 && /75\.0%/.test(nvdaSents[1]) && !nvdaSents[0].includes('0001045810')) {
  ok('splitSentences keeps 75.0% and yields 4 sentences');
} else bad(`split ${JSON.stringify(nvdaSents)}`);
if (isCatalogSentence(nvdaSents[0]) && !isCatalogSentence(nvdaSents[1])) ok('catalog sentence detected');
else bad('catalog detect');
const nvdaFind = findingsSentences({ summary: nvdaSummary });
if (nvdaFind.length === 3 && nvdaFind.every((s) => !isCatalogSentence(s))
  && nvdaFind.some((s) => /117%/.test(s)) && nvdaFind.some((s) => /\$279B/.test(s))
  && nvdaFind.some((s) => /R1 register FIRED/.test(s))) {
  ok('findings are 3 meat sentences (catalog dropped)');
} else bad(`findings ${JSON.stringify(nvdaFind)}`);
if (dossierHeadline(nvdaSummary).startsWith('Last print (Q2 FY27 10-Q, filed 2026-08-26)')) {
  ok('headline still first sentence, accession stripped');
} else bad(`headline ${dossierHeadline(nvdaSummary)}`);
const padded = findingsSentences({
  summary: `${nvdaSummary} Extra sixth sentence about nothing. Seventh sentence also extra.`,
});
if (padded.length === 5) ok('findings cap at 5');
else bad(`cap ${padded.length} ${JSON.stringify(padded)}`);
const shortFind = findingsSentences({
  summary: 'Last print is already in the book.',
  rowWhats: ['NVIDIA Form 10-Q for Q2 FY27. Company revenue $96.221B, Data Center $89.023B.'],
  addNames: ['Residual-value / lease credit support'],
});
if (shortFind.length >= 3 && shortFind.some((s) => /\$96\.221B/.test(s))) ok('short catalog summary filled from what.text');
else bad(`shortFind ${JSON.stringify(shortFind)}`);
const noPad = findingsSentences({
  summary: nvdaSummary,
  rowWhats: ['NVIDIA Form 10-Q for the quarter ended 2026-07-26 (Q2 FY27). Company revenue $96.221B.'],
});
if (noPad.length === 3 && !noPad.some((s) => /Form 10-Q for the quarter/.test(s))) {
  ok('findings do not pad extras once min is met');
} else bad(`noPad ${JSON.stringify(noPad)}`);

if (!stripAccession(nvdaSummary).includes('0001045810-26-000075')) ok('stripAccession drops accession');
else bad('accession leaked');

if (!houseHitTrips({ trigger: 'Sustained Data Center miss', note: 'Does not trip. DC +117% Y/Y.' })) {
  ok('Does not trip → quiet house hit');
} else bad('quiet house classified as trip');

if (houseHitTrips({ trigger: 'Supply air pocket', note: 'Trips: commitments doubled with no demand language.' })) {
  ok('non-miss note → house trip');
} else bad('trip note classified quiet');

if (houseHitTrips({ trips: true, note: 'Does not trip.' })) ok('trips:true wins over miss note');
else bad('trips:true ignored');

const houses = classifyHouseHits([
  { trigger: 'A', note: 'Does not trip.' },
  { trigger: 'B', note: 'Does not trip.' },
  { trigger: 'C', note: 'Fires the concentration wire: top customer 31%.' },
]);
if (houses.n === 3 && houses.tripped.length === 1 && houses.quiet.length === 2) ok('house 1 tripped / 2 quiet');
else bad(`house classify ${JSON.stringify(houses)}`);

const risks = classifyRiskHits([
  { name: 'R1 — DC', test: 'INTACT' },
  { name: 'R2 — Export', test: 'WATCH' },
  { name: 'R6 — Supply', test: 'WATCH' },
  { name: 'R3 — GM', test: 'FIRED' },
]);
if (risks.fired.length === 1 && risks.watch.length === 2 && risks.intact.length === 1) ok('risk FIRED/WATCH/INTACT split');
else bad(`risks ${JSON.stringify({ f: risks.fired.length, w: risks.watch.length, i: risks.intact.length })}`);

const gaps = operatorGaps([
  'Q2 Data Center networking is not a standalone $ line in this 10-Q.',
  'Inbox risk.tripwires rendered as [object Object]; tests used vault SoR tripwire text.',
  'Live POST /acquire of the inbox EDGAR URL returned HTTP 403; quotes are from a prior run.',
  'Form 3/4/5 and any 8-Ks after compile are outside this jail (material_not_in_book was empty).',
]);
if (gaps.operator.length === 1 && gaps.internal.length === 3 && gaps.operator[0].includes('networking')) {
  ok('internal GAPs dropped from operate paint');
} else bad(`gaps op=${gaps.operator.length} int=${gaps.internal.length}`);

const past = completeMaps([
  { run_id: 'c', status: 'cancelled' },
  { run_id: 'ok', status: 'complete', finished_at: '2026-09-10T04:28:52.309Z' },
  { run_id: 'fail', status: 'failed' },
]);
if (past.length === 1 && past[0].run_id === 'ok') ok('PAST MAPS is complete only');
else bad(`past ${JSON.stringify(past.map((r) => r.run_id))}`);

const nvdaVm = shapeFilingMapDossier({
  summary: nvdaSummary,
  finishedAt: '2026-09-10T04:28:52.309Z',
  runs: [
    { run_id: 'cancelled', status: 'cancelled' },
    { run_id: 'ok', status: 'complete', finished_at: '2026-09-10T04:28:52.309Z' },
  ],
  delta: {
    summary: nvdaSummary,
    rows: [{
      accession: '0001045810-26-000075',
      form: '10-Q',
      filed: '2026-08-26',
      in_book: true,
      what: { text: 'NVIDIA Form 10-Q for the quarter ended 2026-07-26 (Q2 FY27). Company revenue $96.221B.' },
      house_hits: [
        { trigger: 'Sustained Data Center miss', note: 'Does not trip. DC +117% Y/Y.' },
        { trigger: 'Concentration break', note: 'Does not trip. Largest direct 16%.' },
        { trigger: 'Export shock', note: 'Does not trip. H200 charge $0.4B.' },
        { trigger: 'Margin regime break', note: 'Does not trip. GAAP GM 75.0%.' },
        { trigger: 'Platform displacement', note: 'Does not trip. Vera Rubin production.' },
        { trigger: 'Supply commitment air pocket', note: 'Does not trip the air-pocket clause. Jump is real.' },
      ],
      risk_hits: [
        { id: 'nvda-r1', name: 'R1 — Data Center growth deceleration / AI demand digests', test: 'INTACT' },
        { id: 'nvda-r2', name: 'R2 — Export controls / China Data Center compute exclusion', test: 'WATCH' },
        { id: 'nvda-r3', name: 'R3 — Gross margin compression / mix and cost', test: 'INTACT' },
        { id: 'nvda-r4', name: 'R4 — Customer concentration / hyperscaler digest risk', test: 'WATCH' },
        { id: 'nvda-r5', name: 'R5 — Competition / custom silicon / platform displacement', test: 'INTACT' },
        { id: 'nvda-r6', name: 'R6 — Supply chain / manufacturing concentration & purchase commitments', test: 'WATCH' },
      ],
      add_risk_candidates: [{
        name: 'Residual-value / lease credit support (SB Energy PORTS / OpenAI tenant)',
        note: 'Guarantees capped at $105B. Candidate, not a write.',
      }],
      gaps: [
        'Inbox risk.tripwires rendered as [object Object]',
        'Live POST /acquire of the inbox EDGAR URL returned HTTP 403',
        'Q2 Data Center networking is not a standalone $ line in this 10-Q (R5).',
      ],
    }],
  },
});

if (nvdaVm.findings.length >= 3 && nvdaVm.findings.length <= 5
  && nvdaVm.findings.some((s) => /117%/.test(s))
  && nvdaVm.findings.some((s) => /\$279B/.test(s) || /Residual-value/.test(s) || /add-risk/i.test(s))
  && !nvdaVm.findings.some((s) => /0001045810/.test(s))) {
  ok('NVDA-shaped findings 3–5 sentences, no accession');
} else bad(`nvda findings ${JSON.stringify(nvdaVm.findings)}`);
if (nvdaVm.houseTripped.length === 0 && nvdaVm.houseN === 6) ok('NVDA 0 house trips / 6 checked');
else bad(`nvda house ${nvdaVm.houseTripped.length}/${nvdaVm.houseN}`);
if (nvdaVm.riskFired.length === 0 && nvdaVm.riskWatchN === 3 && nvdaVm.riskIntactN === 3) ok('NVDA 0 FIRED · 3 WATCH · 3 INTACT');
else bad(`nvda risks F${nvdaVm.riskFired.length} W${nvdaVm.riskWatchN} I${nvdaVm.riskIntactN}`);
if (nvdaVm.addRisk.length === 1 && /Residual-value/.test(nvdaVm.addRisk[0].name)) ok('NVDA add-risk name is the signal');
else bad('nvda add-risk');
if (nvdaVm.operatorGaps.length === 1 && !nvdaVm.operatorGaps.some((g) => /403|object Object/.test(g))) {
  ok('NVDA operate gaps hide 403 / [object Object]');
} else bad(`nvda gaps ${JSON.stringify(nvdaVm.operatorGaps)}`);
if (nvdaVm.past.length === 1 && nvdaVm.past[0].run_id === 'ok') ok('NVDA past maps drop cancelled');
else bad('nvda past');

const nvdaDig = filingPageDigest({
  summary: nvdaSummary,
  finishedAt: '2026-09-10T04:28:52.309Z',
  delta: {
    summary: nvdaSummary,
    rows: [{
      accession: '0001045810-26-000075',
      form: '10-Q',
      filed: '2026-08-26',
      in_book: true,
      what: { text: 'NVIDIA Form 10-Q for the quarter ended 2026-07-26 (Q2 FY27). Company revenue $96.221B (+18% Q/Q).' },
      add_risk_candidates: [{ name: 'Residual-value / lease credit support', note: 'Guarantees capped at $105B.' }],
      gaps: ['Inbox risk.tripwires rendered as [object Object]', 'Q2 Data Center networking is not a standalone $ line.'],
    }],
  },
});
if (nvdaDig.paragraphs.length >= 3 && nvdaDig.paragraphs.length <= 12
  && nvdaDig.accessions[0]?.what.includes('$96.221B')
  && nvdaDig.accessions[0]?.addRisk.length === 1
  && nvdaDig.accessions[0]?.gaps.length === 1) {
  ok('Filings digest is in-depth: meat summary + accession what.text');
} else bad(`digest ${JSON.stringify({ n: nvdaDig.paragraphs.length, acc: nvdaDig.accessions[0] })}`);
if (!/0001045810-26-000075/.test(nvdaVm.headline) && !/96\.221B/.test(JSON.stringify(nvdaVm.rows[0].what) ? '' : '') ) {
  ok('headline has no accession');
} else if (!/0001045810/.test(nvdaVm.headline)) ok('headline has no accession');
else bad(`accession in headline ${nvdaVm.headline}`);

console.log('\nfiling-map strip modes\n');

const printIn = { known: true, form: '10-Q', date: '2026-08-26', filed: '2026-08-26', in_book: true, accession: 'acc-in', acceptance: '2026-08-26T12:00:00.000Z' };
const printOut = { ...printIn, in_book: false, accession: 'acc-out', date: '2026-09-08', filed: '2026-09-08', acceptance: '2026-09-08T20:00:00.000Z' };
const k8new = { form: '8-K', filed: '2026-09-09', accession: '8k-new', acceptance: '2026-09-09T15:00:00.000Z', items: '8.01' };
const k8old = { form: '8-K', filed: '2026-08-20', accession: '8k-old', acceptance: '2026-08-20T15:00:00.000Z', items: '8.01' };
const mappedAt = '2026-09-01T00:00:00.000Z';

const quietMap = filingsStripMode({ print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt });
if (quietMap.mode === 'quiet') ok('mapped IN BOOK + no material → quiet');
else bad(`quietMap ${JSON.stringify(quietMap)}`);

const needNever = filingsStripMode({ print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: null });
if (needNever.mode === 'need_map' && needNever.reasons.includes('never_mapped')) {
  ok('never mapped → need_map (last print + MAP FILINGS)');
} else bad(`needNever ${JSON.stringify(needNever)}`);

const notReady = filingsStripMode({
  print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: null, mapsReady: false,
});
if (notReady.mode === 'pending' && !notReady.reasons.includes('never_mapped')) {
  ok('maps not loaded yet → pending (no never_mapped flash)');
} else bad(`notReady ${JSON.stringify(notReady)}`);

const futureDesk = filingsStripMode({
  print: {
    known: true, form: '20-F', date: '2026-04-01', filed: '2026-04-01',
    in_book: true, accession: 'future-20f', acceptance: '2026-04-01T12:00:00.000Z',
  },
  materialItems: [],
  materialCount: 0,
  inflight: false,
  mappedAt: null,
});
if (futureDesk.mode === 'need_map' && futureDesk.reasons.includes('never_mapped')) {
  ok('future ticker: IN BOOK + no material + no map → need_map');
} else bad(`futureDesk ${JSON.stringify(futureDesk)}`);

const needMat = filingsStripMode({ print: printIn, materialItems: [k8new], materialCount: 1, inflight: false, mappedAt: null });
if (needMat.mode === 'need_map') ok('unmapped material + no map → need_map');
else bad(`needMat ${JSON.stringify(needMat)}`);

const staleMat = filingsStripMode({ print: printIn, materialItems: [k8old], materialCount: 1, inflight: false, mappedAt });
if (staleMat.mode === 'quiet') ok('material older than last map → quiet');
else bad(`staleMat ${JSON.stringify(staleMat)}`);

const freshMat = filingsStripMode({ print: printIn, materialItems: [k8new], materialCount: 1, inflight: false, mappedAt });
if (freshMat.mode === 'new' && freshMat.unmappedN === 1) ok('material newer than last map → new');
else bad(`freshMat ${JSON.stringify(freshMat)}`);

const unmappedPrint = filingsStripMode({ print: printOut, materialItems: [], materialCount: 0, inflight: false, mappedAt: null });
if (unmappedPrint.mode === 'need_map') ok('NOT IN BOOK print, never mapped → need_map');
else bad(`unmappedPrint ${JSON.stringify(unmappedPrint)}`);

const mappedOut = filingsStripMode({ print: printOut, materialItems: [], materialCount: 0, inflight: false, mappedAt: '2026-09-10T00:00:00.000Z' });
if (mappedOut.mode === 'quiet') ok('NOT IN BOOK print already mapped (map after print) → quiet');
else bad(`mappedOut ${JSON.stringify(mappedOut)}`);

const flying = filingsStripMode({ print: printIn, materialItems: [], materialCount: 0, inflight: true, mappedAt });
if (flying.mode === 'new' && flying.reasons.includes('inflight')) ok('in-flight remap of a quiet desk → new');
else bad(`flying ${JSON.stringify(flying)}`);

if (nextFilingsOpen({ mode: 'pending' }).expanded === false) ok('pending stays collapsed');
else bad('pending open');
if (nextFilingsOpen({ mode: 'need_map', stored: '1' }).expanded === false) ok('need_map has no findings to open');
else bad('need_map open');
if (nextFilingsOpen({ mode: 'new', stored: '0' }).expanded === false) ok('new does not auto-open prior findings');
else bad('new open');
if (nextFilingsOpen({ mode: 'new', stored: '1' }).expanded === true) ok('new remembers Show map');
else bad('new stored');
if (nextFilingsOpen({ mode: 'quiet', stored: null }).expanded === false) ok('quiet default collapsed');
else bad('quiet collapse');
if (nextFilingsOpen({ mode: 'quiet', stored: '1' }).expanded === true) ok('quiet remembers Show map');
else bad('quiet stored');

const extraDedup = filingsExtraRows(printOut, [
  { accession: 'acc-out', form: '10-Q', filed: '2026-09-08' },
  { accession: 's-4', form: 'S-4', filed: '2026-09-10' },
]);
if (extraDedup.length === 1 && extraDedup[0].form === 'S-4') ok('extra rows drop last print (no duplicate 10-Q)');
else bad(`extraDedup ${JSON.stringify(extraDedup)}`);
if (filingsExtraRows(printIn, []).length === 0) ok('no extras when material empty');
else bad('empty extras');

const leak = filingsLedgerExtras(printIn, [k8old, k8new], mappedAt);
if (leak.length === 1 && leak[0].accession === '8k-new') ok('ledger extras drop last print and already-mapped rows');
else bad(`ledger extras ${JSON.stringify(leak)}`);
if (filingsLedgerExtras(printIn, [k8old], mappedAt).length === 0) ok('quiet ledger has no leftover extras');
else bad('quiet leftover extras');
const mapListed = filingsMapList([
  { run_id: 'c', status: 'cancelled' },
  { run_id: 'ok', status: 'complete' },
  { run_id: 'fail', status: 'failed' },
]);
if (mapListed.length === 2 && mapListed[0].run_id === 'ok') ok('map list is complete + failed, not cancelled');
else bad(`map list ${JSON.stringify(mapListed.map((r) => r.run_id))}`);

const mem = {
  d: Object.create(null),
  getItem(k) { return Object.prototype.hasOwnProperty.call(this.d, k) ? this.d[k] : null; },
  setItem(k, v) { this.d[k] = String(v); },
};
writeFilingsExpandStore('Acme', true, mem);
if (mem.getItem(filingsExpandKey('acme')) === '1' && readFilingsExpandStore('ACME', mem) === '1') {
  ok('expand store is per-slug, case-insensitive (future tickers)');
} else bad(`store ${JSON.stringify(mem.d)}`);

const rail = filingsRailLabel({ print: printIn, mapped: true, unmappedN: 0 });
if (rail === '10-Q · 2026-08-26 · IN BOOK · mapped') ok(`rail ${rail}`);
else bad(`rail ${rail}`);

if (filingEventAt(k8new) === '2026-09-09T15:00:00.000Z') ok('filingEventAt prefers acceptance');
else bad(`event ${filingEventAt(k8new)}`);

function playModes(steps) {
  return steps.map((step) => {
    const strip = filingsStripMode(step);
    const open = nextFilingsOpen({ mode: strip.mode, stored: step.stored == null ? null : step.stored });
    return { mode: strip.mode, expanded: open.expanded };
  });
}

const nvdaLoad = playModes([
  { mapsReady: false, print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: null },
  { mapsReady: true, print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: '2026-09-10T04:28:52.309Z' },
]);
if (nvdaLoad[0].mode === 'pending' && nvdaLoad[1].mode === 'quiet' && !nvdaLoad[1].expanded) {
  ok('NVDA load: pending then quiet rail');
} else bad(`nvdaLoad ${JSON.stringify(nvdaLoad)}`);

const mrvlLoad = playModes([
  { mapsReady: false, print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: null },
  { mapsReady: true, print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: null },
]);
if (mrvlLoad[0].mode === 'pending' && mrvlLoad[1].mode === 'need_map') {
  ok('MRVL load: pending then need_map (catalog + MAP FILINGS)');
} else bad(`mrvlLoad ${JSON.stringify(mrvlLoad)}`);

const afterAgent = playModes([
  { mapsReady: true, print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: null },
  { mapsReady: true, print: printIn, materialItems: [], materialCount: 0, inflight: true, mappedAt: null },
  { mapsReady: true, print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: '2026-09-10T12:00:00.000Z' },
]);
if (afterAgent[0].mode === 'need_map' && afterAgent[1].mode === 'need_map'
  && afterAgent[2].mode === 'quiet' && !afterAgent[2].expanded) {
  ok('after MAP FILINGS publishes in-session → quiet rail');
} else bad(`afterAgent ${JSON.stringify(afterAgent)}`);

const newAfter = playModes([
  { mapsReady: true, print: printIn, materialItems: [], materialCount: 0, inflight: false, mappedAt: '2026-09-01T00:00:00.000Z' },
  { mapsReady: true, print: printIn, materialItems: [k8new], materialCount: 1, inflight: false, mappedAt: '2026-09-01T00:00:00.000Z' },
]);
if (newAfter[0].mode === 'quiet' && newAfter[1].mode === 'new' && !newAfter[1].expanded) {
  ok('new 8-K after map → new, findings stay closed');
} else bad(`newAfter ${JSON.stringify(newAfter)}`);

const ovSrc = fs.readFileSync(path.join(ROOT, 'src/pages/thin/Overview.jsx'), 'utf8');
if (/FilingsSignal/.test(ovSrc) && /#\/\$\{slug\}\/filings/.test(ovSrc)) ok('Overview signal deep-links to Filings room');
else bad('Overview missing Filings signal');
if (/className="btn"/.test(ovSrc) && /MAP FILINGS/.test(ovSrc)) bad('Overview still has MAP FILINGS button');
else ok('Overview has no MAP FILINGS workstation button');
if (/FilingMapDossier/.test(ovSrc) || /Show map/.test(ovSrc) || /<LastPrint /.test(ovSrc)) {
  bad('Overview still hosts the filings workstation');
} else ok('Overview is signal-only (no dossier / Show map / LastPrint)');
if (/ov-stack/.test(ovSrc) || /filingsPin/.test(ovSrc)) bad('Overview still pins via ov-stack');
else ok('Overview does not move the house');

const filSrc = fs.readFileSync(path.join(ROOT, 'src/pages/thin/Filings.jsx'), 'utf8');
if (/MAP FILINGS/.test(filSrc) && /Open analysis/.test(filSrc) && /FilingMapDossier/.test(filSrc)) {
  ok('Filings room has catalog, MAP FILINGS, open-one analysis');
} else bad('Filings room missing workstation');
if (/fmap-maps/.test(filSrc) && /dossierHeadline/.test(filSrc) && /fmap-maps-head/.test(filSrc)) {
  ok('Maps table fills Summary with headline, not an empty cue column');
} else bad('Maps table still wastes Summary width');
if (/filingsLedgerExtras/.test(filSrc) && /filingsMapList/.test(filSrc)) ok('Filings uses ledger extras + map list');
else bad('Filings missing ledger helpers');
if (/nvda|lly|nbis/i.test(filSrc.match(/filingsStripMode\([\s\S]*?\}\s*\)/)?.[0] || 'filingsStripMode(')) {
  bad('Filings mode hardcoded ticker');
} else ok('Filings strip mode is ticker-agnostic');

const routerSrc = fs.readFileSync(path.join(ROOT, 'src/pages/thin/DeskRouter.jsx'), 'utf8');
if (/ThinFilings/.test(routerSrc) && /startsWith\('filings'\)/.test(routerSrc)) ok('DeskRouter mounts Filings');
else bad('DeskRouter missing Filings');

const dossierSrc = fs.readFileSync(path.join(ROOT, 'src/pages/thin/FilingMapDossier.jsx'), 'utf8');
if (/OPEN GROK/.test(dossierSrc) && /PROPOSE FROM MAP/.test(dossierSrc) && /CONFIRM PROPOSE/.test(dossierSrc)
  && /filingPageDigest/.test(dossierSrc) && /Digest/.test(dossierSrc)) {
  ok('dossier paints in-depth digest + OPEN GROK + PROPOSE FROM MAP');
} else bad('dossier missing digest');
if (/fmap-digest-head/.test(dossierSrc)
  && dossierSrc.indexOf('OPEN GROK') < dossierSrc.indexOf('fmap-digest-grid')) {
  ok('OPEN GROK sits in the digest head, not under accessions');
} else bad('OPEN GROK still below the digest grid');
if (/propose-from-map/.test(fs.readFileSync(path.join(ROOT, 'server/thinDeskMount.js'), 'utf8'))
  && fs.existsSync(path.join(ROOT, 'server/filingMapCloseout.js'))) {
  ok('propose-from-map API + filingMapCloseout module');
} else bad('propose-from-map mount / module missing');
if (/fmap-digest-grid/.test(dossierSrc) && /fmap-digest-side/.test(dossierSrc) && /Accessions/.test(dossierSrc)) {
  ok('dossier uses two-column digest | accessions on wide glass');
} else bad('dossier still stacks into a left gutter');
if (/specrow|delta\.json|PAST MAPS|fmap-specs/.test(dossierSrc)) bad('dossier still has specrow / files / PAST MAPS');
else ok('dossier dropped specrow, files, PAST MAPS');

console.log(`\n${pass} passed · ${fail} failed`);
process.exit(fail ? 1 : 0);
