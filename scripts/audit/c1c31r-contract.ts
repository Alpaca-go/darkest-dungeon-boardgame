import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { necromancerDefinition } from '../../src/game-engine/necromancer/contract-adapter';
import type { CombatSourceReference } from '../../src/types/component-combat';

export const root = 'docs/data/complete-edition/';
export const BASELINE_HEAD = '02d18d00ece61c9136ac0821ee5ce30ada038191';
export const V1 = 'C1C28-DIGITAL-DEFAULT-v1';
export const V2 = 'C1C31-DIGITAL-DEFAULT-v2';
export const SELECTED_CANDIDATE = 'B_CLASS_BASELINE';
export const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const reference = (path: string, region: string) => ({ path, sha256: sha(readFileSync(path)), region });
type RequiredPair = { heroId: string; level: 1 | 2 | 3; sourceStatus: string; dodge: number | null; sourceReferences: CombatSourceReference[] };
const required = (JSON.parse(readFileSync(root + 'c1c31-necromancer-required-hero-combat-coverage.json', 'utf8')) as { requiredPairs: RequiredPair[] }).requiredPairs;
const heroIds = ['crusader', 'vestal', 'highwayman', 'hellion', 'leper', 'occultist', 'plague-doctor', 'grave-robber'];
const baseline: Record<string, number> = { crusader: 0, vestal: 1, highwayman: 1, hellion: 1,
  leper: 1, occultist: 1, 'plague-doctor': 1, 'grave-robber': 1 };
const round = (n: number) => Number(n.toFixed(8));

/** Exhaustive ten-face enumeration, not stochastic simulation or an acceptance engine. */
export function impact(accuracy: number, dodge: number, crit: number = 0, accuracyModifier = 0, dodgeModifier = 0, critModifier = 0) {
  if (![accuracy, dodge, crit, accuracyModifier, dodgeModifier, critModifier].every(Number.isInteger)
    || dodge < 0 || crit < 0) throw new Error('Invalid impact input');
  const hitRolls = Array.from({ length: 10 }, (_, i) => i + 1).filter(r => r <= accuracy + accuracyModifier - dodge - dodgeModifier);
  const criticalHitRolls = hitRolls.filter(r => r <= crit + critModifier);
  return { accuracy, dodge, crit, accuracyModifier, dodgeModifier, critModifier, hitRolls, criticalHitRolls,
    hitProbability: hitRolls.length / 10, criticalHitProbability: criticalHitRolls.length / 10,
    normalHitProbability: (hitRolls.length - criticalHitRolls.length) / 10,
    missProbability: (10 - hitRolls.length) / 10 };
}

export function candidates() {
  return [
    { candidateId: 'A_ZERO_FILL', name: 'Zero Fill', rule: 'Every unresolved pair explicitly receives 0; official pairs stay fixed.',
      reason: 'Comparison baseline only. It erases the known nonzero-class benefit at higher levels and supplies no evasion to all unresolved classes.' },
    { candidateId: SELECTED_CANDIDATE, name: 'Class Baseline', rule: 'Crusader class baseline 0; each of the other seven classes baseline 1, identical at all three levels.',
      reason: 'Keep the three official anchors; choose 1 for every unknown class as the smallest nonzero value and modal known Level I value. No fantasy/stat inference or invented upgrade benefit. Higher-level equality is an explicit project design decision, not official inheritance.' },
    { candidateId: 'C_LEVEL_PROGRESSION', name: 'Level Progression', rule: 'Explicit rows use class baseline + (level - 1): Crusader 0/1/2, other classes 1/2/3.',
      reason: 'Comparison only. Adds 10–20 percentage points of evasion per upgraded Hero and overlaps existing HP/slot/resistance progression; no evidence establishes such an additional benefit.' },
  ].map(candidate => ({ ...candidate, selected: candidate.candidateId === SELECTED_CANDIDATE,
    use: 'DIGITAL_DESIGN_COMPARISON', officialAuthorityForUnknownValues: false,
    rows: required.map(pair => ({ heroId: pair.heroId, level: pair.level,
      dodge: pair.sourceStatus === 'OFFICIAL_SOURCE' ? pair.dodge!
        : candidate.candidateId === 'A_ZERO_FILL' ? 0
          : candidate.candidateId === SELECTED_CANDIDATE ? baseline[pair.heroId] : baseline[pair.heroId] + pair.level - 1,
      authority: pair.sourceStatus === 'OFFICIAL_SOURCE' ? 'OFFICIAL_SOURCE' : 'PROJECT_RULING',
      canonical: pair.sourceStatus === 'OFFICIAL_SOURCE' })) }));
}

