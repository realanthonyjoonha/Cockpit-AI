// researchRunCloseout.js — deep_compile / thesis_report → pending proposals.
// Factory-wide. Never ACCEPT. Never pack SoR. Decision-support only.
import fs from 'fs';
import path from 'path';
import { readHouseMarkdown } from './thinHouseSave.js';
import { proposeHouse, listHouseProposals } from './houseProposals.js';
import { houseProposeRefuseReason } from './houseStance.js';
import {
  proposeRiskStatus,
  proposeAddRisk,
  readSorStatusMap,
  listRiskProposals,
} from './riskProposals.js';
import { getResearchRun } from './thinResearchRuns.js';
import { isThesisReportJob, COMPILE_JOBS } from './researchRunsSchema.js';

const STATUSES = new Set(['INTACT', 'WATCH', 'FIRED']);

function isCompileLaneJob(job) {
  return COMPILE_JOBS.has(String(job || ''));
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

function normTitle(s) {
  return str(s).replace(/^R\d+\s*[—–-]\s*/i, '').toLowerCase();
}

function riskRNumFromText(text) {
  const m = str(text).match(/\bR(\d{1,3})\b/i);
  return m ? m[1] : null;
}

function suggestedStatus(text) {
  const t = str(text);
  if (/\bFIRED\b/i.test(t) && /\b(to|→|->|status)\b/i.test(t)) return 'FIRED';
  if (/\bpropose\b.*\bFIRED\b/i.test(t) || /\bstatus\s*[:=]\s*FIRED\b/i.test(t)) return 'FIRED';
  if (/\bWATCH\b/i.test(t) && /\b(to|→|->|status|keep|remains)\b/i.test(t)) return 'WATCH';
  if (/\bINTACT\b/i.test(t) && /\b(to|→|->|status|keep|remains)\b/i.test(t)) return 'INTACT';
  // Explicit "→ FIRED" style
  const arrow = t.match(/(?:→|->|to)\s*(INTACT|WATCH|FIRED)\b/i);
  if (arrow) return arrow[1].toUpperCase();
  return null;
}

function isAddCandidate(text) {
  const t = str(text);
  return /\bcandidate\b/i.test(t) || /\badd[- ]?risk\b/i.test(t) || /\bnew risk\b/i.test(t);
}

function titleFromRiskText(text) {
  const t = str(text);
  const m = t.match(/\bR\d{1,3}\s*(?:candidate\s*:)?\s*[—–-]?\s*(.+)$/i)
    || t.match(/candidate:\s*(.+)$/i);
  let title = m ? m[1] : t;
  title = title.replace(/\s*[—–-].*$/, '').replace(/\s+/g, ' ').trim().slice(0, 120);
  // Drop leading "R1 candidate:" residue
  title = title.replace(/^R\d+\s*(candidate)?\s*:?\s*/i, '').trim();
  return title || t.slice(0, 80);
}

function sorStatusForR(sorMap, rNum, riskName) {
  if (!sorMap) return null;
  if (rNum && sorMap[`R${rNum}`]?.status) return sorMap[`R${rNum}`].status;
  if (riskName && sorMap[riskName]?.status) return sorMap[riskName].status;
  return null;
}

/**
 * @param {object} run — getResearchRun payload
 * @param {{ sorMap?: object, runId?: string }} [opts]
 */
export function planResearchRunCloseout(run, opts = {}) {
  const job = str(run?.job);
  const extracts = run?.extracts || {};
  const riskItems = Array.isArray(extracts.risks) ? extracts.risks : [];
  const narrative = Array.isArray(extracts.narrative) ? extracts.narrative : [];
  const sorMap = opts.sorMap || {};
  const house = [];
  const riskStatus = [];
  const addRisk = [];
  const skipped = [];
  const seenRisk = new Set();
  const seenAdd = new Set();

  for (const item of riskItems) {
    const text = str(item?.text || item?.summary);
    if (!text) {
      skipped.push({ kind: 'risk_empty', reason: 'empty extract' });
      continue;
    }
    const rNum = riskRNumFromText(text);
    const to = suggestedStatus(text);
    const add = isAddCandidate(text);

    if (to && rNum && !add) {
      const riskName = `R${rNum}`;
      const current = sorStatusForR(sorMap, rNum, riskName);
      if (current && current === to) {
        skipped.push({ kind: 'risk_unchanged', risk_name: riskName, reason: `SoR already ${to}` });
        continue;
      }
      const key = `${rNum}|${to}`;
      if (seenRisk.has(key)) {
        skipped.push({ kind: 'risk_dup', risk_name: riskName, reason: 'duplicate' });
        continue;
      }
      seenRisk.add(key);
      riskStatus.push({
        kind: 'risk_status',
        risk_id: null,
        risk_name: riskName,
        from_status: current,
        to_status: to,
        note: text.slice(0, 500),
        excerpt: str(item?.excerpt).slice(0, 400),
      });
      continue;
    }

    if (add) {
      const title = titleFromRiskText(text);
      const key = normTitle(title);
      if (seenAdd.has(key)) {
        skipped.push({ kind: 'add_risk_dup', title, reason: 'duplicate' });
        continue;
      }
      seenAdd.add(key);
      addRisk.push({
        kind: 'add_risk',
        title,
        note: text.slice(0, 800),
        grade: str(item?.grade || 'B').toUpperCase() || 'B',
        status: 'WATCH',
      });
      continue;
    }

    skipped.push({
      kind: 'risk_skip',
      reason: 'no status delta or add-risk signal',
      text: text.slice(0, 80),
    });
  }

  // Thesis / deep compile: optional house appendix from narrative (capped).
  // Thesis: house appendix from summary + top narrative. Compile lane: risks only.
  const wantHouse = isThesisReportJob(job);
  if (wantHouse) {
    const bits = [];
    const summary = str(run?.summary).slice(0, 600);
    if (summary) bits.push({ trigger: 'Run summary', note: summary });
    for (const n of narrative.slice(0, 3)) {
      const text = str(n?.text);
      if (!text) continue;
      bits.push({
        trigger: oneLineTrigger(text),
        note: text.slice(0, 500),
        excerpt: str(n?.excerpt).slice(0, 300),
      });
    }
    if (bits.length) {
      for (const b of bits) house.push({ kind: 'house_note', ...b });
    }
  }

  return {
    ok: true,
    run_id: opts.runId || run?.run_id || null,
    job,
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

function oneLineTrigger(text) {
  const t = str(text).replace(/\s+/g, ' ');
  if (t.length <= 88) return t;
  return `${t.slice(0, 85)}…`;
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
        keys.add(`add|${normTitle(p.title || p.risk_name || '')}`);
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
      return src.includes(runId);
    });
  } catch {
    return false;
  }
}

