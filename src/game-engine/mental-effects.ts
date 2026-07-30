// Phase 7：精神效果执行器（Battle → Hero Turn → Start of Turn 检定）。
// 数据驱动：按 ResolveEffectDefinition.effects 顺序执行，不为单张卡写 if/else。
// 调用要求（文档 11.3）：
// - Stress 增减走 applyStress/recoverStress；HP 伤害走 Phase 6 applyBattleUnitDamage；
// - HP 治疗走 applyBattleUnitHealing；补给消耗走 provisions；位移检查合法站位；
// - 任一效果导致永久死亡后立即停止剩余效果。
// 幂等：unit.mentalEffectResolvedTurnId 记录已处理回合键，刷新/重复调用不重掷。

import type {
  BattleUnit,
  CampaignState,
  GameLogEntry,
  ProvisionPool,
  ResolveEffect,
  ResolveEffectDefinition,
} from '../types';
import { createId, d10, nowIso, pick } from './random';
import { pushLog } from './log';
import { pushMentalEvent } from './mental-log';
import { applyStress, recoverStress } from './stress';
import { applyBattleUnitDamage } from './damage';
import { applyBattleUnitHealing } from './healing';
import { currentTurnKey } from './battle';
import { getVirtueById } from '../data/virtues';
import { getAfflictionById } from '../data/afflictions';

/** 向进行中战斗追加日志（battle.ts 的 pushBattleLog 为私有，这里等价实现）。 */
function pushBattleLogOnCampaign(
  campaign: CampaignState,
  message: string,
  kind: GameLogEntry['kind'] = 'info'
): CampaignState {
  if (!campaign.battle) return campaign;
  const entry: GameLogEntry = { id: createId('blog'), at: nowIso(), message, kind };
  return {
    ...campaign,
    battle: { ...campaign.battle, battleLog: [...campaign.battle.battleLog, entry].slice(-100) },
  };
}

function setBattleUnit(campaign: CampaignState, unit: BattleUnit): CampaignState {
  if (!campaign.battle) return campaign;
  const b = campaign.battle;
  return {
    ...campaign,
    battle:
      unit.side === 'hero'
        ? { ...b, heroes: b.heroes.map((u) => (u.id === unit.id ? unit : u)) }
        : { ...b, monsters: b.monsters.map((u) => (u.id === unit.id ? unit : u)) },
  };
}

/** 查找当前精神检定对应的卡牌定义。 */
function getCardForUnit(unit: BattleUnit): ResolveEffectDefinition | undefined {
  if (unit.resolveState === 'virtuous' && unit.virtueId) return getVirtueById(unit.virtueId);
  if (unit.resolveState === 'afflicted' && unit.afflictionId) return getAfflictionById(unit.afflictionId);
  return undefined;
}

/**
 * 执行卡牌效果序列。每步执行后检查英雄是否死亡（永久死亡立即停止）。
 * 返回更新后的 campaign。
 */
function executeResolveEffects(
  campaign: CampaignState,
  unitId: string,
  card: ResolveEffectDefinition,
  questId: string
): CampaignState {
  let c = campaign;

  const findUnit = (): BattleUnit | undefined =>
    c.battle?.heroes.find((u) => u.id === unitId);
  const findHero = () => {
    const u = findUnit();
    return u ? c.heroes.find((h) => h.instanceId === u.sourceId) : undefined;
  };

  for (const effect of card.effects) {
    const unit = findUnit();
    const hero = findHero();
    // 永久死亡（Heart Attack / Deathblow）→ 立即停止剩余效果
    if (!unit || !hero || hero.dead || !unit.isAlive) break;

    c = executeSingleEffect(c, unit, hero.instanceId, effect, card, questId);
  }
  return c;
}

