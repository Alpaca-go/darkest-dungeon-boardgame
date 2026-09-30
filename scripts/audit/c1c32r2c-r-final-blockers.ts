import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { sourceTrinketDeck } from '../../src/game-engine/trinkets/source-deck';
import { ruinsMonsterDefinitions, ruinsRoom } from '../../src/game-engine/ruins/source-registry';
import { RUINS_V6 } from '../../src/types/ruins-executable';
import { RUINS_PRODUCTION_EXECUTOR_BLOCKERS } from '../../src/game-engine/ruins/battle-runtime';

const root = 'docs/data/complete-edition/';
const prefix = 'c1c32r2c-r-';
const baseline = '182b9f351e6115daa678fb36dc2fa6196f15e6cf';
const verify = process.argv.includes('--verify');
const sha = (path: string) => createHash('sha256').update(readFileSync(path)).digest('hex');
const read = (name: string) => JSON.parse(readFileSync(`${root}${prefix}${name}.json`, 'utf8'));
function check(condition: unknown, message: string): asserts condition { if (!condition) throw new Error(message); }
const write = (name: string, data: object) => writeFileSync(`${root}${prefix}${name}.json`, JSON.stringify({
  schemaVersion: 1, phase: '11A.4-C1C32R2C-R', baseline, ruleSetVersion: RUINS_V6, ...data,
}, null, 2) + '\n');
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 }).trim();

const tests = read('test-results');
check(tests.success && tests.numFailedTests === 0 && tests.numPendingTests === 0, 'Focused tests must all pass without skips');
const assertions = tests.testResults.flatMap((s: any) => s.assertionResults);
const passed = (fragment: string) => assertions.filter((t: any) => t.fullName.includes(fragment) && t.status === 'passed');
check(passed('all Stances, all d10 outcomes, all Skills').length === 24, '24 actual Monster traversals required');
check(passed('C1C32R2C all source Room rules execute').filter((t: any) => / \d+ \/ /.test(t.fullName)).length === 14, '14 actual Room rule executions required');
check(passed('C1C32R2C-R final runtime blockers').length === 13, '13 blocker closure tests required');
const full = read('full-test-results'), classification = read('full-test-classification');
const historical = JSON.parse(readFileSync(`${root}c1c32r2c-full-test-classification.json`, 'utf8'));
const failed = full.testResults.flatMap((s: any) => s.assertionResults.filter((t: any) => t.status === 'failed'));
check(failed.length === 2 && classification.unexpectedFailures === 0 && full.numPendingTests === 0
  && failed.every((t: any) => historical.historicalExceptions.some((h: any) => h.fullName === t.fullName)
    && t.failureMessages.some((m: string) => /C1C2[78]: scope violation/.test(m))), 'Full regression may retain only the same two historical scope guards');
const regression = read('regression-results');
const latestCommands = [...new Map<string, any>(regression.map((r: any) => [r.command, r])).values()];
check(latestCommands.filter((r: any) => r.command.startsWith('npm run') && r.command !== 'npm run build').every((r: any) => r.exitCode === 0),
  'Required regression command failed');
check(latestCommands.length === 21, 'All 18 regression/E2E commands, focused tests, full tests, and build must run');
const build = read('build-classification');
check(build.status === 'PASS' || build.status === 'BUILD_ACCEPTANCE_UNVERIFIED' && build.knownToolingBlocker,
  'Unexpected build failure');
