import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CampaignState } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource } from './random';
import { finishQuest } from './quest-result';
import { startHamletPhase } from './hamlet';
import { migrateCampaignToLatest, saveCampaign, loadCampaign, clearCampaign } from './save';
import {
  startGuildVisit,
  addGuildUpgrade,
  commitGuildVisit,
} from './hamlet/guild';
import { getPermanentSkillLevel } from './progression/upgrade-core';
import { getHeroXp, earnHeroXp } from './progression/xp-ledger';
import { validateHeroLevelRegistry } from '../data/progression/hero-level-registry';
import { SAVE_VERSION } from './save';

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
function guildReadyCampaign(heroIndex = 0, xp = 20, gold = 50): CampaignState {
  let c = hamletCampaign();
  c = { ...c, gold };
  const hid = c.heroes[heroIndex].instanceId;
  c = earnHeroXp(c, hid, xp, 'test-grant');
  return c;
}

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0);
});
afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// §29.11 存档与迁移
// ---------------------------------------------------------------------------
describe('§29.11 存档与迁移', () => {
  it('101. Phase 8C 存档可迁移到当前版本（补齐 Phase 8D 字段）', () => {
    const old = freshCampaign() as any;
    old.saveVersion = 6;
    delete old.objectiveProgress;
    delete old.pendingQuestXp;
    delete old.questXpResults;
    delete old.progressionTransactions;
    delete old.temporarySkillFormOverrides;
    old.guildVisitSession = null;
    old.replacementUpgradeSession = null;
    const m = migrateCampaignToLatest(old);
    expect(m.saveVersion).toBe(SAVE_VERSION);
    expect(m.objectiveProgress).toEqual([]);
    expect(m.pendingQuestXp).toBeNull();
    expect(m.questXpResults).toEqual([]);
    expect(Array.isArray(m.temporarySkillFormOverrides)).toBe(true);
  });

  it('102. 缺失 Level 默认 1', () => {
    const base = freshCampaign();
    const broken = { ...base.heroes[0], level: undefined } as any;
    const c = { ...base, heroes: [broken, ...base.heroes.slice(1)] } as any;
    const m = migrateCampaignToLatest(c);
    expect(m.heroes[0].level).toBe(1);
  });

  it('103. 旧 XP 字段（仅 hero.xp）正确迁移为 xpState', () => {
    const base = freshCampaign();
    const broken = { ...base.heroes[0], xp: 7, xpState: undefined } as any;
    const c = { ...base, heroes: [broken, ...base.heroes.slice(1)] } as any;
    const m = migrateCampaignToLatest(c);
    expect(m.heroes[0].xpState.currentXp).toBe(7);
    expect(m.heroes[0].xp).toBe(7);
  });

  it('104. 异常 Skill 等级被 clamp 到合法范围（5 → 3）', () => {
    const base = freshCampaign();
    const broken = { ...base.heroes[0], skillLevels: { ...base.heroes[0].skillLevels, smite: 5 } } as any;
    const c = { ...base, heroes: [broken, ...base.heroes.slice(1)] } as any;
    const m = migrateCampaignToLatest(c);
    expect(m.heroes[0].skillLevels.smite).toBe(3);
  });

  it('105. Unknown Skill 不白屏（保留且读取安全）', () => {
    const base = freshCampaign();
    const broken = {
      ...base.heroes[0],
      skillLevels: { ...base.heroes[0].skillLevels, 'ghost-skill': 2 },
    } as any;
    const c = { ...base, heroes: [broken, ...base.heroes.slice(1)] } as any;
    const m = migrateCampaignToLatest(c);
    expect(() => getPermanentSkillLevel(m.heroes[0], 'ghost-skill')).not.toThrow();
    expect(getPermanentSkillLevel(m.heroes[0], 'ghost-skill')).toBe(2);
  });

  it('106. 超 Slot / 超 Capacity 的 Loadout 不被静默删除', () => {
    const base = freshCampaign();
    const over = {
      ...base.heroes[0],
      equippedSkillIds: [...base.heroes[0].equippedSkillIds, ...base.heroes[0].equippedSkillIds],
    } as any;
    const c = { ...base, heroes: [over, ...base.heroes.slice(1)] } as any;
    const m = migrateCampaignToLatest(c);
    expect(m.heroes[0].equippedSkillIds.length).toBe(over.equippedSkillIds.length);
  });

  it('107. Guild 已提交成长状态可恢复（升级后存档回读等级保留）', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    const committed = commitGuildVisit(s);
    saveCampaign(committed.campaign);
    const loaded = loadCampaign()!;
    const lh = loaded.heroes.find((x) => x.instanceId === hero.instanceId)!;
    expect(lh.level).toBe(2);
    expect(getHeroXp(lh)).toBe(getHeroXp(committed.campaign.heroes.find((x) => x.instanceId === hero.instanceId)!));
  });

  it('108. Quest XP Pending Transaction 可恢复（quest-result 阶段回读挂起项）', () => {
    const c = resolvedCampaign(); // 含 pendingQuestXp，未发放
    saveCampaign(c);
    const loaded = loadCampaign()!;
    expect(loaded.pendingQuestXp).not.toBeNull();
    expect(loaded.pendingQuestXp!.xpPerHero).toBe(c.pendingQuestXp!.xpPerHero);
  });

  it('109. 导出再导入后成长状态一致（Round Trip）', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = hero.equippedSkillIds[0];
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    s = addGuildUpgrade(s, { type: 'skill-level', skillId: skill });
    const committed = commitGuildVisit(s);
    saveCampaign(committed.campaign);
    const loaded = loadCampaign()!;
    const lh = loaded.heroes.find((x) => x.instanceId === hero.instanceId)!;
    const orig = committed.campaign.heroes.find((x) => x.instanceId === hero.instanceId)!;
    expect(lh.level).toBe(orig.level);
    expect(getHeroXp(lh)).toBe(getHeroXp(orig));
    expect(getPermanentSkillLevel(lh, skill)).toBe(getPermanentSkillLevel(orig, skill));
  });

  it('110. Registry validation 可报告缺失 / 未核实数据', () => {
    expect(validateHeroLevelRegistry('formal').length).toBeGreaterThan(0); // prototype 数据在 formal 下被报告
    expect(validateHeroLevelRegistry('prototype')).toEqual([]); // prototype 模式无报告
  });
});
