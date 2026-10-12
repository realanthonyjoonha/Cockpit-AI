import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, reportPath } from './load-config.mjs';
import { isGrok46 } from './models.mjs';

function pct(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return `${(x * 100).toFixed(1)}%`;
}

function num(x, d = 1) {
  if (x == null || Number.isNaN(x)) return '—';
  return Number(x).toFixed(d);
}

function ci(c) {
  if (!c || c.lo == null) return '—';
  return `[${pct(c.lo)}, ${pct(c.hi)}]`;
}

function tok(x) {
  if (x == null || Number.isNaN(x)) return '—';
  return String(Math.round(Number(x)));
}

function plainKeep(armId, d, r, base) {
  if (!d) return 'baseline — every other arm is judged against this.';
  if (d.keep === 'keep' && d.ci_excludes_0) {
    return `KEEP — accuracy moved ${num(d.acc_gap_pts, 1)} pts vs bare+web and the company-clustered 95% CI excludes zero.`;
  }
  if (d.keep === 'keep') {
    return `KEEP — same accuracy as bare+web with at least 20% fewer tokens per correct item.`;
  }
  const dir = (d.acc_gap_pts || 0) > 1 ? 'better on the point estimate' : (d.acc_gap_pts || 0) < -1 ? 'worse on the point estimate' : 'tied on the point estimate';
  return `CUT — ${dir}, but the pre-registered rule did not fire (CI includes 0 or the gap is under 5 pts, and tokens/correct are not 20% cheaper at equal accuracy).`;
}

