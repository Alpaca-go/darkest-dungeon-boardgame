// Phase 7：Placeholder Quirk 数据。
// 仅用于 Quest 结束时 Virtue/Affliction → Quirk 的转换记录；
// 被动效果一律不执行（inactiveUntilPhase8: true），完整 Quirk 系统留待 Phase 8。
// UI 展示时应提示「已获得，效果将在成长系统启用」。

import type { QuirkDefinition } from '../types';

export const PLACEHOLDER_POSITIVE_QUIRKS: QuirkDefinition[] = [
  {
    id: 'quirk_pos_hard_skinned',
    name: 'Hard Skinned',
    polarity: 'positive',
    description: '皮糙肉厚（占位）。效果将在成长系统（Phase 8）启用。',
    inactiveUntilPhase8: true,
  },
  {
    id: 'quirk_pos_quick_reflexes',
    name: 'Quick Reflexes',
    polarity: 'positive',
    description: '反应敏捷（占位）。效果将在成长系统（Phase 8）启用。',
    inactiveUntilPhase8: true,
  },
  {
    id: 'quirk_pos_steady',
    name: 'Steady',
    polarity: 'positive',
    description: '沉着冷静（占位）。效果将在成长系统（Phase 8）启用。',
    inactiveUntilPhase8: true,
  },
];

export const PLACEHOLDER_NEGATIVE_QUIRKS: QuirkDefinition[] = [
  {
    id: 'quirk_neg_nervous',
    name: 'Nervous',
    polarity: 'negative',
    description: '神经紧张（占位）。效果将在成长系统（Phase 8）启用。',
    inactiveUntilPhase8: true,
  },
  {
    id: 'quirk_neg_fragile',
    name: 'Fragile',
    polarity: 'negative',
    description: '体质孱弱（占位）。效果将在成长系统（Phase 8）启用。',
    inactiveUntilPhase8: true,
  },
  {
    id: 'quirk_neg_paranoid',
    name: 'Paranoid',
    polarity: 'negative',
    description: '多疑妄想（占位）。效果将在成长系统（Phase 8）启用。',
    inactiveUntilPhase8: true,
  },
];

export function getQuirkById(id: string): QuirkDefinition | undefined {
  return (
    PLACEHOLDER_POSITIVE_QUIRKS.find((q) => q.id === id) ??
    PLACEHOLDER_NEGATIVE_QUIRKS.find((q) => q.id === id)
  );
}
