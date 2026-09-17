import type { ActiveEffect, BattleState, BattleUnit, MonsterSkillDefinition } from '../../../types';
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
import type { GameLogEntry } from '../../../types';

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
  'stinger-shot': [{ type: 'blight', amount: 3, durationTurns: 3 }],
  'bulging-gaze': [],
  digestion: [{ type: 'blight', amount: 3, durationTurns: 2 }],
  lacerate: [{ type: 'bleed', amount: 3, durationTurns: 3 }],
  'death-lash': [],
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
};

function localSkillId(skillId: string): string {
  return skillId.replace(/^community-dd-skill-(?:impaler-|warlord-)?/, '');
}

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
  const wanted = stance || 'aggressive';
  const row = table.find((entry) => entry.stances.includes(wanted)) ?? table[0];
  const range = row.ranges.find((entry) => entry.rolls.includes(roll));
  if (!range) throw new Error(`No Community skill for ${requirementId} stance ${wanted} roll ${roll}`);
  return skillNumberToId(requirementId, range.printedSkillNumber);
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
  const target = state.heroes.find((hero) => hero.isAlive);
  if (!target) return pushLog(state, `${monster.name} 没有可攻击的英雄。`, 'warning');
  if (saved) {
    if (saved.targetId !== target.id) return pushLog(state, 'Saved Community attack target mismatch', 'warning');
    return state;
  }
  const skillRoll = d10();
  const localSkill = selectCommunityGuardianSkillId(requirementId, monster.stance ?? 'aggressive', skillRoll);
  const skills = communityGuardianMonsterSkills();
  const prefix = monster.sourceId.includes('templars-impaler') ? 'community-dd-skill-impaler-' : monster.sourceId.includes('templars-warlord') ? 'community-dd-skill-warlord-' : 'community-dd-skill-';
  const skill = skills.find((candidate) => candidate.id === `${prefix}${localSkill}`);
  if (!skill) return pushLog(state, `${monster.name} 缺少 Community skill ${localSkill}。`, 'warning');
  const attackRoll = d10();
  const outcome = resolveCommunityGuardianCritical(requirementId, localSkill, attackRoll, skill.accuracy ?? 7, skill.minDamage ?? 0);
  let next = state;
  let tgt = target;
  if (outcome.hit && outcome.damage > 0) {
    const applied = applyBattleUnitDamage(tgt, outcome.damage);
    tgt = applied.unit;
    next = setUnit(next, tgt);
    for (const log of applied.logs) next = pushLog(next, log, applied.heroDied ? 'danger' : 'warning');
  }
  if (outcome.hit && tgt.isAlive && skill.applyEffects?.length) {
    next = applyStatusEffectEvent(next, tgt.id, skill.applyEffects, `${eventId}:effects`);
    tgt = findUnit(next, tgt.id)!;
    const blocked = next.statusEffectEvents?.find((event) => event.eventId === `${eventId}:effects`)?.blocked ?? [];
    if (blocked.length > 0) next = pushLog(next, `${tgt.name} 的抗性调整了部分效果${describeBlockedEffects(blocked)}。`, 'success');
  }
  if (outcome.hit && tgt.isAlive && skill.stress && tgt.side === 'hero') {
    tgt = { ...tgt, stress: Math.min(10, tgt.stress + skill.stress) };
    next = setUnit(next, tgt);
  }
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
      damage: outcome.damage,
    }],
  };
  next = pushLog(
    next,
    outcome.hit
      ? `${monster.name} 使用 ${skill.name}${outcome.critical ? '（暴击）' : ''}，掷 ${attackRoll} 命中 ${target.name}，造成 ${outcome.damage} 伤害。`
      : `${monster.name} 使用 ${skill.name}，掷 ${attackRoll} 未命中 ${target.name}。`,
    outcome.hit ? 'danger' : 'info',
  );
  return checkEnd(next);
}
