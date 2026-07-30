// Phase 7：Stress 常量（单独文件避免 stress.ts 与 resolve-test.ts 循环依赖）。

/** Stress 上限（达到即触发阈值事件）。 */
export const STRESS_MAX = 10;

/** Stress 下限。 */
export const STRESS_MIN = 0;

/** 钳制 Stress 到 [0, 10]。 */
export function clampStressValue(n: number): number {
  if (!Number.isFinite(n)) return STRESS_MIN;
  return Math.max(STRESS_MIN, Math.min(STRESS_MAX, Math.round(n)));
}
