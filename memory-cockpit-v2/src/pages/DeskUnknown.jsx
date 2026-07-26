// Shown when hash looks like a desk but slug is not in live registry.
// Never silent-redirect to START — that felt like "the product ate my desk."
import React from 'react';

/**
 * @param {{
 *   tried: string,
 *   desks: Array<{ slug: string, ticker: string, label: string, aliases?: string[] }>,
 *   onGoStart: () => void,
 *   onGoDesk: (slug: string) => void,
 * }} props
 */
export default function DeskUnknown({ tried, desks, onGoStart, onGoDesk }) {
  const list = Array.isArray(desks) ? desks : [];
  const t = String(tried || '').toLowerCase();

  // Fuzzy: ticker match or alias substring
  const suggestions = list.filter((d) => {
    const slug = String(d.slug || '').toLowerCase();
    const ticker = String(d.ticker || '').toLowerCase();
    const aliases = (d.aliases || []).map((a) => String(a).toLowerCase());
    if (slug === t || ticker === t || aliases.includes(t)) return true;
    if (t && (slug.includes(t) || t.includes(slug) || ticker.includes(t))) return true;
    return false;
  });

  return (
    <div>
      <div className="crumb">
        DESK · <b>NOT FOUND</b>
        {' '}· tried <span className="mono">{tried || '—'}</span>
        {' '}· decision-support only
      </div>
      <div className="sect">
        <div className="rdhead">
          <h1>Desk not in registry</h1>
          <div className="chips">
            <span className="chipC fired">UNKNOWN</span>
          </div>
        </div>
        <div className="prose">
          <p>
            Glass does <b>not</b> know <span className="mono">#{tried}</span>.
            This is usually a <b>slug mismatch</b> (e.g. <span className="mono">tsmc</span> vs{' '}
            <span className="mono">tsm</span>), not lost research.
          </p>
          <p className="dim">
            Canonical slug comes from <span className="mono">config/thin-desks.json</span>
            {' '}(scaffold uses lowercased ticker). Optional <span className="mono">aliases</span> are supported.
            Registry reloads live — no rebuild required after add.
          </p>
        </div>
        {suggestions.length > 0 && (
          <div style={{ padding: '0 16px 14px' }}>
            <div className="dim" style={{ fontSize: 10, letterSpacing: '0.08em', marginBottom: 8, fontFamily: 'var(--mono)' }}>
              DID YOU MEAN
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {suggestions.map((d) => (
                <button
                  key={d.slug}
                  type="button"
                  className="desk-btn on"
                  style={{ padding: '6px 12px', fontSize: 11 }}
                  onClick={() => onGoDesk(d.slug)}
                >
                  {d.label} · #{d.slug}
                </button>
              ))}
            </div>
          </div>
        )}
        <div style={{ padding: '0 16px 16px', display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          <button
            type="button"
            className="desk-btn"
            style={{ padding: '6px 12px', fontSize: 11 }}
            onClick={onGoStart}
          >
            Back to START
          </button>
          {list.map((d) => (
            <button
              key={`all-${d.slug}`}
              type="button"
              className="desk-btn"
              style={{ padding: '6px 12px', fontSize: 11 }}
              onClick={() => onGoDesk(d.slug)}
            >
              {d.label}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
