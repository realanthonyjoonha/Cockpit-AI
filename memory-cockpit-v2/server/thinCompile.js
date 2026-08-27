// thinCompile.js — Path 2A S1: shared on-demand ontology compile for any thin desk.
// Fixed command only: <ontology>/ont compile <TICKER>
// After success: clear pack cache so glass sees new pack.
// Decision-support only. Does not write house view or wiki.
// Per-ticker mutex (same behavior as prior nbis/msft twins).
import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { fileURLToPath } from 'url';
import { clearPackCache } from './pack.js';
import { inspectPackStale } from './packStale.js';

const SERVER_ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// monorepo: memory-cockpit-v2/../ontology
const MONOREPO_ONT = path.resolve(SERVER_ROOT, '..', 'ontology');
const MONOREPO_WIKI = path.resolve(SERVER_ROOT, '..', 'research-wiki');

function resolveOntRoot() {
  if (process.env.ONTOLOGY_ROOT && fs.existsSync(path.join(process.env.ONTOLOGY_ROOT, 'ont'))) {
    return path.resolve(process.env.ONTOLOGY_ROOT);
  }
  if (fs.existsSync(path.join(MONOREPO_ONT, 'ont'))) return MONOREPO_ONT;
  return path.join(os.homedir(), 'Trading', 'ontology');
}

function resolveWiki() {
  if (process.env.ONTOLOGY_WIKI) return path.resolve(process.env.ONTOLOGY_WIKI);
  if (process.env.COCKPIT_VAULT) return path.resolve(process.env.COCKPIT_VAULT);
  if (fs.existsSync(path.join(MONOREPO_WIKI, 'wiki', 'entities'))) return MONOREPO_WIKI;
  return path.join(os.homedir(), 'Trading', 'research-wiki');
}

const ONT_ROOT = resolveOntRoot();
const ONT = path.join(ONT_ROOT, 'ont');

/**
 * @param {string} ticker e.g. NBIS | MSFT
 * @param {(opts?: { force?: boolean }) => object} getBook — desk book() loader (force re-read after compile)
 * @returns {{ compile: () => Promise<object>, compileStatus: () => object }}
 */
export function createThinCompile(ticker, getBook) {
  const TICKER = String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
  if (!TICKER) throw new Error('createThinCompile: ticker required');
  if (typeof getBook !== 'function') throw new Error('createThinCompile: getBook required');

  let inflight = null;
  let lastRun = null;

  async function compile(opts = {}) {
    const ifStale = !!(opts.if_stale || opts.ifStale);
    if (ifStale) {
      const wiki = resolveWiki();
      const store = process.env.ONTOLOGY_STORE
        || path.join(ONT_ROOT, 'store', 'by_ticker');
      const probe = inspectPackStale({
        ticker: TICKER,
        vaultDir: wiki,
        ontRoot: ONT_ROOT,
        storeDir: store,
      });
      if (!probe.stale) {
        return {
          available: true,
          ok: true,
          ran: false,
          stale: false,
          busy: false,
          ticker: TICKER,
          reason: probe.reason,
          newest_input: probe.newest_input,
          compiled_at: getBook({ force: false }).compiled_at || null,
          note: 'Pack already matches vault — skipped compile.',
        };
      }
    }

    if (inflight) {
      return {
        available: true,
        ok: false,
        busy: true,
        ran: false,
        error: 'compile already running — wait and try again',
        last_run: lastRun,
      };
    }

    inflight = runOnce();
    try {
      const out = await inflight;
      return { ...out, ran: true, stale: ifStale ? true : undefined };
    } finally {
      inflight = null;
    }
  }

  function runOnce() {
    return new Promise((resolve) => {
      setImmediate(() => {
        try {
          if (!fs.existsSync(ONT)) {
            resolve({
              available: false,
              ok: false,
              error: `ont not found at ${ONT}`,
              ont_path: ONT,
            });
            return;
          }

          const wiki = resolveWiki();
          const store = process.env.ONTOLOGY_STORE
            || path.join(ONT_ROOT, 'store', 'by_ticker');

          const r = spawnSync(ONT, ['compile', TICKER], {
            encoding: 'utf8',
            cwd: ONT_ROOT,
            timeout: 120_000,
            env: {
              ...process.env,
              PATH: process.env.PATH || '/usr/bin:/bin:/usr/local/bin:/opt/homebrew/bin',
              PYTHONPATH: ONT_ROOT,
              // Monorepo-safe: glass compile must not default to ~/Trading wiki
              ONTOLOGY_ROOT: ONT_ROOT,
              ONTOLOGY_WIKI: wiki,
              COCKPIT_VAULT: process.env.COCKPIT_VAULT || wiki,
              ONTOLOGY_STORE: store,
            },
          });

          const stdout = (r.stdout || '').trim();
          const stderr = (r.stderr || '').trim();
          const ok = r.status === 0;

          clearPackCache(TICKER);
          const b = getBook({ force: true });

          lastRun = {
            at: new Date().toISOString(),
            ok,
            status: r.status,
            compiled_at: b.compiled_at || null,
            stdout_tail: stdout.slice(-800),
            stderr_tail: stderr.slice(-400),
          };

          resolve({
            available: true,
            ok,
            busy: false,
            ticker: TICKER,
            ont_path: ONT,
            status: r.status,
            signal: r.signal || null,
            error: ok ? null : (stderr || stdout || `exit ${r.status}`).slice(0, 500),
            stdout_tail: lastRun.stdout_tail,
            compiled_at: b.compiled_at || null,
            book: b.available ? {
              claims_count: b.claims_count,
              sources_count: b.sources_count,
              risks: b.risks,
              house: b.house,
            } : null,
            note: ok
              ? 'Pack rebuilt. Glass cache cleared — Overview/Ask/Risks re-read on next load.'
              : 'Compile failed — pack not updated.',
            next: ok ? ['REFRESH is automatic for pack cache; hard-reload page if UI looks stale'] : [],
          });
        } catch (e) {
          lastRun = { at: new Date().toISOString(), ok: false, error: e.message };
          resolve({
            available: false,
            ok: false,
            error: e.message,
            ont_path: ONT,
          });
        }
      });
    });
  }

  function compileStatus() {
    return {
      available: true,
      busy: !!inflight,
      last_run: lastRun,
      ont_path: ONT,
      command: `${ONT} compile ${TICKER}`,
    };
  }

  return { compile, compileStatus };
}
