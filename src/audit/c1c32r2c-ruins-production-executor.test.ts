import { describe, expect, it } from 'vitest';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../game-engine/ruins/encounter-draw';
import { beginOrdinaryRuinsBattle, initializeOrdinaryRuinsBattle, validateOrdinaryRuinsBattle } from '../game-engine/ruins/battle-runtime';
import { RUINS_STANCES, RUINS_V5 } from '../types/ruins-executable';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { explicitlySelectRuinsV4 } from '../game-engine/rules/ruins-v4';
import { explicitlySelectRuinsV5 } from '../game-engine/rules/ruins-v5';
import { commitQuestSelection } from '../game-engine/commands/quest';
import { getQuestPool, runtimeContentContext } from '../data/content-selector';
import { commitPendingMonsterAttackResolution, freezePendingMonsterAttack, prepareMonsterAttackResolution } from '../game-engine/battle';
import { resolveRuinsMonsterMovementChoice } from '../game-engine/ruins/monster-runtime';
import { heroUseSkill } from '../game-engine/battle';
import { getSkillById } from '../data/skills';
import { interactOrdinaryRuinsRoom, runRuinsRoomTrigger } from '../game-engine/ruins/room-runtime';
import { commitBattleVictory } from '../game-engine/commands/battle';
import type { BattleState } from '../types';

function boundRoom(roomNumber: number) {
  const chosen = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
    ['crusader', 'highwayman', 'vestal', 'hellion']));
  const party = { ...chosen, heroes: chosen.heroes.map((hero, index) => ({ ...hero, stance: RUINS_STANCES[index] })) };
  const stances = Object.fromEntries(party.heroes.map(hero => [hero.instanceId, hero.stance]));
  const selectedVersion = explicitlySelectRuinsV5(explicitlySelectRuinsV4({ ...party, gamePhase: 'quest-select' }, 'before-draw'), 'before-draw');
  const questId = getQuestPool(runtimeContentContext(selectedVersion))[0].id;
  const selection = commitQuestSelection(selectedVersion, questId);
  if (!selection.ok) throw new Error('Quest setup failed');
  let draw = drawOrdinaryRuinsEncounter(createRuinsDrawState(3, 1, RUINS_V5), 'room-a', stances);
  for (let seed = 2; draw.encounters[0].roomNumber !== roomNumber && seed < 100; seed++)
    draw = drawOrdinaryRuinsEncounter(createRuinsDrawState(3, seed, RUINS_V5), 'room-a', stances);
  if (draw.encounters[0].roomNumber !== roomNumber) throw new Error('Room seed not found');
  const campaign = { ...selection.campaign, ruinsDrawState: draw };
  const battle = initializeOrdinaryRuinsBattle(campaign, draw, 'room-a');
  const supply = assignOrdinaryBoneFigures(createBoneFigureSupply(), draw, draw.encounters[0]);
  return { ...campaign, battle, ruinsBoneFigureSupply: supply, gamePhase: 'battle' as const };
}
import { assignOrdinaryBoneFigures, createBoneFigureSupply, markSummonFigureDefeated,
  reanimateSummonFigure, reserveNecromancerSummonFigure, returnOrdinaryBoneFigures,
  validateBoneFigureSupply } from '../game-engine/ruins/physical-supply';

