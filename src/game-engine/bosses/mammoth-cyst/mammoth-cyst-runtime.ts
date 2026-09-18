// Phase 10C §10 / §11 / §12 / §16 / §22：Mammoth Cyst Encounter Runtime。
//
// 硬约束对照：
// - 硬约束 1 / §0：**不创建第二套 Battle / Initiative / Summon 状态机** ——
//   复用既有 BattleState（monsters 中放 Cyst，Stalk 召唤后动态追加）与既有伤害 / 压力管线；
//   Cyst 2 张 + Stalk 2 张的 Actor-specific Initiative 以「Mammoth Cyst 域卡组」建模
//   （与 Phase 9E Fanatic 的 3+1、Phase 10B Templars 的 2+2 同构）；
// - 硬约束 2 / §10：White Cell Stalk 是**独立 BattleActor（boss-minion）**，
//   绝不进入普通 Monster Deck —— 它只由本域的 summon 事务创建；
// - 硬约束 3 / §9：Setup 阶段 Stalk **只在 Reserve**，不创建 Actor、不加 Initiative；
// - 硬约束 7 / §11：Setup 时只加入 **2 张 Cyst Initiative**；
// - 硬约束 14 / §16：d10 结果**先保存后展示**，刷新不重掷；
// - 硬约束 19 / §22：Cyst 死亡后其未抽的 Initiative Card 立即失效、Queue 停止；
// - RNG 一律注入（禁止 Math.random）。

import type { BattleState, BattleUnit, CampaignState } from '../../../types';
import type { ActFourRuntimeProfileId } from '../../../types/act-four';
import type {
  D10Roll,
  MammothCystActorDefinition,
  MammothCystActorState,
  MammothCystBattleRuntime,
  MammothCystDefinitionSnapshot,
  MammothCystEncounterState,
  MammothCystHeroPlacement,
  MammothCystInitiativeCard,
  MammothCystInitiativeOwner,
  MammothCystRoomDefinition,
  MammothCystSkillDefinition,
  MammothCystSkillRollRecord,
  MonsterStance,
  WhiteCellStalkActorDefinition,
} from '../../../types/mammoth-cyst';
import {
  COMMUNITY_MAMMOTH_CYST,
  COMMUNITY_MAMMOTH_CYST_GUARDIAN,
  COMMUNITY_MAMMOTH_CYST_ROOM,
  COMMUNITY_WHITE_CELL_STALK,
  validateCommunityMammothDefinitions,
} from '../../../data/darkest-dungeon/community-reference/production-adapters';
import type { SpikedPitRuntime } from '../../../types/room-hazards';
import {
  buildMammothCystDataAudit,
  getMammothCystActorDefinition,
  getMammothCystGuardianDefinition,
  getMammothCystRoomDefinition,
  getWhiteCellStalkActorDefinition,
  hashMammothCystActor,
  hashMammothCystGuardian,
  hashMammothCystRoom,
  isMammothCystOfficialEncounterEnabled,
  validateMammothCystGuardian,
} from '../../../data/darkest-dungeon/mammoth-cyst/mammoth-cyst-registry';
import { MAMMOTH_CYST_CONTENT_VERSION } from '../../../data/darkest-dungeon/mammoth-cyst/ids';
import { MAX_ROUNDS, makeHeroUnit } from '../../battle';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import { createSeededRng, rollD10, shuffleWithRng } from '../../campaign/act-four/rng';

// ---------------------------------------------------------------------------
// 常量 / 幂等键
// ---------------------------------------------------------------------------

/** Cyst 固定站位；Stalk 召唤后占用其后的空位。 */
export const MAMMOTH_CYST_BATTLE_POSITION = 1;
export const WHITE_CELL_STALK_BATTLE_POSITION = 2;

