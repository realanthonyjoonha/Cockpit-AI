/**
 * Overview / book-strip stance one-liner from house_prior.view_excerpt.
 * Must not stop at "." (breaks "U.S.", "800G"). Must not swallow ## tables
 * from a FORMING scaffold. Decision-support only.
 */

const SCAFFOLD_RE = /edit after research|scaffold created|replace this body with your underwriting/i;

/** Markdown / pack-flattened stops — ## not only ### (Acceptance log is ##). */
const STANCE_STOP = String.raw`(?=\s*(?:Not a rating|#{2,}\s|Acceptance log|\n\n|\n\s*\||$))`;

/**
 * A stance paragraph is the overview lede and is shown whole.
 * Only an unbounded excerpt is clipped, and only on a word, with an ellipsis.
 */
const STANCE_CAP = 1600;

export function clipStance(s) {
  const t = String(s || '').trim();
  if (t.length <= STANCE_CAP) return t;
  const window = t.slice(0, STANCE_CAP);
  const sp = window.lastIndexOf(' ');
  const cut = (sp > 80 ? window.slice(0, sp) : window).replace(/[.,;:]+$/, '');
  return `${cut}…`;
}

export function isScaffoldStance(s) {
  return SCAFFOLD_RE.test(String(s || ''));
}

/**
 * Live house file is still the empty stub — not a CONFIRMED book that
 * merely logs "Scaffold only — FORMING" in the acceptance table (LLY/TSM).
 */
export function isScaffoldHouseMarkdown(md) {
  const t = String(md || '');
  const stubStance = /edit after research/i.test(t) && /replace this body with your underwriting/i.test(t);
  const datedCreate = /scaffold created \d{4}/i.test(t) && /edit after research/i.test(t);
  return stubStance || datedCreate;
}

/** Frontmatter / heading status of a house markdown file. */
export function houseMarkdownStatus(md) {
  const t = String(md || '');
  if (/^status:\s*CONFIRMED\b/im.test(t)) return 'CONFIRMED';
  if (/·\s*\*\*CONFIRMED\b/i.test(t)) return 'CONFIRMED';
  if (/^status:\s*FORMING\b/im.test(t)) return 'FORMING';
  return 'FORMING';
}

/**
 * propose_house fail-closed. Glass never gets FORMING. Only CONFIRMED after GO.
 * @param {string} md
 * @param {string} [intent] go|confirmed|save_draft|draft|forming|edit
 */
export function assertProposeHouseMarkdown(md, intent) {
  const text = String(md || '');
  if (!text.trim()) throw new Error('markdown empty');
  if (isScaffoldHouseMarkdown(text)) {
    throw new Error(
      'refuse scaffold house proposal (edit after research / Scaffold created). Research-enough body required.',
    );
  }
  const st = houseMarkdownStatus(text);
  const i = String(intent || '').toLowerCase().replace(/-/g, '_');
  if (i === 'edit') {
    throw new Error('EDIT does not propose — dump the full file again and wait for GO or SAVE DRAFT');
  }
  if (i === 'save_draft' || i === 'draft' || i === 'forming') {
    throw new Error('SAVE DRAFT / FORMING does not propose — stay in Grok. Glass never gets a FORMING house proposal.');
  }
  if (st !== 'CONFIRMED') {
    throw new Error('propose_house refuses FORMING. Only CONFIRMED markdown after user GO.');
  }
  return st;
}

/**
 * Closeout paths skip (do not chip glass) when live house cannot be proposed.
 * @returns {string|null} refuse reason, or null if propose is allowed
 */
export function houseProposeRefuseReason(md, intent) {
  try {
    assertProposeHouseMarkdown(md, intent);
    return null;
  } catch (e) {
    return e.message || String(e);
  }
}

export function looksLikeAccession(s) {
  const t = String(s || '').trim();
  if (/^\d{10}-\d{2}-\d{6}$/.test(t)) return true;
  if (/^\d{18,}$/.test(t.replace(/-/g, ''))) return true;
  return false;
}

export function stanceLine(housePrior, extended) {
  if (!housePrior) return null;
  const ex = String(housePrior.view_excerpt || '');
  const clean = (s) => String(s || '').replace(/\*\*/g, '').replace(/\s+/g, ' ').trim();

  const reBold = new RegExp(String.raw`\*\*Stance:\*\*\s*(.+?)${STANCE_STOP}`, 'is');
  const reNested = new RegExp(String.raw`\*\*Stance:\s*(.+?)\*\*${STANCE_STOP}`, 'is');
  const reHead = new RegExp(String.raw`(?:^|\n)\s*\*\*Stance[^:]*:\*\*\s*(.+?)${STANCE_STOP}`, 'is');
  const rePlain = new RegExp(String.raw`(?:^|\n)\s*Stance:\s*(.+?)${STANCE_STOP}`, 'im');

  let m = ex.match(reBold) || ex.match(reNested) || ex.match(reHead) || ex.match(rePlain);

  if (!m && extended) {
    m = ex.match(/I am \*\*very bullish\*\*[^.]*\./i)
      || ex.match(/very bullish on[^.]{0,200}/i);
    if (m) {
      const line = clipStance(clean(m[0]));
      return isScaffoldStance(line) ? null : line;
    }
  }

  if (m) {
    const body = clean(m[1] != null ? m[1] : m[0]);
    if (!body || isScaffoldStance(body)) return null;
    return clipStance(body);
  }
  const idx = ex.search(/Stance/i);
  if (idx >= 0) {
    const tail = ex.slice(idx).replace(/^Stance:?\*?\*?\s*/i, '');
    const line = clean(tail.split(/\n/)[0] || '');
    if (line.length > 40 && !isScaffoldStance(line)) return clipStance(line);
  }
  const play = housePrior.play ? clean(housePrior.play) : '';
  if (play && !isScaffoldStance(play)) return play;
  return null;
}
