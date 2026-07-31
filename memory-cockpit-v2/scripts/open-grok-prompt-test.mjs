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

console.log(failed ? `\nFAIL ${failed} check(s)\n` : '\nPASS all open-grok-prompt checks\n');
process.exit(failed ? 1 : 0);
