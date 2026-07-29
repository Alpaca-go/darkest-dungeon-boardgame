import type { HamletEventDefinition } from '../types';

// 第一阶段 3 条 Hamlet 事件（mock）。
export const HAMLET_EVENTS: HamletEventDefinition[] = [
  { id: 'event-quiet', name: '宁静的夜晚', description: '村民安然入睡，准备日如常进行。' },
  { id: 'event-supply', name: '补给抵达', description: '商队带来额外物资，部分建筑费用降低。' },
  { id: 'event-omen', name: '不祥之兆', description: '远处传来低语，今日压力恢复减半。' },
];
