// Phase 9C §6 / §7：Prophet 家族注册表、Room Definition 与 Data Gate。
//
// 硬约束（文档 §24 硬约束清单）：
// - 不复制 Phase 9A 状态机（只声明数据，运行时复用既有 Boss 框架）；
// - Pew 不是 BattleActor、无 HP / Stance / Initiative、不占 Area Capacity；
// - 第 1 行动正好 4 次 d10，骰点先保存；
// - Missing Room Map / Skill 时 official 禁用；
// - Prototype 使用 prototype ID，绝不写入正式 ID；
// - 不使用电子游戏数据；不推算 Level II / III。
//
// 资料缺口（见 docs/reports/phase-9c-prophet-data-audit.md）：
//   d10 → Area 映射、Rubble of Ruin 数值、第二行动 Skill Table、Prophet Stats、
//   Prophet Threat I—III、Level II / III 全部数据 —— 均缺失。
// 因此 prophet-level-* 一律 enabledInOfficialPool = false，
// 仅提供 prototype-prophet-level-1-harness 供开发模式验证机制。

import type {
  BossDefinition,
  BossSkillDefinition,
  BossThreatDefinition,
  CampaignLevel,
} from '../../types/bosses';
import type { DataMode, RegistryValidationIssue } from '../../types/progression';
import type {
  D10Roll,
  ProphetRoomDefinition,
  ProphetValidationResult,
} from '../../types/prophet';

// ---------------------------------------------------------------------------
// 家族 / ID 常量
// ---------------------------------------------------------------------------

/** Prophet 正式家族 id。 */
export const PROPHET_FAMILY_ID = 'prophet';

/** 开发模式 Prototype 家族 id（明确标注，绝不进正式池）。 */
export const PROPHET_PROTOTYPE_FAMILY_ID = 'prototype-prophet-family';

/** 正式 Boss Definition id（数据缺失，仅作 Data Gate 登记）。 */
export const PROPHET_OFFICIAL_LEVEL_IDS = [
  'prophet-level-1',
  'prophet-level-2',
  'prophet-level-3',
] as const;

/** 开发模式 harness id（文档 §4 允许）。 */
export const PROPHET_PROTOTYPE_BOSS_ID = 'prototype-prophet-level-1-harness';
export const PROPHET_PROTOTYPE_ROOM_ID = 'prototype-prophet-room-map';
export const PROPHET_PROTOTYPE_RUBBLE_ID = 'prototype-rubble-of-ruin';

/** 已核对规则：Prophet 每轮 3 次行动（PDF p38—39）。 */
export const PROPHET_ACTIONS_PER_ROUND = 3;

/** 已核对规则：准备 4 个 Wooden Pews（PDF p38—39）。 */
export const PROPHET_PEW_COUNT = 4;

/** 每轮固定行动语义（§3）。 */
export const PROPHET_ACTION_OVERRIDES: Record<number, string> = {
  1: 'prophet-place-wooden-pews',
  3: 'prophet-rubble-of-ruin',
};

// ---------------------------------------------------------------------------
// §7 正式 Room Definition —— 资料缺失，保持空映射以驱动 Data Gate
// ---------------------------------------------------------------------------
// 注意：这里刻意**不填任何 Area**。文档 §4 明令「不按 Area 数量平均分配 1—10」，
// 因此在拿到正式 Room Card 之前，任何补全都是猜测，一律留空并标 unavailable。

const EMPTY_D10_MAP: Record<D10Roll, string> = {
  1: '',
  2: '',
  3: '',
  4: '',
  5: '',
  6: '',
  7: '',
  8: '',
  9: '',
  10: '',
};

/** 正式 Prophet Level I 房间（资料缺失 → unavailable）。 */
export const PROPHET_OFFICIAL_ROOM_LEVEL_1: ProphetRoomDefinition = {
  id: 'prophet-room-level-1',
  bossFamilyId: PROPHET_FAMILY_ID,
  bossPlacement: {
    stance: 'aggressive', // 已核对规则：Prophet 部署 Aggressive Stance
    tileAreaId: '', // Room Tile 缺失
  },
  heroPlacementRules: [],
  roomEffects: [],
  validAreaIds: [],
  d10AreaMap: { ...EMPTY_D10_MAP },
  officialDataStatus: 'unavailable',
};

// ---------------------------------------------------------------------------
// Prototype Room（开发 harness 专用；不冒充正式 Room Card）
// ---------------------------------------------------------------------------

