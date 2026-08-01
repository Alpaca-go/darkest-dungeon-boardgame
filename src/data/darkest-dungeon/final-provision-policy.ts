// Phase 10A §17：Final Provision（Final Encounter 前的 Roll for Provisions）策略 + Data Gate。
//
// 规则 26 / 27：进入 Final Encounter 之前进行一次 Roll for Provisions。
//
// 资料缺口（§4 审计结论）：规则书上「Final Encounter 专用补给掷骰表」的骰面数与
// 骰值 → 数量映射 **未核对**，因此：
// - OFFICIAL_FINAL_PROVISION_POLICY 刻意留空（dieFaces = 0 / grantTable = {}），
//   validate 必然失败 → isFinalProvisionOfficialEnabled() 恒为 false（硬约束 19）；
// - PROTOTYPE_FINAL_PROVISION_POLICY 提供 harness 数值，仅用于验证
//   「先掷先保存 / 刷新不重掷 / 写入公共 Provision Pool」这套流程（硬约束 4）。
//
// 硬约束 21：不得使用电子游戏数值 —— 下面 prototype 表是**流程占位**，
// 明确标注为 prototype，接入正式卡面时整表替换。

import type { ProvisionPool } from '../../types';
import type { ActFourDataStatus } from '../../types/act-four';

export type ProvisionType = keyof ProvisionPool;

/** 五种补给类型（与 ProvisionPool 字段一一对应）。 */
export const FINAL_PROVISION_TYPES: ProvisionType[] = [
  'food',
  'bandage',
  'potion',
  'torch',
  'tool',
];

export interface FinalProvisionPolicy {
  id: string;
  /** 每种补给掷一个 dieFaces 面骰。0 表示数据缺失。 */
  dieFaces: number;
  provisionTypes: ProvisionType[];
  /** 骰值 → 该补给获得数量。空表示数据缺失。 */
  grantTable: Record<number, number>;
  officialDataStatus: ActFourDataStatus;
  sourceReference?: string;
  enabledInOfficialPool: boolean;
}

// ---------------------------------------------------------------------------
// 正式策略（刻意留空 → Data Gate）
// ---------------------------------------------------------------------------

export const OFFICIAL_FINAL_PROVISION_POLICY: FinalProvisionPolicy = {
  id: 'final-provision-official',
  dieFaces: 0,
  provisionTypes: FINAL_PROVISION_TYPES,
  grantTable: {},
  officialDataStatus: 'unavailable',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// Prototype 策略（harness）
// ---------------------------------------------------------------------------

export const PROTOTYPE_FINAL_PROVISION_POLICY_ID = 'prototype-final-provision-policy';

export const PROTOTYPE_FINAL_PROVISION_POLICY: FinalProvisionPolicy = {
  id: PROTOTYPE_FINAL_PROVISION_POLICY_ID,
  dieFaces: 6,
  provisionTypes: FINAL_PROVISION_TYPES,
  // 纯流程占位：1—2 → 1 个，3—4 → 2 个，5—6 → 3 个。
  grantTable: { 1: 1, 2: 1, 3: 2, 4: 2, 5: 3, 6: 3 },
  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// 取数 / 校验
// ---------------------------------------------------------------------------

export function getFinalProvisionPolicy(
  mode: 'formal' | 'prototype' = 'prototype',
): FinalProvisionPolicy {
  return mode === 'formal' ? OFFICIAL_FINAL_PROVISION_POLICY : PROTOTYPE_FINAL_PROVISION_POLICY;
}

export interface FinalProvisionValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

export function validateFinalProvisionPolicy(
  policy: FinalProvisionPolicy,
): FinalProvisionValidationResult {
  const missing: string[] = [];
  const issues: string[] = [];

  if (policy.dieFaces <= 0) missing.push('final-provision-die-faces');
  if (Object.keys(policy.grantTable).length === 0) missing.push('final-provision-grant-table');
  if (policy.provisionTypes.length === 0) missing.push('final-provision-types');

  // grantTable 必须覆盖每一个骰面，否则掷出未覆盖的点数会静默丢失。
  if (policy.dieFaces > 0) {
    const uncovered: number[] = [];
    for (let face = 1; face <= policy.dieFaces; face += 1) {
      if (policy.grantTable[face] === undefined) uncovered.push(face);
    }
    if (uncovered.length > 0) {
      issues.push(`grantTable 未覆盖骰面：${uncovered.join(',')}`);
    }
  }

  if (policy.officialDataStatus === 'unavailable') {
    issues.push('Final Provision 掷骰表缺失（unavailable）→ official 禁用');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

/** official Final Provision 是否启用（数据齐备才为 true）。 */
export function isFinalProvisionOfficialEnabled(): boolean {
  const policy = OFFICIAL_FINAL_PROVISION_POLICY;
  return (
    policy.enabledInOfficialPool &&
    policy.officialDataStatus === 'verified' &&
    validateFinalProvisionPolicy(policy).isComplete
  );
}

export function getFinalProvisionDataGaps(): string[] {
  const result = validateFinalProvisionPolicy(OFFICIAL_FINAL_PROVISION_POLICY);
  if (result.isComplete) return [];
  return [
    `final-provision-policy（${[...result.missing, ...result.issues].join('；')}）`,
  ];
}
