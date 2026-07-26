// msftCompile.js — thin wrapper (Path 2A S1). Logic lives in thinCompile.js.
// Fixed command: ont compile MSFT. Decision-support only.
import { book } from './msftModel.js';
import { createThinCompile } from './thinCompile.js';

const { compile, compileStatus } = createThinCompile('MSFT', book);

export async function compileMsft() {
  return compile();
}

export { compileStatus };
