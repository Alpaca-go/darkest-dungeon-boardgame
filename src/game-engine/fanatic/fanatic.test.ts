// Phase 9E §28：Fanatic / Pyre / 强制抓取-囚禁 单元测试（覆盖 §28 全部 65 个验收点）。
// 分组：Registry/Setup(1-11) · Prelude(12-18) · Closest Hero(19-25) ·
//       Movement/Throw(26-40) · Pyre/Captive(41-50) · Victory/Save(51-65)。

import { describe, expect, it } from 'vitest';
import {
  FANATIC_FAMILY_ID,
  FANATIC_OFFICIAL_ROOM_LEVEL_1,
  FANATIC_PROTOTYPE_AREA_GRAPH,
  FANATIC_PROTOTYPE_BOSS,
  FANATIC_PROTOTYPE_BOSS_ID,
  FANATIC_PROTOTYPE_ROOM,
  PYRE_PROTOTYPE,
  PYRE_PROTOTYPE_ID,
  getFanaticDefinition,
  getFanaticOfficialDataGaps,
  getFanaticThreat,
  getPyreCaptiveEffectDefinition,
  getPyreDefinition,
  isFanaticOfficialBattleEnabled,
  validateFanaticFamily,
  validateFanaticRoom,
} from '../../data/bosses/fanatic-family';
import {
  FanaticBattleActorSnapshot,
  createFanaticInitiativeSet,
  canFanaticThrowHeroIntoPyre,
  findAreaPath,
  getFanaticHeroCandidates,
  getPyreAreaId,
  getRemainingAreaCapacity,
  hasFanaticReachedHero,
  hashFanaticRoomDefinition,
  idempotencyKeys,
  isPyreInPlay,
  migrateFanaticSave,
  moveFanaticTowardHero,
  pathDistance,
  repairFanaticRuntime,
  resolveActiveFanaticRoomDefinition,
  resolveFanaticNormalSkill,
  resolveFanaticTurnPrelude,
  resolveFanaticVictory,
  resolvePyreAction,
  resolvePyreDeath,
  rollD10,
  selectClosestHeroByPath,
  setupPrototypeFanaticBattle,
  throwHeroIntoPyre,
} from './runtime';

// 确定性 RNG（mulberry32 同 runtime）
function scriptedRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FANATIC_ID = 'fanatic-actor';
const PYRE_ID = 'pyre-actor';

function fanaticActor(overrides: Partial<FanaticBattleActorSnapshot> = {}): FanaticBattleActorSnapshot {
  return { actorId: FANATIC_ID, tags: ['fanatic', 'boss'], alive: true, removed: false, areaId: 'fanatic-a', ...overrides };
}
function pyreActor(overrides: Partial<FanaticBattleActorSnapshot> = {}): FanaticBattleActorSnapshot {
  return { actorId: PYRE_ID, tags: ['pyre', 'fanatic-linked-entity'], alive: true, removed: false, areaId: 'pyre-a', ...overrides };
}
/** 生成 hero-1..4 的 Actor 快照，alive 列表指定存活者。 */
function heroes(alive: number[] = [1, 2, 3, 4], captive: number[] = []): FanaticBattleActorSnapshot[] {
  return [1, 2, 3, 4].map((n) => ({
    actorId: `hero-${n}`,
    tags: ['hero'],
    alive: alive.includes(n),
    removed: false,
    areaId: `hero-${n}`,
    position: n,
    captive: captive.includes(n),
  }));
}

function baseRuntime() {
  const ctx = setupPrototypeFanaticBattle({ fanaticActorId: FANATIC_ID, pyreActorId: PYRE_ID });
  return ctx;
}

