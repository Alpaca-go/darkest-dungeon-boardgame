import type {
  CampaignState,
  HeroInstance,
  HeroLevel,
  HeroResistanceProfile,
  ProgressionPaymentMode,
  ProgressionUpgradeChoice,
  ProgressionUpgradeType,
  ProgressionUpgradeValidation,
  SkillLevel,
} from '../../types';
import {
  getHeroLevelDefinition,
  maxAvailableHeroLevel,
} from '../../data/progression/hero-level-registry';
import {
  getSkillLevelDefinition,
  maxAvailableSkillLevel,
} from '../../data/progression/skill-level-registry';
import { GUILD_UPGRADE_COSTS } from '../../data/progression/guild-costs';
import { createId } from '../random';
import { getHeroXp, spendXpOnHero } from './xp-ledger';

// ---------------------------------------------------------------------------
// Phase 8D：Hero Level / Skill Level 升级核心
//
// Guild（xp-and-gold）与 Stagecoach Replacement（xp-only）共用本文件的校验与应用逻辑，
// 唯一差异是 paymentMode 决定 goldCost 是否为 0。
// 缺少等级定义时一律「拒绝升级 + 给出原因」，绝不编造数值、绝不白屏。
// ---------------------------------------------------------------------------

/** 默认抗性（Registry 缺数据时的降级值，全 0 表示未知）。 */
const FALLBACK_RESISTANCES: HeroResistanceProfile = {
  stun: 0,
  blight: 0,
  bleed: 0,
  disease: 0,
  debuff: 0,
  move: 0,
};

/** 英雄当前等级（缺字段时降级为 1）。 */
export function getEffectiveHeroLevel(hero: HeroInstance): HeroLevel {
  const lv = hero.level;
  return lv === 2 || lv === 3 ? lv : 1;
}

/** 技能的永久等级（Registry 之外的唯一等级数据源）。 */
export function getPermanentSkillLevel(hero: HeroInstance, skillId: string): SkillLevel {
  const lv = hero.skillLevels?.[skillId];
  return lv === 2 || lv === 3 ? lv : 1;
}

/**
 * 技能的有效等级 = max(永久等级, Blacksmith 临时 Form 等级)。
 * 临时 Form 不写回 skillLevels，任务结束即失效（规则 15）。
 */
export function getEffectiveSkillLevel(
  campaign: CampaignState,
  hero: HeroInstance,
  skillId: string
): SkillLevel {
  const permanent = getPermanentSkillLevel(hero, skillId);
  const override = (campaign.temporarySkillFormOverrides ?? []).find(
    (o) => !o.consumed && o.heroInstanceId === hero.instanceId && o.skillId === skillId
  );
  if (!override) return permanent;
  return Math.max(permanent, override.formLevel) as SkillLevel;
}

/** 由 Hero Level 派生的技能槽位数（不落盘）。 */
export function getHeroSkillSlots(hero: HeroInstance): number {
  return getHeroLevelDefinition(hero.heroId, getEffectiveHeroLevel(hero))?.skillSlots ?? 3;
}

/** 由 Hero Level 派生的饰品容量（不落盘）。 */
export function getHeroTrinketCapacity(hero: HeroInstance): number {
  return getHeroLevelDefinition(hero.heroId, getEffectiveHeroLevel(hero))?.trinketSlots ?? 1;
}

/** 由 Hero Level 派生的抗性档案（不落盘）。 */
export function getHeroResistances(hero: HeroInstance): HeroResistanceProfile {
  return (
    getHeroLevelDefinition(hero.heroId, getEffectiveHeroLevel(hero))?.resistances ??
    FALLBACK_RESISTANCES
  );
}

/** 由 Hero Level 派生的免疫列表（不落盘，战斗内即时生效）。 */
export function getHeroImmunities(hero: HeroInstance): string[] {
  return getHeroLevelDefinition(hero.heroId, getEffectiveHeroLevel(hero))?.immunities ?? [];
}

