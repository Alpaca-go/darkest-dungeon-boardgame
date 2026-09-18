import { describe, expect, it } from 'vitest';
import type { BattleState, BattleUnit } from '../../../types';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import {
  compareCommunityTargetPriority,
  legalCommunityHeroTargets,
  resolveCommunityMonsterTarget,
} from '../../../game-engine/campaign/act-four/community-monster-targeting';
import { communityGuardianMonsterSkills } from '../../../game-engine/campaign/act-four/community-guardian-combat';
import { communitySpecialSkillLeaf } from '../../../game-engine/campaign/act-four/community-guardian-special-skills';

function withHeroOrder(state: BattleState, order: string[]): BattleState {
  const byId = Object.fromEntries(state.heroes.map((hero) => [hero.id, hero]));
  return { ...state, heroes: order.map((id) => byId[id]) };
}

describe('Community Monster targeting adversarial (WP-10)', () => {
  it('hero array order does not change Stance-priority target', () => {
    const battle = createCommunityGuardianScenario(1).battle!;
    const monster = battle.monsters.find((unit) => unit.sourceId === 'community-dd-templars-impaler')!;
    const skill = communityGuardianMonsterSkills().find((entry) => entry.id.endsWith('torment') && entry.monsterId === monster.sourceId)!;
    const living = battle.heroes.filter((hero) => hero.isAlive);
    expect(living.length).toBeGreaterThan(1);

    // Force distinct stances so Stance priority is decisive.
    const ranked: BattleUnit[] = living.map((hero, index) => ({
      ...hero,
      stance: (['support', 'defensive', 'ranged', 'aggressive'] as const)[index % 4],
      position: index + 1,
    }));
    const base: BattleState = { ...battle, heroes: ranked };
    const reversed = withHeroOrder(base, [...ranked.map((hero) => hero.id)].reverse());
    const shuffled = withHeroOrder(base, [ranked[2]?.id, ranked[0]?.id, ranked[3]?.id, ranked[1]?.id].filter(Boolean) as string[]);

    const a = resolveCommunityMonsterTarget(base, monster, 'torment', skill)!;
    const b = resolveCommunityMonsterTarget(reversed, monster, 'torment', skill)!;
    const c = resolveCommunityMonsterTarget(shuffled, monster, 'torment', skill)!;
    expect(a.unit.id).toBe(b.unit.id);
    expect(a.unit.id).toBe(c.unit.id);
    expect(a.unit.stance).toBe('aggressive');
  });

  it('illegal validTargetPositions never enter the candidate set', () => {
    const battle = createCommunityGuardianScenario(1).battle!;
    const monster = battle.monsters.find((unit) => unit.sourceId === 'community-dd-templars-warlord')!;
    const skill = {
      ...communityGuardianMonsterSkills().find((entry) => entry.id.endsWith('stinger-shot'))!,
      validTargetPositions: [1],
    };
    const heroes = battle.heroes.map((hero, index) => ({ ...hero, position: (index + 2) as 1 | 2 | 3 | 4, isAlive: true }));
    const state: BattleState = { ...battle, heroes };
    expect(legalCommunityHeroTargets(state, skill)).toEqual([]);
    expect(resolveCommunityMonsterTarget(state, monster, 'stinger-shot', skill)).toBeNull();
  });

  it('Reconstitute refuses when the designated Mammoth Cyst is dead', () => {
    const battle = createCommunityGuardianScenario(2).battle!;
    const stalk = {
      ...battle.monsters[0],
      id: 'stalk-test',
      sourceId: 'community-dd-white-cell-stalk',
      isAlive: true,
    };
    const deadCyst = battle.monsters.map((unit) =>
      unit.sourceId === 'community-dd-mammoth-cyst' ? { ...unit, isAlive: false, hp: 0 } : unit,
    );
    const state: BattleState = { ...battle, monsters: [...deadCyst, stalk] };
    expect(communitySpecialSkillLeaf('reconstitute')).toMatchObject({ allySourceId: 'community-dd-mammoth-cyst' });
    expect(resolveCommunityMonsterTarget(state, stalk, 'reconstitute')).toBeNull();
  });

  it('compareCommunityTargetPriority is independent of array index', () => {
    const a = { id: 'a', stance: 'ranged', position: 2 } as BattleUnit;
    const b = { id: 'b', stance: 'aggressive', position: 4 } as BattleUnit;
    expect(compareCommunityTargetPriority(a, b)).toBeGreaterThan(0);
    expect(compareCommunityTargetPriority(b, a)).toBeLessThan(0);
  });
});
