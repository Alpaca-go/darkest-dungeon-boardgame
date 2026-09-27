import { requireProductionRuntimeDiff, requireVerificationReceipt, type C1C17VerificationReceipt } from './c1c17-implementation-gate';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { COMMUNITY_SOURCE_TRINKETS, COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_TRINKET_RUNTIME_ADAPTERS } from '../../src/data/community-reference/production-runtime';
import { LEVEL_1_TRINKET_CENSUS, LEVEL_1_TRINKET_DECK_COVERAGE } from '../../src/audit/level1-trinket-deck';
import { LEVEL_2_TRINKET_DECK_COVERAGE } from '../../src/audit/level2-trinket-deck';
import { LEVEL_3_TRINKET_DECK_COVERAGE } from '../../src/audit/level3-trinket-deck';
import { trinketReadinessInvariantErrors } from '../../src/audit/trinket-readiness-invariants';
import { SURVIVAL_GUIDE_ID } from '../../src/audit/production-proof-registry';
import { getTrinketPoolByLevel, runtimeContentContext } from '../../src/data/content-selector';
import { createNewCampaign } from '../../src/game-engine/campaign';
const baselineHead = '69aa2185d221e2935b48383e4dbbdee8ba9d0d43';
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const sha = (bytes: Buffer) => createHash('sha256').update(bytes).digest('hex');
const meta = { schemaVersion: 1, phase: '11A.4-C1C-17R', baselineHead, repairBaselineHead: '62c8478e2461d04e8a0ea567e58ccfe996e1ad34',
  priorImplementationAnchor: '79f7c656afa61a5527e7ac956f4e38d1491ddb3a',
  baselineImplementationAnchor: '130f1cc868adc3e27eb3ac5a2087f8da4e2f4e86', baselineImplementationTree: '7cb92fbdf5e8492dde6cdfa9f9869b89b8354f6b',
  verifiedImplementationHead: git('rev-parse', 'HEAD'), verifiedImplementationTree: git('rev-parse', 'HEAD^{tree}'),
  verifiedImplementationCommittedAt: git('show', '-s', '--format=%cI', 'HEAD') };
const implementationVerification = JSON.parse(readFileSync('tmp/c1c17-implementation-verification.json', 'utf8')) as C1C17VerificationReceipt;
requireVerificationReceipt(implementationVerification, meta.verifiedImplementationHead, meta.verifiedImplementationTree);
const productionRuntimeChanges = requireProductionRuntimeDiff(git('diff', '--name-only', baselineHead, meta.verifiedImplementationHead).split(/\r?\n/).filter(Boolean));
if (JSON.stringify(productionRuntimeChanges) !== JSON.stringify(implementationVerification.productionRuntimeChanges)) throw new Error('Verified runtime diff mismatch');
const write = (name: string, payload: object) => writeFileSync('docs/data/complete-edition/' + name, JSON.stringify({ ...meta, ...payload }, null, 2) + '\n');
const history = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition', 'docs/reports/complete-edition').split(/\r?\n/).filter((path) => /\/c1c(?:5(?:r|r2)?|6|7|8|9|10|11|12|13|14|15|16)-/.test(path));
const historicalEvidenceHashes = Object.fromEntries(history.map((path) => [path, sha(execFileSync('git', ['show', baselineHead + ':' + path], { maxBuffer: 32 * 1024 * 1024 }))]));
const source = COMMUNITY_SOURCE_TRINKETS.find((card) => card.id === SURVIVAL_GUIDE_ID)!;
const capability = COMMUNITY_TRINKET_CAPABILITIES.find((card) => card.definitionId === SURVIVAL_GUIDE_ID)!;
const adapter = COMMUNITY_TRINKET_RUNTIME_ADAPTERS[SURVIVAL_GUIDE_ID];
const contract = { definitionId: SURVIVAL_GUIDE_ID, sourceReferences: source.sourceReferences,
  sourceTrigger: 'exploration-die-result', runtimeWindow: 'after-dungeon-roll', target: 'exploration-die',
  positive: source.positiveSide, negative: source.negativeSide, adapter,
  ignorePolicy: 'TERMINAL_CLOSE_ALL_ROOT_OPPORTUNITIES_COMPLETE_MOVE',
  ignoredRestorePolicy: 'CLEAR_PENDING_AND_ORPHAN_OPPORTUNITIES_NO_MOVE',
  resultPolicy: 'ROLL_ONCE_BEFORE_WINDOW_FREEZE_ORIGINAL_AND_EFFECTIVE',
  moveIdentity: ['rootEventId', 'questId', 'questRunId', 'fromRoomId', 'destinationRoomId'],
  physicalPolicy: 'PROCESSED_PHYSICAL_IDS_PERSIST_REEVALUATE_UNPROCESSED_CLOSE_STALE',
  continuationPolicy: 'SHARED_PRODUCTION_COMMAND_AFTER_RESULT_COMMIT', invalidRestorePolicy: 'CLEAR_PENDING_AND_ORPHAN_ROOT_FAIL_CLOSED',
};
write('c1c17-survival-guide-contract.json', contract);
write('c1c17-exploration-runtime-surface.json', { productionMovementEntry: 'commands/dungeon.ts::enterDungeonRoom',
  randomSource: 'exploration.ts::rollExplorationResult / EXPLORATION_EVENTS', resultApplication: 'exploration.ts::applyExplorationResult',
  frozenMoveCommit: 'dungeon.ts::commitMoveToRoom', insertion: 'AFTER_RESULT_FROZEN_BEFORE_RESULT_APPLICATION',
  roomContinuation: 'commands/dungeon.ts::finalizeDungeonRoomEntry',
  decisionEntry: 'trinkets/dungeon-trinket-bridge.ts::resolveDungeonTrinketOpportunity', legacyCompatibility: 'dungeon.ts::moveToRoom',
  consumerRules: 'IGNORE_SKIPS_APPLY_REPLACE_CALLS_SHARED_TRAP_PIPELINE', downstreamRng: 'ONLY_AFTER_RESULT_COMMIT',
});
write('c1c17-level1-trinket-capability-matrix.json', { cards: LEVEL_1_TRINKET_CENSUS });
write('c1c17-level1-trinket-deck-coverage.json', { coverage: LEVEL_1_TRINKET_DECK_COVERAGE });
const deferred = { definitionIds: ['bleed', 'blight', 'debuff', 'stun'].map((name) => 'community-trinket-core-' + name + '-charm'),
  status: 'DEFERRED_FAIL_CLOSED', requiredContract: 'hero-caused-condition-source-contract',
  blockers: ['Ordinary hero skill applyEffects has legacy amount-only conditions with durationTurns undefined; duration must never be inferred from amount.',
    'Debuff Positive has amount=null, turns=2; StatusEffectType lacks debuff, applyEffectToUnit does not write buff/debuff condition duration, and expiration is missing.'],
  unlockRequirements: ['skill condition magnitude', 'skill condition duration', 'hero-causes-condition exact insertion point', 'condition-being-caused target', 'duration -1 at zero', 'debuff token representation', 'debuff expiration'],
  nextComparison: 'Damage Stone vs Condition Charm family; no single-side Ready gain work',
};
const verdict = 'C1C17-SURVIVAL-GUIDE-EXPLORATION-RESULT-RUNTIME-ACCEPTED-READY-7-OF-14';
write('c1c17-survival-guide-runtime-evidence.json', { historicalEvidenceHashes, productionRuntimeChanges, implementationVerification,
  sourceNormalizedSha256: sha(readFileSync('src/data/community-reference/trinkets/data.json')),
  normalizedEvidenceHashes: Object.fromEntries(['docs/data/complete-edition/trinkets/community-trinket-normalized.json', 'docs/data/complete-edition/trinkets/community-trinket-source-evidence.json'].map((path) => [path, sha(readFileSync(path))])),
  survivalGuideCapability: capability, level1Coverage: LEVEL_1_TRINKET_DECK_COVERAGE, level2Coverage: LEVEL_2_TRINKET_DECK_COVERAGE,
  level3Coverage: LEVEL_3_TRINKET_DECK_COVERAGE, productionReadySubsetIds: getTrinketPoolByLevel(runtimeContentContext(createNewCampaign('community-complete-edition')), 1).map((card) => card.id).sort(),
  readySubsetDraw: 'ENABLED', fullDeckStatus: 'complete 14-card Level-1 deck is not runtime-complete', deferredConditionCharms: deferred,
  readinessInvariantErrors: trinketReadinessInvariantErrors(COMMUNITY_TRINKET_CAPABILITIES), verificationCommand: 'npm run verify:complete-edition-c1c17',
  verificationRequired: true, terminalVerdict: verdict });
