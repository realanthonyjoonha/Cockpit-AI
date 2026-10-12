#!/usr/bin/env python3
"""Revert each review fix in-process and prove the matching fixture fails.

Patches Python and JS together, then checks both. Does not leave the tree
dirty. Exit 0 only if every revert fails its fixture and the restored code
then passes. Do not run beside other tests that import companyfacts.
"""
from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
ONT = ROOT / "ontology"
TAX = ONT / "schema" / "taxonomy_xbrl.json"
PY = ONT / "api" / "companyfacts.py"
JS = ROOT / "memory-cockpit-v2" / "server" / "companyfacts.js"
FIX = ROOT / "harness-stress" / "fixtures" / "companyfacts"
JS_MOD = JS.resolve().as_posix()


def run_py(expr: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        [sys.executable, "-c", expr],
        cwd=str(ONT),
        capture_output=True,
        text=True,
        env={**os.environ, "PYTHONPATH": str(ONT)},
    )


def run_js(expr: str) -> subprocess.CompletedProcess:
    return subprocess.run(
        ["node", "--input-type=module", "-e", expr],
        cwd=str(ROOT),
        capture_output=True,
        text=True,
    )


CHECK_PY = r"""
import json, sys
from pathlib import Path
from api.companyfacts import parse_companyfacts, tagged_slots, headline_gaps, load_taxonomy, STALE_DAYS
root = Path(%r)
def pair(iid):
    doc = json.loads((root/iid/'companyfacts.json').read_text())
    exp = json.loads((root/iid/'expected.json').read_text())
    facts = parse_companyfacts(doc)['facts']
    slots = tagged_slots(facts)
    gaps = headline_gaps(slots, facts=facts)
    return slots, exp, gaps
""" % str(FIX)

CHECK_JS = f"""
import {{ readFileSync }} from 'fs';
import {{ parseCompanyfacts, taggedSlots, headlineGaps, loadTaxonomy, STALE_DAYS }} from '{JS_MOD}';
const root = {json.dumps(str(FIX))};
function pair(id) {{
  const doc = JSON.parse(readFileSync(root + '/' + id + '/companyfacts.json', 'utf8'));
  const facts = parseCompanyfacts(doc).facts;
  const slots = taggedSlots(facts);
  const gaps = headlineGaps(slots, null, facts);
  return {{ slots, gaps }};
}}
"""

