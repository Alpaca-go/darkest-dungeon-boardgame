// Phase 11A — 战役不变量语义回归测试。
//
// 本文件重点覆盖两条**审计早期写错、事后修正**的不变量。
// 之所以要专门写测试，是因为错误的不变量比没有不变量更危险：
// 它会用假阳性淹没真实缺陷（本次实测产生 84 + 6 条噪声）。

import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../../types';
import { createNewCampaign, selectParty } from '../../game-engine/campaign';
import { HEROES } from '../../data/heroes';
import { assertCoreCampaignInvariants } from './campaign-invariants';

function codesOf(c: CampaignState): string[] {
  return assertCoreCampaignInvariants(c)
    .filter((f) => f.severity === 'error')
    .map((f) => f.code);
}

function baseCampaign(): CampaignState {
  return selectParty(
    createNewCampaign(),
    HEROES.slice(0, 4).map((h) => h.id),
  );
}

describe('campaign-invariants · hamlet-day-semantics', () => {
  it('preparationDays 是倒计时、currentDay 是累加日序，二者反向不构成违反', () => {
    const c = baseCampaign();
    // 第 3 天、剩余 0 天：真实游戏中「3 天准备期的最后一天」就是这个形状。
    const state: CampaignState = {
      ...c,
      hamlet: { ...c.hamlet, currentDay: 3, preparationDays: 0 },
    };
    expect(codesOf(state)).not.toContain('HAMLET_DAY_OVERFLOW');
    expect(codesOf(state)).not.toContain('HAMLET_PREP_NEGATIVE');
  });

  it('preparationDays 为负数时报错', () => {
    const c = baseCampaign();
    const state: CampaignState = {
      ...c,
      hamlet: { ...c.hamlet, currentDay: 2, preparationDays: -1 },
    };
    expect(codesOf(state)).toContain('HAMLET_PREP_NEGATIVE');
  });

  it('处于 hamlet 阶段但 currentDay=0 时报错（天数应从 1 起算）', () => {
    const c = baseCampaign();
    const state: CampaignState = {
      ...c,
      gamePhase: 'hamlet',
      hamlet: { ...c.hamlet, currentDay: 0, preparationDays: 2 },
    };
    expect(codesOf(state)).toContain('HAMLET_DAY_UNSTARTED');
  });
});

describe('campaign-invariants · dead-hero-slot-coverage', () => {
  it('阵亡英雄被未确认替补槽位覆盖时，占位是合法过渡态', () => {
    const c = baseCampaign();
    const dead = c.heroes[0];
    const state: CampaignState = {
      ...c,
      heroes: c.heroes.map((h) => (h.instanceId === dead.instanceId ? { ...h, dead: true, isAlive: false } : h)),
      stagecoach: {
        ...c.stagecoach,
        pendingReplacement: {
          slots: [
            {
              partySlot: dead.partySlot,
              deadCampaignHeroId: dead.instanceId,
              deathRecordId: 'death-test',
              upgradeOperations: [],
              confirmed: false,
            },
          ],
          id: 'pending-repl-test',
          source: 'battle',
          resumePhase: 'quest-result',
          createdAt: '1970-01-01T00:00:00.000Z',
          resolved: false,
        },
      },
    };
    expect(codesOf(state)).not.toContain('DEAD_IN_PARTY_UNCOVERED');
  });

  it('阵亡英雄没有对应替补槽位时报错（真正的泄漏）', () => {
    const c = baseCampaign();
    const dead = c.heroes[0];
    const state: CampaignState = {
      ...c,
      gamePhase: 'dungeon-explore',
      heroes: c.heroes.map((h) => (h.instanceId === dead.instanceId ? { ...h, dead: true, isAlive: false } : h)),
      stagecoach: { ...c.stagecoach, pendingReplacement: null },
    };
    expect(codesOf(state)).toContain('DEAD_IN_PARTY_UNCOVERED');
  });

  it('campaign-over 阶段允许阵亡英雄留在队伍中（战役已结束，无需补齐）', () => {
    const c = baseCampaign();
    const dead = c.heroes[0];
    const state: CampaignState = {
      ...c,
      gamePhase: 'campaign-over',
      heroes: c.heroes.map((h) => (h.instanceId === dead.instanceId ? { ...h, dead: true, isAlive: false } : h)),
      stagecoach: { ...c.stagecoach, pendingReplacement: null },
    };
    expect(codesOf(state)).not.toContain('DEAD_IN_PARTY_UNCOVERED');
  });
});

describe('campaign-invariants · 基础结构', () => {
  it('新建战役 + 选队后不产生任何 error 级违反', () => {
    expect(codesOf(baseCampaign())).toEqual([]);
  });

  it('队伍出现重复 instanceId 时报错', () => {
    const c = baseCampaign();
    const state: CampaignState = { ...c, heroes: [c.heroes[0], c.heroes[0], c.heroes[2], c.heroes[3]] };
    expect(codesOf(state)).toContain('DUP_ACTOR_ID');
  });
});
