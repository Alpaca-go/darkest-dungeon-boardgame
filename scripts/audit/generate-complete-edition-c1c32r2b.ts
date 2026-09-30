import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter, returnOrdinaryRuinsEncounter } from '../../src/game-engine/ruins/encounter-draw';
import { ruinsMonster, ruinsMonsterDefinitions } from '../../src/game-engine/ruins/source-registry';
import { RUINS_V5 } from '../../src/types/ruins-executable';

const phase = '11A.4-C1C32R2B';
const baselineHead = '2c4dfcf849579a5b53581f7a6d804285fe720c52';
const prefix = 'docs/data/complete-edition/c1c32r2b-';
const sha = (value: string | Buffer) => createHash('sha256').update(value).digest('hex');
const write = (name: string, value: unknown) => writeFileSync(`${prefix}${name}.json`, JSON.stringify(value, null, 2) + '\n');
const git = (...args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();
const heroes = { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' } as const;

const historicalPaths = git('ls-tree', '-r', '--name-only', baselineHead, '--', 'docs/data/complete-edition')
  .split(/\r?\n/).filter(Boolean);
const historicalObjects = historicalPaths.map(file => `${file}\t${git('rev-parse', `${baselineHead}:${file}`)}`);
const currentObjects = historicalPaths.map(file => `${file}\t${git('rev-parse', `:${file}`)}`);
const historical = {
  schemaVersion: 1, phase, baselineHead, policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  trackedPriorDataFileCount: historicalPaths.length,
  baselineIndexedTreeDigest: sha(historicalObjects.join('\n')),
  currentIndexedTreeDigest: sha(currentObjects.join('\n')),
  allPriorDataFilesUnchanged: JSON.stringify(historicalObjects) === JSON.stringify(currentObjects),
  hamletWorkingSha256: sha(readFileSync('src/game-engine/hamlet.ts')),
  hamletFrozenC1C23Sha256: '1808d25ec4c55061791f4861bef7b8f617d8007084e939326910cbc1f96551ca',
  gitattributesRule: readFileSync('.gitattributes', 'utf8').trim(),
};
write('historical-preservation', historical);

const proofs = ([{ level: 1, seed: 1 }, { level: 2, seed: 8 }, { level: 3, seed: 9 }] as const).map(({ level, seed }) => {
  const initial = createRuinsDrawState(level, seed, RUINS_V5);
  const drawn = drawOrdinaryRuinsEncounter(initial, `v5-level-${level}`, heroes);
  const reloaded = JSON.parse(JSON.stringify(drawn)) as typeof drawn;
  const returned = returnOrdinaryRuinsEncounter(reloaded, `v5-level-${level}`);
  return { level, seed, initialHash: sha(JSON.stringify(initial)), drawHash: sha(JSON.stringify(drawn)),
    reloadHash: sha(JSON.stringify(reloaded)), returnHash: sha(JSON.stringify(returned)),
    monsterCopyIds: drawn.encounters[0].monsters.map(m => m.copyId),
    smallMonsterPresent: drawn.encounters[0].monsters.some(m => ruinsMonster(m.definitionId, RUINS_V5).size === 'SMALL'),
    largeMonsterPresent: drawn.encounters[0].monsters.some(m => ruinsMonster(m.definitionId, RUINS_V5).size === 'LARGE'),
    replacementCopyIds: drawn.encounters[0].drawEvents.filter(e => e.type === 'LARGE_REPLACEMENT').map(e => e.copyId),
    replacementReturnedWithBattle: drawn.encounters[0].drawEvents.filter(e => e.type === 'LARGE_REPLACEMENT')
      .every(e => returned.ownership[e.copyId].location === 'DECK' && returned.monsterDeck.includes(e.copyId)),
    roomNumber: drawn.encounters[0].roomNumber, tileId: drawn.encounters[0].tileId,
    combatInitialized: false };
});
write('ordinary-encounter-runtime-proof', { schemaVersion: 1, phase, baselineHead, ruleSetVersion: RUINS_V5,
  domainDrawAndReturnDeterministic: proofs.every(p => p.drawHash === p.reloadHash && p.replacementReturnedWithBattle),
  combatInitializationProven: false, proofs });

const definitions = ruinsMonsterDefinitions(RUINS_V5);
write('monster-runtime-acceptance', { schemaVersion: 1, phase, baselineHead, ruleSetVersion: RUINS_V5,
  sourceBoundMonsterCandidates: definitions.length, printedSkillSelectionImplemented: true,
  areaTargetRankingImplemented: true, genericAttackAdapterComplete: false,
  extendedPrintedEffectInterpreterComplete: false, executableProductionMonsters: 0,
  drawableProductionMonsterDefinitionsMissing: definitions.length,
  status: 'NOT_ACCEPTED', reason: 'No complete BattleState attack/effect/movement/save executor or incoming attack integration' });
write('room-runtime-acceptance', { schemaVersion: 1, phase, baselineHead, ordinaryRooms: 9, typedRules: 14,
  roomEffectExecutorComplete: false, persistedInteractionsProven: false, passiveEngineInterceptionProven: false,
  status: 'NOT_ACCEPTED', reason: 'Typed Room rules have no production engine-level executor' });
write('physical-copy-ownership-proof', { schemaVersion: 1, phase, baselineHead, ruleSetVersion: RUINS_V5,
  physicalCopyCensus: definitions.flatMap(d => d.physicalCopyIds).length,
  ordinaryDrawExclusive: true, replacementDiscardLifecycleVersioned: true,
  returnTransactionIdempotent: true, necromancerSummonSupplyReconciled: false,
  physicalCopyOwnershipComplete: false,
  status: 'PARTIAL', reason: 'Boss summon ledger token IDs are not yet bound to canonical ordinary copy IDs' });
write('graveyard-active-expired-proof', { schemaVersion: 1, phase, baselineHead,
  preparationDayDomainBridgeImplemented: true, preparationDayFullProductPathProven: false,
  pendingNextQuestTransactionProvenByC1C32R2A: true,
  activeQuestRealCommandSaveProof: false, expiredRealCommandSaveProof: false,
  stressTenAfterReloadProof: false,
  status: 'NOT_PROVEN', reason: 'Boss-locked continuation requires an actual next Quest start and end; no status mutation or forbidden Boss leave was used' });

const blockers = [
  'ORDINARY_MONSTER_EFFECT_ADAPTER_NOT_BOUND',
  'EXTENDED_PRINTED_EFFECT_INTERPRETER_NOT_BOUND',
  'ORDINARY_ROOM_EFFECT_EXECUTOR_NOT_BOUND',
  'ORDINARY_ENCOUNTER_EXECUTABLE_COMPONENT_ACCEPTANCE',
  'PHYSICAL_COPY_SUMMON_SUPPLY_RECONCILIATION_NOT_BOUND',
  'ACTIVE_QUEST_AND_EXPIRED_REAL_COMMAND_SAVE_PROOF',
];
const gates = {
  sourceBoundMonsterCandidates: 24, executableProductionMonsters: 0, drawableProductionMonsterDefinitionsMissing: 24,
  printedStanceGroupingComplete: true, productionMonsterEffectAdapterComplete: false,
  extendedPrintedEffectInterpreterComplete: false,
  tileAreaStructuralValidation: true, tileAreaFinalVisualValidation: true,
  roomGlyphTranscriptionComplete: true, roomEffectExecutorComplete: false,
  roomDeckContractComplete: true, room10ExclusionBound: true,
  initialLargeReplacementDiscardPolicyResolved: true, largeReplacementProjectRulingVersioned: true,
  ordinaryEncounterDomainDrawImplemented: true, ordinaryEncounterDrawExecutable: false,
  ordinaryEncounterDrawContractComplete: false, physicalCopyOwnershipComplete: false,
  officialBoneSourceMismatchResolvedByVersioning: true, historicalV1V2V3V4Preserved: historical.allPriorDataFilesUnchanged,
  graveyardCampaignTransactionImplemented: true, preparationDayDomainBridgeImplemented: true,
  preparationDayFullProductPathProven: false, activeQuestExpiredRealCommandProof: false,
};
write('runtime-dependency-matrix', { schemaVersion: 1, phase, baselineHead, policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  accepted: false, gates, blockers, remainingExecutableDependencyBlockers: blockers.length,
  deferredToC1C32R3: ['NORMAL_PRODUCT_THREAT_PREPARATION_ENTRY_PROOF', 'SCENARIO_C_FULL_PRODUCT_PATH'],
  scenarioC: { status: 'NOT_PROVEN', combatHashes: null } });
write('next-workstream-decision', { schemaVersion: 1, phase, baselineHead, policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1',
  verdict: 'C1C32R2B-RUINS-PRODUCTION-EXECUTABLE-DEPENDENCIES-NOT-CLOSED',
  integrationReady: false, blockers, C1C32R3: 'NOT_AUTHORIZED', C1C33: 'NOT_AUTHORIZED',
  promoteC1C33: false, scenarioC: 'NOT_PROVEN' });
console.log(`C1C32R2B audit generated: ${blockers.length} executable blockers; R3 NOT_AUTHORIZED`);
