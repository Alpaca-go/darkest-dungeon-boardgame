import { expect, test, type Page } from '@playwright/test';
import type { SaveFile } from '../src/types';
import { PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';

const STORAGE_KEY = 'dd-web-prototype-save-v1';
const QUEST_ID = 'community-quest-ruins-lvl1-scout-ahead';
const PARTY = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];

async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Expected persisted production save');
  return JSON.parse(raw) as SaveFile;
}

test(PRODUCTION_PROOF_REGISTRY['C1C1R2-E2E-REST-ALLOCATION'].proofId, async ({ page }) => {
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
  await expect(page.getByTestId('quest-rest-runtime')).toContainText('Firewood: 1');

  // Scout is a production action that gives every Hero one Stress. Room A is the
  // source-backed Empty token for this deterministic Quest layout and clears on entry.
  await page.getByTestId('scout-dungeon').click();
  await page.getByTestId('dungeon-room-A').click();
  await expect(page.getByTestId('rest-at-camp')).toBeEnabled();

  const beforeDraft = await storedSave(page);
  expect(beforeDraft.campaign.heroes.every((hero) => hero.stress >= 1)).toBe(true);

  // Draft and cancel: the campaign and Firewood remain unchanged.
  await page.getByTestId('rest-at-camp').click();
  await expect(page.getByTestId('rest-allocation-modal')).toBeVisible();
  await page.getByTestId('rest-allocation-modal').locator('[data-testid$="-stress-plus"]').first().click();
  await expect(page.getByTestId('rest-points-used')).toHaveText('1');
  await page.getByTestId('rest-allocation-cancel').click();
  const afterCancel = await storedSave(page);
  expect(afterCancel.campaign.heroes).toEqual(beforeDraft.campaign.heroes);
  expect(afterCancel.campaign.questRuntimeState).toEqual(beforeDraft.campaign.questRuntimeState);

  // Re-open with a zero draft and commit exactly one player-selected Stress recovery.
  await page.getByTestId('rest-at-camp').click();
  await expect(page.getByTestId('rest-points-used')).toHaveText('0');
  await page.getByTestId('rest-allocation-modal').locator('[data-testid$="-stress-plus"]').first().click();
  await page.getByTestId('rest-allocation-confirm').click();
  await expect(page.getByTestId('rest-allocation-modal')).toBeHidden();
  await expect(page.getByTestId('quest-rest-runtime')).toContainText('Firewood: 0');

  const committed = await storedSave(page);
  expect(committed.campaign.questRuntimeState).toMatchObject({
    firewoodTokensRemaining: 0,
    restingPointsRemaining: 0,
    restingPointsSpent: 1,
  });
  expect(committed.campaign.heroes[0].stress).toBe(beforeDraft.campaign.heroes[0].stress - 1);
  expect(committed.campaign.heroes.slice(1).map((hero) => hero.stress)).toEqual(
    beforeDraft.campaign.heroes.slice(1).map((hero) => hero.stress),
  );

  await page.reload();
  await expect(page).toHaveURL(/\/dungeon$/);
  const restored = await storedSave(page);
  expect(restored.campaign.questRuntimeState).toEqual(committed.campaign.questRuntimeState);
  expect(restored.campaign.heroes).toEqual(committed.campaign.heroes);
});
