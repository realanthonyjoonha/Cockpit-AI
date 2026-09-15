// filingMapCloseout.js — complete filing_map delta → pending house/risk proposals.
// Factory-wide (any thin desk / public ticker). Never ACCEPT. Never pack SoR.
// Decision-support only.
import fs from 'fs';
import path from 'path';
import { houseHitTrips, riskTest } from '../src/pages/thin/filingMapPaint.js';
import { readHouseMarkdown } from './thinHouseSave.js';
import { proposeHouse, listHouseProposals } from './houseProposals.js';
import {
  proposeRiskStatus,
  proposeAddRisk,
  readSorStatusMap,
  listRiskProposals,
} from './riskProposals.js';
import { getResearchRun } from './thinResearchRuns.js';

const STATUSES = new Set(['INTACT', 'WATCH', 'FIRED']);

function str(v) {
  return v == null ? '' : String(v).trim();
}

function riskRNum(hit) {
  const name = str(hit?.name);
  const mName = name.match(/^R(\d+)/i);
  if (mName) return mName[1];
  const id = str(hit?.id);
  const mId = id.match(/(?:^|-)r(\d+)(?:-|$)/i);
  if (mId) return mId[1];
  return null;
}

function sorStatusForHit(sorMap, hit) {
  if (!sorMap) return null;
  const rn = riskRNum(hit);
  if (rn && sorMap[`R${rn}`]?.status) return sorMap[`R${rn}`].status;
  const name = str(hit?.name);
  if (name && sorMap[name]?.status) return sorMap[name].status;
  if (name && sorMap[name.toLowerCase()]?.status) return sorMap[name.toLowerCase()].status;
  return null;
}

function normTitle(s) {
  return str(s).replace(/^R\d+\s*[—–-]\s*/i, '').toLowerCase();
}

/**
 * Pure plan: what would be proposed from a published delta.
 * @param {object} delta
 * @param {{ sorMap?: object, runId?: string }} [opts]
 */
export function planFilingMapCloseout(delta, opts = {}) {
  const rows = Array.isArray(delta?.rows) ? delta.rows : [];
  const sorMap = opts.sorMap || {};
  const house = [];
  const riskStatus = [];
  const addRisk = [];
  const skipped = [];
  const seenRisk = new Set();
  const seenAdd = new Set();

  for (const row of rows) {
    const accession = str(row?.accession) || null;
    const form = str(row?.form) || null;
    const filed = str(row?.filed) || null;

    for (const h of Array.isArray(row?.house_hits) ? row.house_hits : []) {
      if (!houseHitTrips(h)) {
        skipped.push({
          kind: 'house_quiet',
          accession,
          trigger: str(h?.trigger).slice(0, 120),
          reason: 'does not trip',
        });
        continue;
      }
      house.push({
        kind: 'house_trip',
        accession,
        form,
        filed,
        trigger: str(h?.trigger),
        note: str(h?.note),
      });
    }

    for (const r of Array.isArray(row?.risk_hits) ? row.risk_hits : []) {
      const to = riskTest(r);
      if (!STATUSES.has(to)) {
        skipped.push({
          kind: 'risk_skip',
          accession,
          risk_name: str(r?.name || r?.id),
          reason: `test not actionable (${to || 'empty'})`,
        });
        continue;
      }
      const current = sorStatusForHit(sorMap, r);
      if (current && current === to) {
        skipped.push({
          kind: 'risk_unchanged',
          accession,
          risk_name: str(r?.name || r?.id),
          reason: `SoR already ${to}`,
        });
        continue;
      }
      const key = `${riskRNum(r) || str(r?.id || r?.name).toLowerCase()}|${to}`;
      if (seenRisk.has(key)) {
        skipped.push({
          kind: 'risk_dup',
          accession,
          risk_name: str(r?.name || r?.id),
          reason: 'duplicate suggested status in this map',
        });
        continue;
      }
      seenRisk.add(key);
      riskStatus.push({
        kind: 'risk_status',
        accession,
        form,
        filed,
        risk_id: str(r?.id) || null,
        risk_name: str(r?.name) || null,
        from_status: current,
        to_status: to,
        tripwire: str(r?.tripwire),
        note: str(r?.note),
      });
    }

    for (const c of Array.isArray(row?.add_risk_candidates) ? row.add_risk_candidates : []) {
      const title = str(c?.name || c?.title);
      if (!title) {
        skipped.push({ kind: 'add_risk_skip', accession, reason: 'missing title' });
        continue;
      }
      const key = normTitle(title);
      if (seenAdd.has(key)) {
        skipped.push({ kind: 'add_risk_dup', accession, title, reason: 'duplicate title in this map' });
        continue;
      }
      seenAdd.add(key);
      addRisk.push({
        kind: 'add_risk',
        accession,
        form,
        filed,
        title,
        note: str(c?.note),
        grade: str(c?.grade || 'B').toUpperCase() || 'B',
        status: 'WATCH',
      });
    }
  }

  return {
    ok: true,
    run_id: opts.runId || null,
    counts: {
      house: house.length,
      risk_status: riskStatus.length,
      add_risk: addRisk.length,
      skipped: skipped.length,
      actionable: house.length + riskStatus.length + addRisk.length,
    },
    house,
    risk_status: riskStatus,
    add_risk: addRisk,
    skipped,
    decision_support_only: true,
  };
}

