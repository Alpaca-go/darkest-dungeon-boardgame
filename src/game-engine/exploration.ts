import type { CampaignState, ExplorationEventResult, ProvisionPool, RuleEventType } from '../types';
import { EXPLORATION_EVENTS } from '../data/exploration-events';
import { ALL_DISEASES } from '../data/diseases';
import { createId, d10, pick } from './random';
import { pushLog } from './log';
import { resolveDamage } from './damage';
import { applyStressBatch } from './stress';
import { createRuleEventContext, emitPartyRuleEvent } from './quirks';
import { acquireDisease } from './diseases/acquire-disease';

/**
 * Phase 8B：向全体存活英雄发射一个探索时机事件。
 * 每次调用建立独立根上下文 —— 不同探索事件之间互不共享循环保护。
 */
function emitExplorationEvent(campaign: CampaignState, type: RuleEventType): CampaignState {
  return emitPartyRuleEvent(campaign, type, createRuleEventContext());
}

/**
 * Phase 7：全队压力统一入口（存活英雄各 +amount，经统一管线处理阈值）。
 * 同一次事件共用一个 batchId（幂等保护）。
 */
function applyPartyStress(
  campaign: CampaignState,
  amount: number,
  sourceId: string
): CampaignState {
  const batchId = createId('sbatch');
  const inputs = campaign.heroes
    .filter((h) => !h.dead)
    .map((h) => ({
      heroId: h.instanceId,
      amount,
      sourceType: 'exploration' as const,
      sourceId,
      questId: campaign.currentQuestId ?? '',
      batchId,
    }));
  return applyStressBatch(campaign, inputs).campaign;
}

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
        next = pushLog(next, '饥饿：消耗 1 Food。', 'info');
        // Phase 8B：Bulimic —— 消耗 Food 时额外丢弃 1 份并 +1 Stress
        next = emitExplorationEvent(next, 'food-consumed');
        // Phase 8B：Tapeworm —— 处理 Hunger 时施加 Bleed
        return emitExplorationEvent(next, 'hunger-resolved');
      }
      for (const h of next.heroes.filter((x) => !x.dead)) {
        next = dealExplorationDamage(next, h.instanceId, 1, 'exploration');
      }
      next = pushLog(next, '饥饿且补给耗尽，全队各受 1 伤害！', 'danger');
      return emitExplorationEvent(next, 'hunger-resolved');
    }

    case 'trap': {
      if (next.provisions.tool > 0) {
        next = { ...next, provisions: consumeProvision(next.provisions, 'tool', 1) };
        return pushLog(next, '走廊陷阱：消耗 1 Tool 将其拆除。', 'warning');
      }
      const victim = pick(next.heroes.filter((h) => !h.dead));
      if (victim) next = dealExplorationDamage(next, victim.instanceId, 1, 'trap');
      next = applyPartyStress(next, 1, 'corridor-trap');
      return pushLog(next, '走廊陷阱且缺乏 Tool，随机英雄受 1 伤害，全队压力 +1！', 'danger');
    }

    case 'darkness':
      if (next.provisions.torch > 0) {
        next = { ...next, provisions: consumeProvision(next.provisions, 'torch', 1) };
        return pushLog(next, '黑暗：消耗 1 Torch 照明。', 'info');
      }
      next = applyPartyStress(next, 1, 'darkness');
      return pushLog(next, '黑暗且缺乏 Torch，全队压力 +1！', 'warning');

    case 'rubble': {
      if (next.provisions.tool > 0) {
        next = { ...next, provisions: consumeProvision(next.provisions, 'tool', 1) };
        next = pushLog(next, '碎石：消耗 1 Tool 清理通路。', 'info');
        // Phase 8B：Creeping Cough —— 处理 Rubble 时施加 Bleed
        return emitExplorationEvent(next, 'rubble-resolved');
      }
      const victim = pick(next.heroes.filter((h) => !h.dead));
      if (victim) next = dealExplorationDamage(next, victim.instanceId, 1, 'exploration');
      next = applyPartyStress(next, 1, 'rubble');
      next = pushLog(next, '碎石且缺乏 Tool，随机英雄受 1 伤害，全队压力 +1！', 'danger');
      return emitExplorationEvent(next, 'rubble-resolved');
    }

    // Phase 8B：感染来源之一（探索事件）
    case 'contaminated-remains': {
      if (next.provisions.torch > 0) {
        next = { ...next, provisions: consumeProvision(next.provisions, 'torch', 1) };
        return pushLog(next, '污秽遗骸：消耗 1 Torch 焚毁，队伍未受感染。', 'info');
      }
      const alive = next.heroes.filter((h) => !h.dead);
      const victim = pick(alive);
      if (!victim) return pushLog(next, '污秽遗骸：无人可被感染。', 'info');
      const roll = d10();
      if (roll > 4) {
        return pushLog(
          next,
          `污秽遗骸：${victim.name} 掷出 ${roll}（>4），侥幸未被感染。`,
          'warning'
        );
      }
      const disease = pick(ALL_DISEASES);
      next = pushLog(
        next,
        `污秽遗骸：${victim.name} 掷出 ${roll}（≤4），被感染！`,
        'danger'
      );
      return acquireDisease(next, {
        heroId: victim.instanceId,
        diseaseId: disease.id,
        source: 'exploration-event',
        sourceEventId: createId('dexp'),
        questId: next.currentQuestId,
        deathSource: 'exploration',
        deathResumePhase: 'dungeon-explore',
      }).campaign;
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
