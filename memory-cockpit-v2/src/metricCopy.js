/** Kind gloss for the dossier only. print | condition | catalyst. No kind=risk. */
export const METRIC_KIND_GUIDE = [
  { id: 'print', title: 'PRINT', body: 'Load-bearing number the house lives on. A miss is off-plan, not FIRED.' },
  { id: 'condition', title: 'CONDITION', body: 'Constraint the stance is conditional on.' },
  { id: 'catalyst', title: 'CATALYST', body: 'Dated event that can realize the book.' },
];

export function metricKindGuide(kind) {
  const k = String(kind || '').toLowerCase();
  return METRIC_KIND_GUIDE.find((x) => x.id === k) || null;
}

/**
 * Prototype copy — register weight, not stubs.
 * Split of META 08 into last (print) vs house (what the stance is on).
 */
export const METRICS_PROTO_ROWS = [
  {
    id: 'proto-m1-ads',
    name: 'M1 — FoA advertising volume / price / Reels mix',
    kind: 'print',
    status: 'ON-PLAN',
    last: 'Advertising is ~98% of revenue (FY2025 ads $196.175B of $200.966B; Q2 2026 $59.363B of $60.801B). Q2 impressions +14% and price +12% still print, but Family DAP slowed to +3% (June 2026 3.60B) from +7% in December 2025. Reels still company-stated as lower-monetizing than Feed/Stories.',
    house: 'FoA (Instagram especially) is the funder. Mix holds. Muse / Meta AI must attach through ads quality — ads is the funder, not the thesis.',
    as_of: '2026-07-19',
    next: 'Q3 print',
    streak: 0,
    mix: '',
    kill: 'Impressions or price down two prints with DAP still rolling over, by Q1 2027.',
    monitors: [
      { signal: 'Imp / price', monitor: 'Still printing vs prior', state: 'Q2 +14% / +12%', as_of: '2026-07-19' },
      { signal: 'DAP', monitor: 'Does not roll over', state: '+3% June (was +7%)', as_of: '2026-07-19' },
    ],
  },
  {
    id: 'proto-m2-capex',
    name: 'M2 — AI infrastructure capex vs FCF conversion',
    kind: 'condition',
    status: 'TRACK',
    last: 'Company capex (PPE + finance-lease principal) was $72.22B in FY2025 and $31.08B in Q2 2026; Q2 company-defined FCF was $784M on $31.86B OCF. FY2026 capex outlook $130–145B. Purchase commits $349.3B and leases-not-commenced ~$279B (plus ~$68B July DC leases) are the stock of the build.',
    house: 'Spend is the cash-conversion overlay, not the product. Capex is ok if FoA attach prints. R2 is not the strategy — attach is.',
    as_of: '2026-07-19',
    next: 'FY26 guide',
    streak: 0,
    mix: '',
    kill: 'FCF stays this thin two more prints while attach still GAP, by Q2 2027.',
    monitors: [
      { signal: 'FCF vs capex', monitor: 'Conversion stays overlay', state: 'Q2 FCF $784M on $31.1B capex', as_of: '2026-07-19' },
    ],
  },
  {
    id: 'proto-m3-muse',
    name: 'M3 — Muse / Meta AI attach vs FoA distribution',
    kind: 'print',
    status: 'OFF-PLAN',
    last: 'Company newsroom 2026-09-08: Muse is a personal AI agent (Muse Spark; Muse Secure VM; iOS, Android, muse.ai; coming to AI glasses; WhatsApp as a talk-to-Muse surface). Stack around it: Muse Image (Jul 2026), Meta AI across apps (10-K), Superintelligence Labs first model (Q1 2026 CEO). Meta One paid usage (2026-09-15 newsroom: 15 million subscriptions and trials) — not a Muse KPI. No Muse users, queries, mix, or revenue in the Q2 10-Q.',
    house: 'FoA attach (Instagram especially) is why capex is ok — not a standalone app. This line is load-bearing product. A miss is off-plan, not FIRED.',
    as_of: '2026-09-08',
    next: 'Need a Muse KPI',
    streak: 1,
    mix: 'Newsroom launch, not a filed KPI.',
    kill: 'Still no Muse users, mix, or $ in two more 10-Qs, by Q2 2027.',
    monitors: [
      { signal: 'Muse KPI', monitor: 'Users / queries / mix in a filing', state: 'GAP — not in Q2 10-Q', as_of: '2026-09-08' },
    ],
  },
];

