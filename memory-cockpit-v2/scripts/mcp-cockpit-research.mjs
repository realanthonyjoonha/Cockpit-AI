#!/usr/bin/env node
/**
 * MCP server: cockpit-research (controlled agent environment).
 *
 * Primary host:  Grok Build  (npm run grok:mcp-install / agent:mcp-install)
 * Future host:   Claude Code / Desktop  (npm run claude:mcp-install)
 * Also works:    any MCP client (Codex, etc.) pointing at this script.
 *
 * Tools: read book + propose_house_view (draft store only).
 * House file written ONLY when human ACCEPT on glass (not by MCP).
 * Decision-support only. No API key in the glass.
 */
import {
  proposeHouse,
  proposeHouseFromCurrent,
  listHouseProposals,
  acceptHouseProposal,
} from '../server/houseProposals.js';
import {
  proposeRiskStatus,
  proposeAddRisk,
  proposeRiskTripwires,
  listRiskProposals,
  getSorRiskSnapshot,
  readSorStatusMap,
  resolveDisplayStatus,
  acceptRiskProposal,
} from '../server/riskProposals.js';
import { readFileSync, existsSync, realpathSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
/** Monorepo / kernel root (parent of memory-cockpit-v2). MCP desks come from THIS tree only. */
const REPO_ROOT = path.resolve(ROOT, '..');

if (!process.env.COCKPIT_VAULT) {
  process.env.COCKPIT_VAULT = path.join(REPO_ROOT, 'research-wiki');
}
if (!process.env.ONTOLOGY_STORE) {
  process.env.ONTOLOGY_STORE = path.join(REPO_ROOT, 'ontology', 'store', 'by_ticker');
}
if (!process.env.ONTOLOGY_ROOT) {
  process.env.ONTOLOGY_ROOT = path.join(REPO_ROOT, 'ontology');
}

// Scenario pin file → env (fail-closed multi-cockpit isolation)
const {
  assertMcpPin,
  loadScenarioFileIntoEnv,
  assertAgentAcceptAllowed,
  appendAgentAcceptAudit,
  isAgentAcceptEnabled,
} = await import(path.join(ROOT, 'server', 'mcpPinGuard.js'));
loadScenarioFileIntoEnv(REPO_ROOT);

function pinGuard(deskSlug) {
  return assertMcpPin({
    repoRoot: REPO_ROOT,
    vault: process.env.COCKPIT_VAULT,
    deskSlug,
  });
}

/** Full house markdown from allowlisted path (large payloads without stuffing MCP args). */
function readAllowlistedMarkdownFile(filePath) {
  const abs = path.resolve(String(filePath || ''));
  let tmpRoot;
  try { tmpRoot = realpathSync(os.tmpdir()); } catch { tmpRoot = path.resolve(os.tmpdir()); }
  const propRoot = path.resolve(path.join(process.env.COCKPIT_VAULT, 'cockpit', 'proposals'));
  const under = (root) => abs === root || abs.startsWith(root + path.sep);
  if (!under(tmpRoot) && !under(propRoot)) {
    throw new Error('markdown_path must be under os.tmpdir() or vault cockpit/proposals/');
  }
  if (!existsSync(abs)) throw new Error(`markdown_path not found: ${abs}`);
  return readFileSync(abs, 'utf8');
}

const { loadPack } = await import(path.join(ROOT, 'server', 'pack.js'));
const { readHouseMarkdown } = await import(path.join(ROOT, 'server', 'thinHouseSave.js'));
const { buildHouseAssistContext } = await import(path.join(ROOT, 'server', 'assistContext.js'));
const { getLiveThinDeskProfiles } = await import(path.join(ROOT, 'server', 'thinDeskProfiles.js'));

/**
 * Live registry (mtime cache) — same source of truth as glass thin-desks.
 * Do NOT freeze desks at process start; new rows in thin-desks.json appear on next tool call.
 */
function liveRegistry() {
  return getLiveThinDeskProfiles();
}

function deskCatalogHint() {
  const { registry: REG, registryPath, mtimeMs } = liveRegistry();
  const known = (REG.desks || []).map((d) => d.slug);
  return (
    `known: ${known.length ? known.join(', ') : '(none)'}` +
    ` · registry: ${registryPath}` +
    ` · registry_mtime_ms: ${mtimeMs}` +
    ` · monorepo: ${REPO_ROOT}` +
    ` · vault: ${process.env.COCKPIT_VAULT}` +
    ` · (MCP reloads thin-desks.json on change; monorepo must be THIS install)`
  );
}

function resolveDesk(slugOrTicker) {
  pinGuard(); // expect_root + vault under monorepo
  const { registry: REG, bySlug: DESK_BUNDLES } = liveRegistry();
  const q = String(slugOrTicker || '').trim().toLowerCase();
  if (!q) throw new Error(`desk required (slug or ticker). ${deskCatalogHint()}`);
  const bySlug = (REG.desks || []).find((d) => d.slug === q);
  if (bySlug) {
    pinGuard(bySlug.slug);
    const bundle = DESK_BUNDLES[bySlug.slug];
    if (!bundle) throw new Error(`no profile for ${bySlug.slug}`);
    return { desk: bySlug, profile: bundle.model };
  }
  const byTicker = (REG.desks || []).find((d) => String(d.ticker).toLowerCase() === q);
  if (byTicker) {
    pinGuard(byTicker.slug);
    const bundle = DESK_BUNDLES[byTicker.slug];
    if (!bundle) throw new Error(`no profile for ${byTicker.slug}`);
    return { desk: byTicker, profile: bundle.model };
  }
  // aliases (e.g. tsmc → tsm)
  for (const d of REG.desks || []) {
    const aliases = Array.isArray(d.aliases) ? d.aliases : [];
    if (aliases.some((a) => String(a).toLowerCase() === q)) {
      pinGuard(d.slug);
      const bundle = DESK_BUNDLES[d.slug];
      if (!bundle) throw new Error(`no profile for ${d.slug}`);
      return { desk: d, profile: bundle.model };
    }
  }
  throw new Error(`unknown desk "${q}" — ${deskCatalogHint()}`);
}

function textResult(obj) {
  const text = typeof obj === 'string' ? obj : JSON.stringify(obj, null, 2);
  return { content: [{ type: 'text', text }] };
}

const server = new McpServer({ name: 'cockpit-research', version: '1.0.0' });

server.tool('list_desks', 'List thin desks (slug, ticker, house_file) for THIS MCP monorepo install.', {}, async () => {
  let pin;
  try {
    pin = pinGuard();
  } catch (e) {
    return textResult({
      ok: false,
      pin_ok: false,
      error: String(e?.message || e),
      monorepo_root: REPO_ROOT,
      expect_root: process.env.COCKPIT_EXPECT_ROOT || null,
      allowed_slugs: process.env.COCKPIT_ALLOWED_SLUGS || null,
      note: 'STOP — wrong MCP pin. install-grok-mcp from the correct monorepo; OPEN GROK from that glass only.',
    });
  }
  const { registry: REG, bySlug, registryPath, mtimeMs } = liveRegistry();
  const desks = (REG.desks || []).map((d) => {
    const p = bySlug[d.slug]?.model;
    return {
      slug: d.slug,
      ticker: d.ticker,
      id: d.id,
      label: d.label,
      house_file: d.house_file || p?.houseFile || null,
    };
  });
  const allowed = process.env.COCKPIT_ALLOWED_SLUGS
    ? new Set(
        String(process.env.COCKPIT_ALLOWED_SLUGS)
          .split(/[\s,]+/)
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean),
      )
    : null;
  const foreign = allowed
    ? desks.filter((d) => !allowed.has(String(d.slug).toLowerCase())).map((d) => d.slug)
    : [];
  return textResult({
    ok: true,
    pin_ok: true,
    desks,
    monorepo_root: REPO_ROOT,
    expect_root: process.env.COCKPIT_EXPECT_ROOT || null,
    allowed_slugs: process.env.COCKPIT_ALLOWED_SLUGS || null,
    scenario: process.env.COCKPIT_SCENARIO_NAME || null,
    foreign_slugs_in_registry: foreign,
    pin,
    vault: process.env.COCKPIT_VAULT,
    ontology_store: process.env.ONTOLOGY_STORE,
    registry: registryPath,
    registry_mtime_ms: mtimeMs,
    registry_live: true,
    host_hint: 'Primary: Grok Build. Optional later: Claude Code. Same tools either way.',
    note:
      'Desks = config/thin-desks.json (re-read on file change — long Grok sessions pick up new desks). ' +
      'If a desk is missing, confirm monorepo MCP pin (project .grok/config.toml) points at THIS clone. ' +
      'If pin_ok is false or monorepo_root is wrong, STOP. ACCEPT house/risks on glass only.',
  });
});

