import { expect, test } from '@playwright/test';

test('new Complete Edition player explicitly selects v6 before Threat initialization and reloads (entry scope only)', async ({ page }, info) => {
  await page.goto('/');
  await page.getByTestId('runtime-content-profile').selectOption('community-complete-edition');
  await page.getByRole('button', { name: '新建战役', exact: true }).click();
  await expect(page).toHaveURL(/setup/);
  for (const hero of ['Crusader', 'Highwayman', 'Vestal', 'Hellion'])
    await page.getByText(hero, { exact: true }).first().click();
  await page.getByRole('button', { name: '继续（技能配置）', exact: true }).click();
  await page.getByRole('button', { name: '使用默认配置（全部英雄）', exact: true }).click();
  await page.getByRole('button', { name: '继续（任务选择）', exact: true }).click();
  await expect(page).toHaveURL(/quests/);
  await page.getByTestId('migrate-hero-dodge-v2').click();
  await page.getByTestId('select-production-ruins-v6').click();
  await expect(page.getByTestId('select-production-ruins-v6')).toHaveCount(0);
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: '任务选择', exact: true })).toBeVisible({ timeout: 60_000 });
  await expect(page.getByTestId('select-production-ruins-v6')).toHaveCount(0);
  await expect(page.getByTestId('migrate-hero-dodge-v2')).toHaveCount(0);
  // Read-only inspection of the persisted result; all creation and selections above use player UI.
  const result = await page.evaluate(() => {
    const stored = Object.values(localStorage).map(value => {
      try { return JSON.parse(value); } catch { return null; }
    }).find(value => value?.campaign?.ruinsRuleSetSelection);
    return {
      ruins: stored?.campaign.ruinsRuleSetSelection,
      dodge: stored?.campaign.heroDodgeRuleSetSelection,
      phase: stored?.campaign.gamePhase,
      threat: stored?.campaign.activeThreatRuntime,
      encounter: stored?.campaign.bossEncounterCheckpoint,
    };
  });
  expect(result.ruins).toMatchObject({ ruleSetVersion: 'C1C32R2C-R-DIGITAL-DEFAULT-v6', canonical: false });
  expect(result.dodge.ruleSetVersion).toBe('C1C31-DIGITAL-DEFAULT-v2');
  expect(result.phase).toBe('quest-select');
  expect(result.threat).toBeNull();
  expect(result.encounter ?? null).toBeNull();
  await info.attach('entry-result', { body: JSON.stringify({ scope: 'EXPLICIT_SELECTION_ONLY', result }), contentType: 'application/json' });
  info.annotations.push({ type: 'proof-scope', description: 'Normal player UI without fixture injection. Selection/reload only; full Threat path NOT_PROVEN.' });
});
