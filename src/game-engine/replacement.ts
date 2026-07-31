import type {
  CampaignState,
  HeroInstance,
  ProgressionUpgradeChoice,
  ReplacementSlot,
  ReplacementUpgradeOperation,
} from '../types';
import { createId } from './random';
import { getHeroById } from '../data/heroes';
import { getSkillsByHero } from '../data/skills';
import { getHeroLevelProfile } from '../data/hero-level-profiles';
import { getReplacementCandidates } from './stagecoach';
import { pushLog } from './log';
import { createInitialXpState } from './progression/xp-ledger';
import {
  applyUpgradeChoicesToHero,
  getHeroSkillSlots,
  validateProgressionUpgrade,
} from './progression/upgrade-core';
import {
  GUILD_UPGRADE_COSTS,
  MAX_UPGRADES_PER_REPLACEMENT,
} from '../data/progression/guild-costs';

// ---------------------------------------------------------------------------
// Phase 6 替补流程：选择候选 → （最多 2 次免 Gold 升级）→ 确认 → 填回原槽位。
//
// Phase 8D：升级校验与应用改为复用 progression/upgrade-core（与 Guild 同一份规则），
// 唯一差异是 paymentMode='xp-only'（不消耗 Gold），XP 仍来自 Stagecoach 累计。
// 缺少等级卡面数据时一律拒绝升级，不编造数值。
// ---------------------------------------------------------------------------

const MAX_UPGRADES = MAX_UPGRADES_PER_REPLACEMENT;
/** Level 1 英雄的技能槽位数（由 Registry 派生，避免硬编码 3）。 */
const LEVEL_1_SKILL_SLOTS = getHeroSkillSlots({ heroId: '', level: 1 } as HeroInstance);
export const HERO_LEVEL_XP_COST = GUILD_UPGRADE_COSTS.heroLevel.xp;
export const SKILL_LEVEL_XP_COST = GUILD_UPGRADE_COSTS.skillLevel.xp;

function findSlot(campaign: CampaignState, slotId: string): ReplacementSlot | undefined {
  return campaign.stagecoach.pendingReplacement?.slots.find(
    (s) => s.deadCampaignHeroId === slotId
  );
}

function updateSlot(
  campaign: CampaignState,
  slotId: string,
  updater: (slot: ReplacementSlot) => ReplacementSlot
): CampaignState {
  const pending = campaign.stagecoach.pendingReplacement;
  if (!pending) return campaign;
  return {
    ...campaign,
    stagecoach: {
      ...campaign.stagecoach,
      pendingReplacement: {
        ...pending,
        slots: pending.slots.map((s) => (s.deadCampaignHeroId === slotId ? updater(s) : s)),
      },
    },
  };
}

/** 升级操作总 XP 花费。 */
export function upgradeXpSpent(ops: ReplacementUpgradeOperation[]): number {
  return ops.reduce((sum, op) => sum + op.xpCost, 0);
}

/** 把持久化的替补升级操作转换为 upgrade-core 的通用选择结构。 */
function toUpgradeChoices(
  heroInstanceId: string,
  ops: ReplacementUpgradeOperation[]
): ProgressionUpgradeChoice[] {
  return ops.map((o) => ({
    id: o.id,
    type: o.type,
    heroInstanceId,
    skillId: o.type === 'skill-level' ? o.skillId ?? null : null,
    fromLevel: o.fromLevel,
    toLevel: o.toLevel,
    xpCost: o.xpCost,
    goldCost: 0, // Replacement 免 Gold（规则 16）
  }));
}

/**
 * 为槽位选择候选英雄并生成 draft hero（15.2 初始状态）。
 * 非法选择（不可选候选 / 槽位已确认）原样返回。
 */
