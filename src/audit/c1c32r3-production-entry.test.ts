import { describe, expect, it } from 'vitest';
import type { CampaignState } from '../types';
import { applyDefaultLoadout, createNewCampaign, selectParty } from '../game-engine/campaign';
import { seededRuntimeSources, withRuntimeSources } from '../game-engine/runtime-sources';
import { explicitlyMigrateHeroDodgeToV2 } from '../game-engine/rules/hero-dodge-versioning';
import { explicitlySelectRuinsV4 } from '../game-engine/rules/ruins-v4';
import { explicitlySelectRuinsV5 } from '../game-engine/rules/ruins-v5';
import { RUINS_V6 } from '../types/ruins-executable';
import { createRuinsDrawState, drawOrdinaryRuinsEncounter } from '../game-engine/ruins/encounter-draw';
import { selectProductionRuinsV6, necromancerProductionEntryError, commitNecromancerProductionQuestSelection } from '../game-engine/commands/necromancer-production-entry';
import { applyBossThreatCheckpointInput, enterProductionBossRoom } from '../game-engine/commands/boss-foundation';
import { createSaveSnapshot, restoreSaveSnapshot, validateSaveFile } from '../game-engine/save';
import { createBoneFigureSupply } from '../game-engine/ruins/physical-supply';

function prepared(level: 1 | 2 | 3 = 1): CampaignState {
  return withRuntimeSources(seededRuntimeSources(3233), () => {
    const c = applyDefaultLoadout(selectParty(createNewCampaign('community-complete-edition'),
      ['crusader', 'highwayman', 'vestal', 'hellion']));
    c.gamePhase = 'quest-select';
    Object.assign(c.campaignProgress, { campaignLevel: level, act: level,
      activeBossFamilyId: 'necromancer', activeThreatId: `necromancer-threat-level-${level}`,
      pendingThreatInitialization: false, completedStandardQuestsThisAct: 2, bossQuestRequired: true });
    return explicitlyMigrateHeroDodgeToV2(c, 'entry-test-v2');
  });
}

function roundtrip(campaign: CampaignState): CampaignState {
  const save = JSON.parse(JSON.stringify(createSaveSnapshot(campaign)));
  expect(validateSaveFile(save)).toBeNull();
  const restored = restoreSaveSnapshot(save);
  expect(restored).toEqual(campaign);
  return restored;
}

