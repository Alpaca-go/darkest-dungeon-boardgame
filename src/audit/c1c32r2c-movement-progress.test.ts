import { describe, expect, it } from 'vitest';
import { drawnRuinsFixture, fixtureArea } from '../game-engine/ruins/executor-test-fixture';
import { ruinsMonster, ruinsTile } from '../game-engine/ruins/source-registry';
import { ruinsAreaDistance, ruinsMonsterMovementCandidates, ruinsMonsterTurnMovementCandidates } from '../game-engine/ruins/monster-runtime';

describe('C1C32R2C incomplete Monster movement', () => {
  it('uses available Speed to approach exact Range when that Range cannot yet be reached', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 1
      && encounter.monsters.some(monster => monster.definitionId === 'bone-rabble'));
    const battle = campaign.battle, context = battle.ruinsContext!;
    const actor = battle.monsters.find(monster => monster.sourceId === 'bone-rabble')!, target = battle.heroes[0];
    const skill = ruinsMonster(actor.sourceId, context.ruleSetVersion).skills.find(skill => skill.range.kind === 'EXACT' && skill.range.distance === 0)!;
    fixtureArea(battle, actor.id, 'ruins-tile-1:NW');
    fixtureArea(battle, target.id, 'ruins-tile-1:E');
    battle.heroes.filter(hero => hero.id !== target.id).forEach((hero, index) =>
      fixtureArea(battle, hero.id, index ? 'ruins-tile-1:NW' : 'ruins-tile-1:SW'));
    battle.monsters.filter(monster => monster.id !== actor.id).forEach((monster, index) =>
      fixtureArea(battle, monster.id, index ? 'ruins-tile-1:SE' : 'ruins-tile-1:S'));
    const movement = { battle, tile: ruinsTile(context.tileId), placements: context.placements, guardStacks: context.guardStacks };
    expect(ruinsMonsterMovementCandidates(movement, actor.id, target.id, skill, context.occupiedSpaces, 1)).toEqual([]);
    const candidates = ruinsMonsterTurnMovementCandidates(movement, actor.id, target.id, skill, context.occupiedSpaces, 1);
    expect(candidates.length).toBeGreaterThan(0);
    for (const destination of candidates) {
      expect(ruinsAreaDistance(movement.tile, destination, context.placements[target.id]))
        .toBe(ruinsAreaDistance(movement.tile, context.placements[actor.id], context.placements[target.id]) - 1);
      expect(ruinsAreaDistance(movement.tile, context.placements[actor.id], destination)).toBe(1);
    }
  });
});