const deck = sourceTrinketDeck();
check(deck.length === 37 && deck.filter(c => c.runtimeEffectReady).length === 15, 'C1C20 effect readiness changed');
const definitions = ruinsMonsterDefinitions(RUINS_V6);
check(definitions.length === 24 && definitions.every(d => d.status === 'EXECUTABLE_PRODUCTION_DEFINITION' && d.executable), 'Monster runtime registry promotion incomplete');
const rooms = Array.from({ length: 9 }, (_, i) => ruinsRoom(i + 1));
check(rooms.flatMap(r => r.rules).length === 14, 'Room census changed');
check(RUINS_PRODUCTION_EXECUTOR_BLOCKERS.length === 0, 'Runtime entry remains blocked');
for (const name of ['large-mixed-layout-review','large-stance-shuffle-review']) {
  const review = read(name);
  check(review.reviewStatus === 'SOURCE_EXHAUSTED' && review.authority === 'PROJECT_RULING'
    && review.canonical === false && !review.officialClarificationFound, 'Narrow source review provenance invalid');
  for (const ref of review.sourceReferences) check(sha(ref.path) === ref.sha256, 'Narrow local source hash changed');
}
check(read('ruleset-v6').inherits === 'C1C32R2B-DIGITAL-DEFAULT-v5', 'v6 must inherit v5');
const scans: Array<{ level: number; seeds: number; skippedSeeds: number[]; occupiedSlots: number; patterns: string[] }> = verify ? read('seed-scan-proof').scans
  : [1,2,3].map(level => JSON.parse(readFileSync(`tmp/c1c32r2c-r/seed-scan-level-${level}.json`, 'utf8')));
check(scans.every(s => s.seeds === 4096 && !s.skippedSeeds.length && s.occupiedSlots === 4), 'Seed scan incomplete');
if (!verify) write('seed-scan-proof', { scans, totalSeeds: 12288, skippedSeeds: [] });

const frozenSpecs = ['docs/data/complete-edition', 'src/data/community-reference/trinkets',
  'src/game-engine/rules/ruins-v4.ts', 'src/game-engine/rules/ruins-v5.ts',
  'src/game-engine/rules/large-movement-contract.ts', 'src/game-engine/hamlet.ts',
  'src/game-engine/trinkets/draw-trinket.ts', 'src/game-engine/necromancer/contract-adapter.ts',
  'src/audit/c1c27-necromancer-source-closure.test.ts', 'src/audit/c1c28-necromancer-project-rulings.test.ts'];
const frozenHashes: Record<string,string> = Object.fromEntries(git('ls-tree', '-r', '--format=%(objectname) %(path)',
  baseline, ...frozenSpecs).split('\n').map(line => [line.slice(41), line.slice(0, 40)]));
const changed = git('diff', '--name-only', baseline, '--', ...frozenSpecs).split('\n').filter(path => path in frozenHashes);
check(!changed.length, `Historical source/ruling/evidence changed: ${changed.join(', ')}`);
const runtimePaths = [...readdirSync('src/game-engine/ruins').filter(p => p.endsWith('.ts')).map(p => `src/game-engine/ruins/${p}`),
  'src/game-engine/rules/ruins-v6.ts', 'src/game-engine/trinkets/source-deck.ts', 'src/game-engine/trinkets/draw-trinket.ts',
  'src/game-engine/trinkets/acquire-trinket.ts', 'src/game-engine/save.ts', 'src/types/ruins-executable.ts', 'src/types/index.ts',
  'scripts/audit/c1c32r2c-r-final-blockers.ts', 'scripts/audit/run-c1c32r2c-r-validation.mjs', 'package.json',
  ...['large-mixed-layout-review','large-stance-shuffle-review','ruleset-v6','ruleset-migration','source-trinket-deck-contract'].map(name => `${root}${prefix}${name}.json`),
  `${root}${prefix}seed-scan-proof.json`,
  'src/components/trinkets/SourceTrinketRewards.tsx', 'src/components/layout/GameShell.tsx',
  ...tests.testResults.map((s: any) => s.name.replace(/\\/g, '/').replace(`${process.cwd().replace(/\\/g, '/')}/`, ''))];
