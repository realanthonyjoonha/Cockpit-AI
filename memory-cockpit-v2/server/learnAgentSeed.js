// learnAgentSeed.js — OPEN GROK seed for Background primer + tutor.
// Decision-support only. Does not write house/risks/pack.
// Primer mode is the learn-map engine (harvest → map → lessons), not a moderate one-pager.
import fs from 'fs';
import os from 'os';
import path from 'path';
import { loadPack } from './pack.js';
import { resolveDeskIdentity } from './streetAgentSeed.js';
import { getLearnSnapshot, learnDir, startLearnDeep } from './thinLearn.js';
import { formatHarvestForSeed, harvestLearnSources } from './learnHarvest.js';
import { LEARN_DEPTH_BAR } from './learnMap.js';
import { DEEP_ORDER, DEEP_READY_WORDS } from './learnDeep.js';
import { topicId } from './learnSchema.js';
import {
  formatPhotoSeedBlock,
  learnPhotoQueries,
  photoHostAllowlist,
} from './learnPhotos.js';
import { tryGetThinDeskBundle } from './thinDeskProfiles.js';

function formatPhotosJobForSeed(id, snap) {
  const bundle = tryGetThinDeskBundle(id.slug);
  const displayName = bundle?.model?.displayName || id.label;
  const allow = photoHostAllowlist(id.ticker);
  const queries = learnPhotoQueries(snap.map, displayName);
  return formatPhotoSeedBlock({
    allow,
    queries,
    candidates: [],
    slug: id.slug,
  });
}

function normalizeMode(mode) {
  const m = String(mode || '').toLowerCase().trim();
  if (m === 'primer' || m === 'pipeline' || m === 'background' || m === 'rebuild') return 'primer';
  if (m === 'deepen' || m === 'learn-deepen' || m === 'deep') return 'deepen';
  return 'tutor';
}

function deepenJobBlock(id, node, snap) {
  const nid = node.id;
  const fired = (snap.deep || []).find((d) => d.node_id === nid);
  return [
    '## Open mode: DEEPEN (one Study Tree node — product-mechanism deep-dive)',
    '',
    `Node: **${nid}** — ${node.title} [${node.kind}/${node.status}]`,
    fired?.status === 'fired'
      ? `Prior note on glass: FIRED · ${fired.n_words || 0} words · re-run overwrites note.md after you POST.`
      : 'Fire state now: RUNNING (seed marked the node). Glass shows WAITING until you POST.',
    '',
    'This is **not** BUILD BACKGROUND, not the tutor, not a thesis report.',
    'Copy **craft** of a Reports deep-dive (structured sections, graded anchors, mechanism, GAP, exec last).',
    'Do **not** copy the thesis lane: no house chapter, no register chapter, no checkpoints that wait, no propose_*, no scripts/report FIGMAP.',
    'House prior below is **read-once context**. Do not paste stance into the note.',
    `Pace = **through**. Anthony fired this from glass. Do not wait for a nod.`,
    `Target ≥${DEEP_READY_WORDS} words. Hard floor is lower; a thin note still publishes but glass marks THIN.`,
    '',
    `ORDER (required headings): ${DEEP_ORDER.join(' · ')}`,
    '',
    '1. Read Harvest + this node (title, not-this, sources, GAP). Primary-first. Soft press → **[soft]**.',
    '2. Do not invent mix $ / named customers / utilization. Missing → **GAP**.',
    `3. POST \`/api/${id.slug}/learn/deep\` \`${JSON.stringify({
      node_id: nid,
      markdown: `# ${node.title}\n\n## Setup\n\n…\n\n## Mechanism\n\n…\n\n## Evidence\n\n…\n\n## What a figure is not\n\n…\n\n## GAP / UNKNOWN\n\n…\n\n## Exec\n\n…`,
      as_of: node.as_of || 'YYYY-MM-DD',
    })}\``,
    '4. **Do not wipe learner.json.** Do not POST known/fuzzy/last_session.',
    '5. **No [[wikilinks]]**. Name the filing in English.',
    '6. Never write house, 08-risks, ontology/store/, Model, Street, COMPILE BOOK, or propose_*.',
    '7. Do not paste mermaid. Architecture lives on the map. This note is prose.',
  ].join('\n');
}