/** Mammoth Cyst 域幂等键（§26）。 */
export const mammothCystTransactionIds = {
  roomSetup: (guardianQuestId: string, roomId: string) =>
    `mammoth-cyst-room-setup:${guardianQuestId}:${roomId}`,
  initiativeDraw: (battleId: string, cardId: string) =>
    `mammoth-cyst-initiative-draw:${battleId}:${cardId}`,
  skillRoll: (battleId: string, initiativeCardId: string) =>
    `mammoth-cyst-skill-roll:${battleId}:${initiativeCardId}`,
  /** §12：一次 Cyst 行动最多触发一次召唤（以该行动的 Initiative Card 为键）。 */
  summon: (battleId: string, sourceActionEventId: string) =>
    `mammoth-cyst-summon:${battleId}:${sourceActionEventId}`,
  /** §17 / §18：一次 Teleportation Effect 只结算一次。 */
  teleportation: (battleId: string, sourceEffectEventId: string) =>
    `white-cell-stalk-teleportation:${battleId}:${sourceEffectEventId}`,
  /** §21：Entry Effect 幂等键。 */
  areaEntryEffect: (teleportTransactionId: string, areaId: string, trigger: string) =>
    `mammoth-cyst-area-entry:${teleportTransactionId}:${areaId}:${trigger}`,
  actorDefeat: (battleId: string, actorId: string) =>
    `mammoth-cyst-actor-defeat:${battleId}:${actorId}`,
  encounterVictory: (battleId: string) => `mammoth-cyst-encounter-victory:${battleId}`,
  roundAdvance: (battleId: string, round: number) => `mammoth-cyst-round:${battleId}:${round}`,
} as const;

const TRANSACTION_LIMIT = 200;
const HISTORY_LIMIT = 200;

export function hasProcessedMammothCystTransaction(
  state: MammothCystEncounterState,
  transactionId: string,
): boolean {
  return state.processedTransactionIds.includes(transactionId);
}

export function withProcessedMammothCystTransaction(
  state: MammothCystEncounterState,
  transactionId: string,
): MammothCystEncounterState {
  if (state.processedTransactionIds.includes(transactionId)) return state;
  return {
    ...state,
    processedTransactionIds: [...state.processedTransactionIds, transactionId].slice(
      -TRANSACTION_LIMIT,
    ),
  };
}

// ---------------------------------------------------------------------------
// §10 Actor 单位构建
// ---------------------------------------------------------------------------

/**
 * 由 Definition 构建战斗单位（Cyst 与 Stalk 共用）。
 * 只搬运 Definition 已有字段，绝不发明数值（缺失时 maxHp = 0 → Data Gate 早已拦截）。
 */
export function buildMammothCystUnit(
  def: MammothCystActorDefinition | WhiteCellStalkActorDefinition,
  position: number,
  stance: MonsterStance,
): BattleUnit {
  const stats = def.stats;
  const maxHp = stats?.maxHp ?? 0;
  return {
    id: `u_${def.id}`,
    name: def.name,
    side: 'monster',
    sourceId: def.id,
    maxHp,
    hp: maxHp,
    stress: 0,
    position,
    speed: stats?.speed ?? 1,
    stance,
    isAlive: maxHp > 0,
    atDeathsDoor: false,
    deathblowRollCount: 0,
    stunned: 0,
    bleed: 0,
    blight: 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 0,
    monsterSkillIds: def.skills.map((s) => s.id),
    categoricalResistances: stats?.categoricalResistances,
    immunities: stats?.immunities,
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    mentalEffectResolvedTurnId: null,
  };
}

// ---------------------------------------------------------------------------
// §11 / §15 Actor-specific Initiative
// ---------------------------------------------------------------------------

/**
 * 创建某 Actor 的两张 Initiative Card。
 *
 * §11：每张卡只提供**绑定 Actor** 一次行动，不是「Mammoth Cyst 阵营卡」；
 * §15：Stalk 的两张卡由召唤事务在运行中动态创建（generation 区分不同代 Stalk）。
 */
export function createMammothCystInitiativeCardsFor(
  encounterId: string,
  actorId: string,
  owner: MammothCystInitiativeOwner,
  generation = 0,
): [MammothCystInitiativeCard, MammothCystInitiativeCard] {
  const suffix = owner === 'white-cell-stalk' ? `g${generation}-` : '';
  const make = (index: 0 | 1): MammothCystInitiativeCard => ({
    id: `mcinit-${actorId}-${suffix}${index}`,
    sourceType: 'boss',
    actorId,
    encounterId,
    owner,
    index,
    invalidated: false,
    transactionId: `mammoth-cyst-initiative-create:${encounterId}:${actorId}:${suffix}${index}`,
  });
  return [make(0), make(1)];
}

// ---------------------------------------------------------------------------
// Hero 站位推导
// ---------------------------------------------------------------------------

