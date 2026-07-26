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

console.log(failed ? `\nFAIL ${failed} check(s)\n` : '\nPASS all open-grok-prompt checks\n');
process.exit(failed ? 1 : 0);
