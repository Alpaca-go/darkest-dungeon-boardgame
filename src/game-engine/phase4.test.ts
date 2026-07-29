import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CampaignState } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource } from './random';
import { resolveQuestResult, finishQuest, provisionsToGold } from './quest-result';
import {
  startHamletPhase,
  visitHamletBuilding,
  skipHeroAction,
  endHamletDay,
  canEndHamletDay,
  buildingVisitError,
} from './hamlet';
import { initBattle } from './battle';
import { saveCampaign, loadCampaign, clearCampaign } from './save';
import { HAMLET_BUILDINGS } from '../data/hamlet-buildings';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

/** 依次消费队列中的随机值，耗尽后回落到最后一个值。 */
function seqRng(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i++, values.length - 1)];
}

/** 进入地牢探索阶段的新战役。 */
function freshCampaign(questId = 'scout-ahead'): CampaignState {
  return selectQuest(
    applyDefaultLoadout(selectParty(createNewCampaign(), FOUR_HEROES)),
    questId
  );
}

/** 标记 Objective 完成。 */
function withObjective(c: CampaignState): CampaignState {
  return { ...c, dungeon: { ...c.dungeon!, objectiveComplete: true, roomsCleared: 2 } };
}

/** 已结算（completed）并停在 quest-result 阶段的战役。 */
function resolvedCampaign(): CampaignState {
  return finishQuest(withObjective(freshCampaign()), 'left');
}

/** 进入 Hamlet 阶段（默认 rng=0：事件 Supply Run 2 天，Caretaker 阻塞 sanitarium）。 */
function hamletCampaign(): CampaignState {
  return startHamletPhase(resolvedCampaign());
}

/** 将 Caretaker 阻塞建筑改为指定 id（便于测试其他建筑）。 */
function withBlocked(c: CampaignState, buildingId: string | null): CampaignState {
  return { ...c, hamlet: { ...c.hamlet, caretakerBlockedBuildingId: buildingId } };
}

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0);
});

afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// 一、Quest Result 判定与结算
// ---------------------------------------------------------------------------

describe('Quest Result 判定', () => {
  it('1. Objective 完成并离开 → completed', () => {
    const summary = resolveQuestResult(withObjective(freshCampaign()), 'left');
    expect(summary.outcome).toBe('completed');
    expect(summary.objectiveComplete).toBe(true);
    expect(summary.roomsCleared).toBe(2);
  });

  it('2. 未完成 Objective 主动离开 → incomplete', () => {
    const summary = resolveQuestResult(freshCampaign(), 'left');
    expect(summary.outcome).toBe('incomplete');
  });

  it('3. 英雄全灭 → failed（无论离开原因）', () => {
    const c = freshCampaign();
    const dead = { ...c, heroes: c.heroes.map((h) => ({ ...h, isAlive: false })) };
    expect(resolveQuestResult(dead, 'left').outcome).toBe('failed');
    expect(resolveQuestResult(dead, 'defeat').outcome).toBe('failed');
    // failed 或死亡时不获得 XP
    for (const h of resolveQuestResult(dead, 'defeat').heroes) {
      expect(h.xpGained).toBe(0);
    }
  });

  it('completed 时存活英雄获得 2 XP 并计入 completedQuestCount', () => {
    const c = finishQuest(withObjective(freshCampaign()), 'left');
    expect(c.completedQuestCount).toBe(1);
    for (const h of c.heroes) expect(h.xp).toBe(2);
    expect(c.gamePhase).toBe('quest-result');
    expect(c.lastQuestResult?.outcome).toBe('completed');
  });

  it('4. Quest 奖励不能重复领取（finishQuest 幂等）', () => {
    const once = finishQuest(withObjective(freshCampaign()), 'left');
    const twice = finishQuest(once, 'left');
    expect(twice.gold).toBe(once.gold);
    expect(twice.completedQuestCount).toBe(once.completedQuestCount);
    expect(twice.heroes.map((h) => h.xp)).toEqual(once.heroes.map((h) => h.xp));
    expect(twice).toBe(once); // 已结算时原样返回同一引用
  });

  it('5. 结算时 Light 重置为 5，BattleState 清除', () => {
    const c = { ...withObjective(freshCampaign()), light: 1 };
    const done = finishQuest(c, 'left');
    expect(done.light).toBe(5);
    expect(done.battle).toBeNull();
  });

  it('6. 未使用补给按每个 1 Gold 转换并清空', () => {
    const c = withObjective(freshCampaign());
    const expected = provisionsToGold(c.provisions); // 默认 4+2+2+4+2 = 14
    expect(expected).toBe(14);
    const done = finishQuest(c, 'left');
    expect(done.gold).toBe(c.gold + expected);
    expect(provisionsToGold(done.provisions)).toBe(0);
    expect(done.lastQuestResult?.provisionGold).toBe(expected);
  });
});

