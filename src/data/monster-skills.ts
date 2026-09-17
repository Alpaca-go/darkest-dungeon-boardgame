import type { MonsterSkillDefinition } from '../types';

// 怪物技能（Phase 3 简化版）。每个怪物至少 2 个技能。
// 字段含义与 SkillDefinition 的 Phase 3 战斗字段一致。
export const MONSTER_SKILLS: MonsterSkillDefinition[] = [
  // Bone Soldier
  {
    id: 'bone-soldier-bash',
    monsterId: 'bone-soldier',
    name: 'Bone Bash',
    usableFromPositions: [1, 2],
    validTargetPositions: [1, 2],
    targetSide: 'enemy',
    accuracy: 8,
    minDamage: 4,
    maxDamage: 7,
    applyEffects: [{ type: 'stun', amount: 1 }],
    description: '重击前排敌人，可能将其击晕。',
  },
  {
    id: 'bone-soldier-cleave',
    monsterId: 'bone-soldier',
    name: 'Cleave',
    usableFromPositions: [1, 2],
    validTargetPositions: [1, 2, 3],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 5,
    maxDamage: 8,
    description: '横扫前中排。',
  },

  // Bone Arbalist
  {
    id: 'bone-arbalist-shot',
    monsterId: 'bone-arbalist',
    name: 'Bolt Shot',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy',
    accuracy: 8,
    minDamage: 4,
    maxDamage: 6,
    description: '远程弩矢射击任意位置。',
  },
  {
    id: 'bone-arbalist-snipe',
    monsterId: 'bone-arbalist',
    name: 'Snipe',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy',
    accuracy: 6,
    minDamage: 6,
    maxDamage: 9,
    stress: 2,
    description: '精准狙击，造成更高伤害并施加压力。',
  },

  // Bone Courtier
  {
    id: 'bone-courtier-curse',
    monsterId: 'bone-courtier',
    name: 'Curse',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 2,
    maxDamage: 4,
    applyEffects: [{ type: 'blight', amount: 2 }],
    description: '诅咒，施加 Blight（持续伤害）。',
  },
  {
    id: 'bone-courtier-charm',
    monsterId: 'bone-courtier',
    name: 'Charm',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1],
    targetSide: 'enemy',
    accuracy: 8,
    minDamage: 0,
    maxDamage: 0,
    stress: 4,
    description: '魅惑前排，造成大量压力。',
  },
  // Phase 8B：感染来源之一（怪物技能）。
  // 命中后把英雄向后推 1 格（触发 Vertigo），并有 3/10 概率使其感染 Black Plague。
  {
    id: 'bone-courtier-pestilent-grasp',
    monsterId: 'bone-courtier',
    name: 'Pestilent Grasp',
    usableFromPositions: [1, 2, 3],
    validTargetPositions: [1, 2],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 1,
    maxDamage: 3,
    moveTarget: 1,
    diseaseChance: { diseaseId: 'black-plague', d10AtMost: 3 },
    description: '腐臭之手抓向前排，将其推后 1 格，并可能传染 Black Plague。',
  },
];

import { communityGuardianMonsterSkills } from '../game-engine/campaign/act-four/community-guardian-combat';

export function getMonsterSkillById(id: string): MonsterSkillDefinition | undefined {
  return MONSTER_SKILLS.find((s) => s.id === id) ?? communityGuardianMonsterSkills().find((s) => s.id === id);
}

export function getMonsterSkills(monsterId: string): MonsterSkillDefinition[] {
  return MONSTER_SKILLS.filter((s) => s.monsterId === monsterId);
}
