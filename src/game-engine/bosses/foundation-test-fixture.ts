import type { BattleState, BattleUnit } from '../../types';
import type { SpawnDefinition } from '../../types/boss-runtime';
import { necromancerDefinition } from '../necromancer/contract-adapter';
import { NECROMANCER_RULE_SET_VERSION } from '../necromancer/contract-adapter';
import { bindBossEncounter, applyBossRuntimeInput } from './foundation';

/** Synthetic dependency data, explicitly not an official monster combat definition. */
export const syntheticBoneDefinitions: SpawnDefinition[] = ['bone-rabble', 'bone-soldier', 'bone-spearman', 'bone-captain'].map((definitionId, index) => ({
  definitionId, sourceCardId: index === 3 ? 46600 : 0, life: 12, speed: 1,
  dataAuthority: 'TEST_FIXTURE', ruleSetVersion: NECROMANCER_RULE_SET_VERSION,
  large: index === 3, occupiedSlots: index === 3 ? 2 : 1, tags: ['Unholy'], skillIds: [],
}));
export function fixtureUnit(id: string, side: 'hero' | 'monster' = 'hero', position = 1, sourceId = id): BattleUnit {
  return { id, sourceId, name: id, side, hp: 40, maxHp: 40, speed: 2, stress: 0, position,
    stance: (['aggressive', 'defensive', 'ranged', 'support'] as const)[position - 1], isAlive: true,
    stunned: 0, bleed: 0, blight: 0, marked: false, buffs: [], debuffs: [], actionPoints: 0,
    atDeathsDoor: false, deathblowRollCount: 0, resolveTestedThisQuest: false, resolveState: 'normal',
    virtueId: null, afflictionId: null, mentalEffectResolvedTurnId: null, bossCombatDodge: 0 };
}
export function foundationFixture(level: 1 | 2 | 3 = 1, seed = 29, monsters: BattleUnit[] = [], resolved = true): BattleState {
  const heroes = Array.from({ length: 4 }, (_, index) => fixtureUnit(`hero-${index + 1}`, 'hero', index + 1));
  const battle: BattleState = { battleId: 'c1c29-fixture', sourceRoomId: 'room-10', status: 'active', round: 1, maxRounds: 4,
    heroes, monsters, initiativeOrder: [...heroes, ...monsters].map(u => u.id), initiativeIndex: -1, activeActorId: null,
    currentActionPoints: 0, selectedSkillId: null, selectedTargetId: null, battleLog: [], rewards: { gold: 0 } };
  return bindBossEncounter(battle, necromancerDefinition(level), seed, resolved ? syntheticBoneDefinitions : []);
}
/** In-range fixture placement permits testing Skill semantics separately from Room travel. */
export function activeFixture(level: 1 | 2 | 3 = 1, seed = 29): BattleState {
  const b = applyBossRuntimeInput(foundationFixture(level, seed), { type: 'ENTER_BOSS_ROOM' });
  for (const hero of b.heroes.slice(0, 2)) b.bossEncounter!.placements[hero.id] = 'upper-centre';
  return b;
}
