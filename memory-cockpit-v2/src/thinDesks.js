// Thin desk helpers + live registry for glass shell.
// Desks load from GET /api/thin-desks (server re-reads thin-desks.json) so new companies
// appear without a frontend rebuild. Build-time JSON is only a cold fallback.
// Decision-support only.
import { useCallback, useEffect, useState } from 'react';
import registry from '../config/thin-desks.json';
import { api } from './api.js';

export const THIN_PARITY_GROUP = registry.parity_group;
export const THIN_WRITE_PATH_MODE = registry.write_path_mode;
export const THIN_ROOMS = registry.rooms;

/** Build-time snapshot (fallback before first /api/thin-desks fetch). Prefer useThinDesks(). */
export const THIN_DESKS_FALLBACK = Array.isArray(registry.desks) ? registry.desks : [];

/** @deprecated Prefer useThinDesks() — kept for scripts that import THIN_DESKS at build time */
export const THIN_DESKS = THIN_DESKS_FALLBACK;

function normalizeDesks(list) {
  if (!Array.isArray(list)) return [];
  return list.map((d) => ({
    slug: d.slug,
    ticker: d.ticker,
    id: d.id || d.slug,
    label: d.label || d.ticker || d.slug,
    mark: d.mark || String(d.label || d.ticker || '?')[0],
    house_file: d.house_file,
    aliases: Array.isArray(d.aliases) ? d.aliases : [],
    displayName: d.displayName || d.label || d.ticker,
    profile: d.profile,
  }));
}

/** @param {string} slug e.g. tsm */
export function thinDeskBySlug(desks, slug) {
  const list = Array.isArray(desks) ? desks : THIN_DESKS_FALLBACK;
  const s = String(slug || '').toLowerCase();
  return list.find((d) => d.slug === s)
    || list.find((d) => (d.aliases || []).map((a) => String(a).toLowerCase()).includes(s))
    || null;
}

/** @param {string} id */
export function thinDeskById(desks, id) {
  const list = Array.isArray(desks) ? desks : THIN_DESKS_FALLBACK;
  // Back-compat: old call signature thinDeskById(id) when desks omitted
  if (typeof desks === 'string' && id === undefined) {
    return thinDeskById(THIN_DESKS_FALLBACK, desks);
  }
  return list.find((d) => d.id === id || d.slug === id) || null;
}

/** Hash prefix → desk id for shell. */
export function deskIdFromHash(hash, desks = THIN_DESKS_FALLBACK) {
  const h = hash || '';
  for (const d of desks) {
    if (h.startsWith(`#/${d.slug}`)) return d.id;
    for (const a of d.aliases || []) {
      if (h.startsWith(`#/${a}`)) return d.id;
    }
  }
  return 'start';
}

/**
 * First path segment after #/ — e.g. tsm, tsmc, start.
 */
export function hashHead(hash) {
  const h = String(hash || '').replace(/^#\/?/, '');
  const head = h.split(/[/?#]/)[0] || '';
  return head.toLowerCase().replace(/[^a-z0-9-]/g, '');
}

/** Left-rail rooms. Ask stays API/CLI-only (`POST /api/{slug}/ask`, `./ont ask`). */
export function thinRail(desk) {
  const s = desk.slug;
  const L = desk.label;
  return [
    ['◧', `${L} Overview — stance + claims`, `#/${s}/overview`],
    ['⚠', `${L} Risks`, `#/${s}/risks`],
    ['§', `${L} House view`, `#/${s}/house`],
    ['⧉', `${L} Sources — pack catalog`, `#/${s}/sources`],
    ['$', `${L} Street — published targets (not house)`, `#/${s}/street`],
    ['∑', `${L} Model — working assumptions + bridge`, `#/${s}/model`],
    ['▤', `${L} Reports — thesis notes + PDF`, `#/${s}/reports`],
    ['✎', `${L} Update — write path (file → compile → refresh)`, `#/${s}/update`],
  ];
}

export function thinHashPrefix(deskId, desks = THIN_DESKS_FALLBACK) {
  const d = thinDeskById(desks, deskId);
  return d ? d.slug : null;
}

/**
 * Live desks from server registry (mtime-aware on server).
 * Poll lightly so scaffold without restart updates the switcher.
 */
export function useThinDesks() {
  const [desks, setDesks] = useState(() => normalizeDesks(THIN_DESKS_FALLBACK));
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [mtimeMs, setMtimeMs] = useState(null);

  const refresh = useCallback(async () => {
    try {
      const d = await api('thin-desks');
      if (d?.desks) {
        setDesks(normalizeDesks(d.desks));
        setMtimeMs(d.mtime_ms ?? null);
        setError(null);
      }
    } catch (e) {
      setError(e.message || String(e));
      // keep last good / fallback desks
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
    const t = setInterval(refresh, 8000);
    return () => clearInterval(t);
  }, [refresh]);

  return { desks, loading, error, mtimeMs, refresh };
}
