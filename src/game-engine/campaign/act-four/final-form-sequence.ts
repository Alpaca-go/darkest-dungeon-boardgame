// Phase 10A §18 / §21：Final Form 序列（出场 / 击败 / 失败）。
//
// 规则 28—30：Final Boss 四个有序 Form，本局面对三个，最后一定是 Heart of Darkness。
//
// 硬约束对照：
// - 硬约束 1：不新建第二套 Battle 状态机 —— 直接复用既有 BattleState 与既有战斗引擎，
//   本模块只负责「构建 / 替换 Form 单位 + 重置 Round + 幂等」；
// - 硬约束 13：heart-of-darkness 恒为最后一个，运行时再校验一次；
// - 硬约束 14：不生成 Dungeon Exploration —— 战斗的 sourceRoomId 直接取
//   FinalEncounterState.roomDefinitionId，全程不读 campaign.dungeon；
// - 硬约束 18：所有 Form 共用同一个 Room —— sourceRoomId 从头到尾不变；
// - 硬约束 23：不实现 Final Form 的正式技能 —— Form 单位的 monsterSkillIds 直接取
//   Definition 里的 skillIds（正式为空 → Data Gate 早已在 prepare 阶段拦截）；
// - RNG 可注入：Initiative 用 shuffleWithRng，不用 battle.ts 里基于 Math.random 的
//   createInitiativeOrder（Act IV 运行时禁止 Math.random）。

import type { BattleState, BattleUnit, CampaignState } from '../../../types';
import type { ActFourState } from '../../../types/act-four';
import type { FinalEncounterState, FinalFormDefinition, FinalFormId } from '../../../types/final-encounter';
import {
  UNSKIPPABLE_FINAL_FORM_ID,
  getFinalFormDisplayName,
  getFinalFormPool,
} from '../../../data/darkest-dungeon/final-form-registry';
import { MAX_ROUNDS, makeHeroUnit } from '../../battle';
import { failCampaign } from '../../stagecoach';
import { pushLog } from '../../log';
import { createId, nowIso } from '../../random';
import type { ActFourContentMode } from './draw-quest';
import {
  actFourTransactionIds,
  withActFourStage,
  withProcessedActFourTransaction,
} from './act-four-state';
import { createSeededRng, shuffleWithRng } from './rng';

// ---------------------------------------------------------------------------
// Form 单位构建
// ---------------------------------------------------------------------------

/** Final Form 在战场上的固定站位（单体 Boss，占 1 号位）。 */
export const FINAL_FORM_BATTLE_POSITION = 1;

/**
 * 由 FinalFormDefinition 构建战斗单位。
 * 只搬运 Definition 上已有的字段，不额外发明数值（硬约束 21 / 23）。
 */
export function buildFinalFormUnit(def: FinalFormDefinition): BattleUnit {
  const maxHp = def.maxHp ?? 0;
  return {
    id: `u_${def.id}`,
    name: def.name || def.formId,
    side: 'monster',
    sourceId: def.id,
    maxHp,
    hp: maxHp,
    stress: 0,
    position: FINAL_FORM_BATTLE_POSITION,
    speed: 1,
    stance: 'aggressive',
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
    monsterSkillIds: [...def.skillIds],
    // Final Form 是怪物，不参与精神系统（与 makeMonsterUnit 保持一致）。
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    mentalEffectResolvedTurnId: null,
  };
}

function getFormDefinition(
  formId: FinalFormId,
  mode: ActFourContentMode,
): FinalFormDefinition | undefined {
  return getFinalFormPool(mode).find((f) => f.formId === formId);
}

// ---------------------------------------------------------------------------
// 内部：构建 / 重建 Final Encounter Battle
// ---------------------------------------------------------------------------

export interface SpawnFormOptions {
  mode?: ActFourContentMode;
  rng?: () => number;
  seed?: number;
  now?: string;
}

