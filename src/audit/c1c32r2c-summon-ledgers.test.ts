import { describe, expect, it } from 'vitest';
import { drawnRuinsFixture } from '../game-engine/ruins/executor-test-fixture';
import { bindNecromancerFigures, validateNecromancerFigures } from '../game-engine/ruins/physical-supply';
import { bindBossEncounter, applyBossRuntimeInput } from '../game-engine/bosses/foundation';
import { resolveBossDefinition } from '../game-engine/bosses/definitions';
import { productionBoneDefinitions } from '../game-engine/bosses/component-adapters/bone-combat-adapter';
import { HERO_DODGE_V2 } from '../game-engine/rules/hero-dodge';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import type { BattleState, CampaignState } from '../types';

function attached(campaign: CampaignState, battle: BattleState): CampaignState {
  const binding = battle.necromancerFigureBinding!;
  return { ...campaign, battle, ruinsDrawState: binding.draw, ruinsBoneFigureSupply: binding.supply, gamePhase: 'battle' };
}
function reload(campaign: CampaignState): CampaignState {
  const snapshot = JSON.parse(JSON.stringify(createSaveSnapshot(campaign)));
  expect(validateSaveFile(snapshot)).toBeNull();
  const restored = restoreSaveSnapshot(snapshot);
  expect(restored).toEqual(campaign);
  return restored;
}

describe('C1C32R2C ordinary and Necromancer card/figure reconciliation', () => {
  it('reserves both source classes for Captain while ordinary ownership stays live, then returns only the summon', () => {
    const campaign = drawnRuinsFixture(encounter => !encounter.monsters.some(monster => monster.definitionId === 'bone-captain'));
    const shell = { ...campaign.battle, ruinsContext: undefined, largeMovementContract: undefined,
      monsters: [], initiativeOrder: campaign.battle.heroes.map(hero => hero.id) };
    const boss = bindBossEncounter(shell, resolveBossDefinition('necromancer', 2, HERO_DODGE_V2), 29, productionBoneDefinitions(HERO_DODGE_V2));
    const bound = bindNecromancerFigures(boss, campaign.ruinsBoneFigureSupply, campaign.ruinsDrawState);
    const summoned = applyBossRuntimeInput(bound, { type: 'FIRST_DUNGEON_BATTLE' });
    const binding = summoned.necromancerFigureBinding!;
    expect(Object.values(binding.tokenFigures)).toEqual(['bone-captain:figure-1']);
    expect(Object.values(binding.tokenCards)).toHaveLength(1);
    const card = Object.values(binding.tokenCards)[0];
    expect(binding.draw!.ownership[card]).toEqual({ location: 'SUMMON_POOL', encounterId: binding.encounterId });
    expect(binding.draw!.monsterDeck).not.toContain(card);
    expect(binding.draw!.encounters[0].returned).toBe(false);
    expect(binding.supply.ordinaryAssignments).toEqual(campaign.ruinsBoneFigureSupply.ordinaryAssignments);
    const restored = reload(attached(campaign, summoned));
    const ended = applyBossRuntimeInput(restored.battle!, { type: 'END_THREAT_BATTLE' });
    expect(ended.necromancerFigureBinding!.draw!.monsterDeck).toContain(card);
    expect(ended.necromancerFigureBinding!.supply.figureOwners['bone-captain:figure-1'].location).toBe('AVAILABLE');
    expect(ended.necromancerFigureBinding!.supply.ordinaryAssignments).toEqual(campaign.ruinsBoneFigureSupply.ordinaryAssignments);
    expect(applyBossRuntimeInput(ended, { type: 'END_THREAT_BATTLE' }).necromancerFigureBinding).toEqual(ended.necromancerFigureBinding);
    const forged = structuredClone(summoned);
    forged.necromancerFigureBinding!.tokenCards[Object.keys(binding.tokenCards)[0]] = campaign.ruinsDrawState.encounters[0].monsters[0].copyId;
    expect(() => validateNecromancerFigures(forged)).toThrow('card ledgers');
  });

  it('uses the ordinary card and figure again for source Level III Reanimation, with no new reservation', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.monsters.some(monster => monster.definitionId === 'bone-rabble'));
    const ordinary = campaign.battle.monsters.find(monster => monster.sourceId === 'bone-rabble')!;
    const shell = { ...campaign.battle, ruinsContext: undefined, largeMovementContract: undefined, monsters: [ordinary],
      initiativeOrder: [...campaign.battle.heroes.map(hero => hero.id), ordinary.id] };
    const boss = bindBossEncounter(shell, resolveBossDefinition('necromancer', 3, HERO_DODGE_V2), 29, productionBoneDefinitions(HERO_DODGE_V2));
    const bound = bindNecromancerFigures(boss, campaign.ruinsBoneFigureSupply, campaign.ruinsDrawState);
    const before = reload(attached(campaign, bound));
    const binding = before.battle!.necromancerFigureBinding!;
    const card = Object.values(binding.tokenCards)[0], figure = Object.values(binding.tokenFigures)[0];
    const reanimated = applyBossRuntimeInput(before.battle!, { type: 'MONSTER_DAMAGE', amounts: { [ordinary.id]: ordinary.maxHp } });
    expect(reanimated.bossEncounter!.reanimationState.firstDeathWindowConsumed).toBe(true);
    expect(reanimated.monsters[0].id).not.toBe(ordinary.id);
    expect(Object.values(reanimated.necromancerFigureBinding!.tokenCards)).toEqual([card]);
    expect(Object.values(reanimated.necromancerFigureBinding!.tokenFigures)).toEqual([figure]);
    expect(reanimated.necromancerFigureBinding!.draw).toEqual(binding.draw);
    expect(reanimated.necromancerFigureBinding!.supply).toEqual(binding.supply);
    reload(attached(campaign, reanimated));
  });
});
