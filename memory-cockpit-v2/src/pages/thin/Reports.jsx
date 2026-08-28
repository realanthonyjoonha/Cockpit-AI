// Shared thin Reports room (`#/{desk}/reports`) — PDF-first thesis notes.
// Arm-next-print is glass-open, not cron. Decision-support only.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiPost } from '../../api.js';

const POLL_MS = 2500;
const CHECKPOINTS = ['scope', 'research', 'draft', 'qa', 'closeout'];
const MODES = [
  { id: 'earnings-update', label: 'Earnings update', hint: '8–12pp · print vs house' },
  { id: 'deep-dive', label: 'Deep-dive', hint: '15–25pp' },
  { id: 'initiation', label: 'Initiation', hint: '20–30pp · structure, not a rating' },
];
const REGISTER_CHOICES = [
  { id: 'all', label: 'All', hint: 'WATCH in depth · INTACT short' },
  { id: 'pick', label: 'Pick', hint: 'Named Rn only' },
  { id: 'skim', label: 'House only', hint: 'No register chapter' },
];
const PACE_CHOICES = [
  { id: 'stop', label: 'Stop at checkpoints', hint: 'Wait at Checkpoint 1 and 2' },
  { id: 'through', label: 'Run through', hint: 'End to end · ACCEPT still on glass' },
];

function registerOf(r) {
  return r?.register_scope || r?.thesis?.register_scope || null;
}
function registerIdsOf(r) {
  const ids = r?.register_ids || r?.thesis?.register_ids;
  return Array.isArray(ids) ? ids : [];
}
function paceOf(r) {
  return r?.thesis_pace || r?.thesis?.thesis_pace || 'stop';
}
function scopePhrase(scope, ids) {
  if (scope === 'skim') return 'House only (register skim)';
  if (scope === 'pick') return ids.length ? `Pick ${ids.map(shortRiskToken).join(', ')}` : 'Pick risks';
  return 'All (WATCH in depth)';
}
function shortRiskToken(id) {
  const s = String(id || '').trim();
  if (/^R\d{1,3}$/i.test(s)) return s.toUpperCase();
  const m = s.match(/(?:^|[-_./])r(\d{1,3})(?:[-_./]|$)/i);
  return m ? `R${m[1]}` : s;
}
function riskChip(rk) {
  const id = String(rk.id || '');
  const name = String(rk.name || '');
  const fromName = name.match(/^(R\d{1,3})\b/i);
  const short = fromName ? fromName[1].toUpperCase() : shortRiskToken(id);
  const rest = name.replace(/^(R\d{1,3})\s*[—–-]\s*/i, '');
  return { id, short, rest };
}

function whenLabel(r) {
  return String(r.finished_at || r.started_at || '').slice(0, 16).replace('T', ' ');
}
function dayLabel(r) {
  return String(r.finished_at || r.started_at || '').slice(0, 10);
}
function modeOf(r) {
  return r?.thesis_mode || r?.thesis?.mode || r?.thesis?.thesis_mode || 'report';
}
function pdfRel(r, detail) {
  const fromDetail = detail?.thesis?.pdfs || [];
  const fromRow = r?.pdfs || [];
  const list = fromDetail.length ? fromDetail : fromRow;
  return list[0] || detail?.thesis?.pdf_rel || r?.pdf_rel || null;
}
function humanTitle(r, ticker) {
  const mode = String(modeOf(r)).replace(/-/g, ' ');
  const day = dayLabel(r);
  return `${ticker || ''} ${mode}${day ? ` · ${day}` : ''}`.trim();
}

