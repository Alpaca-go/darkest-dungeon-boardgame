// Phase 11A.2 §12 — Campaign Setup Production Commands。
//
// 从 Store / headless-shim 迁出：
//   - proceedCampaignToLoadout
//   - proceedCampaignToQuestSelect
//
// Store 不再自己改 gamePhase；UI 调用本模块、Simulation Driver 也调用本模块。
import type { CampaignState } from '../../types';
import { canProceedToLoadout, isLoadoutComplete } from '../campaign';

/**
 * 队伍已选完 4 名英雄 → 推进到 skill-loadout 阶段。
 * 内部继续使用 canProceedToLoadout 守卫；不通过则原状态返回。
 */
export function proceedCampaignToLoadout(campaign: CampaignState): CampaignState {
  if (campaign.gamePhase !== 'campaign-setup') return campaign;
  if (!canProceedToLoadout(campaign)) return campaign;
  return { ...campaign, gamePhase: 'skill-loadout' };
}

/**
 * 技能配置完成（4 人 × 等级对应槽数已满）→ 推进到 quest-select 阶段。
 * 内部继续使用 isLoadoutComplete 守卫；不通过则原状态返回。
 */
export function proceedCampaignToQuestSelect(campaign: CampaignState): CampaignState {
  if (campaign.gamePhase !== 'skill-loadout') return campaign;
  if (!isLoadoutComplete(campaign)) return campaign;
  return { ...campaign, gamePhase: 'quest-select' };
}
