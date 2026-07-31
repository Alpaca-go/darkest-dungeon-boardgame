import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import type { CampaignState, HeroInstance } from '../types';
import { createNewCampaign, selectParty, applyDefaultLoadout, selectQuest } from './campaign';
import { setRandomSource } from './random';
import { finishQuest } from './quest-result';
import { startHamletPhase } from './hamlet';
import {
  visitBlacksmith,
  blacksmithVisitError,
  getActiveSkillFormOverrides,
} from './hamlet/blacksmith';
import {
  getEffectiveSkillLevel,
  getPermanentSkillLevel,
} from './progression/upgrade-core';
import { consumeTemporarySkillForms, clearConsumedSkillForms } from './progression/skill-forms';
import { saveCampaign, loadCampaign, clearCampaign } from './save';
import { maxAvailableSkillLevel } from '../data/progression/skill-level-registry';

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
/** Hamlet + 足够 Gold 的战役（Blacksmith 只消费 Gold，不消费 XP）。 */
function blacksmithReadyCampaign(gold = 50): CampaignState {
  return { ...hamletCampaign(), gold };
}
function firstUpgradableSkill(hero: HeroInstance): string {
  const sid = hero.equippedSkillIds.find((s) => maxAvailableSkillLevel(s) >= 2);
  if (!sid) throw new Error('test hero has no upgradable skill');
  return sid;
}

beforeEach(() => {
  clearCampaign();
  setRandomSource(() => 0);
});
afterEach(() => {
  setRandomSource(null);
});

// ---------------------------------------------------------------------------
// §29.9 Blacksmith（临时 Skill Form）
// ---------------------------------------------------------------------------
describe('§29.9 Blacksmith（临时 Skill Form）', () => {
  it('84. 临时 Form 不改变永久 Skill Level', () => {
    const c = blacksmithReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const out = visitBlacksmith(c, hero.instanceId, skill);
    expect(getPermanentSkillLevel(out.heroes[0], skill)).toBe(1);
    expect(getEffectiveSkillLevel(out, out.heroes[0], skill)).toBe(2);
    expect(getActiveSkillFormOverrides(out, hero.instanceId).length).toBe(1);
  });

  it('85. 临时 Level 3 在 Quest 中生效（永久 Level 2 + 临时 +1）', () => {
    const c = blacksmithReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const lvl2Hero: HeroInstance = { ...hero, skillLevels: { ...hero.skillLevels, [skill]: 2 } };
    const c2: CampaignState = {
      ...c,
      heroes: c.heroes.map((h) => (h.instanceId === hero.instanceId ? lvl2Hero : h)),
    };
    const out = visitBlacksmith(c2, hero.instanceId, skill);
    const h = out.heroes.find((x) => x.instanceId === hero.instanceId)!;
    expect(getPermanentSkillLevel(h, skill)).toBe(2);
    expect(getEffectiveSkillLevel(out, h, skill)).toBe(3);
  });

  it('86. Quest 结束（consumeTemporarySkillForms）恢复永久等级', () => {
    const c = blacksmithReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const bought = visitBlacksmith(c, hero.instanceId, skill);
    expect(getEffectiveSkillLevel(bought, bought.heroes[0], skill)).toBe(2);
    const consumed = consumeTemporarySkillForms(bought);
    const h = consumed.heroes.find((x) => x.instanceId === hero.instanceId)!;
    expect(getEffectiveSkillLevel(consumed, h, skill)).toBe(getPermanentSkillLevel(h, skill));
  });

  it('87. 临时等级不低于永久等级（max 取较大值）', () => {
    const c = blacksmithReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const out = visitBlacksmith(c, hero.instanceId, skill);
    const h = out.heroes.find((x) => x.instanceId === hero.instanceId)!;
    expect(getEffectiveSkillLevel(out, h, skill)).toBeGreaterThanOrEqual(
      getPermanentSkillLevel(h, skill)
    );
  });

  it('88. 无提升空间时禁止消费（已至上限 III / 缺卡面）', () => {
    const c = blacksmithReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const maxed: HeroInstance = { ...hero, skillLevels: { ...hero.skillLevels, [skill]: 3 } };
    const c2: CampaignState = {
      ...c,
      heroes: c.heroes.map((h) => (h.instanceId === hero.instanceId ? maxed : h)),
    };
    expect(blacksmithVisitError(c2, hero.instanceId, skill)).not.toBeNull();
    // 缺卡面数据
    expect(blacksmithVisitError(c, hero.instanceId, 'no-such-skill')).not.toBeNull();
  });

  it('89. 刷新后 Override 保留（存档可恢复）', () => {
    const c = blacksmithReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const bought = visitBlacksmith(c, hero.instanceId, skill);
    saveCampaign(bought);
    const loaded = loadCampaign()!;
    const h = loaded.heroes.find((x) => x.instanceId === hero.instanceId)!;
    expect(getActiveSkillFormOverrides(loaded, hero.instanceId).length).toBe(1);
    expect(getEffectiveSkillLevel(loaded, h, skill)).toBe(2);
  });

  it('89b. 进入 Hamlet 时清理已消耗的临时 Form（clearConsumedSkillForms）', () => {
    const c = blacksmithReadyCampaign();
    const hero = c.heroes[0];
    const skill = firstUpgradableSkill(hero);
    const bought = visitBlacksmith(c, hero.instanceId, skill);
    const consumed = consumeTemporarySkillForms(bought);
    expect(getActiveSkillFormOverrides(consumed, hero.instanceId).length).toBe(0);
    const cleaned = clearConsumedSkillForms(consumed);
    expect(cleaned.temporarySkillFormOverrides).toEqual([]);
  });
});
