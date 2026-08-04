#!/usr/bin/env node
import fs from 'fs';
import {
  writeStreetAgentSeed,
  normalizeStreetOpenMode,
} from '../server/streetAgentSeed.js';

let failed = 0;
function ok(n) { console.log('  ✓', n); }
function fail(n, e) { failed += 1; console.error('  ✗', n, '—', e?.message || e); }

console.log('\nstreet-seed-mode\n');

try {
  if (normalizeStreetOpenMode('pipeline') !== 'pipeline') throw new Error('pipeline');
  if (normalizeStreetOpenMode('refresh') !== 'pipeline') throw new Error('refresh→pipeline');
  if (normalizeStreetOpenMode('chat') !== 'chat') throw new Error('chat');
  if (normalizeStreetOpenMode(undefined) !== 'chat') throw new Error('default chat');
  ok('normalizeStreetOpenMode');
} catch (e) { fail('normalize', e); }

try {
  const p = writeStreetAgentSeed('nvda', { mode: 'pipeline' });
  if (!p.ok) throw new Error(p.error);
  if (p.mode !== 'pipeline') throw new Error(`mode=${p.mode}`);
  const t = fs.readFileSync(p.path, 'utf8');
  if (!t.includes('## Open mode: PIPELINE')) throw new Error('missing PIPELINE header');
  if (!t.includes('do **not** ask what the user wants first')) throw new Error('missing pipeline directive');
  if (!t.includes('Ontology boundary') && !t.includes('read context only')) throw new Error('missing ontology boundary');
  // agent discovers seed under /tmp on macOS (not only $TMPDIR)
  if (process.platform !== 'win32') {
    if (!fs.existsSync('/tmp/cockpit-street-nvda-seed.md')) {
      throw new Error('missing /tmp/cockpit-street-nvda-seed.md');
    }
  }
  ok('pipeline seed has PIPELINE job + ontology boundary + /tmp write');
} catch (e) { fail('pipeline seed', e); }

try {
  const p = writeStreetAgentSeed('nvda', { mode: 'chat' });
  if (!p.ok) throw new Error(p.error);
  if (p.mode !== 'chat') throw new Error(`mode=${p.mode}`);
  const t = fs.readFileSync(p.path, 'utf8');
  if (!t.includes('## Open mode: CHAT')) throw new Error('missing CHAT header');
  if (!t.includes('Free-form Street agent')) throw new Error('missing chat directive');
  ok('chat seed has CHAT job');
} catch (e) { fail('chat seed', e); }

if (failed) {
  console.error(`\nFAIL ${failed}`);
  process.exit(1);
}
console.log('\nstreet-seed-mode PASS\n');
