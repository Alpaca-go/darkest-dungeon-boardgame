// Phase 7：Virtue 卡牌数据（核心盒 5 张）。
// - Focused / Stalwart 数值来自规则书可见页面（rulebook-visible）；
// - Courageous / Powerful / Vigorous 为保守简化效果（prototype-simplified），
//   后续拿到实体卡牌清单后只需替换本文件数据，不需要改执行器。
// 效果执行统一走 mental-effects.ts 的数据驱动执行器，禁止为单张卡写 if/else。

import type { ResolveEffectDefinition } from '../types';

export const VIRTUES: ResolveEffectDefinition[] = [
  {
    id: 'focused',
    name: 'Focused',
    type: 'virtue',
    triggerRollMin: 1,
    triggerRollMax: 5,
    triggerTiming: 'hero-turn-start',
    effects: [
      // 规则书原文为当前回合命中加成；本项目命中走 d10 对抗，
      // 适配为「当前回合命中骰 +1」（temporary-accuracy-bonus，回合结束清除）。
      { type: 'temporary-accuracy-bonus', amount: 1, duration: 'current-turn' },
    ],
    description: '专注：本回合命中骰 +1。',
    sourceAccuracy: 'rulebook-visible',
  },
  {
    id: 'stalwart',
    name: 'Stalwart',
    type: 'virtue',
    triggerRollMin: 1,
    triggerRollMax: 3,
    triggerTiming: 'hero-turn-start',
    effects: [
      // 负数 stress 由执行器路由到 recoverStress()，不允许直接传入 applyStress()。
      { type: 'stress-self', amount: -2 },
    ],
    description: '坚毅：自身恢复 2 点 Stress。',
    sourceAccuracy: 'rulebook-visible',
  },
  {
    id: 'courageous',
    name: 'Courageous',
    type: 'virtue',
    triggerRollMin: 1,
    triggerRollMax: 3,
    triggerTiming: 'hero-turn-start',
    effects: [{ type: 'stress-allies', amount: -1 }],
    description: '英勇：全体其他存活英雄 Stress -1。',
    sourceAccuracy: 'prototype-simplified',
  },
  {
    id: 'powerful',
    name: 'Powerful',
    type: 'virtue',
    triggerRollMin: 1,
    triggerRollMax: 3,
    triggerTiming: 'hero-turn-start',
    effects: [{ type: 'temporary-damage-bonus', amount: 1, duration: 'current-turn' }],
    description: '强力：本回合伤害 +1。',
    sourceAccuracy: 'prototype-simplified',
  },
  {
    id: 'vigorous',
    name: 'Vigorous',
    type: 'virtue',
    triggerRollMin: 1,
    triggerRollMax: 3,
    triggerTiming: 'hero-turn-start',
    effects: [
      // 复用通用治疗管线；无法复活 dead hero（执行器保证）。
      { type: 'heal-self', amount: 2 },
    ],
    description: '活力：自身恢复 2 HP。',
    sourceAccuracy: 'prototype-simplified',
  },
];

/** Virtue fallback（抽取异常时兜底，文档 8 节要求）。 */
export const VIRTUE_FALLBACK_ID = 'focused';

export function getVirtueById(id: string): ResolveEffectDefinition | undefined {
  return VIRTUES.find((v) => v.id === id);
}
