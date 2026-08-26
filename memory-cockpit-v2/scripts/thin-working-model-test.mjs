#!/usr/bin/env node
/**
 * thin-working-model-test.mjs — Model vault format gate + GET/publish.
 */
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const tmpVault = fs.mkdtempSync(path.join(os.tmpdir(), 'cockpit-model-'));
process.env.COCKPIT_VAULT = tmpVault;

const {
  getWorkingModel,
  refreshWorkingModel,
  armWorkingModelPrint,
  lockWorkingModelPrint,
  workingModelHistoryDir,
} = await import(path.join(ROOT, 'server', 'thinWorkingModel.js'));
const {
  validateWorkingModelSnapshot,
  normalizePrintDate,
} = await import(path.join(ROOT, 'server', 'workingModelSchema.js'));

let pass = 0;
let fail = 0;
const ok = (m) => { pass++; console.log('  ✓', m); };
const bad = (m) => { fail++; console.log('  ✗', m); };

console.log('\nthin working model v1\n');

const goodBody = {
  schema_version: 1,
  ticker: 'TEST',
  as_of: '2026-08-06',
  frame: 'Illustration from user assumptions — not a price target.',
  assumptions: [
    {
      id: 'rev_growth',
      label: 'Revenue growth',
      value: '20',
      unit: '%',
      source: 'user',
      watch_risk: 'R1',
      watch_note: 'Demand tripwire',
    },
    {
      id: 'gm',
      label: 'Gross margin',
      value: '55',
      unit: '%',
      source: 'pack',
    },
  ],
  bridge: [
    { id: 'revenue', label: 'Revenue', value: '100', unit: 'index', note: 'sketch' },
    { id: 'gp', label: 'Gross profit', value: '55', unit: 'index' },
  ],
  variance: [],
  gaps: ['FCF conversion not modeled'],
  disclaimer: 'Decision-support only. Illustration — not PT or recommendation.',
};

if (!validateWorkingModelSnapshot(goodBody, { ticker: 'TEST' }).ok) bad('good should pass');
else ok('complete snapshot validates');

const advice = {
  ...goodBody,
  assumptions: [{ ...goodBody.assumptions[0], note: 'you should buy more here' }],
};
if (validateWorkingModelSnapshot(advice, { ticker: 'TEST' }).ok) bad('advice language');
else ok('advice language rejected');

const noBridge = {
  ...goodBody,
  bridge: [],
};
if (validateWorkingModelSnapshot(noBridge, { ticker: 'TEST' }).ok) bad('no bridge');
else ok('empty bridge rejected');

const empty = await refreshWorkingModel('TEST', {});
if (empty.ok) bad('empty body');
else ok('empty body does not overwrite');

const pub = await refreshWorkingModel('TEST', goodBody);
if (!pub.ok || !pub.available) bad(`publish ${pub.error}`);
else ok(`publish available · ${pub.assumptions?.length} assumptions`);

const get = getWorkingModel('TEST');
if (!get.available || get.needs_rebuild) bad('get should be complete');
else ok('GET shows working model');

if (!get.assumptions.some((a) => a.watch_risk === 'R1' || a.watch_risk === 'nvda-r1-data-center-growth-deceleration-ai-demand-digests')) {
  // default test body uses R1 short form
  const wr = get.assumptions.find((a) => a.watch_risk)?.watch_risk;
  if (wr !== 'R1' && !String(wr || '').includes('r1')) bad(`watch link missing got ${wr}`);
  else ok('WATCH link preserved');
} else ok('WATCH link preserved');

// long pack risk id must not truncate
const longRisk = {
  ...goodBody,
  assumptions: [{
    ...goodBody.assumptions[0],
    watch_risk: 'nvda-r1-data-center-growth-deceleration-ai-demand-digests',
    watch_label: 'R1',
    layer: 'pack_actual',
  }, goodBody.assumptions[1]],
  house_touch: 'Constructive house conditional on DC digestion — model tracks Q2 guide and China-zero baseline.',
};
const pubLong = await refreshWorkingModel('LONG', longRisk);
if (!pubLong.ok) bad(`long risk publish ${pubLong.error}`);
else if (pubLong.assumptions?.[0]?.watch_risk !== 'nvda-r1-data-center-growth-deceleration-ai-demand-digests') {
  bad(`watch truncated: ${pubLong.assumptions?.[0]?.watch_risk}`);
} else ok('long pack risk id preserved');
if (pubLong.house_touch && String(pubLong.house_touch).includes('DC digestion')) ok('house_touch stored');
else if (pubLong.ok) bad('house_touch missing on GET');

