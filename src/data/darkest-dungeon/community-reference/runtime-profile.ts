import type { ActFourState, DarkestDungeonGuardianDefinition, DarkestDungeonLayoutDefinition, DarkestDungeonQuestDefinition } from '../../../types/act-four';
import type { FinalFormDefinition, FinalFormId, SkippableFinalFormId } from '../../../types/final-encounter';
import bindingEvidenceJson from '../../../../docs/data/darkest-dungeon/community-reference/antha-complete-edition/community-reference-binding-evidence.json' with { type: 'json' };
import { COMMUNITY_DATASET, monsterComposition } from './data';
import { COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT_SHA256 } from './source-supplement-runtime';

export const COMMUNITY_REFERENCE_PROFILE_ID = 'community-reference' as const;
export const COMMUNITY_RUNTIME_ADAPTER_VERSION = 'phase11a3-community-act4-playable-closure.v1' as const;
export const COMMUNITY_REFERENCE_SOURCE_SHA256 = COMMUNITY_DATASET.corpus.sourcePackageSha256;

export type CommunityRuntimeBlockerCode =
  | 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED'
  | 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED'
  | 'COME_UNTO_YOUR_MAKER_UNRESOLVED'
  | 'MONSTER_CARD_FRONT_BACK_SIZE_UNRESOLVED'
  | 'GUARDIAN_RESISTANCE_ENGINE_UNSUPPORTED'
  | 'GUARDIAN_CRIT_ENGINE_UNSUPPORTED'
  | 'GUARDIAN_SPECIAL_SKILL_ENGINE_UNSUPPORTED'
  | 'TEMPLARS_AREA_ADJACENCY_UNRESOLVED'
  | 'MAMMOTH_STALK_NO_SPACE_RESOLUTION_ENGINE_UNSUPPORTED'
  | 'QUEST_CARD_PROVISION_POLICY_ENGINE_UNSUPPORTED'
  | 'FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED'
  | 'FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED'
  | 'GUARDIAN_VICTORY_POLICY_ENGINE_UNSUPPORTED';