BANK_REV = (
    "s, e, g = pair('bank'); assert s['company_revenue']['value_text']=='57347000000' "
    "and s['company_revenue']['concept']=='us-gaap:RevenuesNetOfInterestExpense' "
    "and s['company_revenue']['ytd']['value_text']=='107183000000' and 'total_debt' not in s"
)
BANK_JS = (
    "const s=pair('bank').slots; "
    "if (s.company_revenue?.value_text!=='57347000000' "
    "|| s.company_revenue?.concept!=='us-gaap:RevenuesNetOfInterestExpense' "
    "|| s.company_revenue?.ytd?.value_text!=='107183000000' || s.total_debt) process.exit(1);"
)
TRUE_REV = "s, e, g = pair('true-total'); assert s['company_revenue']['concept']=='us-gaap:Revenues' and s['company_revenue']['value_text']=='182447000000'"
TRUE_JS = "const s=pair('true-total').slots; if (s.company_revenue?.concept!=='us-gaap:Revenues' || s.company_revenue?.value_text!=='182447000000') process.exit(1);"
STALE_REV = "s, e, g = pair('stale-slot'); assert 'total_debt' not in s and any('stale: last reported 2014-06-30' in x for x in g)"
STALE_JS = "const r=pair('stale-slot'); if (r.slots.total_debt || !r.gaps.some(g=>g.includes('stale: last reported 2014-06-30'))) process.exit(1);"
SIXK_REV = "s, e, g = pair('sixk-nofp'); assert s['company_revenue']['value_text']=='80000000' and s['company_revenue']['ytd']['value_text']=='170000000'"
SIXK_JS = "const s=pair('sixk-nofp').slots; if (s.company_revenue?.value_text!=='80000000' || s.company_revenue?.ytd?.value_text!=='170000000') process.exit(1);"
TENKT_REV = "s, e, g = pair('tenkt-q'); assert s['company_revenue']['value_text']=='440000000' and s['company_revenue']['form']=='10-KT'"
TENKT_JS = "const s=pair('tenkt-q').slots; if (s.company_revenue?.value_text!=='440000000' || s.company_revenue?.form!=='10-KT') process.exit(1);"
KQ4_REV = "s, e, g = pair('k-vs-q4'); assert s['company_revenue']['value_text']=='1000000000' and s['company_revenue']['form']=='10-K'"
KQ4_JS = "const s=pair('k-vs-q4').slots; if (s.company_revenue?.value_text!=='1000000000' || s.company_revenue?.form!=='10-K') process.exit(1);"
PYTD_REV = (
    "s, e, g = pair('primary-ytd'); assert s['company_revenue']['concept']=='us-gaap:SalesRevenueNet' "
    "and s['company_revenue']['value_text']=='80000000' and s['company_revenue']['ytd']['value_text']=='500000000'"
)
PYTD_JS = (
    "const s=pair('primary-ytd').slots; "
    "if (s.company_revenue?.concept!=='us-gaap:SalesRevenueNet' || s.company_revenue?.value_text!=='80000000' "
    "|| s.company_revenue?.ytd?.value_text!=='500000000') process.exit(1);"
)
SPAN_REV = "a,_e,_=pair('span-tie'); b,_f,_=pair('span-tie-rev'); assert a['company_revenue']['value_text']=='200000000' and b['company_revenue']['value_text']==a['company_revenue']['value_text']"
SPAN_JS = "const a=pair('span-tie').slots; const b=pair('span-tie-rev').slots; if (a.company_revenue?.value_text!=='200000000' || b.company_revenue?.value_text!==a.company_revenue?.value_text) process.exit(1);"
TAX_REV = "t=load_taxonomy(); listed=list(t['metrics']['company_revenue'].get('concepts') or [])+list(t['metrics']['company_revenue'].get('fallback') or []); assert 'us-gaap:OperatingLeaseLeaseIncome' not in listed"
TAX_JS = "const t=loadTaxonomy(); const listed=[...(t.metrics.company_revenue.concepts||[]), ...(t.metrics.company_revenue.fallback||[])]; if (listed.includes('us-gaap:OperatingLeaseLeaseIncome')) process.exit(1);"
SIXKFY_REV = "s, e, g = pair('sixk-fy-q'); assert s['company_revenue']['value_text']=='250000000' and s['company_revenue'].get('ytd') is None"
SIXKFY_JS = "const s=pair('sixk-fy-q').slots; if (s.company_revenue?.value_text!=='250000000' || s.company_revenue?.ytd) process.exit(1);"
TENKTSHORT_REV = "s, e, g = pair('tenkt-short'); assert s['company_revenue']['value_text']=='340000000' and s['company_revenue']['form']=='10-KT'"
TENKTSHORT_JS = "const s=pair('tenkt-short').slots; if (s.company_revenue?.value_text!=='340000000' || s.company_revenue?.form!=='10-KT') process.exit(1);"
LEASE_REV = "s, e, g = pair('lease-only'); assert s['company_revenue']['concept']=='us-gaap:OperatingLeaseLeaseIncome' and any('lease income only' in x for x in g)"
LEASE_JS = "const r=pair('lease-only'); if (r.slots.company_revenue?.concept!=='us-gaap:OperatingLeaseLeaseIncome' || !r.gaps.includes('company_revenue: lease income only')) process.exit(1);"
PAD_REV = "s, e, g = pair('stale-pad'); assert s['total_debt']['value_text']=='500000000' and 'interest_revenue' not in s and STALE_DAYS==760"
PAD_JS = "const r=pair('stale-pad'); if (r.slots.total_debt?.value_text!=='500000000' || r.slots.interest_revenue || STALE_DAYS!==760) process.exit(1);"


def check_py(snippet: str) -> bool:
    return run_py(CHECK_PY + "\n" + snippet).returncode == 0


def check_js(snippet: str) -> bool:
    return run_js(CHECK_JS + "\n" + snippet).returncode == 0


