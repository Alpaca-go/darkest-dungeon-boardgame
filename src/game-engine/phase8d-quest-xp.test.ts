import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CampaignState, QuestObjectiveProgress } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource } from './random';
import { finishQuest } from './quest-result';
import { startHamletPhase } from './hamlet';
import { saveCampaign, loadCampaign, clearCampaign } from './save';
import {
  computeQuestXp,
  evaluateQuestObjectives,
  createQuestXpResult,
  eligibleXpHeroIds,
} from './progression/quest-objectives';
import { distributeQuestXp } from './progression/quest-xp';
import {
  earnHeroXp,
  spendHeroXp,
  getHeroXp,
  earnPartyXp,
  auditXpLedger,
} from './progression/xp-ledger';
import { applyQuestXpToStagecoach } from './stagecoach';
import { initBattle } from './battle';
import { QUEST_XP_POLICY } from '../data/progression/guild-costs';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

function freshCampaign(questId = 'scout-ahead'): CampaignState {
  return selectQuest(applyDefaultLoadout(selectParty(createNewCampaign(), FOUR_HEROES)), questId);
}
function withObjective(c: CampaignState): CampaignState {
  return { ...c, dungeon: { ...c.dungeon!, objectiveComplete: true, roomsCleared: 2 } };
}
/** 已结算（completed）并停在 quest-result 阶段的战役（XP 仅挂起，未发放）。 */
function resolvedCampaign(): CampaignState {
  return finishQuest(withObjective(freshCampaign()), 'left');
}

