// Shared thin Model desk — pack facts + user case + variance + WATCH links.
// Chrome: UPDATE MODEL (pipeline + vault poll) · OPEN GROK (chat)
// Decision-support only. Not PT / not house write / not Street.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiPost } from '../../api.js';

const POLL_MS = 2500;
const POLL_MAX_MS = 10 * 60 * 1000;

const LAYER_META = {
  pack_actual: { title: 'PACK · REPORTED', hint: 'Graded pack claims (actuals)', no: '1a' },
  pack_guide: { title: 'PACK · GUIDE / OUTLOOK', hint: 'Company outlook in pack', no: '1b' },
  user_case: { title: 'YOUR CASE', hint: 'Forward drivers you own — fill on Print Card', no: '1c' },
  structural: { title: 'STRUCTURAL', hint: 'Mix / concentration / supply', no: '1d' },
  mixed: { title: 'DERIVED', hint: 'From pack math — verify', no: '1e' },
};

function modelFingerprint(payload) {
  if (!payload || typeof payload !== 'object') return 'null';
  const a = Array.isArray(payload.assumptions) ? payload.assumptions : [];
  const b = Array.isArray(payload.bridge) ? payload.bridge : [];
  const aSig = a.map((x) => `${x.id}|${x.value}|${x.watch_risk || ''}|${x.layer || ''}`).join(';');
  const bSig = b.map((x) => `${x.id}|${x.value}`).join(';');
  return [
    payload.available ? '1' : '0',
    payload.built_at || '',
    payload.house_touch || '',
    a.length,
    b.length,
    aSig,
    bSig,
  ].join('::');
}

function layerOf(a) {
  return a.layer || (a.source === 'user' || a.source === 'paste' || a.source === 'gap' ? 'user_case' : 'pack_actual');
}

function isFilledCase(a) {
  const v = a?.value == null ? '' : String(a.value).trim();
  return !!v && !/^gap$/i.test(v);
}

/** Pair guide against case by the WATCH link they already share — no invented join. */
function buildPrintRows(assumptions) {
  const order = [];
  const groups = new Map();
  const touch = (a) => {
    const key = a.watch_risk || '__none';
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        watch_risk: a.watch_risk || null,
        watch_label: a.watch_label || null,
        guide: [],
        cases: [],
      });
      order.push(key);
    }
    const g = groups.get(key);
    if (!g.watch_label && a.watch_label) g.watch_label = a.watch_label;
    return g;
  };
  for (const a of assumptions) {
    if (layerOf(a) === 'pack_guide') touch(a).guide.push(a);
  }
  for (const a of assumptions) {
    if (layerOf(a) === 'user_case') touch(a).cases.push(a);
  }
  return order.map((k) => groups.get(k)).filter((g) => g.guide.length || g.cases.length);
}

