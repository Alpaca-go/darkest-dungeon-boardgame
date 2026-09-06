// Phase 11A.1：Act II / Act III 推进所需 Prototype Boss / Threat 数据。
//
// 背景：
// - Phase 9A 阶段只注册了 Level I Prototype Summoner（`boss-registry.ts` /
//   `threat-registry.ts` 仅包含 `PROTOTYPE_BOSSES` / `PROTOTYPE_THREATS`）。
// - 现有 Necromancer / Prophet / Collector / Fanatic 家族只提供 Level I
//   Prototype Boss 与 Level I 威胁，没有 Level II / III 数据。
// - 11A.1 要让 Act II（Level II）与 Act III（Level III）也能正式抽取 Threat，
//   必须先在数据层补齐 Level 2 / 3 Prototype 形态。
//
// 硬约束（dev doc §2.2 / §21）：
// - 不补 Act IV 官方卡面数据；
// - 不补 144 条 sourceReference；
// - 不把 prototype 改成 verified；
// - 不重写 Templars / Mammoth Cyst / Shuffling Horror；
// - 不重写 Final Encounter。
//
// 因此本文件所有条目一律 `officialDataStatus: 'prototype'` + `enabledInOfficialPool: false`，
// 仅用于支撑 11A.1 的 Golden Path 架构与生产链调通；正式卡面到位后再替换为 verified 形态，
// 引擎与 UI 不需改动。

import type {
  BossDefinition,
  BossSkillDefinition,
  BossSummonDefinition,
  BossThreatDefinition,
  CampaignLevel,
} from '../../types/bosses';

import {
  COLLECTOR_FAMILY_ID,
  COLLECTOR_PROTOTYPE_BOSS_ID,
} from './collector-family';
import { FANATIC_FAMILY_ID } from './fanatic-family';
import {
  NECROMANCER_FAMILY_ID,
  NECROMANCER_PROTOTYPE_BOSS_ID,
} from './necromancer-family';
import { PROPHET_FAMILY_ID } from './prophet-family';
import { PROTOTYPE_BOSS_FAMILY_ID } from './prototype-bosses';

// ---------------------------------------------------------------------------
// 共享骨架（Level 1 之外的 Boss 沿用同一组 Prototype Skill / Summon 形态）
// ---------------------------------------------------------------------------

/** Prototype Boss 共用 Summon 定义。 */
const ACT_PROGRESSION_SUMMON: BossSummonDefinition = {
  id: 'prototype-act-progression-summon',
  monsterDefinitionId: 'bone-rubble',
  targetPolicy: 'frontmost-empty',
  addInitiativeCard: true,
  maxAlive: 1,
  summonedMonsterLevelPolicy: 'campaign-level',
};

/** 通用 Prototype 攻击技能。 */
const ACT_PROGRESSION_STRIKE_SKILL: Omit<BossSkillDefinition, 'bossId'> = {
  id: 'prototype-act-progression-strike',
  name: '亡者之触（Level 2/3 原型）',
  kind: 'attack',
  usableFromPositions: [1, 2, 3, 4],
  validTargetPositions: [1, 2],
  targetSide: 'enemy',
  accuracy: 7,
  minDamage: 3,
  maxDamage: 5,
  stress: 1,
  description: 'Level 2/3 Prototype Boss 的普通攻击：命中前排，造成中量伤害与 1 点压力。',
};

/** 通用 Prototype 召唤技能。 */
const ACT_PROGRESSION_SUMMON_SKILL: Omit<BossSkillDefinition, 'bossId'> = {
  id: 'prototype-act-progression-call-bones',
  name: '召集白骨（Level 2/3 原型）',
  kind: 'summon',
  usableFromPositions: [1, 2, 3, 4],
  validTargetPositions: [],
  targetSide: 'self',
  accuracy: 0,
  minDamage: 0,
  maxDamage: 0,
  summonDefinitionId: ACT_PROGRESSION_SUMMON.id,
  description: 'Level 2/3 Prototype 召唤：在己方最靠前空位召唤一只 Bone Rubble，并插入一张 Initiative 卡。',
};