function buildHouseCloseoutMarkdown(currentMd, houseHits, runId) {
  const asOf = new Date().toISOString().slice(0, 10);
  const lines = [
    '',
    `## Filing map closeout (${asOf})`,
    '',
    `Ops note from filing_map \`${runId}\`. Glass ACCEPT applies. Decision-support only — not a rating.`,
    '',
  ];
  for (const h of houseHits) {
    lines.push(`- **Trigger:** ${h.trigger || 'House trigger'}`);
    if (h.accession) lines.push(`  - Accession: \`${h.accession}\``);
    if (h.form || h.filed) {
      lines.push(`  - Filing: ${[h.form, h.filed].filter(Boolean).join(' · ')}`);
    }
    if (h.note) lines.push(`  - ${h.note}`);
    lines.push('');
  }
  return `${String(currentMd || '').trimEnd()}\n${lines.join('\n')}`;
}

function pendingRiskKeys(slug) {
  try {
    const list = listRiskProposals(slug, { status: 'pending' });
    const keys = new Set();
    for (const p of list.proposals || []) {
      if (p.kind === 'status_change') {
        keys.add(`status|${str(p.risk_name).toLowerCase()}|${str(p.to_status).toUpperCase()}`);
      }
      if (p.kind === 'add_risk') {
        keys.add(`add|${normTitle(p.title || p.risk_name || p.name)}`);
      }
    }
    return keys;
  } catch {
    return new Set();
  }
}

function pendingHouseFromRun(slug, runId) {
  try {
    const list = listHouseProposals(slug, { status: 'pending' });
    return (list.proposals || []).some((p) => {
      const src = str(p.source);
      return src.includes('filing_map') && src.includes(runId);
    });
  } catch {
    return false;
  }
}

/**
 * @param {{
 *   slug: string,
 *   ticker: string,
 *   houseFile: string,
 *   risksSourceRel: string,
 *   runId: string,
 *   dryRun?: boolean,
 *   desk?: string,
 * }} opts
 */
