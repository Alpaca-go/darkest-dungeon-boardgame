// Phase 9C Playwright E2E（文档 §22 七个场景，纯逻辑层断言）。
// 说明：正式 Prophet 战斗数据缺失（见 docs/reports/phase-9c-prophet-data-audit.md），
// official battle 全线禁用，UI 尚未接入 Prophet DOM；因此 E2E 以导入运行时模块
// 并断言行为的方式，对「已核对规则」做集成校验。需浏览器时由 `npx playwright test` 驱动。
import { test, expect } from '@playwright/test';
import {
  PROPHET_ACTIONS_PER_ROUND,
  PROPHET_ACTION_OVERRIDES,
  PROPHET_PEW_COUNT,
  PROPHET_PROTOTYPE_BOSS,
  PROPHET_PROTOTYPE_ROOM,
  PROPHET_OFFICIAL_ROOM_LEVEL_1,
  getProphetDefinition,
  getProphetOfficialDataGaps,
  getProphetRoomDefinition,
  getProphetThreat,
  isProphetOfficialBattleEnabled,
  validateRoomMap,
} from '../src/data/bosses/prophet-family';
import {
  type AreaOccupant,
  beginProphetRound,
  canEnterArea,
  clearAllPews,
  countPewsInArea,
  createProphetBattleRuntime,
  createProphetInitiativeCards,
  getAreaOccupancy,
  getProphetActionSemantics,
  resolveAreaAttackTargets,
  resolveBossActionByOrdinal,
  resolveProphetPewPlacement,
  resolveProphetRubbleOfRuin,
  resolveProphetSecondAction,
  resolveProphetVictory,
  selectTargetableActorIds,
} from '../src/game-engine/prophet/runtime';
import type { RandomSource } from '../src/types/prophet';

// ---------------------------------------------------------------------------
// 测试工具：脚本化 RNG（硬约束——不得使用 Math.random()）
// ---------------------------------------------------------------------------

/** 按给定 d10 点数序列产出结果，超出后循环。 */
function scriptedRng(values: number[]): RandomSource {
  let i = 0;
  return () => {
    const v = values[i % values.length];
    i += 1;
    return (v - 1) / 10 + 0.001;
  };
}

const BATTLE_ID = 'e2e-prophet-battle';

/** 标准放置：掷 3 / 7 / 3 / 9 → prototype Room Map → B / D / B / E（B 区两个 Pew）。 */
function placeStandard() {
  const runtime = createProphetBattleRuntime('prophet-actor');
  const cards = createProphetInitiativeCards('prophet-actor', 1);
  return resolveProphetPewPlacement({
    battleId: BATTLE_ID,
    round: 1,
    initiativeCardId: cards[0].id,
    ordinal: 1,
    prophetAlive: true,
    runtime,
    room: PROPHET_PROTOTYPE_ROOM,
    rng: scriptedRng([3, 7, 3, 9]),
  });
}

const HEROES: AreaOccupant[] = [
  { actorId: 'hero-crusader', areaId: 'prototype-area-b', targetable: true },
  { actorId: 'hero-vestal', areaId: 'prototype-area-d', targetable: true },
];

// ---------------------------------------------------------------------------
// 场景一：Setup
// Reveal Prophet Room → Threat 停止 → Aggressive → 3 张 Initiative → 0 个 Pew
// ---------------------------------------------------------------------------

test('Setup：Prophet Room → Aggressive Stance → 三张 Initiative → 0 个 Pew', () => {
  // Aggressive Stance 部署（Room Definition 的 bossPlacement）
  expect(PROPHET_PROTOTYPE_ROOM.bossPlacement.stance).toBe('aggressive');
  expect(PROPHET_OFFICIAL_ROOM_LEVEL_1.bossPlacement.stance).toBe('aggressive');
  expect(PROPHET_PROTOTYPE_BOSS.actionsPerRound).toBe(3);
  // 每轮三张 Actor-specific Initiative
  expect(PROPHET_ACTIONS_PER_ROUND).toBe(3);
  const cards = createProphetInitiativeCards('prophet-actor', 1);
  expect(cards).toHaveLength(3);
  expect(cards.map((c) => c.actionOrdinal)).toEqual([1, 2, 3]);
  expect(cards.every((c) => c.actorId === 'prophet-actor')).toBe(true);
  expect(cards.every((c) => !c.resolved)).toBe(true);
  // 初始 0 个 Pew
  const runtime = createProphetBattleRuntime('prophet-actor');
  expect(runtime.activePewIds).toHaveLength(0);
  // Threat 数据缺失 → Threat 阶段无 Prophet 条目（Data Gate 覆盖）
  expect(getProphetThreat(1)).toBeUndefined();
});

