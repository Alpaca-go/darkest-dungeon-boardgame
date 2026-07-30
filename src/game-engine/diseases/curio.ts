// Phase 8B：Curio 互动（Disease 感染来源之一）。
//
// 约定：
// - 每个房间的 Curio 只能互动一次（room.curioUsed）；
// - 互动必须由玩家选定英雄（谁搜查谁承担风险）；
// - 感染统一走 acquireDisease，随机结果在引擎内产生（核心约束 8：UI 不生成随机结果）。

import type { CampaignState } from '../../types';
import { getCurioById } from '../../data/curios';
import { createId, d10 } from '../random';
import { pushLog } from '../log';
import { acquireDisease } from './acquire-disease';

export interface CurioInteractionResult {
  campaign: CampaignState;
  error: string | null;
}

/** 校验能否互动（null = 可以）。 */
export function curioInteractionError(
  campaign: CampaignState,
  heroInstanceId: string
): string | null {
  if (campaign.gamePhase !== 'dungeon-explore') return '当前不在地牢探索阶段';
  const dungeon = campaign.dungeon;
  if (!dungeon) return '不在地牢中';
  const room = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId);
  if (!room) return '当前房间不存在';
  if (!room.curioId) return '该房间没有可互动物件';
  if (room.curioUsed) return '该物件已被搜查过';
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero || hero.dead) return '英雄不可用';
  return null;
}

/**
 * 英雄与当前房间的 Curio 互动。
 * 非法互动原样返回（不消耗 curioUsed，也不产生任何副作用）。
 */
export function interactWithCurio(
  campaign: CampaignState,
  heroInstanceId: string
): CurioInteractionResult {
  const error = curioInteractionError(campaign, heroInstanceId);
  if (error) return { campaign, error };

  const dungeon = campaign.dungeon!;
  const room = dungeon.rooms.find((r) => r.id === dungeon.currentRoomId)!;
  const curio = getCurioById(room.curioId);
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId)!;
  if (!curio) return { campaign, error: '物件数据缺失' };

  // 先标记已使用（无论结果如何都不可重复搜查）
  let next: CampaignState = {
    ...campaign,
    dungeon: {
      ...dungeon,
      rooms: dungeon.rooms.map((r) => (r.id === room.id ? { ...r, curioUsed: true } : r)),
    },
  };
  next = pushLog(next, `${hero.name} 搜查了 ${curio.name}。`, 'info');

  switch (curio.effect.kind) {
    case 'gold': {
      next = { ...next, gold: next.gold + curio.effect.amount };
      return {
        campaign: pushLog(next, `${curio.name}：获得 ${curio.effect.amount} Gold。`, 'success'),
        error: null,
      };
    }
    case 'disease-guaranteed': {
      next = pushLog(next, `${curio.name}：${hero.name} 必定被感染！`, 'danger');
      return {
        campaign: acquireDisease(next, {
          heroId: hero.instanceId,
          diseaseId: curio.effect.diseaseId,
          source: 'curio',
          sourceEventId: createId('dcur'),
          questId: next.currentQuestId,
          deathSource: 'exploration',
          deathResumePhase: 'dungeon-explore',
        }).campaign,
        error: null,
      };
    }
    case 'disease-chance': {
      const roll = d10();
      if (roll > curio.effect.d10AtMost) {
        return {
          campaign: pushLog(
            next,
            `${curio.name}：${hero.name} 掷出 ${roll}（>${curio.effect.d10AtMost}）—— ${curio.effect.safeMessage}`,
            'success'
          ),
          error: null,
        };
      }
      next = pushLog(
        next,
        `${curio.name}：${hero.name} 掷出 ${roll}（≤${curio.effect.d10AtMost}），被感染！`,
        'danger'
      );
      return {
        campaign: acquireDisease(next, {
          heroId: hero.instanceId,
          diseaseId: curio.effect.diseaseId,
          source: 'curio',
          sourceEventId: createId('dcur'),
          questId: next.currentQuestId,
          deathSource: 'exploration',
          deathResumePhase: 'dungeon-explore',
        }).campaign,
        error: null,
      };
    }
    default:
      return { campaign: next, error: null };
  }
}
