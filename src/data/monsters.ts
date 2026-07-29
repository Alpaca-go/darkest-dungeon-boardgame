import type { MonsterDefinition } from '../types';

// Phase 3 战斗怪物：3 种“骨系”敌人（简化版，非规则书完整怪物）。
// 每种至少 2 个技能，在 monster-skills.ts 中定义。
export const MONSTERS: MonsterDefinition[] = [
  {
    id: 'bone-soldier',
    name: 'Bone Soldier',
    maxHp: 20,
    speed: 3,
    targetRule: 'closest',
    skillIds: ['bone-soldier-bash', 'bone-soldier-cleave'],
    color: '#8b2b2b',
  },
  {
    id: 'bone-arbalist',
    name: 'Bone Arbalist',
    maxHp: 14,
    speed: 5,
    targetRule: 'random',
    skillIds: ['bone-arbalist-shot', 'bone-arbalist-snipe'],
    color: '#a83737',
  },
  {
    id: 'bone-courtier',
    name: 'Bone Courtier',
    maxHp: 18,
    speed: 4,
    targetRule: 'mostWounded',
    skillIds: ['bone-courtier-curse', 'bone-courtier-charm'],
    color: '#9c3b6b',
  },
];

export function getMonsterById(id: string): MonsterDefinition | undefined {
  return MONSTERS.find((m) => m.id === id);
}
