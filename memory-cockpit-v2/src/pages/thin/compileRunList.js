// Compile room list filter — display only. Does not delete run folders.
// Default: in-flight + N newest complete. Decision-support only.

export const RECENT_COMPLETE_N = 3;

/**
 * @param {Array<{ run_id: string, status?: string }>} runs newest-first
 * @param {{ showAll?: boolean, selectedId?: string|null }} [opts]
 */
export function visibleCompileRuns(runs, opts = {}) {
  const list = Array.isArray(runs) ? runs : [];
  if (opts.showAll) return list;
  const selectedId = opts.selectedId || null;
  const keep = new Set();
  for (const r of list) {
    if (!r || !r.run_id) continue;
    const st = String(r.status || '');
    if (st === 'queued' || st === 'running') keep.add(r.run_id);
    if (selectedId && r.run_id === selectedId) keep.add(r.run_id);
  }
  let n = 0;
  for (const r of list) {
    if (!r || !r.run_id) continue;
    if (String(r.status || '') !== 'complete') continue;
    keep.add(r.run_id);
    n += 1;
    if (n >= RECENT_COMPLETE_N) break;
  }
  return list.filter((r) => keep.has(r.run_id));
}
