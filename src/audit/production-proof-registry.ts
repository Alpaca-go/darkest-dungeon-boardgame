export type ProductionProofType = 'production-runtime' | 'save-replay' | 'selector' | 'e2e';
export type ProductionProofStatus = 'active' | 'skip' | 'todo';

export interface RegisteredProductionProof {
  proofId: string;
  definitionIds: string[];
  proofType: ProductionProofType;
  testFile: string;
  runner: 'vitest' | 'playwright';
  status: ProductionProofStatus;
  scope?: 'definition' | 'adapter' | 'primitive';
  adapterId?: string;
  primitiveId?: string;
  proofSurface?: 'production-ui' | 'production-command' | 'test-harness';
}

export const ACCURACY_STONE_ID = 'community-trinket-core-accuracy-stone';
export const CRITICAL_STONE_ID = 'community-trinket-core-critical-stone';
export const CHIRURGEONS_CHARM_ID = 'community-trinket-core-chirurgeons-charm';
export const DARK_BRACER_ID = 'community-trinket-core-dark-bracer';
export const SOLAR_BRACER_ID = 'community-trinket-core-solar-bracer';
export const FORTUNATE_ARMLET_ID = 'community-trinket-core-fortunate-armlet';
export const BOOK_OF_RELAXATION_ID = 'community-trinket-core-book-of-relaxation';
export const C1C1_CORE_QUEST_IDS = [
  'community-quest-ruins-lvl1-scout-ahead',
  'community-quest-ruins-lvl1-wipe-em-out',
  'community-quest-ruins-lvl2-clear-the-path',
  'community-quest-ruins-lvl2-reduce-to-rubble',
  'community-quest-warrens-lvl1-explore-the-sewers',
  'community-quest-warrens-lvl1-pork-chop',
  'community-quest-warrens-lvl2-mapping-the-sewers',
] as const;

export const C1C2_ADAPTER_ONLY_QUEST_IDS = [
  'community-quest-crimson-court-lvl1-deep-in-the-swamp',
  'community-quest-crimson-court-lvl2-deeper-into-the-swamp',
  'community-quest-crimson-court-lvl2-pest-control',
] as const;

export const C1C2_SPECIAL_RULE_QUEST_IDS = [
  'community-quest-warrens-lvl3-deep-in-the-warrens',
] as const;

export const C1C3_MULTI_PRIMITIVE_QUEST_IDS = [
  'community-quest-cove-lvl3-tainted-trinkets',
  'community-quest-warrens-lvl1-family-trinkets',
] as const;

export function proof(entry: RegisteredProductionProof): RegisteredProductionProof {
  if (entry.proofType === 'e2e' && entry.proofSurface === undefined) {
    throw new Error(`${entry.proofId}: e2e proofSurface must be declared explicitly`);
  }
  return Object.freeze({
    ...entry,
    definitionIds: Object.freeze([...entry.definitionIds]) as unknown as string[],
  });
}

