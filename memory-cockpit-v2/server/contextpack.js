// contextpack.js — JS mirror of ontology/api/contextpack.py (same JSON rules).
// No writes. Decision-support only.
import { readFileSync } from 'fs';
import path from 'path';

const GRADE_W = { A: 3, B: 2, C: 1 };
const AMOUNT_RE = /\$\s*([\d,]+(?:\.\d+)?)\s*(billion|million|trillion|b|m|k)?/gi;
const PCT_OR_DOLLAR = /\$[\d,]+|\d+(?:\.\d+)?\s*%/;

export function loadContextpackRules(ontologyRoot) {
  const p = path.join(ontologyRoot, 'schema', 'contextpack_metrics.json');
  return JSON.parse(readFileSync(p, 'utf8'));
}

export function classifyMetric(text, rules) {
  const t = String(text || '').toLowerCase();
  for (const rule of rules.metrics || []) {
    const none = (rule.none || []).map((n) => String(n).toLowerCase());
    if (none.some((n) => t.includes(n))) continue;
    if (rule.regex) {
      try {
        if (new RegExp(rule.regex, 'i').test(t)) return rule.id;
      } catch { /* skip bad regex */ }
      continue;
    }
    const alls = (rule.all || []).map((n) => String(n).toLowerCase());
    const anys = (rule.any || []).map((n) => String(n).toLowerCase());
    if (alls.length && !alls.every((a) => t.includes(a))) continue;
    if (anys.length && !anys.some((a) => t.includes(a))) continue;
    if (alls.length || anys.length) return rule.id;
  }
  return null;
}

export function isBoilerplate(text, rules) {
  const t = String(text || '').toLowerCase();
  return (rules.boilerplate || []).some((p) => t.includes(String(p).toLowerCase()));
}

function claimKey(c) {
  return `${c.as_of || ''}|${GRADE_W[c.grade] || 0}`;
}

export function liveClaims(claims, rules, residualCap = 8) {
  const buckets = {};
  const residual = [];
  for (const c of claims || []) {
    const text = c.text || '';
    const mid = classifyMetric(text, rules);
    if (mid) {
      if (!buckets[mid]) buckets[mid] = [];
      buckets[mid].push(c);
    } else if (isBoilerplate(text, rules)) {
      continue;
    } else if (PCT_OR_DOLLAR.test(text)) {
      residual.push(c);
    }
  }
  const live = [];
  for (const [mid, group] of Object.entries(buckets)) {
    const ordered = [...group].sort((a, b) => claimKey(b).localeCompare(claimKey(a)));
    live.push({ ...ordered[0], metric_id: mid });
  }
  residual
    .sort((a, b) => claimKey(b).localeCompare(claimKey(a)))
    .slice(0, residualCap)
    .forEach((c) => live.push({ ...c, metric_id: 'other' }));
  live.sort((a, b) => claimKey(b).localeCompare(claimKey(a)));
  return live;
}

export function assembleAgentPack(store, rules) {
  const live = liveClaims(store.claims || [], rules);
  const pinRisks = (store.risks || []).filter((r) => {
    const st = String(r.status || '').toUpperCase();
    return st === 'WATCH' || st === 'FIRED';
  });
  return {
    schema: 'contextpack.v2',
    intent: 'agent',
    compiled_at: store.compiled_at || null,
    house_prior: store.house_prior || null,
    pin: {
      watch: (store.risk_summary || {}).watch || [],
      fired: (store.risk_summary || {}).fired || [],
      risks: pinRisks.map((r) => ({
        id: r.id,
        name: r.name,
        status: r.status,
        grade: r.grade || null,
        summary: r.summary || '',
      })),
    },
    claims: live.map((c) => ({
      id: c.id,
      metric_id: c.metric_id,
      text: c.text,
      as_of: c.as_of,
      grade: c.grade,
      source_id: c.source_id,
    })),
    store_claims: (store.claims || []).length,
    gaps: store.gaps || [],
    decision_support_only: true,
  };
}
