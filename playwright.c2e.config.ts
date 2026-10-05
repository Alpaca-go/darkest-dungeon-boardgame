import {defineConfig} from '@playwright/test';
import config from './playwright.built.config';
export default defineConfig({...config,reporter:[['list'],['json',{outputFile:'pw-out/c2e-playwright-report.json'}]],timeout:240_000});
