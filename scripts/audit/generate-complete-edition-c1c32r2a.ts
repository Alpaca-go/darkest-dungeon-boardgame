import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { validateRuinsSourceContracts } from '../../src/game-engine/ruins/source-registry';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../../src/game-engine/ruins/encounter-draw';
import { RUINS_V4 } from '../../src/types/ruins-executable';

const root = 'docs/data/complete-edition/';
const baseline = '624a2b5c20b9f40ee9e87ac103780cb9eb3c2053';
const common = { schemaVersion: 1, phase: '11A.4-C1C32R2A', baselineHead: baseline, policyId: 'RULEBOOK_ONLY_SOURCE_POLICY_V1' };
const read = (name: string) => JSON.parse(readFileSync(`${root}${name}.json`, 'utf8'));
const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const write = (name: string, value: object) => writeFileSync(`${root}c1c32r2a-${name}.json`, JSON.stringify({ ...common, ...value }, null, 2) + '\n');

validateRuinsSourceContracts();
const baselinePaths = execFileSync('git', ['ls-tree', '-r', '--name-only', baseline, 'docs/data/complete-edition', 'docs/reports/complete-edition'], { encoding: 'utf8' })
  .trim().split(/\r?\n/).filter(p => /\/c1c(?:2[0-9]|3[0-2])[^/]*\.(json|md)$/.test(p));
const frozenCode = ['src/game-engine/rules/large-movement-contract.ts', 'src/game-engine/campaign/necromancer-graveyard.ts',
  'src/game-engine/bosses/room-storage.ts', 'src/game-engine/rules/hero-dodge.ts',
  'src/game-engine/bosses/component-adapters/bone-combat-adapter.ts', 'src/game-engine/hamlet.ts', 'e2e/c1c32r-necromancer-threat-bridge.spec.ts'];
const frozenHamletHash = read('c1c23-hamlet-event-runtime-capability-matrix').runtimeEvidence.files['src/game-engine/hamlet.ts'];
const files = [...baselinePaths, ...frozenCode].map(path => {
  const before = sha(execFileSync('git', ['show', `${baseline}:${path}`], { maxBuffer: 64 * 1024 * 1024 }));
  const current = readFileSync(path);
  const after = sha(current);
  const normalized = path === 'src/game-engine/hamlet.ts' ? sha(current.toString('utf8').replace(/\r\n/g, '\n')) : after;
  if (before !== normalized || path === 'src/game-engine/hamlet.ts' && after !== frozenHamletHash) throw new Error('Historical preservation violated: ' + path);
  return { path, baselineSha256: before, sha256: after, normalizedSha256: normalized, unchanged: true,
    ...(path === 'src/game-engine/hamlet.ts' ? { note: 'EOL-only working-tree bytes match frozen C1C23 negative-runtime hash; normalized source equals the baseline Git blob' } : {}) };
});
write('historical-preservation', { files, historicalV1V2V3Preserved: true, existingSaveReplayArtifactsPreserved: true,
  roomStorageImplementationUnchanged: true, acceptedGraveyardCommandUnchanged: true, browserSentinelUnchanged: true });

// Render metadata is retained without copying production PDFs or temporary page images into Git.
const manifest = JSON.parse(readFileSync('tmp/c1c32r2a/render-manifest.json', 'utf8'));
write('local-official-source-manifest', { mandatoryRoot: 'C:\\Users\\kyrie\\Desktop\\新建文件夹\\DARKEST DUNGEON EN_FILES',
  acquisition: 'INDEPENDENT_RECURSIVE_LOCAL_PDF_SEARCH', recursivePdfCount: 243, files: manifest,
  externalSourcesUsed: false, sourcePDFsCommitted: false, pageImagesCommitted: false,
  visualReview: 'Actual production PDF artwork rendered at 3x via PyMuPDF; all 24 Monster identities, Tiles 1–9 and Room fronts 1–9 inspected',
  reviewLimit: 'Tile transcription is structurally validated but not accepted as final topology evidence' });

