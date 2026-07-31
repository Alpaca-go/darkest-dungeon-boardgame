// Phase 9E §6 / §7 / §9 / §13 / §17 / §18：Fanatic / Pyre 家族注册表与 Level 定义。
//
// 硬约束（文档 §3 / §22 清单）：
// - 不复制 Phase 9A 状态机（只声明数据，运行时复用既有 Monster Turn / Victory / XP）；
// - Fanatic 是 Boss BattleActor，Pyre 是独立 Boss-minion BattleActor；
// - Pyre 不是 Hazard，不进入 Monster Spawn Pool；
// - 固定 Stance 来自 Room Definition，不使用 First Empty Stance；
// - 缺失 Room / Pyre / Captive / Skill 时 official battle 禁用；
// - Prototype 使用 prototype ID，绝不进正式池；
// - 不使用电子游戏资料；不推算 Level II / III；
// - Fanatic 死亡立即停止 Queue 并移除 Pyre（§22）；
// - XP 复用 Phase 9A / 8D（固定 3）。
//
// 资料缺口（§3）：Fanatic Battle Card / Threat / Room Card / Pyre Card / Captive Effect
// 在 docs/data/fanatic/ 模板中全部标 unavailable（stats:null / skills:[] / areaId:""）。
// 因此 fanatic-level-* 保持禁用（enabledInOfficialPool = false），
// 仅提供 prototype harness 供开发模式使用；最终报告明确缺口（§30 完成定义）。

import type { BossDefinition, BossSkillDefinition, CampaignLevel } from '../../types/bosses';
import type { MonsterSkillDefinition } from '../../types';
import type { RegistryValidationIssue } from '../../types/progression';
import type {
  FanaticRoomDefinition,
  PyreCaptiveEffectDefinition,
  PyreMonsterDefinition,
} from '../../types/fanatic';

// ---------------------------------------------------------------------------
// 家族 / ID 常量
// ---------------------------------------------------------------------------

export const FANATIC_FAMILY_ID = 'fanatic';

/** 开发模式 Prototype 家族 id（明确标注，绝不进正式池）。 */
export const FANATIC_PROTOTYPE_FAMILY_ID = 'prototype-fanatic-family';

/** Prototype Level 1 Boss id（不冒充正式 fanatic-level-1）。 */
export const FANATIC_PROTOTYPE_BOSS_ID = 'prototype-fanatic-level-1-harness';

export const FANATIC_PROTOTYPE_ROOM_ID = 'prototype-fanatic-room';

/** Pyre 关联实体 prototype id（独立 ID，不进正式池）。 */
export const PYRE_PROTOTYPE_ID = 'prototype-pyre-level-1';

/** Captive Effect prototype id（独立 ID，驱动 Captive 行为）。 */
export const PYRE_PROTOTYPE_CAPTIVE_EFFECT_ID = 'prototype-pyre-captive-effect';

// ---------------------------------------------------------------------------
// §7 正式 Room Definition（刻意留空映射 → 驱动 Data Gate）
// ---------------------------------------------------------------------------

/**
 * 正式 Room：所有 Area 为空串、validAreaIds / areaCapacities 为空，
 * officialDataStatus = 'unavailable'。validateFanaticRoom 必然失败 →
 * isFanaticOfficialBattleEnabled() = false。
 */
export const FANATIC_OFFICIAL_ROOM_LEVEL_1: FanaticRoomDefinition = {
  id: 'fanatic-room-level-1',
  bossFamilyId: 'fanatic',
  fanaticPlacement: { stance: 'aggressive', areaId: '' },
  pyrePlacement: { stance: 'ranged', areaId: '' },
  heroPlacementRules: [{ rule: 'first-empty-stance' }],
  roomEffects: [{ key: 'fanatic-room-effect', type: 'boss-room' }],
  validAreaIds: [],
  areaCapacities: {},
  officialDataStatus: 'unavailable',
};

