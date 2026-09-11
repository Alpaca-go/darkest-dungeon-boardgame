// Phase 10B §18：Room Hazard 效果统一入口。
//
// 硬约束：
// - 所有效果必须复用正式管线 —— Damage 走 resolveDamage()（含 Death's Door / Deathblow /
//   killCampaignHero / Rule Event），Stress 走 applyStress()（含 Resolve Test / Heart Attack）；
// - **不得直接修改 HP / Stress**；
// - 同一 (actorId, trigger, sourceEventId) 只结算一次（Entry Effect 只执行一次，§30-53）；
// - Pit 的效果来自 Room Definition，绝不在 Skill 中硬编码。

import type { CampaignState } from '../../types';
import type {
  RoomHazardEffectDefinition,
  RoomHazardEvent,
  RoomHazardTrigger,
  SpikedPitDefinition,
  SpikedPitRuntime,
} from '../../types/room-hazards';
import { resolveDamage } from '../damage';
import { applyStress } from '../stress';
import { pushLog } from '../log';
import { createId, nowIso } from '../random';
import { applyConditionToHero, createRuleEventContext } from '../quirks';
import { hasResolvedTrigger, hazardTriggerKey, withResolvedTrigger } from './spiked-pit';

export interface ResolveRoomHazardTriggerParams {
  campaign: CampaignState;
  pit: SpikedPitDefinition;
  runtime: SpikedPitRuntime;
  trigger: RoomHazardTrigger;
  /** 受影响的 Actor（当前仅支持 Hero；Monster 位于 Pit 的规则无资料）。 */
  actorId: string;
  sourceEventId: string;
  /** 事务 id（`templar-pit-effect:{pitTossTransactionId}:{hazardId}:{trigger}`）。 */
  transactionId: string;
  battleId?: string;
  now?: string;
}

export interface ResolveRoomHazardTriggerResult {
  ok: boolean;
  campaign: CampaignState;
  runtime: SpikedPitRuntime;
  event: RoomHazardEvent | null;
  alreadyResolved: boolean;
  reason: string | null;
}

/** 按触发器取出对应的效果列表（其余触发器暂无资料 → 空数组）。 */
export function getHazardEffectsForTrigger(
  pit: SpikedPitDefinition,
  trigger: RoomHazardTrigger,
): RoomHazardEffectDefinition[] {
  switch (trigger) {
    case 'on-forced-entry':
    case 'on-normal-entry':
      return pit.entryEffects;
    case 'on-end-turn':
      return pit.endTurnEffects;
    case 'on-condition':
      return pit.conditionTriggeredEffects;
    case 'on-start-turn':
    case 'on-exit':
    default:
      // 无资料来源 → 不自创效果。
      return [];
  }
}

/**
 * 统一 Hazard 触发入口（§18）。
 *
 * 注意 Damage 与 Stress 的执行顺序固定为 Definition 中的声明顺序，
 * 不由引擎重排 —— 顺序属于 Room Card 数据。
 */
