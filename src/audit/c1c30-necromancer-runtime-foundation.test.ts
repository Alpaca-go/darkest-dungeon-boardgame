import { describe, expect, it } from 'vitest';
import { createNewCampaign, createHeroInstance } from '../game-engine/campaign';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { getHeroCombatDefinition, getHeroLevelDefinition } from '../data/progression/hero-level-registry';
import { makeHeroUnit } from '../game-engine/battle';
import { inspectBoneCombatDependency, NORMAL_NECROMANCER_SUMMON_IDS, productionBoneDefinitions,
  resolveProductionMonsterDefinition, validateBoneCombatDependency } from '../game-engine/bosses/component-adapters/bone-combat-adapter';
import { necromancerDefinition, NECROMANCER_RULE_SET_VERSION } from '../game-engine/necromancer/contract-adapter';
import { applyBossRuntimeInput, replayBossRuntime } from '../game-engine/bosses/foundation';
import { startBossFoundation, settleBossThreatBattle, resumeBossFoundation, resolveBossThreatCheckpointChoice } from '../game-engine/commands/boss-foundation';
import { necromancerProductionDependencyGate } from '../game-engine/bosses/production-dependency-gate';
import { commitQuestSelection } from '../game-engine/commands/quest';
import { enterDungeonRoom } from '../game-engine/commands/dungeon';
import { commitMoveToRoom } from '../game-engine/dungeon';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import type { CampaignState } from '../types';

