#!/usr/bin/env node
// Unit tests for post-ACCEPT vault readback assert (no vault mutation).
//   node scripts/accept-write-assert-test.mjs
import {
  assertVaultWriteMatches,
  contentSha256,
  normalizeNewlines,
} from '../server/writeAssert.js';

let failed = 0;
function ok(name) {
  console.log('  ✓', name);
}
function fail(name, err) {
  failed += 1;
  console.error('  ✗', name, '—', err?.message || err);
}

console.log('\naccept-write-assert (writeAssert.js)\n');

// match
try {
  const body = 'hello\nworld\n';
  const v = assertVaultWriteMatches({
    expected: body,
    actual: body,
    path: '/tmp/x.md',
    kind: 'house',
  });
  if (!v.ok || !v.sha256 || v.bytes !== Buffer.byteLength(body, 'utf8')) {
    throw new Error('bad verify payload');
  }
  if (v.sha256 !== contentSha256(body)) throw new Error('sha mismatch internal');
  ok('exact match returns verified payload');
} catch (e) {
  fail('exact match', e);
}

// CRLF normalize
try {
  const v = assertVaultWriteMatches({
    expected: 'a\r\nb\r\n',
    actual: 'a\nb\n',
    path: '/tmp/y.md',
    kind: 'house',
  });
  if (!v.ok) throw new Error('expected ok');
  ok('CRLF vs LF treated as equal');
} catch (e) {
  fail('CRLF normalize', e);
}

// mismatch throws, pending semantics in message
try {
  assertVaultWriteMatches({
    expected: 'intended\n',
    actual: 'clobbered\n',
    path: '/tmp/z.md',
    kind: 'house',
  });
  fail('mismatch should throw', new Error('did not throw'));
} catch (e) {
  if (!/left pending/i.test(e.message) || !/expected_sha/i.test(e.message)) {
    fail('mismatch message shape', e);
  } else {
    ok('mismatch throws fail-closed message');
  }
}

// missing actual
try {
  assertVaultWriteMatches({
    expected: 'x',
    actual: null,
    path: '/tmp/m.md',
    kind: 'risks_source',
  });
  fail('missing actual should throw', new Error('did not throw'));
} catch (e) {
  if (!/missing or unreadable/i.test(e.message)) fail('missing message', e);
  else ok('null actual throws');
}

// empty expected
try {
  assertVaultWriteMatches({ expected: '  ', actual: '  ', kind: 'house' });
  fail('empty expected should throw', new Error('did not throw'));
} catch (e) {
  if (!/expected body empty/i.test(e.message)) fail('empty message', e);
  else ok('empty expected throws');
}

// normalize helper
if (normalizeNewlines('a\r\nb') !== 'a\nb') {
  fail('normalizeNewlines', new Error('bad'));
} else {
  ok('normalizeNewlines helper');
}

console.log(failed ? `\nFAIL ${failed} check(s)\n` : '\nPASS all accept-write-assert checks\n');
process.exit(failed ? 1 : 0);
