// assistContext.js — grounded house+pack context for MCP / external agent hosts.
// No model calls. No writes. Decision-support only.
import { loadPack } from './pack.js';
import { readHouseMarkdown } from './thinHouseSave.js';

const RULES = `You are Anthony's research assistant for a single-name house view (decision-support OS).

## Binding rules
1. Decision-support only: NO buy/sell/hold, NO price target, NO position sizing.
2. House is USER-OWNED. Draft/critique only; he SAVEs on glass (or explicit instruction).
3. Steelman HIS current house first, then DELTA vs pack, then red-team.
4. Prefer pack grades/as_of. If missing, say GAP — do not invent numbers.
5. Propose edits via MCP: prefer propose_house_from_current (exact find→replace on current house). Full propose_house_view / markdown_path only for large rewrites. PENDING only.
6. House file is written ONLY when he ACCEPTs on glass. Never claim updated until ACCEPT + COMPILE BOOK + REFRESH.
7. Do not invent pack facts. Do not mine chat history for drafts — use get_house_view + get_pack_snapshot.
8. Decision-support only.`;

/**
 * @param {object} opts
 * @param {string} opts.ticker
 * @param {string} opts.slug
 * @param {string} opts.deskId
 * @param {string} opts.displayName
 * @param {string} opts.houseFile
 * @param {string} [opts.userGoal]
 */
export function buildHouseAssistContext(opts) {
  const ticker = String(opts.ticker || '').toUpperCase();
  const slug = opts.slug || '';
  const deskId = opts.deskId || '';
  const displayName = opts.displayName || ticker;
  const houseFile = opts.houseFile || '';
  const userGoal = String(opts.userGoal || '').trim();

  let houseMd = null;
  let housePath = null;
  let houseErr = null;
  try {
    const raw = readHouseMarkdown(houseFile);
    housePath = raw.path;
    houseMd = raw.markdown;
  } catch (e) {
    houseErr = e.message || String(e);
  }

  const { available, pack, path: packPath, reason } = loadPack(ticker);
  const hp = (available && pack?.house_prior) || null;
  const rs = (available && pack?.risk_summary) || null;
  const claims = available && Array.isArray(pack?.claims) ? pack.claims : [];
  const gaps = available && Array.isArray(pack?.gaps) ? pack.gaps : [];
  const risks = available && Array.isArray(pack?.risks) ? pack.risks : [];

  const rankedClaims = [...claims].sort((a, b) => {
    const ga = a.grade === 'A' ? 0 : a.grade === 'B' ? 1 : 2;
    const gb = b.grade === 'A' ? 0 : b.grade === 'B' ? 1 : 2;
    if (ga !== gb) return ga - gb;
    return String(b.as_of || '').localeCompare(String(a.as_of || ''));
  }).slice(0, 10);

  const watch = (rs?.watch || []).slice(0, 12);
  const fired = (rs?.fired || []).slice(0, 8);
  const riskLines = risks.slice(0, 12).map((r) => {
    const name = r.name || r.id || '—';
    const st = r.status || '—';
    const g = r.grade || '—';
    const sum = String(r.summary || '').replace(/\s+/g, ' ').trim().slice(0, 160);
    return `- [${st}] ${name} (${g})${sum ? ` — ${sum}` : ''}`;
  });

  const sections = [];
  sections.push(RULES);
  sections.push('');
  sections.push('## Focus');
  sections.push(`- Desk: ${displayName} (\`${slug}\` / ${deskId})`);
  sections.push(`- Ticker: **${ticker}**`);
  sections.push(`- House file: \`${houseFile}\``);
  if (housePath) sections.push(`- Path: \`${housePath}\``);
  sections.push(`- Pack compiled_at: ${available ? (pack.compiled_at || '—') : `unavailable (${reason || 'no pack'})`}`);
  if (packPath) sections.push(`- Pack: \`${packPath}\``);
  sections.push('');
  sections.push("## Anthony's request");
  sections.push(userGoal || '(Add a goal in the agent host: steelman / red-team / draft full house markdown.)');
  sections.push('');
  sections.push('## Pack house_prior');
  if (hp) {
    sections.push(`- play: ${hp.play || '—'}`);
    sections.push(`- status: ${hp.status || '—'}`);
    sections.push(`- date: ${hp.date || '—'}`);
    sections.push('');
    sections.push('### view_excerpt');
    sections.push(String(hp.view_excerpt || '(empty)').slice(0, 2500));
  } else {
    sections.push('_No house_prior in pack._');
  }
  sections.push('');
  sections.push('## Pack risks');
  sections.push(`- count: ${rs?.count ?? risks.length}`);
  sections.push(`- WATCH: ${watch.length ? watch.join('; ') : '(none)'}`);
  sections.push(`- FIRED: ${fired.length ? fired.join('; ') : '(none)'}`);
  if (riskLines.length) {
    sections.push('');
    sections.push(riskLines.join('\n'));
  }
  sections.push('');
  sections.push('## Top graded claims (capped)');
  if (!rankedClaims.length) sections.push('_No claims._');
  else {
    for (const c of rankedClaims) {
      sections.push(`- [${c.grade || '?'}] (${c.as_of || '—'}) ${String(c.text || '').replace(/\s+/g, ' ').trim()}`);
    }
  }
  sections.push('');
  sections.push('## Gaps');
  if (gaps.length) for (const g of gaps.slice(0, 12)) sections.push(`- ${g}`);
  else sections.push('- (none listed)');
  sections.push('');
  sections.push(`## Vault house (\`${houseFile}\`) — AUTHORING TRUTH`);
  if (houseMd) {
    sections.push('```markdown');
    sections.push(houseMd);
    sections.push('```');
  } else {
    sections.push(`_Missing (${houseErr || 'no file'})._`);
  }
  sections.push('');
  sections.push('## Output when drafting');
  sections.push('1. Short steelman + delta + red-team.');
  sections.push('2. Optional full house in ```house-view.md fence.');
  sections.push('3. Remind: paste → glass EDIT → SAVE → COMPILE BOOK → REFRESH.');

  const clipboard_text = sections.join('\n');
  return {
    available: true,
    mode: 'agent_host_context',
    decision_support_only: true,
    desk: deskId,
    ticker,
    slug,
    house_file: houseFile,
    house_path: housePath,
    house_exists: !!houseMd,
    pack_available: available,
    pack_path: packPath || null,
    compiled_at: available ? (pack.compiled_at || null) : null,
    chars: clipboard_text.length,
    clipboard_text,
    mcp: {
      server_name: 'cockpit-research',
      tools: [
        'list_desks',
        'get_house_view',
        'get_pack_snapshot',
        'get_house_assist_context',
        'propose_house_from_current',
        'propose_house_view',
        'list_house_proposals',
      ],
      primary_host: 'grok_build',
      optional_hosts: ['claude_code', 'claude_desktop', 'codex'],
      note: 'Prefer propose_house_from_current. Draft only; glass ACCEPT writes house.',
      install: {
        grok: 'npm run grok:mcp-install',
        claude: 'npm run claude:mcp-install',
        both: 'npm run agent:mcp-install -- --all',
      },
    },
  };
}
