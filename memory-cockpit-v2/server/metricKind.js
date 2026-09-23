/**
 * Key metrics kinds. Live 08 bytes may omit Kind — default risk.
 * Decision-support only. Does not write the vault.
 */

export const METRIC_KINDS = ['print', 'condition', 'risk', 'catalyst'];

export function parseMetricKind(md, fallback = 'risk') {
  const t = String(md || '');
  const m = t.match(/\*\*Kind:\*\*\s*(print|condition|risk|catalyst)\b/i)
    || t.match(/^kind:\s*(print|condition|risk|catalyst)\b/im);
  if (m) return m[1].toLowerCase();
  const fb = String(fallback || 'risk').toLowerCase();
  return METRIC_KINDS.includes(fb) ? fb : 'risk';
}

/** FIRED is for kind=risk. Other kinds show OFF-PLAN when status is FIRED. */
export function breakLabel(kind, status) {
  const st = String(status || '').toUpperCase();
  if (st === 'FIRED' && parseMetricKind('', kind) !== 'risk' && kind !== 'risk') {
    return 'OFF-PLAN';
  }
  if (st === 'FIRED' && kind && kind !== 'risk') return 'OFF-PLAN';
  return st || '—';
}

export function metricPageLabel() {
  return 'KEY METRICS';
}
