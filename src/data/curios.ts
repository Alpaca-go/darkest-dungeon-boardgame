// Phase 8B：Curio 数据（最小实现）。
//
// 本阶段 Curio 只作为「Disease 感染来源」存在，不实现 Provision 交互、
// Trinket 掉落等完整 Curio 玩法（Trinket 属于禁止实现范围）。
// 至少提供 2 个感染型 Curio：1 个必定感染、1 个 d10 判定感染。

import type { CurioDefinition } from '../types';

export const CURIOS: CurioDefinition[] = [
  {
    id: 'plague-cart',
    name: 'Plague Cart',
    description: '一辆堆满腐尸的运尸车。搜查它的人必定染上 Black Plague。',
    effect: { kind: 'disease-guaranteed', diseaseId: 'black-plague' },
    color: '#4a5d3a',
  },
  {
    id: 'infested-trough',
    name: 'Infested Trough',
    description: '爬满蛆虫的饮水槽。掷 d10，≤5 时感染 Tapeworm。',
    effect: {
      kind: 'disease-chance',
      diseaseId: 'tapeworm',
      d10AtMost: 5,
      safeMessage: '水槽中的秽物没有侵入体内，虚惊一场。',
    },
    color: '#6b5b3a',
  },
  {
    id: 'eerie-spiderweb',
    name: 'Eerie Spiderweb',
    description: '一张巨大的蛛网。掷 d10，≤3 时感染 Spotted Fever。',
    effect: {
      kind: 'disease-chance',
      diseaseId: 'spotted-fever',
      d10AtMost: 3,
      safeMessage: '蛛网下只有干枯的虫壳，安然无恙。',
    },
    color: '#5a5a6b',
  },
  {
    id: 'shallow-grave',
    name: 'Shallow Grave',
    description: '一座浅坟，翻找后可获得 5 Gold。',
    effect: { kind: 'gold', amount: 5 },
    color: '#7a6a4a',
  },
];

/** 会导致感染的 Curio（房间生成时优先从中抽取，保证感染来源可达）。 */
export const INFECTIOUS_CURIOS = CURIOS.filter((c) => c.effect.kind !== 'gold');

export function getCurioById(id: string | null | undefined): CurioDefinition | undefined {
  if (!id) return undefined;
  return CURIOS.find((c) => c.id === id);
}
