import type {
  CampaignState,
  ProvisionPool,
  QuestOutcome,
  QuestResultSummary,
} from '../types';
import { getQuestById } from '../data/quests';
import { pushLog } from './log';
import { applyQuestXpToStagecoach } from './stagecoach';

/** 空补给池（结算后清空用）。 */
export const EMPTY_PROVISIONS: ProvisionPool = {
  food: 0,
  bandage: 0,
  potion: 0,
  torch: 0,
  tool: 0,
};

/** 结束任务的原因：主动离开地牢 / 战斗全灭失败。 */
export type QuestEndReason = 'left' | 'defeat';

/** 简化 XP 规则：completed 存活 +2；incomplete 存活 +1；failed 或死亡 0。 */
export function xpForOutcome(outcome: QuestOutcome, isAlive: boolean): number {
  if (!isAlive || outcome === 'failed') return 0;
  return outcome === 'completed' ? 2 : 1;
}

/** 未使用补给转换 Gold（每个 1 Gold）。 */
export function provisionsToGold(p: ProvisionPool): number {
  return p.food + p.bandage + p.potion + p.torch + p.tool;
}

/**
 * 纯函数：根据当前战役状态生成任务结算摘要。不修改 CampaignState。
 * 结果判定：
 * 1. defeat 或英雄全灭 → failed；
 * 2. Objective 完成并正常离开 → completed；
 * 3. 主动离开但未完成 Objective → incomplete。
 */
export function resolveQuestResult(
  campaign: CampaignState,
  reason: QuestEndReason
): QuestResultSummary {
  const quest = getQuestById(campaign.currentQuestId ?? '');
  const allDead = !campaign.heroes.some((h) => h.isAlive);
  const objectiveComplete = campaign.dungeon?.objectiveComplete ?? false;

  let outcome: QuestOutcome;
  if (reason === 'defeat' || allDead) outcome = 'failed';
  else if (objectiveComplete) outcome = 'completed';
  else outcome = 'incomplete';

  return {
    questId: campaign.currentQuestId ?? '',
    questName: quest?.name ?? '未知任务',
    outcome,
    roomsCleared: campaign.dungeon?.roomsCleared ?? 0,
    objectiveComplete,
    goldEarned: Math.max(0, campaign.gold - (campaign.questStartGold ?? campaign.gold)),
    provisionGold: provisionsToGold(campaign.provisions),
    provisionsLeft: { ...campaign.provisions },
    heroes: campaign.heroes.map((h) => ({
      instanceId: h.instanceId,
      name: h.name,
      hp: Math.max(0, h.maxLife - h.wounds),
      maxHp: h.maxLife,
      stress: h.stress,
      xpGained: xpForOutcome(outcome, h.isAlive),
      isAlive: h.isAlive,
    })),
  };
}

/**
 * 应用任务结算（只允许一次；questResultResolved 已为 true 时原样返回）：
 * - 未使用补给按每个 1 Gold 转换并清空；
 * - 英雄获得简化 XP；temporaryDamageBonus 到期清零；
 * - completed 时 completedQuestCount +1；
 * - Light 重置为 5；清除 BattleState；
 * - 写入 lastQuestResult 并切到 quest-result 阶段。
 * DungeonState 保留到确认进入 Hamlet 后再清除（startHamletPhase）。
 */
export function applyQuestRewards(
  campaign: CampaignState,
  summary: QuestResultSummary
): CampaignState {
  if (campaign.questResultResolved) return campaign;

  const heroes = campaign.heroes.map((h) => {
    if (h.dead) return h; // 阵亡英雄不再获得 XP
    const r = summary.heroes.find((x) => x.instanceId === h.instanceId);
    return {
      ...h,
      xp: h.xp + (r?.xpGained ?? 0),
      temporaryDamageBonus: 0,
    };
  });

  let next: CampaignState = {
    ...campaign,
    heroes,
    gold: campaign.gold + summary.provisionGold,
    provisions: { ...EMPTY_PROVISIONS },
    light: 5,
    battle: null,
    completedQuestCount:
      campaign.completedQuestCount + (summary.outcome === 'completed' ? 1 : 0),
    questStatus: summary.outcome === 'failed' ? 'failed' : 'complete',
    questResultResolved: true,
    lastQuestResult: summary,
    gamePhase: 'quest-result',
  };

  const outcomeText =
    summary.outcome === 'completed' ? '任务完成' : summary.outcome === 'incomplete' ? '任务未完成' : '任务失败';
  next = pushLog(
    next,
    `${outcomeText}：清除 ${summary.roomsCleared} 个房间，补给转换 ${summary.provisionGold} Gold，Light 重置为 5。`,
    summary.outcome === 'failed' ? 'danger' : 'success'
  );

  // Phase 6：Stagecoach 累计任务 XP —— 每次任务只累计一次（不按英雄人数乘算），幂等。
  const stagecoachXp = xpForOutcome(summary.outcome, true);
  next = applyQuestXpToStagecoach(next, stagecoachXp);
  return next;
}

/**
 * 结束当前任务：生成摘要并应用结算（幂等；重复调用不会二次发钱）。
 */
export function finishQuest(campaign: CampaignState, reason: QuestEndReason): CampaignState {
  if (campaign.questResultResolved) return campaign;
  const summary = resolveQuestResult(campaign, reason);
  return applyQuestRewards(campaign, summary);
}

/**
 * 战斗全灭导致任务失败：先把战斗单位的 HP/Stress/存活同步回英雄，再结算失败。
 */
export function failQuestFromBattle(campaign: CampaignState): CampaignState {
  const b = campaign.battle;
  let c = campaign;
  if (b) {
    const heroes = campaign.heroes.map((h) => {
      const u = b.heroes.find((x) => x.sourceId === h.instanceId);
      if (!u || h.dead) return h; // 永久死亡由 processBattleDeaths 统一处理
      return {
        ...h,
        wounds: Math.max(0, u.maxHp - u.hp),
        stress: Math.max(0, u.stress),
        isAlive: !h.dead,
        atDeathsDoor: u.atDeathsDoor,
        deathblowRollCount: u.deathblowRollCount,
      };
    });
    c = { ...c, heroes };
  }
  return finishQuest(c, 'defeat');
}
