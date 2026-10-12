// thinHouseSave.js — Path 1.0 allowlisted house-view writes for thin desks.
// Writes ONLY vault-root house_file from desk profile. Never store/. Decision-support only.
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { VAULT_DIR, isInsideVault, canonicalize } from './vault.js';

export const HOUSE_MAX_BYTES = 400_000;
/** Pack gap when the bytes no longer match the last saveHouseMarkdown hash. */
export const HOUSE_OUTSIDE_WRITE_GAP = 'house file changed outside saveHouseMarkdown';
const HOUSE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;
const HOUSE_LOG_NAME = 'house-write-log.jsonl';

function sha256(text) {
  return crypto.createHash('sha256').update(String(text), 'utf8').digest('hex');
}

function houseWriteLogPath(vaultRoot) {
  return path.join(vaultRoot, 'cockpit', HOUSE_LOG_NAME);
}

/**
 * Last authorized hash for this house file. Does not create a log.
 * No line for the file is "no audit yet", which is not a mismatch.
 * @param {string} vaultRoot
 * @param {string} houseFile
 * @param {string} markdown
 * @param {{ exists?: boolean }} [opts]
 */
export function readHouseWriteAudit(vaultRoot, houseFile, markdown, opts = {}) {
  const name = path.basename(String(houseFile || ''));
  const fp = houseWriteLogPath(vaultRoot);
  let last = null;
  if (fs.existsSync(fp)) {
    for (const line of fs.readFileSync(fp, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      let row;
      try { row = JSON.parse(line); } catch { continue; }
      if (row && row.house_file === name && typeof row.sha256 === 'string') last = row;
    }
  }
  if (!last) return { state: 'no_audit', mismatch: false, gap: null };
  const exists = opts.exists !== false;
  if (!exists || sha256(markdown) !== last.sha256) {
    return { state: 'mismatch', mismatch: true, gap: HOUSE_OUTSIDE_WRITE_GAP };
  }
  return { state: 'match', mismatch: false, gap: null };
}

/** Audit the allowlisted house. A missing log is not treated as authorized. */
export function auditAllowlistedHouse(houseFile) {
  const raw = readHouseMarkdown(houseFile);
  const vaultRoot = path.dirname(raw.path);
  return readHouseWriteAudit(vaultRoot, raw.house_file, raw.exists ? raw.markdown : '', {
    exists: raw.exists,
  });
}

function recordHouseWrite(vaultRoot, houseFile, markdown) {
  const name = assertHouseFileName(houseFile);
  const fp = houseWriteLogPath(vaultRoot);
  if (!isInsideVault(fp)) throw new Error('house write log outside vault');
  fs.mkdirSync(path.dirname(fp), { recursive: true });
  const line = JSON.stringify({
    house_file: name,
    sha256: sha256(markdown),
    at: new Date().toISOString(),
  });
  fs.appendFileSync(fp, `${line}\n`);
}

export function assertHouseFileName(houseFile) {
  const name = String(houseFile || '').trim();
  if (!HOUSE_NAME_RE.test(name)) {
    throw new Error('invalid house_file: must be a vault-root *.md basename');
  }
  if (name.includes('..') || name.includes('/') || name.includes('\\')) {
    throw new Error('house_file must not contain path separators');
  }
  return name;
}

export function resolveAllowlistedHousePath(houseFile) {
  const name = assertHouseFileName(houseFile);
  const vaultRoot = fs.existsSync(VAULT_DIR) ? fs.realpathSync(VAULT_DIR) : path.resolve(VAULT_DIR);
  const abs = path.resolve(path.join(vaultRoot, name));
  if (path.basename(abs) !== name) throw new Error('house_file basename mismatch');
  if (path.dirname(abs) !== vaultRoot) {
    throw new Error('house_file must live at vault root (allowlist)');
  }
  if (!isInsideVault(abs)) throw new Error('refusing write outside vault');
  try {
    const can = canonicalize(abs);
    if (can !== abs && path.dirname(can) !== vaultRoot && !can.startsWith(vaultRoot + path.sep)) {
      throw new Error('canonical path left vault');
    }
  } catch (e) {
    if (e.message === 'canonical path left vault') throw e;
  }
  return abs;
}

export function readHouseMarkdown(houseFile) {
  const name = assertHouseFileName(houseFile);
  const abs = resolveAllowlistedHousePath(name);
  if (!fs.existsSync(abs)) {
    return { exists: false, path: abs, house_file: name, markdown: null, bytes: 0 };
  }
  const markdown = fs.readFileSync(abs, 'utf8');
  return {
    exists: true,
    path: abs,
    house_file: name,
    markdown,
    bytes: Buffer.byteLength(markdown, 'utf8'),
  };
}

export function saveHouseMarkdown(houseFile, markdown) {
  if (typeof markdown !== 'string') {
    throw new Error('markdown must be a string (full file including frontmatter)');
  }
  const bytes = Buffer.byteLength(markdown, 'utf8');
  if (bytes === 0 || !markdown.trim()) throw new Error('markdown empty');
  if (bytes > HOUSE_MAX_BYTES) throw new Error(`markdown exceeds ${HOUSE_MAX_BYTES} bytes`);
  const name = assertHouseFileName(houseFile);
  const abs = resolveAllowlistedHousePath(name);
  const created = !fs.existsSync(abs);
  const tmp = `${abs}.tmp.${process.pid}.${Date.now()}`;
  fs.writeFileSync(tmp, markdown, 'utf8');
  try {
    fs.renameSync(tmp, abs);
  } catch (e) {
    try { fs.unlinkSync(tmp); } catch { /* ignore */ }
    throw e;
  }
  recordHouseWrite(path.dirname(abs), name, markdown);
  return {
    ok: true,
    path: abs,
    house_file: name,
    bytes,
    saved_at: new Date().toISOString(),
    created,
  };
}