// ---------------------------------------------------------------------------
// 场景二：Placement
// ordinal 1 → 固定 4d10 → 创建 4 个 Pews → 两个落同一 Area → 刷新保持
// ---------------------------------------------------------------------------

test('Placement：ordinal 1 掷 4 次 d10 → 四个独立 Pew → 两个同 Area → 刷新不重掷', () => {
  const result = placeStandard();
  expect(result.ok).toBe(true);
  // 正好四次 d10
  expect(result.record?.rolls).toEqual([3, 7, 3, 9]);
  expect(result.record?.rolls).toHaveLength(PROPHET_PEW_COUNT);
  // 四个独立 instance（同 Area 也不合并）
  expect(result.pews).toHaveLength(4);
  expect(new Set(result.pews.map((p) => p.id)).size).toBe(4);
  expect(result.pews.map((p) => p.targetAreaId)).toEqual([
    'prototype-area-b',
    'prototype-area-d',
    'prototype-area-b',
    'prototype-area-e',
  ]);
  // 同一 Area 两个 Pew
  expect(countPewsInArea(result.pews, 'prototype-area-b')).toBe(2);
  // 刷新（同一 initiativeCardId 重放）不得重掷
  const replay = resolveProphetPewPlacement({
    battleId: BATTLE_ID,
    round: 1,
    initiativeCardId: 'prophet-init:prophet-actor:1:1',
    ordinal: 1,
    prophetAlive: true,
    runtime: result.runtime,
    room: PROPHET_PROTOTYPE_ROOM,
    rng: scriptedRng([1, 1, 1, 1]),
  });
  expect(replay.ok).toBe(false);
  expect(replay.failure).toBe('already-resolved-this-round');
});

// ---------------------------------------------------------------------------
// 场景三：No Occupancy / No Target
// Area 有 2 个 Pews → Hero 可进入 → Capacity 不变 → Target 列表无 Pew
// ---------------------------------------------------------------------------

test('No Occupancy / No Target：Pew 不占位、不阻断进入、不可被 Target', () => {
  const { pews } = placeStandard();
  expect(countPewsInArea(pews, 'prototype-area-b')).toBe(2);

  // 占用数只算真实 Actor —— B 区两个 Pew + 一个 Hero，占用仍为 1
  const occupants: AreaOccupant[] = [HEROES[0]];
  expect(getAreaOccupancy(occupants, 'prototype-area-b')).toBe(1);
  // Capacity 2 时仍可进入
  expect(canEnterArea(occupants, 'prototype-area-b', 2)).toBe(true);
  // 即便 Capacity 只有 1 也不受 Pew 影响（由 Hero 占满决定，而非 Pew）
  expect(canEnterArea([], 'prototype-area-b', 1)).toBe(true);

  // Target Selector 过滤 Pew
  const targets = selectTargetableActorIds(occupants, pews, 'prototype-area-b');
  expect(targets).toEqual(['hero-crusader']);
  expect(targets.some((t) => t.includes('pew'))).toBe(false);
  // Area Attack 也不会命中 Pew
  const attackTargets = resolveAreaAttackTargets(occupants, pews, 'prototype-area-b');
  expect(attackTargets).toEqual(['hero-crusader']);
  // Pew 常驻标记
  expect(pews.every((p) => !p.targetable && !p.occupiesAreaSpace)).toBe(true);
  expect(pews.every((p) => !p.occupiesStance && !p.hasInitiative)).toBe(true);
});

