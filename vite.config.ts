/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react(), {
    name: 'c2d-runtime-bundle-proof',
    generateBundle(_options, bundle) {
      const chunks=Object.values(bundle).filter(output=>output.type==='chunk');
      this.emitFile({type:'asset',fileName:'c2d-runtime-module-graph.json',source:JSON.stringify(chunks.map(chunk=>({fileName:chunk.fileName,bytes:Buffer.byteLength(chunk.code),imports:chunk.imports,dynamicImports:chunk.dynamicImports,modules:Object.keys(chunk.modules)})),null,2)});
    },
  }],
  build: {
    emptyOutDir: false,
    rollupOptions: { output: { manualChunks(id) {
      if (id.includes('/src/data/heroes/runtime-')) return 'hero-production-runtime';
    } } },
  },
  server: {
    hmr: process.env.DDBG_PLAYER_BROWSER_ACCEPTANCE === '1' ? false : undefined,
    port: 5173,
    host: true,
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['src/test-support/historical-baseline-setup.ts'],
    cache: false,
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
    // Historical rejection expectations run in accepted detached checkouts via the successor boundary suite.
    exclude: ['src/audit/c1c34-successor-rebaseline.test.ts','src/audit/c1c35-prophet-source-contract.test.ts',
      'src/audit/c1c35r1-prophet-residual-contract.test.ts','src/audit/c1c35r2-prophet-gate-foundation-review.test.ts',
      'src/audit/c1c35r2a-shared-dispatch.test.ts',
      'src/audit/c2c-hero-production.test.ts','src/audit/c2a-r1-transport-binding.test.ts','src/audit/c2b-hero-literal-closure.test.ts'],
  },
});
