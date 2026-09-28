import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { load, root } from '../../scripts/audit/c1c25-contract';
import { buildArtifacts, validateArtifacts, validateStatuses, isClosureAuthority, structuredTie, canExhaust, deriveDecision,
  categories, verifyScope, verifyBaselineAndReceipts } from '../../scripts/audit/c1c27-contract';

const a = buildArtifacts();
const get = (name: string) => a['c1c27-necromancer-' + name + '.json'];
const auth = a['c1c27-authoritative-source-authentication.json'];
const topics = get('source-exhaustion-register').topics;
const slices = get('runtime-readiness-matrix').slices;
const mutate = (name: string, change: (v: any) => void) => { const v = structuredClone(a); change(v[name]); return v; };
const authoritative = { sourceId: 'original', authorityStatus: 'AUTHORITATIVE_VERIFIED', contentSha256: 'a'.repeat(64),
  originalBytesPath: 'original.pdf', provenanceEvidence: ['original receipt'], provenanceVerified: true, authenticatedRuleContent: true, pendingAuthority: false };
const completeExhaustion = { allKnownRulebooksChecked: true, allKnownErrataChecked: true, designerFaqCheckedOrAuthenticatedUnavailable: true,
  officialComponentReferencesChecked: true, laterRevisionLeadsChecked: true, relevantPrintedComponentsChecked: true,
  publisherClarificationPathsChecked: true, noUnexaminedAuthoritativeLead: true, exhaustionEvidenceIds: ['checked corpus'], accessFailuresAsExhaustionProof: false,
  exhaustionEvidenceRecords: [{ evidenceId: 'checked corpus', verified: true, kind: 'AUTHENTICATED_CORPUS_REVIEW', proofReferences: ['synthetic corpus review fixture'],
    covers: ['allKnownRulebooksChecked', 'allKnownErrataChecked', 'designerFaqCheckedOrAuthenticatedUnavailable', 'officialComponentReferencesChecked',
      'laterRevisionLeadsChecked', 'relevantPrintedComponentsChecked', 'publisherClarificationPathsChecked', 'noUnexaminedAuthoritativeLead'] }] };