export function finalTable() {
  return required.map(pair => {
    const official = pair.sourceStatus === 'OFFICIAL_SOURCE';
    const dodge = official ? pair.dodge! : baseline[pair.heroId];
    const rulingId = official ? null : `C1C31R-DODGE-${pair.heroId.toUpperCase()}-L${pair.level}`;
    return { heroId: pair.heroId, level: pair.level, dodge, authority: official ? 'OFFICIAL_SOURCE' : 'PROJECT_RULING',
      canonical: official, canonicalSourceStatus: official ? 'OFFICIAL_SOURCE' : 'SOURCE_UNRESOLVED',
      rulingId, ruleSetVersion: V2, sourceReferences: pair.sourceReferences,
      reason: official ? 'Frozen source-bound Level I value retained unchanged.'
        : pair.heroId === 'crusader'
          ? 'Explicit Crusader class baseline 0 at this level, anchored to known Crusader I. No official higher-level value is inferred.'
          : 'Explicit class baseline 1 at this level. One minimal nonzero design value for all seven non-Crusader classes avoids unsupported per-class distinctions and level scaling.',
      ...(official ? {} : { riskMetadata: {
        classification: 'HIGH_COMBAT_BALANCE', boundedRange: [0, 1],
        perAttackHitChangeVsZeroFillPercentagePoints: dodge === 0 ? 0 : -10,
        saturationNote: 'Ten-point reduction only in the unsaturated threshold region. Accuracy 11/12 at Dodge 1 remains 100%.',
        rationale: 'Balance consequence is quantified, not certified by a complete campaign simulation.',
        affectedPaths: ['Boss hit/miss', 'Bone hit/miss', 'Hero damage/death', 'Trinket incoming reaction', 'summon/Reanimation consequences', 'campaign resource consumption'],
        saveReplayImpact: 'Resolved value, authority, ruling ID and recorded rule version must survive saves and rule-only replays.',
        migrationImpact: 'Explicit pre-encounter upgrade only; any existing Battle or Threat checkpoint blocks migration.',
        futureOverrideAllowed: true, futureOverridePolicy: 'A new version and explicit migration, never an in-place v2 edit.' } }),
    };
  });
}

function attacks() {
  const boss = ([1, 2, 3] as const).flatMap(level => necromancerDefinition(level).skills.map(s => ({
    attackId: `necromancer:L${level}:skill${s.number}`, accuracy: s.accuracy, crit: typeof s.crit === 'number' ? s.crit : null,
    damage: typeof s.damage === 'number' ? s.damage : null, critDamage: typeof s.critDamage === 'number' ? s.critDamage : null,
    sourceArtifact: root + 'c1c28-necromancer-runtime-semantic-contract.json',
  })));
  const bone = JSON.parse(readFileSync(root + 'c1c31-necromancer-bone-definition-proof.json', 'utf8')) as {
    bones: Array<{ monsterId: string; skills: Array<{ number: number; accuracy: number; crit: number; damage: number; critDamage: number }> }> };
  return [...boss, ...bone.bones.flatMap(b => b.skills.map(s => ({ attackId: `${b.monsterId}:skill${s.number}`,
    accuracy: s.accuracy, crit: s.crit, damage: s.damage, critDamage: s.critDamage,
    sourceArtifact: root + 'c1c31-necromancer-bone-definition-proof.json' })))];
}

function frozenBaseline() {
  const paths = readdirSync(root).filter(n => /^c1c(?:2[0-9]|30|31)-.*\.json$/.test(n)).map(n => root + n);
  paths.push(root + 'rule-source-policy.json', root + 'c1c19-rulebook-extracted-evidence.json',
    'src/game-engine/bosses/foundation.ts', 'src/game-engine/bosses/production-dependency-gate.ts',
    'src/game-engine/bosses/component-adapters/bone-combat-adapter.ts', 'src/game-engine/necromancer/contract-adapter.ts',
    'src/data/progression/hero-level-registry.ts', 'scripts/audit/c1c31-contract.ts',
    'src/audit/c1c27-necromancer-source-closure.test.ts', 'src/audit/c1c28-necromancer-project-rulings.test.ts');
  return Object.fromEntries(paths.sort().map(path => {
    const before = execFileSync('git', ['show', `${BASELINE_HEAD}:${path}`], { maxBuffer: 32 * 1024 * 1024 }).toString().replace(/\r\n/g, '\n');
    const after = readFileSync(path, 'utf8').replace(/\r\n/g, '\n');
    if (before !== after) throw new Error(`C1C31R frozen baseline changed: ${path}`);
    return [path, sha(after)];
  }));
}

