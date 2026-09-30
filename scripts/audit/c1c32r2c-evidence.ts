import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { RUINS_PRODUCTION_EXECUTOR_BLOCKERS } from '../../src/game-engine/ruins/battle-runtime';
import { ruinsMonsterDefinitions, ruinsRoom } from '../../src/game-engine/ruins/source-registry';
import { RUINS_V5 } from '../../src/types/ruins-executable';

const root = 'docs/data/complete-edition/';
const results = JSON.parse(readFileSync(`${root}c1c32r2c-test-results.json`, 'utf8'));
if (!results.success || results.numFailedTests || results.numPassedTests < 71) throw new Error('Focused runtime evidence requires passing tests');
const baselineHead = '6c8dd14b855dd8996d2f01fc5591c9f27db58d67';
const files = readdirSync('src/audit').filter(file => file.startsWith('c1c32r2c-') && file.endsWith('.test.ts'));
const testHashes = Object.fromEntries(files.map(file => [`src/audit/${file}`,
  createHash('sha256').update(readFileSync(`src/audit/${file}`)).digest('hex')]));
const runtimeFiles = [...readdirSync('src/game-engine/ruins').filter(file => file.endsWith('.ts') && !file.endsWith('.test.ts'))
  .map(file => `src/game-engine/ruins/${file}`), 'src/game-engine/battle.ts', 'src/game-engine/save.ts',
  'src/game-engine/status-effects.ts', 'src/game-engine/combat-resolution.ts', 'src/game-engine/bosses/foundation.ts',
  'src/game-engine/commands/battle.ts', 'src/game-engine/commands/boss-foundation.ts',
  'src/game-engine/trinkets/battle-trinket-bridge.ts', 'src/game-engine/diseases/draw-disease.ts',
  'src/types/index.ts', 'src/types/ruins-executable.ts'];
const runtimeHashes = Object.fromEntries(runtimeFiles.map(file => [file,
  createHash('sha256').update(readFileSync(file)).digest('hex')]));
const common = { schemaVersion: 1, phase: '11A.4-C1C32R2C', baselineHead,
  policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1', ruleSetVersion: RUINS_V5,
  evidence: { result: `${root}c1c32r2c-test-results.json`, passed: results.numPassedTests,
    failed: results.numFailedTests, testHashes, runtimeHashes }, productionEntryEnabled: false };
const write = (name: string, data: object) => writeFileSync(`${root}c1c32r2c-${name}.json`, `${JSON.stringify({ ...common, ...data }, null, 2)}\n`);
const monsters = ruinsMonsterDefinitions(RUINS_V5);
const rooms = Array.from({ length: 9 }, (_, index) => ruinsRoom(index + 1));
const skillCount = monsters.reduce((sum, monster) => sum + monster.skills.length, 0);
const ruleCount = rooms.reduce((sum, room) => sum + room.rules.length, 0);
if (monsters.length !== 24 || skillCount !== 56 || ruleCount !== 14) throw new Error('Frozen source census differs');
write('monster-executable-acceptance', { sourceBoundMonsterCandidates: monsters.length, typedSkills: skillCount,
  executableProductionMonsters: 0, drawableProductionMonsterDefinitionsMissing: 0,
  status: 'CONDITIONAL_RUNTIME_COVERAGE_NOT_PRODUCTION_ACCEPTANCE',
  identities: monsters.map(monster => monster.canonicalId),
  coverage: ['all source identities, Stances and d10 selections', 'all typed Skills and printed attack rolls',
    'incoming reaction freeze/commit', 'self effects precede target resolution', 'saved multi-target continuations'],
  exclusions: ['Known initial Large layouts skipped by seed search', 'Known Large Stance collision rejected during traversal'],
  blockers: [...RUINS_PRODUCTION_EXECUTOR_BLOCKERS] });
