// index.js — memory-cockpit v2 server. Viewer + narrow writes:
// READ vault/pack APIs; Path 1.0 allowlisted thin house save; NBIS proposals;
// sync spawn + .sync-state.json lastVisit. No in-glass LLM / no API keys required.
// Boots with empty environment.
import express from 'express';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';
import { VAULT_DIR, canonicalize, syncState, STATE_PATH, LOCK_PATH, houseView, scanVault } from './vault.js';
import * as model from './model.js';
import * as proposals from './nbisProposals.js';
import { mountThinDesks } from './thinDeskMount.js';
import { operateGlance } from './operateGlance.js';
import { gate, handleLogin, handleLogout, authEnabled } from './auth.js';
import { openGrokBuild, isLoopbackRequest, listGrokAgents } from './openGrok.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const app = express();

// strict CSP. The login page uses one inline <script> (progressive-enhancement submit), so
// script-src allows 'unsafe-inline' — the built SPA has no inline scripts and is unaffected.
app.use((req, res, next) => {
  res.setHeader('Content-Security-Policy',
    "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'self'");
  next();
});

// login gate (opt-in — inert until ≥1 user exists in .access.json). Must precede all routes.
// 512kb: house-view SAVE needs full markdown (~5–15kb+).
app.use(express.json({ limit: '512kb' }));
app.use(express.urlencoded({ extended: false, limit: '512kb' }));
app.post('/api/login', handleLogin);
app.post('/api/logout', handleLogout);
app.use(gate);

const j = (fn) => (req, res) => {
  try {
    const out = fn(req);
    out == null ? res.status(404).json({ error: 'not found' }) : res.json(out);
  } catch (e) {
    const code = Number(e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 500;
    res.status(code).json({
      error: e.message,
      code: e.code || undefined,
      known: e.known || undefined,
    });
  }
};
// async variant — for builders that await (e.g. the live complex-quotes fetch)
const ja = (fn) => async (req, res) => {
  try {
    const out = await fn(req);
    out == null ? res.status(404).json({ error: 'not found' }) : res.json(out);
  } catch (e) {
    const code = Number(e.status) >= 400 && Number(e.status) < 600 ? Number(e.status) : 500;
    res.status(code).json({
      error: e.message,
      code: e.code || undefined,
      known: e.known || undefined,
    });
  }
};

app.get('/api/overview', j(() => model.overview()));
app.get('/api/complex-quotes', ja(() => model.complexQuotes())); // live §2.0 tile prices + 1-week table
app.get('/api/cockpit-read', j(() => model.cockpitRead()));
app.get('/api/risks', j(() => ({ risks: model.risks().map(({ prose, research, ...r }) => r), tells: model.masterTells() })));
app.get('/api/risk/:id', j((req) => model.riskDetail(req.params.id)));
app.get('/api/series', j(() => ({ registry: model.listSeries() })));
app.get('/api/series/:id', j((req) => ({ id: req.params.id, ...model.seriesMeta(req.params.id), data: model.readSeries(req.params.id) })));
app.get('/api/desks', j(() => model.desks().map(({ intro, ...d }) => d)));
app.get('/api/desk/:id', j((req) => model.deskDetail(req.params.id)));
app.get('/api/catalysts', j(() => model.catalysts()));
app.get('/api/log', j(() => model.logTail(50)));
app.get('/api/reports', j(() => model.reports()));
app.get('/api/street', j(() => model.street()));
app.get('/api/margins', j(() => model.margins()));
app.get('/api/leverage-monitor', j(() => model.leverageMonitor()));
app.get('/api/dram-nowcast', j(() => model.dramNowcast()));
app.get('/api/companies', j(() => model.companies()));
app.get('/api/house', j(() => model.houseEntries()));
app.get('/api/analysts', j(() => model.analysts()));
app.get('/api/background', j(() => model.background()));
app.get('/api/page/:slug', j((req) => model.readerPage(req.params.slug)));
app.get('/api/search', j(() => model.searchIndex()));

// Open Grok Build in cockpit-research-os (macOS Terminal). Loopback only.
// GET agents?variant=desk|risk|register|house — catalog for surface; POST { action, desk, risk_id?, risk_name? }.
app.get('/api/open-grok/agents', j((req) => listGrokAgents({
  variant: req.query.variant || 'desk',
})));
app.post('/api/open-grok', (req, res) => {
  if (!isLoopbackRequest(req)) {
    return res.status(403).json({ ok: false, error: 'open-grok only allowed from localhost' });
  }
  try {
    const body = req.body || {};
    const out = openGrokBuild({
      action: body.action,
      desk: body.desk,
      ticker: body.ticker,
      prompt: body.prompt,
      risk_id: body.risk_id || body.riskId,
      risk_name: body.risk_name || body.riskName,
      mode: body.mode, // street: pipeline | chat
      run_id: body.run_id || body.runId, // research-compile: target run (was dropped — 2026-08-20 fix)
      job: body.job,
    });
    return res.json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e.message || String(e) });
  }
});

