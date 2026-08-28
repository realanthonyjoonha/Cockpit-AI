// Shared thin-desk Update — write_path_mode: meta_only (UP-C v1.1).
// Paths + ritual + COMPILE BOOK via BookStrip.
// House/risks: Grok propose_* → glass ACCEPT (never silent write).
import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import BookStrip from './BookStrip.jsx';

/** Body padding aligned with .shd / table cells (16px). */
const bodyPad = { padding: '10px 16px 14px' };

/**
 * @param {{ desk: string, ticker: string, label: string }} props
 * desk = API slug (nbis | msft)
 * label = crumb brand (NEBIUS | MICROSOFT)
 */
export default function UpdateMetaOnly({ desk, ticker, label }) {
  const [m, setM] = useState(null);
  const base = String(desk || '').replace(/^\/+|\/+$/g, '');
  const brand = (label || ticker || desk || 'DESK').toUpperCase();

  useEffect(() => {
    api(`${base}/write-meta`).then(setM).catch(() => setM({ available: false, reason: 'request failed' }));
  }, [base]);

  if (!m) return <div className="crumb">LOADING…</div>;
  if (!m.available) {
    return (
      <div>
        <div className="crumb">{brand} · UPDATE · <b>EMPTY</b></div>
        <div className="emptyD">{m.reason || 'write-meta unavailable'}</div>
      </div>
    );
  }

  const paths = m.paths || {};
  const rows = Object.entries(paths);
  const criteria = m.success_criteria || [];

  return (
    <div>
      <div className="crumb">
        {brand} · UPDATE · <b>WRITE PATH</b> · META_ONLY · DECISION-SUPPORT ONLY · NO AUTO HOUSE
      </div>

      <BookStrip desk={base} ticker={ticker} />

      {/* 1 · RITUAL — no <ol> (ids are already S1…); pad match table/shd */}
      <div className="sect">
        <div className="shd">
          <span className="no">1</span>
          <h2>RITUAL</h2>
          <span className="m">file → COMPILE BOOK → verify glass</span>
        </div>
        <ul className="reg">
          {criteria.length === 0 ? (
            <li className="dim" style={{ padding: '8px 16px' }}>No success criteria in write-meta.</li>
          ) : (
            criteria.map((s) => (
              <li key={s.id} style={{ padding: '8px 16px', alignItems: 'flex-start' }}>
                <span className="mono" style={{ color: 'var(--accent)', minWidth: 28, flex: 'none', paddingTop: 1 }}>{s.id}</span>
                <span style={{ flex: 1, lineHeight: 1.45 }}>{s.text}</span>
              </li>
            ))
          )}
        </ul>
        <div
          className="dim"
          style={{
            ...bodyPad,
            paddingTop: 0,
            fontSize: 11,
            borderTop: '1px solid var(--hairline)',
            lineHeight: 1.55,
          }}
        >
          <div>
            Claim format: <span className="mono" style={{ color: 'var(--text)' }}>{m.claim_format}</span>
          </div>
          <div style={{ marginTop: 6 }}>
            Under: <span className="mono" style={{ color: 'var(--text)' }}>{m.claim_section}</span>
          </div>
        </div>
      </div>

      {/* 2 · PATHS */}
      <div className="sect">
        <div className="shd">
          <span className="no">2</span>
          <h2>PATHS</h2>
          <span className="m">vault / ontology</span>
        </div>
        <table>
          <thead>
            <tr>
              <th style={{ width: '22%' }}>Role</th>
              <th>Path</th>
              <th style={{ width: '10%' }}>Exists</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([k, v]) => (
              <tr key={k}>
                <td>
                  <b>{k}</b>
                  <div className="dim" style={{ fontSize: 10, marginTop: 2 }}>{v.role}</div>
                </td>
                <td className="mono dim" style={{ fontSize: 10, wordBreak: 'break-all' }}>{v.path}</td>
                <td className="idc">{v.exists ? 'yes' : 'no'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* 3 · COMMANDS */}
      <div className="sect">
        <div className="shd">
          <span className="no">3</span>
          <h2>COMMANDS</h2>
          <span className="m">prefer glass COMPILE BOOK</span>
        </div>
        <div style={{ ...bodyPad, fontSize: 11, lineHeight: 1.55 }}>
          <div>
            <b>CLI compile:</b>{' '}
            <span className="mono">{m.commands?.compile}</span>
          </div>
          <div style={{ marginTop: 8 }}>
            <b>Glass:</b> {m.commands?.compile_glass}
          </div>
          <div style={{ marginTop: 8 }}>
            <b>Ask CLI:</b>{' '}
            <span className="mono">{m.commands?.ask_cli}</span>
          </div>
        </div>
      </div>

      {/* NEVER */}
      <div className="sect">
        <div className="shd">
          <span className="no">∅</span>
          <h2>NEVER</h2>
        </div>
        <ul className="reg">
          {(m.never || []).map((n, i) => (
            <li key={i} style={{ padding: '8px 16px', alignItems: 'flex-start' }}>
              <span className="sig WATCH" style={{ flex: 'none', marginTop: 4 }} />
              <span style={{ flex: 1, lineHeight: 1.45 }}>{n}</span>
            </li>
          ))}
        </ul>
      </div>

      <div className="sect">
        <div className="emptyD" style={{ padding: '12px 16px' }}>
          <b>write_path_mode: meta_only</b> (all thin desks). Edit entity / risks SoR on disk, then{' '}
          <b>COMPILE BOOK</b>. House and register writes: Grok <span className="mono">propose_*</span>
          {' '}→ glass <b>ACCEPT</b> on House / Risks — never silent write, never hand-edit the pack store.
        </div>
      </div>
    </div>
  );
}
