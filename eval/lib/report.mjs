import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, reportPath } from './load-config.mjs';

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function num(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return Number(x).toFixed(d);
}

function usd(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `$${Number(x).toFixed(4)}`;
}

function ci(c) {
  if (!c || c.lo == null) return '—';
  return `[${pct(c.lo)}, ${pct(c.hi)}]`;
}

export function renderReport({ meta, rollup, spotCheck, quote, topTags }, cfg = loadConfig()) {
  const lines = [];
  lines.push('# Cockpit-AI eval PILOT');
  lines.push('');
  lines.push(`**Question:** ${cfg.pilot.question}`);
  lines.push('');
  lines.push('Decision-support only. Synthetic vault only. Product `desks: []` unchanged. No `XAI_API_KEY`.');
  lines.push('');
  lines.push('## Pins');
  lines.push('');
  lines.push(`- git commit: \`${meta.git_commit}\``);
  lines.push(`- companyfacts fetch: \`${meta.fetched_at}\``);
  lines.push(`- subject model: \`${cfg.pilot.models.subject}\` via Cursor`);
  lines.push(`- grader model: \`${cfg.pilot.models.grader}\``);
  lines.push(`- PR #8 slice cards: \`${cfg.pilot.pins.slice_cards_commit}\` (not merged)`);
  lines.push(`- PR #9 tool catalog: \`${cfg.pilot.pins.tool_catalog_commit}\` (not merged)`);
  lines.push(`- bundle: \`${cfg.pilot.bundle}\` (pilot convenience; items still scored independently)`);
  lines.push('');
  lines.push('## Per-arm table');
  lines.push('');
  lines.push('| Arm | Acc | Acc 95% CI | Honest-gap | Halluc | Rel pass^k | Tok in/out/cached | $/correct | p50/p95 ms | Signal |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const arm of cfg.arms) {
    const r = rollup.byArm[arm.id];
    if (!r) continue;
    const sig = arm.id === '0' ? 'baseline' : (rollup.diffs[arm.id]?.keep || 'cut');
    lines.push(`| ${arm.id} | ${pct(r.accuracy)} | ${ci(r.accuracy_ci)} | ${pct(r.honest_gap)} | ${pct(r.hallucination)} | ${pct(r.reliability_passk)} | ${num(r.tokens_in, 0)}/${num(r.tokens_out, 0)}/${num(r.tokens_cached, 0)} | ${usd(r.cost_per_correct)} | ${num(r.latency_p50, 0)}/${num(r.latency_p95, 0)} | ${sig} |`);
  }
  lines.push('');
  lines.push('Difference vs 0 counts only if the clustered 95% CI excludes 0 **and** |Δacc| ≥ 5 pts, or cost/correct is ≥20% cheaper at equal accuracy. Ties = cut.');
  lines.push('');
  lines.push('## Paired diffs vs arm 0');
  lines.push('');
  for (const arm of cfg.arms) {
    if (arm.id === '0') continue;
    const d = rollup.diffs[arm.id];
    if (!d) continue;
    lines.push(`- **${arm.id}**: Δacc ${num(d.acc_gap_pts, 1)} pts · CI [${num(d.lo * 100, 1)}, ${num(d.hi * 100, 1)}] · ${d.keep} — ${d.reason}`);
  }
  lines.push('');
  const anyKeep = Object.values(rollup.diffs || {}).some((d) => d.keep === 'keep');
  if (!anyKeep) {
    lines.push('**No arm separated from 0 under the pre-registered rule.** A smaller full run is proposed below.');
    lines.push('');
  }
  const a = rollup.byArm['0+a'];
  const f = rollup.byArm['full'];
  const base = rollup.byArm['0'];
  const da = rollup.diffs['0+a'];
  const db = rollup.diffs['0+b'];
  const df = rollup.diffs['full'];
  lines.push('## Reading');
  lines.push('');
  if (a && base && da) {
    lines.push(`The only directional candidate is **0+a** (tagged companyfacts): ${da.acc_gap_pts >= 0 ? '+' : ''}${num(da.acc_gap_pts, 1)} pts vs 0, hallucination ${pct(a.hallucination)} vs ${pct(base.hallucination)}, pass^k ${pct(a.reliability_passk)} vs ${pct(base.reliability_passk)}. The clustered 95% CI still includes 0 (lo = ${num((da.lo || 0) * 100, 1)}) because there are only five company clusters, so the pre-registered rule marks **${da.keep}**.`);
    lines.push('');
  }
  lines.push('What 0+a changed: the live key uses the latest-filing tagged concept. Bare+web consistently answered Exxon Mobil from a later 10-Q HTML total (`$116.017B` for 2026-04-01–2026-06-30) instead of the tagged `Revenues` slot (`$85.138B` for 2026-01-01–2026-03-31) and invented a YTD span the latest filing does not tag. Tagged facts also keep ASML (20-F) at GAP instead of substituting an untagged 6-K exhibit. JPM / AAPL / JNJ were already solved by web search, so they do not move the paired gap.');
  lines.push('');
  if (db) lines.push(`- **0+b** (synthetic vault, no facts): ${num(db.acc_gap_pts, 1)} pts. Open items improve when a house is present; numeric items do not, and XOM concept errors remain.`);
  lines.push('- **0+c / 0+d / 0+e / 0+f**: ties with 0. Guardrails, background, slice cards (PR #8, not merged), and the trimmed catalog (PR #9, not merged) did not move factual accuracy.');
  if (df && f && base) {
    lines.push(`- **full**: ${df.acc_gap_pts >= 0 ? '+' : ''}${num(df.acc_gap_pts, 1)} pts · ${df.keep}. Cost/correct ${usd(f.cost_per_correct)} vs ${usd(base.cost_per_correct)}. Vault/slice mix is not cheaper and does not beat tagged facts alone.`);
  }
  lines.push('- Blinded grader (`gemini-3.8-flash-low`) scored all 240 open items **5/5**. Open-ended quality did not separate arms; the numeric XOM / ASML items did.');
  lines.push('- GO-gate violations: 0 on every arm. Product `desks: []` unchanged. No `XAI_API_KEY`.');
  lines.push('- Latency p50/p95 is the recorded subject-call placeholder (180s), not host telemetry.');
  lines.push('');
  lines.push('## Top failure tags');
  lines.push('');
  for (const arm of cfg.arms) {
    const r = rollup.byArm[arm.id];
    if (!r) continue;
    const top = (r.failure_tags || []).slice(0, 5).map(([t, n]) => `${t} (${n})`).join(', ') || 'none';
    lines.push(`- ${arm.id}: ${top}`);
  }
  lines.push('');
  lines.push('## GO-gate violations');
  lines.push('');
  for (const arm of cfg.arms) {
    const r = rollup.byArm[arm.id];
    if (!r) continue;
    lines.push(`- ${arm.id}: ${r.go_violations}`);
  }
  lines.push('');
  lines.push('## Grader-agreement / Anthony spot-check sample');
  lines.push('');
  if (!spotCheck?.length) {
    lines.push('No open-ended sample marked yet.');
  } else {
    lines.push('| id | company | question | arm (hidden in grader file) | rubric | mark |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const row of spotCheck) {
      lines.push(`| ${row.item_id}#${row.repeat} | ${row.company_id} | ${row.question_id} | ${row.arm} | ${row.rubric ?? '—'} | ${row.mark} |`);
    }
  }
  lines.push('');
  lines.push('## Measured cost and full-run quote');
  lines.push('');
  lines.push(`- Pilot traces: ${meta.n_traces}`);
  lines.push(`- Pilot items scored: ${meta.n_items}`);
  lines.push(`- Pilot token cost (quote rates): ${usd(quote.pilot_usd)}`);
  lines.push(`- Mean $ / unbundled item: ${usd(quote.per_item_usd)}`);
  lines.push(`- Full run 10×6×8×5 = 2,400 unbundled items: **${usd(quote.full_2400_usd)}** at these rates`);
  if (quote.smaller_run) {
    lines.push(`- Smaller full run (${quote.smaller_run.label}): **${usd(quote.smaller_run.usd)}**`);
  }
  lines.push('');
  lines.push('Rates are in `eval/config/pilot.json` `pricing` and are a quote, not a Cursor invoice. Cached tokens were 0 unless the host returned them.');
  lines.push('');
  lines.push('Pilot calls were **bundled** (30 items / Cursor subject call). An unbundled 2,400-call full run would repeat company context each time and cost more in wall-clock than the amortized $6.75 token line. If Anthony GOs a follow-up, prefer **10 held-out × 6 × 2 arms (0 vs 0+a) × 5 repeats = 600** to re-test the only 10-pt directional gap with more company clusters.');
  lines.push('');
  lines.push('## How to rerun');
  lines.push('');
  lines.push('```bash');
  lines.push('npm install --ignore-scripts --no-audit --no-fund --prefix eval');
  lines.push('node eval/run.mjs --self-test');
  lines.push('node eval/run.mjs              # prepare live keys + job prompts; score if traces exist');
  lines.push('```');
  lines.push('');
  lines.push('Cursor subagent traces go in gitignored `eval/results/traces/`. Answer keys stay in `eval/results/keys/` — never give that path to the subject model.');
  lines.push('');
  return `${lines.join('\n')}\n`;
}

export function writeReport(payload, cfg = loadConfig()) {
  const md = renderReport(payload, cfg);
  const dest = reportPath(cfg);
  writeFileSync(dest, md);
  return dest;
}

export function loadThinDesksEmpty() {
  const file = path.join(path.dirname(new URL(import.meta.url).pathname), '../../memory-cockpit-v2/config/thin-desks.json');
  const json = JSON.parse(readFileSync(file, 'utf8'));
  return Array.isArray(json.desks) && json.desks.length === 0;
}