// ---------- Ontology thin desks (Path 2A) — from config/thin-desks.json ----------
// Core surface: meta, overview, risks, house, sources, quote, book, compile, ask, write-meta.
// URLs remain /api/{slug}/… (nbis, msft, …). Memory routes above untouched.
mountThinDesks(app, { j, ja });

// Multi-desk operate glance for START (factory-native attention board)
app.get('/api/operate-glance', j(() => operateGlance()));

// Phase 5b — NBIS propose/accept/reject only (meta_only glass; not part of thin factory mount)
app.get('/api/nbis/proposals', j((req) => proposals.listProposals({ status: req.query.status || undefined })));
app.post('/api/nbis/proposals', j((req) => {
  try {
    return proposals.createProposal(req.body || {}, req.user || 'user');
  } catch (e) {
    return { available: false, error: e.message };
  }
}));
app.post('/api/nbis/proposals/:id/accept', j((req) => {
  try {
    const out = proposals.acceptProposal(req.params.id);
    return out == null ? null : out;
  } catch (e) {
    return { available: false, error: e.message };
  }
}));
app.post('/api/nbis/proposals/:id/reject', j((req) => {
  try {
    const out = proposals.rejectProposal(req.params.id);
    return out == null ? null : out;
  } catch (e) {
    return { available: false, error: e.message };
  }
}));

// reports served read-only straight from the vault (html in-app, pdf in tab)
app.get('/api/report-file/:name', (req, res) => {
  const abs = canonicalize(path.join(VAULT_DIR, 'reports', req.params.name));
  const reportsReal = canonicalize(path.join(VAULT_DIR, 'reports'));
  if (!abs.startsWith(reportsReal + path.sep) || !/\.(html|pdf)$/.test(abs) || !fs.existsSync(abs)) {
    return res.status(404).json({ error: 'unknown report' });
  }
  res.sendFile(abs);
});

// ---------- freshness + the one privilege: spawning sync ----------
const STALE_HOURS = 20;
let lastSpawnAttempt = 0;
let lastManualSpawn = 0;
function lockHeld() {
  try {
    const l = JSON.parse(fs.readFileSync(LOCK_PATH, 'utf8'));
    return Date.now() - l.at < 10 * 60 * 1000;
  } catch { return false; }
}
function spawnSync() {
  // process.execPath (not bare 'node') so sync still resolves under launchd's minimal PATH,
  // where 'node' isn't on the search path (2026-07-05 hardening).
  const child = spawn(process.execPath, [path.join(VAULT_DIR, 'cockpit', 'sync.js')], { detached: true, stdio: 'ignore' });
  child.unref();
}

