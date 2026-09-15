// learnHarvest.js — deterministic source harvest for the learn-map engine.
// Reads vault 01/02 research notes + graded pack claims. Never writes house/pack/store.
// Decision-support only. Harvest is ops input for Grok fill — not pack SoR.
import fs from 'fs';
import path from 'path';
import { resolveVaultDir } from './monorepoPaths.js';
import { loadPack } from './pack.js';
import { sanitizeTicker } from './learnSchema.js';
import { inferLearnFamily } from './learnMap.js';

const FILE_EXCERPT_CHARS = 8000;
const CLAIMS_MAX = 24;
const HEADING_MAX = 24;

function vaultRoot() {
  return resolveVaultDir();
}

function readUtf(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return null;
  }
}

function headingsFrom(md) {
  const lines = String(md || '').split('\n');
  const out = [];
  for (const line of lines) {
    const m = line.match(/^#{1,3}\s+(.+)$/);
    if (!m) continue;
    out.push(m[1].trim().slice(0, 160));
    if (out.length >= HEADING_MAX) break;
  }
  return out;
}

function asOfFrom(md) {
  const m = String(md || '').match(/\*\*As-of:\*\*\s*([^\n]+)/i)
    || String(md || '').match(/^As-of:\s*([^\n]+)/im);
  return m ? m[1].trim().slice(0, 200) : null;
}

/**
 * Default research dir when registry profile is not passed.
 * AVGO uses 02-ai-semiconductor.md — glob 01-* / 02-*, do not hardcode filenames.
 */
export function defaultRawDir(ticker) {
  const id = sanitizeTicker(ticker);
  if (!id) return null;
  return path.join('raw', `${id.toLowerCase()}-research`);
}

/**
 * @param {string} ticker
 * @param {{ rawDir?: string, desk?: string }} [opts]
 */
export function harvestLearnSources(ticker, opts = {}) {
  const id = sanitizeTicker(ticker);
  if (!id) {
    return { ok: false, error: 'empty ticker', ticker: null, files: [], claims: [] };
  }
  const vault = vaultRoot();
  const rawRel = String(opts.rawDir || defaultRawDir(id) || '').replace(/^\/+/, '');
  const rawAbs = rawRel ? path.join(vault, rawRel) : null;
  const files = [];
  const missing = [];

  if (!rawAbs || !fs.existsSync(rawAbs)) {
    missing.push(rawRel || 'rawDir');
  } else {
    let names = [];
    try {
      names = fs.readdirSync(rawAbs).filter((n) => /^(01|02)-.+\.md$/i.test(n)).sort();
    } catch {
      names = [];
    }
    if (names.length === 0) missing.push(`${rawRel}/01-*.md or 02-*.md`);
    for (const name of names) {
      const abs = path.join(rawAbs, name);
      const md = readUtf(abs) || '';
      files.push({
        rel: `${rawRel}/${name}`,
        as_of: asOfFrom(md),
        n_chars: md.length,
        headings: headingsFrom(md),
        excerpt: md.slice(0, FILE_EXCERPT_CHARS),
      });
    }
  }

  let packAvailable = false;
  let summary = null;
  const claims = [];
  try {
    const packLoad = loadPack(id, { force: true });
    packAvailable = !!packLoad.available;
    const pack = packLoad.available ? packLoad.pack : null;
    summary = pack?.object?.summary ? String(pack.object.summary).slice(0, 600) : null;
    const rawClaims = Array.isArray(pack?.claims) ? pack.claims : [];
    const graded = [...rawClaims].sort((a, b) => {
      const ga = String(a.grade || 'Z');
      const gb = String(b.grade || 'Z');
      return ga.localeCompare(gb);
    });
    for (const c of graded.slice(0, CLAIMS_MAX)) {
      const text = String(c.text || c.claim || '').replace(/\s+/g, ' ').trim();
      if (!text) continue;
      claims.push({
        id: c.id || null,
        grade: c.grade || '—',
        as_of: c.as_of || null,
        source_id: c.source_id || null,
        text: text.slice(0, 240),
      });
    }
  } catch {
    packAvailable = false;
  }

  const harvestText = [
    summary || '',
    files.map((f) => `${f.rel}\n${f.headings.join('\n')}\n${f.excerpt}`).join('\n'),
    claims.map((c) => c.text).join('\n'),
  ].join('\n');

  return {
    ok: true,
    ticker: id,
    desk: opts.desk || null,
    raw_dir: rawRel || null,
    pack_available: packAvailable,
    summary,
    family_guess: inferLearnFamily(harvestText),
    files,
    claims,
    missing,
    harvested_at: new Date().toISOString(),
    decision_support_only: true,
    note: 'Harvest is ops input for the learn-map fill. Not pack SoR. Not House. Not a rating.',
  };
}

export function formatHarvestForSeed(harvest) {
  if (!harvest?.ok) {
    return `## Harvest (failed)\n\n${harvest?.error || 'no harvest'}\n`;
  }
  const fileBlocks = (harvest.files || []).map((f) => {
    const heads = (f.headings || []).map((h) => `- ${h}`).join('\n') || '- (no headings)';
    return [
      `### \`${f.rel}\` · ${f.n_chars} chars · as-of ${f.as_of || 'UNKNOWN'}`,
      '',
      'Headings:',
      heads,
      '',
      'Excerpt (truncated, read the file for the rest):',
      '',
      f.excerpt || '(empty)',
    ].join('\n');
  });
  const claimLines = (harvest.claims || []).map((c) => (
    `- [${c.grade}] ${c.as_of || '—'} ${c.text}${c.source_id ? ` · ${c.source_id}` : ''}`
  ));
  return [
    '## Harvest (deterministic — vault 01/02 + pack claims)',
    '',
    `Family guess (content, not a ticker table): **${harvest.family_guess}**`,
    harvest.summary ? `Pack summary: ${harvest.summary}` : 'Pack summary: (none)',
    harvest.missing?.length ? `Missing: ${harvest.missing.join('; ')}` : 'Missing: (none)',
    '',
    'Do **not** copy house stance into the primer. Do **not** invent SKU $ / named customers / utilization.',
    'Filed cuts with as-of source, or GAP/UNKNOWN.',
    '',
    '### Pack claims (graded, not exhaustive)',
    '',
    claimLines.length ? claimLines.join('\n') : '- (no pack or no claims)',
    '',
    fileBlocks.length ? fileBlocks.join('\n\n') : '### Vault 01/02\n\n- (none on disk)',
    '',
  ].join('\n');
}
