import type { DualBossEncounterDefinition, DualBossVictoryRule } from '../../../types/dual-boss';
import type { D10Roll as TemplarRoll, TemplarActorDefinition, TemplarSkillDefinition, TemplarsRoomDefinition } from '../../../types/templars';
import type { ConditionalLinkedActorSummon, D10Roll as MammothRoll, MammothCystActorDefinition, MammothCystGuardianDefinition, MammothCystRoomDefinition, MammothCystSkillDefinition, WhiteCellStalkActorDefinition } from '../../../types/mammoth-cyst';
import type { MonsterStance, ShufflingHorrorRole } from '../../../types/shuffling-horror';
import { communityRequirement } from './runtime-profile';

type SourceSkill = { sourceLocalSkillId: string; printedName: string; printedNumber: number };
type SourceD10 = Array<{ stances: string[]; ranges: Array<{ rolls: number[]; printedSkillNumber: number }> }>;
type ResistanceSource = { resistantTo: string[]; immuneTo: string[] };

const value = <T>(requirementId: string, field: string): T =>
  communityRequirement(requirementId).fields[field].value as T;
const reference = (requirementId: string, field: string): string =>
  communityRequirement(requirementId).fields[field].sourceReference.join(',');
const id = (local: string): string => `community-dd-${local}`;
export const requireCommunityNumber = (candidate: unknown, path: string): number => {
  if (typeof candidate === 'number' && Number.isFinite(candidate)) return candidate;
  throw new Error(`Missing confirmed Community numeric field: ${path}`);
};
const rollsFor = (table: SourceD10, stance: string, printedNumber: number): number[] =>
  table.find((entry) => entry.stances.includes(stance))?.ranges.find((entry) => entry.printedSkillNumber === printedNumber)?.rolls ?? [];

function actorStats(requirementId: string) {
  const resistance = value<ResistanceSource>(requirementId, 'resistances');
  return {
    maxHp: value<number>(requirementId, 'maxHp'),
    dodge: value<number>(requirementId, 'dodge'),
    speed: value<number>(requirementId, 'speed'),
    resistances: {},
    categoricalResistances: resistance.resistantTo.filter((item): item is 'bleed' | 'blight' | 'stun' | 'mark' => ['bleed', 'blight', 'stun', 'mark'].includes(item)),
    immunities: [...resistance.immuneTo],
    size: 1,
  };
}

function templarActor(requirementId: string, role: 'impaler' | 'warlord', stance: 'aggressive' | 'ranged'): TemplarActorDefinition {
  const skills = value<SourceSkill[]>(requirementId, 'skillIds');
  const accuracy = value<Record<string, unknown>>(requirementId, 'accuracy');
  const damage = value<Record<string, unknown>>(requirementId, 'damage');
  const d10 = value<SourceD10>(requirementId, 'd10SkillTable');
  const actorId = id(requirementId.replace(/^tierB-/, ''));
  const mapped: TemplarSkillDefinition[] = skills.map((skill) => ({
    id: id(`skill-${role}-${skill.sourceLocalSkillId}`), actorDefinitionId: actorId,
    name: skill.printedName, d10Rolls: rollsFor(d10, stance, skill.printedNumber) as TemplarRoll[],
    usableFromAreaIds: [], targetSide: 'enemy', targetKind: 'hero',
    accuracy: requireCommunityNumber(accuracy[skill.sourceLocalSkillId], `${requirementId}.accuracy.${skill.sourceLocalSkillId}`), minDamage: requireCommunityNumber(damage[skill.sourceLocalSkillId], `${requirementId}.damage.${skill.sourceLocalSkillId}`),
    maxDamage: requireCommunityNumber(damage[skill.sourceLocalSkillId], `${requirementId}.damage.${skill.sourceLocalSkillId}`), stress: 0,
    onHitEffects: skill.sourceLocalSkillId === 'body-slam' ? [{ type: 'trigger-pit-toss', target: 'hit-hero' }] : [],
    effectSequence: null, description: `Community retail card action: ${skill.printedName}`,
    officialDataStatus: 'partial', sourceReference: reference(requirementId, 'skillIds'),
  }));
  return { id: actorId, role, actorType: 'boss', name: role === 'impaler' ? 'Templar Impaler' : 'Templar Warlord', campaignLevel: 3, requiredStance: stance, actionsPerRound: 2, stats: actorStats(requirementId), skills: mapped, color: '#7f1d1d', officialDataStatus: 'partial', sourceReference: reference(requirementId, 'maxHp'), enabledInOfficialPool: false };
}

