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
import { resolveThesisRegister, shortRegisterToken, normalizeThesisPace } from './researchRunsSchema.js';
import { spawnResearchWorker } from './researchRunsWorker.js';
import {
  findInFlightRun,
  attachWorker,
  patchRunMeta,
  failResearchRun,
  researchRunDir,
  tickerId as researchTickerId,
} from './thinResearchRuns.js';

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
  // Retired glass catalog; pipeline/tests may still POST this action.
  'research-compile',
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
          core = parts.join(' ');
          break;
        }
        case 'coverage':
          core = withDesk('/cockpit-coverage');
          break;
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

  // Research runs: deep compile archive seed, or thesis-lane seed.
  let research_seed = null;
  if (action === 'research-compile' || action === 'thesis-report' || action === 'model-read') {
    try {
      research_seed = writeResearchRunsAgentSeed(opts.desk || ticker || '', {
        mode: opts.mode || 'chat',
        run_id: opts.run_id || opts.runId || null,
        job: action === 'thesis-report'
          ? 'thesis_report'
          : action === 'model-read'
            ? 'model_read'
            : (opts.job || 'deep_compile'),
        thesis_mode: opts.thesis_mode || opts.thesisMode || null,
        register_scope: opts.register_scope || opts.registerScope || null,
        register_ids: opts.register_ids || opts.registerIds || null,
        thesis_pace: opts.thesis_pace || opts.thesisPace || null,
      });
    } catch (e) {
      research_seed = { ok: false, error: e.message || String(e) };
    }
  }

  // Pipeline launches must be self-contained: if the slash-command file fails to load
  // or the agent stops at a menu, the execute directive + seed path are still in the
  // prompt itself (2026-08-20 — NEW COMPILE opened Grok idle; fire-and-forget hardening).
  let launchPrompt = initial;
  // Thesis report is interactive (checkpoints). Never headless deep-compile worker.
  const researchPipeline = !!(
    research_seed?.ok
    && research_seed.mode === 'pipeline'
    && research_seed.job !== 'thesis_report'
    && research_seed.job !== 'model_read'
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

  const cmd = headless?.ok
    ? `clear; echo 'Grok pipeline running HEADLESS (pid ${headless.pid}) — live log below. No typing needed.'; tail -n 40 -f ${shellQuote(headless.log)}`
    : `cd ${shellQuote(repo)} && ${shellQuote(grok)} ${shellQuote(launchPrompt)}`;

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
    }
    let note = 'Opened Terminal → Grok Build (cwd=this monorepo; project MCP pin for cockpit-research).';
    if (street_seed?.ok) {
      note = `Opened Terminal → Grok Build with Street seed (${street_seed.mode || 'chat'} · page + house + risks). Agent: /cockpit-street.`;
    } else if (model_seed?.ok) {
      note = `Opened Terminal → Grok Build with Model seed (${model_seed.mode || 'chat'} · assumptions + house + risks). Agent: /cockpit-model.`;
    } else if (research_seed?.ok && research_seed.job === 'model_read') {
      note = `Opened Terminal → Grok Build with model-read seed (run ${research_seed.run_id || '—'}). Agent: /cockpit-model-read. PDF explains the ledger.`;
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
      mcp_project: mcpPin.ok ? mcpPin.path : null,
      mcp_project_error: mcpPin.ok ? null : mcpPin.error,
      note,
      decision_support_only: true,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}
