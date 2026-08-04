// streetAgentSeed.js — build a page-context seed for OPEN GROK from Street.
// Includes current Street snapshot + house (read-only) + risk register summary.
// mode: pipeline (REFRESH STREET) | chat (OPEN GROK).
// Decision-support only. Does not write house/risks/pack.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadPack } from './pack.js';
import { getStreet } from './thinStreet.js';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const THIN_DESKS = path.join(SERVER_ROOT, 'config', 'thin-desks.json');

/**
 * @param {string} deskOrTicker
 * @returns {{ slug: string, ticker: string, label: string, house_file?: string }}
 */
export function resolveDeskIdentity(deskOrTicker) {
  const raw = String(deskOrTicker || '').trim();
  const slug = raw.toLowerCase().replace(/[^a-z0-9-]/g, '');
  const asTicker = raw.toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  let desks = [];
  try {
    const cfg = JSON.parse(fs.readFileSync(THIN_DESKS, 'utf8'));
    desks = Array.isArray(cfg.desks) ? cfg.desks : [];
  } catch { /* ignore */ }

  const hit = desks.find((d) => {
    const s = String(d.slug || d.id || '').toLowerCase();
    const t = String(d.ticker || '').toUpperCase();
    return s === slug || t === asTicker || s === asTicker.toLowerCase();
  });
  if (hit) {
    return {
      slug: String(hit.slug || hit.id || slug).toLowerCase(),
      ticker: String(hit.ticker || asTicker || slug).toUpperCase(),
      label: String(hit.label || hit.ticker || hit.slug || slug),
      house_file: hit.house_file || null,
    };
  }
  return {
    slug: slug || asTicker.toLowerCase(),
    ticker: asTicker || slug.toUpperCase(),
    label: asTicker || slug,
    house_file: null,
  };
}

/**
 * Compact firm lines for seed (not full why — agent reloads vault if needed).
 * @param {object} street
 */
function formatFirms(street) {
  const firms = Array.isArray(street?.firms) ? street.firms : [];
  if (!firms.length) return '_No complete firm models on glass (NEEDS BUILD)._\n';
  return firms.map((f, i) => {
    const pt = f.pt_display || (f.pt != null ? `$${f.pt}` : '—');
    const why = String(f.why || '').trim().replace(/\s+/g, ' ');
    const whyShort = why.length > 220 ? `${why.slice(0, 217)}…` : why;
    const url = f.source_url || f.url || '';
    return `${i + 1}. **${f.firm}** · ${f.rating || '—'} · ${pt} · ${f.date || '—'}`
      + (f.flag ? ` · flag=${f.flag}` : '')
      + `\n   why: ${whyShort || '(missing)'}`
      + (url ? `\n   link: ${url}` : '');
  }).join('\n');
}

/**
 * Normalize open mode from glass / open-grok body.
 * @param {unknown} mode
 * @returns {'pipeline' | 'chat'}
 */
export function normalizeStreetOpenMode(mode) {
  const m = String(mode || 'chat').toLowerCase().trim();
  if (m === 'pipeline' || m === 'refresh' || m === 'rebuild') return 'pipeline';
  return 'chat';
}

/**
 * @param {string} deskOrTicker
 * @param {{ mode?: string }} [opts]
 * @returns {{ ok: boolean, path?: string, desk?: string, ticker?: string, error?: string, bytes?: number, mode?: string }}
 */
