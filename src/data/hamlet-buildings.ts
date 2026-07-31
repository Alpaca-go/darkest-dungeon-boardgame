import type { HamletBuildingDefinition } from '../types';

// Phase 4：4 个简化建筑（价格与效果由 game-engine/hamlet.ts 读取，不写死在组件中）。
export const HAMLET_BUILDINGS: HamletBuildingDefinition[] = [
  { id: 'sanitarium', name: 'Sanitarium', cost: 3, effect: '恢复 3 HP（不超过上限）', color: '#5b8a5b' },
  { id: 'tavern', name: 'Tavern', cost: 3, effect: 'Stress -3（不低于 0）', color: '#d9b44a' },
  // Phase 8D：Guild 本身不收费，Gold 由每次升级单独结算（Hero Level 2 Gold / Skill Level 1 Gold）。
  { id: 'guild', name: 'Guild', cost: 0, effect: '每次访问最多 2 次升级（Hero Level 4XP+2G / Skill Level 2XP+1G）', color: '#4f8a9c' },
  // Phase 8D：Blacksmith 提供临时 Skill Form（不改变永久 Skill Level）。
  { id: 'blacksmith', name: 'Blacksmith', cost: 5, effect: '为 1 个技能临时提升一级 Form（仅下次任务）', color: '#a83737' },
  // Phase 8A：Abbey 移除英雄身上的 1 个 Quirk（需要在页面上选择移除目标）。
  { id: 'abbey', name: 'Abbey', cost: 4, effect: '移除该英雄的 1 个怪癖（自选）', color: '#6a5f9c' },
];

export function getHamletBuildingById(id: string | null): HamletBuildingDefinition | undefined {
  return HAMLET_BUILDINGS.find((b) => b.id === id);
}
