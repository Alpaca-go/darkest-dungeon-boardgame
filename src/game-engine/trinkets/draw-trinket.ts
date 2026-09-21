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
import { getTrinketPoolByLevel, type RuntimeContentContext } from '../../data/content-selector';
import { measureTrinketDeckCoverage, type TrinketDeckCoverage, type TrinketSourceForCoverage } from '../../audit/level2-trinket-deck';
import { COMMUNITY_TRINKET_CAPABILITIES, COMMUNITY_SOURCE_TRINKETS, type RuntimeCapabilityRecord } from '../../data/community-reference/production-runtime';

export interface DrawTrinketCommand {
  level: TrinketLevel;
  pool: 'official' | 'prototype';
  /** Production callers pass the persisted profile. Omission preserves legacy tests/debug. */
  runtimeContext?: RuntimeContentContext;
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

function poolByLevel(
  pool: 'official' | 'prototype',
  level: TrinketLevel,
  runtimeContext?: RuntimeContentContext,
): TrinketDefinition[] {
  if (runtimeContext) return getTrinketPoolByLevel(runtimeContext, level);
  if (pool === 'official') return officialTrinketPoolByLevel(level);
  return prototypeTrinketPool().filter((t) => t.level === level);
}

/**
 * 从指定池抽一张指定等级的 Trinket。
 * 纯函数 + 可注入随机源；池为空返回 null（例如官方池 Level II/III 尚无 verified 数据）。
 */
export function drawTrinket(cmd: DrawTrinketCommand): DrawTrinketResult {
  if (cmd.level === 2 && cmd.runtimeContext?.runtimeContentProfile === 'community-complete-edition') {
    const coverage = measureTrinketDeckCoverage(cmd.level);
    if (!coverage.completeForRandomDraw) return { definition: null, candidateCount: 0 };
  }
  const excluded = new Set(cmd.excludedTrinketIds ?? []);
  const all = poolByLevel(cmd.pool, cmd.level, cmd.runtimeContext);
  let candidates = all.filter((t) => !excluded.has(t.id));
  if (candidates.length === 0 && cmd.allowDuplicateFallback) candidates = all;
  if (candidates.length === 0) return { definition: null, candidateCount: 0 };

  if (cmd.rng) {
    const idx = Math.floor(cmd.rng() * candidates.length);
    return { definition: candidates[Math.min(idx, candidates.length - 1)], candidateCount: candidates.length };
  }
  return { definition: pick(candidates), candidateCount: candidates.length };
}

export interface SourceCompleteDrawResult extends DrawTrinketResult {
  coverage: TrinketDeckCoverage;
  error: 'SOURCE_DECK_INCOMPLETE' | 'RUNTIME_POOL_MISMATCH' | null;
}

/** Production random draw gate: partial or semantically incomplete source decks fail closed. */
export function drawSourceCompleteTrinket(
  cmd: Omit<DrawTrinketCommand, 'pool'> & {
    runtimeContext: RuntimeContentContext;
    capabilities?: readonly RuntimeCapabilityRecord[];
    sourceDefinitions?: readonly TrinketSourceForCoverage[];
  },
): SourceCompleteDrawResult {
  const sources = cmd.sourceDefinitions ?? COMMUNITY_SOURCE_TRINKETS;
  const capabilities = cmd.capabilities ?? COMMUNITY_TRINKET_CAPABILITIES;
  const coverage = measureTrinketDeckCoverage(cmd.level, sources, capabilities);
  if (!coverage.completeForRandomDraw) {
    return { definition: null, candidateCount: 0, coverage, error: 'SOURCE_DECK_INCOMPLETE' };
  }
  const pool = getTrinketPoolByLevel(cmd.runtimeContext, cmd.level);
  const requiredIds = new Set(sources.filter((source) => source.level === cmd.level && source.sourceStatus === 'source-supported').map((source) => source.id));
  if (pool.length !== requiredIds.size || pool.some((definition) => !requiredIds.has(definition.id))) {
    return { definition: null, candidateCount: pool.length, coverage, error: 'RUNTIME_POOL_MISMATCH' };
  }
  const excluded = new Set(cmd.excludedTrinketIds ?? []);
  let candidates = pool.filter((definition) => !excluded.has(definition.id));
  if (candidates.length === 0 && cmd.allowDuplicateFallback) candidates = pool;
  if (candidates.length === 0) return { definition: null, candidateCount: 0, coverage, error: null };
  if (!cmd.rng) return { definition: pick(candidates), candidateCount: candidates.length, coverage, error: null };
  const rawIndex = Math.floor(cmd.rng() * candidates.length);
  return {
    definition: candidates[Math.min(rawIndex, candidates.length - 1)],
    candidateCount: candidates.length,
    coverage,
    error: null,
  };
}
