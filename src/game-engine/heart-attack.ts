// Phase 7：Heart Attack（心脏病发作）。
// 已完成 Resolve Test 的英雄再次达到 10 Stress → 立即永久死亡：
// - 不进入 Death's Door、不掷 Deathblow、无视 HP；
// - 复用 Phase 6 killCampaignHero（禁止另写平行死亡系统）；
// - 战斗中同时标记 BattleUnit 死亡（deathResolved=true 防 processBattleDeaths 重复结算）。

import type { CampaignState, HeartAttackResult } from '../types';
import { killCampaignHero } from './hero-death';
import { pushLog } from './log';
import { pushMentalEvent } from './mental-log';
import { STRESS_MAX } from './stress-constants';

export interface HeartAttackInput {
  heroInstanceId: string;
  questId: string;
  battleId?: string;
  /** 触发本次 Heart Attack 的精神事件/批次 id（日志追溯用）。 */
  sourceEventId?: string;
}

export interface TriggerHeartAttackOutput {
  campaign: CampaignState;
  result: HeartAttackResult | null;
  skippedReason?: string;
}

/**
 * 触发 Heart Attack。前置条件不满足时返回 skippedReason，不修改数据。
 * 幂等：已 dead 的英雄直接跳过（killCampaignHero 内部同样防重复）。
 */
export function triggerHeartAttack(
  campaign: CampaignState,
  input: HeartAttackInput
): TriggerHeartAttackOutput {
  const hero = campaign.heroes.find((h) => h.instanceId === input.heroInstanceId);
  if (!hero) return { campaign, result: null, skippedReason: '英雄不存在' };
  if (hero.dead) return { campaign, result: null, skippedReason: '英雄已死亡' };
  if (!hero.resolveTestedThisQuest) {
    return { campaign, result: null, skippedReason: '尚未完成 Resolve Test，不应触发 Heart Attack' };
  }
  if (hero.stress < STRESS_MAX) {
    return { campaign, result: null, skippedReason: `Stress 未达到 ${STRESS_MAX}` };
  }

  const heartAttackCount = hero.heartAttackCount + 1;

  // 1) 死亡快照相关字段先固化（stress 固定为 10，保留 resolve 状态供死亡记录追溯）
  let next: CampaignState = {
    ...campaign,
    heroes: campaign.heroes.map((h) =>
      h.instanceId === hero.instanceId ? { ...h, stress: STRESS_MAX, heartAttackCount } : h
    ),
  };

  // 2) 精神事件
  const ev = pushMentalEvent(next, {
    questId: input.questId,
    heroId: hero.instanceId,
    type: 'heart-attack',
    sourceType: 'resolve-effect',
    sourceId: input.sourceEventId,
    amount: STRESS_MAX,
  });
  next = ev.campaign;

  // 3) 复用 Phase 6 统一死亡入口（内部已：dead/清 Death's Door/DeathRecord/替补排队/日志）
  const inBattle = !!next.battle && next.battle.heroes.some((u) => u.sourceId === hero.instanceId);
  next = killCampaignHero(next, {
    heroInstanceId: hero.instanceId,
    cause: 'heart-attack',
    source: inBattle ? 'battle' : next.gamePhase === 'hamlet' ? 'quest-result' : 'exploration',
    resumePhase: next.gamePhase === 'hamlet' ? 'hamlet' : 'dungeon-explore',
    questId: input.questId,
    roomId: next.dungeon?.currentRoomId,
    battleId: input.battleId ?? next.battle?.battleId,
    round: next.battle?.round,
  });

  const deathRecord = next.deathRecords[next.deathRecords.length - 1];

  // 4) 战斗中：同步 BattleUnit 死亡并标记 deathResolved，防 processBattleDeaths 二次结算
  if (inBattle && next.battle) {
    next = {
      ...next,
      battle: {
        ...next.battle,
        heroes: next.battle.heroes.map((u) =>
          u.sourceId === hero.instanceId
            ? {
                ...u,
                isAlive: false,
                hp: 0,
                atDeathsDoor: false,
                stress: STRESS_MAX,
                deathResolved: true,
                deathCause: 'heart-attack' as const,
              }
            : u
        ),
      },
    };
  }

  next = pushLog(
    next,
    `${hero.name} 的 Stress 再次达到 ${STRESS_MAX}，突发 Heart Attack 当场死亡！`,
    'danger'
  );

  return {
    campaign: next,
    result: {
      heroId: hero.instanceId,
      questId: input.questId,
      battleId: input.battleId ?? campaign.battle?.battleId,
      deathRecordId: deathRecord?.campaignHeroId === hero.instanceId ? deathRecord.id : undefined,
      heartAttackCount,
    },
  };
}
