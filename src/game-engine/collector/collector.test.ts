// Phase 9D §24：Collector / Collected Heroes / Linked Summon Group 单元测试。
// 覆盖文档 §24 验收点（Family/Room/Chest/Summon/Selector/Atomic/Stance/Initiative/
// Rollback/Conflict/Idempotency/MonsterActor/Victory/Save 等）。

import { describe, expect, it } from 'vitest';
import { createNewCampaign } from '../campaign';
import {
  COLLECTED_PROTOTYPE_IDS,
  COLLECTOR_CONDITIONAL_OVERRIDE,
  COLLECTOR_LINKED_SUMMON_GROUP,
  COLLECTOR_OFFICIAL_ROOM_LEVEL_1,
  COLLECTOR_PROTOTYPE_BOSS,
  COLLECTOR_PROTOTYPE_ROOM,
  getCollectorDefinition,
  getCollectorNormalSkillTable,
  getCollectorRoomDefinition,
  getCollectedDefinition,
  isCollectorOfficialBattleEnabled,
  resolveCollectorActionOverride,
  validateCollectorFamily,
  validateCollectorRoom,
} from '../../data/bosses/collector-family';
import {
  CollectorBattleActorSnapshot,
  CollectorInitiativeCard,
  SummonCollectedGroupResult,
  createCollectorBattleRuntime,
  createCollectorInitiativeCard,
  createCollectorLootChests,
  deriveGroupStatus,
  evaluateCollectorActionOverride,
  getAliveCollectedActors,
  getAliveCollectedCount,
  hashCollectorRoomDefinition,
  migrateCollectorSave,
  repairCollectorRuntime,
  resolveCollectorLootChest,
  resolveCollectorLootChestId,
  resolveCollectorNormalSkill,
  resolveCollectorVictory,
  summonCollectedGroup,
} from './runtime';
import { LinkedSummonGroupRecord } from '../../types/collector';

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

function makeRuntime(): ReturnType<typeof createCollectorBattleRuntime> {
  const chests = createCollectorLootChests(COLLECTOR_PROTOTYPE_ROOM, 'setup-1', 'room-1');
  return createCollectorBattleRuntime(
    'collector-actor',
    [chests[0].id, chests[1].id, chests[2].id],
    1,
    'prototype'
  );
}

function actorSnapshots(aliveRoles: ('man-at-arms' | 'highwayman' | 'vestal')[]): CollectorBattleActorSnapshot[] {
  const all: ('man-at-arms' | 'highwayman' | 'vestal')[] = ['man-at-arms', 'highwayman', 'vestal'];
  return all.map((role) => ({
    actorId: `actor-${role}`,
    tags: ['collected', 'collector-retinue'],
    alive: aliveRoles.includes(role),
    removed: false,
  }));
}

describe('Collector §24 — Family / Definition / Room 校验', () => {
  it('1. 家族 Registry 与查询函数可解析', () => {
    expect(getCollectorDefinition(1, 'prototype')?.id).toBe('prototype-collector-level-1-harness');
    expect(getCollectorDefinition(1, 'formal')).toBeUndefined();
    expect(getCollectorDefinition(2)).toBeUndefined();
    expect(getCollectorRoomDefinition(1, 'prototype')?.id).toBe(COLLECTOR_PROTOTYPE_ROOM.id);
    expect(getCollectedDefinition('man-at-arms', 1)?.id).toBe(COLLECTED_PROTOTYPE_IDS['man-at-arms']);
  });

  it('2. Prototype Room 自洽，正式 Room 不自洽（Data Gate）', () => {
    const proto = validateCollectorRoom(COLLECTOR_PROTOTYPE_ROOM);
    expect(proto.isComplete).toBe(true);
    const official = validateCollectorRoom(COLLECTOR_OFFICIAL_ROOM_LEVEL_1);
    expect(official.isComplete).toBe(false);
    expect(official.missing.length).toBeGreaterThan(0);
    expect(isCollectorOfficialBattleEnabled()).toBe(false);
  });

  it('3. official battle 禁用；家族校验不报误启用', () => {
    expect(isCollectorOfficialBattleEnabled()).toBe(false);
    const issues = validateCollectorFamily();
    expect(issues.some((i) => i.targetId === COLLECTOR_PROTOTYPE_BOSS.id && i.kind === 'unverified')).toBe(
      false
    );
  });
});