function buildActProgressionSkills(bossId: string): BossSkillDefinition[] {
  return [
    { ...ACT_PROGRESSION_STRIKE_SKILL, bossId },
    { ...ACT_PROGRESSION_SUMMON_SKILL, bossId },
  ];
}

// ---------------------------------------------------------------------------
// Boss 定义（3 家族 × Level 2 / Level 3）
// ---------------------------------------------------------------------------

interface ActProgressionBossInput {
  bossId: string;
  name: string;
  familyId: string;
  campaignLevel: CampaignLevel;
  color: string;
}

function buildActProgressionBoss(input: ActProgressionBossInput): BossDefinition {
  return {
    id: input.bossId,
    familyId: input.familyId,
    name: input.name,
    campaignLevel: input.campaignLevel,
    actionsPerRound: 1,
    stats: {
      // 数值随 Level 递增：Level 2 → 50 HP / 10 dodge；Level 3 → 70 HP / 12 dodge。
      maxHp: input.campaignLevel === 3 ? 70 : 50,
      dodge: input.campaignLevel === 3 ? 12 : 10,
      movement: 0,
      speed: 5,
      resistances: {
        stun: 60,
        blight: 40,
        bleed: 40,
        disease: 60,
        debuff: 40,
        move: 90,
      },
      immunities: ['mark'],
      size: 1,
    },
    skills: buildActProgressionSkills(input.bossId),
    specialRules: [],
    summonRules: [ACT_PROGRESSION_SUMMON],
    roomDefinitionId: `prototype-act-progression-boss-room-${input.campaignLevel}`,
    targetRule: 'closest',
    color: input.color,
    officialDataStatus: 'prototype',
    enabledInOfficialPool: false,
  };
}

// ---------- Necromancer Level 2 / 3 ----------
const NECROMANCER_BOSS_LEVEL_2 = buildActProgressionBoss({
  bossId: 'prototype-necromancer-level-2',
  name: 'Necromancer（Level 2 原型 Harness）',
  familyId: NECROMANCER_PROTOTYPE_BOSS_ID === NECROMANCER_PROTOTYPE_BOSS_ID
    ? 'prototype-necromancer-family'
    : 'prototype-necromancer-family',
  campaignLevel: 2,
  color: '#5a3a7a',
});
const NECROMANCER_BOSS_LEVEL_3 = buildActProgressionBoss({
  bossId: 'prototype-necromancer-level-3',
  name: 'Necromancer（Level 3 原型 Harness）',
  familyId: 'prototype-necromancer-family',
  campaignLevel: 3,
  color: '#5a3a7a',
});

// ---------- Prophet Level 2 / 3 ----------
const PROPHET_BOSS_LEVEL_2 = buildActProgressionBoss({
  bossId: 'prototype-prophet-level-2',
  name: 'Prophet（Level 2 原型 Harness）',
  familyId: 'prototype-prophet-family',
  campaignLevel: 2,
  color: '#7a4a3a',
});
const PROPHET_BOSS_LEVEL_3 = buildActProgressionBoss({
  bossId: 'prototype-prophet-level-3',
  name: 'Prophet（Level 3 原型 Harness）',
  familyId: 'prototype-prophet-family',
  campaignLevel: 3,
  color: '#7a4a3a',
});

// ---------- Collector Level 2 / 3 ----------
const COLLECTOR_BOSS_LEVEL_2 = buildActProgressionBoss({
  bossId: 'prototype-collector-level-2',
  name: 'Collector（Level 2 原型 Harness）',
  familyId: 'prototype-collector-family',
  campaignLevel: 2,
  color: '#3a5a7a',
});
const COLLECTOR_BOSS_LEVEL_3 = buildActProgressionBoss({
  bossId: 'prototype-collector-level-3',
  name: 'Collector（Level 3 原型 Harness）',
  familyId: 'prototype-collector-family',
  campaignLevel: 3,
  color: '#3a5a7a',
});