export function resolveRoomHazardTrigger(
  params: ResolveRoomHazardTriggerParams,
): ResolveRoomHazardTriggerResult {
  const { pit, trigger, actorId, sourceEventId, transactionId } = params;
  const now = params.now ?? nowIso();
  const key = hazardTriggerKey(actorId, trigger, sourceEventId);

  if (hasResolvedTrigger(params.runtime, key)) {
    return {
      ok: true,
      campaign: params.campaign,
      runtime: params.runtime,
      event: null,
      alreadyResolved: true,
      reason: null,
    };
  }

  const hero = params.campaign.heroes.find((h) => h.instanceId === actorId);
  if (!hero) {
    return {
      ok: false,
      campaign: params.campaign,
      runtime: params.runtime,
      event: null,
      alreadyResolved: false,
      reason: `找不到 Hero ${actorId}`,
    };
  }
  if (hero.dead) {
    // 已阵亡：不再结算，但标记已处理，避免反复尝试。
    return {
      ok: true,
      campaign: params.campaign,
      runtime: withResolvedTrigger(params.runtime, key),
      event: null,
      alreadyResolved: true,
      reason: null,
    };
  }

  const effects = getHazardEffectsForTrigger(pit, trigger);
  if (effects.length === 0) {
    return {
      ok: true,
      campaign: params.campaign,
      runtime: withResolvedTrigger(params.runtime, key),
      event: null,
      alreadyResolved: false,
      reason: null,
    };
  }

  let campaign = params.campaign;
  const appliedEffectIds: string[] = [];
  let damageDealt = 0;
  let stressDealt = 0;
  let enteredDeathsDoor = false;
  let heroDied = false;

  for (const effect of effects) {
    // 英雄中途死亡 → 停止后续效果（正式管线已处理死亡，不重复施加）
    const fresh = campaign.heroes.find((h) => h.instanceId === actorId);
    if (!fresh || fresh.dead) {
      heroDied = true;
      break;
    }

    if (effect.kind === 'damage' && (effect.amount ?? 0) > 0) {
      const out = resolveDamage(campaign, {
        targetId: actorId,
        amount: effect.amount!,
        // Spiked Pit 属于房间陷阱语义，复用既有 trap 来源（不新建平行死亡系统）。
        sourceType: 'trap',
        sourceSkillId: effect.id,
        eventId: `${transactionId}:${effect.id}`,
      });
      campaign = out.campaign;
      damageDealt += Math.max(0, out.resolution.previousHp - out.resolution.nextHp);
      enteredDeathsDoor = enteredDeathsDoor || out.resolution.enteredDeathsDoor;
      heroDied = heroDied || out.resolution.heroDied;
      appliedEffectIds.push(effect.id);
      continue;
    }

    if (effect.kind === 'stress' && (effect.amount ?? 0) > 0) {
      const out = applyStress(campaign, {
        heroId: actorId,
        amount: effect.amount!,
        // Pit 效果由房间触发，语义上属于探索/环境来源。
        sourceType: 'exploration',
        sourceId: effect.id,
        questId: campaign.currentQuestId ?? '',
        battleId: params.battleId,
        batchId: `${transactionId}:${effect.id}`,
      });
      campaign = out.campaign;
      stressDealt += out.result.appliedAmount;
      // Heart Attack 可能导致死亡，复用其结果判定。
      const after = campaign.heroes.find((h) => h.instanceId === actorId);
      heroDied = heroDied || Boolean(after?.dead);
      appliedEffectIds.push(effect.id);
      continue;
    }

    if (effect.kind === 'condition' && effect.condition && (effect.amount ?? 0) > 0
      && typeof effect.duration === 'number' && effect.duration > 0) {
      campaign = applyConditionToHero(
        campaign,
        actorId,
        effect.condition,
        effect.amount!,
        effect.duration,
        effect.description,
        createRuleEventContext(),
      );
      appliedEffectIds.push(effect.id);
      continue;
    }

    // 未完整定义的 condition / custom：登记但不自创语义。
    appliedEffectIds.push(effect.id);
  }

  const event: RoomHazardEvent = {
    id: createId('hzev'),
    hazardId: pit.id,
    trigger,
    actorId,
    sourceEventId,
    appliedEffectIds,
    damageDealt,
    stressDealt,
    enteredDeathsDoor,
    heroDied,
    transactionId,
    createdAt: now,
  };

  campaign = pushLog(
    campaign,
    `${pit.id} Room Effect 结算（${trigger}）：伤害 ${damageDealt}、压力 ${stressDealt}。`,
    heroDied ? 'danger' : 'warning',
  );

  return {
    ok: true,
    campaign,
    runtime: withResolvedTrigger(params.runtime, key),
    event,
    alreadyResolved: false,
    reason: null,
  };
}
