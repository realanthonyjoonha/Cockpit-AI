// Shared thin Background — one architecture board, study-tree index, primer document.
// BUILD BACKGROUND → harvest/map/spine. Deepen → one-node product-mechanism deep-dive.
// Vault cockpit/learn/{TICKER}/ — not pack/house. Decision-support only.
// Factory page: same grammar on every desk. Empty pieces omit. Zero ticker forks.
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { api, apiPost } from '../../api.js';
import LearnDiagrams from './LearnDiagrams.jsx';

const POLL_MS = 2500;
const POLL_MAX_MS = 10 * 60 * 1000;

function learnFingerprint(payload) {
  if (!payload || typeof payload !== 'object') return 'null';
  const lessons = Array.isArray(payload.lessons) ? payload.lessons : [];
  const learner = payload.learner || {};
  const known = (learner.known || []).map((t) => t.id).join(',');
  const fuzzy = (learner.fuzzy || []).map((t) => t.id).join(',');
  const next = (learner.next || []).map((t) => t.id).join(',');
  const map = payload.map || {};
  const nodes = Array.isArray(map.nodes) ? map.nodes : [];
  const deep = Array.isArray(payload.deep) ? payload.deep : [];
  return [
    payload.available ? '1' : '0',
    payload.primer?.updated_at || '',
    payload.primer?.n_chars || 0,
    learner.updated_at || '',
    known,
    fuzzy,
    next,
    lessons.map((l) => `${l.id}:${l.n_chars || 0}:${l.updated_at || ''}`).join(';'),
    map.updated_at || '',
    nodes.map((n) => `${n.id}:${n.status}`).join(','),
    (Array.isArray(map.diagrams) ? map.diagrams : []).map((d) => `${d.id}:${d.type}`).join(','),
    (Array.isArray(map.photos) ? map.photos : []).map((p) => `${p.id}:${p.present ? '1' : '0'}`).join(','),
    deep.map((x) => `${x.node_id}:${x.status}:${x.n_chars || 0}`).join(','),
    payload.depth_gate?.ok ? 'g1' : 'g0',
  ].join('::');
}

function crumbStatus(d) {
  const nodes = (d.map && d.map.nodes) || [];
  const diags = (d.map && d.map.diagrams) || [];
  if (!d.available && !nodes.length && !diags.length) return 'NEEDS BUILD';
  if (d.depth_gate?.ok) return 'MAP READY';
  if (!nodes.length) return 'SPINE SHORT · NO MAP';
  return 'MAP SHORT';
}

