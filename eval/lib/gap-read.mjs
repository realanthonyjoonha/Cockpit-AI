/**
 * Transcript read: which pack fields invented answers lean on.
 * Needles are generic pack-field names, not issuer-specific.
 */

export const PACK_FIELD_NEEDLES = [
  { field: 'house_canary', re: /CANARY-HOUSE-[A-Z0-9]+/ },
  { field: 'watch', re: /\bnamed watch\b|\bbinding watch\b/i },
  { field: 'stance', re: /\bstance\b|\bfixture house\b/i },
  { field: 'mechanism', re: /\bmechanism\b/i },
  { field: 'flip', re: /\bwould flip\b|\bflip-trigger\b|\bflip\b/i },
  { field: 'risk1', re: /\bR1\b/ },
  { field: 'risk2', re: /\bR2\b/ },
  { field: 'risk_register', re: /\brisk register\b|\bWATCH\b/ },
  { field: 'notes', re: /\bfixture note\b/i },
  { field: 'facts_block', re: /\btagged SEC companyfacts\b|\bcompanyfacts\b/i },
  { field: 'guardrails', re: /\bempty-when-unsure\b|\bGO writes\b|\b10,000 characters\b/i },
];

export function fieldsInText(text) {
  const body = String(text || '');
  return PACK_FIELD_NEEDLES.filter((n) => n.re.test(body)).map((n) => n.field);
}

export function readArmTranscripts(scored, armId) {
  const rows = (scored || []).filter((r) => r.arm === armId);
  const invented = rows.filter((r) => r.hallucination || (r.numbers || []).length);
  const honest = rows.filter((r) => r.honest_gap);
  const fieldCounts = {};
  const inventedExcerpts = [];
  for (const row of invented) {
    const fields = fieldsInText(row.answer || row.answer_excerpt || '');
    for (const f of fields) fieldCounts[f] = (fieldCounts[f] || 0) + 1;
    inventedExcerpts.push({
      item_id: row.item_id,
      question_id: row.question_id,
      repeat: row.repeat,
      fields,
      excerpt: String(row.answer || '').slice(0, 280),
      numbers: row.numbers || [],
    });
  }
  return {
    arm: armId,
    n: rows.length,
    honest_gap: honest.length,
    invented: invented.length,
    field_counts: fieldCounts,
    invented_excerpts: inventedExcerpts,
  };
}

export function summarizeWhyBFills(reads) {
  const b = reads.find((r) => r.arm === 'full') || reads.find((r) => r.arm === 'B');
  if (!b) return 'No full-harness transcripts to read.';
  const ranked = Object.entries(b.field_counts || {}).sort((a, c) => c[1] - a[1]);
  if (!b.invented) {
    return 'Arm B did not invent numbers on these gap items; pack fields were not used to fill a missing figure.';
  }
  if (!ranked.length) {
    return 'Arm B invented numbers without naming pack fields (parametric or web-shaped fill, not an explicit vault cite).';
  }
  const top = ranked.slice(0, 4).map(([f, n]) => `${f} (${n})`).join(', ');
  return `Invented B answers most often lean on pack fields: ${top}.`;
}
