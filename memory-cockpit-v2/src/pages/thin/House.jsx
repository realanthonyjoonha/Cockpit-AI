// Shared thin house — vault-first. Path 1.0: EDIT → SAVE (allowlisted).
// Agent path: Grok MCP propose_house_view → pending → human ACCEPT/REJECT on glass.
// Decision-support only. Never auto-CONFIRM.
import React, { useEffect, useState, useCallback } from 'react';
import { api, apiPost } from '../../api.js';
import GrokAgents from './GrokAgents.jsx';

/** @param {{ desk: { slug: string, ticker: string, label: string, house_file?: string } }} props */
export default function ThinHouse({ desk }) {
  const { slug, ticker, label, house_file } = desk;
  const [h, setH] = useState(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [savedBanner, setSavedBanner] = useState(null);
  const [copyNote, setCopyNote] = useState(null);
  const [pending, setPending] = useState([]);
  const [activeProposal, setActiveProposal] = useState(null);
  const [propBusy, setPropBusy] = useState(false);
  const [showRaw, setShowRaw] = useState(false);

  const load = useCallback(() => {
    return api(`${slug}/house`)
      .then((data) => { setH(data); return data; })
      .catch(() => {
        const fail = { available: false, reason: 'request failed' };
        setH(fail);
        return fail;
      });
  }, [slug]);

  const loadProposals = useCallback(() => {
    return api(`${slug}/house/proposals?status=pending`)
      .then((data) => {
        setPending(Array.isArray(data.proposals) ? data.proposals : []);
        return data;
      })
      .catch(() => setPending([]));
  }, [slug]);

  useEffect(() => {
    setEditing(false);
    setErr(null);
    setSavedBanner(null);
    setCopyNote(null);
    setActiveProposal(null);
    setShowRaw(false);
    load();
    loadProposals();
  }, [slug, load, loadProposals]);

  function startEdit(seed) {
    setErr(null);
    setSavedBanner(null);
    if (typeof seed === 'string' && seed.length) {
      setDraft(seed);
    } else if (typeof h?.markdown === 'string' && h.markdown.length) {
      setDraft(h.markdown);
    } else {
      setDraft(
        `---\ntype: house-view\nticker: ${ticker}\nupdated: ${new Date().toISOString().slice(0, 10)}\nstatus: FORMING\nowner: "Anthony"\n---\n\n# House View — ${label} (${ticker})\n\n> **Stance:** (edit me)\n\n`,
      );
    }
    setEditing(true);
  }

  function cancelEdit() {
    setEditing(false);
    setErr(null);
    setDraft('');
  }

  async function save() {
    if (busy) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await apiPost(`${slug}/house/save`, { markdown: draft });
      if (!out?.ok) {
        setErr(out?.error || 'save failed');
        return;
      }
      setEditing(false);
      setDraft('');
      setSavedBanner({
        saved_at: out.saved_at,
        bytes: out.bytes,
        house_file: out.house_file || house_file,
      });
      if (out.house) setH(out.house);
      else await load();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setBusy(false);
    }
  }

  async function openProposal(id) {
    setPropBusy(true);
    setErr(null);
    try {
      const out = await api(`${slug}/house/proposals/${encodeURIComponent(id)}`);
      if (!out?.proposal) {
        setErr(out?.error || 'proposal not found');
        return;
      }
      setShowRaw(false);
      setActiveProposal(out.proposal);
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setPropBusy(false);
    }
  }

  async function acceptProposal(id) {
    if (propBusy) return;
    setPropBusy(true);
    setErr(null);
    try {
      const out = await apiPost(`${slug}/house/proposals/${encodeURIComponent(id)}/accept`);
      if (!out?.ok) {
        setErr(out?.error || 'accept failed');
        return;
      }
      setActiveProposal(null);
      setSavedBanner({
        saved_at: out.written?.saved_at,
        bytes: out.written?.bytes,
        house_file: out.proposal?.house_file || house_file,
        fromProposal: true,
      });
      if (out.house) setH(out.house);
      else await load();
      await loadProposals();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setPropBusy(false);
    }
  }

  async function rejectProposal(id) {
    if (propBusy) return;
    setPropBusy(true);
    setErr(null);
    try {
      const out = await apiPost(`${slug}/house/proposals/${encodeURIComponent(id)}/reject`);
      if (!out?.ok) {
        setErr(out?.error || 'reject failed');
        return;
      }
      setActiveProposal(null);
      setCopyNote(null);
      await loadProposals();
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setPropBusy(false);
    }
  }

  async function copyAgentContext() {
    setCopyNote(null);
    try {
      const ctx = await api(`${slug}/house/assist-context`);
      await navigator.clipboard.writeText(ctx.clipboard_text || '');
      setCopyNote(`Copied ${ctx.chars || '?'} chars`);
    } catch (e) {
      setCopyNote(e.message || 'copy failed');
    }
  }

  if (!h) return <div className="crumb">LOADING…</div>;

  const canEdit = h.editable !== false;
  const fileLabel = (house_file || h.house_file || 'HOUSE-VIEW').toUpperCase();
  const btnSm = { padding: '3px 8px', fontSize: 10 };

  // Quiet ACCEPT surface (same pattern as risk detail PENDING rows)
  const proposalsPanel = (pending.length > 0 || activeProposal) && (
    <div className="sect" style={{ marginBottom: 10 }}>
      <div className="shd">
        <span className="no">P</span>
        <h2>PENDING</h2>
        <span className="m">
          {activeProposal ? 'review' : `${pending.length} house`}
        </span>
      </div>
      <div style={{ padding: '8px 16px 12px' }}>
        {err && (
          <div style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--fired, #e07070)' }}>{err}</div>
        )}
        {pending.length > 0 && !activeProposal && pending.map((p) => (
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
            <span className="dim" style={{ fontSize: 9 }}>HOUSE</span>
            <span style={{ flex: 1, minWidth: 120 }}>{p.summary || 'House draft'}</span>
            <button
              type="button"
              className="desk-btn on"
              disabled={propBusy}
              onClick={() => openProposal(p.id)}
              style={btnSm}
              title={p.id}
            >
              REVIEW
            </button>
            <button
              type="button"
              className="desk-btn"
              disabled={propBusy}
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
              <span style={{ fontSize: 13, fontWeight: 600, lineHeight: 1.4 }}>
                {activeProposal.summary || 'House draft'}
              </span>
            </div>
            {activeProposal.rationale ? (
              <div className="house-review-lede">
                {activeProposal.rationale}
              </div>
            ) : null}
            {activeProposal.review?.unchanged ? (
              <div className="dim" style={{ fontSize: 12, margin: '0 0 10px' }}>
                Draft matches the live house. Nothing to apply unless you still want ACCEPT.
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
            {activeProposal.review?.html ? (
              <div className="house-review-prose">
                <div className="house-changes-k">PROPOSED HOUSE</div>
                <div className="prose wide" dangerouslySetInnerHTML={{ __html: activeProposal.review.html }} />
              </div>
            ) : null}
            {Array.isArray(activeProposal.review?.hunks) && activeProposal.review.hunks.length > 0 && (
              <div className="house-diff">
                <div className="house-changes-k">VS LIVE HOUSE</div>
                {activeProposal.review.hunks.map((row, i) => (
                  <div key={`${row.t}-${i}`} className={`house-diff-line ${row.t}`}>
                    <span className="mark">{row.t === 'add' ? '+' : row.t === 'del' ? '−' : row.t === 'gap' ? '·' : ' '}</span>
                    <span>{row.s}</span>
                  </div>
                ))}
              </div>
            )}
            {showRaw ? (
              <pre className="house-review-raw">
                {activeProposal.markdown || '(no markdown)'}
              </pre>
            ) : null}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                className="desk-btn on"
                disabled={propBusy}
                onClick={() => acceptProposal(activeProposal.id)}
                style={btnSm}
                title={activeProposal.id}
              >
                {propBusy ? '…' : 'ACCEPT'}
              </button>
              <button
                type="button"
                className="desk-btn"
                disabled={propBusy}
                onClick={() => rejectProposal(activeProposal.id)}
                style={btnSm}
              >
                REJECT
              </button>
              <button
                type="button"
                className="desk-btn"
                disabled={propBusy}
                onClick={() => {
                  if (activeProposal.markdown) startEdit(activeProposal.markdown);
                }}
                style={btnSm}
              >
                EDIT
              </button>
              <button
                type="button"
                className="desk-btn"
                disabled={propBusy}
                onClick={() => { setShowRaw(false); setActiveProposal(null); }}
                style={btnSm}
              >
                BACK
              </button>
              <button
                type="button"
                className="desk-btn"
                disabled={propBusy || !activeProposal.markdown}
                onClick={() => setShowRaw((v) => !v)}
                style={btnSm}
              >
                {showRaw ? 'Hide raw' : 'Raw markdown'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );

  if (editing) {
    return (
      <div>
        <div className="crumb">
          {label} · HOUSE VIEW · <b>EDIT</b>
          {' · '}<span className="mono" style={{ fontSize: 10 }}>{house_file || h.house_file}</span>
        </div>
        {proposalsPanel}
        <div className="sect">
          <div className="rdhead" style={{ marginBottom: 8 }}>
            <h1 style={{ fontSize: 16 }}>Edit house view</h1>
            <div className="chips" style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button type="button" className="desk-btn on" disabled={busy || !draft.trim()} onClick={save} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11 }}>
                {busy ? 'SAVING…' : 'SAVE'}
              </button>
              <button type="button" className="desk-btn" disabled={busy} onClick={cancelEdit} style={{ padding: '6px 12px', borderRadius: 6, fontSize: 11 }}>
                CANCEL
              </button>
            </div>
          </div>
          {err && <div style={{ margin: '0 0 8px', fontSize: 11, color: 'var(--fired, #e07070)' }}>{err}</div>}
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            spellCheck={false}
            disabled={busy}
            style={{
              width: '100%',
              minHeight: 'min(70vh, 560px)',
              boxSizing: 'border-box',
              background: 'var(--panel, #141820)',
              border: '1px solid var(--hairline)',
              color: 'inherit',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
              fontSize: 12,
              lineHeight: 1.45,
              padding: '12px 14px',
              borderRadius: 6,
              resize: 'vertical',
            }}
          />
        </div>
      </div>
    );
  }

  if (!h.available || !h.hero) {
    return (
      <div>
        <div className="crumb">{label} · HOUSE VIEW · <b>EMPTY</b></div>
        {proposalsPanel}
        <div className="sect">
          <div className="emptyD">
            {h.reason || 'No house view resolved.'} Expected vault{' '}
            <span className="mono">research-wiki/{house_file || 'house-view-*.md'}</span>.
          </div>
          <div style={{ marginTop: 12, display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {canEdit && (
              <button type="button" className="desk-btn on" onClick={() => startEdit()} style={{ padding: '8px 14px', borderRadius: 6, fontSize: 11 }}>
                CREATE / EDIT HOUSE FILE
              </button>
            )}
            <GrokAgents
              variant="house"
              desk={slug}
              compact
              onFlash={(msg) => setCopyNote(msg || null)}
            />
            <button type="button" className="desk-btn" onClick={copyAgentContext} style={{ padding: '8px 14px', borderRadius: 6, fontSize: 11 }}>
              AGENT CONTEXT
            </button>
          </div>
          {copyNote && (
            <div style={{ marginTop: 8, fontSize: 11, color: 'var(--ok, #5cba8a)' }}>{copyNote}</div>
          )}
        </div>
      </div>
    );
  }

  const st = h.hero.status === 'CONFIRMED' ? 'ok' : 'watch';
  const sourceLabel = h.source === 'vault' ? fileLabel : 'PACK EXCERPT';

  return (
    <div>
      <div className="crumb">
        {label} · HOUSE VIEW · <b>{sourceLabel}</b>
        {h.source === 'vault' ? (
          <>{' · '}<span className="chipC ok" style={{ fontSize: 9 }}>VAULT</span></>
        ) : (
          <>{' · '}<span className="chipC watch" style={{ fontSize: 9 }}>PACK ONLY</span></>
        )}
        {h.compiled_at ? ` · PACK ${String(h.compiled_at).slice(0, 10)}` : ''}
        {pending.length > 0 && (
          <>{' · '}<span className="chipC watch" style={{ fontSize: 9 }}>{pending.length} PROPOSAL{pending.length > 1 ? 'S' : ''}</span></>
        )}
        {canEdit && (
          <>
            {' · '}
            <button type="button" className="desk-btn on" onClick={() => startEdit()} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, verticalAlign: 'middle' }}>
              EDIT
            </button>
          </>
        )}
        {' · '}
        <button type="button" className="desk-btn" onClick={copyAgentContext} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, verticalAlign: 'middle' }}>
          AGENT CONTEXT
        </button>
        {' · '}
        <GrokAgents
          variant="house"
          desk={slug}
          compact
          onFlash={(msg) => setCopyNote(msg || null)}
        />
        {' · '}
        <button type="button" className="desk-btn" onClick={loadProposals} style={{ padding: '2px 8px', borderRadius: 4, fontSize: 10, verticalAlign: 'middle' }}>
          REFRESH PROPOSALS
        </button>
      </div>

      {savedBanner && (
        <div style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--ok, #5cba8a)' }}>
          {savedBanner.fromProposal ? 'Accepted · ' : 'Saved · '}
          {savedBanner.house_file}
          {savedBanner.bytes != null ? ` · ${savedBanner.bytes}b` : ''}
        </div>
      )}
      {copyNote && (
        <div style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--ok, #5cba8a)' }}>
          {copyNote}
        </div>
      )}
      {err && !activeProposal && (
        <div style={{ margin: '0 0 6px', fontSize: 11, color: 'var(--fired, #e07070)' }}>{err}</div>
      )}

      {proposalsPanel}

      {h.source === 'pack_excerpt' && h.source_banner && (
        <div className="emptyD" style={{ margin: '0 0 8px', borderColor: 'var(--watch)' }}>
          {h.source_banner}
        </div>
      )}

      <div className="sect">
        <div className="rdhead">
          <h1 style={{ fontSize: 18 }}>{h.hero.title}</h1>
          <div className="chips">
            <span className={`chipC ${st}`}>
              {h.hero.status}{h.hero.date ? ` · ${h.hero.date}` : ''}
            </span>
          </div>
        </div>
        <div className="prose wide" dangerouslySetInnerHTML={{ __html: h.hero.html }} />
      </div>
    </div>
  );
}
