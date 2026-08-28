// researchRunsSchema.js — format gate for desk Research run archives.
// Vault: research-wiki/cockpit/research/{TICKER}/runs/{run_id}/
// Decision-support only. Not pack / house / Street SoR until explicit promote.
import fs from 'fs';
import path from 'path';

export const RESEARCH_RUNS_SCHEMA_VERSION = 1;

export const RESEARCH_JOBS = new Set([
  'deep_compile', 'print_package', 'pack_refresh', 'thesis_report',
]);

/** Thesis-lane modes (ib-report skill). Not a coverage rating. */
export const THESIS_MODES = new Set(['earnings-update', 'deep-dive', 'initiation']);
/** Conversational checkpoints stored on run meta (glass-visible). */
export const THESIS_CHECKPOINTS = new Set(['scope', 'research', 'draft', 'qa', 'closeout']);

export function isThesisReportJob(job) {
  return String(job || '') === 'thesis_report';
}

/** Compile-lane jobs (Research room). Thesis is the Reports room. */
export const COMPILE_JOBS = new Set(['deep_compile', 'print_package', 'pack_refresh']);

/** @returns {'compile'|'reports'} */
export function researchLane(job) {
  return isThesisReportJob(job) ? 'reports' : 'compile';
}

/**
 * @param {string} job
 * @param {string} [lane] compile | reports | all
 */
export function jobMatchesLane(job, lane) {
  const l = String(lane || '').toLowerCase().trim();
  if (!l || l === 'all') return true;
  if (l === 'reports' || l === 'thesis' || l === 'thesis_report') return isThesisReportJob(job);
  if (l === 'compile' || l === 'research') return !isThesisReportJob(job);
  return true;
}

export function normalizeThesisMode(raw) {
  const m = String(raw || '').toLowerCase().trim();
  return THESIS_MODES.has(m) ? m : 'earnings-update';
}

export function normalizeThesisCheckpoint(raw) {
  const c = String(raw || '').toLowerCase().trim();
  return THESIS_CHECKPOINTS.has(c) ? c : 'scope';
}

/** stop = wait at C1/C2. through = end-to-end, no conversational waits. */
export const THESIS_PACES = new Set(['stop', 'through']);

const THESIS_PACE_ALIAS = {
  gated: 'stop',
  checkpoints: 'stop',
  interactive: 'stop',
  e2e: 'through',
  auto: 'through',
  'run-through': 'through',
  run_through: 'through',
  runthrough: 'through',
  unattended: 'through',
  continuous: 'through',
};

export function normalizeThesisPace(raw) {
  const s = String(raw || '').toLowerCase().trim();
  const mapped = THESIS_PACE_ALIAS[s] || s;
  return THESIS_PACES.has(mapped) ? mapped : 'stop';
}

export function describeThesisPace(raw) {
  const p = normalizeThesisPace(raw);
  if (p === 'through') {
    return 'through — do not wait at Checkpoint 1 or 2; still POST each checkpoint; closeout via propose_* only';
  }
  return 'stop — wait at Checkpoint 1 and 2';
}

/** Register depth on a thesis note. House is always on — not a fourth option. */
export const REGISTER_SCOPES = new Set(['all', 'pick', 'skim']);

const REGISTER_SCOPE_ALIAS = {
  ids: 'pick',
  named: 'pick',
  'house-only': 'skim',
  house_only: 'skim',
  houseonly: 'skim',
  none: 'skim',
};

const RISK_ID_RE = /^[A-Za-z][A-Za-z0-9._-]{0,119}$/;

export function normalizeRegisterScope(raw) {
  const s = String(raw || '').toLowerCase().trim();
  const mapped = REGISTER_SCOPE_ALIAS[s] || s;
  return REGISTER_SCOPES.has(mapped) ? mapped : 'all';
}

export function normalizeRegisterIds(raw) {
  const arr = Array.isArray(raw) ? raw : String(raw || '').split(/[\s,;]+/);
  const out = [];
  const seen = new Set();
  for (const item of arr) {
    const id = String(item || '').trim();
    if (!id || !RISK_ID_RE.test(id)) continue;
    const key = id.toUpperCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(id);
    if (out.length >= 40) break;
  }
  return out;
}

/**
 * House is always on. Register: all | pick | skim.
 * pick with no ids falls back to all (OPEN GROK from the agents menu is safe).
 */
export function resolveThesisRegister(raw = {}) {
  let register_scope = normalizeRegisterScope(
    raw.register_scope || raw.registerScope || raw.thesis_register || raw.thesisRegister,
  );
  let register_ids = normalizeRegisterIds(
    raw.register_ids || raw.registerIds || raw.risk_ids || raw.riskIds,
  );
  if (register_scope === 'pick' && !register_ids.length) register_scope = 'all';
  if (register_scope !== 'pick') register_ids = [];
  return { register_scope, register_ids };
}

