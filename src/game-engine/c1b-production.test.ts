import { describe, expect, it } from 'vitest';
import { applyDefaultLoadout, createNewCampaign, selectParty } from './campaign';
import { generateDungeon } from './dungeon';
import { initBattle } from './battle';
import { acquireTrinket } from './trinkets/acquire-trinket';
import { beginHeroSkillAction, resolveTrinketOpportunity } from './trinkets/battle-trinket-bridge';
import { getBossQuestPool, getQuestPool, getTrinketPoolByLevel, runtimeContentContext } from '../data/content-selector';
import { drawTrinket } from './trinkets/draw-trinket';
import { commitQuestSelection } from './commands/quest';
import { CRITICAL_STONE } from '../data/trinkets/verified-trinkets';
import { migrateCampaignToV18 } from './save';
import { setRandomSource } from './random';

function battleWithCommunityCriticalStone() {
  let campaign = createNewCampaign('community-complete-edition');
  campaign = applyDefaultLoadout(selectParty(campaign, ['crusader', 'highwayman', 'vestal', 'plague-doctor']));
  campaign = acquireTrinket(campaign, {
    trinketId: 'community-trinket-core-critical-stone',
    source: 'debug',
    sourceEventId: 'c1b-critical',
    heroId: campaign.heroes[0].instanceId,
  }).campaign;
  campaign = { ...campaign, currentQuestId: 'c1b-test', dungeon: generateDungeon('c1b-test') };
  const battle = initBattle(campaign, 'A');
  const hero = battle.battle!.heroes.find((unit) => unit.sourceId === campaign.heroes[0].instanceId)!;
  const monster = battle.battle!.monsters[0];
  return {
    campaign: {
      ...battle,
      battle: {
        ...battle.battle!,
        activeActorId: hero.id,
        currentActionPoints: 2,
        status: 'active' as const,
      },
    },
    hero,
    monster,
  };
}

describe('C1B production content gate', () => {
  it('old saves migrate to legacy instead of silently changing pools', () => {
    const legacy = createNewCampaign() as ReturnType<typeof createNewCampaign> & Record<string, unknown>;
    delete legacy.runtimeContentProfile;
    delete legacy.enabledContentSets;
    delete legacy.enabledRegions;
    const migrated = migrateCampaignToV18(legacy);
    expect(migrated.runtimeContentProfile).toBe('legacy-prototype');
    expect(migrated.enabledContentSets).toEqual(['core']);
  });

  it('Community selectors fail closed for quests and expose only both-side validated trinkets', () => {
    const campaign = createNewCampaign('community-complete-edition');
    const context = runtimeContentContext(campaign);
    expect(getQuestPool(context)).toEqual([]);
    expect(getBossQuestPool(context)).toEqual([]);
    expect(getTrinketPoolByLevel(context, 1).map((item) => item.id).sort()).toEqual([
      'community-trinket-core-accuracy-stone',
      'community-trinket-core-critical-stone',
    ]);
    expect(commitQuestSelection(campaign, 'scout-ahead').error).toBe('quest-not-production-eligible');
  });

  it('Community draw is deterministic for one seed and diverse across seeds', () => {
    const context = runtimeContentContext(createNewCampaign('community-complete-edition'));
    const first = drawTrinket({ level: 1, pool: 'official', runtimeContext: context, rng: () => 0 });
    const repeat = drawTrinket({ level: 1, pool: 'official', runtimeContext: context, rng: () => 0 });
    const other = drawTrinket({ level: 1, pool: 'official', runtimeContext: context, rng: () => 0.99 });
    expect(first.definition?.id).toBe(repeat.definition?.id);
    expect(other.definition?.id).not.toBe(first.definition?.id);
  });

  it('Critical Stone opens only after the roll is visible and can turn roll 8 into a crit', () => {
    expect(CRITICAL_STONE.positiveSide.useWindows).toEqual(['after-attack-roll-before-hit-resolution']);
    const setup = battleWithCommunityCriticalStone();
    setRandomSource(() => 0.75); // d10 => 8
    try {
      const begun = beginHeroSkillAction(
        setup.campaign,
        setup.hero.equippedSkillIds![0],
        setup.monster.id,
      );
      expect(begun.paused).toBe(true);
      expect(begun.campaign.battle?.pendingAction?.attackRoll).toBe(8);
      const opportunity = begun.campaign.pendingTrinketUseOpportunities[0];
      expect(opportunity.useWindow).toBe('after-attack-roll-before-hit-resolution');
      const resolved = resolveTrinketOpportunity(begun.campaign, opportunity.id, 'use');
      expect(resolved.resumed).toBe(true);
      expect(resolved.campaign.battle?.battleLog.some((entry) => entry.message.includes('掷 8（暴击）'))).toBe(true);
      expect(resolved.campaign.heroes[0].equippedTrinkets[0].currentSide).toBe('negative');
    } finally {
      setRandomSource(null);
    }
  });
});
