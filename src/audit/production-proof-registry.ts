export type ProductionProofType = 'production-runtime' | 'save-replay' | 'selector' | 'e2e';
export type ProductionProofStatus = 'active' | 'skip' | 'todo';

export interface RegisteredProductionProof {
  proofId: string;
  definitionIds: string[];
  proofType: ProductionProofType;
  testFile: string;
  runner: 'vitest' | 'playwright';
  status: ProductionProofStatus;
  scope?: 'definition' | 'adapter';
  adapterId?: string;
}

export const ACCURACY_STONE_ID = 'community-trinket-core-accuracy-stone';
export const CRITICAL_STONE_ID = 'community-trinket-core-critical-stone';
export const C1C1_CORE_QUEST_IDS = [
  'community-quest-ruins-lvl1-scout-ahead',
  'community-quest-ruins-lvl1-wipe-em-out',
  'community-quest-ruins-lvl2-clear-the-path',
  'community-quest-ruins-lvl2-reduce-to-rubble',
  'community-quest-warrens-lvl1-explore-the-sewers',
  'community-quest-warrens-lvl1-pork-chop',
  'community-quest-warrens-lvl2-mapping-the-sewers',
] as const;

function proof(entry: RegisteredProductionProof): RegisteredProductionProof {
  return Object.freeze({ ...entry, definitionIds: Object.freeze([...entry.definitionIds]) as unknown as string[] });
}

export const PRODUCTION_PROOF_REGISTRY: Readonly<Record<string, RegisteredProductionProof>> = Object.freeze(Object.fromEntries([
  proof({
    proofId: 'C1C1R-QUEST-SOURCE-SETUP',
    definitionIds: [...C1C1_CORE_QUEST_IDS],
    proofType: 'production-runtime',
    testFile: 'src/game-engine/c1c1r-firewood-real-flow.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1C1-QUEST-RUNTIME',
    definitionIds: [...C1C1_CORE_QUEST_IDS],
    proofType: 'production-runtime',
    testFile: 'src/game-engine/c1c1-community-quest-production.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1C1-QUEST-SAVE-REPLAY',
    definitionIds: [...C1C1_CORE_QUEST_IDS],
    proofType: 'save-replay',
    testFile: 'src/game-engine/c1c1-community-quest-production.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1C1-QUEST-SELECTOR',
    definitionIds: [...C1C1_CORE_QUEST_IDS],
    proofType: 'selector',
    testFile: 'src/game-engine/c1c1-community-quest-production.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1C1R-E2E-SIMPLE-QUEST-ADAPTER',
    definitionIds: [],
    proofType: 'e2e',
    testFile: 'e2e/phase11a4-c1c1r-real-community-quest.spec.ts',
    runner: 'playwright',
    status: 'active',
    scope: 'adapter',
    adapterId: 'c1c1-simple-community-quest-v1',
  }),
  proof({
    proofId: 'C1BR-PA-ACCURACY-RUNTIME',
    definitionIds: [ACCURACY_STONE_ID],
    proofType: 'production-runtime',
    testFile: 'src/game-engine/c1br-production-proof.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1BR-PA-CRITICAL-RUNTIME',
    definitionIds: [CRITICAL_STONE_ID],
    proofType: 'production-runtime',
    testFile: 'src/game-engine/c1br-production-proof.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1BR-CS-TRINKET-METADATA',
    definitionIds: [ACCURACY_STONE_ID, CRITICAL_STONE_ID],
    proofType: 'selector',
    testFile: 'src/game-engine/c1br-production-proof.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1BR-SAVE-ACCURACY-SIDE-REPLAY',
    definitionIds: [ACCURACY_STONE_ID],
    proofType: 'save-replay',
    testFile: 'src/game-engine/c1br-production-proof.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1BR-SAVE-CRITICAL-SIDE-REPLAY',
    definitionIds: [CRITICAL_STONE_ID],
    proofType: 'save-replay',
    testFile: 'src/game-engine/c1br-production-proof.test.ts',
    runner: 'vitest',
    status: 'active',
  }),
  proof({
    proofId: 'C1BR-E2E-ACCURACY',
    definitionIds: [ACCURACY_STONE_ID],
    proofType: 'e2e',
    testFile: 'e2e/phase11a4-c1br-community-trinket-production.spec.ts',
    runner: 'playwright',
    status: 'active',
  }),
  proof({
    proofId: 'C1BR-E2E-CRITICAL',
    definitionIds: [CRITICAL_STONE_ID],
    proofType: 'e2e',
    testFile: 'e2e/phase11a4-c1br-community-trinket-production.spec.ts',
    runner: 'playwright',
    status: 'active',
  }),
].map((entry) => [entry.proofId, entry])));

export function resolveRegisteredProof(
  proofId: string,
  expectedType: ProductionProofType,
  definitionId: string,
  registry: Readonly<Record<string, RegisteredProductionProof>> = PRODUCTION_PROOF_REGISTRY,
  expectedAdapterId?: string,
): { resolved: boolean; reason: 'RESOLVED' | 'UNRESOLVED' | 'WRONG_TYPE' | 'WRONG_DEFINITION' | 'DISABLED' } {
  const registered = registry[proofId];
  if (!registered) return { resolved: false, reason: 'UNRESOLVED' };
  if (registered.status !== 'active') return { resolved: false, reason: 'DISABLED' };
  if (registered.proofType !== expectedType) return { resolved: false, reason: 'WRONG_TYPE' };
  if (registered.scope === 'adapter') {
    if (!expectedAdapterId || registered.adapterId !== expectedAdapterId) return { resolved: false, reason: 'WRONG_DEFINITION' };
  } else if (!registered.definitionIds.includes(definitionId)) return { resolved: false, reason: 'WRONG_DEFINITION' };
  return { resolved: true, reason: 'RESOLVED' };
}

export function allProofsResolve(
  proofIds: readonly string[],
  expectedType: ProductionProofType,
  definitionId: string,
  registry: Readonly<Record<string, RegisteredProductionProof>> = PRODUCTION_PROOF_REGISTRY,
  expectedAdapterId?: string,
): boolean {
  return proofIds.length > 0 && proofIds.every((proofId) =>
    resolveRegisteredProof(proofId, expectedType, definitionId, registry, expectedAdapterId).resolved,
  );
}
