// Phase 7 单元测试：Stress、Resolve Test、Virtue/Affliction、Heart Attack、
// Quest 结束 Quirk 转换、存档迁移 v3→v4、战斗压力事件与回合开始精神效果。
// 随机源统一通过 setRandomSource 注入（可回放）。

import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { BattleStressEvent, CampaignState } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource } from './random';
import { applyStress, applyStressBatch, recoverStress, STRESS_MAX } from './stress';
import { performResolveTest } from './resolve-test';
import { triggerHeartAttack } from './heart-attack';
import {
  convertResolveStatesAtQuestEnd,
  resetMentalStateForNewQuest,
  hasConversionRecord,
} from './resolve-conversion';
import { resolveTurnStartMentalEffect, processBattleStressEvents } from './mental-effects';
import { initBattle, resumeTurnAfterMentalCheck, battleTurnKey } from './battle';
import { finishQuest } from './quest-result';
import { migrateSaveFile, SAVE_VERSION, clearCampaign } from './save';
import { VIRTUES } from '../data/virtues';
import { AFFLICTIONS } from '../data/afflictions';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

/** 已进入地牢探索的新战役。 */
function freshCampaign(questId = 'scout-ahead'): CampaignState {
  return selectQuest(applyDefaultLoadout(selectParty(createNewCampaign(), FOUR_HEROES)), questId);
}

/** 顺序消耗的固定随机源（值域 [0,1)，耗尽后重复最后一个）。 */
function seq(values: number[]): () => number {
  let i = 0;
  return () => values[Math.min(i, values.length - 1)] ?? (i++, 0);
}
function seqAdvance(values: number[]): () => number {
  let i = 0;
  return () => {
    const v = values[Math.min(i, values.length - 1)];
    i += 1;
    return v;
  };
}

/** d10 掷出 r（1..10）所需的随机值。 */
const roll = (r: number): number => (r - 1) / 10;

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0);
});
afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// 一、统一压力管线 applyStress / recoverStress
// ---------------------------------------------------------------------------

describe('applyStress / recoverStress 统一管线', () => {
  it('1. 加压钳制在 0-10，amount<=0 无效', () => {
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    const out1 = applyStress(c, { heroId: id, amount: 3, sourceType: 'debug', questId: 'q' });
    c = out1.campaign;
    expect(c.heroes[0].stress).toBe(3);
    expect(out1.result.appliedAmount).toBe(3);
    const out2 = applyStress(c, { heroId: id, amount: 0, sourceType: 'debug', questId: 'q' });
    expect(out2.campaign.heroes[0].stress).toBe(3);
    expect(out2.result.appliedAmount).toBe(0);
    const out3 = applyStress(c, { heroId: id, amount: -5, sourceType: 'debug', questId: 'q' });
    expect(out3.campaign.heroes[0].stress).toBe(3);
  });

  it('2. dead hero 不接受任何 Stress 变化', () => {
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, dead: true, isAlive: false, stress: 4 } : h)) };
    const out = applyStress(c, { heroId: id, amount: 3, sourceType: 'debug', questId: 'q' });
    expect(out.campaign.heroes[0].stress).toBe(4);
    expect(out.result.appliedAmount).toBe(0);
    const out2 = recoverStress(c, { heroId: id, amount: 3, sourceType: 'debug', questId: 'q' });
    expect(out2.campaign.heroes[0].stress).toBe(4);
  });

  it('3. recoverStress 下限 0，不撤销 Virtue、不重置 resolveTestedThisQuest', () => {
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    c = {
      ...c,
      heroes: c.heroes.map((h, i) =>
        i === 0
          ? { ...h, stress: 2, resolveState: 'virtuous' as const, virtueId: 'focused', resolveTestedThisQuest: true }
          : h
      ),
    };
    const out = recoverStress(c, { heroId: id, amount: 5, sourceType: 'debug', questId: 'q' });
    const hero = out.campaign.heroes[0];
    expect(hero.stress).toBe(0);
    expect(hero.resolveState).toBe('virtuous');
    expect(hero.virtueId).toBe('focused');
    expect(hero.resolveTestedThisQuest).toBe(true);
  });

  it('4. batchId 幂等：同批次同英雄只处理一次', () => {
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    const input = { heroId: id, amount: 2, sourceType: 'debug' as const, questId: 'q', batchId: 'B1' };
    c = applyStress(c, input).campaign;
    c = applyStress(c, input).campaign; // 重复调用
    expect(c.heroes[0].stress).toBe(2);
  });

  it('5. applyStressBatch 按英雄合并后只结算一次阈值', () => {
    setRandomSource(seqAdvance([roll(1), 0])); // Resolve Test roll=1 → Virtue，pick 第一张
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 6 } : h)) };
    // 两个来源各 +2：合并为 +4 → 10，只触发一次 Resolve Test
    const { campaign: next, results } = applyStressBatch(c, [
      { heroId: id, amount: 2, sourceType: 'debug', questId: 'q', batchId: 'B2' },
      { heroId: id, amount: 2, sourceType: 'debug', questId: 'q', batchId: 'B2' },
    ]);
    expect(results).toHaveLength(1);
    expect(results[0].thresholdReached).toBe(true);
    const hero = next.heroes[0];
    expect(hero.resolveTestedThisQuest).toBe(true);
    expect(hero.stress).toBe(0); // Resolve 后重置
    const testEvents = next.mentalEvents.filter((e) => e.type === 'resolve-test');
    expect(testEvents).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 二、Resolve Test