server.tool(
  'get_house_view',
  'Read vault house-view markdown for a desk.',
  { desk: z.string().describe('slug or ticker, e.g. nbis') },
  async ({ desk }) => {
    const { desk: d, profile } = resolveDesk(desk);
    const houseFile = d.house_file || profile.houseFile;
    const raw = readHouseMarkdown(houseFile);
    return textResult({
      slug: d.slug,
      ticker: d.ticker,
      house_file: houseFile,
      exists: raw.exists,
      path: raw.path,
      markdown: raw.markdown,
      write_policy: 'Do not write house directly. Use propose_house_view; user ACCEPTs on glass.',
      decision_support_only: true,
    });
  },
);

server.tool(
  'get_pack_snapshot',
  'Compiled pack + SoR-aware risk statuses (WATCH/FIRED). Use for daily/risk-check/steelman. Tripwires from pack (compile for full sync).',
  { desk: z.string() },
  async ({ desk }) => {
    const { desk: d, profile } = resolveDesk(desk);
    const ticker = d.ticker || profile.ticker;
    const { available, pack, path: packPath, reason } = loadPack(ticker, { force: true });
    if (!available || !pack) {
      return textResult({ available: false, ticker, reason, pack_path: packPath });
    }
    const claims = Array.isArray(pack.claims) ? pack.claims : [];
    const ranked = [...claims].sort((a, b) => {
      const ga = a.grade === 'A' ? 0 : a.grade === 'B' ? 1 : 2;
      const gb = b.grade === 'A' ? 0 : b.grade === 'B' ? 1 : 2;
      if (ga !== gb) return ga - gb;
      return String(b.as_of || '').localeCompare(String(a.as_of || ''));
    }).slice(0, 10);

    // Same SoR overlay as glass risks/overview — pack.risk_summary alone lags after ACCEPT
    let sorMap = null;
    try {
      sorMap = readSorStatusMap(profile.risksSource);
    } catch { /* no SoR */ }
    const packRisks = Array.isArray(pack.risks) ? pack.risks : [];
    const risks = packRisks.map((r) => {
      const disp = resolveDisplayStatus(r.status, r.name, sorMap);
      return {
        id: r.id,
        name: r.name,
        status: disp.status,
        status_source: disp.status_source,
        pack_status: r.status || null,
        grade: r.grade || null,
        summary: (r.summary || '').slice(0, 200),
        order: r.order,
        tripwire_count: Array.isArray(r.tripwires) ? r.tripwires.length : 0,
      };
    }).sort((a, b) => (a.order ?? 99) - (b.order ?? 99));

    const watch = risks.filter((r) => r.status === 'WATCH').map((r) => r.name);
    const fired = risks.filter((r) => r.status === 'FIRED').map((r) => r.name);
    const sorLag = risks.some((r) => r.status_source === 'sor');
    const packSummary = pack.risk_summary || {};

    return textResult({
      available: true,
      ticker,
      slug: d.slug,
      compiled_at: pack.compiled_at || null,
      pack_path: packPath,
      house_prior: pack.house_prior || null,
      // Prefer SoR-aware lists (what glass ON WATCH uses)
      risk_summary: {
        count: risks.length,
        watch,
        fired,
        pack_watch: packSummary.watch || [],
        pack_fired: packSummary.fired || [],
      },
      risks,
      claims: ranked.map((c) => ({ text: c.text, grade: c.grade, as_of: c.as_of, source_id: c.source_id })),
      gaps: (pack.gaps || []).slice(0, 15),
      sor_ahead_of_pack: sorLag,
      note: sorLag
        ? 'SoR risk status ahead of pack — risk_summary.watch is SoR-aware (includes ACCEPTed WATCH). COMPILE BOOK to sync store.'
        : 'Pack and SoR status aligned. COMPILE BOOK after house/risk SoR edits.',
      decision_support_only: true,
    });
  },
);

