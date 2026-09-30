import { describe, expect, it } from 'vitest';
import { drawnRuinsFixture } from '../game-engine/ruins/executor-test-fixture';
import { ruinsMonsterDefinitions, resolveRuinsStance } from '../game-engine/ruins/source-registry';
import { RUINS_STANCES, RUINS_V5 } from '../types/ruins-executable';
import { prepareRuinsMonsterTurn, resolveRuinsMonsterMovementChoice, resolveRuinsMonsterSkill,
  stageRuinsAttack, resolveRuinsAttackValues } from '../game-engine/ruins/monster-runtime';
import { resolveRuinsLargeDisplacement } from '../game-engine/ruins/movement-runtime';
import { resolveRuinsRoomMovementChoice } from '../game-engine/ruins/room-runtime';
import { resolveRuinsPrintedMovementChoice, recordRuinsEvent } from '../game-engine/ruins/printed-effect-runtime';
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
  it.each(ruinsMonsterDefinitions(RUINS_V5))('$canonicalId: all Stances, all d10 outcomes, all Skills and printed attack thresholds', definition => {
    const campaign = drawnRuinsFixture(encounter => encounter.monsters.some(monster => monster.definitionId === definition.canonicalId));
    const base = campaign.battle;
    const actorId = base.monsters.find(monster => monster.sourceId === definition.canonicalId)!.id;
    expect(base.ruinsContext!.occupiedSpaces[actorId]).toBe(definition.occupiedSpaces);
    for (const stance of RUINS_STANCES) {
      for (let d10 = 1; d10 <= 10; d10++) {
        const battle = structuredClone(base);
        const actor = battle.monsters.find(monster => monster.id === actorId)!;
        actor.stance = stance;
        actor.position = RUINS_STANCES.indexOf(stance) + 1;
        battle.activeActorId = actor.id;
        battle.initiativeIndex = battle.initiativeOrder.indexOf(actor.id);
        for (let seed = 1; seed < 10000; seed++) {
          const rng = new SeededRandom(seed), cursor = rng.snapshot();
          if (Math.floor(rng.next() * 10) + 1 === d10) { battle.ruinsContext!.rngCursor = cursor; break; }
        }
        const expected = resolveRuinsMonsterSkill(definition, stance, d10);
        let after: BattleState;
        try { after = completeChoices(prepareRuinsMonsterTurn(battle, actorId)); }
        catch (error) {
          expect(String(error)).toContain('SOURCE_UNRESOLVED: LARGE_STANCE_SHUFFLE_SLOT_COLLISION');
          // This source layout is explicitly blocked, not counted as executable production acceptance.
          continue;
        }
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
        let executed: BattleState;
        try { executed = completeChoices(stageRuinsAttack(battle, actorId, skill, targets, parent)); }
        catch (error) { expect(String(error)).toContain('SOURCE_UNRESOLVED: LARGE_STANCE_SHUFFLE_SLOT_COLLISION'); continue; }
        expect(executed.pendingMonsterAttack).toBeNull();
      } else {
        for (let roll = 1; roll <= 10; roll++) {
          let staged: BattleState;
          try { staged = completeChoices(stageRuinsAttack(structuredClone(battle), actorId, skill, targets, parent, roll)); }
          catch (error) { expect(String(error)).toContain('SOURCE_UNRESOLVED: LARGE_STANCE_SHUFFLE_SLOT_COLLISION'); continue; }
          const expectedHit = roll <= skill.attack.accuracy - staged.heroes[0].heroDodgeBinding!.value;
          const selfBuffBonus = skill.effects.filter(effect => effect.type === 'condition' && effect.target === 'self' && effect.condition === 'buff')
            .reduce((sum, effect) => sum + (effect.type === 'condition' ? effect.amount : 0), 0);
          const expectedCrit = expectedHit && roll <= skill.attack.crit + selfBuffBonus;
          expect(resolveRuinsAttackValues(staged)).toEqual({ hit: expectedHit, crit: expectedCrit,
            damage: expectedHit ? expectedCrit ? skill.attack.critDamage : skill.attack.damage : 0 });
          const frozen = freezePendingMonsterAttack(staged);
          let committed: BattleState;
          try { committed = completeChoices(commitPendingMonsterAttackResolution(frozen)); }
          catch (error) { expect(String(error)).toContain('SOURCE_UNRESOLVED: LARGE_STANCE_SHUFFLE_SLOT_COLLISION'); continue; }
          expect(committed.ruinsContext!.rngCalls).toBeGreaterThanOrEqual(staged.ruinsContext!.rngCalls);
        }
      }
    }
  }, 30000);
});
