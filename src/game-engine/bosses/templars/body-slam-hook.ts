// Phase 10B §14：Body Slam 命中钩子（Pit Toss 的**唯一**合法来源）。
//
// 硬约束对照：
// - 硬约束 6 / §14.1：只有「Impaler 使用 Body Slam 且命中了 Hero」才触发 Pit Toss；
//   Warlord 的技能、Impaler 的其他技能、命中怪物、Miss —— 一律不触发；
// - 硬约束 7 / §14.3：**Miss 不掷 d10** —— 本模块在 hit === false 时直接返回，
//   连 Pit Toss 事务都不会创建，更不会消耗随机数；
// - 硬约束 8 / §9：Pit 的伤害 / 效果**不在 Skill 上**——
//   Body Slam 只声明 `trigger-pit-toss`，具体效果由 Room Definition 提供。

import type { BodySlamHitEvent, TemplarSkillDefinition, TemplarsEncounterState } from '../../../types/templars';
import { createId, nowIso } from '../../random';
import { getTemplarSkillTable, templarsTransactionIds, withProcessedTemplarsTransaction } from './templars-runtime';

export interface EvaluateBodySlamHookParams {
  state: TemplarsEncounterState;
  /** 使用技能的 Templar Actor（战斗单位 id）。 */
  sourceActorId: string;
  /** 使用的 Skill Definition id。 */
  skillId: string;
  /** 被攻击的目标（Hero 用 instanceId）。 */
  targetActorId: string;
  targetIsHero: boolean;
  /** 命中判定结果（由既有战斗管线给出，本模块不重掷）。 */
  hit: boolean;
  /** 技能结算事件 id（幂等键的一部分）。 */
  skillEventId: string;
  now?: string;
}

export interface BodySlamHookResult {
  /** 是否应当发起 Pit Toss 事务。 */
  shouldTriggerPitToss: boolean;
  state: TemplarsEncounterState;
  event: BodySlamHitEvent | null;
  alreadyRecorded: boolean;
  /** 未触发时的具体原因（用于日志与测试断言）。 */
  reason: string | null;
}

/** 该技能是否声明了 `trigger-pit-toss` 命中钩子（§14.1）。 */
export function skillTriggersPitToss(skill: TemplarSkillDefinition): boolean {
  return skill.onHitEffects.some((e) => e.type === 'trigger-pit-toss' && e.target === 'hit-hero');
}

/**
 * 评估一次技能命中是否触发 Pit Toss。
 *
 * 触发条件（四者缺一不可）：
 * 1. 来源是 **Impaler**（role === 'impaler'）；
 * 2. 使用的技能在 Definition 中声明了 `trigger-pit-toss`；
 * 3. 目标是 **Hero**；
 * 4. **命中**。
 *
 * 无论是否触发，都会写一条 BodySlamHitEvent 便于审计；
 * 但 `hit === false` 时 `shouldTriggerPitToss` 恒为 false，且**绝不掷 d10**。
 */
export function evaluateBodySlamHook(params: EvaluateBodySlamHookParams): BodySlamHookResult {
  const { state, sourceActorId, skillId, targetActorId, targetIsHero, hit, skillEventId } = params;

  const transactionId = templarsTransactionIds.bodySlamHit(state.battleId, skillEventId);
  const existing = state.bodySlamHitEvents.find((e) => e.transactionId === transactionId);
  if (existing) {
    return {
      shouldTriggerPitToss: existing.hit && existing.targetIsHero,
      state,
      event: existing,
      alreadyRecorded: true,
      reason: null,
    };
  }

  const actor = state.actorStates.find((a) => a.actorId === sourceActorId);
  if (!actor) {
    return notTriggered(state, `找不到 Templar Actor ${sourceActorId}`);
  }

  // 条件 1：必须是 Impaler。
  if (actor.role !== 'impaler') {
    return notTriggered(state, `${actor.name} 不是 Impaler，其技能不会触发 Pit Toss`);
  }

  const skill = getTemplarSkillTable(state, sourceActorId).find((s) => s.id === skillId);
  if (!skill) {
    return notTriggered(state, `找不到 Skill ${skillId}`);
  }

  // 条件 2：技能必须声明 trigger-pit-toss（Impaler 的其他技能不触发）。
  if (!skillTriggersPitToss(skill)) {
    return notTriggered(state, `${skill.name} 未声明 trigger-pit-toss`);
  }

  // 条件 3：目标必须是 Hero。
  if (!targetIsHero) {
    return notTriggered(state, '目标不是 Hero，Pit Toss 不触发');
  }

  const event: BodySlamHitEvent = {
    id: createId('bshe'),
    battleId: state.battleId,
    skillEventId,
    sourceActorId,
    skillId,
    targetActorId,
    targetIsHero,
    hit,
    transactionId,
    createdAt: params.now ?? nowIso(),
  };

  const nextState = withProcessedTemplarsTransaction(
    { ...state, bodySlamHitEvents: [...state.bodySlamHitEvents, event].slice(-200) },
    transactionId,
  );

  // 条件 4：Miss 不触发，也不掷 d10（硬约束 7）。
  if (!hit) {
    return {
      shouldTriggerPitToss: false,
      state: nextState,
      event,
      alreadyRecorded: false,
      reason: 'Body Slam 未命中：不触发 Pit Toss，不掷 d10',
    };
  }

  return { shouldTriggerPitToss: true, state: nextState, event, alreadyRecorded: false, reason: null };
}

function notTriggered(state: TemplarsEncounterState, reason: string): BodySlamHookResult {
  return { shouldTriggerPitToss: false, state, event: null, alreadyRecorded: false, reason };
}
