// Phase 9B §6 / §7：Necromancer 家族注册表与 Level 定义。
//
// 硬约束（文档 §22 / 硬约束清单）：
// - 不复制 Phase 9A 状态机（只声明数据，运行时复用既有 threat-passives）；
// - 不保存 Necromancer 专属 Graveyard 布尔值（封锁由通用 Hamlet Building 入口计算）；
// - 永久移除必须修改 Campaign Monster Pool；
// - Summon 复用 Phase 9A（BossSummonDefinition.targetPolicy = 'first-empty-stance'）；
// - Stance 与 Target Area 分开；
// - UI 不生成随机数（先保存 d10 结果）；
// - 缺失 Battle / Room 数据时 official battle 禁用；
// - Prototype Skill 使用 prototype ID；
// - 不使用电子游戏资料；
// - 不推算 Level II / III；
// - Boss 死亡立即停止 Queue；
// - XP 复用 Phase 8D；
// - Death / Replacement 复用 Phase 6。
//
// 资料缺口（文档 §4）：PDF 未完整列出 Necromancer Level I—III 全部 Stats /
// 完整 Skill d10 表 / Level II·III Threat 两面 / Room Card 完整效果。
// 因此 necromancer-level-1 保持禁用（enabledInOfficialPool = false），
// 仅提供 prototype harness 供开发模式使用；最终报告明确 official combat 仍待资料。

import type {
  BossDefinition,
  BossSkillDefinition,
  BossSummonDefinition,
  BossThreatDefinition,
  CampaignLevel,
} from '../../types/bosses';
import type { RegistryValidationIssue } from '../../types/progression';

/** Necromancer 家族 id（与 Phase 9A Boss 框架绑定）。 */
export const NECROMANCER_FAMILY_ID = 'necromancer';

/** 开发模式 Prototype 家族 id（明确标注，绝不进正式池）。 */
export const NECROMANCER_PROTOTYPE_FAMILY_ID = 'prototype-necromancer-family';

/** Prototype Level 1 Boss id（不冒充正式 necromancer-level-1）。 */
export const NECROMANCER_PROTOTYPE_BOSS_ID = 'prototype-necromancer-level-1';

// ---------------------------------------------------------------------------
// §7 Level I Threat（已核对，可入池）
// ---------------------------------------------------------------------------
// 注意：本 Threat 定义经 PDF p11 核对、officialDataStatus = 'verified'、
// enabledInOfficialPool = true；它描述的是「Necromancer I」的 Threat 效果，
// 与 Boss 本身（battle/room card 缺失）的禁用状态相互独立。

export const NECROMANCER_THREAT_LEVEL_1: BossThreatDefinition = {
  id: 'necromancer-threat-level-1',
  bossFamilyId: NECROMANCER_FAMILY_ID,
  bossDefinitionId: NECROMANCER_PROTOTYPE_BOSS_ID,
  campaignLevel: 1,
  name: 'Necromancer I — Unsettling Silhouettes / This is Unholy!',
  description:
    'Dungeon: 战斗结束后永久移除本场出现过的非 Unholy Monster。Hamlet: Graveyard 被封锁。',
  hamletEffects: {
    modifiers: [
      {
        key: 'necromancer-graveyard-block',
        appliesTo: 'all-heroes',
        oncePerHamletVisit: true,
        eventType: 'battle-started',
        flatDelta: 0,
      },
    ],
    reactions: [],
  },
  dungeonEffects: {
    modifiers: [
      {
        key: 'necromancer-remove-non-unholy',
        appliesTo: 'all-heroes',
        oncePerHamletVisit: false,
        eventType: 'battle-started',
        flatDelta: 0,
      },
    ],
    reactions: [],
  },
  officialDataStatus: 'verified',
  sourceReference: 'DD_EN_COREBOX_RULES.pdf:p11',
  enabledInOfficialPool: true,
};

// ---------------------------------------------------------------------------
// §3.5 Summon Mapping（复用 Phase 9A）
// ---------------------------------------------------------------------------
export const NECROMANCER_SUMMON_BY_LEVEL: Record<number, string> = {
  1: 'bone-rubble',
  2: 'bone-soldier',
  3: 'bone-spearman',
};

