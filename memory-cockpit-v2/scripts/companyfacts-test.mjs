// Exact match of companyfacts fixtures vs expected.json. No network.
import { existsSync, readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { headlineGaps, loadCompanyfactsFile, missingMappedFromSource, taggedSlots } from '../server/companyfacts.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.resolve(HERE, '../../harness-stress/fixtures/companyfacts');

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

const dirs = readdirSync(FIX, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
if (dirs.length < 12) fail(`expected >= 12 fixtures, got ${dirs.length}`);

for (const id of dirs) {
  const parsed = loadCompanyfactsFile(path.join(FIX, id, 'companyfacts.json'), { sourceId: `companyfacts/${id}` });
  const slots = taggedSlots(parsed.facts);
  const expected = JSON.parse(readFileSync(path.join(FIX, id, 'expected.json'), 'utf8'));
  for (const [mid, want] of Object.entries(expected.slots || {})) {
    const got = slots[mid];
    if (!got) {
      fail(`${id} missing ${mid}`);
      continue;
    }
    if (got.value_text !== want.value_text) fail(`${id} ${mid} ${got.value_text} != ${want.value_text}`);
    if (got.period.end !== want.end) fail(`${id} ${mid} end ${got.period.end} != ${want.end}`);
    if (got.concept !== want.concept) fail(`${id} ${mid} concept ${got.concept} != ${want.concept}`);
    if (got.form !== want.form) fail(`${id} ${mid} form ${got.form} != ${want.form}`);
    if (got.filed !== want.filed) fail(`${id} ${mid} filed ${got.filed} != ${want.filed}`);
    if (got.unit !== want.unit) fail(`${id} ${mid} unit ${got.unit} != ${want.unit}`);
    const ytd = got.ytd ? got.ytd.value_text : null;
    const wantYtd = want.ytd ? want.ytd.value_text : null;
    if (ytd !== wantYtd) fail(`${id} ${mid} ytd ${ytd} != ${wantYtd}`);
    const prior = got.prior && got.prior.restated ? got.prior.value_text : null;
    const wantPrior = want.prior ? want.prior.value_text : null;
    if (prior !== wantPrior) fail(`${id} ${mid} prior ${prior} != ${wantPrior}`);
  }
  for (const mid of expected.empty || []) {
    if (slots[mid]) fail(`${id} ${mid} should be empty`);
  }
  const gaps = headlineGaps(slots, null, parsed.facts);
  for (const msg of expected.gaps_contain || []) {
    if (!gaps.includes(msg)) fail(`${id} missing gap ${msg}`);
  }
}

for (const id of dirs) {
  const srcPath = path.join(FIX, id, 'source-concepts.json');
  if (!existsSync(srcPath)) continue;
  const src = JSON.parse(readFileSync(srcPath, 'utf8'));
  const doc = JSON.parse(readFileSync(path.join(FIX, id, 'companyfacts.json'), 'utf8'));
  const missing = missingMappedFromSource(doc, src.concepts || {});
  if (missing.length) fail(`${id} trimmed mapped concepts: ${missing.join(', ')}`);
  if (id === 'bank') {
    if (src.concepts?.['us-gaap:RevenuesNetOfInterestExpense']?.USD !== 149) {
      fail('bank source-concepts dropped RevenuesNetOfInterestExpense');
    }
    const trimmed = structuredClone(doc);
    delete trimmed.facts['us-gaap'].RevenuesNetOfInterestExpense;
    const trimmedMissing = missingMappedFromSource(trimmed, src.concepts || {});
    if (!trimmedMissing.some((m) => m.includes('RevenuesNetOfInterestExpense'))) {
      fail('completeness check did not fail after deleting RNIE from a bank copy');
    }
  }
}

if (!process.exitCode) console.log(`companyfacts JS fixtures ${dirs.length} exact match`);