// manual sync button (Anthony, 2026-07-04). Deliberately NOT --force: each updater still
// honors its per-source freshness window (prices 2h, headlines 1h, EDGAR 20h…), so a tap
// freshens what's actually stale and skips the rest — polite to sources no matter how often
// anyone presses. Lockfile + a 15s cooldown stop pile-ups. Gated: logged-in users only.
app.post('/api/sync', (req, res) => {
  if (lockHeld()) return res.json({ started: false, syncing: true, reason: 'already running' });
  if (Date.now() - lastManualSpawn < 15_000) return res.json({ started: false, syncing: false, reason: 'cooldown' });
  lastManualSpawn = Date.now();
  spawnSync();
  res.json({ started: true, syncing: true });
});
function stampLastVisit() {
  try {
    const st = syncState();
    st.lastVisit = new Date().toISOString();
    const tmp = STATE_PATH + '.tmp-app';
    fs.writeFileSync(tmp, JSON.stringify(st, null, 2));
    fs.renameSync(tmp, STATE_PATH);
    return st;
  } catch { return syncState(); }
}
app.get('/api/freshness', (req, res) => {
  const prevVisit = syncState().lastVisit || null;
  const st = stampLastVisit();
  const ageH = st.lastRun ? (Date.now() - new Date(st.lastRun).getTime()) / 3600000 : Infinity;
  const stale = ageH > STALE_HOURS;
  const syncing = lockHeld();
  let spawned = false;
  // auto on site open, stale-guarded — exactly one background run (mutex + retry damper)
  if (stale && !syncing && Date.now() - lastSpawnAttempt > 15 * 60 * 1000) {
    lastSpawnAttempt = Date.now();
    spawnSync();
    spawned = true;
  }
  res.json({ lastRun: st.lastRun || null, ageHours: Number.isFinite(ageH) ? Math.round(ageH * 10) / 10 : null, stale, syncing: syncing || spawned, spawned, prevVisit, updaters: st.updaters || {} });
});

// ---------- static frontend ----------
// Content-hashed assets are immutable → cache them forever. index.html is the entry point and MUST
// revalidate every load: without this, a redeploy (new bundle hash) strands a browser on a cached
// shell that requests a bundle that no longer exists → blank page (hit 2026-07-04 on iOS Safari).
app.use(express.static(path.join(ROOT, 'dist'), {
  setHeaders: (res, filePath) => {
    if (/\/assets\//.test(filePath)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    else if (/index\.html$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
  },
}));
app.get(/^\/(?!api\/).*/, (req, res) => {
  // A stale cached shell may request a bundle hash we've since replaced. Returning the SPA HTML
  // for a missing /assets/* file makes the browser parse HTML as JS → silent blank page. Return a
  // real 404 instead so it fails cleanly (paired with emptyOutDir:false, which keeps old bundles
  // so a cached client keeps working across a redeploy until it revalidates index.html).
  if (req.path.startsWith('/assets/')) { res.status(404).type('text/plain').send('asset not found'); return; }
  res.setHeader('Cache-Control', 'no-cache');
  res.sendFile(path.join(ROOT, 'dist', 'index.html'));
});

const PORT = Number(process.env.PORT || 4681);
// §10 local-only: loopback by default. HOST is an explicit opt-in (Anthony, 2026-07-03) for
// phone access on his own network — the app has NO auth, so non-loopback means anyone on the
// network can read the research readout. Never set HOST on an untrusted network.
const HOST = process.env.HOST || '127.0.0.1';
scanVault(true);
app.listen(PORT, HOST, () => {
  console.log(`memory-cockpit v2  http://${HOST}:${PORT}`);
  console.log(`vault: ${VAULT_DIR} · pages: ${scanVault().pages.length} · pure viewer`);
  console.log(`login: ${authEnabled() ? 'REQUIRED (users configured)' : 'open — no users (node server/set-access.js <name> to enable)'}`);
  if (HOST !== '127.0.0.1') console.log(`⚠ non-loopback bind (${HOST})${authEnabled() ? '' : ' — no auth; trusted networks only'}`);
});
