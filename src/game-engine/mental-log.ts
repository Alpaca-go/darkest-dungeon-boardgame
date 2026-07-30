// Phase 7：精神事件队列与 Battle/Campaign 精神状态同步工具。
// 供 stress.ts / resolve-test.ts / heart-attack.ts / mental-effects.ts 共用，
// 避免三个模块间循环依赖。

import type { CampaignState, MentalEvent, MentalEventSourceType, MentalEventType } from '../types';
import { createId, nowIso } from './random';

/** 精神事件队列上限（与 GameLog 一致，防存档膨胀）。 */
export const MENTAL_EVENT_LIMIT = 200;

export interface PushMentalEventInput {
  questId: string;
  heroId: string;
  type: MentalEventType;
  sourceType: MentalEventSourceType;
  sourceId?: string;
  amount?: number;
  roll?: number;
  resultId?: string;
}

/** 追加一条精神事件（不可变更新），返回新战役与事件本体。 */
export function pushMentalEvent(
  campaign: CampaignState,
  input: PushMentalEventInput
): { campaign: CampaignState; event: MentalEvent } {
  const event: MentalEvent = {
    id: createId('mev'),
    createdAt: nowIso(),
    sequence:
      (campaign.mentalEvents.length > 0
        ? campaign.mentalEvents[campaign.mentalEvents.length - 1].sequence
        : 0) + 1,
    ...input,
  };
  const next = [...campaign.mentalEvents, event];
  const trimmed = next.length > MENTAL_EVENT_LIMIT ? next.slice(next.length - MENTAL_EVENT_LIMIT) : next;
  return {
    campaign: {
      ...campaign,
      mentalEvents: trimmed,
      heroes: campaign.heroes.map((h) =>
        h.instanceId === input.heroId ? { ...h, lastMentalEventId: event.id } : h
      ),
    },
    event,
  };
}

/**
 * 将某英雄的精神状态（stress / resolveState / virtueId / afflictionId /
 * resolveTestedThisQuest）从 CampaignHero 同步到进行中的 BattleUnit。
 * 无战斗或英雄不在战斗中时原样返回。
 * 禁止出现 BattleUnit 与 CampaignHero stress 不一致导致刷新后重复 Resolve Test。
 */
export function syncHeroMentalToBattle(campaign: CampaignState, heroInstanceId: string): CampaignState {
  const b = campaign.battle;
  if (!b) return campaign;
  const hero = campaign.heroes.find((h) => h.instanceId === heroInstanceId);
  if (!hero) return campaign;
  let changed = false;
  const heroes = b.heroes.map((u) => {
    if (u.sourceId !== heroInstanceId) return u;
    if (
      u.stress === hero.stress &&
      u.resolveState === hero.resolveState &&
      u.virtueId === hero.virtueId &&
      u.afflictionId === hero.afflictionId &&
      u.resolveTestedThisQuest === hero.resolveTestedThisQuest
    ) {
      return u;
    }
    changed = true;
    return {
      ...u,
      stress: hero.stress,
      resolveState: hero.resolveState,
      virtueId: hero.virtueId,
      afflictionId: hero.afflictionId,
      resolveTestedThisQuest: hero.resolveTestedThisQuest,
    };
  });
  if (!changed) return campaign;
  return { ...campaign, battle: { ...b, heroes } };
}
