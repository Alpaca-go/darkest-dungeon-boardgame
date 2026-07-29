// 随机工具集中管理随机行为，便于未来加入固定 seed 与测试。
// 所有随机行为统一通过可注入的随机源（_rng），测试时可 setRandomSource 固定结果。

/** 内部随机源：默认 Math.random，测试时可被替换。 */
let _rng: () => number = Math.random;

/** 注入固定随机源（返回 [0,1) 的浮点数），便于测试断言。传 null 恢复默认。 */
export function setRandomSource(fn: (() => number) | null): void {
  _rng = fn ?? Math.random;
}

/**
 * 创建确定性伪随机源（mulberry32）。
 * 用于 E2E 与调试：同一 seed 产生完全相同的随机序列。
 */
export function createSeededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 生成带前缀的唯一 id。 */
export function createId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** 当前 ISO 时间戳。 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 返回 [1, sides] 的闭区间整数（掷骰）。 */
export function rollDie(sides: number): number {
  return 1 + Math.floor(_rng() * sides);
}

/** 掷 d10（1..10）。自然 10 视为暴击由调用方判定。 */
export function d10(): number {
  return rollDie(10);
}

/** 闭区间整数随机 [min, max]。 */
export function randInt(min: number, max: number): number {
  return Math.floor(_rng() * (max - min + 1)) + min;
}

/** 从数组中随机取一个元素。 */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(_rng() * arr.length)];
}

/** 返回数组的浅拷贝随机打乱结果（Fisher-Yates）。 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(_rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