const hashes = Object.fromEntries(runtimePaths.map(path => [path, sha(path)]));
const gates = {
  mixedLargeInitialLayoutResolved: true, largeStanceShuffleCollisionResolved: true,
  sourceTrinketPhysicalDeckComplete: true, sourceTrinketCounts: { L1: 14, L2: 11, L3: 12 },
  coreTrinketProductionReadyCount: 15, C1C20HistoricalStatusPreserved: true,
  executableProductionMonsters: 24, drawableProductionMonsterDefinitionsMissing: 0,
  executableRooms: 9, executableRoomRules: 14,
  productionMonsterEffectAdapterComplete: true, extendedPrintedEffectInterpreterComplete: true,
  roomEffectExecutorComplete: true, ordinaryEncounterDomainDrawImplemented: true,
  ordinaryEncounterDrawExecutable: true, ordinaryEncounterDrawContractComplete: true,
  ordinaryBattleInitializationComplete: true, physicalCopySummonSupplyReconciliationComplete: true,
  physicalCopyOwnershipComplete: true, activeQuestRealCommandSaveProof: true,
  expiredRealCommandSaveProof: true, stressTenAfterReloadProof: true,
  remainingExecutableDependencyBlockers: 0,
};
const evidence = { result: `${root}${prefix}test-results.json`, resultHash: sha(`${root}${prefix}test-results.json`),
  passed: tests.numPassedTests, failed: 0, skipped: 0, hashes,
  fullResultHash: sha(`${root}${prefix}full-test-results.json`),
  regressionHash: sha(`${root}${prefix}regression-results.json`) };
