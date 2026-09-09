import { defineConfig } from '@playwright/test';

// The critical runner owns Vite explicitly. Keeping this config free of a
// Playwright webServer avoids the Windows npm/cmd process tree that previously
// survived after all six assertions had completed.
export default defineConfig({
  testDir: './e2e',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: `pw-out/critical-${Date.now()}`,
  use: {
    baseURL: 'http://127.0.0.1:5199',
    viewport: { width: 1280, height: 720 },
    trace: 'off',
  },
});