/** 单次升级的成本（paymentMode 决定是否收 Gold）。 */
export function upgradeCost(
  type: ProgressionUpgradeType,
  paymentMode: ProgressionPaymentMode
): { xp: number; gold: number } {
  const table = type === 'hero-level' ? GUILD_UPGRADE_COSTS.heroLevel : GUILD_UPGRADE_COSTS.skillLevel;
  return { xp: table.xp, gold: paymentMode === 'xp-only' ? 0 : table.gold };
}

/** 会话内已选择升级的 XP / Gold 合计。 */
export function pendingCostTotals(choices: ProgressionUpgradeChoice[]): {
  xp: number;
  gold: number;
} {
  return choices.reduce(
    (acc, c) => ({ xp: acc.xp + c.xpCost, gold: acc.gold + c.goldCost }),
    { xp: 0, gold: 0 }
  );
}

/** 叠加会话内待提交选择后的英雄等级。 */
export function projectedHeroLevel(
  hero: HeroInstance,
  choices: ProgressionUpgradeChoice[]
): HeroLevel {
  const n = getEffectiveHeroLevel(hero) + choices.filter((c) => c.type === 'hero-level').length;
  return Math.min(3, n) as HeroLevel;
}

/** 叠加会话内待提交选择后的技能等级。 */
export function projectedSkillLevel(
  hero: HeroInstance,
  skillId: string,
  choices: ProgressionUpgradeChoice[]
): SkillLevel {
  const n =
    getPermanentSkillLevel(hero, skillId) +
    choices.filter((c) => c.type === 'skill-level' && c.skillId === skillId).length;
  return Math.min(3, n) as SkillLevel;
}

/** 升级校验上下文。 */
export interface UpgradeValidationContext {
  hero: HeroInstance;
  /** 会话内已选择但尚未提交的升级。 */
  choices: ProgressionUpgradeChoice[];
  maxUpgrades: number;
  paymentMode: ProgressionPaymentMode;
  availableGold: number;
}

/**
 * 校验一次升级请求。返回值同时给出成本与目标等级，UI 直接展示，不自行推导规则。
 */
export function validateProgressionUpgrade(
  ctx: UpgradeValidationContext,
  request: { type: ProgressionUpgradeType; skillId?: string | null }
): ProgressionUpgradeValidation {
  const { hero, choices, maxUpgrades, paymentMode, availableGold } = ctx;
  const type = request.type;
  const skillId = type === 'skill-level' ? request.skillId ?? null : null;
  const cost = upgradeCost(type, paymentMode);
  const spent = pendingCostTotals(choices);
  const remainingXp = getHeroXp(hero) - spent.xp;
  const remainingGold = availableGold - spent.gold;

  const fail = (
    reason: string,
    fromLevel: 1 | 2 | 3,
    toLevel: 1 | 2 | 3
  ): ProgressionUpgradeValidation => ({
    ok: false,
    reason,
    type,
    skillId,
    fromLevel,
    toLevel,
    xpCost: cost.xp,
    goldCost: cost.gold,
  });

  if (hero.dead || !hero.isAlive) return fail('阵亡英雄无法升级', 1, 1);
  if (choices.length >= maxUpgrades) {
    return fail(`本次最多只能升级 ${maxUpgrades} 次`, 1, 1);
  }

  if (type === 'hero-level') {
    const from = projectedHeroLevel(hero, choices);
    if (from >= 3) return fail('英雄等级已达上限 III', from, from);
    const to = (from + 1) as 2 | 3;
    if (to > maxAvailableHeroLevel(hero.heroId)) {
      return fail(`缺少 ${hero.name} Level ${to} 的卡面数据，无法升级`, from, from);
    }
    if (remainingXp < cost.xp) return fail(`XP 不足（需要 ${cost.xp}，剩余 ${remainingXp}）`, from, to);
    if (remainingGold < cost.gold) {
      return fail(`Gold 不足（需要 ${cost.gold}，剩余 ${remainingGold}）`, from, to);
    }
    return { ok: true, reason: null, type, skillId: null, fromLevel: from, toLevel: to, xpCost: cost.xp, goldCost: cost.gold };
  }

  if (!skillId) return fail('未指定技能', 1, 1);
  if (!hero.equippedSkillIds.includes(skillId)) return fail('该技能未装备，无法升级', 1, 1);
  const from = projectedSkillLevel(hero, skillId, choices);
  if (from >= 3) return fail('技能等级已达上限 III', from, from);
  const to = (from + 1) as 2 | 3;
  if (to > maxAvailableSkillLevel(skillId)) {
    return fail(`缺少该技能 Level ${to} 的卡面数据，无法升级`, from, from);
  }
  if (remainingXp < cost.xp) return fail(`XP 不足（需要 ${cost.xp}，剩余 ${remainingXp}）`, from, to);
  if (remainingGold < cost.gold) {
    return fail(`Gold 不足（需要 ${cost.gold}，剩余 ${remainingGold}）`, from, to);
  }
  return { ok: true, reason: null, type, skillId, fromLevel: from, toLevel: to, xpCost: cost.xp, goldCost: cost.gold };
}

