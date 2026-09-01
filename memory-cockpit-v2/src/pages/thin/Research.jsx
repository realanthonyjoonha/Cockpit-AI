// Shared thin Research room — archive of on-demand deep compiles.
// Notebook-first: surface pack-grounded claims densely (not a thin tab shell).
// Draft archive only — not live pack/house. Decision-support only.
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { api, apiPost } from '../../api.js';

const POLL_MS = 2500;

function listFingerprint(payload) {
  if (!payload || typeof payload !== 'object') return 'null';
  const runs = Array.isArray(payload.runs) ? payload.runs : [];
  return runs.map((r) => `${r.run_id}|${r.status}|${r.finished_at || ''}|${r.n_claims || 0}`).join(';');
}

function gradeChip(g) {
  if (!g) return null;
  const ok = String(g).toUpperCase() === 'A';
  return (
    <span
      className={`chipC${ok ? ' ok' : ''}`}
      style={{ fontSize: 9, marginLeft: 4, verticalAlign: 'middle' }}
    >
      {String(g).toUpperCase()}
    </span>
  );
}

function depthLabel(r) {
  if (!r || r.status !== 'complete') return '—';
  const fin = r.n_financials ?? 0;
  const risks = r.n_risks ?? 0;
  const narr = r.n_narrative ?? 0;
  const guide = r.n_guide ?? 0;
  const src = r.n_sources ?? 0;
  const claims = r.n_claims ?? (fin + risks + narr + guide);
  if (!claims && !src) return 'empty extract';
  const parts = [];
  if (claims) parts.push(`${claims} claims`);
  if (fin) parts.push(`${fin} fin`);
  if (risks) parts.push(`${risks} risks`);
  if (src) parts.push(`${src} src`);
  return parts.join(' · ');
}

function inlineBold(text) {
  return String(text || '').split(/(\*\*[^*]+\*\*)/g).map((p, j) => {
    if (/^\*\*[^*]+\*\*$/.test(p)) return <b key={j}>{p.slice(2, -2)}</b>;
    return p;
  });
}

