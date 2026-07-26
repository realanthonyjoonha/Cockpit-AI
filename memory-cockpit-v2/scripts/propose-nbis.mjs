#!/usr/bin/env node
// propose-nbis.mjs — queue a NBIS pin without browser auth (agents / local CLI).
// Does NOT accept, compile, or write house view.
//
//   node scripts/propose-nbis.mjs --kind claim --text "…" --as-of 2026-07-20 --grade C --source slug
//   node scripts/propose-nbis.mjs --kind risk_note --text "…"
//   node scripts/propose-nbis.mjs --kind claim ... --rationale "why"
//
// Then Anthony: NEBIUS → Update → ACCEPT/REJECT → ./ont compile NBIS → REFRESH BOOK
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function usage() {
  console.error(`Usage:
  node scripts/propose-nbis.mjs --kind claim --text "…" --as-of YYYY-MM-DD --grade A|B|C --source slug [--rationale "…"]
  node scripts/propose-nbis.mjs --kind risk_note --text "…" [--rationale "…"]

Does not accept, compile, or edit house view. Decision-support only.`);
  process.exit(2);
}

function parseArgs(argv) {
  const out = {};
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--help' || a === '-h') usage();
    if (a.startsWith('--')) {
      const key = a.slice(2);
      const val = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
      out[key] = val;
    }
  }
  return out;
}

const args = parseArgs(process.argv);
const kind = String(args.kind || 'claim').toLowerCase();

if (!args.text || args.text === true) usage();

// Dynamic import of server module (uses vault paths from env/homedir)
const mod = await import(pathToFileURL(path.join(ROOT, 'server', 'nbisProposals.js')).href);

try {
  let body;
  if (kind === 'claim') {
    if (!args['as-of'] && !args.as_of) {
      console.error('claim requires --as-of YYYY-MM-DD');
      process.exit(2);
    }
    body = {
      kind: 'claim',
      text: String(args.text),
      as_of: String(args['as-of'] || args.as_of),
      grade: String(args.grade || 'C'),
      source_id: String(args.source || args.source_id || 'unsourced'),
      rationale: args.rationale && args.rationale !== true ? String(args.rationale) : undefined,
    };
  } else if (kind === 'risk_note') {
    body = {
      kind: 'risk_note',
      text: String(args.text),
      rationale: args.rationale && args.rationale !== true ? String(args.rationale) : undefined,
    };
  } else if (kind === 'house' || kind === 'house_view') {
    console.error('REFUSED: house view cannot be proposed — explicit save only.');
    process.exit(1);
  } else {
    console.error('kind must be claim or risk_note');
    process.exit(2);
  }

  const out = mod.createProposal(body, 'cli');
  const p = out.proposal;
  console.log(JSON.stringify({
    ok: true,
    id: p.id,
    kind: p.kind,
    status: p.status,
    next: [
      'Open glass → NEBIUS → House/Risks → ACCEPT or REJECT',
      'If accepted: COMPILE BOOK on glass (or cd ontology && ./ont compile NBIS)',
      'Then REFRESH BOOK on glass',
    ],
  }, null, 2));
} catch (e) {
  console.error(JSON.stringify({ ok: false, error: e.message }, null, 2));
  process.exit(1);
}
