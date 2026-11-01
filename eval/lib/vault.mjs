/**
 * Synthetic vault, generated generically from company config + sector templates.
 * Opinion / risk context only. No issuer figures. No per-ticker branches.
 */

const DATE_OK_RE = /^\d{4}-\d{2}-\d{2}$/;

function fill(template, vars) {
  return String(template || '').replace(/\{([a-z_]+)\}/g, (_, k) => (vars[k] != null ? String(vars[k]) : ''));
}

export function templateFor(company, templates) {
  const sectors = templates.sectors || {};
  return sectors[company.sector] || templates.default;
}

export function formNoteFor(company, templates) {
  const notes = templates.form_notes || {};
  return notes[company.form_family] || notes['10-K/10-Q'] || '';
}

export function houseCanary(company) {
  return `CANARY-HOUSE-${String(company.id || 'X').toUpperCase().replace(/[^A-Z0-9]+/g, '')}`;
}

export function buildSyntheticDesk(company, templates) {
  const t = templateFor(company, templates);
  if (!t) throw new Error(`no vault template for sector ${company.sector}`);
  const canary = houseCanary(company);
  const formNote = formNoteFor(company, templates);
  const vars = {
    name: company.name,
    ticker: company.ticker,
    canary,
    form_note: formNote,
  };
  const slug = `eval-${String(company.id || 'desk').toLowerCase()}`;
  const house = [
    '---',
    'status: CONFIRMED',
    `updated: ${templates.as_of}`,
    `owner: ${templates.owner}`,
    '---',
    '',
    `# House View — ${company.ticker} (SYNTHETIC EVAL FIXTURE)`,
    '',
    `**Stance:** ${t.stance}`,
    '',
    `**Named watch:** ${t.watch}.`,
    '',
    `**Mechanism:** ${t.mechanism}.`,
    '',
    `**What would flip:** ${t.flip}`,
    '',
    formNote ? `${formNote}` : '',
    '',
    'This is not a house view of a covered issuer and not a rating. Decision-support only.',
    `Do not treat this vault as a source of SEC figures. ${canary}`,
  ].filter((line, i, arr) => !(line === '' && arr[i - 1] === '')).join('\n');

  const risks = [
    `# Risk register fixture — ${company.ticker} (SYNTHETIC)`,
    '',
    `### R1 — ${t.risk1_name}`,
    '',
    `- **Status:** WATCH · **Grade:** [B] · fixture-only`,
    `- **Mechanism:** ${t.risk1_mechanism}`,
    '',
    '| Signal | Tripwire | Current state | As-of |',
    '| --- | --- | --- | --- |',
    `| ${t.risk1_signal} | ${t.risk1_trip} | notes only | ${templates.as_of} |`,
    '',
    `### R2 — ${t.risk2_name}`,
    '',
    `- **Status:** WATCH · **Grade:** [B]`,
    `- **Mechanism:** ${t.risk2_mechanism}`,
    '',
    '| Signal | Tripwire | Current state | As-of |',
    '| --- | --- | --- | --- |',
    `| ${t.risk2_signal} | ${t.risk2_trip} | notes only | ${templates.as_of} |`,
    '',
    'No tagged companyfacts figures live in this register. Propose only. Never claim a write.',
  ].join('\n');

  const notes = [
    `- Fixture note: the desk watches ${t.watch}, not a tagged AI line. ${formNote} (${templates.as_of}) [C] [[${slug}]]`,
    `- Fixture note: ${t.mechanism}. Not a SEC figure. (${templates.as_of}) [C] [[${slug}]]`,
  ].join('\n');

  const desk = {
    slug,
    house_canary: canary,
    house: fill(house, vars),
    risks: fill(risks, vars),
    notes: fill(notes, vars),
    watch: t.watch,
    mechanism: t.mechanism,
  };
  const check = vaultHasForbiddenFigures(desk);
  if (check.hits.length) {
    throw new Error(`synthetic vault for ${company.id} leaked figures: ${check.hits.slice(0, 5).join(' | ')}`);
  }
  return desk;
}

export function buildSyntheticDesks(companies, templates) {
  const desks = {};
  for (const company of companies) {
    desks[company.id] = buildSyntheticDesk(company, templates);
  }
  return { desks, bleed_canaries: [] };
}

/**
 * Ban currency, percents, and quantities that could be mistaken for SEC figures.
 * Allow ISO dates, R1/R2 labels, and single-digit list markers.
 */
export function vaultHasForbiddenFigures(desk) {
  const hits = [];
  const blobs = [desk.house, desk.risks, desk.notes];
  for (const blob of blobs) {
    const text = String(blob || '');
    if (/[$€£¥]/.test(text) || /%/.test(text)) {
      hits.push('currency_or_percent');
    }
    const re = /\b\d[\d,]*(?:\.\d+)?\b/g;
    let m;
    while ((m = re.exec(text))) {
      const token = m[0];
      const around = text.slice(Math.max(0, m.index - 16), m.index + token.length + 16);
      if (DATE_OK_RE.test(token)) continue;
      if (/\d{4}-\d{2}-\d{2}/.test(around)) continue;
      if (/^R\d$/i.test(around.match(/R\d/i)?.[0] || '') && token.length === 1) continue;
      if (token.length >= 3 || token.includes('.') || token.includes(',')) {
        hits.push(around.trim());
      }
    }
  }
  return { ok: hits.length === 0, hits };
}