export const COMMUNITY_TEMPLAR_IMPALER = templarActor('tierB-templars-impaler', 'impaler', 'aggressive');
export const COMMUNITY_TEMPLAR_WARLORD = templarActor('tierB-templars-warlord', 'warlord', 'ranged');

const templarAreas = value<string[]>('tierB-templars-room', 'areaIds');
const templarCaps = value<Record<string, number>>('tierB-templars-room', 'areaCapacities');
const templarTile = value<{ areas: Array<{ sourceLocalAreaId: string; stanceMarkers: string[] }> }>('tierB-templars-room-tile', 'tileGeometry');
const templarAreaFor = (marker: string) => templarTile.areas.find((area) => area.stanceMarkers.includes(marker))?.sourceLocalAreaId ?? '';
const sourcePitMap = value<Record<string, string>>('tierB-templars-room', 'pitD10Map');
const pitAreas = [...new Set(Object.values(sourcePitMap))];
export const COMMUNITY_TEMPLARS_ROOM: TemplarsRoomDefinition = {
  id: id('templars-room'), guardianFamilyId: 'templars',
  impalerPlacement: { stance: 'aggressive', areaId: templarAreaFor('monster:aggressive') },
  warlordPlacement: { stance: 'ranged', areaId: templarAreaFor('monster:ranged') },
  heroPlacementRules: [{ rule: 'room-card-defined' }], validAreaIds: templarAreas, areaCapacities: templarCaps,
  areaGraph: { areas: templarAreas, edges: [] },
  spikedPits: pitAreas.map((areaId) => ({ id: id(`spiked-pit-${areaId}`), areaId, targetable: false, hasHp: false, hasInitiative: false, capacityPolicy: 'normal-area-capacity', entryEffects: [{ id: id(`pit-entry-damage-${areaId}`), kind: 'damage', amount: 5, description: 'Community retail Templars pit entry damage.', officialDataStatus: 'partial', sourceReference: reference('tierB-templars-room', 'pitEntryEffects') }, { id: id(`pit-entry-bleed-${areaId}`), kind: 'condition', condition: 'bleed', amount: 3, duration: 3, description: 'Community retail Templars pit entry Bleed 3 for 3 turns.', officialDataStatus: 'partial', sourceReference: reference('tierB-templars-room', 'pitEntryEffects') }], endTurnEffects: [], conditionTriggeredEffects: [], officialDataStatus: 'partial' })),
  pitTossD10Map: Object.fromEntries(Object.entries(sourcePitMap).map(([roll, areaId]) => [roll, id(`spiked-pit-${areaId}`)])) as Record<TemplarRoll, string>,
  roomEffects: [], officialDataStatus: 'partial', sourceReference: reference('tierB-templars-room', 'areaIds'),
};
export const COMMUNITY_TEMPLARS_ENCOUNTER: DualBossEncounterDefinition = {
  id: id('templars-encounter'), guardianFamilyId: 'templars',
  bossMembers: [
    { actorDefinitionId: COMMUNITY_TEMPLAR_IMPALER.id, role: 'impaler', requiredStance: 'aggressive', requiredAreaId: COMMUNITY_TEMPLARS_ROOM.impalerPlacement.areaId, initiativeCardsPerRound: 2 },
    { actorDefinitionId: COMMUNITY_TEMPLAR_WARLORD.id, role: 'warlord', requiredStance: 'ranged', requiredAreaId: COMMUNITY_TEMPLARS_ROOM.warlordPlacement.areaId, initiativeCardsPerRound: 2 },
  ], roomDefinitionId: COMMUNITY_TEMPLARS_ROOM.id, victoryCondition: 'all-boss-members-defeated', failureCondition: 'party-defeated', officialDataStatus: 'partial', sourceReference: reference('tierB-templars-room', 'victoryCondition'), enabledInOfficialPool: false,
};
export const COMMUNITY_TEMPLARS_VICTORY: DualBossVictoryRule = { type: 'all-listed-boss-actors-defeated', requiredActorDefinitionIds: [COMMUNITY_TEMPLAR_IMPALER.id, COMMUNITY_TEMPLAR_WARLORD.id] };