function Stepper({ checkpoint, failed }) {
  const cur = CHECKPOINTS.indexOf(checkpoint || 'scope');
  const idx = cur < 0 ? 0 : cur;
  return (
    <div style={{ fontSize: 11, padding: '2px 0 8px', fontFamily: 'var(--mono)' }}>
      {CHECKPOINTS.map((c, i) => {
        let mark = '○';
        if (failed && i === idx) mark = '✗';
        else if (i < idx) mark = '✓';
        else if (i === idx) mark = failed ? '✗' : '●';
        const color = mark === '✓' ? 'var(--intact)' : mark === '✗' ? 'var(--fired)' : mark === '●' ? 'var(--watch)' : 'var(--dim)';
        return (
          <span key={c}>
            {i > 0 ? <span className="dim"> → </span> : null}
            <span style={{ color }}>{c} {mark}</span>
          </span>
        );
      })}
    </div>
  );
}

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinReports({ desk }) {
  const { slug, ticker, label } = desk;
  const [list, setList] = useState(null);
  const [runId, setRunId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [sched, setSched] = useState(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [flash, setFlash] = useState(null);
  const [ctx, setCtx] = useState(null);
  const [registerScope, setRegisterScope] = useState('all');
  const [pickedIds, setPickedIds] = useState([]);
  const [thesisPace, setThesisPace] = useState('stop');
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
      api(`${slug}/risks`).catch(() => null),
    ]).then(([house, overview, riskP, risksBody]) => {
      const riskPend = Array.isArray(riskP?.proposals) ? riskP.proposals : [];
      const watch = overview?.risk_summary?.watch;
      const watchN = Array.isArray(watch) ? watch.length : (overview?.n_watch || 0);
      const risks = Array.isArray(risksBody?.risks) ? risksBody.risks : [];
      setCtx({
        houseStatus: house?.hero?.status || house?.status || '—',
        houseDate: house?.hero?.date || null,
        watchN,
        pending: riskPend,
        risks,
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
          const withPdf = runs.find((r) => r.status === 'complete' && (r.pdfs || [])[0]);
          return (withPdf || runs[0])?.run_id || null;
        });
        return payload;
      })
      .catch(() => {
        const fail = { available: false, runs: [], reason: 'request failed' };
        setList(fail);
        return fail;
      });
  }, [slug]);

  const loadSched = useCallback(() => {
    return api(`${slug}/reports/schedule`).then(setSched).catch(() => setSched(null));
  }, [slug]);

  const loadDetail = useCallback((id) => {
    if (!id) { setDetail(null); return Promise.resolve(null); }
    return api(`${slug}/research/runs/${encodeURIComponent(id)}`)
      .then((payload) => { setDetail(payload); return payload; })
      .catch(() => { setDetail({ available: false, reason: 'load failed', run_id: id }); return null; });
  }, [slug]);

  useEffect(() => {
    loadList();
    loadCtx();
    loadSched();
    return () => stopPoll();
  }, [loadList, loadCtx, loadSched, stopPoll]);

  useEffect(() => {
    stopPoll();
    setRunId(null);
    setDetail(null);
    setFlash(null);
    setRegisterScope('all');
    setPickedIds([]);
    setThesisPace('stop');
  }, [slug, stopPoll]);

  useEffect(() => { if (runId) loadDetail(runId); }, [runId, loadDetail]);

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
            setFlash(`Run ${row.status}`);
          }
        }
      } catch { /* keep polling */ }
    };
    const interval = setInterval(tick, POLL_MS);
    pollRef.current = { interval };
    setTimeout(tick, 400);
  }, [slug, stopPoll, loadList]);

  const isInFlight = (r) => r && (r.status === 'running' || r.status === 'queued') && !r.stalled;

  const retryRun = async (rid) => {
    const retryPace = paceOf(detail) || thesisPace;
    if (!window.confirm(
      retryPace === 'through'
        ? 'Retry this report? Same run folder. Grok runs through without waiting at checkpoints.'
        : 'Retry this report? Same run folder. Grok will stop at Checkpoint 1.',
    )) return;
    try {
      const out = await apiPost(`${slug}/research/runs/${encodeURIComponent(rid)}/retry`, { launch: false });
      if (!out?.ok) { setFlash(out?.error || 'retry failed'); return; }
      const grok = await apiPost('open-grok', {
        action: 'thesis-report', desk: slug, run_id: rid, job: 'thesis_report',
        thesis_mode: detail?.thesis?.mode || 'earnings-update', mode: 'pipeline',
        register_scope: registerOf(detail) || 'all',
        register_ids: registerIdsOf(detail),
        thesis_pace: retryPace,
      });
      setFlash(grok?.ok ? 'Retry · OPEN GROK' : (grok?.error || 'queued but OPEN GROK failed'));
      setRunId(rid);
      startPoll(rid);
    } catch (e) { setFlash(e.message || String(e)); }
  };

  const startReport = async (useMode, extra = {}) => {
    const thesisMode = useMode || 'earnings-update';
    const runs = list?.runs || [];
    const inFlight = runs.find((r) => isInFlight(r));
    if (inFlight) {
      setFlash(`Already in flight — wait or cancel.`);
      setRunId(inFlight.run_id);
      return;
    }
    if (registerScope === 'pick' && !pickedIds.length) {
      setFlash('Pick at least one risk, or switch to All / House only.');
      return;
    }
    const scope = registerScope;
    const ids = scope === 'pick' ? pickedIds : [];
    const pace = thesisPace === 'through' ? 'through' : 'stop';
    if (!extra.skipConfirm && !window.confirm(
      `Start ${thesisMode} for this desk?\n\nHouse: on\nRegister: ${scopePhrase(scope, ids)}\nPace: ${pace === 'through' ? 'run through (no checkpoint waits)' : 'stop at checkpoints'}\n\n${pace === 'through' ? 'Grok runs /cockpit-report end to end. House/risks still need your ACCEPT.' : 'Grok runs /cockpit-report and STOPS at Checkpoint 1.'}`,
    )) return;
    setBusy(true);
    setFlash(null);
    try {
      const started = await apiPost(`${slug}/research/runs`, {
        job: 'thesis_report', thesis_mode: thesisMode, launch: false,
        register_scope: scope, register_ids: ids, thesis_pace: pace,
      });
      if (!started?.ok || !started.run_id) {
        setFlash(started?.error || 'failed to start');
        return;
      }
      const newId = started.run_id;
      setRunId(newId);
      if (extra.ackPrint) {
        await apiPost(`${slug}/reports/schedule`, { armed: true, ack_print: extra.ackPrint }).catch(() => {});
        loadSched();
      }
      const grok = await apiPost('open-grok', {
        action: 'thesis-report', desk: slug, run_id: newId, job: 'thesis_report',
        thesis_mode: thesisMode, mode: 'pipeline',
        register_scope: scope, register_ids: ids, thesis_pace: pace,
      });
      setFlash(grok?.ok ? `Started · ${thesisMode} · ${scopePhrase(scope, ids)} · ${pace}` : (grok?.error || 'created but OPEN GROK failed'));
      startPoll(newId);
      loadList();
    } catch (e) {
      setFlash(e.message || String(e));
    } finally { setBusy(false); }
  };

  const openChat = async () => {
    setBusy(true);
    try {
      const out = await apiPost('open-grok', {
        action: 'thesis-report', desk: slug, mode: 'chat',
        run_id: runId || undefined, job: 'thesis_report',
        thesis_mode: detail?.thesis?.mode || 'earnings-update',
        register_scope: registerOf(detail) || registerScope,
        register_ids: registerIdsOf(detail).length ? registerIdsOf(detail) : pickedIds,
        thesis_pace: paceOf(detail) || thesisPace,
      });
      setFlash(out?.ok ? 'Opened Grok' : (out?.error || 'open Grok failed'));
    } catch (e) { setFlash(e.message || String(e)); } finally { setBusy(false); }
  };

  const toggleArm = async () => {
    const next = !(sched?.armed);
    try {
      const out = await apiPost(`${slug}/reports/schedule`, { armed: next });
      setSched(out);
    } catch (e) { setFlash(e.message || String(e)); }
  };

  const runs = list?.runs || [];
  const empty = !list?.available || !runs.length;
  const inflight = runs.find((r) => isInFlight(r));
  const selected = runs.find((r) => r.run_id === runId) || null;
  const statusOf = (r) => {
    if (detail && r && detail.run_id === r.run_id && detail.status) return detail.status;
    return r?.status;
  };
  const lastComplete = runs.find((r) => statusOf(r) === 'complete' && pdfRel(r, runId === r.run_id ? detail : null));
  const lastAnyComplete = lastComplete || runs.find((r) => statusOf(r) === 'complete');
  const lastFailed = runs.find((r) => statusOf(r) === 'failed');
  const selectedStatus = statusOf(selected);
  const hero = (selected && selectedStatus === 'complete' && pdfRel(selected, detail))
    ? selected
    : lastAnyComplete;
  const pendingN = ctx?.pending?.length || 0;
  const fileHref = (rid, rel) => `/api/${slug}/research/runs/${encodeURIComponent(rid)}/file?rel=${encodeURIComponent(rel)}`;
  const heroPdf = hero ? pdfRel(hero, runId === hero.run_id ? detail : null) : null;
  const failed = selectedStatus === 'failed';
  const checkpoint = detail?.thesis?.checkpoint || selected?.checkpoint || 'scope';
  const summaryLine = useMemo(() => {
    const s = String(detail?.summary || '').replace(/\s+/g, ' ').trim();
    return s.slice(0, 180);
  }, [detail]);

  if (!list) return <div className="crumb">LOADING…</div>;

  const printDate = sched?.print?.date;
  const printKnown = !!sched?.print_known && !!printDate;

  return (
    <div>
      <div className="crumb">
        {label} · REPORTS
        {lastAnyComplete ? ` · last ${dayLabel(lastAnyComplete)}` : ' · EMPTY'}
        {polling ? <span style={{ color: 'var(--sec-2)' }}> · <b>WAITING</b></span> : null}
      </div>

      {sched?.due && printKnown && (
        <div className="sect" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 13, marginBottom: 8 }}>
            Print landed · <b>{printDate}</b> · {sched.print.form}
            {' · '}no earnings-update since then.
          </div>
          <div className="dimmer" style={{ fontSize: 11, marginBottom: 10 }}>
            Dates from SEC only. Agent still stops at Checkpoint 1. Not a clock.
          </div>
          <button
            type="button"
            className="btn"
            disabled={busy || !!inflight}
            onClick={() => startReport('earnings-update', { skipConfirm: true, ackPrint: printDate })}
            style={{ fontSize: 11, padding: '6px 12px' }}
          >
            Start earnings-update
          </button>
        </div>
      )}

      {hero && heroPdf && (
        <div className="sect">
          <div className="report-hero">
            <div className="dim" style={{ fontSize: 10, letterSpacing: 0.08, marginBottom: 4 }}>
              {String(modeOf(hero)).toUpperCase()} · COMPLETE
            </div>
            <h1>{humanTitle(hero, ticker)}</h1>
            <div className="acts">
              <a className="btn primary" href={fileHref(hero.run_id, heroPdf)} target="_blank" rel="noreferrer">
                Open PDF
              </a>
              <a className="btn" href={fileHref(hero.run_id, 'baseline-anchors.md')} target="_blank" rel="noreferrer">
                Anchors
              </a>
              <button type="button" className="btn" disabled={busy} onClick={openChat}>
                Open Grok
              </button>
            </div>
            {runId === hero.run_id && summaryLine ? (
              <div style={{ fontSize: 12, lineHeight: 1.5, maxWidth: '52rem' }}>{summaryLine}</div>
            ) : null}
            <div className="dim" style={{ fontSize: 11, marginTop: 10 }}>
              HOUSE {ctx?.houseStatus || '—'}
              {ctx?.watchN != null ? ` · ${ctx.watchN} WATCH` : ''}
              {pendingN > 0 ? (
                <span className="filing-link" style={{ marginLeft: 8 }} onClick={() => { window.location.hash = `#/${slug}/risks`; }}>
                  {pendingN} proposal{pendingN === 1 ? '' : 's'} pending
                </span>
              ) : null}
              <span className="dimmer"> · PDF is ops, not pack SoR</span>
            </div>
          </div>
        </div>
      )}

      {inflight && (
        <div className="sect" style={{ padding: '12px 16px' }}>
          <div style={{ fontSize: 12, marginBottom: 6 }}>IN FLIGHT · {modeOf(inflight)}</div>
          <Stepper checkpoint={checkpoint} failed={false} />
          <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>
            {paceOf(inflight) === 'through' || (detail && detail.run_id === inflight.run_id && paceOf(detail) === 'through')
              ? 'Running through · not waiting at checkpoints'
              : 'Waiting on Grok · Checkpoint 1 is next'}
          </div>
          <button type="button" className="btn" onClick={openChat} style={{ fontSize: 10, padding: '4px 10px', marginRight: 8 }}>OPEN GROK</button>
        </div>
      )}

      <div className="sect">
        <div className="report-canvas">
          {empty && !hero && !inflight && (
            <>
              <div className="eyebrow">REPORTS</div>
              <h1>No note yet</h1>
              <p className="lede">
                House stays on. Choose register depth and whether Grok waits at checkpoints, then a type.
              </p>
            </>
          )}
          {(!empty || hero) && (
            <div className="eyebrow" style={{ marginBottom: 10 }}>NEW NOTE</div>
          )}
          <div className="scope-bar">
            <div>
              <span className="scope-k">HOUSE</span>
              <div className="scope-group">
                <span className="scope-chip on locked">On · steelman + delta</span>
              </div>
            </div>
            <div>
              <span className="scope-k">REGISTER</span>
              <div className="scope-group">
                {REGISTER_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`scope-chip${registerScope === c.id ? ' on' : ''}`}
                    disabled={busy || !!inflight}
                    title={c.hint}
                    onClick={() => setRegisterScope(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="scope-k">PACE</span>
              <div className="scope-group">
                {PACE_CHOICES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    className={`scope-chip${thesisPace === c.id ? ' on' : ''}`}
                    disabled={busy || !!inflight}
                    title={c.hint}
                    onClick={() => setThesisPace(c.id)}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          <div className="scope-hint">
            {registerScope === 'skim'
              ? 'No register chapter in the PDF. House + delta only.'
              : registerScope === 'pick'
                ? 'Deep only the risks you tick. Others get one line: not tested this note.'
                : 'WATCH in depth · INTACT short. Hunt outside the register as add-risk candidates.'}
            {thesisPace === 'through'
              ? ' Run through does not wait at Checkpoint 1 or 2. House/risks still only via propose — you ACCEPT on glass.'
              : ' Stop waits at Checkpoint 1 and 2.'}
          </div>
          {registerScope === 'pick' && (
            <div className="rn-row">
              {(ctx?.risks || []).length
                ? ctx.risks.map((rk) => {
                  const chip = riskChip(rk);
                  const on = pickedIds.includes(chip.id);
                  const st = String(rk.status || '').toLowerCase();
                  const stCls = st === 'watch' ? 'watch' : st === 'fired' ? 'fired' : 'ok';
                  return (
                    <button
                      key={chip.id}
                      type="button"
                      className={`rn-chip${on ? ' on' : ''} ${stCls}`}
                      disabled={busy || !!inflight}
                      title={chip.id}
                      onClick={() => setPickedIds((cur) => (
                        cur.includes(chip.id) ? cur.filter((x) => x !== chip.id) : [...cur, chip.id]
                      ))}
                    >
                      <b>{chip.short}</b> {chip.rest}
                      <span className="st">{rk.status || '—'}</span>
                    </button>
                  );
                })
                : <span className="dim" style={{ fontSize: 11 }}>No register rows on pack yet.</span>}
            </div>
          )}
          <div className="mode-grid">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                className="mode-tile"
                disabled={busy || !!inflight}
                onClick={() => startReport(m.id)}
              >
                <b>{m.label}</b>
                <span>{m.hint}</span>
              </button>
            ))}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 16 }}>
            <button type="button" className="btn" disabled={busy} onClick={openChat}>
              Open Grok
            </button>
            {flash && <span className="dim" style={{ fontSize: 11 }}>{flash}</span>}
          </div>
          <div className="arm-row" style={{ paddingTop: 14, borderTop: '1px solid var(--hairline)' }}>
            <button
              type="button"
              className={`arm-switch${sched?.armed ? ' on' : ''}`}
              role="switch"
              aria-checked={!!sched?.armed}
              title="When a 10-Q or 10-K lands, prompt to start an earnings-update. Not a clock."
              onClick={toggleArm}
            >
              <i />
            </button>
            <div>
              <div style={{ fontWeight: 600 }}>Remind me after the next print</div>
              <div className="dimmer" style={{ fontSize: 11, marginTop: 3 }}>
                {printKnown
                  ? `Last SEC print ${printDate} · ${sched.print.form}`
                  : 'No dated 10-Q/10-K in cache yet — toggle still saves'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {lastFailed && lastFailed !== hero && (
        <div className="sect" style={{ padding: '10px 16px 12px' }}>
          <div style={{ fontSize: 12 }}>
            Last attempt {whenLabel(lastFailed)} failed before PDF.
          </div>
          <div className="dimmer" style={{ fontSize: 11, margin: '4px 0 8px' }}>
            {(detail?.error || lastFailed.error || 'Stopped before PDF').toString().split('\n')[0].slice(0, 160)}
          </div>
          <button type="button" className="btn" style={{ fontSize: 10, padding: '4px 10px' }} onClick={() => retryRun(lastFailed.run_id)}>
            Retry
          </button>
        </div>
      )}

      {selected && failed && selected === lastFailed && !heroPdf && (
        <div className="sect" style={{ padding: '10px 16px 12px' }}>
          <Stepper checkpoint={checkpoint} failed />
        </div>
      )}

      {runs.length > 0 && (
        <div className="sect">
          <div className="shd">
            <span className="no">·</span>
            <h2>PAST NOTES</h2>
            <span className="m">{runs.length}</span>
          </div>
          {runs.map((r) => {
            const pdf = pdfRel(r);
            const complete = r.status === 'complete' && pdf;
            return (
              <div
                key={r.run_id}
                className={`past-note${runId === r.run_id ? ' on' : ''}`}
                onClick={() => setRunId(r.run_id)}
              >
                <span className="mono dim" style={{ width: '6.5rem', flex: 'none' }}>{dayLabel(r) || '—'}</span>
                <span style={{ flex: 1 }}>
                  {String(modeOf(r)).replace(/-/g, ' ')}
                  {registerOf(r) && registerOf(r) !== 'all' ? (
                    <span className="dimmer"> · {scopePhrase(registerOf(r), registerIdsOf(r))}</span>
                  ) : null}
                  {paceOf(r) === 'through' ? <span className="dimmer"> · through</span> : null}
                </span>
                <span className={`chipC${r.status === 'complete' ? ' ok' : r.status === 'failed' ? ' watch' : ''}`}>
                  {r.status}
                </span>
                {complete ? (
                  <a
                    className="filing-link"
                    href={fileHref(r.run_id, pdf)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    style={{ fontSize: 11 }}
                  >
                    Open
                  </a>
                ) : (
                  <span className="dim" style={{ fontSize: 11 }}> </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
