// Phase 10D §13—§16：Echoing Disassembly 原子双召唤 + Spawn Space Resolution。
//
// 硬约束对照：
// - 8. Tracker 未满时 Horror 强制 Echoing Disassembly；
// - 9. 召唤顺序固定 Priest → Growth；
// - 10. 只召唤当前不在场的 Role（missing = 不在 Tracker 存活）；
// - 11. 两名召唤**原子**提交（任一 Spawn 失败整体回滚）；
// - 12. 每名召唤物 +1 Monster Opportunity；
// - 13. Opportunity 不永久绑定召唤物；
// - 14. Spawn 用第一空 Stance + 对应 Area（除非正式资料另有说明）；
// - 15. Area 满时复用正式 Space Resolution（prototype 资料缺失 → 回滚）。

import type {
  MonsterInitiativeOpportunityCard,
  MonsterStance,
  ShufflingHorrorActorState,
  ShufflingHorrorEncounterState,
  ShufflingHorrorRole,
} from '../../../types/shuffling-horror';
import { createId } from '../../random';
import {
  PROTOTYPE_SHUFFLING_HORROR_AREA_MAP,
  SHUFFLING_HORROR_STANCE_PRIORITY,
} from '../../../data/darkest-dungeon/shuffling-horror/ids';
import { getMissingSummonRoles } from './shuffling-horror-runtime';

export interface EchoingDisassemblyResult {
  ok: boolean;
  state: ShufflingHorrorEncounterState;
  /** 本次实际召唤（激活）的角色（按 Priest → Growth 顺序）。 */
  summonedRoles: ShufflingHorrorRole[];
  summonedActorIds: string[];
  /** 每名召唤物新增的 Monster Opportunity 卡 id。 */
  addedCardIds: string[];
  /** 原子失败原因（整体回滚）。 */
  reason: string | null;
}

/** 第一处空 Stance（capacity 允许且无人占据）。 */
export function resolveFirstEmptyStance(
  state: ShufflingHorrorEncounterState,
): MonsterStance | null {
  for (const stance of state.stancePriority.stancePriority) {
    const occupant = state.stancePriority.stanceOccupant[stance];
    if (occupant === null) return stance;
  }
  return null;
}

function makeSummonCard(
  battleId: string,
  role: ShufflingHorrorRole,
  round: number,
): MonsterInitiativeOpportunityCard {
  return {
    id: `shinit-${battleId}-summon-${role}-${round}-${createId('c').slice(0, 6)}`,
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

/**
 * 原子双召唤（Priest → Growth）。
 *
 * 先**计算**所有要召唤角色的 Spawn 计划；任一 Spawn 失败（无空 Stance = Area 满，硬约束 15）
 * 则整体回滚返回 ok:false。全部成功才**提交**：激活 Actor（离开 Reserve、占 Stance、分配
 * Area）、更新 Tracker、每名召唤物 +1 Monster Opportunity、generation 在重召唤时递增。
 *
 * 幂等键由调用方（action.ts）以 sourceCardId 管理。
 */
export function resolveEchoingDisassembly(
  state: ShufflingHorrorEncounterState,
  sourceCardId: string,
): EchoingDisassemblyResult {
  if (state.mode === 'community-reference') {
    return {
      ok: false,
      state,
      summonedRoles: [],
      summonedActorIds: [],
      addedCardIds: [],
      reason: 'SHUFFLING_INITIAL_AREA_UNRESOLVED',
    };
  }
  const battleId = state.guardianBattleId;
  const missing = getMissingSummonRoles(state);

  if (missing.length === 0) {
    return { ok: false, state, summonedRoles: [], summonedActorIds: [], addedCardIds: [], reason: '无可召唤的缺失角色' };
  }

  // ---- 先规划所有 Spawn（不提交）----
  type Plan = { role: ShufflingHorrorRole; stance: MonsterStance; areaId: string };
  const plan: Plan[] = [];
  const occ = { ...state.stancePriority.stanceOccupant };
  for (const role of missing) {
    const stance = firstEmptyStanceFrom(occ);
    if (!stance) {
      return {
        ok: false,
        state,
        summonedRoles: [],
        summonedActorIds: [],
        addedCardIds: [],
        reason: `Area 已满：角色 ${role} 无可用 Stance（需复用正式 Space Resolution，prototype 资料缺失）`,
      };
    }
    occ[stance] = `plan-${role}`;
    plan.push({ role, stance, areaId: PROTOTYPE_SHUFFLING_HORROR_AREA_MAP[stance] });
  }

  // ---- 提交：激活 Actor ----
  const newGenerationByRole = { ...state.generationByRole };
  const actors: ShufflingHorrorActorState[] = state.actors.map((a) => {
    const p = plan.find((x) => x.role === a.role);
    if (!p) return a;
    const wasDead = !a.alive;
    const newGen = wasDead ? a.generation + 1 : a.generation;
    newGenerationByRole[a.role] = newGen;
    return {
      ...a,
      alive: true,
      generation: newGen,
      inReserve: false,
      stances: [p.stance],
      areaId: p.areaId,
      actionBudgetUsedThisRound: 0,
      actionBudgetMaxThisRound: a.actionBudgetMaxThisRound,
    };
  });

  // ---- 提交：更新 Tracker（hard 约束 14）----
  const nextOccupant: Record<MonsterStance, string | null> = { ...state.stancePriority.stanceOccupant };
  for (const p of plan) {
    const actorId = actors.find((a) => a.role === p.role)!.actorId;
    nextOccupant[p.stance] = actorId;
  }
  const allOccupied = SHUFFLING_HORROR_STANCE_PRIORITY.every((s) => nextOccupant[s] !== null);
  const nextTracker = {
    ...state.stancePriority,
    stanceOccupant: nextOccupant,
    isFull: allOccupied,
  };

  // ---- 提交：每名召唤物 +1 Monster Opportunity（hard 约束 12）----
  const addedCards = plan.map((p) => makeSummonCard(battleId, p.role, state.round));
  const nextDrawPile = [...state.initiativeDrawPile, ...addedCards];

  const summonedActorIds = plan.map((p) => actors.find((a) => a.role === p.role)!.actorId);

  const nextState: ShufflingHorrorEncounterState = {
    ...state,
    actors,
    stancePriority: nextTracker,
    initiativeDrawPile: nextDrawPile,
    generationByRole: newGenerationByRole,
    summonedRolesThisEncounter: [...state.summonedRolesThisEncounter, ...plan.map((p) => p.role)],
    lastActionLog: [
      ...state.lastActionLog,
      `Echoing Disassembly：${plan.map((p) => p.role).join(' → ')} 被强制召唤（每名 +1 Monster Opportunity）。`,
    ],
  };
  void sourceCardId;

  return {
    ok: true,
    state: nextState,
    summonedRoles: plan.map((p) => p.role),
    summonedActorIds,
    addedCardIds: addedCards.map((c) => c.id),
    reason: null,
  };
}

function firstEmptyStanceFrom(
  occ: Record<MonsterStance, string | null>,
): MonsterStance | null {
  for (const stance of SHUFFLING_HORROR_STANCE_PRIORITY) {
    if (occ[stance] === null) return stance;
  }
  return null;
}
