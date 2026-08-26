// thinModel.js — Path 2A S3: pack-backed thin desk payloads for any ticker.
// Decision-support only. Anti-fabrication: missing pack → available:false, never invent.
import fs from 'fs';
import path from 'path';
import { VAULT_DIR, renderMd, fm } from './vault.js';
import { loadPack, clearPackCache } from './pack.js';
import { getStreet, refreshStreet } from './thinStreet.js';
import {
  getWorkingModel,
  refreshWorkingModel,
  armWorkingModelPrint,
  lockWorkingModelPrint,
} from './thinWorkingModel.js';
import {
  listResearchRuns,
  getResearchRun,
  startResearchRun,
  publishResearchRun,
  cancelResearchRun,
  heartbeatResearchRun,
  retryResearchRun,
  acquireResearchSource,
} from './thinResearchRuns.js';
import { liveUsEquity } from './quotes.js';
import { readHouseMarkdown, saveHouseMarkdown } from './thinHouseSave.js';
import { buildHouseAssistContext } from './assistContext.js';
import {
  proposeHouse,
  proposeHouseFromCurrent,
  listHouseProposals,
  getHouseProposal,
  acceptHouseProposal,
  rejectHouseProposal,
} from './houseProposals.js';
import {
  proposeRiskStatus,
  proposeAddRisk,
  proposeRiskTripwires,
  listRiskProposals,
  getRiskProposal,
  acceptRiskProposal,
  rejectRiskProposal,
  readSorStatusMap,
  resolveDisplayStatus,
  getSorRiskSnapshot,
} from './riskProposals.js';
import { resolveOntRoot } from './monorepoPaths.js';
import { tryGetThinDeskBundle } from './thinDeskProfiles.js';
import { readCatalogSource } from './sourceRead.js';

// Prefer ONTOLOGY_ROOT → monorepo ontology/ → legacy ~/Trading/ontology
const ONT_ROOT = resolveOntRoot();

/**
 * @typedef {object} ThinModelProfile
 * @property {string} ticker
 * @property {string} slug          API slug (nbis | msft)
 * @property {string} deskId        desk field (nebius | microsoft)
 * @property {string} displayName
 * @property {string} houseFile     vault filename e.g. house-view-nebius.md
 * @property {string} entitySlug    wiki/entities/<slug>.md
 * @property {string} rawDir        relative under vault e.g. raw/nebius-research
 * @property {string} risksSource   relative SoR md
 * @property {string} risksGenerated relative generated risks dir
 * @property {RegExp} sourcePrimaryRe
 * @property {boolean} [stanceExtended] MSFT-style stance extract
 * @property {string} [neverGeneratedNote] desk-specific never-list line
 * @property {string} [houseTitleDefault]
 */

function slimRisk(r) {
  return {
    id: r.id,
    name: r.name,
    status: r.status || '—',
    grade: r.grade || '—',
    summary: r.summary || '',
    houseview_trigger: !!r.houseview_trigger,
    series: Array.isArray(r.series) ? r.series : [],
    updated: r.updated || null,
    order: Number.isFinite(r.order) ? r.order : 99,
    tripwire_count: Array.isArray(r.tripwires) ? r.tripwires.length : 0,
  };
}

/**
 * Overview / book strip stance one-liner from house_prior.view_excerpt.
 * Must not stop at "." (breaks "U.S.", "800G", etc.). Nested **Stance:** **body** is common.
 */
