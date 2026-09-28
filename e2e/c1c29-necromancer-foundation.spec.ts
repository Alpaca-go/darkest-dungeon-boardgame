import { expect, test } from '@playwright/test';

/** Harness-assisted scoped path: synthetic dependency definitions, real Store/UI/save/engine. */
test('C1C29 Threat tie, Reanimation tie, Boss Skill tie, summon, reload and cleanup', async ({ page }) => {
  await page.goto('/', { waitUntil: 'domcontentloaded' });
  await page.evaluate(async () => {
    const loadModule = (path: string) => import(/* @vite-ignore */ path);
    const [{ createNewCampaign, createHeroInstance }, { necromancerDefinition }, { startBossFoundation },
      { bindBossEncounter, applyBossRuntimeInput }, { syntheticBoneDefinitions, fixtureUnit }, { seededRuntimeSources, withRuntimeSources },
      { saveCampaign }, { useGameStore }] = await Promise.all([
      loadModule('/src/game-engine/campaign.ts'), loadModule('/src/game-engine/necromancer/contract-adapter.ts'),
      loadModule('/src/game-engine/commands/boss-foundation.ts'), loadModule('/src/game-engine/bosses/foundation.ts'),
      loadModule('/src/game-engine/bosses/foundation-test-fixture.ts'), loadModule('/src/game-engine/runtime-sources.ts'),
      loadModule('/src/game-engine/save.ts'), loadModule('/src/store/useGameStore.ts'),
    ]);
    const c = withRuntimeSources(seededRuntimeSources(29), () => {
      const result = createNewCampaign();
      result.heroes = ['crusader', 'highwayman', 'vestal', 'hellion'].map((id, index) => createHeroInstance(id, index));
      return result;
    });
    c.currentQuestId = 'face-the-threat'; c.gamePhase = 'dungeon-explore';
    c.campaignProgress.activeThreatId = 'necromancer-threat-level-3'; c.campaignProgress.activeBossFamilyId = 'necromancer'; c.campaignProgress.pendingThreatInitialization = false;
    c.dungeon = { questId: 'face-the-threat', questRunId: 'c1c29-browser-run', currentRoomId: 'room-10', previousRoomId: null,
      rooms: [{ id: 'room-10', type: 'objective', status: 'current', adjacentRoomIds: [] }], scoutedNextMove: false, roomsCleared: 0, objectiveComplete: false, canLeave: false };
    const started = startBossFoundation(c, necromancerDefinition(3), 29, 'room-10', Object.fromEntries(c.heroes.map(h => [h.instanceId, 0])), syntheticBoneDefinitions);
    const raw = started.battle;
    delete raw.bossEncounter;
    raw.monsters = [fixtureUnit('death-a', 'monster', 1, 'bone-rabble'), fixtureUnit('death-z', 'monster', 2, 'bone-rabble')];
    started.battle = bindBossEncounter(raw, necromancerDefinition(3), 29, syntheticBoneDefinitions);
    started.battle = applyBossRuntimeInput(started.battle, { type: 'PREPARATION_DAY', rolls: Object.fromEntries(started.battle.heroes.map(h => [h.id, 1])) });
    saveCampaign(started); useGameStore.setState({ campaign: started });
  });
  await page.goto('/battle', { waitUntil: 'domcontentloaded' });
  await expect(page.getByTestId('boss-pending-choice')).toBeVisible();
  await expect(page.getByTestId('boss-choice-confirm')).toBeDisabled();
  await page.getByRole('button', { name: 'Highwayman', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Highwayman', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByTestId('boss-choice-confirm').click();
  await expect(page.getByTestId('boss-pending-choice')).toHaveCount(0);

  const applyInput = async (input: unknown, prepareSkill = false) => page.evaluate(async ({ input, prepareSkill }) => {
    const loadModule = (path: string) => import(/* @vite-ignore */ path);
    const [{ applyBossRuntimeInput }, { saveCampaign }, { useGameStore }] = await Promise.all([
      loadModule('/src/game-engine/bosses/foundation.ts'), loadModule('/src/game-engine/save.ts'), loadModule('/src/store/useGameStore.ts')]);
    const c = useGameStore.getState().campaign;
    if (prepareSkill) {
      c.battle.heroes.forEach((hero, index) => { c.battle.bossEncounter.placements[hero.id] = index < 2 ? 'upper-centre' : 'left'; });
    }
    const next = { ...c, battle: applyBossRuntimeInput(c.battle, input) };
    saveCampaign(next); useGameStore.setState({ campaign: next });
  }, { input, prepareSkill });
  await applyInput({ type: 'MONSTER_DAMAGE', amounts: { 'death-a': 40, 'death-z': 40 } });
  await expect(page.getByTestId('boss-pending-choice')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('button', { name: 'death-z', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'death-z', exact: true }).click();
  await page.getByTestId('boss-choice-confirm').click();
  await expect(page.getByTestId('boss-pending-choice')).toHaveCount(0);

  await applyInput({ type: 'END_THREAT_BATTLE' });
  await applyInput({ type: 'ENTER_BOSS_ROOM' });
  await applyInput({ type: 'SKILL', skillRoll: 1, attackRoll: 2 }, true);
  await expect(page.getByTestId('boss-pending-choice')).toBeVisible();
  await page.reload({ waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'upper-centre', exact: true }).click();
  await page.getByTestId('boss-choice-confirm').click();
  await expect(page.getByTestId('boss-pending-choice')).toHaveCount(0);

  const ids = await page.evaluate(async () => {
    const path = '/src/store/useGameStore.ts'; const { useGameStore } = await import(/* @vite-ignore */ path);
    const e = useGameStore.getState().campaign.battle.bossEncounter;
    return { bossId: e.bossState.actorId, summonId: e.activeSummons[0], consumed: e.reanimationState.firstDeathWindowConsumed, side: e.side };
  });
  expect(ids.summonId).toBeTruthy(); expect(ids.side).toBe('ABILITY');
  await applyInput({ type: 'MONSTER_DAMAGE', amounts: { [ids.summonId]: 12 } });
  await applyInput({ type: 'MONSTER_DAMAGE', amounts: { [ids.bossId]: 200 } });
  await page.evaluate(async () => {
    const path = '/src/store/useGameStore.ts'; const { useGameStore } = await import(/* @vite-ignore */ path);
    useGameStore.getState().battleResolveVictory();
  });
  const final = await page.evaluate(() => JSON.parse(localStorage.getItem('dd-web-prototype-save-v1')!));
  expect(final.campaign.battle).toBeNull();
  expect(final.campaign.campaignProgress.defeatedBossFamilyIds).toContain('necromancer');
  expect(final.campaign.bossEncounterHistory[0].phase).toBe('COMPLETE');
  expect(final.campaign.bossEncounterHistory[0].ruleSetVersion).toBe('C1C28-DIGITAL-DEFAULT-v1');
});
