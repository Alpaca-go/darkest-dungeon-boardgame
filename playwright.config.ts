import { defineConfig } from '@playwright/test';

/**
 * 默认 E2E 配置（Phase 5 起沿用，Phase 9A 起覆盖全部 e2e/*.spec.ts）：
 * - 单浏览器（Chromium）、1280x720；
 * - 自动拉起 vite dev server（端口 5199，避免与开发中的 5173 冲突）；
 * - 测试内通过 localStorage['dd-fixed-rng'] 注入固定随机种子保证可复现。
 *
 * outputDir 按时间戳生成唯一路径：Playwright 启动时会先清空结果目录，
 * 而沙箱的 safe-delete 会拦截对已存在目录的删除并让整轮直接失败；
 * 用唯一目录可保证「目录不存在 → 无需删除」。统一收敛到 pw-out/（已 gitignore）。
 */
const uniqueOut = `pw-out/main-${Date.now()}`;

export default defineConfig({
  testDir: './e2e',
  timeout: 180_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [['list']],
  outputDir: uniqueOut,
  use: {
    baseURL: 'http://localhost:5199',
    viewport: { width: 1280, height: 720 },
    trace: 'off',
  },
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    env: { VITE_E2E_MODE: '1' },
    timeout: 90_000,
  },
});