/** Group claims by layer_hint for denser scan. */
function claimNotebook(items, emptyMsg) {
  if (!Array.isArray(items) || !items.length) {
    return (
      <div className="emptyD" style={{ margin: '6px 0 10px', padding: '10px 12px', fontSize: 12 }}>
        {emptyMsg || 'Nothing in this section for this run.'}
      </div>
    );
  }
  const groups = new Map();
  items.forEach((c) => {
    const k = c.layer_hint || 'claims';
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k).push(c);
  });
  return (
    <div style={{ padding: '0 0 8px' }}>
      {[...groups.entries()].map(([layer, rows]) => (
        <div key={layer} style={{ marginBottom: 8 }}>
          {groups.size > 1 && (
            <div
              className="dim"
              style={{
                fontSize: 10,
                letterSpacing: 0.4,
                textTransform: 'uppercase',
                padding: '6px 16px 2px',
              }}
            >
              {layer.replace(/_/g, ' ')} · {rows.length}
            </div>
          )}
          {rows.map((c, i) => (
            <div
              key={`${layer}-${i}`}
              style={{
                display: 'grid',
                gridTemplateColumns: '1fr auto',
                gap: 10,
                padding: '7px 16px',
                borderTop: '1px solid var(--line, #333)',
                fontSize: 13,
                lineHeight: 1.45,
                alignItems: 'start',
              }}
            >
              <div>{inlineBold(c.text)}</div>
              <div className="dim mono" style={{ fontSize: 10, whiteSpace: 'nowrap', textAlign: 'right' }}>
                {c.as_of || '—'}
                {c.grade ? gradeChip(c.grade) : null}
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** Markdown-ish summary: headings, bullets, real tables, bold. */
function SummaryBody({ text }) {
  if (!text) {
    return <div className="dim" style={{ padding: '8px 16px' }}>No summary in this run.</div>;
  }
  const lines = String(text).split('\n');
  const nodes = [];
  let listBuf = [];
  let tableBuf = [];

  const flushList = () => {
    if (!listBuf.length) return;
    nodes.push(
      <ul key={`ul-${nodes.length}`} style={{ margin: '4px 0 10px', paddingLeft: 22, lineHeight: 1.5 }}>
        {listBuf.map((t, i) => <li key={i} style={{ marginBottom: 3 }}>{inlineBold(t)}</li>)}
      </ul>,
    );
    listBuf = [];
  };

  const flushTable = () => {
    if (!tableBuf.length) return;
    const rows = tableBuf
      .filter((r) => !/^\|[\s:-]+\|/.test(r))
      .map((r) => r.replace(/^\|/, '').replace(/\|$/, '').split('|').map((c) => c.trim()));
    tableBuf = [];
    if (!rows.length) return;
    const head = rows[0];
    const body = rows.slice(1);
    nodes.push(
      <div key={`tbl-${nodes.length}`} style={{ overflowX: 'auto', margin: '8px 0 12px' }}>
        <table className="data" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ textAlign: 'left', color: 'var(--dim)', fontSize: 10 }}>
              {head.map((h, i) => (
                <th key={i} style={{ padding: '5px 10px', borderBottom: '1px solid var(--line,#333)' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((row, ri) => (
              <tr key={ri} style={{ borderTop: '1px solid var(--line,#333)' }}>
                {row.map((cell, ci) => (
                  <td key={ci} style={{ padding: '6px 10px', verticalAlign: 'top' }}>{inlineBold(cell)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>,
    );
  };

  lines.forEach((line, i) => {
    const t = line.trimEnd();
    if (/^\|/.test(t)) {
      flushList();
      tableBuf.push(t);
      return;
    }
    flushTable();
    if (/^#\s+/.test(t)) {
      flushList();
      nodes.push(
        <h2 key={i} style={{ fontSize: 16, margin: '10px 0 6px', fontWeight: 700 }}>
          {t.replace(/^#\s+/, '')}
        </h2>,
      );
      return;
    }
    if (/^##\s+/.test(t)) {
      flushList();
      nodes.push(
        <h3
          key={i}
          style={{
            fontSize: 12,
            margin: '14px 0 6px',
            letterSpacing: 0.4,
            color: 'var(--sec-2)',
            textTransform: 'uppercase',
          }}
        >
          {t.replace(/^##\s+/, '')}
        </h3>,
      );
      return;
    }
    if (/^[-*]\s+/.test(t) || /^\d+\.\s+/.test(t)) {
      listBuf.push(t.replace(/^[-*]\s+/, '').replace(/^\d+\.\s+/, ''));
      return;
    }
    flushList();
    if (!t.trim()) {
      nodes.push(<div key={i} style={{ height: 4 }} />);
      return;
    }
    nodes.push(
      <p key={i} style={{ margin: '0 0 7px', fontSize: 13, lineHeight: 1.55 }}>
        {inlineBold(t)}
      </p>,
    );
  });
  flushList();
  flushTable();
  return <div style={{ padding: '4px 16px 12px' }}>{nodes}</div>;
}

function DensityBar({ detail }) {
  if (!detail || detail.status !== 'complete') return null;
  const fin = detail.extracts?.financials?.length || 0;
  const risks = detail.extracts?.risks?.length || 0;
  const narr = detail.extracts?.narrative?.length || 0;
  const guide = detail.extracts?.guide?.length || 0;
  const src = detail.sources?.length || 0;
  const gaps = detail.gaps?.length || 0;
  const total = fin + risks + narr + guide;
  const cells = [
    { k: 'Claims', v: total },
    { k: 'Financials', v: fin },
    { k: 'Risks', v: risks },
    { k: 'Narrative', v: narr },
    { k: 'Guide', v: guide },
    { k: 'Sources', v: src },
    { k: 'Gaps', v: gaps },
  ];
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: `repeat(${cells.length}, minmax(0, 1fr))`,
        gap: 1,
        margin: '0 16px 10px',
        border: '1px solid var(--line,#333)',
        background: 'var(--line,#333)',
      }}
    >
      {cells.map((c) => (
        <div key={c.k} style={{ background: 'var(--panel, #1a1a1e)', padding: '8px 6px', textAlign: 'center' }}>
          <div style={{ fontSize: 16, fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{c.v}</div>
          <div className="dim" style={{ fontSize: 9, letterSpacing: 0.3, textTransform: 'uppercase', marginTop: 2 }}>
            {c.k}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHead({ n, title, count, sub }) {
  return (
    <div className="shd" style={{ marginTop: 4 }}>
      <span className="no">{n}</span>
      <h2>{title}{count != null ? ` · ${count}` : ''}</h2>
      {sub ? <span className="m">{sub}</span> : null}
    </div>
  );
}

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinResearch({ desk }) {
  const { slug, ticker, label } = desk;
  const [list, setList] = useState(null);
  const [runId, setRunId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [tab, setTab] = useState('all');
  const [job, setJob] = useState('deep_compile');
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [flash, setFlash] = useState(null);
  const [compareId, setCompareId] = useState('');
  const [compare, setCompare] = useState(null);
  const [pipe, setPipe] = useState(null);
  const [pipeBusy, setPipeBusy] = useState(false);
  const pollRef = useRef(null);

  const loadPipeline = useCallback((force) => {
    setPipeBusy(true);
    const req = force ? apiPost(`${slug}/pipeline/refresh`, {}) : api(`${slug}/pipeline`);
    return req
      .then(setPipe)
      .catch(() => setPipe(null))
      .finally(() => setPipeBusy(false));
  }, [slug]);

  useEffect(() => { loadPipeline(false); }, [loadPipeline]);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current.interval);
      if (pollRef.current.timeout) clearTimeout(pollRef.current.timeout);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const loadList = useCallback(() => {
    return api(`${slug}/research`)
      .then((payload) => {
        setList(payload);
        // Prefer newest complete run with the most claims (not a thin fixture / empty extract)
        setRunId((cur) => {
          if (cur) return cur;
          const runs = Array.isArray(payload.runs) ? payload.runs : [];
          const complete = runs
            .filter((r) => r.status === 'complete')
            .sort((a, b) => (b.n_claims || 0) - (a.n_claims || 0)
              || String(b.finished_at || '').localeCompare(String(a.finished_at || '')));
          return complete[0]?.run_id || runs[0]?.run_id || null;
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
    return () => stopPoll();
  }, [loadList, stopPoll]);

  useEffect(() => {
    stopPoll();
    setRunId(null);
    setDetail(null);
    setFlash(null);
    setCompare(null);
    setCompareId('');
    setTab('all');
  }, [slug, stopPoll]);

  useEffect(() => {
    if (runId) loadDetail(runId);
  }, [runId, loadDetail]);

  const startPoll = useCallback((baselineFp, expectRunId) => {
    stopPoll();
    setPolling(true);
    setFlash('Compiling… waiting for run to complete');

    const tick = async () => {
      try {
        if (expectRunId) {
          const row = await api(`${slug}/research/runs/${encodeURIComponent(expectRunId)}`);
          setDetail(row);
          if (row && (row.status === 'complete' || row.status === 'failed' || row.status === 'cancelled')) {
            stopPoll();
            setRunId(expectRunId);
            await loadList();
            setTab('all');
            setFlash(
              row.status === 'complete'
                ? `Run complete · ${row.run_id}`
                : `Run ${row.status} · ${expectRunId}`,
            );
            return;
          }
          return;
        }
        const payload = await api(`${slug}/research`);
        const fp = listFingerprint(payload);
        setList(payload);
        if (fp !== baselineFp) {
          stopPoll();
          setFlash('Research index updated');
        }
      } catch { /* keep polling */ }
    };

    const interval = setInterval(tick, POLL_MS);
    pollRef.current = { interval, timeout: null };
    setTimeout(tick, 400);
  }, [slug, stopPoll, loadList]);

  const isInFlight = (r) => r && (r.status === 'running' || r.status === 'queued') && !r.stalled;
  const isStalled = (r) => !!(r && r.stalled);

  const cancelRun = async (rid) => {
    if (!window.confirm(`Cancel run ${rid}?\n\nThis kills the worker if it is still alive. A late publish will be rejected.`)) return;
    try {
      const out = await apiPost(`${slug}/research/runs/${encodeURIComponent(rid)}/cancel`, {});
      if (out?.ok) { setFlash(`Run cancelled · ${rid}`); loadList(); } else setFlash(out?.error || 'cancel failed');
    } catch (e) { setFlash(e.message || String(e)); }
  };

  const retryRun = async (rid) => {
    if (!window.confirm(`Retry run ${rid}?\n\nSame run folder (acquired files kept). Starts a new worker.`)) return;
    try {
      const out = await apiPost(`${slug}/research/runs/${encodeURIComponent(rid)}/retry`, { launch: true });
      if (out?.ok) {
        setFlash(`Retry launched · ${rid}`);
        setRunId(rid);
        startPoll(listFingerprint(list), rid);
      } else setFlash(out?.error || 'retry failed');
    } catch (e) { setFlash(e.message || String(e)); }
  };

  const startCompile = async () => {
    const runs = list?.runs || [];
    const inFlight = runs.find((r) => isInFlight(r));
    if (inFlight) {
      setFlash(`Run already in flight for this desk (${inFlight.run_id}) — wait, or cancel it first.`);
      setRunId(inFlight.run_id);
      return;
    }
    const stalled = runs.find((r) => isStalled(r));
    if (stalled && window.confirm(
      `Run ${stalled.run_id} looks STALLED (running >15 min, nothing published).\n\nCancel it before starting fresh?`,
    )) {
      await apiPost(`${slug}/research/runs/${encodeURIComponent(stalled.run_id)}/cancel`, {});
      await loadList();
    }
    const latest = runs.find((r) => r.status === 'complete');
    if (latest?.finished_at) {
      const ageMs = Date.now() - new Date(latest.finished_at).getTime();
      if (Number.isFinite(ageMs) && ageMs < 24 * 60 * 60 * 1000) {
        const hours = Math.max(1, Math.round(ageMs / 3600000));
        if (!window.confirm(
          `Last complete run was ~${hours}h ago (${latest.n_claims || 0} claims).\n\nNew compile uses heavy compute. Prefer reopening an existing run when possible.\n\nStart a new compile anyway?`,
        )) {
          return;
        }
      } else if (!window.confirm(
        'New compile uses heavy compute and opens Grok.\n\nPrefer reopening a recent run when you only need to re-read.\n\nStart new compile?',
      )) {
        return;
      }
    } else if (!window.confirm(
      'New compile uses heavy compute and opens Grok to research public filings for this desk.\n\nStart?',
    )) {
      return;
    }

    setBusy(true);
    setFlash(null);
    try {
      const baselineFp = listFingerprint(list);
      const started = await apiPost(`${slug}/research/runs`, { job, launch: true });
      if (started?.already_in_flight && started.run_id) {
        setList(started);
        setRunId(started.run_id);
        setFlash(`Run already in flight (${started.run_id}) — did not start a second compile.`);
        startPoll(baselineFp, started.run_id);
        return;
      }
      if (!started?.ok || !started.run_id) {
        setFlash(started?.error || 'failed to start run');
        return;
      }
      const newId = started.run_id;
      setList(started);
      setRunId(newId);
      setFlash(`Pipeline launched · run ${newId}${started.spawned?.pid ? ` · pid ${started.spawned.pid}` : ''} · Terminal should show the live log`);
      startPoll(baselineFp, newId);
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
        action: 'research-compile',
        desk: slug,
        mode: 'chat',
        run_id: runId || undefined,
        job,
      });
      if (!out?.ok) setFlash(out?.error || 'open Grok failed');
      else setFlash(`Opened Grok · chat · ${out.initial_prompt || ''}`);
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadCompare = async () => {
    if (!compareId) return;
    try {
      const d = await api(`${slug}/research/runs/${encodeURIComponent(compareId)}`);
      setCompare(d);
    } catch {
      setCompare(null);
      setFlash('compare load failed');
    }
  };

  const runs = list?.runs || [];
  const empty = !list?.available || !runs.length;
  const primaryBusy = busy || polling;

  const counts = useMemo(() => {
    const fin = detail?.extracts?.financials?.length || 0;
    const risks = detail?.extracts?.risks?.length || 0;
    const narr = detail?.extracts?.narrative?.length || 0;
    const guide = detail?.extracts?.guide?.length || 0;
    const src = detail?.sources?.length || 0;
    const gaps = detail?.gaps?.length || 0;
    return { fin, risks, narr, guide, src, gaps, total: fin + risks + narr + guide };
  }, [detail]);

  const tabs = useMemo(() => ([
    { id: 'all', label: 'All', count: counts.total || null },
    { id: 'summary', label: 'Summary' },
    { id: 'financials', label: 'Financials', count: counts.fin },
    { id: 'risks', label: 'Risks', count: counts.risks },
    { id: 'narrative', label: 'Narrative', count: counts.narr },
    { id: 'guide', label: 'Guide', count: counts.guide },
    { id: 'sources', label: 'Sources', count: counts.src },
    { id: 'gaps', label: 'Gaps', count: counts.gaps },
    { id: 'promote', label: 'Promote' },
  ]), [counts]);

  if (!list) return <div className="crumb">LOADING…</div>;

  const showAll = tab === 'all';
  const show = (id) => showAll || tab === id;

  return (
    <div>
      <div className="crumb">
        {label} · RESEARCH · {empty ? <b>EMPTY</b> : <b>{runs.length} RUN{runs.length === 1 ? '' : 'S'}</b>}
        {list.n_complete != null && !empty ? ` · ${list.n_complete} COMPLETE` : ''}
        {detail?.status === 'complete' && counts.total > 0 ? (
          <span> · <b>{counts.total} CLAIMS</b> open</span>
        ) : null}
        {polling ? (
          <span style={{ color: 'var(--sec-2)', marginLeft: 6 }}> · <b>WAITING FOR RUN</b></span>
        ) : null}
      </div>

      <div className="sect" style={{ padding: '8px 16px 10px' }}>
        <div className="dim" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
          Saved <b>deep compiles</b> — pack-grounded claim notebook for this desk. Draft archive — <b>not</b> live pack/house.
          Prefer <b>reopening</b> a dense run instead of re-spending compute.
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <select
            value={job}
            onChange={(e) => setJob(e.target.value)}
            style={{ fontSize: 11, padding: '3px 6px' }}
            title="Compile job type"
          >
            <option value="deep_compile">Deep compile</option>
            <option value="print_package">Print package</option>
            <option value="pack_refresh">Pack refresh</option>
          </select>
          <button
            type="button"
            className="btn"
            disabled={primaryBusy}
            onClick={startCompile}
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            {polling ? 'WAITING…' : busy ? '…' : 'NEW COMPILE'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={openChat}
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            OPEN GROK
          </button>
          <button
            type="button"
            className="btn"
            onClick={() => loadList()}
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            REFRESH LIST
          </button>
          {polling && (
            <button
              type="button"
              className="btn"
              onClick={() => { stopPoll(); setFlash('Stopped waiting'); }}
              style={{ fontSize: 10, padding: '4px 10px', opacity: 0.85 }}
            >
              Cancel wait
            </button>
          )}
          {flash && <span className="dim" style={{ fontSize: 10 }}>{flash}</span>}
        </div>
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">▤</span>
          <h2>PIPELINE · SEC EDGAR</h2>
          <span className="m">
            stage 0+1 · resolve + filing watch · keyless · not pack SoR
            {pipe?.stale ? ' · CACHE STALE (EDGAR unreachable)' : ''}
          </span>
        </div>
        {!pipe ? (
          <div className="emptyD">{pipeBusy ? 'Resolving entity…' : 'Pipeline unavailable.'}</div>
        ) : !pipe.available ? (
          <div className="emptyD">{pipe.reason || 'Pipeline unavailable for this desk.'}</div>
        ) : (
          <div style={{ padding: '4px 16px 10px' }}>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', paddingBottom: 6 }}>
              <span className={`chipC${pipe.tier?.tier === 'A' ? ' ok' : pipe.tier?.tier === 'D' ? ' watch' : ''}`} title={(pipe.tier?.reasons || []).join(' · ')}>
                TIER {pipe.tier?.tier} · {pipe.tier?.label}
              </span>
              <span className="chipC mono">CIK {pipe.cik}</span>
              {pipe.entity?.fiscal_year_end && <span className="chipC">FYE {pipe.entity.fiscal_year_end}</span>}
              {pipe.entity?.sic_description && <span className="chipC" title={`SIC ${pipe.entity.sic}`}>{pipe.entity.sic_description}</span>}
              <button
                type="button"
                className="btn"
                disabled={pipeBusy}
                onClick={() => loadPipeline(true)}
                style={{ fontSize: 10, padding: '3px 9px' }}
                title="Force re-fetch from SEC EDGAR (60s cooldown)"
              >
                {pipeBusy ? '…' : 'REFRESH EDGAR'}
              </button>
            </div>
            <div className="dim" style={{ fontSize: 11, paddingBottom: 6 }}>
              {pipe.entity?.name} · {pipe.filings_total_recent} recent filings on file · fetched {String(pipe.fetched_at || '').slice(0, 16).replace('T', ' ')}Z
              {(pipe.tier?.reasons || []).length ? ` · ${pipe.tier.reasons[0]}` : ''}
            </div>
            {pipe.since_compile?.count > 0 ? (
              <>
                <div className="dim" style={{ fontSize: 11, paddingBottom: 4 }}>
                  <b>{pipe.since_compile.material_count}</b> material · {pipe.since_compile.routine_count} routine since book compile ({String(pipe.since_compile.baseline_compiled_at || '').slice(0, 10)})
                </div>
                {pipe.since_compile.material_count > 0 && (
                  <table className="data" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
                    <tbody>
                      {pipe.since_compile.material_items.slice(0, 8).map((f) => (
                        <tr key={f.accession}>
                          <td className="idc" style={{ whiteSpace: 'nowrap' }}><b>{f.form}</b></td>
                          <td className="idc mono" style={{ whiteSpace: 'nowrap' }}>{f.filed}</td>
                          <td>
                            <a href={f.url} target="_blank" rel="noopener noreferrer" style={{ color: 'inherit' }}>
                              {f.primary_doc_description || f.primary_document || f.accession}
                            </a>
                            {f.items ? <span className="dimmer mono" style={{ fontSize: 10, marginLeft: 6 }}>{f.items}</span> : null}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </>
            ) : pipe.since_compile?.count === 0 ? (
              <div className="dim" style={{ fontSize: 11 }}>Book current vs EDGAR — nothing filed since compile.</div>
            ) : (
              <div className="dim" style={{ fontSize: 11 }}>{pipe.since_compile?.note || 'No compile baseline.'}</div>
            )}
          </div>
        )}
      </div>

      {empty && (
        <div className="sect">
          <div className="emptyD" style={{ padding: '16px' }}>
            <div style={{ marginBottom: 8 }}>
              {list.reason || 'No research runs yet for this desk.'}
            </div>
            <div className="dim" style={{ fontSize: 11, lineHeight: 1.45 }}>
              Click <b>NEW COMPILE</b> — opens Grok to research public filings and write a saved run under
              the vault. You can reopen it anytime without re-running.
            </div>
          </div>
        </div>
      )}

      {!empty && (
        <div className="sect">
          <div className="shd">
            <span className="no">1</span>
            <h2>RUNS</h2>
            <span className="m">{ticker} · click densest complete run · newest first</span>
          </div>
          <div style={{ overflowX: 'auto' }}>
            <table className="data" style={{ width: '100%', fontSize: 12, borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ textAlign: 'left', color: 'var(--dim)', fontSize: 10 }}>
                  <th style={{ padding: '6px 12px' }}>When</th>
                  <th style={{ padding: '6px 12px' }}>Job</th>
                  <th style={{ padding: '6px 12px' }}>Status</th>
                  <th style={{ padding: '6px 12px' }}>Depth</th>
                  <th style={{ padding: '6px 12px' }}>Promoted</th>
                </tr>
              </thead>
              <tbody>
                {runs.map((r) => {
                  const thin = r.status === 'running'
                    || (r.status === 'complete' && !(r.n_claims > 0 || r.n_sources > 0));
                  return (
                    <tr
                      key={r.run_id}
                      style={{
                        borderTop: '1px solid var(--line, #333)',
                        cursor: 'pointer',
                        background: runId === r.run_id ? 'rgba(123,135,232,0.12)' : undefined,
                        opacity: thin && r.status !== 'complete' ? 0.75 : 1,
                      }}
                      onClick={() => { setRunId(r.run_id); setTab('all'); setCompare(null); }}
                    >
                      <td style={{ padding: '8px 12px' }} className="mono">
                        {String(r.finished_at || r.started_at || '').slice(0, 16).replace('T', ' ')}
                      </td>
                      <td style={{ padding: '8px 12px' }}>{r.label || r.job}</td>
                      <td style={{ padding: '8px 12px' }}>
                        <span
                          className={`chipC${r.status === 'complete' ? ' ok' : (r.status === 'failed' || isStalled(r)) ? ' watch' : ''}`}
                          title={isStalled(r) ? 'running >15 min with nothing published — the Grok session is probably dead' : undefined}
                        >
                          {isStalled(r) ? 'STALLED' : r.status}
                        </span>
                        {(r.status === 'running' || r.status === 'queued') && (
                          <button
                            type="button"
                            className="btn"
                            style={{ fontSize: 9, padding: '2px 7px', marginLeft: 6 }}
                            onClick={(e) => { e.stopPropagation(); cancelRun(r.run_id); }}
                            title="Cancel and kill the worker if it is still alive"
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
                            title="Retry this run_id (keeps acquired/ files)"
                          >
                            RETRY
                          </button>
                        )}
                      </td>
                      <td style={{ padding: '8px 12px' }} className="mono" title={r.run_id}>
                        {depthLabel(r)}
                      </td>
                      <td style={{ padding: '8px 12px' }} className="dim">{r.promoted ? 'yes' : 'no'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {runId && detail && (
        <div className="sect">
          <div className="shd">
            <span className="no">2</span>
            <h2>RUN NOTEBOOK</h2>
            <span className="m">{detail.run_id} · {detail.status}</span>
          </div>
          <div style={{ padding: '8px 16px', fontSize: 11 }} className="dim">
            {detail.job_label || detail.job}
            {detail.started_at ? ` · started ${String(detail.started_at).slice(0, 19)}` : ''}
            {detail.finished_at ? ` · finished ${String(detail.finished_at).slice(0, 19)}` : ''}
            {detail.compute?.note ? ` · ${detail.compute.note}` : ''}
            {detail.immutable ? ' · immutable' : ''}
          </div>

          {(detail.status === 'running' || detail.status === 'queued') && (
            <div className="emptyD" style={{ margin: '0 16px 8px', padding: '10px' }}>
              Run <b>{detail.status}</b>
              {detail.worker?.pid ? ` · pid ${detail.worker.pid}` : ''}
              {detail.stalled ? ' · STALLED' : ''}
              {detail.pid_alive === false && detail.worker?.pid ? ' · pid dead' : ''}
              — agent should publish extracts here.
              {detail.log_tail ? (
                <pre style={{
                  marginTop: 8, maxHeight: 180, overflow: 'auto', fontSize: 10,
                  whiteSpace: 'pre-wrap', textAlign: 'left',
                }}
                >
                  {detail.log_tail}
                </pre>
              ) : null}
            </div>
          )}
          {detail.error && (
            <div className="emptyD" style={{ margin: '0 16px 8px', padding: '10px', color: 'var(--fired, #c44)' }}>
              {detail.error}
            </div>
          )}

          {detail.status === 'complete' && counts.total === 0 && (
            <div className="emptyD" style={{ margin: '0 16px 8px', padding: '10px' }}>
              This complete run has <b>no extract claims</b> — thin fixture or failed publish.
              Open a denser run in the list above, or run <b>NEW COMPILE</b>.
            </div>
          )}

          <DensityBar detail={detail} />

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, padding: '0 16px 10px' }}>
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                className="btn"
                onClick={() => setTab(t.id)}
                style={{
                  fontSize: 10,
                  padding: '3px 8px',
                  opacity: tab === t.id ? 1 : 0.7,
                  fontWeight: tab === t.id ? 700 : 400,
                }}
              >
                {t.label}{t.count != null && t.count > 0 ? ` (${t.count})` : ''}
              </button>
            ))}
          </div>

          {show('summary') && (
            <>
              {showAll && <SectionHead n="A" title="SUMMARY" sub="pack-grounded narrative" />}
              <SummaryBody text={detail.summary} />
            </>
          )}

          {show('financials') && (
            <>
              {showAll && <SectionHead n="B" title="FINANCIALS" count={counts.fin} sub="pack actuals / guide lines" />}
              {claimNotebook(detail.extracts?.financials, 'No financial claims in this run.')}
            </>
          )}

          {show('risks') && (
            <>
              {showAll && <SectionHead n="C" title="RISKS" count={counts.risks} sub="register English + drivers" />}
              {claimNotebook(detail.extracts?.risks, 'No risk claims in this run.')}
            </>
          )}

          {show('narrative') && (
            <>
              {showAll && <SectionHead n="D" title="NARRATIVE" count={counts.narr} sub="what the company is / setup" />}
              {claimNotebook(detail.extracts?.narrative, 'No narrative claims in this run.')}
            </>
          )}

          {show('guide') && (
            <>
              {showAll && <SectionHead n="E" title="GUIDE" count={counts.guide} sub="outlook lines" />}
              {claimNotebook(detail.extracts?.guide, 'No guide claims in this run.')}
            </>
          )}

          {show('sources') && (
            <>
              {showAll && <SectionHead n="F" title="SOURCES" count={counts.src} />}
              <ul style={{ margin: 0, padding: '6px 16px 12px 28px', fontSize: 12, lineHeight: 1.55 }}>
                {(detail.sources || []).length === 0 && <li className="dim">No sources in this run.</li>}
                {(detail.sources || []).map((s) => (
                  <li key={s.id || s.title} style={{ marginBottom: 4 }}>
                    <b>{s.title}</b>
                    {s.kind ? ` · ${s.kind}` : ''}
                    {s.as_of ? ` · ${s.as_of}` : ''}
                    {s.grade_hint ? ` · [${s.grade_hint}]` : ''}
                    {s.url && (
                      <>
                        {' · '}
                        <a href={s.url} target="_blank" rel="noreferrer">link</a>
                      </>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}

          {show('gaps') && (
            <>
              {showAll && <SectionHead n="G" title="GAPS" count={counts.gaps} sub="what this compile is not" />}
              <ul style={{ margin: 0, padding: '6px 16px 12px 28px', fontSize: 12, lineHeight: 1.55 }}>
                {(detail.gaps || []).length === 0 && <li className="dim">No gaps listed.</li>}
                {(detail.gaps || []).map((g) => (
                  <li key={g} className="dim" style={{ marginBottom: 4 }}>{g}</li>
                ))}
              </ul>
            </>
          )}

          {tab === 'promote' && (
            <div style={{ padding: '8px 16px 16px', fontSize: 12, lineHeight: 1.55 }}>
              <p className="dim" style={{ marginTop: 0 }}>
                This run is a <b>draft archive</b>. Promotion is human-gated — nothing auto-writes house or risks.
              </p>
              <ul style={{ paddingLeft: 18 }}>
                <li>
                  <b>Pack claims / sources</b> — ask agent (OPEN GROK) to promote graded lines into entity/sources,
                  then glass <b>COMPILE BOOK</b> · verify exit 0
                </li>
                <li>
                  <b>House</b> — propose only → glass ACCEPT
                </li>
                <li>
                  <b>Risks</b> — propose add/status/tripwires → glass ACCEPT
                </li>
                <li>
                  <b>Model pack layers</b> — optional pack_actual/guide refresh; never overwrite locked YOUR CASE
                </li>
              </ul>
              <button
                type="button"
                className="btn"
                disabled={busy || detail.status !== 'complete'}
                onClick={openChat}
                style={{ fontSize: 10, padding: '4px 10px', marginTop: 8 }}
              >
                OPEN GROK · DISCUSS PROMOTE
              </button>
              <div style={{ marginTop: 14 }}>
                <div className="dim" style={{ fontSize: 10, marginBottom: 4 }}>Compare to another run</div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                  <select
                    value={compareId}
                    onChange={(e) => setCompareId(e.target.value)}
                    style={{ fontSize: 11, maxWidth: 280 }}
                  >
                    <option value="">— select run —</option>
                    {runs.filter((r) => r.run_id !== runId).map((r) => (
                      <option key={r.run_id} value={r.run_id}>
                        {r.run_id} · {r.n_claims || 0} claims · {r.status}
                      </option>
                    ))}
                  </select>
                  <button type="button" className="btn" onClick={loadCompare} style={{ fontSize: 10, padding: '3px 8px' }}>
                    COMPARE
                  </button>
                </div>
                {compare?.available && (
                  <div style={{ marginTop: 10, border: '1px solid var(--line,#333)', padding: 10 }}>
                    <div style={{ fontWeight: 700, marginBottom: 6 }}>
                      vs {compare.run_id}
                    </div>
                    <div className="mono" style={{ fontSize: 11 }}>
                      sources: {(detail.sources || []).length} vs {(compare.sources || []).length}
                      {' · '}
                      financials: {(detail.extracts?.financials || []).length} vs {(compare.extracts?.financials || []).length}
                      {' · '}
                      risks: {(detail.extracts?.risks || []).length} vs {(compare.extracts?.risks || []).length}
                      {' · '}
                      narrative: {(detail.extracts?.narrative || []).length} vs {(compare.extracts?.narrative || []).length}
                      {' · '}
                      gaps: {(detail.gaps || []).length} vs {(compare.gaps || []).length}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
