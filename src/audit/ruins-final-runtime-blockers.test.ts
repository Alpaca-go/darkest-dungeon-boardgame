import { writeFileSync, mkdirSync } from 'node:fs';
import { describe, it, expect } from 'vitest';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter, returnOrdinaryRuinsEncounter } from '../game-engine/ruins/encounter-draw';
import { ruinsMonsterDefinitions, ruinsRoom } from '../game-engine/ruins/source-registry';
import { RUINS_STANCES, RUINS_V5, RUINS_V6 } from '../types/ruins-executable';
import { shuffleAtomicStanceBlocks } from '../game-engine/ruins/stance-shuffle';
import { drawnRuinsFixture, fixtureArea } from '../game-engine/ruins/executor-test-fixture';
import { sourceTrinketDeck, drawSourceBoundTrinketCard, assertSourceTrinketEffectAvailable } from '../game-engine/trinkets/source-deck';
import { interactOrdinaryRuinsRoom } from '../game-engine/ruins/room-runtime';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { explicitlySelectRuinsV6 } from '../game-engine/rules/ruins-v6';
import { beginOrdinaryRuinsBattle } from '../game-engine/ruins/battle-runtime';
import { SeededRandom } from '../game-engine/runtime-sources';
import { acquireTrinket } from '../game-engine/trinkets/acquire-trinket';
import { applyRuinsPrintedEffects, recordRuinsEvent } from '../game-engine/ruins/printed-effect-runtime';

