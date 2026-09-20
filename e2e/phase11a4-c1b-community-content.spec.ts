import { expect, test } from '@playwright/test';

const HEROES = ['Crusader', 'Vestal', 'Highwayman', 'Hellion'];

test.beforeEach(async ({ context }) => {
  await context.addInitScript(() => {
    window.localStorage.setItem('dd-fixed-rng', '20260920');
  });
});

test('Community campaign uses the production gate and never falls back to prototype quests', async ({ page }) => {
  await page.goto('/');
  await page.getByTestId('runtime-content-profile').selectOption('community-complete-edition');
  await page.getByRole('button', { name: '新建战役' }).click();
  for (const hero of HEROES) await page.getByText(hero, { exact: true }).first().click();
  await page.getByRole('button', { name: '继续（技能配置）' }).click();
  await page.getByRole('button', { name: '使用默认配置（全部英雄）' }).click();
  await page.getByRole('button', { name: '继续（任务选择）' }).click();

  await expect(page).toHaveURL(/\/quests$/);
  await expect(page.getByTestId('community-quest-pool-blocked')).toBeVisible();
  await expect(page.getByText('Scout Ahead', { exact: true })).toHaveCount(0);
  await expect(page.getByText('Recover the Relic', { exact: true })).toHaveCount(0);

  await page.reload();
  await expect(page.getByTestId('community-quest-pool-blocked')).toBeVisible();
});
