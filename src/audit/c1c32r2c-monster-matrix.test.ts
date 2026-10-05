import { describe, expect, it } from 'vitest';
import { drawnRuinsFixture } from '../game-engine/ruins/executor-test-fixture';
import { ruinsMonsterDefinitions, resolveRuinsStance } from '../game-engine/ruins/source-registry';
import { RUINS_STANCES, RUINS_V6 } from '../types/ruins-executable';
import { prepareRuinsMonsterTurn, resolveRuinsMonsterMovementChoice, resolveRuinsMonsterSkill,
  stageRuinsAttack, resolveRuinsAttackValues } from '../game-engine/ruins/monster-runtime';
import { resolveRuinsLargeDisplacement } from '../game-engine/ruins/movement-runtime';
import { resolveRuinsRoomMovementChoice } from '../game-engine/ruins/room-runtime';
import { resolveRuinsPrintedMovementChoice, recordRuinsEvent } from '../game-engine/ruins/printed-effect-runtime';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { SeededRandom } from '../game-engine/runtime-sources';
import { commitPendingMonsterAttackResolution, freezePendingMonsterAttack } from '../game-engine/battle';
import type { BattleState } from '../types';

function completeChoices(battle: BattleState): BattleState {
  for (let count = 0; battle.ruinsContext!.pendingChoice && count < 20; count++) {
    const choice = battle.ruinsContext!.pendingChoice!;
    if (choice.kind === 'MONSTER_MOVE') battle = resolveRuinsMonsterMovementChoice(battle, choice.choiceId, choice.candidateIds[0]);
    else if (choice.kind === 'ROOM_MOVE') battle = resolveRuinsRoomMovementChoice(battle, choice.choiceId, choice.candidateIds[0]);
    else if (choice.kind === 'LARGE_DISPLACEMENT') battle = resolveRuinsLargeDisplacement(battle, choice.choiceId, choice.candidateIds[0]);
    else battle = resolveRuinsPrintedMovementChoice(battle, choice.choiceId, choice.candidateIds[0]);
  }
  expect(battle.ruinsContext!.pendingChoice).toBeNull();
  return battle;
}

describe('C1C32R2C every locked Monster identity in runtime', () => {
  it.each(ruinsMonsterDefinitions(RUINS_V6))('$canonicalId: all Stances, all d10 outcomes, all Skills and printed attack thresholds', definition => {
    const campaign = drawnRuinsFixture(encounter => encounter.monsters.some(monster => monster.definitionId === definition.canonicalId), 3, RUINS_V6);
    const snapshot = JSON.parse(JSON.stringify(createSaveSnapshot(campaign)));
    expect(validateSaveFile(snapshot)).toBeNull();
    const base = restoreSaveSnapshot(snapshot).battle!;
    expect(base).toEqual(campaign.battle);
    const actorId = base.monsters.find(monster => monster.sourceId === definition.canonicalId)!.id;
    expect(base.ruinsContext!.occupiedSpaces[actorId]).toBe(definition.occupiedSpaces);
    for (const stance of RUINS_STANCES) {
      for (let d10 = 1; d10 <= 10; d10++) {
        const battle = structuredClone(base);
        const actor = battle.monsters.find(monster => monster.id === actorId)!;
        actor.stance = stance;

        battle.activeActorId = actor.id;
        battle.initiativeIndex = battle.initiativeOrder.indexOf(actor.id);
        for (let seed = 1; seed < 10000; seed++) {
          const rng = new SeededRandom(seed), cursor = rng.snapshot();
          if (Math.floor(rng.next() * 10) + 1 === d10) { battle.ruinsContext!.rngCursor = cursor; break; }
        }
        const expected = resolveRuinsMonsterSkill(definition, stance, d10);
        const after = completeChoices(prepareRuinsMonsterTurn(battle, actorId));
        const selection = after.ruinsContext!.events.find(event => event.type === 'MONSTER_SKILL_SELECTED')!;
        expect(selection.detail).toEqual({ d10, skillNumber: expected?.number ?? null, stance });
        expect(resolveRuinsStance(definition, stance).kind === 'NO_ACTION').toBe(expected === null);
      }
    }
    for (const skill of definition.skills) {
      const targets = skill.targetSide === 'self' ? [actorId] : skill.targetSide === 'monster'
        ? base.monsters.filter(monster => monster.id !== actorId).map(monster => monster.id).slice(0, skill.targets)
        : base.heroes.slice(0, skill.targets).map(hero => hero.id);
      expect(targets.length).toBeGreaterThan(0);
      const battle = structuredClone(base);
      battle.activeActorId = actorId;
      battle.initiativeIndex = battle.initiativeOrder.indexOf(actorId);
      const parent = recordRuinsEvent(battle.ruinsContext!, 'MONSTER_SKILL_SELECTED', actorId, targets, null,
        { d10: 1, skillNumber: skill.number, stance: battle.monsters.find(monster => monster.id === actorId)!.stance });
      if (skill.attack.kind === 'AUTOMATIC') {
        const executed = completeChoices(stageRuinsAttack(battle, actorId, skill, targets, parent));
        expect(executed.pendingMonsterAttack).toBeNull();
      } else {
        for (let roll = 1; roll <= 10; roll++) {
          const staged = completeChoices(stageRuinsAttack(structuredClone(battle), actorId, skill, targets, parent, roll));
          const expectedHit = roll <= skill.attack.accuracy - staged.heroes[0].heroDodgeBinding!.value;
          const selfBuffBonus = skill.effects.filter(effect => effect.type === 'condition' && effect.target === 'self' && effect.condition === 'buff')
            .reduce((sum, effect) => sum + (effect.type === 'condition' ? effect.amount : 0), 0);
          const expectedCrit = expectedHit && roll <= skill.attack.crit + selfBuffBonus;
          expect(resolveRuinsAttackValues(staged)).toEqual({ hit: expectedHit, crit: expectedCrit,
            damage: expectedHit ? expectedCrit ? skill.attack.critDamage : skill.attack.damage : 0 });
          const frozen = freezePendingMonsterAttack(staged);
          const committed = completeChoices(commitPendingMonsterAttackResolution(frozen));
          expect(committed.ruinsContext!.rngCalls).toBeGreaterThanOrEqual(staged.ruinsContext!.rngCalls);
        }
      }
    }
  }, 30000);
});