// ===========================================================================
// Registry / Setup（§28.1—11）
// ===========================================================================
describe('Fanatic §28 — Registry / Setup', () => {
  it('1. Fanatic Family ID 正确', () => {
    expect(FANATIC_FAMILY_ID).toBe('fanatic');
    expect(FANATIC_PROTOTYPE_ROOM.bossFamilyId).toBe('fanatic');
  });

  it('2. Fanatic / Pyre ID 唯一', () => {
    expect(FANATIC_PROTOTYPE_BOSS_ID).not.toBe(PYRE_PROTOTYPE_ID);
    expect(FANATIC_PROTOTYPE_BOSS.id).toBe(FANATIC_PROTOTYPE_BOSS_ID);
    expect(PYRE_PROTOTYPE.id).toBe(PYRE_PROTOTYPE_ID);
  });

  it('3. Fanatic Stance = Aggressive', () => {
    expect(FANATIC_PROTOTYPE_ROOM.fanaticPlacement.stance).toBe('aggressive');
  });

  it('4. Pyre Stance = Ranged', () => {
    expect(FANATIC_PROTOTYPE_ROOM.pyrePlacement.stance).toBe('ranged');
    expect(PYRE_PROTOTYPE.requiredStance).toBe('ranged');
  });

  it('5. 创建 3 张 Fanatic Initiative', () => {
    const cards = createFanaticInitiativeSet(FANATIC_ID, PYRE_ID, 1);
    expect(cards.filter((c) => c.actorKind === 'fanatic')).toHaveLength(3);
  });

  it('6. 创建 1 张 Pyre Initiative', () => {
    const cards = createFanaticInitiativeSet(FANATIC_ID, PYRE_ID, 1);
    expect(cards.filter((c) => c.actorKind === 'pyre')).toHaveLength(1);
    expect(cards).toHaveLength(4);
  });

  it('7. 四张卡绑定正确 Actor', () => {
    const cards = createFanaticInitiativeSet(FANATIC_ID, PYRE_ID, 1);
    const fana = cards.filter((c) => c.actorKind === 'fanatic');
    const pyre = cards.filter((c) => c.actorKind === 'pyre');
    expect(fana.every((c) => c.actorId === FANATIC_ID)).toBe(true);
    expect(pyre.every((c) => c.actorId === PYRE_ID)).toBe(true);
    expect(fana.map((c) => c.ordinal)).toEqual([1, 2, 3]);
  });

  it('8. Setup 只执行一次（id 幂等，刷新不重复创建）', () => {
    const a = createFanaticInitiativeSet(FANATIC_ID, PYRE_ID, 1).map((c) => c.id);
    const b = createFanaticInitiativeSet(FANATIC_ID, PYRE_ID, 1).map((c) => c.id);
    expect(a).toEqual(b);
    const ctx = baseRuntime();
    expect(ctx.runtime.fanaticInitiativeCardIds).toHaveLength(3);
    expect(ctx.runtime.pyreInitiativeCardId).not.toBeNull();
  });

  it('9. 缺失 Pyre Definition 时 official 禁用', () => {
    expect(getPyreDefinition(1, 'formal')).toBeUndefined();
    expect(isFanaticOfficialBattleEnabled()).toBe(false);
  });

  it('10. 缺失 Captive Definition 时 official 禁用', () => {
    expect(getPyreCaptiveEffectDefinition('formal')).toBeUndefined();
    expect(isFanaticOfficialBattleEnabled()).toBe(false);
    // 正式 Room 不自洽；Threat 缺失
    expect(validateFanaticRoom(FANATIC_OFFICIAL_ROOM_LEVEL_1).isComplete).toBe(false);
    expect(getFanaticThreat(1)).toBeUndefined();
    expect(getFanaticOfficialDataGaps().length).toBeGreaterThan(0);
  });

  it('11. Prototype 不进入 official pool', () => {
    expect(FANATIC_PROTOTYPE_BOSS.enabledInOfficialPool).toBe(false);
    expect(getFanaticDefinition(1, 'prototype')?.id).toBe(FANATIC_PROTOTYPE_BOSS_ID);
    expect(getFanaticDefinition(1, 'formal')).toBeUndefined();
    const issues = validateFanaticFamily();
    expect(issues.some((i) => i.targetId === FANATIC_PROTOTYPE_BOSS_ID && i.kind === 'unverified')).toBe(false);
  });
});

