import { describe, expect, it } from 'vitest';
import { applyBossRuntimeInput as input, assertBossEncounter, bindBossEncounter, checkBossRuntimeEnd, replayBossRuntime, restoreBossRuntime } from './foundation';
import { foundationFixture, activeFixture, fixtureUnit, syntheticBoneDefinitions } from './foundation-test-fixture';
import { necromancerDefinition, NECROMANCER_RULE_SET_VERSION } from '../necromancer/contract-adapter';
import { advanceTurn, checkEnd, endHeroTurn, heroMove, heroUseSkill, legalTargetsForActor, runMonsterTurn } from '../battle';
import type { BattleState } from '../../types';

function chooseAll(b: BattleState): BattleState {
  for (let guard = 0; b.bossEncounter!.pendingChoice && guard < 20; guard++) {
    const p = b.bossEncounter!.pendingChoice!;
    b = input(b, { type: 'CHOICE', choiceId: p.choiceId, selectedId: p.candidateIds[p.candidateIds.length - 1] });
  }
  return b;
}
function attack(b = activeFixture(), attackRoll = 2, skillRoll = 1): BattleState { return chooseAll(input(b, { type: 'SKILL', skillRoll, attackRoll })); }
function kill(b: BattleState, ids: string[]): BattleState {
  b = structuredClone(b);
  for (const u of b.monsters.filter(u => ids.includes(u.id))) { u.hp = 0; u.isAlive = false; }
  return input(b, { type: 'DEATHS', instanceIds: ids });
}

