// openGrok.js — open Grok Build TUI from the local glass server (cwd = monorepo root).
// Browser cannot spawn Terminal; localhost Express can (macOS). Fail closed off-loopback.
// Before spawn: pin project MCP so cockpit-research tools hit THIS vault (fresh-user safe).
// Decision-support only. Does not write vault/house.
// Agent catalog supports surface variants (desk | risk | register | house | start) for multi-desk UI.
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { ensureProjectCockpitMcp } from './cockpitMcpProject.js';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO = path.resolve(SERVER_ROOT, '..');

/**
 * Glass agent menu catalog. Keep in sync with .grok/commands/cockpit*.md
 *
 * variants: where the action appears ('desk' | 'risk' | 'register' | 'house' | 'start')
 * default_for: surfaces where this is the default selection
 */
export const GROK_AGENTS = [
  {
    action: 'new-desk',
    label: 'Build next company',
    hint: 'Underwrite new desk — deep parallel research default; human gates',
    needs_desk: false,
    variants: ['start'],
    default_for: ['start'],
  },
  {
    action: 'daily',
    label: 'Daily brief',
    hint: 'What moved + house + pack WATCH',
    needs_desk: true,
    variants: ['desk', 'house'],
    default_for: ['desk'],
  },
  {
    action: 'research',
    label: 'Research',
    hint: 'Load house+risks; your question; optional save+compile',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'daily-save',
    label: 'Daily brief + save',
    hint: 'Same + write cockpit/briefs/daily/{desk}/YYYY-MM-DD.md',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'risk-check',
    label: 'Risk check',
    hint: 'DD a risk: direction vs tripwires (no status write)',
    needs_desk: true,
    needs_risk: true,
    variants: ['desk', 'risk', 'register'],
    default_for: ['risk'],
  },
  {
    action: 'risk-add',
    label: 'Add risk',
    hint: 'Research + propose NEW risk (glass ACCEPT)',
    needs_desk: true,
    variants: ['desk', 'register'],
    default_for: ['register'],
  },
  {
    action: 'risk-tripwires',
    label: 'Risk tripwires',
    hint: 'Research tripwires; user cull; propose set_tripwires',
    needs_desk: true,
    needs_risk: true,
    variants: ['desk', 'risk', 'register'],
  },
  {
    action: 'steelman',
    label: 'Steelman',
    hint: 'House vs pack WATCH',
    needs_desk: true,
    variants: ['desk', 'house'],
  },
  {
    action: 'match',
    label: 'Match WATCH',
    hint: 'House labels vs pack WATCH',
    needs_desk: true,
    variants: ['desk', 'house'],
  },
  {
    action: 'propose',
    label: 'Propose house',
    hint: 'Draft house edit → glass ACCEPT',
    needs_desk: true,
    variants: ['desk', 'house'],
    default_for: ['house'],
  },
  {
    action: 'pending',
    label: 'Pending proposals',
    hint: 'List pending house proposals',
    needs_desk: true,
    variants: ['desk', 'house'],
  },
  {
    action: 'desks',
    label: 'List desks',
    hint: 'Thin desk registry',
    needs_desk: false,
    variants: ['desk'],
  },
  {
    action: 'menu',
    label: 'Cockpit menu',
    hint: '/cockpit — full slash menu',
    needs_desk: false,
    variants: ['desk', 'risk', 'register', 'house'],
  },
];

const ALLOWED_ACTIONS = new Set(GROK_AGENTS.map((a) => a.action));
const ALLOWED_VARIANTS = new Set(['desk', 'risk', 'register', 'house', 'start']);

/**
 * @param {import('http').IncomingMessage} req
 */
export function isLoopbackRequest(req) {
  const raw = String(req.socket?.remoteAddress || req.ip || '');
  return raw === '127.0.0.1'
    || raw === '::1'
    || raw === '::ffff:127.0.0.1'
    || raw.endsWith('127.0.0.1');
}

function resolveGrokBin() {
  if (process.env.GROK_BIN && fs.existsSync(process.env.GROK_BIN)) {
    return process.env.GROK_BIN;
  }
  const home = path.join(os.homedir(), '.grok', 'bin', 'grok');
  if (fs.existsSync(home)) return home;
  return 'grok';
}

function resolveRepo() {
  const fromEnv = process.env.COCKPIT_REPO;
  if (fromEnv && fs.existsSync(fromEnv)) return path.resolve(fromEnv);
  return DEFAULT_REPO;
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

function normalizeVariant(v) {
  const x = String(v || 'desk').toLowerCase();
  return ALLOWED_VARIANTS.has(x) ? x : 'desk';
}

/** Safe risk token for slash args (no newlines; capped). */
export function sanitizeRiskArg(riskName, riskId) {
  const raw = String(riskName || riskId || '').replace(/[\r\n\t]+/g, ' ').trim();
  if (!raw) return '';
  return raw.slice(0, 160);
}

/** Safe ticker for /cockpit-new-desk (uppercase, short). Empty if invalid. */
export function sanitizeTickerArg(ticker) {
  const raw = String(ticker || '').trim().toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!raw) return '';
  return raw.slice(0, 12);
}

