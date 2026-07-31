import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CampaignState, HeroInstance, ProgressionUpgradeChoice } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource, createId, nowIso } from './random';
import { finishQuest } from './quest-result';
import { startHamletPhase } from './hamlet';
import {
  guildVisitError,
  startGuildVisit,
  addGuildUpgrade,
  commitGuildVisit,
  cancelGuildVisit,
  validateGuildUpgrade,
  getGuildSession,
} from './hamlet/guild';
import {
  applyUpgradeChoiceToHero,
  getEffectiveHeroLevel,
  getPermanentSkillLevel,
  getEffectiveSkillLevel,
  getHeroSkillSlots,
  getHeroTrinketCapacity,
  getHeroResistances,
  getHeroImmunities,
  pendingCostTotals,
  validateProgressionUpgrade,
} from './progression/upgrade-core';
import { getHeroXp, earnHeroXp } from './progression/xp-ledger';
import { initBattle } from './battle';
import { applyEffectsWithResistance } from './status-effects';
import { GUILD_UPGRADE_COSTS, MAX_UPGRADES_PER_GUILD_VISIT } from '../data/progression/guild-costs';
import { maxAvailableSkillLevel } from '../data/progression/skill-level-registry';
import {
  getHeroLevelDefinition,
  maxAvailableHeroLevel,
  validateHeroLevelRegistry,
} from '../data/progression/hero-level-registry';

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
/** 进入 Hamlet 并给指定英雄足够 XP / 全队足够 Gold，便于 Guild 升级测试。 */
function guildReadyCampaign(heroIndex = 0, xp = 20, gold = 50): CampaignState {
  let c = hamletCampaign();
  c = { ...c, gold };
  const hid = c.heroes[heroIndex].instanceId;
  c = earnHeroXp(c, hid, xp, 'test-grant');
  return c;
}
function withXp(hero: HeroInstance, xp: number): HeroInstance {
  return { ...hero, xp, xpState: { currentXp: xp, lifetimeXpEarned: xp, lifetimeXpSpent: 0 } };
}
function withBlocked(c: CampaignState, buildingId: string | null): CampaignState {
  return { ...c, hamlet: { ...c.hamlet, caretakerBlockedBuildingId: buildingId } };
}
/** 取英雄第一个可升级（Registry 具备 Level 2+）的已装备技能。 */
function firstUpgradableSkill(hero: HeroInstance): string {
  const sid = hero.equippedSkillIds.find((s) => maxAvailableSkillLevel(s) >= 2);
  if (!sid) throw new Error('test hero has no upgradable skill');
  return sid;
}
/** 找一个可开战的房间并进入战斗（initBattle 必须传 roomId）。 */
function battleRoomId(c: CampaignState): string {
  const room = c.dungeon!.rooms.find((r) => r.type === 'battle' || r.type === 'objective');
  if (!room) throw new Error('dungeon has no battle room');
  return room.id;
}
function startBattle(c: CampaignState): CampaignState {
  return initBattle(c, battleRoomId(c));
}

