// Shared EDGAR filing link helpers — Overview + Research pipeline (all thin desks).
// Decision-support only. Not pack/house SoR.

export function filingDocLabel(f) {
  const form = String(f?.form || '').trim();
  const desc = String(f?.primary_doc_description || '').trim();
  const doc = String(f?.primary_document || '').trim();
  if (desc && desc.toUpperCase() !== form.toUpperCase()) return desc;
  if (doc) return doc;
  return f?.accession || 'Open on EDGAR';
}

export function companyEdgarUrl(cik) {
  if (cik == null || cik === '') return null;
  const id = String(cik).replace(/\D/g, '');
  if (!id) return null;
  return `https://www.sec.gov/cgi-bin/browse-edgar?action=getcompany&CIK=${encodeURIComponent(id)}&owner=include&count=40`;
}
