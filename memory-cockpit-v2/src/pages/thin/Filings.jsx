// Shared thin Filings room (`#/{desk}/filings`) — EDGAR ledger + map runs.
// Overview is signal only. Decision-support only. Not pack SoR.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiPost } from '../../api.js';
import BookStrip from './BookStrip.jsx';
import FilingMapDossier from './FilingMapDossier.jsx';
import { filingDocLabel, companyEdgarUrl, filingItemText, inBookChip } from './filingLink.js';
import {
  dossierHeadline,
  filingsStripMode,
  filingsLedgerExtras,
  filingsMapList,
} from './filingMapPaint.js';

function LastPrint({ print, known, chip, printItem }) {
  return (
    <div className="fmap-print">
      <div className="l">LAST PRINT</div>
      {known ? (
        <div className="v">
          <b>{print.form}</b>
          {' · '}
          <span className="mono">{print.date || print.filed}</span>
          {printItem ? <span className="dimmer" style={{ fontSize: 11 }}>{printItem}</span> : null}
          {' · '}
          <span className={`chipC${chip.cls ? ` ${chip.cls}` : ''}`}>{chip.t}</span>
          {print.url ? (
            <a className="filing-link" href={print.url} target="_blank" rel="noopener noreferrer">
              {filingDocLabel(print)}
            </a>
          ) : null}
        </div>
      ) : (
        <div className="dim" style={{ fontSize: 12 }}>UNKNOWN · no 10-Q / 10-K / 20-F or 8-K 2.02 in EDGAR cache</div>
      )}
    </div>
  );
}

