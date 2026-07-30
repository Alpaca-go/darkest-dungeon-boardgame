import type { BattleUnit, CampaignState, HealingResolution } from '../types';
import { pushLog } from './log';
import { applyQuirkModifiers, describeModifierApplications } from './quirk-passives';

// ---------------------------------------------------------------------------
// Phase 6 统一治疗管线。
// Vestal 技能、Hamlet Sanitarium 等所有治疗必须经过本模块。
// 规则：死亡英雄不可治疗；治疗量 <= 0 无效果；HP 不超过 maxHp；
// Death's Door 英雄实际恢复 >= 1 HP 即离开 Death's Door。
// ---------------------------------------------------------------------------

/** 战斗单位治疗结算（纯函数）。 */
export function applyBattleUnitHealing(
  unit: BattleUnit,
  amount: number
): { unit: BattleUnit; healed: number; leftDeathsDoor: boolean; logs: string[] } {
  if (!unit.isAlive || amount <= 0) {
    return { unit, healed: 0, leftDeathsDoor: false, logs: [] };
  }
  const nextHp = Math.min(unit.maxHp, unit.hp + amount);
  const healed = nextHp - unit.hp;
  if (healed <= 0) return { unit, healed: 0, leftDeathsDoor: false, logs: [] };

  const leftDeathsDoor = unit.atDeathsDoor && healed >= 1;
  const logs: string[] = [];
  if (leftDeathsDoor) logs.push(`${unit.name} 恢复 ${healed} HP，脱离 Death's Door！`);
  return {
    unit: { ...unit, hp: nextHp, atDeathsDoor: leftDeathsDoor ? false : unit.atDeathsDoor },
    healed,
    leftDeathsDoor,
    logs,
  };
}

/**
 * Campaign 英雄治疗入口（Sanitarium 等非战斗治疗）。
 * 死亡英雄不可治疗；恢复 >= 1 HP 时离开 Death's Door。
 */
export function resolveHealing(
  campaign: CampaignState,
  targetId: string,
  amount: number
): { campaign: CampaignState; resolution: HealingResolution } {
  const hero = campaign.heroes.find((h) => h.instanceId === targetId);
  const previousHp = hero ? Math.max(0, hero.maxLife - hero.wounds) : 0;
  const noop: HealingResolution = {
    targetId,
    previousHp,
    nextHp: previousHp,
    healed: 0,
    leftDeathsDoor: false,
    logs: [],
  };
  if (!hero || hero.dead || amount <= 0) return { campaign, resolution: noop };

  // Phase 8A：Quirk 前置修正器（healing-received）
  const mod = applyQuirkModifiers(campaign, hero.instanceId, 'healing-received', Math.floor(amount));
  const modifiedAmount = mod.amount;
  if (modifiedAmount <= 0) {
    const c = mod.applied.length
      ? pushLog(campaign, `${hero.name} 的治疗被怪癖完全抵消${describeModifierApplications(mod.applied)}。`, 'info')
      : campaign;
    return { campaign: c, resolution: noop };
  }
  if (mod.applied.length > 0) {
    campaign = pushLog(
      campaign,
      `${hero.name} 接受治疗 ${amount} → ${modifiedAmount}${describeModifierApplications(mod.applied)}。`,
      'info'
    );
  }

  const nextHp = Math.min(hero.maxLife, previousHp + modifiedAmount);
  const healed = nextHp - previousHp;
  if (healed <= 0) return { campaign, resolution: noop };

  const leftDeathsDoor = hero.atDeathsDoor && healed >= 1;
  let c: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === targetId
        ? { ...h, wounds: h.maxLife - nextHp, atDeathsDoor: leftDeathsDoor ? false : h.atDeathsDoor }
        : h
    ),
  };
  if (leftDeathsDoor) {
    c = pushLog(c, `${hero.name} 恢复 ${healed} HP，脱离 Death's Door！`, 'success');
  }
  return {
    campaign: c,
    resolution: {
      targetId,
      previousHp,
      nextHp,
      healed,
      leftDeathsDoor,
      logs: leftDeathsDoor ? [`${hero.name} 脱离 Death's Door`] : [],
    },
  };
}