// ---------------------------------------------------------------------------
// §7 Prototype Room Definition（开发 harness；固定 Area 来自本 Room）
// ---------------------------------------------------------------------------

const PROTOTYPE_AREA_FANATIC = 'fanatic-a'; // Fanatic → Aggressive
const PROTOTYPE_AREA_PYRE = 'pyre-a'; // Pyre → Ranged
const PROTOTYPE_AREA_HERO = ['hero-1', 'hero-2', 'hero-3', 'hero-4']; // position 1—4

/** Prototype Room Area Graph（路径距离，§13）：Hero 一线排开，Fanatic 接 hero-1，Pyre 接 hero-3。 */
export const FANATIC_PROTOTYPE_AREA_GRAPH = {
  areas: [PROTOTYPE_AREA_FANATIC, PROTOTYPE_AREA_PYRE, ...PROTOTYPE_AREA_HERO],
  edges: [
    { from: PROTOTYPE_AREA_FANATIC, to: PROTOTYPE_AREA_HERO[0], distance: 1 },
    { from: PROTOTYPE_AREA_HERO[0], to: PROTOTYPE_AREA_HERO[1], distance: 1 },
    { from: PROTOTYPE_AREA_HERO[1], to: PROTOTYPE_AREA_HERO[2], distance: 1 },
    { from: PROTOTYPE_AREA_HERO[2], to: PROTOTYPE_AREA_HERO[3], distance: 1 },
    { from: PROTOTYPE_AREA_PYRE, to: PROTOTYPE_AREA_HERO[2], distance: 1 },
  ],
};

export const FANATIC_PROTOTYPE_ROOM: FanaticRoomDefinition = {
  id: FANATIC_PROTOTYPE_ROOM_ID,
  bossFamilyId: 'fanatic',
  fanaticPlacement: { stance: 'aggressive', areaId: PROTOTYPE_AREA_FANATIC },
  pyrePlacement: { stance: 'ranged', areaId: PROTOTYPE_AREA_PYRE },
  heroPlacementRules: [{ rule: 'first-empty-stance' }],
  roomEffects: [{ key: 'fanatic-room-effect', type: 'boss-room' }],
  validAreaIds: [PROTOTYPE_AREA_FANATIC, PROTOTYPE_AREA_PYRE, ...PROTOTYPE_AREA_HERO],
  // Pyre Area 容量 = 1（同一时刻一名 Captive，多 Captive 未经确认禁止，§20）
  areaCapacities: {
    [PROTOTYPE_AREA_FANATIC]: 1,
    [PROTOTYPE_AREA_PYRE]: 1,
    [PROTOTYPE_AREA_HERO[0]]: 1,
    [PROTOTYPE_AREA_HERO[1]]: 1,
    [PROTOTYPE_AREA_HERO[2]]: 1,
    [PROTOTYPE_AREA_HERO[3]]: 1,
  },
  officialDataStatus: 'prototype',
};

// ---------------------------------------------------------------------------
// §9 / §18 Prototype Pyre（独立 BattleActor，boss-minion）
// ---------------------------------------------------------------------------

export const PYRE_PROTOTYPE_SKILLS: MonsterSkillDefinition[] = [
  {
    id: 'prototype-pyre-scorch',
    monsterId: PYRE_PROTOTYPE_ID,
    name: '灼烧（原型）',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2, 3, 4],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 3,
    maxDamage: 6,
    stress: 1,
    description: 'Pyre 原型攻击：对全场 Hero 造成少量伤害与压力。仅验证管线。',
  },
];

export const PYRE_PROTOTYPE: PyreMonsterDefinition = {
  id: PYRE_PROTOTYPE_ID,
  name: 'Pyre（原型）',
  maxHp: 20,
  speed: 1,
  targetRule: 'closest',
  skillIds: ['prototype-pyre-scorch'],
  color: '#b5532b',
  requiredStance: 'ranged',
  captiveEffectDefinitionId: PYRE_PROTOTYPE_CAPTIVE_EFFECT_ID,
  officialDataStatus: 'prototype',
};

