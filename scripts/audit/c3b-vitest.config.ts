import { defineConfig } from 'vitest/config';
// C3B data checks do not load historical test adapters or browser setup.
export default defineConfig({ test: {
  environment: 'node', include: ['src/audit/c3b-monster-definition-layer.test.ts'],
  setupFiles: [], cache: false,
} });
