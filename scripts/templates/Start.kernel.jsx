// Start — kernel cold start: product ready, underwrite next company from here.
// Keep in sync with scripts/templates/Start.kernel.jsx (export-kernel overwrites Start.jsx).
// Operate glance: multi-desk WATCH / house / Street attention (factory-native).
// Decision-support only. User picks company and gates house/risks.
import React, { useCallback, useEffect, useState } from 'react';
import { api, apiPost } from '../api.js';
import { THIN_DESKS_FALLBACK } from '../thinDesks.js';

/** Client-side ticker filter; server re-sanitizes. */
function sanitizeTickerInput(raw) {
  return String(raw || '')
    .toUpperCase()
    .replace(/[^A-Z0-9.-]/g, '')
    .slice(0, 12);
}

function attnLabel(row) {
  const a = Array.isArray(row.attention) ? row.attention : [];
  if (a.includes('compile-stalled')) return { t: 'COMPILE STALLED', cls: 'fired' };
  if (a.includes('compile-running')) return { t: 'COMPILING…', cls: 'watch' };
  if (a.includes('fired')) return { t: 'FIRED', cls: 'fired' };
  if (a.includes('watch')) return { t: `${row.watch_count} WATCH`, cls: 'watch' };
  if (a.includes('house') || a.includes('compile')) return { t: a.includes('compile') ? 'COMPILE' : 'HOUSE', cls: 'watch' };
  if (a.includes('street') || a.includes('street-stale')) {
    return { t: a.includes('street-stale') ? 'STREET STALE' : 'STREET', cls: 'dim' };
  }
  if (a.includes('pack') || a.includes('error')) return { t: 'PACK', cls: 'dim' };
  return { t: 'OK', cls: 'ok' };
}

/**
 * @param {{ desks?: Array, onRefreshDesks?: () => void }} props
 * desks: live registry from App (preferred); falls back to build-time list.
 */
