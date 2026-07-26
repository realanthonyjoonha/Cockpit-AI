// nbisAsk.js — thin wrapper (Path 2A S2). Logic in thinAsk.js.
// Deterministic pack Q&A. No LLM. Decision-support only.
import { createThinAsk, NBIS_ASK_PROFILE } from './thinAsk.js';

export const ask = createThinAsk(NBIS_ASK_PROFILE);
