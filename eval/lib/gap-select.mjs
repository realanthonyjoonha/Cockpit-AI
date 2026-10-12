/**
 * Gap-item rule: keep a (company, ask) pair only when the answer cannot be
 * read from tagged latest-filing companyfacts or from populated pack fields.
 * Selection is catalog-order × company-list-order. No hand-picked list.
 * No per-ticker branches. No hardcoded figures.
 */

export const GAP_RULE_TEXT = `A (company, catalog-ask) pair is a gap-item iff both hold:

1. Tagged slots: if the ask names a needed_slot, that metric id has no values
   in the company's latest-filing slots_summary (including metrics whose
   taxonomy concepts list is empty, and metrics that are not in the taxonomy).
2. Pack fields: if the ask names needed_pack_fields, none of those keys are
   populated on the generated desk. Populated keys are only the fields the
   vault generator actually writes (stance, watch, mechanism, flip, risk1_*,
   risk2_*, notes, house_canary). Qualitative flip/watch text does not count
   as a numeric answer.

Walk companies in config-list order. For company i, try catalog items starting
at i (then wrap) and keep the first unused ask that is a gap for that company.
If the target count is not reached, a second pass walks remaining pairs in
company-list × catalog order. Stop at target_questions (clamp 8–12).

The selected set is therefore a function of (live tagged slots, generated pack
fields, catalog, company list). It is not a hand-picked list.`;

export function populatedPackFields(desk) {
  const keys = [
    'stance', 'watch', 'mechanism', 'flip',
    'risk1_name', 'risk1_mechanism', 'risk1_signal', 'risk1_trip',
    'risk2_name', 'risk2_mechanism', 'risk2_signal', 'risk2_trip',
    'notes', 'house_canary',
  ];
  const out = new Set();
  for (const k of keys) {
    if (desk && desk[k]) out.add(k);
  }
  return out;
}

export function slotHasValues(companyKey, slotId) {
  if (!slotId) return false;
  const slot = companyKey?.slots_summary?.[slotId];
  return Boolean(slot && Array.isArray(slot.values) && slot.values.length > 0);
}

export function isGapPair(companyKey, desk, ask) {
  if (!ask) return false;
  if (ask.needed_slot && slotHasValues(companyKey, ask.needed_slot)) return false;
  const pack = populatedPackFields(desk);
  for (const field of ask.needed_pack_fields || []) {
    if (pack.has(field) || (desk && desk[field])) return false;
  }
  return true;
}

export function selectGapItems(answerKey, cfg) {
  const catalog = cfg.questions.questions || [];
  const companies = cfg.companies || [];
  const keyById = Object.fromEntries((answerKey.companies || []).map((c) => [c.company_id, c]));
  const target = Math.min(
    cfg.gap?.max_questions || 12,
    Math.max(cfg.gap?.min_questions || 8, cfg.gap?.target_questions || 10),
  );
  const selected = [];
  const seen = new Set();

  function tryPair(company, ask, reason) {
    const itemId = `${company.id}::${ask.id}`;
    if (seen.has(itemId)) return false;
    const companyKey = keyById[company.id];
    const desk = cfg.desks?.desks?.[company.id];
    if (!isGapPair(companyKey, desk, ask)) return false;
    const why = [];
    if (ask.needed_slot) why.push(`slot ${ask.needed_slot} untagged`);
    else why.push('no needed_slot');
    const missingPack = (ask.needed_pack_fields || []).filter((f) => !populatedPackFields(desk).has(f) && !(desk && desk[f]));
    if (missingPack.length) why.push(`pack missing ${missingPack.join(',')}`);
    selected.push({
      item_id: itemId,
      company_id: company.id,
      ticker: company.ticker,
      question_id: ask.id,
      needed_slot: ask.needed_slot,
      needed_pack_fields: ask.needed_pack_fields || [],
      reason: [reason, ...why].filter(Boolean).join('; '),
    });
    seen.add(itemId);
    return true;
  }

  for (let i = 0; i < companies.length && selected.length < target; i += 1) {
    const company = companies[i];
    for (let off = 0; off < catalog.length; off += 1) {
      const ask = catalog[(i + off) % catalog.length];
      if (tryPair(company, ask, 'pass-1 rotate')) break;
    }
  }
  if (selected.length < target) {
    for (const company of companies) {
      for (const ask of catalog) {
        if (selected.length >= target) break;
        tryPair(company, ask, 'pass-2 remainder');
      }
    }
  }
  return {
    rule: GAP_RULE_TEXT,
    target,
    n: selected.length,
    items: selected,
  };
}

export function itemAllowed(company, question, cfg) {
  if (!cfg.gapItems || !cfg.gapItems.length) return true;
  return cfg.gapItems.some((g) => g.company_id === company.id && g.question_id === question.id);
}

export function attachGapTasks(answerKey, catalog) {
  for (const companyKey of answerKey.companies || []) {
    companyKey.tasks = companyKey.tasks || {};
    for (const ask of catalog || []) {
      companyKey.tasks[ask.id] = {
        expect: 'gap',
        reason: [
          ask.needed_slot ? `${ask.needed_slot} not tagged in latest-filing slots` : 'no companyfacts slot',
          (ask.needed_pack_fields || []).length
            ? `pack fields ${ask.needed_pack_fields.join(',')} not populated`
            : 'pack has no numeric field for this ask',
        ].join('; '),
        needed_slot: ask.needed_slot,
        needed_pack_fields: ask.needed_pack_fields || [],
      };
    }
  }
  return answerKey;
}

export function applyGapSelection(cfg, answerKey) {
  const selection = selectGapItems(answerKey, cfg);
  const min = cfg.gap?.min_questions || 8;
  const max = cfg.gap?.max_questions || 12;
  if (selection.n < min || selection.n > max) {
    throw new Error(`gap selection produced ${selection.n} items; need ${min}–${max}`);
  }
  cfg.gapItems = selection.items;
  attachGapTasks(answerKey, cfg.questions.questions);
  return selection;
}
