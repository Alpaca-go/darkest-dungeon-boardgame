import type { CampaignState, HeroInstance, ProvisionPool } from '../types';
import { createId, nowIso } from './random';
import { getHeroById } from '../data/heroes';
import { getSkillsByHero } from '../data/skills';
import { getQuestById } from '../data/quests';
import { generateDungeon } from './dungeon';
import { pushLog } from './log';
import { createInitialStagecoach } from './stagecoach';
import { resetMentalStateForNewQuest } from './resolve-conversion';
import { SAVE_VERSION } from './save';
import { createInitialXpState } from './progression/xp-ledger';
import { getHeroSkillSlots } from './progression/upgrade-core';
import { refreshObjectiveProgress } from './progression/quest-objectives';
import { createInitialNomadWagonState } from './trinkets/trinket-state';
import { createInitialCampaignProgress } from './campaign/campaign-progress';
import { createInitialActFourState } from './campaign/act-four/act-four-state';
import { validateQuestSelection } from './campaign/campaign-orchestrator';

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
    saveVersion: SAVE_VERSION, // v8 = Phase 9A（Boss / Imminent Threat / Face the Threat）
    id: createId('cmp'),
    createdAt: now,
    updatedAt: now,
    gamePhase: 'campaign-setup',
    act: 1,
    campaignLevel: 1,
    completedQuestCount: 0,
    currentThreatId: null,
    currentQuestId: null,
    questStatus: 'none',
    gold: 50,
    light: 5,
    heroes: [],
    waitingHeroIds: [],
    provisions: { ...DEFAULT_PROVISIONS },
    dungeon: null,
    battle: null,
    hamlet: {
      visitId: createId('hvisit'),
      preparationDays: 0,
      currentDay: 1,
      caretakerBlockedBuildingId: null,
      occupiedBuildingIds: [],
      currentEventId: null,
      log: [],
      nextQuestProvisionBonus: 0,
    },
    log: [
      {
        id: createId('log'),
        at: now,
        message: '新的战役已建立。选择你的四名英雄。',
        kind: 'info',
      },
    ],
    questStartGold: 50,
    questResultResolved: false,
    lastQuestResult: null,
    // ---- Phase 6 ----
    stagecoach: createInitialStagecoach(),
    deathRecords: [],
    processedDamageEventIds: [],
    stagecoachXpApplied: false,
    campaignOverReason: null,
    // ---- Phase 7 ----
    mentalEvents: [],
    resolveConversionRecords: [],
    processedStressBatchIds: [],
    // ---- Phase 8A ----
    pendingQuirkDecisions: [],
    // ---- Phase 8B ----
    diseaseAcquisitionRecords: [],
    diseaseTreatmentRecords: [],
    processedDiseaseEventIds: [],
    pendingDiseaseTransaction: null,
    lastDiseaseAcquisition: null,
    // ---- Phase 8D ----
    objectiveProgress: [],
    pendingQuestXp: null,
    questXpResults: [],
    progressionTransactions: [],
    guildVisitSession: null,
    replacementUpgradeSession: null,
    temporarySkillFormOverrides: [],
    // ---- Phase 8C ----
    pendingTrinketAllocations: [],
    pendingTrinketUseOpportunities: [],
    pendingTrinketUseTransaction: null,
    trinketAcquisitionRecords: [],
    trinketUseRecords: [],
    trinketTransferRecords: [],
    processedTrinketEventIds: [],
    processedTrinketResetKeys: [],
    nomadWagon: createInitialNomadWagonState(),
    // ---- Phase 9A ----
    // 新战役从 Act I / Level I 开始；Threat 不在此处抽取（UI 不生成随机数），
    // 由 act-start 事务在进入战役后抽一次并保存（§7.2 / 核心约束 1、2）。
    campaignProgress: createInitialCampaignProgress({ act: 1, campaignLevel: 1, now }),
    activeThreatRuntime: null,
    bossQuestState: null,
    bossDungeonGeneration: null,
    campaignAdvanceHistory: [],
    bossSummonHistory: [],
    processedBossTransactionIds: [],
    // ---- Phase 11A.1：Campaign Orchestration 事务簿记（§20） ----
    processedCampaignTransactionIds: [],
    // ---- Phase 10A ----
    // Act IV 初始为「未解锁」；解锁只能由 unlockDarkestDungeonAct() 在
    // 第三个 Boss 被击败后触发（§6），新战役不预置任何 Act IV 随机结果。
    actFourState: createInitialActFourState(),
  };
}

/** 由英雄定义创建战役内的英雄实例。 */
export function createHeroInstance(heroId: string, partySlot = 0): HeroInstance | null {
  const def = getHeroById(heroId);
  if (!def) return null;
  return {
    instanceId: createId('hero'),
    heroId: def.id,
    name: def.name,
    level: 1,
    maxLife: def.baseLife,
    wounds: 0,
    stress: 0,
    speed: def.speed,
    stance: def.defaultStance,
    equippedSkillIds: [],
    // Phase 8D：xp 为 xpState.currentXp 的只读镜像，唯一写入口是 xp-ledger
    xp: 0,
    xpState: createInitialXpState(0),
    isAlive: true,
    hasActedToday: false,
    temporaryDamageBonus: 0,
    // ---- Phase 6 ----
    partySlot,
    atDeathsDoor: false,
    dead: false,
    deathblowRollCount: 0,
    skillLevels: {},
    // ---- Phase 7：精神系统初始状态 ----
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    heartAttackCount: 0,
    positiveQuirkIds: [],
    negativeQuirkIds: [],
    lastResolveQuestId: null,
    lastMentalEventId: null,
    // ---- Phase 8B ----
    disease: null,
    pendingBleed: 0,
    pendingBlight: 0,
    // ---- Phase 8C：容量 = 等级，新英雄 Level 1 → 1 格空位 ----
    equippedTrinkets: [],
  };
}

