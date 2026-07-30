import type { CampaignState, HeroInstance, ProvisionPool } from '../types';
import { createId, nowIso } from './random';
import { getHeroById } from '../data/heroes';
import { getSkillsByHero } from '../data/skills';
import { getQuestById } from '../data/quests';
import { generateDungeon } from './dungeon';
import { pushLog } from './log';
import { createInitialStagecoach } from './stagecoach';

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
    saveVersion: 3,
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
    xp: 0,
    isAlive: true,
    hasActedToday: false,
    temporaryDamageBonus: 0,
    // ---- Phase 6 ----
    partySlot,
    atDeathsDoor: false,
    dead: false,
    deathblowRollCount: 0,
    skillLevels: {},
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
 * 装备/卸下某英雄的一个技能（最多 3 个）。
 * 已装备则卸下；未装备且不足 3 个则装备；已满 3 个则忽略。
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
    if (h.equippedSkillIds.length >= 3) return h; // 已满 3 个，忽略
    return { ...h, equippedSkillIds: [...h.equippedSkillIds, skillId] };
  });
  return { ...campaign, heroes };
}

/** 为全部英雄套用默认技能配置（取各英雄前 3 个技能）。 */
export function applyDefaultLoadout(campaign: CampaignState): CampaignState {
  const heroes = campaign.heroes.map((h) => {
    const skills = getSkillsByHero(h.heroId).slice(0, 3).map((s) => s.id);
    return { ...h, equippedSkillIds: skills };
  });
  return { ...campaign, heroes };
}

/** 是否可选满 4 人并进入技能配置。 */
export function canProceedToLoadout(campaign: CampaignState): boolean {
  return campaign.heroes.length === 4;
}

/** 技能配置是否完成：4 名英雄且每人恰好装备 3 个技能。 */
export function isLoadoutComplete(campaign: CampaignState): boolean {
  return (
    campaign.heroes.length === 4 &&
    campaign.heroes.every((h) => h.equippedSkillIds.length === 3)
  );
}

/**
 * 选择任务：写入任务 id 与状态，生成新地牢与新补给池，进入地牢探索阶段。
 * - 每次任务都发放全新 DEFAULT_PROVISIONS（上一任务补给已在结算时转换为 Gold）；
 * - Hamlet 事件 Supply Run 的补给奖励在此一次性应用并清除；
 * - 记录任务开始时的 Gold 快照，用于结算页展示净收益。
 */
export function selectQuest(campaign: CampaignState, questId: string): CampaignState {
  const quest = getQuestById(questId);
  if (!quest) return campaign;
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
  };
  next = pushLog(next, `选择了任务：${quest.name}。地牢已生成，开始探索。`, 'success');
  if (bonus > 0) {
    next = pushLog(next, `Supply Run 事件生效：每种补给 +${bonus}。`, 'success');
  }
  return next;
}