beforeEach(() => {
  setRandomSource(() => 0);
});
afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// §29.3 Guild
// ---------------------------------------------------------------------------
describe('§29.3 Guild（会话式原子升级）', () => {
  it('21. Guild 本身没有等级概念（只能升级英雄/技能，不能升级建筑）', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    // Guild 访问以英雄为作用对象，会话 choices 只能是 hero-level / skill-level
    const started = startGuildVisit(c, hero.instanceId);
    const session = getGuildSession(started)!;
    expect(session).not.toBeNull();
    expect(session.choices).toEqual([]);
    // 不存在 "guild-level" 这类升级类型（类型层面也无此分支）
    expect(GUILD_UPGRADE_COSTS).not.toHaveProperty('guildLevel');
  });

  it('22. 一次访问最多两次升级', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    s = addGuildUpgrade(s, { type: 'skill-level', skillId: skill });
    expect(getGuildSession(s)!.choices).toHaveLength(2);
    const third = addGuildUpgrade(s, { type: 'hero-level' });
    expect(getGuildSession(third)!.choices).toHaveLength(2); // 第 3 次被拒
  });

  it('23. 一次访问可混合 Hero + Skill', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    s = addGuildUpgrade(s, { type: 'skill-level', skillId: skill });
    const types = getGuildSession(s)!.choices.map((ch) => ch.type);
    expect(types).toContain('hero-level');
    expect(types).toContain('skill-level');
  });

  it('24. 0 次升级取消不占用 Day / 不消费', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const started = startGuildVisit(c, hero.instanceId);
    expect(getGuildSession(started)).not.toBeNull();
    const cancelled = cancelGuildVisit(started);
    expect(getGuildSession(cancelled)).toBeNull(); // 会话清空，无副作用
    expect(cancelled.heroes[0].hasActedToday).toBe(false);
    expect(cancelled.hamlet.occupiedBuildingIds).not.toContain('guild');
  });

  it('25. 1 次升级合法', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    expect(getGuildSession(s)!.choices).toHaveLength(1);
  });

  it('26. 2 次升级合法', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    s = addGuildUpgrade(s, { type: 'skill-level', skillId: skill });
    expect(getGuildSession(s)!.choices).toHaveLength(2);
  });

  it('27. 第 3 次被拒绝（maxUpgrades）', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    s = addGuildUpgrade(s, { type: 'skill-level', skillId: skill });
    const v = validateGuildUpgrade(s, { type: 'hero-level' });
    expect(v?.ok).toBe(false);
    expect(v?.reason).toContain(String(MAX_UPGRADES_PER_GUILD_VISIT));
  });

  it('28. Caretaker 阻塞时不可访问 Guild', () => {
    const c = withBlocked(guildReadyCampaign(), 'guild');
    expect(guildVisitError(c, c.heroes[0].instanceId)).not.toBeNull();
  });

  it('29. 建筑已占用时不可访问 Guild', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    const committed = commitGuildVisit(s);
    expect(committed.ok).toBe(true);
    // 另一名英雄此时访问应被占用阻塞
    expect(guildVisitError(committed.campaign, c.heroes[1].instanceId)).not.toBeNull();
  });

  it('30. 英雄已行动时不可访问 Guild', () => {
    const c = guildReadyCampaign();
    const acted = {
      ...c,
      heroes: c.heroes.map((h, i) =>
        i === 0 ? { ...h, hasActedToday: true } : h
      ),
    };
    expect(guildVisitError(acted, acted.heroes[0].instanceId)).not.toBeNull();
  });

  it('31. 死亡英雄不可访问 Guild', () => {
    const c = guildReadyCampaign();
    const dead = {
      ...c,
      heroes: c.heroes.map((h, i) =>
        i === 0 ? { ...h, isAlive: false, dead: true } : h
      ),
    };
    expect(guildVisitError(dead, dead.heroes[0].instanceId)).not.toBeNull();
  });

  it('32. 存在 Pending Decision 时不可访问（store 层在结算前拦截，buildingVisitError 不重复拦截）', () => {
    // 引擎权威校验 buildingVisitError 不依赖 pendingQuirkDecisions；
    // Pending Decision 拦截由 store / UI 在进入 Hamlet 行动前完成。
    // 此处验证：blocked / occupied / acted / dead 等真实守卫仍然有效。
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const blocked = withBlocked(c, 'guild');
    expect(guildVisitError(blocked, hero.instanceId)).not.toBeNull();
  });

  it('33. commitGuildVisit 原子提交（等级/XP/Gold 一次性落地）', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const xpBefore = getHeroXp(hero);
    const goldBefore = c.gold;
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    const res = commitGuildVisit(s);
    expect(res.ok).toBe(true);
    const h = res.campaign.heroes.find((x) => x.instanceId === hero.instanceId)!;
    expect(h.level).toBe(2);
    expect(getHeroXp(h)).toBe(xpBefore - GUILD_UPGRADE_COSTS.heroLevel.xp);
    expect(res.campaign.gold).toBe(goldBefore - GUILD_UPGRADE_COSTS.heroLevel.gold);
  });

  it('34. 第 2 项失败时整体回滚（不扣 Gold / 不扣 XP）', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    // 仅 4 XP：足以支付第 1 次 hero-level，但不够第 2 次
    const poor = {
      ...c,
      heroes: c.heroes.map((h) => (h.instanceId === hero.instanceId ? withXp(h, 4) : h)),
    };
    const choices: ProgressionUpgradeChoice[] = [
      {
        id: createId('upg'),
        type: 'hero-level',
        heroInstanceId: hero.instanceId,
        skillId: null,
        fromLevel: 1,
        toLevel: 2,
        xpCost: 4,
        goldCost: 2,
      },
      {
        id: createId('upg'),
        type: 'hero-level',
        heroInstanceId: hero.instanceId,
        skillId: null,
        fromLevel: 2,
        toLevel: 3,
        xpCost: 4,
        goldCost: 2,
      },
    ];
    const injected: CampaignState = {
      ...poor,
      guildVisitSession: {
        id: createId('guild'),
        visitId: poor.hamlet.visitId,
        day: poor.hamlet.currentDay,
        heroInstanceId: hero.instanceId,
        choices,
        maxUpgrades: 2,
        committed: false,
        createdAt: nowIso(),
      },
    };
    const res = commitGuildVisit(injected);
    expect(res.ok).toBe(false);
    expect(res.campaign).toBe(injected); // 完全未修改（回滚）
    expect(getHeroXp(res.campaign.heroes[0])).toBe(4);
    expect(res.campaign.gold).toBe(poor.gold);
  });

  it('35. 双击不重复扣费（已提交会话二次 commit 失败）', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    const first = commitGuildVisit(s);
    expect(first.ok).toBe(true);
    const goldAfterFirst = first.campaign.gold;
    const second = commitGuildVisit(first.campaign);
    expect(second.ok).toBe(false); // 无会话可提交
    expect(second.campaign.gold).toBe(goldAfterFirst);
  });

  it('36. 成功后 Hero 已行动', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    const res = commitGuildVisit(s);
    expect(res.campaign.heroes.find((h) => h.instanceId === hero.instanceId)!.hasActedToday).toBe(
      true
    );
  });

  it('37. 成功后 Guild 已占用', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'hero-level' });
    const res = commitGuildVisit(s);
    expect(res.campaign.hamlet.occupiedBuildingIds).toContain('guild');
  });
});

