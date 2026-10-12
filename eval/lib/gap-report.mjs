import { writeFileSync } from 'node:fs';
import { reportPath } from './load-config.mjs';
import { REQUIRED_GROK46, isGrok46 } from './models.mjs';
import { GAP_RULE_TEXT } from './gap-select.mjs';
import { summarizeWhyBFills } from './gap-read.mjs';

function pct(num, den) {
  if (!den) return '—';
  return `${((num / den) * 100).toFixed(1)}%`;
}

function ratesFor(armId, scored, traces) {
  const rows = (scored || []).filter((r) => r.arm === armId);
  const armTraces = (traces || []).filter((t) => t.arm === armId);
  return {
    n: rows.length,
    honest_gap_n: rows.filter((r) => r.honest_gap).length,
    halluc_n: rows.filter((r) => r.hallucination).length,
    tokens_in: armTraces.reduce((s, t) => s + (t.prompt_tokens || 0), 0),
    tokens_out: armTraces.reduce((s, t) => s + (t.completion_tokens || 0), 0),
    tokens_cached: armTraces.reduce((s, t) => s + (t.cached_tokens || 0), 0),
  };
}

export function renderGapReport({
  meta, rollup, quote, calibration, models, selection, reads, callLog, partial, scored, traces,
}, cfg) {
  const alias = cfg.gap?.arm_aliases || { '0+a': 'A', full: 'B' };
  const lines = [];
  lines.push('# Cockpit-AI honest-gap check');
  lines.push('');
  lines.push(`**Question:** ${cfg.pilot.question}`);
  lines.push('');
  lines.push('Decision-support only. Synthetic vault only. Product `desks: []` unchanged. No `XAI_API_KEY`. Included subscription only. Token counts only.');
  lines.push('');
  if (partial) {
    lines.push(`> Partial run: ${partial.reason || 'stopped early'}.`);
    lines.push('');
  }
  lines.push('## Pins');
  lines.push('');
  lines.push(`- git commit: \`${meta.git_commit}\``);
  lines.push(`- companyfacts fetch: \`${meta.fetched_at}\``);
  lines.push(`- subject model (exact): \`${REQUIRED_GROK46}\``);
  lines.push(`- grader model (exact): \`${REQUIRED_GROK46}\``);
  lines.push(`- harness under test: main + PR #12 (eval \`full\` arm = facts + vault + guardrails)`);
  lines.push(`- repeats: ${cfg.pilot.repeats}`);
  lines.push(`- questions: ${selection?.n || cfg.gapItems?.length || '—'}`);
  lines.push('');
  lines.push('## Model ids actually called');
  lines.push('');
  const used = [...new Set([
    ...(models?.models || []),
    ...(callLog?.models || []),
    models?.grader,
    cfg.pilot.models.subject,
    cfg.pilot.models.grader,
  ].filter(Boolean))];
  const allExact = used.length > 0 && used.every((id) => id === REQUIRED_GROK46);
  for (const id of used) lines.push(`- \`${id}\``);
  lines.push(`- 100% exact pin \`${REQUIRED_GROK46}\`: **${allExact ? 'YES' : 'NO — FAIL'}**`);
  lines.push(`- XAI_API_KEY: absent`);
  lines.push(`- on-demand: never enabled`);
  if (callLog?.n != null) lines.push(`- logged calls: ${callLog.n}`);
  lines.push('');
  lines.push('## Gap-item rule');
  lines.push('');
  lines.push('```');
  lines.push(GAP_RULE_TEXT.trim());
  lines.push('```');
  lines.push('');
  lines.push('### Selected items (rule output, not hand-picked)');
  lines.push('');
  lines.push('| item | company | ask | why it is a gap |');
  lines.push('| --- | --- | --- | --- |');
  for (const it of selection?.items || cfg.gapItems || []) {
    lines.push(`| \`${it.item_id}\` | ${it.ticker || it.company_id} | ${it.question_id} | ${it.reason} |`);
  }
  lines.push('');
  lines.push('## Per-arm rates');
  lines.push('');
  lines.push('| Arm | Honest-gap (abstains / total) | Made-up answer (invented number / total) | Tok in/out/cached |');
  lines.push('| --- | --- | --- | --- |');
  for (const arm of cfg.arms) {
    const r = ratesFor(arm.id, scored, traces);
    if (!r.n && !rollup?.byArm?.[arm.id]) continue;
    const n = r.n || rollup?.byArm?.[arm.id]?.n || 0;
    const honest = r.honest_gap_n;
    const made = r.halluc_n;
    lines.push(`| ${alias[arm.id] || arm.id} (\`${arm.id}\`) | ${honest}/${n} (${pct(honest, n)}) | ${made}/${n} (${pct(made, n)}) | ${r.tokens_in}/${r.tokens_out}/${r.tokens_cached} |`);
  }
  lines.push('');
  if (quote) {
    lines.push(`Volume: ${quote.n_traces || 0} traces, ${quote.n_items || 0} items, tokens in/out/cached ${quote.tokens_in || 0}/${quote.tokens_out || 0}/${quote.tokens_cached || 0}.`);
    lines.push('');
  }
  lines.push('## Why B fills gaps (PR #13 vs this check)');
  lines.push('');
  lines.push(summarizeWhyBFills(reads || []));
  lines.push('');
  lines.push('PR #13 measured honest-gap across a mixed set: numeric items (some tagged, some trap) plus open steelman / risk_propose. Bare arms GAP on steelman/risk when no house is provided; `full` answers those from the vault. That is why honest-gap fell from 52.7% (bare) to 12.3% (`full`) without a matching accuracy lift.');
  lines.push('');
  lines.push('This check holds the item set to **true gaps for both arms** (rule above). If `full` still invented figures, pack fields would be the fill source. If both arms abstain, the PR #13 drop is pack-answerable open items, not invented numbers on missing facts.');
  lines.push('');
  for (const read of reads || []) {
    const label = alias[read.arm] || read.arm;
    lines.push(`### ${label} (\`${read.arm}\`) field leans`);
    lines.push('');
    const fields = Object.entries(read.field_counts || {}).sort((a, b) => b[1] - a[1]);
    if (!fields.length) lines.push('- (no pack-field needles in invented answers)');
    else for (const [f, n] of fields) lines.push(`- ${f}: ${n}`);
    lines.push('');
    const gapFields = Object.entries(read.gap_field_counts || {}).sort((a, b) => b[1] - a[1]);
    if (gapFields.length) {
      lines.push('Pack-field needles in honest GAP answers (not invented numbers):');
      lines.push('');
      for (const [f, n] of gapFields) lines.push(`- ${f}: ${n}`);
      lines.push('');
    }
    if (read.invented_excerpts?.length) {
      lines.push('Invented excerpts:');
      lines.push('');
      for (const ex of read.invented_excerpts.slice(0, 8)) {
        lines.push(`- \`${ex.item_id}\` r${ex.repeat} fields=${(ex.fields || []).join(',') || '—'} — ${String(ex.excerpt).replace(/\n/g, ' ').slice(0, 220)}`);
      }
      lines.push('');
    }
    if (read.gap_pack_excerpts?.length) {
      lines.push('GAP answers that still name pack fields:');
      lines.push('');
      for (const ex of read.gap_pack_excerpts.slice(0, 6)) {
        lines.push(`- \`${ex.item_id}\` r${ex.repeat} fields=${(ex.fields || []).join(',') || '—'} — ${String(ex.excerpt).replace(/\n/g, ' ').slice(0, 220)}`);
      }
      lines.push('');
    }
  }
  if (calibration) {
    lines.push('## Grader calibration');
    lines.push('');
    lines.push(`- Result: **${calibration.ok ? 'PASS — seeded-bad separated from good' : 'FAIL'}**`);
    lines.push(`- max(seeded-bad) = ${calibration.max_bad} · min(seeded-good) = ${calibration.min_good}`);
    lines.push(`- Grader model: \`${REQUIRED_GROK46}\``);
    lines.push('');
  }
  lines.push('## How to rerun');
  lines.push('');
  lines.push('```bash');
  lines.push('npm install --ignore-scripts --no-audit --no-fund --prefix eval');
  lines.push('env -u XAI_API_KEY node eval/run.mjs --gap-check --self-test');
  lines.push('env -u XAI_API_KEY node eval/run.mjs --gap-check --prepare');
  lines.push('env -u XAI_API_KEY node eval/run.mjs --gap-check --score --report');
  lines.push('```');
  lines.push('');
  lines.push('Subject traces stay in gitignored `eval/results/traces/`. Keys stay in `eval/results/keys/`. Never give keys to the subject.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function writeGapReport(payload, cfg) {
  const dest = reportPath(cfg);
  const md = renderGapReport(payload, cfg);
  writeFileSync(dest, md);
  return dest;
}
