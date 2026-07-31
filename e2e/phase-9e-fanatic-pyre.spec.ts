// Phase 9E Playwright E2E（文档 §29 八个场景，纯逻辑层断言）。
// 说明：正式 Fanatic / Pyre 战斗数据缺失（见 docs/reports/phase-9e-fanatic-pyre-data-audit.md），
// official battle 全线禁用，UI 尚未接入 Fanatic/Pyre DOM；因此 E2E 以导入运行时模块
// 并断言行为的方式，对「已核对规则」做集成校验（与 Phase 9D Collector E2E 同构）。
// 需浏览器时由 `npx playwright test` 驱动；本套用例不依赖 page（纯规则集成）。
import { test, expect } from '@playwright/test';
import {
  FANATIC_OFFICIAL_ROOM_LEVEL_1,
  FANATIC_PROTOTYPE_AREA_GRAPH,
  FANATIC_PROTOTYPE_BOSS,
  FANATIC_PROTOTYPE_BOSS_ID,
  FANATIC_PROTOTYPE_ROOM,
  PYRE_PROTOTYPE_CAPTIVE_EFFECT,
  getFanaticDefinition,
  getFanaticOfficialDataGaps,
  getFanaticThreat,
  getPyreCaptiveEffectDefinition,
  getPyreDefinition,
  isFanaticOfficialBattleEnabled,
  validateFanaticRoom,
} from '../src/data/bosses/fanatic-family';
import {
  createFanaticInitiativeSet,
  resolveFanaticNormalSkill,
  resolveFanaticTurnPrelude,
  resolveFanaticVictory,
  resolvePyreDeath,
  setupPrototypeFanaticBattle,
  throwHeroIntoPyre,
} from '../src/game-engine/fanatic/runtime';
import type { FanaticBattleActorSnapshot } from '../src/game-engine/fanatic/runtime';

// 确定性 RNG（mulberry32）
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Prototype Room Area 常量（与 fanatic-family.ts 对齐）
const AREA_FANATIC = 'fanatic-a';
const AREA_PYRE = 'pyre-a';
const AREA_HERO = ['hero-1', 'hero-2', 'hero-3', 'hero-4'];

function fanaticActor(areaId = AREA_FANATIC): FanaticBattleActorSnapshot {
  return { actorId: 'fanatic-actor', tags: ['fanatic', 'boss'], alive: true, removed: false, areaId };
}
function pyreActor(alive = true, areaId = AREA_PYRE): FanaticBattleActorSnapshot {
  return { actorId: 'pyre-actor', tags: ['pyre', 'fanatic-linked-entity'], alive, removed: !alive, areaId };
}
function hero(
  id: string,
  areaId: string,
  position: number,
  alive = true
): FanaticBattleActorSnapshot {
  return { actorId: id, tags: ['hero'], alive, removed: false, areaId, position };
}

const MOVEMENT = FANATIC_PROTOTYPE_BOSS.stats.movement; // 原型 = 3

// ---------------------------------------------------------------------------

test('Setup：Reveal Fanatic Room → Threat 停止 → Fanatic Aggressive → Pyre Ranged → 3 Fanatic Card + 1 Pyre Card', () => {
  const room = FANATIC_PROTOTYPE_ROOM;
  // 固定 Stance 来自 Room Definition
  expect(room.fanaticPlacement.stance).toBe('aggressive');
  expect(room.pyrePlacement.stance).toBe('ranged');
  // Threat 数据缺失 → 无 Threat（Reveal 后停止 Threat 流程）
  expect(getFanaticThreat(1)).toBeUndefined();

  // 3 张 Fanatic + 1 张 Pyre = 4 张
  const cards = createFanaticInitiativeSet('fanatic-actor', 'pyre-actor', 1);
  expect(cards).toHaveLength(4);
  expect(cards.filter((c) => c.actorKind === 'fanatic')).toHaveLength(3);
  expect(cards.filter((c) => c.actorKind === 'pyre')).toHaveLength(1);
  expect(cards.filter((c) => c.actorKind === 'fanatic').map((c) => c.ordinal)).toEqual([1, 2, 3]);

  const ctx = setupPrototypeFanaticBattle();
  expect(ctx.runtime.fanaticInitiativeCardIds).toHaveLength(3);
  expect(ctx.runtime.pyreInitiativeCardId).not.toBeNull();
  expect(ctx.runtime.activeCaptiveHeroId).toBeNull();
});