/**
 * 由 Room Definition 推导 Hero 可用 Area。
 *
 * 正式 Room Card 的 Hero 摆放规则尚未录入 → 这里只做「排除 Cyst 固定 Area 与
 * Stalk 指定 Spawn Area 后按声明顺序取」，属 prototype harness 行为；
 * official 已被 Data Gate 禁用。
 */
export function resolveMammothCystHeroAreas(room: MammothCystRoomDefinition): string[] {
  const excluded = new Set<string>([room.mammothCystPlacement.areaId]);
  if (room.whiteCellStalkSpawn.specifiedAreaId) {
    excluded.add(room.whiteCellStalkSpawn.specifiedAreaId);
  }
  return room.validAreaIds.filter((a) => !excluded.has(a));
}

function buildHeroPlacements(
  campaign: CampaignState,
  room: MammothCystRoomDefinition,
): { placements: MammothCystHeroPlacement[]; reason: string | null } {
  const areas = resolveMammothCystHeroAreas(room);
  const heroes = campaign.heroes.filter((h) => !h.dead);
  if (areas.length < heroes.length) {
    return {
      placements: [],
      reason: `Room ${room.id} 的可用 Hero Area 不足（${areas.length} < ${heroes.length}）`,
    };
  }
  return {
    placements: heroes.map((h, i) => ({ heroId: h.instanceId, areaId: areas[i] })),
    reason: null,
  };
}

/**
 * 由 Room 的 roomEntryEffects 建立 Entry Effect 运行时。
 *
 * §21：复用 Phase 10B 的 Room Hazard Runtime 形状与结算管线，
 * `resolvedTriggerKeys` 保证同一 Entry Event 只执行一次。
 */
export function createAreaEntryRuntimes(room: MammothCystRoomDefinition): SpikedPitRuntime[] {
  return Object.entries(room.roomEntryEffects).map(([areaId, effects]) => ({
    id: `mcarea-${areaId}`,
    pitDefinitionId: areaId,
    areaId,
    occupantActorIds: [],
    resolvedTriggerKeys: [],
    dataStatus: effects[0]?.officialDataStatus ?? room.officialDataStatus,
  }));
}

// ---------------------------------------------------------------------------
// §11 BattleState 构建
// ---------------------------------------------------------------------------

/**
 * 建立 Mammoth Cyst Boss Battle 的 BattleState。
 *
 * - monsters 初始**只有 Cyst**（Stalk 在 Reserve，硬约束 3）；
 * - initiativeOrder 保持「每单位一次」以兼容通用引擎的轮次重建；
 *   2（+2）的行动次数由 MammothCystEncounterState.initiativeDrawPile 驱动。
 */
export function buildMammothCystBattle(
  campaign: CampaignState,
  roomId: string,
  bossUnits: BattleUnit[],
  rng: () => number,
  battleId: string,
): BattleState {
  const heroUnits = campaign.heroes.filter((h) => !h.dead).map((h, i) => makeHeroUnit(h, i, campaign));
  const initiativeOrder = shuffleWithRng(
    rng,
    [...heroUnits, ...bossUnits].filter((u) => u.isAlive).map((u) => u.id),
  );

  return {
    battleId,
    status: 'active',
    round: 1,
    maxRounds: MAX_ROUNDS,
    heroes: heroUnits,
    monsters: bossUnits,
    initiativeOrder,
    initiativeIndex: -1,
    activeActorId: null,
    currentActionPoints: 0,
    selectedSkillId: null,
    selectedTargetId: null,
    battleLog: [
      {
        id: createId('blog'),
        at: nowIso(),
        message: 'Mammoth Cyst 在 Aggressive Stance 上搏动，White Cell Stalk 仍蛰伏于 Reserve。',
        kind: 'danger',
      },
    ],
    sourceRoomId: roomId,
    rewards: { gold: 0 },
    light: campaign.light,
  };
}

// ---------------------------------------------------------------------------
// §9 / §10 Room Setup
// ---------------------------------------------------------------------------

export interface SetupMammothCystEncounterOptions {
  mode?: ActFourRuntimeProfileId;
  rng?: () => number;
  seed?: number;
  now?: string;
}

export interface SetupMammothCystEncounterResult {
  ok: boolean;
  campaign: CampaignState;
  state: MammothCystEncounterState | null;
  alreadySetUp: boolean;
  reason: string | null;
}