writeFileSync('docs/reports/complete-edition/c1c17-survival-guide-runtime-report.md', '# C1C17R Survival Guide ignore-result closure repair\n\n' + verdict + '\n\n'
  + 'Survival Guide implements both exact source sides at after-dungeon-roll. The move identity and single rolled exploration result are persisted before any result, leave-room rule, room entry, battle settlement or replacement continuation. Use/Decline resumes the shared production command. Positive skips result consequences and completes the move; Negative transforms the effective result to Trap and consumes the existing Trap pipeline. The original result remains unchanged.\n\n'
  + 'All living holders contribute physical opportunities. After a transform, stale opportunities close and unprocessed instances are reevaluated. A processed card never reopens in the same root, including after its flip. Ignore is terminal: all sibling root opportunities close immediately, sibling cards do not flip or produce Use Records, and the move completes. Negative transforms still reevaluate unprocessed cards. Saves preserve open and Negative-used checkpoints; Positive-used saves are already completed moves. Legacy/corrupt ignored=true pending saves clear pending state and orphan opportunities without moving. No save version bump: this extends an existing union.\n\n'
  + 'Level 1 Ready = 7/14. Production-ready subset draw is enabled; the complete 14-card Level-1 deck is not runtime-complete (completeForRandomDraw=false). Level 2 remains 4/11 and Level 3 remains 4/12. Historical C1C5–C1C16 evidence and normalized sources are frozen. C1C16 tests project its original adapter set to retain historical six-card assertions.\n\n'
  + 'Bleed Charm, Blight Charm, Debuff Charm and Stun Charm are deferred. Hero-caused conditions still have amount-only legacy skill representations without independent duration; duration=amount is not a source rule. Debuff has no StatusEffectType token, independent duration application, or expiration. Reopening requires hero-caused-condition-source-contract covering magnitude, duration, exact insertion, target, duration -1 at zero, debuff representation and expiration. Next compare Damage Stone against the condition family; single-side work yields no whole-card Ready gain.\n\n'
  + 'Verification: npm run verify:complete-edition-c1c17 runs all requested historical E2E suites, npm test, typecheck and build. Registered C1C17 proofs exercise applicability, transformations, multi-copy, frozen save replay, semantic mutations and real room-click UI Use/reload behavior. Evidence is generated only after --implementation completes every required suite for its exact commit/tree. The verifier rejects documentation/audit/test-only implementation diffs; both consumers and registered proofs are checked explicitly. --evidence-only checks the final evidence commit against the verified implementation receipt. Implementation and evidence-only commits are independently checked.\n');
