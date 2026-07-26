# Phase 6 — Thin agent operator (ontology client)

**Status:** SHIPPED  
**Date:** 2026-07-20  

## Goal

Any AI agent (Grok in this chat, Claude, future Jarvis) should **default to the ontology** for MU underwrite questions instead of free-roaming the vault or inventing numbers.

## Deliverables

1. `agent context` builder — one command assembles pack-only answer material for a question  
2. CLI: `ont agent MU "<question>"`  
3. `AGENTS.md` contract for agents working in this repo  
4. Optional Grok skill pointer  
5. Tests + smoke  

## Non-goals

- Voice / STT / TTS  
- House-view writes  
- Cockpit UI  
- Multi-ticker  
- Replacing compile/retrieve/ask  

## Success

```bash
./ont agent MU "is my thesis intact — SCA evidence?"
# → structured context: house prior, claims, risks, source hits, gaps
# Agent (human or LLM) reasons ONLY from this output
```

## Agent rules (binding)

1. Call ontology before asserting MU facts  
2. No buy/sell/hold/target/sizing  
3. No numbers without pack/source support  
4. Say gap when missing  
5. House view is user-owned read-only  
