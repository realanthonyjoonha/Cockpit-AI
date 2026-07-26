// msftAsk.js — thin wrapper (Path 2A S2). Logic in thinAsk.js.
// Deterministic pack Q&A. No LLM. Decision-support only.
import { createThinAsk, MSFT_ASK_PROFILE } from './thinAsk.js';

export const ask = createThinAsk(MSFT_ASK_PROFILE);
