#!/usr/bin/env node
// migrate.js — ONE-SHOT migration: monitors.md tables + inline Monitor: markers on #memory pages
// → cockpit/risks/<id>.md (12 files) + cockpit/series/_registry.md + cockpit/desks/*.md.
//
// DEFAULT IS DRY-RUN: prints the planned file list, the full text of one risk file, the
// _unmapped report, and every mapping/merge decision. Writes NOTHING without --write.
// --write: makes a timestamped backup of cockpit/ OUTSIDE the vault first, then writes
// atomically (tmp+rename — Obsidian may hold files open). All writes are asserted to stay
// under cockpit/; house-view.md is name-blocked as belt-and-braces. Zero deps (Node stdlib).
//
// Usage: node migrate.js [--write] [--vault <path>] [--example <risk-id>]
import fs from 'fs';
import path from 'path';
import os from 'os';

const args = process.argv.slice(2);
const WRITE = args.includes('--write');
const VAULT = args.includes('--vault') ? args[args.indexOf('--vault') + 1]
  : (process.env.COCKPIT_VAULT || path.join(os.homedir(), 'Trading', 'research-wiki'));
const EXAMPLE_ID = args.includes('--example') ? args[args.indexOf('--example') + 1] : 'positioning-unwind';
// local date, not UTC — a 9pm PT run must not stamp tomorrow
const TODAY = new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const COCKPIT = path.join(VAULT, 'cockpit');

