import type { ActiveEffect, BattleState, BattleUnit, GameLogEntry, MonsterSkillDefinition } from '../../../types';
import { d10 } from '../../random';
import { applyBattleUnitDamage } from '../../damage';
import { applyStatusEffectEvent, describeBlockedEffects } from '../../status-effects';
import { findUnit } from '../../initiative';
import { createId, nowIso } from '../../random';
import { requirement } from '../../../data/darkest-dungeon/community-reference/normalized';
import {
  COMMUNITY_GUARDIAN_CRITICAL_POLICY,
  resolveCommunityGuardianCondition,
  resolveCommunityGuardianCritical,
  type CommunityConditionCategory,
} from './community-engine-capabilities';
import {
  applyCommunityGuardianSpecialSkill,
  communitySpecialSkillLeaf,
  markedBonusDamage,
} from './community-guardian-special-skills';
import { resolveCommunityMonsterTarget } from './community-monster-targeting';

export const COMMUNITY_GUARDIAN_SOURCE_PREFIX = 'community-dd-';

const REQUIREMENT_BY_SOURCE: Record<string, keyof typeof COMMUNITY_GUARDIAN_CRITICAL_POLICY> = {
  'community-dd-templars-impaler': 'tierB-templars-impaler',
  'community-dd-templars-warlord': 'tierB-templars-warlord',
  'community-dd-mammoth-cyst': 'tierB-mammoth-cyst',
  'community-dd-white-cell-stalk': 'tierB-white-cell-stalk',
  'community-dd-shuffling-horror': 'tierB-shuffling-horror',
  'community-dd-cultist-priest': 'tierB-cultist-priest',
  'community-dd-malignant-growth': 'tierB-malignant-growth',
};

export function communityRequirementIdFromSource(sourceId: string): keyof typeof COMMUNITY_GUARDIAN_CRITICAL_POLICY | null {
  return REQUIREMENT_BY_SOURCE[sourceId] ?? null;
}

export function isCommunityGuardianUnit(unit: BattleUnit): boolean {
  return communityRequirementIdFromSource(unit.sourceId) !== null;
}

const SKILL_EFFECTS: Record<string, ActiveEffect[]> = {
  torment: [],
  'body-slam': [{ type: 'stun', amount: 2, durationTurns: 2 }],
  revelation: [],
  'stinger-shot': [{ type: 'blight', amount: 3, durationTurns: 3 }, { type: 'debuff', amount: 0, durationTurns: 2 }],
  'bulging-gaze': [{ type: 'debuff', amount: 0, durationTurns: 1 }],
  digestion: [{ type: 'blight', amount: 3, durationTurns: 2 }],
  lacerate: [{ type: 'bleed', amount: 3, durationTurns: 3 }],
  'death-lash': [{ type: 'debuff', amount: 0, durationTurns: 1 }],
  'the-finger': [{ type: 'bleed', amount: 3, durationTurns: 3 }],
  'maul-the-flesh': [{ type: 'bleed', amount: 2, durationTurns: 3 }],
  'daze-the-mind': [{ type: 'stun', amount: 2, durationTurns: 2 }],
};

const SKILL_STRESS: Record<string, number> = {
  revelation: 2,
  'bulging-gaze': 1,
  'death-lash': 1,
  'the-finger': 2,
  teleport: 2,
  'echoing-disassembly': 2,
};

function skillNumberToId(requirementId: string, printedNumber: number): string {
  const skills = requirement(requirementId).fields.skillIds.value as Array<{ sourceLocalSkillId: string; printedNumber: number }>;
  const found = skills.find((skill) => skill.printedNumber === printedNumber);
  if (!found) throw new Error(`Missing printed skill ${printedNumber} on ${requirementId}`);
  return found.sourceLocalSkillId;
}

export function selectCommunityGuardianSkillId(requirementId: string, stance: string, roll: number): string {
  const table = requirement(requirementId).fields.d10SkillTable.value as Array<{ stances: string[]; ranges: Array<{ rolls: number[]; printedSkillNumber: number }> }> | { selection?: string; dieRollRequired?: boolean };
  if (!Array.isArray(table)) {
    if (table.dieRollRequired === false) return skillNumberToId(requirementId, 1);
    throw new Error(`Unsupported Community d10 table on ${requirementId}`);
  }
  const row = table.find((entry) => entry.stances.includes(stance));
  if (!row) throw new Error(`No d10 row for stance ${stance} on ${requirementId}`);
  const range = row.ranges.find((candidate) => candidate.rolls.includes(roll));
  if (!range) throw new Error(`No d10 mapping for roll ${roll} on ${requirementId}/${stance}`);
  return skillNumberToId(requirementId, range.printedSkillNumber);
}

/**
 * asset:450ace:face verified（GUID 450ace / CardID 42032 Ability Card）：
 * 「If not all Stance Slots for Monsters are filled, Shuffling Horror will use this Skill.」
 *
 * Battle 层代理：Cultist Priest / Malignant Growth 任一未以存活单位在场
 * → Stance Slot 未填满 → 强制 Echoing Disassembly（替换普通 d10 选技，不发明 d10 映射）。
 * Battle Card（ccf3dc / 46616）的 d10 仅映射 Skill 1/2；Skill 3 无骰点区间。
 */
