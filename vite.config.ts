/// <reference types="vitest" />
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    emptyOutDir: false,
  },
  server: {
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
      'src/audit/c1c35r2a-shared-dispatch.test.ts'],
  },
});
