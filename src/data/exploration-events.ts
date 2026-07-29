import type { ExplorationEventDefinition } from '../types';

// 5 个简化探索事件（移动前在走廊触发，随机抽取其一）。
// 对应 Phase 2 指令：无事件 / Hunger / Trap / Stressful Darkness / Rubble。
export const EXPLORATION_EVENTS: ExplorationEventDefinition[] = [
  { result: 'none', label: 'Nothing Happens', description: '无事发生，队伍安全通过走廊。' },
  { result: 'hunger', label: 'Hunger', description: '消耗 1 Food，否则全队各受 1 Wound。' },
  { result: 'trap', label: 'Trap', description: '消耗 1 Tool 拆除陷阱，否则随机英雄受 1 Wound、全队 Stress +1。' },
  { result: 'darkness', label: 'Stressful Darkness', description: '消耗 1 Torch 照明，否则全队 Stress +1。' },
  { result: 'rubble', label: 'Rubble', description: '消耗 1 Tool 清理碎石，否则随机英雄受 1 Wound、全队 Stress +1。' },
];