describe('C1C29 contract-bound setup', () => {
  it.each([[1, 77, 46037, 42003, 42000], [2, 103, 46038, 42004, 42001], [3, 144, 46039, 42005, 42002]] as const)('Level %i binds the locked trio and printed stats', (level, hp, battleId, threatId, identityId) => {
    const b = input(foundationFixture(level), { type: 'ENTER_BOSS_ROOM' });
    const e = b.bossEncounter!;
    expect([e.battleCardId, e.threatAbilityCardId, e.bossIdentityCardId]).toEqual([battleId, threatId, identityId]);
    expect(e.definition.stats.HP).toBe(hp); expect(b.monsters[0].hp).toBe(hp);
    expect(e.definition.roomNumber).toBe(10); expect(e.definition.roomCardId).toBe(44709);
    expect(e.placements[b.monsters[0].id]).toBe('top');
    expect(b.heroes.every(h => e.placements[h.id] === 'bottom')).toBe(true);
    expect(b.monsters[0].stance).toBe('aggressive'); expect(e.ruleSetVersion).toBe(NECROMANCER_RULE_SET_VERSION);
  });
  it('retains physical Bone Rubble/Rabble provenance as a project ruling', () => {
    expect(necromancerDefinition(1).alias).toMatchObject({ rulebookP38Literal: 'Bone Rubble', printedLiteral: 'Bone Rabble' });
  });
  it('rejects unsupported Levels instead of inventing data', () => { expect(() => necromancerDefinition(4 as 1)).toThrow(); });
  it('starts on Threat, flips exclusively and rejects expired passives', () => {
    const before = foundationFixture(3); expect(before.bossEncounter!.side).toBe('THREAT');
    const b = input(before, { type: 'ENTER_BOSS_ROOM' }); expect(b.bossEncounter!.side).toBe('ABILITY');
    expect(() => input(b, { type: 'PREPARATION_DAY', rolls: {} })).toThrow();
    expect(() => input(b, { type: 'FIRST_DUNGEON_BATTLE' })).toThrow();
  });
  it('keeps Room layout and adjacency bound rather than using the prototype tile', () => {
    const d = necromancerDefinition(1); expect(d.areas).toHaveLength(8);
    expect(d.adjacency).toContainEqual(['centre', 'bottom']); expect(d.areas.find(a => a.id === 'bottom')?.capacity).toBe(4);
  });
});
describe('C1C29 immutable player choices', () => {
  it('automatically selects a unique lowest Hero', () => {
    const b = input(foundationFixture(2), { type: 'PREPARATION_DAY', rolls: { 'hero-1': 4, 'hero-2': 3, 'hero-3': 7, 'hero-4': 5 } });
    expect(b.bossEncounter!.threatState.forcedHeroId).toBe('hero-2'); expect(b.bossEncounter!.pendingChoice).toBeNull();
  });
  it('snapshots tied Heroes and commits only a candidate', () => {
    const b = input(foundationFixture(3), { type: 'PREPARATION_DAY', rolls: { 'hero-1': 4, 'hero-2': 2, 'hero-3': 2, 'hero-4': 5 } });
    const p = b.bossEncounter!.pendingChoice!; expect(p.candidateIds).toEqual(['hero-2', 'hero-3']);
    expect(() => input(b, { type: 'CHOICE', choiceId: p.choiceId, selectedId: 'hero-1' })).toThrow('Invalid choice');
    const after = input(b, { type: 'CHOICE', choiceId: p.choiceId, selectedId: 'hero-3' });
    expect(after.bossEncounter!.threatState.forcedHeroId).toBe('hero-3'); expect(b.bossEncounter!.pendingChoice).toEqual(p);
    expect(() => input(after, { type: 'CHOICE', choiceId: p.choiceId, selectedId: 'hero-2' })).toThrow();
  });
  it('rejects a stale choice identity', () => {
    const b = input(foundationFixture(2), { type: 'PREPARATION_DAY', rolls: Object.fromEntries(foundationFixture(2).heroes.map(h => [h.id, 1])) });
    expect(() => input(b, { type: 'CHOICE', choiceId: 'stale', selectedId: 'hero-1' })).toThrow();
  });
  it('does not reroll or draw RNG for lowest-roll ties', () => {
    const initial = foundationFixture(2); const state = initial.bossEncounter!.rngState;
    const b = input(initial, { type: 'PREPARATION_DAY', rolls: Object.fromEntries(initial.heroes.map(h => [h.id, 1])) });
    expect(b.bossEncounter!.rngState).toBe(state); expect(chooseAll(b).bossEncounter!.rngState).toBe(state);
  });
  it('unique Crowded Area resolves without an Area choice', () => {
    const initial = activeFixture(); initial.bossEncounter!.placements['hero-4'] = 'right';
    const b = attack(initial); expect(b.bossEncounter!.events.filter(e => e.eventType === 'CHOICE_CREATED').every(e => (e.result as { type: string }).type !== 'CHOICE_TARGET_AREA')).toBe(true);
  });
  it('Crowded ties preserve character Stance priority separately', () => {
    const b = activeFixture(); b.bossEncounter!.placements['hero-3'] = 'left'; b.bossEncounter!.placements['hero-4'] = 'left';
    const tied = input(b, { type: 'SKILL', skillRoll: 1, attackRoll: 2 });
    const p = tied.bossEncounter!.pendingChoice!; expect(p.choiceType).toBe('CHOICE_TARGET_AREA'); expect(p.candidateIds).toEqual(['left', 'upper-centre']);
    const after = chooseAll(input(tied, { type: 'CHOICE', choiceId: p.choiceId, selectedId: 'upper-centre' }));
    expect(after.bossEncounter!.events.filter(e => e.eventType === 'TARGET_EFFECT').map(e => e.targets[0])).toEqual(['hero-1', 'hero-2']);
  });
  it('candidate order is independent of Hero array order', () => {
    const b = foundationFixture(2); const reverse = structuredClone(b); reverse.heroes.reverse();
    const command = { type: 'PREPARATION_DAY' as const, rolls: Object.fromEntries(b.heroes.map(h => [h.id, 1])) };
    expect(input(b, command).bossEncounter!.pendingChoice).toEqual(input(reverse, command).bossEncounter!.pendingChoice);
  });
  it('pending choice blocks ordinary engine actions and another Boss input', () => {
    const b = input(foundationFixture(2), { type: 'PREPARATION_DAY', rolls: Object.fromEntries(foundationFixture().heroes.map(h => [h.id, 1])) });
    expect(advanceTurn(b)).toBe(b); expect(endHeroTurn(b, 'hero-1')).toBe(b); expect(heroMove(b, 'hero-1', 1)).toBe(b);
    expect(heroUseSkill(b, 'hero-1', 'invalid', 'invalid')).toBe(b); expect(legalTargetsForActor(b, 'invalid')).toEqual([]);
    expect(() => input(b, { type: 'ENTER_BOSS_ROOM' })).toThrow('Pending choice');
  });
});
describe('C1C29 skill and finite spawn transaction', () => {
  it.each([1, 2, 3] as const)('Level %i uses the same Skill executor', level => {
    const b = attack(activeFixture(level)); expect(b.bossEncounter!.activeSummons).toHaveLength(1);
    expect(b.bossEncounter!.events.some(e => e.eventType === 'SKILL_RESOLVED')).toBe(true);
  });
  it('all misses still resolve Self Push and consume zero supply', () => {
    const b = activeFixture(); b.heroes.forEach(h => { h.bossCombatDodge = 20; }); const after = attack(b, 10);
    expect(after.bossEncounter!.activeSummons).toEqual([]); expect(after.bossEncounter!.summonSupply['bone-rabble'].available).toBe(3);
    expect(after.monsters[0].position).toBe(2); expect(after.bossEncounter!.events.some(e => e.eventType === 'SELF_PUSH')).toBe(true);
  });
  it('one hit emits one summon instruction', () => {
    const b = activeFixture(); b.heroes[1].bossCombatDodge = 20;
    const after = attack(b); expect(after.bossEncounter!.activeSummons).toHaveLength(1);
    expect(after.bossEncounter!.events.filter(e => e.eventType === 'TARGET_EFFECT')).toHaveLength(1);
  });
  it('multi-hit emits one summon instruction with one shared attack roll', () => {
    const after = attack(); expect(after.bossEncounter!.activeSummons).toHaveLength(1);
    expect(after.bossEncounter!.events.filter(e => e.eventType === 'ATTACK_ROLLED')).toHaveLength(1);
    expect(after.bossEncounter!.events.filter(e => e.eventType === 'TARGET_EFFECT')).toHaveLength(2);
  });
  it('Six Feet Under has stress and no invented direct damage/critical branch', () => {
    const b = activeFixture(); for (const h of b.heroes) b.bossEncounter!.placements[h.id] = 'left';
    const after = attack(b, 1, 8); expect(after.heroes.every(h => h.hp === 40 && h.stress === 2)).toBe(true);
    expect(after.bossEncounter!.activeSummons).toHaveLength(1);
  });
  it('debits the finite token and inserts its own initiative', () => {
    const b = attack(); const e = b.bossEncounter!; const id = e.activeSummons[0];
    expect(e.summonSupply['bone-rabble']).toMatchObject({ total: 3, available: 2, active: 1, spentThisBattle: 0, permanentlyRemoved: 0 });
    expect(b.initiativeOrder.filter(i => i === id)).toHaveLength(1);
  });
  it('does not refund deaths during the Battle', () => {
    const b = attack(); const after = kill(b, b.bossEncounter!.activeSummons);
    expect(after.bossEncounter!.summonSupply['bone-rabble']).toMatchObject({ available: 2, active: 0, spentThisBattle: 1 });
  });
  it('exhausted supply suppresses without replacement or initiative insertion', () => {
    const b = activeFixture(); const entry = b.bossEncounter!.summonSupply['bone-rabble'];
    entry.tokens.forEach(t => { t.state = 'spentThisBattle'; }); entry.available = 0; entry.spentThisBattle = 3;
    const after = attack(b); expect(after.monsters).toHaveLength(1);
    expect(after.bossEncounter!.events.some(e => e.eventType === 'SUMMON_SUPPRESSED_SUPPLY_EXHAUSTED')).toBe(true);
  });
  it('full Stances suppress without replacing an existing monster', () => {
    const b = activeFixture(); for (let i = 2; i <= 4; i++) { const u = fixtureUnit(`occupied-${i}`, 'monster', i, 'fixture'); b.monsters.push(u); b.bossEncounter!.placements[u.id] = 'right'; }
    const after = attack(b); expect(after.monsters).toHaveLength(4); expect(after.bossEncounter!.summonSupply['bone-rabble'].available).toBe(3);
    expect(after.bossEncounter!.events.some(e => e.eventType === 'SUMMON_SUPPRESSED_FULL_STANCES')).toBe(true);
  });
  it('generic no-space suppression consumes neither token nor initiative', () => {
    // A deliberately small synthetic Room exercises the generic executor's unreachable-space boundary.
    const b = activeFixture(); b.heroes = b.heroes.slice(0, 2);
    for (const area of b.bossEncounter!.definition.areas) area.capacity = area.id === 'top' ? 1 : area.id === 'upper-centre' ? 2 : 0;
    b.initiativeOrder = [...b.heroes.map(h => h.id), b.monsters[0].id];
    const after = attack(b); expect(after.bossEncounter!.events.some(e => e.eventType === 'SUMMON_SUPPRESSED_NO_SPACE')).toBe(true);
    expect(after.bossEncounter!.summonSupply['bone-rabble'].available).toBe(3); expect(after.monsters).toHaveLength(1);
    expect(after.initiativeOrder).toEqual(b.initiativeOrder);
  });
  it('unbound combat dependency is explicit and never invents Life', () => {
    let b = input(foundationFixture(1, 29, [], false), { type: 'ENTER_BOSS_ROOM' });
    for (const hero of b.heroes.slice(0, 2)) b.bossEncounter!.placements[hero.id] = 'upper-centre';
    b = attack(b); expect(b.bossEncounter!.events.some(e => e.eventType === 'SPAWN_DEFINITION_UNBOUND')).toBe(true);
    expect(b.bossEncounter!.activeSummons).toEqual([]); expect(b.bossEncounter!.summonSupply['bone-rabble'].available).toBe(3);
  });
  it('rollback leaves input state and RNG untouched on invalid Dodge data', () => {
    const b = activeFixture(); delete b.heroes[0].bossCombatDodge; const before = JSON.stringify(b);
    expect(() => attack(b)).toThrow('Dodge'); expect(JSON.stringify(b)).toBe(before);
  });
  it('placement choice spends nothing until confirmation and is serializable', () => {
    const b = activeFixture(); b.bossEncounter!.placements['hero-1'] = 'centre'; b.bossEncounter!.placements['hero-2'] = 'centre'; b.bossEncounter!.placements['hero-3'] = 'left'; b.bossEncounter!.placements['hero-4'] = 'right';
    const pending = input(b, { type: 'SKILL', skillRoll: 5, attackRoll: 2 });
    expect(pending.bossEncounter!.pendingChoice?.choiceType).toBe('CHOICE_DISPLACEMENT_CHARACTER');
    expect(pending.bossEncounter!.summonSupply['bone-rabble'].available).toBe(3);
    const restored = restoreBossRuntime(JSON.stringify(pending), NECROMANCER_RULE_SET_VERSION);
    expect(chooseAll(restored)).toEqual(chooseAll(pending));
  });
  it('nearest placement ties move the selected occupant and preserve summon Target Area', () => {
    const b = activeFixture(); b.bossEncounter!.placements['hero-1'] = 'centre'; b.bossEncounter!.placements['hero-2'] = 'centre'; b.bossEncounter!.placements['hero-3'] = 'left'; b.bossEncounter!.placements['hero-4'] = 'right';
    let pending = input(b, { type: 'SKILL', skillRoll: 5, attackRoll: 2 });
    const p = pending.bossEncounter!.pendingChoice!;
    pending = input(pending, { type: 'CHOICE', choiceId: p.choiceId, selectedId: 'hero-1' });
    expect(pending.bossEncounter!.pendingChoice?.choiceType).toBe('CHOICE_PLACEMENT_DESTINATION');
    const after = chooseAll(pending); expect(after.bossEncounter!.placements[after.bossEncounter!.activeSummons[0]]).toBe('centre');
    expect(after.bossEncounter!.placements['hero-1']).not.toBe('centre');
  });
  it('second action in the same round is rejected', () => { const b = attack(); expect(() => attack(b)).toThrow('action unavailable'); });
  it('rolls the attack only after Target/Range resolution', () => {
    const b = input(foundationFixture(), { type: 'ENTER_BOSS_ROOM' }); const before = b.bossEncounter!.rngState;
    const after = input(b, { type: 'SKILL', skillRoll: 1 }); expect(after.bossEncounter!.rngState).toBe(before);
    expect(after.bossEncounter!.events.some(e => e.eventType === 'SKILL_OUT_OF_RANGE')).toBe(true);
  });
});
describe('C1C29 Threat Reanimation and Captain scope', () => {
  it('Reanimation is exclusively the active Level III Dungeon Threat', () => {
    expect([1, 2, 3].map(level => necromancerDefinition(level as 1).reanimation)).toEqual([false, false, true]);
    const bossBattle = attack(activeFixture(3)); const after = kill(bossBattle, bossBattle.bossEncounter!.activeSummons);
    expect(after.bossEncounter!.activeSummons).toEqual([]); expect(after.bossEncounter!.reanimationState.firstDeathWindowConsumed).toBe(false);
  });
  it('fresh instance clears wounds, conditions, modifiers and activation', () => {
    const unit = fixtureUnit('old', 'monster', 1, 'bone-rabble'); unit.bleed = 2; unit.blight = 3; unit.marked = true; unit.stunned = 1; unit.actionPoints = 2;
    const b = foundationFixture(3, 29, [unit]); const after = kill(b, ['old']);
    const fresh = after.monsters[0]; expect(fresh.id).not.toBe('old'); expect(fresh.hp).toBe(12);
    expect([fresh.bleed, fresh.blight, fresh.stunned, fresh.actionPoints]).toEqual([0, 0, 0, 0]); expect(fresh.marked).toBe(false); expect(fresh.buffs).toEqual([]);
    expect(after.initiativeOrder).not.toContain('old'); expect(after.initiativeOrder).toContain(fresh.id);
    expect(after.bossEncounter!.summonSupply['bone-rabble']).toMatchObject({ available: 2, active: 1, spentThisBattle: 0 });
  });
  it('simultaneous deaths snapshot instance IDs and await explicit choice', () => {
    const b = foundationFixture(3, 29, [fixtureUnit('a', 'monster', 1, 'bone-rabble'), fixtureUnit('z', 'monster', 2, 'bone-rabble')]);
    const pending = kill(b, ['z', 'a']); expect(pending.bossEncounter!.pendingChoice?.candidateIds).toEqual(['a', 'z']);
    expect(pending.monsters).toEqual([]); expect(pending.bossEncounter!.summonSupply['bone-rabble'].spentThisBattle).toBe(2);
    const p = pending.bossEncounter!.pendingChoice!;
    expect(() => input(pending, { type: 'CHOICE', choiceId: p.choiceId, selectedId: 'hero-1' })).toThrow();
    const after = input(pending, { type: 'CHOICE', choiceId: p.choiceId, selectedId: 'z' }); expect(after.monsters).toHaveLength(1);
    expect(after.bossEncounter!.reanimationState.firstDeathWindowConsumed).toBe(true);
  });
  it('no-space consumes the first death window without fallback displacement', () => {
    const b = foundationFixture(3, 29, [fixtureUnit('old', 'monster', 1, 'bone-rabble')]);
    b.bossEncounter!.correspondingAreas.old = 'bottom';
    const after = kill(b, ['old']); expect(after.monsters).toEqual([]);
    expect(after.bossEncounter!.reanimationState.firstDeathWindowConsumed).toBe(true);
    expect(after.bossEncounter!.events.some(e => e.eventType === 'REANIMATION_IGNORED_NO_SPACE')).toBe(true);
    expect(after.bossEncounter!.summonSupply['bone-rabble'].spentThisBattle).toBe(1);
  });
  it('a second death never triggers Reanimation again', () => {
    const first = kill(foundationFixture(3, 29, [fixtureUnit('old', 'monster', 1, 'bone-rabble')]), ['old']);
    const after = kill(first, [first.monsters[0].id]); expect(after.monsters).toEqual([]);
    expect(after.bossEncounter!.events.filter(e => e.eventType === 'REANIMATION_WINDOW_CONSUMED')).toHaveLength(1);
  });
  it('large deaths are ineligible', () => {
    const b = foundationFixture(3, 29, [fixtureUnit('large', 'monster', 1, 'bone-captain')]); const after = kill(b, ['large']);
    expect(after.monsters).toEqual([]); expect(after.bossEncounter!.reanimationState.firstDeathWindowConsumed).toBe(false);
  });
  it('mandatory dying-instance effects precede removal, then fresh respawn', () => {
    const b = foundationFixture(3, 29, [fixtureUnit('old', 'monster', 1, 'bone-rabble')]);
    b.bossEncounter!.spawnDefinitions['bone-rabble'].onDeathEffects = [{ effectId: 'last-strike', targetIds: ['hero-1'], damage: 4 }];
    const after = kill(b, ['old']); expect(after.heroes[0].hp).toBe(36);
    const types = after.bossEncounter!.events.map(e => e.eventType);
    expect(types.indexOf('MANDATORY_DEATH_EFFECT_RESOLVED')).toBeLessThan(types.indexOf('OLD_INSTANCES_REMOVED'));
    expect(types.indexOf('OLD_INSTANCES_REMOVED')).toBeLessThan(types.indexOf('REANIMATION_SPAWNED'));
    expect(types.indexOf('REANIMATION_SPAWNED')).toBeLessThan(types.indexOf('DEATH_CHAIN_RESUMED'));
  });
  it('unordered mandatory effects require a saved choice, with no iteration-order fallback', () => {
    const b = foundationFixture(3, 29, [fixtureUnit('old', 'monster', 1, 'bone-rabble')]);
    b.bossEncounter!.spawnDefinitions['bone-rabble'].onDeathEffects = [{ effectId: 'a', targetIds: ['hero-1'], damage: 4 }, { effectId: 'z', targetIds: ['hero-2'], damage: 5 }];
    const pending = kill(b, ['old']); expect(pending.bossEncounter!.pendingChoice?.choiceType).toBe('CHOICE_DEATH_EFFECT');
    expect(pending.monsters).toHaveLength(1); expect(pending.heroes[0].hp).toBe(40);
    const restored = restoreBossRuntime(JSON.stringify(pending), NECROMANCER_RULE_SET_VERSION);
    expect(chooseAll(restored)).toEqual(chooseAll(pending));
  });
  it('a nested death cannot steal the earliest Reanimation window', () => {
    const b = foundationFixture(3, 29, [fixtureUnit('earliest', 'monster', 1, 'bone-rabble'), fixtureUnit('nested', 'monster', 2, 'bone-soldier')]);
    b.monsters[1].hp = 3;
    b.bossEncounter!.spawnDefinitions['bone-rabble'].onDeathEffects = [{ effectId: 'strike', targetIds: ['nested'], damage: 4 }];
    const after = kill(b, ['earliest']); expect(after.monsters).toHaveLength(1); expect(after.monsters[0].sourceId).toBe('bone-rabble');
    expect(after.bossEncounter!.events.filter(e => e.eventType === 'REANIMATION_WINDOW_CONSUMED')).toHaveLength(1);
    expect(after.bossEncounter!.summonSupply['bone-soldier'].spentThisBattle).toBe(1);
  });
  it('respects an explicit dying-instance effect order without requesting an arbitrary choice', () => {
    const b = foundationFixture(3, 29, [fixtureUnit('old', 'monster', 1, 'bone-rabble')]);
    const def = b.bossEncounter!.spawnDefinitions['bone-rabble'];
    def.onDeathEffects = [{ effectId: 'a', targetIds: ['hero-1'], damage: 4 }, { effectId: 'z', targetIds: ['hero-2'], damage: 5 }];
    def.onDeathOrder = ['z', 'a'];
    const after = kill(b, ['old']); expect(after.bossEncounter!.pendingChoice).toBeNull();
    expect(after.bossEncounter!.events.filter(e => e.eventType === 'MANDATORY_DEATH_EFFECT_RESOLVED').map(e => (e.result as { effectId: string }).effectId)).toEqual(['old:z', 'old:a']);
  });
  it('Boss defeat during mandatory death effects cancels the suspended chain and remaining choices', () => {
    const b = attack(); const summonId = b.bossEncounter!.activeSummons[0]; const bossId = b.bossEncounter!.bossState.actorId!;
    b.bossEncounter!.spawnDefinitions['bone-rabble'].onDeathEffects = [{ effectId: 'kill-boss', targetIds: [bossId], damage: 200 }, { effectId: 'secondary', targetIds: ['hero-3'], damage: 4 }];
    const pending = input(b, { type: 'MONSTER_DAMAGE', amounts: { [summonId]: 12 } }); const p = pending.bossEncounter!.pendingChoice!;
    const after = input(pending, { type: 'CHOICE', choiceId: p.choiceId, selectedId: `${summonId}:kill-boss` });
    expect(after.status).toBe('victory'); expect(after.bossEncounter!.pendingChoice).toBeNull(); expect(after.heroes[2].hp).toBe(b.heroes[2].hp);
  });
  it('Captain uses an independent Level II first-Monster path and two Stances', () => {
    const b = input(foundationFixture(2), { type: 'FIRST_DUNGEON_BATTLE' }); expect(b.monsters[0].sourceId).toBe('bone-captain');
    expect(b.bossEncounter!.summonSupply['bone-captain'].active).toBe(1);
    expect(necromancerDefinition(2).skills.every(s => s.targetEffect.monster !== 'Bone Captain')).toBe(true);
    expect(() => input(b, { type: 'FIRST_DUNGEON_BATTLE' })).toThrow();
  });
  it('Captain placement failure consumes its Threat application but spends no token', () => {
    const b = foundationFixture(2, 29, [fixtureUnit('occupied', 'monster', 1, 'fixture')]); const after = input(b, { type: 'FIRST_DUNGEON_BATTLE' });
    expect(after.monsters).toHaveLength(1); expect(after.bossEncounter!.threatState.firstBattleConsumed).toBe(true);
    expect(after.bossEncounter!.summonSupply['bone-captain'].available).toBe(1);
  });
});
describe('C1C29 victory, cleanup and replay', () => {
  it('a complete event-input path including simultaneous deaths can replay from the original state', () => {
    const initial = foundationFixture(3, 29, [fixtureUnit('a', 'monster', 1, 'bone-rabble'), fixtureUnit('b', 'monster', 2, 'bone-rabble')]);
    let after = input(initial, { type: 'PREPARATION_DAY', rolls: Object.fromEntries(initial.heroes.map(h => [h.id, 1])) });
    after = chooseAll(after);
    after = chooseAll(input(after, { type: 'MONSTER_DAMAGE', amounts: { a: 40, b: 40 } }));
    after = input(after, { type: 'END_THREAT_BATTLE' }); after = input(after, { type: 'ENTER_BOSS_ROOM' });
    after = chooseAll(input(after, { type: 'SKILL', skillRoll: 5, attackRoll: 2 }));
    after = input(after, { type: 'MONSTER_DAMAGE', amounts: { [after.bossEncounter!.bossState.actorId!]: 200 } });
    after = input(after, { type: 'CLEANUP' });
    expect(replayBossRuntime(initial, after.bossEncounter!.inputs)).toEqual(after);
  });
  it('Crowded Area tie replays the identical frozen target candidates and result', () => {
    const initial = activeFixture(); const after = attack(initial);
    expect(after.bossEncounter!.events.some(e => e.eventType === 'CHOICE_CREATED' && (e.result as { type: string }).type === 'CHOICE_TARGET_AREA')).toBe(true);
    expect(replayBossRuntime(initial, after.bossEncounter!.inputs.slice(initial.bossEncounter!.inputs.length))).toEqual(after);
  });
  it('Boss death ends the Battle despite surviving summons and cancels choices', () => {
    const b = attack(); b.monsters[0].isAlive = false; b.monsters[0].hp = 0;
    const after = checkEnd(b); expect(after.status).toBe('victory'); expect(after.bossEncounter!.phase).toBe('VICTORY');
    expect(after.bossEncounter!.pendingChoice).toBeNull();
  });
  it('cleanup resets supply, side, initiative and temporary state exactly once', () => {
    const b = attack(); b.monsters[0].isAlive = false; const victory = checkBossRuntimeEnd(b);
    const after = input(victory, { type: 'CLEANUP' }); expect(after.bossEncounter!.phase).toBe('COMPLETE');
    expect(after.monsters).toEqual([]); expect(after.initiativeOrder).toEqual([]); expect(after.bossEncounter!.side).toBe('THREAT');
    expect(after.bossEncounter!.summonSupply['bone-rabble']).toMatchObject({ available: 3, active: 0, spentThisBattle: 0 });
    expect(input(after, { type: 'CLEANUP' })).toBe(after);
  });
  it('cleanup never restores permanent tokens', () => {
    const raw = foundationFixture(); delete raw.bossEncounter;
    const b = input(bindBossEncounter(raw, necromancerDefinition(1), 29, syntheticBoneDefinitions, ['bone-rabble:1']), { type: 'ENTER_BOSS_ROOM' });
    b.monsters[0].isAlive = false;
    const after = input(checkBossRuntimeEnd(b), { type: 'CLEANUP' }); expect(after.bossEncounter!.summonSupply['bone-rabble']).toMatchObject({ available: 2, permanentlyRemoved: 1 });
  });
  it('refuses cleanup before victory', () => { expect(() => input(activeFixture(), { type: 'CLEANUP' })).toThrow('victory'); });
  it('save/reload preserves pending Hero choice, supply, version, seed and event cursor', () => {
    const b = input(foundationFixture(3), { type: 'PREPARATION_DAY', rolls: Object.fromEntries(foundationFixture().heroes.map(h => [h.id, 1])) });
    expect(restoreBossRuntime(JSON.stringify(b), NECROMANCER_RULE_SET_VERSION)).toEqual(b);
  });
  it('save/reload resumes a simultaneous death choice deterministically', () => {
    const b = kill(foundationFixture(3, 29, [fixtureUnit('a', 'monster', 1, 'bone-rabble'), fixtureUnit('b', 'monster', 2, 'bone-rabble')]), ['a', 'b']);
    expect(chooseAll(restoreBossRuntime(JSON.stringify(b), NECROMANCER_RULE_SET_VERSION))).toEqual(chooseAll(b));
  });
  it('same seed and inputs produce the same Skill outcomes, instance IDs and initiative', () => {
    const start = activeFixture(2, 333); const after = attack(start);
    expect(replayBossRuntime(start, after.bossEncounter!.inputs.slice(start.bossEncounter!.inputs.length))).toEqual(after);
    expect(attack(activeFixture(2, 333))).toEqual(after);
  });
  it('save/reload rejects a silently changed ruling version', () => { expect(() => restoreBossRuntime(JSON.stringify(activeFixture()), 'v2')).toThrow('migration'); });
  it('rejects corrupt ledger counts and orphan active tokens', () => {
    const b = attack(); b.bossEncounter!.summonSupply['bone-rabble'].available++; expect(() => assertBossEncounter(b)).toThrow('ledger');
    const orphan = attack(); orphan.monsters.pop(); expect(() => assertBossEncounter(orphan)).toThrow('Orphan');
  });
  it('the production Monster turn consumes the contract executor', () => {
    const b = activeFixture(); const after = chooseAll(runMonsterTurn(b, b.bossEncounter!.bossState.actorId!));
    expect(after.bossEncounter!.events.some(e => e.eventType === 'SKILL_ROLLED')).toBe(true);
  });
  it('Battle end returns spent tokens and resets the Threat death window', () => {
    const b = kill(foundationFixture(3, 29, [fixtureUnit('old', 'monster', 1, 'bone-rabble')]), ['old']);
    const after = input(b, { type: 'END_THREAT_BATTLE' }); expect(after.bossEncounter!.reanimationState.firstDeathWindowConsumed).toBe(false);
    expect(after.bossEncounter!.summonSupply['bone-rabble']).toMatchObject({ available: 3, active: 0, spentThisBattle: 0 });
    expect(input(after, { type: 'ENTER_BOSS_ROOM' }).bossEncounter!.side).toBe('ABILITY');
  });
  it('Level I permanent removal includes a non-Unholy unit that already died, and survives Battle reset', () => {
    const b = foundationFixture(1, 29, [fixtureUnit('human', 'monster', 1, 'bone-rabble')]);
    b.bossEncounter!.spawnDefinitions['bone-rabble'].tags = ['Human'];
    const dead = input(b, { type: 'MONSTER_DAMAGE', amounts: { human: 40 } });
    const after = input(dead, { type: 'END_THREAT_BATTLE' });
    expect(after.bossEncounter!.threatState.permanentlyRemovedDefinitionIds).toContain('bone-rabble');
    expect(after.bossEncounter!.summonSupply['bone-rabble']).toMatchObject({ available: 2, permanentlyRemoved: 1 });
  });
});
