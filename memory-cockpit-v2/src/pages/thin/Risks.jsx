// Shared thin risk register + pending risk proposals (status + add_risk).
import React, { useEffect, useState, useCallback } from 'react';
import { api, apiPost } from '../../api.js';
import GrokAgents from './GrokAgents.jsx';

const rank = (s) => (s === 'FIRED' ? 0 : s === 'WATCH' ? 1 : 2);

/** Strip light markdown so table cells stay readable. */
function plainText(s) {
  if (!s) return '';
  return String(s)
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
    .trim();
}

function kindLabel(kind) {
  if (kind === 'add_risk') return 'ADD';
  if (kind === 'set_tripwires') return 'TRIPWIRES';
  if (kind === 'status_change') return 'STATUS';
  return String(kind || 'EDIT').toUpperCase();
}

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinRisks({ desk }) {
  const { slug, label } = desk;
  const [d, setD] = useState(null);
  const [pending, setPending] = useState([]);
  const [busy, setBusy] = useState(false);
  const [banner, setBanner] = useState(null);
  const [activeProposal, setActiveProposal] = useState(null);
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(() => {
    api(`${slug}/risks`).then(setD).catch(() => setD({ available: false, risks: [] }));
  }, [slug]);

  const loadPending = useCallback(() => {
    api(`${slug}/risks/proposals?status=pending`)
      .then((p) => setPending(p?.proposals || []))
      .catch(() => setPending([]));
  }, [slug]);

  useEffect(() => {
    setActiveProposal(null);
    setShowRaw(false);
    load();
    loadPending();
  }, [load, loadPending]);

  const btnSm = { padding: '3px 8px', fontSize: 10 };

  function pendingSummary(p) {
    if (p.kind === 'add_risk') {
      const bits = [p.risk_name || p.title || 'New risk', p.to_status || 'WATCH'];
      if (p.grade && p.grade !== '—') bits.push(`[${p.grade}]`);
      return bits.filter(Boolean).join(' · ');
    }
    if (p.kind === 'set_tripwires') {
      const nTw = p.tripwire_count ?? (p.tripwires || []).length;
      return `${p.risk_name || 'Risk'} · ${nTw} monitors`;
    }
    return `${p.risk_name || 'Risk'} · ${(p.from_status || '?')} → ${p.to_status || '?'}`;
  }

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

  async function acceptProposal(pid) {
    if (busy || !pid) return;
    setBusy(true);
    setBanner(null);
    try {
      const out = await apiPost(`${slug}/risks/proposals/${encodeURIComponent(pid)}/accept`);
      if (!out?.ok) {
        setBanner(out?.error || 'accept failed');
      } else {
        let note = out.proposal?.kind === 'add_risk' ? 'Accepted new risk' : 'Accepted';
        try {
          const c = await apiPost(`${slug}/compile`);
          if (!c?.ok && !c?.busy) note += ' · compile failed — use COMPILE BOOK';
          else if (c?.busy) note += ' · compile running';
          else note += ' · pack synced';
          try { await apiPost(`${slug}/book/refresh`); } catch { /* ok */ }
        } catch {
          note += ' · compile failed — use COMPILE BOOK';
        }
        setBanner(note);
        setActiveProposal(null);
        setShowRaw(false);
        setPending((prev) => prev.filter((p) => p.id !== pid));
        await loadPending();
        load();
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
        setBanner(null);
        await loadPending();
      }
    } catch (e) {
      setBanner(e.message || 'reject failed');
    } finally {
      setBusy(false);
    }
  }

  if (!d) return <div className="crumb">LOADING…</div>;

  if (!d.available) {
    return (
      <div>
        <div className="crumb">{label} · RISKS · <b>EMPTY</b></div>
        <div className="emptyD">{d.reason || 'Pack unavailable.'}</div>
      </div>
    );
  }

  const risks = [...(d.risks || [])].sort(
    (a, b) => rank(a.status) - rank(b.status) || a.order - b.order,
  );
  const n = (s) => risks.filter((r) => r.status === s).length;

  // Stable order: adds, status, tripwires (same kinds as before)
  const orderedPending = [
    ...pending.filter((p) => p.kind === 'add_risk'),
    ...pending.filter((p) => p.kind === 'status_change'),
    ...pending.filter((p) => p.kind === 'set_tripwires'),
    ...pending.filter((p) => !['add_risk', 'status_change', 'set_tripwires'].includes(p.kind)),
  ];

  return (
    <div>
      <div className="crumb">
        {label} · RISKS · <b>{risks.length}</b>
        {' '}· {n('WATCH')} WATCH · {n('FIRED')} FIRED · {n('INTACT')} INTACT
        {d.sor_ahead_of_pack ? ' · SoR ahead' : ''}
        {pending.length ? ` · ${pending.length} pending` : ''}
      </div>

      {banner && (
        <div style={{ padding: '6px 0 0', fontSize: 11, color: 'var(--ok, #5cba8a)' }}>
          {banner}
        </div>
      )}

      {(pending.length > 0 || activeProposal) && (
        <div className="sect">
          <div className="shd">
            <span className="no">P</span>
            <h2>PENDING</h2>
            <span className="m">{activeProposal ? 'review' : pending.length}</span>
          </div>
          <div style={{ padding: '8px 16px 12px' }}>
            {pending.length > 0 && !activeProposal && orderedPending.map((p) => (
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
                <span className="dim" style={{ fontSize: 9 }}>{kindLabel(p.kind)}</span>
                <span style={{ flex: 1, minWidth: 120 }}>{pendingSummary(p)}</span>
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
                  <span className="dim" style={{ fontSize: 9 }}>{kindLabel(activeProposal.kind)}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                    {activeProposal.review?.title || pendingSummary(activeProposal)}
                  </span>
                </div>
                {activeProposal.review?.rationale || activeProposal.rationale ? (
                  <div className="house-review-lede">
                    {activeProposal.review?.rationale || activeProposal.rationale}
                  </div>
                ) : null}
                {activeProposal.review?.unchanged ? (
                  <div className="dim" style={{ fontSize: 12, margin: '0 0 10px' }}>
                    Status unchanged. Nothing to apply unless you still want ACCEPT.
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
                    title={activeProposal.id}
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
        </div>
      )}

      <div className="sect">
        <div className="shd">
          <span className="no">§</span>
          <h2>RISK REGISTER</h2>
        </div>
        <div style={{ padding: '4px 16px 8px' }}>
          <GrokAgents
            variant="register"
            desk={slug}
            compact
            onFlash={(msg) => setBanner(msg || null)}
          />
        </div>
        <table>
          <thead>
            <tr>
              <th>Risk</th>
              <th>Summary</th>
              <th>Status</th>
              <th>Grade</th>
              <th>Trips</th>
              <th>As-of</th>
            </tr>
          </thead>
          <tbody>
            {risks.map((r) => (
              <tr
                key={r.id}
                className="goto"
                onClick={() => { window.location.hash = `#/${slug}/risk/${encodeURIComponent(r.id)}`; }}
              >
                <td style={{ width: '32%' }}>
                  <span className={`sig ${r.status}`}></span>
                  <b style={{ marginLeft: 6 }}>{r.name}</b>
                </td>
                <td className="dim" style={{ width: '36%' }}>{plainText(r.summary) || '—'}</td>
                <td className="idc" style={{ width: '10%' }}>{r.status}</td>
                <td className="idc" style={{ width: '8%' }}>{r.grade || '—'}</td>
                <td className="idc" style={{ width: '6%' }}>{r.tripwire_count ?? '—'}</td>
                <td className="dim mono" style={{ width: '8%' }}>
                  {r.updated ? String(r.updated).slice(5) : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
