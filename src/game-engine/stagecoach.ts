import type { CampaignState, HeroDefinition, StagecoachState } from '../types';
import { HEROES } from '../data/heroes';
import { getSkillsByHero } from '../data/skills';
import { hasCompleteLevelProfiles } from '../data/hero-level-profiles';
import { pushLog } from './log';

/** 新战役的 Stagecoach 初始状态：2 个 Waiting Token、0 XP。 */
export function createInitialStagecoach(): StagecoachState {
  return {
    level: 1,
    waitingTokens: 2,
    accumulatedXp: 0,
    deadHeroClassIds: [],
    recruitedHeroClassIds: [],
    pendingReplacement: null,
  };
}

/**
 * 任务结算时累计 Stagecoach XP（只加一次，不按英雄人数乘 4）。
 * 幂等：stagecoachXpApplied 已为 true 时原样返回；选择新任务时重置该标记。
 */
export function applyQuestXpToStagecoach(campaign: CampaignState, xp: number): CampaignState {
  if (campaign.stagecoachXpApplied || xp <= 0) return campaign;
  let next: CampaignState = {
    ...campaign,
    stagecoach: {
      ...campaign.stagecoach,
      accumulatedXp: campaign.stagecoach.accumulatedXp + xp,
    },
    stagecoachXpApplied: true,
  };
  next = pushLog(next, `Stagecoach 累计 ${xp} XP（当前共 ${next.stagecoach.accumulatedXp} XP）。`, 'info');
  return next;
}

/** 候选英雄与不可选原因。 */
export interface ReplacementCandidate {
  hero: HeroDefinition;
  selectable: boolean;
  reason: string | null;
}

/**
 * 替补候选过滤（14.4）：
 * - 不在当前 active party（未死亡的在队英雄）；
 * - 未在本战役死亡；
 * - 未被本次其他 ReplacementSlot 选择；
 * - hero data 完整（默认技能 >= 3 且有三等级 Profile）。
 */
export function getReplacementCandidates(campaign: CampaignState): ReplacementCandidate[] {
  const activeClassIds = campaign.heroes.filter((h) => !h.dead).map((h) => h.heroId);
  const deadClassIds = campaign.stagecoach.deadHeroClassIds;
  const pending = campaign.stagecoach.pendingReplacement;
  const pickedByOtherSlots = (pending?.slots ?? [])
    .map((s) => s.selectedHeroClassId)
    .filter((id): id is string => !!id);

  return HEROES.map((hero) => {
    let reason: string | null = null;
    if (activeClassIds.includes(hero.id)) reason = '已在当前队伍中';
    else if (deadClassIds.includes(hero.id)) reason = '该英雄已在本战役阵亡';
    else if (pickedByOtherSlots.includes(hero.id)) reason = '已被其他替补槽位选择';
    else if (getSkillsByHero(hero.id).length < 3) reason = '英雄数据不完整（技能不足）';
    else if (!hasCompleteLevelProfiles(hero.id)) reason = '英雄数据不完整（缺少等级数据）';
    return { hero, selectable: reason === null, reason };
  });
}

/** 未确认的替补槽位数量。 */
export function unconfirmedSlotCount(campaign: CampaignState): number {
  const pending = campaign.stagecoach.pendingReplacement;
  if (!pending || pending.resolved) return 0;
  return pending.slots.filter((s) => !s.confirmed).length;
}

/**
 * 判断当前 pending replacement 能否全部补齐：
 * - waitingTokens >= 未确认槽位数；
 * - 可选候选数量 >= 未确认槽位数。
 * 返回 null 表示可以补齐，否则为失败原因。
 */
export function replacementBlockReason(campaign: CampaignState): string | null {
  const need = unconfirmedSlotCount(campaign);
  if (need === 0) return null;
  if (campaign.stagecoach.waitingTokens < need) {
    return `Waiting Hero Token 不足（需要 ${need}，剩余 ${campaign.stagecoach.waitingTokens}）`;
  }
  const selectable = getReplacementCandidates(campaign).filter((c) => c.selectable).length;
  if (selectable < need) {
    return `可用替补英雄不足（需要 ${need}，可选 ${selectable}）`;
  }
  return null;
}

/** 标记战役失败并进入 campaign-over（不删除存档）。 */
export function failCampaign(campaign: CampaignState, reason: string): CampaignState {
  if (campaign.gamePhase === 'campaign-over') return campaign;
  let next: CampaignState = {
    ...campaign,
    gamePhase: 'campaign-over',
    campaignOverReason: reason,
    battle: null,
  };
  next = pushLog(next, `战役失败：${reason}`, 'danger');
  return next;
}

/**
 * 存在未处理替补时的统一流程判定：
 * - 无未确认槽位 → 原样返回（由调用方走正常流程）；
 * - 能补齐 → gamePhase = 'replacement'；
 * - 不能补齐 → campaign-over。
 */
export function evaluateReplacementFlow(campaign: CampaignState): CampaignState {
  if (unconfirmedSlotCount(campaign) === 0) return campaign;
  const block = replacementBlockReason(campaign);
  if (block) return failCampaign(campaign, block);
  let next: CampaignState = { ...campaign, gamePhase: 'replacement' };
  next = pushLog(next, '需要从 Stagecoach 补充队伍，进入替补流程。', 'warning');
  return next;
}
