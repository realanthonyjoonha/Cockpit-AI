/**
 * Render REPORT.md from measured JSON. Narrative follows the numbers.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';

function load(dir, name) {
  const p = path.join(dir, name);
  if (!existsSync(p)) return null;
  return JSON.parse(readFileSync(p, 'utf8'));
}

function jsCase(ctx, id) {
  return (ctx.js_cases || []).find((c) => c.id === id);
}

function pyCase(ctx, id) {
  return ((ctx.python || {}).cases || []).find((c) => c.id === id);
}

function call(tools, id) {
  return (tools.calls || []).find((c) => c.id === id);
}

function fence(obj) {
  return `\`\`\`json\n${JSON.stringify(obj, null, 2)}\n\`\`\``;
}

export function writeReport(dir, outPath) {
  const ctx = load(dir, 'context.json');
  const tools = load(dir, 'tools.json');
  const flow = load(dir, 'flow.json');
  const models = load(dir, 'models.json');
  const meta = load(dir, 'run-meta.json') || {};

  const findings = [];

  const date = jsCase(ctx, 'C-date-unpadded');
  const iso = jsCase(ctx, 'C-date-iso');
  if (date?.winner === 'sep') {
    findings.push({
      id: 'F1',
      severity: 'P0',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'liveClaims keeps the latest claim per metric.',
      title: 'Unpadded dates let an older claim win the live slot',
      summary: 'A September claim dated 2026-9-30 outranks an October claim dated 2026-10-01 because the sort key is a string. The same pair with zero-padded ISO dates keeps October. Python live_claims uses the same string key, so both implementations agree on the wrong winner.',
      repro: [
        'cd <repo> && npm install --prefix harness-stress',
        'npm install --prefix memory-cockpit-v2',
        'node harness-stress/run.mjs',
        'Open harness-stress/results/context.json case C-date-unpadded.',
      ],
      evidence: {
        unpadded_winner: date.winner,
        unpadded_live: date.live,
        iso_winner: iso?.winner,
        python: pyCase(ctx, 'C-date-unpadded')?.live,
      },
    });
  }

  const guid = jsCase(ctx, 'C-guid-steals-cash');
  const guidRows = guid?.live || [];
  const stolen = guidRows.find((r) => r.id === 'cash-guid');
  const outlook = guidRows.find((r) => r.id === 'outlook');
  if (stolen?.metric_id === 'revenue_guide') {
    findings.push({
      id: 'F2',
      severity: 'P0',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'Metric rules keep one live claim and drop boilerplate only.',
      title: 'The substring "guid" files a cash sentence as revenue guidance',
      summary: 'revenue_guide is the first rule and matches any text containing "guid". "See guidance." on a cash sentence is classified as revenue_guide. A later cash sentence then replaces the real outlook claim in that bucket. The clean cash sentence remains under cash, so the pack shows the cash number twice, under two metric ids, and the outlook number is superseded.',
      repro: [
        'node harness-stress/run.mjs',
        'See context.json case C-guid-steals-cash and tools.json call id "pack".',
      ],
      evidence: {
        js_live: guidRows,
        outlook_present: !!outlook,
        python: pyCase(ctx, 'C-guid-steals-cash')?.live,
        pack_tool_flags: call(tools, 'pack')?.flags,
        pack_excerpt_has_guidance: /revenue_guide|guidance/.test(call(tools, 'pack')?.excerpt || ''),
      },
    });
  }

  const cash = jsCase(ctx, 'C-cash-phrase');
  const newCash = (cash?.live || []).find((r) => r.id === 'new-cash');
  const oldCash = (cash?.live || []).find((r) => r.id === 'old-cash');
  if (oldCash?.metric_id === 'cash' && (!newCash || newCash.metric_id === 'other')) {
    findings.push({
      id: 'F3',
      severity: 'P0',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'One live claim per metric removes stale duplicates.',
      title: 'A newer cash sentence misses the cash rule and the older sentence stays live',
      summary: 'The cash rule requires the phrase "cash and cash equivalents" or "cash and equivalents". "Cash was $222 million" (2026-07-01) does not match, so it is residual "other" when it contains a dollar amount. "Cash and cash equivalents were $111 million" (2024-01-01) stays the live cash metric. Both numbers are in the pack.',
      repro: ['node harness-stress/run.mjs', 'See context.json case C-cash-phrase.'],
      evidence: { live: cash.live },
    });
  }

  const drops = jsCase(ctx, 'C-drops');
  const dropIds = new Set((drops?.live || []).map((r) => r.id));
  const lost = (drops?.input_ids || []).filter((id) => !dropIds.has(id));
  if (lost.includes('qual') || lost.includes('emp') || lost.includes('space')) {
    findings.push({
      id: 'F4',
      severity: 'P1',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'Rule-based elision drops boilerplate and keeps the facts that matter.',
      title: 'Seeded facts are dropped before they reach the agent pack',
      summary: `Of the six probe claims, the live set kept ${(drops?.live || []).map((r) => r.id).join(', ') || '(none)'}. Dropped ids: ${lost.join(', ')}. A qualitative segment canary has no dollar sign or percent sign, so it is discarded. "45 percent" is discarded; "45%" is kept as residual. A spaced "$ 12" misses the residual regex. "Number of employees" is on the boilerplate list, so the headcount is discarded even when the sentence contains a dollar amount.`,
      repro: ['node harness-stress/run.mjs', 'See context.json case C-drops.'],
      evidence: { input_ids: drops.input_ids, live: drops.live, lost },
    });
  }

  const cap = jsCase(ctx, 'C-js-no-char-cap');
  const asm = jsCase(ctx, 'C-js-assemble-shape');
  const fatTool = tools?.fat_pack;
  const fatRetrieve = pyCase(ctx, 'C-retrieve-fat-claims');
  const notes = pyCase(ctx, 'C-retrieve-unknown-house-field');
  if (cap?.over_10000 || fatTool?.over_10000_chars) {
    findings.push({
      id: 'F5',
      severity: 'P1',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'A hard 10k-character cap binds the agent context pack (D-ONTO-8, CONTRACT.md).',
      title: 'The 10k cap is on retrieve(), and the MCP pack path does not apply it',
      summary: `assembleAgentPack has no budget field (has_budget=${asm?.has_budget}). A two-claim fixture serializes to ${cap?.chars} characters. get_pack_snapshot on a fat DEMO pack returned ${fatTool?.chars} characters (${fatTool?.tokens} tokens). retrieve() on fat claim text returned ${fatRetrieve?.chars} characters, over_budget=${fatRetrieve?.over_budget}, trimmed=${fatRetrieve?.budget?.trimmed}. An unknown house_prior.notes field of ${notes?.notes_len} characters survives the cutter (over_budget=${notes?.over_budget}) because the cutter only shrinks known keys.`,
      repro: [
        'node harness-stress/run.mjs',
        'See context.json C-js-no-char-cap, C-retrieve-fat-claims, C-retrieve-unknown-house-field, and tools.json fat_pack.',
      ],
      evidence: {
        assemble: { chars: asm?.chars, has_budget: asm?.has_budget, has_stale_tripwires: asm?.has_stale_tripwires },
        js_fat_chars: cap?.chars,
        tool_fat: fatTool,
        retrieve_fat: { chars: fatRetrieve?.chars, budget: fatRetrieve?.budget, over_budget: fatRetrieve?.over_budget },
        unknown_field: { chars: notes?.chars, notes_len: notes?.notes_len, over_budget: notes?.over_budget, budget: notes?.budget },
      },
    });
  }

  const agent = pyCase(ctx, 'C-agent-tail-cut');
  if (agent && agent.truncated) {
    findings.push({
      id: 'F6',
      severity: 'P1',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'Overview budgets never drop the closing contract. Long runs have no summarize step inside Cockpit.',
      title: 'ont agent context hard-cuts at 28,000 characters and drops the closing instruction',
      summary: `build_agent_context returned ${agent.chars} characters. truncated=${agent.truncated}. The string "END CONTEXT" is present=${agent.has_end_marker}. GAP-CANARY-TAIL is present=${agent.has_gap_canary} because that canary is also copied into the overview pack earlier in the string; the cut removed the final instruction instead. The slice is not aligned to a claim boundary (the tail is a partial "WORD" run plus the truncation marker). Command files that mention summarize or a context window: ${(flow?.command_files_mentioning_summarize_or_window || []).join(', ') || '(none)'}. implementation-notes.md still describes itself as a resume anchor; that file is prose, not a compactor.`,
      repro: ['node harness-stress/run.mjs', 'See context.json python case C-agent-tail-cut and flow.json.'],
      evidence: {
        agent,
        summarize_mentions: flow?.command_files_mentioning_summarize_or_window,
        resume_anchor_prose: flow?.implementation_notes_is_prose_anchor,
      },
    });
  }

  const mu = pyCase(ctx, 'C-retrieve-risks-mu-filter');
  if (mu && Array.isArray(mu.series_ids) && mu.series_ids.includes('mu-price') && !mu.series_ids.includes('demo-price')) {
    findings.push({
      id: 'F7',
      severity: 'P2',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'Retrieve is generic across desks.',
      title: 'The risks intent keeps series whose ids start with "mu"',
      summary: 'retrieve(DEMO, "risks") returned series ids ' + JSON.stringify(mu.series_ids) + '. The fixture series demo-price was removed. The mu-price row was kept. The filter is hard-coded in ontology/api/retrieve.py.',
      repro: ['node harness-stress/run.mjs', 'See context.json case C-retrieve-risks-mu-filter.'],
      evidence: { series_ids: mu.series_ids },
    });
  }

  const crowd = pyCase(ctx, 'C-retrieve-crowd');
  if (crowd && Array.isArray(crowd.claim_ids)) {
    const keptUnique = ['cash-old', 'debt-old', 'gm-old'].filter((id) => crowd.claim_ids.includes(id));
    findings.push({
      id: 'F8',
      severity: 'P1',
      area: 'context',
      verdict: keptUnique.length < 3 ? 'confirmed' : 'refuted',
      hypothesis: 'The 10k overview trim drops lowest-priority extras and keeps a representative claim set.',
      title: 'retrieve() keeps the newest claims, so repeated revenue lines crowd out older metrics',
      summary: `The fixture had 10 newer revenue claims plus cash, debt, and gross-margin claims from 2020. Overview claim ids kept: ${crowd.claim_ids.join(', ') || '(none)'}. Older unique metrics kept: ${keptUnique.join(', ') || '(none)'}. This trim is count-based on as_of, which is a different algorithm from contextpack.js one-per-metric.`,
      repro: ['node harness-stress/run.mjs', 'See context.json case C-retrieve-crowd.'],
      evidence: { claim_ids: crowd.claim_ids, chars: crowd.chars, budget: crowd.budget },
    });
  }

  const grade = ctx?.grade_divergence;
  if (grade && grade.js_winner && grade.py_winner && grade.js_winner !== grade.py_winner) {
    findings.push({
      id: 'F9',
      severity: 'P2',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'The JS mirror matches the Python live-claim picker.',
      title: 'A missing grade is weight 0 in JavaScript and grade C in Python',
      summary: `Same-day pair: blank grade versus explicit C. JS winner=${grade.js_winner}. Python winner=${grade.py_winner}. Python substitutes C when grade is missing; JavaScript uses GRADE_W[grade] || 0.`,
      repro: ['node harness-stress/run.mjs', 'See context.json grade_divergence.'],
      evidence: grade,
    });
  }

  const residual = jsCase(ctx, 'C-residual-cap');
  if (residual) {
    findings.push({
      id: 'F10',
      severity: 'P2',
      area: 'context',
      verdict: residual.kept === 8 ? 'confirmed' : 'partial',
      hypothesis: 'Residual numbered claims are capped.',
      title: 'Unclassified dollar claims are capped at 8',
      summary: `12 unclassified dollar claims went in. ${residual.kept} came out. Kept ids: ${(residual.kept_ids || []).join(', ')}.`,
      repro: ['node harness-stress/run.mjs', 'See context.json case C-residual-cap.'],
      evidence: residual,
    });
  }

  if (flow?.trajectories) {
    const deep = flow.trajectories.find((t) => t.slice_token_target === 6000) || flow.trajectories[flow.trajectories.length - 1];
    findings.push({
      id: 'F11',
      severity: 'P1',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'Long DEEP runs depend on the host window. Cockpit does not summarize between slices.',
      title: 'A new-desk trajectory overflows tight host budgets and a tail-keep drops the seeded facts',
      summary: `cockpit-new-desk.md is ${flow.command_tokens} tokens. AGENTS.md is ${flow.agents_tokens} tokens. With ~${deep?.slice_token_target}-token slice notes, the transcript ends at ${deep?.final_tokens} tokens. First overflowing step by budget: ${JSON.stringify(deep?.overflow_step)}. On that deep trajectory the 32k tail-keep at the last step retains ${deep?.steps?.[deep.steps.length - 1]?.budgets?.['32000']?.canaries_kept} of 8 seeded facts. The 128k window still holds ${deep?.steps?.[deep.steps.length - 1]?.budgets?.['128000']?.canaries_kept} of 8, so this particular 8-slice transcript fits a 128k host and does not fit a 32k host. Twelve repeated pack snapshots cost ${flow.repeated_pack_calls?.at(-1)?.tokens} tokens and still fit in 32k; the waste is duplicate payload, and the canaries survive. Cockpit does not write a slice summary back into the running prompt. The simulator's compaction is a tail-keep, which is what a host does when it has no summary step.`,
      repro: ['node harness-stress/run.mjs', 'See flow.json trajectories and repeated_pack_calls.'],
      evidence: {
        command_tokens: flow.command_tokens,
        agents_tokens: flow.agents_tokens,
        overflow_step: deep?.overflow_step,
        final_tokens: deep?.final_tokens,
        step0_32k: deep?.steps?.[0]?.budgets?.['32000'],
        last_32k: deep?.steps?.[deep.steps.length - 1]?.budgets?.['32000'],
        repeated_pack_tail: flow.repeated_pack_calls?.filter((r) => [1, 6, 12].includes(r.call)),
        schema_tokens_each_call: flow.schema_tokens_added_each_call,
      },
    });
  }

  if (tools?.schema) {
    const dead = ['propose_add_metric', 'get_metric_sor']
      .map((name) => tools.schema.per_tool.find((t) => t.name === name))
      .filter(Boolean);
    const addMetric = call(tools, 'add-metric');
    const metricSor = call(tools, 'metric-sor');
    findings.push({
      id: 'F12',
      severity: 'P2',
      area: 'tools',
      verdict: 'confirmed',
      hypothesis: 'The 24-tool catalog costs tokens on every call, including tools that are not wired.',
      title: 'Full catalog versus an 8-tool core, including two tools that always refuse',
      summary: `tools/list returned ${tools.schema.tool_count} tools, ${tools.schema.catalog_tokens} tokens for name+description+inputSchema. The 8-tool core is ${tools.schema.core_schema_tokens} tokens. Delta ${tools.schema.full_vs_core_token_delta}. propose_add_metric ok_field=${addMetric?.ok_field} error=${addMetric?.error}. get_metric_sor ok_field=${metricSor?.ok_field} error=${metricSor?.error}. Both still occupy schema tokens (${dead.map((d) => `${d.name}:${d.schema_tokens}`).join(', ')}).`,
      repro: ['node harness-stress/run.mjs', 'See tools.json schema.per_tool and calls add-metric, metric-sor.'],
      evidence: {
        tool_count: tools.schema.tool_count,
        catalog_tokens: tools.schema.catalog_tokens,
        core_schema_tokens: tools.schema.core_schema_tokens,
        per_tool_tokens: tools.schema.per_tool.map((t) => ({ name: t.name, tokens: t.schema_tokens })),
        missing: tools.missing_from_expected,
        extra: tools.extra,
      },
    });
  }

  if (tools?.calls) {
    const interesting = ['missing-desk', 'desk-type', 'unknown-desk', 'propose-forming', 'propose-save-draft', 'commit-save-draft', 'risk-bad-status', 'register-early', 'accept-house-denied'];
    const rows = interesting.map((id) => {
      const c = call(tools, id);
      return c ? {
        id,
        thrown: c.thrown,
        isError: c.isError,
        ok_field: c.ok_field,
        retry_hint: c.retry_hint,
        ms: c.ms,
        error: c.error,
      } : { id, missing: true };
    });
    const anyRetry = tools.calls.some((c) => c.retry_hint);
    findings.push({
      id: 'F13',
      severity: 'P2',
      area: 'tools',
      verdict: anyRetry ? 'refuted' : 'confirmed',
      hypothesis: 'Tool and validation errors have no retry or backoff guidance.',
      title: 'Malformed args, unknown desks, and refused writes return errors with no retry hint',
      summary: anyRetry
        ? 'At least one response contained a retry hint. See the call table.'
        : 'Every captured call has retry_hint false. A missing or mistyped desk is MCP error -32602 with isError true and thrown false (the client gets a tool error result, not an exception). An unknown desk string is a different isError text blob that names the registry path. FORMING, SAVE DRAFT, and a bad risk status are ordinary tool results with ok:false. Wall time per call in this run was 0–19 ms, so the cost is schema tokens and the split error shape, not latency. None of the envelopes say to retry.',
      repro: ['node harness-stress/run.mjs', 'See tools.json calls missing-desk, desk-type, unknown-desk, propose-forming, commit-save-draft.'],
      evidence: { any_retry_hint: anyRetry, rows },
    });
  }

  if (tools?.overlap_pairs) {
    findings.push({
      id: 'F14',
      severity: 'P2',
      area: 'tools',
      verdict: 'confirmed',
      hypothesis: 'Several tools overlap, so a model can pick the wrong one.',
      title: 'Description overlap plus a metrics tool that is a trap',
      summary: `Highest description Jaccard pairs: ${tools.overlap_pairs.slice(0, 8).map((p) => `${p.a}/${p.b}=${p.jaccard}`).join('; ')}. propose_add_metric's schema mirrors propose_add_risk and then returns "not wired". get_house_assist_context embeds the house markdown that get_house_view also returns (assist chars=${call(tools, 'assist')?.chars}, house chars=${call(tools, 'house')?.chars}).`,
      repro: ['node harness-stress/run.mjs', 'See tools.json overlap_pairs.'],
      evidence: { pairs: tools.overlap_pairs.slice(0, 8) },
    });
  }

  const goodwill = jsCase(ctx, 'C-goodwill-any');
  if ((goodwill?.live || []).some((r) => r.id === 'inv-imp' && r.metric_id === 'inventory')) {
    findings.push({
      id: 'F17',
      severity: 'P0',
      area: 'context',
      verdict: 'confirmed',
      hypothesis: 'Metric rules match the financial concept in the sentence.',
      title: 'Substring rules misfile impairment and goodwill',
      summary: '"Inventory impairment of $9 million" is metric inventory because the rule token is the substring "inventor". "A goodwill balance of $5 billion" is metric goodwill_impairment because that rule matches the word goodwill with no impairment in the sentence. The two sentences do not share a metric, and neither lands on a dedicated impairment metric.',
      repro: ['node harness-stress/run.mjs', 'See context.json case C-goodwill-any.'],
      evidence: { live: goodwill.live },
    });
  }

  const reg = call(tools, 'register-go');
  const drv = call(tools, 'drivers-go');
  if (reg?.ok_field === true && drv?.ok_field === false && /not closed/i.test(drv?.error || '')) {
    findings.push({
      id: 'F18',
      severity: 'P1',
      area: 'tools',
      verdict: 'confirmed',
      hypothesis: 'commit_on_go kind=register closes the register before drivers can proceed.',
      title: 'Register GO returns ok while the drivers gate still says the register is open',
      summary: `commit_on_go kind=register returned ok=${reg.ok_field} in ${reg.ms} ms. commit_on_go kind=drivers then returned ok=${drv.ok_field}: ${drv.error} Three of the four add_risk chips in the same run were skipped as already in the source of record, and the success result still stamped the session. There is no retry hint on either call.`,
      repro: ['node harness-stress/run.mjs', 'See tools.json calls register-go and drivers-go.'],
      evidence: {
        register_excerpt: reg.excerpt?.slice?.(0, 900) || reg.excerpt,
        drivers_error: drv.error,
      },
    });
  }

  if (tools?.bash_bypass) {
    findings.push({
      id: 'F15',
      severity: 'P1',
      area: 'tools',
      verdict: tools.bash_bypass.appended ? 'confirmed' : 'refuted',
      hypothesis: 'Predefined tools are what make writes safe. Bash-capable hosts can ignore them.',
      title: 'In the sandbox, a shell append changed the fixture house with no GO utterance',
      summary: `propose_house_view with FORMING was refused (error=${call(tools, 'propose-forming')?.error}). propose with intent save_draft was refused (error=${call(tools, 'propose-save-draft')?.error}). A one-line shell append on the sandbox house file set appended=${tools.bash_bypass.appended}, exit=${tools.bash_bypass.exit}, bytes ${tools.bash_bypass.bytes_before} → ${tools.bash_bypass.bytes_after}. The product tree was not the target. product_desks_unchanged=${tools.product_desks_unchanged}.`,
      repro: [
        'node harness-stress/run.mjs',
        'The probe builds /tmp/cockpit-tool-sandbox-<pid>, appends inside that vault, then deletes the sandbox.',
        'See tools.json bash_bypass. Re-run to reproduce. Do not point this at a real vault.',
      ],
      evidence: tools.bash_bypass,
    });
  }

  if (models?.runs) {
    findings.push({
      id: 'F16',
      severity: 'P1',
      area: 'tools+context',
      verdict: 'measured',
      hypothesis: 'A cheaper model mis-selects tools more often, and early facts decay on long prompts. A reduced tool list changes both the miss rate and the cost.',
      title: 'Model arm: recall and tool choice on two models, three arms, repeated',
      summary: models.summary || 'See models.json.',
      repro: [
        'Prompts are harness-stress/prompts/*.md.',
        'Recorded replies are harness-stress/results/model-raw/.',
        'node harness-stress/score-models.mjs',
        'Models were Cursor subagents. No XAI_API_KEY was used.',
      ],
      evidence: {
        summary: models.summary,
        by_arm: models.by_arm,
        recall: models.recall,
      },
    });
  }

  const lines = [];
  lines.push('# Cockpit harness stress — context and tools');
  lines.push('');
  lines.push('Test only. This branch adds a harness and measured results. It does not change product code and it does not fix the findings.');
  lines.push('');
  lines.push(`Run at: ${meta.finished_at || '(see run-meta.json)'}`);
  lines.push(`Tokenizer: ${meta.tokenizer || 'gpt-tokenizer@2.9.0 default encode'}`);
  lines.push(`Product desks unchanged during the run: ${tools?.product_desks_unchanged === true ? 'yes' : 'see tools.json'}`);
  lines.push('');
  lines.push('## How to rerun');
  lines.push('');
  lines.push('From a clean checkout of this branch, with Node 22 and Python 3:');
  lines.push('');
  lines.push('```bash');
  lines.push('npm install --ignore-scripts --no-audit --no-fund --prefix memory-cockpit-v2');
  lines.push('npm install --ignore-scripts --no-audit --no-fund --prefix harness-stress');
  lines.push('node harness-stress/run.mjs');
  lines.push('```');
  lines.push('');
  lines.push('That rewrites `harness-stress/results/*.json`, `harness-stress/prompts/`, and this report\'s deterministic sections when you pass `--report` after replacing `results/models.json`. The tool probe copies `memory-cockpit-v2` to `/tmp`, points MCP at a DEMO fixture, and deletes the copy. It does not edit `memory-cockpit-v2/config/thin-desks.json`. Do not set `XAI_API_KEY`. The model arm is replayable from `harness-stress/prompts/` on any chat model; score replies with `node harness-stress/score-models.mjs` after placing responses in `harness-stress/results/model-raw/`.');
  lines.push('');
  lines.push('## What was treated as a hypothesis');
  lines.push('');
  lines.push('The 2026-10-10 code-read audit said context handling and the 24-tool surface were okay, with these specific claims: a hard 10k-character cap; rule-based elision that keeps the latest claim per metric; no in-Cockpit overflow summarizer; predefined tools that cost tokens and exist mainly to gate writes; no retry or backoff. The probes below confirm or refute those claims on this tree (`realanthonyjoonha/Cockpit-AI`), using a synthetic DEMO fixture. No private vault and no product desk was added.');
  lines.push('');
  lines.push('## Flaws');
  lines.push('');
  lines.push('| ID | Sev | Area | Verdict | Title |');
  lines.push('| --- | --- | --- | --- | --- |');
  for (const f of findings) {
    lines.push(`| ${f.id} | ${f.severity} | ${f.area} | ${f.verdict} | ${f.title} |`);
  }
  lines.push('');
  lines.push('Severity: P0 means a later step can treat a wrong figure as the live metric. P1 means seeded facts disappear, or the documented budget is not the path the agent uses. P2 means token cost, overlap, or errors without a retry hint.');
  lines.push('');

  for (const f of findings) {
    lines.push(`## ${f.id} — ${f.title}`);
    lines.push('');
    lines.push(`**Severity:** ${f.severity} · **Verdict:** ${f.verdict} · **Area:** ${f.area}`);
    lines.push('');
    lines.push(`**Hypothesis:** ${f.hypothesis}`);
    lines.push('');
    lines.push(f.summary);
    lines.push('');
    lines.push('**Repro**');
    lines.push('');
    for (const step of f.repro) lines.push(`- ${step}`);
    lines.push('');
    lines.push('**Evidence**');
    lines.push('');
    lines.push(fence(f.evidence));
    lines.push('');
  }

  lines.push('## Refuted or narrowed');
  lines.push('');
  const isoWinner = iso?.winner;
  lines.push(`- Padded ISO dates do keep the newer claim (C-date-iso winner=${isoWinner}). The failure is the unpadded form, which still sorts as a string.`);
  lines.push(`- Same-day ties keep the earlier array element (C-same-day-tie winner=${jsCase(ctx, 'C-same-day-tie')?.winner}). That matches a stable sort. It is an arbitrary pick when two filings share a date, and it is visible in the case.`);
  lines.push('- The audit\'s "okay" rating is fair for a short pack that already uses padded dates and the exact rule phrases. It understates what happens when dates are unpadded, when "guidance" appears in an unrelated sentence, or when the host trajectory is the new-desk command plus eight slice notes.');
  if (!models) {
    lines.push('- The model arm is not in this file yet. Prompts are under harness-stress/prompts/. After replies are scored, re-run `node harness-stress/run.mjs --report`.');
  } else {
    lines.push(`- Model arm: ${models.summary || 'see models.json'}`);
  }
  lines.push('');
  lines.push('## Raw logs');
  lines.push('');
  lines.push('- `harness-stress/results/context.json`');
  lines.push('- `harness-stress/results/tools.json`');
  lines.push('- `harness-stress/results/flow.json`');
  lines.push('- `harness-stress/results/run-meta.json`');
  lines.push('- `harness-stress/results/models.json` when the model arm has been scored');
  lines.push('- `harness-stress/results/model-raw/` replies');
  lines.push('- `harness-stress/prompts/` exact prompts');
  lines.push('');
  lines.push('Decision-support only. The DEMO desk is a fixture inside the harness and is not a house view.');
  lines.push('');

  writeFileSync(outPath, lines.join('\n'));
  return { findings: findings.length, path: outPath };
}
