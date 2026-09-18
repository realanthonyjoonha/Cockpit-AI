#!/usr/bin/env node
/**
 * Only writer for GO in Grok. Same path as glass ACCEPT.
 * Does not enable kernel agent_accept.
 *
 *   node scripts/go-commit.mjs --slug tsla --kind house --proposal hp_xxx --utterance GO
 *   node scripts/go-commit.mjs --slug tsla --kind register --utterance GO
 */
import { goCommitHouse, goCommitRegister, isGoUtterance } from '../server/goCommit.js';

function parseArgs(argv) {
  const out = {
    slug: null,
    kind: 'house',
    proposal: null,
    utterance: 'GO',
    houseFile: null,
    risks: null,
    json: false,
    help: false,
    compile: true,
  };
  for (let i = 2; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--json') out.json = true;
    else if (a === '--no-compile') out.compile = false;
    else if (a === '--slug') out.slug = String(argv[++i] || '').toLowerCase();
    else if (a === '--kind') out.kind = String(argv[++i] || 'house').toLowerCase();
    else if (a === '--proposal' || a === '--proposal-id') out.proposal = String(argv[++i] || '');
    else if (a === '--utterance') out.utterance = String(argv[++i] || '');
    else if (a === '--house-file') out.houseFile = String(argv[++i] || '');
    else if (a === '--risks') out.risks = String(argv[++i] || '');
    else if (a === '-h' || a === '--help') out.help = true;
    else {
      console.error(`unknown arg: ${a}`);
      out.help = true;
    }
  }
  return out;
}

function main() {
  const args = parseArgs(process.argv);
  if (args.help || !args.slug) {
    console.log(`Usage:
  node scripts/go-commit.mjs --slug SLUG --kind house --proposal hp_… --utterance GO
  node scripts/go-commit.mjs --slug SLUG --kind register --utterance GO
Exit 0 wrote · 1 refuse · 2 usage
SAVE DRAFT must not call this.`);
    process.exit(args.help ? 0 : 2);
  }
  if (!isGoUtterance(args.utterance)) {
    console.error('refuse: utterance is not GO');
    process.exit(1);
  }
  try {
    const out = args.kind === 'register' || args.kind === 'risks'
      ? goCommitRegister({
        slug: args.slug,
        houseFile: args.houseFile || `house-view-${args.slug}.md`,
        risksSourceRel: args.risks || `raw/${args.slug}-research/08-risks-catalysts.md`,
        utterance: args.utterance,
        compile: args.compile,
      })
      : goCommitHouse({
        slug: args.slug,
        proposalId: args.proposal,
        houseFile: args.houseFile || `house-view-${args.slug}.md`,
        utterance: args.utterance,
        compile: args.compile,
      });
    if (args.json) console.log(JSON.stringify(out, null, 2));
    else {
      console.log(`go-commit ${out.ok ? 'PASS' : 'FAIL'}  ${out.kind}  ${out.slug}`);
      console.log(`  ${out.note}`);
    }
    process.exit(out.ok ? 0 : 1);
  } catch (e) {
    if (args.json) console.log(JSON.stringify({ ok: false, error: e.message || String(e) }));
    else console.error(`go-commit FAIL  ${e.message || e}`);
    process.exit(1);
  }
}

main();