// second publish with changed value → auto variance
const pub2 = await refreshWorkingModel('TEST', {
  ...goodBody,
  assumptions: [
    { ...goodBody.assumptions[0], value: '25' },
    goodBody.assumptions[1],
  ],
  bridge: goodBody.bridge,
  variance: [],
});
if (!pub2.ok) bad(`pub2 ${pub2.error}`);
else if (!(pub2.variance || []).some((v) => String(v.line).includes('Revenue') || v.prior === '20')) {
  // auto variance may label by assumption label
  const has = (pub2.variance || []).length > 0;
  if (!has) bad('expected auto variance vs prior');
  else ok('auto variance vs prior');
} else ok('auto variance vs prior');

// incomplete file → EMPTY
const legPath = path.join(tmpVault, 'cockpit', 'model', 'LEG.json');
fs.mkdirSync(path.dirname(legPath), { recursive: true });
fs.writeFileSync(legPath, JSON.stringify({
  schema_version: 1,
  ticker: 'LEG',
  assumptions: [],
  bridge: [],
}));
const leg = getWorkingModel('LEG');
if (leg.available) bad('incomplete should not display as available');
else ok('incomplete → EMPTY rebuild CTA');

// ── Print Card (Phase A): arm · case fill · hard lock ────────────────────────
console.log('\nprint card phase A\n');

if (normalizePrintDate('2026-13-01') || normalizePrintDate('2026-02-31')
  || normalizePrintDate('08/27/2026') || normalizePrintDate('')) {
  bad('bad dates should reject');
} else if (normalizePrintDate('2026-08-27') !== '2026-08-27') {
  bad('valid date should pass');
} else ok('print date strict YYYY-MM-DD (rejects impossible calendar dates)');

const noModelArm = armWorkingModelPrint('NOMODEL', { event: 'FQ2-2027', date: '2026-08-27' });
if (noModelArm.ok) bad('arm without a model should fail');
else ok('arm requires an existing model');

const caseBody = {
  ...goodBody,
  ticker: 'PRINT',
  assumptions: [
    { id: 'q2_guide', label: 'Q2 revenue guide', value: '91.0', unit: '$B', source: 'pack', layer: 'pack_guide', watch_risk: 'nvda-r1-x', watch_label: 'R1' },
    { id: 'q1_rev', label: 'Q1 revenue', value: '81.6', unit: '$B', source: 'pack', layer: 'pack_actual' },
    { id: 'user_dc', label: 'YOUR: DC growth', value: 'GAP', unit: '%', source: 'gap', layer: 'user_case', watch_risk: 'nvda-r1-x', watch_label: 'R1' },
    { id: 'user_gm', label: 'YOUR: GM floor', value: 'GAP', unit: '%', source: 'gap', layer: 'user_case' },
  ],
};
const seeded = await refreshWorkingModel('PRINT', caseBody);
if (!seeded.ok) bad(`seed print model ${seeded.error}`);
else ok('seed model with guide + case lines');

if (armWorkingModelPrint('PRINT', { event: 'FQ2-2027', date: 'Aug 27' }).ok) bad('bad date armed');
else if (armWorkingModelPrint('PRINT', { event: '', date: '2026-08-27' }).ok) bad('empty event armed');
else ok('arm rejects bad date / missing event');

if (armWorkingModelPrint('PRINT', { event: 'buy more FQ2', date: '2026-08-27' }).ok) {
  bad('advice language in event label armed');
} else ok('advice language in event label rejected');

const armed = armWorkingModelPrint('PRINT', { event: 'FQ2-2027', date: '2026-08-27' });
if (!armed.ok || armed.print?.status !== 'armed') bad(`arm ${armed.error}`);
else if (armed.print.event !== 'FQ2-2027' || armed.print.date !== '2026-08-27') bad('arm lost event/date');
else ok('ARM → status armed · event + date on vault');

const earlyLock = lockWorkingModelPrint('PRINT');
if (earlyLock.ok) bad('all-GAP case should not lock');
else ok('lock refused while every case line is GAP');

// low-friction case fill through the existing format gate
const filled = await refreshWorkingModel('PRINT', {
  ...caseBody,
  assumptions: caseBody.assumptions.map((a) => (
    a.id === 'user_dc' ? { ...a, value: '35', source: 'user' } : a
  )),
});
if (!filled.ok) bad(`case fill ${filled.error}`);
else if (filled.print?.status !== 'armed' || filled.print?.event !== 'FQ2-2027') bad('refresh dropped the print block');
else if (filled.computed?.n_case_filled !== 1) bad(`expected 1 filled case, got ${filled.computed?.n_case_filled}`);
else ok('case fill via refresh · print block survives · 1 of 2 filled');

