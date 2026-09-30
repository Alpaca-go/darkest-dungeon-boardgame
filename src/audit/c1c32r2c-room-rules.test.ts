import { RUINS_V6 } from '../types/ruins-executable';
import { describe, expect, it } from 'vitest';
import { drawnRuinsFixture, fixtureArea } from '../game-engine/ruins/executor-test-fixture';
import { ruinsRoom, ruinsTile } from '../game-engine/ruins/source-registry';
import { interactOrdinaryRuinsRoom, runRuinsRoomTrigger, resolveRuinsRoomMovementChoice } from '../game-engine/ruins/room-runtime';
import { applyRuinsPrintedEffects, recordRuinsEvent } from '../game-engine/ruins/printed-effect-runtime';
import { resolveRuinsLargeDisplacement } from '../game-engine/ruins/movement-runtime';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { getQuirkById } from '../data/quirks';
import { advanceTurn } from '../game-engine/battle';
import { applyStatusEffectEvent } from '../game-engine/status-effects';

const rules = Array.from({ length: 9 }, (_, index) => ruinsRoom(index + 1))
  .flatMap(room => room.rules.map(rule => ({ roomNumber: room.roomNumber, rule })));

describe('C1C32R2C all source Room rules execute', () => {
  it.each(rules)('$roomNumber / $rule.id / $rule.trigger', ({ roomNumber, rule }) => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === roomNumber, 3, RUINS_V6);
    const battle = structuredClone(campaign.battle);
    const unit = rule.side === 'monster' ? battle.monsters[0] : battle.heroes[0];
    if (rule.id === 'invoking-abyss') {
      fixtureArea(battle, battle.monsters[0].id, rule.areas[0]);
    } else if (rule.areas.length) fixtureArea(battle, unit.id, rule.areas[0]);
    unit.hp = Math.max(1, unit.hp - 4);
    unit.stress = 4;
    unit.resistances = undefined;
    unit.categoricalResistances = [];
    battle.activeActorId = unit.id;
    battle.initiativeIndex = battle.initiativeOrder.indexOf(unit.id);
    battle.currentActionPoints = 2;
    if (rule.requiresNoMonsters) battle.monsters = battle.monsters.map(monster => ({ ...monster, isAlive: false, hp: 0 }));
    if (rule.trigger === 'LAST_MONSTER_MOVE') {
      const actor = [...battle.initiativeOrder].reverse().find(id => battle.monsters.some(monster => monster.id === id))!;
      const before = battle.ruinsContext!.placements[actor];
      let moved = runRuinsRoomTrigger(battle, rule.trigger, actor);
      for (let index = 0; moved.ruinsContext!.pendingChoice && index < 4; index++) {
        const choice = moved.ruinsContext!.pendingChoice!;
        moved = choice.kind === 'LARGE_DISPLACEMENT'
          ? resolveRuinsLargeDisplacement(moved, choice.choiceId, choice.candidateIds[0])
          : resolveRuinsRoomMovementChoice(moved, choice.choiceId, choice.candidateIds[0]);
      }
      expect(moved.ruinsContext!.events.some(event => event.type === 'ROOM_RULE' && event.detail.ruleId === rule.id)).toBe(true);
      expect(ruinsTile(moved.ruinsContext!.tileId).areas.some(area => area.id === moved.ruinsContext!.placements[actor])).toBe(true);
      if (before !== 'ruins-tile-8:CIRCLE') expect(moved.ruinsContext!.placements[actor]).not.toBe(before);
      return;
    }
    if (rule.trigger === 'INTERACT') {
      if (rule.effects.some(effect => effect.type === 'drawTrinket')) {
        const after = interactOrdinaryRuinsRoom({ ...campaign, battle }, unit.id, rule.id);
        expect(after.battle!.ruinsContext!.roomUses).toContain(rule.id);
        expect(after.battle!.currentActionPoints).toBe(2 - rule.actionCost);
        expect(after.battle!.ruinsContext!.events.some(e => e.type === 'SOURCE_TRINKET_DRAW')).toBe(true);
        expect(after.trinketAcquisitionRecords.length + (after.pendingSourceTrinketRewards?.length ?? 0))
          .toBeGreaterThan(campaign.trinketAcquisitionRecords.length);
        return;
      }
      const after = interactOrdinaryRuinsRoom({ ...campaign, battle }, unit.id, rule.id);
      expect(after.battle!.heroes.find(hero => hero.id === unit.id)?.hp).toBe(unit.maxHp);
      expect(after.battle!.currentActionPoints).toBe(2 - rule.actionCost);
      if (rule.oncePerBattle) expect(() => interactOrdinaryRuinsRoom(after, unit.id, rule.id)).toThrow('requirements unmet');
      else {
        const twice = interactOrdinaryRuinsRoom(after, unit.id, rule.id);
        expect(twice.battle!.currentActionPoints).toBe(0);
        expect(() => interactOrdinaryRuinsRoom(twice, unit.id, rule.id)).toThrow('requirements unmet');
      }
      return;
    }
    const after = runRuinsRoomTrigger(battle, rule.trigger, rule.trigger === 'ROUND_END' ? undefined : unit.id);
    expect(after.ruinsContext!.events.some(event => event.type === 'ROOM_RULE' && event.detail.ruleId === rule.id)).toBe(true);
    const updated = [...after.heroes, ...after.monsters].find(candidate => candidate.id === unit.id)!;
    for (const effect of rule.effects) {
      if (effect.type === 'stress' && effect.target === 'target') expect(updated.stress).toBe(unit.stress + effect.amount);
      if (effect.type === 'stress' && effect.target === 'party') expect(after.heroes.every((hero, index) => hero.stress === battle.heroes[index].stress + effect.amount)).toBe(true);
      if (effect.type === 'heal' && typeof effect.amount === 'number') expect(updated.hp).toBe(Math.min(unit.maxHp, unit.hp + effect.amount));
      if (effect.type === 'damage') expect(updated.hp).toBe(unit.hp - effect.amount);
      if (effect.type === 'condition') expect(after.ruinsContext!.conditionStacks[unit.id]?.some(token => token.condition === effect.condition)).toBe(true);
      if (effect.type === 'quirkStressAndHealing') {
        const quirks = (unit.quirkIds ?? []).map(getQuirkById).filter(Boolean);
        expect(updated.stress).toBe(unit.stress + quirks.filter(quirk => quirk!.polarity === 'negative').length);
        expect(updated.hp).toBe(Math.min(unit.maxHp, unit.hp + quirks.filter(quirk => quirk!.polarity === 'positive').length * unit.heroLevel!));
      }
    }
    if (rule.trigger === 'PASSIVE' && rule.effects.some(effect => effect.type === 'immunity')) {
      const parent = recordRuinsEvent(after.ruinsContext!, 'PASSIVE_TEST', unit.id, [unit.id], null, {});
      const attempted = applyRuinsPrintedEffects(after, unit.id, unit.id,
        [{ type: 'condition', target: 'target', condition: 'bleed', amount: 3, turns: 3 },
          { type: 'shuffle', target: 'target', direction: 'push', distance: 1 }], parent);
      expect(attempted.heroes[0].bleed).toBe(0);
      expect(attempted.heroes[0].stance).toBe(unit.stance);
      expect(applyStatusEffectEvent(after, unit.id, [{ type: 'bleed', amount: 3, durationTurns: 3 }], 'direct-passive-test').heroes[0].bleed).toBe(0);
    }
    if (!['SHUFFLED_INTO'].includes(rule.trigger)) expect(runRuinsRoomTrigger(after, rule.trigger,
      rule.trigger === 'ROUND_END' ? undefined : unit.id)).toEqual(after);
  });

  it('fires Monster END_TURN during the automatic initiative loop and does not repeat it', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 4);
    const battle = structuredClone(campaign.battle);
    const monster = battle.monsters[0];
    monster.hp = Math.max(1, monster.hp - 4);
    fixtureArea(battle, monster.id, 'ruins-tile-4:CIRCLE');
    battle.activeActorId = monster.id;
    battle.initiativeIndex = battle.initiativeOrder.indexOf(monster.id);
    const after = advanceTurn(battle);
    expect(after.ruinsContext!.events.filter(event => event.type === 'ROOM_RULE' && event.actorId === monster.id
      && event.detail.ruleId === 'circle-of-power')).toHaveLength(1);
    expect(after.monsters.find(unit => unit.id === monster.id)?.hp).toBe(monster.maxHp);
  });

  it('preserves interaction usage and remaining action cost after save/reload', () => {
    const campaign = drawnRuinsFixture(encounter => encounter.roomNumber === 6);
    const battle = structuredClone(campaign.battle);
    const hero = battle.heroes[0];
    fixtureArea(battle, hero.id, 'ruins-tile-6:HIDE');
    battle.monsters = battle.monsters.map(unit => ({ ...unit, isAlive: false, hp: 0 }));
    battle.activeActorId = hero.id;
    battle.currentActionPoints = 2;
    const after = interactOrdinaryRuinsRoom({ ...campaign, battle }, hero.id, 'hide-and-heal');
    const snapshot = JSON.parse(JSON.stringify(createSaveSnapshot(after)));
    expect(validateSaveFile(snapshot)).toBeNull();
    const restored = restoreSaveSnapshot(snapshot);
    const twice = interactOrdinaryRuinsRoom(restored, hero.id, 'hide-and-heal');
    expect(twice.battle!.currentActionPoints).toBe(0);
    expect(() => interactOrdinaryRuinsRoom(twice, hero.id, 'hide-and-heal')).toThrow('requirements unmet');
  });
});
