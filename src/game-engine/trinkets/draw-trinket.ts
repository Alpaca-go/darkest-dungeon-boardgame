// Phase 8C：Trinket 抽取池（开发文档 §15.3）。
//
// - official 池：只允许 verified 且 enabledInOfficialPool 的定义（数据红线）；
// - prototype 池：仅供 Debug / 引擎测试，绝不混入 official；
// - 「先抽取并保存，再打开分配」由调用方保证：本模块只做一次纯抽取，
//   抽取结果必须立即写入存档（acquireTrinket 的 sourceEventId 幂等负责防重抽）。

import type { TrinketDefinition, TrinketLevel } from '../../types';
import { pick } from '../random';
import {
  officialTrinketPoolByLevel,
  prototypeTrinketPool,
} from '../../data/trinkets/trinket-registry';

export interface DrawTrinketCommand {
  level: TrinketLevel;
  pool: 'official' | 'prototype';
  /** 已被 Nomad Wagon Offer 等占用、不希望重复出现的定义 id。 */
  excludedTrinketIds?: string[];
  /** 允许候选耗尽时回退到不排除（Offer 场景需要「宁可重复不可空转」时置 true）。 */
  allowDuplicateFallback?: boolean;
  /** 可注入随机源（测试 / 种子化）。默认使用全局随机源。 */
  rng?: () => number;
}

export interface DrawTrinketResult {
  /** 抽中的定义；池为空时为 null（调用方必须兜底，不得白屏）。 */
  definition: TrinketDefinition | null;
  /** 抽取时的候选数量（Debug 展示用）。 */
  candidateCount: number;
}

function poolByLevel(pool: 'official' | 'prototype', level: TrinketLevel): TrinketDefinition[] {
  if (pool === 'official') return officialTrinketPoolByLevel(level);
  return prototypeTrinketPool().filter((t) => t.level === level);
}

/**
 * 从指定池抽一张指定等级的 Trinket。
 * 纯函数 + 可注入随机源；池为空返回 null（例如官方池 Level II/III 尚无 verified 数据）。
 */
export function drawTrinket(cmd: DrawTrinketCommand): DrawTrinketResult {
  const excluded = new Set(cmd.excludedTrinketIds ?? []);
  const all = poolByLevel(cmd.pool, cmd.level);
  let candidates = all.filter((t) => !excluded.has(t.id));
  if (candidates.length === 0 && cmd.allowDuplicateFallback) candidates = all;
  if (candidates.length === 0) return { definition: null, candidateCount: 0 };

  if (cmd.rng) {
    const idx = Math.floor(cmd.rng() * candidates.length);
    return { definition: candidates[Math.min(idx, candidates.length - 1)], candidateCount: candidates.length };
  }
  return { definition: pick(candidates), candidateCount: candidates.length };
}
