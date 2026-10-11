/**
 * Plan P4 / phase-5 tool catalog.
 * Default list keeps every live write. Core is the lazy profile and still includes KEEP.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { toolProbe } from './tool-probe.mjs';
import { bannedWordHits, loadSectors } from './sector-check.mjs';
import {
  CORE_TOOLS,
  REMOVED_TOOLS,
  failureBody,
  isKeepVerb,
  nextStep,
} from '../../memory-cockpit-v2/server/mcpToolCatalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

const FAILURES = [
  'missing-desk',
  'desk-type',
  'unknown-desk',
  'propose-forming',
  'propose-save-draft',
  'commit-save-draft',
  'risk-bad-status',
  'register-early',
  'accept-house-denied',
  'add-metric',
  'metric-sor',
  'keep-as-drivers',
  'sector-unknown',
];

function row(tools, id) {
  return (tools.calls || []).find((c) => c.id === id);
}

function envelopeErrors(tools) {
  const errors = [];
  for (const id of FAILURES) {
    const c = row(tools, id);
    if (!c) {
      errors.push(`missing call ${id}`);
      continue;
    }
    if (c.ok_field !== false) errors.push(`${id} ok_field ${c.ok_field}`);
    if (typeof c.next !== 'string' || !c.next) errors.push(`${id} missing next`);
    if (c.retryable !== false) errors.push(`${id} retryable ${c.retryable}`);
    if (/retry|backoff|try again/i.test(`${c.next || ''} ${c.error || ''}`)) {
      errors.push(`${id} next tells the model to resend`);
    }
  }
  return errors;
}

export async function catalogGate() {
  const errors = [];
  if (isKeepVerb('KEEP') !== true || isKeepVerb('GO') !== false) errors.push('KEEP verb detector');
  const keep = failureBody('commit_on_go', 'KEEP is not a drivers GO. No 09 write.');
  if (keep.ok !== false || keep.retryable !== false || !/propose_keep_driver/.test(keep.next)) {
    errors.push(`KEEP envelope ${JSON.stringify(keep)}`);
  }
  if (/retry|try again|backoff/i.test(nextStep('get_pack_snapshot', 'unknown desk "x"'))) {
    errors.push('next step uses a resend word');
  }

  const desks = JSON.parse(readFileSync(path.join(REPO, 'memory-cockpit-v2/config/thin-desks.json'), 'utf8'));
  if ((desks.desks || []).length !== 0) errors.push('product desks are not empty');

  const hint = readFileSync(path.join(REPO, 'memory-cockpit-v2/server/driverProposals.js'), 'utf8');
  const hintBody = hint.slice(hint.indexOf('export const DRIVER_CANDIDATE_HINT'));
  const hintText = hintBody.slice(0, hintBody.indexOf('export function'));
  for (const word of ['NVDA', 'AWS', 'ads mix', 'FoA']) {
    if (hintText.includes(word)) errors.push(`driver hint still names ${word}`);
  }
  const hintHits = bannedWordHits(hintText);
  if (hintHits.length) errors.push(`driver hint issuer tokens ${hintHits.join(',')}`);
  if (!/subscription line/.test(hintText) || !/regulated rate base/.test(hintText) || !/rental portfolio/.test(hintText)) {
    errors.push('driver hint missing the three sector-neutral examples');
  }

  const tools = await toolProbe();
  if (tools.schema?.tool_count !== 22) errors.push(`tool count ${tools.schema?.tool_count}`);
  for (const name of REMOVED_TOOLS) {
    if ((tools.tool_names || []).includes(name)) errors.push(`${name} still listed`);
    const tokens = (tools.schema?.per_tool || []).find((t) => t.name === name)?.schema_tokens || 0;
    if (tokens !== 0) errors.push(`${name} schema tokens ${tokens}`);
  }
  if ((tools.missing_from_expected || []).length) errors.push(`missing ${tools.missing_from_expected.join(',')}`);
  if ((tools.extra || []).length) errors.push(`extra ${tools.extra.join(',')}`);

  const deskErr = row(tools, 'missing-desk');
  if (deskErr && !/desk/i.test(deskErr.error || '')) errors.push('schema error omitted the field name');
  const unknown = row(tools, 'unknown-desk');
  if (unknown && !/unknown desk/i.test(unknown.error || '')) errors.push('unknown desk text changed');
  if (tools.forming_wrote !== false) errors.push('FORMING wrote the house');
  const keepCall = row(tools, 'keep-as-drivers');
  if (!keepCall || !/propose_keep_driver/.test(`${keepCall.next || ''} ${keepCall.error || ''}`)) {
    errors.push('KEEP-shaped drivers call did not name propose_keep_driver');
  }
  if (tools.keep_wrote !== false) errors.push('KEEP-shaped drivers call wrote 09');

  const core = tools.core_profile || {};
  const coreNames = new Set(core.names || []);
  for (const name of ['propose_keep_driver', 'get_driver_sor']) {
    if (!coreNames.has(name)) errors.push(`core profile missing ${name}`);
  }
  for (const name of REMOVED_TOOLS) {
    if (coreNames.has(name)) errors.push(`core profile still has ${name}`);
  }
  for (const name of CORE_TOOLS) {
    if (!coreNames.has(name)) errors.push(`core profile missing ${name}`);
    if (!(tools.tool_names || []).includes(name)) errors.push(`default list missing ${name}`);
  }
  for (const name of core.names || []) {
    if (!(tools.tool_names || []).includes(name)) errors.push(`core tool ${name} is not on the default list`);
  }
  const lazy = core.lazy_call || {};
  if (lazy.ok_field !== false || lazy.retryable !== false) errors.push('lazy-load refusal shape');
  if (!/COCKPIT_MCP_TOOL_PROFILE/.test(lazy.next || '')) errors.push('lazy-load path not in next');

  errors.push(...envelopeErrors(tools));

  const blob = (tools.catalog || []).map((t) => `${t.description}\n${JSON.stringify(t.inputSchema)}`).join('\n');
  const banned = bannedWordHits(blob);
  if (banned.length) errors.push(`tool description issuer tokens ${banned.join(',')}`);

  for (const issuer of loadSectors().issuers) {
    const c = row(tools, `sector-${issuer.id}`);
    if (!c) {
      errors.push(`missing sector call ${issuer.id}`);
      continue;
    }
    if (c.ok_field === false || c.thrown) errors.push(`sector ${issuer.id} refused ${c.error}`);
    if (!String(c.excerpt || '').includes(`SECTOR-FIXTURE-${issuer.id}`)) {
      errors.push(`sector ${issuer.id} house was not read`);
    }
  }
  if ((loadSectors().issuers || []).length !== 10) errors.push('sector fixture is not ten issuers');

  const top = tools.overlap_pairs?.[0]?.jaccard || 0;
  if (top >= 0.5) errors.push(`description Jaccard ${top}`);

  return { errors, tools };
}

export async function assertP4() {
  const { errors } = await catalogGate();
  return errors;
}