/** Unit isolation only: prototype Hero HP remains explicitly outside acceptance. No synthetic Bone or Dodge data. */
export function dependencyReviewCampaign(level: 1 | 2 | 3 = 1): CampaignState {
  return withRuntimeSources(seededRuntimeSources(30), () => {
    const c = createNewCampaign();
    c.heroes = ['crusader', 'highwayman', 'hellion'].map((id, i) => createHeroInstance(id, i)!);
    c.currentQuestId = 'face-the-threat'; c.gamePhase = 'dungeon-explore';
    c.campaignProgress.activeThreatId = `necromancer-threat-level-${level}`;
    c.campaignProgress.activeBossFamilyId = 'necromancer';
    c.campaignProgress.campaignLevel = level;
    c.campaignProgress.pendingThreatInitialization = false;
    c.dungeon = { questId: 'face-the-threat', questRunId: 'c1c30-isolation-run', currentRoomId: 'threat-room', previousRoomId: null,
      rooms: [{ id: 'threat-room', type: 'battle', status: 'current', adjacentRoomIds: ['room-10'] },
        { id: 'room-10', type: 'objective', status: 'revealed', adjacentRoomIds: ['threat-room'] }],
      scoutedNextMove: false, roomsCleared: 0, objectiveComplete: false, canLeave: false };
    return c;
  });
}
function started(level: 1 | 2 | 3 = 1) {
  const c = dependencyReviewCampaign(level);
  const dodge = Object.fromEntries(c.heroes.map(h => [h.instanceId, getHeroCombatDefinition(h.heroId, h.level)!.dodge]));
  return startBossFoundation(c, necromancerDefinition(level), 30, 'threat-room', dodge, productionBoneDefinitions());
}
function checkpoint(level: 1 | 2 | 3 = 1) {
  const c = started(level); c.battle!.status = 'victory';
  return settleBossThreatBattle(c);
}
describe('C1C30 locked production dependency review and fail-closed gates', () => {
  it.each([['bone-rabble', 6], ['bone-soldier', 7], ['bone-spearman', 15], ['bone-captain', 33]] as const)('%s reads source-bound Life %i and printed Skills', (id, life) => {
    const candidate = inspectBoneCombatDependency(id)!;
    expect(candidate.life).toBe(life); expect(candidate.skills).toHaveLength(2);
    expect(candidate.sourceReferences.every(r => r.sha256.length === 64)).toBe(true);
    expect(candidate.initiative.cardsPerInstance).toBe(1);
    expect(candidate.status).toBe('PARTIAL'); expect(validateBoneCombatDependency(candidate)).not.toHaveLength(0);
    expect(resolveProductionMonsterDefinition(id)).toBeUndefined();
  });
  it('keeps Captain Large and outside the ordinary summon pool', () => {
    expect(inspectBoneCombatDependency('bone-captain')!.size).toBe('LARGE');
    expect(NORMAL_NECROMANCER_SUMMON_IDS).not.toContain('bone-captain');
  });
  it('missing definitions never fall back to the simplified Bone Soldier registry', () => {
    expect(resolveProductionMonsterDefinition('missing')).toBeUndefined();
    expect(resolveProductionMonsterDefinition('bone-soldier')).toBeUndefined();
    expect(productionBoneDefinitions()).toEqual([]);
  });
  it('reports incomplete or malformed source/Skill data', () => {
    const candidate = inspectBoneCombatDependency('bone-rabble')!;
    candidate.life = 0; candidate.sourceReferences = []; candidate.skills = [];
    expect(validateBoneCombatDependency(candidate)).toEqual(expect.arrayContaining(['life', 'sourceReferences', 'skills']));
  });
  it.each([['crusader', 0], ['highwayman', 1], ['hellion', 1]] as const)('%s exposes reviewed Dodge %i through the standard Hero registry', (id, dodge) => {
    const def = getHeroCombatDefinition(id, 1)!;
    expect(def.dodge).toBe(dodge); expect(def.sourceReferences.length).toBeGreaterThan(0);
    expect(getHeroLevelDefinition(id, 1)!.credibility).toBe('prototype');
    const c = dependencyReviewCampaign(); const h = c.heroes.find(h => h.heroId === id)!;
    expect(makeHeroUnit(h, 0, c).heroCombatDefinition).toEqual(def);
  });
  it('missing Hero class/level Dodge remains absent rather than defaulting to zero', () => {
    expect(getHeroCombatDefinition('vestal', 1)).toBeUndefined();
    expect(getHeroCombatDefinition('highwayman', 2)).toBeUndefined();
    expect(getHeroCombatDefinition('missing', 1)).toBeUndefined();
    const c = dependencyReviewCampaign(); const hero = createHeroInstance('vestal', 3)!;
    expect(makeHeroUnit(hero, 3, c).bossCombatDodge).toBeUndefined();
    c.heroes.push(hero); expect(necromancerProductionDependencyGate(c, 1).unresolved).toContain('hero:vestal:level-1:dodge');
  });
  it('same attack roll independently hits Dodge 0 and misses Dodge 1; unbound summon consumes no token', () => {
    const c = started(); let b = applyBossRuntimeInput(c.battle!, { type: 'ENTER_BOSS_ROOM' });
    b.heroes = b.heroes.slice(0, 2);
    b.heroes.forEach(h => { b.bossEncounter!.placements[h.id] = 'upper-centre'; });
    const accuracy = b.bossEncounter!.definition.skills[0].accuracy;
    b = applyBossRuntimeInput(b, { type: 'SKILL', skillRoll: 1, attackRoll: accuracy });
    for (let guard = 0; b.bossEncounter!.pendingChoice && guard < 20; guard++) {
      const p = b.bossEncounter!.pendingChoice!;
      b = applyBossRuntimeInput(b, { type: 'CHOICE', choiceId: p.choiceId, selectedId: p.candidateIds[0] });
    }
    expect(b.bossEncounter!.events.filter(e => e.eventType === 'ATTACK_ROLLED')).toHaveLength(1);
    expect(b.bossEncounter!.events.find(e => e.eventType === 'TARGET_EFFECT')!.targets).toEqual([b.heroes[0].id]);
    expect(b.bossEncounter!.events.find(e => e.eventType === 'TARGET_MISSED')!.targets).toEqual([b.heroes[1].id]);
    expect((b.bossEncounter!.events.find(e => e.eventType === 'SKILL_RESOLVED')!.result as { summonInstructions: number }).summonInstructions).toBe(1);
    expect(b.bossEncounter!.events.some(e => e.eventType === 'SPAWN_DEFINITION_UNBOUND')).toBe(true);
    expect(Object.values(b.bossEncounter!.summonSupply).every(s => s.active === 0)).toBe(true);
  });
  it('production selector command and both Room command paths reject unresolved dependencies atomically', () => {
    const c = dependencyReviewCampaign(); c.runtimeContentProfile = 'community-complete-edition';
    const before = JSON.stringify(c);
    expect(commitQuestSelection(c, 'face-the-threat').error).toBe('necromancer-production-dependencies-unbound');
    expect(enterDungeonRoom(c, 'room-10').error).toBe('necromancer-production-dependencies-unbound');
    expect(commitMoveToRoom(c, 'room-10', null)).toBe(c); expect(JSON.stringify(c)).toBe(before);
    const gate = necromancerProductionDependencyGate(c, 1);
    expect(gate.enabled).toBe(false); expect(gate.syntheticFallbackAllowed).toBe(false);
    expect(gate.ruleSetVersion).toBe(NECROMANCER_RULE_SET_VERSION); expect(gate.roomNumber).toBe(10); expect(gate.coreCardIds).toHaveLength(3);
  });
});

