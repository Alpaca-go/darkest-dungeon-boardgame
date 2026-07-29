import type { HamletEventDefinition } from '../types';

// Phase 4：3 条 mock Hamlet 事件。效果在进入 Hamlet 时只执行一次。
export const HAMLET_EVENTS: HamletEventDefinition[] = [
  {
    id: 'event-supply-run',
    name: 'Supply Run（补给车队）',
    description: '商队冒险抵达村庄，为下一次远征捎来了额外物资。',
    preparationDays: 2,
    effect: '下一次任务开始时每种补给 +1。',
    effectType: 'bonus-provisions',
    effectAmount: 1,
  },
  {
    id: 'event-quiet-week',
    name: 'Quiet Week（宁静的一周）',
    description: '难得的平静。村民安然入睡，准备工作如常进行。',
    preparationDays: 3,
    effect: '无额外效果。',
    effectType: 'none',
    effectAmount: 0,
  },
  {
    id: 'event-troubled-town',
    name: 'Troubled Town（不安的小镇）',
    description: '夜里传来低语与骚动，队伍的神经再度紧绷。',
    preparationDays: 2,
    effect: '全队 Stress +2。',
    effectType: 'party-stress',
    effectAmount: 2,
  },
];

export function getHamletEventById(id: string | null): HamletEventDefinition | undefined {
  return HAMLET_EVENTS.find((e) => e.id === id);
}
