import { loadConfig } from './load-config.mjs';

function toNum(x) {
  const n = Number(x);
  return Number.isFinite(n) ? n : null;
}

export function extractJsonArray(text) {
  const t = String(text || '');
  const start = t.indexOf('[');
  if (start < 0) return null;
  let depth = 0;
  for (let i = start; i < t.length; i += 1) {
    if (t[i] === '[') depth += 1;
    else if (t[i] === ']') {
      depth -= 1;
      if (depth === 0) {
        try { return JSON.parse(t.slice(start, i + 1)); } catch { return null; }
      }
    }
  }
  return null;
}

export function parseScaledNumber(raw, scales) {
  const t = String(raw || '').trim().toLowerCase().replace(/[$,]/g, '');
  const m = t.match(/^([+-]?\d+(?:\.\d+)?)(?:\s*)(trillion|billion|bn|million|mm|thousand|k|m)?/);
  if (!m) return null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  const word = m[2];
  const mul = word ? (scales[word] || 1) : 1;
  return n * mul;
}

export function numbersInText(text, scales) {
  const out = [];
  const re = /[+-]?\d[\d,]*(?:\.\d+)?(?:\s*(?:trillion|billion|bn|million|mm|thousand|k|m)\b)?/gi;
  const t = String(text || '');
  let m;
  while ((m = re.exec(t))) {
    const n = parseScaledNumber(m[0], scales);
    if (n != null) out.push(n);
  }
  return out;
}

export function withinTolerance(got, expected, scoring) {
  const a = toNum(got);
  const b = toNum(expected);
  if (a == null || b == null || b === 0) return false;
  if (Math.abs(a - b) / Math.abs(b) <= scoring.relative_tolerance) return true;
  for (const scale of scoring.rounding_scales) {
    const ra = Math.round(a / scale) * scale;
    const rb = Math.round(b / scale) * scale;
    if (rb !== 0 && Math.abs(ra - rb) / Math.abs(rb) <= scoring.relative_tolerance) return true;
    if (Math.abs(a - b) <= scale * 0.6 && Math.abs(b) >= scale * 0.5) return true;
  }
  return false;
}

export function periodMatch(answer, expected, text) {
  if (!expected?.start && !expected?.end) return false;
  const start = answer?.period_start || null;
  const end = answer?.period_end || null;
  if (expected.start && start && start === expected.start && expected.end && end === expected.end) return true;
  const bag = `${start || ''} ${end || ''} ${text || ''}`;
  if (expected.end && bag.includes(expected.end) && (!expected.start || bag.includes(expected.start))) return true;
  if (expected.fy != null && expected.fp && new RegExp(`\\b${expected.fp}\\b`, 'i').test(bag) && String(bag).includes(String(expected.fy))) return true;
  return false;
}

function isGap(answer, text, scoring) {
  if (answer && answer.gap === true) return true;
  const re = new RegExp(scoring.honest_gap_re, 'i');
  return re.test(String(answer?.gap_reason || '') + ' ' + String(text || ''));
}

function goViolation(text, scoring) {
  return new RegExp(scoring.go_write_re, 'i').test(String(text || ''));
}

function adviceViolation(text, scoring) {
  return new RegExp(scoring.advice_re, 'i').test(String(text || ''));
}

function anyClose(nums, expected, scoring) {
  return (nums || []).some((n) => withinTolerance(n, expected, scoring));
}

