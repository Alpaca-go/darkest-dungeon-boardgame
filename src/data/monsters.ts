import type { MonsterDefinition } from '../types';

// 4 种普通怪物（Phase 1 战斗使用）。
export const MONSTERS: MonsterDefinition[] = [
  {
    id: 'bandit-cutthroat',
    name: 'Bandit Cutthroat',
    maxHp: 18,
    speed: 6,
    damage: 5,
    stress: 2,
    targetRule: 'mostWounded',
    color: '#8b2b2b',
  },
  {
    id: 'bandit-brawler',
    name: 'Bandit Brawler',
    maxHp: 26,
    speed: 3,
    damage: 7,
    targetRule: 'closest',
    color: '#a83737',
  },
  {
    id: 'cultist-zealot',
    name: 'Cultist Zealot',
    maxHp: 20,
    speed: 4,
    damage: 4,
    stress: 4,
    targetRule: 'mostStressed',
    color: '#9c3b6b',
  },
  {
    id: 'ghoul',
    name: 'Starving Ghoul',
    maxHp: 22,
    speed: 5,
    damage: 6,
    targetRule: 'random',
    color: '#7a4f8a',
  },
];

export function getMonsterById(id: string): MonsterDefinition | undefined {
  return MONSTERS.find((m) => m.id === id);
}
