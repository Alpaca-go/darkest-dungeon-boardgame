import { COMMUNITY_TRINKET_CAPABILITIES, type RuntimeCapabilityRecord } from '../data/community-reference/production-runtime';
import { LEVEL_2_TRINKET_CENSUS, LEVEL_2_TRINKET_DECK_COVERAGE } from './level2-trinket-deck';
import { trinketReadinessInvariantErrors } from './trinket-readiness-invariants';

export const BLOCKER_TAXONOMY = {
  TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED: { category: 'SOURCE_SCOPE', upstreamBlockers: [], recommendedAction: 'WAIT_FOR_NEW_SOURCE_EVIDENCE' },
  TRINKET_TRIGGER_SCOPE_UNRESOLVED: { category: 'SOURCE_SCOPE', upstreamBlockers: [], recommendedAction: 'WAIT_FOR_NEW_SOURCE_EVIDENCE' },
  VOLUNTARY_DECLARATION_RUNTIME: { category: 'RUNTIME_PRIMITIVE', upstreamBlockers: ['TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED'], recommendedAction: 'DEFER' },
  NO_TRINKETMODIFIERTYPE_MOVEMENT: { category: 'RUNTIME_PRIMITIVE', upstreamBlockers: ['TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED', 'VOLUNTARY_DECLARATION_RUNTIME'], recommendedAction: 'DEFER' },
  TRINKET_MODIFIER_CONSUMER_MISSING: { category: 'CONTEXT_SPECIFIC_CONSUMER', upstreamBlockers: ['TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED', 'VOLUNTARY_DECLARATION_RUNTIME'], recommendedAction: 'DEFER' },
} as const;
export type Level2BlockerCode = keyof typeof BLOCKER_TAXONOMY;

const sourceGate = (trigger: string) => trigger === 'voluntary-declaration'
  ? 'TRINKET_VOLUNTARY_DECLARATION_SCOPE_UNRESOLVED'
  : trigger === 'hero-heals' || trigger === 'hero-is-healed' ? 'TRINKET_TRIGGER_SCOPE_UNRESOLVED' : null;

export function level2TerminalAudit(capabilities: readonly RuntimeCapabilityRecord[] = COMMUNITY_TRINKET_CAPABILITIES) {
  const byId = new Map(capabilities.map((capability) => [capability.definitionId, capability]));
  const cards = LEVEL_2_TRINKET_CENSUS.map((source) => {
    const capability = byId.get(source.definitionId);
    if (!capability) throw new Error(`Missing capability: ${source.definitionId}`);
    const sides = source.sides.map((side) => {
      const obligation = capability.trinketSemanticObligations?.find((entry) => entry.side === side.side);
      if (!obligation) throw new Error(`Missing obligation: ${source.definitionId} ${side.side}`);
      const blockers = [...new Set([
        ...capability.blockerCodes.filter((code) => code === 'VOLUNTARY_DECLARATION_RUNTIME' && side.trigger === 'voluntary-declaration'),
        ...capability.blockerCodes.filter((code) => code === 'NO_TRINKETMODIFIERTYPE_MOVEMENT' && side.modifiers.some((value) => (value as { stat?: string }).stat === 'movement')),
        ...(obligation.blockerCode ? [obligation.blockerCode] : []),
        ...(sourceGate(side.trigger) && obligation.implementationStatus !== 'IMPLEMENTED' ? [sourceGate(side.trigger)!] : []),
      ])];
      for (const code of blockers) if (!(code in BLOCKER_TAXONOMY)) throw new Error(`Unknown blocker: ${code}`);
      const upstreamBlocker = sourceGate(side.trigger);
      return {
        side: side.side, trigger: side.trigger, currentStatus: obligation.implementationStatus,
        sourceScopeComplete: obligation.triggerScopeComplete,
        runtimePrimitiveComplete: !blockers.includes('VOLUNTARY_DECLARATION_RUNTIME') && !blockers.includes('NO_TRINKETMODIFIERTYPE_MOVEMENT'),
        consumerComplete: !blockers.includes('TRINKET_MODIFIER_CONSUMER_MISSING'),
        proofComplete: obligation.implementationStatus === 'IMPLEMENTED' && obligation.proofIds.length > 0,
        upstreamBlocker, implementationPossibleNow: false,
        readyGainIfImplemented: 0, priority: upstreamBlocker ? (upstreamBlocker === 'TRINKET_TRIGGER_SCOPE_UNRESOLVED' ? 'P1' : 'P0') : 'P4',
        blockerCodes: blockers,
        proofIds: obligation.proofIds,
      };
    });
    return { definitionId: source.definitionId, printedName: source.printedName,
      productionReady: capability.productionReady, blockerCodes: capability.blockerCodes, sides };
  });
  const blockerRegister = Object.entries(BLOCKER_TAXONOMY).map(([blockerCode, metadata]) => {
    const affected = cards.flatMap((card) => card.sides.filter((side) => side.blockerCodes.includes(blockerCode))
      .map((side) => ({ definitionId: card.definitionId, side: side.side })));
    return { blockerCode, category: metadata.category, affectedCards: [...new Set(affected.map((entry) => entry.definitionId))],
      affectedSides: affected, upstreamBlockers: metadata.upstreamBlockers,
      downstreamBlockers: Object.entries(BLOCKER_TAXONOMY).filter(([, value]) => (value.upstreamBlockers as readonly string[]).includes(blockerCode)).map(([code]) => code),
      canResolveWithCurrentSources: metadata.category !== 'SOURCE_SCOPE',
      wouldIncreaseReadyCountIfResolvedAlone: blockerCode === 'TRINKET_TRIGGER_SCOPE_UNRESOLVED'
        ? cards.filter((card) => !card.productionReady && card.sides.every((side) => side.blockerCodes.every((code) => code === blockerCode))).length : 0,
      recommendedAction: metadata.recommendedAction };
  });
  const readyCount = cards.filter((card) => card.productionReady).length;
  return { cards, blockerRegister, readyCount, notReadyCount: cards.length - readyCount,
    completeForRandomDraw: LEVEL_2_TRINKET_DECK_COVERAGE.completeForRandomDraw,
    readinessInvariantErrors: trinketReadinessInvariantErrors(capabilities) };
}
