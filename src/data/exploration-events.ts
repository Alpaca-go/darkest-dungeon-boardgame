import type { ExplorationEventDefinition } from '../types';

// 5 个简化探索事件（移动前触发）。第一阶段随机抽取其一。
export const EXPLORATION_EVENTS: ExplorationEventDefinition[] = [
  { result: 'safe', label: 'Safe', description: '无事发生，队伍安全通过。' },
  { result: 'hunger', label: 'Hunger', description: '消耗 1 Food，否则全队各受 1 Wound。' },
  { result: 'darkness', label: 'Darkness', description: '消耗 1 Torch，否则 Light -1。' },
  { result: 'rubble', label: 'Rubble', description: '消耗 1 Tool，否则随机英雄受 1 Wound、全队 Stress +1。' },
  { result: 'curio', label: 'Curio', description: '获得或失去少量 Gold / Stress。' },
];
