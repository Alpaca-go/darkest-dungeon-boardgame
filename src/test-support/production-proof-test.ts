import { it } from 'vitest';
import type { RegisteredProductionProof } from '../audit/production-proof-registry';

/** Registers an executable Vitest proof using the registry proofId as the stable test name. */
export function productionProofTest(
  registration: RegisteredProductionProof,
  body: () => void | Promise<void>,
): void {
  if (registration.runner !== 'vitest') throw new Error(`${registration.proofId} is not a Vitest proof`);
  if (registration.status !== 'active') throw new Error(`${registration.proofId} is not active`);
  it(registration.proofId, body);
}
