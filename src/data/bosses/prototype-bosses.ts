// Phase 9A §10.3 / §27.1：Prototype Boss 数据。
//
// 纪律（不可放宽）：
// - 这是**架构验证用占位数据**，不是任何正式 Boss 的还原。
// - id 一律带 `prototype-` 前缀；`officialDataStatus = 'prototype'`；
//   `enabledInOfficialPool = false` —— 正式模式抽取时必须被过滤掉。
// - 严禁使用 Necromancer / Prophet / Collector / Fanatic / Shuffling Horror 等
//   正式 Boss 名称或其卡面数值来「伪装」Prototype（文档 §1.2 / §10.3）。
//
// Prototype Summoner 覆盖 §27.1 要求的全部验证点：
//   actionsPerRound = 2 / 一个普通攻击 / 一个召唤技能 / maxAlive 限制 / 正常 HP 与死亡。

import type { BossDefinition, BossSkillDefinition, BossSummonDefinition } from '../../types/bosses';

/** Prototype Boss 家族 id（Threat 与 Boss 通过 familyId 绑定）。 */
export const PROTOTYPE_BOSS_FAMILY_ID = 'prototype-summoner-family';

/** Prototype Boss 定义 id。 */
export const PROTOTYPE_BOSS_ID = 'prototype-summoner';

/** 召唤定义：同时最多 2 只，落位取最靠前的空位，插入 Initiative 卡。 */
const PROTOTYPE_SUMMON: BossSummonDefinition = {
  id: 'prototype-summon-bone-soldier',
  monsterDefinitionId: 'bone-soldier',
  targetPolicy: 'frontmost-empty',
  addInitiativeCard: true,
  maxAlive: 2,
  summonedMonsterLevelPolicy: 'campaign-level',
};

const PROTOTYPE_SKILLS: BossSkillDefinition[] = [
  {
    id: 'prototype-summoner-strike',
    bossId: PROTOTYPE_BOSS_ID,
    name: '枯萎之触（测试）',
    kind: 'attack',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 2,
    maxDamage: 4,
    stress: 1,
    description: '占位攻击：命中前排，造成少量伤害与 1 点压力。数值仅用于验证战斗管线。',
  },
  {
    id: 'prototype-summoner-call-bones',
    bossId: PROTOTYPE_BOSS_ID,
    name: '召集白骨（测试）',
    kind: 'summon',
    usableFromPositions: [1, 2, 3, 4],
    // 召唤技能不指定敌方目标，落位由 BossSummonDefinition.targetPolicy 决定。
    validTargetPositions: [],
    targetSide: 'self',
    accuracy: 0,
    minDamage: 0,
    maxDamage: 0,
    summonDefinitionId: PROTOTYPE_SUMMON.id,
    description: '占位召唤：在己方最靠前的空位召唤一只 Bone Soldier，并为其插入一张 Initiative 卡。',
  },
];

/** Prototype Summoner（§10.3）。 */
export const PROTOTYPE_SUMMONER: BossDefinition = {
  id: PROTOTYPE_BOSS_ID,
  familyId: PROTOTYPE_BOSS_FAMILY_ID,
  name: 'Prototype Summoner（测试数据）',
  campaignLevel: 1,

  // §12.2：每轮两次行动 → 初始化时加入 2 张 Actor-specific Initiative Card。
  actionsPerRound: 2,

  stats: {
    maxHp: 30,
    dodge: 10,
    movement: 0,
    speed: 5,
    resistances: { stun: 60, blight: 40, bleed: 40, disease: 60, debuff: 40, move: 90 },
    immunities: ['mark'],
    size: 1,
  },

  skills: PROTOTYPE_SKILLS,
  specialRules: [],
  summonRules: [PROTOTYPE_SUMMON],

  roomDefinitionId: 'prototype-boss-room',
  targetRule: 'closest',
  color: '#7c5cbf',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

/** 全部 Prototype Boss。 */
export const PROTOTYPE_BOSSES: BossDefinition[] = [PROTOTYPE_SUMMONER];
