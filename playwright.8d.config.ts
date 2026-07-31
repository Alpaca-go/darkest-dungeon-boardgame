import { defineConfig } from '@playwright/test';

/**
 * Phase 8D 专用 E2E 配置。
 *
 * 与 playwright.config.ts 的差异及原因：
 * 1. outputDir 在配置加载时按时间戳生成唯一路径，确保每次运行时该目录不存在，
 *    从而避开沙箱 safe-delete 对「已存在结果目录」的 trash 拦截
 *    （Playwright 启动会先清空旧结果目录，被拦截则整轮失败）。
 *    统一收敛到 pw-out/ 之下（已在 .gitignore），避免在仓库根目录堆积时间戳目录。
 * 2. reuseExistingServer: false + 独立端口，避免复用到沙箱里残留的孤儿 vite 进程。
 *    若报「port already used」，换一个空闲端口（同时改 baseURL / command / url 三处）。
 */
const uniqueOut = `pw-out/8d-${Date.now()}`;

/** 运行端口：沙箱中偶有孤儿 dev server 占位，换端口即可。 */
const PORT = 5321;

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
    baseURL: `http://localhost:${PORT}`,
    viewport: { width: 1280, height: 720 },
    trace: 'off',
  },
  webServer: {
    command: `npm run dev -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: false,
    timeout: 90_000,
  },
});
