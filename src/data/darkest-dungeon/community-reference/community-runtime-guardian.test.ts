import { describe, expect, it } from 'vitest';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import {
  COMMUNITY_MAMMOTH_CYST,
  COMMUNITY_MAMMOTH_CYST_GUARDIAN,
  COMMUNITY_MAMMOTH_CYST_ROOM,
  COMMUNITY_SHUFFLING_ACTORS,
  COMMUNITY_TEMPLAR_IMPALER,
  COMMUNITY_TEMPLAR_WARLORD,
  COMMUNITY_TEMPLARS_ENCOUNTER,
  COMMUNITY_TEMPLARS_ROOM,
  COMMUNITY_WHITE_CELL_STALK,
  validateCommunityMammothDefinitions,
  validateCommunityShufflingDefinitions,
  validateCommunityTemplarsDefinitions,
} from './production-adapters';
import { COMMUNITY_COMBAT_SEMANTICS, COMMUNITY_RUNTIME_FIELD_COVERAGE, COMMUNITY_SHUFFLING_POLICY_PROVENANCE } from './runtime-field-coverage';
import { resolveRoomHazardTrigger } from '../../../game-engine/room-hazards/room-hazard-trigger';
import { resolveSpikedPitExitPolicy } from '../../../game-engine/room-hazards/room-area-movement-policy';

describe('Community Guardian semantic acceptance', () => {
  it('G01 Templars instantiates both Community actors', () => expect(createCommunityGuardianScenario(1).actFourState.templarsEncounterState?.actorStates.map((actor) => actor.actorDefinitionId)).toEqual([COMMUNITY_TEMPLAR_IMPALER.id, COMMUNITY_TEMPLAR_WARLORD.id]));
  it('G02 Templars contains no Official actor definitions', () => expect(COMMUNITY_TEMPLARS_ENCOUNTER.bossMembers.every((member) => member.actorDefinitionId.startsWith('community-'))).toBe(true));
  it('G03 Templars contains no Prototype actor definitions', () => expect(JSON.stringify(COMMUNITY_TEMPLARS_ENCOUNTER)).not.toContain('prototype-'));
  it('G04 Templar HP Dodge Speed trace', () => expect([COMMUNITY_TEMPLAR_IMPALER.stats, COMMUNITY_TEMPLAR_WARLORD.stats].map((stats) => [stats?.maxHp, stats?.dodge, stats?.speed])).toEqual([[77, 3, 2], [66, 3, 2]]));
  it('G05 Templar damage accuracy d10 trace', () => { expect(COMMUNITY_TEMPLAR_IMPALER.skills.map((skill) => [skill.accuracy, skill.minDamage, skill.d10Rolls.length])).toEqual([[11, 10, 2], [11, 6, 6], [11, 20, 2]]); expect(validateCommunityTemplarsDefinitions().isComplete).toBe(true); });
  it('G06 Pit damage plus bleed uses the condition pipeline', () => { const campaign = createCommunityGuardianScenario(1); const state = campaign.actFourState.templarsEncounterState!; const hero = campaign.heroes[0]; const pit = state.snapshot.room.spikedPits[0]; const runtime = state.spikedPitRuntime.find((entry) => entry.pitDefinitionId === pit.id)!; const beforeWounds = hero.wounds; const result = resolveRoomHazardTrigger({ campaign, pit, runtime, trigger: 'on-forced-entry', actorId: hero.instanceId, sourceEventId: 'g06', transactionId: 'g06', now: '2026-09-11T00:01:00.000Z' }); const afterHero = result.campaign.heroes.find((entry) => entry.instanceId === hero.instanceId)!; const afterUnit = result.campaign.battle!.heroes.find((unit) => unit.sourceId === hero.instanceId)!; expect(afterHero.wounds - beforeWounds).toBe(5); expect(afterUnit.bleed).toBe(3); expect(result.event?.appliedEffectIds).toHaveLength(2); });
  it('G07 Pit exit reaches the exact blocker without mutation', () => { const pit = structuredClone(COMMUNITY_TEMPLARS_ROOM.spikedPits[0]); const result = resolveSpikedPitExitPolicy(pit, 'community-reference'); expect(result).toMatchObject({ ok: false, blocker: { code: 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED' } }); expect(pit).toEqual(COMMUNITY_TEMPLARS_ROOM.spikedPits[0]); });
  it('G08 Mammoth Cyst Community setup', () => expect(createCommunityGuardianScenario(2).actFourState.mammothCystEncounterState?.snapshot.guardian.id).toBe(COMMUNITY_MAMMOTH_CYST_GUARDIAN.id));
  it('G09 Stalk reserve and summon identity', () => { const state = createCommunityGuardianScenario(2).actFourState.mammothCystEncounterState!; expect(state.mammothCystBattleRuntime.reserveWhiteCellStalkDefinitionId).toBe(COMMUNITY_WHITE_CELL_STALK.id); expect(state.actorStates).toHaveLength(1); });
  it('G10 Cyst and Stalk combat-field trace', () => { expect([COMMUNITY_MAMMOTH_CYST.stats?.maxHp, COMMUNITY_WHITE_CELL_STALK.stats?.maxHp]).toEqual([109, 16]); expect(COMMUNITY_COMBAT_SEMANTICS['tierB-white-cell-stalk'].criticalHits).toBeTruthy(); expect(validateCommunityMammothDefinitions().isComplete).toBe(true); });
  it('G11 teleport map trace', () => expect(Object.values(COMMUNITY_MAMMOTH_CYST_ROOM.teleportationD10Map)).toEqual(['r11-teleport-1-2','r11-teleport-1-2','r11-teleport-3-4','r11-teleport-3-4','r11-teleport-5-6','r11-teleport-5-6','r11-teleport-7-8','r11-teleport-7-8','r11-teleport-9-10','r11-teleport-9-10']));
  it('G12 spawn and no-space semantics are classified leaf-by-leaf', () => {
    expect(COMMUNITY_RUNTIME_FIELD_COVERAGE.find((entry) => entry.requirementId === 'tierB-mammoth-cyst-room' && entry.sourcePath === 'spawnAreaPolicy.stanceToArea')?.classification).toBe('consumed');
    expect(COMMUNITY_RUNTIME_FIELD_COVERAGE.find((entry) => entry.requirementId === 'tierB-mammoth-cyst-room' && entry.sourcePath === 'spawnAreaPolicy.noSpace')?.classification).toBe('engine-unsupported-blocker');
  });
  it('G13 Shuffling Horror setup preserves Community mode', () => expect(createCommunityGuardianScenario(0).actFourState.shufflingHorrorEncounterState?.mode).toBe('community-reference'));
  it('G14 Priest and Growth reserve identities', () => expect(createCommunityGuardianScenario(0).actFourState.shufflingHorrorEncounterState?.actors.filter((actor) => actor.inReserve).map((actor) => actor.actorId)).toEqual(['u_community-dd-cultist-priest', 'u_community-dd-malignant-growth']));
  it('G15 Horror Priest Growth combat-field trace', () => expect(COMMUNITY_SHUFFLING_ACTORS.map((actor) => [actor.maxHp, actor.dodge, actor.speed, actor.skillIds.length])).toEqual([[109,3,1,3],[26,3,2,2],[28,2,1,2]]));
  it('G16 summon action stance and initiative policies have provenance', () => { expect(validateCommunityShufflingDefinitions().isComplete).toBe(true); expect(Object.values(COMMUNITY_SHUFFLING_POLICY_PROVENANCE).every((entry) => entry.classification && ('sourceReference' in entry || 'blockerCode' in entry))).toBe(true); });
});
