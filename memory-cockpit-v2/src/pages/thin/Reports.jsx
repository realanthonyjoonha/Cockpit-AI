// Shared thin Reports room (`#/{desk}/reports`) — thesis-lane notes + PDF.
// Compile notebooks stay on `#/{desk}/research`. Decision-support only.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiPost } from '../../api.js';

const POLL_MS = 2500;
const CHECKPOINTS = ['scope', 'research', 'draft', 'qa', 'closeout'];
const CP_LABEL = {
  scope: 'scope',
  research: 'research',
  draft: 'draft',
  qa: 'qa',
  closeout: 'closeout',
};

function listFingerprint(payload) {
  if (!payload || typeof payload !== 'object') return 'null';
  const runs = Array.isArray(payload.runs) ? payload.runs : [];
  return runs.map((r) => `${r.run_id}|${r.status}|${r.checkpoint || ''}|${r.finished_at || ''}`).join(';');
}

function whenLabel(r) {
  return String(r.finished_at || r.started_at || '').slice(0, 16).replace('T', ' ');
}

function statusLabel(r) {
  if (r?.stalled) return 'STALLED';
  if (r?.status === 'queued' || r?.status === 'running') {
    const cp = r.checkpoint || r.thesis?.checkpoint;
    return cp ? `at ${CP_LABEL[cp] || cp}` : r.status;
  }
  return r?.status || '—';
}

function statusClass(r) {
  if (r?.status === 'complete') return ' ok';
  if (r?.status === 'failed' || r?.stalled) return ' watch';
  return '';
}

function pdfRel(r, detail) {
  const fromDetail = detail?.thesis?.pdfs || [];
  const fromRow = r?.pdfs || [];
  const list = fromDetail.length ? fromDetail : fromRow;
  return list[0] || detail?.thesis?.pdf_rel || r?.pdf_rel || null;
}

function Stepper({ checkpoint, failed }) {
  const cur = CHECKPOINTS.indexOf(checkpoint || 'scope');
  const idx = cur < 0 ? 0 : cur;
  return (
    <div style={{ fontSize: 12, padding: '4px 0 10px', fontFamily: 'var(--mono)' }}>
      {CHECKPOINTS.map((c, i) => {
        let mark = '○';
        if (failed && i === idx) mark = '✗';
        else if (i < idx) mark = '✓';
        else if (i === idx) mark = failed ? '✗' : '●';
        const color = mark === '✓'
          ? 'var(--intact)'
          : mark === '✗'
            ? 'var(--fired)'
            : mark === '●'
              ? 'var(--watch)'
              : 'var(--dim)';
        return (
          <span key={c}>
            {i > 0 ? <span className="dim"> → </span> : null}
            <span style={{ color }}>{CP_LABEL[c]} {mark}</span>
          </span>
        );
      })}
    </div>
  );
}

