import type { ActFourState, DarkestDungeonGuardianDefinition, DarkestDungeonLayoutDefinition, DarkestDungeonQuestDefinition } from '../../../types/act-four';
import type { FinalFormDefinition, FinalFormId, SkippableFinalFormId } from '../../../types/final-encounter';

export const COMMUNITY_REFERENCE_PROFILE_ID = 'community-reference' as const;
export const COMMUNITY_REFERENCE_SOURCE_SHA256 = '382e479f84f79a9b3cc6b0256b2fa5dea100b3576244988f180b49e75ed78d2a' as const;
export type CommunityRuntimeBlockerCode = 'TEMPLARS_PIT_EXIT_RULE_UNRESOLVED' | 'ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED' | 'GESTATING_HEART_LETHAL_TIMING_UNRESOLVED' | 'COME_UNTO_YOUR_MAKER_UNRESOLVED' | 'MONSTER_DECK_DRAW_POLICY_UNRESOLVED';
export interface CommunityRuntimeBlocker { code: CommunityRuntimeBlockerCode; requirementId: string; field: string; sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' }

const blocker = (code: CommunityRuntimeBlockerCode, requirementId: string, field: string): CommunityRuntimeBlocker => ({ code, requirementId, field, sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' });
export const COMMUNITY_RUNTIME_BLOCKERS = [
  blocker('TEMPLARS_PIT_EXIT_RULE_UNRESOLVED', 'tierB-templars-room', 'pitExitRule'),
  blocker('ABSOLUTE_NOTHINGNESS_STANCE_UNRESOLVED', 'tierB-absolute-nothingness', 'stance'),
  blocker('GESTATING_HEART_LETHAL_TIMING_UNRESOLVED', 'tierB-gestating-heart', 'lethalWoundTimingRuling'),
  blocker('COME_UNTO_YOUR_MAKER_UNRESOLVED', 'tierB-come-unto-your-maker', 'definition'),
  blocker('MONSTER_DECK_DRAW_POLICY_UNRESOLVED', 'tierB-darkest-dungeon-monster-deck', 'drawPolicy'),
] as const;

const guardianByQuest: Record<string, string> = {
  'We Are The Flame': 'community-dd-guardian-family-shuffling-horror',
  'Light the Way': 'community-dd-guardian-family-templars',
  'Belly of the Beast': 'community-dd-guardian-family-mammoth-cyst',
};
const questSource = [
  { id: 'community-dd-quest-we-are-the-flame', name: 'We Are The Flame', skipped: 'ancestor-second-form' },
  { id: 'community-dd-quest-light-the-way', name: 'Light the Way', skipped: 'ancestor-first-form' },
  { id: 'community-dd-quest-belly-of-the-beast', name: 'Belly of the Beast', skipped: 'gestating-heart' },
] as const;
export const COMMUNITY_RUNTIME_QUESTS: DarkestDungeonQuestDefinition[] = questSource.map((quest) => ({
  id: quest.id, questType: 'darkest-dungeon-guardian', name: quest.name, roomCount: 16, xpReward: 3, guardianDefinitionId: guardianByQuest[quest.name], skippedFinalFormId: quest.skipped as SkippableFinalFormId, firewoodCount: 1, provisionPolicyId: 'community-dd-provision-standard-no-card-override', canRetreat: false, campaignFailureOnFailure: true, officialDataStatus: 'partial', enabledInOfficialPool: false, sourceReference: `normalized:${quest.id}`,
}));

interface SourceLayout { sourceTileGuid: string; roomSlots: Array<{ sourceLocalSlotId: string; bossCandidate: boolean }>; corridorEdges: Array<[string, string]>; start: { id: string } }
function layoutFrom(source: SourceLayout): DarkestDungeonLayoutDefinition {
  const prefix = `community-dd-layout-${source.sourceTileGuid}`;
  const slotIds = new Set(source.roomSlots.map((slot) => slot.sourceLocalSlotId));
  const edges: Array<[string, string]> = [];
  const junctions = new Map<string, string[]>();
  for (const [from, to] of source.corridorEdges) {
    if (slotIds.has(from) && slotIds.has(to)) edges.push([from, to]);
    else { const junctionId = slotIds.has(from) ? to : from; const roomId = slotIds.has(from) ? from : to; if (!slotIds.has(junctionId) && slotIds.has(roomId)) junctions.set(junctionId, [...(junctions.get(junctionId) ?? []), roomId]); }
  }
  for (const rooms of junctions.values()) for (let index = 1; index < rooms.length; index += 1) edges.push([rooms[0], rooms[index]]);
  const startEdge = source.corridorEdges.find((edge) => edge.includes(source.start.id));
  const startLocalId = startEdge?.find((candidate) => slotIds.has(candidate)) ?? source.roomSlots[0].sourceLocalSlotId;
  const runtimeId = (localId: string) => `${prefix}-${localId}`;
  return { id: prefix, name: `Community DD Layout ${source.sourceTileGuid}`, roomSlotIds: source.roomSlots.map((slot) => runtimeId(slot.sourceLocalSlotId)), corridorDefinitions: edges.map(([from, to], index) => ({ id: `${prefix}-corridor-${index + 1}`, from: runtimeId(from), to: runtimeId(to), length: 1 })), bossSlotIds: source.roomSlots.filter((slot) => slot.bossCandidate).map((slot) => runtimeId(slot.sourceLocalSlotId)) as [string, string, string], startRoomSlotId: runtimeId(startLocalId), roomCount: 16, officialDataStatus: 'partial', enabledInOfficialPool: false, sourceReference: `asset:${source.sourceTileGuid}:imageUrl` };
}
const layoutSource: SourceLayout[] = [
  { sourceTileGuid: '4ced96', roomSlots: [['c4r0',1],['c1r1',1],['c2r1',0],['c4r1',0],['c3r2',0],['c4r2',0],['c5r2',1],['c2r3',0],['c3r3',0],['c1r4',0],['c2r4',0],['c3r4',0],['c4r4',0],['c5r4',0],['c2r5',0],['c4r5',0]].map(([sourceLocalSlotId,bossCandidate]) => ({ sourceLocalSlotId: String(sourceLocalSlotId), bossCandidate: Boolean(bossCandidate) })), corridorEdges: [['c4r0','c4r1'],['c1r1','c2r1'],['c2r1','junction'],['junction','c4r1'],['junction','c3r2'],['c4r1','c4r2'],['c3r2','c4r2'],['c4r2','c5r2'],['c3r2','c3r3'],['c3r3','c3r4'],['c2r3','c2r4'],['c1r4','c2r4'],['c2r4','c3r4'],['c3r4','c4r4'],['c4r4','c5r4'],['c2r4','c2r5'],['c4r4','c4r5'],['start','c2r5'],['start','c4r5']], start: { id: 'start' } },
  { sourceTileGuid: 'd10a24', roomSlots: [['c2r0',1],['c3r0',0],['c4r0',1],['c2r1',1],['c3r1',0],['c2r2',0],['c3r2',0],['c4r2',0],['c1r3',0],['c2r3',0],['c3r3',0],['c4r3',0],['c5r3',0],['c1r4',0],['c3r4',0],['c5r4',0]].map(([sourceLocalSlotId,bossCandidate]) => ({ sourceLocalSlotId: String(sourceLocalSlotId), bossCandidate: Boolean(bossCandidate) })), corridorEdges: [['c2r0','c3r0'],['c3r0','c4r0'],['c3r0','c3r1'],['c2r1','c3r1'],['c3r1','c3r2'],['c2r2','c3r2'],['c3r2','c4r2'],['c2r2','c2r3'],['c4r2','c4r3'],['c1r3','c2r3'],['c2r3','c3r3'],['c3r3','c4r3'],['c4r3','c5r3'],['c1r3','c1r4'],['c3r3','c3r4'],['c5r3','c5r4'],['start','c3r4']], start: { id: 'start' } },
];
export const COMMUNITY_RUNTIME_LAYOUTS = layoutSource.map(layoutFrom);

const actorsByFamily = { templars: ['templars-impaler', 'templars-warlord'], 'mammoth-cyst': ['mammoth-cyst', 'white-cell-stalk'], 'shuffling-horror': ['shuffling-horror', 'cultist-priest', 'malignant-growth'] } as const;
export const COMMUNITY_RUNTIME_GUARDIANS: DarkestDungeonGuardianDefinition[] = Object.entries(actorsByFamily).map(([family, actors]) => ({ id: `community-dd-guardian-family-${family}`, family: family as DarkestDungeonGuardianDefinition['family'], name: `Community ${family}`, roomDefinitionId: `community-dd-room-${family}`, actorDefinitionIds: actors.map((actor) => `community-dd-actor-${actor}`), officialDataStatus: 'partial', enabledInOfficialPool: false }));
const normalizedField = (value: unknown, sourceReference: string[]) => ({ value, evidenceType: 'confirmed_from_visual', sourceReference, confidence: 'high', eligibleForPendingImport: true, status: 'confirmed' });
const actorSource = [
  ['tierB-templars-impaler',77,'asset:efa5a4:face',['torment','body-slam','revelation'],[[[1,2],1],[[3,4],3],[[5,6,7,8,9,10],2]]],
  ['tierB-templars-warlord',66,'asset:f88d6a:face',['torment','stinger-shot','revelation'],[[[1,2,3,4,5],1],[[6,7,8,9,10],3]]],
  ['tierB-mammoth-cyst',109,'asset:c4a35e:face',['bulging-gaze','digestion','revivify'],[[[1,2,3,4],1],[[5,6,7,8],2],[[9,10],3]]],
  ['tierB-white-cell-stalk',16,'asset:1fb052:face',['reconstitute','displace','teleport'],[[[1,2,3],1],[[4,5,6,7],2],[[8,9,10],3]]],
  ['tierB-shuffling-horror',109,'asset:ccf3dc:face',['lacerate','undulations','echoing-disassembly'],[[[1,2,3,4,5,6,7],1],[[8,9,10],2]]],
  ['tierB-cultist-priest',26,'asset:1b261d:face',['death-lash','the-finger'],[[[1,2,3,4,5,6],1],[[7,8,9,10],2]]],
  ['tierB-malignant-growth',28,'asset:a34fbd:face',['maul-the-flesh','daze-the-mind'],[[[1,2,3,4,5],1],[[6,7,8,9,10],2]]],
] as const;
export const COMMUNITY_RUNTIME_GUARDIAN_ACTORS = actorSource.map(([requirementId, maxHp, source, skills, ranges]) => ({
  id: `community-dd-actor-${requirementId.replace(/^tierB-/, '')}`,
  requirementId,
  fields: {
    maxHp: normalizedField(maxHp, [source]),
    skillIds: normalizedField(skills.map((sourceLocalSkillId, index) => ({ sourceLocalSkillId, printedNumber: index + 1 })), [source]),
    d10SkillTable: normalizedField([{ stances: ['aggressive','defensive','ranged','support'], ranges: ranges.map(([rolls, printedSkillNumber]) => ({ rolls, printedSkillNumber })) }], [source]),
  },
  sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' as const,
  enabledInOfficialPool: false as const,
}));

const finalFormSource: Record<FinalFormId, { maxHp: number; source: string; skills: string[] }> = {
  'ancestor-first-form': { maxHp: 50, source: 'asset:d99c50:face', skills: ['perfect-replication','imperfect-reproduction','time-heals-all'] },
  'ancestor-second-form': { maxHp: 166, source: 'asset:1825b7:face', skills: ['refashion-them','unmake-them-all','embrace-futility'] },
  'gestating-heart': { maxHp: 100, source: 'asset:eed6cd:face', skills: ['dispersion'] },
  'heart-of-darkness': { maxHp: 250, source: 'asset:21bbaf:face', skills: ['know-this','puncture','dissolution'] },
};
export const COMMUNITY_RUNTIME_FINAL_FORMS: FinalFormDefinition[] = (Object.keys(finalFormSource) as FinalFormId[]).map((formId) => {
  const source = finalFormSource[formId];
  return { id: `community-dd-final-form-${formId}`, formId, name: formId, spawnRule: 'standard', skippable: formId !== 'heart-of-darkness', maxHp: source.maxHp, skillIds: source.skills.map((skill) => `community-dd-skill-${skill}`), attendantActorDefinitionIds: [], officialDataStatus: 'partial', enabledInOfficialPool: false, sourceReference: source.source };
});
const monsterSource = [
  ['antibody',[["a0b399",46032],["4f2825",46031],["351f3c",46033]]],
  ['ascended-brawler',[["9d16dc",46013],["15687c",46012],["849849",46011]]],
  ['ascended-witch',[["23df79",46016],["4cba93",46015],["2037a8",46014]]],
  ['cultist-priest',[["36d6ad",46021],["1b261d",46020],["0ba2f8",46022]]],
  ['defensive-growth',[["014fb5",46035],["861ed6",46034],["ed4bc0",46036]]],
  ['flesh-hound',[["dc3db6",46027],["b2ab62",46026]]],
  ['malignant-growth',[["4a8b06",46024],["a34fbd",46023],["f06594",46025]]],
  ['polyp',[["c6f26c",46028],["1b182b",46030],["47d664",46029]]],
  ['rapturous-cultist',[["6c46af",46018],["42cb11",46017],["ec3703",46019]]],
] as const;
export const COMMUNITY_RUNTIME_MONSTER_COMPOSITION = monsterSource.map(([sourceLocalMonsterDefinitionId, members]) => ({ id: `community-dd-monster-${sourceLocalMonsterDefinitionId}`, sourceLocalMonsterDefinitionId, level: 3 as const, count: members.length, physicalInstances: members.map(([guid, cardId]) => ({ guid, cardId, sourceReference: `tts:${guid}` })) }));

const roomRequirementIds = ['tierB-templars-room','tierB-mammoth-cyst-room','tierB-shuffling-horror-room','tierB-ancestor-room'] as const;
const communityRooms = roomRequirementIds.map((requirementId) => ({ id: `community-dd-${requirementId.replace(/^tierB-/, '')}`, requirementId, sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' as const, enabledInOfficialPool: false as const }));
const finalEncounterRequirementIds = ['tierB-ancestor-room','tierB-ancestor-room-tile','tierB-ancestor-first-form','tierB-perfect-reflection','tierB-imperfect-reflection','tierB-ancestor-second-form','tierB-absolute-nothingness','tierB-gestating-heart','tierB-heart-of-darkness','tierB-come-unto-your-maker'] as const;
const communityFinalEncounterRecords = finalEncounterRequirementIds.map((requirementId) => ({ id: `community-dd-${requirementId.replace(/^tierB-/, '')}`, requirementId, sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' as const, enabledInOfficialPool: false as const }));

const stableHash = (text: string): string => { let hash = 5381; for (let index = 0; index < text.length; index += 1) hash = ((hash << 5) + hash + text.charCodeAt(index)) | 0; return (hash >>> 0).toString(16).padStart(8, '0'); };
export function computeCommunityReferenceContentHash(sourcePackageSha256: string): string { return stableHash(JSON.stringify({ profileId: COMMUNITY_REFERENCE_PROFILE_ID, sourcePackageSha256, normalizedCorpusHash: COMMUNITY_REFERENCE_SOURCE_SHA256, bindingCount: 300, version: 1, blockerCodes: COMMUNITY_RUNTIME_BLOCKERS.map((item) => item.code) })); }
export const COMMUNITY_REFERENCE_CONTENT_HASH = computeCommunityReferenceContentHash(COMMUNITY_REFERENCE_SOURCE_SHA256);

export const COMMUNITY_REFERENCE_RUNTIME_PROFILE = {
  profileId: COMMUNITY_REFERENCE_PROFILE_ID, sourceAuthority: 'COMMUNITY_RETAIL_REFERENCE' as const, sourcePackageSha256: COMMUNITY_REFERENCE_SOURCE_SHA256, contentHash: COMMUNITY_REFERENCE_CONTENT_HASH,
  quests: COMMUNITY_RUNTIME_QUESTS, layouts: COMMUNITY_RUNTIME_LAYOUTS, guardianFamilies: COMMUNITY_RUNTIME_GUARDIANS, guardianActors: COMMUNITY_RUNTIME_GUARDIAN_ACTORS, rooms: communityRooms, finalEncounterRecords: communityFinalEncounterRecords, finalForms: COMMUNITY_RUNTIME_FINAL_FORMS, monsterComposition: COMMUNITY_RUNTIME_MONSTER_COMPOSITION,
  unresolvedRules: Object.fromEntries(COMMUNITY_RUNTIME_BLOCKERS.map((item) => [item.code, null])) as Record<CommunityRuntimeBlockerCode, unknown>,
  runtimeBlockers: COMMUNITY_RUNTIME_BLOCKERS,
  capabilities: { questPool: 'ready', layoutPool: 'ready', contentSnapshot: 'ready', guardian: { templars: 'partial', mammothCyst: 'ready', shufflingHorror: 'ready' }, monsterDeck: { definitions: 'ready', randomDraw: 'blocked' }, finalEncounter: { ancestorFirst: 'ready', ancestorSecond: 'partial', gestatingHeart: 'partial', heartOfDarkness: 'partial' }, fullActFourPlayable: false },
} as const;

export type CommunitySourceBlockedResult = { ok: false; kind: 'community-source-blocked'; blocker: CommunityRuntimeBlocker };
export function blockCommunityOperation(code: CommunityRuntimeBlockerCode): CommunitySourceBlockedResult { const active = COMMUNITY_RUNTIME_BLOCKERS.find((item) => item.code === code); if (!active) throw new Error(`Unknown Community runtime blocker: ${code}`); return { ok: false, kind: 'community-source-blocked', blocker: active }; }
export function drawCommunityMonster(): CommunitySourceBlockedResult { return blockCommunityOperation('MONSTER_DECK_DRAW_POLICY_UNRESOLVED'); }

/** Proves a setup came through the persisted production commands, not direct state injection. */
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
  const candidate = profile as typeof COMMUNITY_REFERENCE_RUNTIME_PROFILE;
  const errors: string[] = [];
  const definitions: Array<{ id: string; enabledInOfficialPool?: boolean }> = [...candidate.quests, ...candidate.layouts, ...candidate.guardianFamilies, ...candidate.guardianActors, ...candidate.rooms, ...candidate.finalForms];
  const expectedCodes = COMMUNITY_RUNTIME_BLOCKERS.map((item) => item.code);
  if (candidate.sourceAuthority !== 'COMMUNITY_RETAIL_REFERENCE' || candidate.sourcePackageSha256 !== COMMUNITY_REFERENCE_SOURCE_SHA256) errors.push('source authority or accepted package SHA mismatch');
  if (candidate.quests.length !== 3 || candidate.layouts.length !== 2 || candidate.guardianFamilies.length !== 3 || candidate.guardianActors.length !== 7 || candidate.rooms.length !== 4 || candidate.finalEncounterRecords.length !== 10) errors.push('runtime projection counts mismatch');
  if (candidate.monsterComposition.reduce((total, monster) => total + monster.physicalInstances.length, 0) !== 26 || candidate.monsterComposition.length !== 9) errors.push('monster composition must be 26 physical / 9 logical');
  if (definitions.some((definition) => !definition.id.startsWith('community-') || definition.id.startsWith('prototype-') || definition.enabledInOfficialPool !== false)) errors.push('Community definition identity or official-pool isolation failure');
  if (candidate.finalForms.some((form) => form.officialDataStatus === 'verified')) errors.push('Community Final Forms must not masquerade as official verified data');
  if (candidate.runtimeBlockers.length !== 5 || candidate.runtimeBlockers.some((item, index) => item.code !== expectedCodes[index]) || expectedCodes.some((code) => candidate.unresolvedRules[code] !== null)) errors.push('five unresolved source rules must remain explicit null blockers');
  if (candidate.capabilities.monsterDeck.randomDraw !== 'blocked' || candidate.capabilities.fullActFourPlayable !== false) errors.push('Community runtime must fail closed at unresolved boundaries');
  if (candidate.contentHash !== computeCommunityReferenceContentHash(candidate.sourcePackageSha256)) errors.push('content hash is not pinned to the accepted source package SHA');
  if (candidate.quests.some((quest) => !quest.sourceReference || !quest.guardianDefinitionId.startsWith('community-') || quest.skippedFinalFormId === null || quest.skippedFinalFormId === ('heart-of-darkness' as SkippableFinalFormId)) || candidate.layouts.some((layout) => !layout.sourceReference) || candidate.finalForms.some((form) => !form.sourceReference)) errors.push('runtime mappings or source references are incomplete');
  return errors;
}
