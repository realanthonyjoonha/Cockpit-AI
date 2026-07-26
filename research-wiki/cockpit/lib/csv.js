// csv.js — series CSV I/O with the invariants sync depends on:
//   · diff-before-write (a no-change run writes NOTHING — idempotence is provable by mtime)
//   · atomic writes (tmp + rename; Obsidian may hold files open)
//   · writes confined to the vault, house-view.md name-blocked (belt-and-braces)
// Series files: `date,value[,chg]` ascending by date. chg = published session % (spot only).
import fs from 'fs';
import path from 'path';

export function makeCsvIo(vaultDir, { dryRun = false } = {}) {
  const SERIES_DIR = path.join(vaultDir, 'cockpit', 'series');
  const ALLOW = [path.join(vaultDir, 'cockpit') + path.sep, path.join(vaultDir, 'wiki', 'catalysts.md'), path.join(vaultDir, 'wiki', 'log.md')];

  function assertSafe(abs) {
    const real = path.resolve(abs);
    if (!ALLOW.some((a) => a.endsWith(path.sep) ? real.startsWith(a) : real === a))
      throw new Error(`REFUSED: write outside allowed paths: ${real}`);
    if (path.basename(real) === 'house-view.md') throw new Error('REFUSED: house-view.md is never written, by anything, ever.');
    return real;
  }

  function writeFileAtomicIfChanged(abs, text) {
    const real = assertSafe(abs);
    const existing = fs.existsSync(real) ? fs.readFileSync(real, 'utf8') : null;
    if (existing === text) return false;
    if (dryRun) return true; // report "would change", touch nothing
    fs.mkdirSync(path.dirname(real), { recursive: true });
    const tmp = real + '.tmp-sync';
    fs.writeFileSync(tmp, text);
    fs.renameSync(tmp, real);
    return true;
  }

  function readCsv(id) {
    const file = path.join(SERIES_DIR, `${id}.csv`);
    if (!fs.existsSync(file)) return [];
    const lines = fs.readFileSync(file, 'utf8').trim().split('\n').slice(1);
    return lines.map((l) => {
      const [date, value, chg] = l.split(',');
      return { date, value: Number(value), chg: chg !== undefined && chg !== '' ? Number(chg) : null };
    }).filter((p) => p.date && !Number.isNaN(p.value));
  }

  // rows: [[date, value], ...] — full-series replace (price/EDGAR sources give full history)
  function writeCsvIfChanged(id, rows) {
    const clean = rows.filter((r) => r[1] != null && Number.isFinite(r[1]))
      .sort((a, b) => String(a[0]).localeCompare(String(b[0])));
    const text = 'date,value\n' + clean.map((r) => `${r[0]},${r[1]}`).join('\n') + '\n';
    const changed = writeFileAtomicIfChanged(path.join(SERIES_DIR, `${id}.csv`), text);
    return { changed, points: clean.length };
  }

  // append ONE dated point (dedupe by date, keep 3-col chg format) — accumulate-over-time sources
  function appendPoint(id, date, value, chg = null) {
    const file = path.join(SERIES_DIR, `${id}.csv`);
    const map = new Map();
    if (fs.existsSync(file)) {
      for (const l of fs.readFileSync(file, 'utf8').trim().split('\n').slice(1)) {
        const [d, v, c] = l.split(',');
        if (d && Number.isFinite(Number(v))) map.set(d.trim(), { value: Number(v), chg: c !== undefined && c !== '' ? Number(c) : null });
      }
    }
    map.set(date, { value, chg });
    const rows = [...map.entries()].sort((a, b) => a[0].localeCompare(b[0]));
    const text = 'date,value,chg\n' + rows.map(([d, o]) => `${d},${o.value},${o.chg == null ? '' : o.chg}`).join('\n') + '\n';
    const changed = writeFileAtomicIfChanged(file, text);
    return { changed, points: map.size };
  }

  return { readCsv, writeCsvIfChanged, appendPoint, writeFileAtomicIfChanged, assertSafe, SERIES_DIR };
}
