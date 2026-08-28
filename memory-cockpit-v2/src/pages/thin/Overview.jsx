// Shared thin Overview — pack stance, on-watch, claim spine.
import React, { useEffect, useState } from 'react';
import { api } from '../../api.js';
import BookStrip from './BookStrip.jsx';
import { filingDocLabel, companyEdgarUrl } from './filingLink.js';

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

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinOverview({ desk }) {
  const { slug, ticker, label } = desk;
  const [d, setD] = useState(null);
  const [qx, setQx] = useState(null);
  const [pipe, setPipe] = useState(null);

  useEffect(() => {
    api(`${slug}/overview`).then(setD).catch(() => setD({ available: false, reason: 'request failed' }));
    api(`${slug}/quote`).then(setQx).catch(() => setQx({ quote: null }));
    api(`${slug}/pipeline`).then(setPipe).catch(() => setPipe(null));
  }, [slug]);

  if (!d) return <div className="crumb">LOADING…</div>;

  if (!d.available) {
    return (
      <div>
        <div className="crumb">{label} · <b>PACK UNAVAILABLE</b></div>
        <BookStrip desk={slug} ticker={ticker} compact />
        <div className="sect">
          <div className="phd">
            <div>
              <div className="eyebrow">SPINE · EMPTY</div>
              <h1>{label} overview</h1>
            </div>
            <span className="pill warn">NO PACK</span>
          </div>
          <p className="dimmer" style={{ maxWidth: '40rem', lineHeight: 1.55, padding: '12px 16px' }}>
            {d.reason || 'Compiled pack not found.'}{' '}
            Hit <b>COMPILE BOOK</b> above (or open Grok to underwrite), then reload.
            We do not invent claims or risks.
          </p>
        </div>
      </div>
    );
  }

  const st = d.house?.status === 'CONFIRMED' ? 'ok' : 'watch';
  const nWatch = d.risk_summary?.watch?.length || 0;
  const nFired = d.risk_summary?.fired?.length || 0;
  const base = `#/${slug}`;

  return (
    <div>
      <div className="crumb">
        {label} · <b>{d.ticker || ticker}</b> · PACK AS OF <b>{fmtCompiled(d.compiled_at)}</b>
        {' '}· {d.risk_summary?.count ?? 0} RISKS · {nWatch} WATCH · {nFired} FIRED
      </div>

      <BookStrip desk={slug} ticker={ticker} compact />

      {/* Attention surface: material filings only. Routine (Form 3/4/5, 144, 13F) never
          earns an Overview section — full detail lives on the Research pipeline card. */}
      {pipe?.available && pipe.since_compile?.material_count > 0 && (
        <div className="sect">
          <div className="shd">
            <span className="no">▤</span>
            <h2>FILED SINCE COMPILE</h2>
            <span className="m">
              SEC EDGAR · tier {pipe.tier?.tier || '—'} · {pipe.since_compile.count} filing{pipe.since_compile.count === 1 ? '' : 's'} after book compile
              {pipe.stale ? ' · EDGAR cache STALE' : ''}
              {companyEdgarUrl(pipe.cik) ? (
                <>
                  {' · '}
                  <a className="filing-link" href={companyEdgarUrl(pipe.cik)} target="_blank" rel="noopener noreferrer">
                    company filings
                  </a>
                </>
              ) : null}
            </span>
          </div>
          <table>
            <thead><tr><th>Form</th><th>Filed</th><th>Document</th></tr></thead>
            <tbody>
              {pipe.since_compile.material_items.slice(0, 6).map((f) => (
                <tr key={f.accession}>
                  <td className="idc"><b>{f.form}</b>{f.items ? <span className="dimmer mono" style={{ fontSize: 10, marginLeft: 6 }}>{f.items}</span> : null}</td>
                  <td className="idc mono">{f.filed}</td>
                  <td>
                    <a className="filing-link" href={f.url} target="_blank" rel="noopener noreferrer">
                      {filingDocLabel(f)}
                    </a>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="dimmer" style={{ padding: '6px 16px 10px', fontSize: 11 }}>
            {pipe.since_compile.routine_count > 0
              ? `+ ${pipe.since_compile.routine_count} routine (insider Form 3/4/5 · 144 · 13F) not shown · `
              : ''}
            the pack does not see these yet — research + COMPILE BOOK to fold them in
          </div>
        </div>
      )}

      <div className="sect">
        <div className="rdhead">
          <h1 style={{ fontSize: 20 }}>{(d.name || label).toUpperCase()}</h1>
          <div className="chips">
            {d.house?.status && (
              <span className={`chipC ${st}`}>
                {d.house.status}{d.house.date ? ` · ${d.house.date}` : ''}
              </span>
            )}
            <span className="chipC">{d.ticker || ticker}</span>
            {qx?.quote?.price != null && (
              <span className={`chipC${qx.quote.pct != null && qx.quote.pct < 0 ? ' watch' : ' ok'}`}>
                ${qx.quote.price.toFixed(2)}
                {qx.quote.pct != null ? ` · ${qx.quote.pct >= 0 ? '+' : ''}${qx.quote.pct.toFixed(2)}%` : ''}
                {qx.quote.source ? ` · ${qx.quote.source}` : ''}
              </span>
            )}
            {qx && qx.quote == null && (
              <span className="chipC" title={qx.note || 'no quote'}>QUOTE —</span>
            )}
          </div>
        </div>
        {d.house?.stance_line && (
          <div className="prose" style={{ paddingTop: 4 }}>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{d.house.stance_line}</p>
          </div>
        )}
        {d.summary && (
          <div className="prose" style={{ paddingTop: 2 }}>
            <p className="dim" style={{ fontSize: 12, lineHeight: 1.5 }}>{d.summary}</p>
          </div>
        )}
        <div className="pagechips" style={{ paddingBottom: 10 }}>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/house`; }}><b>»</b> full house view</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/risks`; }}><b>»</b> risk register</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/street`; }}><b>»</b> street models</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/model`; }}><b>»</b> working model</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/research`; }}><b>»</b> compile</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/reports`; }}><b>»</b> reports</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/sources`; }}><b>»</b> sources catalog</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/update`; }}><b>»</b> update / write path</span>
        </div>
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">⚠</span>
          <h2>ON WATCH</h2>
          <span className="m">SoR + pack · click → detail{d.sor_ahead_of_pack ? ' · SoR ahead of pack' : ''}</span>
        </div>
        {nWatch === 0 ? (
          <div className="emptyD">No risks on WATCH.</div>
        ) : (
          <table>
            <thead><tr><th>Risk</th><th>Status</th><th>Grade</th></tr></thead>
            <tbody>
              {d.risk_summary.watch.map((r) => (
                <tr
                  key={r.id || r.name}
                  className={r.id ? 'goto' : ''}
                  onClick={() => { if (r.id) window.location.hash = `${base}/risk/${encodeURIComponent(r.id)}`; }}
                >
                  <td><span className="sig WATCH"></span> <b style={{ marginLeft: 6 }}>{r.name}</b></td>
                  <td className="idc">{r.status || 'WATCH'}</td>
                  <td className="idc">{r.grade || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {nFired > 0 && (
          <>
            <div className="shd" style={{ marginTop: 8 }}>
              <span className="no">!</span>
              <h2>FIRED</h2>
              <span className="m">active trips</span>
            </div>
            <table>
              <tbody>
                {d.risk_summary.fired.map((r) => (
                  <tr
                    key={r.id || r.name}
                    className={r.id ? 'goto' : ''}
                    onClick={() => { if (r.id) window.location.hash = `${base}/risk/${encodeURIComponent(r.id)}`; }}
                  >
                    <td><span className="sig FIRED"></span> <b style={{ marginLeft: 6 }}>{r.name}</b></td>
                    <td className="idc">{r.status}</td>
                    <td className="idc">{r.grade || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">◆</span>
          <h2>CLAIM SPINE</h2>
          <span className="m">top graded claims from pack · not exhaustive</span>
        </div>
        {!d.claims?.length ? (
          <div className="emptyD">No claims in pack.</div>
        ) : (
          <div style={{ padding: '4px 16px 12px' }}>
            {d.claims.map((c) => (
              <div key={c.id} style={{ padding: '6px 0', borderBottom: '1px solid var(--hairline)', fontSize: 12, lineHeight: 1.45 }}>
                <span className="dim mono" style={{ fontSize: 10, marginRight: 8 }}>
                  [{c.grade || '—'}] {c.as_of || '—'}
                </span>
                {c.text}
                {c.source_id && (
                  <span className="dimmer mono" style={{ fontSize: 10, marginLeft: 8 }}>· {c.source_id}</span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {d.gaps?.length > 0 && (
        <div className="sect">
          <div className="shd"><span className="no">∅</span><h2>GAPS</h2><span className="m">pack-declared</span></div>
          <ul className="prose" style={{ padding: '8px 16px 12px', margin: 0 }}>
            {d.gaps.map((g, i) => (
              <li key={i} className="dim" style={{ fontSize: 12 }}>{typeof g === 'string' ? g : JSON.stringify(g)}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="sect">
        <div className="shd"><span className="no">∿</span><h2>SERIES</h2><span className="m">phase 1</span></div>
        <div className="emptyD">{d.series_note || `${d.series_count} series in snapshot`}</div>
      </div>
    </div>
  );
}