export const PROPHET_PROTOTYPE_AREA_IDS = [
  'prototype-area-a',
  'prototype-area-b',
  'prototype-area-c',
  'prototype-area-d',
  'prototype-area-e',
] as const;

/**
 * Prototype d10 → Area 映射。
 * 仅用于验证「掷点 → 落区 → 逐 Pew 结算」机制，**不代表正式 Room Card**。
 * 取值与开发文档 §20 的日志示例一致（3 → B、7 → D、9 → E），便于比对预期输出。
 */
export const PROPHET_PROTOTYPE_ROOM: ProphetRoomDefinition = {
  id: PROPHET_PROTOTYPE_ROOM_ID,
  bossFamilyId: PROPHET_FAMILY_ID,
  bossPlacement: {
    stance: 'aggressive',
    tileAreaId: 'prototype-area-c',
  },
  heroPlacementRules: [{ rule: 'first-empty-area', areaId: 'prototype-area-a' }],
  roomEffects: [
    { key: 'prototype-prophet-room-effect', description: '原型房间效果占位，仅供机制验证。' },
  ],
  validAreaIds: [...PROPHET_PROTOTYPE_AREA_IDS],
  d10AreaMap: {
    1: 'prototype-area-a',
    2: 'prototype-area-a',
    3: 'prototype-area-b',
    4: 'prototype-area-b',
    5: 'prototype-area-c',
    6: 'prototype-area-c',
    7: 'prototype-area-d',
    8: 'prototype-area-d',
    9: 'prototype-area-e',
    10: 'prototype-area-e',
  },
  officialDataStatus: 'prototype',
};

// ---------------------------------------------------------------------------
// Prototype Boss（开发 harness；enabledInOfficialPool = false）
// ---------------------------------------------------------------------------

const PROPHET_PROTOTYPE_SKILLS: BossSkillDefinition[] = [
  {
    // ordinal 2 的普通 Skill Table 占位（正式表缺失）
    id: 'prototype-prophet-normal-strike',
    bossId: PROPHET_PROTOTYPE_BOSS_ID,
    name: '预言之触（原型）',
    kind: 'attack',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 2,
    maxDamage: 4,
    stress: 1,
    description: '原型普通攻击：仅供 ordinal 2 普通 Skill Table 管线验证。',
  },
  {
    // ordinal 3 固定技能（正式 Rubble of Ruin 数值缺失）
    id: PROPHET_PROTOTYPE_RUBBLE_ID,
    bossId: PROPHET_PROTOTYPE_BOSS_ID,
    name: 'Rubble of Ruin（原型）',
    kind: 'attack',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy',
    accuracy: 6,
    minDamage: 1,
    maxDamage: 3,
    stress: 1,
    description:
      '原型区域攻击：由每个 Wooden Pew 各自独立结算一次，禁止合并为一次双倍攻击。',
  },
];

