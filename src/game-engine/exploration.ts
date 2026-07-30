import type { CampaignState, ExplorationEventResult, ProvisionPool } from '../types';
import { EXPLORATION_EVENTS } from '../data/exploration-events';
import { createId, pick } from './random';
import { pushLog } from './log';
import { resolveDamage } from './damage';

/** 根据事件类型扣减对应补给（不降级为负值）。 */
function consumeProvision(
  provisions: ProvisionPool,
  type: keyof ProvisionPool,
  amount = 1
): ProvisionPool {
  const current = provisions[type];
  return { ...provisions, [type]: Math.max(0, current - amount) };
}

/** 探索伤害统一入口：Phase 6 所有探索来源伤害必须经过 resolveDamage。 */
function dealExplorationDamage(
  campaign: CampaignState,
  heroInstanceId: string,
  amount: number,
  sourceType: 'trap' | 'exploration'
): CampaignState {
  const { campaign: next } = resolveDamage(campaign, {
    targetId: heroInstanceId,
    amount,
    sourceType,
    eventId: createId('devt'),
  });
  return next;
}

/**
 * 应用某个确定的探索事件结果（纯函数，自包含：同时处理英雄效果与补给扣减，便于测试）。
 * 不引入随机性：具体事件由调用方决定。
 * Phase 6：所有 Wound 类伤害改走 resolveDamage 统一管线（Death's Door / Deathblow 生效）。
 */
export function applyExplorationResult(
  campaign: CampaignState,
  result: ExplorationEventResult
): CampaignState {
  let next: CampaignState = campaign;

  switch (result) {
    case 'none':
      return pushLog(next, '移动中无事发生，队伍安全通过走廊。', 'info');

    case 'hunger': {
      if (next.provisions.food > 0) {
        next = { ...next, provisions: consumeProvision(next.provisions, 'food', 1) };
        return pushLog(next, '饥饿：消耗 1 Food。', 'info');
      }
      for (const h of next.heroes.filter((x) => !x.dead)) {
        next = dealExplorationDamage(next, h.instanceId, 1, 'exploration');
      }
      return pushLog(next, '饥饿且补给耗尽，全队各受 1 伤害！', 'danger');
    }

    case 'trap': {
      if (next.provisions.tool > 0) {
        next = { ...next, provisions: consumeProvision(next.provisions, 'tool', 1) };
        return pushLog(next, '走廊陷阱：消耗 1 Tool 将其拆除。', 'warning');
      }
      const victim = pick(next.heroes.filter((h) => !h.dead));
      if (victim) next = dealExplorationDamage(next, victim.instanceId, 1, 'trap');
      next = {
        ...next,
        heroes: next.heroes.map((h) => (h.dead ? h : { ...h, stress: h.stress + 1 })),
      };
      return pushLog(next, '走廊陷阱且缺乏 Tool，随机英雄受 1 伤害，全队压力 +1！', 'danger');
    }

    case 'darkness':
      if (next.provisions.torch > 0) {
        next = { ...next, provisions: consumeProvision(next.provisions, 'torch', 1) };
        return pushLog(next, '黑暗：消耗 1 Torch 照明。', 'info');
      }
      next = {
        ...next,
        heroes: next.heroes.map((h) => (h.dead ? h : { ...h, stress: h.stress + 1 })),
      };
      return pushLog(next, '黑暗且缺乏 Torch，全队压力 +1！', 'warning');

    case 'rubble': {
      if (next.provisions.tool > 0) {
        next = { ...next, provisions: consumeProvision(next.provisions, 'tool', 1) };
        return pushLog(next, '碎石：消耗 1 Tool 清理通路。', 'info');
      }
      const victim = pick(next.heroes.filter((h) => !h.dead));
      if (victim) next = dealExplorationDamage(next, victim.instanceId, 1, 'exploration');
      next = {
        ...next,
        heroes: next.heroes.map((h) => (h.dead ? h : { ...h, stress: h.stress + 1 })),
      };
      return pushLog(next, '碎石且缺乏 Tool，随机英雄受 1 伤害，全队压力 +1！', 'danger');
    }

    default:
      return campaign;
  }
}

/**
 * 移动前触发一次随机探索事件：随机选事件后应用其效果与补给扣减。
 */
export function resolveExplorationEvent(campaign: CampaignState): CampaignState {
  const chosen = pick(EXPLORATION_EVENTS);
  return applyExplorationResult(campaign, chosen.result);
}
