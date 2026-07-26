// fm.js — THE schema parser for cockpit files (risks, desks, registry). Shared by
// cockpit/lint.js, cockpit/sync.js and the site's server (imported by absolute path), so
// there is exactly one definition of "what parses".
//
// FORGIVING by contract (§5): bad input degrades to warnings on the result object —
// this module never throws on malformed content. Zero dependencies.

// ---------- frontmatter ----------
// Supports: key: scalar · key: "quoted \" string" · key: [a, b, c] · booleans · numbers.
// Unknown/broken lines are kept as warnings, not errors.
export function parseFrontmatter(text) {
  const out = { meta: {}, body: text, warnings: [] };
  if (!text.startsWith('---')) { out.warnings.push('no frontmatter block'); return out; }
  const end = text.indexOf('\n---', 3);
  if (end === -1) { out.warnings.push('unterminated frontmatter'); return out; }
  const fmRaw = text.slice(4, end);
  out.body = text.slice(text.indexOf('\n', end + 1) + 1);
  let lastKey = null;
  for (const line of fmRaw.split('\n')) {
    if (!line.trim()) continue;
    if (/^\s/.test(line) && lastKey) continue; // folded/indented continuation (e.g. block scalars) — ignore tail
    const m = line.match(/^([\w][\w-]*):\s*(.*)$/);
    if (!m) { out.warnings.push(`unparsed frontmatter line: ${line.slice(0, 60)}`); continue; }
    lastKey = m[1];
    out.meta[m[1]] = parseValue(m[2]);
  }
  return out;
}

function parseValue(raw) {
  const v = raw.trim();
  if (v === '') return '';
  if (v === 'true') return true;
  if (v === 'false') return false;
  if (v.startsWith('[') && v.endsWith(']')) {
    const inner = v.slice(1, -1).trim();
    return inner === '' ? [] : inner.split(',').map((s) => unquote(s.trim())).filter(Boolean);
  }
  if (/^-?\d+(\.\d+)?$/.test(v)) return Number(v);
  return unquote(v);
}
function unquote(s) {
  if (s.length >= 2 && s.startsWith('"') && s.endsWith('"')) return s.slice(1, -1).replace(/\\"/g, '"');
  if (s.length >= 2 && s.startsWith("'") && s.endsWith("'")) return s.slice(1, -1);
  return s;
}

// ---------- markdown tables ----------
// Returns rows of trimmed cells; skips the header separator. Tolerates ragged rows.
export function parseTable(md) {
  const rows = [];
  for (const line of md.split('\n')) {
    const t = line.trim();
    if (!t.startsWith('|')) continue;
    const cells = t.replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c))) continue; // separator
    rows.push(cells);
  }
  return rows;
}

// ---------- risk files ----------
export const STATUSES = ['INTACT', 'WATCH', 'FIRED'];

// grade may be "A" | "B" | "C" | "—" or letter-prefixed free text ("C — VERIFY")
export function gradeLetter(grade) {
  const m = String(grade ?? '').trim().match(/^([ABC])\b/);
  return m ? m[1] : null;
}

// splits a risk body into { prose, tripwires, tripNote, history, research }
export function parseRiskBody(body) {
  const warnings = [];
  const sections = { prose: '', tripwires: [], tripNote: '', history: [], research: '' };
  const parts = body.split(/^## +/m);
  sections.prose = parts[0].trim();
  for (const part of parts.slice(1)) {
    const nl = part.indexOf('\n');
    const heading = (nl === -1 ? part : part.slice(0, nl)).trim().toLowerCase();
    const content = nl === -1 ? '' : part.slice(nl + 1);
    if (heading.startsWith('tripwire')) {
      const rows = parseTable(content);
      for (const cells of rows) {
        if (/^signal$/i.test(cells[0] || '')) continue; // header row
        // 4-col (Signal | Tripwire | State | As-of) or 3-col (Signal | Tripwire | As-of)
        let [signal, trip, state, asOf] = cells;
        if (cells.length === 3) { asOf = cells[2]; state = '—'; }
        else if (cells.length < 3) { warnings.push(`tripwire row too short: ${cells.join('|').slice(0, 50)}`); continue; }
        const tell = /⭐/.test(signal);
        sections.tripwires.push({
          signal: signal.replace(/\s*⭐\s*/g, ' ').trim(), tell,
          trip: trip || '—', state: state || '—', asOf: asOf || '—',
        });
      }
      const note = content.split('\n').find((l) => l.trim().startsWith('*') && !l.trim().startsWith('|'));
      if (note) sections.tripNote = note.trim().replace(/^\*|\*$/g, '');
    } else if (heading.startsWith('history')) {
      for (const line of content.split('\n')) {
        const m = line.match(/^\s*-\s+(\d{4}-\d{2}(?:-[\dx]{2})?)\s*—\s*(?:\[(\w[\w-]*)\]\s*)?(.*)$/);
        if (m) sections.history.push({ date: m[1], kind: m[2] || 'note', text: m[3].trim() });
        else if (line.trim().startsWith('-')) warnings.push(`unparsed history line: ${line.trim().slice(0, 60)}`);
      }
    } else if (heading.startsWith('research')) {
      sections.research = content.trim();
    } else {
      // unknown section — keep it visible in research so nothing silently vanishes
      sections.research += (sections.research ? '\n\n' : '') + `## ${heading}\n${content}`.trim();
    }
  }
  return { ...sections, warnings };
}

export function parseRiskFile(text) {
  const { meta, body, warnings } = parseFrontmatter(text);
  const parsed = parseRiskBody(body);
  return { meta, ...parsed, warnings: [...warnings, ...parsed.warnings] };
}

// ---------- series registry ----------
// cockpit/series/_registry.md → [{id,label,unit,source,risk,kind}]
export function parseRegistry(text) {
  const { body, warnings } = parseFrontmatter(text);
  const out = [];
  for (const cells of parseTable(body)) {
    if (/^id$/i.test(cells[0] || '')) continue;
    if (cells.length < 6) { warnings.push(`registry row too short: ${cells.join('|').slice(0, 60)}`); continue; }
    const [id, label, unit, source, risk, kind] = cells;
    out.push({ id, label, unit, source, risk: risk === '—' ? null : risk, kind: kind || 'line' });
  }
  return { series: out, warnings };
}

// ---------- catalysts (wiki/catalysts.md — reused as-is, table may have wikilinks) ----------
export function parseCatalysts(text) {
  const { body, warnings } = parseFrontmatter(text);
  const stripLinks = (s) => s.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b || a);
  const rows = [];
  let section = 'upcoming';
  for (const line of body.split('\n')) {
    if (/^#+\s+resolved/i.test(line.trim())) section = 'resolved';
    if (!line.trim().startsWith('|')) continue;
    const cells = line.trim().replace(/^\|/, '').replace(/\|\s*$/, '').split('|').map((c) => c.trim());
    if (cells.every((c) => /^:?-{2,}:?$/.test(c)) || /^date/i.test(cells[0] || '')) continue;
    if (cells.length < 4) { warnings.push(`catalyst row too short: ${line.trim().slice(0, 60)}`); continue; }
    rows.push({
      date: stripLinks(cells[0]), name: stripLinks(cells[1]), nameSlug: (cells[1].match(/\[\[([^\]|]+)/) || [])[1] || null,
      event: stripLinks(cells[2]), why: stripLinks(cells[3] || ''), conf: cells[4] || '', section,
    });
  }
  return { rows, warnings };
}
