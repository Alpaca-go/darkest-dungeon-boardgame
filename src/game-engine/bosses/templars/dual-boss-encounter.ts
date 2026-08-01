// Phase 10B §7 / §10：Dual Boss Encounter 通用装配。
//
// 硬约束对照：
// - 硬约束 2 / §10：Dual Boss **不是一个新 Actor**——本模块只登记
//   「哪两个已存在的独立 Boss Actor 属于同一个 Encounter」，
//   绝不创建第三个 Group Actor、也不给 Encounter 分配 HP / Initiative / 站位；
// - 硬约束 10 / §21：Victory Condition 必须 Definition 驱动，
//   Rule 缺失时不推测「击败任意一个即可」或「必须两个都击败」。

import type {
  DualBossEncounterDefinition,
  DualBossMemberDefinition,
  DualBossVictoryRule,
  TemplarRole,
} from '../../../types/dual-boss';
import type { TemplarsEncounterState } from '../../../types/templars';

/** TemplarsEncounterState.dualBossEncounterState 的构建结果类型别名。 */
export type DualBossEncounterRuntimeState = TemplarsEncounterState['dualBossEncounterState'];

/**
 * 由 Definition + 已创建的两个独立 Actor 装配 Encounter 运行时。
 *
 * 注意 memberActorIds 只是**引用**，不是新单位。
 */
export function buildDualBossEncounterState(
  definition: DualBossEncounterDefinition,
  victoryRule: DualBossVictoryRule | null,
  memberActorIds: string[],
): DualBossEncounterRuntimeState {
  return {
    encounterDefinitionId: definition.id,
    victoryCondition: definition.victoryCondition,
    victoryRule,
    memberActorIds: [...memberActorIds],
    resolvedVictory: false,
  };
}

/** 取指定角色的成员定义。 */
export function getDualBossMember(
  definition: DualBossEncounterDefinition,
  role: TemplarRole,
): DualBossMemberDefinition | null {
  return definition.bossMembers.find((m) => m.role === role) ?? null;
}

export interface DualBossStructureCheck {
  ok: boolean;
  issues: string[];
}

/**
 * 结构性检查（§7 / §10）：
 * 1. 恰好两名成员；
 * 2. 角色为 impaler + warlord 且不重复；
 * 3. 每名成员 2 张 Initiative；
 * 4. Stance 与角色匹配（Impaler = Aggressive、Warlord = Ranged）；
 * 5. 成员 Actor Definition ID 互不相同（防止「两张卡指向同一 Actor」）；
 * 6. **不存在** Group Actor —— 通过「memberActorIds 数量必须等于成员数」间接保证。
 */
export function checkDualBossStructure(
  definition: DualBossEncounterDefinition,
  memberActorIds: string[] = [],
): DualBossStructureCheck {
  const issues: string[] = [];

  if (definition.bossMembers.length !== 2) {
    issues.push('Dual Boss Encounter 必须恰好两名成员');
  }

  const roles = definition.bossMembers.map((m) => m.role);
  if (new Set(roles).size !== roles.length) issues.push('Dual Boss 成员角色重复');
  if (!roles.includes('impaler')) issues.push('缺少 Templar Impaler 成员');
  if (!roles.includes('warlord')) issues.push('缺少 Templar Warlord 成员');

  for (const member of definition.bossMembers) {
    if (member.initiativeCardsPerRound !== 2) {
      issues.push(`${member.role} 的 Initiative 数必须为 2`);
    }
    const expected = member.role === 'impaler' ? 'aggressive' : 'ranged';
    if (member.requiredStance !== expected) {
      issues.push(`${member.role} 的 Stance 必须为 ${expected}`);
    }
  }

  const defIds = definition.bossMembers.map((m) => m.actorDefinitionId);
  if (new Set(defIds).size !== defIds.length) {
    issues.push('两名成员指向同一个 Actor Definition（必须是两个独立 Boss Actor）');
  }

  if (memberActorIds.length > 0) {
    if (memberActorIds.length !== definition.bossMembers.length) {
      issues.push(
        `Actor 实例数 ${memberActorIds.length} 与成员数 ${definition.bossMembers.length} 不一致（疑似创建了 Group Actor）`,
      );
    }
    if (new Set(memberActorIds).size !== memberActorIds.length) {
      issues.push('两名成员共用同一个 Actor 实例');
    }
  }

  return { ok: issues.length === 0, issues };
}

/** Encounter 的成员是否全部已被击败（纯查询，不含 Victory Rule 语义）。 */
export function areAllDualBossMembersDefeated(state: TemplarsEncounterState): boolean {
  const ids = state.dualBossEncounterState.memberActorIds;
  if (ids.length === 0) return false;
  return ids.every((id) => state.actorStates.some((a) => a.actorId === id && !a.isAlive));
}