function stanceLine(housePrior, extended) {
  if (!housePrior) return null;
  const ex = String(housePrior.view_excerpt || '');
  const clean = (s) => String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  // Full line after Stance: (prefer — do not use [^\n.]+ which truncates at U.S.)
  let m = ex.match(/\*\*Stance:\*\*\s*(.+?)(?=\s*(?:Not a rating|###|\n\n|$))/is)
    || ex.match(/\*\*Stance:\s*(.+?)\*\*(?=\s*(?:Not a rating|###|\n\n|$))/is)
    || ex.match(/(?:^|\n)\s*\*\*Stance[^:]*:\*\*\s*(.+?)(?=\n\n|\n###|$)/is)
    || ex.match(/(?:^|\n)\s*Stance:\s*(.+?)(?=\n\n|\n###|$)/im);

  if (!m && extended) {
    m = ex.match(/I am \*\*very bullish\*\*[^.]*\./i)
      || ex.match(/very bullish on[^.]{0,200}/i);
    if (m) return clean(m[0]).slice(0, 480);
  }

  if (m) {
    const body = clean(m[1] != null ? m[1] : m[0]);
    if (body) return body.slice(0, 480);
  }
  // Fallback: first long bold sentence in excerpt after "Stance"
  const idx = ex.search(/Stance/i);
  if (idx >= 0) {
    const tail = ex.slice(idx).replace(/^Stance:?\*?\*?\s*/i, '');
    const line = clean(tail.split(/\n/)[0] || '');
    if (line.length > 40) return line.slice(0, 480);
  }
  return housePrior.play || null;
}

/**
 * @param {ThinModelProfile} profile
 */
export function createThinModel(profile) {
  const TICKER = String(profile.ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const deskId = profile.deskId;
  const slug = profile.slug;
  const displayName = profile.displayName || TICKER;
  const houseFile = profile.houseFile;
  const entitySlug = profile.entitySlug;
  const rawDirRel = profile.rawDir;
  const risksSourceRel = profile.risksSource;
  const risksGenRel = profile.risksGenerated;
  const sourcePrimaryRe = profile.sourcePrimaryRe || /./;
  const stanceExtended = !!profile.stanceExtended;
  const houseTitleDefault = profile.houseTitleDefault
    || `House View — ${displayName} (${TICKER})`;
  const neverGen = profile.neverGeneratedNote
    || `Edit generated risks under ${risksGenRel} as SoR (edit 08-risks-catalysts.md)`;

  let _quoteCache = { at: 0, data: null };

  function unavailable(reason) {
    return { available: false, desk: deskId, ticker: TICKER, reason: reason || 'pack unavailable' };
  }

  function thinDeskContract() {
    return {
      version: '1.1',
      desk: deskId,
      ticker: TICKER,
      parity_group: 'thin_ontology_v1',
      rooms: ['overview', 'risks', 'house', 'sources', 'street', 'model', 'research', 'ask', 'update'],
      capabilities: {
        compile_book: true,
        refresh_book: true,
        pack_ask: true,
        write_path: true,
        write_path_mode: 'meta_only',
        house_save: true,
        agent_context: true,
        house_proposals: true,
        street: true,
        street_refresh: true,
        working_model: true,
        working_model_refresh: true,
        research_runs: true,
        research_start: true,
        research_cancel: true,
        research_heartbeat: true,
        research_retry: true,
        research_acquire: true,
      },
      compile: {
        method: 'POST',
        path: `/api/${slug}/compile`,
        equivalent_cli: `./ont compile ${TICKER}`,
      },
      refresh: {
        method: 'POST',
        path: `/api/${slug}/book/refresh`,
      },
      house_save: {
        method: 'POST',
        path: `/api/${slug}/house/save`,
        body: { markdown: 'string — full house-view file including frontmatter' },
        house_file: houseFile,
        note: 'Explicit human Save only. Never auto-CONFIRM.',
      },
      agent_context: {
        method: 'GET',
        path: `/api/${slug}/house/assist-context`,
        note: 'Grounded pack for MCP hosts — primary Grok Build; Claude Code optional later',
        primary_host: 'grok_build',
      },
      house_proposals: {
        list: `GET /api/${slug}/house/proposals`,
        accept: `POST /api/${slug}/house/proposals/:id/accept`,
        reject: `POST /api/${slug}/house/proposals/:id/reject`,
        mcp_propose: 'propose_house_view (MCP) — stores draft only; glass ACCEPT writes house',
        note: 'Agent proposes; human ACCEPT on glass. Never silent house write.',
      },
      contract_doc: 'plans/THIN-DESK-CONTRACT.md',
      parity_doc: 'plans/THIN-DESK-UI-PARITY.md',
    };
  }

  function meta() {
    const { available, pack, path: packPath, reason, mtimeMs } = loadPack(TICKER);
    if (!available) {
      return {
        available: false,
        desk: deskId,
        ticker: TICKER,
        pack_exists: false,
        pack_path: packPath,
        reason,
        compiled_at: null,
        name: displayName,
        thin_desk_contract: thinDeskContract(),
      };
    }
    const obj = pack.object || {};
    return {
      available: true,
      desk: deskId,
      ticker: obj.ticker || TICKER,
      name: obj.name || displayName,
      pack_exists: true,
      pack_path: packPath,
      pack_mtime_ms: mtimeMs || null,
      compiled_at: pack.compiled_at || null,
      schema_version: pack.schema_version || null,
      focus: pack.focus || null,
      thin_desk_contract: thinDeskContract(),
    };
  }

  function book(opts = {}) {
    const { available, pack, path: packPath, reason, mtimeMs } = loadPack(TICKER, opts);
    if (!available || !pack) {
      return {
        available: false,
        desk: deskId,
        ticker: TICKER,
        pack_exists: false,
        pack_path: packPath,
        reason: reason || 'pack unavailable',
        compiled_at: null,
        house: null,
        risks: { count: 0, watch: 0, fired: 0, watch_names: [], fired_names: [] },
        claims_count: 0,
        sources_count: 0,
        ops_hint: `cd ${ONT_ROOT} && ./ont compile ${TICKER}`,
      };
    }
    const hp = pack.house_prior || {};
    const risks = pack.risks || [];
    // SoR-aware watch/fired counts (match risks list + overview ON WATCH)
    const sorMap = sorStatusMapSafe();
    const watchNames = [];
    const firedNames = [];
    for (const r of risks) {
      const disp = resolveDisplayStatus(r.status, r.name, sorMap);
      if (disp.status === 'WATCH') watchNames.push(r.name);
      else if (disp.status === 'FIRED') firedNames.push(r.name);
    }
    return {
      available: true,
      desk: deskId,
      ticker: (pack.object || {}).ticker || TICKER,
      name: (pack.object || {}).name || displayName,
      pack_exists: true,
      pack_path: packPath,
      pack_mtime_ms: mtimeMs || null,
      compiled_at: pack.compiled_at || null,
      house: {
        play: hp.play || null,
        status: hp.status || null,
        date: hp.date || null,
        stance_line: stanceLine(hp, stanceExtended),
      },
      risks: {
        count: risks.length,
        watch: watchNames.length,
        fired: firedNames.length,
        watch_names: watchNames,
        fired_names: firedNames,
      },
      claims_count: (pack.claims || []).length,
      sources_count: (pack.sources || []).length,
      ops_hint: `After research: COMPILE BOOK on glass (or ./ont compile ${TICKER}), then confirm as-of`,
      refreshed_at: opts.force ? new Date().toISOString() : null,
    };
  }

  function refreshBook() {
    clearPackCache(TICKER);
    const b = book({ force: true });
    return {
      ...b,
      refreshed: true,
      refreshed_at: new Date().toISOString(),
      note: b.available
        ? 'Pack re-read from disk. Use COMPILE BOOK if research files changed.'
        : (b.reason || 'pack still unavailable after refresh'),
    };
  }

  function overview() {
    const { available, pack, path: packPath, reason } = loadPack(TICKER, { force: true });
    if (!available) return { ...unavailable(reason), pack_path: packPath };

    const obj = pack.object || {};
    const hp = pack.house_prior || {};
    const claims = Array.isArray(pack.claims) ? pack.claims : [];
    const ranked = [...claims].sort((a, b) => {
      const ga = a.grade === 'A' ? 0 : a.grade === 'B' ? 1 : 2;
      const gb = b.grade === 'A' ? 0 : b.grade === 'B' ? 1 : 2;
      if (ga !== gb) return ga - gb;
      return String(b.as_of || '').localeCompare(String(a.as_of || ''));
    }).slice(0, 8);

    // SoR-aware statuses (same as risks list) so ON WATCH matches register after ACCEPT
    const sorMap = sorStatusMapSafe();
    const risks = Array.isArray(pack.risks) ? pack.risks : [];
    const displayRisks = risks.map((r) => {
      const disp = resolveDisplayStatus(r.status, r.name, sorMap);
      return {
        id: r.id,
        name: r.name,
        status: disp.status,
        grade: r.grade,
        status_source: disp.status_source,
      };
    });
    const watchRows = displayRisks
      .filter((r) => r.status === 'WATCH')
      .map((r) => ({ id: r.id, name: r.name, status: r.status, grade: r.grade }));
    const firedRows = displayRisks
      .filter((r) => r.status === 'FIRED')
      .map((r) => ({ id: r.id, name: r.name, status: r.status, grade: r.grade }));
    const sorLag = displayRisks.some((r) => r.status_source === 'sor');

    const series = Array.isArray(pack.series_snapshot) ? pack.series_snapshot : [];
    const gaps = Array.isArray(pack.gaps) ? pack.gaps : [];

    return {
      available: true,
      desk: deskId,
      ticker: obj.ticker || TICKER,
      name: obj.name || displayName,
      aliases: obj.aliases || [],
      compiled_at: pack.compiled_at || null,
      pack_path: packPath,
      summary: obj.summary || '',
      house: {
        play: hp.play || null,
        status: hp.status || null,
        date: hp.date || null,
        stance_line: stanceLine(hp, stanceExtended),
      },
      risk_summary: {
        count: risks.length,
        watch: watchRows,
        fired: firedRows,
      },
      sor_ahead_of_pack: sorLag,
      claims: ranked.map((c) => ({
        id: c.id,
        text: c.text,
        as_of: c.as_of || null,
        grade: c.grade || null,
        source_id: c.source_id || null,
      })),
      gaps,
      series_note: series.length
        ? null
        : 'No live series wired — Phase 1 is pack-only (no charts).',
      series_count: series.length,
    };
  }

  function sorStatusMapSafe() {
    try {
      return readSorStatusMap(risksSourceRel);
    } catch {
      return null;
    }
  }

  function risks() {
    const { available, pack, path: packPath, reason } = loadPack(TICKER, { force: true });
    if (!available) return { ...unavailable(reason), pack_path: packPath, risks: [], risk_summary: null };

    const sorMap = sorStatusMapSafe();
    const list = (Array.isArray(pack.risks) ? pack.risks : [])
      .map((raw) => {
        const s = slimRisk(raw);
        const disp = resolveDisplayStatus(s.status, s.name, sorMap);
        let tripwire_count = s.tripwire_count;
        // If pack has 0 tripwires, try SoR count so register "Trips" column isn't falsely empty
        if (!tripwire_count) {
          try {
            const snap = getSorRiskSnapshot(risksSourceRel, { riskId: s.id, riskName: s.name });
            if (snap.tripwire_count > 0) tripwire_count = snap.tripwire_count;
          } catch { /* ignore */ }
        }
        return {
          ...s,
          status: disp.status,
          status_source: disp.status_source,
          pack_status: disp.pack_status || s.status,
          tripwire_count,
        };
      })
      .sort((a, b) => a.order - b.order || a.name.localeCompare(b.name));

    // Rebuild watch/fired counts from display status (SoR-aware)
    const watchNames = list.filter((r) => r.status === 'WATCH').map((r) => r.name);
    const firedNames = list.filter((r) => r.status === 'FIRED').map((r) => r.name);
    const rs = pack.risk_summary || {};
    const sorLag = list.some((r) => r.status_source === 'sor');

    return {
      available: true,
      desk: deskId,
      ticker: TICKER,
      compiled_at: pack.compiled_at || null,
      pack_path: packPath,
      risks: list,
      risk_summary: {
        count: rs.count ?? list.length,
        watch: watchNames,
        fired: firedNames,
        // pack-native lists kept for debug when lagging
        pack_watch: rs.watch || [],
        pack_fired: rs.fired || [],
      },
      sor_ahead_of_pack: sorLag,
      note: sorLag
        ? 'SoR status ahead of pack — COMPILE BOOK to sync ontology store (glass already shows SoR).'
        : undefined,
    };
  }

  function riskDetail(id) {
    const { available, pack, path: packPath } = loadPack(TICKER, { force: true });
    if (!available) return null;
    const list = Array.isArray(pack.risks) ? pack.risks : [];
    const r = list.find((x) => x.id === id);
    if (!r) return null;
    const sorMap = sorStatusMapSafe();
    const disp = resolveDisplayStatus(r.status, r.name, sorMap);

    let packTw = (Array.isArray(r.tripwires) ? r.tripwires : []).map((t) => ({
      signal: t.signal || '',
      tripwire: t.tripwire || '',
      state: t.state || '',
      as_of: t.as_of || null,
    }));
    let tripwires = packTw;
    let tripwire_source = 'pack';
    // Prefer SoR tripwires when pack empty or count lags (same class of bug as status lag)
    try {
      const snap = getSorRiskSnapshot(risksSourceRel, {
        riskId: r.id,
        riskName: r.name,
      });
      const sorTw = Array.isArray(snap.tripwires) ? snap.tripwires : [];
      if (sorTw.length > 0 && (packTw.length === 0 || sorTw.length !== packTw.length)) {
        tripwires = sorTw.map((t) => ({
          signal: t.signal || '',
          tripwire: t.tripwire || '',
          state: t.state || '',
          as_of: t.as_of || null,
        }));
        tripwire_source = packTw.length === 0 ? 'sor' : 'sor';
      }
    } catch { /* no SoR section yet */ }

    const notes = [];
    if (disp.status_source === 'sor') {
      notes.push('Showing SoR status (pack lags). COMPILE BOOK to update ontology store.');
    }
    if (tripwire_source === 'sor') {
      notes.push('Showing SoR tripwires (pack lags or empty). COMPILE BOOK to sync monitors.');
    }

    return {
      available: true,
      desk: deskId,
      ticker: TICKER,
      compiled_at: pack.compiled_at || null,
      pack_path: packPath,
      id: r.id,
      name: r.name,
      status: disp.status,
      status_source: disp.status_source,
      pack_status: disp.pack_status || r.status || null,
      grade: r.grade || '—',
      summary: r.summary || '',
      houseview_trigger: !!r.houseview_trigger,
      series: Array.isArray(r.series) ? r.series : [],
      updated: r.updated || null,
      order: r.order,
      tripwires,
      tripwire_source,
      pack_tripwire_count: packTw.length,
      note: notes.length ? notes.join(' ') : undefined,
    };
  }

  function house() {
    const { available, pack, path: packPath, reason } = loadPack(TICKER);
    let vaultRaw = null;
    let vaultPath = path.join(VAULT_DIR, houseFile);
    try {
      const raw = readHouseMarkdown(houseFile);
      vaultPath = raw.path;
      vaultRaw = raw.markdown;
    } catch {
      try {
        if (fs.existsSync(vaultPath)) vaultRaw = fs.readFileSync(vaultPath, 'utf8');
      } catch { /* ignore */ }
    }

    const editable = {
      editable: true,
      house_file: houseFile,
      save_path: `/api/${slug}/house/save`,
      note: 'Explicit SAVE writes vault house only. COMPILE BOOK after save for pack house_prior.',
    };

    if (vaultRaw) {
      const { meta, body } = fm.parseFrontmatter(vaultRaw);
      const titleM = body.match(/^#\s+(.+)$/m);
      const statusFromMeta = meta.status || null;
      const confM = body.match(/\*\*CONFIRMED\s+(\d{4}-\d{2}-\d{2})\*\*/i)
        || body.match(/CONFIRMED\s+(\d{4}-\d{2}-\d{2})/i);
      const status = /CONFIRMED/i.test(String(statusFromMeta || body.slice(0, 200)))
        ? 'CONFIRMED'
        : (available && pack?.house_prior?.status) || '—';
      const date = confM ? confM[1]
        : (meta.updated || (available && pack?.house_prior?.date) || null);

      return {
        available: true,
        desk: deskId,
        ticker: TICKER,
        source: 'vault',
        vault_path: vaultPath,
        pack_path: packPath,
        compiled_at: available ? (pack.compiled_at || null) : null,
        pack_available: available,
        pack_reason: available ? undefined : reason,
        markdown: vaultRaw,
        ...editable,
        hero: {
          title: titleM ? titleM[1].replace(/\*\*/g, '').trim() : houseTitleDefault,
          status,
          date,
          html: renderMd(body),
        },
      };
    }

    if (!available) {
      return {
        ...unavailable(reason || `no vault ${houseFile} and no pack`),
        source: null,
        pack_path: packPath,
        vault_path: vaultPath,
        hero: null,
        markdown: null,
        ...editable,
      };
    }

    const hp = pack.house_prior || {};
    const excerpt = hp.view_excerpt || '';
    return {
      available: true,
      desk: deskId,
      ticker: TICKER,
      source: 'pack_excerpt',
      source_banner: `Pack excerpt — vault ${houseFile} missing; SAVE creates/writes vault file. COMPILE BOOK after.`,
      pack_path: packPath,
      compiled_at: pack.compiled_at || null,
      pack_available: true,
      markdown: null,
      ...editable,
      hero: {
        title: hp.play || `${displayName} house view`,
        status: hp.status || '—',
        date: hp.date || null,
        html: excerpt ? renderMd(excerpt) : '<p class="dimmer">No house prior excerpt in pack.</p>',
      },
    };
  }

  /** Explicit human house save — allowlisted house_file only. */
  function saveHouse(body) {
    try {
      const written = saveHouseMarkdown(houseFile, body && body.markdown);
      const h = house();
      return {
        ok: true,
        available: true,
        desk: deskId,
        ticker: TICKER,
        house_file: written.house_file,
        vault_path: written.path,
        bytes: written.bytes,
        saved_at: written.saved_at,
        created: written.created,
        decision_support_only: true,
        note: 'House file written. Pack house_prior updates only after COMPILE BOOK + REFRESH.',
        next_steps: [
          `POST /api/${slug}/compile (COMPILE BOOK)`,
          `POST /api/${slug}/book/refresh (REFRESH)`,
        ],
        house: h,
      };
    } catch (e) {
      return {
        ok: false,
        available: false,
        desk: deskId,
        ticker: TICKER,
        house_file: houseFile,
        error: e.message || String(e),
      };
    }
  }

  /** Grounded context for MCP / external agent hosts (no model call). */
  function houseAssistContext(opts = {}) {
    return buildHouseAssistContext({
      ticker: TICKER,
      slug,
      deskId,
      displayName,
      houseFile,
      userGoal: opts.goal || opts.q || '',
    });
  }

  function houseProposalsList(opts = {}) {
    try {
      return {
        ...listHouseProposals(slug, {
          status: opts.status,
          includeMarkdown: opts.includeMarkdown === true || opts.full === true,
        }),
        desk: deskId,
        ticker: TICKER,
        decision_support_only: true,
      };
    } catch (e) {
      return { available: false, ok: false, error: e.message || String(e), desk: deskId, ticker: TICKER };
    }
  }

  function houseProposalGet(id) {
    try {
      const out = getHouseProposal(slug, id, { includeMarkdown: true });
      if (!out) return null;
      return { ...out, desk: deskId, ticker: TICKER, decision_support_only: true };
    } catch (e) {
      return { available: false, ok: false, error: e.message || String(e) };
    }
  }

  /** MCP / API: store draft only — does not write house file. */
  function housePropose(body = {}) {
    try {
      // Efficient path: replacements on current vault house
      if (Array.isArray(body.replacements) && body.replacements.length) {
        return proposeHouseFromCurrent({
          slug,
          ticker: TICKER,
          houseFile,
          replacements: body.replacements,
          rationale: body.rationale,
          summary: body.summary,
          source: body.source || 'agent',
        });
      }
      return proposeHouse({
        slug,
        ticker: TICKER,
        houseFile,
        markdown: body.markdown,
        rationale: body.rationale,
        summary: body.summary,
        source: body.source || 'agent',
      });
    } catch (e) {
      return {
        ok: false,
        available: false,
        error: e.message || String(e),
        desk: deskId,
        ticker: TICKER,
      };
    }
  }

  /** Human ACCEPT on glass — allowlisted house write. */
  function houseProposalAccept(id) {
    try {
      const out = acceptHouseProposal(slug, id, { houseFile });
      const h = house();
      return { ...out, house: h, desk: deskId, ticker: TICKER };
    } catch (e) {
      return {
        ok: false,
        available: false,
        error: e.message || String(e),
        desk: deskId,
        ticker: TICKER,
      };
    }
  }

  function houseProposalReject(id) {
    try {
      return { ...rejectHouseProposal(slug, id), desk: deskId, ticker: TICKER };
    } catch (e) {
      return {
        ok: false,
        available: false,
        error: e.message || String(e),
        desk: deskId,
        ticker: TICKER,
      };
    }
  }

  /** Risk register proposals — SoR write only on accept (see plans/WRITE-PATH-RISKS.md). */
  function riskProposalsList(opts = {}) {
    try {
      return {
        ...listRiskProposals(slug, { status: opts.status }),
        desk: deskId,
        ticker: TICKER,
        risks_source: risksSourceRel,
      };
    } catch (e) {
      return { available: false, ok: false, error: e.message || String(e), desk: deskId, ticker: TICKER };
    }
  }

  function riskProposalGet(id) {
    try {
      const p = getRiskProposal(slug, id);
      if (!p) return null;
      return { ...p, desk: deskId, ticker: TICKER, decision_support_only: true };
    } catch (e) {
      return { available: false, ok: false, error: e.message || String(e) };
    }
  }

  function riskPropose(body = {}) {
    try {
      const kind = String(body.kind || 'status_change');
      if (kind === 'add_risk') {
        return {
          ...proposeAddRisk({
            slug,
            ticker: TICKER,
            risksSourceRel,
            body: { ...body, source: body.source || 'glass' },
          }),
          desk: deskId,
          ticker: TICKER,
        };
      }
      if (kind === 'set_tripwires') {
        return {
          ...proposeRiskTripwires({
            slug,
            ticker: TICKER,
            risksSourceRel,
            body: { ...body, source: body.source || 'glass' },
          }),
          desk: deskId,
          ticker: TICKER,
        };
      }
      if (kind !== 'status_change') {
        throw new Error('kind must be status_change | add_risk | set_tripwires');
      }
      return {
        ...proposeRiskStatus({
          slug,
          ticker: TICKER,
          risksSourceRel,
          body: { ...body, source: body.source || 'glass' },
        }),
        desk: deskId,
        ticker: TICKER,
      };
    } catch (e) {
      return {
        ok: false,
        available: false,
        error: e.message || String(e),
        desk: deskId,
        ticker: TICKER,
      };
    }
  }

  function riskProposalAccept(id) {
    try {
      return {
        ...acceptRiskProposal({ slug, id, risksSourceRel }),
        desk: deskId,
        ticker: TICKER,
      };
    } catch (e) {
      return {
        ok: false,
        available: false,
        error: e.message || String(e),
        desk: deskId,
        ticker: TICKER,
      };
    }
  }

  function riskProposalReject(id) {
    try {
      return { ...rejectRiskProposal(slug, id), desk: deskId, ticker: TICKER };
    } catch (e) {
      return {
        ok: false,
        available: false,
        error: e.message || String(e),
        desk: deskId,
        ticker: TICKER,
      };
    }
  }

  async function quote() {
    const now = Date.now();
    if (_quoteCache.data && now - _quoteCache.at < 60_000) {
      return { available: true, ticker: TICKER, quote: _quoteCache.data, cached: true };
    }
    const q = await liveUsEquity(TICKER, 'stocks');
    _quoteCache = { at: now, data: q };
    return {
      available: true,
      ticker: TICKER,
      quote: q,
      cached: false,
      note: q ? null : 'No live quote resolved (Nasdaq/Yahoo). Not fabricated.',
    };
  }

  function sources() {
    const { available, pack, path: packPath, reason } = loadPack(TICKER);
    if (!available) {
      return { ...unavailable(reason), pack_path: packPath, sources: [], provenance: null };
    }

    const raw = Array.isArray(pack.sources) ? pack.sources : [];
    const isPrimary = (s) => {
      const about = (s.about || []).map((a) => String(a).toLowerCase());
      const id = String(s.id || '').toLowerCase();
      const title = String(s.title || '').toLowerCase();
      const pathStr = String(s.path || '').toLowerCase();
      // Agent/session notes are secondary (chat → optional vault save)
      if (
        id.startsWith('agent-research')
        || id.startsWith('coverage-')
        || id.startsWith('comps-')
        || id.startsWith('model-bridge-')
        || id.startsWith('model-audit-')
        || id.startsWith('ebitda-bridge-')
        || id.startsWith('ebitda-quality-')
        || pathStr.includes('agent-research-')
        || pathStr.includes('/coverage-')
        || pathStr.includes('/comps-')
        || pathStr.includes('/model-bridge-')
        || pathStr.includes('/model-audit-')
        || pathStr.includes('/ebitda-bridge-')
        || pathStr.includes('/ebitda-quality-')
      ) return false;
      const blob = `${about.join(' ')} ${id} ${title} ${pathStr}`;
      return sourcePrimaryRe.test(blob);
    };

    const slim = (s, primary) => ({
      id: s.id,
      kind: s.kind || s.type || null,
      title: s.title || s.id,
      path: s.path || null,
      n_lines: s.n_lines ?? null,
      primary,
      outline_preview: Array.isArray(s.outline_preview) ? s.outline_preview.slice(0, 4) : [],
    });

    const primary = raw.filter(isPrimary).map((s) => slim(s, true));
    const other = raw.filter((s) => !isPrimary(s)).map((s) => slim(s, false));
    const otherCap = other.slice(0, 12);

    return {
      available: true,
      desk: deskId,
      ticker: TICKER,
      compiled_at: pack.compiled_at || null,
      pack_path: packPath,
      provenance: pack.provenance || null,
      counts: {
        total: raw.length,
        primary: primary.length,
        other_shown: otherCap.length,
        other_total: other.length,
      },
      sources: [...primary, ...otherCap],
      note: other.length > otherCap.length
        ? `${other.length - otherCap.length} non-primary catalog rows omitted for scan — pack has ${raw.length} total.`
        : null,
    };
  }

  function sourceGet(id) {
    const { available, pack, reason } = loadPack(TICKER);
    if (!available) {
      return { available: false, id: String(id || ''), reason: reason || 'pack unavailable', markdown: null, html: null };
    }
    return readCatalogSource({
      pack,
      id,
      houseFile,
      entitySlug,
      ticker: TICKER,
    });
  }

  function writeMeta() {
    const entity = path.join(VAULT_DIR, 'wiki', 'entities', `${entitySlug}.md`);
    const risksSource = path.join(VAULT_DIR, risksSourceRel);
    const house = path.join(VAULT_DIR, houseFile);
    const rawDir = path.join(VAULT_DIR, rawDirRel);
    const risksGen = path.join(VAULT_DIR, risksGenRel);
    const log = path.join(VAULT_DIR, 'wiki', 'log.md');
    const packConfig = path.join(ONT_ROOT, 'packs', `${TICKER}.json`);
    const packStore = path.join(ONT_ROOT, 'store', 'by_ticker', `${TICKER}.json`);

    const exists = (p) => {
      try { return fs.existsSync(p); } catch { return false; }
    };

    return {
      available: true,
      desk: deskId,
      ticker: TICKER,
      decision_support_only: true,
      claim_format: '- <claim text> (YYYY-MM-DD) [A|B|C] [[source-slug]]',
      claim_example: '- Probe fact for write-path drill (2026-07-20) [C] [[phase5-probe]]',
      claim_section: '## Key facts (timestamped · graded · sourced)  — compile only parses bullets under this heading',
      paths: {
        entity: { path: entity, exists: exists(entity), role: 'Graded claims / entity facts' },
        risks_source: {
          path: risksSource,
          exists: exists(risksSource),
          role: `Edit risks here (SoR). Compile regenerates ${risksGenRel}/`,
        },
        risks_generated: {
          path: risksGen,
          exists: exists(risksGen),
          role: 'Generated — do not hand-edit as source of truth',
        },
        house: {
          path: house,
          exists: exists(house),
          role: 'USER-OWNED — write only on explicit confirm/save',
        },
        raw_research: { path: rawDir, exists: exists(rawDir), role: 'Long research / masters' },
        log: { path: log, exists: exists(log), role: 'One-line note on material ingest' },
        pack_config: { path: packConfig, exists: exists(packConfig), role: 'Pack globs (rare edits)' },
        pack_store: {
          path: packStore,
          exists: exists(packStore),
          role: 'Compile OUTPUT only — never hand-edit',
        },
      },
      never: [
        'Hand-edit ontology/store/by_ticker/*.json',
        'Save research to Desktop/Downloads',
        'Chat-only (no file) — will not appear on glass',
        'Auto-confirm house view without Anthony saying save/confirm',
        neverGen,
      ],
      commands: {
        compile: `cd ${ONT_ROOT} && ./ont compile ${TICKER}`,
        compile_glass: `POST /api/${slug}/compile or COMPILE BOOK button (preferred)`,
        ask_cli: `cd ${ONT_ROOT} && ./ont ask ${TICKER} "what's on watch"`,
        agent_cli: `cd ${ONT_ROOT} && ./ont agent ${TICKER} "<question>"`,
      },
      glass: {
        compile: `POST /api/${slug}/compile or COMPILE BOOK`,
        refresh: `POST /api/${slug}/book/refresh or REFRESH (re-read only)`,
        verify: [`#/${slug}/overview`, `#/${slug}/risks`, `#/${slug}/ask`, `#/${slug}/house`],
      },
      success_criteria: [
        { id: 'S1', text: 'Get a new fact or risk change from research' },
        { id: 'S2', text: 'Land it in the correct file with graded format' },
        { id: 'S3', text: `Run ./ont compile ${TICKER}` },
        { id: 'S4', text: 'Hit REFRESH BOOK on the glass' },
        { id: 'S5', text: 'See the change on Risks / Ask / Overview' },
        { id: 'S6', text: 'House view untouched unless you said confirm' },
      ],
    };
  }

  return {
    meta,
    book,
    refreshBook,
    overview,
    risks,
    riskDetail,
    house,
    saveHouse,
    houseAssistContext,
    houseProposalsList,
    houseProposalGet,
    housePropose,
    houseProposalAccept,
    houseProposalReject,
    riskProposalsList,
    riskProposalGet,
    riskPropose,
    riskProposalAccept,
    riskProposalReject,
    quote,
    sources,
    sourceGet,
    street: () => getStreet(TICKER, { desk: deskId }),
    streetRefresh: async (body = {}) => refreshStreet(TICKER, body || {}, { desk: deskId }),
    workingModel: () => getWorkingModel(TICKER, { desk: deskId }),
    workingModelRefresh: async (body = {}) => refreshWorkingModel(TICKER, body || {}, { desk: deskId }),
    workingModelArm: (body = {}) => armWorkingModelPrint(TICKER, body || {}, { desk: deskId }),
    workingModelLock: () => lockWorkingModelPrint(TICKER, { desk: deskId }),
    researchList: () => listResearchRuns(TICKER, { desk: deskId }),
    researchGet: (runId) => getResearchRun(TICKER, runId, { desk: deskId }),
    researchStart: (body = {}) => startResearchRun(TICKER, body || {}, { desk: deskId }),
    researchPublish: (runId, body = {}) => publishResearchRun(TICKER, runId, body || {}, { desk: deskId }),
    researchCancel: (runId, body = {}) => cancelResearchRun(TICKER, runId, { reason: (body && body.reason) || undefined }),
    researchHeartbeat: (runId) => heartbeatResearchRun(TICKER, runId),
    researchRetry: (runId, body = {}) => retryResearchRun(TICKER, runId, body || {}),
    researchAcquire: (runId, body = {}) => acquireResearchSource(TICKER, runId, body || {}),
    writeMeta,
  };
}

// Profiles live in config/thin-desks.json — re-export for legacy imports (null in empty kernel).
export const NBIS_MODEL_PROFILE = tryGetThinDeskBundle('nbis')?.model || null;
export const MSFT_MODEL_PROFILE = tryGetThinDeskBundle('msft')?.model || null;
