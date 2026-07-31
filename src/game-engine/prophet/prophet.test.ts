// Phase 9C §21：Prophet / Wooden Pews 单元测试（覆盖 49 项验收点）。

import { describe, expect, it } from 'vitest';
import type {
  ActionOrdinal,
  DelayedAreaHazardState,
  ProphetRoomDefinition,
  RandomSource,
} from '../../types/prophet';
import {
  PROPHET_ACTIONS_PER_ROUND,
  PROPHET_ACTION_OVERRIDES,
  PROPHET_FAMILY_ID,
  PROPHET_OFFICIAL_LEVEL_IDS,
  PROPHET_OFFICIAL_ROOM_LEVEL_1,
  PROPHET_PEW_COUNT,
  PROPHET_PROTOTYPE_BOSS,
  PROPHET_PROTOTYPE_RUBBLE_ID,
  PROPHET_PROTOTYPE_BOSS_ID,
  PROPHET_PROTOTYPE_ROOM,
  getProphetDefinition,
  getProphetOfficialDataGaps,
  getProphetRoomDefinition,
  getProphetThreat,
  getProphetNormalSkillTable,
  isProphetOfficialBattleEnabled,
  resolveProphetActionSkillId,
  validateProphetFamily,
  validateRoomMap,
} from '../../data/bosses/prophet-family';
import {
  type AreaAttackPipeline,
  type AreaOccupant,
  beginProphetRound,
  canEnterArea,
  clearAllPews,
  clearResolvedPews,
  countPewsInArea,
  createProphetBattleRuntime,
  createProphetInitiativeCards,
  createSeededRng,
  formatPlacementLog,
  formatRubbleLog,
  getAreaOccupancy,
  getProphetActionSemantics,
  hashRoomDefinition,
  migrateProphetSave,
  repairProphetRuntime,
  resolveActiveRoomDefinition,
  resolveAreaAttackTargets,
  resolveBossActionByOrdinal,
  resolveProphetPewPlacement,
  resolveProphetRubbleOfRuin,
  resolveProphetSecondAction,
  resolveProphetVictory,
  rollD10,
  selectTargetableActorIds,
} from './runtime';

// ---------------------------------------------------------------------------
// 测试工具：脚本化 RNG（把期望的 d10 点数直接排好队）
// ---------------------------------------------------------------------------
function scriptedRng(rolls: number[]): RandomSource {
  let i = 0;
  return () => {
    const r = rolls[i % rolls.length];
    i++;
    return (r - 1) / 10 + 0.001;
  };
}

const OCCUPANTS: AreaOccupant[] = [
  { actorId: 'hero-1', areaId: 'prototype-area-b', targetable: true },
  { actorId: 'hero-2', areaId: 'prototype-area-d', targetable: true },
  { actorId: 'hero-3', areaId: 'prototype-area-e', targetable: true },
];