function AssumptionTable({ rows, slug }) {
  if (!rows.length) return null;
  return (
    <div style={{ overflowX: 'auto', padding: '0 0 8px' }}>
      <table className="data" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
        <thead>
          <tr style={{ textAlign: 'left', color: 'var(--dim)', fontSize: 10 }}>
            <th style={{ padding: '6px 12px' }}>Driver</th>
            <th style={{ padding: '6px 12px' }}>Value</th>
            <th style={{ padding: '6px 12px' }}>Src</th>
            <th style={{ padding: '6px 12px' }}>Risk</th>
            <th style={{ padding: '6px 12px' }}>Note</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((a) => (
            <tr key={a.id || a.label} style={{ borderTop: '1px solid var(--line, #333)' }}>
              <td style={{ padding: '8px 12px' }}><b>{a.label}</b></td>
              <td style={{ padding: '8px 12px' }} className="mono">
                {a.value != null ? a.value : '—'}
                {a.unit ? ` ${a.unit}` : ''}
              </td>
              <td style={{ padding: '8px 12px' }} className="dim">{a.source || '—'}</td>
              <td style={{ padding: '8px 12px' }}>
                {a.watch_risk ? (
                  <span
                    className="mono"
                    style={{ cursor: 'pointer', color: 'var(--sec-2)', fontWeight: 700 }}
                    title={(a.watch_note || a.watch_risk) + ' · open risk'}
                    onClick={() => {
                      window.location.hash = `#/${slug}/risk/${encodeURIComponent(a.watch_risk)}`;
                    }}
                  >
                    {a.watch_label || a.watch_risk}
                  </span>
                ) : (
                  <span className="dim">—</span>
                )}
              </td>
              <td style={{ padding: '8px 12px', fontSize: 11, maxWidth: 320 }} className="dim">
                {[a.watch_note, a.note].filter(Boolean).join(' · ') || '—'}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinModel({ desk }) {
  const { slug, ticker, label } = desk;
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [flash, setFlash] = useState(null);
  const [armOpen, setArmOpen] = useState(false);
  const [armEvent, setArmEvent] = useState('');
  const [armDate, setArmDate] = useState('');
  const [caseDraft, setCaseDraft] = useState({});
  const [savingCase, setSavingCase] = useState(null);
  const [printBusy, setPrintBusy] = useState(false);
  const [reads, setReads] = useState({ runs: [], latest: null });
  const [readBusy, setReadBusy] = useState(false);
  const pollRef = useRef(null);
  const readPollRef = useRef(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current.interval);
      if (pollRef.current.timeout) clearTimeout(pollRef.current.timeout);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const stopReadPoll = useCallback(() => {
    if (readPollRef.current) {
      clearInterval(readPollRef.current.interval);
      if (readPollRef.current.timeout) clearTimeout(readPollRef.current.timeout);
      readPollRef.current = null;
    }
  }, []);

  const loadReads = useCallback(() => {
    return api(`${slug}/research?lane=model`)
      .then((payload) => {
        const runs = Array.isArray(payload?.runs) ? payload.runs : [];
        setReads({ runs, latest: runs[0] || null });
        return payload;
      })
      .catch(() => {
        setReads({ runs: [], latest: null });
        return null;
      });
  }, [slug]);

  const load = useCallback(() => {
    return api(`${slug}/model`)
      .then((payload) => {
        setD(payload);
        return payload;
      })
      .catch(() => {
        const fail = { available: false, reason: 'request failed', needs_rebuild: true };
        setD(fail);
        return fail;
      });
  }, [slug]);

  useEffect(() => {
    load();
    loadReads();
    return () => {
      stopPoll();
      stopReadPoll();
    };
  }, [load, loadReads, stopPoll, stopReadPoll]);

  useEffect(() => {
    stopPoll();
    setFlash(null);
    setArmOpen(false);
    setArmEvent('');
    setArmDate('');
    setCaseDraft({});
    stopReadPoll();
    setReads({ runs: [], latest: null });
  }, [slug, stopPoll, stopReadPoll]);

  const armPrint = async () => {
    const event = armEvent.trim();
    const date = armDate.trim();
    if (!event || !date) {
      setFlash('Event label and date both required');
      return;
    }
    setPrintBusy(true);
    try {
      const out = await apiPost(`${slug}/model/print/arm`, { event, date });
      if (!out?.ok) {
        setFlash(out?.error || 'arm failed');
        return;
      }
      setD(out);
      setArmOpen(false);
      setArmEvent('');
      setArmDate('');
      setFlash(`Print armed · ${event} · ${date}`);
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setPrintBusy(false);
    }
  };

  const lockPrint = async () => {
    const caseRows = (d?.assumptions || []).filter((a) => layerOf(a) === 'user_case');
    const gapCount = caseRows.filter((a) => !isFilledCase(a)).length;
    const ev = d?.print?.event || 'this print';
    const warn = gapCount
      ? `\n\n${gapCount} of ${caseRows.length} case lines are still GAP — they lock as GAP and cannot be filled for ${ev}.`
      : '';
    if (!window.confirm(`HARD LOCK your case for ${ev}?\n\nLocked lines become read-only until you arm a new print. This is what you will be scored against.${warn}`)) {
      return;
    }
    setPrintBusy(true);
    try {
      const out = await apiPost(`${slug}/model/print/lock`, {});
      if (!out?.ok) {
        setFlash(out?.error || 'lock failed');
        return;
      }
      setD(out);
      setCaseDraft({});
      setFlash(`Case LOCKED · ${out.print?.event || ev} · ${out.print?.locked_case?.length || 0} lines`);
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setPrintBusy(false);
    }
  };

  const saveCase = async (row, raw) => {
    const next = String(raw ?? '').trim();
    const current = isFilledCase(row) ? String(row.value) : '';
    if (next === current) return;
    setSavingCase(row.id);
    try {
      const assumptions = (d.assumptions || []).map((a) => (
        a.id === row.id
          ? { ...a, value: next || 'GAP', source: next ? 'user' : 'gap' }
          : a
      ));
      const out = await apiPost(`${slug}/model/refresh`, {
        schema_version: d.schema_version || 1,
        ticker: d.ticker || ticker,
        as_of: d.as_of || undefined,
        frame: d.frame || undefined,
        house_touch: d.house_touch || undefined,
        assumptions,
        bridge: d.bridge || [],
        variance: d.variance || [],
        gaps: d.gaps || [],
        disclaimer: d.disclaimer || undefined,
      });
      if (!out?.ok) {
        setFlash(out?.error || 'case save failed');
        return;
      }
      setD(out);
      setCaseDraft((prev) => {
        const copy = { ...prev };
        delete copy[row.id];
        return copy;
      });
      setFlash(`Saved · ${row.label} = ${next || 'GAP'}`);
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setSavingCase(null);
    }
  };

  const startVaultPoll = useCallback((baselineFp) => {
    stopPoll();
    setPolling(true);
    setFlash('Researching… agent opened · waiting for vault publish');

    const tick = async () => {
      try {
        const payload = await api(`${slug}/model`);
        const fp = modelFingerprint(payload);
        if (fp !== baselineFp) {
          setD(payload);
          stopPoll();
          const n = Array.isArray(payload.assumptions) ? payload.assumptions.length : 0;
          setFlash(
            payload.available
              ? `Model updated · ${n} assumption${n === 1 ? '' : 's'} from vault`
              : 'Vault changed · still incomplete (NEEDS BUILD)',
          );
        }
      } catch { /* keep polling */ }
    };

    const interval = setInterval(tick, POLL_MS);
    const timeout = setTimeout(() => {
      stopPoll();
      setFlash((prev) => (
        String(prev || '').includes('Model updated')
          ? prev
          : 'No vault change yet · agent may still be running · click UPDATE MODEL again'
      ));
    }, POLL_MAX_MS);

    pollRef.current = { interval, timeout };
    setTimeout(tick, 1200);
  }, [slug, stopPoll]);

  const fileHref = (rid, rel) => (
    `/api/${slug}/research/runs/${encodeURIComponent(rid)}/file?rel=${encodeURIComponent(rel)}`
  );

  const pdfOf = (r) => {
    const list = r?.pdfs || r?.model_read?.pdfs || [];
    return list[0] || r?.pdf_rel || r?.model_read?.pdf_rel || null;
  };

  const startReadPoll = useCallback((runId) => {
    stopReadPoll();
    const tick = async () => {
      const payload = await loadReads();
      const row = (payload?.runs || []).find((r) => r.run_id === runId) || (payload?.runs || [])[0];
      if (!row) return;
      const st = String(row.status || '');
      if (st === 'complete' && pdfOf(row)) {
        stopReadPoll();
        setFlash(`Model read ready · Open PDF`);
        setReadBusy(false);
      } else if (st === 'failed' || st === 'cancelled') {
        stopReadPoll();
        setFlash(row.error || `Model read ${st}`);
        setReadBusy(false);
      }
    };
    const interval = setInterval(tick, POLL_MS);
    const timeout = setTimeout(() => {
      stopReadPoll();
      setReadBusy(false);
      setFlash((prev) => (
        String(prev || '').includes('ready') ? prev : 'Still running in Grok · Open PDF will appear when the PDF lands'
      ));
    }, POLL_MAX_MS);
    readPollRef.current = { interval, timeout };
    setTimeout(tick, 1500);
  }, [loadReads, stopReadPoll]);

  const startModelRead = async () => {
    const noModel = !d?.available || !(d?.assumptions || []).length;
    if (noModel) {
      setFlash('UPDATE MODEL first — nothing to read');
      return;
    }
    const inflight = (reads.runs || []).find((r) => r.status === 'queued' || r.status === 'running');
    if (inflight) {
      setFlash('A model read is already in flight');
      setReadBusy(true);
      startReadPoll(inflight.run_id);
      return;
    }
    setReadBusy(true);
    setFlash(null);
    try {
      const started = await apiPost(`${slug}/research/runs`, { job: 'model_read', launch: false });
      if (!started?.ok || !started.run_id) {
        setFlash(started?.error || 'failed to start model read');
        setReadBusy(false);
        return;
      }
      const grok = await apiPost('open-grok', {
        action: 'model-read', desk: slug, run_id: started.run_id, job: 'model_read', mode: 'pipeline',
      });
      setFlash(grok?.ok
        ? 'Opened Grok · model read · waiting for PDF'
        : (grok?.error || 'run created but OPEN GROK failed'));
      startReadPoll(started.run_id);
      loadReads();
    } catch (e) {
      setFlash(e.message || String(e));
      setReadBusy(false);
    }
  };

  const openModelAgent = async (mode) => {
    setBusy(true);
    setFlash(null);
    try {
      let baselineFp = modelFingerprint(d);
      try {
        const pre = await api(`${slug}/model`);
        baselineFp = modelFingerprint(pre);
        setD(pre);
      } catch { /* */ }

      const out = await apiPost('open-grok', { action: 'model-desk', desk: slug, mode });
      if (!out?.ok) {
        setFlash(out?.error || 'open Grok failed (localhost only)');
        return;
      }
      if (mode === 'pipeline') {
        setFlash('Researching… agent opened · waiting for vault publish');
        startVaultPoll(baselineFp);
      } else {
        setFlash(`Opened Grok · chat · ${out.initial_prompt || '/cockpit-model'}`);
      }
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const assumptions = d?.assumptions || [];
  const byLayer = useMemo(() => {
    const map = {
      pack_actual: [],
      pack_guide: [],
      structural: [],
      mixed: [],
      user_case: [],
    };
    for (const a of assumptions) {
      const L = layerOf(a);
      if (!map[L]) map[L] = [];
      map[L].push(a);
    }
    return map;
  }, [assumptions]);

  const printRows = useMemo(() => buildPrintRows(assumptions), [assumptions]);

  if (!d) return <div className="crumb">LOADING…</div>;

  const bridge = d.bridge || [];
  const variance = d.variance || [];
  const gaps = d.gaps || [];
  const c = d.computed || {};
  const empty = !d.available || !assumptions.length;
  const primaryBusy = busy || polling;
  const hc = d.house_context;
  const print = d.print || null;
  const locked = print?.status === 'locked';
  const lockedById = new Map((print?.locked_case || []).map((r) => [r.id, r]));

  return (
    <div>
      <div className="crumb">
        {label} · MODEL · {empty ? <b>NEEDS BUILD</b> : <b>{assumptions.length} LINES</b>}
        {!empty && d.as_of ? ` · AS OF ${String(d.as_of).slice(0, 10)}` : ''}
        {!empty && c.n_user_case != null ? ` · ${c.n_user_case || 0} YOUR-CASE` : ''}
        {!empty && c.n_watch_linked != null ? ` · ${c.n_watch_linked} RISK-LINKED` : ''}
        {!empty && print ? (
          <span style={{ color: locked ? 'var(--sec-2)' : 'inherit', marginLeft: 6 }}>
            {' · '}
            <b>{locked ? 'LOCKED' : 'PRINT ARMED'}</b>
            {` ${print.event} · ${print.date}`}
          </span>
        ) : null}
        {polling ? (
          <span style={{ color: 'var(--sec-2)', marginLeft: 6 }}> · <b>WAITING FOR PUBLISH</b></span>
        ) : null}
      </div>

      <div className="sect" style={{ padding: '8px 16px 10px' }}>
        <div className="dim" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
          Working numbers: <b>pack actuals</b> · <b>guide</b> · <b>your case</b> · variance · risk links.
          Not a price target · does not write house · Street is separate.
          {' '}
          <b>UPDATE MODEL</b> refreshes vault · ≠ COMPILE BOOK
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            disabled={primaryBusy}
            onClick={() => openModelAgent('pipeline')}
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            {polling ? 'WAITING…' : busy ? '…' : 'UPDATE MODEL'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => openModelAgent('chat')}
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            {busy ? '…' : 'OPEN GROK'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={readBusy || empty}
            onClick={startModelRead}
            title="Taught PDF of this ledger — company guide bar, not Street"
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            {readBusy ? 'READING…' : 'READ MODEL'}
          </button>
          {!empty && (
            <button
              type="button"
              className="btn"
              onClick={() => { window.location.hash = `#/${slug}/house`; }}
              style={{ fontSize: 10, padding: '4px 10px' }}
              title="Open house (read / edit path separate)"
            >
              HOUSE
            </button>
          )}
          {!empty && (
            <button
              type="button"
              className="btn"
              onClick={() => { window.location.hash = `#/${slug}/risks`; }}
              style={{ fontSize: 10, padding: '4px 10px' }}
            >
              RISKS
            </button>
          )}
          {polling && (
            <button type="button" className="btn" onClick={() => { stopPoll(); setFlash('Stopped wait'); }} style={{ fontSize: 10, padding: '4px 10px', opacity: 0.85 }}>
              Cancel wait
            </button>
          )}
          {flash && <span className="dim" style={{ fontSize: 10 }}>{flash}</span>}
        </div>
      </div>

      <div className="sect" style={{ padding: '8px 16px 12px' }}>
        <div className="dim" style={{ fontSize: 11, lineHeight: 1.45, marginBottom: 8 }}>
          <b>READ MODEL</b> writes a taught PDF of these rows (company guide bar, offset, GAP). Tables stay. Not a thesis note.
        </div>
        {(() => {
          const latestComplete = (reads.runs || []).find((r) => r.status === 'complete' && pdfOf(r));
          const pdf = latestComplete ? pdfOf(latestComplete) : null;
          const inflight = (reads.runs || []).find((r) => r.status === 'queued' || r.status === 'running');
          return (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
              {pdf && latestComplete && (
                <a
                  className="btn primary"
                  href={fileHref(latestComplete.run_id, pdf)}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 10, padding: '4px 10px' }}
                >
                  Open PDF
                </a>
              )}
              {inflight && (
                <span className="dim" style={{ fontSize: 11 }}>
                  In flight · {String(inflight.started_at || '').slice(0, 16).replace('T', ' ')}
                </span>
              )}
              {!pdf && !inflight && (
                <span className="dim" style={{ fontSize: 11 }}>No model-read PDF yet.</span>
              )}
              {(reads.runs || []).slice(0, 3).filter((r) => r.status === 'complete' && pdfOf(r) && r !== latestComplete).map((r) => (
                <a
                  key={r.run_id}
                  className="btn"
                  href={fileHref(r.run_id, pdfOf(r))}
                  target="_blank"
                  rel="noreferrer"
                  style={{ fontSize: 10, padding: '4px 10px' }}
                >
                  {String(r.finished_at || r.started_at || '').slice(0, 10)}
                </a>
              ))}
            </div>
          );
        })()}
      </div>

      {empty && (
        <div className="sect">
          <div className="emptyD" style={{ padding: '16px' }}>
            <div style={{ marginBottom: 8 }}>{d.reason || 'No working model yet.'}</div>
            <div className="dim" style={{ fontSize: 11, lineHeight: 1.45 }}>
              Click <b>UPDATE MODEL</b> to build pack-grounded actuals + your case skeleton with WATCH links.
            </div>
          </div>
        </div>
      )}

      {!empty && (hc || d.house_touch) && (
        <div className="sect">
          <div className="shd">
            <span className="no">0</span>
            <h2>VS HOUSE</h2>
            <span className="m">read-only context · not a write</span>
          </div>
          <div style={{ padding: '8px 16px 12px', fontSize: 12, lineHeight: 1.55 }}>
            {hc && (
              <div style={{ marginBottom: 8 }}>
                <span className={`chipC ${hc.status === 'CONFIRMED' ? 'ok' : 'watch'}`}>
                  {hc.status || 'HOUSE'}
                  {hc.date ? ` · ${hc.date}` : ''}
                </span>
                {hc.watch_count != null && (
                  <span className="dim" style={{ marginLeft: 10 }}>
                    {hc.watch_count} WATCH on register
                    {hc.watch_labels?.length
                      ? ` · ${hc.watch_labels.map((w) => w.label).join(', ')}`
                      : ''}
                  </span>
                )}
                {hc.view_excerpt && (
                  <div className="dim" style={{ marginTop: 8, fontSize: 11 }}>
                    {hc.view_excerpt}
                    {hc.view_excerpt.length >= 400 ? '…' : ''}
                  </div>
                )}
              </div>
            )}
            {d.house_touch ? (
              <div>
                <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--dim)', letterSpacing: 0.4, marginBottom: 4 }}>
                  MODEL ↔ HOUSE (desk note)
                </div>
                <div style={{ fontSize: 13 }}>{d.house_touch}</div>
              </div>
            ) : (
              <div className="dim" style={{ fontSize: 11 }}>
                No model↔house note yet — agent can set <span className="mono">house_touch</span> on next UPDATE (still does not write house file).
              </div>
            )}
          </div>
        </div>
      )}

      {!empty && (
        <div className="sect">
          <div className="shd">
            <span className="no">0b</span>
            <h2>PRINT CARD</h2>
            <span className="m">
              {print
                ? `${locked ? 'case locked' : 'armed'} · pre-registered case · not a PT`
                : 'arm a print · pre-register your case'}
            </span>
          </div>
          <div style={{ padding: '8px 16px 12px' }}>
            {!print && !armOpen && (
              <div style={{ display: 'flex', gap: 12, alignItems: 'center', flexWrap: 'wrap' }}>
                <span className="dim" style={{ fontSize: 12 }}>
                  No print armed — your case is not pre-registered.
                </span>
                <button type="button" className="btn" onClick={() => setArmOpen(true)} style={{ fontSize: 10, padding: '4px 10px' }}>
                  ARM PRINT
                </button>
              </div>
            )}

            {armOpen && (
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <input
                  value={armEvent}
                  onChange={(e) => setArmEvent(e.target.value)}
                  placeholder="FQ2-2027"
                  aria-label="Event label"
                  className="mono"
                  style={{ fontSize: 12, padding: '4px 8px', width: 140 }}
                />
                <input
                  type="date"
                  value={armDate}
                  onChange={(e) => setArmDate(e.target.value)}
                  aria-label="Print date"
                  className="mono"
                  style={{ fontSize: 12, padding: '4px 8px' }}
                />
                <button type="button" className="btn" disabled={printBusy} onClick={armPrint} style={{ fontSize: 10, padding: '4px 10px' }}>
                  {printBusy ? '…' : 'ARM'}
                </button>
                <button type="button" className="btn" onClick={() => setArmOpen(false)} style={{ fontSize: 10, padding: '4px 10px', opacity: 0.85 }}>
                  Cancel
                </button>
                <span className="dim" style={{ fontSize: 10 }}>Manual entry — date is not fetched or inferred.</span>
              </div>
            )}

            {print && (
              <>
                <div className="dim" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
                  {locked ? (
                    <>
                      Case <b>hard-locked</b> for <b>{print.event}</b> · print {print.date}
                      {print.locked_at ? ` · locked ${String(print.locked_at).slice(0, 10)}` : ''}
                      {' · '}{print.locked_case?.length || 0} lines read-only until a new print is armed.
                      Snapshot kept in model history.
                    </>
                  ) : (
                    <>
                      Armed for <b>{print.event}</b> · print {print.date}.
                      {' '}Fill YOUR CASE below, then <b>LOCK CASE</b> to pre-register it.
                      {' '}{c.n_case_filled || 0} of {(c.n_case_filled || 0) + (c.n_case_gap || 0)} case lines filled.
                    </>
                  )}
                </div>

                <div style={{ overflowX: 'auto' }}>
                  <table className="data" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <thead>
                      <tr style={{ textAlign: 'left', color: 'var(--dim)', fontSize: 10 }}>
                        <th style={{ padding: '6px 12px', width: 64 }}>Risk</th>
                        <th style={{ padding: '6px 12px' }}>Pack · guide</th>
                        <th style={{ padding: '6px 12px' }}>Your case{locked ? ' · locked' : ''}</th>
                      </tr>
                    </thead>
                    <tbody>
                      {printRows.map((g) => (
                        <tr key={g.key} style={{ borderTop: '1px solid var(--line, #333)', verticalAlign: 'top' }}>
                          <td style={{ padding: '8px 12px' }}>
                            {g.watch_risk ? (
                              <span
                                className="mono"
                                style={{ cursor: 'pointer', color: 'var(--sec-2)', fontWeight: 700 }}
                                title={`${g.watch_risk} · open risk`}
                                onClick={() => {
                                  window.location.hash = `#/${slug}/risk/${encodeURIComponent(g.watch_risk)}`;
                                }}
                              >
                                {g.watch_label || 'RISK'}
                              </span>
                            ) : (
                              <span className="dim">—</span>
                            )}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {g.guide.length ? g.guide.map((a) => (
                              <div key={a.id} style={{ marginBottom: 4 }}>
                                <span className="dim" style={{ fontSize: 11 }}>{a.label}</span>{' '}
                                <span className="mono" style={{ fontWeight: 600 }}>
                                  {a.value != null ? a.value : '—'}{a.unit ? ` ${a.unit}` : ''}
                                </span>
                              </div>
                            )) : <span className="dim">no guide line</span>}
                          </td>
                          <td style={{ padding: '8px 12px' }}>
                            {g.cases.length ? g.cases.map((a) => {
                              const lockedRow = lockedById.get(a.id);
                              if (locked) {
                                const lv = lockedRow ? lockedRow.value : a.value;
                                const isGap = !lv || /^gap$/i.test(String(lv));
                                return (
                                  <div key={a.id} style={{ marginBottom: 4 }}>
                                    <span className="dim" style={{ fontSize: 11 }}>{a.label}</span>{' '}
                                    <span className="mono" style={{ fontWeight: 600, opacity: isGap ? 0.6 : 1 }}>
                                      {isGap ? 'GAP' : lv}{!isGap && a.unit ? ` ${a.unit}` : ''}
                                    </span>
                                    <span className="dim" style={{ fontSize: 10, marginLeft: 6 }}>· locked</span>
                                  </div>
                                );
                              }
                              const draft = caseDraft[a.id] !== undefined
                                ? caseDraft[a.id]
                                : (isFilledCase(a) ? String(a.value) : '');
                              return (
                                <div key={a.id} style={{ marginBottom: 6 }}>
                                  <div className="dim" style={{ fontSize: 11 }}>{a.label}</div>
                                  <input
                                    value={draft}
                                    placeholder="GAP"
                                    aria-label={a.label}
                                    disabled={savingCase === a.id}
                                    className="mono"
                                    style={{ fontSize: 12, padding: '3px 8px', width: 130 }}
                                    onChange={(e) => {
                                      const { value } = e.target;
                                      setCaseDraft((prev) => ({ ...prev, [a.id]: value }));
                                    }}
                                    onBlur={(e) => saveCase(a, e.target.value)}
                                    onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                                  />
                                  {a.unit ? <span className="dim" style={{ fontSize: 10, marginLeft: 6 }}>{a.unit}</span> : null}
                                  {savingCase === a.id ? <span className="dim" style={{ fontSize: 10, marginLeft: 6 }}>saving…</span> : null}
                                </div>
                              );
                            }) : <span className="dim">no case line</span>}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap', marginTop: 10 }}>
                  {!locked && (
                    <button
                      type="button"
                      className="btn"
                      disabled={printBusy || !(c.n_case_filled > 0)}
                      onClick={lockPrint}
                      title={c.n_case_filled > 0 ? 'Hard lock this case' : 'Fill at least one case line first'}
                      style={{ fontSize: 10, padding: '4px 10px' }}
                    >
                      {printBusy ? '…' : 'LOCK CASE'}
                    </button>
                  )}
                  {!armOpen && (
                    <button
                      type="button"
                      className="btn"
                      onClick={() => {
                        if (locked && !window.confirm(`Arm a new print? The locked case for ${print.event} stays in history, but this desk stops showing it.`)) return;
                        setArmEvent('');
                        setArmDate('');
                        setArmOpen(true);
                      }}
                      style={{ fontSize: 10, padding: '4px 10px', opacity: 0.85 }}
                    >
                      ARM NEW PRINT
                    </button>
                  )}
                  <span className="dim" style={{ fontSize: 10 }}>
                    Pre-registration only · no target, no sizing · house and risks unchanged.
                  </span>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {!empty && d.frame && (
        <div className="dim" style={{ padding: '0 16px 10px', fontSize: 11, lineHeight: 1.45 }}>{d.frame}</div>
      )}

      {!empty && ['pack_actual', 'pack_guide', 'structural', 'mixed', 'user_case'].map((layer) => {
        const rows = byLayer[layer] || [];
        if (!rows.length) return null;
        const meta = LAYER_META[layer] || { title: layer, hint: '', no: '·' };
        return (
          <div className="sect" key={layer}>
            <div className="shd">
              <span className="no">{meta.no}</span>
              <h2>{meta.title}</h2>
              <span className="m">{meta.hint} · {ticker}</span>
            </div>
            <AssumptionTable rows={rows} slug={slug} />
          </div>
        );
      })}

      {!empty && bridge.length > 0 && (
        <div className="sect">
          <div className="shd">
            <span className="no">2</span>
            <h2>BRIDGE</h2>
            <span className="m">stack · illustration only · not a target</span>
          </div>
          <div style={{ padding: '8px 16px 12px' }}>
            {bridge.map((b, i) => (
              <div
                key={b.id || b.label}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'baseline',
                  padding: '7px 0',
                  borderTop: i ? '1px solid var(--line, #333)' : 'none',
                  fontSize: 13,
                }}
              >
                <span style={{ minWidth: 168, color: 'var(--dim)', fontSize: 11, fontWeight: 700 }}>
                  {b.label}
                </span>
                <span className="mono" style={{ fontWeight: 600 }}>
                  {b.value != null ? b.value : '—'}
                  {b.unit ? ` ${b.unit}` : ''}
                </span>
                {b.note && <span className="dim" style={{ fontSize: 11 }}>{b.note}</span>}
              </div>
            ))}
          </div>
        </div>
      )}

      {!empty && variance.length > 0 && (
        <div className="sect">
          <div className="shd">
            <span className="no">3</span>
            <h2>VARIANCE</h2>
            <span className="m">print / guide moves · highest leverage</span>
          </div>
          <div style={{ overflowX: 'auto', padding: '0 0 8px' }}>
            <table className="data" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--dim)', fontSize: 10 }}>
                  <th style={{ padding: '6px 12px' }}>Line</th>
                  <th style={{ padding: '6px 12px' }}>Prior</th>
                  <th style={{ padding: '6px 12px' }}>Current</th>
                  <th style={{ padding: '6px 12px' }}>Δ</th>
                  <th style={{ padding: '6px 12px' }}>Comment</th>
                </tr>
              </thead>
              <tbody>
                {variance.map((v) => (
                  <tr key={v.line} style={{ borderTop: '1px solid var(--line, #333)' }}>
                    <td style={{ padding: '8px 12px' }}><b>{v.line}</b></td>
                    <td style={{ padding: '8px 12px' }} className="mono dim">{v.prior ?? '—'}</td>
                    <td style={{ padding: '8px 12px' }} className="mono">{v.current ?? '—'}</td>
                    <td style={{ padding: '8px 12px', color: 'var(--sec-2)' }} className="mono">{v.delta ?? '—'}</td>
                    <td style={{ padding: '8px 12px', fontSize: 11 }} className="dim">{v.comment || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {!empty && gaps.length > 0 && (
        <div className="sect">
          <div className="shd">
            <span className="no">4</span>
            <h2>GAPS</h2>
            <span className="m">not invented</span>
          </div>
          <ul style={{ margin: 0, padding: '8px 16px 12px 32px', fontSize: 12, lineHeight: 1.5 }}>
            {gaps.map((g) => (
              <li key={g} className="dim">{g}</li>
            ))}
          </ul>
        </div>
      )}

      {!empty && d.disclaimer && (
        <div className="dim" style={{ padding: '4px 16px 16px', fontSize: 10, lineHeight: 1.45 }}>
          {d.disclaimer}
        </div>
      )}
    </div>
  );
}
