/**
 * P2 gate: register GO stamps only when closeout would pass.
 * A shell append is not a GO. The same gate runs on every sector fixture.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');
const SELF = fileURLToPath(import.meta.url);
const BASH_RULE = 'Bash may read and may not write house-view-*.md, 08-risks-catalysts.md, or 09.';

function spawnWorker(mode) {
  const tmp = mkdtempSync(path.join(tmpdir(), 'cockpit-p2-'));
  const vault = path.join(tmp, 'wiki');
  mkdirSync(vault, { recursive: true });
  try {
    const proc = spawnSync(process.execPath, [SELF], {
      env: {
        ...process.env,
        GO_P2_WORKER: '1',
        GO_P2_MODE: mode,
        COCKPIT_VAULT: vault,
        COCKPIT_GO_COMMIT_NO_COMPILE: '1',
      },
      encoding: 'utf8',
      maxBuffer: 8 * 1024 * 1024,
    });
    let parsed = null;
    try { parsed = JSON.parse(proc.stdout || ''); } catch { /* worker crashed */ }
    if (!parsed || !Array.isArray(parsed.errors)) {
      const detail = `${proc.stderr || ''}\n${proc.stdout || ''}`.trim().slice(0, 1800);
      return [`${mode} worker exit ${proc.status}: ${detail}`];
    }
    return parsed.errors;
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

export function assertP2() {
  const errors = [];
  const mcp = readFileSync(path.join(REPO, 'memory-cockpit-v2/scripts/mcp-cockpit-research.mjs'), 'utf8');
  if (!mcp.includes(BASH_RULE)) errors.push('tool description missing bash write rule');
  errors.push(...spawnWorker('all'));
  return errors;
}

/** GO projection on the ten-sector fixture. Used by --assert sectors. */
export function sectorGoErrors() {
  return spawnWorker('sectors');
}

function confirmedHouse() {
  return `---
status: CONFIRMED
updated: 2026-01-15
---

# House

**Stance:** Fixture only. Decision-support only.
`;
}