server.tool(
  'get_house_assist_context',
  'Full assist pack: rules + pack + vault house. Use before drafting house edits.',
  {
    desk: z.string(),
    goal: z.string().optional().describe('optional user goal'),
  },
  async ({ desk, goal }) => {
    const { desk: d, profile } = resolveDesk(desk);
    const ctx = buildHouseAssistContext({
      ticker: d.ticker || profile.ticker,
      slug: d.slug,
      deskId: d.id || profile.deskId,
      displayName: d.label || profile.displayName,
      houseFile: d.house_file || profile.houseFile,
      userGoal: goal || '',
    });
    return {
      content: [{
        type: 'text',
        text: ctx.clipboard_text
          + '\n\n---\n'
          + JSON.stringify({ chars: ctx.chars, house_exists: ctx.house_exists, compiled_at: ctx.compiled_at }),
      }],
    };
  },
);

server.tool(
  'propose_house_view',
  'Propose house draft (does NOT write vault house). PREFER propose_house_from_current for small edits. Else markdown_path under /tmp, or full markdown. Human ACCEPT on glass.',
  {
    desk: z.string().describe('slug or ticker, e.g. nbis'),
    markdown: z.string().optional().describe('Full house-view markdown. Avoid if large — use markdown_path or propose_house_from_current.'),
    markdown_path: z.string().optional().describe('Absolute path under /tmp or vault cockpit/proposals/'),
    rationale: z.string().optional(),
    summary: z.string().optional(),
  },
  async ({ desk, markdown, markdown_path, rationale, summary }) => {
    const { desk: d, profile } = resolveDesk(desk);
    try {
      let md = markdown;
      if (markdown_path) {
        md = readAllowlistedMarkdownFile(markdown_path);
      }
      if (!md || !String(md).trim()) {
        throw new Error('provide markdown or markdown_path (or use propose_house_from_current)');
      }
      const out = proposeHouse({
        slug: d.slug,
        ticker: d.ticker || profile.ticker,
        houseFile: d.house_file || profile.houseFile,
        markdown: md,
        rationale,
        summary,
        source: 'grok_mcp',
      });
      return textResult({
        ...out,
        glass: `Open http://127.0.0.1:4681/#/${d.slug}/house → review pending proposal → ACCEPT or REJECT`,
        invariant: 'House file unchanged until human ACCEPT. Then COMPILE BOOK + REFRESH.',
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e) });
    }
  },
);