/**
 * List agents for glass menu (no Terminal spawn).
 * @param {{ variant?: string }} [opts]
 */
export function listGrokAgents(opts = {}) {
  const variant = normalizeVariant(opts.variant);
  const agents = GROK_AGENTS.filter((a) => {
    const vs = a.variants || ['desk'];
    return vs.includes(variant);
  });
  const default_action = agents.find((a) => (a.default_for || []).includes(variant))?.action
    || agents.find((a) => a.default)?.action
    || agents[0]?.action
    || 'menu';

  return {
    ok: true,
    variant,
    agents,
    default_action,
    note: ({
      risk: 'POST /api/open-grok { action, desk, risk_id?, risk_name? } — risk-detail seed.',
      register: 'POST /api/open-grok { action, desk } — register menu (add / check / tripwires).',
      house: 'POST /api/open-grok { action, desk } — house menu (propose / steelman / match).',
      start: 'POST /api/open-grok { action: "new-desk", ticker? } — underwrite next company from START.',
      desk: 'POST /api/open-grok { action, desk } opens Terminal → Grok Build with that slash command.',
    })[variant] || 'POST /api/open-grok { action, desk }',
    decision_support_only: true,
  };
}

/**
 * Build optional initial prompt for grok CLI.
 * @param {{ action?: string, desk?: string, ticker?: string, prompt?: string, risk_id?: string, risk_name?: string }} opts
 */
export function buildInitialPrompt(opts = {}) {
  if (opts.prompt && typeof opts.prompt === 'string') {
    const p = opts.prompt.trim().slice(0, 240);
    if (p.startsWith('/cockpit')) return p;
  }
  const action = String(opts.action || 'daily').toLowerCase();
  const desk = String(opts.desk || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  const riskArg = sanitizeRiskArg(opts.risk_name, opts.risk_id);
  const tickerArg = sanitizeTickerArg(opts.ticker);

  if (!ALLOWED_ACTIONS.has(action) && action !== 'menu') {
    return '/cockpit';
  }

  const withDesk = (cmd) => (desk ? `${cmd} ${desk}` : cmd);
  const withDeskRisk = (cmd) => {
    const base = withDesk(cmd);
    return riskArg ? `${base} ${riskArg}` : base;
  };

  switch (action) {
    case 'new-desk':
      return tickerArg ? `/cockpit-new-desk ${tickerArg}` : '/cockpit-new-desk';
    case 'daily':
      return withDesk('/cockpit-daily');
    case 'research':
      return withDesk('/cockpit-research');
    case 'daily-save':
      return desk ? `/cockpit-daily ${desk} --save` : '/cockpit-daily --save';
    case 'risk-check':
      return withDeskRisk('/cockpit-risk-check');
    case 'risk-add':
      return withDesk('/cockpit-risk-add');
    case 'risk-tripwires':
      return withDeskRisk('/cockpit-risk-tripwires');
    case 'steelman':
      return withDesk('/cockpit-steelman');
    case 'match':
      return withDesk('/cockpit-match');
    case 'propose':
      return withDesk('/cockpit-propose');
    case 'pending':
      return withDesk('/cockpit-pending');
    case 'desks':
      return '/cockpit-desks';
    case 'menu':
    default:
      return '/cockpit';
  }
}

/**
 * Open macOS Terminal in cockpit-research-os and start Grok Build.
 * @param {{ action?: string, desk?: string, ticker?: string, prompt?: string, risk_id?: string, risk_name?: string }} opts
 */
export function openGrokBuild(opts = {}) {
  if (process.platform !== 'darwin') {
    return {
      ok: false,
      error: 'open-grok only supported on macOS Terminal right now',
    };
  }

  const repo = resolveRepo();
  if (!fs.existsSync(repo)) {
    return { ok: false, error: `repo not found: ${repo}` };
  }

  // Product invariant: OPEN GROK sessions must use MCP bound to this monorepo's vault.
  // Project-scoped .grok/config.toml overrides user-level cockpit-research (same name).
  const mcpPin = ensureProjectCockpitMcp(repo);

  const grok = resolveGrokBin();
  const action = String(opts.action || 'daily').toLowerCase();
  const ticker = sanitizeTickerArg(opts.ticker);
  const initial = buildInitialPrompt(opts);
  const cmd = `cd ${shellQuote(repo)} && ${shellQuote(grok)} ${shellQuote(initial)}`;

  const script = `tell application "Terminal"
  activate
  do script ${JSON.stringify(cmd)}
end tell`;

  try {
    const child = spawn('osascript', ['-e', script], {
      detached: true,
      stdio: 'ignore',
    });
    child.unref();
    return {
      ok: true,
      repo,
      grok,
      action,
      desk: opts.desk || null,
      ticker: ticker || null,
      risk_id: opts.risk_id || null,
      risk_name: opts.risk_name || null,
      initial_prompt: initial,
      mcp_project: mcpPin.ok ? mcpPin.path : null,
      mcp_project_error: mcpPin.ok ? null : mcpPin.error,
      note: 'Opened Terminal → Grok Build (cwd=this monorepo; project MCP pin for cockpit-research).',
      decision_support_only: true,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
