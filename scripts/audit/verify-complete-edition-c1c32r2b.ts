import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter, returnOrdinaryRuinsEncounter } from '../../src/game-engine/ruins/encounter-draw';
import { ruinsMonsterDefinitions, validateRuinsSourceContracts } from '../../src/game-engine/ruins/source-registry';
import { RUINS_V4, RUINS_V5 } from '../../src/types/ruins-executable';
import { LARGE_REPLACEMENT_RETURN_RULING } from '../../src/game-engine/rules/ruins-v5';

const base = 'docs/data/complete-edition/';
const read = (name: string) => JSON.parse(readFileSync(`${base}c1c32r2b-${name}.json`, 'utf8'));
const sha = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
validateRuinsSourceContracts();
const manifest = read('local-official-source-manifest');
check(manifest.acquisition === 'TARGETED_FINAL_LOCAL_OFFICIAL_REVIEW', 'Source review scope changed');
type ManifestSource = { relativePath: string; sha256: string };
for (const source of new Map<string, ManifestSource>((manifest.files as ManifestSource[]).map(file => [file.relativePath, file])).values()) {
  check(sha(readFileSync(join(manifest.mandatoryRoot, source.relativePath))) === source.sha256,
    `Locked local official PDF hash differs: ${source.relativePath}`);
}
const tiles = read('tile-visual-topology-proof');
check(tiles.acceptedCount === 9 && tiles.tiles.length === 9 && tiles.tiles.every((tile: { result: string; visualReviewed: boolean; structuralValidation: boolean }) =>
  tile.result === 'PASS' && tile.visualReviewed && tile.structuralValidation), 'Tile visual acceptance incomplete');
const sourceReview = read('large-replacement-source-review'), ruling = read('large-replacement-project-ruling');
check(sourceReview.officialClarificationFound === false && sourceReview.canonicalStatus === 'SOURCE_UNRESOLVED'
  && ruling.authority === 'PROJECT_RULING' && ruling.canonical === false && ruling.rulingId === LARGE_REPLACEMENT_RETURN_RULING
  && ruling.selected === 'A', 'Large replacement ruling provenance differs');
const ruleset = read('ruleset-v5');
check(ruleset.ruleSetVersion === RUINS_V5 && ruleset.inherits === RUINS_V4 && ruleset.canonical === false
  && ruleset.newRulingId === ruling.rulingId, 'v5 inheritance or ruling differs');
const historic = read('historical-preservation');
check(historic.allPriorDataFilesUnchanged && historic.baselineIndexedTreeDigest === historic.currentIndexedTreeDigest,
  'Historical data index differs from baseline');
check(sha(readFileSync('src/game-engine/hamlet.ts')) === historic.hamletFrozenC1C23Sha256
  && readFileSync('.gitattributes', 'utf8').split(/\r?\n/).filter(line => line.trim() && !line.startsWith('#'))
    .join('\n') === 'src/game-engine/hamlet.ts text eol=crlf',
  'Frozen Hamlet bytes or targeted checkout rule differ');
const candidates = ruinsMonsterDefinitions(RUINS_V5);
check(candidates.length === 24 && candidates.every(d => d.status === 'SOURCE_BOUND_TYPED_CANDIDATE' && !d.executable),
  'Unaccepted Monster promoted');
const encounter = read('ordinary-encounter-runtime-proof');
for (const proof of encounter.proofs) {
  const initial = createRuinsDrawState(proof.level, proof.seed, RUINS_V5);
  const drawn = drawOrdinaryRuinsEncounter(initial, `v5-level-${proof.level}`,
    { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' });
  const returned = returnOrdinaryRuinsEncounter(JSON.parse(JSON.stringify(drawn)), `v5-level-${proof.level}`);
  check(sha(JSON.stringify(initial)) === proof.initialHash && sha(JSON.stringify(drawn)) === proof.drawHash
    && sha(JSON.stringify(returned)) === proof.returnHash && proof.drawHash === proof.reloadHash,
  'v5 deterministic encounter proof differs');
}
const matrix = read('runtime-dependency-matrix'), decision = read('next-workstream-decision');
check(matrix.accepted === false && matrix.blockers.length === matrix.remainingExecutableDependencyBlockers
  && matrix.gates.tileAreaFinalVisualValidation && matrix.gates.initialLargeReplacementDiscardPolicyResolved
  && matrix.gates.executableProductionMonsters === 0 && !matrix.gates.roomEffectExecutorComplete
  && JSON.stringify(matrix.blockers) === JSON.stringify(decision.blockers)
  && decision.integrationReady === false && decision.C1C32R3 === 'NOT_AUTHORIZED'
  && decision.C1C33 === 'NOT_AUTHORIZED' && matrix.scenarioC.combatHashes === null,
  'Unsupported production promotion');
console.log(`C1C32R2B provenance/visual/v5 ownership PASS; dependency acceptance NOT-CLOSED (${matrix.blockers.length} blockers).`);
if (process.argv.includes('--require-accepted')) throw new Error('C1C32R2B remains NOT-CLOSED; R3 promotion rejected');