function executeSingleEffect(
  campaign: CampaignState,
  unit: BattleUnit,
  heroInstanceId: string,
  effect: ResolveEffect,
  card: ResolveEffectDefinition,
  questId: string
): CampaignState {
  let c = campaign;
  const heroName = unit.name;

  switch (effect.type) {
    case 'stress-self': {
      if (effect.amount >= 0) {
        // 正数走 applyStress（可能触发 Heart Attack —— 已 Resolve 过的英雄再达 10）
        const out = applyStress(c, {
          heroId: heroInstanceId,
          amount: effect.amount,
          sourceType: 'resolve-effect',
          sourceId: card.id,
          questId,
          battleId: c.battle?.battleId,
        });
        c = out.campaign;
      } else {
        // 负数必须路由到 recoverStress（文档 10.1 Stalwart 说明）
        const out = recoverStress(c, {
          heroId: heroInstanceId,
          amount: -effect.amount,
          sourceType: 'resolve-effect',
          sourceId: card.id,
          questId,
        });
        c = out.campaign;
      }
      break;
    }
    case 'stress-allies': {
      const allies = c.heroes.filter((h) => !h.dead && h.instanceId !== heroInstanceId);
      for (const ally of allies) {
        if (effect.amount >= 0) {
          const out = applyStress(c, {
            heroId: ally.instanceId,
            amount: effect.amount,
            sourceType: 'resolve-effect',
            sourceId: card.id,
            questId,
            battleId: c.battle?.battleId,
          });
          c = out.campaign;
        } else {
          const out = recoverStress(c, {
            heroId: ally.instanceId,
            amount: -effect.amount,
            sourceType: 'resolve-effect',
            sourceId: card.id,
            questId,
          });
          c = out.campaign;
        }
      }
      break;
    }
    case 'heal-self': {
      // 复用 Phase 6 战斗治疗管线（不可复活 dead hero —— 上层已保证存活）
      const outcome = applyBattleUnitHealing(unit, effect.amount);
      c = setBattleUnit(c, outcome.unit);
      if (outcome.healed > 0) {
        c = pushBattleLogOnCampaign(c, `${heroName} 因 ${card.name} 恢复 ${outcome.healed} HP。`, 'success');
        for (const m of outcome.logs) c = pushBattleLogOnCampaign(c, m, 'success');
      }
      break;
    }
    case 'damage-self': {
      // 复用 Phase 6 伤害 / Death's Door / Deathblow 管线
      const outcome = applyBattleUnitDamage(unit, effect.amount);
      let u = outcome.unit;
      if (outcome.heroDied) u = { ...u, deathCause: 'deathblow-periodic' };
      c = setBattleUnit(c, u);
      c = pushBattleLogOnCampaign(
        c,
        `${heroName} 因 ${card.name} 受到 ${effect.amount} 点伤害。`,
        outcome.heroDied ? 'danger' : 'warning'
      );
      for (const m of outcome.logs) c = pushBattleLogOnCampaign(c, m, outcome.heroDied ? 'danger' : 'warning');
      break;
    }
    case 'temporary-damage-bonus': {
      c = setBattleUnit(c, { ...unit, turnDamageBonus: (unit.turnDamageBonus ?? 0) + effect.amount });
      c = pushBattleLogOnCampaign(c, `${heroName} 因 ${card.name} 本回合伤害 +${effect.amount}。`, 'success');
      break;
    }
    case 'temporary-accuracy-bonus': {
      c = setBattleUnit(c, { ...unit, turnAccuracyBonus: (unit.turnAccuracyBonus ?? 0) + effect.amount });
      c = pushBattleLogOnCampaign(c, `${heroName} 因 ${card.name} 本回合命中 +${effect.amount}。`, 'success');
      break;
    }
    case 'consume-provision': {
      let consumed = 0;
      let provisions: ProvisionPool = { ...c.provisions };
      for (let i = 0; i < effect.amount; i++) {
        const keys = (Object.keys(provisions) as (keyof ProvisionPool)[]).filter((k) => provisions[k] > 0);
        if (keys.length === 0) break;
        const key = effect.selection === 'food-first' && provisions.food > 0 ? 'food' : pick(keys);
        provisions = { ...provisions, [key]: provisions[key] - 1 };
        consumed += 1;
        c = pushBattleLogOnCampaign(c, `${heroName} 因 ${card.name} 消耗了 1 件补给（${key}）。`, 'warning');
      }
      if (consumed === 0) {
        c = pushBattleLogOnCampaign(c, `${heroName} 想独占补给，但补给已耗尽。`, 'info');
      } else {
        c = { ...c, provisions };
      }
      break;
    }
    case 'lose-action-points': {
      if (c.battle) {
        c = {
          ...c,
          battle: {
            ...c.battle,
            pendingActionPointPenalty: (c.battle.pendingActionPointPenalty ?? 0) + Math.max(0, effect.amount),
          },
        };
      }
      break;
    }
    case 'move-self': {
      if (!c.battle) break;
      const dirs: (1 | -1)[] =
        effect.direction === 'forward' ? [-1] : effect.direction === 'backward' ? [1] : d10() <= 5 ? [-1, 1] : [1, -1];
      let moved = false;
      for (const dir of dirs) {
        const np = unit.position + dir * effect.distance;
        if (np < 1 || np > 4) continue;
        if (c.battle.heroes.some((h) => h.id !== unit.id && h.isAlive && h.position === np)) continue;
        c = setBattleUnit(c, { ...unit, position: np });
        c = pushBattleLogOnCampaign(c, `${heroName} 因 ${card.name} 移动到位置 ${np}。`, 'warning');
        moved = true;
        break;
      }
      if (!moved) {
        // 无合法位置：仅写日志，不阻塞（文档 10.2 Irrational 说明）
        c = pushBattleLogOnCampaign(c, `${heroName} 惊惶失措，但无处可动。`, 'info');
      }
      break;
    }
    case 'log-only': {
      c = pushBattleLogOnCampaign(c, effect.message, 'info');
      break;
    }
  }
  return c;
}

