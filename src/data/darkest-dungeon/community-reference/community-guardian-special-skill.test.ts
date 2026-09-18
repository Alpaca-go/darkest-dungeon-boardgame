import { describe, expect, it } from 'vitest';
import { attack, communityAttack, deployShufflingSummons, reload, scriptedD10, scenario, summon, targetId } from './capability-test-support';
import {
  applyCommunityGuardianSpecialSkill,
  communitySpecialSkillLeaf,
  markedBonusDamage,
} from '../../../game-engine/campaign/act-four/community-guardian-special-skills';
import { getCommunityHeroRoomArea } from '../../../game-engine/campaign/act-four/community-guardian-room-state';
import { shouldForceCommunityEchoingDisassembly } from '../../../game-engine/campaign/act-four/community-guardian-combat';
import { executeMammothCystAction } from '../../../game-engine/bosses/mammoth-cyst/execute-mammoth-cyst-action';
import { resolveSummonDisplacementChoice, summonWhiteCellStalk } from '../../../game-engine/bosses/mammoth-cyst/summon-white-cell-stalk';
import { createCommunityGuardianScenario } from '../../../testing/scenarios/community-runtime-scenario';
import { runMonsterTurn } from '../../../game-engine/battle';
import { requirement } from './normalized';

describe('Community Guardian special skill production', () => {
  // ---------------------------------------------------------------------------
  // WP-1 Templars
  // ---------------------------------------------------------------------------
  it('Torment deals damage on the production Monster Turn path', () => {
    const { before, result, heroId } = communityAttack('templars-impaler', 1, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('torment');
    expect(event.hit).toBe(true);
    expect(event.damage).toBeGreaterThan(0);
    const beforeHp = before.heroes.find((unit) => unit.id === heroId)!.hp;
    const afterHp = result.heroes.find((unit) => unit.id === heroId)!.hp;
    expect(afterHp).toBeLessThan(beforeHp);
  });

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
  it('Lacerate applies Bleed 3/3 on the production Monster Turn path', () => {
    // Stance 已满时才走 d10；rolls 1–7 → Lacerate。
    const campaign = deployShufflingSummons();
    const before = campaign.battle!;
    const hero = before.heroes.find((unit) => unit.isAlive)!;
    scriptedD10(1, 1);
    const result = runMonsterTurn(before, targetId(campaign, 'shuffling-horror'));
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('lacerate');
    expect(event.hit).toBe(true);
    expect(result.heroes.find((unit) => unit.id === hero.id)!.bleed).toBe(3);
  });

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
    // rolls 8–10 → Undulations；仅当 Stance 已满（Priest+Growth 在场）时才走 d10，
    // 否则 Ability Card 强制 Echoing（asset:450ace:face）。
    const campaign = deployShufflingSummons();
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

  it('Echoing Disassembly is forced when Monster Stance slots are not filled (not a d10 skill)', () => {
    // asset:450ace:face：If not all Stance Slots for Monsters are filled → will use Echoing.
    // asset:ccf3dc:face：d10 仅映射 Skill 1/2；Skill 3 无骰点区间 —— 不得发明映射。
    const table = requirement('tierB-shuffling-horror').fields.d10SkillTable.value as Array<{
      ranges: Array<{ printedSkillNumber: number }>;
    }>;
    const numbers = new Set(table.flatMap((row) => row.ranges.map((range) => range.printedSkillNumber)));
    expect(numbers.has(3)).toBe(false);
    expect(numbers.has(1)).toBe(true);
    expect(numbers.has(2)).toBe(true);

    const campaign = scenario('shuffling-horror');
    const before = campaign.battle!;
    expect(before.monsters.some((unit) => unit.sourceId === 'community-dd-cultist-priest' && unit.isAlive)).toBe(false);
    expect(before.monsters.some((unit) => unit.sourceId === 'community-dd-malignant-growth' && unit.isAlive)).toBe(false);
    const beforeLight = before.light ?? 0;
    const hero = before.heroes.find((unit) => unit.isAlive)!;
    // 强制路径不消耗 skill d10；仅命中骰（Acc 12 → d10 必中）。
    scriptedD10(1);
    const result = runMonsterTurn(before, targetId(campaign, 'shuffling-horror'));
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('echoing-disassembly');
    expect(event.skillRoll).toBe(0);
    expect(event.hit).toBe(true);
    expect(event.summonedRoles).toEqual(['cultist-priest', 'malignant-growth']);
    expect(result.monsters.some((unit) => unit.sourceId === 'community-dd-cultist-priest' && unit.isAlive)).toBe(true);
    expect(result.monsters.some((unit) => unit.sourceId === 'community-dd-malignant-growth' && unit.isAlive)).toBe(true);
    expect(result.heroes.find((unit) => unit.id === hero.id)!.stress - hero.stress).toBe(2);
    expect((result.light ?? 0) - beforeLight).toBe(-1);
  });

  it('Echoing Disassembly is not forced once Priest and Growth are already in play', () => {
    const campaign = deployShufflingSummons();
    const before = campaign.battle!;
    expect(shouldForceCommunityEchoingDisassembly(before, before.monsters.find((unit) => unit.sourceId === 'community-dd-shuffling-horror')!)).toBe(false);
    scriptedD10(9, 1);
    const result = runMonsterTurn(before, targetId(campaign, 'shuffling-horror'));
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('undulations');
    expect(event.skillRoll).toBe(9);
  });

  it('Death Lash applies Debuff 1 and Stress +1 on hit', () => {
    const { before, result, heroId } = communityAttack('cultist-priest', 1, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('death-lash');
    expect(event.hit).toBe(true);
    const beforeHero = before.heroes.find((unit) => unit.id === heroId)!;
    const afterHero = result.heroes.find((unit) => unit.id === heroId)!;
    expect(afterHero.stress - beforeHero.stress).toBe(1);
    expect(afterHero.debuffs.some((effect) => effect.type === 'debuff' && effect.durationTurns === 1)).toBe(true);
  });

  it('Maul the Flesh applies Bleed 2/3 on hit', () => {
    const { result, heroId } = communityAttack('malignant-growth', 1, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('maul-the-flesh');
    expect(event.hit).toBe(true);
    expect(result.heroes.find((unit) => unit.id === heroId)!.bleed).toBe(2);
  });

  it('Daze the Mind applies Stun 2 turns on hit', () => {
    const { result, heroId } = communityAttack('malignant-growth', 6, 1);
    const event = result.communityAttackEvents!.at(-1)!;
    expect(event.skillId).toContain('daze-the-mind');
    expect(event.hit).toBe(true);
    expect(result.heroes.find((unit) => unit.id === heroId)!.stunned).toBeGreaterThan(0);
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

  it('Reconstitute heals Mammoth Cyst by 14 and applies Buff 2 turns', () => {
    const campaign = summon();
    const state = campaign.actFourState.mammothCystEncounterState!;
    const cyst = state.actorStates.find((actor) => actor.owner === 'mammoth-cyst')!;
    const wounded = {
      ...state,
      actorStates: state.actorStates.map((actor) =>
        actor.actorId === cyst.actorId ? { ...actor, hp: Math.max(1, actor.hp - 20) } : actor,
      ),
    };
    const prepared = { ...campaign, actFourState: { ...campaign.actFourState, mammothCystEncounterState: wounded } };
    const card = wounded.initiativeCards.find((item) => item.owner === 'white-cell-stalk')!;
    const result = executeMammothCystAction(prepared, card.id, {
      mode: 'community-reference',
      targetMonsterActorId: cyst.actorId,
      rng: () => (1 - 0.5) / 10, // skill roll 1 → Reconstitute
      now: '2026-09-12T00:00:03.000Z',
    });
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skill?.id).toContain('reconstitute');
    expect(result.skill?.specialEffect).toEqual({ type: 'heal-monster', amount: 14, target: 'ally' });
    const after = result.state!.actorStates.find((actor) => actor.actorId === cyst.actorId)!;
    expect(after.hp).toBe(Math.min(cyst.maxHp, cyst.hp - 20 + 14));
  });

  it('Displace applies Debuff 2 and starts Room 11 Push 2', () => {
    const { before, result, heroId } = attack('white-cell-stalk', 4, 1);
    expect(result.skill?.id).toContain('displace');
    expect(result.ok).toBe(true);
    const battleHero = result.campaign.battle!.heroes.find((unit) => unit.sourceId === heroId)!;
    expect(battleHero.debuffs.some((effect) => effect.type === 'debuff' && effect.durationTurns === 2)).toBe(true);
    // Push：唯一路径自动落定写入 history；多路径挂起 pending；零路径 cut short 仍会登记 :start。
    const beforeArea = before.actFourState.mammothCystEncounterState!.heroPlacements.find((p) => p.heroId === heroId)?.areaId;
    const afterArea = result.state!.heroPlacements.find((p) => p.heroId === heroId)?.areaId;
    const pushStarted = result.state!.processedTransactionIds.some((id) => id.includes('mammoth-cyst-displace:') && id.endsWith(':start'));
    const displaced =
      result.pendingChoice?.kind === 'displace-push'
      || (result.state!.displacementHistory?.some((record) => record.kind === 'displace-push') ?? false)
      || (beforeArea !== undefined && afterArea !== undefined && beforeArea !== afterArea)
      || pushStarted;
    expect(displaced).toBe(true);
  });

  it('Teleport applies Stress +2 then Room 11 d10 relocation', () => {
    const campaign = summon();
    const state = campaign.actFourState.mammothCystEncounterState!;
    const card = state.initiativeCards.find((item) => item.owner === 'white-cell-stalk')!;
    const heroId = campaign.heroes[0].instanceId;
    const beforeArea = state.heroPlacements.find((p) => p.heroId === heroId)?.areaId;
    const rolls = [8, 1, 1]; // skill → Teleport, hit, Room 11 map
    const result = executeMammothCystAction(campaign, card.id, {
      mode: 'community-reference',
      targetHeroId: heroId,
      rng: () => {
        const roll = rolls.shift();
        if (roll === undefined) throw new Error('Teleport used unexpected extra RNG');
        return (roll - 0.5) / 10;
      },
      now: '2026-09-12T00:00:04.000Z',
    });
    expect(result.ok, result.reason ?? '').toBe(true);
    expect(result.skill?.id).toContain('teleport');
    expect(result.stressDealt).toBe(2);
    expect(result.teleportation).not.toBeNull();
    expect(result.teleportation!.targetAreaId).toBeTruthy();
    const afterArea = result.state!.heroPlacements.find((p) => p.heroId === heroId)?.areaId;
    expect(afterArea).toBe(result.teleportation!.targetAreaId);
    expect(result.teleportation!.originalAreaId).toBe(beforeArea);
    expect(rolls).toEqual([]);
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