function mammothSkills(requirementId: string, stance: string): MammothCystSkillDefinition[] {
  const actorId = id(requirementId.replace(/^tierB-/, ''));
  const skills = value<SourceSkill[]>(requirementId, 'skillIds');
  const accuracy = value<Record<string, unknown>>(requirementId, 'accuracy');
  const damage = value<Record<string, unknown>>(requirementId, 'damage');
  const d10 = value<SourceD10>(requirementId, 'd10SkillTable');
  return skills.map((skill) => {
    const localId = skill.sourceLocalSkillId;
    const specialEffect = localId === 'revivify'
      ? { type: 'heal-monster' as const, amount: 15, target: 'self' as const }
      : localId === 'reconstitute'
        ? { type: 'heal-monster' as const, amount: 14, target: 'ally' as const }
        : localId === 'teleport'
          ? { type: 'teleport-hero' as const }
          : null;
    const skillAccuracy = specialEffect?.type === 'heal-monster' ? null : requireCommunityNumber(accuracy[localId], `${requirementId}.accuracy.${localId}`);
    const skillDamage = specialEffect ? null : requireCommunityNumber(damage[localId], `${requirementId}.damage.${localId}`);
    return { id: id(`skill-${localId}`), actorDefinitionId: actorId, name: skill.printedName, d10Rolls: rollsFor(d10, stance, skill.printedNumber) as MammothRoll[], usableFromAreaIds: [], targetSide: localId === 'revivify' ? 'self' : localId === 'reconstitute' ? 'ally' : 'enemy', targetKind: localId === 'revivify' || localId === 'reconstitute' ? 'monster' : 'hero', accuracy: skillAccuracy, minDamage: skillDamage, maxDamage: skillDamage, stress: 0, specialEffect, triggersTeleportation: localId === 'teleport', teleportationMapId: localId === 'teleport' ? id('mammoth-cyst-teleport-map') : undefined, rollPolicy: 'definition-driven', requiresHit: specialEffect?.type === 'heal-monster' ? false : true, description: `Community retail card action: ${skill.printedName}`, officialDataStatus: 'partial', sourceReference: reference(requirementId, 'skillIds') };
  });
}
export const COMMUNITY_MAMMOTH_CYST: MammothCystActorDefinition = { id: id('mammoth-cyst'), actorType: 'boss', name: 'Mammoth Cyst', campaignLevel: 3, requiredStance: 'aggressive', actionsPerRound: 2, stats: actorStats('tierB-mammoth-cyst'), skills: mammothSkills('tierB-mammoth-cyst', 'aggressive'), color: '#991b1b', officialDataStatus: 'partial', sourceReference: reference('tierB-mammoth-cyst', 'maxHp'), enabledInOfficialPool: false };
export const COMMUNITY_WHITE_CELL_STALK: WhiteCellStalkActorDefinition = { id: id('white-cell-stalk'), actorType: 'boss-minion', name: 'White Cell Stalk', campaignLevel: 3, requiredStance: null, actionsPerRound: 2, stats: actorStats('tierB-white-cell-stalk'), skills: mammothSkills('tierB-white-cell-stalk', 'aggressive'), color: '#f5f5f4', officialDataStatus: 'partial', sourceReference: reference('tierB-white-cell-stalk', 'maxHp'), enabledInOfficialPool: false };
const mammothAreas = value<string[]>('tierB-mammoth-cyst-room', 'areaIds');
const spawnArea = value<{ mammothInitialArea: string; stanceToArea: Record<MonsterStance, string> }>('tierB-mammoth-cyst-room', 'spawnAreaPolicy');
export const COMMUNITY_MAMMOTH_CYST_ROOM: MammothCystRoomDefinition = { id: id('mammoth-cyst-room'), guardianFamilyId: 'mammoth-cyst', mammothCystPlacement: { stance: 'aggressive', areaId: spawnArea.mammothInitialArea }, whiteCellStalkSpawn: { stancePolicy: 'first-empty-stance', areaPolicy: 'corresponding-stance-area' }, stanceAreaMap: spawnArea.stanceToArea, validAreaIds: mammothAreas, areaCapacities: value('tierB-mammoth-cyst-room', 'areaCapacities'), areaGraph: { areas: mammothAreas, edges: [] }, teleportationD10Map: value('tierB-mammoth-cyst-room', 'teleportationD10Map'), roomEntryEffects: {}, officialDataStatus: 'partial', sourceReference: reference('tierB-mammoth-cyst-room', 'areaIds') };
export const COMMUNITY_MAMMOTH_CYST_GUARDIAN: MammothCystGuardianDefinition = { id: id('mammoth-cyst-encounter'), guardianFamilyId: 'mammoth-cyst', bossActorDefinitionId: COMMUNITY_MAMMOTH_CYST.id, linkedActorDefinitionId: COMMUNITY_WHITE_CELL_STALK.id, roomDefinitionId: COMMUNITY_MAMMOTH_CYST_ROOM.id, conditionalSummonDefinitionId: id('mammoth-cyst-summon'), victoryCondition: 'boss-defeated', cleanupPolicy: 'remove-linked-actors-on-boss-victory', officialDataStatus: 'partial', sourceReference: reference('tierB-mammoth-cyst-room', 'victoryCondition'), enabledInOfficialPool: false };
export const COMMUNITY_MAMMOTH_CYST_SUMMON: ConditionalLinkedActorSummon = { id: id('mammoth-cyst-summon'), sourceActorDefinitionId: COMMUNITY_MAMMOTH_CYST.id, linkedActorDefinitionId: COMMUNITY_WHITE_CELL_STALK.id, condition: { type: 'no-alive-actors-with-tag', tag: 'white-cell-stalk' }, replacesNormalSkill: true, initiativeCardsToAdd: 2, maxAlive: 1, resummonPolicy: 'on-source-turn-when-none-alive' };

