import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // emit every font as a same-origin /assets file — never inline as a data: URI, which the
  // strict CSP (font-src falls back to 'self') would block. [§4 HARD]
  // emptyOutDir:false → keep prior content-hashed bundles on rebuild so a browser cached on an old
  // shell keeps working across a redeploy (no strand) until it revalidates the no-cache index.html
  // and upgrades. Old /assets accrue over time; prune dist/assets occasionally.
  build: { assetsInlineLimit: 0, emptyOutDir: false },
  server: { proxy: { '/api': 'http://127.0.0.1:4681' } },
});
