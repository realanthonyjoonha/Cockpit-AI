// filingMapPaint.js — Overview map dossier view-model (pure).
// Decision-support only. Ops paint — not pack/house SoR.

export function oneLine(s, max = 140) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return '';
  if (t.length <= max) return t;
  const cut = t.slice(0, Math.max(1, max - 1)).replace(/\s+\S*$/, '');
  return `${cut || t.slice(0, max - 1)}…`;
}

/** Drop EDGAR accession noise from the operate headline. */
export function stripAccession(s) {
  return String(s || '')
    .replace(/\b\d{10}-\d{2}-\d{6}\b/g, '')
    .replace(/\s+,/g, ',')
    .replace(/\(\s+/g, '(')
    .replace(/\s+\)/g, ')')
    .replace(/\(\)/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function dossierHeadline(summary, max = 180) {
  const s = stripAccession(summary);
  if (!s) return '';
  const first = splitSentences(s)[0] || s;
  return oneLine(first, max);
}

/** Split operate prose. Do not break 75.0% or $96.221B. */
export function splitSentences(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const out = [];
  let buf = '';
  for (let i = 0; i < t.length; i += 1) {
    const ch = t[i];
    buf += ch;
    if (ch !== '.' && ch !== '!' && ch !== '?') continue;
    const prev = t[i - 1] || '';
    const next = t[i + 1] || '';
    if (ch === '.' && /\d/.test(prev) && /\d/.test(next)) continue;
    if (ch === '.' && next === '.') continue;
    if (next !== '' && next !== ' ') continue;
    let j = i + 1;
    while (t[j] === ' ') j += 1;
    if (j < t.length && !/[A-Z]/.test(t[j])) continue;
    out.push(buf.trim());
    buf = '';
    i = j - 1;
  }
  if (buf.trim()) out.push(buf.trim());
  return out;
}

export function isCatalogSentence(s) {
  const t = String(s || '');
  if (/already in the book/i.test(t)) return true;
  if (/no material 8-?K/i.test(t)) return true;
  if (/no material filings after/i.test(t)) return true;
  return false;
}

/**
 * 3–5 sentences of what the filing found. Prefers published summary meat
 * (drops catalog-only lines when enough remains). Never invents numbers.
 * @returns {string[]}
 */
export function findingsSentences(opts = {}) {
  const min = opts.min == null ? 3 : opts.min;
  const max = opts.max == null ? 5 : opts.max;
  const agent = splitSentences(stripAccession(opts.summary || ''));
  const meat = agent.filter((s) => !isCatalogSentence(s));
  let out = (meat.length >= min ? meat : agent).slice(0, max);

  const extras = [];
  for (const w of opts.rowWhats || []) {
    for (const s of splitSentences(stripAccession(w))) {
      if (isCatalogSentence(s)) continue;
      extras.push(s);
    }
  }
  for (const s of extras) {
    if (out.length >= min) break;
    if (!out.includes(s)) out.push(s);
  }
  for (const name of opts.addNames || []) {
    if (out.length >= min) break;
    const line = `Add-risk candidate: ${oneLine(name, 88)}.`;
    if (!out.includes(line)) out.push(line);
  }
  return out.slice(0, max);
}

/**
 * Filings-room digest: in-depth vs pack (facts), not a register scorecard.
 * Uses delta.digest when present; else full meat summary (up to 12 sentences)
 * plus per-accession what.text. Never invents numbers.
 */
export function filingPageDigest(opts = {}) {
  const delta = opts.delta && typeof opts.delta === 'object' ? opts.delta : {};
  const rowsIn = Array.isArray(delta.rows) ? delta.rows : [];
  const source = stripAccession(delta.digest || delta.summary || opts.summary || '');
  const paragraphs = findingsSentences({
    summary: source,
    rowWhats: [],
    addNames: [],
    min: 1,
    max: 12,
  });
  const accessions = rowsIn.map((row) => {
    const gaps = operatorGaps(row?.gaps);
    const addRisk = Array.isArray(row?.add_risk_candidates)
      ? row.add_risk_candidates.filter((c) => c && (c.name || c.title))
      : [];
    return {
      accession: row?.accession || null,
      form: row?.form || null,
      filed: row?.filed || null,
      in_book: row?.in_book,
      what: stripAccession(row?.what?.text || ''),
      excerpt: strExcerpt(row?.what?.excerpt),
      addRisk,
      gaps: gaps.operator,
    };
  });
  return {
    paragraphs,
    accessions,
    finishedAt: opts.finishedAt ? String(opts.finishedAt).slice(0, 10) : '',
  };
}

function strExcerpt(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > 12 ? t : '';
}

export function isInternalGap(g) {
  const s = String(g || '');
  if (!s.trim()) return true;
  if (/\[object Object\]/i.test(s)) return true;
  if (/tripwires rendered/i.test(s)) return true;
  if (/HTTP 403/i.test(s)) return true;
  if (/POST\s+\/acquire/i.test(s)) return true;
  if (/outside this jail/i.test(s)) return true;
  if (/copied into this run/i.test(s)) return true;
  return false;
}

export function operatorGaps(gaps) {
  const list = Array.isArray(gaps) ? gaps : [];
  const operator = [];
  const internal = [];
  for (const g of list) {
    const s = typeof g === 'string' ? g : '';
    if (!s) continue;
    if (isInternalGap(s)) internal.push(s);
    else operator.push(s);
  }
  return { operator, internal };
}

/** Explicit miss notes stay quiet. trips:true always loud. */
export function houseHitTrips(hit) {
  if (!hit || typeof hit !== 'object') return false;
  if (hit.trips === true || hit.trip === true) return true;
  if (hit.trips === false || hit.trip === false) return false;
  const note = String(hit.note || '');
  if (/\bdoes not trip\b/i.test(note) || /\bdo not trip\b/i.test(note)) return false;
  if (/\bnone of those wires\b/i.test(note)) return false;
  if (/\bno hit\b/i.test(note)) return false;
  if (!note.trim()) return false;
  return true;
}

export function classifyHouseHits(hits) {
  const list = Array.isArray(hits) ? hits : [];
  const tripped = [];
  const quiet = [];
  for (const h of list) {
    if (houseHitTrips(h)) tripped.push(h);
    else quiet.push(h);
  }
  return { tripped, quiet, n: list.length };
}

export function riskTest(hit) {
  return String(hit?.test || '').toUpperCase();
}

export function classifyRiskHits(hits) {
  const list = Array.isArray(hits) ? hits : [];
  const fired = [];
  const watch = [];
  const intact = [];
  const other = [];
  for (const r of list) {
    const t = riskTest(r);
    if (t === 'FIRED') fired.push(r);
    else if (t === 'WATCH') watch.push(r);
    else if (t === 'INTACT') intact.push(r);
    else other.push(r);
  }
  return { fired, watch, intact, other, n: list.length };
}

export function riskShortName(r) {
  const name = String(r?.name || r?.id || '').trim();
  const m = name.match(/^(R\d{1,3})\s*[—–-]\s*(.+)$/i);
  if (m) return `${m[1].toUpperCase()} — ${oneLine(m[2], 44)}`;
  return oneLine(name, 56);
}

/**
 * Glass preview chips for propose-from-map (counts only — server plans for real).
 * Conservative: house trips via houseHitTrips; risk tests that look actionable;
 * add-risk candidates. Does not know SoR, so risk count may overstate vs dry_run.
 */
export function closeoutPreviewCounts(delta) {
  const rows = Array.isArray(delta?.rows) ? delta.rows : [];
  let house = 0;
  let risk = 0;
  let add = 0;
  for (const row of rows) {
    for (const h of Array.isArray(row?.house_hits) ? row.house_hits : []) {
      if (houseHitTrips(h)) house += 1;
    }
    for (const r of Array.isArray(row?.risk_hits) ? row.risk_hits : []) {
      const t = riskTest(r);
      if (t === 'INTACT' || t === 'WATCH' || t === 'FIRED') risk += 1;
    }
    for (const c of Array.isArray(row?.add_risk_candidates) ? row.add_risk_candidates : []) {
      if (c && (c.name || c.title)) add += 1;
    }
  }
  return {
    house,
    risk,
    add,
    actionable: house + risk + add,
  };
}

export function completeMaps(runs) {
  return (Array.isArray(runs) ? runs : []).filter((r) => r && r.status === 'complete');
}

/** Filing timestamp for “newer than last map” — acceptance, else filed date. */
export function filingEventAt(f) {
  if (!f || typeof f !== 'object') return '';
  if (f.acceptance) return String(f.acceptance);
  const filed = String(f.filed || f.date || '').slice(0, 10);
  return filed ? `${filed}T23:59:59.000Z` : '';
}

/**
 * LAW — Overview SEC FILINGS is one slot under the house. Never move the house.
 *   pending   maps lane not listed yet (do not assume never_mapped)
 *   need_map  no complete MAP FILINGS → last print + MAP FILINGS
 *   quiet     complete map, nothing newer → last print; Show map = findings + OPEN GROK
 *   new       complete map, then newer extra filings / NOT IN BOOK print
 *             → last print + extra rows + MAP FILINGS; Show map = prior findings (opt-in)
 * IN BOOK is catalog, not "already handled". No ticker names.
 */
export function filingsStripMode(opts = {}) {
  const print = opts.print || {};
  const items = Array.isArray(opts.materialItems) ? opts.materialItems : [];
  const materialCount = Number(opts.materialCount);
  const n = Number.isFinite(materialCount) ? materialCount : items.length;
  const inflight = !!opts.inflight;
  const mappedAt = opts.mappedAt ? String(opts.mappedAt) : '';
  const mapsReady = opts.mapsReady !== false;
  const reasons = [];

  if (!mapsReady) {
    return {
      mode: inflight ? 'need_map' : 'pending',
      reasons: inflight ? ['inflight'] : [],
      unmappedN: 0,
    };
  }

  const unmapped = items.filter((f) => {
    if (!mappedAt) return true;
    const at = filingEventAt(f);
    return !!(at && at > mappedAt);
  });
  let unmappedN = unmapped.length;
  if (unmappedN === 0 && n > 0 && !mappedAt) unmappedN = n;

  const printAt = filingEventAt(print);
  const printNew = !!(print.known && print.in_book === false && (
    !mappedAt || (printAt && printAt > mappedAt)
  ));

  if (inflight) reasons.push('inflight');
  if (!mappedAt) {
    reasons.push('never_mapped');
    if (unmappedN) reasons.push('unmapped_material');
    if (printNew) reasons.push('print_not_in_book');
    return { mode: 'need_map', reasons, unmappedN };
  }
  if (unmappedN) reasons.push('unmapped_material');
  if (printNew) reasons.push('print_not_in_book');
  if (reasons.length) return { mode: 'new', reasons, unmappedN };
  return { mode: 'quiet', reasons, unmappedN: 0 };
}

/** @deprecated use filingsStripMode. pin = need_map | new */
export function filingsAttention(opts = {}) {
  const s = filingsStripMode(opts);
  return {
    pin: s.mode === 'need_map' || s.mode === 'new',
    reasons: s.reasons,
    unmappedN: s.unmappedN,
    mode: s.mode,
  };
}

export function filingsExpandKey(slug) {
  return `cockpit.filings.expand.${String(slug || '').toLowerCase().replace(/[^a-z0-9._-]/g, '')}`;
}

/**
 * Findings are opt-in (Show map) whenever a complete map exists.
 * Catalog (last print / extras / MAP FILINGS) is not gated on this flag.
 */
export function nextFilingsOpen(opts = {}) {
  const mode = opts.mode || 'pending';
  if (mode === 'pending' || mode === 'need_map') return { expanded: false, apply: true };
  return { expanded: opts.stored === '1', apply: true };
}

/** Material rows that are not the last print (print already has its own line). */
export function filingsExtraRows(print, items) {
  const acc = print && print.accession ? String(print.accession) : '';
  const list = Array.isArray(items) ? items : [];
  return list.filter((f) => f && f.accession && (!acc || String(f.accession) !== acc));
}

/** Extra rows that still need a map (newer than last complete map). Quiet shows none. */
export function filingsLedgerExtras(print, items, mappedAt) {
  const extra = filingsExtraRows(print, items);
  if (!mappedAt) return extra;
  const at0 = String(mappedAt);
  return extra.filter((f) => {
    const at = filingEventAt(f);
    return !!(at && at > at0);
  });
}

export function filingsMapList(runs) {
  return (Array.isArray(runs) ? runs : []).filter((r) => r && (r.status === 'complete' || r.status === 'failed'));
}

/** @deprecated use nextFilingsOpen */
export function nextFilingsChrome(opts = {}) {
  const mode = opts.mode || (opts.mapsReady === false
    ? 'pending'
    : (opts.pin ? 'need_map' : 'quiet'));
  return nextFilingsOpen({ mode, stored: opts.stored });
}

export function defaultFilingsExpanded({ attention, stored } = {}) {
  if (attention) return true;
  if (stored === '1') return true;
  return false;
}

export function readFilingsExpandStore(slug, storage) {
  try {
    const s = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    if (!s) return null;
    const v = s.getItem(filingsExpandKey(slug));
    return (v === '1' || v === '0') ? v : null;
  } catch {
    return null;
  }
}

export function writeFilingsExpandStore(slug, value, storage) {
  try {
    const s = storage || (typeof sessionStorage !== 'undefined' ? sessionStorage : null);
    if (!s) return;
    const v = value === '1' || value === true ? '1' : '0';
    s.setItem(filingsExpandKey(slug), v);
  } catch { /* private mode */ }
}

/** One-line collapsed rail. No essays. */
export function filingsRailLabel(opts = {}) {
  const print = opts.print || {};
  const vm = opts.vm || null;
  const bits = [];
  if (print.known) {
    if (print.form) bits.push(String(print.form));
    const day = print.date || print.filed;
    if (day) bits.push(String(day).slice(0, 10));
    if (print.in_book === true) bits.push('IN BOOK');
    else if (print.in_book === false) bits.push('NOT IN BOOK');
  } else {
    bits.push('UNKNOWN');
  }
  if (opts.mapped) bits.push('mapped');
  if (vm) {
    const trips = Array.isArray(vm.houseTripped) ? vm.houseTripped.length : 0;
    if (vm.houseN || trips) bits.push(`${trips} trip${trips === 1 ? '' : 's'}`);
    const add = Array.isArray(vm.addRisk) ? vm.addRisk.length : 0;
    if (add) bits.push(`${add} add-risk`);
  }
  const neu = Number(opts.unmappedN) || 0;
  if (neu > 0) bits.push(`${neu} new`);
  return bits.filter(Boolean).join(' · ');
}

/**
 * View-model for Overview. Notes stay off the default strip (OPEN GROK is the memo).
 * @param {{ summary?: string, delta?: object, finishedAt?: string, runs?: object[] }} opts
 */
export function shapeFilingMapDossier(opts = {}) {
  const delta = opts.delta && typeof opts.delta === 'object' ? opts.delta : {};
  const rowsIn = Array.isArray(delta.rows) ? delta.rows : [];
  const summary = delta.summary || opts.summary || '';
  const headline = dossierHeadline(summary);
  const rows = rowsIn.map((row) => {
    const house = classifyHouseHits(row?.house_hits);
    const risks = classifyRiskHits(row?.risk_hits);
    const gaps = operatorGaps(row?.gaps);
    const addRisk = Array.isArray(row?.add_risk_candidates)
      ? row.add_risk_candidates.filter((c) => c && (c.name || c.title))
      : [];
    return {
      accession: row?.accession || null,
      form: row?.form || null,
      filed: row?.filed || null,
      in_book: row?.in_book,
      what: oneLine(row?.what?.text || '', 160),
      house,
      risks,
      addRisk,
      gaps,
    };
  });

  const houseTripped = rows.flatMap((r) => r.house.tripped);
  const houseN = rows.reduce((n, r) => n + r.house.n, 0);
  const riskFired = rows.flatMap((r) => r.risks.fired);
  const riskWatchN = rows.reduce((n, r) => n + r.risks.watch.length, 0);
  const riskIntactN = rows.reduce((n, r) => n + r.risks.intact.length, 0);
  const riskN = rows.reduce((n, r) => n + r.risks.n, 0);
  const addRisk = rows.flatMap((r) => r.addRisk);
  const operator = rows.flatMap((r) => r.gaps.operator);
  const checked = rows.flatMap((r) => {
    const items = [];
    for (const h of [...r.house.tripped, ...r.house.quiet]) {
      items.push({
        kind: 'house',
        loud: houseHitTrips(h),
        label: oneLine(h.trigger || h.note || 'House trigger', 88),
      });
    }
    for (const rk of [...r.risks.fired, ...r.risks.watch, ...r.risks.intact, ...r.risks.other]) {
      items.push({
        kind: 'risk',
        test: riskTest(rk) || '—',
        loud: riskTest(rk) === 'FIRED',
        label: riskShortName(rk),
      });
    }
    return items;
  });

  const findings = findingsSentences({
    summary,
    rowWhats: rowsIn.map((r) => r?.what?.text || ''),
    addNames: addRisk.map((c) => c.name || c.title),
  });

  return {
    headline,
    findings,
    finishedAt: opts.finishedAt ? String(opts.finishedAt).slice(0, 10) : '',
    rows,
    houseTripped,
    houseN,
    riskFired,
    riskWatchN,
    riskIntactN,
    riskN,
    addRisk,
    operatorGaps: operator,
    checked,
    past: completeMaps(opts.runs).slice(0, 5),
  };
}