export const PRODUCTION_PROOF_REGISTRY: Readonly<Record<string, RegisteredProductionProof>> = Object.freeze(Object.fromEntries([
  ...C1C3_MULTI_PRIMITIVE_QUEST_IDS.flatMap((definitionId) => {
    const label = definitionId.includes('tainted-trinkets') ? 'TAINTED' : 'FAMILY';
    return [
      proof({ proofId: `C1C3-${label}-RUNTIME`, definitionIds: [definitionId], proofType: 'production-runtime', testFile: 'src/game-engine/c1c3-multi-primitive-quest-rule.test.ts', runner: 'vitest', status: 'active', scope: 'definition' }),
      proof({ proofId: `C1C3-${label}-SAVE-REPLAY`, definitionIds: [definitionId], proofType: 'save-replay', testFile: 'src/game-engine/c1c3-multi-primitive-quest-rule.test.ts', runner: 'vitest', status: 'active', scope: 'definition' }),
      proof({ proofId: `C1C3-${label}-SELECTOR`, definitionIds: [definitionId], proofType: 'selector', testFile: 'src/game-engine/c1c3-multi-primitive-quest-rule.test.ts', runner: 'vitest', status: 'active', scope: 'definition' }),
      proof({ proofId: `C1C3-E2E-${label}-TRINKETS`, definitionIds: [definitionId], proofType: 'e2e', testFile: 'e2e/phase11a4-c1c3-multi-primitive-quest.spec.ts', runner: 'playwright', status: 'active', scope: 'definition', proofSurface: 'test-harness' }),
    ];
  }),
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
    proofSurface: 'production-ui',
  }),
  proof({
    proofId: 'C1C1R2-E2E-REST-ALLOCATION',
    definitionIds: [],
    proofType: 'e2e',
    testFile: 'e2e/phase11a4-c1c1r2-rest-allocation.spec.ts',
    runner: 'playwright',
    status: 'active',
    scope: 'primitive',
    primitiveId: 'QUEST_REST_ALLOCATION_SEMANTICS',
    proofSurface: 'production-ui',
  }),
  proof({
    proofId: 'C1C2-ADAPTER-RUNTIME',
    definitionIds: [...C1C2_ADAPTER_ONLY_QUEST_IDS],
    proofType: 'production-runtime',
    testFile: 'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
    runner: 'vitest', status: 'active', scope: 'definition',
  }),
  proof({
    proofId: 'C1C2-ADAPTER-SAVE-REPLAY',
    definitionIds: [...C1C2_ADAPTER_ONLY_QUEST_IDS],
    proofType: 'save-replay',
    testFile: 'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
    runner: 'vitest', status: 'active', scope: 'definition',
  }),
  proof({
    proofId: 'C1C2-ADAPTER-SELECTOR',
    definitionIds: [...C1C2_ADAPTER_ONLY_QUEST_IDS],
    proofType: 'selector',
    testFile: 'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
    runner: 'vitest', status: 'active', scope: 'definition',
  }),
  proof({
    proofId: 'C1C2-SPECIAL-RULE-RUNTIME',
    definitionIds: [...C1C2_SPECIAL_RULE_QUEST_IDS],
    proofType: 'production-runtime',
    testFile: 'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
    runner: 'vitest', status: 'active', scope: 'definition',
  }),
  proof({
    proofId: 'C1C2-SPECIAL-RULE-SAVE-REPLAY',
    definitionIds: [...C1C2_SPECIAL_RULE_QUEST_IDS],
    proofType: 'save-replay',
    testFile: 'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
    runner: 'vitest', status: 'active', scope: 'definition',
  }),
  proof({
    proofId: 'C1C2-SPECIAL-RULE-SELECTOR',
    definitionIds: [...C1C2_SPECIAL_RULE_QUEST_IDS],
    proofType: 'selector',
    testFile: 'src/game-engine/c1c2-quest-runtime-expansion.test.ts',
    runner: 'vitest', status: 'active', scope: 'definition',
  }),
  proof({
    proofId: 'C1C2-E2E-SPECIAL-RULE',
    definitionIds: [...C1C2_SPECIAL_RULE_QUEST_IDS],
    proofType: 'e2e',
    testFile: 'e2e/phase11a4-c1c2-quest-special-rule.spec.ts',
    runner: 'playwright', status: 'active', scope: 'definition', proofSurface: 'production-ui',
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
    proofSurface: 'production-ui',
  }),
  proof({
    proofId: 'C1BR-E2E-CRITICAL',
    definitionIds: [CRITICAL_STONE_ID],
    proofType: 'e2e',
    testFile: 'e2e/phase11a4-c1br-community-trinket-production.spec.ts',
    runner: 'playwright',
    status: 'active',
    proofSurface: 'production-ui',
  }),
  proof({ proofId: 'C1C5-CHIRURGEONS-RUNTIME', definitionIds: [CHIRURGEONS_CHARM_ID], proofType: 'production-runtime', testFile: 'src/game-engine/c1c5-chirurgeons-charm.test.ts', runner: 'vitest', status: 'active', scope: 'primitive', primitiveId: 'BATTLE_HEALING_TRINKET_WINDOWS' }),
  proof({ proofId: 'C1C5-CHIRURGEONS-SAVE-REPLAY', definitionIds: [CHIRURGEONS_CHARM_ID], proofType: 'save-replay', testFile: 'src/game-engine/c1c5-chirurgeons-charm.test.ts', runner: 'vitest', status: 'active', scope: 'primitive', primitiveId: 'BATTLE_HEALING_TRINKET_WINDOWS' }),
  proof({ proofId: 'C1C5-CHIRURGEONS-SELECTOR', definitionIds: [CHIRURGEONS_CHARM_ID], proofType: 'selector', testFile: 'src/game-engine/c1c5-chirurgeons-charm.test.ts', runner: 'vitest', status: 'active', scope: 'primitive', primitiveId: 'BATTLE_HEALING_TRINKET_WINDOWS' }),
  proof({ proofId: 'C1C5-E2E-CHIRURGEONS', definitionIds: [CHIRURGEONS_CHARM_ID], proofType: 'e2e', testFile: 'e2e/phase11a4-c1c5-chirurgeons-charm.spec.ts', runner: 'playwright', status: 'active', scope: 'primitive', primitiveId: 'BATTLE_HEALING_TRINKET_WINDOWS', proofSurface: 'production-ui' }),
  ...([['DARK', DARK_BRACER_ID], ['SOLAR', SOLAR_BRACER_ID]] as const).flatMap(([label, definitionId]) => [
    proof({ proofId: `C1C6-${label}-BRACER-RUNTIME`, definitionIds: [definitionId], proofType: 'production-runtime', testFile: 'src/game-engine/c1c6-dark-solar-bracer.test.ts', runner: 'vitest', status: 'active' }),
    proof({ proofId: `C1C6-${label}-BRACER-SAVE-REPLAY`, definitionIds: [definitionId], proofType: 'save-replay', testFile: 'src/game-engine/c1c6-dark-solar-bracer.test.ts', runner: 'vitest', status: 'active' }),
    proof({ proofId: `C1C6-${label}-BRACER-SELECTOR`, definitionIds: [definitionId], proofType: 'selector', testFile: 'src/game-engine/c1c6-dark-solar-bracer.test.ts', runner: 'vitest', status: 'active' }),
    proof({ proofId: `C1C6-E2E-${label}-BRACER`, definitionIds: [definitionId], proofType: 'e2e', testFile: 'e2e/phase11a4-c1c6-dark-solar-bracer.spec.ts', runner: 'playwright', status: 'active', proofSurface: 'production-ui' }),
  ]),
  proof({ proofId: 'C1C7-FORTUNATE-POSITIVE-RUNTIME', definitionIds: [FORTUNATE_ARMLET_ID], proofType: 'production-runtime', testFile: 'src/game-engine/c1c7-fortunate-armlet.test.ts', runner: 'vitest', status: 'active', scope: 'primitive', primitiveId: 'FORTUNATE_POST_ROLL_ATTACK_SLICE' }),
  proof({ proofId: 'C1C7-FORTUNATE-POSITIVE-SAVE-REPLAY', definitionIds: [FORTUNATE_ARMLET_ID], proofType: 'save-replay', testFile: 'src/game-engine/c1c7-fortunate-armlet.test.ts', runner: 'vitest', status: 'active', scope: 'primitive', primitiveId: 'FORTUNATE_POST_ROLL_ATTACK_SLICE' }),
  proof({ proofId: 'C1C7-FORTUNATE-POSITIVE-SELECTOR', definitionIds: [FORTUNATE_ARMLET_ID], proofType: 'selector', testFile: 'src/game-engine/c1c7-fortunate-armlet.test.ts', runner: 'vitest', status: 'active', scope: 'primitive', primitiveId: 'FORTUNATE_POST_ROLL_ATTACK_SLICE' }),
  proof({ proofId: 'C1C7-E2E-FORTUNATE-POSITIVE', definitionIds: [FORTUNATE_ARMLET_ID], proofType: 'e2e', testFile: 'e2e/phase11a4-c1c7-fortunate-armlet.spec.ts', runner: 'playwright', status: 'active', scope: 'primitive', primitiveId: 'FORTUNATE_POST_ROLL_ATTACK_SLICE', proofSurface: 'production-ui' }),
].map((entry) => [entry.proofId, entry])));

