// Shared thin architecture board — schema from product-map.json, HTML not SVG.
// One board + tabs. Default tab = family required_diagrams order, then first present.
// Fail-closed: gap/unknown/stub render as GAP. Tile size never encodes $.
import React, { useEffect, useMemo, useState } from 'react';
import LearnPhotos from './LearnPhotos.jsx';
import { diagramTabTypes, pickBoardDiagram, tabLabel } from './learnDiagramPick.js';

function isGapStatus(row) {
  const s = String(row && row.status || '').toLowerCase();
  return s === 'gap' || s === 'unknown' || s === 'stub';
}

function filedShare(b) {
  if (!b) return '';
  return b.filed && b.share ? b.share : '';
}

function Kind({ kind }) {
  if (!kind) return null;
  return <span className="lhtml-kind">{kind}</span>;
}

function GapChip({ on }) {
  if (!on) return null;
  return <span className="lhtml-gap">GAP</span>;
}

function Cell({ b, className = '' }) {
  const gap = isGapStatus(b);
  const share = filedShare(b);
  const tip = b.note || b.source || b.label;
  return (
    <div
      className={`lhtml-cell${gap ? ' gap' : ''} ${className}`.trim()}
      title={tip}
    >
      <div className="lhtml-cell-top">
        <Kind kind={b.kind} />
        <GapChip on={gap} />
      </div>
      <div className="lhtml-label">{b.label}</div>
      {share ? <div className="lhtml-share">{share}</div> : null}
    </div>
  );
}

function groupByLayer(blocks) {
  const map = new Map();
  (blocks || []).forEach((b, i) => {
    const layer = Number.isFinite(Number(b.layer)) ? Number(b.layer) : i;
    if (!map.has(layer)) map.set(layer, []);
    map.get(layer).push(b);
  });
  return [...map.keys()].sort((a, b) => a - b).map((layer) => ({
    layer,
    blocks: map.get(layer),
  }));
}

function StackDrawing({ d }) {
  const rows = groupByLayer(d.blocks || []);
  const edges = Array.isArray(d.edges) ? d.edges : [];
  return (
    <div className="lhtml-stack" role="img" aria-label={d.title || 'stack'}>
      {rows.map((row, i) => {
        const gap = row.blocks.some(isGapStatus);
        const kinds = [...new Set(row.blocks.map((b) => b.kind).filter(Boolean))];
        const seam = edges.find((e) => {
          const from = row.blocks.some((b) => b.id === e.from);
          const next = rows[i + 1];
          const to = next && next.blocks.some((b) => b.id === e.to);
          return from && to && e.label;
        });
        const labels = row.blocks.map((b) => b.label).filter(Boolean).join(' · ');
        const share = row.blocks.map(filedShare).filter(Boolean).join(' · ');
        return (
          <div key={`band-${row.layer}`}>
            <div className={`lhtml-spec${gap ? ' gap' : ''}`} title={row.blocks.map((b) => b.note || b.source || '').filter(Boolean).join(' · ')}>
              <span className="lhtml-spec-k">{kinds[0] || 'layer'}</span>
              <span className="lhtml-spec-v">
                {labels}
                {share ? <span className="lhtml-share"> · {share}</span> : null}
                <GapChip on={gap} />
              </span>
            </div>
            {seam ? <div className="lhtml-seam">{seam.label}</div> : null}
          </div>
        );
      })}
    </div>
  );
}

function implicitFlowEdges(blocks) {
  const sorted = [...blocks].sort((a, b) => (Number(a.layer) || 0) - (Number(b.layer) || 0));
  const edges = [];
  for (let i = 0; i < sorted.length - 1; i += 1) {
    edges.push({ from: sorted[i].id, to: sorted[i + 1].id, status: 'ready' });
  }
  return edges;
}

