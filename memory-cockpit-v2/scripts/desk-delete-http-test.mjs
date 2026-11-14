#!/usr/bin/env node
/**
 * The glass button posts here. Fixture vault only. Nothing is archived.
 */
import express from 'express';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { deleteDeskBundle } from '../server/deleteDesk.js';

let pass = 0;
let fail = 0;
const ok = (m) => { pass += 1; console.log(`  ✓ ${m}`); };
const bad = (m) => { fail += 1; console.log(`  ✗ ${m}`); };

function desk(slug, ticker) {
  return {
    slug,
    ticker,
    house_file: `house-view-${slug}.md`,
    profile: {
      entitySlug: slug,
      rawDir: `raw/${slug}-research`,
      houseTitleDefault: ticker,
    },
  };
}

function write(file, text) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, text);
}

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'desk-delete-http-'));
const vault = path.join(root, 'vault');
const ont = path.join(root, 'ont');
const store = path.join(ont, 'store', 'by_ticker');
const registryPath = path.join(root, 'thin-desks.json');
fs.mkdirSync(store, { recursive: true });
write(path.join(vault, 'house-view-zz.md'), 'zz\n');
write(path.join(vault, 'house-view-yy.md'), 'yy\n');
write(path.join(vault, 'wiki', 'sources', 'zz-extra.md'), 'extra\n');
write(path.join(ont, 'packs', 'ZZ.json'), '{"ticker":"ZZ","source_globs":[]}\n');
write(path.join(ont, 'packs', 'YY.json'), '{"ticker":"YY","source_globs":[]}\n');
write(registryPath, `${JSON.stringify({ desks: [desk('zz', 'ZZ'), desk('yy', 'YY')] }, null, 2)}\n`);

const app = express();
app.use(express.json());
app.post('/api/:slug/desk/delete', (req, res) => {
  try {
    const out = deleteDeskBundle({
      registryPath,
      slug: req.params.slug,
      confirm: (req.body || {}).confirm,
      vaultRoot: vault,
      ontRoot: ont,
      storeDir: store,
    });
    res.json(out);
  } catch (e) {
    const status = Number(e.status) >= 400 && Number(e.status) < 600 ? e.status : 500;
    res.status(status).json({ ok: false, error: e.message, code: e.code || '' });
  }
});

const server = await new Promise((resolve) => {
  const http = app.listen(0, '127.0.0.1', () => resolve(http));
});
const port = server.address().port;

try {
  const wrong = await fetch(`http://127.0.0.1:${port}/api/zz/desk/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'NOPE' }),
  });
  const wrongBody = await wrong.json();
  if (wrong.status === 400 && wrongBody.code === 'desk_delete_confirm'
    && fs.readFileSync(path.join(vault, 'house-view-zz.md'), 'utf8') === 'zz\n') {
    ok('a wrong ticker on the button route deletes nothing');
  } else bad(`wrong ticker changed the book: ${wrong.status} ${wrongBody.code}`);

  const gone = await fetch(`http://127.0.0.1:${port}/api/zz/desk/delete`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'ZZ' }),
  });
  const goneBody = await gone.json();
  const desks = JSON.parse(fs.readFileSync(registryPath, 'utf8')).desks.map((d) => d.slug);
  if (gone.status === 200 && goneBody.ok && goneBody.registry_removed
    && !fs.existsSync(path.join(vault, 'house-view-zz.md'))
    && !fs.existsSync(path.join(vault, 'wiki', 'sources', 'zz-extra.md'))
    && !fs.existsSync(path.join(ont, 'packs', 'ZZ.json'))
    && fs.readFileSync(path.join(vault, 'house-view-yy.md'), 'utf8') === 'yy\n'
    && desks.length === 1 && desks[0] === 'yy'
    && !fs.existsSync(path.join(vault, 'cockpit', 'trash'))) {
    ok('the button route deletes the company and leaves the other one');
  } else bad(`button route drifted: ${gone.status} desks=${desks.join(',')}`);
} finally {
  await new Promise((resolve) => server.close(resolve));
  fs.rmSync(root, { recursive: true, force: true });
}

if (fail) {
  console.log(`\ndesk-delete-http FAIL ${fail}`);
  process.exit(1);
}
console.log(`\ndesk-delete-http OK ${pass}`);