export interface CommunityRuntimeBlocker {
  code: CommunityRuntimeBlockerCode;
  requirementId: string;
  field: string;
  sourcePath: string;
  runtimeDependency: string;
  firstBlockingFunction: string;
  tests: string[];
  proofKind: 'semantic-leaf' | 'capability-level';
  classification: 'source-level' | 'runtime-only';
  sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE';
}
const blocker = (code: CommunityRuntimeBlockerCode, requirementId: string, field: string, classification: CommunityRuntimeBlocker['classification'], runtimeDependency = field, firstBlockingFunction = 'blockCommunityOperation'): CommunityRuntimeBlocker => ({ code, requirementId, field, sourcePath: field, runtimeDependency, firstBlockingFunction, tests: [`BLOCK:${code}`], proofKind: requirementId.startsWith('runtime-') ? 'capability-level' : 'semantic-leaf', classification, sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' });
export const COMMUNITY_RUNTIME_BLOCKERS = [
  blocker('FINAL_SKILL_TABLE_ENGINE_UNSUPPORTED', 'runtime-community-final', 'printedSkillSelection', 'runtime-only', 'all normalized Final skill/d10 leaves through Community prepare/start/action/save', 'prepareFinalEncounter'),
  blocker('FINAL_ROOM_TRANSITION_ENGINE_UNSUPPORTED', 'tierB-ancestor-room', 'roomEffects', 'runtime-only', 'production-reachable Community transition without injecting Final state', 'prepareFinalEncounter'),
  blocker('TEMPLARS_PIT_EXIT_RULE_UNRESOLVED', 'tierB-templars-room', 'pitExitRule', 'source-level'),
  blocker('GESTATING_HEART_LETHAL_TIMING_UNRESOLVED', 'tierB-gestating-heart', 'lethalWoundTimingRuling', 'source-level'),
  blocker('COME_UNTO_YOUR_MAKER_UNRESOLVED', 'tierB-come-unto-your-maker', 'definition', 'source-level'),
  blocker('MONSTER_CARD_FRONT_BACK_SIZE_UNRESOLVED', 'tierB-darkest-dungeon-monster-deck', 'drawPolicy', 'source-level', 'per-card Front/Back/Large size for four-slot fill', 'drawDarkestDungeonMonster'),
  blocker('GUARDIAN_SPECIAL_SKILL_ENGINE_UNSUPPORTED', 'runtime-guardian-combat', 'specialSkillEffectResolution', 'runtime-only'),
  blocker('TEMPLARS_AREA_ADJACENCY_UNRESOLVED', 'runtime-templars-room', 'areaAdjacency', 'runtime-only'),
  blocker('MAMMOTH_STALK_NO_SPACE_RESOLUTION_ENGINE_UNSUPPORTED', 'tierB-mammoth-cyst-room', 'spawnAreaPolicy.noSpace', 'runtime-only', 'room area adjacency / nearest-available displacement', 'summonWhiteCellStalk'),
] as const;

export function communityRequirement(requirementId: string) {
  const found = COMMUNITY_DATASET.corpus.requirements.find((item) => item.requirementId === requirementId);
  if (!found) throw new Error(`Missing normalized Community requirement: ${requirementId}`);
  return found;
}
const fieldValue = <T>(requirementId: string, field: string): T => communityRequirement(requirementId).fields[field]?.value as T;
const fieldReference = (requirementId: string, field: string): string => communityRequirement(requirementId).fields[field]?.sourceReference.join(',') ?? '';
const slug = (text: string): string => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

function guardianFamilyFromQuest(value: unknown): DarkestDungeonGuardianDefinition['family'] {
  const ids = (value as { mappedComponentIds?: string[] })?.mappedComponentIds ?? [];
  if (ids.includes('shuffling-horror')) return 'shuffling-horror';
  if (ids.includes('mammoth-cyst')) return 'mammoth-cyst';
  if (ids.includes('templar-impaler') && ids.includes('templar-warlord')) return 'templars';
  throw new Error(`Unsupported Community Guardian mapping: ${ids.join(',')}`);
}

export const COMMUNITY_RUNTIME_QUESTS: DarkestDungeonQuestDefinition[] = COMMUNITY_DATASET.quests.map((source) => {
  const name = String(source.fields.name.value);
  const family = guardianFamilyFromQuest(source.fields.guardianDefinitionId.value);
  return {
    id: source.id,
    questType: 'darkest-dungeon-guardian',
    name,
    roomCount: 16,
    xpReward: 3,
    guardianDefinitionId: `community-dd-guardian-family-${family}`,
    skippedFinalFormId: source.fields.skippedFinalFormId.value as SkippableFinalFormId,
    firewoodCount: Number(source.fields.firewoodCount.value),
    provisionPolicyId: `community-dd-provision-${slug(String(source.requirementId))}`,
    canRetreat: false,
    campaignFailureOnFailure: true,
    officialDataStatus: 'partial',
    enabledInOfficialPool: false,
    sourceReference: source.fields.name.sourceReference.join(','),
  };
});

interface SourceLayout { sourceTileGuid: string; roomSlots: Array<{ sourceLocalSlotId: string; bossCandidate: boolean }>; corridorEdges: Array<[string, string]>; start: { id: string } }
function layoutFrom(source: SourceLayout): DarkestDungeonLayoutDefinition {
  const prefix = `community-dd-layout-${source.sourceTileGuid}`;
  const slots = new Set(source.roomSlots.map((item) => item.sourceLocalSlotId));
  const edges: Array<[string, string]> = [];
  const junctions = new Map<string, string[]>();
  for (const [from, to] of source.corridorEdges) {
    if (slots.has(from) && slots.has(to)) edges.push([from, to]);
    else {
      const junction = slots.has(from) ? to : from;
      const room = slots.has(from) ? from : to;
      if (!slots.has(junction) && slots.has(room)) junctions.set(junction, [...(junctions.get(junction) ?? []), room]);
    }
  }
  for (const rooms of junctions.values()) for (let index = 1; index < rooms.length; index += 1) edges.push([rooms[0], rooms[index]]);
  const startEdge = source.corridorEdges.find((edge) => edge.includes(source.start.id));
  const start = startEdge?.find((candidate) => slots.has(candidate)) ?? source.roomSlots[0].sourceLocalSlotId;
  const id = (local: string) => `${prefix}-${local}`;
  return { id: prefix, name: `Community DD Layout ${source.sourceTileGuid}`, roomSlotIds: source.roomSlots.map((item) => id(item.sourceLocalSlotId)), corridorDefinitions: edges.map(([from, to], index) => ({ id: `${prefix}-corridor-${index + 1}`, from: id(from), to: id(to), length: 1 })), bossSlotIds: source.roomSlots.filter((item) => item.bossCandidate).map((item) => id(item.sourceLocalSlotId)) as [string, string, string], startRoomSlotId: id(start), roomCount: 16, officialDataStatus: 'partial', enabledInOfficialPool: false, sourceReference: fieldReference('tierB-dd-dungeon-tile', 'tileGeometry') };
}
export const COMMUNITY_RUNTIME_LAYOUTS = fieldValue<SourceLayout[]>('tierB-dd-dungeon-tile', 'tileGeometry').map(layoutFrom);

const guardianFamilies: DarkestDungeonGuardianDefinition['family'][] = ['templars', 'mammoth-cyst', 'shuffling-horror'];
export const COMMUNITY_RUNTIME_GUARDIAN_ACTORS = COMMUNITY_DATASET.guardians.map((source) => ({ ...source, id: `community-dd-actor-${source.requirementId.replace(/^tierB-/, '')}` }));
export const COMMUNITY_RUNTIME_GUARDIANS: DarkestDungeonGuardianDefinition[] = guardianFamilies.map((family) => {
  const actors = COMMUNITY_RUNTIME_GUARDIAN_ACTORS.filter((actor) => communityRequirement(actor.requirementId).componentGroup === family);
  return { id: `community-dd-guardian-family-${family}`, family, name: `Community ${family}`, roomDefinitionId: `community-dd-${family}-room`, actorDefinitionIds: actors.map((actor) => actor.id), officialDataStatus: 'partial', enabledInOfficialPool: false };
});

const finalRequirementByForm: Record<FinalFormId, { requirementId: string; hpField: string; skillField: string }> = {
  'ancestor-first-form': { requirementId: 'tierB-ancestor-first-form', hpField: 'ancestor.maxHp', skillField: 'ancestor.skillIds' },
  'ancestor-second-form': { requirementId: 'tierB-ancestor-second-form', hpField: 'ancestor.maxHp', skillField: 'ancestor.skillIds' },
  'gestating-heart': { requirementId: 'tierB-gestating-heart', hpField: 'maxHp', skillField: 'skillIds' },
  'heart-of-darkness': { requirementId: 'tierB-heart-of-darkness', hpField: 'maxHp', skillField: 'skillIds' },
};
const asSkillArray = (value: unknown): Array<{ sourceLocalSkillId: string }> => Array.isArray(value) ? value : value ? [value as { sourceLocalSkillId: string }] : [];
export const COMMUNITY_RUNTIME_FINAL_FORMS: FinalFormDefinition[] = (Object.keys(finalRequirementByForm) as FinalFormId[]).map((formId) => {
  const mapping = finalRequirementByForm[formId];
  return { id: `community-dd-final-form-${formId}`, formId, name: formId, spawnRule: 'standard', skippable: formId !== 'heart-of-darkness', maxHp: Number(fieldValue(mapping.requirementId, mapping.hpField)), skillIds: asSkillArray(fieldValue(mapping.requirementId, mapping.skillField)).map((skill) => `community-dd-skill-${skill.sourceLocalSkillId}`), attendantActorDefinitionIds: [], officialDataStatus: 'partial', enabledInOfficialPool: false, sourceReference: fieldReference(mapping.requirementId, mapping.hpField) };
});
export const COMMUNITY_RUNTIME_MONSTER_COMPOSITION = monsterComposition.map((source) => ({ ...source, id: `community-dd-monster-${source.sourceLocalMonsterDefinitionId}`, level: 3 as const, physicalInstances: source.members.map((member) => ({ ...member, sourceReference: `tts:${member.guid}` })) }));

export interface CommunityContentArtifactIdentities { normalizedRequirementsSha256: string; sourceBindingManifestSha256: string; runtimeSourceSupplementSha256: string | null }
export const COMMUNITY_CONTENT_ARTIFACT_IDENTITIES: CommunityContentArtifactIdentities = {
  normalizedRequirementsSha256: bindingEvidenceJson.committedArtifactHashes['normalized-requirements.json'],
  sourceBindingManifestSha256: bindingEvidenceJson.committedArtifactHashes['source-binding-manifest.json'],
  runtimeSourceSupplementSha256: COMMUNITY_SOURCE_RESOLUTION_SUPPLEMENT_SHA256,
};
const stableHash = (text: string): string => { let hash = 5381; for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0; return (hash >>> 0).toString(16).padStart(8, '0'); };
export function computeCommunityReferenceContentHash(sourcePackageSha256 = COMMUNITY_REFERENCE_SOURCE_SHA256, artifacts = COMMUNITY_CONTENT_ARTIFACT_IDENTITIES): string {
  return stableHash(JSON.stringify({ profileId: COMMUNITY_REFERENCE_PROFILE_ID, sourcePackageSha256, ...artifacts, runtimeAdapterVersion: COMMUNITY_RUNTIME_ADAPTER_VERSION, activeBlockers: COMMUNITY_RUNTIME_BLOCKERS.map((item) => item.code) }));
}
export const COMMUNITY_REFERENCE_CONTENT_HASH = computeCommunityReferenceContentHash();

export const COMMUNITY_REFERENCE_RUNTIME_PROFILE = {
  profileId: COMMUNITY_REFERENCE_PROFILE_ID,
  sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' as const,
  sourcePackageSha256: COMMUNITY_REFERENCE_SOURCE_SHA256,
  artifactIdentities: COMMUNITY_CONTENT_ARTIFACT_IDENTITIES,
  runtimeAdapterVersion: COMMUNITY_RUNTIME_ADAPTER_VERSION,
  contentHash: COMMUNITY_REFERENCE_CONTENT_HASH,
  quests: COMMUNITY_RUNTIME_QUESTS,
  layouts: COMMUNITY_RUNTIME_LAYOUTS,
  guardianFamilies: COMMUNITY_RUNTIME_GUARDIANS,
  guardianActors: COMMUNITY_RUNTIME_GUARDIAN_ACTORS,
  rooms: COMMUNITY_DATASET.rooms,
  finalEncounterRecords: COMMUNITY_DATASET.finalEncounter,
  finalForms: COMMUNITY_RUNTIME_FINAL_FORMS,
  monsterComposition: COMMUNITY_RUNTIME_MONSTER_COMPOSITION,
  unresolvedRules: Object.fromEntries(COMMUNITY_RUNTIME_BLOCKERS.map((item) => [item.code, item.classification === 'source-level' ? communityRequirement(item.requirementId).fields[item.field]?.value ?? null : null])) as Record<CommunityRuntimeBlockerCode, unknown>,
  runtimeBlockers: COMMUNITY_RUNTIME_BLOCKERS,
  capabilities: { questPool: 'ready', layoutPool: 'ready', contentSnapshot: 'ready', guardian: { templars: 'partial', mammothCyst: 'ready', shufflingHorror: 'partial' }, monsterDeck: { definitions: 'ready', randomDraw: 'partial' }, finalEncounter: { ancestorFirst: 'ready', ancestorSecond: 'partial', gestatingHeart: 'partial', heartOfDarkness: 'partial' }, fullActFourPlayable: false },
} as const;

export type CommunitySourceBlockedResult = { ok: false; kind: 'community-source-blocked'; blocker: CommunityRuntimeBlocker };
export function blockCommunityOperation(code: CommunityRuntimeBlockerCode): CommunitySourceBlockedResult { const active = COMMUNITY_RUNTIME_BLOCKERS.find((item) => item.code === code); if (!active) throw new Error(`Unknown Community runtime blocker: ${code}`); return { ok: false, kind: 'community-source-blocked', blocker: active }; }
export function drawCommunityMonster(campaign: { actFourState: ActFourState }): CommunitySourceBlockedResult {
  void campaign;
  return blockCommunityOperation('MONSTER_CARD_FRONT_BACK_SIZE_UNRESOLVED');
}

export function validateCommunitySetupSnapshot(state: ActFourState): string[] {
  const errors: string[] = [];
  if (state.questDrawRecord?.runtimeProfileId !== COMMUNITY_REFERENCE_PROFILE_ID) errors.push('quest profile identity missing');
  if (state.layoutDrawRecord?.runtimeProfileId !== COMMUNITY_REFERENCE_PROFILE_ID) errors.push('layout profile identity missing');
  if (state.contentRuntime?.runtimeProfileId !== COMMUNITY_REFERENCE_PROFILE_ID) errors.push('content profile identity missing');
  if (state.contentRuntime?.contentHash !== COMMUNITY_REFERENCE_CONTENT_HASH) errors.push('community content hash missing');
  if (!state.questDrawRecord || !state.processedTransactionIds.includes(state.questDrawRecord.transactionId)) errors.push('quest command transaction missing');
  if (!state.layoutDrawRecord || !state.processedTransactionIds.includes(state.layoutDrawRecord.transactionId)) errors.push('layout command transaction missing');
  if (!state.contentRuntime || !state.processedTransactionIds.includes(state.contentRuntime.transactionId)) errors.push('content command transaction missing');
  return errors;
}

export function validateCommunityRuntimeProfile(profile: typeof COMMUNITY_REFERENCE_RUNTIME_PROFILE = COMMUNITY_REFERENCE_RUNTIME_PROFILE): string[] {
  const errors: string[] = [];
  const definitions: Array<{ id: string; enabledInOfficialPool?: boolean; officialDataStatus?: string }> = [...profile.quests, ...profile.layouts, ...profile.guardianFamilies, ...profile.guardianActors, ...profile.rooms, ...profile.finalForms];
  if (profile.sourceAuthority !== 'COMMUNITY_RETAIL_REFERENCE' || profile.sourcePackageSha256 !== COMMUNITY_DATASET.corpus.sourcePackageSha256) errors.push('source authority or accepted package SHA mismatch');
  if (profile.quests.length !== 3 || profile.layouts.length !== 2 || profile.guardianFamilies.length !== 3 || profile.guardianActors.length !== 7 || profile.rooms.length !== 4 || profile.finalEncounterRecords.length !== 10) errors.push('runtime projection counts mismatch');
  if (profile.monsterComposition.reduce((total, monster) => total + monster.physicalInstances.length, 0) !== 26 || profile.monsterComposition.length !== 9) errors.push('monster composition must be 26 physical / 9 logical');
  if (definitions.some((definition) => !definition.id.startsWith('community-') || definition.id.startsWith('prototype-') || definition.enabledInOfficialPool !== false)) errors.push('Community identity or official-pool isolation failure');
  if (definitions.some((definition) => definition.officialDataStatus === 'verified')) errors.push('Community definitions must not masquerade as official verified data');
  if (profile.runtimeBlockers.length < 7 || profile.runtimeBlockers.some((item) => profile.unresolvedRules[item.code] !== null)) errors.push('active source/runtime blockers must remain explicit');
  if (String(profile.capabilities.monsterDeck.randomDraw) === 'prototype' || profile.capabilities.fullActFourPlayable !== false) errors.push('Community runtime must fail closed');
  if (profile.contentHash !== computeCommunityReferenceContentHash(profile.sourcePackageSha256, profile.artifactIdentities)) errors.push('content hash artifact identity mismatch');
  return errors;
}