export function resolveRegisteredProof(
  proofId: string,
  expectedType: ProductionProofType,
  definitionId: string,
  registry: Readonly<Record<string, RegisteredProductionProof>> = PRODUCTION_PROOF_REGISTRY,
  expectedAdapterId?: string,
  expectedPrimitiveIds: readonly string[] = [],
): { resolved: boolean; reason: 'RESOLVED' | 'UNRESOLVED' | 'WRONG_TYPE' | 'WRONG_DEFINITION' | 'DISABLED' } {
  const registered = registry[proofId];
  if (!registered) return { resolved: false, reason: 'UNRESOLVED' };
  if (registered.status !== 'active') return { resolved: false, reason: 'DISABLED' };
  if (registered.proofType !== expectedType) return { resolved: false, reason: 'WRONG_TYPE' };
  if (registered.scope === 'adapter') {
    if (!expectedAdapterId || registered.adapterId !== expectedAdapterId) return { resolved: false, reason: 'WRONG_DEFINITION' };
  } else if (registered.scope === 'primitive') {
    if (!registered.primitiveId || !expectedPrimitiveIds.includes(registered.primitiveId)) return { resolved: false, reason: 'WRONG_DEFINITION' };
  } else if (!registered.definitionIds.includes(definitionId)) return { resolved: false, reason: 'WRONG_DEFINITION' };
  return { resolved: true, reason: 'RESOLVED' };
}

export function allProofsResolve(
  proofIds: readonly string[],
  expectedType: ProductionProofType,
  definitionId: string,
  registry: Readonly<Record<string, RegisteredProductionProof>> = PRODUCTION_PROOF_REGISTRY,
  expectedAdapterId?: string,
  expectedPrimitiveIds: readonly string[] = [],
  expectedPrimitiveByProof: Readonly<Record<string, string>> = {},
): boolean {
  return proofIds.length > 0 && proofIds.every((proofId) =>
    resolveRegisteredProof(
      proofId,
      expectedType,
      definitionId,
      registry,
      expectedAdapterId,
      expectedPrimitiveByProof[proofId] ? [expectedPrimitiveByProof[proofId]] : expectedPrimitiveIds,
    ).resolved,
  );
}

export function allProofsUseSurface(
  proofIds: readonly string[],
  surface: NonNullable<RegisteredProductionProof['proofSurface']>,
  registry: Readonly<Record<string, RegisteredProductionProof>> = PRODUCTION_PROOF_REGISTRY,
): boolean {
  return proofIds.length > 0 && proofIds.every((proofId) => registry[proofId]?.proofSurface === surface);
}
