import type { CampaignState, ProvisionPool } from '../types';
import { createId, nowIso } from './random';

/** Phase 1 初始补给池默认值（后续阶段可由 Provision Dice 生成替换）。 */
export const DEFAULT_PROVISIONS: ProvisionPool = {
  food: 4,
  bandage: 2,
  potion: 2,
  torch: 4,
  tool: 2,
};

/**
 * 创建一局新战役的初始状态。
 * 规则：进入 CAMPAIGN_SETUP，等待玩家选择 4 名英雄。
 * 仅设置 Phase 1 需要的字段，其余预留字段给后续阶段。
 */
export function createNewCampaign(): CampaignState {
  const now = nowIso();
  return {
    saveVersion: 1,
    id: createId('cmp'),
    createdAt: now,
    updatedAt: now,
    gamePhase: 'campaign-setup',
    act: 1,
    campaignLevel: 1,
    completedQuestCount: 0,
    currentThreatId: null,
    currentQuestId: null,
    gold: 50,
    light: 5,
    heroes: [],
    waitingHeroIds: [],
    provisions: { ...DEFAULT_PROVISIONS },
    dungeon: null,
    battle: null,
    hamlet: {
      preparationDays: 0,
      currentDay: 1,
      caretakerBlockedBuildingId: null,
      occupiedBuildingIds: [],
      currentEventId: null,
    },
    log: [
      {
        id: createId('log'),
        at: now,
        message: '新的战役已建立。选择你的四名英雄。',
        kind: 'info',
      },
    ],
  };
}
