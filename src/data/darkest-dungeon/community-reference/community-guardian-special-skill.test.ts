import { describe, expect, it } from 'vitest';
import { attack, communityAttack, reload, scriptedD10, scenario, targetId } from './capability-test-support';
import {
  applyCommunityGuardianSpecialSkill,
  communitySpecialSkillLeaf,
  markedBonusDamage,
} from '../../../game-engine/campaign/act-four/community-guardian-special-skills';
import { getCommunityHeroRoomArea } from '../../../game-engine/campaign/act-four/community-guardian-room-state';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { resolveSummonDisplacementChoice, summonWhiteCellStalk } from '../../../game-engine/bosses/mammoth-cyst/summon-white-cell-stalk';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { runMonsterTurn } from '../../../game-engine/battle';
import { requirement } from './normalized';

describe('Community Guardian special skill production', () => {
  // ---------------------------------------------------------------------------
  // WP-1 Templars
  // ---------------------------------------------------------------------------
  it('Body Slam moves the Hero into the mapped Pit Area (not event-only)', () => {
    const { result, heroId, campaign } = communityAttack('templars-impaler', 6, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('body-slam');
    expect(event.hit).toBe(true);
    expect(event.pitTossRoll).toBeGreaterThanOrEqual(1);
    expect(event.pitTossAreaId).toMatch(/spiked-pit/);
    expect(event.pitTossIgnored).not.toBe(true);

    const hero = result.heroes.find((unit) => unit.id === heroId)!;
    expect(hero.stunned).toBeGreaterThan(0);
    expect(hero.bleed).toBeGreaterThan(0);

    const placement = getCommunityHeroRoomArea(result, heroId);
    expect(placement?.areaId).toBeTruthy();
    expect(placement?.pitId).toBe(event.pitTossAreaId);
    expect(result.communityRoomState?.heroAreas[heroId]).toEqual(placement);
    const toss = result.communityRoomState?.pitTossEvents.at(-1);
    expect(toss?.heroId).toBe(heroId);
    expect(toss?.pitId).toBe(event.pitTossAreaId);
    expect(toss?.ignored).toBe(false);
    expect(toss?.areaId).toBe(placement!.areaId);

    const restored = reload({ ...campaign, battle: result });
    expect(getCommunityHeroRoomArea(restored.battle!, heroId)).toEqual(placement);
  });

  it('Revelation applies +2 Stress on the production Monster Turn path', () => {
    // Impaler aggressive：rolls 3–4 → Revelation。
    const { before, result, heroId } = communityAttack('templars-impaler', 3, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('revelation');
    expect(event.hit).toBe(true);
    const beforeStress = before.heroes.find((unit) => unit.id === heroId)!.stress;
    const afterStress = result.heroes.find((unit) => unit.id === heroId)!.stress;
    expect(afterStress - beforeStress).toBe(2);
  });

  it('Stinger Shot applies Blight 3/3 and Debuff 2 turns together', () => {
    // Warlord ranged：rolls 5–10 → Stinger Shot。
    const { result, heroId } = communityAttack('templars-warlord', 8, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('stinger-shot');
    const hero = result.heroes.find((unit) => unit.id === heroId)!;
    expect(hero.blight).toBe(3);
    expect(hero.debuffs.some((effect) => effect.type === 'debuff' && effect.durationTurns === 2)).toBe(true);
  });

  it('Stinger Shot miss branch applies neither Blight nor Debuff', () => {
    // 来源 accuracy=11 → d10 生产路径永不 miss；miss 语义由同一生产函数的 hit=false 分支保证。
    const accuracy = (requirement('tierB-templars-warlord').fields.accuracy.value as Record<string, number>)['stinger-shot'];
    expect(accuracy).toBeGreaterThan(10);
    const { before, heroId } = communityAttack('templars-warlord', 8, 1);
    const warlord = before.monsters.find((unit) => unit.sourceId === 'community-dd-templars-warlord')!;
    const hero = before.heroes.find((unit) => unit.id === heroId)!;
    const missed = applyCommunityGuardianSpecialSkill(before, warlord, hero, 'stinger-shot', 'stinger-miss', false);
    const after = missed.state.heroes.find((unit) => unit.id === heroId)!;
    expect(after.blight).toBe(hero.blight);
    expect(after.debuffs).toEqual(hero.debuffs);
  });

  // ---------------------------------------------------------------------------
  // WP-3 Shuffling
  // ---------------------------------------------------------------------------
  it('The Finger marked bonus enters the damage pipeline', () => {
    expect(communitySpecialSkillLeaf('the-finger')).toMatchObject({ markedBonusDamage: 5 });
    const { before, heroId } = communityAttack('cultist-priest', 8, 1);
    const hero = before.heroes.find((unit) => unit.id === heroId)!;
    expect(markedBonusDamage('the-finger', { ...hero, marked: false })).toBe(0);
    expect(markedBonusDamage('the-finger', { ...hero, marked: true })).toBe(5);
    const markedBattle = {
      ...before,
      heroes: before.heroes.map((unit) => (unit.id === heroId ? { ...unit, marked: true } : unit)),
    };
    const special = applyCommunityGuardianSpecialSkill(
      markedBattle,
      markedBattle.monsters.find((unit) => unit.sourceId === 'community-dd-cultist-priest')!,
      markedBattle.heroes.find((unit) => unit.id === heroId)!,
      'the-finger',
      'finger-test',
      true,
    );
    expect(special.markedBonus).toBe(5);
  });

  it('Undulations production Monster Turn redistributes living Heroes onto Stance slots', () => {
    // rolls 8–10 → Undulations；leaf.attack=false → 不掷 attackRoll。
    // 规则书语义：取下全部 Stance Token → 洗混 → 从 Aggressive 到 Support 放回
    // （非「保留原 stance 多重集」；每人落到唯一 Stance）。
    const campaign = scenario('shuffling-horror');
    const before = campaign.battle!;
    const living = before.heroes.filter((hero) => hero.isAlive);
    scriptedD10(9);
    const result = runMonsterTurn(before, targetId(campaign, 'shuffling-horror'));
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('undulations');
    expect(event.attackRoll).toBe(0);
    expect(event.undulationsBefore).not.toBeNull();
    expect(event.undulationsAfter).not.toBeNull();
    const afterLiving = result.heroes.filter((hero) => hero.isAlive);
    expect(afterLiving.map((hero) => hero.id).sort()).toEqual(living.map((hero) => hero.id).sort());
    expect(new Set(afterLiving.map((hero) => hero.stance)).size).toBe(afterLiving.length);
  });

  it('Echoing Disassembly is absent from the Shuffling Horror d10 table (SOURCE GAP)', () => {
    // 规范化来源把 Echoing 标为 printedNumber=3，但 d10SkillTable 只映射 1/2。
    // 在补齐来源映射之前，生产 Monster Turn 无法选中该技能 —— 见会话暂停说明。
    const table = requirement('tierB-shuffling-horror').fields.d10SkillTable.value as Array<{
      ranges: Array<{ printedSkillNumber: number }>;
    }>;
    const numbers = new Set(table.flatMap((row) => row.ranges.map((range) => range.printedSkillNumber)));
    expect(numbers.has(3)).toBe(false);
    expect(numbers.has(1)).toBe(true);
    expect(numbers.has(2)).toBe(true);
  });

  // ---------------------------------------------------------------------------
  // WP-2 Mammoth / Stalk（campaign executeMammothCystAction 生产路径）
  // ---------------------------------------------------------------------------
  it('Bulging Gaze applies Debuff 1 and Stress +1 on hit', () => {
    const { result, heroId } = attack('mammoth-cyst', 1, 1);
    expect(result.skill?.id).toContain('bulging-gaze');
    expect(result.ok).toBe(true);
    expect(result.stressDealt).toBe(1);
    const battleHero = result.campaign.battle!.heroes.find((unit) => unit.sourceId === heroId)!;
    expect(battleHero.debuffs.some((effect) => effect.type === 'debuff' && effect.durationTurns === 1)).toBe(true);
  });

  it('Digestion applies Blight 3 on the battle Hero via the formal condition pipeline', () => {
    const { result, heroId } = attack('mammoth-cyst', 6, 1);
    expect(result.skill?.id).toContain('digestion');
    const battleHero = result.campaign.battle!.heroes.find((unit) => unit.sourceId === heroId)!;
    expect(battleHero.blight).toBeGreaterThanOrEqual(3);
  });

  it('Revivify heals self by 15 and never exceeds max HP', () => {
    const original = createCommunityGuardianScenario(2);
    const state = original.actFourState.mammothCystEncounterState!;
    const first = state.initiativeCards.find((card) => card.owner === 'mammoth-cyst')!;
    const summoned = summonWhiteCellStalk(original, { mode: 'community-reference', sourceActionEventId: first.id, rng: () => 0 });
    const s = summoned.state!;
    const cyst = s.actorStates.find((actor) => actor.owner === 'mammoth-cyst')!;
    const wounded = {
      ...s,
      actorStates: s.actorStates.map((actor) =>
        actor.actorId === cyst.actorId ? { ...actor, hp: Math.max(1, actor.hp - 20) } : actor,
      ),
    };
    const campaign = { ...summoned.campaign, actFourState: { ...summoned.campaign.actFourState, mammothCystEncounterState: wounded } };
    const card = wounded.initiativeCards.find((item) => item.owner === 'mammoth-cyst' && item.id !== first.id)!;
    const result = executeMammothCystAction(campaign, card.id, { mode: 'community-reference', rng: () => 0.99 });
    expect(result.ok).toBe(true);
    expect(result.skill?.specialEffect).toEqual({ type: 'heal-monster', amount: 15, target: 'self' });
    const after = result.state!.actorStates.find((actor) => actor.actorId === cyst.actorId)!;
    expect(after.hp).toBeLessThanOrEqual(after.maxHp);
    expect(after.hp).toBe(cyst.hp - 5);
  });

  it('WP-7 no-space choice resolution completes the summon atomically', () => {
    const campaign = createCommunityGuardianScenario(2);
    const state = campaign.actFourState.mammothCystEncounterState!;
    const card = state.initiativeCards.find((item) => item.owner === 'mammoth-cyst')!;
    const area = state.snapshot.room.stanceAreaMap.ranged!;
    const filled = {
      ...state,
      heroPlacements: campaign.heroes.map((hero) => ({ heroId: hero.instanceId, areaId: area })),
    };
    const checkpoint = { ...campaign, actFourState: { ...campaign.actFourState, mammothCystEncounterState: filled } };
    const pending = summonWhiteCellStalk(checkpoint, {
      mode: 'community-reference',
      sourceActionEventId: card.id,
      rng: () => 0,
      now: '2026-09-12T00:00:00.000Z',
    });
    expect(pending.pendingChoice).not.toBeNull();
    const choice = pending.pendingChoice!;
    const resolved = resolveSummonDisplacementChoice(pending.campaign, {
      heroId: choice.heroCandidateIds[0],
      areaId: choice.destinationAreaIds[0],
      mode: 'community-reference',
      rng: () => 0,
      now: '2026-09-12T00:00:01.000Z',
    });
    expect(resolved.ok, resolved.reason ?? '').toBe(true);
    expect(resolved.record).not.toBeNull();
    expect(resolved.state!.pendingDisplacementChoice).toBeNull();
    expect(resolved.state!.heroPlacements.find((p) => p.heroId === choice.heroCandidateIds[0])!.areaId).toBe(
      choice.destinationAreaIds[0],
    );
    expect(resolved.state!.actorStates.some((a) => a.owner === 'white-cell-stalk' && a.isAlive)).toBe(true);
  });
});
