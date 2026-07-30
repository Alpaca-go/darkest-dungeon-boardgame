// Phase 8C：英雄永久死亡时的 Trinket 转移（开发文档 §13）。
//
// 规则书：Hero dies → 同伴可立即拿走其 Trinket → 以 Positive Side 装备 → 无人接收则丢弃。
//
// 实现：
// - killCampaignHero 完成死亡记录后调用本函数（单一入口，battle / exploration 共用）；
// - 逐件从死亡英雄身上移除，按 acquiredAt → instanceId 稳定排序（§13.2）；
// - 每件创建 isDeathTransfer 的 PendingTrinketAllocation（复用原 instanceId）；
//   接收落地时 createTrinketInstance 强制 Positive（关键规则 3 / §13）；
// - 无存活候选 → acquireTrinket 内部走 discarded-no-candidate；
// - 幂等：sourceEventId = death-transfer:<deathRecordId>:<instanceId>，
//   且第二次调用时死亡英雄身上已无 Trinket，天然 no-op；
// - Replacement 必须等 hasPendingDeathTransfer() 清空（核心约束 8，由 store / UI 判定）。

import type { CampaignState, HeroTrinketState } from '../../types';
import { acquireTrinket } from './acquire-trinket';
import { updateHero } from './trinket-state';

/** §13.2：多件 Trinket 的稳定处理顺序。 */
export function sortTrinketsForDeathTransfer(list: HeroTrinketState[]): HeroTrinketState[] {
  return [...list].sort((a, b) => {
    if (a.acquiredAt !== b.acquiredAt) return a.acquiredAt < b.acquiredAt ? -1 : 1;
    return a.instanceId < b.instanceId ? -1 : 1;
  });
}

/**
 * 把死亡英雄的所有 Trinket 转入死亡转移分配队列。
 * 前置：英雄已被标记 dead（killCampaignHero 之后调用）。
 */
export function transferDeadHeroTrinkets(
  campaign: CampaignState,
  deadHeroInstanceId: string
): CampaignState {
  const hero = campaign.heroes.find((h) => h.instanceId === deadHeroInstanceId);
  if (!hero || !hero.dead) return campaign;

  const trinkets = sortTrinketsForDeathTransfer(hero.equippedTrinkets ?? []);
  if (trinkets.length === 0) return campaign;

  // 1) 一次性从死亡英雄身上移除全部 Trinket
  let next = updateHero(campaign, hero.instanceId, (h) => ({ ...h, equippedTrinkets: [] }));

  // 2) 逐件进入死亡转移分配（稳定顺序 = 队列顺序，UI 先进先出）
  const deathKey = hero.deathRecordId ?? hero.instanceId;
  for (const t of trinkets) {
    const out = acquireTrinket(next, {
      trinketId: t.trinketId,
      source: 'death-transfer',
      sourceEventId: `death-transfer:${deathKey}:${t.instanceId}`,
      questId: campaign.currentQuestId ?? null,
      fromHeroId: hero.instanceId,
      fromHeroName: hero.name,
      isDeathTransfer: true,
      instanceId: t.instanceId,
    });
    next = out.campaign;
  }
  return next;
}
