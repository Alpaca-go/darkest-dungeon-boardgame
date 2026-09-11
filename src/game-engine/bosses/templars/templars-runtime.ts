// Phase 10B §10 / §11 / §12 / §13 / §20：Templars Encounter Runtime。
//
// 硬约束对照：
// - §0 / 硬约束 1：**不创建第二套 Battle / Initiative / Dungeon 状态机** ——
//   本模块复用既有 BattleState（monsters 中放两名独立 Boss 单位）与既有伤害 / 压力管线；
//   2+2 的 Actor-specific Initiative 以「Templars 域卡组」形式建模（与 Phase 9E Fanatic
//   的 3+1 同构），BattleState.initiativeOrder 仍保持每单位一次，避免污染通用引擎；
// - 硬约束 2 / §10：两名 Templar 是**两个独立 Boss Actor**，
//   绝不建立第三个「Templars Group Actor」；
// - 硬约束 3 / §12：Initiative Card 绑定具体 Actor，不是「Templars 阵营卡」；
// - 硬约束 4 / §13：每名 Templar 有**独立 d10 Skill Table**，各自掷骰；
// - 硬约束 14 / §13：掷骰结果**先保存后展示**，刷新不重掷；
// - 硬约束 12 / §20：单名 Templar 死亡**只失效自己的 Initiative Card**，
//   另一名继续行动，战斗不结束；
// - RNG 一律注入（禁止 Math.random）。

import type { BattleState, BattleUnit, CampaignState } from '../../../types';
import type { ActFourRuntimeProfileId } from '../../../types/act-four';
import type {
  D10Roll,
  TemplarActorDefinition,
  TemplarActorState,
  TemplarInitiativeCard,
  TemplarSkillDefinition,
  TemplarSkillRollRecord,
  TemplarsBattleRuntime,
  TemplarsDefinitionSnapshot,
  TemplarsEncounterState,
  TemplarsHeroPlacement,
  TemplarsRoomDefinition,
} from '../../../types/templars';
import type { TemplarRole } from '../../../types/dual-boss';
import {
  COMMUNITY_TEMPLAR_IMPALER,
  COMMUNITY_TEMPLAR_WARLORD,
  COMMUNITY_TEMPLARS_ENCOUNTER,
  COMMUNITY_TEMPLARS_ROOM,
  COMMUNITY_TEMPLARS_VICTORY,
  validateCommunityTemplarsDefinitions,
} from '../../../data/darkest-dungeon/community-reference/production-adapters';
import {
  buildTemplarsDataAudit,
  getTemplarImpalerDefinition,
  getTemplarWarlordDefinition,
  getTemplarsGuardianDefinition,
  getTemplarsRoomDefinition,
  getTemplarsVictoryRule,
  hashTemplarActor,
  hashTemplarsEncounter,
  hashTemplarsRoom,
  isTemplarsOfficialEncounterEnabled,
  validateTemplarsGuardian,
} from '../../../data/darkest-dungeon/templars';
import { TEMPLARS_CONTENT_VERSION } from '../../../data/darkest-dungeon/templars/ids';
import { createSpikedPitRuntimes } from '../../room-hazards';
import { MAX_ROUNDS, makeHeroUnit } from '../../battle';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import { createSeededRng, rollD10, shuffleWithRng } from '../../campaign/act-four/rng';
import { buildDualBossEncounterState } from './dual-boss-encounter';

// ---------------------------------------------------------------------------
// 常量 / 幂等键
// ---------------------------------------------------------------------------

/** 两名 Boss 的战场站位（各自独立单位，不共享位置）。 */
export const TEMPLAR_IMPALER_BATTLE_POSITION = 1;
export const TEMPLAR_WARLORD_BATTLE_POSITION = 2;

