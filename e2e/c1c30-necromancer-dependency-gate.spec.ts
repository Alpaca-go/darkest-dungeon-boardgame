import { expect, test } from '@playwright/test';

/** Gate coverage only; successful summon/combat is deliberately not claimed as E2E proof. */
test('C1C30 production selector rejects unresolved Bone and Hero dependencies without fixture fallback', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  const result = await page.evaluate(async () => {
    const load = (path: string) => import(/* @vite-ignore */ path);
    const [{ createNewCampaign, createHeroInstance }, { necromancerProductionDependencyGate },
      { commitQuestSelection }, { saveCampaign }, { useGameStore }, { SKILLS }] = await Promise.all([
      load('/src/game-engine/campaign.ts'), load('/src/game-engine/bosses/production-dependency-gate.ts'),
      load('/src/game-engine/commands/quest.ts'), load('/src/game-engine/save.ts'), load('/src/store/useGameStore.ts'),
      load('/src/data/skills.ts'),
    ]);
    const c = createNewCampaign();
    c.heroes = ['crusader', 'highwayman', 'vestal', 'hellion'].map((id, i) => {
      const hero = createHeroInstance(id, i);
      hero.equippedSkillIds = SKILLS.filter((skill: { heroId: string }) => skill.heroId === id).slice(0, 3).map((skill: { id: string }) => skill.id);
      return hero;
    });
    c.gamePhase = 'quest-select'; c.runtimeContentProfile = 'community-complete-edition';
    c.campaignProgress.activeThreatId = 'necromancer-threat-level-1'; c.campaignProgress.activeBossFamilyId = 'necromancer';
    c.campaignProgress.pendingThreatInitialization = false; c.campaignProgress.completedStandardQuestsThisAct = 2; c.campaignProgress.bossQuestRequired = true;
    const gate = necromancerProductionDependencyGate(c, 1);
    const selected = commitQuestSelection(c, 'face-the-threat');
    saveCampaign(c); useGameStore.setState({ campaign: c });
    return { enabled: gate.enabled, unresolved: gate.unresolved, syntheticFallbackAllowed: gate.syntheticFallbackAllowed,
      error: selected.error, unchanged: selected.campaign === c, battle: c.battle, dungeon: c.dungeon };
  });
  expect(result.enabled).toBe(false); expect(result.syntheticFallbackAllowed).toBe(false);
  expect(result.unresolved).toContain('hero:vestal:level-1:dodge');
  expect(result.error).toBe('necromancer-production-dependencies-unbound');
  expect(result.unchanged).toBe(true); expect(result.battle).toBeNull(); expect(result.dungeon).toBeNull();
  await page.goto('/quests', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('necromancer-production-entry-blocked')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('necromancer-production-entry-blocked')).toBeVisible();
});

test.skip('C1C30 normal entry → Room 10 → real Bone turn → save/reload → cleanup: blocked by production dependency contract review', async () => {});