export function writeStreetAgentSeed(deskOrTicker, opts = {}) {
  const id = resolveDeskIdentity(deskOrTicker);
  if (!id.slug && !id.ticker) {
    return { ok: false, error: 'empty desk' };
  }

  const mode = normalizeStreetOpenMode(opts.mode);
  const street = getStreet(id.ticker, { desk: id.slug });
  const packLoad = loadPack(id.ticker, { force: true });
  const pack = packLoad.available ? packLoad.pack : null;
  const hp = pack?.house_prior || {};
  const risks = Array.isArray(pack?.risks) ? pack.risks : [];
  const watch = [];
  const fired = [];
  const other = [];
  for (const r of risks) {
    const st = String(r.status || '').toUpperCase();
    const line = `- **${r.id || '?'}** ${r.name || 'unnamed'} · ${st || '—'}`
      + (r.grade ? ` · grade ${r.grade}` : '')
      + (r.summary ? `\n  ${String(r.summary).replace(/\s+/g, ' ').slice(0, 160)}` : '');
    if (st === 'WATCH') watch.push(line);
    else if (st === 'FIRED') fired.push(line);
    else other.push(line);
  }

  const cons = street.consensus || {};
  const c = street.computed || {};
  const firms = street.firms || [];

  const jobBlock = mode === 'pipeline'
    ? [
      '## Open mode: PIPELINE',
      '',
      'Glass button: **REFRESH STREET**. Default job — do **not** ask what the user wants first.',
      '',
      street.available && firms.length
        ? [
          '1. **Refresh path** — research new/changed third-party PTs since as_of/built_at.',
          '2. Update firm rows (complete only); drop weak recap-only rows or deepen why.',
          '3. Dual **format** + **info** verify loops (max 3 each).',
          '4. Publish Street vault only.',
          '5. Report: n firms, PT range, Δ vs prior, **WATCH collisions** (informational).',
          '6. Glass **auto-updates** when vault `built_at`/firms change (user already clicked REFRESH STREET). Street ≠ COMPILE BOOK.',
        ].join('\n')
        : [
          '1. **Rebuild path** — page empty/incomplete; build complete firm models from sources.',
          '2. Prefer 5–15 complete firms with model-depth why + https links.',
          '3. Dual **format** + **info** verify loops (max 3 each).',
          '4. Publish Street vault only.',
          '5. Report n firms + WATCH collisions (informational).',
          '6. Glass **auto-updates** after publish (poll on REFRESH STREET). Street ≠ COMPILE BOOK.',
        ].join('\n'),
      '',
      'Ontology/pack is **read context only** (house + risks below). Never write house, risks, pack, or run `./ont compile` for this job.',
    ].join('\n')
    : [
      '## Open mode: CHAT',
      '',
      'Glass button: **OPEN GROK**. Free-form Street agent.',
      '',
      'Brief the user in 3–6 lines: page state, house one-liner, WATCH count/names — then follow their lead:',
      '',
      '- **Assess** — quality vs Memory bar',
      '- **Refresh** — PTs moved; update models',
      '- **Rebuild** — empty / scrap quality',
      '- **Deepen** — model-first why; drop aggregate-as-firm rows',
      '- **Discuss only** — firm frames vs house/WATCH; no publish',
      '',
      'After any vault write: dual format + info verify → publish Street only. If user used REFRESH STREET, glass auto-paints on vault change.',
      'Ontology/pack is **read context only**. Street refresh ≠ COMPILE BOOK.',
    ].join('\n');

  const lines = [
    `# Street agent seed — ${id.label} (${id.ticker})`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Desk slug: \`${id.slug}\` · Glass room: \`#/${id.slug}/street\``,
    `## Open mode: ${mode === 'pipeline' ? 'PIPELINE' : 'CHAT'}`,
    '',
    '## Product law (do not violate)',
    '',
    '1. Decision-support only — **no house PT**, no personal buy/sell, no sizing.',
    '2. Street = **third-party published** firm models only — **not** house SoR, **not** pack SoR.',
    '3. Every published firm row must be **complete**: rating + numeric PT + date + 3–5 sentence why (≥180 chars) + https source_url.',
    '4. Never invent PTs, ratings, or why. No source → omit firm.',
    '5. **Write scope:** only `research-wiki/cockpit/street/' + id.ticker + '.json` via format-gated publish (`refreshStreet` / POST street/refresh).',
    '6. **Do not write** house, risks, or `ontology/store/`. You may *comment* on alignment vs house/WATCH; changes need glass ACCEPT paths elsewhere.',
    '7. **Ontology boundary:** pack house/risks = context only. Never fold firm PTs into the pack. Never COMPILE BOOK from Street.',
    '',
    jobBlock,
    '',
    '## Current Street (glass GET)',
    '',
    street.available
      ? [
        `- available: **true** · firms: **${firms.length}** · as_of: ${street.as_of || '—'} · built: ${street.built_at || street.fetched_at || '—'}`,
        `- provider: ${street.provider || '—'} · method: ${street.method || '—'}`,
        `- consensus rating: ${cons.rating || c.mean_rating || '—'}`,
        `- PT avg/low/high: ${cons.pt_avg ?? c.pt_median ?? '—'} / ${cons.pt_low ?? c.pt_low ?? '—'} / ${cons.pt_high ?? c.pt_high ?? '—'}`,
        cons.pt_note ? `- note: ${cons.pt_note}` : null,
        street.frame ? `- frame: ${String(street.frame).slice(0, 400)}` : null,
        street.bull ? `- bull: ${String(street.bull).slice(0, 280)}` : null,
        street.bear ? `- bear: ${String(street.bear).slice(0, 280)}` : null,
        street.trap ? `- trap: ${String(street.trap).slice(0, 200)}` : null,
        '',
        '### Firms',
        '',
        formatFirms(street),
      ].filter(Boolean).join('\n')
      : [
        `- available: **false** · needs_rebuild: ${street.needs_rebuild !== false}`,
        `- reason: ${street.reason || 'no complete models'}`,
        street.legacy_n != null ? `- legacy incomplete firms on disk: ${street.complete_n ?? 0} complete of ${street.legacy_n}` : null,
        '',
        '_Page is empty on glass. Prefer full rebuild with complete firm models._',
      ].filter(Boolean).join('\n'),
    '',
    '## House (read-only context — not Street write target)',
    '',
    pack
      ? [
        `- pack: available · compiled_at: ${pack.compiled_at || '—'}`,
        `- play: ${hp.play || '—'} · status: ${hp.status || '—'} · date: ${hp.date || '—'}`,
        hp.thesis ? `- thesis: ${String(hp.thesis).replace(/\s+/g, ' ').slice(0, 400)}` : null,
        hp.summary ? `- summary: ${String(hp.summary).replace(/\s+/g, ' ').slice(0, 400)}` : null,
        hp.stance ? `- stance: ${String(hp.stance).replace(/\s+/g, ' ').slice(0, 300)}` : null,
        ...(Object.keys(hp).length
          ? Object.entries(hp)
            .filter(([k]) => !['play', 'status', 'date', 'thesis', 'summary', 'stance'].includes(k))
            .slice(0, 8)
            .map(([k, v]) => {
              if (v == null || typeof v === 'object') return null;
              const s = String(v).replace(/\s+/g, ' ').slice(0, 240);
              return s ? `- ${k}: ${s}` : null;
            })
            .filter(Boolean)
          : []),
      ].filter(Boolean).join('\n') || '_House prior empty in pack._'
      : `_Pack unavailable for ${id.ticker}: ${packLoad.reason || 'missing'} — still may build Street from public sources; do not invent house._`,
    '',
    '## Risk register (read-only — WATCH / FIRED for collision checks)',
    '',
    risks.length
      ? [
        `Count: ${risks.length} · WATCH: ${watch.length} · FIRED: ${fired.length}`,
        '',
        '### WATCH',
        watch.length ? watch.join('\n') : '_none_',
        '',
        '### FIRED',
        fired.length ? fired.join('\n') : '_none_',
        other.length ? `\n### Other statuses\n${other.slice(0, 12).join('\n')}` : null,
      ].filter(Boolean).join('\n')
      : '_No risks in pack (or pack missing). Do not invent risks._',
    '',
    '## Publish reminder',
    '',
    '```bash',
    'cd memory-cockpit-v2',
    '# draft → validateStreetSnapshot → refreshStreet / POST /api/' + id.slug + '/street/refresh',
    '```',
    '',
    `Vault path: \`research-wiki/cockpit/street/${id.ticker}.json\``,
    '',
    '---',
    'End seed. Proceed with `/cockpit-street` job for this desk.',
    '',
  ];

  const body = lines.join('\n');
  const slugKey = id.slug || id.ticker.toLowerCase();
  const name = `cockpit-street-${slugKey}-seed.md`;
  // Always write /tmp on unix (agent slash commands look there). Also mirror os.tmpdir()
  // — on macOS those often differ (/tmp vs /var/folders/.../T).
  const candidates = [];
  if (process.platform !== 'win32') candidates.push(path.join('/tmp', name));
  const tmpDir = os.tmpdir();
  const tmpPath = path.join(tmpDir, name);
  if (!candidates.includes(tmpPath)) candidates.push(tmpPath);

  const written = [];
  let lastErr = null;
  for (const outPath of candidates) {
    try {
      fs.writeFileSync(outPath, body, 'utf8');
      written.push(outPath);
    } catch (e) {
      lastErr = e;
    }
  }
  if (!written.length) {
    return { ok: false, error: lastErr?.message || 'seed write failed' };
  }
  // Prefer /tmp for agent discoverability
  const primary = written.find((p) => p.startsWith('/tmp/')) || written[0];
  return {
    ok: true,
    path: primary,
    paths: written,
    desk: id.slug,
    ticker: id.ticker,
    mode,
    bytes: Buffer.byteLength(body, 'utf8'),
    street_available: !!street.available,
    firm_count: firms.length,
  };
}
