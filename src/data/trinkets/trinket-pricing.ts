// Phase 8C：Trinket 买卖价（Nomad Wagon）。
//
// 数据可信度说明（关键规则 11-13）：
// - Level I 购买价 = 4（规则书可确认）；
// - Level I / II / III 出售价 = 2 / 3 / 4（规则书可确认）；
// - Level II / III 的购买价规则书未提供可靠数值 —— 一律为 null，禁止臆测。
//   UI 遇到 null 必须禁用购买并显示「官方数据缺失」，而不是回退到某个猜测值。

import type { TrinketLevel } from '../../types/trinkets';

/** 出售价（全部等级均有可信数据）。 */
export const TRINKET_SELL_PRICE: Record<TrinketLevel, number> = {
  1: 2,
  2: 3,
  3: 4,
};

/** 购买价；null = 官方数据缺失，不可购买。 */
export const TRINKET_BUY_PRICE: Record<TrinketLevel, number | null> = {
  1: 4,
  2: null,
  3: null,
};

export function sellPriceForLevel(level: TrinketLevel): number {
  return TRINKET_SELL_PRICE[level];
}

export function buyPriceForLevel(level: TrinketLevel): number | null {
  return TRINKET_BUY_PRICE[level];
}

/** 购买价缺失时的统一提示文案（UI 与日志共用，避免各处自造措辞）。 */
export const BUY_PRICE_UNAVAILABLE_NOTE = '官方数据缺失：该等级购买价未在规则书中提供，暂不可购买';