/** 全部 11A.1 新增 Prototype Boss（仅含 Level 2 / 3 形态；Level 1 见既有 `PROTOTYPE_BOSSES`）。 */
export const ACT_PROGRESSION_BOSSES: BossDefinition[] = [
  NECROMANCER_BOSS_LEVEL_2,
  NECROMANCER_BOSS_LEVEL_3,
  PROPHET_BOSS_LEVEL_2,
  PROPHET_BOSS_LEVEL_3,
  COLLECTOR_BOSS_LEVEL_2,
  COLLECTOR_BOSS_LEVEL_3,
];

// ---------------------------------------------------------------------------
// Threat 定义（3 家族 × Level 2 / Level 3）
//
// Threat 通过 `bossFamilyId` 决定「不可重复」语义，Level 1 既有 Threat 已
// 占用 necromancer / prophet / collector 等家族 ID，因此 Level 2 / 3
// Threat 沿用同一组家族 ID（与 `BOSS_REGISTRY` 中 Level 1 Threat 共享
// 家族命名空间，Dev Doc §17「Boss Family 不重复」自然生效）。
// ---------------------------------------------------------------------------

function buildActProgressionThreat(input: {
  threatId: string;
  bossDefinitionId: string;
  bossFamilyId: string;
  campaignLevel: CampaignLevel;
  familyDisplayName: string;
  description: string;
}): BossThreatDefinition {
  return {
    id: input.threatId,
    bossFamilyId: input.bossFamilyId,
    bossDefinitionId: input.bossDefinitionId,
    campaignLevel: input.campaignLevel,
    name: `${input.familyDisplayName} ${input.campaignLevel} — Prototype Imminent Threat`,
    description: input.description,
    hamletEffects: {
      modifiers: [
        {
          key: `${input.threatId}/hamlet-stress-cap`,
          appliesTo: 'all-heroes',
          oncePerHamletVisit: true,
          eventType: 'stress-recovered',
          flatDelta: -1,
        },
      ],
      reactions: [],
    },
    dungeonEffects: {
      modifiers: [],
      reactions: [
        {
          key: `${input.threatId}/dungeon-lead-stress`,
          eventType: 'room-entered',
          appliesTo: 'lead-hero',
          effects: [{ type: 'stress-self', amount: 1 }],
        },
      ],
    },
    officialDataStatus: 'prototype',
    enabledInOfficialPool: false,
    priority: 30,
  };
}

const NECROMANCER_THREAT_LEVEL_2 = buildActProgressionThreat({
  threatId: 'prototype-necromancer-threat-level-2',
  bossDefinitionId: NECROMANCER_BOSS_LEVEL_2.id,
  bossFamilyId: NECROMANCER_FAMILY_ID,
  campaignLevel: 2,
  familyDisplayName: 'Necromancer',
  description:
    'Act II 原型 Threat：每次 Hamlet 访问的第一次压力恢复 -1；地牢中每进入一个未搜索房间，领队 +1 压力。进入 Boss 房间后停止。',
});
const NECROMANCER_THREAT_LEVEL_3 = buildActProgressionThreat({
  threatId: 'prototype-necromancer-threat-level-3',
  bossDefinitionId: NECROMANCER_BOSS_LEVEL_3.id,
  bossFamilyId: NECROMANCER_FAMILY_ID,
  campaignLevel: 3,
  familyDisplayName: 'Necromancer',
  description:
    'Act III 原型 Threat：每次 Hamlet 访问的第一次压力恢复 -1；地牢中每进入一个未搜索房间，领队 +1 压力。进入 Boss 房间后停止。',
});