describe('C1C32R3 production entry slice (not full-path acceptance)', () => {
  it.each(['absent', 'v4', 'v5'] as const)('composes explicit selection from %s, persists, and is idempotent', version => {
    let c = prepared();
    if (version !== 'absent') c = explicitlySelectRuinsV4(c, 'older-v4');
    if (version === 'v5') c = explicitlySelectRuinsV5(c, 'older-v5');
    const original = structuredClone(c);
    const next = selectProductionRuinsV6(c);
    expect(c).toEqual(original);
    expect(next.ruinsRuleSetSelection).toMatchObject({ ruleSetVersion: RUINS_V6, canonical: false });
    expect(selectProductionRuinsV6(roundtrip(next))).toEqual(next);
    expect(selectProductionRuinsV6(next)).toBe(next);
    expect(next.heroDodgeReplayRecords).toEqual(c.heroDodgeReplayRecords);
  });

  it.each(['battle', 'draw', 'checkpoint', 'threat', 'preparation', 'phase'] as const)(
    'rejects %s before mutating or consuming RNG', boundary => {
      const selected = commitNecromancerProductionQuestSelection(selectProductionRuinsV6(prepared())).campaign;
      const c = prepared();
      if (boundary === 'battle') c.battle = { status: 'active' } as NonNullable<CampaignState['battle']>;
      if (boundary === 'draw') c.ruinsDrawState = createRuinsDrawState(1, 33, RUINS_V6);
      if (boundary === 'checkpoint') c.bossEncounterCheckpoint = selected.bossEncounterCheckpoint;
      if (boundary === 'threat') c.activeThreatRuntime = { active: true } as NonNullable<CampaignState['activeThreatRuntime']>;
      if (boundary === 'preparation') c.necromancerPreparationDay = { status: 'PENDING_TIE' } as NonNullable<CampaignState['necromancerPreparationDay']>;
      if (boundary === 'phase') c.gamePhase = 'dungeon-explore';
      const original = structuredClone(c);
      expect(() => selectProductionRuinsV6(c)).toThrow('before Threat/encounter initialization');
      expect(c).toEqual(original);
    });

  it.each(['v4', 'v5'] as const)('rejects forged %s migration provenance instead of laundering it into v6', version => {
    let c = explicitlySelectRuinsV4(prepared(), 'historical-v4');
    if (version === 'v5') c = explicitlySelectRuinsV5(c, 'historical-v5');
    c.ruinsRuleSetSelection!.migrationId = '';
    const before = structuredClone(c);
    expect(() => selectProductionRuinsV6(c)).toThrow();
    expect(c).toEqual(before);
  });

  it.each([
    ['profile', 'complete-edition-profile-required'], ['core', 'core-content-required'],
    ['region', 'ruins-region-required'], ['family', 'necromancer-active-family-required'],
    ['dodge', 'hero-dodge-v2-selection-required'], ['ruins', 'ruins-v6-selection-required'],
  ])('fails closed on missing %s with an actionable error', (field, error) => {
    const c = selectProductionRuinsV6(prepared());
    if (field === 'profile') c.runtimeContentProfile = 'legacy-prototype';
    if (field === 'core') c.enabledContentSets = [];
    if (field === 'region') c.enabledRegions = [];
    if (field === 'family') c.campaignProgress.activeBossFamilyId = null;
    if (field === 'dodge') delete c.heroDodgeRuleSetSelection;
    if (field === 'ruins') delete c.ruinsRuleSetSelection;
    expect(necromancerProductionEntryError(c)).toBe(error);
    const result = commitNecromancerProductionQuestSelection(c);
    expect(result).toMatchObject({ ok: false, error });
    expect(result.campaign).toBe(c);
    expect(c.dungeon).toBeNull();
  });

  it.each([1, 2, 3] as const)('Level %i reserves one identity, reloads, and rejects migration', level => {
    const input = selectProductionRuinsV6(prepared(level));
    const result = withRuntimeSources(seededRuntimeSources(32), () => commitNecromancerProductionQuestSelection(input));
    expect(result.ok, result.error ?? '').toBe(true);
    const c = roundtrip(result.campaign);
    expect(c.bossRoomStorage?.lifecycle).toBe('RESERVED');
    expect(c.bossRoomStorage?.encounterId).toBe(c.bossEncounterCheckpoint?.checkpointContext?.encounterId);
    expect(commitNecromancerProductionQuestSelection(c).campaign).toBe(c);
    // Existing v6 selection is validation/idempotency, not a new migration.
    expect(selectProductionRuinsV6(c)).toBe(c);
    expect(() => selectProductionRuinsV6({ ...c, ruinsRuleSetSelection: undefined })).toThrow();
  });

  it('resumes physical binding after accepted Preparation Day events without reinitializing the encounter', () => {
    let c = commitNecromancerProductionQuestSelection(selectProductionRuinsV6(prepared(2))).campaign;
    const id = c.bossEncounterCheckpoint!.checkpointContext!.encounterId;
    const heroIds = Object.keys(c.bossEncounterCheckpoint!.checkpointContext!.heroDodge);
    c = applyBossThreatCheckpointInput(c, { type: 'PREPARATION_DAY',
      rolls: Object.fromEntries(heroIds.map((heroId, index) => [heroId, index + 1])) });
    const before = structuredClone(c.bossEncounterCheckpoint!);
    c = { ...c, ruinsBoneFigureSupply: createBoneFigureSupply(), ruinsDrawState: createRuinsDrawState(2, 17, RUINS_V6) };
    const entered = roundtrip(enterProductionBossRoom(roundtrip(c), c.bossRoomStorage!.roomId));
    expect(entered.battle!.bossEncounter!.checkpointContext!.encounterId).toBe(id);
    expect(entered.battle!.bossEncounter!.events.slice(0, before.events.length)).toEqual(before.events);
    expect(entered.battle!.bossEncounter!.side).toBe('ABILITY');
    expect(entered.battle!.ruinsContext).toBeUndefined();
    expect(entered.bossEncounterCheckpoint).toBeNull();
    expect(entered.bossRoomStorage!.lifecycle).toBe('IN_PLAY');
  });

  it('rejects Boss Room entry while physical ordinary ownership is unresolved', () => {
    const c = commitNecromancerProductionQuestSelection(selectProductionRuinsV6(prepared())).campaign;
    const stances = { h1: 'aggressive', h2: 'defensive', h3: 'ranged', h4: 'support' } as const;
    const draw = drawOrdinaryRuinsEncounter(createRuinsDrawState(1, 14, RUINS_V6), 'unsettled', stances);
    const input = { ...c, ruinsDrawState: draw };
    const before = structuredClone(input);
    expect(() => enterProductionBossRoom(input, c.bossRoomStorage!.roomId)).toThrow('Settle the ordinary encounter');
    expect(input).toEqual(before);
  });
});
