#!/usr/bin/env node
// smoke.mjs — pre-deploy safety net (2026-07-05 hardening). Spawns a throwaway, auth-inert
// server on a test port (COCKPIT_ACCESS_FILE → empty, so the gate is inert) against the REAL
// vault + current dist/, then asserts: every API route returns 200 + a sane shape; the static
// layer serves index.html no-cache, the referenced bundle as immutable JS, and a MISSING bundle
// as a real 404 (the iOS-Safari strand guard); and the vault lint is clean. Optional --render
// pass headless-loads every rail route and checks the page actually mounted content.
//
//   npm run smoke            # fast: API + static + lint (no browser)
//   npm run smoke -- --render   # also headless-render every route (needs Chrome)
//
// Exit 0 = all green; exit 1 = at least one failure (so it can gate a deploy).
import { spawn, spawnSync } from 'child_process';
import { existsSync, rmSync, readFileSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
// readFileSync used for thin-desks.json registry

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Prefer env → monorepo sibling research-wiki → legacy ~/Trading (no tribal path required)
const MONOREPO_VAULT = path.resolve(ROOT, '..', 'research-wiki');
const VAULT = process.env.COCKPIT_VAULT
  || (existsSync(path.join(MONOREPO_VAULT, 'cockpit', 'lib', 'fm.js'))
    ? MONOREPO_VAULT
    : path.join(process.env.HOME || '', 'Trading', 'research-wiki'));
const PORT = 4788;
const BASE = `http://127.0.0.1:${PORT}`;
const ACCESS = `/tmp/mc-smoke-${process.pid}.json`; // nonexistent → auth gate inert
const RENDER = process.argv.includes('--render');
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
/** Ask goldens per thin desk slug → scripts/<slug>-ask-goldens.json */
const askGoldensPath = (slug) => path.join(ROOT, 'scripts', `${slug}-ask-goldens.json`);

let pass = 0, fail = 0;
const ok = (name) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${name}`); };
const bad = (name, msg) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${name} — ${msg}`); };
async function check(name, fn) { try { const m = await fn(); m ? bad(name, m) : ok(name); } catch (e) { bad(name, e.message); } }

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function getJson(pathname) {
  const res = await fetch(BASE + pathname);
  if (res.status !== 200) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// each: [route, validator(json) → falsy if OK, else an error string]
const API = [
  ['/api/overview', (d) => (d && (d.rev || d.sync)) ? '' : 'no rev/sync'],
  ['/api/complex-quotes', (d) => d && Array.isArray(d.quotes) && d.quotes.length === 4 && d.quotes.every((q) => Array.isArray(q.week)) ? '' : 'bad complex-quotes shape'],
  ['/api/cockpit-read', (d) => (d && d.house && Array.isArray(d.whatsNew) && Array.isArray(d.nextUp) && d.disagreements) ? '' : 'missing sections'],
  ['/api/risks', (d) => Array.isArray(d.risks) && d.risks.length ? '' : 'no risks'],
  ['/api/series', (d) => Array.isArray(d.registry) && d.registry.length ? '' : 'no registry'],
  ['/api/desks', (d) => Array.isArray(d) ? '' : 'not array'],
  ['/api/catalysts', (d) => Array.isArray(d.rows) && d.rows.length ? '' : 'no rows'],
  ['/api/reports', (d) => Array.isArray(d) && d.length ? '' : 'no reports'],
  ['/api/street', (d) => d.available && d.companies?.length === 3 ? '' : 'not available / not 3 companies'],
  ['/api/margins', (d) => d.available && d.charts?.length >= 2 && d.charts.every((c) => c.series.every((s) => s.data.length)) ? '' : 'not available / empty chart series'],
  ['/api/leverage-monitor', (d) => d.available && Array.isArray(d.names) && d.names.length === 2 && d.read && d.names.every((n) => n.price != null) ? '' : 'not available / missing live price'],
  ['/api/dram-nowcast', (d) => d.available && d.status && d.usage?.rules?.length && d.effectiveness?.rows?.length === 4 && d.benchmark?.rows?.length ? '' : 'not available / missing sections'],
  ['/api/companies', (d) => Array.isArray(d) && d.length ? '' : 'no companies'],
  ['/api/house', (d) => d ? '' : 'empty'],
  ['/api/analysts', (d) => d ? '' : 'empty'],
  ['/api/background', (d) => d ? '' : 'empty'],
  ['/api/log', (d) => Array.isArray(d) ? '' : 'not array'],
  ['/api/search', (d) => Array.isArray(d) && d.length ? '' : 'empty index'],
];
/** Thin desk registry — single source (config/thin-desks.json). */
const THIN_REG = JSON.parse(readFileSync(path.join(ROOT, 'config/thin-desks.json'), 'utf8'));
const THIN_REQUIRED_ROOMS = THIN_REG.rooms || ['overview', 'risks', 'house', 'sources', 'ask', 'update'];
const THIN_PARITY_GROUP = THIN_REG.parity_group || 'thin_ontology_v1';
const THIN_CONTRACT_VERSION = THIN_REG.contract_version || '1.1';
const THIN_WRITE_PATH_MODE = THIN_REG.write_path_mode || 'meta_only';
/** @type {{ slug: string, ticker: string, desk: string }[]} */
const THIN_DESKS = (THIN_REG.desks || []).map((d) => ({
  slug: d.slug,
  ticker: d.ticker,
  desk: d.id,
}));

function validateThinMeta(d, expect) {
  if (!d || d.desk !== expect.desk || d.ticker !== expect.ticker || d.pack_exists !== true || !d.compiled_at) {
    return `${expect.slug} meta missing pack/identity`;
  }
  const c = d.thin_desk_contract;
  if (!c || c.version !== THIN_CONTRACT_VERSION) return `${expect.slug} thin_desk_contract version want ${THIN_CONTRACT_VERSION}`;
  if (c.parity_group !== THIN_PARITY_GROUP) return `${expect.slug} parity_group want ${THIN_PARITY_GROUP}`;
  if (!c.capabilities?.compile_book) return `${expect.slug} contract: compile_book required`;
  if (!c.capabilities?.refresh_book) return `${expect.slug} contract: refresh_book required`;
  if (!c.capabilities?.pack_ask) return `${expect.slug} contract: pack_ask required`;
  if (!c.capabilities?.write_path) return `${expect.slug} contract: write_path required`;
  if (!c.capabilities?.house_save) return `${expect.slug} contract: house_save required`;
  if (!c.capabilities?.agent_context) return `${expect.slug} contract: agent_context required`;
  if (!c.capabilities?.house_proposals) return `${expect.slug} contract: house_proposals required`;
  if (c.capabilities?.write_path_mode !== THIN_WRITE_PATH_MODE) {
    return `${expect.slug} write_path_mode want ${THIN_WRITE_PATH_MODE} got ${c.capabilities?.write_path_mode}`;
  }
  if (!c.compile?.path || !String(c.compile.path).includes('compile')) return `${expect.slug} contract: compile path`;
  if (!String(c.compile.equivalent_cli || '').includes(expect.ticker)) return `${expect.slug} compile cli ticker`;
  if (!c.house_save?.path || !String(c.house_save.path).includes('house/save')) {
    return `${expect.slug} contract: house_save path`;
  }
  if (!c.agent_context?.path || !String(c.agent_context.path).includes('assist-context')) {
    return `${expect.slug} contract: agent_context path`;
  }
  const rooms = c.rooms || [];
  for (const r of THIN_REQUIRED_ROOMS) {
    if (!rooms.includes(r)) return `${expect.slug} missing room ${r}`;
  }
  return '';
}

/** Path 2A S5 — core thin API checks built from registry (no hard-coded desk list). */
function thinDeskApiChecks(expect) {
  const s = expect.slug;
  const t = expect.ticker;
  return [
    [`/api/${s}/meta`, (d) => validateThinMeta(d, expect)],
    [`/api/${s}/overview`, (d) => (d && d.available && Array.isArray(d.claims) && d.risk_summary && typeof d.risk_summary === 'object') ? '' : `${s} overview shape`],
    [`/api/${s}/risks`, (d) => (d && d.available && Array.isArray(d.risks) && d.risks.length >= 1) ? '' : `${s} risks empty`],
    [`/api/${s}/house`, (d) => {
      if (!d || !d.available || !d.hero || !d.hero.html) return `${s} house missing hero`;
      if (d.editable !== true) return `${s} house must be editable`;
      if (!d.save_path || !String(d.save_path).includes('house/save')) return `${s} house save_path`;
      if (d.source === 'vault' && (typeof d.markdown !== 'string' || !d.markdown.length)) {
        return `${s} vault house must include markdown`;
      }
      return '';
    }],
    [`/api/${s}/sources`, (d) => (d && d.available && Array.isArray(d.sources) && d.sources.length >= 1 && d.counts) ? '' : `${s} sources empty`],
    [`/api/${s}/quote`, (d) => (d && d.ticker === t && d.available === true && ('quote' in d)) ? '' : `${s} quote shape`],
    [`/api/${s}/book`, (d) => (d && d.available && d.compiled_at && d.risks && typeof d.risks.watch === 'number') ? '' : `${s} book shape`],
    [`/api/${s}/write-meta`, (d) => {
      if (!d || !d.available || !d.paths || !d.commands?.compile) return `${s} write-meta shape`;
      if (!d.paths.entity?.path || !d.paths.risks_source?.path || !d.paths.house?.path) return `${s} write-meta paths incomplete`;
      if (!d.paths.entity.exists || !d.paths.house.exists) return `${s} entity or house missing on disk`;
      if (!Array.isArray(d.success_criteria) || d.success_criteria.length < 6) return `${s} success_criteria`;
      if (!d.never?.length) return `${s} never list empty`;
      if (!new RegExp(`compile ${t}`).test(d.commands.compile)) return `${s} compile command`;
      return '';
    }],
  ];
}

// routes to headless-render (the rail); a render throw blanks <main>
const ROUTES = ['cockpit', 'overview', 'risks', 'data', 'desks', 'analysts', 'street', 'margins', 'leverage', 'nowcast', 'reports', 'catalysts', 'log', 'house', 'companies', 'background'];
const THIN_HASH_ROUTES = THIN_DESKS.flatMap((d) =>
  THIN_REQUIRED_ROOMS.map((r) => `${d.slug}/${r}`),
);

async function waitUp(ms = 20000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try { const r = await fetch(BASE + '/'); if (r.status === 200) return true; } catch { /* not yet */ }
    await sleep(200);
  }
  throw new Error('server did not come up');
}

