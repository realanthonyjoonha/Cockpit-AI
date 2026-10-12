function mean(xs) {
  if (!xs.length) return null;
  return xs.reduce((a, b) => a + b, 0) / xs.length;
}

function quantile(sorted, p) {
  if (!sorted.length) return null;
  const idx = (sorted.length - 1) * p;
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] * (hi - idx) + sorted[hi] * (idx - lo);
}

export function bootstrapMeanCI(values, { draws = 2000, ci = 0.95, rng = Math.random } = {}) {
  if (!values.length) return { mean: null, lo: null, hi: null, n: 0 };
  const means = [];
  for (let i = 0; i < draws; i += 1) {
    let s = 0;
    for (let j = 0; j < values.length; j += 1) {
      s += values[Math.floor(rng() * values.length)];
    }
    means.push(s / values.length);
  }
  means.sort((a, b) => a - b);
  const a = (1 - ci) / 2;
  return { mean: mean(values), lo: quantile(means, a), hi: quantile(means, 1 - a), n: values.length };
}

export function clusterBy(rows, key) {
  const map = new Map();
  for (const row of rows) {
    const k = row[key];
    if (!map.has(k)) map.set(k, []);
    map.get(k).push(row);
  }
  return map;
}

/** Clustered bootstrap on (treat - base) after pairing by task_id. */
export function pairedClusterDiff(pairs, { draws = 2000, ci = 0.95, cluster = 'company_id', rng = Math.random } = {}) {
  const clusters = [...clusterBy(pairs, cluster).values()];
  if (!clusters.length) return { mean: null, lo: null, hi: null, n: 0 };
  const diffs = [];
  for (let i = 0; i < draws; i += 1) {
    const sample = [];
    for (let j = 0; j < clusters.length; j += 1) {
      sample.push(...clusters[Math.floor(rng() * clusters.length)]);
    }
    diffs.push(mean(sample.map((p) => p.treat - p.base)));
  }
  diffs.sort((a, b) => a - b);
  const a = (1 - ci) / 2;
  return {
    mean: mean(pairs.map((p) => p.treat - p.base)),
    lo: quantile(diffs, a),
    hi: quantile(diffs, 1 - a),
    n: pairs.length,
    clusters: clusters.length,
  };
}

export function passK(repeats, k) {
  if (!repeats.length) return 0;
  return repeats.every((r) => r === 1) && repeats.length >= k ? 1 : 0;
}