export interface TurnStartMentalOutput {
  campaign: CampaignState;
  /** 是否进行了检定（false = 前置条件不满足 / 已处理过）。 */
  checked: boolean;
  roll?: number;
  triggered?: boolean;
  cardId?: string;
}

/**
 * Battle 英雄回合开始的精神效果检定（campaign 层唯一入口）。
 * 前置条件（文档 11.1）：battle active + pendingMentalCheck + 当前 actor 为存活英雄 +
 * resolveState !== 'normal' + 当前 turnId 未处理。
 * 流程：取卡 → 掷 d10 → 区间内执行效果 / 区间外 missed → 标记 turnId 已处理。
 * 本函数不恢复战斗回合 —— 调用方（store）随后调用 resumeTurnAfterMentalCheck。
 */
export function resolveTurnStartMentalEffect(campaign: CampaignState): TurnStartMentalOutput {
  const b = campaign.battle;
  if (!b || b.status !== 'active' || !b.pendingMentalCheck || !b.activeActorId) {
    return { campaign, checked: false };
  }
  const unit = b.heroes.find((u) => u.id === b.activeActorId);
  if (!unit || !unit.isAlive || unit.side !== 'hero' || unit.resolveState === 'normal') {
    return { campaign, checked: false };
  }
  const turnKey = currentTurnKey(b);
  if (!turnKey || unit.mentalEffectResolvedTurnId === turnKey) {
    return { campaign, checked: false };
  }
  const hero = campaign.heroes.find((h) => h.instanceId === unit.sourceId);
  if (!hero || hero.dead) return { campaign, checked: false };
  const questId = campaign.currentQuestId ?? 'unknown-quest';

  const card = getCardForUnit(unit);
  // 先标记已处理（即使卡牌缺失也不重复检定）
  let c = setBattleUnit(campaign, { ...unit, mentalEffectResolvedTurnId: turnKey });

  if (!card) {
    c = pushLog(c, `[开发] ${unit.name} 的精神卡牌数据缺失（${unit.virtueId ?? unit.afflictionId}）。`, 'warning');
    return { campaign: c, checked: true, triggered: false };
  }

  const roll = d10();
  const triggered = roll >= card.triggerRollMin && roll <= card.triggerRollMax;

  c = pushBattleLogOnCampaign(
    c,
    `${unit.name} 回合开始检定 ${card.name}：d10 = ${roll}${triggered ? '，触发！' : '，未触发。'}`,
    triggered ? (card.type === 'virtue' ? 'success' : 'warning') : 'info'
  );

  const ev = pushMentalEvent(c, {
    questId,
    heroId: hero.instanceId,
    type: triggered ? 'resolve-effect-triggered' : 'resolve-effect-missed',
    sourceType: 'resolve-effect',
    sourceId: card.id,
    roll,
    resultId: card.id,
  });
  c = ev.campaign;

  if (triggered) {
    c = executeResolveEffects(c, unit.id, card, questId);
  }

  return { campaign: c, checked: true, roll, triggered, cardId: card.id };
}

/**
 * 消费战斗内累计的压力事件（store 每次战斗 commit 后调用）：
 * 正数走 applyStress（batchId = 事件 id，天然幂等），负数走 recoverStress。
 * BattleUnit 的 stress 已由战斗引擎即时更新展示值；本函数把变化落到
 * CampaignHero 并统一处理阈值（Resolve Test / Heart Attack），最后清空队列。
 */
export function processBattleStressEvents(campaign: CampaignState): CampaignState {
  const b = campaign.battle;
  if (!b || !b.pendingStressEvents || b.pendingStressEvents.length === 0) return campaign;

  const questId = campaign.currentQuestId ?? 'unknown-quest';
  let c: CampaignState = { ...campaign, battle: { ...b, pendingStressEvents: [] } };

  for (const ev of b.pendingStressEvents) {
    if (ev.amount > 0) {
      const out = applyStress(c, {
        heroId: ev.heroInstanceId,
        amount: ev.amount,
        sourceType: ev.sourceType,
        sourceId: ev.sourceId,
        questId,
        battleId: b.battleId,
        batchId: ev.id,
      });
      c = out.campaign;
    } else if (ev.amount < 0) {
      const out = recoverStress(c, {
        heroId: ev.heroInstanceId,
        amount: -ev.amount,
        sourceType: ev.sourceType,
        sourceId: ev.sourceId,
        questId,
      });
      c = out.campaign;
    }
  }
  return c;
}
