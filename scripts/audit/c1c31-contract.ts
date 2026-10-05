import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { HEROES } from '../../src/data/heroes';
import { getHeroCombatDefinition, getHeroLevelDefinition } from '../../src/data/progression/hero-level-registry';
import { inspectBoneCombatDependency, resolveProductionMonsterDefinition } from '../../src/game-engine/bosses/component-adapters/bone-combat-adapter';
import { NECROMANCER_RULE_SET_VERSION, necromancerDefinition } from '../../src/game-engine/necromancer/contract-adapter';
import { createHeroInstance, createNewCampaign } from '../../src/game-engine/campaign';
import { necromancerProductionDependencyGate } from '../../src/game-engine/bosses/production-dependency-gate';
import { commitQuestSelection } from '../../src/game-engine/commands/quest';
import { seededRuntimeSources, withRuntimeSources } from '../../src/game-engine/runtime-sources';

export const root = 'docs/data/complete-edition/';
export const BASELINE_HEAD = '2ab674d7d8c15dbbd7367bb3b2011243facb5517';
export const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const source = (path: string, region: string, page?: number) => ({ path, sha256: sha(readFileSync(path)), region, ...(page ? { page } : {}) });
const rule = (page: number, region: string) => source(root + 'c1c19-rulebook-extracted-evidence.json', region, page);
const table = (skill: number) => [{ min: 1, max: 10, skill }];
const split = (a: number, cutoff: number, b: number) => [{ min: 1, max: cutoff, skill: a }, { min: cutoff + 1, max: 10, skill: b }];

/** A new review of the printed clusters; never mutates the C1C30 intake or runtime. */
export function reviewedBoneDefinitions() {
  const mappings = {
    'bone-rabble': { aggressive: table(1), defensive: table(1), ranged: table(1), support: table(2) },
    'bone-soldier': { aggressive: table(1), defensive: table(1), ranged: table(1), support: table(2) },
    'bone-spearman': { aggressive: split(2, 5, 1), defensive: split(2, 5, 1), ranged: table(1), support: table(1) },
    'bone-captain': { aggressive: split(1, 6, 2), defensive: split(1, 6, 2), ranged: table(2), support: table(2) },
  };
  return Object.entries(mappings).map(([id, stanceSelections]) => {
    const previous = inspectBoneCombatDependency(id)!;
    const skills = previous.skills.map(s => ({ ...s, targetDebuffTurns: 0, targetStunTurns: id === 'bone-captain' && s.number === 2 ? 2 : 0 }));
    return { ...previous, skills, stanceSelections, immunities: id === 'bone-captain' ? ['bleed', 'stun'] : previous.immunities,
      status: 'SOURCE_REVIEW_COMPLETE', executableProductionDefinition: false, normalSkillSummonPool: id !== 'bone-captain',
      unresolvedFields: [], authority: 'OFFICIAL_SOURCE', canonical: true,
      canonicalMissingStatus: 'RESOLVED_BY_LOCKED_PRINTED_CLUSTER_REVIEW',
      reviewNote: 'Explicit cluster transcription under core p21/p24; historical C1C30 interpretation is preserved separately.',
      sourceReferences: [...previous.sourceReferences, rule(21, 'Stance determines the printed Skill; roll only for multiple Skills'),
        rule(24, 'Monster Card anatomy: Stance/Skill Eligibility'), ...(id === 'bone-soldier' ? [rule(16, 'Soldier card in setup illustration')] : [])],
      derivedSemanticRelation: id === 'bone-rabble' || id === 'bone-soldier'
        ? 'The adjacent Aggressive/Defensive/Ranged cluster shares the trailing printed 1; the separate Support cluster has 2.'
        : id === 'bone-spearman'
          ? 'Aggressive/Defensive share the printed 2 on 1-5 and 1 on 6-10; Ranged/Support share the trailing 1.'
          : 'Aggressive/Defensive share 1 on 1-6 and 2 on 7-10; Ranged/Support share 2. The grey right-hand artwork is not another selection table.',
      printedField: 'Bottom Stance/Skill Eligibility clusters, not one independent number per icon',
      corrections: id === 'bone-captain' ? ['Yellow three-diamond immunity is Stun, not Debuff.', 'Ground Pound Target yellow three-diamond 2t is Stun, not Debuff.'] : [],
      productionPromotion: 'STOPPED_PENDING_HERO_DODGE_RULING_AND_GENERIC_EXECUTOR_BINDING',
    };
  });
}

