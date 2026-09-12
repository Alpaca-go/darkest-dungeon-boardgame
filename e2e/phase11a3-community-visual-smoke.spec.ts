import { expect, test } from '@playwright/test';
import { resolve } from 'node:path';
const evidenceDir = resolve('docs/reports/phase-11a3/visual-smoke');

for (const route of [
  { id: 'shuffling-horror', panel: 'shuffling-horror-encounter-panel', file: 'V04-community-shuffling-horror.png' },
  { id: 'templars', panel: 'templars-encounter-panel', file: 'V02-community-templars.png' },
  { id: 'mammoth-cyst', panel: 'mammoth-cyst-encounter-panel', file: 'V03-community-mammoth-cyst.png' },
] as const) test(`visual smoke ${route.id}`, async ({ page }) => {
  await page.goto('/'); await page.getByTestId(`e2e-community-${route.id}`).click();
  await expect(page.locator('[data-cv-status="ready"]').first()).toBeVisible();
  if (route.id === 'shuffling-horror') await page.getByTestId('dd-quest-reveal').screenshot({ path: resolve(evidenceDir, 'V01-community-quest-reveal.png') });
  await page.getByTestId(route.panel).screenshot({ path: resolve(evidenceDir, route.file) });
});

test('V06 Community Final Encounter product visual smoke', async ({ page }) => {
  await page.goto('/'); await page.getByTestId('e2e-community-final').click();
  await expect(page.locator('[data-testid^="final-form-visual-"][data-cv-status="ready"]')).toHaveCount(4);
  await page.getByTestId('final-form-mechanics-panel').screenshot({ path: resolve(evidenceDir, 'V06-community-final-encounter.png') });
});
