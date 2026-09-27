import sources from '../data/community-reference/trinkets/data.json' with { type: 'json' };
import { COMMUNITY_TRINKET_CAPABILITIES } from '../data/community-reference/production-runtime';
import { LEVEL_1_TRINKET_DECK_COVERAGE } from './level1-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from './level2-trinket-deck';
import { LEVEL_3_TRINKET_DECK_COVERAGE } from './level3-trinket-deck';
import { liveTrinketMissingPrimitives } from './trinket-live-runtime-coverage';
import { trinketReadinessInvariantErrors } from './trinket-readiness-invariants';
import { missingModifierConsumers } from './trinket-modifier-consumer-coverage';
import voluntary from '../../docs/data/complete-edition/c1c14-source-gap-freeze.json' with { type: 'json' };
import condition from '../../docs/data/complete-edition/c1c19-condition-charm-feasibility.json' with { type: 'json' };
import wound from '../../docs/data/complete-edition/c1c18-damage-stone-feasibility.json' with { type: 'json' };

export const coreId = (name: string) => `community-trinket-core-${name}`;
export const CORE_READY_NAMES = [
  ['accuracy-stone', 'archers-ring', 'critical-stone', 'sages-book', 'survival-guide', 'warriors-bracer', 'warriors-cap'],
  ['camouflage-cloak', 'campers-helmet', 'dark-bracer', 'solar-bracer'],
  ['defenders-ring', 'scholars-ring', 'snipers-ring', 'warriors-ring'],
] as const;
export const CORE_BLOCKED_NAMES = [
  ['bleed-charm', 'blight-charm', 'caution-cloak', 'damage-stone', 'debuff-charm', 'speed-stone', 'stun-charm'],
  ['bloodthirst-ring', 'book-of-constitution', 'book-of-holiness', 'book-of-relaxation', 'chirurgeons-charm', 'fortunate-armlet', 'protective-padlock'],
  ['berserk-charm', 'book-of-sanity', 'candle-of-life', 'cleansing-crystal', 'dark-crown', 'fasting-seal', 'recovery-charm', 'solar-crown'],
] as const;
export const ROOT_FAMILIES = ['VOLUNTARY_DECLARATION', 'HERO_CAUSED_CONDITION', 'DAMAGE_WOUND', 'HEALING_TRIGGER_SCOPE'] as const;
export type RootFamily = typeof ROOT_FAMILIES[number];
export const ROOT_GATES: Record<RootFamily, { sourceGapId: string; blockerCode: string; sourceStatus: string;
  previousContracts: string[]; reopenCondition: string[]; priority: string }> = {
  VOLUNTARY_DECLARATION: { sourceGapId: 'GENERIC_VOLUNTARY_DECLARATION_SCOPE', blockerCode: 'TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED',
    sourceStatus: voluntary.voluntaryDeclaration.status, previousContracts: ['c1c7-voluntary-declaration-timing-contract.json', 'c1c14-source-gap-freeze.json'], priority: 'P0',
    reopenCondition: ['New authoritative legal declaration contexts and insertion points', 'Battle/non-battle usage epoch, ordering and save/replay scope'] },
  HERO_CAUSED_CONDITION: { sourceGapId: 'HERO_CAUSED_CONDITION_ACTIVE_TIMING', blockerCode: 'HERO_CAUSED_CONDITION_ACTIVE_TIMING_UNRESOLVED',
    sourceStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', previousContracts: ['c1c19-hero-caused-condition-source-contract.json', 'c1c19-condition-charm-feasibility.json'], priority: 'P0',
    reopenCondition: ['Exact hero-skill-hits skill-target and hero-causes-condition declaration timing', 'Resistance/immunity ordering and fully resisted causation', 'Zero-duration lifecycle, singular child selection and multi-condition/cross-copy ordering', 'Independent authoritative durations for all legacy Hero Skill conditions; never duration=amount'] },
  DAMAGE_WOUND: { sourceGapId: 'SUFFER_WOUNDS_AND_HERO_TAKES_DAMAGE', blockerCode: 'SUFFER_WOUNDS_SOURCE_SEMANTICS_UNRESOLVED',
    sourceStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', previousContracts: ['c1c18-wound-semantics-contract.json', 'c1c18-damage-stone-feasibility.json'], priority: 'P1',
    reopenCondition: ['Complete suffer-wounds modifier semantics', 'Exact hero-takes-damage timing and zero-final-Damage applicability', 'Damage/Wound equivalence or distinct pipeline and full battle/campaign trigger scope'] },
  HEALING_TRIGGER_SCOPE: { sourceGapId: 'CHIRURGEON_HEALING_TRIGGER_SCOPE', blockerCode: 'TRINKET_TRIGGER_SCOPE_UNRESOLVED',
    sourceStatus: voluntary.chirurgeonHealingScope.status, previousContracts: ['c1c5r-chirurgeons-trigger-scope.json', 'c1c14-source-gap-freeze.json'], priority: 'P1',
    reopenCondition: ['Authoritative When healing / When healed scope: battle Skill only or explicit other healing surfaces', 'If broader, source/receiver applicability for Rest, Provision, Hamlet, other Trinkets and campaign healing'] },
};

