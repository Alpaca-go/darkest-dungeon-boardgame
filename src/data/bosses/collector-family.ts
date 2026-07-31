// Phase 9D §6 / §7 / §10 / §11 / §12：Collector 家族注册表与 Level 定义。
//
// 硬约束（文档 §4 / §26 清单）：
// - 不复制 Phase 9A 状态机（只声明数据，运行时复用既有 Monster Turn / Victory / XP）；
// - Collected 是 Monster BattleActor，不是 Hero 实例；
// - 不复用玩家 Hero 技能推导 Collected；
// - 固定 Stance 来自 Room Definition，不使用 First Empty Stance；
// - 缺失 Room / 任一 Collected / Skill 时 official battle 禁用；
// - Prototype 使用 prototype ID，绝不进正式池；
// - 不使用电子游戏资料；不推算 Level II / III；
// - Collector 死亡立即停止 Queue 并清理全部 Collected；
// - XP 复用 Phase 9A / 8D（固定 3）。
//
// 资料缺口（§4）：Collector Battle Card / Threat / Room Card / 三个 Collected 完整数值
// 在 docs/data/collector/ 模板中全部标 unavailable（stats:null / skills:[] / areaId:""）。
// 因此 collector-level-* 保持禁用（enabledInOfficialPool = false），
// 仅提供 prototype harness 供开发模式使用；最终报告明确缺口（§26 完成定义）。

import type { BossDefinition, BossSkillDefinition, CampaignLevel } from '../../types/bosses';
import type { MonsterSkillDefinition } from '../../types';
import type { RegistryValidationIssue } from '../../types/progression';
import type {
  CollectedMonsterDefinition,
  CollectedRole,
  CollectedStance,
  CollectorActionDecision,
  CollectorRoomDefinition,
  ConditionalBossActionOverride,
  LinkedSummonGroupDefinition,
} from '../../types/collector';

// ---------------------------------------------------------------------------
// 家族 / ID 常量
// ---------------------------------------------------------------------------

export const COLLECTOR_FAMILY_ID = 'collector';

/** 开发模式 Prototype 家族 id（明确标注，绝不进正式池）。 */
export const COLLECTOR_PROTOTYPE_FAMILY_ID = 'prototype-collector-family';

/** Prototype Level 1 Boss id（不冒充正式 collector-level-1）。 */
export const COLLECTOR_PROTOTYPE_BOSS_ID = 'prototype-collector-level-1-harness';

export const COLLECTOR_PROTOTYPE_ROOM_ID = 'prototype-collector-room';

// 三个 Collected 的 prototype 定义 id（§4 开发测试 ID 必须独立）。
export const COLLECTED_PROTOTYPE_IDS: Record<CollectedRole, string> = {
  'man-at-arms': 'prototype-collected-man-at-arms',
  highwayman: 'prototype-collected-highwayman',
  vestal: 'prototype-collected-vestal',
};

// ---------------------------------------------------------------------------
// §7 正式 Room Definition（刻意留空映射 → 驱动 Data Gate）
// ---------------------------------------------------------------------------

/**
 * 正式 Room：所有 Area 为空串、validAreaIds 为空，officialDataStatus = 'unavailable'。
 * validateCollectorRoom 必然失败 → isCollectorOfficialBattleEnabled() = false。
 */
export const COLLECTOR_OFFICIAL_ROOM_LEVEL_1: CollectorRoomDefinition = {
  id: 'collector-room-level-1',
  bossFamilyId: 'collector',
  collectorPlacement: { stance: 'aggressive', areaId: '' },
  collectedPlacements: [
    { role: 'man-at-arms', stance: 'defensive', areaId: '' },
    { role: 'highwayman', stance: 'ranged', areaId: '' },
    { role: 'vestal', stance: 'support', areaId: '' },
  ],
  lootChestPlacements: [
    { slotId: 'chest-1', areaId: '' },
    { slotId: 'chest-2', areaId: '' },
    { slotId: 'chest-3', areaId: '' },
  ],
  heroPlacementRules: [{ rule: 'first-empty-stance' }],
  roomEffects: [{ key: 'collector-room-effect', type: 'boss-room' }],
  validAreaIds: [],
  officialDataStatus: 'unavailable',
};

