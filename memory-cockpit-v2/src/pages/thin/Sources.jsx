// Shared thin sources catalog.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinSources({ desk }) {
  const { slug, ticker, label } = desk;
  const [d, setD] = useState(null);
  useEffect(() => {
    api(`${slug}/sources`).then(setD).catch(() => setD({ available: false, reason: 'request failed' }));
  }, [slug]);

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
        <b>{s.title}</b>
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
          <div className="shd"><span className="no">⌘</span><h2>PROVENANCE</h2><span className="m">pack compile metadata</span></div>
          <div style={{ padding: '8px 16px 12px', fontSize: 11, lineHeight: 1.5 }} className="dim">
            {d.provenance.entity_path && <div>Entity: <span className="mono">{d.provenance.entity_path}</span></div>}
            {d.provenance.house_view && <div>House: <span className="mono">{d.provenance.house_view}</span></div>}
            {d.provenance.pack_config && <div>Config: <span className="mono">{d.provenance.pack_config}</span></div>}
            {d.provenance.source_count != null && <div>Source count: {d.provenance.source_count}</div>}
            {d.provenance.note && <div style={{ marginTop: 6 }}>{d.provenance.note}</div>}
          </div>
        </div>
      )}

      <div className="sect">
        <div className="shd">
          <span className="no">1</span>
          <h2>PRIMARY (PACK)</h2>
          <span className="m">{primary.length} files · open on disk / via ./ont source</span>
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
            <span className="m">also listed in pack · may be cross-theme</span>
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
        Decision-support catalog only. Agents open long MDs via{' '}
        <span className="mono">./ont source {ticker} get &lt;id&gt;</span> — the glass does not dump full reports.
      </div>
    </div>
  );
}
