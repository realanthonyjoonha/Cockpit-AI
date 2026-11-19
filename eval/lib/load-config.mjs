import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const EVAL_ROOT = path.resolve(HERE, '..');
export const REPO_ROOT = path.resolve(EVAL_ROOT, '..');

export function readJson(file) {
  return JSON.parse(readFileSync(file, 'utf8'));
}

export function loadConfig() {
  const pilot = readJson(path.join(EVAL_ROOT, 'config/pilot.json'));
  const companies = readJson(path.join(EVAL_ROOT, 'config/companies.json'));
  const questions = readJson(path.join(EVAL_ROOT, 'config/questions.json'));
  const arms = readJson(path.join(EVAL_ROOT, 'config/arms.json'));
  const desks = readJson(path.join(EVAL_ROOT, 'fixtures/desks.json'));
  const coreTools = readJson(path.join(EVAL_ROOT, 'vendor/core-tools.json'));
  return { pilot, companies: companies.companies, questions, arms: arms.arms, desks, coreTools };
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

export function assertNoXai(argv = process.argv) {
  const joined = argv.join(' ');
  if (/\bXAI_API_KEY\b|--xai\b|xai\.com/i.test(joined)) {
    throw new Error('eval runner refuses XAI_API_KEY / --xai. Models run via Cursor.');
  }
  if (process.env.EVAL_ALLOW_XAI === '1') {
    throw new Error('EVAL_ALLOW_XAI is not a supported path');
  }
}

export function forbiddenReadPaths(cfg = loadConfig()) {
  return [
    keysDir(cfg),
    path.join(resultsDir(cfg), 'answer-key.json'),
    path.join(EVAL_ROOT, 'results/keys'),
  ];
}