function buildHouseMarkdown(currentMd, houseHits, runId, job) {
  const asOf = new Date().toISOString().slice(0, 10);
  const lines = [
    '',
    `## Research run closeout (${asOf})`,
    '',
    `Ops note from \`${job}\` \`${runId}\`. Glass ACCEPT applies. Decision-support only.`,
    '',
  ];
  for (const h of houseHits) {
    lines.push(`- **${h.trigger || 'Note'}**`);
    if (h.note) lines.push(`  - ${h.note}`);
    if (h.excerpt) lines.push(`  - Excerpt: ${h.excerpt}`);
    lines.push('');
  }
  return `${String(currentMd || '').trimEnd()}\n${lines.join('\n')}`;
}

function patchPromotionMeta(runPath, patch) {
  if (!runPath || !fs.existsSync(runPath)) return;
  const metaPath = path.join(runPath, 'meta.json');
  if (!fs.existsSync(metaPath)) return;
  try {
    const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    const prev = meta.promotion && typeof meta.promotion === 'object' ? meta.promotion : {};
    meta.promotion = {
      status: patch.status || prev.status || 'pending_accept',
      pack_claims: false,
      risks_proposed: !!(prev.risks_proposed || patch.risks_proposed),
      house_proposed: !!(prev.house_proposed || patch.house_proposed),
      model_pack_layers: false,
      notes: str(patch.notes || prev.notes).slice(0, 400) || null,
    };
    fs.writeFileSync(metaPath, JSON.stringify(meta, null, 2), 'utf8');
  } catch { /* optional */ }
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
export function proposeFromResearchRun(opts) {
  const slug = str(opts.slug).toLowerCase();
  const ticker = str(opts.ticker).toUpperCase();
  const houseFile = str(opts.houseFile);
  const risksSourceRel = str(opts.risksSourceRel);
  const runId = str(opts.runId);
  const dryRun = opts.dryRun === true;

  if (!slug || !ticker || !runId) {
    return { ok: false, error: 'slug, ticker, runId required', decision_support_only: true };
  }

  const run = getResearchRun(ticker, runId, { desk: opts.desk || slug });
  if (!run?.available) {
    return { ok: false, error: run?.reason || 'run not found', decision_support_only: true };
  }
  const job = str(run.job);
  if (!isCompileLaneJob(job) && !isThesisReportJob(job)) {
    return {
      ok: false,
      error: `job ${job || '?'} not supported — use propose-from-map for filing_map`,
      decision_support_only: true,
    };
  }
  if (run.status !== 'complete') {
    return { ok: false, error: `run status is ${run.status}, need complete`, decision_support_only: true };
  }

  let sorMap = {};
  try {
    sorMap = readSorStatusMap(risksSourceRel);
  } catch (e) {
    return { ok: false, error: `risks SoR unreadable: ${e.message || e}`, decision_support_only: true };
  }

  const plan = planResearchRunCloseout(run, { sorMap, runId });
  if (dryRun) {
    return {
      ok: true,
      dry_run: true,
      run_id: runId,
      slug,
      ticker,
      job,
      ...plan,
      note: 'Dry run only — vault not written. Confirm to create pending proposals.',
      next_steps: [
        `POST /api/${slug}/research/runs/${runId}/propose-from-run`,
        `Review #/${slug}/house and #/${slug}/risks → ACCEPT`,
        'COMPILE BOOK → REFRESH',
      ],
    };
  }

  if (plan.counts.actionable === 0) {
    return {
      ok: true,
      dry_run: false,
      run_id: runId,
      slug,
      ticker,
      job,
      created: [],
      ...plan,
      note: 'No actionable extract signals for propose.',
      decision_support_only: true,
    };
  }

  const created = [];
  const errors = [];
  const pendingRisk = pendingRiskKeys(slug);
  const sourceTag = `${job}:${runId}`;

  if (plan.house.length) {
    if (pendingHouseFromRun(slug, runId)) {
      plan.skipped.push({ kind: 'house_pending', reason: 'pending house already cites this run' });
    } else {
      try {
        const raw = readHouseMarkdown(houseFile);
        if (!raw.exists || !raw.markdown) throw new Error(`vault house missing: ${houseFile}`);
        const markdown = buildHouseMarkdown(raw.markdown, plan.house, runId, job);
        const refuse = houseProposeRefuseReason(markdown);
        if (refuse) {
          plan.skipped.push({ kind: 'house_forming', reason: refuse });
        } else {
          const out = proposeHouse({
            slug,
            ticker,
            houseFile,
            markdown,
            rationale: `Research run closeout (${job}) ${runId}`,
            summary: `${job} · house notes`,
            source: sourceTag,
          });
          created.push({ kind: 'house_view', id: out.proposal?.id, summary: out.proposal?.summary });
        }
      } catch (e) {
        errors.push({ kind: 'house_view', error: e.message || String(e) });
      }
    }
  }

  for (const r of plan.risk_status) {
    const pkey = `status|${str(r.risk_name).toLowerCase()}|${r.to_status}`;
    if (pendingRisk.has(pkey)) {
      plan.skipped.push({ kind: 'risk_pending', risk_name: r.risk_name, reason: 'pending exists' });
      continue;
    }
    try {
      const out = proposeRiskStatus({
        slug,
        ticker,
        risksSourceRel,
        body: {
          risk_name: r.risk_name,
          from_status: r.from_status,
          to_status: r.to_status,
          rationale: [`${job} ${runId}`, r.note].filter(Boolean).join(' · ').slice(0, 4000),
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
      plan.skipped.push({ kind: 'add_risk_pending', title: a.title, reason: 'pending exists' });
      continue;
    }
    const grade = ['A', 'B', 'C'].includes(a.grade) ? a.grade : 'B';
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
          rationale: `${job} ${runId}`,
          source: sourceTag,
          tripwires: [
            { signal: 'Run follow-up', tripwire: 'Confirm in next primary print', state: 'GAP', as_of: '—' },
          ],
        },
      });
      created.push({ kind: 'add_risk', id: out.proposal?.id, title: a.title });
      pendingRisk.add(pkey);
    } catch (e) {
      errors.push({ kind: 'add_risk', title: a.title, error: e.message || String(e) });
    }
  }

  try {
    if (run.path && fs.existsSync(run.path)) {
      fs.writeFileSync(path.join(run.path, 'closeout.json'), JSON.stringify({
        schema_version: 1,
        run_id: runId,
        job,
        created_at: new Date().toISOString(),
        created,
        errors,
        counts: { ...plan.counts, created: created.length, errors: errors.length },
        decision_support_only: true,
      }, null, 2), 'utf8');
    }
  } catch { /* */ }

  if (created.length) {
    patchPromotionMeta(run.path, {
      status: 'pending_accept',
      house_proposed: created.some((c) => c.kind === 'house_view'),
      risks_proposed: created.some((c) => c.kind === 'status_change' || c.kind === 'add_risk'),
      notes: created.map((c) => c.id).filter(Boolean).join(' ').slice(0, 400),
    });
  }

  return {
    ok: errors.length === 0,
    dry_run: false,
    run_id: runId,
    slug,
    ticker,
    job,
    created,
    errors,
    counts: { ...plan.counts, created: created.length, errors: errors.length },
    house: plan.house,
    risk_status: plan.risk_status,
    add_risk: plan.add_risk,
    skipped: plan.skipped,
    note: created.length
      ? 'Pending proposals stored. ACCEPT on glass, then COMPILE BOOK.'
      : (errors.length ? 'Propose failed for one or more candidates.' : 'Nothing created.'),
    next_steps: [
      `Open #/${slug}/house and #/${slug}/risks`,
      'ACCEPT or REJECT',
      'COMPILE BOOK → REFRESH',
    ],
    decision_support_only: true,
  };
}

/** Pending proposal counts for glance (fail soft). */
export function pendingProposalGlance(slug) {
  const empty = { house_pending: 0, risk_pending: 0, pending_total: 0, sources: [] };
  try {
    const h = listHouseProposals(slug, { status: 'pending' });
    const r = listRiskProposals(slug, { status: 'pending' });
    const house_pending = Number(h.counts?.pending) || 0;
    const risk_pending = Number(r.counts?.pending) || 0;
    const sources = [];
    for (const p of h.proposals || []) {
      if (p.source) sources.push(String(p.source));
    }
    for (const p of r.proposals || []) {
      // listRiskProposals may not include source — ignore
    }
    return {
      house_pending,
      risk_pending,
      pending_total: house_pending + risk_pending,
      sources,
    };
  } catch {
    return empty;
  }
}
