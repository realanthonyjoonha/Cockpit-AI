/**
 * Grok house/register wait-state: GO | SAVE DRAFT | EDIT.
 * Only GO may commit. EDIT never proposes or writes. Decision-support only.
 */

export const DUMP_PROMPT =
  '**GO** (writes CONFIRMED) · **SAVE DRAFT** (Grok only, no glass chip) · **EDIT** (change it here, no write)';

export const REGISTER_DUMP_PROMPT =
  '**GO** (writes register) · **SAVE DRAFT** (Grok only, no glass chip) · **EDIT** (change it here, no write)';

const GO_RE = /^(go|looks good|that['’]?s my house|confirm|accept register)\b/i;
const SAVE_RE = /^save[\s_-]*draft\b/i;
const STOP_RE = /^stop\b/i;
const EDIT_RE = /^(edit|change|fix|rewrite|revise|tweak|update the|drop r\d+|add r\d+|tighten|not yet|not my house|not ready)\b/i;

/**
 * @param {string} s
 * @returns {'go'|'save_draft'|'edit'|'stop'|'unknown'}
 */
export function classifyHouseUtterance(s) {
  const t = String(s || '').trim();
  if (!t) return 'unknown';
  if (STOP_RE.test(t)) return 'stop';
  if (SAVE_RE.test(t)) return 'save_draft';
  if (EDIT_RE.test(t)) return 'edit';
  if (GO_RE.test(t)) return 'go';
  return 'unknown';
}

export function isGoUtterance(s) {
  return classifyHouseUtterance(s) === 'go';
}

export function isSaveDraftUtterance(s) {
  return classifyHouseUtterance(s) === 'save_draft';
}

export function isEditUtterance(s) {
  return classifyHouseUtterance(s) === 'edit';
}

export function mayCommit(s) {
  return classifyHouseUtterance(s) === 'go';
}

export function mayProposeIntent(intent) {
  const i = String(intent || '').toLowerCase().replace(/-/g, '_');
  return i === 'go' || i === 'confirmed';
}

export function assertGoUtterance(s) {
  const t = String(s || '').trim();
  if (!t) throw new Error('utterance required — pass the user GO line verbatim');
  const kind = classifyHouseUtterance(t);
  if (kind === 'save_draft') {
    throw new Error('SAVE DRAFT does not write or propose — stay in Grok; no FORMING glass chip');
  }
  if (kind === 'edit') {
    throw new Error('EDIT does not write — dump the full file again; no commit_on_go');
  }
  if (kind === 'stop') {
    throw new Error('STOP does not write');
  }
  if (kind !== 'go') {
    throw new Error('utterance is not GO (GO / looks good / that’s my house / CONFIRM / ACCEPT REGISTER). EDIT and SAVE DRAFT must not call commit_on_go.');
  }
  return t;
}