// ---------------------------------------------------------------------------
// §7 Prototype Room Definition（开发 harness；固定 Area 来自本 Room）
// ---------------------------------------------------------------------------

const PROTOTYPE_AREA_COLLECTOR = 'collector-a';
const PROTOTYPE_AREA_MAA = 'collector-maa'; // Man-at-Arms → Defensive
const PROTOTYPE_AREA_HW = 'collector-hw'; // Highwayman → Ranged
const PROTOTYPE_AREA_VEST = 'collector-vest'; // Vestal → Support
const PROTOTYPE_AREA_CHEST = ['collector-chest-1', 'collector-chest-2', 'collector-chest-3'];

export const COLLECTOR_PROTOTYPE_ROOM: CollectorRoomDefinition = {
  id: COLLECTOR_PROTOTYPE_ROOM_ID,
  bossFamilyId: 'collector',
  collectorPlacement: { stance: 'aggressive', areaId: PROTOTYPE_AREA_COLLECTOR },
  collectedPlacements: [
    { role: 'man-at-arms', stance: 'defensive', areaId: PROTOTYPE_AREA_MAA },
    { role: 'highwayman', stance: 'ranged', areaId: PROTOTYPE_AREA_HW },
    { role: 'vestal', stance: 'support', areaId: PROTOTYPE_AREA_VEST },
  ],
  lootChestPlacements: [
    { slotId: 'chest-1', areaId: PROTOTYPE_AREA_CHEST[0] },
    { slotId: 'chest-2', areaId: PROTOTYPE_AREA_CHEST[1] },
    { slotId: 'chest-3', areaId: PROTOTYPE_AREA_CHEST[2] },
  ],
  heroPlacementRules: [{ rule: 'first-empty-stance' }],
  roomEffects: [{ key: 'collector-room-effect', type: 'boss-room' }],
  validAreaIds: [
    PROTOTYPE_AREA_COLLECTOR,
    PROTOTYPE_AREA_MAA,
    PROTOTYPE_AREA_HW,
    PROTOTYPE_AREA_VEST,
    ...PROTOTYPE_AREA_CHEST,
  ],
  officialDataStatus: 'prototype',
};

// ---------------------------------------------------------------------------
// §10 三个 Collected Monster Definitions（prototype；有 HP / Skill / Initiative）
// ---------------------------------------------------------------------------

/** 每个 Collected 至少 2 个 prototype 技能（结构对齐 MonsterSkillDefinition）。 */
const COLLECTED_PROTOTYPE_SKILLS: MonsterSkillDefinition[] = [
  // Man-at-Arms（Defensive）
  {
    id: 'prototype-collected-maa-bash',
    monsterId: COLLECTED_PROTOTYPE_IDS['man-at-arms'],
    name: '盾击（原型）',
    usableFromPositions: [1, 2],
    validTargetPositions: [1, 2],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 3,
    maxDamage: 5,
    applyEffects: [{ type: 'stun', amount: 1 }],
    description: 'Man-at-Arms 原型攻击：前排盾击，可能击晕。',
  },
  {
    id: 'prototype-collected-maa-guard',
    monsterId: COLLECTED_PROTOTYPE_IDS['man-at-arms'],
    name: '守势（原型）',
    usableFromPositions: [1, 2],
    validTargetPositions: [1],
    targetSide: 'self',
    accuracy: 0,
    minDamage: 0,
    maxDamage: 0,
    description: 'Man-at-Arms 原型防御姿态。',
  },
  // Highwayman（Ranged）
  {
    id: 'prototype-collected-hw-shot',
    monsterId: COLLECTED_PROTOTYPE_IDS['highwayman'],
    name: '精准射击（原型）',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy',
    accuracy: 8,
    minDamage: 4,
    maxDamage: 6,
    description: 'Highwayman 原型远程攻击。',
  },
  {
    id: 'prototype-collected-hw-bleed',
    monsterId: COLLECTED_PROTOTYPE_IDS['highwayman'],
    name: '匕首放血（原型）',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 3,
    maxDamage: 5,
    applyEffects: [{ type: 'bleed', amount: 2 }],
    description: 'Highwayman 原型攻击：施加 Bleed。',
  },
  // Vestal（Support）
  {
    id: 'prototype-collected-vest-smite',
    monsterId: COLLECTED_PROTOTYPE_IDS['vestal'],
    name: '惩戒（原型）',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 3,
    maxDamage: 5,
    stress: 1,
    description: 'Vestal 原型攻击：造成少量伤害与压力。',
  },
  {
    id: 'prototype-collected-vest-heal',
    monsterId: COLLECTED_PROTOTYPE_IDS['vestal'],
    name: '治愈之光（原型）',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3, 4],
    targetSide: 'ally',
    accuracy: 0,
    minDamage: 0,
    maxDamage: 0,
    heal: 4,
    stressHeal: 2,
    description: 'Vestal 原型治疗友方、缓解压力。',
  },
];