/** Prophet 原型 Boss（开发模式 harness）。 */
export const PROPHET_PROTOTYPE_BOSS: BossDefinition = {
  id: PROPHET_PROTOTYPE_BOSS_ID,
  familyId: PROPHET_PROTOTYPE_FAMILY_ID,
  name: 'Prophet（原型 Harness）',
  campaignLevel: 1,

  // 已核对规则：每轮 3 次行动 → 初始化 3 张 Actor-specific Initiative Card
  actionsPerRound: PROPHET_ACTIONS_PER_ROUND,

  stats: {
    maxHp: 28,
    dodge: 12,
    movement: 0,
    speed: 5,
    resistances: { stun: 60, blight: 40, bleed: 40, disease: 60, debuff: 40, move: 90 },
    immunities: ['mark'],
    size: 1,
  },

  skills: PROPHET_PROTOTYPE_SKILLS,
  specialRules: [],
  summonRules: [],

  roomDefinitionId: PROPHET_PROTOTYPE_ROOM_ID,
  targetRule: 'closest',
  color: '#7a5a2a',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// §6 查询接口
// ---------------------------------------------------------------------------

/**
 * 取 Prophet 某 Level 的 Boss 定义。
 * - formal 模式：正式数据缺失 → 一律返回 undefined（严禁回退到 prototype）；
 * - prototype 模式：Level I 返回开发 harness；Level II / III 不推算 → undefined。
 */
export function getProphetDefinition(
  level: CampaignLevel,
  mode: DataMode = 'prototype'
): BossDefinition | undefined {
  if (mode === 'formal') return undefined;
  if (level !== 1) return undefined;
  return PROPHET_PROTOTYPE_BOSS;
}

/** 取 Prophet 某 Level 的 Threat 定义（Level I—III 全部缺失 → undefined）。 */
export function getProphetThreat(_level: CampaignLevel): BossThreatDefinition | undefined {
  return undefined;
}

/**
 * 取 Prophet 某 Level 的房间定义。
 * formal 模式返回正式房间（映射为空 → Data Gate 会拦下）；prototype 模式返回 harness 房间。
 */
export function getProphetRoomDefinition(
  level: CampaignLevel,
  mode: DataMode = 'prototype'
): ProphetRoomDefinition | undefined {
  if (level !== 1) return undefined;
  return mode === 'formal' ? PROPHET_OFFICIAL_ROOM_LEVEL_1 : PROPHET_PROTOTYPE_ROOM;
}

/**
 * 行动槽位 → 实际可执行的技能 ID。
 *
 * `PROPHET_ACTION_OVERRIDES` 记录的是**正式语义 ID**（`prophet-*`）；
 * 原型 harness 的实现 ID 必须带 `prototype-` 前缀（硬约束 16），
 * 因此按模式解析，避免把原型数值挂到正式 ID 上。
 *
 * ordinal 2 无 override —— 走通用普通 Skill Table 流程。
 */
export function resolveProphetActionSkillId(
  ordinal: number,
  mode: DataMode = 'prototype'
): string {
  const semanticId = PROPHET_ACTION_OVERRIDES[ordinal];
  if (!semanticId) return 'normal-skill-table';
  if (mode === 'formal') return semanticId;
  // 原型模式：Rubble 走 prototype 实现；Pew 放置是内建行动（非 Skill），保留语义 ID
  return ordinal === 3 ? PROPHET_PROTOTYPE_RUBBLE_ID : semanticId;
}

/**
 * 第二行动的普通 Skill Table。
 * formal 模式返回空数组 —— 正式表缺失 → ordinal 2 的 official 结算被 Data Gate 拦下。
 */
export function getProphetNormalSkillTable(mode: DataMode = 'prototype'): string[] {
  if (mode === 'formal') return [];
  const rubbleId = PROPHET_PROTOTYPE_RUBBLE_ID;
  return PROPHET_PROTOTYPE_BOSS.skills.filter((s) => s.id !== rubbleId).map((s) => s.id);
}

// ---------------------------------------------------------------------------
// §6 校验 / Data Gate
// ---------------------------------------------------------------------------

const ALL_D10: D10Roll[] = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10];

/** Room Map 是否完整覆盖 1—10 且只指向合法 Area。 */
export function validateRoomMap(room: ProphetRoomDefinition): ProphetValidationResult {
  const missing: string[] = [];
  for (const roll of ALL_D10) {
    const areaId = room.d10AreaMap[roll];
    if (!areaId) {
      missing.push(`d10AreaMap[${roll}] 缺失`);
      continue;
    }
    if (!room.validAreaIds.includes(areaId)) {
      missing.push(`d10AreaMap[${roll}] 指向非法 Area「${areaId}」`);
    }
  }
  if (room.validAreaIds.length === 0) missing.push('validAreaIds 为空');
  if (!room.bossPlacement.tileAreaId) missing.push('bossPlacement.tileAreaId 缺失（Room Tile）');
  return { isComplete: missing.length === 0, missing };
}

/**
 * Prophet 正式内容 Data Gate。
 * 只有全部满足才允许 official battle —— 当前必定为 false（见审计报告 §4）。
 */
export function isProphetOfficialBattleEnabled(): boolean {
  const room = PROPHET_OFFICIAL_ROOM_LEVEL_1;
  const roomOk = validateRoomMap(room).isComplete && room.officialDataStatus === 'verified';
  const bossOk = getProphetDefinition(1, 'formal') !== undefined;
  return roomOk && bossOk;
}

/** 正式内容缺口清单（供 UI / 报告展示）。 */
export function getProphetOfficialDataGaps(): string[] {
  const gaps: string[] = [
    'prophet-battle-level-1：stats 为 null、skills 为空（partial）',
    'prophet-battle-level-2 / -3：无数据（unavailable）',
    'prophet-threat-level-1 / -2 / -3：无数据（unavailable）',
    'prophet-room-card / prophet-room-tile：无数据（unavailable）',
    'rubble-of-ruin-level-1：无数值（unavailable）',
    '第二行动 Skill Table：无数据（unavailable）',
  ];
  gaps.push(...validateRoomMap(PROPHET_OFFICIAL_ROOM_LEVEL_1).missing.map((m) => `Room Map：${m}`));
  return gaps;
}

