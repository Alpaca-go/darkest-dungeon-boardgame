// Phase 10D §9—§17 / §33：Shuffling Horror 运行时（Setup / Draw-Resolve / Round / Selector）。
//
// 硬约束 1：复用既有 BattleState（不创建第二套 Battle 状态机）；本模块只维护 Shuffling
// Horror 域的 *附加* 运行时：Monster Opportunity 卡组（不绑定 Actor）、Stance Priority
// Tracker、Monster/Hero Action Budget、Hero Stance 排列。
//
// 关键算法（§12 verified）：Monster Initiative Opportunity 卡**抽卡时**按
// [Stance Priority 最靠前 + 剩余行动 > 0 + 存活] 动态解析出真正行动的 Monster。

import type { BattleState, BattleUnit, CampaignState } from '../../../types';
import type {
  HeroRoundActionBudget,
  MonsterInitiativeOpportunityCard,
  MonsterRoundActionBudget,
  MonsterStance,
  ShufflingHorrorActorState,
  ShufflingHorrorEncounterState,
  ShufflingHorrorRole,
  ShufflingHorrorSnapshot,
  StancePriorityTracker,
} from '../../../types/shuffling-horror';
import { getDarkestDungeonGuardianById } from '../../../data/darkest-dungeon/guardian-registry';
import {
  PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_ID,
  PROTOTYPE_SHUFFLING_HORROR_ROOM_ID,
} from '../../../data/darkest-dungeon/shuffling-horror/ids';
import {
  getShufflingHorrorActorSpec,
  hashShufflingHorrorActors,
  hashShufflingHorrorGuardian,
  hashShufflingHorrorInitiativePolicy,
  hashShufflingHorrorRoom,
  hashShufflingHorrorUndulations,
  isShufflingHorrorOfficialEncounterEnabled,
  SHUFFLING_HORROR_PROTOTYPE_ACTORS,
} from '../../../data/darkest-dungeon/shuffling-horror/registry';
import { SHUFFLING_HORROR_STANCE_PRIORITY } from '../../../data/darkest-dungeon/shuffling-horror/ids';
import { PROTOTYPE_SHUFFLING_HORROR_AREA_MAP } from '../../../data/darkest-dungeon/shuffling-horror/ids';
import {
  COMMUNITY_SHUFFLING_ACTORS,
  COMMUNITY_SHUFFLING_ROOM,
  validateCommunityShufflingDefinitions,
  type CommunityShufflingActorSpec,
} from '../../../data/darkest-dungeon/community-reference/production-adapters';
import { COMMUNITY_ROOM10_STANCE_AREAS } from '../../../data/darkest-dungeon/community-reference/community-source-geometry';
import { makeHeroUnit } from '../../battle';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import { createSeededRng, shuffleWithRng } from '../../campaign/act-four/rng';

if (!COMMUNITY_SHUFFLING_ROOM.areaIds.includes(COMMUNITY_ROOM10_STANCE_AREAS.monster.aggressive)) {
  throw new Error('Accepted Horror area r10-S is missing from Community Room 10');
}

// ---------------------------------------------------------------------------
// 常量 / 幂等键
// ---------------------------------------------------------------------------

export const SHUFFLING_HORROR_BATTLE_POSITION = 1;

export const shufflingHorrorTransactionIds = {
  roomSetup: (guardianQuestId: string, roomId: string) =>
    `shuffling-horror-room-setup:${guardianQuestId}:${roomId}`,
  initiativeDraw: (battleId: string, cardId: string) =>
    `shuffling-horror-initiative-draw:${battleId}:${cardId}`,
  action: (battleId: string, cardId: string) =>
    `shuffling-horror-action:${battleId}:${cardId}`,
  summon: (battleId: string, sourceCardId: string) =>
    `shuffling-horror-summon:${battleId}:${sourceCardId}`,
  actorDefeat: (battleId: string, actorId: string) =>
    `shuffling-horror-actor-defeat:${battleId}:${actorId}`,
  encounterVictory: (battleId: string) => `shuffling-horror-encounter-victory:${battleId}`,
  roundAdvance: (battleId: string, round: number) => `shuffling-horror-round:${battleId}:${round}`,
} as const;

