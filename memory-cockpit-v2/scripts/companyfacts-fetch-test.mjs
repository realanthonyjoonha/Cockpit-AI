#!/usr/bin/env node
/** Mocked HTTP for companyfacts desk add/refresh. No real network. */
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import {
  COMPANYFACTS_URL,
  TICKERS_URL,
  refreshDeskCompanyfacts,
} from '../server/companyfactsFetch.js';
import { readFileSync as read } from 'fs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let fail = 0;
function ok(m) { console.log('  ✓', m); }
function bad(m) { console.log('  ✗', m); fail += 1; }

const TICKER_MAP = { 0: { cik_str: 320193, ticker: 'AAPL', title: 'Apple Inc.' } };
const FACTS_DOC = { cik: 320193, entityName: 'Apple Inc.', facts: { 'us-gaap': {} } };

function mockGet(routes) {
  const calls = [];
  const fn = async (url) => {
    calls.push(url);
    const item = routes[url];
    if (!item) return { status: 404, body: Buffer.from('{}') };
    if (Array.isArray(item)) {
      const next = item.shift();
      return next || { status: 404, body: Buffer.from('{}') };
    }
    return item;
  };
  fn.calls = calls;
  return fn;
}

function wiki() {
  return mkdtempSync(path.join(os.tmpdir(), 'cf-fetch-'));
}

{
  const dir = wiki();
  const get = mockGet({
    [TICKERS_URL]: { status: 200, body: Buffer.from(JSON.stringify(TICKER_MAP)) },
    [COMPANYFACTS_URL.replace('{cik}', '0000320193')]: { status: 200, body: Buffer.from(JSON.stringify(FACTS_DOC)) },
  });
  const out = await refreshDeskCompanyfacts({
    ticker: 'AAPL',
    slug: 'aapl',
    wikiRoot: dir,
    fetchImpl: get,
    sleep: async () => {},
    userAgent: 'Cockpit-AI test@example.com',
  });
  if (out.ok && existsSync(out.path) && JSON.parse(readFileSync(out.path, 'utf8')).cik === 320193) {
    ok('JS mocked fetch writes the desk cache');
  } else bad(`JS write ${JSON.stringify(out)}`);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = wiki();
  const get = mockGet({});
  const out = await refreshDeskCompanyfacts({
    ticker: 'AAPL',
    wikiRoot: dir,
    fetchImpl: get,
    sleep: async () => {},
    userAgent: 'no-contact',
  });
  if (!out.ok && /contact info/.test(out.gap) && get.calls.length === 0 && !existsSync(out.path)) {
    ok('JS missing contact UA is a gap and does not network');
  } else bad(`JS UA ${JSON.stringify(out)} calls=${get.calls.length}`);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = wiki();
  const get = mockGet({ [TICKERS_URL]: { status: 200, body: Buffer.from(JSON.stringify(TICKER_MAP)) } });
  const out = await refreshDeskCompanyfacts({
    ticker: 'ZZZZ',
    wikiRoot: dir,
    fetchImpl: get,
    sleep: async () => {},
    userAgent: 'Cockpit-AI test@example.com',
  });
  if (!out.ok && /not in SEC universe map/.test(out.gap) && !existsSync(out.path)) {
    ok('JS unknown ticker is a gap');
  } else bad(`JS unknown ${JSON.stringify(out)}`);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = wiki();
  const url = COMPANYFACTS_URL.replace('{cik}', '0000320193');
  const get = mockGet({ [url]: { status: 403, body: Buffer.from('no') } });
  const out = await refreshDeskCompanyfacts({
    ticker: 'AAPL',
    cik: '320193',
    wikiRoot: dir,
    fetchImpl: get,
    sleep: async () => {},
    userAgent: 'Cockpit-AI test@example.com',
  });
  if (!out.ok && out.gap === 'companyfacts fetch failed: HTTP 403' && !existsSync(out.path)) {
    ok('JS HTTP 403 is a gap and does not write cache');
  } else bad(`JS 403 ${JSON.stringify(out)}`);
  rmSync(dir, { recursive: true, force: true });
}

{
  const dir = wiki();
  const url = COMPANYFACTS_URL.replace('{cik}', '0000320193');
  const get = mockGet({
    [url]: [
      { status: 429, body: Buffer.from('') },
      { status: 200, body: Buffer.from(JSON.stringify(FACTS_DOC)) },
    ],
  });
  const out = await refreshDeskCompanyfacts({
    ticker: 'AAPL',
    cik: '320193',
    wikiRoot: dir,
    fetchImpl: get,
    sleep: async () => {},
    userAgent: 'Cockpit-AI test@example.com',
  });
  const hits = get.calls.filter((u) => u === url).length;
  if (out.ok && hits === 2) ok('JS 429 retries once then writes');
  else bad(`JS retry ok=${out.ok} hits=${hits}`);
  rmSync(dir, { recursive: true, force: true });
}

{
  const parseSrc = read(path.join(ROOT, 'server/companyfacts.js'), 'utf8');
  const packSrc = read(path.join(ROOT, 'server/contextpack.js'), 'utf8');
  if (!parseSrc.includes('companyfactsFetch') && !parseSrc.includes('https://data.sec.gov')
    && !packSrc.includes('companyfactsFetch')) {
    ok('JS parser and contextpack stay offline');
  } else bad('JS parser imported fetch');
}

{
  const sec = read(path.join(ROOT, 'server/secEdgar.js'), 'utf8');
  const mount = read(path.join(ROOT, 'server/thinDeskMount.js'), 'utf8');
  const scaffold = read(path.join(ROOT, '../scripts/scaffold-new-desk.sh'), 'utf8');
  if (sec.includes('refreshDeskCompanyfacts') && /force/.test(sec)
    && mount.includes('slug: rt.desk.slug')
    && scaffold.includes('facts-fetch')) {
    ok('desk add and pipeline refresh call the fetch step');
  } else bad('hooks missing');
}

console.log(fail ? `\n${fail} failed` : '\ncompanyfacts-fetch JS OK');
process.exit(fail ? 1 : 0);