// ===========================================================================
// Prelude（§28.12—18）
// ===========================================================================
describe('Fanatic §28 — Turn Prelude', () => {
  function prelude(opts: {
    cardId?: string;
    pyre?: FanaticBattleActorSnapshot | null;
    heroActors?: FanaticBattleActorSnapshot[];
    captiveOccupants?: { areaId: string }[];
    movementValue?: number;
    runtimeOverride?: ReturnType<typeof baseRuntime>['runtime'];
  } = {}) {
    const ctx = baseRuntime();
    return resolveFanaticTurnPrelude({
      battleId: 'b1',
      initiativeCardId: opts.cardId ?? ctx.runtime.fanaticInitiativeCardIds[0],
      runtime: opts.runtimeOverride ?? ctx.runtime,
      room: ctx.room,
      roomGraph: ctx.roomGraph,
      fanaticActor: fanaticActor(),
      pyre: opts.pyre === undefined ? pyreActor() : opts.pyre,
      heroActors: opts.heroActors ?? heroes(),
      captiveOccupants: opts.captiveOccupants ?? [],
      movementValue: opts.movementValue ?? 3,
      captiveEffect: ctx.captiveEffect,
    });
  }

  it('12. Pyre 存活且 Area 有空间时触发（投入 Pyre）', () => {
    const r = prelude();
    expect(r.outcome).toBe('threw-hero-into-pyre');
    expect(r.captive).not.toBeNull();
    expect(r.proceedToNormalSkill).toBe(true);
  });

  it('13. Pyre 死亡时不触发', () => {
    const r = prelude({ pyre: pyreActor({ alive: false }) });
    expect(r.outcome).toBe('skipped-pyre-not-in-play');
    expect(r.captive).toBeNull();
  });

  it('14. Pyre 被移除时不触发', () => {
    const r = prelude({ pyre: pyreActor({ removed: true }) });
    expect(r.outcome).toBe('skipped-pyre-not-in-play');
  });

  it('15. Pyre Area 满时不触发', () => {
    const r = prelude({ captiveOccupants: [{ areaId: 'pyre-a' }] });
    expect(r.outcome).toBe('skipped-pyre-area-full');
  });

  it('16. 每张 Fanatic Card 都评估 Prelude', () => {
    const ctx = baseRuntime();
    for (const cardId of ctx.runtime.fanaticInitiativeCardIds) {
      const r = resolveFanaticTurnPrelude({
        battleId: 'b1',
        initiativeCardId: cardId,
        runtime: ctx.runtime,
        room: ctx.room,
        roomGraph: ctx.roomGraph,
        fanaticActor: fanaticActor(),
        pyre: pyreActor(),
        heroActors: heroes(),
        captiveOccupants: [],
        movementValue: 3,
        captiveEffect: ctx.captiveEffect,
      });
      // 每张卡都产生 transactionId 且进入普通 Skill
      expect(r.transactionId).toBe(idempotencyKeys.turnPrelude('b1', cardId));
      expect(r.proceedToNormalSkill).toBe(true);
    }
  });

  it('17. 同一 Card 不重复 Prelude（幂等）', () => {
    const ctx = baseRuntime();
    const cardId = ctx.runtime.fanaticInitiativeCardIds[0];
    const first = resolveFanaticTurnPrelude({
      battleId: 'b1',
      initiativeCardId: cardId,
      runtime: ctx.runtime,
      room: ctx.room,
      roomGraph: ctx.roomGraph,
      fanaticActor: fanaticActor(),
      pyre: pyreActor(),
      heroActors: heroes(),
      captiveOccupants: [],
      movementValue: 3,
      captiveEffect: ctx.captiveEffect,
    });
    // 用 first.runtime（已写入 lastTurnPreludeTransactionId）再次调用同一 Card
    const second = resolveFanaticTurnPrelude({
      battleId: 'b1',
      initiativeCardId: cardId,
      runtime: first.runtime,
      room: ctx.room,
      roomGraph: ctx.roomGraph,
      fanaticActor: fanaticActor(),
      pyre: pyreActor(),
      heroActors: heroes(),
      captiveOccupants: [],
      movementValue: 3,
      captiveEffect: ctx.captiveEffect,
    });
    expect(second.outcome).toBe('skipped-already-processed');
  });

  it('18. 普通 Skill 只执行一次（Prelude 后进入且返回单一 Skill）', () => {
    const r = prelude();
    expect(r.proceedToNormalSkill).toBe(true);
    const skill = resolveFanaticNormalSkill({ rng: scriptedRng(3) });
    expect(skill.ok).toBe(true);
    expect(typeof skill.selectedSkillId).toBe('string');
  });
});