function cleanTitle(title) {
  return String(title || 'harness').replace(/[#\n\r]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80) || 'harness';
}

function riskBlock(n, title) {
  const name = cleanTitle(title);
  return `### R${n} — ${name}
- **Status:** WATCH · **Grade:** [B] · harness
- **Mechanism:** harness mechanism

| Signal | Tripwire | Current state | As-of |
| --- | --- | --- | --- |
| s | t | now | 2026-01-15 |
`;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === SELF;

if (isMain && process.env.GO_P2_WORKER === '1') {
  const errors = await runWorker(process.env.GO_P2_MODE || 'all');
  console.log(JSON.stringify({ errors }));
  process.exit(errors.length ? 1 : 0);
}

async function runWorker(mode) {
  const errors = [];
  const fail = (id, msg) => errors.push(`${id}: ${msg}`);
  const vault = process.env.COCKPIT_VAULT;
  const { goCommitRegister, goCommitDrivers, readSession } = await import('../../memory-cockpit-v2/server/goCommit.js');
  const { proposeAddRisk } = await import('../../memory-cockpit-v2/server/riskProposals.js');
  const { registerCloseout } = await import('../../memory-cockpit-v2/scripts/register-closeout.mjs');
  const { houseCloseout } = await import('../../memory-cockpit-v2/scripts/house-closeout.mjs');
  const {
    saveHouseMarkdown,
    readHouseWriteAudit,
    HOUSE_OUTSIDE_WRITE_GAP,
  } = await import('../../memory-cockpit-v2/server/thinHouseSave.js');
  const { loadSectors } = await import('./sector-check.mjs');
  const issuers = loadSectors().issuers || [];

  const fs = await import('node:fs');
  function write(abs, text) {
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    fs.writeFileSync(abs, text);
  }
  function prepareSync(slug, body) {
    write(path.join(vault, `house-view-${slug}.md`), confirmedHouse());
    write(path.join(vault, 'raw', `${slug}-research`, '08-risks-catalysts.md'), `# 08\n\n${body}`);
  }
  function reg(slug) {
    return goCommitRegister({
      slug,
      houseFile: `house-view-${slug}.md`,
      risksSourceRel: `raw/${slug}-research/08-risks-catalysts.md`,
      utterance: 'GO',
      compile: false,
    });
  }
  function eightPath(slug) {
    return path.join(vault, 'raw', `${slug}-research`, '08-risks-catalysts.md');
  }

  function thinRefuse(id, slug, title) {
    prepareSync(slug, riskBlock(1, title));
    const before = fs.readFileSync(eightPath(slug), 'utf8');
    const out = reg(slug);
    const after = fs.readFileSync(eightPath(slug), 'utf8');
    if (out.ok !== false) fail(id, `expected ok false, got ${out.ok}`);
    else if (!/not stamped/i.test(out.error || '')) fail(id, `error missing not-stamped: ${out.error}`);
    else if (!/thin/i.test(out.error || '')) fail(id, `error missing thin: ${out.error}`);
    if (after !== before) fail(id, 'thin GO wrote the register');
    if (readSession(slug).phase === 'REGISTER_COMMITTED') fail(id, 'thin GO stamped the session');
  }

  function collide(id, slug, title) {
    prepareSync(slug, riskBlock(1, title));
    const section = riskBlock(2, 'shared number');
    write(path.join(vault, 'cockpit', 'proposals', `risks-${slug}.json`), JSON.stringify({
      version: 1,
      slug,
      proposals: [1, 2, 3, 4].map((i) => ({
        id: `rp_collide_${slug}_${i}`,
        kind: 'add_risk',
        status: 'pending',
        r_num: '2',
        title: `Shared ${i} ${slug}`,
        risk_name: `R2 — Shared ${i}`,
        to_status: 'WATCH',
        grade: 'B',
        summary: 'chip',
        mechanism: 'fixture',
        section_markdown: section,
      })),
    }));
    const before = fs.readFileSync(eightPath(slug), 'utf8');
    const out = reg(slug);
    const after = fs.readFileSync(eightPath(slug), 'utf8');
    if (out.ok !== false) fail(id, `colliding chips returned ok ${out.ok} ${out.error || ''}`);
    if (!/not stamped/i.test(out.error || '')) fail(id, `collide error: ${out.error}`);
    if (after !== before) fail(id, 'colliding chips wrote the register');
    if (readSession(slug).phase === 'REGISTER_COMMITTED') fail(id, 'colliding chips stamped');
  }

  function distinctAndDrivers(id, slug, titles) {
    prepareSync(slug, riskBlock(1, titles[0] || 'seed'));
    const nums = [];
    for (let i = 0; i < 4; i++) {
      const chip = proposeAddRisk({
        slug,
        ticker: slug.toUpperCase(),
        risksSourceRel: `raw/${slug}-research/08-risks-catalysts.md`,
        body: {
          title: `Chip ${i + 1} ${slug}`,
          summary: 'distinct chip',
          mechanism: 'fixture mechanism',
          grade: 'B',
          status: 'WATCH',
          tripwires: [{ signal: 's', tripwire: 't', state: 'now', as_of: '2026-01-15' }],
        },
      });
      nums.push(String(chip.proposal.r_num));
    }
    if (new Set(nums).size !== 4) fail(id, `r_num not distinct: ${nums.join(',')}`);
    const out = reg(slug);
    if (out.ok !== true) fail(id, `expected ok true: ${out.error || out.ok}`);
    else if (readSession(slug).phase !== 'REGISTER_COMMITTED') fail(id, `phase ${readSession(slug).phase}`);
    else if (!registerCloseout(slug, { vault }).pass) fail(id, 'ok true but register-closeout failed');
    if (out.ok === true) {
      try {
        const drv = goCommitDrivers({
          slug,
          houseFile: `house-view-${slug}.md`,
          utterance: 'GO',
          compile: false,
        });
        if (!drv.ok) fail('drivers-go', `ok false ${drv.error || ''}`);
      } catch (e) {
        const msg = e.message || String(e);
        if (/thin|not closed/i.test(msg)) fail('drivers-go', msg);
        else fail('drivers-go', msg);
      }
    }
  }

  function sectorTitles(issuer) {
    const claims = issuer.claims || [];
    const titles = claims.map((c, i) => cleanTitle(c.text) || `${issuer.id} claim ${i}`);
    while (titles.length < 5) titles.push(`${issuer.id} harness ${titles.length}`);
    return titles.map((t, i) => `${t} ${issuer.id} ${i}`.slice(0, 100));
  }

  if (mode === 'all' || mode === 'sectors') {
    if (issuers.length !== 10) fail('sectors', `expected 10 issuers, got ${issuers.length}`);
    for (const issuer of issuers) {
      const titles = sectorTitles(issuer);
      thinRefuse(`sectors-${issuer.id}`, `thin${issuer.id}`, titles[0]);
    }
    const first = issuers[0];
    const second = issuers[1];
    if (first && second) {
      collide('register-go', `col${first.id}`, sectorTitles(first)[0]);
      distinctAndDrivers('drivers-go', `go${second.id}`, sectorTitles(second));
    } else fail('sectors', 'missing two issuers');
  }

  if (mode === 'all') {
    const prose = `${confirmedHouse()}\nHARNESS-HOUSE-PROSE-NOT-IN-LOG\n`;
    write(path.join(vault, 'house-view-bare.md'), prose);
    const logPath = path.join(vault, 'cockpit', 'house-write-log.jsonl');
    const bare = readHouseWriteAudit(vault, 'house-view-bare.md', prose, { exists: true });
    if (bare.state !== 'no_audit' || bare.mismatch) fail('bash_bypass', `missing log was ${bare.state}`);
    if (fs.existsSync(logPath)) fail('bash_bypass', 'read created a house-write log');

    const saved = saveHouseMarkdown('house-view-clean.md', prose);
    if (!saved.ok) fail('bash_bypass', 'saveHouseMarkdown failed');
    const cleanText = fs.readFileSync(path.join(vault, 'house-view-clean.md'), 'utf8');
    if (cleanText !== prose) fail('bash_bypass', 'save changed the house bytes');
    const matched = readHouseWriteAudit(vault, 'house-view-clean.md', cleanText, { exists: true });
    if (matched.mismatch || matched.state !== 'match') fail('bash_bypass', `clean save ${matched.state}`);
    const cleanClose = houseCloseout('clean', { vault });
    if (!cleanClose.pass) fail('bash_bypass', `clean closeout ${cleanClose.reason}`);
    const log = fs.readFileSync(logPath, 'utf8');
    if (log.includes('HARNESS-HOUSE-PROSE-NOT-IN-LOG')) fail('bash_bypass', 'log stored house prose');

    saveHouseMarkdown('house-view-bash.md', prose);
    const bashFile = path.join(vault, 'house-view-bash.md');
    const appended = spawnSync('sh', ['-c', 'printf "\\nBASH-BYPASS-CANARY\\n" >> "$1"', 'sh', bashFile], { encoding: 'utf8' });
    if (appended.status !== 0) fail('bash_bypass', `shell exit ${appended.status}`);
    const after = fs.readFileSync(bashFile, 'utf8');
    if (!after.includes('BASH-BYPASS-CANARY')) fail('bash_bypass', 'shell did not append');
    const audit = readHouseWriteAudit(vault, 'house-view-bash.md', after, { exists: true });
    if (!audit.mismatch || audit.gap !== HOUSE_OUTSIDE_WRITE_GAP) fail('bash_bypass', `audit ${JSON.stringify(audit)}`);
    const closed = houseCloseout('bash', { vault });
    if (closed.pass || closed.gap !== HOUSE_OUTSIDE_WRITE_GAP) fail('bash_bypass', `closeout ${closed.reason}`);
  }

  return errors;
}
