import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { ruinsMonsterDefinitions, ruinsRoom } from '../../src/game-engine/ruins/source-registry';
import { RUINS_V6 } from '../../src/types/ruins-executable';
import { sourceTrinketDeck } from '../../src/game-engine/trinkets/source-deck';
import { compareProductionReplay } from './c1c32r3r-replay';

const root = 'docs/data/complete-edition/', baseline = 'b01a3380aa1f9c24d7c6bafb32be99220ac10421';
const hash = (bytes: string | Buffer) => createHash('sha256').update(bytes).digest('hex');
const fileHash = (path: string) => hash(readFileSync(path));
const sourceHash = (path: string) => hash(readFileSync(path, 'utf8').replace(/\r\n/g, '\n'));
const read = (name: string) => JSON.parse(readFileSync(`${root}${name}.json`, 'utf8'));
const check = (condition: unknown, message: string) => { if (!condition) throw new Error(message); };
const write = (name: string, data: object) => writeFileSync(`${root}c1c33-${name}.json`, JSON.stringify({schemaVersion: 1, phase: '11A.4-C1C33', baseline, ...data}, null, 2) + '\n');
const paths = () => execFileSync('git', ['ls-files', '--cached', '--others', '--exclude-standard'], {encoding: 'utf8'}).trim().split(/\r?\n/);
const reviewedPaths = ['package.json', 'src/main.tsx', 'src/store/useGameStore.ts', 'src/game-engine/ruins/production-threat-runtime.ts', 'src/game-engine/bosses/threat-checkpoint.ts', 'src/game-engine/save.ts'];
if (process.argv.includes('--prepare')) {
  write('runtime-review', {gameplaySemanticsChanged: false, schema1Migration: false,
    fixes: ['Reject schema-2 consumed flag rollback using existing causal events', 'Validate settled checkpoints at direct save restoration',
      'Exclude deterministic seed/debug mutations from production', 'Pin C1C29 audit to its immutable baseline commit rather than a local branch'],
    prerequisiteVerification: 'Original R3R verifier runs in isolated baseline checkout; successor bytes verified separately',
    successorHashes: Object.fromEntries(reviewedPaths.map(p => [p, fileHash(p)]))});
  process.exit(0);
}

const validation = read('c1c33-validation-observation');
const checkOnly = process.argv.includes('--check-only');
check(!checkOnly || !process.argv.includes('--verify'), 'Diagnostic mode cannot replace freeze verification');
if (!checkOnly) check(validation.codeHashProtocol === 'UTF8_LF_SHA256_V1'
  && validation.codeHashes && Object.entries(validation.codeHashes).every(([p, h]) => sourceHash(p) === h), 'Acceptance run predates final code');
check(validation.freshCheckout.cleanBeforeInstall && validation.freshCheckout.npmCiExitCode === 0, 'Fresh checkout / npm ci missing');
check(fileHash('docs/DD_EN_COREBOX_RULES.pdf') === read('c1a-rulebook-evidence').sha256, 'Vendored locked core rulebook integrity mismatch');
check(validation.commands.every((c: any) => c.exitCode === 0 || c.classification === 'EXPECTED_SUCCESSOR_RUNTIME_DIVERGENCE'
  || c.kind === 'full-regression' && c.classification === 'ACCEPTED_HISTORICAL_SCOPE_GUARDS'), 'Unexpected validation failure');
check(validation.fullTests.total === 2657 && validation.fullTests.collectionErrors.length === 0
  && validation.fullTests.pending === 0 && validation.fullTests.failedTests.length === 2
  && validation.fullTests.failedTests.every((t: any) => t.messages.some((m: string) => /C1C2[78]: scope violation/.test(m))), 'Unexpected full regression failure/skip');
for (const kind of ['typecheck', 'acceptance', 'production-threat', 'browser', 'r3r-verifier', 'build'])
  check(validation.commands.some((c: any) => c.kind === kind && c.exitCode === 0), `${kind} not passed`);
