import { test, expect, type Page } from '@playwright/test';
import { buildReplacementScenario } from '../src/testing/scenarios/replacement-scenario';
import { STORAGE_KEY } from '../src/game-engine/save';

async function state(page: Page) {
  return JSON.parse(await page.getByTestId('e2e-state').innerText());
}
async function setup(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: '新建战役', exact: true }).click();
  for (const name of ['Crusader', 'Vestal', 'Highwayman', 'Hellion']) {
    await page.getByText(name, { exact: true }).first().click();
  }
  await page.getByRole('button', { name: '继续（技能配置）' }).click();
  await page.getByRole('button', { name: '使用默认配置（全部英雄）' }).click();
  await page.getByRole('button', { name: '继续（任务选择）' }).click();
  await expect(page).toHaveURL(/\/quests$/);
}
async function prepare(page: Page) {
  await page.getByTestId('e2e-finish-hamlet').click();
  await expect(page.getByTestId('e2e-error')).toBeEmpty();
  await expect(page).toHaveURL(/\/quests$/);
}
async function completeQuest(page: Page, quest: string, count: number) {
  await page.getByTestId(`quest-${quest}`).click();
  await expect(page).toHaveURL(/\/dungeon$/);
  await page.getByTestId('e2e-complete-quest').click();
  await expect(page.getByTestId('e2e-error')).toBeEmpty();
  await expect(page).toHaveURL(/\/result$/);
  expect((await state(page)).outcome).toBe('completed');
  await page.getByRole('button', { name: '返回 Hamlet', exact: true }).click();
  await expect(page).toHaveURL(/\/hamlet$/);
  expect((await state(page)).completedQuestCount).toBe(count);
}
async function twoStandards(page: Page, offset = 0) {
  await completeQuest(page, 'scout-ahead', offset + 1);
  await prepare(page);
  await completeQuest(page, 'recover-relic', offset + 2);
}

test('E2E-01 New Campaign → Completed Standard → Hamlet', async ({ page }) => {
  await setup(page);
  await completeQuest(page, 'scout-ahead', 1);
  expect(await state(page)).toMatchObject({ phase: 'hamlet', standardCount: 1 });
});
test('E2E-02 Completed Standard ×2 → Boss Gate', async ({ page }) => {
  await setup(page);
  await twoStandards(page);
  expect(await state(page)).toMatchObject({ standardCount: 2, bossQuestRequired: true, standardSelectable: false, bossSelectable: true });
  await prepare(page);
  await expect(page.getByTestId('quest-scout-ahead')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('quest-recover-relic')).toHaveAttribute('aria-disabled', 'true');
  await expect(page.getByTestId('quest-face-the-threat')).toHaveAttribute('aria-disabled', 'false');
});
test('E2E-03 Boss Encounter → Victory → Act II', async ({ page }) => {
  await setup(page);
  await twoStandards(page);
  await prepare(page);
  await completeQuest(page, 'face-the-threat', 3);
  const s = await state(page);
  expect(s).toMatchObject({ act: 2, campaignLevel: 2 });
  expect(s.defeatedBossFamilyIds).toHaveLength(1);
});
test('E2E-04 Valid Replacement Scenario → Select → Confirm → Resume', async ({ page }) => {
  const save = buildReplacementScenario();
  await page.addInitScript(({ key, value }) => localStorage.setItem(key, value), { key: STORAGE_KEY, value: JSON.stringify(save) });
  await page.goto('/');
  await expect(page).toHaveURL(/\/replacement$/);
  const before = await state(page);
  const slot = page.locator('[data-testid^="replacement-slot-"]').first();
  await slot.locator('[data-testid^="candidate-"]:not([disabled])').first().click();
  await slot.locator('[data-testid^="confirm-replacement-"]').click();
  await expect(page).toHaveURL(/\/hamlet$/);
  expect(await state(page)).toMatchObject({ livingHeroes: 4, waitingTokens: before.waitingTokens - 1, completedQuestCount: 1 });
});
test('E2E-05 Gameplay Save → Reload → Continue → Product Action', async ({ page }) => {
  await setup(page);
  await completeQuest(page, 'scout-ahead', 1);
  const before = await state(page);
  await page.getByRole('link', { name: '首页', exact: true }).click();
  await page.getByRole('button', { name: '手动保存', exact: true }).click();
  await expect(page.getByTestId('home-notice')).toContainText('已手动保存');
  await page.reload();
  await page.getByRole('link', { name: '首页', exact: true }).click();
  await page.getByTestId('btn-continue').click();
  await expect(page).toHaveURL(/\/hamlet$/);
  expect(await state(page)).toEqual(before);
  const skip = page.getByRole('button', { name: '跳过今天行动', exact: true });
  const count = await skip.count();
  expect(count).toBe(4);
  await skip.first().click();
  await expect(skip).toHaveCount(count - 1);
  expect((await state(page)).hash).not.toBe(before.hash);
});
test('E2E-06 Act I → II → III → IV through nine completed quests', async ({ page }) => {
  await setup(page);
  for (let act = 1; act <= 3; act++) {
    await twoStandards(page, (act - 1) * 3);
    await prepare(page);
    await completeQuest(page, 'face-the-threat', act * 3);
    expect((await state(page)).act).toBe(act + 1);
    if (act < 3) await prepare(page);
  }
  const s = await state(page);
  expect(s).toMatchObject({ act: 4, campaignLevel: 3, darkestDungeonUnlocked: true, completedQuestCount: 9 });
  expect(s.defeatedBossFamilyIds).toHaveLength(3);
});