/** 构造 n 条 Objective 进度，其中 completed 条标记为完成。 */
function prog(completed: number, total = Math.max(completed, 1)): QuestObjectiveProgress[] {
  return Array.from({ length: total }, (_, i) => ({
    objectiveId: `obj-${i}`,
    description: `Objective ${i}`,
    type: 'custom' as const,
    current: i < completed ? 1 : 0,
    target: 1,
    required: true,
    completed: i < completed,
  }));
}

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0);
});
afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// §29.1 Quest XP
// ---------------------------------------------------------------------------
describe('§29.1 Quest XP（0-3 XP 由 Objective 完成数决定）', () => {
  it('1. 0 个 Objective → 0 XP', () => {
    expect(computeQuestXp(prog(0, 3)).xpPerHero).toBe(0);
  });
  it('2. 1 个 Objective → 1 XP', () => {
    expect(computeQuestXp(prog(1, 3)).xpPerHero).toBe(1);
  });
  it('3. 2 个 Objective → 2 XP', () => {
    expect(computeQuestXp(prog(2, 3)).xpPerHero).toBe(2);
  });
  it('4. 3 个 Objective → 3 XP', () => {
    expect(computeQuestXp(prog(3, 3)).xpPerHero).toBe(3);
  });
  it('4b. 3 个以上 Objective → 仍 clamp 到 3 XP（硬上限）', () => {
    const r = computeQuestXp(prog(5, 5));
    expect(r.xpPerHero).toBe(3);
    expect(r.completedObjectiveCount).toBe(5);
  });
  it('5. 所有 eligible Hero 获得相同 XP', () => {
    const c = resolvedCampaign();
    const out = distributeQuestXp(c);
    const xp = out.result!.xpPerHero;
    for (const h of out.campaign.heroes) {
      if (h.isAlive && !h.dead) expect(getHeroXp(h)).toBe(xp);
    }
  });
  it('6. 死亡 Hero 不获得 XP', () => {
    const c = resolvedCampaign();
    const dead = {
      ...c,
      heroes: c.heroes.map((h, i) => (i === 3 ? { ...h, isAlive: false, dead: true } : h)),
    };
    const out = distributeQuestXp(dead);
    expect(getHeroXp(out.campaign.heroes[3])).toBe(0);
    // 其余存活英雄仍获得 XP
    expect(getHeroXp(out.campaign.heroes[0])).toBe(out.result!.xpPerHero);
  });
  it('7. 任务期间阵亡的英雄不追溯获得 XP（Replacement 是不同 instance）', () => {
    const c = resolvedCampaign();
    const dead = {
      ...c,
      heroes: c.heroes.map((h, i) => (i === 2 ? { ...h, isAlive: false, dead: true } : h)),
    };
    const out = distributeQuestXp(dead);
    expect(eligibleXpHeroIds(out.campaign)).not.toContain(c.heroes[2].instanceId);
    expect(getHeroXp(out.campaign.heroes[2])).toBe(0);
  });
  it('8. Stagecoach 增加 XP = 单名英雄 XP（不是队伍总和）', () => {
    const c = resolvedCampaign();
    const before = c.stagecoach.accumulatedXp;
    const out = distributeQuestXp(c);
    const delta = out.campaign.stagecoach.accumulatedXp - before;
    expect(delta).toBe(out.result!.xpPerHero); // 等于 1，不是 4
    expect(delta).not.toBe(out.result!.xpPerHero * 4);
  });
  it('9. Quest XP 只应用一次（幂等）', () => {
    const once = distributeQuestXp(resolvedCampaign());
    const twice = distributeQuestXp(once.campaign);
    expect(twice.distributed).toBe(false);
    expect(twice.campaign).toBe(once.campaign);
    // 存档幂等：回到 Hamlet 后再次进入不会二次发放
    const hamlet = startHamletPhase(resolvedCampaign());
    expect(startHamletPhase(hamlet)).toBe(hamlet);
  });
  it('10. 刷新后不重复应用（pending 发放后置空，存档可恢复）', () => {
    const hamlet = startHamletPhase(resolvedCampaign());
    saveCampaign(hamlet);
    const loaded = loadCampaign()!;
    expect(loaded.pendingQuestXp).toBeNull();
    const reEnter = startHamletPhase(loaded);
    expect(reEnter).toBe(loaded); // 已发放 → 原样返回
  });
  it('11. lifetimeXpEarned 正确累计', () => {
    const c = resolvedCampaign();
    const before = getHeroXp(c.heroes[0]);
    const out = distributeQuestXp(c);
    const h0 = out.campaign.heroes[0];
    expect(h0.xpState!.lifetimeXpEarned).toBe(before + out.result!.xpPerHero);
  });
  it('12. Result Page render（finishQuest）不应用 XP', () => {
    const c = resolvedCampaign();
    for (const h of c.heroes) expect(h.xp).toBe(0); // 任务结算不写英雄 XP
    expect(c.heroes.every((h) => h.xpState!.currentXp === 0)).toBe(true);
  });
  it('13. Battle Victory 不应用 Quest XP', () => {
    const c = freshCampaign();
    const roomId = c.dungeon!.rooms.find((r) => r.type === 'battle' || r.type === 'objective')!.id;
    const withBattle = initBattle(c, roomId);
    for (const h of withBattle.heroes) expect(h.xp).toBe(0);
  });
  it('14. 自定义 Quest XP Policy 被正确遵守（maxXpPerQuest / xpPerObjective）', () => {
    expect(QUEST_XP_POLICY.xpPerObjective).toBe(1);
    expect(QUEST_XP_POLICY.maxXpPerQuest).toBe(3);
    expect(computeQuestXp(prog(2, 2)).xpPerHero).toBe(2 * QUEST_XP_POLICY.xpPerObjective);
    expect(computeQuestXp(prog(10, 10)).xpPerHero).toBe(QUEST_XP_POLICY.maxXpPerQuest);
  });
  it('14b. createQuestXpResult 的 stagecoachXp 等于 xpPerHero', () => {
    const c = withObjective(freshCampaign());
    const r = createQuestXpResult(c);
    expect(r.stagecoachXp).toBe(r.xpPerHero);
  });
  it('14c. evaluateQuestObjectives 结果可被 computeQuestXp 消费', () => {
    const c = withObjective(freshCampaign());
    const progress = evaluateQuestObjectives(c);
    expect(progress.length).toBeGreaterThan(0);
    expect(computeQuestXp(progress).xpPerHero).toBeGreaterThanOrEqual(0);
  });
  it('14d. applyQuestXpToStagecoach 幂等（stagecoachXpApplied 已置位则原样返回）', () => {
    const c = { ...resolvedCampaign(), stagecoachXpApplied: true };
    const out = applyQuestXpToStagecoach(c, 5);
    expect(out.stagecoach.accumulatedXp).toBe(c.stagecoach.accumulatedXp);
  });
});

