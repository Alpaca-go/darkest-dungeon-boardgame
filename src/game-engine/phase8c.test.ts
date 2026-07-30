// Phase 8C 单元测试：Trinket 容量=等级、正负面翻转、获取/分配/死亡转移/丢弃、
// Loot/Quest Reward 最小来源、Nomad Wagon（展示组合 / 买卖价 / 原子事务 / L2·L3 禁买）、
// Hamlet 重置正面、存档迁移 v6→v7、38 张卡 Registry 与数据策略红线。

import { describe, it, expect } from 'vitest';
import type { CampaignState, HamletState, BattleState, BattleUnit } from '../types';
import {
  createNewCampaign,
  selectParty,
  applyDefaultLoadout,
  selectQuest,
} from './campaign';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { useTrinket } from './trinkets/use-trinket';
import { openTrinketWindow } from './trinkets/trinket-opportunities';
import { transferTrinket } from './trinkets/transfer-trinket';
import { resolveTrinketAllocation } from './trinkets/allocate-trinket';
import { getTrinketCapacity, getFreeTrinketCapacity } from './trinkets/capacity';
import { resetAllTrinketsForHamlet } from './trinkets/reset-trinkets';
import { transferDeadHeroTrinkets } from './trinkets/transfer-dead-hero-trinkets';
import { drawTrinket } from './trinkets/draw-trinket';
import {
  ensureNomadWagonOffer,
  commitNomadWagonVisit,
  commitNomadWagonVisitError,
} from './nomad-wagon';
import { buyPriceForLevel, sellPriceForLevel } from '../data/trinkets/trinket-pricing';
import {
  validateTrinketRegistry,
  EXPECTED_CORE_TRINKET_COUNT,
  ALL_TRINKETS,
  officialTrinketPool,
  getTrinketById,
} from '../data/trinkets/trinket-registry';
import { migrateCampaignToV7, SAVE_VERSION } from './save';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

function fresh(questId = 'scout-ahead'): CampaignState {
  return selectQuest(applyDefaultLoadout(selectParty(createNewCampaign(), FOUR_HEROES)), questId);
}

function makeHamlet(): HamletState {
  return {
    visitId: 'v1',
    preparationDays: 2,
    currentDay: 1,
    caretakerBlockedBuildingId: null,
    occupiedBuildingIds: [],
    currentEventId: null,
    log: [],
    nextQuestProvisionBonus: 0,
  };
}

/** 给英雄挂一件饰品（绕过状态机，仅构造前置条件）。 */
function grant(c: CampaignState, heroIdx: number, trinketId: string): CampaignState {
  const r = acquireTrinket(c, {
    trinketId,
    source: 'debug',
    sourceEventId: `test-grant-${heroIdx}-${trinketId}`,
    heroId: c.heroes[heroIdx].instanceId,
  });
  return r.campaign;
}

/** 构造一场战斗，令指定英雄为当前行动者（before-attack-roll 窗口需要 in-battle + is-acting-hero）。 */
function makeBattle(c: CampaignState, heroIdx: number): CampaignState {
  const hero = c.heroes[heroIdx];
  const unitId = `u-${hero.instanceId}`;
  const unit: BattleUnit = {
    id: unitId,
    name: hero.name,
    side: 'hero',
    sourceId: hero.instanceId,
    maxHp: 20,
    hp: 20,
    stress: 0,
    position: 1,
    speed: 1,
    stance: 'support',
    isAlive: true,
    stunned: 0,
    bleed: 0,
    blight: 0,
    marked: false,
    buffs: [],
    debuffs: [],
    actionPoints: 1,
    atDeathsDoor: false,
    deathblowRollCount: 0,
    resolveTestedThisQuest: false,
    resolveState: 'normal',
    virtueId: null,
    afflictionId: null,
    mentalEffectResolvedTurnId: null,
    equippedTrinketInstanceIds: (hero.equippedTrinkets ?? []).map((t) => t.instanceId),
  };
  const battle: BattleState = {
    battleId: 'b1',
    status: 'active',
    round: 1,
    maxRounds: 10,
    heroes: [unit],
    monsters: [],
    initiativeOrder: [unitId],
    initiativeIndex: 0,
    activeActorId: unitId,
    currentActionPoints: 1,
    selectedSkillId: null,
    selectedTargetId: null,
    battleLog: [],
    sourceRoomId: 'room-1',
    rewards: { gold: 0 },
  };
  return { ...c, battle };
}

