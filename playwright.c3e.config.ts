import {defineConfig} from '@playwright/test';
import config from './playwright.built.config';
export default defineConfig({...config,use:{...config.use,trace:'off',video:'off'},reporter:[['list'],['json',{outputFile:'pw-out/c3e-playwright-report.json'}]],timeout:120_000});
