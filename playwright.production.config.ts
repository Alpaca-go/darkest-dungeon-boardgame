import { defineConfig } from '@playwright/test';
import config from './playwright.config';

/** Production player controls and identities: no seeded E2E startup and no test-control bundle. */
export default defineConfig({
  ...config,
  webServer: {
    command: 'npm run dev -- --port 5199 --strictPort',
    url: 'http://localhost:5199',
    reuseExistingServer: false,
    env: { VITE_E2E_MODE: '0', DDBG_PLAYER_BROWSER_ACCEPTANCE: '1' },
    timeout: 90_000,
  },
});
