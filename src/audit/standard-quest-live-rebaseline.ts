import { COMMUNITY_SOURCE_QUESTS, COMMUNITY_QUEST_CAPABILITIES, COMMUNITY_QUEST_RUNTIME_ADAPTERS, COMMUNITY_QUEST_PRODUCTION_PROOFS, COMMUNITY_RUNTIME_QUESTS, FAMILY_TRINKETS_ID, TAINTED_TRINKETS_ID, implementedQuestPrimitives } from '../data/community-reference/production-runtime';
import { PRODUCTION_PROOF_REGISTRY } from './production-proof-registry';
import { restAllocationSemanticsImplemented, semanticContractAcceptanceErrors } from './rest-semantic-contract';
import { measureTrinketDeckCoverage } from './level2-trinket-deck';

const unique = (xs: string[]) => [...new Set(xs)].sort();
export function buildStandardQuestLiveRebaseline() {
  // The locked 75-card census includes Face the Threat! (questType=boss).
  // Match the source-set boundary, not the narrower questType field.
  const quests = COMMUNITY_SOURCE_QUESTS.map(source => {
    const c = COMMUNITY_QUEST_CAPABILITIES.find(c => c.definitionId === source.id)!;
    const restGate = Number(source.firewood.tokens) > 0 && !restAllocationSemanticsImplemented();
    const requiredDeck = source.id === FAMILY_TRINKETS_ID ? 2 : source.id === TAINTED_TRINKETS_ID ? 3 : null;
    const deck = requiredDeck ? measureTrinketDeckCoverage(requiredDeck) : null;
    const literalComplete = source.unresolvedFields.length === 0 && c.sourceSupported;
    const interpretationComplete = literalComplete && !c.requiredPrimitives.includes('SOURCE_SEMANTIC_UNRESOLVED') && !c.semanticObligations.some(o => o.implementationStatus === 'SOURCE_UNRESOLVED');
    const sourceGates = [ ...(restGate ? ['REST_INSUFFICIENT_RECOVERY_CAPACITY'] : []), ...(deck && !deck.completeForRandomDraw ? [`BLOCKED_BY_LEVEL_${requiredDeck}_TRINKET_SOURCE_DECK`] : []), ...(!interpretationComplete ? ['QUEST_SOURCE_SEMANTIC_GAP'] : []) ];
    const downstreamRuntimeBlockers = unique([...c.missingPrimitives.filter(p => p !== 'QUEST_REST_ALLOCATION_SEMANTICS' && !p.startsWith('LEVEL_') && p !== 'SOURCE_SEMANTIC_UNRESOLVED'), ...c.semanticObligations.filter(o => o.implementationStatus !== 'IMPLEMENTED').map(o => o.runtimePrimitive ?? `UNBOUND_CATEGORY:${o.semanticCategory}`)]);
    const proofComplete = c.productionProofComplete && c.saveReplayProofComplete && c.selectorReachable && c.productionUiProofComplete;
    const roots = unique([...(restGate ? ['REST_SOURCE_SCOPE'] : []), ...(deck && !deck.completeForRandomDraw ? ['TRINKET_DECK_DEPENDENCY'] : []), ...(!interpretationComplete ? ['QUEST_SOURCE_SEMANTIC_GAP'] : [])]);
    const productionReady = c.productionReady && sourceGates.length === 0;
    const rootBlockerFamily = productionReady ? 'NONE_READY' : roots.length > 1 ? 'MULTI_ROOT' : roots[0] ?? (downstreamRuntimeBlockers.length || !c.runtimeSemanticComplete || !c.adapterComplete ? 'QUEST_RULE_RUNTIME_PRIMITIVE' : 'PROOF_ONLY');
    return { definitionId: source.id, name: source.printedName, region: source.region, level: source.level, sourceSupported: c.sourceSupported, literalComplete, sourceTimingComplete: interpretationComplete && !restGate,
      SOURCE_LITERAL_COMPLETE: literalComplete, SOURCE_RULE_INTERPRETATION_COMPLETE: interpretationComplete && !restGate, RUNTIME_BINDING_COMPLETE: c.runtimeSemanticComplete,
      runtimeSemanticComplete: c.runtimeSemanticComplete, adapterComplete: c.adapterComplete, proofComplete, productionUiProofComplete: c.productionUiProofComplete, productionReady,
      productionStatus: productionReady ? 'PRODUCTION_READY' : sourceGates.length ? 'SOURCE_BLOCKED' : c.productionStatus,
      evaluatorProductionStatus: c.productionStatus, rootBlockerFamily, rootBlockerFamilies: productionReady ? ['NONE_READY'] : roots.length ? roots : [rootBlockerFamily], sourceGates, downstreamRuntimeBlockers,
      wholeQuestReadyGainIfRuntimeImplemented: Number(!productionReady && !sourceGates.length && c.adapterComplete && proofComplete && !downstreamRuntimeBlockers.some(p => p.startsWith('UNBOUND_CATEGORY:'))),
      firewoodTokens: Number(source.firewood.tokens), restingPoints: Number(source.firewood.restingPoints), wouldOtherwiseUseSimpleAdapter: source.specialRules.length === 0 && Boolean(COMMUNITY_QUEST_RUNTIME_ADAPTERS[source.id]),
      requiredDeck, deck, readinessDependency: requiredDeck ? `LEVEL_${requiredDeck}_TRINKET_SOURCE_DECK_COMPLETE` : null,
      readinessDependencyAudit: requiredDeck && !c.requiredPrimitives.includes(`LEVEL_${requiredDeck}_TRINKET_SOURCE_DECK_COMPLETE`) ? 'MISSING_READINESS_DEPENDENCY' : 'PRESENT_OR_NOT_REQUIRED',
      randomDrawPolicy: requiredDeck ? 'SOURCE_COMPLETE_DECK_ONLY' : null, proofAvailability: COMMUNITY_QUEST_PRODUCTION_PROOFS[source.id] ?? null,
      obligations: c.semanticObligations, requiredPrimitives: c.requiredPrimitives };
  });
  const primitiveNames = unique(quests.flatMap(q => q.downstreamRuntimeBlockers).filter(p => !p.startsWith('UNBOUND_CATEGORY:')));
  const roi = primitiveNames.map(primitive => {
    const affected = quests.filter(q => q.downstreamRuntimeBlockers.includes(primitive));
    const alone = affected.filter(q => q.wholeQuestReadyGainIfRuntimeImplemented && q.downstreamRuntimeBlockers.length === 1);
    const companion = affected.filter(q => q.wholeQuestReadyGainIfRuntimeImplemented);
    return { primitive, affectedQuestCount: affected.length, affectedQuestIds: affected.map(q => q.definitionId), sourceGateCount: affected.filter(q => q.sourceGates.length).length,
      otherRuntimeBlockerCount: affected.filter(q => q.downstreamRuntimeBlockers.some(p => p !== primitive)).length, cardsPromotedIfImplementedAlone: alone.length, cardsPromotedIfImplementedAloneIds: alone.map(q => q.definitionId), cardsPromotedWithKnownCompanionPrimitives: companion.length,
      companionPrimitives: unique(companion.flatMap(q => q.downstreamRuntimeBlockers).filter(p => p !== primitive)), crossQuestReuse: affected.length, implementationComplexityClass: 'REQUIRES_SOURCE_EXACT_CONSUMER_AND_BINDING', recommendedPriority: alone.length > 1 ? 'P0' : alone.length ? 'P1' : companion.length ? 'P2' : affected.every(q => q.sourceGates.length) ? 'P3' : 'P4' };
  }).sort((a,b) => b.cardsPromotedIfImplementedAlone - a.cardsPromotedIfImplementedAlone || a.primitive.localeCompare(b.primitive));
  const categories = unique(quests.flatMap(q => q.obligations.map(o => o.semanticCategory))).map(category => {
    const affected = quests.filter(q => q.obligations.some(o => o.semanticCategory === category && o.implementationStatus !== 'IMPLEMENTED'));
    return { category, affectedQuestCount: affected.length, affectedQuestIds: affected.map(q => q.definitionId), sourceRulesExact: affected.every(q => q.SOURCE_RULE_INTERPRETATION_COMPLETE), wholeQuestReadyGain: affected.filter(q => q.wholeQuestReadyGainIfRuntimeImplemented).length,
      sharedPrimitiveReuse: unique(affected.flatMap(q => q.downstreamRuntimeBlockers)), existingRuntimeOverlap: affected.filter(q => q.obligations.some(o => o.runtimeBindingId)).length, saveReplayComplexity: 'SOURCE_TARGET_TIMING_REQUIRES_SPECIFICATION', UIComplexity: 'NOT_YET_SPECIFIED', crossRegionReuse: unique(affected.map(q => q.region)).length };
  });
  const selected = roi.find(r => r.cardsPromotedIfImplementedAlone > 0);
  const decision = { selectedFamily: selected?.primitive ?? 'NO_IMMEDIATE_SOURCE_SAFE_CANDIDATE', selectedPrimitives: selected ? [selected.primitive] : [], candidateQuestIds: selected?.cardsPromotedIfImplementedAloneIds ?? [], expectedReadyGain: selected?.cardsPromotedIfImplementedAlone ?? 0,
    whySelected: selected ? 'Maximum whole-Quest gain with existing exact adapter and production proofs' : 'No primitive alone closes live semantic bindings, adapter and production proof obligations. Source-exact literals alone do not establish a precise runtime contract.',
    whyAlternativesDeferred: roi.map(r => ({ primitive: r.primitive, wholeQuestGain: r.cardsPromotedIfImplementedAlone, sourceGateCount: r.sourceGateCount, otherRuntimeBlockerCount: r.otherRuntimeBlockerCount })), sourceRisks: ['Rest insufficientRecoveryCapacity unresolved', 'Level 2/3 full source decks incomplete', 'Generic special rules have unbound category obligations; no inferred target/timing contract'],
    requiredProductionProof: ['source-exact runtime', 'save-replay', 'selector', 'production-ui E2E'], nextAction: selected ? 'C1C22 implementation after precise source/consumer specification' : 'C1C22 Boss / Encounter inventory and source-contract audit; no Quest gameplay implementation selected',
    standardQuestStatus: 'MIXED_SOURCE_GATES_AND_RUNTIME_BINDING_GAPS', warning: 'Zero immediate promotion does not mean all Standard Quests have unknown source rules.' };
  const ids = (predicate: (q: typeof quests[number]) => boolean) => quests.filter(predicate).map(q => q.definitionId).sort();
  return { sourceDefinitionCount: quests.length, productionReadyCount: ids(q => q.productionReady).length, notReadyCount: ids(q => !q.productionReady).length,
    sourceGateCount: ids(q => !!q.sourceGates.length).length, runtimeOnlyBlockedCount: ids(q => !q.productionReady && !q.sourceGates.length && q.rootBlockerFamily !== 'PROOF_ONLY').length, proofOnlyBlockedCount: ids(q => q.rootBlockerFamily === 'PROOF_ONLY').length,
    readyIds: ids(q => q.productionReady), sourceGatedIds: ids(q => !!q.sourceGates.length), runtimeOnlyBlockedIds: ids(q => !q.productionReady && !q.sourceGates.length && q.rootBlockerFamily !== 'PROOF_ONLY'), proofOnlyBlockedIds: ids(q => q.rootBlockerFamily === 'PROOF_ONLY'),
    primitiveFrequency: unique(quests.flatMap(q => q.requiredPrimitives).filter(p => !implementedQuestPrimitives().has(p))).map(primitive => ({ primitive, affectedQuestCount: quests.filter(q => q.requiredPrimitives.includes(primitive)).length, affectedQuestIds: ids(q => q.requiredPrimitives.includes(primitive)), classification: primitive === 'QUEST_REST_ALLOCATION_SEMANTICS' || primitive.startsWith('LEVEL_') ? 'SOURCE_DEPENDENCY_NOT_ENGINE_MISSING' : 'RUNTIME_PRIMITIVE' })),
    implementedPrimitives: [...implementedQuestPrimitives()].sort(), restAcceptanceErrors: semanticContractAcceptanceErrors(), quests, roi, categories, decision, proofRegistry: PRODUCTION_PROOF_REGISTRY };
}
export function assertStandardQuestLiveRebaseline(a: ReturnType<typeof buildStandardQuestLiveRebaseline>) {
  const expected = buildStandardQuestLiveRebaseline();
  if (a.sourceDefinitionCount !== 75 || a.quests.length !== 75 || new Set(a.quests.map(q => q.definitionId)).size !== 75) throw new Error('C1C21 exact 75 unique census');
  if (JSON.stringify(a) !== JSON.stringify(expected)) throw new Error('C1C21 live source/runtime/proof/ROI binding drift');
  const selector = COMMUNITY_RUNTIME_QUESTS.filter(q => a.quests.some(row => row.definitionId === q.id)).map(q => q.id).sort();
  if (JSON.stringify(a.readyIds) !== JSON.stringify(selector)) throw new Error('C1C21 selector mismatch');
}