export function proposeFromFilingMap(opts) {
  const slug = str(opts.slug).toLowerCase();
  const ticker = str(opts.ticker).toUpperCase();
  const houseFile = str(opts.houseFile);
  const risksSourceRel = str(opts.risksSourceRel);
  const runId = str(opts.runId);
  const dryRun = opts.dryRun === true;

  if (!slug || !ticker || !runId) {
    return { ok: false, error: 'slug, ticker, runId required', decision_support_only: true };
  }
  if (!houseFile || !risksSourceRel) {
    return { ok: false, error: 'desk profile missing houseFile/risksSource', decision_support_only: true };
  }

  const run = getResearchRun(ticker, runId, { desk: opts.desk || slug });
  if (!run?.available) {
    return { ok: false, error: run?.reason || 'run not found', decision_support_only: true };
  }
  if (run.job !== 'filing_map') {
    return { ok: false, error: `run job is ${run.job}, not filing_map`, decision_support_only: true };
  }
  if (run.status !== 'complete') {
    return { ok: false, error: `run status is ${run.status}, need complete`, decision_support_only: true };
  }
  const delta = run.delta;
  if (!delta || typeof delta !== 'object') {
    return { ok: false, error: 'complete filing_map missing delta.json', decision_support_only: true };
  }

  let sorMap = {};
  try {
    sorMap = readSorStatusMap(risksSourceRel);
  } catch (e) {
    return {
      ok: false,
      error: `risks SoR unreadable: ${e.message || e}`,
      decision_support_only: true,
    };
  }

  const plan = planFilingMapCloseout(delta, { sorMap, runId });
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      run_id: runId,
      slug,
      ticker,
      ...plan,
      note: 'Dry run only — vault not written. Confirm to create pending proposals.',
      next_steps: [
        `POST /api/${slug}/research/runs/${runId}/propose-from-map`,
        `Review #/${slug}/house and #/${slug}/risks → ACCEPT`,
        'COMPILE BOOK → REFRESH',
      ],
    };
  }

  if (plan.counts.actionable === 0) {
    // Quiet maps still get a closeout crumb so glance / Filings stop flashing CLOSEOUT.
    try {
      if (run.path && fs.existsSync(run.path)) {
        const crumb = {
          schema_version: 1,
          run_id: runId,
          created_at: new Date().toISOString(),
          created: [],
          errors: [],
          quiet: true,
          counts: { ...plan.counts, created: 0, errors: 0 },
          decision_support_only: true,
        };
        fs.writeFileSync(path.join(run.path, 'closeout.json'), JSON.stringify(crumb, null, 2), 'utf8');
        const metaPath = path.join(run.path, 'meta.json');
        if (fs.existsSync(metaPath)) {
          const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
          meta.promotion = {
            ...(meta.promotion && typeof meta.promotion === 'object' ? meta.promotion : {}),
            status: 'quiet',
            pack_claims: false,
            risks_proposed: false,
            house_proposed: false,
            model_pack_layers: false,
            notes: 'Map closeout · nothing actionable',
          };
          fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
        }
      }
    } catch { /* ops crumb optional */ }
    return {
      ok: true,
      dry_run: false,
      run_id: runId,
      slug,
      ticker,
      created: [],
      ...plan,
      note: 'No actionable trips / status deltas / add-risk candidates in this map.',
      decision_support_only: true,
    };
  }

  const created = [];
  const errors = [];
  const pendingRisk = pendingRiskKeys(slug);
  const sourceTag = `filing_map:${runId}`;

  if (plan.house.length) {
    if (pendingHouseFromRun(slug, runId)) {
      plan.skipped.push({
        kind: 'house_pending',
        reason: 'pending house proposal already cites this run',
      });
    } else {
      try {
        const raw = readHouseMarkdown(houseFile);
        if (!raw.exists || !raw.markdown) {
          throw new Error(`vault house missing: ${houseFile}`);
        }
        const markdown = buildHouseCloseoutMarkdown(raw.markdown, plan.house, runId);
        const out = proposeHouse({
          slug,
          ticker,
          houseFile,
          markdown,
          rationale: `Filing map closeout (${plan.house.length} tripped house hit(s)) from run ${runId}.`,
          summary: `Filing map · ${plan.house.length} house trip(s)`,
          source: sourceTag,
        });
        created.push({
          kind: 'house_view',
          id: out.proposal?.id,
          summary: out.proposal?.summary,
        });
      } catch (e) {
        errors.push({ kind: 'house_view', error: e.message || String(e) });
      }
    }
  }

  for (const r of plan.risk_status) {
    const pkey = `status|${str(r.risk_name).toLowerCase()}|${r.to_status}`;
    if (pendingRisk.has(pkey)) {
      plan.skipped.push({
        kind: 'risk_pending',
        risk_name: r.risk_name,
        reason: 'matching pending status proposal exists',
      });
      continue;
    }
    try {
      const out = proposeRiskStatus({
        slug,
        ticker,
        risksSourceRel,
        body: {
          risk_id: r.risk_id,
          risk_name: r.risk_name,
          from_status: r.from_status,
          to_status: r.to_status,
          rationale: [
            `Filing map ${runId}`,
            r.accession ? `accession ${r.accession}` : null,
            r.tripwire ? `tripwire: ${r.tripwire}` : null,
            r.note || null,
          ].filter(Boolean).join(' · ').slice(0, 4000),
          source: sourceTag,
        },
      });
      created.push({
        kind: 'status_change',
        id: out.proposal?.id,
        risk_name: out.proposal?.risk_name,
        to_status: out.proposal?.to_status,
      });
      pendingRisk.add(pkey);
    } catch (e) {
      errors.push({ kind: 'status_change', risk_name: r.risk_name, error: e.message || String(e) });
    }
  }

  for (const a of plan.add_risk) {
    const pkey = `add|${normTitle(a.title)}`;
    if (pendingRisk.has(pkey)) {
      plan.skipped.push({
        kind: 'add_risk_pending',
        title: a.title,
        reason: 'matching pending add_risk exists',
      });
      continue;
    }
    const grade = STATUSES.has(a.grade) ? 'B' : (['A', 'B', 'C'].includes(a.grade) ? a.grade : 'B');
    try {
      const out = proposeAddRisk({
        slug,
        ticker,
        risksSourceRel,
        body: {
          title: a.title,
          status: 'WATCH',
          grade,
          summary: (a.note || a.title).slice(0, 400),
          mechanism: (a.note || a.title).slice(0, 800),
          rationale: [
            `Filing map ${runId}`,
            a.accession ? `accession ${a.accession}` : null,
          ].filter(Boolean).join(' · '),
          source: sourceTag,
          tripwires: [
            { signal: 'Filing follow-up', tripwire: 'Confirm in next primary print', state: 'GAP', as_of: '—' },
          ],
        },
      });
      created.push({
        kind: 'add_risk',
        id: out.proposal?.id,
        title: a.title,
      });
      pendingRisk.add(pkey);
    } catch (e) {
      errors.push({ kind: 'add_risk', title: a.title, error: e.message || String(e) });
    }
  }

  // Best-effort audit crumb on the run (ops only).
  try {
    if (run.path && fs.existsSync(run.path)) {
      const crumb = {
        schema_version: 1,
        run_id: runId,
        created_at: new Date().toISOString(),
        created,
        errors,
        counts: {
          ...plan.counts,
          created: created.length,
          errors: errors.length,
        },
        decision_support_only: true,
      };
      fs.writeFileSync(path.join(run.path, 'closeout.json'), JSON.stringify(crumb, null, 2), 'utf8');
    }
  } catch { /* ops crumb optional */ }

  // Mark promotion on meta when anything was created.
  if (created.length && run.path) {
    try {
      const metaPath = path.join(run.path, 'meta.json');
      if (fs.existsSync(metaPath)) {
        const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        const prev = meta.promotion && typeof meta.promotion === 'object' ? meta.promotion : {};
        meta.promotion = {
          status: 'pending_accept',
          pack_claims: false,
          risks_proposed: !!(prev.risks_proposed || created.some((c) => c.kind === 'status_change' || c.kind === 'add_risk')),
          house_proposed: !!(prev.house_proposed || created.some((c) => c.kind === 'house_view')),
          model_pack_layers: false,
          notes: created.map((c) => c.id).filter(Boolean).join(' ').slice(0, 400),
        };
        fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
      }
    } catch { /* */ }
  }

  return {
    ok: errors.length === 0,
    dry_run: false,
    run_id: runId,
    slug,
    ticker,
    created,
    errors,
    counts: {
      ...plan.counts,
      created: created.length,
      errors: errors.length,
    },
    house: plan.house,
    risk_status: plan.risk_status,
    add_risk: plan.add_risk,
    skipped: plan.skipped,
    note: created.length
      ? 'Pending proposals stored. House/risks NOT written until glass ACCEPT. Then COMPILE BOOK.'
      : (errors.length ? 'Propose failed for one or more candidates.' : 'Nothing created.'),
    next_steps: [
      `Open #/${slug}/house and #/${slug}/risks`,
      'ACCEPT or REJECT each proposal',
      'COMPILE BOOK → REFRESH',
    ],
    decision_support_only: true,
  };
}
