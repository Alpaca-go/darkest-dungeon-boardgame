// Phase 11A.2 §29 — random.ts 作为兼容 facade。
//
// 现有调用 API（rollDie / d10 / randInt / pick / shuffle / createId / nowIso）
// 全部委托给 RuntimeSources（src/game-engine/runtime-sources.ts）。
//
// 这样不要求一次性修改全仓 import。

import {
  randomNext as _randomNext,
  nowIso as _nowIso,
  createId as _createId,
  type RandomSource,
  productionRuntimeSources,
  seededRuntimeSources,
  withRuntimeSources,
  getRuntimeSources,
  setRuntimeSources,
  SeededRandom,
  DeterministicClock,
  DeterministicCounterIdSource,
  SystemRandom,
  SystemClock,
  ProductionIdSource,
  type RuntimeSources,
  type ClockSource,
  type IdSource,
} from './runtime-sources';

// ---------------------------------------------------------------------------
// 兼容 facade
// ---------------------------------------------------------------------------

/** 兼容 facade：随机数（[0, 1)）。 */
export function random(): number {
  return _randomNext();
}

/** 兼容 facade：返回 [1, sides] 的闭区间整数（掷骰）。 */
export function rollDie(sides: number): number {
  return 1 + Math.floor(_randomNext() * sides);
}

/** 兼容 facade：掷 d10（1..10）。 */
export function d10(): number {
  return rollDie(10);
}

/** 兼容 facade：闭区间整数随机 [min, max]。 */
export function randInt(min: number, max: number): number {
  return Math.floor(_randomNext() * (max - min + 1)) + min;
}

/** 兼容 facade：从数组中随机取一个元素。 */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(_randomNext() * arr.length)];
}

/** 兼容 facade：返回数组的浅拷贝随机打乱结果（Fisher-Yates）。 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(_randomNext() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 兼容 facade：生成带前缀的唯一 id。委托 RuntimeSources。 */
export function createId(prefix: string = 'id'): string {
  return _createId(prefix);
}

/** 兼容 facade：当前 ISO 时间。委托 RuntimeSources。 */
export function nowIso(): string {
  return _nowIso();
}

/** 兼容 facade：把 seed 转成 SeededRandom 函数。11A.1 兼容。 */
export function createSeededRandom(seed: number): () => number {
  const rng = new SeededRandom(seed);
  return () => rng.next();
}

/** 兼容 facade：直接替换 Runtime Source。 */
export function setRandomSource(fn: (() => number) | RandomSource | null): void {
  if (fn === null) {
    setRuntimeSources(productionRuntimeSources());
    return;
  }
  const randomSource: RandomSource =
    typeof (fn as RandomSource).next === 'function'
      ? (fn as RandomSource)
      : { next: fn as () => number };
  const current = getRuntimeSources();
  setRuntimeSources({ ...current, random: randomSource });
}

// 重新导出
export {
  productionRuntimeSources,
  seededRuntimeSources,
  withRuntimeSources,
  getRuntimeSources,
  setRuntimeSources,
  SeededRandom,
  DeterministicClock,
  DeterministicCounterIdSource,
  SystemRandom,
  SystemClock,
  ProductionIdSource,
  type RuntimeSources,
  type RandomSource,
  type ClockSource,
  type IdSource,
};