test('Prelude Move：Pyre 在场且有空间 → Fanatic 行动 → 选择最近 Hero → 按路径移动 → 刷新不重复', () => {
  const ctx = setupPrototypeFanaticBattle();
  // 存活 Hero 在 hero-4（距离 4 > 移动值 3）；hero-1 已阵亡（应被候选过滤）
  const heroes = [hero('h-dead', AREA_HERO[0], 1, false), hero('h4', AREA_HERO[3], 4, true)];

  const first = resolveFanaticTurnPrelude({
    battleId: 'b-move',
    initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[0],
    runtime: ctx.runtime,
    room: ctx.room,
    roomGraph: ctx.roomGraph,
    fanaticActor: fanaticActor(),
    pyre: pyreActor(),
    heroActors: heroes,
    captiveOccupants: [],
    movementValue: MOVEMENT,
    captiveEffect: ctx.captiveEffect,
  });

  // 选择最近（唯一存活）Hero；死亡 Hero 被过滤
  expect(first.selection?.selectedHeroId).toBe('h4');
  expect(first.selection?.candidateHeroIds).toEqual(['h4']);
  // 按路径移动：受移动值上限，走 3 步到 hero-3，未到达 hero-4
  expect(first.movement?.stepsUsed).toBe(MOVEMENT);
  expect(first.movement?.toAreaId).toBe(AREA_HERO[2]);
  expect(first.movement?.path).toEqual([AREA_FANATIC, AREA_HERO[0], AREA_HERO[1], AREA_HERO[2]]);
  expect(first.outcome).toBe('moved-not-reached');
  expect(first.proceedToNormalSkill).toBe(true);

  // 刷新不重复：同一 Card 再次评估 → 已处理跳过，不重复危险事务
  const again = resolveFanaticTurnPrelude({
    battleId: 'b-move',
    initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[0],
    runtime: first.runtime,
    room: ctx.room,
    roomGraph: ctx.roomGraph,
    fanaticActor: fanaticActor(),
    pyre: pyreActor(),
    heroActors: heroes,
    captiveOccupants: [],
    movementValue: MOVEMENT,
    captiveEffect: ctx.captiveEffect,
  });
  expect(again.outcome).toBe('skipped-already-processed');
  expect(again.transactionId).toBe(first.transactionId);
});

test('Throw Into Pyre：Fanatic 到达 Hero → Hero 移动到 Pyre Area → Captive State 创建 → 刷新保持', () => {
  const ctx = setupPrototypeFanaticBattle();
  // Hero 在 hero-1（距离 1，移动值 3 内可达并到达）
  const heroes = [hero('h1', AREA_HERO[0], 1, true)];

  const res = resolveFanaticTurnPrelude({
    battleId: 'b-throw',
    initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[0],
    runtime: ctx.runtime,
    room: ctx.room,
    roomGraph: ctx.roomGraph,
    fanaticActor: fanaticActor(),
    pyre: pyreActor(),
    heroActors: heroes,
    captiveOccupants: [],
    movementValue: MOVEMENT,
    captiveEffect: ctx.captiveEffect,
  });

  expect(res.outcome).toBe('threw-hero-into-pyre');
  expect(res.captive).not.toBeNull();
  // Hero 移动到 Pyre Area，Captive State 创建（行为字段来自 Definition）
  expect(res.captive?.currentAreaId).toBe(AREA_PYRE);
  expect(res.captive?.status).toBe('inside-container');
  expect(res.captive?.captiveActorId).toBe('h1');
  expect(res.captive?.canAct).toBe(PYRE_PROTOTYPE_CAPTIVE_EFFECT.canAct);
  expect(res.captive?.onContainerDestroyed).toBe(PYRE_PROTOTYPE_CAPTIVE_EFFECT.onContainerDestroyed);
  expect(res.runtime.activeCaptiveHeroId).toBe('h1');

  // 刷新保持：同一 Card 再评估 → 已处理跳过，Captive 保留（不重复抓取）
  const again = resolveFanaticTurnPrelude({
    battleId: 'b-throw',
    initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[0],
    runtime: res.runtime,
    room: ctx.room,
    roomGraph: ctx.roomGraph,
    fanaticActor: fanaticActor(),
    pyre: pyreActor(),
    heroActors: heroes,
    captiveOccupants: [{ areaId: AREA_PYRE }],
    movementValue: MOVEMENT,
    captiveEffect: ctx.captiveEffect,
  });
  expect(again.outcome).toBe('skipped-already-processed');
  expect(again.runtime.activeCaptiveHeroId).toBe('h1');
});