const seeds = Array.from({ length: 30 }, (_, i) => i + 1);
const drawProofs = ([1, 2, 3] as const).flatMap(level => seeds.map(seed => {
  const initial = createRuinsDrawState(level, seed);
  const result = drawOrdinaryRuinsEncounter(initial, 'encounter-1', { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' });
  const saved = JSON.parse(JSON.stringify(result));
  if (drawOrdinaryRuinsEncounter(saved, 'encounter-1', { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' }) !== saved) throw new Error('Encounter redraw');
  return { level, seed, initialHash: sha(JSON.stringify(initial)), resultHash: sha(JSON.stringify(result)),
    saveReloadHash: sha(JSON.stringify(saved)), rngCalls: result.rngCalls, physicalCopies: result.encounters[0].monsters.map(m => m.copyId),
    largeReplacement: result.encounters[0].drawEvents.some(e => e.type === 'LARGE_REPLACEMENT') };
}));
write('ordinary-encounter-executable-contract', { ruleSetVersion: RUINS_V4, status: 'DOMAIN_DRAW_IMPLEMENTED_PENDING_DEPENDENCY_ACCEPTANCE',
  domainModule: 'src/game-engine/ruins/encounter-draw.ts', productionIntegrated: false,
  roomDraw: 'Rooms 1–9 without replacement; 10–13 excluded', monsterDraw: 'Eligible physical copy deck, front/back stance priority, four occupied slots',
  ownership: ['DECK', 'ENCOUNTER', 'SUMMON_POOL', 'DISCARD'], exhaustion: 'Reject atomically; no unversioned automatic reshuffle',
  battleEnd: 'Official p25: active Monster cards returned and shuffled into deck; Room card remains discarded for current Dungeon run',
  sourceUnresolved: [{ field: 'initialLargeReplacementDiscard.returnTiming', status: 'SOURCE_UNRESOLVED',
    evidence: 'p17 says discard the last non-large spawn; p25 return paragraph does not explicitly classify the pre-Battle discarded card',
    runtimePolicy: 'Keep the printed discard fact, block subsequent encounter initialization until an official binding or explicit versioned noncanonical PROJECT_RULING exists' }],
  initiative: 'Generic Hero/Monster cards, one per character; Fisher–Yates with shared injected RNG',
  rngConsumption: 'Initial shuffle: 8 + eligibleCopies - 1 calls. Encounter draw: 4 + activeMonsters - 1 calls for initiative. Deck pops/ownership/placement consume zero.',
  savePolicy: 'Persist full result and RNG cursor; same encounter identity returns saved result unchanged; conflicting Hero selection rejects',
  proofClassification: 'SOURCE_COMPONENT_DOMAIN_ISOLATION_NOT_FULL_COMBAT_ACCEPTANCE', proofs: drawProofs,
  sourceReferences: read('c1c32r2-ordinary-threat-encounter-draw-contract').sourceReferences });

write('preparation-day-domain-bridge-proof', { status: 'DOMAIN_AND_UI_WIRING_ADDED_SCOPED_PROOFS',
  modules: ['src/game-engine/campaign/necromancer-preparation-day.ts', 'src/game-engine/commands/quest.ts', 'src/store/useGameStore.ts', 'src/pages/HamletPage.tsx'],
  testFile: 'src/audit/c1c32r2a-ruins-executable-dependencies.test.ts',
  path: ['saved Threat checkpoint', 'existing Quest result / Room return', 'real commitReturnToHamlet', 'saved tie selection', 'forced visit', 'Level II use/decline or Level III guard-only', 'accepted campaign transaction'],
  manualPhaseMutationAfterInitialFixture: false, savedSelectionRerolled: false, acceptedCommandRewritten: false,
  provenBoundaries: ['PENDING_TIE', 'PENDING_VISIT', 'PENDING_LEVEL_II_EFFECT', 'COMMITTED', 'PENDING_NEXT_QUEST', 'GUARD_ONLY'],
  fullProductPathProven: false, activeQuestAndExpiryThroughRealNextQuestProven: false,
  remaining: ['NORMAL_PRODUCT_THREAT_PREPARATION_ENTRY_PROOF', 'ACTIVE_QUEST_AND_EXPIRED_REAL_COMMAND_SAVE_PROOF'],
  limitation: 'Scoped tests cancel a reserved Boss Quest through finishQuest. The normal UI forbids voluntary Boss Quest exit. This is domain bridge coverage, not a certified complete product journey.' });

const blockers = ['ORDINARY_MONSTER_EFFECT_ADAPTER_NOT_BOUND', 'EXTENDED_PRINTED_EFFECT_INTERPRETER_NOT_BOUND',
  'ORDINARY_TILE_AREA_FINAL_VISUAL_TOPOLOGY_VALIDATION', 'ORDINARY_ROOM_EFFECT_EXECUTOR_NOT_BOUND',
  'ORDINARY_ENCOUNTER_EXECUTABLE_COMPONENT_ACCEPTANCE', 'NORMAL_PRODUCT_THREAT_PREPARATION_ENTRY_PROOF',
  'ACTIVE_QUEST_AND_EXPIRED_REAL_COMMAND_SAVE_PROOF', 'INITIAL_LARGE_REPLACEMENT_DISCARD_RETURN_SOURCE_UNRESOLVED'];
const gates = { drawableProductionMonsterDefinitionsMissing: 24, baselineDrawableProductionMonsterDefinitionsMissing: 23, prototypeMonsterDependencies: 0, syntheticMonsterDefinitions: 0,
  typedSourceCandidateIdentities: 24, successorExecutableDefinitionsAccepted: 0,
  printedStanceGroupingComplete: true, productionMonsterEffectAdapterComplete: false,
  tileAreaContractsComplete: false, tileStructuralValidation: true, roomEffectBindingsComplete: false,
  roomGlyphTranscriptionComplete: true, roomDeckContractComplete: true, room10ExclusionBound: true,
  ordinaryEncounterDrawContractComplete: false, ordinaryEncounterDomainDrawImplemented: true, ordinaryEncounterDrawExecutable: false,
  officialBoneSourceMismatchResolvedByVersioning: true, historicalV1V2V3Preserved: true,
  graveyardCampaignTransactionImplemented: true, preparationDayCheckpointDomainBridge: false };
write('runtime-dependency-matrix', { accepted: false, gates, blockers, remainingExecutableDependencyBlockers: blockers.length,
  scenarioC: { status: 'NOT_PROVEN', combatHashes: null }, candidateDataNeverPromotesProductionGate: true });
write('next-workstream-decision', { verdict: 'C1C32R2A-RUINS-EXECUTABLE-DEPENDENCIES-NOT-CLOSED',
  decision: 'EXECUTABLE_DEPENDENCY_CLOSURE_REMAINS_REQUIRED', integrationReady: false, blockers,
  C1C32R3: 'NOT_AUTHORIZED', nextPhaseAuthorized: null, promoteC1C33: false, scenarioC: 'NOT_PROVEN' });
console.log('C1C32R2A evidence audit PASS; acceptance NOT-CLOSED; R3 remains NOT_AUTHORIZED.');
