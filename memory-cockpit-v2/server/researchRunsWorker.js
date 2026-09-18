// researchRunsWorker.js — spawn / pid / heartbeat / kill for research pipeline.
// Decision-support only. Does not write house/risks/pack. Pid on run meta via patchRunMeta.
import { spawn, spawnSync } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { isThesisReportJob, isInteractiveResearchJob } from './researchRunsSchema.js';

export const HEARTBEAT_STALE_MS = 5 * 60 * 1000;
export const PID_DEAD_GRACE_MS = 15 * 1000;
export const ORPHAN_FAIL_MS = 15 * 60 * 1000;
export const LOG_RECENT_MS = 20 * 1000;

/** Tickers currently inside spawnResearchWorker (sync section). */
const spawnInProgress = new Set();

export function pidAlive(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return false;
  try {
    process.kill(n, 0);
    return true;
  } catch {
    return false;
  }
}

export function killProcessGroup(pid) {
  const n = Number(pid);
  if (!Number.isInteger(n) || n <= 0) return { ok: false, error: 'no pid' };
  try {
    try { process.kill(-n, 'SIGTERM'); } catch { process.kill(n, 'SIGTERM'); }
  } catch (e) {
    try { process.kill(n, 'SIGTERM'); } catch { /* */ }
  }
  // Grok TUI often ignores SIGTERM — escalate.
  try { process.kill(-n, 'SIGKILL'); } catch { /* */ }
  try { process.kill(n, 'SIGKILL'); } catch { /* already dead */ }
  return { ok: true, pid: n };
}

/**
 * Kill processes whose command line contains a unique run_id (interactive
 * Terminal grok has no worker.pid). Never touches Grok Bot.app or this process.
 */
export function killProcessesMatching(needle) {
  return reapResearchRunProcesses({ runId: needle });
}

function parsePsTable(stdout) {
  const rows = [];
  for (const line of String(stdout || '').split('\n')) {
    const m = line.trim().match(/^(\d+)\s+(\d+)\s+(.*)$/);
    if (!m) continue;
    rows.push({
      pid: parseInt(m[1], 10),
      ppid: parseInt(m[2], 10),
      cmd: m[3] || '',
    });
  }
  return rows;
}

/** Linux: /proc so CANCEL works in slim Docker (no BSD `ps -o command=`). */
function listFromProc() {
  const proc = '/proc';
  if (!fs.existsSync(path.join(proc, 'self'))) return [];
  let ents;
  try { ents = fs.readdirSync(proc); } catch { return []; }
  const rows = [];
  for (const name of ents) {
    if (!/^\d+$/.test(name)) continue;
    const pid = parseInt(name, 10);
    if (!Number.isInteger(pid) || pid <= 0) continue;
    let ppid = 0;
    try {
      const stat = fs.readFileSync(path.join(proc, name, 'stat'), 'utf8');
      const rparen = stat.lastIndexOf(')');
      const rest = rparen >= 0 ? stat.slice(rparen + 1).trim().split(/\s+/) : [];
      ppid = parseInt(rest[1], 10) || 0;
    } catch { continue; }
    let cmd = '';
    try {
      cmd = fs.readFileSync(path.join(proc, name, 'cmdline'), 'utf8').replace(/\0/g, ' ').trim();
    } catch { cmd = ''; }
    if (!cmd) {
      try { cmd = fs.readFileSync(path.join(proc, name, 'comm'), 'utf8').trim(); } catch { cmd = ''; }
    }
    rows.push({ pid, ppid, cmd });
  }
  return rows;
}

function listProcessTable() {
  const fromProc = listFromProc();
  if (fromProc.length) return fromProc;
  const attempts = [
    ['-axww', '-o', 'pid=,ppid=,command='],
    ['-axww', '-o', 'pid=,ppid=,args='],
    ['-ax', '-o', 'pid=,ppid=,command='],
    ['-ax', '-o', 'pid=,ppid=,args='],
  ];
  for (const args of attempts) {
    const r = spawnSync('ps', args, { encoding: 'utf8' });
    if (r.status !== 0) continue;
    const rows = parsePsTable(r.stdout);
    if (rows.length) return rows;
  }
  return [];
}

