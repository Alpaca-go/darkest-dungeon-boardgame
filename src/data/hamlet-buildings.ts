import type { HamletBuildingDefinition } from '../types';

// 第一阶段 4 个建筑。
export const HAMLET_BUILDINGS: HamletBuildingDefinition[] = [
  { id: 'sanitarium', name: 'Sanitarium', cost: 3, effect: '恢复 3 Wound', color: '#5b8a5b' },
  { id: 'tavern', name: 'Tavern', cost: 3, effect: 'Stress -3', color: '#d9b44a' },
  { id: 'guild', name: 'Guild', cost: 2, effect: '获得 1 XP', color: '#4f8a9c' },
  { id: 'blacksmith', name: 'Blacksmith', cost: 5, effect: '下次任务 +1 伤害', color: '#a83737' },
];