// ---------------------------------------------------------------------------
// Prototype Level 1 Boss（full Battle / Room card 缺失 → 禁用）
// ---------------------------------------------------------------------------
const NECROMANCER_PROTOTYPE_SUMMON: BossSummonDefinition = {
  id: 'necromancer-prototype-summon-bone-rubble',
  monsterDefinitionId: 'bone-rubble',
  targetPolicy: 'frontmost-empty',
  addInitiativeCard: true,
  maxAlive: 1,
  summonedMonsterLevelPolicy: 'campaign-level',
};

const NECROMANCER_PROTOTYPE_SKILLS: BossSkillDefinition[] = [
  {
    id: 'necromancer-prototype-strike',
    bossId: NECROMANCER_PROTOTYPE_BOSS_ID,
    name: '亡者之触（原型）',
    kind: 'attack',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 2,
    maxDamage: 4,
    stress: 1,
    description: '原型攻击：命中前排，造成少量伤害与 1 点压力。仅用于验证战斗管线。',
  },
  {
    id: 'necromancer-prototype-call-bones',
    bossId: NECROMANCER_PROTOTYPE_BOSS_ID,
    name: '召集白骨（原型）',
    kind: 'summon',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [],
    targetSide: 'self',
    accuracy: 0,
    minDamage: 0,
    maxDamage: 0,
    summonDefinitionId: NECROMANCER_PROTOTYPE_SUMMON.id,
    description: '原型召唤：在己方最靠前空位召唤一只 Bone Rubble，并插入一张 Initiative 卡。',
  },
];

/** Necromancer 原型 Boss（开发模式 harness；enabledInOfficialPool = false）。 */
export const NECROMANCER_PROTOTYPE_BOSS: BossDefinition = {
  id: NECROMANCER_PROTOTYPE_BOSS_ID,
  familyId: NECROMANCER_PROTOTYPE_FAMILY_ID,
  name: 'Necromancer（原型 Harness）',
  campaignLevel: 1,

  actionsPerRound: 1,

  stats: {
    maxHp: 30,
    dodge: 10,
    movement: 0,
    speed: 5,
    resistances: { stun: 60, blight: 40, bleed: 40, disease: 60, debuff: 40, move: 90 },
    immunities: ['mark'],
    size: 1,
  },

  skills: NECROMANCER_PROTOTYPE_SKILLS,
  specialRules: [],
  summonRules: [NECROMANCER_PROTOTYPE_SUMMON],

  roomDefinitionId: 'necromancer-prototype-boss-room',
  targetRule: 'closest',
  color: '#5a3a7a',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// 查询函数（与 Phase 9A Boss Registry 同构）
// ---------------------------------------------------------------------------

/** 取 Necromancer 某 Level 的 Boss 定义（数据缺口：仅原型可用）。 */
export function getNecromancerDefinition(level: CampaignLevel): BossDefinition | undefined {
  if (level !== 1) return undefined; // Level II / III 数据缺失 → 不复制 Level I
  return NECROMANCER_PROTOTYPE_BOSS;
}

/** 取 Necromancer 某 Level 的 Threat 定义（Level I 已核对）。 */
export function getNecromancerThreat(level: CampaignLevel): BossThreatDefinition | undefined {
  if (level !== 1) return undefined;
  return NECROMANCER_THREAT_LEVEL_1;
}

/** 家族校验（只报告，不抛异常）。 */
export function validateNecromancerFamily(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];
  // Level I 已核对 Threat（verified + 入池）
  if (
    NECROMANCER_THREAT_LEVEL_1.officialDataStatus !== 'verified' ||
    !NECROMANCER_THREAT_LEVEL_1.enabledInOfficialPool
  ) {
    issues.push({
      kind: 'unverified',
      targetId: NECROMANCER_THREAT_LEVEL_1.id,
      level: 1,
      message: 'Necromancer Level I Threat 状态异常',
    });
  }
  // Level I Boss（原型，禁用）
  if (NECROMANCER_PROTOTYPE_BOSS.enabledInOfficialPool) {
    issues.push({
      kind: 'unverified',
      targetId: NECROMANCER_PROTOTYPE_BOSS_ID,
      message: 'Necromancer Level I Boss 不得 enabledInOfficialPool',
    });
  }
  return issues;
}

/** 全部 Necromancer 定义（原型 + 已核对 Threat）。 */
export const NECROMANCER_REGISTRY: { boss: BossDefinition; threat: BossThreatDefinition } = {
  boss: NECROMANCER_PROTOTYPE_BOSS,
  threat: NECROMANCER_THREAT_LEVEL_1,
};
