// Phase 8C：原型 Trinket 数据（仅用于跑通引擎与测试）。
//
// 硬性约束：
// - dataOrigin 一律为 'prototype'，officialDataStatus 一律为 'prototype'；
// - enabledInOfficialPool 一律为 false —— 原型卡永远不会出现在 Nomad Wagon
//   展示位、Loot 抽取、Quest Reward 等任何官方来源里；
// - 只能通过 Debug 面板显式授予。
//
// 这些数值全部是自造的，与官方规则无关，禁止据此推断官方内容。

import type { TrinketDefinition } from '../../types/trinkets';
import { buyPriceForLevel, sellPriceForLevel } from './trinket-pricing';

function proto(
  partial: Omit<TrinketDefinition, 'officialDataStatus' | 'enabledInOfficialPool' | 'dataOrigin' | 'sellPrice' | 'buyPrice'>
): TrinketDefinition {
  return {
    ...partial,
    sellPrice: sellPriceForLevel(partial.level),
    buyPrice: buyPriceForLevel(partial.level),
    officialDataStatus: 'prototype',
    enabledInOfficialPool: false,
    dataOrigin: 'prototype',
  };
}

export const PROTOTYPE_TRINKETS: TrinketDefinition[] = [
  proto({
    id: 'prototype-attack-stone',
    name: '原型·攻击石',
    level: 1,
    positiveSide: {
      side: 'positive',
      label: '伤害 +2',
      description: '（原型数据）攻击掷骰前声明：本次攻击伤害 +2。',
      useWindows: ['before-attack-roll'],
      modifiers: [{ type: 'damage', amount: 2 }],
      effects: [],
      canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
    negativeSide: {
      side: 'negative',
      label: '命中 -1 且自伤 1',
      description: '（原型数据）攻击掷骰前声明：本次攻击命中 -1，并对自身造成 1 点伤害。',
      useWindows: ['before-attack-roll'],
      modifiers: [{ type: 'accuracy', amount: -1 }],
      effects: [{ type: 'damage-self', amount: 1 }],
      canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
  }),
  proto({
    id: 'prototype-healing-charm',
    name: '原型·治愈护符',
    level: 1,
    positiveSide: {
      side: 'positive',
      label: '回复 2 HP',
      description: '（原型数据）英雄回合开始时声明：恢复 2 点生命。',
      useWindows: ['hero-turn-start'],
      modifiers: [],
      effects: [{ type: 'heal-self', amount: 2 }],
      canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
    negativeSide: {
      side: 'negative',
      label: '受到 1 点伤害',
      description: '（原型数据）英雄回合开始时声明：受到 1 点伤害，并翻回正面。',
      useWindows: ['hero-turn-start'],
      modifiers: [],
      effects: [{ type: 'damage-self', amount: 1 }],
      canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
  }),
  proto({
    id: 'prototype-stress-charm',
    name: '原型·静心符',
    level: 2,
    positiveSide: {
      side: 'positive',
      label: 'Stress -2',
      description: '（原型数据）英雄回合开始时声明：压力降低 2。',
      useWindows: ['hero-turn-start'],
      modifiers: [],
      effects: [{ type: 'recover-stress-self', amount: 2 }],
      canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
    negativeSide: {
      side: 'negative',
      label: 'Stress +1',
      description: '（原型数据）英雄回合开始时声明：压力增加 1，并翻回正面。',
      useWindows: ['hero-turn-start'],
      modifiers: [],
      effects: [{ type: 'stress-self', amount: 1 }],
      canUse: [{ type: 'in-battle' }, { type: 'is-acting-hero' }],
    },
  }),
  proto({
    id: 'prototype-dungeon-die-token',
    name: '原型·地牢骰记号',
    level: 2,
    positiveSide: {
      side: 'positive',
      label: '地牢骰 +1',
      description: '（原型数据）地牢掷骰前声明：本次地牢掷骰 +1。',
      useWindows: ['before-dungeon-roll'],
      modifiers: [{ type: 'dungeon-roll', amount: 1 }],
      effects: [],
      canUse: [{ type: 'out-of-battle' }],
    },
    negativeSide: {
      side: 'negative',
      label: '地牢骰 -1',
      description: '（原型数据）地牢掷骰前声明：本次地牢掷骰 -1，并翻回正面。',
      useWindows: ['before-dungeon-roll'],
      modifiers: [{ type: 'dungeon-roll', amount: -1 }],
      effects: [],
      canUse: [{ type: 'out-of-battle' }],
    },
  }),
  proto({
    id: 'prototype-light-token',
    name: '原型·火光记号',
    level: 1,
    positiveSide: {
      side: 'positive',
      label: '光照 +1',
      description: '（原型数据）进入房间时声明：光照 +1。',
      useWindows: ['room-entered'],
      modifiers: [],
      effects: [{ type: 'change-light', amount: 1 }],
      canUse: [{ type: 'out-of-battle' }],
    },
    negativeSide: {
      side: 'negative',
      label: '光照 -1',
      description: '（原型数据）进入房间时声明：光照 -1，并翻回正面。',
      useWindows: ['room-entered'],
      modifiers: [],
      effects: [{ type: 'change-light', amount: -1 }],
      canUse: [{ type: 'out-of-battle' }],
    },
  }),
  proto({
    id: 'prototype-condition-charm',
    name: '原型·血契护符',
    level: 3,
    positiveSide: {
      side: 'positive',
      label: '战斗开始 +1 伤害修正',
      description: '（原型数据）战斗开始时声明：记录一次增益（仅日志，用于验证窗口开合）。',
      useWindows: ['battle-started'],
      modifiers: [],
      effects: [{ type: 'log-only', note: '血契生效：本场战斗士气高涨' }],
      canUse: [{ type: 'in-battle' }],
    },
    negativeSide: {
      side: 'negative',
      label: '自身 Bleed 1 层',
      description: '（原型数据）战斗开始时声明：自身获得 1 层 Bleed，并翻回正面。',
      useWindows: ['battle-started'],
      modifiers: [],
      effects: [{ type: 'apply-condition-self', condition: 'bleed', amount: 1 }],
      canUse: [{ type: 'in-battle' }],
    },
  }),
];