export interface CommunityShufflingActorSpec { role: ShufflingHorrorRole; actorDefinitionId: string; name: string; requiredStance: MonsterStance | null; actionsPerRound: number; startsInReserve: boolean; maxHp: number; dodge: number; speed: number; resistances: ResistanceSource; accuracy: Record<string, unknown>; damage: Record<string, unknown>; crit: Record<string, unknown>; d10SkillTable: SourceD10; skillIds: string[] }
const shufflingActor = (requirementId: string, role: ShufflingHorrorRole, name: string, reserve: boolean): CommunityShufflingActorSpec => ({ role, actorDefinitionId: id(requirementId.replace(/^tierB-/, '')), name, requiredStance: reserve ? null : 'aggressive', actionsPerRound: role === 'horror' ? 2 : 1, startsInReserve: reserve, maxHp: value(requirementId, 'maxHp'), dodge: value(requirementId, 'dodge'), speed: value(requirementId, 'speed'), resistances: value(requirementId, 'resistances'), accuracy: value(requirementId, 'accuracy'), damage: value(requirementId, 'damage'), crit: value(requirementId, 'crit'), d10SkillTable: value(requirementId, 'd10SkillTable'), skillIds: value<SourceSkill[]>(requirementId, 'skillIds').map((skill) => id(`skill-${skill.sourceLocalSkillId}`)) });
export const COMMUNITY_SHUFFLING_ACTORS: CommunityShufflingActorSpec[] = [shufflingActor('tierB-shuffling-horror', 'horror', 'Shuffling Horror', false), shufflingActor('tierB-cultist-priest', 'cultist-priest', 'Cultist Priest', true), shufflingActor('tierB-malignant-growth', 'malignant-growth', 'Malignant Growth', true)];
export const COMMUNITY_SHUFFLING_ROOM = { id: id('shuffling-horror-room'), areaIds: value<string[]>('tierB-shuffling-horror-room', 'areaIds'), areaCapacities: value<Record<string, number>>('tierB-shuffling-horror-room', 'areaCapacities'), sourceReference: reference('tierB-shuffling-horror-room', 'areaIds') };