// ---------------------------------------------------------------------------
// §6 — the 12 curated risks. Hand-authored contract content: prose + canonical
// tripwires come from the design ground truth (tab D) where a page was mocked,
// §6 of the build plan otherwise; houseview: anchors quote house-view.md verbatim.
// `absorb` regexes fold extracted duplicates into a canonical row (provenance kept).
// ---------------------------------------------------------------------------
const RISKS = [
  {
    id: 'positioning-unwind', name: 'Positioning unwind', order: 1, status: 'WATCH', grade: 'A',
    hv: false, category: 'fund-micro',
    houseview: '"Stage: mid-stage — not early, not late; meaningful room left." — flows can force a violent drawdown straight through an intact mid-stage thesis.',
    summary: 'crowding record · <1 day-to-cover · swap-amplified',
    series: ['retail-flow-hynix', 'retail-flow-samsung', 'lev-etf-flow', 'price-dram-etf'],
    pages: ['memory-fund-positioning', 'roundhill-dram-etf', 'watchlist'],
    prose: `**The risk:** the most crowded trade on record, mid-unwind. BofA FMS ranks memory **#1 crowded (80%)**; short interest <1 day-to-cover — **no cushion** on a break; the DRAM ETF is swap-amplified; Burry disclosed a MU short 7/3. A positioning-risk flag — *not* a thesis rebuttal: flows can force a violent drawdown through an intact mid-stage thesis.`,
    tripwires: [
      { signal: 'BofA FMS crowding rank', trip: 'stays #1 while the unwind accelerates', state: 'WATCH', asOf: '2026-06-30', absorb: [/roll-?over.*from 80%|positioning being cut/i] },
      { signal: 'Short-interest days-to-cover', trip: '<1 day = no cushion on any break', state: 'WATCH', asOf: '2026-06-30', absorb: [/days-to-cover <1|trivially coverable|long-liquidation air-pocket/i] },
      { signal: 'KR retail net-buy (Hynix / Samsung / KODEX-lev)', trip: 'sustained record inflows = froth confirm', state: 'building', asOf: '—' },
    ],
    history: [
      ['2026-07-03', 'note', 'Burry MU short disclosure folded in; retail-flow instruments registered.'],
      ['2026-07-03', 'open', 'Risk opened at WATCH from the fund-positioning deep-dive (FMS most-crowded print + sub-1-day cover).'],
    ],
  },
  {
    id: 'policy-loosening', name: 'Policy / export loosening', order: 2, status: 'WATCH', grade: 'B',
    hv: false, category: 'policy',
    houseview: '"Why it lasts: memory fabs take years to build and cannot catch up with demand anytime soon." — the EUV wall is what keeps CXMT from breaking that clock; a détente that loosens it is the counter.',
    summary: 'détente loosens EUV wall → CXMT fulcrum',
    series: [],
    pages: ['memory-policy-risk', 'cxmt'],
    prose: `**The risk:** policy is net-protective — the EUV/service wall contains [[cxmt]] on the commodity flank — but the US–China détente is actively *loosening* controls (BIS holding off on CXMT; the Nov-10-2026 mineral cliff trades leverage both ways). The moat around the oligopoly is legislative, not physical; it can be negotiated away faster than a fab can be built.`,
    tripwires: [
      { signal: 'BIS Entity-List action on CXMT', trip: 'a Federal Register notice adding CXMT = cleanest bullish-for-incumbents catalyst; continued hold-off = the loosening confirm', state: 'WATCH', asOf: '2026-07-03', absorb: [/Entity List/i] },
      { signal: 'MATCH Act / EUV access', trip: 'enactment vs defeat · any EUV-or-service loosening toward CXMT (STAR IPO completion = funding unlock)', state: '—', asOf: '2026-07-03', absorb: [/MATCH Act.*(enactment|defeat)|STAR IPO|EUV access/i] },
      { signal: 'CHIPS plumbing', trip: 'Micron grant→equity conversion · Samsung Taylor restart · 8-K milestone-disbursement slippage', state: '—', asOf: '2026-07-03', absorb: [/grant→equity|Taylor restart|milestone-disbursement/i, /CHIPS repeal|Section 232/i] },
    ],
    history: [
      ['2026-07-03', 'open', 'Risk opened at WATCH from [[memory-policy-risk]] — net-protective wall, but the détente is loosening it; CXMT is the policy fulcrum.'],
    ],
  },
  {
    id: 'price-cycle', name: 'Price-cycle rollover', order: 3, status: 'INTACT', grade: 'A',
    hv: false, category: 'fund-micro',
    houseview: '"Regime: memory has structurally de-cycled — cyclical → structural business; the shortage is here to stay." — the cycle clock is the oldest counter to that claim; spot and contract are where it would show first.',
    summary: 'spot ▲ · ASP positive · inventory lean',
    series: ['dram-spot-ddr5', 'dram-spot-ddr4', 'semi-import-price'],
    pages: ['memory-super-cycle', 'calibration-event-micron-q3'],
    prose: `**The risk:** the classical cycle reasserts inside the structural story — contract ASPs roll while inventory days build, and the *stock* tops even though the deficit persists (deficit ≠ price peak). DDR4 pricing above DDR5 is a real EOL squeeze, not a data error — the tell to watch is the sequence, not any single print.`,
    tripwires: [
      { signal: 'Contract DRAM ASP QoQ + inventory days ⭐', trip: '2 quarters ASP negative + rising inventory days', state: '—', asOf: '2026-06-30', absorb: [/ASP QoQ.*inventory|2 quarters negative \+ rising inventory/i, /contract-price sequence.*inventory-days|prices flattening\/rolling WHILE inventory-days climb/i] },
      { signal: 'HBM-vs-commodity price spread', trip: 'converging = the bifurcation (HBM-leverage vs blended) breaking down', state: '—', asOf: '2026-06-30', absorb: [/HBM-vs-commodity price spread|HBM3e\/DDR5 ASP ratio|HBM-vs-commodity margin spread/i] },
      { signal: 'Margin-peak signature', trip: 'first sequential GM deceleration (CFO Murphy "decelerating rates" — FQ1\'27 guide, 2026-09-22)', state: '—', asOf: '2026-06-30', absorb: [/GM deceleration|decelerating rates|HBM4 mix re-widens|sequential GM/i] },
    ],
    history: [
      ['2026-06-30', 'open', 'Risk consolidated from [[monitors]] (master tell №1) — spot ▲, ASPs positive, inventory lean; no rollover signature.'],
    ],
  },
  {
    id: 'memory-per-token', name: 'Memory-per-token shock', order: 4, status: 'INTACT', grade: 'A',
    hv: true, hvChip: 'HV · TRIGGER №2 + THE HINGE', category: 'eng-risk',
    houseview: `"The live risk is specifically edge / 'good-enough' on-device bending memory-content-per-chip, not a general scaling break (which is Jevons-favorable)" — and the hinge itself: "the thesis hinges on rising HBM/DRAM content per AI chip — and stands on that alone."`,
    summary: 'kill-switch · quiet',
    series: [],
    pages: ['deepseek-v4-nonnvidia-2026', 'three-adaptive-responses', 'memory-deficit-horizon-2030', 'nand-substitution-deepdive-2026'],
    prose: `**The risk:** your №2 kill-switch and the only thing that bends the 2030+ floor: V4-class KV-cache compression spreading to *Western frontier models* while demand-growth decelerates (**both needed**), or edge/on-device content-per-chip bending. This is also your remaining edge — the read that the efficiency risk is edge-specific is where you differ from the Street.`,
    tripwires: [
      { signal: 'Compression deployed West ⭐', trip: 'V4-class (~10×/gen) in a Western frontier model AND demand decelerating — both', state: '—', asOf: '2026-06-30', absorb: [/V4-class compression|KV-cache compression|Western frontier models/i] },
      { signal: 'Edge / on-device content', trip: '"good-enough" on-device bending memory-content-per-chip', state: '—', asOf: '2026-06-30' },
      { signal: 'DRAM bit-demand growth', trip: '< mid-20s %/yr while AI capex stays high', state: '—', asOf: '2026-06-30', absorb: [/bit-demand growth.*mid-20s|deficit math/i] },
    ],
    history: [
      ['2026-07-01', 'event', 'DeepSeek V4 ingested — ~10× KV-cache/gen deployed at scale, but Jevons-additive (spent on 1M-context + agentic). Tripwire armed; West-spread not observed.'],
      ['2026-06-30', 'locked', 'Efficiency→edge/on-device framing LOCKED into the house view.'],
    ],
  },
  {
    id: 'capex-rollover', name: 'AI-trade health / capex rollover', order: 5, status: 'INTACT', grade: 'A',
    hv: true, hvChip: 'HV · TRIGGER №3', category: 'fund-micro',
    houseview: '"Step-back triggers: … (3) the health of the overall AI trade — especially hyperscaler capex-to-OCF + AI debt-issuance pace (the financing-mix tell)."',
    summary: 'demand engine accelerating · no rollover signature',
    series: ['ai-capex', 'micron-capex'],
    pages: ['ai-capex-memory-flowthrough', 'memory-microeconomics'],
    prose: `**The risk:** the ~$725B→$1T demand engine decelerates before supply lands — and the *financing mix* is the real bubble tell: capex outrunning operating cash flow, funded by AI bonds and private credit. Master tell №3. Hits memory ~2× on the way down.`,
    tripwires: [
      { signal: 'Capex-to-OCF + bond pace ⭐', trip: "capex outruns OCF (~Q3'26 watch) + rising AI debt issuance", state: '—', asOf: '2026-06-30', absorb: [/capex-to-OCF.*bond|capex outrunning OCF|AI bond\/private-credit issuance/i, /capex\/OCF crossing 100%|Amazon prints negative FCF|neocloud HY spreads/i] },
      { signal: 'Capex guides', trip: '≥2 hyperscalers guide <+10% YoY same quarter · sequential RPO decline', state: '—', asOf: '2026-06-30', absorb: [/≥2 (hyperscalers )?guid|guiding capex <\+10%|hyperscaler capex guidance|coordinated hyperscaler capex cut/i] },
      { signal: 'TSMC CoWoS wpm + capex', trip: 'sudden over-expansion = the upstream overbuild signal', state: '—', asOf: '2026-06-30', absorb: [/CoWoS wpm|CoWoS wafers|over-expansion/i] },
    ],
    history: [
      ['2026-07-03', 'series', 'ai-capex live — Σ(MSFT+GOOGL+AMZN+META) instrumented; still accelerating, no rollover signature.'],
      ['2026-06-30', 'locked', 'Capex-to-OCF + issuance-pace framing LOCKED into the house view.'],
    ],
  },
  {
    id: 'cxmt-supply', name: 'CXMT / China supply', order: 6, status: 'INTACT', grade: 'B',
    hv: false, category: 'policy',
    houseview: '"Why it lasts: memory fabs take years to build and cannot catch up with demand anytime soon." — CXMT at scale is the direct counterexample; the credible window is 2028–30 unless access loosens.',
    summary: '<400k wpm · no OEM design-in · no domestic HBM',
    series: [],
    pages: ['cxmt', 'memory-policy-risk'],
    prose: `**The risk:** the fourth entrant. [[cxmt]] pressures the commodity low end today, but the structural question is whether it can break the oligopoly's supply clock — sustained >400k wpm, a major OEM DDR5 design-in, or credible domestic HBM (accelerated by China-compute / DeepSeek-V4 demand). No EUV, MATCH-Act coverage and a suspended IPO push the credible threat window to 2028–2030 — unless policy loosens it (§policy-loosening is the fulcrum).`,
    tripwires: [
      { signal: 'CXMT output + DDR5 OEM qual + HBM progress', trip: '> ~400k wpm · a major OEM design-in · credible domestic HBM', state: '—', asOf: '2026-07-01', absorb: [/CXMT (output|sustained|>400k|capacity)|400k WPM|HBM3e-grade yield/i, /CXMT >400k WPM; server DDR5/i] },
    ],
    history: [
      ['2026-07-01', 'note', 'CXMT elevated to *the* structural fulcrum by the scenario desk.'],
      ['2026-06-30', 'open', 'Risk consolidated from [[monitors]] — <400k wpm, no OEM design-in, no domestic HBM.'],
    ],
  },
  {
    id: 'eng-detours', name: 'Engineering detours ×9', order: 7, status: 'INTACT', grade: 'A',
    hv: true, hvChip: 'HV · TRIGGER №2', category: 'eng-risk',
    houseview: '"Step-back triggers: … (2) engineering breakthroughs to cheaper / alternative memory (efficiency kill-switch)."',
    summary: 'none at scale',
    series: [],
    pages: ['memory-tax-detour-tracks', 'nand-substitution-deepdive-2026', 'wafer-trade-off-3-to-1'],
    prose: `**The risk:** any of the nine engineering detours around the memory tax shipping at scale — HBF, PIM, CXL-pooling, post-Groq SRAM, Apple-sparse→Android — each one relieves the exact scarcity your thesis prices. Adversarial verdict held so far: **through-2028 NO / 2030+ floor open.**`,
    tripwires: [
      { signal: 'Any detour at scale', trip: 'CXL billed instance · HBF design-slot · SRAM relieving HBM · Apple-sparse→Android', state: '—', asOf: '2026-06-28', absorb: [/Detours biting|CXL billed instance|HBF design-slot/i] },
      { signal: 'NAND substitution', trip: 'the 2030+ floor reopening (deep-dive verdict flips)', state: '—', asOf: '2026-06-30' },
      { signal: 'Detour compounding', trip: 'two+ tracks maturing together — the floor-bending combination', state: '—', asOf: '2026-06-28' },
    ],
    history: [
      ['2026-06-30', 'verdict', 'NAND-substitution deep-dive: through-2028 NO / 2030+ open — the detour set is the residual risk.'],
      ['2026-06-28', 'open', 'Nine tracks catalogued from the memory-tax detours ingest.'],
    ],
  },
  {
    id: 'valuation-rerating', name: 'Valuation re-rating', order: 8, status: 'INTACT', grade: 'B',
    hv: true, hvChip: 'HV · TRIGGER №1', category: 'fund-micro',
    houseview: `"Step-back triggers: (1) valuations…" — and the DRAFT view it rests on: "~7× fwd vs the AI complex at 24–42×; the cheapness is on durable, not peak, earnings."`,
    summary: '~7× fwd vs 24–42× complex',
    series: ['mu-pe', 'price-mu'],
    pages: ['cheapest-ai-exposure-forward-pe', 'dram-etf-initiation'],
    prose: `**The risk:** the margin of safety re-rates away — memory moves from ~7× forward toward the complex's 24–42× while earnings merely hold. Your own reframe applies: *is it the earnings or the multiple?* A run driven by the multiple is the step-back signal. Note the internal to-do: the cheapness view is still **DRAFT** — confirm or restate it.`,
    tripwires: [
      { signal: 'MU / complex forward P/E', trip: 're-rating decomposition: multiple expanding >2× while fwd EPS flat', state: '—', asOf: '2026-07-03' },
      { signal: 'Earnings-vs-multiple attribution', trip: 'runs where >60% of return = multiple, not EPS revisions', state: '—', asOf: '2026-06-30' },
      { signal: 'Cheapness-thesis status', trip: 'cheapest-ai-exposure still DRAFT → trigger rests on unconfirmed premise', state: 'open', asOf: '2026-06-27' },
    ],
    history: [
      ['2026-07-03', 'instr', 'mu-pe series specified (price ÷ TTM EPS, EDGAR+Nasdaq) — trigger №1 instrumented; populates on first sync.'],
      ['2026-06-28', 'open', 'Named step-back trigger №1 in the CONFIRMED entry.'],
    ],
  },
  {
    id: 'oligopoly-discipline', name: 'Oligopoly discipline break', order: 9, status: 'INTACT', grade: 'B',
    hv: false, category: 'fund-micro',
    houseview: '"Regime: memory has structurally de-cycled — cyclical → structural business." — de-cycling holds only while the three price on intensity instead of chasing share; discipline is the mechanism, not a given.',
    summary: 'supplier capex on intensity · 3-to-1 reversal',
    series: ['micron-capex'],
    pages: ['wafer-trade-off-3-to-1', 'memory-oligopoly', 'memory-microeconomics'],
    prose: `**The risk:** the load-bearing behavioral assumption breaks. Three rational incumbents currently price on intensity, not share — and the [[wafer-trade-off-3-to-1]] is the physical expression (every HBM wafer starves the commodity pool). A share-chasing capex race, or HBM wafer-share reverting to commodity, is the classical glut mechanism coming back online.`,
    tripwires: [
      { signal: 'Capital intensity vs the glut band', trip: 'capex/revenue pushing the 35–45% historical glut band · any single maker breaking discipline to chase share', state: '—', asOf: '2026-07-03', absorb: [/capital intensity vs|glut band|breaking discipline|capex\/revenue/i] },
      { signal: 'HBM wafer-share vs bit-share gap', trip: 'HBM wafer share plateauing/falling — wafers reverting to commodity = next-glut leading indicator (2–3 quarters early)', state: '—', asOf: '2026-07-03', absorb: [/wafer-share vs bit-share|wafers reverting to commodity|share of DRAM wafer input|wafer input/i] },
      { signal: 'HBM4/4E share shifts among the three', trip: 'share-defense capex (SKH) vs re-entry push (Samsung) vs third-supplier catch-up (MU) turning into a share war', state: '—', asOf: '2026-07-03', absorb: [/HBM4(\/4E)? share|HBM4 yield ramp|HBM4 qualification breadth|allocation tier|share defense|share trajectory|durable HBM share/i] },
    ],
    history: [
      ['2026-07-03', 'open', 'Risk opened from [[memory-microeconomics]] + [[memory-oligopoly]] — discipline holds on intensity; 3-to-1 intact.'],
    ],
  },
  {
    id: 'air-pocket-2027', name: '2027–28 supply air-pocket', order: 10, status: 'INTACT', grade: 'B',
    hv: false, category: 'fund-micro',
    houseview: '"Horizon: shortage persists at least to 2030, and I suspect a lot longer." — the one fault line all four micro factors share is supply finally landing in 2027–28 into softer demand; it attacks the magnitude, not the existence, of the deficit.',
    summary: "the shared '27–'28 fault line",
    series: ['ai-capex', 'dram-spot-ddr5', 'dram-spot-ddr4'],
    pages: ['memory-scenario-desk-2026-07', 'memory-scenario-tree', 'memory-microeconomics'],
    prose: `**The risk:** the one fault line every micro factor shares — the ~30% wafer-capacity step, greenfield fabs and P4 conversion land in 2027–28 just as unit-economics pressure (mix-down, longer cycles) finally bites non-AI *bit* demand. The scenario desk puts the seam at late-2027 (greenfield dates + roofline). Not a today-signal — a dated collision to track into.`,
    tripwires: [
      { signal: '2027 net commodity-bit adds', trip: 'the ~30% wafer step landing as net commodity bits (vs HBM-diverted)', state: '—', asOf: '2026-07-01', absorb: [/net commodity[- ]bit|added wafers are net commodity bits|30% wafer|wafer step/i] },
      { signal: '30-month cycle clock', trip: 'the up-cycle aging into the historical window while supply dates approach', state: '—', asOf: '2026-07-01', absorb: [/30-month cycle clock/i] },
      { signal: 'Non-AI bit-demand stall', trip: 'bit-demand guidance cut toward flat for non-AI while unit declines deepen (2027 affordability pocket)', state: '—', asOf: '2026-07-03', absorb: [/bit-demand growth vs unit decline|affordability air-pocket|units deepen/i] },
      { signal: 'Late-2027 seam markers', trip: 'greenfield completion dates + the roofline crossing from the scenario model', state: '—', asOf: '2026-07-01' },
    ],
    history: [
      ['2026-07-01', 'open', 'Risk opened from the scenario desk — cyclicality-reasserting carries ~37% of branch mass; the seam is late-2027.'],
    ],
  },
  {
    id: 'ai-trade-contagion', name: 'AI-trade contagion (NVDA / CoWoS)', order: 11, status: 'INTACT', grade: 'B',
    hv: false, category: 'fund-micro',
    houseview: '"(3) the health of the overall AI trade" — the contagion channel of trigger №3: if the complex cracks upstream (NVDA margin, CoWoS), memory takes it ~2× as the largest BOM line, demand engine intact or not.',
    summary: 'NVDA GM / CoWoS propagation',
    series: [],
    pages: ['monitors'],
    prose: `**The risk:** the trade's beta to the AI complex itself. Distinct from §capex-rollover (the demand engine): this is the market-structure channel — an NVDA margin break or CoWoS shock propagates to memory ~2× regardless of whether hyperscaler demand actually rolled. The shared fault line with the air-pocket: both are how "the AI trade wobbles" reaches a memory book first.`,
    tripwires: [
      { signal: 'NVDA gross margin + $/rack workload-split', trip: 'GM < ~70% with a rising *inference* mix (NOT unit share — that falls by design via NVLink Fusion)', state: '—', asOf: '2026-06-30', absorb: [/Gross margin \+ \$\/rack|GM < ~70%/i] },
      { signal: 'Non-CUDA inference share', trip: 'rising share of frontier inference on non-NVIDIA (ASIC/Ascend/TPU-codesigned) + optical supernodes', state: '—', asOf: '2026-06-30', absorb: [/Non-CUDA inference share|optical supernodes/i] },
    ],
    history: [
      ['2026-06-30', 'open', 'Risk consolidated from [[monitors]] §NVIDIA + §AI-trade/macro — the NVDA dial as LOCKED into the house view.'],
    ],
  },
  {
    id: 'etf-tail-sleeve', name: 'ETF tail-sleeve — expression risk', order: 12, status: 'INTACT', grade: 'C — VERIFY',
    hv: true, hvChip: 'HV · EXPRESSION CAVEAT', category: 'expression',
    houseview: `"The ETF's lower-tier tail-sleeve (small Nanya / Winbond / GigaDevice / Macronix-type weights) is the 'moon-10×-then-revert' cohort — the spike-and-fade risk inside the basket (exact tail weights: verify)."`,
    summary: "tail weights unverified — the HV's open item",
    series: ['price-dram-etf'],
    pages: ['roundhill-dram-etf', 'dram-etf-initiation'],
    prose: `**The risk:** the thesis is right and the *vehicle* still hurts you — the basket's junk cohort spikes 10× on froth, drags the ETF up, then mean-reverts through it. Your own file flags the open homework: **the exact tail weights are unverified** — that's this page's first tripwire, not a footnote.`,
    tripwires: [
      { signal: 'Tail weights — VERIFY', trip: "pull current holdings; quantify the sleeve (the HV's explicit open item)", state: 'open', asOf: 'open' },
      { signal: 'Tail-vs-majors spread', trip: 'tail cohort outperforming the oligopoly majors by a wide margin = sleeve froth', state: '—', asOf: '2026-06-28' },
      { signal: 'Sleeve weight drift', trip: "froth inflating the sleeve's share of the basket → ETF ≠ the oligopoly bet you sized", state: '—', asOf: '2026-06-28' },
      { signal: 'Wrapper mechanics', trip: 'tracking vs NAV · swap-counterparty terms · the 0.65% drag (mechanical, not thesis)', state: '—', asOf: '2026-07-03', absorb: [/tracking vs NAV|swap-counterparty|NAV premium/i, /basket pricing via quarterly/i] },
    ],
    history: [
      ['2026-06-28', 'open', "Caveat recorded in the CONFIRMED entry (per Baker's moon-then-revert cohort framing)."],
    ],
  },
];

