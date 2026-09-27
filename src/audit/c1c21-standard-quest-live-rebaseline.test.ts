import { describe, it, expect } from 'vitest';
import { buildStandardQuestLiveRebaseline, assertStandardQuestLiveRebaseline } from './standard-quest-live-rebaseline';
import { semanticContractAcceptanceErrors, restAllocationSemanticsImplemented } from './rest-semantic-contract';

describe('C1C21 live rebaseline', () => {
  it('derives exact census, selector and fail-closed Rest', () => {
    const a = buildStandardQuestLiveRebaseline();
    expect(() => assertStandardQuestLiveRebaseline(a)).not.toThrow();
    expect(a.sourceDefinitionCount).toBe(75);
    expect(a.readyIds).toEqual(['community-quest-warrens-lvl1-explore-the-sewers','community-quest-warrens-lvl2-mapping-the-sewers','community-quest-warrens-lvl3-deep-in-the-warrens'].sort());
    expect(restAllocationSemanticsImplemented()).toBe(semanticContractAcceptanceErrors().length === 0);
    expect(a.quests.filter(q => q.wouldOtherwiseUseSimpleAdapter && q.sourceGates.includes('REST_INSUFFICIENT_RECOVERY_CAPACITY'))).toHaveLength(8);
    expect(a.quests.filter(q => q.requiredDeck).map(q => q.deck?.completeForRandomDraw)).toEqual([false,false]);
    expect(a.quests.find(q => q.requiredDeck === 3)?.readinessDependencyAudit).toBe('MISSING_READINESS_DEPENDENCY');
  });
  const mutations: Array<[string, (a: ReturnType<typeof buildStandardQuestLiveRebaseline>) => void]> = [
    ['74 cards', a => { a.quests.pop(); a.sourceDefinitionCount--; }],
    ['76 cards', a => { a.quests.push(a.quests[0]); a.sourceDefinitionCount++; }],
    ['one omitted', a => { a.quests.pop(); }],
    ['duplicate ID', a => { a.quests[0].definitionId = a.quests[1].definitionId; }],
    ['firewood marked ready', a => { a.quests.find(q => q.firewoodTokens > 0)!.productionReady = true; }],
    ['Rest source erased', a => { a.restAcceptanceErrors = []; }],
    ['Family subset random', a => { a.quests.find(q => q.requiredDeck === 2)!.randomDrawPolicy = 'READY_SUBSET'; }],
    ['Tainted subset random', a => { a.quests.find(q => q.requiredDeck === 3)!.randomDrawPolicy = 'READY_SUBSET'; }],
    ['Family dependency omitted', a => { a.quests.find(q => q.requiredDeck === 2)!.readinessDependency = null; }],
    ['Tainted dependency omitted', a => { a.quests.find(q => q.requiredDeck === 3)!.readinessDependency = null; }],
    ['historical copied', a => { a.implementedPrimitives = []; }],
    ['frequency substituted for gain', a => { a.roi[0].cardsPromotedIfImplementedAlone = a.roi[0].affectedQuestCount; }],
    ['proof-only source misclassified', a => { a.quests.find(q => q.productionReady)!.rootBlockerFamily = 'QUEST_SOURCE_SEMANTIC_GAP'; }],
    ['source gap runtime-only', a => { a.quests.find(q => q.sourceGates.length)!.sourceGates = []; }],
    ['incompatible roots', a => { a.quests[0].rootBlockerFamilies = ['NONE_READY','REST_SOURCE_SCOPE']; }],
    ['decision gain invented', a => { a.decision.expectedReadyGain = 32; }],
  ];
  it.each(mutations)('rejects %s', (_name, mutate) => {
    const a = structuredClone(buildStandardQuestLiveRebaseline()); mutate(a);
    expect(() => assertStandardQuestLiveRebaseline(a)).toThrow();
  });
});
