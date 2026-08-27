// reportSchedule.js — arm next earnings-update on glass open (no cron).
// Dates only from SEC filings already in the pipeline cache. UNKNOWN if none.
// Vault ops: cockpit/research/{TICKER}/schedule.json. Decision-support only.
import fs from 'fs';
import path from 'path';
import { resolveVaultDir } from './monorepoPaths.js';
import { loadPack } from './pack.js';
import { listResearchRuns } from './thinResearchRuns.js';
import { pipelineSnapshot } from './secEdgar.js';

function tickerId(t) {
  return String(t || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
}

export function schedulePath(ticker) {
  const id = tickerId(ticker);
  if (!id) return null;
  return path.join(resolveVaultDir(), 'cockpit', 'research', id, 'schedule.json');
}

export function readSchedule(ticker) {
  const p = schedulePath(ticker);
  const empty = {
    armed: false,
    mode: 'earnings-update',
    ack_print: null,
    updated_at: null,
  };
  if (!p || !fs.existsSync(p)) return empty;
  try {
    const j = JSON.parse(fs.readFileSync(p, 'utf8'));
    return {
      armed: j.armed === true,
      mode: 'earnings-update',
      ack_print: j.ack_print ? String(j.ack_print).slice(0, 10) : null,
      updated_at: j.updated_at || null,
    };
  } catch {
    return empty;
  }
}

export function writeSchedule(ticker, patch = {}) {
  const id = tickerId(ticker);
  const p = schedulePath(id);
  if (!p) return { ok: false, error: 'empty ticker' };
  const prev = readSchedule(id);
  const next = {
    armed: patch.armed != null ? !!patch.armed : prev.armed,
    mode: 'earnings-update',
    ack_print: patch.ack_print !== undefined
      ? (patch.ack_print ? String(patch.ack_print).slice(0, 10) : null)
      : prev.ack_print,
    updated_at: new Date().toISOString(),
    decision_support_only: true,
    note: 'Arm next print — fires on glass open, not a clock. Dates from SEC only.',
  };
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, `${JSON.stringify(next, null, 2)}\n`, 'utf8');
  return { ok: true, ...next };
}

/** 10-Q / 10-K / 20-F or 8-K item 2.02. Never invent a future earnings date. */
export function pickLatestPrint(filings) {
  const rows = Array.isArray(filings) ? filings : [];
  const hits = rows.filter((f) => {
    const form = String(f.form || '').toUpperCase();
    if (/^10-Q/.test(form) || /^10-K/.test(form) || /^20-F/.test(form)) return true;
    if (/^8-K/.test(form) && /2\.02/.test(String(f.items || f.item || ''))) return true;
    return false;
  });
  hits.sort((a, b) => String(b.filed || '').localeCompare(String(a.filed || '')));
  const top = hits[0];
  if (!top || !top.filed) return null;
  return {
    date: String(top.filed).slice(0, 10),
    form: top.form,
    url: top.url || null,
    source: 'SEC EDGAR',
  };
}

export function scheduleDue({ armed, printDate, lastCompleteAt, ackPrint }) {
  if (!armed) return false;
  if (!printDate) return false;
  const print = String(printDate).slice(0, 10);
  if (ackPrint && String(ackPrint).slice(0, 10) === print) return false;
  const last = lastCompleteAt ? String(lastCompleteAt).slice(0, 10) : '';
  if (last && last >= print) return false;
  return true;
}

function lastCompleteEarningsAt(ticker) {
  const listed = listResearchRuns(ticker, { lane: 'reports' });
  const runs = Array.isArray(listed.runs) ? listed.runs : [];
  const done = runs.filter((r) => {
    if (r.status !== 'complete') return false;
    const mode = String(r.thesis_mode || r.thesis?.mode || '').toLowerCase();
    return mode === 'earnings-update' || mode === 'earnings_update';
  });
  const times = done.map((r) => r.finished_at || r.started_at).filter(Boolean).sort();
  return times.length ? times[times.length - 1] : null;
}

/**
 * @param {string} ticker
 * @param {{ desk?: string }} [opts]
 */
export async function getReportSchedule(ticker, opts = {}) {
  const id = tickerId(ticker);
  const sched = readSchedule(id);
  const pack = loadPack(id);
  const pipe = await pipelineSnapshot(id, {
    compiledAt: pack.pack?.compiled_at || null,
  }).catch(() => ({ available: false }));
  const filings = [
    ...((pipe && pipe.since_compile && pipe.since_compile.material_items) || []),
    ...((pipe && pipe.latest_filings) || []),
  ];
  const print = pickLatestPrint(filings);
  const lastCompleteAt = lastCompleteEarningsAt(id);
  const due = scheduleDue({
    armed: sched.armed,
    printDate: print && print.date,
    lastCompleteAt,
    ackPrint: sched.ack_print,
  });
  return {
    available: true,
    desk: opts.desk || null,
    ticker: id,
    armed: sched.armed,
    mode: 'earnings-update',
    print: print || { date: null, form: null, url: null, source: null, label: 'UNKNOWN' },
    print_known: !!print,
    due,
    last_complete_earnings_at: lastCompleteAt,
    ack_print: sched.ack_print,
    updated_at: sched.updated_at,
    decision_support_only: true,
    note: print
      ? 'Armed toggle uses last dated 10-Q/10-K/20-F (or 8-K 2.02). No invented next-print date. No cron.'
      : 'No dated print in EDGAR cache — slide still saves; due stays false until a filing is known.',
  };
}
