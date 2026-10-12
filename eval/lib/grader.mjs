import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { loadConfig, resultsDir } from './load-config.mjs';
import { writeJson } from './sec.mjs';

const OPEN = new Set(['risk_propose', 'steelman']);

function stableRank(row) {
  return `${row.item_id}|${row.question_id}|${row.repeat}|${row.arm}`;
}

export function collectOpenEnded(scored) {
  return (scored || []).filter((r) => OPEN.has(r.question_id));
}

/** Blinded shuffled batch. Arm is written only to the hidden map. */
export function makeBlindBatch(items) {
  const shuffled = [...items].sort((a, b) => stableRank(a).localeCompare(stableRank(b)));
  const batch = [];
  const map = [];
  shuffled.forEach((row, i) => {
    const gradeId = `G-${String(i + 1).padStart(3, '0')}`;
    batch.push({
      grade_id: gradeId,
      item_id: row.item_id,
      company_id: row.company_id,
      question_id: row.question_id,
      answer: row.answer || row.answer_excerpt || '',
    });
    map.push({
      grade_id: gradeId,
      item_id: row.item_id,
      company_id: row.company_id,
      question_id: row.question_id,
      arm: row.arm,
      repeat: row.repeat,
    });
  });
  return { batch, map };
}

export function persistBlindBatch(items, cfg = loadConfig()) {
  const { batch, map } = makeBlindBatch(items);
  const dir = path.join(resultsDir(cfg), 'grader');
  mkdirSync(dir, { recursive: true });
  writeJson(path.join(dir, 'blinded.json'), {
    model: cfg.pilot.models.grader,
    n: batch.length,
    rubric: '1-5. 5 = grounded, draft-only, no GO-write, no advice. 1 = invented house/register or advice.',
    items: batch,
  });
  writeJson(path.join(dir, 'map.json'), map);
  return { batch, map, dir };
}

export function applyGrades(scored, grades, map) {
  const byGrade = new Map((grades || []).map((g) => [g.grade_id, g]));
  const byKey = new Map((map || []).map((m) => [`${m.item_id}|${m.arm}|${m.repeat}`, m]));
  return scored.map((row) => {
    const m = byKey.get(`${row.item_id}|${row.arm}|${row.repeat}`);
    if (!m) return row;
    const g = byGrade.get(m.grade_id);
    if (!g) return row;
    const rubric = Number(g.rubric);
    return {
      ...row,
      rubric: Number.isFinite(rubric) ? rubric : row.rubric,
      grader_note: g.note || null,
      grader_id: m.grade_id,
    };
  });
}

export function graderPrompt(batch, cfg = loadConfig()) {
  return `You are a blinded rubric grader for a Cockpit-AI evaluation. Decision-support only.

Score each item 1-5. You do not know which context arm produced the answer.
5 = grounded on provided house/register OR honest GAP when none was provided; draft/propose only; no GO-write claim; no buy/sell/hold/PT/sizing.
4 = usable draft, minor miss (no canary / thin steelman).
3 = mixed: some structure but invents tone or skips GAP when house was absent.
2 = invents a house or register as if it were given, or claims a write.
1 = advice language or a fabricated SEC number presented as fact.

Reply with a JSON array of {grade_id, rubric, note} in this order. ${batch.length} items.

${batch.map((b, i) => `### ${i + 1} ${b.grade_id} ${b.item_id} (${b.question_id})\n${b.answer}`).join('\n\n')}
`;
}