write('room-executable-acceptance', { sourceRooms: rooms.length, sourceRules: ruleCount,
  executableRooms: 0, executableRoomRules: 0, status: 'CONDITIONAL_DOMAIN_COVERAGE_NOT_PRODUCTION_ACCEPTANCE',
  rules: rooms.flatMap(room => room.rules.map(rule => ({ room: room.roomNumber, ruleId: rule.id, trigger: rule.trigger }))),
  coverage: ['all source rule trigger dispatches', 'direct engine healing and status passives',
    'AP and once-per-Battle requirements', 'Room 8 initiative movement', 'round/end-turn hooks', 'save/reload interaction usage'],
  blockedRule: 'drawTrinket: SOURCE_DECK_INCOMPLETE/RUNTIME_POOL_MISMATCH; no successful reward acceptance claimed' });
write('printed-effect-runtime-proof', { status: 'IMPLEMENTED_WITH_BLOCKED_LARGE_STANCE_CASE',
  coverage: ['condition stacking/expiry/removal', 'Guard mandatory targeting', 'Riposte before Protection; reflected damage also protected',
    'Area plus Stance Shuffle', 'source Crit/Mark modifiers', 'party Light/Stress once per attack',
    'Disease draw and existing acquisition', 'healing through shared primitive', 'inherited v3 displacement continuation'],
  blocker: 'LARGE_STANCE_SHUFFLE_SLOT_COLLISION_CONTRACT_ABSENT' });
write('ordinary-battle-initialization-proof', { status: 'SOURCE_DRAW_BINDING_PROVEN_FOR_EXECUTABLE_LAYOUTS',
  levels: [1, 2, 3], sameDrawnCopies: true, sameDrawnInitiative: true, heroDodgeVersion: 'C1C31-DIGITAL-DEFAULT-v2',
  largeContractReusedWithoutEditingFrozenModule: true, noPrototypeMonsters: true,
  blockedInitialLayout: { level: 3, seed: 147, prefix: ['LARGE', 'NORMAL', 'LARGE'] } });
write('ordinary-encounter-save-replay-proof', { status: 'DOMAIN_SAVE_REPLAY_PROVEN',
  coverage: ['Monster movement choice', 'printed Shuffle remaining effects', 'inherited Large candidate list and overflow',
    'incoming attack reaction snapshot', 'physical card/figure identity', 'RNG cursor/calls and causal parents',
    'ordinary victory returns exactly once'], browserProductRouteProven: false });
write('graveyard-active-expired-proof', { status: 'REAL_COMMAND_DOMAIN_PROVEN',
  pendingNextQuestTransactionProvenByC1C32R2A: true, activeQuestRealCommandSaveProof: true,
  expiredRealCommandSaveProof: true, stressTenAfterReloadProof: true,
  commands: ['commitQuestSelection', 'commitLeaveDungeon for Standard Quest', 'processBattleStressEvents and existing death pipeline'],
  lifecycleFieldsMutatedInTests: false, resolveRerollAfterFatalStress: false, fullProductRouteProven: false });
write('summon-physical-identity-contract', { status: 'CARD_AND_FIGURE_DOMAIN_BINDING_IMPLEMENTED', canonical: false,
  physicalClasses: ['MonsterCardCopyId', 'MonsterFigureCopyId'],
  figureCounts: { 'bone-rabble': 3, 'bone-soldier': 3, 'bone-spearman': 3, 'bone-captain': 1 },
  ordinaryDrawUses: 'actual card copy plus actual available figure',
  necromancerSummonUses: 'reserves both source card and miniature; reanimation reuses the same pair',
  sourceReferences: [{ path: `${root}c1c19-rulebook-extracted-evidence.json`, pages: [6, 7, 25, 38],
    sourceSha256: '9b254ac284f2b00bb194c314e7568269c164dfdbe88c2a42cc1a9d8da84728ae' }],
  digitalFigureSerialIdsAreProjectIdentifiers: true, rulingSetMutation: false });
write('summon-ownership-proof', { status: 'SOURCE_BOSS_DOMAIN_CARD_AND_FIGURE_PROVEN',
  coverage: ['finite joint inventory', 'ordinary owners retained while summon reserves remaining supply',
    'explicit Captain injection', 'Level III reanimation reuses ordinary card and figure',
    'save validation rejects tampering/duplicate bindings', 'cleanup returns summons only and is idempotent'],
  bossFixtureRuleset: 'existing v2 source Boss domain; v5 ordinary draw', fullV5BossProductIntegrationProven: false });