/** R1 from `R1` or `lly-r1-tirzepatide-…`. Unmatched ids pass through. */
export function shortRegisterToken(id) {
  const s = String(id || '').trim();
  if (/^R\d{1,3}$/i.test(s)) return s.toUpperCase();
  const m = s.match(/(?:^|[-_./])r(\d{1,3})(?:[-_./]|$)/i);
  return m ? `R${m[1]}` : s;
}

/** Section ORDER for config.py. skim drops register-updated and tripwires. */
export function defaultThesisOrder(mode, registerScope) {
  const m = normalizeThesisMode(mode);
  const skim = normalizeRegisterScope(registerScope) === 'skim';
  if (m === 'earnings-update') {
    return skim
      ? ['print-vs-house', 'gaps', 'exec']
      : ['print-vs-house', 'register-updated', 'tripwires', 'gaps', 'exec'];
  }
  if (m === 'initiation') {
    return skim
      ? ['spine', 'delta-vs-house', 'financials', 'monitorables', 'exec']
      : ['spine', 'delta-vs-house', 'financials', 'register-updated', 'monitorables', 'exec'];
  }
  return skim
    ? ['setup', 'delta-vs-house', 'mechanism', 'monitorables', 'exec']
    : ['setup', 'delta-vs-house', 'register-updated', 'mechanism', 'monitorables', 'exec'];
}

export function formatThesisOrder(order) {
  const o = Array.isArray(order) ? order.map((s) => String(s || '').trim()).filter(Boolean) : [];
  return o.join(' · ');
}

export function orderOmitsRegister(order) {
  const o = Array.isArray(order) ? order : [];
  return !o.includes('register-updated') && !o.includes('tripwires');
}

const REGISTER_SECTION_IDS = new Set(['register-updated', 'tripwires']);

/** Parse ORDER = ["a", "b"] from a thesis config.py (agent-authored). */
export function parseConfigPyOrder(text) {
  const m = String(text || '').match(/ORDER\s*=\s*\[([^\]]*)\]/m);
  if (!m) return null;
  return [...m[1].matchAll(/['"]([^'"]+)['"]/g)].map((x) => x[1]);
}

/**
 * Fail-closed skim checks: ORDER + on-disk sections/config must omit register.
 * @param {{ register_scope?: string, order?: string[], runDir?: string|null }} opts
 * @returns {string[]} errors
 */
export function skimThesisViolations(opts = {}) {
  const errors = [];
  if (normalizeRegisterScope(opts.register_scope) !== 'skim') return errors;

  const order = Array.isArray(opts.order) ? opts.order.map((s) => String(s || '').trim()).filter(Boolean) : [];
  if (order.length && !orderOmitsRegister(order)) {
    errors.push('skim: ORDER must omit register-updated and tripwires');
  }

  const runDir = opts.runDir ? String(opts.runDir) : '';
  if (!runDir) return errors;

  try {
    const cfgPath = path.join(runDir, 'config.py');
    if (fs.existsSync(cfgPath)) {
      const parsed = parseConfigPyOrder(fs.readFileSync(cfgPath, 'utf8'));
      if (parsed && !orderOmitsRegister(parsed)) {
        errors.push('skim: config.py ORDER still includes a register chapter');
      }
    }
    for (const sid of REGISTER_SECTION_IDS) {
      for (const rel of [`sections/${sid}.md`, `output/sections/${sid}.md`]) {
        const p = path.join(runDir, rel);
        if (fs.existsSync(p)) {
          let size = 0;
          try { size = fs.statSync(p).size; } catch { size = 1; }
          if (size > 0) errors.push(`skim: ${rel} must not exist`);
        }
      }
    }
  } catch (e) {
    errors.push(`skim: could not verify run folder (${e.message || e})`);
  }
  return errors;
}

export function describeRegisterScope(scope, ids) {
  const { register_scope, register_ids } = resolveThesisRegister({
    register_scope: scope,
    register_ids: ids,
  });
  if (register_scope === 'skim') {
    return 'skim — house only; omit register-updated from ORDER (no register chapter)';
  }
  if (register_scope === 'pick') {
    const labels = [...new Set(register_ids.map(shortRegisterToken))];
    return `pick — deep only ${labels.join(', ')}; other Rn not tested this note`;
  }
  return 'all — WATCH in depth, INTACT/FIRED short';
}

