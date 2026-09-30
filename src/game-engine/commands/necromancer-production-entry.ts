import type { CampaignState } from '../../types';
import { RUINS_V4, RUINS_V5, RUINS_V6 } from '../../types/ruins-executable';
import { HERO_DODGE_V2 } from '../rules/hero-dodge';
import { explicitlySelectRuinsV4, validateRuinsVersionSelection } from '../rules/ruins-v4';
import { explicitlySelectRuinsV5, validateRuinsV5Selection } from '../rules/ruins-v5';
import { explicitlySelectRuinsV6, validateRuinsV6Selection } from '../rules/ruins-v6';
import { necromancerQuestEntryError } from '../bosses/production-dependency-gate';
import { commitQuestSelection, type QuestSelectionResult } from './quest';

/** One explicit player action, composed exclusively from the frozen migration commands.
 * No intermediate selection is committed if a later migration rejects the boundary.
 */
export function selectProductionRuinsV6(campaign: CampaignState): CampaignState {
  if (campaign.runtimeContentProfile !== 'community-complete-edition')
    throw new Error('Complete Edition profile required');
  const current = campaign.ruinsRuleSetSelection;
  if (current?.ruleSetVersion === RUINS_V6)
    return explicitlySelectRuinsV6(campaign, current.migrationId);
  // Check the strictest boundary before composing the earlier version commands.
  if (!['hamlet', 'quest-select'].includes(campaign.gamePhase) || campaign.battle
    || campaign.ruinsDrawState || campaign.bossEncounterCheckpoint || campaign.activeThreatRuntime
    || campaign.necromancerPreparationDay && campaign.necromancerPreparationDay.status !== 'COMMITTED')
    throw new Error('Select Ruins v6 in Hamlet or Quest Select before Threat/encounter initialization');
  let next = campaign;
  if (current?.ruleSetVersion === RUINS_V4) validateRuinsVersionSelection(campaign);
  else if (current?.ruleSetVersion === RUINS_V5) validateRuinsV5Selection(campaign);
  if (!current) next = explicitlySelectRuinsV4(next, `${campaign.id}:production-ruins-v4`);
  if (next.ruinsRuleSetSelection?.ruleSetVersion === RUINS_V4)
    next = explicitlySelectRuinsV5(next, `${campaign.id}:production-ruins-v5`);
  if (next.ruinsRuleSetSelection?.ruleSetVersion !== RUINS_V5)
    throw new Error('Unsupported Ruins selection; explicit historical migration required');
  return explicitlySelectRuinsV6(next, `${campaign.id}:production-ruins-v6`);
}

/** Product prerequisites are separate from historical command/replay semantics. */
export function necromancerProductionEntryError(campaign: CampaignState): string | null {
  if (campaign.runtimeContentProfile !== 'community-complete-edition') return 'complete-edition-profile-required';
  if (!campaign.enabledContentSets?.includes('core')) return 'core-content-required';
  if (!campaign.enabledRegions?.includes('ruins')) return 'ruins-region-required';
  if (campaign.campaignProgress.activeBossFamilyId !== 'necromancer') return 'necromancer-active-family-required';
  if (campaign.heroDodgeRuleSetSelection?.ruleSetVersion !== HERO_DODGE_V2) return 'hero-dodge-v2-selection-required';
  try { validateRuinsV6Selection(campaign); }
  catch { return 'ruins-v6-selection-required'; }
  return necromancerQuestEntryError(campaign, 'face-the-threat');
}

export function commitNecromancerProductionQuestSelection(campaign: CampaignState): QuestSelectionResult {
  const error = necromancerProductionEntryError(campaign);
  if (error) return { ok: false, campaign, error };
  return commitQuestSelection(campaign, 'face-the-threat');
}

export function necromancerProductionEntryMessage(error: string): string {
  const messages: Record<string, string> = {
    'complete-edition-profile-required': '请选择 Complete Edition 战役。',
    'core-content-required': '请启用 Core 内容集。',
    'ruins-region-required': '请启用 Ruins 区域。',
    'necromancer-active-family-required': '当前活动 Boss 家族必须为 Necromancer。',
    'hero-dodge-v2-selection-required': '请先显式启用 Hero Dodge v2。',
    'ruins-v6-selection-required': '请在 Threat 或遭遇初始化前的任务选择/Hamlet 阶段显式启用 Ruins v6；已有遭遇不能迁移。',
    'necromancer-production-dependencies-unbound': 'Necromancer 生产依赖或 Threat checkpoint 校验未通过。',
  };
  return messages[error] ?? error;
}
