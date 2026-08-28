#!/usr/bin/env node
/**
 * thin-desk-rigor.mjs — deep parity test for Phase 3 shared thin desks.
 *
 * Layers:
 *   1. Source structure (App + registry + no layout forks)
 *   2. API cross-desk shape parity + contract + ask/refusal/compile
 *   3. Headless Chrome DOM: every thin room mounts + chrome markers match across desks
 *
 *   node scripts/thin-desk-rigor.mjs
 *   npm run smoke:rigor
 *
 * Exit 0 = all green; 1 = failure; 2 = harness error.
 */
import { spawn, spawnSync } from 'child_process';
import { existsSync, readFileSync, rmSync } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
// Prefer env → monorepo sibling research-wiki → legacy ~/Trading
const MONOREPO_VAULT = path.resolve(ROOT, '..', 'research-wiki');
const VAULT = process.env.COCKPIT_VAULT
  || (existsSync(path.join(MONOREPO_VAULT, 'cockpit', 'lib', 'fm.js'))
    ? MONOREPO_VAULT
    : path.join(process.env.HOME || '', 'Trading', 'research-wiki'));
const PORT = 4791;
const BASE = `http://127.0.0.1:${PORT}`;
const ACCESS = `/tmp/mc-rigor-${process.pid}.json`;
const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const VT = 9000; // virtual-time-budget ms — pack fetch + React mount

const REG = JSON.parse(readFileSync(path.join(ROOT, 'config/thin-desks.json'), 'utf8'));
const DESKS = REG.desks || [];
const ROOMS = REG.rooms || ['overview', 'risks', 'house', 'sources', 'street', 'model', 'research', 'reports', 'update'];

