/**
 * Phase-5 name for the tool-catalog gate, plus the always-loaded token count.
 * Before: harness-stress/results/tools.json catalog_tokens on the parent branch (24 tools).
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { catalogGate } from './assert-p4.mjs';
import { REMOVED_TOOLS } from '../../memory-cockpit-v2/server/mcpToolCatalog.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(HERE, '../..');

/** Measured on cursor/harness-p3-slice-cards-04a4 before this phase. */
export const ALWAYS_LOADED_TOKENS_BEFORE = 3063;

export async function assertP5() {
  const { errors, tools } = await catalogGate();
  const after = tools?.schema?.catalog_tokens;
  const coreTokens = tools?.core_profile?.schema_tokens;
  console.log(`always-loaded tool-schema tokens before=${ALWAYS_LOADED_TOKENS_BEFORE} after=${after}`);
  console.log(`core profile tokens=${coreTokens} tools=${tools?.core_profile?.tool_count}`);
  if (!(typeof after === 'number' && after < ALWAYS_LOADED_TOKENS_BEFORE)) {
    errors.push(`always-loaded tokens did not fall (${after})`);
  }
  if (!(typeof coreTokens === 'number' && coreTokens < after)) {
    errors.push(`core profile tokens ${coreTokens} are not under the default catalog`);
  }
  const catalog = readFileSync(path.join(REPO, 'memory-cockpit-v2/server/mcpToolCatalog.js'), 'utf8');
  if (!/COCKPIT_MCP_TOOL_PROFILE/.test(catalog) || !/lazy-load path/i.test(catalog)) {
    errors.push('lazy-load path is not documented');
  }
  if (/includes every write the desk loop uses/.test(catalog)) {
    errors.push('core profile header overclaims the closed set');
  }
  if (!/not every write the desk loop uses/.test(catalog)) {
    errors.push('core profile header does not name the omitted desk-loop writes');
  }
  for (const name of REMOVED_TOOLS) {
    if (!catalog.includes(name)) errors.push(`removed tool ${name} has no documented path`);
  }
  const live = new Set(tools?.tool_names || []);
  const expected = [
    'list_desks', 'get_house_view', 'get_pack_snapshot', 'get_house_assist_context',
    'propose_house_view', 'propose_house_from_current', 'commit_on_go', 'list_house_proposals',
    'propose_risk_status', 'propose_add_risk', 'list_risk_proposals', 'get_risk_sor',
    'list_house_driver_candidates', 'propose_keep_driver', 'propose_driver_log', 'propose_skip_driver',
    'get_driver_sor', 'list_driver_proposals', 'propose_risk_tripwires', 'agent_accept_status',
    'accept_house_proposal', 'accept_risk_proposal',
  ];
  for (const name of expected) {
    if (!live.has(name)) errors.push(`capability ${name} dropped without a lazy-load path`);
  }
  return errors;
}
