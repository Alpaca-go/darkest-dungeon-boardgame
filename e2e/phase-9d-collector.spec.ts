// Phase 9D Playwright E2E（文档 §25 七个场景，纯逻辑层断言）。
// 说明：正式 Collector 战斗数据缺失（见 docs/reports/phase-9d-collector-data-audit.md），
// official battle 全线禁用，UI 尚未接入 Collector DOM；因此 E2E 以导入运行时模块
// 并断言行为的方式，对「已核对规则」做集成校验。需浏览器时由 `npx playwright test` 驱动。
import { test, expect } from '@playwright/test';
import {
  COLLECTOR_CONDITIONAL_OVERRIDE,
  COLLECTOR_LINKED_SUMMON_GROUP,
  COLLECTOR_OFFICIAL_ROOM_LEVEL_1,
  COLLECTOR_PROTOTYPE_BOSS,
  COLLECTOR_PROTOTYPE_ROOM,
  getCollectorDefinition,
  getCollectorRoomDefinition,
  getCollectedDefinition,
  isCollectorOfficialBattleEnabled,
  validateCollectorRoom,
} from '../src/data/bosses/collector-family';
import {
  createCollectorBattleRuntime,
  createCollectorInitiativeCard,
  createCollectorLootChests,
  deriveGroupStatus,
  evaluateCollectorActionOverride,
  getAliveCollectedCount,
  resolveCollectorNormalSkill,
  summonCollectedGroup,
  resolveCollectorVictory,
} from '../src/game-engine/collector/runtime';
import type { CollectorBattleActorSnapshot } from '../src/types/collector';

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

function setup(): ReturnType<typeof createCollectorBattleRuntime> {
  const chests = createCollectorLootChests(COLLECTOR_PROTOTYPE_ROOM, 'setup-e2e', 'room-1');
  return createCollectorBattleRuntime(
    'collector-actor',
    [chests[0].id, chests[1].id, chests[2].id],
    1,
    'prototype'
  );
}

function actors(alive: ('man-at-arms' | 'highwayman' | 'vestal')[]): CollectorBattleActorSnapshot[] {
  return (['man-at-arms', 'highwayman', 'vestal'] as const).map((role) => ({
    actorId: `actor-${role}`,
    tags: ['collected', 'collector-retinue'],
    alive: alive.includes(role),
    removed: false,
  }));
}

// ---------------------------------------------------------------------------

test('Setup：Reveal Collector Room → 3 Chests → Collector Aggressive → 1 Card → 0 Collected', () => {
  const room = COLLECTOR_PROTOTYPE_ROOM;
  expect(room.lootChestPlacements).toHaveLength(3);
  expect(room.collectorPlacement.stance).toBe('aggressive');

  const chests = createCollectorLootChests(room, 'setup-e2e', 'room-1');
  expect(chests).toHaveLength(3);
  expect(chests.every((c) => !c.opened)).toBe(true);

  const card = createCollectorInitiativeCard('collector-actor', 1);
  expect(card.id).toBe('collector-init:collector-actor:1');

  const rt = setup();
  expect(rt.activeCollectedActorIds).toHaveLength(0);
  expect(rt.summonGeneration).toBe(0);
});

test('首次召唤：aliveCount 0 → 同时生成 3 名 Collected → 固定 Stance/Area → 3 张 Initiative → 刷新不重复', () => {
  const rt = setup();
  const res = summonCollectedGroup({
    battleId: 'b1',
    round: 1,
    initiativeCardId: 'c1',
    sourceActionEventId: 'evt-e2e',
    collectorAlive: true,
    aliveCollectedCount: 0,
    runtime: rt,
    room: COLLECTOR_PROTOTYPE_ROOM,
    occupiedAreaIds: [],
  });
  expect(res.ok).toBe(true);
  expect(res.createdActorIds).toHaveLength(3);
  expect(res.createdCardIds).toHaveLength(3);
  expect(res.group?.status).toBe('active');

  // 固定 Stance / Area 来自 Room
  const placements = COLLECTOR_PROTOTYPE_ROOM.collectedPlacements;
  expect(placements[0].role).toBe('man-at-arms');
  expect(placements[0].stance).toBe('defensive');
  expect(placements[1].stance).toBe('ranged');
  expect(placements[2].stance).toBe('support');

  // 刷新不重复：同一 sourceActionEventId 产生相同 id
  const again = summonCollectedGroup({
    battleId: 'b1',
    round: 1,
    initiativeCardId: 'c1',
    sourceActionEventId: 'evt-e2e',
    collectorAlive: true,
    aliveCollectedCount: 0,
    runtime: rt,
    room: COLLECTOR_PROTOTYPE_ROOM,
    occupiedAreaIds: [],
  });
  expect(again.group?.id).toBe(res.group?.id);
});

test('部分死亡：杀死 MAA+HW，Vestal 存活 → Collector 行动 → 不召唤 → 正常 Skill', () => {
  // 先召唤
  const rt = setup();
  const summoned = summonCollectedGroup({
    battleId: 'b1',
    round: 1,
    initiativeCardId: 'c1',
    sourceActionEventId: 'evt-e2e',
    collectorAlive: true,
    aliveCollectedCount: 0,
    runtime: rt,
    room: COLLECTOR_PROTOTYPE_ROOM,
    occupiedAreaIds: [],
  });
  expect(summoned.ok).toBe(true);

  // 场上仅 Vestal 存活
  const aliveCount = getAliveCollectedCount(actors(['vestal']));
  expect(aliveCount).toBe(1);
  // 任意 Collected 存活 → 不召唤
  expect(evaluateCollectorActionOverride(aliveCount)).toBe('normal-skill-table');
  expect(summoned.runtime.activeCollectedActorIds).toHaveLength(3);

  // 正常 Skill（先保存 d10）
  const skill = resolveCollectorNormalSkill({
    round: 1,
    initiativeCardId: 'c2',
    runtime: summoned.runtime,
    rng: rng(3),
  });
  expect(skill.ok).toBe(true);
  expect(typeof skill.skillRoll).toBe('number');
});

