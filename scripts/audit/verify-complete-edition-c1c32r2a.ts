import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { validateRuinsSourceContracts } from '../../src/game-engine/ruins/source-registry';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../../src/game-engine/ruins/encounter-draw';
const root = 'docs/data/complete-edition/';
const read = (name: string) => JSON.parse(readFileSync(`${root}c1c32r2a-${name}.json`, 'utf8'));
const sha = (data: Buffer | string) => createHash('sha256').update(data).digest('hex');
const check = (condition: boolean, message: string) => { if (!condition) throw new Error(message); };
validateRuinsSourceContracts();
const manifest = read('local-official-source-manifest');
check(!manifest.externalSourcesUsed && !manifest.sourcePDFsCommitted, 'Source policy drift');
for (const file of manifest.files) check(sha(readFileSync(join(manifest.mandatoryRoot, file.relativePath))) === file.sha256, 'Official local PDF hash differs: ' + file.relativePath);
for (const file of read('historical-preservation').files) check(sha(readFileSync(file.path)) === file.sha256 && file.normalizedSha256 === file.baselineSha256, 'Historical file changed: ' + file.path);
check(read('historical-preservation').files.find((file: { path: string }) => file.path === 'src/game-engine/hamlet.ts')?.sha256
  === JSON.parse(readFileSync(root + 'c1c23-hamlet-event-runtime-capability-matrix.json', 'utf8')).runtimeEvidence.files['src/game-engine/hamlet.ts'],
  'Frozen C1C23 negative evidence differs from Hamlet source bytes');
const candidates = read('ruins-monster-executable-definitions').definitions;
check(candidates.length === 24 && candidates.every((d: { executable: boolean; status: string }) => !d.executable && d.status === 'SOURCE_BOUND_TYPED_CANDIDATE'), 'Unimplemented candidate promoted');
for (const proof of read('ordinary-encounter-executable-contract').proofs) {
  const initial = createRuinsDrawState(proof.level, proof.seed);
  const result = drawOrdinaryRuinsEncounter(initial, 'encounter-1', { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' });
  check(sha(JSON.stringify(initial)) === proof.initialHash && sha(JSON.stringify(result)) === proof.resultHash && proof.resultHash === proof.saveReloadHash, 'Draw/reload proof differs');
}
const matrix = read('runtime-dependency-matrix'), decision = read('next-workstream-decision');
check(matrix.accepted === false && matrix.scenarioC.combatHashes === null && matrix.gates.productionMonsterEffectAdapterComplete === false, 'Unsupported runtime acceptance');
check(decision.integrationReady === false && decision.C1C32R3 === 'NOT_AUTHORIZED' && !decision.promoteC1C33 && decision.verdict.endsWith('NOT-CLOSED'), 'Unsupported phase promotion');
check(matrix.blockers.length === matrix.remainingExecutableDependencyBlockers && JSON.stringify(matrix.blockers) === JSON.stringify(decision.blockers), 'Blocker accounting differs');
console.log('C1C32R2A source/provenance/ownership/replay integrity PASS; dependency acceptance NOT-CLOSED.');
if (process.argv.includes('--require-accepted')) throw new Error('C1C32R2A remains NOT-CLOSED; promotion rejected');