const TRANSACTION_LIMIT = 200;
const HISTORY_LIMIT = 200;

export function hasProcessedShufflingHorrorTransaction(
  state: ShufflingHorrorEncounterState,
  transactionId: string,
): boolean {
  return state.processedTransactionIds.includes(transactionId);
}

export function withProcessedShufflingHorrorTransaction(
  state: ShufflingHorrorEncounterState,
  transactionId: string,
): ShufflingHorrorEncounterState {
  if (state.processedTransactionIds.includes(transactionId)) return state;
  return {
    ...state,
    processedTransactionIds: [...state.processedTransactionIds, transactionId].slice(
      -TRANSACTION_LIMIT,
    ),
  };
}

// ---------------------------------------------------------------------------
// §9 / §10 Actor 单位构建（Boss 进入 BattleState；Priest/Growth 在 Runtime 跟踪）
// ---------------------------------------------------------------------------

export interface SetupShufflingHorrorEncounterOptions {
  mode?: 'formal' | 'prototype' | 'community-reference';
  rng?: () => number;
  seed?: number;
  now?: string;
}

export interface SetupShufflingHorrorEncounterResult {
  ok: boolean;
  campaign: CampaignState;
  state: ShufflingHorrorEncounterState | null;
  alreadySetUp: boolean;
  reason: string | null;
}

/** 由角色规格构建运行时 Actor 状态。 */
export function buildShufflingHorrorActorState(
  role: ShufflingHorrorRole,
  generation: number,
  mode: 'formal' | 'prototype' | 'community-reference' = 'prototype',
): ShufflingHorrorActorState {
  const spec = (mode === 'community-reference'
    ? COMMUNITY_SHUFFLING_ACTORS.find((actor) => actor.role === role)
    : getShufflingHorrorActorSpec(role)) as CommunityShufflingActorSpec;
  if (!spec) throw new Error(`未定义的 Community Shuffling Horror 角色：${role}`);
  const inReserve = spec.startsInReserve;
  return {
    actorId: `u_${spec.actorDefinitionId}`,
    role,
    owner: 'shuffling-horror',
    alive: true,
    generation,
    stances: inReserve ? [] : [spec.requiredStance as MonsterStance],
    areaId: inReserve ? null : mode === 'community-reference'
      ? COMMUNITY_ROOM10_STANCE_AREAS.monster[spec.requiredStance as MonsterStance]
      : PROTOTYPE_SHUFFLING_HORROR_AREA_MAP[spec.requiredStance as MonsterStance],
    inReserve,
    actionBudgetUsedThisRound: 0,
    actionBudgetMaxThisRound: spec.actionsPerRound,
  };
}

/** 构建 Horror / 召唤物的战斗单位（进入 BattleState.monsters）。 */
export function buildShufflingHorrorBattleUnit(
  mode: 'formal' | 'prototype' | 'community-reference' = 'prototype',
  role: ShufflingHorrorRole = 'horror',
): BattleUnit {
  const spec = (mode === 'community-reference'
    ? COMMUNITY_SHUFFLING_ACTORS.find((actor) => actor.role === role)
    : getShufflingHorrorActorSpec(role)) as CommunityShufflingActorSpec;
  if (!spec) throw new Error(`未定义 Community Shuffling Horror 角色：${role}`);
  const id = `u_${spec.actorDefinitionId}`;
  const position = role === 'horror' ? SHUFFLING_HORROR_BATTLE_POSITION : role === 'cultist-priest' ? 2 : 3;
  return {
    id,
    name: spec.name,
    side: 'monster',
    sourceId: spec.actorDefinitionId,
    maxHp: spec.maxHp,
    hp: spec.maxHp,
    stress: 0,
    position,
    speed: 'speed' in spec ? spec.speed : 4,
    stance: role === 'horror' ? 'aggressive' : role === 'cultist-priest' ? 'defensive' : 'ranged',
    isAlive: spec.maxHp > 0,
    atDeathsDoor: false,
    deathblowRollCount: 0,
    stunned: 0,
    bleed: 0,
    blight: 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 0,
    monsterSkillIds: 'skillIds' in spec ? [...spec.skillIds] : [],
    categoricalResistances: 'resistances' in spec
      ? spec.resistances.resistantTo.filter((item): item is 'bleed' | 'blight' | 'stun' | 'mark' => ['bleed', 'blight', 'stun', 'mark'].includes(item))
      : undefined,
    immunities: 'resistances' in spec ? [...spec.resistances.immuneTo] : undefined,
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    mentalEffectResolvedTurnId: null,
  };
}