describe('C1C32R2C ordinary Ruins Battle binding', () => {
  it.each([1, 2, 3] as const)('initializes Level %i from exactly the drawn copies and initiative cards, then reloads', level => {
    const chosen = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
      ['crusader', 'highwayman', 'vestal', 'hellion']));
    const party = { ...chosen, heroes: chosen.heroes.map((hero, index) => ({ ...hero, stance: RUINS_STANCES[index] })) };
    const stances = Object.fromEntries(party.heroes.map(hero => [hero.instanceId, hero.stance]));
    const draw = drawOrdinaryRuinsEncounter(createRuinsDrawState(level, 13, RUINS_V5), 'room-a', stances);
    const selectedVersion = explicitlySelectRuinsV5(explicitlySelectRuinsV4({ ...party, gamePhase: 'quest-select' }, 'before-draw'), 'before-draw');
    const questId = getQuestPool(runtimeContentContext(selectedVersion))[0].id;
    const selection = commitQuestSelection(selectedVersion, questId);
    expect(selection.ok).toBe(true);
    const campaign = selection.campaign;
    const battle = initializeOrdinaryRuinsBattle(campaign, draw, 'room-a');
    expect(battle.ruinsContext?.physicalCopyIds).toEqual(draw.encounters[0].monsters.map(entry => entry.copyId));
    expect(battle.initiativeOrder).toHaveLength(draw.encounters[0].initiativeCards.length);
    expect(battle.heroes.every(hero => hero.heroDodgeBinding?.ruleSetVersion === 'C1C31-DIGITAL-DEFAULT-v2')).toBe(true);
    expect(() => beginOrdinaryRuinsBattle({ ...campaign, ruinsDrawState: draw }, 'room-a'))
      .toThrow('ORDINARY_RUINS_EXECUTABLE_DEPENDENCIES_NOT_CLOSED');
    const supply = assignOrdinaryBoneFigures(createBoneFigureSupply(), draw, draw.encounters[0]);
    const withBattle = { ...campaign, ruinsDrawState: draw, battle,
      ruinsBoneFigureSupply: supply, gamePhase: 'battle' as const };
    const snapshot = JSON.parse(JSON.stringify(createSaveSnapshot(withBattle)));
    expect(validateSaveFile(snapshot)).toBeNull();
    expect(restoreSaveSnapshot(snapshot).battle?.ruinsContext).toEqual(battle.ruinsContext);
    const forged = structuredClone(battle);
    forged.ruinsContext!.placements[battle.heroes[0].id] = 'unknown-area';
    expect(() => validateOrdinaryRuinsBattle(forged, draw)).toThrow();
    let turn: BattleState = { ...battle, activeActorId: battle.monsters[0].id,
      initiativeIndex: battle.initiativeOrder.indexOf(battle.monsters[0].id) };
    turn = prepareMonsterAttackResolution(turn, battle.monsters[0].id);
    if (turn.ruinsContext?.pendingChoice?.kind === 'MONSTER_MOVE') {
      const choice = turn.ruinsContext.pendingChoice;
      const paused = JSON.parse(JSON.stringify(createSaveSnapshot({ ...withBattle, battle: turn })));
      expect(validateSaveFile(paused)).toBeNull();
      turn = resolveRuinsMonsterMovementChoice(turn, choice.choiceId, choice.candidateIds[0]);
    }
    if (level === 1) expect(turn.pendingMonsterAttack).not.toBeNull();
    if (turn.pendingMonsterAttack) {
      const paused = JSON.parse(JSON.stringify(createSaveSnapshot({ ...withBattle, battle: turn })));
      expect(validateSaveFile(paused)).toBeNull();
      const resumed = restoreSaveSnapshot(paused).battle!;
      const frozen = freezePendingMonsterAttack(resumed);
      expect(frozen.pendingMonsterAttack?.stage).toBe('hero-hit-window');
      const frozenSave = JSON.parse(JSON.stringify(createSaveSnapshot({ ...withBattle, battle: frozen })));
      expect(validateSaveFile(frozenSave)).toBeNull();
      const resolved = commitPendingMonsterAttackResolution(restoreSaveSnapshot(frozenSave).battle!);
      expect(resolved.pendingMonsterAttack?.rootEventId).not.toBe(turn.pendingMonsterAttack.rootEventId);
    }
  });
});

