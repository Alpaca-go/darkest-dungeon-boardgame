export interface ProductionUiProofViolation {
  testFile: string;
  pattern: string;
  reason: string;
}

const DEFINITION_HARNESS_PATTERNS: ReadonlyArray<{ pattern: RegExp; reason: string }> = [
  { pattern: /e2e-test-controls/i, reason: 'imports the test-control surface' },
  { pattern: /e2e-complete(?:-quest)?/i, reason: 'completes a quest through a test-only command' },
  { pattern: /e2e-quest-progress/i, reason: 'advances quest progress through a test-only command' },
  { pattern: /\bplayUntilQuestProgress\b/, reason: 'uses a harness helper to synthesize quest progress' },
  { pattern: /\bplayUntil\b/, reason: 'uses a harness helper instead of the production UI' },
  { pattern: /\breplaceCampaign\b/, reason: 'replaces campaign state through a harness helper' },
];

export function definitionE2eHarnessViolations(testFile: string, sourceText: string): ProductionUiProofViolation[] {
  return DEFINITION_HARNESS_PATTERNS.flatMap(({ pattern, reason }) => pattern.test(sourceText)
    ? [{ testFile, pattern: pattern.source, reason }]
    : []);
}
