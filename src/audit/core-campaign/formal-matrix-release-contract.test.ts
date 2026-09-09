import { describe, expect, it } from 'vitest';
import { isFormalMatrixPass, runGuardianMatrixAttempt } from './run-audit';
import type { OfficialMatrixRunner } from './official-matrix-runner';

const passRunner: OfficialMatrixRunner = { runCombination: (family, skippedFormId) => ({ family, skippedFormId, status: 'PASS', note: 'formal fixture' }) };

describe('formal matrix lifecycle', () => {
  it('is source-blocked when source is absent', () => {
    expect(runGuardianMatrixAttempt({ sourceReady: false }).status).toBe('SOURCE-BLOCKED');
  });

  it('is not-run when source is ready but official import is pending', () => {
    expect(runGuardianMatrixAttempt({ sourceReady: true, officialImportReady: false }).status).toBe('NOT-RUN');
  });

  it('runs all nine formal combinations after import and requires every pass', () => {
    const result = runGuardianMatrixAttempt({ sourceReady: true, officialImportReady: true, runner: passRunner });
    expect(result.status).toBe('FAIL');
    expect(result.details).toHaveLength(9);
    expect(result.details.every((detail) => detail.passed)).toBe(true);
  });

  it('reports FAIL when any formal combination fails', () => {
    const result = runGuardianMatrixAttempt({ sourceReady: true, officialImportReady: true, runner: { runCombination: (family, skippedFormId) => ({ family, skippedFormId, status: family === 'templars' ? 'FAIL' : 'PASS', note: 'fixture' }) } });
    expect(result.status).toBe('FAIL');
  });
});

it('synthetic runners cannot promote themselves to formal production evidence', () => {
  const matrix = runGuardianMatrixAttempt({ sourceReady: true, officialImportReady: true, runner: passRunner });
  expect(matrix.evidenceKind).toBe('SYNTHETIC-CONTRACT');
  expect(isFormalMatrixPass(matrix, matrix)).toBe(false);
});