const stances = { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' } as const;
const reload = <T,>(value: T): T => JSON.parse(JSON.stringify(value));

describe('C1C32R2C-R final runtime blockers', () => {
  it('seed 147 resolves L N L, retains discard until battle end, and replays identically', () => {
    const original = createRuinsDrawState(3, 147, RUINS_V6);
    const draw = drawOrdinaryRuinsEncounter(original, 'mixed', stances);
    expect(draw).toEqual(drawOrdinaryRuinsEncounter(reload(original), 'mixed', stances));
    expect(draw.encounters[0].monsters.map(m => m.slots)).toEqual([2, 2]);
    const discard = draw.encounters[0].drawEvents.find(e => e.type === 'LARGE_REPLACEMENT')!.copyId;
    expect(draw.ownership[discard].location).toBe('DISCARD');
    const ended = returnOrdinaryRuinsEncounter(reload(draw), 'mixed');
    expect(ended.ownership[discard].location).toBe('DECK');
    expect(returnOrdinaryRuinsEncounter(ended, 'mixed')).toBe(ended);
    expect(() => drawOrdinaryRuinsEncounter(createRuinsDrawState(3, 147, RUINS_V5), 'mixed', stances)).toThrow('could not bind');
  });

  it.each([1, 2, 3] as const)('Level %i scans 4096 seeds without any skipped layouts', level => {
    const definitions = ruinsMonsterDefinitions(RUINS_V6);
    const patterns = new Set<string>();
    for (let seed = 1; seed <= 4096; seed++) {
      const original = createRuinsDrawState(level, seed, RUINS_V6);
      const draw = drawOrdinaryRuinsEncounter(original, 'scan', stances);
      const encounter = draw.encounters[0];
      patterns.add(encounter.drawEvents.filter(e => e.type === 'DRAW').map(e =>
        definitions.find(d => d.physicalCopyIds.includes(e.copyId))!.stanceSlots === 2 ? 'L' : 'N').join(''));
      expect(encounter.monsters.reduce((sum, m) => sum + m.slots, 0)).toBe(4);
      expect(new Set(encounter.monsters.flatMap(m => Array.from({ length: m.slots }, (_, i) => RUINS_STANCES.indexOf(m.stance) + i))).size).toBe(4);
    }
    for (const pattern of ['NNNN', 'NNL', 'NLN', 'LNN']) expect(patterns.has(pattern), pattern).toBe(true);
    const largeCopies = definitions.filter(d => d.drawEligibleFromLevel <= level && d.size === 'LARGE').flatMap(d => d.physicalCopyIds).length;
    expect(patterns.has('LL')).toBe(largeCopies >= 2);
    mkdirSync('tmp/c1c32r2c-r', { recursive: true });
    writeFileSync(`tmp/c1c32r2c-r/seed-scan-level-${level}.json`, JSON.stringify({ level, seeds: 4096, patterns: [...patterns].sort(), largeCopies, skippedSeeds: [], occupiedSlots: 4 }, null, 2));
    if (level === 3) for (const pattern of ['LNL', 'NLL']) expect(patterns.has(pattern)).toBe(true);
  }, 120000);

  it('exhausts every full four-slot atomic layout, actor, direction and distance with mirror symmetry', () => {
    for (const widths of [[1,1,1,1], [2,1,1], [1,2,1], [1,1,2], [2,2]]) {
      let start = 0;
      const cards = widths.map((width, i) => { const card = { id: `c${i}`, start, width }; start += width; return card; });
      for (const actor of cards) for (const direction of ['push','pull'] as const) for (const distance of [0,1,2,3,4]) {
        const result = shuffleAtomicStanceBlocks(cards, actor.id, direction, distance);
        expect(result).toEqual(shuffleAtomicStanceBlocks(reload([...cards].reverse()), actor.id, direction, distance));
        const mirror = cards.map(c => ({ ...c, start: 4 - c.start - c.width }));
        const reflected = shuffleAtomicStanceBlocks(mirror, actor.id, direction === 'push' ? 'pull' : 'push', distance);
        const slots = cards.flatMap(c => Array.from({ length: c.width }, (_, i) => result[c.id] + i)).sort();
        expect(slots).toEqual([0,1,2,3]);
        for (const card of cards) expect(reflected[card.id]).toBe(4 - result[card.id] - card.width);
        const after = cards.map(c => ({ ...c, start: result[c.id] }));
        expect(shuffleAtomicStanceBlocks(reload(after), actor.id, 'pull', 2)).toEqual(shuffleAtomicStanceBlocks(after, actor.id, 'pull', 2));
      }
    }
  });

  it('v6 real self Pull survives save before/after resolution and retains its permutation', () => {
    const campaign = drawnRuinsFixture(e => e.monsters.some(m => m.definitionId === 'bone-captain' && m.stance === 'aggressive')
      && e.monsters.some(m => m.definitionId === 'bone-rabble' && m.stance === 'ranged'), 3, RUINS_V6);
    const actor = campaign.battle.monsters.find(m => m.sourceId === 'bone-rabble')!;
    const parent = recordRuinsEvent(campaign.battle.ruinsContext!, 'SHUFFLE_PROOF', actor.id, [actor.id], null, {});
    const saved = createSaveSnapshot(campaign);
    expect(validateSaveFile(reload(saved))).toBeNull();
    const before = restoreSaveSnapshot(reload(saved));
    const effects = [{ type: 'shuffle', target: 'self', direction: 'pull', distance: 1 }] as const;
    const battle = applyRuinsPrintedEffects(before.battle!, actor.id, actor.id, [...effects], parent);
    const direct = applyRuinsPrintedEffects(campaign.battle, actor.id, actor.id, [...effects], parent);
    expect(battle).toEqual(direct);
    expect(battle.monsters.find(m => m.id === actor.id)!.position).toBe(1);
    const after = createSaveSnapshot({ ...before, battle });
    expect(validateSaveFile(reload(after))).toBeNull();
    expect(restoreSaveSnapshot(reload(after)).battle).toEqual(battle);
    expect(() => explicitlySelectRuinsV6({ ...campaign, ruinsRuleSetSelection: { ...campaign.ruinsRuleSetSelection!, ruleSetVersion: RUINS_V5 } } as typeof campaign, 'bad')).toThrow();
  });

  it('v6 production entry binds the drawn battle', () => {
    const campaign = drawnRuinsFixture(() => true, 3, RUINS_V6);
    const entered = beginOrdinaryRuinsBattle({ ...campaign, battle: null, gamePhase: 'dungeon-explore' }, campaign.battle.ruinsContext!.encounterId);
    expect(entered.gamePhase).toBe('battle');
    expect(validateSaveFile(reload(createSaveSnapshot(entered)))).toBeNull();
  });

  it('37 physical identities preserve the 15 Ready / 22 pending split', () => {
    const deck = sourceTrinketDeck();
    expect(deck).toHaveLength(37);
    expect(deck.filter(c => c.runtimeEffectReady)).toHaveLength(15);
    expect(deck.filter(c => !c.runtimeEffectReady)).toHaveLength(22);
  });
  it.each([1,2,3] as const)('Level %i samples every physical source identity', level => {
    const cards = sourceTrinketDeck().filter(c => c.level === level);
    expect(cards).toHaveLength([14,11,12][level - 1]);
    expect(cards.map((_, i) => drawSourceBoundTrinketCard(level, () => (i + 0.5) / cards.length).id)).toEqual(cards.map(c => c.id));
  });

  it.each([true,false])('Room 6 runtimeEffectReady=%s owns actual loot and reload never redraws', ready => {
    let campaign = drawnRuinsFixture(e => e.roomNumber === 6, 3, RUINS_V6);
    campaign = { ...campaign, campaignProgress: { ...campaign.campaignProgress, campaignLevel: 3 } };
    const rule = ruinsRoom(6).rules.find(r => r.effects.some(e => e.type === 'drawTrinket'))!;
    const hero = campaign.battle.heroes[0];
    fixtureArea(campaign.battle, hero.id, rule.areas[0]);
    campaign.battle.activeActorId = hero.id;
    campaign.battle.initiativeIndex = campaign.battle.initiativeOrder.indexOf(hero.id);
    campaign.battle.currentActionPoints = 2;
    campaign.battle.monsters.forEach(m => { m.hp = 0; m.isAlive = false; });
    const cards = sourceTrinketDeck().filter(c => c.level === 3);
    let expected = cards[0];
    for (let seed = 1; seed < 10000; seed++) {
      const rng = new SeededRandom(seed), cursor = rng.snapshot();
      expected = drawSourceBoundTrinketCard(3, () => rng.next());
      if (expected.runtimeEffectReady === ready) { campaign.battle.ruinsContext!.rngCursor = cursor; break; }
    }
    const before = restoreSaveSnapshot(reload(createSaveSnapshot(campaign)));
    const result = interactOrdinaryRuinsRoom(before, hero.id, rule.id);
    const receipt = result.battle!.ruinsContext!.events.find(e => e.type === 'SOURCE_TRINKET_DRAW')!;
    expect(receipt.detail.sourceTrinketId).toBe(expected.id);
    expect(result.battle!.ruinsContext!.rngCalls).toBe(before.battle!.ruinsContext!.rngCalls + 1);
    expect(result.battle!.currentActionPoints).toBe(2 - rule.actionCost);
    if (ready) expect(result.trinketAcquisitionRecords.at(-1)?.trinketId).toBe(expected.id);
    else {
      expect(result.pendingSourceTrinketRewards).toHaveLength(1);
      expect(result.pendingSourceTrinketRewards![0].sourceTrinketId).toBe(expected.id);
      expect(() => assertSourceTrinketEffectAvailable(result, expected.id)).toThrow('TRINKET_EFFECT_RUNTIME_UNAVAILABLE');
      expect(() => acquireTrinket(result, { trinketId: expected.id, source: 'loot', sourceEventId: 'unsupported' })).toThrow('TRINKET_EFFECT_RUNTIME_UNAVAILABLE');
    }
    const save = reload(createSaveSnapshot(result));
    expect(validateSaveFile(save)).toBeNull();
    const restored = restoreSaveSnapshot(save), bytes = JSON.stringify(restored);
    expect(restored.pendingSourceTrinketRewards).toEqual(result.pendingSourceTrinketRewards);
    expect(() => interactOrdinaryRuinsRoom(restored, hero.id, rule.id)).toThrow('requirements unmet');
    expect(JSON.stringify(restored)).toBe(bytes);
  });
});
