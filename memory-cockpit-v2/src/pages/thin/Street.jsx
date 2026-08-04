// Shared thin Street — agent-built complete firm models only (no empty cells).
// Chrome:
//   REFRESH STREET → pipeline agent + poll vault until publish → auto paint
//   OPEN GROK      → free-form agent (mode=chat)
// Ontology/pack = read context in seed only. Not house PT / not pack SoR.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiPost } from '../../api.js';

const POLL_MS = 2500;
const POLL_MAX_MS = 10 * 60 * 1000; // 10 min

const flagMark = (f) => (f === 'bull' ? { g: '▲', c: 'var(--intact)', t: 'bull-end' }
  : f === 'bear' ? { g: '▼', c: 'var(--fired)', t: 'skeptic' }
  : f === 'stale' ? { g: '⊘', c: 'var(--dim)', t: 'stale model' }
  : f === 'anchor' ? { g: '◆', c: '#7B87E8', t: 'primary source' }
  : null);

/** Fingerprint Street GET payload to detect vault publish. */
function streetFingerprint(payload) {
  if (!payload || typeof payload !== 'object') return 'null';
  const firms = Array.isArray(payload.firms) ? payload.firms : [];
  const firmSig = firms.map((f) => `${f.firm}|${f.pt}|${f.rating}|${f.date}|${(f.why || '').length}`).join(';');
  return [
    payload.available ? '1' : '0',
    payload.built_at || '',
    payload.fetched_at || '',
    payload.as_of || '',
    firms.length,
    firmSig,
  ].join('::');
}

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinStreet({ desk }) {
  const { slug, ticker, label } = desk;
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [flash, setFlash] = useState(null);
  const pollRef = useRef(null);
  const baselineRef = useRef(null);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current.interval);
      if (pollRef.current.timeout) clearTimeout(pollRef.current.timeout);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const load = useCallback(() => {
    return api(`${slug}/street`)
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
    return () => stopPoll();
  }, [load, stopPoll]);

  // Desk change: cancel any in-flight vault wait
  useEffect(() => {
    stopPoll();
    setFlash(null);
  }, [slug, stopPoll]);

  /**
   * Poll GET until fingerprint changes vs baseline (agent published) or timeout.
   * @param {string} baselineFp
   */
  const startVaultPoll = useCallback((baselineFp) => {
    stopPoll();
    baselineRef.current = baselineFp;
    setPolling(true);
    setFlash('Researching… agent opened · waiting for vault publish');

    const tick = async () => {
      try {
        const payload = await api(`${slug}/street`);
        const fp = streetFingerprint(payload);
        if (fp !== baselineRef.current) {
          setD(payload);
          stopPoll();
          const n = Array.isArray(payload.firms) ? payload.firms.length : 0;
          setFlash(
            payload.available
              ? `Street updated · ${n} model${n === 1 ? '' : 's'} from vault`
              : 'Vault changed · still incomplete (NEEDS BUILD)',
          );
        }
      } catch {
        /* keep polling */
      }
    };

    const interval = setInterval(tick, POLL_MS);
    const timeout = setTimeout(() => {
      stopPoll();
      setFlash((prev) => (
        String(prev || '').includes('Street updated')
          ? prev
          : 'No vault change yet · agent may still be running · click REFRESH STREET again to re-check'
      ));
    }, POLL_MAX_MS);

    pollRef.current = { interval, timeout };
    // first check soon (agent sometimes fast on re-open)
    setTimeout(tick, 1200);
  }, [slug, stopPoll]);

  /**
   * @param {'pipeline' | 'chat'} mode
   */
  const openStreetAgent = async (mode) => {
    setBusy(true);
    setFlash(null);
    try {
      // Snapshot before agent so we detect publish
      let baselineFp = streetFingerprint(d);
      try {
        const pre = await api(`${slug}/street`);
        baselineFp = streetFingerprint(pre);
        setD(pre);
      } catch { /* use state */ }

      const out = await apiPost('open-grok', { action: 'street', desk: slug, mode });
      if (!out?.ok) {
        setFlash(out?.error || 'open Grok failed (localhost only)');
        return;
      }

      if (mode === 'pipeline') {
        const seedNote = out.street_seed?.path
          ? ` · seed ${out.street_seed.firm_count ?? 0} models`
          : '';
        setFlash(`Researching… agent opened · waiting for vault publish${seedNote}`);
        startVaultPoll(baselineFp);
      } else {
        setFlash(
          `Opened Grok · chat · ${out.initial_prompt || '/cockpit-street'}`
          + (out.street_seed?.path ? ` · seed ${out.street_seed.firm_count ?? 0} models` : ''),
        );
      }
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <div className="crumb">LOADING…</div>;

  const firms = d.firms || [];
  const c = d.computed || {};
  const cons = d.consensus || {};
  const delta = d.delta || null;
  const empty = !d.available || !firms.length;
  const fmtDelta = (v) => {
    if (v == null || !Number.isFinite(Number(v))) return null;
    const n = Number(v);
    return `${n > 0 ? '+' : ''}${n}`;
  };
  const fmtPt = (f) => f.pt_display || (f.pt != null ? `$${f.pt}` : null);
  const primaryBusy = busy || polling;

  return (
    <div>
      <div className="crumb">
        {label} · STREET · {empty ? <b>NEEDS BUILD</b> : <b>{firms.length} MODELS</b>}
        {!empty && d.as_of ? ` · AS OF ${String(d.as_of).slice(0, 10)}` : ''}
        {!empty && (d.built_at || d.fetched_at)
          ? ` · BUILT ${String(d.built_at || d.fetched_at).slice(0, 16).replace('T', ' ')}`
          : ''}
        {!empty && c.stale ? (
          <span style={{ color: 'var(--warn, #e6a23c)' }}> · <b>STALE</b></span>
        ) : (!empty ? ' · FRESH' : '')}
        {polling ? (
          <span style={{ color: 'var(--sec-2)', marginLeft: 6 }}> · <b>WAITING FOR PUBLISH</b></span>
        ) : null}
      </div>

      <div className="sect" style={{ padding: '8px 16px 10px' }}>
        <div className="dim" style={{ fontSize: 11, lineHeight: 1.5, marginBottom: 10 }}>
          Third-party firm models only: rating, target, <b>3–5 sentence why</b>, article link.
          Not house PT · not pack SoR · not a recommendation.
          {' '}
          <span title="Street vault only — does not compile ontology">
            <b>REFRESH STREET</b> = research + auto-update when vault publishes · ≠ COMPILE BOOK
          </span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <button
            type="button"
            className="btn"
            disabled={primaryBusy}
            onClick={() => openStreetAgent('pipeline')}
            title="Open agent to research firm PTs, then auto-refresh this page when vault updates"
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            {polling ? 'WAITING…' : busy ? '…' : 'REFRESH STREET'}
          </button>
          <button
            type="button"
            className="btn"
            disabled={busy}
            onClick={() => openStreetAgent('chat')}
            title="Open agent with Street + house + risk context (free-form)"
            style={{ fontSize: 10, padding: '4px 10px' }}
          >
            {busy ? '…' : 'OPEN GROK'}
          </button>
          {polling && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                stopPoll();
                setFlash('Stopped waiting for vault publish');
              }}
              style={{ fontSize: 10, padding: '4px 10px', opacity: 0.85 }}
            >
              Cancel wait
            </button>
          )}
          {flash && <span className="dim" style={{ fontSize: 10 }}>{flash}</span>}
        </div>
      </div>

      {empty && (
        <div className="sect">
          <div className="emptyD" style={{ padding: '16px' }}>
            <div style={{ marginBottom: 8 }}>
              {d.reason || 'No complete street models for this desk.'}
            </div>
            <div className="dim" style={{ fontSize: 11, lineHeight: 1.45 }}>
              Click <b>REFRESH STREET</b> — agent researches firm PTs (with house/risk context),
              verifies, publishes the Street vault, and this page <b>updates automatically</b> when
              the vault changes. Incomplete rows are never shown. Does not COMPILE BOOK or write ontology.
            </div>
          </div>
        </div>
      )}

      {!empty && d.frame && (
        <div className="dim" style={{ padding: '0 16px 8px', fontSize: 11, lineHeight: 1.45 }}>{d.frame}</div>
      )}
      {!empty && d.actuals && (
        <div className="emptyD" style={{ padding: '6px 16px 0' }}>
          <b style={{ color: 'var(--sec-2)' }}>Actuals · </b>{d.actuals}
        </div>
      )}

      {!empty && (
        <div className="sect">
          <div className="shd">
            <span className="no">1</span>
            <h2>CONSENSUS</h2>
            <span className="m">street · not house</span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', padding: '10px 16px 12px' }}>
            {[
              ['RATING', cons.rating || c.mean_rating],
              ['TALLY', cons.tally || `${firms.length} models`],
              ['AVG PT', c.pt_median != null ? String(c.pt_median) : (cons.pt_avg != null ? String(cons.pt_avg) : null)],
              ['LOW–HIGH', (c.pt_low != null && c.pt_high != null) ? `${c.pt_low}–${c.pt_high}` : null],
            ].filter(([, v]) => v != null && v !== '').map(([lab, val]) => (
              <div key={lab} style={{ minWidth: 140, padding: '2px 14px 8px 0' }}>
                <div style={{ fontSize: 9, letterSpacing: 0.4, color: 'var(--dim)', fontWeight: 700 }}>{lab}</div>
                <div style={{ fontSize: 13, color: 'var(--text)' }}>{val}</div>
              </div>
            ))}
          </div>
          {cons.pt_note && <div className="dim" style={{ padding: '0 16px 10px', fontSize: 11 }}>{cons.pt_note}</div>}
        </div>
      )}

      {!empty && delta && (delta.mean_delta != null || delta.firm_pt_raised > 0 || delta.firm_pt_cut > 0) && (
        <div className="sect">
          <div className="shd">
            <span className="no">1b</span>
            <h2>VS PRIOR BUILD</h2>
            <span className="m">{delta.prior_as_of || 'prior'}</span>
          </div>
          <div style={{ padding: '8px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 14, fontSize: 12 }}>
            {fmtDelta(delta.mean_delta) && <div><span className="dim">Mean Δ</span> <b className="mono">{fmtDelta(delta.mean_delta)}</b></div>}
            {fmtDelta(delta.high_delta) && <div><span className="dim">High Δ</span> <b className="mono">{fmtDelta(delta.high_delta)}</b></div>}
            {fmtDelta(delta.low_delta) && <div><span className="dim">Low Δ</span> <b className="mono">{fmtDelta(delta.low_delta)}</b></div>}
            <div><span className="dim">Raised</span> <b>{delta.firm_pt_raised ?? 0}</b></div>
            <div><span className="dim">Cut</span> <b>{delta.firm_pt_cut ?? 0}</b></div>
          </div>
        </div>
      )}

      {!empty && (
        <div className="sect">
          <div className="shd">
            <span className="no">2</span>
            <h2>FIRM MODELS</h2>
            <span className="m">complete rows only · ▲▼⊘◆ · {ticker}</span>
          </div>
          <table>
            <thead>
              <tr>
                <th style={{ width: '14%' }}>Firm</th>
                <th style={{ width: '9%' }}>Rating</th>
                <th style={{ width: '8%' }}>Target</th>
                <th>Why this price target (3–5 sentences)</th>
                <th style={{ width: '7%' }}>Date</th>
                <th style={{ width: '8%' }}>Article</th>
              </tr>
            </thead>
            <tbody>
              {firms.map((f, i) => {
                const fm = flagMark(f.flag);
                return (
                  <tr key={`${f.firm}-${i}`}>
                    <td>
                      {fm && <span style={{ color: fm.c, marginRight: 5 }} title={fm.t}>{fm.g}</span>}
                      {f.firm}
                    </td>
                    <td>{f.rating}</td>
                    <td style={{ fontWeight: 700, color: 'var(--text)' }}>{fmtPt(f)}</td>
                    <td style={{ fontSize: 11, lineHeight: 1.45 }}>{f.why}</td>
                    <td className="dim mono" style={{ fontSize: 10 }}>{f.date}</td>
                    <td>
                      <a href={f.source_url} target="_blank" rel="noreferrer">Open</a>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!empty && d.bull && d.bear && (
        <div className="sect">
          <div style={{ padding: '8px 16px 14px', display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 11, lineHeight: 1.45 }}>
              <span style={{ color: 'var(--intact)', fontWeight: 700 }}>BULL FRAME · </span>
              <span className="dim">{d.bull}</span>
            </div>
            <div style={{ fontSize: 11, lineHeight: 1.45 }}>
              <span style={{ color: 'var(--fired)', fontWeight: 700 }}>SKEPTIC FRAME · </span>
              <span className="dim">{d.bear}</span>
            </div>
            {d.trap && (
              <div style={{ fontSize: 11, lineHeight: 1.45 }}>
                <span style={{ color: 'var(--watch)', fontWeight: 700 }}>READING TRAP · </span>
                <span className="dim">{d.trap}</span>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