function isProtectedPid(row) {
  if (!row || !Number.isInteger(row.pid) || row.pid <= 1) return true;
  if (row.pid === process.pid || row.pid === process.ppid) return true;
  const cmd = row.cmd || '';
  if (/Grok Bot\.app/i.test(cmd)) return true;
  if (/cockpit-kernel-glass/i.test(cmd)) return true;
  if (/memory-cockpit-v2\/server\/index\.js/.test(cmd)) return true;
  return false;
}

function closeTerminalTabs(opts = {}) {
  if (process.platform !== 'darwin') return { ok: false, reason: 'not darwin' };
  const ttys = [...new Set((opts.ttys || []).map((t) => String(t || '').trim()).filter(Boolean))];
  const names = [...new Set((opts.windowNames || []).map((t) => String(t || '').trim()).filter((t) => t.length >= 8))];
  if (!ttys.length && !names.length) return { ok: true, closed: 0, reason: 'no tty' };
  const ttyList = ttys.map((t) => JSON.stringify(t)).join(', ');
  const nameList = names.map((t) => JSON.stringify(t)).join(', ');
  const script = `
tell application "System Events"
  if not (exists process "Terminal") then return
end tell
tell application "Terminal"
  set ttyWanted to {${ttyList || ''}}
  set nameWanted to {${nameList || ''}}
  set closable to {}
  repeat with w in windows
    try
      set n to name of w as string
      set matchName to false
      if (count of nameWanted) > 0 then
        repeat with needle in nameWanted
          if n contains (needle as string) then set matchName to true
        end repeat
      end if
      set matchTty to false
      if (count of ttyWanted) > 0 then
        try
          set tt to (tty of selected tab of w) as string
          repeat with wanted in ttyWanted
            if tt is equal to (wanted as string) then set matchTty to true
          end repeat
        end try
      end if
      if matchTty or matchName then set end of closable to w
    end try
  end repeat
  repeat with w in closable
    try
      close w saving no
    end try
  end repeat
end tell`;
  const r = spawnSync('osascript', ['-e', script], { encoding: 'utf8', timeout: 8000 });
  return { ok: r.status === 0, status: r.status, ttys, stderr: (r.stderr || '').slice(0, 200) };
}

/**
 * Kill Grok + descendants + anything whose argv points at this run folder.
 * Does not kill glass, Grok Bot.app, or other desks' grok sessions.
 */