test('Area Full：Pyre Area 无空间 → Fanatic 行动 → 跳过 Prelude → 正常使用 Skill', () => {
  const ctx = setupPrototypeFanaticBattle();
  const heroes = [hero('h1', AREA_HERO[0], 1, true)];

  const res = resolveFanaticTurnPrelude({
    battleId: 'b-full',
    initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[0],
    runtime: ctx.runtime,
    room: ctx.room,
    roomGraph: ctx.roomGraph,
    fanaticActor: fanaticActor(),
    pyre: pyreActor(),
    heroActors: heroes,
    // Pyre Area 已被占满（capacity 1，占用 1 → 剩余 0）
    captiveOccupants: [{ areaId: AREA_PYRE }],
    movementValue: MOVEMENT,
    captiveEffect: ctx.captiveEffect,
  });

  expect(res.outcome).toBe('skipped-pyre-area-full');
  expect(res.captive).toBeNull();
  // 跳过抓取后仍进入普通 Skill
  expect(res.proceedToNormalSkill).toBe(true);
  const skill = resolveFanaticNormalSkill({ rng: rng(7) });
  expect(skill.ok).toBe(true);
  expect(skill.selectedSkillId).toBe('prototype-fanatic-normal-skill');
});

test('Pyre Death：Hero 已在 Pyre 中 → Pyre 死亡 → Pyre Initiative 失效 → Captive 按 Definition 释放 → 后续 Fanatic 不再 Prelude', () => {
  const ctx = setupPrototypeFanaticBattle();
  // 先制造一名 Captive
  const thrown = throwHeroIntoPyre({
    runtime: ctx.runtime,
    heroId: 'h1',
    heroOriginalAreaId: AREA_HERO[0],
    pyreAreaId: AREA_PYRE,
    captiveEffect: ctx.captiveEffect,
    preludeTransactionId: 'prelude-x',
    fanaticAlive: true,
    pyreInPlay: true,
    pyreAreaHasSpace: true,
    reached: true,
  });
  expect(thrown.ok).toBe(true);

  // Pyre 死亡
  const death = resolvePyreDeath({
    battleId: 'b-pyredeath',
    runtime: thrown.runtime,
    captive: thrown.captive,
  });
  expect(death.pyreRemoved).toBe(true);
  // Pyre Initiative 失效
  expect(death.invalidatedPyreCardId).toBe(ctx.runtime.pyreInitiativeCardId);
  // Captive 按 Definition 释放（prototype captive effect onContainerDestroyed = 'released'）
  expect(death.captiveResolution).toBe('released');
  expect(death.captive?.status).toBe('released');
  expect(death.runtime.pyreActorId).toBeNull();

  // 后续 Fanatic 行动：Pyre 不在场 → 跳过抓取 Prelude
  const nextTurn = resolveFanaticTurnPrelude({
    battleId: 'b-pyredeath',
    initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[1],
    runtime: death.runtime,
    room: ctx.room,
    roomGraph: ctx.roomGraph,
    fanaticActor: fanaticActor(),
    pyre: pyreActor(false), // Pyre 已死
    heroActors: [hero('h2', AREA_HERO[1], 2, true)],
    captiveOccupants: [],
    movementValue: MOVEMENT,
    captiveEffect: ctx.captiveEffect,
  });
  expect(nextTurn.outcome).toBe('skipped-pyre-not-in-play');
  expect(nextTurn.proceedToNormalSkill).toBe(true);
});

