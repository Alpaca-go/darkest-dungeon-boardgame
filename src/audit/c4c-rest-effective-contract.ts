import official from '../../docs/data/complete-edition/c4b-rest-official-contract.json';
import rulingJson from '../../docs/data/complete-edition/c4c-rest-project-ruling.json';

export const C4C_REST_RULING = rulingJson;
export const C4C_REST_RULING_ID = 'C4C-REST-PROJECT-RULING-v1';
export type RestProjectRuling = typeof rulingJson;
const pinnedFields = {
  budgetConsumption: 'INTEGER_ZERO_THROUGH_PRINTED_MAXIMUM',
  partialSpend: 'ALLOWED_UNUSED_POINTS_EXPIRE',
  zeroPointRest: 'ALLOWED_FIREWOOD_CONSUMED',
  insufficientRecoveryCapacity: 'REST_ALLOWED_UNUSED_POINTS_EXPIRE',
  recoveryCap: 'REJECT_ALLOCATION_ABOVE_REAL_RECOVERY_CAPACITY',
};

export function officialRestSemanticsComplete(): boolean {
  return official.productionRequiredFields.every(name => official.fields.some(f => f.field === name && f.productionUsable));
}

/** Fail closed on absent, disabled, incomplete or incompatible project policy. */
export function effectiveRestSemanticsAuthorized(ruling: RestProjectRuling | null = C4C_REST_RULING): boolean {
  if (officialRestSemanticsComplete()) return true;
  return Boolean(ruling && ruling.rulingId === C4C_REST_RULING_ID
    && ruling.authority === 'PROJECT_RULING' && ruling.canonical === false
    && ruling.productionAuthorized === true
    && ruling.authorizationKind === 'EXPLICIT_USER_PROJECT_AUTHORIZATION'
    && ruling.officialContractOutcome === official.outcome
    && ruling.doesNotSupersedeOfficialEvidence === true
    && ruling.effectiveFromPhase === '11A.7-C4C'
    && ruling.officialBaselinePhase === '11A.7-C4B'
    && Object.entries(pinnedFields).every(([key, value]) =>
      ruling.fields[key as keyof RestProjectRuling['fields']] === value)
    && ruling.behavior.budgetIsMaximum === true && ruling.behavior.unusedPointsExpire === true
    && ruling.behavior.carryOver === false && ruling.behavior.unusedReward === false
    && official.fields.filter(f => !f.productionUsable).every(f => f.field in ruling.fields));
}

export function effectiveRestContract() {
  return {
    schemaVersion: 'C4C-REST-EFFECTIVE-CONTRACT-v1', phase: '11A.7-C4C',
    officialContract: 'docs/data/complete-edition/c4b-rest-official-contract.json',
    officialOutcome: official.outcome, canonicalClosure: false,
    rulingId: C4C_REST_RULING_ID, productionAuthorized: effectiveRestSemanticsAuthorized(),
    fields: official.fields.map(f => ({
      field: f.field, officialStatus: f.currentOfficialStatus,
      projectRulingStatus: f.productionUsable ? 'NOT_REQUIRED' : 'PROJECT_RULING_EXPLICIT',
      effectiveProductionBehavior: f.productionUsable ? f.rule : C4C_REST_RULING.fields[f.field as keyof RestProjectRuling['fields']],
      effectiveAuthority: f.productionUsable ? 'OFFICIAL' : 'PROJECT_RULING',
      rulingId: f.productionUsable ? null : C4C_REST_RULING_ID,
    })),
  };
}