/**
 * 在同一个 Room 内建立（或重建）Final Encounter 的 BattleState。
 *
 * - Round 恒重置为 1（硬约束 17）；
 * - Initiative 由存活英雄 + 新 Form 重新洗（硬约束 17）；
 * - 英雄单位由 makeHeroUnit 复用既有逻辑构建；
 *   **不**改 wounds / stress / stance（硬约束 15 / 16），只是把当前值搬进战斗单位；
 * - sourceRoomId 恒为 encounter.roomDefinitionId（硬约束 18）。
 */
export function buildFinalEncounterBattle(
  campaign: CampaignState,
  encounter: FinalEncounterState,
  formUnit: BattleUnit,
  rng: () => number,
  previousBattleId?: string | null,
): BattleState {
  const heroUnits = campaign.heroes.filter((h) => !h.dead).map((h, i) => makeHeroUnit(h, i, campaign));
  const initiativeOrder = shuffleWithRng(
    rng,
    [...heroUnits, formUnit].filter((u) => u.isAlive).map((u) => u.id),
  );

  return {
    // 整场 Final Encounter 视为同一场战斗：battleId 跨 Form 保持不变。
    battleId: previousBattleId ?? createId('btl'),
    status: 'active',
    // 硬约束 17：Round 重置为 1。
    round: 1,
    maxRounds: MAX_ROUNDS,
    heroes: heroUnits,
    monsters: [formUnit],
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
        message: `${formUnit.name} 现身。`,
        kind: 'danger',
      },
    ],
    // 硬约束 18：所有 Form 共用同一个 Room。
    sourceRoomId: encounter.roomDefinitionId,
    rewards: { gold: 0 },
    light: campaign.light,
  };
}

// ---------------------------------------------------------------------------
// §18 第一个 Form 出场
// ---------------------------------------------------------------------------

export interface StartFinalFormResult {
  ok: boolean;
  campaign: CampaignState;
  formId: FinalFormId | null;
  formIndex: number;
  alreadyStarted: boolean;
  reason: string | null;
}

/**
 * 让第一个 Form 出场，正式开始 Final Encounter。
 *
 * 幂等键：`final-form-start:{encounterId}:{formId}`。
 * 后续两个 Form 由 transitionToNextFinalForm() 负责，不走本函数。
 */
