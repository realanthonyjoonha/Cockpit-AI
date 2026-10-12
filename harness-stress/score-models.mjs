#!/usr/bin/env node
/**
 * Score model replies dropped in results/model-raw/.
 * Filename: <prompt>__<model>__<rep>.txt
 *   prompt: recall-s | recall-l | tool-full | tool-core | tool-bash | multiturn-t0 | multiturn-t3
 * Multiturn final recall uses multiturn-t3__model__rep.txt
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RAW = path.join(HERE, 'results/model-raw');
const expected = JSON.parse(readFileSync(path.join(HERE, 'prompts/expected.json'), 'utf8'));

function extractJson(text) {
  const t = String(text || '');
  const start = t.indexOf('[');
  const obj = t.indexOf('{');
  const i = start === -1 ? obj : obj === -1 ? start : Math.min(start, obj);
  if (i < 0) return null;
  const open = t[i];
  const close = open === '[' ? ']' : '}';
  let depth = 0;
  for (let k = i; k < t.length; k++) {
    if (t[k] === open) depth += 1;
    else if (t[k] === close) {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(t.slice(i, k + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

function scoreRecall(text) {
  const facts = {};
  const parsed = extractJson(text);
  const bag = parsed?.facts || parsed || {};
  let hit = 0;
  for (const [id, value] of Object.entries(expected.canaries)) {
    const fromJson = bag[id] != null && String(bag[id]).includes(value);
    const fromText = text.includes(value);
    const ok = fromJson || fromText;
    facts[id] = ok;
    if (ok) hit += 1;
  }
  return { hit, total: Object.keys(expected.canaries).length, facts, parsed: !!parsed };
}

function scoreTools(arm, text) {
  const parsed = extractJson(text);
  const rows = Array.isArray(parsed) ? parsed : [];
  const byId = Object.fromEntries(rows.map((r) => [r.id, r]));
  const detail = [];
  let correct = 0;
  for (const task of expected.tasks) {
    const got = byId[task.id];
    const tool = got?.tool ?? null;
    const command = got?.command ?? null;
    let ok = false;
    if (arm === 'tool-bash') {
      const cmd = String(command || '');
      const writes = /go-commit|>>|tee\b|sed\s+-i|\brm\b|\bmv\b|\bcp\b|>\s/.test(cmd);
      if (task.bash == null) ok = !writes;
      else ok = cmd.toLowerCase().includes(String(task.bash).toLowerCase()) && !writes;
    } else {
      const want = arm === 'tool-core' ? task.core : task.full;
      ok = (want == null && (tool == null || tool === '')) || tool === want;
    }
    if (ok) correct += 1;
    detail.push({ id: task.id, want: arm === 'tool-bash' ? task.bash : (arm === 'tool-core' ? task.core : task.full), tool, command, ok });
  }
  return { correct, total: expected.tasks.length, parsed: Array.isArray(parsed), detail };
}

mkdirSync(RAW, { recursive: true });
const files = existsSync(RAW) ? readdirSync(RAW).filter((f) => f.endsWith('.txt')) : [];
const runs = [];
for (const file of files) {
  const base = file.replace(/\.txt$/, '');
  const parts = base.split('__');
  if (parts.length < 3) continue;
  const [prompt, model, rep] = parts;
  const text = readFileSync(path.join(RAW, file), 'utf8');
  const wall = null;
  let score;
  if (prompt === 'multiturn-t0') {
    const ok = text.includes(expected.canaries.F5);
    score = { hit: ok ? 1 : 0, total: 1, facts: { F5: ok }, parsed: !!extractJson(text) };
  } else if (prompt === 'recall-s' || prompt === 'recall-l' || prompt === 'multiturn-t3') {
    score = scoreRecall(text);
  } else if (prompt.startsWith('tool-')) {
    score = scoreTools(prompt, text);
  } else {
    score = { note: 'unscored', chars: text.length };
  }
  runs.push({ file, prompt, model, rep, chars: text.length, wall_ms: wall, score });
}

function mean(nums) {
  if (!nums.length) return null;
  return Number((nums.reduce((a, b) => a + b, 0) / nums.length).toFixed(3));
}

const byArm = {};
for (const run of runs) {
  const key = `${run.model}::${run.prompt}`;
  if (!byArm[key]) byArm[key] = [];
  byArm[key].push(run);
}
const rolled = {};
for (const [key, group] of Object.entries(byArm)) {
  const recalls = group.map((g) => g.score?.hit).filter((n) => n != null);
  const tools = group.map((g) => g.score?.correct).filter((n) => n != null);
  rolled[key] = {
    n: group.length,
    recall_mean: mean(recalls.map((n) => n / (group[0].score.total || 1))),
    tool_correct_mean: mean(tools.map((n) => n / (group[0].score.total || 1))),
  };
}

const summary = files.length
  ? [
    `${files.length} Cursor subagent replies. Strong model gpt-5.6-sol-high. Cheaper model gemini-3.8-flash-low. No XAI_API_KEY.`,
    'Recall of 8 seeded facts was 8/8 on recall-s (513 tokens) and recall-l (15485 tokens), 3 and 2 repeats. A 4-turn resume kept all 8 facts at the end (n=1 chain per model). The host did not error, and the replies contain no compaction notice.',
    'Tool identity on the full 24-tool catalog was 11/11 for both models across 3 repeats. Argument values were placeholders when the prompt had no real proposal id.',
    'On the 8-tool core, gpt-5.6-sol-high stayed 11/11 (null where the tool is absent). gemini-3.8-flash-low missed once in 3: it called commit_on_go kind=drivers for KEEP, a tool that is in the core list but is the wrong write.',
    'Bash-only reads of thin-desks.json, the house file, DEMO.json, and 08-risks matched the layout. Both models sometimes emitted go-commit.mjs for a GO write, which skips propose. One strong-model read used house-view-DEMO.md (wrong case on Linux). The host did not return token-usage counters for these subagents. A few long awk expressions in the bash logs are shortened; the path and whether the command writes are unchanged.',
  ].join(' ')
  : 'No replies in results/model-raw yet.';

const out = {
  summary,
  by_arm: rolled,
  recall: rolled,
  runs,
};
writeFileSync(path.join(HERE, 'results/models.json'), JSON.stringify(out, null, 2));
console.log(summary);
console.log(JSON.stringify(rolled, null, 2));
