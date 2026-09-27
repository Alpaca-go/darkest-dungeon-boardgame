import inventory from '../../docs/data/complete-edition/complete-edition-raw-inventory.json';
import { NORMALIZED_CORPUS } from '../data/darkest-dungeon/community-reference/normalized';
import { COMMUNITY_RUNTIME_GUARDIAN_ACTORS, COMMUNITY_RUNTIME_FINAL_FORMS } from '../data/darkest-dungeon/community-reference/runtime-profile';
import { COMMUNITY_SOURCE_QUESTS, COMMUNITY_QUEST_CAPABILITIES } from '../data/community-reference/production-runtime';
import { buildStandardQuestLiveRebaseline } from './standard-quest-live-rebaseline';

export const BOSS_ENCOUNTER_CATEGORIES = ['Bosses', 'Boss Quests', 'Threat Cards', 'Encounter / Event Content', 'Guardian Cards', 'Final Encounter Cards'] as const;
const unique = (xs: string[]) => [...new Set(xs)].sort();
const path = (p: string) => '/' + p.replace(/^\/+/, '');
export function buildBossEncounterLiveInventory() {
  const questAudit = buildStandardQuestLiveRebaseline();
  const cards = inventory.objects.filter(o => o.isCard && BOSS_ENCOUNTER_CATEGORIES.some(c => c === o.runtimeCategory)).map(o => {
    const sourceQuest = COMMUNITY_SOURCE_QUESTS.find(q => q.sourceReferences.includes('c1a-source:tts-path:' + o.ttsPath));
    const liveQuest = questAudit.quests.find(q => q.definitionId === sourceQuest?.id);
    // Requirement assets also cite rooms, quests and supporting cards. Such citations
    // are references, not proof that every cited card implements the requirement.
    const references = NORMALIZED_CORPUS.requirements.filter(r => r.assets.some(a => path(a.ttsPath) === o.ttsPath));
    const cardDefinitions = references.filter(r => ['battle-card','special-card'].includes(r.componentType));
    const act4 = o.runtimeCategory === 'Guardian Cards' || o.runtimeCategory === 'Final Encounter Cards';
    const rootBlockerFamily = sourceQuest ? (liveQuest?.sourceGates.length ? 'EXISTING_QUEST_SOURCE_GATE' : 'EXISTING_QUEST_WORKSTREAM') : act4 ? 'EXISTING_ACT4_REFERENCE_SCOPE' : 'PRINTED_DEFINITION_NOT_BOUND';
    const family = o.runtimeCategory === 'Bosses' ? o.containerHierarchy.map((h: { nickname: string }) => h.nickname).filter(Boolean).at(-1) ?? 'UNNAMED_BOSS_FAMILY' : o.runtimeCategory;
    return { physicalIdentity: o.physicalIdentity, sourceObjectGuid: o.sourceObjectGuid, ttsPath: o.ttsPath, category: o.runtimeCategory, family,
      nickname: o.nickname, isState: o.isState, physicalCount: o.physicalCount, visualIdentity: o.visualIdentity, logicalIdentityBasis: o.logicalIdentityBasis,
      cardId: o.cardId, deckId: o.deckId, cardIndex: o.cardIndex, faceUrl: o.faceUrl, backUrl: o.backUrl, numWidth: o.numWidth, numHeight: o.numHeight, uniqueBack: o.uniqueBack,
      historicalDefinitionStatus: o.definitionStatus, historicalSourceBlockers: o.sourceBlockers,
      questDefinitionId: sourceQuest?.id ?? null, liveQuestProductionStatus: liveQuest?.productionStatus ?? null, questSourceGates: liveQuest?.sourceGates ?? [],
      normalizedCardDefinitionReferences: cardDefinitions.map(r => ({ definitionId: r.requirementId, componentType: r.componentType, normalizedStatus: r.status })),
      supportingRequirementReferences: references.filter(r => !cardDefinitions.includes(r)).map(r => r.requirementId),
      literalDefinitionBound: Boolean(sourceQuest && sourceQuest.unresolvedFields.length === 0),
      definitionBindingStatus: sourceQuest ? 'LIVE_QUEST_DEFINITION' : act4 ? 'ACT4_REFERENCED_SEPARATE_ACCEPTANCE_REQUIRED' : 'NOT_EXTRACTED',
      inventoryTagSupersededByLiveQuest: Boolean(sourceQuest && o.definitionStatus === 'not-extracted'),
      rootBlockerFamily, productionReady: liveQuest?.productionReady ?? (act4 ? null : false),
      readinessAssessment: sourceQuest ? 'LIVE_QUEST_EVALUATOR' : act4 ? 'NOT_REASSESSED_USE_EXISTING_ACT4_GATES' : 'NO_SOURCE_DEFINITION_NO_PRODUCTION_READY_CLAIM',
      immediateRuntimeReadyGain: 0,
      requiredSourceExtraction: act4 || sourceQuest ? [] : ['printed card subtype', 'printed name and level/variant', 'full front/back effects', 'target and timing', 'deck membership and copy rules', 'source provenance and asset hashes'],
    };
  });
  const categories = BOSS_ENCOUNTER_CATEGORIES.map(category => {
    const rows = cards.filter(c => c.category === category);
    return { category, cardObjectCount: rows.length, physicalCardCount: rows.filter(c => !c.isState).reduce((s,c) => s + c.physicalCount,0), stateCount: rows.filter(c => c.isState).length,
      visualIdentityCount: unique(rows.flatMap(c => c.visualIdentity ? [c.visualIdentity] : [])).length,
      printedDefinitionNotBoundCount: rows.filter(c => c.rootBlockerFamily === 'PRINTED_DEFINITION_NOT_BOUND').length,
      liveQuestBoundCount: rows.filter(c => c.questDefinitionId).length, act4ReferenceCount: rows.filter(c => c.rootBlockerFamily === 'EXISTING_ACT4_REFERENCE_SCOPE').length,
      missingCategoryDoesNotProveAbsence: category === 'Threat Cards', physicalIds: rows.map(c => c.physicalIdentity).sort() };
  });
  const families = unique(cards.map(c => c.family)).map(family => {
    const rows = cards.filter(c => c.family === family);
    return { family, cardObjectCount: rows.length, cardIds: rows.map(c => c.physicalIdentity).sort(), sourceRulesExact: rows.every(c => c.literalDefinitionBound),
      wholeReadyGainFromRuntimeAlone: 0, runtimeComplexity: 'UNSPECIFIABLE_UNTIL_PRINTED_SOURCE_BOUND', downstreamDependencies: unique(rows.flatMap(c => c.questSourceGates)),
      sourceExtractionRequiredCount: rows.filter(c => c.requiredSourceExtraction.length).length };
  });
  const eventCards = cards.filter(c => c.category === 'Encounter / Event Content');
  return { phase: '11A.4-C1C-22', scope: 'Locked Complete Edition physical inventory: ordinary Boss families, Boss Quest, Hamlet Events; Guardian/Final physical references preserved separately',
    cardObjectCount: cards.length, newContentProductionReadyCount: 0, newContentSourceBlockedCount: cards.filter(c => c.rootBlockerFamily === 'PRINTED_DEFINITION_NOT_BOUND').length,
    existingQuestSourceGatedCount: cards.filter(c => c.rootBlockerFamily === 'EXISTING_QUEST_SOURCE_GATE').length, existingAct4ReferenceCount: cards.filter(c => c.rootBlockerFamily === 'EXISTING_ACT4_REFERENCE_SCOPE').length,
    cards, categories, families,
    existingAct4Runtime: { guardianActorIds: COMMUNITY_RUNTIME_GUARDIAN_ACTORS.map(x => x.id), finalFormIds: COMMUNITY_RUNTIME_FINAL_FORMS.map(x => x.id), note: 'Runtime actor/form counts are NOT physical-card Ready counts. Retain independent existing acceptance gates; supporting citations and normalized partial status do not override live Act4 truth.' },
    nextDecision: { selectedImplementationFamily: null, selectedImplementationPrimitives: [] as string[], candidateImplementationIds: [] as string[], expectedReadyGain: 0,
      reason: 'Ordinary Boss and Event printed definitions are unbound. The only bound Boss Quest already has the unresolved Rest source gate. Existing Act4 runtime is a separate accepted workstream; no new implementation gain established.',
      selectedSourceIntakeFamily: 'HAMLET_EVENT_PRINTED_DEFINITIONS', sourceIntakeCandidatePhysicalIds: eventCards.map(c => c.physicalIdentity).sort(),
      sourceIntakeReason: 'A bounded 16-card deck in one explicit Hamlet Event container; smaller extraction scope than the 231-card ordinary Boss families, whose threat/ability/battle subtypes remain unidentified. This selects source extraction, not gameplay priority or guaranteed Ready gain.',
      nextAction: 'C1C23 source intake: acquire and hash original front/back sheets, crop every Event card using locked grid metadata, independently transcribe all rules and deck semantics, then rerun runtime ROI. Do not implement effects from nickname/container or mock Hamlet events.',
      requiredProofBeforeProduction: ['source-exact definition and semantics', 'engine consumer and adapter', 'save/replay', 'selector', 'production-runtime proof', 'production-ui E2E'],
      unresolvedRisks: ['Zero Threat Cards category rows does not prove threat cards absent: ordinary Boss subtypes are unclassified', 'visual identity is not a semantic definition', 'mock Hamlet events and prototype bosses are not Complete Edition source evidence', 'C1C21 full verification remains failed for C1C13/12/11 reload timeouts and C1C3 selector click timeouts'] },
    questReadyIds: COMMUNITY_QUEST_CAPABILITIES.filter(c => c.productionReady).map(c => c.definitionId).sort() };
}
export function assertBossEncounterLiveInventory(a: ReturnType<typeof buildBossEncounterLiveInventory>) {
  const expected = buildBossEncounterLiveInventory();
  if (new Set(a.cards.map(c => c.physicalIdentity)).size !== a.cards.length) throw new Error('C1C22 duplicate physical identity');
  if (JSON.stringify(a) !== JSON.stringify(expected)) throw new Error('C1C22 live inventory/source/dependency/decision binding drift');
}
