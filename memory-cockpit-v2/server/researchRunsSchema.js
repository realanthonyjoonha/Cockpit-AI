// researchRunsSchema.js — format gate for desk Research run archives.
// Vault: research-wiki/cockpit/research/{TICKER}/runs/{run_id}/
// Decision-support only. Not pack / house / Street SoR until explicit promote.
import fs from 'fs';
import path from 'path';

export const RESEARCH_RUNS_SCHEMA_VERSION = 1;

export const RESEARCH_JOBS = new Set(['deep_compile', 'print_package', 'pack_refresh']);
export const RESEARCH_STATUSES = new Set([
  'queued', 'running', 'complete', 'failed', 'cancelled',
]);

const ADVICE_RE =
  /\b(buy|sell|short|long more|trim|add to|position size|how many shares|price target for you|should i (buy|sell)|fair value\s*\$|we recommend|you should (buy|sell)|house (buy|sell|pt))\b/i;

const PRIMARY_KINDS = new Set(['10-K', '10-Q', '8-K', '20-F', '6-K']);

export function normalizeHaystack(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

export function excerptHitsDoc(excerpt, doc) {
  const e = normalizeHaystack(excerpt);
  if (e.length < 12) return false;
  return normalizeHaystack(doc).includes(e);
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

function adviceHit(text) {
  return ADVICE_RE.test(text || '');
}

/**
 * @param {string} ticker
 * @param {string} job
 */
export function makeRunId(ticker, job = 'deep_compile') {
  const j = RESEARCH_JOBS.has(job) ? job : 'deep_compile';
  const stamp = new Date().toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const t = String(ticker || 'X').toUpperCase().replace(/[^A-Z0-9.-]/g, '').slice(0, 12);
  return `${stamp}_${j}_${t || 'X'}`.replace(/[^A-Za-z0-9._-]/g, '_').slice(0, 96);
}

/**
 * @param {unknown} row
 */
export function normalizeSourceItem(row) {
  if (!row || typeof row !== 'object') return null;
  const id = str(row.id) || null;
  const title = str(row.title || row.name);
  if (!id && !title) return null;
  return {
    id: id || `src_${Math.random().toString(36).slice(2, 8)}`,
    title: title || id,
    kind: str(row.kind) || null,
    as_of: str(row.as_of).slice(0, 32) || null,
    url: str(row.url) || null,
    accession: str(row.accession) || null,
    grade_hint: str(row.grade_hint || row.grade).slice(0, 1).toUpperCase() || null,
  };
}

/**
 * @param {unknown} row
 */
export function normalizeClaimLine(row) {
  if (!row || typeof row !== 'object') return null;
  const text = str(row.text || row.claim || row.line);
  if (!text) return null;
  if (adviceHit(text)) return null;
  let grade = str(row.grade).toUpperCase().slice(0, 1);
  if (!['A', 'B', 'C'].includes(grade)) grade = null;
  const source_ids = Array.isArray(row.source_ids)
    ? row.source_ids.map((x) => str(x)).filter(Boolean).slice(0, 20)
    : [];
  const excerpt = str(row.excerpt).slice(0, 800) || null;
  return {
    text: text.slice(0, 800),
    excerpt,
    as_of: str(row.as_of).slice(0, 32) || null,
    grade,
    source_ids,
    layer_hint: str(row.layer_hint || row.layer).slice(0, 32) || null,
  };
}

/**
 * Ground claims to sources + optional acquired/ files. Mutates extracts in place
 * (grade A demoted when the filing is not on disk). Returns errors to fail publish.
 * @param {{ sources: object[], financials: object[], guide: object[], risks?: object[], narrative?: object[] }} parts
 * @param {{ acquiredDir?: string|null }} [opts]
 */
export function applyPublishTruthGate(parts, opts = {}) {
  const errors = [];
  const warnings = [];
  const sources = Array.isArray(parts.sources) ? parts.sources : [];
  const byId = new Map();
  for (const s of sources) {
    if (s?.id) byId.set(s.id, s);
  }

  const acquiredDir = opts.acquiredDir || null;
  let acquiredFiles = [];
  if (acquiredDir) {
    try {
      acquiredFiles = fs.readdirSync(acquiredDir)
        .filter((n) => !n.startsWith('.'))
        .map((n) => ({ name: n, path: path.join(acquiredDir, n) }));
    } catch { acquiredFiles = []; }
  }
  const docsByName = new Map();
  for (const f of acquiredFiles) {
    try { docsByName.set(f.name, fs.readFileSync(f.path, 'utf8')); } catch { /* binary ok skip */ }
  }
  const allDocs = [...docsByName.values()].filter(Boolean);
  const hasAcquired = acquiredFiles.length > 0;

  const checkClaims = (rows, kind, requireExcerpt) => {
    const out = [];
    for (const row of rows || []) {
      const c = { ...row };
      if (!c.source_ids.length) {
        if (kind === 'financials' || kind === 'guide') {
          errors.push(`${kind} claim missing source_ids`);
          continue;
        }
      }
      for (const sid of c.source_ids) {
        if (!byId.has(sid)) errors.push(`${kind} cites unknown source ${sid}`);
      }
      for (const sid of c.source_ids) {
        const src = byId.get(sid);
        if (src && !src.url && !src.accession) {
          errors.push(`source ${sid} needs url or accession`);
        }
      }
      const needle = c.excerpt || c.text;
      if (requireExcerpt && hasAcquired && (kind === 'financials' || kind === 'guide')) {
        if (!c.excerpt && !c.text) {
          errors.push(`${kind} missing excerpt`);
        } else {
          const hit = allDocs.some((d) => excerptHitsDoc(needle, d));
          if (!hit) {
            errors.push(`${kind} excerpt not found in acquired/ files — will not invent`);
            continue;
          }
          const src = byId.get(c.source_ids[0]);
          const primary = src && PRIMARY_KINDS.has(String(src.kind || '').toUpperCase());
          if (c.grade === 'A' && !primary) {
            c.grade = 'B';
            warnings.push(`${kind} grade A demoted — source is not a primary filing kind`);
          }
        }
      } else if ((kind === 'financials' || kind === 'guide') && c.grade === 'A' && !hasAcquired) {
        c.grade = 'B';
        warnings.push(`${kind} grade A demoted — no acquired/ filing on disk this run`);
      }
      out.push(c);
    }
    return out;
  };

  return {
    errors,
    warnings,
    extracts: {
      financials: checkClaims(parts.financials, 'financials', true),
      guide: checkClaims(parts.guide, 'guide', true),
      risks: checkClaims(parts.risks, 'risks', false),
      narrative: checkClaims(parts.narrative, 'narrative', false),
    },
  };
}

/**
 * @param {unknown} raw
 */
export function normalizeGaps(raw) {
  if (!Array.isArray(raw)) return [];
  return raw.map((g) => str(g)).filter(Boolean).filter((g) => !adviceHit(g)).slice(0, 40);
}

/**
 * Validate publish body for a complete run.
 * @param {object} raw
 * @param {{ ticker?: string, run_id?: string, requireComplete?: boolean }} [opts]
 */
export function validateResearchRunPublish(raw, opts = {}) {
  const errors = [];
  const warnings = [];
  if (!raw || typeof raw !== 'object') {
    return { ok: false, errors: ['body must be an object'], warnings };
  }

  const ticker = str(raw.ticker || opts.ticker).toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!ticker) errors.push('ticker required');

  const run_id = str(raw.run_id || opts.run_id).replace(/[^A-Za-z0-9._-]/g, '').slice(0, 96);
  if (!run_id) errors.push('run_id required');

  let job = str(raw.job || 'deep_compile');
  if (!RESEARCH_JOBS.has(job)) {
    warnings.push(`unknown job ${job} → deep_compile`);
    job = 'deep_compile';
  }

  let status = str(raw.status || 'complete');
  if (!RESEARCH_STATUSES.has(status)) {
    errors.push(`invalid status ${status}`);
  }

  if (opts.requireComplete !== false && status === 'complete') {
    // complete runs need summary or extracts
    const summary = str(raw.summary || raw.summary_md);
    const sources = Array.isArray(raw.sources) ? raw.sources.map(normalizeSourceItem).filter(Boolean) : [];
    const gaps = normalizeGaps(raw.gaps);
    const financials = Array.isArray(raw.financials)
      ? raw.financials.map(normalizeClaimLine).filter(Boolean)
      : (Array.isArray(raw.extracts?.financials)
        ? raw.extracts.financials.map(normalizeClaimLine).filter(Boolean)
        : []);
    const risks = Array.isArray(raw.risks)
      ? raw.risks.map(normalizeClaimLine).filter(Boolean)
      : (Array.isArray(raw.extracts?.risks)
        ? raw.extracts.risks.map(normalizeClaimLine).filter(Boolean)
        : []);
    const narrative = Array.isArray(raw.narrative)
      ? raw.narrative.map(normalizeClaimLine).filter(Boolean)
      : (Array.isArray(raw.extracts?.narrative)
        ? raw.extracts.narrative.map(normalizeClaimLine).filter(Boolean)
        : []);
    const guide = Array.isArray(raw.guide)
      ? raw.guide.map(normalizeClaimLine).filter(Boolean)
      : (Array.isArray(raw.extracts?.guide)
        ? raw.extracts.guide.map(normalizeClaimLine).filter(Boolean)
        : []);

    if (!summary && !financials.length && !narrative.length) {
      errors.push('complete run needs summary or extract claims');
    }
    if (summary && adviceHit(summary)) errors.push('summary contains advice language');

    const grounded = applyPublishTruthGate({
      sources, financials, risks, narrative, guide,
    }, { acquiredDir: opts.acquiredDir || null });
    errors.push(...grounded.errors);
    warnings.push(...grounded.warnings);
    const gEx = grounded.extracts;

    if (errors.length) return { ok: false, errors, warnings };

    const now = new Date().toISOString();
    return {
      ok: true,
      errors: [],
      warnings,
      snapshot: {
        schema_version: RESEARCH_RUNS_SCHEMA_VERSION,
        run_id,
        ticker,
        desk: str(raw.desk) || null,
        job,
        status: 'complete',
        started_at: str(raw.started_at) || now,
        finished_at: str(raw.finished_at) || now,
        trigger: str(raw.trigger) || 'agent',
        compute: raw.compute && typeof raw.compute === 'object'
          ? {
            note: str(raw.compute.note) || 'heavy',
            duration_sec: Number.isFinite(Number(raw.compute.duration_sec))
              ? Number(raw.compute.duration_sec) : null,
            agent_calls: Number.isFinite(Number(raw.compute.agent_calls))
              ? Number(raw.compute.agent_calls) : null,
          }
          : { note: 'heavy', duration_sec: null, agent_calls: null },
        inputs: raw.inputs && typeof raw.inputs === 'object' ? {
          focus: str(raw.inputs.focus) || null,
          prior_run_id: str(raw.inputs.prior_run_id) || null,
          as_of_request: str(raw.inputs.as_of_request).slice(0, 32) || null,
        } : { focus: null, prior_run_id: null, as_of_request: null },
        summary: summary || null,
        sources,
        gaps,
        extracts: {
          financials: gEx.financials,
          risks: gEx.risks,
          narrative: gEx.narrative,
          guide: gEx.guide,
        },
        promotion: raw.promotion && typeof raw.promotion === 'object' ? {
          status: str(raw.promotion.status) || 'none',
          pack_claims: !!raw.promotion.pack_claims,
          risks_proposed: !!raw.promotion.risks_proposed,
          house_proposed: !!raw.promotion.house_proposed,
          model_pack_layers: !!raw.promotion.model_pack_layers,
          notes: str(raw.promotion.notes).slice(0, 400) || null,
        } : {
          status: 'none',
          pack_claims: false,
          risks_proposed: false,
          house_proposed: false,
          model_pack_layers: false,
          notes: null,
        },
        immutable: true,
        decision_support_only: true,
      },
    };
  }

  // non-complete (running/failed) meta-only
  if (errors.length) return { ok: false, errors, warnings };
  const now = new Date().toISOString();
  return {
    ok: true,
    errors: [],
    warnings,
    snapshot: {
      schema_version: RESEARCH_RUNS_SCHEMA_VERSION,
      run_id,
      ticker,
      desk: str(raw.desk) || null,
      job,
      status,
      started_at: str(raw.started_at) || now,
      finished_at: str(raw.finished_at) || (status === 'running' || status === 'queued' ? null : now),
      trigger: str(raw.trigger) || 'user',
      compute: { note: 'heavy', duration_sec: null, agent_calls: null },
      inputs: {
        focus: str(raw.focus || raw.inputs?.focus) || null,
        prior_run_id: str(raw.prior_run_id || raw.inputs?.prior_run_id) || null,
        as_of_request: null,
      },
      summary: null,
      sources: [],
      gaps: [],
      extracts: { financials: [], risks: [], narrative: [], guide: [] },
      promotion: {
        status: 'none',
        pack_claims: false,
        risks_proposed: false,
        house_proposed: false,
        model_pack_layers: false,
        notes: null,
      },
      immutable: false,
      decision_support_only: true,
      error: str(raw.error) || null,
    },
  };
}

/**
 * Index row from meta.
 * @param {object} meta
 */
export function indexRowFromMeta(meta) {
  if (!meta || typeof meta !== 'object') return null;
  const run_id = str(meta.run_id);
  if (!run_id) return null;
  const n_sources = Array.isArray(meta.sources) ? meta.sources.length
    : (Number(meta.n_sources) || 0);
  const n_financials = Number(meta.n_financials) || 0;
  const n_risks = Number(meta.n_risks) || 0;
  const n_narrative = Number(meta.n_narrative) || 0;
  const n_guide = Number(meta.n_guide) || 0;
  const n_gaps = Number(meta.n_gaps) || 0;
  const n_claims = n_financials + n_risks + n_narrative + n_guide;
  return {
    run_id,
    job: str(meta.job) || 'deep_compile',
    status: str(meta.status) || 'unknown',
    started_at: str(meta.started_at) || null,
    finished_at: str(meta.finished_at) || null,
    label: str(meta.label) || humanJobLabel(meta.job),
    n_sources,
    n_financials,
    n_risks,
    n_narrative,
    n_guide,
    n_gaps,
    n_claims,
    promoted: !!(meta.promotion && meta.promotion.status && meta.promotion.status !== 'none'),
    compute_note: meta.compute?.note || 'heavy',
  };
}

export function humanJobLabel(job) {
  const j = str(job);
  if (j === 'print_package') return 'Print package';
  if (j === 'pack_refresh') return 'Pack refresh';
  return 'Deep compile';
}
