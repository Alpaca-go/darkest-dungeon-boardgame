import { describe, expect, it } from 'vitest';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { RUINS_STANCES, RUINS_V4 } from '../types/ruins-executable';
import { resolveRuinsStance, ruinsMonster, ruinsMonsterDefinitions, ruinsRoom, ruinsTile, validateRuinsSourceContracts } from '../game-engine/ruins/source-registry';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter, reserveRuinsSummonCopy, returnOrdinaryRuinsEncounter, validateRuinsDrawState } from '../game-engine/ruins/encounter-draw';
import { explicitlySelectRuinsV4 } from '../game-engine/rules/ruins-v4';
import { explicitlyMigrateHeroDodgeToV2 } from '../game-engine/rules/hero-dodge-versioning';
import { resolveProductionMonsterDefinition } from '../game-engine/bosses/component-adapters/bone-combat-adapter';
import { commitQuestSelection, commitReturnToHamlet } from '../game-engine/commands/quest';
import { applyBossThreatCheckpointInput } from '../game-engine/commands/boss-foundation';
import { finishQuest } from '../game-engine/quest-result';
import { beginNecromancerGraveyardVisit, chooseNecromancerPreparationHero, commitNecromancerGraveyardVisit } from '../game-engine/campaign/necromancer-preparation-day';
import { buildingVisitError, canEndHamletDay, skipHeroAction } from '../game-engine/commands/hamlet-preparation-day';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import type { CampaignState } from '../types';

function reload(c: CampaignState): CampaignState {
  const save = JSON.parse(JSON.stringify(createSaveSnapshot(c)));
  expect(validateSaveFile(save)).toBeNull();
  const resumed = restoreSaveSnapshot(save);
  expect(resumed).toEqual(c);
  return resumed;
}

/** Initial fixture controls only campaign gates; all subsequent phase changes use domain commands. */
function preparation(level: 1 | 2 | 3, tied = false): CampaignState {
  let c = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'), ['crusader', 'highwayman', 'vestal', 'hellion']));
  c.gamePhase = 'quest-select';
  Object.assign(c.campaignProgress, { campaignLevel: level, act: level, activeBossFamilyId: 'necromancer',
    activeThreatId: `necromancer-threat-level-${level}`, pendingThreatInitialization: false,
    completedStandardQuestsThisAct: 2, bossQuestRequired: true });
  c = explicitlyMigrateHeroDodgeToV2(c, 'c1c32r2a-preparation-initial-fixture');
  const selected = commitQuestSelection(c, 'face-the-threat');
  expect(selected.ok).toBe(true);
  c = selected.campaign;
  if (level > 1) c = applyBossThreatCheckpointInput(c, { type: 'PREPARATION_DAY',
    rolls: Object.fromEntries(c.heroes.map((h, i) => [`u_${h.instanceId}`, tied && i < 2 ? 1 : i + 1])) });
  c = reload(c);
  const questRunId = c.dungeon!.questRunId;
  // Cancelled reservation exercises the existing authoritative Room return domain path.
  c = finishQuest(c, 'left');
  expect(c.gamePhase).toBe('quest-result');
  const returned = commitReturnToHamlet(c, { questId: 'face-the-threat', questRunId, questOutcome: 'incomplete' });
  expect(returned.ok).toBe(true);
  expect(returned.campaign.gamePhase).toBe('hamlet');
  return reload(returned.campaign);
}