server.tool(
  'propose_house_from_current',
  'EFFICIENT propose: load current vault house, apply exact find→replace (each find must match once), store pending proposal. Prefer this over full-file propose. Does NOT write vault house until glass ACCEPT.',
  {
    desk: z.string().describe('slug or ticker'),
    replacements: z.array(z.object({
      find: z.string().describe('Exact substring in current house (must appear exactly once)'),
      replace: z.string().describe('Replacement text'),
    })).describe('Ordered exact replacements'),
    rationale: z.string().optional().describe('Pack-grounded why'),
    summary: z.string().optional().describe('One-line glass banner'),
  },
  async ({ desk, replacements, rationale, summary }) => {
    const { desk: d, profile } = resolveDesk(desk);
    try {
      const out = proposeHouseFromCurrent({
        slug: d.slug,
        ticker: d.ticker || profile.ticker,
        houseFile: d.house_file || profile.houseFile,
        replacements,
        rationale,
        summary,
        source: 'grok_mcp',
      });
      return textResult({
        ...out,
        glass: `Open http://127.0.0.1:4681/#/${d.slug}/house → REVIEW → ACCEPT or REJECT`,
        invariant: 'Vault house unchanged until human ACCEPT. Then COMPILE BOOK + REFRESH.',
        efficiency: 'Built from current house via exact replacements — do not mine chat history.',
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e) });
    }
  },
);

server.tool(
  'list_house_proposals',
  'List pending/accepted/rejected house proposals for a desk (no full markdown unless pending summary).',
  {
    desk: z.string(),
    status: z.string().optional().describe('pending | accepted | rejected'),
  },
  async ({ desk, status }) => {
    const { desk: d } = resolveDesk(desk);
    try {
      const out = listHouseProposals(d.slug, { status: status || undefined, includeMarkdown: false });
      return textResult({ ...out, decision_support_only: true });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e) });
    }
  },
);