/** 取 Collected 技能定义（供运行时 / UI 查询）。 */
export function getCollectedSkillById(skillId: string): MonsterSkillDefinition | undefined {
  return COLLECTED_PROTOTYPE_SKILLS.find((s) => s.id === skillId);
}

export const COLLECTED_MAN_AT_ARMS: CollectedMonsterDefinition = {
  id: COLLECTED_PROTOTYPE_IDS['man-at-arms'],
  name: 'Collected Man-at-Arms（原型）',
  maxHp: 24,
  speed: 2,
  targetRule: 'closest',
  skillIds: ['prototype-collected-maa-bash', 'prototype-collected-maa-guard'],
  color: '#7a5a2b',
  collectedRole: 'man-at-arms',
  collectedTags: ['collected', 'collector-retinue'],
  requiredStance: 'defensive',
  requiredRoomAreaId: PROTOTYPE_AREA_MAA,
  officialDataStatus: 'prototype',
};

export const COLLECTED_HIGHWAYMAN: CollectedMonsterDefinition = {
  id: COLLECTED_PROTOTYPE_IDS['highwayman'],
  name: 'Collected Highwayman（原型）',
  maxHp: 18,
  speed: 5,
  targetRule: 'random',
  skillIds: ['prototype-collected-hw-shot', 'prototype-collected-hw-bleed'],
  color: '#5a7a2b',
  collectedRole: 'highwayman',
  collectedTags: ['collected', 'collector-retinue'],
  requiredStance: 'ranged',
  requiredRoomAreaId: PROTOTYPE_AREA_HW,
  officialDataStatus: 'prototype',
};

export const COLLECTED_VESTAL: CollectedMonsterDefinition = {
  id: COLLECTED_PROTOTYPE_IDS['vestal'],
  name: 'Collected Vestal（原型）',
  maxHp: 20,
  speed: 3,
  targetRule: 'mostWounded',
  skillIds: ['prototype-collected-vest-smite', 'prototype-collected-vest-heal'],
  color: '#7a2b5a',
  collectedRole: 'vestal',
  collectedTags: ['collected', 'collector-retinue'],
  requiredStance: 'support',
  requiredRoomAreaId: PROTOTYPE_AREA_VEST,
  officialDataStatus: 'prototype',
};

const COLLECTED_BY_ROLE: Record<CollectedRole, CollectedMonsterDefinition> = {
  'man-at-arms': COLLECTED_MAN_AT_ARMS,
  highwayman: COLLECTED_HIGHWAYMAN,
  vestal: COLLECTED_VESTAL,
};

// ---------------------------------------------------------------------------
// §12 Linked Summon Group Definition（原子三单位）
// ---------------------------------------------------------------------------

