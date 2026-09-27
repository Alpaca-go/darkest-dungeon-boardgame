/** Reject report/audit/test-only implementations before consulting completion evidence. */
export function requireProductionRuntimeDiff(paths: readonly string[]): string[] {
  const runtime = paths.filter((path) => /^src\/(?:game-engine|data|types|store)\/.*\.(?:ts|tsx)$/.test(path)
    && !/(?:^|\/)(?:__tests__|test-support|testing)(?:\/|$)/.test(path)
    && !/\.(?:test|spec)\.[^.]+$/.test(path));
  if (runtime.length === 0) throw new Error('C1C17 implementation has no non-test production runtime source changes');
  return runtime;
}
export const C1C17_VERIFICATION_COMMANDS = [
  ...['c1c17', 'c1c16', 'c1c15', 'c1c13', 'c1c12', 'c1c11', 'c1c10', 'c1c9', 'c1c8', 'c1c7', 'c1c6', 'c1c5'].map((phase) => 'test:e2e:community-content-' + phase),
  'test', 'typecheck', 'build',
];
export interface C1C17VerificationReceipt {
  status: 'IMPLEMENTATION_VERIFIED'; anchor: string; tree: string; productionRuntimeChanges: string[];
  commands: string[]; outputHashes: Record<string, string>;
}
export function requireVerificationReceipt(value: C1C17VerificationReceipt, anchor: string, tree: string): void {
  if (value.status !== 'IMPLEMENTATION_VERIFIED' || value.anchor !== anchor || value.tree !== tree
    || JSON.stringify(value.commands) !== JSON.stringify(C1C17_VERIFICATION_COMMANDS)
    || value.commands.some((command) => !/^[a-f0-9]{64}$/.test(value.outputHashes?.[command] ?? ''))) {
    throw new Error('C1C17 evidence requires completed verification for this exact implementation anchor/tree');
  }
  requireProductionRuntimeDiff(value.productionRuntimeChanges);
}
