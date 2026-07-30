// Phase 8B：全部 11 个 Disease 的数据定义（规则书 p.27—28）。
//
// 设计约束（开发文档 §6 / §8 / 核心约束 1—2）：
// - Disease 不拥有专属被动引擎，所有效果由 Phase 8A 的通用 Rule Event 引擎执行；
// - modifiers = 前置数值修正（只调 amount，不派生事件）；
// - reactions = 后置反应（由引擎路由到统一管线：applyStress / resolveDamage / ...）；
// - priority 越小越先执行（同 priority 时按 sourceType → instanceId 稳定排序）。
//
// 原型适配说明（Bleed / Blight）：
// 本原型的 Bleed / Blight 采用「层数递减」模型 —— 回合开始按当前层数扣血后层数 -1。
// 规则书中的「Bleed 1 / 2 turns」在此映射为 `potency` 层（= 1 层），
// `duration` 字段保留在定义中用于 UI 文案与规则溯源，不直接换算成层数，
// 否则 4 层 Bleed 将造成 4+3+2+1=10 点伤害，远超原型英雄的生命上限。

import type { DiseaseDefinition } from '../types';

/** 未知 Disease 的安全占位 id（迁移用；无任何效果，但可在 Sanitarium 移除）。 */
export const UNKNOWN_DISEASE_ID = 'unknown-disease';

/** 11 个正式 Disease。 */
export const ALL_DISEASES: DiseaseDefinition[] = [
  {
    id: 'black-plague',
    name: 'Black Plague',
    description: '当 Blight 被施加给该英雄时：额外施加 Blight 1 / 2 turns，并受到 2 × 英雄等级的伤害。',
    triggerTypes: ['blight-before-apply'],
    priority: 10,
    modifiers: [],
    reactions: [
      {
        eventType: 'blight-before-apply',
        effects: [
          { type: 'condition-self', condition: 'blight', potency: 1, duration: 2 },
          { type: 'damage-self-scaled', scaling: 'hero-level', multiplier: 2 },
        ],
      },
    ],
    rulesPage: 27,
  },
  {
    id: 'bulimic',
    name: 'Bulimic',
    description: '该英雄消耗 1 份 Food 时：额外丢弃 1 份 Food，并 +1 Stress。',
    triggerTypes: ['food-consumed'],
    priority: 20,
    modifiers: [],
    reactions: [
      {
        eventType: 'food-consumed',
        effects: [
          { type: 'consume-provision', provision: 'food', amount: 1 },
          { type: 'stress-self', amount: 1 },
        ],
      },
    ],
    rulesPage: 27,
  },
  {
    id: 'creeping-cough',
    name: 'Creeping Cough',
    description: '该英雄在 Exploration 中处理 Rubble 时：施加 Bleed 1 / 4 turns。',
    triggerTypes: ['rubble-resolved'],
    priority: 20,
    modifiers: [],
    reactions: [
      {
        eventType: 'rubble-resolved',
        effects: [{ type: 'condition-self', condition: 'bleed', potency: 1, duration: 4 }],
      },
    ],
    rulesPage: 27,
  },
  {
    id: 'ennui',
    name: 'Ennui',
    description: '该英雄进行 Resolve Test 时：Virtue 阈值 -1（与 Mercurial 叠加，最终钳制 0—10）。',
    triggerTypes: ['resolve-test'],
    priority: 20,
    modifiers: [{ eventType: 'resolve-test', flatDelta: -1 }],
    reactions: [],
    rulesPage: 27,
  },
  {
    id: 'hemophilia',
    name: 'Hemophilia',
    description: '当 Bleed 被施加给该英雄时：额外施加 Bleed 1 / 2 turns，并受到 2 × 英雄等级的伤害。',
    triggerTypes: ['bleed-before-apply'],
    priority: 10,
    modifiers: [],
    reactions: [
      {
        eventType: 'bleed-before-apply',
        effects: [
          { type: 'condition-self', condition: 'bleed', potency: 1, duration: 2 },
          { type: 'damage-self-scaled', scaling: 'hero-level', multiplier: 2 },
        ],
      },
    ],
    rulesPage: 27,
  },
  {
    id: 'lethargy',
    name: 'Lethargy',
    description: '该英雄使用 Move Action 时：受到 1 × 英雄等级的伤害（怪物移动不触发）。',
    triggerTypes: ['hero-move-action-resolved'],
    priority: 20,
    modifiers: [],
    reactions: [
      {
        eventType: 'hero-move-action-resolved',
        effects: [{ type: 'damage-self-scaled', scaling: 'hero-level', multiplier: 1 }],
      },
    ],
    rulesPage: 28,
  },
  {
    id: 'spotted-fever',
    name: 'Spotted Fever',
    description: '该英雄实际受到伤害后：施加 Blight 1 / 2 turns（可继而触发 Black Plague）。',
    triggerTypes: ['damage-resolved'],
    priority: 30,
    modifiers: [],
    reactions: [
      {
        eventType: 'damage-resolved',
        effects: [{ type: 'condition-self', condition: 'blight', potency: 1, duration: 2 }],
      },
    ],
    rulesPage: 28,
  },
  {
    id: 'syphilis',
    name: 'Syphilis',
    description: '该英雄实际受到伤害后：再受到 1 × 英雄等级的伤害。',
    triggerTypes: ['damage-resolved'],
    priority: 30,
    modifiers: [],
    reactions: [
      {
        eventType: 'damage-resolved',
        effects: [{ type: 'damage-self-scaled', scaling: 'hero-level', multiplier: 1 }],
      },
    ],
    rulesPage: 28,
  },
  {
    id: 'tapeworm',
    name: 'Tapeworm',
    description: '该英雄在 Exploration 中处理 Hunger 时：施加 Bleed 1 / 4 turns。',
    triggerTypes: ['hunger-resolved'],
    priority: 20,
    modifiers: [],
    reactions: [
      {
        eventType: 'hunger-resolved',
        effects: [{ type: 'condition-self', condition: 'bleed', potency: 1, duration: 4 }],
      },
    ],
    rulesPage: 28,
  },
  {
    id: 'the-worries',
    name: 'The Worries',
    description: '该英雄实际受到 Stress 时：额外 +1 Stress（前置修正），并在结算后受到 2 点伤害。',
    triggerTypes: ['stress-applied', 'stress-resolved'],
    priority: 20,
    modifiers: [{ eventType: 'stress-applied', flatDelta: 1 }],
    reactions: [
      {
        eventType: 'stress-resolved',
        effects: [{ type: 'damage-self', amount: 2 }],
      },
    ],
    rulesPage: 28,
  },
  {
    id: 'vertigo',
    name: 'Vertigo',
    description: '该英雄被 Push 或 Pull 且实际发生位移时：+2 Stress（自主 Move 不触发）。',
    triggerTypes: ['hero-shuffled'],
    priority: 20,
    modifiers: [],
    reactions: [
      {
        eventType: 'hero-shuffled',
        effects: [{ type: 'stress-self', amount: 2 }],
      },
    ],
    rulesPage: 28,
  },
];

