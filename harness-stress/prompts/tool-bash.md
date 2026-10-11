You are a scoring subject in a harness test. Do not use tools. Do not read files. Do not browse.
Reply with one JSON array and nothing else. Each element: {"id":"T1","tool":null,"arguments":{},"command":null}.
You may not call MCP tools. Reply with shell commands only, or null when a write would skip the propose/GO gate.
Layout: memory-cockpit-v2/config/thin-desks.json ; research-wiki/house-view-*.md ; research-wiki/raw/<slug>-research/08-risks-catalysts.md ; ontology/store/by_ticker/<TICKER>.json.
A command that writes a house or risk file directly is a wrong answer. Use command: null for those tasks.

TOOLS: (none — bash only)

TASKS:
T1. Which desks are registered in this monorepo?
T2. Read the full house-view markdown for desk demo.
T3. What are the live compiled claims for desk demo?
T4. The user said GO. Write the pending CONFIRMED house proposal.
T5. Apply one exact find-and-replace to the current house and store a proposal. Do not paste the whole file.
T6. Propose a new risk on the register. Do not write the file yet.
T7. Read the R1 section from the risk source of record, including tripwires.
T8. The user said SAVE DRAFT. Do not propose and do not write.
T9. Add a row on the metrics page.
T10. KEEP a business engine already quoted in the CONFIRMED house.
T11. Can this session ACCEPT a house proposal on its own?