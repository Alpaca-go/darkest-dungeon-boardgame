// Phase 11A.2.3R §6 — Domain Contract 分离。
//
// dev doc §6：src/integration/** 不允许 direct gameplay State injection。
// 旧 src/integration/core-campaign/integration.test.ts 中 I-04 / I-05 / I-06
// 使用 fake death / fake replacement / fake trinket / new Date() / as any，
// 这些是领域边界测试，应放 src/testing/contracts/ 并标注
// 「Domain Contract, not Real Vertical Integration」。
//
// 本文件不计入 Release Gate 的「Real Vertical Integration」bit。

import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../../types';
import { resolveReplacementsFlow, declineAllTrinketOpportunities, resolveAllPendingTrinketAllocations } from '../../game-engine/commands';

// Domain Contract, not Real Vertical Integration

function makeHero(instanceId: string, heroId: string) {
  return {
    instanceId,
    heroId,
    name: heroId,
    isAlive: true,
    dead: false,
    hp: 25,
    maxHp: 25,
    stress: 0,
    xp: 0,
    level: 1,
    virtues: [],
    afflictions: [],
    diseases: [],
    quirks: [],
    equippedSkillIds: [],
    equippedTrinkets: [],
    hasActedToday: false,
  } as any;
}

function makeMinimalState(): CampaignState {
  return {
    heroes: [makeHero('h1', 'crusader'), makeHero('h2', 'vestal'), makeHero('h3', 'highwayman'), makeHero('h4', 'hellion')],
    gamePhase: 'hamlet' as any,
    completedQuestCount: 0,
    campaignProgress: { act: 1, completedStandardQuestsThisAct: 0, darkestDungeonUnlocked: false } as any,
    stagecoach: {
      level: 1,
      waitingTokens: 0,
      accumulatedXp: 0,
      deadHeroClassIds: [],
      recruitedHeroClassIds: [],
      pendingReplacement: null,
    } as any,
    pendingTrinketAllocations: [],
    pendingTrinketUseOpportunities: [],
    // CampaignState.log 在顶层（src/types/index.ts:641），不是 state.campaign.log。
    log: [],
    run: { id: 'dc-run' } as any,
    party: { slot0: 'h1', slot1: 'h2', slot2: 'h3', slot3: 'h4' } as any,
    roster: { heroes: [] } as any,
    gold: 0,
    provisions: { food: 0, bandage: 0, potion: 0, torch: 0, tool: 0 } as any,
    buildings: { blacksmith: false, guild: false, tavern: false, abbey: false, sanitarium: false, nomad_wagon: false, survivalist: false, antiquarian: false, bank: false } as any,
    inventory: { trinkets: [] } as any,
    battle: null,
    dungeon: null,
    dungeonMap: null,
    hamlet: null,
    lastQuestResult: null,
    eventLog: [] as any,
    questLog: [] as any,
    saveVersion: 1,
    lastUpdate: '2026-01-01T00:00:00.000Z',
    rngSeed: 'dc-seed',
  } as any;
}

describe('Domain Contract: Replacement (Phase 11A.2.3R §6)', () => {
  it('DC-04 production 拒绝 invalid candidate (dev doc §14)', () => {
    const s = makeMinimalState();
    // 构造 dead hero + pendingReplacement（fake state injection 域边界）
    s.heroes[0].isAlive = false;
    s.heroes[0].dead = true;
    s.stagecoach.pendingReplacement = {
      id: 'dc-repl',
      source: 'exploration' as any,
      createdAt: '2026-01-01T00:00:00.000Z',
      slots: [
        {
          partySlot: 1,
          deadCampaignHeroId: 'h1',
          deathRecordId: 'death-dc4',
          selectedHeroClassId: undefined,
          upgradeOperations: [],
          confirmed: false,
        },
      ],
      resumePhase: 'hamlet' as any,
      resolved: false,
    };
    const resolved = resolveReplacementsFlow(s);
    // production 拒绝 invalid → heroes 数量不变
    expect(resolved.heroes.length).toBe(s.heroes.length);
  });
});

describe('Domain Contract: Trinket (Phase 11A.2.3R §6)', () => {
  it('DC-05 Trinket Opportunity → decline', () => {
    const s = makeMinimalState();
    s.pendingTrinketUseOpportunities = [
      {
        opportunityId: 'dc-opp-5',
        trinketInstanceId: 'inst-5',
        triggerEventId: 'evt-5',
        window: 'after-skill' as any,
        side: 'hero' as any,
        sourceHeroId: 'h1',
        preview: 'fake',
        status: 'open' as any,
        createdAt: '2026-01-01T00:00:00.000Z',
      } as any,
    ];
    const next = declineAllTrinketOpportunities(s);
    expect(next.pendingTrinketUseOpportunities.length).toBe(0);
  });

  it('DC-06 Trinket Allocation → discard', () => {
    const s = makeMinimalState();
    s.pendingTrinketAllocations = [
      {
        allocationId: 'dc-alloc-6',
        trinketId: 'trk-6',
        instanceId: 'inst-6',
        source: 'quest-reward' as any,
        sourceEventId: 'evt-6',
        acquiredAt: '2026-01-01T00:00:00.000Z',
        acquiredQuestId: 'q6',
        candidateHeroIds: ['h1'],
        status: 'pending' as any,
        isDeathTransfer: false,
      } as any,
    ];
    const next = resolveAllPendingTrinketAllocations(s);
    expect(next.pendingTrinketAllocations.length).toBe(1); // discarded 但记录保留
    expect(next.pendingTrinketAllocations[0].status).toBe('discarded');
  });
});