export function rollup(scoredItems, traces, cfg) {
  const scoring = cfg.pilot.scoring;
  const byArm = {};
  for (const arm of cfg.arms) {
    const rows = scoredItems.filter((r) => r.arm === arm.id);
    const acc = rows.map((r) => r.accuracy);
    const gap = rows.map((r) => r.honest_gap);
    const hallu = rows.map((r) => r.hallucination);
    const period = rows.filter((r) => ['latest_quarter', 'ytd_vs_quarter', 'yoy'].includes(r.question_id)).map((r) => r.period_ok);
    const go = rows.map((r) => r.go_violation);
    const tags = {};
    for (const row of rows) {
      for (const t of row.failure_tags || []) tags[t] = (tags[t] || 0) + 1;
    }
    const taskGroups = clusterBy(rows, 'item_id');
    const reliabilities = [];
    for (const group of taskGroups.values()) {
      reliabilities.push(passK(group.map((g) => g.accuracy), scoring.pass_k));
    }
    const armTraces = traces.filter((t) => t.arm === arm.id);
    const tokIn = mean(armTraces.map((t) => t.prompt_tokens || 0));
    const tokOut = mean(armTraces.map((t) => t.completion_tokens || 0));
    const tokCached = mean(armTraces.map((t) => t.cached_tokens || 0));
    const tokTools = mean(armTraces.map((t) => t.tool_def_tokens || 0));
    const lat = armTraces.map((t) => t.latency_ms || 0).filter((n) => n > 0).sort((a, b) => a - b);
    const tokensTotal = armTraces.reduce((s, t) => s + (t.prompt_tokens || 0) + (t.completion_tokens || 0), 0);
    const correct = acc.reduce((s, n) => s + n, 0);
    byArm[arm.id] = {
      arm: arm.id,
      label: arm.label,
      n: rows.length,
      accuracy: mean(acc),
      accuracy_ci: bootstrapMeanCI(acc, { draws: scoring.bootstrap_draws }),
      honest_gap: mean(gap),
      hallucination: mean(hallu),
      period_ok: mean(period),
      go_violations: go.reduce((s, n) => s + n, 0),
      reliability_passk: mean(reliabilities),
      tokens_in: tokIn,
      tokens_out: tokOut,
      tokens_cached: tokCached,
      tokens_tool_def: tokTools,
      tokens_total: tokensTotal,
      tokens_per_correct: correct ? tokensTotal / correct : null,
      latency_p50: lat.length ? quantile(lat, 0.5) : null,
      latency_p95: lat.length ? quantile(lat, 0.95) : null,
      models: [...new Set(armTraces.map((t) => t.model).filter(Boolean))],
      failure_tags: Object.entries(tags).sort((a, b) => b[1] - a[1]),
    };
  }
  const diffs = {};
  const baseline = (cfg.arms.some((a) => a.id === '0') ? '0' : cfg.arms[0]?.id) || '0';
  const baseRows = scoredItems.filter((r) => r.arm === baseline);
  const baseByTask = new Map();
  for (const [task, group] of clusterBy(baseRows, 'item_id')) {
    baseByTask.set(task, mean(group.map((g) => g.accuracy)));
  }
  for (const arm of cfg.arms) {
    if (arm.id === baseline) continue;
    const rows = scoredItems.filter((r) => r.arm === arm.id);
    const pairs = [];
    for (const [task, group] of clusterBy(rows, 'item_id')) {
      if (!baseByTask.has(task)) continue;
      pairs.push({
        item_id: task,
        company_id: group[0].company_id,
        base: baseByTask.get(task),
        treat: mean(group.map((g) => g.accuracy)),
      });
    }
    const diff = pairedClusterDiff(pairs, {
      draws: scoring.bootstrap_draws,
      cluster: scoring.cluster_by,
    });
    const accGapPts = (diff.mean || 0) * 100;
    const excludes0 = diff.lo != null && diff.hi != null && (diff.lo > 0 || diff.hi < 0);
    const bigEnough = Math.abs(accGapPts) >= scoring.keep_min_accuracy_pts;
    const baseTok = byArm[baseline]?.tokens_per_correct;
    const armTok = byArm[arm.id]?.tokens_per_correct;
    const equalAcc = byArm[arm.id].accuracy >= ((byArm[baseline]?.accuracy) || 0) - 1e-9;
    const costRatio = (baseTok && armTok && equalAcc) ? armTok / baseTok : null;
    const costSignal = costRatio != null && costRatio <= (1 / scoring.keep_min_cost_ratio);
    const keep = (excludes0 && bigEnough) || costSignal;
    diffs[arm.id] = {
      ...diff,
      acc_gap_pts: accGapPts,
      ci_excludes_0: excludes0,
      token_cost_ratio: costRatio,
      keep: keep ? 'keep' : 'cut',
      reason: keep
        ? (excludes0 && bigEnough
          ? `CI excludes 0 and |Δacc|=${accGapPts.toFixed(1)} pts`
          : '≥20% fewer tokens/correct at equal accuracy')
        : 'tie / no material separation from 0',
    };
  }
  return { byArm, diffs };
}

export function estimateCost(promptTokens, completionTokens, cachedTokens, pricing, kind = 'subject') {
  const inp = kind === 'grader' ? pricing.grader_input_per_m : pricing.subject_input_per_m;
  const out = kind === 'grader' ? pricing.grader_output_per_m : pricing.subject_output_per_m;
  const cached = pricing.subject_cached_per_m;
  return ((promptTokens - (cachedTokens || 0)) / 1e6) * inp
    + ((cachedTokens || 0) / 1e6) * cached
    + (completionTokens / 1e6) * out;
}