/** Production currently imposes no Necromancer-specific roster restriction. */
export function requiredHeroCoverage() {
  return HEROES.flatMap(hero => ([1, 2, 3] as const).filter(level => !!getHeroLevelDefinition(hero.id, level)).map(level => {
    const binding = getHeroCombatDefinition(hero.id, level);
    return { requiredPair: `${hero.id}:${level}`, heroId: hero.id, level, productionReachable: true,
      reachabilityReason: 'Selectable/replacement Hero in the standard registry; independent Guild upgrades remain reachable in Acts II/III.',
      sourceStatus: binding ? 'OFFICIAL_SOURCE' : 'SOURCE_UNRESOLVED', dodge: binding?.dodge ?? null,
      sourceReferences: binding?.sourceReferences ?? [], executable: !!binding };
  }));
}

function frozenBaseline() {
  const paths = readdirSync(root).filter(n => /^c1c(?:2[0-9]|30)-.*\.json$/.test(n)).map(n => root + n);
  paths.push(root + 'rule-source-policy.json', 'AGENTS.md', 'src/game-engine/bosses/foundation.ts',
    root + 'c1c19-rulebook-extracted-evidence.json',
    'scripts/audit/c1c30-contract.ts', 'scripts/audit/c1c30-printed-review.cjs',
    'src/audit/c1c30-necromancer-runtime-foundation.test.ts', 'e2e/c1c30-necromancer-dependency-gate.spec.ts',
    'docs/reports/complete-edition/c1c30-necromancer-runtime-foundation-continuation-report.md',
    'docs/reports/complete-edition/c1c30-validation-report.md',
    'src/game-engine/bosses/production-dependency-gate.ts', 'src/game-engine/bosses/component-adapters/bone-combat-adapter.ts',
    'src/data/progression/hero-level-registry.ts', 'src/game-engine/necromancer/contract-adapter.ts',
    'src/audit/c1c27-necromancer-source-closure.test.ts', 'src/audit/c1c28-necromancer-project-rulings.test.ts');
  return Object.fromEntries(paths.sort().map(path => {
    const before = execFileSync('git', ['show', `${BASELINE_HEAD}:${path}`], { maxBuffer: 32 * 1024 * 1024 }).toString().replace(/\r\n/g, '\n');
    const after = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    if (!['src/game-engine/bosses/foundation.ts','src/game-engine/bosses/production-dependency-gate.ts','src/game-engine/bosses/component-adapters/bone-combat-adapter.ts','scripts/audit/c1c30-contract.ts'].includes(path) && before !== after) throw new Error(`Frozen C1C30 baseline changed: ${path}`);
    return [path, sha(['src/game-engine/bosses/foundation.ts','src/game-engine/bosses/production-dependency-gate.ts','src/game-engine/bosses/component-adapters/bone-combat-adapter.ts','scripts/audit/c1c30-contract.ts'].includes(path) ? before : after)];
  }));
}

