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
import { writeWorkingModelAgentSeed } from './workingModelAgentSeed.js';
import { writeResearchRunsAgentSeed } from './researchRunsAgentSeed.js';
import { writeLearnAgentSeed } from './learnAgentSeed.js';
import { resolveThesisRegister, resolveThesisDrivers, shortRegisterToken, normalizeThesisPace } from './researchRunsSchema.js';
import { spawnResearchWorker } from './researchRunsWorker.js';
import {
  findInFlightRun,
  attachWorker,
  patchRunMeta,
  failResearchRun,
  researchRunDir,
  getResearchRun,
  tickerId as researchTickerId,
} from './thinResearchRuns.js';

function waitPidFile(file, timeoutMs = 4000) {
  const t0 = Date.now();
  const spin = new Int32Array(new SharedArrayBuffer(4));
  while (Date.now() - t0 < timeoutMs) {
    try {
      if (fs.existsSync(file)) {
        const n = parseInt(String(fs.readFileSync(file, 'utf8')).trim(), 10);
        if (Number.isInteger(n) && n > 1) return n;
      }
    } catch { /* */ }
    Atomics.wait(spin, 0, 0, 80);
  }
  return null;
}

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
  {
    action: 'background',
    label: 'Background',
    hint: 'Product spine + HTML architecture · Background room',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'tutor',
    label: 'Company tutor',
    hint: 'Personalized teach in Grok · remembers this desk',
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
    action: 'model-desk',
    label: 'Model desk',
    hint: 'Working assumptions + bridge vault · not PT · glass Model room',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'model-read',
    label: 'Model read',
    hint: 'Explain Model numbers → taught PDF · Model room',
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
  {
    action: 'thesis-report',
    label: 'Thesis report',
    hint: 'Checkpointed IB note + PDF · Reports room',
    needs_desk: true,
    variants: ['desk'],
  },
  {
    action: 'filing-map',
    label: 'Filing map',
    hint: 'SEC accession → house / register · Overview MAP FILINGS · on demand',
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
    hint: 'Research + propose NEW risk · GO / glass ACCEPT',
    needs_desk: true,
    variants: ['desk', 'register'],
  },
  {
    action: 'register-session',
    label: 'Edit register in Grok',
    hint: 'Dump 08 · GO writes register · SAVE DRAFT Grok-only · EDIT revises',
    needs_desk: true,
    variants: ['desk', 'register'],
    default_for: ['register'],
  },
  {
    action: 'risk-tripwires',
    label: 'Risk tripwires',
    hint: 'Research tripwires · propose set · GO / glass ACCEPT',
    needs_desk: true,
    needs_risk: true,
    variants: ['desk', 'risk', 'register'],
  },
  {
    action: 'drivers-session',
    label: 'Edit drivers in Grok',
    hint: 'Name engines · GO writes 09 · SAVE DRAFT Grok-only · EDIT revises',
    needs_desk: true,
    variants: ['desk', 'drivers'],
    default_for: ['drivers'],
  },
  {
    action: 'driver-add',
    label: 'Add driver',
    hint: 'Research + propose a NEW driver · GO writes',
    needs_desk: true,
    variants: ['desk', 'drivers'],
  },
  {
    action: 'driver-check',
    label: 'Driver check',
    hint: 'Print, news, or on demand · GO appends one log line · does not rewrite the house',
    needs_desk: true,
    needs_risk: true,
    variants: ['desk', 'driver', 'drivers'],
    default_for: ['driver'],
  },
  {
    action: 'driver-monitors',
    label: 'Add open question',
    hint: 'Add one still-open question · GO appends it · not a risk tripwire',
    needs_desk: true,
    needs_risk: true,
    variants: ['desk', 'driver', 'drivers'],
  },
  {
    action: 'driver-research-print',
    label: 'Latest print',
    hint: 'On demand · what the last print said about this driver',
    needs_desk: true,
    needs_risk: true,
    variants: ['driver'],
  },
  {
    action: 'driver-research-news',
    label: 'News since last',
    hint: 'On demand · headlines since the last check',
    needs_desk: true,
    needs_risk: true,
    variants: ['driver'],
  },
  {
    action: 'driver-research-open',
    label: 'Open questions',
    hint: 'On demand · work one still-open question',
    needs_desk: true,
    needs_risk: true,
    variants: ['driver'],
  },
  {
    action: 'driver-research-note',
    label: 'Log a finding',
    hint: 'On demand · append what you just found. Do not rewrite the house',
    needs_desk: true,
    needs_risk: true,
    variants: ['driver'],
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
    label: 'Edit house in Grok',
    hint: 'Dump in Grok · GO writes · SAVE DRAFT Grok-only · EDIT revises',
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
    variants: ['desk', 'risk', 'register', 'house', 'drivers', 'driver'],
  },
];