export function startFinalEncounter(
  campaign: CampaignState,
  options?: SpawnFormOptions,
): StartFinalFormResult {
  const state: ActFourState = campaign.actFourState;
  const encounter = state.finalEncounterState;
  const mode: ActFourContentMode = options?.mode ?? 'prototype';

  if (!encounter) return formFail(campaign, 'Final Encounter 尚未准备（先调用 prepareFinalEncounter）');
  if (encounter.status !== 'preparing' || encounter.activeFormIndex >= 0) {
    return {
      ok: encounter.activeFormId !== null,
      campaign,
      formId: encounter.activeFormId,
      formIndex: encounter.activeFormIndex,
      alreadyStarted: true,
      reason: null,
    };
  }

  const formId = encounter.orderedFormIds[0];
  if (!formId) return formFail(campaign, 'Form 顺序为空');

  const transactionId = actFourTransactionIds.finalFormStart(encounter.id, formId);
  if (encounter.processedTransactionIds.includes(transactionId)) {
    return {
      ok: true,
      campaign,
      formId: encounter.activeFormId,
      formIndex: encounter.activeFormIndex,
      alreadyStarted: true,
      reason: null,
    };
  }

  const def = getFormDefinition(formId, mode);
  if (!def) return formFail(campaign, `找不到 Final Form 定义：${formId}`);

  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10a18);
  const formUnit = buildFinalFormUnit(def);
  const battle = buildFinalEncounterBattle(campaign, encounter, formUnit, rng);

  const nextEncounter: FinalEncounterState = {
    ...encounter,
    status: 'form-active',
    activeFormIndex: 0,
    activeFormId: formId,
    processedTransactionIds: [...encounter.processedTransactionIds, transactionId],
    lastTransactionId: transactionId,
  };

  let next: CampaignState = {
    ...campaign,
    gamePhase: 'battle',
    battle,
    // 硬约束 14：Final Encounter 全程无 Dungeon。
    dungeon: null,
    updatedAt: now,
  };
  next = pushLog(next, `最终决战开始：${getFinalFormDisplayName(formId)} 挡在面前。`, 'danger');

  let nextState = withProcessedActFourTransaction(
    { ...state, finalEncounterState: nextEncounter },
    transactionId,
  );
  nextState = withActFourStage(nextState, 'final-encounter-active', `${transactionId}:stage`);

  return {
    ok: true,
    campaign: { ...next, actFourState: nextState },
    formId,
    formIndex: 0,
    alreadyStarted: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// §19 Form 被击败
// ---------------------------------------------------------------------------

export interface DefeatFinalFormResult {
  ok: boolean;
  campaign: CampaignState;
  defeatedFormId: FinalFormId | null;
  /** 还有下一个 Form 需要切换。 */
  hasNextForm: boolean;
  nextFormId: FinalFormId | null;
  /** 三个 Form 全部击败（Heart of Darkness 倒下）→ 可以结算战役胜利。 */
  allFormsDefeated: boolean;
  alreadyResolved: boolean;
  reason: string | null;
}

/**
 * 当前 Form 被击败。
 *
 * 幂等键：`final-form-defeat:{encounterId}:{formId}`。
 * - 还有下一个 Form → 写入 transitionState（cleaning-up），status = 'transitioning'，
 *   实际切换由 transitionToNextFinalForm() 完成（分两步是为了刷新可恢复）；
 * - 已是最后一个（heart-of-darkness）→ status = 'victory'，
 *   由 resolveCampaignVictory() 结算战役胜利（§22）。
 */
export function defeatFinalForm(
  campaign: CampaignState,
  formId: FinalFormId,
  options?: { now?: string },
): DefeatFinalFormResult {
  const state = campaign.actFourState;
  const encounter = state.finalEncounterState;

  if (!encounter) return defeatFail(campaign, 'Final Encounter 尚未准备');
  if (encounter.activeFormId !== formId) {
    return defeatFail(campaign, `Form ${formId} 不是当前出场的 Form（当前：${encounter.activeFormId}）`);
  }

  const transactionId = actFourTransactionIds.finalFormDefeat(encounter.id, formId);
  if (
    encounter.defeatedFormIds.includes(formId) ||
    encounter.processedTransactionIds.includes(transactionId)
  ) {
    const idx = encounter.orderedFormIds.indexOf(formId);
    const nextId = encounter.orderedFormIds[idx + 1] ?? null;
    return {
      ok: true,
      campaign,
      defeatedFormId: formId,
      hasNextForm: nextId !== null,
      nextFormId: nextId,
      allFormsDefeated: encounter.defeatedFormIds.length >= encounter.orderedFormIds.length,
      alreadyResolved: true,
      reason: null,
    };
  }

  const now = options?.now ?? nowIso();
  const index = encounter.orderedFormIds.indexOf(formId);
  const nextFormId = encounter.orderedFormIds[index + 1] ?? null;
  const defeatedFormIds = [...encounter.defeatedFormIds, formId];
  const allFormsDefeated = defeatedFormIds.length >= encounter.orderedFormIds.length;

  // 运行时再校验一次「最后一个必须是 Heart of Darkness」（硬约束 13）。
  if (allFormsDefeated && formId !== UNSKIPPABLE_FINAL_FORM_ID) {
    return defeatFail(campaign, 'Form 顺序异常：最后被击败的必须是 Heart of Darkness');
  }

  const nextEncounter: FinalEncounterState = {
    ...encounter,
    status: nextFormId ? 'transitioning' : 'victory',
    defeatedFormIds,
    transitionState: nextFormId
      ? {
          transactionId: actFourTransactionIds.finalFormTransition(encounter.id, formId, nextFormId),
          fromFormId: formId,
          toFormId: nextFormId,
          status: 'cleaning-up',
          nextRound: 1,
          initiativeRebuilt: false,
          startedAt: now,
          completedAt: null,
        }
      : null,
    processedTransactionIds: [...encounter.processedTransactionIds, transactionId],
    lastTransactionId: transactionId,
  };

  let next = pushLog(
    campaign,
    nextFormId
      ? `${getFinalFormDisplayName(formId)} 倒下了——但黑暗还在蠕动。`
      : `${getFinalFormDisplayName(formId)} 被彻底击溃。`,
    nextFormId ? 'warning' : 'success',
  );
  next = { ...next, updatedAt: now };

  return {
    ok: true,
    campaign: {
      ...next,
      actFourState: withProcessedActFourTransaction(
        { ...state, finalEncounterState: nextEncounter },
        transactionId,
      ),
    },
    defeatedFormId: formId,
    hasNextForm: nextFormId !== null,
    nextFormId,
    allFormsDefeated,
    alreadyResolved: false,
    reason: null,
  };
}

// ---------------------------------------------------------------------------
// §21 Final Encounter 失败
// ---------------------------------------------------------------------------

export interface FailFinalEncounterResult {
  campaign: CampaignState;
  alreadyFailed: boolean;
}

/**
 * Final Encounter 失败 → Campaign Over（与 Guardian Quest 失败同构，硬约束 11）。
 * 复用既有 failCampaign()，不另建一套战役失败流程。
 */
export function failFinalEncounter(
  campaign: CampaignState,
  reason: string,
  options?: { now?: string },
): FailFinalEncounterResult {
  const state = campaign.actFourState;
  if (state.stage === 'campaign-over' || campaign.gamePhase === 'campaign-over') {
    return { campaign, alreadyFailed: true };
  }

  const encounter = state.finalEncounterState;
  const transactionId = `final-encounter-failure:${encounter?.id ?? campaign.id}`;
  const nextEncounter: FinalEncounterState | null = encounter
    ? { ...encounter, status: 'failed', lastTransactionId: transactionId }
    : null;

  let nextState = withProcessedActFourTransaction(
    { ...state, finalEncounterState: nextEncounter },
    transactionId,
  );
  nextState = withActFourStage(nextState, 'campaign-over', `${transactionId}:stage`);

  const failed = failCampaign(campaign, `Final Encounter 失败：${reason}`);

  return {
    campaign: { ...failed, actFourState: nextState, updatedAt: options?.now ?? nowIso() },
    alreadyFailed: false,
  };
}

// ---------------------------------------------------------------------------
// Selector
// ---------------------------------------------------------------------------

/** 当前出场的 Form。 */
export function getActiveFinalFormId(state: ActFourState): FinalFormId | null {
  return state.finalEncounterState?.activeFormId ?? null;
}

/** 还剩几个 Form 未击败。 */
export function getRemainingFinalFormCount(state: ActFourState): number {
  const e = state.finalEncounterState;
  if (!e) return 0;
  return Math.max(0, e.orderedFormIds.length - e.defeatedFormIds.length);
}

/** 三个 Form 是否全部击败。 */
export function areAllFinalFormsDefeated(state: ActFourState): boolean {
  const e = state.finalEncounterState;
  if (!e) return false;
  return e.defeatedFormIds.length >= e.orderedFormIds.length && e.orderedFormIds.length > 0;
}

/** 是否正处于 Form 切换过程中（刷新可从这里恢复）。 */
export function hasPendingFormTransition(state: ActFourState): boolean {
  const t = state.finalEncounterState?.transitionState;
  return !!t && t.status !== 'completed';
}

// ---------------------------------------------------------------------------

function formFail(campaign: CampaignState, reason: string): StartFinalFormResult {
  return { ok: false, campaign, formId: null, formIndex: -1, alreadyStarted: false, reason };
}

function defeatFail(campaign: CampaignState, reason: string): DefeatFinalFormResult {
  return {
    ok: false,
    campaign,
    defeatedFormId: null,
    hasNextForm: false,
    nextFormId: null,
    allFormsDefeated: false,
    alreadyResolved: false,
    reason,
  };
}
