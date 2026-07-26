// thinHouseSave.js — Path 1.0 allowlisted house-view writes for thin desks.
// Writes ONLY vault-root house_file from desk profile. Never store/. Decision-support only.
import fs from 'fs';
import path from 'path';
import { VAULT_DIR, isInsideVault, canonicalize } from './vault.js';

export const HOUSE_MAX_BYTES = 400_000;
const HOUSE_NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]*\.md$/;

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
  return {
    ok: true,
    path: abs,
    house_file: name,
    bytes,
    saved_at: new Date().toISOString(),
    created,
  };
}