describe('C1C30 checkpoint bridge unit isolation (not production acceptance)', () => {
  it('resumes a saved settled Threat into the same Ability encounter with no second setup', () => {
    const c = checkpoint(); const original = c.bossEncounterCheckpoint!;
    expect(validateSaveFile(createSaveSnapshot(c))).toBeNull();
    const loaded = restoreSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot(c))));
    const first = resumeBossFoundation(c, 'room-10'); const second = resumeBossFoundation(loaded, 'room-10');
    expect(first.battle).toEqual(second.battle);
    expect(first.battle!.bossEncounter!.events.filter(e => e.eventType === 'ENCOUNTER_SETUP')).toHaveLength(1);
    expect(first.battle!.bossEncounter!.events.slice(0, original.events.length)).toEqual(original.events);
    expect(first.battle!.bossEncounter!.side).toBe('ABILITY');
    expect(first.bossEncounterCheckpoint).toEqual(original);
    expect(() => resumeBossFoundation(first, 'room-10')).toThrow();
    expect(first.battle!.heroes.map(h => h.bossCombatDodge)).toEqual([0, 1, 1]);
  });
  it('never overwrites an existing checkpoint during new initialization', () => {
    const c = checkpoint();
    expect(() => startBossFoundation(c, necromancerDefinition(1), 31, 'room-10', {}, [])).toThrow('resumption bridge');
  });
  it.each(['campaign', 'quest', 'family', 'version', 'card', 'definition', 'dodge', 'event'] as const)('rejects mismatched %s without consuming saved state', (field) => {
    const c = checkpoint(); const e = c.bossEncounterCheckpoint!;
    if (field === 'campaign') e.checkpointContext!.campaignId = 'other';
    if (field === 'quest') e.checkpointContext!.questRunId = 'other';
    if (field === 'family') e.bossFamily = 'other';
    if (field === 'version') e.checkpointContext!.definitionVersion = 'other';
    if (field === 'card') e.threatAbilityCardId++;
    if (field === 'definition') e.definition.stats.HP++;
    if (field === 'dodge') e.checkpointContext!.heroDodge = {};
    if (field === 'event') e.events[0].eventId = 'other';
    const before = JSON.stringify(c); expect(() => resumeBossFoundation(c, 'room-10')).toThrow(); expect(JSON.stringify(c)).toBe(before);
    expect(validateSaveFile(createSaveSnapshot(c))).not.toBeNull();
  });
  it('resolves a saved lowest-roll tie with the same candidates, causal events and result', () => {
    const c = started(3);
    c.battle = applyBossRuntimeInput(c.battle!, { type: 'PREPARATION_DAY', rolls: Object.fromEntries(c.battle!.heroes.map(h => [h.id, 1])) });
    c.bossEncounterCheckpoint = c.battle.bossEncounter; c.battle = null; c.gamePhase = 'dungeon-explore';
    const p = c.bossEncounterCheckpoint!.pendingChoice!;
    const loaded = restoreSaveSnapshot(JSON.parse(JSON.stringify(createSaveSnapshot(c))));
    expect(loaded.bossEncounterCheckpoint!.pendingChoice!.candidateIds).toEqual(p.candidateIds);
    expect(() => resumeBossFoundation(c, 'room-10')).toThrow('choice');
    const first = resolveBossThreatCheckpointChoice(c, p.choiceId, p.candidateIds[1]);
    const second = resolveBossThreatCheckpointChoice(loaded, p.choiceId, p.candidateIds[1]);
    expect(first.bossEncounterCheckpoint).toEqual(second.bossEncounterCheckpoint);
    expect(first.bossEncounterCheckpoint!.threatState.forcedHeroId).toBe(p.candidateIds[1]);
    expect(() => resolveBossThreatCheckpointChoice(first, p.choiceId, p.candidateIds[1])).toThrow();
  });
  it('preserves deterministic replay for the resumed core and source-bound Hero Dodge', () => {
    const c = checkpoint(); const b = resumeBossFoundation(c, 'room-10').battle!;
    const final = applyBossRuntimeInput(b, { type: 'SKILL', skillRoll: 1, attackRoll: 1 });
    expect(replayBossRuntime(b, final.bossEncounter!.inputs.slice(b.bossEncounter!.inputs.length))).toEqual(final);
  });
});