export const COLLECTOR_LINKED_SUMMON_GROUP: LinkedSummonGroupDefinition = {
  id: 'collector-linked-summon-group',
  sourceBossFamilyId: 'collector',
  members: [
    {
      role: 'man-at-arms',
      monsterDefinitionId: COLLECTED_PROTOTYPE_IDS['man-at-arms'],
      requiredStance: 'defensive',
      requiredAreaId: PROTOTYPE_AREA_MAA,
    },
    {
      role: 'highwayman',
      monsterDefinitionId: COLLECTED_PROTOTYPE_IDS['highwayman'],
      requiredStance: 'ranged',
      requiredAreaId: PROTOTYPE_AREA_HW,
    },
    {
      role: 'vestal',
      monsterDefinitionId: COLLECTED_PROTOTYPE_IDS['vestal'],
      requiredStance: 'support',
      requiredAreaId: PROTOTYPE_AREA_VEST,
    },
  ],
  requireAllMembers: true,
  atomic: true,
  resummonPolicy: 'when-none-alive-on-source-turn',
};

// ---------------------------------------------------------------------------
// §11 Conditional Boss Action Override
// ---------------------------------------------------------------------------

export const COLLECTOR_CONDITIONAL_OVERRIDE: ConditionalBossActionOverride = {
  id: 'collector-summon-when-no-collected',
  priority: 10,
  condition: { type: 'no-alive-actors-with-tag', tag: 'collected' },
  resolverId: 'collector-summon-collected-group',
  replacesNormalSkill: true,
};

// ---------------------------------------------------------------------------
// §19 Prototype Collector Boss（普通 Skill 仅 1 条 prototype 攻击）
// ---------------------------------------------------------------------------

const COLLECTOR_PROTOTYPE_SKILLS: BossSkillDefinition[] = [
  {
    id: 'prototype-collector-normal-strike',
    bossId: COLLECTOR_PROTOTYPE_BOSS_ID,
    name: '夺魂一击（原型）',
    kind: 'attack',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 3,
    maxDamage: 5,
    stress: 1,
    description: 'Collector 原型普通攻击：命中前排，少量伤害与 1 点压力。仅验证管线。',
  },
];

