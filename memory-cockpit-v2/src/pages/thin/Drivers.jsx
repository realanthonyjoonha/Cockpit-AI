// Drivers — user's pinned engines (09). Not a house TOC. Add via OPEN GROK.
import React, { useCallback, useEffect, useState } from 'react';
import { api } from '../../api.js';
import GrokAgents from './GrokAgents.jsx';

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinDrivers({ desk }) {
  const { slug, label } = desk;
  const [banner, setBanner] = useState(null);
  const [data, setData] = useState(null);
  const [houseOk, setHouseOk] = useState(false);

  const load = useCallback(() => {
    api(`${slug}/drivers`).then(setData).catch(() => setData({ drivers: [] }));
    api(`${slug}/drivers/candidates`).then((j) => {
      setHouseOk(!!j.house_confirmed);
    }).catch(() => setHouseOk(false));
  }, [slug]);

  useEffect(() => { load(); }, [load]);

  const rows = (data?.drivers || []).filter((r) => !/load-bearing|flip trigger|advantaged|exposed|what would change the view|linked register/i.test(r.name || ''));

  return (
    <div>
      <div className="crumb">
        {label} · DRIVERS · <b>{rows.length}</b>
        {rows.length ? '' : ' · empty'}
      </div>

      <div className="sect">
        <div className="shd">
          <span className="no">§</span>
          <h2>DRIVERS</h2>
          <span className="m">your engines</span>
        </div>
        <div style={{ padding: '4px 16px 8px' }}>
          <GrokAgents
            variant="drivers"
            desk={slug}
            compact
            onFlash={(msg) => setBanner(msg || null)}
          />
        </div>
        {banner && (
          <div style={{ padding: '0 16px 8px', fontSize: 11, color: 'var(--ok, #5cba8a)' }}>{banner}</div>
        )}

        {rows.length === 0 ? (
          <div className="emptyD">
            {!houseOk
              ? 'House is not CONFIRMED. Pin engines after house GO (OPEN GROK Add driver).'
              : 'No engines pinned. Add driver — a side of the business you want to go deeper on. It has to already be in the house.'}
          </div>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Driver</th>
                <th>Watching</th>
                <th>Last</th>
                <th>Checked</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr
                  key={r.id}
                  className="goto"
                  onClick={() => { window.location.hash = `#/${slug}/driver/${encodeURIComponent(r.id)}`; }}
                >
                  <td style={{ width: '28%', verticalAlign: 'top' }}><b>{r.name}</b></td>
                  <td className="dim" style={{ width: '28%', fontSize: 12, lineHeight: 1.45, verticalAlign: 'top' }}>{r.watching || '—'}</td>
                  <td style={{ width: '32%', fontSize: 12, lineHeight: 1.45, verticalAlign: 'top' }}>{r.last || '—'}</td>
                  <td className="dim mono" style={{ width: '12%', verticalAlign: 'top' }}>{r.checked || r.as_of || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