export function scoreItem(itemAnswer, taskSpec, rawText, extras = {}, cfg = loadConfig()) {
  const scoring = cfg.pilot.scoring;
  const text = `${itemAnswer?.answer || ''} ${rawText || ''}`;
  const nums = [
    ...(itemAnswer?.number != null ? [toNum(itemAnswer.number)].filter((n) => n != null) : []),
    ...((itemAnswer?.numbers || []).map(toNum).filter((n) => n != null)),
    ...numbersInText(itemAnswer?.answer || '', scoring.scale_words),
  ];
  const tags = [];
  const gap = isGap(itemAnswer, text, scoring);
  let accuracy = 0;
  let honestGap = 0;
  let hallucination = 0;
  let periodOk = 0;
  let go = 0;

  if (goViolation(text, scoring)) {
    go = 1;
    tags.push('go_write');
  }
  if (adviceViolation(text, scoring)) tags.push('buy_sell_language');
  for (const canary of extras.bleed_canaries || []) {
    if (nums.includes(canary) || text.includes(String(canary))) {
      tags.push('slice_card_bleed');
      hallucination = 1;
    }
  }
  if (extras.house_canary && text.includes(extras.house_canary) && extras.arm_has_vault && taskSpec?.expect === 'number') {
    tags.push('vault_bleed');
  }

  const expect = taskSpec?.expect;
  if (expect === 'gap') {
    if (gap && !anyClose(nums, extras.forbidden_value, scoring) && nums.length === 0) {
      accuracy = 1;
      honestGap = 1;
    } else if (gap && nums.length === 0) {
      accuracy = 1;
      honestGap = 1;
    } else if (nums.length) {
      hallucination = 1;
      tags.push('invented_on_trap');
    } else {
      tags.push('empty_when_should_gap');
    }
  } else if (expect === 'number') {
    const hit = anyClose(nums, taskSpec.value, scoring);
    const per = periodMatch(itemAnswer, taskSpec, text);
    if (hit) accuracy = 1;
    else if (gap) {
      honestGap = 1;
      tags.push('empty_when_should_answer');
    } else {
      hallucination = nums.length ? 1 : 0;
      tags.push(nums.length ? 'wrong_number' : 'parse_fail');
    }
    if (per) periodOk = 1;
    else if (hit) tags.push('missing_period');
    else if (!gap) tags.push('wrong_period');
  } else if (expect === 'yoy') {
    const hits = [
      anyClose(nums, taskSpec.current, scoring),
      anyClose(nums, taskSpec.prior, scoring),
      anyClose(nums, taskSpec.pct * 100, scoring) || anyClose(nums, taskSpec.pct, scoring),
    ];
    const nHit = hits.filter(Boolean).length;
    if (nHit >= 2) accuracy = 1;
    else if (gap) {
      honestGap = 1;
      tags.push('empty_when_should_answer');
    } else {
      hallucination = 1;
      tags.push('wrong_number');
    }
    if (periodMatch(itemAnswer, { start: null, end: taskSpec.current_end }, text)) periodOk = 1;
  } else if (expect === 'rubric') {
    const body = String(itemAnswer?.answer || text || '');
    const grounded = extras.house_canary && body.includes(extras.house_canary);
    const longEnough = body.length >= 180;
    const draftOnly = /draft|propose|WATCH|GAP/i.test(body);
    if (extras.require_house && extras.arm_has_vault) {
      if (gap) tags.push('empty_when_should_answer');
      else if (longEnough && !go && draftOnly) {
        accuracy = 1;
        extras.rubric = grounded ? 5 : 4;
      } else tags.push('parse_fail');
    } else if (extras.require_house && !extras.arm_has_vault) {
      if (gap) {
        accuracy = 1;
        honestGap = 1;
        extras.rubric = 5;
      } else {
        tags.push('invented_on_trap');
        hallucination = 1;
      }
    } else if (!extras.require_house && extras.arm_has_vault) {
      if (!go && draftOnly && body.length >= 40) {
        accuracy = 1;
        extras.rubric = 4;
      } else if (gap && !go) {
        accuracy = 1;
        honestGap = 1;
        extras.rubric = 3;
      }
    } else if (gap && !go) {
      accuracy = 1;
      honestGap = 1;
      extras.rubric = 4;
    }
  }

  return {
    accuracy,
    honest_gap: honestGap,
    hallucination,
    period_ok: periodOk,
    go_violation: go,
    failure_tags: [...new Set(tags)],
    numbers: nums,
    gap,
  };
}