export function selectReplacementHero(
  campaign: CampaignState,
  slotId: string,
  heroClassId: string
): CampaignState {
  const slot = findSlot(campaign, slotId);
  if (!slot || slot.confirmed) return campaign;
  const def = getHeroById(heroClassId);
  if (!def) return campaign;

  // 候选合法性（排除本槽位当前已选，允许改选）
  const candidate = getReplacementCandidates({
    ...campaign,
    stagecoach: {
      ...campaign.stagecoach,
      pendingReplacement: campaign.stagecoach.pendingReplacement
        ? {
            ...campaign.stagecoach.pendingReplacement,
            slots: campaign.stagecoach.pendingReplacement.slots.map((s) =>
              s.deadCampaignHeroId === slotId ? { ...s, selectedHeroClassId: undefined } : s
            ),
          }
        : null,
    },
  }).find((c) => c.hero.id === heroClassId);
  if (!candidate?.selectable) return campaign;

  const profile = getHeroLevelProfile(heroClassId, 1);
  const defaultSkills = getSkillsByHero(heroClassId).slice(0, LEVEL_1_SKILL_SLOTS);
  const skillLevels: Record<string, 1 | 2 | 3> = {};
  for (const s of defaultSkills) skillLevels[s.id] = 1;

  const draft: HeroInstance = {
    instanceId: createId('hero'),
    heroId: def.id,
    name: def.name,
    level: 1,
    maxLife: profile?.maxHp ?? def.baseLife,
    wounds: 0,
    stress: 0,
    speed: profile?.speed ?? def.speed,
    stance: def.defaultStance,
    equippedSkillIds: defaultSkills.map((s) => s.id),
    // Phase 8D：替补英雄带着 Stagecoach 累计 XP 入场（xp 为 xpState 的只读镜像）
    xp: campaign.stagecoach.accumulatedXp,
    xpState: createInitialXpState(campaign.stagecoach.accumulatedXp),
    isAlive: true,
    hasActedToday: false,
    temporaryDamageBonus: 0,
    partySlot: slot.partySlot,
    atDeathsDoor: false,
    dead: false,
    deathblowRollCount: 0,
    skillLevels,
    // ---- Phase 7：新英雄精神系统初始状态 ----
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    heartAttackCount: 0,
    positiveQuirkIds: [],
    negativeQuirkIds: [],
    lastResolveQuestId: null,
    lastMentalEventId: null,
    // ---- Phase 8B：替补英雄不携带 Disease ----
    disease: null,
    pendingBleed: 0,
    pendingBlight: 0,
  };

  let next = updateSlot(campaign, slotId, (s) => ({
    ...s,
    selectedHeroClassId: heroClassId,
    draftHero: draft,
    upgradeOperations: [], // 改选候选时清空升级
  }));
  next = pushLog(next, `替补槽位 ${slot.partySlot}：选择了候选英雄 ${def.name}。`, 'info');
  return next;
}

/**
 * 校验一次替补升级请求（复用 upgrade-core 的规则），返回可直接展示的原因。
 * 与 Guild 唯一的差异是 paymentMode='xp-only'。
 */
export function validateReplacementUpgrade(
  campaign: CampaignState,
  slotId: string,
  request: { type: 'hero-level' } | { type: 'skill-level'; skillId: string }
) {
  const slot = findSlot(campaign, slotId);
  if (!slot || slot.confirmed || !slot.draftHero) {
    return {
      ok: false as const,
      reason: '当前槽位不可升级',
      type: request.type,
      skillId: null,
      fromLevel: 1 as const,
      toLevel: 1 as const,
      xpCost: 0,
      goldCost: 0,
    };
  }
  return validateProgressionUpgrade(
    {
      hero: slot.draftHero,
      choices: toUpgradeChoices(slot.draftHero.instanceId, slot.upgradeOperations),
      maxUpgrades: MAX_UPGRADES,
      paymentMode: 'xp-only',
      availableGold: Number.POSITIVE_INFINITY,
    },
    { type: request.type, skillId: request.type === 'skill-level' ? request.skillId : null }
  );
}

/** 校验并添加一次升级操作；非法时返回原状态（不产生任何消费）。 */
export function addReplacementUpgrade(
  campaign: CampaignState,
  slotId: string,
  op:
    | { type: 'hero-level' }
    | { type: 'skill-level'; skillId: string }
): CampaignState {
  const slot = findSlot(campaign, slotId);
  if (!slot || slot.confirmed || !slot.draftHero) return campaign;

  const validation = validateReplacementUpgrade(campaign, slotId, op);
  if (!validation.ok) return campaign;

  const newOp: ReplacementUpgradeOperation =
    validation.type === 'hero-level'
      ? {
          id: createId('upg'),
          type: 'hero-level',
          fromLevel: validation.fromLevel as 1 | 2,
          toLevel: validation.toLevel as 2 | 3,
          xpCost: validation.xpCost,
        }
      : {
          id: createId('upg'),
          type: 'skill-level',
          skillId: validation.skillId!,
          fromLevel: validation.fromLevel as 1 | 2,
          toLevel: validation.toLevel as 2 | 3,
          xpCost: validation.xpCost,
        };

  return updateSlot(campaign, slotId, (s) => ({
    ...s,
    upgradeOperations: [...s.upgradeOperations, newOp],
  }));
}

/** 移除一次升级操作（XP 随之恢复；派生计算，无需手动回滚）。 */
export function removeReplacementUpgrade(
  campaign: CampaignState,
  slotId: string,
  operationId: string
): CampaignState {
  const slot = findSlot(campaign, slotId);
  if (!slot || slot.confirmed) return campaign;
  if (!slot.upgradeOperations.some((o) => o.id === operationId)) return campaign;
  return updateSlot(campaign, slotId, (s) => ({
    ...s,
    upgradeOperations: s.upgradeOperations.filter((o) => o.id !== operationId),
  }));
}

