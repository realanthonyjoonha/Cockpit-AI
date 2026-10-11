/**
 * Phase gate for slice cards (plan P3, flaw F11).
 * The object checked here is what run.mjs writes to results/flow.json.
 */
import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { flowSim, COMMAND_TOKEN_BASELINE } from './flow-sim.mjs';
import { loadSectors } from './sector-check.mjs';
import { countTokens } from './tokens.mjs';
import { checkSliceCard, countCardTokens, SLICE_CARD_TOKEN_CAP } from '../../memory-cockpit-v2/scripts/slice-card-check.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const CHECKER = path.join(REPO, 'memory-cockpit-v2/scripts/slice-card-check.mjs');

const CLOSEOUT_PHRASES = [
  'house-closeout.mjs',
  'TSLA-class',
  'propose_house',
  'register-closeout.mjs',
  'same Grok terminal',
  'Never require a second OPEN GROK',
  'new-desk-closeout.mjs',
  'commit_on_go',
  'go-commit.mjs',
  'propose FORMING',
];

function runChecker(files) {
  const proc = spawnSync(process.execPath, [CHECKER, ...files], { encoding: 'utf8' });
  return { status: proc.status, stdout: proc.stdout || '', stderr: proc.stderr || '' };
}

function sectorCard(issuer) {
  const preferred = issuer.live?.[0]?.id;
  const claim = issuer.claims.find((c) => c.id === preferred && /\d/.test(c.text || ''))
    || issuer.claims.find((c) => /\d/.test(c.text || ''))
    || issuer.claims[0];
  const slug = `${issuer.id}-${String(issuer.form || 'filing').toLowerCase()}`;
  return `- ${claim.text} (${claim.as_of}) [${claim.grade || 'A'}] [[${slug}]]\n`;
}