// ---------------------------------------------------------------------------
// 场景四：Normal Skill
// ordinal 2 → 正常 Skill d10 → 不放 Pew → 不 Rubble
// ---------------------------------------------------------------------------

test('Normal Skill：ordinal 2 跑普通 Skill Table，不放 Pew、不执行 Rubble', () => {
  const placement = placeStandard();
  const second = resolveProphetSecondAction({
    round: 1,
    initiativeCardId: 'prophet-init:prophet-actor:1:2',
    ordinal: 2,
    runtime: placement.runtime,
    rng: scriptedRng([6]),
    skillTable: ['prototype-prophet-normal-strike'],
  });
  expect(second.ok).toBe(true);
  expect(second.skillRoll).toBe(6);
  expect(second.selectedSkillId).toBe('prototype-prophet-normal-strike');
  expect(second.placedPews).toBe(false);
  expect(second.executedRubble).toBe(false);
  // ordinal 2 不是 Pew 放置行动
  expect(getProphetActionSemantics(2)).toBe('normal-skill-table');
  expect(resolveBossActionByOrdinal(2, PROPHET_ACTION_OVERRIDES)).toBe('normal-skill-table');
  // Skill Table 缺失时 official 不可跑
  const gated = resolveProphetSecondAction({
    round: 1,
    initiativeCardId: 'prophet-init:prophet-actor:1:2-gated',
    ordinal: 2,
    runtime: placement.runtime,
    rng: scriptedRng([6]),
    skillTable: [],
  });
  expect(gated.ok).toBe(false);
  expect(gated.failure).toBe('skill-table-unavailable');
});

// ---------------------------------------------------------------------------
// 场景五：Rubble
// ordinal 3 → 4 个 Pew 分别攻击 → 同 Area 攻击两次 → 刷新不重复
// ---------------------------------------------------------------------------

test('Rubble：ordinal 3 逐 Pew 独立攻击，同 Area 结算两次，刷新不重复', () => {
  const placement = placeStandard();
  const rubble = resolveProphetRubbleOfRuin({
    battleId: BATTLE_ID,
    round: 1,
    initiativeCardId: 'prophet-init:prophet-actor:1:3',
    ordinal: 3,
    prophetAlive: true,
    runtime: placement.runtime,
    pews: placement.pews,
    occupants: HEROES,
    rng: scriptedRng([8, 2, 10, 5]),
  });
  expect(rubble.ok).toBe(true);
  // 四个 Pew → 四条独立攻击记录
  expect(rubble.attacks).toHaveLength(4);
  expect(new Set(rubble.attacks.map((a) => a.id)).size).toBe(4);
  // 同 Area（B）两次独立结算，各自 Accuracy / Crit
  const areaB = rubble.attacks.filter((a) => a.areaId === 'prototype-area-b');
  expect(areaB).toHaveLength(2);
  expect(new Set(areaB.map((a) => a.pewInstanceId)).size).toBe(2);
  // 未合并为一次双倍攻击：两条记录各自持有独立 attackRoll 与目标列表
  expect(typeof areaB[0].attackRoll).toBe('number');
  expect(typeof areaB[1].attackRoll).toBe('number');
  expect(areaB[0].targetActorIds).toEqual(['hero-crusader']);
  expect(areaB[1].targetActorIds).toEqual(['hero-crusader']);
  // 全部标记 resolved
  expect(rubble.pews.every((p) => p.status === 'resolved')).toBe(true);
  // 刷新重放不重复结算
  const replay = resolveProphetRubbleOfRuin({
    battleId: BATTLE_ID,
    round: 1,
    initiativeCardId: 'prophet-init:prophet-actor:1:3',
    ordinal: 3,
    prophetAlive: true,
    runtime: rubble.runtime,
    pews: rubble.pews,
    occupants: HEROES,
    rng: scriptedRng([8, 2, 10, 5]),
  });
  expect(replay.ok).toBe(false);
  expect(replay.failure).toBe('already-resolved-this-round');

  // 新一轮清掉已结算 Pew
  const next = beginProphetRound(rubble.runtime, rubble.pews, 2);
  expect(next.pews).toHaveLength(0);
  expect(next.runtime.completedActionOrdinalsThisRound).toHaveLength(0);
});

