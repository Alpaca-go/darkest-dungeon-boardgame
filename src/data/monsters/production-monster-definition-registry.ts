/** Pure deterministic resolution; no engine imports and no execution. */
import { PRODUCTION_MONSTER_DEFINITIONS, PRODUCTION_MONSTER_IDENTITIES } from './production-monster-definitions';

const definitions = new Map(PRODUCTION_MONSTER_DEFINITIONS.map(d => [d.definitionId, d]));
const identities = new Map(PRODUCTION_MONSTER_IDENTITIES.map(i => [i.identityId, i]));
export const listProductionMonsterIdentities = () => PRODUCTION_MONSTER_IDENTITIES;
export const listProductionMonsterDefinitions = () => PRODUCTION_MONSTER_DEFINITIONS;
export const getProductionMonsterIdentity = (identityId: string) => identities.get(identityId);
export const getProductionMonsterDefinition = (definitionId: string) => definitions.get(definitionId);
export function getProductionMonsterForms(identityId: string) {
  return (identities.get(identityId)?.definitionIds ?? []).map(id => definitions.get(id)!);
}
/** Exact printed level only: unknown level/identity returns undefined, never guessed eligibility. */
export function resolveProductionMonsterForm(identityId: string, level: number | null) {
  return getProductionMonsterForms(identityId).find(d => d.level === level);
}
export function getProductionMonsterAction(definitionId: string, actionId: string) {
  return definitions.get(definitionId)?.actions.find(a => a.actionId === actionId);
}
