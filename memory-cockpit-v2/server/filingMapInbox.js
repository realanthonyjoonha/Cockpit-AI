// filingMapInbox.js — deterministic jail for job filing_map (no Grok).
// Accessions come from the EDGAR compile-lane cache, not the pack.
// Decision-support only.
import fs from 'fs';
import path from 'path';
import { resolveVaultDir } from './monorepoPaths.js';
import { loadPack } from './pack.js';
import {
  compileLaneDir,
  normalizeFilings,
  lastPrintCatalog,
  filedSinceCompile,
  decorateFiling,
} from './secEdgar.js';

export const FILING_MAP_MATERIAL_CAP = 8;

function readJsonSafe(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

/** Sync read of cached EDGAR index / submissions. No network. */
export function loadCachedFilings(ticker) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id) return [];
  const lane = compileLaneDir(id);
  const index = readJsonSafe(path.join(lane, 'filings', 'index.json'));
  if (index && Array.isArray(index.filings) && index.filings.length) return index.filings;
  const sub = readJsonSafe(path.join(lane, 'submissions.json'));
  if (sub) return normalizeFilings(sub);
  return [];
}

/** Never String(object) — pack tripwires are often { monitor, label }. */
export function tripwireLabel(tw) {
  if (tw == null) return '';
  if (typeof tw === 'string') return tw.trim().slice(0, 200);
  if (typeof tw !== 'object') return '';
  const s = tw.label || tw.monitor || tw.text || tw.name || tw.title;
  return typeof s === 'string' ? s.trim().slice(0, 200) : '';
}

export function parseFlipTriggers(markdown) {
  const text = String(markdown || '');
  const idx = text.search(/what would change the view|flip[-\s]?triggers/i);
  if (idx < 0) return [];
  const rest = text.slice(idx);
  const nextH = rest.slice(1).search(/\n### /);
  const block = nextH >= 0 ? rest.slice(0, nextH + 1) : rest;
  const bullets = [];
  for (const line of block.split('\n')) {
    const m = line.match(/^\s*[-*]\s+(?:\*\*)?(.+)$/);
    if (!m) continue;
    const t = m[1].replace(/\*\*/g, '').trim().slice(0, 280);
    if (t) bullets.push(t);
    if (bullets.length >= 12) break;
  }
  return bullets;
}

export function inboxAccessions(inbox) {
  const ids = new Set();
  const printAcc = inbox?.last_print?.accession;
  if (printAcc) ids.add(String(printAcc));
  for (const f of inbox?.material_not_in_book || []) {
    if (f?.accession) ids.add(String(f.accession));
  }
  return ids;
}

/**
 * Pure builder. `filings` required. House/risks optional (copied, never rewritten).
 * @returns {{ ok: true, inbox: object } | { ok: false, error: string }}
 */
export function buildFilingMapInbox({
  ticker,
  desk = null,
  compiledAt = null,
  filings,
  house = null,
  risks = null,
  fetchedAt = null,
  cik = null,
  tier = null,
} = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!id) return { ok: false, error: 'empty ticker' };
  if (!Array.isArray(filings) || !filings.length) {
    return { ok: false, error: 'no SEC pipeline' };
  }

  const last_print = lastPrintCatalog(filings, compiledAt);
  const since = filedSinceCompile(filings, compiledAt);
  const material = (since.material_items || []).slice(0, FILING_MAP_MATERIAL_CAP).map(decorateFiling);
  const printAcc = last_print.accession || null;
  const material_not_in_book = printAcc
    ? material.filter((f) => f.accession !== printAcc)
    : material;

  const houseBlock = {
    status: house?.status || null,
    date: house?.date || null,
    stance_line: house?.stance_line ? String(house.stance_line).slice(0, 400) : null,
    flip_triggers: Array.isArray(house?.flip_triggers)
      ? house.flip_triggers.map((t) => String(t).slice(0, 280)).filter(Boolean).slice(0, 12)
      : parseFlipTriggers(house?.markdown || ''),
  };

  const riskRows = Array.isArray(risks) ? risks : [];
  const riskBlock = riskRows.slice(0, 40).map((r) => ({
    id: r.id || null,
    name: r.name || r.title || null,
    status: r.status || null,
    grade: r.grade || null,
    tripwires: Array.isArray(r.tripwires)
      ? r.tripwires.map((tw) => {
        const label = tripwireLabel(tw);
        return label ? { label } : null;
      }).filter(Boolean).slice(0, 8)
      : [],
  }));

  return {
    ok: true,
    inbox: {
      schema_version: 1,
      ticker: id,
      desk: desk || null,
      compiled_at: compiledAt || null,
      fetched_at: fetchedAt || null,
      cik: cik || null,
      tier: tier || null,
      last_print,
      material_not_in_book,
      house: houseBlock,
      risks: riskBlock,
      decision_support_only: true,
      note: 'Agent may only cite accessions in last_print or material_not_in_book.',
    },
  };
}

export function buildFilingMapInboxFromVault(ticker, opts = {}) {
  const id = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  const filings = Array.isArray(opts.filings) ? opts.filings : loadCachedFilings(id);
  if (!filings.length) {
    return { ok: false, error: 'no SEC pipeline' };
  }
  const packLoad = loadPack(id);
  const pack = packLoad.available ? packLoad.pack : null;
  const compiledAt = opts.compiledAt || pack?.compiled_at || null;
  let house = opts.house || null;
  if (!house) {
    const desk = opts.desk || id.toLowerCase();
    const houseFile = `house-view-${desk}.md`;
    const p = path.join(resolveVaultDir(), houseFile);
    try {
      if (fs.existsSync(p)) {
        const markdown = fs.readFileSync(p, 'utf8');
        const status = /CONFIRMED/i.test(markdown.slice(0, 400)) ? 'CONFIRMED' : null;
        const dateM = markdown.match(/CONFIRMED\s+(\d{4}-\d{2}-\d{2})/i);
        const stanceM = markdown.match(/\*\*Stance:\*\*\s+\*\*(.+?)\*\*/s);
        house = {
          status,
          date: dateM ? dateM[1] : null,
          stance_line: stanceM ? stanceM[1].replace(/\s+/g, ' ').trim().slice(0, 400) : null,
          markdown,
        };
      }
    } catch { /* empty house */ }
  }
  const risks = opts.risks || pack?.risks || [];
  return buildFilingMapInbox({
    ticker: id,
    desk: opts.desk || null,
    compiledAt,
    filings,
    house,
    risks,
    fetchedAt: new Date().toISOString(),
    cik: opts.cik || null,
    tier: pack?.tier || null,
  });
}

export function writeFilingMapInbox(runDir, inbox) {
  if (!runDir || !inbox) return null;
  fs.mkdirSync(runDir, { recursive: true });
  const p = path.join(runDir, 'inbox.json');
  fs.writeFileSync(p, `${JSON.stringify(inbox, null, 2)}\n`, 'utf8');
  return p;
}
