import type { CampaignState } from '../../types';
import { RUINS_V4, RUINS_V5, RUINS_V5_REPLACEMENT_RULING } from '../../types/ruins-executable';

export const LARGE_REPLACEMENT_RETURN_RULING = RUINS_V5_REPLACEMENT_RULING;

export interface RuinsV5Selection {
  schemaVersion: 1;
  ruleSetVersion: typeof RUINS_V5;
  previousVersion: typeof RUINS_V4;
  migrationId: string;
  rulingId: typeof LARGE_REPLACEMENT_RETURN_RULING;
  canonical: false;
}

/** Explicit successor selection at a safe boundary; existing draws and replays remain v4. */
export function explicitlySelectRuinsV5(campaign: CampaignState, migrationId: string): CampaignState {
  if (!migrationId.trim()) throw new Error('Explicit v5 migration identity required');
  const current = campaign.ruinsRuleSetSelection;
  if (current?.ruleSetVersion === RUINS_V5) {
    validateRuinsV5Selection(campaign);
    if (current.migrationId !== migrationId) throw new Error('v5 migration identity conflicts');
    return campaign;
  }
  if (current?.ruleSetVersion !== RUINS_V4 || campaign.battle || campaign.ruinsDrawState
    || campaign.bossEncounterCheckpoint || campaign.activeThreatRuntime
    || campaign.necromancerPreparationDay && campaign.necromancerPreparationDay.status !== 'COMMITTED'
    || !['hamlet', 'quest-select'].includes(campaign.gamePhase)) {
    throw new Error('v5 migration is allowed only before ordinary encounter initialization');
  }
  return { ...campaign, ruinsRuleSetSelection: {
    schemaVersion: 1, ruleSetVersion: RUINS_V5, previousVersion: RUINS_V4,
    migrationId, rulingId: LARGE_REPLACEMENT_RETURN_RULING, canonical: false,
  } };
}

export function validateRuinsV5Selection(campaign: Partial<CampaignState>): void {
  const selection = campaign.ruinsRuleSetSelection;
  if (selection?.ruleSetVersion !== RUINS_V5) throw new Error('v5 selection missing');
  if (selection.schemaVersion !== 1 || selection.previousVersion !== RUINS_V4 || !selection.migrationId?.trim()
    || selection.rulingId !== LARGE_REPLACEMENT_RETURN_RULING || selection.canonical !== false) {
    throw new Error('Invalid v5 Project Ruling provenance');
  }
  if (campaign.ruinsDrawState && campaign.ruinsDrawState.ruleSetVersion !== RUINS_V5) {
    throw new Error('v5 selection cannot own v4 draw state');
  }
}