export default function Start({ desks: desksProp, onRefreshDesks } = {}) {
  const desks = Array.isArray(desksProp) ? desksProp : THIN_DESKS_FALLBACK;
  const deskCount = desks.length;
  const [ticker, setTicker] = useState('');
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState(null);
  const [glance, setGlance] = useState(null);
  const [glanceErr, setGlanceErr] = useState(null);
  const [glanceLoading, setGlanceLoading] = useState(false);

  const loadGlance = useCallback(async () => {
    if (deskCount === 0) {
      setGlance(null);
      setGlanceErr(null);
      return;
    }
    setGlanceLoading(true);
    setGlanceErr(null);
    try {
      const g = await api('operate-glance');
      setGlance(g);
    } catch (e) {
      setGlance(null);
      setGlanceErr(e.message || 'operate-glance failed');
    } finally {
      setGlanceLoading(false);
    }
  }, [deskCount]);

  useEffect(() => {
    loadGlance();
  }, [loadGlance]);

  useEffect(() => {
    const n = (glance?.totals?.compiles_running || 0) + (glance?.totals?.compiles_stalled || 0);
    if (!n) return undefined;
    const t = setInterval(loadGlance, 5000);
    return () => clearInterval(t);
  }, [glance, loadGlance]);

  const openNewDesk = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setFlash(null);
    try {
      const body = { action: 'new-desk' };
      const t = sanitizeTickerInput(ticker);
      if (t) body.ticker = t;
      const out = await apiPost('open-grok', body);
      if (!out?.ok) {
        setFlash(out?.error || 'open Grok failed');
      } else {
        setFlash(`Opened · ${out.initial_prompt || '/cockpit-new-desk'}`);
        if (typeof onRefreshDesks === 'function') onRefreshDesks();
      }
    } catch (e) {
      setFlash(e.message || 'open Grok failed (localhost only · macOS Terminal)');
    } finally {
      setBusy(false);
    }
  }, [busy, ticker, onRefreshDesks]);

  return (
    <div>
      <div className="crumb">
        START · <b>PRODUCT READY</b>
        {' '}· {deskCount === 0 ? 'no company underwritten yet' : `${deskCount} desk(s) · add next`}
        {' '}· decision-support only
      </div>

      {/* Hero + underwrite CTA — single card; shell product (works with 0 desks) */}
      <div className="sect">
        <div className="rdhead">
          <h1>
            {deskCount === 0
              ? 'No company underwritten yet'
              : `${deskCount} desk${deskCount === 1 ? '' : 's'} registered · build next`}
          </h1>
          <div className="chips">
            <span className="chipC ok">KERNEL</span>
            <span className="chipC ok">SHELL</span>
            <span className="chipC watch">{deskCount === 0 ? 'PICK NEXT' : 'ADD COMPANY'}</span>
          </div>
        </div>
        <div className="prose">
          <p>
            {deskCount === 0 ? (
              <>
                Product shell is ready — glass, ontology, and agents. Choose a company when you are;
                you own house stance and risk register after research begins.
              </>
            ) : (
              <>
                Shell is live with registered desk(s). Underwrite another name with the same factory —
                no new UI. You still CONFIRM house and ACCEPT risks.
              </>
            )}
          </p>
        </div>
        <div className="start-cta">
          <div className="start-cta-label">Underwrite · open Grok</div>
          <div className="start-cta-row">
            <label className="start-cta-field">
              <span>Ticker</span>
              <input
                type="text"
                value={ticker}
                onChange={(e) => setTicker(sanitizeTickerInput(e.target.value))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    openNewDesk();
                  }
                }}
                placeholder="Optional"
                disabled={busy}
                maxLength={12}
                autoComplete="off"
                spellCheck={false}
                aria-label="Optional ticker for new desk"
              />
            </label>
            <button
              type="button"
              className="start-cta-go"
              onClick={openNewDesk}
              disabled={busy}
              title="Open Grok Build in this monorepo with /cockpit-new-desk"
            >
              {busy ? 'Opening…' : 'Build next company'}
            </button>
          </div>
          <p className="start-cta-note">
            Opens Grok in this monorepo with deep parallel research (default).
            Assist only — you CONFIRM house and ACCEPT risks. No invented book.
          </p>
          {flash && (
            <span
              className={`start-cta-flash${/fail|error|only/i.test(flash) ? ' err' : ' ok'}`}
              role="status"
            >
              {flash}
            </span>
          )}
        </div>
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">0</span>
          <h2>SHELL STATUS</h2>
          <span className="m">expected cold start</span>
        </div>
        <table>
          <tbody>
            <tr>
              <td style={{ width: '28%' }}><b>Port</b></td>
              <td className="dim">
                Prefer <span className="mono">:4682</span> when live monorepo holds <span className="mono">:4681</span>
                {' '}· <span className="mono">./scripts/run-glass.sh</span> defaults 4682 if <span className="mono">KERNEL.md</span> present
              </td>
            </tr>
            <tr>
              <td><b>Thin desks</b></td>
              <td className="dim">
                {deskCount === 0 ? (
                  <>
                    <span className="chipC ok" style={{ marginRight: 6 }}>0 registered</span>
                    empty registry is correct for cold start
                  </>
                ) : (
                  <>
                    <span className="chipC watch" style={{ marginRight: 6 }}>{deskCount} registered</span>
                    scaffold or underwritten — not automatic research
                  </>
                )}
              </td>
            </tr>
            <tr>
              <td><b>Packs</b></td>
              <td className="dim">
                Empty until research + <span className="mono">./ont compile</span> · doctor may warn “no packs” (OK here)
              </td>
            </tr>
            <tr>
              <td><b>CLI check</b></td>
              <td className="dim">
                <span className="mono">./scripts/doctor.sh</span> · paths green · packs optional on kernel
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">1</span>
          <h2>WHAT IS READY</h2>
          <span className="m">product shell</span>
        </div>
        <table>
          <tbody>
            <tr>
              <td style={{ width: '28%' }}><b>Glass</b></td>
              <td className="dim">UI on this kernel · monorepo vault/store paths</td>
            </tr>
            <tr>
              <td><b>Ontology</b></td>
              <td className="dim">Compile/verify engine · packs empty until you underwrite</td>
            </tr>
            <tr>
              <td><b>Grok MCP</b></td>
              <td className="dim">Once: <span className="mono">./scripts/install-grok-mcp.sh</span></td>
            </tr>
            <tr>
              <td><b>Thin template</b></td>
              <td className="dim">Same cockpit after research + pack + thin-desks.json row</td>
            </tr>
          </tbody>
        </table>
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">2</span>
          <h2>WHAT YOU DO NEXT</h2>
          <span className="m">human gates</span>
        </div>
        <div className="prose" style={{ padding: '8px 16px 12px', fontSize: 12, lineHeight: 1.55 }}>
          <ol style={{ margin: 0, paddingLeft: 18 }}>
            <li>
              <b>Build next company</b> (above) — or pick a ticker and open Grok yourself with{' '}
              <span className="mono">/cockpit-new-desk</span>.
            </li>
            <li>
              <b>Scaffold structure</b> (no invented research) if the agent does not run it:
              <div className="mono" style={{ marginTop: 6, marginBottom: 4, padding: '8px 10px', background: 'var(--panel, #0f1419)', borderRadius: 4, fontSize: 11 }}>
                ./scripts/scaffold-new-desk.sh TICKER [slug] [&quot;Display Name&quot;]
              </div>
              Creates vault folders, FORMING house stub, empty risks SoR, pack JSON, thin-desks row.
              Restart glass · desk appears empty until you research.
            </li>
            <li>
              <b>Research</b> into the vault (<span className="mono">raw/…</span>, entity, risks SoR).
              Grok assists; it does not invent CONFIRM/ACCEPT.
            </li>
            <li>
              <b>Pack</b> — <span className="mono">./ont compile TICKER</span> ·
              {' '}<span className="mono">./ont verify TICKER</span> (exit 0).
            </li>
            <li><b>House + risks</b> — you SAVE/ACCEPT on glass.</li>
          </ol>
          <p className="dim" style={{ marginTop: 10, fontSize: 11 }}>
            Playbook: <span className="mono">memory-cockpit-v2/plans/NEW-DESK-PLAYBOOK.md</span>
            {' '}· <span className="mono">COLD-START.md</span>
            {' '}· Optional reference: <span className="mono">install-example-msft.sh</span> from live monorepo
          </p>
        </div>
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">3</span>
          <h2>NOT COLD START</h2>
          <span className="m">do not fake</span>
        </div>
        <div className="prose dim" style={{ padding: '8px 16px 12px', fontSize: 12 }}>
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            <li>Inventing house or WATCH so a desk looks full</li>
            <li>Auto-ACCEPT of any proposal</li>
            <li>Memory specialist desk (not in this kernel)</li>
          </ul>
        </div>
      </div>

      {deskCount === 0 ? (
        <div className="sect">
          <div className="emptyD" style={{ margin: 16 }}>
            No thin desks registered (<span className="mono">desks: []</span>).
            Use <b>Build next company</b> above, or scaffold / optional MSFT example — then they appear here and in the switcher.
          </div>
        </div>
      ) : (
        <div className="sect">
          <div className="shd">
            <span className="no">·</span>
            <h2>OPERATE GLANCE</h2>
            <span className="m">
              multi-desk attention · WATCH / house / Street
              {glance?.totals ? (
                <>
                  {' · '}
                  {glance.totals.with_watch} with WATCH
                  {glance.totals.with_fired ? ` · ${glance.totals.with_fired} FIRED` : ''}
                  {glance.totals.street_empty ? ` · ${glance.totals.street_empty} Street empty` : ''}
                  {glance.totals.need_compile ? ` · ${glance.totals.need_compile} need COMPILE` : ''}
                  {glance.totals.compiles_running ? ` · ${glance.totals.compiles_running} compiling` : ''}
                  {glance.totals.compiles_stalled ? ` · ${glance.totals.compiles_stalled} compile STALLED` : ''}
                </>
              ) : null}
            </span>
            <button
              type="button"
              className="desk-btn"
              onClick={loadGlance}
              disabled={glanceLoading}
              style={{ marginLeft: 'auto', padding: '3px 10px', fontSize: 10 }}
              title="Refresh operate glance"
            >
              {glanceLoading ? '…' : 'Refresh'}
            </button>
          </div>
          {glanceErr && (
            <div className="emptyD" style={{ margin: 12 }}>
              Glance failed: {glanceErr} · restart glass if server just updated
            </div>
          )}
          {!glanceErr && glanceLoading && !glance && (
            <div className="emptyD" style={{ margin: 12 }}>Loading desk attention…</div>
          )}
          {glance?.desks?.length > 0 && (
            <table>
              <thead>
                <tr>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Desk</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Attn</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>House</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Risks</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Street</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Compile</th>
                  <th style={{ textAlign: 'left', padding: '6px 10px' }}>Open</th>
                </tr>
              </thead>
              <tbody>
                {glance.desks.map((row) => {
                  const att = attnLabel(row);
                  return (
                    <tr key={row.slug}>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <b>{row.ticker}</b>
                        <span className="dim" style={{ marginLeft: 6, fontSize: 10 }}>
                          {row.displayName || row.label}
                        </span>
                      </td>
                      <td style={{ padding: '6px 10px' }}>
                        <span className={`chipC ${att.cls}`}>{att.t}</span>
                      </td>
                      <td className="dim" style={{ padding: '6px 10px', fontSize: 10, maxWidth: 200 }}>
                        {row.house_status || '—'}
                        {row.sor_ahead_of_pack ? ' · SoR ahead' : ''}
                      </td>
                      <td className="dim" style={{ padding: '6px 10px', fontSize: 10 }}>
                        {row.fired_count > 0 && <span className="chipC fired" style={{ marginRight: 4 }}>{row.fired_count}F</span>}
                        {row.watch_count > 0 ? (
                          <span className="chipC watch">{row.watch_count}W</span>
                        ) : (
                          <span>{row.risks_count || 0} total</span>
                        )}
                      </td>
                      <td className="dim" style={{ padding: '6px 10px', fontSize: 10 }}>
                        {row.street_status || '—'}
                        {row.street_n_firms ? ` · ${row.street_n_firms}` : ''}
                        {row.street_as_of ? ` · ${row.street_as_of}` : ''}
                      </td>
                      <td className="dim" style={{ padding: '6px 10px', fontSize: 10 }}>
                        {row.research_stalled ? (
                          <span className="chipC fired">STALLED</span>
                        ) : row.research_running ? (
                          <span className="chipC watch">COMPILING</span>
                        ) : row.research_last_complete_at ? (
                          <span title={row.research_last_complete_run_id}>
                            last {String(row.research_last_complete_at).slice(0, 10)}
                            {row.research_last_complete_n_sources ? ` · ${row.research_last_complete_n_sources} src` : ''}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding: '6px 10px', whiteSpace: 'nowrap' }}>
                        <button
                          type="button"
                          className="desk-btn"
                          style={{ padding: '3px 8px', fontSize: 10, marginRight: 4 }}
                          onClick={() => { window.location.hash = `#/${row.slug}/overview`; }}
                        >
                          Book
                        </button>
                        <button
                          type="button"
                          className="desk-btn"
                          style={{ padding: '3px 8px', fontSize: 10, marginRight: 4 }}
                          onClick={() => { window.location.hash = `#/${row.slug}/risks`; }}
                        >
                          Risks
                        </button>
                        <button
                          type="button"
                          className="desk-btn"
                          style={{ padding: '3px 8px', fontSize: 10 }}
                          onClick={() => { window.location.hash = `#/${row.slug}/street`; }}
                        >
                          Street
                        </button>
                        <button
                          type="button"
                          className="desk-btn"
                          style={{ padding: '3px 8px', fontSize: 10, marginLeft: 4 }}
                          onClick={() => { window.location.hash = `#/${row.slug}/reports`; }}
                        >
                          Reports
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
          <p className="dim" style={{ padding: '8px 14px 12px', fontSize: 10, margin: 0 }}>
            Decision-support only · Street ≠ house PT · COMPILE BOOK when SoR ahead of pack · empty product stays clean with 0 desks
          </p>
        </div>
      )}
    </div>
  );
}
