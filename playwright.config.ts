import { defineConfig } from '@playwright/test';

/**
 * Phase 5 最小 E2E 配置：
 * - 单浏览器（Chromium）、1280x720；
 * - 自动拉起 vite dev server（端口 5199，避免与开发中的 5173 冲突）；
 * - 测试内通过 localStorage['dd-fixed-rng'] 注入固定随机种子保证可复现。
 */
export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1280, height: 720 },
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: true,
    timeout: 90_000,
  },
});