describe('C1C32R2C separate Bone figure inventory', () => {
  it('keeps the ordinary card deck intact while ordinary and summon figures share finite ownership', () => {
    const stances = { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' } as const;
    const draw = drawOrdinaryRuinsEncounter(createRuinsDrawState(3, 7, RUINS_V5), 'ordinary-a', stances);
    const assigned = assignOrdinaryBoneFigures(createBoneFigureSupply(), draw, draw.encounters[0]);
    const cardDeck = [...draw.monsterDeck];
    let supply = assigned;
    const reservations: string[] = [];
    while (true) {
      try {
        const reserved = reserveNecromancerSummonFigure(supply, 'bone-rabble', 'threat-a');
        supply = reserved.state;
        reservations.push(reserved.figureId);
      } catch (error) {
        expect(String(error)).toContain('Physical Bone figure unavailable');
        break;
      }
    }
    expect(reservations.length + Object.entries(assigned.figureOwners).filter(([id, owner]) =>
      id.startsWith('bone-rabble:') && owner.location === 'ORDINARY').length).toBe(3);
    expect(draw.monsterDeck).toEqual(cardDeck);
    expect(() => reserveNecromancerSummonFigure(supply, 'bone-captain', 'threat-a')).toThrow('unavailable');
    if (reservations[0]) {
      const defeated = markSummonFigureDefeated(supply, reservations[0], 'threat-a');
      supply = reanimateSummonFigure(defeated, reservations[0], 'threat-a');
      expect(supply.figureOwners[reservations[0]]).toEqual({ location: 'REANIMATION', encounterId: 'threat-a' });
    }
    const reloaded = JSON.parse(JSON.stringify(supply));
    expect(() => validateBoneFigureSupply(reloaded, draw)).not.toThrow();
    const returned = returnOrdinaryBoneFigures(reloaded, 'ordinary-a');
    expect(returnOrdinaryBoneFigures(returned, 'ordinary-a')).toEqual(returned);
    expect(() => validateBoneFigureSupply(returned)).not.toThrow();
    const forged = structuredClone(returned);
    delete forged.figureOwners['bone-rabble:figure-1'];
    expect(() => validateBoneFigureSupply(forged)).toThrow('census');
  });
});

describe('C1C32R2C Room execution hooks', () => {
  it('rejects direct healing in a passive prohibited Area', () => {
    const campaign = boundRoom(2);
    const battle = structuredClone(campaign.battle!);
    const vestal = battle.heroes.find(hero => hero.heroDodgeBinding?.heroId === 'vestal')!;
    const healSkill = vestal.equippedSkillIds!.find(id => getSkillById(id)?.kind === 'heal')!;
    expect(healSkill).toBeDefined();
    battle.ruinsContext!.placements[vestal.id] = 'ruins-tile-2:S';
    battle.activeActorId = vestal.id;
    battle.currentActionPoints = 2;
    expect(() => heroUseSkill(battle, vestal.id, healSkill, vestal.id)).toThrow('Room passive prohibits healing');
  });
  it('executes a pit shuffle and saves the typed damage and Bleed result', () => {
    const campaign = boundRoom(4);
    const battle = structuredClone(campaign.battle!);
    const hero = battle.heroes[0];
    battle.ruinsContext!.placements[hero.id] = 'ruins-tile-4:PIT_W';
    const after = runRuinsRoomTrigger(battle, 'SHUFFLED_INTO', hero.id);
    expect(after.heroes[0].hp).toBe(hero.hp - 3);
    expect(after.heroes[0].bleed).toBe(1);
    expect(after.ruinsContext!.events.some(event => event.detail.ruleId === 'spiked-pit-SHUFFLED_INTO')).toBe(true);
  });
  it('executes Room 6 no-Monster healing with real action cost and once-per-Battle use state', () => {
    const campaign = boundRoom(6);
    const battle = structuredClone(campaign.battle!);
    const hero = battle.heroes[0];
    hero.hp -= 5;
    battle.monsters = battle.monsters.map(unit => ({ ...unit, isAlive: false }));
    battle.activeActorId = hero.id;
    battle.currentActionPoints = 2;
    battle.ruinsContext!.placements[hero.id] = 'ruins-tile-6:HIDE';
    const after = interactOrdinaryRuinsRoom({ ...campaign, battle }, hero.id, 'hide-and-heal');
    expect(after.battle?.heroes[0].hp).toBe(hero.maxHp);
    expect(after.battle?.heroes[0].stress).toBe(hero.stress + 2);
    expect(after.battle?.currentActionPoints).toBe(1);
    expect(after.battle?.ruinsContext?.roomUses).toContain('hide-and-heal');
  });
  it('applies Room 8 end-round party Stress once when a Monster occupies the Circle', () => {
    const campaign = boundRoom(8);
    const battle = structuredClone(campaign.battle!);
    battle.ruinsContext!.placements[battle.monsters[0].id] = 'ruins-tile-8:CIRCLE';
    const after = runRuinsRoomTrigger(battle, 'ROUND_END');
    expect(after.heroes.map(hero => hero.stress)).toEqual(battle.heroes.map(hero => hero.stress + 2));
    expect(runRuinsRoomTrigger(after, 'ROUND_END')).toEqual(after);
  });
});

describe('C1C32R2C physical Battle end transaction', () => {
  it('returns drawn cards and ordinary figures once while retaining the Room discard', () => {
    const campaign = boundRoom(1);
    const encounterId = campaign.battle!.ruinsContext!.encounterId;
    const ended = { ...campaign, battle: { ...campaign.battle!, status: 'victory' as const,
      monsters: campaign.battle!.monsters.map(unit => ({ ...unit, isAlive: false, hp: 0 })) } };
    const result = commitBattleVictory(ended);
    expect(result.ok).toBe(true);
    expect(result.campaign.ruinsDrawState?.encounters[0].returned).toBe(true);
    expect(result.campaign.ruinsDrawState?.roomDeck).not.toContain(campaign.ruinsDrawState!.encounters[0].roomNumber);
    expect(result.campaign.ruinsBoneFigureSupply?.ordinaryAssignments[encounterId]).toBeUndefined();
    expect(result.campaign.ruinsDrawState?.monsterDeck).toEqual(expect.arrayContaining(
      campaign.ruinsDrawState!.encounters[0].monsters.map(entry => entry.copyId)));
    expect(commitBattleVictory(result.campaign).campaign).toBe(result.campaign);
    expect(validateSaveFile(JSON.parse(JSON.stringify(createSaveSnapshot(result.campaign))))).toBeNull();
  });
});