/** Templars 域幂等键（§26）。 */
export const templarsTransactionIds = {
  roomSetup: (guardianQuestId: string, roomId: string) =>
    `templars-room-setup:${guardianQuestId}:${roomId}`,
  initiativeDraw: (battleId: string, cardId: string) =>
    `templar-initiative-draw:${battleId}:${cardId}`,
  skillRoll: (battleId: string, initiativeCardId: string) =>
    `templar-skill-roll:${battleId}:${initiativeCardId}`,
  bodySlamHit: (battleId: string, skillEventId: string) =>
    `templar-body-slam-hit:${battleId}:${skillEventId}`,
  pitToss: (battleId: string, hitEventId: string) => `templar-pit-toss:${battleId}:${hitEventId}`,
  pitEffect: (pitTossTransactionId: string, hazardId: string, trigger: string) =>
    `templar-pit-effect:${pitTossTransactionId}:${hazardId}:${trigger}`,
  bossDefeat: (battleId: string, actorId: string) => `templar-boss-defeat:${battleId}:${actorId}`,
  encounterVictory: (battleId: string) => `templars-encounter-victory:${battleId}`,
  roundAdvance: (battleId: string, round: number) => `templars-round:${battleId}:${round}`,
} as const;

const TRANSACTION_LIMIT = 200;

export function hasProcessedTemplarsTransaction(
  state: TemplarsEncounterState,
  transactionId: string,
): boolean {
  return state.processedTransactionIds.includes(transactionId);
}

export function withProcessedTemplarsTransaction(
  state: TemplarsEncounterState,
  transactionId: string,
): TemplarsEncounterState {
  if (state.processedTransactionIds.includes(transactionId)) return state;
  return {
    ...state,
    processedTransactionIds: [...state.processedTransactionIds, transactionId].slice(
      -TRANSACTION_LIMIT,
    ),
  };
}

// ---------------------------------------------------------------------------
// §10 Boss 单位构建（两个**独立** BattleUnit）
// ---------------------------------------------------------------------------

/**
 * 由 TemplarActorDefinition 构建战斗单位。
 * 只搬运 Definition 上已有的字段，绝不发明数值（缺失时 maxHp = 0 → Data Gate 早已拦截）。
 */
export function buildTemplarUnit(def: TemplarActorDefinition, position: number): BattleUnit {
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
    // §10：Stance 由 Definition 固定（Impaler = Aggressive、Warlord = Ranged）。
    stance: def.requiredStance,
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
    // 怪物不参与精神系统。
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    mentalEffectResolvedTurnId: null,
  };
}

// ---------------------------------------------------------------------------
// §12 Actor-specific Initiative（2 + 2）
// ---------------------------------------------------------------------------

/**
 * 创建一名 Templar 的两张 Initiative Card。
 * 每张卡只提供**绑定 Actor**一次行动 —— 不是「Templars 阵营卡」（硬约束 3）。
 */
export function createTemplarInitiativeCardsFor(
  encounterId: string,
  actorId: string,
  role: TemplarRole,
): [TemplarInitiativeCard, TemplarInitiativeCard] {
  const make = (index: 0 | 1): TemplarInitiativeCard => ({
    id: `tinit-${actorId}-${index}`,
    sourceType: 'boss',
    actorId,
    encounterId,
    role,
    index,
    invalidated: false,
    transactionId: `templar-initiative-create:${encounterId}:${actorId}:${index}`,
  });
  return [make(0), make(1)];
}

/** 创建整套 2 + 2 共四张 Initiative Card（§12）。 */
export function createTemplarInitiativeSet(
  encounterId: string,
  impalerActorId: string,
  warlordActorId: string,
): TemplarInitiativeCard[] {
  return [
    ...createTemplarInitiativeCardsFor(encounterId, impalerActorId, 'impaler'),
    ...createTemplarInitiativeCardsFor(encounterId, warlordActorId, 'warlord'),
  ];
}

// ---------------------------------------------------------------------------
// Hero 站位推导
// ---------------------------------------------------------------------------

/**
 * 由 Room Definition 推导 Hero 可用 Area。
 *
 * 注意：正式 Room Card 的 Hero 摆放规则尚未录入（heroPlacementRules =
 * `room-card-defined`），此处只做「排除 Boss 固定 Area 与 Pit Area 后按声明顺序取」，
 * 属于 prototype harness 行为，official 已被 Data Gate 禁用。
 * 正式资料到位后必须改为由 heroPlacementRules 驱动。
 */
export function resolveHeroPlacementAreas(room: TemplarsRoomDefinition): string[] {
  const excluded = new Set<string>([
    room.impalerPlacement.areaId,
    room.warlordPlacement.areaId,
    ...room.spikedPits.map((p) => p.areaId),
  ]);
  return room.validAreaIds.filter((a) => !excluded.has(a));
}