/** 由校验结果构造一条待提交的升级选择。 */
export function buildUpgradeChoice(
  heroInstanceId: string,
  validation: ProgressionUpgradeValidation
): ProgressionUpgradeChoice | null {
  if (!validation.ok) return null;
  return {
    id: createId('upg'),
    type: validation.type,
    heroInstanceId,
    skillId: validation.skillId,
    fromLevel: validation.fromLevel as 1 | 2,
    toLevel: validation.toLevel as 2 | 3,
    xpCost: validation.xpCost,
    goldCost: validation.goldCost,
  };
}

/**
 * 把一次升级真实应用到英雄（纯函数）。
 * 返回 null 表示应用失败（XP 不足或缺少等级定义），调用方必须整体回滚。
 * 规则 10：Hero Level 提升同时更新 maxHp / speed；Skill Slot、Trinket Capacity、
 * Resistance、Immunity 均由等级派生，不写入 HeroInstance。
 */
export function applyUpgradeChoiceToHero(
  hero: HeroInstance,
  choice: ProgressionUpgradeChoice
): HeroInstance | null {
  const paid = spendXpOnHero(hero, choice.xpCost);
  if (!paid) return null;

  if (choice.type === 'hero-level') {
    const def = getHeroLevelDefinition(paid.heroId, choice.toLevel);
    if (!def) return null;
    const gainedHp = Math.max(0, def.maxHp - paid.maxLife);
    return {
      ...paid,
      level: choice.toLevel,
      maxLife: def.maxHp,
      speed: def.speed,
      // 升级只提升上限，不治疗既有伤口；额外上限即为新增可用 HP。
      wounds: Math.min(paid.wounds, def.maxHp),
      atDeathsDoor: gainedHp > 0 && paid.atDeathsDoor ? false : paid.atDeathsDoor,
    };
  }

  const skillId = choice.skillId;
  if (!skillId) return null;
  const def = getSkillLevelDefinition(skillId, choice.toLevel);
  if (!def) return null;
  return {
    ...paid,
    skillLevels: { ...paid.skillLevels, [skillId]: choice.toLevel },
  };
}

/** 顺序应用一组升级；任一失败即返回 null（调用方整体回滚）。 */
export function applyUpgradeChoicesToHero(
  hero: HeroInstance,
  choices: ProgressionUpgradeChoice[]
): HeroInstance | null {
  let current: HeroInstance = hero;
  for (const c of choices) {
    const next = applyUpgradeChoiceToHero(current, c);
    if (!next) return null;
    current = next;
  }
  return current;
}

/** 人类可读的升级描述（日志 / UI 共用）。 */
export function describeUpgradeChoice(
  choice: ProgressionUpgradeChoice,
  skillName?: string
): string {
  const roman = ['', 'I', 'II', 'III'];
  if (choice.type === 'hero-level') {
    return `英雄等级 ${roman[choice.fromLevel]} → ${roman[choice.toLevel]}`;
  }
  return `技能「${skillName ?? choice.skillId}」 ${roman[choice.fromLevel]} → ${roman[choice.toLevel]}`;
}
