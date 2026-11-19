import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { refreshDeskCompanyfacts, padCik, contactUserAgent } from '../../memory-cockpit-v2/server/companyfactsFetch.js';
import { factsDir, loadConfig } from './load-config.mjs';

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

export function contactUa(cfg = loadConfig()) {
  return contactUserAgent(cfg.pilot.sec.user_agent);
}

export async function fetchCompanyfacts(company, cfg = loadConfig()) {
  const dest = path.join(factsDir(cfg), `${company.ticker}.json`);
  mkdirSync(path.dirname(dest), { recursive: true });
  const wikiRoot = path.join(factsDir(cfg), '_wiki');
  const result = await refreshDeskCompanyfacts({
    ticker: company.ticker,
    slug: company.id,
    cik: company.cik,
    dest,
    wikiRoot,
    userAgent: cfg.pilot.sec.user_agent,
    urlTemplate: cfg.pilot.sec.url_template,
    timeoutMs: cfg.pilot.sec.timeout_ms,
  });
  if (!result.ok) {
    throw new Error(result.gap || `companyfacts fetch failed for ${company.ticker}`);
  }
  const raw = readFileSync(dest);
  return {
    ticker: company.ticker,
    cik: result.cik || padCik(company.cik),
    path: dest,
    fetched_at: new Date().toISOString(),
    sha256: sha256(raw),
    bytes: raw.length,
  };
}

export function readCachedFacts(company, cfg = loadConfig()) {
  const dest = path.join(factsDir(cfg), `${company.ticker}.json`);
  if (!existsSync(dest)) return null;
  const raw = readFileSync(dest);
  return {
    dest,
    doc: JSON.parse(raw.toString('utf8')),
    sha256: sha256(raw),
    bytes: raw.length,
  };
}

export function writeJson(file, obj) {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, `${JSON.stringify(obj, null, 2)}\n`);
}
