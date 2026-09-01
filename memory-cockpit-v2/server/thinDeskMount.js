// thinDeskMount.js — Path 2A + Path 1.0 house save + agent house/risk proposals (propose→accept).
// Live registry: re-reads config/thin-desks.json on change (mtime) so new desks work WITHOUT
// server restart. Parameterized /api/:slug/* so routes are not frozen at boot.
// MCP may propose drafts; only glass ACCEPT writes house/risks SoR. Decision-support only.
import fs from 'fs';
import { createThinModel } from './thinModel.js';
import { createThinAsk } from './thinAsk.js';
import { createThinCompile } from './thinCompile.js';
import { loadThinDeskProfiles, REG_PATH } from './thinDeskProfiles.js';
import { pipelineSnapshot } from './secEdgar.js';

/**
 * First path segments reserved by Memory / global APIs — never treat as thin slug.
 * Keep in sync with server/index.js top-level /api/* mounts.
 */
export const RESERVED_API_SLUGS = new Set([
  'overview',
  'complex-quotes',
  'cockpit-read',
  'operate-glance',
  'thin-desks',
  'risks',
  'risk',
  'series',
  'desks',
  'desk',
  'catalysts',
  'log',
  'reports',
  'street',
  'margins',
  'leverage-monitor',
  'dram-nowcast',
  'companies',
  'house',
  'analysts',
  'background',
  'page',
  'search',
  'open-grok',
  // NOTE: do NOT reserve 'nbis' — it is a live thin desk slug (/api/nbis/*).
  // Legacy proposal routes stay at exact paths /api/nbis/proposals* in index.js
  // and do not collide with /api/:slug/house|book|risks|…
  'report-file',
  'sync',
  'freshness',
  'login',
  'logout',
  'thin-desks',
  'health',
]);

/** @type {{ mtimeMs: number, registry: object, registryPath: string, bySlug: object, byAlias: object, runtime: object } | null} */
let registryCache = null;

/**
 * Load registry + runtime handlers; refresh when thin-desks.json mtime changes.
 */