/**
 * 进入 Mammoth Cyst Objective Room 的完整 Setup（§9 / §10）：
 * Reveal → 载入 Room → 创建 **Cyst 一名** Actor（Aggressive Stance + 固定 Area）→
 * 加入 **2 张** Cyst Initiative → Stalk **只登记 Reserve**（不创建 Actor、不加 Initiative）→
 * Entry Effect Runtime → 保存 → Boss Reveal。
 *
 * 幂等键：`mammoth-cyst-room-setup:{guardianQuestId}:{roomId}`。
 */
export function setupMammothCystEncounter(
  campaign: CampaignState,
  options?: SetupMammothCystEncounterOptions,
): SetupMammothCystEncounterResult {
  const actFour = campaign.actFourState;
  const quest = actFour.guardianQuestState;
  const mode: ActFourRuntimeProfileId = options?.mode ?? 'prototype';

  if (!quest) return setupFail(campaign, 'Guardian Quest 尚未创建');
  if (!quest.guardianBattleId) return setupFail(campaign, 'Guardian Battle 尚未开始');

  // ---- 幂等：同一 Room 不重复 Setup ----
  if (actFour.mammothCystEncounterState) {
    return {
      ok: true,
      campaign,
      state: actFour.mammothCystEncounterState,
      alreadySetUp: true,
      reason: null,
    };
  }

  // ---- Data Gate（硬约束 20 / §3）----
  if (mode === 'formal' && !isMammothCystOfficialEncounterEnabled()) {
    return setupFail(
      campaign,
      'official Mammoth Cyst 数据缺失（Battle Card / Spawn Policy / d10 Area Map / Capacity / Victory），正式 Mammoth Cyst 战斗已禁用',
    );
  }
  const validation = mode === 'community-reference' ? validateCommunityMammothDefinitions() : validateMammothCystGuardian(mode);
  if (!validation.isComplete) {
    return setupFail(
      campaign,
      `Mammoth Cyst 定义不完整：${[...validation.missing, ...validation.issues].join('；')}`,
    );
  }

  const guardianDef = mode === 'community-reference' ? COMMUNITY_MAMMOTH_CYST_GUARDIAN : getMammothCystGuardianDefinition(mode);
  const cystDef = mode === 'community-reference' ? COMMUNITY_MAMMOTH_CYST : getMammothCystActorDefinition(mode);
  const stalkDef = mode === 'community-reference' ? COMMUNITY_WHITE_CELL_STALK : getWhiteCellStalkActorDefinition(mode);
  const room = mode === 'community-reference' ? COMMUNITY_MAMMOTH_CYST_ROOM : getMammothCystRoomDefinition(mode);

  const { placements, reason: placementReason } = buildHeroPlacements(campaign, room);
  if (placementReason) return setupFail(campaign, placementReason);

  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10c5c);
  const battleId = quest.guardianBattleId;
  const roomId = room.id;
  const transactionId = mammothCystTransactionIds.roomSetup(quest.id, roomId);

  // ---- 只创建 Cyst 一名 Actor（硬约束 3：Stalk 在 Reserve）----
  const cystUnit = buildMammothCystUnit(cystDef, MAMMOTH_CYST_BATTLE_POSITION, 'aggressive');
  const actorStates: MammothCystActorState[] = [
    {
      actorId: cystUnit.id,
      actorDefinitionId: cystDef.id,
      owner: 'mammoth-cyst',
      name: cystDef.name,
      maxHp: cystUnit.maxHp,
      hp: cystUnit.hp,
      isAlive: cystUnit.isAlive,
      // §2.1 verified：Cyst 恒 Aggressive。
      stance: 'aggressive',
      areaId: room.mammothCystPlacement.areaId,
      actionsPerRound: 2,
      defeatedAt: null,
    },
  ];

  // ---- 只加入 2 张 Cyst Initiative（硬约束 7）----
  const initiativeCards = createMammothCystInitiativeCardsFor(
    guardianDef.id,
    cystUnit.id,
    'mammoth-cyst',
  );
  const drawPile = shuffleWithRng(rng, initiativeCards.map((c) => c.id));

  const runtime: MammothCystBattleRuntime = {
    guardianDefinitionId: guardianDef.id,
    mammothCystActorId: cystUnit.id,
    activeWhiteCellStalkActorId: null,
    activeSummonRecordId: null,
    summonGeneration: 0,
    mammothCystInitiativeCardIds: [initiativeCards[0].id, initiativeCards[1].id],
    activeStalkInitiativeCardIds: [],
    // §9：Stalk 只登记 Reserve 的 Definition id。
    reserveWhiteCellStalkDefinitionId: stalkDef.id,
    lastConditionalOverrideEventId: null,
    lastSummonTransactionId: null,
    lastTeleportationTransactionId: null,
    victoryResolved: false,
    dataStatus: guardianDef.officialDataStatus,
  };

  const snapshot: MammothCystDefinitionSnapshot = {
    guardian: guardianDef,
    guardianHash: hashMammothCystGuardian(guardianDef),
    mammothCyst: cystDef,
    mammothCystHash: hashMammothCystActor(cystDef),
    whiteCellStalk: stalkDef,
    whiteCellStalkHash: hashMammothCystActor(stalkDef),
    room,
    roomHash: hashMammothCystRoom(room),
    capturedAt: now,
  };

  let state: MammothCystEncounterState = {
    mammothCystContentVersion: MAMMOTH_CYST_CONTENT_VERSION,
    guardianQuestId: quest.id,
    battleId,
    roomId,
    guardianDefinitionId: guardianDef.id,
    mammothCystBattleRuntime: runtime,
    actorStates,
    heroPlacements: placements,
    initiativeCards: [...initiativeCards],
    initiativeDrawPile: drawPile,
    resolvedInitiativeCardIds: [],
    round: 1,
    skillRolls: [],
    summonHistory: [],
    teleportationHistory: [],
    displacementHistory: [],
    pendingDisplacementChoice: null,
    areaEntryRuntime: createAreaEntryRuntimes(room),
    roomHazardEventHistory: [],
    snapshot,
    mammothCystDataAudit: buildMammothCystDataAudit(now),
    processedTransactionIds: [],
  };
  state = withProcessedMammothCystTransaction(state, transactionId);

  const battle = buildMammothCystBattle(campaign, roomId, [cystUnit], rng, battleId);

  let next: CampaignState = {
    ...campaign,
    gamePhase: 'battle',
    battle,
    actFourState: { ...actFour, mammothCystEncounterState: state },
    updatedAt: now,
  };
  next = pushLog(
    next,
    `Mammoth Cyst 就位（Aggressive Stance），向 Initiative Deck 加入 2 张卡；White Cell Stalk 置于 Reserve。`,
    'danger',
  );

  return { ok: true, campaign: next, state, alreadySetUp: false, reason: null };
}

