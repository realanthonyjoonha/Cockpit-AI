#!/usr/bin/env node
// Unit tests for open-grok prompt mapping (new-desk + isolation).
//   node scripts/open-grok-prompt-test.mjs
import {
  buildInitialPrompt,
  listGrokAgents,
  sanitizeTickerArg,
} from '../server/openGrok.js';

let failed = 0;
function ok(name) {
  console.log('  ✓', name);
}
function fail(name, err) {
  failed += 1;
  console.error('  ✗', name, '—', err?.message || err);
}

console.log('\nopen-grok-prompt (new-desk)\n');

try {
  if (buildInitialPrompt({ action: 'new-desk' }) !== '/cockpit-new-desk') {
    throw new Error(buildInitialPrompt({ action: 'new-desk' }));
  }
  ok('new-desk → /cockpit-new-desk');
} catch (e) {
  fail('new-desk bare', e);
}

try {
  const p = buildInitialPrompt({ action: 'new-desk', ticker: 'avgo' });
  if (p !== '/cockpit-new-desk AVGO') throw new Error(p);
  ok('new-desk + ticker → /cockpit-new-desk AVGO');
} catch (e) {
  fail('new-desk ticker', e);
}

try {
  const p = buildInitialPrompt({ action: 'new-desk', ticker: '  msft!! ' });
  if (p !== '/cockpit-new-desk MSFT') throw new Error(p);
  ok('ticker sanitize strips junk');
} catch (e) {
  fail('ticker sanitize', e);
}

try {
  if (sanitizeTickerArg('') !== '') throw new Error('expected empty');
  if (sanitizeTickerArg('bad ticker!!!') !== 'BADTICKER') throw new Error(sanitizeTickerArg('bad ticker!!!'));
  ok('sanitizeTickerArg helpers');
} catch (e) {
  fail('sanitizeTickerArg', e);
}

try {
  const desk = listGrokAgents({ variant: 'desk' });
  if (desk.agents.some((a) => a.action === 'new-desk')) {
    throw new Error('new-desk leaked into desk variant');
  }
  ok('desk variant excludes new-desk');
} catch (e) {
  fail('desk isolation', e);
}

try {
  const start = listGrokAgents({ variant: 'start' });
  if (!start.agents.some((a) => a.action === 'new-desk')) {
    throw new Error('missing new-desk on start');
  }
  if (start.default_action !== 'new-desk') {
    throw new Error(`default_action=${start.default_action}`);
  }
  ok('start variant defaults to new-desk');
} catch (e) {
  fail('start catalog', e);
}

try {
  const p = buildInitialPrompt({ action: 'daily', desk: 'avgo' });
  if (p !== '/cockpit-daily avgo') throw new Error(p);
  ok('daily still works (regression)');
} catch (e) {
  fail('daily regression', e);
}

try {
  const p = buildInitialPrompt({ action: 'research', desk: 'tsm' });
  if (p !== '/cockpit-research tsm') throw new Error(p);
  ok('research + desk → /cockpit-research tsm');
} catch (e) {
  fail('research prompt', e);
}

try {
  const desk = listGrokAgents({ variant: 'desk' });
  if (!desk.agents.some((a) => a.action === 'research')) {
    throw new Error('research missing from desk variant');
  }
  if (desk.default_action !== 'daily') {
    throw new Error(`desk default should stay daily, got ${desk.default_action}`);
  }
  ok('desk variant includes research; default still daily');
} catch (e) {
  fail('desk research catalog', e);
}

try {
  const start = listGrokAgents({ variant: 'start' });
  if (start.agents.some((a) => a.action === 'research')) {
    throw new Error('research leaked into start variant');
  }
  ok('start variant excludes research');
} catch (e) {
  fail('start isolation research', e);
}

try {
  const p = buildInitialPrompt({ action: 'coverage', desk: 'tsm' });
  if (p !== '/cockpit-coverage tsm') throw new Error(p);
  ok('coverage + desk → /cockpit-coverage tsm');
} catch (e) {
  fail('coverage prompt', e);
}

try {
  const desk = listGrokAgents({ variant: 'desk' });
  if (!desk.agents.some((a) => a.action === 'coverage')) {
    throw new Error('coverage missing from desk variant');
  }
  if (desk.default_action !== 'daily') {
    throw new Error(`desk default should stay daily, got ${desk.default_action}`);
  }
  ok('desk variant includes coverage; default still daily');
} catch (e) {
  fail('desk coverage catalog', e);
}

try {
  const start = listGrokAgents({ variant: 'start' });
  if (start.agents.some((a) => a.action === 'coverage')) {
    throw new Error('coverage leaked into start variant');
  }
  ok('start variant excludes coverage');
} catch (e) {
  fail('start isolation coverage', e);
}

