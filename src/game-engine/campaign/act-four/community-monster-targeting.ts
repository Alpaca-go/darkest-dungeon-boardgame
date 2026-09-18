// Phase 11A.4R1 WP-4：Community Monster Target Resolver。
//
// 来源约束：
// - Guardian 卡的 accepted normalized 数据没有 per-skill 目标标注 → 使用 Core Rulebook
//   Monster targeting policy（rulebook:24）：「if more than one character qualifies as a
//   Target, prioritize by Stance (Aggressive → Support)」；
// - Stance 顺序取规则书 Stance Tracker 自上而下（与 summon STANCE_ORDER 同一来源）：
//   aggressive → ranged → defensive → support；
// - 同 Stance 平局必须**确定性**收尾：position（前排小序号优先）→ BattleUnit.id。
//   绝不按 heroes 数组顺序决定目标（WP-4 明文禁止），因此排序键不含数组下标；
// - skill 级合法目标约束：skill.validTargetPositions 之外的站位一律拒绝（非法目标
//   不得进入候选集）；
// - self-target（Revivify）/ ally-target（Reconstitute，来源指定 Mammoth Cyst）/
//   Hero-target（其余）按 skill 语义分派。

import type { BattleState, BattleUnit, MonsterSkillDefinition } from '../../../types';
import { communitySpecialSkillLeaf } from './community-guardian-special-skills';

/** 规则书 Stance Tracker 自上而下（rulebook:24 优先级顺序）。 */
export const COMMUNITY_TARGET_STANCE_PRIORITY = ['aggressive', 'ranged', 'defensive', 'support'] as const;

export type CommunityMonsterTargetKind = 'hero' | 'ally' | 'self';

export interface CommunityMonsterTarget {
  kind: CommunityMonsterTargetKind;
  unit: BattleUnit;
}

function stanceRank(unit: BattleUnit): number {
  const index = COMMUNITY_TARGET_STANCE_PRIORITY.indexOf(unit.stance as (typeof COMMUNITY_TARGET_STANCE_PRIORITY)[number]);
  return index === -1 ? COMMUNITY_TARGET_STANCE_PRIORITY.length : index;
}

/** 确定性排序键：Stance 优先级 → position → unit id（与数组顺序无关）。 */
export function compareCommunityTargetPriority(a: BattleUnit, b: BattleUnit): number {
  return stanceRank(a) - stanceRank(b) || a.position - b.position || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

/** 合法 Hero 目标：存活 + 站位在 skill 的 validTargetPositions 内。 */
export function legalCommunityHeroTargets(
  state: BattleState,
  skill?: Pick<MonsterSkillDefinition, 'validTargetPositions'> | null,
): BattleUnit[] {
  const validPositions = skill?.validTargetPositions;
  return state.heroes
    .filter((hero) => hero.isAlive)
    .filter((hero) => !validPositions || validPositions.length === 0 || validPositions.includes(hero.position))
    .sort(compareCommunityTargetPriority);
}

/**
 * 解析一次 Community Monster 行动的目标。
 *
 * 返回 null 表示没有合法目标（调用方记录并跳过攻击，绝不退化为数组第一项）。
 */
export function resolveCommunityMonsterTarget(
  state: BattleState,
  monster: BattleUnit,
  localSkillId: string,
  skill?: Pick<MonsterSkillDefinition, 'validTargetPositions'> | null,
): CommunityMonsterTarget | null {
  const leaf = communitySpecialSkillLeaf(localSkillId);

  if ('selfHeal' in leaf && leaf.selfHeal) {
    const self = state.monsters.find((candidate) => candidate.id === monster.id && candidate.isAlive);
    return self ? { kind: 'self', unit: self } : null;
  }

  if ('allyHeal' in leaf && leaf.allyHeal) {
    // 来源指定（Reconstitute → Mammoth Cyst）；死亡 / 不在场 → 无合法目标（绝不静默治疗别人）。
    const designated = 'allySourceId' in leaf && leaf.allySourceId
      ? state.monsters.find((candidate) => candidate.sourceId === leaf.allySourceId && candidate.isAlive && candidate.id !== monster.id)
      : null;
    if (designated) return { kind: 'ally', unit: designated };
    if ('allySourceId' in leaf && leaf.allySourceId) return null;
    const generic = state.monsters
      .filter((candidate) => candidate.isAlive && candidate.id !== monster.id)
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))[0];
    return generic ? { kind: 'ally', unit: generic } : null;
  }

  const hero = legalCommunityHeroTargets(state, skill)[0];
  return hero ? { kind: 'hero', unit: hero } : null;
}