async function main() {
  if (existsSync(ACCESS)) rmSync(ACCESS);
  console.log(`\x1b[1mSMOKE\x1b[0m — spawning auth-inert server on :${PORT} against ${VAULT}\n`);
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')],
    {
      cwd: ROOT,
      env: {
        ...process.env,
        PORT: String(PORT),
        COCKPIT_ACCESS_FILE: ACCESS,
        // Pin monorepo vault for throwaway server (no tribal ~/Trading required)
        COCKPIT_VAULT: process.env.COCKPIT_VAULT || VAULT,
      },
      stdio: 'ignore',
      detached: false,
    });
  try {
    await waitUp();

    console.log('API routes:');
    for (const [route, val] of API) await check(route, async () => val(await getJson(route)));

    // Golden Ask contracts (route + substrings + optional book watch cross-check)
    // Files: scripts/<slug>-ask-goldens.json — every thin desk must have one (fail-closed).
    async function runAskGoldens(slug) {
      console.log(`\n  ${slug} Ask goldens:`);
      const gpath = askGoldensPath(slug);
      let goldens = { cases: [] };
      try {
        goldens = JSON.parse(readFileSync(gpath, 'utf8'));
      } catch (e) {
        await check(`${slug}-ask-goldens.json readable`, async () => e.message);
        return;
      }
      if (goldens.ticker && String(goldens.ticker).toUpperCase() !== String(
        THIN_DESKS.find((d) => d.slug === slug)?.ticker || '',
      ).toUpperCase()) {
        await check(`${slug} goldens ticker field`, async () => {
          return `goldens.ticker=${goldens.ticker} vs registry`;
        });
      }
      const bookSnap = await getJson(`/api/${slug}/book`);
      for (const c of goldens.cases || []) {
        await check(`  ${slug} golden:${c.id}`, async () => {
          const r = await getJson(`/api/${slug}/ask?q=` + encodeURIComponent(c.q));
          if (!r?.available || !r.answer) return 'no answer';
          if (c.route && r.route !== c.route) return `route want ${c.route} got ${r.route}`;
          for (const needle of c.answer_must_match || []) {
            if (!r.answer.includes(needle)) return `missing substring: ${needle}`;
          }
          if (c.cross_check_book_watch_names && bookSnap?.available) {
            const names = bookSnap.risks?.watch_names || [];
            for (const name of names) {
              if (name && !r.answer.includes(name)) return `WATCH name not in answer: ${name}`;
            }
          }
          return '';
        });
      }
    }

    // Path 2A S5 — every registry thin desk: core API + risk detail + refresh + goldens + compile
    if (!THIN_DESKS.length) {
      await check('thin-desks registry non-empty', async () => 'no desks in config/thin-desks.json');
    }
    for (const desk of THIN_DESKS) {
      console.log(`\nThin desk ${desk.slug} (${desk.ticker}) — ontology pack:`);
      for (const [route, val] of thinDeskApiChecks(desk)) {
        await check(route, async () => val(await getJson(route)));
      }
      await check(`/api/${desk.slug}/risk/:id (first risk)`, async () => {
        const list = await getJson(`/api/${desk.slug}/risks`);
        const id = list.risks?.[0]?.id;
        if (!id) return 'no risk id';
        const detail = await getJson(`/api/${desk.slug}/risk/${encodeURIComponent(id)}`);
        return detail && detail.id === id && Array.isArray(detail.tripwires) ? '' : 'risk detail malformed';
      });
      await check(`POST /api/${desk.slug}/book/refresh`, async () => {
        const book = await getJson(`/api/${desk.slug}/book`);
        const res = await fetch(BASE + `/api/${desk.slug}/book/refresh`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (res.status !== 200) return `HTTP ${res.status}`;
        const d = await res.json();
        if (!d.refreshed) return 'refreshed flag missing';
        if (!d.available || !d.compiled_at) return 'book not available after refresh';
        if (d.compiled_at !== book.compiled_at && !d.compiled_at) return 'no compiled_at';
        return '';
      });
      await runAskGoldens(desk.slug);
      console.log(`\n  ${desk.slug} compile (on-demand):`);
      await check(`GET /api/${desk.slug}/compile status`, async () => {
        const d = await getJson(`/api/${desk.slug}/compile`);
        if (!d.available || !d.command || !d.ont_path) return 'compile status shape';
        if (!new RegExp(desk.ticker).test(d.command)) return `command must include ${desk.ticker}`;
        return '';
      });
      await check(`POST /api/${desk.slug}/compile`, async () => {
        const res = await fetch(BASE + `/api/${desk.slug}/compile`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (res.status !== 200) return `HTTP ${res.status}`;
        const d = await res.json();
        if (d.busy) return ''; // rare race
        if (!d.ok) return `compile failed: ${d.error || 'unknown'}`;
        if (!d.compiled_at) return 'no compiled_at after compile';
        const b = await getJson(`/api/${desk.slug}/book`);
        if (!b.available || !b.compiled_at) return 'book unavailable after compile';
        return '';
      });

      // Path 1.0 house save + agent context (MCP host path — no in-glass LLM)
      console.log(`\n  ${desk.slug} house save + agent context:`);
      await check(`GET /api/${desk.slug}/house/assist-context`, async () => {
        const d = await getJson(`/api/${desk.slug}/house/assist-context?goal=smoke`);
        if (!d.available || !d.clipboard_text || d.clipboard_text.length < 200) return 'assist-context short';
        if (!d.clipboard_text.includes(desk.ticker)) return 'ticker missing';
        if (!d.mcp?.server_name) return 'mcp hint missing';
        return '';
      });
      await check(`POST /api/${desk.slug}/house/save empty refused`, async () => {
        const res = await fetch(BASE + `/api/${desk.slug}/house/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: '   ' }),
        });
        if (res.status !== 200) return `HTTP ${res.status}`;
        const d = await res.json();
        if (d.ok) return 'empty must fail';
        if (!d.error) return 'expected error';
        return '';
      });
      await check(`POST /api/${desk.slug}/house/save probe then restore`, async () => {
        const before = await getJson(`/api/${desk.slug}/house`);
        if (!before.available || before.source !== 'vault' || typeof before.markdown !== 'string') {
          return 'vault house markdown required';
        }
        const token = `PATH10-HOUSE-SMOKE-${desk.slug}-${Date.now()}`;
        const probeMd = `${before.markdown.replace(/\s+$/, '')}\n\n<!-- ${token} -->\n`;
        const res = await fetch(BASE + `/api/${desk.slug}/house/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: probeMd }),
        });
        if (res.status !== 200) return `save HTTP ${res.status}`;
        const saved = await res.json();
        if (!saved.ok) return `save failed: ${saved.error || 'unknown'}`;
        if (!saved.house?.markdown?.includes(token)) return 'token missing after save';
        const rest = await fetch(BASE + `/api/${desk.slug}/house/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: before.markdown }),
        });
        if (rest.status !== 200) return `restore HTTP ${rest.status}`;
        const restored = await rest.json();
        if (!restored.ok) return `restore failed: ${restored.error || 'unknown'}`;
        if (restored.house?.markdown?.includes(token)) return 'token still present';
        if (restored.house?.markdown !== before.markdown) return 'restored mismatch';
        return '';
      });

      // Propose → reject (house unchanged); propose → accept → restore
      await check(`POST /api/${desk.slug}/house/proposals from_current+reject`, async () => {
        const before = await getJson(`/api/${desk.slug}/house`);
        if (!before.markdown) return 'need vault markdown';
        const token = `FROMCUR-${desk.slug}-${Date.now()}`;
        const m = before.markdown.match(/^# .+$/m);
        if (!m) return 'no H1 to replace uniquely';
        const findH = m[0];
        if (before.markdown.split(findH).length - 1 !== 1) return 'H1 not unique';
        const res = await fetch(BASE + `/api/${desk.slug}/house/proposals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            replacements: [{ find: findH, replace: `${findH} <!--${token}-->` }],
            summary: 'smoke from_current',
            rationale: 'smoke',
            source: 'smoke',
          }),
        });
        if (res.status !== 200) return `HTTP ${res.status}`;
        const d = await res.json();
        if (!d.ok || !d.proposal?.id) return d.error || 'from_current failed';
        if (d.mode !== 'from_current') return `expected mode from_current got ${d.mode}`;
        const mid = await getJson(`/api/${desk.slug}/house`);
        if (mid.markdown?.includes(token)) return 'from_current must not write house';
        const rej = await fetch(BASE + `/api/${desk.slug}/house/proposals/${d.proposal.id}/reject`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (rej.status !== 200) return `reject HTTP ${rej.status}`;
        const rj = await rej.json();
        if (!rj.ok) return rj.error || 'reject failed';
        return '';
      });
      await check(`POST /api/${desk.slug}/house/proposals propose+reject`, async () => {
        const before = await getJson(`/api/${desk.slug}/house`);
        if (!before.markdown) return 'need vault markdown';
        const token = `PROP-REJ-${desk.slug}-${Date.now()}`;
        const md = `${before.markdown.replace(/\s+$/, '')}\n\n<!-- ${token} -->\n`;
        const res = await fetch(BASE + `/api/${desk.slug}/house/proposals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: md, summary: 'smoke reject', rationale: 'smoke', source: 'smoke' }),
        });
        if (res.status !== 200) return `HTTP ${res.status}`;
        const d = await res.json();
        if (!d.ok || !d.proposal?.id) return d.error || 'no proposal id';
        const mid = await getJson(`/api/${desk.slug}/house`);
        if (mid.markdown?.includes(token)) return 'propose must not write house';
        const rej = await fetch(BASE + `/api/${desk.slug}/house/proposals/${d.proposal.id}/reject`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (rej.status !== 200) return `reject HTTP ${rej.status}`;
        const rj = await rej.json();
        if (!rj.ok || rj.proposal?.status !== 'rejected') return rj.error || 'not rejected';
        return '';
      });
      await check(`POST /api/${desk.slug}/house/proposals propose+accept+restore`, async () => {
        const before = await getJson(`/api/${desk.slug}/house`);
        if (!before.markdown) return 'need vault markdown';
        const token = `PROP-ACC-${desk.slug}-${Date.now()}`;
        const md = `${before.markdown.replace(/\s+$/, '')}\n\n<!-- ${token} -->\n`;
        const res = await fetch(BASE + `/api/${desk.slug}/house/proposals`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: md, summary: 'smoke accept', rationale: 'smoke', source: 'smoke' }),
        });
        if (res.status !== 200) return `HTTP ${res.status}`;
        const d = await res.json();
        if (!d.ok || !d.proposal?.id) return d.error || 'no proposal id';
        const acc = await fetch(BASE + `/api/${desk.slug}/house/proposals/${d.proposal.id}/accept`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
        });
        if (acc.status !== 200) return `accept HTTP ${acc.status}`;
        const aj = await acc.json();
        if (!aj.ok) return aj.error || 'accept failed';
        if (!aj.written?.verified) return 'accept missing written.verified (readback assert)';
        if (!aj.written?.sha256) return 'accept missing written.sha256';
        if (!aj.house?.markdown?.includes(token)) return 'token missing after accept';
        const rest = await fetch(BASE + `/api/${desk.slug}/house/save`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ markdown: before.markdown }),
        });
        if (rest.status !== 200) return `restore HTTP ${rest.status}`;
        const restored = await rest.json();
        if (!restored.ok || restored.house?.markdown?.includes(token)) return 'restore failed';
        return '';
      });
    }

    await check('all thin desks have ask goldens file', async () => {
      for (const d of THIN_DESKS) {
        if (!existsSync(askGoldensPath(d.slug))) return `missing scripts/${d.slug}-ask-goldens.json`;
      }
      return '';
    });

    // Phase 5b — NBIS-only propose / reject (not part of thin meta_only factory)
    console.log('\nNebius proposals (Phase 5b, NBIS-only):');
    await check('GET /api/nbis/proposals', async () => {
      const d = await getJson('/api/nbis/proposals');
      if (!d.available || !Array.isArray(d.proposals) || !d.counts) return 'proposals list shape';
      return '';
    });
    await check('POST propose claim then reject', async () => {
      const res = await fetch(BASE + '/api/nbis/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          kind: 'claim',
          text: 'Smoke propose reject only — not accepted',
          as_of: '2026-07-20',
          grade: 'C',
          source_id: 'smoke-probe',
          rationale: 'smoke',
        }),
      });
      if (res.status !== 200) return `HTTP ${res.status}`;
      const d = await res.json();
      if (d.error || !d.proposal?.id) return d.error || 'no proposal id';
      const id = d.proposal.id;
      const rej = await fetch(BASE + `/api/nbis/proposals/${id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (rej.status !== 200) return `reject HTTP ${rej.status}`;
      const rj = await rej.json();
      if (rj.error || rj.proposal?.status !== 'rejected') return rj.error || 'not rejected';
      return '';
    });
    await check('POST propose house blocked', async () => {
      const res = await fetch(BASE + '/api/nbis/proposals', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'house_view', text: 'should fail' }),
      });
      if (res.status !== 200) return `HTTP ${res.status}`;
      const d = await res.json();
      if (d.proposal) return 'house proposal must not be created';
      if (!d.error && d.available !== false) return 'expected error for house';
      return '';
    });
    await check('CLI propose-nbis.mjs then reject', async () => {
      const cli = spawnSync(process.execPath, [
        path.join(ROOT, 'scripts', 'propose-nbis.mjs'),
        '--kind', 'claim',
        '--text', 'CLI smoke propose only — reject me',
        '--as-of', '2026-07-20',
        '--grade', 'C',
        '--source', 'smoke-cli',
        '--rationale', 'smoke build 2',
      ], { encoding: 'utf8', cwd: ROOT });
      if (cli.status !== 0) return `cli exit ${cli.status}: ${(cli.stderr || cli.stdout || '').slice(0, 200)}`;
      let parsed;
      try { parsed = JSON.parse(cli.stdout); } catch { return `cli not JSON: ${cli.stdout?.slice(0, 120)}`; }
      if (!parsed.ok || !parsed.id) return 'cli missing id';
      const rej = await fetch(BASE + `/api/nbis/proposals/${parsed.id}/reject`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}',
      });
      if (rej.status !== 200) return `reject HTTP ${rej.status}`;
      const rj = await rej.json();
      if (rj.error || rj.proposal?.status !== 'rejected') return rj.error || 'not rejected';
      return '';
    });
    await check('CLI propose house refused', async () => {
      const cli = spawnSync(process.execPath, [
        path.join(ROOT, 'scripts', 'propose-nbis.mjs'),
        '--kind', 'house_view',
        '--text', 'should fail',
      ], { encoding: 'utf8', cwd: ROOT });
      if (cli.status === 0) return 'house CLI must exit non-zero';
      return '';
    });
    await check('propose-nbis.mjs exists', async () => {
      return existsSync(path.join(ROOT, 'scripts', 'propose-nbis.mjs')) ? '' : 'missing script';
    });

    // Thin-desk UI parity (UP-C) — all desks in parity_group share write_path_mode + rooms
    console.log('\nThin-desk UI parity (thin_ontology_v1 · write_path_mode=meta_only):');
    await check('all thin desks same write_path_mode + rooms', async () => {
      const metas = [];
      for (const desk of THIN_DESKS) {
        const d = await getJson(`/api/${desk.slug}/meta`);
        const err = validateThinMeta(d, desk);
        if (err) return err;
        metas.push(d.thin_desk_contract);
      }
      const modes = [...new Set(metas.map((c) => c.capabilities?.write_path_mode))];
      if (modes.length !== 1) return `write_path_mode mismatch: ${modes.join(', ')}`;
      if (modes[0] !== THIN_WRITE_PATH_MODE) return `global mode want ${THIN_WRITE_PATH_MODE} got ${modes[0]}`;
      const groups = [...new Set(metas.map((c) => c.parity_group))];
      if (groups.length !== 1 || groups[0] !== THIN_PARITY_GROUP) return `parity_group mismatch: ${groups.join(', ')}`;
      for (const c of metas) {
        for (const r of THIN_REQUIRED_ROOMS) {
          if (!(c.rooms || []).includes(r)) return `${c.desk} missing room ${r}`;
        }
      }
      return '';
    });
    await check('each thin desk core GET surface', async () => {
      const core = ['overview', 'risks', 'house', 'sources', 'book', 'write-meta', 'quote', 'compile'];
      for (const desk of THIN_DESKS) {
        for (const path of core) {
          const res = await fetch(`${BASE}/api/${desk.slug}/${path}`);
          if (res.status !== 200) return `${desk.slug}/${path} HTTP ${res.status}`;
        }
      }
      return '';
    });

    console.log('\nStatic / cache (redeploy-strand guard):');
    await check('GET / is 200 + no-cache', async () => {
      const r = await fetch(BASE + '/');
      if (r.status !== 200) return `HTTP ${r.status}`;
      if (!/no-cache/.test(r.headers.get('cache-control') || '')) return 'index.html not no-cache';
      return '';
    });
    let bundle = null;
    await check('index.html references a bundle', async () => {
      const html = await (await fetch(BASE + '/')).text();
      const m = html.match(/\/assets\/index-[A-Za-z0-9_-]+\.js/);
      bundle = m ? m[0] : null;
      return bundle ? '' : 'no /assets/index-*.js in index.html';
    });
    await check('bundle serves as immutable JS', async () => {
      if (!bundle) return 'no bundle to check';
      const r = await fetch(BASE + bundle);
      if (r.status !== 200) return `HTTP ${r.status}`;
      if (!/javascript/.test(r.headers.get('content-type') || '')) return `content-type ${r.headers.get('content-type')}`;
      if (!/immutable/.test(r.headers.get('cache-control') || '')) return 'not immutable';
      return '';
    });
    await check('missing bundle → 404 (not HTML)', async () => {
      const r = await fetch(BASE + '/assets/index-DEADBEEF00.js');
      return r.status === 404 ? '' : `got HTTP ${r.status} (${r.headers.get('content-type')}) — strand risk`;
    });

    console.log('\nVault lint:');
    await check('cockpit/lint.js clean', async () => {
      const r = spawnSync(process.execPath, [path.join(VAULT, 'cockpit', 'lint.js')], { encoding: 'utf8' });
      return r.status === 0 ? '' : `exit ${r.status}: ${(r.stdout || r.stderr || '').trim().split('\n').pop()}`;
    });

    if (RENDER) {
      console.log('\nHeadless render (each rail route mounts content):');
      if (!existsSync(CHROME)) {
        console.log('  \x1b[33m—\x1b[0m Chrome not found — skipping render pass');
      } else {
        for (const route of ROUTES) {
          await check(`#/${route}`, async () => {
            const r = spawnSync(CHROME, ['--headless=new', '--dump-dom', '--virtual-time-budget=6000',
              `${BASE}/#/${route}`], { encoding: 'utf8', timeout: 30000 });
            const dom = r.stdout || '';
            const main = dom.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
            const inner = main ? main[1].replace(/<[^>]+>/g, '').trim() : '';
            if (!main) return 'no <main> in DOM';
            if (inner.length < 15) return 'main mounted empty (render threw?)';
            return '';
          });
        }
        console.log('\n  Thin desk routes (from registry):');
        for (const route of THIN_HASH_ROUTES) {
          await check(`#/${route}`, async () => {
            const r = spawnSync(CHROME, ['--headless=new', '--dump-dom', '--virtual-time-budget=6000',
              `${BASE}/#/${route}`], { encoding: 'utf8', timeout: 30000 });
            const dom = r.stdout || '';
            const main = dom.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
            const inner = main ? main[1].replace(/<[^>]+>/g, '').trim() : '';
            if (!main) return 'no <main> in DOM';
            if (inner.length < 15) return 'main mounted empty (render threw?)';
            return '';
          });
        }
      }
    }
  } finally {
    try { process.kill(-srv.pid); } catch { /* fall through */ }
    try { srv.kill('SIGKILL'); } catch { /* already gone */ }
    if (existsSync(ACCESS)) rmSync(ACCESS);
  }

  console.log(`\n\x1b[1mSMOKE ${fail ? '\x1b[31mFAIL' : '\x1b[32mPASS'}\x1b[0m — ${pass} passed, ${fail} failed${RENDER ? '' : '  (add -- --render for headless page checks)'}`);
  process.exit(fail ? 1 : 0);
}
main().catch((e) => { console.error('smoke harness error:', e); process.exit(2); });
