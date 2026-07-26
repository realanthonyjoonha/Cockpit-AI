// auth.js — optional login gate in front of the pure viewer. OPT-IN: the app is open until
// at least one user exists in .access.json (so an empty-env / no-config boot behaves exactly
// as before). Deviation from spec §2 "zero credentials" — added 2026-07-04 on Anthony's
// explicit request, to share the cockpit with friends without exposing the vault openly.
//
// Design: per-user password (scrypt-hashed, Node stdlib — no deps), signed HttpOnly session
// cookie (HMAC-SHA256 with a locally-generated secret). Read-only app; login is the only POST.
// NOTE: behind Tailscale Serve every request originates from 127.0.0.1, so there is NO
// loopback bypass — that would let all remote traffic through. Everyone authenticates.
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';

const DIR = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const ACCESS_FILE = process.env.COCKPIT_ACCESS_FILE || path.join(DIR, '.access.json');
const SECRET_FILE = path.join(DIR, '.session-secret');
const COOKIE = 'mc_session';
const SESSION_DAYS = 30;

// ---- credential store ----
export function loadUsers() {
  try {
    const j = JSON.parse(fs.readFileSync(ACCESS_FILE, 'utf8'));
    return j.users && typeof j.users === 'object' ? j.users : {};
  } catch { return {}; }
}
export function saveUsers(users) {
  const tmp = ACCESS_FILE + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify({ users }, null, 2), { mode: 0o600 });
  fs.renameSync(tmp, ACCESS_FILE);
  try { fs.chmodSync(ACCESS_FILE, 0o600); } catch { /* best effort */ }
}
export function authEnabled() { return Object.keys(loadUsers()).length > 0; }

