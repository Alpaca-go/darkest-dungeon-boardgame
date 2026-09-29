import { expect, test, type Page } from '@playwright/test';

/** Scoped UI wiring fixture: cancelled reservation, not a full production Threat journey. */
async function preparedResult(page: Page, level: 2 | 3) {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async level => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [campaign, sources, versions, quests, boss, result, saves, store] = await Promise.all([
      load('/src/game-engine/campaign.ts'), load('/src/game-engine/runtime-sources.ts'),
      load('/src/game-engine/rules/hero-dodge-versioning.ts'), load('/src/game-engine/commands/quest.ts'),
      load('/src/game-engine/commands/boss-foundation.ts'), load('/src/game-engine/quest-result.ts'),
      load('/src/game-engine/save.ts'), load('/src/store/useGameStore.ts'),
    ]);
    let c = sources.withRuntimeSources(sources.seededRuntimeSources(323232), () => campaign.applyDefaultLoadout(
      campaign.selectParty(campaign.createNewCampaign('community-complete-edition'), ['crusader', 'highwayman', 'vestal', 'hellion'])));
    // Initial campaign gates only; no later fixture phase changes.
    c.gamePhase = 'quest-select';
    Object.assign(c.campaignProgress, { campaignLevel: level, act: level, activeBossFamilyId: 'necromancer',
      activeThreatId: `necromancer-threat-level-${level}`, pendingThreatInitialization: false,
      completedStandardQuestsThisAct: 2, bossQuestRequired: true });
    c = versions.explicitlyMigrateHeroDodgeToV2(c, 'C1C32R2A-browser-initial-fixture');
    c = quests.commitQuestSelection(c, 'face-the-threat').campaign;
    c = boss.applyBossThreatCheckpointInput(c, { type: 'PREPARATION_DAY',
      rolls: Object.fromEntries(c.heroes.map((h: { instanceId: string }, i: number) => [`u_${h.instanceId}`, i < 2 ? 1 : i + 1])) });
    c = result.finishQuest(c, 'left');
    saves.saveCampaign(c); store.useGameStore.setState({ campaign: c });
  }, level);
  await page.goto('/result', { waitUntil: 'domcontentloaded' });
  await page.getByTestId('return-hamlet').click();
  await expect(page).toHaveURL(/hamlet/);
}

for (const useEffect of [true, false]) {
  test(`scoped Level II UI tie/use=${useEffect}/autosave reload`, async ({ page }) => {
    await preparedResult(page, 2);
    const panel = page.getByRole('region', { name: 'Graveyard 守卫任务' });
    await expect(panel.getByText('最低骰点并列，请选择今天前往墓地的英雄。')).toBeVisible();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await panel.getByRole('button').nth(1).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await panel.getByRole('button', { name: '前往墓地' }).click();
    await page.reload({ waitUntil: 'domcontentloaded' });
    await panel.getByRole('button', { name: useEffect ? '使用效果' : '只完成守卫', exact: true }).click();
    await expect(panel).toHaveCount(0);
    await page.reload({ waitUntil: 'domcontentloaded' });
    const receipt = await page.evaluate(() => {
      const save = JSON.parse(localStorage.getItem('dd-web-prototype-save-v1')!);
      return { preparation: save.campaign.necromancerPreparationDay.status, receipts: save.campaign.necromancerGraveyardReceipts,
        returned: save.campaign.bossRoomStorage.lifecycle };
    });
    expect(receipt.preparation).toBe('COMMITTED');
    expect(receipt.receipts).toHaveLength(1);
    expect(receipt.receipts[0].useEffect).toBe(useEffect);
    expect(receipt.returned).toBe('RETURNED');
  });
}

test('scoped Level III UI has guard-only action and no optional Virtue effect', async ({ page }) => {
  await preparedResult(page, 3);
  const panel = page.getByRole('region', { name: 'Graveyard 守卫任务' });
  await panel.getByRole('button').first().click();
  await expect(panel.getByText(/这次无法使用墓地效果/)).toBeVisible();
  await panel.getByRole('button', { name: '前往墓地' }).click();
  await expect(panel).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  const receipts = await page.evaluate(() => JSON.parse(localStorage.getItem('dd-web-prototype-save-v1')!).campaign.necromancerGraveyardReceipts);
  expect(receipts).toHaveLength(1);
  expect(receipts[0]).toMatchObject({ threatLevel: 3, useEffect: false, virtueId: null, lifecycle: 'GUARD_ONLY' });
});