export function assertP3() {
  const errors = [];
  const flow = flowSim(0);
  const deep = (flow.trajectories || []).find((t) => t.slice_token_target === 6000);
  const rawKept = deep?.steps?.[deep.steps.length - 1]?.budgets?.['32000']?.canaries_kept;
  if (rawKept !== 0) errors.push(`raw control last_32k.canaries_kept ${rawKept} (expected 0)`);

  const card = flow.card_trajectory;
  if (!card) errors.push('flow.json card_trajectory missing');
  else {
    if (card.last_32k?.canaries_kept !== 8) {
      errors.push(`card last_32k.canaries_kept ${card.last_32k?.canaries_kept}`);
    }
    const flags = card.last_32k?.canaries || {};
    for (const key of Object.keys(flow.canaries)) {
      if (flags[key] !== true) errors.push(`card tail dropped ${key}`);
    }
    if (card.final_tokens > 32_000) errors.push(`card trajectory tokens ${card.final_tokens}`);
    if (card.pasted_raw_notes !== false) errors.push('card trajectory pasted raw notes');
    if (card.reads_cards_not_raw_notes !== true) errors.push('card trajectory does not read cards');
    if (card.seed_at_end !== true) errors.push('seed is not at the end of the card turn');
    if (card.recoverable_elision !== false) errors.push('recoverable elision machinery is present');
    if (card.max_card_tokens > SLICE_CARD_TOKEN_CAP) {
      errors.push(`card tokens ${card.max_card_tokens}`);
    }
    if (card.forced_head_tail_32k?.canaries_kept !== 8) {
      errors.push(`forced 32k tail kept ${card.forced_head_tail_32k?.canaries_kept}`);
    }
  }

  if (flow.implementation_notes_is_compactor !== false) {
    errors.push('implementation-notes.md is wired as a compactor');
  }
  if ((flow.command_files_mentioning_summarize_or_window || []).includes('cockpit-new-desk.md')) {
    errors.push('new-desk command mentions a summarizer');
  }
  if (flow.command_tokens > COMMAND_TOKEN_BASELINE + 400) {
    errors.push(`command tokens ${flow.command_tokens} grew by more than 400 from ${COMMAND_TOKEN_BASELINE}`);
  }
  if (countCardTokens('Net sales were $10 million.') !== countTokens('Net sales were $10 million.')) {
    errors.push('checker tokenizer diverges from the harness tokenizer');
  }

  const command = readFileSync(path.join(REPO, '.grok/commands/cockpit-new-desk.md'), 'utf8');
  if (!command.includes('raw/{slug}-research/slices/0N.md')) errors.push('command missing card path');
  if (!command.includes('slice-card-check.mjs')) errors.push('command missing checker');
  if (/taxonomy_xbrl|contextpack_metrics/.test(command)) errors.push('command absorbed the taxonomy');
  for (const phrase of CLOSEOUT_PHRASES) {
    if (!command.includes(phrase)) errors.push(`command dropped closeout phrase ${phrase}`);
  }

  const desks = JSON.parse(readFileSync(path.join(REPO, 'memory-cockpit-v2/config/thin-desks.json'), 'utf8'));
  if (!Array.isArray(desks.desks) || desks.desks.length !== 0) errors.push('thin-desks.json desks is not empty');

  const issuers = loadSectors().issuers || [];
  if (issuers.length !== 10) errors.push(`expected 10 sector cards, got ${issuers.length}`);
  const dir = mkdtempSync(path.join(tmpdir(), 'slice-cards-'));
  try {
    const good = [];
    for (const issuer of issuers) {
      const file = path.join(dir, `${issuer.id}.md`);
      const text = sectorCard(issuer);
      if (!/\d/.test(text)) errors.push(`${issuer.id} card has no number`);
      writeFileSync(file, text);
      good.push(file);
    }
    const pass = runChecker(good);
    if (pass.status !== 0) errors.push(`sector cards failed: ${pass.stderr || pass.stdout}`);

    const bare = path.join(dir, 'bare.md');
    writeFileSync(bare, '- Net sales were $52,000 million.\n');
    const bareRun = runChecker([bare]);
    if (bareRun.status !== 1 || !/source slug/.test(bareRun.stderr)) {
      errors.push(`bare number exit ${bareRun.status}: ${bareRun.stderr}`);
    }

    let fat = '- Net sales were $10 million. (2026-01-01) [A] [[over-cap]]\n';
    while (countTokens(fat) <= SLICE_CARD_TOKEN_CAP) fat += fat;
    const fatFile = path.join(dir, 'fat.md');
    writeFileSync(fatFile, fat);
    const fatRun = runChecker([fatFile]);
    if (fatRun.status !== 1 || !/token cap/.test(fatRun.stderr)) {
      errors.push(`over-cap exit ${fatRun.status}: ${fatRun.stderr}`);
    }

    const pt = path.join(dir, 'pt.md');
    writeFileSync(pt, '- The note states a price target of $40. (2026-01-01) [C] [[pt-note]]\n');
    const ptRun = runChecker([pt]);
    if (ptRun.status !== 1 || !/buy\/sell\/target\/sizing/.test(ptRun.stderr)) {
      errors.push(`price target exit ${ptRun.status}: ${ptRun.stderr}`);
    }

    const allowed = [
      ['sell-side', '- Sell-side coverage was thin. (2026-01-01) [A] [[sec-10k]]\n'],
      ['hold-meeting', '- The board will hold a meeting. (2026-01-01) [A] [[sec-8k]]\n'],
      ['gap-year', 'GAP: fiscal 2026 filing not read.\n'],
    ];
    for (const [id, text] of allowed) {
      const got = checkSliceCard(text);
      if (!got.ok) errors.push(`${id} false-reject ${JSON.stringify(got.errors)}`);
    }
    const stillAdvice = checkSliceCard('- We hold the name. (2026-01-01) [A] [[sec-10k]]\n');
    if (stillAdvice.ok || !stillAdvice.errors.some((e) => /buy\/sell\/target\/sizing/.test(e))) {
      errors.push('bare hold advice was accepted');
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  return errors;
}