/** 家族校验（只报告，不抛异常）。 */
export function validateProphetFamily(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  // 1) 原型数据绝不允许进入正式池
  if (PROPHET_PROTOTYPE_BOSS.enabledInOfficialPool) {
    issues.push({
      kind: 'unverified',
      targetId: PROPHET_PROTOTYPE_BOSS_ID,
      message: 'Prophet 原型 harness 不得 enabledInOfficialPool',
    });
  }

  // 2) 原型 ID 必须带 prototype 前缀（硬约束 16）
  for (const id of [PROPHET_PROTOTYPE_BOSS_ID, PROPHET_PROTOTYPE_ROOM_ID, PROPHET_PROTOTYPE_RUBBLE_ID]) {
    if (!id.startsWith('prototype-')) {
      issues.push({ kind: 'unverified', targetId: id, message: '原型 ID 必须以 prototype- 开头' });
    }
    if (PROPHET_OFFICIAL_LEVEL_IDS.includes(id as (typeof PROPHET_OFFICIAL_LEVEL_IDS)[number])) {
      issues.push({ kind: 'unverified', targetId: id, message: '原型数值不得写入正式 Prophet ID' });
    }
  }

  // 3) actionsPerRound 必须为 3（已核对规则）
  if (PROPHET_PROTOTYPE_BOSS.actionsPerRound !== PROPHET_ACTIONS_PER_ROUND) {
    issues.push({
      kind: 'non-monotonic',
      targetId: PROPHET_PROTOTYPE_BOSS_ID,
      message: `Prophet actionsPerRound 必须为 ${PROPHET_ACTIONS_PER_ROUND}`,
    });
  }

  // 4) 正式房间资料缺口（报告，不阻断开发模式）
  const officialRoom = validateRoomMap(PROPHET_OFFICIAL_ROOM_LEVEL_1);
  if (!officialRoom.isComplete) {
    issues.push({
      kind: 'missing-level',
      targetId: PROPHET_OFFICIAL_ROOM_LEVEL_1.id,
      level: 1,
      message: `正式 Room Map 不完整（${officialRoom.missing.length} 项缺失）→ official battle 禁用`,
    });
  }

  // 5) Prototype 房间自身必须自洽（否则 harness 也不可信）
  const protoRoom = validateRoomMap(PROPHET_PROTOTYPE_ROOM);
  if (!protoRoom.isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: PROPHET_PROTOTYPE_ROOM_ID,
      message: `Prototype Room Map 不自洽：${protoRoom.missing.join('；')}`,
    });
  }

  // 6) 第三行动固定引用的 Rubble Definition 必须存在（§6 校验清单）。
  //    注意：ACTION_OVERRIDES 存的是**正式语义 ID**（prophet-rubble-of-ruin），
  //    原型实现用 prototype- 前缀 ID，因此这里按 resolve 后的实现 ID 校验。
  const rubbleImplId = resolveProphetActionSkillId(3, 'prototype');
  if (!PROPHET_PROTOTYPE_BOSS.skills.some((s) => s.id === rubbleImplId)) {
    issues.push({
      kind: 'unknown-owner',
      targetId: rubbleImplId,
      message: `第三行动引用的 Rubble Definition「${rubbleImplId}」不存在于 Skill 列表`,
    });
  }

  // 7) 第二行动普通 Skill Table 必须非空（§6 校验清单）
  const normalSkills = getProphetNormalSkillTable('prototype');
  if (normalSkills.length === 0) {
    issues.push({
      kind: 'missing-level',
      targetId: PROPHET_PROTOTYPE_BOSS_ID,
      level: 1,
      message: '第二行动普通 Skill Table 为空 → ordinal 2 无法结算',
    });
  }

  // 8) verified 数据必须带 sourceReference（当前无 verified 数据，规则预置）
  for (const boss of [PROPHET_PROTOTYPE_BOSS]) {
    if (boss.officialDataStatus === 'verified' && !boss.sourceReference) {
      issues.push({
        kind: 'unverified',
        targetId: boss.id,
        message: 'verified 数据必须提供 sourceReference',
      });
    }
  }

  return issues;
}

/** Prophet 注册表汇总。 */
export const PROPHET_REGISTRY = {
  familyId: PROPHET_FAMILY_ID,
  prototypeBoss: PROPHET_PROTOTYPE_BOSS,
  prototypeRoom: PROPHET_PROTOTYPE_ROOM,
  officialRoom: PROPHET_OFFICIAL_ROOM_LEVEL_1,
  officialBattleEnabled: isProphetOfficialBattleEnabled(),
};