function DossierRow({ k, children }) {
  return (
    <div style={{
      display: 'grid',
      gridTemplateColumns: '88px 1fr',
      gap: 10,
      padding: '5px 0',
      fontSize: 12,
      lineHeight: 1.45,
    }}
    >
      <div className="dim" style={{ letterSpacing: 0.4, fontSize: 10 }}>{k}</div>
      <div>{children}</div>
    </div>
  );
}

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinReports({ desk }) {
  const { slug, label } = desk;
  const [list, setList] = useState(null);
  const [runId, setRunId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [mode, setMode] = useState('earnings-update');
  const [askMode, setAskMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [flash, setFlash] = useState(null);
  const [ctx, setCtx] = useState(null);
  const pollRef = useRef(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current.interval);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const loadCtx = useCallback(() => {
    Promise.all([
      api(`${slug}/house`).catch(() => null),
      api(`${slug}/overview`).catch(() => null),
      api(`${slug}/risks/proposals?status=pending`).catch(() => null),
      api(`${slug}/house/proposals?status=pending`).catch(() => null),
    ]).then(([house, overview, riskP, houseP]) => {
      const riskPend = Array.isArray(riskP?.proposals) ? riskP.proposals
        : (Array.isArray(riskP) ? riskP : []);
      const housePend = Array.isArray(houseP?.proposals) ? houseP.proposals
        : (Array.isArray(houseP) ? houseP : []);
      const watch = (overview?.on_watch || overview?.watch || overview?.risks || [])
        .filter((r) => String(r.status || '').toUpperCase() === 'WATCH');
      setCtx({
        houseStatus: house?.hero?.status || house?.status || '—',
        houseDate: house?.hero?.date || null,
        watchN: watch.length || overview?.n_watch || 0,
        pending: [...riskPend, ...housePend],
      });
    });
  }, [slug]);

  const loadList = useCallback(() => {
    return api(`${slug}/research?lane=reports`)
      .then((payload) => {
        setList(payload);
        setRunId((cur) => {
          if (cur) return cur;
          const runs = Array.isArray(payload.runs) ? payload.runs : [];
          return runs[0]?.run_id || null;
        });
        return payload;
      })
      .catch(() => {
        const fail = { available: false, runs: [], reason: 'request failed' };
        setList(fail);
        return fail;
      });
  }, [slug]);

  const loadDetail = useCallback((id) => {
    if (!id) {
      setDetail(null);
      return Promise.resolve(null);
    }
    return api(`${slug}/research/runs/${encodeURIComponent(id)}`)
      .then((payload) => {
        setDetail(payload);
        return payload;
      })
      .catch(() => {
        setDetail({ available: false, reason: 'load failed', run_id: id });
        return null;
      });
  }, [slug]);

  useEffect(() => {
    loadList();
    loadCtx();
    return () => stopPoll();
  }, [loadList, loadCtx, stopPoll]);

  useEffect(() => {
    stopPoll();
    setRunId(null);
    setDetail(null);
    setFlash(null);
  }, [slug, stopPoll]);

  useEffect(() => {
    if (runId) loadDetail(runId);
  }, [runId, loadDetail]);

  const startPoll = useCallback((expectRunId) => {
    stopPoll();
    setPolling(true);
    const tick = async () => {
      try {
        if (expectRunId) {
          const row = await api(`${slug}/research/runs/${encodeURIComponent(expectRunId)}`);
          setDetail(row);
          await loadList();
          if (row && (row.status === 'complete' || row.status === 'failed' || row.status === 'cancelled')) {
            stopPoll();
            setFlash(`Run ${row.status} · ${expectRunId}`);
          }
        }
      } catch { /* keep polling */ }
    };
    const interval = setInterval(tick, POLL_MS);
    pollRef.current = { interval };
    setTimeout(tick, 400);
  }, [slug, stopPoll, loadList]);

  const isInFlight = (r) => r && (r.status === 'running' || r.status === 'queued') && !r.stalled;

  const cancelRun = async (rid) => {
    if (!window.confirm(`Cancel report ${rid}?`)) return;
    try {
      const out = await apiPost(`${slug}/research/runs/${encodeURIComponent(rid)}/cancel`, {});
      if (out?.ok) { setFlash(`Cancelled · ${rid}`); loadList(); } else setFlash(out?.error || 'cancel failed');
    } catch (e) { setFlash(e.message || String(e)); }
  };

  const retryRun = async (rid) => {
    if (!window.confirm(`Retry report ${rid}? Same run folder.`)) return;
    try {
      const out = await apiPost(`${slug}/research/runs/${encodeURIComponent(rid)}/retry`, { launch: false });
      if (!out?.ok) { setFlash(out?.error || 'retry failed'); return; }
      const grok = await apiPost('open-grok', {
        action: 'thesis-report',
        desk: slug,
        run_id: rid,
        job: 'thesis_report',
        thesis_mode: detail?.thesis?.mode || mode,
        mode: 'pipeline',
      });
      setFlash(grok?.ok ? `Retry · ${rid}` : (grok?.error || `Run ${rid} queued but OPEN GROK failed`));
      setRunId(rid);
      startPoll(rid);
    } catch (e) { setFlash(e.message || String(e)); }
  };

  const startReport = async (useMode) => {
    const thesisMode = useMode || mode;
    const runs = list?.runs || [];
    const inFlight = runs.find((r) => isInFlight(r));
    if (inFlight) {
      setFlash(`Report already in flight (${inFlight.run_id}) — wait, or cancel it first.`);
      setRunId(inFlight.run_id);
      setAskMode(false);
      return;
    }
    if (!window.confirm(
      `Start ${thesisMode} report for this desk?\n\nGrok runs /cockpit-report and STOPS at checkpoints.`,
    )) return;
    setBusy(true);
    setFlash(null);
    setAskMode(false);
    try {
      const started = await apiPost(`${slug}/research/runs`, {
        job: 'thesis_report',
        thesis_mode: thesisMode,
        launch: false,
      });
      if (started?.already_in_flight && started.run_id) {
        setRunId(started.run_id);
        setFlash(`Report already in flight (${started.run_id})`);
        loadList();
        return;
      }
      if (!started?.ok || !started.run_id) {
        setFlash(started?.error || 'failed to start report');
        return;
      }
      const newId = started.run_id;
      setRunId(newId);
      const grok = await apiPost('open-grok', {
        action: 'thesis-report',
        desk: slug,
        run_id: newId,
        job: 'thesis_report',
        thesis_mode: thesisMode,
        mode: 'pipeline',
      });
      if (!grok?.ok) {
        setFlash(grok?.error || `Run ${newId} created but OPEN GROK failed`);
        return;
      }
      setFlash(`Report started · ${newId} · ${thesisMode}`);
      startPoll(newId);
      loadList();
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const openChat = async () => {
    setBusy(true);
    try {
      const out = await apiPost('open-grok', {
        action: 'thesis-report',
        desk: slug,
        mode: 'chat',
        run_id: runId || undefined,
        job: 'thesis_report',
        thesis_mode: detail?.thesis?.mode || mode,
      });
      if (!out?.ok) setFlash(out?.error || 'open Grok failed');
      else setFlash(`Opened Grok · ${out.initial_prompt || ''}`);
    } catch (e) { setFlash(e.message || String(e)); } finally { setBusy(false); }
  };

  const runs = list?.runs || [];
  const empty = !list?.available || !runs.length;
  const inflight = runs.find((r) => isInFlight(r));
  const selected = runs.find((r) => r.run_id === runId) || null;
  const lastComplete = runs.find((r) => r.status === 'complete');
  const pendingN = ctx?.pending?.length || 0;
  const fileHref = (rel) => `/api/${slug}/research/runs/${encodeURIComponent(runId)}/file?rel=${encodeURIComponent(rel)}`;

  const summaryLine = useMemo(() => {
    const s = String(detail?.summary || '').replace(/\s+/g, ' ').trim();
    return s.slice(0, 140);
  }, [detail]);

  if (!list) return <div className="crumb">LOADING…</div>;

  const failed = detail?.status === 'failed' || selected?.status === 'failed';
  const checkpoint = detail?.thesis?.checkpoint || selected?.checkpoint || 'scope';
  const artifact = pdfRel(selected, detail);

  return (
    <div>
      <div className="crumb">
        {label} · REPORTS · {empty ? <b>EMPTY</b> : <b>{runs.length} RUN{runs.length === 1 ? '' : 'S'}</b>}
        {polling ? <span style={{ color: 'var(--sec-2)' }}> · <b>WAITING</b></span> : null}
      </div>

      <div className="sect" style={{ padding: '8px 16px 10px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            disabled={busy || polling}
            onClick={() => setAskMode((v) => !v)}
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            NEW REPORT
          </button>
          <button type="button" className="btn" disabled={busy} onClick={openChat} style={{ fontSize: 10, padding: '4px 10px' }}>
            OPEN GROK
          </button>
          <button type="button" className="btn" onClick={() => { loadList(); loadCtx(); }} style={{ fontSize: 10, padding: '4px 10px' }}>
            REFRESH
          </button>
          {flash && <span className="dim" style={{ fontSize: 10 }}>{flash}</span>}
        </div>
        {askMode && (
          <div style={{ marginTop: 8, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {['earnings-update', 'deep-dive', 'initiation'].map((m) => (
              <button
                key={m}
                type="button"
                className="btn"
                style={{ fontSize: 10, padding: '3px 8px', fontWeight: mode === m ? 700 : 400 }}
                onClick={() => { setMode(m); startReport(m); }}
              >
                {m}
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="sect" style={{ padding: '6px 16px 10px', fontSize: 11 }}>
        <span className={`chipC${ctx?.houseStatus === 'CONFIRMED' ? ' ok' : ''}`}>
          HOUSE {ctx?.houseStatus || '—'}
        </span>
        {ctx?.houseDate ? <span className="dim" style={{ marginLeft: 8 }}>{ctx.houseDate}</span> : null}
        <span style={{ marginLeft: 10 }}><b style={{ color: 'var(--watch)' }}>{ctx?.watchN ?? '—'}</b> WATCH</span>
        {lastComplete ? (
          <span className="dim" style={{ marginLeft: 10 }}>last report {String(lastComplete.finished_at || lastComplete.started_at || '').slice(0, 10)}</span>
        ) : null}
        {pendingN > 0 ? (
          <span
            className="lnk"
            style={{ marginLeft: 10, cursor: 'pointer' }}
            onClick={() => { window.location.hash = `#/${slug}/risks`; }}
          >
            {pendingN} proposal{pendingN === 1 ? '' : 's'} pending
          </span>
        ) : null}
      </div>

      {empty && (
        <div className="sect">
          <div className="emptyD" style={{ padding: '16px' }}>
            <div style={{ marginBottom: 8 }}>{list.reason || 'No reports yet.'}</div>
            <div className="dim" style={{ fontSize: 11 }}>
              NEW REPORT starts a checkpointed note. Compiles (if any) stay on the Compile room.
            </div>
          </div>
        </div>
      )}

      {!empty && (
        <div className="sect">
          <div className="shd">
            <span className="no">1</span>
            <h2>RUNS</h2>
            <span className="m">checkpointed notes</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--dim)', fontSize: 10 }}>
                  <th style={{ padding: '6px 12px' }}>When</th>
                  <th style={{ padding: '6px 12px' }}>Mode</th>
                  <th style={{ padding: '6px 12px' }}>Status</th>
                  <th style={{ padding: '6px 12px' }}>Artifact</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => (
                  <tr
                    key={r.run_id}
                    style={{
                      borderTop: '1px solid var(--line, #333)',
                      cursor: 'pointer',
                      background: runId === r.run_id ? 'rgba(123,135,232,0.12)' : undefined,
                    }}
                    onClick={() => setRunId(r.run_id)}
                  >
                    <td style={{ padding: '8px 12px' }} className="mono">{whenLabel(r)}</td>
                    <td style={{ padding: '8px 12px' }}>{r.thesis_mode || r.thesis?.mode || '—'}</td>
                    <td style={{ padding: '8px 12px' }}>
                      <span className={`chipC${statusClass(r)}`}>{statusLabel(r)}</span>
                      {isInFlight(r) && (
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: 9, padding: '2px 7px', marginLeft: 6 }}
                          onClick={(e) => { e.stopPropagation(); cancelRun(r.run_id); }}
                        >
                          CANCEL
                        </button>
                      )}
                      {r.status === 'failed' && (
                        <button
                          type="button"
                          className="btn"
                          style={{ fontSize: 9, padding: '2px 7px', marginLeft: 6 }}
                          onClick={(e) => { e.stopPropagation(); retryRun(r.run_id); }}
                        >
                          RETRY
                        </button>
                      )}
                    </td>
                    <td style={{ padding: '8px 12px' }} className="mono dim">
                      {(r.pdfs && r.pdfs[0]) ? r.pdfs[0].replace(/^output\//, '') : (r.status === 'failed' ? 'none' : '—')}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {inflight && (
            <div className="dim" style={{ padding: '6px 16px 10px', fontSize: 11 }}>
              queued · holds the report mutex — NEW REPORT blocked
            </div>
          )}
        </div>
      )}

      {runId && detail && (
        <div className="sect">
          <div className="shd">
            <span className="no">2</span>
            <h2>REPORT</h2>
            <span className="m">{detail.run_id} · {detail.thesis?.mode || mode}</span>
          </div>
          <div style={{ padding: '8px 16px 16px' }}>
            <Stepper checkpoint={checkpoint} failed={failed} />
            {failed ? (
              <>
                <DossierRow k="ARTIFACT">none — failed before render</DossierRow>
                <DossierRow k="LAST LOG">
                  <span className="mono" style={{ fontSize: 11 }}>
                    {String(detail.error || detail.log_tail || 'no log').split('\n').slice(0, 2).join(' · ').slice(0, 220)}
                  </span>
                </DossierRow>
                <DossierRow k="ACTIONS">
                  <button type="button" className="btn" style={{ fontSize: 10, padding: '3px 8px' }} onClick={() => retryRun(runId)}>
                    RETRY
                  </button>
                </DossierRow>
              </>
            ) : (
              <>
                <DossierRow k="ARTIFACT">
                  {artifact ? (
                    <>
                      <a className="filing-link" href={fileHref(artifact)} target="_blank" rel="noreferrer">
                        {artifact.replace(/^output\//, '')}
                      </a>
                      {' · '}
                      <a className="filing-link" href={fileHref('baseline-anchors.md')} target="_blank" rel="noreferrer">
                        anchors
                      </a>
                    </>
                  ) : (
                    <span className="dim">none yet</span>
                  )}
                </DossierRow>
                <DossierRow k="DELTA">
                  {summaryLine || <span className="dim">—</span>}
                </DossierRow>
                <DossierRow k="REGISTER">
                  <span className="dim">tested on closeout · status is not evidence</span>
                </DossierRow>
                <DossierRow k="PROPOSALS">
                  {pendingN > 0 ? (
                    <span
                      className="lnk"
                      style={{ cursor: 'pointer' }}
                      onClick={() => { window.location.hash = `#/${slug}/risks`; }}
                    >
                      {pendingN} pending → #{`/${slug}/risks`}
                    </span>
                  ) : (
                    <span className="dim">—</span>
                  )}
                </DossierRow>
                {pendingN > 0 && (
                  <p style={{ color: 'var(--watch)', fontSize: 11, margin: '8px 0 0' }}>
                    ⚠ proposals are not applied — human ACCEPTs on the Risks room
                  </p>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
