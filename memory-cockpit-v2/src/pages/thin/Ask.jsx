// Shared thin Ask — pack-only deterministic Q&A.
import React, { useState, useCallback } from 'react';
import { apiPost } from '../../api.js';
import BookStrip from './BookStrip.jsx';

const CHIPS = [
  { label: 'House view', q: 'house view' },
  { label: "What's on watch?", q: "what's on watch?" },
  { label: 'Risks', q: 'list risks' },
  { label: 'Key claims', q: 'key claims' },
  { label: 'List sources', q: 'list sources' },
  { label: 'Should I buy?', q: 'should I buy?' },
];

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinAsk({ desk }) {
  const { slug, ticker, label } = desk;
  const [q, setQ] = useState('');
  const [res, setRes] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  const run = useCallback(async (question) => {
    const text = String(question || '').trim();
    if (!text) return;
    setBusy(true);
    setErr(null);
    try {
      const out = await apiPost(`${slug}/ask`, { q: text });
      setRes(out);
    } catch (e) {
      setErr(e.message || 'ask failed');
      setRes(null);
    }
    setBusy(false);
  }, [slug]);

  return (
    <div>
      <div className="crumb">
        {label} · ASK · <b>PACK Q&A (DETERMINISTIC)</b> · NOT LIVE WEB · NOT AN LLM
      </div>

      <BookStrip
        desk={slug}
        ticker={ticker}
        onRefreshed={() => {
          if (res?.question) run(res.question);
        }}
      />

      <div className="sect">
        <div className="shd">
          <span className="no">?</span>
          <h2>ASK THE BOOK</h2>
          <span className="m">answers from compiled {ticker} pack only</span>
        </div>

        <div className="pagechips" style={{ padding: '10px 16px 4px' }}>
          {CHIPS.map((c) => (
            <span
              key={c.q}
              className="pchip"
              onClick={() => { setQ(c.q); run(c.q); }}
            >
              {c.label}
            </span>
          ))}
        </div>

        <div style={{ padding: '12px 16px 16px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !busy) run(q); }}
            placeholder="e.g. what's on watch? · house view · list sources"
            style={{
              flex: 1,
              minWidth: 200,
              background: 'var(--panel, #141820)',
              border: '1px solid var(--hairline)',
              color: 'inherit',
              font: 'inherit',
              fontSize: 13,
              padding: '10px 12px',
              borderRadius: 6,
            }}
          />
          <button
            type="button"
            className="desk-btn on"
            disabled={busy || !q.trim()}
            onClick={() => run(q)}
            style={{ padding: '10px 16px', borderRadius: 6 }}
          >
            {busy ? '…' : 'ASK'}
          </button>
        </div>

        {err && (
          <div className="emptyD" style={{ margin: '0 16px 12px', borderColor: 'var(--fired)' }}>
            {err}
          </div>
        )}

        {res && (
          <div style={{ padding: '0 16px 16px' }}>
            <div className="crumb" style={{ paddingLeft: 0 }}>
              ROUTE · <b>{res.route || '—'}</b>
              {res.compiled_at ? ` · PACK ${String(res.compiled_at).slice(0, 16)}` : ''}
              {res.mode ? ` · ${res.mode}` : ''}
            </div>
            <pre
              className="prose"
              style={{
                whiteSpace: 'pre-wrap',
                wordBreak: 'break-word',
                fontFamily: 'inherit',
                fontSize: 12,
                lineHeight: 1.5,
                margin: 0,
                padding: '12px 14px',
                border: '1px solid var(--hairline)',
                borderRadius: 6,
                background: 'rgba(0,0,0,0.2)',
                maxHeight: '55vh',
                overflow: 'auto',
              }}
            >
              {res.answer || '—'}
            </pre>
          </div>
        )}

        {!res && !err && (
          <div className="emptyD" style={{ margin: '0 16px 16px' }}>
            Pick a chip or type a question. Answers are keyword-routed over the pack — same honesty
            rules as Risks/House (no invented numbers, no buy/sell advice).
          </div>
        )}
      </div>

      <div className="emptyD" style={{ fontSize: 10 }}>
        Full CLI power: <span className="mono">./ont ask {ticker} &quot;…&quot;</span>
        {' · '}Glass Ask is pack-core subset · After research recompile the pack to refresh answers
      </div>
    </div>
  );
}