export function renderReport({
  meta, rollup, spotCheck, quote, calibration, distribution, models, partial,
}, cfg = loadConfig()) {
  const lines = [];
  lines.push('# Cockpit-AI LARGE eval');
  lines.push('');
  lines.push(`**Question:** ${cfg.pilot.question}`);
  lines.push('');
  lines.push('Decision-support only. Synthetic vault only. Product `desks: []` unchanged. No `XAI_API_KEY`. Token counts only — no dollar quotes.');
  lines.push('');
  if (partial) {
    lines.push(`> Partial run: ${partial.reason || 'stopped early'}. Scored ${meta.n_items || 0} items / ${meta.n_traces || 0} traces.`);
    lines.push('');
  }
  lines.push('## Pins');
  lines.push('');
  lines.push(`- git commit: \`${meta.git_commit}\``);
  lines.push(`- companyfacts fetch: \`${meta.fetched_at}\``);
  lines.push(`- subject model: \`${cfg.pilot.models.subject}\` via Cursor`);
  lines.push(`- grader model: \`${cfg.pilot.models.grader}\` via Cursor`);
  lines.push(`- merged: PR #12 drop pre-stuffed background (\`${cfg.pilot.pins.drop_background_ref}\`)`);
  lines.push(`- dropped arms: 0+d / 0+e / 0+f (PRs #8 / #9 closed)`);
  lines.push(`- bundle: \`${cfg.pilot.bundle}\` shard_companies=${cfg.pilot.shard_companies || '—'}`);
  lines.push(`- repeats: ${cfg.pilot.repeats} · pass^k requires ${cfg.pilot.scoring.pass_k} / ${cfg.pilot.repeats}`);
  lines.push('');
  lines.push('## Model id on every call');
  lines.push('');
  const used = models?.models || meta.models || [cfg.pilot.models.subject];
  const graderUsed = models?.grader || cfg.pilot.models.grader;
  const allGrok = (used.length ? used.every(isGrok46) : false) && isGrok46(graderUsed);
  lines.push(`- subject models observed: ${used.length ? used.map((m) => `\`${m}\``).join(', ') : 'none'}`);
  lines.push(`- grader model observed: \`${graderUsed}\``);
  lines.push(`- 100% Cursor Grok 4.6: **${allGrok ? 'YES' : 'NO — FAIL'}**`);
  if (models?.n_traces != null) lines.push(`- traces that logged a model id: ${models.n_traces}`);
  lines.push('');
  lines.push('## Per-arm table');
  lines.push('');
  lines.push('| Arm | Acc | Acc 95% CI | Period-label | Honest-gap | Halluc | Rel pass^k | Tok in/out/cached | Tok/correct | p50/p95 ms | Signal |');
  lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
  for (const arm of cfg.arms) {
    const r = rollup.byArm[arm.id];
    if (!r) continue;
    const sig = arm.id === '0' ? 'baseline' : (rollup.diffs[arm.id]?.keep || 'cut');
    lines.push(`| ${arm.id} | ${pct(r.accuracy)} | ${ci(r.accuracy_ci)} | ${pct(r.period_ok)} | ${pct(r.honest_gap)} | ${pct(r.hallucination)} | ${pct(r.reliability_passk)} | ${tok(r.tokens_in)}/${tok(r.tokens_out)}/${tok(r.tokens_cached)} | ${tok(r.tokens_per_correct)} | ${tok(r.latency_p50)}/${tok(r.latency_p95)} | ${sig} |`);
  }
  lines.push('');
  lines.push('Difference vs 0 counts only if the clustered 95% CI excludes 0 **and** |Δacc| ≥ 5 pts, or tokens/correct are ≥20% cheaper at equal accuracy. Ties = cut.');
  lines.push('');
  lines.push('## Paired diffs vs arm 0');
  lines.push('');
  for (const arm of cfg.arms) {
    if (arm.id === '0') continue;
    const d = rollup.diffs[arm.id];
    if (!d) continue;
    const ratio = d.token_cost_ratio == null ? '—' : num(d.token_cost_ratio, 2);
    lines.push(`- **${arm.id}**: Δacc ${num(d.acc_gap_pts, 1)} pts · CI [${num((d.lo || 0) * 100, 1)}, ${num((d.hi || 0) * 100, 1)}] · tok/correct ratio ${ratio} · **${d.keep}** — ${d.reason}`);
  }
  lines.push('');
  const anyKeep = Object.values(rollup.diffs || {}).some((d) => d.keep === 'keep');
  if (!anyKeep) {
    lines.push('**No arm separated from 0 under the pre-registered rule.**');
    lines.push('');
  }
  lines.push('## Keep / cut (plain language)');
  lines.push('');
  for (const arm of cfg.arms) {
    const d = rollup.diffs[arm.id];
    const r = rollup.byArm[arm.id];
    const base = rollup.byArm['0'];
    lines.push(`- **${arm.id}** (${arm.label}): ${plainKeep(arm.id, d, r, base)}`);
  }
  lines.push('');
  lines.push('## Reading');
  lines.push('');
  const a = rollup.byArm['0+a'];
  const b = rollup.byArm['0+b'];
  const c = rollup.byArm['0+c'];
  const f = rollup.byArm['full'];
  const base = rollup.byArm['0'];
  const da = rollup.diffs['0+a'];
  const db = rollup.diffs['0+b'];
  const dc = rollup.diffs['0+c'];
  const df = rollup.diffs['full'];
  if (base) {
    lines.push(`Arm 0 (bare Grok 4.6 + web) accuracy ${pct(base.accuracy)}, honest-gap ${pct(base.honest_gap)}, hallucination ${pct(base.hallucination)}, period-label ${pct(base.period_ok)}.`);
  }
  if (a && da) {
    lines.push(`- **0+a** tagged companyfacts: ${da.acc_gap_pts >= 0 ? '+' : ''}${num(da.acc_gap_pts, 1)} pts · ${da.keep}. Hallucination ${pct(a.hallucination)} vs ${pct(base?.hallucination)}.`);
  }
  if (b && db) {
    lines.push(`- **0+b** synthetic vault (opinion/risk, no figures): ${db.acc_gap_pts >= 0 ? '+' : ''}${num(db.acc_gap_pts, 1)} pts · ${db.keep}.`);
  }
  if (c && dc) {
    lines.push(`- **0+c** guardrails (GO gates, 10k cap, empty-when-unsure): ${dc.acc_gap_pts >= 0 ? '+' : ''}${num(dc.acc_gap_pts, 1)} pts · ${dc.keep}.`);
  }
  if (f && df) {
    lines.push(`- **full** current harness (facts + vault + guardrails, no pre-stuffed background): ${df.acc_gap_pts >= 0 ? '+' : ''}${num(df.acc_gap_pts, 1)} pts · ${df.keep}.`);
  }
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
  lines.push('## Grader calibration');
  lines.push('');
  if (!calibration) {
    lines.push('No calibration grades yet.');
  } else {
    lines.push(`- Result: **${calibration.ok ? 'PASS — seeded-bad separated from good' : 'FAIL — grader could not separate seeded-bad from good'}**`);
    lines.push(`- max(seeded-bad) = ${calibration.max_bad ?? '—'} · min(seeded-good) = ${calibration.min_good ?? '—'}`);
    lines.push(`- Grader model: \`${graderUsed}\``);
    lines.push('');
    lines.push('| cal_id | kind | rubric | pass | reason | cite |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const row of calibration.rows || []) {
      lines.push(`| ${row.cal_id} | ${row.kind} | ${row.rubric ?? '—'} | ${row.pass ? 'yes' : 'no'} | ${row.reason || ''} | ${(row.cite || '').replace(/\|/g, '/').slice(0, 80)} |`);
    }
    if (calibration.failures?.length && !calibration.ok) {
      lines.push('');
      lines.push('Failures:');
      for (const frow of calibration.failures) {
        lines.push(`- ${frow.cal_id}: ${frow.reason}`);
      }
    }
  }
  lines.push('');
  lines.push('## Grader score distribution (live open items)');
  lines.push('');
  if (!distribution || !distribution.n) {
    lines.push('No live open-ended grades yet.');
  } else {
    lines.push(`n = ${distribution.n}`);
    lines.push('');
    lines.push('| score | count | share |');
    lines.push('| --- | --- | --- |');
    for (const s of [1, 2, 3, 4, 5]) {
      const n = distribution.buckets?.[s] || 0;
      lines.push(`| ${s} | ${n} | ${pct(distribution.n ? n / distribution.n : 0)} |`);
    }
  }
  lines.push('');
  lines.push('## 24-item spot-check list');
  lines.push('');
  if (!spotCheck?.length) {
    lines.push('No open-ended sample marked yet.');
  } else {
    lines.push('| id | company | question | arm (hidden in grader file) | rubric | mark |');
    lines.push('| --- | --- | --- | --- | --- | --- |');
    for (const row of spotCheck.slice(0, 24)) {
      lines.push(`| ${row.item_id}#${row.repeat} | ${row.company_id} | ${row.question_id} | ${row.arm} | ${row.rubric ?? '—'} | ${row.mark} |`);
    }
  }
  lines.push('');
  lines.push('## Volume');
  lines.push('');
  lines.push(`- Traces: ${meta.n_traces ?? '—'}`);
  lines.push(`- Items scored: ${meta.n_items ?? '—'}`);
  if (quote?.tokens_in != null) {
    lines.push(`- Subject tokens in/out/cached (sum): ${tok(quote.tokens_in)}/${tok(quote.tokens_out)}/${tok(quote.tokens_cached)}`);
  }
  lines.push('- Dollar estimates are omitted on purpose. Report token counts only.');
  lines.push('');
  lines.push('## How to rerun');
  lines.push('');
  lines.push('```bash');
  lines.push('npm install --ignore-scripts --no-audit --no-fund --prefix eval');
  lines.push('node eval/run.mjs --self-test');
  lines.push('node eval/run.mjs --prepare   # live SEC companyfacts, contact UA, ≤10 req/s');
  lines.push('node eval/run.mjs --score --report');
  lines.push('```');
  lines.push('');
  lines.push('Cursor Grok 4.6 traces go in gitignored `eval/results/traces/`. Answer keys stay in `eval/results/keys/` — never give that path to the subject model.');
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
