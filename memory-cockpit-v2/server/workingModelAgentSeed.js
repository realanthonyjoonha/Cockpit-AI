// workingModelAgentSeed.js — page-context seed for OPEN GROK from Model room.
// Decision-support only. Does not write vault.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadPack } from './pack.js';
import { getWorkingModel } from './thinWorkingModel.js';
import { resolveDeskIdentity } from './streetAgentSeed.js';

/**
 * @param {string} mode
 * @returns {'pipeline'|'chat'}
 */
function normalizeMode(mode) {
  const m = String(mode || '').toLowerCase().trim();
  if (m === 'pipeline' || m === 'refresh' || m === 'rebuild' || m === 'update') return 'pipeline';
  return 'chat';
}

/**
 * @param {string} deskOrTicker
 * @param {{ mode?: string }} [opts]
 */
export function writeWorkingModelAgentSeed(deskOrTicker, opts = {}) {
  const id = resolveDeskIdentity(deskOrTicker);
  if (!id?.ticker && !id?.slug) {
    return { ok: false, error: 'could not resolve desk/ticker for model seed' };
  }

  const mode = normalizeMode(opts.mode);
  const model = getWorkingModel(id.ticker, { desk: id.slug });
  const packLoad = loadPack(id.ticker, { force: true });
  const pack = packLoad.available ? packLoad.pack : null;
  const hp = pack?.house_prior || {};
  const risks = Array.isArray(pack?.risks) ? pack.risks : [];
  const watch = [];
  for (const r of risks) {
    const st = String(r.status || '').toUpperCase();
    if (st !== 'WATCH' && st !== 'FIRED') continue;
    watch.push(
      `- **${r.id || '?'}** ${r.name || 'unnamed'} · ${st}`
      + (r.summary ? `\n  ${String(r.summary).replace(/\s+/g, ' ').slice(0, 140)}` : ''),
    );
  }

  const assumptions = model.assumptions || [];
  const bridge = model.bridge || [];
  const variance = model.variance || [];

  const jobBlock = mode === 'pipeline'
    ? [
      '## Open mode: PIPELINE',
      '',
      'Glass button: **UPDATE MODEL**. Default job — do **not** ask what the user wants first if paste/context is present; if empty model with no numbers, rebuild skeleton from pack GAPs + ask only if zero drivers possible.',
      '',
      model.available
        ? [
          '1. **Refresh path** — load current vault model; update assumptions/bridge from user paste or newly available pack facts (GAP if unknown).',
          '2. Build **variance** vs prior where values moved.',
          '3. Link key assumptions to **WATCH risks** when relevant (or leave watch_risk null + note GAP).',
          '4. Format-verify → publish **only** `cockpit/model/' + id.ticker + '.json` via POST `/api/' + id.slug + '/model/refresh`.',
          '5. Report: n assumptions, n bridge lines, variance count, WATCH links — **no PT / no buy-sell**.',
          '6. Glass auto-updates when vault changes. Model ≠ COMPILE BOOK.',
        ].join('\n')
        : [
          '1. **Rebuild path** — page empty; create first working model.',
          '2. Assumptions table (user/pack/paste/GAP sources) + simple bridge (Rev → margins → optional EBITDA → FCF sketch as applicable).',
          '3. WATCH links on key lines where possible.',
          '4. Format-verify → publish Model vault only.',
          '5. Do **not** invent numbers — use pack grades or mark GAP.',
          '6. Glass auto-updates after publish. Model ≠ COMPILE BOOK.',
        ].join('\n'),
      '',
      'Ontology/pack = **read context only**. Never write house, risks, pack, or Street from this job.',
    ].join('\n')
    : [
      '## Open mode: CHAT',
      '',
      'Glass button: **OPEN GROK**. Free-form Model desk agent.',
      '',
      'Brief in 3–6 lines: model state, house one-liner, WATCH count — then follow user:',
      '',
      '- **Rebuild** — empty / scrap',
      '- **Update** — paste actuals/guide → variance',
      '- **Link risks** — map assumptions to WATCH',
      '- **Discuss only** — no publish',
      '',
      'After any vault write: format verify → POST model/refresh only. Never COMPILE BOOK for Model.',
    ].join('\n');

  const lines = [
    `# Model desk agent seed — ${id.label} (${id.ticker})`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Desk slug: \`${id.slug}\` · Glass room: \`#/${id.slug}/model\``,
    `## Open mode: ${mode === 'pipeline' ? 'PIPELINE' : 'CHAT'}`,
    '',
    '## Product law (do not violate)',
    '',
    '1. Decision-support only — **no buy/sell/hold**, **no fair value / price target as advice**, no sizing.',
    '2. Model vault = **user working numbers** only — **not** house SoR, **not** pack SoR, **not** Street.',
    '3. Never invent financials — pack graded claims, user paste, or **GAP**.',
    '4. Bridge is an **illustration** from assumptions — caption that clearly.',
    '5. **Write scope:** only `research-wiki/cockpit/model/' + id.ticker + '.json` via format-gated publish (`refreshWorkingModel` / POST model/refresh).',
    '6. **Do not write** house, risks, Street, or `ontology/store/`. Promote thesis/risk changes via separate propose/ACCEPT paths.',
    '7. EBITDA is optional — include only if useful for this desk; do not force an EBITDA-centric model.',
    '',
    jobBlock,
    '',
    '## Current Model (glass GET)',
    '',
    model.available
      ? [
        `- available: **true** · as_of: ${model.as_of || '—'} · built: ${model.built_at || model.fetched_at || '—'}`,
        `- assumptions: **${assumptions.length}** · bridge: **${bridge.length}** · variance: **${variance.length}**`,
        `- WATCH-linked assumptions: **${model.computed?.n_watch_linked ?? 0}**`,
        model.frame ? `- frame: ${String(model.frame).slice(0, 400)}` : null,
        '',
        '### Print Card (human-owned — you cannot arm, lock, or unlock)',
        ...(model.print
          ? [
            `- **${model.print.status === 'locked' ? 'LOCKED' : 'ARMED'}** · ${model.print.event} · print ${model.print.date}`,
            model.print.status === 'locked'
              ? `- These case lines are frozen — changing or dropping one makes the whole publish **fail**: ${(model.print.locked_case || []).map((r) => `${r.id}=${r.value ?? 'GAP'}`).join(' · ') || '—'}`
              : '- Case not locked yet. Still never fill a YOUR CASE value — leave GAP and say what is missing.',
          ]
          : ['- No print armed. Do not send a `print` block; refresh ignores it.']),
        '',
        '### Assumptions',
        ...assumptions.slice(0, 20).map((a) => (
          `- **${a.label}**: ${a.value ?? '—'} ${a.unit || ''} · src=${a.source || '—'}`
          + (a.watch_risk ? ` · WATCH ${a.watch_risk}` : '')
          + (a.note ? ` · ${String(a.note).slice(0, 80)}` : '')
        )),
        '',
        '### Bridge',
        ...bridge.slice(0, 20).map((b) => (
          `- **${b.label}**: ${b.value ?? '—'} ${b.unit || ''}`
          + (b.note ? ` · ${String(b.note).slice(0, 80)}` : '')
        )),
        variance.length ? '' : null,
        variance.length ? '### Variance (stored)' : null,
        ...variance.slice(0, 12).map((v) => (
          `- **${v.line}**: ${v.prior ?? '—'} → ${v.current ?? '—'} ${v.delta ? `(${v.delta})` : ''}`
        )),
      ].filter((x) => x != null)
      : [
        `- available: **false** · needs_rebuild: true`,
        `- reason: ${model.reason || 'empty'}`,
      ],
    '',
    '## House prior (read-only context)',
    '',
    hp.stance || hp.summary
      ? [
        `- stance: ${String(hp.stance || hp.status || '—').slice(0, 200)}`,
        hp.summary ? `- summary: ${String(hp.summary).replace(/\s+/g, ' ').slice(0, 280)}` : null,
      ].filter(Boolean).join('\n')
      : '- (no house_prior in pack or pack unavailable)',
    '',
    '## WATCH / FIRED risks (read-only — link assumptions here)',
    '',
    watch.length ? watch.join('\n') : '- (none in pack)',
    '',
    '## Publish shape (schema v1)',
    '',
    '```json',
    JSON.stringify({
      schema_version: 1,
      ticker: id.ticker,
      as_of: 'YYYY-MM-DD',
      frame: 'Illustration from user assumptions — not a price target.',
      assumptions: [
        {
          id: 'rev_growth',
          label: 'Revenue growth',
          value: '…',
          unit: '%',
          source: 'user|pack|paste|gap',
          note: null,
          watch_risk: 'R1',
          watch_note: 'optional',
        },
      ],
      bridge: [
        { id: 'revenue', label: 'Revenue', value: '…', unit: '', note: null },
      ],
      variance: [
        { line: 'Revenue growth', prior: '…', current: '…', delta: '…', comment: null },
      ],
      gaps: ['…'],
      disclaimer: 'Decision-support only. Illustration — not PT or recommendation.',
    }, null, 2),
    '```',
    '',
    `POST \`/api/${id.slug}/model/refresh\` with that body (or use agent publish path if available).`,
    `Vault path: \`research-wiki/cockpit/model/${id.ticker}.json\``,
    '',
    'End seed. Proceed with `/cockpit-model` job for this desk.',
  ];

  const text = lines.filter((x) => x != null).join('\n');
  const name = `cockpit-model-${id.slug}-seed.md`;
  const candidates = [
    path.join('/tmp', name),
    path.join(os.tmpdir(), name),
  ];
  let written = null;
  for (const p of candidates) {
    try {
      fs.writeFileSync(p, text, 'utf8');
      written = p;
      break;
    } catch { /* try next */ }
  }
  if (!written) {
    return { ok: false, error: 'could not write model seed file' };
  }

  return {
    ok: true,
    path: written,
    bytes: Buffer.byteLength(text, 'utf8'),
    ticker: id.ticker,
    slug: id.slug,
    mode,
    assumption_count: assumptions.length,
    model_available: !!model.available,
  };
}