const lockRes = lockWorkingModelPrint('PRINT');
if (!lockRes.ok) bad(`lock ${lockRes.error}`);
else if (lockRes.print?.status !== 'locked') bad('lock did not set status');
else if ((lockRes.print.locked_case || []).length !== 2) bad(`locked_case should snapshot both case rows, got ${lockRes.print.locked_case?.length}`);
else if (!lockRes.print.locked_at) bad('locked_at missing');
else ok('LOCK → status locked · both case rows snapshotted (GAP locks as GAP)');

const histFiles = fs.existsSync(workingModelHistoryDir('PRINT'))
  ? fs.readdirSync(workingModelHistoryDir('PRINT'))
  : [];
if (!histFiles.some((f) => f.includes('lock-FQ2-2027'))) {
  bad(`history lock marker missing · ${histFiles.join(', ')}`);
} else ok('lock wrote a marked history snapshot');

// hard lock: the pre-committed line is immutable
const violate = await refreshWorkingModel('PRINT', {
  ...caseBody,
  assumptions: caseBody.assumptions.map((a) => (
    a.id === 'user_dc' ? { ...a, value: '55', source: 'user' } : a
  )),
});
if (violate.ok) bad('locked case line was editable');
else if (!violate.print_locked) bad('lock rejection missing print_locked flag');
else ok('HARD LOCK · changing a locked case line is rejected');

const afterViolate = getWorkingModel('PRINT');
if (afterViolate.assumptions.find((a) => a.id === 'user_dc')?.value !== '35') {
  bad('vault mutated on rejected lock write');
} else ok('vault unchanged after rejected write (fail closed)');

const dropLine = await refreshWorkingModel('PRINT', {
  ...caseBody,
  assumptions: caseBody.assumptions.filter((a) => a.id !== 'user_dc'),
});
if (dropLine.ok) bad('locked case line could be deleted');
else ok('locked case line cannot be removed');

// non-locked lines stay editable so the post-print refresh still works
const packUpdate = await refreshWorkingModel('PRINT', {
  ...caseBody,
  assumptions: caseBody.assumptions.map((a) => {
    if (a.id === 'user_dc') return { ...a, value: '35', source: 'user' };
    if (a.id === 'q1_rev') return { ...a, value: '95.0' };
    return a;
  }),
});
if (!packUpdate.ok) bad(`pack line update while locked ${packUpdate.error}`);
else if (packUpdate.print?.status !== 'locked') bad('pack update dropped the lock');
else ok('pack lines still update while case is locked');

// refresh must never own the print block
const clobber = await refreshWorkingModel('PRINT', {
  ...caseBody,
  assumptions: caseBody.assumptions.map((a) => (
    a.id === 'user_dc' ? { ...a, value: '35', source: 'user' } : a
  )),
  print: { event: 'FAKE', date: '2026-01-01', status: 'armed' },
});
if (!clobber.ok) bad(`clobber attempt ${clobber.error}`);
else if (clobber.print?.status !== 'locked' || clobber.print?.event !== 'FQ2-2027') {
  bad('refresh unlocked/overwrote the print block');
} else ok('refresh cannot arm, unlock, or overwrite a print block');

if (lockWorkingModelPrint('PRINT').ok) bad('double lock allowed');
else ok('already-locked print cannot re-lock');

// explicit re-arm is the only way out of a lock
const rearm = armWorkingModelPrint('PRINT', { event: 'FQ3-2027', date: '2026-11-19' });
if (!rearm.ok) bad(`re-arm ${rearm.error}`);
else if (rearm.print?.status !== 'armed' || (rearm.print.locked_case || []).length) {
  bad('re-arm left stale lock state');
} else ok('re-arm starts a fresh cycle · prior lock stays in history');

const editable = await refreshWorkingModel('PRINT', {
  ...caseBody,
  assumptions: caseBody.assumptions.map((a) => (
    a.id === 'user_dc' ? { ...a, value: '55', source: 'user' } : a
  )),
});
if (!editable.ok) bad(`post re-arm edit ${editable.error}`);
else ok('case lines editable again after re-arm');

// no house / risk vault write from any print action
const strayWrites = ['house-view-print.md', 'cockpit/proposals']
  .filter((p) => fs.existsSync(path.join(tmpVault, p)));
if (strayWrites.length) bad(`print path wrote outside model vault: ${strayWrites.join(', ')}`);
else ok('no house / risk / proposal writes from arm or lock');

try { fs.rmSync(tmpVault, { recursive: true, force: true }); } catch { /* */ }

console.log(`\nthin-working-model ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
