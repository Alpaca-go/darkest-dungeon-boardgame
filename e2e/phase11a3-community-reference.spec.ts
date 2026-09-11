import { expect, test } from '@playwright/test';

test('COMMUNITY-E2E-01 unlock → Community Quest → content → layout → Guardian setup', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('e2e-community-reference').click();
  await expect(page.getByTestId('e2e-error')).toBeEmpty();
  const result = JSON.parse(await page.getByTestId('e2e-state').innerText());
  expect(result).toMatchObject({ runtimeProfileId: 'community-reference', shufflingActorIds: ['u_community-dd-shuffling-horror', 'u_community-dd-cultist-priest', 'u_community-dd-malignant-growth'] });
});
