import { describe, expect, it } from 'vitest';
import { drawnRuinsFixture, fixtureArea } from '../game-engine/ruins/executor-test-fixture';
import { prepareRuinsMonsterTurn, resolveRuinsMonsterSkill } from '../game-engine/ruins/monster-runtime';
import { resolveRuinsLargeDisplacement } from '../game-engine/ruins/movement-runtime';
import { ruinsMonster } from '../game-engine/ruins/source-registry';
import { SeededRandom } from '../game-engine/runtime-sources';
import { RUINS_STANCES } from '../types/ruins-executable';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';

describe('C1C32R2C source Large movement continuation', () => {
  it('reloads inherited v3 displacement candidates, licenses one overflow and attacks only targets left in the Area', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1
      && encounter.monsters.some(monster => monster.definitionId === 'bone-captain'));
    const battle = structuredClone(campaign.battle);
    const actor = battle.monsters.find(monster => monster.sourceId === 'bone-captain')!;
    for (const hero of battle.heroes) fixtureArea(battle, hero.id, 'ruins-tile-1:NW');
    fixtureArea(battle, actor.id, 'ruins-tile-1:N');
    battle.monsters.filter(monster => monster.id !== actor.id).forEach((monster, index) =>
      fixtureArea(battle, monster.id, index ? 'ruins-tile-1:E' : 'ruins-tile-1:LOW'));
    const definition = ruinsMonster(actor.sourceId, battle.ruinsContext!.ruleSetVersion);
    actor.stance = RUINS_STANCES.find(stance => resolveRuinsMonsterSkill(definition, stance, 1)?.number === 2)!;
    actor.position = RUINS_STANCES.indexOf(actor.stance) + 1;
    for (let seed = 1; seed < 10000; seed++) {
      const source = new SeededRandom(seed), cursor = source.snapshot();
      if (Math.floor(source.next() * 10) + 1 === 1) { battle.ruinsContext!.rngCursor = cursor; break; }
    }
    battle.activeActorId = actor.id;
    battle.initiativeIndex = battle.initiativeOrder.indexOf(actor.id);
    const paused = prepareRuinsMonsterTurn(battle, actor.id);
    const choice = paused.ruinsContext!.pendingChoice!;
    expect(choice.kind).toBe('LARGE_DISPLACEMENT');
    expect(choice.candidateIds.length).toBeGreaterThan(1);
    const save = JSON.parse(JSON.stringify(createSaveSnapshot({ ...campaign, battle: paused })));
    expect(validateSaveFile(save)).toBeNull();
    const restored = restoreSaveSnapshot(save).battle!;
    expect(restored.largeMovementContract!.pendingChoice!.candidateIds).toEqual(choice.candidateIds);
    const resumed = resolveRuinsLargeDisplacement(restored, choice.choiceId, choice.candidateIds[0]);
    expect(resumed).toEqual(resolveRuinsLargeDisplacement(paused, choice.choiceId, choice.candidateIds[0]));
    expect(resumed.largeMovementContract!.overflow).toHaveLength(1);
    expect(resumed.largeMovementContract!.overflow[0].extraSpaces).toBe(1);
    expect(resumed.pendingMonsterAttack!.ruinsAttack!.remainingTargetIds).toHaveLength(2);
    expect(resumed.ruinsContext!.rngCalls).toBe(paused.ruinsContext!.rngCalls + 1);
    const resumedSave = JSON.parse(JSON.stringify(createSaveSnapshot({ ...campaign, battle: resumed })));
    expect(validateSaveFile(resumedSave)).toBeNull();
    const forged = structuredClone(save);
    forged.campaign.battle.ruinsContext.pendingChoice.candidateIds.reverse();
    expect(validateSaveFile(forged)).not.toBeNull();
  });
});
