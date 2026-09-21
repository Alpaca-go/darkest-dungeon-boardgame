import type { RuntimeCapabilityRecord } from '../data/community-reference/production-runtime';

interface QuestSourceForInvariant {
  id: string;
  contentSet: string;
  specialRules: unknown[];
}

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
    if (source?.specialRules.length) errors.push(`${capability.definitionId}: special-rule Quest ready`);
    if (source?.contentSet === 'crimson-court' && source.specialRules.length === 0) {
      errors.push(`${capability.definitionId}: deferred Crimson Court Quest ready`);
    }
  }
  return errors;
}