// ---------------------------------------------------------------------------
// §11 抽 Initiative Card
// ---------------------------------------------------------------------------

export interface DrawMammothCystInitiativeResult {
  ok: boolean;
  state: MammothCystEncounterState;
  card: MammothCystInitiativeCard | null;
  /** 本轮 Mammoth Cyst 域卡已抽完（外部据此推进 Round）。 */
  exhausted: boolean;
  reason: string | null;
}

/**
 * 抽取下一张 Mammoth Cyst 域 Initiative Card。
 *
 * - 已失效（Actor 死亡 / 离场）的卡直接跳过并丢弃（§22）；
 * - 刷新不重洗剩余牌堆（drawPile 已落盘）。
 */
export function drawNextMammothCystInitiativeCard(
  state: MammothCystEncounterState,
): DrawMammothCystInitiativeResult {
  let pile = [...state.initiativeDrawPile];
  const skipped: string[] = [];

  while (pile.length > 0) {
    const cardId = pile[0];
    pile = pile.slice(1);
    const card = state.initiativeCards.find((c) => c.id === cardId);
    if (!card) continue;
    if (card.invalidated) {
      skipped.push(cardId);
      continue;
    }
    const actor = state.actorStates.find((a) => a.actorId === card.actorId);
    if (!actor || !actor.isAlive) {
      skipped.push(cardId);
      continue;
    }
    return {
      ok: true,
      state: {
        ...state,
        initiativeDrawPile: pile,
        resolvedInitiativeCardIds: [...state.resolvedInitiativeCardIds, cardId],
      },
      card,
      exhausted: pile.length === 0,
      reason: null,
    };
  }

  return {
    ok: true,
    state: { ...state, initiativeDrawPile: [] },
    card: null,
    exhausted: true,
    reason: skipped.length > 0 ? `已跳过 ${skipped.length} 张失效卡` : null,
  };
}