// ---------------------------------------------------------------------------
// 二、进入 Hamlet 与事件
// ---------------------------------------------------------------------------

describe('Hamlet Event', () => {
  it('startHamletPhase 单入口：清 dungeon/battle、抽事件、置天数、进入 hamlet', () => {
    const c = hamletCampaign();
    expect(c.gamePhase).toBe('hamlet');
    expect(c.dungeon).toBeNull();
    expect(c.battle).toBeNull();
    expect(c.hamlet.currentEventId).toBe('event-supply-run');
    expect(c.hamlet.preparationDays).toBe(2);
    expect(c.hamlet.currentDay).toBe(1);
    expect(c.hamlet.occupiedBuildingIds).toEqual([]);
    for (const h of c.heroes) expect(h.hasActedToday).toBe(false);
  });

  it('7. Hamlet 事件效果只执行一次（重复调用不叠加）', () => {
    // rng 0.9 → troubled-town（全队 Stress +2），随后 rng 0 选建筑
    setRandomSource(seqRng([0.9, 0]));
    const base = resolvedCampaign();
    const c = startHamletPhase(base);
    expect(c.hamlet.currentEventId).toBe('event-troubled-town');
    for (const h of c.heroes) {
      const before = base.heroes.find((x) => x.instanceId === h.instanceId)!;
      expect(h.stress).toBe(before.stress + 2);
    }
    // 已在 hamlet 阶段，再次调用被守卫拦截，效果不叠加
    const again = startHamletPhase(c);
    expect(again).toBe(c);
  });

  it('Supply Run 的补给奖励只作用于下一次任务并被清除', () => {
    const c = hamletCampaign(); // supply-run: nextQuestProvisionBonus = 1
    expect(c.hamlet.nextQuestProvisionBonus).toBe(1);
    const ended = endTwoDays(c);
    const next = selectQuest(ended, 'recover-relic');
    expect(next.provisions.food).toBe(5); // 4 + 1
    expect(next.hamlet.nextQuestProvisionBonus).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 三、Caretaker
// ---------------------------------------------------------------------------

describe('Caretaker', () => {
  it('8. 进入 Hamlet 时随机阻塞一个建筑', () => {
    const c = hamletCampaign();
    const ids = HAMLET_BUILDINGS.map((b) => b.id);
    expect(ids).toContain(c.hamlet.caretakerBlockedBuildingId);
    expect(c.hamlet.caretakerBlockedBuildingId).toBe('sanitarium'); // rng=0 → 第一个
  });

  it('9. 被阻塞建筑不能访问且不产生消费', () => {
    let c = hamletCampaign(); // sanitarium 被阻塞
    c = { ...c, heroes: c.heroes.map((h) => ({ ...h, wounds: 3 })) };
    const hero = c.heroes[0];
    expect(buildingVisitError(c, hero.instanceId, 'sanitarium')).toBe('Caretaker 阻塞了该建筑');
    const after = visitHamletBuilding(c, hero.instanceId, 'sanitarium');
    expect(after).toBe(c); // 原样返回，无消费
  });

  it('结束当天后 Caretaker 重新随机（注入不同随机值）', () => {
    let c = hamletCampaign(); // day1 阻塞 sanitarium
    for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
    setRandomSource(() => 0.8); // 下一天 pick index 3 → blacksmith
    c = endHamletDay(c);
    expect(c.hamlet.currentDay).toBe(2);
    expect(c.hamlet.caretakerBlockedBuildingId).toBe('blacksmith');
  });
});

// ---------------------------------------------------------------------------
// 四、建筑访问与每日行动
// ---------------------------------------------------------------------------

describe('Hamlet 建筑与每日行动', () => {
  it('10. 同一天同一建筑只能被一名英雄访问', () => {
    let c = withBlocked(hamletCampaign(), 'blacksmith');
    c = { ...c, heroes: c.heroes.map((h) => ({ ...h, stress: 5 })) };
    const [a, b] = c.heroes;
    c = visitHamletBuilding(c, a.instanceId, 'tavern');
    expect(c.hamlet.occupiedBuildingIds).toContain('tavern');
    expect(buildingVisitError(c, b.instanceId, 'tavern')).toBe('该建筑今天已被其他英雄占用');
    const after = visitHamletBuilding(c, b.instanceId, 'tavern');
    expect(after).toBe(c);
  });

  it('11. 每名英雄每天只能行动一次', () => {
    let c = withBlocked(hamletCampaign(), 'blacksmith');
    const hero = c.heroes[0];
    c = visitHamletBuilding(c, hero.instanceId, 'guild');
    expect(c.heroes[0].hasActedToday).toBe(true);
    expect(buildingVisitError(c, hero.instanceId, 'tavern')).toBe('该英雄今天已经行动过');
  });

  it('12. Gold 不足时不能访问建筑', () => {
    let c = withBlocked(hamletCampaign(), 'sanitarium');
    c = { ...c, gold: 1 };
    const hero = c.heroes[0];
    expect(buildingVisitError(c, hero.instanceId, 'guild')).toBe('Gold 不足');
    expect(visitHamletBuilding(c, hero.instanceId, 'guild')).toBe(c);
  });

  it('13. Sanitarium 治疗不超过 maxHp；HP 已满时不能使用', () => {
    let c = withBlocked(hamletCampaign(), 'blacksmith');
    // wounds=2 < 3：只恢复 2
    c = {
      ...c,
      heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, wounds: 2 } : h)),
    };
    const hero = c.heroes[0];
    // HP 已满的英雄不能使用（先在未占用状态下校验）
    expect(buildingVisitError(c, c.heroes[1].instanceId, 'sanitarium')).toBe(
      'HP 已满，无需治疗'
    );
    const after = visitHamletBuilding(c, hero.instanceId, 'sanitarium');
    expect(after.heroes[0].wounds).toBe(0); // 恢复到满，不溢出
  });

  it('14. Tavern 减压不低于 0；Stress 为 0 时不能使用', () => {
    let c = withBlocked(hamletCampaign(), 'blacksmith');
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 2 } : h)) };
    const [a, b] = c.heroes;
    // Stress 为 0 的英雄不能使用（先在未占用状态下校验）
    expect(buildingVisitError(c, b.instanceId, 'tavern')).toBe('Stress 已为 0');
    const after = visitHamletBuilding(c, a.instanceId, 'tavern');
    expect(after.heroes[0].stress).toBe(0); // 2-3 → 0，不为负
  });

  it('15. 建筑行动后 Gold 正确扣除并写入日志', () => {
    const c = withBlocked(hamletCampaign(), 'sanitarium');
    const hero = c.heroes[0];
    const after = visitHamletBuilding(c, hero.instanceId, 'guild');
    expect(after.gold).toBe(c.gold - 2);
    expect(after.heroes[0].xp).toBe(c.heroes[0].xp + 1);
    expect(after.hamlet.log.some((e) => e.message.includes('Guild'))).toBe(true);
  });

  it('16. 跳过行动：无消费、无效果、标记已行动', () => {
    const c = hamletCampaign();
    const hero = c.heroes[0];
    const after = skipHeroAction(c, hero.instanceId);
    expect(after.gold).toBe(c.gold);
    expect(after.heroes[0].hasActedToday).toBe(true);
    // 重复跳过无效
    expect(skipHeroAction(after, hero.instanceId)).toBe(after);
  });
});