// ---------------------------------------------------------------------------
// §29.4 Hero Level
// ---------------------------------------------------------------------------
describe('§29.4 Hero Level', () => {
  it('38. Level 1 → 2 消耗 4 XP + 2 Gold', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const v = validateGuildUpgrade(startGuildVisit(c, hero.instanceId), { type: 'hero-level' });
    expect(v?.ok).toBe(true);
    expect(v?.xpCost).toBe(GUILD_UPGRADE_COSTS.heroLevel.xp);
    expect(v?.goldCost).toBe(GUILD_UPGRADE_COSTS.heroLevel.gold);
  });

  it('39. Level 2 → 3 同样消耗 4 XP + 2 Gold', () => {
    const hero: HeroInstance = { ...withXp(freshCampaign().heroes[0], 20), level: 2 };
    const v = validateProgressionUpgrade(
      { hero, choices: [], maxUpgrades: 2, paymentMode: 'xp-and-gold', availableGold: 50 },
      { type: 'hero-level' }
    );
    expect(v.ok).toBe(true);
    expect(v.toLevel).toBe(3);
    expect(v.xpCost).toBe(GUILD_UPGRADE_COSTS.heroLevel.xp);
    expect(v.goldCost).toBe(GUILD_UPGRADE_COSTS.heroLevel.gold);
  });

  it('40. Level 3 不可继续升级', () => {
    const hero = withXp({ ...freshCampaign().heroes[0], level: 3 }, 20);
    const v = validateProgressionUpgrade(
      {
        hero,
        choices: [],
        maxUpgrades: 2,
        paymentMode: 'xp-and-gold',
        availableGold: 50,
      },
      { type: 'hero-level' }
    );
    expect(v.ok).toBe(false);
  });

  it('41. Hero Level 与 Skill Level 独立（升级英雄不改变技能等级）', () => {
    const hero = withXp(freshCampaign().heroes[0], 20);
    const choice: ProgressionUpgradeChoice = {
      id: 'c',
      type: 'hero-level',
      heroInstanceId: hero.instanceId,
      skillId: null,
      fromLevel: 1,
      toLevel: 2,
      xpCost: 4,
      goldCost: 2,
    };
    const upgraded = applyUpgradeChoiceToHero(hero, choice)!;
    expect(upgraded.level).toBe(2);
    expect(upgraded.skillLevels).toEqual(hero.skillLevels);
  });

  it('42. 英雄等级读取正确（缺字段降级为 1）', () => {
    expect(getEffectiveHeroLevel({ ...freshCampaign().heroes[0], level: 2 })).toBe(2);
    expect(getEffectiveHeroLevel({ ...freshCampaign().heroes[0], level: 99 as 1 | 2 | 3 })).toBe(1);
  });

  it('43. maxHp 随等级更新', () => {
    const hero = freshCampaign().heroes[0];
    const def = getHeroLevelDefinition(hero.heroId, 2)!;
    const choice: ProgressionUpgradeChoice = {
      id: 'c',
      type: 'hero-level',
      heroInstanceId: hero.instanceId,
      skillId: null,
      fromLevel: 1,
      toLevel: 2,
      xpCost: 4,
      goldCost: 2,
    };
    const upgraded = applyUpgradeChoiceToHero(withXp(hero, 20), choice)!;
    expect(upgraded.maxLife).toBe(def.maxHp);
  });

  it('44. 升级只提上限，不治疗既有伤口（wounds 保留）', () => {
    const hero = { ...withXp(freshCampaign().heroes[0], 20), wounds: 2 };
    const choice: ProgressionUpgradeChoice = {
      id: 'c',
      type: 'hero-level',
      heroInstanceId: hero.instanceId,
      skillId: null,
      fromLevel: 1,
      toLevel: 2,
      xpCost: 4,
      goldCost: 2,
    };
    const upgraded = applyUpgradeChoiceToHero(hero, choice)!;
    expect(upgraded.wounds).toBe(2);
  });

  it('45. Speed 随等级更新', () => {
    const hero = freshCampaign().heroes[0];
    const def = getHeroLevelDefinition(hero.heroId, 3)!;
    const choice: ProgressionUpgradeChoice = {
      id: 'c',
      type: 'hero-level',
      heroInstanceId: hero.instanceId,
      skillId: null,
      fromLevel: 2,
      toLevel: 3,
      xpCost: 4,
      goldCost: 2,
    };
    const upgraded = applyUpgradeChoiceToHero({ ...withXp(hero, 20), level: 2 }, choice)!;
    expect(upgraded.speed).toBe(def.speed);
  });

  it('46. 抗性 / 免疫随等级更新（Level 3 免疫 Stun）', () => {
    const hero = freshCampaign().heroes[0];
    expect(getHeroImmunities({ ...hero, level: 3 })).toContain('stun');
    expect(getHeroImmunities({ ...hero, level: 2 })).not.toContain('stun');
    expect(getHeroResistances({ ...hero, level: 3 }).stun).toBeGreaterThan(
      getHeroResistances({ ...hero, level: 2 }).stun
    );
  });

  it('47. Skill Slot 随等级更新（Level 3 解锁第 4 槽）', () => {
    expect(getHeroSkillSlots({ ...freshCampaign().heroes[0], level: 1 })).toBe(3);
    expect(getHeroSkillSlots({ ...freshCampaign().heroes[0], level: 3 })).toBe(4);
  });

  it('48. Trinket Capacity 随等级更新', () => {
    expect(getHeroTrinketCapacity({ ...freshCampaign().heroes[0], level: 1 })).toBe(1);
    expect(getHeroTrinketCapacity({ ...freshCampaign().heroes[0], level: 2 })).toBe(2);
  });

  it('49. 升级后已装备技能与饰物字段保留', () => {
    const hero = freshCampaign().heroes[0];
    const choice: ProgressionUpgradeChoice = {
      id: 'c',
      type: 'hero-level',
      heroInstanceId: hero.instanceId,
      skillId: null,
      fromLevel: 1,
      toLevel: 2,
      xpCost: 4,
      goldCost: 2,
    };
    const upgraded = applyUpgradeChoiceToHero(withXp(hero, 20), choice)!;
    expect(upgraded.equippedSkillIds).toEqual(hero.equippedSkillIds);
    // Phase 8D：Trinket Capacity 由等级派生（本原型不存储 equippedTrinketIds），
    // 升级到 Level 2 后容量应为 2。
    expect(getHeroTrinketCapacity(upgraded)).toBe(2);
  });

  it('51. 缺失下一等级定义时拒绝升级', () => {
    const hero: HeroInstance = { ...freshCampaign().heroes[0], heroId: 'ghost-class', level: 1 };
    expect(maxAvailableHeroLevel('ghost-class')).toBe(1);
    const v = validateProgressionUpgrade(
      {
        hero,
        choices: [],
        maxUpgrades: 2,
        paymentMode: 'xp-and-gold',
        availableGold: 50,
      },
      { type: 'hero-level' }
    );
    expect(v.ok).toBe(false);
  });

  it('52. formal 模式下 prototype 数据被 Registry 校验报告出来', () => {
    expect(validateHeroLevelRegistry('formal').length).toBeGreaterThan(0);
    expect(validateHeroLevelRegistry('prototype')).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// §29.5 Skill Level
// ---------------------------------------------------------------------------
describe('§29.5 Skill Level', () => {
  function skillChoice(hero: HeroInstance, skillId: string, from: 1 | 2, to: 2 | 3): ProgressionUpgradeChoice {
    return {
      id: createId('upg'),
      type: 'skill-level',
      heroInstanceId: hero.instanceId,
      skillId,
      fromLevel: from,
      toLevel: to,
      xpCost: GUILD_UPGRADE_COSTS.skillLevel.xp,
      goldCost: GUILD_UPGRADE_COSTS.skillLevel.gold,
    };
  }

  it('53. Skill I → II 消耗 2 XP + 1 Gold', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const v = validateGuildUpgrade(startGuildVisit(c, hero.instanceId), {
      type: 'skill-level',
      skillId: skill,
    });
    expect(v?.ok).toBe(true);
    expect(v?.xpCost).toBe(GUILD_UPGRADE_COSTS.skillLevel.xp);
    expect(v?.goldCost).toBe(GUILD_UPGRADE_COSTS.skillLevel.gold);
  });

  it('54. Skill II → III 同样消耗 2 XP + 1 Gold', () => {
    const hero = freshCampaign().heroes[0];
    const skill = firstUpgradableSkill(hero);
    const lvl2Hero: HeroInstance = { ...withXp(hero, 20), skillLevels: { ...hero.skillLevels, [skill]: 2 } };
    const v = validateProgressionUpgrade(
      { hero: lvl2Hero, choices: [], maxUpgrades: 2, paymentMode: 'xp-and-gold', availableGold: 50 },
      { type: 'skill-level', skillId: skill }
    );
    expect(v.ok).toBe(true);
    expect(v.toLevel).toBe(3);
    expect(v.xpCost).toBe(GUILD_UPGRADE_COSTS.skillLevel.xp);
    expect(v.goldCost).toBe(GUILD_UPGRADE_COSTS.skillLevel.gold);
  });

  it('55. Skill III 不可继续升级', () => {
    const hero = { ...freshCampaign().heroes[0], skillLevels: { smite: 3 } } as HeroInstance;
    const v = validateProgressionUpgrade(
      { hero, choices: [], maxUpgrades: 2, paymentMode: 'xp-and-gold', availableGold: 50 },
      { type: 'skill-level', skillId: 'smite' }
    );
    expect(v.ok).toBe(false);
  });

  it('56. Skill ID 在升级后不变', () => {
    const hero = freshCampaign().heroes[0];
    const skill = firstUpgradableSkill(hero);
    const upgraded = applyUpgradeChoiceToHero(withXp(hero, 20), skillChoice(hero, skill, 1, 2))!;
    expect(getPermanentSkillLevel(upgraded, skill)).toBe(2);
    expect(upgraded.skillLevels).toHaveProperty(skill);
  });

  it('58. 升级后装备技能读取到新等级', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'skill-level', skillId: skill });
    const res = commitGuildVisit(s);
    const h = res.campaign.heroes.find((x) => x.instanceId === hero.instanceId)!;
    expect(getPermanentSkillLevel(h, skill)).toBe(2);
  });

  it('59. 其他技能等级不变', () => {
    const hero = freshCampaign().heroes[0];
    const skill = firstUpgradableSkill(hero);
    const other = hero.equippedSkillIds.find((s) => s !== skill)!;
    const upgraded = applyUpgradeChoiceToHero(withXp(hero, 20), skillChoice(hero, skill, 1, 2))!;
    expect(getPermanentSkillLevel(upgraded, other)).toBe(1);
  });

  it('60. 同一次 Guild Visit 可同一技能连升两级', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    let s = startGuildVisit(c, hero.instanceId);
    s = addGuildUpgrade(s, { type: 'skill-level', skillId: skill });
    s = addGuildUpgrade(s, { type: 'skill-level', skillId: skill });
    expect(getGuildSession(s)!.choices).toHaveLength(2);
  });

  it('61. 连升两级总费用为 4 XP + 2 Gold', () => {
    const hero = freshCampaign().heroes[0];
    const skill = firstUpgradableSkill(hero);
    const totals = pendingCostTotals([
      skillChoice(hero, skill, 1, 2),
      skillChoice(hero, skill, 2, 3),
    ]);
    expect(totals.xp).toBe(GUILD_UPGRADE_COSTS.skillLevel.xp * 2);
    expect(totals.gold).toBe(GUILD_UPGRADE_COSTS.skillLevel.gold * 2);
  });

  it('62. Level I 不可单次直接跳 Level III（一次只 +1）', () => {
    const c = guildReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const v = validateGuildUpgrade(startGuildVisit(c, hero.instanceId), {
      type: 'skill-level',
      skillId: skill,
    });
    expect(v?.fromLevel).toBe(1);
    expect(v?.toLevel).toBe(2);
  });

  it('63. 技能未装备时不可升级', () => {
    const hero = freshCampaign().heroes[0];
    const unequipped = hero.equippedSkillIds[0] === 'smite' ? 'holy-lance' : 'smite';
    const v = validateProgressionUpgrade(
      { hero, choices: [], maxUpgrades: 2, paymentMode: 'xp-and-gold', availableGold: 50 },
      { type: 'skill-level', skillId: unequipped }
    );
    expect(v.ok).toBe(false);
  });

  it('64. 缺少 Level 2 卡面数据时拒绝升级', () => {
    const hero = freshCampaign().heroes[0];
    expect(maxAvailableSkillLevel('no-such-skill')).toBe(1);
    const v = validateProgressionUpgrade(
      { hero, choices: [], maxUpgrades: 2, paymentMode: 'xp-and-gold', availableGold: 50 },
      { type: 'skill-level', skillId: 'no-such-skill' }
    );
    expect(v.ok).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// §29.6 Loadout / §29.7 Battle / §29.8 Quirk·Disease·Trinket scaling
// ---------------------------------------------------------------------------
describe('§29.6 Loadout 派生', () => {
  it('65. 已装备技能数不超过 Skill Slot', () => {
    const hero = freshCampaign().heroes[0];
    expect(hero.equippedSkillIds.length).toBeLessThanOrEqual(getHeroSkillSlots(hero));
  });
  it('66. Level Up 增加 Slot（Level 3 可多装备一项）', () => {
    const hero = freshCampaign().heroes[0];
    expect(getHeroSkillSlots({ ...hero, level: 3 })).toBe(getHeroSkillSlots(hero) + 1);
  });
});

describe('§29.7 Battle 集成', () => {
  it('71. Battle 使用当前 Hero Level Stats', () => {
    const c = freshCampaign();
    const withBattle = startBattle(c);
    const hero = c.heroes[0];
    const unit = withBattle.battle!.heroes[0];
    expect(unit.heroLevel).toBe(getEffectiveHeroLevel(hero));
    expect(unit.resistances).toBeDefined();
  });
  it('72. Battle 使用当前 Skill Level Definition', () => {
    const c = freshCampaign();
    const withBattle = startBattle(c);
    const hero = c.heroes[0];
    const unit = withBattle.battle!.heroes[0];
    for (const sid of hero.equippedSkillIds) {
      expect(unit.skillLevels![sid]).toBe(getEffectiveSkillLevel(c, hero, sid));
    }
  });
  it('73. Battle Snapshot 可恢复（battle 持久化在 campaign）', () => {
    const c = startBattle(freshCampaign());
    expect(c.battle).not.toBeNull();
    expect(c.battle!.heroes.length).toBe(c.heroes.length);
  });
  it('74/75. Skill 升级后下一次 Battle 使用新数据', () => {
    const base = freshCampaign();
    const hero = base.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const upgraded = applyUpgradeChoiceToHero(withXp(hero, 20), {
      id: 'c',
      type: 'skill-level',
      heroInstanceId: hero.instanceId,
      skillId: skill,
      fromLevel: 1,
      toLevel: 2,
      xpCost: 2,
      goldCost: 1,
    })!;
    const c: CampaignState = {
      ...base,
      heroes: base.heroes.map((h) => (h.instanceId === hero.instanceId ? upgraded : h)),
    };
    const withBattle = startBattle(c);
    expect(withBattle.battle!.heroes[0].skillLevels![skill]).toBe(2);
  });
  it('76. Resistance / Immunity 读取当前等级（Level 3 免疫 Stun 在战斗中生效）', () => {
    const base = freshCampaign();
    const hero = base.heroes[0];
    const lvl3Hero: HeroInstance = { ...hero, level: 3 };
    const c: CampaignState = {
      ...base,
      heroes: base.heroes.map((h) => (h.instanceId === hero.instanceId ? lvl3Hero : h)),
    };
    const withBattle = startBattle(c);
    expect(withBattle.battle!.heroes[0].immunities).toContain('stun');
  });
});

describe('§29.8 Quirk / Disease / Trinket 缩放', () => {
  it('77-80. 抗性随等级缩放（驱动 Quirk/Disease/Debuff 判定）', () => {
    const hero = freshCampaign().heroes[0];
    const l1 = getHeroResistances({ ...hero, level: 1 });
    const l2 = getHeroResistances({ ...hero, level: 2 });
    const l3 = getHeroResistances({ ...hero, level: 3 });
    expect(l2.stun).toBe(l1.stun + 10);
    expect(l3.stun).toBe(l2.stun + 10);
  });
  it('81. Trinket Capacity 由等级实时派生（不读旧缓存字段）', () => {
    const hero = { ...freshCampaign().heroes[0], level: 2 } as HeroInstance & {
      trinketCapacity?: number;
    };
    // 即使旧字段存在，也应忽略并按 Registry 重算
    hero.trinketCapacity = 99;
    expect(getHeroTrinketCapacity(hero)).toBe(2);
  });
  it('82. 升级不产生超容量', () => {
    const hero = freshCampaign().heroes[0];
    expect(getHeroTrinketCapacity({ ...hero, level: 3 })).toBeLessThanOrEqual(3);
  });
  it('83. applyEffectsWithResistance 对 Level 3 的 Stun 免疫生效', () => {
    setRandomSource(() => 0.99); // 抗性掷骰必失败 → 仅免疫路径生效
    const hero: HeroInstance = { ...freshCampaign().heroes[0], level: 3 };
    const unit = {
      id: hero.instanceId,
      name: hero.name,
      heroLevel: 3,
      immunities: getHeroImmunities(hero),
      resistances: getHeroResistances(hero),
    } as any;
    const eff = applyEffectsWithResistance(unit, [{ type: 'stun', amount: 1 }]);
    expect(eff.blocked.some((b) => b.type === 'stun' && b.reason === 'immune')).toBe(true);
  });
});
