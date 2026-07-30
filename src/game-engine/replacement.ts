import type {
  CampaignState,
  HeroInstance,
  ReplacementSlot,
  ReplacementUpgradeOperation,
} from '../types';
import { createId } from './random';
import { getHeroById } from '../data/heroes';
import { getSkillsByHero } from '../data/skills';
import { getHeroLevelProfile } from '../data/hero-level-profiles';
import { getReplacementCandidates } from './stagecoach';
import { pushLog } from './log';

// ---------------------------------------------------------------------------
// Phase 6 替补流程：选择候选 → （最多 2 次免 Gold 升级）→ 确认 → 填回原槽位。
// ---------------------------------------------------------------------------

const MAX_UPGRADES = 2;
export const HERO_LEVEL_XP_COST = 4;
export const SKILL_LEVEL_XP_COST = 2;

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

/** 应用升级操作后的英雄有效等级（1 + hero-level 操作次数）。 */
function effectiveHeroLevel(base: 1 | 2 | 3, ops: ReplacementUpgradeOperation[]): 1 | 2 | 3 {
  const n = base + ops.filter((o) => o.type === 'hero-level').length;
  return Math.min(3, n) as 1 | 2 | 3;
}

function effectiveSkillLevel(
  base: 1 | 2 | 3,
  skillId: string,
  ops: ReplacementUpgradeOperation[]
): 1 | 2 | 3 {
  const n = base + ops.filter((o) => o.type === 'skill-level' && o.skillId === skillId).length;
  return Math.min(3, n) as 1 | 2 | 3;
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
  const defaultSkills = getSkillsByHero(heroClassId).slice(0, 3);
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
    xp: campaign.stagecoach.accumulatedXp,
    isAlive: true,
    hasActedToday: false,
    temporaryDamageBonus: 0,
    partySlot: slot.partySlot,
    atDeathsDoor: false,
    dead: false,
    deathblowRollCount: 0,
    skillLevels,
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

/** 校验并添加一次升级操作；非法时返回原状态。 */
export function addReplacementUpgrade(
  campaign: CampaignState,
  slotId: string,
  op:
    | { type: 'hero-level' }
    | { type: 'skill-level'; skillId: string }
): CampaignState {
  const slot = findSlot(campaign, slotId);
  if (!slot || slot.confirmed || !slot.draftHero) return campaign;
  const ops = slot.upgradeOperations;
  if (ops.length >= MAX_UPGRADES) return campaign;

  const spent = upgradeXpSpent(ops);
  const available = campaign.stagecoach.accumulatedXp - spent;

  let newOp: ReplacementUpgradeOperation;
  if (op.type === 'hero-level') {
    if (available < HERO_LEVEL_XP_COST) return campaign;
    const from = effectiveHeroLevel(1, ops);
    if (from >= 3) return campaign;
    newOp = {
      id: createId('upg'),
      type: 'hero-level',
      fromLevel: from as 1 | 2,
      toLevel: (from + 1) as 2 | 3,
      xpCost: HERO_LEVEL_XP_COST,
    };
  } else {
    if (available < SKILL_LEVEL_XP_COST) return campaign;
    if (!slot.draftHero.equippedSkillIds.includes(op.skillId)) return campaign;
    const from = effectiveSkillLevel(1, op.skillId, ops);
    if (from >= 3) return campaign;
    newOp = {
      id: createId('upg'),
      type: 'skill-level',
      skillId: op.skillId,
      fromLevel: from as 1 | 2,
      toLevel: (from + 1) as 2 | 3,
      xpCost: SKILL_LEVEL_XP_COST,
    };
  }

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

/** 将升级操作真实应用到 draft hero（等级 Profile 与技能等级数据）。 */
export function applyUpgradesToDraft(
  draft: HeroInstance,
  ops: ReplacementUpgradeOperation[],
  stagecoachXp: number
): HeroInstance {
  let hero = { ...draft, skillLevels: { ...draft.skillLevels } };
  for (const op of ops) {
    if (op.type === 'hero-level') {
      const profile = getHeroLevelProfile(hero.heroId, op.toLevel);
      hero = {
        ...hero,
        level: op.toLevel,
        maxLife: profile?.maxHp ?? hero.maxLife,
        speed: profile?.speed ?? hero.speed,
        wounds: 0, // 满血入队
      };
    } else {
      hero.skillLevels[op.skillId] = op.toLevel;
    }
  }
  return { ...hero, xp: Math.max(0, stagecoachXp - upgradeXpSpent(ops)) };
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
