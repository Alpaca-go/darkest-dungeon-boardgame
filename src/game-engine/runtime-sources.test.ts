// Phase 11A.2 §45 单元测试 13-20：Runtime Sources。

import { describe, expect, it } from 'vitest';
import {
  SeededRandom,
  DeterministicClock,
  DeterministicCounterIdSource,
  productionRuntimeSources,
  seededRuntimeSources,
  withRuntimeSources,
  randomNext,
  nowIso,
  nowMs,
  createId,
  setRuntimeSources,
  getRuntimeSources,
} from './runtime-sources';

describe('Runtime Sources (Phase 11A.2 §45 13–20)', () => {
  it('13. same seed random 相同', () => {
    const a = new SeededRandom(42);
    const b = new SeededRandom(42);
    for (let i = 0; i < 100; i++) {
      expect(a.next()).toBe(b.next());
    }
  });

  it('14. deterministic clock 相同', () => {
    const a = new DeterministicClock(1000);
    const b = new DeterministicClock(1000);
    for (let i = 0; i < 20; i++) {
      expect(a.nowIso()).toBe(b.nowIso());
    }
  });

  it('15. deterministic IDs 相同', () => {
    const a = new DeterministicCounterIdSource(42);
    const b = new DeterministicCounterIdSource(42);
    for (let i = 0; i < 20; i++) {
      expect(a.create('h')).toBe(b.create('h'));
    }
  });

  it('16. ID counter 单调', () => {
    const ids = new DeterministicCounterIdSource(1);
    const a = ids.create('a');
    const b = ids.create('a');
    const c = ids.create('a');
    expect(a).not.toBe(b);
    expect(b).not.toBe(c);
    expect(a < b).toBe(true);
    expect(b < c).toBe(true);
  });

  it('17. withRuntimeSources 正常恢复', () => {
    const defaultSources = getRuntimeSources();
    const testSources = seededRuntimeSources(12345);
    withRuntimeSources(testSources, () => {
      expect(getRuntimeSources()).toBe(testSources);
    });
    expect(getRuntimeSources()).toBe(defaultSources);
  });

  it('18. throw 时也恢复', () => {
    const defaultSources = getRuntimeSources();
    const testSources = seededRuntimeSources(99);
    expect(() => {
      withRuntimeSources(testSources, () => {
        throw new Error('boom');
      });
    }).toThrow('boom');
    expect(getRuntimeSources()).toBe(defaultSources);
  });

  it('19. createId 不直接 Math.random', () => {
    // 在 deterministic 模式下，createId 走 counter，输出可预测
    const testSources = seededRuntimeSources(7);
    withRuntimeSources(testSources, () => {
      const id1 = createId('qrun');
      const id2 = createId('qrun');
      expect(id1).toBe('qrun_7_1');
      expect(id2).toBe('qrun_7_2');
    });
  });

  it('20. nowIso 不直接系统时钟', () => {
    const testSources = seededRuntimeSources(11);
    withRuntimeSources(testSources, () => {
      const t1 = nowIso();
      const t2 = nowIso();
      // 每次调用 monotonic 推进 1ms
      expect(t2 > t1).toBe(true);
      // t1 不是真实 Date.now() 字符串
      expect(t1).toMatch(/^1970-01-01T00:00:00/); // 0 epoch
    });
  });

  it('Production 默认 = SystemRandom / SystemClock / ProductionIdSource', () => {
    const p = productionRuntimeSources();
    // 验证 interface 满足
    expect(typeof p.random.next).toBe('function');
    expect(typeof p.clock.nowMs).toBe('function');
    expect(typeof p.ids.create).toBe('function');
    // 真值抽样
    const r = p.random.next();
    expect(r).toBeGreaterThanOrEqual(0);
    expect(r).toBeLessThan(1);
    const t = p.clock.nowIso();
    expect(t).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('seededRuntimeSources(seed) 返回确定性实现', () => {
    const s = seededRuntimeSources(123);
    expect(s.random).toBeInstanceOf(SeededRandom);
    expect(s.clock).toBeInstanceOf(DeterministicClock);
    expect(s.ids).toBeInstanceOf(DeterministicCounterIdSource);
  });

  it('setRuntimeSources 直接替换', () => {
    const original = getRuntimeSources();
    const s = seededRuntimeSources(5);
    setRuntimeSources(s);
    expect(getRuntimeSources()).toBe(s);
    setRuntimeSources(original);
  });

  it('randomNext / nowMs 走当前 sources', () => {
    withRuntimeSources(seededRuntimeSources(77), () => {
      const r1 = randomNext();
      const r2 = randomNext();
      expect(r1).not.toBe(r2); // 至少两次调用
      // 同样 seed 同样序列
      const ref = new SeededRandom(77);
      expect(r1).toBe(ref.next()); // but ref already advanced, so we just check it's a valid value
      const m1 = nowMs();
      const m2 = nowMs();
      expect(m2).toBeGreaterThan(m1);
    });
  });
});
