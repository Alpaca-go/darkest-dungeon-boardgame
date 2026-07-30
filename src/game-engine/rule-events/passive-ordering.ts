// Phase 8B：被动来源的稳定排序与循环保护键（开发文档 §8.2 / §8.3）。
//
// 排序：
//   1. priority 数值从小到大；
//   2. sourceType：quirk → disease → trinket → room → boss；
//   3. instanceId 字典序。
// （phase：pre-modifier / post-reaction 由调用方分两次遍历，天然分层。）
//
// 循环保护唯一键：
//   rootEventId + heroId + passiveSourceType + instanceId + triggerType

import type { PassiveSource, PassiveSourceType, RuleEventType } from '../../types';

/** sourceType 的排序权重（越小越先执行）。 */
const SOURCE_TYPE_ORDER: Record<PassiveSourceType, number> = {
  quirk: 0,
  disease: 1,
  trinket: 2,
  room: 3,
  boss: 4,
};

/** 稳定排序比较器。 */
export function comparePassiveSources(a: PassiveSource, b: PassiveSource): number {
  if (a.priority !== b.priority) return a.priority - b.priority;
  const t = SOURCE_TYPE_ORDER[a.sourceType] - SOURCE_TYPE_ORDER[b.sourceType];
  if (t !== 0) return t;
  return a.instanceId < b.instanceId ? -1 : a.instanceId > b.instanceId ? 1 : 0;
}

/** 按稳定顺序排序（不修改入参）。 */
export function sortPassiveSources(sources: readonly PassiveSource[]): PassiveSource[] {
  return [...sources].sort(comparePassiveSources);
}

/** 循环保护唯一键。 */
export function passiveTriggerKey(
  rootEventId: string,
  heroId: string,
  sourceType: PassiveSourceType,
  instanceId: string,
  triggerType: RuleEventType
): string {
  return `${rootEventId}|${heroId}|${sourceType}|${instanceId}|${triggerType}`;
}
