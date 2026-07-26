// nbisCompile.js — thin wrapper (Path 2A S1). Logic lives in thinCompile.js.
// Fixed command: ont compile NBIS. Decision-support only.
import { book } from './nbisModel.js';
import { createThinCompile } from './thinCompile.js';

const { compile, compileStatus } = createThinCompile('NBIS', book);

export async function compileNbis() {
  return compile();
}

export { compileStatus };
