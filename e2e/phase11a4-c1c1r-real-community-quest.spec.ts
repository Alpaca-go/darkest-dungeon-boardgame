import { expect, test, type Page } from '@playwright/test';
import type { SaveFile } from '../src/types';
import { PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';

const STORAGE_KEY = 'dd-web-prototype-save-v1';
const QUEST_ID = 'community-quest-warrens-lvl1-explore-the-sewers';
const PARTY = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];

async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Expected persisted production save');
  return JSON.parse(raw) as SaveFile;
}

test(PRODUCTION_PROOF_REGISTRY['C1C1R-E2E-SIMPLE-QUEST-ADAPTER'].proofId, async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('dd-fixed-rng', '1'));
  await page.goto('/');
  await page.getByTestId('runtime-content-profile').selectOption('community-complete-edition');
  await page.getByRole('button', { name: '新建战役' }).click();
  for (const hero of PARTY) await page.getByText(hero, { exact: true }).first().click();
  await page.getByRole('button', { name: '继续（技能配置）' }).click();
  await page.getByRole('button', { name: '使用默认配置（全部英雄）' }).click();
  await page.getByRole('button', { name: '继续（任务选择）' }).click();
  await page.getByTestId(`quest-${QUEST_ID}`).click();

  await expect(page).toHaveURL(/\/dungeon$/);
  await expect(page.getByTestId('quest-rest-runtime')).toContainText('Firewood: 0');
  await page.getByTestId('scout-dungeon').click();
  await page.getByTestId('dungeon-room-A').click();
  await expect(page.getByTestId('curio-panel')).toBeVisible();
  await page.locator('[data-testid^="curio-search-"]').first().click();
  const diseaseOverlay = page.getByTestId('disease-overlay');
  if (await diseaseOverlay.isVisible()) {
    await page.getByTestId('disease-overlay-confirm').click();
  }

  const afterFirst = await storedSave(page);
  expect(afterFirst.campaign.currentQuestId).toBe(QUEST_ID);
  expect(afterFirst.campaign.questRuntimeState).toMatchObject({ qualifiedUnitCount: 1, xpUnitsEarned: 0, xpEarned: 0 });
  expect(afterFirst.campaign.dungeon?.rooms.find((room) => room.id === 'A')?.status).toBe('cleared');

  await page.reload();
  await expect(page).toHaveURL(/\/dungeon$/);
  await page.getByTestId('scout-dungeon').click();
  await page.getByTestId('dungeon-room-E').click();

  const afterSecond = await storedSave(page);
  expect(afterSecond.campaign.questRuntimeState).toMatchObject({ qualifiedUnitCount: 2, xpUnitsEarned: 1, xpEarned: 1 });
  expect(afterSecond.campaign.dungeon?.rooms.find((room) => room.id === 'E')?.status).toBe('cleared');

  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  await expect(page).toHaveURL(/\/result$/);
  const result = await storedSave(page);
  expect(result.campaign.pendingQuestXp?.xpPerHero).toBe(1);
  expect(result.campaign.lastQuestResult?.outcome).toBe('incomplete');

  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);
  const hamlet = await storedSave(page);
  expect(hamlet.campaign.heroes.every((hero) => hero.xpState.currentXp === 1)).toBe(true);
});