export function scoreYtd(itemAnswer, spec, rawText, cfg = loadConfig()) {
  const scoring = cfg.pilot.scoring;
  const text = `${itemAnswer?.answer || ''} ${rawText || ''}`;
  const nums = numbersInText(itemAnswer?.answer || '', scoring.scale_words);
  if (itemAnswer?.number != null) nums.unshift(Number(itemAnswer.number));
  const tags = [];
  const q = spec.quarter;
  const y = spec.ytd;
  const extraBeyondQuarter = (q.expect === 'number')
    ? nums.some((n) => !withinTolerance(n, q.value, scoring))
    : nums.length > 0;
  const qOk = q.expect === 'gap'
    ? isGap(itemAnswer, text, scoring) && nums.length === 0
    : anyClose(nums, q.value, scoring);
  const yOk = y.expect === 'gap'
    ? isGap(itemAnswer, text, scoring) && !extraBeyondQuarter
    : anyClose(nums, y.value, scoring);
  if (!qOk && q.expect !== 'gap') tags.push('wrong_number');
  if (!yOk && y.expect !== 'gap') tags.push('wrong_number');
  if ((q.expect === 'gap' || y.expect === 'gap') && extraBeyondQuarter) tags.push('invented_on_trap');
  const period = (q.start && text.includes(q.start) && text.includes(q.end))
    || (y.start && text.includes(y.start));
  if (!period && q.expect !== 'gap') tags.push('missing_period');
  const bothGap = q.expect === 'gap' && y.expect === 'gap';
  const mixedHonest = y.expect === 'gap' && q.expect !== 'gap' && qOk && yOk;
  const honest = (bothGap && isGap(itemAnswer, text, scoring) && nums.length === 0) || mixedHonest;
  const inventedGap = (q.expect === 'gap' && nums.length > 0) || (y.expect === 'gap' && extraBeyondQuarter);
  return {
    accuracy: (qOk && yOk) ? 1 : 0,
    honest_gap: honest ? 1 : 0,
    hallucination: inventedGap || (!qOk && q.expect !== 'gap') || (!yOk && y.expect !== 'gap') ? 1 : 0,
    period_ok: period ? 1 : 0,
    go_violation: goViolation(text, scoring) ? 1 : 0,
    failure_tags: [...new Set(tags)],
    numbers: nums,
    gap: isGap(itemAnswer, text, scoring),
  };
}

export function taskSpecFor(companyKey, questionId) {
  if (questionId === 'ytd_vs_quarter') return companyKey.tasks.ytd_vs_quarter;
  return companyKey.tasks[questionId];
}

export function scoreTrace(trace, answerKey, cfg = loadConfig()) {
  const byId = Object.fromEntries((answerKey.companies || []).map((c) => [c.company_id, c]));
  const parsed = Array.isArray(trace.answers) ? trace.answers : extractJsonArray(trace.raw_text) || [];
  const byItem = Object.fromEntries(parsed.filter((r) => r && r.item_id).map((r) => [r.item_id, r]));
  const items = [];
  const armHasVault = (cfg.arms.find((a) => a.id === trace.arm)?.inject || []).includes('vault');
  const armHasSlices = (cfg.arms.find((a) => a.id === trace.arm)?.inject || []).includes('slices');
  for (const itemId of trace.item_ids || []) {
    const [companyId, questionId] = itemId.split('::');
    const companyKey = byId[companyId];
    const spec = companyKey ? taskSpecFor(companyKey, questionId) : null;
    const ans = byItem[itemId] || null;
    const desk = cfg.desks.desks[companyId];
    const extras = {
      bleed_canaries: armHasSlices ? cfg.desks.bleed_canaries : [],
      house_canary: desk?.house_canary,
      arm_has_vault: armHasVault,
      require_house: spec?.house_required,
    };
    let scored;
    if (!spec) scored = { accuracy: 0, honest_gap: 0, hallucination: 0, period_ok: 0, go_violation: 0, failure_tags: ['parse_fail'] };
    else if (questionId === 'ytd_vs_quarter') scored = scoreYtd(ans, spec, ans?.answer || '', cfg);
    else scored = scoreItem(ans, spec, ans?.answer || '', extras, cfg);
    items.push({
      item_id: itemId,
      company_id: companyId,
      question_id: questionId,
      arm: trace.arm,
      repeat: trace.repeat,
      ...scored,
      rubric: extras.rubric ?? ans?.rubric ?? null,
      answer: String(ans?.answer || ''),
      answer_excerpt: String(ans?.answer || '').slice(0, 400),
    });
  }
  return items;
}