// ---------------------------------------------------------------------------
// 五、结束当天与 preparation days
// ---------------------------------------------------------------------------

/** 全员跳过并结束两天（Supply Run 共 2 天）。 */
function endTwoDays(c0: CampaignState): CampaignState {
  let c = c0;
  for (let day = 0; day < 2; day += 1) {
    for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
    c = endHamletDay(c);
  }
  return c;
}

describe('结束当天与任务循环', () => {
  it('17. 所有存活英雄行动完才能结束当天', () => {
    let c = hamletCampaign();
    expect(canEndHamletDay(c)).toBe(false);
    expect(endHamletDay(c)).toBe(c); // 未满足时 no-op
    for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
    expect(canEndHamletDay(c)).toBe(true);
  });

  it('18. 结束当天后行动状态与占用建筑重置', () => {
    let c = withBlocked(hamletCampaign(), 'blacksmith');
    c = visitHamletBuilding(c, c.heroes[0].instanceId, 'guild');
    for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
    c = endHamletDay(c); // 还剩 1 天，进入第 2 天
    expect(c.gamePhase).toBe('hamlet');
    expect(c.hamlet.preparationDays).toBe(1);
    expect(c.hamlet.currentDay).toBe(2);
    expect(c.hamlet.occupiedBuildingIds).toEqual([]);
    for (const h of c.heroes) expect(h.hasActedToday).toBe(false);
  });

  it('19. preparationDays 归零后进入 quest-select', () => {
    const c = endTwoDays(hamletCampaign());
    expect(c.gamePhase).toBe('quest-select');
    expect(c.hamlet.preparationDays).toBe(0);
    expect(c.hamlet.caretakerBlockedBuildingId).toBeNull();
  });

  it('20. 返回任务选择后上一任务临时状态被清除', () => {
    const c = endTwoDays(hamletCampaign());
    expect(c.currentQuestId).toBeNull();
    expect(c.questStatus).toBe('none');
    expect(c.dungeon).toBeNull();
    expect(c.battle).toBeNull();
    expect(c.questResultResolved).toBe(false);
    expect(c.lastQuestResult).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// 六、存档恢复
// ---------------------------------------------------------------------------

describe('自动存档与恢复', () => {
  it('21. 刷新后可以恢复 Quest Result（含摘要）', () => {
    const c = resolvedCampaign();
    saveCampaign(c);
    const loaded = loadCampaign();
    expect(loaded?.gamePhase).toBe('quest-result');
    expect(loaded?.questResultResolved).toBe(true);
    expect(loaded?.lastQuestResult?.outcome).toBe('completed');
    expect(loaded?.lastQuestResult?.questName).toBe(c.lastQuestResult?.questName);
  });

  it('22. 刷新后可以恢复 Hamlet 当前天数与事件', () => {
    let c = hamletCampaign();
    for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
    c = endHamletDay(c); // 第 2 天
    saveCampaign(c);
    const loaded = loadCampaign();
    expect(loaded?.gamePhase).toBe('hamlet');
    expect(loaded?.hamlet.currentDay).toBe(2);
    expect(loaded?.hamlet.currentEventId).toBe('event-supply-run');
    expect(loaded?.hamlet.caretakerBlockedBuildingId).toBeTruthy();
  });
});

// ---------------------------------------------------------------------------
// 七、Blacksmith 加成与完整闭环
// ---------------------------------------------------------------------------

describe('Blacksmith 与完整任务循环', () => {
  it('23. Blacksmith 加成只对下一任务生效，任务结算后清零', () => {
    let c = withBlocked(hamletCampaign(), 'sanitarium');
    c = visitHamletBuilding(c, c.heroes[0].instanceId, 'blacksmith');
    expect(c.heroes[0].temporaryDamageBonus).toBe(1);
    for (const h of c.heroes.slice(1)) c = skipHeroAction(c, h.instanceId);
    c = endHamletDay(c);
    for (const h of c.heroes) c = skipHeroAction(c, h.instanceId);
    c = endHamletDay(c);
    expect(c.gamePhase).toBe('quest-select');
    // 加成带入下一任务的战斗单位
    c = selectQuest(c, 'recover-relic');
    expect(c.heroes[0].temporaryDamageBonus).toBe(1);
    const battle = initBattle(c, c.dungeon!.currentRoomId);
    const unit = battle.battle!.heroes.find(
      (u) => u.sourceId === c.heroes[0].instanceId
    )!;
    expect(unit.damageBonus).toBe(1);
    // 任务结算后清零，不永久叠加
    const done = finishQuest(withObjective(c), 'left');
    expect(done.heroes[0].temporaryDamageBonus).toBe(0);
  });

  it('24. 完整流程可运行两次任务而不发生状态污染', () => {
    // ---- 第一次任务 ----
    let c = freshCampaign('scout-ahead');
    const firstDungeonRooms = c.dungeon!.rooms.map((r) => r.id).join(',');
    c = finishQuest(withObjective(c), 'left');
    const goldAfterQuest1 = c.gold;
    const xpAfterQuest1 = c.heroes.map((h) => h.xp);
    expect(c.completedQuestCount).toBe(1);

    // ---- Hamlet ----
    c = startHamletPhase(c);
    c = endTwoDays(c);
    expect(c.gamePhase).toBe('quest-select');

    // ---- 第二次任务 ----
    c = selectQuest(c, 'recover-relic');
    expect(c.gamePhase).toBe('dungeon-explore');
    // 不继承上一任务的房间/怪物状态
    expect(c.dungeon!.questId).toBe('recover-relic');
    expect(c.dungeon!.roomsCleared).toBe(0);
    expect(c.dungeon!.objectiveComplete).toBe(false);
    expect(c.battle).toBeNull();
    expect(c.dungeon!.rooms.every((r) => r.status !== 'cleared')).toBe(true);
    expect(c.dungeon!.rooms.map((r) => r.id).join(',')).not.toBe(''); // 新地牢已生成
    void firstDungeonRooms;
    // Gold / XP / 完成计数正确继承
    expect(c.gold).toBe(goldAfterQuest1);
    expect(c.heroes.map((h) => h.xp)).toEqual(xpAfterQuest1);
    expect(c.completedQuestCount).toBe(1);

    // 第二次任务也能正常结算
    c = finishQuest(withObjective(c), 'left');
    expect(c.completedQuestCount).toBe(2);
    expect(c.questResultResolved).toBe(true);
  });
});