const phase1 = [
  ['comps', '/cockpit-comps tsm'],
  ['model-bridge', '/cockpit-model-bridge tsm'],
  ['model-audit', '/cockpit-model-audit tsm'],
  ['ebitda-bridge', '/cockpit-ebitda-bridge tsm'],
  ['ebitda-quality', '/cockpit-ebitda-quality tsm'],
];
// street / model-desk prompts tested separately (include mode suffix)
const financeActions = ['comps', 'model-bridge', 'model-audit', 'ebitda-bridge', 'ebitda-quality', 'street', 'model-desk'];
for (const [action, expect] of phase1) {
  try {
    const p = buildInitialPrompt({ action, desk: 'tsm' });
    if (p !== expect) throw new Error(p);
    ok(`${action} → ${expect}`);
  } catch (e) {
    fail(`${action} prompt`, e);
  }
}

try {
  const p = buildInitialPrompt({ action: 'model-desk', desk: 'nvda', mode: 'pipeline' });
  if (p !== '/cockpit-model nvda pipeline') throw new Error(p);
  ok('model-desk pipeline → /cockpit-model nvda pipeline');
} catch (e) {
  fail('model-desk pipeline prompt', e);
}

try {
  const p = buildInitialPrompt({
    action: 'research-compile',
    desk: 'nvda',
    mode: 'pipeline',
    run_id: '20260808T120000Z_deep_compile_NVDA',
  });
  if (p !== '/cockpit-research-compile nvda pipeline 20260808T120000Z_deep_compile_NVDA') {
    throw new Error(p);
  }
  ok('research-compile pipeline + run_id');
} catch (e) {
  fail('research-compile prompt', e);
}

try {
  const p = buildInitialPrompt({
    action: 'thesis-report',
    desk: 'lly',
    thesis_mode: 'earnings-update',
  });
  if (p !== '/cockpit-report lly earnings-update all stop') throw new Error(p);
  ok('thesis-report → /cockpit-report desk mode all stop');
} catch (e) {
  fail('thesis-report prompt', e);
}

try {
  const p = buildInitialPrompt({ action: 'thesis-report', desk: 'nvda' });
  if (p !== '/cockpit-report nvda earnings-update all stop') throw new Error(p);
  ok('thesis-report default mode earnings-update all stop');
} catch (e) {
  fail('thesis-report default mode', e);
}

try {
  const p = buildInitialPrompt({
    action: 'thesis-report', desk: 'lly', thesis_mode: 'deep-dive',
    register_scope: 'pick', register_ids: ['R1', 'R9'],
  });
  if (p !== '/cockpit-report lly deep-dive pick R1,R9 stop') throw new Error(p);
  ok('thesis-report pick ids in prompt');
} catch (e) {
  fail('thesis-report pick prompt', e);
}

try {
  const p = buildInitialPrompt({
    action: 'thesis-report', desk: 'lly', thesis_mode: 'deep-dive',
    register_scope: 'pick',
    register_ids: ['lly-r1-tirzepatide-cash-engine-concentration-outgoing-mounjaro-zepbound', 'lly-r9-orforglipron'],
  });
  if (p !== '/cockpit-report lly deep-dive pick R1,R9 stop') throw new Error(p);
  ok('thesis-report pick pack slugs compress to Rn');
} catch (e) {
  fail('thesis-report pick slug prompt', e);
}

try {
  const p = buildInitialPrompt({
    action: 'thesis-report', desk: 'lly', thesis_mode: 'initiation',
    register_scope: 'house-only',
  });
  if (p !== '/cockpit-report lly initiation skim stop') throw new Error(p);
  ok('thesis-report house-only → skim');
} catch (e) {
  fail('thesis-report skim prompt', e);
}

try {
  const p = buildInitialPrompt({
    action: 'thesis-report', desk: 'lly', thesis_mode: 'deep-dive',
    thesis_pace: 'through',
  });
  if (p !== '/cockpit-report lly deep-dive all through') throw new Error(p);
  ok('thesis-report through pace in prompt');
} catch (e) {
  fail('thesis-report through prompt', e);
}

try {
  const desk = listGrokAgents({ variant: 'desk' });
  if (desk.agents.some((a) => a.action === 'research-compile')) {
    throw new Error('research-compile still in desk catalog');
  }
  if (!desk.agents.some((a) => a.action === 'thesis-report')) {
    throw new Error('thesis-report missing from desk variant');
  }
  ok('desk variant omits research-compile; keeps thesis-report');
} catch (e) {
  fail('desk research-compile catalog', e);
}

try {
  const p = buildInitialPrompt({ action: 'model-desk', desk: 'nvda', mode: 'chat' });
  if (p !== '/cockpit-model nvda chat') throw new Error(p);
  ok('model-desk chat → /cockpit-model nvda chat');
} catch (e) {
  fail('model-desk chat prompt', e);
}

try {
  const p = buildInitialPrompt({ action: 'model-read', desk: 'nvda', run_id: '20260827T000000Z_model_read_NVDA' });
  if (p !== '/cockpit-model-read nvda 20260827T000000Z_model_read_NVDA') throw new Error(p);
  ok('model-read → /cockpit-model-read desk run_id');
} catch (e) {
  fail('model-read prompt', e);
}