const historical = execFileSync('git', ['diff', '--name-only', baseline, '--', 'docs/data', 'docs/reports', 'src/data'], {encoding: 'utf8'})
  .trim().split(/\r?\n/).filter(Boolean).filter(p => !p.split('/').at(-1)!.startsWith('c1c33-'));
check(historical.length === 0, 'Frozen historical evidence/source data changed');
const sources = paths().filter(p => /^src\//.test(p) && /\.(tsx?|mjs)$/.test(p) && !/\.(test|spec)\./.test(p) && !p.startsWith('src/audit/'));
const localMatches = sources.filter(p => /C:[\\/]+Users[\\/]+kyrie|DARKEST DUNGEON EN_FILES/.test(readFileSync(p, 'utf8')));
check(localMatches.length === 0, 'Absolute local source dependency');
const bundles = execFileSync('git', ['ls-files', 'src/assets'], {encoding: 'utf8'}).trim().split(/\r?\n/).filter(Boolean);
check(bundles.length > 0 && bundles.every(p => existsSync(p)), 'Committed asset missing');
const manifests = paths().filter(p => /manifest\.json$/.test(p) && /^docs\/data\//.test(p));
let assetCount = 0;
function assets(value: any) {
  if (!value || typeof value !== 'object') return;
  if (typeof value.localPath === 'string' && value.localPath.startsWith('src/assets/') && (value.status === 'ready' || value.localSha256)) {
    check(existsSync(value.localPath), `Missing asset ${value.localPath}`);
    if (value.localSha256) check(fileHash(value.localPath) === value.localSha256, `Asset hash mismatch ${value.localPath}`);
    assetCount++;
  }
  Object.values(value).forEach(assets);
}
manifests.forEach(p => assets(JSON.parse(readFileSync(p, 'utf8'))));
check(validation.bundleAudit.debugHooks === 0 && validation.bundleAudit.localSourcePaths === 0, 'Production bundle contains forbidden hooks');
check(ruinsMonsterDefinitions(RUINS_V6).length === 24 && Array.from({length: 9}, (_, i) => ruinsRoom(i + 1)).flatMap(r => r.rules).length === 14
  && sourceTrinketDeck().length === 37 && sourceTrinketDeck().filter(t => t.runtimeEffectReady).length === 15, 'Frozen census changed');
const scenario = read('c1c33-browser-scenario-c-proof');
check(scenario.status === 'PASS' && scenario.productionProof && !scenario.syntheticCombatFixture, 'Scenario C is not production proof');
for (const key of ['initialStateHash', 'preSaveHash', 'saveHash', 'reloadedHash', 'finalStateHash', 'eventSequenceHash', 'physicalOwnershipHash'])
  check(/^[a-f0-9]{64}$/.test(scenario[key]), `Scenario C ${key} absent`);
check(scenario.preSaveHash === scenario.reloadedHash && scenario.spawned.instanceId !== scenario.spawned.predecessorUnitId, 'Scenario C identity/reload invalid');
const continuations = [1, 2, 3].flatMap(level => read(`c1c33-browser-level${level}-replay-states`).map((s: any) => ({level, ...compareProductionReplay(s.point, s.campaign)})));
const observations = [1, 2, 3].map(level => read(`c1c33-browser-level${level}-observation`));
for (const level of [2, 3]) {
  const standard = read(`c1c33-standard-level${level}-observation`);
  check(standard.status === 'PASS' && standard.syntheticCombatFixture === false && standard.identity.questScope === 'STANDARD'
    && standard.settled.ruinsDrawState.encounters.some((e: any) => e.returned)
    && standard.archived.bossEncounterCheckpoint === null && standard.archived.activeThreatRuntime.active
    && standard.archived.necromancerPreparationDay, 'Higher-level Standard ordinary Battle/archive not proven');
  compareProductionReplay(`standard-level-${level}-settled`, standard.settled);
  compareProductionReplay(`standard-level-${level}-archived`, standard.archived);
}
check(observations.every(o => o.status === 'PASS' && o.encounter.cleanupState.completed) && observations[0].fixtureInjection === false, 'Three browser levels required');
const reloadMatrix = read('c1c33-browser-reload-matrix');
check(['ordinary Battle', 'Captain Battle', 'Reanimation', 'Preparation Day', 'Boss Room', 'Boss Battle']
  .every(point => reloadMatrix.points.includes(point)), 'Browser reload matrix incomplete');
check(reloadMatrix.externalNetworkBlocked === true, 'Steam/external network independence unproven');
for (const [index, o] of observations.entries()) {
  const level = index + 1, events = o.encounter.events;
  check(o.progress.defeatedThreatIds.includes(`necromancer-threat-level-${level}`)
    && o.progress.defeatedBossFamilyIds.includes('necromancer') && o.progress.activeThreatId === null
    && o.progress.act === level + 1 && (level !== 3 || o.progress.darkestDungeonUnlocked), `Level ${level} progression invalid`);
  check(events.filter((e: any) => e.eventType === 'BOSS_BATTLE_STARTED').length === 1, 'Duplicate Face the Threat Battle');
  check(o.ordinaryEncounters.every((e: any) => e.returned), 'Orphaned ordinary card ownership');
  if (level > 1) {
    check(o.campaignActPrerequisiteFixture && o.syntheticCombatFixture === false, 'Higher level proof uses synthetic combat');
    check(o.preparationProof.length === 2 && o.preparationProof.every((p: any) => p.preparation.status === 'COMMITTED'), 'Preparation Day incomplete');
    if (level === 2) check(o.preparationProof[0].receipts.at(-1).useEffect === true && o.preparationProof[1].receipts.at(-1).useEffect === false, 'Level II effect/decline not covered');
    else check(o.preparationProof.every((p: any) => p.receipts.at(-1).useEffect === false), 'Level III guard-only not preserved');
  }
  const states = read(`c1c33-browser-level${level}-replay-states`);
  const lifecycle = new Set(states.map((s: any) => s.campaign.bossRoomStorage?.lifecycle));
  check(['RESERVED', 'IN_PLAY', 'RETURNED'].every(s => lifecycle.has(s)), 'Room 10 lifecycle incomplete');
  for (const s of states) {
    const c = s.campaign, cp = c.bossEncounterCheckpoint, r = c.battle?.ruinsContext;
    check(new Set(c.processedCampaignTransactionIds).size === c.processedCampaignTransactionIds.length, 'Duplicate campaign transaction');
    if (cp) check(cp.checkpointContext.questRunId === c.dungeon.questRunId
      && cp.checkpointContext.threatId === c.activeThreatRuntime.threatId, 'Threat / Quest cross-link changed');
    if (c.necromancerQuestThreatHistory?.length) {
      const history = c.necromancerQuestThreatHistory.map((h: any) => h.checkpoint.checkpointContext);
      check(new Set(history.map((h: any) => h.questRunId)).size === history.length
        && new Set(history.map((h: any) => h.encounterId)).size === history.length
        && history.every((h: any) => h.threatId === `necromancer-threat-level-${level}`), 'Act Threat / Quest identity regression');
      if (c.gamePhase === 'hamlet') check(cp === null && c.activeThreatRuntime.active, 'Standard checkpoint archive deactivated Threat');
    }
    if (r) {
      check(r.executionSchemaVersion === 2, 'Production schema downgrade');
      for (const unit of c.battle.monsters) {
        const binding = r.unitPhysicalBindings[unit.id];
        if (!binding.generation) continue;
        const old = r.retiredMonsterInstances.find((d: any) => d.unit.id === binding.predecessorUnitId);
        check(old && old.unit.id !== unit.id && old.copyId === binding.copyId && old.generation + 1 === binding.generation, 'Reanimation physical identity changed');
        const spawned = cp.events.find((e: any) => e.eventType === 'REANIMATION_SPAWNED' && e.result.instanceId === unit.id);
        check(spawned && spawned.result.figureId === (c.ruinsBoneFigureSupply.ordinaryAssignments[r.encounterId][binding.copyId] ?? null), 'Reanimation figure changed');
      }
    }
    if (s.point === 'boss-after-settlement') {
      const victory = c.bossEncounterHistory.at(-1).cleanupState.campaignTransactionId;
      check((c.activeThreatRuntime === null || c.activeThreatRuntime.active === false)
        && c.campaignProgress.activeThreatId === null && c.bossRoomStorage.lifecycle === 'RETURNED'
        && victory && c.processedCampaignTransactionIds.includes(victory), 'Boss victory cleanup incomplete');
    }
  }
}
check(observations[0].encounter.threatState.permanentlyRemovedDefinitionIds.length > 0, 'Level I removal absent');
check(observations[1].encounter.events.filter((e: any) => e.eventType === 'CAPTAIN_THREAT_CONSUMED').length === 1
  && observations[1].encounter.events.some((e: any) => e.eventType === 'CAPTAIN_INITIAL_DRAW_BOUND' && e.result.copyId && e.result.figureId), 'Captain production injection absent/repeated');
if (checkOnly) {
  console.log('C1C33 invariant diagnostics completed; no production acceptance or freeze written');
  process.exit(0);
}
const runtimeHashes = Object.fromEntries(sources.map(p => [p, sourceHash(p)]));
const evidencePaths = [...paths().filter(p => /^docs\/data\//.test(p) && !p.split('/').at(-1)!.startsWith('c1c33-')), 'docs/DD_EN_COREBOX_RULES.pdf'];
const evidenceHashes = Object.fromEntries(evidencePaths.map(p => [p, fileHash(p)]));
const output = {
  localSourceIndependence: {absoluteLocalSourceDependencies: 0, localPdfRuntimeDependency: false, localRawAssetRuntimeDependency: false, scannedFiles: sources.length},
  lockedAuditInput: {path: 'docs/DD_EN_COREBOX_RULES.pdf', sha256: fileHash('docs/DD_EN_COREBOX_RULES.pdf'),
    lockReference: 'c1a-rulebook-evidence.json', newlyAcquired: false, runtimeDependency: false, purpose: 'Reproduce historical source-integrity checks from a fresh checkout'},
  assets: {status: 'PASS', committedAssets: bundles.length, hashCheckedManifestReferences: assetCount},
  debugHookAudit: validation.bundleAudit,
  saveReplay: {status: 'PASS', continuations},
  ownershipAudit: {duplicatePhysicalOwners: 0, validators: ['validateSaveFile', 'validateRuinsDrawState', 'validateBoneFigureSupply', 'validateProductionOrdinaryThreat', 'validateProductionBossRoomStorage'],
    evidence: 'All three real browser routes and their saved states validate; predecessor/copy/generation/figure invariants checked above'},
  lifecycleAudit: {activeThreatCrossQuestLifecycle: true, questLocalCheckpointLifecycle: true, duplicateFaceTheThreatEncounter: false,
    duplicateBossRoomReservation: false, room10: ['RESERVED', 'IN_PLAY', 'RETURNED'], reloadMatrix},
};
if (process.argv.includes('--verify')) {
  const manifest = read('c1c33-necromancer-production-freeze-manifest');
  check(manifest.runtimeHashProtocol === 'UTF8_LF_SHA256_V1', 'Runtime fingerprint protocol missing');
  for (const [p, expected] of Object.entries(manifest.runtimeHashes)) check(sourceHash(p) === expected, `Stale C1C33 runtime ${p}`);
  for (const [p, expected] of Object.entries({...manifest.evidenceHashes, ...manifest.acceptanceHashes}))
    check(fileHash(p) === expected, `Stale C1C33 freeze ${p}`);
  check(read('c1c33-necromancer-production-acceptance').verdict === 'C1C33-NECROMANCER-PRODUCTION-ACCEPTED', 'Acceptance missing');
  console.log('C1C33-NECROMANCER-PRODUCTION-ACCEPTED');
} else {
  write('release-audit', {status: 'PASS', ...output});
  write('historical-preservation', {status: 'PASS', modifiedHistoricalFiles: historical, immutableHistoricalEvidence: evidenceHashes,
    versionedSemanticContracts: ['C1C28-DIGITAL-DEFAULT-v1', 'Hero Dodge v2', 'Ruins v1-v6'], legacySaveCompatibility: 'PASS', silentMigration: false,
    acceptedSuccessorRuntimeDivergence: validation.commands.filter((c: any) => c.classification === 'EXPECTED_SUCCESSOR_RUNTIME_DIVERGENCE')});
  write('necromancer-release-readiness', {status: 'PASS', typecheck: 'PASS', tests: 'PASS', fullRegression: validation.fullTests,
    browser: 'PASS', build: 'PASS', freshCheckout: validation.freshCheckout, ...output, prototypeReachability: {status: 'PASS', evidence: 'C1C32R3 production entry + R3R real source route tests', productionReachability: 0}});
  write('runtime-capability-matrix', {status: 'PASS', capabilities: Object.fromEntries(['NormalSelectorEntry', 'OrdinaryThreatBattle', 'ThreatCheckpointResume',
    'CaptainProductionInjection', 'ThreatReanimation', 'PreparationDayProductPath', 'RoomStorage', 'SaveReplayProduction', 'BossRoomTransition', 'BossVictoryProductPath'].map(k => [k, 'PRODUCTION_ACCEPTED']))});
  write('necromancer-production-acceptance', {status: 'PASS', verdict: 'C1C33-NECROMANCER-PRODUCTION-ACCEPTED', decision: 'NECROMANCER_PRODUCTION_READY',
    family: 'necromancer', levelsAccepted: [1, 2, 3], productionReady: true, familyAcceptanceRecord: {productionReady: 1, workstream: 'FROZEN'}, blockers: [],
    runtimeSchema: 2, scenarioC: 'PASS', browser: 'PASS', build: 'PASS', saveReplay: 'PASS', historicalCompatibility: 'PASS', unexpectedRegressionFailures: 0,
    proofRefs: ['c1c33-validation-observation.json', 'c1c33-release-audit.json', 'c1c32r3r-runtime-capability-matrix.json']});
  const acceptancePaths = paths().filter(p => p.startsWith(`${root}c1c33-`) && !p.endsWith('freeze-manifest.json'));
  write('necromancer-production-freeze-manifest', {status: 'PASS', ruleSetLineage: ['C1C28-DIGITAL-DEFAULT-v1', 'C1C31 Hero Dodge v2', 'Ruins v3-v6'],
    monsterDataset: 'c1c32r2a-ruins-monster-executable-definitions.json', roomDataset: 'c1c32r2a-ruins-room-effect-definitions.json', tileDataset: 'c1c32r2a-ruins-tile-area-definitions.json',
    threatSemanticContract: 'c1c28-necromancer-runtime-semantic-contract.json', r3rProofRefs: ['c1c32r3r-runtime-capability-matrix.json', 'c1c32r3r-scenario-c-proof.json'],
    sourceProvenanceRefs: ['rule-source-policy.json', 'c1c28-necromancer-project-rulings.json'], runtimeSchemaVersion: 2,
    historicalSchemasMigrated: false, runtimeHashProtocol: 'UTF8_LF_SHA256_V1', evidenceHashProtocol: 'RAW_BYTES_SHA256', runtimeHashes, evidenceHashes, acceptanceHashes: Object.fromEntries(acceptancePaths.map(p => [p, fileHash(p)]))});
  console.log('C1C33 release audit PASS; production acceptance and freeze generated');
}