export function buildCoreTerminalAudit() {
  if (condition.productionImplementationAuthorized || condition.productionReadyGain !== 0 || wound.productionReady) throw new Error('Prior freeze drift');
  const core = sources.filter(s => s.contentSet === 'core' && [1, 2, 3].includes(s.level ?? 0));
  const coverages = [LEVEL_1_TRINKET_DECK_COVERAGE, LEVEL_2_TRINKET_DECK_COVERAGE, LEVEL_3_TRINKET_DECK_COVERAGE];
  const cards = core.map(source => {
    const capability = COMMUNITY_TRINKET_CAPABILITIES.find(c => c.definitionId === source.id);
    if (!capability) throw new Error(`Missing live capability ${source.id}`);
    const sides = capability.trinketSemanticObligations ?? [];
    if (sides.length !== 2) throw new Error(`Missing live obligations ${source.id}`);
    const rootFamilies: RootFamily[] = [];
    const triggers = [source.positiveSide.trigger, source.negativeSide.trigger];
    if (triggers.includes('voluntary-declaration')) rootFamilies.push('VOLUNTARY_DECLARATION');
    if (triggers.includes('hero-causes-condition')) rootFamilies.push('HERO_CAUSED_CONDITION');
    if (source.id === coreId('damage-stone')) rootFamilies.push('DAMAGE_WOUND');
    if (triggers.includes('hero-heals') || triggers.includes('hero-is-healed')) rootFamilies.push('HEALING_TRIGGER_SCOPE');
    const rootBlockerFamily = rootFamilies[0] ?? null;
    const gate = rootBlockerFamily ? ROOT_GATES[rootBlockerFamily] : null;
    // Current evaluator only. The normalized runtimeSupport diagnosis is historical.
    const missing = liveTrinketMissingPrimitives(source);
    const nestedStats = (value: unknown): string[] => {
      if (Array.isArray(value)) return value.flatMap(nestedStats);
      if (!value || typeof value !== 'object') return [];
      const object = value as Record<string, unknown>;
      return [...(object.kind === 'modify' && typeof object.stat === 'string' ? [object.stat] : []),
        ...Object.values(object).flatMap(nestedStats)];
    };
    // choose-one options are nested payloads, not an implemented modifier consumer.
    const nestedMissing = [source.positiveSide, source.negativeSide].flatMap(side =>
      missingModifierConsumers(nestedStats(side.effects).map(stat => ({ stat })), side.trigger)
        .map(stat => `TRINKET_MODIFIER_CONSUMER_MISSING:${stat}`));
    const obligations = sides.map(s => ({ side: s.side, implementationStatus: s.implementationStatus,
      trigger: s.trigger, target: s.target, runtimeSliceSemanticComplete: s.runtimeSliceSemanticComplete,
      sourceTimingScopeStatus: s.sourceTimingScopeStatus, triggerScopeComplete: s.triggerScopeComplete,
      blockerCode: s.blockerCode, missingModifierConsumers: s.missingModifierConsumers,
      missingEffectConsumers: s.missingEffectConsumers, semanticMismatches: s.semanticMismatches, proofIds: s.proofIds }));
    const downstream = [...new Set([...missing, ...nestedMissing, ...capability.missingPrimitives,
      ...sides.filter(s => s.implementationStatus !== 'IMPLEMENTED').map(s => `SIDE_SEMANTIC_ADAPTER_PROOF:${s.side}`),
      ...(!capability.adapterComplete ? ['WHOLE_CARD_ADAPTER'] : []),
      ...(!capability.productionProofComplete || !capability.productionUiProofComplete || !capability.saveReplayProofComplete || !capability.selectorReachable ? ['WHOLE_CARD_PROOF_SELECTOR_UI_E2E'] : []),
      ...(rootBlockerFamily === 'HERO_CAUSED_CONDITION' ? ['INDEPENDENT_HERO_SKILL_CONDITION_DURATION', 'CONDITION_TRANSACTION_DURATION_CONSUMER', 'CONDITION_RESISTANCE_CONSUMER'] : []),
      ...(source.id === coreId('debuff-charm') ? ['DEBUFF_DURATION_BOOKKEEPING', 'DEBUFF_TURN_TICK', 'DEBUFF_EXPIRY', 'DEBUFF_RESISTANCE_CONSUMER'] : []),
    ])].sort();
    const sourceGate = gate ? { ...gate, closed: false } : null;
    const hasSourceGate = sourceGate !== null && !sourceGate.closed;
    // Even an optimistic completion of EVERY downstream runtime obligation cannot remove sourceGate.
    const runtimeOnlyReadyGain = !capability.productionReady && !hasSourceGate ? 1 : 0;
    return { definitionId: source.id, printedName: source.printedName, level: source.level,
      productionReady: capability.productionReady, rootFamilies, rootBlockerFamily, sourceGate,
      rootClassificationEvidence: { triggers, sourceReferences: source.sourceReferences, previousContracts: gate?.previousContracts ?? [] },
      obligations, implementedSides: sides.filter(s => s.implementationStatus === 'IMPLEMENTED').map(s => s.side),
      unimplementedSides: sides.filter(s => s.implementationStatus !== 'IMPLEMENTED').map(s => ({ side: s.side, status: s.implementationStatus })),
      liveMissingPrimitives: missing, capabilityMissingPrimitives: capability.missingPrimitives,
      nestedSourceOptionMissingConsumers: [...new Set(nestedMissing)],
      historicalDiagnosisOnly: [source.positiveSide.runtimeSupport.missingCapabilities, source.negativeSide.runtimeSupport.missingCapabilities],
      downstreamRuntimeBlockers: capability.productionReady ? [] : downstream.map(primitive => ({ primitive,
        classification: 'DOWNSTREAM_RUNTIME_BLOCKER', rootSourceGate: gate?.sourceGapId ?? null,
        behindVoluntarySourceGate: rootBlockerFamily === 'VOLUNTARY_DECLARATION' })),
      sourceClosureRequired: gate?.reopenCondition ?? [], runtimeOnlyReadyGain,
      wholeCardReadyGainWithCurrentSources: runtimeOnlyReadyGain,
      recommendedAction: capability.productionReady ? 'PRESERVE_READY' : 'WAIT_FOR_NEW_AUTHORITATIVE_SOURCE',
      readinessEvidence: { adapterComplete: capability.adapterComplete, runtimeSemanticComplete: capability.runtimeSemanticComplete,
        productionProofComplete: capability.productionProofComplete, saveReplayProofComplete: capability.saveReplayProofComplete,
        selectorReachable: capability.selectorReachable, productionUiProofComplete: capability.productionUiProofComplete },
    };
  }).sort((a, b) => a.definitionId.localeCompare(b.definitionId));
  const blocked = cards.filter(c => !c.productionReady);
  const groups = ROOT_FAMILIES.map(rootFamily => ({ rootFamily, ...ROOT_GATES[rootFamily],
    affectedCards: blocked.filter(c => c.rootBlockerFamily === rootFamily).map(c => c.definitionId),
    affectedCardCount: blocked.filter(c => c.rootBlockerFamily === rootFamily).length, newSourceSincePriorPhase: false }));
  const primitiveNames = [...new Set(blocked.flatMap(c => c.downstreamRuntimeBlockers.map(b => b.primitive)))].sort();
  const runtime = primitiveNames.map(primitive => {
    const affected = blocked.filter(c => c.downstreamRuntimeBlockers.some(b => b.primitive === primitive));
    const promoted = affected.filter(c => !c.sourceGate && c.downstreamRuntimeBlockers.every(b => b.primitive === primitive));
    return { primitive, kind: 'RUNTIME_PRIMITIVE', affectedCards: affected.map(c => c.definitionId),
      rootSourceGate: [...new Set(affected.map(c => c.sourceGate!.sourceGapId))].sort(),
      implementableNow: false, cardsPromotedIfImplementedAlone: promoted.map(c => c.definitionId),
      cardsPromotedIfSourceGateClosed: [],
      sourceClosedCounterfactualStatus: 'NOT_ESTABLISHED; source closure does not supply remaining runtime, semantic or proof obligations',
      crossCardReuse: affected.length, priority: 'P3', classification: 'DOWNSTREAM_RUNTIME_BLOCKER_BEHIND_SOURCE_GATE' };
  });
  const partial = [
    { primitive: 'CAUTION_CLOAK_POSITIVE_SCOUT_PREVENT_STRESS', names: ['caution-cloak'], implementableNow: null, note: 'Scout source effect is recorded; full slice feasibility not proven here.' },
    { primitive: 'CROWN_NEGATIVE_RESOLVE_VIRTUE_CHANCE_MINUS_2', names: ['dark-crown', 'solar-crown'], implementableNow: null, note: 'May be independently source-safe in future; no new feasibility promotion in C1C20.' },
    { primitive: 'DAMAGE_STONE_POSITIVE_DAMAGE_PLUS_3', names: ['damage-stone'], implementableNow: true, note: 'C1C18 READY_FOR_IMPLEMENTATION positive preserved.' },
    { primitive: 'CONDITION_CHARM_POSITIVE_SKILL_TARGET', names: ['bleed-charm', 'blight-charm', 'debuff-charm', 'stun-charm'], implementableNow: false, note: 'C1C19 exact Positive timing remains unresolved.' },
  ].map(p => ({ primitive: p.primitive, kind: 'PARTIAL_SLICE', affectedCards: p.names.map(coreId),
    rootSourceGate: [...new Set(p.names.map(n => blocked.find(c => c.definitionId === coreId(n))!.sourceGate!.sourceGapId))],
    implementableNow: p.implementableNow, cardsPromotedIfImplementedAlone: [] as string[], cardsPromotedIfSourceGateClosed: [] as string[],
    sourceClosedCounterfactualStatus: 'NOT_ESTABLISHED; whole-card semantics and production proofs still required',
    crossCardReuse: p.names.length, priority: 'P4', classification: 'DEFERRED_PARTIAL_SLICE', note: p.note }));
  const closure = groups.map(g => ({ primitive: g.sourceGapId, kind: 'SOURCE_CLOSURE', affectedCards: g.affectedCards,
    rootSourceGate: [g.sourceGapId], implementableNow: false, cardsPromotedIfImplementedAlone: [] as string[],
    cardsPromotedIfSourceGateClosed: [], maximumCardsReopenedForEvaluation: g.affectedCardCount,
    crossCardReuse: g.affectedCardCount, priority: g.priority,
    sourceClosedCounterfactualStatus: g.rootFamily === 'HEALING_TRIGGER_SCOPE'
      ? 'Highest isolated unlock; battle-Skill-only scope may nearly promote, but exact payload, proof and selector invariants must be re-evaluated.'
      : 'Reopens evaluation, not automatic Ready promotion.' }));
  return { cards, blocked, groups, runtimeRoi: [...closure, ...runtime, ...partial],
    coverage: { sourceDefinitionCount: cards.length, productionReadyCount: cards.filter(c => c.productionReady).length,
      notReadyCount: blocked.length, levels: coverages,
      immediateWholeCardRuntimeCandidates: blocked.reduce((sum, c) => sum + c.runtimeOnlyReadyGain, 0),
      immediateSourceSafeWholeCardCandidates: blocked.filter(c => !c.sourceGate).length,
      sourceGatedCards: blocked.filter(c => c.sourceGate !== null).length,
      rootPartition: Object.fromEntries(groups.map(g => [g.rootFamily, g.affectedCardCount])),
      readyIds: cards.filter(c => c.productionReady).map(c => c.definitionId),
      notReadyIds: blocked.map(c => c.definitionId), readinessInvariantErrors: trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES),
      sourceGateCompletionSimulation: { assumeAllDownstreamRuntimeImplemented: true,
        resultingReadyCount: cards.filter(c => c.productionReady).length + blocked.reduce((sum, c) => sum + c.runtimeOnlyReadyGain, 0),
        productionReadyRequires: ['whole-card semantic closure', 'adapter', 'runtime', 'proof', 'selector', 'production UI E2E'] },
      phaseExitDecision: 'STOP_SPECULATIVE_CORE_TRINKET_RUNTIME_UNTIL_NEW_AUTHORITATIVE_SOURCE' },
  };
}