function MaterialTable({ material }) {
  if (!material.length) return null;
  return (
    <table>
      <thead><tr><th>Form</th><th>Filed</th><th>In book</th><th>Document</th></tr></thead>
      <tbody>
        {material.map((f) => {
          const item = filingItemText(f);
          return (
            <tr key={f.accession}>
              <td className="idc">
                <b>{f.form}</b>
                {item ? <span className="dimmer" style={{ fontSize: 10, marginLeft: 6 }}>{item}</span> : null}
              </td>
              <td className="idc mono">{f.filed}</td>
              <td className="idc"><span className="chipC watch">NOT IN BOOK</span></td>
              <td>
                <a className="filing-link" href={f.url} target="_blank" rel="noopener noreferrer">
                  {filingDocLabel(f)}
                </a>
              </td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinFilings({ desk }) {
  const { slug, ticker, label } = desk;
  const [pipe, setPipe] = useState(null);
  const [maps, setMaps] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const pollRef = useRef(null);

  const loadMaps = useCallback(() => {
    return api(`${slug}/research?lane=filings`)
      .then(setMaps)
      .catch(() => setMaps({ runs: [] }));
  }, [slug]);

  useEffect(() => {
    api(`${slug}/pipeline`).then(setPipe).catch(() => setPipe(null));
    loadMaps();
  }, [slug, loadMaps]);

  const runs = Array.isArray(maps?.runs) ? maps.runs : [];
  const inflight = runs.find((r) => r.status === 'queued' || r.status === 'running');
  const latestComplete = runs.find((r) => r.status === 'complete');
  const mapRows = filingsMapList(runs);

  useEffect(() => {
    setSelectedId(null);
    setDetail(null);
  }, [slug]);

  useEffect(() => {
    if (!selectedId) { setDetail(null); return undefined; }
    let dead = false;
    api(`${slug}/research/runs/${encodeURIComponent(selectedId)}`)
      .then((row) => { if (!dead) setDetail(row); })
      .catch(() => { if (!dead) setDetail(null); });
    return () => { dead = true; };
  }, [slug, selectedId]);

  useEffect(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
    if (!inflight) return undefined;
    pollRef.current = setInterval(() => { loadMaps(); }, 2500);
    return () => {
      if (pollRef.current) clearInterval(pollRef.current);
    };
  }, [inflight?.run_id, loadMaps]);

  const startMap = async () => {
    if (busy || inflight) return;
    setBusy(true);
    setFlash(null);
    try {
      const started = await apiPost(`${slug}/research/runs`, { job: 'filing_map', launch: false });
      if (!started?.ok || !started.run_id) {
        setFlash(started?.error || 'failed to start');
        return;
      }
      if (started.already_in_flight) {
        setFlash('Already in flight — wait or cancel.');
      }
      const grok = await apiPost('open-grok', {
        action: 'filing-map',
        desk: slug,
        run_id: started.run_id,
        job: 'filing_map',
        mode: 'pipeline',
      });
      setFlash(grok?.ok ? 'MAP FILINGS · OPEN GROK' : (grok?.error || 'created but OPEN GROK failed'));
      await loadMaps();
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const cancelMap = async (rid) => {
    if (!rid) return;
    try {
      await apiPost(`${slug}/research/runs/${encodeURIComponent(rid)}/cancel`, {});
      setFlash('Cancelled');
      await loadMaps();
    } catch (e) {
      setFlash(e.message || String(e));
    }
  };

  const openChat = async (rid) => {
    if (!rid || busy) return;
    setBusy(true);
    try {
      const grok = await apiPost('open-grok', {
        action: 'filing-map',
        desk: slug,
        run_id: rid,
        job: 'filing_map',
        mode: 'chat',
      });
      setFlash(grok?.ok ? 'OPEN GROK · this map' : (grok?.error || 'open Grok failed'));
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  const proposeFromMap = async ({ dryRun }) => {
    if (!selectedId) return null;
    const out = await apiPost(
      `${slug}/research/runs/${encodeURIComponent(selectedId)}/propose-from-map`,
      { dry_run: !!dryRun },
    );
    if (out?.ok && !dryRun && Array.isArray(out.created) && out.created.length) {
      setFlash(`PROPOSED ${out.created.length} · ACCEPT on House / Risks`);
    } else if (out?.ok && dryRun) {
      setFlash(`Preview · ${(out.counts && out.counts.actionable) || 0} actionable`);
    } else if (out && out.ok === false) {
      setFlash(out.error || 'propose failed');
    }
    return out;
  };

  if (!pipe) {
    return (
      <div>
        <div className="crumb">{label} · <b>{ticker}</b> · FILINGS</div>
        <BookStrip desk={slug} ticker={ticker} compact />
        <div className="crumb">LOADING…</div>
      </div>
    );
  }

  if (!pipe.available) {
    return (
      <div>
        <div className="crumb">{label} · <b>{ticker}</b> · FILINGS</div>
        <BookStrip desk={slug} ticker={ticker} compact />
        <div className="sect">
          <div className="shd"><span className="no">▤</span><h2>SEC FILINGS</h2></div>
          <p className="dimmer" style={{ padding: '12px 16px', maxWidth: '40rem', lineHeight: 1.5 }}>
            No EDGAR catalog for this desk yet (missing CIK or filings cache).
            Catalog is request-time, not pack SoR.
          </p>
        </div>
      </div>
    );
  }

  const print = pipe.last_print || {};
  const known = print.known && print.date;
  const chip = inBookChip(print.in_book);
  const printItem = filingItemText(print);
  const materialAll = Array.isArray(pipe.since_compile?.material_items)
    ? pipe.since_compile.material_items
    : [];
  const mappedAt = latestComplete?.finished_at || latestComplete?.started_at || null;
  const mapsReady = maps != null;
  const strip = filingsStripMode({
    print,
    materialItems: materialAll,
    materialCount: pipe.since_compile?.material_count,
    inflight: !!inflight,
    mappedAt,
    mapsReady,
  });
  const mode = strip.mode;
  const extras = filingsLedgerExtras(print, materialAll, mappedAt).slice(0, 6);
  const showMapBtn = mode === 'need_map' || mode === 'new' || !!inflight;
  const routineN = pipe.since_compile?.routine_count || 0;
  const selected = mapRows.find((r) => r.run_id === selectedId) || null;
  const delta = detail?.delta && detail.run_id === selectedId ? detail.delta : null;

  return (
    <div>
      <div className="crumb">
        {label} · <b>{ticker}</b> · FILINGS
        {mode === 'new' ? ' · NEW' : ''}
        {mode === 'need_map' ? ' · MAP' : ''}
      </div>
      <BookStrip desk={slug} ticker={ticker} compact />

      <div className={`sect fmap-host fmap-${mode}`}>
        <div className="shd">
          <span className="no">▤</span>
          <h2>SEC FILINGS</h2>
          {mode === 'new' ? (
            <span className="chipC watch">{extras.length > 0 ? `${extras.length} NEW` : 'NEW'}</span>
          ) : null}
          <span className="m">
            {companyEdgarUrl(pipe.cik) ? (
              <a className="filing-link" href={companyEdgarUrl(pipe.cik)} target="_blank" rel="noopener noreferrer">
                company filings
              </a>
            ) : (
              'SEC EDGAR catalog'
            )}
            {' · IN BOOK vs last COMPILE BOOK'}
          </span>
        </div>

        <LastPrint print={print} known={known} chip={chip} printItem={printItem} />
        {mode !== 'pending' ? <MaterialTable material={extras} /> : null}
        {showMapBtn ? (
          <div className="fmap-actions">
            <button type="button" className="btn" disabled={busy || !!inflight} onClick={startMap}>
              MAP FILINGS
            </button>
            {inflight ? (
              <button type="button" className="btn" onClick={() => cancelMap(inflight.run_id)}>
                Cancel
              </button>
            ) : null}
            {flash ? <span className="dim" style={{ fontSize: 11 }}>{flash}</span> : null}
            {inflight ? <span style={{ color: 'var(--watch)', fontSize: 11 }}>IN FLIGHT</span> : null}
          </div>
        ) : (
          flash ? <div className="dim" style={{ padding: '4px 16px 10px', fontSize: 11 }}>{flash}</div> : null
        )}
        {routineN > 0 ? (
          <div className="dimmer" style={{ padding: '0 16px 10px', fontSize: 11 }}>
            + {routineN} routine (Form 3/4/5 · 144 · 13F) not mapped
          </div>
        ) : null}
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">▣</span>
          <h2>MAPS</h2>
          <span className="m">open one · digest vs pack · closed until you pick a run</span>
        </div>
        {mapRows.length === 0 ? (
          <div className="emptyD">No filing maps yet. MAP FILINGS writes the first run.</div>
        ) : (
          <table className="fmap-maps">
            <thead><tr><th>When</th><th>Status</th><th>Summary</th></tr></thead>
            <tbody>
              {mapRows.map((r) => {
                const open = r.status === 'complete';
                const selected = r.run_id === selectedId;
                const preview = open ? dossierHeadline(r.summary || '') : '';
                const closed = open && !!r.promoted;
                return (
                  <tr
                    key={r.run_id}
                    className={`${open ? 'goto' : ''}${selected ? ' fmap-open' : ''}`.trim()}
                    onClick={() => { if (open) setSelectedId(selected ? null : r.run_id); }}
                  >
                    <td className="idc mono">{String(r.finished_at || r.started_at || '').slice(0, 10) || '—'}</td>
                    <td className="idc">
                      <span className={`chipC${r.status === 'complete' ? ' ok' : r.status === 'failed' ? ' watch' : ''}`}>
                        {r.status}
                      </span>
                    </td>
                    <td>
                      {open ? (
                        <div className="fmap-maps-line">
                          {closed ? <span className="chipC watch fmap-maps-tag">PROPOSED</span> : null}
                          {open && !closed ? <span className="chipC dim fmap-maps-tag">CLOSEOUT</span> : null}
                          <span className="fmap-maps-head">{preview || 'Map complete'}</span>
                          <span className="fmap-maps-cue">{selected ? 'Hide analysis' : 'Open analysis'}</span>
                        </div>
                      ) : (
                        <span className="dim" style={{ fontSize: 11 }}>{r.error || '—'}</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        {selected && selected.status === 'complete' ? (
          <FilingMapDossier
            summary={delta?.summary || selected.summary || ''}
            delta={delta}
            finishedAt={selected.finished_at || selected.started_at}
            busy={busy}
            onOpenChat={() => openChat(selected.run_id)}
            onProposeFromMap={proposeFromMap}
          />
        ) : null}
      </div>
    </div>
  );
}
