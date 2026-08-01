// Phase 10A：Act IV 可注入 RNG（硬约束：不使用 Math.random()）。
//
// 与 Phase 9B—9E 家族运行时同构：所有随机点都接收一个 `() => number` 随机源，
// 测试用脚本化序列，E2E / Debug 用 seed 复现。

/** 确定性 RNG（mulberry32）。同 seed 同序列。 */
export function createSeededRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 脚本化 RNG：按给定序列依次返回，用尽后循环。仅测试 / Debug 使用。 */
export function createScriptedRng(values: number[]): () => number {
  if (values.length === 0) return () => 0;
  let index = 0;
  return () => {
    const v = values[index % values.length];
    index += 1;
    return v;
  };
}

/** 掷一个 d10（1—10）。 */
export function rollD10(rng: () => number): number {
  const v = Math.floor(rng() * 10) + 1;
  return Math.min(10, Math.max(1, v));
}

/** 掷一个 Provision Die（d6，1—6；规则书 Provision Die 为六面）。 */
export function rollProvisionDie(rng: () => number): number {
  const v = Math.floor(rng() * 6) + 1;
  return Math.min(6, Math.max(1, v));
}

/** 从数组中随机取一个下标（空数组返回 -1）。 */
export function pickIndex(rng: () => number, length: number): number {
  if (length <= 0) return -1;
  const i = Math.floor(rng() * length);
  return Math.min(length - 1, Math.max(0, i));
}

/** Fisher-Yates 洗牌（返回新数组，不改输入）。 */
export function shuffleWithRng<T>(rng: () => number, input: readonly T[]): T[] {
  const out = input.slice();
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.max(0, Math.floor(rng() * (i + 1))));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** 生成一个可追溯的 RNG 状态 ID（写入随机结果记录，便于审计）。 */
export function rngStateId(seedLabel: string, drawIndex: number): string {
  return `${seedLabel}#${drawIndex}`;
}
