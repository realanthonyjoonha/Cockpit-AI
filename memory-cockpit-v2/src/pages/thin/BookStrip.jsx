// Shared book strip — COMPILE BOOK + REFRESH for any thin desk (parity v1.1).
import React, { useEffect, useState, useCallback } from 'react';
import { api, apiPost } from '../../api.js';
import GrokAgents from './GrokAgents.jsx';

function fmtCompiled(iso) {
  if (!iso) return '—';
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return String(iso).slice(0, 19);
    return d.toISOString().slice(0, 16).replace('T', ' ') + 'Z';
  } catch {
    return String(iso).slice(0, 19);
  }
}

/**
 * @param {{ desk: string, ticker: string, compact?: boolean, onRefreshed?: function, onCompiled?: function }} props
 * desk = API slug (nbis | msft)
 */
export default function BookStrip({
  desk,
  ticker,
  compact = false,
  onRefreshed,
  onCompiled,
}) {
  const [b, setB] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const base = String(desk || '').replace(/^\/+|\/+$/g, '');

  const load = useCallback(() => {
    api(`${base}/book`).then(setB).catch(() => setB({ available: false, reason: 'request failed' }));
  }, [base]);

  useEffect(() => { load(); }, [load]);

  const refresh = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const out = await apiPost(`${base}/book/refresh`);
      setB(out);
      setFlash(out.refreshed ? `Re-read pack · ${fmtCompiled(out.compiled_at)}` : (out.note || 'refreshed'));
      if (typeof onRefreshed === 'function') onRefreshed(out);
    } catch (e) {
      setFlash(e.message || 'refresh failed');
    }
    setBusy(false);
  }, [busy, base, onRefreshed]);

  const compile = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFlash('Compiling pack…');
    try {
      const out = await apiPost(`${base}/compile`);
      if (out.busy) {
        setFlash(out.error || 'compile already running');
      } else if (!out.ok) {
        setFlash(`Compile failed: ${out.error || 'unknown'}`);
      } else {
        const book = out.book
          ? {
            available: true,
            compiled_at: out.compiled_at,
            claims_count: out.book.claims_count,
            sources_count: out.book.sources_count,
            risks: out.book.risks,
            house: out.book.house,
            ticker: ticker || out.ticker,
          }
          : await api(`${base}/book`);
        setB((prev) => ({ ...(prev || {}), ...book, available: true }));
        setFlash(`Compiled · pack ${fmtCompiled(out.compiled_at)} · claims ${out.book?.claims_count ?? '—'}`);
        if (typeof onCompiled === 'function') onCompiled(out);
        if (typeof onRefreshed === 'function') onRefreshed(out);
      }
    } catch (e) {
      setFlash(e.message || 'compile failed');
    }
    setBusy(false);
  }, [busy, base, ticker, onCompiled, onRefreshed]);

  const btnStyle = { padding: compact ? '3px 8px' : '4px 10px', fontSize: 10 };
  const t = ticker || 'TICKER';

  if (!b) {
    return <div className="crumb">BOOK · LOADING…</div>;
  }

  const compileBtn = (
    <button
      type="button"
      className="desk-btn on"
      onClick={compile}
      disabled={busy}
      title={`Run ontology compile for ${t} (same as ./ont compile ${t})`}
      style={btnStyle}
    >
      {busy ? '…' : 'COMPILE BOOK'}
    </button>
  );
  const refreshBtn = (
    <button
      type="button"
      className="desk-btn"
      onClick={refresh}
      disabled={busy}
      title="Re-read pack from disk only (does not compile)"
      style={btnStyle}
    >
      REFRESH
    </button>
  );
  const grokMenu = (
    <GrokAgents
      desk={base}
      compact={compact}
      onFlash={(msg) => setFlash(msg || null)}
    />
  );

  if (!b.available) {
    return (
      <div className="crumb" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span>
          BOOK · <b>PACK UNAVAILABLE</b>
          {b.reason ? ` · ${b.reason}` : ''}
        </span>
        {compileBtn}
        {refreshBtn}
        {grokMenu}
        {flash && <span className="dimmer" style={{ fontSize: 10 }}>{flash}</span>}
      </div>
    );
  }

  const st = b.house?.status === 'CONFIRMED' ? 'ok' : 'watch';

  if (compact) {
    return (
      <div className="crumb" style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span>
          BOOK · PACK <b>{fmtCompiled(b.compiled_at)}</b>
          {' · '}{b.risks?.count ?? 0} RISKS · {b.risks?.watch ?? 0} WATCH
          {b.house?.status ? ` · ${b.house.status}` : ''}
        </span>
        {compileBtn}
        {refreshBtn}
        {grokMenu}
        {flash && <span className="dimmer" style={{ fontSize: 10 }}>{flash}</span>}
      </div>
    );
  }

  return (
    <div className="sect" style={{ marginBottom: 0 }}>
      <div className="shd">
        <span className="no">▣</span>
        <h2>BOOK STATUS</h2>
        <span className="m">compiled pack · decision-support only</span>
      </div>
      <div style={{ padding: '8px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span className="chipC">PACK {fmtCompiled(b.compiled_at)}</span>
        {b.house?.status && (
          <span className={`chipC ${st}`}>
            HOUSE {b.house.status}{b.house.date ? ` · ${b.house.date}` : ''}
          </span>
        )}
        <span className="chipC">
          RISKS {b.risks?.count ?? 0} · WATCH {b.risks?.watch ?? 0} · FIRED {b.risks?.fired ?? 0}
        </span>
        <span className="chipC">{b.claims_count ?? 0} CLAIMS · {b.sources_count ?? 0} SOURCES</span>
        {compileBtn}
        {refreshBtn}
        {grokMenu}
      </div>
      {flash && (
        <div className="dim" style={{ padding: '6px 16px 0', fontSize: 10 }}>{flash}</div>
      )}
      {b.house?.stance_line && (
        <div style={{ padding: '8px 16px 0', fontSize: 12, fontWeight: 600, lineHeight: 1.45 }}>
          {b.house.stance_line}
        </div>
      )}
      <div className="dim" style={{ padding: '8px 16px 12px', fontSize: 10, lineHeight: 1.55 }}>
        <b style={{ color: 'var(--text)' }}>COMPILE BOOK</b>
        {' '}
        = rebuild pack from research files (same as terminal).
        {' '}
        <b style={{ color: 'var(--text)' }}>REFRESH</b>
        {' '}
        = re-read pack only.
        {' '}
        <b style={{ color: 'var(--text)' }}>AGENTS</b>
        {' '}
        = pick Daily / Steelman / Match / Propose / … then OPEN GROK (Terminal → slash command for this desk).
      </div>
    </div>
  );
}
