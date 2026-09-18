// Shared EDGAR filing link helpers — Overview + pipeline (all thin desks).
// Decision-support only. Not pack/house SoR.

/** EDGAR accession as a headline looks like a tracking number, not a filing. */
export function looksLikeAccession(s) {
  const t = String(s || '').trim();
  if (/^\d{10}-\d{2}-\d{6}$/.test(t)) return true;
  if (/^\d{18,}$/.test(t.replace(/-/g, ''))) return true;
  return false;
}

export function filingDocLabel(f) {
  const form = String(f?.form || '').trim();
  const desc = String(f?.primary_doc_description || '').trim();
  const doc = String(f?.primary_document || '').trim();
  if (desc && desc.toUpperCase() !== form.toUpperCase() && !looksLikeAccession(desc)) return desc;
  if (doc && !looksLikeAccession(doc) && !/^\d/.test(doc)) return doc;
  return 'Open on EDGAR';
}

/** Prefer server item_label; fall back to raw 8-K item codes. Never invent a gloss. */
export function filingItemText(f) {
  const label = String(f?.item_label || '').trim();
  if (label) return label;
  return String(f?.items || '').trim();
}

export function inBookChip(inBook) {
  if (inBook === true) return { t: 'IN BOOK', cls: 'ok' };
  if (inBook === false) return { t: 'NOT IN BOOK', cls: 'watch' };
  return { t: 'PACK —', cls: '' };
}

export function companyEdgarUrl(cik) {
  if (cik == null || cik === '') return null;
  const id = String(cik).replace(/\D/g, '');
  if (!id) return null;
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(id)}&owner=include&count=40`;
}
