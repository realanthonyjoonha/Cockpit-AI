#!/usr/bin/env node
// compile-pipeline-test.mjs — phase-1 gate for the deep-compile pipeline (stages 0+1).
// Plan: plans/2026-08-19-deep-compile-redesign.md
//
// Layer 1: pure-function fixtures (coverageTier, filedSinceCompile) — no network.
// Layer 2: live/cached EDGAR — all registry desks tier correctly (5A/2B/2C on the
//          dogfood book) and NVDA's 2026-08-17 8-K is present in the filing index.
// Writes: only the pipeline's own cache lane (cockpit/compile/{TICKER}/) — the same
// writes production makes on any page load. No SoR (house/risks/store) is touched.
import { readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { coverageTier, filedSinceCompile, normalizeFilings, pipelineSnapshot } from '../server/secEdgar.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad = (n, m) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n} — ${m}`); };
const check = (n, cond, msg) => (cond ? ok(n) : bad(n, msg || 'failed'));

console.log('\x1b[1m1 · pure functions\x1b[0m');

// coverageTier fixtures
const mk = (form, is_xbrl = true) => ({ form, is_xbrl });
const tA = coverageTier({ cik: 1 }, [mk('10-K'), mk('10-K'), mk('10-K'), mk('10-Q'), mk('8-K')]);
check('tier A: 3×10-K + XBRL', tA.tier === 'A', JSON.stringify(tA));
const tB = coverageTier({ cik: 1 }, [mk('10-K'), mk('10-Q'), mk('10-Q/A')]);
check('tier B: 1×10-K thin history', tB.tier === 'B', JSON.stringify(tB));
const tB2 = coverageTier({ cik: 1 }, [mk('10-K', false), mk('10-K', false), mk('10-K', false), mk('10-Q', false)]);
check('tier B: no XBRL on periodic', tB2.tier === 'B', JSON.stringify(tB2));
const tC = coverageTier({ cik: 1 }, [mk('20-F', false), mk('6-K', false), mk('6-K', false)]);
check('tier C: FPI 20-F/6-K', tC.tier === 'C', JSON.stringify(tC));
const tD1 = coverageTier({ cik: null }, []);
check('tier D: no entity', tD1.tier === 'D', JSON.stringify(tD1));
const tD2 = coverageTier({ cik: 1 }, [mk('8-K'), mk('4')]);
check('tier D: no periodic forms', tD2.tier === 'D', JSON.stringify(tD2));
// amendments must not count toward 10-K history depth
const tAmend = coverageTier({ cik: 1 }, [mk('10-K'), mk('10-K/A'), mk('10-K/A'), mk('10-Q')]);
check('tier B: 10-K/A does not add annual depth', tAmend.tier === 'B', JSON.stringify(tAmend));

// filedSinceCompile fixtures
const F = [
  { form: '8-K', filed: '2026-08-17', acceptance: '2026-08-17T20:05:00.000Z', accession: 'a1' },
  { form: '4', filed: '2026-08-12', acceptance: '2026-08-12T21:00:00.000Z', accession: 'a2' },
  { form: '10-Q', filed: '2026-08-08', acceptance: '2026-08-08T00:30:00.000Z', accession: 'a3' }, // before compile same day
  { form: '144', filed: '2026-08-09', acceptance: null, accession: 'a4' },
  { form: '10-K', filed: '2026-07-01', acceptance: '2026-07-01T10:00:00.000Z', accession: 'a5' },
];
const sc = filedSinceCompile(F, '2026-08-08T01:53:26Z');
check('since: acceptance-precise (same-day pre-compile 10-Q excluded)', sc.count === 3 && !sc.items.find((f) => f.accession === 'a3'), JSON.stringify({ count: sc.count }));
check('since: material/routine split', sc.material_count === 1 && sc.routine_count === 2 && sc.material_items[0].form === '8-K', JSON.stringify(sc.material_by_form));
const scNull = filedSinceCompile(F, null);
check('since: null baseline → note, count null', scNull.count === null && !!scNull.note, JSON.stringify(scNull));

// normalizeFilings shape
const nf = normalizeFilings({ cik: 320193, filings: { recent: { accessionNumber: ['0000320193-26-000001'], form: ['10-K'], filingDate: ['2026-01-01'], reportDate: ['2025-12-27'], acceptanceDateTime: ['2026-01-01T21:00:00.000Z'], items: [''], isXBRL: [1], isInlineXBRL: [1], primaryDocument: ['x.htm'], primaryDocDescription: ['10-K'] } } });
check('normalize: url + fields', nf.length === 1 && nf[0].url.includes('/320193/000032019326000001/x.htm') && nf[0].is_xbrl === true, JSON.stringify(nf[0]));

console.log('\n\x1b[1m2 · live/cached EDGAR — registry desks\x1b[0m');
const REG = JSON.parse(readFileSync(path.join(ROOT, 'config', 'thin-desks.json'), 'utf8'));
const EXPECT = { NVDA: 'A', AVGO: 'A', AMD: 'A', MU: 'A', MRVL: 'A', SHAZ: 'B', IREN: 'B', TSM: 'C', NBIS: 'C' };
const desks = Array.isArray(REG.desks) ? REG.desks : [];
const got = {};
if (desks.length === 0) {
  ok('empty registry — skip live EDGAR desk census (friend/product shell)');
} else {
  for (const d of desks) {
    const t = String(d.ticker).toUpperCase();
    try {
      const s = await pipelineSnapshot(t, { compiledAt: '2026-08-08T01:53:26Z' });
      if (!s.available) { bad(`${t} snapshot`, s.reason || 'unavailable'); continue; }
      got[t] = s;
      const exp = EXPECT[t];
      if (exp) check(`${t} tier ${exp}`, s.tier.tier === exp, `got ${s.tier.tier} (${(s.tier.reasons || []).join('; ')})`);
      else ok(`${t} tier ${s.tier.tier} (no expectation — new desk)`);
      check(`${t} filings indexed`, s.filings_total_recent > 0, 'empty index');
      check(`${t} since-compile computable`, s.since_compile && s.since_compile.count !== undefined, 'no since_compile');
    } catch (e) { bad(`${t} snapshot`, e.message); }
    await new Promise((r) => setTimeout(r, 120)); // SEC politeness
  }
  const registryTickers = new Set(desks.map((d) => String(d.ticker).toUpperCase()));
  const dogfoodTickers = Object.keys(EXPECT);
  const hasFullDogfood = dogfoodTickers.every((t) => registryTickers.has(t));
  if (hasFullDogfood) {
    const tiers = dogfoodTickers.map((t) => got[t]?.tier?.tier).filter(Boolean);
    check('tier census 5A/2B/2C on dogfood book',
      tiers.filter((x) => x === 'A').length === 5 && tiers.filter((x) => x === 'B').length === 2 && tiers.filter((x) => x === 'C').length === 2,
      JSON.stringify(tiers));
  } else {
    ok(`partial registry — skip dogfood census (desks: ${[...registryTickers].join(',') || 'none'})`);
  }

  // NVDA 2026-08-17 8-K visible (permanent history assert) — only when NVDA is installed
  const nvda = got.NVDA;
  if (nvda) {
    const hit = (nvda.since_compile.material_items || []).find((f) => f.form === '8-K' && f.filed === '2026-08-17')
      || (nvda.latest_filings || []).find((f) => f.form === '8-K' && f.filed === '2026-08-17');
    check('NVDA 8-K 2026-08-17 visible with sec.gov URL', !!hit && /sec\.gov\/Archives/.test(hit.url), JSON.stringify((nvda.latest_filings || []).slice(0, 3)));
  } else if (registryTickers.has('NVDA')) {
    bad('NVDA 8-K 2026-08-17 visible', 'no NVDA snapshot');
  } else {
    ok('NVDA not in this install — skip 8-K history assert');
  }
}

console.log(`\ncompile-pipeline ${fail ? '\x1b[31mFAIL\x1b[0m' : '\x1b[32mPASS\x1b[0m'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
