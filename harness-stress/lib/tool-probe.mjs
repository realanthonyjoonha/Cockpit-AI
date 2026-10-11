/**
 * Exercise all 24 cockpit-research tools over MCP stdio.
 * The server runs from a throwaway copy. Product thin-desks.json is not edited.
 * No XAI key is forwarded to the child.
 */
import { spawnSync } from 'node:child_process';
import {
  cpSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { countTokens } from './tokens.mjs';
import { loadSectors } from './sector-check.mjs';
import { houseCloseout } from '../../memory-cockpit-v2/scripts/house-closeout.mjs';
import { readHouseWriteAudit } from '../../memory-cockpit-v2/server/thinHouseSave.js';
import { CORE_TOOLS } from '../../memory-cockpit-v2/server/mcpToolCatalog.js';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const GLASS = path.join(REPO, 'memory-cockpit-v2');

const HOUSE = `---
status: CONFIRMED
updated: 2026-01-15
owner: harness-fixture
---

# House View — Demo Fixture (DEMO)

**Stance:** Fixture only. The fixture engine is subscription software sold to Northwind.

This file is a harness fixture. It is not a house view of a covered issuer. Decision-support only.

CANARY-HOUSE-ALPHA
`;

const RISKS = `# 08 fixture

### R1 — Fixture concentration

- **Status:** WATCH · **Grade:** [B] · one named customer in the fixture
- **Mechanism:** Northwind is the only customer named in this fixture.

| Signal | Tripwire | Current state | As-of |
| --- | --- | --- | --- |
| Customer count | second customer named | Northwind only | 2026-01-15 |
| Share | share above half | 80% of fixture revenue | 2026-01-15 |
`;

const CONFIRMED_DRAFT = `---
status: CONFIRMED
updated: 2026-02-01
owner: harness-fixture
---

# House View — Demo Fixture (DEMO)

**Stance:** Fixture only. The fixture engine is subscription software sold to Northwind. CANARY-EDIT-BETA.

Decision-support only. Harness fixture.
`;

const FORMING_DRAFT = `---
status: FORMING
---

# House · **FORMING**

Scaffold. Not the book yet.
`;

function claim(id, text, asOf, grade = 'A') {
  return { id, text, as_of: asOf, grade, source_id: 'fixture' };
}

function demoPack() {
  return {
    focus: { ticker: 'DEMO', id: 'demo' },
    compiled_at: '2026-01-15T00:00:00Z',
    house_prior: {
      play: 'fixture',
      status: 'CONFIRMED',
      date: '2026-01-15',
      view_excerpt: 'The fixture engine is subscription software sold to Northwind.',
    },
    claims: [
      claim('sep', 'Net sales were $111 million', '2026-9-30'),
      claim('oct', 'Net sales were $222 million', '2026-10-01'),
      claim('cash-clean', 'Cash and cash equivalents were $90 million', '2026-06-01'),
      claim('cash-guid', 'Cash and cash equivalents were $90 million. See guidance.', '2026-06-02'),
      claim('outlook', 'Outlook for next quarter revenue is $100 million', '2026-06-01'),
      claim('new-cash', 'Cash was $222 million', '2026-07-01'),
      claim('qual', 'CANARY-SEGMENTS the fixture reports exactly 3 segments', '2026-06-01'),
      claim('emp', 'Number of employees was 4242', '2026-06-01'),
      claim('gw', 'A goodwill balance of $5 billion', '2026-05-01'),
    ],
    risks: [{
      id: 'demo-r1',
      name: 'R1 — Fixture concentration',
      status: 'WATCH',
      grade: 'B',
      summary: 'Northwind is the only customer named in this fixture.',
      order: 1,
      tripwires: [
        { signal: 'Customer count', state: 'Northwind only', tripwire: 'second customer named' },
      ],
    }],
    risk_summary: { count: 1, watch: ['R1 — Fixture concentration'], fired: [] },
    gaps: ['GAP-CANARY-TAIL'],
    object: { id: 'demo', name: 'Demo Fixture', ticker: 'DEMO', summary: 'harness fixture' },
  };
}

function fatPack() {
  const pack = demoPack();
  const blob = 'FAT-PACK '.repeat(1500);
  pack.claims = [
    claim('fat1', `Net sales were $10 million ${blob}`, '2026-01-01'),
    claim('fat2', `Gross margin was 61% ${blob}`, '2026-02-01'),
    claim('fat3', `Operating income was $4 million ${blob}`, '2026-03-01'),
  ];
  pack.house_prior.view_excerpt = `HEAD-EXCERPT ${'H'.repeat(4000)}`;
  return pack;
}

function deskRow(slug, ticker, label) {
  return {
    slug,
    ticker,
    id: slug,
    label,
    mark: ticker.slice(0, 1),
    house_file: `house-view-${slug}.md`,
    profile: {
      displayName: label,
      entitySlug: slug,
      rawDir: `raw/${slug}-research`,
      risksSource: `raw/${slug}-research/08-risks-catalysts.md`,
      risksGenerated: `raw/${slug}-research/risks`,
      sourcePrimaryRe: slug,
      houseTitleDefault: `House View — ${label}`,
    },
  };
}

function deskRegistry() {
  const base = JSON.parse(readFileSync(path.join(GLASS, 'config/thin-desks.json'), 'utf8'));
  const sectors = loadSectors().issuers.map((issuer) => deskRow(
    issuer.id,
    String(issuer.id).toUpperCase(),
    `${issuer.sector} fixture`,
  ));
  return {
    ...base,
    desks: [deskRow('demo', 'DEMO', 'DEMO FIXTURE'), ...sectors],
  };
}

function childEnv(sandbox, extra = {}) {
  const env = {
    PATH: process.env.PATH || '/usr/bin:/bin',
    HOME: process.env.HOME || '/tmp',
    TMPDIR: process.env.TMPDIR || '/tmp',
    LANG: 'C.UTF-8',
    COCKPIT_VAULT: path.join(sandbox, 'research-wiki'),
    ONTOLOGY_STORE: path.join(sandbox, 'store'),
    ONTOLOGY_ROOT: path.join(REPO, 'ontology'),
    COCKPIT_GO_COMMIT_NO_COMPILE: '1',
  };
  delete env.XAI_API_KEY;
  return { ...env, ...extra };
}

function buildSandbox() {
  const sandbox = path.join(tmpdir(), `cockpit-tool-sandbox-${process.pid}`);
  rmSync(sandbox, { recursive: true, force: true });
  mkdirSync(sandbox, { recursive: true });
  cpSync(GLASS, path.join(sandbox, 'memory-cockpit-v2'), {
    recursive: true,
    filter: (src) => !src.split(path.sep).includes('node_modules'),
  });
  symlinkSync(
    path.join(GLASS, 'node_modules'),
    path.join(sandbox, 'memory-cockpit-v2', 'node_modules'),
  );
  writeFileSync(
    path.join(sandbox, 'memory-cockpit-v2/config/thin-desks.json'),
    JSON.stringify(deskRegistry(), null, 2),
  );
  const vault = path.join(sandbox, 'research-wiki');
  mkdirSync(path.join(vault, 'cockpit/lib'), { recursive: true });
  mkdirSync(path.join(vault, 'cockpit/proposals'), { recursive: true });
  mkdirSync(path.join(vault, 'raw/demo-research/risks'), { recursive: true });
  const fm = path.join(REPO, 'research-wiki/cockpit/lib/fm.js');
  if (existsSync(fm)) cpSync(fm, path.join(vault, 'cockpit/lib/fm.js'));
  writeFileSync(path.join(vault, 'house-view-demo.md'), HOUSE);
  writeFileSync(path.join(vault, 'raw/demo-research/08-risks-catalysts.md'), RISKS);
  for (const issuer of loadSectors().issuers) {
    const dir = path.join(vault, 'raw', `${issuer.id}-research`, 'risks');
    mkdirSync(dir, { recursive: true });
    writeFileSync(
      path.join(vault, `house-view-${issuer.id}.md`),
      `---\nstatus: CONFIRMED\n---\n\nSECTOR-FIXTURE-${issuer.id}\n`,
    );
    writeFileSync(path.join(vault, 'raw', `${issuer.id}-research`, '08-risks-catalysts.md'), RISKS);
  }
  const store = path.join(sandbox, 'store');
  mkdirSync(store, { recursive: true });
  writeFileSync(path.join(store, 'DEMO.json'), JSON.stringify(demoPack(), null, 2));
  return sandbox;
}

function clip(text, n = 2500) {
  const s = String(text || '');
  if (s.length <= n) return s;
  return `${s.slice(0, n)}\n…[truncated ${s.length} chars]`;
}

async function loadSdk() {
  const root = path.join(GLASS, 'node_modules/@modelcontextprotocol/sdk/dist/esm');
  const clientMod = await import(pathToFileURL(path.join(root, 'client/index.js')).href);
  const stdioMod = await import(pathToFileURL(path.join(root, 'client/stdio.js')).href);
  return { Client: clientMod.Client, StdioClientTransport: stdioMod.StdioClientTransport };
}

async function connect(sandbox, extraEnv = {}) {
  const { Client, StdioClientTransport } = await loadSdk();
  const script = path.join(sandbox, 'memory-cockpit-v2/scripts/mcp-cockpit-research.mjs');
  let stderr = '';
  const transport = new StdioClientTransport({
    command: process.execPath,
    args: [script],
    env: childEnv(sandbox, extraEnv),
    stderr: 'pipe',
    cwd: sandbox,
  });
  transport.stderr?.on('data', (buf) => {
    stderr += buf.toString();
    if (stderr.length > 20_000) stderr = stderr.slice(-20_000);
  });
  const client = new Client({ name: 'harness-stress', version: '0.1.0' });
  await client.connect(transport);
  return {
    client,
    transport,
    stderr: () => stderr,
  };
}

async function call(client, name, args) {
  const t0 = Date.now();
  try {
    const res = await client.callTool({ name, arguments: args });
    const text = (res.content || []).map((c) => c.text || '').join('\n');
    let parsed = null;
    try { parsed = JSON.parse(text); } catch { /* prose or mixed */ }
    return {
      thrown: false,
      isError: !!res.isError,
      ms: Date.now() - t0,
      chars: text.length,
      tokens: countTokens(text),
      retry_hint: /retry|backoff|try again/i.test(text),
      ok_field: parsed && Object.prototype.hasOwnProperty.call(parsed, 'ok') ? parsed.ok : null,
      next: parsed?.next != null ? String(parsed.next).slice(0, 300) : null,
      retryable: parsed && Object.prototype.hasOwnProperty.call(parsed, 'retryable') ? parsed.retryable : null,
      error: parsed?.error ? String(parsed.error).slice(0, 500) : null,
      excerpt: clip(text),
      flags: {
        has_sep_111: text.includes('$111'),
        has_oct_222: text.includes('$222'),
        has_canary_segments: text.includes('CANARY-SEGMENTS'),
        has_house_alpha: text.includes('CANARY-HOUSE-ALPHA'),
        has_gap: text.includes('GAP-CANARY-TAIL'),
        has_guidance_metric: /revenue_guide/.test(text),
      },
    };
  } catch (e) {
    const msg = e?.message || String(e);
    return {
      thrown: true,
      isError: true,
      ms: Date.now() - t0,
      chars: msg.length,
      tokens: countTokens(msg),
      retry_hint: /retry|backoff|try again/i.test(msg),
      ok_field: null,
      next: null,
      retryable: null,
      error: msg.slice(0, 800),
      excerpt: clip(msg, 1200),
      flags: {},
    };
  }
}

function schemaStats(tools) {
  const rows = tools.map((t) => {
    const body = JSON.stringify({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    });
    return {
      name: t.name,
      description_chars: (t.description || '').length,
      schema_chars: body.length,
      schema_tokens: countTokens(body),
      required: t.inputSchema?.required || [],
      properties: Object.keys(t.inputSchema?.properties || {}),
    };
  });
  const all = JSON.stringify(tools.map((t) => ({
    name: t.name,
    description: t.description || '',
    inputSchema: t.inputSchema || {},
  })));
  return {
    tool_count: tools.length,
    per_tool: rows,
    catalog_chars: all.length,
    catalog_tokens: countTokens(all),
  };
}

function jaccard(a, b) {
  const wa = new Set(String(a || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  const wb = new Set(String(b || '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w.length > 3));
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter += 1;
  const union = wa.size + wb.size - inter;
  return union ? inter / union : 0;
}

export async function toolProbe() {
  const productDesksBefore = readFileSync(path.join(GLASS, 'config/thin-desks.json'), 'utf8');
  const sandbox = buildSandbox();
  const calls = [];
  let listed = [];
  let stderrHead = '';
  let acceptPass = null;
  try {
    const session = await connect(sandbox);
    const listedRes = await session.client.listTools();
    listed = listedRes.tools || [];
    const names = new Set(listed.map((t) => t.name));

    async function run(id, name, args) {
      const row = { id, name, args, ...(await call(session.client, name, args)) };
      calls.push(row);
      return row;
    }

    await run('list', 'list_desks', {});
    await run('unknown-desk', 'get_pack_snapshot', { desk: 'no-such-desk' });
    await run('missing-desk', 'get_pack_snapshot', {});
    await run('desk-type', 'get_pack_snapshot', { desk: 12 });
    await run('house', 'get_house_view', { desk: 'demo' });
    await run('pack', 'get_pack_snapshot', { desk: 'demo' });
    await run('assist', 'get_house_assist_context', { desk: 'demo', goal: 'steelman the fixture' });
    await run('risk-sor', 'get_risk_sor', { desk: 'demo', risk_name: 'R1' });
    await run('metric-sor', 'get_metric_sor', { desk: 'demo' });
    await run('add-metric', 'propose_add_metric', {
      desk: 'demo',
      title: 'Fixture metric',
      summary: 'should not write',
    });
    await run('list-house-empty', 'list_house_proposals', { desk: 'demo' });
    await run('list-risk-empty', 'list_risk_proposals', { desk: 'demo' });
    await run('list-driver-empty', 'list_driver_proposals', { desk: 'demo' });
    await run('accept-status', 'agent_accept_status', {});
    const housePath = path.join(sandbox, 'research-wiki/house-view-demo.md');
    const beforeForming = readFileSync(housePath, 'utf8');
    await run('propose-forming', 'propose_house_view', {
      desk: 'demo',
      markdown: FORMING_DRAFT,
      intent: 'go',
    });
    const formingWrote = readFileSync(housePath, 'utf8') !== beforeForming;
    await run('propose-save-draft', 'propose_house_view', {
      desk: 'demo',
      markdown: CONFIRMED_DRAFT,
      intent: 'save_draft',
    });
    const proposed = await run('propose-confirmed', 'propose_house_view', {
      desk: 'demo',
      markdown: CONFIRMED_DRAFT,
      intent: 'go',
      rationale: 'harness fixture propose',
    });
    let proposalId = null;
    try {
      const parsed = JSON.parse(proposed.excerpt.startsWith('{') ? proposed.excerpt : '{}');
      proposalId = parsed?.proposal?.id || null;
    } catch { /* excerpt may be clipped; re-read from a dedicated field */ }
    if (!proposalId) {
      const again = calls.find((c) => c.id === 'propose-confirmed');
      const m = /hp_[a-z0-9_]+/i.exec(again?.excerpt || '');
      proposalId = m ? m[0] : null;
    }
    await run('commit-save-draft', 'commit_on_go', {
      desk: 'demo',
      kind: 'house',
      proposal_id: proposalId || 'missing',
      utterance: 'SAVE DRAFT',
    });
    await run('commit-go', 'commit_on_go', {
      desk: 'demo',
      kind: 'house',
      proposal_id: proposalId || 'missing',
      utterance: 'GO',
    });
    await run('from-current', 'propose_house_from_current', {
      desk: 'demo',
      replacements: [{ find: 'CANARY-EDIT-BETA', replace: 'CANARY-EDIT-GAMMA' }],
      intent: 'go',
    });
    await run('risk-bad-status', 'propose_risk_status', {
      desk: 'demo',
      risk_name: 'R1',
      to_status: 'BUY',
    });
    await run('risk-status', 'propose_risk_status', {
      desk: 'demo',
      risk_name: 'R1',
      to_status: 'WATCH',
      rationale: 'fixture unchanged',
    });
    await run('register-early', 'commit_on_go', {
      desk: 'demo',
      kind: 'register',
      utterance: 'GO',
    });
    for (let i = 1; i <= 4; i++) {
      await run(`add-risk-${i}`, 'propose_add_risk', {
        desk: 'demo',
        title: `Fixture risk ${i}`,
        summary: `Harness risk ${i} for the register gate`,
        mechanism: 'Fixture mechanism only',
        status: 'WATCH',
        grade: 'B',
        tripwires: [{ signal: 's', tripwire: 't', state: 'now', as_of: '2026-01-15' }],
      });
    }
    await run('register-go', 'commit_on_go', {
      desk: 'demo',
      kind: 'register',
      utterance: 'GO',
    });
    await run('tripwires', 'propose_risk_tripwires', {
      desk: 'demo',
      risk_name: 'R1',
      tripwires: [{ signal: 'Customer count', tripwire: 'second customer', state: 'Northwind only', as_of: '2026-01-15' }],
    });
    await run('drivers-list', 'list_house_driver_candidates', { desk: 'demo' });
    await run('drivers-sor', 'get_driver_sor', { desk: 'demo' });
    const driversPath = path.join(sandbox, 'research-wiki/raw/demo-research/09-drivers.md');
    const beforeKeep = existsSync(driversPath) ? readFileSync(driversPath, 'utf8') : null;
    await run('keep-as-drivers', 'commit_on_go', {
      desk: 'demo',
      kind: 'drivers',
      utterance: 'KEEP',
    });
    const afterKeep = existsSync(driversPath) ? readFileSync(driversPath, 'utf8') : null;
    const keepWrote = beforeKeep !== afterKeep;
    for (const issuer of loadSectors().issuers) {
      await run(`sector-${issuer.id}`, 'get_house_view', { desk: issuer.id });
    }
    await run('sector-unknown', 'get_pack_snapshot', { desk: 'no-sector-desk' });
    await run('driver-keep', 'propose_keep_driver', {
      desk: 'demo',
      title: 'Subscription software',
      house_cite: 'The fixture engine is subscription software sold to Northwind.',
      watching: 'Northwind concentration in the fixture',
    });
    await run('driver-skip', 'propose_skip_driver', {
      desk: 'demo',
      title: 'Unused heading',
      house_cite: 'The fixture engine is subscription software sold to Northwind.',
    });
    await run('driver-log', 'propose_driver_log', {
      desk: 'demo',
      driver: 'Subscription software',
      date: '2026-02-01',
      via: 'note',
      fact: 'Fixture log line',
    });
    await run('drivers-go', 'commit_on_go', {
      desk: 'demo',
      kind: 'drivers',
      utterance: 'GO',
    });
    await run('accept-house-denied', 'accept_house_proposal', {
      desk: 'demo',
      proposal_id: proposalId || 'hp_missing',
    });
    await run('accept-risk-denied', 'accept_risk_proposal', {
      desk: 'demo',
      proposal_id: 'rp_missing',
    });

    const houseAfterTools = readFileSync(path.join(sandbox, 'research-wiki/house-view-demo.md'), 'utf8');
    const beforeBash = houseAfterTools.length;
    const bash = spawnSync('sh', ['-c', 'printf "\\nBASH-BYPASS-CANARY\\n" >> "$1"', 'sh', path.join(sandbox, 'research-wiki/house-view-demo.md')], {
      encoding: 'utf8',
    });
    const houseAfterBash = readFileSync(path.join(sandbox, 'research-wiki/house-view-demo.md'), 'utf8');
    const sandboxVault = path.join(sandbox, 'research-wiki');
    const houseAudit = readHouseWriteAudit(sandboxVault, 'house-view-demo.md', houseAfterBash, { exists: true });
    const houseClose = houseCloseout('demo', { vault: sandboxVault });

    writeFileSync(
      path.join(sandbox, 'store/DEMO.json'),
      JSON.stringify(fatPack()),
    );
    const fat = await run('pack-fat', 'get_pack_snapshot', { desk: 'demo' });

    stderrHead = session.stderr().slice(0, 2000);
    await session.client.close();

    const coreSession = await connect(sandbox, { COCKPIT_MCP_TOOL_PROFILE: 'core' });
    const coreListed = (await coreSession.client.listTools()).tools || [];
    const coreLazy = await call(coreSession.client, 'propose_risk_tripwires', {
      desk: 'demo',
      tripwires: [{ signal: 's', tripwire: 't', state: 'now', as_of: '2026-01-15' }],
    });
    await coreSession.client.close();
    const coreStats = schemaStats(coreListed);

    const overlapPairs = [];
    for (let i = 0; i < listed.length; i++) {
      for (let j = i + 1; j < listed.length; j++) {
        const score = jaccard(listed[i].description, listed[j].description);
        if (score >= 0.25) {
          overlapPairs.push({
            a: listed[i].name,
            b: listed[j].name,
            jaccard: Number(score.toFixed(3)),
          });
        }
      }
    }
    overlapPairs.sort((a, b) => b.jaccard - a.jaccard);

    const stats = schemaStats(listed);
    const coreNames = CORE_TOOLS.slice();
    const coreTokens = stats.per_tool
      .filter((t) => coreNames.includes(t.name))
      .reduce((s, t) => s + t.schema_tokens, 0);

    acceptPass = { skipped: false };
    const session2 = await connect(sandbox, { COCKPIT_AGENT_ACCEPT: '1' });
    const proposed2 = await call(session2.client, 'propose_house_view', {
      desk: 'demo',
      markdown: CONFIRMED_DRAFT,
      intent: 'go',
      rationale: 'second propose for accept grant',
    });
    const idMatch = /hp_[a-z0-9_]+/i.exec(proposed2.excerpt || '');
    const accept = await call(session2.client, 'accept_house_proposal', {
      desk: 'demo',
      proposal_id: idMatch ? idMatch[0] : 'hp_missing',
    });
    acceptPass = {
      propose_error: proposed2.error,
      accept_thrown: accept.thrown,
      accept_ok_field: accept.ok_field,
      accept_error: accept.error,
      accept_excerpt: clip(accept.excerpt, 600),
    };
    await session2.client.close();

    const productDesksAfter = readFileSync(path.join(GLASS, 'config/thin-desks.json'), 'utf8');

    const catalog = listed.map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    }));

    return {
      catalog,
      sandbox_removed_later: true,
      product_desks_unchanged: productDesksBefore === productDesksAfter,
      tool_names: listed.map((t) => t.name),
      missing_from_expected: expectedNames().filter((n) => !names.has(n)),
      extra: listed.map((t) => t.name).filter((n) => !expectedNames().includes(n)),
      schema: {
        ...stats,
        core_names: coreNames,
        core_schema_tokens: coreTokens,
        full_vs_core_token_delta: stats.catalog_tokens - coreTokens,
      },
      overlap_pairs: overlapPairs.slice(0, 15),
      calls,
      bash_bypass: {
        exit: bash.status,
        bytes_before: beforeBash,
        bytes_after: houseAfterBash.length,
        appended: houseAfterBash.includes('BASH-BYPASS-CANARY'),
        go_utterance_required: false,
        audit_state: houseAudit.state,
        audit_mismatch: houseAudit.mismatch === true,
        gap: houseAudit.gap,
        house_closeout_pass: houseClose.pass === true,
      },
      fat_pack: {
        chars: fat.chars,
        tokens: fat.tokens,
        over_10000_chars: fat.chars > 10_000,
      },
      forming_wrote: formingWrote,
      keep_wrote: keepWrote,
      core_profile: {
        names: coreListed.map((t) => t.name),
        schema_tokens: coreStats.catalog_tokens,
        tool_count: coreStats.tool_count,
        lazy_call: {
          ok_field: coreLazy.ok_field,
          error: coreLazy.error,
          next: coreLazy.next,
          retryable: coreLazy.retryable,
        },
      },
      house_has_alpha_after_tools: houseAfterTools.includes('CANARY-HOUSE-ALPHA')
        || houseAfterTools.includes('CANARY-EDIT-BETA')
        || houseAfterTools.includes('CANARY-EDIT-GAMMA'),
      stderr_head: stderrHead,
      accept_grant_pass: acceptPass,
    };
  } finally {
    rmSync(sandbox, { recursive: true, force: true });
  }
}

function expectedNames() {
  return [
    'list_desks',
    'get_house_view',
    'get_pack_snapshot',
    'get_house_assist_context',
    'propose_house_view',
    'propose_house_from_current',
    'commit_on_go',
    'list_house_proposals',
    'propose_risk_status',
    'propose_add_risk',
    'list_risk_proposals',
    'get_risk_sor',
    'list_house_driver_candidates',
    'propose_keep_driver',
    'propose_driver_log',
    'propose_skip_driver',
    'get_driver_sor',
    'list_driver_proposals',
    'propose_risk_tripwires',
    'agent_accept_status',
    'accept_house_proposal',
    'accept_risk_proposal',
  ];
}
