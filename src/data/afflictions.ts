// Phase 7：Affliction 卡牌数据（核心盒 5 张）。
// - Selfish / Fearful 数值来自规则书可见页面（rulebook-visible）；
// - Hopeless / Masochistic / Irrational 为保守简化效果（prototype-simplified）。
// 效果执行统一走 mental-effects.ts 的数据驱动执行器，禁止为单张卡写 if/else。

import type { ResolveEffectDefinition } from '../types';

export const AFFLICTIONS: ResolveEffectDefinition[] = [
  {
    id: 'selfish',
    name: 'Selfish',
    type: 'affliction',
    triggerRollMin: 1,
    triggerRollMax: 4,
    triggerTiming: 'hero-turn-start',
    effects: [{ type: 'consume-provision', amount: 1, selection: 'random' }],
    description: '自私：随机消耗 1 件补给。',
    sourceAccuracy: 'rulebook-visible',
  },
  {
    id: 'fearful',
    name: 'Fearful',
    type: 'affliction',
    triggerRollMin: 1,
    triggerRollMax: 2,
    triggerTiming: 'hero-turn-start',
    effects: [{ type: 'stress-self', amount: 2 }],
    description: '恐惧：自身 Stress +2。',
    sourceAccuracy: 'rulebook-visible',
  },
  {
    id: 'hopeless',
    name: 'Hopeless',
    type: 'affliction',
    triggerRollMin: 1,
    triggerRollMax: 3,
    triggerTiming: 'hero-turn-start',
    effects: [
      { type: 'stress-self', amount: 1 },
      { type: 'lose-action-points', amount: 1 },
    ],
    description: '绝望：自身 Stress +1，本回合失去 1 个行动点。',
    sourceAccuracy: 'prototype-simplified',
  },
  {
    id: 'masochistic',
    name: 'Masochistic',
    type: 'affliction',
    triggerRollMin: 1,
    triggerRollMax: 3,
    triggerTiming: 'hero-turn-start',
    effects: [
      // 必须复用 Phase 6 伤害 / Death's Door / Deathblow 管线（执行器保证）。
      { type: 'damage-self', amount: 1 },
    ],
    description: '自虐：自身受到 1 点伤害。',
    sourceAccuracy: 'prototype-simplified',
  },
  {
    id: 'irrational',
    name: 'Irrational',
    type: 'affliction',
    triggerRollMin: 1,
    triggerRollMax: 3,
    triggerTiming: 'hero-turn-start',
    effects: [
      // 无合法位置时执行器仅写日志，不阻塞页面。
      { type: 'move-self', distance: 1, direction: 'random' },
    ],
    description: '狂乱：随机前移或后移 1 格。',
    sourceAccuracy: 'prototype-simplified',
  },
];

/** Affliction fallback（抽取异常时兜底，文档 8 节要求）。 */
export const AFFLICTION_FALLBACK_ID = 'fearful';

export function getAfflictionById(id: string): ResolveEffectDefinition | undefined {
  return AFFLICTIONS.find((a) => a.id === id);
}