/**
 * 推进到下一轮：重新发放**存活 Actor**的 2 张卡。
 *
 * §22：Stalk 已死亡 → 其卡不再发放；
 *      下一次 Cyst 行动时若场上仍无 Stalk，会再次触发 Conditional Summon。
 * 幂等键：`mammoth-cyst-round:{battleId}:{round}`。
 */
export function advanceMammothCystRound(
  state: MammothCystEncounterState,
  rng: () => number,
): MammothCystEncounterState {
  const nextRound = state.round + 1;
  const transactionId = mammothCystTransactionIds.roundAdvance(state.battleId, nextRound);
  if (hasProcessedMammothCystTransaction(state, transactionId)) return state;

  const aliveActorIds = state.actorStates.filter((a) => a.isAlive).map((a) => a.actorId);
  const cards = state.initiativeCards.map((c) =>
    aliveActorIds.includes(c.actorId) ? { ...c, invalidated: false } : { ...c, invalidated: true },
  );
  const pile = shuffleWithRng(
    rng,
    cards.filter((c) => !c.invalidated).map((c) => c.id),
  );

  return withProcessedMammothCystTransaction(
    {
      ...state,
      round: nextRound,
      initiativeCards: cards,
      initiativeDrawPile: pile,
      resolvedInitiativeCardIds: [],
    },
    transactionId,
  );
}

// ---------------------------------------------------------------------------
// §16 d10 Skill Table
// ---------------------------------------------------------------------------

export interface RollMammothCystSkillResult {
  ok: boolean;
  state: MammothCystEncounterState;
  record: MammothCystSkillRollRecord | null;
  skill: MammothCystSkillDefinition | null;
  alreadyRolled: boolean;
  reason: string | null;
}

/** 取某 Actor 的 Skill Table（来自 Snapshot，Definition 变更不影响进行中的战斗）。 */
export function getMammothCystSkillTable(
  state: MammothCystEncounterState,
  actorId: string,
): MammothCystSkillDefinition[] {
  const actor = state.actorStates.find((a) => a.actorId === actorId);
  if (!actor) return [];
  return actor.owner === 'mammoth-cyst'
    ? state.snapshot.mammothCyst.skills
    : state.snapshot.whiteCellStalk.skills;
}

/** d10 → Skill（映射只来自 Definition 的 d10Rolls，不按数组下标）。 */
export function selectMammothCystSkillByRoll(
  skills: MammothCystSkillDefinition[],
  roll: D10Roll,
): MammothCystSkillDefinition | null {
  return skills.find((s) => s.d10Rolls.includes(roll)) ?? null;
}

/**
 * 为一张 Initiative Card 掷技能骰。
 *
 * 硬约束 14 / §16：结果先保存（写入 skillRolls + 幂等键）后展示，刷新不重掷。
 * 幂等键：`mammoth-cyst-skill-roll:{battleId}:{initiativeCardId}`。
 *
 * ⚠️ 注意：Cyst 行动是否被 Conditional Summon 覆盖由 `resolveMammothCystAction`
 * 单独判定，且**先于**本函数 —— 召唤完全替代普通 Skill（硬约束 5），
 * 被覆盖的行动不掷 Skill 骰。
 */
