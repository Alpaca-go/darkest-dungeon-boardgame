import type {
  CampaignState,
  ProvisionPool,
  QuestOutcome,
  QuestResultSummary,
} from '../types';
import { getQuestById } from '../data/quests';
import { pushLog } from './log';
import { convertResolveStatesAtQuestEnd } from './resolve-conversion';
import { createRuleEventContext, emitPartyRuleEvent } from './quirks';
import {
  createQuestXpResult,
  evaluateQuestObjectives,
  refreshObjectiveProgress,
} from './progression/quest-objectives';
import { consumeTemporarySkillForms } from './progression/skill-forms';
import { drawTrinket } from './trinkets/draw-trinket';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { hasTrinketCapacity } from './trinkets/capacity';

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

/**
 * @deprecated Phase 8D 起 Quest XP 由 Objective 完成数决定（见 progression/quest-objectives）。
 * 保留仅用于旧存档兼容与回归对照，业务代码不得再调用。
 */
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

  // Phase 8D：XP 完全由 Objective 完成数决定（0-3），与 outcome 解耦。
  // 阵亡英雄不获得 XP；存活英雄全部获得相同数量（不按人数拆分）。
  const objectives = evaluateQuestObjectives(campaign);
  const xpPerHero = Math.min(3, objectives.filter((o) => o.completed).length);

  return {
    questId: campaign.currentQuestId ?? '',
    questName: quest?.name ?? '未知任务',
    outcome,
    roomsCleared: campaign.dungeon?.roomsCleared ?? 0,
    objectiveComplete,
    goldEarned: Math.max(0, campaign.gold - (campaign.questStartGold ?? campaign.gold)),
    provisionGold: provisionsToGold(campaign.provisions),
    provisionsLeft: { ...campaign.provisions },
    objectives,
    xpPerHero,
    completedObjectiveCount: objectives.filter((o) => o.completed).length,
    heroes: campaign.heroes.map((h) => ({
      instanceId: h.instanceId,
      name: h.name,
      hp: Math.max(0, h.maxLife - h.wounds),
      maxHp: h.maxLife,
      stress: h.stress,
      // Phase 8D：这里只是「预告」，真实发放推迟到回到 Hamlet（规则 2）
      xpGained: h.isAlive && !h.dead ? xpPerHero : 0,
      isAlive: h.isAlive,
    })),
  };
}

/**
 * 应用任务结算（只允许一次；questResultResolved 已为 true 时原样返回）：
 * - 未使用补给按每个 1 Gold 转换并清空；
 * - temporaryDamageBonus 到期清零；
 * - Phase 8D：只「生成」Quest XP 结算单（pendingQuestXp），不发放 XP —— 真实发放
 *   推迟到回到 Hamlet（规则 2），Stagecoach XP 同样推迟；
 * - Phase 8D：Blacksmith 临时 Skill Form 在任务结束时标记为已消耗（规则 15）；
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

  // temporaryDamageBonus 是单次任务内的临时加成，任务结束即清零。
  const heroes = campaign.heroes.map((h) =>
    h.temporaryDamageBonus === 0 ? h : { ...h, temporaryDamageBonus: 0 },
  );

  // Phase 8D：先刷新 Objective 进度，再据此生成待发放的 XP 结算单。
  const refreshed = refreshObjectiveProgress({ ...campaign, heroes });
  const questXp = createQuestXpResult(refreshed);

  let next: CampaignState = {
    ...refreshed,
    gold: campaign.gold + summary.provisionGold,
    provisions: { ...EMPTY_PROVISIONS },
    light: 5,
    battle: null,
    completedQuestCount:
      campaign.completedQuestCount + (summary.outcome === 'completed' ? 1 : 0),
    questStatus: summary.outcome === 'failed' ? 'failed' : 'complete',
    questResultResolved: true,
    lastQuestResult: { ...summary, objectives: refreshed.objectiveProgress },
    pendingQuestXp: questXp,
    gamePhase: 'quest-result',
  };

  // Phase 8D：临时 Skill Form 随任务结束失效（永久等级不受影响）。
  next = consumeTemporarySkillForms(next);

  const outcomeText =
    summary.outcome === 'completed' ? '任务完成' : summary.outcome === 'incomplete' ? '任务未完成' : '任务失败';
  next = pushLog(
    next,
    `${outcomeText}：清除 ${summary.roomsCleared} 个房间，补给转换 ${summary.provisionGold} Gold，Light 重置为 5。`,
    summary.outcome === 'failed' ? 'danger' : 'success'
  );

  next = pushLog(
    next,
    `Quest XP 结算：完成 ${questXp.completedObjectiveCount} 个 Objective → 每名存活英雄 ${questXp.xpPerHero} XP（回到 Hamlet 时发放）。`,
    questXp.xpPerHero > 0 ? 'success' : 'info',
  );

  // Phase 8A：quest-completed 时机事件（Hoarder 等，仅任务成功时触发）。
  if (summary.outcome === 'completed') {
    next = emitPartyRuleEvent(next, 'quest-completed', createRuleEventContext());

    // Phase 8C §15.2：任务完成奖励 1 件 Trinket（简化 Quest Reward）。
    // - reward 只结算一次：外层 questResultResolved 闸门 + sourceEventId 幂等双保险；
    // - 幂等键用「任务 id + 本次为第 N 次完成」，同一任务日后重打不会被误判为重复；
    // - 官方池抽 Level I；池为空则安全跳过（不白屏、不发假卡）。
    const rewardEventId = `quest-reward:${summary.questId}:q${campaign.completedQuestCount}`;
    const draw = drawTrinket({ level: 1, pool: 'official' });
    if (draw.definition) {
      // 归属英雄：有空位的第一名存活英雄；若全满则留待分配（玩家在入村前结算）。
      const rewardHero = next.heroes.find(
        (h) => h.isAlive && !h.dead && hasTrinketCapacity(h)
      );
      next = pushLog(next, '任务奖励：获得一件饰品。', 'success');
      next = acquireTrinket(next, {
        trinketId: draw.definition.id,
        source: 'quest-reward',
        sourceEventId: rewardEventId,
        questId: summary.questId,
        heroId: rewardHero?.instanceId,
      }).campaign;
    }
  }

  // Phase 7/8A：Quest 结束把 Virtue/Affliction 转换为真实 Quirk（幂等，走 acquireQuirk）。
  next = convertResolveStatesAtQuestEnd(next);
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