export function reapResearchRunProcesses(opts = {}) {
  const token = String(opts.runId || opts.needle || '');
  if (token.length < 12 || !/^[A-Za-z0-9._-]+$/.test(token)) {
    return { ok: false, killed: [], error: 'needle too short or invalid' };
  }
  const dir = opts.runDir ? String(opts.runDir).replace(/\/$/, '') : '';
  const shortDir = dir.includes('/research/')
    ? dir.slice(dir.indexOf('/research/'))
    : '';
  const extra = Array.isArray(opts.extraPids) ? opts.extraPids : [];
  const table = listProcessTable();
  const roots = new Set();
  for (const p of extra) {
    const n = Number(p);
    if (Number.isInteger(n) && n > 1) roots.add(n);
  }
  for (const row of table) {
    if (isProtectedPid(row)) continue;
    if (row.cmd.includes(token)) { roots.add(row.pid); continue; }
    if (dir && row.cmd.includes(dir)) { roots.add(row.pid); continue; }
    if (shortDir && row.cmd.includes(shortDir)) roots.add(row.pid);
  }
  const killSet = new Set(roots);
  let grew = true;
  while (grew) {
    grew = false;
    for (const row of table) {
      if (isProtectedPid(row)) continue;
      if (killSet.has(row.ppid) && !killSet.has(row.pid)) {
        killSet.add(row.pid);
        grew = true;
      }
    }
  }
  const killed = [];
  for (const pid of killSet) {
    const row = table.find((r) => r.pid === pid);
    if (row && isProtectedPid(row)) continue;
    killProcessGroup(pid);
    killed.push(pid);
  }
  const ttys = [];
  if (dir) {
    try {
      const ttyPath = path.join(dir, 'terminal.tty');
      if (fs.existsSync(ttyPath)) {
        const t = String(fs.readFileSync(ttyPath, 'utf8')).trim();
        if (t) ttys.push(t);
      }
    } catch { /* */ }
  }
  let closed = null;
  try {
    closed = closeTerminalTabs({ ttys });
  } catch { closed = { ok: false }; }
  const leftover = [];
  for (const row of listProcessTable()) {
    if (isProtectedPid(row)) continue;
    if (row.cmd.includes(token) || (dir && row.cmd.includes(dir)) || (shortDir && row.cmd.includes(shortDir))) {
      leftover.push(row.pid);
    }
  }
  for (const pid of leftover) {
    if (killed.includes(pid)) continue;
    killProcessGroup(pid);
    killed.push(pid);
  }
  return {
    ok: true,
    killed,
    needle: token,
    terminal_close: closed,
  };
}

export function logMtimeMs(logPath) {
  if (!logPath) return null;
  try {
    return fs.statSync(logPath).mtimeMs;
  } catch {
    return null;
  }
}

export function readLogTail(logPath, maxBytes = 8192) {
  if (!logPath) return null;
  try {
    if (!fs.existsSync(logPath)) return null;
    const st = fs.statSync(logPath);
    const size = st.size;
    const start = Math.max(0, size - maxBytes);
    const fd = fs.openSync(logPath, 'r');
    const buf = Buffer.alloc(size - start);
    fs.readSync(fd, buf, 0, buf.length, start);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return null;
  }
}

export function heartbeatAgeMs(meta, now = Date.now()) {
  const worker = meta?.worker || {};
  const hb = worker.heartbeat_at ? Date.parse(worker.heartbeat_at) : NaN;
  const logMs = logMtimeMs(worker.log);
  const last = Math.max(
    Number.isFinite(hb) ? hb : 0,
    Number.isFinite(logMs) ? logMs : 0,
  );
  if (!last) {
    const started = meta?.started_at ? Date.parse(meta.started_at) : NaN;
    if (!Number.isFinite(started)) return null;
    return now - started;
  }
  return now - last;
}

export function stalledOverlay(meta, now = Date.now()) {
  const st = meta?.status;
  if (st !== 'running' && st !== 'queued') return false;
  // Thesis lane is interactive OPEN GROK — no headless pid/heartbeat.
  if (isInteractiveResearchJob(meta?.job) && !(meta?.worker?.pid)) return false;
  const age = heartbeatAgeMs(meta, now);
  if (age == null) return false;
  return age > HEARTBEAT_STALE_MS;
}

function tickerId(ticker) {
  return String(ticker || '').toUpperCase().replace(/[^A-Z0-9.-]/g, '');
}

function resolveGrokBin() {
  if (process.env.GROK_BIN && fs.existsSync(process.env.GROK_BIN)) {
    return process.env.GROK_BIN;
  }
  const home = path.join(os.homedir(), '.grok', 'bin', 'grok');
  if (fs.existsSync(home)) return home;
  return 'grok';
}

/**
 * Should this desk/run refuse a new grok spawn?
 * @returns {{ refuse: boolean, already_in_flight?: boolean, run_id?: string, pid?: number, reason?: string }}
 */