function buildHeroPlacements(
  campaign: CampaignState,
  room: TemplarsRoomDefinition,
): { placements: TemplarsHeroPlacement[]; reason: string | null } {
  const areas = resolveHeroPlacementAreas(room);
  const heroes = campaign.heroes.filter((h) => !h.dead);
  if (areas.length < heroes.length) {
    return {
      placements: [],
      reason: `Room ${room.id} 的可用 Hero Area 不足（${areas.length} < ${heroes.length}）`,
    };
  }
  return {
    placements: heroes.map((h, i) => ({ heroId: h.instanceId, areaId: areas[i], pitId: null })),
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// §11 BattleState 构建
// ---------------------------------------------------------------------------

/**
 * 建立 Templars Dual Boss 的 BattleState。
 *
 * - monsters 中放**两个独立单位**，不建 Group Actor（硬约束 2）；
 * - initiativeOrder 保持「每单位一次」以兼容通用引擎的轮次重建；
 *   2+2 的行动次数由 TemplarsEncounterState.initiativeDrawPile 驱动（§12）；
 * - sourceRoomId 恒为 Templars Room（Guardian Objective Room）。
 */
export function buildTemplarsBattle(
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
        message: 'Templar Impaler 与 Templar Warlord 一同挡住去路。',
        kind: 'danger',
      },
    ],
    sourceRoomId: roomId,
    rewards: { gold: 0 },
    light: campaign.light,
  };
}

// ---------------------------------------------------------------------------
// §10 Room Setup（进入 Templars Objective Room）
// ---------------------------------------------------------------------------

export interface SetupTemplarsEncounterOptions {
  mode?: ActFourRuntimeProfileId;
  rng?: () => number;
  seed?: number;
  now?: string;
}

export interface SetupTemplarsEncounterResult {
  ok: boolean;
  campaign: CampaignState;
  state: TemplarsEncounterState | null;
  alreadySetUp: boolean;
  reason: string | null;
}

/**
 * 进入 Templars Objective Room 的完整 Setup（§10 十二步）：
 * Reveal → 载入 Room → 创建 Impaler / Warlord 两个独立 Actor →
 * 固定 Stance 与 Area → 2 + 2 Initiative → Dual Boss Runtime →
 * Spiked Pit Runtime → 保存 → Boss Reveal。
 *
 * 幂等键：`templars-room-setup:{guardianQuestId}:{roomId}`。
 */