export const COLLECTOR_PROTOTYPE_BOSS: BossDefinition = {
  id: COLLECTOR_PROTOTYPE_BOSS_ID,
  familyId: COLLECTOR_PROTOTYPE_FAMILY_ID,
  name: 'Collector（原型 Harness）',
  campaignLevel: 1,

  // 每轮一次行动：要么 Summon、要么普通 Skill（§3 / §11）。
  actionsPerRound: 1,

  stats: {
    maxHp: 45,
    dodge: 12,
    movement: 0,
    speed: 4,
    resistances: { stun: 40, blight: 40, bleed: 40, disease: 60, debuff: 40, move: 80 },
    immunities: ['mark'],
    size: 1,
  },

  skills: COLLECTOR_PROTOTYPE_SKILLS,
  specialRules: [],
  summonRules: [],

  roomDefinitionId: COLLECTOR_PROTOTYPE_ROOM_ID,
  targetRule: 'closest',
  color: '#3a6a7a',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// 查询函数（与 Phase 9A Boss Registry 同构）
// ---------------------------------------------------------------------------

/** 取 Collector 某 Level 的 Boss 定义（资料缺口：仅 prototype 可用）。 */
export function getCollectorDefinition(
  level: CampaignLevel,
  mode: 'formal' | 'prototype' = 'prototype'
): BossDefinition | undefined {
  if (level !== 1) return undefined; // Level II / III 数据缺失 → 不复制 Level I
  if (mode === 'formal') return undefined; // official 战斗禁用
  return COLLECTOR_PROTOTYPE_BOSS;
}

/** 取 Collector 某 Level 的 Threat 定义（无 Threat 数据 → undefined）。 */
export function getCollectorThreat(level: CampaignLevel): undefined {
  if (level !== 1) return undefined;
  return undefined;
}

/** 取 Collector 某 Level 的 Room Definition。 */
export function getCollectorRoomDefinition(
  level: CampaignLevel,
  mode: 'formal' | 'prototype' = 'prototype'
): CollectorRoomDefinition | undefined {
  if (level !== 1) return undefined;
  return mode === 'formal' ? COLLECTOR_OFFICIAL_ROOM_LEVEL_1 : COLLECTOR_PROTOTYPE_ROOM;
}

/** 取 Collected 定义（role + level）。 */
export function getCollectedDefinition(
  role: CollectedRole,
  level: CampaignLevel
): CollectedMonsterDefinition | undefined {
  if (level !== 1) return undefined;
  return COLLECTED_BY_ROLE[role];
}

// ---------------------------------------------------------------------------
// §6 / §7 校验
// ---------------------------------------------------------------------------

export interface CollectorRoomValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

/**
 * Room Definition 校验（§6 至少包括：Collector / Room / 3 Chest / 3 Collected /
 * 3 Stance / 3 Area / Skill Table / Threat / sourceReference）。
 * 正式 Room 留空映射必然失败 → 驱动 Data Gate。
 */
export function validateCollectorRoom(room: CollectorRoomDefinition): CollectorRoomValidationResult {
  const missing: string[] = [];
  const issues: string[] = [];

  if (!room.collectorPlacement.areaId || !room.validAreaIds.includes(room.collectorPlacement.areaId)) {
    missing.push(`collector-area:${room.collectorPlacement.areaId || '(empty)'}`);
  }
  if (room.collectorPlacement.stance !== 'aggressive') {
    issues.push('Collector 必须部署 Aggressive Stance');
  }

  const seenRoles = new Set<CollectedRole>();
  const fixedStances: CollectedStance[] = ['defensive', 'ranged', 'support'];
  const roleByStance = new Map<CollectedStance, CollectedRole>();

  for (const p of room.collectedPlacements) {
    if (seenRoles.has(p.role)) missing.push(`duplicate-role:${p.role}`);
    seenRoles.add(p.role);
    if (!fixedStances.includes(p.stance)) issues.push(`invalid-stance:${p.role}:${p.stance}`);
    const expected =
      p.role === 'man-at-arms' ? 'defensive' : p.role === 'highwayman' ? 'ranged' : 'support';
    if (p.stance !== expected) issues.push(`mismatch-stance:${p.role}:${p.stance}`);
    if (!p.areaId || !room.validAreaIds.includes(p.areaId)) {
      missing.push(`collected-area:${p.role}:${p.areaId || '(empty)'}`);
    }
    if (roleByStance.has(p.stance)) missing.push(`stance-conflict:${p.stance}`);
    roleByStance.set(p.stance, p.role);
  }
  if (room.collectedPlacements.length !== 3) missing.push('collected-count!=3');

  if (room.lootChestPlacements.length !== 3) missing.push('chest-count!=3');
  for (const c of room.lootChestPlacements) {
    if (!c.areaId || !room.validAreaIds.includes(c.areaId)) {
      missing.push(`chest-area:${c.slotId}:${c.areaId || '(empty)'}`);
    }
  }

  if (room.officialDataStatus === 'unavailable') {
    issues.push('Room Card 数据缺失（unavailable）→ official battle 禁用');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

/** official battle 是否启用（§6 双标记 + Room 校验通过）。 */
export function isCollectorOfficialBattleEnabled(): boolean {
  const official = getCollectorDefinition(1, 'formal');
  if (!official || !official.enabledInOfficialPool || official.officialDataStatus !== 'verified') {
    return false;
  }
  const room = getCollectorRoomDefinition(1, 'formal');
  if (!room || !validateCollectorRoom(room).isComplete) return false;
  // 三个 Collected 必须均为 verified
  const roles: CollectedRole[] = ['man-at-arms', 'highwayman', 'vestal'];
  if (!roles.every((r) => getCollectedDefinition(r, 1)?.officialDataStatus === 'verified')) {
    return false;
  }
  return true;
}

/** 列出 official 战斗禁用的根因（审计报告用）。 */
export function getCollectorOfficialDataGaps(): string[] {
  const gaps: string[] = [];
  if (!getCollectorDefinition(1, 'formal')) gaps.push('collector-battle-level-1（Battle Card 缺失）');
  if (getCollectorThreat(1) === undefined) gaps.push('collector-threat-level-1（Threat 缺失）');
  const officialRoom = getCollectorRoomDefinition(1, 'formal');
  if (!officialRoom || !validateCollectorRoom(officialRoom).isComplete) {
    gaps.push('collector-room-card（Room Card / Tile / Area 缺失）');
  }
  const roles: CollectedRole[] = ['man-at-arms', 'highwayman', 'vestal'];
  for (const r of roles) {
    const def = getCollectedDefinition(r, 1);
    if (!def || def.officialDataStatus !== 'verified') {
      gaps.push(`collected-${r}（卡牌数值缺失）`);
    }
  }
  return gaps;
}

/** 普通 Skill Table（ordinal 走正式技能；原型仅 1 条攻击）。 */
export function getCollectorNormalSkillTable(
  level: CampaignLevel = 1,
  mode: 'formal' | 'prototype' = 'prototype'
): string[] {
  const boss = getCollectorDefinition(level, mode);
  if (!boss) return [];
  // 排除召唤类（Collector 的 Summon 由 Conditional Override 完全替代，不走 Skill Table）
  return boss.skills.filter((s) => s.kind !== 'summon').map((s) => s.id);
}

/**
 * 评估 Conditional Override（§11）：
 * aliveCollectedCount === 0 → 完全替代普通 Skill，整组召唤；
 * 否则 → 正常走普通 Skill Table。
 */
export function resolveCollectorActionOverride(aliveCollectedCount: number): CollectorActionDecision {
  if (aliveCollectedCount === 0) return 'summon-collected-group';
  return 'normal-skill-table';
}

// ---------------------------------------------------------------------------
// §6 家族校验（只报告，不抛异常）
// ---------------------------------------------------------------------------

export function validateCollectorFamily(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  // 1) 正式 Boss 必须 verified + 入池（当前缺失 → 禁用）
  if (isCollectorOfficialBattleEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: COLLECTOR_PROTOTYPE_BOSS_ID,
      message: 'Collector official battle 意外启用，需复核数据',
    });
  }

  // 2) Prototype Boss 不得 enabledInOfficialPool
  if (COLLECTOR_PROTOTYPE_BOSS.enabledInOfficialPool) {
    issues.push({
      kind: 'unverified',
      targetId: COLLECTOR_PROTOTYPE_BOSS_ID,
      message: 'Collector prototype Boss 不得 enabledInOfficialPool',
    });
  }

  // 3) 正式 Room 必须不自洽（驱动 Data Gate）
  const officialRoom = getCollectorRoomDefinition(1, 'formal');
  if (officialRoom && validateCollectorRoom(officialRoom).isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: officialRoom.id,
      message: 'Collector 正式 Room 意外通过校验',
    });
  }

  // 4) Prototype Room 必须自洽（harness 可信）
  const protoRoom = validateCollectorRoom(COLLECTOR_PROTOTYPE_ROOM);
  if (!protoRoom.isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: COLLECTOR_PROTOTYPE_ROOM_ID,
      message: `Prototype Room 不自洽：${protoRoom.missing.join('；')}`,
    });
  }

  // 5) 三个 Collected 定义必须存在且 prototype 状态一致
  const roles: CollectedRole[] = ['man-at-arms', 'highwayman', 'vestal'];
  for (const role of roles) {
    const def = getCollectedDefinition(role, 1);
    if (!def) {
      issues.push({
        kind: 'unknown-owner',
        targetId: COLLECTED_PROTOTYPE_IDS[role],
        message: `Collected ${role} 定义缺失`,
      });
    } else if (def.officialDataStatus !== 'prototype') {
      issues.push({
        kind: 'unverified',
        targetId: def.id,
        message: `Collected ${role} 状态异常`,
      });
    }
  }

  // 6) Linked Summon Group 必须恰好三个成员
  if (COLLECTOR_LINKED_SUMMON_GROUP.members.length !== 3) {
    issues.push({
      kind: 'non-monotonic',
      targetId: COLLECTOR_LINKED_SUMMON_GROUP.id,
      message: 'Linked Summon Group 成员数必须为 3',
    });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const COLLECTOR_REGISTRY: { boss: BossDefinition; room: CollectorRoomDefinition } = {
  boss: COLLECTOR_PROTOTYPE_BOSS,
  room: COLLECTOR_PROTOTYPE_ROOM,
};
