import { expect, it } from 'vitest';
import { runFormalProductionMatrix } from './production-official-matrix-execution';

it('formal runtime API cannot forge a registry-only pass while imports are blocked', () => {
  const matrix = runFormalProductionMatrix({ runId: 'run', sourceInputHash: 'source', verificationInputHash: 'verify' });
  expect(matrix.status).toBe('SOURCE-BLOCKED');
  expect(matrix.evidenceKind).toBe('SOURCE-BLOCKED');
  expect(matrix.combinationsRun).toBe(0);
});