export function setupTemplarsEncounter(
  campaign: CampaignState,
  options?: SetupTemplarsEncounterOptions,
): SetupTemplarsEncounterResult {
  const actFour = campaign.actFourState;
  const quest = actFour.guardianQuestState;
  const mode: ActFourRuntimeProfileId = options?.mode ?? 'prototype';

  if (!quest) return setupFail(campaign, 'Guardian Quest 尚未创建');
  if (!quest.guardianBattleId) return setupFail(campaign, 'Guardian Battle 尚未开始');

  // ---- 幂等：同一 Room 不重复 Setup ----
  if (actFour.templarsEncounterState) {
    return {
      ok: true,
      campaign,
      state: actFour.templarsEncounterState,
      alreadySetUp: true,
      reason: null,
    };
  }

  // ---- Data Gate（§3 / §21 / §22）----
  if (mode === 'formal' && !isTemplarsOfficialEncounterEnabled()) {
    return setupFail(
      campaign,
      'official Templars 数据缺失（Boss Card / Room Map / Pit Effect / Victory Rule），正式 Templars 战斗已禁用',
    );
  }
  const validation = mode === 'community-reference' ? validateCommunityTemplarsDefinitions() : validateTemplarsGuardian(mode);
  if (!validation.isComplete) {
    return setupFail(
      campaign,
      `Templars 定义不完整：${[...validation.missing, ...validation.issues].join('；')}`,
    );
  }

  const encounterDef = mode === 'community-reference' ? COMMUNITY_TEMPLARS_ENCOUNTER : getTemplarsGuardianDefinition(mode);
  const impalerDef = mode === 'community-reference' ? COMMUNITY_TEMPLAR_IMPALER : getTemplarImpalerDefinition(mode);
  const warlordDef = mode === 'community-reference' ? COMMUNITY_TEMPLAR_WARLORD : getTemplarWarlordDefinition(mode);
  const room = mode === 'community-reference' ? COMMUNITY_TEMPLARS_ROOM : getTemplarsRoomDefinition(mode);
  const victoryRule = mode === 'community-reference' ? COMMUNITY_TEMPLARS_VICTORY : getTemplarsVictoryRule(mode);

  const impalerMember = encounterDef.bossMembers.find((m) => m.role === 'impaler');
  const warlordMember = encounterDef.bossMembers.find((m) => m.role === 'warlord');
  if (!impalerMember || !warlordMember) {
    return setupFail(campaign, 'Dual Boss Encounter 缺少 impaler / warlord 成员定义');
  }

  const { placements, reason: placementReason } = buildHeroPlacements(campaign, room);
  if (placementReason) return setupFail(campaign, placementReason);

  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10b7e);
  const battleId = quest.guardianBattleId;
  const roomId = room.id;
  const transactionId = templarsTransactionIds.roomSetup(quest.id, roomId);

  // ---- 两个独立 Boss Actor（硬约束 2）----
  const impalerUnit = buildTemplarUnit(impalerDef, TEMPLAR_IMPALER_BATTLE_POSITION);
  const warlordUnit = buildTemplarUnit(warlordDef, TEMPLAR_WARLORD_BATTLE_POSITION);

  const actorStates: TemplarActorState[] = [
    makeActorState(impalerUnit, impalerDef, impalerMember.requiredAreaId || room.impalerPlacement.areaId),
    makeActorState(warlordUnit, warlordDef, warlordMember.requiredAreaId || room.warlordPlacement.areaId),
  ];

  // ---- 2 + 2 Initiative（硬约束 3）----
  const initiativeCards = createTemplarInitiativeSet(encounterDef.id, impalerUnit.id, warlordUnit.id);
  const drawPile = shuffleWithRng(rng, initiativeCards.map((c) => c.id));

  const runtime: TemplarsBattleRuntime = {
    encounterDefinitionId: encounterDef.id,
    impalerActorId: impalerUnit.id,
    warlordActorId: warlordUnit.id,
    impalerInitiativeCardIds: [initiativeCards[0].id, initiativeCards[1].id],
    warlordInitiativeCardIds: [initiativeCards[2].id, initiativeCards[3].id],
    activeBossActorIds: [impalerUnit.id, warlordUnit.id],
    defeatedBossActorIds: [],
    spikedPitRuntimeIds: room.spikedPits.map((p) => `pitrt-${p.id}`),
    lastPitTossTransactionId: null,
    victoryResolved: false,
    dataStatus: encounterDef.officialDataStatus,
  };

  const snapshot: TemplarsDefinitionSnapshot = {
    encounter: encounterDef,
    encounterHash: hashTemplarsEncounter(encounterDef),
    impaler: impalerDef,
    impalerHash: hashTemplarActor(impalerDef),
    warlord: warlordDef,
    warlordHash: hashTemplarActor(warlordDef),
    room,
    roomHash: hashTemplarsRoom(room),
    victoryRule,
    capturedAt: now,
  };

  let state: TemplarsEncounterState = {
    templarsContentVersion: TEMPLARS_CONTENT_VERSION,
    guardianQuestId: quest.id,
    battleId,
    roomId,
    dualBossEncounterState: buildDualBossEncounterState(encounterDef, victoryRule, [
      impalerUnit.id,
      warlordUnit.id,
    ]),
    templarsBattleRuntime: runtime,
    actorStates,
    heroPlacements: placements,
    initiativeCards,
    initiativeDrawPile: drawPile,
    resolvedInitiativeCardIds: [],
    round: 1,
    skillRolls: [],
    bodySlamHitEvents: [],
    spikedPitRuntime: createSpikedPitRuntimes(room.spikedPits),
    pitTossHistory: [],
    roomHazardEventHistory: [],
    snapshot,
    templarsDataAudit: buildTemplarsDataAudit(now),
    processedTransactionIds: [],
  };
  state = withProcessedTemplarsTransaction(state, transactionId);

  const battle = buildTemplarsBattle(campaign, roomId, [impalerUnit, warlordUnit], rng, battleId);

  let next: CampaignState = {
    ...campaign,
    gamePhase: 'battle',
    battle,
    actFourState: { ...actFour, templarsEncounterState: state },
    updatedAt: now,
  };
  next = pushLog(
    next,
    `The Templars 现身：${impalerDef.name}（Aggressive）与 ${warlordDef.name}（Ranged）各自加入 Initiative（2 + 2）。`,
    'danger',
  );

  return { ok: true, campaign: next, state, alreadySetUp: false, reason: null };
}

