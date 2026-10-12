/**
 * Replay a /cockpit-new-desk shaped trajectory and measure context growth.
 * Host compaction is simulated. Cockpit itself has no summarize step in this path.
 */
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { countTokens } from './tokens.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const CANARIES = {
  F1: '222222',
  F2: '111111',
  F3: 'exactly-3-segments',
  F4: 'headcount-4242',
  F5: 'purple-heron',
  F6: 'Northwind',
  F7: '15000015',
  F8: 'lane-7',
};

const BUDGETS = [8_000, 16_000, 32_000, 64_000, 96_000, 128_000];

function filler(chars, salt) {
  const sentence = 'Process note on filing mechanics and control language for the fixture desk. ';
  let s = '';
  let i = 0;
  while (s.length < chars) {
    s += `Paragraph ${salt}-${i}. ${sentence}`;
    i += 1;
  }
  return s.slice(0, chars);
}

function tailByTokens(text, budget) {
  if (countTokens(text) <= budget) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    const slice = text.slice(mid);
    if (countTokens(slice) > budget) lo = mid + 1;
    else hi = mid;
  }
  return text.slice(lo);
}

function canaryHits(text) {
  const hits = {};
  for (const [k, v] of Object.entries(CANARIES)) hits[k] = text.includes(v);
  hits.kept = Object.values(hits).filter(Boolean).length;
  hits.total = Object.keys(CANARIES).length;
  return hits;
}

function read(rel) {
  return readFileSync(path.join(REPO, rel), 'utf8');
}

export function flowSim(schemaTokens = 0) {
  const command = read('.grok/commands/cockpit-new-desk.md');
  const agents = read('AGENTS.md');
  const notes = read('memory-cockpit-v2/implementation-notes.md').slice(0, 400);
  const commandFiles = readdirSync(path.join(REPO, '.grok/commands')).filter((f) => f.endsWith('.md'));
  const summarizeHits = [];
  for (const f of commandFiles) {
    const body = read(path.join('.grok/commands', f));
    if (/summariz|compact the context|context window/i.test(body)) {
      summarizeHits.push(f);
    }
  }

  const seed = [
    'SEEDED FACTS (harness fixture, not a house view)',
    ...Object.entries(CANARIES).map(([k, v]) => `${k}=${v}`),
    '',
  ].join('\n');

  const overhead = [
    '# host system card (measured file, not a claim it is always injected)',
    agents,
    '# slash command',
    command,
    '# resume anchor excerpt',
    notes,
  ].join('\n\n');

  const sliceTokensTarget = [2_000, 6_000];
  const trajectories = [];

  for (const target of sliceTokensTarget) {
    let chars = 4_000;
    while (countTokens(filler(chars, 'cal')) < target && chars < 80_000) chars += 500;
    const steps = [{ step: 0, role: 'seed', text: seed }];
    for (let i = 1; i <= 8; i++) {
      steps.push({
        step: i,
        role: `slice-${i}`,
        text: `## Slice ${i}\n${filler(chars, `s${i}`)}`,
      });
    }
    steps.push({
      step: 9,
      role: 'synthesis',
      text: `## Synthesis\nRecall the seeded facts.\n${filler(Math.floor(chars / 2), 'syn')}`,
    });

    let transcript = overhead;
    const rows = [];
    for (const step of steps) {
      transcript += `\n\n${step.text}`;
      const tokens = countTokens(transcript);
      const budgets = {};
      for (const b of BUDGETS) {
        const kept = tokens <= b ? transcript : tailByTokens(transcript, b);
        const hits = canaryHits(kept);
        budgets[String(b)] = {
          overflow: tokens > b,
          tokens_after_tail_keep: countTokens(kept),
          canaries_kept: hits.kept,
          canaries: hits,
        };
      }
      rows.push({
        step: step.step,
        role: step.role,
        cumulative_tokens: tokens,
        cumulative_chars: transcript.length,
        per_call_schema_tokens: schemaTokens,
        budgets,
      });
    }
    const overflowStep = {};
    for (const b of BUDGETS) {
      const hit = rows.find((r) => r.budgets[String(b)].overflow);
      overflowStep[String(b)] = hit ? hit.step : null;
    }
    trajectories.push({
      slice_token_target: target,
      slice_chars: chars,
      overhead_tokens: countTokens(overhead),
      seed_tokens: countTokens(seed),
      final_tokens: rows[rows.length - 1].cumulative_tokens,
      overflow_step: overflowStep,
      steps: rows,
    });
  }

  const packStub = 'PACK-SNAPSHOT '.repeat(400);
  let dup = seed;
  const dupRows = [];
  for (let i = 1; i <= 12; i++) {
    dup += `\n\n## tool get_pack_snapshot call ${i}\n${packStub}`;
    dupRows.push({
      call: i,
      tokens: countTokens(dup),
      canaries_in_full: canaryHits(dup).kept,
      canaries_in_32k_tail: canaryHits(tailByTokens(dup, 32_000)).kept,
    });
  }

  return {
    canaries: CANARIES,
    command_tokens: countTokens(command),
    command_chars: command.length,
    agents_tokens: countTokens(agents),
    command_files_mentioning_summarize_or_window: summarizeHits,
    implementation_notes_is_prose_anchor: notes.includes('resume anchor'),
    trajectories,
    repeated_pack_calls: dupRows,
    schema_tokens_added_each_call: schemaTokens,
  };
}
