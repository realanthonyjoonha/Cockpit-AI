/**
 * Shared tool catalog for the cockpit-research MCP server.
 * Phone and desktop hosts both launch this server. Glass does not render tools.
 *
 * Always-loaded catalog (COCKPIT_MCP_TOOL_PROFILE unset): every live tool.
 * That is the default so a cheap model still sees propose_keep_driver.
 *
 * Lazy core (COCKPIT_MCP_TOOL_PROFILE=core): a closed ten-tool stress set
 * (the original eight plus propose_keep_driver and get_driver_sor). KEEP is
 * on that list. It is not every write the desk loop uses: tripwire, driver
 * log, full propose_house_view, list_house_proposals, and accept_* stay on
 * the default catalog only. Tools left off core are not deleted. Unset the
 * profile and call tools/list to load them. That is the lazy-load path.
 *
 * propose_add_metric and get_metric_sor are removed. They always refused, so
 * no capability is lost. A cached call gets an unknown-tool envelope whose
 * next names the live tool.
 *
 * Decision-support only. No house write happens in this module.
 */

export const REMOVED_TOOLS = ['propose_add_metric', 'get_metric_sor'];

/** Eight-tool stress core, plus KEEP and the drivers read. KEEP is not optional. */
export const CORE_TOOLS = [
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

export function toolProfile() {
  return String(process.env.COCKPIT_MCP_TOOL_PROFILE || '').trim().toLowerCase();
}

export function toolVisible(name) {
  if (REMOVED_TOOLS.includes(name)) return false;
  if (toolProfile() === 'core') return CORE_TOOLS.includes(name);
  return true;
}

/** User verb KEEP anywhere on the line. A spoken GO does not match. */
export function isKeepVerb(utterance) {
  return /(?<![\w-])keep(?![\w-])/i.test(String(utterance || '').trim());
}

function namedTool(error) {
  const m = /(?:for tool|Tool) ([a-z0-9_]+)/i.exec(String(error || ''));
  return m ? m[1] : '';
}

/**
 * What to call instead. Never the words that would resend the same payload.
 * @param {string|null} toolName
 * @param {string} error
 */
export function nextStep(toolName, error) {
  const e = String(error || '');
  const tool = toolName || namedTool(e);
  if (REMOVED_TOOLS.includes(tool) || REMOVED_TOOLS.some((n) => e.includes(n))) {
    return 'call propose_add_risk or get_risk_sor; metric names are not registered';
  }
  if (/Tool [a-z0-9_]+ not found/i.test(e)) {
    const missing = (/Tool ([a-z0-9_]+) not found/i.exec(e) || [])[1] || 'the tool';
    return `unset COCKPIT_MCP_TOOL_PROFILE and call tools/list to load ${missing}`;
  }
  if (/KEEP is not\b/.test(e) || isKeepVerb(e)) {
    return 'call propose_keep_driver';
  }
  if (/kind=metrics|not wired/i.test(e)) {
    return 'call propose_add_risk or propose_keep_driver';
  }
  if (/wrong kind/i.test(e)) {
    return 'call commit_on_go with kind house, register, or drivers';
  }
  if (/FORMING/i.test(e)) {
    return 'wait for a CONFIRMED house, then call propose_house_view';
  }
  if (/SAVE DRAFT/i.test(e)) {
    return 'stay in the host; do not call commit_on_go';
  }
  if (/unknown desk|desk required/i.test(e) || /field desk\b/i.test(e)) {
    return 'call list_desks';
  }
  if (/to_status|status must be INTACT|INTACT\|WATCH\|FIRED/i.test(e)) {
    return 'call propose_risk_status with to_status INTACT, WATCH, or FIRED';
  }
  if (/not closed|not stamped|\bthin\b|tripwire/i.test(e)) {
    return 'draft four distinct risks with tripwire tables, then call commit_on_go kind=register';
  }
  if (/Agent ACCEPT denied|agent.accept/i.test(e)) {
    return 'use commit_on_go after spoken GO, or turn on the scenario grant';
  }
  if (/utterance is not GO|EDIT does not write|STOP does not write/i.test(e)) {
    return 'pass a spoken GO line to commit_on_go';
  }
  if (/\bpin\b/i.test(e)) {
    return 'reinstall the MCP pin from this monorepo';
  }
  return 'call list_desks';
}

export function failureBody(toolName, error) {
  const message = String(error || 'refused').replace(/^MCP error -?\d+:\s*/, '');
  return {
    ok: false,
    error: message,
    next: nextStep(toolName, message),
    retryable: false,
  };
}

export function stampToolResult(result, toolName, textResult) {
  const text = result?.content?.[0]?.text;
  if (typeof text !== 'string' || !text.trim().startsWith('{')) return result;
  let parsed;
  try { parsed = JSON.parse(text); } catch { return result; }
  if (!parsed || parsed.ok !== false) return result;
  const error = String(parsed.error || 'refused');
  const next = typeof parsed.next === 'string' && parsed.next ? parsed.next : nextStep(toolName, error);
  return textResult({
    ...parsed,
    ok: false,
    error,
    next,
    retryable: false,
  });
}

async function parseInput(schema, data) {
  if (schema && typeof schema.safeParseAsync === 'function') return schema.safeParseAsync(data);
  if (schema && typeof schema.safeParse === 'function') return schema.safeParse(data);
  throw new Error('tool schema has no parser');
}

/**
 * Schema failures and handler throws become one JSON object.
 * The published input schema stays the strict one tools/list already shows.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 * @param {(obj: object) => object} textResult
 */
export function installToolCatalog(server, textResult) {
  const raw = server.tool.bind(server);
  server.tool = (name, ...rest) => {
    if (!toolVisible(name)) return undefined;
    const cbIndex = rest.length - 1;
    const cb = rest[cbIndex];
    if (typeof cb !== 'function') return raw(name, ...rest);
    const wrapped = async (...args) => {
      try {
        const out = await cb(...args);
        return stampToolResult(out, name, textResult);
      } catch (e) {
        return textResult(failureBody(name, e?.message || String(e)));
      }
    };
    const next = rest.slice();
    next[cbIndex] = wrapped;
    return raw(name, ...next);
  };

  server.validateToolInput = async function validateToolInput(tool, args, toolName) {
    if (!tool?.inputSchema) return args;
    const parsed = await parseInput(tool.inputSchema, args === undefined ? {} : args);
    if (!parsed.success) {
      const issue = parsed.error?.issues?.[0];
      const field = issue?.path?.length ? issue.path.join('.') : 'arguments';
      const detail = issue?.message || 'invalid';
      throw new Error(`Invalid arguments for tool ${toolName}: field ${field}: ${detail}`);
    }
    return parsed.data;
  };

  server.createToolError = (errorMessage) => {
    const body = failureBody(null, errorMessage);
    return {
      content: [{ type: 'text', text: JSON.stringify(body, null, 2) }],
      isError: false,
    };
  };
}