export function appendShufflingSummonBattleUnits(
  battle: BattleState,
  state: ShufflingHorrorEncounterState,
  roles: ShufflingHorrorRole[],
): BattleState {
  let monsters = [...battle.monsters];
  for (const role of roles) {
    const actor = state.actors.find((item) => item.role === role);
    if (!actor) continue;
    const unit = { ...buildShufflingHorrorBattleUnit(state.mode, role), id: actor.actorId, isAlive: actor.alive, hp: actor.alive ? (buildShufflingHorrorBattleUnit(state.mode, role).maxHp) : 0 };
    monsters = monsters.some((monster) => monster.id === unit.id)
      ? monsters.map((monster) => monster.id === unit.id ? unit : monster)
      : [...monsters, unit];
  }
  return { ...battle, monsters };
}

// ---------------------------------------------------------------------------
// Snapshot
// ---------------------------------------------------------------------------

export function buildShufflingHorrorSnapshot(
  mode: 'formal' | 'prototype' | 'community-reference' = 'prototype',
): ShufflingHorrorSnapshot {
  if (mode === 'community-reference') {
    const stable = (value: unknown) => JSON.stringify(value);
    return { guardianHash: stable('community-shuffling-horror'), roomHash: stable(COMMUNITY_SHUFFLING_ROOM), actorsHash: stable(COMMUNITY_SHUFFLING_ACTORS), initiativePolicyHash: hashShufflingHorrorInitiativePolicy(), undulationsHash: hashShufflingHorrorUndulations() };
  }
  return {
    guardianHash: hashShufflingHorrorGuardian(mode),
    roomHash: hashShufflingHorrorRoom(),
    actorsHash: hashShufflingHorrorActors(),
    initiativePolicyHash: hashShufflingHorrorInitiativePolicy(),
    undulationsHash: hashShufflingHorrorUndulations(),
  };
}

// ---------------------------------------------------------------------------
// §9 Setup
// ---------------------------------------------------------------------------

/**
 * 进入 Shuffling Horror Objective Room 的完整 Setup（§9）：
 * Reveal → 载入 Room → 创建 **Horror 一名** Actor（Aggressive Stance + Area）→
 * 创建 **2 张** Monster Initiative Opportunity（不绑定 Actor）→
 * Priest / Growth **只登记 Reserve**（不占 Stance、不加入 Tracker、不加卡）→
 * 初始化 Stance Priority Tracker / Monster+Hero Action Budget / Hero Stance 排列 → 保存。
 *
 * 幂等键：`shuffling-horror-room-setup:{guardianQuestId}:{roomId}`。
 */
