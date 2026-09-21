import contractJson from '../../docs/data/complete-edition/rest-semantic-contract.json' with { type: 'json' };

export type RestSemanticStatus = 'SOURCE_EXPLICIT' | 'SOURCE_DERIVED' | 'SOURCE_UNRESOLVED' | 'MODEL_INVARIANT';

export interface RestSemanticContract {
  productionRequiredFields: string[];
  acceptedDerivedFields: string[];
  [field: string]: unknown;
}

export const REST_SEMANTIC_CONTRACT = contractJson as RestSemanticContract;

function statusFor(contract: RestSemanticContract, field: string): RestSemanticStatus | null {
  const value = contract[field];
  if (!value || typeof value !== 'object' || !('status' in value)) return null;
  const status = (value as { status?: unknown }).status;
  return typeof status === 'string' ? status as RestSemanticStatus : null;
}

/** Derives unresolved production semantics instead of trusting a hand-maintained JSON summary. */
export function deriveUnresolvedRestSemantics(contract: RestSemanticContract = REST_SEMANTIC_CONTRACT): string[] {
  const acceptedDerived = new Set(contract.acceptedDerivedFields ?? []);
  return (contract.productionRequiredFields ?? []).filter((field) => {
    const status = statusFor(contract, field);
    return status === null
      || status === 'SOURCE_UNRESOLVED'
      || (status === 'SOURCE_DERIVED' && !acceptedDerived.has(field));
  });
}

export function semanticContractAcceptanceErrors(contract: RestSemanticContract = REST_SEMANTIC_CONTRACT): string[] {
  return deriveUnresolvedRestSemantics(contract).map((field) => {
    const status = statusFor(contract, field);
    return status === null
      ? `${field}: missing semantic status`
      : `${field}: ${status} is not accepted for Production`;
  });
}

export function restAllocationSemanticsImplemented(contract: RestSemanticContract = REST_SEMANTIC_CONTRACT): boolean {
  return semanticContractAcceptanceErrors(contract).length === 0;
}
