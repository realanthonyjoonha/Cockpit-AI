// Shared thin sources catalog — click title to open allowlisted vault file (read-only).
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinSources({ desk }) {
  const { slug, ticker, label } = desk;
  const [d, setD] = useState(null);
  const [open, setOpen] = useState(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOpen(null);
    api(`${slug}/sources`).then(setD).catch(() => setD({ available: false, reason: 'request failed' }));
  }, [slug]);

  const close = useCallback(() => setOpen(null), []);

  useEffect(() => {
    if (!open) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') close(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, close]);

  const openId = useCallback(async (id, fallbackTitle) => {
    if (!id || busy) return;
    setBusy(true);
    try {
      const doc = await api(`${slug}/sources/${encodeURIComponent(id)}`);
      setOpen({ ...doc, title: doc.title || fallbackTitle || id });
    } catch (e) {
      setOpen({
        available: false,
        id,
        title: fallbackTitle || id,
        reason: e.message || 'request failed',
        html: null,
      });
    }
    setBusy(false);
  }, [slug, busy]);

  if (!d) return <div className="crumb">LOADING…</div>;

  if (!d.available) {
    return (
      <div>
        <div className="crumb">{label} · SOURCES · <b>EMPTY</b></div>
        <div className="emptyD">{d.reason || 'Pack unavailable.'}</div>
      </div>
    );
  }

  const primary = (d.sources || []).filter((s) => s.primary);
  const other = (d.sources || []).filter((s) => !s.primary);

  const Row = ({ s }) => (
    <tr>
      <td style={{ width: '28%' }}>
        <button
          type="button"
          className="filing-link"
          disabled={busy || !s.id}
          onClick={() => openId(s.id, s.title)}
        >
          {s.title}
        </button>
        <div className="dimmer mono" style={{ fontSize: 10 }}>{s.id}</div>
      </td>
      <td className="idc" style={{ width: '10%' }}>{s.kind || '—'}</td>
      <td className="dim mono" style={{ width: '42%', fontSize: 10, wordBreak: 'break-all' }}>
        {s.path || '—'}
      </td>
      <td className="idc mono" style={{ width: '10%' }}>{s.n_lines != null ? s.n_lines : '—'}</td>
      <td className="dim" style={{ width: '10%', fontSize: 10 }}>
        {(s.outline_preview || []).slice(0, 2).join(' · ') || '—'}
      </td>
    </tr>
  );

  return (
    <div>
      <div className="crumb">
        {label} · SOURCES · <b>{d.counts?.total ?? 0}</b> IN PACK
        {' · '}{d.counts?.primary ?? 0} PRIMARY
        {d.compiled_at ? ` · PACK ${String(d.compiled_at).slice(0, 10)}` : ''}
      </div>

      {d.provenance && (
        <div className="sect">
          <div className="shd"><span className="no">⌘</span><h2>PROVENANCE</h2><span className="m">pack compile metadata · click to open</span></div>
          <div style={{ padding: '8px 16px 12px', fontSize: 11, lineHeight: 1.5 }} className="dim">
            {d.provenance.entity_path && (
              <div>
                Entity:{' '}
                <button type="button" className="filing-link" disabled={busy} onClick={() => openId('__entity__', 'Entity')}>
                  {d.provenance.entity_path}
                </button>
              </div>
            )}
            {d.provenance.house_view && (
              <div>
                House:{' '}
                <button type="button" className="filing-link" disabled={busy} onClick={() => openId('__house__', 'House view')}>
                  {d.provenance.house_view}
                </button>
              </div>
            )}
            {d.provenance.pack_config && (
              <div>
                Config:{' '}
                <button type="button" className="filing-link" disabled={busy} onClick={() => openId('__pack_config__', 'Pack config')}>
                  {d.provenance.pack_config}
                </button>
              </div>
            )}
            {d.provenance.source_count != null && <div>Source count: {d.provenance.source_count}</div>}
            {d.provenance.note && <div style={{ marginTop: 6 }}>{d.provenance.note}</div>}
          </div>
        </div>
      )}

      <div className="sect">
        <div className="shd">
          <span className="no">1</span>
          <h2>PRIMARY (PACK)</h2>
          <span className="m">{primary.length} files · click title to open</span>
        </div>
        {!primary.length ? (
          <div className="emptyD">No primary sources tagged in pack.</div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Kind</th>
                <th>Path</th>
                <th>Lines</th>
                <th>Outline</th>
              </tr>
            </thead>
            <tbody>{primary.map((s) => <Row key={s.id} s={s} />)}</tbody>
          </table>
        )}
      </div>

      {other.length > 0 && (
        <div className="sect" style={{ opacity: 0.85 }}>
          <div className="shd">
            <span className="no">2</span>
            <h2>OTHER CATALOG ROWS</h2>
            <span className="m">also listed in pack · click title to open</span>
          </div>
          <table>
            <thead>
              <tr>
                <th>Title</th>
                <th>Kind</th>
                <th>Path</th>
                <th>Lines</th>
                <th>Outline</th>
              </tr>
            </thead>
            <tbody>{other.map((s) => <Row key={s.id} s={s} />)}</tbody>
          </table>
          {d.note && <div className="emptyD">{d.note}</div>}
        </div>
      )}

      <div className="emptyD" style={{ marginTop: 8 }}>
        Decision-support catalog only. Click a title to read the vault file in glass (read-only).
        Agents can still use <span className="mono">./ont source {ticker} get &lt;id&gt;</span>.
      </div>

      {open && (
        <div className="reader-overlay" onClick={close} role="presentation">
          <div
            className="reader"
            role="dialog"
            aria-modal="true"
            aria-label={open.title || 'Source'}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="reader-head">
              <div>
                <div className="reader-title">{open.title || open.id}</div>
                <div className="dimmer mono" style={{ fontSize: 10 }}>
                  {open.kind || 'source'}
                  {open.truncated ? ' · truncated' : ''}
                </div>
              </div>
              <button type="button" className="desk-btn reader-close" onClick={close}>Close</button>
            </div>
            {!open.available ? (
              <div className="emptyD">{open.reason || 'GAP'}</div>
            ) : (
              <div className="prose wide reader-body" dangerouslySetInnerHTML={{ __html: open.html || '' }} />
            )}
            {open.note && <div className="dimmer" style={{ padding: '8px 16px 12px', fontSize: 11 }}>{open.note}</div>}
          </div>
        </div>
      )}
    </div>
  );
}
