#!/usr/bin/env node
/** JS twin of prove_review_fixes.py. Revert each fix and prove the fixture fails.
 *  Do not run in parallel with the Python prove (both edit live files).
 */
import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawnSync } from 'child_process';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../..');
const TAX = path.join(ROOT, 'ontology/schema/taxonomy_xbrl.json');
const JS = path.join(ROOT, 'memory-cockpit-v2/server/companyfacts.js');
const FIX = path.join(ROOT, 'harness-stress/fixtures/companyfacts');

const backups = {
  [TAX]: readFileSync(TAX, 'utf8'),
  [JS]: readFileSync(JS, 'utf8'),
};

function restore() {
  for (const [file, text] of Object.entries(backups)) writeFileSync(file, text);
}

function replaceOnce(file, old, next) {
  const text = readFileSync(file, 'utf8');
  if (!text.includes(old)) {
    restore();
    throw new Error(`missing patch needle in ${file}`);
  }
  writeFileSync(file, text.replace(old, next));
}

function check(snippet) {
  const src = `
    import { parseCompanyfacts, taggedSlots, headlineGaps, loadTaxonomy, STALE_DAYS } from ${JSON.stringify(JS)};
    import { readFileSync } from 'fs';
    const root = ${JSON.stringify(FIX)};
    function pair(id) {
      const doc = JSON.parse(readFileSync(root + '/' + id + '/companyfacts.json', 'utf8'));
      const facts = parseCompanyfacts(doc).facts;
      const slots = taggedSlots(facts);
      const gaps = headlineGaps(slots, null, facts);
      return { slots, gaps };
    }
    ${snippet}
  `;
  const proc = spawnSync('node', ['--input-type=module', '-e', src], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  return proc.status === 0;
}

function expectFail(name, snippet) {
  if (check(snippet)) {
    restore();
    throw new Error(`${name}: still passed after revert`);
  }
  console.log(`PROVED ${name} fails when reverted`);
}

function expectPass(name, snippet) {
  if (!check(snippet)) {
    restore();
    throw new Error(`${name}: failed after restore`);
  }
  console.log(`OK ${name} restored`);
}

const BANK = "const s=pair('bank').slots; if (s.company_revenue?.value_text!=='57347000000' || s.company_revenue?.concept!=='us-gaap:RevenuesNetOfInterestExpense' || s.company_revenue?.ytd?.value_text!=='107183000000' || s.total_debt) process.exit(1);";
const TRUE = "const s=pair('true-total').slots; if (s.company_revenue?.concept!=='us-gaap:Revenues' || s.company_revenue?.value_text!=='182447000000') process.exit(1);";
const STALE = "const r=pair('stale-slot'); if (r.slots.total_debt || !r.gaps.some(g=>g.includes('stale: last reported 2014-06-30'))) process.exit(1);";
const SIXK = "const s=pair('sixk-nofp').slots; if (s.company_revenue?.value_text!=='80000000' || s.company_revenue?.ytd?.value_text!=='170000000') process.exit(1);";
const TENKT = "const s=pair('tenkt-q').slots; if (s.company_revenue?.value_text!=='440000000' || s.company_revenue?.form!=='10-KT') process.exit(1);";
const KQ4 = "const s=pair('k-vs-q4').slots; if (s.company_revenue?.value_text!=='1000000000' || s.company_revenue?.form!=='10-K') process.exit(1);";
const PYTD = "const s=pair('primary-ytd').slots; if (s.company_revenue?.concept!=='us-gaap:SalesRevenueNet' || s.company_revenue?.value_text!=='80000000' || s.company_revenue?.ytd?.value_text!=='500000000') process.exit(1);";
const SPAN = "const a=pair('span-tie').slots; const b=pair('span-tie-rev').slots; if (a.company_revenue?.value_text!=='200000000' || b.company_revenue?.value_text!==a.company_revenue?.value_text) process.exit(1);";
const TAXLIST = "const t=loadTaxonomy(); const listed=[...(t.metrics.company_revenue.concepts||[]), ...(t.metrics.company_revenue.fallback||[])]; if (listed.includes('us-gaap:OperatingLeaseLeaseIncome')) process.exit(1);";
const SIXKFY = "const s=pair('sixk-fy-q').slots; if (s.company_revenue?.value_text!=='250000000' || s.company_revenue?.ytd) process.exit(1);";
const TENKTSHORT = "const s=pair('tenkt-short').slots; if (s.company_revenue?.value_text!=='340000000' || s.company_revenue?.form!=='10-KT') process.exit(1);";
const LEASE = "const r=pair('lease-only'); if (r.slots.company_revenue?.concept!=='us-gaap:OperatingLeaseLeaseIncome' || !r.gaps.includes('company_revenue: lease income only')) process.exit(1);";
const PAD = "const r=pair('stale-pad'); if (r.slots.total_debt?.value_text!=='500000000' || r.slots.interest_revenue) process.exit(1);";

try {
  const tax = JSON.parse(readFileSync(TAX, 'utf8'));
  tax.metrics.company_revenue.fallback.unshift('us-gaap:OperatingLeaseLeaseIncome');
  writeFileSync(TAX, `${JSON.stringify(tax, null, 2)}\n`);
  expectFail('true-total/taxonomy', TRUE);
  expectFail('taxonomy-list', TAXLIST);
  restore();

  const tax2 = JSON.parse(readFileSync(TAX, 'utf8'));
  tax2.metrics.company_revenue.fallback = tax2.metrics.company_revenue.fallback.filter(
    (c) => c !== 'us-gaap:RevenuesNetOfInterestExpense',
  );
  writeFileSync(TAX, `${JSON.stringify(tax2, null, 2)}\n`);
  expectFail('bank/rnie', BANK);
  restore();

  replaceOnce(JS, '\nexport const STALE_DAYS = 760;\n', '\nexport const STALE_DAYS = 730;\n');
  expectFail('stale-pad', PAD);
  restore();

  replaceOnce(JS, '    if (factIsStale(win.period.end, latestPeriodic)) {\n      stale[mid] = win.period.end;\n      continue;\n    }\n', '');
  expectFail('stale-slot', STALE);
  expectFail('bank/stale', BANK);
  restore();

  replaceOnce(JS, "const INTERIM_FORMS = new Set(['10-Q', '6-K']);", "const INTERIM_FORMS = new Set(['10-Q']);");
  expectFail('sixk-nofp', SIXK);
  restore();

  replaceOnce(
    JS,
    "    const annualFormAnnual = atEnd.some(([w]) => kindOf(w) === 'annual' && ANNUAL_FORMS.has(formFamily(w.form)));\n",
    "    const annualFormAnnual = atEnd.some(([w]) => kindOf(w) === 'annual' && (ANNUAL_FORMS.has(formFamily(w.form)) || formFamily(w.form) === '6-K'));\n",
  );
  expectFail('sixk-fy-q', SIXKFY);
  restore();

  replaceOnce(
    JS,
    "    const annualFormAnnual = atEnd.some(([w]) => kindOf(w) === 'annual' && ANNUAL_FORMS.has(formFamily(w.form)));\n",
    "    const annualFormAnnual = false;\n",
  );
  expectFail('tenkt-q', TENKT);
  expectFail('k-vs-q4', KQ4);
  restore();

  replaceOnce(
    JS,
    "  if (family === '10-KT' && fpU === 'FY') return 'annual';\n  if (fpU === 'FY' && ANNUAL_FORMS.has(family)) return 'annual';\n",
    '',
  );
  expectFail('tenkt-short', TENKTSHORT);
  restore();

  replaceOnce(
    JS,
    "      return [dur, -(cidx < 0 ? 99 : cidx), span, w.filed || '', w.accession || ''];",
    "      return [-(cidx < 0 ? 99 : cidx), dur, span, w.filed || '', w.accession || ''];",
  );
  expectFail('primary-ytd', PYTD);
  restore();

  replaceOnce(
    JS,
    "      return [dur, -(cidx < 0 ? 99 : cidx), span, w.filed || '', w.accession || ''];",
    "      return [dur, -(cidx < 0 ? 99 : cidx), 0, w.filed || '', w.accession || ''];",
  );
  expectFail('span-tie', SPAN);
  restore();

  replaceOnce(
    JS,
    `    const trueTotalOnFiler = (facts || []).some((f) => !f.dimensional && concepts.includes(f.concept));
    if (!cands.length && mid === 'company_revenue' && !trueTotalOnFiler) {
      cands = pool.filter((f) => f.concept === LEASE_REVENUE);
      leaseOnly = cands.length > 0;
      if (leaseOnly) concepts = [...concepts, LEASE_REVENUE];
    }
`,
    '',
  );
  expectFail('lease-only', LEASE);
  restore();

  for (const [name, snippet] of [
    ['true-total', TRUE],
    ['bank', BANK],
    ['stale-slot', STALE],
    ['stale-pad', PAD],
    ['sixk-nofp', SIXK],
    ['sixk-fy-q', SIXKFY],
    ['tenkt-q', TENKT],
    ['tenkt-short', TENKTSHORT],
    ['k-vs-q4', KQ4],
    ['primary-ytd', PYTD],
    ['span-tie', SPAN],
    ['lease-only', LEASE],
    ['taxonomy-list', TAXLIST],
  ]) {
    expectPass(name, snippet);
  }
} finally {
  restore();
}
console.log('all review-fix reverts proved (js)');