export function protoStatusRank(status) {
  const s = String(status || '').toUpperCase();
  if (s === 'OFF-PLAN') return 0;
  if (s === 'TRACK') return 1;
  if (s === 'ON-PLAN') return 2;
  return 3;
}

function deskIsMeta(desk) {
  const slug = String(desk?.slug || desk || '').toLowerCase();
  const ticker = String(desk?.ticker || '').toLowerCase();
  return slug === 'meta' || ticker === 'meta';
}

/** Overlay copy (last/status) is META-only costume. Not auto-kept as Drivers. */
export function protoRowsForDesk(desk) {
  return deskIsMeta(desk) ? METRICS_PROTO_ROWS : [];
}

/**
 * Quoted from CONFIRMED META house. None are Drivers until the user keeps them.
 * Includes risk-shaped lines on purpose — user culls.
 */
export const HOUSE_CANDIDATES_META = [
  {
    id: 'c-ads',
    title: 'Ads is the cash engine, not the thesis',
    quote: 'This house is AI strategy and execution first. The ads print is the cash engine and the proof that distribution still works. It is not the thesis by itself.',
    protoId: 'proto-m1-ads',
  },
  {
    id: 'c-muse',
    title: 'Muse / stack is why capex can pay for itself',
    quote: 'Muse and the rest of the Muse/Meta AI stack are why this house thinks the AI capex step-up can pay for itself, conditional on Instagram/FoA actually attaching the products.',
    protoId: 'proto-m3-muse',
  },
  {
    id: 'c-capex',
    title: 'Live with the capex bill if attach prints',
    quote: 'This house is willing to live with that spend if model quality is competitive again and Muse-class products plus in-app AI attach through Instagram/FoA. It is not willing to treat capex as self-justifying.',
    protoId: 'proto-m2-capex',
  },
  {
    id: 'c-dist',
    title: 'Distribution is the scarce asset',
    quote: 'This house’s edge is Instagram (and the rest of FoA) as the attach surface for Muse/Meta AI — not a greenfield consumer-AI app.',
    protoId: null,
  },
  {
    id: 'c-rl',
    title: 'RL is a loss overlay, not the AI thesis',
    quote: 'RL remains a loss overlay, not the AI thesis. Glasses are a Muse/Meta AI surface; they are not a substitute for Muse attach.',
    protoId: null,
  },
  {
    id: 'c-legal',
    title: 'Legal / EU can tax the spend',
    quote: 'Legal / EU / FTC can tax the spend without being the AI story.',
    protoId: null,
  },
];

export function houseCandidatesForDesk(desk) {
  return deskIsMeta(desk) ? HOUSE_CANDIDATES_META : [];
}

export function driverRowFromCandidate(c) {
  const overlay = METRICS_PROTO_ROWS.find((r) => r.id === c.protoId);
  if (overlay) return { ...overlay, candidateId: c.id, house: c.quote };
  return {
    id: c.id,
    candidateId: c.id,
    name: c.title,
    kind: 'condition',
    status: 'TRACK',
    last: '—',
    house: c.quote,
    as_of: '',
    next: '—',
    streak: 0,
    mix: '',
    kill: '',
    monitors: [],
  };
}

export function cullStorageKey(slug) {
  return `cockpit-drivers-cull:${String(slug || '').toLowerCase()}`;
}

export function protoPulse(rows) {
  if (rows.some((r) => r.status === 'OFF-PLAN')) return 'OFF-PLAN';
  if (rows.some((r) => r.status === 'TRACK')) return 'TRACK';
  if (!rows.length) return 'EMPTY';
  return 'ON-PLAN';
}
