// V2 companyfacts: properties + constructed documents. No frozen dollars. No network.
import { readFileSync, readdirSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { headlineGaps, latestFilingSlots, loadCompanyfactsFile } from '../server/companyfacts.js';
import { CONSTRUCTED, slotPropertyErrors } from '../../harness-stress/lib/review-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const FIX = path.resolve(HERE, '../../harness-stress/fixtures/companyfacts');

function fail(msg) {
  console.error(`FAIL ${msg}`);
  process.exitCode = 1;
}

const index = JSON.parse(readFileSync(path.join(FIX, 'index.json'), 'utf8'));
for (const need of CONSTRUCTED) {
  if (!(index.issuers || []).some((row) => row.id === need)) fail(`missing constructed fixture ${need}`);
}

const dirs = readdirSync(FIX, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
for (const id of dirs) {
  const parsed = loadCompanyfactsFile(path.join(FIX, id, 'companyfacts.json'), { sourceId: `companyfacts/${id}` });
  const { slots, gaps } = latestFilingSlots(parsed.facts);
  for (const err of slotPropertyErrors(parsed.facts, slots)) fail(`${id} ${err}`);
  const fromApi = headlineGaps(slots, null, parsed.facts);
  if (JSON.stringify(fromApi) !== JSON.stringify(gaps)) fail(`${id} headlineGaps drifted`);
}

const unique = latestFilingSlots(loadCompanyfactsFile(path.join(FIX, 'unique', 'companyfacts.json')).facts);
if ((unique.slots.company_revenue?.values || []).length !== 1 || unique.slots.company_revenue?.value_text == null) {
  fail('unique did not fill one labeled period');
}
const two = latestFilingSlots(loadCompanyfactsFile(path.join(FIX, 'two-periods', 'companyfacts.json')).facts);
if ((two.slots.company_revenue?.values || []).length !== 2 || two.slots.company_revenue?.value_text != null) {
  fail('two-periods did not show both periods');
}
const clash = latestFilingSlots(loadCompanyfactsFile(path.join(FIX, 'same-period-disagree', 'companyfacts.json')).facts);
if (clash.slots.company_revenue || !(clash.gaps || []).some((g) => g.includes('disagreeing tagged facts'))) {
  fail('same-period-disagree did not gap the period');
}
const none = latestFilingSlots(loadCompanyfactsFile(path.join(FIX, 'none', 'companyfacts.json')).facts);
if (none.slots.company_revenue) fail('none filled company_revenue');

if (!process.exitCode) console.log(`companyfacts JS properties ${dirs.length} fixtures`);
