import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CampaignState } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource, nowIso } from './random';
import { finishQuest } from './quest-result';
import { startHamletPhase } from './hamlet';
import {
  selectReplacementHero,
  addReplacementUpgrade,
  removeReplacementUpgrade,
  confirmReplacement,
  upgradeXpSpent,
} from './replacement';
import { getReplacementCandidates } from './stagecoach';
import { getHeroTrinketCapacity } from './progression/upgrade-core';
import { saveCampaign, loadCampaign, clearCampaign } from './save';

const FOUR_HEROES = ['crusader', 'vestal', 'highwayman', 'hellion'];

function freshCampaign(questId = 'scout-ahead'): CampaignState {
  return selectQuest(applyDefaultLoadout(selectParty(createNewCampaign(), FOUR_HEROES)), questId);
}
function withObjective(c: CampaignState): CampaignState {
  return { ...c, dungeon: { ...c.dungeon!, objectiveComplete: true, roomsCleared: 2 } };
}
function resolvedCampaign(): CampaignState {
  return finishQuest(withObjective(freshCampaign()), 'left');
}
function hamletCampaign(): CampaignState {
  return startHamletPhase(resolvedCampaign());
}

/**
 * 构造一个带「阵亡英雄 + Stagecoach 待替补槽位」的战役。
 * 死者为 heroes[0]；Stagecoach 累计 10 XP、2 个 Waiting Token。
 */
