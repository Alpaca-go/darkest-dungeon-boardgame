import type { RuntimeCapabilityRecord } from '../data/community-reference/production-runtime';

/** A single reusable truth gate for every Trinket promoted to Production Ready. */
export function trinketReadinessInvariantErrors(capabilities: readonly RuntimeCapabilityRecord[]): string[] {
  const errors: string[] = [];
  for (const capability of capabilities.filter((entry) => entry.productionReady)) {
    const required = [
      ['sourceSupported', capability.sourceSupported],
      ['sourceSemanticComplete', capability.sourceSemanticComplete],
      ['runtimeSemanticComplete', capability.runtimeSemanticComplete],
      ['positiveSideComplete', capability.trinketSemanticObligations?.some((entry) => entry.side === 'positive' && entry.implementationStatus === 'IMPLEMENTED') === true],
      ['negativeSideComplete', capability.trinketSemanticObligations?.some((entry) => entry.side === 'negative' && entry.implementationStatus === 'IMPLEMENTED') === true],
      ['adapterComplete', capability.adapterComplete],
      ['productionProofComplete', capability.productionProofComplete],
      ['saveReplayProofComplete', capability.saveReplayProofComplete],
      ['selectorReachable', capability.selectorReachable],
      ['e2eProofComplete', capability.e2eProofComplete],
      ['productionUiProofComplete', capability.productionUiProofComplete],
    ] as const;
    for (const [name, value] of required) if (!value) errors.push(`${capability.definitionId}: ready without ${name}`);
  }
  return errors;
}