export function buildArtifacts(): Record<string, unknown> {
  const frozenInputSha256 = frozenBaseline();
  const table = finalTable();
  const expectedPairs = heroIds.flatMap(id => [1, 2, 3].map(level => `${id}:${level}`));
  if (table.length !== 24 || new Set(table.map(r => `${r.heroId}:${r.level}`)).size !== 24
    || expectedPairs.some(key => !table.some(r => `${r.heroId}:${r.level}` === key))) throw new Error('Required 24-pair coverage changed');
  for (const row of table) for (const ref of row.sourceReferences) {
    if (sha(readFileSync(ref.path)) !== ref.sha256) throw new Error(`Official Dodge source changed: ${ref.path}`);
  }
  const common = { schemaVersion: 1, phase: '11A.4-C1C31R', baselineHead: BASELINE_HEAD,
    ruleSourcePolicyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1', externalSourceAcquisition: false };
  const bands = attacks();
  const candidateTables = candidates();
  const comparisons = candidateTables.map(c => {
    const rows = bands.map(a => {
      const perPair = c.rows.map(r => ({ heroId: r.heroId, level: r.level,
        ...impact(a.accuracy, r.dodge, a.crit ?? 0) }));
      const meanHit = (list: typeof perPair) => round(list.reduce((n, r) => n + r.hitProbability, 0) / list.length);
      return { ...a, printedCritApplicable: a.crit !== null, perPair,
        meanHitProbabilityUniformPairs: meanHit(perPair),
        meanHitProbabilityUnknownPairs: meanHit(perPair.filter(r => table.find(t => t.heroId === r.heroId && t.level === r.level)!.authority === 'PROJECT_RULING')),
        meanHitProbabilityByHeroLevel: [1, 2, 3].map(level => ({ level, meanHitProbability: meanHit(perPair.filter(r => r.level === level)) })) };
    });
    return { candidateId: c.candidateId, weighting: 'Uniform pairs, diagnostic only; not encounter-frequency or campaign difficulty weighting.',
      attacks: rows, minimumRealAttackHitProbability: Math.min(...rows.flatMap(r => r.perPair.map(p => p.hitProbability))) };
  });
  const differences = comparisons.map(c => ({ candidateId: c.candidateId, perAttack: c.attacks.map(a => ({
    attackId: a.attackId,
    changeVsZeroFillPercentagePoints: round(100 * (a.meanHitProbabilityUniformPairs - comparisons[0].attacks.find(z => z.attackId === a.attackId)!.meanHitProbabilityUniformPairs)),
  })) }));
  const mathReferences = ['src/game-engine/bosses/foundation.ts', 'src/game-engine/combat-resolution.ts',
    'src/game-engine/battle.ts', 'src/game-engine/trinkets/battle-trinket-bridge.ts'].map(p => reference(p, 'Current mathematical/bridge implementation review; code is behavior evidence, not official rule authority'));
  return {
    'c1c31r-hero-dodge-candidate-tables.json': { ...common, selectedCandidate: SELECTED_CANDIDATE,
      candidates: candidateTables, sourceBoundPairsPreserved: 3, prototypeValuesUsed: false,
      selectionPriority: ['Preserve official pairs', 'Bound hit-rate distortion', 'Avoid invented progression', 'Minimize per-class exceptions', 'Deterministic versioning', 'Cheap future versioned override'] },
    'c1c31r-dodge-impact-matrix.json': { ...common, method: 'EXACT_D10_ENUMERATION',
      mathematicalReview: { references: mathReferences,
        productionFoundationEquation: 'hit = roll <= Accuracy - Dodge; critical damage only when hit && roll <= printed Crit. No natural-10 auto-hit.',
        criticalRuleScope: 'This review models the current foundation implementation. It does not decide new critical behavior or change the inherited v1 Boss contract.',
        legacyPrototypeEquation: 'resolveAttackFromRoll forces natural 10 hit/critical; staged legacy Monster attacks subtract Trinket dodgeModifier but do not bind base Hero Dodge. Not a substitute for production Bone mathematics.',
        trinketModifiers: 'Incoming bridge accumulates dodge modifiers before hit and damage scales/forced critical after hit. Boss integration remains engineering debt; sensitivities are not evidence of working Boss reactions.',
        conditionModifiers: 'Locked p21: Mark modifies attacker Accuracy; Buff/Debuff modify Crit, not base Dodge. Current foundation attack does not bind these modifiers. Sensitivities below model their arithmetic without wiring them.',
        baseDodgeIsNotEffectiveDodge: true, stackingAndLegalTrinketEligibilityReviewedHere: false },
      typicalGrid: [3, 4, 5, 6, 7].flatMap(a => [0, 1, 2, 3].map(d => impact(a, d))),
      actualAccuracyGrid: [...new Set(bands.map(a => a.accuracy))].sort((a, b) => a - b).flatMap(a => [0, 1, 2, 3].map(d => impact(a, d))),
      modifierSensitivities: [3, 4, 5, 6, 7, 9, 10, 11, 12].flatMap(a => [0, 1, 2, 3].flatMap(d => [
        { kind: 'ADDITIVE_DODGE_1_MODEL_ONLY', ...impact(a, d, 1, 0, 1) },
        { kind: 'ACCURACY_PLUS_1_MODEL_ONLY', ...impact(a, d, 1, 1) },
        { kind: 'CRIT_PLUS_1_MODEL_ONLY', ...impact(a, d, 1, 0, 0, 1) },
      ])), candidateComparisons: comparisons, differences,
      boundsReview: { selectedBaseDodgeRange: [0, 1], candidateCBaseRange: [0, 3],
        selectedMinimumRealAttackHitProbability: comparisons[1].minimumRealAttackHitProbability,
        campaignBalanceSimulationPerformed: false, claim: 'Bounds and hit-rate comparison only; not a full game balance certification.' } },
    'c1c31r-hero-dodge-final-table.json': { ...common, status: 'ACCEPTED_FROZEN',
      ruleSetVersion: V2, inherits: V1, selectedCandidate: SELECTED_CANDIDATE, officialPairs: 3, projectRulingPairs: 21,
      rows: table, fallbackAllowed: false, runtimeLevelInheritanceAllowed: false,
      designRationale: 'Class equality is explicitly ruled in 24 rows. Unknown class baseline 1 matches the modal known value, avoids zero-fill difficulty shifts in the unsaturated region, and adds no level-up evasion benefit.' },
    'c1c31r-project-rulings-v2.json': { ...common, rulingSetVersion: V2, inherits: V1,
      status: 'ACCEPTED_FROZEN', overlayScope: 'HERO_DODGE_ONLY', inheritedBossRulingsModified: false,
      inheritedArtifact: reference(root + 'c1c28-necromancer-project-rulings.json', 'Immutable v1 inherited Boss rulings'),
      rulings: table.filter(r => r.authority === 'PROJECT_RULING').map(r => ({ ...r, status: 'ACCEPTED', futureOverrideAllowed: true })) },
    'c1c31r-ruleset-migration.json': { ...common, policyId: 'C1C31R-PRE-ENCOUNTER-EXPLICIT-MIGRATION-v1',
      fromVersion: V1, toVersion: V2, liveCampaignMigrationAllowed: 'EXPLICIT_PRE_ENCOUNTER_ONLY',
      changedRulings: table.filter(r => r.rulingId).map(r => r.rulingId),
      affectedSaveFields: ['campaign.heroDodgeRuleSetSelection', 'campaign.heroDodgeReplayRecords'],
      startedBattleMigrationAllowed: false, settledThreatCheckpointMigrationAllowed: false,
      activeEncounterPolicy: 'KEEP_RECORDED_V1_WITH_V1_BINDINGS', preEncounterPolicy: 'EXPLICIT_COMMAND_WITH_NONEMPTY_MIGRATION_ID',
      replayCompatibility: 'ALWAYS_USE_RECORDED_VERSION; v1 replays retain three source-bound pairs and hard-fail unsupported pairs.',
      legacyMissingVersionPolicy: 'READ_AS_V1; do not write v2 metadata during load or sanitation.',
      historicalRecordsMigrationAllowed: false, idempotency: 'Same completed migration ID returns unchanged campaign; a different ID cannot replace provenance.',
      fullBossRuntimeV2Promoted: false },
    'c1c31r-next-workstream-decision.json': { ...common, verdict: 'C1C31-HERO-DODGE-EXPLICIT-TABLE-REVIEW-ACCEPTED',
      selectedCandidate: SELECTED_CANDIDATE, selectedRuleSetVersion: V2, officialPairs: 3, projectRulingPairs: 21,
      requiredPairs: 24, missingPairs: 0, remainingRuleBlockers: 0,
      remainingRuleBlockersScope: 'Known Hero Dodge explicit-table blocker only; not a claim about every future combat rule.',
      migrationPolicy: 'C1C31R-PRE-ENCOUNTER-EXPLICIT-MIGRATION-v1', frozenInputSha256,
      nextWorkstream: 'C1C32 Necromancer Runtime Foundation Finalization', runtimeIntegrationSelected: false,
      foundationAccepted: false, productionReady: 0,
      implementationDebt: ['Activate four frozen Bone definitions and Captain Stun correction', 'Generic Bone Skill executor',
        'Normal selector', 'Production Threat checkpoint resume', 'Hamlet Graveyard bridge', 'Incoming Trinket reactions',
        'Authoritative Room storage', 'Boss resistance integration', 'Real production save/replay'],
      laterWorkstream: 'C1C33 Runtime Integration & Production Proof' },
  };
}
export function verifyArtifacts() {
  for (const [name, value] of Object.entries(buildArtifacts())) {
    if (JSON.stringify(JSON.parse(readFileSync(root + name, 'utf8'))) !== JSON.stringify(value)) throw new Error(`C1C31R artifact mismatch: ${name}`);
  }
}
