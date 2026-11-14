// deleteDesk.js — delete one desk's files, then drop its registry row.
// A failed check deletes nothing. Nothing is kept for restore.
// Decision-support only. Does not touch any other desk's files.
import fs from 'fs';
import path from 'path';
import { buildAllBundles, countLanes, locateInside, unownedCompanyFiles } from './deskBundle.js';

function fail(status, code, message) {
  const err = new Error(message);
  err.status = status;
  err.code = code;
  return err;
}

function writeTextAtomic(file, text) {
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, text);
  fs.renameSync(tmp, file);
}

function sleepMs(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms);
}

function withRegistryLock(registryPath, fn) {
  const lockPath = `${registryPath}.lock`;
  const started = Date.now();
  let fd;
  for (;;) {
    try {
      fd = fs.openSync(lockPath, 'wx');
      fs.writeSync(fd, String(process.pid));
      break;
    } catch (e) {
      if (e.code !== 'EEXIST') throw e;
      try {
        const age = Date.now() - fs.statSync(lockPath).mtimeMs;
        if (age > 60_000) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch { /* the other delete removed it */ }
      if (Date.now() - started > 8_000) {
        throw fail(409, 'desk_delete_busy', 'Another company removal is in progress.');
      }
      sleepMs(40);
    }
  }
  try {
    return fn();
  } finally {
    try { fs.closeSync(fd); } catch { /* already closed */ }
    try { fs.unlinkSync(lockPath); } catch { /* already gone */ }
  }
}

/**
 * Drop one desk object from registry text. Every other byte stays.
 * JSON.parse + stringify would rewrite escapes on the desks that remain.
 * @param {string} text
 * @param {string} slug
 */
export function removeDeskFromRegistryText(text, slug) {
  if (!/^[a-z0-9-]+$/.test(slug)) {
    throw fail(400, 'desk_delete_registry', 'slug is not a desk id');
  }
  const parsed = JSON.parse(text);
  const desks = Array.isArray(parsed.desks) ? parsed.desks : null;
  if (!desks || !desks.some((d) => d.slug === slug)) {
    throw fail(404, 'thin_desk_not_found', `Unknown thin desk "${slug}".`);
  }
  const keyAt = text.indexOf('"desks"');
  const arrayStart = keyAt >= 0 ? text.indexOf('[', keyAt) : -1;
  const span = arrayStart >= 0 ? findDeskSpan(text, arrayStart, slug) : null;
  if (!span) throw fail(500, 'desk_delete_registry', `could not locate ${slug} in the registry`);

  let cutStart = span.start;
  let cutEnd = span.end;
  let before = span.start - 1;
  while (before >= 0 && /[ \t\r\n]/.test(text[before])) before -= 1;
  if (text[before] === ',') {
    cutStart = before;
  } else {
    let after = span.end;
    while (after < text.length && /[ \t\r\n]/.test(text[after])) after += 1;
    if (text[after] === ',') cutEnd = after + 1;
  }
  const next = text.slice(0, cutStart) + text.slice(cutEnd);
  let again;
  try {
    again = JSON.parse(next);
  } catch (e) {
    throw fail(500, 'desk_delete_registry', `registry splice did not parse: ${e.message}`);
  }
  const expected = desks.filter((d) => d.slug !== slug);
  if (JSON.stringify(again.desks) !== JSON.stringify(expected)) {
    throw fail(500, 'desk_delete_registry', 'registry splice changed another desk');
  }
  const { desks: _drop, ...rest } = parsed;
  const { desks: _drop2, ...rest2 } = again;
  if (JSON.stringify(rest) !== JSON.stringify(rest2)) {
    throw fail(500, 'desk_delete_registry', 'registry splice changed the file outside desks');
  }
  return next;
}

function findDeskSpan(text, arrayStart, slug) {
  let depth = 0;
  let inStr = false;
  let esc = false;
  let objStart = -1;
  for (let i = arrayStart; i < text.length; i += 1) {
    const c = text[i];
    if (inStr) {
      if (esc) { esc = false; continue; }
      if (c === '\\') { esc = true; continue; }
      if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '{' || c === '[') {
      if (c === '{' && depth === 1) objStart = i;
      depth += 1;
      continue;
    }
    if (c === '}' || c === ']') {
      depth -= 1;
      if (c === '}' && depth === 1 && objStart >= 0) {
        try {
          const obj = JSON.parse(text.slice(objStart, i + 1));
          if (obj && obj.slug === slug) return { start: objStart, end: i + 1 };
        } catch { /* a non-desk object in the array */ }
        objStart = -1;
      }
      if (depth === 0) break;
    }
  }
  return null;
}

function assertNoSymlink(abs, rel) {
  const st = fs.lstatSync(abs);
  if (st.isSymbolicLink()) {
    throw fail(400, 'desk_bundle_refused', `${rel} is a symlink`);
  }
  if (!st.isDirectory()) return;
  for (const name of fs.readdirSync(abs)) {
    assertNoSymlink(path.join(abs, name), `${rel}/${name}`);
  }
}

function removeOwnedFiles(bundle, vaultRoot, ontRoot) {
  const existing = bundle.items.filter((item) => item.exists);
  for (const item of existing) {
    const root = item.root === 'kernel' ? ontRoot : vaultRoot;
    locateInside(root, item.abs);
    assertNoSymlink(item.abs, item.rel);
  }
  const deleted = [];
  const ordered = [...existing].sort((a, b) => b.rel.length - a.rel.length);
  for (const item of ordered) {
    if (!fs.existsSync(item.abs)) continue;
    const st = fs.lstatSync(item.abs);
    if (st.isSymbolicLink()) throw fail(400, 'desk_bundle_refused', `${item.rel} is a symlink`);
    fs.rmSync(item.abs, { recursive: true, force: false });
    deleted.push(item.rel);
  }
  return deleted;
}

function receiptFile(vaultRoot, slug) {
  return path.join(vaultRoot, 'cockpit', 'delete-receipts', `${slug}.json`);
}

function withUnowned(bundle, roots) {
  if (!bundle) return bundle;
  const stray = unownedCompanyFiles({
    slug: bundle.slug,
    ticker: bundle.ticker,
    items: bundle.items,
    ...roots,
  });
  if (!stray.length) return bundle;
  return {
    ...bundle,
    ok: false,
    errors: [
      ...(bundle.errors || []),
      ...stray.map((rel) => `left outside the bundle: ${rel}`),
    ],
  };
}

/**
 * @param {{ registryPath: string, slug: string, confirm: string, vaultRoot: string, ontRoot: string, storeDir: string, now?: Date, stopAfter?: 'receipt' | 'files' }} args
 */
export function deleteDeskBundle({
  registryPath, slug, confirm, vaultRoot, ontRoot, storeDir, now, stopAfter,
}) {
  return withRegistryLock(registryPath, () => {
    const text = fs.readFileSync(registryPath, 'utf8');
    const registry = JSON.parse(text);
    const desks = Array.isArray(registry?.desks) ? registry.desks : [];
    const desk = desks.find((d) => d.slug === slug);
    if (!desk) throw fail(404, 'thin_desk_not_found', `Unknown thin desk "${slug}".`);
    const ticker = String(desk.ticker || '').toUpperCase();
    const typed = String(confirm || '').trim().toUpperCase();
    if (typed !== ticker) {
      throw fail(400, 'desk_delete_confirm', `Type ${ticker} to remove this company.`);
    }

    const bundles = buildAllBundles({ desks, vaultRoot, ontRoot, storeDir });
    const bundle = withUnowned(bundles.find((b) => b.slug === slug), { vaultRoot, ontRoot, storeDir });
    if (!bundle || !bundle.ok) {
      throw fail(400, 'desk_bundle_refused', (bundle?.errors || ['bundle refused']).join('; '));
    }
    return deleteAndUnpublish({
      text, bundle, slug, ticker, registryPath, vaultRoot, ontRoot, now, stopAfter,
    });
  });
}

/**
 * Finish removals whose files were deleted and whose registry row is still published.
 * The receipt is the confirm. Nothing is restored.
 */
export function resumeUnfinishedDeletes({ registryPath, vaultRoot, ontRoot, storeDir }) {
  const dir = path.join(vaultRoot, 'cockpit', 'delete-receipts');
  if (!fs.existsSync(dir)) return [];
  const done = [];
  for (const name of fs.readdirSync(dir)) {
    if (!name.endsWith('.json')) continue;
    const file = path.join(dir, name);
    let receipt;
    try { receipt = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { continue; }
    if (!receipt || receipt.status !== 'deleting' || typeof receipt.slug !== 'string') continue;
    withRegistryLock(registryPath, () => {
      const text = fs.readFileSync(registryPath, 'utf8');
      const registry = JSON.parse(text);
      const desks = Array.isArray(registry?.desks) ? registry.desks : [];
      const desk = desks.find((d) => d.slug === receipt.slug);
      if (!desk) {
        fs.unlinkSync(file);
        return;
      }
      const bundles = buildAllBundles({ desks, vaultRoot, ontRoot, storeDir });
      const bundle = withUnowned(bundles.find((b) => b.slug === receipt.slug), { vaultRoot, ontRoot, storeDir });
      if (!bundle || !bundle.ok) {
        throw fail(400, 'desk_bundle_refused', (bundle?.errors || ['bundle refused']).join('; '));
      }
      removeOwnedFiles(bundle, vaultRoot, ontRoot);
      writeTextAtomic(registryPath, removeDeskFromRegistryText(text, receipt.slug));
      fs.unlinkSync(file);
    });
    done.push(receipt.slug);
  }
  return done;
}

function deleteAndUnpublish({
  text, bundle, slug, ticker, registryPath, vaultRoot, ontRoot, now, stopAfter,
}) {
  const when = now instanceof Date ? now : new Date();
  const planned = bundle.items.filter((item) => item.exists);
  const receipt = receiptFile(vaultRoot, slug);
  fs.mkdirSync(path.dirname(receipt), { recursive: true });
  writeTextAtomic(receipt, `${JSON.stringify({ status: 'deleting', slug, ticker, at: when.toISOString() })}\n`);
  if (stopAfter === 'receipt') {
    throw fail(500, 'desk_delete_stopped', 'stopped after the receipt');
  }
  const deleted = removeOwnedFiles(bundle, vaultRoot, ontRoot);
  if (stopAfter === 'files') {
    throw fail(500, 'desk_delete_stopped', 'stopped after the files');
  }
  writeTextAtomic(registryPath, removeDeskFromRegistryText(text, slug));
  fs.unlinkSync(receipt);

  const logPath = path.join(vaultRoot, 'cockpit', 'go-commit-log.jsonl');
  if (fs.existsSync(path.dirname(logPath))) {
    fs.appendFileSync(logPath, `${JSON.stringify({
      at: when.toISOString(),
      kind: 'desk_deleted',
      slug,
      ticker,
      deleted: deleted.length,
    })}\n`);
  }

  return {
    ok: true,
    slug,
    ticker,
    deleted: deleted.length,
    files: deleted,
    counts: planned.reduce((acc, item) => {
      acc[item.lane] = (acc[item.lane] || 0) + 1;
      return acc;
    }, {}),
    registry_removed: true,
    decision_support_only: true,
  };
}

export function previewDeskBundle({ registry, slug, vaultRoot, ontRoot, storeDir }) {
  const desks = Array.isArray(registry?.desks) ? registry.desks : [];
  const desk = desks.find((d) => d.slug === slug);
  if (!desk) throw fail(404, 'thin_desk_not_found', `Unknown thin desk "${slug}".`);
  const bundles = buildAllBundles({ desks, vaultRoot, ontRoot, storeDir });
  const bundle = withUnowned(bundles.find((b) => b.slug === slug), { vaultRoot, ontRoot, storeDir });
  const items = bundle?.items || [];
  return {
    ok: !!bundle?.ok,
    slug: desk.slug,
    ticker: String(desk.ticker || '').toUpperCase(),
    errors: bundle?.errors || [],
    counts: countLanes(items),
    paths: items.map((item) => ({
      lane: item.lane,
      root: item.root,
      rel: item.rel,
      exists: item.exists,
    })),
    decision_support_only: true,
  };
}