export function buildArtifacts(): Record<string, unknown> {
  const frozenInputSha256 = frozenBaseline();
  const bones = reviewedBoneDefinitions();
  const heroes = requiredHeroCoverage();
  const missing = heroes.filter(h => !h.executable);
  const extract = JSON.parse(readFileSync(root + 'c1c19-rulebook-extracted-evidence.json', 'utf8')) as { source: string; sourceSha256: string; pages: Array<{ page: number; text: string }> };
  if (sha(readFileSync(extract.source)) !== extract.sourceSha256) throw new Error('Locked rulebook hash mismatch');
  for (const ref of [...bones.flatMap(b => b.sourceReferences), ...heroes.flatMap(h => h.sourceReferences)]) {
    if (sha(readFileSync(ref.path)) !== ref.sha256) throw new Error(`Source hash mismatch: ${ref.path}`);
  }
  const common = { schemaVersion: 1, phase: '11A.4-C1C31', baselineHead: BASELINE_HEAD,
    ruleSourcePolicyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1', ruleSetVersion: NECROMANCER_RULE_SET_VERSION,
    externalSourceUsed: false, syntheticFallbackAllowed: false };
  const reviewId = 'C1C31-HERO-DODGE-EXPLICIT-TABLE-REVIEW';
  const entryAttempt = withRuntimeSources(seededRuntimeSources(31), () => {
    const c = createNewCampaign();
    c.runtimeContentProfile = 'community-complete-edition'; c.gamePhase = 'quest-select';
    c.heroes = ['crusader', 'highwayman', 'vestal', 'hellion'].map((id, i) => createHeroInstance(id, i)!);
    c.campaignProgress.activeThreatId = 'necromancer-threat-level-1'; c.campaignProgress.activeBossFamilyId = 'necromancer';
    c.campaignProgress.pendingThreatInitialization = false; c.campaignProgress.completedStandardQuestsThisAct = 2;
    c.campaignProgress.bossQuestRequired = true;
    const initialHash = sha(JSON.stringify(c));
    const gate = necromancerProductionDependencyGate(c, 1);
    const selected = commitQuestSelection(c, 'face-the-threat');
    if (gate.enabled || selected.error !== 'necromancer-production-dependencies-unbound' || selected.campaign !== c) {
      throw new Error('Production entry changed; review the terminal decision and proofs');
    }
    return { initialHash, afterAttemptHash: sha(JSON.stringify(selected.campaign)), commandError: selected.error,
      unresolvedDependencies: gate.unresolved, syntheticFallbackAllowed: gate.syntheticFallbackAllowed };
  });
  const capabilities = {
    coreBossDefinitions: { status: 'IMPLEMENTED', count: ([1, 2, 3] as const).map(necromancerDefinition).length * 3 },
    BoneCombatDefinitions: { status: 'PARTIAL', stanceSourceClosure: '4/4', executableDefinitions: 0, note: 'Reviewed clusters and Captain Stun correction; runtime promotion stopped.' },
    HeroDodgeBinding: { status: 'PARTIAL', requiredPairs: heroes.length, boundPairs: heroes.length - missing.length, reviewId },
    BoneSkillExecutor: { status: 'BLOCKED', note: 'Generic source-bound Area turn pipeline is not implemented; Phase 3 is not a substitute.' },
    NormalSelectorEntry: { status: 'BLOCKED', note: 'Actual production command rejects missing Hero/Bone bindings before entering.' },
    ThreatCheckpointResume: { status: 'PARTIAL', note: 'C1C30 isolation bridge retained; real Room entry cannot be certified.' },
    HamletEffectBridge: { status: 'BLOCKED', note: 'Graveyard campaign transaction bridge remains unimplemented.' },
    IncomingAttackReaction: { status: 'BLOCKED', note: 'Per-Hero staged incoming Trinket windows remain unimplemented.' },
    RoomStorage: { status: 'BLOCKED', note: 'Authoritative physical Room card/tile storage remains unimplemented.' },
    BossResistanceIntegration: { status: 'PARTIAL', note: 'Generic categorical Debuff/Shuffle binding remains unimplemented.' },
    SaveReplayProduction: { status: 'BLOCKED', note: 'No real complete dependency path exists. No fabricated hash proof.' },
  };
  const requests = missing.map(h => ({ rulingId: `C1C31-DODGE-${h.heroId.toUpperCase()}-L${h.level}`,
    requiredPair: h.requiredPair, canonicalStatus: 'SOURCE_UNRESOLVED', authority: 'PROJECT_RULING', canonical: false,
    status: 'DRAFT_REVIEW_REQUIRED', proposedDodge: 0, proposedRuleSetVersion: 'C1C31-DIGITAL-DEFAULT-v2',
    inherits: NECROMANCER_RULE_SET_VERSION,
    rationale: 'Explicit conservative no-evasion digital value for this pair only; no claim of printed accuracy, no array default and no Level I inheritance.',
    riskClassification: 'HIGH_COMBAT_BALANCE', risk: 'Unverified zero Dodge changes hit probability, deaths and resource consumption; locked evidence cannot determine the class/level value.',
    affectedRuntimePaths: ['Boss multi-Hero attack', 'Bone turn', 'incoming Trinket window', 'production selector dependency gate'],
    saveReplayImpact: 'Persist this resolved pair and v2 provenance in attack continuations/checkpoint bindings. Never reroll after reload.',
    migrationImpact: 'No silent v1 upgrade. Existing v1 saves load with v1; activation would require explicit migration metadata and tests.',
    futureOverrideAllowed: true }));
  const dependencies = [
    ...bones.map(b => ({ dependencyId: b.monsterId, sourceType: 'LOCKED_PRINTED_COMPONENT_AND_RULEBOOK',
      sourceArtifact: root + 'c1c31-necromancer-bone-definition-proof.json', runtimeDefinition: null,
      status: 'REVIEWED_NOT_EXECUTABLE', authority: 'OFFICIAL_SOURCE', ruleSetVersion: NECROMANCER_RULE_SET_VERSION, syntheticFallbackAllowed: false })),
    ...heroes.map(h => ({ dependencyId: `hero-dodge:${h.requiredPair}`, sourceType: h.sourceStatus,
      sourceArtifact: root + 'c1c31-necromancer-required-hero-combat-coverage.json', runtimeDefinition: h.executable ? 'getHeroCombatDefinition' : null,
      status: h.executable ? 'IMPLEMENTED' : 'DIGITAL_RULING_REVIEW_REQUIRED', authority: h.executable ? 'OFFICIAL_SOURCE' : 'UNRESOLVED',
      ruleSetVersion: NECROMANCER_RULE_SET_VERSION, syntheticFallbackAllowed: false })),
  ];
  const blockedScenario = (scenario: string) => ({ scenario, status: 'PRODUCT_FAILURE', productionAcceptance: false,
    initialHash: null, saveHash: null, reloadedHash: null, finalHash: null, eventSequence: [], ruleSetVersion: NECROMANCER_RULE_SET_VERSION,
    reason: 'Production selector prerequisite fails before these transitions. Null hashes denote unavailable evidence, never a successful proof.' });
  return {
    'c1c31-necromancer-bone-definition-proof.json': { ...common, authority: 'OFFICIAL_SOURCE', sourceReviewed: 4,
      executableProductionDefinitions: 0, bones, runtimePromotionStopped: true },
    'c1c31-necromancer-required-hero-combat-coverage.json': { ...common, reachabilityAuthority: 'EXISTING_PRODUCTION_ROSTER_AND_GUILD',
      rosterSource: source('src/data/heroes.ts', 'Selectable standard Hero roster'), requiredPairs: heroes },
    'c1c31-necromancer-hero-combat-coverage.json': { ...common, status: 'DIGITAL_RULING_REVIEW_REQUIRED',
      coverageComplete: false, requiredPairCount: heroes.length, boundPairCount: heroes.length - missing.length,
      missingPairs: missing.map(h => h.requiredPair), zeroFallbackAllowed: false, levelInheritanceAllowed: false },
    'c1c31-necromancer-production-dependency-binding.json': { ...common, frozenInputSha256, dependencies },
    'c1c31-necromancer-runtime-capability-matrix.json': { ...common, capabilities, allCapabilityGatesImplemented: false,
      foundationAccepted: false, productionReady: 0 },
    'c1c31-necromancer-contract-review.json': { ...common, reviewId, status: 'EXPLICIT_DIGITAL_RULING_REVIEW_REQUIRED',
      c1c28RulingChanged: false, newProjectRulingActivated: false, proposedVersion: 'C1C31-DIGITAL-DEFAULT-v2',
      approvedRuleSetVersion: NECROMANCER_RULE_SET_VERSION,
      sourceReview: { reviewedPages: [10, 11, 16, 19, 20, 21, 22, 23, 24, 29, 38, 42],
        rulebook: source(extract.source, 'Locked official core rulebook'),
        dodgeMentionPages: extract.pages.filter(p => /dodge/i.test(p.text)).map(p => p.page),
        conclusion: 'These locked rulebook examples bind three Level I pairs. No reviewed locked printed Hero board binds the remaining reachable pairs. Generic Dodge/level-up rules do not specify those numbers.',
        boneStanceConclusion: 'Printed cluster mapping closes the eight earlier null fields without any Bone Stance project ruling.' },
      rulingRequests: requests,
      alternative: 'A restriction to the three bound Level I pairs would change the current selector/Guild/replacement scope and still cannot cover required Level II/III paths.',
      affectedPromotionStopped: Object.keys(capabilities).filter(k => k !== 'coreBossDefinitions'),
      implementationDebtAfterReview: Object.entries(capabilities).filter(([, c]) => c.status !== 'IMPLEMENTED').map(([id, c]) => ({ id, status: c.status })),
      returnToSourceAcquisition: false, ordinaryFoundationContinuationAllowed: false },
    'c1c31-necromancer-production-runtime-proof.json': { ...common, status: 'PRODUCT_FAILURE', productionAcceptance: false,
      failureBoundary: 'NORMAL_SELECTOR_DEPENDENCY_VALIDATION', normalSelectorPass: false, realBoneExecutionPass: false,
      entryAttempt, pendingChoiceProductionProof: 'NOT_REACHED', browserEvidence: 'docs/reports/complete-edition/c1c31-validation/e2e.log' },
    'c1c31-necromancer-production-save-replay-proof.json': { ...common, status: 'BLOCKED', productionAcceptance: false,
      scenarios: ['A selector → Threat → Room → Skill → real Bone summon', 'B Bone turn → reaction window',
        'C Bone death → Reanimation → initiative', 'D Boss victory → cleanup → campaign'].map(blockedScenario) },
    'c1c31-next-workstream-decision.json': { ...common, decision: 'NECROMANCER_DIGITAL_RULING_REVIEW_REQUIRED',
      verdict: 'NECROMANCER_RUNTIME_FOUNDATION_BLOCKED_BY_EXPLICIT_DIGITAL_RULING_REVIEW',
      nextWorkstream: 'C1C31-HERO-DODGE-EXPLICIT-TABLE-REVIEW', c1c32IntegrationSelected: false, foundationAccepted: false,
      productionReady: 0, ordinaryFoundationContinuationAllowed: false, returnToSourceAcquisition: false,
      reason: `${missing.length} reachable Hero class/level Dodge pairs need an explicit digital table; draft values have HIGH_COMBAT_BALANCE risk and are not activated. All unfinished bridges remain disclosed; they are not reclassified as ruling questions.` },
  };
}

export function verifyArtifacts() {
  for (const [name, expected] of Object.entries(buildArtifacts())) {
    const saved = JSON.parse(readFileSync(root + name, 'utf8'));
    if (JSON.stringify(saved) !== JSON.stringify(expected)) throw new Error(`C1C31 artifact mismatch: ${name}`);
  }
  if (reviewedBoneDefinitions().some(b => resolveProductionMonsterDefinition(b.monsterId))) throw new Error('Unreviewed runtime promotion');
}
