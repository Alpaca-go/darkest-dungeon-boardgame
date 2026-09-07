// Phase 11A.2 §25–§28 — Runtime Sources。
//
// 单一真相：所有 Random / Clock / Id 调用都通过 RuntimeSources 注入。
// Production 模式下用 SystemRandom / SystemClock / ProductionIdSource；
// Golden / Replay 模式下用 SeededRandom / DeterministicClock / DeterministicCounterIdSource。
//
// Phase 11A.2 只把 facade 建立好（dev doc §29）；gameplay 路径的 Math.random / Date.now
// 全部委托给 RuntimeSources 内的 SystemRandom / SystemClock（dev doc §27）。

// ---------------------------------------------------------------------------
// 接口
// ---------------------------------------------------------------------------

export interface RandomSource {
  /** 返回 [0, 1) 的浮点数。 */
  next(): number;
}

export interface ClockSource {
  /** 当前时间（毫秒）。 */
  nowMs(): number;
  /** 当前时间（ISO 字符串）。 */
  nowIso(): string;
}

export interface IdSource {
  /** 生成带前缀的唯一 id。 */
  create(prefix: string): string;
}

export interface RuntimeSources {
  random: RandomSource;
  clock: ClockSource;
  ids: IdSource;
}

// ---------------------------------------------------------------------------
// Production 默认（系统真实值）
// ---------------------------------------------------------------------------

export class SystemRandom implements RandomSource {
  next(): number {
    return Math.random();
  }
}

export class SystemClock implements ClockSource {
  nowMs(): number {
    return Date.now();
  }
  nowIso(): string {
    return new Date().toISOString();
  }
}

export class ProductionIdSource implements IdSource {
  create(prefix: string): string {
    const rand = Math.random().toString(36).slice(2, 8);
    return `${prefix}_${Date.now().toString(36)}_${rand}`;
  }
}

export function productionRuntimeSources(): RuntimeSources {
  return {
    random: new SystemRandom(),
    clock: new SystemClock(),
    ids: new ProductionIdSource(),
  };
}

// ---------------------------------------------------------------------------
// Golden / Replay 确定性实现
// ---------------------------------------------------------------------------

/** SeededRandom：基于 mulberry32 算法的确定性 RNG。 */
export class SeededRandom implements RandomSource {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }
  next(): number {
    let a = this.state;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    this.state = (t ^ (t >>> 14)) >>> 0;
    return this.state / 4294967296;
  }
}

/** DeterministicClock：固定 Epoch + monotonic tick。 */
export class DeterministicClock implements ClockSource {
  private currentMs: number;
  private tick: number;
  constructor(epochMs: number = 0) {
    this.currentMs = epochMs;
    this.tick = 0;
  }
  /** 每次调用 nowIso 推进 1ms，保证 unique id / 排序稳定。 */
  nowMs(): number {
    this.tick += 1;
    this.currentMs += 1;
    return this.currentMs;
  }
  nowIso(): string {
    const iso = new Date(this.nowMs()).toISOString();
    return iso;
  }
}

/** DeterministicCounterIdSource：ID = <prefix>_<seed>_<counter>。 */
export class DeterministicCounterIdSource implements IdSource {
  private counter: number;
  private seed: number;
  constructor(seed: number = 0) {
    this.seed = seed >>> 0;
    this.counter = 0;
  }
  create(prefix: string): string {
    this.counter += 1;
    return `${prefix}_${this.seed.toString(36)}_${this.counter.toString(36)}`;
  }
}

export function seededRuntimeSources(seed: number): RuntimeSources {
  return {
    random: new SeededRandom(seed),
    clock: new DeterministicClock(0),
    ids: new DeterministicCounterIdSource(seed),
  };
}

// ---------------------------------------------------------------------------
// 模块级 Source 管理
// ---------------------------------------------------------------------------

/** 当前生效的 Runtime Sources。默认 = production。 */
let currentSources: RuntimeSources = productionRuntimeSources();

/** 读当前 Runtime Sources。 */
export function getRuntimeSources(): RuntimeSources {
  return currentSources;
}

/** 直接替换当前 Runtime Sources。 */
export function setRuntimeSources(sources: RuntimeSources): void {
  currentSources = sources;
}

/**
 * 在 fn 执行期间临时替换 Runtime Sources，结束后恢复（即便 fn 抛错）。
 * 主要给测试和 Golden Run 使用。
 */
export function withRuntimeSources<T>(sources: RuntimeSources, fn: () => T): T {
  const prev = currentSources;
  currentSources = sources;
  try {
    return fn();
  } finally {
    currentSources = prev;
  }
}

// ---------------------------------------------------------------------------
// 便捷 facade
// ---------------------------------------------------------------------------

/** 生成 [0, 1) 浮点数。 */
export function randomNext(): number {
  return currentSources.random.next();
}

/** 当前 ISO 时间。 */
export function nowIso(): string {
  return currentSources.clock.nowIso();
}

/** 当前毫秒时间。 */
export function nowMs(): number {
  return currentSources.clock.nowMs();
}

/** 生成带前缀的唯一 id。 */
export function createId(prefix: string = 'id'): string {
  return currentSources.ids.create(prefix);
}