describe('Collector §24 — 3 Loot Chests / Setup / Initiative', () => {
  it('4. 恰好三个 Chest，固定 Area，只创建一次（id 幂等）', () => {
    const c1 = createCollectorLootChests(COLLECTOR_PROTOTYPE_ROOM, 'setup-x', 'room-1');
    const c2 = createCollectorLootChests(COLLECTOR_PROTOTYPE_ROOM, 'setup-x', 'room-1');
    expect(c1).toHaveLength(3);
    expect(c1.map((c) => c.id)).toEqual(c2.map((c) => c.id)); // 刷新稳定
    expect(c1[0].areaId).toBe(COLLECTOR_PROTOTYPE_ROOM.lootChestPlacements[0].areaId);
    expect(c1.every((c) => c.source === 'collector-room' && !c.opened)).toBe(true);
  });

  it('5. Collector Aggressive Stance 与一张 Initiative', () => {
    expect(COLLECTOR_PROTOTYPE_ROOM.collectorPlacement.stance).toBe('aggressive');
    const card = createCollectorInitiativeCard('collector-actor', 1);
    expect(card.id).toBe('collector-init:collector-actor:1');
    expect(card.resolved).toBe(false);
  });

  it('6. Collected 初始不生成（Reserve，非 BattleActor）', () => {
    const rt = makeRuntime();
    expect(rt.activeCollectedActorIds).toHaveLength(0);
    expect(rt.activeSummonGroupId).toBeNull();
    expect(rt.summonGeneration).toBe(0);
  });
});

describe('Collector §24 — Selector / Conditional Override', () => {
  it('7. aliveCount 为 0 → Summon；> 0 → 普通 Skill', () => {
    expect(resolveCollectorActionOverride(0)).toBe('summon-collected-group');
    expect(resolveCollectorActionOverride(1)).toBe('normal-skill-table');
    expect(resolveCollectorActionOverride(3)).toBe('normal-skill-table');
  });

  it('8. evaluateCollectorActionOverride 与条件定义一致', () => {
    expect(COLLECTOR_CONDITIONAL_OVERRIDE.condition.type).toBe('no-alive-actors-with-tag');
    expect(evaluateCollectorActionOverride(getAliveCollectedCount(actorSnapshots([])))).toBe(
      'summon-collected-group'
    );
    expect(evaluateCollectorActionOverride(getAliveCollectedCount(actorSnapshots(['vestal'])))).toBe(
      'normal-skill-table'
    );
  });

  it('9. Selector 仅识别 collected 标签且 alive 且未 removed', () => {
    const actors: CollectorBattleActorSnapshot[] = [
      ...actorSnapshots(['man-at-arms', 'highwayman']),
      { actorId: 'hero-1', tags: [], alive: true, removed: false },
      { actorId: 'dead-collected', tags: ['collected'], alive: false, removed: false },
      { actorId: 'removed-collected', tags: ['collected'], alive: true, removed: true },
    ];
    expect(getAliveCollectedActors(actors)).toEqual(['actor-man-at-arms', 'actor-highwayman']);
    expect(getAliveCollectedCount(actors)).toBe(2);
  });
});

