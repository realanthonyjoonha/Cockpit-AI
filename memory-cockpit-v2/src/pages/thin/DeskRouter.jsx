// Route subpaths for one thin desk (shared pages).
import React from 'react';
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
  // Normalize: strip query/hash junk; lowercase for room match (case-insensitive routes)
  const rawSub = route === prefix || route === `${prefix}/`
    ? 'overview'
    : route.replace(new RegExp(`^${prefix}/?`, 'i'), '');
  const sub = String(rawSub || '').split(/[?#]/)[0].toLowerCase();

  if (!sub || sub === 'overview' || sub.startsWith('overview')) return <ThinOverview desk={desk} />;
  if (sub.startsWith('risk/')) {
    const idPart = rawSub.includes('/') ? rawSub.slice(rawSub.toLowerCase().indexOf('risk/') + 5) : sub.slice(5);
    return <ThinRisk desk={desk} id={decodeURIComponent(idPart)} />;
  }
  if (sub.startsWith('risks')) return <ThinRisks desk={desk} />;
  if (sub.startsWith('house')) return <ThinHouse desk={desk} />;
  if (sub.startsWith('sources')) return <ThinSources desk={desk} />;
  if (sub.startsWith('street')) return <ThinStreet desk={desk} />;
  if (sub.startsWith('model')) return <ThinModel desk={desk} />;
  if (sub.startsWith('research')) return <ThinResearch desk={desk} />;
  if (sub.startsWith('reports')) return <ThinReports desk={desk} />;
  if (sub.startsWith('ask')) return <ThinAsk desk={desk} />;
  if (sub.startsWith('update')) {
    return <UpdateMetaOnly desk={desk.slug} ticker={desk.ticker} label={desk.label} />;
  }
  return <ThinEmpty desk={desk} path={sub} />;
}
