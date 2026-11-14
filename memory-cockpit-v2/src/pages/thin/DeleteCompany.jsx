// Remove this desk from the cockpit. Preview first. The ticker is the confirm.
// The company's files are deleted. Nothing is kept. Other desks stay.
import React, { useState } from 'react';
import { api } from '../../api.js';

export default function DeleteCompany({ slug, ticker }) {
  const [open, setOpen] = useState(false);
  const [preview, setPreview] = useState(null);
  const [typed, setTyped] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const expected = String(ticker || '').toUpperCase();
  const ready = typed.trim().toUpperCase() === expected && preview?.ok && !busy;

  async function load() {
    setError('');
    setOpen(true);
    setPreview(null);
    try {
      const body = await api(`${slug}/desk-bundle`);
      setPreview(body);
    } catch (e) {
      setError(e.message || 'Could not list this company.');
    }
  }

  async function remove() {
    if (!ready) {
      setError(preview?.ok
        ? `Type ${expected} in the box. The delete does not run until it matches.`
        : 'This company cannot be removed yet.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(`/api/${slug}/desk/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: typed.trim() }),
      });
      const body = await res.json().catch(() => ({}));
      if (res.status === 401) {
        window.location.reload();
        return;
      }
      if (!res.ok || !body.ok) {
        setError(body.error || `Remove failed (${res.status}).`);
        setBusy(false);
        return;
      }
      window.location.hash = '#/start';
      window.location.reload();
    } catch (e) {
      setError(e.message || 'Remove failed.');
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <div className="sect">
        <div className="shd">
          <span className="no">×</span>
          <h2>REMOVE COMPANY</h2>
          <span className="m">deletes this company's files</span>
        </div>
        <div style={{ padding: '8px 16px 14px' }}>
          <button type="button" className="pchip" onClick={load}>Review what would leave</button>
        </div>
      </div>
    );
  }

  const counts = preview?.counts || {};
  const lanes = Object.keys(counts);

  return (
    <div className="sect">
      <div className="shd">
        <span className="no">×</span>
        <h2>REMOVE {expected}</h2>
        <span className="m">other companies stay</span>
      </div>
      <div style={{ padding: '8px 16px 14px', maxWidth: '40rem' }}>
        {!preview && !error && <div className="dim">Listing files…</div>}
        {preview && !preview.ok && (
          <div className="dim" style={{ fontSize: 13, lineHeight: 1.5 }}>
            <p>This company cannot be removed.</p>
            {(preview.errors || []).map((err) => (
              <p key={err} style={{ margin: '6px 0 0' }}>{err}</p>
            ))}
          </div>
        )}
        {preview?.ok && (
          <>
            <p className="dim" style={{ fontSize: 13, lineHeight: 1.5 }}>
              These files are deleted. Nothing is kept. The desk leaves the switcher after that.
              {lanes.length === 0 ? ' Nothing of this company is on disk yet.' : ''}
            </p>
            {lanes.length > 0 && (
              <div className="pagechips" style={{ paddingBottom: 8 }}>
                {lanes.map((lane) => (
                  <span key={lane} className="pchip">{lane} · {counts[lane]}</span>
                ))}
              </div>
            )}
            <label className="dim" style={{ fontSize: 12 }}>
              Type {expected} to confirm
              <input
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                autoComplete="off"
                spellCheck="false"
                style={{
                  display: 'block',
                  marginTop: 6,
                  padding: '6px 8px',
                  width: 160,
                  font: 'inherit',
                }}
              />
            </label>
            <div style={{ marginTop: 10 }}>
              <button type="button" className="pchip" onClick={remove} style={{ opacity: ready ? 1 : 0.45 }}>
                {busy ? 'Deleting…' : `Delete ${expected}`}
              </button>
            </div>
          </>
        )}
        {error && <p className="dim" style={{ fontSize: 13 }}>{error}</p>}
      </div>
    </div>
  );
}
