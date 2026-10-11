/**
 * Write the exact prompts used for the model arm so a stranger can replay them.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { countTokens } from './tokens.mjs';

const CANARIES = {
  F1: '222222',
  F2: '111111',
  F3: 'exactly-3-segments',
  F4: 'headcount-4242',
  F5: 'purple-heron',
  F6: 'Northwind',
  F7: '15000015',
  F8: 'lane-7',
};

function filler(chars, salt) {
  const sentence = 'Process note on filing mechanics and control language for the fixture desk. ';
  let s = '';
  let i = 0;
  while (s.length < chars) {
    s += `Paragraph ${salt}-${i}. ${sentence}`;
    i += 1;
  }
  return s.slice(0, chars);
}

function fillerTokens(target, salt) {
  const sample = `Note ${salt}-0 filing control 0 desk mechanics. `;
  const per = Math.max(1, countTokens(sample));
  const n = Math.ceil(target / per) + 2;
  let s = '';
  for (let i = 0; i < n; i += 1) s += `Note ${salt}-${i} filing control ${i} desk mechanics. `;
  return s;
}

const TASKS = [
  { id: 'T1', ask: 'Which desks are registered in this monorepo?', full: 'list_desks', core: 'list_desks', bash: 'thin-desks.json' },
  { id: 'T2', ask: 'Read the full house-view markdown for desk demo.', full: 'get_house_view', core: 'get_house_view', bash: 'house-view' },
  { id: 'T3', ask: 'What are the live compiled claims for desk demo?', full: 'get_pack_snapshot', core: 'get_pack_snapshot', bash: 'DEMO.json' },
  { id: 'T4', ask: 'The user said GO. Write the pending CONFIRMED house proposal.', full: 'commit_on_go', core: 'commit_on_go', bash: null },
  { id: 'T5', ask: 'Apply one exact find-and-replace to the current house and store a proposal. Do not paste the whole file.', full: 'propose_house_from_current', core: 'propose_house_from_current', bash: null },
  { id: 'T6', ask: 'Propose a new risk on the register. Do not write the file yet.', full: 'propose_add_risk', core: 'propose_add_risk', bash: null },
  { id: 'T7', ask: 'Read the R1 section from the risk source of record, including tripwires.', full: 'get_risk_sor', core: 'get_risk_sor', bash: '08-risks' },
  { id: 'T8', ask: 'The user said SAVE DRAFT. Do not propose and do not write.', full: null, core: null, bash: null },
  { id: 'T9', ask: 'Add a row on the metrics page.', full: null, core: null, bash: null },
  { id: 'T10', ask: 'KEEP a business engine already quoted in the CONFIRMED house.', full: 'propose_keep_driver', core: 'propose_keep_driver', bash: null },
  { id: 'T11', ask: 'Can this session ACCEPT a house proposal on its own?', full: 'agent_accept_status', core: null, bash: null },
];

const CORE = [
  'list_desks',
  'get_house_view',
  'get_pack_snapshot',
  'propose_house_from_current',
  'commit_on_go',
  'get_risk_sor',
  'propose_add_risk',
  'propose_risk_status',
  'propose_keep_driver',
  'get_driver_sor',
];

function catalog(tools, names) {
  const want = new Set(names);
  return tools
    .filter((t) => want.has(t.name))
    .map((t) => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema || {},
    }));
}

function toolPrompt(arm, tools) {
  const listed = arm === 'bash' ? [] : catalog(tools, arm === 'core' ? CORE : tools.map((t) => t.name));
  const rules = arm === 'bash'
    ? [
      'You may not call MCP tools. Reply with shell commands only, or null when a write would skip the propose/GO gate.',
      'Layout: memory-cockpit-v2/config/thin-desks.json ; research-wiki/house-view-*.md ; research-wiki/raw/<slug>-research/08-risks-catalysts.md ; ontology/store/by_ticker/<TICKER>.json.',
      'A command that writes a house or risk file directly is a wrong answer. Use command: null for those tasks.',
    ]
    : [
      'Choose one tool from the list below, or null when no listed tool should be called.',
      'Do not invent tool names that are absent from the list.',
      'SAVE DRAFT must not propose or write. A metrics page that is not wired must not be forced through a dead tool.',
    ];
  return [
    'You are a scoring subject in a harness test. Do not use tools. Do not read files. Do not browse.',
    'Reply with one JSON array and nothing else. Each element: {"id":"T1","tool":null,"arguments":{},"command":null}.',
    ...rules,
    '',
    arm === 'bash' ? 'TOOLS: (none — bash only)' : `TOOLS:\n${JSON.stringify(listed)}`,
    '',
    'TASKS:',
    ...TASKS.map((t) => `${t.id}. ${t.ask}`),
  ].join('\n');
}

function recallPrompt(tokenTarget, salt) {
  const seed = Object.entries(CANARIES).map(([k, v]) => `${k}=${v}`).join('\n');
  return [
    'You are a scoring subject. Do not use tools. Do not read files. Reply with JSON only: {"facts":{"F1":"..."}}.',
    'Quote the seeded values from the top of this prompt. Do not guess.',
    '',
    'SEEDED FACTS',
    seed,
    '',
    fillerTokens(tokenTarget, salt),
    '',
    'Quote every seeded fact id and value.',
  ].join('\n');
}

export function emitPrompts(dir, tools) {
  mkdirSync(dir, { recursive: true });
  const files = {
    'tool-full.md': toolPrompt('full', tools),
    'tool-core.md': toolPrompt('core', tools),
    'tool-bash.md': toolPrompt('bash', tools),
    'recall-s.md': recallPrompt(400, 'rs'),
    'recall-l.md': recallPrompt(16_000, 'rl'),
    'multiturn-0.md': [
      'You are a scoring subject. Do not use tools. Remember these fixture facts.',
      ...Object.entries(CANARIES).map(([k, v]) => `${k}=${v}`),
      'Reply with JSON only: {"ack":true,"F5":"<value>"}',
    ].join('\n'),
    'multiturn-1.md': `More fixture notes follow. Reply with JSON only: {"F5":"<value>"}\n${filler(12_000, 'mt1')}`,
    'multiturn-2.md': `More fixture notes follow. Reply with JSON only: {"F5":"<value>"}\n${filler(12_000, 'mt2')}`,
    'multiturn-3.md': [
      'Quote every seeded fact from the first message.',
      'Reply with JSON only: {"facts":{"F1":"..."}}.',
      filler(4_000, 'mt3'),
    ].join('\n'),
  };
  const meta = {};
  for (const [name, body] of Object.entries(files)) {
    writeFileSync(path.join(dir, name), body);
    meta[name] = { chars: body.length, tokens: countTokens(body) };
  }
  writeFileSync(path.join(dir, 'expected.json'), JSON.stringify({
    canaries: CANARIES,
    tasks: TASKS,
    core: CORE,
    prompts: meta,
  }, null, 2));
  return meta;
}
