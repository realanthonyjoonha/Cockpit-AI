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
import { scenarioPinPreamble } from './mcpPinGuard.js';
import { writeStreetAgentSeed } from './streetAgentSeed.js';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const DEFAULT_REPO = path.resolve(SERVER_ROOT, '..');

/**
 * Glass agent menu catalog. Keep in sync with .grok/commands/cockpit*.md
 * and src/pages/thin/GrokAgents.jsx FALLBACK_ALL.
 *
 * Desk list order = UX bands: Operate → Notes → Models → Book ops → Meta
 * (see plans/2026-08-01-agents-menu-clarity.md).
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
  // --- Band A: Operate ---
  {
    action: 'daily',
    label: 'Daily brief',
    hint: 'Daybook · what moved + calendar · short book-touch',
    needs_desk: true,
    variants: ['desk', 'house'],
    default_for: ['desk'],
  },
  {
    action: 'daily-save',
    label: 'Daily brief + save',
    hint: 'Daybook + vault archive (not pack input)',
    needs_desk: true,
    variants: ['desk'],
  },
  // --- Band B: Notes ---
  {
    action: 'research',
    label: 'Research',
    hint: 'One question · load house+risks · optional save',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'coverage',
    label: 'Coverage note',
    hint: 'Full init/update skeleton · optional save',
    needs_desk: true,
    variants: ['desk'],
  },
  // --- Band C: Models / finance templates ---
  {
    action: 'comps',
    label: 'Comps',
    hint: 'Peers you supply + pack subject · optional save',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'ebitda-bridge',
    label: 'EBITDA bridge',
    hint: 'P&L → EBITDA stack · your lines · optional save',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'model-bridge',
    label: 'Model bridge',
    hint: 'FCF / assumptions framework · not a PT · optional save',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'ebitda-quality',
    label: 'EBITDA quality',
    hint: 'Adj. vs reported audit · needs paste · optional save',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'model-audit',
    label: 'Model audit',
    hint: 'Check pasted/saved model vs pack · optional save',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'street',
    label: 'Street agent',
    hint: 'Street room · firm models + house/risk context · refresh or rebuild',
    needs_desk: true,
    variants: ['desk'],
  },
  // --- Band D: Book ops ---
  {
    action: 'risk-check',
    label: 'Risk check',
    hint: 'DD one risk vs tripwires · no status write',
    needs_desk: true,
    needs_risk: true,
    variants: ['desk', 'risk', 'register'],
    default_for: ['risk'],
  },
  {
    action: 'risk-add',
    label: 'Add risk',
    hint: 'Research + propose NEW risk · glass ACCEPT',
    needs_desk: true,
    variants: ['desk', 'register'],
    default_for: ['register'],
  },
  {
    action: 'risk-tripwires',
    label: 'Risk tripwires',
    hint: 'Research tripwires · propose set · glass ACCEPT',
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
  // --- Band E: Meta ---
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
    hint: 'Full /cockpit slash menu',
    needs_desk: false,
    variants: ['desk', 'risk', 'register', 'house'],
  },
];

// Catalog actions + legacy Street aliases (prompt still resolves; not shown in menus).
const ALLOWED_ACTIONS = new Set([
  ...GROK_AGENTS.map((a) => a.action),
  'street-build',
  'street-refresh',
]);
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
  let core;
  if (opts.prompt && typeof opts.prompt === 'string') {
    const p = opts.prompt.trim().slice(0, 240);
    if (p.startsWith('/cockpit')) core = p;
  }
  if (!core) {
    const action = String(opts.action || 'daily').toLowerCase();
    const desk = String(opts.desk || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    const riskArg = sanitizeRiskArg(opts.risk_name, opts.risk_id);
    const tickerArg = sanitizeTickerArg(opts.ticker);

    if (!ALLOWED_ACTIONS.has(action) && action !== 'menu') {
      core = '/cockpit';
    } else {
      const withDesk = (cmd) => (desk ? `${cmd} ${desk}` : cmd);
      const withDeskRisk = (cmd) => {
        const base = withDesk(cmd);
        return riskArg ? `${base} ${riskArg}` : base;
      };

      switch (action) {
        case 'new-desk':
          core = tickerArg ? `/cockpit-new-desk ${tickerArg}` : '/cockpit-new-desk';
          break;
        case 'daily':
          core = withDesk('/cockpit-daily');
          break;
        case 'research':
          core = withDesk('/cockpit-research');
          break;
        case 'coverage':
          core = withDesk('/cockpit-coverage');
          break;
        case 'comps':
          core = withDesk('/cockpit-comps');
          break;
        case 'model-bridge':
          core = withDesk('/cockpit-model-bridge');
          break;
        case 'model-audit':
          core = withDesk('/cockpit-model-audit');
          break;
        case 'ebitda-bridge':
          core = withDesk('/cockpit-ebitda-bridge');
          break;
        case 'ebitda-quality':
          core = withDesk('/cockpit-ebitda-quality');
          break;
        case 'street':
        case 'street-build': // legacy alias → unified Street agent
        case 'street-refresh': // legacy alias → unified Street agent
        {
          // Embed mode in slash args so agent gets PIPELINE even if seed file is missed.
          // Glass REFRESH STREET sends mode=pipeline → /cockpit-street tsm pipeline
          const rawMode = String(opts.mode || '').toLowerCase().trim();
          let streetMode = 'chat';
          if (rawMode === 'pipeline' || rawMode === 'refresh' || rawMode === 'rebuild') {
            streetMode = 'pipeline';
          } else if (rawMode === 'chat') {
            streetMode = 'chat';
          } else if (action === 'street-build' || action === 'street-refresh') {
            streetMode = 'pipeline';
          }
          const parts = ['/cockpit-street'];
          if (desk) parts.push(desk);
          parts.push(streetMode);
          core = parts.join(' ');
          break;
        }
        case 'daily-save':
          core = desk ? `/cockpit-daily ${desk} --save` : '/cockpit-daily --save';
          break;
        case 'risk-check':
          core = withDeskRisk('/cockpit-risk-check');
          break;
        case 'risk-add':
          core = withDesk('/cockpit-risk-add');
          break;
        case 'risk-tripwires':
          core = withDeskRisk('/cockpit-risk-tripwires');
          break;
        case 'steelman':
          core = withDesk('/cockpit-steelman');
          break;
        case 'match':
          core = withDesk('/cockpit-match');
          break;
        case 'propose':
          core = withDesk('/cockpit-propose');
          break;
        case 'pending':
          core = withDesk('/cockpit-pending');
          break;
        case 'desks':
          core = '/cockpit-desks';
          break;
        case 'menu':
        default:
          core = '/cockpit';
          break;
      }
    }
  }

  // Multi-scenario isolation: prepend pin check when .cockpit-scenario.json exists
  const repoForPin = process.env.COCKPIT_REPO || DEFAULT_REPO;
  const preamble = scenarioPinPreamble(repoForPin);
  return preamble ? `${preamble}${core}` : core;
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

  // Street room: write page + house + risk seed for the agent (read-only context pack).
  // mode: pipeline (REFRESH STREET) | chat (OPEN GROK / agents menu default).
  let street_seed = null;
  if (action === 'street' || action === 'street-build' || action === 'street-refresh') {
    try {
      const seedMode = action === 'street-refresh' || action === 'street-build'
        ? (opts.mode || 'pipeline')
        : (opts.mode || 'chat');
      street_seed = writeStreetAgentSeed(opts.desk || ticker || '', { mode: seedMode });
    } catch (e) {
      street_seed = { ok: false, error: e.message || String(e) };
    }
  }

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
      street_seed: street_seed && street_seed.ok
        ? {
          path: street_seed.path,
          bytes: street_seed.bytes,
          ticker: street_seed.ticker,
          mode: street_seed.mode || null,
          firm_count: street_seed.firm_count,
          street_available: street_seed.street_available,
        }
        : null,
      street_seed_error: street_seed && !street_seed.ok ? (street_seed.error || 'seed failed') : null,
      mcp_project: mcpPin.ok ? mcpPin.path : null,
      mcp_project_error: mcpPin.ok ? null : mcpPin.error,
      note: street_seed?.ok
        ? `Opened Terminal → Grok Build with Street seed (${street_seed.mode || 'chat'} · page + house + risks). Agent: /cockpit-street.`
        : 'Opened Terminal → Grok Build (cwd=this monorepo; project MCP pin for cockpit-research).',
      decision_support_only: true,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
