// Phase 10C §12：Conditional Linked Actor Summon Override。
//
// 规则书 verified（§2.4）：
//   「若 Mammoth Cyst 行动时场上没有 White Cell Stalk，它会召唤一个 —— 该召唤**取代**它本次的普通 Skill」。
//
// 硬约束对照：
// - 硬约束 4：**只有** aliveStalkCount === 0 时才触发召唤，其余情况一律走普通 Skill；
// - 硬约束 5：召唤**完全替代**本次普通 Skill —— 被覆盖的行动**不掷 d10 Skill 骰**、
//   不选目标、不结算伤害；
// - 硬约束 8：maxAlive = 1 —— 场上已有 Stalk 时绝不追加第二个；
// - 硬约束 6：Stalk 死亡**不立即**重召唤 —— 重召唤只可能发生在**下一次 Cyst 行动**，
//   由本模块在那一刻重新判定条件；
// - 本模块是**纯查询**（不改状态），实际召唤由 summon-white-cell-stalk.ts 的原子事务执行。

import type { DataMode } from '../../../types/progression';
import type {
  ConditionalLinkedActorSummon,
  MammothCystEncounterState,
  MammothCystInitiativeCard,
} from '../../../types/mammoth-cyst';
import { getMammothCystSummonDefinition } from '../../../data/darkest-dungeon/mammoth-cyst/mammoth-cyst-registry';
import { COMMUNITY_MAMMOTH_CYST_SUMMON } from '../../../data/darkest-dungeon/community-reference/production-adapters';
import { getAliveWhiteCellStalkCount, getMammothCystActorState } from './mammoth-cyst-runtime';

/** Cyst 一次行动的最终类型。 */
export type MammothCystActionType = 'summon-linked-actor' | 'normal-skill' | 'none';

export interface MammothCystActionDecision {
  ok: boolean;
  actionType: MammothCystActionType;
  /** 是否覆盖了普通 Skill（硬约束 5 的显式标记，供日志 / UI / 测试断言）。 */
  replacedNormalSkill: boolean;
  /** 触发覆盖时使用的 Summon Definition。 */
  summonDefinition: ConditionalLinkedActorSummon | null;
  aliveStalkCount: number;
  /** 决策依据（用于战斗日志）。 */
  explanation: string;
  reason: string | null;
}

/**
 * 判断条件是否成立（§12 唯一依据：`aliveStalkCount === 0`）。
 *
 * 刻意不看 summonHistory / generation / 回合数 —— 任何「本场已召唤过就不再召唤」
 * 之类的额外限制都属于规则外推测。
 */
export function isConditionalSummonConditionMet(
  state: MammothCystEncounterState,
  summon: ConditionalLinkedActorSummon,
): boolean {
  if (summon.condition.type !== 'no-alive-actors-with-tag') return false;
  if (summon.condition.tag !== 'white-cell-stalk') return false;
  return getAliveWhiteCellStalkCount(state) === 0;
}

/**
 * 为一张 Initiative Card 决定 Cyst 的行动类型（§12）。
 *
 * 调用顺序约定：**必须先于** `rollMammothCystSkill` 调用 ——
 * 若返回 `summon-linked-actor`，调用方不得再掷 Skill 骰（硬约束 5）。
 *
 * Stalk 自己的 Initiative Card 永远走普通 Skill（Stalk 不召唤）。
 */
export function decideMammothCystAction(
  state: MammothCystEncounterState,
  card: MammothCystInitiativeCard,
  mode: DataMode | 'community-reference' = 'prototype',
): MammothCystActionDecision {
  const aliveStalkCount = getAliveWhiteCellStalkCount(state);
  const base = {
    summonDefinition: null,
    aliveStalkCount,
  };

  const actor = getMammothCystActorState(state, card.actorId);
  if (!actor) {
    return {
      ok: false,
      actionType: 'none',
      replacedNormalSkill: false,
      ...base,
      explanation: '',
      reason: `找不到 Actor ${card.actorId}`,
    };
  }
  if (!actor.isAlive) {
    return {
      ok: false,
      actionType: 'none',
      replacedNormalSkill: false,
      ...base,
      explanation: '',
      reason: `${actor.name} 已被击败，本张 Initiative Card 失效`,
    };
  }

  // Stalk 的行动永远是普通 Skill（含 Teleportation）——它不具备召唤能力。
  if (card.owner !== 'mammoth-cyst') {
    return {
      ok: true,
      actionType: 'normal-skill',
      replacedNormalSkill: false,
      ...base,
      explanation: `${actor.name} 执行普通 Skill。`,
      reason: null,
    };
  }

  const summon = mode === 'community-reference' ? COMMUNITY_MAMMOTH_CYST_SUMMON : getMammothCystSummonDefinition(mode);
  if (!summon) {
    // 正式 Summon Definition 缺失 → 不推测，退回普通 Skill（official 早已被 Data Gate 禁用）。
    return {
      ok: true,
      actionType: 'normal-skill',
      replacedNormalSkill: false,
      ...base,
      explanation: `${actor.name} 执行普通 Skill（Conditional Summon Definition 缺失，不做推测）。`,
      reason: null,
    };
  }

  // 硬约束 8：场上已有 Stalk（maxAlive = 1）→ 条件不成立 → 普通 Skill。
  if (!isConditionalSummonConditionMet(state, summon)) {
    return {
      ok: true,
      actionType: 'normal-skill',
      replacedNormalSkill: false,
      summonDefinition: summon,
      aliveStalkCount,
      explanation: `场上已有 ${aliveStalkCount} 个 White Cell Stalk（maxAlive=${summon.maxAlive}），${actor.name} 执行普通 Skill。`,
      reason: null,
    };
  }

  return {
    ok: true,
    actionType: 'summon-linked-actor',
    // 硬约束 5：字面量取自 Definition（replacesNormalSkill: true），不由引擎写死语义。
    replacedNormalSkill: summon.replacesNormalSkill,
    summonDefinition: summon,
    aliveStalkCount,
    explanation: `场上没有 White Cell Stalk，${actor.name} 的本次行动被召唤取代（不掷 Skill 骰）。`,
    reason: null,
  };
}

/**
 * 便捷断言：本次行动是否会跳过 Skill 掷骰。
 * 供 UI 与测试使用（硬约束 5 的可观测出口）。
 */
export function willSkipNormalSkillRoll(decision: MammothCystActionDecision): boolean {
  return decision.ok && decision.actionType === 'summon-linked-actor' && decision.replacedNormalSkill;
}
