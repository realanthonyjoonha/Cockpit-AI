#!/usr/bin/env node
/**
 * desk-health.mjs — scar-tissue glass operability for thin desks.
 *
 * Proves: registered slug is operable (not routing-dead). Does NOT audit book quality.
 *
 * Scars:
 *   S1 registry slug must not be in RESERVED_API_SLUGS (NBIS 2026-08-04)
 *   S2 resolveThinDesk(slug) non-null + model.house
 *   S3 live GET /meta /house /overview must not return thin_desk_not_found / reserved
 *   S4 catalog list alone is insufficient — always resolve + optional HTTP
 *
 * Usage:
 *   node scripts/desk-health.mjs --slug nbis
 *   node scripts/desk-health.mjs --all
 *   node scripts/desk-health.mjs --slug tsm --base-url http://127.0.0.1:4682
 *   node scripts/desk-health.mjs --all --base-url http://127.0.0.1:4682 --json
 *
 * Exit: 0 pass, 1 fail, 2 usage
 */
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const {
  RESERVED_API_SLUGS,
  resolveThinDesk,
  invalidateThinRegistryCache,
  listThinDesksPublic,
} = await import(path.join(ROOT, 'server', 'thinDeskMount.js'));

function parseArgs(argv) {
  const out = { slug: null, all: false, baseUrl: null, json: false };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--all') out.all = true;
    else if (a === '--json') out.json = true;
    else if (a === '--slug') out.slug = String(argv[++i] || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    else if (a === '--base-url') out.baseUrl = String(argv[++i] || '').replace(/\/$/, '');
    else if (a === '-h' || a === '--help') out.help = true;
    else {
      console.error(`unknown arg: ${a}`);
      out.help = true;
    }
  }
  return out;
}

async function fetchJson(url) {
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  let body = null;
  const text = await res.text();
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = { _raw: text.slice(0, 200) };
  }
  return { status: res.status, body, ok: res.ok };
}

/**
 * @param {string} slug
 * @param {{ baseUrl?: string|null }} opts
 */
async function healthOne(slug, opts = {}) {
  const checks = [];
  let failed = 0;
  const add = (id, ok, detail) => {
    checks.push({ id, ok, detail });
    if (!ok) failed += 1;
  };

  invalidateThinRegistryCache();
  const pub = listThinDesksPublic();
  const desks = Array.isArray(pub.desks) ? pub.desks : [];
  const desk = desks.find((d) => d.slug === slug);

  // S4/S1: must be in catalog
  if (!desk) {
    add('S1_registry', false, `slug "${slug}" not in thin-desks.json`);
    return { slug, pass: false, failed, checks, live: null };
  }
  add('S1_registry', true, `in catalog · ticker ${desk.ticker || '?'}`);

  // S1: not reserved
  if (RESERVED_API_SLUGS.has(slug)) {
    add('S1_reserved', false, `slug is in RESERVED_API_SLUGS (split-brain — remove from reserved set)`);
  } else {
    add('S1_reserved', true, 'not in RESERVED_API_SLUGS');
  }

  // S2: resolve
  const rt = resolveThinDesk(slug);
  if (!rt) {
    add('S2_resolve', false, 'resolveThinDesk returned null');
  } else if (!rt.model || typeof rt.model.house !== 'function') {
    add('S2_resolve', false, 'runtime missing model.house');
  } else {
    add('S2_resolve', true, `resolved · canonical ${rt.slug}`);
  }

  // Soft: street room
  const rooms = Array.isArray(pub.rooms) ? pub.rooms : [];
  if (rooms.length && !rooms.includes('street')) {
    add('S6_street_room', false, 'top-level rooms[] missing street (soft factory warn)');
    // soft: do not count as hard fail for desk operability of house
    failed -= 1;
    checks[checks.length - 1].soft = true;
  } else if (rooms.includes('street')) {
    add('S6_street_room', true, 'rooms includes street');
  } else {
    add('S6_street_room', true, 'rooms not declared at top-level (skip)');
  }

  let live = null;
  if (opts.baseUrl) {
    live = { baseUrl: opts.baseUrl, routes: {} };
    const paths = ['meta', 'house', 'overview'];
    for (const p of paths) {
      const url = `${opts.baseUrl}/api/${slug}/${p}`;
      try {
        const r = await fetchJson(url);
        live.routes[p] = { status: r.status, code: r.body?.code || null, available: r.body?.available };
        const code = r.body?.code || '';
        const routingFail = r.status === 404
          || code === 'thin_desk_not_found'
          || code === 'thin_desk_reserved_slug'
          || code === 'thin_desk_resolve_failed';
        if (routingFail) {
          add(`S3_live_${p}`, false, `HTTP ${r.status} code=${code || 'n/a'} (routing failure)`);
        } else {
          // 200 with available false = book empty, still operable route
          add(`S3_live_${p}`, true, `HTTP ${r.status} available=${r.body?.available ?? 'n/a'}`);
        }
      } catch (e) {
        add(`S3_live_${p}`, false, `fetch error: ${e.message || e}`);
        live.routes[p] = { error: String(e.message || e) };
      }
    }
  }

  // Hard fail = any non-soft check failed
  const hardFailed = checks.filter((c) => !c.ok && !c.soft).length;
  return {
    slug,
    ticker: desk.ticker,
    pass: hardFailed === 0,
    failed: hardFailed,
    checks,
    live,
  };
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help || (!args.slug && !args.all)) {
    console.log(`Usage:
  node scripts/desk-health.mjs --slug SLUG [--base-url URL] [--json]
  node scripts/desk-health.mjs --all [--base-url URL] [--json]
Exit 0 pass · 1 fail · 2 usage`);
    process.exit(args.help ? 0 : 2);
  }

  invalidateThinRegistryCache();
  const pub = listThinDesksPublic();
  const desks = Array.isArray(pub.desks) ? pub.desks : [];
  const slugs = args.all
    ? desks.map((d) => d.slug)
    : [args.slug];

  if (args.all && slugs.length === 0) {
    console.log('desk-health: no desks in registry (empty install) — PASS');
    process.exit(0);
  }

  if (!args.all && !desks.some((d) => d.slug === args.slug)) {
    console.error(`desk-health FAIL: slug "${args.slug}" not in registry`);
    console.error(`  known: ${desks.map((d) => d.slug).join(', ') || '(none)'}`);
    process.exit(1);
  }

  const results = [];
  for (const s of slugs) {
    // eslint-disable-next-line no-await-in-loop
    results.push(await healthOne(s, { baseUrl: args.baseUrl }));
  }

  if (args.json) {
    console.log(JSON.stringify({ results, pass: results.every((r) => r.pass) }, null, 2));
  } else {
    console.log('\ndesk-health (scar-tissue glass operability)\n');
    if (args.baseUrl) console.log(`  live base: ${args.baseUrl}\n`);
    for (const r of results) {
      console.log(`${r.pass ? 'PASS' : 'FAIL'}  ${r.slug}${r.ticker ? ` (${r.ticker})` : ''}`);
      for (const c of r.checks) {
        const mark = c.ok ? '✓' : (c.soft ? '~' : '✗');
        console.log(`  ${mark} [${c.id}] ${c.detail}`);
      }
      console.log('');
    }
    const nFail = results.filter((r) => !r.pass).length;
    console.log(
      nFail
        ? `desk-health FAIL — ${nFail}/${results.length} desk(s)`
        : `desk-health PASS — ${results.length} desk(s)`,
    );
  }

  process.exit(results.every((r) => r.pass) ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
