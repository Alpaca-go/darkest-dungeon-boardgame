// 随机工具集中管理随机行为，便于未来加入固定 seed 与测试。
// Phase 1 仅提供了基础实现；后续阶段可在此统一接管随机源。

/** 生成带前缀的唯一 id。 */
export function createId(prefix = 'id'): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now().toString(36)}_${rand}`;
}

/** 当前 ISO 时间戳。 */
export function nowIso(): string {
  return new Date().toISOString();
}

/** 闭区间整数随机 [min, max]。 */
export function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

/** 从数组中随机取一个元素。 */
export function pick<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

/** 返回数组的浅拷贝随机打乱结果（Fisher-Yates）。 */
export function shuffle<T>(arr: readonly T[]): T[] {
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}