export function getLiveThinRegistry() {
  let mtimeMs = 0;
  try {
    mtimeMs = fs.statSync(REG_PATH).mtimeMs;
  } catch (e) {
    throw new Error(`thin-desks.json unreadable: ${e.message || e}`);
  }
  if (registryCache && registryCache.mtimeMs === mtimeMs) {
    return registryCache;
  }

  const { registry, registryPath, bySlug } = loadThinDeskProfiles();
  /** @type {Record<string, string>} alias → canonical slug */
  const byAlias = {};
  /** @type {Record<string, { model: object, ask: Function, compile: Function, compileStatus: Function, desk: object }>} */
  const runtime = {};

  for (const slug of Object.keys(bySlug)) {
    const bundle = bySlug[slug];
    const desk = bundle.desk;
    const model = createThinModel(bundle.model);
    const ask = createThinAsk(bundle.ask);
    const { compile, compileStatus } = createThinCompile(String(desk.ticker).toUpperCase(), model.book);
    runtime[slug] = { model, ask, compile, compileStatus, desk };

    const aliases = Array.isArray(desk.aliases) ? desk.aliases : [];
    for (const a of aliases) {
      const key = String(a || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
      if (!key || key === slug) continue;
      if (bySlug[key] || byAlias[key]) {
        throw new Error(`thin-desks.json: alias "${key}" collides (desk ${slug})`);
      }
      byAlias[key] = slug;
    }
  }

  registryCache = {
    mtimeMs,
    registry,
    registryPath,
    bySlug,
    byAlias,
    runtime,
  };
  return registryCache;
}

/** Force next request to re-read disk (tests). */
export function invalidateThinRegistryCache() {
  registryCache = null;
}

/**
 * Resolve request slug → canonical desk runtime (supports aliases).
 * @param {string} rawSlug
 * @returns {{ slug: string, model: object, ask: Function, compile: Function, compileStatus: Function, desk: object } | null}
 */
export function resolveThinDesk(rawSlug) {
  const slug = String(rawSlug || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
  if (!slug || RESERVED_API_SLUGS.has(slug)) return null;
  const live = getLiveThinRegistry();
  const canonical = live.bySlug[slug] ? slug : live.byAlias[slug];
  if (!canonical) return null;
  const rt = live.runtime[canonical];
  if (!rt) return null;
  return { slug: canonical, ...rt };
}

/**
 * Public list for glass (runtime registry — no rebuild required).
 */
export function listThinDesksPublic() {
  const live = getLiveThinRegistry();
  const desks = (live.registry.desks || []).map((d) => ({
    slug: d.slug,
    ticker: d.ticker,
    id: d.id || d.slug,
    label: d.label || d.ticker,
    mark: d.mark || String(d.label || d.ticker || '?')[0],
    house_file: d.house_file,
    aliases: Array.isArray(d.aliases) ? d.aliases : [],
    displayName: (d.profile && d.profile.displayName) || d.label || d.ticker,
  }));
  return {
    ok: true,
    available: true,
    desks,
    parity_group: live.registry.parity_group || null,
    write_path_mode: live.registry.write_path_mode || null,
    rooms: live.registry.rooms || [],
    registry_path: live.registryPath,
    mtime_ms: live.mtimeMs,
    note: 'Live from thin-desks.json (reloads on file change). New desks need no glass rebuild/restart.',
    decision_support_only: true,
  };
}

/**
 * Load registry desks. Throws if JSON missing/invalid.
 * @returns {{ desks: Array<{ slug: string, ticker: string }> }}
 */
export function loadThinDeskRegistry() {
  const live = getLiveThinRegistry();
  if (!Array.isArray(live.registry.desks)) {
    throw new Error('thin-desks.json: desks[] must be an array (may be empty for kernel)');
  }
  return live.registry;
}

function deskNotFound(slug) {
  const live = getLiveThinRegistry();
  const known = Object.keys(live.bySlug);
  // Reserved first-segments (Memory globals) — never report as "Known" desks.
  if (RESERVED_API_SLUGS.has(slug)) {
    const err = new Error(
      `Reserved API segment "${slug}" is not a thin desk slug (Memory/global routes). `
      + `Registered desks: ${known.length ? known.join(', ') : '(none)'}.`,
    );
    err.status = 404;
    err.code = 'thin_desk_reserved_slug';
    err.known = known;
    err.reserved = true;
    throw err;
  }
  // Registry desk that somehow failed resolve (should not happen if invariant holds)
  if (known.includes(slug)) {
    const err = new Error(
      `Thin desk "${slug}" is registered but failed to resolve (runtime/profile error). `
      + 'Check thin-desks.json profile fields and server logs.',
    );
    err.status = 500;
    err.code = 'thin_desk_resolve_failed';
    err.known = known;
    throw err;
  }
  const err = new Error(
    `Unknown thin desk "${slug}". Known: ${known.length ? known.join(', ') : '(none)'}. `
    + 'Use the slug from thin-desks.json (e.g. tsm not tsmc unless listed as alias).',
  );
  err.status = 404;
  err.code = 'thin_desk_not_found';
  err.known = known;
  throw err;
}

/**
 * Mount dynamic thin-desk API surface (parameterized by :slug).
 * Registry is re-read when config/thin-desks.json changes — no restart for new desks.
 * @param {import('express').Express} app
 * @param {{ j: Function, ja: Function }} handlers
 */
export function mountThinDesks(app, { j, ja }) {
  // Live desk catalog for glass shell (not frozen at vite build)
  app.get('/api/thin-desks', j(() => listThinDesksPublic()));

  const withDesk = (fn) => (req) => {
    const rt = resolveThinDesk(req.params.slug);
    if (!rt) deskNotFound(req.params.slug);
    return fn(rt, req);
  };

  app.get('/api/:slug/meta', j(withDesk((rt) => rt.model.meta())));
  app.get('/api/:slug/overview', j(withDesk((rt) => rt.model.overview())));
  app.get('/api/:slug/risks', j(withDesk((rt) => rt.model.risks())));
  app.get('/api/:slug/risk/:id', j(withDesk((rt, req) => rt.model.riskDetail(req.params.id))));
  app.get('/api/:slug/house', j(withDesk((rt) => rt.model.house())));
  app.post('/api/:slug/house/save', j(withDesk((rt, req) => rt.model.saveHouse(req.body || {}))));
  app.get('/api/:slug/house/assist-context', j(withDesk((rt, req) => rt.model.houseAssistContext({
    goal: req.query.goal || req.query.q || '',
  }))));
  app.get('/api/:slug/house/proposals', j(withDesk((rt, req) => rt.model.houseProposalsList({
    status: req.query.status,
    includeMarkdown: req.query.full === '1' || req.query.full === 'true',
  }))));
  app.get('/api/:slug/house/proposals/:id', j(withDesk((rt, req) => rt.model.houseProposalGet(req.params.id))));
  app.post('/api/:slug/house/proposals', j(withDesk((rt, req) => rt.model.housePropose(req.body || {}))));
  app.post('/api/:slug/house/proposals/:id/accept', j(withDesk((rt, req) => rt.model.houseProposalAccept(req.params.id))));
  app.post('/api/:slug/house/proposals/:id/reject', j(withDesk((rt, req) => rt.model.houseProposalReject(req.params.id))));
  app.get('/api/:slug/risks/proposals', j(withDesk((rt, req) => rt.model.riskProposalsList({
    status: req.query.status,
  }))));
  app.get('/api/:slug/risks/proposals/:id', j(withDesk((rt, req) => rt.model.riskProposalGet(req.params.id))));
  app.post('/api/:slug/risks/proposals', j(withDesk((rt, req) => rt.model.riskPropose(req.body || {}))));
  app.post('/api/:slug/risks/proposals/:id/accept', j(withDesk((rt, req) => rt.model.riskProposalAccept(req.params.id))));
  app.post('/api/:slug/risks/proposals/:id/reject', j(withDesk((rt, req) => rt.model.riskProposalReject(req.params.id))));
  app.get('/api/:slug/sources', j(withDesk((rt) => rt.model.sources())));
  app.get('/api/:slug/street', j(withDesk((rt) => rt.model.street())));
  app.post('/api/:slug/street/refresh', ja(withDesk(async (rt, req) => rt.model.streetRefresh(req.body || {}))));
  app.get('/api/:slug/model', j(withDesk((rt) => rt.model.workingModel())));
  app.post('/api/:slug/model/refresh', ja(withDesk(async (rt, req) => rt.model.workingModelRefresh(req.body || {}))));
  app.post('/api/:slug/model/print/arm', j(withDesk((rt, req) => rt.model.workingModelArm(req.body || {}))));
  app.post('/api/:slug/model/print/lock', j(withDesk((rt) => rt.model.workingModelLock())));
  app.get('/api/:slug/research', j(withDesk((rt) => rt.model.researchList())));
  app.get('/api/:slug/research/runs/:runId', j(withDesk((rt, req) => rt.model.researchGet(req.params.runId))));
  app.post('/api/:slug/research/runs', j(withDesk((rt, req) => rt.model.researchStart(req.body || {}))));
  app.post('/api/:slug/research/runs/:runId/publish', j(withDesk((rt, req) => rt.model.researchPublish(req.params.runId, req.body || {}))));
  app.post('/api/:slug/research/runs/:runId/cancel', j(withDesk((rt, req) => rt.model.researchCancel(req.params.runId, req.body || {}))));
  app.post('/api/:slug/research/runs/:runId/heartbeat', j(withDesk((rt, req) => rt.model.researchHeartbeat(req.params.runId))));
  app.post('/api/:slug/research/runs/:runId/retry', j(withDesk((rt, req) => rt.model.researchRetry(req.params.runId, req.body || {}))));
  app.post('/api/:slug/research/runs/:runId/acquire', ja(withDesk(async (rt, req) => rt.model.researchAcquire(req.params.runId, req.body || {}))));
  // Deep-compile pipeline stages 0+1 (SEC EDGAR resolve + filing index) — plan 2026-08-19.
  // Read-only for the book: cache lane cockpit/compile/{TICKER}/ only; never pack/house SoR.
  app.get('/api/:slug/pipeline', ja(withDesk(async (rt) => pipelineSnapshot(rt.desk.ticker, {
    compiledAt: rt.model.book().compiled_at || null,
  }))));
  app.post('/api/:slug/pipeline/refresh', ja(withDesk(async (rt) => pipelineSnapshot(rt.desk.ticker, {
    force: true,
    compiledAt: rt.model.book().compiled_at || null,
  }))));
  app.get('/api/:slug/quote', ja(withDesk((rt) => rt.model.quote())));
  app.get('/api/:slug/book', j(withDesk((rt) => rt.model.book())));
  app.post('/api/:slug/book/refresh', j(withDesk((rt) => rt.model.refreshBook())));
  app.get('/api/:slug/compile', j(withDesk((rt) => rt.compileStatus())));
  app.post('/api/:slug/compile', ja(withDesk((rt) => rt.compile())));
  app.get('/api/:slug/ask', j(withDesk((rt, req) => rt.ask(String(req.query.q || '')))));
  app.post('/api/:slug/ask', j(withDesk((rt, req) => rt.ask(String((req.body && req.body.q) || '')))));
  app.get('/api/:slug/write-meta', j(withDesk((rt) => rt.model.writeMeta())));

  // Boot snapshot (for logs); live list is always getLiveThinRegistry()
  const boot = getLiveThinRegistry();
  return {
    mounted: Object.keys(boot.bySlug),
    registry_path: boot.registryPath,
    live: true,
    note: 'Thin desks resolve live from thin-desks.json (mtime cache).',
  };
}