function FlowDrawing({ d }) {
  const blocks = [...(d.blocks || [])].sort((a, b) => (Number(a.layer) || 0) - (Number(b.layer) || 0));
  const edges = Array.isArray(d.edges) && d.edges.length ? d.edges : implicitFlowEdges(blocks);
  const byId = new Map(blocks.map((b) => [b.id, b]));
  return (
    <div className="lhtml-flow" role="img" aria-label={d.title || 'flow'}>
      <ol className="lhtml-steps">
        {blocks.map((b, i) => {
          const next = blocks[i + 1];
          const edge = next
            ? edges.find((e) => e.from === b.id && e.to === next.id)
            : null;
          const gapEdge = edge && isGapStatus(edge);
          return (
            <li key={b.id} className="lhtml-step-wrap">
              <Cell b={b} />
              {next ? (
                <span className={`lhtml-arrow${gapEdge ? ' gap' : ''}`}>
                  →
                  {edge && edge.label ? <span className="lhtml-arrow-lab">{edge.label}</span> : null}
                </span>
              ) : null}
            </li>
          );
        })}
      </ol>
      {edges.some((e) => !byId.has(e.from) || !byId.has(e.to)) ? (
        <p className="lhtml-foot">GAP — some attach edges point at missing blocks</p>
      ) : null}
    </div>
  );
}

