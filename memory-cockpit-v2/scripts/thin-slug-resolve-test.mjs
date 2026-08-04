#!/usr/bin/env node
/**
 * thin-slug-resolve-test.mjs — fail-closed: live registry slugs must resolve.
 *
 * Guards P0 split-brain: desk listed in thin-desks.json but blocked by RESERVED_API_SLUGS
 * (NBIS 2026-08-04: nbis was reserved for legacy /api/nbis/proposals* — wrong).
 *
 *   node scripts/thin-slug-resolve-test.mjs
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

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log('  ✓', m); };
const bad = (m) => { fail += 1; console.log('  ✗', m); };

console.log('\nthin-slug-resolve (registry ↔ resolveThinDesk invariant)\n');

invalidateThinRegistryCache();
const pub = listThinDesksPublic();
const desks = Array.isArray(pub.desks) ? pub.desks : [];
ok(`catalog desks: ${desks.length ? desks.map((d) => d.slug).join(', ') : '(none)'}`);

// Memory globals must stay reserved (spot-check)
for (const s of ['overview', 'risks', 'house', 'street', 'thin-desks', 'open-grok']) {
  if (!RESERVED_API_SLUGS.has(s)) bad(`expected reserved: ${s}`);
  else if (resolveThinDesk(s) != null) bad(`reserved ${s} must not resolve as desk`);
}
ok('Memory/global segments stay reserved and do not resolve');

// Live thin slugs must NEVER be reserved and must resolve
for (const d of desks) {
  const slug = String(d.slug || '').toLowerCase();
  if (!slug) {
    bad('empty desk slug in registry');
    continue;
  }
  if (RESERVED_API_SLUGS.has(slug)) {
    bad(`registry slug "${slug}" is in RESERVED_API_SLUGS (split-brain — remove from reserved)`);
    continue;
  }
  const rt = resolveThinDesk(slug);
  if (!rt) {
    bad(`resolveThinDesk("${slug}") returned null (registered but not resolvable)`);
    continue;
  }
  if (rt.slug !== slug && !Array.isArray(d.aliases)) {
    // allow alias-only mismatch if canonical differs
  }
  if (!rt.model || typeof rt.model.house !== 'function') {
    bad(`runtime for ${slug} missing model.house`);
    continue;
  }
  ok(`resolve ${slug} → ticker ${d.ticker || rt.desk?.ticker || '?'}`);
}

// Historical footgun: nbis must not be reserved when present as a desk
if (desks.some((d) => d.slug === 'nbis')) {
  if (RESERVED_API_SLUGS.has('nbis')) bad('nbis is a live desk but still RESERVED');
  else if (!resolveThinDesk('nbis')) bad('nbis registered but resolve failed');
  else ok('nbis live desk: not reserved + resolves (legacy proposals use exact paths)');
} else {
  ok('nbis not in this install registry (skip live-desk assert)');
}

// Aliases (if any) should resolve to a runtime
for (const d of desks) {
  const aliases = Array.isArray(d.aliases) ? d.aliases : [];
  for (const a of aliases) {
    const al = String(a || '').toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (!al) continue;
    if (RESERVED_API_SLUGS.has(al)) {
      bad(`alias "${al}" for ${d.slug} is reserved`);
      continue;
    }
    const rt = resolveThinDesk(al);
    if (!rt) bad(`alias "${al}" for ${d.slug} does not resolve`);
    else ok(`alias ${al} → ${rt.slug}`);
  }
}

console.log(`\nthin-slug-resolve ${fail ? 'FAIL' : 'PASS'} — ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