/**
 * 将升级操作真实应用到 draft hero（复用 upgrade-core，XP 走统一台账）。
 * 返回 null 表示应用失败（XP 不足或缺少等级卡面数据），调用方必须整体放弃。
 */
export function applyUpgradesToDraft(
  draft: HeroInstance,
  ops: ReplacementUpgradeOperation[],
  stagecoachXp: number
): HeroInstance | null {
  // draft 的 XP 以确认时的 Stagecoach 累计值为准（改选/刷新后可能变化）
  const base: HeroInstance = {
    ...draft,
    xp: stagecoachXp,
    xpState: createInitialXpState(stagecoachXp),
    skillLevels: { ...draft.skillLevels },
  };
  const applied = applyUpgradeChoicesToHero(base, toUpgradeChoices(base.instanceId, ops));
  if (!applied) return null;
  // 替补英雄满血入队（升级带来的 maxLife 提升同样体现为满血）
  return { ...applied, wounds: 0 };
}

/**
 * 确认替补（15.4，单一入口，幂等）：
 * 验证 → 扣 1 Token → draft 应用升级并填入 partySlot → 记录招募 → 日志。
 * 全部槽位确认后：resolved、清空 pendingReplacement、跳转 resumePhase。
 */
export function confirmReplacement(campaign: CampaignState, slotId: string): CampaignState {
  const pending = campaign.stagecoach.pendingReplacement;
  const slot = findSlot(campaign, slotId);
  if (!pending || pending.resolved || !slot) return campaign;
  if (slot.confirmed) return campaign; // 幂等：双击/刷新不重复扣 Token
  if (!slot.draftHero || !slot.selectedHeroClassId) return campaign;
  if (campaign.stagecoach.waitingTokens < 1) return campaign;

  // 再次验证候选合法性
  const candidate = getReplacementCandidates({
    ...campaign,
    stagecoach: {
      ...campaign.stagecoach,
      pendingReplacement: {
        ...pending,
        slots: pending.slots.map((s) =>
          s.deadCampaignHeroId === slotId ? { ...s, selectedHeroClassId: undefined } : s
        ),
      },
    },
  }).find((c) => c.hero.id === slot.selectedHeroClassId);
  if (!candidate?.selectable) return campaign;

  // 再次验证升级合法性
  const ops = slot.upgradeOperations;
  if (ops.length > MAX_UPGRADES) return campaign;
  if (upgradeXpSpent(ops) > campaign.stagecoach.accumulatedXp) return campaign;

  const finalHero = applyUpgradesToDraft(slot.draftHero, ops, campaign.stagecoach.accumulatedXp);
  // Phase 8D：缺少卡面数据或 XP 不足 → 整体放弃，不产生任何消费（不扣 Token）
  if (!finalHero) {
    return pushLog(campaign, '替补升级失败（缺少等级卡面数据或 XP 不足），已取消本次确认。', 'danger');
  }

  // 用新英雄替换阵亡英雄（保持数组位置 = 原 partySlot 顺序）
  const heroes = campaign.heroes.map((h) =>
    h.instanceId === slot.deadCampaignHeroId ? finalHero : h
  );

  let next: CampaignState = {
    ...campaign,
    heroes,
    stagecoach: {
      ...campaign.stagecoach,
      waitingTokens: campaign.stagecoach.waitingTokens - 1,
      recruitedHeroClassIds: [
        ...campaign.stagecoach.recruitedHeroClassIds,
        slot.selectedHeroClassId,
      ],
      pendingReplacement: {
        ...pending,
        slots: pending.slots.map((s) =>
          s.deadCampaignHeroId === slotId ? { ...s, confirmed: true } : s
        ),
      },
    },
  };
  next = pushLog(next, 'Stagecoach 消耗 1 个 Waiting Hero Token。', 'warning');
  next = pushLog(
    next,
    `${finalHero.name} 加入队伍（槽位 ${slot.partySlot}），并获得 ${campaign.stagecoach.accumulatedXp} Stagecoach XP（升级花费 ${upgradeXpSpent(ops)}，剩余 ${finalHero.xp}）。`,
    'success'
  );

  // 全部确认 → 完成流程
  const allConfirmed = next.stagecoach.pendingReplacement!.slots.every((s) => s.confirmed);
  if (allConfirmed) next = completeReplacementFlow(next);
  return next;
}

/** 完成替补流程：清空 pendingReplacement 并跳转 resumePhase。 */
export function completeReplacementFlow(campaign: CampaignState): CampaignState {
  const pending = campaign.stagecoach.pendingReplacement;
  if (!pending) return campaign;
  if (pending.slots.some((s) => !s.confirmed)) return campaign;

  let next: CampaignState = {
    ...campaign,
    gamePhase: pending.resumePhase,
    stagecoach: { ...campaign.stagecoach, pendingReplacement: null },
  };
  next = pushLog(next, '替补完成，队伍恢复满员。', 'success');
  return next;
}