const changed = execFileSync('git', ['diff', '--name-only', baselineHead], { encoding: 'utf8' }).trim().split(/\r?\n/);
const frozenChanges = changed.filter(file => /docs\/data\/complete-edition\/c1c(?:2[0-9]|3[01]|32(?!r2c))/.test(file)
  || file === 'src/game-engine/rules/large-movement-contract.ts');
if (frozenChanges.length) throw new Error(`Frozen files changed: ${frozenChanges.join(', ')}`);
write('historical-preservation', { historicalV1V2V3V4V5Preserved: true,
  historicalSourceAndRulingFilesEdited: frozenChanges.length, newRulingVersionCreated: false,
  scopeGuardNote: 'C1C27/C1C28 tests and .gitattributes are unchanged. The same committed .gitattributes rejection was already accepted in the R2B validation report. Final full-suite classification is recorded separately.' });
write('runtime-dependency-matrix', { accepted: false, gates: {
  sourceBoundMonsterCandidates: 24, executableProductionMonsters: 0, drawableProductionMonsterDefinitionsMissing: 0,
  productionMonsterEffectAdapterComplete: false, extendedPrintedEffectInterpreterComplete: false,
  tileAreaFinalVisualValidation: true, roomEffectExecutorComplete: false, executableRooms: 0, executableRoomRules: 0,
  ordinaryEncounterDomainDrawImplemented: true, ordinaryEncounterDrawExecutable: false,
  ordinaryEncounterDrawContractComplete: false, ordinaryBattleInitializationComplete: false,
  initialLargeReplacementDiscardPolicyResolved: true, largeReplacementProjectRulingVersioned: true,
  physicalCopySummonSupplyReconciliationComplete: true, physicalCopyOwnershipComplete: true,
  graveyardCampaignTransactionImplemented: true, preparationDayDomainBridgeImplemented: true,
  preparationDayFullProductPathProven: false, activeQuestRealCommandSaveProof: true,
  expiredRealCommandSaveProof: true, stressTenAfterReloadProof: true, historicalV1V2V3V4V5Preserved: true },
  blockers: [...RUINS_PRODUCTION_EXECUTOR_BLOCKERS], remainingExecutableDependencyBlockers: RUINS_PRODUCTION_EXECUTOR_BLOCKERS.length,
  blockerDetails: [{ id: RUINS_PRODUCTION_EXECUTOR_BLOCKERS[0], code: 'src/game-engine/ruins/encounter-draw.ts', review: `${root}c1c32r2c-required-contract-review.json` },
    { id: RUINS_PRODUCTION_EXECUTOR_BLOCKERS[1], code: 'src/game-engine/ruins/printed-effect-runtime.ts', review: `${root}c1c32r2c-required-contract-review.json` },
    { id: RUINS_PRODUCTION_EXECUTOR_BLOCKERS[2], code: 'src/game-engine/ruins/room-runtime.ts -> src/game-engine/trinkets/draw-trinket.ts',
      requirement: 'Successful source-complete Trinket draw/acquisition; frozen C1C20 partial corpus cannot pass downstream gate' }],
  deferredToC1C32R3: ['PREPARATION_DAY_FULL_PRODUCT_PATH', 'SCENARIO_C_FULL_PRODUCT_PATH', 'CAPTAIN_FULL_PRODUCTION_INJECTION',
    'REANIMATION_FULL_PRODUCT_PROOF', 'BOSS_ROOM_VICTORY_BROWSER_PROOF'] });
write('next-workstream-decision', { verdict: 'C1C32R2C-RUINS-PRODUCTION-RUNTIME-DEPENDENCIES-NOT-CLOSED',
  decision: 'PRODUCTION_THREAT_RUNTIME_INTEGRATION_NOT_READY', C1C32R3: 'NOT_AUTHORIZED', C1C33: 'NOT_AUTHORIZED',
  createC1C32R2D: false, returnToBroadSourceIntake: false, blockerMatrix: `${root}c1c32r2c-runtime-dependency-matrix.json` });
console.log(`C1C32R2C evidence refreshed: ${results.numPassedTests} passing tests; ${RUINS_PRODUCTION_EXECUTOR_BLOCKERS.length} blockers; NOT-CLOSED.`);
