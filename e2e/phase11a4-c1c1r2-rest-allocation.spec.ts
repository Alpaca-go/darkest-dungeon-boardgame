import { expect, test, type Page } from '@playwright/test';
import type { SaveFile } from '../src/types';
import { PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { createC1C1R3RestE2ESave } from '../src/test-support/c1c1r3-rest-e2e-fixture';

const STORAGE_KEY = 'dd-web-prototype-save-v1';

async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Expected persisted production save');
  return JSON.parse(raw) as SaveFile;
}

test(PRODUCTION_PROOF_REGISTRY['C1C1R2-E2E-REST-ALLOCATION'].proofId, async ({ page }) => {
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1c1r3-rest-production-save.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createC1C1R3RestE2ESave())),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByTestId('btn-continue').click();

  await expect(page).toHaveURL(/\/dungeon$/);
  await expect(page.getByTestId('quest-rest-runtime')).toContainText('Firewood: 1');
  await expect(page.getByTestId('rest-at-camp')).toBeEnabled();

  const beforeDraft = await storedSave(page);
  expect(beforeDraft.campaign.heroes.every((hero) => hero.stress >= 2)).toBe(true);

  // Draft and cancel: the campaign and Firewood remain unchanged.
  await page.getByTestId('rest-at-camp').click();
  await expect(page.getByTestId('rest-allocation-modal')).toBeVisible();
  await page.getByTestId('rest-allocation-modal').locator('[data-testid$="-stress-plus"]').first().click();
  await expect(page.getByTestId('rest-points-used')).toHaveText('1');
  await expect(page.getByTestId('rest-allocation-confirm')).toBeDisabled();
  await page.getByTestId('rest-allocation-cancel').click();
  const afterCancel = await storedSave(page);
  expect(afterCancel.campaign.heroes).toEqual(beforeDraft.campaign.heroes);
  expect(afterCancel.campaign.questRuntimeState).toEqual(beforeDraft.campaign.questRuntimeState);

  // Re-open with a zero draft and allocate the complete 8-point budget explicitly.
  await page.getByTestId('rest-at-camp').click();
  await expect(page.getByTestId('rest-points-used')).toHaveText('0');
  const stressButtons = page.getByTestId('rest-allocation-modal').locator('[data-testid$="-stress-plus"]');
  await expect(stressButtons).toHaveCount(4);
  for (let heroIndex = 0; heroIndex < 4; heroIndex += 1) {
    await stressButtons.nth(heroIndex).click();
    await stressButtons.nth(heroIndex).click();
  }
  await expect(page.getByTestId('rest-points-used')).toHaveText('8');
  await expect(page.getByTestId('rest-allocation-confirm')).toBeEnabled();
  await page.getByTestId('rest-allocation-confirm').click();
  await expect(page.getByTestId('rest-allocation-modal')).toBeHidden();
  await expect(page.getByTestId('quest-rest-runtime')).toContainText('Firewood: 0');

  const committed = await storedSave(page);
  expect(committed.campaign.questRuntimeState).toMatchObject({
    firewoodTokensRemaining: 0,
    restingPointsRemaining: 0,
    restingPointsSpent: 8,
  });
  expect(committed.campaign.heroes.map((hero) => hero.stress)).toEqual(
    beforeDraft.campaign.heroes.map((hero) => hero.stress - 2),
  );

  await page.reload();
  await expect(page).toHaveURL(/\/dungeon$/);
  const restored = await storedSave(page);
  expect(restored.campaign.questRuntimeState).toEqual(committed.campaign.questRuntimeState);
  expect(restored.campaign.heroes).toEqual(committed.campaign.heroes);
});
