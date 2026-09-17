import { expect, test } from '@playwright/test';

test('COMMUNITY-ACT4-PC-A03-shuffling public store action exposes physical deck and r10-SW Horror', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('e2e-community-shuffling-horror').click();
  await expect(page.getByTestId('e2e-error')).toBeEmpty();
  const result = JSON.parse(await page.getByTestId('e2e-state').innerText());
  expect(result).toMatchObject({
    runtimeProfileId: 'community-reference',
    guardianDefinitionId: 'community-dd-guardian-family-shuffling-horror',
    physicalMonsterCount: 26,
    horrorAreaId: 'r10-SW',
  });
});

test('COMMUNITY-ACT4-PC-A03-templars public store action keeps the 26-card physical deck', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('e2e-community-templars').click();
  await expect(page.getByTestId('e2e-error')).toBeEmpty();
  const result = JSON.parse(await page.getByTestId('e2e-state').innerText());
  expect(result).toMatchObject({
    runtimeProfileId: 'community-reference',
    guardianDefinitionId: 'community-dd-guardian-family-templars',
    physicalMonsterCount: 26,
  });
});

test('COMMUNITY-ACT4-PC-A03-mammoth public store action keeps the 26-card physical deck', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('e2e-community-mammoth-cyst').click();
  await expect(page.getByTestId('e2e-error')).toBeEmpty();
  const result = JSON.parse(await page.getByTestId('e2e-state').innerText());
  expect(result).toMatchObject({
    runtimeProfileId: 'community-reference',
    guardianDefinitionId: 'community-dd-guardian-family-mammoth-cyst',
    physicalMonsterCount: 26,
  });
});
