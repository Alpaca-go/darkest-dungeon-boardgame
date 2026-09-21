import { expect, test, type Page } from '@playwright/test';
import type { SaveFile } from '../src/types';
import { PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { createC1C2SpecialRuleE2ESave } from '../src/test-support/c1c2-special-rule-e2e-fixture';

const STORAGE_KEY = 'dd-web-prototype-save-v1';
const QUEST_ID = 'community-quest-warrens-lvl3-deep-in-the-warrens';

async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Expected persisted production save');
  return JSON.parse(raw) as SaveFile;
}

test(PRODUCTION_PROOF_REGISTRY['C1C2-E2E-SPECIAL-RULE'].proofId, async ({ page }) => {
  await page.addInitScript(() => window.localStorage.setItem('dd-fixed-rng', '1'));
  await page.goto('/');
  await page.locator('input[type="file"]').setInputFiles({
    name: 'c1c2-production-quest-select.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(createC1C2SpecialRuleE2ESave())),
  });
  await expect(page.getByTestId('home-notice')).toContainText('存档导入成功');
  await page.getByTestId('btn-continue').click();
  await expect(page).toHaveURL(/\/quests$/);
  await page.getByTestId(`quest-${QUEST_ID}`).click();
  await expect(page).toHaveURL(/\/dungeon$/);

  await page.getByTestId('scout-dungeon').click();
  await page.getByTestId('dungeon-room-A').click();
  await expect(page.getByTestId('quest-rule-choice')).toBeVisible();
  const triggered = await storedSave(page);
  expect(triggered.campaign.questRuntimeState?.pendingRuleChoice).toMatchObject({
    questRuleId: 'deep-in-the-warrens-discard-after-leave', trigger: 'leave-room',
  });

  await page.reload();
  await expect(page.getByTestId('quest-rule-choice')).toBeVisible();
  const foodBefore = (await storedSave(page)).campaign.provisions.food;
  await page.getByTestId('quest-rule-discard-food').click();
  await expect(page.getByTestId('quest-rule-choice')).toBeHidden();
  const committed = await storedSave(page);
  expect(committed.campaign.provisions.food).toBe(foodBefore - 1);
  expect(committed.campaign.questRuntimeState?.processedRuleTransactionIds).toContain(
    triggered.campaign.questRuntimeState?.pendingRuleChoice?.transactionId,
  );

  await page.reload();
  await expect(page.getByTestId('quest-rule-choice')).toBeHidden();
  if (/\/battle$/.test(page.url())) {
    for (let turn = 0; turn < 32; turn += 1) {
      if (await page.getByTestId('victory-panel').isVisible()) break;
      if (await page.getByTestId('defeat-panel').isVisible()) break;
      const endTurn = page.getByRole('button', { name: '结束回合' });
      if (await endTurn.isVisible()) await endTurn.click();
      else await page.waitForTimeout(100);
    }
    if (await page.getByTestId('victory-panel').isVisible()) {
      const collect = page.getByRole('button', { name: '领取奖励并返回地牢', exact: true });
      await expect(collect).toBeVisible();
      await collect.click();
    } else if (await page.getByRole('button', { name: '撤退回地牢', exact: true }).isVisible()) {
      const retreat = page.getByRole('button', { name: '撤退回地牢', exact: true });
      await expect(retreat).toBeVisible();
      await retreat.click();
    } else {
      throw new Error('Battle did not reach a resolvable terminal state');
    }
    await expect.poll(async () => (await storedSave(page)).campaign.battle).toBeNull();
    await expect(page).toHaveURL(/\/dungeon$/);
  }
  await page.getByTestId('leave-dungeon').click();
  await page.getByTestId('leave-dungeon-confirm-ok').click();
  await expect(page).toHaveURL(/\/result$/);
  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/\/hamlet$/);
});