/**
 * @param {string} deskOrTicker
 * @param {{ mode?: string, rawDir?: string, node_id?: string }} [opts]
 */
export function writeLearnAgentSeed(deskOrTicker, opts = {}) {
  const id = resolveDeskIdentity(deskOrTicker);
  if (!id?.ticker && !id?.slug) {
    return { ok: false, error: 'could not resolve desk/ticker for learn seed' };
  }

  const mode = normalizeMode(opts.mode);
  let snap = getLearnSnapshot(id.ticker, { desk: id.slug });
  let deepenNode = null;
  let deepenStart = null;
  if (mode === 'deepen') {
    const nid = topicId(opts.node_id || opts.nodeId);
    if (!nid) return { ok: false, error: 'deepen needs node_id' };
    if (!snap.map) return { ok: false, error: 'no product-map.json — BUILD BACKGROUND first' };
    deepenNode = (snap.map.nodes || []).find((n) => n.id === nid);
    if (!deepenNode) return { ok: false, error: `node ${nid} not on product-map` };
    try {
      deepenStart = startLearnDeep(id.ticker, nid, { desk: id.slug });
    } catch (e) {
      deepenStart = { ok: false, error: e.message || String(e) };
    }
    if (!deepenStart?.ok) {
      return { ok: false, error: deepenStart?.error || 'could not mark node RUNNING' };
    }
    snap = getLearnSnapshot(id.ticker, { desk: id.slug });
  }
  let pack = null;
  try {
    const packLoad = loadPack(id.ticker, { force: true });
    pack = packLoad.available ? packLoad.pack : null;
  } catch {
    pack = null;
  }
  const hp = pack?.house_prior || {};

  let harvest = null;
  try {
    harvest = harvestLearnSources(id.ticker, { desk: id.slug, rawDir: opts.rawDir });
  } catch (e) {
    harvest = { ok: false, error: e.message || String(e) };
  }

  const learner = snap.learner || {};
  const known = (learner.known || []).map((t) => `- **${t.id}** ${t.label}`).join('\n') || '- (none yet)';
  const fuzzy = (learner.fuzzy || []).map((t) => `- **${t.id}** ${t.label}${t.note ? ` — ${t.note}` : ''}`).join('\n') || '- (none yet)';
  const nxt = (learner.next || []).map((t) => `- **${t.id}** ${t.label}${t.note ? ` — ${t.note}` : ''}`).join('\n') || '- (tutor chooses)';
  const lessons = (snap.lessons || []).map((l) => `- \`${l.id}\` ${l.title} · ${l.updated_at || ''}`).join('\n') || '- (none)';
  const mapNodes = (snap.map?.nodes || []).map((n) => (
    `- **${n.id}** [${n.kind}/${n.status}] ${n.title}${n.lesson_id ? ` → lesson \`${n.lesson_id}\`` : ''}`
  )).join('\n') || '- (no product-map.json yet)';

  const primerPreview = snap.primer?.markdown
    ? String(snap.primer.markdown).slice(0, 2400)
    : '(no primer yet)';

  const bar = LEARN_DEPTH_BAR;
  const jobBlock = mode === 'primer'
    ? [
      '## Open mode: BUILD BACKGROUND (learn-map engine — not a moderate one-pager)',
      '',
      'Job: a **technical product** spine + product-map the human can actually study.',
      'What they build / sell / run (chips, systems, networking, process, software, power).',
      `Depth bar: primer spine ≥${bar.primer_min_words} words · ≥${bar.min_ready_nodes} ready map nodes · ≥${bar.min_lessons_with_body} lessons of ≥${bar.lesson_min_words} words · ≥${bar.min_diagrams} architecture diagram (family required types).`,
      'This is **not** a thesis PDF, not House, not Model numbers, not a rating, ≠ COMPILE BOOK.',
      'Glass architecture is **HTML** from `diagrams[]` (stack / flow / segments / attach table). **Do not paste mermaid or SVG.**',
      'Study Tree on glass is an **unfired launcher**. Do **not** treat lessons as the tree body. Node deep-dives are a later DEEPEN action.',
      '',
      '1. Read the **Harvest** section first (vault 01/02 + graded pack claims). Primary-first. Soft press → **[soft]**. Missing $ mix / named customers / utilization → **GAP** or node status `unknown`.',
      '2. Pick **family** from harvest (`family_guess`) unless the filing is clearly another shape. Do not invent a per-ticker UI.',
      `3. POST \`/api/${id.slug}/learn/map\` with \`product-map.json\` shape (family, as_of, sources[], not_this[], gaps[], nodes[], **diagrams[]**). Each ready node needs \`lesson_id\`, kind, and source pins. Diagrams: typed stack/flow/segments/interconnect from harvest only.`,
      `4. POST \`/api/${id.slug}/learn/primer\` — the **spine** (as-of, filed mix, named families, not-this, what a figure is not, GAP list). Not 40 pages. Not a one-sitting pamphlet. **Do not paste mermaid into the primer.** Glass renders HTML architecture from the map.`,
      `5. POST \`/api/${id.slug}/learn/lessons\` **one per ready node** (mechanism + named products + source/as-of + what a figure is not + GAP). Upsert by id. These feed the depth bar / future tutor — they are not the Study Tree deep-dives.`,
      '6. **Do not wipe learner.json.** Do not POST known/fuzzy/last_session unless you are tutoring. Optional: POST `next` only if next is empty.',
      '7. **No [[wikilinks]]** in published markdown. Name the filing in English (FY2026 10-K, Q1 PR).',
      '8. Never write house, 08-risks, ontology/store/, Model, Street, or COMPILE BOOK. Never import Reports diagrams/*.png. Unknown topology / mix $ → GAP block, not a pretty lie.',
      '9. Photos (optional enrichment): harvest from the Photos job below. Primary = company/SEC hosts only. Tape must pass the identification gate or stay GAP. ≤8 total / ≤4 tape. Captions carry no $. Tape captions say web, not a filing. No generated images.',
    ].join('\n')
    : mode === 'deepen'
      ? deepenJobBlock(id, deepenNode, snap)
      : [
        '## Open mode: TUTOR (interactive, Grok terminal is the classroom)',
        '',
        'Teach this human on **this desk**. Read learner state **and** the product map. Do not restart from zero.',
        '',
        '1. If primer or map is missing, run the BUILD BACKGROUND path first (map + spine + lessons), then teach.',
        '2. Walk the **study tree** (map nodes). Prefer fuzzy → next → uncovered ready nodes. One check question at a time. No quiz LMS.',
        '3. Classroom is this terminal. Lesson files already on glass are the textbook. Node **deep-dives** (`learn/deep/`) are a separate on-demand product — do not confuse them with lessons.',
        `4. End of a resolved chunk: POST \`/api/${id.slug}/learn/learner\` with **upserts** to known/fuzzy/next + last_session.`,
        '   **Silence is not contradiction** — omit arrays you are not updating. Do not wipe known because you did not mention it.',
        `5. If a chunk should live on glass as a lesson: POST \`/api/${id.slug}/learn/lessons\` \`{ "id": "cpo", "markdown": "# …" }\`.`,
        '6. Never write house / risks / pack. Never invent SKU revenue splits. Never POST a full learner replace.',
      ].join('\n');

  const lines = [
    `# Company learn agent seed — ${id.label} (${id.ticker})`,
    '',
    `Generated: ${new Date().toISOString()}`,
    `Desk slug: \`${id.slug}\` · Glass: \`#/${id.slug}/background\``,
    `Depth gate now: ${snap.depth_gate?.ok ? 'PASS' : 'FAIL'} — ${(snap.depth_gate?.reasons || ['n/a']).join('; ')}`,
    '',
    '## Product law',
    '',
    '1. Decision-support only — no buy/sell/hold, no PT, no sizing.',
    '2. Primer + map + learner + lessons = **ops vault**, not pack SoR. COMPILE BOOK is unrelated.',
    '3. Invented mix / SKU $ / customer counts / utilization → GAP. Diagrams: unknown attach is a GAP box, not a pretty topology. Learner merge: silence is not contradiction.',
    '4. Rebuild overwrites primer + upserts map/lessons. **Learner memory survives.**',
    '',
    jobBlock,
    '',
    '## Learner state (read this every open — do not wipe on rebuild)',
    '',
    `- style: experience=${learner.style?.experience || 'learning'} · depth=${learner.style?.depth || 'moderate'} (tutor pacing; fill still uses the product-map bar)`,
    `- last_session: ${learner.last_session?.at || '(none)'} ${learner.last_session?.note || ''}`,
    '',
    '### Known',
    known,
    '',
    '### Still fuzzy',
    fuzzy,
    '',
    '### Next',
    nxt,
    '',
    '## Product map on glass',
    '',
    snap.map
      ? `Family **${snap.map.family}** · as-of ${snap.map.as_of} · ${snap.map.nodes?.length || 0} nodes · ${snap.map.diagrams?.length || 0} diagrams`
      : 'No product-map.json yet — BUILD BACKGROUND must POST the map.',
    '',
    mapNodes,
    '',
    '## Lessons on glass',
    '',
    lessons,
    '',
    '## Current primer (truncated)',
    '',
    primerPreview,
    '',
    formatHarvestForSeed(harvest),
    formatPhotosJobForSeed(id, snap),
    '',
    '## House prior (read-only — do not copy into the primer as stance)',
    '',
    hp.view_excerpt
      ? String(hp.view_excerpt).replace(/\s+/g, ' ').slice(0, 400)
      : (hp.play || '(none)'),
    '',
    '## Publish shapes',
    '',
    '```json',
    JSON.stringify({
      map: {
        family: harvest?.family_guess || 'fabless_platform',
        as_of: 'YYYY-MM-DD',
        sources: [{ label: 'FY2026 10-K Item 1', as_of: 'YYYY-MM-DD', grade: 'A' }],
        not_this: ['…'],
        gaps: [{ id: 'sku-mix', label: 'SKU $ splits', status: 'unknown' }],
        nodes: [{
          id: 'cuda', kind: 'software', title: 'CUDA is not a chip', status: 'ready',
          lesson_id: 'cuda', sources: [{ label: 'FY2026 10-K', as_of: 'YYYY-MM-DD', grade: 'A' }],
          not_this: 'Not a revenue line',
        }],
        diagrams: [{
          id: 'stack', type: 'stack', title: 'Product stack', as_of: 'YYYY-MM-DD',
          sources: [{ label: 'FY2026 10-K Item 1', as_of: 'YYYY-MM-DD', grade: 'A' }],
          blocks: [
            { id: 'sw', label: 'Software', kind: 'software', status: 'ready' },
            { id: 'si', label: 'Silicon', kind: 'silicon', status: 'ready' },
          ],
        }],
        photos: [],
      },
      photo: {
        id: 'system-photo', lane: 'primary', kind: 'system',
        image_url: 'https://…', page_url: 'https://…', caption: '…', as_of: 'YYYY-MM-DD',
        source_label: 'Company newsroom',
      },
      primer: { markdown: '# TICKER — what they build\n\n…' },
      lesson: { id: 'cuda', markdown: '# CUDA is not a chip\n\n…' },
      learner: {
        next: [{ id: 'cuda', label: 'CUDA vs the silicon' }],
      },
    }, null, 2),
    '```',
    '',
    mode === 'primer'
      ? `End seed. Proceed with \`/cockpit-learn ${id.slug} primer\`. Decision-support only.`
      : mode === 'deepen'
        ? `End seed. Proceed with \`/cockpit-learn ${id.slug} deepen ${deepenNode.id}\`. Decision-support only.`
        : `End seed. Proceed with \`/cockpit-learn ${id.slug} tutor\`. Decision-support only.`,
  ];

  const text = lines.join('\n');
  const name = `cockpit-learn-${id.slug}-seed.md`;
  const dir = learnDir(id.ticker);
  const candidates = [
    dir ? path.join(dir, 'seed.md') : null,
    path.join('/tmp', name),
    path.join(os.tmpdir(), name),
  ].filter(Boolean);
  let written = null;
  for (const p of candidates) {
    try {
      fs.mkdirSync(path.dirname(p), { recursive: true });
      fs.writeFileSync(p, text, 'utf8');
      written = p;
      break;
    } catch { /* try next */ }
  }
  if (!written) return { ok: false, error: 'could not write learn seed' };
  return {
    ok: true,
    path: written,
    bytes: Buffer.byteLength(text, 'utf8'),
    mode,
    ticker: id.ticker,
    slug: id.slug,
    family_guess: harvest?.family_guess || null,
    node_id: deepenNode?.id || null,
  };
}