// ---- password hashing (scrypt) ----
export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(password, salt, 64).toString('hex');
  return { salt, hash };
}
export function verifyPassword(password, rec) {
  if (!rec?.salt || !rec?.hash) return false;
  const h = crypto.scryptSync(password, rec.salt, 64).toString('hex');
  const a = Buffer.from(h, 'hex'), b = Buffer.from(rec.hash, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

// ---- session secret (persisted so sessions survive restarts) ----
function secret() {
  try { return fs.readFileSync(SECRET_FILE); } catch { /* create below */ }
  const s = crypto.randomBytes(32);
  fs.writeFileSync(SECRET_FILE, s, { mode: 0o600 });
  return s;
}
const SECRET = secret();
const b64url = (buf) => Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const fromB64url = (s) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');

function sign(username) {
  const payload = b64url(JSON.stringify({ u: username, exp: Date.now() + SESSION_DAYS * 864e5 }));
  const mac = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  return `${payload}.${mac}`;
}
function verify(token) {
  if (!token || !token.includes('.')) return null;
  const [payload, mac] = token.split('.');
  const expected = b64url(crypto.createHmac('sha256', SECRET).update(payload).digest());
  const a = Buffer.from(mac), b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const { u, exp } = JSON.parse(fromB64url(payload).toString());
    if (!u || !exp || Date.now() > exp) return null;
    return u;
  } catch { return null; }
}

function readCookie(req) {
  const raw = req.headers.cookie;
  if (!raw) return null;
  for (const part of raw.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === COOKIE) return v.join('=');
  }
  return null;
}
function setCookie(res, token) {
  res.setHeader('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_DAYS * 86400}`);
}
function clearCookie(res) {
  res.setHeader('Set-Cookie', `${COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`);
}

// ---- login page (self-contained; no external assets so the strict CSP is happy) ----
const LOGIN_HTML = (err) => `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>MEMORY/DRAM — sign in</title>
<style>
  html,body{margin:0;height:100%;background:#0E1014;color:#E7EAF1;
    font-family:-apple-system,BlinkMacSystemFont,"Helvetica Neue",Arial,sans-serif;
    display:flex;align-items:center;justify-content:center}
  .box{width:320px;max-width:88vw;background:#151922;border:1px solid #232937;border-radius:11px;padding:26px 24px}
  .brand{display:flex;align-items:center;gap:9px;font:700 13px ui-monospace,Menlo,monospace;letter-spacing:.05em;margin-bottom:18px}
  .mark{width:20px;height:20px;border-radius:6px;background:linear-gradient(135deg,#7B87E8,#4A54B8);
    display:flex;align-items:center;justify-content:center;font-size:10px;color:#fff}
  label{display:block;font-size:9px;letter-spacing:.08em;text-transform:uppercase;color:#939DB0;margin:12px 0 4px}
  input{width:100%;box-sizing:border-box;background:#12151C;border:1px solid #272E3B;border-radius:8px;
    color:#E7EAF1;padding:9px 11px;font-size:13px;outline:none}
  input:focus{border-color:#7B87E8}
  button{width:100%;margin-top:18px;background:#1E2430;border:1px solid #2E374A;color:#AEB7E8;
    border-radius:8px;padding:10px;font:700 12px ui-monospace,Menlo,monospace;letter-spacing:.08em;cursor:pointer}
  button:hover{border-color:#7B87E8}
  .err{color:#EF7480;font-size:11px;margin-top:12px;min-height:14px}
  .foot{color:#7C8698;font-size:10px;margin-top:16px;line-height:1.5}
</style></head><body>
<form class="box" method="POST" action="/api/login">
  <div class="brand"><span class="mark">M</span> MEMORY/DRAM · MC-2026-B</div>
  <label for="u">Username</label><input id="u" name="username" autocomplete="username" autofocus>
  <label for="p">Password</label><input id="p" name="password" type="password" autocomplete="current-password">
  <button type="submit">SIGN IN</button>
  <div class="err">${err ? String(err).replace(/[<>&]/g, '') : ''}</div>
  <div class="foot">Private research terminal · local + Tailscale only.</div>
</form>
<script>
  // progressive enhancement: submit via fetch for a clean inline error, fall back to form POST
  document.querySelector('form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const f = e.target, err = f.querySelector('.err');
    err.textContent = '';
    try {
      const r = await fetch('/api/login', { method:'POST', headers:{'Content-Type':'application/json'},
        body: JSON.stringify({ username: f.username.value, password: f.password.value }) });
      if (r.ok) { location.href = '/'; }
      else { err.textContent = (await r.json().catch(()=>({}))).error || 'Incorrect username or password.'; }
    } catch { f.removeEventListener('submit', ()=>{}); f.submit(); }
  });
</script></body></html>`;

// ---- middleware + route handlers ----
export function gate(req, res, next) {
  const users = loadUsers();
  if (Object.keys(users).length === 0) return next();      // opt-in: no users → app is open
  if (req.method === 'POST' && req.path === '/api/login') return next();
  if (req.path === '/api/logout') return next();
  const user = verify(readCookie(req));
  // a session is only as alive as its user: removing someone via set-access.js --remove
  // must cut off their existing cookie immediately, not in 30 days
  if (user && users[user]) { req.user = user; return next(); }
  if (req.path.startsWith('/api/')) return res.status(401).json({ error: 'not signed in' });
  res.status(200).type('html').send(LOGIN_HTML());          // any page → login screen
}

// brute-force throttle — matters once Funnel exposes login to the public internet (the
// Funnel hostname is discoverable via Cert Transparency logs). Per-username, in-memory,
// exponential backoff. Locks are short so a fumbling real user isn't stuck long, but 6
// tries per lock window makes automated guessing infeasible (scrypt is slow on top).
const attempts = new Map(); // username -> { fails, lockUntil }
const FAIL_THRESHOLD = 6;
const BASE_LOCK_MS = 10_000;
function throttleSeconds(username) {
  const rec = attempts.get(username);
  if (rec && rec.lockUntil > Date.now()) return Math.ceil((rec.lockUntil - Date.now()) / 1000);
  return 0;
}
function noteFail(username) {
  const rec = attempts.get(username) || { fails: 0, lockUntil: 0 };
  rec.fails++;
  if (rec.fails >= FAIL_THRESHOLD) rec.lockUntil = Date.now() + BASE_LOCK_MS * 2 ** Math.min(rec.fails - FAIL_THRESHOLD, 6); // 10s→…→~10m cap
  attempts.set(username, rec);
}

export function handleLogin(req, res) {
  const username = String((req.body || {}).username || '').trim();
  const password = String((req.body || {}).password || '');
  const wait = throttleSeconds(username);
  if (wait) return res.status(429).json({ error: `Too many attempts — wait ${wait}s and try again.` });
  const rec = loadUsers()[username];
  if (rec && verifyPassword(password, rec)) {
    attempts.delete(username);
    setCookie(res, sign(username));
    return res.json({ ok: true });
  }
  noteFail(username);
  res.status(401).json({ error: 'Incorrect username or password.' });
}
export function handleLogout(req, res) { clearCookie(res); res.json({ ok: true }); }
