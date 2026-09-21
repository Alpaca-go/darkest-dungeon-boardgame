import { expect, test, type Page } from '@playwright/test';
import type { SaveFile } from '../src/types';
import { PRODUCTION_PROOF_REGISTRY } from '../src/audit/production-proof-registry';
import { FAMILY_TRINKETS_ID, TAINTED_TRINKETS_ID } from '../src/data/community-reference/production-runtime';
import { createC1C3QuestSelectE2ESave } from '../src/test-support/c1c3-multi-primitive-e2e-fixture';

const STORAGE_KEY = 'dd-web-prototype-save-v1';

async function storedSave(page: Page): Promise<SaveFile> {
  const raw = await page.evaluate((key) => window.localStorage.getItem(key), STORAGE_KEY);
  if (!raw) throw new Error('Expected persisted production save');
  return JSON.parse(raw) as SaveFile;
}

for (const scenario of [
  { questId: TAINTED_TRINKETS_ID, level: 3 as const, proofId: 'C1C3-E2E-TAINTED-TRINKETS' },
  { questId: FAMILY_TRINKETS_ID, level: 1 as const, proofId: 'C1C3-E2E-FAMILY-TRINKETS' },
]) {
  test(PRODUCTION_PROOF_REGISTRY[scenario.proofId].proofId, async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('dd-fixed-rng', '1'));
    await page.goto('/');
    await page.locator('input[type="file"]').setInputFiles({
      name: `c1c3-${scenario.level}-quest-select.json`, mimeType: 'application/json',
      buffer: Buffer.from(JSON.stringify(createC1C3QuestSelectE2ESave(scenario.level))),
    });
    await page.getByTestId('btn-continue').click();
    await expect(page).toHaveURL(/\/quests$/);
    await page.getByTestId(`quest-${scenario.questId}`).click();
    await expect(page).toHaveURL(/\/dungeon$/);
    await expect(page.getByTestId('quest-token-progress')).toContainText('0 / 3');
    const selected = await storedSave(page);
    expect(selected.campaign.questRuntimeState?.roomSetup?.tokenPlacement).toHaveLength(3);

    await page.getByTestId('e2e-quest-progress-1').click();
    await expect(page.getByTestId('quest-token-progress')).toContainText('1 / 3');
    const midQuest = await storedSave(page);
    expect(midQuest.campaign.dungeon?.objectiveComplete).toBe(false);
    await page.reload();
    await expect(page.getByTestId('quest-token-progress')).toContainText('1 / 3');

    await page.getByTestId('e2e-complete-quest').click();
    await expect(page).toHaveURL(/\/result$/);
    const result = await storedSave(page);
    expect(result.campaign.lastQuestResult).toMatchObject({ outcome: 'completed', xpPerHero: 3 });
    expect(result.campaign.questRuntimeState?.questTokens?.every((token) => token.status === 'consumed')).toBe(true);
    await page.reload();
    await expect(page).toHaveURL(/\/result$/);
    await page.getByTestId('return-hamlet').click();
    await expect(page).toHaveURL(/\/hamlet$/);
  });
}
