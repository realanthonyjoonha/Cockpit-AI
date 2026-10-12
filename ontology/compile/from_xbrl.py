"""Back-compat name. Filing facts now come from the companyfacts cache."""
from compile.from_companyfacts import load_companyfacts as load_filing_facts  # noqa: F401