describe('Collector §24 — 原子三单位召唤 / 固定 Stance-Area / 动态 Initiative', () => {
  it('10. aliveCount 0 时原子创建 3 名 Actor + 3 张 Card', () => {
    const rt = makeRuntime();
    const res = resolveCollectorSummon(rt, 0);
    expect(res.ok).toBe(true);
    expect(res.createdActorIds).toHaveLength(3);
    expect(res.createdCardIds).toHaveLength(3);
    expect(new Set(res.createdActorIds).size).toBe(3);
    expect(res.group?.status).toBe('active');
    expect(rt.summonGeneration).toBe(0); // runtime 是值传递，需取 res.runtime
    expect(res.runtime.summonGeneration).toBe(1);
    expect(res.runtime.activeCollectedActorIds).toEqual(res.createdActorIds);
  });

  it('11. 固定 Stance / Area 来自 Room（不用 First Empty Stance）', () => {
    const res = resolveCollectorSummon(makeRuntime(), 0);
    const members = COLLECTOR_LINKED_SUMMON_GROUP.members;
    // 成员顺序固定：man-at-arms→defensive, highwayman→ranged, vestal→support
    expect(members[0].role).toBe('man-at-arms');
    expect(members[0].requiredStance).toBe('defensive');
    expect(members[1].requiredStance).toBe('ranged');
    expect(members[2].requiredStance).toBe('support');
    expect(res.group?.memberActorIds).toHaveLength(3);
  });

  it('12. 三张 Card 绑定正确 Actor（id 含 role）', () => {
    const res = resolveCollectorSummon(makeRuntime(), 0);
    expect(res.createdCardIds[0]).toContain('man-at-arms');
    expect(res.createdCardIds[1]).toContain('highwayman');
    expect(res.createdCardIds[2]).toContain('vestal');
    expect(res.createdActorIds[0]).toContain('man-at-arms');
  });

  it('13. aliveCount > 0 时不召唤（Summon 完全替代普通 Skill）', () => {
    const res = resolveCollectorSummon(makeRuntime(), 1);
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('alive-collected-present');
    expect(res.createdActorIds).toHaveLength(0);
    expect(res.createdCardIds).toHaveLength(0);
  });

  it('14. Collector 死亡时不召唤', () => {
    const res = resolveCollectorSummon(makeRuntime(), 0, { collectorAlive: false });
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('collector-dead');
  });
});

describe('Collector §24 — 原子回滚 / Stance Conflict', () => {
  it('15. 固定 Area 被异常 Actor 占用 → 整组失败，0 Actor / 0 Card', () => {
    const rt = makeRuntime();
    const occupied = [COLLECTOR_LINKED_SUMMON_GROUP.members[1].requiredAreaId]; // highwayman area
    const res = resolveCollectorSummon(rt, 0, { occupiedAreaIds: occupied });
    expect(res.ok).toBe(false);
    expect(res.failure).toBe('placement-conflict');
    expect(res.createdActorIds).toHaveLength(0);
    expect(res.createdCardIds).toHaveLength(0);
    expect(res.group).toBeNull();
  });

  it('16. 刷新不重复 Summon / Insert（id 幂等于 sourceActionEventId+generation）', () => {
    const r1 = resolveCollectorSummon(makeRuntime(), 0, { evt: 'evt-A' });
    const r2 = resolveCollectorSummon(makeRuntime(), 0, { evt: 'evt-A' });
    expect(r1.group?.id).toBe(r2.group?.id);
    expect(r1.createdActorIds).toEqual(r2.createdActorIds);
  });
});

