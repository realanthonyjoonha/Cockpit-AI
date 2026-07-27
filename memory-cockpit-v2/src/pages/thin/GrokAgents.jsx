// GrokAgents — glass menu to open Grok Build with a chosen slash agent.
// variant=desk | risk | register | house — surface-scoped menus (scalable multi-desk UI).
// Localhost only. Decision-support only. Scales via props — no per-ticker forks.
import React, { useCallback, useEffect, useState } from 'react';
import { api, apiPost } from '../../api.js';

/** Offline fallback — keep aligned with server/openGrok.js GROK_AGENTS */
const FALLBACK_ALL = [
  { action: 'daily', label: 'Daily brief', hint: 'What moved + house + pack WATCH', needs_desk: true, variants: ['desk', 'house'], default_for: ['desk'] },
  { action: 'research', label: 'Research', hint: 'General research for this ticker vs pack/house', needs_desk: true, variants: ['desk'] },
  { action: 'daily-save', label: 'Daily brief + save', hint: 'Same + vault brief file', needs_desk: true, variants: ['desk'] },
  { action: 'risk-check', label: 'Risk check', hint: 'DD a risk vs tripwires', needs_desk: true, needs_risk: true, variants: ['desk', 'risk', 'register'], default_for: ['risk'] },
  { action: 'risk-add', label: 'Add risk', hint: 'Research + propose NEW risk', needs_desk: true, variants: ['desk', 'register'], default_for: ['register'] },
  { action: 'risk-tripwires', label: 'Risk tripwires', hint: 'Fill monitors with user cull', needs_desk: true, needs_risk: true, variants: ['desk', 'risk', 'register'] },
  { action: 'steelman', label: 'Steelman', hint: 'House vs pack WATCH', needs_desk: true, variants: ['desk', 'house'] },
  { action: 'match', label: 'Match WATCH', hint: 'House labels vs pack', needs_desk: true, variants: ['desk', 'house'] },
  { action: 'propose', label: 'Propose house', hint: 'Draft house edit → glass ACCEPT', needs_desk: true, variants: ['desk', 'house'], default_for: ['house'] },
  { action: 'pending', label: 'Pending proposals', hint: 'List pending house proposals', needs_desk: true, variants: ['desk', 'house'] },
  { action: 'desks', label: 'List desks', hint: 'Registry', needs_desk: false, variants: ['desk'] },
  { action: 'menu', label: 'Cockpit menu', hint: '/cockpit', needs_desk: false, variants: ['desk', 'risk', 'register', 'house'] },
];

const ALLOWED = new Set(['desk', 'risk', 'register', 'house']);

function normalizeVariant(v) {
  const x = String(v || 'desk').toLowerCase();
  return ALLOWED.has(x) ? x : 'desk';
}

function filterByVariant(list, variant) {
  return list.filter((a) => (a.variants || ['desk']).includes(variant));
}

function defaultFor(list, variant) {
  return list.find((a) => (a.default_for || []).includes(variant))?.action
    || list[0]?.action
    || 'menu';
}

/**
 * @param {{
 *   desk?: string,
 *   variant?: 'desk' | 'risk' | 'register' | 'house',
 *   riskId?: string,
 *   riskName?: string,
 *   tripwireCount?: number,
 *   compact?: boolean,
 *   onFlash?: (msg: string) => void,
 * }} props
 */
export default function GrokAgents({
  desk = '',
  variant = 'desk',
  riskId = '',
  riskName = '',
  tripwireCount = null,
  compact = false,
  onFlash,
}) {
  const v = normalizeVariant(variant);
  const [agents, setAgents] = useState(() => filterByVariant(FALLBACK_ALL, v));
  const [action, setAction] = useState(() => defaultFor(filterByVariant(FALLBACK_ALL, v), v));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const fallback = filterByVariant(FALLBACK_ALL, v);
    setAgents(fallback);
    setAction(defaultFor(fallback, v));

    api(`open-grok/agents?variant=${encodeURIComponent(v)}`)
      .then((d) => {
        if (d?.agents?.length) {
          setAgents(d.agents);
          if (d.default_action) setAction(d.default_action);
        }
      })
      .catch(() => {});
  }, [v]);

  const flash = useCallback((msg) => {
    if (typeof onFlash === 'function') onFlash(msg);
  }, [onFlash]);

  const open = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    flash(null);
    try {
      const body = { action };
      const base = String(desk || '').replace(/^\/+|\/+$/g, '');
      if (base) body.desk = base;
      // Only risk-detail seeds identity; register leaves risk optional (agent asks).
      if (v === 'risk') {
        if (riskId) body.risk_id = riskId;
        if (riskName) body.risk_name = riskName;
      }
      const out = await apiPost('open-grok', body);
      if (!out?.ok) {
        flash(out?.error || 'open Grok failed');
      } else {
        flash(`Opened · ${out.initial_prompt || action}`);
      }
    } catch (e) {
      flash(e.message || 'open Grok failed (localhost only)');
    } finally {
      setBusy(false);
    }
  }, [busy, action, desk, flash, v, riskId, riskName]);

  const selected = agents.find((a) => a.action === action) || agents[0];
  const btnStyle = { padding: compact ? '3px 8px' : '4px 10px', fontSize: 10 };
  const selectStyle = {
    appearance: 'auto',
    fontSize: 10,
    padding: compact ? '2px 4px' : '3px 6px',
    maxWidth: compact ? (v === 'desk' ? 140 : 160) : 200,
    background: 'var(--panel, #141820)',
    color: 'var(--text, #D7DCE6)',
    border: '1px solid var(--line, #2a3140)',
    borderRadius: 4,
  };

  // Tooltips only — no inline how-to chrome
  let controlTitle = selected?.hint || 'Choose Grok agent';
  if (v === 'risk') {
    controlTitle = tripwireCount != null
      ? `${selected?.hint || 'Risk agent'} · ${tripwireCount} tripwire(s) · seeds this risk`
      : `${selected?.hint || 'Risk agent'} · seeds this risk`;
  } else if (v === 'register') {
    controlTitle = selected?.hint || 'Register agent';
  } else if (v === 'house') {
    controlTitle = selected?.hint || 'House agent';
  }

  const aria = v === 'risk'
    ? 'Risk-detail Grok agent'
    : v === 'register'
      ? 'Risk-register Grok agent'
      : v === 'house'
        ? 'House-view Grok agent'
        : 'Desk Grok agent';

  return (
    <span style={{ display: 'inline-flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
      <label className="dim" style={{ fontSize: 9, letterSpacing: 0.4, fontWeight: 700 }}>
        AGENTS
      </label>
      <select
        value={action}
        onChange={(e) => setAction(e.target.value)}
        disabled={busy}
        title={controlTitle}
        style={selectStyle}
        aria-label={aria}
      >
        {agents.map((a) => (
          <option key={a.action} value={a.action}>
            {a.label}
          </option>
        ))}
      </select>
      <button
        type="button"
        className="desk-btn on"
        onClick={open}
        disabled={busy}
        title={controlTitle}
        style={btnStyle}
      >
        {busy ? '…' : 'OPEN GROK'}
      </button>
    </span>
  );
}
