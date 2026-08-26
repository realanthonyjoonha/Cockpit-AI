// researchAcquire.js — bounded fetch into a research run's acquired/ folder.
// GAP not hang. Never writes cockpit/compile/, never parses XBRL, never proposes.
// Decision-support only.
import dns from 'dns/promises';
import fs from 'fs';
import http from 'http';
import https from 'https';
import net from 'net';
import path from 'path';
import { URL } from 'url';

const MAX_BYTES = 8 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const MAX_HOPS = 5;
const UA = 'CockpitResearch/1.0 (decision-support research archive; not investment advice)';

export function safeFilename(hint, fallback = 'source.bin') {
  const base = path.basename(String(hint || fallback)).replace(/\\/g, '/');
  let name = base.replace(/[^A-Za-z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120);
  if (!name || name === '_' || name.includes('..')) name = fallback.replace(/[^A-Za-z0-9._-]/g, '_');
  if (!name) name = 'source.bin';
  return name;
}

function isPrivateIp(ip) {
  const x = String(ip || '');
  if (x === '::1' || x === '0.0.0.0') return true;
  if (x.startsWith('127.') || x === '127.0.0.1') return true;
  if (x.startsWith('10.')) return true;
  if (x.startsWith('192.168.')) return true;
  if (x.startsWith('169.254.')) return true;
  const m = /^172\.(\d+)\./.exec(x);
  if (m) {
    const n = Number(m[1]);
    if (n >= 16 && n <= 31) return true;
  }
  const buf = net.isIP(x);
  if (buf === 6) {
    const low = x.toLowerCase();
    if (low === '::1' || low.startsWith('fc') || low.startsWith('fd') || low.startsWith('fe80:')) return true;
  }
  return false;
}

function assertHttpUrl(raw) {
  let u;
  try { u = new URL(String(raw)); } catch {
    return { ok: false, gap: `invalid url: ${raw}` };
  }
  const proto = u.protocol.toLowerCase();
  if (proto !== 'http:' && proto !== 'https:') {
    return { ok: false, gap: `blocked scheme ${u.protocol}` };
  }
  return { ok: true, url: u };
}

async function assertResolvedPublic(hostname) {
  let addrs;
  try {
    addrs = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch (e) {
    return { ok: false, gap: `dns failed: ${e.message || e}` };
  }
  if (!addrs.length) return { ok: false, gap: 'dns returned no addresses' };
  for (const a of addrs) {
    if (isPrivateIp(a.address)) {
      return { ok: false, gap: `blocked private/link-local address ${a.address}` };
    }
  }
  return { ok: true, addrs };
}

function requestOnce(u, timeoutMs) {
  const lib = u.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const req = lib.request({
      protocol: u.protocol,
      hostname: u.hostname,
      port: u.port || undefined,
      path: `${u.pathname}${u.search}`,
      method: 'GET',
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml,application/pdf,application/json,text/plain,*/*',
      },
    }, (res) => {
      const chunks = [];
      let n = 0;
      res.on('data', (c) => {
        n += c.length;
        if (n > MAX_BYTES) {
          req.destroy();
          reject(new Error('response too large'));
          return;
        }
        chunks.push(c);
      });
      res.on('end', () => {
        resolve({
          status: res.statusCode || 0,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('timeout'));
    });
    req.on('error', reject);
    req.end();
  });
}

/**
 * Fetch url into {runDir}/acquired/{safe_filename}. Fail-closed SSRF.
 * @param {string} runDir
 * @param {{ url?: string, filename_hint?: string }} body
 */
export async function acquireUrlToRun(runDir, body = {}) {
  if (!runDir) return { ok: false, error: 'run dir required', gap: 'no run dir' };
  const checked = assertHttpUrl(body.url);
  if (!checked.ok) return { ok: false, error: checked.gap, gap: checked.gap };

  let current = checked.url;
  let hops = 0;
  let last;
  while (hops <= MAX_HOPS) {
    const dnsOk = await assertResolvedPublic(current.hostname);
    if (!dnsOk.ok) return { ok: false, error: dnsOk.gap, gap: dnsOk.gap };
    try {
      last = await requestOnce(current, TIMEOUT_MS);
    } catch (e) {
      const gap = `fetch failed: ${e.message || e}`;
      return { ok: false, error: gap, gap };
    }
    const code = last.status;
    if (code >= 300 && code < 400 && last.headers.location) {
      hops += 1;
      if (hops > MAX_HOPS) {
        return { ok: false, error: 'too many redirects', gap: 'too many redirects' };
      }
      try {
        current = new URL(String(last.headers.location), current);
      } catch {
        return { ok: false, error: 'bad redirect', gap: 'bad redirect location' };
      }
      const hopUrl = assertHttpUrl(current.href);
      if (!hopUrl.ok) return { ok: false, error: hopUrl.gap, gap: hopUrl.gap };
      current = hopUrl.url;
      continue;
    }
    break;
  }

  if (!last || last.status >= 400 || last.status < 200) {
    const gap = `HTTP ${last?.status || 0} for ${current.href}`;
    return { ok: false, error: gap, gap, status: last?.status || 0 };
  }

  const acquired = path.join(runDir, 'acquired');
  const resolvedAcquired = path.resolve(acquired);
  fs.mkdirSync(resolvedAcquired, { recursive: true });
  const name = safeFilename(body.filename_hint || path.basename(current.pathname) || 'source.bin');
  const dest = path.resolve(resolvedAcquired, name);
  if (!dest.startsWith(resolvedAcquired + path.sep) && dest !== resolvedAcquired) {
    return { ok: false, error: 'path escape', gap: 'filename escaped acquired/' };
  }
  // never write cockpit/compile
  if (dest.includes(`${path.sep}compile${path.sep}`) && dest.includes(`${path.sep}cockpit${path.sep}compile${path.sep}`)) {
    return { ok: false, error: 'refusing compile lane', gap: 'must not write cockpit/compile' };
  }
  fs.writeFileSync(dest, last.body);
  return {
    ok: true,
    path: dest,
    rel: `acquired/${name}`,
    filename: name,
    bytes: last.body.length,
    status: last.status,
    url: current.href,
    decision_support_only: true,
  };
}