export function setupShufflingHorrorEncounter(
  campaign: CampaignState,
  options?: SetupShufflingHorrorEncounterOptions,
): SetupShufflingHorrorEncounterResult {
  const actFour = campaign.actFourState;
  const quest = actFour.guardianQuestState;
  const mode: 'formal' | 'prototype' | 'community-reference' = options?.mode ?? 'prototype';

  if (!quest) return setupFail(campaign, 'Guardian Quest 尚未创建');
  if (!quest.guardianBattleId) return setupFail(campaign, 'Guardian Battle 尚未开始');

  if (actFour.shufflingHorrorEncounterState) {
    return {
      ok: true,
      campaign,
      state: actFour.shufflingHorrorEncounterState,
      alreadySetUp: true,
      reason: null,
    };
  }

  // ---- Data Gate（硬约束 28）----
  if (mode === 'formal' && !isShufflingHorrorOfficialEncounterEnabled()) {
    return setupFail(
      campaign,
      'official Shuffling Horror 数据缺失（Battle Card / Room / Echoing / Undulations / Victory），正式 Shuffling Horror 战斗已禁用',
    );
  }
  if (mode === 'community-reference') {
    const validation = validateCommunityShufflingDefinitions();
    if (!validation.isComplete) {
      return setupFail(campaign, `Community Shuffling Horror 数据无效：${[...validation.missing, ...validation.issues].join('；')}`);
    }
  }

  const guardian = getDarkestDungeonGuardianById(quest.guardianDefinitionId);
  if (guardian?.family !== 'shuffling-horror') {
    return setupFail(campaign, '当前 Guardian 不是 Shuffling Horror 家族');
  }

  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10d5f);
  const battleId = quest.guardianBattleId;
  const roomId = mode === 'community-reference' ? COMMUNITY_SHUFFLING_ROOM.id : PROTOTYPE_SHUFFLING_HORROR_ROOM_ID;
  const transactionId = shufflingHorrorTransactionIds.roomSetup(quest.id, roomId);

  // ---- 创建 Horror（Aggressive），Priest/Growth 在 Reserve ----
  const horror = buildShufflingHorrorActorState('horror', 1, mode);
  const priest = buildShufflingHorrorActorState('cultist-priest', 1, mode);
  const growth = buildShufflingHorrorActorState('malignant-growth', 1, mode);
  const actors = [horror, priest, growth];

  // ---- Stance Priority Tracker：初始仅 Aggressive 被 Horror 占据 ----
  const stanceOccupant: Record<MonsterStance, string | null> = {
    aggressive: horror.actorId,
    defensive: null,
    ranged: null,
    support: null,
  };
  const stancePriority: StancePriorityTracker = {
    stancePriority: [...SHUFFLING_HORROR_STANCE_PRIORITY],
    stanceOccupant,
    capacityPerStance: 1,
    isFull: false,
  };

  // ---- §2 verified：初始 2 张 Monster Initiative Opportunity ----
  const round0 = 1;
  const initiativeDrawPile: MonsterInitiativeOpportunityCard[] = [
    makeOpportunityCard(battleId, 0, round0),
    makeOpportunityCard(battleId, 1, round0),
  ];

  // ---- Monster Round Action Budget（硬约束 4/5）----
  const monsterBudget: MonsterRoundActionBudget = {
    round: round0,
    perRoleMax: { horror: 2, 'cultist-priest': 1, 'malignant-growth': 1 },
    perRoleUsed: { horror: 0, 'cultist-priest': 0, 'malignant-growth': 0 },
  };

  // ---- Hero Stance 排列 + Hero Round Action Budget（硬约束 22/23）----
  const aliveHeroes = campaign.heroes.filter((h) => !h.dead);
  const heroStanceAssignments = aliveHeroes.map((h, i) => {
    const stance = SHUFFLING_HORROR_STANCE_PRIORITY[i % SHUFFLING_HORROR_STANCE_PRIORITY.length];
    return {
      heroId: h.instanceId,
      stance,
      areaId: mode === 'community-reference'
        ? COMMUNITY_ROOM10_STANCE_AREAS.hero[stance]
        : PROTOTYPE_SHUFFLING_HORROR_AREA_MAP[stance],
      hasActedThisRound: false,
    };
  });
  const heroBudget: HeroRoundActionBudget = {
    round: round0,
    perHeroMax: Object.fromEntries(aliveHeroes.map((h) => [h.instanceId, 1])),
    perHeroUsed: Object.fromEntries(aliveHeroes.map((h) => [h.instanceId, 0])),
  };

  const state: ShufflingHorrorEncounterState = {
    family: 'shuffling-horror',
    guardianBattleId: battleId,
    mode,
    round: round0,
    actors,
    initiativeDrawPile,
    initiativeDiscardPile: [],
    stancePriority,
    monsterBudget,
    heroBudget,
    heroStanceAssignments,
    summonedRolesThisEncounter: [],
    generationByRole: { horror: 1, 'cultist-priest': 1, 'malignant-growth': 1 },
    lastActionLog: ['Shuffling Horror 在 Aggressive 上显现；Cultist Priest 与 Malignant Growth 蛰伏于 Reserve。'],
    transactionId,
    snapshot: buildShufflingHorrorSnapshot(mode),
    processedTransactionIds: [],
  };
  void HISTORY_LIMIT;

  // ---- 把 Horror 真正进入 BattleState（复用既有 Battle 引擎，硬约束 1）----
  const horrorUnit = buildShufflingHorrorBattleUnit(mode);
  const heroUnits = aliveHeroes.map((h, i) => makeHeroUnit(h, i, campaign));
  const battle: BattleState | null = campaign.battle
    ? {
        ...campaign.battle,
        monsters: [...campaign.battle.monsters, horrorUnit],
        heroes: heroUnits,
        // 用既有 shuffle 初始化 initiativeOrder（不重掷：rng 已保存）
        initiativeOrder: shuffleWithRng(
          rng,
          [...heroUnits, horrorUnit].filter((u) => u.isAlive).map((u) => u.id),
        ),
      }
    : mode === 'community-reference' ? {
        battleId, status: 'active', round: 1, maxRounds: 8, roundLimitPolicy: 'not-counted',
        heroes: heroUnits, monsters: [horrorUnit],
        initiativeOrder: shuffleWithRng(rng, [...heroUnits, horrorUnit].filter(unit => unit.isAlive).map(unit => unit.id)),
        initiativeIndex: -1, activeActorId: null, currentActionPoints: 0,
        selectedSkillId: null, selectedTargetId: null, battleLog: [],
        sourceRoomId: roomId, rewards: { gold: 0 }, light: campaign.light,
      } : campaign.battle;

  const nextCampaign: CampaignState = {
    ...campaign,
    battle,
    ...(mode === 'community-reference' ? { gamePhase: 'battle' as const } : {}),
    actFourState: { ...actFour, shufflingHorrorEncounterState: state },
    updatedAt: now,
  };

  return {
    ok: true,
    campaign: pushLog(
      nextCampaign,
      'Shuffling Horror 部署在 Aggressive Stance；Cultist Priest 与 Malignant Growth 初始在 Reserve。',
      'danger',
    ),
    state,
    alreadySetUp: false,
    reason: null,
  };
}