describe('Collector §24 — 部分死亡 / 全灭再召唤 / 新 Generation', () => {
  it('17. 单个死亡使 Group partially-defeated；全灭使 defeated', () => {
    const g: LinkedSummonGroupRecord = {
      id: 'collector-summon-group:evt-1:1',
      sourceActorId: 'collector-actor',
      sourceActionEventId: 'evt-1',
      generation: 1,
      memberActorIds: ['a', 'b', 'c'] as [string, string, string],
      initiativeCardIds: ['ca', 'cb', 'cc'] as [string, string, string],
      status: 'active',
      transactionId: 't',
    };
    expect(deriveGroupStatus(g, 2).status).toBe('partially-defeated');
    expect(deriveGroupStatus(g, 0).status).toBe('defeated');
    expect(deriveGroupStatus(g, 3).status).toBe('active');
  });

  it('18. 最后一名死亡不立即召唤；下一 Collector 行动才再召唤（generation+1，新 ID）', () => {
    // 第一轮：召唤 generation 1
    const first = resolveCollectorSummon(makeRuntime(), 0, { evt: 'evt-1' });
    expect(first.runtime.activeSummonGroupId).toBe(first.group?.id);
    // 模拟全灭：下一个 Collector 行动，sourceActionEventId 不同 → generation 2
    const second = resolveCollectorSummon(first.runtime, 0, { evt: 'evt-2' });
    expect(second.ok).toBe(true);
    expect(second.runtime.summonGeneration).toBe(2);
    expect(second.group?.generation).toBe(2);
    expect(second.group?.id).not.toBe(first.group?.id);
    expect(second.createdActorIds).not.toEqual(first.createdActorIds);
  });
});

describe('Collector §24 — Collected 是 Monster Actor（无 Hero 特性）', () => {
  it('19. Collected 拥有 HP / skillIds，不含 XP/Quirk/Disease/Trinket/Death’s Door', () => {
    const maa = getCollectedDefinition('man-at-arms', 1)!;
    expect(maa.maxHp).toBeGreaterThan(0);
    expect(maa.skillIds.length).toBeGreaterThan(0);
    expect(maa.collectedTags).toContain('collected');
    // 结构上不应出现 Hero 专属字段
    expect('xp' in maa).toBe(false);
    expect('quirks' in maa).toBe(false);
    expect('diseases' in maa).toBe(false);
    expect('trinkets' in maa).toBe(false);
    expect('deathDoor' in maa).toBe(false);
  });

  it('20. Collected 是 MonsterDefinition 扩展（可被 Monster Turn 复用）', () => {
    const vestal = getCollectedDefinition('vestal', 1)!;
    expect(typeof vestal.targetRule).toBe('string');
    expect(vestal.requiredStance).toBe('support');
    expect(vestal.requiredRoomAreaId).toBe(COLLECTOR_LINKED_SUMMON_GROUP.members[2].requiredAreaId);
  });
});

