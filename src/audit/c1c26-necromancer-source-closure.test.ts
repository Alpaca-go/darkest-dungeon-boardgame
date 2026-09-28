import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { load, root, unresolvedLeaves } from '../../scripts/audit/c1c25-contract';
import { buildArtifacts, canExhaust, categories, deriveDecision, validateArtifacts, verifyScope } from '../../scripts/audit/c1c26-contract';

const a = buildArtifacts();
const get = (name: string) => a['c1c26-necromancer-' + name + '.json'];
const matrix = get('semantic-completeness-matrix');
const gaps = get('source-gap-register');
const readiness = get('runtime-readiness-matrix').slices;
const mutate = (name: string, edit: (v: any) => void) => { const changed = structuredClone(a); edit(changed['c1c26-necromancer-' + name + '.json']); return changed; };
describe('C1C26 source closure gate', () => {
  it('preserves the nine unique locked physical identities', () => {
    expect(new Set(matrix.cards.map((c: any) => c.physicalIdentity)).size).toBe(9);
    expect(matrix.cards.map((c: any) => c.physicalIdentity)).toEqual(load('c1c25-necromancer-card-semantic-contracts.json').cards.map((c: any) => c.physicalIdentity));
  });
  it('preserves literal 9/9 and narrative local semantic 3/9', () => {
    expect(matrix.totals).toMatchObject({ literalComplete: 9, cardLocalSemanticComplete: 3, familySemanticComplete: 0 });
    expect(matrix.cards.filter((c: any) => c.cardLocalSemanticComplete).map((c: any) => c.cardId).sort()).toEqual([42000, 42001, 42002]);
  });
  it('freezes every level composition instead of recalculating a new roster', () => {
    expect(get('frozen-baseline-contracts').composition).toEqual(load('c1c25-necromancer-encounter-composition.json'));
    expect(get('frozen-baseline-contracts').composition.levels.map((c: any) => c.level)).toEqual([1, 2, 3]);
  });
  it('retains the bound Threat lifecycle and physical flip', () => {
    for (const t of get('frozen-baseline-contracts').threatLifecycle) {
      expect(t.trigger.status).toBe('BOUND'); expect(t.expiry.status).toBe('BOUND');
      expect(t.abilitySideRelation.value).toMatchObject({ physicalFlip: true, threatAndAbilitySimultaneous: false });
    }
  });
  it('freezes Room identity, layout and starting positions', () => {
    expect(get('frozen-baseline-contracts').room).toEqual(load('c1c25-necromancer-room-contract.json'));
    expect(get('room-capacity-resolution').frozenRoom).toEqual(get('frozen-baseline-contracts').room);
  });
  it('preserves full-Stance precedence independently of Area displacement', () => {
    const r = get('room-capacity-resolution');
    expect(r.fullStancePrecedence).toEqual(load('c1c25-necromancer-source-precedence.json').rulings.fullStance);
    expect(r.fullStanceSuppressionIsAreaFallback).toBe(false);
    expect(r.initialLargeDrawReplacementIsSummonFallback).toBe(false);
  });
  it('accounts for all 75 baseline gaps with explicit bounded status', () => {
    expect(gaps.before).toEqual(gaps.after); expect(gaps.boundedLeafUsages).toBe(75);
    expect(gaps.baselineLeafUsages.map((g: any) => g.baselineGapId)).toEqual(load('c1c25-necromancer-source-gap-register.json').sourceGaps.map((g: any) => g.gapId));
    expect(gaps.baselineLeafUsages.every((g: any) => g.resolutionStatus === 'BOUNDED_STILL_UNRESOLVED' && g.resolutionValue === null && !g.terminal)).toBe(true);
    expect([...new Set(gaps.baselineLeafUsages.map((g: any) => g.category))].sort()).toEqual([...categories].sort());
  });
  it('registers every refined unresolved leaf and its baseline category lineage', () => {
    const contractNames = Object.keys(a).filter(n => !/gap-register|frozen-baseline-contracts/.test(n));
    const expected = contractNames.flatMap(n => unresolvedLeaves(a[n]).map(g => n + ':' + g.field));
    // Semantic/readiness/decision artifacts carry statuses, not unknown value nodes.
    expect(gaps.refinedContractLeafUsages.map((g: any) => g.gapId)).toEqual(expected);
    expect(gaps.refinedContractLeafUsages.every((g: any) => g.mapsToBaselineGapIds.length && categories.includes(g.category))).toBe(true);
  });
  it('denies semantic promotion while either tie rule is unresolved', () => {
    expect(get('lowest-roll-tie-contract').effects.every((e: any) => e.tieRule.value === null)).toBe(true);
    expect(get('area-target-tie-contract').crowdedAreaTieRule.value).toBeNull();
    expect(() => validateArtifacts(mutate('semantic-completeness-matrix', x => { x.cards[0].semanticComplete = true; }))).toThrow();
  });
  it('limits lowest-roll ties to the two Hamlet effects and preserves different benefits', () => {
    const effects = get('lowest-roll-tie-contract').effects;
    expect(effects.map((e: any) => [e.level, e.mayUseGraveyardEffect])).toEqual([[2, true], [3, false]]);
    expect(effects.every((e: any) => e.tieRule.sourceReferences.some((r: any) => r.kind === 'PRINTED_COMPONENT' || r.kind === 'ORIGINAL_TTS_PRINTED_CELL'))).toBe(true);
  });
  it('does not substitute character Stance priority or movement choice for Area ties', () => {
    expect(get('area-target-tie-contract')).toMatchObject({ runtimeBindingStatus: 'BLOCKED', heroTargetCounts: [2, 2, 4], skillRanges: [1, 2, 2] });
    expect(() => validateArtifacts(mutate('area-target-tie-contract', x => { x.crowdedAreaTieRule.value = 'player choice'; }))).toThrow();
  });
  it('enumerates all nine Skills with one Area and unresolved summon multiplicity', () => {
    const skills = get('summon-count-contract').skills;
    expect(skills).toHaveLength(9);
    expect(skills.every((s: any) => s.targetAreaCount.value === 1 && s.summonCount.value === null && s.summonCountBasis.value === null && s.spaceDependency.status === 'BOUND')).toBe(true);
    expect(() => validateArtifacts(mutate('semantic-completeness-matrix', x => { x.cards[1].runtimeCandidate = true; }))).toThrow();
  });
  it('keeps observed component count separate from runtime supply policy', () => {
    const policy = get('summon-copy-policy');
    expect(policy.observedPhysicalCopies.filter((u: any) => u.ordinarySkillSummonEligible).map((u: any) => u.observedMiniatureManifestCount)).toEqual([3, 3, 3]);
    expect(policy.campaignCopyPolicy.value).toBeNull(); expect(policy.encounterSummonAvailability.value).toBeNull();
    expect(Object.values(policy.runtimeSupplyLifecycle).every((x: any) => x.value === null)).toBe(true);
    expect(policy).toMatchObject({ infiniteCloneAllowed: false, defaultDeadReuseAllowed: false, defaultExhaustedSkipAllowed: false });
  });
  it('never silently normalizes Rabble/Rubble or claims a correction', () => {
    const c = get('bone-identity-closure').nameConflict;
    expect(c).toMatchObject({ printedName: 'Bone Rabble', rulebookLiteral: 'Bone Rubble', automaticAliasAllowed: false });
    expect(c.authoritativeName.value).toBeNull();
    expect(() => validateArtifacts(mutate('bone-identity-closure', x => { x.nameConflict.authoritativeName.value = 'Bone Rabble'; }))).toThrow();
  });
  it('keeps Captain Threat-only and narrow/full physical components distinct', () => {
    const c = get('bone-identity-closure').captain;
    expect(c).toMatchObject({ ordinarySkillSummon: false, mergeAsTwoSpawnCopiesAllowed: false });
    expect(c.components.map((b: any) => b.cardId).sort()).toEqual([46111, 46600]);
    expect(new Set(c.components.map((b: any) => b.physicalIdentity)).size).toBe(2);
    expect(c.componentAssociation.value).toBeNull();
  });
  it('lists all required precedence topics and retains the frozen hierarchy', () => {
    const p = get('source-precedence-closure');
    expect(p.hierarchy).toEqual(load('c1c25-necromancer-source-precedence.json').table);
    expect(p.topics).toHaveLength(5);
    expect(p.topics.every((t: any) => t.sourceA && t.sourceB && t.conflict && t.higherAuthority && t.resolution && t.status)).toBe(true);
    expect(p.sourceConflictPolicyChanged).toBe(false);
  });
  it('blocks Reanimation despite bound generic casualty and initiative facts', () => {
    const r = get('reanimation-order-contract');
    expect(r.genericDeathThreshold.status).toBe('BOUND'); expect(r.genericCasualtyRemoval.status).toBe('BOUND');
    expect(r.runtimeSafe).toBe(false); expect(Object.values(r.order).every((x: any) => x.value === null)).toBe(true);
    expect(() => validateArtifacts(mutate('reanimation-order-contract', x => { x.runtimeSafe = true; }))).toThrow();
  });
  it('denies summon placement safety while Area fallback is missing', () => {
    const r = get('room-capacity-resolution');
    expect(r.nearestAvailableAreaTie.value).toBeNull(); expect(r.noAvailableAreaFallback.value).toBeNull();
    expect(() => validateArtifacts(mutate('room-capacity-resolution', x => { x.summonPlacementRuntimeSafe = true; }))).toThrow();
  });
  it('refines Room Card return without promoting Boss trio cleanup', () => {
    const c = get('cleanup-destination-contract');
    expect(c.destinations.roomCard.sourceReferences.map((r: any) => r.page)).toEqual([25, 32]);
    expect(['bossIdentity', 'threatAbility', 'bossBattle'].every(k => c.destinations[k].value === null)).toBe(true);
    expect(() => validateArtifacts(mutate('cleanup-destination-contract', x => { x.fullEncounterLifecycleReady = true; }))).toThrow();
  });
  it('keeps community and unauthenticated mirror sources as search leads', () => {
    expect(get('source-search-evidence').leads.every((l: any) => l.rulesAuthority === false)).toBe(true);
    expect(() => validateArtifacts(mutate('source-search-evidence', x => { x.leads[1].rulesAuthority = true; }))).toThrow();
  });
  it('does not promote an inaccessible FAQ to terminal proof', () => {
    for (const t of get('source-exhaustion-register').topics) expect(canExhaust(t.exhaustionEvidence)).toBe(false);
    const failed = { knownOfficialCorpusSearched: true, relevantComponentsChecked: true, rulebookChecked: true, faqCheckedOrProvablyUnavailable: false, noUnexaminedAuthoritativeConflict: true, proofReferences: ['HTTP403'] };
    expect(canExhaust(failed)).toBe(false);
    const pseudoTerminal = gaps.baselineLeafUsages.map((g: any) => ({ ...g, resolutionStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', exhaustionEvidence: failed }));
    expect(deriveDecision(pseudoTerminal, readiness).outcome).toBe('NECROMANCER_SOURCE_CLOSURE_CONTINUATION');
  });
  it('requires complete exhaustion evidence for terminal selection', () => {
    const complete = { knownOfficialCorpusSearched: true, relevantComponentsChecked: true, rulebookChecked: true, faqCheckedOrProvablyUnavailable: true, noUnexaminedAuthoritativeConflict: true, proofReferences: ['authenticated exhaustive corpus review'] };
    expect(canExhaust(complete)).toBe(true); expect(canExhaust({ ...complete, proofReferences: [] })).toBe(false);
    expect(deriveDecision([{ resolutionStatus: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', exhaustionEvidence: complete }], []).outcome).toBe('NECROMANCER_TERMINAL_BLOCKER_CONSOLIDATION');
  });
  it('rebuilds the continuation decision from gaps and readiness', () => {
    expect(a['c1c26-next-workstream-decision.json']).toMatchObject(deriveDecision(gaps.baselineLeafUsages, readiness));
    expect(deriveDecision([], [], false).runtimeFoundationAllowed).toBe(false);
    expect(deriveDecision([], [], true).outcome).toBe('NECROMANCER_RUNTIME_FOUNDATION_SELECTED');
  });
  it('does not mistake static descriptors for a complete partial gameplay slice', () => {
    expect(readiness.filter((r: any) => r.sourceStatus === 'SOURCE_COMPLETE_RUNTIME_MISSING')).toHaveLength(4);
    expect(readiness.every((r: any) => !r.completeGameplaySlice && !r.nonReachableGateProven)).toBe(true);
    expect(deriveDecision(gaps.baselineLeafUsages, readiness).partialScopeAllowed).toBe(false);
    const hypothetical = { sourceStatus: 'SOURCE_COMPLETE_RUNTIME_MISSING', completeGameplaySlice: true, productionValidationPossible: true, nonReachableGateProven: true };
    expect(deriveDecision(gaps.baselineLeafUsages, [hypothetical]).outcome).toBe('NECROMANCER_PARTIAL_RUNTIME_FOUNDATION_SELECTED');
  });
  it('rejects gameplay, tooling and previous-phase mutations through scope guard', () => {
    for (const p of ['src/game-engine/monster-ai.ts', 'src/data/bosses/necromancer-family.ts', 'vite.config.ts', 'docs/data/complete-edition/c1c25-necromancer-room-contract.json', 'src/components/Boss.tsx']) expect(() => verifyScope([p])).toThrow();
    expect(() => verifyScope(['scripts/audit/c1c26-contract.ts', 'docs/data/complete-edition/c1c26-next-workstream-decision.json'])).not.toThrow();
  });
  it('verifies deterministic stored artifacts including source provenance hashes', () => {
    const stored = Object.fromEntries(Object.keys(a).map(n => [n, JSON.parse(readFileSync(root + n, 'utf8'))]));
    expect(() => validateArtifacts(stored)).not.toThrow(); expect(buildArtifacts()).toEqual(a);
  });
  it('preserves upstream acceptance counts and historical validation limitations', () => {
    expect(get('frozen-baseline-contracts').upstreamCounts).toEqual({ trinket: '15/37', quest: '3/75', census: 278, hamletEvent: '16 literal / 5 local semantic / 0 Ready', boss: '231 / 20 families', Battle: 114, Threat: 51, AbilityExclusive: 12, Identity: 54 });
    expect(get('frozen-baseline-contracts').upstreamManifest.historicalE2EFailures).toEqual(load('c1c25-necromancer-source-manifest.json').historicalE2EFailures);
  });
});