export function spawnRefuseReason(ticker, runId, deps) {
  const id = tickerId(ticker);
  if (spawnInProgress.has(id)) {
    return { refuse: true, already_in_flight: true, reason: 'spawn in progress', run_id: runId || null };
  }
  const inflight = deps.findInFlightRun(id, { lane: 'compile' });
  if (!inflight) return { refuse: false };
  const pid = inflight.worker?.pid;
  const live = pidAlive(pid);
  if (runId && inflight.run_id !== runId) {
    return {
      refuse: true,
      already_in_flight: true,
      run_id: inflight.run_id,
      pid: live ? pid : null,
      reason: 'desk already has an in-flight run',
    };
  }
  if (live) {
    return {
      refuse: true,
      already_in_flight: true,
      run_id: inflight.run_id,
      pid,
      reason: 'worker pid still alive',
    };
  }
  return { refuse: false, run_id: inflight.run_id };
}

/**
 * Spawn headless grok for a research pipeline run. Canonical artifacts in the run folder.
 * @param {object} opts
 */
export function spawnResearchWorker(opts = {}) {
  const deps = opts.deps;
  if (!deps?.findInFlightRun || !deps.attachWorker || !deps.researchRunDir) {
    return { ok: false, error: 'spawnResearchWorker missing deps' };
  }
  const ticker = tickerId(opts.ticker);
  const runId = String(opts.run_id || opts.runId || '').replace(/[^A-Za-z0-9._-]/g, '');
  if (!ticker || !runId) return { ok: false, error: 'ticker and run_id required' };

  const refuse = spawnRefuseReason(ticker, runId, deps);
  if (refuse.refuse) {
    return {
      ok: true,
      already_in_flight: true,
      run_id: refuse.run_id,
      pid: refuse.pid || null,
      reason: refuse.reason,
      decision_support_only: true,
    };
  }

  const dir = deps.researchRunDir(ticker, runId);
  if (!dir) return { ok: false, error: 'invalid run dir' };
  fs.mkdirSync(dir, { recursive: true });

  const promptPath = path.join(dir, 'launch-prompt.txt');
  const logPath = path.join(dir, 'worker.log');
  const seedPath = opts.seed_path || path.join(dir, 'seed.md');
  const prompt = String(opts.prompt || '');
  try {
    fs.writeFileSync(promptPath, prompt, 'utf8');
    fs.appendFileSync(logPath, `\n===== pipeline launch ${new Date().toISOString()} · run ${runId} =====\n`, 'utf8');
  } catch (e) {
    return { ok: false, error: `could not write run artifacts: ${e.message || e}` };
  }

  const grok = opts.grok || resolveGrokBin();
  const repo = opts.repo || process.env.COCKPIT_REPO || process.cwd();
  const alwaysApprove = opts.alwaysApprove !== false
    && process.env.COCKPIT_RESEARCH_ALWAYS_APPROVE !== '0';
  const args = ['--prompt-file', promptPath];
  if (alwaysApprove) args.push('--always-approve');

  spawnInProgress.add(ticker);
  try {
    let child;
    if (typeof opts.spawnImpl === 'function') {
      child = opts.spawnImpl({ grok, args, cwd: repo, promptPath, logPath });
    } else {
      const logFd = fs.openSync(logPath, 'a');
      child = spawn(grok, args, {
        cwd: repo,
        detached: true,
        stdio: ['ignore', logFd, logFd],
      });
      child.unref();
      fs.closeSync(logFd);
    }
    const pid = child?.pid;
    if (!pid) {
      return { ok: false, error: 'spawn produced no pid' };
    }
    const attached = deps.attachWorker(ticker, runId, {
      pid,
      log: logPath,
      prompt: promptPath,
      seed: seedPath,
    });
    if (!attached?.ok) {
      try { killProcessGroup(pid); } catch { /* */ }
      return { ok: false, error: attached?.error || 'attachWorker failed', pid };
    }
    if (!opts.spawnImpl) {
      openLogTailTerminal(logPath, pid, runId);
    }
    return {
      ok: true,
      already_in_flight: false,
      pid,
      log: logPath,
      prompt_file: promptPath,
      seed: seedPath,
      run_id: runId,
      ticker,
      decision_support_only: true,
    };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  } finally {
    spawnInProgress.delete(ticker);
  }
}

