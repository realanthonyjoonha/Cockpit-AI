#!/usr/bin/env node
/**
 * Reports IN FLIGHT must CANCEL the listed run_id and OPEN GROK that same id.
 * Filings already had Cancel. Complete Open Grok must not share a bare openChat().
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = fs.readFileSync(path.join(ROOT, 'src/pages/thin/Reports.jsx'), 'utf8');

let fail = 0;
const ok = (m) => console.log('  ✓', m);
const bad = (m) => { fail += 1; console.log('  ✗', m); };

if (/cancelRun/.test(src) && /CANCEL/.test(src)) ok('Reports has CANCEL');
else bad('Reports missing CANCEL');

if (/onClick=\{\(\) => cancelRun\(inflight\.run_id\)\}/.test(src)) ok('IN FLIGHT CANCEL uses inflight.run_id');
else bad('IN FLIGHT CANCEL not bound to inflight.run_id');

if (/onClick=\{\(\) => openChat\(inflight\.run_id\)\}/.test(src)) ok('IN FLIGHT OPEN GROK uses inflight.run_id');
else bad('IN FLIGHT OPEN GROK not bound to inflight.run_id');

if (/onClick=\{\(\) => openChat\(hero\.run_id\)\}/.test(src)) ok('hero Open Grok uses hero.run_id');
else bad('hero Open Grok not bound to hero.run_id');

if (/onClick=\{openChat\}/.test(src)) bad('bare openChat() still shared (wrong run)');
else ok('no bare openChat()');

if (/cancelled by user from Reports/.test(src)) ok('cancel reason is Reports');
else bad('cancel reason missing');

if (/research\/runs\/\$\{encodeURIComponent\(rid\)\}\/cancel/.test(src)
  || /research\/runs\/\$\{encodeURIComponent\(rid\)\}`\/cancel/.test(src)
  || /\/cancel`/.test(src)) ok('posts cancel API');
else bad('cancel API path missing');

const grok = fs.readFileSync(path.join(ROOT, 'server/openGrok.js'), 'utf8');
if (/tty > .*terminal\.tty/.test(grok)) ok('OPEN GROK records terminal.tty');
else bad('OPEN GROK missing terminal.tty');
const worker = fs.readFileSync(path.join(ROOT, 'server/researchRunsWorker.js'), 'utf8');
if (/close w saving no/.test(worker) && /terminal\.tty/.test(worker)) ok('cancel closes Terminal tab by tty');
else bad('cancel missing Terminal tty close');

if (fail) {
  console.log(`\nreports-inflight-ui-test FAIL ${fail}`);
  process.exit(1);
}
console.log('\nreports-inflight-ui-test OK');
