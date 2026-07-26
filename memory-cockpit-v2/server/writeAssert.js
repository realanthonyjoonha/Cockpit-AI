// writeAssert.js — fail-closed readback after allowlisted vault writes (ACCEPT path).
// Decision-support only. Never invent content; only compare intended vs disk.
import crypto from 'crypto';

/** Normalize for equality (CRLF vs LF must not false-fail). */
export function normalizeNewlines(s) {
  return String(s ?? '').replace(/\r\n/g, '\n');
}

export function contentSha256(s) {
  return crypto.createHash('sha256').update(normalizeNewlines(s), 'utf8').digest('hex');
}

/**
 * Fail-closed: vault readback must match intended write body.
 * Call AFTER write, BEFORE marking proposal accepted.
 *
 * @param {{ expected: string, actual: string|null|undefined, path?: string, kind?: string }} opts
 * @returns {{ ok: true, path: string|null, kind: string, bytes: number, sha256: string }}
 * @throws {Error} if missing or mismatched
 */
export function assertVaultWriteMatches(opts = {}) {
  const kind = opts.kind || 'vault';
  const pathLabel = opts.path || '?';
  const expected = opts.expected;
  const actual = opts.actual;

  if (typeof expected !== 'string' || !expected.trim()) {
    throw new Error(
      `ACCEPT write verify failed (${kind}): expected body empty — path=${pathLabel}. ` +
        'Proposal left pending (not accepted).',
    );
  }
  if (actual == null || typeof actual !== 'string') {
    throw new Error(
      `ACCEPT write verify failed (${kind}): file missing or unreadable after write — path=${pathLabel}. ` +
        'Proposal left pending (not accepted). Re-ACCEPT or investigate.',
    );
  }

  const exp = normalizeNewlines(expected);
  const act = normalizeNewlines(actual);
  if (exp === act) {
    return {
      ok: true,
      path: opts.path || null,
      kind,
      bytes: Buffer.byteLength(act, 'utf8'),
      sha256: contentSha256(act),
    };
  }

  const expSha = contentSha256(exp);
  const actSha = contentSha256(act);
  throw new Error(
    `ACCEPT write verify failed (${kind}): path=${pathLabel} ` +
      `expected_bytes=${Buffer.byteLength(exp, 'utf8')} actual_bytes=${Buffer.byteLength(act, 'utf8')} ` +
      `expected_sha=${expSha.slice(0, 12)} actual_sha=${actSha.slice(0, 12)}. ` +
      'Vault readback ≠ proposal body. Proposal left pending (not accepted). ' +
      'Re-ACCEPT or investigate clobber/race.',
  );
}