// ===========================================================================
// Closest Hero（§28.19—25）
// ===========================================================================
describe('Fanatic §28 — Closest Hero Selector', () => {
  const graph = FANATIC_PROTOTYPE_AREA_GRAPH;

  it('19. 使用路径距离（Room Graph）', () => {
    expect(pathDistance(graph, 'fanatic-a', 'hero-1')).toBe(1);
    expect(pathDistance(graph, 'fanatic-a', 'hero-3')).toBe(3);
    expect(pathDistance(graph, 'pyre-a', 'hero-3')).toBe(1);
  });

  it('20. 不使用 DOM 坐标（distanceByHeroId 来自图距离）', () => {
    const res = selectClosestHeroByPath({
      fanaticActorId: FANATIC_ID,
      fanaticAreaId: 'fanatic-a',
      candidates: getFanaticHeroCandidates(heroes()),
      roomGraph: graph,
      preludeTransactionId: 'tx-1',
    });
    expect(res.record?.distanceByHeroId['hero-1']).toBe(1);
    expect(res.record?.distanceByHeroId['hero-4']).toBe(4);
  });

  it('21. 最近 Hero 选择正确', () => {
    const res = selectClosestHeroByPath({
      fanaticActorId: FANATIC_ID,
      fanaticAreaId: 'fanatic-a',
      candidates: getFanaticHeroCandidates(heroes()),
      roomGraph: graph,
      preludeTransactionId: 'tx-1',
    });
    expect(res.record?.selectedHeroId).toBe('hero-1');
  });

  it('22. 并列使用统一 Tie-break（position 升序）', () => {
    // 两个 Hero 距 fanatic-a 同距离：构造一个自定义图让 hero-1 / hero-2 同距 1
    const tieGraph = {
      areas: ['fanatic-a', 'hero-1', 'hero-2'],
      edges: [
        { from: 'fanatic-a', to: 'hero-1', distance: 1 },
        { from: 'fanatic-a', to: 'hero-2', distance: 1 },
      ],
    };
    const cands = [
      { heroId: 'hero-2', areaId: 'hero-2', position: 2 },
      { heroId: 'hero-1', areaId: 'hero-1', position: 1 },
    ];
    const res = selectClosestHeroByPath({
      fanaticActorId: FANATIC_ID,
      fanaticAreaId: 'fanatic-a',
      candidates: cands,
      roomGraph: tieGraph,
      preludeTransactionId: 'tx-tie',
    });
    expect(res.record?.selectedHeroId).toBe('hero-1');
    expect(res.record?.tieBreakMethod).toBe('position-asc');
  });

  it('23. 结果先保存（记录含 transactionId 与稳定 id）', () => {
    const res = selectClosestHeroByPath({
      fanaticActorId: FANATIC_ID,
      fanaticAreaId: 'fanatic-a',
      candidates: getFanaticHeroCandidates(heroes()),
      roomGraph: graph,
      preludeTransactionId: 'tx-9',
    });
    expect(res.record?.transactionId).toBe('tx-9');
    expect(res.record?.id).toBe(idempotencyKeys.closestHero('tx-9'));
  });

  it('24. 刷新不重选（同 preludeTransactionId → 同记录 id）', () => {
    const call = () =>
      selectClosestHeroByPath({
        fanaticActorId: FANATIC_ID,
        fanaticAreaId: 'fanatic-a',
        candidates: getFanaticHeroCandidates(heroes()),
        roomGraph: graph,
        preludeTransactionId: 'tx-same',
      }).record;
    expect(call()?.id).toBe(call()?.id);
    expect(call()?.selectedHeroId).toBe(call()?.selectedHeroId);
  });

  it('25. dead / captive Hero 被过滤', () => {
    const cands = getFanaticHeroCandidates(heroes([2, 3], [2]));
    // hero-1 死、hero-4 死、hero-2 captive → 仅 hero-3 候选
    expect(cands.map((c) => c.heroId)).toEqual(['hero-3']);
  });
});