/** @param {{ desk: { slug: string, ticker: string, label: string } }} props */
export default function ThinBackground({ desk }) {
  const { slug, ticker, label } = desk;
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [polling, setPolling] = useState(false);
  const [flash, setFlash] = useState(null);
  const [openDeep, setOpenDeep] = useState(null);
  const pollRef = useRef(null);
  const baselineRef = useRef(null);
  const genRef = useRef(0);

  const stopPoll = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current.interval);
      if (pollRef.current.timeout) clearTimeout(pollRef.current.timeout);
      pollRef.current = null;
    }
    setPolling(false);
  }, []);

  const load = useCallback(() => {
    const gen = genRef.current;
    return api(`${slug}/learn`)
      .then((payload) => {
        if (gen === genRef.current) setD(payload);
        return payload;
      })
      .catch(() => {
        const fail = { available: false, reason: 'request failed', needs_build: true, deep: [] };
        if (gen === genRef.current) setD(fail);
        return fail;
      });
  }, [slug]);

  useEffect(() => {
    genRef.current += 1;
    stopPoll();
    setFlash(null);
    setOpenDeep(null);
    setD(null);
    load();
    return () => stopPoll();
  }, [load, stopPoll]);

  const startVaultPoll = useCallback((baselineFp, waiting) => {
    stopPoll();
    baselineRef.current = baselineFp;
    setPolling(true);
    setFlash(waiting);

    const tick = async () => {
      const gen = genRef.current;
      try {
        const payload = await api(`${slug}/learn`);
        if (gen !== genRef.current) return;
        const fp = learnFingerprint(payload);
        if (fp !== baselineRef.current) {
          setD(payload);
          stopPoll();
          setFlash(payload.available
            ? 'Background updated from vault'
            : 'Vault changed · primer still empty');
        }
      } catch { /* keep polling */ }
    };

    const interval = setInterval(tick, POLL_MS);
    const timeout = setTimeout(() => {
      stopPoll();
      setFlash((prev) => (
        String(prev || '').includes('updated')
          ? prev
          : 'No vault change yet · Grok may still be running · click again to re-check'
      ));
    }, POLL_MAX_MS);
    pollRef.current = { interval, timeout };
    setTimeout(tick, 1200);
  }, [slug, stopPoll]);

  const openGrok = async (action, extra = {}) => {
    setBusy(true);
    setFlash(null);
    const grokGen = genRef.current;
    try {
      let baselineFp = learnFingerprint(d);
      try {
        const pre = await api(`${slug}/learn`);
        if (grokGen !== genRef.current) return;
        baselineFp = learnFingerprint(pre);
        setD(pre);
      } catch { /* use state */ }

      const grok = await apiPost('open-grok', {
        action,
        desk: slug,
        mode: action === 'background' ? 'primer' : (action === 'learn-deepen' ? 'deepen' : 'tutor'),
        node_id: extra.node_id,
      });
      if (!grok?.ok) {
        setFlash(grok?.error || 'OPEN GROK failed (localhost only)');
        return;
      }
      const seedNote = grok.learn_seed?.path ? ' · seed written' : '';
      try {
        const post = await api(`${slug}/learn`);
        if (grokGen !== genRef.current) return;
        setD(post);
        baselineFp = learnFingerprint(post);
      } catch { /* keep pre baseline */ }

      const waitMsg = action === 'learn-deepen'
        ? `Opened Grok · deepening ${extra.node_id || 'node'} · waiting for deep-dive publish${seedNote}`
        : `Opened Grok · building background · waiting for primer publish${seedNote}`;
      startVaultPoll(baselineFp, waitMsg);
    } catch (e) {
      setFlash(e.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (!d) return <div className="crumb">LOADING…</div>;

  const primaryBusy = busy || polling;
  const nodes = (d.map && d.map.nodes) || [];
  const diags = (d.map && d.map.diagrams) || [];
  const photos = (d.map && d.map.photos) || [];
  const hasTree = nodes.length > 0;
  const hasBoard = diags.length > 0 || photos.length > 0;
  const status = crumbStatus(d);
  const gateTitle = (d.depth_gate?.reasons || []).join(' · ') || 'product-map depth bar';
  const asOf = d.primer?.updated_at || d.map?.as_of || d.map?.updated_at;

  const primerBlock = (
    <div className="sect learn-primer">
      <div className="shd">
        <span className="no">▤</span>
        <h2>PRIMER</h2>
        <span className="m">{d.primer?.title || 'product spine'}</span>
      </div>
      {!d.available ? (
        <div className="emptyD">{d.reason || 'BUILD BACKGROUND — Grok writes the first primer from filings + pack.'}</div>
      ) : (
        <div className="prose wide" style={{ padding: '8px 16px 16px' }} dangerouslySetInnerHTML={{ __html: d.primer.html || '' }} />
      )}
    </div>
  );

  return (
    <div>
      <div className="crumb">
        {label} · <b>{ticker}</b> · BACKGROUND
        {asOf ? ` · ${String(asOf).slice(0, 16).replace('T', ' ')}` : ''}
        {' · '}
        <b title={gateTitle}>{status}</b>
        {polling ? (
          <span style={{ color: 'var(--sec-2)', marginLeft: 6 }}> · WAITING FOR PUBLISH</span>
        ) : null}
      </div>

      <div className="learn-head">
        <div>
          <div className="eyebrow">WHAT THEY BUILD</div>
          <h1>{label}</h1>
        </div>
        <div className="learn-head-actions">
          <button
            type="button"
            className="btn"
            disabled={primaryBusy}
            onClick={() => openGrok('background')}
            title="Open Grok to write or rebuild the primer + product map"
          >
            {polling && busy ? '…' : (d.available ? 'REBUILD BACKGROUND' : 'BUILD BACKGROUND')}
          </button>
          {polling && (
            <button
              type="button"
              className="btn"
              onClick={() => {
                stopPoll();
                setFlash('Stopped waiting for vault publish');
              }}
            >
              Cancel wait
            </button>
          )}
          {flash ? <span className="dim" style={{ fontSize: 10 }}>{flash}</span> : null}
        </div>
      </div>

      {hasBoard ? (
        <LearnDiagrams
          diagrams={diags}
          photos={photos}
          diagramOrder={d.map?.diagram_order}
          family={d.map?.family}
        />
      ) : null}

      {hasTree ? (
        <StudyTree
          map={d.map}
          deep={d.deep}
          openDeep={openDeep}
          setOpenDeep={setOpenDeep}
          busy={primaryBusy}
          onDeepen={(nodeId) => openGrok('learn-deepen', { node_id: nodeId })}
        />
      ) : null}

      {openDeep && hasTree ? (
        <DeepNoteBody slug={slug} id={openDeep} title={(nodes.find((n) => n.id === openDeep) || {}).title} />
      ) : null}

      {primerBlock}
    </div>
  );
}

function nodeDepths(nodes) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const memo = new Map();
  const walk = (id, stack) => {
    if (memo.has(id)) return memo.get(id);
    if (stack.has(id)) return 0;
    const n = byId.get(id);
    stack.add(id);
    let dpth = 0;
    for (const dep of (n && n.depends_on) || []) {
      dpth = Math.max(dpth, walk(dep, stack) + 1);
    }
    stack.delete(id);
    memo.set(id, dpth);
    return dpth;
  };
  nodes.forEach((n) => walk(n.id, new Set()));
  return memo;
}

function fireOf(row) {
  const s = String(row?.status || '').toLowerCase();
  if (s === 'running') return 'running';
  if (s === 'fired' || (row && row.has_note && s !== 'failed')) return 'fired';
  if (s === 'failed') return 'failed';
  return 'not_run';
}

function fireLabel(fire) {
  if (fire === 'running') return 'RUNNING';
  if (fire === 'fired') return 'FIRED';
  if (fire === 'failed') return 'FAILED';
  return 'NOT RUN';
}

function StudyTree({ map, deep, openDeep, setOpenDeep, busy, onDeepen }) {
  const nodes = Array.isArray(map?.nodes) ? map.nodes : [];
  if (nodes.length === 0) return null;
  const deepById = new Map((Array.isArray(deep) ? deep : []).map((x) => [x.node_id, x]));
  const depths = nodeDepths(nodes);
  const ordered = [...nodes].sort((a, b) => (depths.get(a.id) || 0) - (depths.get(b.id) || 0));
  const nFired = ordered.filter((n) => fireOf(deepById.get(n.id)) === 'fired').length;
  const pins = Array.isArray(map?.sources) ? map.sources : [];
  const notThis = Array.isArray(map?.not_this) ? map.not_this : [];
  const pinLine = pins.map((s) => s.label).filter(Boolean).slice(0, 4).join(' · ');

  return (
    <div className="sect">
      <div className="shd">
        <span className="no">▣</span>
        <h2>STUDY TREE</h2>
        <span className="m">
          {map?.family || 'map'}
          {` · ${nFired}/${nodes.length} fired`}
        </span>
      </div>
      {(pinLine || notThis.length) ? (
        <div className="learn-tree-meta">
          {pinLine ? <span className="dimmer">{pinLine}</span> : null}
          {notThis.length ? (
            <span className="dim">Not this: {notThis.join(' · ')}</span>
          ) : null}
        </div>
      ) : null}
      <ul className="learn-tree">
        {ordered.map((n) => {
          const rec = deepById.get(n.id);
          const fire = fireOf(rec);
          const open = openDeep === n.id;
          const canOpen = fire === 'fired' || (rec && rec.has_note);
          const depth = Math.min(depths.get(n.id) || 0, 2);
          const tip = [n.not_this, n.summary, n.status].filter(Boolean).join(' · ');
          return (
            <li key={n.id} className={`tree-row${open ? ' on' : ''}`}>
              <div className={`tree-open indent-${depth}`}>
                <button
                  type="button"
                  className="tree-main-btn"
                  onClick={() => {
                    if (!canOpen) return;
                    setOpenDeep(open ? null : n.id);
                  }}
                  disabled={!canOpen}
                  title={tip}
                >
                  {n.kind ? <span className="learn-chip">{n.kind}</span> : null}
                  <span className="tree-title">{n.title}</span>
                </button>
                <span className="tree-meta">
                  <span className={`st fire-${fire}`}>{fireLabel(fire)}</span>
                  <button
                    type="button"
                    className="tree-deepen"
                    disabled={busy || fire === 'running'}
                    onClick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      onDeepen(n.id);
                    }}
                    title="OPEN GROK — product-mechanism deep-dive on this node"
                  >
                    {fire === 'running' ? 'WAITING' : (fire === 'fired' ? 'Re-run' : 'Deepen')}
                  </button>
                </span>
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function DeepNoteBody({ slug, id, title }) {
  const [out, setOut] = useState(null);
  useEffect(() => {
    let dead = false;
    setOut(null);
    api(`${slug}/learn/deep/${encodeURIComponent(id)}`)
      .then((body) => {
        if (dead) return;
        setOut(body);
      })
      .catch(() => {
        if (!dead) setOut({ ok: false, error: 'failed to load' });
      });
    return () => { dead = true; };
  }, [slug, id]);
  return (
    <div className="sect">
      <div className="shd">
        <span className="no">▣</span>
        <h2>DEEP-DIVE</h2>
        <span className="m">{title || id}</span>
      </div>
      <div className="deep-note">
        {!out ? (
          <div className="dim" style={{ fontSize: 12 }}>loading…</div>
        ) : !out.ok ? (
          <div className="dim" style={{ fontSize: 12 }}>{out.error || 'unreadable'}</div>
        ) : (
          <>
            <div className="deep-note-head">
              <span className="deep-note-k">PRODUCT-MECHANISM</span>
              {out.meta?.n_words ? <span className="dimmer mono">{out.meta.n_words} words</span> : null}
              {out.meta?.as_of ? <span className="dimmer mono">as-of {out.meta.as_of}</span> : null}
              {out.meta?.thin ? <span className="st gap">THIN</span> : null}
            </div>
            <div className="deep-sec-nav">
              {['setup', 'mechanism', 'evidence', 'figure', 'gaps', 'exec'].map((s) => (
                <span
                  key={s}
                  className={`learn-chip ${(out.meta?.sections || []).includes(s) ? 'known' : 'fuzzy'}`}
                >
                  {s}
                </span>
              ))}
            </div>
            <div className="prose wide" style={{ marginTop: 8 }} dangerouslySetInnerHTML={{ __html: out.html || '' }} />
          </>
        )}
      </div>
    </div>
  );
}