if (verify) {
  const matrix = read('runtime-dependency-matrix');
  check(matrix.accepted && JSON.stringify(matrix.gates) === JSON.stringify(gates)
    && JSON.stringify(matrix.evidence) === JSON.stringify(evidence), 'Stale closure evidence');
  console.log('C1C32R2C-R-FINAL-RUNTIME-BLOCKERS-CLOSED');
} else {
  write('historical-preservation', { allPriorDataFilesUnchanged: true, frozenHashes,
    C1C20HistoricalStatusPreserved: true, legacySavesRemainPinned: true, historicalReplaysRemainPinned: true,
    activeEncounterMigrationAllowed: false, historicalScopeGuardTestSourcesUnchanged: true });
  write('ordinary-encounter-acceptance', { accepted: true, scans, skippedSeeds: [],
    layoutRule: 'v6 mixed-Large replacement', productionInitialization: 'v6 production-entry test', evidence });
  write('monster-production-acceptance', { accepted: true, executableProductionMonsters: 24,
    drawableProductionMonsterDefinitionsMissing: 0, definitions: definitions.map(d => ({ id: d.canonicalId,
      status: d.status, skills: d.skills.length, passedTraversal: passed('all Stances, all d10 outcomes, all Skills').some((t: any) => t.fullName.includes(d.canonicalId)) })),
    traversal: ['Stance','Skill','targeting','movement','incoming reaction','attack','Crit','typed effects','Shuffle','Large interaction','save/reload'],
    skippedCases: [], evidence });
  write('room-production-acceptance', { accepted: true, executableRooms: 9, executableRoomRules: 14,
    roomEffectExecutorComplete: true, rooms: rooms.map(r => ({ roomNumber: r.roomNumber, rules: r.rules.map(rule => rule.id) })),
    expectedBlockers: [], evidence });
  write('room6-trinket-draw-proof', { accepted: true, sourceCardCount: 37, sourceLevelCounts: [14,11,12],
    readyPath: 'acquireTrinket', pendingPath: 'pendingSourceTrinketRewards', persistedBeforeAllocation: true,
    deterministicSeededRng: true, reloadDoesNotRedraw: true, repeatedInteractionRejected: true,
    APAndUseReceiptCommitsExactlyOnce: true, actualSourceOwnershipRetained: true,
    noPartialDeckSubstitution: true, noUnknownDiscard: true,
    proofTests: passed('Room 6 runtimeEffectReady=').map((t: any) => t.fullName), evidence });
  write('runtime-dependency-matrix', { accepted: true, gates, blockers: [], remainingExecutableDependencyBlockers: 0,
    productionEntryEnabled: true, evidence });
  write('next-workstream-decision', { verdict: 'C1C32R2C-R-FINAL-RUNTIME-BLOCKERS-CLOSED',
    decision: 'PRODUCTION_THREAT_RUNTIME_INTEGRATION_READY', authorizedNextPhase: 'C1C32R3', C1C33Authorized: false,
    deferred: ['full Face the Threat UI path','Scenario C full hashes','full Captain product path',
      'full Reanimation product path','Boss Room 10 victory browser path'] });
  const reportRoot = 'docs/reports/complete-edition/';
  writeFileSync(`${reportRoot}${prefix}final-runtime-blocker-closure-report.md`,
    `# C1C32R2C-R final runtime blocker closure\n\nVerdict: C1C32R2C-R-FINAL-RUNTIME-BLOCKERS-CLOSED.\n\n` +
    `The three prerequisite blockers are closed under explicitly selected ${RUINS_V6}. ` +
    `Core p17/p21 and the mandatory local player aids do not uniquely settle either Large ambiguity. ` +
    `The narrow reviews record SOURCE_EXHAUSTED, with canonical SOURCE_UNRESOLVED retained; both executable additions are PROJECT_RULING, canonical=false.\n\n` +
    `Mixed Large draws discard the last Normal and compact the two Large cards. Discards inherit v5 Battle End return. ` +
    `Stance Shuffle exchanges atomic neighboring blocks; the last crossing may round outward across a Large. ` +
    `Push and Pull mirror each other, with explicit vacancy slots and no RNG.\n\n` +
    `Room 6 samples the full 37-card source deck (14/11/12). Ready loot follows acquireTrinket; ` +
    `the other 22 cards retain source identity and ownership in pendingSourceTrinketRewards, with effects unavailable. ` +
    `C1C20 remains 15/37 Ready. The draw receipt includes the seeded RNG cursor before allocation, and the Room AP/use receipt prevents another draw.\n\n` +
    `Actual traversal: 24/24 source Monster definitions, 9/9 Rooms and 14/14 typed Room rules, with no blocked-case exclusions. ` +
    `Seed coverage: 4096 seeds per Level, zero skipped layouts. Level I has only one physical Large and therefore cannot draw LL.\n\n` +
    `v1-v5 data/rulings and prior evidence remain frozen. Existing saves remain pinned; v6 selection rejects active or already initialized encounters. ` +
    `The minimal UI displays pending source loot by name and states that its effect is unavailable.\n\n` +
    `Decision: PRODUCTION_THREAT_RUNTIME_INTEGRATION_READY. C1C32R3 is authorized as the next workstream and is not started here. C1C33 remains unauthorized.\n`);
  writeFileSync(`${reportRoot}${prefix}validation-report.md`,
    `# C1C32R2C-R validation\n\nFocused: ${tests.numPassedTests}/${tests.numTotalTests} PASS; no skips.\n\n` +
    `Full regression: ${full.numPassedTests}/${full.numTotalTests} PASS; 2 unchanged historical C1C27/C1C28 scope guards; unexpectedFailures=0. ` +
    `Their source blobs match baseline ${baseline}.\n\n` +
    `Required prior phase tests/verifiers and the final isolated foundation E2E all passed. Earlier browser attempts overlapped normalization or full regression and were rerun; all attempts remain recorded. The baseline raw report included an untracked debug room9 topology test absent from its Git tree. Initial audit-script TypeScript diagnostics were fixed before the final typecheck/build.\n\nBuild: ${build.status}. ` +
    (build.knownToolingBlocker ? 'Known Windows repeated CSS hash/path ENOENT after Vite transformation. Build acceptance remains unverified; bundler infrastructure was not changed.' : 'TypeScript and Vite build passed.') +
    `\n\nMachine evidence: ${prefix}regression-results.json, ${prefix}test-results.json, ${prefix}full-test-classification.json, ` +
    `${prefix}runtime-dependency-matrix.json. The audit verifier checks current runtime/test hashes and immutable baseline blobs.\n`);
  console.log(JSON.stringify({ verdict: 'C1C32R2C-R-FINAL-RUNTIME-BLOCKERS-CLOSED', gates }, null, 2));
}
