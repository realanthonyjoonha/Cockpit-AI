// FilingMapDossier — Filings-room digest (facts vs pack) + OPEN GROK + propose closeout.
// Decision-support only. Not pack SoR.
import React, { useMemo, useState } from 'react';
import { inBookChip } from './filingLink.js';
import { filingPageDigest, closeoutPreviewCounts } from './filingMapPaint.js';

/**
 * @param {{
 *   summary?: string,
 *   delta?: object,
 *   finishedAt?: string,
 *   busy?: boolean,
 *   onOpenChat?: () => void,
 *   onProposeFromMap?: (opts: { dryRun: boolean }) => Promise<object|null>,
 * }} props
 */
export default function FilingMapDossier({
  summary,
  delta,
  finishedAt,
  busy,
  onOpenChat,
  onProposeFromMap,
}) {
  const pending = !delta || typeof delta !== 'object';
  const vm = filingPageDigest({ summary, delta: pending ? {} : delta, finishedAt });
  const preview = useMemo(
    () => (pending ? { house: 0, risk: 0, add: 0, actionable: 0 } : closeoutPreviewCounts(delta)),
    [pending, delta],
  );
  const [dry, setDry] = useState(null);
  const [result, setResult] = useState(null);
  const [localBusy, setLocalBusy] = useState(false);
  const [err, setErr] = useState(null);

  const runPropose = async (dryRun) => {
    if (!onProposeFromMap || busy || localBusy) return;
    setLocalBusy(true);
    setErr(null);
    try {
      const out = await onProposeFromMap({ dryRun });
      if (!out || out.ok === false) {
        setErr(out?.error || 'propose failed');
        return;
      }
      if (dryRun) setDry(out);
      else {
        setResult(out);
        setDry(null);
      }
    } catch (e) {
      setErr(e.message || String(e));
    } finally {
      setLocalBusy(false);
    }
  };

  const accBlocks = !pending && vm.accessions.map((row) => {
    const chip = inBookChip(row.in_book);
    return (
      <div key={row.accession || `${row.form}-${row.filed}`} className="fmap-acc-block">
        <div className="fmap-acc">
          {row.form ? <b>{row.form}</b> : null}
          {row.filed ? <span className="mono dim">{row.filed}</span> : null}
          <span className={`chipC${chip.cls ? ` ${chip.cls}` : ''}`}>{chip.t}</span>
        </div>
        {row.what ? <div className="fmap-what-full">{row.what}</div> : null}
        {row.excerpt ? (
          <blockquote className="fmap-excerpt">{row.excerpt}</blockquote>
        ) : null}
        {row.addRisk.map((c, i) => (
          <div key={`ar${i}`} className="fmap-sig">
            <b>Add-risk</b>
            {c.name || c.title}
            {c.note ? <div className="dim" style={{ fontSize: 12, marginTop: 4 }}>{c.note}</div> : null}
          </div>
        ))}
        {row.gaps.map((g, i) => (
          <div key={`g${i}`} className="dimmer" style={{ fontSize: 11, margin: '4px 0' }}>{g}</div>
        ))}
      </div>
    );
  });

  const digest = vm.paragraphs.length > 0 ? (
    <div className="fmap-summary">
      {vm.paragraphs.map((s, i) => <p key={i}>{s}</p>)}
    </div>
  ) : (!pending ? (
    <div className="dim" style={{ fontSize: 12 }}>Map complete</div>
  ) : null);

  const side = accBlocks && accBlocks.length ? (
    <div className="fmap-digest-side">
      <div className="fmap-k">Accessions</div>
      {accBlocks}
    </div>
  ) : null;

  const counts = dry?.counts || result?.counts;
  const createdN = Array.isArray(result?.created) ? result.created.length : 0;

  return (
    <div className="fmap fmap-digest">
      <div className="fmap-digest-head">
        <div className="fmap-k">Digest · vs last COMPILE BOOK</div>
        <div className="fmap-actions">
          <button type="button" className="btn" disabled={busy || localBusy} onClick={onOpenChat}>
            OPEN GROK
          </button>
          {onProposeFromMap && !pending ? (
            <button
              type="button"
              className="btn"
              disabled={busy || localBusy}
              onClick={() => runPropose(true)}
              title="Preview pending proposals from this map (no vault write)"
            >
              PROPOSE FROM MAP
            </button>
          ) : null}
        </div>
      </div>
      {pending ? <div className="dimmer fmap-quiet">Loading map…</div> : null}
      {!pending && preview.actionable > 0 ? (
        <div className="dim" style={{ fontSize: 11, marginBottom: 8 }}>
          Closeout hints · {preview.house} house trip · {preview.risk} risk test · {preview.add} add-risk
          {' '}(server dry-run drops unchanged SoR)
        </div>
      ) : null}
      {!pending && preview.actionable === 0 ? (
        <div className="dimmer" style={{ fontSize: 11, marginBottom: 8 }}>
          No obvious trips / add-risks in paint — dry-run still checks status deltas vs SoR
        </div>
      ) : null}
      {err ? <div className="dim" style={{ color: 'var(--watch)', fontSize: 12, marginBottom: 8 }}>{err}</div> : null}
      {dry ? (
        <div className="fmap-closeout" style={{ marginBottom: 12, padding: '8px 0', borderTop: '1px solid var(--line, #333)' }}>
          <div className="fmap-k">Closeout preview (pending only)</div>
          <div style={{ fontSize: 12, marginTop: 4 }}>
            {counts?.house || 0} house · {counts?.risk_status || 0} risk status · {counts?.add_risk || 0} add-risk
            {counts?.skipped ? ` · ${counts.skipped} skipped` : ''}
          </div>
          {(dry.house || []).slice(0, 4).map((h, i) => (
            <div key={`h${i}`} className="dim" style={{ fontSize: 11, marginTop: 4 }}>
              House trip · {h.trigger?.slice(0, 100) || 'trigger'}
            </div>
          ))}
          {(dry.risk_status || []).slice(0, 6).map((r, i) => (
            <div key={`r${i}`} className="dim" style={{ fontSize: 11, marginTop: 4 }}>
              {r.risk_name || r.risk_id} · {r.from_status || '?'} → {r.to_status}
            </div>
          ))}
          {(dry.add_risk || []).slice(0, 4).map((a, i) => (
            <div key={`a${i}`} className="dim" style={{ fontSize: 11, marginTop: 4 }}>
              Add · {a.title}
            </div>
          ))}
          <div className="fmap-actions" style={{ marginTop: 8 }}>
            <button
              type="button"
              className="btn"
              disabled={busy || localBusy || !(counts?.actionable > 0)}
              onClick={() => runPropose(false)}
            >
              CONFIRM PROPOSE
            </button>
            <button
              type="button"
              className="btn"
              disabled={busy || localBusy}
              onClick={() => setDry(null)}
            >
              Cancel
            </button>
          </div>
          {!(counts?.actionable > 0) ? (
            <div className="dimmer" style={{ fontSize: 11, marginTop: 6 }}>
              Nothing to propose — map found no trips / status changes / add-risks vs SoR.
            </div>
          ) : (
            <div className="dimmer" style={{ fontSize: 11, marginTop: 6 }}>
              Creates pending proposals only. ACCEPT on House / Risks, then COMPILE BOOK.
            </div>
          )}
        </div>
      ) : null}
      {result ? (
        <div className="fmap-closeout" style={{ marginBottom: 12, fontSize: 12 }}>
          {createdN > 0 ? (
            <span>
              Proposed {createdN} · review House / Risks → ACCEPT
              {Array.isArray(result.created) ? (
                <span className="dimmer"> · {result.created.map((c) => c.id).filter(Boolean).join(', ')}</span>
              ) : null}
            </span>
          ) : (
            <span className="dim">{result.note || 'No proposals created'}</span>
          )}
          {Array.isArray(result.errors) && result.errors.length ? (
            <div style={{ color: 'var(--watch)', marginTop: 4 }}>
              {result.errors.map((e, i) => (
                <div key={i}>{e.kind}: {e.error}</div>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}
      {side ? (
        <div className="fmap-digest-grid">
          {digest}
          {side}
        </div>
      ) : digest}
    </div>
  );
}
