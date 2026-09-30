import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { RUINS_PRODUCTION_EXECUTOR_BLOCKERS } from '../../src/game-engine/ruins/battle-runtime';

const path = resolve('docs/data/complete-edition/c1c32r2c-runtime-dependency-matrix.json');
const matrix = JSON.parse(readFileSync(path, 'utf8')) as {
  phase: string; accepted: boolean; remainingExecutableDependencyBlockers: number;
  blockers: string[]; gates: Record<string, boolean | number>;
  evidence: { result: string; passed: number; failed: number; testHashes: Record<string, string>; runtimeHashes: Record<string, string> };
};
if (matrix.phase !== '11A.4-C1C32R2C' || matrix.blockers.length !== matrix.remainingExecutableDependencyBlockers)
  throw new Error('C1C32R2C matrix identity/blocker count invalid');
if (JSON.stringify(matrix.blockers) !== JSON.stringify(RUINS_PRODUCTION_EXECUTOR_BLOCKERS))
  throw new Error('C1C32R2C runtime and evidence blockers differ');
const tests = JSON.parse(readFileSync(matrix.evidence.result, 'utf8'));
if (!tests.success || tests.numFailedTests !== matrix.evidence.failed || tests.numPassedTests !== matrix.evidence.passed)
  throw new Error('C1C32R2C runtime test evidence differs');
for (const [file, hash] of Object.entries({ ...matrix.evidence.testHashes, ...matrix.evidence.runtimeHashes }))
  if (createHash('sha256').update(readFileSync(file)).digest('hex') !== hash) throw new Error(`Stale test evidence: ${file}`);
if (matrix.accepted !== (matrix.blockers.length === 0 && matrix.gates.executableProductionMonsters === 24
  && matrix.gates.executableRooms === 9 && matrix.gates.executableRoomRules === 14))
  throw new Error('C1C32R2C promotion inconsistent with runtime gates');
console.log(JSON.stringify({ phase: matrix.phase, accepted: matrix.accepted,
  remainingExecutableDependencyBlockers: matrix.remainingExecutableDependencyBlockers,
  blockers: matrix.blockers }, null, 2));
if (process.argv.includes('--verify') && (!matrix.accepted || matrix.remainingExecutableDependencyBlockers !== 0)) {
  console.error('C1C32R2C-RUINS-PRODUCTION-RUNTIME-DEPENDENCIES-NOT-CLOSED');
  process.exitCode = 1;
}
