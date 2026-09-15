// filingMapSchema.js — publish jail for job filing_map.
// Decision-support only. Never pack SoR.
import fs from 'fs';
import path from 'path';
import { inboxAccessions } from './filingMapInbox.js';

function normalizeHaystack(s) {
  return String(s || '').toLowerCase().replace(/\s+/g, ' ').trim();
}

function excerptHitsDoc(excerpt, doc) {
  const e = normalizeHaystack(excerpt);
  if (e.length < 12) return false;
  return normalizeHaystack(doc).includes(e);
}

function str(v) {
  return v == null ? '' : String(v).trim();
}

export function readInbox(runDir) {
  if (!runDir) return null;
  try {
    return JSON.parse(fs.readFileSync(path.join(runDir, 'inbox.json'), 'utf8'));
  } catch {
    return null;
  }
}

function acquiredHaystack(acquiredDir) {
  if (!acquiredDir || !fs.existsSync(acquiredDir)) return '';
  let out = '';
  try {
    for (const name of fs.readdirSync(acquiredDir)) {
      if (name.startsWith('.')) continue;
      const p = path.join(acquiredDir, name);
      try {
        if (!fs.statSync(p).isFile()) continue;
        const buf = fs.readFileSync(p);
        if (buf.length > 2 * 1024 * 1024) continue;
        out += `\n${buf.toString('utf8')}`;
      } catch { /* */ }
    }
  } catch { /* */ }
  return out;
}

/**
 * @param {{ runDir?: string, rows?: unknown, acquiredDir?: string|null, promotion?: object }} opts
 * @returns {string[]}
 */
export function filingMapPublishViolations(opts = {}) {
  const errors = [];
  const inbox = readInbox(opts.runDir);
  if (!inbox) {
    errors.push('filing_map complete needs inbox.json (server jail)');
    return errors;
  }
  const allowed = inboxAccessions(inbox);
  const rows = Array.isArray(opts.rows) ? opts.rows : [];
  if (!rows.length) {
    errors.push('complete filing_map needs rows[] (one per mapped accession)');
  }
  const hay = acquiredHaystack(opts.acquiredDir);
  for (const row of rows) {
    const acc = str(row?.accession);
    if (!acc) {
      errors.push('filing_map row missing accession');
      continue;
    }
    if (!allowed.has(acc)) {
      errors.push(`filing_map row accession not in inbox: ${acc}`);
    }
    const excerpt = str(row?.what?.excerpt || row?.excerpt);
    if (excerpt && hay && !excerptHitsDoc(excerpt, hay)) {
      errors.push(`filing_map excerpt not in acquired/ for ${acc}`);
    }
  }
  if (opts.promotion && opts.promotion.pack_claims) {
    errors.push('filing_map is ops — never pack SoR');
  }
  return errors;
}