server.tool(
  'propose_risk_status',
  'Propose INTACT|WATCH|FIRED for an existing risk. Does NOT write SoR until glass ACCEPT on risk detail.',
  {
    desk: z.string(),
    risk_id: z.string().optional().describe('pack risk id e.g. nbis-r3-…'),
    risk_name: z.string().optional().describe('e.g. R3 — Customer concentration… or R3'),
    from_status: z.string().optional(),
    to_status: z.string().describe('INTACT | WATCH | FIRED'),
    rationale: z.string().optional(),
    as_of: z.string().optional(),
  },
  async ({ desk, risk_id, risk_name, from_status, to_status, rationale, as_of }) => {
    const { desk: d, profile } = resolveDesk(desk);
    try {
      const out = proposeRiskStatus({
        slug: d.slug,
        ticker: d.ticker || profile.ticker,
        risksSourceRel: profile.risksSource,
        body: {
          risk_id,
          risk_name,
          from_status,
          to_status,
          rationale,
          as_of,
          source: 'grok_mcp',
        },
      });
      return textResult({
        ...out,
        glass: `http://127.0.0.1:4681/#/${d.slug}/risks (open risk detail → ACCEPT)`,
        invariant: 'SoR unchanged until ACCEPT. Then COMPILE BOOK.',
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e) });
    }
  },
);

server.tool(
  'propose_add_risk',
  'Propose NEW risk on register (add_risk). Research first via pack/search; does NOT write SoR until glass ACCEPT on Risks page.',
  {
    desk: z.string(),
    title: z.string().describe('Short name without Rn prefix'),
    summary: z.string().describe('One-line summary for status line'),
    mechanism: z.string().optional().describe('How it hits equity story'),
    grade: z.string().optional().describe('A|B|C default B'),
    status: z.string().optional().describe('INTACT|WATCH|FIRED default WATCH'),
    tripwires: z.array(z.object({
      signal: z.string().optional(),
      tripwire: z.string().optional(),
      state: z.string().optional(),
      as_of: z.string().optional(),
    })).optional(),
    rationale: z.string().optional(),
    as_of: z.string().optional(),
  },
  async (args) => {
    const { desk: d, profile } = resolveDesk(args.desk);
    try {
      const out = proposeAddRisk({
        slug: d.slug,
        ticker: d.ticker || profile.ticker,
        risksSourceRel: profile.risksSource,
        body: {
          title: args.title,
          summary: args.summary,
          mechanism: args.mechanism,
          grade: args.grade,
          status: args.status,
          tripwires: args.tripwires,
          rationale: args.rationale,
          as_of: args.as_of,
          source: 'grok_mcp',
        },
      });
      return textResult({
        ...out,
        glass: `http://127.0.0.1:4681/#/${d.slug}/risks → ACCEPT pending add_risk`,
        invariant: 'SoR unchanged until ACCEPT. Then COMPILE BOOK. Decision-support only.',
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e) });
    }
  },
);

server.tool(
  'list_risk_proposals',
  'List pending/accepted/rejected risk proposals (status_change + add_risk + set_tripwires).',
  {
    desk: z.string(),
    status: z.string().optional().describe('pending | accepted | rejected'),
  },
  async ({ desk, status }) => {
    const { desk: d } = resolveDesk(desk);
    try {
      return textResult({
        ...listRiskProposals(d.slug, { status: status || undefined }),
        glass: `http://127.0.0.1:4681/#/${d.slug}/risks`,
        decision_support_only: true,
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e) });
    }
  },
);

server.tool(
  'get_risk_sor',
  'Read one risk section from vault SoR (status + tripwires). Use before editing tripwires.',
  {
    desk: z.string(),
    risk_id: z.string().optional(),
    risk_name: z.string().optional().describe('e.g. R7 or full heading'),
  },
  async ({ desk, risk_id, risk_name }) => {
    const { desk: d, profile } = resolveDesk(desk);
    try {
      const snap = getSorRiskSnapshot(profile.risksSource, { riskId: risk_id, riskName: risk_name });
      return textResult({
        ok: true,
        slug: d.slug,
        ticker: d.ticker || profile.ticker,
        ...snap,
        decision_support_only: true,
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e) });
    }
  },
);

server.tool(
  'propose_risk_tripwires',
  'Propose tripwire table for an existing risk (replace). Research with user first; SoR writes only on glass ACCEPT.',
  {
    desk: z.string(),
    risk_id: z.string().optional(),
    risk_name: z.string().optional(),
    tripwires: z.array(z.object({
      signal: z.string().optional(),
      tripwire: z.string().optional(),
      state: z.string().optional(),
      as_of: z.string().optional(),
    })).describe('Final list after user cull — only monitors Anthony wants'),
    rationale: z.string().optional(),
    as_of: z.string().optional(),
  },
  async (args) => {
    const { desk: d, profile } = resolveDesk(args.desk);
    try {
      const out = proposeRiskTripwires({
        slug: d.slug,
        ticker: d.ticker || profile.ticker,
        risksSourceRel: profile.risksSource,
        body: {
          risk_id: args.risk_id,
          risk_name: args.risk_name,
          tripwires: args.tripwires,
          rationale: args.rationale,
          as_of: args.as_of,
          source: 'grok_mcp',
        },
      });
      return textResult({
        ...out,
        glass: `http://127.0.0.1:4681/#/${d.slug}/risks → ACCEPT set_tripwires`,
        invariant: 'SoR unchanged until ACCEPT (or agent_accept grant). User should have approved each tripwire.',
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e) });
    }
  },
);