export function shouldForceCommunityEchoingDisassembly(state: BattleState, monster: BattleUnit): boolean {
  if (monster.sourceId !== 'community-dd-shuffling-horror') return false;
  const priestAlive = state.monsters.some((unit) => unit.sourceId === 'community-dd-cultist-priest' && unit.isAlive);
  const growthAlive = state.monsters.some((unit) => unit.sourceId === 'community-dd-malignant-growth' && unit.isAlive);
  return !(priestAlive && growthAlive);
}

export function communityGuardianMonsterSkills(): MonsterSkillDefinition[] {
  return (Object.keys(REQUIREMENT_BY_SOURCE) as Array<keyof typeof REQUIREMENT_BY_SOURCE>).flatMap((sourceId) => {
    const requirementId = REQUIREMENT_BY_SOURCE[sourceId];
    const skills = requirement(requirementId).fields.skillIds.value as Array<{ sourceLocalSkillId: string; printedName: string }>;
    const accuracy = requirement(requirementId).fields.accuracy.value as Record<string, number | string>;
    const damage = requirement(requirementId).fields.damage.value as Record<string, number | string>;
    const prefix = sourceId.includes('templars-impaler') ? 'community-dd-skill-impaler-' : sourceId.includes('templars-warlord') ? 'community-dd-skill-warlord-' : 'community-dd-skill-';
    return skills.map((skill) => {
      const local = skill.sourceLocalSkillId;
      const acc = accuracy[local];
      const dmg = damage[local];
      return {
        id: `${prefix}${local}`,
        monsterId: sourceId,
        name: skill.printedName,
        usableFromPositions: [1, 2, 3, 4],
        validTargetPositions: [1, 2, 3, 4],
        targetSide: 'enemy' as const,
        accuracy: typeof acc === 'number' ? acc : 7,
        minDamage: typeof dmg === 'number' ? dmg : 0,
        maxDamage: typeof dmg === 'number' ? dmg : 0,
        applyEffects: SKILL_EFFECTS[local] ?? [],
        stress: SKILL_STRESS[local] ?? 0,
        description: `Community retail ${skill.printedName}`,
      };
    });
  });
}

export function resolveCommunityShuffleMovement(target: BattleUnit, distance: number): number {
  const requirementId = communityRequirementIdFromSource(target.sourceId);
  if (!requirementId) return distance;
  const resolved = resolveCommunityGuardianCondition(requirementId, 'shuffle' as CommunityConditionCategory, { movementDistance: distance });
  return resolved.movementDistance ?? 0;
}

function setUnit(state: BattleState, unit: BattleUnit): BattleState {
  return {
    ...state,
    heroes: state.heroes.map((candidate) => candidate.id === unit.id ? unit : candidate),
    monsters: state.monsters.map((candidate) => candidate.id === unit.id ? unit : candidate),
  };
}

function pushLog(state: BattleState, message: string, kind: GameLogEntry['kind'] = 'info'): BattleState {
  const entry: GameLogEntry = { id: createId('blog'), at: nowIso(), message, kind };
  return { ...state, battleLog: [...state.battleLog, entry].slice(-100) };
}

function checkEnd(state: BattleState): BattleState {
  if (state.status !== 'active') return state;
  if (!state.monsters.some((unit) => unit.isAlive)) return pushLog({ ...state, status: 'victory' }, '战斗胜利。', 'success');
  if (!state.heroes.some((unit) => unit.isAlive)) return pushLog({ ...state, status: 'defeat' }, '小队覆灭。', 'danger');
  return state;
}