// ---------------------------------------------------------------------------
// Extraction — ported from v1 server/factors.js (the §8-manifest extractor).
// ---------------------------------------------------------------------------
const MEMORY_SECTIONS = ['Memory / DRAM', 'AI-trade / macro', 'NVIDIA'];
const clean = (md) => md.replace(/\*\*/g, '').replace(/(?<!\[)\*(?!\])/g, '')
  .replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a).trim();

function extractFromMonitors() {
  const raw = fs.readFileSync(path.join(VAULT, 'wiki', 'monitors.md'), 'utf8');
  const updated = (raw.match(/^updated:\s*(\S+)/m) || [])[1] || null;
  const out = [];
  for (const sec of raw.split(/^## /m).slice(1)) {
    const heading = sec.split('\n')[0].trim();
    if (!MEMORY_SECTIONS.some((s) => heading.startsWith(s))) continue;
    for (const row of sec.matchAll(/^\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|([^|\n]+)\|\s*$/gm)) {
      const [signal, trip, flips, where] = [row[1], row[2], row[3], row[4]].map(clean);
      if (/^Signal$/i.test(signal) || /^-+$/.test(signal.replace(/\s/g, ''))) continue;
      out.push({ src: `monitors.md §${heading.split('(')[0].trim()}`, section: heading, signal, trip, flips, where, asOf: updated });
    }
  }
  return out;
}

// #memory-tagged pages (excluding figures/ — analyst voice; log.md; the MOC), Monitor: markers
function extractFromPages() {
  const out = [];
  const roots = ['wiki/entities', 'wiki/concepts', 'wiki/sources'];
  for (const root of roots) {
    const dir = path.join(VAULT, root);
    if (!fs.existsSync(dir)) continue;
    for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.md'))) {
      const abs = path.join(dir, f);
      const raw = fs.readFileSync(abs, 'utf8');
      const tagSource = raw.replace(/```[\s\S]*?```/g, '').replace(/`[^`\n]*`/g, '');
      if (!/#memory\/[\w-]+/.test(tagSource)) continue;
      const slug = f.replace(/\.md$/, '');
      const updated = (raw.match(/^updated:\s*"?(\d{4}-\d{2}-\d{2})/m) || [])[1] || null;
      for (const m of raw.matchAll(/\*{0,2}\bMonitor(?:able)?s?\b\*{0,2}:\s*([^\n]+)/g)) {
        const text = clean(m[1]);
        if (text.length < 8) continue;
        out.push({ src: `${root.replace('wiki/', '')}/${slug}`, page: slug, signal: text, trip: text, asOf: updated });
      }
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mapping: page hard-overrides → section defaults → ordered keyword rules.
// Anything unmatched lands in _unmapped (never silently binned — §9).
// ---------------------------------------------------------------------------
const PAGE_OVERRIDE = { 'memory-fund-positioning': 'positioning-unwind', 'memory-policy-risk': 'policy-loosening' };
const SECTION_DEFAULT = { 'AI-trade / macro': 'capex-rollover', 'NVIDIA': 'ai-trade-contagion' };
const RULES = [
  [/FMS|crowd|13F|short.interest|days.to.cover|front-month put|insider|redemption|RAM 2|NAV premium|Sell downgrade|PT (stampede|cuts)/i, 'positioning-unwind'],
  [/MATCH Act|Entity List|BIS\b|EUV|CHIPS|Section 232|export.control|tariff|d[ée]tente|STAR IPO|grant→equity|Taylor restart/i, 'policy-loosening'],
  [/share of DRAM wafer|wafer input|wafer-share vs bit-share|capital intensity|glut band|breaking discipline|capex\/revenue|HBM4(\/4E)? (share|yield|qualification)|allocation tier|share (defense|trajectory)|durable HBM share|3-to-1/i, 'oligopoly-discipline'],
  [/2027|air.pocket|wafer step|cycle clock|30.month|greenfield|roofline|affordab|commodity.bit|net commodity|unit decline|units deepen/i, 'air-pocket-2027'],
  [/CXMT|400k|domestic HBM|OEM (DDR5 )?(qual|design-in)/i, 'cxmt-supply'],
  [/KV.cache|compression|memory.per.token|edge.?\/|on.device|bit.demand|content.per.chip/i, 'memory-per-token'],
  [/detour|CXL|HBF|PIM\b|SRAM|Apple.sparse|NAND substitution/i, 'eng-detours'],
  [/capex.to.OCF|outrun.*OCF|bond|debt issuance|private.credit|neocloud|negative FCF|capex guid|guiding capex|hyperscaler capex|capex cut|RPO|CoWoS/i, 'capex-rollover'],
  [/non.CUDA|\$\/rack|NVLink|optical supernode|accelerator share|Gross margin \+/i, 'ai-trade-contagion'],
  [/ASP|contract.*(pric|sequence)|inventory|spot|price spread|margin spread|GM decel|decelerating rates|HBM4 mix|LTA|take.or.pay|prepayment|SCAs|SOCAMM|RDIMM|demand-coverage/i, 'price-cycle'],
  [/tail|sleeve|holdings|swap|counterparty|tracking vs NAV|expense|basket/i, 'etf-tail-sleeve'],
  [/forward P\/E|multiple|EPS revision|re-rat|valuation/i, 'valuation-rerating'],
];

function mapItem(it) {
  if (it.page && PAGE_OVERRIDE[it.page]) return PAGE_OVERRIDE[it.page];
  const text = `${it.signal} ${it.trip}`;
  for (const [re, id] of RULES) if (re.test(text)) return id;
  if (it.section) for (const [prefix, id] of Object.entries(SECTION_DEFAULT)) if (it.section.startsWith(prefix)) return id;
  return null;
}

// A raw inline marker becomes a table row: short Signal label + the condition as the
// tripwire. Split on the first natural break; these files are human-owned — labels are
// a starting point for Anthony's edit, not a final taxonomy.
function splitMarker(text) {
  let t = text.trim().replace(/\.\s*$/, '');
  t = t.charAt(0).toUpperCase() + t.slice(1);
  const brk = t.slice(0, 64).match(/ — |: | \(/);
  if (brk) {
    const at = brk.index;
    const rest = t.slice(at + (brk[0] === ' (' ? 1 : brk[0].length)).trim();
    return { signal: t.slice(0, at).trim(), trip: rest };
  }
  if (t.length <= 62) return { signal: t, trip: '—' };
  const head = t.slice(0, 34).replace(/\s+\S*$/, '');
  return { signal: head + '…', trip: t };
}

// ---------------------------------------------------------------------------
// Compose: canonical rows absorb duplicates; the rest append as extra rows.
// ---------------------------------------------------------------------------
function compose() {
  const items = [...extractFromMonitors(), ...extractFromPages()];
  const byRisk = Object.fromEntries(RISKS.map((r) => [r.id, { canonical: r.tripwires.map((t) => ({ ...t, provenance: [] })), extra: [] }]));
  const unmapped = [], merges = [];
  for (const it of items) {
    const riskId = mapItem(it);
    if (!riskId) { unmapped.push(it); continue; }
    const bucket = byRisk[riskId];
    const row = bucket.canonical.find((c) => (c.absorb || []).some((re) => re.test(`${it.signal} ${it.trip}`)));
    if (row) { row.provenance.push(it.src); merges.push({ into: `${riskId} / ${row.signal}`, from: it.src, text: it.signal.slice(0, 100) }); }
    else {
      // page markers repeat across pages (e.g. the hyperscaler-capex tripwire) — exact-dupe fold
      const key = it.signal.toLowerCase().replace(/[^a-z0-9]+/g, ' ').slice(0, 80);
      const dupe = bucket.extra.find((e) => e.key === key);
      if (dupe) { dupe.provenance.push(it.src); merges.push({ into: `${riskId} / ${dupe.signal.slice(0, 60)}…`, from: it.src, text: '(exact dupe)' }); }
      else {
        const { signal, trip } = splitMarker(it.signal);
        bucket.extra.push({ key, signal, trip, state: '—', asOf: it.asOf || TODAY, provenance: [it.src] });
      }
    }
  }
  return { byRisk, unmapped, merges, total: items.length };
}

// ---------------------------------------------------------------------------
// Emit
// ---------------------------------------------------------------------------
const fmList = (a) => `[${a.join(', ')}]`;

function riskFileText(r, rows) {
  const trip = [...rows.canonical, ...rows.extra];
  const tripLines = trip.map((t) => {
    const srcNote = t.provenance?.length ? '' : ''; // provenance lives in the report + the note line below
    return `| ${t.signal} | ${t.trip || '—'} | ${t.state || '—'} | ${t.asOf || '—'} |${srcNote}`;
  });
  const provPages = [...new Set(trip.flatMap((t) => t.provenance || []))].filter((p) => !p.startsWith('monitors.md'));
  const hist = r.history.map(([d, k, txt]) => `- ${d} — [${k}] ${txt}`);
  return `---
type: risk
id: ${r.id}
name: "${r.name}"
status: ${r.status}
grade: ${/^[ABC]$/.test(r.grade) ? r.grade : `"${r.grade}"`}
order: ${r.order}
houseview: "${r.houseview.replace(/"/g, '\\"')}"
hv: ${r.hv}${r.hvChip ? `\nhvlabel: "${r.hvChip}"` : ''}
summary: "${r.summary}"
category: ${r.category}
series: ${fmList(r.series)}
pages: ${fmList(r.pages)}
updated: ${r.history[0][0]}
---
${r.prose}

## Tripwires
| Signal | Tripwire → | State | As-of |
|---|---|---|---|
${tripLines.join('\n')}

*Nested by the ${TODAY} migration from [[monitors]]${provPages.length ? ' + ' + provPages.map((p) => p.split('/').pop()).filter((v, i, a) => a.indexOf(v) === i).map((s) => `[[${s}]]`).join(' · ') : ''}. Rows are yours to edit — sync never writes this file.*

## History
${hist.join('\n')}

## Research
Anchors: ${r.pages.map((p) => `[[${p}]]`).join(' · ')}

*(free-form from here down — renders as the research body on the risk page)*
`;
}

const REGISTRY_ROWS = [
  ['dram-spot-ddr5', 'DRAM spot — DDR5 16Gb', 'USD', 'TrendForce (accrues daily)', 'price-cycle', 'line'],
  ['dram-spot-ddr4', 'DRAM spot — DDR4 16Gb', 'USD', 'TrendForce (accrues daily)', 'price-cycle', 'line'],
  ['semi-import-price', 'Semiconductor import price — IZ3344', 'index', 'FRED', 'price-cycle', 'line'],
  ['micron-capex', 'Micron capex — quarterly', '$M', 'SEC EDGAR', 'capex-rollover', 'line'],
  ['ai-capex', 'Hyperscaler AI capex — Σ4 quarterly', '$M', 'SEC EDGAR (MSFT+GOOGL+AMZN+META)', 'capex-rollover', 'line'],
  ['mu-pe', 'MU — trailing P/E (crude TTM)', '×', 'Nasdaq close ÷ EDGAR TTM diluted EPS', 'valuation-rerating', 'line'],
  ['price-mu', 'Micron — MU', 'USD', 'Nasdaq (Yahoo fallback)', 'valuation-rerating', 'line'],
  ['price-dram-etf', 'Roundhill DRAM ETF ★', 'USD', 'Nasdaq (Yahoo fallback)', 'etf-tail-sleeve', 'line'],
  ['price-sk-hynix', 'SK Hynix — KRX 000660', 'KRW', 'Naver (Yahoo fallback)', '—', 'line'],
  ['price-samsung', 'Samsung — KRX 005930', 'KRW', 'Naver (Yahoo fallback)', '—', 'line'],
  ['retail-flow-hynix', 'SK Hynix — retail net-buy (개인)', 'KRW-B', 'Naver investor trend ⚠ verify §12', 'positioning-unwind', 'flow'],
  ['retail-flow-samsung', 'Samsung — retail net-buy (개인)', 'KRW-B', 'Naver investor trend ⚠ verify §12', 'positioning-unwind', 'flow'],
  ['lev-etf-flow', 'KODEX Leverage 122630 — retail net-buy', 'KRW-B', 'Naver investor trend ⚠ verify §12', 'positioning-unwind', 'flow'],
  ['korea-chip-exports', 'Korea chip exports — HS 8542', '$k', 'data.go.kr (needs Korean-phone key) — fetcher parked', '—', 'parked'],
];

function registryText() {
  return `---
type: series-registry
updated: ${TODAY}
note: "Parsed by BOTH cockpit/sync.js and the site (replaces the v1 hardcoded registry). kind: line | flow (zero-centered baseline) | parked. risk = primary §-ref; risks list their full series set in their own frontmatter."
---

# Series registry

| id | label | unit | source | risk | kind |
|---|---|---|---|---|---|
${REGISTRY_ROWS.map((r) => `| ${r.join(' | ')} |`).join('\n')}
`;
}

const DESKS = [
  {
    id: 'korea', name: '⊞ Korea', order: 1,
    series: ['price-sk-hynix', 'price-samsung', 'retail-flow-hynix', 'retail-flow-samsung', 'lev-etf-flow', 'korea-chip-exports'],
    topics: ['korea', 'sk-hynix', 'samsung', 'krx', 'kospi', 'kodex'],
    pages: ['sk-hynix', 'samsung-electronics', 'memory-fund-positioning', 'memory-oligopoly'],
    entities: ['sk-hynix', 'samsung-electronics'],
    intro: `**The oligopoly's home market.** Hynix sets HBM price, Samsung is the swing supplier, and Korean retail is the froth gauge. KRX trades while you sleep — this is the morning read after Overview.`,
  },
  {
    id: 'ai-demand', name: '✦ AI demand', order: 2,
    series: ['ai-capex', 'mu-pe'],
    topics: ['nvidia', 'hyperscaler', 'capex', 'openai', 'anthropic', 'deepseek', 'datacenter'],
    pages: ['ai-capex-memory-flowthrough', 'token-cost-equals-memory-cost', 'memory-deficit-horizon-2030', 'deepseek-v4-nonnvidia-2026', 'three-adaptive-responses', 'robotics-memory-vector'],
    entities: ['nvidia', 'tsmc', 'trainium', 'google-tpu'],
    intro: `**The hinge and the kill-switch, on one desk.** The thesis stands on rising HBM/DRAM content per AI chip — this desk watches the demand engine that pays for it (hyperscaler capex, §3.5) and the efficiency lever that could bend it (memory-per-token, §3.4). When these two argue, the register moves.`,
  },
  {
    id: 'supply-hbm', name: '▦ Supply & HBM', order: 3,
    series: ['dram-spot-ddr5', 'dram-spot-ddr4', 'micron-capex', 'semi-import-price'],
    topics: ['hbm', 'dram', 'ddr5', 'ddr4', 'cxmt', 'spot', 'wafer', 'micron'],
    pages: ['wafer-trade-off-3-to-1', 'hbm', 'ddr5', 'cxmt', 'memory-microeconomics', 'nand-substitution-deepdive-2026', 'memory-tax-detour-tracks'],
    entities: ['micron', 'sk-hynix', 'samsung-electronics', 'cxmt'],
    intro: `**The physical mechanism.** Every HBM wafer starves ~3 commodity wafers — the 3-to-1 trade-off is why the shortage broadens instead of self-correcting. This desk watches the spot tape it produces, the capex that could reverse it, and the fourth entrant (CXMT) pressing on the commodity flank.`,
  },
  {
    id: 'scenarios', name: '⌘ Scenarios', order: 4, tells: true,
    series: [],
    topics: [],
    pages: ['memory-scenario-tree', 'memory-scenario-desk-2026-07'],
    entities: [],
    intro: `**The war room.** The probability-weighted branch map (Base 38% · Melt-Up 21% · Eff-Roll 22% · Bust 15% on a ~90% stem) and the ⭐ master tells that move mass between branches. No series here — this desk is where the register's individual signals become one picture.`,
  },
];