def expect_fail(name: str, py_snippet: str, js_snippet: str) -> None:
    if check_py(py_snippet):
        raise SystemExit(f"{name}: python still passed after revert")
    if check_js(js_snippet):
        raise SystemExit(f"{name}: js still passed after revert")
    print(f"PROVED {name} fails when reverted (py+js)")


def expect_pass(name: str, py_snippet: str, js_snippet: str) -> None:
    if not check_py(py_snippet):
        proc = run_py(CHECK_PY + "\n" + py_snippet)
        raise SystemExit(f"{name}: python failed after restore\n{proc.stderr}\n{proc.stdout}")
    if not check_js(js_snippet):
        proc = run_js(CHECK_JS + "\n" + js_snippet)
        raise SystemExit(f"{name}: js failed after restore\n{proc.stderr}\n{proc.stdout}")
    print(f"OK {name} restored (py+js)")


def replace_once(path: Path, old: str, new: str) -> None:
    text = path.read_text(encoding="utf-8")
    if old not in text:
        raise SystemExit(f"missing patch needle in {path}")
    path.write_text(text.replace(old, new, 1), encoding="utf-8")


def main() -> None:
    backups = {p: p.read_text(encoding="utf-8") for p in (TAX, PY, JS)}

    def restore() -> None:
        for p, text in backups.items():
            p.write_text(text, encoding="utf-8")

    try:
        tax = json.loads(TAX.read_text())
        tax["metrics"]["company_revenue"]["fallback"].insert(0, "us-gaap:OperatingLeaseLeaseIncome")
        TAX.write_text(json.dumps(tax, indent=2) + "\n")
        expect_fail("true-total/taxonomy", TRUE_REV, TRUE_JS)
        expect_fail("taxonomy-list", TAX_REV, TAX_JS)
        restore()

        tax = json.loads(TAX.read_text())
        tax["metrics"]["company_revenue"]["fallback"] = [
            c for c in tax["metrics"]["company_revenue"]["fallback"]
            if c != "us-gaap:RevenuesNetOfInterestExpense"
        ]
        TAX.write_text(json.dumps(tax, indent=2) + "\n")
        expect_fail("bank/rnie", BANK_REV, BANK_JS)
        restore()

        replace_once(PY, "STALE_DAYS = 760", "STALE_DAYS = 730")
        replace_once(JS, "export const STALE_DAYS = 760;", "export const STALE_DAYS = 730;")
        expect_fail("stale-pad", PAD_REV, PAD_JS)
        expect_fail("stale-slot", STALE_REV, STALE_JS)
        restore()

        replace_once(PY, 'INTERIM_FORMS = {"10-Q", "6-K"}', 'INTERIM_FORMS = {"10-Q"}')
        replace_once(JS, "const INTERIM_FORMS = new Set(['10-Q', '6-K']);", "const INTERIM_FORMS = new Set(['10-Q']);")
        expect_fail("sixk-nofp", SIXK_REV, SIXK_JS)
        restore()

        replace_once(
            PY,
            '            return form_family(w.get("form")) in ANNUAL_FORMS\n',
            '            return form_family(w.get("form")) in ANNUAL_FORMS or form_family(w.get("form")) == "6-K"\n',
        )
        replace_once(
            JS,
            "    const annualFormAnnual = atEnd.some(([w]) => kindOf(w) === 'annual' && ANNUAL_FORMS.has(formFamily(w.form)));\n",
            "    const annualFormAnnual = atEnd.some(([w]) => kindOf(w) === 'annual' && (ANNUAL_FORMS.has(formFamily(w.form)) || formFamily(w.form) === '6-K'));\n",
        )
        expect_fail("sixk-fy-q", SIXKFY_REV, SIXKFY_JS)
        restore()

        replace_once(
            PY,
            "        annual_form_annual = any(_annual_anchor(w) for w, _ in at_end)\n",
            "        annual_form_annual = False\n",
        )
        replace_once(
            JS,
            "    const annualFormAnnual = atEnd.some(([w]) => kindOf(w) === 'annual' && ANNUAL_FORMS.has(formFamily(w.form)));\n",
            "    const annualFormAnnual = false;\n",
        )
        expect_fail("tenkt-q", TENKT_REV, TENKT_JS)
        expect_fail("k-vs-q4", KQ4_REV, KQ4_JS)
        restore()

        replace_once(
            PY,
            '    if family == "10-KT" and fp_u == "FY":\n        return "annual"\n    if fp_u == "FY" and family in ANNUAL_FORMS:\n        return "annual"\n',
            "",
        )
        replace_once(
            JS,
            "  if (family === '10-KT' && fpU === 'FY') return 'annual';\n  if (fpU === 'FY' && ANNUAL_FORMS.has(family)) return 'annual';\n",
            "",
        )
        expect_fail("tenkt-short", TENKTSHORT_REV, TENKTSHORT_JS)
        restore()

        replace_once(
            PY,
            "            return (dur, -cidx, span, w.get(\"filed\") or \"\", w.get(\"accession\") or \"\")",
            "            return (-cidx, dur, span, w.get(\"filed\") or \"\", w.get(\"accession\") or \"\")",
        )
        replace_once(
            JS,
            "      return [dur, -(cidx < 0 ? 99 : cidx), span, w.filed || '', w.accession || ''];",
            "      return [-(cidx < 0 ? 99 : cidx), dur, span, w.filed || '', w.accession || ''];",
        )
        expect_fail("primary-ytd", PYTD_REV, PYTD_JS)
        restore()

        replace_once(
            PY,
            "            return (dur, -cidx, span, w.get(\"filed\") or \"\", w.get(\"accession\") or \"\")",
            "            return (dur, -cidx, 0, w.get(\"filed\") or \"\", w.get(\"accession\") or \"\")",
        )
        replace_once(
            JS,
            "      return [dur, -(cidx < 0 ? 99 : cidx), span, w.filed || '', w.accession || ''];",
            "      return [dur, -(cidx < 0 ? 99 : cidx), 0, w.filed || '', w.accession || ''];",
        )
        expect_fail("span-tie", SPAN_REV, SPAN_JS)
        restore()

        replace_once(
            PY,
            """        true_total_on_filer = any(
            (not f.get("dimensional")) and f.get("concept") in concepts
            for f in facts or []
        )
        if not cands and mid == "company_revenue" and not true_total_on_filer:
            cands = [f for f in pool if f.get("concept") == LEASE_REVENUE]
            lease_only = bool(cands)
            if lease_only:
                concepts = concepts + [LEASE_REVENUE]
""",
            "",
        )
        replace_once(
            JS,
            """    const trueTotalOnFiler = (facts || []).some((f) => !f.dimensional && concepts.includes(f.concept));
    if (!cands.length && mid === 'company_revenue' && !trueTotalOnFiler) {
      cands = pool.filter((f) => f.concept === LEASE_REVENUE);
      leaseOnly = cands.length > 0;
      if (leaseOnly) concepts = [...concepts, LEASE_REVENUE];
    }
""",
            "",
        )
        expect_fail("lease-only", LEASE_REV, LEASE_JS)
        restore()

        for name, py_s, js_s in [
            ("true-total", TRUE_REV, TRUE_JS),
            ("bank", BANK_REV, BANK_JS),
            ("stale-slot", STALE_REV, STALE_JS),
            ("stale-pad", PAD_REV, PAD_JS),
            ("sixk-nofp", SIXK_REV, SIXK_JS),
            ("sixk-fy-q", SIXKFY_REV, SIXKFY_JS),
            ("tenkt-q", TENKT_REV, TENKT_JS),
            ("tenkt-short", TENKTSHORT_REV, TENKTSHORT_JS),
            ("k-vs-q4", KQ4_REV, KQ4_JS),
            ("primary-ytd", PYTD_REV, PYTD_JS),
            ("span-tie", SPAN_REV, SPAN_JS),
            ("lease-only", LEASE_REV, LEASE_JS),
            ("taxonomy-list", TAX_REV, TAX_JS),
        ]:
            expect_pass(name, py_s, js_s)
    finally:
        restore()
    print("all review-fix reverts proved (py+js)")


if __name__ == "__main__":
    main()