// ===========================================================================
// Movement / Throw（§28.26—40）
// ===========================================================================
describe('Fanatic §28 — Forced Movement / Throw Into Pyre', () => {
  const graph = FANATIC_PROTOTYPE_AREA_GRAPH;

  it('26. 使用 Definition 移动值（movement=1 只走一步）', () => {
    const mv = moveFanaticTowardHero({
      fanaticAreaId: 'fanatic-a',
      targetAreaId: 'hero-3',
      movementValue: 1,
      roomGraph: graph,
      preludeTransactionId: 'tx-1',
    });
    expect(mv.ok).toBe(true);
    expect(mv.stepsUsed).toBe(1);
    expect(mv.toAreaId).toBe('hero-1');
    expect(mv.reachedHeroArea).toBe(false);
  });

  it('27. 使用合法 Path（连通序列）', () => {
    const path = findAreaPath(graph, 'fanatic-a', 'hero-3');
    expect(path).toEqual(['fanatic-a', 'hero-1', 'hero-2', 'hero-3']);
  });

  it('28. 路径先保存（结果含 path 与稳定 transactionId）', () => {
    const mv = moveFanaticTowardHero({
      fanaticAreaId: 'fanatic-a',
      targetAreaId: 'hero-2',
      movementValue: 3,
      roomGraph: graph,
      preludeTransactionId: 'tx-p',
    });
    expect(mv.path.length).toBeGreaterThan(0);
    expect(mv.transactionId).toBe(idempotencyKeys.forcedMove('tx-p'));
  });

  it('29. 刷新不重复移动（同 preludeTransactionId → 同 transactionId）', () => {
    const one = moveFanaticTowardHero({ fanaticAreaId: 'fanatic-a', targetAreaId: 'hero-2', movementValue: 3, roomGraph: graph, preludeTransactionId: 'tx-x' });
    const two = moveFanaticTowardHero({ fanaticAreaId: 'fanatic-a', targetAreaId: 'hero-2', movementValue: 3, roomGraph: graph, preludeTransactionId: 'tx-x' });
    expect(one.transactionId).toBe(two.transactionId);
    expect(one.path).toEqual(two.path);
  });

  it('30. Area Capacity 生效', () => {
    expect(getRemainingAreaCapacity(FANATIC_PROTOTYPE_ROOM, 'pyre-a', [])).toBe(1);
    expect(getRemainingAreaCapacity(FANATIC_PROTOTYPE_ROOM, 'pyre-a', [{ areaId: 'pyre-a' }])).toBe(0);
    // 未定义容量的 Area → 0
    expect(getRemainingAreaCapacity(FANATIC_PROTOTYPE_ROOM, 'nowhere', [])).toBe(0);
  });

  it('31. 无合法 Path 安全失败', () => {
    const mv = moveFanaticTowardHero({
      fanaticAreaId: 'fanatic-a',
      targetAreaId: 'isolated-area',
      movementValue: 3,
      roomGraph: graph,
      preludeTransactionId: 'tx-np',
    });
    expect(mv.ok).toBe(false);
    expect(mv.failure).toBe('no-path');
  });

  it('32. 缺失移动数据时 official 禁用（movement<=0 失败）', () => {
    const mv = moveFanaticTowardHero({
      fanaticAreaId: 'fanatic-a',
      targetAreaId: 'hero-1',
      movementValue: 0,
      roomGraph: graph,
      preludeTransactionId: 'tx-0',
    });
    expect(mv.ok).toBe(false);
    expect(mv.failure).toBe('no-movement-value');
    // 数据缺口清单包含前置移动
    expect(getFanaticOfficialDataGaps().length).toBeGreaterThan(0);
    expect(isFanaticOfficialBattleEnabled()).toBe(false);
  });

  it('33. 到达后触发 Throw', () => {
    expect(hasFanaticReachedHero({ fanaticAreaId: 'hero-1', heroAreaId: 'hero-1' })).toBe(true);
  });

  it('34. 未到达不触发 Throw', () => {
    expect(hasFanaticReachedHero({ fanaticAreaId: 'hero-2', heroAreaId: 'hero-4' })).toBe(false);
    // 正式模式：到达规则缺失 → 不判定到达
    expect(hasFanaticReachedHero({ fanaticAreaId: 'hero-1', heroAreaId: 'hero-1', mode: 'formal' })).toBe(false);
  });

  it('35. Pyre Area 无空间不触发 Throw', () => {
    const ok = canFanaticThrowHeroIntoPyre({
      room: FANATIC_PROTOTYPE_ROOM,
      pyre: pyreActor(),
      captiveOccupants: [{ areaId: 'pyre-a' }],
    });
    expect(ok).toBe(false);
    // 有空间时可投
    expect(canFanaticThrowHeroIntoPyre({ room: FANATIC_PROTOTYPE_ROOM, pyre: pyreActor(), captiveOccupants: [] })).toBe(true);
  });

  it('36. Hero 移动到 Pyre Area', () => {
    const ctx = baseRuntime();
    const res = throwHeroIntoPyre({
      runtime: ctx.runtime,
      heroId: 'hero-1',
      heroOriginalAreaId: 'hero-1',
      pyreAreaId: 'pyre-a',
      captiveEffect: ctx.captiveEffect,
      preludeTransactionId: 'tx-throw',
      fanaticAlive: true,
      pyreInPlay: true,
      pyreAreaHasSpace: true,
      reached: true,
    });
    expect(res.ok).toBe(true);
    expect(res.heroAreaId).toBe('pyre-a');
    expect(res.captive?.currentAreaId).toBe('pyre-a');
  });

  it('37. Captive State 创建', () => {
    const ctx = baseRuntime();
    const res = throwHeroIntoPyre({
      runtime: ctx.runtime, heroId: 'hero-1', heroOriginalAreaId: 'hero-1', pyreAreaId: 'pyre-a',
      captiveEffect: ctx.captiveEffect, preludeTransactionId: 'tx-c', fanaticAlive: true,
      pyreInPlay: true, pyreAreaHasSpace: true, reached: true,
    });
    expect(res.captive).not.toBeNull();
    expect(res.captive?.status).toBe('inside-container');
    expect(res.captive?.sourceType).toBe('fanatic-pyre');
    // 行为字段由 Definition 驱动
    expect(res.captive?.canAct).toBe(ctx.captiveEffect.canAct);
    expect(res.captive?.onContainerDestroyed).toBe(ctx.captiveEffect.onContainerDestroyed);
    expect(res.runtime.activeCaptiveHeroId).toBe('hero-1');
  });

  it('38. 同一 Hero 不重复 Captive', () => {
    const ctx = baseRuntime();
    const rt = { ...ctx.runtime, activeCaptiveHeroId: 'hero-1' };
    const res = throwHeroIntoPyre({
      runtime: rt, heroId: 'hero-1', heroOriginalAreaId: 'hero-1', pyreAreaId: 'pyre-a',
      captiveEffect: ctx.captiveEffect, preludeTransactionId: 'tx-d', fanaticAlive: true,
      pyreInPlay: true, pyreAreaHasSpace: true, reached: true,
    });
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('hero-already-captive');
  });

  it('39. 失败时 Hero 回滚原 Area（未到达 → 不产生 Captive）', () => {
    const ctx = baseRuntime();
    const res = throwHeroIntoPyre({
      runtime: ctx.runtime, heroId: 'hero-1', heroOriginalAreaId: 'hero-1', pyreAreaId: 'pyre-a',
      captiveEffect: ctx.captiveEffect, preludeTransactionId: 'tx-e', fanaticAlive: true,
      pyreInPlay: true, pyreAreaHasSpace: true, reached: false,
    });
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('not-reached');
    expect(res.captive).toBeNull();
    expect(res.heroAreaId).toBe('hero-1'); // 回滚原 Area
    expect(res.runtime).toBe(ctx.runtime); // runtime 不变
  });

  it('40. 多 Captive 未确认时阻止第二名', () => {
    const ctx = baseRuntime();
    const rt = { ...ctx.runtime, activeCaptiveHeroId: 'hero-1' };
    const res = throwHeroIntoPyre({
      runtime: rt, heroId: 'hero-2', heroOriginalAreaId: 'hero-2', pyreAreaId: 'pyre-a',
      captiveEffect: ctx.captiveEffect, preludeTransactionId: 'tx-f', fanaticAlive: true,
      pyreInPlay: true, pyreAreaHasSpace: true, reached: true, allowMultipleCaptive: false,
    });
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('other-captive-present');
  });
});