function deskFileText(d) {
  return `---
type: desk
id: ${d.id}
name: "${d.name}"
order: ${d.order}${d.tells ? '\ntells: true' : ''}
series: ${fmList(d.series)}
topics: ${fmList(d.topics)}
pages: ${fmList(d.pages)}
entities: ${fmList(d.entities)}
updated: ${TODAY}
---
${d.intro}
`;
}

// ---------------------------------------------------------------------------
// Safety rails + write path
// ---------------------------------------------------------------------------
function assertSafe(abs) {
  const real = path.resolve(abs);
  if (!real.startsWith(path.resolve(COCKPIT) + path.sep)) throw new Error(`REFUSED: write outside cockpit/: ${real}`);
  if (path.basename(real) === 'house-view.md') throw new Error('REFUSED: house-view.md is never written, by anything, ever.');
  return real;
}
function atomicWrite(abs, text) {
  const real = assertSafe(abs);
  fs.mkdirSync(path.dirname(real), { recursive: true });
  const tmp = real + '.tmp-migrate';
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, real);
}
function backupCockpit() {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const dest = path.join(os.homedir(), 'Trading', 'vault-backups', `cp1-${stamp}`, 'cockpit');
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.cpSync(COCKPIT, dest, { recursive: true });
  return dest;
}