// ---------------------------------------------------------------------------
// §17 Prototype Captive Effect（驱动 Captive 行为；明确标 prototype，不进正式池）
// ---------------------------------------------------------------------------

export const PYRE_PROTOTYPE_CAPTIVE_EFFECT: PyreCaptiveEffectDefinition = {
  id: PYRE_PROTOTYPE_CAPTIVE_EFFECT_ID,
  sourceType: 'fanatic-pyre',
  // 原型行为：被投入 Pyre 期间丧失行动（仅原型验证，正式 ID 不启用）
  canAct: false,
  canMove: false,
  canUseSkill: false,
  canBeTargeted: true,
  onContainerTurn: 'none',
  onContainerDestroyed: 'released',
  officialDataStatus: 'prototype',
};

// ---------------------------------------------------------------------------
// §19 Prototype Fanatic Boss（普通 Skill 仅 1 条 prototype 攻击；前置移动走 Prelude）
// ---------------------------------------------------------------------------

const FANATIC_PROTOTYPE_SKILLS: BossSkillDefinition[] = [
  {
    id: 'prototype-fanatic-normal-skill',
    bossId: FANATIC_PROTOTYPE_BOSS_ID,
    name: '狂热打击（原型）',
    kind: 'attack',
    usableFromPositions: [1, 2, 3, 4],
    validTargetPositions: [1, 2],
    targetSide: 'enemy',
    accuracy: 7,
    minDamage: 4,
    maxDamage: 6,
    stress: 1,
    description: 'Fanatic 原型普通攻击：命中前排，少量伤害与 1 点压力。仅验证管线。',
  },
];

export const FANATIC_PROTOTYPE_BOSS: BossDefinition = {
  id: FANATIC_PROTOTYPE_BOSS_ID,
  familyId: FANATIC_PROTOTYPE_FAMILY_ID,
  name: 'Fanatic（原型 Harness）',
  campaignLevel: 1,

  // 每轮三次行动：每次都先评估 Prelude，再执行普通 Skill（§20）。
  actionsPerRound: 3,

  stats: {
    maxHp: 50,
    dodge: 10,
    // 前置移动步数从 verified Definition 读取（原型=3，不默认 1 或无限，§14）
    movement: 3,
    speed: 3,
    resistances: { stun: 40, blight: 40, bleed: 40, disease: 60, debuff: 40, move: 80 },
    immunities: ['mark'],
    size: 1,
  },

  skills: FANATIC_PROTOTYPE_SKILLS,
  specialRules: [],
  summonRules: [],

  roomDefinitionId: FANATIC_PROTOTYPE_ROOM_ID,
  targetRule: 'closest',
  color: '#9b2d2d',

  officialDataStatus: 'prototype',
  enabledInOfficialPool: false,
};

// ---------------------------------------------------------------------------
// 查询函数（与 Phase 9A Boss Registry 同构）
// ---------------------------------------------------------------------------

/** 取 Fanatic 某 Level 的 Boss 定义（资料缺口：仅 prototype 可用）。 */
export function getFanaticDefinition(
  level: CampaignLevel,
  mode: 'formal' | 'prototype' = 'prototype'
): BossDefinition | undefined {
  if (level !== 1) return undefined; // Level II / III 数据缺失 → 不复制 Level I
  if (mode === 'formal') return undefined; // official 战斗禁用
  return FANATIC_PROTOTYPE_BOSS;
}

/** 取 Fanatic 某 Level 的 Threat 定义（无 Threat 数据 → undefined）。 */
export function getFanaticThreat(level: CampaignLevel): undefined {
  if (level !== 1) return undefined;
  return undefined;
}