// ---------------------------------------------------------------------------
// §29.2 XP Ledger
// ---------------------------------------------------------------------------
describe('§29.2 XP Ledger（唯一 XP 写入口）', () => {
  it('15. XP 不低于 0（负增量被夹为 0）', () => {
    const base15 = resolvedCampaign();
    const c = earnHeroXp(base15, base15.heroes[0].instanceId, -50, 'neg');
    expect(getHeroXp(c.heroes[0])).toBeGreaterThanOrEqual(0);
  });
  it('16. spendHeroXp 正确扣除', () => {
    const base16 = resolvedCampaign();
    let c = earnHeroXp(base16, base16.heroes[0].instanceId, 10, 'grant');
    const before = getHeroXp(c.heroes[0]);
    const r = spendHeroXp(c, c.heroes[0].instanceId, 4, 'test');
    expect(r.ok).toBe(true);
    expect(getHeroXp(r.campaign.heroes[0])).toBe(before - 4);
  });
  it('17. lifetimeXpSpent 正确累计', () => {
    const base = resolvedCampaign();
    let c = earnHeroXp(base, base.heroes[0].instanceId, 10, 'grant');
    const r = spendHeroXp(c, c.heroes[0].instanceId, 4, 'test');
    expect(r.campaign.heroes[0].xpState!.lifetimeXpSpent).toBe(4);
  });
  it('18. Stagecoach XP 不因 Hero 消费而减少', () => {
    let c = earnHeroXp(resolvedCampaign(), resolvedCampaign().heroes[0].instanceId, 10, 'grant');
    c = { ...c, stagecoach: { ...c.stagecoach, accumulatedXp: 7 } };
    const r = spendHeroXp(c, c.heroes[0].instanceId, 4, 'test');
    expect(r.campaign.stagecoach.accumulatedXp).toBe(7);
  });
  it('19. 重复 transaction 不重复消费（spend 后 XP 不足则整体失败不改状态）', () => {
    const base19 = resolvedCampaign();
    let c = earnHeroXp(base19, base19.heroes[0].instanceId, 3, 'grant');
    const r1 = spendHeroXp(c, c.heroes[0].instanceId, 3, 'first');
    expect(r1.ok).toBe(true);
    const r2 = spendHeroXp(r1.campaign, r1.campaign.heroes[0].instanceId, 1, 'second');
    expect(r2.ok).toBe(false);
    expect(r2.campaign).toBe(r1.campaign); // 失败不改状态
  });
  it('20. XP 不足时失败且不改状态', () => {
    const base = resolvedCampaign();
    const r = spendHeroXp(base, base.heroes[0].instanceId, 999, 'too-much');
    expect(r.ok).toBe(false);
    expect(r.campaign).toBe(base);
  });
  it('20b. earnPartyXp 全队统一发放（不按人数拆分）', () => {
    const c = resolvedCampaign();
    const ids = c.heroes.map((h) => h.instanceId);
    const out = earnPartyXp(c, ids, 2, 'party');
    for (const h of out.heroes) expect(getHeroXp(h)).toBe(2); // 每人 2，不是 8
  });
  it('20c. auditXpLedger 对平衡账本返回空', () => {
    const c = earnHeroXp(resolvedCampaign(), resolvedCampaign().heroes[0].instanceId, 5, 'grant');
    expect(auditXpLedger(c)).toEqual([]);
  });
});