function makeActorState(
  unit: BattleUnit,
  def: TemplarActorDefinition,
  areaId: string,
): TemplarActorState {
  return {
    actorId: unit.id,
    actorDefinitionId: def.id,
    role: def.role,
    name: def.name,
    maxHp: unit.maxHp,
    hp: unit.hp,
    isAlive: unit.isAlive,
    stance: def.requiredStance,
    areaId,
    actionsPerRound: 2,
    defeatedAt: null,
  };
}

// ---------------------------------------------------------------------------
// §12 抽 Initiative Card
// ---------------------------------------------------------------------------

export interface DrawTemplarInitiativeResult {
  ok: boolean;
  state: TemplarsEncounterState;
  card: TemplarInitiativeCard | null;
  /** 本轮 Templar 卡已抽完（外部据此推进 Round）。 */
  exhausted: boolean;
  reason: string | null;
}

/**
 * 抽取下一张 Templar Initiative Card。
 *
 * - 已失效（Actor 死亡）的卡直接跳过并丢弃（§20）；
 * - 刷新不重洗剩余牌堆（drawPile 已落盘）。
 */
export function drawNextTemplarInitiativeCard(
  state: TemplarsEncounterState,
): DrawTemplarInitiativeResult {
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
 * 推进到下一轮：重新发放存活 Actor 的 2 张卡（死亡 Actor 不再发卡，§20）。
 * 幂等键：`templars-round:{battleId}:{round}`。
 */
export function advanceTemplarsRound(
  state: TemplarsEncounterState,
  rng: () => number,
): TemplarsEncounterState {
  const nextRound = state.round + 1;
  const transactionId = templarsTransactionIds.roundAdvance(state.battleId, nextRound);
  if (hasProcessedTemplarsTransaction(state, transactionId)) return state;

  const aliveActorIds = state.actorStates.filter((a) => a.isAlive).map((a) => a.actorId);
  const cards = state.initiativeCards.map((c) =>
    aliveActorIds.includes(c.actorId) ? { ...c, invalidated: false } : { ...c, invalidated: true },
  );
  const pile = shuffleWithRng(
    rng,
    cards.filter((c) => !c.invalidated).map((c) => c.id),
  );

  return withProcessedTemplarsTransaction(
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
// §13 独立 d10 Skill Table
// ---------------------------------------------------------------------------

export interface RollTemplarSkillResult {
  ok: boolean;
  state: TemplarsEncounterState;
  record: TemplarSkillRollRecord | null;
  skill: TemplarSkillDefinition | null;
  alreadyRolled: boolean;
  reason: string | null;
}

/** 取某 Actor 的 Skill Table（来自 Snapshot，Definition 变更不影响进行中的战斗）。 */
export function getTemplarSkillTable(
  state: TemplarsEncounterState,
  actorId: string,
): TemplarSkillDefinition[] {
  const actor = state.actorStates.find((a) => a.actorId === actorId);
  if (!actor) return [];
  const def =
    actor.role === 'impaler' ? state.snapshot.impaler : state.snapshot.warlord;
  return def.skills;
}

/** d10 → Skill（映射只来自 Definition 的 d10Rolls，不按数组下标）。 */
export function selectTemplarSkillByRoll(
  skills: TemplarSkillDefinition[],
  roll: D10Roll,
): TemplarSkillDefinition | null {
  return skills.find((s) => s.d10Rolls.includes(roll)) ?? null;
}

/**
 * 为一张 Initiative Card 掷技能骰。
 *
 * 硬约束 4：Impaler / Warlord **各自**掷骰、各自查表，不共用；
 * 硬约束 14：结果先保存（写入 skillRolls + 幂等键）后展示，刷新不重掷。
 * 幂等键：`templar-skill-roll:{battleId}:{initiativeCardId}`。
 */
export function rollTemplarSkill(
  state: TemplarsEncounterState,
  initiativeCardId: string,
  rng: () => number,
  options?: { now?: string },
): RollTemplarSkillResult {
  const card = state.initiativeCards.find((c) => c.id === initiativeCardId);
  if (!card) {
    return { ok: false, state, record: null, skill: null, alreadyRolled: false, reason: `找不到 Initiative Card ${initiativeCardId}` };
  }

  const transactionId = templarsTransactionIds.skillRoll(state.battleId, initiativeCardId);
  const existing = state.skillRolls.find((r) => r.transactionId === transactionId);
  if (existing) {
    return {
      ok: true,
      state,
      record: existing,
      skill:
        selectTemplarSkillByRoll(getTemplarSkillTable(state, existing.actorId), existing.roll) ?? null,
      alreadyRolled: true,
      reason: null,
    };
  }

  const actor = state.actorStates.find((a) => a.actorId === card.actorId);
  if (!actor) {
    return { ok: false, state, record: null, skill: null, alreadyRolled: false, reason: `找不到 Actor ${card.actorId}` };
  }
  if (!actor.isAlive) {
    return { ok: false, state, record: null, skill: null, alreadyRolled: false, reason: `${actor.name} 已被击败，不再行动` };
  }

  const skills = getTemplarSkillTable(state, card.actorId);
  const roll = rollD10(rng) as D10Roll;
  const skill = selectTemplarSkillByRoll(skills, roll);
  if (!skill) {
    return {
      ok: false,
      state,
      record: null,
      skill: null,
      alreadyRolled: false,
      reason: `${actor.name} 的 d10 Skill Table 未覆盖骰点 ${roll}`,
    };
  }

  const record: TemplarSkillRollRecord = {
    id: createId('tsr'),
    battleId: state.battleId,
    initiativeCardId,
    actorId: card.actorId,
    role: card.role,
    roll,
    selectedSkillId: skill.id,
    transactionId,
    createdAt: options?.now ?? nowIso(),
  };

  return {
    ok: true,
    state: withProcessedTemplarsTransaction(
      { ...state, skillRolls: [...state.skillRolls, record].slice(-200) },
      transactionId,
    ),
    record,
    skill,
    alreadyRolled: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// §20 单名 Templar 死亡
// ---------------------------------------------------------------------------

export interface ResolveTemplarDefeatResult {
  ok: boolean;
  campaign: CampaignState;
  state: TemplarsEncounterState | null;
  /** 本次失效的 Initiative Card id（只属于死亡 Actor）。 */
  invalidatedCardIds: string[];
  /** 另一名 Templar 是否仍存活（true 时战斗**不结束**）。 */
  otherTemplarAlive: boolean;
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * 一名 Templar 被击败。
 *
 * 硬约束 12 / §20：
 * - **只**失效死亡 Actor 自己的 Initiative Card；
 * - 另一名 Templar 继续正常行动；
 * - 战斗不结束（是否胜利交由 evaluateDualBossVictory 判定）；
 * - 不影响 Spiked Pit 的存在与效果。
 */
export function resolveTemplarDefeat(
  campaign: CampaignState,
  actorId: string,
  options?: { now?: string },
): ResolveTemplarDefeatResult {
  const actFour = campaign.actFourState;
  const state = actFour.templarsEncounterState;
  if (!state) {
    return {
      ok: false,
      campaign,
      state: null,
      invalidatedCardIds: [],
      otherTemplarAlive: false,
      alreadyResolved: false,
      reason: 'Templars Encounter 尚未 Setup',
    };
  }

  const actor = state.actorStates.find((a) => a.actorId === actorId);
  if (!actor) {
    return {
      ok: false,
      campaign,
      state,
      invalidatedCardIds: [],
      otherTemplarAlive: false,
      alreadyResolved: false,
      reason: `找不到 Templar Actor ${actorId}`,
    };
  }

  const transactionId = templarsTransactionIds.bossDefeat(state.battleId, actorId);
  const others = state.actorStates.filter((a) => a.actorId !== actorId);
  if (!actor.isAlive || hasProcessedTemplarsTransaction(state, transactionId)) {
    return {
      ok: true,
      campaign,
      state,
      invalidatedCardIds: [],
      otherTemplarAlive: others.some((a) => a.isAlive),
      alreadyResolved: true,
      reason: null,
    };
  }

  const now = options?.now ?? nowIso();

  // 只失效自己的卡（另一名的卡原样保留）。
  const invalidatedCardIds: string[] = [];
  const cards = state.initiativeCards.map((c) => {
    if (c.actorId !== actorId || c.invalidated) return c;
    invalidatedCardIds.push(c.id);
    return { ...c, invalidated: true };
  });

  const actorStates = state.actorStates.map((a) =>
    a.actorId === actorId ? { ...a, isAlive: false, hp: 0, defeatedAt: now } : a,
  );
  const runtime: TemplarsBattleRuntime = {
    ...state.templarsBattleRuntime,
    activeBossActorIds: state.templarsBattleRuntime.activeBossActorIds.filter((id) => id !== actorId),
    defeatedBossActorIds: [...state.templarsBattleRuntime.defeatedBossActorIds, actorId],
  };

  let nextState: TemplarsEncounterState = {
    ...state,
    actorStates,
    initiativeCards: cards,
    // 未抽到的失效卡从牌堆移除（已抽的结算记录保持不变）。
    initiativeDrawPile: state.initiativeDrawPile.filter((id) => !invalidatedCardIds.includes(id)),
    templarsBattleRuntime: runtime,
  };
  nextState = withProcessedTemplarsTransaction(nextState, transactionId);

  // 同步战斗单位（复用既有 BattleState，不另建死亡系统）。
  const battle = campaign.battle
    ? {
        ...campaign.battle,
        monsters: campaign.battle.monsters.map((m) =>
          m.id === actorId ? { ...m, hp: 0, isAlive: false } : m,
        ),
        initiativeOrder: campaign.battle.initiativeOrder.filter((id) => id !== actorId),
      }
    : campaign.battle;

  const otherTemplarAlive = actorStates.some((a) => a.actorId !== actorId && a.isAlive);
  let next: CampaignState = {
    ...campaign,
    battle,
    actFourState: { ...actFour, templarsEncounterState: nextState },
    updatedAt: now,
  };
  next = pushLog(
    next,
    otherTemplarAlive
      ? `${actor.name} 倒下了——它的 ${invalidatedCardIds.length} 张 Initiative Card 失效，另一名 Templar 继续行动。`
      : `${actor.name} 倒下了。`,
    'warning',
  );

  return {
    ok: true,
    campaign: next,
    state: nextState,
    invalidatedCardIds,
    otherTemplarAlive,
    alreadyResolved: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// Selector（只读）
// ---------------------------------------------------------------------------

export function getTemplarsEncounterState(campaign: CampaignState): TemplarsEncounterState | null {
  return campaign.actFourState.templarsEncounterState ?? null;
}

export function getTemplarActorState(
  state: TemplarsEncounterState,
  actorId: string,
): TemplarActorState | null {
  return state.actorStates.find((a) => a.actorId === actorId) ?? null;
}

export function getTemplarActorStateByRole(
  state: TemplarsEncounterState,
  role: TemplarRole,
): TemplarActorState | null {
  return state.actorStates.find((a) => a.role === role) ?? null;
}

export function getAliveTemplarActorIds(state: TemplarsEncounterState): string[] {
  return state.actorStates.filter((a) => a.isAlive).map((a) => a.actorId);
}

export function isTemplarAlive(state: TemplarsEncounterState, actorId: string): boolean {
  return state.actorStates.some((a) => a.actorId === actorId && a.isAlive);
}

/** 某 Hero 当前所在 Area（含 Pit）。 */
export function getTemplarsHeroPlacement(
  state: TemplarsEncounterState,
  heroId: string,
): TemplarsHeroPlacement | null {
  return state.heroPlacements.find((p) => p.heroId === heroId) ?? null;
}

/** 某 Actor 剩余可用（未失效、未抽出）的 Initiative Card 数。 */
export function getRemainingInitiativeCardCount(
  state: TemplarsEncounterState,
  actorId: string,
): number {
  return state.initiativeDrawPile.filter((id) => {
    const card = state.initiativeCards.find((c) => c.id === id);
    return Boolean(card && card.actorId === actorId && !card.invalidated);
  }).length;
}

// ---------------------------------------------------------------------------

function setupFail(campaign: CampaignState, reason: string): SetupTemplarsEncounterResult {
  return { ok: false, campaign, state: null, alreadySetUp: false, reason };
}
