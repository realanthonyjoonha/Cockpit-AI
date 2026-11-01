import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { countTokens } from '../vendor/tokens.mjs';
import { buildContext, enumerateTasks, renderQuestion } from './arms.mjs';
import { jobsDir, loadConfig } from './load-config.mjs';
import { assertGrok46, REQUIRED_GROK46 } from './models.mjs';
import { writeJson } from './sec.mjs';

const SYSTEM = `You are scoring-subject for a Cockpit-AI evaluation. Decision-support only.

Hard rules:
- No buy/sell/hold, price target, or position sizing.
- Do not read eval/results/keys, answer-key.json, scored.json, or any scoring file.
- Do not use XAI_API_KEY or any xAI HTTP API. Only Cursor Grok 4.6 subscription usage.
- If a number is not tagged or you are unsure, say GAP. Do not invent.
- Treat each item independently. Do not reuse a figure from another item.
- House and registers are human-owned. Propose only. Never claim a write.
- Web search is allowed and expected for public facts when tagged companyfacts are not in context.
`;

function itemPrompt(task, company, q, metricId, context, cfg) {
  return {
    item_id: task.task_id,
    company_id: company.id,
    ticker: company.ticker,
    question_id: q.id,
    kind: q.kind,
    web_search: true,
    question: renderQuestion(q, company, metricId, cfg),
    context,
  };
}

function shardList(items, size) {
  const n = Math.max(1, Number(size) || items.length);
  const out = [];
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

export function buildJobs(answerKey, cfg = loadConfig()) {
  assertGrok46([cfg.pilot.models.subject, cfg.pilot.models.grader], 'configured model');
  const keyById = Object.fromEntries((answerKey.companies || []).map((c) => [c.company_id, c]));
  const jobs = [];
  const bundle = cfg.pilot.bundle;
  const shardSize = bundle === 'arm_repeat_shard'
    ? (cfg.pilot.shard_companies || 5)
    : (bundle === 'arm_repeat' ? cfg.companies.length : 1);
  const shards = bundle === 'none' || !bundle || bundle === 'item'
    ? null
    : shardList(cfg.companies, shardSize);
  for (const arm of cfg.arms) {
    for (let rep = 1; rep <= cfg.pilot.repeats; rep += 1) {
      if (shards) {
        shards.forEach((shard, si) => {
          const items = [];
          for (const company of shard) {
            const companyKey = keyById[company.id];
            const ctx = buildContext(arm, company, companyKey, cfg);
            const metricId = companyKey?.metric_id;
            for (const q of cfg.questions.questions) {
              items.push(itemPrompt(
                { task_id: `${company.id}::${q.id}` },
                company,
                q,
                metricId,
                ctx.text,
                cfg,
              ));
            }
          }
          const jobId = shards.length === 1
            ? `${arm.id}__r${rep}`
            : `${arm.id}__s${si}__r${rep}`;
          jobs.push({
            job_id: jobId,
            arm: arm.id,
            repeat: rep,
            shard: si,
            model: cfg.pilot.models.subject,
            web_search: !!arm.web_search,
            items,
          });
        });
      } else {
        for (const company of cfg.companies) {
          const companyKey = keyById[company.id];
          const ctx = buildContext(arm, company, companyKey, cfg);
          const metricId = companyKey?.metric_id;
          for (const q of cfg.questions.questions) {
            const item = itemPrompt(
              { task_id: `${company.id}::${q.id}` },
              company,
              q,
              metricId,
              ctx.text,
              cfg,
            );
            jobs.push({
              job_id: `${arm.id}__${item.item_id}__r${rep}`,
              arm: arm.id,
              repeat: rep,
              shard: 0,
              model: cfg.pilot.models.subject,
              web_search: !!arm.web_search,
              items: [item],
            });
          }
        }
      }
    }
  }
  return jobs;
}

export function jobPromptMarkdown(job) {
  const lines = [
    SYSTEM,
    `Arm id is hidden from you on purpose. Model: ${job.model || REQUIRED_GROK46}. Web search: ${job.web_search ? 'allowed and expected for public facts' : 'off'}.`,
    `Reply with a JSON array of ${job.items.length} objects in this exact order, one per item, no extra keys:`,
    '`{"item_id":"...","answer":"...","number":null,"numbers":[],"period_start":null,"period_end":null,"gap":false,"gap_reason":"","citations":[]}`',
    'number = primary figure in native units (not millions unless you say so). numbers = every figure you stated. gap=true if you refuse or the line is untagged.',
    '',
  ];
  let lastCtx = null;
  let lastCompany = null;
  job.items.forEach((item, i) => {
    if (item.company_id !== lastCompany && item.context && item.context !== lastCtx) {
      lines.push(`---`);
      lines.push(`## Context for ${item.ticker || item.company_id} (applies to the next items until a new context)`);
      lines.push('');
      lines.push(item.context);
      lastCtx = item.context;
      lastCompany = item.company_id;
    } else if (item.company_id !== lastCompany) {
      lastCompany = item.company_id;
    }
    lines.push(`---`);
    lines.push(`### Item ${i + 1} \`${item.item_id}\``);
    lines.push('');
    lines.push(`QUESTION: ${item.question}`);
    lines.push('');
  });
  return lines.join('\n');
}

export function persistJobs(jobs, cfg = loadConfig()) {
  const dir = jobsDir(cfg);
  mkdirSync(dir, { recursive: true });
  const index = [];
  for (const job of jobs) {
    const md = jobPromptMarkdown(job);
    const promptPath = path.join(dir, `${safeName(job.job_id)}.md`);
    const metaPath = path.join(dir, `${safeName(job.job_id)}.meta.json`);
    writeFileSync(promptPath, md);
    const meta = {
      job_id: job.job_id,
      arm: job.arm,
      repeat: job.repeat,
      shard: job.shard ?? 0,
      model: job.model,
      item_ids: job.items.map((i) => i.item_id),
      prompt_tokens: countTokens(md),
      prompt_chars: md.length,
      prompt_path: promptPath,
    };
    writeJson(metaPath, meta);
    index.push(meta);
  }
  writeJson(path.join(dir, 'index.json'), {
    n: index.length,
    model: cfg.pilot.models.subject,
    bundle: cfg.pilot.bundle,
    jobs: index,
  });
  return index;
}

function safeName(id) {
  return String(id).replace(/[^A-Za-z0-9._+-]+/g, '_');
}

export { enumerateTasks };
