import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildSyntheticDesks } from './vault.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EVAL_ROOT = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(EVAL_ROOT, '..');

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function resolveMode(opts = {}) {
  const argv = opts.argv || process.argv;
  if (opts.mode) return opts.mode;
  if (argv.includes('--gap-check') || argv.includes('--gap')) return 'gap';
  if (process.env.EVAL_MODE) return process.env.EVAL_MODE;
  return 'large';
}

export function loadConfig(opts = {}) {
  const mode = resolveMode(opts);
  const pilot = readJson(path.join(EVAL_ROOT, 'config/pilot.json'));
  const companies = readJson(path.join(EVAL_ROOT, 'config/companies.json'));
  const armsDoc = readJson(path.join(EVAL_ROOT, 'config/arms.json'));
  const vaultTemplates = readJson(path.join(EVAL_ROOT, 'fixtures/vault-templates.json'));
  const coreTools = readJson(path.join(EVAL_ROOT, 'vendor/core-tools.json'));
  const questionsFile = mode === 'gap' ? 'config/gap-questions.json' : 'config/questions.json';
  const questions = readJson(path.join(EVAL_ROOT, questionsFile));
  const cfg = {
    mode,
    pilot,
    companies: companies.companies,
    questions,
    arms: armsDoc.arms,
    vaultTemplates,
    coreTools,
    gap: null,
    gapItems: null,
  };
  if (mode === 'gap') {
    const gap = readJson(path.join(EVAL_ROOT, 'config/gap-check.json'));
    cfg.gap = gap;
    cfg.pilot = {
      ...pilot,
      ...gap,
      models: gap.models || pilot.models,
      scoring: { ...pilot.scoring, ...(gap.scoring || {}) },
      sec: { ...pilot.sec, ...(gap.sec || {}) },
      paths: { ...pilot.paths, ...(gap.paths || {}) },
      guardrails: gap.guardrails || pilot.guardrails,
    };
    const allow = new Set(gap.arm_ids || ['0+a', 'full']);
    cfg.arms = armsDoc.arms.filter((a) => allow.has(a.id));
  }
  cfg.desks = buildSyntheticDesks(cfg.companies, vaultTemplates);
  return cfg;
}

export function resultsDir(cfg = loadConfig()) {
  return path.join(EVAL_ROOT, cfg.pilot.paths.results);
}

export function keysDir(cfg = loadConfig()) {
  return path.join(resultsDir(cfg), cfg.pilot.paths.keys_subdir);
}

export function tracesDir(cfg = loadConfig()) {
  return path.join(resultsDir(cfg), cfg.pilot.paths.traces_subdir);
}

export function jobsDir(cfg = loadConfig()) {
  return path.join(resultsDir(cfg), cfg.pilot.paths.jobs_subdir);
}

export function factsDir(cfg = loadConfig()) {
  return path.join(resultsDir(cfg), cfg.pilot.paths.facts_subdir);
}

export function reportPath(cfg = loadConfig()) {
  return path.join(EVAL_ROOT, cfg.pilot.paths.report);
}

export function childEnvWithoutXai(base = process.env) {
  const env = { ...base };
  delete env.XAI_API_KEY;
  if (Object.prototype.hasOwnProperty.call(env, 'XAI_API_KEY')) {
    throw new Error('failed to unset XAI_API_KEY in child env');
  }
  return env;
}

export function unsetAndAssertNoXai(argv = process.argv) {
  delete process.env.XAI_API_KEY;
  if (Object.prototype.hasOwnProperty.call(process.env, 'XAI_API_KEY')) {
    throw new Error('XAI_API_KEY still present after unset');
  }
  assertNoXai(argv);
}

export function assertNoXai(argv = process.argv) {
  const joined = argv.join(' ');
  if (/\bXAI_API_KEY\b|--xai\b|xai\.com/i.test(joined)) {
    throw new Error('eval runner refuses XAI_API_KEY / --xai. Models run via Cursor Grok 4.6.');
  }
  if (process.env.EVAL_ALLOW_XAI === '1') {
    throw new Error('EVAL_ALLOW_XAI is not a supported path');
  }
  if (process.env.XAI_API_KEY) {
    throw new Error('XAI_API_KEY is set in the environment. Unset it. Only Cursor subscription Grok 4.6 is allowed.');
  }
  if (Object.prototype.hasOwnProperty.call(process.env, 'XAI_API_KEY')) {
    throw new Error('XAI_API_KEY is present (even empty). Unset it.');
  }
}

export function forbiddenReadPaths(cfg = loadConfig()) {
  return [
    keysDir(cfg),
    path.join(resultsDir(cfg), 'answer-key.json'),
    path.join(EVAL_ROOT, 'results/keys'),
  ];
}