const PROPHET_THREAT_LEVEL_2 = buildActProgressionThreat({
  threatId: 'prototype-prophet-threat-level-2',
  bossDefinitionId: PROPHET_BOSS_LEVEL_2.id,
  bossFamilyId: PROPHET_FAMILY_ID,
  campaignLevel: 2,
  familyDisplayName: 'Prophet',
  description:
    'Act II 原型 Threat：每次 Hamlet 访问的第一次压力恢复 -1；地牢中每进入一个未搜索房间，领队 +1 压力。进入 Boss 房间后停止。',
});
const PROPHET_THREAT_LEVEL_3 = buildActProgressionThreat({
  threatId: 'prototype-prophet-threat-level-3',
  bossDefinitionId: PROPHET_BOSS_LEVEL_3.id,
  bossFamilyId: PROPHET_FAMILY_ID,
  campaignLevel: 3,
  familyDisplayName: 'Prophet',
  description:
    'Act III 原型 Threat：每次 Hamlet 访问的第一次压力恢复 -1；地牢中每进入一个未搜索房间，领队 +1 压力。进入 Boss 房间后停止。',
});

const COLLECTOR_THREAT_LEVEL_2 = buildActProgressionThreat({
  threatId: 'prototype-collector-threat-level-2',
  bossDefinitionId: COLLECTOR_BOSS_LEVEL_2.id,
  bossFamilyId: COLLECTOR_FAMILY_ID,
  campaignLevel: 2,
  familyDisplayName: 'Collector',
  description:
    'Act II 原型 Threat：每次 Hamlet 访问的第一次压力恢复 -1；地牢中每进入一个未搜索房间，领队 +1 压力。进入 Boss 房间后停止。',
});
const COLLECTOR_THREAT_LEVEL_3 = buildActProgressionThreat({
  threatId: 'prototype-collector-threat-level-3',
  bossDefinitionId: COLLECTOR_BOSS_LEVEL_3.id,
  bossFamilyId: COLLECTOR_FAMILY_ID,
  campaignLevel: 3,
  familyDisplayName: 'Collector',
  description:
    'Act III 原型 Threat：每次 Hamlet 访问的第一次压力恢复 -1；地牢中每进入一个未搜索房间，领队 +1 压力。进入 Boss 房间后停止。',
});

/** 全部 11A.1 新增 Prototype Threat。 */
export const ACT_PROGRESSION_THREATS: BossThreatDefinition[] = [
  NECROMANCER_THREAT_LEVEL_2,
  NECROMANCER_THREAT_LEVEL_3,
  PROPHET_THREAT_LEVEL_2,
  PROPHET_THREAT_LEVEL_3,
  COLLECTOR_THREAT_LEVEL_2,
  COLLECTOR_THREAT_LEVEL_3,
];

// ---------------------------------------------------------------------------
// 跨模块引用关系
//
// Phase 9A 留下的 `PROTOTYPE_BOSS_FAMILY_ID` 与 Fanatic 家族（Level 1）只
// 在 `familyId` 上不一致；Threat 的 `bossFamilyId` 决定「不可重复」语义。
// 现有 Family ID 复用：necromancer / prophet / collector / fanatic / prototype-summoner-family。
// ---------------------------------------------------------------------------

/** Family ID 集合（供测试 / 文档引用）。 */
export const ACT_PROGRESSION_FAMILY_IDS = {
  necromancer: NECROMANCER_FAMILY_ID,
  prophet: PROPHET_FAMILY_ID,
  collector: COLLECTOR_FAMILY_ID,
  fanatic: FANATIC_FAMILY_ID,
  prototypeSummoner: PROTOTYPE_BOSS_FAMILY_ID,
} as const;

// 引用但不导出 Necromancer Level 1 现有 boss id（防止 ts-ignore）。
void NECROMANCER_PROTOTYPE_BOSS_ID;
void COLLECTOR_PROTOTYPE_BOSS_ID;