/**
 * Reconcile one in-flight run. Auto-fails dead/reused pids. Never writes extracts.
 * @returns {{ stalled: boolean, failed?: boolean, meta: object }}
 */
export function reconcileRun(ticker, meta, deps, now = Date.now()) {
  if (!meta || (meta.status !== 'running' && meta.status !== 'queued')) {
    return { stalled: false, meta };
  }
  const worker = meta.worker || {};
  const pid = worker.pid;
  const alive = pidAlive(pid);
  const logPath = worker.log;
  const logMs = logMtimeMs(logPath);
  const logRecent = Number.isFinite(logMs) && (now - logMs) < LOG_RECENT_MS;
  const age = heartbeatAgeMs(meta, now);

  // Wrapper exited but child still writing the log — do not fail.
  if (!alive && logRecent) {
    return { stalled: stalledOverlay(meta, now), meta };
  }

  if (!alive && pid) {
    const deadSince = worker.pid_dead_since ? Date.parse(worker.pid_dead_since) : null;
    if (!Number.isFinite(deadSince)) {
      const patched = deps.patchRunMeta(ticker, meta.run_id, (m) => ({
        ...m,
        worker: { ...(m.worker || {}), pid_dead_since: new Date(now).toISOString() },
      }), { allowFailed: false });
      return { stalled: true, meta: patched.meta || meta };
    }
    if (now - deadSince > PID_DEAD_GRACE_MS && !logRecent) {
      const failed = deps.failResearchRun(ticker, meta.run_id, 'worker pid dead — auto-failed (no heartbeat/log)');
      return { stalled: false, failed: true, meta: { ...meta, status: 'failed', error: failed.error || 'worker pid dead' } };
    }
    return { stalled: true, meta };
  }

  if (!pid) {
    // Interactive thesis_report / model_read stay queued with worker: null by design.
    if (isInteractiveResearchJob(meta.job)) {
      return { stalled: false, meta };
    }
    const started = meta.started_at ? Date.parse(meta.started_at) : now;
    if (now - started > ORPHAN_FAIL_MS) {
      const failed = deps.failResearchRun(ticker, meta.run_id, 'queued/running with no pid — auto-failed orphan');
      return { stalled: false, failed: true, meta: { ...meta, status: 'failed' } };
    }
    return { stalled: stalledOverlay(meta, now), meta };
  }

  // pid reports alive
  if (age != null && age > ORPHAN_FAIL_MS) {
    const failed = deps.failResearchRun(
      ticker,
      meta.run_id,
      'pid alive but heartbeat+log cold — treated as pid-reuse; auto-failed to free desk',
    );
    return { stalled: false, failed: true, meta: { ...meta, status: 'failed' } };
  }

  return { stalled: stalledOverlay(meta, now), meta };
}

function shellQuote(s) {
  return `'${String(s).replace(/'/g, `'\\''`)}'`;
}

/** Best-effort live log tail in Terminal.app. Never fails the worker. */
export function openLogTailTerminal(logPath, pid, runId) {
  if (process.platform !== 'darwin' || !logPath) return { ok: false, skipped: true };
  const cmd = `clear; echo 'Grok pipeline HEADLESS (pid ${pid || '?'}) · run ${runId || ''} — live log. No typing needed.'; tail -n 40 -f ${shellQuote(logPath)}`;
  const script = `tell application "Terminal"
  activate
  do script ${JSON.stringify(cmd)}
end tell`;
  try {
    const child = spawn('osascript', ['-e', script], { detached: true, stdio: 'ignore' });
    child.unref();
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e.message || String(e) };
  }
}

export function spawnInProgressHas(ticker) {
  return spawnInProgress.has(tickerId(ticker));
}

export { resolveGrokBin };