/** 掷出 3 / 7 / 3 / 9 → Area B、D、B、E（B 落两个 Pew）。 */
function placeStandard() {
  const runtime = createProphetBattleRuntime('prophet-actor');
  return resolveProphetPewPlacement({
    battleId: 'battle-1',
    round: 1,
    initiativeCardId: 'card-1',
    ordinal: 1,
    prophetAlive: true,
    runtime,
    rng: scriptedRng([3, 7, 3, 9]),
  });
}

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — Registry / Room / Data Gate（1-7）', () => {
  it('1. Prophet Family ID 正确', () => {
    expect(PROPHET_FAMILY_ID).toBe('prophet');
    expect(PROPHET_OFFICIAL_LEVEL_IDS).toEqual([
      'prophet-level-1',
      'prophet-level-2',
      'prophet-level-3',
    ]);
  });

  it('2. actionsPerRound = 3', () => {
    expect(PROPHET_ACTIONS_PER_ROUND).toBe(3);
    expect(PROPHET_PROTOTYPE_BOSS.actionsPerRound).toBe(3);
  });

  it('3. Prototype Room Map 完整覆盖 1—10', () => {
    const v = validateRoomMap(PROPHET_PROTOTYPE_ROOM);
    expect(v.isComplete).toBe(true);
    for (let r = 1; r <= 10; r++) {
      expect(PROPHET_PROTOTYPE_ROOM.d10AreaMap[r as 1]).toBeTruthy();
    }
  });

  it('4. Room Map 只指向合法 Area', () => {
    for (let r = 1; r <= 10; r++) {
      const areaId = PROPHET_PROTOTYPE_ROOM.d10AreaMap[r as 1];
      expect(PROPHET_PROTOTYPE_ROOM.validAreaIds).toContain(areaId);
    }
  });

  it('5. 正式 Room Map 缺失 → official battle 禁用', () => {
    const v = validateRoomMap(PROPHET_OFFICIAL_ROOM_LEVEL_1);
    expect(v.isComplete).toBe(false);
    expect(v.missing.length).toBeGreaterThan(0);
    expect(isProphetOfficialBattleEnabled()).toBe(false);
    // formal 模式严禁回退到 prototype
    expect(getProphetDefinition(1, 'formal')).toBeUndefined();
    // Threat 全部缺失
    expect(getProphetThreat(1)).toBeUndefined();
    expect(getProphetOfficialDataGaps().length).toBeGreaterThan(0);
  });

  it('6. Prototype 不进 official pool，且不占用正式 ID', () => {
    expect(PROPHET_PROTOTYPE_BOSS.enabledInOfficialPool).toBe(false);
    expect(PROPHET_PROTOTYPE_BOSS.officialDataStatus).toBe('prototype');
    expect(PROPHET_PROTOTYPE_BOSS_ID.startsWith('prototype-')).toBe(true);
    expect(PROPHET_OFFICIAL_LEVEL_IDS).not.toContain(PROPHET_PROTOTYPE_BOSS_ID);
    // 校验只应报告「正式 Room Map 缺失」这一类缺口，不得报原型自身错误
    const issues = validateProphetFamily();
    expect(issues.every((i) => i.targetId !== PROPHET_PROTOTYPE_BOSS_ID)).toBe(true);
    expect(issues.some((i) => i.targetId === PROPHET_OFFICIAL_ROOM_LEVEL_1.id)).toBe(true);
  });

  it('6b. 家族校验覆盖 §6 清单：Rubble Definition 存在 + 第二行动 Skill Table 非空', () => {
    // ACTION_OVERRIDES 存正式语义 ID，原型实现 ID 必须带 prototype- 前缀
    expect(PROPHET_ACTION_OVERRIDES[3]).toBe('prophet-rubble-of-ruin');
    expect(resolveProphetActionSkillId(3, 'formal')).toBe('prophet-rubble-of-ruin');
    const rubbleImplId = resolveProphetActionSkillId(3, 'prototype');
    expect(rubbleImplId).toBe(PROPHET_PROTOTYPE_RUBBLE_ID);
    // 第三行动固定引用的 Rubble 必须真实存在于 Skill 列表
    expect(PROPHET_PROTOTYPE_BOSS.skills.some((s) => s.id === rubbleImplId)).toBe(true);
    // ordinal 2 无 override → 通用普通 Skill 流程
    expect(resolveProphetActionSkillId(2, 'prototype')).toBe('normal-skill-table');
    // 普通 Skill Table：prototype 非空、formal 为空（Data Gate）
    expect(getProphetNormalSkillTable('prototype').length).toBeGreaterThan(0);
    expect(getProphetNormalSkillTable('prototype')).not.toContain(rubbleImplId);
    expect(getProphetNormalSkillTable('formal')).toEqual([]);
    // 上述两项自洽 → 校验不得报出对应缺口
    const issues = validateProphetFamily();
    expect(issues.some((i) => i.targetId === rubbleImplId)).toBe(false);
    expect(issues.some((i) => i.message.includes('第二行动普通 Skill Table 为空'))).toBe(false);
  });

  it('7. Prophet 部署 Aggressive Stance', () => {
    expect(PROPHET_PROTOTYPE_ROOM.bossPlacement.stance).toBe('aggressive');
    expect(PROPHET_OFFICIAL_ROOM_LEVEL_1.bossPlacement.stance).toBe('aggressive');
    expect(getProphetRoomDefinition(1)?.bossPlacement.stance).toBe('aggressive');
    // Level II / III 不推算
    expect(getProphetRoomDefinition(2)).toBeUndefined();
    expect(getProphetDefinition(2)).toBeUndefined();
    expect(getProphetDefinition(3)).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — Initiative / Ordinal（8-11, 24-25）', () => {
  it('8. 创建三张 Initiative 且绑定同一 Actor', () => {
    const cards = createProphetInitiativeCards('prophet-actor', 1);
    expect(cards).toHaveLength(3);
    expect(new Set(cards.map((c) => c.actorId)).size).toBe(1);
  });

  it('9. ordinals 为 1 / 2 / 3', () => {
    const cards = createProphetInitiativeCards('prophet-actor', 1);
    expect(cards.map((c) => c.actionOrdinal)).toEqual([1, 2, 3]);
    expect(getProphetActionSemantics(1)).toBe('place-wooden-pews');
    expect(getProphetActionSemantics(2)).toBe('normal-skill-table');
    expect(getProphetActionSemantics(3)).toBe('rubble-of-ruin');
  });

  it('10. 同一卡只结算一次（幂等）', () => {
    const first = placeStandard();
    expect(first.ok).toBe(true);
    const again = resolveProphetPewPlacement({
      battleId: 'battle-1',
      round: 1,
      initiativeCardId: 'card-1',
      ordinal: 1,
      prophetAlive: true,
      runtime: first.runtime,
      rng: scriptedRng([1, 1, 1, 1]),
    });
    expect(again.ok).toBe(false);
    expect(again.failure).toBe('already-resolved-this-round');
  });

  it('11 / 25. ordinal 1 与 3 都不运行普通 Skill Table', () => {
    const runtime = createProphetBattleRuntime('prophet-actor');
    for (const ordinal of [1, 3] as ActionOrdinal[]) {
      const r = resolveProphetSecondAction({
        round: 1,
        initiativeCardId: `card-${ordinal}`,
        ordinal,
        runtime,
        rng: createSeededRng(1),
        skillTable: ['prototype-prophet-normal-strike'],
      });
      expect(r.ok).toBe(false);
      expect(r.failure).toBe('wrong-ordinal');
    }
  });

  it('24. ordinal 3 固定 Rubble（由通用入口按 override 解析）', () => {
    expect(resolveBossActionByOrdinal(1, PROPHET_ACTION_OVERRIDES)).toBe(
      'prophet-place-wooden-pews'
    );
    expect(resolveBossActionByOrdinal(2, PROPHET_ACTION_OVERRIDES)).toBe('normal-skill-table');
    expect(resolveBossActionByOrdinal(3, PROPHET_ACTION_OVERRIDES)).toBe('prophet-rubble-of-ruin');
  });
});

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — 4d10 放置（12-16）', () => {
  it('12. 正好掷 4 个 d10，并创建 4 个 Pew', () => {
    const r = placeStandard();
    expect(r.ok).toBe(true);
    expect(r.record!.rolls).toHaveLength(PROPHET_PEW_COUNT);
    expect(r.record!.rolls).toEqual([3, 7, 3, 9]);
    expect(r.pews).toHaveLength(4);
  });

  it('13. 使用可注入 RNG（同 seed 同结果，不依赖 Math.random）', () => {
    const a = createSeededRng(42);
    const b = createSeededRng(42);
    const rollsA = [rollD10(a), rollD10(a), rollD10(a), rollD10(a)];
    const rollsB = [rollD10(b), rollD10(b), rollD10(b), rollD10(b)];
    expect(rollsA).toEqual(rollsB);
    for (const v of rollsA) expect(v).toBeGreaterThanOrEqual(1);
    for (const v of rollsA) expect(v).toBeLessThanOrEqual(10);
  });

  it('14. 创建 4 个彼此独立的 Pew instance', () => {
    const r = placeStandard();
    const ids = r.pews.map((p) => p.id);
    expect(new Set(ids).size).toBe(4);
    for (const p of r.pews) {
      expect(p.markerType).toBe('wooden-pew');
      expect(p.status).toBe('telegraphed');
      expect(p.resolvesOnActionOrdinal).toBe(3);
    }
  });

  it('15. 同 Area 多个 Pew 不合并（B 区两个独立 instance）', () => {
    const r = placeStandard();
    const inB = r.pews.filter((p) => p.targetAreaId === 'prototype-area-b');
    expect(inB).toHaveLength(2);
    expect(inB[0].id).not.toBe(inB[1].id);
    expect(countPewsInArea(r.pews, 'prototype-area-b')).toBe(2);
    // 日志按 §20 格式输出
    const log = formatPlacementLog(r.record!);
    expect(log[0]).toContain('第1次行动');
    expect(log.some((l) => l.includes('2个Wooden Pews'))).toBe(true);
  });

  it('16. 刷新不重掷（同一事务键幂等）+ 非法 Area 整笔回滚', () => {
    const r = placeStandard();
    const rerun = resolveProphetPewPlacement({
      battleId: 'battle-1',
      round: 1,
      initiativeCardId: 'card-1',
      ordinal: 1,
      prophetAlive: true,
      runtime: r.runtime,
      rng: scriptedRng([10, 10, 10, 10]),
    });
    expect(rerun.ok).toBe(false);
    expect(rerun.pews).toHaveLength(0);

    // 非法 Area → 一个 Pew 都不创建
    const brokenRoom: ProphetRoomDefinition = {
      ...PROPHET_PROTOTYPE_ROOM,
      d10AreaMap: { ...PROPHET_PROTOTYPE_ROOM.d10AreaMap, 3: 'not-a-real-area' },
    };
    const bad = resolveProphetPewPlacement({
      battleId: 'battle-2',
      round: 1,
      initiativeCardId: 'card-x',
      ordinal: 1,
      prophetAlive: true,
      runtime: createProphetBattleRuntime('prophet-actor'),
      room: brokenRoom,
      rng: scriptedRng([3, 7, 3, 9]),
    });
    expect(bad.ok).toBe(false);
    expect(bad.failure).toBe('invalid-area');
    expect(bad.pews).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — Pew 不占位 / 不可 Target（17-21）', () => {
  it('17. Pew 不进入 BattleActor（无 HP / Stance / Initiative 字段语义）', () => {
    const r = placeStandard();
    for (const p of r.pews) {
      expect(p.hasInitiative).toBe(false);
      expect(p).not.toHaveProperty('hp');
      expect(p).not.toHaveProperty('stance');
      // Pew 不出现在占位实体列表中
      expect(OCCUPANTS.some((o) => o.actorId === p.id)).toBe(false);
    }
  });

  it('18. Pew 不占 Stance', () => {
    const r = placeStandard();
    expect(r.pews.every((p) => p.occupiesStance === false)).toBe(true);
  });

  it('19. Pew 不占 Area Capacity（Hero 仍可进入）', () => {
    const r = placeStandard();
    expect(countPewsInArea(r.pews, 'prototype-area-b')).toBe(2);
    // B 区只有 hero-1 一个真实占位者
    expect(getAreaOccupancy(OCCUPANTS, 'prototype-area-b')).toBe(1);
    expect(canEnterArea(OCCUPANTS, 'prototype-area-b', 2)).toBe(true);
    expect(r.pews.every((p) => p.occupiesAreaSpace === false)).toBe(true);
  });

  it('20. Pew 不可 Target（Target Selector 过滤）', () => {
    const r = placeStandard();
    const targets = selectTargetableActorIds(OCCUPANTS, r.pews);
    expect(targets).toEqual(['hero-1', 'hero-2', 'hero-3']);
    for (const p of r.pews) {
      expect(p.targetable).toBe(false);
      expect(targets).not.toContain(p.id);
    }
  });

  it('21. Area Attack 不伤害 Pew', () => {
    const r = placeStandard();
    const hit = resolveAreaAttackTargets(OCCUPANTS, r.pews, 'prototype-area-b');
    expect(hit).toEqual(['hero-1']);
    expect(hit.some((id) => id.startsWith('prophet-pew:'))).toBe(false);
  });
});

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — 第二次行动（22-23）', () => {
  it('22. ordinal 2 使用普通 Skill Table，且 d10 先保存', () => {
    const runtime = createProphetBattleRuntime('prophet-actor');
    const r = resolveProphetSecondAction({
      round: 1,
      initiativeCardId: 'card-2',
      ordinal: 2,
      runtime,
      rng: scriptedRng([5]),
      skillTable: ['skill-a', 'skill-b', 'skill-c'],
    });
    expect(r.ok).toBe(true);
    expect(r.skillRoll).toBe(5);
    expect(r.selectedSkillId).toBe('skill-b'); // (5-1) % 3 = 1
    expect(r.runtime.completedActionOrdinalsThisRound).toContain(2);
  });

  it('23. ordinal 2 不放 Pew、不执行 Rubble；Skill Table 缺失时禁用', () => {
    const runtime = createProphetBattleRuntime('prophet-actor');
    const ok = resolveProphetSecondAction({
      round: 1,
      initiativeCardId: 'card-2',
      ordinal: 2,
      runtime,
      rng: scriptedRng([5]),
      skillTable: ['skill-a'],
    });
    expect(ok.placedPews).toBe(false);
    expect(ok.executedRubble).toBe(false);

    const gated = resolveProphetSecondAction({
      round: 1,
      initiativeCardId: 'card-2b',
      ordinal: 2,
      runtime,
      rng: scriptedRng([5]),
      skillTable: [], // 正式 Skill Table 缺失
    });
    expect(gated.ok).toBe(false);
    expect(gated.failure).toBe('skill-table-unavailable');
  });
});

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — Rubble 逐 Pew 结算（26-36）', () => {
  function runRubble(pews: DelayedAreaHazardState[], alive = true, pipeline?: AreaAttackPipeline) {
    return resolveProphetRubbleOfRuin({
      battleId: 'battle-1',
      round: 1,
      initiativeCardId: 'card-3',
      ordinal: 3,
      prophetAlive: alive,
      runtime: createProphetBattleRuntime('prophet-actor'),
      pews,
      occupants: OCCUPANTS,
      rng: scriptedRng([8, 10, 2, 6]),
      pipeline,
    });
  }

  it('26-28. 每个 Pew 独立 Accuracy / Crit / Damage', () => {
    const placed = placeStandard();
    const r = runRubble(placed.pews);
    expect(r.ok).toBe(true);
    expect(r.attacks).toHaveLength(4);
    // 四次攻击各自掷点，互不共享
    expect(r.attacks.map((a) => a.attackRoll)).toEqual([8, 10, 2, 6]);
    expect(r.attacks.filter((a) => a.critical)).toHaveLength(1); // 只有掷到 10 的那个暴击
    expect(r.attacks.filter((a) => a.hit)).toHaveLength(3); // 掷 2 未命中
    // 每条记录都有自己的伤害事件 id
    const dmgIds = r.attacks.flatMap((a) => a.damageEventIds);
    expect(new Set(dmgIds).size).toBe(dmgIds.length);
  });

  it('29-30. 同 Area 两个 Pew 攻击两次且不合并伤害', () => {
    const placed = placeStandard();
    const r = runRubble(placed.pews);
    const bAttacks = r.attacks.filter((a) => a.areaId === 'prototype-area-b');
    expect(bAttacks).toHaveLength(2);
    expect(bAttacks[0].pewInstanceId).not.toBe(bAttacks[1].pewInstanceId);
    expect(bAttacks[0].id).not.toBe(bAttacks[1].id);
    // 两次攻击各自独立掷点，不是一次双倍
    expect(bAttacks[0].attackRoll).not.toBe(bAttacks[1].attackRoll);
  });

  it('31-32. Damage / Stress / Condition 复用注入的正式管线', () => {
    const placed = placeStandard();
    const calls: string[] = [];
    const spyPipeline: AreaAttackPipeline = {
      resolve({ pewInstanceId, targetActorIds }) {
        calls.push(pewInstanceId);
        return {
          attackRoll: 7,
          hit: true,
          critical: false,
          damageEventIds: targetActorIds.map((t) => `official-dmg:${t}`),
          stressEventIds: targetActorIds.map((t) => `official-stress:${t}`),
          conditionEventIds: targetActorIds.map((t) => `official-cond:${t}`),
        };
      },
    };
    const r = runRubble(placed.pews, true, spyPipeline);
    // 管线被逐 Pew 调用 4 次
    expect(calls).toHaveLength(4);
    expect(new Set(calls).size).toBe(4);
    expect(r.attacks.every((a) => a.damageEventIds.every((d) => d.startsWith('official-dmg')))).toBe(
      true
    );
    expect(r.attacks.some((a) => a.stressEventIds.length > 0)).toBe(true);
  });

  it('33-35. 单 Pew / 整体 Rubble 各只结算一次，刷新不重复攻击', () => {
    const placed = placeStandard();
    const first = runRubble(placed.pews);
    // 每个 Pew 只有一条记录
    const perPew = new Map<string, number>();
    for (const a of first.attacks) perPew.set(a.pewInstanceId, (perPew.get(a.pewInstanceId) ?? 0) + 1);
    expect([...perPew.values()].every((n) => n === 1)).toBe(true);

    // 用已结算后的 Pew 再跑一次：没有 telegraphed 的了 → 0 次攻击
    const second = resolveProphetRubbleOfRuin({
      battleId: 'battle-1',
      round: 1,
      initiativeCardId: 'card-3b',
      ordinal: 3,
      prophetAlive: true,
      runtime: createProphetBattleRuntime('prophet-actor'),
      pews: first.pews,
      occupants: OCCUPANTS,
      rng: scriptedRng([9, 9, 9, 9]),
    });
    expect(second.attacks).toHaveLength(0);

    // 同一张卡重复结算被幂等拦下
    const dup = resolveProphetRubbleOfRuin({
      battleId: 'battle-1',
      round: 1,
      initiativeCardId: 'card-3',
      ordinal: 3,
      prophetAlive: true,
      runtime: first.runtime,
      pews: placed.pews,
      occupants: OCCUPANTS,
      rng: scriptedRng([9, 9, 9, 9]),
    });
    expect(dup.ok).toBe(false);
    expect(dup.failure).toBe('already-resolved-this-round');
  });

  it('36. Prophet 死亡后 Rubble 不执行', () => {
    const placed = placeStandard();
    const r = runRubble(placed.pews, false);
    expect(r.ok).toBe(false);
    expect(r.failure).toBe('prophet-dead');
    expect(r.attacks).toHaveLength(0);
  });

  it('Rubble 日志按 §20 格式输出', () => {
    const placed = placeStandard();
    const r = runRubble(placed.pews);
    const log = formatRubbleLog(r.attacks);
    expect(log[0]).toContain('第3次行动');
    expect(log).toHaveLength(5);
  });
});

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — Lifecycle（37-40）', () => {
  it('37. Rubble 后 Pew 变 resolved', () => {
    const placed = placeStandard();
    const r = resolveProphetRubbleOfRuin({
      battleId: 'battle-1',
      round: 1,
      initiativeCardId: 'card-3',
      ordinal: 3,
      prophetAlive: true,
      runtime: createProphetBattleRuntime('prophet-actor'),
      pews: placed.pews,
      occupants: OCCUPANTS,
      rng: scriptedRng([7, 7, 7, 7]),
    });
    expect(r.pews.every((p) => p.status === 'resolved')).toBe(true);
    expect(r.pews.every((p) => p.resolvedTransactionId !== null)).toBe(true);
  });

  it('38. 下一轮开始前清理 resolved Pews', () => {
    const placed = placeStandard();
    const resolved = placed.pews.map((p) => ({ ...p, status: 'resolved' as const }));
    expect(clearResolvedPews(resolved)).toHaveLength(0);

    const next = beginProphetRound(placed.runtime, resolved, 2);
    expect(next.pews).toHaveLength(0);
    expect(next.runtime.currentRound).toBe(2);
    expect(next.runtime.completedActionOrdinalsThisRound).toHaveLength(0);
  });

  it('39. 未完成的 telegraphed Pew 不被静默覆盖', () => {
    const placed = placeStandard();
    const next = beginProphetRound(placed.runtime, placed.pews, 2);
    // telegraphed 的 Pew 仍在
    expect(next.pews).toHaveLength(4);
    // 新一轮放置被阻止
    const blocked = resolveProphetPewPlacement({
      battleId: 'battle-1',
      round: 2,
      initiativeCardId: 'card-r2-1',
      ordinal: 1,
      prophetAlive: true,
      runtime: next.runtime,
      rng: scriptedRng([1, 2, 3, 4]),
      existingPews: next.pews,
    });
    expect(blocked.ok).toBe(false);
    expect(blocked.failure).toBe('pending-unresolved-pews');
  });

  it('40. Prophet 死亡清除全部 Pews', () => {
    const placed = placeStandard();
    const cleared = clearAllPews(placed.pews, 'prophet-defeated');
    expect(cleared).toHaveLength(4);
    expect(cleared.every((p) => p.status === 'removed')).toBe(true);
  });
});

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — Victory（41-43, 48）', () => {
  it('41-43. 立即胜利 / 固定 3 XP / Campaign Advance / 未结算卡失效', () => {
    const placed = placeStandard();
    const cards = createProphetInitiativeCards('prophet-actor', 1);
    cards[0].resolved = true; // ordinal 1 已结算，2/3 未结算
    const v = resolveProphetVictory({ initiativeCards: cards, pews: placed.pews });

    expect(v.bossDefeated).toBe(true);
    expect(v.stoppedSkillQueue).toBe(true);
    expect(v.xpResult).toBe(3);
    expect(v.campaignAdvanced).toBe(true);
    expect(v.removedOtherMonsters).toBe(true);
    expect(v.invalidatedInitiativeCardIds).toHaveLength(2);
    // Pews 已放置但 Rubble 未执行 → 不再攻击，立即移除
    expect(v.pews.every((p) => p.status === 'removed')).toBe(true);
    expect(v.removedPewIds).toHaveLength(4);
  });

  it('48. Victory 后刷新不重复（Pew 已 removed，Rubble 取不到 telegraphed）', () => {
    const placed = placeStandard();
    const v = resolveProphetVictory({
      initiativeCards: createProphetInitiativeCards('prophet-actor', 1),
      pews: placed.pews,
    });
    const after = resolveProphetRubbleOfRuin({
      battleId: 'battle-1',
      round: 1,
      initiativeCardId: 'card-3',
      ordinal: 3,
      prophetAlive: false,
      runtime: createProphetBattleRuntime('prophet-actor'),
      pews: v.pews,
      occupants: OCCUPANTS,
      rng: scriptedRng([9, 9, 9, 9]),
    });
    expect(after.ok).toBe(false);
    expect(after.attacks).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
describe('Phase 9C §21 — Save Migration（44-47, 49）', () => {
  it('44. Phase 9B 存档可迁移（SAVE_VERSION + 1）', () => {
    const snap = migrateProphetSave(8);
    expect(snap.version).toBe(9);
    expect(snap.prophetContentVersion).toBe(1);
    expect(snap.delayedAreaHazards).toEqual([]);
    expect(snap.prophetPewPlacementHistory).toEqual([]);
    expect(snap.prophetRubbleHistory).toEqual([]);
  });

  it('45 / 47. Pews、Placement 与 Rubble Records 可恢复', () => {
    const placed = placeStandard();
    const rubble = resolveProphetRubbleOfRuin({
      battleId: 'battle-1',
      round: 1,
      initiativeCardId: 'card-3',
      ordinal: 3,
      prophetAlive: true,
      runtime: placed.runtime,
      pews: placed.pews,
      occupants: OCCUPANTS,
      rng: scriptedRng([7, 7, 7, 7]),
    });
    const snap = {
      ...migrateProphetSave(8),
      prophetBattleRuntime: rubble.runtime,
      delayedAreaHazards: rubble.pews,
      prophetPewPlacementHistory: [placed.record!],
      prophetRubbleHistory: rubble.attacks,
    };
    const roundTrip = JSON.parse(JSON.stringify(snap));
    expect(roundTrip.delayedAreaHazards).toHaveLength(4);
    expect(roundTrip.prophetRubbleHistory).toHaveLength(4);
    // 已保存的骰点不得被重新映射
    expect(roundTrip.prophetPewPlacementHistory[0].rolls).toEqual([3, 7, 3, 9]);
    expect(roundTrip.prophetBattleRuntime.rubbleTransactionId).toBeTruthy();
  });

  it('46. Definition Hash 变化时，进行中的 Battle 使用 Snapshot', () => {
    const snapshot = {
      roomDefinitionId: PROPHET_PROTOTYPE_ROOM.id,
      roomHash: hashRoomDefinition(PROPHET_PROTOTYPE_ROOM),
    };
    // 未变化 → 用当前定义
    expect(resolveActiveRoomDefinition(snapshot, PROPHET_PROTOTYPE_ROOM, true).useSnapshot).toBe(
      false
    );
    // 变化 → 沿用 Snapshot
    const changed: ProphetRoomDefinition = {
      ...PROPHET_PROTOTYPE_ROOM,
      d10AreaMap: { ...PROPHET_PROTOTYPE_ROOM.d10AreaMap, 1: 'prototype-area-e' },
    };
    const r = resolveActiveRoomDefinition(snapshot, changed, true);
    expect(r.useSnapshot).toBe(true);
    expect(r.roomId).toBe(PROPHET_PROTOTYPE_ROOM.id);
    // 战斗未进行中 → 下一场直接用新定义
    expect(resolveActiveRoomDefinition(snapshot, changed, false).useSnapshot).toBe(false);
  });

  it('49. 损坏 Runtime 不白屏（安全兜底）', () => {
    for (const bad of [null, undefined, {}, 'garbage', 42, { prophetActorId: 123 }]) {
      const r = repairProphetRuntime(bad);
      expect(r.prophetActorId).toBe('prophet-actor');
      expect(Array.isArray(r.activePewIds)).toBe(true);
      expect(r.currentRound).toBeGreaterThanOrEqual(1);
    }
    // 部分损坏时保留可用字段
    const partial = repairProphetRuntime({ prophetActorId: 'p-1', currentRound: 3 });
    expect(partial.prophetActorId).toBe('p-1');
    expect(partial.currentRound).toBe(3);
    expect(partial.completedActionOrdinalsThisRound).toEqual([]);
  });
});
