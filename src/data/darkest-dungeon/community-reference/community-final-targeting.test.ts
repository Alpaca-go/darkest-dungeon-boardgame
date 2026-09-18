/**
 * Phase 11A.4R2A WP-10：Range / Target 语义真正进入 Runtime 的验收。
 *
 * - 拓扑与 Stance→Area 映射从已接受 tileGeometry 派生；
 * - range 过滤 + policy 在合法目标上应用；
 * - 超范围 → skip the rest of its turn（真实 production seam 断言）；
 * - 相同 priority deterministic tie；Hero 数组 reorder 不改变结果。
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { BattleUnit } from '../../../types';
import {
  COMMUNITY_ANCESTOR_ROOM12_AREAS,
  COMMUNITY_ANCESTOR_ROOM12_EDGES,
  COMMUNITY_ANCESTOR_ROOM12_HERO_STANCE_AREAS,
  COMMUNITY_ANCESTOR_ROOM12_MONSTER_STANCE_AREAS,
  communityFinalAreaDistance,
  communityFinalSkillCanReach,
  communityFinalUnitAreaId,
  parseCommunityFinalRange,
  resolveCommunityFinalTargets,
} from './community-final-targeting';
import { COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY } from './community-final-skill-source-inventory';
import { beginCommunityFinalEncounter, scriptedD10 } from './capability-test-support';
import { runCommunityFinalFormTurn } from '../../../game-engine/campaign/act-four/community-final-combat';
import { seededRuntimeSources, setRandomSource, setRuntimeSources } from '../../../game-engine/random';

beforeEach(() => { setRuntimeSources(seededRuntimeSources(1203)); setRandomSource(() => 0.49); });
afterEach(() => setRandomSource(null));

const leaf = (actorId: string, localSkillId: string) =>
  COMMUNITY_FINAL_SKILL_SOURCE_INVENTORY.find((item) => item.actorId === actorId && item.localSkillId === localSkillId)!;

describe('Community Final targeting (WP-10)', () => {
  it('Room 12 topology and stance areas derive from the accepted tileGeometry', () => {
    expect(COMMUNITY_ANCESTOR_ROOM12_AREAS).toHaveLength(11);
    expect(COMMUNITY_ANCESTOR_ROOM12_EDGES.length).toBeGreaterThan(0);
    expect(COMMUNITY_ANCESTOR_ROOM12_MONSTER_STANCE_AREAS).toEqual({
      aggressive: 'r12-C',
      defensive: 'r12-N',
      ranged: 'r12-NW',
      support: 'r12-S',
    });
    expect(COMMUNITY_ANCESTOR_ROOM12_HERO_STANCE_AREAS).toEqual({
      aggressive: 'r12-SE',
      ranged: 'r12-SE',
      defensive: 'r12-SW',
      support: 'r12-NE',
    });
    // 关键距离（BFS on derived edges）：monster aggressive 到所有 hero area = 2；ranged 到 SE = 4。
    expect(communityFinalAreaDistance('r12-C', 'r12-SE')).toBe(2);
    expect(communityFinalAreaDistance('r12-C', 'r12-SW')).toBe(2);
    expect(communityFinalAreaDistance('r12-C', 'r12-NE')).toBe(2);
    expect(communityFinalAreaDistance('r12-NW', 'r12-SE')).toBe(4);
    expect(communityFinalAreaDistance('r12-S', 'r12-SE')).toBe(1);
  });

  it('parses source range strings into brackets (exact / bracket / n-a)', () => {
    expect(parseCommunityFinalRange('n/a')).toBeNull();
    expect(parseCommunityFinalRange('0-10')).toEqual({ min: 0, max: 10 });
    expect(parseCommunityFinalRange('0')).toEqual({ min: 0, max: 0 });
    expect(parseCommunityFinalRange('2')).toEqual({ min: 2, max: 2 });
  });

  it('range reachability includes Speed-based movement (rulebook p24)', () => {
    // Reunion range 1 + Speed 2，从 monster:ranged（r12-NW）：
    // 移动 2 步可到 r12-W（距 r12-SW = 1）与 r12-N（距 r12-NE = 1），但到不了距 r12-SE = 1 的落点。
    expect(communityFinalSkillCanReach('r12-NW', 'r12-SW', { min: 1, max: 1 }, 2)).toBe(true);
    expect(communityFinalSkillCanReach('r12-NW', 'r12-NE', { min: 1, max: 1 }, 2)).toBe(true);
    expect(communityFinalSkillCanReach('r12-NW', 'r12-SE', { min: 1, max: 1 }, 2)).toBe(false);
    // Embrace Futility range 0 + Speed 3：必须落进目标 Area；NW→SE 距离 4 超出移动能力。
    expect(communityFinalSkillCanReach('r12-NW', 'r12-SE', { min: 0, max: 0 }, 3)).toBe(false);
    expect(communityFinalSkillCanReach('r12-NW', 'r12-SW', { min: 0, max: 0 }, 3)).toBe(true);
    // Heart 0-10 恒在射程内。
    expect(communityFinalSkillCanReach('r12-NW', 'r12-SE', { min: 0, max: 10 }, 0)).toBe(true);
  });

  it('out-of-range Reunion skips the rest of the turn through the production seam', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    // Setup：Reflection 置于 monster:ranged（r12-NW），全部 Hero 置于 hero Area r12-SE。
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const })),
        monsters: campaign.battle!.monsters.map((unit) => unit.id === reflection.id ? { ...unit, stance: 'ranged' as const } : unit),
      },
    };
    const heroesBefore = campaign.battle!.heroes.map((unit) => ({ id: unit.id, hp: unit.hp, stress: unit.stress, bleed: unit.bleed }));
    scriptedD10(3); // d10 1-5 → Reunion（range 1，NW→SE 不可达）
    const result = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(result.ok).toBe(true);
    expect(result.skillId).toBe('reunion');
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skippedReason).toBe('out-of-range');
    expect(event.hit).toBe(false);
    expect(event.damage).toBe(0);
    expect(event.attackRoll).toBe(0); // skip 不消耗攻击骰
    expect(event.targetId).toBe('');
    expect(result.campaign.battle!.heroes.map((unit) => ({ id: unit.id, hp: unit.hp, stress: unit.stress, bleed: unit.bleed }))).toEqual(heroesBefore);
  });

  it('in-range Reunion from monster:support hits the closest hero with source damage and effects', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit) => ({ ...unit, stance: 'aggressive' as const })),
        monsters: campaign.battle!.monsters.map((unit) => unit.id === reflection.id ? { ...unit, stance: 'support' as const } : unit),
      },
    };
    const expectedTarget = [...campaign.battle!.heroes].sort((a, b) => a.position - b.position)[0];
    const stressBefore = expectedTarget.stress;
    scriptedD10(3, 11); // Reunion + attack roll 11 = ACC 11 命中（非 crit，threshold 1）
    const result = runCommunityFinalFormTurn(campaign, reflection.id);
    expect(result.ok).toBe(true);
    const event = result.campaign.battle!.communityAttackEvents!.at(-1)!;
    expect(event.skippedReason).toBeUndefined();
    expect(event.hit).toBe(true);
    expect(event.critical).toBe(false);
    expect(event.damage).toBe(5); // Reunion DMG 5（未标记无 +3）
    expect(event.targetId).toBe(expectedTarget.id);
    const target = result.campaign.battle!.heroes.find((unit) => unit.id === expectedTarget.id)!;
    expect(target.hp).toBe(expectedTarget.maxHp - 5);
    expect(target.bleed).toBe(2); // Bleed 2/3
    expect(target.conditionDurations?.bleed).toBe(3);
    expect(target.stress).toBe(stressBefore + 1); // Stress +1（共享管线同步）
  });

  it('range filters legal targets before policy: only in-range heroes are eligible', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    // Reflection 在 NW（range 1 只能到 SW/NE）；heroes：两个在 SE（不可达），一个在 SW（可达）。
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes: campaign.battle!.heroes.map((unit, index) => ({
          ...unit,
          stance: (index === 0 ? 'defensive' : 'aggressive') as 'defensive' | 'aggressive',
        })),
        monsters: campaign.battle!.monsters.map((unit) => unit.id === reflection.id ? { ...unit, stance: 'ranged' as const } : unit),
      },
    };
    const resolution = resolveCommunityFinalTargets(
      campaign.battle!,
      { ...reflection, stance: 'ranged' },
      leaf('perfect-reflection', 'reunion'),
    );
    expect(resolution.skippedOutOfRange).toBe(false);
    expect(resolution.legalTargetIds).toEqual([campaign.battle!.heroes[0].id]);
    expect(resolution.targets.map((unit) => unit.id)).toEqual([campaign.battle!.heroes[0].id]);
  });

  it('deterministic tie on equal priority and Hero array reorder does not change the result', () => {
    let campaign = beginCommunityFinalEncounter(2);
    const reflection = campaign.battle!.monsters.find((unit) => unit.sourceId.includes('perfect-reflection'))!;
    // we-are-the-same：most-stressed；range 2 从 NW 可达 SE。两个 Hero stress 并列最高。
    const heroes: BattleUnit[] = campaign.battle!.heroes.map((unit, index) => ({
      ...unit,
      stance: 'aggressive' as const,
      stress: index === 1 || index === 2 ? 5 : 0,
    }));
    campaign = {
      ...campaign,
      battle: {
        ...campaign.battle!,
        heroes,
        monsters: campaign.battle!.monsters.map((unit) => unit.id === reflection.id ? { ...unit, stance: 'ranged' as const } : unit),
      },
    };
    const actor = { ...reflection, stance: 'ranged' as const };
    const skill = leaf('perfect-reflection', 'we-are-the-same');
    const first = resolveCommunityFinalTargets(campaign.battle!, actor, skill);
    // 相同 stress → position 小者胜（heroes[1] position < heroes[2] position）。
    expect(first.targets).toHaveLength(1);
    expect(first.targets[0].id).toBe(heroes[1].id);
    // Hero 数组 reorder（语义状态不变）→ 结果不变。
    const reordered = {
      ...campaign.battle!,
      heroes: [...campaign.battle!.heroes].reverse(),
    };
    const second = resolveCommunityFinalTargets(reordered, actor, skill);
    expect(second.targets.map((unit) => unit.id)).toEqual(first.targets.map((unit) => unit.id));
    expect(second.legalTargetIds).toEqual(first.legalTargetIds);
  });

  it('hero area mapping follows hero stance (aggressive/ranged share r12-SE)', () => {
    const campaign = beginCommunityFinalEncounter(2);
    const hero = campaign.battle!.heroes[0];
    expect(communityFinalUnitAreaId({ ...hero, stance: 'aggressive' })).toBe('r12-SE');
    expect(communityFinalUnitAreaId({ ...hero, stance: 'ranged' })).toBe('r12-SE');
    expect(communityFinalUnitAreaId({ ...hero, stance: 'defensive' })).toBe('r12-SW');
    expect(communityFinalUnitAreaId({ ...hero, stance: 'support' })).toBe('r12-NE');
  });
});