export interface CommunityDefinitionValidation {
  isComplete: boolean;
  missing: string[];
  issues: string[];
  knownBlockers: string[];
}

const d10Complete = (skills: Array<{ d10Rolls: number[] }>): boolean => {
  const rolls = skills.flatMap((skill) => skill.d10Rolls).sort((a, b) => a - b);
  return rolls.length === 10 && rolls.every((roll, index) => roll === index + 1);
};

export function validateCommunityTemplarsDefinitions(input: {
  encounter: DualBossEncounterDefinition;
  impaler: TemplarActorDefinition;
  warlord: TemplarActorDefinition;
  room: TemplarsRoomDefinition;
} = { encounter: COMMUNITY_TEMPLARS_ENCOUNTER, impaler: COMMUNITY_TEMPLAR_IMPALER, warlord: COMMUNITY_TEMPLAR_WARLORD, room: COMMUNITY_TEMPLARS_ROOM }): CommunityDefinitionValidation {
  const missing: string[] = [];
  const issues: string[] = [];
  for (const actor of [input.impaler, input.warlord]) {
    if (!actor.stats || !Number.isFinite(actor.stats.maxHp) || !Number.isFinite(actor.stats.dodge) || !Number.isFinite(actor.stats.speed)) missing.push(`${actor.id}.stats`);
    if (actor.skills.length !== 3 || !d10Complete(actor.skills)) issues.push(`${actor.id}.d10SkillTable`);
    if (actor.skills.some((skill) => !Number.isFinite(skill.accuracy) || !Number.isFinite(skill.minDamage) || !Number.isFinite(skill.maxDamage))) issues.push(`${actor.id}.combatNumbers`);
  }
  if (input.encounter.bossMembers.length !== 2 || input.encounter.bossMembers.some((member) => ![input.impaler.id, input.warlord.id].includes(member.actorDefinitionId))) issues.push('encounter.actorBindings');
  if (input.room.validAreaIds.length !== Object.keys(input.room.areaCapacities).length || input.room.validAreaIds.some((areaId) => !Number.isFinite(input.room.areaCapacities[areaId]))) issues.push('room.areaCapacities');
  if (Object.keys(input.room.pitTossD10Map).length !== 10 || Object.values(input.room.pitTossD10Map).some((pitId) => !input.room.spikedPits.some((pit) => pit.id === pitId))) issues.push('room.pitD10Map');
  if (input.room.spikedPits.some((pit) => !pit.entryEffects.some((effect) => effect.kind === 'damage' && effect.amount === 5) || !pit.entryEffects.some((effect) => effect.kind === 'condition' && effect.condition === 'bleed' && effect.amount === 3 && effect.duration === 3))) issues.push('room.pitEntryEffects');
  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues, knownBlockers: ['TEMPLARS_PIT_EXIT_RULE_UNRESOLVED', 'TEMPLARS_AREA_ADJACENCY_UNRESOLVED'] };
}

