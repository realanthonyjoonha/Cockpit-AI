// researchRunsAgentSeed.js — page-context seed for OPEN GROK from Research room.
// Decision-support only. Does not write vault.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadPack } from './pack.js';
import { listResearchRuns, getResearchRun, researchRunDir } from './thinResearchRuns.js';
import { resolveDeskIdentity } from './streetAgentSeed.js';
import { humanJobLabel, resolveThesisRegister, describeRegisterScope, normalizeThesisPace, describeThesisPace, defaultThesisOrder, formatThesisOrder } from './researchRunsSchema.js';

function normalizeMode(mode) {
  const m = String(mode || '').toLowerCase().trim();
  if (m === 'pipeline' || m === 'refresh' || m === 'compile') return 'pipeline';
  return 'chat';
}

/**
 * @param {string} deskOrTicker
 * @param {{ mode?: string, run_id?: string, job?: string }} [opts]
 */
export function writeResearchRunsAgentSeed(deskOrTicker, opts = {}) {
  const id = resolveDeskIdentity(deskOrTicker);
  if (!id?.ticker && !id?.slug) {
    return { ok: false, error: 'could not resolve desk/ticker for research seed' };
  }

  const mode = normalizeMode(opts.mode);
  const job = String(opts.job || 'deep_compile');
  const thesisMode = job === 'thesis_report'
    ? String(opts.thesis_mode || opts.thesisMode || 'earnings-update')
    : null;
  const list = listResearchRuns(id.ticker, { desk: id.slug });
  const runId = opts.run_id ? String(opts.run_id) : (list.latest?.run_id || null);
  const run = runId ? getResearchRun(id.ticker, runId, { desk: id.slug }) : null;
  const thesisRegister = job === 'thesis_report'
    ? resolveThesisRegister({
      register_scope: opts.register_scope || opts.registerScope
        || run?.thesis?.register_scope || run?.inputs?.register_scope,
      register_ids: opts.register_ids || opts.registerIds
        || run?.thesis?.register_ids || run?.inputs?.register_ids,
    })
    : null;
  const thesisPace = job === 'thesis_report'
    ? normalizeThesisPace(
      opts.thesis_pace || opts.thesisPace
        || run?.thesis?.thesis_pace || run?.inputs?.thesis_pace,
    )
    : null;
  const through = thesisPace === 'through';

  const packLoad = loadPack(id.ticker, { force: true });
  const pack = packLoad.available ? packLoad.pack : null;
  const hp = pack?.house_prior || {};
  const risks = Array.isArray(pack?.risks) ? pack.risks : [];
  const watch = [];
  for (const r of risks) {
    const st = String(r.status || '').toUpperCase();
    if (st !== 'WATCH' && st !== 'FIRED') continue;
    watch.push(`- **${r.id || '?'}** ${r.name || ''} · ${st}`);
  }

  const vaultRel = runId
    ? `research-wiki/cockpit/research/${id.ticker}/runs/${runId}/`
    : `research-wiki/cockpit/research/${id.ticker}/runs/{run_id}/`;

  const jobBlock = job === 'thesis_report'
    ? [
      '## Open mode: THESIS REPORT (checkpointed — not deep compile)',
      '',
      'Execute **`.grok/skills/ib-report/SKILL.md`**. This is judgment-shaped. Distinct from `/cockpit-research-compile`.',
      '',
      `1. **Job:** thesis_report (${humanJobLabel('thesis_report')}) · **mode:** ${thesisMode || 'earnings-update'}`,
      runId ? `2. **run_id (required):** \`${runId}\` — write under \`${vaultRel}\`` : '2. If no run_id, POST /api/{slug}/research/runs `{ job: "thesis_report", thesis_mode }` then use returned run_id',
      '3. **House: always on.** MCP `get_house_view` + `get_pack_snapshot`. Steelman → delta vs house → red-team. Not a toggle.',
      `4. **Register scope (glass chose — do not re-ask):** ${describeRegisterScope(thesisRegister.register_scope, thesisRegister.register_ids)}`,
      `   **ORDER (required — write this exact list in config.py; do not add sections):** ${formatThesisOrder(defaultThesisOrder(thesisMode, thesisRegister.register_scope))}`,
      thesisRegister.register_scope === 'skim'
        ? '   Do **not** add `register-updated` or `tripwires`. No register chapter, no WATCH table.'
        : null,
      thesisRegister.register_scope === 'pick' && thesisRegister.register_ids.length
        ? `   - pack ids (use with get_risk_sor): ${thesisRegister.register_ids.map((x) => `\`${x}\``).join(', ')}`
        : null,
      '   - **all:** WATCH in depth (mechanism, tripwires, evidence, INTACT/WATCH/FIRED *test*, GAP). INTACT/FIRED short. Hunt outside register as add-risk candidates.',
      '   - **pick:** deep only the listed Rn. Other Rn: one line `not tested this note.` Still print the WATCH title list.',
      '   - **skim (House only):** omit `register-updated` and `tripwires` from ORDER. No register chapter, no WATCH table, no per-Rn essay. House via delta-vs-house only. One setup line: `Register not in this note (glass: house only).`',
      '   Status is TESTED, never cited as evidence. Never silent-write house/risks.',
      `5. **Pace (glass chose — do not re-ask):** ${describeThesisPace(thesisPace)}`,
      through
        ? '   Do **not** wait at Checkpoint 1 or 2. Still do the QA checklist. Still POST each checkpoint as you pass.'
        : '   STOP at CHECKPOINT 1 (verdict, delta, contested, grades) until Anthony nods.',
      '6. Draft sections in `sections/`; `config.py` new (do not copy fixtures/two-section/config.py). FIGMAP empty-or-real. Exec last.',
      '7. Render: `python3 ~/Desktop/cockpit-kernel/scripts/report/build.py --config $RUN/config.py`',
      through
        ? '8. Run CHECKPOINT 2 QA checks, then continue. Do not wait. PDF is **ops, never pack SoR**.'
        : '8. STOP at CHECKPOINT 2 (QA). PDF is **ops, never pack SoR**.',
      through
        ? '9. Closeout without a nod: vault claims → `./ont compile && ./ont verify` exit 0 → **propose_*** only. Print proposal ids. Human ACCEPT on glass.'
        : '9. Closeout only after nod: vault claims → `./ont compile && ./ont verify` exit 0 → **propose_*** only.',
      '10. Checkpoint glass: POST `/api/{slug}/research/runs/{run_id}/checkpoint` `{ checkpoint: scope|research|draft|qa|closeout }`',
      '11. Do **not** write house, 08-risks, ontology/store, or product desks. Initiation = structure, not a rating.',
    ].filter((line) => line != null).join('\n')
    : (mode === 'pipeline'
      ? [
        '## Open mode: PIPELINE',
        '',
        'Glass: **NEW COMPILE**. Execute the research job — do not stop at a menu.',
        '',
        `1. **Job:** ${job} (${humanJobLabel(job)})`,
        runId ? `2. **run_id (required):** \`${runId}\` — glass created meta status=queued until worker attach` : '2. If no run_id, create via POST /api/{slug}/research/runs then use returned run_id',
        '3. Research public filings / IR only — primary first; soft press → [soft]; missing → GAP',
        '4. Fetch primaries via POST `/api/{slug}/research/runs/{run_id}/acquire` `{url, filename_hint}` (timeout, EDGAR HTML fallback). 403/block → GAP, do not hang. Files land in `acquired/` — never `cockpit/compile/`.',
        '5. Write **only** under the run folder (meta, summary.md, sources.json, gaps.json, extracts/*, acquired/*)',
        '6. Publish complete via POST `/api/{slug}/research/runs/{run_id}/publish`. Financials/guide need source_ids + excerpt that appears in acquired/. Grade A requires an acquired primary. Do not copy prior-run numbers as A without a new fetch.',
        '7. Do **not** write house, risks SoR, ontology/store, model user_case, or Street',
        '8. Do **not** COMPILE BOOK unless user later asks promote',
        '9. Report: n sources, n claims, gaps, path — promote options only',
      ].join('\n')
      : [
        '## Open mode: CHAT',
        '',
        'Brief run list + last run status in 3–6 lines, then follow user (re-read run, promote, re-run).',
        'Never arm/lock model print. Never fill YOUR CASE. Never silent house/risk write.',
      ].join('\n'));

  const lines = [
    `# Research compile agent seed — ${id.label} (${id.ticker})`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Desk slug: \`${id.slug}\` · Glass: \`#/${id.slug}/research\``,
    `## Open mode: ${mode === 'pipeline' ? 'PIPELINE' : 'CHAT'}`,
    '',
    '## Product law',
    '',
    '1. Decision-support only — no buy/sell/hold, no PT/fair value as advice, no sizing.',
    '2. Research run = **draft archive** — not live pack/house until explicit promote.',
    '3. Never invent financials — graded claims or GAP.',
    `4. **Write scope:** only \`${vaultRel}\` via publish API.`,
    '5. Never write house, risks SoR, ontology/store/, model print/user_case, Street.',
    '6. Complete runs are immutable — new work = new run_id.',
    '',
    jobBlock,
    '',
    '## Current runs (index)',
    '',
    list.runs?.length
      ? list.runs.slice(0, 8).map((r) => (
        `- \`${r.run_id}\` · ${r.status} · ${r.job} · sources=${r.n_sources ?? 0}`
      )).join('\n')
      : '- (none)',
    '',
    '## Active run',
    '',
    run?.available
      ? [
        `- run_id: **${run.run_id}** · status: **${run.status}** · job: ${run.job}`,
        `- path: \`${run.path}\``,
        run.summary ? `- summary preview: ${String(run.summary).slice(0, 200)}…` : '- summary: (empty until publish)',
      ].join('\n')
      : (runId ? `- run_id ${runId} not loaded yet` : '- no run_id — start run first'),
    '',
    '## House prior (read-only)',
    '',
    hp.view_excerpt
      ? String(hp.view_excerpt).replace(/\s+/g, ' ').slice(0, 400)
      : (hp.play || '(none)'),
    '',
    '## WATCH / FIRED (read-only)',
    '',
    watch.length ? watch.join('\n') : '- (none)',
    '',
    '## Publish body shape (complete)',
    '',
    '```json',
    JSON.stringify({
      schema_version: 1,
      run_id: runId || 'RUN_ID',
      ticker: id.ticker,
      job,
      status: 'complete',
      summary: 'Plain English L0/L1 from extracts only…',
      sources: [{ id: 'src_1', title: 'Form 10-K', kind: '10-K', as_of: 'YYYY-MM-DD', url: 'https://…', grade_hint: 'A' }],
      financials: [{ text: '…', excerpt: 'verbatim phrase from the filing', as_of: 'YYYY-MM-DD', grade: 'A', source_ids: ['src_1'], layer_hint: 'pack_actual' }],
      risks: [{ text: '…', as_of: 'YYYY-MM-DD', grade: 'B', source_ids: ['src_1'] }],
      narrative: [{ text: '…', as_of: 'YYYY-MM-DD', grade: 'B', source_ids: ['src_1'] }],
      guide: [{ text: '…', as_of: 'YYYY-MM-DD', grade: 'A', source_ids: ['src_1'], layer_hint: 'pack_guide' }],
      gaps: ['…'],
    }, null, 2),
    '```',
    '',
    job === 'thesis_report'
      ? `POST \`/api/${id.slug}/research/runs/${runId || '{run_id}'}/checkpoint\`  then closeout via propose_* (PDF in output/)`
      : `POST \`/api/${id.slug}/research/runs/${runId || '{run_id}'}/publish\``,
    '',
    job === 'thesis_report'
      ? `End seed. Proceed with \`/cockpit-report\`. ${through ? 'Pace through — do not wait at checkpoints.' : 'Stop at checkpoints.'} Decision-support only.`
      : 'End seed. Proceed with `/cockpit-research-compile`.',
  ];

  const text = lines.join('\n');
  const name = `cockpit-research-${id.slug}-seed.md`;
  const candidates = [];
  if (runId) {
    const runDir = researchRunDir(id.ticker, runId);
    if (runDir) candidates.push(path.join(runDir, 'seed.md'));
  }
  candidates.push(path.join('/tmp', name), path.join(os.tmpdir(), name));
  let written = null;
  for (const p of candidates) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, text, 'utf8');
      if (!written) written = p;
    } catch { /* */ }
  }
  if (!written) return { ok: false, error: 'could not write research seed' };

  return {
    ok: true,
    path: written,
    bytes: Buffer.byteLength(text, 'utf8'),
    ticker: id.ticker,
    slug: id.slug,
    mode,
    run_id: runId,
    job,
    thesis_mode: thesisMode,
    register_scope: thesisRegister?.register_scope || null,
    register_ids: thesisRegister?.register_ids || null,
    thesis_pace: thesisPace,
    n_runs: list.runs?.length || 0,
  };
}