function SegmentsDrawing({ d }) {
  const blocks = d.blocks || [];
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const groupOrder = [];
  const grouped = new Map();
  for (const b of blocks) {
    const g = String(b.group || '_');
    if (!grouped.has(g)) {
      grouped.set(g, []);
      groupOrder.push(g);
    }
    grouped.get(g).push(b);
  }
  return (
    <div className="lhtml-segments" role="img" aria-label={d.title || 'segments'}>
      <div className="lhtml-lanes">
        {groupOrder.map((g) => {
          const members = grouped.get(g);
          const roots = members.filter((b) => !b.parent || !members.some((m) => m.id === b.parent));
          const childrenOf = new Map();
          for (const b of members) {
            if (b.parent && byId.has(b.parent)) {
              if (!childrenOf.has(b.parent)) childrenOf.set(b.parent, []);
              childrenOf.get(b.parent).push(b);
            }
          }
          const laneLabel = g === '_' ? '' : g;
          const src = members.find((b) => b.source)?.source || '';
          const asOf = members.find((b) => b.as_of)?.as_of || '';
          return (
            <div key={g} className="lhtml-lane">
              {laneLabel || src || asOf ? (
                <div className="lhtml-lane-h">
                  {laneLabel}
                  {src || asOf ? <span className="dimmer">{[src, asOf].filter(Boolean).join(' · ')}</span> : null}
                </div>
              ) : null}
              <div className="lhtml-lane-body">
                {roots.map((root) => {
                  const kids = childrenOf.get(root.id) || [];
                  return (
                    <div key={root.id} className="lhtml-nest">
                      <Cell b={root} className={kids.length ? 'parent' : ''} />
                      {kids.length ? (
                        <div className="lhtml-kids">
                          {kids.map((k) => <Cell key={k.id} b={k} />)}
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
      <p className="lhtml-foot">categories · tile size carries no $ meaning</p>
    </div>
  );
}

function InterconnectDrawing({ d }) {
  const blocks = d.blocks || [];
  const edges = Array.isArray(d.edges) ? d.edges : [];
  const byId = new Map(blocks.map((b) => [b.id, b]));
  const used = new Set();
  const rows = [];
  for (const e of edges) {
    const from = byId.get(e.from);
    const to = byId.get(e.to);
    if (from) used.add(from.id);
    if (to) used.add(to.id);
    rows.push({
      key: `${e.from}-${e.to}`,
      from: from || { id: e.from, label: e.from || '—', status: 'gap' },
      to: to || { id: e.to, label: e.to || '—', status: 'gap' },
      label: e.label || (isGapStatus(e) ? 'GAP' : 'attaches'),
      gap: isGapStatus(e) || !from || !to,
    });
  }
  const orphans = blocks.filter((b) => !used.has(b.id));
  return (
    <div className="lhtml-ic" role="img" aria-label={d.title || 'interconnect'}>
      <table className="lhtml-attach">
        <thead>
          <tr>
            <th>From</th>
            <th>Attach</th>
            <th>To</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.key} className={r.gap ? 'gap' : ''}>
              <td>
                {r.from.kind ? <Kind kind={r.from.kind} /> : null}
                {' '}{r.from.label}
              </td>
              <td className="lhtml-attach-lab">{r.label}</td>
              <td>
                {r.to.kind ? <Kind kind={r.to.kind} /> : null}
                {' '}{r.to.label}
              </td>
              <td>{r.gap ? <span className="lhtml-gap">GAP</span> : <span className="lhtml-ok">ready</span>}</td>
            </tr>
          ))}
          {orphans.map((b) => (
            <tr key={`orphan-${b.id}`} className={isGapStatus(b) ? 'gap' : ''}>
              <td>
                {b.kind ? <Kind kind={b.kind} /> : null}
                {' '}{b.label}
              </td>
              <td className="lhtml-attach-lab dim">unattached</td>
              <td className="dim">—</td>
              <td>{isGapStatus(b) ? <span className="lhtml-gap">GAP</span> : <span className="lhtml-ok">ready</span>}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {rows.length === 0 && orphans.length === 0 ? (
        <p className="lhtml-foot">GAP — no attach rows</p>
      ) : null}
    </div>
  );
}

function Drawing({ d }) {
  const type = String(d.type || '').toLowerCase();
  if (type === 'stack') return <StackDrawing d={d} />;
  if (type === 'flow') return <FlowDrawing d={d} />;
  if (type === 'segments') return <SegmentsDrawing d={d} />;
  if (type === 'interconnect') return <InterconnectDrawing d={d} />;
  return (
    <div className="lhtml-fallback">
      <div className="lhtml-band-row">
        {(d.blocks || []).map((b) => <Cell key={b.id || b.label} b={b} />)}
      </div>
      <p className="lhtml-foot">layout fallback · unknown diagram type</p>
    </div>
  );
}

function BoardCaption({ d }) {
  const bits = [];
  if (d.not_this) bits.push(`Not this: ${d.not_this}`);
  if (Array.isArray(d.gaps) && d.gaps.length) bits.push(`GAP: ${d.gaps.join(' · ')}`);
  if (Array.isArray(d.sources) && d.sources[0]) {
    bits.push(d.sources.map((s) => s.label).join(' · '));
  }
  if (!bits.length) return null;
  return <p className="dim learn-dnot">{bits.join(' · ')}</p>;
}

/** @param {{ diagrams?: object[], photos?: object[], diagramOrder?: string[], family?: string }} props */
export default function LearnDiagrams({ diagrams, photos, diagramOrder, family }) {
  const list = Array.isArray(diagrams) ? diagrams : [];
  const pics = Array.isArray(photos) ? photos : [];
  const tabs = useMemo(() => diagramTabTypes(list, diagramOrder), [list, diagramOrder]);
  const picked = useMemo(() => pickBoardDiagram(list, diagramOrder), [list, diagramOrder]);
  const [type, setType] = useState(picked ? String(picked.type).toLowerCase() : null);

  const sig = `${(diagramOrder || []).join(',')}|${list.map((d) => `${d.id}:${d.type}`).join(',')}`;
  useEffect(() => {
    const next = pickBoardDiagram(list, diagramOrder);
    setType(next ? String(next.type).toLowerCase() : null);
  }, [sig]); // eslint-disable-line react-hooks/exhaustive-deps

  if (list.length === 0 && pics.length === 0) return null;

  const active = list.find((d) => String(d.type).toLowerCase() === type) || picked;
  const showTabs = tabs.length > 1;

  return (
    <div className="sect">
      <div className="shd">
        <span className="no">⧉</span>
        <h2>ARCHITECTURE</h2>
        {showTabs ? (
          <div className="learn-tabs" role="tablist" aria-label="architecture">
            {tabs.map((t) => (
              <button
                key={t}
                type="button"
                role="tab"
                aria-selected={type === t}
                className={`learn-tab${type === t ? ' on' : ''}`}
                onClick={() => setType(t)}
              >
                {tabLabel(t)}
              </button>
            ))}
          </div>
        ) : (
          <span className="m">
            {family || (active && active.type) || 'board'}
            {active && active.as_of ? ` · as-of ${active.as_of}` : ''}
          </span>
        )}
      </div>
      {active ? (
        <div className="learn-diagrams">
          <div className="learn-diagram">
            <div className="learn-dhead">
              <b>{active.title}</b>
              <span className="dimmer mono" style={{ fontSize: 10 }}>
                {tabLabel(active.type)}
                {active.as_of ? ` · as-of ${active.as_of}` : ''}
              </span>
            </div>
            <Drawing d={active} />
            <BoardCaption d={active} />
          </div>
        </div>
      ) : null}
      <LearnPhotos photos={pics} />
    </div>
  );
}
