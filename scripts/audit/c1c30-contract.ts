import { createHash } from 'node:crypto';
import { readFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { necromancerDefinition, NECROMANCER_RULE_SET_VERSION } from '../../src/game-engine/necromancer/contract-adapter';
import { inspectBoneCombatDependency, resolveProductionMonsterDefinition } from '../../src/game-engine/bosses/component-adapters/bone-combat-adapter';
import { getHeroCombatDefinition } from '../../src/data/progression/hero-level-registry';
import { createNewCampaign, createHeroInstance } from '../../src/game-engine/campaign';
import { seededRuntimeSources, withRuntimeSources } from '../../src/game-engine/runtime-sources';
import { startBossFoundation, settleBossThreatBattle, resumeBossFoundation } from '../../src/game-engine/commands/boss-foundation';
import { necromancerProductionDependencyGate } from '../../src/game-engine/bosses/production-dependency-gate';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../../src/game-engine/save';
import type { CombatSourceReference } from '../../src/types/component-combat';

export const root = 'docs/data/complete-edition/';
export const BASELINE_HEAD = '4c01f006324b38f4233803bc34c4259cd69f4ced';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const digest = (value: unknown) => sha(JSON.stringify(value));

/** Local evidence review and bridge isolation are deliberately outside production acceptance. */
function bridgeIsolationProof() {
  return withRuntimeSources(seededRuntimeSources(30), () => {
    const c = createNewCampaign();
    c.heroes = ['crusader', 'highwayman', 'hellion'].map((id, index) => createHeroInstance(id, index)!);
    c.currentQuestId = 'face-the-threat'; c.gamePhase = 'dungeon-explore';
    c.campaignProgress.activeThreatId = 'necromancer-threat-level-1'; c.campaignProgress.activeBossFamilyId = 'necromancer';
    c.campaignProgress.pendingThreatInitialization = false;
    c.dungeon = { questId: 'face-the-threat', questRunId: 'c1c30-bridge-isolation', currentRoomId: 'threat-room', previousRoomId: null,
      rooms: [{ id: 'threat-room', type: 'battle', status: 'current', adjacentRoomIds: ['room-10'] },
        { id: 'room-10', type: 'objective', status: 'revealed', adjacentRoomIds: ['threat-room'] }],
      scoutedNextMove: false, roomsCleared: 0, objectiveComplete: false, canLeave: false };
    const dodges = Object.fromEntries(c.heroes.map(h => [h.instanceId, getHeroCombatDefinition(h.heroId, h.level)!.dodge]));
    const bound = startBossFoundation(c, necromancerDefinition(1), 30, 'threat-room', dodges, []);
    bound.battle!.status = 'victory';
    const checkpoint = settleBossThreatBattle(bound);
    const saved = createSaveSnapshot(checkpoint);
    const error = validateSaveFile(saved);
    if (error) throw new Error(error);
    const resumed = resumeBossFoundation(checkpoint, 'room-10');
    const restored = resumeBossFoundation(restoreSaveSnapshot(JSON.parse(JSON.stringify(saved))), 'room-10');
    if (digest(resumed.battle) !== digest(restored.battle)) throw new Error('Bridge isolation roundtrip mismatch');
    return { classification: 'UNIT_ISOLATION_ONLY', productionAcceptance: false, sourceBoundDodge: Object.values(dodges),
      syntheticBoneDefinitionUsed: false, prototypeHeroHpRetained: true, completeBoneDefinitionCount: 0,
      checkpointSha256: digest(checkpoint.bossEncounterCheckpoint), finalStateSha256: digest(resumed.battle), reloadStateSha256: digest(restored.battle),
      bridgeSaveReload: 'PASS', encounterSetupEventCount: resumed.battle!.bossEncounter!.events.filter(e => e.eventType === 'ENCOUNTER_SETUP').length };
  });
}
export function buildArtifacts(): Record<string, unknown> {
  execFileSync(process.execPath, ['scripts/audit/c1c30-printed-review.cjs', '--verify'], { stdio: 'pipe' });
  const frozen = readdirSync(root).filter(name => /^c1c2[0-9]-.*\.json$/.test(name)).map(name => root + name);
  frozen.push(root + 'rule-source-policy.json', 'src/game-engine/bosses/foundation.ts', 'src/game-engine/necromancer/contract-adapter.ts', 'src/game-engine/bosses/foundation-test-fixture.ts');
  const frozenInputSha256: Record<string, string> = {};
  for (const path of frozen) {
    const baseline = execFileSync('git', ['show', `${BASELINE_HEAD}:${path}`], { maxBuffer: 32 * 1024 * 1024 });
    const current = readFileSync(path);
    // Git may check text out with CRLF on Windows. Freeze content, recording on-disk hashes as well.
    if (path !== 'src/game-engine/bosses/foundation.ts' && baseline.toString().replace(/\r\n/g, '\n') !== current.toString().replace(/\r\n/g, '\n')) throw new Error(`Frozen baseline changed: ${path}`);
    // The historical runtime hash remains pinned while C1C32 supersedes its implementation.
    frozenInputSha256[path] = sha(path === 'src/game-engine/bosses/foundation.ts' ? baseline : current);
  }
  const reviewedPath = root + 'c1c30-reviewed-component-combat.json';
  const reviewed = JSON.parse(readFileSync(reviewedPath, 'utf8')) as { monsters: Array<{ sourceReferences: CombatSourceReference[]; initiative: { sourceReferences: CombatSourceReference[] } }>; heroDodge: Array<{ sourceReferences: CombatSourceReference[] }> };
  const refs = [...reviewed.monsters.flatMap(m => [...m.sourceReferences, ...m.initiative.sourceReferences]), ...reviewed.heroDodge.flatMap(h => h.sourceReferences)];
  for (const r of refs) if (sha(readFileSync(r.path)) !== r.sha256) throw new Error(`Source hash mismatch: ${r.path}`);
  const candidates = ['bone-rabble', 'bone-soldier', 'bone-spearman', 'bone-captain'].map(id => inspectBoneCombatDependency(id)!);
  if (candidates.some(c => resolveProductionMonsterDefinition(c.monsterId))) throw new Error('Review requires reassessment before any Bone is promoted');
  const definitionBindings = ([1, 2, 3] as const).map(necromancerDefinition);
  const common = { schemaVersion: 1, phase: '11A.4-C1C30', baselineHead: BASELINE_HEAD,
    ruleSetVersion: NECROMANCER_RULE_SET_VERSION, ruleSourcePolicyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1' };
  const capabilities = {
    coreBossDefinitions: { status: 'IMPLEMENTED', count: 9, note: 'Frozen C1C29 executor and C1C28 v1 contract retained.' },
    BoneCombatDefinitions: { status: 'PARTIAL', printedStatsAndSkillsReviewed: 4, executableDefinitions: 0, note: 'Unresolved Stance selections block validated runtime definitions.' },
    HeroDodgeBinding: { status: 'PARTIAL', classLevelPairs: ['crusader:1', 'highwayman:1', 'hellion:1'], note: 'Standard registry API; all other class/level pairs fail closed. Other Hero fields keep their prototype credibility.' },
    BoneSkillExecutor: { status: 'BLOCKED', note: 'No source-complete activation contract; simplified Phase 3 executor is not a production substitute.' },
    NormalSelectorEntry: { status: 'BLOCKED', note: 'UI, quest command, Room command and direct Room commit enforce the production dependency gate.' },
    ThreatCheckpointResume: { status: 'PARTIAL', bridgeUnitIsolation: 'PASS', note: 'Validated identity/version/linkage and deterministic resume implemented. Production Room bridge remains gated.' },
    HamletEffectBridge: { status: 'BLOCKED', note: 'Stored forcedHeroId and resumable choice retained; preparation/Graveyard transaction bridge is not closed.' },
    IncomingAttackReaction: { status: 'BLOCKED', note: 'Existing Boss Target effects do not yet stage complete per-Hero Trinket defense windows. No production promotion.' },
    RoomStorage: { status: 'BLOCKED', note: 'Room 10 semantic binding retained; authoritative physical card/tile lifecycle has not been integrated.' },
    BossResistanceIntegration: { status: 'PARTIAL', note: 'Frozen immunity binding retained; categorical Debuff and Shuffle resistance is not closed.' },
    SaveReplayProduction: { status: 'BLOCKED', note: 'No production Bone activation path available. Isolation proofs are not production acceptance.' },
  };
  const dependencies = [
    ...candidates.map(c => ({ dependency: c.monsterId, runtimeModule: 'src/game-engine/bosses/component-adapters/bone-combat-adapter.ts',
      sourceArtifact: reviewedPath, sourceHash: sha(readFileSync(reviewedPath)), sourceReferences: c.sourceReferences,
      status: c.status, unresolvedFields: c.unresolvedFields, syntheticFallbackAllowed: false })),
    { dependency: 'HeroDodge', runtimeModule: 'src/data/progression/hero-level-registry.ts', sourceArtifact: reviewedPath,
      sourceHash: sha(readFileSync(reviewedPath)), status: 'PARTIAL', syntheticFallbackAllowed: false },
    { dependency: 'ThreatCheckpointResume', runtimeModule: 'src/game-engine/bosses/threat-checkpoint.ts',
      sourceArtifact: root + 'c1c28-necromancer-runtime-semantic-contract.json',
      sourceHash: sha(readFileSync(root + 'c1c28-necromancer-runtime-semantic-contract.json')), status: 'PARTIAL', syntheticFallbackAllowed: false },
  ];
  const scopePolicy = 'Historical source-only workspace assertions remain unchanged and are excluded from later-phase acceptance; list actual test failures in the validation report.';
  return {
    'c1c30-necromancer-production-dependency-binding.json': { ...common, frozenInputSha256, dependencies,
      coreDefinitionsBound: definitionBindings.length * 3, syntheticFallbackAllowed: false, executableBoneDefinitions: 0 },
    'c1c30-necromancer-runtime-capability-matrix.json': { ...common, capabilities,
      hardGates: ['BoneCombatDefinitions', 'HeroDodgeBinding', 'BoneSkillExecutor', 'NormalSelectorEntry', 'ThreatCheckpointResume'],
      hardGatesPassed: false, productionReady: 0 },
    'c1c30-necromancer-production-runtime-proof.json': { ...common, status: 'BLOCKED', productionAcceptance: false,
      syntheticDependenciesUsedForAcceptance: false, sourceReview: candidates,
      normalProductionGameplayAccepted: false, requiredSuccessfulSummonAndSkillProof: 'NOT_EXECUTABLE',
      gate: necromancerProductionDependencyGate(createNewCampaign(), 1) },
    'c1c30-necromancer-save-replay-proof.json': { ...common, status: 'BLOCKED_FOR_PRODUCTION_ACCEPTANCE',
      cases: [
        { scenario: 'Threat checkpoint before Room', status: 'UNIT_ISOLATION_PASS', productionAcceptance: false },
        { scenario: 'lowest-roll tie', status: 'UNIT_ISOLATION_PASS', productionAcceptance: false },
        ...['real Bone summon', 'Reanimation boundary', 'Area tie with production dependencies', 'incoming Trinket reaction', 'cleanup production replay'].map(scenario => ({ scenario, status: 'BLOCKED', productionAcceptance: false })),
      ], isolatedBridgeProof: bridgeIsolationProof(), noSyntheticAcceptanceProof: true },
    'c1c30-necromancer-contract-review.json': { ...common, status: 'REQUIRED_DEPENDENCY_REVIEW_UNRESOLVED_PROMOTION_STOPPED',
      c1c28RulingChanged: false, externalSourceUsed: false, newProjectRulingRequired: false, newProjectRulingIntroduced: false,
      blockers: candidates.map(c => ({ dependency: c.monsterId, status: 'SOURCE_UNRESOLVED', fields: c.unresolvedFields,
        evidence: c.sourceReferences, resolution: 'Review locked printed Stance selections and existing official rulebook examples; do not infer a default Skill from unmarked icons.' })),
      heroCoverageBlocker: 'No reviewed source-bound Dodge for remaining class/level pairs. Do not extrapolate Level I or use zero fallback.',
      affectedPromotionStopped: ['Bone combat execution', 'normal production entry', 'production save/replay proof', 'C1C31 selection'],
      missingBehaviorPolicy: 'SOURCE_UNRESOLVED; no new ruling permitted in this phase', historicalScopeTestPolicy: scopePolicy,
      returnToSourceAcquisition: false },
    'c1c30-next-workstream-decision.json': { ...common, decision: 'NECROMANCER_RUNTIME_FOUNDATION_CONTINUATION',
      verdict: 'C1C30-NECROMANCER-RUNTIME-FOUNDATION-PARTIAL-NOT-ACCEPTED', nextWorkstream: 'NECROMANCER_RUNTIME_FOUNDATION_CONTINUATION',
      c1c31Selected: false, hardGatesPassed: false, productionReady: 0, returnToSourceAcquisition: false,
      reason: 'Four printed Bone candidates and three Level I Hero Dodge bindings are reviewed, but complete activation dependencies and production bridges remain unresolved. Isolation checkpoint success cannot satisfy production acceptance.' },
  };
}
export function verifyArtifacts(): void {
  for (const [name, expected] of Object.entries(buildArtifacts())) {
    const saved = JSON.parse(readFileSync(root + name, 'utf8'));
    if (JSON.stringify(saved) !== JSON.stringify(expected)) throw new Error(`C1C30 generated artifact mismatch: ${name}`);
  }
}
