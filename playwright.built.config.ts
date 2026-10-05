import {defineConfig} from '@playwright/test';
import config from './playwright.config';

/** Serve the existing production dist. This command never rebuilds with E2E controls. */
export default defineConfig({
  ...config,
  webServer:{command:'npm run preview -- --port 5199 --strictPort --host 127.0.0.1',url:'http://localhost:5199',reuseExistingServer:false,timeout:90_000},
});
