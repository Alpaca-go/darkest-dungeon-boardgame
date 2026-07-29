import type { BattleState, BattleUnit } from '../types';
import { shuffle } from './random';

/**
 * 建立一轮的先攻顺序：取所有存活单位，随机打乱。
 * 每轮开始时调用，符合“将存活英雄和怪物加入行动列表并随机打乱”。
 */
export function createInitiativeOrder(units: BattleUnit[]): string[] {
  return shuffle(units.filter((u) => u.isAlive).map((u) => u.id));
}

/** 当前先攻列表中是否还有未结算的存活单位。 */
export function hasPendingActors(state: BattleState): boolean {
  return state.initiativeOrder.some((id) => {
    const u = findUnit(state, id);
    return !!u && u.isAlive;
  });
}

/** 在英雄/怪物数组中按 id 查找单位。 */
export function findUnit(state: BattleState, id: string | null): BattleUnit | undefined {
  if (!id) return undefined;
  return state.heroes.find((h) => h.id === id) ?? state.monsters.find((m) => m.id === id);
}
