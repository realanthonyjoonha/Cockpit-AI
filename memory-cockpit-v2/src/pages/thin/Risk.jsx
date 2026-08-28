// Shared thin risk detail + status propose/ACCEPT (Path 1 risk operate).
// SoR write only on ACCEPT; then COMPILE BOOK. Decision-support only.
import React, { useEffect, useState, useCallback } from 'react';
import { api, apiPost } from '../../api.js';
import GrokAgents from './GrokAgents.jsx';

const STATUSES = ['INTACT', 'WATCH', 'FIRED'];

/** @param {{ desk: { slug: string, ticker: string, label: string }, id: string }} props */
export default function ThinRisk({ desk, id }) {
  const { slug, ticker, label } = desk;
  const [r, setR] = useState(null);
  const [missing, setMissing] = useState(false);
  const [pending, setPending] = useState([]);
  const [toStatus, setToStatus] = useState('WATCH');
  const [rationale, setRationale] = useState('');
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const [activeProposal, setActiveProposal] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  const loadRisk = useCallback(() => {
    setR(null);
    setMissing(false);
    return api(`${slug}/risk/${encodeURIComponent(id)}`)
      .then((data) => {
        setR(data);
        if (data?.status && STATUSES.includes(data.status)) {
          // default propose target: nudge toward WATCH if intact, else keep peer options
          setToStatus(data.status === 'INTACT' ? 'WATCH' : data.status === 'WATCH' ? 'FIRED' : 'WATCH');
        }
        return data;
      })
      .catch(() => {
        setMissing(true);
        return null;
      });
  }, [slug, id]);

  const matchesThisRisk = useCallback((p) => {
    if (!p) return false;
    const rid = r?.id || id;
    if (p.risk_id && rid && String(p.risk_id) === String(rid)) return true;
    if (p.risk_id && id && String(p.risk_id) === String(id)) return true;
    if (r?.name && p.risk_name && p.risk_name === r.name) return true;
    // R-number from pack id (nbis-r3-…) or route id
    const m = String(rid || id || '').match(/-r(\d+)-/i);
    if (m && p.risk_name && new RegExp(`^R${m[1]}\\b`, 'i').test(p.risk_name)) return true;
    const mName = String(r?.name || '').match(/^R(\d+)\b/i);
    if (mName && p.risk_name && new RegExp(`^R${mName[1]}\\b`, 'i').test(p.risk_name)) return true;
    return false;
  }, [r?.id, r?.name, id]);

  const loadPending = useCallback(() => {
    return api(`${slug}/risks/proposals?status=pending`)
      .then((d) => {
        const all = d?.proposals || [];
        setPending(all.filter(matchesThisRisk));
      })
      .catch(() => { /* keep optimistic rows if reload fails */ });
  }, [slug, matchesThisRisk]);

  useEffect(() => {
    setActiveProposal(null);
    setShowRaw(false);
    loadRisk();
  }, [loadRisk]);
  useEffect(() => { if (r) loadPending(); }, [r, loadPending]);

  const btnSm = { padding: '3px 8px', fontSize: 10 };

  async function openProposal(pid) {
    if (busy || !pid) return;
    setBusy(true);
    setBanner(null);
    try {
      const out = await api(`${slug}/risks/proposals/${encodeURIComponent(pid)}`);
      if (!out?.proposal) {
        setBanner(out?.error || 'proposal not found');
        return;
      }
      setShowRaw(false);
      setActiveProposal(out.proposal);
    } catch (e) {
      setBanner(e.message || 'load failed');
    } finally {
      setBusy(false);
    }
  }

  async function proposeStatus() {
    if (busy || !r) return;
    if (toStatus === r.status) {
      setBanner('Pick a different status');
      return;
    }
    setBusy(true);
    setBanner(null);
    try {
      const out = await apiPost(`${slug}/risks/proposals`, {
        kind: 'status_change',
        risk_id: r.id || id,
        risk_name: r.name,
        from_status: r.status,
        to_status: toStatus,
        rationale: rationale || undefined,
        source: 'glass',
      });
      if (!out?.ok) {
        setBanner(out?.error || 'propose failed');
      } else {
        const p = out.proposal || {};
        // Optimistic row so ACCEPT is always visible even if list reload lags
        const row = {
          id: p.id,
          kind: p.kind || 'status_change',
          risk_id: r.id || id,
          risk_name: r.name,
          from_status: p.from_status || r.status,
          to_status: p.to_status || toStatus,
          rationale: rationale || p.rationale || undefined,
          status: 'pending',
        };
        if (row.id) {
          setPending((prev) => (prev.some((x) => x.id === row.id) ? prev : [...prev, row]));
        }
        // PENDING row is the feedback — no duplicate banner
        setBanner(null);
        setRationale('');
        await loadPending();
      }
    } catch (e) {
      setBanner(e.message || 'propose failed');
    } finally {
      setBusy(false);
    }
  }

  async function acceptProposal(pid) {
    if (busy || !pid) return;
    setBusy(true);
    setBanner(null);
    try {
      const out = await apiPost(`${slug}/risks/proposals/${encodeURIComponent(pid)}/accept`);
      if (!out?.ok) {
        setBanner(out?.error || 'accept failed');
      } else {
        let note = `Accepted → ${out.proposal?.to_status || 'status'}`;
        try {
          const c = await apiPost(`${slug}/compile`);
          if (c?.busy) note += ' · compile running';
          else if (!c?.ok) note += ` · compile failed — use COMPILE BOOK`;
          else note += ' · pack synced';
          try { await apiPost(`${slug}/book/refresh`); } catch { /* optional */ }
        } catch {
          note += ' · compile failed — use COMPILE BOOK';
        }
        setBanner(note);
        setActiveProposal(null);
        setShowRaw(false);
        setPending((prev) => prev.filter((p) => p.id !== pid));
        await loadPending();
        await loadRisk();
      }
    } catch (e) {
      setBanner(e.message || 'accept failed');
    } finally {
      setBusy(false);
    }
  }

  async function rejectProposal(pid) {
    if (busy || !pid) return;
    setBusy(true);
    setBanner(null);
    try {
      const out = await apiPost(`${slug}/risks/proposals/${encodeURIComponent(pid)}/reject`);
      if (!out?.ok) setBanner(out?.error || 'reject failed');
      else {
        setPending((prev) => prev.filter((p) => p.id !== pid));
        if (activeProposal?.id === pid) {
          setActiveProposal(null);
          setShowRaw(false);
        }
        setBanner('Rejected');
        await loadPending();
      }
    } catch (e) {
      setBanner(e.message || 'reject failed');
    } finally {
      setBusy(false);
    }
  }

  if (missing) {
    return (
      <div>
        <div className="crumb">
          <span className="lnk" onClick={() => { window.location.hash = `#/${slug}/risks`; }}>RISKS</span>
          {' / '}<b>NOT FOUND</b>
        </div>
        <div className="emptyD">
          No risk <span className="mono">{id}</span> in {ticker} pack. Back to register — we do not invent risks.
        </div>
      </div>
    );
  }
  if (!r) return <div className="crumb">LOADING…</div>;

  const statusCls = r.status === 'WATCH' ? 'watch' : r.status === 'FIRED' ? 'fired' : 'ok';

  return (
    <div>
      <div className="crumb">
        <span className="lnk" onClick={() => { window.location.hash = `#/${slug}/risks`; }}>{label} RISKS</span>
        {' / '}<b>{r.name}</b>
        {r.updated ? ` · ${r.updated}` : ''}
        {r.compiled_at ? ` · PACK ${String(r.compiled_at).slice(0, 10)}` : ''}
      </div>

      <div className="sect">
        <div className="rdhead">
          <h1 style={{ fontSize: 18 }}>{r.name}</h1>
          <div className="chips">
            <span className={`chipC ${statusCls}`}>{r.status}</span>
            {r.grade && r.grade !== '—' && <span className="chipC">[{r.grade}]</span>}
            {r.status_source === 'sor' && (
              <span className="chipC" title="SoR ahead of pack — compile to sync store">
                SoR
              </span>
            )}
          </div>
        </div>
        {r.note && (
          <div className="dim" style={{ padding: '0 16px 8px', fontSize: 10 }}>{r.note}</div>
        )}
        {r.summary && (
          <div className="prose"><p>{String(r.summary).replace(/\*\*([^*]+)\*\*/g, '$1').replace(/\*([^*]+)\*/g, '$1')}</p></div>
        )}
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">A</span>
          <h2>TRIPWIRES</h2>
          <span className="m">{r.tripwires?.length || 0}</span>
        </div>
        {!r.tripwires?.length ? (
          <div className="emptyD">None yet — use Risk tripwires agent.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Signal</th>
                <th>Tripwire</th>
                <th>State / note</th>
                <th>As-of</th>
              </tr>
            </thead>
            <tbody>
              {r.tripwires.map((t, i) => (
                <tr key={i}>
                  <td style={{ width: '20%' }}><b>{t.signal || '—'}</b></td>
                  <td className="dim" style={{ width: '30%' }}>{t.tripwire || '—'}</td>
                  <td style={{ width: '38%', fontSize: 11 }}>{t.state || '—'}</td>
                  <td className="dim mono" style={{ width: '12%' }}>{t.as_of || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">B</span>
          <h2>DUE DILIGENCE</h2>
        </div>
        <div style={{ padding: '8px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <GrokAgents
            variant="risk"
            desk={slug}
            riskId={r.id || id}
            riskName={r.name}
            tripwireCount={r.tripwires?.length ?? 0}
            compact
            onFlash={(msg) => setBanner(msg || null)}
          />
        </div>
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">C</span>
          <h2>PROPOSE STATUS</h2>
          {pending.length > 0 && <span className="m">{pending.length} pending</span>}
        </div>
        {banner && (
          <div style={{ padding: '6px 16px 0', fontSize: 11, color: 'var(--ok, #5cba8a)' }}>
            {banner}
          </div>
        )}
        <div style={{ padding: '8px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <span className="dim" style={{ fontSize: 10 }}><b>{r.status}</b> →</span>
          <select
            value={toStatus}
            onChange={(e) => setToStatus(e.target.value)}
            disabled={busy}
            style={{
              fontSize: 11,
              padding: '3px 6px',
              background: 'var(--panel, #141820)',
              color: 'var(--text, #D7DCE6)',
              border: '1px solid var(--line, #2a3140)',
              borderRadius: 4,
            }}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
          <input
            type="text"
            placeholder="Rationale"
            value={rationale}
            onChange={(e) => setRationale(e.target.value)}
            disabled={busy}
            style={{
              width: 220,
              maxWidth: '100%',
              fontSize: 11,
              padding: '4px 8px',
              background: 'var(--panel, #141820)',
              color: 'var(--text, #D7DCE6)',
              border: '1px solid var(--line, #2a3140)',
              borderRadius: 4,
            }}
          />
          <button
            type="button"
            className="desk-btn on"
            disabled={busy || toStatus === r.status}
            onClick={proposeStatus}
            style={{ padding: '4px 10px', fontSize: 10 }}
          >
            {busy ? '…' : 'PROPOSE'}
          </button>
        </div>

        {(pending.length > 0 || activeProposal) && (
          <div style={{ padding: '0 16px 12px' }}>
            {pending.length > 0 && !activeProposal && pending.map((p) => (
              <div
                key={p.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 8,
                  alignItems: 'center',
                  marginBottom: 6,
                  fontSize: 11,
                }}
              >
                <span className="dim" style={{ fontSize: 9, letterSpacing: 0.3 }}>PENDING</span>
                <span>
                  {(p.from_status || '?')} → <b>{p.to_status || '?'}</b>
                </span>
                {p.rationale && <span className="dim">{p.rationale.slice(0, 60)}</span>}
                <button
                  type="button"
                  className="desk-btn on"
                  disabled={busy}
                  onClick={() => openProposal(p.id)}
                  style={btnSm}
                  title={p.id}
                >
                  REVIEW
                </button>
                <button
                  type="button"
                  className="desk-btn"
                  disabled={busy}
                  onClick={() => rejectProposal(p.id)}
                  style={btnSm}
                  title={p.id}
                >
                  REJECT
                </button>
              </div>
            ))}
            {activeProposal && (
              <div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'baseline', marginBottom: 8 }}>
                  <span className="dim" style={{ fontSize: 9, letterSpacing: 0.3 }}>REVIEW</span>
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                    {activeProposal.review?.title
                      || `${activeProposal.from_status || '?'} → ${activeProposal.to_status || '?'}`}
                  </span>
                </div>
                {(activeProposal.review?.rationale || activeProposal.rationale) ? (
                  <div className="house-review-lede">
                    {activeProposal.review?.rationale || activeProposal.rationale}
                  </div>
                ) : null}
                {Array.isArray(activeProposal.review?.fields) && activeProposal.review.fields.length > 0 && (
                  <div className="house-changes">
                    <div className="house-changes-k">WHAT CHANGES</div>
                    {activeProposal.review.fields.map((f) => (
                      <div key={f.key} className="house-change-row">
                        <div className="k">{String(f.key).toUpperCase()}</div>
                        <div className="from">{f.from}</div>
                        <div className="arrow">→</div>
                        <div className="to">{f.to}</div>
                      </div>
                    ))}
                  </div>
                )}
                {Array.isArray(activeProposal.review?.blocks) && activeProposal.review.blocks.map((b) => (
                  <div key={b.k} className="house-review-prose">
                    <div className="house-changes-k">{b.k}</div>
                    <div style={{ fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>{b.text}</div>
                  </div>
                ))}
                {Array.isArray(activeProposal.review?.tripwires) && activeProposal.review.tripwires.length > 0 && (
                  <div className="house-diff">
                    <div className="house-changes-k">MONITORS</div>
                    {activeProposal.review.tripwires.map((row, i) => (
                      <div key={`${row.t}-${i}`} className={`house-diff-line ${row.t}`}>
                        <span className="mark">{row.t === 'add' ? '+' : row.t === 'del' ? '−' : ' '}</span>
                        <span>{row.s}</span>
                      </div>
                    ))}
                  </div>
                )}
                {showRaw && activeProposal.section_markdown ? (
                  <pre className="house-review-raw">{activeProposal.section_markdown}</pre>
                ) : null}
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
                  <button
                    type="button"
                    className="desk-btn on"
                    disabled={busy}
                    onClick={() => acceptProposal(activeProposal.id)}
                    style={btnSm}
                  >
                    {busy ? '…' : 'ACCEPT'}
                  </button>
                  <button
                    type="button"
                    className="desk-btn"
                    disabled={busy}
                    onClick={() => rejectProposal(activeProposal.id)}
                    style={btnSm}
                  >
                    REJECT
                  </button>
                  <button
                    type="button"
                    className="desk-btn"
                    disabled={busy}
                    onClick={() => { setShowRaw(false); setActiveProposal(null); }}
                    style={btnSm}
                  >
                    BACK
                  </button>
                  {activeProposal.section_markdown ? (
                    <button
                      type="button"
                      className="desk-btn"
                      disabled={busy}
                      onClick={() => setShowRaw((v) => !v)}
                      style={btnSm}
                    >
                      {showRaw ? 'Hide raw' : 'Raw markdown'}
                    </button>
                  ) : null}
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {!!r.series?.length && (
        <div className="sect">
          <div className="shd"><span className="no">D</span><h2>SERIES</h2></div>
          <div className="dim" style={{ padding: '8px 16px 12px', fontSize: 11 }}>
            {r.series.join(', ')}
          </div>
        </div>
      )}
    </div>
  );
}
