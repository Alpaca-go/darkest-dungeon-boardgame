import { expect, it } from 'vitest';
import { createProductionOfficialMatrixRunner } from './production-official-matrix-runner';

it('does not construct formal production evidence while official sources are blocked', () => {
  expect(createProductionOfficialMatrixRunner()).toBeUndefined();
});