/** 未知 Disease 占位定义（迁移安全网：不触发任何效果，但可被 Sanitarium 移除）。 */
export const UNKNOWN_DISEASE: DiseaseDefinition = {
  id: UNKNOWN_DISEASE_ID,
  name: '未知疾病',
  description: '来自旧存档的未知疾病数据。不产生任何效果，可在 Sanitarium 花费 2 Gold 移除。',
  triggerTypes: [],
  priority: 99,
  modifiers: [],
  reactions: [],
  rulesPage: 28,
};

const DISEASE_MAP = new Map<string, DiseaseDefinition>(
  [...ALL_DISEASES, UNKNOWN_DISEASE].map((d) => [d.id, d])
);

/** 按 id 查询 Disease 定义（含 unknown-disease 占位）。 */
export function getDiseaseById(id: string | null | undefined): DiseaseDefinition | undefined {
  if (!id) return undefined;
  return DISEASE_MAP.get(id);
}

/** 是否为 11 个正式 Disease 之一（unknown-disease 返回 false）。 */
export function isRealDiseaseId(id: string | null | undefined): boolean {
  if (!id) return false;
  return ALL_DISEASES.some((d) => d.id === id);
}

/** 旧原型可能出现的 Disease id 别名（迁移用）。 */
const LEGACY_DISEASE_ID_MAP: Record<string, string> = {
  black_plague: 'black-plague',
  creeping_cough: 'creeping-cough',
  spotted_fever: 'spotted-fever',
  the_worries: 'the-worries',
  worries: 'the-worries',
};

/** 归一化 Disease id：命中正式 id / 别名返回真实 id，否则返回 null。 */
export function normalizeDiseaseId(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length === 0) return null;
  if (DISEASE_MAP.has(raw)) return raw;
  const alias = LEGACY_DISEASE_ID_MAP[raw];
  return alias ?? null;
}