/** Independent invariants reject mutations before deterministic artifact comparison. */
export function assertCoreTerminalAudit(a: ReturnType<typeof buildCoreTerminalAudit>) {
  const check = (v: unknown, message: string) => { if (!v) throw new Error(`C1C20: ${message}`); };
  const exact = (x: string[], y: string[]) => JSON.stringify([...x].sort()) === JSON.stringify([...y].sort());
  const c = a.coverage;
  check(c.sourceDefinitionCount === 37 && c.productionReadyCount === 15 && c.notReadyCount === 22, 'Core counts');
  check(a.cards.length === 37 && new Set(a.cards.map(c => c.definitionId)).size === 37, 'exact unique census');
  check(exact(a.cards.map(c => c.definitionId), [...CORE_READY_NAMES.flat(), ...CORE_BLOCKED_NAMES.flat()].map(coreId)), 'exact Core IDs');
  check(exact(c.readyIds, CORE_READY_NAMES.flat().map(coreId)) && exact(c.notReadyIds, CORE_BLOCKED_NAMES.flat().map(coreId)), 'exact Ready/blocked IDs');
  check(c.immediateWholeCardRuntimeCandidates === 0 && c.immediateSourceSafeWholeCardCandidates === 0 && c.sourceGatedCards === 22, 'immediate gain');
  check(c.readinessInvariantErrors.length === 0 && c.sourceGateCompletionSimulation.resultingReadyCount === 15, 'Ready invariants');
  for (const [index, level] of c.levels.entries()) {
    check(level.level === index + 1 && level.sourceDefinitionCount === [14, 11, 12][index]
      && level.productionReadyCount === [7, 4, 4][index] && !level.completeForRandomDraw, 'deck completeness');
    check(exact(level.productionReadyIds, CORE_READY_NAMES[index].map(coreId)), 'Ready level IDs');
    check(exact(level.missingDefinitionIds, CORE_BLOCKED_NAMES[index].map(coreId)), 'blocked level IDs');
  }
  check(a.blocked.length === 22 && exact(a.blocked.map(c => c.definitionId), c.notReadyIds), 'partition omission');
  for (const card of a.cards) {
    check(card.level === (CORE_READY_NAMES.findIndex(names => names.some(n => coreId(n) === card.definitionId)) + 1 || CORE_BLOCKED_NAMES.findIndex(names => names.some(n => coreId(n) === card.definitionId)) + 1), 'card level');
    if (card.productionReady) check(card.rootFamilies.length === 0 && card.sourceGate === null, 'Ready root blocker');
    else {
      check(card.rootFamilies.length === 1 && card.rootFamilies[0] === card.rootBlockerFamily && card.sourceGate?.closed === false, 'root assignment');
      const expected = card.rootClassificationEvidence.triggers.includes('voluntary-declaration') ? 'VOLUNTARY_DECLARATION'
        : card.definitionId === coreId('damage-stone') ? 'DAMAGE_WOUND'
          : card.definitionId === coreId('chirurgeons-charm') ? 'HEALING_TRIGGER_SCOPE' : 'HERO_CAUSED_CONDITION';
      check(card.rootBlockerFamily === expected && card.sourceGate?.sourceGapId === ROOT_GATES[expected].sourceGapId, 'root truth');
      check(card.runtimeOnlyReadyGain === 0 && card.wholeCardReadyGainWithCurrentSources === 0, 'blocked runtime-only promotion');
      check(card.downstreamRuntimeBlockers.every(b => b.rootSourceGate === card.sourceGate?.sourceGapId), 'downstream upstream binding');
    }
  }
  for (const [index, family] of ROOT_FAMILIES.entries()) {
    const members = a.blocked.filter(c => c.rootBlockerFamily === family).map(c => c.definitionId);
    const group = a.groups.find(g => g.rootFamily === family);
    check(members.length === [16, 4, 1, 1][index] && c.rootPartition[family] === members.length, 'root partition count');
    check(group && exact(group.affectedCards, members) && group.affectedCardCount === members.length && !group.newSourceSincePriorPhase, 'gap membership');
  }
  for (const row of a.runtimeRoi) {
    check(row.cardsPromotedIfImplementedAlone.length === 0 && row.cardsPromotedIfSourceGateClosed.length === 0, 'ROI promotion claim');
    check(row.affectedCards.length > 0 && row.affectedCards.every(id => a.blocked.some(c => c.definitionId === id && row.rootSourceGate.includes(c.sourceGate!.sourceGapId))), 'ROI upstream graph');
    if (row.kind === 'RUNTIME_PRIMITIVE') check(row.priority === 'P3' && !row.implementableNow, 'runtime priority');
    if (row.kind === 'PARTIAL_SLICE') check(row.priority === 'P4', 'partial priority');
    if (row.primitive === 'CONDITION_CHARM_POSITIVE_SKILL_TARGET') check(row.implementableNow === false, 'Charm Positive feasible');
  }
}