export function rollMammothCystSkill(
  state: MammothCystEncounterState,
  initiativeCardId: string,
  rng: () => number,
  options?: { now?: string },
): RollMammothCystSkillResult {
  const card = state.initiativeCards.find((c) => c.id === initiativeCardId);
  if (!card) {
    return rollFail(state, `找不到 Initiative Card ${initiativeCardId}`);
  }

  const transactionId = mammothCystTransactionIds.skillRoll(state.battleId, initiativeCardId);
  const existing = state.skillRolls.find((r) => r.transactionId === transactionId);
  if (existing) {
    return {
      ok: true,
      state,
      record: existing,
      skill:
        selectMammothCystSkillByRoll(getMammothCystSkillTable(state, existing.actorId), existing.roll) ??
        null,
      alreadyRolled: true,
      reason: null,
    };
  }

  const actor = state.actorStates.find((a) => a.actorId === card.actorId);
  if (!actor) return rollFail(state, `找不到 Actor ${card.actorId}`);
  if (!actor.isAlive) return rollFail(state, `${actor.name} 已被击败，不再行动`);

  const skills = getMammothCystSkillTable(state, card.actorId);
  const roll = rollD10(rng) as D10Roll;
  const skill = selectMammothCystSkillByRoll(skills, roll);
  if (!skill) {
    return rollFail(state, `${actor.name} 的 d10 Skill Table 未覆盖骰点 ${roll}`);
  }

  const record: MammothCystSkillRollRecord = {
    id: createId('mcsr'),
    battleId: state.battleId,
    initiativeCardId,
    actorId: card.actorId,
    owner: card.owner,
    roll,
    selectedSkillId: skill.id,
    transactionId,
    createdAt: options?.now ?? nowIso(),
  };

  return {
    ok: true,
    state: withProcessedMammothCystTransaction(
      { ...state, skillRolls: [...state.skillRolls, record].slice(-HISTORY_LIMIT) },
      transactionId,
    ),
    record,
    skill,
    alreadyRolled: false,
    reason: null,
  };
}

function rollFail(state: MammothCystEncounterState, reason: string): RollMammothCystSkillResult {
  return { ok: false, state, record: null, skill: null, alreadyRolled: false, reason };
}

// ---------------------------------------------------------------------------
// Selector（只读）
// ---------------------------------------------------------------------------

export function getMammothCystEncounterState(
  campaign: CampaignState,
): MammothCystEncounterState | null {
  return campaign.actFourState.mammothCystEncounterState ?? null;
}

export function getMammothCystActorState(
  state: MammothCystEncounterState,
  actorId: string,
): MammothCystActorState | null {
  return state.actorStates.find((a) => a.actorId === actorId) ?? null;
}

/** 场上 Mammoth Cyst 的状态（恒存在一条）。 */
export function getMammothCystBossState(
  state: MammothCystEncounterState,
): MammothCystActorState | null {
  return state.actorStates.find((a) => a.owner === 'mammoth-cyst') ?? null;
}

/** 当前**存活**的 White Cell Stalk 数量（§12 召唤条件的唯一依据）。 */
export function getAliveWhiteCellStalkCount(state: MammothCystEncounterState): number {
  return state.actorStates.filter((a) => a.owner === 'white-cell-stalk' && a.isAlive).length;
}

/** 当前存活的 Stalk 状态（maxAlive = 1，故至多一条）。 */
export function getActiveWhiteCellStalkState(
  state: MammothCystEncounterState,
): MammothCystActorState | null {
  return state.actorStates.find((a) => a.owner === 'white-cell-stalk' && a.isAlive) ?? null;
}

export function isMammothCystAlive(state: MammothCystEncounterState): boolean {
  return state.actorStates.some((a) => a.owner === 'mammoth-cyst' && a.isAlive);
}

/** 某 Hero 当前所在 Area。 */
export function getMammothCystHeroPlacement(
  state: MammothCystEncounterState,
  heroId: string,
): MammothCystHeroPlacement | null {
  return state.heroPlacements.find((p) => p.heroId === heroId) ?? null;
}

/** 某 Actor 剩余可用（未失效、未抽出）的 Initiative Card 数。 */
export function getRemainingMammothCystInitiativeCount(
  state: MammothCystEncounterState,
  actorId: string,
): number {
  return state.initiativeDrawPile.filter((id) => {
    const card = state.initiativeCards.find((c) => c.id === id);
    return Boolean(card && card.actorId === actorId && !card.invalidated);
  }).length;
}

/** 某 Area 当前占用数（Hero + Monster；供 Capacity 判定）。 */
export function getMammothCystAreaOccupancy(
  state: MammothCystEncounterState,
  areaId: string,
  excludeActorId?: string,
): string[] {
  const heroes = state.heroPlacements
    .filter((p) => p.areaId === areaId && p.heroId !== excludeActorId)
    .map((p) => p.heroId);
  const monsters = state.actorStates
    .filter((a) => a.isAlive && a.areaId === areaId && a.actorId !== excludeActorId)
    .map((a) => a.actorId);
  return [...heroes, ...monsters];
}

// ---------------------------------------------------------------------------

function setupFail(campaign: CampaignState, reason: string): SetupMammothCystEncounterResult {
  return { ok: false, campaign, state: null, alreadySetUp: false, reason };
}
