import { expect, test } from '@playwright/test';

/** Full production attempt stops at the real entry failure. Test success is gate coverage, not gameplay acceptance. */
test('C1C31 production attempt: selector to cleanup stops at dependency validation (PRODUCT_FAILURE)', async ({ page }, testInfo) => {
  testInfo.annotations.push({ type: 'production-result', description: 'PRODUCT_FAILURE: normal selector dependency gate; Threat/Room/Skill/Bone turn/Reanimation/reaction/cleanup not reached.' });
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
  console.log(JSON.stringify({ phase: 'C1C31', productionResult: 'PRODUCT_FAILURE',
    failureBoundary: 'NORMAL_SELECTOR_DEPENDENCY_VALIDATION', commandError: result.error,
    unresolvedDependencies: result.unresolved, inputCampaignUnchanged: result.unchanged,
    downstreamNotReached: ['Threat', 'Room 10', 'Ability', 'Boss Skill', 'real Bone summon', 'Bone turn',
      'Bone death', 'Reanimation', 'reaction save/reload', 'victory', 'cleanup'],
    pendingChoiceProductionProof: 'NOT_REACHED', syntheticDependenciesUsed: false }));
  await page.goto('/quests', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('necromancer-production-entry-blocked')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('necromancer-production-entry-blocked')).toBeVisible();
});
