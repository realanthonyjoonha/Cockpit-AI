// Shared thin empty / parked route.
import React from 'react';

/** @param {{ desk: { slug: string, label: string }, path?: string }} props */
export default function ThinEmpty({ desk, path = '' }) {
  const { slug, label } = desk;
  const base = `#/${slug}`;
  return (
    <div className="page">
      <div className="phd" style={{ padding: '16px 16px 0' }}>
        <div>
          <div className="eyebrow">{label} · NOT BUILT</div>
          <h1 style={{ fontSize: 20 }}>Empty / parked</h1>
        </div>
        <span className="pill warn">EMPTY</span>
      </div>
      <div className="sect">
        <p className="dimmer" style={{ maxWidth: '40rem', lineHeight: 1.55, padding: '8px 16px 16px' }}>
          Route <span className="mono">#{base.slice(1)}/{path || '…'}</span> is not part of the thin desk.
          Thin desks ship Overview, Risks, House, Sources, Ask, and Update. We do not invent content
          or send you to Memory Overview.
        </p>
        <div className="pagechips" style={{ paddingBottom: 16 }}>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/overview`; }}><b>»</b> overview</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/risks`; }}><b>»</b> risks</span>
          <span className="pchip" onClick={() => { window.location.hash = `${base}/house`; }}><b>»</b> house</span>
        </div>
      </div>
    </div>
  );
}