describe('Collector §24 — 普通 Skill / Victory / Save', () => {
  it('21. 普通 Skill 先保存 d10 结果', () => {
    const rt = makeRuntime();
    const res = resolveCollectorNormalSkill({ round: 1, initiativeCardId: 'c1', runtime: rt, rng: scriptedRng(7) });
    expect(res.ok).toBe(true);
    expect(typeof res.skillRoll).toBe('number');
    expect(res.selectedSkillId).toBe('prototype-collector-normal-strike');
    expect(getCollectorNormalSkillTable(1, 'prototype')).toContain('prototype-collector-normal-strike');
  });

  it('22. Collector 死亡立即清理全部 Collected，3 XP / Campaign Advance', () => {
    const group: LinkedSummonGroupRecord = {
      id: 'collector-summon-group:evt-1:1',
      sourceActorId: 'collector-actor',
      sourceActionEventId: 'evt-1',
      generation: 1,
      memberActorIds: ['a', 'b', 'c'] as [string, string, string],
      initiativeCardIds: ['ca', 'cb', 'cc'] as [string, string, string],
      status: 'active',
      transactionId: 't',
    };
    const cards: CollectorInitiativeCard[] = [
      { id: 'collector-init:collector-actor:1', actorId: 'collector-actor', roundCreated: 1, resolved: false, resolutionTransactionId: null },
      { id: 'ca', actorId: 'a', roundCreated: 1, resolved: false, resolutionTransactionId: null },
    ];
    const v = resolveCollectorVictory({ initiativeCards: cards, group, otherMonsterActorIds: ['mob-1'] });
    expect(v.bossDefeated).toBe(true);
    expect(v.stoppedSkillQueue).toBe(true);
    expect(v.removedCollectedActorIds).toEqual(['a', 'b', 'c']);
    expect(v.removedOtherMonsters).toBe(true);
    expect(v.xpResult).toBe(3);
    expect(v.campaignAdvanced).toBe(true);
    expect(v.invalidatedInitiativeCardIds).toContain('ca');
  });

  it('23. Victory 不产生额外普通 Loot（Group 清理独立）', () => {
    const v = resolveCollectorVictory({ initiativeCards: [], group: null, otherMonsterActorIds: [] });
    expect(v.removedCollectedActorIds).toHaveLength(0);
    expect(v.linkedSummonGroupStatus).toBe('removed');
  });

  it('24. Chest Loot 复用 Phase 8C（draw + acquire 幂等）', () => {
    const chests = createCollectorLootChests(COLLECTOR_PROTOTYPE_ROOM, 'setup-loot', 'room-1');
    const campaign = createNewCampaign();
    const r1 = resolveCollectorLootChest({
      chest: chests[0],
      campaign,
      questId: null,
      setupId: 'setup-loot',
      pool: 'prototype',
    });
    expect(r1.chest.opened).toBe(true);
    // 再次打开同一 Chest → 已 opened，不再抽取 / 不再 acquire（campaign 引用不变）
    const r2 = resolveCollectorLootChest({
      chest: r1.chest,
      campaign: r1.campaign,
      questId: null,
      setupId: 'setup-loot',
      pool: 'prototype',
    });
    expect(r2.campaign).toBe(r1.campaign);
    // lootEventId 幂等
    expect(resolveCollectorLootChestId('setup-loot', 'chest-1')).toBe(
      resolveCollectorLootChestId('setup-loot', 'chest-1')
    );
  });

  it('25. Save Migration：version + 1，补齐 Collector 字段', () => {
    const snap = migrateCollectorSave(9);
    expect(snap.version).toBe(10);
    expect(snap.collectorBattleRuntime).toBeNull();
    expect(snap.linkedSummonGroups).toEqual([]);
    expect(snap.collectorDataAudit.length).toBeGreaterThan(0);
  });

  it('26. Snapshot / Hash 恢复', () => {
    const h1 = hashCollectorRoomDefinition(COLLECTOR_PROTOTYPE_ROOM);
    const h2 = hashCollectorRoomDefinition(COLLECTOR_PROTOTYPE_ROOM);
    expect(h1).toBe(h2);
    const snapshot = { roomDefinitionId: COLLECTOR_PROTOTYPE_ROOM.id, roomHash: h1 };
    // 同 Hash → 进行中战斗使用当前定义（useSnapshot = false）
    expect(hashCollectorRoomDefinition(COLLECTOR_PROTOTYPE_ROOM) === snapshot.roomHash).toBe(true);
  });

  it('27. 损坏 Runtime 不白屏（repair 兜底）', () => {
    const fixed = repairCollectorRuntime(null);
    expect(fixed.collectorActorId).toBe('collector-actor');
    expect(fixed.activeCollectedActorIds).toEqual([]);
    expect(fixed.lootChestIds).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// 测试辅助：封装 summonCollectedGroup（默认参数）
// ---------------------------------------------------------------------------
function resolveCollectorSummon(
  runtime: ReturnType<typeof createCollectorBattleRuntime>,
  aliveCollectedCount: number,
  opts: { collectorAlive?: boolean; occupiedAreaIds?: string[]; evt?: string } = {}
): SummonCollectedGroupResult {
    return summonCollectedGroup({
    battleId: 'b1',
    round: 1,
    initiativeCardId: 'c1',
    sourceActionEventId: opts.evt ?? 'evt-1',
    collectorAlive: opts.collectorAlive ?? true,
    aliveCollectedCount,
    runtime,
    room: COLLECTOR_PROTOTYPE_ROOM,
    occupiedAreaIds: opts.occupiedAreaIds ?? [],
  });
}
