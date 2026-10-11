// Exact match of companyfacts fixtures vs expected.json. No network.
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadCompanyfactsFile, taggedSlots } from '../server/companyfacts.js';

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
}

if (!process.exitCode) console.log(`companyfacts JS fixtures ${dirs.length} exact match`);