/** 取 Fanatic 某 Level 的 Room Definition。 */
export function getFanaticRoomDefinition(
  level: CampaignLevel,
  mode: 'formal' | 'prototype' = 'prototype'
): FanaticRoomDefinition | undefined {
  if (level !== 1) return undefined;
  return mode === 'formal' ? FANATIC_OFFICIAL_ROOM_LEVEL_1 : FANATIC_PROTOTYPE_ROOM;
}

/** 取 Pyre 某 Level 的 Monster 定义（资料缺口：仅 prototype 可用）。 */
export function getPyreDefinition(
  level: CampaignLevel,
  mode: 'formal' | 'prototype' = 'prototype'
): PyreMonsterDefinition | undefined {
  if (level !== 1) return undefined;
  if (mode === 'formal') return undefined; // official 战斗禁用
  return PYRE_PROTOTYPE;
}

/** 取 Pyre Captive Effect 定义（驱动 Captive 行为）。 */
export function getPyreCaptiveEffectDefinition(
  mode: 'formal' | 'prototype' = 'prototype'
): PyreCaptiveEffectDefinition | undefined {
  if (mode === 'formal') return undefined;
  return PYRE_PROTOTYPE_CAPTIVE_EFFECT;
}

// ---------------------------------------------------------------------------
// §6 / §7 校验
// ---------------------------------------------------------------------------

export interface FanaticRoomValidationResult {
  isComplete: boolean;
  missing: string[];
  issues: string[];
}

/**
 * Room Definition 校验（§6 至少包括：Fanatic / Pyre / 2 Area / 2 Stance /
 * Pyre Area Capacity / sourceReference）。
 * 正式 Room 留空映射必然失败 → 驱动 Data Gate。
 */
export function validateFanaticRoom(room: FanaticRoomDefinition): FanaticRoomValidationResult {
  const missing: string[] = [];
  const issues: string[] = [];

  if (!room.fanaticPlacement.areaId || !room.validAreaIds.includes(room.fanaticPlacement.areaId)) {
    missing.push(`fanatic-area:${room.fanaticPlacement.areaId || '(empty)'}`);
  }
  if (room.fanaticPlacement.stance !== 'aggressive') {
    issues.push('Fanatic 必须部署 Aggressive Stance');
  }

  if (!room.pyrePlacement.areaId || !room.validAreaIds.includes(room.pyrePlacement.areaId)) {
    missing.push(`pyre-area:${room.pyrePlacement.areaId || '(empty)'}`);
  }
  if (room.pyrePlacement.stance !== 'ranged') {
    issues.push('Pyre 必须部署 Ranged Stance');
  }
  if (room.pyrePlacement.areaId && room.areaCapacities[room.pyrePlacement.areaId] === undefined) {
    missing.push(`pyre-area-capacity:${room.pyrePlacement.areaId}`);
  }

  if (room.validAreaIds.length === 0) missing.push('validAreaIds:empty');
  if (Object.keys(room.areaCapacities).length === 0) missing.push('areaCapacities:empty');

  if (room.officialDataStatus === 'unavailable') {
    issues.push('Room Card 数据缺失（unavailable）→ official battle 禁用');
  }

  return { isComplete: missing.length === 0 && issues.length === 0, missing, issues };
}

/** official battle 是否启用（§6 双标记 + Room 校验通过）。 */
export function isFanaticOfficialBattleEnabled(): boolean {
  const official = getFanaticDefinition(1, 'formal');
  if (!official || !official.enabledInOfficialPool || official.officialDataStatus !== 'verified') {
    return false;
  }
  const room = getFanaticRoomDefinition(1, 'formal');
  if (!room || !validateFanaticRoom(room).isComplete) return false;
  const pyre = getPyreDefinition(1, 'formal');
  if (!pyre || pyre.officialDataStatus !== 'verified') return false;
  const captive = getPyreCaptiveEffectDefinition('formal');
  if (!captive || captive.officialDataStatus !== 'verified') return false;
  return true;
}

