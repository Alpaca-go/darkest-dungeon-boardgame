import { describe, expect, it } from 'vitest';
import { communityAttack } from './capability-test-support';
import { applyCommunityGuardianSpecialSkill, communitySpecialSkillLeaf, markedBonusDamage } from '../../../game-engine/campaign/act-four/community-guardian-special-skills';

describe('Community Guardian special skill production', () => {
  it('Body Slam applies Stun then Pit Toss damage and a mapped pit destination', () => {
    const { result, heroId } = communityAttack('templars-impaler', 6, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('body-slam');
    expect(event.hit).toBe(true);
    expect(event.pitTossRoll).toBeGreaterThanOrEqual(1);
    expect(event.pitTossAreaId).toMatch(/spiked-pit/);
    const hero = result.heroes.find((unit) => unit.id === heroId)!;
    expect(hero.stunned).toBeGreaterThan(0);
    expect(hero.bleed).toBeGreaterThan(0);
  });

  it('Stinger Shot applies Blight and Debuff together', () => {
    const { result, heroId } = communityAttack('templars-warlord', 8, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('stinger-shot');
    const hero = result.heroes.find((unit) => unit.id === heroId)!;
    expect(hero.blight).toBe(3);
    expect(hero.debuffs.some((effect) => effect.type === 'debuff' && effect.durationTurns === 2)).toBe(true);
  });

  it('The Finger marked bonus enters the damage pipeline', () => {
    expect(communitySpecialSkillLeaf('the-finger')).toMatchObject({ markedBonusDamage: 5 });
    const { before, heroId } = communityAttack('cultist-priest', 8, 1);
    const hero = before.heroes.find((unit) => unit.id === heroId)!;
    expect(markedBonusDamage('the-finger', { ...hero, marked: false })).toBe(0);
    expect(markedBonusDamage('the-finger', { ...hero, marked: true })).toBe(5);
    const markedBattle = { ...before, heroes: before.heroes.map((unit) => unit.id === heroId ? { ...unit, marked: true } : unit) };
    const special = applyCommunityGuardianSpecialSkill(markedBattle, markedBattle.monsters.find((unit) => unit.sourceId === 'community-dd-cultist-priest')!, markedBattle.heroes.find((unit) => unit.id === heroId)!, 'the-finger', 'finger-test', true);
    expect(special.markedBonus).toBe(5);
  });

  it('Undulations uses the formal stance transaction', () => {
    const { before } = communityAttack('shuffling-horror', 2, 1);
    const horror = before.monsters.find((unit) => unit.sourceId === 'community-dd-shuffling-horror')!;
    const special = applyCommunityGuardianSpecialSkill(before, horror, before.heroes[0], 'undulations', 'und-test', true);
    expect(special.undulationsBefore).not.toBeNull();
    expect(Object.keys(special.undulationsAfter ?? {}).sort()).toEqual(Object.keys(special.undulationsBefore ?? {}).sort());
    expect(Object.values(special.undulationsAfter ?? {})).toHaveLength(before.heroes.filter((hero) => hero.isAlive).length);
  });
});