// ===========================================================================
// Pyre / Captive（§28.41—50）
// ===========================================================================
describe('Fanatic §28 — Pyre / Captive', () => {
  it('41. Pyre 是独立 BattleActor（有 HP / Stance / 可攻击）', () => {
    expect(PYRE_PROTOTYPE.maxHp).toBeGreaterThan(0);
    expect(PYRE_PROTOTYPE.requiredStance).toBe('ranged');
    expect(isPyreInPlay(pyreActor())).toBe(true);
  });

  it('42. Pyre 有独立 Initiative', () => {
    const cards = createFanaticInitiativeSet(FANATIC_ID, PYRE_ID, 1);
    const pyreCard = cards.find((c) => c.actorKind === 'pyre')!;
    expect(pyreCard.actorId).toBe(PYRE_ID);
    expect(pyreCard.id.startsWith('pyre-init:')).toBe(true);
  });

  it('43. Pyre 可被攻击（is-in-play / area 可解析）', () => {
    expect(getPyreAreaId(pyreActor())).toBe('pyre-a');
    expect(getPyreAreaId(pyreActor({ alive: false }))).toBeNull();
  });

  it('44. Pyre 死亡后 Initiative 失效', () => {
    const ctx = baseRuntime();
    const death = resolvePyreDeath({ battleId: 'b1', runtime: ctx.runtime, captive: null });
    expect(death.invalidatedPyreCardId).toBe(ctx.runtime.pyreInitiativeCardId);
    expect(death.runtime.pyreInitiativeCardId).toBeNull();
  });

  it('45. Pyre 不进入 Monster Pool（无 spawn 字段）', () => {
    expect('spawnWeight' in PYRE_PROTOTYPE).toBe(false);
    expect('poolTags' in PYRE_PROTOTYPE).toBe(false);
    // Pyre 仅通过 getPyreDefinition 可达，不进正式池
    expect(getPyreDefinition(1, 'formal')).toBeUndefined();
  });

  it('46. Pyre 不产生普通 Loot（无 loot 字段）', () => {
    expect('loot' in PYRE_PROTOTYPE).toBe(false);
    expect('lootTable' in PYRE_PROTOTYPE).toBe(false);
  });

  it('47. Pyre Roll 先保存', () => {
    const res = resolvePyreAction({
      battleId: 'b1',
      initiativeCardId: 'pyre-init:pyre-actor:1',
      pyre: pyreActor(),
      hasCaptive: false,
      rng: scriptedRng(5),
      skillTable: PYRE_PROTOTYPE.skillIds,
    });
    expect(res.ok).toBe(true);
    expect(typeof res.skillRoll).toBe('number');
    expect(res.selectedSkillId).toBe(PYRE_PROTOTYPE.skillIds[0]);
    // Pyre 死亡后 Card 失效
    const dead = resolvePyreAction({ battleId: 'b1', initiativeCardId: 'c', pyre: pyreActor({ alive: false }), hasCaptive: false, rng: scriptedRng(1), skillTable: PYRE_PROTOTYPE.skillIds });
    expect(dead.ok).toBe(false);
    expect(dead.failure).toBe('pyre-dead');
  });

  it('48. Captive State 可保存（可 JSON 序列化，round-trip 相等）', () => {
    const ctx = baseRuntime();
    const res = throwHeroIntoPyre({
      runtime: ctx.runtime, heroId: 'hero-1', heroOriginalAreaId: 'hero-1', pyreAreaId: 'pyre-a',
      captiveEffect: ctx.captiveEffect, preludeTransactionId: 'tx-save', fanaticAlive: true,
      pyreInPlay: true, pyreAreaHasSpace: true, reached: true, now: '2026-08-01T00:00:00.000Z',
    });
    const roundTrip = JSON.parse(JSON.stringify(res.captive));
    expect(roundTrip).toEqual(res.captive);
  });

  it('49. Pyre 死亡触发 Release 流程（Definition 驱动）', () => {
    const ctx = baseRuntime();
    const thrown = throwHeroIntoPyre({
      runtime: ctx.runtime, heroId: 'hero-1', heroOriginalAreaId: 'hero-1', pyreAreaId: 'pyre-a',
      captiveEffect: ctx.captiveEffect, preludeTransactionId: 'tx-r', fanaticAlive: true,
      pyreInPlay: true, pyreAreaHasSpace: true, reached: true,
    });
    const death = resolvePyreDeath({ battleId: 'b1', runtime: thrown.runtime, captive: thrown.captive });
    // Prototype captiveEffect.onContainerDestroyed = 'released'
    expect(death.captiveResolution).toBe('released');
    expect(death.captive?.status).toBe('released');
  });

  it('50. Pyre 死亡后 Fanatic 不再 Prelude', () => {
    const ctx = baseRuntime();
    const death = resolvePyreDeath({ battleId: 'b1', runtime: ctx.runtime, captive: null });
    // 用死亡后的 runtime 再跑 Prelude → Pyre 已不在（pyre 参数 null）→ 跳过
    const r = resolveFanaticTurnPrelude({
      battleId: 'b1',
      initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[1],
      runtime: death.runtime,
      room: ctx.room,
      roomGraph: ctx.roomGraph,
      fanaticActor: fanaticActor(),
      pyre: null,
      heroActors: heroes(),
      captiveOccupants: [],
      movementValue: 3,
      captiveEffect: ctx.captiveEffect,
    });
    expect(r.outcome).toBe('skipped-pyre-not-in-play');
    expect(death.runtime.pyreActorId).toBeNull();
    expect(death.runtime.pyreRemovedReason).toBe('destroyed');
  });
});

