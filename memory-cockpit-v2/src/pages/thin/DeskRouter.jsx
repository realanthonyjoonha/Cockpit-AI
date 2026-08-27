// Route subpaths for one thin desk (shared pages).
import React, { useEffect, useState } from 'react';
import { apiPost } from '../../api.js';
import ThinOverview from './Overview.jsx';
import ThinRisks from './Risks.jsx';
import ThinRisk from './Risk.jsx';
import ThinHouse from './House.jsx';
import ThinSources from './Sources.jsx';
import ThinStreet from './Street.jsx';
import ThinModel from './Model.jsx';
import ThinResearch from './Research.jsx';
import ThinReports from './Reports.jsx';
import ThinAsk from './Ask.jsx';
import UpdateMetaOnly from './UpdateMetaOnly.jsx';
import ThinEmpty from './Empty.jsx';

/**
 * @param {{ desk: object, route: string }} props
 * route = full hash path without #/ e.g. "nbis/risks" or "nbis"
 */
export default function DeskRouter({ desk, route }) {
  const prefix = desk.slug;
  const [packTick, setPackTick] = useState(0);

  // If vault files are newer than the compiled pack, compile once for this desk.
  // Unchanged packs skip spawn. Not the Compile-room deep archive.
  useEffect(() => {
    let dead = false;
    apiPost(`${prefix}/compile`, { if_stale: true })
      .then((out) => {
        if (dead) return;
        if (out && out.ran && out.ok) setPackTick((n) => n + 1);
      })
      .catch(() => {});
    return () => { dead = true; };
  }, [prefix]);

  // Normalize: strip query/hash junk; lowercase for room match (case-insensitive routes)
  const rawSub = route === prefix || route === `${prefix}/`
    ? 'overview'
    : route.replace(new RegExp(`^${prefix}/?`, 'i'), '');
  const sub = String(rawSub || '').split(/[?#]/)[0].toLowerCase();

  const k = `${prefix}:${packTick}`;
  if (!sub || sub === 'overview' || sub.startsWith('overview')) return <ThinOverview key={k} desk={desk} />;
  if (sub.startsWith('risk/')) {
    const idPart = rawSub.includes('/') ? rawSub.slice(rawSub.toLowerCase().indexOf('risk/') + 5) : sub.slice(5);
    return <ThinRisk key={k} desk={desk} id={decodeURIComponent(idPart)} />;
  }
  if (sub.startsWith('risks')) return <ThinRisks key={k} desk={desk} />;
  if (sub.startsWith('house')) return <ThinHouse key={k} desk={desk} />;
  if (sub.startsWith('sources')) return <ThinSources key={k} desk={desk} />;
  if (sub.startsWith('street')) return <ThinStreet key={k} desk={desk} />;
  if (sub.startsWith('model')) return <ThinModel key={k} desk={desk} />;
  if (sub.startsWith('research')) return <ThinResearch key={k} desk={desk} />;
  if (sub.startsWith('reports')) return <ThinReports key={k} desk={desk} />;
  if (sub.startsWith('ask')) return <ThinAsk key={k} desk={desk} />;
  if (sub.startsWith('update')) {
    return <UpdateMetaOnly key={k} desk={desk.slug} ticker={desk.ticker} label={desk.label} />;
  }
  return <ThinEmpty key={k} desk={desk} path={sub} />;
}