// ---------------------------------------------------------------------------

describe('Resolve Test', () => {
  it('6. roll <= 2 获得 Virtue；状态与事件正确', () => {
    setRandomSource(seqAdvance([roll(2), 0])); // d10=2 → Virtue；pick VIRTUES[0]
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 10 } : h)) };
    const { campaign: next, result } = performResolveTest(c, id);
    expect(result).not.toBeNull();
    expect(result!.outcome).toBe('virtue');
    expect(result!.roll).toBe(2);
    const hero = next.heroes[0];
    expect(hero.resolveState).toBe('virtuous');
    expect(hero.virtueId).toBe(VIRTUES[0].id);
    expect(hero.afflictionId).toBeNull();
    expect(hero.stress).toBe(0);
    expect(hero.resolveTestedThisQuest).toBe(true);
    expect(next.mentalEvents.some((e) => e.type === 'virtue-gained')).toBe(true);
  });

  it('7. roll >= 3 获得 Affliction', () => {
    setRandomSource(seqAdvance([roll(7), 0])); // d10=7 → Affliction；pick AFFLICTIONS[0]
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 10 } : h)) };
    const { campaign: next, result } = performResolveTest(c, id);
    expect(result!.outcome).toBe('affliction');
    const hero = next.heroes[0];
    expect(hero.resolveState).toBe('afflicted');
    expect(hero.afflictionId).toBe(AFFLICTIONS[0].id);
    expect(next.mentalEvents.some((e) => e.type === 'affliction-gained')).toBe(true);
  });

  it('8. 前置条件不满足时跳过：stress<10 / 已测过 / 死亡', () => {
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    expect(performResolveTest(c, id).skippedReason).toContain('Stress');
    let c2 = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 10, resolveTestedThisQuest: true } : h)) };
    expect(performResolveTest(c2, id).skippedReason).toContain('已进行过');
    let c3 = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 10, dead: true, isAlive: false } : h)) };
    expect(performResolveTest(c3, id).skippedReason).toContain('死亡');
  });

  it('9. applyStress 到 10 自动触发 Resolve Test（阈值只在跨越时触发一次）', () => {
    setRandomSource(seqAdvance([roll(1), 0]));
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, stress: 8 } : h)) };
    const out = applyStress(c, { heroId: id, amount: 5, sourceType: 'debug', questId: 'q' });
    expect(out.result.thresholdReached).toBe(true);
    expect(out.result.resolveTest).toBeDefined();
    expect(out.campaign.heroes[0].stress).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// 三、Heart Attack
// ---------------------------------------------------------------------------