try {
  const desk = listGrokAgents({ variant: 'desk' });
  if (!desk.agents.some((a) => a.action === 'model-read')) {
    throw new Error('model-read missing from desk variant');
  }
  ok('desk variant includes model-read');
} catch (e) {
  fail('desk model-read catalog', e);
}

try {
  const desk = listGrokAgents({ variant: 'desk' });
  if (!desk.agents.some((a) => a.action === 'model-desk')) {
    throw new Error('model-desk missing from desk variant');
  }
  ok('desk variant includes model-desk');
} catch (e) {
  fail('desk model-desk catalog', e);
}

try {
  const p = buildInitialPrompt({ action: 'street', desk: 'tsm', mode: 'pipeline' });
  if (p !== '/cockpit-street tsm pipeline') throw new Error(p);
  ok('street pipeline → /cockpit-street tsm pipeline');
} catch (e) { fail('street pipeline prompt', e); }

try {
  const p = buildInitialPrompt({ action: 'street', desk: 'tsm', mode: 'chat' });
  if (p !== '/cockpit-street tsm chat') throw new Error(p);
  ok('street chat → /cockpit-street tsm chat');
} catch (e) { fail('street chat prompt', e); }

try {
  const p = buildInitialPrompt({ action: 'street', desk: 'tsm' });
  if (p !== '/cockpit-street tsm chat') throw new Error(p);
  ok('street default → chat');
} catch (e) { fail('street default prompt', e); }

try {
  const p = buildInitialPrompt({ action: 'street-build', desk: 'tsm' });
  if (p !== '/cockpit-street tsm pipeline') throw new Error(p);
  ok('street-build legacy → pipeline');
} catch (e) { fail('street-build prompt', e); }

try {
  const p = buildInitialPrompt({ action: 'street-refresh', desk: 'tsm' });
  if (p !== '/cockpit-street tsm pipeline') throw new Error(p);
  ok('street-refresh legacy → pipeline');
} catch (e) { fail('street-refresh prompt', e); }

try {
  const desk = listGrokAgents({ variant: 'desk' });
  for (const a of financeActions) {
    if (!desk.agents.some((x) => x.action === a)) throw new Error(`missing ${a}`);
  }
  if (desk.default_action !== 'daily') throw new Error(`default ${desk.default_action}`);
  ok('desk variant includes finance agents (comps/model/ebitda); default daily');
} catch (e) {
  fail('desk phase1 catalog', e);
}

try {
  const start = listGrokAgents({ variant: 'start' });
  for (const a of financeActions) {
    if (start.agents.some((x) => x.action === a)) throw new Error(`${a} on start`);
  }
  ok('start excludes phase1 finance agents');
} catch (e) {
  fail('start isolation phase1', e);
}

// UX bands (2026-08-01 menu clarity): Operate → Notes → Models → Book ops
try {
  const desk = listGrokAgents({ variant: 'desk' });
  const acts = desk.agents.map((a) => a.action);
  if (desk.default_action !== 'daily') throw new Error(`default ${desk.default_action}`);
  if (acts[0] !== 'daily') throw new Error(`first should be daily, got ${acts[0]}`);

  const idx = (a) => {
    const i = acts.indexOf(a);
    if (i < 0) throw new Error(`missing ${a}`);
    return i;
  };
  if (!(idx('daily') < idx('daily-save'))) throw new Error('daily before daily-save');
  if (!(idx('daily-save') < idx('research'))) throw new Error('operate before notes');
  if (!(idx('research') < idx('coverage'))) throw new Error('research before coverage');
  if (!(idx('coverage') < idx('comps'))) throw new Error('notes before models');
  if (!(idx('comps') < idx('ebitda-bridge'))) throw new Error('comps before ebitda-bridge');
  if (!(idx('ebitda-bridge') < idx('model-bridge'))) throw new Error('ebitda-bridge before model-bridge');
  if (!(idx('model-bridge') < idx('ebitda-quality'))) throw new Error('model-bridge before ebitda-quality');
  if (!(idx('ebitda-quality') < idx('model-audit'))) throw new Error('ebitda-quality before model-audit');
  if (!(idx('model-audit') < idx('risk-check'))) throw new Error('models before book ops');
  if (!(idx('pending') < idx('desks'))) throw new Error('book ops before meta');

  for (const a of ['research', 'coverage', 'comps', 'model-bridge', 'model-audit', 'ebitda-bridge', 'ebitda-quality']) {
    if (!acts.includes(a)) throw new Error(`missing finance/note ${a}`);
  }
  const cov = desk.agents.find((a) => a.action === 'coverage');
  if (cov?.label !== 'Coverage note') throw new Error(`coverage label ${cov?.label}`);
  ok('desk UX band order + coverage label + all finance present');
} catch (e) {
  fail('desk UX band order', e);
}

try {
  const house = listGrokAgents({ variant: 'house' });
  if (house.default_action !== 'propose') throw new Error(`house default ${house.default_action}`);
  ok('house default still propose');
} catch (e) {
  fail('house default', e);
}

console.log(failed ? `\nFAIL ${failed} check(s)\n` : '\nPASS all open-grok-prompt checks\n');
process.exit(failed ? 1 : 0);