// ---------------------------------------------------------------------------
// Run
// ---------------------------------------------------------------------------
const hvMtimeBefore = fs.statSync(path.join(VAULT, 'house-view.md')).mtimeMs;
const { byRisk, unmapped, merges, total } = compose();

const files = [];
for (const r of RISKS) files.push({ rel: `cockpit/risks/${r.id}.md`, text: riskFileText(r, byRisk[r.id]) });
files.push({ rel: 'cockpit/series/_registry.md', text: registryText() });
for (const d of DESKS) files.push({ rel: `cockpit/desks/${d.id}.md`, text: deskFileText(d) });

// ---- report ----
const P = (s) => process.stdout.write(s + '\n');
P(`\n━━━ MIGRATION ${WRITE ? '— WRITE MODE' : 'DRY-RUN (nothing written)'} ━━━`);
P(`vault: ${VAULT}`);
P(`extracted monitors: ${total} (monitors.md §Memory/DRAM + §AI-trade/macro + §NVIDIA + inline markers on #memory pages, figures/ excluded)`);
P(`master tells: №1→price-cycle ⭐ · №2→memory-per-token ⭐ · №3→capex-rollover ⭐ encoded as starred rows; №4 (STMicro) + №5 (Trn3) off-spine per §6.`);

P(`\n── planned files (${files.length}) ──`);
for (const f of files) P(`  ${f.rel}  (${f.text.length}b)`);