function collectThesisFields(raw, job, { complete = false } = {}) {
  const focus = str(raw.focus || raw.inputs?.focus) || null;
  const prior_run_id = str(raw.prior_run_id || raw.inputs?.prior_run_id) || null;
  const as_of_request = str(raw.as_of_request || raw.inputs?.as_of_request).slice(0, 32) || null;
  if (!isThesisReportJob(job)) {
    return {
      inputs: {
        focus, prior_run_id, as_of_request,
        thesis_mode: null, checkpoint: null, register_scope: null, register_ids: null, thesis_pace: null, thesis_order: null,
      },
      thesis: null,
    };
  }
  const reg = resolveThesisRegister({
    register_scope: raw.register_scope || raw.inputs?.register_scope || raw.thesis?.register_scope,
    register_ids: raw.register_ids || raw.inputs?.register_ids || raw.thesis?.register_ids,
  });
  const checkpoint = normalizeThesisCheckpoint(
    raw.checkpoint || raw.inputs?.checkpoint || raw.thesis?.checkpoint || (complete ? 'qa' : 'scope'),
  );
  const mode = normalizeThesisMode(raw.thesis_mode || raw.inputs?.thesis_mode || raw.thesis?.mode);
  const pace = normalizeThesisPace(raw.thesis_pace || raw.inputs?.thesis_pace || raw.thesis?.thesis_pace);
  const order = Array.isArray(raw.thesis_order || raw.inputs?.thesis_order || raw.thesis?.order)
    ? (raw.thesis_order || raw.inputs?.thesis_order || raw.thesis?.order)
    : defaultThesisOrder(mode, reg.register_scope);
  return {
    inputs: {
      focus,
      prior_run_id,
      as_of_request,
      thesis_mode: mode,
      checkpoint,
      register_scope: reg.register_scope,
      register_ids: reg.register_ids,
      thesis_pace: pace,
      thesis_order: order,
    },
    thesis: {
      mode,
      checkpoint,
      pdf_rel: str(raw.pdf_rel || raw.thesis?.pdf_rel).slice(0, 200) || null,
      register_scope: reg.register_scope,
      register_ids: reg.register_ids,
      thesis_pace: pace,
      order,
    },
  };
}
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

    if (isThesisReportJob(job)) {
      if (!summary) errors.push('complete thesis_report needs a summary (verdict / QA note)');
      if (raw.promotion && raw.promotion.pack_claims) {
        errors.push('thesis_report PDF is ops — never pack SoR');
      }
      const thesisBits = collectThesisFields(raw, job, { complete: true });
      errors.push(...skimThesisViolations({
        register_scope: thesisBits.inputs.register_scope,
        order: thesisBits.inputs.thesis_order,
        runDir: opts.runDir || null,
      }));
    } else if (!summary && !financials.length && !narrative.length) {
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
        inputs: collectThesisFields(raw, job, { complete: true }).inputs,
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
          pack_claims: isThesisReportJob(job) ? false : !!raw.promotion.pack_claims,
          risks_proposed: !!raw.promotion.risks_proposed,
          house_proposed: !!raw.promotion.house_proposed,
          model_pack_layers: isThesisReportJob(job) ? false : !!raw.promotion.model_pack_layers,
          notes: str(raw.promotion.notes).slice(0, 400) || null,
        } : {
          status: 'none',
          pack_claims: false,
          risks_proposed: false,
          house_proposed: false,
          model_pack_layers: false,
          notes: null,
        },
        thesis: collectThesisFields(raw, job, { complete: true }).thesis,
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
      inputs: collectThesisFields(raw, job).inputs,
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
      thesis: collectThesisFields(raw, job).thesis,
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
    thesis_mode: str(meta.inputs?.thesis_mode || meta.thesis?.mode) || null,
    checkpoint: str(meta.inputs?.checkpoint || meta.thesis?.checkpoint) || null,
    register_scope: isThesisReportJob(meta.job)
      ? normalizeRegisterScope(meta.inputs?.register_scope || meta.thesis?.register_scope)
      : null,
    register_ids: isThesisReportJob(meta.job)
      ? normalizeRegisterIds(meta.inputs?.register_ids || meta.thesis?.register_ids)
      : null,
    thesis_pace: isThesisReportJob(meta.job)
      ? normalizeThesisPace(meta.inputs?.thesis_pace || meta.thesis?.thesis_pace)
      : null,
    job_label: humanJobLabel(meta.job),
  };
}

export function humanJobLabel(job) {
  const j = str(job);
  if (j === 'print_package') return 'Print package';
  if (j === 'pack_refresh') return 'Pack refresh';
  if (j === 'thesis_report') return 'Thesis report';
  return 'Deep compile';
}