export function runCommunityGuardianMonsterTurn(state: BattleState, monster: BattleUnit): BattleState {
  const requirementId = communityRequirementIdFromSource(monster.sourceId);
  if (!requirementId) return state;
  const eventId = `community-attack:${state.battleId}:${state.round}:${state.initiativeIndex}:${monster.id}`;
  const saved = state.communityAttackEvents?.find((event) => event.eventId === eventId);
  const prefix = monster.sourceId.includes('templars-impaler') ? 'community-dd-skill-impaler-' : monster.sourceId.includes('templars-warlord') ? 'community-dd-skill-warlord-' : 'community-dd-skill-';

  // WP-4：先定 Skill 再按统一 Resolver 定目标（rulebook 顺序：Check Skill → Check Target）。
  // 重放（saved）时不掷技能骰 —— 从已保存的 skillId 反推 localSkill，保证零 RNG 消耗。
  // WP-3 / asset:450ace:face：Shuffling Horror 在 Monster Stance 未满时强制 Echoing，
  // 跳过 d10 选技（Battle Card 未给 Skill 3 分配骰点区间，绝不发明映射）。
  const forcedEchoing = !saved && shouldForceCommunityEchoingDisassembly(state, monster);
  const skillRoll = saved ? saved.skillRoll : forcedEchoing ? 0 : d10();
  const localSkill = saved
    ? saved.skillId.slice(prefix.length)
    : forcedEchoing
      ? 'echoing-disassembly'
      : selectCommunityGuardianSkillId(requirementId, monster.stance ?? 'aggressive', skillRoll);
  const skills = communityGuardianMonsterSkills();
  const skill = skills.find((candidate) => candidate.id === `${prefix}${localSkill}`);
  if (!skill) return pushLog(state, `${monster.name} 缺少 Community skill ${localSkill}。`, 'warning');

  // WP-4：统一 Community Monster Target Resolver —— Stance 优先级 + position + id，
  // 与 heroes 数组顺序无关；非法目标不进入候选集，绝不退化为「第一个存活 Hero」。
  const resolved = resolveCommunityMonsterTarget(state, monster, localSkill, skill);
  if (saved) {
    if (saved.targetId !== (resolved?.unit.id ?? '')) return pushLog(state, 'Saved Community attack target mismatch', 'warning');
    return state;
  }
  if (!resolved) {
    // 合法目标缺失（如无存活 Hero、或 Reconstitute 的 Mammoth Cyst 已死亡）：
    // 记录事件保证幂等，日志显式说明 —— 绝不静默成功（WP-2 Reconstitute 约束）。
    const next = pushLog({
      ...state,
      communityAttackEvents: [...(state.communityAttackEvents ?? []), {
        eventId,
        monsterId: monster.id,
        skillId: skill.id,
        targetId: '',
        skillRoll,
        attackRoll: 0,
        hit: false,
        critical: false,
        damage: 0,
        healAmount: 0,
      }],
    }, `${monster.name} 的 ${skill.name} 没有合法目标，行动落空。`, 'warning');
    return checkEnd(next);
  }

  const target = resolved.unit;
  const leaf = communitySpecialSkillLeaf(localSkill);
  const isHeroAttack = resolved.kind === 'hero' && leaf.attack !== false;
  const attackRoll = isHeroAttack ? d10() : 0;
  const bonus = resolved.kind === 'hero' ? markedBonusDamage(localSkill, target) : 0;
  const outcome = !isHeroAttack
    ? { hit: true, critical: false, damage: 0 }
    : resolveCommunityGuardianCritical(requirementId, localSkill, attackRoll, skill.accuracy ?? 7, skill.minDamage ?? 0);
  const damage = outcome.hit ? outcome.damage + bonus : 0;
  let next = state;
  let tgt = target;
  if (outcome.hit && damage > 0 && resolved.kind === 'hero') {
    const applied = applyBattleUnitDamage(tgt, damage);
    tgt = applied.unit;
    next = setUnit(next, tgt);
    for (const log of applied.logs) next = pushLog(next, log, applied.heroDied ? 'danger' : 'warning');
  }
  if (outcome.hit && resolved.kind === 'hero' && tgt.isAlive && skill.applyEffects?.length) {
    next = applyStatusEffectEvent(next, tgt.id, skill.applyEffects, `${eventId}:effects`);
    tgt = findUnit(next, tgt.id)!;
    const blocked = next.statusEffectEvents?.find((event) => event.eventId === `${eventId}:effects`)?.blocked ?? [];
    if (blocked.length > 0) next = pushLog(next, `${tgt.name} 的抗性调整了部分效果${describeBlockedEffects(blocked)}。`, 'success');
  }
  if (outcome.hit && resolved.kind === 'hero' && tgt.isAlive && skill.stress && tgt.side === 'hero') {
    tgt = { ...tgt, stress: Math.min(10, tgt.stress + skill.stress) };
    next = setUnit(next, tgt);
  }
  const special = applyCommunityGuardianSpecialSkill(next, monster, tgt, localSkill, eventId, outcome.hit);
  next = special.state;
  next = {
    ...next,
    communityAttackEvents: [...(next.communityAttackEvents ?? []), {
      eventId,
      monsterId: monster.id,
      skillId: skill.id,
      targetId: target.id,
      skillRoll,
      attackRoll,
      hit: outcome.hit,
      critical: outcome.critical,
      damage,
      markedBonusDamage: special.markedBonus,
      pitTossRoll: special.pitTossRoll,
      pitTossAreaId: special.pitTossAreaId,
      pitTossIgnored: special.pitTossIgnored,
      healAmount: special.healAmount,
      undulationsBefore: special.undulationsBefore,
      undulationsAfter: special.undulationsAfter,
      summonedRoles: special.summonedRoles.length > 0 ? special.summonedRoles : undefined,
    }],
  };
  next = pushLog(
    next,
    !isHeroAttack
      ? `${monster.name} 使用 ${skill.name}。`
      : outcome.hit
        ? `${monster.name} 使用 ${skill.name}${outcome.critical ? '（暴击）' : ''}，掷 ${attackRoll} 命中 ${target.name}，造成 ${damage} 伤害。`
        : `${monster.name} 使用 ${skill.name}，掷 ${attackRoll} 未命中 ${target.name}。`,
    outcome.hit ? 'danger' : 'info',
  );
  return checkEnd(next);
}