/** 列出 official 战斗禁用的根因（审计报告用）。 */
export function getFanaticOfficialDataGaps(): string[] {
  const gaps: string[] = [];
  if (!getFanaticDefinition(1, 'formal')) gaps.push('fanatic-battle-level-1（Battle Card 缺失）');
  if (getFanaticThreat(1) === undefined) gaps.push('fanatic-threat-level-1（Threat 缺失）');
  const officialRoom = getFanaticRoomDefinition(1, 'formal');
  if (!officialRoom || !validateFanaticRoom(officialRoom).isComplete) {
    gaps.push('fanatic-room-card（Room Card / Tile / Area 缺失）');
  }
  if (!getPyreDefinition(1, 'formal')) gaps.push('pyre-card-level-1（Pyre 卡牌缺失）');
  if (!getPyreCaptiveEffectDefinition('formal')) gaps.push('pyre-captive-effect（Captive / 释放规则缺失）');
  return gaps;
}

/** 普通 Skill Table（ordinal 走正式技能；原型仅 1 条攻击）。 */
export function getFanaticNormalSkillTable(
  level: CampaignLevel = 1,
  mode: 'formal' | 'prototype' = 'prototype'
): string[] {
  const boss = getFanaticDefinition(level, mode);
  if (!boss) return [];
  return boss.skills.filter((s) => s.kind !== 'summon').map((s) => s.id);
}

// ---------------------------------------------------------------------------
// §6 家族校验（只报告，不抛异常）
// ---------------------------------------------------------------------------

export function validateFanaticFamily(): RegistryValidationIssue[] {
  const issues: RegistryValidationIssue[] = [];

  // 1) 正式 Boss 必须 verified + 入池（当前缺失 → 禁用）
  if (isFanaticOfficialBattleEnabled()) {
    issues.push({
      kind: 'unknown-owner',
      targetId: FANATIC_PROTOTYPE_BOSS_ID,
      message: 'Fanatic official battle 意外启用，需复核数据',
    });
  }

  // 2) Prototype Boss 不得 enabledInOfficialPool
  if (FANATIC_PROTOTYPE_BOSS.enabledInOfficialPool) {
    issues.push({
      kind: 'unverified',
      targetId: FANATIC_PROTOTYPE_BOSS_ID,
      message: 'Fanatic prototype Boss 不得 enabledInOfficialPool',
    });
  }

  // 3) 正式 Room 必须不自洽（驱动 Data Gate）
  const officialRoom = getFanaticRoomDefinition(1, 'formal');
  if (officialRoom && validateFanaticRoom(officialRoom).isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: officialRoom.id,
      message: 'Fanatic 正式 Room 意外通过校验',
    });
  }

  // 4) Prototype Room 必须自洽（harness 可信）
  const protoRoom = validateFanaticRoom(FANATIC_PROTOTYPE_ROOM);
  if (!protoRoom.isComplete) {
    issues.push({
      kind: 'unknown-owner',
      targetId: FANATIC_PROTOTYPE_ROOM_ID,
      message: `Prototype Room 不自洽：${protoRoom.missing.join('；')}`,
    });
  }

  // 5) Pyre 定义必须存在且 prototype 状态一致
  const pyre = getPyreDefinition(1, 'prototype');
  if (!pyre) {
    issues.push({ kind: 'unknown-owner', targetId: PYRE_PROTOTYPE_ID, message: 'Pyre 定义缺失' });
  } else if (pyre.officialDataStatus !== 'prototype') {
    issues.push({ kind: 'unverified', targetId: PYRE_PROTOTYPE_ID, message: 'Pyre 状态异常' });
  }

  return issues;
}

// ---------------------------------------------------------------------------
// Registry
// ---------------------------------------------------------------------------

export const FANATIC_REGISTRY: { boss: BossDefinition; room: FanaticRoomDefinition } = {
  boss: FANATIC_PROTOTYPE_BOSS,
  room: FANATIC_PROTOTYPE_ROOM,
};