function setupFail(campaign: CampaignState, reason: string): SetupShufflingHorrorEncounterResult {
  return { ok: false, campaign, state: null, alreadySetUp: false, reason };
}

function makeOpportunityCard(
  battleId: string,
  index: number,
  round: number,
): MonsterInitiativeOpportunityCard {
  return {
    id: `shinit-${battleId}-${index}`,
    cardType: 'monster-initiative-opportunity',
    owner: 'shuffling-horror',
    roundCreated: round,
    stanceAtDraw: null,
    resolvedActorRole: null,
    resolvedActorId: null,
    isExcess: false,
    excessReason: null,
    invalidated: false,
  };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

export function getShufflingHorrorEncounterState(
  campaign: CampaignState,
): ShufflingHorrorEncounterState | null {
  return campaign.actFourState.shufflingHorrorEncounterState;
}

export function isShufflingHorrorEncounter(campaign: CampaignState): boolean {
  return campaign.actFourState.shufflingHorrorEncounterState != null;
}

export function getShufflingHorrorActorByRole(
  state: ShufflingHorrorEncounterState,
  role: ShufflingHorrorRole,
): ShufflingHorrorActorState | undefined {
  return state.actors.find((a) => a.role === role);
}

export function getAliveActorByRole(
  state: ShufflingHorrorEncounterState,
  role: ShufflingHorrorRole,
): ShufflingHorrorActorState | undefined {
  return state.actors.find((a) => a.role === role && a.alive);
}

/** 当前在 Tracker（非 Reserve）且存活的角色 id。 */
export function getTrackedAliveActorIds(state: ShufflingHorrorEncounterState): string[] {
  return state.actors
    .filter((a) => a.alive && !a.inReserve)
    .map((a) => a.actorId);
}

/**
 * 缺失（应当被 Echoing 召唤）且当前不在 Tracker 存活的角色（硬约束 9/10）。
 * 顺序固定 Priest → Growth（§9 verified）。
 */
export function getMissingSummonRoles(state: ShufflingHorrorEncounterState): ShufflingHorrorRole[] {
  return (['cultist-priest', 'malignant-growth'] as ShufflingHorrorRole[]).filter(
    (role) => !getAliveActorByRole(state, role) || getAliveActorByRole(state, role)!.inReserve,
  );
}

// ---------------------------------------------------------------------------
// §12 抽卡解析（resolveAtDrawTime）：按 Stance Priority + 剩余行动动态解析 Actor
// ---------------------------------------------------------------------------

export interface ResolvedOpportunity {
  card: MonsterInitiativeOpportunityCard;
  /** 抽卡时解析出的 Actor（Excess 时为 null）。 */
  actor: ShufflingHorrorActorState | null;
}

/**
 * §12 / 硬约束 3/6/7：在「当前」 Tracker 与 Budget 状态下解析下一张未失效的卡。
 * - 依次遍历 stancePriority，找到第一个「占据者存活 + 在 Tracker + 剩余行动 > 0」的 Actor；
 * - 找到 → 记录 resolvedActorRole/Id + stanceAtDraw；
 * - 找不到（所有 Stance 的占据者都已无剩余行动或不在场）→ 标记 Excess（抽卡即移除）。
 * Stance 变化会影响**下一张**未解析卡（因为每次都读“当前”状态，硬约束 6）。
 */
export function resolveNextMonsterInitiativeCard(
  state: ShufflingHorrorEncounterState,
): { state: ShufflingHorrorEncounterState; result: ResolvedOpportunity | null } {
  const card = state.initiativeDrawPile.find((c) => !c.invalidated);
  if (!card) return { state, result: null };

  const eligible = findEligibleActorForStance(state);
  let nextDrawPile = state.initiativeDrawPile;
  let nextDiscard = state.initiativeDiscardPile;

  if (!eligible) {
    const resolved: MonsterInitiativeOpportunityCard = {
      ...card,
      isExcess: true,
      excessReason: 'no-eligible-monster-at-draw',
      invalidated: true,
    };
    nextDrawPile = state.initiativeDrawPile.map((c) => (c.id === card.id ? resolved : c));
    nextDiscard = [...state.initiativeDiscardPile, resolved];
    const nextState: ShufflingHorrorEncounterState = {
      ...state,
      initiativeDrawPile: nextDrawPile,
      initiativeDiscardPile: nextDiscard,
    };
    return {
      state: nextState,
      result: { card: resolved, actor: null },
    };
  }

  const resolved: MonsterInitiativeOpportunityCard = {
    ...card,
    stanceAtDraw: eligible.stance,
    resolvedActorRole: eligible.actor.role,
    resolvedActorId: eligible.actor.actorId,
    isExcess: false,
    excessReason: null,
    invalidated: true,
  };
  nextDrawPile = state.initiativeDrawPile.map((c) => (c.id === card.id ? resolved : c));
  nextDiscard = [...state.initiativeDiscardPile, resolved];
  const nextState: ShufflingHorrorEncounterState = {
    ...state,
    initiativeDrawPile: nextDrawPile,
    initiativeDiscardPile: nextDiscard,
  };
  return { state: nextState, result: { card: resolved, actor: eligible.actor } };
}

interface EligibleHit {
  actor: ShufflingHorrorActorState;
  stance: MonsterStance;
}

/** 遍历 stancePriority，返回第一个 Eligible Actor（硬约束 3）。 */
function findEligibleActorForStance(
  state: ShufflingHorrorEncounterState,
): EligibleHit | null {
  for (const stance of state.stancePriority.stancePriority) {
    const occupantId = state.stancePriority.stanceOccupant[stance];
    if (!occupantId) continue;
    const actor = state.actors.find((a) => a.actorId === occupantId);
    if (!actor) continue;
    if (!actor.alive || actor.inReserve) continue;
    const used = state.monsterBudget.perRoleUsed[actor.role] ?? 0;
    const max = state.monsterBudget.perRoleMax[actor.role] ?? 0;
    if (used >= max) continue;
    return { actor, stance };
  }
  return null;
}

/**
 * 解析**指定**一张 Monster Initiative Opportunity（resolveAtDrawTime，硬约束 3）：
 * 用「当前」 Tracker + Budget 动态决定 Actor；无 Eligible → Excess（抽卡即移除）。
 */
export function resolveMonsterInitiativeCardById(
  state: ShufflingHorrorEncounterState,
  cardId: string,
): { state: ShufflingHorrorEncounterState; result: ResolvedOpportunity | null } {
  const card = state.initiativeDrawPile.find((c) => c.id === cardId && !c.invalidated);
  if (!card) {
    // 卡已被消费或不存在
    const already = state.initiativeDiscardPile.find((c) => c.id === cardId);
    if (already) return { state, result: { card: already, actor: already.resolvedActorId ? state.actors.find((a) => a.actorId === already.resolvedActorId) ?? null : null } };
    return { state, result: null };
  }
  const eligible = findEligibleActorForStance(state);
  if (!eligible) {
    const resolved: MonsterInitiativeOpportunityCard = {
      ...card,
      isExcess: true,
      excessReason: 'no-eligible-monster-at-draw',
      invalidated: true,
    };
    const nextState: ShufflingHorrorEncounterState = {
      ...state,
      initiativeDrawPile: state.initiativeDrawPile.map((c) => (c.id === cardId ? resolved : c)),
      initiativeDiscardPile: [...state.initiativeDiscardPile, resolved],
    };
    return { state: nextState, result: { card: resolved, actor: null } };
  }
  const resolved: MonsterInitiativeOpportunityCard = {
    ...card,
    stanceAtDraw: eligible.stance,
    resolvedActorRole: eligible.actor.role,
    resolvedActorId: eligible.actor.actorId,
    isExcess: false,
    excessReason: null,
    invalidated: true,
  };
  const nextState: ShufflingHorrorEncounterState = {
    ...state,
    initiativeDrawPile: state.initiativeDrawPile.map((c) => (c.id === cardId ? resolved : c)),
    initiativeDiscardPile: [...state.initiativeDiscardPile, resolved],
  };
  return { state: nextState, result: { card: resolved, actor: eligible.actor } };
}

// ---------------------------------------------------------------------------
// §33 轮次推进
// ---------------------------------------------------------------------------

/**
 * 推进一轮：round++、重置 Monster/Hero 行动预算、Hero 已行动标记清零。
 * Hero Stance 排列保留（仅 Undulations 改变，硬约束 20）。
 */
export function advanceShufflingHorrorRound(
  state: ShufflingHorrorEncounterState,
): ShufflingHorrorEncounterState {
  const nextRound = state.round + 1;
  return {
    ...state,
    round: nextRound,
    monsterBudget: {
      ...state.monsterBudget,
      round: nextRound,
      perRoleUsed: { horror: 0, 'cultist-priest': 0, 'malignant-growth': 0 },
    },
    heroBudget: {
      ...state.heroBudget,
      round: nextRound,
      perHeroUsed: Object.fromEntries(
        Object.keys(state.heroBudget.perHeroUsed).map((h) => [h, 0]),
      ),
    },
    heroStanceAssignments: state.heroStanceAssignments.map((a) => ({
      ...a,
      hasActedThisRound: false,
    })),
  };
}

// ---------------------------------------------------------------------------
// 调试 / 测试辅助
// ---------------------------------------------------------------------------

/** 当前轮次某角色剩余行动次数。 */
export function getRemainingMonsterActions(
  state: ShufflingHorrorEncounterState,
  role: ShufflingHorrorRole,
): number {
  const used = state.monsterBudget.perRoleUsed[role] ?? 0;
  const max = state.monsterBudget.perRoleMax[role] ?? 0;
  return Math.max(0, max - used);
}

/** Tracker 是否「满」（无缺失的可召唤角色）。 */
export function isMonsterStanceTrackerFull(state: ShufflingHorrorEncounterState): boolean {
  return getMissingSummonRoles(state).length === 0;
}

export { SHUFFLING_HORROR_PROTOTYPE_ACTORS, PROTOTYPE_SHUFFLING_HORROR_GUARDIAN_ID };
