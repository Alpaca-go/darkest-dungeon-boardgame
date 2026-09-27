import { describe, expect, it } from 'vitest';
import { requireProductionRuntimeDiff, requireVerificationReceipt, C1C17_VERIFICATION_COMMANDS } from '../../scripts/audit/c1c17-implementation-gate';
describe('C1C17 implementation false-green gate', () => {
  for (const paths of [[], ['docs/reports/complete-edition/c1c17-report.md'], ['scripts/audit/c1c17.ts', 'src/audit/c1c17.ts'],
    ['src/game-engine/guide.test.ts', 'e2e/guide.spec.ts'], ['src/data/guide.test.ts', 'src/types/guide.spec.ts'],
    ['src/game-engine/__tests__/guide.ts', 'src/game-engine/test-support/fixture.ts'],
    ['src/data/guide.json'], ['src/game-engine/guide.spec.tsx'],
    ['docs/report.md', 'scripts/audit/verify.ts', 'src/audit/coverage.ts', 'src/game-engine/guide.test.ts', 'e2e/guide.spec.ts']]) {
    it('rejects ' + JSON.stringify(paths), () => expect(() => requireProductionRuntimeDiff(paths)).toThrow('no non-test production runtime'));
  }
  for (const path of ['src/game-engine/exploration.ts', 'src/data/community-reference/production-runtime.ts', 'src/types/trinkets.ts', 'src/store/useGameStore.ts']) {
    it('accepts actual runtime file ' + path, () => expect(requireProductionRuntimeDiff(['docs/report.md', path])).toEqual([path]));
  }
  it('rejects unverified or stale receipts before generating evidence', () => {
    const receipt = { status: 'IMPLEMENTATION_VERIFIED' as const, anchor: 'anchor', tree: 'tree',
      productionRuntimeChanges: ['src/game-engine/exploration.ts'], commands: C1C17_VERIFICATION_COMMANDS,
      outputHashes: Object.fromEntries(C1C17_VERIFICATION_COMMANDS.map((command) => [command, 'a'.repeat(64)])) };
    expect(() => requireVerificationReceipt(receipt, 'anchor', 'tree')).not.toThrow();
    expect(() => requireVerificationReceipt(receipt, 'wrong', 'tree')).toThrow();
    expect(() => requireVerificationReceipt(receipt, 'anchor', 'wrong')).toThrow();
    expect(() => requireVerificationReceipt({ ...receipt, commands: [] }, 'anchor', 'tree')).toThrow();
    expect(() => requireVerificationReceipt({ ...receipt, outputHashes: {} }, 'anchor', 'tree')).toThrow();
    expect(() => requireVerificationReceipt({ ...receipt, productionRuntimeChanges: ['docs/report.md'] }, 'anchor', 'tree')).toThrow();
  });
});
