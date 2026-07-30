// Phase 8C：Trinket Registry —— 全部 Trinket 定义的唯一查询入口。
//
// 两条不可越过的红线：
// 1. 官方池 = verified 且 enabledInOfficialPool 的条目；prototype 数据永不进入；
// 2. 未知 / 缺字段的 Trinket 不得导致白屏 —— 查询失败一律返回 undefined，
//    由调用方走安全兜底（核心约束 10）。

import type {
  TrinketDefinition,
  TrinketLevel,
  TrinketRegistrySummary,
  TrinketSide,
  TrinketSideDefinition,
} from '../../types/trinkets';
import { VERIFIED_TRINKETS } from './verified-trinkets';
import { PROTOTYPE_TRINKETS } from './prototype-trinkets';
import importTemplate from './official-trinket-import-template.json';

/** 官方核心盒 Trinket 标称总数（规则书）。 */
export const EXPECTED_CORE_TRINKET_COUNT = 38;

/** 全部已定义 Trinket（官方可信 + 原型）。 */
export const ALL_TRINKETS: TrinketDefinition[] = [...VERIFIED_TRINKETS, ...PROTOTYPE_TRINKETS];

const BY_ID = new Map<string, TrinketDefinition>();
for (const t of ALL_TRINKETS) {
  if (!BY_ID.has(t.id)) BY_ID.set(t.id, t);
}

/** 按 id 查询定义；未知 id 返回 undefined（绝不抛错）。 */
export function getTrinketById(id: string | null | undefined): TrinketDefinition | undefined {
  if (!id) return undefined;
  return BY_ID.get(id);
}

/** 未知 Trinket 的安全展示名（用于日志与 UI 兜底）。 */
export function trinketDisplayName(id: string | null | undefined): string {
  return getTrinketById(id)?.name ?? `未知饰品(${id ?? 'null'})`;
}

/** 取指定面的定义；未知 id 返回 undefined。 */
export function getTrinketSide(
  id: string | null | undefined,
  side: TrinketSide
): TrinketSideDefinition | undefined {
  const def = getTrinketById(id);
  if (!def) return undefined;
  return side === 'positive' ? def.positiveSide : def.negativeSide;
}

/** 官方池：只有 verified 且显式开启的条目。 */
export function officialTrinketPool(): TrinketDefinition[] {
  return ALL_TRINKETS.filter(
    (t) => t.dataOrigin === 'official' && t.officialDataStatus === 'verified' && t.enabledInOfficialPool
  );
}

/** 官方池中指定等级的候选。 */
export function officialTrinketPoolByLevel(level: TrinketLevel): TrinketDefinition[] {
  return officialTrinketPool().filter((t) => t.level === level);
}

/** 原型池（仅 Debug 使用）。 */
export function prototypeTrinketPool(): TrinketDefinition[] {
  return ALL_TRINKETS.filter((t) => t.dataOrigin === 'prototype');
}

// ---------------------------------------------------------------------------
// 数据可信度校验
// ---------------------------------------------------------------------------

const REQUIRED_SIDE_FIELDS: (keyof TrinketSideDefinition)[] = [
  'side',
  'label',
  'description',
  'useWindows',
  'modifiers',
  'effects',
];

function checkSide(def: TrinketDefinition, side: TrinketSide, out: string[]): void {
  const s = side === 'positive' ? def.positiveSide : def.negativeSide;
  if (!s) {
    out.push(`${def.id}.${side}Side 缺失`);
    return;
  }
  for (const f of REQUIRED_SIDE_FIELDS) {
    if (s[f] === undefined || s[f] === null) out.push(`${def.id}.${side}Side.${String(f)} 缺失`);
  }
  if (s.side !== side) out.push(`${def.id}.${side}Side.side 标记错误（${s.side}）`);
}

/** 已填写的官方模板槽位数量（filled=true）。 */
export function filledTemplateSlotCount(): number {
  const entries = (importTemplate as { entries?: { filled?: boolean }[] }).entries ?? [];
  return entries.filter((e) => e.filled === true).length;
}

/**
 * 校验 Registry 完整性与数据策略遵从度。
 * 只报告、不修改数据；Debug 面板与单元测试共用。
 */
export function validateTrinketRegistry(
  defs: TrinketDefinition[] = ALL_TRINKETS
): TrinketRegistrySummary {
  const seen = new Set<string>();
  const duplicateIds: string[] = [];
  const missingRequiredFields: string[] = [];
  const policyViolations: string[] = [];

  let verified = 0;
  let partial = 0;
  let prototype = 0;
  let unavailable = 0;
  let enabledOfficial = 0;

  for (const def of defs) {
    if (!def.id) {
      missingRequiredFields.push('<匿名条目>.id 缺失');
      continue;
    }
    if (seen.has(def.id)) duplicateIds.push(def.id);
    seen.add(def.id);

    if (!def.name) missingRequiredFields.push(`${def.id}.name 缺失`);
    if (def.level !== 1 && def.level !== 2 && def.level !== 3) {
      missingRequiredFields.push(`${def.id}.level 非法（${String(def.level)}）`);
    }
    if (typeof def.sellPrice !== 'number') missingRequiredFields.push(`${def.id}.sellPrice 缺失`);
    if (def.buyPrice === undefined) missingRequiredFields.push(`${def.id}.buyPrice 缺失（无数据请显式写 null）`);
    checkSide(def, 'positive', missingRequiredFields);
    checkSide(def, 'negative', missingRequiredFields);

    switch (def.officialDataStatus) {
      case 'verified':
        verified += 1;
        break;
      case 'partial':
        partial += 1;
        break;
      case 'prototype':
        prototype += 1;
        break;
      default:
        unavailable += 1;
        break;
    }

    if (def.enabledInOfficialPool) {
      enabledOfficial += 1;
      if (def.officialDataStatus !== 'verified') {
        policyViolations.push(`${def.id} 未核实（${def.officialDataStatus}）却被标记进入官方池`);
      }
      if (def.dataOrigin !== 'official') {
        policyViolations.push(`${def.id} 是 ${def.dataOrigin} 数据却被标记进入官方池`);
      }
    }
    if (def.dataOrigin === 'prototype' && def.officialDataStatus !== 'prototype') {
      policyViolations.push(`${def.id} 是原型数据但 officialDataStatus=${def.officialDataStatus}`);
    }
    if (def.officialDataStatus === 'verified' && !def.sourceReference) {
      policyViolations.push(`${def.id} 标记为 verified 但缺少 sourceReference 出处`);
    }
  }

  const officialVerified = defs.filter(
    (d) => d.dataOrigin === 'official' && d.officialDataStatus === 'verified'
  ).length;

  return {
    expectedCoreCount: EXPECTED_CORE_TRINKET_COUNT,
    totalDefinitions: defs.length,
    verifiedDefinitions: verified,
    partialDefinitions: partial,
    prototypeDefinitions: prototype,
    unavailableSlots: unavailable,
    enabledOfficialDefinitions: enabledOfficial,
    missingOfficialCount: Math.max(0, EXPECTED_CORE_TRINKET_COUNT - officialVerified),
    duplicateIds,
    missingRequiredFields,
    policyViolations,
  };
}