/**
 * 设置队伍（恰好 4 名且不重复）。返回新的 campaign。
 * 超出 4 人或含未知 id 时忽略多余部分。
 */
export function selectParty(campaign: CampaignState, heroIds: string[]): CampaignState {
  const unique = Array.from(new Set(heroIds)).slice(0, 4);
  const heroes = unique
    .map((id, i) => createHeroInstance(id, i + 1))
    .filter((h): h is HeroInstance => h !== null);
  return { ...campaign, heroes };
}

/**
 * 装备/卸下某英雄的一个技能。
 * Phase 8D：槽位上限不再硬编码为 3，而是由 Hero Level 派生（getHeroSkillSlots）。
 * 已装备则卸下；未装备且未满槽位则装备；已满则忽略。
 */
export function equipSkill(
  campaign: CampaignState,
  heroId: string,
  skillId: string
): CampaignState {
  const heroes = campaign.heroes.map((h) => {
    if (h.heroId !== heroId) return h;
    const has = h.equippedSkillIds.includes(skillId);
    if (has) {
      return { ...h, equippedSkillIds: h.equippedSkillIds.filter((id) => id !== skillId) };
    }
    if (h.equippedSkillIds.length >= getHeroSkillSlots(h)) return h; // 槽位已满，忽略
    return { ...h, equippedSkillIds: [...h.equippedSkillIds, skillId] };
  });
  return { ...campaign, heroes };
}

/** 为全部英雄套用默认技能配置（按 Hero Level 派生的槽位数取前 N 个技能）。 */
export function applyDefaultLoadout(campaign: CampaignState): CampaignState {
  const heroes = campaign.heroes.map((h) => {
    const skills = getSkillsByHero(h.heroId)
      .slice(0, getHeroSkillSlots(h))
      .map((s) => s.id);
    return { ...h, equippedSkillIds: skills };
  });
  return { ...campaign, heroes };
}

/** 是否可选满 4 人并进入技能配置。 */
export function canProceedToLoadout(campaign: CampaignState): boolean {
  return campaign.heroes.length === 4;
}

/** 技能配置是否完成：4 名英雄且每人恰好装满等级对应的技能槽。 */
export function isLoadoutComplete(campaign: CampaignState): boolean {
  return (
    campaign.heroes.length === 4 &&
    campaign.heroes.every((h) => h.equippedSkillIds.length === getHeroSkillSlots(h))
  );
}

/**
 * 选择任务：写入任务 id 与状态，生成新地牢与新补给池，进入地牢探索阶段。
 * - 每次任务都发放全新 DEFAULT_PROVISIONS（上一任务补给已在结算时转换为 Gold）；
 * - Hamlet 事件 Supply Run 的补给奖励在此一次性应用并清除；
 * - 记录任务开始时的 Gold 快照，用于结算页展示净收益。
 * - Phase 11A.1 §8：Engine 侧门控 —— Boss 锁定时禁止 Standard；Standard 未达 2/2 时禁止 Boss Quest。
 */
export function selectQuest(campaign: CampaignState, questId: string): CampaignState {
  const quest = getQuestById(questId);
  if (!quest) return campaign;
  // Phase 11A.1 §8.1 / §8.2：Engine 侧门控（即使 UI 绕过也必须拒绝）。
  const validation = validateQuestSelection(campaign, questId);
  if (validation !== null) {
    return campaign;
  }
  const bonus = campaign.hamlet.nextQuestProvisionBonus ?? 0;
  const provisions: ProvisionPool = {
    food: DEFAULT_PROVISIONS.food + bonus,
    bandage: DEFAULT_PROVISIONS.bandage + bonus,
    potion: DEFAULT_PROVISIONS.potion + bonus,
    torch: DEFAULT_PROVISIONS.torch + bonus,
    tool: DEFAULT_PROVISIONS.tool + bonus,
  };
  let next: CampaignState = {
    ...campaign,
    currentQuestId: questId,
    questStatus: 'active',
    dungeon: generateDungeon(questId),
    battle: null,
    provisions,
    gamePhase: 'dungeon-explore',
    questStartGold: campaign.gold,
    questResultResolved: false,
    lastQuestResult: null,
    hamlet: { ...campaign.hamlet, nextQuestProvisionBonus: 0 },
    // Phase 6：新任务重置 Stagecoach XP 幂等标记
    stagecoachXpApplied: false,
    // Phase 8D：新任务重置 Objective 进度与待分配 XP
    objectiveProgress: [],
    pendingQuestXp: null,
  };
  // Phase 7：新任务重置精神状态（resolveTestedThisQuest / 兜底清理未转换状态）
  next = resetMentalStateForNewQuest(next);
  // Phase 8D：初始化本次任务的 Objective 进度快照（全部未完成）
  next = refreshObjectiveProgress(next);
  next = pushLog(next, `选择了任务：${quest.name}。地牢已生成，开始探索。`, 'success');
  if (bonus > 0) {
    next = pushLog(next, `Supply Run 事件生效：每种补给 +${bonus}。`, 'success');
  }
  return next;
}
