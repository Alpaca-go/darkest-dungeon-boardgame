import { expect, it } from 'vitest';
import { createOfficialMatrixRunner } from './official-matrix-runner';
it('source blocked is NOT-RUN and cannot become official evidence', () => {
  expect(createOfficialMatrixRunner(false).runCombination('templars', 'ancestor-first-form', 'formal').status).toBe('NOT-RUN');
});
it('source ready exposes a future runner path without inventing results', () => {
  const runner = createOfficialMatrixRunner(true);
  expect(runner.runCombination('mammoth-cyst', 'gestating-heart', 'formal').status).toBe('NOT-RUN');
  const executed = createOfficialMatrixRunner(true, { runCombination: (family, skippedFormId) => ({ family, skippedFormId, status: 'PASS', note: 'synthetic contract only' }) });
  expect(executed.runCombination('shuffling-horror', 'ancestor-second-form', 'formal').status).toBe('PASS');
});
