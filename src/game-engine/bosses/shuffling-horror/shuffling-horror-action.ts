// Phase 10D §13—§24：Shuffling Horror 行动分发（decide + execute）。
//
// 硬约束对照：
// - 4. Horror 每轮最多 2 次（budget 约束）；
// - 5/8. Tracker 未满 → Horror 强制 Echoing Disassembly（replacesNormalSkill）；
//         Tracker 满 → Horror 普通行动（Undulations，Hero Stance Shuffle）；
// - 6. Stance 变化影响下一张未解析卡（resolveAtDrawTime 读当前状态）；
// - 7. 无 Eligible → Excess；
// - 12/13. 召唤物 +1 Monster Opportunity（在 echoing-summon 内）；
// - 16/17. Priest/Growth 死亡不立即重生，下次 Horror 行动重召唤（decide 检测 missing）；
// - 21. RNG 先保存后展示（Undulations 的 rng 在 execute 内消费一次）；
// - 22/23. Undulations 保留 hasActedThisRound，已行动不重复、未行动不丢失。

import type { CampaignState } from '../../../types';
import type { ShufflingHorrorEncounterState, ShufflingHorrorRole } from '../../../types/shuffling-horror';
import { pushLog } from '../../log';
import { nowIso } from '../../random';
import { createSeededRng } from '../../campaign/act-four/rng';
import {
  getMissingSummonRoles,
  hasProcessedShufflingHorrorTransaction,
  resolveMonsterInitiativeCardById,
  shufflingHorrorTransactionIds,
  withProcessedShufflingHorrorTransaction,
} from './shuffling-horror-runtime';
import { resolveEchoingDisassembly } from './echoing-disassembly-summon';
import { resolveUndulationsHeroStanceShuffle } from './undulations-permutation';

export type ShufflingHorrorActionType =
  | 'echoing-disassembly'
  | 'undulations'
  | 'normal-skill'
  | 'excess'
  | 'none';

export interface DecideShufflingHorrorActionResult {
  ok: boolean;
  /** 行动类型（decision）。 */
  decision: ShufflingHorrorActionType;
  /** 是否替代了本次普通 Skill（Echoing 为 true）。 */
  replacedNormalSkill: boolean;
  resolvedActorRole: ShufflingHorrorRole | null;
  reason: string | null;
}

/** 纯查询：给定一张已解析（或待解析）的卡，判定 Horror 应执行的行动类型。 */
export function decideShufflingHorrorAction(
  state: ShufflingHorrorEncounterState,
  cardId: string,
): DecideShufflingHorrorActionResult {
  const { result } = resolveMonsterInitiativeCardById(state, cardId);
  if (!result || !result.card) {
    return { ok: false, decision: 'none', replacedNormalSkill: false, resolvedActorRole: null, reason: '找不到该卡' };
  }
  if (result.card.isExcess) {
    return {
      ok: true,
      decision: 'excess',
      replacedNormalSkill: false,
      resolvedActorRole: null,
      reason: 'no-eligible-monster-at-draw',
    };
  }
  const role = result.card.resolvedActorRole;
  if (!role) {
    return { ok: true, decision: 'excess', replacedNormalSkill: false, resolvedActorRole: null, reason: '未解析出 Actor' };
  }
  if (role === 'horror') {
    const missing = getMissingSummonRoles(state);
    if (missing.length > 0) {
      return { ok: true, decision: 'echoing-disassembly', replacedNormalSkill: true, resolvedActorRole: 'horror', reason: null };
    }
    return { ok: true, decision: 'undulations', replacedNormalSkill: false, resolvedActorRole: 'horror', reason: null };
  }
  return { ok: true, decision: 'normal-skill', replacedNormalSkill: false, resolvedActorRole: role, reason: null };
}

export interface ExecuteShufflingHorrorActionOptions {
  rng?: () => number;
  seed?: number;
  now?: string;
  targetHeroId?: string;
}

export interface ExecuteShufflingHorrorActionResult {
  ok: boolean;
  campaign: CampaignState;
  actionType: ShufflingHorrorActionType;
  replacedNormalSkill: boolean;
  resolvedActorRole: ShufflingHorrorRole | null;
  /** Echoing 召唤出的角色 / Actor id。 */
  summonedRoles: ShufflingHorrorRole[];
  summonedActorIds: string[];
  /** Undulations 前后对比（Hero Stance 排列）。 */
  undulationsBefore: Record<string, string> | null;
  undulationsAfter: Record<string, string> | null;
  /** 本卡是否已被处理过（幂等返回）。 */
  alreadyExecuted: boolean;
  reason: string | null;
}