describe('C1C27 authoritative source closure', () => {
  it('retains nine physical cards, nine literal complete and three local semantic', () => {
    expect(get('semantic-completeness-matrix').totals).toEqual({ physical: 9, literalComplete: 9, cardLocalSemanticComplete: 3,
      familySemanticComplete: 0, sourceGated: 9, runtimeEligible: 0, productionReady: 0 });
    expect(get('semantic-completeness-matrix').cards).toEqual(load('c1c26-necromancer-semantic-completeness-matrix.json').cards);
  });
  it('preserves all 75 baseline usage identities/categories without double counting refined fields', () => {
    const old = load('c1c26-necromancer-source-gap-register.json').baselineLeafUsages;
    const now = get('source-exhaustion-register').leafUsages;
    expect(now.map((g: any) => [g.gapId, g.category, g.field, g.sourceReferences])).toEqual(old.map((g: any) => [g.gapId, g.category, g.field, g.sourceReferences]));
    expect(now).toHaveLength(75); expect(topics.reduce((n: number, t: any) => n + t.remainingUsages, 0)).toBe(75);
  });
  it('gives all nine blocker categories explicit authority-blocked status', () => {
    expect(topics.map((t: any) => t.category)).toEqual(categories);
    expect(topics.every((t: any) => t.status === 'BLOCKED_ON_UNRETRIEVED_AUTHORITY' && !t.terminal)).toBe(true);
    expect(() => validateStatuses(topics.slice(1), auth.sources)).toThrow();
  });
  it('preserves every C1C26 source-bound contract field and reference', () => {
    const pairs = [['lowest-roll-tie-closure','lowest-roll-tie-contract'], ['area-tie-closure','area-target-tie-contract'],
      ['summon-count-closure','summon-count-contract'], ['summon-supply-closure','summon-copy-policy'], ['bone-identity-closure','bone-identity-closure'],
      ['reanimation-order-closure','reanimation-order-contract'], ['room-capacity-closure','room-capacity-resolution'],
      ['cleanup-destination-closure','cleanup-destination-contract'], ['source-precedence-final','source-precedence-closure']];
    const walk = (old: any, now: any) => {
      if (!old || typeof old !== 'object') return;
      if (old.status === 'BOUND') { expect(now).toEqual(old); return; }
      for (const key of Object.keys(old)) walk(old[key], now?.[key]);
    };
    for (const [current, old] of pairs) walk(load('c1c26-necromancer-' + old + '.json'), get(current));
  });
  it('requires authoritative evidence on every resolved category', () => {
    const resolved = structuredClone(topics); resolved[0].status = 'RESOLVED';
    expect(() => validateStatuses(resolved, auth.sources)).toThrow();
    resolved[0].authoritativeResolutionEvidenceIds = ['original'];
    expect(() => validateStatuses(resolved, [authoritative])).not.toThrow();
  });
  it('denies community-only and unauthenticated mirror closure even if hash exists', () => {
    for (const status of ['COMMUNITY_ONLY','UNAUTHENTICATED_LEAD','REJECTED']) {
      const source = { ...authoritative, authorityStatus: status };
      expect(isClosureAuthority(source)).toBe(false);
      const resolved = structuredClone(topics); resolved[0].status = 'RESOLVED'; resolved[0].authoritativeResolutionEvidenceIds = ['original'];
      expect(() => validateStatuses(resolved, [source])).toThrow();
    }
  });
  it('requires mirror byte equality to authenticated original, not matching-looking prose', () => {
    const mirror = { ...authoritative, authorityStatus: 'TRANSPORT_MIRROR_VERIFIED_BYTES', byteEquality: null };
    expect(isClosureAuthority(mirror)).toBe(false);
    expect(isClosureAuthority({ ...mirror, byteEquality: { knownAuthoritySourceId: 'original', originalSha256: 'different', mirrorSha256: mirror.contentSha256 } })).toBe(false);
    expect(isClosureAuthority({ ...mirror, byteEquality: { knownAuthoritySourceId: 'original', originalSha256: mirror.contentSha256, mirrorSha256: mirror.contentSha256 } })).toBe(true);
  });
  it('never treats HTTP 403, 404, DNS failure or timeout as permanent unavailability', () => {
    for (const failure of ['ACCESS_DENIED_403','MISSING_404','DNS_FAILURE','TRANSPORT_TIMEOUT']) {
      expect(canExhaust({ ...completeExhaustion, accessFailuresAsExhaustionProof: true, failure }, [])).toBe(false);
      expect(canExhaust({ ...completeExhaustion, designerFaqCheckedOrAuthenticatedUnavailable: false, failure }, [])).toBe(false);
    }
    expect(load('c1c27-source-retrieval-evidence.json').receipts.every((r: any) => !r.permanentlyUnavailable)).toBe(true);
  });
  it('refuses exhaustion with any pending original authority or missing coverage evidence', () => {
    expect(canExhaust(completeExhaustion, [{ pendingAuthority: true }])).toBe(false);
    expect(canExhaust({ ...completeExhaustion, exhaustionEvidenceIds: [] }, [])).toBe(false);
    expect(canExhaust({ ...completeExhaustion, exhaustionEvidenceRecords: [] }, [])).toBe(false);
    expect(canExhaust({ ...completeExhaustion, exhaustionEvidenceRecords: [{ evidenceId: 'checked corpus', verified: true, kind: 'HTTP_403', proofReferences: ['response'], covers: completeExhaustion.exhaustionEvidenceRecords[0].covers }] }, [])).toBe(false);
    expect(canExhaust(completeExhaustion, [])).toBe(true);
    for (const key of Object.keys(completeExhaustion).filter(k => typeof (completeExhaustion as any)[k] === 'boolean' && k !== 'accessFailuresAsExhaustionProof')) {
      expect(canExhaust({ ...completeExhaustion, [key]: false }, [])).toBe(false);
    }
    expect(topics.every((t: any) => !canExhaust(t.exhaustionEvidence, auth.sources))).toBe(true);
  });
  it('requires fully structured tie decisions and keeps Hero and Area contracts distinct', () => {
    const hero = get('lowest-roll-tie-closure').deterministicTieContract;
    const area = get('area-tie-closure').deterministicTieContract;
    expect(structuredTie(hero)).toBe(false); expect(structuredTie(area)).toBe(false);
    expect(hero.tieParticipants).not.toEqual(area.tieParticipants);
    expect(get('area-tie-closure').characterPriorityAppliesToAreaTie).toBe(false);
    const tie = { tieParticipants: ['A','B'], tieBreakAuthority: 'explicit rule', reroll: true, playerChoice: false, activePlayer: false,
      firstPlayer: false, random: false, simultaneous: false, algorithm: 'reroll tied participants until one lowest result', sourceEvidenceIds: ['original'] };
    expect(structuredTie(tie)).toBe(true); expect(structuredTie({ ...tie, reroll: null })).toBe(false);
  });
  it('represents summon count for all three Levels and nine Skills without grammatical inference', () => {
    const c = get('summon-count-closure');
    expect(c.levelSummary.map((s: any) => s.level)).toEqual([1,2,3]); expect(c.skills).toHaveLength(9);
    expect(c.skills.every((s: any) => s.summonCount.value === null && s.summonCountBasis.value === null && s.targetAreaCount.value === 1)).toBe(true);
    expect(c.examples).toEqual([]); expect(c.candidateBases).toHaveLength(5);
  });
  it('separates six supply dimensions from observed physical copies', () => {
    const c = get('summon-supply-closure'); expect(c.policyDimensions).toHaveLength(6);
    expect(c.observedPhysicalCopies.filter((s: any) => s.ordinarySkillSummonEligible).map((s: any) => s.observedMiniatureManifestCount)).toEqual([3,3,3]);
    expect(c.campaignCopyPolicy.value).toBeNull(); expect(c.encounterSummonAvailability.value).toBeNull();
    expect(Object.values(c.runtimeSupplyLifecycle).every((s: any) => s.value === null)).toBe(true);
    expect(c.infiniteCloneAllowed || c.defaultDeadReuseAllowed || c.defaultExhaustedSkipAllowed).toBe(false);
  });
  it('retains Rabble/Rubble conflict and distinct Captain identities', () => {
    const b = get('bone-identity-closure');
    expect(b.nameConflict).toMatchObject({ printedName: 'Bone Rabble', rulebookLiteral: 'Bone Rubble', automaticAliasAllowed: false });
    expect(b.nameConflict.authoritativeName.value).toBeNull(); expect(b.identityOutcome).toBe('STILL_UNRESOLVED');
    expect(b.captain.components.map((c: any) => c.cardId).sort()).toEqual([46111,46600]); expect(b.captain.componentAssociation.value).toBeNull();
  });
  it('marks every Reanimation ordering step independently without inferring retained initiative', () => {
    const r = get('reanimation-order-closure');
    expect(Object.keys(r.fieldSourceStatus)).toEqual(Object.keys(r.order)); expect(Object.keys(r.order)).toHaveLength(8);
    expect(Object.values(r.order).every((s: any) => s.value === null)).toBe(true);
    expect(r.genericDeathThreshold.status).toBe('BOUND'); expect(r.runtimeSafe).toBe(false);
  });
  it('separates full Target Area displacement, nearest tie and entire Room full', () => {
    const r = get('room-capacity-closure'); expect(r.scenarios).toHaveLength(3);
    expect(r.miniatureDisplacement.status).toBe('BOUND'); expect(r.nearestAvailableAreaTie.value).toBeNull(); expect(r.noAvailableAreaFallback.value).toBeNull();
    expect(r.fullStanceSuppressionIsAreaFallback).toBe(false); expect(r.initialLargeDrawReplacementIsSummonFallback).toBe(false);
  });
  it('keeps Boss trio destination and reset separate from Room cleanup', () => {
    const c = get('cleanup-destination-closure'); expect(c.componentResetPolicy.map((r: any) => r.component)).toEqual(['bossIdentity','threatAbility','bossBattle']);
    expect(c.componentResetPolicy.every((r: any) => r.destination === null && r.resetSide === null)).toBe(true);
    expect(c.destinations.roomCard.status).toBe('BOUND'); expect(c.fullEncounterLifecycleReady).toBe(false);
  });
  it('freezes scoped precedence without inventing blanket FAQ/card hierarchy', () => {
    const p = get('source-precedence-final'); expect(p.hierarchy).toEqual(load('c1c26-necromancer-source-precedence-closure.json').hierarchy);
    expect(p.policyFrozen).toBe(true); expect(p.precedenceContract.appliedNewSupersessions).toEqual([]);
    expect(p.precedenceContract.correctionRequirements).toContain('supersession relationship');
  });
  it('rejects unrelated successful publisher response and incomplete HTTP 200 PDF transport', () => {
    expect(auth.sources.find((s: any) => s.sourceId === 'publisher-root').authorityStatus).toBe('REJECTED');
    const receipts = load('c1c27-source-retrieval-evidence.json').receipts;
    for (const r of receipts.filter((r: any) => r.exitCode !== 0)) expect(auth.sources.find((s: any) => s.sourceId === r.candidateId).authenticatedRuleContent).toBe(false);
  });
  it('derives continuation and denies descriptor-only partial runtime', () => {
    const d = a['c1c27-next-workstream-decision.json']; expect(d).toMatchObject(deriveDecision(topics, slices, auth.sources));
    expect(d.runtimeFoundationAllowed).toBe(false); expect(d.outcome).toBe('NECROMANCER_SOURCE_CLOSURE_CONTINUATION');
    const pseudo = { sourceStatus: 'SOURCE_COMPLETE_RUNTIME_MISSING', completeGameplaySlice: true, productionValidationPossible: true,
      nonReachableGateProven: true, reachableBlockerCategories: [], reachabilityEvidenceIds: [], productionProofEvidenceIds: [], expectedProductionReadyGain: 0 };
    expect(deriveDecision(topics, [pseudo], auth.sources).partialScopeAllowed).toBe(false);
  });
  it('requires full valid terminal proof before terminal selection', () => {
    const terminal = topics.map((t: any) => ({ ...t, status: 'SOURCE_EXHAUSTED_STILL_UNRESOLVED', exhaustionEvidence: completeExhaustion }));
    expect(deriveDecision(terminal, [], []).outcome).toBe('NECROMANCER_TERMINAL_BLOCKER_CONSOLIDATION');
    expect(deriveDecision(terminal, [], auth.sources).outcome).toBe('NECROMANCER_SOURCE_CLOSURE_CONTINUATION');
    const resolved = topics.map((t: any) => ({ ...t, status: 'RESOLVED' }));
    expect(deriveDecision(resolved, [], [], false).runtimeFoundationAllowed).toBe(false);
    expect(deriveDecision(resolved, [], [], true).outcome).toBe('NECROMANCER_RUNTIME_FOUNDATION_SELECTED');
  });
  it('rejects gameplay, other-family, tooling and prior-phase changes', () => {
    for (const p of ['src/game-engine/monster-ai.ts','src/data/bosses/necromancer-family.ts','src/data/bosses/prophet-family.ts',
      'vite.config.ts','docs/data/complete-edition/c1c26-necromancer-source-gap-register.json']) expect(() => verifyScope([p])).toThrow();
    expect(() => verifyScope(['scripts/audit/c1c27-contract.ts'])).not.toThrow();
    expect(() => verifyBaselineAndReceipts()).not.toThrow();
  });
  it('detects promotion, status, provenance and matrix drift in stored artifacts', () => {
    for (const [name, fn] of [
      ['c1c27-necromancer-semantic-completeness-matrix.json', (v: any) => { v.cards[0].semanticComplete = true; }],
      ['c1c27-authoritative-source-authentication.json', (v: any) => { v.sources[1].authorityStatus = 'AUTHORITATIVE_VERIFIED'; }],
      ['c1c27-necromancer-source-exhaustion-register.json', (v: any) => { v.topics[0].status = 'SOURCE_EXHAUSTED_STILL_UNRESOLVED'; }],
      ['c1c27-next-workstream-decision.json', (v: any) => { v.runtimeFoundationAllowed = true; }],
    ] as [string, (v: any) => void][]) expect(() => validateArtifacts(mutate(name, fn))).toThrow();
  });
  it('verifies deterministic stored artifacts without acquiring network sources', () => {
    expect(buildArtifacts()).toEqual(a);
    const stored = Object.fromEntries(Object.keys(a).map(n => [n, JSON.parse(readFileSync(root + n, 'utf8'))]));
    expect(() => validateArtifacts(stored)).not.toThrow();
    expect(readFileSync('scripts/audit/c1c27-contract.ts','utf8')).not.toMatch(/\bfetch\s*\(|curl\.exe.*spawn|https\.request/);
  });
  it('preserves upstream counts and historical E2E constraints', () => {
    const f = load('c1c26-necromancer-frozen-baseline-contracts.json');
    expect(f.upstreamCounts).toEqual({ trinket:'15/37',quest:'3/75',census:278,hamletEvent:'16 literal / 5 local semantic / 0 Ready',
      boss:'231 / 20 families',Battle:114,Threat:51,AbilityExclusive:12,Identity:54 });
    expect(f.upstreamManifest.historicalE2EFailures).toEqual(load('c1c25-necromancer-source-manifest.json').historicalE2EFailures);
  });
});
