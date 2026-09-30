import type { CampaignState } from '../../types';
import { RUINS_V5, RUINS_V6, RUINS_V6_RULING } from '../../types/ruins-executable';

export interface RuinsV6Selection {
  schemaVersion: 1; ruleSetVersion: typeof RUINS_V6; previousVersion: typeof RUINS_V5;
  migrationId: string; rulingId: typeof RUINS_V6_RULING; canonical: false;
}

export function explicitlySelectRuinsV6(campaign: CampaignState, migrationId: string): CampaignState {
  if (!migrationId.trim()) throw new Error('Explicit v6 migration identity required');
  if (campaign.ruinsRuleSetSelection?.ruleSetVersion === RUINS_V6) {
    validateRuinsV6Selection(campaign);
    if (campaign.ruinsRuleSetSelection.migrationId !== migrationId) throw new Error('v6 migration identity conflicts');
    return campaign;
  }
  if (campaign.ruinsRuleSetSelection?.ruleSetVersion !== RUINS_V5 || campaign.battle || campaign.ruinsDrawState
    || campaign.bossEncounterCheckpoint || campaign.activeThreatRuntime
    || campaign.necromancerPreparationDay && campaign.necromancerPreparationDay.status !== 'COMMITTED'
    || !['hamlet', 'quest-select'].includes(campaign.gamePhase)) throw new Error('v6 selection requires pre-encounter boundary');
  return { ...campaign, ruinsRuleSetSelection: { schemaVersion: 1, ruleSetVersion: RUINS_V6,
    previousVersion: RUINS_V5, migrationId, rulingId: RUINS_V6_RULING, canonical: false } };
}

export function validateRuinsV6Selection(campaign: Partial<CampaignState>): void {
  const s = campaign.ruinsRuleSetSelection;
  if (s?.ruleSetVersion !== RUINS_V6 || s.schemaVersion !== 1 || s.previousVersion !== RUINS_V5
    || !s.migrationId?.trim() || s.rulingId !== RUINS_V6_RULING || s.canonical !== false
    || campaign.ruinsDrawState && campaign.ruinsDrawState.ruleSetVersion !== RUINS_V6)
    throw new Error('Invalid v6 Project Ruling provenance');
}