// Catalog actions + legacy Street aliases (prompt still resolves; not shown in menus).
const ALLOWED_ACTIONS = new Set([
  ...GROK_AGENTS.map((a) => a.action),
  'street-build',
  'street-refresh',
  // Study Tree per-node deep-dive (not in the desk AGENTS dropdown — needs node_id).
  'learn-deepen',
  // Retired glass catalog; pipeline/tests may still POST this action.
  'research-compile',
]);
const ALLOWED_VARIANTS = new Set(['desk', 'risk', 'register', 'house', 'start', 'drivers', 'driver']);

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
      drivers: 'POST /api/open-grok { action, desk } — drivers menu (edit / add / check / monitors).',
      driver: 'POST /api/open-grok { action, desk, risk_id?, risk_name? } — driver-detail seed.',
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
        case 'research-compile':
        {
          const rawMode = String(opts.mode || '').toLowerCase().trim();
          let rMode = 'chat';
          if (rawMode === 'pipeline' || rawMode === 'refresh' || rawMode === 'compile') {
            rMode = 'pipeline';
          } else if (rawMode === 'chat') {
            rMode = 'chat';
          }
          const parts = ['/cockpit-research-compile'];
          if (desk) parts.push(desk);
          parts.push(rMode);
          const rid = String(opts.run_id || opts.runId || '').replace(/[^A-Za-z0-9._-]/g, '');
          if (rid) parts.push(rid);
          core = parts.join(' ');
          break;
        }
        case 'thesis-report':
        {
          const tMode = String(opts.thesis_mode || opts.thesisMode || '').toLowerCase().trim();
          const reportMode = (
            tMode === 'deep-dive' || tMode === 'initiation' || tMode === 'earnings-update'
          ) ? tMode : 'earnings-update';
          const parts = ['/cockpit-report'];
          if (desk) parts.push(desk);
          parts.push(reportMode);
          const reg = resolveThesisRegister(opts);
          if (reg.register_scope === 'pick' && reg.register_ids.length) {
            const labels = [...new Set(reg.register_ids.map(shortRegisterToken))];
            parts.push('pick', labels.join(','));
          } else {
            parts.push(reg.register_scope);
          }
          parts.push(normalizeThesisPace(opts.thesis_pace || opts.thesisPace));
          const drv = resolveThesisDrivers(opts);
          if (drv.driver_scope === 'all') parts.push('drivers-all');
          else if (drv.driver_scope === 'pick' && drv.driver_ids.length) {
            parts.push('drivers-pick', drv.driver_ids.join(','));
          }
          core = parts.join(' ');
          break;
        }
        case 'filing-map':
        {
          const parts = ['/cockpit-filing-map'];
          if (desk) parts.push(desk);
          const rid = String(opts.run_id || opts.runId || '').replace(/[^A-Za-z0-9._-]/g, '');
          if (rid) parts.push(rid);
          const rawMode = String(opts.mode || '').toLowerCase().trim();
          if (rawMode === 'chat') parts.push('chat');
          core = parts.join(' ');
          break;
        }
        case 'coverage':
          core = withDesk('/cockpit-coverage');
          break;
        case 'background':
        {
          const parts = ['/cockpit-learn'];
          if (desk) parts.push(desk);
          parts.push('primer');
          core = parts.join(' ');
          break;
        }
        case 'tutor':
        {
          const parts = ['/cockpit-learn'];
          if (desk) parts.push(desk);
          parts.push('tutor');
          core = parts.join(' ');
          break;
        }
        case 'learn-deepen':
        {
          const nid = String(opts.node_id || opts.nodeId || '')
            .toLowerCase()
            .replace(/[^a-z0-9._-]+/g, '-')
            .replace(/^-+|-+$/g, '')
            .slice(0, 64);
          const parts = ['/cockpit-learn'];
          if (desk) parts.push(desk);
          parts.push('deepen');
          if (nid) parts.push(nid);
          core = parts.join(' ');
          break;
        }
        case 'comps':
          core = withDesk('/cockpit-comps');
          break;
        case 'model-read':
        {
          const parts = ['/cockpit-model-read'];
          if (desk) parts.push(desk);
          const rid = String(opts.run_id || opts.runId || '').replace(/[^A-Za-z0-9._-]/g, '');
          if (rid) parts.push(rid);
          core = parts.join(' ');
          break;
        }
        case 'model-desk':
        {
          const rawMode = String(opts.mode || '').toLowerCase().trim();
          let modelMode = 'chat';
          if (rawMode === 'pipeline' || rawMode === 'refresh' || rawMode === 'rebuild' || rawMode === 'update') {
            modelMode = 'pipeline';
          } else if (rawMode === 'chat') {
            modelMode = 'chat';
          }
          const parts = ['/cockpit-model'];
          if (desk) parts.push(desk);
          parts.push(modelMode);
          core = parts.join(' ');
          break;
        }
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
        case 'register-session':
          core = withDesk('/cockpit-register') + ' --session';
          break;
        case 'risk-tripwires':
          core = withDeskRisk('/cockpit-risk-tripwires');
          break;
        case 'drivers-session':
          core = withDesk('/cockpit-drivers') + ' --session';
          break;
        case 'driver-add':
          core = withDesk('/cockpit-driver-add');
          break;
        case 'driver-check':
          core = withDeskRisk('/cockpit-driver-check');
          break;
        case 'driver-monitors':
          core = withDeskRisk('/cockpit-driver-monitors');
          break;
        case 'driver-research-print':
          core = `${withDeskRisk('/cockpit-driver-research')} --print`;
          break;
        case 'driver-research-news':
          core = `${withDeskRisk('/cockpit-driver-research')} --news`;
          break;
        case 'driver-research-open':
          core = `${withDeskRisk('/cockpit-driver-research')} --open`;
          break;
        case 'driver-research-note':
          core = `${withDeskRisk('/cockpit-driver-research')} --note`;
          break;
        case 'steelman':
          core = withDesk('/cockpit-steelman');
          break;
        case 'match':
          core = withDesk('/cockpit-match');
          break;
        case 'propose':
          core = withDesk('/cockpit-propose') + ' --session';
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

  // Model desk: working assumptions seed (pipeline = UPDATE MODEL).
  let model_seed = null;
  if (action === 'model-desk') {
    try {
      model_seed = writeWorkingModelAgentSeed(opts.desk || ticker || '', {
        mode: opts.mode || 'chat',
      });
    } catch (e) {
      model_seed = { ok: false, error: e.message || String(e) };
    }
  }

  let learn_seed = null;
  if (action === 'background' || action === 'tutor' || action === 'learn-deepen') {
    try {
      const seedMode = action === 'background'
        ? 'primer'
        : (action === 'learn-deepen' ? 'deepen' : (opts.mode || 'tutor'));
      learn_seed = writeLearnAgentSeed(opts.desk || ticker || '', {
        mode: seedMode,
        node_id: opts.node_id || opts.nodeId,
      });
    } catch (e) {
      learn_seed = { ok: false, error: e.message || String(e) };
    }
    if (action === 'learn-deepen' && !learn_seed?.ok) {
      return {
        ok: false,
        error: learn_seed?.error || 'learn-deepen seed failed',
        action,
        desk: opts.desk || null,
        node_id: opts.node_id || opts.nodeId || null,
        decision_support_only: true,
      };
    }
  }

  // Research runs: deep compile archive seed, or thesis-lane seed.
  let research_seed = null;
  if (action === 'research-compile' || action === 'thesis-report' || action === 'model-read' || action === 'filing-map') {
    try {
      research_seed = writeResearchRunsAgentSeed(opts.desk || ticker || '', {
        mode: opts.mode || 'chat',
        run_id: opts.run_id || opts.runId || null,
        job: action === 'thesis-report'
          ? 'thesis_report'
          : action === 'model-read'
            ? 'model_read'
            : action === 'filing-map'
              ? 'filing_map'
              : (opts.job || 'deep_compile'),
        thesis_mode: opts.thesis_mode || opts.thesisMode || null,
        register_scope: opts.register_scope || opts.registerScope || null,
        register_ids: opts.register_ids || opts.registerIds || null,
        thesis_pace: opts.thesis_pace || opts.thesisPace || null,
        driver_scope: opts.driver_scope || opts.driverScope || null,
        driver_ids: opts.driver_ids || opts.driverIds || null,
      });
    } catch (e) {
      research_seed = { ok: false, error: e.message || String(e) };
    }
  }

  // Pipeline launches must be self-contained: if the slash-command file fails to load
  // or the agent stops at a menu, the execute directive + seed path are still in the
  // prompt itself (2026-08-20 — NEW COMPILE opened Grok idle; fire-and-forget hardening).
  let launchPrompt = initial;
  if (learn_seed?.ok && action === 'learn-deepen') {
    launchPrompt = `${initial}\n\nDEEPEN — product-mechanism deep-dive on one Study Tree node. `
      + `First read the seed file: ${learn_seed.path} . `
      + `Pace through — do not wait at checkpoints. POST /api/${learn_seed.slug || '{slug}'}/learn/deep when the note is ready. `
      + `No house chapter, no register, no propose_*, no thesis PDF pipeline. Decision-support only.`;
  }
  // Thesis report is interactive (checkpoints). Never headless deep-compile worker.
  const researchPipeline = !!(
    research_seed?.ok
    && research_seed.mode === 'pipeline'
    && research_seed.job !== 'thesis_report'
    && research_seed.job !== 'model_read'
    && research_seed.job !== 'filing_map'
  );
  if (researchPipeline) {
    launchPrompt = `${initial}\n\nPIPELINE MODE — execute the research job now; do not stop at a menu or ask which desk. `
      + `First read the seed file: ${research_seed.path} . `
      + `run_id ${research_seed.run_id || '(in seed)'} is already created (status=queued until worker attach); `
      + `write only under that run folder and publish via the API in the seed. Decision-support only.`;
  } else if (research_seed?.ok && research_seed.job === 'model_read') {
    launchPrompt = `${initial}\n\nMODEL READ — execute /cockpit-model-read; do not stop at a menu. `
      + `First read the seed file: ${research_seed.path} . `
      + `run_id ${research_seed.run_id || '(in seed)'} is already created. `
      + `Read numbers-graph.json first. Do not invent consensus or YOUR CASE. `
      + `PDF is ops, never pack SoR. Do not propose house/risks. Decision-support only.`;
  } else if (research_seed?.ok && research_seed.job === 'filing_map') {
    const chat = research_seed.mode === 'chat';
    launchPrompt = chat
      ? (`${initial}\n\nFILING MAP CHAT — talk to the existing run; do not start a second map. `
        + `First read the seed file: ${research_seed.path} . `
        + `run_id ${research_seed.run_id || '(in seed)'}. Read inbox.json + delta.json. `
        + `House/risks only via propose_*. Decision-support only.`)
      : (`${initial}\n\nFILING MAP — execute /cockpit-filing-map; do not stop at a menu. `
        + `First read the seed file: ${research_seed.path} . `
        + `run_id ${research_seed.run_id || '(in seed)'} is already created. `
        + `Read inbox.json first. Map only those accessions. Pace through. Do not propose_*. `
        + `Publish summary + rows. Decision-support only.`);
  } else if (research_seed?.ok && research_seed.job === 'thesis_report') {
    const through = research_seed.thesis_pace === 'through';
    launchPrompt = `${initial}\n\nTHESIS LANE — execute /cockpit-report; do not stop at a menu. `
      + `First read the seed file: ${research_seed.path} . `
      + `run_id ${research_seed.run_id || '(in seed)'} is already created. `
      + (through
        ? 'PACE through — do not wait at Checkpoint 1 or 2. Still POST each checkpoint. Closeout via propose_* only; never silent-write house/risks. '
        : 'STOP at skill checkpoints. ')
      + `PDF is ops, never pack SoR. Decision-support only.`;
  }

  // Research PIPELINE: OS-agnostic headless spawn. Canonical artifacts live in the run
  // folder. Same-desk mutex: refuse a second grok if this desk/run already has a live worker.
  let headless = null;
  if (researchPipeline) {
    const tkr = research_seed.ticker || researchTickerId(opts.ticker || opts.desk);
    const spawned = spawnResearchWorker({
      ticker: tkr,
      run_id: research_seed.run_id,
      desk: opts.desk,
      job: research_seed.job,
      prompt: launchPrompt,
      seed_path: research_seed.path,
      grok,
      repo,
      deps: {
        findInFlightRun,
        attachWorker,
        patchRunMeta,
        failResearchRun,
        researchRunDir,
      },
    });
    if (spawned?.already_in_flight) {
      return {
        ok: true,
        already_in_flight: true,
        run_id: spawned.run_id,
        pid: spawned.pid || null,
        repo,
        grok,
        action,
        desk: opts.desk || null,
        ticker: tkr,
        initial_prompt: initial,
        note: `Run ${spawned.run_id} already in flight — did not spawn a second grok.`,
        decision_support_only: true,
      };
    }
    if (!spawned?.ok) {
      if (research_seed.run_id && tkr) {
        try { failResearchRun(tkr, research_seed.run_id, spawned?.error || 'pipeline spawn failed'); } catch { /* */ }
      }
      return {
        ok: false,
        error: spawned?.error || 'pipeline spawn failed',
        decision_support_only: true,
      };
    }
    headless = { ok: true, log: spawned.log, prompt_file: spawned.prompt_file, pid: spawned.pid };
  }

  if (!researchPipeline && process.platform !== 'darwin') {
    return {
      ok: false,
      error: 'open-grok only supported on macOS Terminal right now',
    };
  }

  const runTicker = research_seed?.ticker || (opts.ticker ? researchTickerId(opts.ticker) : null);
  const runDir = (research_seed?.ok && research_seed.run_id && runTicker)
    ? researchRunDir(runTicker, research_seed.run_id)
    : null;
  let liveRun = null;
  if (runDir && research_seed.run_id && runTicker) {
    try { liveRun = getResearchRun(runTicker, research_seed.run_id); } catch { liveRun = null; }
  }
  const trackInteractive = !!(
    runDir
    && !headless?.ok
    && liveRun
    && (liveRun.status === 'queued' || liveRun.status === 'running')
  );
  const pidFile = trackInteractive ? path.join(runDir, 'terminal.pid') : null;

  const cmd = headless?.ok
    ? `clear; echo 'Grok pipeline running HEADLESS (pid ${headless.pid}) — live log below. No typing needed.'; tail -n 40 -f ${shellQuote(headless.log)}`
    : (pidFile
      ? `cd ${shellQuote(repo)} && tty > ${shellQuote(path.join(runDir, 'terminal.tty'))} && printf '%s\\n' $$ > ${shellQuote(pidFile)} && exec ${shellQuote(grok)} ${shellQuote(launchPrompt)}`
      : `cd ${shellQuote(repo)} && ${shellQuote(grok)} ${shellQuote(launchPrompt)}`);

  const script = `tell application "Terminal"
  activate
  do script ${JSON.stringify(cmd)}
end tell`;

  try {
    if (process.platform === 'darwin') {
      const child = spawn('osascript', ['-e', script], {
        detached: true,
        stdio: 'ignore',
      });
      child.unref();
      if (pidFile && research_seed?.run_id && runTicker) {
        const pid = waitPidFile(pidFile, 4000);
        if (pid) {
          try {
            attachWorker(runTicker, research_seed.run_id, {
              pid,
              spawned_at: new Date().toISOString(),
              prompt: launchPrompt.slice(0, 200),
              seed: research_seed.path || null,
            });
          } catch { /* queued→running is best-effort; cancel still matches run_id */ }
        }
      }
    }
    let note = 'Opened Terminal → Grok Build (cwd=this monorepo; project MCP pin for cockpit-research).';
    if (street_seed?.ok) {
      note = `Opened Terminal → Grok Build with Street seed (${street_seed.mode || 'chat'} · page + house + risks). Agent: /cockpit-street.`;
    } else if (learn_seed?.ok) {
      note = `Opened Terminal → Grok Build with learn seed (${learn_seed.mode || 'tutor'}). Agent: /cockpit-learn. Primer + tutor memory — not pack.`;
    } else if (model_seed?.ok) {
      note = `Opened Terminal → Grok Build with Model seed (${model_seed.mode || 'chat'} · assumptions + house + risks). Agent: /cockpit-model.`;
    } else if (research_seed?.ok && research_seed.job === 'model_read') {
      note = `Opened Terminal → Grok Build with model-read seed (run ${research_seed.run_id || '—'}). Agent: /cockpit-model-read. PDF explains the ledger.`;
    } else if (research_seed?.ok && research_seed.job === 'filing_map') {
      note = `Opened Terminal → Grok Build with filing-map seed (run ${research_seed.run_id || '—'}). Agent: /cockpit-filing-map. Map is ops, not pack.`;
    } else if (research_seed?.ok && research_seed.job === 'thesis_report') {
      note = `Opened Terminal → Grok Build with thesis-report seed (${research_seed.thesis_mode || 'earnings-update'} · run ${research_seed.run_id || '—'}). Agent: /cockpit-report. PDF is ops, not pack.`;
    } else if (research_seed?.ok) {
      note = `Opened Terminal → Grok Build with Research seed (${research_seed.mode || 'chat'} · run ${research_seed.run_id || '—'}). Agent: /cockpit-research-compile.`;
    }
    if (headless?.ok) {
      note = process.platform === 'darwin'
        ? `Grok pipeline running HEADLESS (pid ${headless.pid}) · run ${research_seed?.run_id || '—'} · Terminal shows live log tail. Log: ${headless.log}`
        : `Grok pipeline running HEADLESS (pid ${headless.pid}) · run ${research_seed?.run_id || '—'} · log ${headless.log}`;
    }
    return {
      ok: true,
      repo,
      grok,
      action,
      desk: opts.desk || null,
      ticker: ticker || null,
      risk_id: opts.risk_id || null,
      risk_name: opts.risk_name || null,
      node_id: opts.node_id || opts.nodeId || learn_seed?.node_id || null,
      initial_prompt: initial,
      headless: headless?.ok ? { pid: headless.pid, log: headless.log } : null,
      headless_error: headless && !headless.ok ? headless.error : null,
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
      model_seed: model_seed && model_seed.ok
        ? {
          path: model_seed.path,
          bytes: model_seed.bytes,
          ticker: model_seed.ticker,
          mode: model_seed.mode || null,
          assumption_count: model_seed.assumption_count,
          model_available: model_seed.model_available,
        }
        : null,
      model_seed_error: model_seed && !model_seed.ok ? (model_seed.error || 'seed failed') : null,
      research_seed: research_seed && research_seed.ok
        ? {
          path: research_seed.path,
          bytes: research_seed.bytes,
          ticker: research_seed.ticker,
          mode: research_seed.mode || null,
          run_id: research_seed.run_id || null,
          job: research_seed.job || null,
          n_runs: research_seed.n_runs,
        }
        : null,
      research_seed_error: research_seed && !research_seed.ok ? (research_seed.error || 'seed failed') : null,
      learn_seed: learn_seed && learn_seed.ok
        ? {
          path: learn_seed.path,
          bytes: learn_seed.bytes,
          ticker: learn_seed.ticker,
          mode: learn_seed.mode || null,
        }
        : null,
      learn_seed_error: learn_seed && !learn_seed.ok ? (learn_seed.error || 'seed failed') : null,
      mcp_project: mcpPin.ok ? mcpPin.path : null,
      mcp_project_error: mcpPin.ok ? null : mcpPin.error,
      note,
      decision_support_only: true,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
