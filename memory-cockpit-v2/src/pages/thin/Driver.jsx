// Driver dossier from 09. Name, house cite, watching, figures, log, still open.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import GrokAgents from './GrokAgents.jsx';

/** @param {{ desk: { slug: string, ticker: string, label: string }, id: string }} props */
export default function ThinDriver({ desk, id }) {
  const { slug, label } = desk;
  const [d, setD] = useState(null);
  const [banner, setBanner] = useState(null);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    setMissing(false);
    setD(null);
    api(`${slug}/driver/${encodeURIComponent(id)}`)
      .then((j) => {
        if (j?.driver) setD(j.driver);
        else setMissing(true);
      })
      .catch(() => setMissing(true));
  }, [slug, id]);

  if (missing || (!d && missing)) {
    return (
      <div>
        <div className="crumb">
          <span className="lnk" onClick={() => { window.location.hash = `#/${slug}/drivers`; }}>DRIVERS</span>
          {' / '}<b>…</b>
        </div>
        <div className="emptyD">No driver <span className="mono">{id}</span>.</div>
      </div>
    );
  }
  if (!d) {
    return <div className="emptyD">…</div>;
  }

  const r = d;
  const figures = r.figures || [];
  const log = r.log || [];
  const open = r.open || [];
  const blocks = [];
  if (figures.length) blocks.push('figures');
  blocks.push('dd', 'research', 'open');
  const no = (key) => String.fromCharCode(65 + blocks.indexOf(key));

  return (
    <div>
      <div className="crumb">
        <span className="lnk" onClick={() => { window.location.hash = `#/${slug}/drivers`; }}>{label} DRIVERS</span>
        {' / '}<b>{r.name}</b>
      </div>
      <div className="sect">
        <div className="rdhead">
          <h1 style={{ fontSize: 18 }}>{r.name}</h1>
          <div className="chips">
            {r.checked ? <span className="chipC">{r.checked}</span> : null}
          </div>
        </div>
        <div className="prose wide">
          {r.why ? <p>{r.why}</p> : null}
          {r.watching ? <p><b>Watching.</b> {r.watching}</p> : null}
          <p className="dim"><b>House.</b> {r.house || '—'}</p>
        </div>
      </div>
      {figures.length ? (
        <div className="sect">
          <div className="shd">
            <span className="no">{no('figures')}</span>
            <h2>FIGURES</h2>
            <span className="m">{figures.length}</span>
          </div>
          <div className="specrow" style={{ gridTemplateColumns: `repeat(${Math.min(figures.length, 4)}, 1fr)` }}>
            {figures.slice(0, 4).map((n) => (
              <div className="spec" key={n.item}>
                <div className="l">{n.item}</div>
                <div className="v">{n.figure}</div>
                <div className="c">{n.note}</div>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="sect">
        <div className="shd">
          <span className="no">{no('dd')}</span>
          <h2>DUE DILIGENCE</h2>
          <span className="m">OPEN GROK</span>
        </div>
        {banner && (
          <div style={{ padding: '6px 16px 0', fontSize: 11, color: 'var(--ok, #5cba8a)' }}>{banner}</div>
        )}
        <div style={{ padding: '8px 16px 12px', display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
          <GrokAgents
            variant="driver"
            desk={slug}
            riskId={r.id || id}
            riskName={r.name}
            compact
            onFlash={(msg) => setBanner(msg || null)}
          />
        </div>
      </div>
      <div className="sect">
        <div className="shd">
          <span className="no">{no('research')}</span>
          <h2>RESEARCH</h2>
          <span className="m">{log.length}</span>
        </div>
        {log.length ? (
          <table>
            <thead>
              <tr>
                <th>Date</th>
                <th>Via</th>
                <th>What we found</th>
              </tr>
            </thead>
            <tbody>
              {log.map((row) => (
                <tr key={`${row.date}-${row.via}-${row.fact}`}>
                  <td className="mono" style={{ width: '16%' }}>{row.date}</td>
                  <td className="idc" style={{ width: '12%' }}>{row.via}</td>
                  <td>{row.fact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="emptyD">Nothing logged yet. Latest print, news, or a note — then GO appends one line.</div>
        )}
      </div>
      <div className="sect">
        <div className="shd">
          <span className="no">{no('open')}</span>
          <h2>STILL OPEN</h2>
          <span className="m">{open.length}</span>
        </div>
        {open.length ? (
          <table>
            <thead>
              <tr>
                <th>Question</th>
              </tr>
            </thead>
            <tbody>
              {open.map((q) => (
                <tr key={q}>
                  <td>{q}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="emptyD">None yet.</div>
        )}
      </div>
    </div>
  );
}