test('Three Fanatic Turns：一轮 3 张 Fanatic Card → 每次都评估 Prelude → 每次普通 Skill 只执行一次', () => {
  const ctx = setupPrototypeFanaticBattle();
  let runtime = ctx.runtime;
  const heroes = [hero('h1', AREA_HERO[0], 1, true), hero('h2', AREA_HERO[1], 2, true)];

  const preludeTxns: string[] = [];
  const skillRolls: number[] = [];

  for (let i = 0; i < 3; i++) {
    const prelude = resolveFanaticTurnPrelude({
      battleId: 'b-3turns',
      initiativeCardId: ctx.runtime.fanaticInitiativeCardIds[i],
      runtime,
      room: ctx.room,
      roomGraph: ctx.roomGraph,
      fanaticActor: fanaticActor(),
      pyre: pyreActor(),
      heroActors: heroes,
      // 每张卡 Pyre 已被首次抓取占满（保持单一 captive 语义稳定）
      captiveOccupants: i === 0 ? [] : [{ areaId: AREA_PYRE }],
      movementValue: MOVEMENT,
      captiveEffect: ctx.captiveEffect,
    });
    runtime = prelude.runtime;
    preludeTxns.push(prelude.transactionId);
    // 无论抓取与否都进入普通 Skill，且每张卡只执行一次
    expect(prelude.proceedToNormalSkill).toBe(true);
    const skill = resolveFanaticNormalSkill({ rng: rng(100 + i) });
    expect(skill.ok).toBe(true);
    skillRolls.push(skill.skillRoll!);
  }

  // 三张卡各自评估（transactionId 互不相同）
  expect(new Set(preludeTxns).size).toBe(3);
  // 每张卡各执行一次普通 Skill
  expect(skillRolls).toHaveLength(3);
});

test('Fanatic Victory：Pyre 仍存活 → Fanatic 死亡 → Pyre 移除 → Captive 清理 → Battle Victory → 3 XP → Campaign Advance', () => {
  const ctx = setupPrototypeFanaticBattle();
  // 先抓一名 Captive，并保留 Pyre 在场
  const thrown = throwHeroIntoPyre({
    runtime: ctx.runtime,
    heroId: 'h1',
    heroOriginalAreaId: AREA_HERO[0],
    pyreAreaId: AREA_PYRE,
    captiveEffect: ctx.captiveEffect,
    preludeTransactionId: 'prelude-v',
    fanaticAlive: true,
    pyreInPlay: true,
    pyreAreaHasSpace: true,
    reached: true,
  });

  const victory = resolveFanaticVictory({
    runtime: thrown.runtime,
    unresolvedFanaticCardIds: [
      ctx.runtime.fanaticInitiativeCardIds[1],
      ctx.runtime.fanaticInitiativeCardIds[2],
    ],
    pyreInPlay: true,
    captive: thrown.captive,
    otherMonsterActorIds: ['mob-1'],
  });

  expect(victory.bossDefeated).toBe(true);
  expect(victory.stoppedPreludeAndSkillQueue).toBe(true);
  // Pyre 仍存活 → 一并移除，Pyre Card 失效
  expect(victory.pyreRemoved).toBe(true);
  expect(victory.invalidatedPyreCardId).toBe(ctx.runtime.pyreInitiativeCardId);
  expect(victory.removePyreReason).toBe('fanatic-defeated');
  // Captive 清理
  expect(victory.captiveCleared).toBe(true);
  expect(victory.clearedCaptiveId).toBe(thrown.captive?.id);
  // 复用既有 3 XP + Campaign Advance
  expect(victory.xpResult).toBe(3);
  expect(victory.familyDefeated).toBe(true);
  expect(victory.campaignAdvanced).toBe(true);
  expect(victory.runtime.pyreActorId).toBeNull();
});

test('Data Gate：Pyre Captive Effect 缺失 → official Fanatic 不可启动 → Data Audit 显示缺口 → 开发模式可进入 Prototype Harness', () => {
  // 正式 Room 不自洽（留空映射）
  expect(validateFanaticRoom(FANATIC_OFFICIAL_ROOM_LEVEL_1).isComplete).toBe(false);
  // official battle 全线禁用
  expect(isFanaticOfficialBattleEnabled()).toBe(false);
  expect(getFanaticDefinition(1, 'formal')).toBeUndefined();
  expect(getPyreDefinition(1, 'formal')).toBeUndefined();
  // Pyre Captive Effect 正式定义缺失
  expect(getPyreCaptiveEffectDefinition('formal')).toBeUndefined();

  // Data Audit 显示缺口（含 Captive / 释放规则）
  const gaps = getFanaticOfficialDataGaps();
  expect(gaps.some((g) => g.includes('pyre-captive-effect'))).toBe(true);
  expect(gaps.length).toBeGreaterThan(0);

  // 开发模式可进入 Prototype Harness（绝不进正式池）
  expect(getFanaticDefinition(1, 'prototype')?.id).toBe(FANATIC_PROTOTYPE_BOSS_ID);
  expect(FANATIC_PROTOTYPE_BOSS.enabledInOfficialPool).toBe(false);
  expect(getPyreCaptiveEffectDefinition('prototype')?.id).toBe(PYRE_PROTOTYPE_CAPTIVE_EFFECT.id);
});