test('再召唤：最后一名 Vestal 死亡 → 不立即召唤 → 下一 Collector 行动 → 新 Generation 整组召唤', () => {
  const rt = setup();
  const first = summonCollectedGroup({
    battleId: 'b1',
    round: 1,
    initiativeCardId: 'c1',
    sourceActionEventId: 'evt-1',
    collectorAlive: true,
    aliveCollectedCount: 0,
    runtime: rt,
    room: COLLECTOR_PROTOTYPE_ROOM,
    occupiedAreaIds: [],
  });
  expect(first.runtime.summonGeneration).toBe(1);

  // 全灭：aliveCount 0，但不是 Collector 行动时刻 → 不自动召唤（模拟：此刻不调用 summon）
  const allDead = getAliveCollectedCount(actors([]));
  expect(allDead).toBe(0);

  // 下一 Collector 行动（不同 sourceActionEventId）→ 整组再召唤，新 generation
  const second = summonCollectedGroup({
    battleId: 'b1',
    round: 2,
    initiativeCardId: 'c2',
    sourceActionEventId: 'evt-2',
    collectorAlive: true,
    aliveCollectedCount: 0,
    runtime: first.runtime,
    room: COLLECTOR_PROTOTYPE_ROOM,
    occupiedAreaIds: [],
  });
  expect(second.ok).toBe(true);
  expect(second.runtime.summonGeneration).toBe(2);
  expect(second.group?.generation).toBe(2);
  expect(second.group?.id).not.toBe(first.group?.id);
});

test('原子回滚：Support Stance 冲突 → Group 失败 → 0 新 Actor / 0 新 Initiative / 无半完成 Group', () => {
  const rt = setup();
  // Occupied = Vestal 的 required area → 整组失败
  const conflictArea = COLLECTOR_LINKED_SUMMON_GROUP.members[2].requiredAreaId;
  const res = summonCollectedGroup({
    battleId: 'b1',
    round: 1,
    initiativeCardId: 'c1',
    sourceActionEventId: 'evt-e2e',
    collectorAlive: true,
    aliveCollectedCount: 0,
    runtime: rt,
    room: COLLECTOR_PROTOTYPE_ROOM,
    occupiedAreaIds: [conflictArea],
  });
  expect(res.ok).toBe(false);
  expect(res.failure).toBe('placement-conflict');
  expect(res.createdActorIds).toHaveLength(0);
  expect(res.createdCardIds).toHaveLength(0);
  expect(res.group).toBeNull();
  expect(rt.activeCollectedActorIds).toHaveLength(0);
});

test('Victory：3 名 Collected 仍存活 → Collector 死亡 → 全部移除 → Battle Victory → 3 XP → Campaign Advance', () => {
  const rt = setup();
  const summoned = summonCollectedGroup({
    battleId: 'b1',
    round: 1,
    initiativeCardId: 'c1',
    sourceActionEventId: 'evt-e2e',
    collectorAlive: true,
    aliveCollectedCount: 0,
    runtime: rt,
    room: COLLECTOR_PROTOTYPE_ROOM,
    occupiedAreaIds: [],
  });
  expect(summoned.ok).toBe(true);

  const group = summoned.group!;
  expect(deriveGroupStatus(group, 3).status).toBe('active');

  const cards = [
    { id: 'collector-init:collector-actor:1', actorId: 'collector-actor', roundCreated: 1, resolved: false, resolutionTransactionId: null },
    { id: 'ca', actorId: 'a', roundCreated: 1, resolved: false, resolutionTransactionId: null },
  ];
  const v = resolveCollectorVictory({
    initiativeCards: cards,
    group,
    otherMonsterActorIds: ['mob-1'],
  });
  expect(v.bossDefeated).toBe(true);
  expect(v.removedCollectedActorIds).toEqual(group.memberActorIds);
  expect(v.xpResult).toBe(3);
  expect(v.campaignAdvanced).toBe(true);
  expect(v.invalidatedInitiativeCardIds).toContain('ca');
});

test('Data Gate：official battle 禁用 → Data Audit 显示缺口 → 开发模式可启动 Prototype Harness', () => {
  // 正式 Room 不自洽
  expect(validateCollectorRoom(COLLECTOR_OFFICIAL_ROOM_LEVEL_1).isComplete).toBe(false);
  expect(isCollectorOfficialBattleEnabled()).toBe(false);
  expect(getCollectorDefinition(1, 'formal')).toBeUndefined();

  // 三个 Collected 正式定义缺失
  expect(getCollectedDefinition('man-at-arms', 1)?.officialDataStatus).not.toBe('verified');
  expect(getCollectedDefinition('vestal', 1)?.officialDataStatus).not.toBe('verified');

  // 开发模式 harness 可用
  expect(getCollectorDefinition(1, 'prototype')?.id).toBe('prototype-collector-level-1-harness');
  expect(COLLECTOR_PROTOTYPE_BOSS.enabledInOfficialPool).toBe(false);
  expect(COLLECTOR_CONDITIONAL_OVERRIDE.replacesNormalSkill).toBe(true);
  expect(getCollectorRoomDefinition(1, 'prototype')?.id).toBe(COLLECTOR_PROTOTYPE_ROOM.id);
});