server.tool(
  'agent_accept_status',
  'Whether this monorepo grants agent ACCEPT of house/risk proposals (scenario or COCKPIT_AGENT_ACCEPT=1).',
  {},
  async () => {
    try {
      pinGuard();
    } catch (e) {
      return textResult({ ok: false, pin_ok: false, error: String(e?.message || e) });
    }
    const enabled = isAgentAcceptEnabled();
    return textResult({
      ok: true,
      pin_ok: true,
      agent_accept: enabled,
      monorepo_root: REPO_ROOT,
      scenario: process.env.COCKPIT_SCENARIO_NAME || null,
      note: enabled
        ? 'Agent may call accept_house_proposal / accept_risk_proposal (same write path as glass ACCEPT). Decision-support only.'
        : 'Agent ACCEPT denied — use glass ACCEPT or enable via scenario-up / COCKPIT_AGENT_ACCEPT=1.',
      decision_support_only: true,
    });
  },
);

server.tool(
  'accept_house_proposal',
  'AGENT ACCEPT pending house proposal (writes vault house). Requires agent_accept grant (scenario default on). Same path as glass ACCEPT.',
  {
    desk: z.string(),
    proposal_id: z.string().describe('Pending house proposal id from list_house_proposals'),
  },
  async ({ desk, proposal_id }) => {
    try {
      pinGuard();
      assertAgentAcceptAllowed(REPO_ROOT);
      const { desk: d, profile } = resolveDesk(desk);
      const houseFile = d.house_file || profile.houseFile;
      const out = acceptHouseProposal(d.slug, proposal_id, { houseFile });
      const logPath = appendAgentAcceptAudit(process.env.COCKPIT_VAULT, {
        kind: 'house',
        desk: d.slug,
        proposal_id,
        house_file: houseFile,
        monorepo_root: REPO_ROOT,
        scenario: process.env.COCKPIT_SCENARIO_NAME || null,
        written_path: out.written?.path,
      });
      return textResult({
        ...out,
        agent_accept: true,
        audit_log: logPath,
        note: (out.note || '') + ' Accepted by agent grant (not human glass click). COMPILE BOOK still recommended.',
        decision_support_only: true,
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e), agent_accept: isAgentAcceptEnabled() });
    }
  },
);

server.tool(
  'accept_risk_proposal',
  'AGENT ACCEPT pending risk proposal (writes risks SoR). Requires agent_accept grant. Same path as glass ACCEPT.',
  {
    desk: z.string(),
    proposal_id: z.string().describe('Pending risk proposal id from list_risk_proposals'),
  },
  async ({ desk, proposal_id }) => {
    try {
      pinGuard();
      assertAgentAcceptAllowed(REPO_ROOT);
      const { desk: d, profile } = resolveDesk(desk);
      const out = acceptRiskProposal({
        slug: d.slug,
        id: proposal_id,
        risksSourceRel: profile.risksSource,
      });
      const logPath = appendAgentAcceptAudit(process.env.COCKPIT_VAULT, {
        kind: 'risk',
        desk: d.slug,
        proposal_id,
        risk_kind: out.proposal?.kind,
        monorepo_root: REPO_ROOT,
        scenario: process.env.COCKPIT_SCENARIO_NAME || null,
        written_path: out.written?.path || out.written?.abs,
      });
      return textResult({
        ...out,
        agent_accept: true,
        audit_log: logPath,
        note: (out.note || '') + ' Accepted by agent grant. COMPILE BOOK still recommended.',
        decision_support_only: true,
      });
    } catch (e) {
      return textResult({ ok: false, error: e.message || String(e), agent_accept: isAgentAcceptEnabled() });
    }
  },
);

const transport = new StdioServerTransport();
await server.connect(transport);
