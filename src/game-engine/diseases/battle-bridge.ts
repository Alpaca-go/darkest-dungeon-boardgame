// Phase 8B：战斗队列 → Campaign 层结算的桥接。
//
// 战斗引擎（battle.ts）是纯 BattleState 函数，无法访问 Disease / 死亡记录 / Quirk 状态机，
// 因此只负责「排队」：
//   - pendingRuleEvents        —— hero-move-action-resolved（Lethargy）/ hero-shuffled（Vertigo）
//   - pendingDiseaseInfections —— 怪物技能 diseaseChance 命中
// 本模块由 store 的 settleBattle 在每次战斗推进后调用，把队列路由到统一管线。
//
// 与 processBattleStressEvents 保持一致的约定：先清空队列再逐条结算，
// 避免结算过程中产生的新事件被同一轮重复消费。

import type { CampaignState } from '../../types';
import { createRuleEventContext, emitRuleEvent } from '../quirks';
import { acquireDisease } from './acquire-disease';
import { syncHeroMentalToBattle } from '../mental-log';

/**
 * 消费战斗内累计的规则事件（Lethargy / Vertigo 等）。
 * 每条事件建立独立的根上下文 —— 它们是彼此独立的时机，
 * 不应共享循环保护（否则同一回合的第二次 Move 不会触发 Lethargy）。
 */
export function processBattleRuleEvents(campaign: CampaignState): CampaignState {
  const b = campaign.battle;
  if (!b || !b.pendingRuleEvents || b.pendingRuleEvents.length === 0) return campaign;

  const queued = b.pendingRuleEvents;
  let c: CampaignState = { ...campaign, battle: { ...b, pendingRuleEvents: [] } };

  for (const ev of queued) {
    const hero = c.heroes.find((h) => h.instanceId === ev.heroInstanceId);
    if (!hero || hero.dead) continue;
    c = emitRuleEvent(
      c,
      { type: ev.type, heroId: ev.heroInstanceId },
      createRuleEventContext()
    );
    c = syncHeroMentalToBattle(c, ev.heroInstanceId);
  }
  return c;
}

/**
 * 消费战斗内累计的感染事件。
 * 统一走 acquireDisease（含替换 / Negative Quirk / Madness Death 与幂等）。
 */
export function processBattleDiseaseInfections(campaign: CampaignState): CampaignState {
  const b = campaign.battle;
  if (!b || !b.pendingDiseaseInfections || b.pendingDiseaseInfections.length === 0) {
    return campaign;
  }

  const queued = b.pendingDiseaseInfections;
  let c: CampaignState = { ...campaign, battle: { ...b, pendingDiseaseInfections: [] } };

  for (const inf of queued) {
    c = acquireDisease(c, {
      heroId: inf.heroInstanceId,
      diseaseId: inf.diseaseId,
      source: 'monster-skill',
      sourceEventId: inf.id,
      questId: c.currentQuestId,
      deathSource: 'battle',
      deathResumePhase: 'dungeon-explore',
    }).campaign;
  }
  return c;
}
