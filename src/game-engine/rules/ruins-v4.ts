import type { CampaignState } from '../../types';
import { RUINS_V4 } from '../../types/ruins-executable';

export interface RuinsVersionSelection {
  schemaVersion: 1;
  ruleSetVersion: typeof RUINS_V4;
  migrationId: string;
  previousVersion: string;
}

/** Select a successor for future encounters. Historical resolvers remain frozen. */
export function explicitlySelectRuinsV4(campaign: CampaignState, migrationId: string): CampaignState {
  if (!migrationId.trim()) throw new Error('Explicit migration identity required');
  if (campaign.battle || campaign.bossEncounterCheckpoint || campaign.ruinsDrawState?.encounters.some(e => !e.returned) || campaign.necromancerPreparationDay?.status !== undefined
    && campaign.necromancerPreparationDay.status !== 'COMMITTED') throw new Error('Active encounter cannot migrate');
  if (campaign.ruinsRuleSetSelection) {
    validateRuinsVersionSelection(campaign);
    if (campaign.ruinsRuleSetSelection.migrationId !== migrationId) throw new Error('Migration identity conflicts');
    return campaign;
  }
  return { ...campaign, ruinsRuleSetSelection: { schemaVersion: 1, ruleSetVersion: RUINS_V4,
    migrationId, previousVersion: campaign.heroDodgeRuleSetSelection?.ruleSetVersion ?? 'C1C28-DIGITAL-DEFAULT-v1' } };
}

export function validateRuinsVersionSelection(campaign: Partial<CampaignState>): void {
  const selection = campaign.ruinsRuleSetSelection;
  if (selection === undefined) return;
  if (selection?.schemaVersion !== 1 || selection.ruleSetVersion !== RUINS_V4 || !selection.migrationId?.trim()
    || !['C1C28-DIGITAL-DEFAULT-v1', 'C1C31-DIGITAL-DEFAULT-v2', 'C1C32R2-DIGITAL-DEFAULT-v3'].includes(selection.previousVersion)) {
    throw new Error('Invalid Ruins successor selection');
  }
}
