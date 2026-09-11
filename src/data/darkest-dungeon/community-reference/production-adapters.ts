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
const numeric = (candidate: unknown): number => typeof candidate === 'number' ? candidate : 0;
const rollsFor = (table: SourceD10, stance: string, printedNumber: number): number[] =>
  table.find((entry) => entry.stances.includes(stance))?.ranges.find((entry) => entry.printedSkillNumber === printedNumber)?.rolls ?? [];

function actorStats(requirementId: string) {
  const resistance = value<ResistanceSource>(requirementId, 'resistances');
  return {
    maxHp: value<number>(requirementId, 'maxHp'),
    dodge: value<number>(requirementId, 'dodge'),
    speed: value<number>(requirementId, 'speed'),
    // The engine's legacy numeric resistance table cannot represent the retail card's
    // categorical resistance icons. Preserve only source-confirmed immunities here.
    resistances: {},
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
    accuracy: numeric(accuracy[skill.sourceLocalSkillId]), minDamage: numeric(damage[skill.sourceLocalSkillId]),
    maxDamage: numeric(damage[skill.sourceLocalSkillId]), stress: 0,
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
  spikedPits: pitAreas.map((areaId) => ({ id: id(`spiked-pit-${areaId}`), areaId, targetable: false, hasHp: false, hasInitiative: false, capacityPolicy: 'normal-area-capacity', entryEffects: [{ id: id(`pit-entry-${areaId}`), kind: 'damage', amount: 5, description: 'Community retail Templars pit entry damage; bleed remains in the source record.', officialDataStatus: 'partial', sourceReference: reference('tierB-templars-room', 'pitEntryEffects') }], endTurnEffects: [], conditionTriggeredEffects: [], officialDataStatus: 'partial' })),
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
  return skills.map((skill) => ({ id: id(`skill-${skill.sourceLocalSkillId}`), actorDefinitionId: actorId, name: skill.printedName, d10Rolls: rollsFor(d10, stance, skill.printedNumber) as MammothRoll[], usableFromAreaIds: [], targetSide: skill.sourceLocalSkillId === 'reconstitute' || skill.sourceLocalSkillId === 'revivify' ? 'ally' : 'enemy', targetKind: skill.sourceLocalSkillId === 'reconstitute' || skill.sourceLocalSkillId === 'revivify' ? 'monster' : 'hero', accuracy: numeric(accuracy[skill.sourceLocalSkillId]), minDamage: numeric(damage[skill.sourceLocalSkillId]), maxDamage: numeric(damage[skill.sourceLocalSkillId]), stress: 0, triggersTeleportation: skill.sourceLocalSkillId === 'teleport', teleportationMapId: skill.sourceLocalSkillId === 'teleport' ? id('mammoth-cyst-teleport-map') : undefined, rollPolicy: 'definition-driven', requiresHit: numeric(accuracy[skill.sourceLocalSkillId]) > 0 ? true : null, description: `Community retail card action: ${skill.printedName}`, officialDataStatus: 'partial', sourceReference: reference(requirementId, 'skillIds') }));
}
export const COMMUNITY_MAMMOTH_CYST: MammothCystActorDefinition = { id: id('mammoth-cyst'), actorType: 'boss', name: 'Mammoth Cyst', campaignLevel: 3, requiredStance: 'aggressive', actionsPerRound: 2, stats: actorStats('tierB-mammoth-cyst'), skills: mammothSkills('tierB-mammoth-cyst', 'aggressive'), color: '#991b1b', officialDataStatus: 'partial', sourceReference: reference('tierB-mammoth-cyst', 'maxHp'), enabledInOfficialPool: false };
export const COMMUNITY_WHITE_CELL_STALK: WhiteCellStalkActorDefinition = { id: id('white-cell-stalk'), actorType: 'boss-minion', name: 'White Cell Stalk', campaignLevel: 3, requiredStance: null, actionsPerRound: 2, stats: actorStats('tierB-white-cell-stalk'), skills: mammothSkills('tierB-white-cell-stalk', 'aggressive'), color: '#f5f5f4', officialDataStatus: 'partial', sourceReference: reference('tierB-white-cell-stalk', 'maxHp'), enabledInOfficialPool: false };
const mammothAreas = value<string[]>('tierB-mammoth-cyst-room', 'areaIds');
const spawnArea = value<{ mammothInitialArea: string; stanceToArea: Record<MonsterStance, string> }>('tierB-mammoth-cyst-room', 'spawnAreaPolicy');
export const COMMUNITY_MAMMOTH_CYST_ROOM: MammothCystRoomDefinition = { id: id('mammoth-cyst-room'), guardianFamilyId: 'mammoth-cyst', mammothCystPlacement: { stance: 'aggressive', areaId: spawnArea.mammothInitialArea }, whiteCellStalkSpawn: { stancePolicy: 'first-empty-stance', areaPolicy: 'corresponding-stance-area' }, stanceAreaMap: spawnArea.stanceToArea, validAreaIds: mammothAreas, areaCapacities: value('tierB-mammoth-cyst-room', 'areaCapacities'), areaGraph: { areas: mammothAreas, edges: [] }, teleportationD10Map: value('tierB-mammoth-cyst-room', 'teleportationD10Map'), roomEntryEffects: {}, officialDataStatus: 'partial', sourceReference: reference('tierB-mammoth-cyst-room', 'areaIds') };
export const COMMUNITY_MAMMOTH_CYST_GUARDIAN: MammothCystGuardianDefinition = { id: id('mammoth-cyst-encounter'), guardianFamilyId: 'mammoth-cyst', bossActorDefinitionId: COMMUNITY_MAMMOTH_CYST.id, linkedActorDefinitionId: COMMUNITY_WHITE_CELL_STALK.id, roomDefinitionId: COMMUNITY_MAMMOTH_CYST_ROOM.id, conditionalSummonDefinitionId: id('mammoth-cyst-summon'), victoryCondition: 'boss-defeated', cleanupPolicy: 'remove-linked-actors-on-boss-victory', officialDataStatus: 'partial', sourceReference: reference('tierB-mammoth-cyst-room', 'victoryCondition'), enabledInOfficialPool: false };
export const COMMUNITY_MAMMOTH_CYST_SUMMON: ConditionalLinkedActorSummon = { id: id('mammoth-cyst-summon'), sourceActorDefinitionId: COMMUNITY_MAMMOTH_CYST.id, linkedActorDefinitionId: COMMUNITY_WHITE_CELL_STALK.id, condition: { type: 'no-alive-actors-with-tag', tag: 'white-cell-stalk' }, replacesNormalSkill: true, initiativeCardsToAdd: 2, maxAlive: 1, resummonPolicy: 'on-source-turn-when-none-alive' };

export interface CommunityShufflingActorSpec { role: ShufflingHorrorRole; actorDefinitionId: string; name: string; requiredStance: MonsterStance | null; actionsPerRound: number; startsInReserve: boolean; maxHp: number; speed: number; skillIds: string[] }
const shufflingActor = (requirementId: string, role: ShufflingHorrorRole, name: string, reserve: boolean): CommunityShufflingActorSpec => ({ role, actorDefinitionId: id(requirementId.replace(/^tierB-/, '')), name, requiredStance: reserve ? null : 'aggressive', actionsPerRound: role === 'horror' ? 2 : 1, startsInReserve: reserve, maxHp: value(requirementId, 'maxHp'), speed: value(requirementId, 'speed'), skillIds: value<SourceSkill[]>(requirementId, 'skillIds').map((skill) => id(`skill-${skill.sourceLocalSkillId}`)) });
export const COMMUNITY_SHUFFLING_ACTORS: CommunityShufflingActorSpec[] = [shufflingActor('tierB-shuffling-horror', 'horror', 'Shuffling Horror', false), shufflingActor('tierB-cultist-priest', 'cultist-priest', 'Cultist Priest', true), shufflingActor('tierB-malignant-growth', 'malignant-growth', 'Malignant Growth', true)];
export const COMMUNITY_SHUFFLING_ROOM = { id: id('shuffling-horror-room'), areaIds: value<string[]>('tierB-shuffling-horror-room', 'areaIds'), areaCapacities: value<Record<string, number>>('tierB-shuffling-horror-room', 'areaCapacities'), sourceReference: reference('tierB-shuffling-horror-room', 'areaIds') };
