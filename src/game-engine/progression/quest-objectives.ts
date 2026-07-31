import type {
  CampaignState,
  QuestObjectiveDefinition,
  QuestObjectiveProgress,
  QuestXpResult,
} from '../../types';
import { getQuestById } from '../../data/quests';
import { QUEST_XP_POLICY } from '../../data/progression/guild-costs';
import { createId, nowIso } from '../random';

// ---------------------------------------------------------------------------
// Phase 8D：Quest Objective 与 0-3 XP
//
// 规则 1：一次任务奖励的 XP = 已完成 Objective 数量，clamp 到 0-3。
// 规则 3：所有合格英雄获得相同 XP，不按人数拆分。
// 所有 Objective 判定都可由 CampaignState 推导，不引入额外运行时状态，
// 因此刷新 / 重放 / 读档不会改变判定结果（幂等）。
// ---------------------------------------------------------------------------

/** 读取任务的结构化 Objective（缺数据时返回空数组 → 0 XP，不白屏）。 */
export function getQuestObjectives(questId: string): QuestObjectiveDefinition[] {
  return getQuestById(questId)?.objectives ?? [];
}

/** 本次任务中阵亡的英雄数（survive Objective 判定依据）。 */
function questDeathCount(campaign: CampaignState): number {
  const questId = campaign.currentQuestId ?? '';
  return campaign.deathRecords.filter((r) => r.questId === questId).length;
}

/** 本次地牢中已互动的 Curio 数量。 */
function curioInteractionCount(campaign: CampaignState): number {
  return (campaign.dungeon?.rooms ?? []).filter((r) => r.curioUsed === true).length;
}

/**
 * 已击败的怪物数：由地牢房间的战斗清除状态推导。
 * 「已清除且原本有怪物」的房间数即为击败的遭遇次数。
 */
function defeatedEncounterCount(campaign: CampaignState): number {
  return (campaign.dungeon?.rooms ?? []).filter(
    (r) => r.status === 'cleared' && (r.type === 'battle' || r.type === 'objective'),
  ).length;
}

/** 纯函数：按当前战役状态评估单个 Objective 的进度。 */
export function evaluateObjective(
  campaign: CampaignState,
  def: QuestObjectiveDefinition,
): QuestObjectiveProgress {
  const dungeon = campaign.dungeon;
  let current = 0;
  switch (def.type) {
    case 'clear-room-count':
      current = dungeon?.roomsCleared ?? 0;
      break;
    case 'complete-objective-room':
      current = dungeon?.objectiveComplete ? 1 : 0;
      break;
    case 'defeat-monsters':
      current = defeatedEncounterCount(campaign);
      break;
    case 'collect-gold':
      current = Math.max(0, campaign.gold - (campaign.questStartGold ?? campaign.gold));
      break;
    case 'interact-curio':
      current = curioInteractionCount(campaign);
      break;
    case 'survive':
      // 全队无人阵亡且至少 1 人存活
      current =
        questDeathCount(campaign) === 0 && campaign.heroes.some((h) => h.isAlive && !h.dead) ? 1 : 0;
      break;
    case 'custom':
    default:
      // 无内建判定器 → 永远视为未完成，绝不编造进度
      current = 0;
      break;
  }
  const target = Math.max(1, def.target ?? 1);
  return {
    objectiveId: def.id,
    description: def.description,
    type: def.type,
    current,
    target,
    required: def.required,
    completed: current >= target,
  };
}

/** 纯函数：评估当前任务的所有 Objective 进度。 */
export function evaluateQuestObjectives(campaign: CampaignState): QuestObjectiveProgress[] {
  return getQuestObjectives(campaign.currentQuestId ?? '').map((def) =>
    evaluateObjective(campaign, def),
  );
}

/** 由 Objective 进度计算本次任务的 XP（clamp 到 0-3，硬上限）。 */
export function computeQuestXp(progress: QuestObjectiveProgress[]): {
  completedObjectiveCount: number;
  completedObjectiveIds: string[];
  xpPerHero: number;
} {
  const completed = progress.filter((p) => p.completed);
  const xpPerHero = Math.max(
    0,
    Math.min(
      QUEST_XP_POLICY.maxXpPerQuest,
      completed.length * QUEST_XP_POLICY.xpPerObjective,
    ),
  );
  return {
    completedObjectiveCount: completed.length,
    completedObjectiveIds: completed.map((p) => p.objectiveId),
    xpPerHero,
  };
}

/** 有资格获得 Quest XP 的英雄：存活且未永久死亡。 */
export function eligibleXpHeroIds(campaign: CampaignState): string[] {
  return campaign.heroes.filter((h) => h.isAlive && !h.dead).map((h) => h.instanceId);
}

/**
 * 生成本次任务的 XP 结算结果（distributed=false）。
 * 只在 quest-result 结算时调用一次，实际发放推迟到回到 Hamlet（规则 2）。
 */
export function createQuestXpResult(campaign: CampaignState): QuestXpResult {
  const objectives = evaluateQuestObjectives(campaign);
  const { completedObjectiveCount, completedObjectiveIds, xpPerHero } = computeQuestXp(objectives);
  const quest = getQuestById(campaign.currentQuestId ?? '');
  return {
    id: createId('qxp'),
    questId: campaign.currentQuestId ?? '',
    questName: quest?.name ?? '未知任务',
    objectives,
    completedObjectiveIds,
    completedObjectiveCount,
    xpPerHero,
    // 规则 4：Stagecoach 获得与单名英雄相同的 XP，不是队伍总和。
    stagecoachXp: xpPerHero,
    eligibleHeroIds: eligibleXpHeroIds(campaign),
    distributed: false,
    distributedAt: null,
    createdAt: nowIso(),
  };
}

/** 刷新当前任务的 Objective 实时进度（探索/战斗后调用；结算页禁止临时计算）。 */
export function refreshObjectiveProgress(campaign: CampaignState): CampaignState {
  const progress = evaluateQuestObjectives(campaign);
  const prev = campaign.objectiveProgress ?? [];
  const same =
    prev.length === progress.length &&
    prev.every(
      (p, i) =>
        p.objectiveId === progress[i].objectiveId &&
        p.completed === progress[i].completed &&
        p.current === progress[i].current,
    );
  if (same) return campaign;
  // 保留首次完成时间戳（completedAt 只写一次）
  const at = nowIso();
  const merged = progress.map((p) => {
    const old = prev.find((o) => o.objectiveId === p.objectiveId);
    if (!p.completed) return p;
    return { ...p, completedAt: old?.completedAt ?? at };
  });
  return { ...campaign, objectiveProgress: merged };
}