// ---------------------------------------------------------------------------
// 一、容量 = 等级（关键规则 1 / 2）
// ---------------------------------------------------------------------------
describe('Trinket 容量', () => {
  it('容量 = 英雄等级（clamp 0..3）', () => {
    const c = fresh();
    const base = c.heroes[0];
    expect(getTrinketCapacity(base)).toBe(Math.min(3, base.level));
    expect(getTrinketCapacity({ ...base, level: 3 })).toBe(3);
    // 运行时 clamp 到 0..3；这里用类型断言绕过 HeroInstance.level 的字面量约束
    expect(getTrinketCapacity({ ...base, level: 9 } as unknown as typeof base)).toBe(3);
    expect(getTrinketCapacity({ ...base, level: 0 } as unknown as typeof base)).toBe(0);
  });

  it('不存在超容量仓库：容量满后获取进入待分配而非暂存', () => {
    let c = fresh();
    // 先把 0 号英雄（等级 1 → 容量 1）装备满
    c = grant(c, 0, 'critical-stone');
    expect(getFreeTrinketCapacity(c.heroes[0])).toBe(0);
    const r = acquireTrinket(c, {
      trinketId: 'critical-stone',
      source: 'loot',
      sourceEventId: 'overflow-1',
      heroId: c.heroes[0].instanceId,
    });
    expect(r.outcome).toBe('pending-allocation');
    expect(r.allocationId).toBeTruthy();
    // 英雄身上仍只有 1 件（未被暂存）
    expect(r.campaign.heroes[0].equippedTrinkets).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// 二、装备从正面起 / 使用后翻面 / 每回合一次（关键规则 3·4·5）
// ---------------------------------------------------------------------------
describe('正负面与翻面', () => {
  it('获取饰品从 Positive 面起装备', () => {
    const c = grant(fresh(), 0, 'critical-stone');
    expect(c.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
  });

  it('使用后翻面；攻击掷骰前声明会累加修正后翻到另一面', () => {
    let c = makeBattle(grant(fresh(), 0, 'critical-stone'), 0);
    const inst = c.heroes[0].equippedTrinkets[0];
    const opened = openTrinketWindow(c, {
      window: 'before-attack-roll',
      heroId: c.heroes[0].instanceId,
      eventId: 'atk-1',
    });
    expect(opened.hasOpportunity).toBe(true);
    const used = useTrinket(opened.campaign, opened.opened[0].id);
    expect(used.error).toBeNull();
    const after = used.campaign.heroes[0].equippedTrinkets.find((t) => t.instanceId === inst.instanceId)!;
    expect(after.currentSide).toBe('negative'); // 翻面
    expect(after.usedTurnId).not.toBeNull();
  });

  it('同一回合每张 Trinket 只能用一次（关键规则 5）', () => {
    let c = makeBattle(grant(fresh(), 0, 'critical-stone'), 0);
    const opened = openTrinketWindow(c, {
      window: 'before-attack-roll',
      heroId: c.heroes[0].instanceId,
      eventId: 'atk-1',
    });
    const used = useTrinket(opened.campaign, opened.opened[0].id);
    // 同一回合（同 turnId）再开窗口不应产生新机会
    const reopen = openTrinketWindow(used.campaign, {
      window: 'before-attack-roll',
      heroId: used.campaign.heroes[0].instanceId,
      eventId: 'atk-2',
    });
    expect(reopen.hasOpportunity).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 三、Hamlet 返回重置正面（关键规则 6）
// ---------------------------------------------------------------------------
describe('Hamlet 重置', () => {
  it('返回 Hamlet 把所有饰品重置为正面（幂等）', () => {
    let c = grant(fresh(), 0, 'critical-stone');
    c = {
      ...c,
      heroes: c.heroes.map((h, i) =>
        i === 0
          ? { ...h, equippedTrinkets: h.equippedTrinkets.map((t) => ({ ...t, currentSide: 'negative' as const })) }
          : h
      ),
    };
    const r1 = resetAllTrinketsForHamlet(c, 'scout-ahead', 'rt1');
    expect(r1.flippedCount).toBe(1);
    expect(r1.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('positive');
    const r2 = resetAllTrinketsForHamlet(r1.campaign, 'scout-ahead', 'rt1');
    expect(r2.skipped).toBe(true); // 幂等：同一次返回不再重置
  });
});

// ---------------------------------------------------------------------------
// 四、死亡转移（关键规则 7）/ 非战斗转移
// ---------------------------------------------------------------------------
describe('转移', () => {
  it('英雄死亡：同伴立即以正面接收其饰品（无接收则丢弃）', () => {
    let c = grant(fresh(), 0, 'critical-stone');
    c = { ...c, heroes: c.heroes.map((h, i) => (i === 0 ? { ...h, dead: true, deathRecordId: 'dr1' } : h)) };
    const after = transferDeadHeroTrinkets(c, c.heroes[0].instanceId);
    expect(after.heroes[0].equippedTrinkets).toHaveLength(0); // 死亡英雄身上清空
    const alloc = (after.pendingTrinketAllocations ?? []).find((a) => a.status === 'pending');
    expect(alloc).toBeTruthy();
    expect(alloc!.isDeathTransfer).toBe(true);
    const resolved = resolveTrinketAllocation(after, alloc!.allocationId, {
      type: 'assign',
      heroId: after.heroes[1].instanceId,
    });
    expect(resolved.error).toBeNull();
    const got = resolved.campaign.heroes[1].equippedTrinkets[0];
    expect(got.currentSide).toBe('positive'); // 转移落地强制正面
  });

  it('非战斗转移保留正/负面（不重置）', () => {
    let c = grant(fresh(), 0, 'critical-stone');
    c = {
      ...c,
      heroes: c.heroes.map((h, i) =>
        i === 0
          ? { ...h, equippedTrinkets: h.equippedTrinkets.map((t) => ({ ...t, currentSide: 'negative' as const })) }
          : h
      ),
    };
    const instId = c.heroes[0].equippedTrinkets[0].instanceId;
    const r = transferTrinket(c, c.heroes[0].instanceId, c.heroes[1].instanceId, instId);
    expect(r.error).toBeNull();
    expect(r.campaign.heroes[1].equippedTrinkets[0].currentSide).toBe('negative'); // 保留负面
  });
});

// ---------------------------------------------------------------------------
// 五、Loot / Quest Reward 最小来源
// ---------------------------------------------------------------------------
describe('最小来源', () => {
  it('Loot / Quest Reward 经同一获取状态机：有容量即装备（正面）', () => {
    const c1 = fresh();
    const loot = acquireTrinket(c1, {
      trinketId: 'critical-stone',
      source: 'loot',
      sourceEventId: 'loot-1',
      heroId: c1.heroes[0].instanceId,
    });
    expect(loot.outcome).toBe('equipped');

    const c2 = fresh();
    const reward = acquireTrinket(c2, {
      trinketId: 'critical-stone',
      source: 'quest-reward',
      sourceEventId: 'reward-1',
      heroId: c2.heroes[0].instanceId,
    });
    expect(reward.outcome).toBe('equipped');
  });

  it('官方抽取池只含已核实卡（Critical Stone）；其余等级官方池为空', () => {
    const l1 = drawTrinket({ level: 1, pool: 'official' });
    expect(l1.definition?.id).toBe('critical-stone');
    const l2 = drawTrinket({ level: 2, pool: 'official' });
    expect(l2.definition).toBeNull(); // 官方无 L2 可信数据
  });
});

// ---------------------------------------------------------------------------
// 六、Nomad Wagon（关键规则 9–14）
// ---------------------------------------------------------------------------
describe('Nomad Wagon', () => {
  it('展示组合：I = 3×L1；且绝不臆测官方未提供的 L2 / L3', () => {
    const c1 = ensureNomadWagonOffer({
      ...fresh(),
      nomadWagon: { ...fresh().nomadWagon!, buildingLevel: 1, offerGenerated: false },
    });
    expect(c1.nomadWagon!.offeredTrinketIds).toHaveLength(3);
    for (const id of c1.nomadWagon!.offeredTrinketIds) {
      expect(getTrinketById(id)!.level).toBe(1);
    }
    // 官方池无 L2/L3 可信数据 → 即使组合表要求，也只给得出来自官方池的 L1
    const c2 = ensureNomadWagonOffer({
      ...fresh(),
      nomadWagon: { ...fresh().nomadWagon!, buildingLevel: 3, offerGenerated: false },
    });
    expect(c2.nomadWagon!.offeredTrinketIds.length).toBeGreaterThan(0);
    for (const id of c2.nomadWagon!.offeredTrinketIds) {
      expect(getTrinketById(id)!.level).toBe(1);
    }
  });

  it('买卖价：L1 买 4 / 卖 2；L2 卖 3 买 null；L3 卖 4 买 null（禁止臆测）', () => {
    expect(buyPriceForLevel(1)).toBe(4);
    expect(buyPriceForLevel(2)).toBeNull();
    expect(buyPriceForLevel(3)).toBeNull();
    expect(sellPriceForLevel(1)).toBe(2);
    expect(sellPriceForLevel(2)).toBe(3);
    expect(sellPriceForLevel(3)).toBe(4);
  });

  it('L1 购买为原子事务（扣 Gold、占用建筑、英雄已行动）', () => {
    let c = fresh();
    c = { ...c, gamePhase: 'hamlet', gold: 100, hamlet: makeHamlet() };
    const gen = ensureNomadWagonOffer({
      ...c,
      nomadWagon: { ...c.nomadWagon!, buildingLevel: 1, offerGenerated: false },
    });
    const buyId = gen.nomadWagon!.offeredTrinketIds[0];
    const heroId = gen.heroes[0].instanceId;
    const goldBefore = gen.gold;
    const res = commitNomadWagonVisit(gen, { heroId, buyTrinketId: buyId });
    expect(res.error).toBeNull();
    expect(res.campaign.gold).toBe(goldBefore - 4);
    expect(res.campaign.nomadWagon!.visitHeroId).toBe(heroId);
    expect(res.campaign.hamlet!.occupiedBuildingIds).toContain('nomad-wagon');
    expect(res.campaign.heroes.find((h) => h.instanceId === heroId)!.hasActedToday).toBe(true);
  });

  it('展示位含 L2/L3 时购买被禁止（官方买价缺失，不得臆测）', () => {
    let c = fresh();
    c = {
      ...c,
      gamePhase: 'hamlet',
      gold: 100,
      hamlet: makeHamlet(),
      nomadWagon: {
        ...c.nomadWagon!,
        buildingLevel: 1,
        offerGenerated: true,
        offerTransactionId: 'x',
        offeredTrinketIds: ['prototype-stress-charm'], // L2 原型，仅用于验证禁买
      },
    };
    const err = commitNomadWagonVisitError(c, {
      heroId: c.heroes[0].instanceId,
      buyTrinketId: 'prototype-stress-charm',
    });
    expect(err).toContain('官方数据缺失');
  });

  it('取消（不提交）不产生任何扣费', () => {
    let c = fresh();
    c = { ...c, gamePhase: 'hamlet', gold: 100, hamlet: makeHamlet() };
    const gen = ensureNomadWagonOffer({
      ...c,
      nomadWagon: { ...c.nomadWagon!, buildingLevel: 1, offerGenerated: false },
    });
    // 不调用 commitNomadWagonVisit → Gold 不变
    expect(gen.gold).toBe(100);
    expect(gen.heroes[0].hasActedToday).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// 七、存档迁移 v6 → v7
// ---------------------------------------------------------------------------
describe('存档迁移', () => {
  it('v6 → v7：补齐 nomadWagon 与队列；超容量截断、未知定义丢弃', () => {
    const base = fresh();
    const v6 = JSON.parse(JSON.stringify(base));
    v6.saveVersion = 6;
    delete v6.nomadWagon;
    delete v6.pendingTrinketAllocations;
    delete v6.pendingTrinketUseOpportunities;
    delete v6.pendingTrinketUseTransaction;
    delete v6.trinketAcquisitionRecords;
    delete v6.trinketUseRecords;
    delete v6.trinketTransferRecords;
    delete v6.processedTrinketEventIds;
    delete v6.processedTrinketResetKeys;
    v6.heroes[0].level = 1; // 容量 1
    v6.heroes[0].equippedTrinkets = [
      { instanceId: 'a', trinketId: 'critical-stone', currentSide: 'positive', usedTurnId: null, lastUsedEventId: null, acquiredAt: '2026', acquiredQuestId: null, source: 'debug', sourceEventId: 'e1' },
      { instanceId: 'b', trinketId: 'unknown-xyz', currentSide: 'negative', usedTurnId: null, lastUsedEventId: null, acquiredAt: '2026', acquiredQuestId: null, source: 'debug', sourceEventId: 'e2' },
      { instanceId: 'c', trinketId: 'critical-stone', currentSide: 'positive', usedTurnId: null, lastUsedEventId: null, acquiredAt: '2026', acquiredQuestId: null, source: 'debug', sourceEventId: 'e3' },
    ];

    const migrated = migrateCampaignToV7(v6 as unknown as CampaignState);
    expect(migrated.saveVersion).toBe(SAVE_VERSION);
    expect(migrated.nomadWagon).toBeDefined();
    expect(migrated.nomadWagon!.buildingLevel).toBe(1);
    // 容量 1 → 仅保留 1 件（首件 critical-stone），未知定义丢弃、第三件超容量截断
    expect(migrated.heroes[0].equippedTrinkets).toHaveLength(1);
    expect(migrated.heroes[0].equippedTrinkets[0].trinketId).toBe('critical-stone');
  });
});

// ---------------------------------------------------------------------------
// 八、Registry 与数据策略红线
// ---------------------------------------------------------------------------
describe('Registry 与数据策略', () => {
  it('标称 38 张；已核实 1 张（Critical Stone）；无重复 / 无策略违规', () => {
    const s = validateTrinketRegistry();
    expect(s.expectedCoreCount).toBe(EXPECTED_CORE_TRINKET_COUNT);
    expect(EXPECTED_CORE_TRINKET_COUNT).toBe(38);
    expect(s.verifiedDefinitions).toBe(1);
    expect(s.missingOfficialCount).toBe(37);
    expect(s.duplicateIds).toHaveLength(0);
    expect(s.policyViolations).toHaveLength(0);
  });

  it('数据策略：原型卡不进官方池；不得臆造 38 张全效果', () => {
    const pool = officialTrinketPool();
    expect(pool.every((t) => t.officialDataStatus === 'verified' && t.enabledInOfficialPool)).toBe(true);
    expect(pool.length).toBeLessThan(38); // 仅核实卡，禁止编造
    const proto = ALL_TRINKETS.filter((t) => t.dataOrigin === 'prototype');
    expect(proto.length).toBeGreaterThan(0);
    expect(proto.every((t) => !t.enabledInOfficialPool)).toBe(true);
  });
});
