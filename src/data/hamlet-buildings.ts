import type { HamletBuildingDefinition } from '../types';

// Phase 4：4 个简化建筑（价格与效果由 game-engine/hamlet.ts 读取，不写死在组件中）。
export const HAMLET_BUILDINGS: HamletBuildingDefinition[] = [
  { id: 'sanitarium', name: 'Sanitarium', cost: 3, effect: '恢复 3 HP（不超过上限）', color: '#5b8a5b' },
  { id: 'tavern', name: 'Tavern', cost: 3, effect: 'Stress -3（不低于 0）', color: '#d9b44a' },
  { id: 'guild', name: 'Guild', cost: 2, effect: '获得 1 XP', color: '#4f8a9c' },
  { id: 'blacksmith', name: 'Blacksmith', cost: 5, effect: '下次任务攻击 +1 伤害', color: '#a83737' },
];

export function getHamletBuildingById(id: string | null): HamletBuildingDefinition | undefined {
  return HAMLET_BUILDINGS.find((b) => b.id === id);
}