// ---------------------------------------------------------------------------
// 场景六：Prophet Death
// Pews 已放置 → ordinal 3 前 Prophet 死亡 → Pews 移除 → Rubble 不执行 → Battle 胜利
// ---------------------------------------------------------------------------

test('Prophet Death：ordinal 3 前死亡 → Rubble 不执行 → Pews 移除 → 立即胜利 3 XP', () => {
  const placement = placeStandard();
  expect(placement.pews.every((p) => p.status === 'telegraphed')).toBe(true);

  // Prophet 死亡 → Rubble 立即停止
  const rubble = resolveProphetRubbleOfRuin({
    battleId: BATTLE_ID,
    round: 1,
    initiativeCardId: 'prophet-init:prophet-actor:1:3',
    ordinal: 3,
    prophetAlive: false,
    runtime: placement.runtime,
    pews: placement.pews,
    occupants: HEROES,
    rng: scriptedRng([10, 10, 10, 10]),
  });
  expect(rubble.ok).toBe(false);
  expect(rubble.failure).toBe('prophet-dead');
  expect(rubble.attacks).toHaveLength(0);

  // 胜利结算：未抽卡失效、Pews 全部移除、其他 Monster 清除、3 XP、Campaign 推进
  const cards = createProphetInitiativeCards('prophet-actor', 1);
  const victory = resolveProphetVictory({
    initiativeCards: [{ ...cards[0], resolved: true }, cards[1], cards[2]],
    pews: placement.pews,
  });
  expect(victory.bossDefeated).toBe(true);
  expect(victory.stoppedSkillQueue).toBe(true);
  expect(victory.invalidatedInitiativeCardIds).toHaveLength(2);
  expect(victory.removedPewIds).toHaveLength(4);
  expect(victory.pews.every((p) => p.status === 'removed')).toBe(true);
  expect(victory.removedOtherMonsters).toBe(true);
  expect(victory.xpResult).toBe(3);
  expect(victory.campaignAdvanced).toBe(true);
  // 直接清除路径同样把全部 Pew 置为 removed
  expect(clearAllPews(placement.pews, 'battle-end').every((p) => p.status === 'removed')).toBe(true);
});

// ---------------------------------------------------------------------------
// 场景七：Data Gate
// 缺正式 Room Map → official battle 禁用 → Data Audit 显示缺口 → 开发模式走 Prototype Harness
// ---------------------------------------------------------------------------

test('Data Gate：正式 Room Map 缺失 → official 禁用 → 缺口可列举 → prototype harness 可用', () => {
  // 正式 Room Map 未提供 → 校验失败
  const official = validateRoomMap(PROPHET_OFFICIAL_ROOM_LEVEL_1);
  expect(official.isComplete).toBe(false);
  expect(official.missing.length).toBeGreaterThan(0);
  expect(PROPHET_OFFICIAL_ROOM_LEVEL_1.officialDataStatus).toBe('unavailable');
  // official battle 禁用
  expect(isProphetOfficialBattleEnabled()).toBe(false);
  expect(getProphetDefinition(1, 'formal')).toBeUndefined();
  expect(getProphetRoomDefinition(1, 'formal')?.validAreaIds).toHaveLength(0);
  // Data Audit 缺口可列举
  const gaps = getProphetOfficialDataGaps();
  expect(gaps.length).toBeGreaterThanOrEqual(4);
  expect(gaps.join(' ')).toContain('Room Map');
  // 开发模式仍可进入 prototype harness（且不冒充正式 ID）
  const proto = getProphetDefinition(1, 'prototype');
  expect(proto?.id).toBe('prototype-prophet-level-1-harness');
  expect(proto?.enabledInOfficialPool).toBe(false);
  expect(validateRoomMap(PROPHET_PROTOTYPE_ROOM).isComplete).toBe(true);
});