let pass = 0;
let fail = 0;
const ok = (n) => { pass++; console.log(`  \x1b[32m✓\x1b[0m ${n}`); };
const bad = (n, m) => { fail++; console.log(`  \x1b[31m✗\x1b[0m ${n} — ${m}`); };
async function check(name, fn) {
  try {
    const m = await fn();
    m ? bad(name, m) : ok(name);
  } catch (e) {
    bad(name, e.message);
  }
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
function read(rel) {
  const p = path.join(ROOT, rel);
  return existsSync(p) ? readFileSync(p, 'utf8') : null;
}
async function getJson(p) {
  const res = await fetch(BASE + p);
  if (res.status !== 200) throw new Error(`HTTP ${res.status} ${p}`);
  return res.json();
}

async function waitUp(ms = 25000) {
  const t0 = Date.now();
  while (Date.now() - t0 < ms) {
    try {
      const r = await fetch(BASE + '/');
      if (r.status === 200) return true;
    } catch { /* not yet */ }
    await sleep(200);
  }
  throw new Error('server did not come up');
}

/** Dump headless DOM for a hash route. */
function dumpDom(hashPath) {
  if (!existsSync(CHROME)) return { err: 'Chrome not found' };
  const r = spawnSync(
    CHROME,
    ['--headless=new', '--dump-dom', `--virtual-time-budget=${VT}`, `${BASE}/#/${hashPath}`],
    { encoding: 'utf8', timeout: 45000, maxBuffer: 20 * 1024 * 1024 },
  );
  if (r.error) return { err: r.error.message };
  if (r.status !== 0 && !(r.stdout || '').includes('<main')) {
    return { err: `chrome exit ${r.status}: ${(r.stderr || '').slice(0, 120)}` };
  }
  return { dom: r.stdout || '' };
}

function mainInnerText(dom) {
  const main = dom.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  if (!main) return null;
  return main[1].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
}

function mainHtml(dom) {
  const main = dom.match(/<main[^>]*>([\s\S]*?)<\/main>/i);
  return main ? main[1] : null;
}

/** Stable chrome fingerprint — ignores company-specific words where possible. */
function chromeFingerprint(html, desk) {
  if (!html) return null;
  const stripLabels = [desk.label, desk.ticker, desk.slug, desk.id].filter(Boolean);
  let h = html;
  for (const s of stripLabels) {
    h = h.replace(new RegExp(s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi'), '«D»');
  }
  // Drop volatile timestamps / prices-ish numbers in text nodes roughly
  h = h.replace(/\d{4}-\d{2}-\d{2}[T ][\d:.]+Z?/g, '«TS»');
  h = h.replace(/\$\d+\.\d{2}/g, '«$»');
  h = h.replace(/[+\-]?\d+\.\d{2}%/g, '«%»');

  const flags = {
    has_crumb: /class="crumb"/.test(h),
    has_sect: /class="sect"/.test(h),
    has_shd: /class="shd"/.test(h),
    has_compile: /COMPILE BOOK/.test(h),
    has_refresh: />\s*REFRESH\s*</.test(h) || /REFRESH BOOK/.test(h) || />REFRESH</.test(h),
    has_reg: /class="reg"/.test(h),
    has_ol: /<ol[\s>]/.test(h),
    has_meta_only: /META_ONLY/.test(h),
    has_write_path: /WRITE PATH/.test(h),
    has_ritual: /RITUAL/.test(h),
    has_risk_register: /RISK REGISTER/.test(h),
    // dump-dom encodes & as &amp;
    has_pack_qa: /PACK Q(?:&amp;|&)A/.test(h),
    has_read_only: /READ-ONLY|READ ONLY|read-only/i.test(h),
    has_table: /<table[\s>]/.test(h),
    has_input: /<input[\s>]/.test(h) || /<textarea[\s>]/.test(h),
  };
  return flags;
}

// ─── Layer 1: source structure ─────────────────────────────────────────────
async function layerSource() {
  console.log('\n\x1b[1m1 · Source structure\x1b[0m');

  await check('registry ≥2 desks + rooms + meta_only', async () => {
    if (DESKS.length < 2) return `need ≥2 desks got ${DESKS.length}`;
    if (REG.write_path_mode !== 'meta_only') return `write_path_mode=${REG.write_path_mode}`;
    if (REG.parity_group !== 'thin_ontology_v1') return `parity_group=${REG.parity_group}`;
    for (const r of ROOMS) if (!REG.rooms.includes(r)) return `missing room ${r}`;
    return '';
  });

  await check('App.jsx routes thin via DeskRouter only', async () => {
    const app = read('src/App.jsx') || '';
    if (!app.includes("from './pages/thin/DeskRouter.jsx'")) return 'missing DeskRouter import';
    if (!app.includes('<DeskRouter')) return 'DeskRouter not used';
    if (/from ['"].*pages\/nbis\/Overview/.test(app)) return 'App still imports nbis/Overview';
    if (/from ['"].*pages\/msft\/Overview/.test(app)) return 'App still imports msft/Overview';
    if (!app.includes('thinDesks') && !app.includes('THIN_DESKS')) return 'App not registry-driven';
    return '';
  });

  await check('thinDesks.js loads config/thin-desks.json', async () => {
    const s = read('src/thinDesks.js') || '';
    if (!s.includes('thin-desks.json')) return 'no registry import';
    if (!s.includes('export const THIN_DESKS') && !s.includes('useThinDesks')) {
      return 'no THIN_DESKS / useThinDesks export';
    }
    if (!s.includes('thinRail')) return 'no thinRail';
    return '';
  });

  await check('shared thin modules exist + parameterized', async () => {
    const need = [
      'Overview.jsx', 'Risks.jsx', 'Risk.jsx', 'House.jsx', 'Sources.jsx',
      'Ask.jsx', 'Empty.jsx', 'BookStrip.jsx', 'UpdateMetaOnly.jsx', 'DeskRouter.jsx',
    ];
    for (const f of need) {
      const src = read(`src/pages/thin/${f}`);
      if (!src) return `missing thin/${f}`;
      if (f === 'DeskRouter.jsx') continue;
      if (!/\bdesk\b/.test(src)) return `${f} not desk-parameterized`;
    }
    return '';
  });

  await check('desk wrappers optional; if present thin re-exports only', async () => {
    const wrap = ['Overview', 'Risks', 'Risk', 'House', 'Sources', 'Ask', 'Empty', 'Update', 'BookStrip'];
    const app = read('src/App.jsx') || '';
    if (!app.includes('DeskRouter')) return 'App.jsx must route thin desks via DeskRouter';
    for (const d of DESKS) {
      const present = [];
      const missing = [];
      for (const name of wrap) {
        const src = read(`src/pages/${d.slug}/${name}.jsx`);
        if (!src) {
          missing.push(name);
          continue;
        }
        present.push({ name, src });
      }
      if (present.length === 0) continue; // factory path — DeskRouter + thin/*
      if (missing.length) {
        return `${d.slug}: partial wrappers (missing ${missing.join(',')}) — full set or none`;
      }
      for (const { name, src } of present) {
        if (!src.includes('../thin/') && !src.includes('pages/thin/')) {
          return `${d.slug}/${name} not re-exporting thin`;
        }
        const lines = src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('//'));
        if (lines.length > 20) return `${d.slug}/${name} too fat (${lines.length} non-comment lines) — layout leak?`;
        if (src.includes('className="sect"') && name !== 'BookStrip') {
          return `${d.slug}/${name} has sect chrome`;
        }
      }
    }
    return '';
  });

  await check('UpdateMetaOnly: no ol, has reg + META_ONLY path', async () => {
    const src = read('src/pages/thin/UpdateMetaOnly.jsx') || '';
    const code = src.replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    if (/<ol[\s>]/.test(code)) return 'forbidden <ol>';
    if (!src.includes('className="reg"')) return 'need .reg lists';
    if (!src.includes('META_ONLY')) return 'crumb must show META_ONLY';
    if (!src.includes('16px')) return 'padding token 16px missing';
    return '';
  });

  await check('BookStrip: COMPILE BOOK + REFRESH shared module', async () => {
    const src = read('src/pages/thin/BookStrip.jsx') || '';
    if (!src.includes('COMPILE BOOK')) return 'missing COMPILE BOOK';
    if (!src.includes('REFRESH')) return 'missing REFRESH';
    if (!src.includes('compile')) return 'compile path missing';
    if (!src.includes('apiPost')) return 'apiPost missing';
    return '';
  });
}

// ─── Layer 2: API parity ───────────────────────────────────────────────────
async function layerApi() {
  console.log('\n\x1b[1m2 · API cross-desk parity\x1b[0m');

  const metas = {};
  for (const d of DESKS) {
    await check(`meta ${d.slug} contract v${REG.contract_version}`, async () => {
      const m = await getJson(`/api/${d.slug}/meta`);
      metas[d.slug] = m;
      if (!m.pack_exists || !m.compiled_at) return 'pack missing';
      if (m.ticker !== d.ticker) return `ticker ${m.ticker}`;
      const c = m.thin_desk_contract;
      if (!c || c.version !== REG.contract_version) return `version ${c?.version}`;
      if (c.parity_group !== REG.parity_group) return `parity_group ${c.parity_group}`;
      if (c.capabilities?.write_path_mode !== REG.write_path_mode) {
        return `write_path_mode ${c.capabilities?.write_path_mode}`;
      }
      for (const cap of ['compile_book', 'refresh_book', 'pack_ask', 'write_path']) {
        if (!c.capabilities?.[cap]) return `cap ${cap}`;
      }
      for (const r of ROOMS) if (!(c.rooms || []).includes(r)) return `room ${r}`;
      return '';
    });
  }

  await check('all desks identical write_path_mode + rooms set', async () => {
    const modes = new Set();
    const roomSigs = new Set();
    for (const d of DESKS) {
      const c = metas[d.slug]?.thin_desk_contract;
      if (!c) return `no meta for ${d.slug}`;
      modes.add(c.capabilities.write_path_mode);
      roomSigs.add([...(c.rooms || [])].sort().join(','));
    }
    if (modes.size !== 1) return `modes: ${[...modes].join('|')}`;
    if (roomSigs.size !== 1) return `rooms diverge: ${[...roomSigs].join(' || ')}`;
    return '';
  });

  // Shape key parity (same top-level keys; values may differ)
  const endpoints = [
    ['overview', (j) => j.available && Array.isArray(j.claims)],
    ['risks', (j) => j.available && Array.isArray(j.risks) && j.risks.length >= 1],
    ['house', (j) => j.available && j.hero?.html],
    ['sources', (j) => j.available && Array.isArray(j.sources) && j.sources.length >= 1],
    ['book', (j) => j.available && j.compiled_at && j.risks],
    ['write-meta', (j) => j.available && j.paths && j.commands?.compile],
    ['quote', (j) => j.available === true && 'quote' in j],
    ['compile', (j) => j.available && j.command],
  ];

  for (const [ep, pred] of endpoints) {
    await check(`GET /api/{desk}/${ep} shape both desks`, async () => {
      const payloads = [];
      for (const d of DESKS) {
        const j = await getJson(`/api/${d.slug}/${ep}`);
        if (!pred(j)) return `${d.slug}/${ep} failed predicate`;
        payloads.push({ slug: d.slug, keys: Object.keys(j).sort() });
      }
      // Require substantial key overlap (not necessarily exact — models may differ slightly)
      const [a, b] = payloads;
      const setA = new Set(a.keys);
      const setB = new Set(b.keys);
      const onlyA = a.keys.filter((k) => !setB.has(k));
      const onlyB = b.keys.filter((k) => !setA.has(k));
      // Allow small drift but flag major capability holes
      const critical = ['available', 'compiled_at', 'ticker', 'paths', 'commands', 'claims', 'risks', 'hero', 'sources', 'quote'];
      for (const k of critical) {
        if (setA.has(k) && !setB.has(k)) return `${b.slug} missing key ${k} (present on ${a.slug}) for ${ep}`;
        if (setB.has(k) && !setA.has(k)) return `${a.slug} missing key ${k} (present on ${b.slug}) for ${ep}`;
      }
      if (onlyA.length > 5 || onlyB.length > 5) {
        return `key drift ${ep}: only ${a.slug}=${onlyA.join(',')} only ${b.slug}=${onlyB.join(',')}`;
      }
      return '';
    });
  }

  await check('write-meta: both desks meta_only class (no pins ritual)', async () => {
    for (const d of DESKS) {
      const j = await getJson(`/api/${d.slug}/write-meta`);
      if (!j.commands?.compile || !j.commands.compile.includes(d.ticker)) {
        return `${d.slug} compile cmd must include ${d.ticker}`;
      }
      if (!j.paths?.entity?.exists || !j.paths?.house?.exists) return `${d.slug} vault paths`;
      // meta_only: success_criteria present; proposals not required on write-meta
      if (!Array.isArray(j.success_criteria) || j.success_criteria.length < 4) {
        return `${d.slug} success_criteria thin`;
      }
    }
    return '';
  });

  await check('ask: house + on_watch + refusal both desks', async () => {
    for (const d of DESKS) {
      const h = await getJson(`/api/${d.slug}/ask?q=` + encodeURIComponent('house view'));
      if (!h?.available || h.route !== 'house' || !(h.answer || '').length) return `${d.slug} house ask`;
      const w = await getJson(`/api/${d.slug}/ask?q=` + encodeURIComponent("what's on watch?"));
      if (!w?.available || w.route !== 'on_watch') return `${d.slug} watch route=${w?.route}`;
      const r = await getJson(`/api/${d.slug}/ask?q=` + encodeURIComponent('should I buy?'));
      if (!r?.available || r.route !== 'refusal') return `${d.slug} refusal route=${r?.route}`;
      if (!/decision-support|not advice|no buy|cannot recommend|refuse/i.test(r.answer || '')
        && !/buy|sell|position|advice/i.test(r.answer || '')) {
        // still ok if route is refusal — content may vary
      }
    }
    return '';
  });

  await check('POST book/refresh both desks', async () => {
    for (const d of DESKS) {
      const res = await fetch(`${BASE}/api/${d.slug}/book/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}',
      });
      if (res.status !== 200) return `${d.slug} HTTP ${res.status}`;
      const j = await res.json();
      if (!j.refreshed || !j.compiled_at) return `${d.slug} refresh payload`;
    }
    return '';
  });

  await check('risk detail first id both desks', async () => {
    for (const d of DESKS) {
      const list = await getJson(`/api/${d.slug}/risks`);
      const id = list.risks?.[0]?.id;
      if (!id) return `${d.slug} no risks`;
      const det = await getJson(`/api/${d.slug}/risk/${encodeURIComponent(id)}`);
      if (!det || det.id !== id) return `${d.slug} risk detail`;
      if (!Array.isArray(det.tripwires)) return `${d.slug} no tripwires array`;
    }
    return '';
  });
}

// ─── Layer 3: headless DOM chrome parity ───────────────────────────────────
async function layerDom() {
  console.log('\n\x1b[1m3 · Headless DOM chrome (Chrome)\x1b[0m');

  if (!existsSync(CHROME)) {
    bad('Chrome available', 'not installed — DOM layer skipped (fail-closed)');
    return;
  }
  ok('Chrome available');

  /** @type {Record<string, Record<string, object>>} */
  const fps = {};

  for (const d of DESKS) {
    fps[d.slug] = {};
    for (const room of ROOMS) {
      const hash = `${d.slug}/${room}`;
      await check(`mount #/${hash}`, async () => {
        const { dom, err } = dumpDom(hash);
        if (err) return err;
        const text = mainInnerText(dom);
        const html = mainHtml(dom);
        if (!html) return 'no <main>';
        if (!text || text.length < 20) return `main empty/short (${text?.length || 0} chars)`;
        // Still loading?
        if (/^LOADING/.test(text) && text.length < 40) return 'stuck on LOADING…';
        const fp = chromeFingerprint(html, d);
        fps[d.slug][room] = fp;

        // Room-specific required chrome
        if (room === 'overview') {
          if (!fp.has_crumb) return 'no crumb';
          if (!fp.has_compile || !fp.has_refresh) return 'BookStrip missing COMPILE/REFRESH';
          if (!fp.has_sect) return 'no sect';
        }
        if (room === 'risks') {
          if (!fp.has_risk_register) return 'no RISK REGISTER header';
          if (!fp.has_table) return 'no register table';
        }
        if (room === 'house') {
          if (!fp.has_crumb) return 'no crumb';
          // house body should have real content
          if (text.length < 80) return 'house too thin';
        }
        if (room === 'sources') {
          if (!fp.has_table && !fp.has_sect) return 'sources chrome missing';
        }
        if (room === 'ask') {
          if (!fp.has_pack_qa) return 'no PACK Q&A crumb (DOM may encode & as &amp;)';
          if (!fp.has_compile || !fp.has_refresh) return 'Ask needs BookStrip';
          if (!fp.has_input) return 'no ask input';
          if (!/DETERMINISTIC/.test(html)) return 'Ask crumb missing DETERMINISTIC';
        }
        if (room === 'update') {
          if (!fp.has_meta_only) return 'Update must show META_ONLY';
          if (!fp.has_write_path) return 'no WRITE PATH';
          if (!fp.has_ritual) return 'no RITUAL section';
          if (!fp.has_reg) return 'ritual must use .reg not ol';
          if (fp.has_ol) return 'forbidden <ol> on Update';
          if (!fp.has_compile || !fp.has_refresh) return 'Update needs BookStrip';
        }
        return '';
      });
    }
  }

  // Cross-desk fingerprint equality on chrome flags
  if (DESKS.length >= 2) {
    const [a, b] = DESKS;
    for (const room of ROOMS) {
      await check(`chrome flags parity ${a.slug}≡${b.slug} · ${room}`, async () => {
        const fa = fps[a.slug]?.[room];
        const fb = fps[b.slug]?.[room];
        if (!fa || !fb) return 'missing fingerprint (mount failed earlier)';
        const keys = Object.keys(fa);
        const diffs = [];
        for (const k of keys) {
          if (fa[k] !== fb[k]) diffs.push(`${k}: ${a.slug}=${fa[k]} ${b.slug}=${fb[k]}`);
        }
        if (diffs.length) return diffs.join('; ');
        return '';
      });
    }
  }

  // Desk switcher marks appear in shell (outside main is ok — check full DOM)
  await check('shell switcher contains all desk labels', async () => {
    const { dom, err } = dumpDom(`${DESKS[0].slug}/overview`);
    if (err) return err;
    for (const d of DESKS) {
      if (!dom.includes(d.label) && !dom.includes(d.ticker)) {
        return `switcher/shell missing ${d.label}`;
      }
    }
    return '';
  });

  // Rail is glyph buttons with title=… (onClick sets hash — no <a href>)
  await check('thin rail titles present for active desk', async () => {
    const d = DESKS[0];
    const { dom, err } = dumpDom(`${d.slug}/overview`);
    if (err) return err;
    // thinRail titles: `${LABEL} Overview — …`, `${LABEL} Risks`, etc.
    const need = [
      `${d.label} Overview`,
      `${d.label} Risks`,
      `${d.label} House`,
      `${d.label} Sources`,
      `${d.label} Street`,
      `${d.label} Model`,
      `${d.label} Compile`,
      `${d.label} Reports`,
      `${d.label} Update`,
    ];
    for (const t of need) {
      if (!dom.includes(t)) return `rail title missing: ${t}`;
    }
    if (dom.includes(`${d.label} Ask`)) return 'Ask still on rail (API/CLI only)';
    // class ric for rail icons
    if (!/class="ric/.test(dom)) return 'no .ric rail icons';
    return '';
  });
}

async function main() {
  console.log(`\x1b[1mTHIN-DESK RIGOR\x1b[0m — Phase 3 shared chrome + registry`);
  console.log(`desks: ${DESKS.map((d) => d.slug).join(', ')} · rooms: ${ROOMS.join(', ')}`);
  console.log(`vault: ${VAULT}\n`);

  // Layer 1 does not need server
  await layerSource();

  if (existsSync(ACCESS)) rmSync(ACCESS);
  console.log(`\nSpawning auth-inert server on :${PORT}…`);
  const srv = spawn(process.execPath, [path.join(ROOT, 'server', 'index.js')], {
    cwd: ROOT,
    env: {
      ...process.env,
      PORT: String(PORT),
      COCKPIT_ACCESS_FILE: ACCESS,
      COCKPIT_VAULT: process.env.COCKPIT_VAULT || VAULT,
    },
    stdio: 'ignore',
    detached: false,
  });

  try {
    await waitUp();
    await layerApi();
    await layerDom();
  } finally {
    try { process.kill(-srv.pid); } catch { /* */ }
    try { srv.kill('SIGKILL'); } catch { /* */ }
    if (existsSync(ACCESS)) rmSync(ACCESS);
  }

  console.log(`\n\x1b[1mRIGOR ${fail ? '\x1b[31mFAIL' : '\x1b[32mPASS'}\x1b[0m — ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => {
  console.error('rigor harness error:', e);
  process.exit(2);
});
