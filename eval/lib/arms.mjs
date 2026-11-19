import { checkSliceCard } from '../vendor/slice-card-check.mjs';
import { countTokens } from '../vendor/tokens.mjs';
import { loadConfig } from './load-config.mjs';

function capText(text, limit, label) {
  const body = String(text || '');
  if (!limit || body.length <= limit) return { text: body, capped: false, omitted: 0 };
  const keep = Math.max(0, limit - 80);
  const cut = body.lastIndexOf('\n', keep);
  const head = body.slice(0, cut > 0 ? cut : keep);
  const omitted = body.length - head.length;
  return {
    text: `${head}\n\n[GAP: ${label} truncated; ${omitted} characters omitted. Empty-when-unsure.]\n`,
    capped: true,
    omitted,
  };
}

export function deskFor(company, cfg = loadConfig()) {
  return cfg.desks.desks[company.id] || null;
}

export function sliceCardsOk(company, cfg = loadConfig()) {
  const desk = deskFor(company, cfg);
  if (!desk) return { ok: false, errors: ['no synthetic desk'] };
  const cards = [];
  for (const card of desk.slices || []) {
    const checked = checkSliceCard(card);
    cards.push({ ...checked, text: card });
  }
  return { ok: cards.every((c) => c.ok), cards };
}

export function buildContext(arm, company, companyKey, cfg = loadConfig()) {
  const desk = deskFor(company, cfg);
  const inject = new Set(arm.inject || []);
  const parts = [];
  const meta = { arm: arm.id, injections: [...inject], slice_ok: null, tool_def_tokens: 0, capped: false };

  if (inject.has('guardrails')) {
    parts.push(`## Guardrails\n${cfg.pilot.guardrails}`);
  }
  if (inject.has('facts')) {
    const block = companyKey?.facts_text
      ? `## Tagged SEC companyfacts (latest filing ${companyKey.latest_accession || '?'})\nThese are tagged numbers from companyfacts, not a house view.\n\n${companyKey.facts_text}`
      : '## Tagged SEC companyfacts\nGAP: no tagged slots for this issuer.';
    parts.push(block);
  }
  if (inject.has('vault') && desk) {
    parts.push(`## Synthetic vault (NOT a real house)\n${desk.house}\n\n${desk.risks}\n\n## Notes\n${desk.notes}`);
  } else if (inject.has('vault')) {
    parts.push('## Synthetic vault\nGAP: no fixture desk.');
  }
  if (inject.has('background') && desk) {
    parts.push(`## Pre-stuffed background\n${desk.background}`);
  }
  if (inject.has('slices') && desk) {
    const checked = sliceCardsOk(company, cfg);
    meta.slice_ok = checked.ok;
    const body = (desk.slices || []).join('\n\n');
    parts.push(`## Step summaries (slice cards from PR #8 pin ${cfg.pilot.pins.slice_cards_commit.slice(0, 7)}; not merged)\nCard paths:\n- raw/${desk.slug}-research/slices/01.md\n- raw/${desk.slug}-research/slices/02.md\n\n${body}`);
  }
  if (inject.has('tools_core')) {
    const catalog = JSON.stringify(cfg.coreTools.tools, null, 2);
    meta.tool_def_tokens = countTokens(catalog);
    parts.push(`## Trimmed tool catalog (PR #9 pin ${cfg.pilot.pins.tool_catalog_commit.slice(0, 7)}; not merged)\nYou may name a tool. You cannot execute MCP writes. Metric tools are removed.\n${catalog}`);
  }

  let text = parts.filter(Boolean).join('\n\n');
  if (arm.cap_chars) {
    const capped = capText(text, arm.cap_chars, 'retrieved context');
    text = capped.text;
    meta.capped = capped.capped;
    meta.omitted_chars = capped.omitted;
  }
  return { text, meta };
}

export function renderQuestion(q, company, metricId, cfg = loadConfig()) {
  const label = cfg.questions.metric_labels[metricId] || metricId;
  return q.text
    .replaceAll('{name}', company.name)
    .replaceAll('{ticker}', company.ticker)
    .replaceAll('{metric_label}', label)
    .replaceAll('{trap_label}', cfg.questions.trap_label);
}

export function enumerateTasks(cfg = loadConfig()) {
  const tasks = [];
  for (const company of cfg.companies) {
    for (const q of cfg.questions.questions) {
      tasks.push({
        task_id: `${company.id}::${q.id}`,
        company_id: company.id,
        ticker: company.ticker,
        question_id: q.id,
        kind: q.kind,
      });
    }
  }
  return tasks;
}