describe('Heart Attack', () => {
  it('10. 已 Resolve 过的英雄 Stress 再达 10 → 立即死亡（绕过 Death\u0027s Door）', () => {
    let c = freshCampaign();
    const id = c.heroes[0].instanceId;
    c = {
      ...c,
      heroes: c.heroes.map((h, i) =>
        i === 0 ? { ...h, stress: 9, resolveTestedThisQuest: true, resolveState: 'afflicted' as const, afflictionId: 'fearful' } : h
      ),
    };
    const out = applyStress(c, { heroId: id, amount: 1, sourceType: 'debug', questId: 'q' });
    const hero = out.campaign.heroes[0];
    expect(out.result.heartAttack).toBeDefined();
    expect(hero.dead).toBe(true);
    expect(hero.isAlive).toBe(false);
    expect(hero.atDeathsDoor).toBe(false); // 不进入 Death's Door
    expect(hero.heartAttackCount).toBe(1);
    expect(out.campaign.mentalEvents.some((e) => e.type === 'heart-attack')).toBe(true);
  });

  it('11. triggerHeartAttack 前置校验：未 Resolve 过 / 未到 10 均跳过', () => {
    const c = freshCampaign();
    const id = c.heroes[0].instanceId;
    const out = triggerHeartAttack(c, { heroInstanceId: id, questId: 'q' });
    expect(out.result).toBeNull();
    expect(out.skippedReason).toBeTruthy();
    expect(out.campaign.heroes[0].dead).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 四、Quest 结束 Quirk 转换与新 Quest 重置
// ---------------------------------------------------------------------------

describe('Quest 结束转换与重置', () => {
  function virtuousCampaign(): CampaignState {
    const c = freshCampaign();
    return {
      ...c,
      heroes: c.heroes.map((h, i) =>
        i === 0
          ? { ...h, resolveState: 'virtuous' as const, virtueId: 'focused', resolveTestedThisQuest: true }
          : i === 1
            ? { ...h, resolveState: 'afflicted' as const, afflictionId: 'fearful', resolveTestedThisQuest: true }
            : h
      ),
    };
  }

  it('12. Virtue → 正面 Quirk，Affliction → 负面 Quirk，状态清空', () => {
    const c = virtuousCampaign();
    const next = convertResolveStatesAtQuestEnd(c);
    const h0 = next.heroes[0];
    const h1 = next.heroes[1];
    expect(h0.resolveState).toBe('normal');
    expect(h0.virtueId).toBeNull();
    expect(h0.positiveQuirkIds).toHaveLength(1);
    expect(h1.resolveState).toBe('normal');
    expect(h1.negativeQuirkIds).toHaveLength(1);
    expect(next.resolveConversionRecords).toHaveLength(2);
    expect(hasConversionRecord(next, next.currentQuestId!, h0.instanceId, 'focused')).toBe(true);
    expect(next.mentalEvents.filter((e) => e.type === 'resolve-converted-to-quirk')).toHaveLength(2);
  });

  it('13. 转换幂等：重复调用不再二次发放', () => {
    const c = virtuousCampaign();
    const once = convertResolveStatesAtQuestEnd(c);
    const twice = convertResolveStatesAtQuestEnd(once);
    expect(twice.heroes[0].positiveQuirkIds).toHaveLength(1);
    expect(twice.resolveConversionRecords).toHaveLength(2);
  });

  it('14. dead hero 不转换', () => {
    let c = virtuousCampaign();
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, dead: true, isAlive: false } : h)) };
    const next = convertResolveStatesAtQuestEnd(c);
    expect(next.heroes[0].positiveQuirkIds).toHaveLength(0);
    expect(next.resolveConversionRecords).toHaveLength(1); // 只有 afflicted 的那位
  });

  it('15. finishQuest 集成转换（applyQuestRewards 内部调用）', () => {
    let c = virtuousCampaign();
    c = { ...c, dungeon: { ...c.dungeon!, objectiveComplete: true } };
    const next = finishQuest(c, 'left');
    expect(next.heroes[0].resolveState).toBe('normal');
    expect(next.heroes[0].positiveQuirkIds).toHaveLength(1);
  });

  it('16. 新 Quest 重置 resolveTestedThisQuest 与批次键；selectQuest 集成', () => {
    let c = virtuousCampaign();
    c = { ...c, processedStressBatchIds: ['B1:x'] };
    const reset = resetMentalStateForNewQuest(c);
    expect(reset.heroes[0].resolveTestedThisQuest).toBe(false);
    expect(reset.processedStressBatchIds).toHaveLength(0);
    // selectQuest 集成（quest-result → 新任务）
    let done = convertResolveStatesAtQuestEnd(c);
    done = { ...done, gamePhase: 'quest-select' as const };
    const next = selectQuest(done, 'scout-ahead');
    expect(next.heroes.every((h) => !h.resolveTestedThisQuest)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// 五、存档迁移 v3 → v4
// ---------------------------------------------------------------------------

describe('存档迁移 v3 → v4', () => {
  it('17. 老英雄补齐精神字段，stress 钳制 0-10，campaign 补齐数组', () => {
    const modern = freshCampaign();
    // 构造 v3 战役：删除 Phase 7 字段，stress 越界
    const legacyHeroes = modern.heroes.map((h) => {
      const {
        resolveTestedThisQuest, resolveState, virtueId, afflictionId, heartAttackCount,
        positiveQuirkIds, negativeQuirkIds, lastResolveQuestId, lastMentalEventId,
        ...rest
      } = h as Record<string, unknown> & typeof h;
      return { ...rest, stress: 15 };
    });
    const {
      mentalEvents, resolveConversionRecords, processedStressBatchIds,
      ...campaignRest
    } = modern as Record<string, unknown> & typeof modern;
    const legacyCampaign = { ...campaignRest, saveVersion: 3, heroes: legacyHeroes };
    const legacyFile = {
      version: 3,
      savedAt: new Date().toISOString(),
      gamePhase: modern.gamePhase,
      campaign: legacyCampaign,
      dungeon: modern.dungeon,
      battle: null,
      questResult: null,
      hamlet: modern.hamlet,
    };
    const migrated = migrateSaveFile(legacyFile);
    expect(migrated).not.toBeNull();
    expect(migrated!.version).toBe(SAVE_VERSION);
    const c = migrated!.campaign;
    expect(c.saveVersion).toBe(4);
    expect(c.mentalEvents).toEqual([]);
    expect(c.resolveConversionRecords).toEqual([]);
    expect(c.processedStressBatchIds).toEqual([]);
    for (const h of c.heroes) {
      expect(h.stress).toBeLessThanOrEqual(STRESS_MAX);
      expect(h.stress).toBeGreaterThanOrEqual(0);
      expect(h.resolveState).toBe('normal');
      expect(h.resolveTestedThisQuest).toBe(false);
      expect(h.heartAttackCount).toBe(0);
      expect(h.positiveQuirkIds).toEqual([]);
      expect(h.negativeQuirkIds).toEqual([]);
    }
  });
});

// ---------------------------------------------------------------------------
// 六、战斗集成：压力事件队列与回合开始精神效果
// ---------------------------------------------------------------------------

describe('战斗压力事件与精神效果', () => {
  function battleCampaign(): CampaignState {
    const c = freshCampaign();
    const room = c.dungeon!.rooms.find((r) => r.type === 'battle') ?? c.dungeon!.rooms[1];
    return initBattle(c, room.id);
  }

  it('18. processBattleStressEvents：正数走 applyStress、负数走 recoverStress、事件 id 幂等', () => {
    let c = battleCampaign();
    const b = c.battle!;
    const heroUnit = b.heroes[0];
    const heroId = heroUnit.sourceId;
    c = { ...c, heroes: c.heroes.map((h) => (h.instanceId === heroId ? { ...h, stress: 5 } : h)) };
    const events: BattleStressEvent[] = [
      { id: 'ev1', heroInstanceId: heroId, amount: 2, sourceType: 'battle-skill', sourceId: 's1' },
      { id: 'ev2', heroInstanceId: heroId, amount: -1, sourceType: 'battle-skill', sourceId: 's2' },
    ];
    c = { ...c, battle: { ...c.battle!, pendingStressEvents: events } };
    let next = processBattleStressEvents(c);
    expect(next.heroes.find((h) => h.instanceId === heroId)!.stress).toBe(6); // 5+2-1
    expect(next.battle!.pendingStressEvents).toHaveLength(0);
    // 幂等：把同 id 事件再放回去重放，applyStress 批次键拦截（recover 无阈值风险可重复，
    // 这里只验证正数事件不会重复叠加）
    next = { ...next, battle: { ...next.battle!, pendingStressEvents: [events[0]] } };
    next = processBattleStressEvents(next);
    expect(next.heroes.find((h) => h.instanceId === heroId)!.stress).toBe(6);
  });

  it('19. 回合开始精神效果：触发 → 执行效果并记录 turnId；同回合不重复检定', () => {
    let c = battleCampaign();
    let b = c.battle!;
    const unit = b.heroes[0];
    const heroId = unit.sourceId;
    // 英雄处于 Affliction fearful（触发区间 1-2：stress-self +2）
    c = {
      ...c,
      heroes: c.heroes.map((h) =>
        h.instanceId === heroId
          ? { ...h, stress: 0, resolveState: 'afflicted' as const, afflictionId: 'fearful', resolveTestedThisQuest: true }
          : h
      ),
    };
    b = {
      ...c.battle!,
      activeActorId: unit.id,
      initiativeOrder: [unit.id, ...c.battle!.initiativeOrder.filter((x) => x !== unit.id)],
      initiativeIndex: 0,
      pendingMentalCheck: true,
      heroes: c.battle!.heroes.map((u) =>
        u.id === unit.id
          ? { ...u, resolveState: 'afflicted' as const, afflictionId: 'fearful', resolveTestedThisQuest: true, stress: 0 }
          : u
      ),
    };
    c = { ...c, battle: b };

    setRandomSource(seq([roll(1)])); // d10=1 → 触发 fearful
    const out = resolveTurnStartMentalEffect(c);
    expect(out.checked).toBe(true);
    expect(out.triggered).toBe(true);
    expect(out.cardId).toBe('fearful');
    const hero = out.campaign.heroes.find((h) => h.instanceId === heroId)!;
    expect(hero.stress).toBe(2); // fearful: stress-self +2
    const turnKey = battleTurnKey(b.battleId, b.round, 0, unit.id);
    const updatedUnit = out.campaign.battle!.heroes.find((u) => u.id === unit.id)!;
    expect(updatedUnit.mentalEffectResolvedTurnId).toBe(turnKey);
    // 同回合再次调用 → 不重复检定
    const again = resolveTurnStartMentalEffect(out.campaign);
    expect(again.checked).toBe(false);
    // 恢复回合：授予行动点、清除 pendingMentalCheck
    const resumed = resumeTurnAfterMentalCheck(out.campaign.battle!);
    expect(resumed.pendingMentalCheck).toBe(false);
    expect(resumed.currentActionPoints).toBe(2);
  });

  it('20. 未触发（roll 超出区间）→ 记录 missed 事件，无效果', () => {
    let c = battleCampaign();
    let b = c.battle!;
    const unit = b.heroes[0];
    const heroId = unit.sourceId;
    c = {
      ...c,
      heroes: c.heroes.map((h) =>
        h.instanceId === heroId
          ? { ...h, resolveState: 'afflicted' as const, afflictionId: 'fearful', resolveTestedThisQuest: true }
          : h
      ),
    };
    b = {
      ...c.battle!,
      activeActorId: unit.id,
      initiativeOrder: [unit.id, ...c.battle!.initiativeOrder.filter((x) => x !== unit.id)],
      initiativeIndex: 0,
      pendingMentalCheck: true,
      heroes: c.battle!.heroes.map((u) =>
        u.id === unit.id ? { ...u, resolveState: 'afflicted' as const, afflictionId: 'fearful' } : u
      ),
    };
    c = { ...c, battle: b };
    setRandomSource(seq([roll(9)])); // fearful 区间 1-2，roll 9 未触发
    const out = resolveTurnStartMentalEffect(c);
    expect(out.checked).toBe(true);
    expect(out.triggered).toBe(false);
    expect(out.campaign.heroes.find((h) => h.instanceId === heroId)!.stress).toBe(0);
    expect(out.campaign.mentalEvents.some((e) => e.type === 'resolve-effect-missed')).toBe(true);
  });

  it('21. Stalwart 负数效果路由到 recoverStress（stress 不会击穿 0）', () => {
    let c = battleCampaign();
    let b = c.battle!;
    const unit = b.heroes[0];
    const heroId = unit.sourceId;
    c = {
      ...c,
      heroes: c.heroes.map((h) =>
        h.instanceId === heroId
          ? { ...h, stress: 1, resolveState: 'virtuous' as const, virtueId: 'stalwart', resolveTestedThisQuest: true }
          : h
      ),
    };
    b = {
      ...c.battle!,
      activeActorId: unit.id,
      initiativeOrder: [unit.id, ...c.battle!.initiativeOrder.filter((x) => x !== unit.id)],
      initiativeIndex: 0,
      pendingMentalCheck: true,
      heroes: c.battle!.heroes.map((u) =>
        u.id === unit.id ? { ...u, stress: 1, resolveState: 'virtuous' as const, virtueId: 'stalwart' } : u
      ),
    };
    c = { ...c, battle: b };
    setRandomSource(seq([roll(2)])); // stalwart 区间 1-3 → 触发 stress-self -2
    const out = resolveTurnStartMentalEffect(c);
    expect(out.triggered).toBe(true);
    expect(out.campaign.heroes.find((h) => h.instanceId === heroId)!.stress).toBe(0); // 1-2 → 0（下限）
    expect(out.campaign.mentalEvents.some((e) => e.type === 'stress-recovered')).toBe(true);
  });
});
