// Phase 8C：官方可信 Trinket 数据。
//
// 收录标准（数据策略，严格执行）：
// 1. 名称、等级、正/负面效果、价格全部有可查出处（规则书或用户提供的可信数据）；
// 2. 只要有任何一项靠推测，就不得写入本文件 —— 放进 import 模板等待补齐；
// 3. 本文件中的条目才允许 enabledInOfficialPool = true。
//
// 当前已核实条目：Critical Stone（规则书 Trinket 示例卡）。
// 其余 37 张官方卡牌的效果规则书未逐张列出，禁止编造，
// 见 official-trinket-import-template.json。

import type { TrinketDefinition } from '../../types/trinkets';
import { buyPriceForLevel, sellPriceForLevel } from './trinket-pricing';

/**
 * Critical Stone（暴击石）。
 * - Positive：攻击掷骰前声明，本次攻击暴击 +2（暴击阈值由 10 降到 8）；
 * - Negative：攻击掷骰前声明，本次攻击命中 -2；
 * - 使用任一面后翻到另一面（关键规则 4）。
 */
export const CRITICAL_STONE: TrinketDefinition = {
  id: 'critical-stone',
  name: 'Critical Stone',
  level: 1,
  positiveSide: {
    side: 'positive',
    label: '暴击 +2',
    description: '攻击掷骰前声明：本次攻击暴击 +2。使用后翻到负面。',
    useWindows: ['before-attack-roll'],
    modifiers: [{ type: 'crit', amount: 2 }],
    effects: [],
    canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
  },
  negativeSide: {
    side: 'negative',
    label: '命中 -2',
    description: '攻击掷骰前声明：本次攻击命中 -2。使用后翻回正面。',
    useWindows: ['before-attack-roll'],
    modifiers: [{ type: 'accuracy', amount: -2 }],
    effects: [],
    canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
  },
  sellPrice: sellPriceForLevel(1),
  buyPrice: buyPriceForLevel(1),
  officialDataStatus: 'verified',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf — Trinket 示例卡 Critical Stone；价格取 Level I 通用买/卖价',
  enabledInOfficialPool: true,
  dataOrigin: 'official',
};

/** 已核实的官方 Trinket 列表（唯一允许进入官方池的数据来源）。 */
export const VERIFIED_TRINKETS: TrinketDefinition[] = [CRITICAL_STONE];