export function validateCommunityMammothDefinitions(input: {
  guardian: MammothCystGuardianDefinition;
  cyst: MammothCystActorDefinition;
  stalk: WhiteCellStalkActorDefinition;
  room: MammothCystRoomDefinition;
  summon: ConditionalLinkedActorSummon;
} = { guardian: COMMUNITY_MAMMOTH_CYST_GUARDIAN, cyst: COMMUNITY_MAMMOTH_CYST, stalk: COMMUNITY_WHITE_CELL_STALK, room: COMMUNITY_MAMMOTH_CYST_ROOM, summon: COMMUNITY_MAMMOTH_CYST_SUMMON }): CommunityDefinitionValidation {
  const missing: string[] = [];
  const issues: string[] = [];
  for (const actor of [input.cyst, input.stalk]) {
    if (!actor.stats || !Number.isFinite(actor.stats.maxHp) || !Number.isFinite(actor.stats.dodge) || !Number.isFinite(actor.stats.speed)) missing.push(`${actor.id}.stats`);
    if (actor.skills.length !== 3 || !d10Complete(actor.skills)) issues.push(`${actor.id}.d10SkillTable`);
  }
  if (input.guardian.bossActorDefinitionId !== input.cyst.id || input.guardian.linkedActorDefinitionId !== input.stalk.id || input.guardian.conditionalSummonDefinitionId !== input.summon.id) issues.push('guardian.actorBindings');
  if (Object.keys(input.room.teleportationD10Map).length !== 10 || Object.values(input.room.teleportationD10Map).some((areaId) => !input.room.validAreaIds.includes(areaId))) issues.push('room.teleportationD10Map');
  if (Object.values(input.room.stanceAreaMap).some((areaId) => areaId && !input.room.validAreaIds.includes(areaId))) issues.push('room.stanceAreaMap');
  if (input.summon.initiativeCardsToAdd !== 2 || input.summon.maxAlive !== 1 || !input.summon.replacesNormalSkill) issues.push('summon.policy');
  const revivify = input.cyst.skills.find((skill) => skill.id.endsWith('revivify'))?.specialEffect;
  const reconstitute = input.stalk.skills.find((skill) => skill.id.endsWith('reconstitute'))?.specialEffect;
  if (revivify?.type !== 'heal-monster' || revivify.amount !== 15) issues.push('cyst.revivify');
  if (reconstitute?.type !== 'heal-monster' || reconstitute.amount !== 14) issues.push('stalk.reconstitute');
  if (input.stalk.skills.find((skill) => skill.id.endsWith('teleport'))?.specialEffect?.type !== 'teleport-hero') issues.push('stalk.teleport');
  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues, knownBlockers: ['GUARDIAN_SPECIAL_SKILL_ENGINE_UNSUPPORTED'] };
}

export function validateCommunityShufflingDefinitions(specs = COMMUNITY_SHUFFLING_ACTORS, room = COMMUNITY_SHUFFLING_ROOM): CommunityDefinitionValidation {
  const missing: string[] = [];
  const issues: string[] = [];
  if (specs.length !== 3 || new Set(specs.map((spec) => spec.role)).size !== 3) issues.push('actors.roles');
  if (specs.some((spec) => !Number.isFinite(spec.maxHp) || !Number.isFinite(spec.speed) || spec.skillIds.length < 2)) missing.push('actors.combatFields');
  if (room.areaIds.length !== Object.keys(room.areaCapacities).length || room.areaIds.some((areaId) => !Number.isFinite(room.areaCapacities[areaId]))) issues.push('room.areaCapacities');
  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues, knownBlockers: ['SHUFFLING_INITIAL_AREA_UNRESOLVED'] };
}