function replacementReadyCampaign(accumulatedXp = 10): CampaignState {
  const base = hamletCampaign();
  const deadId = base.heroes[0].instanceId;
  const deadHeroId = base.heroes[0].heroId;
  return {
    ...base,
    heroes: base.heroes.map((h, i) =>
      i === 0 ? { ...h, isAlive: false, dead: true } : h
    ),
    stagecoach: {
      ...base.stagecoach,
      accumulatedXp,
      waitingTokens: 2,
      deadHeroClassIds: [deadHeroId],
      pendingReplacement: {
        id: 'pr1',
        source: 'quest-result',
        resumePhase: 'hamlet',
        slots: [
          {
            partySlot: 0,
            deadCampaignHeroId: deadId,
            deathRecordId: 'dr1',
            upgradeOperations: [],
            confirmed: false,
          },
        ],
        createdAt: nowIso(),
        resolved: false,
      },
    },
  };
}
/** 取一个可选候选职业 id。 */
function pickCandidate(c: CampaignState): string {
  const cand = getReplacementCandidates(c).find((x) => x.selectable);
  if (!cand) throw new Error('no selectable replacement candidate');
  return cand.hero.id;
}

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0);
});
afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// §29.10 Replacement（最多 2 次免 Gold 升级）
// ---------------------------------------------------------------------------
describe('§29.10 Replacement', () => {
  it('90. 新 Hero 获得 Stagecoach XP（draft.xp = accumulatedXp）', () => {
    const c = replacementReadyCampaign(10);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    const out = selectReplacementHero(c, slotId, cid);
    const draft = out.stagecoach.pendingReplacement!.slots[0].draftHero!;
    expect(draft.xpState!.currentXp).toBe(10);
  });

  it('91. Stagecoach XP 不因招募而减少', () => {
    const c = replacementReadyCampaign(10);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    const sel = selectReplacementHero(c, slotId, cid);
    const conf = confirmReplacement(sel, slotId);
    expect(conf.stagecoach.accumulatedXp).toBe(10);
  });

  it('92. 新 Hero 最多两次升级', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    let s = selectReplacementHero(c, slotId, cid);
    const hero = s.stagecoach.pendingReplacement!.slots[0].draftHero!;
    const skill = hero.equippedSkillIds[0];
    s = addReplacementUpgrade(s, slotId, { type: 'hero-level' });
    s = addReplacementUpgrade(s, slotId, { type: 'skill-level', skillId: skill });
    expect(s.stagecoach.pendingReplacement!.slots[0].upgradeOperations).toHaveLength(2);
    const third = addReplacementUpgrade(s, slotId, { type: 'hero-level' });
    expect(third.stagecoach.pendingReplacement!.slots[0].upgradeOperations).toHaveLength(2);
  });

  it('93. Replacement Upgrade 不消耗 Gold（confirm 后 Gold 不变）', () => {
    const c = replacementReadyCampaign(20);
    const goldBefore = c.gold;
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    let s = selectReplacementHero(c, slotId, cid);
    s = addReplacementUpgrade(s, slotId, { type: 'hero-level' });
    const conf = confirmReplacement(s, slotId);
    expect(conf.gold).toBe(goldBefore);
  });

  it('94. Replacement Upgrade 消耗个人 XP', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    let s = selectReplacementHero(c, slotId, cid);
    const draftId = s.stagecoach.pendingReplacement!.slots[0].draftHero!.instanceId;
    s = addReplacementUpgrade(s, slotId, { type: 'hero-level' }); // 消耗 4 XP
    const conf = confirmReplacement(s, slotId);
    const newHero = conf.heroes.find((h) => h.instanceId === draftId)!; // 新英雄继承 draft 的 id
    expect(newHero.xpState!.currentXp).toBe(20 - 4);
  });

  it('95. 可混合 Hero / Skill 升级', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    let s = selectReplacementHero(c, slotId, cid);
    const hero = s.stagecoach.pendingReplacement!.slots[0].draftHero!;
    const skill = hero.equippedSkillIds[0];
    s = addReplacementUpgrade(s, slotId, { type: 'hero-level' });
    s = addReplacementUpgrade(s, slotId, { type: 'skill-level', skillId: skill });
    const types = s.stagecoach.pendingReplacement!.slots[0].upgradeOperations.map((o) => o.type);
    expect(types).toContain('hero-level');
    expect(types).toContain('skill-level');
    expect(upgradeXpSpent(s.stagecoach.pendingReplacement!.slots[0].upgradeOperations)).toBe(6);
  });

  it('96. 可以跳过升级（无操作直接确认）', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    const sel = selectReplacementHero(c, slotId, cid);
    const draftId = sel.stagecoach.pendingReplacement!.slots[0].draftHero!.instanceId;
    const conf = confirmReplacement(sel, slotId);
    const newHero = conf.heroes.find((h) => h.instanceId === draftId)!;
    expect(newHero.xpState!.currentXp).toBe(20); // 未花费
  });

  it('97. 刷新后剩余升级次数保持（存档可恢复）', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    let s = selectReplacementHero(c, slotId, cid);
    s = addReplacementUpgrade(s, slotId, { type: 'hero-level' });
    saveCampaign(s);
    const loaded = loadCampaign()!;
    expect(loaded.stagecoach.pendingReplacement).not.toBeNull();
    expect(loaded.stagecoach.pendingReplacement!.slots[0].upgradeOperations).toHaveLength(1);
  });

  it('98. 确认后新英雄加入队伍（替换阵亡英雄）', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    const sel = selectReplacementHero(c, slotId, cid);
    const draftId = sel.stagecoach.pendingReplacement!.slots[0].draftHero!.instanceId;
    const conf = confirmReplacement(sel, slotId);
    expect(conf.heroes).toHaveLength(FOUR_HEROES.length);
    const newHero = conf.heroes.find((h) => h.instanceId === draftId)!;
    expect(newHero.isAlive).toBe(true);
    expect(newHero.dead).toBe(false);
  });

  it('99. Replacement 不继承死亡英雄等级（draft Level = 1）', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    const sel = selectReplacementHero(c, slotId, cid);
    const draft = sel.stagecoach.pendingReplacement!.slots[0].draftHero!;
    expect(draft.level).toBe(1);
  });

  it('100. Replacement Trinket Capacity 与新 Level 一致（Level 1 → 1）', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    const sel = selectReplacementHero(c, slotId, cid);
    const draft = sel.stagecoach.pendingReplacement!.slots[0].draftHero!;
    expect(getHeroTrinketCapacity(draft)).toBe(1);
  });

  it('100b. removeReplacementUpgrade 恢复 XP 预算', () => {
    const c = replacementReadyCampaign(20);
    const slotId = c.stagecoach.pendingReplacement!.slots[0].deadCampaignHeroId;
    const cid = pickCandidate(c);
    let s = selectReplacementHero(c, slotId, cid);
    s = addReplacementUpgrade(s, slotId, { type: 'hero-level' });
    const opId = s.stagecoach.pendingReplacement!.slots[0].upgradeOperations[0].id;
    const removed = removeReplacementUpgrade(s, slotId, opId);
    expect(removed.stagecoach.pendingReplacement!.slots[0].upgradeOperations).toHaveLength(0);
  });
});
