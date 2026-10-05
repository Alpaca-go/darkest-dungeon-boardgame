import { describe, expect, it } from 'vitest';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter, reserveRuinsSummonCopy,
  returnOrdinaryRuinsEncounter, validateRuinsDrawState } from '../game-engine/ruins/encounter-draw';
import { RUINS_V4, RUINS_V5 } from '../types/ruins-executable';
import { createNewCampaign } from '../game-engine/campaign';
import { explicitlySelectRuinsV4 } from '../game-engine/rules/ruins-v4';
import { explicitlySelectRuinsV5, validateRuinsV5Selection } from '../game-engine/rules/ruins-v5';
import { resolveRuinsMonsterSkill, ruinsAreaDistance, selectRuinsMonsterTargets } from '../game-engine/ruins/monster-runtime';
import { ruinsMonsterDefinitions, ruinsTile } from '../game-engine/ruins/source-registry';
import { RUINS_STANCES } from '../types/ruins-executable';
import type { BattleState, BattleUnit } from '../types';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';

const heroStances = { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' } as const;

describe('C1C32R2B versioned ownership', () => {
  it('requires explicit v4-to-v5 migration before a draw and rejects in-flight state', () => {
    const original = createNewCampaign();
    const v4 = { ...explicitlySelectRuinsV4(original, 'initial-v4'), gamePhase: 'quest-select' as const };
    const v5 = explicitlySelectRuinsV5(v4, 'explicit-v5');
    expect(v5.ruinsRuleSetSelection).toMatchObject({ ruleSetVersion: RUINS_V5, previousVersion: RUINS_V4,
      canonical: false });
    expect(() => validateRuinsV5Selection(v5)).not.toThrow();
    expect(original.ruinsRuleSetSelection).toBeUndefined();
    expect(() => explicitlySelectRuinsV5(original, 'skip-v4')).toThrow('before ordinary encounter');
    expect(() => explicitlySelectRuinsV5({ ...v4, ruinsDrawState: createRuinsDrawState(1, 1) }, 'late')).toThrow('before ordinary encounter');
    expect(() => explicitlySelectRuinsV5({ ...v4, battle: {} as typeof v4.battle }, 'late')).toThrow('before ordinary encounter');
    const campaign = { ...v5, ruinsDrawState: drawOrdinaryRuinsEncounter(createRuinsDrawState(2, 8, RUINS_V5), 'room-a', heroStances) };
    const saved = JSON.parse(JSON.stringify(createSaveSnapshot(campaign)));
    expect(validateSaveFile(saved)).toBeNull();
    expect(restoreSaveSnapshot(saved).ruinsDrawState).toEqual(campaign.ruinsDrawState);
    const forged = JSON.parse(JSON.stringify(saved));
    forged.campaign.ruinsRuleSetSelection.canonical = true;
    expect(validateSaveFile(forged)).toContain('Project Ruling');
    const forgedDraw = JSON.parse(JSON.stringify(saved));
    forgedDraw.campaign.ruinsDrawState.largeReplacementRulingId = 'UNVERSIONED';
    expect(validateSaveFile(forgedDraw)).toContain('ruling provenance');
  });
  it('returns the pre-Battle Large replacement discard with Battle cards under v5, preserving v4 behavior', () => {
    const v5 = drawOrdinaryRuinsEncounter(createRuinsDrawState(2, 8, RUINS_V5), 'room-a', heroStances);
    const replaced = v5.encounters[0].drawEvents.find(event => event.type === 'LARGE_REPLACEMENT')!.copyId;
    expect(v5.ownership[replaced].location).toBe('DISCARD');
    const reloaded = JSON.parse(JSON.stringify(v5));
    expect(drawOrdinaryRuinsEncounter(reloaded, 'room-a', heroStances)).toEqual(reloaded);
    const settled = returnOrdinaryRuinsEncounter(reloaded, 'room-a');
    expect(settled.ownership[replaced].location).toBe('DECK');
    expect(settled.monsterDeck).toContain(replaced);
    expect(returnOrdinaryRuinsEncounter(settled, 'room-a')).toEqual(settled);
    expect(() => drawOrdinaryRuinsEncounter(settled, 'room-b', heroStances)).not.toThrow();
    const v4 = drawOrdinaryRuinsEncounter(createRuinsDrawState(2, 8, RUINS_V4), 'room-a', heroStances);
    const historic = returnOrdinaryRuinsEncounter(v4, 'room-a');
    expect(historic.ownership[replaced].location).toBe('DISCARD');
    expect(() => drawOrdinaryRuinsEncounter(historic, 'room-b', heroStances)).toThrow('SOURCE_UNRESOLVED');
  });

  it('rejects duplicate summon ownership and tampered return state', () => {
    const deck = createRuinsDrawState(3, 9, RUINS_V5);
    const copyId = deck.monsterDeck[0];
    const reserved = reserveRuinsSummonCopy(deck, copyId, 'threat-a');
    expect(() => reserveRuinsSummonCopy(reserved, copyId, 'threat-b')).toThrow('unavailable');
    const invalid = structuredClone(reserved);
    invalid.monsterDeck.push(copyId);
    expect(() => validateRuinsDrawState(invalid)).toThrow('Deck ownership');
    const drawn = drawOrdinaryRuinsEncounter(deck, 'room-a', heroStances);
    const replaced = drawn.encounters[0].drawEvents.find(e => e.type === 'LARGE_REPLACEMENT')!.copyId;
    const tampered = structuredClone(drawn);
    tampered.ownership[replaced] = { location: 'DECK' };
    tampered.monsterDeck.push(replaced);
    expect(() => validateRuinsDrawState(tampered)).toThrow('replacement discard ownership');
  });
});

describe('typed Monster intent, still gated from production combat', () => {
  it('resolves every d10 row of all 24 identities directly from source Stance tables', () => {
    const definitions = ruinsMonsterDefinitions(RUINS_V5);
    expect(definitions).toHaveLength(24);
    for (const definition of definitions) for (const stance of RUINS_STANCES) for (let d10 = 1; d10 <= 10; d10++) {
      const skill = resolveRuinsMonsterSkill(definition, stance, d10);
      expect(skill === null || definition.skills.some(candidate => candidate.number === skill.number)).toBe(true);
    }
    expect(() => resolveRuinsMonsterSkill(definitions[0], 'aggressive', 0)).toThrow();
  });

  it('uses printed Area distance, Guard, Mark and Stance tie priority', () => {
    const tile = ruinsTile('ruins-tile-1');
    const unit = (id: string, stance: BattleUnit['stance'], hp: number, stress: number, side: BattleUnit['side']) =>
      ({ id, stance, hp, maxHp: 10, stress, side, isAlive: true, marked: false }) as BattleUnit;
    const heroes = [unit('h1', 'aggressive', 5, 3, 'hero'), unit('h2', 'defensive', 5, 3, 'hero'),
      unit('h3', 'ranged', 9, 2, 'hero'), unit('h4', 'support', 10, 0, 'hero')];
    const monster = unit('m1', 'aggressive', 10, 0, 'monster');
    const placements = { m1: 'ruins-tile-1:SE', h1: 'ruins-tile-1:SW', h2: 'ruins-tile-1:NE',
      h3: 'ruins-tile-1:SW', h4: 'ruins-tile-1:NE' };
    const battle = { heroes, monsters: [monster] } as BattleState;
    const context = { battle, tile, placements, guardStacks: {} as Record<string, number> };
    const skill = ruinsMonsterDefinitions(RUINS_V5).flatMap(d => d.skills).find(s => s.targeting.priority === 'Most Wounded')!;
    expect(selectRuinsMonsterTargets(context, 'm1', skill)).toEqual(['h1']);
    expect(ruinsAreaDistance(tile, placements.m1, placements.h2)).toBeGreaterThan(0);
    context.guardStacks.h4 = 1;
    expect(selectRuinsMonsterTargets(context, 'm1', skill)).toEqual(['h4']);
    context.guardStacks.h4 = 0;
    heroes[2].marked = true;
    expect(selectRuinsMonsterTargets(context, 'm1', { ...skill, targeting: { ...skill.targeting, markedFirst: true } })).toEqual(['h3']);
  });
});