/** 唯一出口：按一张 Monster Initiative Opportunity 卡执行行动。 */
export function executeShufflingHorrorAction(
  campaign: CampaignState,
  cardId: string,
  options?: ExecuteShufflingHorrorActionOptions,
): ExecuteShufflingHorrorActionResult {
  const actFour = campaign.actFourState;
  const state = actFour.shufflingHorrorEncounterState;
  const fail = (reason: string, actionType: ShufflingHorrorActionType = 'none'): ExecuteShufflingHorrorActionResult => ({
    ok: false,
    campaign,
    actionType,
    replacedNormalSkill: false,
    resolvedActorRole: null,
    summonedRoles: [],
    summonedActorIds: [],
    undulationsBefore: null,
    undulationsAfter: null,
    alreadyExecuted: false,
    reason,
  });
  if (!state) return fail('Shuffling Horror Encounter 尚未 Setup');

  const actionTxId = shufflingHorrorTransactionIds.action(state.guardianBattleId, cardId);
  if (hasProcessedShufflingHorrorTransaction(state, actionTxId)) {
    return {
      ok: true,
      campaign,
      actionType: 'none',
      replacedNormalSkill: false,
      resolvedActorRole: null,
      summonedRoles: [],
      summonedActorIds: [],
      undulationsBefore: null,
      undulationsAfter: null,
      alreadyExecuted: true,
      reason: null,
    };
  }

  const now = options?.now ?? nowIso();
  const rng = options?.rng ?? createSeededRng(options?.seed ?? 0x10d5f);

  // ---- 抽卡解析（resolveAtDrawTime）----
  const resolved = resolveMonsterInitiativeCardById(state, cardId);
  let nextState = resolved.state;
  const decision = decideShufflingHorrorAction(nextState, cardId);
  if (!decision.ok) return fail(decision.reason ?? '无法判定行动', 'none');

  let summonedRoles: ShufflingHorrorRole[] = [];
  let summonedActorIds: string[] = [];
  let undulationsBefore: Record<string, string> | null = null;
  let undulationsAfter: Record<string, string> | null = null;

  // ---- 应用行动 ----
  if (decision.decision === 'echoing-disassembly') {
    const summonTxId = shufflingHorrorTransactionIds.summon(state.guardianBattleId, cardId);
    if (hasProcessedShufflingHorrorTransaction(nextState, summonTxId)) {
      return { ...fail('Echoing 已处理', 'echoing-disassembly'), alreadyExecuted: true };
    }
    const summon = resolveEchoingDisassembly(nextState, cardId);
    if (!summon.ok) return fail(summon.reason ?? 'Echoing 原子召唤失败', 'echoing-disassembly');
    nextState = summon.state;
    nextState = withProcessedShufflingHorrorTransaction(nextState, summonTxId);
    summonedRoles = summon.summonedRoles;
    summonedActorIds = summon.summonedActorIds;
  } else if (decision.decision === 'undulations') {
    const und = resolveUndulationsHeroStanceShuffle(nextState, rng);
    nextState = und.state;
    undulationsBefore = und.before;
    undulationsAfter = und.after;
  }
  // excess / normal-skill：仅日志，无额外状态变更（normal-skill 已由 budget 体现）

  // ---- 扣减行动预算（硬约束 4/5）----
  const role = decision.resolvedActorRole;
  if (role) {
    const used = nextState.monsterBudget.perRoleUsed[role] ?? 0;
    const max = nextState.monsterBudget.perRoleMax[role] ?? 0;
    nextState = {
      ...nextState,
      monsterBudget: {
        ...nextState.monsterBudget,
        perRoleUsed: { ...nextState.monsterBudget.perRoleUsed, [role]: Math.min(max, used + 1) },
      },
    };
  }

  nextState = withProcessedShufflingHorrorTransaction(nextState, actionTxId);

  const nextCampaign: CampaignState = {
    ...campaign,
    actFourState: { ...actFour, shufflingHorrorEncounterState: nextState },
    updatedAt: now,
  };

  const logMsg =
    decision.decision === 'echoing-disassembly'
      ? `Shuffling Horror 强制 Echoing Disassembly，召唤 ${summonedRoles.join(' → ')}。`
      : decision.decision === 'undulations'
        ? 'Shuffling Horror 施放 Undulations，Hero Stance 被重新洗牌。'
        : decision.decision === 'excess'
          ? 'Monster Initiative 无 Eligible Actor，标记为 Excess 并移除。'
          : `${role} 执行普通行动。`;

  return {
    ok: true,
    campaign: pushLog(nextCampaign, logMsg, 'info'),
    actionType: decision.decision,
    replacedNormalSkill: decision.replacedNormalSkill,
    resolvedActorRole: role,
    summonedRoles,
    summonedActorIds,
    undulationsBefore,
    undulationsAfter,
    alreadyExecuted: false,
    reason: null,
  };
}