// ===========================================================================
// Victory / Save（§28.51—65）
// ===========================================================================
describe('Fanatic §28 — Victory / Save', () => {
  function victory(opts: { pyreInPlay?: boolean; captive?: boolean; others?: string[] } = {}) {
    const ctx = baseRuntime();
    return resolveFanaticVictory({
      runtime: ctx.runtime,
      unresolvedFanaticCardIds: ctx.runtime.fanaticInitiativeCardIds.slice(),
      pyreInPlay: opts.pyreInPlay ?? true,
      captive: opts.captive
        ? {
            id: 'cap-1', captiveActorId: 'hero-1', captorActorId: FANATIC_ID, containerActorId: PYRE_ID,
            sourceType: 'fanatic-pyre', originalAreaId: 'hero-1', currentAreaId: 'pyre-a', status: 'inside-container',
            canAct: false, canMove: false, canUseSkill: false, canBeTargeted: true, onContainerTurn: 'none',
            onContainerDestroyed: 'released', createdAt: 'x', transactionId: 't',
          }
        : null,
      otherMonsterActorIds: opts.others ?? ['mob-1'],
    });
  }

  it('51. Fanatic 死亡立即 Victory', () => {
    expect(victory().bossDefeated).toBe(true);
    expect(victory().stoppedPreludeAndSkillQueue).toBe(true);
  });

  it('52. 三张 Fanatic Card 失效', () => {
    expect(victory().invalidatedFanaticCardIds).toHaveLength(3);
  });

  it('53. Pyre Card 失效（Pyre 在场时）', () => {
    expect(victory({ pyreInPlay: true }).invalidatedPyreCardId).not.toBeNull();
    expect(victory({ pyreInPlay: false }).invalidatedPyreCardId).toBeNull();
  });

  it('54. Pyre 被移除', () => {
    const v = victory({ pyreInPlay: true });
    expect(v.pyreRemoved).toBe(true);
    expect(v.removePyreReason).toBe('fanatic-defeated');
    expect(v.runtime.pyreActorId).toBeNull();
  });

  it('55. Captive 被清理', () => {
    expect(victory({ captive: true }).captiveCleared).toBe(true);
    expect(victory({ captive: true }).clearedCaptiveId).toBe('cap-1');
    expect(victory({ captive: false }).captiveCleared).toBe(false);
  });

  it('56. 其他 Monster 移除', () => {
    expect(victory({ others: ['mob-1', 'mob-2'] }).removedOtherMonsters).toBe(true);
    expect(victory({ others: [] }).removedOtherMonsters).toBe(false);
  });

  it('57. 固定 3 XP', () => {
    expect(victory().xpResult).toBe(3);
  });

  it('58. Campaign Advance 正确', () => {
    expect(victory().campaignAdvanced).toBe(true);
  });

  it('59. Family 记为 defeated', () => {
    expect(victory().familyDefeated).toBe(true);
  });

  it('60. Phase 9D 存档可迁移（version 10 → 11）', () => {
    const snap = migrateFanaticSave(10);
    expect(snap.version).toBe(11);
    expect(snap.fanaticBattleRuntime).toBeNull();
    expect(snap.fanaticDataAudit.length).toBeGreaterThan(0);
  });

  it('61. Active Snapshot 可恢复', () => {
    const h = hashFanaticRoomDefinition(FANATIC_PROTOTYPE_ROOM);
    const snapshot = { roomDefinitionId: FANATIC_PROTOTYPE_ROOM.id, roomHash: h };
    // 同 Hash + 进行中战斗 → 使用当前定义（useSnapshot false）
    const r = resolveActiveFanaticRoomDefinition(snapshot, FANATIC_PROTOTYPE_ROOM, true);
    expect(r.useSnapshot).toBe(false);
    expect(r.roomId).toBe(FANATIC_PROTOTYPE_ROOM.id);
  });

  it('62. Hash 变化时使用 Snapshot', () => {
    const oldHash = hashFanaticRoomDefinition(FANATIC_PROTOTYPE_ROOM);
    const snapshot = { roomDefinitionId: 'snap-room', roomHash: oldHash };
    const changedRoom = { ...FANATIC_PROTOTYPE_ROOM, id: 'changed', validAreaIds: [...FANATIC_PROTOTYPE_ROOM.validAreaIds, 'extra'] };
    const r = resolveActiveFanaticRoomDefinition(snapshot, changedRoom, true);
    expect(r.useSnapshot).toBe(true);
    expect(r.roomId).toBe('snap-room');
  });

  it('63. Prelude / Path / Captive 可恢复（Snapshot 字段齐备）', () => {
    const snap = migrateFanaticSave(10);
    expect(Array.isArray(snap.captiveActorStates)).toBe(true);
    expect(Array.isArray(snap.fanaticPreludeHistory)).toBe(true);
    expect(Array.isArray(snap.closestHeroSelectionHistory)).toBe(true);
    expect(Array.isArray(snap.throwIntoPyreHistory)).toBe(true);
    expect(Array.isArray(snap.pyreActionHistory)).toBe(true);
  });

  it('64. Victory 刷新不重复（幂等键稳定 + 纯函数确定性）', () => {
    expect(idempotencyKeys.victory('bb-1')).toBe(idempotencyKeys.victory('bb-1'));
    const a = victory();
    const b = victory();
    expect(a.xpResult).toBe(b.xpResult);
    expect(a.invalidatedFanaticCardIds).toEqual(b.invalidatedFanaticCardIds);
  });

  it('65. 损坏 Runtime 不白屏（repair 兜底）', () => {
    const fixed = repairFanaticRuntime(null);
    expect(fixed.fanaticActorId).toBe('fanatic-actor');
    expect(fixed.fanaticInitiativeCardIds).toHaveLength(3);
    expect(fixed.dataStatus).toBe('prototype');
    // 部分损坏也能修复
    const partial = repairFanaticRuntime({ fanaticActorId: 'x' });
    expect(partial.fanaticActorId).toBe('x');
    expect(partial.fanaticInitiativeCardIds).toHaveLength(3);
  });
});

// rollD10 边界（补充：确定性 RNG 落在 1—10）
describe('Fanatic — rollD10 边界', () => {
  it('rollD10 恒在 1—10', () => {
    const rng = scriptedRng(42);
    for (let i = 0; i < 200; i++) {
      const v = rollD10(rng);
      expect(v).toBeGreaterThanOrEqual(1);
      expect(v).toBeLessThanOrEqual(10);
    }
  });
});
