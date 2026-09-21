import type { RuntimeCapabilityRecord } from '../data/community-reference/production-runtime';

interface QuestSourceForInvariant { id: string; contentSet: string; specialRules: unknown[] }

/** Validates each measured Ready result without asserting a target count. */
export function questReadinessInvariantErrors(
  capabilities: readonly RuntimeCapabilityRecord[],
  sources: readonly QuestSourceForInvariant[],
): string[] {
  const sourceById = new Map(sources.map((source) => [source.id, source]));
  const errors: string[] = [];
  for (const capability of capabilities.filter((entry) => entry.productionStatus === 'PRODUCTION_READY')) {
    const source = sourceById.get(capability.definitionId);
    if (capability.missingPrimitives.length > 0) errors.push(`${capability.definitionId}: ready with missing primitive`);
    if (capability.adapterStatus !== 'IMPLEMENTED') errors.push(`${capability.definitionId}: ready without adapter`);
    if (!Object.values(capability.measuredRuntimeProof).every(Boolean)) errors.push(`${capability.definitionId}: ready without complete proof`);
    if (!capability.sourceSupported) errors.push(`${capability.definitionId}: ready without source support`);
    if (!capability.semanticComplete) errors.push(`${capability.definitionId}: ready without semantic completion`);
    if (!capability.productionReady) errors.push(`${capability.definitionId}: status/ready gate mismatch`);
    if (!source) errors.push(`${capability.definitionId}: ready without source definition`);
  }
  return errors;
}
