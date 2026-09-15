// Shared thin architecture photos — schema from product-map.json, vault-served rasters.
// Two lanes: primary (IR / filed source) and tape (web, not a filing).
// Missing file → GAP box. Never hotlink image_url. Zero ticker literals.
// Strip variant: thumbs under the architecture board (not a magazine gallery).
import React, { useState } from 'react';

function pageHost(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function nodeTitle(photo) {
  const t = photo && photo.node_title;
  return t || photo?.node_id || '';
}

function PhotoExpanded({ photo, broken, setBroken }) {
  const missing = photo.present === false || broken;
  const lane = String(photo.lane || 'primary').toLowerCase();
  const tape = lane === 'tape';
  const host = pageHost(photo.source?.page_url);
  const query = photo.source?.query || '';
  return (
    <div className="learn-photo-open">
      {missing ? (
        <div className="learn-photo-gap">GAP — photo file missing</div>
      ) : (
        <img
          className="learn-photo-img strip"
          src={photo.href}
          alt={photo.caption || ''}
          loading="lazy"
          onError={() => setBroken(true)}
        />
      )}
      <p className="dimmer learn-dnot" style={{ fontSize: 10 }}>
        {tape ? 'WEB · not a filing' : 'IR / FILED SOURCE'}
        {photo.caption ? ` · ${photo.caption}` : ''}
        {photo.as_of ? ` · as-of ${photo.as_of}` : ''}
        {photo.source?.label ? ` · ${photo.source.label}${host ? ` (${host})` : ''}` : ''}
        {tape && query ? ` · “${query}”` : ''}
        {photo.node_id ? ` · ${nodeTitle(photo)}` : ''}
      </p>
    </div>
  );
}

/** @param {{ photos?: object[] }} props */
export default function LearnPhotos({ photos }) {
  const list = Array.isArray(photos) ? photos : [];
  const [openId, setOpenId] = useState(null);
  const [broken, setBroken] = useState({});
  if (list.length === 0) return null;
  const open = list.find((p) => (p.id || p.src) === openId) || null;
  return (
    <div className="learn-photos strip">
      <div className="learn-photo-strip">
        {list.map((p) => {
          const id = p.id || p.src;
          const miss = p.present === false || broken[id];
          const tape = String(p.lane || '').toLowerCase() === 'tape';
          const on = openId === id;
          return (
            <button
              key={id}
              type="button"
              className={`learn-photo-thumb${on ? ' on' : ''}${miss ? ' gap' : ''}`}
              onClick={() => setOpenId(on ? null : id)}
              title={p.caption || ''}
            >
              {miss ? (
                <span className="learn-photo-thumb-gap">GAP</span>
              ) : (
                <img
                  src={p.href}
                  alt=""
                  loading="lazy"
                  onError={() => setBroken((prev) => ({ ...prev, [id]: true }))}
                />
              )}
              <span className="cap">
                {tape ? 'web · ' : ''}
                {p.caption || id}
              </span>
            </button>
          );
        })}
      </div>
      {open ? (
        <PhotoExpanded
          photo={open}
          broken={broken[open.id || open.src]}
          setBroken={() => setBroken((prev) => ({ ...prev, [open.id || open.src]: true }))}
        />
      ) : null}
    </div>
  );
}