describe('C1C32R2A source successor and deterministic dependency commands', () => {
  it('validates the 24 identities, 62 copies, explicit Stance tables and Tile references', () => {
    expect(() => validateRuinsSourceContracts()).not.toThrow();
    const definitions = ruinsMonsterDefinitions(RUINS_V4);
    expect([1, 2, 3].map(level => definitions.filter(d => d.drawEligibleFromLevel <= level).reduce((n, d) => n + d.copyCount, 0))).toEqual([42, 53, 62]);
    for (const d of definitions) for (const stance of RUINS_STANCES) expect(resolveRuinsStance(d, stance).kind).toBe('SKILL_TABLE');
    expect(() => ruinsMonster('prototype-monster', RUINS_V4)).toThrow();
    expect(() => ruinsMonster('bone-soldier', 'C1C31-DIGITAL-DEFAULT-v2')).toThrow();
    expect(definitions.every(d => d.status === 'SOURCE_BOUND_TYPED_CANDIDATE' && !d.executable)).toBe(true);
  });
  it.each([['bone-soldier', 1, 0, 0, 1], ['bone-spearman', 2, 1, 1, 2], ['bone-rabble', 1, 0, 0, 1]] as const)
    ('%s changes only the successor source binding', (id, speed, dodge, oldSpeed, oldDodge) => {
      expect(ruinsMonster(id, RUINS_V4)).toMatchObject({ speed, dodge });
      expect(resolveProductionMonsterDefinition(id, 'C1C31-DIGITAL-DEFAULT-v2')).toMatchObject({ speed: oldSpeed, dodge: oldDodge });
    });
  it('includes visually corrected skills and Room 8 party Stress rather than Light', () => {
    expect(ruinsMonster('spitter', RUINS_V4).skills[0].attack).toMatchObject({ damage: 4, critDamage: 6 });
    expect(ruinsMonster('adder', RUINS_V4).skills[0].range).toEqual({ kind: 'EXACT', distance: 2 });
    expect(ruinsRoom(8).rules[1].effects).toEqual([{ type: 'stress', target: 'party', amount: 2 }]);
    expect(ruinsTile('ruins-tile-2').sourceReferences[0].page).toBe(2);
    expect(() => ruinsTile('ruins-tile-10')).toThrow();
    expect(() => ruinsRoom(10)).toThrow();
  });
  it('explicit migration is pre-encounter and preserves absent historical metadata', () => {
    const c = createNewCampaign();
    const migrated = explicitlySelectRuinsV4(c, 'new-encounters');
    expect(c.ruinsRuleSetSelection).toBeUndefined();
    expect(migrated.ruinsRuleSetSelection?.ruleSetVersion).toBe(RUINS_V4);
    expect(explicitlySelectRuinsV4(migrated, 'new-encounters')).toBe(migrated);
    expect(() => explicitlySelectRuinsV4({ ...c, battle: {} as CampaignState['battle'] }, 'blocked')).toThrow('Active encounter');
    expect(() => explicitlySelectRuinsV4({ ...c, bossEncounterCheckpoint: {} as CampaignState['bossEncounterCheckpoint'] }, 'blocked')).toThrow('Active encounter');
  });
  it.each([1, 2, 3] as const)('Level %i draw is atomic, exclusive, deterministic and never redraws after serialization', level => {
    const heroes = { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' } as const;
    for (let seed = 1; seed <= 30; seed++) {
      const original = createRuinsDrawState(level, seed);
      const drawn = drawOrdinaryRuinsEncounter(original, 'encounter-1', heroes);
      expect(drawn).toEqual(drawOrdinaryRuinsEncounter(createRuinsDrawState(level, seed), 'encounter-1', heroes));
      const saved = JSON.parse(JSON.stringify(drawn));
      expect(drawOrdinaryRuinsEncounter(saved, 'encounter-1', heroes)).toBe(saved);
      expect(original.encounters).toHaveLength(0);
      expect(drawn.encounters[0].monsters.reduce((n, m) => n + m.slots, 0)).toBe(4);
      expect(drawn.encounters[0].initiativeCards.every(c => !c.cardId.includes('copy'))).toBe(true);
      expect(() => reserveRuinsSummonCopy(drawn, drawn.encounters[0].monsters[0].copyId, 'summon')).toThrow();
      const returned = returnOrdinaryRuinsEncounter(drawn, 'encounter-1');
      expect(returnOrdinaryRuinsEncounter(returned, 'encounter-1')).toBe(returned);
      expect(returned.monsterDeck).toEqual(expect.arrayContaining(drawn.encounters[0].monsters.map(m => m.copyId)));
      expect(returned.rngCalls - drawn.rngCalls).toBe(returned.monsterDeck.length - 1);
      expect(() => validateRuinsDrawState(returned)).not.toThrow();
    }
  });
  it('rejects corrupted saved duplicate copies and placement/ownership changes', () => {
    const draw = drawOrdinaryRuinsEncounter(createRuinsDrawState(3, 11), 'e', { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' });
    const duplicate = structuredClone(draw);
    duplicate.encounters[0].monsters.push(duplicate.encounters[0].monsters[0]);
    expect(() => validateRuinsDrawState(duplicate)).toThrow();
    const moved = structuredClone(draw);
    moved.encounters[0].heroes[0].areaId = 'room-10';
    expect(() => validateRuinsDrawState(moved)).toThrow();
    const campaign = { ...createNewCampaign(), ruinsDrawState: draw };
    reload(campaign);
    const invalid = createSaveSnapshot({ ...campaign, ruinsDrawState: moved });
    expect(validateSaveFile(invalid)).toContain('placement');
  });
  it('blocks a subsequent draw when the initial Large replacement discard lacks an executable return binding', () => {
    const heroes = { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' } as const;
    const drawn = drawOrdinaryRuinsEncounter(createRuinsDrawState(2, 8), 'first', heroes);
    const replaced = drawn.encounters[0].drawEvents.find(e => e.type === 'LARGE_REPLACEMENT')!;
    expect(replaced).toBeDefined();
    const returned = returnOrdinaryRuinsEncounter(drawn, 'first');
    expect(returned.ownership[replaced.copyId].location).toBe('DISCARD');
    const saved = JSON.parse(JSON.stringify(returned));
    expect(drawOrdinaryRuinsEncounter(saved, 'first', heroes)).toBe(saved);
    expect(() => drawOrdinaryRuinsEncounter(saved, 'second', heroes)).toThrow('SOURCE_UNRESOLVED');
    expect(saved).toEqual(returned);
  });
});

describe('C1C32R2A saved Threat → real Quest return → Preparation Day commands', () => {
  it.each([true, false])('Level II useEffect=%s survives each decision boundary and commits once', useEffect => withRuntimeSources(seededRuntimeSources(3232), () => {
    let c = preparation(2, true);
    const p = c.necromancerPreparationDay!.checkpoint.pendingChoice!;
    expect(c.necromancerPreparationDay?.status).toBe('PENDING_TIE');
    expect(skipHeroAction(c, c.heroes[2].instanceId)).toBe(c);
    c = chooseNecromancerPreparationHero(c, p.choiceId, p.candidateIds[1]);
    c = reload(c);
    const forced = c.heroes[1].instanceId;
    expect(buildingVisitError(c, forced, 'tavern')).toContain('守卫');
    expect(skipHeroAction(c, forced)).toBe(c);
    expect(canEndHamletDay(c)).toBe(false);
    c = reload(beginNecromancerGraveyardVisit(c));
    expect(c.necromancerPreparationDay?.status).toBe('PENDING_LEVEL_II_EFFECT');
    c = reload(commitNecromancerGraveyardVisit(c, useEffect));
    const cursor = c.necromancerPreparationDay!.checkpoint.rngState;
    const repeated = commitNecromancerGraveyardVisit(c, useEffect);
    expect(repeated).toEqual(c);
    expect(repeated.necromancerPreparationDay!.checkpoint.rngState).toBe(cursor);
    expect(c.necromancerGraveyardReceipts).toHaveLength(1);
    expect(c.necromancerGraveyardReceipts![0]).toMatchObject({ heroInstanceId: forced, useEffect,
      lifecycle: useEffect ? 'PENDING_NEXT_QUEST' : 'GUARD_ONLY' });
    expect(c.heroes[1].hasActedToday).toBe(true);
    expect(c.bossRoomStorage?.lifecycle).toBe('RETURNED');
    expect(c.bossEncounterCheckpoint).toBeNull();
  }));
  it('Level III consumes the guard day without a Virtue draw', () => withRuntimeSources(seededRuntimeSources(3233), () => {
    const c = preparation(3);
    const committed = reload(beginNecromancerGraveyardVisit(c));
    expect(committed.necromancerGraveyardReceipts![0]).toMatchObject({ useEffect: false, virtueId: null, lifecycle: 'GUARD_ONLY' });
    expect(() => commitNecromancerGraveyardVisit(committed, true)).toThrow();
  }));
  it('Level I does not create a forced Graveyard transaction', () => withRuntimeSources(seededRuntimeSources(3231), () => {
    expect(preparation(1).necromancerPreparationDay).toBeUndefined();
  }));
  it('rejects a saved Level II choice with changed candidates or rule version', () => withRuntimeSources(seededRuntimeSources(3234), () => {
    const c = beginNecromancerGraveyardVisit(preparation(2));
    const candidateChanged = structuredClone(c);
    candidateChanged.necromancerPreparationDay!.effectChoice!.candidateIds[0] = 'DECLINE_EFFECT' as 'USE_EFFECT';
    expect(validateSaveFile(createSaveSnapshot(candidateChanged))).toContain('choice provenance');
    const versionChanged = structuredClone(c);
    versionChanged.necromancerPreparationDay!.effectChoice!.ruleSetVersion = RUINS_V4;
    expect(validateSaveFile(createSaveSnapshot(versionChanged))).toContain('choice provenance');
  }));
});