P(`\n── risk register as migrated ──`);
for (const r of RISKS) {
  const rows = byRisk[r.id];
  const n = rows.canonical.length + rows.extra.length;
  P(`  §3.${r.order}  ${r.id.padEnd(20)} ${r.status.padEnd(6)} ${String(r.grade).padEnd(10)} ${r.hv ? 'HV ' : '   '} ${String(n).padStart(2)} tripwires (${rows.canonical.length} canonical + ${rows.extra.length} nested)`);
}

P(`\n── houseview: anchors (every §6 risk ↔ the house-view line it guards) ──`);
for (const r of RISKS) P(`  ${r.id.padEnd(20)} ${r.houseview.slice(0, 95)}${r.houseview.length > 95 ? '…' : ''}`);

P(`\n── merges (extracted → canonical row) — ${merges.length} ──`);
for (const m of merges) P(`  ${m.from.padEnd(38)} → ${m.into}`);

P(`\n── _unmapped (${unmapped.length}) — needs Anthony, never silently binned ──`);
for (const u of unmapped) P(`  [${u.src}] ${u.signal.slice(0, 110)}`);

P(`\n── full example: cockpit/risks/${EXAMPLE_ID}.md ──`);
P(files.find((f) => f.rel.endsWith(`${EXAMPLE_ID}.md`)).text);

if (WRITE) {
  const bak = backupCockpit();
  P(`backup: ${bak}`);
  for (const f of files) atomicWrite(path.join(VAULT, f.rel), f.text);
  P(`wrote ${files.length} files under cockpit/.`);
  const unm = unmapped.map((u) => `- [${u.src}] ${u.signal}`).join('\n');
  atomicWrite(path.join(COCKPIT, '_unmapped.md'), `# Unmapped monitors (${TODAY} migration)\n\n${unm || '*(none — every extracted monitor mapped)*'}\n`);
} else {
  P(`── dry-run: no files written, no backup made ──`);
}
const hvAfter = fs.statSync(path.join(VAULT, 'house-view.md')).mtimeMs;
P(`house-view.md mtime unchanged: ${hvAfter === hvMtimeBefore}`);
